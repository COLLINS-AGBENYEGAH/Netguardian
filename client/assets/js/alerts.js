function severityBadge(sev) {
  return `<span class="ng-badge badge-severity-${sev}">${sev}</span>`;
}

async function loadAlerts() {
  const container = document.getElementById('alertsList');
  const resolved = document.getElementById('alertFilter').value;
  const qs = resolved ? `?resolved=${resolved}` : '';

  container.innerHTML = '<div class="text-center text-muted py-4">Loading alerts...</div>';

  try {
    const { alerts } = await NetGuardianAPI.getAlerts(qs);

    if (!alerts.length) {
      container.innerHTML = '<div class="ng-card"><div class="ng-empty-state">No alerts to show.</div></div>';
      return;
    }

    container.innerHTML = alerts.map((a) => `
      <div class="ng-card mb-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <div class="d-flex align-items-center gap-2 mb-1">
            ${severityBadge(a.severity)}
            <span class="text-muted" style="font-size:0.78rem; text-transform:capitalize;">${a.type.replace(/_/g, ' ')}</span>
          </div>
          <div style="font-size:0.92rem;">${a.message}</div>
          <div class="text-muted" style="font-size:0.75rem;">${new Date(a.createdAt).toLocaleString()}${a.device ? ` &middot; ${a.device.ipAddress}` : ''}</div>
        </div>
        ${a.isResolved
          ? '<span class="ng-badge badge-authorized">resolved</span>'
          : `<button class="btn btn-sm btn-outline-secondary" onclick="resolveAlert('${a._id}')">Mark Resolved</button>`}
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="ng-card text-danger">${err.message}</div>`;
  }
}

async function resolveAlert(id) {
  try { await NetGuardianAPI.resolveAlert(id); loadAlerts(); }
  catch (err) { alert(err.message); }
}

document.getElementById('alertFilter').addEventListener('change', loadAlerts);

loadAlerts();
