const express = require('express');
const router = express.Router();
const { getSettingsHandler, updateSettingsHandler, regenerateAgentToken } = require('../controllers/settingsController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', getSettingsHandler);
router.put('/', authorize('admin'), updateSettingsHandler);
router.post('/agent-token', authorize('admin'), regenerateAgentToken);

module.exports = router;
