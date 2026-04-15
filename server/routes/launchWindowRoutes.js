const express = require('express');
const router = express.Router();
const {
  getLaunchWindowAnalysis,
  calculateLaunchOpportunityScore,
  findOptimalLaunchWindows,
  getDebrisDensityAtAltitude,
  analyzeInclinationDebris,
  calculateOptimalInsertionAltitudes
} = require('../services/launchWindowAnalyzer');

// Get comprehensive launch window analysis
router.post('/analyze', async (req, res) => {
  try {
    const { targetAltitude, targetInclination, launchDate } = req.body;
    
    const result = await getLaunchWindowAnalysis({
      targetAltitude: parseFloat(targetAltitude) || 400,
      targetInclination: parseFloat(targetInclination) || 0,
      launchDate
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get launch opportunity score for specific parameters
router.post('/score', async (req, res) => {
  try {
    const { targetAltitude, targetInclination, launchDate } = req.body;
    
    const score = await calculateLaunchOpportunityScore(
      parseFloat(targetAltitude) || 400,
      parseFloat(targetInclination) || 0,
      launchDate ? new Date(launchDate) : new Date()
    );
    
    res.json({
      success: true,
      data: score
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Find optimal launch windows in date range
router.post('/windows', async (req, res) => {
  try {
    const { startDate, endDate, inclination, altitudeRange } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }
    
    const opportunities = await findOptimalLaunchWindows(
      startDate,
      endDate,
      parseFloat(inclination) || 0,
      altitudeRange || [200, 1200]
    );
    
    res.json({
      success: true,
      data: opportunities
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get debris density at specific altitude
router.get('/debris/:altitude', async (req, res) => {
  try {
    const { altitude } = req.params;
    const density = await getDebrisDensityAtAltitude(parseFloat(altitude) || 400);
    
    res.json({
      success: true,
      data: density
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Analyze inclination vs debris
router.get('/inclination/:degrees', async (req, res) => {
  try {
    const { degrees } = req.params;
    const analysis = await analyzeInclinationDebris(parseFloat(degrees) || 0);
    
    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get optimal insertion altitudes
router.get('/altitudes/:inclination', async (req, res) => {
  try {
    const { inclination } = req.params;
    const altitudes = await calculateOptimalInsertionAltitudes(parseFloat(inclination) || 0);
    
    res.json({
      success: true,
      data: altitudes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
