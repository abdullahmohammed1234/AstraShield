/**
 * Launch Window Analyzer Service
 * Provides optimal insertion altitude recommendations, inclination vs. debris density analysis,
 * and launch opportunity scoring
 */

const Satellite = require('../models/Satellite');
const { logger } = require('../utils/logger');

// Constants for orbital mechanics
const EARTH_RADIUS_KM = 6371;
const LEO_MIN_KM = 200;
const LEO_MAX_KM = 2000;
const SSO_ALTITUDE_KM = 600; // Sun-Synchronous Orbit typical altitude
const STATION_KEEPING_ALTITUDE_KM = 400; // ISS altitude
const DEBRIS_DENSITY_ALTITUDE_BANDS = [
  { min: 200, max: 300, name: 'Very Low Earth Orbit (VLEO)', debrisLevel: 'low' },
  { min: 300, max: 400, name: 'Low Earth Orbit (LEO)', debrisLevel: 'moderate' },
  { min: 400, max: 500, name: 'Lower LEO', debrisLevel: 'high' },
  { min: 500, max: 600, name: 'Mid LEO', debrisLevel: 'moderate' },
  { min: 600, max: 800, name: 'Upper LEO', debrisLevel: 'low' },
  { min: 800, max: 1000, name: 'High LEO', debrisLevel: 'low' },
  { min: 1000, max: 2000, name: 'Very High LEO', debrisLevel: 'very_low' }
];

// Inclination bands with typical use cases
const INCLINATION_BANDS = [
  { min: 0, max: 10, name: 'Equatorial', primaryUse: 'Communications, GEO insertion' },
  { min: 10, max: 30, name: 'Low Inclination', primaryUse: 'Communications, ISS resupply' },
  { min: 30, max: 50, name: 'Mid Inclination', primaryUse: 'Earth observation,spy satellites' },
  { min: 50, max: 65, name: 'High Inclination', primaryUse: 'Polar orbit, reconnaissance' },
  { min: 65, max: 75, name: 'Sun-Synchronous', primaryUse: 'Earth observation, climate' },
  { min: 75, max: 90, name: 'Near-Polar', primaryUse: 'Mapping, surveillance' },
  { min: 90, max: 100, name: 'Polar', primaryUse: 'Research, weather' },
  { min: 100, max: 180, name: 'Retrograde', primaryUse: 'Special applications' }
];

/**
 * Get debris density at a specific altitude band
 */
const getDebrisDensityAtAltitude = async (altitudeKm) => {
  try {
    // Get all satellites in the database
    const satellites = await Satellite.find({}).limit(5000).lean();
    
    // Count satellites in similar altitude bands
    const bandSize = 50; // km
    const minAlt = altitudeKm - bandSize;
    const maxAlt = altitudeKm + bandSize;
    
    const satellitesInBand = satellites.filter(sat => {
      const alt = sat.orbitalAltitude || 0;
      return alt >= minAlt && alt <= maxAlt;
    });
    
    // Get count of debris-like objects (non-operational or very small)
    const debrisCount = satellitesInBand.filter(sat => 
      sat.objectType === 'DEBRIS' || 
      (sat.objectType === 'PAYLOAD' && sat.operationalStatus === 'NON-OPERATIONAL') ||
      (sat.rcs && sat.rcs < 0.1) // Small RCS indicates potential debris
    ).length;
    
    // Calculate density (objects per 1000 km² at this altitude)
    const orbitalCircumference = 2 * Math.PI * (EARTH_RADIUS_KM + altitudeKm);
    const orbitalArea = orbitalCircumference * 100; // 100 km wide orbital shell
    const density = (satellitesInBand.length / orbitalArea) * 1000;
    
    return {
      totalObjects: satellitesInBand.length,
      debrisObjects: debrisCount,
      density: density.toFixed(4),
      altitudeKm
    };
  } catch (error) {
    logger.error('Error calculating debris density:', error);
    return {
      totalObjects: 0,
      debrisObjects: 0,
      density: '0.0000',
      altitudeKm,
      error: error.message
    };
  }
};

/**
 * Analyze inclination vs debris density
 */
const analyzeInclinationDebris = async (inclinationDeg) => {
  try {
    const satellites = await Satellite.find({}).limit(5000).lean();
    
    // Filter satellites within ±5 degrees of target inclination
    const inclinationBand = 5;
    const nearbySatellites = satellites.filter(sat => {
      const inc = sat.inclination || 0;
      return Math.abs(inc - inclinationDeg) <= inclinationBand;
    });
    
    // Analyze debris distribution at this inclination
    const debrisAtInc = nearbySatellites.filter(sat => 
      sat.objectType === 'DEBRIS' || 
      (sat.objectType === 'PAYLOAD' && sat.operationalStatus === 'NON-OPERATIONAL')
    );
    
    // Calculate collision risk score (0-100)
    const riskScore = Math.min(100, Math.round(
      (debrisAtInc.length / Math.max(nearbySatellites.length, 1)) * 200
    ));
    
    // Get recommended inclination adjustments to minimize debris
    const betterIncinations = INCLINATION_BANDS.filter(band => {
      const bandDebris = nearbySatellites.filter(sat => {
        const inc = sat.inclination || 0;
        return inc >= band.min && inc < band.max;
      });
      return bandDebris.filter(s => 
        s.objectType === 'DEBRIS' || 
        s.objectType === 'PAYLOAD' && s.operationalStatus === 'NON-OPERATIONAL'
      ).length < debrisAtInc.length;
    }).slice(0, 3);
    
    return {
      targetInclination: inclinationDeg,
      totalObjectsAtInclination: nearbySatellites.length,
      debrisObjectsAtInclination: debrisAtInc.length,
      collisionRiskScore: riskScore,
      riskLevel: riskScore > 70 ? 'high' : riskScore > 40 ? 'moderate' : 'low',
      betterInclinationOptions: betterIncinations,
      recommendation: riskScore > 70 
        ? `Consider adjusting inclination to avoid debris corridor`
        : `Current inclination has acceptable debris density`
    };
  } catch (error) {
    logger.error('Error analyzing inclination debris:', error);
    return {
      targetInclination: inclinationDeg,
      error: error.message
    };
  }
};

/**
 * Calculate optimal insertion altitudes for a given inclination
 */
const calculateOptimalInsertionAltitudes = async (inclinationDeg) => {
  const recommendations = [];
  
  // Analyze each altitude band
  for (const band of DEBRIS_DENSITY_ALTITUDE_BANDS) {
    const midAltitude = (band.min + band.max) / 2;
    const density = await getDebrisDensityAtAltitude(midAltitude);
    
    // Calculate orbital period
    const semiMajorAxis = EARTH_RADIUS_KM + midAltitude;
    const orbitalPeriod = 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / 398600.4418); // GM for Earth
    
    // Calculate debris risk score (0-100)
    const debrisScore = Math.min(100, Math.round(
      (density.debrisObjects / Math.max(density.totalObjects, 1)) * 150 +
      (band.debrisLevel === 'high' ? 20 : band.debrisLevel === 'moderate' ? 10 : 0)
    ));
    
    // Determine if this altitude is suitable for the given inclination
    let suitability = 100 - debrisScore;
    
    // Adjust for inclination-specific considerations
    if (inclinationDeg >= 65 && inclinationDeg <= 75) {
      // Sun-synchronous orbit considerations
      if (midAltitude >= 500 && midAltitude <= 800) {
        suitability += 10; // Good for SSO
      }
    } else if (inclinationDeg < 30) {
      // Low inclination - better for equatorial orbits
      if (midAltitude >= 300 && midAltitude <= 500) {
        suitability += 5;
      }
    }
    
    recommendations.push({
      altitudeBand: band.name,
      minAltitude: band.min,
      maxAltitude: band.max,
      midAltitude: midAltitude,
      orbitalPeriodMinutes: (orbitalPeriod / 60).toFixed(2),
      debrisDensity: density,
      debrisRiskScore: debrisScore,
      suitability: Math.min(100, suitability),
      suitabilityRating: suitability >= 80 ? 'excellent' : 
                         suitability >= 60 ? 'good' : 
                         suitability >= 40 ? 'fair' : 'poor'
    });
  }
  
  // Sort by suitability
  recommendations.sort((a, b) => b.suitability - a.suitability);
  
  return recommendations;
};

/**
 * Calculate launch opportunity score for specific parameters
 */
const calculateLaunchOpportunityScore = async (targetAltitude, targetInclination, launchDate = new Date()) => {
  const scores = {
    overall: 0,
    debrisRisk: 0,
    orbitalMechanics: 0,
    conjunctionRisk: 0,
    weatherWindow: 0
  };
  
  // 1. Debris Risk Score (40% weight)
  const debrisDensity = await getDebrisDensityAtAltitude(targetAltitude);
  const debrisScore = Math.min(100, (debrisDensity.debrisObjects / Math.max(debrisDensity.totalObjects, 1)) * 200);
  scores.debrisRisk = Math.round(100 - debrisScore);
  scores.overall += scores.debrisRisk * 0.4;
  
  // 2. Orbital Mechanics Score (30% weight)
  // Check if altitude is in a favorable band
  const favorableBand = DEBRIS_DENSITY_ALTITUDE_BANDS.find(
    band => targetAltitude >= band.min && targetAltitude <= band.max
  );
  const bandScore = favorableBand 
    ? (favorableBand.debrisLevel === 'low' || favorableBand.debrisLevel === 'very_low' ? 90 : 
       favorableBand.debrisLevel === 'moderate' ? 70 : 50)
    : 50;
  
  // Check inclination appropriateness
  const incBand = INCLINATION_BANDS.find(
    band => targetInclination >= band.min && targetInclination < band.max
  );
  const incScore = incBand ? 80 : 60;
  
  scores.orbitalMechanics = Math.round((bandScore + incScore) / 2);
  scores.overall += scores.orbitalMechanics * 0.3;
  
  // 3. Conjunction Risk Score (20% weight)
  try {
    const satellites = await Satellite.find({
      orbitalAltitude: { $gte: targetAltitude - 50, $lte: targetAltitude + 50 }
    }).limit(1000).lean();
    
    const nearbyCount = satellites.filter(sat => {
      const inc = sat.inclination || 0;
      return Math.abs(inc - targetInclination) <= 5;
    }).length;
    
    // Lower nearby count is better
    scores.conjunctionRisk = Math.max(0, 100 - nearbyCount);
    scores.overall += scores.conjunctionRisk * 0.2;
  } catch (error) {
    scores.conjunctionRisk = 70; // Default moderate score on error
    scores.overall += scores.conjunctionRisk * 0.2;
  }
  
  // 4. Weather/Window Score (10% weight) - Simplified
  // In reality, this would integrate with weather data
  const launchHour = launchDate.getUTCHours();
  // Prefer dawn/dusk windows for certain orbits
  const preferredHours = (launchHour >= 6 && launchHour <= 8) || (launchHour >= 18 && launchHour <= 20);
  scores.weatherWindow = preferredHours ? 90 : 70;
  scores.overall += scores.weatherWindow * 0.1;
  
  // Determine overall rating
  const overallScore = Math.round(scores.overall);
  const rating = overallScore >= 80 ? 'excellent' :
                 overallScore >= 65 ? 'good' :
                 overallScore >= 50 ? 'fair' : 'poor';
  
  // Generate recommendations
  const recommendations = [];
  if (scores.debrisRisk < 60) {
    recommendations.push({
      priority: 'high',
      message: `Consider adjusting altitude - current ${targetAltitude}km has elevated debris density`
    });
  }
  if (scores.conjunctionRisk < 60) {
    recommendations.push({
      priority: 'medium',
      message: 'High conjunction risk detected - consider alternative inclination'
    });
  }
  if (scores.orbitalMechanics < 70) {
    recommendations.push({
      priority: 'medium',
      message: 'Orbital mechanics could be optimized - review altitude/inclination combination'
    });
  }
  
  return {
    targetAltitude,
    targetInclination,
    launchDate: launchDate.toISOString(),
    scores,
    overallScore,
    rating,
    recommendations,
    analysis: {
      debrisDensity,
      altitudeBand: favorableBand?.name || 'Unknown',
      inclinationBand: incBand?.name || 'Unknown'
    }
  };
};

/**
 * Find optimal launch windows within a date range
 */
const findOptimalLaunchWindows = async (startDate, endDate, inclination, altitudeRange = [200, 1200]) => {
  const opportunities = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Check various altitudes within range
  const altitudes = [];
  for (let alt = altitudeRange[0]; alt <= altitudeRange[1]; alt += 50) {
    altitudes.push(alt);
  }
  
  // Generate potential windows
  const current = new Date(start);
  while (current <= end) {
    for (const altitude of altitudes) {
      const opportunity = await calculateLaunchOpportunityScore(altitude, inclination, current);
      
      if (opportunity.overallScore >= 65) {
        opportunities.push({
          ...opportunity,
          windowTime: current.toISOString()
        });
      }
    }
    current.setUTCHours(current.getUTCHours() + 6); // Check every 6 hours
  }
  
  // Sort by overall score and return top opportunities
  opportunities.sort((a, b) => b.overallScore - a.overallScore);
  
  return opportunities.slice(0, 20); // Return top 20 opportunities
};

/**
 * Get comprehensive launch window analysis
 */
const getLaunchWindowAnalysis = async (params) => {
  const { targetAltitude, targetInclination, launchDate } = params;
  
  try {
    // Run all analyses in parallel
    const [altitudeAnalysis, inclinationAnalysis, opportunityScore] = await Promise.all([
      calculateOptimalInsertionAltitudes(targetInclination || 0),
      targetInclination ? analyzeInclinationDebris(targetInclination) : null,
      calculateLaunchOpportunityScore(
        targetAltitude || 400,
        targetInclination || 0,
        launchDate ? new Date(launchDate) : new Date()
      )
    ]);
    
    return {
      success: true,
      timestamp: new Date().toISOString(),
      inputParameters: {
        targetAltitude: targetAltitude || 400,
        targetInclination: targetInclination || 0,
        launchDate: launchDate || new Date().toISOString()
      },
      optimalInsertionAltitudes: altitudeAnalysis.slice(0, 5), // Top 5 recommendations
      inclinationDebrisAnalysis: inclinationAnalysis,
      launchOpportunityScore: opportunityScore,
      availableInclinationBands: INCLINATION_BANDS,
      availableAltitudeBands: DEBRIS_DENSITY_ALTITUDE_BANDS
    };
  } catch (error) {
    logger.error('Error in launch window analysis:', error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

module.exports = {
  getDebrisDensityAtAltitude,
  analyzeInclinationDebris,
  calculateOptimalInsertionAltitudes,
  calculateLaunchOpportunityScore,
  findOptimalLaunchWindows,
  getLaunchWindowAnalysis,
  DEBRIS_DENSITY_ALTITUDE_BANDS,
  INCLINATION_BANDS
};
