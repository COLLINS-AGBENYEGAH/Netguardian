const Device = require('../models/Device');
const Alert = require('../models/Alert');
const Log = require('../models/Log');
const Report = require('../models/Report');
const { generateReportPdf } = require('../services/reportPdfService');
const { generateReportCsv } = require('../services/reportCsvService');

// @desc   Generate a device inventory report
// @route  POST /api/reports/device
exports.generateDeviceReport = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const devices = await Device.find({ organizationId }).sort({ deviceType: 1 });

    const summary = {
      totalDevices: devices.length,
      byStatus: {
        online: devices.filter((d) => d.status === 'online').length,
        offline: devices.filter((d) => d.status === 'offline').length
      },
      byAuthorization: {
        authorized: devices.filter((d) => d.authorization === 'authorized').length,
        unauthorized: devices.filter((d) => d.authorization === 'unauthorized').length,
        blocked: devices.filter((d) => d.authorization === 'blocked').length,
        pending: devices.filter((d) => d.authorization === 'pending').length
      },
      devices: devices.map((d) => ({
        ip: d.ipAddress,
        mac: d.macAddress,
        hostname: d.hostname,
        type: d.deviceType,
        status: d.status,
        authorization: d.authorization,
        lastSeen: d.lastSeen
      }))
    };

    const report = await Report.create({
      organizationId,
      title: `Device Inventory Report - ${new Date().toLocaleDateString()}`,
      type: 'device',
      generatedBy: req.user._id,
      summary
    });

    res.status(201).json({ report });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate report', error: error.message });
  }
};

// @desc   Generate a security report (unauthorized devices + alerts)
// @route  POST /api/reports/security
exports.generateSecurityReport = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const suspiciousDevices = await Device.find({
      organizationId,
      authorization: { $in: ['unauthorized', 'blocked', 'pending'] }
    });
    const alerts = await Alert.find({ organizationId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('device', 'ipAddress hostname');

    const summary = {
      suspiciousDeviceCount: suspiciousDevices.length,
      totalAlerts: alerts.length,
      unresolvedAlerts: alerts.filter((a) => !a.isResolved).length,
      severityBreakdown: {
        critical: alerts.filter((a) => a.severity === 'critical').length,
        high: alerts.filter((a) => a.severity === 'high').length,
        medium: alerts.filter((a) => a.severity === 'medium').length,
        low: alerts.filter((a) => a.severity === 'low').length
      },
      suspiciousDevices: suspiciousDevices.map((d) => ({
        ip: d.ipAddress,
        mac: d.macAddress,
        authorization: d.authorization,
        lastSeen: d.lastSeen
      }))
    };

    const report = await Report.create({
      organizationId,
      title: `Security Report - ${new Date().toLocaleDateString()}`,
      type: 'security',
      generatedBy: req.user._id,
      summary
    });

    res.status(201).json({ report });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate report', error: error.message });
  }
};

// @desc   Generate a network performance report (uptime/response times)
// @route  POST /api/reports/performance
exports.generatePerformanceReport = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const devices = await Device.find({ organizationId });
    const avgResponseTime =
      devices.filter((d) => d.lastResponseTimeMs != null).reduce((sum, d) => sum + d.lastResponseTimeMs, 0) /
        devices.filter((d) => d.lastResponseTimeMs != null).length || 0;

    const scanLogs = await Log.find({ organizationId, action: { $in: ['scan_started', 'scan_completed'] } })
      .sort({ createdAt: -1 })
      .limit(50);

    const summary = {
      totalDevicesMonitored: devices.length,
      averageResponseTimeMs: Math.round(avgResponseTime),
      recentScans: scanLogs.length,
      offlineRate: devices.length ? Math.round((devices.filter((d) => d.status === 'offline').length / devices.length) * 100) : 0
    };

    const report = await Report.create({
      organizationId,
      title: `Network Performance Report - ${new Date().toLocaleDateString()}`,
      type: 'network_performance',
      generatedBy: req.user._id,
      summary
    });

    res.status(201).json({ report });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate report', error: error.message });
  }
};

// @desc   List all previously generated reports
// @route  GET /api/reports
exports.getReports = async (req, res) => {
  try {
    const reports = await Report.find({ organizationId: req.user.organizationId })
      .sort({ createdAt: -1 })
      .populate('generatedBy', 'name email');
    res.json({ count: reports.length, reports });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch reports', error: error.message });
  }
};

// @desc   Download a previously generated report as a PDF file
// @route  GET /api/reports/:id/download
exports.downloadReportPdf = async (req, res) => {
  try {
    const report = await Report.findOne({ _id: req.params.id, organizationId: req.user.organizationId })
      .populate('generatedBy', 'name email');
    if (!report) return res.status(404).json({ message: 'Report not found' });

    const pdfBuffer = await generateReportPdf(report);
    const safeFilename = report.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate PDF', error: error.message });
  }
};

// @desc   Download a previously generated report as a CSV file
// @route  GET /api/reports/:id/download-csv
exports.downloadReportCsv = async (req, res) => {
  try {
    const report = await Report.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!report) return res.status(404).json({ message: 'Report not found' });

    const csvContent = generateReportCsv(report);
    const safeFilename = report.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.csv"`);
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate CSV', error: error.message });
  }
};
