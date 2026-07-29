const currentUser = getUser();
const isAdmin = currentUser && currentUser.role === 'admin';
let originalNetworkRange = null;

const FIELDS = [
  'networkRange', 'gatewayIp', 'scanIntervalMinutes', 'fastPollSeconds',
  'gatewayCheckSeconds', 'latencyThresholdMs', 'flapThresholdCount',
  'flapWindowMinutes', 'uptimeSnapshotMinutes',
  'alertEmailEnabled', 'alertEmailRecipients', 'alertEmailMinSeverity'
];

function showStatus(message, type = 'success') {
  const box = document.getElementById('statusMsg');
  box.textContent = message;
  box.className = `alert alert-${type}`;
  box.classList.remove('d-none');
}

async function loadSettings() {
  try {
    const { settings, organization } = await NetGuardianAPI.getSettings();
    originalNetworkRange = settings.networkRange;

    if (organization) {
      document.getElementById('orgNameDisplay').textContent = organization.name;
      document.getElementById('agentTokenStatus').textContent = organization.hasAgentToken
        ? 'An agent token has been generated for this organization.'
        : 'No agent token generated yet - click below to create one for your Agent to use.';
 
      const lastSeenEl = document.getElementById('agentLastSeen');
      if (!organization.lastAgentReportAt) {
        lastSeenEl.innerHTML = '<span class="text-muted">Agent status: never reported in yet.</span>';
      } else {
        const lastSeenDate = new Date(organization.lastAgentReportAt);
        const minutesAgo = Math.floor((Date.now() - lastSeenDate.getTime()) / 60000);
        const timeText = minutesAgo < 1 ? 'just now'
          : minutesAgo < 60 ? `${minutesAgo}m ago`
          : `${Math.floor(minutesAgo / 60)}h ago`;
 
        // Anything over 10 minutes without a check-in is treated as stale -
        // generous enough to cover the default 60s interval plus normal
        // network hiccups, without waiting so long that a genuinely down
        // Agent goes unnoticed for hours.
        if (minutesAgo > 10) {
          lastSeenEl.innerHTML = `<span class="text-danger">&#9888;&#65039; Agent last reported ${timeText} - it may be offline or disconnected. Check that it's still running.</span>`;
        } else {
          lastSeenEl.innerHTML = `<span class="text-success">Agent last reported ${timeText}.</span>`;
        }
      }
    }

    FIELDS.forEach((field) => {
      const el = document.getElementById(field);
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = !!settings[field];
      } else {
        el.value = settings[field] ?? '';
      }
    });

    if (settings.routerIntegration) {
      document.getElementById('routerBrand').value = settings.routerIntegration.brand || 'none';
      document.getElementById('routerApiUrl').value = settings.routerIntegration.apiUrl || '';
      document.getElementById('routerSiteId').value = settings.routerIntegration.siteId || '';
      document.getElementById('routerApiUsername').value = settings.routerIntegration.apiUsername || '';
      // apiSecret is intentionally never populated back into the field -
      // it's write-only from the UI's perspective, same principle as never
      // re-displaying a password.
    }
  } catch (err) {
    showStatus(err.message, 'danger');
  }

  if (!isAdmin) {
    document.getElementById('readOnlyNotice').classList.remove('d-none');
    document.querySelectorAll('#settingsForm input, #settingsForm select').forEach((el) => { el.disabled = true; });
    document.getElementById('saveBtn').classList.add('d-none');
    document.getElementById('generateAgentTokenBtn').disabled = true;
    document.getElementById('downloadAgentBtn').disabled = true;
    document.getElementById('routerBrand').disabled = true;
    document.getElementById('routerApiUrl').disabled = true;
    document.getElementById('routerSiteId').disabled = true;
    document.getElementById('routerApiUsername').disabled = true;
    document.getElementById('routerApiSecret').disabled = true;
  }
}

document.getElementById('generateAgentTokenBtn').addEventListener('click', async () => {
  const confirmed = confirm(
    'Generate a new agent token? Your Agent will stop working until you update its .env file with this new token.'
  );
  if (!confirmed) return;

  const btn = document.getElementById('generateAgentTokenBtn');
  btn.disabled = true;
  btn.textContent = 'Generating...';

  try {
    const result = await NetGuardianAPI.regenerateAgentToken();
    const box = document.getElementById('newAgentTokenBox');
    box.innerHTML = `<strong>New agent token (copy now, shown only once):</strong><br><code>${result.agentToken}</code>`;
    box.classList.remove('d-none');
    document.getElementById('agentTokenStatus').textContent = 'An agent token has been generated for this organization.';
  } catch (err) {
    showStatus(err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate New Agent Token';
  }
});

document.getElementById('downloadAgentBtn').addEventListener('click', async () => {
  const confirmed = confirm(
    'Download the Agent? This generates a brand-new agent token and invalidates any previous one - if an Agent is already running, replace it with this download.'
  );
  if (!confirmed) return;

  const btn = document.getElementById('downloadAgentBtn');
  btn.disabled = true;
  btn.textContent = 'Preparing download...';

  try {
    const blob = await NetGuardianAPI.downloadAgentZip();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'netguardian-agent.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    document.getElementById('agentTokenStatus').textContent =
      'An agent token has been generated for this organization (already configured in the downloaded Agent).';
    document.getElementById('newAgentTokenBox').classList.add('d-none');
  } catch (err) {
    showStatus(err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = '\u2b07\ufe0f Download Agent';
  }
});

// Show the "clear old devices" option only when the network range field
// actually differs from what was loaded - it's meaningless otherwise.
document.getElementById('networkRange').addEventListener('input', (e) => {
  const changed = originalNetworkRange && e.target.value.trim() !== originalNetworkRange;
  document.getElementById('clearOldDevicesWrap').classList.toggle('d-none', !changed);
  if (!changed) document.getElementById('clearOldDevices').checked = false;
});

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const clearOldDevices = document.getElementById('clearOldDevices').checked;
  if (clearOldDevices) {
    const confirmed = confirm(
      'This will permanently delete devices (and their alerts) that don\'t belong to the new network range. This cannot be undone. Continue?'
    );
    if (!confirmed) return;
  }

  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const payload = { clearOldDevices };
    FIELDS.forEach((field) => {
      const el = document.getElementById(field);
      if (!el) return;
      if (el.type === 'checkbox') {
        payload[field] = el.checked;
      } else if (el.type === 'number') {
        payload[field] = Number(el.value);
      } else {
        payload[field] = el.value;
      }
    });

    payload.routerIntegration = {
      brand: document.getElementById('routerBrand').value,
      apiUrl: document.getElementById('routerApiUrl').value.trim(),
      siteId: document.getElementById('routerSiteId').value.trim(),
      apiUsername: document.getElementById('routerApiUsername').value.trim(),
      apiSecret: document.getElementById('routerApiSecret').value // left blank = keep existing, handled server-side
    };

    const result = await NetGuardianAPI.updateSettings(payload);
    showStatus(result.message || 'Settings saved.', 'success');
    originalNetworkRange = payload.networkRange;
    document.getElementById('clearOldDevicesWrap').classList.add('d-none');
    document.getElementById('clearOldDevices').checked = false;
  } catch (err) {
    showStatus(err.message, 'danger');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Settings';
  }
});

loadSettings();