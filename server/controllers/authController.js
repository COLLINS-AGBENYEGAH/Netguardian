const crypto = require('crypto');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Log = require('../models/Log');
const generateToken = require('../utils/generateToken');
const { validatePassword } = require('../utils/passwordPolicy');
const { sendPasswordResetEmail } = require('../utils/mailer');

// @desc   Register a new user AND a brand-new organization for them.
//         Every registration creates its own independent organization -
//         this is what lets multiple people share one deployment while
//         each only ever sees their own network's devices/alerts/settings.
//         The registering user always becomes that organization's admin.
// @route  POST /api/auth/register
// @access Public
exports.register = async (req, res) => {
  try {
    const { name, email, password, organizationName } = req.body;

    if (!name || !email || !password || !organizationName) {
      return res.status(400).json({
        message: 'Name, email, password, and organization/network name are all required'
      });
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({ message: passwordCheck.message });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    // Create the new organization first, then the user as its admin.
    const organization = await Organization.create({ name: organizationName });
    const rawAgentToken = organization.generateAgentToken();
    await organization.save();

    const user = await User.create({
      name,
      email,
      password,
      role: 'admin', // the person who creates an organization is always its admin
      organizationId: organization._id
    });

    await Log.create({
      organizationId: organization._id,
      action: 'login',
      user: user._id,
      details: `Organization "${organization.name}" created and first admin registered`
    });

    res.status(201).json({
      user: user.toSafeObject(),
      token: generateToken(user._id, user.role),
      organization: { id: organization._id, name: organization.name },
      // Shown ONCE - this is what the standalone scanning Agent uses to
      // authenticate itself to this backend. It cannot be retrieved again;
      // only regenerated (which invalidates the old one) from Settings.
      agentToken: rawAgentToken
    });
  } catch (error) {
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
};

// @desc   Authenticate user & get token
// @route  POST /api/auth/login
// @access Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'This account has been deactivated' });
    }

    user.lastLogin = new Date();
    user.lastActivity = new Date();
    await user.save();
    await Log.create({
      organizationId: user.organizationId,
      action: 'login',
      user: user._id,
      details: `${user.email} logged in`
    });

    res.json({
      user: user.toSafeObject(),
      token: generateToken(user._id, user.role)
    });
  } catch (error) {
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
};

// @desc   Get current logged-in user profile
// @route  GET /api/auth/me
// @access Private
exports.getProfile = async (req, res) => {
  res.json({ user: req.user });
};

// @desc   Request a password reset email
// @route  POST /api/auth/forgot-password
// @access Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // Always return the same success response whether or not the email
    // exists - this prevents leaking which emails have accounts (a common
    // security consideration for reset flows).
    const genericResponse = {
      message: 'If an account with that email exists, a password reset link has been sent.'
    };

    if (!user) {
      return res.json(genericResponse);
    }

    // Generate a random token, store only its HASH (never the raw token -
    // same principle as passwords: if the database were ever exposed, the
    // stored value alone shouldn't be usable to reset anyone's password)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    user.resetPasswordTokenHash = tokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5500';
    const resetUrl = `${clientUrl}/reset-password.html?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

    await sendPasswordResetEmail(user.email, resetUrl);
    await Log.create({
      organizationId: user.organizationId,
      action: 'login',
      user: user._id,
      details: `Password reset requested for ${user.email}`
    });

    res.json(genericResponse);
  } catch (error) {
    res.status(500).json({ message: 'Failed to process password reset request', error: error.message });
  }
};

// @desc   Reset password using a valid reset token
// @route  POST /api/auth/reset-password
// @access Public
exports.resetPassword = async (req, res) => {
  try {
    const { email, token, password } = req.body;

    if (!email || !token || !password) {
      return res.status(400).json({ message: 'Email, token, and new password are required' });
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({ message: passwordCheck.message });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    user.password = password; // pre-save hook hashes this
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    await user.save();

    await Log.create({
      organizationId: user.organizationId,
      action: 'login',
      user: user._id,
      details: `Password reset completed for ${user.email}`
    });

    res.json({ message: 'Password reset successful. You can now log in with your new password.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to reset password', error: error.message });
  }
};
