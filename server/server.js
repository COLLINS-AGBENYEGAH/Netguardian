require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const { startUptimeTracking, stopUptimeTracking } = require('./services/uptimeService');
const { runEnvChecks } = require('./utils/startupCheck');

// --- Process-level safety nets ---
// This app has several background timers running independently of any
// single HTTP request. If any of them throws an error that isn't caught
// internally, Node treats it as an unhandled rejection/uncaught exception
// and - by default - crashes the ENTIRE server, taking down monitoring
// completely until someone notices and manually restarts it.
let lastLoggedErrorMessage = null;
let repeatedErrorCount = 0;

function logConciseError(prefix, reason) {
  const message = (reason && reason.message) || String(reason);

  if (message === lastLoggedErrorMessage) {
    repeatedErrorCount++;
    if (repeatedErrorCount % 5 === 0) {
      console.error(`${prefix} (repeated ${repeatedErrorCount}x): ${message}`);
    }
    return;
  }

  lastLoggedErrorMessage = message;
  repeatedErrorCount = 1;
  console.error(`${prefix}: ${message}`);
}

process.on('unhandledRejection', (reason) => {
  logConciseError('[Server] Unhandled promise rejection', reason);
});

process.on('uncaughtException', (error) => {
  logConciseError('[Server] Uncaught exception', error);
});

const authRoutes = require('./routes/authRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const monitorRoutes = require('./routes/monitorRoutes');
const alertRoutes = require('./routes/alertRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const reportRoutes = require('./routes/reportRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const logRoutes = require('./routes/logRoutes');
const agentRoutes = require('./routes/agentRoutes');

const app = express();

// --- Core middleware ---
app.use(express.json());
app.use(helmet());

const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.CLIENT_URL || 'http://localhost:5500')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      console.warn(`[CORS] Blocked request from disallowed origin: ${origin}`);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  })
);

// --- Rate limiting ---
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests - please slow down and try again shortly.' }
});
app.use('/api/', generalApiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many attempts, please try again later.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

// --- Routes ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'NetGuardian API', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/agent', agentRoutes);

// --- 404 handler ---
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// --- Global error handler ---
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
let httpServer = null;

const start = async () => {
  runEnvChecks();

  await connectDB();

  httpServer = app.listen(PORT, () => {
    console.log(`[Server] NetGuardian API running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  });

  // Historical uptime tracking is the one background job that's still
  // global (it just loops over every device across every organization).
  // Full device discovery is no longer done centrally - see the note in
  // services/monitorService.js: each organization runs its own standalone
  // Agent, which reports to POST /api/agent/report instead.
  startUptimeTracking();
};

start();

// --- Graceful shutdown ---
let shuttingDown = false;

async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n[Server] ${signal} received - shutting down gracefully...`);

  stopUptimeTracking();

  if (httpServer) {
    httpServer.close(() => {
      console.log('[Server] HTTP server closed - no longer accepting new requests');
    });
  }

  try {
    const { closeDB } = require('./config/db');
    await closeDB();
    console.log('[DB] MongoDB connection closed cleanly');
  } catch (error) {
    console.error('[DB] Error while closing connection:', error.message);
  }

  console.log('[Server] Shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = app;
