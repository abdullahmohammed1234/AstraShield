const KesslerProjection = require('../models/KesslerProjection');
const DebrisPopulation = require('../models/DebrisPopulation');
const Satellite = require('../models/Satellite');

const KESSLER_CONFIG = {
  LEO: { altitudeMin: 200, altitudeMax: 2000, crossSection: 0.1, mass: 500 },
  MEO: { altitudeMin: 2000, altitudeMax: 35786, crossSection: 1, mass: 1000 },
  GEO: { altitudeMin: 35786, altitudeMax: 35786, crossSection: 10, mass: 2000 },
  ATMOSPHERIC_DENSITY_BASE: 1.225,
  SCALE_HEIGHT: 8500,
  SOLAR_FLUX_LOW: 70,
  SOLAR_FLUX_MEDIUM: 150,
  SOLAR_FLUX_HIGH: 250
};

const generateProjectionId = () => {
  return `KESSLER-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
};

const calculateAtmosphericDensity = (altitude, solarActivity) => {
  const baseDensity = KESSLER_CONFIG.ATMOSPHERIC_DENSITY_BASE;
  const scaleHeight = KESSLER_CONFIG.SCALE_HEIGHT;
  const density = baseDensity * Math.exp(-(altitude - 120) / scaleHeight);
  
  let fluxMultiplier = 1;
  if (solarActivity === 'high') fluxMultiplier = 2.5;
  else if (solarActivity === 'medium') fluxMultiplier = 1.5;
  
  return density * fluxMultiplier;
};

const calculateDecayRate = (altitude, ballisticCoef, solarActivity) => {
  const density = calculateAtmosphericDensity(altitude, solarActivity);
  const dragAcceleration = 0.5 * density * Math.pow(3, 2) / ballisticCoef;
  return dragAcceleration * 365 * 24 * 3600;
};

const calculateCollisionProbability = (objectCount, crossSection, shell) => {
  const shellConfig = KESSLER_CONFIG[shell];
  const volume = (Math.pow(shellConfig.altitudeMax, 3) - Math.pow(shellConfig.altitudeMin, 3)) / 3;
  const effectiveCrossSection = crossSection * 1e-6;
  
  return objectCount * objectCount * effectiveCrossSection * 1e-9;
};

const calculateCascadeThreshold = (objectCount, shell) => {
  const thresholds = {
    LEO: 20000,
    MEO: 10000,
    GEO: 5000
  };
  return objectCount / thresholds[shell];
};

const getInitialConditions = async () => {
  const populations = await DebrisPopulation.find()
    .sort({ snapshotDate: -1 })
    .limit(3);
  
  const conditions = { LEO: {}, MEO: {}, GEO: {} };
  
  const shellCounts = { LEO: 0, MEO: 0, GEO: 0 };
  for (const pop of populations) {
    if (pop.orbitalShell && !shellCounts[pop.orbitalShell]) {
      shellCounts[pop.orbitalShell] = pop.totalObjectCount;
    }
  }
  
  const totalSats = await Satellite.countDocuments();
  
  for (const shell of ['LEO', 'MEO', 'GEO']) {
    conditions[shell] = {
      totalObjects: shellCounts[shell] || 5000,
      debrisObjects: Math.floor((shellCounts[shell] || 5000) * 0.6),
      collisionRate: 0.001 * shellCounts[shell] / 10000,
      avgObjectMass: KESSLER_CONFIG[shell].mass
    };
  }
  
  return conditions;
};

const runKesslerProjection = async (params) => {
  const {
    name = `Kessler Projection ${new Date().toISOString().split('T')[0]}`,
    horizon = 10,
    assumptions = {},
    useCurrentConditions = true
  } = params;
  
  const finalAssumptions = {
    annualLaunchRate: assumptions.annualLaunchRate || 100,
    breakupRate: assumptions.breakupRate || 0.001,
    avgFragmentsPerBreakup: assumptions.avgFragmentsPerBreakup || 200,
    solarActivity: assumptions.solarActivity || 'medium',
    activeDebrisRemoval: assumptions.activeDebrisRemoval || false,
    removalRate: assumptions.removalRate || 0,
    cascadeThreshold: assumptions.cascadeThreshold || 0.1
  };
  
  let initialConditions;
  if (useCurrentConditions) {
    initialConditions = await getInitialConditions();
  } else {
    initialConditions = {
      LEO: { totalObjects: 5000, debrisObjects: 3000, collisionRate: 0.0005 },
      MEO: { totalObjects: 200, debrisObjects: 100, collisionRate: 0.0001 },
      GEO: { totalObjects: 500, debrisObjects: 150, collisionRate: 0.0001 }
    };
  }
  
  const projection = new KesslerProjection({
    projectionId: generateProjectionId(),
    name,
    createdAt: new Date(),
    projectionHorizon: horizon,
    baseDate: new Date(),
    assumptions: finalAssumptions,
    initialConditions,
    projections: [],
    status: 'running'
  });
  
  await projection.save();
  
  const results = await calculateProjections(projection, initialConditions, finalAssumptions, horizon);
  
  projection.projections = results.projections;
  projection.cascadeTrigger = results.cascadeTrigger;
  projection.riskAssessment = results.riskAssessment;
  projection.modelParameters = results.modelParameters;
  projection.status = results.cascadeTrigger.triggered ? 'completed' : 'completed';
  
  await projection.save();
  
  return projection;
};

const calculateProjections = (projection, initialConditions, assumptions, horizon) => {
  const results = [];
  const baseDate = new Date();
  let cascadeTriggered = false;
  let triggerYear = null;
  let triggerProbability = 0;
  
  const currentConditions = {
    LEO: { ...initialConditions.LEO },
    MEO: { ...initialConditions.MEO },
    GEO: { ...initialConditions.GEO }
  };
  
  for (let year = 0; year <= horizon; year++) {
    const currentYear = baseDate.getFullYear() + year;
    const currentDate = new Date(baseDate.getTime() + year * 365 * 24 * 60 * 60 * 1000);
    
    const annualCollisions = {};
    const annualReentries = {};
    const annualFragmentations = {};
    
    for (const shell of ['LEO', 'MEO', 'GEO']) {
      const cond = currentConditions[shell];
      const shellConfig = KESSLER_CONFIG[shell];
      
      const collisionProb = calculateCollisionProbability(cond.totalObjects, shellConfig.crossSection, shell);
      const collisions = Math.floor(cond.totalObjects * collisionProb);
      
      let reentries = 0;
      if (shell === 'LEO') {
        reentries = Math.floor(cond.totalObjects * calculateDecayRate(500, 100, assumptions.solarActivity) / 1000);
      }
      
      const newDebris = collisions + (assumptions.breakupRate * cond.totalObjects * assumptions.avgFragmentsPerBreakup);
      const removedDebris = assumptions.activeDebrisRemoval 
        ? Math.floor(cond.totalObjects * assumptions.removalRate) 
        : 0;
      
      const debrisGrowth = assumptions.annualLaunchRate / 3 + newDebris - removedDebris - reentries;
      
      const currentTotal = cond.totalObjects + debrisGrowth;
      
      if (!cascadeTriggered) {
        const cascadeProb = calculateCascadeThreshold(currentTotal, shell);
        if (cascadeProb > assumptions.cascadeThreshold && shell === 'LEO') {
          cascadeTriggered = true;
          triggerYear = currentYear;
          triggerProbability = cascadeProb;
        }
      }
      
      annualCollisions[shell] = collisions;
      annualReentries[shell] = reentries;
      annualFragmentations[shell] = Math.floor(assumptions.breakupRate * cond.totalObjects);
      
      results.push({
        year: currentYear,
        date: currentDate,
        orbitalShell: shell,
        totalObjectCount: Math.max(currentTotal, 0),
        debrisCount: Math.max(cond.debrisObjects + newDebris, 0),
        collisionRate: collisionProb,
        cascadeProbability: calculateCascadeThreshold(currentTotal, shell),
        riskLevel: calculateRiskLevel(currentTotal, shell, cascadeTriggered),
        projectedEvents: {
          collisions,
          fragmentations: annualFragmentations[shell],
          reentries
        }
      });
      
      currentConditions[shell] = {
        totalObjects: Math.max(currentTotal, 0),
        debrisObjects: Math.max(cond.debrisObjects + newDebris - reentries, 0),
        collisionRate: collisionProb
      };
    }
  }
  
  const cascadeTrigger = {
    triggered: cascadeTriggered,
    triggerYear: triggerYear,
    triggerDate: triggerYear ? new Date(baseDate.getFullYear() + triggerYear, 0, 1) : null,
    triggerProbability,
    description: cascadeTriggered 
      ? `Kessler cascade projected to trigger in ${triggerYear} based on debris accumulation in LEO`
      : `No cascade triggered within projection horizon`
  };
  
  const finalLeo = results.filter(r => r.orbitalShell === 'LEO').slice(-1)[0];
  const finalMEO = results.filter(r => r.orbitalShell === 'MEO').slice(-1)[0];
  const finalGEO = results.filter(r => r.orbitalShell === 'GEO').slice(-1)[0];
  
  const overallRisk = calculateOverallRisk(finalLeo, finalMEO, finalGEO);
  
  const riskAssessment = {
    overallRiskScore: Math.min(overallRisk.score, 1),
    trend: calculateTrend(results),
    criticalityLevel: overallRisk.criticality,
    confidence: 0.7
  };
  
  const modelParameters = {
    physicsBased: {
      dragCoefficient: 0.0001,
      ballisticCoefficient: 100,
      solarFluxVariation: assumptions.solarActivity === 'high' ? 0.3 : 0.1,
      atmosphericDensity: calculateAtmosphericDensity(400, assumptions.solarActivity)
    },
    statistical: {
      historicalCollisionRate: 0.001,
      fragmentationRate: assumptions.breakupRate,
      decayRate: 0.02,
      modelFit: 0.85
    }
  };
  
  return {
    projections: results,
    cascadeTrigger,
    riskAssessment,
    modelParameters
  };
};

const calculateRiskLevel = (objectCount, shell, cascadeTriggered) => {
  const levels = {
    LEO: { low: 10000, medium: 20000, high: 35000 },
    MEO: { low: 2000, medium: 5000, high: 8000 },
    GEO: { low: 1000, medium: 2000, high: 4000 }
  };
  
  const thresholds = levels[shell];
  if (cascadeTriggered) return 'critical';
  if (objectCount >= thresholds.high) return 'high';
  if (objectCount >= thresholds.medium) return 'medium';
  return 'low';
};

const calculateOverallRisk = (leo, meo, geo) => {
  const leoProb = Math.min(leo.cascadeProbability || 0, 1);
  const meoProb = Math.min(meo.cascadeProbability || 0, 1);
  const geoProb = Math.min(geo.cascadeProbability || 0, 1);
  
  const weightedRisk = (
    leoProb * 0.5 +
    meoProb * 0.3 +
    geoProb * 0.2
  );
  
  let criticality = 'low';
  if (weightedRisk > 0.8 || leo.riskLevel === 'critical') criticality = 'extreme';
  else if (weightedRisk > 0.5 || leo.riskLevel === 'high') criticality = 'high';
  else if (weightedRisk > 0.3 || meo.riskLevel === 'high') criticality = 'medium';
  
  return { score: Math.min(weightedRisk, 1), criticality };
};

const calculateTrend = (projections) => {
  const leoProjections = projections.filter(p => p.orbitalShell === 'LEO');
  if (leoProjections.length < 2) return 'stable';
  
  const first = leoProjections[0].totalObjectCount;
  const last = leoProjections[leoProjections.length - 1].totalObjectCount;
  const changePercent = ((last - first) / first) * 100;
  
  if (changePercent > 50) return 'critical';
  if (changePercent > 20) return 'increasing';
  if (changePercent < -10) return 'decreasing';
  return 'stable';
};

const getProjections = async (filters = {}) => {
  const query = {};
  
  if (filters.horizon) query.projectionHorizon = filters.horizon;
  if (filters.status) query.status = filters.status;
  if (filters.criticality) {
    query['riskAssessment.criticalityLevel'] = filters.criticality;
  }
  
  return KesslerProjection.find(query)
    .sort({ createdAt: -1 })
    .lean();
};

const getProjectionById = async (projectionId) => {
  return KesslerProjection.findOne({ projectionId }).lean();
};

const getShellProjection = async (projectionId, shell, year = null) => {
  const projection = await KesslerProjection.findOne({ projectionId });
  if (!projection) return null;
  
  let results = projection.projections.filter(p => p.orbitalShell === shell);
  if (year) {
    results = results.filter(p => p.year === year);
  }
  
  return results;
};

const performSensitivityAnalysis = async (projectionId) => {
  const projection = await KesslerProjection.findOne({ projectionId });
  if (!projection) return null;
  
  const analysis = [];
  const baseAssumptions = projection.assumptions;
  
  const variations = [
    { name: 'launchRate', min: -50, max: 50 },
    { name: 'breakupRate', min: -0.0005, max: 0.0005 },
    { name: 'removalRate', min: 0, max: 0.01 },
    { name: 'solarActivity', min: 'low', max: 'high' }
  ];
  
  for (const variant of variations) {
    const testAssumptions = { ...baseAssumptions };
    
    if (variant.name === 'solarActivity') {
      testAssumptions.solarActivity = variant.max;
    } else {
      testAssumptions[variant.name] = baseAssumptions[variant.name] + variant.max;
    }
    
    const result = await runKesslerProjection({
      name: `Sensitivity: ${variant.name}`,
      horizon: projection.projectionHorizon,
      assumptions: testAssumptions,
      useCurrentConditions: false
    });
    
    analysis.push({
      parameter: variant.name,
      baselineValue: baseAssumptions[variant.name],
      variationMin: variant.min,
      variationMax: variant.max,
      impactOnRisk: result.riskAssessment.overallRiskScore - projection.riskAssessment.overallRiskScore
    });
  }
  
  return analysis;
};

module.exports = {
  KESSLER_CONFIG,
  calculateAtmosphericDensity,
  calculateDecayRate,
  calculateCollisionProbability,
  calculateCascadeThreshold,
  getInitialConditions,
  runKesslerProjection,
  getProjections,
  getProjectionById,
  getShellProjection,
  performSensitivityAnalysis
};