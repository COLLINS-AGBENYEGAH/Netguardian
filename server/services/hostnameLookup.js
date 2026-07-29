const dns = require('dns');
const { exec } = require('child_process');
const util = require('util');
const os = require('os');
const mdns = require('multicast-dns');

const dnsReverse = util.promisify(dns.reverse);
const execAsync = util.promisify(exec);

// Common service types that Apple devices, Chromecasts, printers, and
// smart-home gear advertise themselves under via mDNS/Bonjour. Querying
// these prompts devices to announce their real, human-chosen name (e.g.
// "Kingsley's iPhone") - something reverse DNS and NetBIOS can't get at all
// for most non-Windows devices.
const MDNS_SERVICE_TYPES = [
  '_airplay._tcp.local',
  '_companion-link._tcp.local',
  '_homekit._tcp.local',
  '_googlecast._tcp.local',
  '_spotify-connect._tcp.local',
  '_ipp._tcp.local',
  '_ipps._tcp.local',
  '_printer._tcp.local',
  '_smb._tcp.local',
  '_device-info._tcp.local',
  '_workstation._tcp.local',
  '_ssh._tcp.local',
  '_services._dns-sd._udp.local'
];

/**
 * Listens for mDNS/Bonjour announcements across the whole network for a
 * fixed window and builds an IP -> friendly-name map from any `.local` A
 * records devices announce for themselves. This is a ONE-TIME network-wide
 * listen, not a per-device query - mDNS is inherently broadcast-based, so a
 * single ~4 second window picks up every device on the segment that's
 * currently announcing itself, which is far more efficient than asking
 * each of 254 IPs individually.
 *
 * Best run once per full scan cycle, not on every fast-poll tick (a 4s
 * listen every 3 seconds would be wasteful and could still miss overlap).
 */
async function buildMdnsHostnameMap(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const ipToName = new Map();
    let instance;

    try {
      instance = mdns();
    } catch (error) {
      // mDNS socket setup can fail in restricted/sandboxed environments -
      // fail soft and just return an empty map rather than crashing a scan
      console.error('[mDNS] Could not start mDNS listener:', error.message);
      resolve(ipToName);
      return;
    }

    instance.on('response', (response) => {
      const records = [...(response.answers || []), ...(response.additionals || [])];
      records.forEach((record) => {
        if (record.type === 'A' && record.data && record.name) {
          const friendlyName = record.name.replace(/\.local$/i, '');
          ipToName.set(record.data, friendlyName);
        }
      });
    });

    instance.on('error', (error) => {
      console.error('[mDNS] Listener error:', error.message);
    });

    MDNS_SERVICE_TYPES.forEach((serviceType) => {
      try {
        instance.query(serviceType, 'PTR');
      } catch {
        // ignore individual query failures, keep listening for others
      }
    });

    setTimeout(() => {
      instance.destroy();
      resolve(ipToName);
    }, timeoutMs);
  });
}

/**
 * Attempts to resolve a device's hostname from its IP address.
 *
 * Tries two methods, in order:
 *  1. Reverse DNS (PTR record) - works if the router's DHCP server registers
 *     device names with a local DNS resolver (many consumer routers do this
 *     automatically for devices that send a DHCP hostname option).
 *  2. NetBIOS name query via `nbtstat -A <ip>` (Windows only) - catches
 *     Windows machines that don't show up via reverse DNS but still
 *     broadcast a NetBIOS name on the local network.
 *
 * Returns 'Unknown' if neither method resolves a name within the timeout,
 * which is expected for many phones/IoT devices that don't broadcast one.
 */
async function resolveHostname(ip) {
  // Method 1: reverse DNS
  try {
    const names = await Promise.race([
      dnsReverse(ip),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DNS timeout')), 1500))
    ]);
    if (names && names.length > 0 && names[0]) {
      // Strip trailing domain suffix noise some routers add, keep it readable
      return names[0].replace(/\.$/, '');
    }
  } catch {
    // fall through to NetBIOS
  }

  // Method 2: NetBIOS (Windows only - nbtstat isn't available on Linux/Mac hosts)
  if (os.platform() === 'win32') {
    try {
      const { stdout } = await execAsync(`nbtstat -A ${ip}`, { timeout: 2000 });
      // Look for a line like: "MYLAPTOP        <00>  UNIQUE      Registered"
      const match = stdout.match(/^\s*([A-Za-z0-9_-]+)\s+<00>\s+UNIQUE/m);
      if (match && match[1]) return match[1].trim();
    } catch {
      // no NetBIOS name available either
    }
  }

  return 'Unknown';
}

/**
 * Best-effort guess at a device's owner from a possessive-style hostname,
 * e.g. "Kingsley's iPhone" or "Kingsleys-MacBook-Pro" -> "Kingsley".
 * This is a HEURISTIC, not authoritative data - there is no network
 * protocol that reports which human owns a device. It only works when a
 * device happens to be named that way (common for Apple devices found via
 * mDNS), and should never overwrite an owner the admin already set
 * manually.
 */
function guessOwnerFromHostname(hostname) {
  if (!hostname || hostname === 'Unknown') return null;

  // Matches "Kingsley's iPhone", "Kingsleys iPhone", "Kingsley-s-MacBook-Pro", "Kingsleys-MacBook"
  const match = hostname.match(/^([A-Za-z]+)(?:'s|s|-s)[\s-]/);
  if (match && match[1] && match[1].length > 1) {
    return match[1];
  }
  return null;
}

module.exports = { resolveHostname, buildMdnsHostnameMap, guessOwnerFromHostname };
