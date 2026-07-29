function severityBadge(sev) {
  return `<span class="ng-badge badge-severity-${sev}">${sev}</span>`;
}

const DEFAULT_NETWORK_RANGE = '192.168.1.0/24';
const BANNER_DISMISS_KEY = 'ng_default_network_banner_dismissed';

/**
 * Shows a warning banner if the network range is still the generic
 * out-of-the-box default - catches exactly the "forgot to configure this
 * before going live" mistake in the UI itself, rather than relying on
 * someone reading a README step. Dismissible for the current session only
 * (sessionStorage) so it doesn't nag on every click, but reappears next
 * login until it's actually fixed.
 */
async function checkDefaultNetworkBanner() {
  const banner = document.getElementById('defaultNetworkBanner');
  if (!banner) return;

  if (sessionStorage.getItem(BANNER_DISMISS_KEY)) return;

  try {
    const { settings } = await NetGuardianAPI.getSettings();
    if (settings.networkRange === DEFAULT_NETWORK_RANGE) {
      banner.classList.remove('d-none');
    }
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('dismissNetworkBanner')?.addEventListener('click', () => {
  sessionStorage.setItem(BANNER_DISMISS_KEY, 'true');
  document.getElementById('defaultNetworkBanner').classList.add('d-none');
});

async function loadDashboard() {
  try {
    const summary = await NetGuardianAPI.getSummary();
    document.getElementById('statTotal').textContent = summary.totalDevices;
    document.getElementById('statOnline').textContent = summary.activeDevices;
    document.getElementById('statOffline').textContent = summary.offlineDevices;
    document.getElementById('statAlerts').textContent = summary.unresolvedAlerts;

    renderTypeChart(summary.deviceTypeBreakdown);
  } catch (err) {
    console.error(err);
  }

  try {
    const { trend } = await NetGuardianAPI.getTrends(7);
    renderTrendChart(trend);
  } catch (err) {
    console.error(err);
  }

  try {
    const { alerts } = await NetGuardianAPI.getAlerts('?resolved=false');
    const container = document.getElementById('recentAlerts');
    if (!alerts.length) {
      container.innerHTML = '<div class="ng-empty-state">No unresolved alerts. Your network looks quiet.</div>';
      return;
    }
    container.innerHTML = alerts.slice(0, 6).map((a) => `
      <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
        <div>
          <div style="font-size:0.9rem;">${a.message}</div>
          <div class="text-muted" style="font-size:0.75rem;">${new Date(a.createdAt).toLocaleString()}</div>
        </div>
        ${severityBadge(a.severity)}
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('scanBtn').addEventListener('click', async () => {
  const btn = document.getElementById('scanBtn');
  const msg = document.getElementById('scanMsg');
  btn.disabled = true;
  btn.textContent = 'Scanning...';
  try {
    const result = await NetGuardianAPI.triggerScan();
    msg.textContent = result.message;
    msg.classList.remove('d-none');
    setTimeout(() => {
      msg.classList.add('d-none');
      loadDashboard();
      btn.disabled = false;
      btn.textContent = '🔄 Scan Network Now';
    }, 180000); // full /24 scans can take 2-3 minutes; the backend also guards against overlapping scans regardless
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.remove('d-none');
    btn.disabled = false;
    btn.textContent = '🔄 Scan Network Now';
  }
});

loadDashboard();
checkDefaultNetworkBanner();

// --- Auto-refresh ---
// Keeps the dashboard current without needing a manual reload - the fast
// poller on the backend can detect a new device within seconds, but that's
// pointless if nobody sees it until they happen to refresh the page.
// Pauses while the tab isn't visible so it's not making API calls into the
// void when nobody's actually looking at it.
const AUTO_REFRESH_MS = 15000;
let dashboardRefreshTimer = null;

function startDashboardAutoRefresh() {
  if (dashboardRefreshTimer) return;
  dashboardRefreshTimer = setInterval(loadDashboard, AUTO_REFRESH_MS);
}

function stopDashboardAutoRefresh() {
  if (dashboardRefreshTimer) clearInterval(dashboardRefreshTimer);
  dashboardRefreshTimer = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopDashboardAutoRefresh();
  } else {
    loadDashboard(); // catch up immediately on returning to the tab
    startDashboardAutoRefresh();
  }
});

startDashboardAutoRefresh();
