/**
 * 📊 Health Check Server for Docker
 */

const express = require('express');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Logger = require('../utils/Logger');

class HealthServer {
  constructor(port = 3001) {
    this.port = port;
    this.app = express();
    this.server = null;
    this.io = null;
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

    // Manual endpoints removed - all operations are now automated via cron jobs

    // Errors API endpoint
    this.app.get('/api/errors', async (req, res) => {
      try {
        if (!global.guildSyncService) {
          return res.status(503).json({ error: 'Service not ready' });
        }

        const limit = parseInt(req.query.limit) || 100;
        const errors = await global.guildSyncService.db.getSyncErrors(limit);
        const stats = await global.guildSyncService.db.getErrorStats();
        
        res.json({
          errors,
          stats,
          count: errors.length
        });
      } catch (error) {
        Logger.error('Errors endpoint failed:', error.message || error);
        res.status(500).json({ error: 'Failed to get sync errors', details: error.message });
      }
    });



    // Beautiful HTML Documentation endpoint
    this.app.get('/docs', (req, res) => {
      const guildConfig = global.guildSyncService?.config?.guild || {};
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WoW Guild Sync API Documentation</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏰</text></svg>">
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-screen">
    <div class="container mx-auto px-6 py-8 max-w-4xl">
        <div class="bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl">
            <div class="border-b border-zinc-800 p-6">
                <h1 class="text-3xl font-bold text-[#ff8000] mb-2">🏰 WoW Guild Sync API</h1>
                <p class="text-zinc-400">RESTful API for accessing World of Warcraft guild member data</p>
                <div class="mt-4 text-sm">
                    <span class="bg-[#a335ee] text-white px-2 py-1 rounded">Guild: ${guildConfig.name || 'Unknown'}</span>
                    <span class="bg-[#0070dd] text-white px-2 py-1 rounded ml-2">Realm: ${guildConfig.realm || 'Unknown'}</span>
                    <span class="bg-[#1eff00] text-black px-2 py-1 rounded ml-2">Region: ${guildConfig.region || 'Unknown'}</span>
                </div>
            </div>
            
            <div class="p-6">
                <h2 class="text-xl font-bold text-[#ff8000] mb-4">📡 API Endpoints</h2>
                
                <div class="space-y-6">
                    <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="bg-green-600 text-white px-2 py-1 rounded text-xs font-bold">GET</span>
                            <code class="text-[#69ccf0]">/api/members</code>
                        </div>
                        <p class="text-zinc-300 mb-3">Get all guild members with their character data</p>
                        <div class="bg-zinc-950 p-3 rounded border border-zinc-700">
                            <pre class="text-sm text-zinc-300"><code>{
  "count": 168,
  "members": [
    {
      "character_name": "Critter",
      "realm": "Archimonde", 
      "class": "Mage",
      "level": 80,
      "item_level": 676,
      "mythic_plus_score": 3198,
      "last_updated": "2025-08-22T10:39:38.000Z"
    }
  ]
}</code></pre>
                        </div>
                    </div>
                    
                    <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="bg-green-600 text-white px-2 py-1 rounded text-xs font-bold">GET</span>
                            <code class="text-[#69ccf0]">/health</code>
                        </div>
                        <p class="text-zinc-300">Health check endpoint for monitoring service status</p>
                    </div>
                    
                    <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="bg-green-600 text-white px-2 py-1 rounded text-xs font-bold">GET</span>
                            <code class="text-[#69ccf0]">/metrics</code>
                        </div>
                        <p class="text-zinc-300">Prometheus metrics endpoint for monitoring and alerting</p>
                    </div>

                    <div class="bg-zinc-800 border border-green-700 rounded-lg p-4">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="bg-green-600 text-white px-2 py-1 rounded text-xs font-bold">POST</span>
                            <code class="text-[#69ccf0]">/api/discover</code>
                        </div>
                        <p class="text-zinc-300 mb-3">🔍 Manually trigger guild member discovery</p>
                        <div class="bg-zinc-950 p-3 rounded border border-green-700">
                            <pre class="text-sm text-green-300"><code>curl -X POST http://localhost:3001/api/discover</code></pre>
                        </div>
                    </div>

                    <div class="bg-zinc-800 border border-purple-700 rounded-lg p-4">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="bg-purple-600 text-white px-2 py-1 rounded text-xs font-bold">POST</span>
                            <code class="text-[#69ccf0]">/api/force-sync</code>
                        </div>
                        <p class="text-zinc-300 mb-3">⚡ Force sync all character data (item levels, M+ scores, PvP ratings)</p>
                        <div class="bg-zinc-950 p-3 rounded border border-purple-700">
                            <pre class="text-sm text-purple-300"><code>curl -X POST http://localhost:3001/api/force-sync</code></pre>
                        </div>
                    </div>

                    <div class="bg-zinc-800 border border-red-700 rounded-lg p-4">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="bg-red-600 text-white px-2 py-1 rounded text-xs font-bold">POST</span>
                            <code class="text-[#69ccf0]">/api/reset</code>
                        </div>
                        <p class="text-zinc-300 mb-3">🗑️ Reset all guild member data (Auto-triggers discovery after reset)</p>
                        <div class="bg-zinc-950 p-3 rounded border border-red-700">
                            <pre class="text-sm text-red-300"><code>curl -X POST http://localhost:3001/api/reset</code></pre>
                        </div>
                    </div>
                </div>
                
                <h2 class="text-xl font-bold text-[#ff8000] mb-4 mt-8">🎮 Character Classes</h2>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <span class="text-[#c79c6e] bg-zinc-800 px-3 py-1 rounded text-center">Warrior</span>
                    <span class="text-[#f58cba] bg-zinc-800 px-3 py-1 rounded text-center">Paladin</span>
                    <span class="text-[#abd473] bg-zinc-800 px-3 py-1 rounded text-center">Hunter</span>
                    <span class="text-[#fff569] bg-zinc-800 px-3 py-1 rounded text-center">Rogue</span>
                    <span class="text-white bg-zinc-800 px-3 py-1 rounded text-center">Priest</span>
                    <span class="text-[#c41f3b] bg-zinc-800 px-3 py-1 rounded text-center">Death Knight</span>
                    <span class="text-[#0070de] bg-zinc-800 px-3 py-1 rounded text-center">Shaman</span>
                    <span class="text-[#69ccf0] bg-zinc-800 px-3 py-1 rounded text-center">Mage</span>
                    <span class="text-[#9482c9] bg-zinc-800 px-3 py-1 rounded text-center">Warlock</span>
                    <span class="text-[#00ff96] bg-zinc-800 px-3 py-1 rounded text-center">Monk</span>
                    <span class="text-[#ff7d0a] bg-zinc-800 px-3 py-1 rounded text-center">Druid</span>
                    <span class="text-[#a330c9] bg-zinc-800 px-3 py-1 rounded text-center">Demon Hunter</span>
                    <span class="text-[#33937f] bg-zinc-800 px-3 py-1 rounded text-center">Evoker</span>
                </div>
                
                <div class="mt-8 flex gap-4">
                    <a href="/api/members" class="bg-[#ff8000] hover:bg-orange-600 text-zinc-900 font-semibold px-4 py-2 rounded transition-colors">
                        📊 View Live Data
                    </a>
                    <a href="/" class="bg-zinc-700 hover:bg-zinc-600 text-zinc-100 font-semibold px-4 py-2 rounded transition-colors">
                        🏠 Back to Dashboard
                    </a>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
      res.send(html);
    });

    // API Documentation endpoint (JSON)
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

    // Start server with Socket.IO
    return new Promise((resolve, reject) => {
      this.server = createServer(this.app);
      
      // Initialize Socket.IO
      this.io = new Server(this.server, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"]
        }
      });
      
      // Socket.IO connection handler
      this.io.on('connection', (socket) => {
        Logger.info('🔌 New Socket.IO client connected');
        
        socket.on('disconnect', () => {
          Logger.info('🔌 Socket.IO client disconnected');
        });
      });
      
      // Make io globally accessible for other services
      global.io = this.io;
      
      this.server.listen(this.port, (error) => {
        if (error) {
          reject(error);
        } else {
          Logger.info(`📊 Health server with Socket.IO running on port ${this.port}`);
          resolve();
        }
      });
    });
  }

  async stop() {
    if (this.io) {
      this.io.close();
    }
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