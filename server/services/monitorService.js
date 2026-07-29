const { checkHost } = require('./discoveryService');
const { recordStatusFlap } = require('./suspiciousActivityService');
const { openAlert, resolveAlerts } = require('./alertRulesService');

/**
 * NOTE ON ARCHITECTURE (multi-tenant):
 * -------------------------------------
 * This file used to run a global, always-on network scan schedule
 * (ping-sweeping one hardcoded NETWORK_RANGE, on a cron). That only made
 * sense when this backend served a single organization co-located on its
 * own network. Now that multiple organizations share one deployment, the
 * central backend can no longer physically scan any of their networks -
 * each organization runs its own standalone Agent (see /agent) on its own
 * premises, which does the actual discovery and reports results to
 * POST /api/agent/report.
 *
 * What's left here is just pingDevice() - a manual, on-demand re-check of
 * ONE specific device's liveness, triggered from the dashboard's "Ping Now"
 * action. It only succeeds if this backend can actually reach that IP,
 * which in practice means it's most useful for whichever organization
 * happens to be running the backend on their own network - for a fully
 * remote organization, it will simply fail to reach the address, which is
 * an honest, expected outcome, not a bug.
 */

/** Quick single-device liveness re-check, used by the "ping now" API endpoint. */
async function pingDevice(device, organizationId) {
  const result = await checkHost(device.ipAddress);
  const wasOnline = device.status === 'online';

  device.status = result.alive ? 'online' : 'offline';
  device.lastResponseTimeMs = result.timeMs;
  if (result.alive) device.lastSeen = new Date();
  await device.save();

  if (wasOnline !== (device.status === 'online')) {
    await recordStatusFlap(device, organizationId);
  }

  if (wasOnline && !result.alive) {
    await openAlert({
      organizationId,
      type: 'device_offline',
      severity: 'medium',
      message: `Device went offline: ${device.hostname || device.ipAddress}`,
      device: device._id
    });
  } else if (!wasOnline && result.alive) {
    await resolveAlerts({ organizationId, type: 'device_offline', device: device._id });
  }

  return device;
}

module.exports = { pingDevice };
