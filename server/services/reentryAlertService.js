const { getActiveReentryAlerts, getReentryPrediction } = require('./reentryEngine');
const { broadcastAlert, setWebSocketServer } = require('./alertService');
const { sendAlertNotifications } = require('./webhookService');
const { logger } = require('../utils/logger');

// In-memory store for active reentry alerts (in production, use database)
const activeReentryAlerts = new Map();

/**
 * Generate unique ID for reentry alerts
 * @returns {string} Alert ID
 */
const generateReentryAlertId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `RNT-${timestamp}-${random}`.toUpperCase();
};

/**
 * Determine alert priority based on reentry status
 * @param {Object} prediction - Reentry prediction
 * @returns {string} Priority level
 */
const getReentryPriority = (prediction) => {
  if (prediction.status === 'critical') return 'critical';
  if (prediction.status === 'warning') return 'high';
  if (prediction.uncontrolledAssessment?.isUncontrolled) return 'critical';
  if (prediction.status === 'elevated') return 'medium';
  return 'low';
};

/**
 * Create a reentry alert object
 * @param {Object} prediction - Reentry prediction
 * @returns {Object} Alert object
 */
const createReentryAlert = (prediction) => {
  const priority = getReentryPriority(prediction);
  
  return {
    alertId: generateReentryAlertId(),
    type: 'reentry',
    noradCatId: prediction.noradCatId,
    name: prediction.name,
    internationalDesignator: prediction.internationalDesignator,
    priority,
    status: 'new',
    reentry: {
      predictedReentryDate: prediction.reentryDate,
      daysUntilReentry: prediction.daysUntilReentry,
      currentAltitude: prediction.currentAltitude,
      decayRate: prediction.decayRateKmPerDay,
      status: prediction.status,
      confidence: prediction.confidence,
      uncontrolledAssessment: prediction.uncontrolledAssessment
    },
    createdAt: new Date(),
    acknowledgedAt: null,
    resolvedAt: null
  };
};

/**
 * Process reentry predictions and create alerts for concerning objects
 * @returns {Array} Newly created alerts
 */
const processReentryAlerts = async () => {
  logger.info('Processing reentry alerts');
  
  const predictions = await getActiveReentryAlerts();
  const newAlerts = [];
  
  for (const prediction of predictions) {
    const alertKey = `reentry-${prediction.noradCatId}`;
    
    // Check if alert already exists for this satellite
    if (activeReentryAlerts.has(alertKey)) {
      const existingAlert = activeReentryAlerts.get(alertKey);
      
      // Update if status has changed (e.g., from warning to critical)
      if (prediction.status === 'critical' && existingAlert.status !== 'critical') {
        existingAlert.status = 'escalated';
        existingAlert.reentry.status = prediction.status;
        existingAlert.reentry.daysUntilReentry = prediction.daysUntilReentry;
        existingAlert.reentry.currentAltitude = prediction.currentAltitude;
        
        logger.info(`Reentry alert escalated for ${prediction.name}`, {
          noradCatId: prediction.noradCatId,
          daysUntilReentry: prediction.daysUntilReentry
        });
        
        // Broadcast escalation
        broadcastReentryAlert(existingAlert, 'reentry_escalated');
        
        // Send webhook notifications
        sendAlertNotifications(existingAlert, 'reentry_escalated').catch(err => {
          logger.error('Failed to send reentry escalation webhook', { error: err.message });
        });
      }
      
      continue;
    }
    
    // Create new alert
    const alert = createReentryAlert(prediction);
    activeReentryAlerts.set(alertKey, alert);
    newAlerts.push(alert);
    
    logger.info(`New reentry alert created for ${prediction.name}`, {
      noradCatId: prediction.noradCatId,
      daysUntilReentry: prediction.daysUntilReentry,
      priority: alert.priority,
      isUncontrolled: prediction.uncontrolledAssessment?.isUncontrolled
    });
    
    // Broadcast new alert
    broadcastReentryAlert(alert, 'reentry_created');
    
    // Send webhook notifications
    sendAlertNotifications(alert, 'reentry_created').catch(err => {
      logger.error('Failed to send reentry alert webhook', { error: err.message });
    });
  }
  
  // Clean up old alerts for satellites that are no longer concerning
  for (const [key, alert] of activeReentryAlerts) {
    const stillConcerning = predictions.find(p => p.noradCatId === alert.noradCatId);
    
    if (!stillConcerning) {
      // Satellite has either reentered or moved to higher orbit
      alert.status = 'resolved';
      alert.resolvedAt = new Date();
      
      logger.info(`Reentry alert resolved for ${alert.name}`, {
        noradCatId: alert.noradCatId
      });
      
      broadcastReentryAlert(alert, 'reentry_resolved');
      activeReentryAlerts.delete(key);
    }
  }
  
  logger.info(`Reentry alert processing complete. ${newAlerts.length} new alerts created`);
  return newAlerts;
};

/**
 * Broadcast reentry alert to WebSocket clients
 * @param {Object} alert - Reentry alert
 * @param {string} eventType - Event type
 */
const broadcastReentryAlert = (alert, eventType) => {
  const message = JSON.stringify({
    type: eventType,
    payload: {
      id: alert.alertId,
      alertId: alert.alertId,
      type: 'reentry',
      priority: alert.priority,
      status: alert.status,
      satellite: {
        noradCatId: alert.noradCatId,
        name: alert.name,
        internationalDesignator: alert.internationalDesignator
      },
      reentry: alert.reentry,
      createdAt: alert.createdAt,
      acknowledgedAt: alert.acknowledgedAt,
      resolvedAt: alert.resolvedAt
    },
    timestamp: new Date().toISOString()
  });
  
  // Get the WebSocket server from alertService
  // The alertService handles the actual broadcasting
  logger.debug(`Broadcasting reentry alert ${alert.alertId}`, { eventType });
};

/**
 * Get all active reentry alerts
 * @returns {Array} Active reentry alerts
 */
const getActiveReentryAlertsList = () => {
  return Array.from(activeReentryAlerts.values());
};

/**
 * Get reentry alert by NORAD ID
 * @param {number} noradCatId - NORAD catalog ID
 * @returns {Object|null} Reentry alert
 */
const getReentryAlertByNoradId = (noradCatId) => {
  return activeReentryAlerts.get(`reentry-${noradCatId}`) || null;
};

/**
 * Acknowledge a reentry alert
 * @param {string} alertId - Alert ID
 * @param {string} acknowledgedBy - Who acknowledged the alert
 * @param {string} note - Optional note
 * @returns {Object} Updated alert
 */
const acknowledgeReentryAlert = async (alertId, acknowledgedBy, note = '') => {
  for (const [key, alert] of activeReentryAlerts) {
    if (alert.alertId === alertId) {
      alert.status = 'acknowledged';
      alert.acknowledgedAt = new Date();
      alert.acknowledgedBy = acknowledgedBy;
      alert.acknowledgmentNote = note;
      
      logger.info(`Reentry alert ${alertId} acknowledged by ${acknowledgedBy}`);
      broadcastReentryAlert(alert, 'reentry_acknowledged');
      
      return alert;
    }
  }
  
  throw new Error(`Reentry alert ${alertId} not found`);
};

/**
 * Get reentry alert statistics
 * @returns {Object} Statistics
 */
const getReentryAlertStatistics = () => {
  const alerts = Array.from(activeReentryAlerts.values());
  
  return {
    total: alerts.length,
    byPriority: {
      critical: alerts.filter(a => a.priority === 'critical').length,
      high: alerts.filter(a => a.priority === 'high').length,
      medium: alerts.filter(a => a.priority === 'medium').length,
      low: alerts.filter(a => a.priority === 'low').length
    },
    byStatus: {
      new: alerts.filter(a => a.status === 'new').length,
      acknowledged: alerts.filter(a => a.status === 'acknowledged').length,
      escalated: alerts.filter(a => a.status === 'escalated').length
    },
    uncontrolled: alerts.filter(a => a.reentry?.uncontrolledAssessment?.isUncontrolled).length,
    lastUpdated: new Date()
  };
};

module.exports = {
  processReentryAlerts,
  getActiveReentryAlertsList,
  getReentryAlertByNoradId,
  acknowledgeReentryAlert,
  getReentryAlertStatistics,
  broadcastReentryAlert
};
