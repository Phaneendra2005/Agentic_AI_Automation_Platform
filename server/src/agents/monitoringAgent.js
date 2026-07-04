const ExecutionLog = require('../models/ExecutionLog');
const Notification = require('../models/Notification');
const settingsService = require('../services/settingsService');

async function createNotificationIfAllowed(execution, workflow, status, meta) {
  const settings = await settingsService.getOrCreateSettings(execution.owner);
  const prefs = {
    ...settingsService.DEFAULT_NOTIFICATION_PREFERENCES,
    ...(settings.notificationPreferences?.toObject?.() || settings.notificationPreferences || {}),
  };

  if (status === 'COMPLETED' && !prefs.workflowCompleted) return null;
  if (status === 'FAILED' && !prefs.workflowFailed) return null;

  const isSuccess = status === 'COMPLETED';
  const notification = await Notification.create({
    owner: execution.owner,
    workflow: execution.workflow,
    execution: execution._id,
    type: isSuccess ? 'success' : 'failure',
    title: `Workflow ${isSuccess ? 'completed' : 'failed'}`,
    message: isSuccess
      ? `"${workflow.name}" finished successfully`
      : `"${workflow.name}" failed - ${meta?.error || 'Unknown error'}`,
  });

  try {
    const { getIO } = require('../config/socket');
    getIO().to(`owner:${execution.owner}`).emit('notification:new', notification);
  } catch {}

  return notification;
}

async function run(execution, workflow, status, meta, emit) {
  emit('monitoring', 'info', 'monitoring:update', `Execution status: ${status}`, meta);

  await ExecutionLog.create({
    execution: execution._id,
    workflow: workflow._id,
    agent: 'monitoring',
    level: status === 'COMPLETED' ? 'success' : status === 'FAILED' ? 'error' : 'info',
    event: `execution:${status.toLowerCase()}`,
    message: `Execution ${status.toLowerCase()}`,
    metadata: meta,
  });

  if (['COMPLETED', 'FAILED'].includes(status)) {
    const isSuccess = status === 'COMPLETED';
    await createNotificationIfAllowed(execution, workflow, status, meta);

    emit(
      'monitoring',
      isSuccess ? 'success' : 'error',
      `execution:${status.toLowerCase()}`,
      `Workflow ${isSuccess ? 'completed' : 'failed'}: ${workflow.name}`,
      meta
    );
  }
}

module.exports = { run };
