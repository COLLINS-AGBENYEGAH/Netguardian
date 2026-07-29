const Device = require('../models/Device');

// This is now a single global background job covering ALL organizations'
// devices at once (each device already knows its own organizationId, so
// no per-org filtering is needed in the loop itself). The snapshot
// interval is a system-wide constant rather than a per-organization
// setting now that this deployment can host many organizations -
// letting one organization's preference control a shared background job
// wouldn't make sense once there's more than one.
const SNAPSHOT_MINUTES = parseInt(process.env.UPTIME_SNAPSHOT_MINUTES, 10) || 1;

// Caps how much time a single tick can attribute to one bucket, so a long
// server outage (e.g. the host machine was off overnight) doesn't get
// misattributed entirely to whatever status a device had on restart.
const MAX_SNAPSHOT_GAP_MS = SNAPSHOT_MINUTES * 60 * 1000 * 5;

let snapshotTimer = null;

/**
 * Runs on a fixed interval and, for every known device across every
 * organization, adds the elapsed time since its last snapshot to either
 * its online or offline running total, based on its CURRENT status at the
 * time of the snapshot.
 */
async function takeUptimeSnapshot() {
  const now = Date.now();

  try {
    const devices = await Device.find({}, '_id status lastUptimeSnapshotAt totalOnlineMs totalOfflineMs');

    for (const device of devices) {
      const lastSnapshot = device.lastUptimeSnapshotAt ? new Date(device.lastUptimeSnapshotAt).getTime() : now;
      const elapsed = Math.min(now - lastSnapshot, MAX_SNAPSHOT_GAP_MS);

      if (device.status === 'online') {
        device.totalOnlineMs = (device.totalOnlineMs || 0) + elapsed;
      } else {
        device.totalOfflineMs = (device.totalOfflineMs || 0) + elapsed;
      }
      device.lastUptimeSnapshotAt = new Date(now);
      await device.save();
    }
  } catch (error) {
    console.error('[Uptime] Snapshot failed:', error.message);
  }
}

/** Computes a 0-100 uptime percentage for a single device document. */
function computeUptimePercent(device) {
  const total = (device.totalOnlineMs || 0) + (device.totalOfflineMs || 0);
  if (total === 0) return null; // no tracking data yet
  return Math.round((device.totalOnlineMs / total) * 1000) / 10; // one decimal place
}

function startUptimeTracking() {
  if (snapshotTimer) clearInterval(snapshotTimer);
  snapshotTimer = setInterval(takeUptimeSnapshot, SNAPSHOT_MINUTES * 60 * 1000);
  console.log(`[Uptime] Tracking device uptime (all organizations) with a snapshot every ${SNAPSHOT_MINUTES} minute(s)`);
}

function stopUptimeTracking() {
  if (snapshotTimer) clearInterval(snapshotTimer);
  snapshotTimer = null;
}

module.exports = {
  startUptimeTracking,
  stopUptimeTracking,
  computeUptimePercent,
  takeUptimeSnapshot
};
