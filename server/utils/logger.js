/**
 * Production-Grade Structured JSON Logger
 * Provides consistent JSON logging across all services
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

// Log levels with numeric priorities
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

const CONFIG = {
  // Minimum level to log (production: info, development: debug)
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  
  // Output configuration
  output: process.env.LOG_OUTPUT || 'file', // 'console', 'file', or 'both'
  logDir: process.env.LOG_DIR || './logs',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  
  // Enable color output in console (development only)
  colors: process.env.NODE_ENV !== 'production',
  
  // Include request ID in logs
  includeRequestId: true,
  
  // Timestamp format
  timestampFormat: 'iso' // 'iso', 'unix', or 'human'
};

// Ensure log directory exists
if (CONFIG.output !== 'console') {
  const logDir = path.resolve(CONFIG.logDir);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

// Current log file
let currentLogFile = null;
let currentLogSize = 0;

const getLogFilePath = () => {
  const date = new Date().toISOString().split('T')[0];
  return path.join(CONFIG.logDir, `astrashield-${date}.log`);
};

const rotateLogFile = () => {
  const newFile = getLogFilePath();
  if (newFile !== currentLogFile) {
    currentLogFile = newFile;
    currentLogSize = 0;
    
    // Clean up old files
    if (CONFIG.output !== 'console') {
      try {
        const files = fs.readdirSync(CONFIG.logDir)
          .filter(f => f.startsWith('astrashield-') && f.endsWith('.log'))
          .sort()
          .reverse();
        
        files.slice(CONFIG.maxFiles).forEach(f => {
          fs.unlinkSync(path.join(CONFIG.logDir, f));
        });
      } catch (err) {
        console.error('Log rotation cleanup failed:', err.message);
      }
    }
  }
};

// Format timestamp based on configuration
const formatTimestamp = () => {
  switch (CONFIG.timestampFormat) {
    case 'unix':
      return Date.now();
    case 'human':
      return new Date().toISOString();
    case 'iso':
    default:
      return new Date().toISOString();
  }
};

// Build log entry structure
const buildLogEntry = (level, message, meta = {}) => {
  const entry = {
    timestamp: formatTimestamp(),
    level: level.toUpperCase(),
    service: process.env.SERVICE_NAME || 'astrashield-api',
    environment: process.env.NODE_ENV || 'development',
    hostname: os.hostname(),
    pid: process.pid,
    message,
    ...meta
  };
  
  // Include stack trace for errors
  if (meta.error && meta.error instanceof Error) {
    entry.error = {
      name: meta.error.name,
      message: meta.error.message,
      stack: process.env.NODE_ENV !== 'production' ? meta.error.stack : undefined
    };
  }
  
  // Include performance metrics if available
  if (meta.duration) {
    entry.performance = {
      duration_ms: meta.duration,
      duration_formatted: `${meta.duration}ms`
    };
  }
  
  return entry;
};

// Write log entry to file
const writeToFile = (entry) => {
  rotateLogFile();
  const line = JSON.stringify(entry) + '\n';
  currentLogSize += Buffer.byteLength(line, 'utf8');
  
  // Rotate if file too large
  if (currentLogSize > CONFIG.maxFileSize) {
    rotateLogFile();
  }
  
  try {
    fs.appendFileSync(currentLogFile, line, { encoding: 'utf8' });
  } catch (err) {
    console.error('Failed to write to log file:', err.message);
  }
};

// Color codes for console output
const colors = {
  error: '\x1b[31m',
  warn: '\x1b[33m',
  info: '\x1b[36m',
  http: '\x1b[90m',
  debug: '\x1b[35m',
  reset: '\x1b[0m'
};

// Format for console output
const formatForConsole = (entry) => {
  const color = colors[entry.level.toLowerCase()] || '';
  const reset = CONFIG.colors ? colors.reset : '';
  
  const base = `[${entry.timestamp}] ${entry.level}: ${entry.message}`;
  const extras = [];
  
  if (entry.requestId) extras.push(`reqId:${entry.requestId}`);
  if (entry.endpoint) extras.push(`${entry.method} ${entry.endpoint}`);
  if (entry.statusCode) extras.push(`status:${entry.statusCode}`);
  if (entry.duration) extras.push(`${entry.duration}ms`);
  if (entry.error) extras.push(`error:${entry.error.message}`);
  
  const extra = extras.length > 0 ? ` ${extras.join(' ')}` : '';
  return `${color}${base}${reset}${extra}`;
};

// Main logger function
const logger = {
  error: (message, meta = {}) => {
    if (LOG_LEVELS[CONFIG.level] >= LOG_LEVELS.error) {
      const entry = buildLogEntry('error', message, meta);
      if (CONFIG.output === 'console' || CONFIG.output === 'both') {
        console.error(formatForConsole(entry));
      }
      if (CONFIG.output === 'file' || CONFIG.output === 'both') {
        writeToFile(entry);
      }
    }
  },

  warn: (message, meta = {}) => {
    if (LOG_LEVELS[CONFIG.level] >= LOG_LEVELS.warn) {
      const entry = buildLogEntry('warn', message, meta);
      if (CONFIG.output === 'console' || CONFIG.output === 'both') {
        console.warn(formatForConsole(entry));
      }
      if (CONFIG.output === 'file' || CONFIG.output === 'both') {
        writeToFile(entry);
      }
    }
  },

  info: (message, meta = {}) => {
    if (LOG_LEVELS[CONFIG.level] >= LOG_LEVELS.info) {
      const entry = buildLogEntry('info', message, meta);
      if (CONFIG.output === 'console' || CONFIG.output === 'both') {
        console.log(formatForConsole(entry));
      }
      if (CONFIG.output === 'file' || CONFIG.output === 'both') {
        writeToFile(entry);
      }
    }
  },

  http: (message, meta = {}) => {
    if (LOG_LEVELS[CONFIG.level] >= LOG_LEVELS.http) {
      const entry = buildLogEntry('http', message, meta);
      if (CONFIG.output === 'console' || CONFIG.output === 'both') {
        console.log(formatForConsole(entry));
      }
      if (CONFIG.output === 'file' || CONFIG.output === 'both') {
        writeToFile(entry);
      }
    }
  },

  debug: (message, meta = {}) => {
    if (LOG_LEVELS[CONFIG.level] >= LOG_LEVELS.debug) {
      const entry = buildLogEntry('debug', message, meta);
      if (CONFIG.output === 'console' || CONFIG.output === 'both') {
        console.log(formatForConsole(entry));
      }
      if (CONFIG.output === 'file' || CONFIG.output === 'both') {
        writeToFile(entry);
      }
    }
  },

  // Log HTTP request/response
  logRequest: (req, res, duration) => {
    const entry = {
      requestId: req.id || 'unknown',
      method: req.method,
      endpoint: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('user-agent')
    };
    
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'http';
    logger[level](`${req.method} ${req.originalUrl} - ${res.statusCode}`, entry);
  },

  // Log structured error
  logError: (error, context = {}) => {
    logger.error(error.message, {
      error,
      ...context,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
};

// Request ID middleware
const requestIdMiddleware = (req, res, next) => {
  req.id = req.headers['x-request-id'] || 
           req.headers['x-correlation-id'] || 
           `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
};

// HTTP request logging middleware
const httpLoggerMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.logRequest(req, res, duration);
  });
  
  next();
};

module.exports = {
  logger,
  requestIdMiddleware,
  httpLoggerMiddleware,
  LOG_LEVELS
};
