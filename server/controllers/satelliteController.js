const Satellite = require('../models/Satellite');
const { propagateSatellite, getOrbitalPositions, calculateOrbitalParameters } = require('../services/orbitEngine');
const { fetchAndStoreTLE } = require('../services/tleFetcher');

const getAllSatellites = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 300;
    const satellites = await Satellite.find({})
      .sort({ orbitalAltitude: 1 })
      .limit(limit);
    
    res.json({ success: true, count: satellites.length, data: satellites });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getSatelliteById = async (req, res) => {
  try {
    const satellite = await Satellite.findOne({ noradCatId: req.params.id });
    
    if (!satellite) {
      return res.status(404).json({ success: false, error: 'Satellite not found' });
    }

    const tleLine1 = satellite.tleLine1 || (satellite.tle && satellite.tle.line1);
    const tleLine2 = satellite.tleLine2 || (satellite.tle && satellite.tle.line2);
    
    const position = propagateSatellite(tleLine1, tleLine2);
    const orbitalParams = calculateOrbitalParameters(tleLine1, tleLine2);

    res.json({ 
      success: true, 
      data: { 
        ...satellite.toObject(),
        currentPosition: position,
        orbitalParameters: orbitalParams
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getSatellitePositions = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 300;
    const satellites = await Satellite.find({}).limit(limit);
    
    const positions = satellites.map(sat => {
      const tleLine1 = sat.tleLine1 || (sat.tle && sat.tle.line1);
      const tleLine2 = sat.tleLine2 || (sat.tle && sat.tle.line2);
      
      const pos = propagateSatellite(tleLine1, tleLine2);
      if (pos) {
        return {
          noradCatId: sat.noradCatId,
          name: sat.name,
          x: pos.x / 1000,
          y: pos.y / 1000,
          z: pos.z / 1000,
          latitude: pos.latitude,
          longitude: pos.longitude,
          altitude: sat.orbitalAltitude || 0,
          riskScore: sat.riskScore || 0
        };
      }
      return null;
    }).filter(p => p !== null);

    res.json({ success: true, count: positions.length, data: positions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getSatelliteOrbit = async (req, res) => {
  try {
    const satellite = await Satellite.findOne({ noradCatId: req.params.id });
    
    if (!satellite) {
      return res.status(404).json({ success: false, error: 'Satellite not found' });
    }

    const tleLine1 = satellite.tleLine1 || (satellite.tle && satellite.tle.line1);
    const tleLine2 = satellite.tleLine2 || (satellite.tle && satellite.tle.line2);
    
    const orbitPath = getOrbitalPositions(tleLine1, tleLine2);

    res.json({ success: true, data: orbitPath });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const searchSatellites = async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    
    if (!q) {
      return res.status(400).json({ success: false, error: 'Search query required' });
    }

    const satellites = await Satellite.find({
      name: { $regex: q, $options: 'i' }
    })
      .sort({ riskScore: -1 })
      .limit(parseInt(limit));

    res.json({ success: true, count: satellites.length, data: satellites });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const refreshTLE = async (req, res) => {
  try {
    const result = await fetchAndStoreTLE();
    res.json({ success: true, message: 'TLE data refreshed', ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getStatistics = async (req, res) => {
  try {
    const total = await Satellite.countDocuments();
    const leo = await Satellite.countDocuments({ orbitalAltitude: { $lte: 2000 } });
    const meo = await Satellite.countDocuments({ orbitalAltitude: { $gt: 2000, $lte: 35786 } });
    const geo = await Satellite.countDocuments({ orbitalAltitude: { $gt: 35786 } });

    const highRisk = await Satellite.countDocuments({ riskScore: { $gte: 0.6 } });
    const mediumRisk = await Satellite.countDocuments({ 
      riskScore: { $gte: 0.3, $lt: 0.6 } 
    });
    const lowRisk = await Satellite.countDocuments({ riskScore: { $lt: 0.3 } });

    res.json({
      success: true,
      data: {
        total,
        byAltitude: { leo, meo, geo },
        byRisk: { high: highRisk, medium: mediumRisk, low: lowRisk }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getAllSatellites,
  getSatelliteById,
  getSatellitePositions,
  getSatelliteOrbit,
  searchSatellites,
  refreshTLE,
  getStatistics
};
