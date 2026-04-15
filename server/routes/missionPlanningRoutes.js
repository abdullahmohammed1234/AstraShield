const express = require('express');
const router = express.Router();
const {
  calculateOptimalOrbit,
  findLowRiskOrbitOptions,
  analyzeMissionRisk,
  getOrbitalShellRecommendations,
  compareMissionProfiles
} = require('../services/missionPlanner');

const { asyncHandler } = require('../middleware/errorHandler');

/**
 * POST /api/mission-planning/optimal-orbit
 * Calculate optimal orbit for mission with minimal debris collision risk
 * Body params:
 *   - missionType: Type of mission (observation, communication, etc.)
 *   - desiredAltitude: Target altitude in km
 *   - desiredInclination: Target inclination in degrees
 *   - priority: 'debris' | 'longevity' | 'both'
 */
router.post('/optimal-orbit', asyncHandler(async (req, res) => {
  const { missionType, desiredAltitude, desiredInclination, priority } = req.body;
  
  const result = await calculateOptimalOrbit({
    missionType: missionType || 'general',
    desiredAltitude: parseFloat(desiredAltitude) || 400,
    desiredInclination: parseFloat(desiredInclination) || 0,
    priority: priority || 'both'
  });
  
  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/mission-planning/low-risk-options
 * Find low-risk orbit options within given constraints
 * Body params:
 *   - minAltitude: Minimum altitude in km
 *   - maxAltitude: Maximum altitude in km
 *   - inclination: Target inclination in degrees
 *   - inclinationTolerance: Tolerance for inclination in degrees
 */
router.post('/low-risk-options', asyncHandler(async (req, res) => {
  const { minAltitude, maxAltitude, inclination, inclinationTolerance } = req.body;
  
  const result = await findLowRiskOrbitOptions({
    minAltitude: parseFloat(minAltitude) || 200,
    maxAltitude: parseFloat(maxAltitude) || 2000,
    inclination: parseFloat(inclination) || 0,
    inclinationTolerance: parseFloat(inclinationTolerance) || 5
  });
  
  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/mission-planning/analyze-risk
 * Analyze mission risk profile
 * Body params:
 *   - altitude: Orbit altitude in km
 *   - inclination: Orbit inclination in degrees
 *   - missionDuration: Expected mission duration in days
 */
router.post('/analyze-risk', asyncHandler(async (req, res) => {
  const { altitude, inclination, missionDuration } = req.body;
  
  const result = await analyzeMissionRisk({
    altitude: parseFloat(altitude) || 400,
    inclination: parseFloat(inclination) || 0,
    missionDuration: parseInt(missionDuration) || 365
  });
  
  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/mission-planning/shell-recommendations/:shell
 * Get recommendations for a specific orbital shell
 * Params:
 *   - shell: Orbital shell (leo, meo, geo, vleo)
 */
router.get('/shell-recommendations/:shell', asyncHandler(async (req, res) => {
  const { shell } = req.params;
  
  const result = await getOrbitalShellRecommendations(shell);
  
  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/mission-planning/compare
 * Compare multiple mission profiles
 * Body params:
 *   - profiles: Array of mission profile objects
 */
router.post('/compare', asyncHandler(async (req, res) => {
  const { profiles } = req.body;
  
  if (!Array.isArray(profiles) || profiles.length < 2) {
    return res.status(400).json({
      success: false,
      error: 'At least 2 profiles required for comparison'
    });
  }
  
  const result = await compareMissionProfiles(profiles);
  
  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

module.exports = router;
