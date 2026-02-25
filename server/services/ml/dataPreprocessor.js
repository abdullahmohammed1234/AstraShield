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
      // Cyclical temporal features (sin/cos encoded)
      'hourSin',
      'hourCos',
      'dayOfWeekSin',
      'dayOfWeekCos',
      'dayOfMonthSin',
      'dayOfMonthCos',
      'monthSin',
      'monthCos',
      // Orbital features
      'avgRisk',
      'totalObjects',
      'leoCount',
      'meoCount',
      'geoCount',
      'conjunctionRate',
      'historicalRiskMean',
      'historicalRiskStd',
      'riskTrend',
      // Satellite-specific features
      'maneuverCount',
      'meanMotionChange',
      'operatorRiskIndex',
      'operatorConjunctionRate',
      // Space weather features
      'solarFlux',
      'geomagneticIndex',
      'spaceWeatherAlertLevel'
    ];
    
    this.labelColumn = 'futureRiskLevel';
    this.lookbackDays = 90;
    this.predictionHorizons = [24, 48, 72]; // hours
  }

  /**
   * Apply cyclical encoding (sin/cos transforms) to temporal features
   * This preserves the cyclical nature of time (e.g., 23:00 is close to 00:00)
   */
  applyCyclicalEncoding(features) {
    const cyclicalFeatures = {};
    
    // Hour of day (24-hour cycle)
    const hour = features.hourOfDay || 0;
    cyclicalFeatures.hourSin = Math.sin(2 * Math.PI * hour / 24);
    cyclicalFeatures.hourCos = Math.cos(2 * Math.PI * hour / 24);
    
    // Day of week (7-day cycle)
    const dayOfWeek = features.dayOfWeek || 0;
    cyclicalFeatures.dayOfWeekSin = Math.sin(2 * Math.PI * dayOfWeek / 7);
    cyclicalFeatures.dayOfWeekCos = Math.cos(2 * Math.PI * dayOfWeek / 7);
    
    // Day of month (approximate 30-day cycle)
    const dayOfMonth = features.dayOfMonth || 1;
    cyclicalFeatures.dayOfMonthSin = Math.sin(2 * Math.PI * dayOfMonth / 30);
    cyclicalFeatures.dayOfMonthCos = Math.cos(2 * Math.PI * dayOfMonth / 30);
    
    // Month of year (12-month cycle)
    const month = features.month || 1;
    cyclicalFeatures.monthSin = Math.sin(2 * Math.PI * (month - 1) / 12);
    cyclicalFeatures.monthCos = Math.cos(2 * Math.PI * (month - 1) / 12);
    
    return cyclicalFeatures;
  }

  /**
   * Extract temporal features from a date with cyclical encoding
   */
  extractTemporalFeatures(date) {
    const d = new Date(date);
    const rawFeatures = {
      hourOfDay: d.getUTCHours(),
      dayOfWeek: d.getUTCDay(),
      dayOfMonth: d.getUTCDate(),
      month: d.getUTCMonth() + 1
    };
    
    // Apply cyclical encoding
    return {
      ...rawFeatures,
      ...this.applyCyclicalEncoding(rawFeatures)
    };
  }

  /**
   * Get space weather data from external API or cached data
   * Integrates solar activity and geomagnetic indices
   */
  async getSpaceWeatherData(date = new Date()) {
    // In production, this would call external APIs like:
    // - NOAA Space Weather Prediction Center
    // - CelesTrak for solar flux
    // For now, return simulated/cached data structure
    const dateKey = date.toISOString().split('T')[0];
    
    // Simulated space weather data (would be fetched from external APIs)
    const spaceWeatherCache = this._spaceWeatherCache || {};
    
    if (spaceWeatherCache[dateKey]) {
      return spaceWeatherCache[dateKey];
    }
    
    // Default values - in production, fetch from NOAA SWPC
    const spaceWeatherData = {
      date: dateKey,
      solarFlux: 150, // SFU (Solar Flux Unit) - typical range 70-300
      geomagneticIndex: 2, // Kp index (0-9)
      solarFlareClass: 'C', // A, B, C, M, X
      coronalMassEjection: false,
      spaceWeatherAlertLevel: 1 // 1-5 scale
    };
    
    // Adjust based on solar cycle (simplified)
    const month = date.getUTCMonth();
    const solarCyclePhase = Math.sin(2 * Math.PI * month / 132); // ~11 year cycle
    spaceWeatherData.solarFlux = 100 + solarCyclePhase * 50 + (Math.random() * 40 - 20);
    
    // Geomagnetic activity tends to be higher during equinoxes
    if (month === 2 || month === 3 || month === 8 || month === 9) {
      spaceWeatherData.geomagneticIndex = Math.min(9, Math.floor(spaceWeatherData.geomagneticIndex + 2 + Math.random() * 2));
    }
    
    // Set alert level based on conditions
    if (spaceWeatherData.solarFlux > 200 || spaceWeatherData.geomagneticIndex >= 6) {
      spaceWeatherData.spaceWeatherAlertLevel = 3;
    } else if (spaceWeatherData.solarFlux > 150 || spaceWeatherData.geomagneticIndex >= 4) {
      spaceWeatherData.spaceWeatherAlertLevel = 2;
    } else {
      spaceWeatherData.spaceWeatherAlertLevel = 1;
    }
    
    // Cache the data
    if (!this._spaceWeatherCache) {
      this._spaceWeatherCache = {};
    }
    this._spaceWeatherCache[dateKey] = spaceWeatherData;
    
    return spaceWeatherData;
  }

  /**
   * Get satellite-specific features including maneuver history
   */
  async getSatelliteSpecificFeatures(noradCatId, lookbackDays = 30) {
    const startDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    
    const satellite = await Satellite.findOne({ noradCatId }).lean();
    if (!satellite) {
      return {
        maneuverCount: 0,
        meanMotionChange: 0,
        operatorRiskIndex: 0.5,
        operatorConjunctionRate: 0,
        lastManeuverDate: null,
        meanMotionStd: 0
      };
    }
    
    // Get operator information for operator-specific risk patterns
    const operatorName = satellite.operator || satellite.country || 'unknown';
    const operatorSatellites = await Satellite.find({
      $or: [
        { operator: operatorName },
        { country: operatorName }
      ]
    }).lean();
    
    // Calculate operator-level conjunction rate
    const operatorNoradIds = operatorSatellites.map(s => s.noradCatId);
    const operatorConjunctions = await Conjunction.find({
      $or: [
        { satellite1: { $in: operatorNoradIds } },
        { satellite2: { $in: operatorNoradIds } }
      ],
      createdAt: { $gte: startDate }
    }).lean();
    
    const operatorConjunctionRate = operatorNoradIds.length > 0 
      ? operatorConjunctions.length / operatorNoradIds.length 
      : 0;
    
    // Calculate operator risk index based on historical performance
    // Higher rates of high-risk conjunctions = higher operator risk
    const highRiskOps = operatorConjunctions.filter(
      c => c.riskLevel === 'high' || c.riskLevel === 'critical'
    ).length;
    const operatorRiskIndex = operatorConjunctions.length > 0 
      ? Math.min(1, highRiskOps / operatorConjunctions.length + 0.3)
      : 0.3;
    
    // Get maneuver history from TLE history (changes indicate maneuvers)
    // In production, this would query a TLE history database
    const maneuverHistory = await this._getManeuverHistory(noradCatId, lookbackDays);
    
    return {
      maneuverCount: maneuverHistory.count,
      meanMotionChange: maneuverHistory.meanMotionChange,
      meanMotionStd: maneuverHistory.meanMotionStd,
      operatorRiskIndex,
      operatorConjunctionRate,
      lastManeuverDate: maneuverHistory.lastManeuverDate,
      daysSinceLastManeuver: maneuverHistory.daysSinceLastManeuver
    };
  }

  /**
   * Internal method to get maneuver history from TLE data
   */
  async _getManeuverHistory(noradCatId, lookbackDays) {
    // In production, this would query historical TLE data
    // For now, return simulated data based on satellite characteristics
    const satellite = await Satellite.findOne({ noradCatId }).lean();
    
    if (!satellite) {
      return { count: 0, meanMotionChange: 0, meanMotionStd: 0, lastManeuverDate: null, daysSinceLastManeuver: 30 };
    }
    
    // Estimate maneuver frequency based on orbit type
    // LEO satellites (especially those in SSO) tend to maneuver more frequently
    const orbitalAltitude = satellite.orbitalAltitude || 500;
    const isLEO = orbitalAltitude < 2000;
    const isSSO = Math.abs((satellite.inclination || 0) - 98) < 5;
    
    let estimatedManeuverCount = 0;
    if (isLEO) {
      estimatedManeuverCount = isSSO ? Math.floor(Math.random() * 5) : Math.floor(Math.random() * 3);
    } else if (orbitalAltitude < 36000) {
      estimatedManeuverCount = Math.floor(Math.random() * 2);
    }
    
    // Mean motion change indicates orbital adjustments
    const meanMotionChange = (Math.random() - 0.5) * 0.1 * estimatedManeuverCount;
    const meanMotionStd = Math.abs(meanMotionChange) * 0.5 + 0.01;
    
    // Days since last maneuver
    const daysSinceLastManeuver = estimatedManeuverCount > 0 
      ? Math.floor(Math.random() * lookbackDays) 
      : lookbackDays;
    
    const lastManeuverDate = daysSinceLastManeuver < lookbackDays 
      ? new Date(Date.now() - daysSinceLastManeuver * 24 * 60 * 60 * 1000)
      : null;
    
    return {
      count: estimatedManeuverCount,
      meanMotionChange,
      meanMotionStd,
      lastManeuverDate,
      daysSinceLastManeuver
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
   * Create training dataset from historical data with enhanced features
   */
  async createTrainingDataset(days = 90) {
    console.log(`Creating ML training dataset for ${days} days...`);
    
    const riskSnapshots = await this.getHistoricalRiskData(days);
    const conjunctionData = await this.getConjunctionData(days);
    
    // Pre-fetch space weather data for the date range
    const spaceWeatherData = {};
    for (let i = 0; i < riskSnapshots.length; i++) {
      const snapshot = riskSnapshots[i];
      const dateKey = snapshot.timestamp.toISOString().split('T')[0];
      spaceWeatherData[dateKey] = await this.getSpaceWeatherData(new Date(dateKey));
    }
    
    const trainingData = [];
    const labels = {};

    // Create features for each day
    for (let i = 0; i < riskSnapshots.length; i++) {
      const snapshot = riskSnapshots[i];
      const snapshotDate = new Date(snapshot.timestamp);
      const dateKey = snapshotDate.toISOString().split('T')[0];
      
      // Extract temporal features with cyclical encoding
      const temporalFeatures = this.extractTemporalFeatures(snapshotDate);
      
      // Get orbital distribution
      const orbitalDist = snapshot.orbitalDistribution || {};
      
      // Get conjunction data
      const conjData = conjunctionData[dateKey] || { total: 0, highRisk: 0, critical: 0, avgDistance: 0 };
      
      // Get space weather data
      const swData = spaceWeatherData[dateKey] || { solarFlux: 150, geomagneticIndex: 2, spaceWeatherAlertLevel: 1 };
      
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

      // Create feature vector with all enhancements
      const features = {
        // Cyclical temporal features
        hourSin: temporalFeatures.hourSin,
        hourCos: temporalFeatures.hourCos,
        dayOfWeekSin: temporalFeatures.dayOfWeekSin,
        dayOfWeekCos: temporalFeatures.dayOfWeekCos,
        dayOfMonthSin: temporalFeatures.dayOfMonthSin,
        dayOfMonthCos: temporalFeatures.dayOfMonthCos,
        monthSin: temporalFeatures.monthSin,
        monthCos: temporalFeatures.monthCos,
        
        // Risk and orbital features
        avgRisk: snapshot.averageRisk || 0,
        totalObjects: snapshot.totalObjects || 0,
        leoCount: orbitalDist.leo || 0,
        meoCount: orbitalDist.meo || 0,
        geoCount: orbitalDist.geo || 0,
        conjunctionRate: conjData.total,
        historicalRiskMean,
        historicalRiskStd,
        riskTrend,
        
        // Satellite-specific features (defaults for aggregate model)
        maneuverCount: 0,
        meanMotionChange: 0,
        operatorRiskIndex: 0.5,
        operatorConjunctionRate: 0,
        
        // Space weather features
        solarFlux: swData.solarFlux || 150,
        geomagneticIndex: swData.geomagneticIndex || 2,
        spaceWeatherAlertLevel: swData.spaceWeatherAlertLevel || 1
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
   * Generate features for current prediction with all enhancements
   */
  async generateCurrentFeatures(riskData, conjunctionData, noradCatId = null) {
    const now = new Date();
    const temporalFeatures = this.extractTemporalFeatures(now);
    
    const orbitalDist = riskData.orbitalDistribution || {};
    const conjData = conjunctionData || { total: 0, highRisk: 0, critical: 0 };
    
    // Get space weather data
    const swData = await this.getSpaceWeatherData(now);
    
    // Base features with cyclical encoding
    const features = {
      // Cyclical temporal features
      hourSin: temporalFeatures.hourSin,
      hourCos: temporalFeatures.hourCos,
      dayOfWeekSin: temporalFeatures.dayOfWeekSin,
      dayOfWeekCos: temporalFeatures.dayOfWeekCos,
      dayOfMonthSin: temporalFeatures.dayOfMonthSin,
      dayOfMonthCos: temporalFeatures.dayOfMonthCos,
      monthSin: temporalFeatures.monthSin,
      monthCos: temporalFeatures.monthCos,
      
      // Risk and orbital features
      avgRisk: riskData.averageRisk || 0,
      totalObjects: riskData.totalObjects || 0,
      leoCount: orbitalDist.leo || 0,
      meoCount: orbitalDist.meo || 0,
      geoCount: orbitalDist.geo || 0,
      conjunctionRate: conjData.total || 0,
      historicalRiskMean: riskData.averageRisk || 0,
      historicalRiskStd: 0,
      riskTrend: 0,
      
      // Space weather features
      solarFlux: swData.solarFlux,
      geomagneticIndex: swData.geomagneticIndex,
      spaceWeatherAlertLevel: swData.spaceWeatherAlertLevel,
      
      // Satellite-specific features (will be added if noradCatId provided)
      maneuverCount: 0,
      meanMotionChange: 0,
      operatorRiskIndex: 0.5,
      operatorConjunctionRate: 0
    };
    
    // Add satellite-specific features if noradCatId provided
    if (noradCatId) {
      const satFeatures = await this.getSatelliteSpecificFeatures(noradCatId);
      features.maneuverCount = satFeatures.maneuverCount;
      features.meanMotionChange = satFeatures.meanMotionChange;
      features.operatorRiskIndex = satFeatures.operatorRiskIndex;
      features.operatorConjunctionRate = satFeatures.operatorConjunctionRate;
    }
    
    return features;
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
    
    // Get space weather features for this period
    const swData = await this.getSpaceWeatherData();
    
    // Get satellite-specific features
    const satSpecificFeatures = await this.getSatelliteSpecificFeatures(noradCatId, lookbackDays);

    // Calculate behavioral features
    const features = {
      noradCatId,
      name: satellite.name,
      orbitalAltitude: satellite.orbitalAltitude,
      inclination: satellite.inclination,
      operator: satellite.operator,
      
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
      ...satSpecificFeatures,
      
      // Space weather correlation features
      solarFlux: swData.solarFlux,
      geomagneticIndex: swData.geomagneticIndex,
      spaceWeatherAlertLevel: swData.spaceWeatherAlertLevel
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
