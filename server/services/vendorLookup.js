const ouiVendors = require('../data/ouiVendors.json');

/**
 * Looks up the manufacturer of a device from its MAC address's OUI
 * (Organizationally Unique Identifier - the first 3 octets).
 *
 * Handles "locally administered" / randomized MAC addresses (common on
 * modern phones for privacy) by detecting the second-least-significant bit
 * of the first octet, which the IEEE 802 spec reserves to mark a MAC as
 * locally assigned rather than tied to a real registered manufacturer.
 */
function lookupVendor(mac) {
  if (!mac) return 'Unknown';

  const normalized = mac.toUpperCase().replace(/-/g, ':');
  const prefix = normalized.split(':').slice(0, 3).join(':');

  if (ouiVendors[prefix]) return ouiVendors[prefix];

  const firstOctet = parseInt(normalized.split(':')[0], 16);
  const isLocallyAdministered = !Number.isNaN(firstOctet) && (firstOctet & 0x02) === 0x02;
  if (isLocallyAdministered) {
    return 'Randomized/Private Address';
  }

  return 'Unknown Vendor';
}

/**
 * Infers a reasonable device type from the vendor name and/or hostname.
 * This is a best-effort heuristic, not a guarantee - a laptop and a phone
 * can share the same vendor (e.g. Apple), so hostname text is checked first
 * since it's the more specific signal when available.
 */
function inferDeviceType(vendor, hostname) {
  const h = (hostname || '').toLowerCase();
  const v = (vendor || '').toLowerCase();

  // Hostname-based hints take priority - they're device-specific, not just brand-specific
  if (/iphone/.test(h)) return 'Phone';
  if (/ipad/.test(h)) return 'Other'; // tablet, no dedicated enum value
  if (/android|galaxy|redmi|pixel-?phone|oneplus/.test(h)) return 'Phone';
  if (/macbook|imac|mac-?pro|mac-?mini/.test(h)) return 'Laptop';
  if (/desktop|-pc\b|workstation/.test(h)) return 'PC';
  if (/laptop|notebook/.test(h)) return 'Laptop';
  if (/printer|print-?server|epson|canon-|brother-/.test(h)) return 'Printer';
  if (/server|nas\b|synology|qnap/.test(h)) return 'Server';

  // Vendor-based fallback - vendors that are strongly, near-exclusively one category
  if (/epson|canon|brother/.test(v)) return 'Printer';
  if (/cisco|ubiquiti|mikrotik|tp-link|netgear|d-link|fortinet|tenda/.test(v)) return 'Router';
  if (/raspberry pi|espressif|sonos/.test(v)) return 'IoT';
  if (/synology|qnap/.test(v)) return 'Server';
  if (/sony playstation|nintendo|microsoft xbox|roku/.test(v)) return 'Other';
  if (/samsung|xiaomi|oppo|vivo|oneplus|motorola/.test(v)) return 'Phone'; // these vendors are mobile-first
  if (/apple/.test(v)) return 'Other'; // could be iPhone/iPad/Mac - genuinely ambiguous without hostname
  if (/dell|hp|lenovo|asus|acer|intel/.test(v)) return 'PC'; // PC/laptop makers default to PC

  return 'Other';
}

module.exports = { lookupVendor, inferDeviceType };
