const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { triggerScan, pingSingleDevice } = require('../controllers/monitorController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// Manually triggering a full scan doesn't just cost server resources - it
// actively pings/ARP-sweeps the real network. Repeated rapid triggering
// (accidental double-clicks, a misbehaving script, or a malicious
// authenticated user) could meaningfully hammer the network itself, not
// just the API - so this gets its own, much stricter limit than general
// API traffic. The backend's scanInProgress guard already blocks true
// overlap; this limits how often NEW scans can even be requested.
const scanLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many scan requests - please wait before triggering another scan.' }
});

router.post('/scan', scanLimiter, authorize('admin', 'technician'), triggerScan);
router.post('/ping/:id', authorize('admin', 'technician'), pingSingleDevice);

module.exports = router;
