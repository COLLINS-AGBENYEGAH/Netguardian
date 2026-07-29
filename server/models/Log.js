const mongoose = require('mongoose');

const logSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    action: {
      type: String,
      enum: ['scan_started', 'scan_completed', 'device_added', 'device_updated', 'device_removed', 'login', 'alert_generated', 'device_blocked', 'device_authorized'],
      required: true
    },
    details: { type: String, default: '' },
    device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Log', logSchema);
