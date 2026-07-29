/**
 * UniFi Adapter (real implementation)
 * -----------------------------------
 * Talks to a UniFi controller's local API to block/unblock a device by
 * MAC address. Auto-detects which of the two UniFi architectures it's
 * talking to, since they use different login endpoints and URL prefixes:
 *
 *   - Legacy / self-hosted Network Application (e.g. Cloud Key, or
 *     software controller on a PC) - login at POST /api/login, port 8443
 *   - UniFi OS Console (UDM, UDM-Pro, UCG-Max, etc.) - login at
 *     POST /api/auth/login, port 443, and every API call must be
 *     prefixed with /proxy/network
 *
 * Config expected on `settings.routerIntegration`:
 *   apiUrl      - e.g. https://192.168.1.1 (UniFi OS, port 443) or
 *                 https://192.168.1.1:8443 (legacy controller)
 *   apiUsername - a LOCAL admin account on the controller (not a
 *                 ui.com cloud account - those require MFA and will
 *                 not work for automated login)
 *   apiSecret   - that local admin account's password
 *   siteId      - usually "default" unless multiple sites exist
 *
 * Uses Node's built-in https module directly (not fetch) so we have
 * control over rejectUnauthorized - UniFi controllers on a local network
 * almost always use a self-signed certificate.
 */

const https = require('https');

function request({ hostname, port, path, method, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        port,
        path,
        method,
        headers,
        rejectUnauthorized: false // local controllers typically use self-signed certs
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function parseUrl(apiUrl) {
  const url = new URL(apiUrl);
  return {
    hostname: url.hostname,
    port: url.port || 443
  };
}

/** Extracts the cookie(s) needed for follow-up requests from a Set-Cookie header array. */
function extractCookie(setCookieHeaders) {
  if (!setCookieHeaders) return '';
  const arr = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return arr.map((c) => c.split(';')[0]).join('; ');
}

/** Logs in, auto-detecting UniFi OS vs legacy controller. Returns
 * { cookie, csrfToken, apiPrefix } needed for subsequent calls. */
async function login(settings) {
  const { apiUrl, apiUsername, apiSecret } = settings.routerIntegration || {};
  if (!apiUrl || !apiUsername || !apiSecret) {
    throw new Error('UniFi integration is not fully configured (apiUrl, apiUsername, apiSecret required)');
  }

  const { hostname, port } = parseUrl(apiUrl);
  const credentials = JSON.stringify({ username: apiUsername, password: apiSecret });
  const baseHeaders = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(credentials)
  };

  // Try UniFi OS Console style first (POST /api/auth/login)
  const osAttempt = await request({
    hostname,
    port,
    path: '/api/auth/login',
    method: 'POST',
    headers: baseHeaders,
    body: credentials
  });

  if (osAttempt.statusCode === 200) {
    return {
      cookie: extractCookie(osAttempt.headers['set-cookie']),
      csrfToken: osAttempt.headers['x-csrf-token'] || osAttempt.headers['x-updated-csrf-token'] || '',
      apiPrefix: '/proxy/network',
      hostname,
      port
    };
  }

  // Fall back to legacy self-hosted controller (POST /api/login)
  const legacyAttempt = await request({
    hostname,
    port,
    path: '/api/login',
    method: 'POST',
    headers: baseHeaders,
    body: credentials
  });

  if (legacyAttempt.statusCode === 200) {
    return {
      cookie: extractCookie(legacyAttempt.headers['set-cookie']),
      csrfToken: '',
      apiPrefix: '',
      hostname,
      port
    };
  }

  throw new Error(
    `UniFi login failed on both endpoint styles (UniFi OS: ${osAttempt.statusCode}, legacy: ${legacyAttempt.statusCode}). ` +
    'Check apiUrl, apiUsername, and apiSecret - and make sure apiUsername is a LOCAL admin account, not a ui.com cloud login.'
  );
}

async function sendCommand(settings, cmd, macAddress) {
  const session = await login(settings);
  const site = settings.routerIntegration.siteId || 'default';
  const path = `${session.apiPrefix}/api/s/${site}/cmd/stamgr`;

  const payload = JSON.stringify({ cmd, mac: macAddress.toLowerCase() });
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    Cookie: session.cookie
  };
  if (session.csrfToken) headers['X-CSRF-Token'] = session.csrfToken;

  const res = await request({
    hostname: session.hostname,
    port: session.port,
    path,
    method: 'POST',
    headers,
    body: payload
  });

  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    parsed = {};
  }

  if (res.statusCode !== 200 || (parsed.meta && parsed.meta.rc !== 'ok')) {
    throw new Error(
      `UniFi ${cmd} failed (status ${res.statusCode}): ${parsed.meta ? parsed.meta.msg : res.body}`
    );
  }

  return { enforced: true };
}

async function block(settings, macAddress) {
  return sendCommand(settings, 'block-sta', macAddress);
}

async function unblock(settings, macAddress) {
  return sendCommand(settings, 'unblock-sta', macAddress);
}

module.exports = { block, unblock };