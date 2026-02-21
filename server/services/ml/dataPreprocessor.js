/**
 * ML Data Preprocessor
 * Handles historical conjunction data preprocessing for ML model training
 */

const RiskSnapshot = require('../../models/RiskSnapshot');
const Conjunction = require('../../models/Conjunction');
const Satellite = require('../../models/Satellite');

class MLDataPreprocessor {
  constructor() {
    this.featureColumns = [
      'hourOfDay',
      'dayOfWeek',
      'dayOfMonth',
      'month',
      'avgRisk',
      'totalObjects',
      'leoCount',
      'meoCount',
      'geoCount',
      'conjunctionRate',
      'historicalRiskMean',
      'historicalRiskStd',
      'riskTrend'
    ];
    
    this.labelColumn = 'futureRiskLevel';
    this.lookbackDays = 90;
    this.predictionHorizons = [24, 48, 72]; // hours
  }

  /**
   * Extract temporal features from a date
   */
  extractTemporalFeatures(date) {
    const d = new Date(date);
    return {
      hourOfDay: d.getUTCHours(),
      dayOfWeek: d.getUTCDay(),
      dayOfMonth: d.getUTCDate(),
      month: d.getUTCMonth() + 1
    };
  }

  /**
   * Get historical risk snapshots for training
   */
  async getHistoricalRiskData(days = 90) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const snapshots = await RiskSnapshot.find({
      type: 'daily',
      timestamp: { $gte: startDate }
    }).sort({ timestamp: 1 }).lean();

    return snapshots;
  }

  /**
   * Get conjunction data for feature engineering
   */
  async getConjunctionData(days = 90) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const conjunctions = await Conjunction.find({
      createdAt: { $gte: startDate }
    }).sort({ createdAt: 1 }).lean();

    // Aggregate by day
    const dailyConjunctions = {};
    for (const conj of conjunctions) {
      const dateKey = conj.createdAt.toISOString().split('T')[0];
      if (!dailyConjunctions[dateKey]) {
        dailyConjunctions[dateKey] = {
          total: 0,
          highRisk: 0,
          critical: 0,
          avgDistance: 0,
          maxProbability: 0
        };
      }
      dailyConjunctions[dateKey].total++;
      if (conj.riskLevel === 'high') dailyConjunctions[dateKey].highRisk++;
      if (conj.riskLevel === 'critical') dailyConjunctions[dateKey].critical++;
      dailyConjunctions[dateKey].avgDistance += conj.closestApproachDistance;
      if (conj.probabilityOfCollision > dailyConjunctions[dateKey].maxProbability) {
        dailyConjunctions[dateKey].maxProbability = conj.probabilityOfCollision;
      }
    }

    // Calculate averages
    for (const dateKey of Object.keys(dailyConjunctions)) {
      const data = dailyConjunctions[dateKey];
      data.avgDistance = data.total > 0 ? data.avgDistance / data.total : 0;
    }

    return dailyConjunctions;
  }

  /**
   * Create training dataset from historical data
   */
  async createTrainingDataset(days = 90) {
    console.log(`Creating ML training dataset for ${days} days...`);
    
    const riskSnapshots = await this.getHistoricalRiskData(days);
    const conjunctionData = await this.getConjunctionData(days);
    
    const trainingData = [];
    const labels = {};

    // Create features for each day
    for (let i = 0; i < riskSnapshots.length; i++) {
      const snapshot = riskSnapshots[i];
      const snapshotDate = new Date(snapshot.timestamp);
      const dateKey = snapshotDate.toISOString().split('T')[0];
      
      // Extract temporal features
      const temporalFeatures = this.extractTemporalFeatures(snapshotDate);
      
      // Get orbital distribution
      const orbitalDist = snapshot.orbitalDistribution || {};
      
      // Get conjunction data
      const conjData = conjunctionData[dateKey] || { total: 0, highRisk: 0, critical: 0, avgDistance: 0 };
      
      // Calculate historical statistics (lookback window)
      const lookbackStart = Math.max(0, i - 7);
      const historicalRisks = riskSnapshots.slice(lookbackStart, i).map(s => s.averageRisk);
      const historicalRiskMean = historicalRisks.length > 0 
        ? historicalRisks.reduce((a, b) => a + b, 0) / historicalRisks.length 
        : snapshot.averageRisk;
      const historicalRiskStd = historicalRisks.length > 1 
        ? Math.sqrt(historicalRisks.map(r => Math.pow(r - historicalRiskMean, 2)).reduce((a, b) => a + b, 0) / historicalRisks.length)
        : 0;
      
      // Calculate risk trend
      const riskTrend = historicalRisks.length >= 2 
        ? snapshot.averageRisk - historicalRisks[historicalRisks.length - 1]
        : 0;

      // Create feature vector
      const features = {
        ...temporalFeatures,
        avgRisk: snapshot.averageRisk || 0,
        totalObjects: snapshot.totalObjects || 0,
        leoCount: orbitalDist.leo || 0,
        meoCount: orbitalDist.meo || 0,
        geoCount: orbitalDist.geo || 0,
        conjunctionRate: conjData.total,
        historicalRiskMean,
        historicalRiskStd,
        riskTrend
      };

      // Create labels for each prediction horizon
      for (const horizon of this.predictionHorizons) {
        const futureIndex = i + Math.floor(horizon / 24);
        if (futureIndex < riskSnapshots.length) {
          const futureSnapshot = riskSnapshots[futureIndex];
          const futureRisk = futureSnapshot.averageRisk || 0;
          
          // Label: 0 = low, 1 = medium, 2 = high, 3 = critical
          let label;
          if (futureRisk < 0.3) label = 0;
          else if (futureRisk < 0.5) label = 1;
          else if (futureRisk < 0.7) label = 2;
          else label = 3;
          
          labels[`horizon_${horizon}h`] = label;
        }
      }

      trainingData.push({
        date: dateKey,
        features,
        labels
      });
    }

    console.log(`Created ${trainingData.length} training samples`);
    return trainingData;
  }

  /**
   * Prepare features for model input (normalization)
   */
  prepareFeatures(trainingData) {
    if (trainingData.length === 0) return { features: [], stats: {} };

    // Calculate feature statistics
    const stats = {};
    for (const col of this.featureColumns) {
      const values = trainingData.map(d => d.features[col]).filter(v => v !== undefined && v !== null);
      if (values.length > 0) {
        stats[col] = {
          min: Math.min(...values),
          max: Math.max(...values),
          mean: values.reduce((a, b) => a + b, 0) / values.length,
          std: Math.sqrt(values.map(v => Math.pow(v - values.reduce((a, b) => a + b, 0) / values.length, 2)).reduce((a, b) => a + b, 0) / values.length)
        };
      }
    }

    // Normalize features
    const normalizedFeatures = trainingData.map(d => {
      const normalized = {};
      for (const col of this.featureColumns) {
        const value = d.features[col];
        const stat = stats[col];
        if (value !== undefined && stat && stat.max > stat.min) {
          normalized[col] = (value - stat.min) / (stat.max - stat.min);
        } else {
          normalized[col] = 0;
        }
      }
      return normalized;
    });

    return { features: normalizedFeatures, stats };
  }

  /**
   * Generate features for current prediction
   */
  generateCurrentFeatures(riskData, conjunctionData) {
    const now = new Date();
    const temporalFeatures = this.extractTemporalFeatures(now);
    
    const orbitalDist = riskData.orbitalDistribution || {};
    const conjData = conjunctionData || { total: 0, highRisk: 0, critical: 0 };

    return {
      ...temporalFeatures,
      avgRisk: riskData.averageRisk || 0,
      totalObjects: riskData.totalObjects || 0,
      leoCount: orbitalDist.leo || 0,
      meoCount: orbitalDist.meo || 0,
      geoCount: orbitalDist.geo || 0,
      conjunctionRate: conjData.total || 0,
      historicalRiskMean: riskData.averageRisk || 0,
      historicalRiskStd: 0,
      riskTrend: 0
    };
  }

  /**
   * Get satellite behavioral features for anomaly detection
   */
  async getSatelliteBehavioralFeatures(noradCatId, lookbackDays = 30) {
    const startDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    
    // Get satellite data
    const satellite = await Satellite.findOne({ noradCatId }).lean();
    if (!satellite) return null;

    // Get historical risk snapshots for this satellite
    const riskHistory = await RiskSnapshot.find({
      type: 'daily',
      timestamp: { $gte: startDate }
    }).sort({ timestamp: 1 }).lean();

    // Get conjunction history
    const conjunctions = await Conjunction.find({
      $or: [
        { satellite1: noradCatId },
        { satellite2: noradCatId }
      ],
      createdAt: { $gte: startDate }
    }).sort({ createdAt: 1 }).lean();

    // Calculate behavioral features
    const features = {
      noradCatId,
      name: satellite.name,
      orbitalAltitude: satellite.orbitalAltitude,
      inclination: satellite.inclination,
      
      // Risk history features
      riskHistory: riskHistory.map(s => ({
        date: s.timestamp,
        risk: s.averageRisk
      })),
      
      // Conjunction features
      conjunctionCount: conjunctions.length,
      highRiskConjunctions: conjunctions.filter(c => c.riskLevel === 'high' || c.riskLevel === 'critical').length,
      avgClosestApproach: conjunctions.length > 0 
        ? conjunctions.reduce((a, c) => a + c.closestApproachDistance, 0) / conjunctions.length 
        : null,
      maxProbability: conjunctions.length > 0 
        ? Math.max(...conjunctions.map(c => c.probabilityOfCollision))
        : 0,
      
      // Behavioral statistics
      riskMean: riskHistory.length > 0 
        ? riskHistory.reduce((a, s) => a + (s.averageRisk || 0), 0) / riskHistory.length 
        : 0,
      riskStd: 0,
      riskTrend: 0,
      
      // TLE-derived features (changes indicate maneuvers)
      lastTleUpdate: satellite.lastUpdated,
      meanMotionChange: 0, // Would need historical TLE data
      eccentricityChange: 0
    };

    // Calculate risk standard deviation
    if (riskHistory.length > 1) {
      const mean = features.riskMean;
      features.riskStd = Math.sqrt(
        riskHistory.map(s => Math.pow((s.averageRisk || 0) - mean, 2)).reduce((a, b) => a + b, 0) / riskHistory.length
      );
    }

    // Calculate risk trend
    if (riskHistory.length >= 2) {
      const recent = riskHistory.slice(-7);
      const older = riskHistory.slice(0, 7);
      const recentMean = recent.reduce((a, s) => a + (s.averageRisk || 0), 0) / recent.length;
      const olderMean = older.reduce((a, s) => a + (s.averageRisk || 0), 0) / older.length;
      features.riskTrend = recentMean - olderMean;
    }

    return features;
  }
}

module.exports = new MLDataPreprocessor();
