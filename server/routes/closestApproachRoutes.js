const express = require('express');
const router = express.Router();
const {
  findClosestApproaches,
  scanAllClosestApproaches,
  getActiveClosestApproachAlerts,
  configureThresholds,
  CONFIG,
  DEFAULT_USER_THRESHOLDS
} = require('../services/closestApproachService');

const { asyncHandler } = require('../middleware/errorHandler');

/**
 * GET /api/closest-approach/alerts
 * Get active closest approach alerts
 */
router.get('/alerts', asyncHandler(async (req, res) => {
  const result = await getActiveClosestApproachAlerts();
  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/closest-approach/config
 * Get current threshold configuration
 */
router.get('/config', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      thresholds: DEFAULT_USER_THRESHOLDS,
      config: CONFIG
    },
    timestamp: new Date().toISOString()
  });
}));

/**
 * PUT /api/closest-approach/config
 * Update threshold configuration
 */
router.put('/config', asyncHandler(async (req, res) => {
  const { leo, meo, geo } = req.body;
  const thresholds = { leo, meo, geo };
  const result = configureThresholds(thresholds);
  res.json({
    success: true,
    data: {
      updatedThresholds: result,
      defaults: DEFAULT_USER_THRESHOLDS
    },
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/closest-approach/scan
 * Scan all satellites for closest approach alerts
 */
router.post('/scan', asyncHandler(async (req, res) => {
  const { threshold = CONFIG.DEFAULT_THRESHOLD_KM } = req.body;
  const result = await scanAllClosestApproaches(parseFloat(threshold));
  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/closest-approach/:noradCatId
 * Find closest approaches for a specific satellite
 */
router.get('/:noradCatId', asyncHandler(async (req, res) => {
  const { noradCatId } = req.params;
  const { threshold = CONFIG.DEFAULT_THRESHOLD_KM } = req.query;
  const result = await findClosestApproaches(parseInt(noradCatId), parseFloat(threshold));
  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

module.exports = router;