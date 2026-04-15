const DebrisPopulation = require('../models/DebrisPopulation');
const Satellite = require('../models/Satellite');

const ORBITAL_SHELLS = {
  LEO: { name: 'LEO', altitudeMin: 200, altitudeMax: 2000 },
  MEO: { name: 'MEO', altitudeMin: 2000, altitudeMax: 35786 },
  GEO: { name: 'GEO', altitudeMin: 35786, altitudeMax: 35786 }
};

const getOrbitalShell = (altitude) => {
  if (altitude >= 200 && altitude < 2000) return 'LEO';
  if (altitude >= 2000 && altitude < 35786) return 'MEO';
  return 'GEO';
};

const categorizeDebrisSize = (radarCrossSection) => {
  if (radarCrossSection < 0.01) return 'tiny';
  if (radarCrossSection < 0.1) return 'small';
  if (radarCrossSection < 1) return 'medium';
  return 'large';
};

const captureDebrisPopulation = async (snapshotDate = new Date()) => {
  const satellites = await Satellite.find({});
  
  const populations = {
    LEO: { total: 0, debris: 0, satellites: 0, fragmentation: 0, mission: 0, collision: 0, rocket: 0, rcs: { tiny: 0, small: 0, medium: 0, large: 0 } },
    MEO: { total: 0, debris: 0, satellites: 0, fragmentation: 0, mission: 0, collision: 0, rocket: 0, rcs: { tiny: 0, small: 0, medium: 0, large: 0 } },
    GEO: { total: 0, debris: 0, satellites: 0, fragmentation: 0, mission: 0, collision: 0, rocket: 0, rcs: { tiny: 0, small: 0, medium: 0, large: 0 } }
  };

  satellites.forEach(sat => {
    const altitude = sat.orbitalAltitude || 0;
    const shell = getOrbitalShell(altitude);
    
    populations[shell].total++;
    
    const isDefunct = sat.riskScore === 0;
    const nameLower = (sat.name || '').toLowerCase();
    const isRocket = nameLower.includes('rocket') || nameLower.includes('upper stage') || nameLower.includes('debris');
    const isMissionRelated = nameLower.includes('mission') || nameLower.includes('debris');
    const isFragmentation = nameLower.includes('fragment') || nameLower.includes('broken');
    const isCollision = nameLower.includes('collision') || nameLower.includes(' Cosmos');
    
    if (isRocket) {
      populations[shell].rocket++;
      populations[shell].debris++;
    } else if (!nameLower.includes('payload') && !nameLower.includes('satellite')) {
      if (isFragmentation) populations[shell].fragmentation++;
      else if (isCollision) populations[shell].collision++;
      else if (isMissionRelated) populations[shell].mission++;
      else populations[shell].debris++;
    } else {
      if (isDefunct) {
        populations[shell].debris++;
      } else {
        populations[shell].satellites++;
      }
    }
  });

  const results = [];
  for (const [shellName, data] of Object.entries(populations)) {
    const shell = ORBITAL_SHELLS[shellName];
    const population = new DebrisPopulation({
      snapshotDate,
      orbitalShell: shellName,
      altitudeMin: shell.altitudeMin,
      altitudeMax: shell.altitudeMax,
      totalObjectCount: data.total,
      debrisCount: data.debris,
      satelliteCount: data.satellites,
      fragmentationDebris: data.fragmentation,
      missionRelatedDebris: data.mission,
      collisionDebris: data.collision,
      defunctSatellites: data.debris - data.rocket,
      rocketBodies: data.rocket,
      averageAltitude: (shell.altitudeMin + shell.altitudeMax) / 2,
      density: data.total / ((shell.altitudeMax - shell.altitudeMin) / 1000),
      radarCrossSection: data.rcs
    });
    
    await population.save();
    results.push(population);
  }
  
  return results;
};

const getDebrisTrends = async (orbitalShell, startDate, endDate) => {
  const query = { orbitalShell };
  
  if (startDate || endDate) {
    query.snapshotDate = {};
    if (startDate) query.snapshotDate.$gte = new Date(startDate);
    if (endDate) query.snapshotDate.$lte = new Date(endDate);
  }
  
  return DebrisPopulation.find(query)
    .sort({ snapshotDate: 1 })
    .lean();
};

const getHistoricalTrends = async (months = 12) => {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  
  const trends = await DebrisPopulation.aggregate([
    { $match: { snapshotDate: { $gte: startDate } } },
    {
      $group: {
        _id: { shell: '$orbitalShell', year: { $year: '$snapshotDate' }, month: { $month: '$snapshotDate' } },
        avgObjectCount: { $avg: '$totalObjectCount' },
        avgDebrisCount: { $avg: '$debrisCount' },
        avgDensity: { $avg: '$density' }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);
  
  return trends;
};

const getDebrisDensityByAltitude = async (orbitalShell, resolution = 50) => {
  const shell = ORBITAL_SHELLS[orbitalShell];
  if (!shell) throw new Error('Invalid orbital shell');
  
  const satellites = await Satellite.find({
    orbitalAltitude: { $gte: shell.altitudeMin, $lte: shell.altitudeMax }
  });
  
  const altitudeBuckets = {};
  const bucketSize = (shell.altitudeMax - shell.altitudeMin) / resolution;
  
  for (let alt = shell.altitudeMin; alt < shell.altitudeMax; alt += bucketSize) {
    const bucketKey = Math.floor(alt);
    altitudeBuckets[bucketKey] = 0;
  }
  
  satellites.forEach(sat => {
    const altitude = sat.orbitalAltitude || 0;
    const bucketKey = Math.floor((altitude - shell.altitudeMin) / bucketSize) * bucketSize + shell.altitudeMin;
    if (altitudeBuckets[bucketKey] !== undefined) {
      altitudeBuckets[bucketKey]++;
    }
  });
  
  return Object.entries(altitudeBuckets).map(([altitude, count]) => ({
    altitude: parseInt(altitude),
    count,
    density: count / bucketSize
  }));
};

const calculateDebrisGrowthRate = async (orbitalShell, periodMonths = 12) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - periodMonths);
  
  const latest = await DebrisPopulation.findOne({
    orbitalShell,
    snapshotDate: { $gte: startDate }
  }).sort({ snapshotDate: -1 });
  
  const earliest = await DebrisPopulation.findOne({
    orbitalShell,
    snapshotDate: { $lte: startDate }
  }).sort({ snapshotDate: 1 });
  
  if (!latest || !earliest) return { growthRate: 0, percentChange: 0 };
  
  const timeDiff = (latest.snapshotDate - earliest.snapshotDate) / (1000 * 60 * 60 * 24 * 30);
  const countDiff = latest.totalObjectCount - earliest.totalObjectCount;
  const growthRate = timeDiff > 0 ? countDiff / timeDiff : 0;
  const percentChange = earliest.totalObjectCount > 0 
    ? (countDiff / earliest.totalObjectCount) * 100 
    : 0;
  
  return {
    growthRate,
    percentChange,
    startCount: earliest.totalObjectCount,
    endCount: latest.totalObjectCount,
    periodMonths: Math.round(timeDiff)
  };
};

const getDebrisStatistics = async () => {
  const latest = await DebrisPopulation.find().sort({ snapshotDate: -1 }).limit(10);
  
  const stats = {
    LEO: { current: null, trend: 'stable', growthRate: 0 },
    MEO: { current: null, trend: 'stable', growthRate: 0 },
    GEO: { current: null, trend: 'stable', growthRate: 0 }
  };
  
  for (const pop of latest) {
    if (!stats[pop.orbitalShell].current) {
      stats[pop.orbitalShell].current = pop;
    }
  }
  
  for (const shell of ['LEO', 'MEO', 'GEO']) {
    const growth = await calculateDebrisGrowthRate(shell, 6);
    stats[shell].growthRate = growth.growthRate;
    stats[shell].trend = growth.growthRate > 0 ? 'increasing' : 'decreasing';
  }
  
  return stats;
};

module.exports = {
  ORBITAL_SHELLS,
  getOrbitalShell,
  categorizeDebrisSize,
  captureDebrisPopulation,
  getDebrisTrends,
  getHistoricalTrends,
  getDebrisDensityByAltitude,
  calculateDebrisGrowthRate,
  getDebrisStatistics
};