const { google } = require('googleapis');
const BaseIntegration = require('./baseIntegration');
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = require('../config/env');

class SheetsIntegration extends BaseIntegration {
  _getClient() {
    const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
    auth.setCredentials({
      access_token: this.tokens.accessToken,
      refresh_token: this.tokens.refreshToken,
    });
    return google.sheets({ version: 'v4', auth });
  }

  async send({ spreadsheetId, range, values }) {
    const sheets = this._getClient();

    if (!spreadsheetId || String(spreadsheetId).trim() === '') {
      const err = new Error('Spreadsheet ID is required for Google Sheets append row.');
      err.code = 'MISSING_SPREADSHEET_ID';
      throw err;
    }

    if (!range || String(range).trim() === '') {
      const err = new Error('Range is required for Google Sheets append row.');
      err.code = 'MISSING_RANGE';
      throw err;
    }

    if (values === undefined || values === null || (typeof values === 'string' && values.trim() === '')) {
      const err = new Error('Values are required for Google Sheets append row.');
      err.code = 'MISSING_VALUES';
      throw err;
    }

    let parsed = values;
    if (typeof values === 'string') {
      try {
        parsed = JSON.parse(values);
      } catch (parseErr) {
        const err = new Error('Values must be valid JSON array of rows, for example [["A","B","C"]].');
        err.code = 'MISSING_VALUES';
        throw err;
      }
    }

    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((row) => Array.isArray(row))) {
      const err = new Error('Values must be a non-empty array of row arrays, for example [["A","B","C"]].');
      err.code = 'MISSING_VALUES';
      throw err;
    }

    const res = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: parsed },
    });
    return { updatedRange: res.data.updates?.updatedRange };
  }

  async receive({ spreadsheetId, range }) {
    const sheets = this._getClient();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return { values: res.data.values || [] };
  }
}

function getOAuthUrl(state) {
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  return auth.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/spreadsheets'],
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

module.exports = { SheetsIntegration, getOAuthUrl, exchangeCode };
