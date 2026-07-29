const archiver = require('archiver');
const path = require('path');
const { ingestDiscoveredDevices } = require('../services/deviceIngestService');
const { reportGatewayStatus } = require('../services/networkHealthService');
const Log = require('../models/Log');
const Organization = require('../models/Organization');
const Settings = require('../models/Settings');

// @desc   Receive a batch of discovered devices (and optional gateway
//         status) from an organization's own standalone Agent, running on
//         their physical network. This is the ONLY way device data gets
//         into this system for any organization other than whichever one
//         happens to be co-located with this backend.
// @route  POST /api/agent/report
// @access Agent token (not a user login)
exports.report = async (req, res) => {
  try {
    const organizationId = req.organization._id;
    const { devices, gateway } = req.body;

    if (!Array.isArray(devices)) {
      return res.status(400).json({ message: '"devices" must be an array' });
    }

    const validDevices = devices.filter((d) => d && d.ipAddress && d.macAddress);

    const result = await ingestDiscoveredDevices(organizationId, validDevices);

    if (gateway && gateway.ip) {
      await reportGatewayStatus(organizationId, gateway.ip, !!gateway.alive);
    }

    // Record that this organization's Agent is alive and checking in -
    // lets the dashboard show "Agent last seen: X ago" and warn if it's
    // gone quiet (crashed, computer turned off, network issue, etc).
    req.organization.lastAgentReportAt = new Date();
    await req.organization.save();

    await Log.create({
      organizationId,
      action: 'scan_completed',
      details: `Agent report: ${validDevices.length} devices (${result.created} new, ${result.updated} updated)`
    });

    res.json({
      message: 'Report processed',
      ...result
    });
  } catch (error) {
    console.error('[Agent Report] Failed to process report:', error);
    res.status(500).json({ message: 'Failed to process agent report', error: error.message });
  }
};

// @desc   Lets a running Agent fetch its organization's CURRENT network
//         settings (networkRange, gatewayIp) from the dashboard, instead
//         of relying only on whatever was baked into its local .env at
//         download time. Called once per scan cycle so that changes made
//         on the Settings page take effect automatically, without needing
//         to redownload or restart the Agent.
// @route  GET /api/agent/config
// @access Agent token (not a user login)
exports.getConfig = async (req, res) => {
  try {
    const organizationId = req.organization._id;
    const settings = await Settings.findOne({ organizationId });

    if (!settings) {
      return res.status(404).json({ message: 'Settings not found for this organization' });
    }

    res.json({
      networkRange: settings.networkRange,
      gatewayIp: settings.gatewayIp || ''
    });
  } catch (error) {
    console.error('[Agent Config] Failed to fetch config:', error);
    res.status(500).json({ message: 'Failed to fetch agent config', error: error.message });
  }
};

// @desc   Regenerate this organization's agent token and download a
//         ready-to-run zip of the Agent, pre-configured with that token.
//         NOTE: this invalidates any previously issued agent token - any
//         agent currently running with the old token will stop
//         authenticating until it's replaced with the new download.
// @route  GET /api/agent/download
// @access Private (logged-in user)
exports.downloadAgent = async (req, res) => {
  try {
    const organization = await Organization.findById(req.user.organizationId);

    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    // Regenerate - this invalidates any previously issued token.
    const rawToken = organization.generateAgentToken();
    await organization.save();

    // Pull this organization's current Settings so the downloaded Agent
    // starts with the RIGHT network range instead of a generic placeholder
    // (it'll also keep this up to date live via /api/agent/config).
    const settings = await Settings.findOne({ organizationId: organization._id });
    const networkRange = settings ? settings.networkRange : '192.168.1.0/24';
    const gatewayIp = settings ? settings.gatewayIp || '' : '';

    const publicApiUrl = process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`;

    const envContents = [
      `API_URL=${publicApiUrl}`,
      `AGENT_TOKEN=${rawToken}`,
      `NETWORK_RANGE=${networkRange}`,
      `GATEWAY_IP=${gatewayIp}`,
      `SCAN_INTERVAL_SECONDS=60`
    ].join('\n');

    res.attachment('netguardian-agent.zip');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('[Agent Download] Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to build agent archive' });
      }
    });

    archive.pipe(res);

    const agentDir = path.join(__dirname, '..', '..', 'agent');

    // Add every file in agent/ except node_modules and any existing .env
    archive.glob('**/*', {
      cwd: agentDir,
      ignore: ['node_modules/**', '.env']
    });

    // Add the pre-filled .env, configured with this organization's fresh
    // token and their current Settings.
    archive.append(envContents, { name: '.env' });

    await archive.finalize();
  } catch (error) {
    console.error('[Agent Download] Failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate agent download', error: error.message });
    }
  }
};