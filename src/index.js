#!/usr/bin/env node

/**
 * 🏰 WoW Guild Sync
 * 
 * Simple WoW guild synchronization app
 * Just configure your region, server, and guild name
 */

const GuildSyncService = require('./services/GuildSyncService');
const HealthServer = require('./services/HealthServer');
const Logger = require('./utils/Logger');
const config = require('./config');

// Global error handlers
process.on('uncaughtException', (error) => {
  Logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown handler
function gracefulShutdown(signal) {
  Logger.info(`🛑 Received ${signal}, shutting down gracefully...`);
  
  // Stop the sync service
  if (guildSyncService) {
    guildSyncService.stop();
  }
  
  // Stop health server
  if (healthServer) {
    healthServer.stop();
  }
  
  // Give some time for cleanup
  setTimeout(() => {
    Logger.info('✅ Shutdown complete');
    process.exit(0);
  }, 2000);
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Main function
async function main() {
  try {
    Logger.info('🚀 Starting WoW Guild Sync');
    Logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    Logger.info(`🏰 Guild: ${config.guild.name} (${config.guild.realm}-${config.guild.region})`);
    if (config.webApi.baseUrl) {
      Logger.info(`🌐 Web API: ${config.webApi.baseUrl}`);
    }
    
    // Validate configuration
    if (!config.blizzard.clientId || !config.blizzard.clientSecret) {
      throw new Error('❌ Blizzard API credentials not configured');
    }
    
    // Start health server (for Docker health checks)
    global.healthServer = new HealthServer(config.healthCheck.port);
    await healthServer.start();
    
    // Initialize and start guild sync service
    global.guildSyncService = new GuildSyncService(config);
    await guildSyncService.start();
    
    Logger.info('✅ All services started successfully');
    Logger.info('🔄 Guild sync is now running autonomously...');
    
  } catch (error) {
    Logger.error('💥 Failed to start service:', error.message || error);
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Start the service
main();