/**
 * ML Prediction Model
 * Stores machine learning predictions for risk forecasting
 */

const mongoose = require('mongoose');

const mlPredictionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['risk_forecast', 'anomaly_detection', 'conjunction_prediction'],
    required: true,
    index: true
  },
  // For risk forecasts
  horizons: {
    '24h': {
      predictedRiskLevel: Number,
      riskLevelLabel: String,
      confidence: Number,
      probabilities: [Number]
    },
    '48h': {
      predictedRiskLevel: Number,
      riskLevelLabel: String,
      confidence: Number,
      probabilities: [Number]
    },
    '72h': {
      predictedRiskLevel: Number,
      riskLevelLabel: String,
      confidence: Number,
      probabilities: [Number]
    }
  },
  // For satellite-specific predictions
  satelliteId: {
    type: Number,
    index: true
  },
  // For anomaly detection
  anomalyDetection: {
    hasAnomaly: Boolean,
    anomalyCount: Number,
    anomalyScore: Number,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    },
    anomalies: [{
      type: String,
      description: String,
      severity: String,
      value: Number,
      expectedValue: Number
    }]
  },
  // Prediction metadata
  validFrom: {
    type: Date,
    default: Date.now
  },
  validUntil: {
    type: Date
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  // Model information
  modelVersion: {
    type: String,
    default: '1.0.0'
  },
  modelType: {
    type: String,
    default: 'gradient_boosted'
  },
  // Confidence and accuracy metrics
  confidence: {
    type: Number,
    min: 0,
    max: 1
  },
  // Input features used for prediction
  inputFeatures: {
    avgRisk: Number,
    totalObjects: Number,
    conjunctionRate: Number,
    hourOfDay: Number,
    dayOfWeek: Number,
    month: Number
  }
});

// Indexes for efficient queries
mlPredictionSchema.index({ type: 1, generatedAt: -1 });
mlPredictionSchema.index({ satelliteId: 1, generatedAt: -1 });
mlPredictionSchema.index({ validUntil: 1 }, { expireAfterSeconds: 0 });

// Static method to get latest prediction
mlPredictionSchema.statics.getLatestForecast = async function() {
  return this.findOne({ type: 'risk_forecast' })
    .sort({ generatedAt: -1 })
    .lean();
};

// Static method to get satellite anomaly history
mlPredictionSchema.statics.getAnomalyHistory = async function(noradCatId, days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.find({
    type: 'anomaly_detection',
    satelliteId: noradCatId,
    generatedAt: { $gte: since }
  })
    .sort({ generatedAt: -1 })
    .lean();
};

// Static method to save prediction
mlPredictionSchema.statics.savePrediction = async function(predictionData) {
  const prediction = new this(predictionData);
  return prediction.save();
};

module.exports = mongoose.model('MLPrediction', mlPredictionSchema);
