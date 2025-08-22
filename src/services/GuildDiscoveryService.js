const axios = require('axios');

class GuildDiscoveryService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async discoverGuildMembers() {
    try {
      const { name, realm, region } = this.config.guild;
      const url = `https://raider.io/api/v1/guilds/profile?region=${region}&realm=${realm}&name=${encodeURIComponent(name)}&fields=members`;
      
      this.logger.info(`Discovering guild members for ${name} on ${realm}-${region}`);
      
      const response = await axios.get(url);
      
      if (!response.data || !response.data.members) {
        throw new Error('No guild members found in API response');
      }

      this.logger.info(`Found ${response.data.members.length} guild members`);
      
      return response.data.members.map(member => ({
        character_name: member.character.name,
        realm: member.character.realm,
        class: member.character.class,
        level: member.character.level,
        item_level: member.character.item_level,
        mythic_plus_score: member.mythic_plus_scores?.all || 0
      }));
      
    } catch (error) {
      this.logger.error('Failed to discover guild members:', error.message);
      throw error;
    }
  }
}

module.exports = GuildDiscoveryService;