/**
 * NetGuardian Agent
 * ------------------
 * A standalone, self-contained program - deliberately separate from the
 * main NetGuardian server - that you run on YOUR OWN network. It does the
 * actual device discovery (ping sweep + ARP table read + hostname lookup)
 * locally, then reports what it finds to your NetGuardian dashboard's API.
 *
 * This exists because the central NetGuardian backend (wherever it's
 * hosted) can never physically scan a network it isn't connected to - only
 * something running ON your network can see your network's devices, AND
 * only something on your network can resolve hostnames via reverse DNS or
 * NetBIOS (both are meaningless from a cloud server's perspective, since
 * private IPs and local broadcast protocols don't extend to the internet).
 *
 * Network range and gateway IP are fetched live from the dashboard's
 * Settings each scan cycle - so changing them on the Settings page takes
 * effect automatically, without needing to edit .env or restart the
 * Agent. The .env values below are only used as a fallback for the very
 * first cycle, in case the live fetch fails.
 *
 * Usage:
 *   1. Copy .env.example to .env and fill in your values
 *   2. npm install
 *   3. npm start   (or: node agent.js)
 */
require('dotenv').config();
const { exec } = require('child_process');
const util = require('util');
const os = require('os');
const dns = require('dns');
const ping = require('ping');

const execAsync = util.promisify(exec);
const dnsReverse = util.promisify(dns.reverse);

const API_URL = (process.env.API_URL || 'http://localhost:5000').replace(/\/$/, '');
const AGENT_TOKEN = process.env.AGENT_TOKEN;
const SCAN_INTERVAL_SECONDS = parseInt(process.env.SCAN_INTERVAL_SECONDS, 10) || 60;

// These are mutable - updated live from the dashboard's Settings each
// cycle via fetchRemoteConfig(). The .env values are just the starting
// fallback in case the very first fetch fails before any config is known.
let NETWORK_RANGE = process.env.NETWORK_RANGE || '192.168.1.0/24';
let GATEWAY_IP = process.env.GATEWAY_IP || '';

if (!AGENT_TOKEN) {
  console.error('[Agent] ERROR: AGENT_TOKEN is not set in .env - get this from your NetGuardian Settings page.');
  process.exit(1);
}

/** Fetches this organization's current networkRange/gatewayIp from the
 * dashboard's Settings, so changes made there take effect automatically.
 * On failure, silently keeps using whatever values are already in memory
 * (either from .env on the first run, or the last successful fetch). */
async function fetchRemoteConfig() {
  try {
    const res = await fetch(`${API_URL}/api/agent/config`, {
      headers: { 'X-Agent-Token': AGENT_TOKEN }
    });

    if (!res.ok) {
      console.warn(`[Agent] Could not fetch remote config (status ${res.status}) - using last known settings`);
      return;
    }

    const data = await res.json();
    if (data.networkRange && data.networkRange !== NETWORK_RANGE) {
      console.log(`[Agent] Network range updated from dashboard: ${data.networkRange}`);
      NETWORK_RANGE = data.networkRange;
    }
    if (typeof data.gatewayIp === 'string' && data.gatewayIp !== GATEWAY_IP) {
      console.log(`[Agent] Gateway IP updated from dashboard: ${data.gatewayIp || '(none)'}`);
      GATEWAY_IP = data.gatewayIp;
    }
  } catch (error) {
    console.warn('[Agent] Failed to reach dashboard for config - using last known settings:', error.message);
  }
}

/** Expands a CIDR range into a list of host IP strings. */
function expandCidr(cidr) {
  const [base, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  if (Number.isNaN(prefix) || prefix < 16 || prefix > 30) {
    throw new Error('NETWORK_RANGE must be a CIDR between /16 and /30, e.g. 192.168.1.0/24');
  }

  const octets = base.split('.').map(Number);
  const baseInt = (octets[0] << 24) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
  const hostBits = 32 - prefix;
  const totalHosts = Math.pow(2, hostBits);

  const ips = [];
  const start = hostBits > 1 ? 1 : 0;
  const end = hostBits > 1 ? totalHosts - 1 : totalHosts;

  for (let i = start; i < end; i++) {
    const ipInt = baseInt + i;
    const ip = [
      (ipInt >>> 24) & 255,
      (ipInt >>> 16) & 255,
      (ipInt >>> 8) & 255,
      ipInt & 255
    ].join('.');
    ips.push(ip);
  }
  return ips;
}

/** Pings every host in the range in small batches, two passes, to catch slow/missed devices. */
async function pingSweep(cidr, { batchSize = 10, timeoutSeconds = 2, passes = 2 } = {}) {
  const ips = expandCidr(cidr);
  const aliveMap = new Map();

  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((ip) =>
          ping.promise.probe(ip, { timeout: timeoutSeconds }).catch(() => ({ alive: false, host: ip }))
        )
      );
      results.forEach((r) => {
        if (r.alive && !aliveMap.has(r.host)) {
          aliveMap.set(r.host, typeof r.time === 'number' ? r.time : null);
        }
      });
    }
  }

  return Array.from(aliveMap.entries()).map(([ip, timeMs]) => ({ ip, timeMs }));
}

/** Reads the OS ARP/neighbor table and returns { ip, mac } pairs. */
async function readArpTable() {
  const platform = os.platform();
  let command = 'arp -a';
  if (platform === 'linux') {
    command = 'ip neigh show || arp -a';
  }

  const { stdout } = await execAsync(command);
  const entries = [];

  const ipv4Regex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/;
  const macRegex = /([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}/;

  stdout.split('\n').forEach((line) => {
    const ipMatch = line.match(ipv4Regex);
    const macMatch = line.match(macRegex);
    if (ipMatch && macMatch) {
      entries.push({
        ip: ipMatch[1],
        mac: macMatch[0].toUpperCase().replace(/-/g, ':')
      });
    }
  });

  return entries;
}

/** Single-host liveness check, used for the optional gateway ping. */
async function checkHost(ip) {
  const result = await ping.promise.probe(ip, { timeout: 2 });
  return { alive: result.alive };
}

/**
 * Attempts to resolve a device's hostname from its IP address, using
 * whatever the local network actually supports - this only works when
 * run from something physically on the network (which is exactly what
 * the Agent is, unlike the central backend). Tries two methods:
 *   1. Reverse DNS (PTR record) - works if the router's DHCP server
 *      registers device names with a local DNS resolver.
 *   2. NetBIOS name query via `nbtstat -A <ip>` (Windows only) - catches
 *      Windows machines that don't show up via reverse DNS.
 * Returns null if neither resolves - the backend will show 'Unknown' for
 * those, which is expected for many phones/IoT devices.
 */
async function resolveHostname(ip) {
  try {
    const names = await Promise.race([
      dnsReverse(ip),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DNS timeout')), 1500))
    ]);
    if (names && names.length > 0 && names[0]) {
      return names[0].replace(/\.$/, '');
    }
  } catch {
    // fall through to NetBIOS
  }

  if (os.platform() === 'win32') {
    try {
      const { stdout } = await execAsync(`nbtstat -A ${ip}`, { timeout: 2000 });
      const match = stdout.match(/^\s*([A-Za-z0-9_-]+)\s+<00>\s+UNIQUE/m);
      if (match && match[1]) return match[1].trim();
    } catch {
      // no NetBIOS name available either
    }
  }

  return null;
}

/** Resolves hostnames for a batch of devices, a few at a time, so we don't
 * fire off dozens of concurrent DNS/nbtstat calls at once. */
async function resolveHostnamesForDevices(devices, batchSize = 8) {
  for (let i = 0; i < devices.length; i += batchSize) {
    const batch = devices.slice(i, i + batchSize);
    const names = await Promise.all(batch.map((d) => resolveHostname(d.ipAddress)));
    names.forEach((name, idx) => {
      if (name) batch[idx].hostname = name;
    });
  }
  return devices;
}

/** Full discovery pass: ping sweep + ARP read, merged, with a retry for anything ARP knows but ping missed. */
async function discoverDevices(cidr) {
  const aliveHosts = await pingSweep(cidr);
  const arpEntries = await readArpTable();

  const arpByIp = new Map(arpEntries.map((e) => [e.ip, e.mac]));
  const aliveByIp = new Map(aliveHosts.map((h) => [h.ip, h.timeMs]));

  const missedButInArp = arpEntries.map((e) => e.ip).filter((ip) => !aliveByIp.has(ip));

  if (missedButInArp.length > 0) {
    const retryResults = await Promise.all(
      missedButInArp.map((ip) =>
        ping.promise.probe(ip, { timeout: 3 }).catch(() => ({ alive: false, host: ip }))
      )
    );
    retryResults.forEach((r) => {
      if (r.alive) aliveByIp.set(r.host, typeof r.time === 'number' ? r.time : null);
    });
  }

  const discovered = [];
  for (const [ip, timeMs] of aliveByIp.entries()) {
    const mac = arpByIp.get(ip);
    if (!mac) continue;
    discovered.push({ ipAddress: ip, macAddress: mac, lastResponseTimeMs: timeMs });
  }

  await resolveHostnamesForDevices(discovered);

  return discovered;
}

/** Sends the discovered devices (and optional gateway status) to the central NetGuardian API. */
async function sendReport(devices, gatewayStatus) {
  const body = { devices };
  if (GATEWAY_IP) {
    body.gateway = { ip: GATEWAY_IP, alive: gatewayStatus };
  }

  const res = await fetch(`${API_URL}/api/agent/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Token': AGENT_TOKEN
    },
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const detail = data.error ? ` (${data.error})` : '';
    throw new Error((data.message || `Report failed with status ${res.status}`) + detail);
  }

  return data;
}

/** One full scan-and-report cycle. Guarded against overlap - if a scan is
 * still running when the next interval fires, the new one is skipped
 * rather than piling up concurrent ping sweeps of the same network. */
let cycleInProgress = false;

async function runCycle() {
  if (cycleInProgress) {
    console.log('[Agent] Skipped - previous scan still in progress');
    return;
  }
  cycleInProgress = true;

  // Pick up any Settings changes made on the dashboard before this cycle's
  // scan starts, so NETWORK_RANGE/GATEWAY_IP are always current.
  await fetchRemoteConfig();

  const startedAt = Date.now();
  console.log(`[Agent] Scanning ${NETWORK_RANGE}...`);

  try {
    const devices = await discoverDevices(NETWORK_RANGE);
    const namedCount = devices.filter((d) => d.hostname).length;
    console.log(`[Agent] Found ${devices.length} device(s) in ${Date.now() - startedAt}ms (${namedCount} with a resolved hostname)`);

    let gatewayStatus;
    if (GATEWAY_IP) {
      const result = await checkHost(GATEWAY_IP);
      gatewayStatus = result.alive;
      console.log(`[Agent] Gateway ${GATEWAY_IP}: ${gatewayStatus ? 'reachable' : 'UNREACHABLE'}`);
    }

    const result = await sendReport(devices, gatewayStatus);
    console.log(`[Agent] Report sent: ${result.created} new, ${result.updated} updated`);
  } catch (error) {
    console.error('[Agent] Cycle failed:', error.message);
  } finally {
    cycleInProgress = false;
  }
}

console.log('=== NetGuardian Agent ===');
console.log(`Reporting to: ${API_URL}`);
console.log(`Scanning: ${NETWORK_RANGE} (will sync with dashboard Settings each cycle)`);
console.log(`Interval: every ${SCAN_INTERVAL_SECONDS}s`);
if (GATEWAY_IP) console.log(`Watching gateway: ${GATEWAY_IP}`);
console.log('');

runCycle();
setInterval(runCycle, SCAN_INTERVAL_SECONDS * 1000);

process.on('unhandledRejection', (reason) => {
  console.error('[Agent] Unhandled error (continuing):', reason && reason.message ? reason.message : reason);
});