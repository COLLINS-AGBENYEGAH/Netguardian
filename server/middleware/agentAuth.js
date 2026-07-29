const Organization = require('../models/Organization');

/**
 * Authenticates requests from the standalone scanning Agent (not a
 * logged-in user - the Agent isn't a person, it's a background program
 * running on an organization's own network). Expects the raw agent token
 * in an `X-Agent-Token` header, matches it against the organization it
 * belongs to, and attaches that organization to the request.
 */
const agentAuth = async (req, res, next) => {
  const token = req.headers['x-agent-token'];

  if (!token) {
    return res.status(401).json({ message: 'Missing X-Agent-Token header' });
  }

  try {
    const organization = await Organization.findByAgentToken(token);
    if (!organization) {
      return res.status(401).json({ message: 'Invalid agent token' });
    }

    req.organization = organization;
    return next();
  } catch (error) {
    return res.status(503).json({ message: 'Service temporarily unavailable - please try again in a moment' });
  }
};

module.exports = { agentAuth };
