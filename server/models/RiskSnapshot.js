const mongoose = require('mongoose');

const riskSnapshotSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['daily', 'monthly'],
    required: true,
    index: true
  },
  // Summary statistics
  totalObjects: {
    type: Number,
    required: true
  },
  riskDistribution: {
    high: { type: Number, default: 0 },    // risk >= 0.6
    medium: { type: Number, default: 0 },   // 0.3 <= risk < 0.6
    low: { type: Number, default: 0 }       // risk < 0.3
  },
  averageRisk: {
    type: Number,
    default: 0,
    min: 0,
    max: 1
  },
  // Orbital band distribution
  orbitalDistribution: {
    leo: { type: Number, default: 0 },
    meo: { type: Number, default: 0 },
    geo: { type: Number, default: 0 }
  },
  // Risk statistics by band
  riskByAltitude: {
    leo: { avgRisk: Number, maxRisk: Number, highRiskCount: Number },
    meo: { avgRisk: Number, maxRisk: Number, highRiskCount: Number },
    geo: { avgRisk: Number, maxRisk: Number, highRiskCount: Number }
  },
  // Conjunction statistics
  conjunctionStats: {
    total: { type: Number, default: 0 },
    highRisk: { type: Number, default: 0 },
    critical: { type: Number, default: 0 }
  },
  // Top risk objects
  topRisks: [{
    noradCatId: Number,
    name: String,
    riskScore: Number,
    altitude: Number,
    closeApproachCount: Number
  }],
  // Additional metadata
  metadata: {
    satellitesAnalyzed: Number,
    calculationTime: Number,
    dataSources: [String]
  }
});

// Compound index for efficient time-series queries
riskSnapshotSchema.index({ type: 1, timestamp: -1 });
riskSnapshotSchema.index({ timestamp: 1, type: 1 });

// Static method to create a snapshot
riskSnapshotSchema.statics.createSnapshot = async function(type = 'daily') {
  const Satellite = require('./Satellite');
  const Conjunction = require('./Conjunction');
  
  // Get current statistics
  const total = await Satellite.countDocuments();
  const highRisk = await Satellite.countDocuments({ riskScore: { $gte: 0.6 } });
  const mediumRisk = await Satellite.countDocuments({ riskScore: { $gte: 0.3, $lt: 0.6 } });
  const lowRisk = await Satellite.countDocuments({ riskScore: { $lt: 0.3 } });
  
  const leo = await Satellite.countDocuments({ orbitalAltitude: { $lte: 2000 } });
  const meo = await Satellite.countDocuments({ orbitalAltitude: { $gt: 2000, $lte: 35786 } });
  const geo = await Satellite.countDocuments({ orbitalAltitude: { $gt: 35786 } });
  
  // Calculate average risk by altitude band
  const leoStats = await Satellite.aggregate([
    { $match: { orbitalAltitude: { $lte: 2000 } } },
    {
      $group: {
        _id: null,
        avgRisk: { $avg: '$riskScore' },
        maxRisk: { $max: '$riskScore' },
        highRiskCount: { $sum: { $cond: [{ $gte: ['$riskScore', 0.6] }, 1, 0] } }
      }
    }
  ]);
  
  const meoStats = await Satellite.aggregate([
    { $match: { orbitalAltitude: { $gt: 2000, $lte: 35786 } } },
    {
      $group: {
        _id: null,
        avgRisk: { $avg: '$riskScore' },
        maxRisk: { $max: '$riskScore' },
        highRiskCount: { $sum: { $cond: [{ $gte: ['$riskScore', 0.6] }, 1, 0] } }
      }
    }
  ]);
  
  const geoStats = await Satellite.aggregate([
    { $match: { orbitalAltitude: { $gt: 35786 } } },
    {
      $group: {
        _id: null,
        avgRisk: { $avg: '$riskScore' },
        maxRisk: { $max: '$riskScore' },
        highRiskCount: { $sum: { $cond: [{ $gte: ['$riskScore', 0.6] }, 1, 0] } }
      }
    }
  ]);
  
  // Get conjunction statistics (last 24 hours for daily, last 30 days for monthly)
  const timeRange = type === 'daily' ? 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  const since = new Date(Date.now() - timeRange);
  
  const conjunctionStats = await Conjunction.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        highRisk: { $sum: { $cond: [{ $eq: ['$riskLevel', 'high'] }, 1, 0] } },
        critical: { $sum: { $cond: [{ $eq: ['$riskLevel', 'critical'] }, 1, 0] } }
      }
    }
  ]);
  
  // Get top 10 highest risk satellites
  const topRisks = await Satellite.find({})
    .sort({ riskScore: -1 })
    .limit(10)
    .select('noradCatId name riskScore orbitalAltitude')
    .lean();
  
  // Calculate overall average risk
  const avgRisk = total > 0 ? (highRisk * 0.8 + mediumRisk * 0.4 + lowRisk * 0.1) / total : 0;
  
  const snapshot = new this({
    timestamp: new Date(),
    type,
    totalObjects: total,
    riskDistribution: {
      high: highRisk,
      medium: mediumRisk,
      low: lowRisk
    },
    averageRisk: avgRisk,
    orbitalDistribution: {
      leo,
      meo,
      geo
    },
    riskByAltitude: {
      leo: leoStats[0] || { avgRisk: 0, maxRisk: 0, highRiskCount: 0 },
      meo: meoStats[0] || { avgRisk: 0, maxRisk: 0, highRiskCount: 0 },
      geo: geoStats[0] || { avgRisk: 0, maxRisk: 0, highRiskCount: 0 }
    },
    conjunctionStats: conjunctionStats[0] || { total: 0, highRisk: 0, critical: 0 },
    topRisks: topRisks.map(s => ({
      noradCatId: s.noradCatId,
      name: s.name,
      riskScore: s.riskScore,
      altitude: s.orbitalAltitude,
      closeApproachCount: 0
    })),
    metadata: {
      satellitesAnalyzed: total,
      calculationTime: Date.now(),
      dataSources: ['satellites', 'conjunctions']
    }
  });
  
  return snapshot.save();
};

// Method to get historical trends
riskSnapshotSchema.statics.getTrends = async function(options = {}) {
  const {
    type = 'daily',
    days = 30,
    startDate,
    endDate
  } = options;
  
  let query = { type };
  
  if (startDate && endDate) {
    query.timestamp = { $gte: new Date(startDate), $lte: new Date(endDate) };
  } else {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    query.timestamp = { $gte: since };
  }
  
  return this.find(query)
    .sort({ timestamp: 1 })
    .limit(365)
    .lean();
};

// Method to get seasonal analysis
riskSnapshotSchema.statics.getSeasonalAnalysis = async function(years = 2) {
  const since = new Date(Date.now() - years * 365 * 24 * 60 * 60 * 1000);
  
  // Aggregate by month across all years
  const monthlyData = await this.aggregate([
    {
      $match: {
        type: 'daily',
        timestamp: { $gte: since }
      }
    },
    {
      $group: {
        _id: { month: { $month: '$timestamp' } },
        avgRisk: { $avg: '$averageRisk' },
        avgHighRisk: { $avg: '$riskDistribution.high' },
        avgTotal: { $avg: '$totalObjects' },
        totalConjunctions: { $sum: '$conjunctionStats.total' },
        samples: { $sum: 1 }
      }
    },
    { $sort: { '_id.month': 1 } }
  ]);
  
  // Calculate launch window recommendations based on historical patterns
  const launchWindows = monthlyData.map(m => ({
    month: m._id.month,
    riskLevel: m.avgRisk < 0.3 ? 'low' : m.avgRisk < 0.5 ? 'medium' : 'high',
    avgRisk: m.avgRisk,
    avgHighRiskObjects: m.avgHighRisk,
    avgTotalObjects: m.avgTotal,
    totalConjunctions: m.totalConjunctions,
    recommendation: m.avgRisk < 0.35 ? 'optimal' : m.avgRisk < 0.5 ? 'acceptable' : 'avoid'
  }));
  
  return {
    monthlyTrends: monthlyData,
    launchWindows,
    optimalMonths: launchWindows.filter(w => w.recommendation === 'optimal').map(w => w.month),
    avoidMonths: launchWindows.filter(w => w.recommendation === 'avoid').map(w => w.month)
  };
};

module.exports = mongoose.model('RiskSnapshot', riskSnapshotSchema);
