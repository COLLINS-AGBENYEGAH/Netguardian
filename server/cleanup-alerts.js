/**
 * One-time cleanup for alerts created before the open/resolve alert
 * lifecycle fix. Run this ONCE after deploying that fix to clean up your
 * existing data - it does two things:
 *
 *  1. Resolves any open "device_offline" alert whose device is actually
 *     showing as online right now (this is exactly the bug you hit -
 *     recoveries used to create a new alert instead of resolving the old
 *     one, so these piled up even after the device came back).
 *
 *  2. For any device with MULTIPLE open alerts of the same type (duplicates
 *     from the old create-every-time behavior), keeps only the newest one
 *     open and resolves the rest.
 *
 * Usage:
 *   node cleanup-alerts.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Device = require('./models/Device');
const Alert = require('./models/Alert');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected. Starting cleanup...\n');

  // --- Step 1: resolve stale offline alerts for devices that are actually online ---
  const openOfflineAlerts = await Alert.find({ type: 'device_offline', isResolved: false }).populate('device');
  let staleResolved = 0;

  for (const alert of openOfflineAlerts) {
    if (alert.device && alert.device.status === 'online') {
      alert.isResolved = true;
      alert.resolvedAt = new Date();
      await alert.save();
      staleResolved++;
    }
  }
  console.log(`Step 1: Resolved ${staleResolved} stale "offline" alerts for devices that are actually online now.`);

  // --- Step 2: dedupe - for each (type, device), keep only the newest open alert ---
  const openAlerts = await Alert.find({ isResolved: false, device: { $ne: null } }).sort({ createdAt: -1 });
  const seen = new Set();
  let duplicatesResolved = 0;

  for (const alert of openAlerts) {
    const key = `${alert.type}:${alert.device}`;
    if (seen.has(key)) {
      alert.isResolved = true;
      alert.resolvedAt = new Date();
      await alert.save();
      duplicatesResolved++;
    } else {
      seen.add(key);
    }
  }
  console.log(`Step 2: Resolved ${duplicatesResolved} duplicate open alerts (kept the newest one per device+type).`);

  // --- Step 3: same dedupe for non-device-scoped alerts (gateway/latency), by dedupeKey ---
  const openNonDeviceAlerts = await Alert.find({ isResolved: false, device: null }).sort({ createdAt: -1 });
  const seenKeys = new Set();
  let nonDeviceDuplicatesResolved = 0;

  for (const alert of openNonDeviceAlerts) {
    const key = `${alert.type}:${alert.dedupeKey || 'none'}`;
    if (seenKeys.has(key)) {
      alert.isResolved = true;
      alert.resolvedAt = new Date();
      await alert.save();
      nonDeviceDuplicatesResolved++;
    } else {
      seenKeys.add(key);
    }
  }
  console.log(`Step 3: Resolved ${nonDeviceDuplicatesResolved} duplicate non-device alerts (gateway/latency).`);

  const remainingUnresolved = await Alert.countDocuments({ isResolved: false });
  console.log(`\nDone. Unresolved alerts remaining: ${remainingUnresolved}`);

  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
