const mongoose = require('mongoose');

const executionLogSchema = new mongoose.Schema(
  {
    execution: { type: mongoose.Schema.Types.ObjectId, ref: 'Execution', required: true },
    workflow: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow' },
    node: { type: String },
    agent: {
      type: String,
      enum: ['planner', 'execution', 'validation', 'recovery', 'monitoring', 'orchestrator'],
    },
    level: { type: String, enum: ['info', 'warning', 'error', 'success'], default: 'info' },
    event: { type: String },
    message: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

executionLogSchema.index({ execution: 1, createdAt: 1 });

module.exports = mongoose.model('ExecutionLog', executionLogSchema);
