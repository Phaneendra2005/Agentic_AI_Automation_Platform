const assert = require('assert');
const http = require('http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../src/models/User');
const UserSettings = require('../src/models/UserSettings');
const Integration = require('../src/models/Integration');
const settingsService = require('../src/services/settingsService');
const authService = require('../src/services/authService');
const authMiddleware = require('../src/middleware/auth');
const integrationService = require('../src/services/integrationService');
const { initSocket } = require('../src/config/socket');
const { JWT_SECRET } = require('../src/config/env');

async function runAuth(token) {
  return new Promise((resolve) => {
    const req = { headers: { authorization: token ? `Bearer ${token}` : '' } };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ statusCode: this.statusCode, payload });
      },
    };
    authMiddleware(req, res, () => resolve({ statusCode: 200, user: req.user }));
  });
}

(async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  const server = http.createServer();
  const io = initSocket(server);
  const emitted = [];
  io.to = (room) => ({
    emit: (event, payload) => emitted.push({ room, event, payload }),
  });

  const user = await User.create({
    name: 'Settings User',
    email: 'settings@example.com',
    password: 'OldPass1!',
    role: 'admin',
  });

  const settings = await settingsService.getSettings(user._id);
  assert.equal(settings.user.name, 'Settings User');
  assert.equal(settings.settings.theme, 'dark');
  assert.equal(settings.settings.notificationPreferences.workflowCompleted, true);

  const avatarData = `data:image/png;base64,${Buffer.from('avatar').toString('base64')}`;
  const profile = await settingsService.updateProfile(user._id, {
    name: 'Settings Operator',
    avatarData,
  });
  assert.equal(profile.user.name, 'Settings Operator');
  assert.ok(profile.user.avatar.startsWith('/uploads/avatars/'));
  assert.equal(emitted.at(-2).event, 'profile.updated');
  assert.equal(emitted.at(-1).event, 'settings:updated');

  await settingsService.updateTheme(user._id, 'system');
  let saved = await UserSettings.findOne({ userId: user._id });
  assert.equal(saved.theme, 'system');

  await settingsService.updateNotifications(user._id, {
    workflowCompleted: false,
    workflowFailed: true,
    workflowStarted: false,
    browserNotifications: true,
    emailNotifications: true,
  });
  saved = await UserSettings.findOne({ userId: user._id });
  assert.equal(saved.notificationPreferences.workflowCompleted, false);
  assert.equal(saved.browserNotificationEnabled, true);

  const login = await authService.login({ email: 'settings@example.com', password: 'OldPass1!' });
  assert.equal((await runAuth(login.token)).statusCode, 200);

  const password = await settingsService.updatePassword(user._id, {
    currentPassword: 'OldPass1!',
    newPassword: 'NewPass1!',
    confirmPassword: 'NewPass1!',
  });
  assert.equal(password.sessionVersion, 1);
  assert.equal((await runAuth(login.token)).statusCode, 401);
  const relogin = await authService.login({ email: 'settings@example.com', password: 'NewPass1!' });
  assert.equal((await runAuth(relogin.token)).statusCode, 200);

  const logoutAll = await settingsService.logoutAll(user._id);
  assert.equal(logoutAll.sessionVersion, 2);
  assert.equal((await runAuth(relogin.token)).statusCode, 401);
  assert.equal((await runAuth('bad-token')).statusCode, 401);
  assert.equal((await runAuth()).statusCode, 401);

  const apiKeys = settingsService.getApiKeyHealth();
  assert.ok(apiKeys.every((item) => !('value' in item)));
  assert.ok(apiKeys.find((item) => item.key === 'JWT_SECRET'));
  assert.ok(['Healthy', 'Missing', 'Invalid'].includes(settingsService.getEncryptionHealth().status));
  const health = await settingsService.getSystemHealth();
  assert.equal(health.backend.status, 'Healthy');
  assert.ok(health.appVersion);

  await integrationService.saveTokens(user._id, 'slack', {
    accessToken: 'xoxb-test',
    refreshToken: null,
    accountEmail: 'team-user',
    scopes: ['chat:write'],
  });
  let integrations = await settingsService.getIntegrationStatus(user._id);
  assert.equal(integrations.find((item) => item.provider === 'slack').status, 'Connected');
  const test = await settingsService.testIntegration(user._id, 'slack');
  assert.equal(test.status, 'Connected');

  const reconnect = await settingsService.reconnectIntegration(user._id, 'slack');
  assert.ok(reconnect.url.includes('slack.com/oauth'));

  const disconnected = await settingsService.disconnectIntegration(user._id, 'slack');
  assert.equal(disconnected.integrations.find((item) => item.provider === 'slack').status, 'Disconnected');
  const dbIntegration = await Integration.findOne({ owner: user._id, provider: 'slack' });
  assert.equal(dbIntegration.accessToken, null);
  assert.equal(dbIntegration.refreshToken, null);

  const persisted = await settingsService.getSettings(user._id);
  assert.equal(persisted.user.name, 'Settings Operator');
  assert.equal(persisted.settings.theme, 'system');
  assert.equal(persisted.settings.notificationPreferences.emailNotifications, true);

  const manualExpiredToken = jwt.sign({ id: user._id, sessionVersion: logoutAll.sessionVersion }, JWT_SECRET, { expiresIn: '1ms' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal((await runAuth(manualExpiredToken)).statusCode, 401);

  await io.close();
  await mongoose.disconnect();
  await mongo.stop();
  console.log('settings tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
