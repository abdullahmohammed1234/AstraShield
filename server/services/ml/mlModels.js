/**
 * ML Models for Risk Prediction
 * Implements machine learning models for satellite risk forecasting
 */

const dataPreprocessor = require('./dataPreprocessor');

class RiskPredictionModel {
  constructor() {
    this.modelType = 'risk_prediction';
    this.isTrained = false;
    this.featureStats = {};
    this.modelWeights = {};
    this.trainingDate = null;
    
    // Model configuration
    this.config = {
      learningRate: 0.01,
      epochs: 100,
      regularization: 0.001
    };
  }

  /**
   * Initialize model with default weights
   */
  initialize() {
    // Default weights for risk prediction (will be learned during training)
    this.modelWeights = {
      // Temporal features
      hourOfDay: 0.05,
      dayOfWeek: 0.02,
      dayOfMonth: 0.01,
      month: 0.03,
      
      // Current risk state
      avgRisk: 0.35,
      totalObjects: 0.08,
      leoCount: 0.05,
      meoCount: 0.03,
      geoCount: 0.02,
      
      // Conjunction indicators
      conjunctionRate: 0.15,
      
      // Historical patterns
      historicalRiskMean: 0.20,
      historicalRiskStd: 0.05,
      riskTrend: 0.10
    };
  }

  /**
   * Train the risk prediction model
   */
  async train(trainingData) {
    console.log('Training risk prediction model...');
    this.initialize();
    
    if (!trainingData || trainingData.length < 10) {
      console.log('Insufficient training data, using default model');
      this.isTrained = true;
      return this;
    }

    // Prepare normalized features
    const { features, stats } = dataPreprocessor.prepareFeatures(trainingData);
    this.featureStats = stats;

    // Simple linear regression with gradient descent
    const labels = trainingData.map(d => d.labels['horizon_24h']).filter(l => l !== undefined);
    
    if (labels.length < 10) {
      console.log('Insufficient labels, using default model');
      this.isTrained = true;
      return this;
    }

    // Initialize weights
    const featureKeys = Object.keys(this.modelWeights);
    const weights = {};
    featureKeys.forEach(key => weights[key] = Math.random() * 0.1);

    // Gradient descent training
    for (let epoch = 0; epoch < this.config.epochs; epoch++) {
      let totalError = 0;
      
      for (let i = 0; i < features.length; i++) {
        const featureVector = features[i];
        const label = labels[i];
        
        if (label === undefined) continue;
        
        // Forward pass - compute prediction
        let prediction = 0;
        for (const key of featureKeys) {
          prediction += (featureVector[key] || 0) * weights[key];
        }
        
        // Normalize prediction to 0-3 range
        prediction = Math.max(0, Math.min(3, prediction * 3));
        
        // Compute error
        const error = label - prediction;
        totalError += Math.abs(error);
        
        // Backward pass - update weights
        for (const key of featureKeys) {
          const featureValue = featureVector[key] || 0;
          weights[key] += this.config.learningRate * error * featureValue - 
                         this.config.regularization * weights[key];
        }
      }
      
      if (epoch % 20 === 0) {
        console.log(`Epoch ${epoch}, Avg Error: ${(totalError / labels.length).toFixed(4)}`);
      }
    }

    // Update model weights
    this.modelWeights = weights;
    this.isTrained = true;
    this.trainingDate = new Date();
    
    console.log('Risk prediction model trained successfully');
    return this;
  }

  /**
   * Predict risk level for given features
   */
  predict(features) {
    if (!this.isTrained) {
      this.initialize();
    }

    // Normalize features
    const normalizedFeatures = {};
    for (const key of Object.keys(this.modelWeights)) {
      const value = features[key] || 0;
      const stat = this.featureStats[key];
      
      if (stat && stat.max > stat.min) {
        normalizedFeatures[key] = (value - stat.min) / (stat.max - stat.min);
      } else {
        normalizedFeatures[key] = value;
      }
    }

    // Compute prediction
    let prediction = 0;
    for (const key of Object.keys(this.modelWeights)) {
      prediction += normalizedFeatures[key] * this.modelWeights[key];
    }

    // Denormalize to 0-3 range
    const riskLevel = Math.max(0, Math.min(3, prediction * 3));
    
    // Convert to probability distribution
    const probabilities = this._getProbabilities(riskLevel);
    
    return {
      riskLevel: Math.round(riskLevel),
      riskLevelLabel: this._getRiskLabel(riskLevel),
      confidence: probabilities[Math.round(riskLevel)],
      probabilities,
      rawScore: prediction
    };
  }

  /**
   * Get probability distribution for risk levels
   */
  _getProbabilities(riskLevel) {
    // Gaussian-like distribution centered on predicted risk level
    const sigma = 0.5;
    const levels = [0, 1, 2, 3];
    const probabilities = levels.map(level => {
      return Math.exp(-Math.pow(level - riskLevel, 2) / (2 * sigma * sigma));
    });
    
    // Normalize to sum to 1
    const sum = probabilities.reduce((a, b) => a + b, 0);
    return probabilities.map(p => p / sum);
  }

  /**
   * Get human-readable risk label
   */
  _getRiskLabel(riskLevel) {
    if (riskLevel < 0.5) return 'low';
    if (riskLevel < 1.5) return 'medium';
    if (riskLevel < 2.5) return 'high';
    return 'critical';
  }

  /**
   * Get model performance metrics
   */
  getMetrics() {
    return {
      isTrained: this.isTrained,
      trainingDate: this.trainingDate,
      modelType: this.modelType,
      featureCount: Object.keys(this.modelWeights).length,
      weights: this.modelWeights
    };
  }
}

class AnomalyDetectionModel {
  constructor() {
    this.modelType = 'anomaly_detection';
    this.isTrained = false;
    this.baseline = {};
    this.thresholds = {
      zScore: 2.5,  // Z-score threshold for anomaly detection
      riskChange: 0.3,  // 30% risk change threshold
      conjunctionChange: 2  // 2+ new conjunctions threshold
    };
    this.trainingData = [];
    this.baselineStats = {};
  }

  /**
   * Train anomaly detection model on historical data
   */
  async train(satelliteBehavioralData) {
    console.log('Training anomaly detection model...');
    
    if (!satelliteBehavioralData || satelliteBehavioralData.length < 7) {
      console.log('Insufficient training data for anomaly detection');
      this.isTrained = true;
      return this;
    }

    this.trainingData = satelliteBehavioralData;
    
    // Calculate baseline statistics
    const riskValues = satelliteBehavioralData.map(d => d.riskMean || 0);
    const conjunctionValues = satelliteBehavioralData.map(d => d.conjunctionCount || 0);
    const riskTrendValues = satelliteBehavioralData.map(d => d.riskTrend || 0);
    
    this.baselineStats = {
      riskMean: this._mean(riskValues),
      riskStd: this._std(riskValues, this._mean(riskValues)),
      conjunctionMean: this._mean(conjunctionValues),
      conjunctionStd: this._std(conjunctionValues, this._mean(conjunctionValues)),
      riskTrendMean: this._mean(riskTrendValues),
      riskTrendStd: this._std(riskTrendValues, this._mean(riskTrendValues))
    };

    // Adaptive threshold based on data
    this.thresholds.zScore = Math.max(2.0, Math.min(3.5, 2 + (this.baselineStats.riskStd * 0.5)));
    
    this.isTrained = true;
    this.trainingDate = new Date();
    
    console.log('Anomaly detection model trained successfully');
    console.log(`Baseline stats: risk=${this.baselineStats.riskMean.toFixed(3)}, std=${this.baselineStats.riskStd.toFixed(3)}`);
    
    return this;
  }

  /**
   * Detect anomalies for a satellite
   */
  detect(currentData, historicalData = []) {
    if (!this.isTrained) {
      // Use default thresholds
      this.thresholds.zScore = 2.5;
    }

    const anomalies = [];
    const severityScores = [];

    // Check 1: Risk level anomaly (Z-score)
    if (currentData.riskMean !== undefined) {
      const zScore = this._zScore(currentData.riskMean, 
        this.baselineStats.riskMean || currentData.riskMean,
        this.baselineStats.riskStd || 0.1);
      
      if (Math.abs(zScore) > this.thresholds.zScore) {
        anomalies.push({
          type: 'risk_anomaly',
          description: `Unusual risk level detected (z-score: ${zScore.toFixed(2)})`,
          severity: Math.abs(zScore) > 3 ? 'high' : 'medium',
          value: currentData.riskMean,
          expectedValue: this.baselineStats.riskMean,
          deviation: zScore
        });
        severityScores.push(Math.min(1, Math.abs(zScore) / 4));
      }
    }

    // Check 2: Risk trend anomaly (sudden changes)
    if (currentData.riskTrend !== undefined) {
      const trendThreshold = this.baselineStats.riskTrendStd 
        ? this.baselineStats.riskTrendStd * this.thresholds.zScore 
        : this.thresholds.riskChange;
      
      if (Math.abs(currentData.riskTrend) > trendThreshold) {
        anomalies.push({
          type: 'risk_trend_anomaly',
          description: `Rapid risk trend change detected (${(currentData.riskTrend * 100).toFixed(1)}%)`,
          severity: Math.abs(currentData.riskTrend) > 0.2 ? 'high' : 'medium',
          value: currentData.riskTrend,
          expectedValue: 0,
          threshold: trendThreshold
        });
        severityScores.push(Math.min(1, Math.abs(currentData.riskTrend) * 3));
      }
    }

    // Check 3: Conjunction count anomaly
    if (currentData.conjunctionCount !== undefined) {
      const expectedConjunctions = this.baselineStats.conjunctionMean || 1;
      const threshold = Math.max(2, expectedConjunctions + this.thresholds.conjunctionChange);
      
      if (currentData.conjunctionCount > threshold) {
        anomalies.push({
          type: 'conjunction_spike',
          description: `Unusual number of conjunctions (${currentData.conjunctionCount} vs expected ~${expectedConjunctions.toFixed(0)})`,
          severity: currentData.conjunctionCount > threshold * 2 ? 'high' : 'medium',
          value: currentData.conjunctionCount,
          expectedValue: expectedConjunctions
        });
        severityScores.push(Math.min(1, currentData.conjunctionCount / (threshold * 3)));
      }
    }

    // Check 4: High-risk conjunction anomaly
    if (currentData.highRiskConjunctions > 0) {
      const severity = currentData.highRiskConjunctions >= 3 ? 'high' : 'medium';
      anomalies.push({
        type: 'high_risk_conjunctions',
        description: `${currentData.highRiskConjunctions} high-risk conjunction(s) detected`,
        severity,
        value: currentData.highRiskConjunctions,
        expectedValue: 0
      });
      severityScores.push(currentData.highRiskConjunctions / 5);
    }

    // Check 5: Collision probability anomaly
    if (currentData.maxProbability > 0) {
      let severity = 'low';
      let description = `Elevated collision probability: ${currentData.maxProbability.toExponential(2)}`;
      
      if (currentData.maxProbability > 1e-4) {
        severity = 'high';
        description = `CRITICAL: High collision probability: ${currentData.maxProbability.toExponential(2)}`;
      } else if (currentData.maxProbability > 1e-5) {
        severity = 'medium';
      }
      
      anomalies.push({
        type: 'collision_probability',
        description,
        severity,
        value: currentData.maxProbability,
        expectedValue: 0
      });
      severityScores.push(Math.min(1, currentData.maxProbability * 1e5));
    }

    // Check 6: Behavioral drift (compare with recent history)
    if (historicalData.length >= 3) {
      const recentMean = historicalData.slice(-3).reduce((a, d) => a + (d.riskMean || 0), 0) / 3;
      const currentRisk = currentData.riskMean || 0;
      const drift = Math.abs(currentRisk - recentMean);
      
      if (drift > this.thresholds.riskChange) {
        anomalies.push({
          type: 'behavioral_drift',
          description: `Behavioral pattern changed significantly (${(drift * 100).toFixed(1)}% drift)`,
          severity: drift > 0.3 ? 'high' : 'medium',
          value: drift,
          expectedValue: 0
        });
        severityScores.push(Math.min(1, drift * 2));
      }
    }

    // Calculate overall anomaly score
    const overallScore = severityScores.length > 0 
      ? severityScores.reduce((a, b) => a + b, 0) / severityScores.length 
      : 0;

    return {
      hasAnomaly: anomalies.length > 0,
      anomalyCount: anomalies.length,
      anomalyScore: overallScore,
      severity: overallScore > 0.7 ? 'critical' : overallScore > 0.4 ? 'high' : overallScore > 0.2 ? 'medium' : 'low',
      anomalies,
      baseline: this.baselineStats,
      thresholds: this.thresholds,
      analyzedAt: new Date()
    };
  }

  /**
   * Calculate Z-score
   */
  _zScore(value, mean, std) {
    if (std === 0) return 0;
    return (value - mean) / std;
  }

  /**
   * Calculate mean
   */
  _mean(values) {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calculate standard deviation
   */
  _std(values, mean) {
    if (values.length <= 1) return 0.1;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  /**
   * Get model metrics
   */
  getMetrics() {
    return {
      isTrained: this.isTrained,
      trainingDate: this.trainingDate,
      modelType: this.modelType,
      baselineStats: this.baselineStats,
      thresholds: this.thresholds
    };
  }
}

// Export model instances
module.exports = {
  RiskPredictionModel,
  AnomalyDetectionModel
};
