/**
 * Redis Configuration for Distributed Caching and Session Management
 * Provides connection management and caching utilities
 */

const Redis = require('ioredis');
const { logger } = require('../utils/logger');

// Redis configuration
const CONFIG = {
  // Connection settings
  maxRetries: 3,
  retryDelay: 100,
  connectTimeout: 10000,
  commandTimeout: 5000,
  
  // Pool settings
  family: 4, // IPv4
  
  // Keep-alive settings
  keepAlive: 30000,
  
  // Lazy connection
  lazyConnect: true,
  
  // Key prefix for namespacing
  keyPrefix: 'astrashield:',
  
  // Default TTL values (seconds)
  ttl: {
    realtime: 30,      // 30 seconds - real-time data
    computed: 300,     // 5 minutes - computed results
    reference: 900,     // 15 minutes - reference data
    session: 3600,     // 1 hour - session data
    lock: 30           // 30 seconds - distributed locks
  }
};

// Create Redis client
const createRedisClient = (options = {}) => {
  const client = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB) || 0,
    
    // Connection settings
    maxRetriesPerRequest: CONFIG.maxRetries,
    retryStrategy: (times) => {
      if (times > CONFIG.maxRetries) {
        logger.error('Redis max retries exceeded', { times });
        return null; // Stop retrying
      }
      return Math.min(times * CONFIG.retryDelay, 2000);
    },
    reconnectOnError: (err) => {
      logger.warn('Redis reconnecting on error', { error: err.message });
      return true;
    },
    
    // Timeouts
    connectTimeout: CONFIG.connectTimeout,
    commandTimeout: CONFIG.commandTimeout,
    
    // Keep-alive
    family: CONFIG.family,
    keepAlive: CONFIG.keepAlive,
    
    // Key prefix
    keyPrefix: CONFIG.keyPrefix,
    
    // Lazy connection
    lazyConnect: options.lazyConnect !== false,
    
    // Lua scripts for atomic operations
    ...options
  });
  
  // Event handlers
  client.on('connect', () => {
    logger.info('Redis client connected', { 
      host: client.options.host, 
      port: client.options.port 
    });
  });
  
  client.on('ready', () => {
    logger.info('Redis client ready', { 
      host: client.options.host, 
      port: client.options.port,
      db: client.options.db 
    });
  });
  
  client.on('error', (err) => {
    logger.error('Redis client error', { error: err.message });
  });
  
  client.on('close', () => {
    logger.warn('Redis connection closed');
  });
  
  client.on('reconnecting', () => {
    logger.info('Redis client reconnecting');
  });
  
  return client;
};

// Singleton Redis client
let redisClient = null;

/**
 * Get Redis client (singleton)
 */
const getRedisClient = () => {
  if (!redisClient) {
    redisClient = createRedisClient();
    redisClient.connect().catch(err => {
      logger.error('Failed to connect Redis client', { error: err.message });
    });
  }
  return redisClient;
};

/**
 * Connect to Redis
 */
const connectRedis = async () => {
  const client = getRedisClient();
  await client.connect();
  return client;
};

/**
 * Close Redis connection
 */
const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
};

// Cache utilities
const cache = {
  /**
   * Get value from cache
   */
  async get(key) {
    const client = getRedisClient();
    const value = await client.get(key);
    if (value) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return null;
  },

  /**
   * Set value in cache with TTL
   */
  async set(key, value, ttl = CONFIG.ttl.computed) {
    const client = getRedisClient();
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return client.setex(key, ttl, serialized);
  },

  /**
   * Delete key from cache
   */
  async del(key) {
    const client = getRedisClient();
    return client.del(key);
  },

  /**
   * Check if key exists
   */
  async exists(key) {
    const client = getRedisClient();
    return client.exists(key);
  },

  /**
   * Get multiple keys at once
   */
  async mget(...keys) {
    const client = getRedisClient();
    const values = await client.mget(...keys);
    return values.map(v => {
      if (v) {
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      }
      return null;
    });
  },

  /**
   * Set multiple keys at once
   */
  async mset(keyValuePairs, ttl) {
    const client = getRedisClient();
    const args = [];
    
    for (const [key, value] of Object.entries(keyValuePairs)) {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      args.push(key, serialized);
    }
    
    if (ttl) {
      // Use pipeline for TTL
      const pipeline = client.pipeline();
      for (let i = 0; i < args.length; i += 2) {
        pipeline.setex(args[i], ttl, args[i + 1]);
      }
      return pipeline.exec();
    }
    
    return client.mset(...args);
  },

  /**
   * Increment value
   */
  async incr(key) {
    const client = getRedisClient();
    return client.incr(key);
  },

  /**
   * Decrement value
   */
  async decr(key) {
    const client = getRedisClient();
    return client.decr(key);
  },

  /**
   * Get cache statistics
   */
  async stats() {
    const client = getRedisClient();
    const info = await client.info('stats');
    const memory = await client.info('memory');
    
    return { info, memory };
  }
};

// Distributed lock utility
const locks = {
  /**
   * Acquire a distributed lock
   * @returns {boolean} true if lock acquired, false otherwise
   */
  async acquireLock(lockName, ttl = CONFIG.ttl.lock) {
    const client = getRedisClient();
    const lockKey = `lock:${lockName}`;
    const lockValue = `${process.env.HOSTNAME || 'local'}-${Date.now()}`;
    
    const result = await client.set(lockKey, lockValue, 'EX', ttl, 'NX');
    return result === 'OK';
  },

  /**
   * Release a distributed lock
   */
  async releaseLock(lockName, expectedValue) {
    const client = getRedisClient();
    const lockKey = `lock:${lockName}`;
    
    // Lua script for atomic check-and-delete
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    return client.eval(script, 1, lockKey, expectedValue);
  }
};

// Pub/Sub utilities
const pubsub = {
  /**
   * Subscribe to a channel
   */
  async subscribe(channel, callback) {
    const client = getRedisClient();
    await client.subscribe(channel);
    client.on('message', (ch, message) => {
      if (ch === channel) {
        try {
          callback(JSON.parse(message));
        } catch {
          callback(message);
        }
      }
    });
  },

  /**
   * Publish to a channel
   */
  async publish(channel, message) {
    const client = getRedisClient();
    const serialized = typeof message === 'string' ? message : JSON.stringify(message);
    return client.publish(channel, serialized);
  }
};

module.exports = {
  CONFIG,
  getRedisClient,
  connectRedis,
  closeRedis,
  cache,
  locks,
  pubsub
};
