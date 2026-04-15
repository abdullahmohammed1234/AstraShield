/**
 * Closest Approach Alert Service
 * Real-time notifications when tracked objects pass within threshold distance
 */

const Satellite = require('../models/Satellite');
const Conjunction = require('../models/Conjunction');
const { logger } = require('../utils/logger');
const { broadcastAlert } = require('./alertService');

const CONFIG = {
  DEFAULT_THRESHOLD_KM: 10,
  CRITICAL_THRESHOLD_KM: 1,
  HIGH_THRESHOLD_KM: 5,
  MEDIUM_THRESHOLD_KM: 10,
  LOW_THRESHOLD_KM: 50,
  FORECAST_HOURS: 24,
  SAMPLE_INTERVAL_MINUTES: 1,
  MAX_TRACKED_OBJECTS: 500,
  ALERT_COOLDOWN_MINUTES: 30
};

const DEFAULT_USER_THRESHOLDS = {
  leo: 10,
  meo: 50,
  geo: 100
};

let userThresholds = {};
let alertCooldowns = new Map();

const setUserThreshold = (userId, orbitalShell, thresholdKm) => {
  if (!userThresholds[userId]) {
    userThresholds[userId] = { ...DEFAULT_USER_THRESHOLDS };
  }
  userThresholds[userId][orbitalShell] = thresholdKm;
};

const getUserThreshold = (userId, orbitalShell) => {
  return userThresholds[userId]?.[orbitalShell] || DEFAULT_USER_THRESHOLDS[orbitalShell];
};

const getOrbitalShell = (altitudeKm) => {
  if (altitudeKm <= 2000) return 'leo';
  if (altitudeKm <= 35786) return 'meo';
  return 'geo';
};

const isCooldownActive = (conjunctionKey) => {
  const lastAlert = alertCooldowns.get(conjunctionKey);
  if (!lastAlert) return false;
  
  const cooldownMs = CONFIG.ALERT_COOLDOWN_MINUTES * 60 * 1000;
  return (Date.now() - lastAlert) < cooldownMs;
};

const setCooldown = (conjunctionKey) => {
  alertCooldowns.set(conjunctionKey, Date.now());
};

const getAlertPriority = (distanceKm, thresholdKm) => {
  const ratio = distanceKm / thresholdKm;
  
  if (distanceKm < CONFIG.CRITICAL_THRESHOLD_KM || ratio < 0.1) return 'critical';
  if (distanceKm < CONFIG.HIGH_THRESHOLD_KM || ratio < 0.25) return 'high';
  if (distanceKm < CONFIG.MEDIUM_THRESHOLD_KM || ratio < 0.5) return 'medium';
  return 'low';
};

const generateAlertId = () => {
  return `CA-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
};

const findClosestApproaches = async (noradCatId, thresholdKm = CONFIG.DEFAULT_THRESHOLD_KM) => {
  const satellite = await Satellite.findOne({ noradCatId });
  
  if (!satellite) {
    return { error: 'Satellite not found' };
  }
  
  const tleLine1 = satellite.tleLine1 || (satellite.tle && satellite.tle.line1);
  const tleLine2 = satellite.tleLine2 || (satellite.tle && satellite.tle.line2);
  
  if (!tleLine1 || !tleLine2) {
    return { error: 'No TLE data available' };
  }
  
  const satelliteShell = getOrbitalShell(satellite.orbitalAltitude || 0);
  const otherSatellites = await Satellite.find({
    noradCatId: { $ne: satellite.noradCatId },
    orbitalAltitude: {
      $gte: (satellite.orbitalAltitude || 0) - 200,
      $lte: (satellite.orbitalAltitude || 0) + 200
    }
  }).limit(CONFIG.MAX_TRACKED_OBJECTS).lean();
  
  const closestApproaches = [];
  const now = new Date();
  const numSamples = (CONFIG.FORECAST_HOURS * 60) / CONFIG.SAMPLE_INTERVAL_MINUTES;
  
  for (const other of otherSatellites) {
    const otherTle1 = other.tleLine1 || (other.tle && other.tle.line1);
    const otherTle2 = other.tleLine2 || (other.tle && other.tle.line2);
    
    if (!otherTle1 || !otherTle2) continue;
    
    const { calculateMinDistance, generatePositions } = require('./orbitEngine');
    const positions1 = generatePositions(tleLine1, tleLine2, now, numSamples);
    const positions2 = generatePositions(otherTle1, otherTle2, now, numSamples);
    
    if (positions1.length === 0 || positions2.length === 0) continue;
    
    let minDistance = Infinity;
    let timeOfClosestApproach = null;
    
    for (let i = 0; i < Math.min(positions1.length, positions2.length); i++) {
      const dist = calculateDistance3D(positions1[i], positions2[i]);
      if (dist < minDistance) {
        minDistance = dist;
        timeOfClosestApproach = positions1[i].time;
      }
    }
    
    if (minDistance < thresholdKm) {
      closestApproaches.push({
        satelliteId: other.noradCatId,
        name: other.name,
        distance: minDistance,
        timeOfClosestApproach,
        orbitalAltitude: other.orbitalAltitude,
        orbitalShell: getOrbitalShell(other.orbitalAltitude || 0)
      });
    }
  }
  
  closestApproaches.sort((a, b) => a.distance - b.distance);
  
  return {
    reference: {
      noradCatId: satellite.noradCatId,
      name: satellite.name,
      altitude: satellite.orbitalAltitude,
      shell: satelliteShell
    },
    threshold: thresholdKm,
    approaches: closestApproaches,
    totalFound: closestApproaches.length,
    lastUpdated: new Date().toISOString()
  };
};

const calculateDistance3D = (pos1, pos2) => {
  const dx = pos2.x - pos1.x;
  const dy = pos2.y - pos1.y;
  const dz = pos2.z - pos1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

const createClosestApproachAlert = async (referenceSat, approachingObj, distance, timeOfClosestApproach, threshold) => {
  const conjunctionKey = `${referenceSat.noradCatId}-${approachingObj.noradCatId}`;
  
  if (isCooldownActive(conjunctionKey)) {
    logger.debug(`Alert cooldown active for ${conjunctionKey}`);
    return null;
  }
  
  const priority = getAlertPriority(distance, threshold);
  const alertId = generateAlertId();
  
  const alert = {
    id: alertId,
    type: 'closest_approach',
    referenceSatellite: {
      noradCatId: referenceSat.noradCatId,
      name: referenceSat.name
    },
    approachingObject: {
      noradCatId: approachingObj.noradCatId,
      name: approachingObj.name
    },
    closestApproach: {
      distanceKm: distance,
      time: timeOfClosestApproach,
      thresholdUsed: threshold
    },
    priority,
    status: 'new',
    createdAt: new Date().toISOString()
  };
  
  setCooldown(conjunctionKey);
  
  try {
    broadcastAlert(alert, 'closest_approach_alert');
  } catch (error) {
    logger.error('Failed to broadcast closest approach alert', { error: error.message });
  }
  
  return alert;
};

const scanAllClosestApproaches = async (thresholdKm = CONFIG.DEFAULT_THRESHOLD_KM) => {
  logger.info('Scanning for closest approach alerts...');
  
  const satellites = await Satellite.find({})
    .limit(CONFIG.MAX_TRACKED_OBJECTS)
    .lean();
  
  logger.info(`Found ${satellites.length} satellites to scan`);
  
  const alerts = [];
  const now = new Date();
  const numSamples = 30; // Reduced for performance
  
  let comparisons = 0;
  const maxComparisons = 100; // Limit to prevent timeout
  
  for (let i = 0; i < satellites.length && comparisons < maxComparisons; i++) {
    const satA = satellites[i];
    const tleLine1 = satA.tleLine1 || (satA.tle && satA.tle.line1);
    const tleLine2 = satA.tleLine2 || (satA.tle && satA.tle.line2);
    
    if (!tleLine1 || !tleLine2) continue;
    
    for (let j = i + 1; j < satellites.length && comparisons < maxComparisons; j++) {
      const satB = satellites[j];
      
      const altDiff = Math.abs((satA.orbitalAltitude || 0) - (satB.orbitalAltitude || 0));
      if (altDiff > 200) continue;
      
      comparisons++;
      
      const bTle1 = satB.tleLine1 || (satB.tle && satB.tle.line1);
      const bTle2 = satB.tleLine2 || (satB.tle && satB.tle.line2);
      
      if (!bTle1 || !bTle2) continue;
      
      const { generateSampledPositions } = require('./conjunctionEngine');
      
      try {
        const posA = generateSampledPositions(tleLine1, tleLine2, now, numSamples);
        const posB = generateSampledPositions(bTle1, bTle2, now, numSamples);
        
        if (posA.length === 0 || posB.length === 0) continue;
        
        let minDistance = Infinity;
        let timeOfClosest = null;
        
        for (let k = 0; k < Math.min(posA.length, posB.length); k++) {
          const dist = calculateDistance3D(posA[k], posB[k]);
          if (dist < minDistance) {
            minDistance = dist;
            timeOfClosest = posA[k].time;
          }
        }
        
        if (minDistance < thresholdKm) {
          const alert = await createClosestApproachAlert(
            satA,
            satB,
            minDistance,
            timeOfClosest,
            thresholdKm
          );
          
          if (alert) {
            alerts.push(alert);
          }
        }
      } catch (err) {
        logger.warn('Error processing pair', { error: err.message });
        continue;
      }
    }
  }
  
  logger.info(`Closest approach scan complete. Generated ${alerts.length} alerts`);
  
  return {
    alerts,
    totalAlerts: alerts.length,
    byPriority: {
      critical: alerts.filter(a => a.priority === 'critical').length,
      high: alerts.filter(a => a.priority === 'high').length,
      medium: alerts.filter(a => a.priority === 'medium').length,
      low: alerts.filter(a => a.priority === 'low').length
    },
    lastScanTime: new Date().toISOString()
  };
};

const getActiveClosestApproachAlerts = async (status = 'new') => {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  
  const conjunctions = await Conjunction.find({
    createdAt: { $gte: sixHoursAgo },
    closestApproachDistance: { $lt: CONFIG.MEDIUM_THRESHOLD_KM }
  })
  .sort({ closestApproachDistance: 1 })
  .limit(100)
  .lean();
  
  const enrichedAlerts = await Promise.all(
    conjunctions.map(async (conj) => {
      const satA = await Satellite.findOne({ noradCatId: conj.satellite1 }).lean();
      const satB = await Satellite.findOne({ noradCatId: conj.satellite2 }).lean();
      
      const priority = getAlertPriority(conj.closestApproachDistance, CONFIG.DEFAULT_THRESHOLD_KM);
      
      return {
        id: conj._id,
        alertId: `CA-${conj._id.toString().slice(-8)}`,
        type: 'closest_approach',
        referenceSatellite: {
          noradCatId: satA?.noradCatId,
          name: satA?.name
        },
        approachingObject: {
          noradCatId: satB?.noradCatId,
          name: satB?.name
        },
        closestApproach: {
          distanceKm: conj.closestApproachDistance,
          time: conj.timeOfClosestApproach,
          thresholdUsed: CONFIG.DEFAULT_THRESHOLD_KM
        },
        priority,
        riskLevel: conj.riskLevel,
        relativeVelocity: conj.relativeVelocity,
        createdAt: conj.createdAt
      };
    })
  );
  
  return enrichedAlerts;
};

const configureThresholds = (thresholds) => {
  const result = {};
  
  for (const [shell, value] of Object.entries(thresholds)) {
    if (['leo', 'meo', 'geo'].includes(shell)) {
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue > 0) {
        DEFAULT_USER_THRESHOLDS[shell] = numValue;
        result[shell] = numValue;
      }
    }
  }
  
  return result;
};

module.exports = {
  setUserThreshold,
  getUserThreshold,
  findClosestApproaches,
  createClosestApproachAlert,
  scanAllClosestApproaches,
  getActiveClosestApproachAlerts,
  configureThresholds,
  CONFIG,
  DEFAULT_USER_THRESHOLDS
};
