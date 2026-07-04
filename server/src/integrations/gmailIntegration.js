const { google } = require('googleapis');
const BaseIntegration = require('./baseIntegration');
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = require('../config/env');

class GmailIntegration extends BaseIntegration {
  _getClient() {
    const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
    auth.setCredentials({
      access_token: this.tokens.accessToken,
      refresh_token: this.tokens.refreshToken,
    });
    return google.gmail({ version: 'v1', auth });
  }

  async send({ to, subject, body }) {
    const gmail = this._getClient();
    const raw = Buffer.from(
      `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
    ).toString('base64url');
    const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return { messageId: res.data.id, threadId: res.data.threadId };
  }

  async receive({ maxResults = 10 }) {
    const gmail = this._getClient();
    const list = await gmail.users.messages.list({ userId: 'me', maxResults });
    return { messages: list.data.messages || [] };
  }
}

function getOAuthUrl(state) {
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  return auth.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
    state,
    prompt: 'consent',
  });
}

async function exchangeCode(code) {
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  const { tokens } = await auth.getToken(code);
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scopes: tokens.scope?.split(' ') || [],
  };
}

module.exports = { GmailIntegration, getOAuthUrl, exchangeCode };
