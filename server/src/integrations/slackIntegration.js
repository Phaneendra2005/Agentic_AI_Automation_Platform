const axios = require('axios');
const BaseIntegration = require('./baseIntegration');
const { SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_REDIRECT_URI } = require('../config/env');

class SlackIntegration extends BaseIntegration {
  // Resolve channel name to channel ID using conversations.list()
  async resolveChannelId(channelInput) {
    if (!channelInput) {
      const err = new Error('Channel is required');
      err.code = 'SLACK_INVALID_CHANNEL';
      throw err;
    }

    // Strip leading # if present
    const channelName = channelInput.trim().replace(/^#/, '');
    console.log(`Requested channel: ${channelInput} → looking up: ${channelName}`);

    try {
      // Fetch all conversations (channels) the bot is a member of
      const res = await axios.post(
        'https://slack.com/api/conversations.list',
        { limit: 1000 },
        { headers: { Authorization: `Bearer ${this.tokens.accessToken}`, 'Content-Type': 'application/json' } }
      );

      if (!res.data.ok) {
        console.error(`Slack conversations.list error: ${res.data.error}`);
        if (res.data.error === 'invalid_auth') {
          const err = new Error('Slack authentication failed');
          err.code = 'AUTH_EXPIRED';
          throw err;
        }
        const err = new Error(`Slack error: ${res.data.error}`);
        err.code = 'SLACK_API_ERROR';
        throw err;
      }

      // Find the channel by name (case-insensitive match)
      const channel = res.data.channels?.find(
        (c) => c.name && c.name.toLowerCase() === channelName.toLowerCase()
      );

      if (!channel) {
        console.error(`Channel '${channelName}' not found in workspace`);
        const err = new Error(`Slack channel '${channelName}' not found`);
        err.code = 'SLACK_CHANNEL_NOT_FOUND';
        throw err;
      }

      console.log(`Resolved channel '${channelName}' to ID: ${channel.id}`);
      return channel.id;
    } catch (err) {
      // Re-throw with proper code if it's already one of ours
      if (err.code) throw err;
      
      console.error(`Channel resolution failed: ${err.message}`);
      const newErr = new Error(`Failed to resolve Slack channel: ${err.message}`);
      newErr.code = 'SLACK_API_ERROR';
      throw newErr;
    }
  }

  async send({ channel, message }) {
    try {
      // Resolve channel name to ID
      const channelId = await this.resolveChannelId(channel);

      // Send message to the resolved channel ID
      console.log(`Sending message to channel: ${channelId}`);
      const res = await axios.post(
        'https://slack.com/api/chat.postMessage',
        { channel: channelId, text: message },
        { headers: { Authorization: `Bearer ${this.tokens.accessToken}`, 'Content-Type': 'application/json' } }
      );

      console.log(`Slack API response:`, res.data);

      if (!res.data.ok) {
        const error = res.data.error || 'unknown_error';
        console.error(`Slack chat.postMessage error: ${error}`);

        // Map Slack-specific errors to our error codes
        if (error === 'channel_not_found') {
          const err = new Error(`Slack channel not found`);
          err.code = 'SLACK_CHANNEL_NOT_FOUND';
          throw err;
        }
        if (error === 'not_in_channel') {
          const err = new Error(`Bot is not a member of the Slack channel`);
          err.code = 'SLACK_BOT_NOT_IN_CHANNEL';
          throw err;
        }
        if (error === 'invalid_auth' || error === 'token_expired') {
          const err = new Error(`Slack authentication failed`);
          err.code = 'AUTH_EXPIRED';
          throw err;
        }
        if (error === 'rate_limited') {
          const err = new Error(`Slack rate limit exceeded`);
          err.code = 'RATE_LIMIT';
          throw err;
        }

        const err = new Error(`Slack error: ${error}`);
        err.code = 'SLACK_API_ERROR';
        throw err;
      }

      return { ts: res.data.ts, channel: res.data.channel };
    } catch (err) {
      // If the error already has a code, re-throw as-is
      if (err.code) throw err;

      // Wrap unexpected errors
      const newErr = new Error(err.message || 'Unknown Slack error');
      newErr.code = 'SLACK_API_ERROR';
      throw newErr;
    }
  }

  async receive() {
    return { messages: [] };
  }
}

function getOAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    scope: 'chat:write,channels:read,groups:read',
    redirect_uri: SLACK_REDIRECT_URI,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params}`;
}

async function exchangeCode(code) {
  const res = await axios.post('https://slack.com/api/oauth.v2.access', null, {
    params: { client_id: SLACK_CLIENT_ID, client_secret: SLACK_CLIENT_SECRET, code, redirect_uri: SLACK_REDIRECT_URI },
  });
  if (!res.data.ok) throw new Error(`Slack OAuth error: ${res.data.error}`);
  return {
    accessToken: res.data.access_token,
    refreshToken: null,
    expiresAt: null,
    accountEmail: res.data.authed_user?.id,
    scopes: (res.data.scope || '').split(','),
  };
}

module.exports = { SlackIntegration, getOAuthUrl, exchangeCode };
