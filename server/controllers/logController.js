const Log = require('../models/Log');

// @desc   Get activity/audit logs, newest first (supports ?action=&page=&limit=)
// @route  GET /api/logs
exports.getLogs = async (req, res) => {
  try {
    const { action, page = 1, limit = 50 } = req.query;
    const filter = { organizationId: req.user.organizationId };
    if (action) filter.action = action;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    const [logs, total] = await Promise.all([
      Log.find(filter)
        .populate('device', 'ipAddress macAddress hostname')
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      Log.countDocuments(filter)
    ]);

    res.json({
      logs,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch logs', error: error.message });
  }
};
