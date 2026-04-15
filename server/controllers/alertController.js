const alertService = require('../services/alertService');
const webhookService = require('../services/webhookService');
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Get all alerts with filtering and pagination
 */
const getAlerts = asyncHandler(async (req, res) => {
  const { status, priority, riskLevel, limit, skip, sortBy, sortOrder } = req.query;
  
  const result = await alertService.getAlerts({
    status,
    priority,
    riskLevel,
    limit: limit ? parseInt(limit) : 50,
    skip: skip ? parseInt(skip) : 0,
    sortBy: sortBy || 'createdAt',
    sortOrder: sortOrder || 'desc'
  });
  
  res.json({
    success: true,
    data: result.alerts,
    pagination: result.pagination
  });
});

/**
 * Get alert by ID
 */
const getAlertById = asyncHandler(async (req, res) => {
  const { alertId } = req.params;
  
  const alert = await alertService.getAlertById(alertId);
  
  if (!alert) {
    return res.status(404).json({
      success: false,
      error: `Alert ${alertId} not found`
    });
  }
  
  res.json({
    success: true,
    data: alert
  });
});

/**
 * Acknowledge an alert
 */
const acknowledgeAlert = asyncHandler(async (req, res) => {
  const { alertId } = req.params;
  const { acknowledgedBy, note } = req.body;
  
  if (!acknowledgedBy) {
    return res.status(400).json({
      success: false,
      error: 'acknowledgedBy is required'
    });
  }
  
  const alert = await alertService.acknowledgeAlert(alertId, acknowledgedBy, note || '', 'api');
  
  res.json({
    success: true,
    data: alert,
    message: `Alert ${alertId} acknowledged`
  });
});

/**
 * Manually escalate an alert
 */
const escalateAlert = asyncHandler(async (req, res) => {
  const { alertId } = req.params;
  const { reason } = req.body;
  
  const alert = await alertService.escalateAlert(alertId, reason || 'Manual escalation');
  
  res.json({
    success: true,
    data: alert,
    message: `Alert ${alertId} escalated to level ${alert.escalation.currentLevel}`
  });
});

/**
 * Resolve an alert
 */
const resolveAlert = asyncHandler(async (req, res) => {
  const { alertId } = req.params;
  const { resolvedBy, note } = req.body;
  
  if (!resolvedBy) {
    return res.status(400).json({
      success: false,
      error: 'resolvedBy is required'
    });
  }
  
  const alert = await alertService.resolveAlert(alertId, resolvedBy, note || '');
  
  res.json({
    success: true,
    data: alert,
    message: `Alert ${alertId} resolved`
  });
});

/**
 * Close an alert
 */
const closeAlert = asyncHandler(async (req, res) => {
  const { alertId } = req.params;
  const { closedBy, note } = req.body;
  
  if (!closedBy) {
    return res.status(400).json({
      success: false,
      error: 'closedBy is required'
    });
  }
  
  const alert = await alertService.closeAlert(alertId, closedBy, note || '');
  
  res.json({
    success: true,
    data: alert,
    message: `Alert ${alertId} closed`
  });
});

/**
 * Get alert statistics
 */
const getAlertStatistics = asyncHandler(async (req, res) => {
  const stats = await alertService.getAlertStatistics();
  
  res.json({
    success: true,
    data: stats
  });
});

/**
 * Get unacknowledged alerts
 */
const getUnacknowledgedAlerts = asyncHandler(async (req, res) => {
  const alerts = await alertService.getUnacknowledgedAlerts();
  
  res.json({
    success: true,
    data: alerts,
    count: alerts.length
  });
});

// Webhook configuration controllers

/**
 * Get all webhook configurations
 */
const getWebhooks = asyncHandler(async (req, res) => {
  const webhooks = await webhookService.getAllWebhooks();
  
  res.json({
    success: true,
    data: webhooks
  });
});

/**
 * Get webhook by ID
 */
const getWebhookById = asyncHandler(async (req, res) => {
  const { webhookId } = req.params;
  
  const webhook = await webhookService.getWebhookById(webhookId);
  
  if (!webhook) {
    return res.status(404).json({
      success: false,
      error: `Webhook ${webhookId} not found`
    });
  }
  
  res.json({
    success: true,
    data: webhook
  });
});

/**
 * Create new webhook configuration
 */
const createWebhook = asyncHandler(async (req, res) => {
  const webhookData = req.body;
  
  // Validate required fields
  if (!webhookData.name || !webhookData.type || !webhookData.url) {
    return res.status(400).json({
      success: false,
      error: 'name, type, and url are required'
    });
  }
  
  const webhook = await webhookService.createWebhook(webhookData);
  
  res.status(201).json({
    success: true,
    data: webhook,
    message: 'Webhook created successfully'
  });
});

/**
 * Update webhook configuration
 */
const updateWebhook = asyncHandler(async (req, res) => {
  const { webhookId } = req.params;
  const webhookData = req.body;
  
  const webhook = await webhookService.updateWebhook(webhookId, webhookData);
  
  if (!webhook) {
    return res.status(404).json({
      success: false,
      error: `Webhook ${webhookId} not found`
    });
  }
  
  res.json({
    success: true,
    data: webhook,
    message: 'Webhook updated successfully'
  });
});

/**
 * Delete webhook configuration
 */
const deleteWebhook = asyncHandler(async (req, res) => {
  const { webhookId } = req.params;
  
  const webhook = await webhookService.deleteWebhook(webhookId);
  
  if (!webhook) {
    return res.status(404).json({
      success: false,
      error: `Webhook ${webhookId} not found`
    });
  }
  
  res.json({
    success: true,
    message: 'Webhook deleted successfully'
  });
});

/**
 * Test webhook connection
 */
const testWebhook = asyncHandler(async (req, res) => {
  const { webhookId } = req.params;
  
  try {
    const result = await webhookService.testWebhook(webhookId);
    
    if (result.success) {
      res.json({
        success: true,
        data: result,
        message: 'Webhook test successful! Notification was sent.'
      });
    } else {
      res.status(400).json({
        success: false,
        data: result,
        message: result.message || 'Webhook test failed'
      });
    }
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = {
  getAlerts,
  getAlertById,
  acknowledgeAlert,
  escalateAlert,
  resolveAlert,
  closeAlert,
  getAlertStatistics,
  getUnacknowledgedAlerts,
  getWebhooks,
  getWebhookById,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook
};
