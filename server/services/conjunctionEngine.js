const satellite = require('satellite.js');
const Satellite = require('../models/Satellite');
const Conjunction = require('../models/Conjunction');

const CONFIG = {
  MAX_SATELLITES: 300,
  FORECAST_HOURS: 12,
  SAMPLE_INTERVAL_MINUTES: 5,
  ALTITUDE_DIFF_THRESHOLD_KM: 200,
  STORAGE_THRESHOLD_KM: 10,
  RISK_THRESHOLDS: {
    MODERATE: 10,
    HIGH: 5,
    CRITICAL: 1
  },
  BATCH_SIZE: 100
};

const getAltitudeBand = (altitudeKm) => {
  if (altitudeKm <= 2000) return 'leo';
  if (altitudeKm <= 35786) return 'meo';
  return 'geo';
};

const generateSampledPositions = (tleLine1, tleLine2, startTime, numSamples) => {
  const positions = [];
  
  try {
    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
    const intervalMs = CONFIG.SAMPLE_INTERVAL_MINUTES * 60 * 1000;
    
    for (let i = 0; i < numSamples; i++) {
      const time = new Date(startTime.getTime() + (i * intervalMs));
      const position = satellite.propagate(satrec, time);
      
      if (position.position) {
        positions.push({
          x: position.position.x / 1000,
          y: position.position.y / 1000,
          z: position.position.z / 1000,
          time
        });
      }
    }
  } catch (error) {
    // Silently handle propagation errors for individual satellites
  }
  
  return positions;
};

const calculateDistance = (pos1, pos2) => {
  const dx = pos2.x - pos1.x;
  const dy = pos2.y - pos1.y;
  const dz = pos2.z - pos1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

const calculateRelativeVelocity = (satA, satB) => {
  // Simplified relative velocity calculation
  const avgVelocity = 7.5;
  return avgVelocity * 2;
};

const getRiskLevel = (distanceKm) => {
  if (distanceKm < CONFIG.RISK_THRESHOLDS.CRITICAL) return 'critical';
  if (distanceKm < CONFIG.RISK_THRESHOLDS.HIGH) return 'high';
  if (distanceKm < CONFIG.RISK_THRESHOLDS.MODERATE) return 'moderate';
  return 'low';
};

const computeConjunction = (satA, satB, positionsA, positionsB) => {
  let minDistance = Infinity;
  let timeOfClosestApproach = null;
  
  const numSamples = Math.min(positionsA.length, positionsB.length);
  
  for (let i = 0; i < numSamples; i++) {
    const distance = calculateDistance(positionsA[i], positionsB[i]);
    
    if (distance < minDistance) {
      minDistance = distance;
      timeOfClosestApproach = positionsA[i].time;
    }
  }
  
  if (minDistance < CONFIG.STORAGE_THRESHOLD_KM) {
    return {
      satA: satA.noradCatId,
      satB: satB.noradCatId,
      satAName: satA.name,
      satBName: satB.name,
      minDistanceKm: minDistance,
      timeOfClosestApproach,
      riskLevel: getRiskLevel(minDistance),
      altitudeBand: getAltitudeBand(satA.orbitalAltitude || 0),
      relativeVelocity: calculateRelativeVelocity(satA, satB)
    };
  }
  
  return null;
};

const runConjunctionDetection = async () => {
  console.log('Starting conjunction detection engine...');
  const startTime = Date.now();
  
  const satellites = await Satellite.find({})
    .limit(CONFIG.MAX_SATELLITES)
    .lean();
  
  console.log(`Loaded ${satellites.length} satellites for analysis`);
  
  const startForecast = new Date();
  const numSamples = (CONFIG.FORECAST_HOURS * 60) / CONFIG.SAMPLE_INTERVAL_MINUTES;
  
  console.log(`Generating ${numSamples} position samples per satellite...`);
  
  const cachedPositions = new Map();
  
  for (const sat of satellites) {
    const tleLine1 = sat.tleLine1 || (sat.tle && sat.tle.line1);
    const tleLine2 = sat.tleLine2 || (sat.tle && sat.tle.line2);
    
    if (tleLine1 && tleLine2) {
      const positions = generateSampledPositions(tleLine1, tleLine2, startForecast, numSamples);
      if (positions.length > 0) {
        cachedPositions.set(sat.noradCatId, {
          sat,
          positions,
          altitude: sat.orbitalAltitude || 0,
          altitudeBand: getAltitudeBand(sat.orbitalAltitude || 0)
        });
      }
    }
  }
  
  console.log(`Cached positions for ${cachedPositions.size} satellites`);
  
  const satellitesByBand = {
    leo: [],
    meo: [],
    geo: []
  };
  
  cachedPositions.forEach((data, noradCatId) => {
    satellitesByBand[data.altitudeBand].push({ noradCatId, ...data });
  });
  
  console.log(`Satellites by band - LEO: ${satellitesByBand.leo.length}, MEO: ${satellitesByBand.meo.length}, GEO: ${satellitesByBand.geo.length}`);
  
  const conjunctions = [];
  let comparisons = 0;
  
  const processBand = (bandSats) => {
    const bandConjunctions = [];
    
    for (let i = 0; i < bandSats.length; i++) {
      for (let j = i + 1; j < bandSats.length; j++) {
        const satA = bandSats[i];
        const satB = bandSats[j];
        
        const altDiff = Math.abs(satA.altitude - satB.altitude);
        
        if (altDiff > CONFIG.ALTITUDE_DIFF_THRESHOLD_KM) {
          continue;
        }
        
        comparisons++;
        
        const conjunction = computeConjunction(
          satA.sat,
          satB.sat,
          satA.positions,
          satB.positions
        );
        
        if (conjunction) {
          bandConjunctions.push(conjunction);
        }
      }
    }
    
    return bandConjunctions;
  };
  
  for (const band of ['leo', 'meo', 'geo']) {
    const bandConjunctions = processBand(satellitesByBand[band]);
    conjunctions.push(...bandConjunctions);
  }
  
  console.log(`Total comparisons performed: ${comparisons}`);
  console.log(`Conjunctions found (distance < ${CONFIG.STORAGE_THRESHOLD_KM}km): ${conjunctions.length}`);
  
  if (conjunctions.length > 0) {
    console.log('Storing conjunctions to database (bulk write)...');
    
    // Use bulk operations for efficiency
    const bulkOperations = conjunctions.map(conj => ({
      updateOne: {
        filter: {
          satellite1: Math.min(conj.satA, conj.satB),
          satellite2: Math.max(conj.satA, conj.satB)
        },
        update: {
          $set: {
            satellite1: Math.min(conj.satA, conj.satB),
            satellite2: Math.max(conj.satA, conj.satB),
            closestApproachDistance: conj.minDistanceKm,
            timeOfClosestApproach: conj.timeOfClosestApproach,
            relativeVelocity: conj.relativeVelocity,
            riskLevel: conj.riskLevel,
            createdAt: new Date()
          }
        },
        upsert: true
      }
    }));
    
    try {
      const result = await Conjunction.bulkWrite(bulkOperations, { ordered: false });
      console.log(`Bulk write result: ${result.upsertedCount} upserted, ${result.modifiedCount} modified`);
    } catch (error) {
      console.error('Bulk write error:', error.message);
      // Fallback to individual writes if bulk fails
      for (const conj of conjunctions) {
        try {
          await Conjunction.findOneAndUpdate(
            {
              satellite1: Math.min(conj.satA, conj.satB),
              satellite2: Math.max(conj.satA, conj.satB)
            },
            {
              satellite1: Math.min(conj.satA, conj.satB),
              satellite2: Math.max(conj.satA, conj.satB),
              closestApproachDistance: conj.minDistanceKm,
              timeOfClosestApproach: conj.timeOfClosestApproach,
              relativeVelocity: conj.relativeVelocity,
              riskLevel: conj.riskLevel,
              createdAt: new Date()
            },
            { upsert: true, new: true }
          );
        } catch (individualError) {
          console.error('Error storing conjunction:', individualError.message);
        }
      }
    }
  }
  
  const duration = (Date.now() - startTime) / 1000;
  console.log(`Conjunction detection completed in ${duration.toFixed(2)} seconds`);
  
  return conjunctions;
};

const getActiveConjunctions = async (limit = 100) => {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  
  const conjunctions = await Conjunction.find({
    createdAt: { $gte: sixHoursAgo }
  })
    .sort({ closestApproachDistance: 1 })
    .limit(limit)
    .lean();
  
  const enrichedConjunctions = await Promise.all(
    conjunctions.map(async (conj) => {
      const satA = await Satellite.findOne({ noradCatId: conj.satellite1 }).lean();
      const satB = await Satellite.findOne({ noradCatId: conj.satellite2 }).lean();
      
      return {
        id: conj._id,
        satA: conj.satellite1,
        satB: conj.satellite2,
        satAName: satA?.name || `SAT-${conj.satellite1}`,
        satBName: satB?.name || `SAT-${conj.satellite2}`,
        minDistanceKm: conj.closestApproachDistance,
        timeOfClosestApproach: conj.timeOfClosestApproach,
        riskLevel: conj.riskLevel,
        relativeVelocity: conj.relativeVelocity,
        createdAt: conj.createdAt
      };
    })
  );
  
  return enrichedConjunctions;
};

const getHighRiskConjunctions = async (minRisk = 'high') => {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  
  const riskLevels = minRisk === 'critical' ? ['critical'] : ['high', 'critical'];
  
  const conjunctions = await Conjunction.find({
    createdAt: { $gte: sixHoursAgo },
    riskLevel: { $in: riskLevels }
  })
    .sort({ closestApproachDistance: 1 })
    .lean();
  
  const enrichedConjunctions = await Promise.all(
    conjunctions.map(async (conj) => {
      const satA = await Satellite.findOne({ noradCatId: conj.satellite1 }).lean();
      const satB = await Satellite.findOne({ noradCatId: conj.satellite2 }).lean();
      
      return {
        id: conj._id,
        satA: conj.satellite1,
        satB: conj.satellite2,
        satAName: satA?.name || `SAT-${conj.satellite1}`,
        satBName: satB?.name || `SAT-${conj.satellite2}`,
        minDistanceKm: conj.closestApproachDistance,
        timeOfClosestApproach: conj.timeOfClosestApproach,
        riskLevel: conj.riskLevel,
        relativeVelocity: conj.relativeVelocity,
        createdAt: conj.createdAt
      };
    })
  );
  
  return enrichedConjunctions;
};

const getConjunctionStatistics = async () => {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  
  const total = await Conjunction.countDocuments({ createdAt: { $gte: sixHoursAgo } });
  const critical = await Conjunction.countDocuments({ 
    createdAt: { $gte: sixHoursAgo },
    riskLevel: 'critical'
  });
  const high = await Conjunction.countDocuments({ 
    createdAt: { $gte: sixHoursAgo },
    riskLevel: 'high'
  });
  const moderate = await Conjunction.countDocuments({ 
    createdAt: { $gte: sixHoursAgo },
    riskLevel: 'moderate'
  });
  
  return {
    total,
    byRisk: { critical, high, moderate },
    lastUpdated: new Date()
  };
};

module.exports = {
  runConjunctionDetection,
  getActiveConjunctions,
  getHighRiskConjunctions,
  getConjunctionStatistics,
  CONFIG
};
