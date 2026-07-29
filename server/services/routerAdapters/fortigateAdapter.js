/**
 * FortiGate Adapter
 * -----------------
 * Talks to a FortiGate firewall's REST API to add/remove a MAC address
 * from a firewall address-group used in a blocking policy.
 *
 * NOT YET IMPLEMENTED - this is a stub. Fill in the real API calls once
 * you have a FortiGate to test against. Generally involves:
 *   1. API token auth (Bearer token, generated in FortiGate admin)
 *   2. POST/DELETE to /api/v2/cmdb/firewall/address with a MAC-based
 *      address object, referenced by a deny policy
 *
 * Config expected on `settings.routerIntegration`:
 *   apiUrl    - e.g. https://192.168.1.1
 *   apiSecret - API token
 */

async function block(settings, macAddress) {
  // TODO: implement real FortiGate REST API call
  throw new Error('FortiGate integration not yet implemented');
}

async function unblock(settings, macAddress) {
  // TODO: implement real FortiGate REST API call
  throw new Error('FortiGate integration not yet implemented');
}

module.exports = { block, unblock };