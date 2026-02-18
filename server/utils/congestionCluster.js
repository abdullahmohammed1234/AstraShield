const { propagateSatellite } = require('../services/orbitEngine');

const CONFIG = {
  DEFAULT_BANDS: 20,
  MIN_ALTITUDE: 200,
  MAX_ALTITUDE: 36000,
  DEFAULT_CLUSTER_LIMIT: 100,
  DENSITY_THRESHOLD: 0.7
};

const clusterByAltitude = (satellites, numBands = CONFIG.DEFAULT_BANDS) => {
  const { MIN_ALTITUDE, MAX_ALTITUDE } = CONFIG;
  const bandSize = (MAX_ALTITUDE - MIN_ALTITUDE) / numBands;

  const clusters = Array.from({ length: numBands }, (_, i) => ({
    band: i,
    altitudeMin: MIN_ALTITUDE + i * bandSize,
    altitudeMax: MIN_ALTITUDE + (i + 1) * bandSize,
    satellites: [],
    density: 0
  }));

  satellites.forEach(sat => {
    if (sat.orbitalAltitude >= MIN_ALTITUDE && sat.orbitalAltitude <= MAX_ALTITUDE) {
      const bandIndex = Math.floor((sat.orbitalAltitude - MIN_ALTITUDE) / bandSize);
      if (bandIndex >= 0 && bandIndex < numBands) {
        clusters[bandIndex].satellites.push(sat);
      }
    }
  });

  const maxCount = Math.max(...clusters.map(c => c.satellites.length), 1);
  
  clusters.forEach(cluster => {
    cluster.density = cluster.satellites.length / maxCount;
  });

  return clusters.filter(c => c.satellites.length > 0);
};

const findHighDensityRegions = (satellites, threshold = CONFIG.DENSITY_THRESHOLD) => {
  const clusters = clusterByAltitude(satellites);
  return clusters.filter(c => c.density >= threshold);
};

const calculateClusterPositions = async (satellites, limit = CONFIG.DEFAULT_CLUSTER_LIMIT) => {
  const positions = [];

  // Process only the requested number of satellites
  for (const sat of satellites.slice(0, limit)) {
    const pos = propagateSatellite(sat.tleLine1, sat.tleLine2);
    if (pos) {
      positions.push({
        noradCatId: sat.noradCatId,
        name: sat.name,
        x: pos.x / 1000,
        y: pos.y / 1000,
        z: pos.z / 1000,
        altitude: sat.orbitalAltitude,
        riskScore: sat.riskScore
      });
    }
  }

  return positions;
};

module.exports = {
  clusterByAltitude,
  findHighDensityRegions,
  calculateClusterPositions,
  CONFIG
};
