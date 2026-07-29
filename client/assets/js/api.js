/**
 * NetGuardian API client
 * Set API_BASE_URL to your Render backend URL once deployed.
 */
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:5000/api'
  : 'https://api.netguardiancollins.me/';

function getToken() {
  return localStorage.getItem('ng_token');
}

function setSession(token, user) {
  localStorage.setItem('ng_token', token);
  localStorage.setItem('ng_user', JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem('ng_token');
  localStorage.removeItem('ng_user');
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('ng_user'));
  } catch {
    return null;
  }
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = 'index.html';
  }
}

async function apiRequest(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    clearSession();
    window.location.href = 'index.html';
    return Promise.reject(new Error('Session expired'));
  }

  if (!res.ok) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }

  return data;
}

const NetGuardianAPI = {
  login: (email, password) => apiRequest('/auth/login', { method: 'POST', body: { email, password } }),
  register: (name, organizationName, email, password) => apiRequest('/auth/register', { method: 'POST', body: { name, organizationName, email, password } }),
  me: () => apiRequest('/auth/me'),
  forgotPassword: (email) => apiRequest('/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (email, token, password) => apiRequest('/auth/reset-password', { method: 'POST', body: { email, token, password } }),

  getDevices: (params = '') => apiRequest(`/devices${params}`),
  getDevice: (id) => apiRequest(`/devices/${id}`),
  createDevice: (payload) => apiRequest('/devices', { method: 'POST', body: payload }),
  updateDevice: (id, payload) => apiRequest(`/devices/${id}`, { method: 'PUT', body: payload }),
  deleteDevice: (id) => apiRequest(`/devices/${id}`, { method: 'DELETE' }),
  authorizeDevice: (id) => apiRequest(`/devices/${id}/authorize`, { method: 'PATCH' }),
  blockDevice: (id) => apiRequest(`/devices/${id}/block`, { method: 'PATCH' }),

  triggerScan: () => apiRequest('/monitor/scan', { method: 'POST' }),
  pingDevice: (id) => apiRequest(`/monitor/ping/${id}`, { method: 'POST' }),

  getAlerts: (params = '') => apiRequest(`/alerts${params}`),
  resolveAlert: (id) => apiRequest(`/alerts/${id}/resolve`, { method: 'PATCH' }),

  getSummary: () => apiRequest('/analytics/summary'),
  getTrends: (days = 7) => apiRequest(`/analytics/trends?days=${days}`),

  getReports: () => apiRequest('/reports'),
  downloadReportUrl: (id) => `${API_BASE_URL}/reports/${id}/download`,
  downloadReportCsvUrl: (id) => `${API_BASE_URL}/reports/${id}/download-csv`,

  getSettings: () => apiRequest('/settings'),
  updateSettings: (payload) => apiRequest('/settings', { method: 'PUT', body: payload }),
  regenerateAgentToken: () => apiRequest('/settings/agent-token', { method: 'POST' }),

  getLogs: (params = '') => apiRequest(`/logs${params}`),
  generateDeviceReport: () => apiRequest('/reports/device', { method: 'POST' }),
  generateSecurityReport: () => apiRequest('/reports/security', { method: 'POST' }),
  generatePerformanceReport: () => apiRequest('/reports/performance', { method: 'POST' }),
  downloadAgentZip: () => downloadAgentZip(),
};
// Add this function above the NetGuardianAPI object in api.js:

async function downloadAgentZip() {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/agent/download`, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (res.status === 401) {
    clearSession();
    window.location.href = 'index.html';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Download failed (${res.status})`);
  }

  return res.blob();
}

// Then add this one line inside the NetGuardianAPI object, anywhere
// alongside regenerateAgentToken:
//
//   downloadAgentZip: () => downloadAgentZip(),
