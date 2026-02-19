const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');
const { asyncHandler } = require('../middleware/errorHandler');

// Alert endpoints

/**
 * GET /api/alerts
 * Get all alerts with filtering and pagination
 */
router.get('/', asyncHandler(alertController.getAlerts));

/**
 * GET /api/alerts/statistics
 * Get alert statistics
 */
router.get('/statistics', asyncHandler(alertController.getAlertStatistics));

/**
 * GET /api/alerts/unacknowledged
 * Get unacknowledged critical and high priority alerts
 */
router.get('/unacknowledged', asyncHandler(alertController.getUnacknowledgedAlerts));

// Webhook configuration endpoints - MUST be before /:alertId to avoid route conflict

/**
 * GET /api/alerts/webhooks
 * Get all webhook configurations
 */
router.get('/webhooks', asyncHandler(alertController.getWebhooks));

/**
 * POST /api/alerts/webhooks
 * Create new webhook configuration
 */
router.post('/webhooks', asyncHandler(alertController.createWebhook));

/**
 * GET /api/alerts/webhooks/:webhookId
 * Get webhook by ID
 */
router.get('/webhooks/:webhookId', asyncHandler(alertController.getWebhookById));

/**
 * PUT /api/alerts/webhooks/:webhookId
 * Update webhook configuration
 */
router.put('/webhooks/:webhookId', asyncHandler(alertController.updateWebhook));

/**
 * DELETE /api/alerts/webhooks/:webhookId
 * Delete webhook configuration
 */
router.delete('/webhooks/:webhookId', asyncHandler(alertController.deleteWebhook));

/**
 * POST /api/alerts/webhooks/:webhookId/test
 * Test webhook connection
 */
router.post('/webhooks/:webhookId/test', asyncHandler(alertController.testWebhook));

// Alert by ID endpoints - MUST be after webhook routes

/**
 * GET /api/alerts/:alertId
 * Get alert by ID
 */
router.get('/:alertId', asyncHandler(alertController.getAlertById));

/**
 * POST /api/alerts/:alertId/acknowledge
 * Acknowledge an alert
 */
router.post('/:alertId/acknowledge', asyncHandler(alertController.acknowledgeAlert));

/**
 * POST /api/alerts/:alertId/escalate
 * Manually escalate an alert
 */
router.post('/:alertId/escalate', asyncHandler(alertController.escalateAlert));

/**
 * POST /api/alerts/:alertId/resolve
 * Resolve an alert
 */
router.post('/:alertId/resolve', asyncHandler(alertController.resolveAlert));

/**
 * POST /api/alerts/:alertId/close
 * Close an alert
 */
router.post('/:alertId/close', asyncHandler(alertController.closeAlert));

module.exports = router;
