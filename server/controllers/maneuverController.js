const Satellite = require('../models/Satellite');
const { analyzeManeuverOptions, compareScenarios } = require('../services/maneuvers');

/**
 * Get all maneuver options for a satellite with Delta-V calculations
 */
const getManeuverOptions = async (req, res) => {
  try {
    const { noradCatId } = req.params;
    
    if (!noradCatId) {
      return res.status(400).json({ success: false, error: 'Satellite ID required' });
    }

    const result = await analyzeManeuverOptions(noradCatId);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error analyzing maneuver options:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Compare custom scenarios for a satellite
 */
const compareManeuvers = async (req, res) => {
  try {
    const { noradCatId, scenarios } = req.body;
    
    if (!noradCatId) {
      return res.status(400).json({ success: false, error: 'Satellite ID required' });
    }

    if (!scenarios || !Array.isArray(scenarios) || scenarios.length === 0) {
      return res.status(400).json({ success: false, error: 'Scenarios array required' });
    }

    const satellite = await Satellite.findOne({ noradCatId });
    
    if (!satellite) {
      return res.status(404).json({ success: false, error: 'Satellite not found' });
    }

    const results = compareScenarios(satellite, scenarios);
    
    // Sort by risk reduction (best first)
    results.sort((a, b) => b.riskReduction - a.riskReduction);
    
    res.json({
      success: true,
      data: {
        satellite: {
          noradCatId: satellite.noradCatId,
          name: satellite.name,
          currentAltitude: satellite.orbitalAltitude,
          currentInclination: satellite.inclination,
          currentRisk: satellite.riskScore
        },
        scenarios: results,
        bestOption: results[0]
      }
    });
  } catch (error) {
    console.error('Error comparing maneuvers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getManeuverOptions,
  compareManeuvers
};
