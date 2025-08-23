/**
 * 🏰 Guild Sync Service - Core orchestrator
 */

const cron = require('node-cron');
const PrismaService = require('./PrismaService');
const ExternalApiService = require('./ExternalApiService');
const WebApiService = require('./WebApiService');
const Logger = require('../utils/Logger');

class GuildSyncService {
  constructor(config) {
    this.config = config;
    this.isRunning = false;
    this.isSyncing = false;
    this.syncProgress = { current: 0, total: 0, errors: 0 };
    this.stats = {
      totalSynced: 0,
      totalErrors: 0,
      startTime: new Date(),
      lastFullSync: null,
      lastSyncDuration: null
    };

    // Initialize services
    this.db = new PrismaService();
    this.externalApi = new ExternalApiService(config, Logger);
    this.webApi = new WebApiService(config, Logger);

    // Cron job for 30-minute full sync
    this.fullSyncJob = null;
  }

  async start() {
    try {
      Logger.info('🔧 Initializing Guild Sync Service...');

      // Initialize database
      await this.db.initialize();
      Logger.info('✅ Database initialized');

      // Clean up any duplicates from previous runs
      await this.db.cleanupDuplicates();
      Logger.info('🧹 Cleaned up duplicate entries');

      // Set service as running before first sync
      this.isRunning = true;

      // Run initial full sync on startup
      Logger.info('🚀 Running initial full sync on startup...');
      await this.runFullSync();

      // Schedule full sync every 30 minutes
      this.scheduleFullSync();
      Logger.info('🚀 Guild Sync Service started successfully');

      // Send startup status to web API
      await this.webApi.updateStatus({
        level: 'info',
        message: 'Guild Sync Service started',
        stats: this.getStats()
      });

    } catch (error) {
      Logger.error('❌ Failed to start Guild Sync Service:', error.message || error);
      console.error('GuildSyncService full error:', error);
      throw error;
    }
  }

  async stop() {
    Logger.info('🛑 Stopping Guild Sync Service...');

    this.isRunning = false;

    // Stop cron job
    if (this.fullSyncJob) {
      this.fullSyncJob.stop();
    }

    // Close database
    await this.db.close();

    Logger.info('✅ Guild Sync Service stopped');
  }

  scheduleFullSync() {
    // Run full sync every 30 minutes
    Logger.info('📅 Scheduling full sync: every 30 minutes');

    this.fullSyncJob = cron.schedule('*/30 * * * *', async () => {
      if (!this.isRunning || this.isSyncing) {
        Logger.info('⏭️ Skipping scheduled sync - already running or service stopped');
        return;
      }
      
      await this.runFullSync();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.fullSyncJob.start();
  }

  async runFullSync() {
    if (this.isSyncing) {
      Logger.info('⏭️ Full sync already in progress, skipping');
      return;
    }

    this.isSyncing = true;
    const syncStartTime = new Date();
    Logger.info('🔄 Starting full guild sync...');

    try {
      // Step 1: Discover current guild members
      const members = await this.discoverGuildMembers();
      if (!members || members.length === 0) {
        Logger.warn('⚠️ No guild members found, skipping sync');
        this.isSyncing = false;
        return;
      }

      // Initialize progress tracking
      this.syncProgress = { current: 0, total: members.length, errors: 0 };
      Logger.info(`📊 Starting character data sync for ${members.length} members`);

      // Emit initial progress
      if (global.io) {
        global.io.emit('syncProgress', {
          current: 0,
          total: members.length,
          errors: 0,
          status: 'starting'
        });
      }

      // Step 2: Sync each character with 1 second delay
      let syncedCount = 0;
      let errorCount = 0;

      for (let i = 0; i < members.length; i++) {
        if (!this.isRunning) break; // Stop if service is shutting down

        const member = members[i];
        this.syncProgress.current = i + 1;

        try {
          Logger.info(`📊 [${this.syncProgress.current}/${this.syncProgress.total}] Syncing ${member.name}...`);

          // Get character data from API
          const data = await this.externalApi.getMember(
            member.name,
            member.realm,
            this.config.guild.region,
            'auto',
            member.character_api_url
          );

          if (data) {
            // Update database with synced data
            await this.db.upsertGuildMember({
              character_name: member.name,
              realm: member.realm,
              class: data.character_class || member.class,
              level: data.level,
              item_level: data.item_level,
              mythic_plus_score: data.mythic_plus_score,
              current_pvp_rating: data.current_pvp_rating
            });

            syncedCount++;
            this.stats.totalSynced++;
            Logger.info(`✅ [${this.syncProgress.current}/${this.syncProgress.total}] ${member.name} synced successfully`);
          } else {
            errorCount++;
            this.stats.totalErrors++;
            Logger.warn(`⚠️ [${this.syncProgress.current}/${this.syncProgress.total}] ${member.name} - no data returned`);
          }

        } catch (error) {
          errorCount++;
          this.stats.totalErrors++;
          this.syncProgress.errors = errorCount;

          // Log detailed error
          let errorType = 'unknown_error';
          let service = 'unknown';
          let urlAttempted = null;

          if (error.code === 'ERR_BAD_REQUEST' && error.response?.status === 404) {
            errorType = 'api_404';
            service = error.config?.url?.includes('raider.io') ? 'raiderio' : 'blizzard';
            urlAttempted = error.config?.url;
          } else if (error.code === 'ECONNABORTED') {
            errorType = 'api_timeout';
            service = error.config?.url?.includes('raider.io') ? 'raiderio' : 'blizzard';
            urlAttempted = error.config?.url;
          } else if (error.message?.includes('JSON')) {
            errorType = 'parse_error';
          }

          await this.db.logSyncError(
            member.name,
            member.realm,
            errorType,
            error.message || error.toString(),
            service,
            urlAttempted
          );

          Logger.error(`❌ [${this.syncProgress.current}/${this.syncProgress.total}] Error syncing ${member.name}: ${error.message}`);
        }

        // Emit progress update
        if (global.io) {
          global.io.emit('syncProgress', {
            current: this.syncProgress.current,
            total: this.syncProgress.total,
            errors: errorCount,
            character: member.name,
            status: 'syncing'
          });
        }

        // Wait 1 second before next character (except for last one)
        if (i < members.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Step 3: Complete sync
      const syncEndTime = new Date();
      const duration = Math.round((syncEndTime - syncStartTime) / 1000);
      
      this.stats.lastFullSync = syncEndTime;
      this.stats.lastSyncDuration = duration;

      Logger.info(`🎉 Full sync completed: ${syncedCount} synced, ${errorCount} errors (${duration}s)`);

      // Emit completion and updated member list
      if (global.io) {
        const updatedMembers = await this.getGuildMembers();
        global.io.emit('syncComplete', {
          current: this.syncProgress.total,
          total: this.syncProgress.total,
          errors: errorCount,
          duration: duration,
          status: 'complete'
        });
        
        global.io.emit('membersUpdated', {
          members: updatedMembers,
          count: updatedMembers.length,
          timestamp: new Date().toISOString(),
          lastSync: {
            processed: syncedCount,
            errors: errorCount,
            duration: duration
          }
        });
      }

    } catch (error) {
      Logger.error('❌ Full sync failed:', error.message || error);
      this.stats.totalErrors++;
      
      if (global.io) {
        global.io.emit('syncError', {
          message: `Full sync failed: ${error.message}`,
          timestamp: new Date().toISOString()
        });
      }
    } finally {
      this.isSyncing = false;
      this.syncProgress = { current: 0, total: 0, errors: 0 };
    }
  }

  async discoverGuildMembers() {
    try {
      Logger.info('🔍 Discovering current guild members...');

      const members = await this.externalApi.getMembers(
        this.config.guild.name,
        this.config.guild.realm,
        this.config.guild.region
      );
      
      if (members.length === 0) {
        Logger.warn('⚠️ No guild members found');
        return [];
      }

      Logger.info(`📋 Found ${members.length} current guild members`);
      return members;

    } catch (error) {
      Logger.error('❌ Guild member discovery failed:', error.message || error);
      throw error;
    }
  }

  // Old processPlayerSync removed - replaced with runFullSync()

  getStats() {
    const uptime = Date.now() - this.stats.startTime.getTime();
    
    return {
      totalSynced: this.stats.totalSynced,
      totalErrors: this.stats.totalErrors,
      uptimeMs: uptime,
      uptimeHours: Math.round(uptime / (1000 * 60 * 60) * 100) / 100,
      startTime: this.stats.startTime,
      lastFullSync: this.stats.lastFullSync,
      lastSyncDuration: this.stats.lastSyncDuration,
      isRunning: this.isRunning,
      isSyncing: this.isSyncing,
      syncProgress: this.isSyncing ? this.syncProgress : null
    };
  }

  // Health check for Docker
  async healthCheck() {
    try {
      // Check if service is running
      if (!this.isRunning) {
        throw new Error('Service not running');
      }

      // Check database connectivity
      const dbHealth = await this.db.healthCheck();
      if (!dbHealth) {
        throw new Error('Database not responding');
      }

      // Check if we've had recent activity (within last hour)
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (this.stats.lastSync && this.stats.lastSync < hourAgo && this.stats.lastDiscovery && this.stats.lastDiscovery < hourAgo) {
        throw new Error('No recent sync activity');
      }

      return {
        status: 'healthy',
        ...this.getStats()
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        ...this.getStats()
      };
    }
  }

  async getGuildMembers() {
    return await this.db.getGuildMembers();
  }

}

module.exports = GuildSyncService;