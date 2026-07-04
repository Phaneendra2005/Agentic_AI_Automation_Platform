const ExecutionLog = require('../models/ExecutionLog');

// Fields that MUST be non-empty on node.data before the execution agent calls
// the integration.  Checked pre-execution in executionAgent.runNode().
const REQUIRED_INPUTS = {
  action_email:     ['to', 'subject', 'body'],
  action_slack:     ['channel', 'message'],
  action_discord:   ['channelId', 'message'],
  ai_generate:      ['prompt'],
  ai_classify:      ['input', 'categories'],
  trigger_schedule: ['cron'],
};

const SHEETS_REQUIRED_INPUTS = {
  append: ['spreadsheetId', 'range', 'values'],
  read: ['spreadsheetId', 'range'],
};

const SHEETS_MISSING_CODES = {
  spreadsheetId: 'MISSING_SPREADSHEET_ID',
  range: 'MISSING_RANGE',
  values: 'MISSING_VALUES',
};

// Keys must match what each integration's send() or receive() method actually returns.
// If the real API call succeeded, these fields will be present.
// If execution got a simulated fallback, they won't be — causing validation
// to flag the node as failed and route to the recovery agent.
const REQUIRED_OUTPUTS = {
  action_email:   ['messageId'],    // GmailIntegration.send → { messageId, threadId }
  action_slack:   ['ts'],           // SlackIntegration.send → { ts, channel }
  action_discord: ['messageId'],    // DiscordIntegration.send → { messageId }
  ai_generate:    ['output'],
  ai_classify:    ['output'],
};

const SHEETS_REQUIRED_OUTPUTS = {
  append: ['updatedRange'], // SheetsIntegration.send → { updatedRange }
  read: ['values'],        // SheetsIntegration.receive → { values }
};

// Called by executionAgent.runNode() before touching any integration.
// Returns an Error with a specific missing-field code when required inputs are absent,
// or null if the node is ready to run.
function getRequiredInputs(node) {
  const type = node.data?.nodeType || node.nodeType || node.type;
  if (type === 'action_sheets') {
    const operation = node.data?.operation || 'append';
    return SHEETS_REQUIRED_INPUTS[operation] || SHEETS_REQUIRED_INPUTS.append;
  }
  return REQUIRED_INPUTS[type];
}

function getRequiredOutputs(node) {
  const type = node.data?.nodeType || node.nodeType || node.type;
  if (type === 'action_sheets') {
    const operation = node.data?.operation || 'append';
    return SHEETS_REQUIRED_OUTPUTS[operation] || SHEETS_REQUIRED_OUTPUTS.append;
  }
  return REQUIRED_OUTPUTS[type] || [];
}

function checkInputs(node) {
  const type = node.data?.nodeType || node.nodeType || node.type;
  const required = getRequiredInputs(node);
  if (!required) return null;

  const missing = required.filter((field) => {
    const val = node.data?.[field];
    return val === undefined || val === null || String(val).trim() === '';
  });
  if (missing.length === 0) return null;

  const humanReadable = missing.map((field) => {
    if (field === 'spreadsheetId') return 'Spreadsheet ID';
    if (field === 'range') return 'Range';
    if (field === 'values') return 'Values';
    return field;
  });

  const err = new Error(
    missing.length === 1
      ? `${humanReadable[0]} is missing.`
      : `Missing required fields: ${humanReadable.join(', ')}.`
  );

  if (type === 'action_sheets' && missing.length === 1) {
    err.code = SHEETS_MISSING_CODES[missing[0]] || 'MISSING_FIELDS';
  } else {
    err.code = 'MISSING_FIELDS';
  }
  err.missing = missing;
  return err;
}

async function run(execution, workflow, nodeResults, emit) {
  emit('validation', 'info', 'validation:start', 'Validation agent checking outputs');

  const failures = [];

  for (const node of (workflow.nodes || [])) {
    const required = getRequiredOutputs(node);
    if (!required || required.length === 0) continue;

    const result = nodeResults[node.id];
    if (!result) {
      failures.push({ nodeId: node.id, label: node.data?.label, reason: 'MISSING_OUTPUT' });
      continue;
    }

    const payload = result && typeof result === 'object' && 'output' in result ? result.output : result;
    const missing = required.filter((field) => !(field in (payload || {})));
    if (missing.length > 0) {
      failures.push({ nodeId: node.id, label: node.data?.label, reason: 'MISSING_FIELDS', missing });
    }
  }

  if (failures.length > 0) {
    await ExecutionLog.create({
      execution: execution._id,
      workflow: workflow._id,
      agent: 'validation',
      level: 'warning',
      event: 'validation:failures',
      message: `Validation found ${failures.length} issue(s)`,
      metadata: { failures },
    });
    emit('validation', 'warning', 'validation:failures', `${failures.length} validation issue(s) found`, { failures });
    return { valid: false, failures };
  }

  await ExecutionLog.create({
    execution: execution._id,
    workflow: workflow._id,
    agent: 'validation',
    level: 'success',
    event: 'validation:passed',
    message: 'All outputs validated successfully',
  });

  emit('validation', 'success', 'validation:passed', 'All outputs validated');
  return { valid: true, failures: [] };
}

module.exports = { run, checkInputs };
