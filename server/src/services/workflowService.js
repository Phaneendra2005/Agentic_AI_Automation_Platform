const Workflow = require('../models/Workflow');
const Execution = require('../models/Execution');
const ExecutionLog = require('../models/ExecutionLog');

const ACTIVE_EXECUTION_STATUSES = ['RUNNING', 'PAUSED'];

function toPlainValue(value) {
  if (value && typeof value.toObject === 'function') {
    return toPlainValue(value.toObject());
  }
  if (value instanceof Date) {
    return new Date(value);
  }
  if (Array.isArray(value)) {
    return value.map(toPlainValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, toPlainValue(child)])
    );
  }
  return value;
}

function buildWorkflowSnapshot(workflowLike = {}) {
  const source = toPlainValue(workflowLike);
  return {
    name: source.name || '',
    description: source.description || '',
    status: source.status || 'draft',
    trigger: toPlainValue(source.trigger || {}),
    nodes: Array.isArray(source.nodes) ? toPlainValue(source.nodes) : [],
    edges: Array.isArray(source.edges) ? toPlainValue(source.edges) : [],
    tags: Array.isArray(source.tags) ? source.tags.slice() : [],
    prompt: source.prompt || '',
  };
}

function stableStringify(value) {
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function snapshotsEqual(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function createHistoryEntry(version, snapshot) {
  return {
    version,
    snapshot,
    createdAt: new Date(),
  };
}

async function getDashboardMetrics(ownerId) {
  const activityEvents = [
    'execution:started',
    'execution:completed',
    'execution:failed',
    'execution:cancelled',
    'execution:paused',
    'execution:resumed',
  ];

  const [totalWorkflows, activeWorkflows, recentWorkflows, executionCounts, recentExecutions, activity] = await Promise.all([
    Workflow.countDocuments({ owner: ownerId }),
    Execution.countDocuments({ owner: ownerId, status: { $in: ACTIVE_EXECUTION_STATUSES } }),
    Workflow.find({ owner: ownerId }).sort({ updatedAt: -1 }).limit(5).select('name status updatedAt lastExecutedAt tags'),
    Execution.aggregate([
      { $match: { owner: ownerId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Execution.find({ owner: ownerId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('workflow', 'name'),
    ExecutionLog.aggregate([
      { $match: { event: { $in: activityEvents } } },
      {
        $lookup: {
          from: 'executions',
          localField: 'execution',
          foreignField: '_id',
          as: 'executionRecord',
        },
      },
      { $unwind: '$executionRecord' },
      { $match: { 'executionRecord.owner': ownerId } },
      {
        $lookup: {
          from: 'workflows',
          localField: 'workflow',
          foreignField: '_id',
          as: 'workflowRecord',
        },
      },
      {
        $project: {
          _id: 1,
          event: 1,
          createdAt: 1,
          workflow: 1,
          execution: 1,
          workflowName: {
            $ifNull: [
              { $arrayElemAt: ['$workflowRecord.name', 0] },
              '$executionRecord.workflowSnapshot.name',
            ],
          },
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const counts = Object.fromEntries(executionCounts.map(({ _id, count }) => [_id, count]));
  const totalExecutions = executionCounts.reduce((sum, item) => sum + item.count, 0);
  const completedExecutions = counts.COMPLETED || 0;

  return {
    totalWorkflows,
    activeWorkflows,
    totalExecutions,
    completedExecutions,
    failedExecutions: counts.FAILED || 0,
    cancelledExecutions: counts.CANCELLED || 0,
    runningExecutions: counts.RUNNING || 0,
    pausedExecutions: counts.PAUSED || 0,
    successRate: totalExecutions === 0
      ? 0
      : Number(((completedExecutions / totalExecutions) * 100).toFixed(2)),
    recentExecutions,
    recentWorkflowActivity: activity.map((entry) => ({
      _id: entry._id,
      executionId: entry.execution,
      workflowId: entry.workflow,
      workflowName: entry.workflowName || 'Workflow',
      event: entry.event,
      status: {
        'execution:started': 'RUNNING',
        'execution:completed': 'COMPLETED',
        'execution:failed': 'FAILED',
        'execution:cancelled': 'CANCELLED',
        'execution:paused': 'PAUSED',
        'execution:resumed': 'RUNNING',
      }[entry.event],
      timestamp: entry.createdAt,
    })),
    recentWorkflows,
  };
}

async function getActiveExecutionDebug(ownerId) {
  const [runningExecutions, pausedExecutions] = await Promise.all([
    Execution.find({ owner: ownerId, status: 'RUNNING' }).select('_id workflow createdAt startedAt updatedAt'),
    Execution.find({ owner: ownerId, status: 'PAUSED' }).select('_id workflow createdAt startedAt updatedAt'),
  ]);
  return {
    runningExecutionIds: runningExecutions.map((execution) => execution._id.toString()),
    pausedExecutionIds: pausedExecutions.map((execution) => execution._id.toString()),
    runningExecutions,
    pausedExecutions,
  };
}

async function listWorkflows(ownerId, { page = 1, limit = 20, status, search, tags, sortBy, sortDir } = {}) {
  const filter = { owner: ownerId };
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { tags: { $regex: search, $options: 'i' } },
    ];
  }
  if (tags) {
    const tagArray = Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim()).filter(Boolean);
    if (tagArray.length > 0) {
      filter.tags = { 
        $all: tagArray.map(t => {
          const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(`^${escaped}$`, 'i');
        })
      };
    }
  }

  const sort = {};
  if (sortBy) {
    sort[sortBy] = sortDir === 'asc' ? 1 : -1;
  } else {
    sort.updatedAt = -1;
  }

  const skip = (page - 1) * limit;
  const [workflows, total] = await Promise.all([
    Workflow.find(filter).sort(sort).skip(skip).limit(limit).select('-nodes -edges'),
    Workflow.countDocuments(filter),
  ]);
  return { workflows, total, page, pages: Math.ceil(total / limit) };
}

async function getWorkflow(id, ownerId) {
  const workflow = await Workflow.findOne({ _id: id, owner: ownerId });
  if (!workflow) {
    const err = new Error('Workflow not found');
    err.statusCode = 404;
    throw err;
  }
  return workflow;
}

async function createWorkflow(ownerId, data) {
  return Workflow.create({ ...data, owner: ownerId, version: data.version || 1, versionHistory: [] });
}

async function updateWorkflow(id, ownerId, data) {
  const workflow = await Workflow.findOne({ _id: id, owner: ownerId });
  if (!workflow) {
    const err = new Error('Workflow not found');
    err.statusCode = 404;
    throw err;
  }

  const updatePayload = {
    name: data.name ?? workflow.name ?? '',
    description: data.description ?? workflow.description ?? '',
    status: data.status ?? workflow.status ?? 'draft',
    trigger: data.trigger ?? workflow.trigger ?? {},
    nodes: data.nodes ?? workflow.nodes ?? [],
    edges: data.edges ?? workflow.edges ?? [],
    tags: data.tags ?? workflow.tags ?? [],
    prompt: data.prompt ?? workflow.prompt ?? '',
  };

  const currentSnapshot = buildWorkflowSnapshot(workflow);
  const nextSnapshot = buildWorkflowSnapshot(updatePayload);
  const hasChanges = !snapshotsEqual(currentSnapshot, nextSnapshot);

  const versionHistory = [...(workflow.versionHistory || [])];
  const nextVersion = hasChanges ? workflow.version + 1 : workflow.version;

  if (hasChanges) {
    versionHistory.push(createHistoryEntry(workflow.version, currentSnapshot));
  }

  const savedWorkflow = await Workflow.findOneAndUpdate(
    { _id: id, owner: ownerId },
    {
      $set: {
        ...updatePayload,
        version: nextVersion,
        versionHistory: versionHistory.slice(-20),
      },
    },
    { new: true, runValidators: true }
  );

  return savedWorkflow;
}

async function restoreWorkflowVersion(id, ownerId, version) {
  const workflow = await Workflow.findOne({ _id: id, owner: ownerId });
  if (!workflow) {
    const err = new Error('Workflow not found');
    err.statusCode = 404;
    throw err;
  }

  const targetEntry = (workflow.versionHistory || []).find((entry) => entry.version === Number(version));
  if (!targetEntry) {
    const err = new Error('Workflow version not found');
    err.statusCode = 404;
    throw err;
  }

  const snapshot = targetEntry.snapshot || {};
  const updatePayload = {
    name: snapshot.name ?? workflow.name ?? '',
    description: snapshot.description ?? workflow.description ?? '',
    status: snapshot.status ?? workflow.status ?? 'draft',
    trigger: snapshot.trigger ?? workflow.trigger ?? {},
    nodes: snapshot.nodes ?? workflow.nodes ?? [],
    edges: snapshot.edges ?? workflow.edges ?? [],
    tags: snapshot.tags ?? workflow.tags ?? [],
    prompt: snapshot.prompt ?? workflow.prompt ?? '',
  };

  const currentSnapshot = buildWorkflowSnapshot(workflow);
  const restoredSnapshot = buildWorkflowSnapshot(updatePayload);
  if (snapshotsEqual(currentSnapshot, restoredSnapshot)) {
    return workflow;
  }

  const versionHistory = [...(workflow.versionHistory || [])];
  versionHistory.push(createHistoryEntry(workflow.version, currentSnapshot));

  return Workflow.findOneAndUpdate(
    { _id: id, owner: ownerId },
    {
      $set: {
        ...updatePayload,
        version: workflow.version + 1,
        versionHistory: versionHistory.slice(-20),
      },
    },
    { new: true, runValidators: true }
  );
}

async function duplicateWorkflow(id, ownerId) {
  const source = await getWorkflow(id, ownerId);
  const copy = source.toObject();
  delete copy._id;
  delete copy.createdAt;
  delete copy.updatedAt;
  copy.name = `${copy.name} (copy)`;
  copy.status = 'draft';
  copy.version = 1;
  copy.versionHistory = [];
  copy.lastExecutedAt = undefined;
  return Workflow.create(copy);
}

async function deleteWorkflow(id, ownerId) {
  const workflow = await Workflow.findOneAndDelete({ _id: id, owner: ownerId });
  if (!workflow) {
    const err = new Error('Workflow not found');
    err.statusCode = 404;
    throw err;
  }
  return workflow;
}

module.exports = {
  getDashboardMetrics,
  getActiveExecutionDebug,
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  restoreWorkflowVersion,
  duplicateWorkflow,
  deleteWorkflow,
};
