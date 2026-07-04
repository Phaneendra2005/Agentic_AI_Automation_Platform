const Execution = require('../models/Execution');
const ExecutionLog = require('../models/ExecutionLog');
const Workflow = require('../models/Workflow');
const plannerAgent = require('./plannerAgent');
const executionAgent = require('./executionAgent');
const validationAgent = require('./validationAgent');
const recoveryAgent = require('./recoveryAgent');
const monitoringAgent = require('./monitoringAgent');
const { emitStatusDiagnostics, recordActivity } = require('../services/executionStatusService');

let langGraphStatus = 'not-installed';
try {
  require('@langchain/langgraph');
  langGraphStatus = 'available';
} catch {}

// ─── Sentinel error ───────────────────────────────────────────────────────────
// Thrown by assertActive() when it detects a CANCELLED status.  Caught in the
// outer try/catch of run() and handled without triggering recovery or a FAILED
// finalisation — the DB status is already CANCELLED and we just need to stop.
class ExecutionCancelledError extends Error {
  constructor(msg) {
    super(msg);
    this.code = 'EXECUTION_CANCELLED';
  }
}

// ─── Active-status checkpoint ─────────────────────────────────────────────────
// Called before every agent step and before every individual workflow node.
//
// • CANCELLED  → writes a timeline log entry, emits a socket event, then throws
//                ExecutionCancelledError so the orchestrator stops immediately.
// • PAUSED     → polls the DB every 2 s until the status changes back to RUNNING
//                (user clicked Resume), then returns normally so the caller
//                continues from where it was.  Also handles cancellation that
//                arrives during the pause wait.
// • RUNNING    → returns immediately.
//
// The function is defined here and bound into a one-argument closure (checkActive)
// so every call site only needs to supply the human-readable step label.
const PAUSE_POLL_MS    = 2000;
const PAUSE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

async function assertActive(executionId, workflowId, stepLabel, emitFn) {
  const pausedAt = Date.now();

  while (true) {
    const snap = await Execution.findById(executionId, 'status').lean();
    const status = snap?.status;

    if (status === 'CANCELLED') {
      const msg = `Execution cancelled by user — stopped before: ${stepLabel}`;
      await ExecutionLog.create({
        execution: executionId,
        workflow: workflowId,
        agent: 'orchestrator',
        level: 'warning',
        event: 'execution:cancelled:acknowledged',
        message: msg,
      });
      emitFn('orchestrator', 'warning', 'execution:cancelled', msg, { stoppedBefore: stepLabel });
      throw new ExecutionCancelledError(msg);
    }

    if (status !== 'PAUSED') return; // RUNNING (or anything unexpected) → proceed

    if (Date.now() - pausedAt > PAUSE_TIMEOUT_MS) {
      throw new Error(`Execution was paused for over ${PAUSE_TIMEOUT_MS / 60000} minutes and timed out`);
    }

    // Wait then re-check.  Resume sets status back to RUNNING, breaking the loop.
    await new Promise((resolve) => setTimeout(resolve, PAUSE_POLL_MS));
  }
}

// ─── Test delay ───────────────────────────────────────────────────────────────
// Inject artificial latency between agent steps so Pause/Resume/Cancel can be
// tested manually through the UI.  Has zero effect unless EXECUTION_TEST_DELAY=true.
async function testDelay() {
  if (process.env.EXECUTION_TEST_DELAY === 'true') {
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
}

// ─── Main orchestration loop ──────────────────────────────────────────────────
async function run(executionId) {
  const execution = await Execution.findById(executionId);
  if (!execution) throw new Error(`Execution ${executionId} not found`);

  const workflow = await Workflow.findById(execution.workflow);
  if (!workflow) throw new Error(`Workflow ${execution.workflow} not found`);

  let emitFn = () => {};
  try {
    const { getIO } = require('../config/socket');
    const io = getIO();
    emitFn = (agent, level, event, message, metadata = {}) => {
      io.to(`execution:${executionId}`).emit('agent:event', {
        agent, level, event, message, metadata,
        executionId, timestamp: new Date().toISOString(),
      });
    };
  } catch {}

  // Atomically claim the execution: only transition PENDING or RETRYING → RUNNING.
  // If this update matches nothing, the execution was cancelled (or otherwise moved
  // to a terminal state) while it was waiting in the queue.  We MUST NOT overwrite
  // a CANCELLED status with RUNNING — that would make cancel completely ineffective
  // for queued jobs.
  const claimed = await Execution.findOneAndUpdate(
    { _id: executionId, status: { $in: ['PENDING', 'RETRYING'] } },
    { $set: { status: 'RUNNING', startedAt: new Date(), langGraph: langGraphStatus } },
    { new: false }
  );
  if (!claimed) {
    const snap = await Execution.findById(executionId, 'status').lean();
    console.log(`[Orchestrator] Aborting ${executionId} — status is ${snap?.status}, expected PENDING/RETRYING`);
    return;
  }

  execution.status = 'RUNNING';
  execution.startedAt = new Date();
  await recordActivity(execution, workflow, 'execution:started');
  await emitStatusDiagnostics({
    execution,
    previousStatus: claimed.status,
    newStatus: 'RUNNING',
    event: 'execution:started',
    workflow,
  });
  emitFn('orchestrator', 'info', 'execution:start', 'Orchestrator starting agent chain', { langGraph: langGraphStatus });

  // One-argument convenience wrapper — avoids repeating (executionId, workflowId,
  // emitFn) on every call site while keeping assertActive() pure and testable.
  const checkActive = (stepLabel) => assertActive(executionId, workflow._id, stepLabel, emitFn);

  try {
    // ── 0. Pre-flight check ────────────────────────────────────────────────
    // A cancel or pause that arrived in the narrow window between the DB write
    // above and the first agent step must be caught here — without this, the
    // planner always runs to completion before cancel is ever detected.
    await checkActive('planner');

    // ── 1. Planner ─────────────────────────────────────────────────────────
    const { order } = await plannerAgent.run(execution, workflow, emitFn);

    await testDelay();
    await checkActive('execution agent');   // ← checked after delay, before step 2

    // ── 2. Node execution ──────────────────────────────────────────────────
    // checkActive is forwarded so the node loop can also honour pause/cancel
    // between individual nodes (not just between top-level agent steps).
    const nodeResults = await executionAgent.run(execution, workflow, order, emitFn, checkActive);

    await testDelay();
    await checkActive('validation');        // ← checked after execution, before step 3

    // ── 3. Validation ──────────────────────────────────────────────────────
    const { valid, failures } = await validationAgent.run(execution, workflow, nodeResults, emitFn);

    await testDelay();
    await checkActive('recovery/monitoring'); // ← checked after validation, before step 4/5

    // ── 4. Recovery (if needed) ────────────────────────────────────────────
    if (!valid) {
      const recovery = await recoveryAgent.run(execution, workflow, null, failures, emitFn);
      if (recovery.action === 'escalate') {
        await finalise(executionId, 'FAILED', { error: 'Escalated after validation failures', langGraph: langGraphStatus }, workflow);
        await monitoringAgent.run(execution, workflow, 'FAILED', { error: 'Validation escalation', langGraph: langGraphStatus }, emitFn);
        return;
      }
    }

    // ── 5. Monitoring — success ────────────────────────────────────────────
    await finalise(executionId, 'COMPLETED', { nodeResults, langGraph: langGraphStatus }, workflow);
    await monitoringAgent.run(execution, workflow, 'COMPLETED', { langGraph: langGraphStatus }, emitFn);
    await Workflow.findByIdAndUpdate(workflow._id, { lastExecutedAt: new Date() });

  } catch (err) {
    // Cancellation: the API endpoint already set the DB status to CANCELLED.
    // finalise() also guards against overwriting it, but we skip recovery
    // entirely — there is nothing to recover from a deliberate user action.
    if (err.code === 'EXECUTION_CANCELLED') return;

    await recoveryAgent.run(execution, workflow, err, [], emitFn);
    await finalise(executionId, 'FAILED', { error: err.message, langGraph: langGraphStatus }, workflow);
    const fresh = await Execution.findById(executionId);
    await monitoringAgent.run(fresh, workflow, 'FAILED', { error: err.message, langGraph: langGraphStatus }, emitFn);
  }
}

// ─── finalise ─────────────────────────────────────────────────────────────────
// Belt-and-suspenders guard: never lets agent-computed outcomes (COMPLETED/FAILED)
// overwrite a status that the user explicitly set (CANCELLED, PAUSED).
// The primary defence is the early-return on ExecutionCancelledError above; this
// handles any edge-case race where something else calls finalise after a cancel.
async function finalise(executionId, status, output, workflow) {
  const now = new Date();
  const exec = await Execution.findById(executionId);
  if (!exec) return;

  if (exec.status === 'CANCELLED' || exec.status === 'PAUSED') return;

  const previousStatus = exec.status;
  const duration = exec.startedAt ? now - exec.startedAt : 0;
  await Execution.findByIdAndUpdate(executionId, {
    status,
    completedAt: now,
    duration,
    output: output || {},
    error: output?.error || null,
  });
  exec.status = status;
  exec.completedAt = now;
  exec.duration = duration;
  exec.output = output || {};
  exec.error = output?.error || null;
  await emitStatusDiagnostics({
    execution: exec,
    previousStatus,
    newStatus: status,
    event: `execution:${status.toLowerCase()}`,
    workflow,
  });
}

module.exports = { run, langGraphStatus };
