const axios = require('axios');

class GuildDiscoveryService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    
    // WoW Class ID to Name mapping
    this.classMap = {
      1: 'Warrior', 2: 'Paladin', 3: 'Hunter', 4: 'Rogue', 5: 'Priest',
      6: 'Death Knight', 7: 'Shaman', 8: 'Mage', 9: 'Warlock', 10: 'Monk',
      11: 'Druid', 12: 'Demon Hunter', 13: 'Evoker'
    };
  }

  async getBlizzardToken() {
    const { clientId, clientSecret } = this.config.blizzard;
    const response = await axios.post('https://oauth.battle.net/token', 
      'grant_type=client_credentials',
      {
        auth: { username: clientId, password: clientSecret },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    return response.data.access_token;
  }

  async discoverGuildMembers() {
    try {
      const { name, realm, region } = this.config.guild;
      
      // Get Blizzard API token
      const token = await this.getBlizzardToken();
      
      // Use Blizzard API for guild roster (no more Raider.io!)
      const guildSlug = name.toLowerCase().replace(/\s+/g, '-');
      const realmSlug = realm.toLowerCase().replace(/\s+/g, '-');
      const url = `https://${region}.api.blizzard.com/data/wow/guild/${realmSlug}/${guildSlug}/roster?namespace=profile-${region}&locale=en_US`;
      
      this.logger.info(`Discovering guild members for ${name} on ${realm}-${region} via Blizzard API`);
      
      const response = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.data || !response.data.members) {
        throw new Error('No guild members found in Blizzard API response');
      }

      this.logger.info(`Found ${response.data.members.length} guild members`);
      
      return response.data.members.map(member => ({
        character_name: member.character.name,
        realm: member.character.realm?.slug || realm,
        class: this.classMap[member.character.playable_class?.id] || 'Unknown',
        level: member.character.level || 0,
        item_level: 0, // Will be updated by PlayerSyncService
        mythic_plus_score: 0 // Will be updated by PlayerSyncService
      }));
      
    } catch (error) {
      this.logger.error('Failed to discover guild members:', error.message);
      throw error;
    }
  }
}

module.exports = GuildDiscoveryService;