const mongoose = require('mongoose');

/**
 * One Settings document PER ORGANIZATION (not a true global singleton
 * anymore, now that multiple organizations share this deployment). This
 * replaces hardcoded .env values for anything an admin should be able to
 * change through the dashboard without server access: which network to
 * monitor, the gateway to watch, and various alert thresholds/timers -
 * all scoped to that organization's own network.
 */
const settingsSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true },
    networkRange: { type: String, required: true, default: '192.168.1.0/24' },
    gatewayIp: { type: String, default: '' },
    scanIntervalMinutes: { type: Number, default: 5, min: 1, max: 120 },
    fastPollSeconds: { type: Number, default: 3, min: 2, max: 300 },
    gatewayCheckSeconds: { type: Number, default: 60, min: 10, max: 3600 },
    latencyThresholdMs: { type: Number, default: 150, min: 1 },
    flapThresholdCount: { type: Number, default: 4, min: 2 },
    flapWindowMinutes: { type: Number, default: 15, min: 1 },
    uptimeSnapshotMinutes: { type: Number, default: 1, min: 1, max: 60 },

    // --- Email alerts for critical events ---
    alertEmailEnabled: { type: Boolean, default: false },
    alertEmailRecipients: { type: String, default: '' }, // comma-separated list
    alertEmailMinSeverity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'high'
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    routerIntegration: {
      brand: {
        type: String,
        enum: ['none', 'unifi', 'mikrotik', 'fortigate'],
        default: 'none'
      },
      apiUrl: { type: String, default: '' },
      apiUsername: { type: String, default: '' },
      apiSecret: { type: String, default: '' }, // API password/token/key - whatever that brand needs
      siteId: { type: String, default: '' }    // UniFi-specific: which "site" to manage
    }
  },
  { timestamps: true }
);
module.exports = mongoose.model('Settings', settingsSchema);
