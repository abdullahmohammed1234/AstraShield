const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

/**
 * Report Generation Routes
 * 
 * Endpoints for generating PDF/CSV reports:
 * - Executive summaries for stakeholders
 * - Custom date range reports
 * - Conjunction event detailed reports
 */

/**
 * GET /api/reports/summary
 * Get summary of available report data
 * Query params: startDate, endDate (ISO date strings)
 */
router.get('/summary', reportController.getReportSummary);

/**
 * POST /api/reports/executive
 * Generate executive summary report
 * Body: { startDate, endDate, format: 'pdf' | 'csv' }
 */
router.post('/executive', reportController.generateExecutiveReport);

/**
 * POST /api/reports/date-range
 * Generate custom date range report
 * Body: { 
 *   startDate, 
 *   endDate, 
 *   format: 'pdf' | 'csv',
 *   includeAlerts: boolean,
 *   includeConjunctions: boolean,
 *   riskLevels: string[] 
 * }
 */
router.post('/date-range', reportController.generateDateRangeReport);

/**
 * POST /api/reports/conjunction
 * Generate conjunction detailed report
 * Body: { conjunctionId, format: 'pdf' | 'csv' }
 */
router.post('/conjunction', reportController.generateConjunctionReport);

/**
 * GET /api/reports/conjunction/:id/details
 * Get conjunction details for report preview
 */
router.get('/conjunction/:id/details', reportController.getConjunctionDetails);

module.exports = router;
