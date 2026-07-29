let currentPage = 1;

const ACTION_LABELS = {
  scan_started: 'Scan Started',
  scan_completed: 'Scan Completed',
  device_added: 'Device Added',
  device_updated: 'Device Updated',
  device_removed: 'Device Removed',
  login: 'Login',
  alert_generated: 'Alert Generated',
  device_blocked: 'Device Blocked',
  device_authorized: 'Device Authorized'
};

const ACTION_BADGE_CLASS = {
  scan_started: 'badge-pending',
  scan_completed: 'badge-authorized',
  device_added: 'badge-authorized',
  device_updated: 'badge-pending',
  device_removed: 'badge-unauthorized',
  login: 'badge-authorized',
  alert_generated: 'badge-severity-high',
  device_blocked: 'badge-blocked',
  device_authorized: 'badge-authorized'
};

function actionBadge(action) {
  const label = ACTION_LABELS[action] || action;
  const cls = ACTION_BADGE_CLASS[action] || 'badge-pending';
  return `<span class="ng-badge ${cls}">${label}</span>`;
}

async function loadLogs() {
  const tbody = document.getElementById('logTableBody');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Loading activity...</td></tr>';

  const action = document.getElementById('actionFilter').value;
  const params = new URLSearchParams({ page: currentPage, limit: 50 });
  if (action) params.set('action', action);

  try {
    const { logs, page, totalPages, total } = await NetGuardianAPI.getLogs(`?${params.toString()}`);

    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="ng-empty-state">No activity recorded yet.</div></td></tr>';
    } else {
      tbody.innerHTML = logs.map((log) => `
        <tr>
          <td>${actionBadge(log.action)}</td>
          <td style="font-size:0.88rem;">${log.details || '&mdash;'}</td>
          <td class="text-muted" style="font-size:0.85rem;">${log.device ? `${log.device.ipAddress} (${log.device.hostname || 'Unknown'})` : '&mdash;'}</td>
          <td class="text-muted" style="font-size:0.85rem;">${log.user ? log.user.name : 'System'}</td>
          <td class="text-muted" style="font-size:0.8rem;">${new Date(log.createdAt).toLocaleString()}</td>
        </tr>
      `).join('');
    }

    document.getElementById('pageInfo').textContent = `Page ${page} of ${totalPages || 1} (${total} total)`;
    document.getElementById('prevPageBtn').disabled = page <= 1;
    document.getElementById('nextPageBtn').disabled = page >= totalPages;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center py-4">${err.message}</td></tr>`;
  }
}

document.getElementById('actionFilter').addEventListener('change', () => {
  currentPage = 1;
  loadLogs();
});

document.getElementById('prevPageBtn').addEventListener('click', () => {
  if (currentPage > 1) { currentPage--; loadLogs(); }
});

document.getElementById('nextPageBtn').addEventListener('click', () => {
  currentPage++;
  loadLogs();
});

loadLogs();
