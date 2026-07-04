const Execution = require('../models/Execution');
const ExecutionLog = require('../models/ExecutionLog');
const workflowService = require('./workflowService');

const ACTIVE_EXECUTION_STATUSES = ['RUNNING', 'PAUSED'];

function eventToStatus(event) {
  return {
    'execution:started': 'RUNNING',
    'execution:paused': 'PAUSED',
    'execution:resumed': 'RUNNING',
    'execution:completed': 'COMPLETED',
    'execution:failed': 'FAILED',
    'execution:cancelled': 'CANCELLED',
  }[event];
}

async function getActiveWorkflowCount(ownerId) {
  return Execution.countDocuments({ owner: ownerId, status: { $in: ACTIVE_EXECUTION_STATUSES } });
}

async function logTransition({ executionId, previousStatus, newStatus, ownerId }) {
  const activeWorkflowCount = await getActiveWorkflowCount(ownerId);
  console.log(
    `[DashboardMetrics] executionId=${executionId} previousStatus=${previousStatus || 'NONE'} ` +
    `newStatus=${newStatus} activeWorkflowCount=${activeWorkflowCount}`
  );
  return activeWorkflowCount;
}

async function broadcastDashboardMetrics(ownerId, activity = {}) {
  const metrics = await workflowService.getDashboardMetrics(ownerId);
  try {
    const { getIO } = require('../config/socket');
    const io = getIO();
    const payload = {
      ...activity,
      metrics,
      activeWorkflowCount: metrics.activeWorkflows,
      timestamp: activity.timestamp || new Date().toISOString(),
    };
    io.to(`owner:${ownerId}`).emit('dashboard.metrics.updated', payload);
    io.to(`owner:${ownerId}`).emit('dashboard:updated', payload);
  } catch {}
  return metrics;
}

async function serializeExecution(executionId) {
  return Execution.findById(executionId).populate('workflow', 'name');
}

async function broadcastExecutionUpdate(ownerId, executionId, event, extra = {}) {
  try {
    const { getIO } = require('../config/socket');
    const io = getIO();
    const execution = await serializeExecution(executionId);
    if (!execution) return null;
    const payload = {
      ...extra,
      event,
      executionId: execution._id,
      execution,
      status: execution.status,
      timestamp: new Date().toISOString(),
    };
    io.to(`owner:${ownerId}`).emit(event, payload);
    io.to(`execution:${executionId}`).emit(event, payload);
    if (event !== 'execution:updated') {
      io.to(`owner:${ownerId}`).emit('execution:updated', payload);
      io.to(`execution:${executionId}`).emit('execution:updated', payload);
    }
    return payload;
  } catch {
    return null;
  }
}

async function recordActivity(execution, workflow, event) {
  const status = eventToStatus(event) || event.replace('execution:', '').toUpperCase();
  await ExecutionLog.create({
    execution: execution._id,
    workflow: workflow?._id || execution.workflow,
    agent: 'orchestrator',
    level: status === 'FAILED' ? 'error' : status === 'COMPLETED' ? 'success' : 'info',
    event,
    message: `Workflow ${status.toLowerCase()}`,
  });
}

async function emitStatusDiagnostics({ execution, previousStatus, newStatus, event, workflow }) {
  const activeWorkflowCount = await logTransition({
    executionId: execution._id,
    previousStatus,
    newStatus,
    ownerId: execution.owner,
  });
  const metrics = await broadcastDashboardMetrics(execution.owner, {
    event,
    executionId: execution._id,
    workflowId: workflow?._id || execution.workflow,
    workflowName: workflow?.name || execution.workflowSnapshot?.name || 'Workflow',
    previousStatus,
    status: newStatus,
    newStatus,
    activeWorkflowCount,
  });
  if (event) {
    await broadcastExecutionUpdate(execution.owner, execution._id, event, {
      previousStatus,
      newStatus,
      workflowId: workflow?._id || execution.workflow,
      workflowName: workflow?.name || execution.workflowSnapshot?.name || 'Workflow',
    });
  }
  return metrics;
}

async function transitionExecutionStatus(execution, toStatus, { allowed, event, workflow, patch = {} } = {}) {
  const allowedStatuses = Array.isArray(allowed) ? allowed : [allowed];
  if (allowed && !allowedStatuses.includes(execution.status)) {
    const verb = { PAUSED: 'pause', RUNNING: 'resume', CANCELLED: 'cancel' }[toStatus] || 'update';
    const err = new Error(`Cannot ${verb} execution with status ${execution.status}`);
    err.statusCode = 400;
    throw err;
  }

  const previousStatus = execution.status;
  execution.status = toStatus;
  Object.assign(execution, patch);
  await execution.save();
  if (event) await recordActivity(execution, workflow, event);
  await emitStatusDiagnostics({ execution, previousStatus, newStatus: toStatus, event, workflow });
  return execution;
}

async function recoverStaleRunningExecutions({ emit = true, ownerId } = {}) {
  const filter = { status: 'RUNNING' };
  if (ownerId) filter.owner = ownerId;
  const stale = await Execution.find(filter);
  const recovered = [];
  const now = new Date();

  for (const execution of stale) {
    const previousStatus = execution.status;
    execution.status = 'FAILED';
    execution.completedAt = now;
    execution.duration = execution.startedAt ? now - execution.startedAt : execution.duration || 0;
    execution.error = 'Recovered stale RUNNING execution on server startup';
    await execution.save();
    await ExecutionLog.create({
      execution: execution._id,
      workflow: execution.workflow,
      agent: 'orchestrator',
      level: 'error',
      event: 'execution:failed',
      message: execution.error,
    });
    const activeWorkflowCount = await logTransition({
      executionId: execution._id,
      previousStatus,
      newStatus: 'FAILED',
      ownerId: execution.owner,
    });
    if (emit) {
      await broadcastDashboardMetrics(execution.owner, {
        event: 'execution:failed',
        executionId: execution._id,
        workflowId: execution.workflow,
        workflowName: execution.workflowSnapshot?.name || 'Workflow',
        previousStatus,
        status: 'FAILED',
        newStatus: 'FAILED',
        activeWorkflowCount,
      });
    }
    recovered.push(execution);
  }

  if (recovered.length > 0) {
    console.log(`[StartupRecovery] recoveredStaleRunningExecutions=${recovered.length}`);
  }
  return recovered;
}

module.exports = {
  ACTIVE_EXECUTION_STATUSES,
  broadcastDashboardMetrics,
  broadcastExecutionUpdate,
  emitStatusDiagnostics,
  getActiveWorkflowCount,
  recoverStaleRunningExecutions,
  recordActivity,
  transitionExecutionStatus,
};
