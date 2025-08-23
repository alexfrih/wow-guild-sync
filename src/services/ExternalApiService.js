/**
 * 🌐 External API Service - Clean interface for all external WoW APIs
 */

const axios = require('axios');

class ExternalApiService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.blizzardToken = null;
  }

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================
  
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
      this.logger.info('✅ Blizzard API token obtained');
      return this.blizzardToken;
    } catch (error) {
      this.logger.error('❌ Failed to get Blizzard token:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // 1. GET MEMBERS
  // ============================================================================
  
  async getMembers(guildName, realm, region) {
    try {
      const token = await this.getBlizzardToken();
      const normalizedGuild = encodeURIComponent(guildName.toLowerCase().replace(/\s+/g, '-'));
      const normalizedRealm = encodeURIComponent(realm.toLowerCase());
      
      const url = `https://${region}.api.blizzard.com/data/wow/guild/${normalizedRealm}/${normalizedGuild}/roster?namespace=profile-${region}&locale=en_US`;
      
      this.logger.info(`🔍 Fetching guild roster: ${guildName} from ${realm}-${region}`);
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const members = response.data.members || [];
      this.logger.info(`✅ Found ${members.length} guild members`);
      
      return members.map(member => ({
        name: member.character.name,
        realm: member.character.realm.name,
        level: member.character.level,
        class: member.character.playable_class?.name || 'Unknown'
      }));
      
    } catch (error) {
      this.logger.error(`❌ Failed to get guild members: ${error.message}`);
      throw error;
    }
  }

  // ============================================================================
  // 2. GET MEMBER
  // ============================================================================
  
  async getMember(name, realm, region, source = 'raiderio') {
    this.logger.info(`📊 Fetching character data for ${name} using ${source.toUpperCase()}`);
    
    if (source === 'raiderio' || source === 'auto') {
      try {
        return await this.getMemberFromRaiderIO(name, realm, region);
      } catch (error) {
        if (source === 'auto') {
          this.logger.info(`⚠️ Raider.IO failed for ${name}, trying Blizzard API`);
          return await this.getMemberFromBlizzard(name, realm, region);
        }
        throw error;
      }
    }
    
    if (source === 'blizzard') {
      return await this.getMemberFromBlizzard(name, realm, region);
    }
    
    throw new Error(`Unknown source: ${source}. Use 'raiderio', 'blizzard', or 'auto'`);
  }

  // ============================================================================
  // RAIDER.IO IMPLEMENTATION
  // ============================================================================
  
  async getMemberFromRaiderIO(name, realm, region) {
    const url = `https://raider.io/api/v1/characters/profile?region=${region}&realm=${realm}&name=${encodeURIComponent(name)}&fields=gear,mythic_plus_scores_by_season:current`;
    
    const response = await axios.get(url);
    const data = response.data;
    
    // Extract data
    const characterClass = data.class || 'Unknown';
    const level = 80; // Raider.IO doesn't provide level, assume max
    const itemLevel = data.gear?.item_level_equipped || 0;
    
    let mythicPlusScore = 0;
    if (data.mythic_plus_scores_by_season && data.mythic_plus_scores_by_season.length > 0) {
      const currentSeason = data.mythic_plus_scores_by_season[0];
      mythicPlusScore = currentSeason.scores?.all || 0;
    }
    
    this.logger.debug(`📈 Raider.IO data for ${name}: iLvl ${itemLevel}, M+ ${mythicPlusScore}`);
    
    return {
      source: 'raiderio',
      character_class: characterClass,
      level: level,
      item_level: itemLevel,
      mythic_plus_score: mythicPlusScore,
      current_pvp_rating: 0, // Raider.IO doesn't have PvP data
      last_updated: new Date()
    };
  }

  // ============================================================================
  // BLIZZARD API IMPLEMENTATION
  // ============================================================================
  
  async getMemberFromBlizzard(name, realm, region) {
    const token = await this.getBlizzardToken();
    const normalizedRealm = encodeURIComponent(realm.toLowerCase());
    const normalizedName = encodeURIComponent(name.toLowerCase());
    const baseUrl = `https://${region}.api.blizzard.com/profile/wow/character/${normalizedRealm}/${normalizedName}`;
    
    // Get basic character info
    const characterResponse = await axios.get(`${baseUrl}?namespace=profile-${region}&locale=en_US`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const characterClass = characterResponse.data.character_class?.name || 'Unknown';
    const level = characterResponse.data.level || 0;
    const itemLevel = characterResponse.data.equipped_item_level || characterResponse.data.average_item_level || 0;
    
    // Get PvP ratings
    let currentPvpRating = 0;
    try {
      const characterClassName = characterResponse.data.character_class?.name?.toLowerCase() || '';
      const activeSpec = characterResponse.data.active_spec?.name?.toLowerCase() || '';
      
      const pvpBrackets = ['2v2', '3v3', 'rbg'];
      if (characterClassName && activeSpec) {
        pvpBrackets.push(`shuffle-${characterClassName}-${activeSpec}`);
      }
      
      const pvpPromises = pvpBrackets.map(async (bracket) => {
        try {
          const pvpResponse = await axios.get(`${baseUrl}/pvp-bracket/${bracket}?namespace=profile-${region}&locale=en_US`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          return pvpResponse.data.rating || 0;
        } catch {
          return 0;
        }
      });

      const ratings = await Promise.all(pvpPromises);
      currentPvpRating = Math.max(...ratings);
      
    } catch (pvpError) {
      this.logger.debug(`No PvP data for ${name}: ${pvpError.message}`);
    }
    
    this.logger.debug(`⚔️ Blizzard data for ${name}: iLvl ${itemLevel}, PvP ${currentPvpRating}`);
    
    return {
      source: 'blizzard',
      character_class: characterClass,
      level: level,
      item_level: itemLevel,
      mythic_plus_score: 0, // Blizzard doesn't provide M+ scores
      current_pvp_rating: currentPvpRating,
      last_updated: new Date()
    };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ExternalApiService;