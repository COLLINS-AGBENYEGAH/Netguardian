const Device = require('../models/Device');
const { openAlert } = require('./alertRulesService');
const { getSettings } = require('./settingsService');

/**
 * Rapid connect/disconnect cycling detection.
 * ---------------------------------------------
 * Call this every time a device's status actually flips (online<->offline).
 * If a device flips status enough times within the configured rolling
 * window, it's treated as suspicious - this pattern is unusual for normal
 * device behavior and can indicate a flaky connection being abused, a
 * spoofed device intermittently impersonating another, or a device being
 * repeatedly and deliberately reconnected to evade monitoring.
 *
 * One alert is raised per window (not on every single flip past the
 * threshold) to avoid flooding the Alerts page.
 */
async function recordStatusFlap(device, organizationId) {
  const settings = await getSettings(organizationId);
  const flapThresholdCount = settings.flapThresholdCount;
  const flapWindowMinutes = settings.flapWindowMinutes;

  const now = new Date();
  const windowStart = device.statusFlapWindowStart || now;
  const windowAgeMinutes = (now.getTime() - new Date(windowStart).getTime()) / 60000;

  if (windowAgeMinutes > flapWindowMinutes) {
    // window expired, start a fresh one
    device.statusFlapCount = 1;
    device.statusFlapWindowStart = now;
    await device.save();
    return;
  }

  device.statusFlapCount = (device.statusFlapCount || 0) + 1;

  if (device.statusFlapCount === flapThresholdCount) {
    // Only fire exactly at the threshold, not on every subsequent flip in the same window
    await openAlert({
      organizationId,
      type: 'suspicious_activity',
      severity: 'high',
      message: `Rapid connect/disconnect cycling detected: ${device.hostname || device.ipAddress} has changed status ${device.statusFlapCount} times in the last ${flapWindowMinutes} minutes`,
      device: device._id
    });
  }

  await device.save();
}

/**
 * IP/MAC conflict detection (a classic sign of ARP spoofing or a duplicate
 * IP assignment). Scoped to a single organization - two DIFFERENT
 * organizations' networks can coincidentally use the same private IP
 * range without that being a real conflict, so this only checks within
 * one organization's own devices.
 */
async function checkIpConflict(ip, mac, deviceId, organizationId) {
  const conflicting = await Device.findOne({
    organizationId,
    ipAddress: ip,
    macAddress: { $ne: mac },
    status: 'online'
  });

  if (conflicting) {
    await openAlert({
      organizationId,
      type: 'suspicious_activity',
      severity: 'critical',
      message: `IP address conflict detected: ${ip} is claimed by two different MAC addresses (${mac} and ${conflicting.macAddress}) at the same time - possible ARP spoofing or duplicate IP assignment`,
      device: deviceId
    });
    return true;
  }

  return false;
}

module.exports = { recordStatusFlap, checkIpConflict };
