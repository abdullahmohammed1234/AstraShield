const express = require('express');
const router = express.Router();
const kesslerPredictor = require('../services/kesslerPredictor');

const validateProjectionParams = (req, res, next) => {
  const { horizon, assumptions } = req.body;
  
  if (horizon !== undefined && (isNaN(horizon) || horizon < 10 || horizon > 50)) {
    return res.status(400).json({ success: false, error: 'Invalid horizon (10-50 years)' });
  }
  
  if (assumptions) {
    if (assumptions.annualLaunchRate !== undefined && assumptions.annualLaunchRate < 0) {
      return res.status(400).json({ success: false, error: 'annualLaunchRate must be non-negative' });
    }
    if (assumptions.breakupRate !== undefined && (assumptions.breakupRate < 0 || assumptions.breakupRate > 0.1)) {
      return res.status(400).json({ success: false, error: 'breakupRate must be 0-0.1' });
    }
    if (assumptions.removalRate !== undefined && (assumptions.removalRate < 0 || assumptions.removalRate > 0.1)) {
      return res.status(400).json({ success: false, error: 'removalRate must be 0-0.1' });
    }
  }
  
  next();
};

router.post('/project', validateProjectionParams, async (req, res) => {
  try {
    const result = await kesslerPredictor.runKesslerProjection(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/projections', async (req, res) => {
  try {
    const { horizon, status, criticality } = req.query;
    const filters = { horizon, status, criticality };
    const result = await kesslerPredictor.getProjections(filters);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/projections/:projectionId', async (req, res) => {
  try {
    const { projectionId } = req.params;
    const result = await kesslerPredictor.getProjectionById(projectionId);
    
    if (!result) {
      return res.status(404).json({ success: false, error: 'Projection not found' });
    }
    
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/shell/:projectionId/:orbitalShell', async (req, res) => {
  try {
    const { projectionId, orbitalShell } = req.params;
    const { year } = req.query;
    const result = await kesslerPredictor.getShellProjection(
      projectionId,
      orbitalShell,
      year ? parseInt(year) : null
    );
    
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/sensitivity/:projectionId', async (req, res) => {
  try {
    const { projectionId } = req.params;
    const result = await kesslerPredictor.performSensitivityAnalysis(projectionId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/initial-conditions', async (req, res) => {
  try {
    const result = await kesslerPredictor.getInitialConditions();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/risk-analysis', async (req, res) => {
  try {
    const projections = await kesslerPredictor.getProjections({ status: 'completed' });
    
    if (!projections || projections.length === 0) {
      return res.json({ success: true, data: { riskLevel: 'low', projections: [] } });
    }
    
    const latestProjection = projections[0];
    const trend = latestProjection.riskAssessment?.trend || 'stable';
    const criticality = latestProjection.riskAssessment?.criticalityLevel || 'low';
    
    res.json({
      success: true,
      data: {
        riskLevel: criticality,
        trend,
        cascadeTriggered: latestProjection.cascadeTrigger?.triggered || false,
        triggerYear: latestProjection.cascadeTrigger?.triggerYear,
        confidence: latestProjection.riskAssessment?.confidence
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;