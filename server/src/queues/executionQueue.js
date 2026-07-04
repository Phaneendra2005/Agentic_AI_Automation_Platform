const queueManager = require('./queueManager');
const orchestrator = require('../agents/orchestrator');

async function init() {
  await queueManager.init(async (data) => {
    const { executionId } = data;
    await orchestrator.run(executionId);
  });
}

async function enqueueExecution(executionId) {
  await queueManager.enqueue({ executionId });
}

// Best-effort removal of a BullMQ job that hasn't been picked up yet.
// Called by cancelExecution for PENDING executions so the job never starts.
// Active jobs are handled by the orchestrator's assertActive() polling.
async function tryRemoveJob(executionId) {
  await queueManager.removeJob(executionId);
}

module.exports = { init, enqueueExecution, tryRemoveJob };
