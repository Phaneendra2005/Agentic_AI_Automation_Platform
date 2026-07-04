const mongoose = require('mongoose');

const notificationPreferencesSchema = new mongoose.Schema(
  {
    workflowCompleted: { type: Boolean, default: true },
    workflowFailed: { type: Boolean, default: true },
    workflowStarted: { type: Boolean, default: true },
    browserNotifications: { type: Boolean, default: false },
    emailNotifications: { type: Boolean, default: false },
  },
  { _id: false }
);

const userSettingsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    theme: { type: String, enum: ['dark', 'light', 'system'], default: 'dark' },
    avatar: { type: String, default: '' },
    notificationPreferences: { type: notificationPreferencesSchema, default: () => ({}) },
    browserNotificationEnabled: { type: Boolean, default: false },
    emailNotificationEnabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSettingsSchema.index({ userId: 1 }, { unique: true });

module.exports = mongoose.model('UserSettings', userSettingsSchema);
