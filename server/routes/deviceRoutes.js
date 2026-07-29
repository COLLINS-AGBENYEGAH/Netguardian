const express = require('express');
const router = express.Router();
const {
  getDevices,
  getDeviceById,
  createDevice,
  updateDevice,
  deleteDevice,
  authorizeDevice,
  blockDevice
} = require('../controllers/deviceController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', getDevices);
router.get('/:id', getDeviceById);
router.post('/', authorize('admin', 'technician'), createDevice);
router.put('/:id', authorize('admin', 'technician'), updateDevice);
router.delete('/:id', authorize('admin'), deleteDevice);
router.patch('/:id/authorize', authorize('admin', 'technician'), authorizeDevice);
router.patch('/:id/block', authorize('admin', 'technician'), blockDevice);

module.exports = router;
