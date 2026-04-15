const Satellite = require('../models/Satellite');
const { calculateAllRiskScores, getHighRiskSatellites, getRiskStatistics } = require('../services/riskEngine');
const { clusterByAltitude, findHighDensityRegions, calculateClusterPositions } = require('../utils/congestionCluster');
const riskSnapshotService = require('../services/riskSnapshotService');

const calculateRisks = async (req, res) => {
  try {
    const risks = await calculateAllRiskScores();
    res.json({ success: true, count: risks.length, data: risks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getRisks = async (req, res) => {
  try {
    const { minRisk = 0, limit = 100 } = req.query;
    
    const satellites = await Satellite.find({ 
      riskScore: { $gte: parseFloat(minRisk) } 
    })
      .sort({ riskScore: -1 })
      .limit(parseInt(limit));

    res.json({ success: true, count: satellites.length, data: satellites });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getHighRiskAlerts = async (req, res) => {
  try {
    const alerts = await getHighRiskSatellites(0.7, 20);
    res.json({ success: true, count: alerts.length, data: alerts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getStatistics = async (req, res) => {
  try {
    const stats = await getRiskStatistics();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getCongestionData = async (req, res) => {
  try {
    const satellites = await Satellite.find({}).limit(500);
    const clusters = clusterByAltitude(satellites);
    
    res.json({ success: true, data: clusters });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getClusterPositions = async (req, res) => {
  try {
    const satellites = await Satellite.find({}).limit(100);
    const positions = await calculateClusterPositions(satellites);
    
    res.json({ success: true, count: positions.length, data: positions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getHighDensityRegions = async (req, res) => {
  try {
    const satellites = await Satellite.find({}).limit(500);
    const regions = findHighDensityRegions(satellites);
    
    res.json({ success: true, count: regions.length, data: regions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const simulateAdjustment = async (req, res) => {
  try {
    const { noradCatId, newAltitude, newInclination } = req.body;
    
    if (!noradCatId) {
      return res.status(400).json({ success: false, error: 'Satellite ID required' });
    }

    const satellite = await Satellite.findOne({ noradCatId });
    
    if (!satellite) {
      return res.status(404).json({ success: false, error: 'Satellite not found' });
    }

    const oldRisk = satellite.riskScore;
    const oldAltitude = satellite.orbitalAltitude;
    
    const adjustedRisk = oldRisk * (newAltitude ? (oldAltitude / newAltitude) * 0.8 : 0.9);

    res.json({
      success: true,
      data: {
        satellite: satellite.name,
        currentAltitude: oldAltitude,
        newAltitude: newAltitude || oldAltitude,
        currentInclination: satellite.inclination,
        newInclination: newInclination || satellite.inclination,
        currentRisk: oldRisk,
        projectedRisk: adjustedRisk,
        improvement: oldRisk - adjustedRisk,
        riskReduced: adjustedRisk < oldRisk
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Historical risk trends endpoints
const createSnapshot = async (req, res) => {
  try {
    const { type = 'daily' } = req.body;
    const snapshot = await riskSnapshotService.createDailySnapshot();
    res.json({ success: true, data: snapshot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getRiskTrends = async (req, res) => {
  try {
    const { type = 'daily', days = 30, startDate, endDate } = req.query;
    const trends = await riskSnapshotService.getRiskTrends({
      type,
      days: parseInt(days),
      startDate,
      endDate
    });
    res.json({ success: true, count: trends.length, data: trends });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getSeasonalAnalysis = async (req, res) => {
  try {
    const { years = 2 } = req.query;
    const analysis = await riskSnapshotService.getSeasonalAnalysis(parseInt(years));
    res.json({ success: true, data: analysis });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getLatestSnapshot = async (req, res) => {
  try {
    const { type = 'daily' } = req.query;
    const snapshot = await riskSnapshotService.getLatestSnapshot(type);
    res.json({ success: true, data: snapshot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const generateSampleData = async (req, res) => {
  try {
    const { days = 90 } = req.query;
    const result = await riskSnapshotService.generateSampleData(parseInt(days));
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  calculateRisks,
  getRisks,
  getHighRiskAlerts,
  getStatistics,
  getCongestionData,
  getClusterPositions,
  getHighDensityRegions,
  simulateAdjustment,
  createSnapshot,
  getRiskTrends,
  getSeasonalAnalysis,
  getLatestSnapshot,
  generateSampleData
};
