const Settings = require('../models/Settings');
const Organization = require('../models/Organization');
const Device = require('../models/Device');
const Alert = require('../models/Alert');
const { getSettings, invalidateCache } = require('../services/settingsService');
const { cidrContains } = require('../services/discoveryService');

const CIDR_REGEX = /^(\d{1,3}\.){3}\d{1,3}\/(1[6-9]|2[0-9]|30)$/;
const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROUTER_BRANDS = ['none', 'unifi', 'mikrotik', 'fortigate'];

// @desc   Get current settings for the logged-in user's organization
// @route  GET /api/settings
exports.getSettingsHandler = async (req, res) => {
  try {
    const settings = await getSettings(req.user.organizationId, true);
    const organization = await Organization.findById(req.user.organizationId);

    res.json({
      settings,
      organization: {
        name: organization.name,
        hasAgentToken: !!organization.agentTokenHash,
        lastAgentReportAt: organization.lastAgentReportAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch settings', error: error.message });
  }
};

// @desc   Update settings for the logged-in user's organization (admin
//         only). Applies immediately - the shared alert-threshold logic
//         reads these fresh on every check, no restart needed. NOTE: the
//         actual scanning schedule/target network is configured on each
//         organization's own standalone Agent (its local .env), not here -
//         networkRange/scanIntervalMinutes etc. below are informational
//         records of what SHOULD be configured on the Agent, since the
//         central backend can no longer scan on any organization's behalf.
// @route  PUT /api/settings
exports.updateSettingsHandler = async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const {
      networkRange,
      gatewayIp,
      scanIntervalMinutes,
      fastPollSeconds,
      gatewayCheckSeconds,
      latencyThresholdMs,
      flapThresholdCount,
      flapWindowMinutes,
      uptimeSnapshotMinutes,
      alertEmailEnabled,
      alertEmailRecipients,
      alertEmailMinSeverity,
      routerIntegration
    } = req.body;

    if (networkRange !== undefined && !CIDR_REGEX.test(networkRange)) {
      return res.status(400).json({
        message: 'Network range must be a valid CIDR between /16 and /30, e.g. 192.168.1.0/24'
      });
    }

    if (gatewayIp !== undefined && gatewayIp !== '' && !IP_REGEX.test(gatewayIp)) {
      return res.status(400).json({ message: 'Gateway IP must be a valid IP address, e.g. 192.168.1.1' });
    }

    if (alertEmailRecipients !== undefined && alertEmailRecipients.trim() !== '') {
      const invalidEmails = alertEmailRecipients
        .split(',')
        .map((e) => e.trim())
        .filter((e) => e && !EMAIL_REGEX.test(e));

      if (invalidEmails.length > 0) {
        return res.status(400).json({ message: `Invalid email address(es): ${invalidEmails.join(', ')}` });
      }
    }

    if (routerIntegration && routerIntegration.brand !== undefined && !VALID_ROUTER_BRANDS.includes(routerIntegration.brand)) {
      return res.status(400).json({ message: `Router brand must be one of: ${VALID_ROUTER_BRANDS.join(', ')}` });
    }

    let doc = await Settings.findOne({ organizationId });
    const previousNetworkRange = doc ? doc.networkRange : null;
    if (!doc) doc = new Settings({ organizationId });

    if (networkRange !== undefined) doc.networkRange = networkRange;
    if (gatewayIp !== undefined) doc.gatewayIp = gatewayIp;
    if (scanIntervalMinutes !== undefined) doc.scanIntervalMinutes = scanIntervalMinutes;
    if (fastPollSeconds !== undefined) doc.fastPollSeconds = fastPollSeconds;
    if (gatewayCheckSeconds !== undefined) doc.gatewayCheckSeconds = gatewayCheckSeconds;
    if (latencyThresholdMs !== undefined) doc.latencyThresholdMs = latencyThresholdMs;
    if (flapThresholdCount !== undefined) doc.flapThresholdCount = flapThresholdCount;
    if (flapWindowMinutes !== undefined) doc.flapWindowMinutes = flapWindowMinutes;
    if (uptimeSnapshotMinutes !== undefined) doc.uptimeSnapshotMinutes = uptimeSnapshotMinutes;
    if (alertEmailEnabled !== undefined) doc.alertEmailEnabled = alertEmailEnabled;
    if (alertEmailRecipients !== undefined) doc.alertEmailRecipients = alertEmailRecipients;
    if (alertEmailMinSeverity !== undefined) doc.alertEmailMinSeverity = alertEmailMinSeverity;

    if (routerIntegration) {
      if (!doc.routerIntegration) doc.routerIntegration = {};
      if (routerIntegration.brand !== undefined) doc.routerIntegration.brand = routerIntegration.brand;
      if (routerIntegration.apiUrl !== undefined) doc.routerIntegration.apiUrl = routerIntegration.apiUrl;
      if (routerIntegration.apiUsername !== undefined) doc.routerIntegration.apiUsername = routerIntegration.apiUsername;
      if (routerIntegration.siteId !== undefined) doc.routerIntegration.siteId = routerIntegration.siteId;

      // Only overwrite the stored secret if a NEW one was actually provided -
      // an empty string means "leave the existing secret alone", so saving
      // the rest of the form doesn't accidentally wipe the router password.
      if (routerIntegration.apiSecret !== undefined && routerIntegration.apiSecret !== '') {
        doc.routerIntegration.apiSecret = routerIntegration.apiSecret;
      }
    }

    doc.updatedBy = req.user._id;

    await doc.save();
    invalidateCache(organizationId);

    // Optional cleanup: if the network range actually changed AND the
    // admin explicitly opted in, remove THIS organization's devices (and
    // their alerts) that don't belong to the new range.
    let clearedCount = 0;
    const rangeChanged = networkRange !== undefined && previousNetworkRange && networkRange !== previousNetworkRange;

    if (rangeChanged && req.body.clearOldDevices) {
      const orgDevices = await Device.find({ organizationId }, '_id ipAddress');
      const idsToDelete = orgDevices
        .filter((d) => !cidrContains(d.ipAddress, doc.networkRange))
        .map((d) => d._id);

      if (idsToDelete.length > 0) {
        await Alert.deleteMany({ organizationId, device: { $in: idsToDelete } });
        await Device.deleteMany({ organizationId, _id: { $in: idsToDelete } });
        clearedCount = idsToDelete.length;
      }
    }

    const clearedNote = clearedCount > 0 ? ` Cleared ${clearedCount} device(s) from the previous network.` : '';
    res.json({
      settings: doc,
      message: `Settings updated and applied.${clearedNote} Remember to update your Agent's own configuration if the network range changed.`
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update settings', error: error.message });
  }
};

// @desc   Generate (or regenerate) this organization's Agent token. The
//         raw token is returned ONCE - only its hash is ever stored.
//         Regenerating immediately invalidates any previously-issued token.
// @route  POST /api/settings/agent-token
exports.regenerateAgentToken = async (req, res) => {
  try {
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) return res.status(404).json({ message: 'Organization not found' });

    const rawToken = organization.generateAgentToken();
    await organization.save();

    res.json({
      agentToken: rawToken,
      message: 'New agent token generated. Copy it now - it will not be shown again. Update your Agent\'s configuration with this new token.'
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate agent token', error: error.message });
  }
};