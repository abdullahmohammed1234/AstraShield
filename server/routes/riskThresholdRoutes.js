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

router.get('/', asyncHandler(async (req, res) => {
  const userId = req.query.userId || 'default';
  const thresholds = getThresholds(userId);
  const stats = getThresholdStatistics(userId);
  res.json({
    success: true,
    data: { thresholds, statistics: stats, defaults: DEFAULT_THRESHOLDS },
    timestamp: new Date().toISOString()
  });
}));

router.get('/:shell', asyncHandler(async (req, res) => {
  const shell = req.params.shell;
  const userId = req.query.userId || 'default';
  const thresholds = getThresholds(userId);
  const shellThresholds = thresholds[shell];
  if (!shellThresholds) {
    return res.status(404).json({
      success: false,
      error: 'Invalid shell: ' + shell + '. Valid options: leo, meo, geo, vleo'
    });
  }
  res.json({ success: true, data: { shell: shell, ...shellThresholds }, timestamp: new Date().toISOString() });
}));

router.put('/:shell/:level', asyncHandler(async (req, res) => {
  const shell = req.params.shell;
  const level = req.params.level;
  const value = req.body.value;
  const userId = req.query.userId || 'default';
  if (value === undefined || isNaN(parseFloat(value))) {
    return res.status(400).json({ success: false, error: 'Invalid value parameter' });
  }
  const success = setThreshold(userId, shell, level, value);
  if (!success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid shell or level. Valid shells: leo, meo, geo, vleo. Valid levels: critical, high, medium, low'
    });
  }
  res.json({
    success: true,
    data: { shell: shell, level: level, value: parseFloat(value), currentThresholds: getThresholds(userId) },
    timestamp: new Date().toISOString()
  });
}));

router.post('/:shell', asyncHandler(async (req, res) => {
  const shell = req.params.shell;
  const critical = req.body.critical;
  const high = req.body.high;
  const medium = req.body.medium;
  const low = req.body.low;
  const userId = req.query.userId || 'default';
  const thresholds = { critical: critical, high: high, medium: medium, low: low };
  const success = setAllThresholdsForShell(userId, shell, thresholds);
  if (!success) {
    return res.status(400).json({ success: false, error: 'Invalid shell: ' + shell + '. Valid options: leo, meo, geo, vleo' });
  }
  res.json({
    success: true,
    data: { shell: shell, thresholds: getThresholds(userId)[shell], allThresholds: getThresholds(userId) },
    timestamp: new Date().toISOString()
  });
}));

router.post('/reset', asyncHandler(async (req, res) => {
  const userId = req.body.userId || 'default';
  const defaults = resetToDefaults(userId);
  res.json({
    success: true,
    data: { message: 'Thresholds reset to defaults', thresholds: defaults },
    timestamp: new Date().toISOString()
  });
}));

router.get('/assess/:shell', asyncHandler(async (req, res) => {
  const shell = req.params.shell;
  const distance = req.query.distance;
  const userId = req.query.userId || 'default';
  if (distance === undefined || isNaN(parseFloat(distance))) {
    return res.status(400).json({ success: false, error: 'Invalid or missing distance parameter' });
  }
  const assessment = getRiskAssessment(parseFloat(distance), shell, userId);
  res.json({ success: true, data: assessment, timestamp: new Date().toISOString() });
}));

router.post('/import', asyncHandler(async (req, res) => {
  const thresholds = req.body.thresholds;
  const preferences = req.body.preferences;
  const userId = req.body.userId || 'default';
  const result = importThresholds(userId, { thresholds: thresholds, preferences: preferences });
  if (!result.success) {
    return res.status(400).json({ success: false, errors: result.errors });
  }
  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

router.get('/export', asyncHandler(async (req, res) => {
  const userId = req.query.userId || 'default';
  const exported = exportThresholds(userId);
  res.json({ success: true, data: exported, timestamp: new Date().toISOString() });
}));

router.get('/preferences', asyncHandler(async (req, res) => {
  const userId = req.query.userId || 'default';
  const preferences = getAllUserPreferences(userId);
  res.json({ success: true, data: preferences, timestamp: new Date().toISOString() });
}));

router.post('/preferences', asyncHandler(async (req, res) => {
  const key = req.body.key;
  const value = req.body.value;
  const userId = req.query.userId || 'default';
  if (!key) {
    return res.status(400).json({ success: false, error: 'Key is required' });
  }
  saveUserPreference(userId, key, value);
  res.json({
    success: true,
    data: { key: key, value: value, allPreferences: getAllUserPreferences(userId) },
    timestamp: new Date().toISOString()
  });
}));

module.exports = router;
