/**
 * Retry Utilities with Exponential Backoff
 * Provides robust retry policies for async operations
 */

const { logger } = require('./logger');

/**
 * Configuration for retry policies
 */
const RETRY_POLICIES = {
  // Quick retries for transient failures (network blips)
  quick: {
    maxRetries: 3,
    initialDelay: 100,
    maxDelay: 1000,
    factor: 2,
    jitter: true,
    retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ENETUNREACH']
  },
  
  // Standard retries for external APIs
  standard: {
    maxRetries: 5,
    initialDelay: 500,
    maxDelay: 10000,
    factor: 2,
    jitter: true,
    retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ENETUNREACH', '429', '503']
  },
  
  // Aggressive retries for critical operations
  aggressive: {
    maxRetries: 8,
    initialDelay: 1000,
    maxDelay: 30000,
    factor: 2,
    jitter: true,
    retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ENETUNREACH', '429', '503', '500']
  },
  
  // No retries for idempotent operations only
  none: {
    maxRetries: 0,
    initialDelay: 0,
    maxDelay: 0,
    factor: 1,
    jitter: false,
    retryableErrors: []
  }
};

/**
 * Calculate delay with exponential backoff and jitter
 */
const calculateDelay = (attempt, options) => {
  const { initialDelay, factor, maxDelay, jitter } = options;
  
  // Exponential backoff: initialDelay * (factor ^ attempt)
  let delay = initialDelay * Math.pow(factor, attempt);
  
  // Cap at max delay
  delay = Math.min(delay, maxDelay);
  
  // Add jitter to prevent thundering herd (0.5 to 1.5 of calculated delay)
  if (jitter) {
    const jitterFactor = 0.5 + Math.random();
    delay = delay * jitterFactor;
  }
  
  return Math.floor(delay);
};

/**
 * Check if error is retryable
 */
const isRetryableError = (error, retryableErrors) => {
  if (!error) return false;
  
  const errorMessage = error.message || '';
  const errorCode = error.code || '';
  const errorStatus = error.status || error.response?.status || '';
  
  // Check if error code/status is in retryable list
  const isRetryableCode = retryableErrors.some(e => 
    errorCode.includes(e) || errorStatus.toString().includes(e)
  );
  
  // Check for common retryable error patterns
  const isCommonRetryable = 
    errorMessage.includes('ECONNRESET') ||
    errorMessage.includes('ETIMEDOUT') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('connect ETIMEDOUT') ||
    errorMessage.includes('connect ECONNREFUSED') ||
    errorMessage.includes('Network error');
  
  return isRetryableCode || isCommonRetryable;
};

/**
 * Sleep for specified milliseconds
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry function with exponential backoff
 */
const retry = async (fn, options = {}) => {
  const {
    maxRetries = 3,
    initialDelay = 500,
    maxDelay = 10000,
    factor = 2,
    jitter = true,
    retryableErrors = RETRY_POLICIES.standard.retryableErrors,
    onRetry = null,
    operationName = 'operation'
  } = options;
  
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      const isLastAttempt = attempt >= maxRetries;
      const shouldRetry = !isLastAttempt && isRetryableError(error, retryableErrors);
      
      if (!shouldRetry) {
        logger.error(`[${operationName}] Non-retryable error`, {
          operation: operationName,
          attempt: attempt + 1,
          error: error.message
        });
        throw error;
      }
      
      // Calculate delay
      const delay = calculateDelay(attempt, { initialDelay, factor, maxDelay, jitter });
      
      logger.warn(`[${operationName}] Retrying after ${delay}ms`, {
        operation: operationName,
        attempt: attempt + 1,
        maxRetries: maxRetries + 1,
        delay_ms: delay,
        error: error.message
      });
      
      // Call retry callback if provided
      if (onRetry) {
        await onRetry(error, attempt, delay);
      }
      
      // Wait before retrying
      await sleep(delay);
    }
  }
  
  // All retries exhausted
  logger.error(`[${operationName}] All retries exhausted`, {
    operation: operationName,
    maxRetries: maxRetries + 1,
    error: lastError?.message
  });
  
  throw lastError;
};

/**
 * Retry with circuit breaker integration
 */
const retryWithCircuitBreaker = async (fn, circuitBreaker, options = {}) => {
  const {
    fallbackValue = null,
    operationName = 'operation'
  } = options;
  
  try {
    return await circuitBreaker.execute(fn);
  } catch (error) {
    // If circuit breaker is open, use fallback
    if (error.message.includes('circuit breaker') && error.message.includes('OPEN')) {
      logger.warn(`[${operationName}] Circuit breaker open, using fallback`, {
        operation: operationName,
        hasFallback: fallbackValue !== null
      });
      
      if (fallbackValue !== null) {
        return fallbackValue;
      }
    }
    
    // Fall back to retry
    logger.info(`[${operationName}] Falling back to retry logic`, {
      operation: operationName
    });
    
    return retry(fn, options);
  }
};

/**
 * Retry policy presets
 */
const withQuickRetry = (fn, options = {}) => 
  retry(fn, { ...RETRY_POLICIES.quick, ...options });

const withStandardRetry = (fn, options = {}) => 
  retry(fn, { ...RETRY_POLICIES.standard, ...options });

const withAggressiveRetry = (fn, options = {}) => 
  retry(fn, { ...RETRY_POLICIES.aggressive, ...options });

/**
 * Create a retryable function
 */
const createRetryableFunction = (fn, policyName = 'standard', options = {}) => {
  const policy = RETRY_POLICIES[policyName] || RETRY_POLICIES.standard;
  return (...args) => retry(() => fn(...args), { ...policy, ...options });
};

module.exports = {
  retry,
  retryWithCircuitBreaker,
  withQuickRetry,
  withStandardRetry,
  withAggressiveRetry,
  createRetryableFunction,
  calculateDelay,
  isRetryableError,
  RETRY_POLICIES,
  sleep
};
