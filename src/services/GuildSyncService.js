/**
 * 🏰 Guild Sync Service - Core orchestrator
 */

const cron = require('node-cron');
const PrismaService = require('./PrismaService');
const ExternalApiService = require('./ExternalApiService');
const WebApiService = require('./WebApiService');
const EmailService = require('./EmailService');
const Logger = require('../utils/Logger');

class GuildSyncService {
  constructor(config) {
    this.config = config;
    this.isRunning = false;
    this.isGuildDiscoveryRunning = false;
    this.isActiveSyncRunning = false;
    this.syncProgress = { current: 0, total: 0, errors: 0 };
    this.stats = {
      totalSynced: 0,
      totalErrors: 0,
      startTime: new Date(),
      lastFullSync: null,
      lastSyncDuration: null
    };
    this.recentErrors = []; // Track recent sync errors for reporting

    // Initialize services
    this.db = new PrismaService();
    this.externalApi = new ExternalApiService(config, Logger);
    this.webApi = new WebApiService(config, Logger);
    this.emailService = new EmailService(config);

    // Cron jobs for two-tier sync system
    this.guildDiscoveryJob = null;
    this.activeCharacterSyncJob = null;
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

      // Test email configuration if enabled
      if (this.emailService.isEnabled) {
        Logger.info('📧 Testing email notification configuration...');
        try {
          await this.emailService.sendTestEmail();
        } catch (error) {
          Logger.warn('⚠️ Email test failed - notifications may not work:', error.message);
        }
      }

      // Set service as running before first sync
      this.isRunning = true;

      // Run initial guild discovery on startup
      Logger.info('🚀 Running initial guild discovery on startup...');
      await this.runGuildDiscovery();

      // Run immediate sync for active members with missing data
      Logger.info('🎯 Checking for active members with missing achievement/PvP data...');
      await this.runMissingDataSync();

      // Schedule two-tier sync system
      this.scheduleTwoTierSync();
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
    if (this.guildDiscoveryJob) {
      this.guildDiscoveryJob.stop();
    }
    if (this.activeCharacterSyncJob) {
      this.activeCharacterSyncJob.stop();
    }

    // Close database
    await this.db.close();

    Logger.info('✅ Guild Sync Service stopped');
  }

  scheduleTwoTierSync() {
    // Schedule guild discovery every 6 hours
    Logger.info('📅 Scheduling guild discovery: every 6 hours');
    this.guildDiscoveryJob = cron.schedule('0 */6 * * *', async () => {
      if (!this.isRunning || this.isGuildDiscoveryRunning) {
        Logger.info('⏭️ Skipping scheduled guild discovery - already running or service stopped');
        return;
      }
      
      await this.runGuildDiscovery();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    // Schedule active character sync every hour
    Logger.info('📅 Scheduling active character sync: every hour');
    this.activeCharacterSyncJob = cron.schedule('0 * * * *', async () => {
      if (!this.isRunning || this.isActiveSyncRunning) {
        Logger.info('⏭️ Skipping scheduled active sync - already running or service stopped');
        return;
      }
      
      await this.runActiveCharacterSync();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.guildDiscoveryJob.start();
    this.activeCharacterSyncJob.start();
  }

  async runGuildDiscovery() {
    if (this.isGuildDiscoveryRunning) {
      Logger.info('⏭️ Guild discovery already in progress, skipping');
      return;
    }

    this.isGuildDiscoveryRunning = true;
    const discoveryStartTime = new Date();
    Logger.info('🔍 Starting guild discovery and activity check...');

    try {
      // Step 1: Discover current guild members
      const members = await this.discoverGuildMembers();
      if (!members || members.length === 0) {
        Logger.warn('⚠️ No guild members found, skipping discovery');
        this.isSyncing = false;
        return;
      }

      // Step 2: Upsert guild members to database first
      Logger.info(`💾 Upserting ${members.length} guild members to database`);
      const upsertPromises = members.map(member => this.db.upsertGuildMember(member));
      const upsertResults = await Promise.allSettled(upsertPromises);
      
      let upsertSuccess = 0;
      let upsertErrors = 0;
      upsertResults.forEach(result => {
        if (result.status === 'fulfilled') {
          upsertSuccess++;
        } else {
          upsertErrors++;
        }
      });
      Logger.info(`✅ Upserted ${upsertSuccess} members, ${upsertErrors} errors`);

      Logger.info(`📊 Starting activity check for ${members.length} members`);
      
      // Step 3: Bulk check activity for all members
      const activityResults = await this.externalApi.bulkCheckActivity(members, this.config.guild.region);
      
      Logger.info(`📋 Processing activity data for ${activityResults.length} characters`);
      
      // Step 4: Update activity status in database
      const updateResults = await this.db.bulkUpdateActivityStatus(activityResults);
      
      let successCount = 0;
      let errorCount = 0;
      updateResults.forEach(result => {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          errorCount++;
        }
      });

      // Step 5: Complete discovery
      const discoveryEndTime = new Date();
      const duration = Math.round((discoveryEndTime - discoveryStartTime) / 1000);
      
      Logger.info(`🎉 Guild discovery completed: ${successCount} updated, ${errorCount} errors (${duration}s)`);

      // Emit completion
      if (global.io) {
        global.io.emit('discoveryComplete', {
          total: members.length,
          updated: successCount,
          errors: errorCount,
          duration: duration,
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      Logger.error('❌ Guild discovery failed:', error.message || error);
      this.stats.totalErrors++;

      // Send critical error notification
      await this.emailService.sendCriticalErrorNotification(error, {
        syncType: 'Guild Discovery',
        timestamp: new Date().toISOString()
      });

      if (global.io) {
        global.io.emit('discoveryError', {
          message: `Guild discovery failed: ${error.message}`,
          timestamp: new Date().toISOString()
        });
      }
    } finally {
      this.isGuildDiscoveryRunning = false;
    }
  }

  async runActiveCharacterSync() {
    if (this.isActiveSyncRunning) {
      Logger.info('⏭️ Active character sync already in progress, skipping');
      return;
    }

    this.isActiveSyncRunning = true;
    const syncStartTime = new Date();
    Logger.info('🔄 Starting active character sync (30-day window)...');

    try {
      // Step 1: Get active characters from database (30-day window)
      const activeMembers = await this.db.getActiveCharacters(30);
      if (!activeMembers || activeMembers.length === 0) {
        Logger.warn('⚠️ No active members found, skipping sync');
        this.isActiveSyncRunning = false;
        return;
      }

      // Initialize progress tracking
      this.syncProgress = { current: 0, total: activeMembers.length, errors: 0 };
      Logger.info(`📊 Starting sync for ${activeMembers.length} active members`);

      // Emit initial progress
      if (global.io) {
        global.io.emit('syncProgress', {
          current: 0,
          total: activeMembers.length,
          errors: 0,
          status: 'starting',
          type: 'active_sync'
        });
      }

      // Step 2: Sync each active character
      let syncedCount = 0;
      let errorCount = 0;
      this.recentErrors = []; // Clear previous errors

      for (let i = 0; i < activeMembers.length; i++) {
        if (!this.isRunning) break;

        const member = activeMembers[i];
        this.syncProgress.current = i + 1;

        try {
          Logger.info(`📊 [${this.syncProgress.current}/${this.syncProgress.total}] Syncing ${member.character_name}...`);

          // Get character data from API (using existing logic)
          const data = await this.externalApi.getMember(
            member.character_name,
            member.realm,
            this.config.guild.region,
            'auto',
            member.character_api_url || null
          );

          if (data) {
            // Update database with synced data
            await this.db.upsertGuildMember({
              character_name: member.character_name,
              realm: member.realm,
              class: data.character_class || member.class,
              // level: data.level, // Don't update level during hourly sync - keep original from Blizzard
              item_level: data.item_level,
              mythic_plus_score: data.mythic_plus_score,
              current_saison: data.current_saison,
              current_pvp_rating: data.current_pvp_rating,
              raid_progress: data.raid_progress,
              pvp_2v2_rating: data.pvp_2v2_rating || 0,
              pvp_3v3_rating: data.pvp_3v3_rating || 0,
              pvp_rbg_rating: data.pvp_rbg_rating || 0,
              achievement_points: data.achievement_points || 0,
              solo_shuffle_rating: data.solo_shuffle_rating || 0,
              max_solo_shuffle_rating: data.max_solo_shuffle_rating || 0
            });

            syncedCount++;
            this.stats.totalSynced++;
            Logger.info(`✅ [${this.syncProgress.current}/${this.syncProgress.total}] ${member.character_name} synced successfully`);
          } else {
            errorCount++;
            this.stats.totalErrors++;
            this.recentErrors.push({
              character: member.character_name,
              message: 'No data returned from API'
            });
            Logger.warn(`⚠️ [${this.syncProgress.current}/${this.syncProgress.total}] ${member.character_name} - no data returned`);
          }

        } catch (error) {
          errorCount++;
          this.stats.totalErrors++;
          this.syncProgress.errors = errorCount;

          // Track error details
          this.recentErrors.push({
            character: member.character_name,
            message: error.message || 'Unknown error'
          });

          Logger.error(`❌ [${this.syncProgress.current}/${this.syncProgress.total}] Error syncing ${member.character_name}: ${error.message}`);
        }

        // Emit progress update
        if (global.io) {
          global.io.emit('syncProgress', {
            current: this.syncProgress.current,
            total: this.syncProgress.total,
            errors: errorCount,
            character: member.character_name,
            status: 'syncing',
            type: 'active_sync'
          });
        }

        // Wait 1 second before next character
        if (i < activeMembers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Step 3: Complete sync
      const syncEndTime = new Date();
      const duration = Math.round((syncEndTime - syncStartTime) / 1000);

      this.stats.lastFullSync = syncEndTime;
      this.stats.lastSyncDuration = duration;

      Logger.info(`🎉 Active sync completed: ${syncedCount} synced, ${errorCount} errors (${duration}s)`);

      // Send error notification if there were significant errors
      if (errorCount > 0) {
        const errorRate = (errorCount / activeMembers.length) * 100;
        if (errorRate > 10 || errorCount > 5) { // More than 10% errors or more than 5 errors
          const errorDetails = {
            syncType: 'Active Character Sync',
            errorCount: errorCount,
            totalCount: activeMembers.length,
            duration: duration,
            errors: this.recentErrors,
            timestamp: new Date().toISOString()
          };
          await this.emailService.sendSyncErrorNotification(errorDetails);
        }
      }

      // Emit completion
      if (global.io) {
        global.io.emit('syncComplete', {
          current: this.syncProgress.total,
          total: this.syncProgress.total,
          errors: errorCount,
          duration: duration,
          status: 'complete',
          type: 'active_sync'
        });
      }

    } catch (error) {
      Logger.error('❌ Active character sync failed:', error.message || error);
      this.stats.totalErrors++;

      // Send critical error notification
      await this.emailService.sendCriticalErrorNotification(error, {
        syncType: 'Active Character Sync',
        timestamp: new Date().toISOString()
      });

      if (global.io) {
        global.io.emit('syncError', {
          message: `Active sync failed: ${error.message}`,
          timestamp: new Date().toISOString()
        });
      }
    } finally {
      this.isActiveSyncRunning = false;
      this.syncProgress = { current: 0, total: 0, errors: 0 };
    }
  }

  async runMissingDataSync() {
    Logger.info('🔍 Starting missing data sync for active members...');
    
    try {
      // Get active members with missing achievement/PvP data
      const missingDataMembers = await this.db.getActiveCharactersWithMissingData(30);
      
      if (!missingDataMembers || missingDataMembers.length === 0) {
        Logger.info('✅ All active members have complete data');
        return;
      }

      Logger.info(`🎯 Found ${missingDataMembers.length} active members with missing data`);

      // Emit start notification
      if (global.io) {
        global.io.emit('missingDataSyncStart', {
          total: missingDataMembers.length,
          timestamp: new Date().toISOString()
        });
      }

      let syncedCount = 0;
      let errorCount = 0;

      for (let i = 0; i < missingDataMembers.length && this.isRunning; i++) {
        const member = missingDataMembers[i];
        
        try {
          Logger.info(`🔄 [${i+1}/${missingDataMembers.length}] Syncing missing data for ${member.character_name}...`);

          const data = await this.externalApi.getMember(
            member.character_name,
            member.realm,
            this.config.guild.region,
            'auto'
          );

          if (data) {
            await this.db.upsertGuildMember({
              character_name: member.character_name,
              realm: member.realm,
              class: data.character_class || member.class,
              level: data.level,
              item_level: data.item_level,
              mythic_plus_score: data.mythic_plus_score,
              current_saison: data.current_saison,
              current_pvp_rating: data.current_pvp_rating,
              raid_progress: data.raid_progress,
              pvp_2v2_rating: data.pvp_2v2_rating || 0,
              pvp_3v3_rating: data.pvp_3v3_rating || 0,
              pvp_rbg_rating: data.pvp_rbg_rating || 0,
              achievement_points: data.achievement_points || 0,
              solo_shuffle_rating: data.solo_shuffle_rating || 0,
              max_solo_shuffle_rating: data.max_solo_shuffle_rating || 0
            });

            syncedCount++;
            Logger.info(`✅ [${i+1}/${missingDataMembers.length}] ${member.character_name} missing data synced`);

            // Real-time update to web dashboard
            if (global.io) {
              global.io.emit('memberDataUpdated', {
                character_name: member.character_name,
                realm: member.realm,
                data: {
                  achievement_points: data.achievement_points || 0,
                  item_level: data.item_level,
                  mythic_plus_score: data.mythic_plus_score,
                  raid_progress: data.raid_progress,
                  pvp_2v2_rating: data.pvp_2v2_rating || 0,
                  pvp_3v3_rating: data.pvp_3v3_rating || 0,
                  pvp_rbg_rating: data.pvp_rbg_rating || 0,
                  solo_shuffle_rating: data.solo_shuffle_rating || 0,
                  max_solo_shuffle_rating: data.max_solo_shuffle_rating || 0,
                  last_updated: new Date()
                },
                timestamp: new Date().toISOString()
              });
            }
          }
        } catch (error) {
          errorCount++;
          Logger.error(`❌ [${i+1}/${missingDataMembers.length}] Failed to sync ${member.character_name}: ${error.message}`);
        }

        // Wait 1 second between characters
        if (i < missingDataMembers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      Logger.info(`🎉 Missing data sync completed: ${syncedCount} synced, ${errorCount} errors`);

      // Emit completion with updated member list
      if (global.io) {
        const updatedMembers = await this.getGuildMembers();
        global.io.emit('missingDataSyncComplete', {
          synced: syncedCount,
          errors: errorCount,
          timestamp: new Date().toISOString()
        });

        global.io.emit('membersUpdated', {
          members: updatedMembers,
          count: updatedMembers.length,
          timestamp: new Date().toISOString(),
          syncType: 'missing_data'
        });
      }

    } catch (error) {
      Logger.error('❌ Missing data sync failed:', error.message);
    }
  }

  // Legacy method kept for backward compatibility - now calls guild discovery
  async runFullSync() {
    Logger.info('🔄 Legacy runFullSync called - executing guild discovery');
    return await this.runGuildDiscovery();
  }

  // Original full sync logic moved here for reference if needed
  async runLegacyFullSync() {
    if (this.isSyncing) {
      Logger.info('⏭️ Full sync already in progress, skipping');
      return;
    }

    this.isSyncing = true;
    const syncStartTime = new Date();
    Logger.info('🔄 Starting legacy full guild sync...');

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
              current_pvp_rating: data.current_pvp_rating,
              achievement_points: data.achievement_points || 0,
              solo_shuffle_rating: data.solo_shuffle_rating || 0,
              max_solo_shuffle_rating: data.max_solo_shuffle_rating || 0
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
      
      // Handle membership changes (new/departed members)
      await this.handleMembershipChanges(members);
      
      return members;

    } catch (error) {
      Logger.error('❌ Guild member discovery failed:', error.message || error);
      throw error;
    }
  }

  async handleMembershipChanges(currentMembers) {
    try {
      const currentNames = currentMembers.map(m => m.name);
      
      // Get existing members from database
      const existingNames = await this.db.getAllMemberNames();
      
      // Find new and departed members
      const newMembers = currentNames.filter(name => !existingNames.includes(name));
      const departedMembers = existingNames.filter(name => !currentNames.includes(name));
      
      if (newMembers.length > 0) {
        Logger.info(`➕ Found ${newMembers.length} new members: ${newMembers.slice(0, 5).join(', ')}${newMembers.length > 5 ? '...' : ''}`);
      }
      
      if (departedMembers.length > 0) {
        Logger.info(`➖ Found ${departedMembers.length} departed members: ${departedMembers.slice(0, 5).join(', ')}${departedMembers.length > 5 ? '...' : ''}`);
        const removedCount = await this.db.removeDepartedMembers(departedMembers);
        Logger.info(`🗑️ Cleaned up ${removedCount} departed members from database`);
      }
      
      if (newMembers.length === 0 && departedMembers.length === 0) {
        Logger.info('✅ No membership changes detected');
      }
      
    } catch (error) {
      Logger.error('❌ Failed to handle membership changes:', error.message || error);
      // Don't throw - continue with sync even if membership change handling fails
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