const reportService = require('../services/reportService');
const logger = require('../utils/logger');

/**
 * Report Controller
 * Handles HTTP requests for report generation endpoints
 */

/**
 * GET /api/reports/summary
 * Get summary of available report data for a date range
 */
const getReportSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate query parameters are required'
      });
    }

    const summary = await reportService.getReportSummary(startDate, endDate);

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error('Error in getReportSummary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * POST /api/reports/executive
 * Generate executive summary report
 */
const generateExecutiveReport = async (req, res) => {
  try {
    const { startDate, endDate, format = 'pdf' } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    let reportBuffer;
    let contentType;
    let filename;

    if (format.toLowerCase() === 'csv') {
      reportBuffer = await reportService.generateExecutiveSummaryCSV(startDate, endDate);
      contentType = 'text/csv';
      filename = `executive-summary-${startDate}-to-${endDate}.csv`;
    } else {
      reportBuffer = await reportService.generateExecutiveSummaryPDF(startDate, endDate);
      contentType = 'application/pdf';
      filename = `executive-summary-${startDate}-to-${endDate}.pdf`;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(reportBuffer);
  } catch (error) {
    logger.error('Error in generateExecutiveReport:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * POST /api/reports/date-range
 * Generate custom date range report
 */
const generateDateRangeReport = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      format = 'pdf',
      includeAlerts = true,
      includeConjunctions = true,
      riskLevels = []
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const options = {
      includeAlerts,
      includeConjunctions,
      riskLevels
    };

    let reportBuffer;
    let contentType;
    let filename;

    if (format.toLowerCase() === 'csv') {
      reportBuffer = await reportService.generateDateRangeCSV(startDate, endDate, options);
      contentType = 'text/csv';
      filename = `date-range-report-${startDate}-to-${endDate}.csv`;
    } else {
      reportBuffer = await reportService.generateDateRangePDF(startDate, endDate, options);
      contentType = 'application/pdf';
      filename = `date-range-report-${startDate}-to-${endDate}.pdf`;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(reportBuffer);
  } catch (error) {
    logger.error('Error in generateDateRangeReport:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * POST /api/reports/conjunction
 * Generate conjunction detailed report
 */
const generateConjunctionReport = async (req, res) => {
  try {
    const { conjunctionId, format = 'pdf' } = req.body;

    if (!conjunctionId) {
      return res.status(400).json({
        success: false,
        error: 'conjunctionId is required'
      });
    }

    let reportBuffer;
    let contentType;
    let filename;

    if (format.toLowerCase() === 'csv') {
      reportBuffer = await reportService.generateConjunctionDetailCSV(conjunctionId);
      contentType = 'text/csv';
      filename = `conjunction-${conjunctionId}.csv`;
    } else {
      reportBuffer = await reportService.generateConjunctionDetailPDF(conjunctionId);
      contentType = 'application/pdf';
      filename = `conjunction-${conjunctionId}.pdf`;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(reportBuffer);
  } catch (error) {
    logger.error('Error in generateConjunctionReport:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * GET /api/reports/conjunction/:id/details
 * Get conjunction details for report preview
 */
const getConjunctionDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    const Conjunction = require('../models/Conjunction');
    const Alert = require('../models/Alert');
    const Satellite = require('../models/Satellite');

    const conjunction = await Conjunction.findById(id).lean();
    
    if (!conjunction) {
      return res.status(404).json({
        success: false,
        error: 'Conjunction not found'
      });
    }

    // Get satellite details
    const satellites = await Satellite.find({
      noradCatId: { $in: [conjunction.satellite1, conjunction.satellite2] }
    }).lean();

    const sat1 = satellites.find(s => s.noradCatId === conjunction.satellite1);
    const sat2 = satellites.find(s => s.noradCatId === conjunction.satellite2);

    // Get associated alerts
    const alerts = await Alert.find({
      $or: [
        { 'satellites.satA.noradCatId': conjunction.satellite1, 'satellites.satB.noradCatId': conjunction.satellite2 },
        { 'satellites.satA.noradCatId': conjunction.satellite2, 'satellites.satB.noradCatId': conjunction.satellite1 }
      ]
    }).sort({ createdAt: -1 }).limit(10).lean();

    res.json({
      success: true,
      data: {
        conjunction,
        satellite1: sat1,
        satellite2: sat2,
        alerts
      }
    });
  } catch (error) {
    logger.error('Error in getConjunctionDetails:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  getReportSummary,
  generateExecutiveReport,
  generateDateRangeReport,
  generateConjunctionReport,
  getConjunctionDetails
};
