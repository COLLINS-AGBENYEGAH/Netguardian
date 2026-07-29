const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    ipAddress: { type: String, required: true, index: true },
    macAddress: { type: String, required: true, index: true },
    hostname: { type: String, default: 'Unknown' },
    vendor: { type: String, default: 'Unknown' },
    deviceType: {
      type: String,
      enum: ['PC', 'Laptop', 'Phone', 'Printer', 'Router', 'Server', 'IoT', 'Other'],
      default: 'Other'
    },
    owner: { type: String, default: '' },
    status: { type: String, enum: ['online', 'offline'], default: 'offline' },
    authorization: {
      type: String,
      enum: ['authorized', 'unauthorized', 'blocked', 'pending'],
      default: 'pending'
    },
    firstSeen: { type: Date, default: Date.now },
    lastSeen: { type: Date, default: Date.now },
    lastResponseTimeMs: { type: Number, default: null },
    notes: { type: String, default: '' },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // --- Historical uptime tracking ---
    // Accumulated in small increments by a periodic snapshot job (see
    // monitorService.startUptimeTracking). Resolution is limited to the
    // snapshot interval (default 1 minute), which is precise enough for a
    // "% uptime over N days" figure without needing a full time-series log.
    totalOnlineMs: { type: Number, default: 0 },
    totalOfflineMs: { type: Number, default: 0 },
    uptimeTrackingStartAt: { type: Date, default: Date.now },
    lastUptimeSnapshotAt: { type: Date, default: Date.now },

    // --- Suspicious activity (rapid connect/disconnect cycling) tracking ---
    statusFlapCount: { type: Number, default: 0 },
    statusFlapWindowStart: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

deviceSchema.index({ status: 1 });
deviceSchema.index({ authorization: 1 });
deviceSchema.index({ organizationId: 1, macAddress: 1 }, { unique: true });

module.exports = mongoose.model('Device', deviceSchema);
