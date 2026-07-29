const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000
    });
    console.log(`[DB] MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[DB] Initial connection failed: ${error.message}`);
    process.exit(1); // can't do anything useful without a first successful connection
  }

  // These listeners are what actually prevent a crash. Without them, an
  // async error emitted internally by the MongoDB driver (e.g. a dropped
  // connection on an unstable Wi-Fi/Starlink network) has nowhere to go
  // and can surface as an uncaught exception, killing the whole process.
  // Mongoose automatically attempts to reconnect on its own - these
  // handlers just make sure that process is visible and doesn't crash
  // the app in the meantime.
  mongoose.connection.on('error', (error) => {
    console.error('[DB] Connection error (mongoose will attempt to recover):', error.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] MongoDB disconnected - attempting to reconnect...');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[DB] MongoDB reconnected successfully');
  });
};

module.exports = connectDB;
module.exports.closeDB = async () => {
  await mongoose.connection.close();
};
