const { createClient } = require('redis');
const logger = require('./logger');

let client;

const connectRedis = async () => {
  try {
    const redisUrl = `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;
    
    client = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 10000,
        lazyConnect: true,
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis max reconnection attempts reached');
            return false;
          }
          const delay = Math.min(retries * 100, 3000);
          logger.warn(`Redis reconnecting in ${delay}ms (attempt ${retries})`);
          return delay;
        }
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

    client.on('reconnecting', () => {
      logger.warn('Redis client reconnecting...');
    });

    client.on('end', () => {
      logger.info('Redis client connection ended');
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
