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

      // Clean up any duplicates from previous runs
      await this.db.cleanupDuplicates();
      Logger.info('🧹 Cleaned up duplicate entries');

      // Fast startup: check if we have data
      const memberCount = await this.db.getMemberCount();
      if (memberCount === 0) {
        Logger.info('🔍 No existing members, running initial guild discovery...');
        await this.discoverGuildMembers();
        Logger.info('🔄 Running initial player sync...');
        await this.processPlayerSync();
      } else {
        Logger.info(`🏰 Found ${memberCount} existing members, ready immediately!`);
      }

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
      Logger.error('❌ Failed to start Guild Sync Service:', error.message || error);
      console.error('GuildSyncService full error:', error);
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

      const members = await this.guildDiscovery.discoverGuildMembers();
      
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
      Logger.error('❌ Guild discovery failed:', error.message || error);
      console.error('Guild discovery full error:', error);
      
      await this.webApi.updateStatus({
        level: 'error',
        message: `Guild discovery failed: ${error.message}`
      });
    }
  }

  async processPlayerSync() {
    try {
      Logger.info('🔄 Processing player sync batch...');
      
      // Get next batch of players to sync
      const jobs = await this.db.getNextSyncJobs(this.config.guild.rateLimit.batchSize);
      Logger.info(`Found ${jobs.length} players to sync`);
      
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
          Logger.debug(`⚙️  Syncing WoW data for ${job.character_name}...`);

          // Sync WoW character data
          const data = await this.playerSync.syncWowData({
            name: job.character_name,
            realm: job.realm,
            region: this.config.guild.region
          });

          if (data) {
            // Update database with synced data
            await this.db.upsertGuildMember({
              character_name: job.character_name,
              realm: job.realm,
              class: data.character_class,
              level: data.level,
              item_level: data.item_level,
              mythic_plus_score: data.mythic_plus_score
            });

            processed++;
            this.stats.totalSynced++;
            
            Logger.info(`✅ WoW data synced for ${job.character_name}`);
          } else {
            errors++;
            this.stats.totalErrors++;
            
            Logger.warn(`⚠️  WoW data sync failed for ${job.character_name}`);
          }

        } catch (error) {
          errors++;
          this.stats.totalErrors++;
          
          Logger.error(`❌ Error syncing WoW data for ${job.character_name}:`, error.message || error);
          console.error('Full sync error:', error);
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
      Logger.error('❌ Player sync batch failed:', error.message || error);
      console.error('Player sync full error:', error);
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

  async getGuildMembers() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT character_name, realm, class, level, item_level, mythic_plus_score, last_updated, is_active
        FROM guild_members 
        WHERE is_active = 1
        ORDER BY item_level DESC, character_name ASC
      `;
      
      this.db.db.all(sql, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

}

module.exports = GuildSyncService;