const BreakupEvent = require('../models/BreakupEvent');
const Satellite = require('../models/Satellite');
const { getOrbitalShell } = require('./debrisAnalyticsEngine');
const { propagateSatellite } = require('./orbitEngine');

const PHYSICAL_CONSTANTS = {
  EARTH_RADIUS_KM: 6371,
  GM: 398600.4418,
  SOLAR_CYCLE_PERIOD_YEARS: 11,
  ATMOSPHERIC_DRAG_LEO: 0.0001,
  DECAY_THRESHOLD_KM: 200
};

const generateFragmentId = (parentId, index) => {
  return `${parentId}-${index.toString().padStart(5, '0')}`;
};

const calculateOrbitalVelocity = (altitude) => {
  const r = PHYSICAL_CONSTANTS.EARTH_RADIUS_KM + altitude;
  return Math.sqrt(PHYSICAL_CONSTANTS.GM / r);
};

const calculateOrbitalPeriod = (altitude) => {
  const a = PHYSICAL_CONSTANTS.EARTH_RADIUS_KM + altitude;
  return 2 * Math.PI * Math.sqrt(Math.pow(a, 3) / PHYSICAL_CONSTANTS.GM);
};

const calculateDispersionVelocity = (explosionEnergy, fragmentMass) => {
  const velocity = Math.sqrt(2 * explosionEnergy / fragmentMass);
  return Math.min(velocity, 0.5);
};

const disperseFragment = (fragment, params, currentDate) => {
  const velocityDelta = calculateDispersionVelocity(params.explosionEnergy, params.averageFragmentSize);
  const dispersionAngle = params.dispersionAngle * (Math.random() - 0.5);
  
  const newAltitude = fragment.initialAltitude + (Math.random() - 0.5) * velocityDelta * 100;
  const newRAAN = fragment.raan + dispersionAngle;
  const newInclination = fragment.inclination + (Math.random() - 0.5) * dispersionAngle;
  
  return {
    ...fragment,
    initialAltitude: newAltitude,
    finalAltitude: newAltitude,
    inclination: newInclination,
    raan: newRAAN,
    decayed: newAltitude < PHYSICAL_CONSTANTS.DECAY_THRESHOLD_KM,
    decayedDate: newAltitude < PHYSICAL_CONSTANTS.DECAY_THRESHOLD_KM ? currentDate : null
  };
};

const simulateBreakupEvent = async (params) => {
  const {
    name,
    sourceNoradId,
    sourceName,
    sourceType = 'satellite',
    eventType,
    initialAltitude,
    inclination = 0,
    raan = 0,
    satelliteMass = 500,
    explosionEnergy = 1000000,
    fragmentCount = 200,
    avgFragmentSize = 10,
    dispersionAngle = 30,
    timeStepDays = 1,
    simulationYears = 5
  } = params;
  
  const velocityDelta = calculateDispersionVelocity(explosionEnergy, avgFragmentSize);
  const orbitalShell = getOrbitalShell(initialAltitude);
  const eventDate = new Date();
  
  const fragments = [];
  const sizeDistribution = { tiny: 0, small: 0, medium: 0, large: 0 };
  
  for (let i = 0; i < fragmentCount; i++) {
    let fragmentSize;
    const sizeRand = Math.random();
    if (sizeRand < 0.7) {
      fragmentSize = 'tiny';
      sizeDistribution.tiny++;
    } else if (sizeRand < 0.9) {
      fragmentSize = 'small';
      sizeDistribution.small++;
    } else if (sizeRand < 0.98) {
      fragmentSize = 'medium';
      sizeDistribution.medium++;
    } else {
      fragmentSize = 'large';
      sizeDistribution.large++;
    }
    
    const altitudeDelta = (Math.random() - 0.5) * velocityDelta * 50;
    const finalAltitude = initialAltitude + altitudeDelta;
    
    const fragment = {
      noradCatId: parseInt(generateFragmentId(sourceNoradId || Date.now(), i)),
      size: fragmentSize,
      initialAltitude: initialAltitude,
      finalAltitude: finalAltitude,
      inclination: inclination + (Math.random() - 0.5) * dispersionAngle,
      raan: raan + (Math.random() - 0.5) * dispersionAngle,
      orbitalPeriod: calculateOrbitalPeriod(finalAltitude),
      decayed: finalAltitude < PHYSICAL_CONSTANTS.DECAY_THRESHOLD_KM,
      decayedDate: finalAltitude < PHYSICAL_CONSTANTS.DECAY_THRESHOLD_KM ? new Date(eventDate.getTime() + Math.random() * 365 * 24 * 60 * 60 * 1000) : null
    };
    
    fragments.push(fragment);
  }
  
  const breakupEvent = new BreakupEvent({
    eventId: `BRK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    eventDate,
    sourceObject: {
      noradCatId: sourceNoradId,
      name: sourceName,
      type: sourceType
    },
    eventType,
    location: {
      altitude: initialAltitude,
      inclination,
      raan
    },
    orbitalShell,
    debrisGenerated: fragmentCount,
    fragments: [],
    sizeDistribution,
    simulation: {
      enabled: true,
      parameters: {
        satelliteMass,
        explosionEnergy,
        fragmentCount,
        averageFragmentSize: avgFragmentSize,
        dispersionAngle,
        velocityDelta
      },
      results: {
        initialDebrisCount: fragmentCount,
        currentDebrisCount: fragmentCount,
        decayedCount: 0,
        avgDecayRate: 0,
        cascadeTriggered: false,
        cascadeProbability: 0,
        projectedCollisionRate: 0
      },
      createdAt: eventDate
    },
    status: 'active'
  });
  
  await breakupEvent.save();
  
  const results = await runDispersionSimulation(breakupEvent, {
    timeStepDays: 1,
    simulationYears
  });
  
  return {
    event: breakupEvent,
    results
  };
};

const runDispersionSimulation = async (event, params) => {
  const { timeStepDays, simulationYears } = params;
  const eventDate = event.simulation.createdAt;
  const simParams = event.simulation.parameters;
  
  let currentDebris = event.debrisGenerated;
  let decayedCount = 0;
  const collisionRate = 0.001;
  let cascadeTriggered = false;
  
  const projections = [];
  for (let year = 0; year <= simulationYears; year++) {
    const decayRate = 0.05 + (year * 0.01);
    const decayedThisYear = Math.floor(currentDebris * decayRate);
    decayedCount += decayedThisYear;
    currentDebris -= decayedThisYear;
    
    const collisionProbability = calculateCascadeProbability(currentDebris, event.orbitalShell);
    if (!cascadeTriggered && collisionProbability > 0.1) {
      cascadeTriggered = true;
    }
    
    projections.push({
      year: eventDate.getFullYear() + year,
      date: new Date(eventDate.getTime() + year * 365 * 24 * 60 * 60 * 1000),
      debrisCount: currentDebris,
      decayedCount,
      decayRate,
      cascadeProbability: collisionProbability,
      cascadeTriggered
    });
  }
  
  event.simulation.results = {
    initialDebrisCount: event.debrisGenerated,
    currentDebrisCount: currentDebris,
    decayedCount,
    avgDecayRate: decayedCount / simulationYears,
    cascadeTriggered,
    cascadeProbability: projections[projections.length - 1].cascadeProbability,
    projectedCollisionRate: collisionRate * currentDebris
  };
  event.simulation.completedAt = new Date();
  event.status = currentDebris > 0 ? 'monitoring' : 'completed';
  
  await event.save();
  
  return projections;
};

const calculateCascadeProbability = (debrisCount, orbitalShell) => {
  const criticalDensities = {
    LEO: 10000,
    MEO: 5000,
    GEO: 2000
  };
  
  const criticalMass = criticalDensities[orbitalShell] || 5000;
  return Math.min(debrisCount / criticalMass, 1);
};

const getBreakupEvents = async (filters = {}) => {
  const query = {};
  
  if (filters.eventType) query.eventType = filters.eventType;
  if (filters.orbitalShell) query.orbitalShell = filters.orbitalShell;
  if (filters.status) query.status = filters.status;
  if (filters.startDate || filters.endDate) {
    query.eventDate = {};
    if (filters.startDate) query.eventDate.$gte = new Date(filters.startDate);
    if (filters.endDate) query.eventDate.$lte = new Date(filters.endDate);
  }
  
  return BreakupEvent.find(query).sort({ eventDate: -1 }).lean();
};

const getBreakupEventById = async (eventId) => {
  return BreakupEvent.findOne({ eventId }).lean();
};

const analyzeCloudDispersion = async (eventId) => {
  const event = await BreakupEvent.findOne({ eventId });
  if (!event) return null;
  
  const altitudes = event.fragments.map(f => f.finalAltitude);
  const inclinations = event.fragments.map(f => f.inclination);
  const raans = event.fragments.map(f => f.raan);
  
  const stats = {
    altitudeRange: {
      min: Math.min(...altitudes),
      max: Math.max(...altitudes)
    },
    inclinationSpread: {
      min: Math.min(...inclinations),
      max: Math.max(...inclinations)
    },
    raanSpread: {
      min: Math.min(...raans),
      max: Math.max(...raans)
    },
    avgAltitude: altitudes.reduce((a, b) => a + b, 0) / altitudes.length,
    decayedFraction: event.fragments.filter(f => f.decayed).length / event.fragments.length
  };
  
  return stats;
};

const simulateCollisionScenario = async (params) => {
  const {
    primaryNoradId,
    secondaryNoradId,
    collisionVelocity,
    missDistance,
    primaryMass = 500,
    secondaryMass = 200
  } = params;
  
  const totalKineticEnergy = 0.5 * (primaryMass + secondaryMass) * Math.pow(collisionVelocity, 2);
  const fragmentCount = Math.floor(totalKineticEnergy / 10000) + 50;
  
  return simulateBreakupEvent({
    name: `Collision sim: ${primaryNoradId} x ${secondaryNoradId}`,
    sourceNoradId: primaryNoradId,
    sourceName: `Collision debris`,
    sourceType: 'simulated',
    eventType: 'collision',
    initialAltitude: 400,
    inclination: 51,
    raan: 0,
    satelliteMass: primaryMass + secondaryMass,
    explosionEnergy: totalKineticEnergy,
    fragmentCount,
    avgFragmentSize: 5,
    dispersionAngle: 45
  });
};

module.exports = {
  PHYSICAL_CONSTANTS,
  calculateOrbitalVelocity,
  calculateOrbitalPeriod,
  calculateDispersionVelocity,
  simulateBreakupEvent,
  runDispersionSimulation,
  getBreakupEvents,
  getBreakupEventById,
  analyzeCloudDispersion,
  simulateCollisionScenario,
  calculateCascadeProbability
};