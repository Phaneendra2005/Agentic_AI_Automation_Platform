const mongoose = require('mongoose');
const { MONGODB_URI } = require('./env');

let memoryServer = null;

async function connectDB() {
  let uri = MONGODB_URI;

  if (!uri) {
    console.log('[DB] MONGODB_URI not set — starting in-memory MongoDB...');
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
    console.log('[DB] In-memory MongoDB ready');
  }

  try {
    await mongoose.connect(uri);
    console.log('[DB] Connected to MongoDB:', mongoose.connection.host);
  } catch (err) {
    if (memoryServer) throw err;
    console.warn('[DB] Primary connection failed, falling back to in-memory:', err.message);
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    await mongoose.connect(memoryServer.getUri());
    console.log('[DB] In-memory MongoDB ready (fallback)');
  }
}

async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

module.exports = { connectDB, disconnectDB };
