const RiskSnapshot = require('../models/RiskSnapshot');
const { logger } = require('../utils/logger');

const CONFIG = {
  DAILY_SNAPSHOT_HOUR: 0,  // Midnight UTC
  MONTHLY_DAY: 1,          // 1st of each month
  RETENTION_DAILY_DAYS: 365,
  RETENTION_MONTHLY_YEARS: 5
};

let dailySnapshotTimer = null;
let monthlySnapshotTimer = null;

/**
 * Create a daily risk snapshot
 */
const createDailySnapshot = async () => {
  try {
    logger.info('Creating daily risk snapshot...');
    const snapshot = await RiskSnapshot.createSnapshot('daily');
    logger.info(`Daily snapshot created: ${snapshot._id}`);
    return snapshot;
  } catch (error) {
    logger.error('Error creating daily snapshot:', error);
    throw error;
  }
};

/**
 * Create a monthly risk snapshot
 */
const createMonthlySnapshot = async () => {
  try {
    logger.info('Creating monthly risk snapshot...');
    const snapshot = await RiskSnapshot.createSnapshot('monthly');
    logger.info(`Monthly snapshot created: ${snapshot._id}`);
    return snapshot;
  } catch (error) {
    logger.error('Error creating monthly snapshot:', error);
    throw error;
  }
};

/**
 * Get historical risk trends
 */
const getRiskTrends = async (options = {}) => {
  const { type = 'daily', days = 30, startDate, endDate } = options;
  return RiskSnapshot.getTrends({ type, days, startDate, endDate });
};

/**
 * Get seasonal analysis with launch window recommendations
 */
const getSeasonalAnalysis = async (years = 2) => {
  return RiskSnapshot.getSeasonalAnalysis(years);
};

/**
 * Get the latest snapshot
 */
const getLatestSnapshot = async (type = 'daily') => {
  return RiskSnapshot.findOne({ type }).sort({ timestamp: -1 }).lean();
};

/**
 * Get snapshots by date range
 */
const getSnapshotsByRange = async (startDate, endDate, type = 'daily') => {
  return RiskSnapshot.find({
    type,
    timestamp: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  }).sort({ timestamp: 1 }).lean();
};

/**
 * Clean up old snapshots based on retention policy
 */
const cleanupOldSnapshots = async () => {
  try {
    const now = new Date();
    
    // Delete daily snapshots older than retention period
    const dailyCutoff = new Date(now - CONFIG.RETENTION_DAILY_DAYS * 24 * 60 * 60 * 1000);
    const dailyResult = await RiskSnapshot.deleteMany({
      type: 'daily',
      timestamp: { $lt: dailyCutoff }
    });
    
    // Delete monthly snapshots older than retention period
    const monthlyCutoff = new Date(now - CONFIG.RETENTION_MONTHLY_YEARS * 365 * 24 * 60 * 60 * 1000);
    const monthlyResult = await RiskSnapshot.deleteMany({
      type: 'monthly',
      timestamp: { $lt: monthlyCutoff }
    });
    
    logger.info(`Cleaned up ${dailyResult.deletedCount} daily and ${monthlyResult.deletedCount} monthly snapshots`);
    
    return {
      deletedDaily: dailyResult.deletedCount,
      deletedMonthly: monthlyResult.deletedCount
    };
  } catch (error) {
    logger.error('Error cleaning up old snapshots:', error);
    throw error;
  }
};

/**
 * Calculate time until next scheduled snapshot
 */
const getTimeUntilNextSnapshot = () => {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setUTCHours(24, 0, 0, 0);
  
  return {
    daily: nextMidnight - now,
    nextDaily: nextMidnight.toISOString()
  };
};

/**
 * Start automatic snapshot scheduling
 */
const startSnapshotScheduler = () => {
  // Schedule daily snapshot at midnight UTC
  const scheduleDaily = () => {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setUTCHours(24, 0, 0, 0);  // Next midnight
    
    const delay = nextRun - now;
    
    dailySnapshotTimer = setTimeout(async () => {
      try {
        await createDailySnapshot();
      } catch (error) {
        logger.error('Scheduled daily snapshot failed:', error);
      }
      scheduleDaily();  // Reschedule for next day
    }, delay);
    
    logger.info(`Daily snapshot scheduled in ${Math.round(delay / (1000 * 60))} minutes`);
  };
  
  // Schedule monthly snapshot on 1st of each month at midnight UTC
  const scheduleMonthly = () => {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setUTCMonth(nextRun.getUTCMonth() + 1, 1);
    nextRun.setUTCHours(0, 0, 0, 0);
    
    const delay = nextRun - now;
    
    monthlySnapshotTimer = setTimeout(async () => {
      try {
        await createMonthlySnapshot();
      } catch (error) {
        logger.error('Scheduled monthly snapshot failed:', error);
      }
      scheduleMonthly();  // Reschedule for next month
    }, delay);
    
    logger.info(`Monthly snapshot scheduled in ${Math.round(delay / (1000 * 60 * 60 * 24))} days`);
  };
  
  // Run cleanup weekly
  const cleanupInterval = setInterval(cleanupOldSnapshots, 7 * 24 * 60 * 60 * 1000);
  
  scheduleDaily();
  scheduleMonthly();
  
  logger.info('Risk snapshot scheduler started');
  
  return {
    stop: () => {
      if (dailySnapshotTimer) clearTimeout(dailySnapshotTimer);
      if (monthlySnapshotTimer) clearTimeout(monthlySnapshotTimer);
      if (cleanupInterval) clearInterval(cleanupInterval);
      logger.info('Risk snapshot scheduler stopped');
    }
  };
};

/**
 * Generate sample historical data for testing/demo purposes
 */
const generateSampleData = async (days = 90) => {
  const snapshots = [];
  const now = new Date();
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000);
    const baseRisk = 0.3 + Math.sin(i / 30 * Math.PI) * 0.1;  // Seasonal variation
    const randomVariation = (Math.random() - 0.5) * 0.1;
    const avgRisk = Math.max(0.1, Math.min(0.8, baseRisk + randomVariation));
    
    // Generate realistic trend
    const trend = (days - i) / days * 0.15;  // Gradual increase over time
    const totalObjects = Math.round(450 + trend * 100 + Math.random() * 20);
    const highRisk = Math.round(totalObjects * (0.1 + randomVariation));
    const mediumRisk = Math.round(totalObjects * (0.25 + Math.random() * 0.1));
    const lowRisk = totalObjects - highRisk - mediumRisk;
    
    const snapshot = {
      timestamp: date,
      type: 'daily',
      totalObjects,
      riskDistribution: { high: highRisk, medium: mediumRisk, low: lowRisk },
      averageRisk: avgRisk,
      orbitalDistribution: {
        leo: Math.round(totalObjects * 0.7),
        meo: Math.round(totalObjects * 0.25),
        geo: Math.round(totalObjects * 0.05)
      },
      riskByAltitude: {
        leo: { avgRisk: avgRisk * 1.2, maxRisk: Math.min(1, avgRisk * 2), highRiskCount: Math.round(highRisk * 0.8) },
        meo: { avgRisk: avgRisk * 0.8, maxRisk: Math.min(1, avgRisk * 1.5), highRiskCount: Math.round(highRisk * 0.15) },
        geo: { avgRisk: avgRisk * 0.5, maxRisk: Math.min(1, avgRisk), highRiskCount: Math.round(highRisk * 0.05) }
      },
      conjunctionStats: {
        total: Math.round(50 + Math.random() * 30),
        highRisk: Math.round(5 + Math.random() * 10),
        critical: Math.round(Math.random() * 3)
      },
      topRisks: [],
      metadata: {
        satellitesAnalyzed: totalObjects,
        calculationTime: 1000 + Math.random() * 2000,
        dataSources: ['satellites', 'conjunctions']
      }
    };
    
    snapshots.push(snapshot);
  }
  
  // Insert all snapshots
  await RiskSnapshot.insertMany(snapshots);
  logger.info(`Generated ${snapshots.length} sample snapshots`);
  
  return { generated: snapshots.length };
};

module.exports = {
  createDailySnapshot,
  createMonthlySnapshot,
  getRiskTrends,
  getSeasonalAnalysis,
  getLatestSnapshot,
  getSnapshotsByRange,
  cleanupOldSnapshots,
  getTimeUntilNextSnapshot,
  startSnapshotScheduler,
  generateSampleData,
  CONFIG
};
