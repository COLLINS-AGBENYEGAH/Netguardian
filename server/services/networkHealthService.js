const { openAlert, resolveAlerts } = require('./alertRulesService');
const { getSettings } = require('./settingsService');

// Tracks per-organization gateway down/up state, keyed by organizationId,
// so we only alert on actual transitions (not every single check) - same
// idea as before, just no longer a single global boolean now that many
// organizations share this deployment.
const gatewayDownState = new Map();

/**
 * Called by the Agent report handler with the gateway status IT observed
 * locally. The central backend can no longer ping each organization's
 * gateway itself (it doesn't physically sit on their network) - so gateway
 * health is now something each organization's own Agent checks and
 * reports, the same way it reports discovered devices.
 */
async function reportGatewayStatus(organizationId, gatewayIp, isAlive) {
  if (!gatewayIp) return; // this organization hasn't configured a gateway to watch

  const key = String(organizationId);
  const wasDown = gatewayDownState.get(key) || false;

  if (!isAlive && !wasDown) {
    gatewayDownState.set(key, true);
    console.log(`[NetworkHealth] Org ${key}: gateway ${gatewayIp} reported unreachable`);
    await openAlert({
      organizationId,
      type: 'network_issue',
      severity: 'critical',
      message: `Network gateway (${gatewayIp}) is unreachable. Internet/network access may be down for the whole site.`,
      dedupeKey: 'gateway_down'
    });
  } else if (isAlive && wasDown) {
    gatewayDownState.set(key, false);
    console.log(`[NetworkHealth] Org ${key}: gateway ${gatewayIp} back up`);
    await resolveAlerts({ organizationId, type: 'network_issue', dedupeKey: 'gateway_down' });
  }
}

/**
 * Called after processing a batch of discovered devices for one
 * organization. If the average response time across all responsive
 * devices exceeds that organization's configured latencyThresholdMs,
 * opens a network_issue alert (or updates the existing open one). Once
 * latency drops back under the threshold, the alert is automatically
 * resolved.
 */
async function checkLatencyHealth(organizationId, discoveredDevices) {
  const withLatency = discoveredDevices.filter((d) => typeof d.lastResponseTimeMs === 'number');
  if (withLatency.length === 0) return;

  const settings = await getSettings(organizationId);
  const latencyThresholdMs = settings.latencyThresholdMs;
  const avgMs = withLatency.reduce((sum, d) => sum + d.lastResponseTimeMs, 0) / withLatency.length;

  if (avgMs > latencyThresholdMs) {
    await openAlert({
      organizationId,
      type: 'network_issue',
      severity: 'medium',
      message: `High average network latency detected: ${Math.round(avgMs)}ms across ${withLatency.length} devices (threshold: ${latencyThresholdMs}ms)`,
      dedupeKey: 'high_latency'
    });
  } else {
    await resolveAlerts({ organizationId, type: 'network_issue', dedupeKey: 'high_latency' });
  }
}

module.exports = { reportGatewayStatus, checkLatencyHealth };
