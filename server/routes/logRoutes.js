const express = require('express');
const router = express.Router();
const { getLogs } = require('../controllers/logController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', getLogs);

module.exports = router;
