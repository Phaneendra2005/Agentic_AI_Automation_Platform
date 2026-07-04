const fs = require('fs/promises');
const path = require('path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const UserSettings = require('../models/UserSettings');
const integrationService = require('./integrationService');
const { emitSettingsEvent } = require('../config/socket');
const {
  JWT_SECRET,
  CREDENTIAL_ENCRYPTION_KEY,
  OPENROUTER_API_KEY,
  GEMINI_API_KEY,
  NODE_ENV,
  REDIS_URL,
} = require('../config/env');

const PACKAGE = require('../../package.json');

const PROVIDERS = {
  gmail: require('../integrations/gmailIntegration'),
  slack: require('../integrations/slackIntegration'),
  discord: require('../integrations/discordIntegration'),
  'google-sheets': require('../integrations/sheetsIntegration'),
};

const PROVIDER_LABELS = {
  gmail: 'Gmail',
  slack: 'Slack',
  discord: 'Discord',
  'google-sheets': 'Google Sheets',
};

const DEFAULT_NOTIFICATION_PREFERENCES = {
  workflowCompleted: true,
  workflowFailed: true,
  workflowStarted: true,
  browserNotifications: false,
  emailNotifications: false,
};

async function getOrCreateSettings(userId) {
  let settings = await UserSettings.findOne({ userId });
  if (!settings) {
    settings = await UserSettings.create({ userId });
  }
  return settings;
}

function serializeSettings(settings) {
  const preferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...(settings.notificationPreferences?.toObject?.() || settings.notificationPreferences || {}),
  };
  return {
    theme: settings.theme,
    avatar: settings.avatar || '',
    notificationPreferences: preferences,
    browserNotificationEnabled: preferences.browserNotifications,
    emailNotificationEnabled: preferences.emailNotifications,
    updatedAt: settings.updatedAt,
  };
}

function serializeUser(user, settings) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: settings?.avatar || '',
  };
}

function assertPasswordPolicy(password) {
  const failures = [];
  if (!password || password.length < 8) failures.push('at least 8 characters');
  if (!/[a-z]/.test(password || '')) failures.push('one lowercase letter');
  if (!/[A-Z]/.test(password || '')) failures.push('one uppercase letter');
  if (!/\d/.test(password || '')) failures.push('one number');
  if (!/[^A-Za-z0-9]/.test(password || '')) failures.push('one symbol');
  if (failures.length) {
    const err = new Error(`Password must include ${failures.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
}

function parseAvatarData(avatarData) {
  if (!avatarData) return null;
  const match = String(avatarData).match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    const err = new Error('Avatar must be a PNG, JPEG, WebP, or GIF image');
    err.statusCode = 400;
    throw err;
  }
  const mime = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  const buffer = Buffer.from(match[2], 'base64');
  const maxBytes = 2 * 1024 * 1024;
  if (buffer.length > maxBytes) {
    const err = new Error('Avatar image must be 2 MB or smaller');
    err.statusCode = 400;
    throw err;
  }
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[mime];
  return { buffer, ext };
}

async function saveAvatar(userId, avatarData) {
  const parsed = parseAvatarData(avatarData);
  if (!parsed) return undefined;
  const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'avatars');
  await fs.mkdir(uploadDir, { recursive: true });
  const fileName = `${userId}-${Date.now()}.${parsed.ext}`;
  await fs.writeFile(path.join(uploadDir, fileName), parsed.buffer);
  return `/uploads/avatars/${fileName}`;
}

async function getSettings(userId) {
  const [user, settings, integrations] = await Promise.all([
    User.findById(userId),
    getOrCreateSettings(userId),
    getIntegrationStatus(userId),
  ]);
  return {
    user: serializeUser(user, settings),
    settings: serializeSettings(settings),
    integrations,
  };
}

async function updateProfile(userId, { name, avatarData }) {
  const user = await User.findById(userId);
  const settings = await getOrCreateSettings(userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const nextName = String(name || '').trim();
  if (!nextName) {
    const err = new Error('Full name is required');
    err.statusCode = 400;
    throw err;
  }
  if (nextName.length > 100) {
    const err = new Error('Full name cannot exceed 100 characters');
    err.statusCode = 400;
    throw err;
  }

  user.name = nextName;
  const avatar = await saveAvatar(userId, avatarData);
  if (avatar !== undefined) settings.avatar = avatar;
  await Promise.all([user.save(), settings.save()]);

  const payload = { user: serializeUser(user, settings), settings: serializeSettings(settings) };
  emitSettingsEvent(userId, 'profile.updated', payload);
  return payload;
}

async function updatePassword(userId, { currentPassword, newPassword, confirmPassword }) {
  const user = await User.findById(userId).select('+password');
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  if (!(await user.comparePassword(currentPassword || ''))) {
    const err = new Error('Current password is incorrect');
    err.statusCode = 400;
    throw err;
  }
  if (newPassword !== confirmPassword) {
    const err = new Error('New password and confirmation do not match');
    err.statusCode = 400;
    throw err;
  }
  assertPasswordPolicy(newPassword);

  user.password = newPassword;
  user.passwordChangedAt = new Date();
  user.sessionVersion = (user.sessionVersion || 0) + 1;
  await user.save();
  emitSettingsEvent(userId, 'security.passwordChanged', { sessionVersion: user.sessionVersion });
  return { sessionVersion: user.sessionVersion };
}

async function logoutAll(userId) {
  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { sessionVersion: 1 } },
    { new: true }
  );
  emitSettingsEvent(userId, 'security.logoutAll', { sessionVersion: user?.sessionVersion || 0 });
  return { sessionVersion: user?.sessionVersion || 0 };
}

async function updateTheme(userId, theme) {
  if (!['dark', 'light', 'system'].includes(theme)) {
    const err = new Error('Invalid theme');
    err.statusCode = 400;
    throw err;
  }
  const settings = await getOrCreateSettings(userId);
  settings.theme = theme;
  await settings.save();
  const payload = { theme, settings: serializeSettings(settings) };
  emitSettingsEvent(userId, 'settings.theme.updated', payload);
  return payload;
}

async function updateNotifications(userId, preferences) {
  const settings = await getOrCreateSettings(userId);
  const next = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  for (const key of Object.keys(next)) {
    if (preferences[key] !== undefined) next[key] = Boolean(preferences[key]);
  }
  settings.notificationPreferences = next;
  settings.browserNotificationEnabled = next.browserNotifications;
  settings.emailNotificationEnabled = next.emailNotifications;
  await settings.save();
  const payload = { notificationPreferences: next, settings: serializeSettings(settings) };
  emitSettingsEvent(userId, 'settings.notifications.updated', payload);
  return payload;
}

function keyStatus(key, value) {
  if (!value) return { key, status: 'Missing' };
  if (key === 'JWT_SECRET' && (value === 'dev_secret_change_in_production' || value.length < 32)) {
    return { key, status: 'Invalid' };
  }
  if (key === 'CREDENTIAL_ENCRYPTION_KEY' && !/^[a-fA-F0-9]{64}$/.test(value)) {
    return { key, status: 'Invalid' };
  }
  return { key, status: 'Active' };
}

function getApiKeyHealth() {
  return [
    keyStatus('JWT_SECRET', JWT_SECRET),
    keyStatus('CREDENTIAL_ENCRYPTION_KEY', CREDENTIAL_ENCRYPTION_KEY),
    keyStatus('OPENROUTER_API_KEY', OPENROUTER_API_KEY),
    keyStatus('GEMINI_API_KEY', GEMINI_API_KEY),
  ];
}

function getEncryptionHealth() {
  if (!CREDENTIAL_ENCRYPTION_KEY) return { status: 'Missing' };
  if (!/^[a-fA-F0-9]{64}$/.test(CREDENTIAL_ENCRYPTION_KEY)) return { status: 'Invalid' };
  const sample = `diagnostic-${Date.now()}`;
  const encrypted = integrationService.encrypt(sample);
  const decrypted = integrationService.decrypt(encrypted);
  return { status: decrypted === sample ? 'Healthy' : 'Invalid' };
}

async function getSystemHealth() {
  const { langGraphStatus } = require('../agents/orchestrator');
  const mongoHealthy = mongoose.connection.readyState === 1;
  return {
    appVersion: PACKAGE.version,
    environment: NODE_ENV,
    backend: { status: 'Healthy', uptime: process.uptime() },
    mongodb: { status: mongoHealthy ? 'Healthy' : 'Offline', readyState: mongoose.connection.readyState },
    redis: { status: REDIS_URL ? 'Healthy' : 'Degraded' },
    socketio: { status: 'Healthy' },
    langGraph: { status: langGraphStatus === 'available' ? 'Healthy' : 'Degraded', detail: langGraphStatus },
    encryption: getEncryptionHealth(),
  };
}

async function getIntegrationStatus(userId) {
  const records = await integrationService.getStatus(userId);
  return records.map((item) => {
    const expired = item.expiresAt && new Date(item.expiresAt) < new Date();
    return {
      provider: item.provider,
      label: PROVIDER_LABELS[item.provider] || item.provider,
      status: expired ? 'Token Expired' : item.connected ? 'Connected' : 'Disconnected',
      connected: Boolean(item.connected && !expired),
      accountEmail: item.accountEmail || null,
      expiresAt: item.expiresAt || null,
      lastConnectedAt: item.updatedAt || null,
      error: item.error || null,
    };
  });
}

async function disconnectIntegration(userId, provider) {
  if (!PROVIDERS[provider]) {
    const err = new Error(`Unknown provider: ${provider}`);
    err.statusCode = 400;
    throw err;
  }
  await integrationService.disconnectIntegration(userId, provider);
  const integrations = await getIntegrationStatus(userId);
  emitSettingsEvent(userId, 'integration.disconnected', { provider, integrations });
  return { provider, integrations };
}

function createOAuthState(userId, provider) {
  return jwt.sign({ userId: userId.toString(), provider }, JWT_SECRET, { expiresIn: '10m' });
}

async function reconnectIntegration(userId, provider) {
  const integration = PROVIDERS[provider];
  if (!integration) {
    const err = new Error(`Unknown provider: ${provider}`);
    err.statusCode = 400;
    throw err;
  }
  const url = integration.getOAuthUrl(createOAuthState(userId, provider));
  emitSettingsEvent(userId, 'integration.reconnected', { provider });
  return { provider, url };
}

async function testIntegration(userId, provider) {
  if (!PROVIDERS[provider]) {
    const err = new Error(`Unknown provider: ${provider}`);
    err.statusCode = 400;
    throw err;
  }
  await integrationService.getTokens(userId, provider);
  return { provider, status: 'Connected' };
}

module.exports = {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getOrCreateSettings,
  serializeUser,
  serializeSettings,
  getSettings,
  updateProfile,
  updatePassword,
  logoutAll,
  updateTheme,
  updateNotifications,
  getApiKeyHealth,
  getEncryptionHealth,
  getSystemHealth,
  getIntegrationStatus,
  disconnectIntegration,
  reconnectIntegration,
  testIntegration,
};
