const jwt = require('jsonwebtoken');
const User = require('../models/User');
const settingsService = require('./settingsService');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/env');

function signToken(user) {
  return jwt.sign(
    { id: user._id, sessionVersion: user.sessionVersion || 0 },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

async function safeUser(user) {
  const settings = await settingsService.getOrCreateSettings(user._id);
  return settingsService.serializeUser(user, settings);
}

async function register({ name, email, password }) {
  const existing = await User.findOne({ email });
  if (existing) {
    const err = new Error('Email already in use');
    err.statusCode = 409;
    throw err;
  }
  const user = await User.create({ name, email, password });
  return { token: signToken(user), user: await safeUser(user) };
}

async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });
  return { token: signToken(user), user: await safeUser(user) };
}

async function getMe(userId) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  return { ...(await safeUser(user)), lastLogin: user.lastLogin, createdAt: user.createdAt };
}

module.exports = { register, login, getMe };
