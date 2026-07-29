/**
 * MikroTik Adapter
 * ----------------
 * Talks to a MikroTik RouterOS device's REST API (available on newer
 * RouterOS versions) to add/remove a MAC-based bridge filter rule.
 *
 * NOT YET IMPLEMENTED - this is a stub. Fill in the real API calls once
 * you have a MikroTik device to test against. Generally involves:
 *   1. Basic auth (username/password) against the router's REST API
 *   2. PUT/PATCH to /rest/interface/bridge/filter with a drop rule
 *      matching the target MAC address
 *
 * Config expected on `settings.routerIntegration`:
 *   apiUrl      - e.g. https://192.168.1.1
 *   apiUsername - router login username
 *   apiSecret   - router login password
 */

async function block(settings, macAddress) {
  // TODO: implement real MikroTik REST API call
  throw new Error('MikroTik integration not yet implemented');
}

async function unblock(settings, macAddress) {
  // TODO: implement real MikroTik REST API call
  throw new Error('MikroTik integration not yet implemented');
}

module.exports = { block, unblock };