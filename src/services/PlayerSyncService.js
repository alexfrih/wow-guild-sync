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
        // Get mythic+ data with additional rate limiting
        await this.sleep(1000);
        const mythicResponse = await axios.get(`${baseUrl}/mythic-keystone-profile?namespace=profile-${region}&locale=en_US`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        mythicPlusScore = Math.round(mythicResponse.data.current_mythic_rating?.rating || 0);
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
      
      // Rate limiting between batches
      if (i + batchSize < players.length) {
        await this.sleep(this.config.guild.rateLimit.blizzard);
      }
    }
    
    return results;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = PlayerSyncService;