/**
 * Mission Planning Service
 * Provides optimal orbit selection to minimize debris collision risk
 * and predict satellite lifetime based on orbital decay models
 */

const Satellite = require('../models/Satellite');
const { logger } = require('../utils/logger');
const { getOrbitalParameters, predictReentry } = require('./reentryEngine');

const EARTH_RADIUS_KM = 6371;
const GM = 398600.4418;

const ORBITAL_SHELLS = {
  vleo: { min: 200, max: 300, name: 'Very Low Earth Orbit', debrisRisk: 'low' },
  leo: { min: 300, max: 2000, name: 'Low Earth Orbit', debrisRisk: 'moderate' },
  meo: { min: 2000, max: 35786, name: 'Medium Earth Orbit', debrisRisk: 'low' },
  geo: { min: 35786, max: 42164, name: 'Geostationary Orbit', debrisRisk: 'very_low' }
};

const MISSION_TYPES = {
  observation: { preferredAltitude: [400, 600], preferredInclination: [65, 100] },
  communication: { preferredAltitude: [500, 1000], preferredInclination: [0, 30] },
  navigation: { preferredAltitude: [20000, 24000], preferredInclination: [50, 65] },
  weather: { preferredAltitude: [800, 1000], preferredInclination: [98, 99] },
  general: { preferredAltitude: [300, 1200], preferredInclination: [0, 100] }
};

const calculateOrbitalPeriod = (altitudeKm) => {
  const semiMajorAxis = EARTH_RADIUS_KM + altitudeKm;
  return 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / GM) / 60;
};

const calculateOrbitalVelocity = (altitudeKm) => {
  const radius = EARTH_RADIUS_KM + altitudeKm;
  return Math.sqrt(GM / radius);
};

const getDebrisDensityAtAltitude = async (altitudeKm, tolerance = 50) => {
  const satellites = await Satellite.find({
    orbitalAltitude: { $gte: altitudeKm - tolerance, $lte: altitudeKm + tolerance }
  }).limit(5000).lean();

  const debrisCount = satellites.filter(s => 
    s.objectType === 'DEBRIS' || 
    s.operationalStatus === 'NON-OPERATIONAL'
  ).length;

  const orbitalCircumference = 2 * Math.PI * (EARTH_RADIUS_KM + altitudeKm);
  const density = (satellites.length / orbitalCircumference) * 1000;

  return {
    totalObjects: satellites.length,
    debrisObjects: debrisCount,
    density: density.toFixed(4),
    altitude: altitudeKm
  };
};

const getInclinationDebrisRisk = async (inclinationDeg, tolerance = 5) => {
  const satellites = await Satellite.find({
    inclination: { $gte: inclinationDeg - tolerance, $lte: inclinationDeg + tolerance }
  }).limit(5000).lean();

  const debrisCount = satellites.filter(s => 
    s.objectType === 'DEBRIS' || 
    s.operationalStatus === 'NON-OPERATIONAL'
  ).length;

  const riskScore = Math.min(100, Math.round(
    (debrisCount / Math.max(satellites.length, 1)) * 200
  ));

  return {
    totalObjects: satellites.length,
    debrisObjects: debrisCount,
    riskScore,
    riskLevel: riskScore > 70 ? 'high' : riskScore > 40 ? 'moderate' : 'low'
  };
};

const calculateCollisionRiskScore = (altitudeKm, inclinationDeg, debrisDensity) => {
  let score = 0;

  const altitudeRisk = altitudeKm < 400 ? 30 :
                       altitudeKm < 600 ? 20 :
                       altitudeKm < 1000 ? 10 : 5;
  score += altitudeRisk;

  const incRisk = inclinationDeg > 80 && inclinationDeg < 100 ? 15 :
                  inclinationDeg > 60 && inclinationDeg < 110 ? 10 : 5;
  score += incRisk;

  const debrisRisk = parseFloat(debrisDensity.density) * 100;
  score += debrisRisk;

  return Math.min(100, score);
};

const estimateMissionLifetime = (altitudeKm, inclinationDeg) => {
  const decayRates = {
    below300: 0.5,
    300_400: 0.2,
    400_500: 0.1,
    500_600: 0.05,
    above600: 0.01
  };

  let baseDecayRate;
  if (altitudeKm < 300) baseDecayRate = decayRates.below300;
  else if (altitudeKm < 400) baseDecayRate = decayRates['300_400'];
  else if (altitudeKm < 500) baseDecayRate = decayRates['400_500'];
  else if (altitudeKm < 600) baseDecayRate = decayRates['500_600'];
  else baseDecayRate = decayRates.above600;

  const inclinationFactor = inclinationDeg > 60 ? 1.5 : 1;
  const estimatedLifetimeYears = (1 / (baseDecayRate * inclinationFactor)) * 0.5;

  return {
    estimatedLifetimeYears: Math.max(0.1, Math.min(15, estimatedLifetimeYears)),
    estimatedLifetimeDays: Math.round(estimatedLifetimeYears * 365),
    altitudeAtEndOfLife: Math.max(100, altitudeKm - baseDecayRate * estimatedLifetimeYears * 50),
    decayRateKmPerDay: baseDecayRate * inclinationFactor
  };
};

const calculateOptimalOrbit = async (params) => {
  const { missionType, desiredAltitude, desiredInclination, priority } = params;
  const mission = MISSION_TYPES[missionType] || MISSION_TYPES.general;

  const alternatives = [];
  const altitudes = [
    desiredAltitude - 100,
    desiredAltitude - 50,
    desiredAltitude,
    desiredAltitude + 50,
    desiredAltitude + 100
  ].filter(alt => alt >= 200 && alt <= 2000);

  for (const alt of altitudes) {
    const [debrisDensity, inclinationRisk] = await Promise.all([
      getDebrisDensityAtAltitude(alt),
      getInclinationDebrisRisk(desiredInclination)
    ]);

    const collisionRisk = calculateCollisionRiskScore(alt, desiredInclination, debrisDensity);
    const lifetime = estimateMissionLifetime(alt, desiredInclination);
    const period = calculateOrbitalPeriod(alt);
    const velocity = calculateOrbitalVelocity(alt);

    let suitability;
    if (priority === 'debris') {
      suitability = Math.max(0, 100 - collisionRisk);
    } else if (priority === 'longevity') {
      suitability = Math.min(100, lifetime.estimatedLifetimeYears * 10);
    } else {
      suitability = (Math.max(0, 100 - collisionRisk) * 0.6) + 
                    (Math.min(100, lifetime.estimatedLifetimeYears * 10) * 0.4);
    }

    alternatives.push({
      altitude: alt,
      inclination: desiredInclination,
      orbitalPeriod: period.toFixed(2),
      orbitalVelocity: velocity.toFixed(3),
      debrisDensity,
      inclinationRisk,
      collisionRiskScore: collisionRisk,
      collisionRiskLevel: collisionRisk > 70 ? 'high' : collisionRisk > 40 ? 'moderate' : 'low',
      estimatedLifetime: lifetime,
      suitabilityScore: Math.round(suitability),
      suitabilityRating: suitability >= 80 ? 'excellent' :
                         suitability >= 60 ? 'good' :
                         suitability >= 40 ? 'fair' : 'poor'
    });
  }

  alternatives.sort((a, b) => b.suitabilityScore - a.suitabilityScore);
  const optimal = alternatives[0];

  return {
    missionType,
    priority,
    desiredAltitude,
    desiredInclination,
    optimalOrbit: optimal,
    alternativeOptions: alternatives.slice(1, 4),
    recommendations: [
      optimal.suitabilityScore >= 80 ? null : 
        `Consider ${optimal.altitude < desiredAltitude ? 'lower' : 'higher'} altitude for better debris avoidance`,
      optimal.estimatedLifetime.estimatedLifetimeYears < 2 ?
        `Warning: Low estimated lifetime of ${optimal.estimatedLifetime.estimatedLifetimeDays} days` : null,
      optimal.collisionRiskScore > 50 ?
        `Monitor conjunction data for ${optimal.altitude}km altitude` : null
    ].filter(Boolean)
  };
};

const findLowRiskOrbitOptions = async (params) => {
  const { minAltitude, maxAltitude, inclination, inclinationTolerance } = params;

  const options = [];
  const step = 50;

  for (let alt = minAltitude; alt <= maxAltitude; alt += step) {
    const [debrisDensity, inclinationRisk] = await Promise.all([
      getDebrisDensityAtAltitude(alt),
      getInclinationDebrisRisk(inclination, inclinationTolerance)
    ]);

    const collisionRisk = calculateCollisionRiskScore(alt, inclination, debrisDensity);
    const lifetime = estimateMissionLifetime(alt, inclination);
    const period = calculateOrbitalPeriod(alt);

    options.push({
      altitude: alt,
      inclination: inclination,
      orbitalPeriod: period.toFixed(2),
      debrisDensity,
      inclinationRisk,
      collisionRiskScore: collisionRisk,
      collisionRiskLevel: collisionRisk > 70 ? 'high' : collisionRisk > 40 ? 'moderate' : 'low',
      estimatedLifetime: lifetime,
      overallScore: Math.max(0, 100 - collisionRisk),
      recommended: collisionRisk < 40 && lifetime.estimatedLifetimeYears > 1
    });
  }

  options.sort((a, b) => b.overallScore - a.overallScore);

  return {
    searchParams: params,
    results: options.slice(0, 10),
    bestOption: options[0],
    totalAnalyzed: options.length
  };
};

const analyzeMissionRisk = async (params) => {
  const { altitude, inclination, missionDuration } = params;

  const [debrisDensity, inclinationRisk] = await Promise.all([
    getDebrisDensityAtAltitude(altitude),
    getInclinationDebrisRisk(inclination)
  ]);

  const collisionRisk = calculateCollisionRiskScore(altitude, inclination, debrisDensity);
  const lifetime = estimateMissionLifetime(altitude, inclination);

  const simulatedLifetimeYears = lifetime.estimatedLifetimeYears;
  const riskMet = simulatedLifetimeYears >= (missionDuration / 365);

  return {
    missionParameters: params,
    riskAnalysis: {
      collisionRiskScore: collisionRisk,
      collisionRiskLevel: collisionRisk > 70 ? 'high' : collisionRisk > 40 ? 'moderate' : 'low',
      debrisDensity,
      inclinationRisk
    },
    lifetimePrediction: {
      estimatedLifetimeYears: simulatedLifetimeYears.toFixed(2),
      estimatedLifetimeDays: Math.round(simulatedLifetimeYears * 365),
      meetsMissionDuration: riskMet,
      marginOfSafety: riskMet ? 
        Math.round((simulatedLifetimeYears * 365 - missionDuration) / missionDuration * 100) :
        -Math.round((missionDuration - simulatedLifetimeYears * 365) / missionDuration * 100)
    },
    recommendations: riskMet ? [
      'Mission duration is achievable with current orbit parameters',
      `Monitor orbital decay - expect reentry in approximately ${Math.round(simulatedLifetimeYears * 365)} days`
    ] : [
      'WARNING: Mission duration may exceed estimated lifetime',
      'Consider higher orbit or more fuel for station-keeping'
    ]
  };
};

const getOrbitalShellRecommendations = async (shell) => {
  const shellConfig = ORBITAL_SHELLS[shell.toLowerCase()];
  
  if (!shellConfig) {
    return {
      error: 'Invalid orbital shell. Valid options: vleo, leo, meo, geo',
      validShells: Object.keys(ORBITAL_SHELLS)
    };
  }

  const midAltitude = (shellConfig.min + shellConfig.max) / 2;
  
  const [debrisDensity, inclinationRisk] = await Promise.all([
    getDebrisDensityAtAltitude(midAltitude),
    getInclinationDebrisRisk(65)
  ]);

  return {
    shell: shell.toLowerCase(),
    name: shellConfig.name,
    altitudeRange: { min: shellConfig.min, max: shellConfig.max },
    midAltitude,
    debrisRisk: shellConfig.debrisRisk,
    currentDebrisDensity: debrisDensity,
    bestInclinations: shell === 'leo' ? [65, 75, 85, 98] : 
                       shell === 'meo' ? [45, 55, 65] : 
                       shell === 'geo' ? [0, 10, 20] : [65],
    notes: shell === 'leo' ? 'Recommended for Earth observation, ISS operations' :
           shell === 'meo' ? 'Recommended for navigation, communication' :
           shell === 'geo' ? 'Best for communications, weather monitoring' :
           'Best for very low altitude missions with quick reentry'
  };
};

const compareMissionProfiles = async (profiles) => {
  const results = await Promise.all(
    profiles.map(async (profile, index) => {
      const risk = await analyzeMissionRisk({
        altitude: profile.altitude,
        inclination: profile.inclination,
        missionDuration: profile.missionDuration || 365
      });
      
      return {
        profileId: index + 1,
        name: profile.name || `Profile ${index + 1}`,
        parameters: { altitude: profile.altitude, inclination: profile.inclination },
        analysis: risk
      };
    })
  );

  results.sort((a, b) => 
    b.analysis.lifetimePrediction.marginOfSafety - 
    a.analysis.lifetimePrediction.marginOfSafety
  );

  return {
    comparison: results,
    winner: results[0].name,
    ranking: results.map((r, i) => ({ rank: i + 1, name: r.name, score: r.analysis.lifetimePrediction.marginOfSafety }))
  };
};

module.exports = {
  calculateOptimalOrbit,
  findLowRiskOrbitOptions,
  analyzeMissionRisk,
  getOrbitalShellRecommendations,
  compareMissionProfiles,
  estimateMissionLifetime,
  ORBITAL_SHELLS,
  MISSION_TYPES
};
