/**
 * 📊 Health Check Server for Docker
 */

const express = require('express');
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