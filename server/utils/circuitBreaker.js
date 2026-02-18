/**
 * Circuit Breaker Pattern Implementation
 * Provides fault tolerance for external service calls
 */

const { logger } = require('./logger');

class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'circuit-breaker';
    this.timeout = options.timeout || 30000; // Max time for a single request
    this.errorThreshold = options.errorThreshold || 50; // % of failures to open circuit
    this.resetTimeout = options.resetTimeout || 30000; // Time before attempting to close
    this.warmUp = options.warmUp || 10000; // Initial warm-up period
    
    // State management
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttempt = Date.now();
    
    // Statistics
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
      averageResponseTime: 0,
      lastStateChange: Date.now()
    };
    
    // Timer reference
    this.stateTimer = null;
  }
  
  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn, fallbackFn = null) {
    const startTime = Date.now();
    
    // Check if circuit is open
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        this.stats.rejectedRequests++;
        logger.warn(`Circuit breaker [${this.name}] OPEN - rejecting request`, {
          circuitBreaker: this.name,
          state: this.state,
          nextAttempt: new Date(this.nextAttempt).toISOString(),
          waitTime_ms: this.nextAttempt - Date.now()
        });
        
        // Return fallback if available
        if (fallbackFn) {
          return await fallbackFn();
        }
        throw new Error(`Circuit breaker [${this.name}] is OPEN`);
      }
      
      // Try to close circuit (half-open state)
      this.transitionTo('HALF_OPEN');
    }
    
    this.stats.totalRequests++;
    
    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn);
      const duration = Date.now() - startTime;
      
      this.onSuccess(duration);
      
      logger.debug(`Circuit breaker [${this.name}] request succeeded`, {
        circuitBreaker: this.name,
        duration_ms: duration,
        state: this.state
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.onFailure(duration);
      
      logger.error(`Circuit breaker [${this.name}] request failed`, {
        circuitBreaker: this.name,
        error: error.message,
        duration_ms: duration,
        state: this.state
      });
      
      // Return fallback if available and circuit just opened
      if (fallbackFn && this.state === 'OPEN') {
        return await fallbackFn();
      }
      
      throw error;
    }
  }
  
  /**
   * Execute function with timeout protection
   */
  executeWithTimeout(fn) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Circuit breaker [${this.name}] timeout after ${this.timeout}ms`));
      }, this.timeout);
      
      Promise.resolve(fn())
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
  
  /**
   * Handle successful request
   */
  onSuccess(duration) {
    this.failures = 0;
    this.successes++;
    
    // Update average response time (exponential moving average)
    this.stats.averageResponseTime = 
      (this.stats.averageResponseTime * 0.7) + (duration * 0.3);
    this.stats.successfulRequests++;
    
    // Close circuit after enough successes in half-open state
    if (this.state === 'HALF_OPEN' && this.successes >= 2) {
      this.transitionTo('CLOSED');
    }
  }
  
  /**
   * Handle failed request
   */
  onFailure(duration) {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.stats.failedRequests++;
    
    // Calculate failure rate
    const total = this.successes + this.failures;
    const failureRate = total > 0 ? (this.failures / total) * 100 : 0;
    
    // Open circuit if failure threshold exceeded
    if (this.state === 'CLOSED' && failureRate >= this.errorThreshold && total >= 10) {
      this.transitionTo('OPEN');
    } else if (this.state === 'HALF_OPEN') {
      // Immediately open on any failure in half-open state
      this.transitionTo('OPEN');
    }
  }
  
  /**
   * Transition to new state
   */
  transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this.stats.lastStateChange = Date.now();
    
    // Clear any existing timer
    if (this.stateTimer) {
      clearTimeout(this.stateTimer);
      this.stateTimer = null;
    }
    
    if (newState === 'OPEN') {
      // Schedule transition to half-open
      this.nextAttempt = Date.now() + this.resetTimeout;
      this.stateTimer = setTimeout(() => {
        this.transitionTo('HALF_OPEN');
      }, this.resetTimeout);
      
      logger.warn(`Circuit breaker [${this.name}] transitioned ${oldState} -> ${newState}`, {
        circuitBreaker: this.name,
        oldState,
        newState,
        resetTimeout_ms: this.resetTimeout,
        failureCount: this.failures
      });
    } else if (newState === 'HALF_OPEN') {
      this.successes = 0;
      this.failures = 0;
      
      logger.info(`Circuit breaker [${this.name}] transitioned ${oldState} -> ${newState}`, {
        circuitBreaker: this.name,
        oldState,
        newState
      });
    } else if (newState === 'CLOSED') {
      this.successes = 0;
      this.failures = 0;
      
      logger.info(`Circuit breaker [${this.name}] transitioned ${oldState} -> ${newState}`, {
        circuitBreaker: this.name,
        oldState,
        newState,
        successfulRequests: this.stats.successfulRequests
      });
    }
  }
  
  /**
   * Get circuit breaker status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      nextAttempt: this.state === 'OPEN' ? this.nextAttempt : null,
      stats: { ...this.stats },
      config: {
        timeout: this.timeout,
        errorThreshold: this.errorThreshold,
        resetTimeout: this.resetTimeout
      }
    };
  }
  
  /**
   * Reset circuit breaker manually
   */
  reset() {
    this.transitionTo('CLOSED');
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
      averageResponseTime: 0,
      lastStateChange: Date.now()
    };
  }
}

/**
 * Circuit Breaker Factory
 * Pre-configured breakers for common external services
 */
const circuitBreakers = {
  // TLE API circuit breaker
  tleApi: new CircuitBreaker({
    name: 'tle-api',
    timeout: 45000,
    errorThreshold: 40,
    resetTimeout: 60000,
    warmUp: 5000
  }),
  
  // Database circuit breaker
  database: new CircuitBreaker({
    name: 'database',
    timeout: 10000,
    errorThreshold: 30,
    resetTimeout: 15000,
    warmUp: 0
  }),
  
  // Fallback TLE source circuit breaker
  tleFallback: new CircuitBreaker({
    name: 'tle-fallback',
    timeout: 60000,
    errorThreshold: 60,
    resetTimeout: 120000,
    warmUp: 10000
  })
};

/**
 * Execute with circuit breaker
 */
const executeWithCircuitBreaker = async (breakerName, fn, fallbackFn = null) => {
  const breaker = circuitBreakers[breakerName];
  if (!breaker) {
    throw new Error(`Unknown circuit breaker: ${breakerName}`);
  }
  return breaker.execute(fn, fallbackFn);
};

/**
 * Get all circuit breaker statuses
 */
const getAllCircuitBreakerStatuses = () => {
  return Object.keys(circuitBreakers).reduce((acc, key) => {
    acc[key] = circuitBreakers[key].getStatus();
    return acc;
  }, {});
};

module.exports = {
  CircuitBreaker,
  circuitBreakers,
  executeWithCircuitBreaker,
  getAllCircuitBreakerStatuses
};
