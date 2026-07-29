function uptimeBadge(uptimePercent) {
  if (uptimePercent === null || uptimePercent === undefined) {
    return '<span class="text-muted" style="font-size:0.8rem;">No data yet</span>';
  }
  let colorClass = 'badge-authorized'; // green
  if (uptimePercent < 90) colorClass = 'badge-pending'; // amber
  if (uptimePercent < 70) colorClass = 'badge-unauthorized'; // red
  return `<span class="ng-badge ${colorClass}">${uptimePercent}%</span>`;
}

function statusBadge(status) {
  return `<span class="ng-badge badge-${status}">${status}</span>`;
}

function authBadge(auth) {
  return `<span class="ng-badge badge-${auth}">${auth}</span>`;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function buildQuery() {
  const search = document.getElementById('searchInput').value.trim();
  const status = document.getElementById('statusFilter').value;
  const authorization = document.getElementById('authFilter').value;
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (authorization) params.set('authorization', authorization);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function loadDevices() {
  const tbody = document.getElementById('deviceTableBody');
  tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted py-4">Loading devices...</td></tr>';

  try {
    const { devices } = await NetGuardianAPI.getDevices(buildQuery());

    if (!devices.length) {
      tbody.innerHTML = '<tr><td colspan="11"><div class="ng-empty-state">No devices match your filters yet. Run a scan or add one manually.</div></td></tr>';
      return;
    }

    tbody.innerHTML = devices.map((d) => `
      <tr>
        <td>${statusBadge(d.status)}</td>
        <td>${d.ipAddress}</td>
        <td><code style="font-size:0.78rem;">${d.macAddress}</code></td>
        <td>${d.hostname || 'Unknown'}</td>
        <td class="text-muted" style="font-size:0.82rem;">${d.vendor || 'Unknown'}</td>
        <td>${d.deviceType}</td>
        <td>${d.owner || '&mdash;'}</td>
        <td>${authBadge(d.authorization)}</td>
        <td>${uptimeBadge(d.uptimePercent)}</td>
        <td class="text-muted" style="font-size:0.8rem;">${timeAgo(d.lastSeen)}</td>
        <td class="text-end">
          <div class="dropdown">
            <button class="btn btn-sm btn-outline-secondary" data-bs-toggle="dropdown">&#8942;</button>
            <ul class="dropdown-menu dropdown-menu-end">
              ${d.authorization !== 'authorized' ? `<li><a class="dropdown-item" href="#" onclick="authorizeDevice('${d._id}')">Authorize</a></li>` : ''}
              ${d.authorization !== 'blocked' ? `<li><a class="dropdown-item text-danger" href="#" onclick="blockDevice('${d._id}')">Block</a></li>` : ''}
              <li><a class="dropdown-item" href="#" onclick="pingDevice('${d._id}')">Ping Now</a></li>
              <li><a class="dropdown-item text-danger" href="#" onclick="deleteDevice('${d._id}')">Delete</a></li>
            </ul>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-danger text-center py-4">${err.message}</td></tr>`;
  }
}

async function authorizeDevice(id) {
  try {
    const result = await NetGuardianAPI.authorizeDevice(id);
    if (result.enforcement && result.enforcement.enforced === false && result.enforcement.brand !== 'none') {
      alert(`Device authorized, but the network-level unblock via ${result.enforcement.brand} did not succeed (${result.enforcement.error || 'unknown reason'}). You may need to remove the block manually on your router.`);
    }
    loadDevices();
  } catch (err) {
    alert(err.message);
  }
}

async function blockDevice(id) {
  if (!confirm('Block this device? It will be flagged as blocked in the inventory.')) return;
  try {
    const result = await NetGuardianAPI.blockDevice(id);
    if (result.enforcement && !result.enforcement.enforced) {
      alert(`Device marked as blocked in the dashboard. Note: no real network-level block was applied (${result.enforcement.reason || result.enforcement.error || 'no router integration configured'}). Set up a router integration in Settings for real enforcement.`);
    }
    loadDevices();
  } catch (err) {
    alert(err.message);
  }
}

async function pingDevice(id) {
  try { await NetGuardianAPI.pingDevice(id); loadDevices(); }
  catch (err) { alert(err.message); }
}

async function deleteDevice(id) {
  if (!confirm('Permanently remove this device from the inventory?')) return;
  try { await NetGuardianAPI.deleteDevice(id); loadDevices(); }
  catch (err) { alert(err.message); }
}

document.getElementById('filterBtn').addEventListener('click', loadDevices);
document.getElementById('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadDevices(); });

document.getElementById('addDeviceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await NetGuardianAPI.createDevice({
      ipAddress: document.getElementById('d_ip').value,
      macAddress: document.getElementById('d_mac').value,
      hostname: document.getElementById('d_hostname').value,
      deviceType: document.getElementById('d_type').value,
      owner: document.getElementById('d_owner').value
    });
    bootstrap.Modal.getInstance(document.getElementById('addDeviceModal')).hide();
    e.target.reset();
    loadDevices();
  } catch (err) {
    alert(err.message);
  }
});

loadDevices();

// --- Auto-refresh ---
// Same reasoning as the dashboard: the fast poller can detect a new device
// within seconds, so the Devices page should reflect that without a manual
// reload. Pauses while the tab isn't visible. Re-rendering the table does
// close any open row-action dropdown menu - a minor, acceptable trade-off
// for staying current automatically.
const AUTO_REFRESH_MS = 60000;
let devicesRefreshTimer = null;

function startDevicesAutoRefresh() {
  if (devicesRefreshTimer) return;
  devicesRefreshTimer = setInterval(loadDevices, AUTO_REFRESH_MS);
}

function stopDevicesAutoRefresh() {
  if (devicesRefreshTimer) clearInterval(devicesRefreshTimer);
  devicesRefreshTimer = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopDevicesAutoRefresh();
  } else {
    loadDevices();
    startDevicesAutoRefresh();
  }
});

startDevicesAutoRefresh();
