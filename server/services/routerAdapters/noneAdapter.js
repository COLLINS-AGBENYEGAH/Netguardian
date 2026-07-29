/**
 * None Adapter
 * ------------
 * Used when an organization hasn't configured any router integration
 * yet. Doesn't attempt any real blocking - just makes that explicit,
 * so the caller can fall back to a database-only status change and
 * tell the admin real enforcement isn't active.
 */

async function block(settings, macAddress) {
  return { enforced: false, reason: 'No router integration configured for this organization' };
}

async function unblock(settings, macAddress) {
  return { enforced: false, reason: 'No router integration configured for this organization' };
}

module.exports = { block, unblock };