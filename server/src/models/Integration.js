const mongoose = require('mongoose');

const integrationSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    provider: {
      type: String,
      enum: ['gmail', 'slack', 'google-sheets', 'discord', 'openrouter', 'gemini'],
      required: true,
    },
    connected: { type: Boolean, default: false },
    scopes: { type: [String], default: [] },
    accessToken: { type: String },
    refreshToken: { type: String },
    expiresAt: { type: Date },
    accountEmail: { type: String },
    error: { type: String },
  },
  { timestamps: true }
);

integrationSchema.index({ owner: 1, provider: 1 }, { unique: true });

module.exports = mongoose.model('Integration', integrationSchema);
