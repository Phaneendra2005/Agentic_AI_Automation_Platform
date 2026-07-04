const crypto = require('crypto');
const Integration = require('../models/Integration');
const { CREDENTIAL_ENCRYPTION_KEY } = require('../config/env');

// ─── AES-256-GCM encryption ──────────────────────────────────────────────────

const KEY = Buffer.from(CREDENTIAL_ENCRYPTION_KEY || '0'.repeat(64), 'hex');

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(stored) {
  if (!stored) return null;
  try {
    const [ivHex, tagHex, encryptedHex] = stored.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch {
    return null;
  }
}

// ─── Service API ─────────────────────────────────────────────────────────────

async function listIntegrations(ownerId) {
  const integrations = await Integration.find({ owner: ownerId });
  return integrations.map((i) => ({
    _id: i._id,
    provider: i.provider,
    connected: i.connected,
    scopes: i.scopes,
    accountEmail: i.accountEmail,
    expiresAt: i.expiresAt,
    error: i.error,
    updatedAt: i.updatedAt,
  }));
}

async function getStatus(ownerId) {
  const all = await Integration.find({ owner: ownerId });
  const byProvider = Object.fromEntries(all.map((i) => [i.provider, i]));
  const providers = ['gmail', 'slack', 'google-sheets', 'discord'];
  return providers.map((p) => {
    const integ = byProvider[p];
    return {
      provider: p,
      connected: integ?.connected || false,
      accountEmail: integ?.accountEmail || null,
      expiresAt: integ?.expiresAt || null,
      updatedAt: integ?.updatedAt || null,
      error: integ?.error || null,
    };
  });
}

async function saveTokens(ownerId, provider, { accessToken, refreshToken, expiresAt, accountEmail, scopes }) {
  return Integration.findOneAndUpdate(
    { owner: ownerId, provider },
    {
      connected: true,
      accessToken: encrypt(accessToken),
      refreshToken: encrypt(refreshToken),
      expiresAt,
      accountEmail,
      scopes: scopes || [],
      error: null,
    },
    { upsert: true, new: true }
  );
}

async function getTokens(ownerId, provider) {
  const integ = await Integration.findOne({ owner: ownerId, provider });
  if (!integ || !integ.connected) {
    const err = new Error(`INTEGRATION_NOT_CONNECTED: ${provider}`);
    err.code = 'INTEGRATION_NOT_CONNECTED';
    err.statusCode = 400;
    throw err;
  }
  const now = new Date();
  if (integ.expiresAt && integ.expiresAt < now) {
    const err = new Error(`AUTH_EXPIRED: ${provider}`);
    err.code = 'AUTH_EXPIRED';
    err.statusCode = 401;
    throw err;
  }
  return {
    accessToken: decrypt(integ.accessToken),
    refreshToken: decrypt(integ.refreshToken),
    expiresAt: integ.expiresAt,
    accountEmail: integ.accountEmail,
  };
}

async function disconnectIntegration(ownerId, provider) {
  return Integration.findOneAndUpdate(
    { owner: ownerId, provider },
    { connected: false, accessToken: null, refreshToken: null, expiresAt: null },
    { new: true }
  );
}

module.exports = { listIntegrations, getStatus, saveTokens, getTokens, disconnectIntegration, encrypt, decrypt };
