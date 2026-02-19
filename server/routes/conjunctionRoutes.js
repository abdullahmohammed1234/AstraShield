const express = require('express');
const router = express.Router();
const {
  runDetection,
  getAll,
  getHighRisk,
  getStatistics,
  getDetailedAnalysis
} = require('../controllers/conjunctionController');

// Validation helpers
const validateConjunctionQuery = (req, res, next) => {
  const { limit, level } = req.query;
  
  if (limit && (parseInt(limit) < 1 || parseInt(limit) > 500)) {
    return res.status(400).json({ success: false, error: 'Invalid limit (1-500)' });
  }
  
  if (level && !['low', 'medium', 'high', 'critical'].includes(level)) {
    return res.status(400).json({ success: false, error: 'Invalid risk level' });
  }
  
  next();
};

// Routes with validation
router.post('/run', runDetection);
router.get('/', validateConjunctionQuery, getAll);
router.get('/high', validateConjunctionQuery, getHighRisk);
router.get('/stats', getStatistics);

// Detailed analysis route - must be before /:id to avoid conflicts
router.get('/analysis/:satA/:satB', getDetailedAnalysis);

module.exports = router;
