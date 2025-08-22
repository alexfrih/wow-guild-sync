const axios = require('axios');

class PlayerSyncService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.blizzardToken = null;
  }

  async getBlizzardToken() {
    if (this.blizzardToken) {
      return this.blizzardToken;
    }

    try {
      const response = await axios.post(this.config.blizzard.tokenUrl, 
        'grant_type=client_credentials',
        {
          auth: {
            username: this.config.blizzard.clientId,
            password: this.config.blizzard.clientSecret
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.blizzardToken = response.data.access_token;
      this.logger.info('Successfully obtained Blizzard API token');
      return this.blizzardToken;
    } catch (error) {
      this.logger.error('Failed to get Blizzard token:', error.message);
      throw error;
    }
  }

  async syncWowData({ name, realm, region }) {
    try {
      // Rate limiting
      if (this.config?.guild?.rateLimit?.blizzard) {
        await this.sleep(this.config.guild.rateLimit.blizzard);
      }
      
      const token = await this.getBlizzardToken();
      const normalizedRealm = encodeURIComponent(realm.toLowerCase());
      const normalizedName = encodeURIComponent(name.toLowerCase());
      const baseUrl = `https://${region}.api.blizzard.com/profile/wow/character/${normalizedRealm}/${normalizedName}`;
      
      this.logger.info(`Syncing WoW data for: ${name} from ${realm}-${region}`);
      
      // Get basic character info
      const characterResponse = await axios.get(`${baseUrl}?namespace=profile-${region}&locale=en_US`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      let mythicPlusScore = 0;
      
      try {
        // Cache current season ID globally to avoid repeated API calls
        if (!global.currentMythicSeasonId) {
          const currentSeasonResponse = await axios.get(`https://${region}.api.blizzard.com/data/wow/mythic-keystone/season/index?namespace=dynamic-${region}&locale=en_US`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          global.currentMythicSeasonId = currentSeasonResponse.data.current_season?.id || 15;
          this.logger.info(`Cached current M+ season: ${global.currentMythicSeasonId}`);
        }
        
        // Get mythic+ data with minimal rate limiting  
        await this.sleep(500); // Reduced from 1000ms
        
        // Try current season directly (Season 15 hardcoded for performance)
        try {
          const currentSeasonResponse = await axios.get(`${baseUrl}/mythic-keystone-profile/season/15?namespace=profile-${region}&locale=en_US`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          // Calculate total rating from best runs in current season
          const bestRuns = currentSeasonResponse.data.best_runs || [];
          if (bestRuns.length > 0) {
            const totalRating = bestRuns.reduce((sum, run) => sum + (run.map_rating?.rating || 0), 0);
            mythicPlusScore = Math.round(totalRating);
          }
        } catch (currentSeasonError) {
          // Fallback to overall profile for inactive players
          const mythicResponse = await axios.get(`${baseUrl}/mythic-keystone-profile?namespace=profile-${region}&locale=en_US`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          // Check if current_mythic_rating is from current season, otherwise use 0
          const currentRating = mythicResponse.data.current_mythic_rating?.rating || 0;
          // If rating is very high (2000+), it's likely old season data, reset to 0
          mythicPlusScore = currentRating > 2000 ? 0 : Math.round(currentRating);
        }
      } catch (mythicError) {
        // M+ data might not be available for all characters
        this.logger.debug(`No M+ data for ${name}: ${mythicError.message}`);
      }
      
      return {
        character_class: characterResponse.data.character_class?.name || 'Unknown',
        level: characterResponse.data.level || 0,
        item_level: characterResponse.data.equipped_item_level || characterResponse.data.average_item_level || 0,
        mythic_plus_score: mythicPlusScore,
        last_updated: new Date()
      };
      
    } catch (error) {
      this.logger.error(`Failed to sync WoW data for ${name}:`, error.message || error);
      if (error.response) {
        this.logger.error(`API Response: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
  
  async syncPlayer(characterName, realm, region) {
    try {
      const data = await this.syncWowData({ name: characterName, realm, region });
      return {
        character_name: characterName,
        realm: realm,
        ...data,
        is_active: 1
      };
    } catch (error) {
      this.logger.error(`Failed to sync player ${characterName}:`, error.message);
      return null;
    }
  }

  async syncPlayers(players) {
    const results = [];
    const { batchSize } = this.config.guild.rateLimit;
    
    for (let i = 0; i < players.length; i += batchSize) {
      const batch = players.slice(i, i + batchSize);
      this.logger.info(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(players.length/batchSize)}`);
      
      const batchPromises = batch.map(player => 
        this.syncPlayer(player.character_name, player.realm, this.config.guild.region)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(r => r.value).filter(Boolean));
      
      // Faster rate limiting between batches
      if (i + batchSize < players.length) {
        await this.sleep(5000); // 5 seconds instead of 1.5 seconds
      }
    }
    
    return results;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = PlayerSyncService;