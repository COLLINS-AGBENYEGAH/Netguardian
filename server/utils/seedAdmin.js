/**
 * Run with: npm run seed:admin
 * Creates (or resets) an admin account directly against MongoDB Atlas,
 * along with a brand-new Organization for that admin to belong to.
 *
 * NOTE: since registration (POST /api/auth/register) now always creates
 * its own Organization automatically, this script is mostly redundant for
 * NORMAL first-time setup - it's kept for cases where direct DB access is
 * preferred over the API (e.g. scripted/automated deployment).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Organization = require('../models/Organization');

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@netguardian.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'NetGuardian Admin';
const ORG_NAME = process.env.SEED_ORG_NAME || 'Default Organization';

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  let admin = await User.findOne({ email: ADMIN_EMAIL });

  if (admin) {
    admin.password = ADMIN_PASSWORD;
    admin.role = 'admin';
    await admin.save();
    console.log(`Updated existing admin: ${ADMIN_EMAIL}`);
  } else {
    const organization = await Organization.create({ name: ORG_NAME });
    const rawAgentToken = organization.generateAgentToken();
    await organization.save();

    admin = await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'admin',
      organizationId: organization._id
    });

    console.log(`Created organization: "${ORG_NAME}" (${organization._id})`);
    console.log(`Created admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
    console.log(`Agent token (copy now, shown only once): ${rawAgentToken}`);
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
