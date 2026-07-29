/**
 * Sends transactional emails via Brevo's HTTP API instead of raw SMTP.
 *
 * WHY: Render's free web services block outbound traffic on SMTP ports
 * (25, 465, 587) as of September 2025 - so Nodemailer + SMTP relay
 * (smtp-relay.brevo.com:587) times out in production even though it
 * works fine locally. Brevo's REST API sends over normal HTTPS (port
 * 443), which isn't blocked, so switching to it avoids the restriction
 * entirely without needing a paid Render plan.
 *
 * NOTE: the API key here is DIFFERENT from the SMTP key used before -
 * generate one under Brevo -> Settings -> SMTP & API -> API Keys tab.
 * The old SMTP_* env vars are no longer used by this file.
 */

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

function isConfigured() {
  return !!(process.env.BREVO_API_KEY && process.env.SMTP_FROM);
}

async function sendViaBrevo({ to, subject, text, html }) {
  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { name: 'NetGuardian', email: process.env.SMTP_FROM },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html
    })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const detail = data.message || JSON.stringify(data);
    throw new Error(`Brevo API request failed (${res.status}): ${detail}`);
  }

  return data; // contains { messageId } on success
}

/**
 * Sends the password reset email if Brevo is configured. If it's NOT
 * configured (no BREVO_API_KEY/SMTP_FROM in .env), falls back to
 * logging the reset link to the server console instead - so the reset
 * flow is still fully testable locally without setting up a real mail
 * account first.
 */
async function sendPasswordResetEmail(toEmail, resetUrl) {
  if (!isConfigured()) {
    console.log('\n[Mailer] Email not configured - here is the reset link instead of an email:');
    console.log(`[Mailer] To: ${toEmail}`);
    console.log(`[Mailer] Reset link: ${resetUrl}\n`);
    return { sent: false, mode: 'console-fallback' };
  }

  await sendViaBrevo({
    to: toEmail,
    subject: 'NetGuardian - Password Reset Request',
    text: `You requested a password reset. Click this link to set a new password (expires in 1 hour):\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
    html: `<p>You requested a password reset for your NetGuardian account.</p>
           <p><a href="${resetUrl}">Click here to set a new password</a> (expires in 1 hour).</p>
           <p>If you didn't request this, you can safely ignore this email.</p>`
  });

  return { sent: true, mode: 'api' };
}

/**
 * Sends a notification email for a critical/high-severity alert to one or
 * more admin recipients. Same console-fallback behavior as the password
 * reset email if Brevo isn't configured - so this is testable locally
 * without a real mail account too.
 */
async function sendAlertEmail(recipients, alert) {
  const recipientList = Array.isArray(recipients) ? recipients : [recipients];

  const subject = `NetGuardian Alert [${alert.severity.toUpperCase()}]: ${alert.type.replace(/_/g, ' ')}`;
  const text = `A ${alert.severity} severity alert was raised on NetGuardian:\n\n${alert.message}\n\nType: ${alert.type}\nTime: ${new Date(alert.createdAt || Date.now()).toLocaleString()}\n\nLog in to your dashboard to view details and respond.`;
  const html = `
    <p>A <strong>${alert.severity}</strong> severity alert was raised on NetGuardian:</p>
    <p style="font-size:1.05rem; padding:12px; background:#f4f6fb; border-left:4px solid #d4af37;">${alert.message}</p>
    <p><strong>Type:</strong> ${alert.type.replace(/_/g, ' ')}<br>
       <strong>Time:</strong> ${new Date(alert.createdAt || Date.now()).toLocaleString()}</p>
    <p>Log in to your dashboard to view details and respond.</p>
  `;

  if (!isConfigured()) {
    console.log('\n[Mailer] Email not configured - alert email would have been sent to:', recipientList.join(', '));
    console.log(`[Mailer] Subject: ${subject}\n`);
    return { sent: false, mode: 'console-fallback' };
  }

  // Brevo's API takes one "to" list per call rather than a comma-joined
  // string like SMTP did - send one request per recipient so a bad
  // address for one admin doesn't block the others from being notified.
  const results = await Promise.allSettled(
    recipientList.map((email) => sendViaBrevo({ to: email, subject, text, html }))
  );

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    console.error(`[Mailer] ${failures.length}/${recipientList.length} alert email(s) failed to send:`,
      failures.map((f) => f.reason.message));
  }

  return { sent: failures.length < recipientList.length, mode: 'api' };
}

module.exports = { sendPasswordResetEmail, sendAlertEmail };
