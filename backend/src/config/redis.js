const { createClient } = require('redis');
const logger = require('./logger');

let client;

const connectRedis = async () => {
  try {
    client = createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          logger.error('Redis server connection refused');
          return new Error('Redis server connection refused');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          logger.error('Redis retry time exhausted');
          return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
          logger.error('Redis max attempts reached');
          return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
      }
    });

    client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
      logger.info('Redis client connected');
    });

    client.on('ready', () => {
      logger.info('Redis client ready');
    });

    await client.connect();
    
    // Test the connection
    await client.ping();
    logger.info('Redis connected successfully');
    
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
};

const getClient = () => {
  if (!client) {
    throw new Error('Redis client not initialized');
  }
  return client;
};

const set = async (key, value, expireInSeconds = null) => {
  try {
    const serializedValue = JSON.stringify(value);
    if (expireInSeconds) {
      await client.setEx(key, expireInSeconds, serializedValue);
    } else {
      await client.set(key, serializedValue);
    }
  } catch (error) {
    logger.error('Redis SET error:', error);
    throw error;
  }
};

const get = async (key) => {
  try {
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.error('Redis GET error:', error);
    throw error;
  }
};

const del = async (key) => {
  try {
    return await client.del(key);
  } catch (error) {
    logger.error('Redis DEL error:', error);
    throw error;
  }
};

const exists = async (key) => {
  try {
    return await client.exists(key);
  } catch (error) {
    logger.error('Redis EXISTS error:', error);
    throw error;
  }
};

const flushAll = async () => {
  try {
    return await client.flushAll();
  } catch (error) {
    logger.error('Redis FLUSHALL error:', error);
    throw error;
  }
};

const closeConnection = async () => {
  if (client) {
    await client.quit();
    logger.info('Redis connection closed');
  }
};

module.exports = {
  connectRedis,
  getClient,
  set,
  get,
  del,
  exists,
  flushAll,
  closeConnection
};
