/**
 * Discovery Service
 * ------------------
 * Responsible for finding devices on the local network.
 *
 * Two strategies are used together:
 *  1. Ping sweep  - actively probes every host in the configured CIDR range
 *                   so the OS ARP cache gets populated and offline hosts are
 *                   confirmed unreachable.
 *  2. ARP table read - reads the OS-level ARP cache (arp -a / ip neigh) to
 *                   collect IP <-> MAC pairings without needing raw sockets
 *                   or extra native dependencies.
 *
 * For deeper scans (open ports, OS fingerprinting, service detection) the
 * scanNmap() function shells out to the `nmap` binary if it is installed on
 * the host machine. This is optional - the core discovery flow works with
 * just Node.js + the OS network stack, which keeps deployment simple on
 * platforms like Render that may not have nmap preinstalled.
 */

const { exec } = require('child_process');
const util = require('util');
const os = require('os');
const ping = require('ping');
const execAsync = util.promisify(exec);

/**
 * Expands a CIDR (e.g. 192.168.1.0/24) into a list of host IP strings.
 * Supports /24, /25, /26, /27, /28, /29, /30 style small-to-medium subnets,
 * which covers the vast majority of school/small-business LANs.
 */
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
  // Skip network address (first) and broadcast address (last) for subnets smaller than /31
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

/**
 * Pings every host in the range concurrently (capped batches) so the local
 * ARP cache is populated. Returns the list of IPs that responded.
 *
 * Reliability notes:
 *  - Windows spawns a real `ping.exe` process per probe. Firing too many at
 *    once (the old default was 20) can cause some genuinely-alive hosts to
 *    time out simply because the OS/CPU is busy juggling that many child
 *    processes at the same moment - NOT because the host didn't respond.
 *    A smaller batch size and a slightly longer per-host timeout fixes this.
 *  - We also do TWO full passes and merge the results (union), since a
 *    single sweep can still miss a device that was momentarily slow,
 *    asleep, or mid-DHCP-renewal.
 */
async function pingSweep(cidr, { batchSize = 10, timeoutSeconds = 2, passes = 2 } = {}) {
  const ips = expandCidr(cidr);
  const aliveMap = new Map(); // ip -> timeMs, deduplicated across passes

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

/**
 * Reads the OS ARP/neighbor table and returns { ip, mac } pairs.
 * Works on Linux (ip neigh / arp -a), macOS (arp -a), and Windows (arp -a).
 */
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

/**
 * Converts a dotted IPv4 string to its 32-bit integer representation.
 */
function ipToInt(ip) {
  const [a, b, c, d] = ip.split('.').map(Number);
  return ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;
}

/**
 * Checks whether a given IP falls inside a CIDR range.
 */
function cidrContains(ip, cidr) {
  const [base, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipToInt(ip) & mask) >>> 0 === (ipToInt(base) & mask) >>> 0;
}

/**
 * FAST, ping-free poll: just reads whatever the OS ARP/neighbor table
 * already knows about right now, filtered to the configured range(s).
 *
 * This is what makes near-instant detection possible. When a device joins
 * a network, its OS typically broadcasts a gratuitous ARP announcement
 * (and/or its DHCP traffic triggers ARP exchanges) that every other host on
 * the same network segment passively observes and caches - including the
 * machine running NetGuardian. So reading the ARP table every few seconds
 * catches new devices almost as soon as they join, without needing to
 * actively ping all 254 addresses first.
 *
 * Trade-off: a device that joins and then generates zero network traffic
 * at all for an extended period may not appear until the next full ping
 * sweep. In practice this is rare for a device someone is actually using.
 */
async function quickArpPoll(rangeInput) {
  const ranges = parseNetworkRanges(rangeInput);
  const arpEntries = await readArpTable();
  return arpEntries.filter((e) => ranges.some((cidr) => cidrContains(e.ip, cidr)));
}

/**
 * Full discovery pass for a SINGLE CIDR: ping sweep + ARP table read, merged
 * into a normalized device list ready to be upserted into MongoDB.
 *
 * A device only makes it into the final list if BOTH a ping response AND a
 * matching ARP entry exist. Since the ping sweep can still occasionally miss
 * a genuinely-alive host (see notes in pingSweep), any IP that shows up in
 * the ARP table but wasn't marked alive gets one direct, longer-timeout
 * retry ping before being dropped - this recovers devices like a slow phone
 * or a laptop waking from sleep mid-sweep.
 */
async function discoverDevicesInRange(cidr) {
  const aliveHosts = await pingSweep(cidr);
  const arpEntries = await readArpTable();

  const arpByIp = new Map(arpEntries.map((e) => [e.ip, e.mac]));
  const aliveByIp = new Map(aliveHosts.map((h) => [h.ip, h.timeMs]));

  // Recover devices the sweep missed but the ARP table clearly knows about.
  const missedButInArp = arpEntries
    .map((e) => e.ip)
    .filter((ip) => !aliveByIp.has(ip));

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
    if (!mac) continue; // couldn't resolve a MAC, skip - likely stale/unreachable
    discovered.push({
      ipAddress: ip,
      macAddress: mac,
      lastResponseTimeMs: timeMs,
      lastSeen: new Date()
    });
  }

  return discovered;
}

/**
 * Parses a NETWORK_RANGE env value into a clean list of CIDR strings.
 * Supports a single CIDR ("192.168.1.0/24") or a comma-separated list
 * ("192.168.1.0/24,192.168.2.0/24,10.0.5.0/28"). Whitespace around commas
 * is trimmed automatically.
 */
function parseNetworkRanges(rangeString) {
  return (rangeString || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
}

/**
 * Full discovery pass across ONE OR MORE CIDR ranges. Scans each range in
 * turn and merges the results into a single de-duplicated device list.
 * Accepts either a single CIDR string or a comma-separated list of them.
 */
async function discoverDevices(rangeInput) {
  const ranges = parseNetworkRanges(rangeInput);
  if (ranges.length === 0) {
    throw new Error('No valid CIDR ranges found in NETWORK_RANGE');
  }

  const allResults = [];
  const seenMacs = new Set();

  for (const cidr of ranges) {
    const results = await discoverDevicesInRange(cidr);
    for (const device of results) {
      // A device could theoretically respond on more than one range if
      // ranges overlap/misconfigured - keep the first sighting only.
      if (!seenMacs.has(device.macAddress)) {
        seenMacs.add(device.macAddress);
        allResults.push(device);
      }
    }
  }

  return allResults;
}

/**
 * Optional deeper scan using the `nmap` binary if installed on the host.
 * Falls back gracefully with a clear error if nmap is unavailable so the
 * rest of the app keeps working without it.
 */
async function scanNmap(cidr) {
  try {
    const { stdout } = await execAsync(`nmap -sn ${cidr} -oG -`);
    const devices = [];
    stdout.split('\n').forEach((line) => {
      if (line.startsWith('Host:')) {
        const ipMatch = line.match(/Host:\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
        const hostnameMatch = line.match(/\((.*?)\)/);
        if (ipMatch) {
          devices.push({
            ipAddress: ipMatch[1],
            hostname: hostnameMatch && hostnameMatch[1] ? hostnameMatch[1] : 'Unknown'
          });
        }
      }
    });
    return devices;
  } catch (error) {
    throw new Error(
      `nmap scan failed - is nmap installed on this host? (${error.message})`
    );
  }
}

/** Single-host status check, used by the monitoring service. */
async function checkHost(ip) {
  const result = await ping.promise.probe(ip, { timeout: 2 });
  return { alive: result.alive, timeMs: typeof result.time === 'number' ? result.time : null };
}

module.exports = {
  expandCidr,
  pingSweep,
  readArpTable,
  discoverDevices,
  quickArpPoll,
  cidrContains,
  scanNmap,
  checkHost
};
