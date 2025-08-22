/**
 * 🏰 Guild Sync Service - Core orchestrator
 */

const cron = require('node-cron');
const DatabaseService = require('./DatabaseService');
const GuildDiscoveryService = require('./GuildDiscoveryService');
const PlayerSyncService = require('./PlayerSyncService');
const WebApiService = require('./WebApiService');
const Logger = require('../utils/Logger');

class GuildSyncService {
  constructor(config) {
    this.config = config;
    this.isRunning = false;
    this.stats = {
      totalSynced: 0,
      totalErrors: 0,
      startTime: new Date(),
      lastDiscovery: null,
      lastSync: null
    };

    // Initialize services
    this.db = new DatabaseService(config);
    this.guildDiscovery = new GuildDiscoveryService(config, Logger);
    this.playerSync = new PlayerSyncService(config, Logger);
    this.webApi = new WebApiService(config, Logger);

    // Cron jobs
    this.discoveryJob = null;
    this.syncJob = null;
  }

  async start() {
    try {
      Logger.info('🔧 Initializing Guild Sync Service...');

      // Initialize database
      await this.db.initialize();
      Logger.info('✅ Database initialized');

      // Initial guild discovery
      await this.discoverGuildMembers();

      // Schedule guild discovery (every 6 hours by default)
      this.scheduleGuildDiscovery();

      // Schedule player syncing (continuous)  
      this.schedulePlayerSync();

      this.isRunning = true;
      Logger.info('🚀 Guild Sync Service started successfully');

      // Send startup status to web API
      await this.webApi.updateStatus({
        level: 'info',
        message: 'Guild Sync Service started',
        stats: this.getStats()
      });

    } catch (error) {
      Logger.error('❌ Failed to start Guild Sync Service:', error);
      throw error;
    }
  }

  async stop() {
    Logger.info('🛑 Stopping Guild Sync Service...');

    this.isRunning = false;

    // Stop cron jobs
    if (this.discoveryJob) {
      this.discoveryJob.stop();
    }
    if (this.syncJob) {
      this.syncJob.stop();
    }

    // Close database
    await this.db.close();

    Logger.info('✅ Guild Sync Service stopped');
  }

  scheduleGuildDiscovery() {
    // Run every 6 hours (or configured interval)
    const cronPattern = `0 */${this.config.guild.discoveryIntervalHours} * * *`;
    
    Logger.info(`📅 Scheduling guild discovery: every ${this.config.guild.discoveryIntervalHours} hours`);

    this.discoveryJob = cron.schedule(cronPattern, async () => {
      await this.discoverGuildMembers();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.discoveryJob.start();
  }

  schedulePlayerSync() {
    // Run every minute to check for pending syncs
    Logger.info('📅 Scheduling player sync: every minute');

    this.syncJob = cron.schedule('* * * * *', async () => {
      if (!this.isRunning) return;
      
      await this.processPlayerSync();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.syncJob.start();
  }

  async discoverGuildMembers() {
    try {
      Logger.info('🔍 Starting guild member discovery...');
      this.stats.lastDiscovery = new Date();

      const members = await this.guildDiscovery.discoverMembers();
      
      if (members.length === 0) {
        Logger.warn('⚠️  No guild members found');
        return;
      }

      Logger.info(`📋 Discovered ${members.length} guild members`);

      // Update database with discovered members
      for (const member of members) {
        await this.db.upsertGuildMember(member);
        
        // Schedule sync jobs for this member
        await this.db.schedulePlayerSync(
          member.name, 
          member.realm, 
          member.region, 
          'wow_data'
        );
        
        await this.db.schedulePlayerSync(
          member.name, 
          member.realm, 
          member.region, 
          'pvp_data'
        );
      }

      // Mark inactive members
      await this.db.markInactiveMembers();

      Logger.info('✅ Guild discovery completed');

      // Update web API
      await this.webApi.updateStatus({
        level: 'info',
        message: `Guild discovery completed: ${members.length} members`,
        memberCount: members.length
      });

    } catch (error) {
      Logger.error('❌ Guild discovery failed:', error);
      
      await this.webApi.updateStatus({
        level: 'error',
        message: `Guild discovery failed: ${error.message}`
      });
    }
  }

  async processPlayerSync() {
    try {
      // Get next batch of players to sync
      const jobs = await this.db.getNextSyncJobs(this.config.guild.rateLimit.batchSize);
      
      if (jobs.length === 0) {
        return; // No pending jobs
      }

      Logger.info(`🔄 Processing ${jobs.length} sync jobs...`);
      this.stats.lastSync = new Date();

      let processed = 0;
      let errors = 0;

      for (const job of jobs) {
        if (!this.isRunning) break; // Stop if service is shutting down

        try {
          // Mark job as processing
          await this.db.markJobProcessing(job.id);

          Logger.debug(`⚙️  Syncing ${job.data_type} for ${job.player_name}...`);

          let success = false;

          if (job.data_type === 'wow_data') {
            // Sync WoW data
            const data = await this.playerSync.syncWowData({
              name: job.player_name,
              realm: job.player_realm,
              region: job.player_region
            });

            if (data) {
              success = await this.webApi.pushPlayerData(
                job.player_name,
                job.player_realm, 
                job.player_region,
                data
              );
            }

          } else if (job.data_type === 'pvp_data') {
            // Sync PvP data
            const data = await this.playerSync.syncPvpData({
              name: job.player_name,
              realm: job.player_realm,
              region: job.player_region
            });

            if (data) {
              success = await this.webApi.pushPvpData(
                job.player_name,
                job.player_realm,
                job.player_region, 
                data
              );
            }
          }

          if (success) {
            await this.db.markJobCompleted(job.id, this.config.guild.syncIntervalMinutes);
            processed++;
            this.stats.totalSynced++;
            
            Logger.info(`✅ ${job.data_type} synced for ${job.player_name}`);
          } else {
            await this.db.markJobFailed(job.id, 'Sync failed');
            errors++;
            this.stats.totalErrors++;
            
            Logger.warn(`⚠️  ${job.data_type} failed for ${job.player_name}`);
          }

        } catch (error) {
          await this.db.markJobFailed(job.id, error.message);
          errors++;
          this.stats.totalErrors++;
          
          Logger.error(`❌ Error syncing ${job.data_type} for ${job.player_name}:`, error);
        }
      }

      if (processed > 0 || errors > 0) {
        Logger.info(`📈 Batch complete: ${processed} synced, ${errors} errors`);
        
        // Log metrics
        Logger.metric('sync_batch_processed', processed);
        Logger.metric('sync_batch_errors', errors);
        Logger.metric('sync_total_processed', this.stats.totalSynced);
        Logger.metric('sync_total_errors', this.stats.totalErrors);

        // Update web API every 10 successful syncs
        if (this.stats.totalSynced % 10 === 0 && processed > 0) {
          await this.webApi.updateStatus({
            level: 'info',
            message: 'Sync batch completed',
            stats: this.getStats()
          });
        }
      }

    } catch (error) {
      Logger.error('❌ Player sync batch failed:', error);
      this.stats.totalErrors++;
    }
  }

  getStats() {
    const uptime = Date.now() - this.stats.startTime.getTime();
    
    return {
      totalSynced: this.stats.totalSynced,
      totalErrors: this.stats.totalErrors,
      uptimeMs: uptime,
      uptimeHours: Math.round(uptime / (1000 * 60 * 60) * 100) / 100,
      startTime: this.stats.startTime,
      lastDiscovery: this.stats.lastDiscovery,
      lastSync: this.stats.lastSync,
      isRunning: this.isRunning
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
}

module.exports = GuildSyncService;