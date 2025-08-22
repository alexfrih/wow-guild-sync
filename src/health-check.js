#!/usr/bin/env node

/**
 * 🏥 Health Check Script for Docker HEALTHCHECK
 */

const http = require('http');

const options = {
  hostname: 'localhost',
  port: process.env.HEALTH_CHECK_PORT || 3001,
  path: '/health',
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const health = JSON.parse(data);
      
      if (res.statusCode === 200 && health.status === 'healthy') {
        console.log('✅ Health check passed');
        process.exit(0);
      } else {
        console.log('❌ Health check failed:', health);
        process.exit(1);
      }
    } catch (error) {
      console.log('❌ Health check response parse error:', error);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.log('❌ Health check request error:', error);
  process.exit(1);
});

req.on('timeout', () => {
  console.log('❌ Health check timeout');
  req.abort();
  process.exit(1);
});

req.end();