/**
 * Satellite Lifetime Estimator Service
 * Predicts remaining functional lifetime based on orbital decay models
 */

const Satellite = require('../models/Satellite');
const { logger } = require('../utils/logger');
const { 
  getOrbitalParameters, 
  predictReentry, 
  calculateDecayRate,
  calculateAtmosphericDensity,
  assessUncontrolledReentry
} = require('./reentryEngine');

const SATELLITE_LIFETIME_THRESHOLD_KM = 600;

const LIFETIME_CATEGORIES = {
  critical: { maxDays: 30, label: 'Critical', color: 'red' },
  warning: { maxDays: 90, label: 'Warning', color: 'orange' },
  elevated: { maxDays: 180, label: 'Elevated', color: 'yellow' },
  stable: { maxDays: 365, label: 'Stable', color: 'green' },
  longTerm: { maxDays: Infinity, label: 'Long-term', color: 'blue' }
};

const getLifetimeCategory = (daysUntilReentry) => {
  if (daysUntilReentry <= LIFETIME_CATEGORIES.critical.maxDays) return 'critical';
  if (daysUntilReentry <= LIFETIME_CATEGORIES.warning.maxDays) return 'warning';
  if (daysUntilReentry <= LIFETIME_CATEGORIES.elevated.maxDays) return 'elevated';
  if (daysUntilReentry <= LIFETIME_CATEGORIES.stable.maxDays) return 'stable';
  return 'longTerm';
};

const calculateFunctionalLifetime = (orbitalParams, satelliteData) => {
  if (!orbitalParams) {
    return {
      predictable: false,
      reason: 'Unable to calculate orbital parameters',
      estimatedLifetimeDays: null,
      estimatedLifetimeYears: null,
      confidence: 'low'
    };
  }

  const { altitude, velocity, bstar, meanMotionDot } = orbitalParams;
  
  if (altitude > SATELLITE_LIFETIME_THRESHOLD_KM) {
    return {
      predictable: true,
      reason: 'Orbit above decay threshold',
      estimatedLifetimeDays: 1825,
      estimatedLifetimeYears: 5,
      confidence: 'medium',
      status: 'longTerm',
      note: 'Stable orbit - lifetime exceeds 5 years'
    };
  }

  const ballisticCoefficient = estimateBallisticCoefficient(orbitalParams);
  const decayRate = calculateDecayRate(altitude, velocity, ballisticCoefficient);
  
  let estimatedLifetimeDays;
  let confidence = 'medium';
  let note = '';

  if (decayRate <= 0) {
    estimatedLifetimeDays = 1825;
    confidence = 'low';
    note = 'Very low decay rate - stable orbit';
  } else {
    const daysToReentry = (altitude - 100) / decayRate;
    estimatedLifetimeDays = Math.max(1, Math.min(1825, daysToReentry));
    
    if (estimatedLifetimeDays > 365) {
      confidence = 'medium';
    } else if (estimatedLifetimeDays > 90) {
      confidence = 'high';
    } else {
      confidence = 'very_high';
      note = 'Near-term reentry expected';
    }
  }

  const functionalLifetimeDays = Math.min(
    estimatedLifetimeDays,
    estimateOperationalLifetime(satelliteData)
  );

  const status = getLifetimeCategory(functionalLifetimeDays);

  return {
    predictable: true,
    estimatedLifetimeDays: Math.round(functionalLifetimeDays),
    estimatedLifetimeYears: (functionalLifetimeDays / 365).toFixed(2),
    currentAltitude: altitude,
    currentVelocity: velocity.toFixed(3),
    decayRateKmPerDay: decayRate.toFixed(4),
    ballisticCoefficient: ballisticCoefficient.toFixed(4),
    status,
    statusInfo: LIFETIME_CATEGORIES[status],
    confidence,
    note,
    predictedReentry: {
      altitude: 100,
      estimatedDays: Math.round(estimatedLifetimeDays)
    }
  };
};

const estimateBallisticCoefficient = (orbitalParams) => {
  if (orbitalParams.meanMotionDot && Math.abs(orbitalParams.meanMotionDot) > 0) {
    const estimatedBC = 1 / (Math.abs(orbitalParams.meanMotionDot) * 100 + 1);
    return Math.max(0.001, Math.min(0.1, estimatedBC));
  }
  
  if (orbitalParams.bstar && orbitalParams.bstar !== 0) {
    return Math.max(0.001, Math.min(0.1, Math.abs(orbitalParams.bstar) * 100));
  }
  
  return 0.01;
};

const estimateOperationalLifetime = (satelliteData) => {
  if (!satelliteData) return 1825;
  
  const launchDate = satelliteData.launchDate;
  if (!launchDate) return 1825;
  
  try {
    const launch = new Date(launchDate);
    const ageDays = (Date.now() - launch.getTime()) / (1000 * 60 * 60 * 24);
    
    const typicalLifetime = {
      'PAYLOAD': 3650,
      'ROCKET BODY': 7300,
      'DEBRIS': 365,
      'UNKNOWN': 1825
    };
    
    const objectType = satelliteData.objectType || 'UNKNOWN';
    const maxLifetime = typicalLifetime[objectType] || 1825;
    
    const remaining = maxLifetime - ageDays;
    return Math.max(0, remaining);
  } catch {
    return 1825;
  }
};

const getLifetimePrediction = async (noradCatId) => {
  const satellite = await Satellite.findOne({ noradCatId });
  
  if (!satellite) {
    return {
      error: 'Satellite not found',
      noradCatId
    };
  }
  
  const tleLine1 = satellite.tleLine1 || (satellite.tle && satellite.tle.line1);
  const tleLine2 = satellite.tleLine2 || (satellite.tle && satellite.tle.line2);
  
  if (!tleLine1 || !tleLine2) {
    return {
      error: 'No TLE data available',
      noradCatId: satellite.noradCatId,
      name: satellite.name
    };
  }
  
  const orbitalParams = getOrbitalParameters(tleLine1, tleLine2);
  const lifetime = calculateFunctionalLifetime(orbitalParams, satellite);
  
  const uncontrolledAssessment = assessUncontrolledReentry(satellite, orbitalParams);
  
  return {
    noradCatId: satellite.noradCatId,
    name: satellite.name,
    internationalDesignator: satellite.internationalDesignator,
    currentAltitude: orbitalParams?.altitude,
    orbitalInclination: orbitalParams?.inclination,
    orbitalEccentricity: orbitalParams?.eccentricity,
    ...lifetime,
    uncontrolledReentry: uncontrolledAssessment,
    lastUpdated: new Date().toISOString()
  };
};

const getAllLifetimePredictions = async (options = {}) => {
  const { limit = 50, sortBy = 'daysUntilReentry' } = options;
  
  // Get satellites with any altitude (no filter - show all available)
  const satellites = await Satellite.find({})
    .sort({ orbitalAltitude: -1 })
    .limit(100)
    .lean();
  
  const predictions = [];
  
  for (const sat of satellites) {
    try {
      const prediction = await getLifetimePrediction(sat.noradCatId);
      if (!prediction.error) {
        predictions.push(prediction);
      }
    } catch (error) {
      logger.warn(`Error predicting lifetime for ${sat.noradCatId}`, { error: error.message });
    }
  }
  
  predictions.sort((a, b) => {
    if (sortBy === 'daysUntilReentry') {
      return (a.estimatedLifetimeDays || 9999) - (b.estimatedLifetimeDays || 9999);
    }
    if (sortBy === 'altitude') {
      return (a.currentAltitude || 0) - (b.currentAltitude || 0);
    }
    if (sortBy === 'name') {
      return (a.name || '').localeCompare(b.name || '');
    }
    return 0;
  });
  
  return {
    predictions: predictions.slice(0, limit),
    total: predictions.length,
    threshold: SATELLITE_LIFETIME_THRESHOLD_KM,
    lastUpdated: new Date().toISOString()
  };
};

const getLifetimeStatistics = async () => {
  // Get all satellites for statistics
  const satellites = await Satellite.find({}).lean();
  
  const stats = {
    totalAnalyzed: satellites.length,
    byStatus: {
      critical: 0,
      warning: 0,
      elevated: 0,
      stable: 0,
      longTerm: 0
    },
    averageAltitude: 0,
    averageDecayRate: 0,
    criticalSatellites: [],
    highRiskCount: 0
  };
  
  let totalAltitude = 0;
  
  for (const sat of satellites) {
    const prediction = await getLifetimePrediction(sat.noradCatId);
    
    if (!prediction.error && prediction.estimatedLifetimeDays) {
      const status = prediction.status || getLifetimeCategory(prediction.estimatedLifetimeDays);
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      
      if (status === 'critical') {
        stats.criticalSatellites.push({
          noradCatId: sat.noradCatId,
          name: sat.name,
          altitude: prediction.currentAltitude,
          daysRemaining: prediction.estimatedLifetimeDays
        });
      }
      
      if (prediction.estimatedLifetimeDays < 90) {
        stats.highRiskCount++;
      }
    }
    
    totalAltitude += sat.orbitalAltitude || 0;
  }
  
  stats.averageAltitude = satellites.length > 0 ? 
    (totalAltitude / satellites.length).toFixed(2) : 0;
  
  return stats;
};

const getLifetimeAlerts = async () => {
  const satellites = await Satellite.find({
    orbitalAltitude: { $lt: 400 }
  }).lean();
  
  const alerts = [];
  
  for (const sat of satellites) {
    const prediction = await getLifetimePrediction(sat.noradCatId);
    
    if (!prediction.error) {
      const days = prediction.estimatedLifetimeDays || 9999;
      
      if (days <= 90 || prediction.uncontrolledReentry?.isUncontrolled) {
        alerts.push({
          noradCatId: sat.noradCatId,
          name: sat.name,
          currentAltitude: prediction.currentAltitude,
          daysRemaining: days,
          status: prediction.status,
          riskLevel: prediction.uncontrolledReentry?.riskLevel || 
                   (days <= 30 ? 'critical' : days <= 90 ? 'high' : 'medium'),
          reason: prediction.uncontrolledReentry?.isUncontrolled ? 
                  'Uncontrolled reentry risk' : 
                  `Estimated ${days} days until reentry`,
          prediction
        });
      }
    }
  }
  
  alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
  
  return {
    alerts,
    total: alerts.length,
    critical: alerts.filter(a => a.riskLevel === 'critical').length,
    high: alerts.filter(a => a.riskLevel === 'high').length,
    lastUpdated: new Date().toISOString()
  };
};

const compareSatelliteLifetimes = async (noradCatIds) => {
  const predictions = [];
  
  for (const id of noradCatIds) {
    const prediction = await getLifetimePrediction(id);
    if (!prediction.error) {
      predictions.push(prediction);
    }
  }
  
  predictions.sort((a, b) => 
    (b.estimatedLifetimeDays || 0) - (a.estimatedLifetimeDays || 0)
  );
  
  return {
    satellites: predictions,
    comparison: {
      longestLifetime: predictions[0]?.name || 'N/A',
      shortestLifetime: predictions[predictions.length - 1]?.name || 'N/A',
      lifetimeSpread: predictions.length > 1 ? 
        (predictions[0].estimatedLifetimeDays || 0) - (predictions[predictions.length - 1].estimatedLifetimeDays || 0) : 0
    },
    ranking: predictions.map((p, i) => ({
      rank: i + 1,
      noradCatId: p.noradCatId,
      name: p.name,
      lifetimeDays: p.estimatedLifetimeDays,
      lifetimeYears: p.estimatedLifetimeYears
    }))
  };
};

module.exports = {
  getLifetimePrediction,
  getAllLifetimePredictions,
  getLifetimeStatistics,
  getLifetimeAlerts,
  compareSatelliteLifetimes,
  calculateFunctionalLifetime,
  getLifetimeCategory,
  LIFETIME_CATEGORIES,
  SATELLITE_LIFETIME_THRESHOLD_KM
};
