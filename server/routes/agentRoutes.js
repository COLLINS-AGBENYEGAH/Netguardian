const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { report, downloadAgent, getConfig } = require('../controllers/agentController');
const { agentAuth } = require('../middleware/agentAuth');
const { protect } = require('../middleware/auth');

// Agents report on their own schedule (every few seconds to minutes) - a
// generous but real limit here just guards against a misconfigured or
// runaway agent hammering the API.
const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { message: 'Agent is reporting too frequently - please slow down.' }
});

router.post('/report', agentLimiter, agentAuth, report);
router.get('/config', agentLimiter, agentAuth, getConfig);
router.get('/download', protect, downloadAgent);

module.exports = router;