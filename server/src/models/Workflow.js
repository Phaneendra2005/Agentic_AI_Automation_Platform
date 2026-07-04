const mongoose = require('mongoose');

const nodeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    position: { x: Number, y: Number },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const edgeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    type: { type: String, default: 'default' },
    animated: { type: Boolean, default: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const versionHistoryEntrySchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const workflowSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Workflow name is required'], trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 2000 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['draft', 'active', 'paused', 'archived'], default: 'draft' },
    trigger: { type: mongoose.Schema.Types.Mixed, default: {} },
    nodes: { type: [nodeSchema], default: [] },
    edges: { type: [edgeSchema], default: [] },
    version: { type: Number, default: 1 },
    versionHistory: { type: [versionHistoryEntrySchema], default: [] },
    tags: {
      type: [{ type: String, trim: true, minlength: [1, 'Tag cannot be empty'], maxlength: [30, 'Tag cannot exceed 30 characters'] }],
      default: [],
      validate: [
        {
          validator: function (v) {
            return v.length <= 10;
          },
          message: 'Maximum 10 tags allowed',
        },
        {
          validator: function (v) {
            const lower = v.map((tag) => tag.toLowerCase());
            return new Set(lower).size === lower.length;
          },
          message: 'Tags must be unique',
        },
      ],
    },
    lastExecutedAt: { type: Date },
    prompt: { type: String, default: '' },
  },
  { timestamps: true }
);

workflowSchema.index({ owner: 1, createdAt: -1 });
workflowSchema.index({ owner: 1, status: 1 });
workflowSchema.index({ tags: 1 });

module.exports = mongoose.model('Workflow', workflowSchema);
