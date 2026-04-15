const express = require('express');
const router = express.Router();
const reentryController = require('../controllers/reentryController');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * GET /api/reentry
 * Get all reentry predictions with optional filtering
 * Query params:
 *   - status: Filter by status (critical, warning, elevated, normal)
 *   - limit: Number of results (default: 50)
 *   - skip: Number of results to skip (default: 0)
 *   - sortBy: Sort field (default: daysUntilReentry)
 *   - uncontrolledOnly: Filter for uncontrolled reentries only (true/false)
 */
router.get('/', asyncHandler(reentryController.getAllReentryPredictions));

/**
 * GET /api/reentry/statistics
 * Get reentry statistics
 */
router.get('/statistics', asyncHandler(reentryController.getReentryStatistics));

/**
 * GET /api/reentry/alerts
 * Get active reentry alerts (critical and warning status)
 */
router.get('/alerts', asyncHandler(reentryController.getReentryAlerts));

/**
 * GET /api/reentry/orbital/:noradCatId
 * Get orbital parameters for a specific satellite
 */
router.get('/orbital/:noradCatId', asyncHandler(reentryController.getOrbitalParams));

/**
 * GET /api/reentry/:noradCatId
 * Get reentry prediction for a specific satellite
 */
router.get('/:noradCatId', asyncHandler(reentryController.getReentryBySatellite));

module.exports = router;
