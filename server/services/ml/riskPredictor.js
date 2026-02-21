/**
 * ML Risk Predictor Service
 * Main service for ML-based risk prediction and anomaly detection
 */

const { RiskPredictionModel, AnomalyDetectionModel } = require('./mlModels');
const dataPreprocessor = require('./dataPreprocessor');
const RiskSnapshot = require('../../models/RiskSnapshot');
const Conjunction = require('../../models/Conjunction');
const Satellite = require('../../models/Satellite');

class MLRiskPredictor {
  constructor() {
    this.riskModel = new RiskPredictionModel();
    this.anomalyModel = new AnomalyDetectionModel();
    this.isInitialized = false;
    this.lastTraining = null;
    this.predictionCache = new Map();
    this.cacheTimeout = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Initialize and train ML models
   */
  async initialize() {
    console.log('Initializing ML Risk Predictor...');
    
    try {
      // Create training dataset from historical data
      const trainingData = await dataPreprocessor.createTrainingDataset(90);
      
      // Train risk prediction model
      if (trainingData.length > 0) {
        await this.riskModel.train(trainingData);
      }
      
      // Train anomaly detection model
      // Get behavioral data for multiple satellites
      const satellites = await Satellite.find({}).limit(100).lean();
      const behavioralData = [];
      
      for (const sat of satellites.slice(0, 50)) {
        const data = await dataPreprocessor.getSatelliteBehavioralFeatures(sat.noradCatId, 30);
        if (data) {
          behavioralData.push({
            riskMean: data.riskMean,
            riskStd: data.riskStd,
            riskTrend: data.riskTrend,
            conjunctionCount: data.conjunctionCount,
            highRiskConjunctions: data.highRiskConjunctions,
            maxProbability: data.maxProbability
          });
        }
      }
      
      if (behavioralData.length > 0) {
        await this.anomalyModel.train(behavioralData);
      }
      
      this.isInitialized = true;
      this.lastTraining = new Date();
      
      console.log('ML Risk Predictor initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing ML Risk Predictor:', error);
      return false;
    }
  }

  /**
   * Predict risk for next 24-72 hours
   */
  async predictRisk(horizons = [24, 48, 72]) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const predictions = {
      generatedAt: new Date(),
      horizons: {}
    };

    try {
      // Get current risk data
      const currentSnapshot = await RiskSnapshot.findOne({ type: 'daily' })
        .sort({ timestamp: -1 })
        .lean();
      
      // Get conjunction data for today
      const today = new Date().toISOString().split('T')[0];
      const todayConjunctions = await Conjunction.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(today),
              $lt: new Date(new Date(today).getTime() + 24 * 60 * 60 * 1000)
            }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            highRisk: { $sum: { $cond: [{ $eq: ['$riskLevel', 'high'] }, 1, 0] } },
            critical: { $sum: { $cond: [{ $eq: ['$riskLevel', 'critical'] }, 1, 0] } },
            avgDistance: { $avg: '$closestApproachDistance' }
          }
        }
      ]);

      const conjunctionData = todayConjunctions[0] || { total: 0, highRisk: 0, critical: 0, avgDistance: 0 };

      // Generate features for prediction
      const features = dataPreprocessor.generateCurrentFeatures(
        currentSnapshot || { averageRisk: 0, totalObjects: 0, orbitalDistribution: {} },
        conjunctionData
      );

      // Predict for each horizon
      for (const horizon of horizons) {
        // Add horizon-specific adjustments
        const horizonFeatures = {
          ...features,
          horizon // Include horizon as feature
        };
        
        const prediction = this.riskModel.predict(horizonFeatures);
        
        predictions.horizons[`${horizon}h`] = {
          predictedRiskLevel: prediction.riskLevel,
          riskLevelLabel: prediction.riskLevelLabel,
          confidence: prediction.confidence,
          probabilities: prediction.probabilities,
          predictedAt: new Date(),
          validUntil: new Date(Date.now() + horizon * 60 * 60 * 1000)
        };
      }

      // Cache predictions
      const cacheKey = `risk_${horizons.join('_')}`;
      this.predictionCache.set(cacheKey, {
        data: predictions,
        timestamp: Date.now()
      });

      return predictions;
    } catch (error) {
      console.error('Error predicting risk:', error);
      return {
        error: error.message,
        generatedAt: new Date()
      };
    }
  }

  /**
   * Detect anomalies for a specific satellite
   */
  async detectAnomalies(noradCatId) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Get current behavioral data
      const currentData = await dataPreprocessor.getSatelliteBehavioralFeatures(noradCatId, 7);
      
      if (!currentData) {
        return {
          error: 'Satellite not found',
          noradCatId
        };
      }

      // Get historical data for drift detection
      const historicalData = await dataPreprocessor.getSatelliteBehavioralFeatures(noradCatId, 30);
      
      // Run anomaly detection
      const result = this.anomalyModel.detect(
        {
          riskMean: currentData.riskMean,
          riskStd: currentData.riskStd,
          riskTrend: currentData.riskTrend,
          conjunctionCount: currentData.conjunctionCount,
          highRiskConjunctions: currentData.highRiskConjunctions,
          maxProbability: currentData.maxProbability
        },
        historicalData ? [{ riskMean: historicalData.riskMean }] : []
      );

      return {
        noradCatId,
        name: currentData.name,
        orbitalAltitude: currentData.orbitalAltitude,
        ...result
      };
    } catch (error) {
      console.error('Error detecting anomalies:', error);
      return {
        error: error.message,
        noradCatId
      };
    }
  }

  /**
   * Detect anomalies for all satellites
   */
  async detectAllAnomalies(limit = 100) {
    const satellites = await Satellite.find({})
      .sort({ riskScore: -1 })
      .limit(limit)
      .lean();

    const results = {
      generatedAt: new Date(),
      totalAnalyzed: satellites.length,
      anomalies: []
    };

    for (const sat of satellites) {
      const anomalyResult = await this.detectAnomalies(sat.noradCatId);
      
      if (anomalyResult.hasAnomaly) {
        results.anomalies.push({
          noradCatId: sat.noradCatId,
          name: sat.name,
          orbitalAltitude: sat.orbitalAltitude,
          currentRisk: sat.riskScore,
          ...anomalyResult
        });
      }
    }

    // Sort by anomaly score
    results.anomalies.sort((a, b) => b.anomalyScore - a.anomalyScore);
    results.anomalyCount = results.anomalies.length;
    results.criticalCount = results.anomalies.filter(a => a.severity === 'critical').length;
    results.highCount = results.anomalies.filter(a => a.severity === 'high').length;

    return results;
  }

  /**
   * Get high-risk period predictions
   */
  async getHighRiskPeriods(days = 7) {
    const predictions = await this.predictRisk([24, 48, 72]);
    
    const highRiskPeriods = [];
    const now = Date.now();

    for (const [horizon, data] of Object.entries(predictions.horizons || {})) {
      if (data.riskLevelLabel === 'high' || data.riskLevelLabel === 'critical') {
        highRiskPeriods.push({
          horizon,
          startTime: new Date(now + parseInt(horizon.replace('h', '')) * 60 * 60 * 1000),
          riskLevel: data.riskLevelLabel,
          confidence: data.confidence,
          probability: data.probabilities[data.predictedRiskLevel]
        });
      }
    }

    return {
      predictedAt: predictions.generatedAt,
      highRiskPeriods,
      overallRisk: predictions.horizons?.['24h']?.riskLevelLabel || 'unknown'
    };
  }

  /**
   * Get model status and metrics
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      lastTraining: this.lastTraining,
      riskModel: this.riskModel.getMetrics(),
      anomalyModel: this.anomalyModel.getMetrics(),
      cacheSize: this.predictionCache.size
    };
  }

  /**
   * Retrain models with latest data
   */
  async retrain() {
    console.log('Retraining ML models...');
    this.isInitialized = false;
    return this.initialize();
  }
}

// Export singleton instance
module.exports = new MLRiskPredictor();
