/**
 * ML Prediction Controller
 * Handles API endpoints for ML-based risk prediction and anomaly detection
 */

const mlRiskPredictor = require('../services/ml/riskPredictor');
const MLPrediction = require('../models/MLPrediction');
const logger = require('../utils/logger');

/**
 * Get risk predictions for 24-72 hours ahead
 */
const getRiskPredictions = async (req, res) => {
  try {
    const { horizons } = req.query;
    
    const horizonList = horizons 
      ? horizons.split(',').map(h => parseInt(h.replace('h', '')))
      : [24, 48, 72];
    
    // Check cache first
    const cacheKey = `risk_${horizonList.join('_')}`;
    const cached = mlRiskPredictor.predictionCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < mlRiskPredictor.cacheTimeout) {
      return res.json({
        success: true,
        source: 'cache',
        ...cached.data
      });
    }
    
    // Generate fresh predictions
    const predictions = await mlRiskPredictor.predictRisk(horizonList);
    
    // Save to database
    try {
      await MLPrediction.savePrediction({
        type: 'risk_forecast',
        horizons: predictions.horizons,
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
        generatedAt: predictions.generatedAt
      });
    } catch (dbError) {
      logger.warn('Failed to save prediction to database:', dbError.message);
    }
    
    res.json({
      success: true,
      source: 'prediction',
      ...predictions
    });
  } catch (error) {
    logger.error('Error getting risk predictions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get high-risk period forecasts
 */
const getHighRiskPeriods = async (req, res) => {
  try {
    const { days } = req.query;
    
    const highRiskPeriods = await mlRiskPredictor.getHighRiskPeriods(
      parseInt(days) || 7
    );
    
    res.json({
      success: true,
      ...highRiskPeriods
    });
  } catch (error) {
    logger.error('Error getting high risk periods:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Detect anomalies for a specific satellite
 */
const detectSatelliteAnomalies = async (req, res) => {
  try {
    const { noradCatId } = req.params;
    
    if (!noradCatId) {
      return res.status(400).json({
        success: false,
        error: 'Satellite ID required'
      });
    }
    
    const result = await mlRiskPredictor.detectAnomalies(parseInt(noradCatId));
    
    if (result.error) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }
    
    // Save anomaly to database if detected
    if (result.hasAnomaly) {
      try {
        await MLPrediction.savePrediction({
          type: 'anomaly_detection',
          satelliteId: parseInt(noradCatId),
          anomalyDetection: {
            hasAnomaly: result.hasAnomaly,
            anomalyCount: result.anomalyCount,
            anomalyScore: result.anomalyScore,
            severity: result.severity,
            anomalies: result.anomalies
          },
          validUntil: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours
          generatedAt: result.analyzedAt
        });
      } catch (dbError) {
        logger.warn('Failed to save anomaly to database:', dbError.message);
      }
    }
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error detecting anomalies:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Detect anomalies for all high-risk satellites
 */
const detectAllAnomalies = async (req, res) => {
  try {
    const { limit } = req.query;
    
    const results = await mlRiskPredictor.detectAllAnomalies(
      parseInt(limit) || 100
    );
    
    res.json({
      success: true,
      ...results
    });
  } catch (error) {
    logger.error('Error detecting all anomalies:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get ML model status and metrics
 */
const getModelStatus = async (req, res) => {
  try {
    const status = mlRiskPredictor.getStatus();
    
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    logger.error('Error getting model status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Retrain ML models
 */
const retrainModels = async (req, res) => {
  try {
    logger.info('Retraining ML models...');
    
    const result = await mlRiskPredictor.retrain();
    
    res.json({
      success: result,
      message: result ? 'Models retrained successfully' : 'Retraining failed',
      retrainedAt: new Date()
    });
  } catch (error) {
    logger.error('Error retraining models:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get historical predictions
 */
const getPredictionHistory = async (req, res) => {
  try {
    const { type, days, limit } = req.query;
    
    const query = { type: type || 'risk_forecast' };
    
    if (days) {
      const since = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);
      query.generatedAt = { $gte: since };
    }
    
    const predictions = await MLPrediction.find(query)
      .sort({ generatedAt: -1 })
      .limit(parseInt(limit) || 30)
      .lean();
    
    res.json({
      success: true,
      count: predictions.length,
      predictions
    });
  } catch (error) {
    logger.error('Error getting prediction history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get anomaly history for a satellite
 */
const getAnomalyHistory = async (req, res) => {
  try {
    const { noradCatId } = req.params;
    const { days } = req.query;
    
    if (!noradCatId) {
      return res.status(400).json({
        success: false,
        error: 'Satellite ID required'
      });
    }
    
    const anomalies = await MLPrediction.getAnomalyHistory(
      parseInt(noradCatId),
      parseInt(days) || 7
    );
    
    res.json({
      success: true,
      noradCatId: parseInt(noradCatId),
      count: anomalies.length,
      anomalies
    });
  } catch (error) {
    logger.error('Error getting anomaly history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  getRiskPredictions,
  getHighRiskPeriods,
  detectSatelliteAnomalies,
  detectAllAnomalies,
  getModelStatus,
  retrainModels,
  getPredictionHistory,
  getAnomalyHistory
};
