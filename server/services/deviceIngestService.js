const Device = require('../models/Device');
const { lookupVendor, inferDeviceType } = require('./vendorLookup');
const { resolveHostname, guessOwnerFromHostname } = require('./hostnameLookup');
const { recordStatusFlap, checkIpConflict } = require('./suspiciousActivityService');
const { openAlert, resolveAlerts } = require('./alertRulesService');
const { checkLatencyHealth } = require('./networkHealthService');
const Log = require('../models/Log');

/**
 * Processes a batch of discovered devices for ONE organization - creating
 * new device records (with vendor/hostname/type enrichment), updating
 * existing ones, running suspicious-activity checks, and marking any
 * previously-known device that's missing from this batch as offline.
 *
 * This is the shared core used by the standalone Agent's report endpoint.
 * Pulling it out of the old cron-based scan path means the exact same
 * upsert/alert logic applies whether a device was found by an agent
 * running at a customer's site, or (for local dev/testing) an internal
 * scan - no duplicated logic between the two paths.
 */
async function ingestDiscoveredDevices(organizationId, discoveredDevices, mdnsMap = new Map()) {
  const seenIps = new Set(discoveredDevices.map((d) => d.ipAddress));
  let created = 0;
  let updated = 0;

  for (const found of discoveredDevices) {
    const existing = await Device.findOne({ organizationId, macAddress: found.macAddress });

    if (!existing) {
      const vendor = lookupVendor(found.macAddress);
      const mdnsName = mdnsMap.get(found.ipAddress);
      const hostname = mdnsName || found.hostname || (await resolveHostname(found.ipAddress).catch(() => 'Unknown'));
      const deviceType = inferDeviceType(vendor, hostname);
      const ownerGuess = guessOwnerFromHostname(hostname);

      const newDevice = await Device.create({
        organizationId,
        ipAddress: found.ipAddress,
        macAddress: found.macAddress,
        hostname,
        vendor,
        deviceType,
        owner: ownerGuess || '',
        status: 'online',
        authorization: 'pending',
        lastResponseTimeMs: found.lastResponseTimeMs ?? null,
        lastSeen: new Date(),
        firstSeen: new Date()
      });
      created++;

      await checkIpConflict(found.ipAddress, found.macAddress, newDevice._id, organizationId);

      await openAlert({
        organizationId,
        type: 'unknown_device',
        severity: 'high',
        message: `New unrecognized device joined the network: ${found.ipAddress} (${found.macAddress})`,
        device: newDevice._id
      });

      await Log.create({
        organizationId,
        action: 'alert_generated',
        details: `Unknown device alert for ${found.ipAddress}`,
        device: newDevice._id
      });
    } else {
      const wasOffline = existing.status === 'offline';

      if (existing.ipAddress !== found.ipAddress) {
        await checkIpConflict(found.ipAddress, found.macAddress, existing._id, organizationId);
      }

      existing.ipAddress = found.ipAddress;
      existing.status = 'online';
      existing.lastSeen = new Date();
      existing.lastResponseTimeMs = found.lastResponseTimeMs ?? existing.lastResponseTimeMs;

      if (!existing.vendor || existing.vendor === 'Unknown') {
        existing.vendor = lookupVendor(existing.macAddress);
      }
      if (!existing.hostname || existing.hostname === 'Unknown') {
        const mdnsName = mdnsMap.get(existing.ipAddress);
        existing.hostname = mdnsName || found.hostname || (await resolveHostname(existing.ipAddress).catch(() => 'Unknown'));
      }
      if (!existing.deviceType || existing.deviceType === 'Other') {
        existing.deviceType = inferDeviceType(existing.vendor, existing.hostname);
      }
      if (!existing.owner) {
        const ownerGuess = guessOwnerFromHostname(existing.hostname);
        if (ownerGuess) existing.owner = ownerGuess;
      }

      await existing.save();
      updated++;

      if (wasOffline) {
        await recordStatusFlap(existing, organizationId);
        await resolveAlerts({ organizationId, type: 'device_offline', device: existing._id });
      }
    }
  }

  // Mark any known device in THIS organization that wasn't in this batch as offline
  const knownDevices = await Device.find({ organizationId });
  for (const device of knownDevices) {
    if (!seenIps.has(device.ipAddress) && device.status === 'online') {
      device.status = 'offline';
      await device.save();
      await recordStatusFlap(device, organizationId);

      await openAlert({
        organizationId,
        type: 'device_offline',
        severity: 'medium',
        message: `Device went offline: ${device.hostname || device.ipAddress}`,
        device: device._id
      });
    }
  }

  await checkLatencyHealth(organizationId, discoveredDevices);

  return { created, updated, total: discoveredDevices.length };
}

module.exports = { ingestDiscoveredDevices };
