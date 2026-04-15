/**
 * ML Prediction Routes
 * API endpoints for machine learning risk prediction and anomaly detection
 */

const express = require('express');
const router = express.Router();
const mlPredictionController = require('../controllers/mlPredictionController');

// Validation helpers
const validateHorizons = (req, res, next) => {
  const { horizons } = req.query;
  
  if (horizons) {
    const horizonList = horizons.split(',').map(h => parseInt(h.replace('h', '')));
    const validHorizons = [24, 48, 72, 96, 120, 168];
    
    for (const h of horizonList) {
      if (!validHorizons.includes(h)) {
        return res.status(400).json({
          success: false,
          error: `Invalid horizon: ${h}. Valid options: ${validHorizons.join(', ')}`
        });
      }
    }
  }
  
  next();
};

const validateNoradId = (req, res, next) => {
  const { noradCatId } = req.params;
  
  if (noradCatId && isNaN(parseInt(noradCatId))) {
    return res.status(400).json({
      success: false,
      error: 'Invalid NORAD catalog ID'
    });
  }
  
  next();
};

const validateDays = (req, res, next) => {
  const { days, limit } = req.query;
  
  if (days && (isNaN(parseInt(days)) || parseInt(days) < 1 || parseInt(days) > 365)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid days parameter (1-365)'
    });
  }
  
  if (limit && (isNaN(parseInt(limit)) || parseInt(limit) < 1 || parseInt(limit) > 1000)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid limit parameter (1-1000)'
    });
  }
  
  next();
};

// Risk Prediction Routes

/**
 * GET /api/ml/predictions
 * Get risk predictions for 24-72 hours ahead
 * Query params: horizons (comma-separated, e.g., "24h,48h,72h")
 */
router.get('/predictions', validateHorizons, mlPredictionController.getRiskPredictions);

/**
 * GET /api/ml/high-risk-periods
 * Get upcoming high-risk periods
 * Query params: days (number of days to forecast, default 7)
 */
router.get('/high-risk-periods', validateDays, mlPredictionController.getHighRiskPeriods);

/**
 * GET /api/ml/predictions/history
 * Get historical predictions
 * Query params: type, days, limit
 */
router.get('/predictions/history', validateDays, mlPredictionController.getPredictionHistory);

// Anomaly Detection Routes

/**
 * GET /api/ml/anomalies
 * Detect anomalies for all satellites
 * Query params: limit
 */
router.get('/anomalies', validateDays, mlPredictionController.detectAllAnomalies);

/**
 * GET /api/ml/anomalies/:noradCatId
 * Detect anomalies for a specific satellite
 */
router.get('/anomalies/:noradCatId', validateNoradId, mlPredictionController.detectSatelliteAnomalies);

/**
 * GET /api/ml/anomalies/:noradCatId/history
 * Get anomaly history for a satellite
 */
router.get('/anomalies/:noradCatId/history', validateNoradId, validateDays, mlPredictionController.getAnomalyHistory);

// Model Management Routes

/**
 * GET /api/ml/status
 * Get ML model status and metrics
 */
router.get('/status', mlPredictionController.getModelStatus);

/**
 * POST /api/ml/retrain
 * Retrain ML models with latest data
 */
router.post('/retrain', mlPredictionController.retrainModels);

module.exports = router;
