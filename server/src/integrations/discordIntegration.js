const axios = require('axios');
const BaseIntegration = require('./baseIntegration');
const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI } = require('../config/env');

class DiscordIntegration extends BaseIntegration {
  async send({ channelId, message }) {
    console.log('DiscordIntegration.send called with:', { channelId, message: typeof message === 'string' ? '[redacted]' : typeof message });

    if (!channelId) {
      const err = new Error('Missing channelId');
      err.code = 'DISCORD_MISSING_CHANNEL';
      throw err;
    }

    // Prefer bot token from environment; fall back to stored token only if present.
    const botToken = DISCORD_BOT_TOKEN || null;
    const userToken = this.tokens?.accessToken || null;

    let useBot = false;
    let authHeader = null;

    if (botToken) {
      useBot = true;
      authHeader = `Bot ${botToken}`;
      console.log('Using configured DISCORD_BOT_TOKEN for message send');
    } else if (userToken) {
      // We don't recommend using user tokens for bot actions. Fail loudly and explain.
      console.warn('No DISCORD_BOT_TOKEN configured; user OAuth token present but cannot be used to send bot messages');
      const err = new Error('Discord bot token not configured. Set DISCORD_BOT_TOKEN (bot token) in server env.');
      err.code = 'DISCORD_BOT_TOKEN_MISSING';
      throw err;
    } else {
      const err = new Error('Discord bot token not configured and no user token available');
      err.code = 'DISCORD_BOT_TOKEN_MISSING';
      throw err;
    }

    try {
      console.log(`Requested channel: ${channelId}`);
      const res = await axios.post(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        { content: message },
        { headers: { Authorization: authHeader, 'Content-Type': 'application/json' }, timeout: 10000 }
      );

      console.log('Discord API response:', res.data);
      return { messageId: res.data.id };
    } catch (err) {
      // Normalize axios errors and map to specific codes
      const resp = err.response;
      if (resp && resp.data) {
        console.error('Discord API error body:', resp.data);
        const apiCode = resp.data.code;
        const msg = resp.data.message || JSON.stringify(resp.data);

        // Map common Discord error codes
        // 10003 = Unknown Channel
        if (apiCode === 10003 || (msg && msg.toLowerCase().includes('unknown channel'))) {
          const e = new Error(`Discord channel not found: ${channelId}`);
          e.code = 'DISCORD_CHANNEL_NOT_FOUND';
          throw e;
        }

        // 50001 = Missing Access (bot not in channel/guild)
        if (apiCode === 50001 || (msg && msg.toLowerCase().includes('missing access'))) {
          const e = new Error(`Bot missing access to channel: ${channelId}`);
          e.code = 'DISCORD_MISSING_ACCESS';
          throw e;
        }

        // 50013 = Missing Permissions
        if (apiCode === 50013 || (msg && msg.toLowerCase().includes('missing permissions'))) {
          const e = new Error(`Bot missing permissions for channel: ${channelId}`);
          e.code = 'DISCORD_MISSING_PERMISSIONS';
          throw e;
        }

        // 401 unauthorized
        if (resp.status === 401 || (msg && msg.toLowerCase().includes('unauthorized'))) {
          const e = new Error('Discord authentication failed (invalid or expired token)');
          e.code = 'DISCORD_INVALID_TOKEN';
          throw e;
        }

        const e = new Error(`Discord API error: ${msg}`);
        e.code = 'DISCORD_API_ERROR';
        throw e;
      }

      // Network or unexpected error
      const e = new Error(err.message || 'Unknown Discord error');
      e.code = 'DISCORD_API_ERROR';
      throw e;
    }
  }

  async receive() {
    return { messages: [] };
  }
}

function getOAuthUrl(state) {
  // Validate configuration
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_REDIRECT_URI) {
    const err = new Error('Discord OAuth misconfigured: missing client id/secret/redirect uri');
    err.code = 'DISCORD_OAUTH_MISCONFIGURED';
    throw err;
  }

  // Required scopes for server listing and bot installation
  const scopes = ['identify', 'guilds', 'bot', 'applications.commands'];
  const permissions = '8';

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: scopes.join(' '),
    permissions,
    state,
  });

  const url = `https://discord.com/api/oauth2/authorize?${params}`;

  console.log('Generated Discord OAuth URL:', url);
  console.log('Scopes:', scopes.join(' '));
  console.log('Permissions:', permissions);
  console.log('Redirect URI:', DISCORD_REDIRECT_URI);

  return url;
}

async function exchangeCode(code) {
  const res = await axios.post(
    'https://discord.com/api/oauth2/token',
    new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: DISCORD_REDIRECT_URI,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token,
    expiresAt: new Date(Date.now() + res.data.expires_in * 1000),
    scopes: (res.data.scope || '').split(' '),
  };
}

module.exports = { DiscordIntegration, getOAuthUrl, exchangeCode };
