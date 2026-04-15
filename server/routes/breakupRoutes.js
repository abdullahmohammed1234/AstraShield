const express = require('express');
const router = express.Router();
const breakupSimulator = require('../services/breakupSimulator');

const validateSimulationParams = (req, res, next) => {
  const { name, eventType, initialAltitude } = req.body;
  
  if (!name) {
    return res.status(400).json({ success: false, error: 'Name required' });
  }
  if (!eventType) {
    return res.status(400).json({ success: false, error: 'eventType required' });
  }
  if (initialAltitude !== undefined && (isNaN(initialAltitude) || initialAltitude < 200 || initialAltitude > 50000)) {
    return res.status(400).json({ success: false, error: 'Invalid altitude (200-50000 km)' });
  }
  
  next();
};

router.post('/simulate', validateSimulationParams, async (req, res) => {
  try {
    const result = await breakupSimulator.simulateBreakupEvent(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/collision', async (req, res) => {
  try {
    const { primaryNoradId, secondaryNoradId, collisionVelocity, missDistance, primaryMass, secondaryMass } = req.body;
    
    if (!primaryNoradId || !secondaryNoradId) {
      return res.status(400).json({ success: false, error: 'Both primaryNoradId and secondaryNoradId required' });
    }
    
    const result = await breakupSimulator.simulateCollisionScenario({
      primaryNoradId,
      secondaryNoradId,
      collisionVelocity: collisionVelocity || 7.5,
      missDistance: missDistance || 0,
      primaryMass: primaryMass || 500,
      secondaryMass: secondaryMass || 200
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/events', async (req, res) => {
  try {
    const { eventType, orbitalShell, status, startDate, endDate } = req.query;
    const filters = { eventType, orbitalShell, status, startDate, endDate };
    const result = await breakupSimulator.getBreakupEvents(filters);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/events/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const result = await breakupSimulator.getBreakupEventById(eventId);
    
    if (!result) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/dispersion/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const result = await breakupSimulator.analyzeCloudDispersion(eventId);
    
    if (!result) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/cascade-probability', async (req, res) => {
  try {
    const { debrisCount, orbitalShell } = req.query;
    
    if (!debrisCount || !orbitalShell) {
      return res.status(400).json({ success: false, error: 'debrisCount and orbitalShell required' });
    }
    
    const probability = breakupSimulator.calculateCascadeProbability(
      parseInt(debrisCount),
      orbitalShell
    );
    
    res.json({ success: true, data: { probability, riskLevel: probability > 0.5 ? 'high' : probability > 0.2 ? 'medium' : 'low' } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;