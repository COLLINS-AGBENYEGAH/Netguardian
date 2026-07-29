const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    title: { type: String, required: true },
    type: { type: String, enum: ['device', 'security', 'network_performance'], required: true },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    periodStart: { type: Date },
    periodEnd: { type: Date },
    summary: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Report', reportSchema);
