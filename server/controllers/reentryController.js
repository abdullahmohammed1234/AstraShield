const {
  getReentryPrediction,
  processAllReentryPredictions,
  getActiveReentryAlerts,
  calculateReentryWindow,
  getOrbitalParameters
} = require('../services/reentryEngine');
const Satellite = require('../models/Satellite');

/**
 * Get reentry prediction for a specific satellite
 * GET /api/reentry/:noradCatId
 */
const getReentryBySatellite = async (req, res) => {
  const { noradCatId } = req.params;
  const parsedId = parseInt(noradCatId);
  
  if (isNaN(parsedId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid NORAD catalog ID'
    });
  }
  
  const prediction = await getReentryPrediction(parsedId);
  
  if (prediction.error) {
    return res.status(404).json({
      success: false,
      error: prediction.error
    });
  }
  
  res.json({
    success: true,
    data: prediction
  });
};

/**
 * Get all reentry predictions
 * GET /api/reentry
 */
const getAllReentryPredictions = async (req, res) => {
  const { 
    status, 
    limit = 50, 
    skip = 0,
    sortBy = 'daysUntilReentry',
    uncontrolledOnly = false
  } = req.query;
  
  try {
    const predictions = await processAllReentryPredictions();
    
    let filteredPredictions = predictions;
    
    // Filter by status
    if (status) {
      filteredPredictions = filteredPredictions.filter(p => p.status === status);
    }
    
    // Filter for uncontrolled reentry candidates only
    if (uncontrolledOnly === 'true') {
      filteredPredictions = filteredPredictions.filter(p => 
        p.uncontrolledAssessment?.isUncontrolled
      );
    }
    
    // Sort predictions
    const sortOrder = sortBy === 'daysUntilReentry' ? 1 : -1;
    filteredPredictions.sort((a, b) => {
      const aVal = a[sortBy] ?? Infinity;
      const bVal = b[sortBy] ?? Infinity;
      return (aVal - bVal) * sortOrder;
    });
    
    // Pagination
    const total = filteredPredictions.length;
    const paginatedPredictions = filteredPredictions.slice(
      parseInt(skip),
      parseInt(skip) + parseInt(limit)
    );
    
    res.json({
      success: true,
      data: paginatedPredictions,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get active reentry alerts (critical and warning status)
 * GET /api/reentry/alerts
 */
const getReentryAlerts = async (req, res) => {
  try {
    const alerts = await getActiveReentryAlerts();
    
    res.json({
      success: true,
      data: alerts,
      count: alerts.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get reentry statistics
 * GET /api/reentry/statistics
 */
const getReentryStatistics = async (req, res) => {
  try {
    const predictions = await processAllReentryPredictions();
    
    const stats = {
      totalTracked: predictions.length,
      byStatus: {
        critical: predictions.filter(p => p.status === 'critical').length,
        warning: predictions.filter(p => p.status === 'warning').length,
        elevated: predictions.filter(p => p.status === 'elevated').length,
        normal: predictions.filter(p => p.status === 'normal' || !p.status).length
      },
      uncontrolledReentries: predictions.filter(p => p.uncontrolledAssessment?.isUncontrolled).length,
      averageDaysUntilReentry: predictions.length > 0
        ? (predictions.reduce((sum, p) => sum + (p.daysUntilReentry || 0), 0) / predictions.length).toFixed(2)
        : 0,
      imminentReentries: predictions.filter(p => p.daysUntilReentry <= 7).length,
      lastUpdated: new Date()
    };
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get orbital parameters for a specific satellite
 * GET /api/reentry/orbital/:noradCatId
 */
const getOrbitalParams = async (req, res) => {
  const { noradCatId } = req.params;
  const parsedId = parseInt(noradCatId);
  
  if (isNaN(parsedId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid NORAD catalog ID'
    });
  }
  
  const satellite = await Satellite.findOne({ noradCatId: parsedId });
  
  if (!satellite) {
    return res.status(404).json({
      success: false,
      error: 'Satellite not found'
    });
  }
  
  const tleLine1 = satellite.tleLine1 || (satellite.tle && satellite.tle.line1);
  const tleLine2 = satellite.tleLine2 || (satellite.tle && satellite.tle.line2);
  
  if (!tleLine1 || !tleLine2) {
    return res.status(404).json({
      success: false,
      error: 'No TLE data available for this satellite'
    });
  }
  
  const orbitalParams = getOrbitalParameters(tleLine1, tleLine2);
  
  if (!orbitalParams) {
    return res.status(500).json({
      success: false,
      error: 'Could not calculate orbital parameters'
    });
  }
  
  // Add reentry window information
  const reentryWindow = calculateReentryWindow(orbitalParams);
  
  res.json({
    success: true,
    data: {
      ...orbitalParams,
      reentryWindow
    }
  });
};

module.exports = {
  getReentryBySatellite,
  getAllReentryPredictions,
  getReentryAlerts,
  getReentryStatistics,
  getOrbitalParams
};
