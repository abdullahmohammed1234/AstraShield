const axios = require('axios');
const WebhookConfig = require('../models/WebhookConfig');
const { logger } = require('../utils/logger');
const { circuitBreaker } = require('../utils/circuitBreaker');
const { retryWithBackoff } = require('../utils/retry');

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_TIMEOUT = 60000;

/**
 * Format alert data for webhook payload
 */
const formatAlertPayload = (alert, eventType = 'alert_created') => {
  return {
    event: eventType,
    timestamp: new Date().toISOString(),
    alert: {
      id: alert.alertId,
      status: alert.status,
      priority: alert.priority,
      riskLevel: alert.conjunction.riskLevel,
      satellites: {
        satA: {
          noradCatId: alert.satellites.satA.noradCatId,
          name: alert.satellites.satA.name
        },
        satB: {
          noradCatId: alert.satellites.satB.noradCatId,
          name: alert.satellites.satB.name
        }
      },
      conjunction: {
        closestApproachDistance: alert.conjunction.closestApproachDistance,
        timeOfClosestApproach: alert.conjunction.timeOfClosestApproach,
        relativeVelocity: alert.conjunction.relativeVelocity
      },
      createdAt: alert.createdAt,
      acknowledgment: alert.acknowledgment,
      escalation: {
        currentLevel: alert.escalation.currentLevel,
        isEscalated: alert.escalation.currentLevel > 0
      }
    }
  };
};

/**
 * Format Slack message
 */
const formatSlackMessage = (alert, eventType) => {
  const payload = formatAlertPayload(alert, eventType);
  const riskEmoji = {
    critical: ':rotating_light:',
    high: ':warning:',
    medium: ':large_blue_circle:',
    low: ':white_circle:'
  };
  
  const statusEmoji = {
    new: ':new:',
    acknowledged: ':ok:',
    escalated: ':exclamation:',
    resolved: ':white_check_mark:',
    closed: ':lock:'
  };
  
  const alertData = payload.alert;
  
  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${riskEmoji[alertData.riskLevel]} ${statusEmoji[alertData.status]} Conjunction Alert: ${alertData.alert.id}`,
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Risk Level:*\n${alertData.riskLevel.toUpperCase()}`
          },
          {
            type: 'mrkdwn',
            text: `*Status:*\n${alertData.status.toUpperCase()}`
          },
          {
            type: 'mrkdwn',
            text: `*Satellite A:*\n${alertData.satellites.satA.name} (${alertData.satellites.satA.noradCatId})`
          },
          {
            type: 'mrkdwn',
            text: `*Satellite B:*\n${alertData.satellites.satB.name} (${alertData.satellites.satB.noradCatId})`
          },
          {
            type: 'mrkdwn',
            text: `*Closest Approach:*\n${alertData.conjunction.closestApproachDistance.toFixed(2)} km`
          },
          {
            type: 'mrkdwn',
            text: `*Time of Closest Approach:*\n${new Date(alertData.conjunction.timeOfClosestApproach).toLocaleString()}`
          },
          {
            type: 'mrkdwn',
            text: `*Relative Velocity:*\n${alertData.conjunction.relativeVelocity.toFixed(2)} km/s`
          },
          {
            type: 'mrkdwn',
            text: `*Escalation Level:*\n${alertData.escalation.currentLevel}`
          }
        ]
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View in Dashboard',
              emoji: true
            },
            url: `${process.env.ALERT_DASHBOARD_URL || 'http://localhost:3000'}/alerts/${alertData.alert.id}`,
            style: 'primary'
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Acknowledge',
              emoji: true
            },
            action_id: `acknowledge_${alertData.alert.id}`,
            style: 'primary'
          }
        ]
      }
    ]
  };
};

/**
 * Format PagerDuty event
 */
const formatPagerDutyEvent = (alert, eventType) => {
  const payload = formatAlertPayload(alert, eventType);
  
  const urgencyMap = {
    critical: 'high',
    high: 'high',
    medium: 'low',
    low: 'low'
  };
  
  return {
    routing_key: alert.config?.serviceId || process.env.PAGERDUTY_SERVICE_ID,
    event_action: eventType === 'alert_resolved' ? 'resolve' : 'trigger',
    dedup_key: alert.alertId,
    payload: {
      summary: `Conjunction Alert: ${alert.satellites.satA.name} and ${alert.satellites.satB.name} - ${alert.conjunction.riskLevel.toUpperCase()} risk`,
      severity: alert.conjunction.riskLevel,
      source: `AstraShield - ${alert.satellites.satA.name}`,
      timestamp: alert.createdAt.toISOString(),
      custom_details: {
        alertId: alert.alertId,
        satA: `${alert.satellites.satA.name} (${alert.satellites.satA.noradCatId})`,
        satB: `${alert.satellites.satB.name} (${alert.satellites.satB.noradCatId})`,
        closestApproachKm: alert.conjunction.closestApproachDistance,
        timeOfClosestApproach: alert.conjunction.timeOfClosestApproach,
        relativeVelocity: alert.conjunction.relativeVelocity,
        status: alert.status,
        priority: alert.priority
      }
    },
    client: 'AstraShield',
    client_url: process.env.ALERT_DASHBOARD_URL || 'http://localhost:3000'
  };
};

/**
 * Format email notification
 */
const formatEmailNotification = (alert, eventType) => {
  const payload = formatAlertPayload(alert, eventType);
  const alertData = payload.alert;
  
  return {
    subject: `[${alertData.riskLevel.toUpperCase()}] Conjunction Alert - ${alertData.satellites.satA.name} & ${alertData.satellites.satB.name}`,
    html: `
      <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: ${getRiskColor(alertData.riskLevel)};">Conjunction Alert</h2>
          
          <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Alert ID</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${alertData.alert.id}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Status</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${alertData.status}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Risk Level</td>
              <td style="padding: 8px; border: 1px solid #ddd; color: ${getRiskColor(alertData.riskLevel)};">${alertData.riskLevel.toUpperCase()}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Satellite A</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${alertData.satellites.satA.name} (${alertData.satellites.satA.noradCatId})</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Satellite B</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${alertData.satellites.satB.name} (${alertData.satellites.satB.noradCatId})</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Closest Approach</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${alertData.conjunction.closestApproachDistance.toFixed(2)} km</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Time of Closest Approach</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${new Date(alertData.conjunction.timeOfClosestApproach).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Relative Velocity</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${alertData.conjunction.relativeVelocity.toFixed(2)} km/s</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Escalation Level</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${alertData.escalation.currentLevel}</td>
            </tr>
          </table>
          
          <p style="margin-top: 20px;">
            <a href="${process.env.ALERT_DASHBOARD_URL || 'http://localhost:3000'}/alerts/${alertData.alert.id}" 
               style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              View in Dashboard
            </a>
          </p>
        </body>
      </html>
    `,
    text: `
Conjunction Alert

Alert ID: ${alertData.alert.id}
Status: ${alertData.status}
Risk Level: ${alertData.riskLevel.toUpperCase()}
Priority: ${alertData.priority}

Satellite A: ${alertData.satellites.satA.name} (${alertData.satellites.satA.noradCatId})
Satellite B: ${alertData.satellites.satB.name} (${alertData.satellites.satB.noradCatId})

Closest Approach: ${alertData.conjunction.closestApproachDistance.toFixed(2)} km
Time of Closest Approach: ${new Date(alertData.conjunction.timeOfClosestApproach).toLocaleString()}
Relative Velocity: ${alertData.conjunction.relativeVelocity.toFixed(2)} km/s
Escalation Level: ${alertData.escalation.currentLevel}

View in Dashboard: ${process.env.ALERT_DASHBOARD_URL || 'http://localhost:3000'}/alerts/${alertData.alert.id}
    `.trim()
  };
};

const getRiskColor = (riskLevel) => {
  const colors = {
    critical: '#dc3545',
    high: '#fd7e14',
    medium: '#ffc107',
    low: '#28a745'
  };
  return colors[riskLevel] || '#6c757d';
};

/**
 * Build axios config for webhook request
 */
const buildRequestConfig = (webhookConfig) => {
  const config = {
    method: webhookConfig.config?.method || 'POST',
    url: webhookConfig.url,
    headers: {
      'Content-Type': webhookConfig.config?.contentType || 'application/json'
    },
    timeout: 10000
  };
  
  // Add authentication
  switch (webhookConfig.auth?.type) {
    case 'basic':
      config.auth = {
        username: webhookConfig.auth.credentials.username,
        password: webhookConfig.auth.credentials.password
      };
      break;
    case 'bearer':
      config.headers['Authorization'] = `Bearer ${webhookConfig.auth.credentials.token}`;
      break;
    case 'apiKey':
      const headerName = webhookConfig.auth.credentials.headerName || 'X-API-Key';
      config.headers[headerName] = webhookConfig.auth.credentials.apiKey;
      break;
    case 'hmac':
      // HMAC signing would be implemented here
      break;
  }
  
  // Add custom headers
  if (webhookConfig.config?.headers) {
    config.headers = { ...config.headers, ...webhookConfig.config.headers };
  }
  
  return config;
};

/**
 * Check if alert matches webhook filters
 */
const matchesFilters = (alert, webhookConfig) => {
  const filters = webhookConfig.filters || {};
  
  if (filters.riskLevels && filters.riskLevels.length > 0) {
    if (!filters.riskLevels.includes(alert.conjunction.riskLevel)) {
      return false;
    }
  }
  
  if (filters.priority && filters.priority.length > 0) {
    if (!filters.priority.includes(alert.priority)) {
      return false;
    }
  }
  
  if (filters.satelliteIds && filters.satelliteIds.length > 0) {
    const satAId = alert.satellites.satA.noradCatId;
    const satBId = alert.satellites.satB.noradCatId;
    if (!filters.satelliteIds.includes(satAId) && !filters.satelliteIds.includes(satBId)) {
      return false;
    }
  }
  
  if (filters.minDistanceKm !== undefined) {
    if (alert.conjunction.closestApproachDistance > filters.minDistanceKm) {
      return false;
    }
  }
  
  return true;
};

/**
 * Send webhook notification with circuit breaker and retry
 */
const sendWebhookNotification = async (webhookConfig, payload, alert) => {
  const webhookId = webhookConfig._id.toString();
  
  // Check circuit breaker
  const circuitState = circuitBreaker.getState(webhookId);
  if (circuitState === 'open') {
    logger.warn(`Circuit breaker open for webhook ${webhookConfig.name}`, { webhookId });
    throw new Error('Circuit breaker open - webhook temporarily unavailable');
  }
  
  const requestConfig = buildRequestConfig(webhookConfig);
  requestConfig.data = payload;
  
  try {
    const response = await retryWithBackoff(
      async () => {
        return axios(requestConfig);
      },
      webhookConfig.retry?.maxAttempts || 3,
      webhookConfig.retry?.backoffMs || 1000
    );
    
    // Record success
    await WebhookConfig.findByIdAndUpdate(webhookConfig._id, {
      $inc: { 'stats.totalSent': 1, 'stats.totalSuccessful': 1 },
      'stats.lastSentAt': new Date(),
      'stats.lastSuccessAt': new Date()
    });
    
    // Close circuit on success
    circuitBreaker.success(webhookId);
    
    logger.info(`Webhook notification sent successfully`, {
      webhookId: webhookConfig._id,
      webhookName: webhookConfig.name,
      type: webhookConfig.type,
      status: response.status
    });
    
    return {
      success: true,
      statusCode: response.status,
      responseBody: response.data
    };
  } catch (error) {
    // Record failure
    await WebhookConfig.findByIdAndUpdate(webhookConfig._id, {
      $inc: { 'stats.totalSent': 1, 'stats.totalFailed': 1 },
      'stats.lastSentAt': new Date(),
      'stats.lastFailureAt': new Date(),
      'stats.lastFailureReason': error.message
    });
    
    // Open circuit on failure
    circuitBreaker.failure(webhookId);
    
    logger.error(`Webhook notification failed`, {
      webhookId: webhookConfig._id,
      webhookName: webhookConfig.name,
      type: webhookConfig.type,
      error: error.message
    });
    
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Send notification to all enabled webhooks for an alert
 */
const sendAlertNotifications = async (alert, eventType = 'alert_created') => {
  logger.info(`Sending notifications for alert ${alert.alertId}`, {
    eventType,
    riskLevel: alert.conjunction.riskLevel
  });
  
  // Get all enabled webhooks
  const webhooks = await WebhookConfig.find({ enabled: true });
  
  const results = {
    slack: [],
    pagerduty: [],
    email: [],
    custom: []
  };
  
  for (const webhook of webhooks) {
    // Check if alert matches filters
    if (!matchesFilters(alert, webhook)) {
      logger.debug(`Alert ${alert.alertId} does not match filters for webhook ${webhook.name}`);
      continue;
    }
    
    let payload;
    let result;
    
    switch (webhook.type) {
      case 'slack':
        payload = formatSlackMessage(alert, eventType);
        result = await sendWebhookNotification(webhook, payload, alert);
        results.slack.push({
          webhookId: webhook._id,
          name: webhook.name,
          ...result
        });
        break;
        
      case 'pagerduty':
        payload = formatPagerDutyEvent(alert, eventType);
        result = await sendWebhookNotification(webhook, payload, alert);
        results.pagerduty.push({
          webhookId: webhook._id,
          name: webhook.name,
          ...result
        });
        break;
        
      case 'email':
        payload = formatEmailNotification(alert, eventType);
        // Email would typically use a separate email service
        // For now, we'll treat it as a custom webhook
        result = await sendWebhookNotification(webhook, payload, alert);
        results.email.push({
          webhookId: webhook._id,
          name: webhook.name,
          ...result
        });
        break;
        
      case 'custom':
        payload = formatAlertPayload(alert, eventType);
        result = await sendWebhookNotification(webhook, payload, alert);
        results.custom.push({
          webhookId: webhook._id,
          name: webhook.name,
          ...result
        });
        break;
    }
  }
  
  // Update alert with notification status
  const notificationUpdate = {
    'notifications.websocket': { sent: true, sentAt: new Date() }
  };
  
  if (results.slack.some(r => r.success)) {
    notificationUpdate['notifications.slack'] = { sent: true, sentAt: new Date() };
  }
  if (results.pagerduty.some(r => r.success)) {
    notificationUpdate['notifications.pagerduty'] = { sent: true, sentAt: new Date() };
  }
  if (results.email.some(r => r.success)) {
    notificationUpdate['notifications.email'] = { sent: true, sentAt: new Date() };
  }
  
  await Alert.findByIdAndUpdate(alert._id, notificationUpdate);
  
  logger.info(`Notification results for alert ${alert.alertId}`, {
    totalWebhooks: webhooks.length,
    successful: [...results.slack, ...results.pagerduty, ...results.email, ...results.custom].filter(r => r.success).length,
    failed: [...results.slack, ...results.pagerduty, ...results.email, ...results.custom].filter(r => !r.success).length
  });
  
  return results;
};

/**
 * Get all webhook configurations
 */
const getAllWebhooks = async () => {
  console.log('Fetching all webhooks...');
  const webhooks = await WebhookConfig.find({}).sort({ createdAt: -1 });
  console.log('Found webhooks:', webhooks.length);
  return webhooks;
};

/**
 * Get webhook by ID
 */
const getWebhookById = async (id) => {
  return WebhookConfig.findById(id);
};

/**
 * Create new webhook configuration
 */
const createWebhook = async (webhookData) => {
  console.log('Creating webhook with data:', webhookData);
  const webhook = new WebhookConfig(webhookData);
  const saved = await webhook.save();
  console.log('Webhook created:', saved._id);
  return saved;
};

/**
 * Update webhook configuration
 */
const updateWebhook = async (id, webhookData) => {
  return WebhookConfig.findByIdAndUpdate(id, webhookData, { new: true });
};

/**
 * Delete webhook configuration
 */
const deleteWebhook = async (id) => {
  return WebhookConfig.findByIdAndDelete(id);
};

/**
 * Test webhook connection
 */
const testWebhook = async (id) => {
  console.log('Testing webhook:', id);
  const webhook = await WebhookConfig.findById(id);
  if (!webhook) {
    throw new Error('Webhook not found');
  }
  
  // Validate URL is provided
  if (!webhook.url) {
    throw new Error('Webhook URL is not configured');
  }
  
  // Send a test payload
  const testPayload = {
    event: 'test',
    timestamp: new Date().toISOString(),
    message: 'This is a test notification from AstraShield'
  };

  try {
    const result = await sendWebhookNotification(webhook, testPayload, { _id: webhook._id });
    if (result.success) {
      return { success: true, message: 'Test notification sent successfully' };
    } else {
      return { success: false, message: result.error || 'Failed to send notification' };
    }
  } catch (error) {
    console.error('Test webhook error:', error.message);
    throw new Error('Failed to send test notification: ' + error.message);
  }
};

// Import Alert model at the end to avoid circular dependency
const Alert = require('../models/Alert');

module.exports = {
  sendAlertNotifications,
  getAllWebhooks,
  getWebhookById,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  formatAlertPayload,
  formatSlackMessage,
  formatPagerDutyEvent,
  formatEmailNotification
};
