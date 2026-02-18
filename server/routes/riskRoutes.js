const express = require('express');
const router = express.Router();
const riskController = require('../controllers/riskController');

// Validation helpers
const validateSimulateRequest = (req, res, next) => {
  const { noradCatId, newAltitude, newInclination } = req.body;
  
  if (!noradCatId) {
    return res.status(400).json({ success: false, error: 'Satellite ID required' });
  }
  
  if (newAltitude !== undefined && (isNaN(newAltitude) || newAltitude < 200 || newAltitude > 50000)) {
    return res.status(400).json({ success: false, error: 'Invalid altitude (200-50000 km)' });
  }
  
  if (newInclination !== undefined && (isNaN(newInclination) || newInclination < 0 || newInclination > 180)) {
    return res.status(400).json({ success: false, error: 'Invalid inclination (0-180 degrees)' });
  }
  
  next();
};

const validateRiskQuery = (req, res, next) => {
  const { minRisk, limit } = req.query;
  
  if (minRisk !== undefined && (isNaN(minRisk) || minRisk < 0 || minRisk > 1)) {
    return res.status(400).json({ success: false, error: 'Invalid minRisk (0-1)' });
  }
  
  if (limit && (parseInt(limit) < 1 || parseInt(limit) > 1000)) {
    return res.status(400).json({ success: false, error: 'Invalid limit (1-1000)' });
  }
  
  next();
};

// Apply validation
router.post('/simulate', validateSimulateRequest, riskController.simulateAdjustment);
router.get('/', validateRiskQuery, riskController.getRisks);

// Other routes
router.post('/calculate', riskController.calculateRisks);
router.get('/alerts', riskController.getHighRiskAlerts);
router.get('/statistics', riskController.getStatistics);
router.get('/congestion', riskController.getCongestionData);
router.get('/clusters', riskController.getClusterPositions);
router.get('/density', riskController.getHighDensityRegions);

module.exports = router;
