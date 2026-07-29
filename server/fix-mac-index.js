/**
 * One-time fix: drops the OLD unique index on `macAddress` alone, which
 * was left over from before multi-tenancy was added. Back then, MAC
 * addresses had to be globally unique - now they only need to be unique
 * PER ORGANIZATION (see models/Device.js), but MongoDB doesn't
 * automatically remove old indexes when a schema changes, so the stale
 * one keeps blocking two different organizations from ever reporting the
 * same MAC address.
 *
 * Safe to run multiple times - if the old index is already gone, it just
 * says so and exits.
 *
 * Usage:
 *   node fix-mac-index.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected. Checking indexes on the devices collection...\n');

  const collection = mongoose.connection.collection('devices');
  const indexes = await collection.indexes();

  console.log('Current indexes:');
  indexes.forEach((idx) => console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}${idx.unique ? ' (unique)' : ''}`));

  const staleIndex = indexes.find((idx) => idx.name === 'macAddress_1');

  if (staleIndex) {
    await collection.dropIndex('macAddress_1');
    console.log('\nDropped stale index: macAddress_1');
  } else {
    console.log('\nNo stale macAddress_1 index found - nothing to do.');
  }

  // Ensure the correct compound index exists (Mongoose usually creates this
  // automatically on startup, but let's confirm/create it here too just in case).
  await collection.createIndex({ organizationId: 1, macAddress: 1 }, { unique: true });
  console.log('Confirmed compound index exists: { organizationId: 1, macAddress: 1 } (unique)');

  await mongoose.disconnect();
  console.log('\nDone.');
  process.exit(0);
})().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});