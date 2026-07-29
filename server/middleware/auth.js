const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  if (!(req.headers.authorization && req.headers.authorization.startsWith('Bearer'))) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }

  token = req.headers.authorization.split(' ')[1];

  // Step 1: verify the JWT itself. A failure here means the token is
  // genuinely invalid/expired/tampered - this really is a 401 and the
  // person legitimately needs to log in again.
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (jwtError) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }

  // Step 2: look up the user. This is a SEPARATE failure mode - if this
  // throws, it's a database/network problem, not a bad token. Treating it
  // as a 401 would wrongly log a person out over a transient connection
  // blip (e.g. MongoDB briefly reconnecting). Use 503 instead so the
  // frontend knows to just retry, not clear the session.
  try {
    req.user = await User.findById(decoded.id).select('-password');
  } catch (dbError) {
    console.error('[Auth] Database lookup failed during auth check:', dbError.message);
    return res.status(503).json({ message: 'Service temporarily unavailable - please try again in a moment' });
  }

  if (!req.user || !req.user.isActive) {
    return res.status(401).json({ message: 'Not authorized, account inactive or not found' });
  }

  return next();
};

// Usage: authorize('admin', 'technician')
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: `Role '${req.user ? req.user.role : 'unknown'}' is not permitted to perform this action` });
    }
    next();
  };
};

module.exports = { protect, authorize };
