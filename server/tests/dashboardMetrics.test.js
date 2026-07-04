const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Workflow = require('../src/models/Workflow');
const Execution = require('../src/models/Execution');
const ExecutionLog = require('../src/models/ExecutionLog');
const workflowService = require('../src/services/workflowService');
const executionService = require('../src/services/executionService');
const orchestrator = require('../src/agents/orchestrator');
const { initSocket, emitDashboardUpdate } = require('../src/config/socket');
const { recoverStaleRunningExecutions } = require('../src/services/executionStatusService');

(async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  const ownerId = new mongoose.Types.ObjectId();
  const empty = await workflowService.getDashboardMetrics(ownerId);
  assert.strictEqual(empty.totalExecutions, 0);
  assert.strictEqual(empty.successRate, 0);
  assert.deepStrictEqual(empty.recentExecutions, []);
  assert.deepStrictEqual(empty.recentWorkflowActivity, []);

  const workflow = await Workflow.create({
    owner: ownerId,
    name: 'Metrics Workflow',
    status: 'active',
  });

  async function addExecution(status, createdAt) {
    return Execution.create({
      owner: ownerId,
      workflow: workflow._id,
      workflowSnapshot: { name: workflow.name },
      status,
      createdAt,
      updatedAt: createdAt,
    });
  }

  async function activeForSingleStatus(status) {
    const isolatedOwnerId = new mongoose.Types.ObjectId();
    const isolatedWorkflow = await Workflow.create({
      owner: isolatedOwnerId,
      name: `Single ${status}`,
      status: 'active',
    });
    if (status === 'DRAFT') {
      await Execution.collection.insertOne({
        owner: isolatedOwnerId,
        workflow: isolatedWorkflow._id,
        workflowSnapshot: { name: isolatedWorkflow.name },
        status,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      await Execution.create({
        owner: isolatedOwnerId,
        workflow: isolatedWorkflow._id,
        workflowSnapshot: { name: isolatedWorkflow.name },
        status,
      });
    }
    return (await workflowService.getDashboardMetrics(isolatedOwnerId)).activeWorkflows;
  }

  assert.strictEqual(await activeForSingleStatus('RUNNING'), 1);
  assert.strictEqual(await activeForSingleStatus('PAUSED'), 1);
  assert.strictEqual(await activeForSingleStatus('COMPLETED'), 0);
  assert.strictEqual(await activeForSingleStatus('FAILED'), 0);
  assert.strictEqual(await activeForSingleStatus('CANCELLED'), 0);
  assert.strictEqual(await activeForSingleStatus('PENDING'), 0);
  assert.strictEqual(await activeForSingleStatus('DRAFT'), 0);

  const completed = await addExecution('COMPLETED', new Date('2026-06-27T10:00:00Z'));
  let metrics = await workflowService.getDashboardMetrics(ownerId);
  assert.strictEqual(metrics.totalWorkflows, 1);
  assert.strictEqual(metrics.activeWorkflows, 0);
  assert.strictEqual(metrics.totalExecutions, 1);
  assert.strictEqual(metrics.completedExecutions, 1);
  assert.strictEqual(metrics.successRate, 100);

  const failed = await addExecution('FAILED', new Date('2026-06-27T10:01:00Z'));
  const cancelled = await addExecution('CANCELLED', new Date('2026-06-27T10:02:00Z'));
  await addExecution('RUNNING', new Date('2026-06-27T10:03:00Z'));
  metrics = await workflowService.getDashboardMetrics(ownerId);
  assert.strictEqual(metrics.activeWorkflows, 1);

  await addExecution('RUNNING', new Date('2026-06-27T10:03:30Z'));
  metrics = await workflowService.getDashboardMetrics(ownerId);
  assert.strictEqual(metrics.activeWorkflows, 2);

  await addExecution('PAUSED', new Date('2026-06-27T10:04:00Z'));
  await addExecution('PENDING', new Date('2026-06-27T10:05:00Z'));
  await Execution.collection.insertMany([
    {
      owner: ownerId,
      workflow: workflow._id,
      workflowSnapshot: { name: workflow.name },
      status: 'running',
      createdAt: new Date('2026-06-27T10:05:30Z'),
      updatedAt: new Date('2026-06-27T10:05:30Z'),
    },
    {
      owner: ownerId,
      workflow: workflow._id,
      workflowSnapshot: { name: workflow.name },
      status: 'paused',
      createdAt: new Date('2026-06-27T10:05:45Z'),
      updatedAt: new Date('2026-06-27T10:05:45Z'),
    },
  ]);

  metrics = await workflowService.getDashboardMetrics(ownerId);
  assert.strictEqual(metrics.activeWorkflows, 3);
  assert.strictEqual(metrics.totalExecutions, 9);
  assert.strictEqual(metrics.completedExecutions, 1);
  assert.strictEqual(metrics.failedExecutions, 1);
  assert.strictEqual(metrics.cancelledExecutions, 1);
  assert.strictEqual(metrics.runningExecutions, 2);
  assert.strictEqual(metrics.pausedExecutions, 1);
  assert.strictEqual(metrics.successRate, 11.11);

  const debug = await workflowService.getActiveExecutionDebug(ownerId);
  assert.strictEqual(debug.runningExecutionIds.length, 2);
  assert.strictEqual(debug.pausedExecutionIds.length, 1);

  const staleOwnerId = new mongoose.Types.ObjectId();
  const staleWorkflow = await Workflow.create({ owner: staleOwnerId, name: 'Stale Workflow', status: 'active' });
  const stale = await Execution.create({
    owner: staleOwnerId,
    workflow: staleWorkflow._id,
    workflowSnapshot: { name: staleWorkflow.name },
    status: 'RUNNING',
    startedAt: new Date('2026-06-27T09:00:00Z'),
  });
  assert.strictEqual((await workflowService.getDashboardMetrics(staleOwnerId)).activeWorkflows, 1);
  const recovered = await recoverStaleRunningExecutions({ emit: false, ownerId: staleOwnerId });
  assert.ok(recovered.some((execution) => String(execution._id) === String(stale._id)));
  const recoveredFresh = await Execution.findById(stale._id);
  assert.strictEqual(recoveredFresh.status, 'FAILED');
  assert.strictEqual((await workflowService.getDashboardMetrics(staleOwnerId)).activeWorkflows, 0);

  await ExecutionLog.create([
    {
      execution: completed._id,
      workflow: workflow._id,
      agent: 'monitoring',
      event: 'execution:completed',
      level: 'success',
      message: 'Completed',
      createdAt: new Date('2026-06-27T10:06:00Z'),
    },
    {
      execution: failed._id,
      workflow: workflow._id,
      agent: 'monitoring',
      event: 'execution:failed',
      level: 'error',
      message: 'Failed',
      createdAt: new Date('2026-06-27T10:07:00Z'),
    },
    {
      execution: cancelled._id,
      workflow: workflow._id,
      agent: 'orchestrator',
      event: 'execution:cancelled',
      level: 'info',
      message: 'Cancelled',
      createdAt: new Date('2026-06-27T10:08:00Z'),
    },
  ]);

  // A fresh dashboard read returns persisted activity in newest-first order.
  const refreshed = await workflowService.getDashboardMetrics(ownerId);
  assert.deepStrictEqual(
    refreshed.recentWorkflowActivity.map((item) => item.event),
    ['execution:cancelled', 'execution:failed', 'execution:completed']
  );
  assert.ok(refreshed.recentWorkflowActivity.every((item) => item.workflowName === workflow.name));

  // Dashboard socket updates are owner-scoped.
  const server = http.createServer();
  const io = initSocket(server);
  const emitted = [];
  io.to = (room) => ({
    emit: (event, payload) => {
      emitted.push({ room, event, payload });
    },
  });
  emitDashboardUpdate(ownerId, { event: 'execution:completed', executionId: completed._id });
  assert.strictEqual(emitted.at(-1).room, `owner:${ownerId}`);
  assert.strictEqual(emitted.at(-1).event, 'dashboard:updated');
  assert.strictEqual(emitted.at(-1).payload.event, 'execution:completed');
  assert.ok(emitted.at(-1).payload.timestamp);

  const lifecycleExecution = await addExecution('RUNNING', new Date('2026-06-27T10:09:00Z'));
  await executionService.pauseExecution(lifecycleExecution._id, ownerId);
  assert.strictEqual(emitted.at(-1).payload.event, 'execution:paused');
  assert.strictEqual(emitted.at(-1).payload.status, 'PAUSED');
  assert.ok(emitted.some((item) => item.event === 'execution:paused' && String(item.payload.executionId) === String(lifecycleExecution._id)));
  assert.ok(emitted.some((item) => item.event === 'execution:updated' && item.payload.status === 'PAUSED' && String(item.payload.executionId) === String(lifecycleExecution._id)));

  await executionService.resumeExecution(lifecycleExecution._id, ownerId);
  assert.strictEqual(emitted.at(-1).payload.event, 'execution:resumed');
  assert.strictEqual(emitted.at(-1).payload.status, 'RUNNING');
  assert.ok(emitted.some((item) => item.event === 'execution:resumed' && String(item.payload.executionId) === String(lifecycleExecution._id)));

  await executionService.cancelExecution(lifecycleExecution._id, ownerId);
  assert.strictEqual(emitted.at(-1).payload.event, 'execution:cancelled');
  assert.strictEqual(emitted.at(-1).payload.status, 'CANCELLED');
  assert.ok(emitted.some((item) => item.event === 'execution:cancelled' && String(item.payload.executionId) === String(lifecycleExecution._id)));

  const orchestrated = await addExecution('PENDING', new Date('2026-06-27T10:10:00Z'));
  await orchestrator.run(orchestrated._id);
  const orchestratedUpdates = emitted
    .filter((item) => item.event === 'dashboard:updated')
    .filter((item) => String(item.payload.executionId) === String(orchestrated._id));
  assert.deepStrictEqual(
    orchestratedUpdates.map((item) => [item.payload.event, item.payload.status]),
    [
      ['execution:started', 'RUNNING'],
      ['execution:completed', 'COMPLETED'],
    ]
  );
  assert.ok(emitted.some((item) => item.event === 'execution:started' && String(item.payload.executionId) === String(orchestrated._id)));
  assert.ok(emitted.some((item) => item.event === 'execution:completed' && String(item.payload.executionId) === String(orchestrated._id)));
  assert.ok(emitted.some((item) => item.event === 'execution:updated' && item.payload.status === 'COMPLETED' && String(item.payload.executionId) === String(orchestrated._id)));
  const completionMetricsUpdate = emitted
    .filter((item) => item.event === 'dashboard.metrics.updated')
    .filter((item) => String(item.payload.executionId) === String(orchestrated._id))
    .find((item) => item.payload.event === 'execution:completed');
  assert.ok(completionMetricsUpdate);
  assert.strictEqual(completionMetricsUpdate.payload.metrics.activeWorkflows, 3);

  const isolatedCompletionOwnerId = new mongoose.Types.ObjectId();
  const isolatedCompletionWorkflow = await Workflow.create({
    owner: isolatedCompletionOwnerId,
    name: 'Isolated Completion Workflow',
    status: 'active',
  });
  const isolatedCompletion = await Execution.create({
    owner: isolatedCompletionOwnerId,
    workflow: isolatedCompletionWorkflow._id,
    workflowSnapshot: { name: isolatedCompletionWorkflow.name },
    status: 'PENDING',
  });
  await orchestrator.run(isolatedCompletion._id);
  const isolatedCompletionMetricsUpdate = emitted
    .filter((item) => item.event === 'dashboard.metrics.updated')
    .filter((item) => String(item.payload.executionId) === String(isolatedCompletion._id))
    .find((item) => item.payload.event === 'execution:completed');
  assert.ok(isolatedCompletionMetricsUpdate);
  assert.strictEqual(isolatedCompletionMetricsUpdate.payload.metrics.activeWorkflows, 0);
  await io.close();

  await mongoose.disconnect();
  await mongo.stop();
  console.log('dashboard metrics tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
