const Settings = require('../models/Settings');

// Cache keyed by organizationId (a Map, not a single value) - now that
// multiple organizations share this deployment, each needs its own cached
// settings, not one global cache overwriting everyone else's.
const cache = new Map(); // organizationId (string) -> { settings, expiresAt }
const CACHE_TTL_MS = 10000; // 10s - keeps the 3-second fast poller from hitting the DB every tick

function envDefaults() {
  return {
    networkRange: process.env.NETWORK_RANGE || '192.168.1.0/24',
    gatewayIp: process.env.GATEWAY_IP || '',
    scanIntervalMinutes: parseInt(process.env.SCAN_INTERVAL_MINUTES, 10) || 5,
    fastPollSeconds: parseInt(process.env.FAST_POLL_SECONDS, 10) || 3,
    gatewayCheckSeconds: parseInt(process.env.GATEWAY_CHECK_SECONDS, 10) || 60,
    latencyThresholdMs: parseInt(process.env.LATENCY_THRESHOLD_MS, 10) || 150,
    flapThresholdCount: parseInt(process.env.FLAP_THRESHOLD_COUNT, 10) || 4,
    flapWindowMinutes: parseInt(process.env.FLAP_WINDOW_MINUTES, 10) || 15,
    uptimeSnapshotMinutes: parseInt(process.env.UPTIME_SNAPSHOT_MINUTES, 10) || 1,
    alertEmailEnabled: process.env.ALERT_EMAIL_ENABLED === 'true',
    alertEmailRecipients: process.env.ALERT_EMAIL_RECIPIENTS || '',
    alertEmailMinSeverity: process.env.ALERT_EMAIL_MIN_SEVERITY || 'high'
  };
}

/**
 * Returns the current settings document FOR A SPECIFIC ORGANIZATION,
 * seeding one from .env defaults the very first time that organization is
 * seen (so the very first organization on a fresh deployment keeps working
 * exactly like the old single-tenant version until someone changes
 * settings through the UI). Cached briefly per-organization since this
 * gets called on every fast-poll tick.
 */
async function getSettings(organizationId, forceRefresh = false) {
  if (!organizationId) {
    throw new Error('getSettings() requires an organizationId - settings are no longer global');
  }

  const key = String(organizationId);
  const now = Date.now();
  const cached = cache.get(key);

  if (!forceRefresh && cached && now < cached.expiresAt) {
    return cached.settings;
  }

  let doc = await Settings.findOne({ organizationId });
  if (!doc) {
    doc = await Settings.create({ organizationId, ...envDefaults() });
    console.log(`[Settings] No settings found for organization ${key} - seeded defaults`);
  }

  const settings = doc.toObject();
  cache.set(key, { settings, expiresAt: now + CACHE_TTL_MS });
  return settings;
}

/** Call after any settings update so the next read reflects the change immediately. */
function invalidateCache(organizationId) {
  if (organizationId) {
    cache.delete(String(organizationId));
  } else {
    cache.clear();
  }
}

module.exports = { getSettings, invalidateCache };
