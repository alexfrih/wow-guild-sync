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

  async syncPlayer(characterName, realm, region) {
    try {
      await this.sleep(this.config.guild.rateLimit.blizzard);
      
      const token = await this.getBlizzardToken();
      const url = `https://${region}.api.blizzard.com/profile/wow/character/${realm}/${characterName.toLowerCase()}?namespace=profile-${region}&locale=en_US&access_token=${token}`;
      
      this.logger.info(`Syncing player: ${characterName} from ${realm}-${region}`);
      
      const response = await axios.get(url);
      
      return {
        character_name: characterName,
        realm: realm,
        class: response.data.character_class?.name || 'Unknown',
        level: response.data.level || 0,
        item_level: response.data.item_level || 0,
        last_updated: new Date(),
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