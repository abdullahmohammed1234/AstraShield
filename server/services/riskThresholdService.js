/**
 * Risk Thresholds Configuration Service
 * Allows users to configure custom risk levels per orbital shell
 */

const { logger } = require('../utils/logger');

const DEFAULT_THRESHOLDS = {
  leo: {
    critical: 1,
    high: 5,
    medium: 10,
    low: 25,
    name: 'Low Earth Orbit'
  },
  meo: {
    critical: 10,
    high: 50,
    medium: 100,
    low: 250,
    name: 'Medium Earth Orbit'
  },
  geo: {
    critical: 50,
    high: 100,
    medium: 200,
    low: 500,
    name: 'Geostationary Orbit'
  },
  vleo: {
    critical: 0.5,
    high: 2,
    medium: 5,
    low: 10,
    name: 'Very Low Earth Orbit'
  }
};

const RISK_CATEGORIES = {
  critical: { color: 'red', priority: 1, actionRequired: true },
  high: { color: 'orange', priority: 2, actionRequired: true },
  medium: { color: 'yellow', priority: 3, actionRequired: false },
  low: { color: 'green', priority: 4, actionRequired: false }
};

let customThresholds = {};
let userPreferences = new Map();

const initializeDefaultThresholds = () => {
  return JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS));
};

const getThresholds = (userId = 'default') => {
  return customThresholds[userId] || initializeDefaultThresholds();
};

const setThreshold = (userId, shell, level, value) => {
  if (!customThresholds[userId]) {
    customThresholds[userId] = initializeDefaultThresholds();
  }
  
  if (customThresholds[userId][shell]) {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      customThresholds[userId][shell][level] = numValue;
      logger.info(`Threshold updated for user ${userId}`, { shell, level, value: numValue });
      return true;
    }
  }
  
  return false;
};

const setAllThresholdsForShell = (userId, shell, thresholds) => {
  if (!customThresholds[userId]) {
    customThresholds[userId] = initializeDefaultThresholds();
  }
  
  if (customThresholds[userId][shell]) {
    for (const [level, value] of Object.entries(thresholds)) {
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue >= 0) {
        customThresholds[userId][shell][level] = numValue;
      }
    }
    return true;
  }
  
  return false;
};

const resetToDefaults = (userId = 'default') => {
  customThresholds[userId] = initializeDefaultThresholds();
  logger.info(`Thresholds reset to defaults for user ${userId}`);
  return customThresholds[userId];
};

const getRiskLevel = (distanceKm, orbitalShell, userId = 'default') => {
  const thresholds = getThresholds(userId);
  const shellThresholds = thresholds[orbitalShell] || thresholds.leo;
  
  if (distanceKm <= shellThresholds.critical) return 'critical';
  if (distanceKm <= shellThresholds.high) return 'high';
  if (distanceKm <= shellThresholds.medium) return 'medium';
  return 'low';
};

const getRiskAssessment = (distanceKm, orbitalShell, userId = 'default') => {
  const thresholds = getThresholds(userId);
  const shellThresholds = thresholds[orbitalShell] || thresholds.leo;
  
  const riskLevel = getRiskLevel(distanceKm, orbitalShell, userId);
  const category = RISK_CATEGORIES[riskLevel];
  
  const distanceToCritical = shellThresholds.critical - distanceKm;
  const distanceToHigh = shellThresholds.high - distanceKm;
  
  return {
    riskLevel,
    category,
    distanceKm,
    orbitalShell,
    thresholds: shellThresholds,
    distanceToNextLevel: {
      critical: Math.max(0, distanceToCritical),
      high: Math.max(0, distanceToHigh),
      medium: Math.max(0, shellThresholds.medium - distanceKm)
    },
    actionRequired: category.actionRequired,
    color: category.color
  };
};

const saveUserPreference = (userId, key, value) => {
  if (!userPreferences.has(userId)) {
    userPreferences.set(userId, new Map());
  }
  
  userPreferences.get(userId).set(key, value);
  logger.debug(`User preference saved`, { userId, key });
};

const getUserPreference = (userId, key, defaultValue = null) => {
  return userPreferences.get(userId)?.get(key) ?? defaultValue;
};

const getAllUserPreferences = (userId) => {
  const prefs = userPreferences.get(userId);
  return prefs ? Object.fromEntries(prefs) : {};
};

const validateThresholds = (thresholds) => {
  const errors = [];
  const validShells = ['leo', 'meo', 'geo', 'vleo'];
  const validLevels = ['critical', 'high', 'medium', 'low'];
  
  for (const [shell, levels] of Object.entries(thresholds)) {
    if (!validShells.includes(shell)) {
      errors.push(`Invalid shell: ${shell}`);
      continue;
    }
    
    for (const [level, value] of Object.entries(levels)) {
      if (validLevels.includes(level)) {
        const num = parseFloat(value);
        if (isNaN(num) || num < 0) {
          errors.push(`Invalid value for ${shell}.${level}: ${value}`);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

const exportThresholds = (userId = 'default') => {
  const thresholds = getThresholds(userId);
  const preferences = getAllUserPreferences(userId);
  
  return {
    thresholds,
    preferences,
    exportedAt: new Date().toISOString(),
    version: '1.0'
  };
};

const importThresholds = (userId, data) => {
  if (!data || !data.thresholds) {
    return { success: false, error: 'Invalid import data' };
  }
  
  const validation = validateThresholds(data.thresholds);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }
  
  customThresholds[userId] = data.thresholds;
  
  if (data.preferences) {
    for (const [key, value] of Object.entries(data.preferences)) {
      saveUserPreference(userId, key, value);
    }
  }
  
  logger.info(`Thresholds imported for user ${userId}`);
  
  return {
    success: true,
    thresholds: customThresholds[userId]
  };
};

const getThresholdStatistics = (userId = 'default') => {
  const thresholds = getThresholds(userId);
  
  const stats = {
    shells: {},
    totalConfigured: 0
  };
  
  for (const [shell, levels] of Object.entries(thresholds)) {
    const config = {
      critical: levels.critical,
      high: levels.high,
      medium: levels.medium,
      low: levels.low,
      name: levels.name
    };
    
    stats.shells[shell] = config;
    stats.totalConfigured += Object.keys(levels).filter(k => typeof levels[k] === 'number').length;
  }
  
  return stats;
};

module.exports = {
  DEFAULT_THRESHOLDS,
  RISK_CATEGORIES,
  getThresholds,
  setThreshold,
  setAllThresholdsForShell,
  resetToDefaults,
  getRiskLevel,
  getRiskAssessment,
  saveUserPreference,
  getUserPreference,
  getAllUserPreferences,
  validateThresholds,
  exportThresholds,
  importThresholds,
  getThresholdStatistics
};
