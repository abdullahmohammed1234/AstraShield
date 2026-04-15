const PDFDocument = require('pdfkit');
const { Parser } = require('json2csv');
const Conjunction = require('../models/Conjunction');
const Alert = require('../models/Alert');
const RiskSnapshot = require('../models/RiskSnapshot');
const Satellite = require('../models/Satellite');
const logger = require('../utils/logger');

/**
 * Report Generation Service
 * Handles PDF and CSV export for executive summaries, date range reports, and conjunction details
 */

class ReportService {
  /**
   * Generate executive summary PDF report - simplified version
   */
  async generateExecutiveSummaryPDF(startDate, endDate) {
    const logger = require('../utils/logger');
    logger.info('Starting executive summary PDF generation');
    
    try {
      // Simple queries
      const totalObjects = await Satellite.countDocuments();
      const highRiskCount = await Satellite.countDocuments({ riskScore: { $gte: 0.6 } });
      const mediumRiskCount = await Satellite.countDocuments({ riskScore: { $gte: 0.3, $lt: 0.6 } });
      const lowRiskCount = await Satellite.countDocuments({ riskScore: { $lt: 0.3 } });
      
      const leoCount = await Satellite.countDocuments({ orbitalAltitude: { $lte: 2000 } });
      const meoCount = await Satellite.countDocuments({ orbitalAltitude: { $gt: 2000, $lte: 35786 } });
      const geoCount = await Satellite.countDocuments({ orbitalAltitude: { $gt: 35786 } });

      const conjStartDate = new Date(startDate);
      const conjEndDate = new Date(endDate);
      const totalConjunctions = await Conjunction.countDocuments({
        createdAt: { $gte: conjStartDate, $lte: conjEndDate }
      });
      const highRiskConjs = await Conjunction.countDocuments({
        createdAt: { $gte: conjStartDate, $lte: conjEndDate },
        riskLevel: { $in: ['high', 'critical'] }
      });

      const topRisks = await Satellite.find({})
        .sort({ riskScore: -1 })
        .limit(10)
        .lean();

      let avgRisk = 0;
      if (totalObjects > 0) {
        avgRisk = (highRiskCount * 0.8 + mediumRiskCount * 0.4 + lowRiskCount * 0.1) / totalObjects;
      }

      // Use file-based approach
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const tempFile = path.join(os.tmpdir(), `report_${Date.now()}.pdf`);

      return new Promise((resolve, reject) => {
        try {
          const doc = new PDFDocument({ margin: 50, size: 'A4' });
          const stream = fs.createWriteStream(tempFile);
          
          doc.pipe(stream);
          
          // Header
          doc.fontSize(24).text('AstraShield Executive Summary', { align: 'center' });
          doc.moveDown();
          doc.fontSize(12).text(`Report Period: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`, { align: 'center' });
          doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
          doc.moveDown(2);

          // Key Metrics
          doc.fontSize(16).text('Key Metrics', { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(12);
          doc.text(`Total Tracked Objects: ${totalObjects}`);
          doc.text(`Average Risk Score: ${(avgRisk * 100).toFixed(1)}%`);
          doc.text(`High Risk Objects: ${highRiskCount}`);
          doc.text(`Medium Risk Objects: ${mediumRiskCount}`);
          doc.text(`Low Risk Objects: ${lowRiskCount}`);
          doc.moveDown();

          // Orbital Distribution
          doc.fontSize(14).text('Orbital Distribution', { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(12);
          doc.text(`LEO: ${leoCount} objects`);
          doc.text(`MEO: ${meoCount} objects`);
          doc.text(`GEO: ${geoCount} objects`);
          doc.moveDown();

          // Conjunction Summary
          doc.fontSize(14).text('Conjunction Events', { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(12);
          doc.text(`Total Conjunctions: ${totalConjunctions}`);
          doc.text(`High Risk + Critical: ${highRiskConjs}`);
          doc.moveDown();

          // Top Risk Objects
          if (topRisks && topRisks.length > 0) {
            doc.fontSize(14).text('Top Risk Objects', { underline: true });
            doc.moveDown(0.5);
            doc.fontSize(10);
            
            topRisks.slice(0, 10).forEach((sat, idx) => {
              doc.text(`${idx + 1}. ${sat.name || 'Unknown'} (NORAD: ${sat.noradCatId}) - Risk: ${((sat.riskScore || 0) * 100).toFixed(1)}%`);
            });
          }

          // Footer
          doc.moveDown(2);
          doc.fontSize(10).fillColor('#666');
          doc.text('AstraShield - Space Situational Awareness Platform', { align: 'center' });

          doc.end();
          
          stream.on('finish', () => {
            try {
              const buffer = fs.readFileSync(tempFile);
              fs.unlinkSync(tempFile); // Clean up
              logger.info('PDF generated successfully');
              resolve(buffer);
            } catch (err) {
              logger.error('Error reading PDF file:', err);
              reject(err);
            }
          });
          
          stream.on('error', (err) => {
            logger.error('PDF stream error:', err);
            reject(err);
          });
        } catch (err) {
          logger.error('PDF creation error:', err);
          reject(err);
        }
      });
    } catch (error) {
      logger.error('Error generating PDF:', error);
      throw error;
    }
  }

  /**
   * Generate executive summary CSV report
   */
  async generateExecutiveSummaryCSV(startDate, endDate) {
    try {
      const totalObjects = await Satellite.countDocuments();
      const highRiskCount = await Satellite.countDocuments({ riskScore: { $gte: 0.6 } });
      const mediumRiskCount = await Satellite.countDocuments({ riskScore: { $gte: 0.3, $lt: 0.6 } });
      const lowRiskCount = await Satellite.countDocuments({ riskScore: { $lt: 0.3 } });
      
      const leoCount = await Satellite.countDocuments({ orbitalAltitude: { $lte: 2000 } });
      const meoCount = await Satellite.countDocuments({ orbitalAltitude: { $gt: 2000, $lte: 35786 } });
      const geoCount = await Satellite.countDocuments({ orbitalAltitude: { $gt: 35786 } });

      const conjStartDate = new Date(startDate);
      const conjEndDate = new Date(endDate);
      const totalConjunctions = await Conjunction.countDocuments({
        createdAt: { $gte: conjStartDate, $lte: conjEndDate }
      });
      const highRiskConjs = await Conjunction.countDocuments({
        createdAt: { $gte: conjStartDate, $lte: conjEndDate },
        riskLevel: { $in: ['high', 'critical'] }
      });
      const criticalConjs = await Conjunction.countDocuments({
        createdAt: { $gte: conjStartDate, $lte: conjEndDate },
        riskLevel: 'critical'
      });

      let avgRisk = 0;
      if (totalObjects > 0) {
        avgRisk = (highRiskCount * 0.8 + mediumRiskCount * 0.4 + lowRiskCount * 0.1) / totalObjects;
      }

      const data = [{
        Date: new Date().toLocaleDateString(),
        'Total Objects': totalObjects,
        'Average Risk': (avgRisk * 100).toFixed(2) + '%',
        'High Risk Objects': highRiskCount,
        'Medium Risk Objects': mediumRiskCount,
        'Low Risk Objects': lowRiskCount,
        'LEO Objects': leoCount,
        'MEO Objects': meoCount,
        'GEO Objects': geoCount,
        'Total Conjunctions': totalConjunctions,
        'High Risk Conjunctions': highRiskConjs,
        'Critical Conjunctions': criticalConjs
      }];

      const parser = new Parser({
        fields: ['Date', 'Total Objects', 'Average Risk', 'High Risk Objects', 'Medium Risk Objects', 
                 'Low Risk Objects', 'LEO Objects', 'MEO Objects', 'GEO Objects', 
                 'Total Conjunctions', 'High Risk Conjunctions', 'Critical Conjunctions']
      });

      return parser.parse(data);
    } catch (error) {
      logger.error('Error generating executive summary CSV:', error);
      throw error;
    }
  }

  /**
   * Generate custom date range PDF report
   */
  async generateDateRangePDF(startDate, endDate, options = {}) {
    const { includeAlerts = true, includeConjunctions = true, riskLevels = [] } = options;
    
    const query = {
      createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
    };
    
    if (riskLevels.length > 0) {
      query.riskLevel = { $in: riskLevels };
    }

    const conjunctions = includeConjunctions 
      ? await Conjunction.find(query).sort({ probabilityOfCollision: -1 }).limit(100).lean()
      : [];

    const alerts = includeAlerts
      ? await Alert.find({
          createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
        }).sort({ createdAt: -1 }).limit(100).lean()
      : [];

    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const tempFile = path.join(os.tmpdir(), `daterange_${Date.now()}.pdf`);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(tempFile);
      
      doc.pipe(stream);

      // Header
      doc.fontSize(24).text('AstraShield Date Range Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Period: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`, { align: 'center' });
      doc.moveDown(2);

      // Summary
      doc.fontSize(16).text('Summary', { underline: true });
      doc.fontSize(12);
      doc.text(`Conjunctions: ${conjunctions.length}, Alerts: ${alerts.length}`);
      doc.moveDown(2);

      // Conjunctions
      if (includeConjunctions && conjunctions.length > 0) {
        doc.fontSize(14).text('Conjunctions', { underline: true });
        doc.moveDown(0.5);
        
        conjunctions.slice(0, 20).forEach((conj, idx) => {
          doc.fontSize(10);
          doc.text(`${idx + 1}. SAT-${conj.satellite1} ↔ SAT-${conj.satellite2} | ${conj.riskLevel} | ${conj.closestApproachDistance?.toFixed(2)}km`);
        });
        doc.moveDown();
      }

      // Alerts
      if (includeAlerts && alerts.length > 0) {
        doc.fontSize(14).text('Alerts', { underline: true });
        doc.moveDown(0.5);
        
        alerts.slice(0, 20).forEach((alert, idx) => {
          doc.fontSize(10);
          doc.text(`${idx + 1}. ${alert.alertId} | ${alert.status} | ${alert.priority}`);
        });
      }

      doc.end();
      
      stream.on('finish', () => {
        const buffer = fs.readFileSync(tempFile);
        fs.unlinkSync(tempFile);
        resolve(buffer);
      });
      
      stream.on('error', reject);
    });
  }

  /**
   * Generate custom date range CSV report
   */
  async generateDateRangeCSV(startDate, endDate, options = {}) {
    const { includeAlerts = true, includeConjunctions = true, riskLevels = [] } = options;
    
    const conjunctionQuery = {
      createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
    };
    
    if (riskLevels.length > 0) {
      conjunctionQuery.riskLevel = { $in: riskLevels };
    }

    const conjunctions = includeConjunctions 
      ? await Conjunction.find(conjunctionQuery).sort({ createdAt: -1 }).lean()
      : [];

    const alerts = includeAlerts
      ? await Alert.find({
          createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
        }).sort({ createdAt: -1 }).lean()
      : [];

    let csvData = [];

    if (includeConjunctions && conjunctions.length > 0) {
      const conjunctionData = conjunctions.map(c => ({
        'Event Type': 'Conjunction',
        'Satellite 1 NORAD': c.satellite1,
        'Satellite 2 NORAD': c.satellite2,
        'TCA': new Date(c.timeOfClosestApproach).toISOString(),
        'Distance (km)': c.closestApproachDistance?.toFixed(3),
        'Risk Level': c.riskLevel,
        'Probability': c.probabilityFormatted || c.probabilityOfCollision?.toExponential(2)
      }));
      csvData = csvData.concat(conjunctionData);
    }

    if (includeAlerts && alerts.length > 0) {
      const alertData = alerts.map(a => ({
        'Event Type': 'Alert',
        'ID': a.alertId,
        'Satellite 1 NORAD': a.satellites?.satA?.noradCatId,
        'Satellite 2 NORAD': a.satellites?.satB?.noradCatId,
        'Status': a.status,
        'Priority': a.priority,
        'Created At': new Date(a.createdAt).toISOString()
      }));
      csvData = csvData.concat(alertData);
    }

    if (csvData.length === 0) {
      throw new Error('No data found for the specified date range');
    }

    const parser = new Parser();
    return parser.parse(csvData);
  }

  /**
   * Generate conjunction detailed PDF report
   */
  async generateConjunctionDetailPDF(conjunctionId) {
    const conjunction = await Conjunction.findById(conjunctionId).lean();
    
    if (!conjunction) {
      throw new Error('Conjunction not found');
    }

    const satellites = await Satellite.find({
      noradCatId: { $in: [conjunction.satellite1, conjunction.satellite2] }
    }).lean();

    const sat1 = satellites.find(s => s.noradCatId === conjunction.satellite1);
    const sat2 = satellites.find(s => s.noradCatId === conjunction.satellite2);

    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const tempFile = path.join(os.tmpdir(), `conj_${Date.now()}.pdf`);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(tempFile);
      
      doc.pipe(stream);

      // Header
      doc.fontSize(24).text('Conjunction Detail Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`ID: ${conjunction._id}`, { align: 'center' });
      doc.moveDown(2);

      // Overview
      doc.fontSize(16).text('Conjunction Details', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12);
      doc.text(`Satellite 1: ${conjunction.satellite1}`);
      doc.text(`Satellite 2: ${conjunction.satellite2}`);
      doc.text(`TCA: ${new Date(conjunction.timeOfClosestApproach).toLocaleString()}`);
      doc.text(`Distance: ${conjunction.closestApproachDistance?.toFixed(3)} km`);
      doc.text(`Velocity: ${conjunction.relativeVelocity?.toFixed(3)} km/s`);
      doc.text(`Risk Level: ${conjunction.riskLevel}`);
      doc.text(`Probability: ${conjunction.probabilityFormatted || conjunction.probabilityOfCollision}`);
      doc.moveDown();

      if (sat1) {
        doc.fontSize(14).text('Satellite 1', { underline: true });
        doc.fontSize(12);
        doc.text(`Name: ${sat1.name}, Altitude: ${sat1.orbitalAltitude?.toFixed(0)}km`);
      }

      if (sat2) {
        doc.fontSize(14).text('Satellite 2', { underline: true });
        doc.fontSize(12);
        doc.text(`Name: ${sat2.name}, Altitude: ${sat2.orbitalAltitude?.toFixed(0)}km`);
      }

      doc.end();
      
      stream.on('finish', () => {
        const buffer = fs.readFileSync(tempFile);
        fs.unlinkSync(tempFile);
        resolve(buffer);
      });
      
      stream.on('error', reject);
    });
  }

  /**
   * Generate conjunction detailed CSV report
   */
  async generateConjunctionDetailCSV(conjunctionId) {
    const conjunction = await Conjunction.findById(conjunctionId).lean();
    
    if (!conjunction) {
      throw new Error('Conjunction not found');
    }

    const satellites = await Satellite.find({
      noradCatId: { $in: [conjunction.satellite1, conjunction.satellite2] }
    }).lean();

    const sat1 = satellites.find(s => s.noradCatId === conjunction.satellite1);
    const sat2 = satellites.find(s => s.noradCatId === conjunction.satellite2);

    const data = [{
      'Conjunction ID': conjunction._id,
      'Satellite 1 NORAD': conjunction.satellite1,
      'Satellite 1 Name': sat1?.name || 'Unknown',
      'Satellite 1 Altitude': sat1?.orbitalAltitude?.toFixed(2),
      'Satellite 2 NORAD': conjunction.satellite2,
      'Satellite 2 Name': sat2?.name || 'Unknown',
      'Satellite 2 Altitude': sat2?.orbitalAltitude?.toFixed(2),
      'TCA': new Date(conjunction.timeOfClosestApproach).toISOString(),
      'Distance (km)': conjunction.closestApproachDistance?.toFixed(4),
      'Velocity (km/s)': conjunction.relativeVelocity?.toFixed(4),
      'Risk Level': conjunction.riskLevel,
      'Probability': conjunction.probabilityOfCollision?.toExponential(6)
    }];

    const parser = new Parser();
    return parser.parse(data);
  }

  /**
   * Get available report data summary
   */
  async getReportSummary(startDate, endDate) {
    const conjunctionCount = await Conjunction.countDocuments({
      createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
    });

    const alertCount = await Alert.countDocuments({
      createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
    });

    const snapshotCount = await RiskSnapshot.countDocuments({
      timestamp: { $gte: new Date(startDate), $lte: new Date(endDate) }
    });

    return {
      conjunctionCount,
      alertCount,
      snapshotCount,
      dateRange: {
        start: startDate,
        end: endDate
      }
    };
  }
}

module.exports = new ReportService();
