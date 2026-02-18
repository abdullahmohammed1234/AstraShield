/**
 * Simple in-memory cache with TTL support
 * Provides automatic cache invalidation and memory management
 */

class Cache {
  constructor(options = {}) {
    this.ttl = options.ttl || 60000; // Default 1 minute
    this.maxSize = options.maxSize || 100;
    this.cache = new Map();
    this.timers = new Map();
  }

  /**
   * Set a value in cache with optional TTL
   */
  set(key, value, ttl = this.ttl) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      this.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl
    });

    // Set expiration timer
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    this.timers.set(key, setTimeout(() => {
      this.delete(key);
    }, ttl));

    return this;
  }

  /**
   * Get value from cache
   */
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    // Check if expired
    if (Date.now() - item.timestamp > item.ttl) {
      this.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * Check if key exists and is valid
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Delete a cache entry
   */
  delete(key) {
    this.cache.delete(key);
    
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
  }

  /**
   * Clear all cache entries
   */
  clear() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.cache.clear();
    this.timers.clear();
  }

  /**
   * Get cache statistics
   */
  stats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl
    };
  }
}

// Pre-configured cache instances for different data types
const cacheInstances = {
  // Short TTL for real-time data (30 seconds)
  realtime: new Cache({ ttl: 30000, maxSize: 50 }),
  
  // Medium TTL for computed data (5 minutes)
  computed: new Cache({ ttl: 300000, maxSize: 20 }),
  
  // Long TTL for reference data (15 minutes)
  reference: new Cache({ ttl: 900000, maxSize: 10 })
};

/**
 * Get cache instance by type
 */
const getCache = (type = 'realtime') => {
  return cacheInstances[type] || cacheInstances.realtime;
};

/**
 * Cached function wrapper - automatically caches async function results
 */
const cached = (fn, cacheKey, ttl = 60000) => {
  return async (...args) => {
    const cache = getCache(cacheKey.type || 'realtime');
    const key = `${cacheKey.prefix || 'default'}:${JSON.stringify(args)}`;
    
    const cachedValue = cache.get(key);
    if (cachedValue !== null) {
      return cachedValue;
    }

    const result = await fn(...args);
    cache.set(key, result, ttl);
    return result;
  };
};

module.exports = {
  Cache,
  getCache,
  cached,
  cacheInstances
};
