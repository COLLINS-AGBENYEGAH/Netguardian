const Alert = require('../models/Alert');

// @desc   Get alerts (supports ?resolved=true/false&severity=)
// @route  GET /api/alerts
exports.getAlerts = async (req, res) => {
  try {
    const { resolved, severity } = req.query;
    const filter = { organizationId: req.user.organizationId };
    if (resolved !== undefined) filter.isResolved = resolved === 'true';
    if (severity) filter.severity = severity;

    const alerts = await Alert.find(filter)
      .populate('device', 'ipAddress macAddress hostname')
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({ count: alerts.length, alerts });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch alerts', error: error.message });
  }
};

// @desc   Mark an alert as resolved
// @route  PATCH /api/alerts/:id/resolve
exports.resolveAlert = async (req, res) => {
  try {
    const alert = await Alert.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!alert) return res.status(404).json({ message: 'Alert not found' });

    alert.isResolved = true;
    alert.resolvedBy = req.user._id;
    alert.resolvedAt = new Date();
    await alert.save();

    res.json({ alert });
  } catch (error) {
    res.status(500).json({ message: 'Failed to resolve alert', error: error.message });
  }
};
