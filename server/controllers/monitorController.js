const Device = require('../models/Device');
const { pingDevice } = require('../services/monitorService');

// @desc   Informational endpoint - explains that scanning is now handled
//         by this organization's own standalone Agent, not triggered
//         centrally. Kept as a route (rather than removed outright) so
//         the dashboard's existing "Scan Network Now" button has
//         somewhere to point that gives a clear, accurate explanation
//         instead of a 404 or, worse, silently doing nothing useful.
// @route  POST /api/monitor/scan
exports.triggerScan = async (req, res) => {
  res.json({
    message: 'Device discovery is now handled by your organization\'s standalone Agent running on your own network, not triggered from here. Make sure your Agent is running - new/changed devices will appear automatically as it reports.'
  });
};

// @desc   Re-check a single device's liveness immediately. Only succeeds
//         if THIS backend can actually reach the device's IP - in
//         practice, that means it mainly works for whichever organization
//         happens to be running the backend on their own network.
// @route  POST /api/monitor/ping/:id
exports.pingSingleDevice = async (req, res) => {
  try {
    const device = await Device.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!device) return res.status(404).json({ message: 'Device not found' });

    const updated = await pingDevice(device, req.user.organizationId);
    res.json({ device: updated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to ping device', error: error.message });
  }
};
