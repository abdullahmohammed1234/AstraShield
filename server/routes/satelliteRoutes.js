const express = require('express');
const router = express.Router();
const satelliteController = require('../controllers/satelliteController');

// Input validation helpers
const validateSatelliteId = (req, res, next) => {
  const id = req.params.id;
  if (!id || isNaN(parseInt(id))) {
    return res.status(400).json({ success: false, error: 'Invalid satellite ID' });
  }
  next();
};

const validateSearchQuery = (req, res, next) => {
  const { q, limit } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ success: false, error: 'Search query must be at least 2 characters' });
  }
  if (limit && (parseInt(limit) < 1 || parseInt(limit) > 100)) {
    return res.status(400).json({ success: false, error: 'Limit must be between 1 and 100' });
  }
  next();
};

// Route middleware with validation
router.get('/positions', satelliteController.getSatellitePositions);
router.get('/orbit/:id', validateSatelliteId, satelliteController.getSatelliteOrbit);
router.get('/search', validateSearchQuery, satelliteController.searchSatellites);
router.get('/statistics', satelliteController.getStatistics);
router.get('/:id', validateSatelliteId, satelliteController.getSatelliteById);
router.get('/', satelliteController.getAllSatellites);
router.post('/refresh', satelliteController.refreshTLE);

module.exports = router;
