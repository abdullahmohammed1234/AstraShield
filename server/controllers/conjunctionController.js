const {
  runConjunctionDetection,
  getActiveConjunctions,
  getHighRiskConjunctions,
  getConjunctionStatistics
} = require('../services/conjunctionEngine');
const collisionProbabilityEngine = require('../services/collisionProbabilityEngine');
const Satellite = require('../models/Satellite');

const runDetection = async (req, res) => {
  try {
    const result = await runConjunctionDetection();
    res.json({
      success: true,
      data: result,
      message: `Found ${result.length} conjunction events`
    });
  } catch (error) {
    console.error('Conjunction detection error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const getAll = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const conjunctions = await getActiveConjunctions(limit);
    res.json({
      success: true,
      data: conjunctions
    });
  } catch (error) {
    console.error('Get conjunctions error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const getHighRisk = async (req, res) => {
  try {
    const minRisk = req.query.level || 'high';
    const conjunctions = await getHighRiskConjunctions(minRisk);
    res.json({
      success: true,
      data: conjunctions
    });
  } catch (error) {
    console.error('Get high risk conjunctions error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const getStatistics = async (req, res) => {
  try {
    const stats = await getConjunctionStatistics();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get conjunction statistics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get detailed collision analysis for a specific conjunction
const getDetailedAnalysis = async (req, res) => {
  try {
    const { satA, satB } = req.params;
    const noradCatIdA = parseInt(satA);
    const noradCatIdB = parseInt(satB);
    
    // Get satellite data
    const satAData = await Satellite.findOne({ noradCatId: noradCatIdA }).lean();
    const satBData = await Satellite.findOne({ noradCatId: noradCatIdB }).lean();
    
    if (!satAData || !satBData) {
      return res.status(404).json({
        success: false,
        error: 'One or both satellites not found'
      });
    }
    
    // Find the most recent conjunction
    const Conjunction = require('../models/Conjunction');
    const conjunction = await Conjunction.findOne({
      $or: [
        { satellite1: noradCatIdA, satellite2: noradCatIdB },
        { satellite1: noradCatIdB, satellite2: noradCatIdA }
      ]
    }).sort({ createdAt: -1 }).lean();
    
    if (!conjunction) {
      return res.status(404).json({
        success: false,
        error: 'No conjunction found between these satellites'
      });
    }
    
    // Run detailed collision probability analysis
    const collisionAnalysis = await collisionProbabilityEngine.analyzeConjunction(
      satAData,
      satBData,
      conjunction.timeOfClosestApproach
    );
    
    res.json({
      success: true,
      data: {
        conjunction: {
          id: conjunction._id,
          satA: noradCatIdA,
          satB: noradCatIdB,
          satAName: satAData.name,
          satBName: satBData.name,
          closestApproachDistance: conjunction.closestApproachDistance,
          timeOfClosestApproach: conjunction.timeOfClosestApproach,
          relativeVelocity: conjunction.relativeVelocity,
          riskLevel: conjunction.riskLevel
        },
        probabilityOfCollision: collisionAnalysis?.probabilityOfCollision || 0,
        probabilityFormatted: collisionAnalysis ? 
          collisionProbabilityEngine.formatProbability(collisionAnalysis.probabilityOfCollision) : '0',
        uncertaintyData: collisionAnalysis?.uncertaintyData || null,
        stateA: collisionAnalysis?.stateA || null,
        stateB: collisionAnalysis?.stateB || null
      }
    });
  } catch (error) {
    console.error('Get detailed analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  runDetection,
  getAll,
  getHighRisk,
  getStatistics,
  getDetailedAnalysis
};
