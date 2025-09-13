/**
 * Test Mailgun authentication and list domains
 */

require('dotenv').config();
const axios = require('axios');

const apiKey = process.env.MAILGUN_API_KEY;
const domain = process.env.MAILGUN_DOMAIN;

async function testMailgunAuth() {
  const regions = [
    { name: 'US', url: 'https://api.mailgun.net' },
    { name: 'EU', url: 'https://api.eu.mailgun.net' }
  ];

  console.log('🔍 Testing Mailgun authentication with API key');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const region of regions) {
    console.log(`\nTesting ${region.name} region (${region.url})...`);

    try {
      // Test: List all domains
      const response = await axios.get(
        `${region.url}/v3/domains`,
        {
          auth: {
            username: 'api',
            password: apiKey
          }
        }
      );

      console.log(`✅ ${region.name} Region: Authentication successful!`);
      console.log(`   Total domains: ${response.data.total_count}`);

      if (response.data.items && response.data.items.length > 0) {
        console.log(`   Domains found:`);
        response.data.items.forEach(item => {
          console.log(`   - ${item.name} (${item.state})`);
        });

        // Check if our domain is in the list
        const ourDomain = response.data.items.find(item => item.name === domain);
        if (ourDomain) {
          console.log(`\n   🎉 Found ${domain} in ${region.name} region!`);
          console.log(`   State: ${ourDomain.state}`);
          console.log(`   Type: ${ourDomain.type}`);
        }
      }

    } catch (error) {
      if (error.response?.status === 401) {
        console.log(`❌ ${region.name} Region: Authentication failed`);
        console.log(`   Error: ${error.response?.data || error.message}`);
      } else {
        console.log(`❌ ${region.name} Region: Error`);
        console.log(`   Status: ${error.response?.status}`);
        console.log(`   Error: ${error.response?.data || error.message}`);
      }
    }
  }
}

testMailgunAuth().catch(console.error);