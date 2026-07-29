const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * An Organization represents one independent company/user's monitored
 * network. Every other piece of data (devices, alerts, settings, logs,
 * reports) belongs to exactly one Organization - this is what makes
 * multiple people able to use one shared deployment while each only ever
 * seeing their own network's data.
 *
 * agentTokenHash authenticates the standalone scanning Agent (see
 * /agent) that runs on each organization's own physical network and
 * reports discovered devices back to this shared backend. The RAW token
 * is only ever shown once, at generation time - only its hash is stored,
 * the same principle as password hashing.
 */
const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    agentTokenHash: { type: String, default: null },
    lastAgentReportAt: { type: Date, default: null }
  },
  { timestamps: true }
);

/**
 * Generates a brand-new agent token, returning the RAW token (to show the
 * admin once) while storing only its hash on the organization document.
 */
organizationSchema.methods.generateAgentToken = function () {
  const rawToken = crypto.randomBytes(32).toString('hex');
  this.agentTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return rawToken;
};

/**
 * Looks up an organization by a RAW agent token (hashes it first, then
 * matches against the stored hash) - used to authenticate incoming
 * requests from a standalone agent.
 */
organizationSchema.statics.findByAgentToken = async function (rawToken) {
  if (!rawToken) return null;
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return this.findOne({ agentTokenHash: hash });
};

module.exports = mongoose.model('Organization', organizationSchema);
