/**
 * Converts a Report document into a CSV string. No external dependency
 * needed - CSV is simple enough to build directly, and this keeps the
 * project's dependency list smaller.
 */
function toCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Quote and escape any value containing a comma, quote, or newline
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function rowsToCsv(rows) {
  return rows.map((row) => row.map(toCsvValue).join(',')).join('\r\n');
}

function generateDeviceReportCsv(summary) {
  const rows = [['IP Address', 'MAC Address', 'Hostname', 'Type', 'Status', 'Authorization', 'Last Seen']];
  (summary.devices || []).forEach((d) => {
    rows.push([d.ip, d.mac, d.hostname, d.type, d.status, d.authorization, d.lastSeen]);
  });
  return rowsToCsv(rows);
}

function generateSecurityReportCsv(summary) {
  const rows = [['IP Address', 'MAC Address', 'Authorization', 'Last Seen']];
  (summary.suspiciousDevices || []).forEach((d) => {
    rows.push([d.ip, d.mac, d.authorization, d.lastSeen]);
  });
  return rowsToCsv(rows);
}

function generatePerformanceReportCsv(summary) {
  const rows = [
    ['Metric', 'Value'],
    ['Devices Monitored', summary.totalDevicesMonitored ?? 0],
    ['Average Response Time (ms)', summary.averageResponseTimeMs ?? 0],
    ['Recent Scans Logged', summary.recentScans ?? 0],
    ['Offline Rate (%)', summary.offlineRate ?? 0]
  ];
  return rowsToCsv(rows);
}

/**
 * Generates the appropriate CSV for a report based on its type.
 */
function generateReportCsv(report) {
  if (report.type === 'device') return generateDeviceReportCsv(report.summary);
  if (report.type === 'security') return generateSecurityReportCsv(report.summary);
  if (report.type === 'network_performance') return generatePerformanceReportCsv(report.summary);
  return rowsToCsv([['No data available for this report type']]);
}

module.exports = { generateReportCsv };
