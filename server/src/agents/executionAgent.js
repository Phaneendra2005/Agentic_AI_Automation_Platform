const ExecutionLog = require('../models/ExecutionLog');
const Execution = require('../models/Execution');
const integrationService = require('../services/integrationService');
const { SlackIntegration } = require('../integrations/slackIntegration');
const { GmailIntegration } = require('../integrations/gmailIntegration');
const { DiscordIntegration } = require('../integrations/discordIntegration');
const { SheetsIntegration } = require('../integrations/sheetsIntegration');
const { checkInputs } = require('./validationAgent');

async function testDelay() {
  if (process.env.EXECUTION_TEST_DELAY === 'true') {
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
}

// Loads the stored (decrypted) token for one provider and returns a live
// integration instance.  getTokens() throws INTEGRATION_NOT_CONNECTED or
// AUTH_EXPIRED — both propagate straight up through runNode so the outer
// catch in run() can attach nodeId and re-throw to the orchestrator.
async function loadIntegration(ownerId, provider) {
  const tokens = await integrationService.getTokens(ownerId, provider);
  switch (provider) {
    case 'slack':         return new SlackIntegration(tokens);
    case 'gmail':         return new GmailIntegration(tokens);
    case 'discord':       return new DiscordIntegration(tokens);
    case 'google-sheets': return new SheetsIntegration(tokens);
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}

async function runNode(node, context, execution) {
  // data.nodeType is set by the canvas for new nodes; node.nodeType (top-level)
  // is the fallback for nodes saved before that fix; node.type is 'default'.
  const type = node.data?.nodeType || node.nodeType || node.type || 'unknown';

  // Pre-execution field check: reject before touching any integration.
  // checkInputs() returns an Error with code='MISSING_FIELDS' or null.
  const inputErr = checkInputs(node);
  if (inputErr) throw inputErr;

  let result;
  switch (type) {
    case 'action_email': {
      const gmail = await loadIntegration(execution.owner, 'gmail');
      result = await gmail.send(node.data);
      break;
    }

    case 'action_slack': {
      const slack = await loadIntegration(execution.owner, 'slack');
      result = await slack.send(node.data);
      break;
    }

    case 'action_discord': {
      const discord = await loadIntegration(execution.owner, 'discord');
      result = await discord.send(node.data);
      break;
    }

    case 'action_sheets': {
      const sheets = await loadIntegration(execution.owner, 'google-sheets');
      const operation = node.data?.operation || 'append';
      result = operation === 'read'
        ? await sheets.receive(node.data)
        : await sheets.send(node.data);
      break;
    }

    case 'ai_generate':
    case 'ai_classify': {
      const { OPENROUTER_API_KEY } = require('../config/env');
      if (OPENROUTER_API_KEY) {
        const axios = require('axios');
        const res = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model: 'openai/gpt-4o-mini',
            messages: [{ role: 'user', content: node.data?.prompt || node.data?.input || 'Process this.' }],
          },
          { headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` }, timeout: 20000 }
        );
        result = { output: res.data.choices[0].message.content };
      } else {
        result = { simulated: true, output: `[AI output for: ${node.data?.label}]` };
      }
      break;
    }

    case 'trigger_manual':
    case 'trigger_schedule':
      result = { output: { triggered: true } };
      break;

    case 'logic_condition':
    case 'logic_filter':
      result = { output: { passed: true } };
      break;

    default:
      result = { output: { executed: true, type } };
  }

  if (result && typeof result === 'object') {
    const hasSuccess = 'success' in result;
    const hasOutput = 'output' in result;
    const hasMetadata = 'metadata' in result;

    if (!hasSuccess && !hasOutput) {
      result = { success: true, output: result, metadata: {} };
    } else {
      const { output = {}, metadata = {}, success = true, ...rest } = result;
      result = {
        success,
        output,
        metadata: { ...metadata, ...rest },
      };
    }
  }

  if (result && typeof result === 'object' && !('metadata' in result)) {
    result.metadata = {};
  }

  return result;
}

// checkActive is a one-argument closure supplied by the orchestrator:
//   (stepLabel) => assertActive(executionId, workflowId, stepLabel, emitFn)
// It throws ExecutionCancelledError on CANCELLED and polls on PAUSED.
// Default is a no-op so the function can be unit-tested without an orchestrator.
async function run(execution, workflow, order, emit, checkActive = async () => {}) {
  // Convert Mongoose subdocuments to plain objects so that n.id (which can be
  // shadowed by Mongoose's `id` virtual when _id:false is set) and Mixed-typed
  // fields like n.data.label are reliably accessible via plain property access.
  const rawNodes = (workflow.nodes || []).map((n) =>
    typeof n.toObject === 'function' ? n.toObject() : { ...n }
  );
  const nodeMap = Object.fromEntries(rawNodes.map((n) => [n.id, n]));
  const results = {};

  for (const nodeId of order) {
    const node = nodeMap[nodeId];
    if (!node) continue;

    const label = node.data?.label || node.label || node.data?.nodeType || node.nodeType || nodeId;

    // ── Pause / Cancel checkpoint ─────────────────────────────────────────
    // Called OUTSIDE the try/catch below so that ExecutionCancelledError
    // propagates directly to the orchestrator without being logged as a node
    // error or triggering the node-error recovery path.
    await checkActive(label);

    await Execution.findByIdAndUpdate(execution._id, { currentNode: nodeId });
    emit('execution', 'info', 'node:start', `Executing node: ${label}`, { nodeId });

    try {
      const output = await runNode(node, results, execution);
      results[nodeId] = output;

      await ExecutionLog.create({
        execution: execution._id,
        workflow: workflow._id,
        agent: 'execution',
        node: nodeId,
        level: 'success',
        event: 'node:complete',
        message: `Node completed: ${label}`,
        metadata: { output },
      });

      emit('execution', 'success', 'node:complete', `Node completed: ${label}`, { nodeId, output });
      await testDelay();
    } catch (err) {
      console.error(`[executionAgent] Node failed: ${label}`, err && err.stack ? err.stack : err);
      const eventMessage = `${label} failed: ${err.message}`;
      await ExecutionLog.create({
        execution: execution._id,
        workflow: workflow._id,
        agent: 'execution',
        node: nodeId,
        level: 'error',
        event: 'node:error',
        message: eventMessage,
        metadata: { error: err.message, code: err.code, missing: err.missing },
      });
      emit('execution', 'error', 'node:error', eventMessage, { nodeId, error: err.message, code: err.code, missing: err.missing });
      throw Object.assign(err, { nodeId });
    }
  }

  return results;
}

module.exports = { run };
