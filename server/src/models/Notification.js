const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    workflow: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow' },
    execution: { type: mongoose.Schema.Types.ObjectId, ref: 'Execution' },
    type: {
      type: String,
      enum: ['success', 'failure', 'escalation', 'info'],
      default: 'info',
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ owner: 1, createdAt: -1 });
notificationSchema.index({ owner: 1, read: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
