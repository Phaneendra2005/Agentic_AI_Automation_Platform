const mongoose = require('mongoose');

const agentMemorySchema = new mongoose.Schema(
  {
    workflow: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow' },
    execution: { type: mongoose.Schema.Types.ObjectId, ref: 'Execution' },
    agent: { type: String, required: true },
    key: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed },
    confidence: { type: Number, min: 0, max: 1 },
  },
  { timestamps: true }
);

agentMemorySchema.index({ execution: 1, agent: 1 });

module.exports = mongoose.model('AgentMemory', agentMemorySchema);
