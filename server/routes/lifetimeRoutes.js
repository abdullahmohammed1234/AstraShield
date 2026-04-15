const express = require('express');
const router = express.Router();
const {
  getLifetimePrediction,
  getAllLifetimePredictions,
  getLifetimeStatistics,
  getLifetimeAlerts,
  compareSatelliteLifetimes
} = require('../services/lifetimeEstimator');

const { asyncHandler } = require('../middleware/errorHandler');

/**
 * GET /api/lifetime/
 * Get lifetime predictions for all satellites below 600km
 * Query params:
 *   - limit: Number of results (default: 50)
 *   - sortBy: Sort field (default: daysUntilReentry)
 */
router.get('/', asyncHandler(async (req, res) => {
  const { limit = 50, sortBy = 'daysUntilReentry' } = req.query;
  const result = await getAllLifetimePredictions({
    limit: parseInt(limit),
    sortBy
  });
  
  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/lifetime/statistics
 * Get lifetime prediction statistics
 */
router.get('/statistics', asyncHandler(async (req, res) => {
  const result = await getLifetimeStatistics();
  
  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/lifetime/alerts
 * Get satellites with critical lifetime predictions
 */
router.get('/alerts', asyncHandler(async (req, res) => {
  const result = await getLifetimeAlerts();
  
  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/lifetime/:noradCatId
 * Get remaining functional lifetime prediction for a specific satellite
 */
router.get('/:noradCatId', asyncHandler(async (req, res) => {
  const { noradCatId } = req.params;
  const result = await getLifetimePrediction(parseInt(noradCatId));
  
  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/lifetime/compare
 * Compare lifetime predictions for multiple satellites
 * Body params:
 *   - noradCatIds: Array of NORAD catalog IDs
 */
router.post('/compare', asyncHandler(async (req, res) => {
  const { noradCatIds } = req.body;
  
  if (!Array.isArray(noradCatIds) || noradCatIds.length < 2) {
    return res.status(400).json({
      success: false,
      error: 'At least 2 NORAD IDs required for comparison'
    });
  }
  
  const result = await compareSatelliteLifetimes(noradCatIds.map(id => parseInt(id)));
  
  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

module.exports = router;