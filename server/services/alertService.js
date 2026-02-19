const Alert = require('../models/Alert');
const Satellite = require('../models/Satellite');
const { logger } = require('../utils/logger');
const { sendAlertNotifications } = require('./webhookService');

// WebSocket manager for broadcasting alerts
let wss = null;

const ESCLATION_INTERVALS = {
  // Level 0: No escalation yet
  // Level 1: First escalation after 5 minutes
  // Level 2: Second escalation after 15 minutes
  // Level 3: Final escalation after 30 minutes
  1: 5 * 60 * 1000,   // 5 minutes
  2: 15 * 60 * 1000,  // 15 minutes
  3: 30 * 60 * 1000   // 30 minutes
};

const PRIORITY_THRESHOLDS = {
  critical: 0,
  high: 10,    // 10 km
  medium: 50,   // 50 km
  low: Infinity
};

/**
 * Set WebSocket server for broadcasting
 */
const setWebSocketServer = (webSocketServer) => {
  wss = webSocketServer;
};

/**
 * Get priority based on risk level and distance
 */
const getPriority = (riskLevel, distanceKm) => {
  if (riskLevel === 'critical') return 'critical';
  if (riskLevel === 'high' && distanceKm < 5) return 'critical';
  if (riskLevel === 'high') return 'high';
  if (riskLevel === 'medium' && distanceKm < 10) return 'high';
  if (riskLevel === 'medium') return 'medium';
  return 'low';
};

/**
 * Broadcast alert to all connected WebSocket clients
 */
const broadcastAlert = (alert, eventType = 'alert_created') => {
  if (!wss) {
    logger.warn('WebSocket server not set, cannot broadcast alert');
    return;
  }
  
  const message = JSON.stringify({
    type: eventType,
    payload: {
      id: alert._id,
      alertId: alert.alertId,
      status: alert.status,
      priority: alert.priority,
      riskLevel: alert.conjunction.riskLevel,
      satellites: alert.satellites,
      conjunction: {
        closestApproachDistance: alert.conjunction.closestApproachDistance,
        timeOfClosestApproach: alert.conjunction.timeOfClosestApproach,
        relativeVelocity: alert.conjunction.relativeVelocity
      },
      createdAt: alert.createdAt,
      acknowledgedAt: alert.acknowledgedAt,
      escalation: {
        currentLevel: alert.escalation.currentLevel
      }
    },
    timestamp: new Date().toISOString()
  });
  
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
  
  logger.debug(`Broadcast alert ${alert.alertId} to ${wss.clients.size} clients`);
};

/**
 * Create a new alert from a conjunction
 */
const createAlertFromConjunction = async (conjunction, satA, satB) => {
  // Check if an alert already exists for this conjunction
  const existingAlert = await Alert.findOne({
    conjunctionId: conjunction._id,
    status: { $in: ['new', 'acknowledged', 'escalated'] }
  });
  
  if (existingAlert) {
    logger.debug(`Alert already exists for conjunction ${conjunction._id}`);
    return existingAlert;
  }
  
  const alertId = await Alert.generateAlertId();
  const priority = getPriority(conjunction.riskLevel, conjunction.closestApproachDistance);
  
  const alert = new Alert({
    alertId,
    conjunctionId: conjunction._id,
    satellites: {
      satA: {
        noradCatId: satA.noradCatId,
        name: satA.name
      },
      satB: {
        noradCatId: satB.noradCatId,
        name: satB.name
      }
    },
    conjunction: {
      closestApproachDistance: conjunction.closestApproachDistance,
      timeOfClosestApproach: conjunction.timeOfClosestApproach,
      relativeVelocity: conjunction.relativeVelocity,
      riskLevel: conjunction.riskLevel
    },
    status: 'new',
    priority,
    escalation: {
      currentLevel: 0,
      maxLevel: 3,
      escalationHistory: []
    },
    metadata: {
      source: 'conjunction-engine',
      version: '1.0'
    }
  });
  
  await alert.save();
  
  logger.info(`Created new alert ${alert.alertId} for conjunction`, {
    alertId: alert.alertId,
    riskLevel: conjunction.riskLevel,
    priority
  });
  
  // Broadcast alert via WebSocket
  broadcastAlert(alert, 'alert_created');
  
  // Send webhook notifications asynchronously
  sendAlertNotifications(alert, 'alert_created').catch(err => {
    logger.error('Failed to send webhook notifications', { error: err.message });
  });
  
  return alert;
};

/**
 * Acknowledge an alert
 */
const acknowledgeAlert = async (alertId, acknowledgedBy, note = '', method = 'api') => {
  const alert = await Alert.findOne({ alertId });
  
  if (!alert) {
    throw new Error(`Alert ${alertId} not found`);
  }
  
  if (alert.status === 'closed' || alert.status === 'resolved') {
    throw new Error(`Alert ${alertId} is already ${alert.status}`);
  }
  
  await alert.acknowledge(acknowledgedBy, note, method);
  
  logger.info(`Alert ${alertId} acknowledged by ${acknowledgedBy}`, {
    method,
    note
  });
  
  // Broadcast acknowledgment
  broadcastAlert(alert, 'alert_acknowledged');
  
  // Send webhook notification
  sendAlertNotifications(alert, 'alert_acknowledged').catch(err => {
    logger.error('Failed to send acknowledgment webhook', { error: err.message });
  });
  
  return alert;
};

/**
 * Escalate an alert
 */
const escalateAlert = async (alertId, reason = 'Automatic escalation') => {
  const alert = await Alert.findOne({ alertId });
  
  if (!alert) {
    throw new Error(`Alert ${alertId} not found`);
  }
  
  if (alert.status === 'closed' || alert.status === 'resolved') {
    logger.debug(`Alert ${alertId} is already ${alert.status}, skipping escalation`);
    return alert;
  }
  
  const previousLevel = alert.escalation.currentLevel;
  await alert.escalate(reason);
  
  logger.info(`Alert ${alertId} escalated from level ${previousLevel} to ${alert.escalation.currentLevel}`, {
    reason
  });
  
  // Broadcast escalation
  broadcastAlert(alert, 'alert_escalated');
  
  // Send webhook notifications for escalation
  sendAlertNotifications(alert, 'alert_escalated').catch(err => {
    logger.error('Failed to send escalation webhook', { error: err.message });
  });
  
  return alert;
};

/**
 * Resolve an alert
 */
const resolveAlert = async (alertId, resolvedBy, note = '') => {
  const alert = await Alert.findOne({ alertId });
  
  if (!alert) {
    throw new Error(`Alert ${alertId} not found`);
  }
  
  await alert.resolve(resolvedBy, note);
  
  logger.info(`Alert ${alertId} resolved by ${resolvedBy}`, {
    note
  });
  
  // Broadcast resolution
  broadcastAlert(alert, 'alert_resolved');
  
  // Send webhook notification
  sendAlertNotifications(alert, 'alert_resolved').catch(err => {
    logger.error('Failed to send resolution webhook', { error: err.message });
  });
  
  return alert;
};

/**
 * Close an alert
 */
const closeAlert = async (alertId, closedBy, note = '') => {
  const alert = await Alert.findOne({ alertId });
  
  if (!alert) {
    throw new Error(`Alert ${alertId} not found`);
  }
  
  await alert.close(closedBy, note);
  
  logger.info(`Alert ${alertId} closed by ${closedBy}`, {
    note
  });
  
  // Broadcast closure
  broadcastAlert(alert, 'alert_closed');
  
  return alert;
};

/**
 * Get alert by ID
 */
const getAlertById = async (alertId) => {
  return Alert.findOne({ alertId });
};

/**
 * Get all alerts with filtering and pagination
 */
const getAlerts = async (options = {}) => {
  const {
    status,
    priority,
    riskLevel,
    limit = 50,
    skip = 0,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = options;
  
  const query = {};
  
  if (status) {
    if (Array.isArray(status)) {
      query.status = { $in: status };
    } else {
      query.status = status;
    }
  }
  
  if (priority) {
    query.priority = priority;
  }
  
  if (riskLevel) {
    query['conjunction.riskLevel'] = riskLevel;
  }
  
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
  
  const alerts = await Alert.find(query)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();
  
  const total = await Alert.countDocuments(query);
  
  return {
    alerts,
    pagination: {
      total,
      limit,
      skip,
      pages: Math.ceil(total / limit)
    }
  };
};

/**
 * Get unacknowledged critical and high priority alerts
 */
const getUnacknowledgedAlerts = async () => {
  return Alert.find({
    status: { $in: ['new', 'escalated'] },
    priority: { $in: ['critical', 'high'] }
  })
    .sort({ createdAt: 1 })
    .lean();
};

/**
 * Run escalation check for all active alerts
 */
const runEscalationCheck = async () => {
  logger.info('Running escalation check for active alerts');
  
  const activeAlerts = await Alert.find({
    status: { $in: ['new', 'acknowledged', 'escalated'] }
  });
  
  const now = Date.now();
  let escalatedCount = 0;
  
  for (const alert of activeAlerts) {
    if (alert.status === 'closed' || alert.status === 'resolved') {
      continue;
    }
    
    const timeSinceCreation = now - alert.createdAt.getTime();
    const currentLevel = alert.escalation.currentLevel;
    
    // Check if it's time for next escalation
    if (currentLevel < alert.escalation.maxLevel) {
      const nextEscalationTime = ESCLATION_INTERVALS[currentLevel + 1];
      
      if (timeSinceCreation >= nextEscalationTime) {
        // Check if alert has been acknowledged
        if (!alert.acknowledgedAt) {
          await alert.escalate('Automatic escalation - unacknowledged alert');
          escalatedCount++;
          
          // Broadcast and send webhooks
          broadcastAlert(alert, 'alert_escalated');
          sendAlertNotifications(alert, 'alert_escalated').catch(err => {
            logger.error('Failed to send escalation webhook', { error: err.message });
          });
        }
      }
    }
  }
  
  logger.info(`Escalation check complete. ${escalatedCount} alerts escalated`);
  return escalatedCount;
};

/**
 * Process new conjunctions and create alerts for high-risk events
 */
const processNewConjunctions = async (conjunctions) => {
  logger.info(`Processing ${conjunctions.length} conjunctions for alerts`);
  
  let alertsCreated = 0;
  
  for (const conjunction of conjunctions) {
    // Only create alerts for high-risk conjunctions
    if (conjunction.riskLevel === 'critical' || conjunction.riskLevel === 'high') {
      try {
        const satA = await Satellite.findOne({ noradCatId: conjunction.satellite1 });
        const satB = await Satellite.findOne({ noradCatId: conjunction.satellite2 });
        
        if (satA && satB) {
          await createAlertFromConjunction(conjunction, satA, satB);
          alertsCreated++;
        }
      } catch (error) {
        logger.error('Failed to create alert from conjunction', {
          conjunctionId: conjunction._id,
          error: error.message
        });
      }
    }
  }
  
  logger.info(`Alert processing complete. ${alertsCreated} alerts created`);
  return alertsCreated;
};

/**
 * Get alert statistics
 */
const getAlertStatistics = async () => {
  const total = await Alert.countDocuments();
  const byStatus = await Alert.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  const byPriority = await Alert.aggregate([
    { $group: { _id: '$priority', count: { $sum: 1 } } }
  ]);
  const byRiskLevel = await Alert.aggregate([
    { $group: { _id: '$conjunction.riskLevel', count: { $sum: 1 } } }
  ]);
  
  // Unacknowledged critical alerts
  const unacknowledgedCritical = await Alert.countDocuments({
    status: { $in: ['new', 'escalated'] },
    priority: { $in: ['critical', 'high'] },
    acknowledgedAt: null
  });
  
  return {
    total,
    byStatus: byStatus.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {}),
    byPriority: byPriority.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {}),
    byRiskLevel: byRiskLevel.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {}),
    unacknowledgedCritical,
    lastUpdated: new Date()
  };
};

module.exports = {
  setWebSocketServer,
  createAlertFromConjunction,
  acknowledgeAlert,
  escalateAlert,
  resolveAlert,
  closeAlert,
  getAlertById,
  getAlerts,
  getUnacknowledgedAlerts,
  runEscalationCheck,
  processNewConjunctions,
  getAlertStatistics,
  broadcastAlert
};
