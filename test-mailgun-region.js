/**
 * Test script to determine Mailgun region
 */

require('dotenv').config();
const axios = require('axios');

const apiKey = process.env.MAILGUN_API_KEY;
const domain = process.env.MAILGUN_DOMAIN;

async function testMailgunRegion() {
  const regions = [
    { name: 'US', url: 'https://api.mailgun.net' },
    { name: 'EU', url: 'https://api.eu.mailgun.net' }
  ];

  console.log('🔍 Testing Mailgun regions for domain:', domain);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const region of regions) {
    console.log(`Testing ${region.name} region (${region.url})...`);

    try {
      // Test 1: Get domain info
      const domainResponse = await axios.get(
        `${region.url}/v3/domains/${domain}`,
        {
          auth: {
            username: 'api',
            password: apiKey
          }
        }
      );

      console.log(`✅ ${region.name} Region: Domain found!`);
      console.log(`   Domain State: ${domainResponse.data.domain.state}`);
      console.log(`   Type: ${domainResponse.data.domain.type}`);
      console.log(`   Created: ${domainResponse.data.domain.created_at}`);

      // Test 2: Try to send a test message
      console.log(`   Testing message send capability...`);

      const formData = new URLSearchParams();
      formData.append('from', `Test <noreply@${domain}>`);
      formData.append('to', process.env.CONTACT_EMAIL);
      formData.append('subject', `Mailgun Region Test - ${region.name}`);
      formData.append('text', `This is a test email from the ${region.name} region.`);

      const messageResponse = await axios.post(
        `${region.url}/v3/${domain}/messages`,
        formData,
        {
          auth: {
            username: 'api',
            password: apiKey
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      console.log(`   ✅ Message sent successfully!`);
      console.log(`   Message ID: ${messageResponse.data.id}`);
      console.log(`\n🎉 YOUR DOMAIN IS IN THE ${region.name} REGION!\n`);

      return region;

    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`❌ ${region.name} Region: Domain not found`);
      } else if (error.response?.status === 401) {
        console.log(`❌ ${region.name} Region: Authentication failed`);
        console.log(`   Error: ${error.response?.data?.message || error.message}`);
      } else {
        console.log(`❌ ${region.name} Region: Error`);
        console.log(`   Status: ${error.response?.status}`);
        console.log(`   Error: ${error.response?.data?.message || error.message}`);
      }
    }
    console.log('');
  }

  console.log('\n⚠️ Could not determine region. Please check:');
  console.log('1. API key is correct');
  console.log('2. Domain is verified in Mailgun');
  console.log('3. API key has proper permissions');
}

testMailgunRegion().catch(console.error);