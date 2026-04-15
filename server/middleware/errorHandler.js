/**
 * Centralized Error Handling Middleware
 * Provides production-grade error handling with proper categorization
 */

const { logger } = require('../utils/logger');

/**
 * Custom error classes for better error categorization
 */
class AppError extends Error {
  constructor(message, statusCode, errorCode = 'INTERNAL_ERROR', isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = {}) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class NotFoundError extends AppError {
  constructor(resource, identifier) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.resource = resource;
    this.identifier = identifier;
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ConflictError extends AppError {
  constructor(message, resource = 'Resource') {
    super(message, 409, 'CONFLICT');
    this.resource = resource;
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests', retryAfter = 60) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}

class ExternalServiceError extends AppError {
  constructor(service, message) {
    super(`External service error: ${service}`, 503, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
    this.originalMessage = message;
  }
}

class DatabaseError extends AppError {
  constructor(operation, message) {
    super(`Database error: ${operation}`, 500, 'DATABASE_ERROR');
    this.operation = operation;
    this.originalMessage = message;
  }
}

/**
 * Async handler wrapper to catch errors automatically
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  const requestId = req.id || 'unknown';
  
  // Log error with full context
  const errorContext = {
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    errorCode: err.errorCode || 'UNKNOWN_ERROR',
    isOperational: err.isOperational !== false,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
  };
  
  // Add additional error details
  if (err.resource) errorContext.resource = err.resource;
  if (err.identifier) errorContext.identifier = err.identifier;
  if (err.details) errorContext.details = err.details;
  if (err.service) errorContext.service = err.service;
  
  // Determine log level based on error type
  if (err.statusCode >= 500 || !err.isOperational) {
    logger.error(err.message, errorContext);
  } else if (err.statusCode >= 400) {
    logger.warn(err.message, errorContext);
  }
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
        details: err.errors || []
      },
      requestId
    });
  }
  
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_ID_FORMAT',
        message: 'Invalid ID format'
      },
      requestId
    });
  }
  
  if (err.code === 11000) {
    // MongoDB duplicate key error
    const field = Object.keys(err.keyValue || {})[0];
    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_ENTRY',
        message: `Duplicate value for field: ${field}`,
        field
      },
      requestId
    });
  }
  
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token'
      },
      requestId
    });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'TOKEN_EXPIRED',
        message: 'Authentication token has expired'
      },
      requestId
    });
  }
  
  // Handle rate limiting
  if (err.statusCode === 429) {
    res.setHeader('Retry-After', err.retryAfter || 60);
    return res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: err.message,
        retryAfter: err.retryAfter
      },
      requestId
    });
  }
  
  // Default error response
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'Internal server error'
    : err.message;
  
  res.status(statusCode).json({
    success: false,
    error: {
      code: err.errorCode || 'INTERNAL_ERROR',
      message
    },
    requestId,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

/**
 * 404 handler for unmatched routes
 */
const notFoundHandler = (req, res) => {
  const requestId = req.id || 'unknown';
  
  logger.warn('Route not found', {
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip
  });
  
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`
    },
    requestId
  });
};

/**
 * Unhandled rejection handler
 */
const unhandledRejectionHandler = (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: promise.toString()
  });
  
  // In production, consider graceful shutdown
  if (process.env.NODE_ENV === 'production') {
    // Give time for logging, then exit
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  }
};

/**
 * Uncaught exception handler
 */
const uncaughtExceptionHandler = (err, origin) => {
  logger.error('Uncaught Exception', {
    error: err.message,
    stack: err.stack,
    origin
  });
  
  // In production, exit immediately
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
};

/**
 * Register global error handlers
 */
const registerGlobalErrorHandlers = () => {
  process.on('unhandledRejection', unhandledRejectionHandler);
  process.on('uncaughtException', uncaughtExceptionHandler);
  
  logger.info('Global error handlers registered', {
    environment: process.env.NODE_ENV
  });
};

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  DatabaseError,
  asyncHandler,
  errorHandler,
  notFoundHandler,
  registerGlobalErrorHandlers
};
