const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    type: {
      type: String,
      enum: ['unknown_device', 'device_offline', 'device_online', 'suspicious_activity', 'network_issue'],
      required: true
    },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    message: { type: String, required: true },
    device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
    // Used to identify/deduplicate alerts that AREN'T tied to a specific
    // device (e.g. gateway down, high network-wide latency) - lets us find
    // and update/resolve "the same" ongoing issue instead of creating a new
    // alert every time the condition is checked.
    dedupeKey: { type: String, default: null },
    isResolved: { type: Boolean, default: false },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date }
  },
  { timestamps: true }
);

alertSchema.index({ isResolved: 1, createdAt: -1 });

module.exports = mongoose.model('Alert', alertSchema);
