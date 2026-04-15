/**
 * Performance Optimization Middleware
 * Includes compression, caching, and response optimization
 */

const compression = require('compression');
const { cache } = require('../config/redis');
const { logger } = require('../utils/logger');

/**
 * Create compression middleware (with optional filtering)
 */
const createCompressionMiddleware = () => {
  return compression({
    // Filter: don't compress if client doesn't accept compression
    filter: (req, res) => {
      // Don't compress if already compressed
      if (res.getHeader('Content-Encoding')) {
        return false;
      }
      
      // Don't compress small responses (not worth it)
      const contentLength = parseInt(res.getHeader('Content-Length'), 10);
      if (!isNaN(contentLength) && contentLength < 1024) {
        return false;
      }
      
      // Use compression filter
      return compression.filter(req, res);
    },
    
    // Compression level (0-9)
    level: 6,
    
    // Minimum size to compress (bytes)
    threshold: 1024,
    
    // Enable Vary header for proper caching with compression
    Vary: 'Accept-Encoding'
  });
};

/**
 * Generate cache key from request
 */
const getCacheKey = (req) => {
  const base = `${req.method}:${req.originalUrl}`;
  const cacheParams = ['limit', 'page', 'sort', 'minRisk', 'status'];
  
  const params = cacheParams
    .filter(p => req.query[p])
    .map(p => `${p}=${req.query[p]}`)
    .join('&');
  
  return params ? `${base}?${params}` : base;
};

/**
 * Cache middleware options
 */
const CACHE_OPTIONS = {
  // Default TTL in seconds
  defaultTTL: 300,
  
  // Paths to cache
  cacheablePaths: [
    '/api/satellites',
    '/api/risk',
    '/api/conjunctions',
    '/api/statistics'
  ],
  
  // Paths to never cache
  noCachePaths: [
    '/api/seed',
    '/api/refresh'
  ],
  
  // HTTP methods to cache
  cacheableMethods: ['GET'],
  
  // Max size of cached response (bytes)
  maxSize: 5 * 1024 * 1024 // 5MB
};

/**
 * Create caching middleware
 */
const createCacheMiddleware = (options = {}) => {
  const config = { ...CACHE_OPTIONS, ...options };
  
  return async (req, res, next) => {
    // Only cache GET requests
    if (!config.cacheableMethods.includes(req.method)) {
      return next();
    }
    
    // Skip if path is in no-cache list
    if (config.noCachePaths.some(path => req.path.startsWith(path))) {
      return next();
    }
    
    // Only cache if path matches cacheable paths
    const shouldCache = config.cacheablePaths.some(path => req.path.startsWith(path));
    if (!shouldCache) {
      return next();
    }
    
    // Generate cache key
    const cacheKey = `http:${getCacheKey(req)}`;
    
    try {
      // Try to get from cache
      const cachedResponse = await cache.get(cacheKey);
      
      if (cachedResponse) {
        logger.debug('Cache hit', { 
          key: cacheKey,
          method: req.method,
          path: req.path 
        });
        
        // Set cache headers
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-TTL', cachedResponse.ttl);
        
        // Parse and send cached response
        if (cachedResponse.data) {
          return res.status(cachedResponse.statusCode || 200)
            .set(cachedResponse.headers || {})
            .json(cachedResponse.data);
        }
      }
      
      // Store original json method
      const originalJson = res.json.bind(res);
      
      // Override json to cache response
      res.json = async (data) => {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const responseData = {
            data,
            statusCode: res.statusCode,
            headers: {
              'Content-Type': 'application/json'
            },
            ttl: config.defaultTTL
          };
          
          // Don't cache if too large
          const size = JSON.stringify(responseData).length;
          if (size < config.maxSize) {
            try {
              await cache.set(cacheKey, responseData, config.defaultTTL);
              logger.debug('Response cached', { 
                key: cacheKey,
                size,
                ttl: config.defaultTTL
              });
            } catch (err) {
              logger.warn('Failed to cache response', { 
                key: cacheKey,
                error: err.message 
              });
            }
          }
        }
        
        return originalJson(data);
      };
      
      res.setHeader('X-Cache', 'MISS');
      next();
    } catch (err) {
      logger.warn('Cache middleware error', { error: err.message });
      next();
    }
  };
};

/**
 * Create cache invalidation middleware
 */
const createCacheInvalidationMiddleware = (options = {}) => {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);
    
    // Override json to invalidate cache on mutations
    res.json = async (data) => {
      // Invalidate related caches on successful mutations
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const redis = require('../config/redis').getRedisClient();
            
            // Invalidate related cache keys
            const patterns = [
              'http:/api/satellites*',
              'http:/api/statistics*',
              'http:/api/risk*'
            ];
            
            for (const pattern of patterns) {
              const keys = await redis.keys(pattern);
              if (keys.length > 0) {
                await redis.del(...keys);
                logger.debug('Cache invalidated', { pattern, count: keys.length });
              }
            }
          } catch (err) {
            logger.warn('Cache invalidation error', { error: err.message });
          }
        }
      }
      
      return originalJson(data);
    };
    
    next();
  };
};

/**
 * Create response time tracking middleware
 */
const createResponseTimeMiddleware = () => {
  return (req, res, next) => {
    const start = Date.now();
    
    // Log response time when finished
    res.on('finish', () => {
      const duration = Date.now() - start;
      
      // Log slow requests
      if (duration > 1000) {
        logger.warn('Slow request detected', {
          method: req.method,
          path: req.path,
          duration_ms: duration,
          statusCode: res.statusCode
        });
      }
      
      // Set timing header
      res.setHeader('X-Response-Time', `${duration}ms`);
    });
    
    next();
  };
};

/**
 * Create rate limiting middleware
 */
const createRateLimitMiddleware = () => {
  const rateLimit = require('express-rate-limit');
  
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later'
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path
      });
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later'
        }
      });
    }
  });
};

/**
 * Create security headers middleware
 */
const createSecurityHeadersMiddleware = () => {
  return (req, res, next) => {
    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Remove server identification
    res.removeHeader('X-Powered-By');
    
    next();
  };
};

module.exports = {
  createCompressionMiddleware,
  createCacheMiddleware,
  createCacheInvalidationMiddleware,
  createResponseTimeMiddleware,
  createRateLimitMiddleware,
  createSecurityHeadersMiddleware,
  CACHE_OPTIONS
};
