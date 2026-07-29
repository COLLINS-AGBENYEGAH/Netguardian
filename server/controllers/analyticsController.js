const Device = require('../models/Device');
const Alert = require('../models/Alert');

// @desc   Dashboard summary stats
// @route  GET /api/analytics/summary
exports.getSummary = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;

    const [totalDevices, activeDevices, offlineDevices, unauthorizedDevices, unresolvedAlerts] = await Promise.all([
      Device.countDocuments({ organizationId }),
      Device.countDocuments({ organizationId, status: 'online' }),
      Device.countDocuments({ organizationId, status: 'offline' }),
      Device.countDocuments({ organizationId, authorization: { $in: ['unauthorized', 'pending'] } }),
      Alert.countDocuments({ organizationId, isResolved: false })
    ]);

    const deviceTypeBreakdown = await Device.aggregate([
      { $match: { organizationId } },
      { $group: { _id: '$deviceType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      totalDevices,
      activeDevices,
      offlineDevices,
      unauthorizedDevices,
      unresolvedAlerts,
      deviceTypeBreakdown
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to compute analytics', error: error.message });
  }
};

// @desc   Network activity trend over the last N days (devices seen per day)
// @route  GET /api/analytics/trends?days=7
exports.getTrends = async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const trend = await Device.aggregate([
      { $match: { organizationId: req.user.organizationId, lastSeen: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$lastSeen' } },
          devicesSeen: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({ days, trend });
  } catch (error) {
    res.status(500).json({ message: 'Failed to compute trends', error: error.message });
  }
};
