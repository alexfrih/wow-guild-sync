require('dotenv').config();

const config = {
  guild: {
    name: process.env.GUILD_NAME || '',
    realm: process.env.GUILD_REALM || '',
    region: process.env.GUILD_REGION || '',
    syncIntervalMinutes: 30,
    fastStartup: true, // Enable fast startup mode
    discoveryIntervalHours: 6,
    rateLimit: {
      blizzard: 1500, // Only Blizzard API used for character sync
      batchSize: 40   // Increased batch size significantly
    }
  },

  webApi: {
    baseUrl: process.env.WEB_API_URL || '',
    apiKey: process.env.WEB_API_KEY || '',
    timeout: 10000,
    endpoints: {
      pushPlayerData: '/api/sync/player-data',
      pushPvpData: '/api/sync/pvp-data',
      updateStatus: '/api/sync/status'
    }
  },

  blizzard: {
    clientId: process.env.BLIZZARD_CLIENT_ID,
    clientSecret: process.env.BLIZZARD_CLIENT_SECRET,
    tokenUrl: 'https://oauth.battle.net/token'
  },

  database: {
    path: './data/guild-sync.db',
    options: {
      busyTimeout: 30000,
      journalMode: 'WAL',
      synchronous: 'NORMAL'
    }
  },

  healthCheck: {
    port: 3001,
    interval: 30000
  },

  logging: {
    level: 'info',
    maxFiles: 5,
    maxSize: '100m',
    logToFile: false,
    logPath: './logs'
  },

  service: {
    maxRetries: 3,
    backoffMultiplier: 1.5,
    maxBackoffMs: 300000,
    concurrency: 1,
    memoryLimit: '512m'
  }
};

function validateConfig() {
  const required = ['GUILD_NAME', 'GUILD_REALM', 'GUILD_REGION', 'BLIZZARD_CLIENT_ID', 'BLIZZARD_CLIENT_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required variables: ${missing.join(', ')}`);
  }
}

validateConfig();

module.exports = config;