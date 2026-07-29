const Alert = require('../models/Alert');
const { getSettings } = require('./settingsService');
const { sendAlertEmail } = require('../utils/mailer');

const SEVERITY_RANK = { low: 1, medium: 2, high: 3, critical: 4 };

/**
 * Alert lifecycle rules
 * ---------------------
 * The dashboard's "Unresolved Alerts" figure is meant to represent CURRENT
 * problems, not a running historical total. That only works if we follow
 * a strict open/update/resolve discipline instead of creating a fresh
 * Alert document every time a check runs. Every alert (and the query used
 * to find "the same" one) is scoped to a single organizationId - this is
 * part of what keeps each organization seeing only its own alerts.
 *
 *  - openAlert(): call this whenever a problem is DETECTED. If an open
 *    (unresolved) alert already exists for the same thing IN THE SAME
 *    ORGANIZATION, it's updated in place rather than duplicated. Only a
 *    genuinely new problem creates a new row - and only a genuinely new
 *    problem triggers an email.
 *
 *  - resolveAlerts(): call this whenever a problem CLEARS. Marks the
 *    matching open alert(s) resolved, scoped to that organization.
 *
 * "The same problem" is identified by (organizationId + type + device) for
 * device-specific alerts, or (organizationId + type + dedupeKey) for
 * alerts not tied to one device (gateway, network-wide latency).
 */

function buildMatchQuery({ organizationId, type, device, dedupeKey }) {
  const query = { organizationId, type, isResolved: false };
  if (device) {
    query.device = device;
  } else if (dedupeKey) {
    query.dedupeKey = dedupeKey;
  } else {
    query.device = null;
    query.dedupeKey = null;
  }
  return query;
}

/**
 * Emails that organization's admins about a newly-opened alert if email
 * alerting is enabled and the alert's severity meets their configured
 * minimum. Failures here are logged but never thrown - a broken email
 * shouldn't stop the alert itself from being recorded.
 */
async function maybeSendAlertEmail(alert) {
  try {
    const settings = await getSettings(alert.organizationId);
    if (!settings.alertEmailEnabled) return;
    if (!settings.alertEmailRecipients || !settings.alertEmailRecipients.trim()) return;

    const minRank = SEVERITY_RANK[settings.alertEmailMinSeverity] || SEVERITY_RANK.high;
    const alertRank = SEVERITY_RANK[alert.severity] || 0;
    if (alertRank < minRank) return;

    const recipients = settings.alertEmailRecipients.split(',').map((e) => e.trim()).filter(Boolean);
    if (recipients.length === 0) return;

    await sendAlertEmail(recipients, alert);
    console.log(`[AlertEmail] Sent notification for "${alert.type}" (${alert.severity}) to ${recipients.length} recipient(s)`);
  } catch (error) {
    console.error('[AlertEmail] Failed to send alert notification email:', error.message);
  }
}

/**
 * Opens a new alert, or updates the existing open one for the same
 * organization+type+device (or organization+type+dedupeKey) instead of
 * creating a duplicate.
 */
async function openAlert({ organizationId, type, severity, message, device = null, dedupeKey = null }) {
  if (!organizationId) throw new Error('openAlert() requires organizationId');

  const query = buildMatchQuery({ organizationId, type, device, dedupeKey });
  const existing = await Alert.findOne(query);

  if (existing) {
    existing.message = message;
    existing.severity = severity;
    await existing.save();
    return existing;
  }

  const created = await Alert.create({ organizationId, type, severity, message, device, dedupeKey });
  maybeSendAlertEmail(created); // fire-and-forget, doesn't block/delay the alert itself
  return created;
}

/**
 * Resolves any currently-open alert(s) matching organization+type+device
 * (or organization+type+dedupeKey). Safe to call even if nothing matches.
 */
async function resolveAlerts({ organizationId, type, device = null, dedupeKey = null }) {
  if (!organizationId) throw new Error('resolveAlerts() requires organizationId');

  const query = buildMatchQuery({ organizationId, type, device, dedupeKey });
  return Alert.updateMany(query, { isResolved: true, resolvedAt: new Date() });
}

module.exports = { openAlert, resolveAlerts };
