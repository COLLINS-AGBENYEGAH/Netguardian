const express = require('express');
const router = express.Router();
const {
  generateDeviceReport,
  generateSecurityReport,
  generatePerformanceReport,
  getReports,
  downloadReportPdf,
  downloadReportCsv
} = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', getReports);
router.get('/:id/download', downloadReportPdf);
router.get('/:id/download-csv', downloadReportCsv);
router.post('/device', authorize('admin', 'technician'), generateDeviceReport);
router.post('/security', authorize('admin', 'technician'), generateSecurityReport);
router.post('/performance', authorize('admin', 'technician'), generatePerformanceReport);

module.exports = router;
