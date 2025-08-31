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
    const url = `https://raider.io/api/v1/characters/profile?region=${region}&realm=${realm}&name=${encodeURIComponent(name)}&fields=gear,mythic_plus_scores_by_season:current,raid_progression`;
    
    const response = await axios.get(url);
    const data = response.data;
    
    // Extract data
    const characterClass = data.class || 'Unknown';
    const level = 80; // Raider.IO doesn't provide level, assume max
    const itemLevel = data.gear?.item_level_equipped || 0;
    
    let mythicPlusScore = 0;
    let currentSaison = null;
    if (data.mythic_plus_scores_by_season && data.mythic_plus_scores_by_season.length > 0) {
      const currentSeason = data.mythic_plus_scores_by_season[0];
      mythicPlusScore = currentSeason.scores?.all || 0;
      currentSaison = currentSeason.season || null;
      this.logger.info(`🎯 Found M+ score for ${name}: ${mythicPlusScore} (Season: ${currentSaison || 'current'})`);
    } else {
      this.logger.warn(`⚠️ No M+ season data found for ${name}`);
    }
    
    // Extract raid progression from PR
    let raidProgress = null;
    if (data.raid_progression) {
      const progressData = this.formatRaidProgression(data.raid_progression);
      raidProgress = progressData.currentRaid ? progressData.currentRaid.progress : null; // Just store the progress part (e.g., "4/8 H")
      this.logger.info(`🏰 Found raid progress for ${name}: ${raidProgress}`);
    }
    
    // Get additional data from Blizzard API (achievements and PvP)
    let achievementPoints = 0;
    let pvp2v2Rating = 0;
    let pvp3v3Rating = 0;
    let pvpRbgRating = 0;
    let soloShuffleRating = 0;
    let maxSoloShuffleRating = 0;
    let rbgShuffleRating = 0;
    
    try {
      const blizzardData = await this.getBlizzardAchievementsAndPvP(name, realm, region, characterClass);
      achievementPoints = blizzardData.achievement_points;
      pvp2v2Rating = blizzardData.pvp_2v2_rating;
      pvp3v3Rating = blizzardData.pvp_3v3_rating;
      pvpRbgRating = blizzardData.pvp_rbg_rating;
      soloShuffleRating = blizzardData.solo_shuffle_rating;
      maxSoloShuffleRating = blizzardData.max_solo_shuffle_rating;
      rbgShuffleRating = blizzardData.rbg_shuffle_rating || 0;
    } catch (blizzardError) {
      this.logger.debug(`Could not fetch Blizzard data for ${name}: ${blizzardError.message}`);
    }
    
    this.logger.info(`📈 RaiderIO + Blizzard data for ${name}: iLvl ${itemLevel}, M+ ${mythicPlusScore}${raidProgress ? `, Raids: ${raidProgress}` : ''}, PvP(2v2:${pvp2v2Rating}/3v3:${pvp3v3Rating}/RBG:${pvpRbgRating}), Solo:${soloShuffleRating}, Achievements:${achievementPoints}`);
    
    
    return {
      source: 'raiderio+blizzard',
      character_class: characterClass,
      level: level,
      item_level: itemLevel,
      mythic_plus_score: mythicPlusScore,
      current_saison: currentSaison,
      current_pvp_rating: Math.max(pvp2v2Rating, pvp3v3Rating, pvpRbgRating), // Backward compatibility
      raid_progress: raidProgress,
      pvp_2v2_rating: pvp2v2Rating,
      pvp_3v3_rating: pvp3v3Rating,
      pvp_rbg_rating: pvpRbgRating,
      solo_shuffle_rating: soloShuffleRating,
      max_solo_shuffle_rating: maxSoloShuffleRating,
      rbg_shuffle_rating: rbgShuffleRating,
      achievement_points: achievementPoints,
      last_updated: new Date()
    };
  }

  // ============================================================================
  // BLIZZARD API HELPER METHODS
  // ============================================================================
  
  async getBlizzardAchievementsAndPvP(name, realm, region, characterClass) {
    const token = await this.getBlizzardToken();
    const normalizedRealm = encodeURIComponent(realm.toLowerCase());
    const normalizedName = encodeURIComponent(name.toLowerCase());
    const baseUrl = `https://${region}.api.blizzard.com/profile/wow/character/${normalizedRealm}/${normalizedName}`;
    
    let achievementPoints = 0;
    let pvp2v2Rating = 0;
    let pvp3v3Rating = 0;
    let pvpRbgRating = 0;
    let soloShuffleRating = 0;
    let maxSoloShuffleRating = 0;
    let rbgShuffleRating = 0;
    
    // Get achievement points
    try {
      const achievementsResponse = await axios.get(`${baseUrl}/achievements?namespace=profile-${region}&locale=en_US`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      achievementPoints = achievementsResponse.data.total_points || 0;
      this.logger.debug(`🏆 Achievement points for ${name}: ${achievementPoints}`);
    } catch (achievementError) {
      this.logger.debug(`No achievement data for ${name}: ${achievementError.message}`);
    }
    
    // Get character profile for spec info (needed for Solo Shuffle)
    let activeSpec = '';
    try {
      const characterResponse = await axios.get(`${baseUrl}?namespace=profile-${region}&locale=en_US`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      activeSpec = characterResponse.data.active_spec?.name?.toLowerCase() || '';
    } catch (specError) {
      this.logger.debug(`Could not get spec for ${name}: ${specError.message}`);
    }
    
    // Get PvP ratings (individual brackets)
    try {
      const characterClassName = characterClass.toLowerCase().replace(/\s+/g, '');
      const soloShuffleBracket = `shuffle-${characterClassName}-${activeSpec}`;
      
      // Get each PvP bracket individually
      try {
        const pvp2v2Response = await axios.get(`${baseUrl}/pvp-bracket/2v2?namespace=profile-${region}&locale=en_US`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        pvp2v2Rating = pvp2v2Response.data.rating || 0;
      } catch { pvp2v2Rating = 0; }
      
      try {
        const pvp3v3Response = await axios.get(`${baseUrl}/pvp-bracket/3v3?namespace=profile-${region}&locale=en_US`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        pvp3v3Rating = pvp3v3Response.data.rating || 0;
      } catch { pvp3v3Rating = 0; }
      
      try {
        const pvpRbgResponse = await axios.get(`${baseUrl}/pvp-bracket/rbg?namespace=profile-${region}&locale=en_US`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        pvpRbgRating = pvpRbgResponse.data.rating || 0;
      } catch { pvpRbgRating = 0; }
      
      // Get Solo Shuffle and RBG Blitz ratings by checking PvP summary
      try {
        const pvpSummaryResponse = await axios.get(`${baseUrl}/pvp-summary?namespace=profile-${region}&locale=en_US`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const brackets = pvpSummaryResponse.data.brackets || [];
        
        // Find Solo Shuffle brackets (shuffle-*)
        const shuffleBrackets = brackets.filter(bracket => 
          bracket.href.includes('/pvp-bracket/shuffle-')
        );
        
        // Find RBG Blitz brackets (blitz-*)
        const blitzBrackets = brackets.filter(bracket => 
          bracket.href.includes('/pvp-bracket/blitz-')
        );
        
        // Process Solo Shuffle brackets
        if (shuffleBrackets.length > 0) {
          let highestRating = 0;
          let highestMaxRating = 0;
          
          for (const bracket of shuffleBrackets) {
            try {
              const shuffleResponse = await axios.get(`${bracket.href}&locale=en_US`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              const rating = shuffleResponse.data.rating || 0;
              const maxRating = shuffleResponse.data.season_best_rating || rating;
              
              if (rating > highestRating) {
                highestRating = rating;
                highestMaxRating = maxRating;
              }
              
              this.logger.debug(`🥇 Found Solo Shuffle bracket: ${bracket.href.split('/').pop()} - Rating: ${rating} (best: ${maxRating})`);
            } catch (bracketError) {
              this.logger.debug(`Failed to fetch shuffle bracket ${bracket.href}: ${bracketError.message}`);
            }
          }
          
          soloShuffleRating = highestRating;
          maxSoloShuffleRating = highestMaxRating;
          this.logger.debug(`🥇 Best Solo Shuffle for ${name}: ${soloShuffleRating} (best: ${maxSoloShuffleRating})`);
        } else {
          this.logger.debug(`No Solo Shuffle brackets found for ${name}`);
        }
        
        // Process RBG Blitz brackets
        if (blitzBrackets.length > 0) {
          let highestBlitzRating = 0;
          
          for (const bracket of blitzBrackets) {
            try {
              const blitzResponse = await axios.get(`${bracket.href}&locale=en_US`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              const rating = blitzResponse.data.rating || 0;
              
              if (rating > highestBlitzRating) {
                highestBlitzRating = rating;
              }
              
              this.logger.debug(`⚡ Found RBG Blitz bracket: ${bracket.href.split('/').pop()} - Rating: ${rating}`);
            } catch (bracketError) {
              this.logger.debug(`Failed to fetch blitz bracket ${bracket.href}: ${bracketError.message}`);
            }
          }
          
          rbgShuffleRating = highestBlitzRating;
          this.logger.debug(`⚡ Best RBG Blitz for ${name}: ${rbgShuffleRating}`);
        } else {
          this.logger.debug(`No RBG Blitz brackets found for ${name}`);
        }
        
      } catch (summaryError) {
        this.logger.debug(`Could not get PvP summary for ${name}: ${summaryError.message}`);
      }
    } catch (pvpError) {
      this.logger.debug(`No PvP data for ${name}: ${pvpError.message}`);
    }
    
    this.logger.debug(`🏆 PvP brackets for ${name}: 2v2=${pvp2v2Rating}, 3v3=${pvp3v3Rating}, RBG=${pvpRbgRating}, Solo=${soloShuffleRating}, RBG Blitz=${rbgShuffleRating}`);
    
    return {
      achievement_points: achievementPoints,
      pvp_2v2_rating: pvp2v2Rating,
      pvp_3v3_rating: pvp3v3Rating,
      pvp_rbg_rating: pvpRbgRating,
      solo_shuffle_rating: soloShuffleRating,
      max_solo_shuffle_rating: maxSoloShuffleRating,
      rbg_shuffle_rating: rbgShuffleRating
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
    
    // Get achievement points
    let achievementPoints = 0;
    try {
      // Extract base URL for achievements query (remove query parameters)
      const baseUrl = characterUrl.split('?')[0];
      const achievementsResponse = await axios.get(`${baseUrl}/achievements?namespace=profile-${region}&locale=en_US`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      achievementPoints = achievementsResponse.data.total_points || 0;
      this.logger.debug(`🏆 Achievement points for ${name}: ${achievementPoints}`);
    } catch (achievementError) {
      this.logger.debug(`No achievement data for ${name}: ${achievementError.message}`);
    }
    
    // Get PvP ratings including individual brackets and Solo Shuffle
    let currentPvpRating = 0;
    let pvp2v2Rating = 0;
    let pvp3v3Rating = 0;
    let pvpRbgRating = 0;
    let soloShuffleRating = 0;
    let maxSoloShuffleRating = 0;
    
    try {
      const characterClassName = characterResponse.data.character_class?.name?.toLowerCase() || '';
      const activeSpec = characterResponse.data.active_spec?.name?.toLowerCase() || '';
      
      // Extract base URL for PvP queries (remove query parameters)
      const baseUrl = characterUrl.split('?')[0];
      
      // Get each PvP bracket individually
      try {
        const pvp2v2Response = await axios.get(`${baseUrl}/pvp-bracket/2v2?namespace=profile-${region}&locale=en_US`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        pvp2v2Rating = pvp2v2Response.data.rating || 0;
      } catch { pvp2v2Rating = 0; }
      
      try {
        const pvp3v3Response = await axios.get(`${baseUrl}/pvp-bracket/3v3?namespace=profile-${region}&locale=en_US`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        pvp3v3Rating = pvp3v3Response.data.rating || 0;
      } catch { pvp3v3Rating = 0; }
      
      try {
        const pvpRbgResponse = await axios.get(`${baseUrl}/pvp-bracket/rbg?namespace=profile-${region}&locale=en_US`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        pvpRbgRating = pvpRbgResponse.data.rating || 0;
      } catch { pvpRbgRating = 0; }

      currentPvpRating = Math.max(pvp2v2Rating, pvp3v3Rating, pvpRbgRating);
      
      // Get Solo Shuffle rating by checking PvP summary for all shuffle brackets
      try {
        const pvpSummaryResponse = await axios.get(`${baseUrl}/pvp-summary?namespace=profile-${region}&locale=en_US`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const brackets = pvpSummaryResponse.data.brackets || [];
        const shuffleBrackets = brackets.filter(bracket => 
          bracket.href.includes('/pvp-bracket/shuffle-')
        );
        
        if (shuffleBrackets.length > 0) {
          let highestRating = 0;
          let highestMaxRating = 0;
          
          // Check all shuffle brackets to find highest rating
          for (const bracket of shuffleBrackets) {
            try {
              const shuffleResponse = await axios.get(`${bracket.href}&locale=en_US`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              const rating = shuffleResponse.data.rating || 0;
              const maxRating = shuffleResponse.data.season_best_rating || rating;
              
              if (rating > highestRating) {
                highestRating = rating;
                highestMaxRating = maxRating;
              }
              
              this.logger.debug(`🥇 Found Solo Shuffle bracket: ${bracket.href.split('/').pop()} - Rating: ${rating} (best: ${maxRating})`);
            } catch (bracketError) {
              this.logger.debug(`Failed to fetch shuffle bracket ${bracket.href}: ${bracketError.message}`);
            }
          }
          
          soloShuffleRating = highestRating;
          maxSoloShuffleRating = highestMaxRating;
          this.logger.debug(`🥇 Best Solo Shuffle for ${name}: ${soloShuffleRating} (best: ${maxSoloShuffleRating})`);
        } else {
          this.logger.debug(`No Solo Shuffle brackets found for ${name}`);
        }
      } catch (summaryError) {
        this.logger.debug(`Could not get PvP summary for ${name}: ${summaryError.message}`);
      }
      
    } catch (pvpError) {
      this.logger.debug(`No PvP data for ${name}: ${pvpError.message}`);
    }
    
    this.logger.debug(`⚔️ Blizzard data for ${name}: iLvl ${itemLevel}, PvP ${currentPvpRating}, Achievements ${achievementPoints}, Solo Shuffle ${soloShuffleRating}/${maxSoloShuffleRating}`);
    
    return {
      source: 'blizzard',
      character_class: characterClass,
      level: level,
      item_level: itemLevel,
      mythic_plus_score: 0, // Blizzard doesn't provide M+ scores
      current_saison: null, // Blizzard doesn't provide M+ season data
      current_pvp_rating: currentPvpRating,
      raid_progress: null, // Blizzard API doesn't provide easy raid progression data
      pvp_2v2_rating: pvp2v2Rating,
      pvp_3v3_rating: pvp3v3Rating,
      pvp_rbg_rating: pvpRbgRating,
      achievement_points: achievementPoints,
      solo_shuffle_rating: soloShuffleRating,
      max_solo_shuffle_rating: maxSoloShuffleRating,
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
        if (daysSince <= 30) {
          activityStatus = 'active';
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
          activity_status: 'inactive',
          days_since_login: null
        };
      }
      
    } catch (error) {
      if (error.response?.status === 404) {
        return {
          last_login_timestamp: null,
          activity_status: 'inactive',
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
  
  formatRaidProgression(raidProgression) {
    const raids = Object.entries(raidProgression);
    const allRaids = [];
    
    // Current raid priority (most recent/important)
    const raidPriority = ['manaforge-omega', 'liberation-of-undermine', 'nerubar-palace', 'blackrock-depths'];
    
    // Process each raid and extract meaningful progress
    for (const [raidKey, raidData] of raids) {
      if (raidData.total_bosses > 0) {
        const raidName = this.formatRaidName(raidKey);
        let progress = '';
        
        // Build progress summary (prioritize highest difficulty with kills)
        if (raidData.mythic_bosses_killed > 0) {
          progress = `${raidData.mythic_bosses_killed}/${raidData.total_bosses} M`;
        } else if (raidData.heroic_bosses_killed > 0) {
          progress = `${raidData.heroic_bosses_killed}/${raidData.total_bosses} H`;
        } else if (raidData.normal_bosses_killed > 0) {
          progress = `${raidData.normal_bosses_killed}/${raidData.total_bosses} N`;
        }
        
        // Always include raids, even with 0 progress if they're current content
        const priority = raidPriority.indexOf(raidKey);
        if (progress || priority === 0) { // Include if has progress OR if it's the current raid (priority 0)
          if (!progress) {
            progress = `0/${raidData.total_bosses}`;
          }
          allRaids.push({
            key: raidKey,
            name: raidName,
            progress: progress,
            normal: raidData.normal_bosses_killed,
            heroic: raidData.heroic_bosses_killed,
            mythic: raidData.mythic_bosses_killed,
            total: raidData.total_bosses,
            priority: priority
          });
        }
      }
    }
    
    // Sort by priority (current raid first)
    allRaids.sort((a, b) => {
      if (a.priority === -1 && b.priority === -1) return 0;
      if (a.priority === -1) return 1;
      if (b.priority === -1) return -1;
      return a.priority - b.priority;
    });
    
    // Get current raid progress (highest priority with progress)
    const currentRaid = allRaids.length > 0 ? allRaids[0] : null;
    const summary = currentRaid ? `${currentRaid.name}: ${currentRaid.progress}` : 'No progress';
    
    return {
      raids: allRaids,
      currentRaid: currentRaid,
      summary: summary
    };
  }
  
  formatRaidName(raidKey) {
    const raidNames = {
      'nerubar-palace': 'Nerub-ar Palace',
      'liberation-of-undermine': 'Liberation of Undermine',
      'manaforge-omega': 'Manaforge Omega',
      'blackrock-depths': 'Blackrock Depths'
    };
    return raidNames[raidKey] || raidKey.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

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