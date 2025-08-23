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
      // Rate limiting for Raider.IO (primary data source)
      if (this.config?.guild?.rateLimit?.raiderIO) {
        await this.sleep(this.config.guild.rateLimit.raiderIO);
      }
      
      this.logger.info(`Syncing WoW data for: ${name} from ${realm}-${region}`);
      
      let characterClass = 'Unknown';
      let level = 0;
      let itemLevel = 0;
      let mythicPlusScore = 0;
      
      try {
        // Get ALL data from Raider.io (item level, class, level, M+ score)
        const raiderUrl = `https://raider.io/api/v1/characters/profile?region=${region}&realm=${realm}&name=${encodeURIComponent(name)}&fields=gear,mythic_plus_scores_by_season:current`;
        
        const raiderResponse = await axios.get(raiderUrl);
        const data = raiderResponse.data;
        
        // Extract character info
        characterClass = data.class || 'Unknown';
        level = 80; // Raider.IO doesn't provide level, assume max for indexed characters
        
        // Get item level from gear field
        if (data.gear && data.gear.item_level_equipped) {
          itemLevel = data.gear.item_level_equipped;
          this.logger.debug(`Item level for ${name}: ${itemLevel}`);
        }
        
        // Get M+ score
        if (data.mythic_plus_scores_by_season && data.mythic_plus_scores_by_season.length > 0) {
          const currentSeasonScore = data.mythic_plus_scores_by_season[0];
          mythicPlusScore = currentSeasonScore.scores?.all || 0;
          this.logger.debug(`M+ for ${name}: ${currentSeasonScore.season}, Score: ${mythicPlusScore}`);
        }
        
        this.logger.info(`✅ Raider.IO success for ${name}: iLvl ${itemLevel}, M+ ${mythicPlusScore}`);
      } catch (raiderError) {
        // If Raider.IO fails, fallback to Blizzard API for basic data
        this.logger.info(`Raider.IO failed for ${name}, falling back to Blizzard API: ${raiderError.message}`);
        
        // Rate limiting for Blizzard
        if (this.config?.guild?.rateLimit?.blizzard) {
          await this.sleep(this.config.guild.rateLimit.blizzard);
        }
        
        const token = await this.getBlizzardToken();
        const normalizedRealm = encodeURIComponent(realm.toLowerCase());
        const normalizedName = encodeURIComponent(name.toLowerCase());
        const baseUrl = `https://${region}.api.blizzard.com/profile/wow/character/${normalizedRealm}/${normalizedName}`;
        
        const characterResponse = await axios.get(`${baseUrl}?namespace=profile-${region}&locale=en_US`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        characterClass = characterResponse.data.character_class?.name || 'Unknown';
        level = characterResponse.data.level || 0;
        itemLevel = characterResponse.data.equipped_item_level || characterResponse.data.average_item_level || 0;
      }

      // Get current PvP ratings from Blizzard API (Solo Shuffle only available here)
      let currentPvpRating = 0;
      let pvpSource = '';
      
      // Only fetch PvP if we have a Blizzard token (for Solo Shuffle)
      if (this.blizzardToken) {
        try {
          await this.sleep(300); // Small delay between API calls
          
          const token = await this.getBlizzardToken();
          const normalizedRealm = encodeURIComponent(realm.toLowerCase());
          const normalizedName = encodeURIComponent(name.toLowerCase());
          const baseUrl = `https://${region}.api.blizzard.com/profile/wow/character/${normalizedRealm}/${normalizedName}`;
          
          // Get character spec for Solo Shuffle
          const specResponse = await axios.get(`${baseUrl}?namespace=profile-${region}&locale=en_US`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          const characterClassName = specResponse.data.character_class?.name?.toLowerCase() || '';
          const activeSpec = specResponse.data.active_spec?.name?.toLowerCase() || '';
          
          // Prepare PvP brackets including spec-specific Solo Shuffle
          const pvpBrackets = ['2v2', '3v3', 'rbg'];
          if (characterClassName && activeSpec) {
            pvpBrackets.push(`shuffle-${characterClassName}-${activeSpec}`);
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
      }
      
      return {
        character_class: characterClass,
        level: level,
        item_level: itemLevel,
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