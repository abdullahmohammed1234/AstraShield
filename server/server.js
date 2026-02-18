require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const connectDB = require('./config/db');
const satelliteRoutes = require('./routes/satelliteRoutes');
const riskRoutes = require('./routes/riskRoutes');
const conjunctionRoutes = require('./routes/conjunctionRoutes');
const { fetchAndStoreTLE } = require('./services/tleFetcher');
const { calculateAllRiskScores, calculateAllRiskScoresWithConjunctions } = require('./services/riskEngine');
const { runConjunctionDetection } = require('./services/conjunctionEngine');
const Satellite = require('./models/Satellite');

// Import resilience utilities
const { logger, requestIdMiddleware, httpLoggerMiddleware } = require('./utils/logger');
const { errorHandler, notFoundHandler, registerGlobalErrorHandlers, asyncHandler } = require('./middleware/errorHandler');
const { requestDeduplication } = require('./middleware/requestDeduplication');
const { getAllCircuitBreakerStatuses } = require('./utils/circuitBreaker');
const { getMetrics, getPrometheusMetrics, metricsMiddleware } = require('./utils/metrics');

// Performance middleware
const {
  createCompressionMiddleware,
  createCacheMiddleware,
  createResponseTimeMiddleware,
  createRateLimitMiddleware,
  createSecurityHeadersMiddleware
} = require('./middleware/performance');

const app = express();
const PORT = process.env.PORT || 5000;

// Request validation middleware
const validateQuery = (req, res, next) => {
  const { limit, minRisk } = req.query;
  
  if (limit !== undefined) {
    const parsed = parseInt(limit);
    if (isNaN(parsed) || parsed < 1 || parsed > 1000) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid limit parameter (1-1000)' 
      });
    }
  }
  
  if (minRisk !== undefined) {
    const parsed = parseFloat(minRisk);
    if (isNaN(parsed) || parsed < 0 || parsed > 1) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid minRisk parameter (0-1)' 
      });
    }
  }
  
  next();
};

// Apply middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Limit payload size
app.use(requestIdMiddleware);
app.use(httpLoggerMiddleware);
app.use(validateQuery);

// Connect to database
connectDB();

// API Routes
app.use('/api/satellites', satelliteRoutes);
app.use('/api/risk', riskRoutes);
app.use('/api/conjunctions', conjunctionRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Circuit breaker status endpoint (for monitoring)
app.get('/api/health/circuit-breakers', (req, res) => {
  const statuses = getAllCircuitBreakerStatuses();
  res.json({
    success: true,
    circuitBreakers: statuses,
    timestamp: new Date().toISOString()
  });
});

// Metrics endpoint
app.get('/api/metrics', (req, res) => {
  const format = req.query.format;
  
  if (format === 'prometheus') {
    res.set('Content-Type', 'text/plain');
    return res.send(getPrometheusMetrics());
  }
  
  res.json(getMetrics());
});

// Database seeding endpoint
app.get('/api/seed', async (req, res) => {
  try {
    const count = await Satellite.countDocuments();
    
    if (count === 0) {
      console.log('No satellites in database, fetching TLE data...');
      await fetchAndStoreTLE();
      await calculateAllRiskScores();
      
      console.log('Running initial conjunction detection...');
      await runConjunctionDetection();
      await calculateAllRiskScoresWithConjunctions();
      
      res.json({ message: 'Database seeded successfully' });
    } else {
      res.json({ message: `Database already has ${count} satellites` });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Scheduled tasks with improved error handling
// Daily TLE update at midnight
cron.schedule('0 0 * * *', async () => {
  logger.info('Starting scheduled TLE update...', { job: 'tle-update' });
  try {
    await fetchAndStoreTLE();
    await calculateAllRiskScores();
    logger.info('Daily TLE update completed', { job: 'tle-update' });
  } catch (error) {
    logger.error('Daily TLE update failed', { job: 'tle-update', error: error.message });
  }
});

// Conjunction detection every 6 hours
cron.schedule('0 */6 * * *', async () => {
  logger.info('Starting scheduled conjunction detection...', { job: 'conjunction-detection' });
  try {
    await runConjunctionDetection();
    await calculateAllRiskScoresWithConjunctions();
    logger.info('Conjunction detection completed', { job: 'conjunction-detection' });
  } catch (error) {
    logger.error('Conjunction detection failed', { job: 'conjunction-detection', error: error.message });
  }
});

// Apply global error handler
app.use(errorHandler);
app.use(notFoundHandler);

// Register global error handlers for uncaught exceptions
registerGlobalErrorHandlers();

app.listen(PORT, () => {
  logger.info(`AstraShield Server started`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    service: 'astrashield-api',
    endpoints: [
      '/api/satellites',
      '/api/risk',
      '/api/conjunctions',
      '/api/health',
      '/api/health/circuit-breakers'
    ]
  });
});

module.exports = app;
