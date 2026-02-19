const satellite = require('satellite.js');
const Satellite = require('../models/Satellite');
const { logger } = require('../utils/logger');

// Constants for reentry prediction
const REENTRY_ALTITUDE_THRESHOLD = 400; // km - objects below this are tracked
const ATMOSPHERE_ENTRY_ALTITUDE = 120; // km - Karman line region
const CRITICAL_REENTRY_ALTITUDE = 100; // km - critical warning threshold
const EARTH_RADIUS_KM = 6371;
const SOLAR_FLUX_AVG = 150; // Average solar flux (SFU)
const DRAG_COEFFICIENT = 2.2; // Typical value for tumbling objects

// Decay prediction parameters
const DECAY_PREDICTION_DAYS = 30; // Predict up to 30 days ahead
const BALLISTIC_COEFFICIENT_TYPICAL = 0.01; // m²/kg for typical debris

/**
 * Calculate atmospheric density at given altitude (simplified exponential model)
 * @param {number} altitude - Altitude in km
 * @param {number} solarFlux - Solar flux in SFU
 * @returns {number} Density in kg/m³
 */
const calculateAtmosphericDensity = (altitude, solarFlux = SOLAR_FLUX_AVG) => {
  // Simplified US Standard Atmosphere with solar activity adjustment
  const baseDensities = [
    { alt: 100, density: 5.6e-7 },
    { alt: 120, density: 2.8e-8 },
    { alt: 150, density: 3.7e-9 },
    { alt: 200, density: 2.8e-10 },
    { alt: 300, density: 2.4e-11 },
    { alt: 400, density: 3.7e-12 },
    { alt: 500, density: 1.5e-12 },
    { alt: 600, density: 6.0e-13 },
    { alt: 700, density: 2.5e-13 },
    { alt: 800, density: 1.1e-13 }
  ];

  if (altitude >= 800) return 1e-14;
  if (altitude <= 100) return 1e-6;

  // Find the two base density points to interpolate between
  for (let i = 0; i < baseDensities.length - 1; i++) {
    if (altitude >= baseDensities[i].alt && altitude < baseDensities[i + 1].alt) {
      const t = (altitude - baseDensities[i].alt) / (baseDensities[i + 1].alt - baseDensities[i].alt);
      const density = baseDensities[i].density * Math.pow(baseDensities[i + 1].density / baseDensities[i].density, t);
      
      // Adjust for solar activity (simplified)
      const solarFactor = 1 + (solarFlux - SOLAR_FLUX_AVG) / SOLAR_FLUX_AVG * 0.5;
      return density * Math.max(0.5, Math.min(2.0, solarFactor));
    }
  }
  
  return 1e-10; // Default fallback
};

/**
 * Calculate orbital decay rate using drag equation
 * @param {number} altitude - Current altitude in km
 * @param {number} velocity - Orbital velocity in km/s
 * @param {number} ballisticCoefficient - Ballistic coefficient (m²/kg)
 * @param {number} solarFlux - Solar flux (SFU)
 * @returns {number} Decay rate in km/day
 */
const calculateDecayRate = (altitude, velocity, ballisticCoefficient = BALLISTIC_COEFFICIENT_TYPICAL, solarFlux = SOLAR_FLUX_AVG) => {
  if (altitude > 500) return 0;
  
  const density = calculateAtmosphericDensity(altitude, solarFlux);
  const velocityMs = velocity * 1000; // Convert to m/s
  
  // Drag equation: F = 0.5 * ρ * v² * Cd * A/m
  // Simplified: decay rate proportional to density * velocity²
  const dragAcceleration = 0.5 * density * velocityMs * velocityMs / ballisticCoefficient;
  
  // Convert to km/day (assuming circular orbit, simplified)
  const decayPerSecond = dragAcceleration / 1000; // km/s²
  const decayPerDay = decayPerSecond * 86400;
  
  return Math.max(0, decayPerDay);
};

/**
 * Get current orbital parameters from TLE
 * @param {string} tleLine1 - TLE line 1
 * @param {string} tleLine2 - TLE line 2
 * @returns {Object} Orbital parameters
 */
const getOrbitalParameters = (tleLine1, tleLine2) => {
  try {
    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
    const position = satellite.propagate(satrec, new Date());
    
    if (!position.position || !position.velocity) {
      return null;
    }
    
    const r = Math.sqrt(
      position.position.x ** 2 +
      position.position.y ** 2 +
      position.position.z ** 2
    ) / 1000; // Convert to km
    
    const v = Math.sqrt(
      position.velocity.x ** 2 +
      position.velocity.y ** 2 +
      position.velocity.z ** 2
    ) / 1000; // Convert to km/s
    
    const altitude = r - EARTH_RADIUS_KM;
    
    // Calculate orbital period
    const semiMajorAxis = EARTH_RADIUS_KM + altitude;
    const period = 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / 398600.4418) / 60; // minutes
    
    return {
      altitude,
      velocity: v,
      period,
      semiMajorAxis,
      eccentricity: satrec.ecco,
      inclination: satellite.radiansToDegrees(satrec.inclo),
      raan: satellite.radiansToDegrees(satrec.nodeo),
      meanMotion: satrec.no,
      bstar: satrec.bstar || 0,
      meanMotionDot: satrec.mdot || 0
    };
  } catch (error) {
    logger.error('Error calculating orbital parameters', { error: error.message });
    return null;
  }
};

/**
 * Predict reentry date using iterative decay calculation
 * @param {Object} orbitalParams - Current orbital parameters
 * @param {number} daysAhead - Number of days to predict
 * @returns {Object} Reentry prediction result
 */
const predictReentry = (orbitalParams, daysAhead = DECAY_PREDICTION_DAYS) => {
  if (!orbitalParams) {
    return { predictable: false, reason: 'Invalid orbital parameters' };
  }
  
  if (orbitalParams.altitude > REENTRY_ALTITUDE_THRESHOLD) {
    return {
      predictable: false,
      reason: 'Altitude above tracking threshold',
      currentAltitude: orbitalParams.altitude
    };
  }
  
  // If already below critical altitude, predict imminent reentry
  if (orbitalParams.altitude < CRITICAL_REENTRY_ALTITUDE) {
    return {
      predictable: true,
      reentryDate: new Date(),
      daysUntilReentry: 0,
      currentAltitude: orbitalParams.altitude,
      status: 'critical',
      confidence: 'high'
    };
  }
  
  let currentAltitude = orbitalParams.altitude;
  let currentVelocity = orbitalParams.velocity;
  let days = 0;
  const dt = 0.1; // Time step in days (2.4 hours for accuracy)
  
  // Estimate ballistic coefficient from TLE data
  const ballisticCoefficient = estimateBallisticCoefficient(orbitalParams);
  
  while (currentAltitude > ATMOSPHERE_ENTRY_ALTITUDE && days < daysAhead) {
    const decayRate = calculateDecayRate(currentAltitude, currentVelocity, ballisticCoefficient);
    currentAltitude -= decayRate * dt;
    days += dt;
    
    // Update velocity based on altitude (circular orbit approximation)
    if (currentAltitude > 100) {
      const newRadius = EARTH_RADIUS_KM + currentAltitude;
      currentVelocity = Math.sqrt(398600.4418 / newRadius);
    }
  }
  
  const reentryDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const daysUntilReentry = days;
  
  // Determine status based on days until reentry
  let status = 'normal';
  let confidence = 'medium';
  
  if (daysUntilReentry <= 1) {
    status = 'critical';
    confidence = 'high';
  } else if (daysUntilReentry <= 7) {
    status = 'warning';
    confidence = 'medium';
  } else if (daysUntilReentry <= 14) {
    status = 'elevated';
    confidence = 'low-medium';
  }
  
  return {
    predictable: true,
    reentryDate: reentryDate.toISOString(),
    daysUntilReentry: Math.round(daysUntilReentry * 10) / 10,
    currentAltitude: orbitalParams.altitude,
    decayRateKmPerDay: calculateDecayRate(orbitalParams.altitude, orbitalParams.velocity, ballisticCoefficient).toFixed(4),
    status,
    confidence,
    ballisticCoefficient: ballisticCoefficient.toFixed(4)
  };
};

/**
 * Estimate ballistic coefficient from TLE data
 * @param {Object} orbitalParams - Orbital parameters from TLE
 * @returns {number} Estimated ballistic coefficient
 */
const estimateBallisticCoefficient = (orbitalParams) => {
  // Use mean motion derivative from TLE as a proxy for decay
  // This is a simplified estimation
  if (orbitalParams.meanMotionDot && Math.abs(orbitalParams.meanMotionDot) > 0) {
    // Mean motion derivative is in rev/day²
    const estimatedBC = 1 / (Math.abs(orbitalParams.meanMotionDot) * 100 + 1);
    return Math.max(0.001, Math.min(0.1, estimatedBC));
  }
  
  // Use BSTAR if available
  if (orbitalParams.bstar && orbitalParams.bstar !== 0) {
    const bstarAbs = Math.abs(orbitalParams.bstar);
    return Math.max(0.001, Math.min(0.1, bstarAbs * 100));
  }
  
  return BALLISTIC_COEFFICIENT_TYPICAL;
};

/**
 * Check if object is an uncontrolled reentry candidate
 * @param {Object} satelliteData - Satellite data from database
 * @param {Object} orbitalParams - Current orbital parameters
 * @returns {Object} Uncontrolled reentry assessment
 */
const assessUncontrolledReentry = (satelliteData, orbitalParams) => {
  if (!orbitalParams || !satelliteData) {
    return { isUncontrolled: false, reason: 'Insufficient data' };
  }
  
  // Criteria for uncontrolled reentry (like Tiangong-1):
  // 1. Object is below 400km
  // 2. Object is not actively maintained (no regular TLE updates)
  // 3. Object is large enough to survive reentry (estimated mass > 100kg)
  // 4. Object is in LEO
  
  const reasons = [];
  let score = 0;
  
  // Check altitude
  if (orbitalParams.altitude < REENTRY_ALTITUDE_THRESHOLD) {
    score += 2;
    reasons.push('Below 400km altitude');
  }
  
  // Check eccentricity - uncontrolled objects often have higher eccentricity
  if (orbitalParams.eccentricity > 0.01) {
    score += 1;
    reasons.push('Elevated orbital eccentricity');
  }
  
  // Check inclination - decaying objects often have specific inclinations
  // Sun-synchronous or polar orbits are common for decaying objects
  const isPolarOrSunSync = orbitalParams.inclination > 80 && orbitalParams.inclination < 100;
  if (isPolarOrSunSync) {
    score += 1;
    reasons.push('Polar/Sun-synchronous orbit (common for decaying objects)');
  }
  
  // Check if this is a known space station or large object
  const largeObjectPatterns = ['station', '模块', 'module', 'tiangong', 'iss', 'skylab', 'salyut', 'mir'];
  const isLargeObject = largeObjectPatterns.some(pattern => 
    satelliteData.name.toLowerCase().includes(pattern)
  );
  
  if (isLargeObject) {
    score += 3;
    reasons.push('Known large object (potential uncontrolled reentry)');
  }
  
  return {
    isUncontrolled: score >= 4,
    score,
    reasons,
    riskLevel: score >= 5 ? 'critical' : score >= 3 ? 'high' : score >= 2 ? 'medium' : 'low'
  };
};

/**
 * Get all objects below 400km that are candidates for reentry tracking
 * @returns {Array} Array of satellites below threshold
 */
const getReentryCandidates = async () => {
  try {
    const satellites = await Satellite.find({
      orbitalAltitude: { $lt: REENTRY_ALTITUDE_THRESHOLD }
    }).lean();
    
    return satellites;
  } catch (error) {
    logger.error('Error fetching reentry candidates', { error: error.message });
    return [];
  }
};

/**
 * Process all reentry candidates and generate predictions
 * @returns {Array} Array of reentry predictions
 */
const processAllReentryPredictions = async () => {
  logger.info('Processing reentry predictions for all candidates');
  
  const candidates = await getReentryCandidates();
  const predictions = [];
  
  for (const sat of candidates) {
    try {
      const tleLine1 = sat.tleLine1 || (sat.tle && sat.tle.line1);
      const tleLine2 = sat.tleLine2 || (sat.tle && sat.tle.line2);
      
      if (!tleLine1 || !tleLine2) {
        logger.warn(`No TLE data for satellite ${sat.noradCatId}`);
        continue;
      }
      
      const orbitalParams = getOrbitalParameters(tleLine1, tleLine2);
      
      if (!orbitalParams) {
        logger.warn(`Could not calculate orbital params for ${sat.noradCatId}`);
        continue;
      }
      
      const reentryPrediction = predictReentry(orbitalParams);
      const uncontrolledAssessment = assessUncontrolledReentry(sat, orbitalParams);
      
      const prediction = {
        noradCatId: sat.noradCatId,
        name: sat.name,
        internationalDesignator: sat.internationalDesignator,
        currentAltitude: orbitalParams.altitude,
        currentVelocity: orbitalParams.velocity,
        orbitalPeriod: orbitalParams.period,
        inclination: orbitalParams.inclination,
        eccentricity: orbitalParams.eccentricity,
        ...reentryPrediction,
        uncontrolledAssessment,
        lastUpdated: new Date()
      };
      
      predictions.push(prediction);
    } catch (error) {
      logger.error(`Error processing reentry for ${sat.noradCatId}`, { error: error.message });
    }
  }
  
  // Sort by days until reentry (most critical first)
  predictions.sort((a, b) => {
    if (a.daysUntilReentry === undefined) return 1;
    if (b.daysUntilReentry === undefined) return -1;
    return a.daysUntilReentry - b.daysUntilReentry;
  });
  
  logger.info(`Processed ${predictions.length} reentry predictions`);
  return predictions;
};

/**
 * Get reentry prediction for a specific satellite
 * @param {number} noradCatId - NORAD catalog ID
 * @returns {Object} Reentry prediction
 */
const getReentryPrediction = async (noradCatId) => {
  const satellite = await Satellite.findOne({ noradCatId });
  
  if (!satellite) {
    return { error: 'Satellite not found' };
  }
  
  const tleLine1 = satellite.tleLine1 || (satellite.tle && satellite.tle.line1);
  const tleLine2 = satellite.tleLine2 || (satellite.tle && satellite.tle.line2);
  
  if (!tleLine1 || !tleLine2) {
    return { error: 'No TLE data available for this satellite' };
  }
  
  const orbitalParams = getOrbitalParameters(tleLine1, tleLine2);
  const reentryPrediction = predictReentry(orbitalParams);
  const uncontrolledAssessment = assessUncontrolledReentry(satellite, orbitalParams);
  
  return {
    noradCatId: satellite.noradCatId,
    name: satellite.name,
    internationalDesignator: satellite.internationalDesignator,
    currentAltitude: orbitalParams?.altitude,
    currentVelocity: orbitalParams?.velocity,
    orbitalPeriod: orbitalParams?.period,
    inclination: orbitalParams?.inclination,
    eccentricity: orbitalParams?.eccentricity,
    ...reentryPrediction,
    uncontrolledAssessment,
    lastUpdated: new Date()
  };
};

/**
 * Get all active reentry alerts (objects with concerning reentry windows)
 * @returns {Array} Array of critical reentry alerts
 */
const getActiveReentryAlerts = async () => {
  const predictions = await processAllReentryPredictions();
  
  // Filter for objects that need attention
  const alerts = predictions.filter(p => 
    p.predictable && 
    (p.status === 'critical' || 
     p.status === 'warning' || 
     p.uncontrolledAssessment?.isUncontrolled)
  );
  
  return alerts;
};

/**
 * Calculate reentry window (ground track) - where reentry might occur
 * @param {Object} orbitalParams - Current orbital parameters
 * @returns {Object} Reentry window information
 */
const calculateReentryWindow = (orbitalParams) => {
  if (!orbitalParams) return null;
  
  // Calculate the nodal regression and argument of perigee evolution
  // Simplified model for reentry window estimation
  
  const inclination = orbitalParams.inclination * Math.PI / 180;
  
  // Earth rotation effect on ground track
  const earthRotationPerOrbit = 360 * (orbitalParams.period / 1440); // degrees per orbit
  
  // Estimate latitude coverage during decay
  const maxLatitude = Math.asin(Math.sin(inclination)) * 180 / Math.PI;
  
  // Reentry can occur anywhere within the orbital plane's ground track
  // For uncontrolled reentry, any latitude up to maxLatitude is possible
  
  return {
    possibleLatitudeRange: {
      min: -maxLatitude,
      max: maxLatitude
    },
    likelyLatitudeRange: {
      // Most reentries occur at mid-latitudes due to orbital mechanics
      min: -maxLatitude * 0.7,
      max: maxLatitude * 0.7
    },
    earthRotationPerOrbit: earthRotationPerOrbit.toFixed(2),
    orbitalPlaneFixed: true, // Orbital plane precesses slowly
    notes: 'Exact reentry location depends on atmospheric conditions and object orientation'
  };
};

module.exports = {
  calculateAtmosphericDensity,
  calculateDecayRate,
  getOrbitalParameters,
  predictReentry,
  assessUncontrolledReentry,
  getReentryCandidates,
  processAllReentryPredictions,
  getReentryPrediction,
  getActiveReentryAlerts,
  calculateReentryWindow,
  REENTRY_ALTITUDE_THRESHOLD,
  ATMOSPHERE_ENTRY_ALTITUDE,
  CRITICAL_REENTRY_ALTITUDE
};
