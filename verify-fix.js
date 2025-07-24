#!/usr/bin/env node

// Simple verification script to test the fixes
const { createClient } = require('redis');

async function verifyRedisConnection() {
  console.log('🔍 Testing Redis connection with new configuration...');
  
  try {
    const redisUrl = `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;
    console.log(`Connecting to: ${redisUrl}`);
    
    const client = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 10000,
        lazyConnect: true
      }
    });

    client.on('error', (err) => {
      console.error('❌ Redis Client Error:', err.message);
    });

    client.on('connect', () => {
      console.log('✅ Redis client connected');
    });

    await client.connect();
    
    // Test the connection
    const pingResult = await client.ping();
    console.log('✅ Redis ping successful:', pingResult);
    
    // Test basic operations
    await client.set('test_key', 'test_value');
    const result = await client.get('test_key');
    console.log('✅ Redis set/get test successful:', result);
    
    // Clean up
    await client.del('test_key');
    await client.quit();
    
    console.log('✅ Redis connection test completed successfully');
    return true;
    
  } catch (error) {
    console.error('❌ Redis connection test failed:', error.message);
    return false;
  }
}

async function verifyDatabaseConnection() {
  console.log('🔍 Testing database connection...');
  
  try {
    const { Pool } = require('pg');
    
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'hotel_tv_management',
      user: process.env.DB_USER || 'hotel_tv_user',
      password: process.env.DB_PASSWORD,
      connectionTimeoutMillis: 10000,
    });

    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    console.log('✅ Database connection test successful');
    await pool.end();
    return true;
    
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Hotel TV Management System - Fix Verification\n');
  
  // Load environment variables
  require('dotenv').config({ path: './backend/.env' });
  
  const results = {
    redis: await verifyRedisConnection(),
    database: await verifyDatabaseConnection()
  };
  
  console.log('\n📊 Verification Results:');
  console.log(`Redis: ${results.redis ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Database: ${results.database ? '✅ PASS' : '❌ FAIL'}`);
  
  if (results.redis && results.database) {
    console.log('\n🎉 All tests passed! The application should start successfully.');
    console.log('\nNext steps:');
    console.log('1. Push your changes to the repository');
    console.log('2. Pull changes on the server');
    console.log('3. Install updated dependencies: npm install');
    console.log('4. Restart the PM2 process: pm2 restart hotel-tv-backend');
    console.log('5. Check logs: pm2 logs hotel-tv-backend');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the configuration before deploying.');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
