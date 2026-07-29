const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10) || 587,
    secure: parseInt(SMTP_PORT, 10) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  return transporter;
}

/**
 * Sends the password reset email if SMTP is configured. If it's NOT
 * configured (no SMTP_HOST/SMTP_USER/SMTP_PASS in .env), falls back to
 * logging the reset link to the server console instead - so the reset
 * flow is still fully testable locally without setting up a real mail
 * account first.
 */
async function sendPasswordResetEmail(toEmail, resetUrl) {
  const t = getTransporter();

  if (!t) {
    console.log('\n[Mailer] SMTP not configured - here is the reset link instead of an email:');
    console.log(`[Mailer] To: ${toEmail}`);
    console.log(`[Mailer] Reset link: ${resetUrl}\n`);
    return { sent: false, mode: 'console-fallback' };
  }

  await t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: 'NetGuardian - Password Reset Request',
    text: `You requested a password reset. Click this link to set a new password (expires in 1 hour):\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
    html: `<p>You requested a password reset for your NetGuardian account.</p>
           <p><a href="${resetUrl}">Click here to set a new password</a> (expires in 1 hour).</p>
           <p>If you didn't request this, you can safely ignore this email.</p>`
  });

  return { sent: true, mode: 'smtp' };
}

/**
 * Sends a notification email for a critical/high-severity alert to one or
 * more admin recipients. Same console-fallback behavior as the password
 * reset email if SMTP isn't configured - so this is testable locally
 * without a real mail account too.
 */
async function sendAlertEmail(recipients, alert) {
  const t = getTransporter();
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

  if (!t) {
    console.log('\n[Mailer] SMTP not configured - alert email would have been sent to:', recipientList.join(', '));
    console.log(`[Mailer] Subject: ${subject}\n`);
    return { sent: false, mode: 'console-fallback' };
  }

  await t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: recipientList.join(', '),
    subject,
    text,
    html
  });

  return { sent: true, mode: 'smtp' };
}

module.exports = { sendPasswordResetEmail, sendAlertEmail };
