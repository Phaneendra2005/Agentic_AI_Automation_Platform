const { REDIS_URL } = require('../config/env');

let Queue, Worker, queueInstance, workerInstance;
let useInMemory = false;
const inMemoryHandlers = [];
const inMemoryQueue = [];

async function init(processor) {
  if (!REDIS_URL) {
    console.log('[Queue] No REDIS_URL set — using in-memory queue fallback');
    useInMemory = true;
    inMemoryHandlers.push(processor);
    return;
  }

  try {
    const bullmq = require('bullmq');
    Queue = bullmq.Queue;
    Worker = bullmq.Worker;
    const IORedis = require('ioredis');

    const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

    queueInstance = new Queue('executions', { connection });

    workerInstance = new Worker(
      'executions',
      async (job) => {
        await processor(job.data);
      },
      {
        connection,
        concurrency: 3,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      }
    );

    workerInstance.on('failed', (job, err) => {
      console.error('[Queue] Job failed:', job?.id, err.message);
    });

    console.log('[Queue] BullMQ + Redis initialised');
  } catch (err) {
    console.warn('[Queue] BullMQ/Redis failed, falling back to in-memory:', err.message);
    useInMemory = true;
    inMemoryHandlers.push(processor);
  }
}

async function enqueue(data) {
  if (useInMemory) {
    // Run immediately in next tick for in-memory fallback
    setImmediate(async () => {
      for (const handler of inMemoryHandlers) {
        try {
          await handler(data);
        } catch (err) {
          console.error('[Queue:in-memory] Job error:', err.message);
        }
      }
    });
    return;
  }
  // Use executionId as the BullMQ job ID so removeJob() can look it up directly
  // without scanning the entire queue.
  await queueInstance.add('execute', data, {
    jobId: data.executionId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });
}

// Remove a waiting/delayed BullMQ job whose execution was cancelled before the
// worker picked it up.  Active jobs (already processing) cannot be force-stopped
// via BullMQ — the orchestrator's assertActive() polling handles those.
// For the in-memory path this is a no-op: setImmediate fires immediately, so by
// the time cancel arrives the job is already active or done.
async function removeJob(executionId) {
  if (useInMemory || !queueInstance) return;
  try {
    const job = await queueInstance.getJob(executionId);
    if (!job) return;
    const state = await job.getState();
    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
      console.log(`[Queue] Removed queued job for execution ${executionId}`);
    }
  } catch (err) {
    console.warn(`[Queue] Could not remove job for ${executionId}:`, err.message);
  }
}

module.exports = { init, enqueue, removeJob };
