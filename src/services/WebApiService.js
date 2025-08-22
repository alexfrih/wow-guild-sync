const axios = require('axios');

class WebApiService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async pushPlayerData(playerData) {
    if (!this.config.webApi.baseUrl) {
      this.logger.debug('No web API URL configured, skipping data push');
      return;
    }

    try {
      const url = `${this.config.webApi.baseUrl}${this.config.webApi.endpoints.pushPlayerData}`;
      
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (this.config.webApi.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.webApi.apiKey}`;
      }

      await axios.post(url, playerData, {
        headers,
        timeout: this.config.webApi.timeout
      });

      this.logger.info(`Successfully pushed data for ${playerData.length} players`);
    } catch (error) {
      this.logger.error('Failed to push player data to web API:', error.message);
    }
  }

  async pushPvpData(pvpData) {
    if (!this.config.webApi.baseUrl) {
      return;
    }

    try {
      const url = `${this.config.webApi.baseUrl}${this.config.webApi.endpoints.pushPvpData}`;
      
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (this.config.webApi.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.webApi.apiKey}`;
      }

      await axios.post(url, pvpData, {
        headers,
        timeout: this.config.webApi.timeout
      });

      this.logger.info('Successfully pushed PvP data');
    } catch (error) {
      this.logger.error('Failed to push PvP data to web API:', error.message);
    }
  }

  async updateStatus(status) {
    if (!this.config.webApi.baseUrl) {
      return;
    }

    try {
      const url = `${this.config.webApi.baseUrl}${this.config.webApi.endpoints.updateStatus}`;
      
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (this.config.webApi.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.webApi.apiKey}`;
      }

      await axios.post(url, status, {
        headers,
        timeout: this.config.webApi.timeout
      });

      this.logger.info('Successfully updated sync status');
    } catch (error) {
      this.logger.error('Failed to update sync status:', error.message);
    }
  }
}

module.exports = WebApiService;