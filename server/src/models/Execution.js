const mongoose = require('mongoose');

const executionSchema = new mongoose.Schema(
  {
    workflow: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow', required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    workflowSnapshot: { type: mongoose.Schema.Types.Mixed },
    status: {
      type: String,
      enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRYING', 'PAUSED', 'CANCELLED'],
      default: 'PENDING',
    },
    currentNode: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
    duration: { type: Number },
    input: { type: mongoose.Schema.Types.Mixed, default: {} },
    output: { type: mongoose.Schema.Types.Mixed, default: {} },
    error: { type: String },
    retryCount: { type: Number, default: 0 },
    langGraph: { type: String, enum: ['available', 'not-installed'], default: 'not-installed' },
  },
  { timestamps: true }
);

executionSchema.index({ owner: 1, createdAt: -1 });
executionSchema.index({ workflow: 1 });
executionSchema.index({ status: 1 });

module.exports = mongoose.model('Execution', executionSchema);
