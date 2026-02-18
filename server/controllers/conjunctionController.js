const {
  runConjunctionDetection,
  getActiveConjunctions,
  getHighRiskConjunctions,
  getConjunctionStatistics
} = require('../services/conjunctionEngine');

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

module.exports = {
  runDetection,
  getAll,
  getHighRisk,
  getStatistics
};
