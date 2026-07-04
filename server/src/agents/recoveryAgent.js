const ExecutionLog = require('../models/ExecutionLog');

const FAILURE_TYPES = {
  MISSING_FIELDS:            'escalate',        // retrying without the missing data never helps
  API_FAILURE:               'retry_with_backoff',
  AUTH_EXPIRED:              'escalate',
  INTEGRATION_NOT_CONNECTED: 'escalate',
  RATE_LIMIT:                'retry_with_backoff',
  TRANSIENT:                 'retry_with_backoff',
  SLACK_CHANNEL_NOT_FOUND:   'escalate',
  SLACK_BOT_NOT_IN_CHANNEL:  'escalate',
  SLACK_API_ERROR:           'retry_with_backoff',
  DISCORD_CHANNEL_NOT_FOUND:  'escalate',
  DISCORD_MISSING_ACCESS:     'escalate',
  DISCORD_MISSING_PERMISSIONS:'escalate',
  DISCORD_INVALID_TOKEN:      'escalate',
  DISCORD_BOT_TOKEN_MISSING:  'escalate',
  DISCORD_API_ERROR:         'retry_with_backoff',
};

function classifyError(err) {
  // Check explicit machine-readable codes first — these are set by integrationService
  // and validationAgent so they're authoritative and don't rely on message parsing.
  if (err.code === 'MISSING_FIELDS' || err.code === 'MISSING_SPREADSHEET_ID' || err.code === 'MISSING_RANGE' || err.code === 'MISSING_VALUES') return 'MISSING_FIELDS';
  if (err.code === 'INTEGRATION_NOT_CONNECTED')  return 'INTEGRATION_NOT_CONNECTED';
  if (err.code === 'AUTH_EXPIRED')               return 'AUTH_EXPIRED';
  if (err.code === 'SLACK_CHANNEL_NOT_FOUND')    return 'SLACK_CHANNEL_NOT_FOUND';
  if (err.code === 'SLACK_BOT_NOT_IN_CHANNEL')   return 'SLACK_BOT_NOT_IN_CHANNEL';
  if (err.code === 'SLACK_API_ERROR')            return 'SLACK_API_ERROR';
  if (err.code === 'SLACK_INVALID_CHANNEL')      return 'MISSING_FIELDS';
  if (err.code === 'DISCORD_CHANNEL_NOT_FOUND')  return 'DISCORD_CHANNEL_NOT_FOUND';
  if (err.code === 'DISCORD_MISSING_ACCESS')     return 'DISCORD_MISSING_ACCESS';
  if (err.code === 'DISCORD_MISSING_PERMISSIONS')return 'DISCORD_MISSING_PERMISSIONS';
  if (err.code === 'DISCORD_INVALID_TOKEN')      return 'DISCORD_INVALID_TOKEN';
  if (err.code === 'DISCORD_BOT_TOKEN_MISSING')  return 'DISCORD_BOT_TOKEN_MISSING';
  if (err.code === 'DISCORD_API_ERROR')          return 'DISCORD_API_ERROR';

  // Fall back to message heuristics only when no code is set.
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('integration_not_connected'))              return 'INTEGRATION_NOT_CONNECTED';
  if (msg.includes('auth_expired'))                          return 'AUTH_EXPIRED';
  if (msg.includes('auth') || msg.includes('token') || msg.includes('unauthorized')) return 'AUTH_EXPIRED';
  if (msg.includes('rate') || msg.includes('429'))           return 'RATE_LIMIT';
  if (msg.includes('timeout') || msg.includes('network'))    return 'TRANSIENT';
  if (msg.includes('missing required') || msg.includes('missing field')) return 'MISSING_FIELDS';
  if (msg.includes('channel') && msg.includes('not found'))   return 'SLACK_CHANNEL_NOT_FOUND';
  if (msg.includes('not in channel'))                         return 'SLACK_BOT_NOT_IN_CHANNEL';
  return 'API_FAILURE';
}

async function run(execution, workflow, error, validationFailures, emit) {
  emit('recovery', 'info', 'recovery:start', 'Recovery agent analysing failures');

  const errorType = error ? classifyError(error) : (validationFailures?.length ? 'MISSING_FIELDS' : null);
  if (!errorType) {
    emit('recovery', 'success', 'recovery:skip', 'No failures to recover from');
    return { action: 'none' };
  }

  const action = FAILURE_TYPES[errorType] || 'escalate';

  await ExecutionLog.create({
    execution: execution._id,
    workflow: workflow._id,
    agent: 'recovery',
    level: action === 'escalate' ? 'error' : 'warning',
    event: 'recovery:decision',
    message: `Failure type: ${errorType} → action: ${action}`,
    metadata: { errorType, action, error: error?.message, code: error?.code },
  });

  emit(
    'recovery',
    action === 'escalate' ? 'error' : 'warning',
    'recovery:decision',
    `${errorType} → ${action}`,
    { errorType, action, code: error?.code }
  );

  return { action, errorType };
}

module.exports = { run, classifyError };
