const jwt = require('jsonwebtoken');
const integrationService = require('../services/integrationService');
const settingsService = require('../services/settingsService');
const { emitSettingsEvent } = require('../config/socket');
const { CLIENT_URL, JWT_SECRET } = require('../config/env');

const PROVIDERS = {
  gmail: require('../integrations/gmailIntegration'),
  slack: require('../integrations/slackIntegration'),
  discord: require('../integrations/discordIntegration'),
  'google-sheets': require('../integrations/sheetsIntegration'),
};
async function list(req, res, next) {
  try {
    const integrations = await integrationService.listIntegrations(req.user._id);
    res.json({ success: true, integrations });
  } catch (err) { next(err); }
}

async function getStatus(req, res, next) {
  try {
    const status = await integrationService.getStatus(req.user._id);
    res.json({ success: true, status });
  } catch (err) { next(err); }
}

async function oauthStart(req, res, next) {
  try {
    const { provider } = req.params;
    const integration = PROVIDERS[provider];
    if (!integration) return res.status(400).json({ success: false, message: `Unknown provider: ${provider}` });

    // Sign a short-lived token that carries the user id and provider.
    // The OAuth provider echoes this back as `state` in the callback, letting us
    // identify the user without any server-side state storage.
    const state = jwt.sign(
      { userId: req.user._id.toString(), provider },
      JWT_SECRET,
      { expiresIn: '10m' }
    );

    let url;
    try {
      url = integration.getOAuthUrl(state);
    } catch (err) {
      console.error('[oauthStart] getOAuthUrl error', err.message);
      if (err.code === 'DISCORD_OAUTH_MISCONFIGURED') {
        return res.status(500).json({ success: false, code: 'DISCORD_OAUTH_MISCONFIGURED', message: err.message });
      }
      throw err;
    }

    res.json({ success: true, url });
  } catch (err) { next(err); }
}

async function oauthCallback(req, res) {
  const { provider } = req.params;
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return res.redirect(`${CLIENT_URL}/integrations?error=${encodeURIComponent(oauthError)}`);
  }

  // Validate the state token and recover the user id that initiated the flow.
  let userId;
  let targetProvider;
  try {
    const decoded = jwt.verify(state, JWT_SECRET);
    userId = decoded.userId;
    targetProvider = decoded.provider;
  } catch {
    return res.redirect(
      `${CLIENT_URL}/integrations?error=${encodeURIComponent('Invalid or expired OAuth state — please try connecting again')}`
    );
  }

  try {
    const integration = PROVIDERS[targetProvider];
    if (!integration) {
      return res.redirect(`${CLIENT_URL}/integrations?error=${encodeURIComponent(`Unknown provider: ${targetProvider}`)}`);
    }

    const tokens = await integration.exchangeCode(code);
    await integrationService.saveTokens(userId, targetProvider, tokens);
    const integrations = await settingsService.getIntegrationStatus(userId);
    emitSettingsEvent(userId, 'integration.connected', { provider: targetProvider, integrations });

    res.redirect(`${CLIENT_URL}/integrations?connected=${encodeURIComponent(targetProvider)}`);
  } catch (err) {
    console.error('[OAuth callback]', err.message);
    res.redirect(`${CLIENT_URL}/integrations?error=${encodeURIComponent(err.message)}`);
  }
}

async function oauthError(req, res) {
  res.redirect(`${CLIENT_URL}/integrations?error=${encodeURIComponent('OAuth flow failed — please try again')}`);
}

async function upsert(req, res, next) {
  try {
    const { provider, accessToken, refreshToken, expiresAt } = req.body;
    if (!PROVIDERS[provider]) {
      return res.status(400).json({ success: false, message: `Unknown provider: ${provider}` });
    }
    const integ = await integrationService.saveTokens(req.user._id, provider, { accessToken, refreshToken, expiresAt });
    res.json({ success: true, integration: { provider: integ.provider, connected: integ.connected } });
  } catch (err) { next(err); }
}

async function disconnect(req, res, next) {
  try {
    await integrationService.disconnectIntegration(req.user._id, req.params.provider);
    res.json({ success: true, message: 'Disconnected' });
  } catch (err) { next(err); }
}

module.exports = { list, getStatus, oauthStart, oauthCallback, oauthError, upsert, disconnect };
