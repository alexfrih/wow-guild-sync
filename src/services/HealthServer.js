/**
 * 📊 Health Check Server for Docker
 */

const express = require('express');
const path = require('path');
const Logger = require('../utils/Logger');

class HealthServer {
  constructor(port = 3001) {
    this.port = port;
    this.app = express();
    this.server = null;
  }

  async start() {
    // JSON middleware
    this.app.use(express.json());
    
    // Serve React build files
    const buildPath = path.join(__dirname, '../web/build');
    this.app.use(express.static(buildPath));

    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        // Get health status from main service
        const healthStatus = global.guildSyncService 
          ? await global.guildSyncService.healthCheck()
          : { status: 'starting', message: 'Service is starting up' };

        const httpStatus = healthStatus.status === 'healthy' ? 200 : 503;
        
        res.status(httpStatus).json({
          service: 'pool-party-guild-sync',
          timestamp: new Date().toISOString(),
          ...healthStatus
        });

      } catch (error) {
        Logger.error('Health check failed:', error);
        res.status(503).json({
          service: 'pool-party-guild-sync',
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Readiness check (for Kubernetes)
    this.app.get('/ready', async (req, res) => {
      const isReady = global.guildSyncService && global.guildSyncService.isRunning;
      
      res.status(isReady ? 200 : 503).json({
        service: 'pool-party-guild-sync',
        ready: isReady,
        timestamp: new Date().toISOString()
      });
    });

    // Liveness check (for Kubernetes)
    this.app.get('/live', (req, res) => {
      res.status(200).json({
        service: 'pool-party-guild-sync',
        alive: true,
        timestamp: new Date().toISOString()
      });
    });

    // Metrics endpoint (Prometheus format)
    this.app.get('/metrics', async (req, res) => {
      try {
        const stats = global.guildSyncService 
          ? global.guildSyncService.getStats()
          : {};

        const metrics = [
          `# HELP guild_sync_total_synced Total number of successful syncs`,
          `# TYPE guild_sync_total_synced counter`,
          `guild_sync_total_synced ${stats.totalSynced || 0}`,
          ``,
          `# HELP guild_sync_total_errors Total number of sync errors`,
          `# TYPE guild_sync_total_errors counter`,
          `guild_sync_total_errors ${stats.totalErrors || 0}`,
          ``,
          `# HELP guild_sync_uptime_seconds Service uptime in seconds`,
          `# TYPE guild_sync_uptime_seconds gauge`,
          `guild_sync_uptime_seconds ${Math.floor((stats.uptimeMs || 0) / 1000)}`,
          ``
        ].join('\\n');

        res.set('Content-Type', 'text/plain');
        res.send(metrics);

      } catch (error) {
        Logger.error('Metrics endpoint failed:', error);
        res.status(500).send('Error generating metrics');
      }
    });

    // Guild members API endpoint
    this.app.get('/api/members', async (req, res) => {
      try {
        if (!global.guildSyncService) {
          return res.status(503).json({ error: 'Service not ready' });
        }

        const members = await global.guildSyncService.getGuildMembers();
        res.json({
          count: members.length,
          members: members
        });
      } catch (error) {
        Logger.error('Members endpoint failed:', error.message || error);
        console.error('Members endpoint full error:', error);
        res.status(500).json({ error: 'Failed to get guild members', details: error.message });
      }
    });

    // API Documentation endpoint
    this.app.get('/api/docs', (req, res) => {
      const guildConfig = global.guildSyncService?.config?.guild || {};
      res.json({
        title: 'WoW Guild Sync API',
        version: '1.0.0',
        description: 'API endpoints for accessing World of Warcraft guild member data',
        guild: {
          name: guildConfig.name || 'Unknown',
          realm: guildConfig.realm || 'Unknown',
          region: guildConfig.region || 'Unknown'
        },
        endpoints: {
          '/api/members': {
            method: 'GET',
            description: 'Get all guild members with their character data',
            response: {
              count: 'number - Total number of guild members',
              members: 'array - Array of guild member objects'
            },
            member_object: {
              character_name: 'string - Character name',
              realm: 'string - Server realm',
              class: 'string - Character class (e.g., Warrior, Mage)',
              level: 'number - Character level (1-80)',
              item_level: 'number - Average item level',
              mythic_plus_score: 'number - Mythic+ rating score',
              last_updated: 'string - ISO timestamp of last data sync'
            }
          },
          '/api/docs': {
            method: 'GET', 
            description: 'This API documentation'
          },
          '/health': {
            method: 'GET',
            description: 'Health check endpoint for monitoring'
          },
          '/metrics': {
            method: 'GET',
            description: 'Prometheus metrics endpoint'
          }
        },
        examples: {
          member_object: {
            character_name: 'Critter',
            realm: 'Archimonde',
            class: 'Death Knight',
            level: 80,
            item_level: 676,
            mythic_plus_score: 3198,
            last_updated: '2025-08-22T10:39:38.000Z'
          }
        }
      });
    });

    // Serve React app for all other routes (SPA fallback)
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../web/build/index.html'));
    });

    // Start server
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, (error) => {
        if (error) {
          reject(error);
        } else {
          Logger.info(`📊 Health server running on port ${this.port}`);
          resolve();
        }
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          Logger.info('📊 Health server stopped');
          resolve();
        });
      });
    }
  }
}

module.exports = HealthServer;