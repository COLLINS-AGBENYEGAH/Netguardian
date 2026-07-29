const Device = require('../models/Device');
const Log = require('../models/Log');
const { computeUptimePercent } = require('../services/uptimeService');
const { resolveAlerts } = require('../services/alertRulesService');
const { escapeRegex } = require('../utils/regexEscape');
const { blockDeviceOnRouter, unblockDeviceOnRouter } = require('../services/deviceBlockingService');

// @desc   Get all devices (supports ?status=&authorization=&search=)
// @route  GET /api/devices
exports.getDevices = async (req, res) => {
  try {
    const { status, authorization, search } = req.query;
    const filter = { organizationId: req.user.organizationId };
    if (status) filter.status = status;
    if (authorization) filter.authorization = authorization;
    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { ipAddress: new RegExp(safeSearch, 'i') },
        { macAddress: new RegExp(safeSearch, 'i') },
        { hostname: new RegExp(safeSearch, 'i') },
        { owner: new RegExp(safeSearch, 'i') }
      ];
    }

    const devices = await Device.find(filter).sort({ lastSeen: -1 });
    const devicesWithUptime = devices.map((d) => ({
      ...d.toObject(),
      uptimePercent: computeUptimePercent(d)
    }));

    res.json({ count: devicesWithUptime.length, devices: devicesWithUptime });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch devices', error: error.message });
  }
};

// @desc   Get single device by ID
// @route  GET /api/devices/:id
exports.getDeviceById = async (req, res) => {
  try {
    // Scoping by organizationId here (not just _id) is what prevents one
    // organization from reading another's device by guessing/trying IDs.
    const device = await Device.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!device) return res.status(404).json({ message: 'Device not found' });
    res.json({ device: { ...device.toObject(), uptimePercent: computeUptimePercent(device) } });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch device', error: error.message });
  }
};

// @desc   Manually add a device
// @route  POST /api/devices
exports.createDevice = async (req, res) => {
  try {
    const { ipAddress, macAddress, hostname, vendor, deviceType, owner, authorization, notes } = req.body;

    if (!ipAddress || !macAddress) {
      return res.status(400).json({ message: 'ipAddress and macAddress are required' });
    }

    const device = await Device.create({
      organizationId: req.user.organizationId,
      ipAddress,
      macAddress: macAddress.toUpperCase(),
      hostname,
      vendor,
      deviceType,
      owner,
      authorization: authorization || 'authorized',
      notes,
      addedBy: req.user._id
    });

    await Log.create({
      organizationId: req.user.organizationId,
      action: 'device_added',
      device: device._id,
      user: req.user._id,
      details: `Manually added ${ipAddress}`
    });

    res.status(201).json({ device });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A device with this MAC address already exists in your organization' });
    }
    res.status(500).json({ message: 'Failed to create device', error: error.message });
  }
};

// @desc   Update device details
// @route  PUT /api/devices/:id
exports.updateDevice = async (req, res) => {
  try {
    const device = await Device.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!device) return res.status(404).json({ message: 'Device not found' });

    const editableFields = ['hostname', 'vendor', 'deviceType', 'owner', 'notes', 'ipAddress'];
    editableFields.forEach((field) => {
      if (req.body[field] !== undefined) device[field] = req.body[field];
    });

    await device.save();
    await Log.create({
      organizationId: req.user.organizationId,
      action: 'device_updated',
      device: device._id,
      user: req.user._id
    });

    res.json({ device });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update device', error: error.message });
  }
};

// @desc   Delete a device
// @route  DELETE /api/devices/:id
exports.deleteDevice = async (req, res) => {
  try {
    const device = await Device.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!device) return res.status(404).json({ message: 'Device not found' });

    await device.deleteOne();
    await Log.create({
      organizationId: req.user.organizationId,
      action: 'device_removed',
      user: req.user._id,
      details: `Removed ${device.ipAddress} (${device.macAddress})`
    });

    res.json({ message: 'Device removed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete device', error: error.message });
  }
};

// Add this import at the top of devicesController.js, alongside your
// existing requires:
//
// const { blockDeviceOnRouter, unblockDeviceOnRouter } = require('../services/deviceBlockingService');


// @desc   Authorize a pending/unauthorized/blocked device. If it was
//         previously blocked, this also attempts to remove any real
//         network-level block (router/firewall rule) that was applied.
// @route  PATCH /api/devices/:id/authorize
exports.authorizeDevice = async (req, res) => {
  try {
    const device = await Device.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!device) return res.status(404).json({ message: 'Device not found' });

    const wasBlocked = device.authorization === 'blocked';

    device.authorization = 'authorized';
    await device.save();
    await resolveAlerts({ organizationId: req.user.organizationId, type: 'unknown_device', device: device._id });

    let enforcement = null;
    if (wasBlocked) {
      enforcement = await unblockDeviceOnRouter(req.user.organizationId, device.macAddress);
    }

    await Log.create({
      organizationId: req.user.organizationId,
      action: 'device_authorized',
      device: device._id,
      user: req.user._id,
      details: enforcement
        ? `Network-level unblock via ${enforcement.brand}: ${enforcement.enforced ? 'succeeded' : (enforcement.error || enforcement.reason || 'not enforced')}`
        : undefined
    });

    res.json({ device, enforcement });
  } catch (error) {
    res.status(500).json({ message: 'Failed to authorize device', error: error.message });
  }
};

// @desc   Block a suspicious device. Sets its status in the database AND
//         attempts a real network-level block via the organization's
//         configured router/firewall integration (if any). If no router
//         integration is configured, the device is still marked blocked
//         in the dashboard, but `enforcement.enforced` will be false -
//         the frontend should make that distinction visible to the admin.
// @route  PATCH /api/devices/:id/block
exports.blockDevice = async (req, res) => {
  try {
    const device = await Device.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!device) return res.status(404).json({ message: 'Device not found' });

    device.authorization = 'blocked';
    await device.save();
    await resolveAlerts({ organizationId: req.user.organizationId, type: 'unknown_device', device: device._id });

    const enforcement = await blockDeviceOnRouter(req.user.organizationId, device.macAddress);

    await Log.create({
      organizationId: req.user.organizationId,
      action: 'device_blocked',
      device: device._id,
      user: req.user._id,
      details: `Network-level block via ${enforcement.brand}: ${enforcement.enforced ? 'succeeded' : (enforcement.error || enforcement.reason || 'not enforced')}`
    });

    res.json({ device, enforcement });
  } catch (error) {
    res.status(500).json({ message: 'Failed to block device', error: error.message });
  }
};