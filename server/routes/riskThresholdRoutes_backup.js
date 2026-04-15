const express = require('express');
const router = express.Router();
const {
  DEFAULT_THRESHOLDS,
  getThresholds,
  setThreshold,
  setAllThresholdsForShell,
  resetToDefaults,
  getRiskLevel,
  getRiskAssessment,
  saveUserPreference,
  getAllUserPreferences,
  validateThresholds,
  exportThresholds,
  importThresholds,
  getThresholdStatistics
} = require('../services/riskThresholdService');

const { asyncHandler } = require('../middleware/errorHandler');

/**
 * GET /api/risk-thresholds/
 * Get current risk thresholds configuration
 * Query params:
 *   - userId: User ID (default: default)
 */
router.get('/', asyncHandler(async (req, res) => {
  const { userId = 'default' } = req.query;
  
  const thresholds = getThresholds(userId);
  const stats = getThresholdStatistics(userId);
  
  res.json({
    success: true,
    data: {
      thresholds,
      statistics: stats,
      defaults: DEFAULT_THRESHOLDS
    },
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/risk-thresholds/:shell
 * Get thresholds for a specific orbital shell
 */
router.get('/:shell', asyncHandler(async (req, res) => {
  const { shell } = req.params;
  const { userId = 'default' } = req.query;
  
  const thresholds = getThresholds(userId);
  const shellThresholds = thresholds[shell];
  
  if (!shellThresholds) {
    return res.status(404).json({
      success: false,
      error: `Invalid shell: ${shell}. Valid options: leo, meo, geo, vleo`
    });
  }
  
  res.json({
    success: true,
    data: {
      shell,
      ...shellThresholds
    },
    timestamp: new Date().toISOString()
  });
}));

/**
 * PUT /api/risk-thresholds/:shell/:level
 * Set a specific threshold value
 * Body params:
 *   - value: Threshold value in km
 */
router.put('/:shell/:level', asyncHandler(async (req, res) => {
  const { shell, level } = req.params;
  const { value } = req.body;
  const { userId = 'default' } = req.query;
  
  if (!value || isNaN(parseFloat(value)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid value parameter'
    });
  }
  
  const success = setThreshold(userId, shell, level, value);
  
  if (!success) {
    return res.status(400).json({
      success: false,
      error: `Invalid shell or level. Valid shells: leo, meo, geo, vleo. Valid levels: critical, high, medium, low`
    });
  }
  
  res.json({
    success: true,
    data: {
      shell,
      level,
      value: parseFloat(value),
      currentThresholds: getThresholds(userId)
    },
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/risk-thresholds/:shell
 * Set all thresholds for a specific orbital shell
 * Body params:
 *   - critical: Critical threshold in km
 *   - high: High threshold in km
 *   - medium: Medium threshold in km
 *   - low: Low threshold in km
 */
router.post('/:shell', asyncHandler(async (req, res) => {
  const { shell } = req.params;
  const { critical, high, medium, low } = req.body;
  const { userId = 'default' } = req.query;
  
  const thresholds = { critical, high, medium, low };
  const success = setAllThresholdsForShell(userId, shell, thresholds);
  
  if (!success) {
    return res.status(400).json({
      success: false,
      error: `Invalid shell: ${shell}. Valid options: leo, meo, geo, vleo`
    });
  }
  
  res.json({
    success: true,
    data: {
      shell,
      thresholds: getThresholds(userId)[shell],
      allThresholds: getThresholds(userId)
    },
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/risk-thresholds/reset
 * Reset thresholds to defaults
 * Body params:
 *   - userId: User ID (optional)
 */
router.post('/reset', asyncHandler(async (req, res) => {
  const { userId = 'default' } = req.body;
  
  const defaults = resetToDefaults(userId);
  
  res.json({
    success: true,
    data: {
      message: 'Thresholds reset to defaults',
      thresholds: defaults
    },
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/risk-thresholds/assess/:shell
 * Get risk assessment for a distance in a specific shell
 * Query params:
 *   - distance: Distance in km
 *   - userId: User ID (optional)
 */
router.get('/assess/:shell', asyncHandler(async (req, res) => {
  const { shell } = req.params;
  const { distance, userId = 'default' } = req.query;
  
  if (distance === undefined || isNaN(parseFloat(distance))) {
    return res.status(400).json({
      success: false,
      error: 'Invalid or missing distance parameter'
    });
  }
  
  const assessment = getRiskAssessment(parseFloat(distance), shell, userId);
  
  res.json({
    success: true,
    data: assessment,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/risk-thresholds/import
 * Import thresholds configuration
 * Body params:
 *   - thresholds: Thresholds object
 *   - preferences: User preferences object
 *   - userId: User ID
 */
router.post('/import', asyncHandler(async (req, res) => {
  const { thresholds, preferences, userId = 'default' } = req.body;
  
  const result = importThresholds(userId, { thresholds, preferences });
  
  if (!result.success) {
    return res.status(400).json({
      success: false,
      errors: result.errors
    });
  }
  
  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/risk-thresholds/export
 * Export thresholds configuration
 * Query params:
 *   - userId: User ID (optional)
 */
router.get('/export', asyncHandler(async (req, res) => {
  const { userId = 'default' } = req.query;
  
  const exported = exportThresholds(userId);
  
  res.json({
    success: true,
    data: exported,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/risk-thresholds/preferences
 * Get user preferences
 * Query params:
 *   - userId: User ID (optional)
 */
router.get('/preferences', asyncHandler(async (req, res) => {
  const { userId = 'default' } = req.query;
  
  const preferences = getAllUserPreferences(userId);
  
  res.json({
    success: true,
    data: preferences,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/risk-thresholds/preferences
 * Save user preference
 * Body params:
 *   - key: Preference key
 *   - value: Preference value
 *   - userId: User ID (optional)
 */
router.post('/preferences', asyncHandler(async (req, res) => {
  const { key, value } = req.body;
  const { userId = 'default' } = req.query;
  
  if (!key) {
    return res.status(400).json({
      success: false,
      error: 'Key is required'
    });
  }
  
  saveUserPreference(userId, key, value);
  
  res.json({
    success: true,
    data: {
      key,
      value,
      allPreferences: getAllUserPreferences(userId)
    },
    timestamp: new Date().toISOString()
  });
}));

module.exports = router;
