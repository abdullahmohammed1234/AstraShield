const Satellite = require('../models/Satellite');
const Conjunction = require('../models/Conjunction');
const { propagateSatellite } = require('./orbitEngine');

const CONFIG = {
  CLOSE_APPROACH_THRESHOLD_KM: 10,
  HIGH_VELOCITY_KM_S: 7.5,
  BATCH_SIZE: 100,
  MAX_SATELLITES: 1000
};

const calculateRiskScore = (closestDistanceKm, relativeVelocity, congestionFactor = 1) => {
  if (closestDistanceKm <= 0) return 1;

  const velocityFactor = Math.min(relativeVelocity / CONFIG.HIGH_VELOCITY_KM_S, 1);
  const distanceFactor = 1 / (closestDistanceKm + 1);
  const rawRisk = distanceFactor * velocityFactor * congestionFactor;
  
  return Math.min(Math.max(rawRisk * 100, 0), 1);
};

const calculateCongestionFactor = (satellites, targetAltitude) => {
  const altitudeBands = {
    leo: { min: 200, max: 2000 },
    meo: { max: 35000 },
    geo: { min: 35786, max: 35786 }
  };

  const bandKey = targetAltitude <= 2000 ? 'leo' : targetAltitude <= 35786 ? 'meo' : 'geo';
  const band = altitudeBands[bandKey];
  
  const nearbySats = satellites.filter(s => 
    s.orbitalAltitude >= (band.min || 0) && 
    s.orbitalAltitude <= (band.max || 50000)
  );

  const density = nearbySats.length / 100;
  return Math.min(density * 2, 3);
};

// Optimized position calculation - returns all positions in one pass
const calculateAllPositions = async (satellites) => {
  const positions = [];
  
  for (const sat of satellites) {
    const tleLine1 = sat.tleLine1 || (sat.tle && sat.tle.line1);
    const tleLine2 = sat.tleLine2 || (sat.tle && sat.tle.line2);
    
    const pos = propagateSatellite(tleLine1, tleLine2);
    if (pos) {
      positions.push({
        noradCatId: sat.noradCatId,
        name: sat.name,
        position: pos,
        orbitalAltitude: sat.orbitalAltitude || 0,
        velocity: pos.altitude > 0 ? 7.8 : 3.1
      });
    }
  }
  
  return positions;
};

// Optimized distance calculation using spatial partitioning
const calculateDistancesOptimized = (positions) => {
  const results = [];
  const n = positions.length;
  
  // Pre-compute all squared distances to avoid sqrt in comparison
  const squaredThreshold = CONFIG.CLOSE_APPROACH_THRESHOLD_KM * CONFIG.CLOSE_APPROACH_THRESHOLD_KM;
  
  for (let i = 0; i < n; i++) {
    let closestDistanceSq = Infinity;
    let closestVelocity = 0;
    let closeApproachCount = 0;

    for (let j = 0; j < n; j++) {
      if (i === j) continue;

      const dx = positions[i].position.x - positions[j].position.x;
      const dy = positions[i].position.y - positions[j].position.y;
      const dz = positions[i].position.z - positions[j].position.z;
      const distanceSq = dx * dx + dy * dy + dz * dz;

      if (distanceSq < closestDistanceSq) {
        closestDistanceSq = distanceSq;
        closestVelocity = Math.abs(positions[i].velocity - positions[j].velocity);
      }

      if (distanceSq < squaredThreshold) {
        closeApproachCount++;
      }
    }

    results.push({
      index: i,
      noradCatId: positions[i].noradCatId,
      name: positions[i].name,
      closestDistance: Math.sqrt(closestDistanceSq),
      closestVelocity,
      closeApproachCount,
      orbitalAltitude: positions[i].orbitalAltitude
    });
  }

  return results;
};

const calculateAllRiskScores = async () => {
  const satellites = await Satellite.find({}).limit(CONFIG.MAX_SATELLITES).lean();
  const positions = await calculateAllPositions(satellites);
  
  if (positions.length === 0) {
    return [];
  }

  const distanceResults = calculateDistancesOptimized(positions);
  const risks = [];
  const bulkOperations = [];
  
  for (const result of distanceResults) {
    const congestionFactor = calculateCongestionFactor(
      satellites,
      result.orbitalAltitude
    );

    const riskScore = calculateRiskScore(
      result.closestDistance,
      result.closestVelocity || 1,
      congestionFactor
    );

    risks.push({
      noradCatId: result.noradCatId,
      name: result.name,
      riskScore,
      closestDistance: result.closestDistance,
      closeApproachCount: result.closeApproachCount,
      orbitalAltitude: result.orbitalAltitude
    });

    bulkOperations.push({
      updateOne: {
        filter: { noradCatId: result.noradCatId },
        update: { $set: { riskScore, lastUpdated: new Date() } }
      }
    });
  }

  // Bulk write for efficiency
  if (bulkOperations.length > 0) {
    await Satellite.bulkWrite(bulkOperations, { ordered: false });
  }

  return risks;
};

const getHighRiskSatellites = (minRisk = 0.7, limit = 10) => {
  return Satellite.find({ riskScore: { $gte: minRisk } })
    .sort({ riskScore: -1 })
    .limit(limit);
};

const getRiskStatistics = async () => {
  const total = await Satellite.countDocuments();
  const highRisk = await Satellite.countDocuments({ riskScore: { $gte: 0.6 } });
  const mediumRisk = await Satellite.countDocuments({ 
    riskScore: { $gte: 0.3, $lt: 0.6 } 
  });
  const lowRisk = await Satellite.countDocuments({ riskScore: { $lt: 0.3 } });

  const altitudeRanges = {
    leo: await Satellite.countDocuments({ orbitalAltitude: { $lte: 2000 } }),
    meo: await Satellite.countDocuments({ 
      orbitalAltitude: { $gt: 2000, $lte: 35786 } 
    }),
    geo: await Satellite.countDocuments({ orbitalAltitude: { $gt: 35786 } })
  };

  return {
    total,
    riskDistribution: { high: highRisk, medium: mediumRisk, low: lowRisk },
    altitudeDistribution: altitudeRanges,
    averageRisk: (highRisk * 0.8 + mediumRisk * 0.4 + lowRisk * 0.1) / total || 0
  };
};

const getConjunctionRiskForSatellite = async (noradCatId, conjunctionCache = null) => {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  
  // Use cache if available to avoid repeated queries
  if (conjunctionCache) {
    const satConjunctions = conjunctionCache.filter(c => 
      c.satellite1 === noradCatId || c.satellite2 === noradCatId
    );
    
    if (satConjunctions.length === 0) {
      return { risk: 0, closestDistance: null, conjunctionCount: 0 };
    }
    
    const sorted = satConjunctions.sort((a, b) => a.closestApproachDistance - b.closestApproachDistance);
    const closest = sorted[0];
    const minDistanceKm = closest.closestApproachDistance;
    const conjunctionRisk = Math.max(0, Math.min(1, 1 - (minDistanceKm / 10)));
    
    return {
      risk: conjunctionRisk,
      closestDistance: minDistanceKm,
      conjunctionCount: satConjunctions.length,
      riskLevel: closest.riskLevel
    };
  }
  
  const conjunctions = await Conjunction.find({
    $or: [
      { satellite1: noradCatId },
      { satellite2: noradCatId }
    ],
    createdAt: { $gte: sixHoursAgo }
  }).sort({ closestApproachDistance: 1 }).lean();
  
  if (conjunctions.length === 0) {
    return { risk: 0, closestDistance: null, conjunctionCount: 0 };
  }
  
  const closestConjunction = conjunctions[0];
  const minDistanceKm = closestConjunction.closestApproachDistance;
  
  const conjunctionRisk = Math.max(0, Math.min(1, 1 - (minDistanceKm / 10)));
  
  return {
    risk: conjunctionRisk,
    closestDistance: minDistanceKm,
    conjunctionCount: conjunctions.length,
    riskLevel: closestConjunction.riskLevel
  };
};

// Optimized conjunction data preloading
const loadConjunctionCache = async () => {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  return Conjunction.find({
    createdAt: { $gte: sixHoursAgo }
  }).lean();
};

const calculateAllRiskScoresWithConjunctions = async () => {
  console.log('Calculating risk scores with conjunction data...');
  
  const satellites = await Satellite.find({}).limit(CONFIG.MAX_SATELLITES).lean();
  const positions = await calculateAllPositions(satellites);
  
  if (positions.length === 0) {
    return [];
  }

  // Preload conjunction data once for all satellites
  console.log('Loading conjunction cache...');
  const conjunctionCache = await loadConjunctionCache();
  console.log(`Loaded ${conjunctionCache.length} active conjunctions`);

  const distanceResults = calculateDistancesOptimized(positions);
  const risks = [];
  const bulkOperations = [];
  
  for (const result of distanceResults) {
    const congestionFactor = calculateCongestionFactor(
      satellites,
      result.orbitalAltitude
    );

    const congestionRisk = calculateRiskScore(
      result.closestDistance,
      result.closestVelocity || 1,
      congestionFactor
    );

    // Use cached conjunction data instead of individual queries
    const conjunctionData = await getConjunctionRiskForSatellite(
      result.noradCatId, 
      conjunctionCache
    );
    const conjunctionRisk = conjunctionData.risk;
    
    const finalRisk = Math.max(0, Math.min(1, 
      congestionRisk * 0.4 + conjunctionRisk * 0.6
    ));

    risks.push({
      noradCatId: result.noradCatId,
      name: result.name,
      riskScore: finalRisk,
      congestionRisk,
      conjunctionRisk,
      closestDistance: result.closestDistance,
      closeApproachCount: result.closeApproachCount,
      orbitalAltitude: result.orbitalAltitude,
      hasActiveConjunction: conjunctionData.conjunctionCount > 0,
      conjunctionDetails: conjunctionData
    });

    bulkOperations.push({
      updateOne: {
        filter: { noradCatId: result.noradCatId },
        update: { 
          $set: { 
            riskScore: finalRisk,
            lastUpdated: new Date() 
          }
        }
      }
    });
  }

  // Bulk write for efficiency
  if (bulkOperations.length > 0) {
    await Satellite.bulkWrite(bulkOperations, { ordered: false });
  }

  return risks;
};

module.exports = {
  calculateRiskScore,
  calculateCongestionFactor,
  calculateAllRiskScores,
  calculateAllRiskScoresWithConjunctions,
  getConjunctionRiskForSatellite,
  loadConjunctionCache,
  getHighRiskSatellites,
  getRiskStatistics,
  CONFIG
};
