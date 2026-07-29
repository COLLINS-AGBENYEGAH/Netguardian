/**
 * Startup readiness check
 * ------------------------
 * Runs once when the server boots and prints clear warnings for exactly
 * the kind of configuration mistakes that are easy to forget under
 * deployment pressure: a leftover placeholder JWT secret, CORS still
 * locked to localhost, no email provider configured, or the network range
 * still sitting on its generic default. None of these block startup -
 * they're warnings, not hard failures - but they're loud and impossible
 * to miss in the console.
 */

const KNOWN_PLACEHOLDER_SECRETS = [
  'change_this_to_a_long_random_string',
  'make-this-a-long-random-string-like-8f7d3a9b2c1e',
  'secret',
  'secret123',
  'changeme',
  'your-secret-here'
];

function checkJwtSecret(warnings) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    warnings.push({ level: 'critical', message: 'JWT_SECRET is not set at all - authentication will not work.' });
    return;
  }

  if (KNOWN_PLACEHOLDER_SECRETS.includes(secret.toLowerCase())) {
    warnings.push({
      level: 'critical',
      message: 'JWT_SECRET is still a placeholder value from the example config. Generate a real one before deploying: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    });
    return;
  }

  if (secret.length < 32) {
    warnings.push({
      level: 'warning',
      message: `JWT_SECRET is quite short (${secret.length} characters) - a longer, fully random value is safer for a real deployment.`
    });
  }
}

function checkCors(warnings) {
  const origins = process.env.ALLOWED_ORIGINS || process.env.CLIENT_URL || '';
  const onlyLocalhost = origins
    .split(',')
    .map((o) => o.trim())
    .every((o) => o === '' || o.includes('localhost') || o.includes('127.0.0.1'));

  if (onlyLocalhost && process.env.NODE_ENV === 'production') {
    warnings.push({
      level: 'warning',
      message: 'ALLOWED_ORIGINS/CLIENT_URL only allows localhost, but NODE_ENV is "production" - your real frontend URL (e.g. your Vercel domain) needs to be added or the dashboard won\'t be able to reach this API.'
    });
  }
}

function checkMongoUri(warnings) {
  const uri = process.env.MONGO_URI || '';
  if (!uri) {
    warnings.push({ level: 'critical', message: 'MONGO_URI is not set - the app cannot start without a database connection.' });
    return;
  }
  if (uri.includes('<username>') || uri.includes('<password>') || uri.includes('<db_password>')) {
    warnings.push({
      level: 'critical',
      message: 'MONGO_URI still contains placeholder text like <username>/<password> - replace it with your real Atlas connection string.'
    });
  }
}

function checkEmail(warnings) {
  if (!process.env.SMTP_HOST) {
    warnings.push({
      level: 'info',
      message: 'No SMTP_HOST configured - password reset links will be logged to this console instead of emailed. Fine for local testing, not for a real deployment.'
    });
  }
}

/**
 * Environment-only checks - safe to run immediately at boot, before any
 * database connection exists.
 */
function runEnvChecks() {
  const warnings = [];
  checkJwtSecret(warnings);
  checkCors(warnings);
  checkMongoUri(warnings);
  checkEmail(warnings);
  printWarnings(warnings, 'Environment');
}

function printWarnings(warnings, section) {
  if (warnings.length === 0) {
    console.log(`[Startup Check] ${section}: OK`);
    return;
  }

  console.log(`\n[Startup Check] ${section} - ${warnings.length} item(s) need attention:`);
  warnings.forEach((w) => {
    const icon = w.level === 'critical' ? '❌' : w.level === 'warning' ? '⚠️ ' : 'ℹ️ ';
    console.log(`  ${icon} ${w.message}`);
  });
  console.log('');
}

module.exports = { runEnvChecks };
