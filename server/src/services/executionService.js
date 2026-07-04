const Execution = require('../models/Execution');
const ExecutionLog = require('../models/ExecutionLog');
const Workflow = require('../models/Workflow');
const { enqueueExecution, tryRemoveJob } = require('../queues/executionQueue');
const { broadcastDashboardMetrics, broadcastExecutionUpdate, transitionExecutionStatus } = require('./executionStatusService');

async function startExecution(workflowId, ownerId, input = {}) {
  const workflow = await Workflow.findOne({ _id: workflowId, owner: ownerId });
  if (!workflow) {
    const err = new Error('Workflow not found');
    err.statusCode = 404;
    throw err;
  }

  const execution = await Execution.create({
    workflow: workflow._id,
    owner: ownerId,
    workflowSnapshot: workflow.toObject(),
    input,
    status: 'PENDING',
  });

  await enqueueExecution(execution._id.toString());
  await broadcastExecutionUpdate(ownerId, execution._id, 'execution:created', {
    previousStatus: null,
    newStatus: 'PENDING',
    workflowId: workflow._id,
    workflowName: workflow.name,
  });
  await broadcastDashboardMetrics(ownerId, {
    event: 'execution:created',
    executionId: execution._id,
    workflowId: workflow._id,
    workflowName: workflow.name,
    previousStatus: null,
    status: 'PENDING',
    newStatus: 'PENDING',
  });

  return execution;
}

const SORT_MAP = {
  newest:   { createdAt: -1 },
  oldest:   { createdAt:  1 },
  longest:  { duration:  -1 },
  shortest: { duration:   1 },
};

async function listExecutions(ownerId, { page = 1, limit = 20, status, workflowId, sort = 'newest' } = {}) {
  const filter = { owner: ownerId };
  if (status) filter.status = status;
  if (workflowId) filter.workflow = workflowId;

  const sortSpec = SORT_MAP[sort] || SORT_MAP.newest;
  const pageNum  = Math.max(1, Number(page)  || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [executions, total] = await Promise.all([
    Execution.find(filter)
      .sort(sortSpec)
      .skip(skip)
      .limit(limitNum)
      .populate('workflow', 'name'),
    Execution.countDocuments(filter),
  ]);
  return { executions, total, page: pageNum, pages: Math.ceil(total / limitNum) };
}

async function getExecution(id, ownerId) {
  const execution = await Execution.findOne({ _id: id, owner: ownerId }).populate('workflow', 'name');
  if (!execution) {
    const err = new Error('Execution not found');
    err.statusCode = 404;
    throw err;
  }
  return execution;
}

async function getTimeline(id, ownerId) {
  await getExecution(id, ownerId);
  return ExecutionLog.find({ execution: id }).sort({ createdAt: 1 });
}

async function pauseExecution(id, ownerId) {
  return updateStatus(id, ownerId, 'RUNNING', 'PAUSED', 'execution:paused');
}

async function cancelExecution(id, ownerId) {
  const execution = await updateStatus(id, ownerId, ['RUNNING', 'PAUSED', 'PENDING', 'RETRYING'], 'CANCELLED', 'execution:cancelled');
  // For PENDING executions: evict the job from the BullMQ queue so it never
  // starts.  For RUNNING executions the orchestrator's assertActive() polling
  // detects the status change and stops at the next step boundary.
  // Fire-and-forget — failure to remove the job is harmless because the
  // orchestrator now checks status atomically before claiming RUNNING.
  tryRemoveJob(id.toString()).catch(() => {});
  return execution;
}

async function updateStatus(id, ownerId, fromStatus, toStatus, event) {
  // Fetch first so we know the actual current status and can produce a
  // human-readable error rather than the opaque "not found or wrong status".
  const execution = await Execution.findOne({ _id: id, owner: ownerId });
  if (!execution) {
    const err = new Error('Execution not found');
    err.statusCode = 404;
    throw err;
  }

  return transitionExecutionStatus(execution, toStatus, { allowed: fromStatus, event });
}

async function resumeExecution(id, ownerId) {
  // Setting status back to RUNNING is all that's needed: the orchestrator job
  // is still alive, polling assertActive() every 2 s, and will detect the change
  // and continue from where it paused.  Re-enqueuing here would spin up a second
  // job and cause duplicate node execution.
  // Limitation: if the server restarts while an execution is paused, the polling
  // job is lost.  The user would need to cancel and re-run the workflow in that case.
  return updateStatus(id, ownerId, 'PAUSED', 'RUNNING', 'execution:resumed');
}

module.exports = {
  startExecution,
  listExecutions,
  getExecution,
  getTimeline,
  pauseExecution,
  resumeExecution,
  cancelExecution,
};
