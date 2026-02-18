/**
 * Request Deduplication Middleware
 * Prevents duplicate concurrent requests for the same resource
 */

const { logger } = require('../utils/logger');

/**
 * In-flight request tracking map
 */
const inFlightRequests = new Map();

/**
 * Request deduplication options
 */
const DEFAULT_OPTIONS = {
  // Max time to wait for in-flight request (ms)
  maxWaitTime: 5000,
  
  // TTL for completed request cache (ms)
  cacheTTL: 30000,
  
  // Include query params in cache key
  includeQueryParams: true,
  
  // Maximum concurrent requests allowed per key
  maxConcurrent: 5
};

/**
 * Generate cache key from request
 */
const getCacheKey = (req, options) => {
  const base = `${req.method}:${req.originalUrl.split('?')[0]}`;
  
  if (options.includeQueryParams && Object.keys(req.query).length > 0) {
    // Sort query params for consistent keys
    const sortedParams = Object.keys(req.query)
      .sort()
      .map(k => `${k}=${req.query[k]}`)
      .join('&');
    return `${base}?${sortedParams}`;
  }
  
  return base;
};

/**
 * Request deduplication middleware
 */
const requestDeduplication = (options = {}) => {
  const config = { ...DEFAULT_OPTIONS, ...options };
  
  return (req, res, next) => {
    const key = getCacheKey(req, config);
    const now = Date.now();
    
    // Check if there's an in-flight request
    if (inFlightRequests.has(key)) {
      const requestInfo = inFlightRequests.get(key);
      
      // Check if request is still in-flight
      if (requestInfo.status === 'pending') {
        const waitTime = now - requestInfo.startTime;
        
        // Check wait time limit
        if (waitTime > config.maxWaitTime) {
          logger.warn('Request deduplication wait timeout', {
            key,
            waitTime_ms: waitTime,
            maxWaitTime_ms: config.maxWaitTime
          });
          // Continue with new request
        } else {
          // Attach to existing request
          logger.debug('Deduplicating request', {
            key,
            waitTime_ms: waitTime,
            existingRequestId: requestInfo.requestId
          });
          
          requestInfo.waiters.push({
            resolve: (value) => {
              // Clone response for waiter
              if (!res.headersSent) {
                next();
              }
            },
            reject: (error) => {
              if (!res.headersSent) {
                next(error);
              }
            }
          });
          
          // Add response listener
          const originalEnd = res.end;
          res.end = function(...args) {
            originalEnd.apply(res, args);
            
            // Resolve all waiters
            requestInfo.waiters.forEach(waiter => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                waiter.resolve();
              }
            });
          };
          
          return; // Don't call next(), wait for original request
        }
      }
    }
    
    // Check concurrent request limit
    const concurrentCount = inFlightRequests.get(key)?.concurrentCount || 0;
    if (concurrentCount >= config.maxConcurrent) {
      logger.warn('Max concurrent requests exceeded', {
        key,
        concurrentCount,
        maxConcurrent: config.maxConcurrent
      });
    }
    
    // Create new in-flight request entry
    inFlightRequests.set(key, {
      status: 'pending',
      startTime: now,
      requestId: req.id,
      waiters: [],
      concurrentCount: concurrentCount + 1
    });
    
    // Store original end to track completion
    const originalEnd = res.end;
    const originalJson = res.json;
    
    res.end = function(...args) {
      const statusCode = res.statusCode;
      
      // Update request status
      const requestInfo = inFlightRequests.get(key);
      if (requestInfo) {
        requestInfo.status = statusCode >= 200 && statusCode < 300 ? 'completed' : 'failed';
        
        // Resolve waiters
        requestInfo.waiters.forEach(waiter => {
          if (statusCode >= 200 && statusCode < 300) {
            waiter.resolve();
          }
        });
        
        // Clean up after TTL
        setTimeout(() => {
          const current = inFlightRequests.get(key);
          if (current && current.status !== 'pending') {
            inFlightRequests.delete(key);
          }
        }, config.cacheTTL);
      }
      
      originalEnd.apply(res, args);
    };
    
    // Override json to ensure proper tracking
    res.json = function(data) {
      const requestInfo = inFlightRequests.get(key);
      if (requestInfo) {
        requestInfo.responseData = data;
      }
      return originalJson.call(this, data);
    };
    
    next();
  };
};

/**
 * Get deduplication statistics
 */
const getDeduplicationStats = () => {
  const stats = {
    activeRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
    totalWaiters: 0,
    keys: []
  };
  
  inFlightRequests.forEach((info, key) => {
    stats.keys.push({
      key,
      status: info.status,
      startTime: info.startTime,
      waiters: info.waiters.length,
      concurrentCount: info.concurrentCount
    });
    
    if (info.status === 'pending') stats.activeRequests++;
    else if (info.status === 'completed') stats.completedRequests++;
    else if (info.status === 'failed') stats.failedRequests++;
    
    stats.totalWaiters += info.waiters.length;
  });
  
  return stats;
};

/**
 * Clear all deduplication entries (for testing)
 */
const clearDeduplicationCache = () => {
  inFlightRequests.clear();
};

module.exports = {
  requestDeduplication,
  getDeduplicationStats,
  clearDeduplicationCache,
  DEFAULT_OPTIONS
};
