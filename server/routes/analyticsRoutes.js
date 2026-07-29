const express = require('express');
const router = express.Router();
const { getSummary, getTrends } = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/summary', getSummary);
router.get('/trends', getTrends);

module.exports = router;
