/**
 * Maneuver Optimization Service
 * Provides Delta-V calculations and best option suggestions for orbital maneuvers
 * Implements multiple maneuver strategies and automated best option selection
 */

const Satellite = require('../models/Satellite');

// Physical constants
const MU_EARTH = 398600.4418; // Standard gravitational parameter (km³/s²)
const R_EARTH = 6371; // Earth radius (km)

// Performance optimization constants
const MAX_SCENARIOS = 8;
const ALTITUDE_BANDS = {
  LEO: { min: 200, max: 2000, optimal: 400 },
  MEO: { min: 2000, max: 20000, optimal: 20200 },
  GEO: { min: 35786, max: 35786, optimal: 35786 }
};

/**
 * Calculate orbital velocity at a given altitude
 * v = sqrt(mu / r) where r = R_earth + altitude
 */
const calculateOrbitalVelocity = (altitudeKm) => {
  const r = R_EARTH + altitudeKm;
  return Math.sqrt(MU_EARTH / r);
};

/**
 * Calculate orbital period in minutes
 * T = 2*pi*sqrt(a³/mu) where a is semi-major axis
 */
const calculateOrbitalPeriod = (altitudeKm) => {
  const a = R_EARTH + altitudeKm;
  return 2 * Math.PI * Math.sqrt(Math.pow(a, 3) / MU_EARTH) / 60;
};

/**
 * Calculate Delta-V for altitude change ( Hohmann transfer)
 * Delta-V1 = sqrt(mu/r1) * (sqrt(2*r2/(r1+r2)) - 1)
 * Delta-V2 = sqrt(mu/r2) * (1 - sqrt(2*r1/(r1+r2)))
 */
const calculateHohmannTransferDeltaV = (r1, r2) => {
  const v1 = Math.sqrt(MU_EARTH / r1);
  const v2 = Math.sqrt(MU_EARTH / r2);
  
  const dv1 = v1 * (Math.sqrt((2 * r2) / (r1 + r2)) - 1);
  const dv2 = v2 * (1 - Math.sqrt((2 * r1) / (r1 + r2)));
  
  return {
    dv1: Math.abs(dv1),
    dv2: Math.abs(dv2),
    total: Math.abs(dv1) + Math.abs(dv2)
  };
};

/**
 * Calculate Delta-V for inclination change
 * Delta-V = 2 * v * sin(delta_i / 2)
 * Uses circular orbit approximation
 */
const calculateInclinationChangeDeltaV = (altitudeKm, inclinationChangeDeg) => {
  const velocity = calculateOrbitalVelocity(altitudeKm);
  const deltaI = inclinationChangeDeg * (Math.PI / 180); // Convert to radians
  
  return 2 * velocity * Math.abs(Math.sin(deltaI / 2));
};

/**
 * Calculate combined altitude + inclination change Delta-V
 * Uses approximation: total ≈ sqrt(dv_alt² + dv_inc²)
 */
const calculateCombinedManeuverDeltaV = (currentAlt, newAlt, currentInc, newInc) => {
  const r1 = R_EARTH + currentAlt;
  const r2 = R_EARTH + newAlt;
  
  const hohmannDV = calculateHohmannTransferDeltaV(r1, r2);
  const incDV = calculateInclinationChangeDeltaV(newAlt, Math.abs(newInc - currentInc));
  
  // Combined using vector addition approximation
  const totalDV = Math.sqrt(Math.pow(hohmannDV.total, 2) + Math.pow(incDV, 2));
  
  return {
    altitudeDV: hohmannDV.total,
    inclinationDV: incDV,
    totalDV,
    dv1: hohmannDV.dv1,
    dv2: hohmannDV.dv2
  };
};

/**
 * Estimate fuel mass required (simplified Tsiolkovsky rocket equation)
 * m_fuel = m_initial * (1 - e^(-deltaV / (Isp * g0)))
 * Using typical Isp = 3000 m/s for electric propulsion
 */
const estimateFuelMass = (deltaV, initialMass = 1000) => {
  const Isp = 3000; // Specific impulse (m/s) - electric propulsion
  const g0 = 9.81;  // Standard gravity (m/s²)
  
  const massRatio = Math.exp(-(deltaV * 1000) / (Isp * g0)); // Convert km/s to m/s
  const fuelMass = initialMass * (1 - massRatio);
  
  return {
    fuelMassKg: fuelMass,
    massRatio: massRatio,
    deltaV_ms: deltaV * 1000
  };
};

/**
 * Generate multiple maneuver scenarios
 */
const generateManeuverScenarios = (satellite, currentRisk) => {
  const currentAlt = satellite.orbitalAltitude || 400;
  const currentInc = satellite.inclination || 0;
  const scenarios = [];
  
  // Scenario 1: Small altitude raise (least Delta-V)
  scenarios.push({
    id: 'alt-raise-small',
    name: 'Small Altitude Raise',
    description: 'Raise orbit by 50km to reduce congestion',
    newAltitude: currentAlt + 50,
    newInclination: currentInc,
    priority: 'low-cost'
  });
  
  // Scenario 2: Large altitude raise
  scenarios.push({
    id: 'alt-raise-large',
    name: 'Large Altitude Raise',
    description: 'Raise orbit by 200km for significant risk reduction',
    newAltitude: currentAlt + 200,
    newInclination: currentInc,
    priority: 'balanced'
  });
  
  // Scenario 3: Inclination adjustment
  if (currentInc < 90) {
    scenarios.push({
      id: 'inc-adjust',
      name: 'Inclination Change',
      description: 'Adjust inclination to 10° for different orbital plane',
      newAltitude: currentAlt,
      newInclination: 10,
      priority: 'balanced'
    });
  }
  
  // Scenario 4: Combined altitude raise + inclination
  scenarios.push({
    id: 'combined-1',
    name: 'Combined Maneuver',
    description: 'Raise altitude 100km and adjust inclination',
    newAltitude: currentAlt + 100,
    newInclination: Math.min(currentInc + 5, 90),
    priority: 'effective'
  });
  
  // Scenario 5: Move to LEO-GEO band edge
  const targetAlt = currentAlt < 1000 ? 1200 : currentAlt < 20000 ? 20000 : 35786;
  if (Math.abs(targetAlt - currentAlt) > 50) {
    scenarios.push({
      id: 'band-edge',
      name: 'Band Edge Transit',
      description: `Move to ${targetAlt}km band edge for lower congestion`,
      newAltitude: targetAlt,
      newInclination: currentInc,
      priority: 'effective'
    });
  }
  
  // Scenario 6: Drastic altitude change (escape congestion)
  scenarios.push({
    id: 'drastic-alt',
    name: 'Drastic Altitude Change',
    description: 'Significant altitude change to escape current congestion',
    newAltitude: currentAlt > 1000 ? currentAlt - 500 : currentAlt + 500,
    newInclination: currentInc,
    priority: 'high-risk'
  });
  
  // Scenario 7: Polar orbit option
  if (currentInc < 90) {
    scenarios.push({
      id: 'polar-orbit',
      name: 'Polar Orbit',
      description: 'Move to polar orbit (90°) for complete plane change',
      newAltitude: Math.max(currentAlt, 600),
      newInclination: 90,
      priority: 'high-cost'
    });
  }
  
  // Scenario 8: Sun-synchronous orbit (98°)
  if (currentInc < 95) {
    scenarios.push({
      id: 'sso',
      name: 'Sun-Synchronous Orbit',
      description: 'Move to sun-synchronous orbit at 98° inclination',
      newAltitude: Math.max(currentAlt, 600),
      newInclination: 98,
      priority: 'specialized'
    });
  }
  
  return scenarios.slice(0, MAX_SCENARIOS);
};

/**
 * Score a scenario based on multiple factors
 */
const scoreScenario = (scenario, deltaV, projectedRisk, currentRisk, satelliteCount) => {
  const riskReduction = currentRisk - projectedRisk;
  
  // Normalize Delta-V cost (lower is better)
  const dvScore = Math.max(0, 100 - deltaV.totalDV * 10);
  
  // Risk reduction score (higher is better)
  const riskScore = Math.max(0, riskReduction * 100);
  
  // Fuel efficiency score
  const fuelEst = estimateFuelMass(deltaV.totalDV);
  const fuelScore = Math.max(0, 100 - fuelEst.fuelMassKg / 10);
  
  // Combined weighted score
  const totalScore = (dvScore * 0.3) + (riskScore * 0.5) + (fuelScore * 0.2);
  
  return {
    dvScore,
    riskScore,
    fuelScore,
    totalScore: Math.round(totalScore * 10) / 10
  };
};

/**
 * Determine the best option based on scoring
 */
const determineBestOption = (scenarios) => {
  // Sort by total score descending
  const sorted = [...scenarios].sort((a, b) => b.score.totalScore - a.score.totalScore);
  
  const best = sorted[0];
  const alternatives = sorted.slice(1, 4);
  
  return {
    bestOption: best,
    alternatives,
    recommendation: generateRecommendation(best, sorted)
  };
};

/**
 * Generate human-readable recommendation
 */
const generateRecommendation = (best, allScenarios) => {
  const hasLowCostOption = allScenarios.some(s => s.priority === 'low-cost');
  const hasEffectiveOption = allScenarios.some(s => s.priority === 'effective');
  
  if (best.score.riskScore > 30 && best.score.dvScore > 50) {
    return {
      action: 'RECOMMENDED',
      reason: 'Best balance of risk reduction and Delta-V efficiency',
      confidence: 'HIGH'
    };
  }
  
  if (hasLowCostOption && best.priority !== 'low-cost') {
    return {
      action: 'CONSIDER_LOW_COST',
      reason: 'A lower-cost option exists with moderate risk improvement',
      confidence: 'MEDIUM'
    };
  }
  
  return {
    action: 'CUSTOM',
    reason: 'Custom scenario selected based on specific requirements',
    confidence: 'MEDIUM'
  };
};

/**
 * Main function: analyze all maneuver options for a satellite
 */
const analyzeManeuverOptions = async (noradCatId) => {
  const satellite = await Satellite.findOne({ noradCatId });
  
  if (!satellite) {
    throw new Error('Satellite not found');
  }
  
  const currentAlt = satellite.orbitalAltitude || 400;
  const currentInc = satellite.inclination || 0;
  const currentRisk = satellite.riskScore || 0.5;
  
  // Get nearby satellite count for congestion analysis
  const nearbyCount = await Satellite.countDocuments({
    orbitalAltitude: { $gte: currentAlt - 100, $lte: currentAlt + 100 }
  });
  
  // Generate scenarios
  const scenarios = generateManeuverScenarios(satellite, currentRisk);
  
  // Calculate Delta-V and risk for each scenario
  const analyzedScenarios = scenarios.map(scenario => {
    const deltaV = calculateCombinedManeuverDeltaV(
      currentAlt,
      scenario.newAltitude,
      currentInc,
      scenario.newInclination
    );
    
    // Simplified risk projection (altitude changes affect congestion)
    const altDiff = Math.abs(scenario.newAltitude - currentAlt);
    const riskFactor = altDiff > 0 ? 0.7 : 0.9;
    const projectedRisk = Math.max(0, currentRisk * riskFactor);
    
    // Calculate scores
    const score = scoreScenario(
      scenario,
      deltaV,
      projectedRisk,
      currentRisk,
      nearbyCount
    );
    
    // Fuel estimation
    const fuel = estimateFuelMass(deltaV.totalDV);
    
    return {
      ...scenario,
      deltaV,
      fuel,
      currentRisk,
      projectedRisk,
      riskReduction: currentRisk - projectedRisk,
      score
    };
  });
  
  // Determine best option
  const result = determineBestOption(analyzedScenarios);
  
  return {
    satellite: {
      noradCatId: satellite.noradCatId,
      name: satellite.name,
      currentAltitude: currentAlt,
      currentInclination: currentInc,
      currentRisk
    },
    scenarios: analyzedScenarios.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      priority: s.priority,
      newAltitude: s.newAltitude,
      newInclination: s.newInclination,
      deltaV: {
        total: Math.round(s.deltaV.totalDV * 1000) / 1000,
        altitude: Math.round(s.deltaV.altitudeDV * 1000) / 1000,
        inclination: Math.round(s.deltaV.inclinationDV * 1000) / 1000
      },
      fuel: {
        massKg: Math.round(s.fuel.fuelMassKg * 10) / 10 || 0
      },
      risk: {
        current: s.currentRisk,
        projected: Math.round(s.projectedRisk * 10000) / 10000,
        reduction: Math.round(s.riskReduction * 10000) / 10000
      },
      score: s.score
    })),
    bestOption: {
      ...result.bestOption,
      deltaV: {
        total: Math.round(result.bestOption.deltaV.totalDV * 1000) / 1000,
        altitude: Math.round(result.bestOption.deltaV.altitudeDV * 1000) / 1000,
        inclination: Math.round(result.bestOption.deltaV.inclinationDV * 1000) / 1000
      },
      fuel: {
        massKg: Math.round(result.bestOption.fuel.fuelMassKg * 10) / 10 || 0
      }
    },
    recommendation: result.recommendation
  };
};

/**
 * Quick comparison for multiple scenarios (server-side)
 */
const compareScenarios = (satellite, scenarioConfigs) => {
  const currentAlt = satellite.orbitalAltitude || 400;
  const currentInc = satellite.inclination || 0;
  const currentRisk = satellite.riskScore || 0.5;
  
  return scenarioConfigs.map(config => {
    const deltaV = calculateCombinedManeuverDeltaV(
      currentAlt,
      config.altitude,
      currentInc,
      config.inclination
    );
    
    const altDiff = Math.abs(config.altitude - currentAlt);
    const riskFactor = altDiff > 0 ? 0.7 : 0.9;
    const projectedRisk = Math.max(0, currentRisk * riskFactor);
    
    const fuel = estimateFuelMass(deltaV.totalDV);
    
    // Calculate score for custom scenarios
    const riskReduction = currentRisk - projectedRisk;
    const dvScore = Math.max(0, 100 - deltaV.totalDV * 10);
    const riskScore = Math.max(0, riskReduction * 100);
    const fuelScore = Math.max(0, 100 - fuel.fuelMassKg / 10);
    const totalScore = (dvScore * 0.3) + (riskScore * 0.5) + (fuelScore * 0.2);
    
    return {
      altitude: config.altitude,
      inclination: config.inclination,
      deltaV: Math.round(deltaV.totalDV * 1000) / 1000,
      fuelKg: Math.round(fuel.fuelMassKg * 10) / 10 || 0,
      projectedRisk: Math.round(projectedRisk * 10000) / 10000,
      riskReduction: Math.round((currentRisk - projectedRisk) * 10000) / 10000,
      score: {
        dvScore: Math.round(dvScore * 10) / 10,
        riskScore: Math.round(riskScore * 10) / 10,
        fuelScore: Math.round(fuelScore * 10) / 10,
        totalScore: Math.round(totalScore * 10) / 10
      }
    };
  });
};

module.exports = {
  calculateOrbitalVelocity,
  calculateOrbitalPeriod,
  calculateHohmannTransferDeltaV,
  calculateInclinationChangeDeltaV,
  calculateCombinedManeuverDeltaV,
  estimateFuelMass,
  generateManeuverScenarios,
  analyzeManeuverOptions,
  compareScenarios,
  MU_EARTH,
  R_EARTH,
  ALTITUDE_BANDS
};
