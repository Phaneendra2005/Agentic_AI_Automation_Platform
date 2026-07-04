const settingsService = require('../services/settingsService');

async function getSettings(req, res, next) {
  try {
    const data = await settingsService.getSettings(req.user._id);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
}

async function updateProfile(req, res, next) {
  try {
    const data = await settingsService.updateProfile(req.user._id, req.body);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
}

async function updatePassword(req, res, next) {
  try {
    const data = await settingsService.updatePassword(req.user._id, req.body);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
}

async function updateTheme(req, res, next) {
  try {
    const data = await settingsService.updateTheme(req.user._id, req.body.theme);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
}

async function updateNotifications(req, res, next) {
  try {
    const data = await settingsService.updateNotifications(req.user._id, req.body.notificationPreferences || req.body);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
}

async function logoutAll(req, res, next) {
  try {
    const data = await settingsService.logoutAll(req.user._id);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
}

async function getHealth(req, res, next) {
  try {
    const health = await settingsService.getSystemHealth();
    res.json({ success: true, health });
  } catch (err) { next(err); }
}

async function getApiKeys(req, res, next) {
  try {
    res.json({
      success: true,
      apiKeys: settingsService.getApiKeyHealth(),
      encryption: settingsService.getEncryptionHealth(),
    });
  } catch (err) { next(err); }
}

async function getIntegrations(req, res, next) {
  try {
    const integrations = await settingsService.getIntegrationStatus(req.user._id);
    res.json({ success: true, integrations });
  } catch (err) { next(err); }
}

async function disconnectIntegration(req, res, next) {
  try {
    const data = await settingsService.disconnectIntegration(req.user._id, req.params.provider);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
}

async function reconnectIntegration(req, res, next) {
  try {
    const data = await settingsService.reconnectIntegration(req.user._id, req.params.provider);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
}

async function testIntegration(req, res, next) {
  try {
    const data = await settingsService.testIntegration(req.user._id, req.params.provider);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
}

module.exports = {
  getSettings,
  updateProfile,
  updatePassword,
  updateTheme,
  updateNotifications,
  logoutAll,
  getHealth,
  getApiKeys,
  getIntegrations,
  disconnectIntegration,
  reconnectIntegration,
  testIntegration,
};
