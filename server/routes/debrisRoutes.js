const express = require('express');
const router = express.Router();
const debrisEngine = require('../services/debrisAnalyticsEngine');

router.post('/capture', async (req, res) => {
  try {
    const { snapshotDate } = req.body;
    const date = snapshotDate ? new Date(snapshotDate) : new Date();
    const result = await debrisEngine.captureDebrisPopulation(date);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/trends', async (req, res) => {
  try {
    const { orbitalShell, startDate, endDate } = req.query;
    if (!orbitalShell) {
      return res.status(400).json({ success: false, error: 'orbitalShell required' });
    }
    const result = await debrisEngine.getDebrisTrends(orbitalShell, startDate, endDate);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/historical', async (req, res) => {
  try {
    const { months } = req.query;
    const result = await debrisEngine.getHistoricalTrends(parseInt(months) || 12);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/density', async (req, res) => {
  try {
    const { orbitalShell, resolution } = req.query;
    if (!orbitalShell) {
      return res.status(400).json({ success: false, error: 'orbitalShell required (LEO, MEO, GEO)' });
    }
    const result = await debrisEngine.getDebrisDensityByAltitude(orbitalShell, parseInt(resolution) || 50);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/growth-rate', async (req, res) => {
  try {
    const { orbitalShell, periodMonths } = req.query;
    if (!orbitalShell) {
      return res.status(400).json({ success: false, error: 'orbitalShell required' });
    }
    const result = await debrisEngine.calculateDebrisGrowthRate(
      orbitalShell,
      parseInt(periodMonths) || 12
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/statistics', async (req, res) => {
  try {
    const result = await debrisEngine.getDebrisStatistics();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/current', async (req, res) => {
  try {
    const { orbitalShell } = req.query;
    const DebrisPopulation = require('../models/DebrisPopulation');
    const query = orbitalShell ? { orbitalShell } : {};
    const result = await DebrisPopulation.find(query)
      .sort({ snapshotDate: -1 })
      .limit(3)
      .lean();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;