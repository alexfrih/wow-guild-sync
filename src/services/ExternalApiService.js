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
  // 1. GET GUILD ROSTER FROM BLIZZARD API
  // 
  // API: Guild Roster (Blizzard Battle.net API)
  // WARNING: Official documentation links are currently not accessible
  // Endpoint: https://{region}.api.blizzard.com/data/wow/guild/{realmSlug}/{nameSlug}/roster
  // Namespace: profile-{region}
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
      
      // Debug: Log first member structure to understand API response
      if (members.length > 0) {
        this.logger.info(`🔍 Sample member structure: ${JSON.stringify(members[0], null, 2)}`);
      }
      
      return members.map(member => ({
        name: member.character.name,
        realm: member.character.realm?.slug || realm, // Use slug for realm name
        level: member.character.level,
        class: this.getClassNameFromId(member.character.playable_class?.id) || 'Unknown',
        character_api_url: member.character.key?.href // CRITICAL: Store Blizzard's provided API URL
      }));
      
    } catch (error) {
      this.logger.error(`❌ Failed to get guild members: ${error.message}`);
      throw error;
    }
  }

  // ============================================================================
  // 2. GET CHARACTER DATA FROM RAIDER.IO OR BLIZZARD API
  // 
  // API 1: Character Profile (Raider.IO API)  
  // WARNING: Official documentation not accessible via search
  // Endpoint: https://raider.io/api/v1/characters/profile
  // 
  // API 2: Character Profile (Blizzard Battle.net API)
  // WARNING: Official documentation links are currently not accessible  
  // Endpoint: https://{region}.api.blizzard.com/profile/wow/character/{realmSlug}/{characterName}
  // ============================================================================
  
  async getMember(name, realm, region, source = 'raiderio', characterApiUrl = null) {
    this.logger.info(`📊 Fetching character data for ${name} using ${source.toUpperCase()}`);
    
    if (source === 'raiderio' || source === 'auto') {
      try {
        return await this.getMemberFromRaiderIO(name, realm, region);
      } catch (error) {
        if (source === 'auto') {
          this.logger.info(`⚠️ Raider.IO failed for ${name}, trying Blizzard API`);
          return await this.getMemberFromBlizzard(name, realm, region, characterApiUrl);
        }
        throw error;
      }
    }
    
    if (source === 'blizzard') {
      return await this.getMemberFromBlizzard(name, realm, region, characterApiUrl);
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
      this.logger.info(`🎯 Found M+ score for ${name}: ${mythicPlusScore} (Season: ${currentSeason.season || 'current'})`);
    } else {
      this.logger.warn(`⚠️ No M+ season data found for ${name}`);
    }
    
    this.logger.info(`📈 Raider.IO data for ${name}: iLvl ${itemLevel}, M+ ${mythicPlusScore}`);
    
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
  
  async getMemberFromBlizzard(name, realm, region, characterApiUrl = null) {
    const token = await this.getBlizzardToken();
    
    // Use provided API URL if available, otherwise fall back to manual construction
    let characterUrl;
    if (characterApiUrl) {
      characterUrl = characterApiUrl + '&locale=en_US';
      this.logger.debug(`🔗 Using provided API URL: ${characterUrl}`);
    } else {
      const normalizedRealm = encodeURIComponent(realm.toLowerCase());
      const normalizedName = encodeURIComponent(name.toLowerCase());
      characterUrl = `https://${region}.api.blizzard.com/profile/wow/character/${normalizedRealm}/${normalizedName}?namespace=profile-${region}&locale=en_US`;
      this.logger.debug(`🔧 Using manual URL construction: ${characterUrl}`);
    }
    
    // Get basic character info
    const characterResponse = await axios.get(characterUrl, {
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
      
      // Extract base URL for PvP queries (remove query parameters)
      const baseUrl = characterUrl.split('?')[0];
      
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
  // ACTIVITY CHECKING METHODS
  // ============================================================================
  
  async getLastLoginTimestamp(name, realm, region) {
    try {
      const token = await this.getBlizzardToken();
      const normalizedRealm = encodeURIComponent(realm.toLowerCase());
      const normalizedName = encodeURIComponent(name.toLowerCase());
      const url = `https://${region}.api.blizzard.com/profile/wow/character/${normalizedRealm}/${normalizedName}?namespace=profile-${region}&locale=en_US`;
      
      const axios = require('axios');
      const response = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 10000
      });
      
      const data = response.data;
      if (data.last_login_timestamp) {
        const lastLogin = new Date(data.last_login_timestamp);
        const now = new Date();
        const daysSince = Math.floor((now - lastLogin) / (1000 * 60 * 60 * 24));
        
        let activityStatus;
        if (daysSince <= 7) {
          activityStatus = 'active';
        } else if (daysSince <= 30) {
          activityStatus = 'casual';
        } else {
          activityStatus = 'inactive';
        }
        
        return {
          last_login_timestamp: data.last_login_timestamp,
          activity_status: activityStatus,
          days_since_login: daysSince
        };
      } else {
        return {
          last_login_timestamp: null,
          activity_status: 'unknown',
          days_since_login: null
        };
      }
      
    } catch (error) {
      if (error.response?.status === 404) {
        return {
          last_login_timestamp: null,
          activity_status: 'unknown',
          days_since_login: null,
          error: 'character_not_found'
        };
      }
      throw error;
    }
  }

  async bulkCheckActivity(characters, region) {
    const results = [];
    const token = await this.getBlizzardToken();
    
    this.logger.info(`🔍 Starting bulk activity check for ${characters.length} characters`);
    
    for (let i = 0; i < characters.length; i++) {
      const char = characters[i];
      try {
        this.logger.info(`📊 [${i+1}/${characters.length}] Checking activity for ${char.name} (${char.realm})`);
        
        const activityData = await this.getLastLoginTimestamp(char.name, char.realm, region);
        
        // Log the result for each character
        const status = activityData.activity_status;
        const days = activityData.days_since_login;
        this.logger.info(`✅ ${char.name}: ${status}${days !== null ? ` (${days} days ago)` : ''}`);
        
        results.push({
          character_name: char.name,
          realm: char.realm,
          activityData: activityData
        });
        
      } catch (error) {
        this.logger.error(`❌ Failed to check activity for ${char.name}: ${error.message}`);
        results.push({
          character_name: char.name,
          realm: char.realm,
          activityData: {
            last_login_timestamp: null,
            activity_status: 'unknown',
            days_since_login: null,
            error: error.message
          }
        });
      }
      
      // Small delay to avoid rate limiting
      if (i < characters.length - 1) {
        await this.sleep(200);
      }
    }
    
    this.logger.info(`✅ Bulk activity check completed: ${results.length} characters processed`);
    return results;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================
  
  getClassNameFromId(classId) {
    const classMap = {
      1: 'Warrior',
      2: 'Paladin',
      3: 'Hunter',
      4: 'Rogue',
      5: 'Priest',
      6: 'Death Knight',
      7: 'Shaman',
      8: 'Mage',
      9: 'Warlock',
      10: 'Monk',
      11: 'Druid',
      12: 'Demon Hunter',
      13: 'Evoker'
    };
    return classMap[classId] || null;
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ExternalApiService;