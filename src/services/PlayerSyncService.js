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
        // Get M+ scores from Raider.io (much faster and current season accurate)
        await this.sleep(200); // Minimal delay for Raider.io
        
        const raiderUrl = `https://raider.io/api/v1/characters/profile?region=${region}&realm=${realm}&name=${encodeURIComponent(name)}&fields=mythic_plus_scores_by_season:current`;
        
        const raiderResponse = await axios.get(raiderUrl);
        
        if (raiderResponse.data.mythic_plus_scores_by_season && raiderResponse.data.mythic_plus_scores_by_season.length > 0) {
          // Get current season score (should be season-tww-3)
          const currentSeasonScore = raiderResponse.data.mythic_plus_scores_by_season[0];
          mythicPlusScore = currentSeasonScore.scores?.all || 0;
          
          // Log season info for verification
          this.logger.debug(`M+ for ${name}: ${currentSeasonScore.season}, Score: ${mythicPlusScore}`);
        }
      } catch (mythicError) {
        // M+ data might not be available for all characters
        this.logger.debug(`No M+ data for ${name}: ${mythicError.message}`);
      }

      // Get current PvP ratings from Blizzard API (including Solo Shuffle)
      let currentPvpRating = 0;
      let pvpSource = '';
      try {
        await this.sleep(300); // Small delay between API calls
        
        // Get character spec for Solo Shuffle
        const characterClass = characterResponse.data.character_class?.name?.toLowerCase() || '';
        const activeSpec = characterResponse.data.active_spec?.name?.toLowerCase() || '';
        
        // Prepare PvP brackets including spec-specific Solo Shuffle
        const pvpBrackets = ['2v2', '3v3', 'rbg'];
        if (characterClass && activeSpec) {
          pvpBrackets.push(`shuffle-${characterClass}-${activeSpec}`);
        }
        
        const pvpPromises = pvpBrackets.map(async (bracket) => {
          try {
            const pvpResponse = await axios.get(`${baseUrl}/pvp-bracket/${bracket}?namespace=profile-${region}&locale=en_US`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            return { bracket, rating: pvpResponse.data.rating || 0 };
          } catch {
            return { bracket, rating: 0 };
          }
        });

        const results = await Promise.all(pvpPromises);
        const bestResult = results.reduce((best, current) => 
          current.rating > best.rating ? current : best, { bracket: '', rating: 0 });
        
        currentPvpRating = bestResult.rating;
        pvpSource = bestResult.bracket;
        
        if (currentPvpRating > 0) {
          this.logger.debug(`PvP for ${name}: ${pvpSource} = ${currentPvpRating}`);
        }
      } catch (pvpError) {
        this.logger.debug(`No PvP data for ${name}: ${pvpError.message}`);
      }
      
      return {
        character_class: characterResponse.data.character_class?.name || 'Unknown',
        level: characterResponse.data.level || 0,
        item_level: characterResponse.data.equipped_item_level || characterResponse.data.average_item_level || 0,
        mythic_plus_score: mythicPlusScore,
        current_pvp_rating: currentPvpRating,
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