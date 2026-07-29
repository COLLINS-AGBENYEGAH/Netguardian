/**
 * Device Blocking Service
 * -----------------------
 * Single entry point the rest of the app calls to actually enforce a
 * block/unblock at the network level. Looks up which router brand (if
 * any) the organization has configured, and dispatches to the matching
 * adapter - callers never need to know which brand is involved.
 *
 * Each adapter exposes the same two functions: block(settings, mac) and
 * unblock(settings, mac). Add a new brand by writing one more adapter
 * file with that same shape, then registering it in the ADAPTERS map
 * below - nothing else in the app needs to change.
 */

const Settings = require('../models/Settings');

const unifiAdapter = require('./routerAdapters/unifiAdapter');
const mikrotikAdapter = require('./routerAdapters/mikrotikAdapter');
const fortigateAdapter = require('./routerAdapters/fortigateAdapter');
const noneAdapter = require('./routerAdapters/noneAdapter');

const ADAPTERS = {
  none: noneAdapter,
  unifi: unifiAdapter,
  mikrotik: mikrotikAdapter,
  fortigate: fortigateAdapter
};

async function blockDeviceOnRouter(organizationId, macAddress) {
  const settings = await Settings.findOne({ organizationId });
  const brand = settings?.routerIntegration?.brand || 'none';
  const adapter = ADAPTERS[brand] || noneAdapter;

  try {
    const result = await adapter.block(settings, macAddress);
    return { brand, ...result };
  } catch (error) {
    console.error(`[Device Blocking] ${brand} block failed for ${macAddress}:`, error.message);
    return { brand, enforced: false, error: error.message };
  }
}

async function unblockDeviceOnRouter(organizationId, macAddress) {
  const settings = await Settings.findOne({ organizationId });
  const brand = settings?.routerIntegration?.brand || 'none';
  const adapter = ADAPTERS[brand] || noneAdapter;

  try {
    const result = await adapter.unblock(settings, macAddress);
    return { brand, ...result };
  } catch (error) {
    console.error(`[Device Blocking] ${brand} unblock failed for ${macAddress}:`, error.message);
    return { brand, enforced: false, error: error.message };
  }
}

module.exports = { blockDeviceOnRouter, unblockDeviceOnRouter };