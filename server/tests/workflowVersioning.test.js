const assert = require('assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Workflow = require('../src/models/Workflow');
const workflowService = require('../src/services/workflowService');

(async () => {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  await mongoose.connect(uri);

  const ownerId = new mongoose.Types.ObjectId();
  const workflow = await workflowService.createWorkflow(ownerId, {
    name: 'Test Workflow',
    description: 'Original description',
    status: 'draft',
    nodes: [{ id: 'n1', type: 'trigger_manual', data: { label: 'Start' } }],
    edges: [],
    trigger: { type: 'manual' },
    tags: ['original'],
    prompt: 'Original prompt',
  });

  assert.strictEqual(workflow.version, 1);

  const updated = await workflowService.updateWorkflow(workflow._id, ownerId, {
    name: 'Test Workflow',
    description: 'Updated description',
    status: 'active',
    nodes: [{ id: 'n1', type: 'trigger_manual', data: { label: 'Start' } }, { id: 'n2', type: 'action_email', data: { label: 'Send Email' } }],
    edges: [{ id: 'e1', source: 'n1', target: 'n2', data: { condition: 'always' } }],
    trigger: { type: 'schedule', cron: '0 * * * *' },
    tags: ['updated'],
    prompt: 'Updated prompt',
  });
  assert.strictEqual(updated.version, 2);

  // Saving an identical state must not create a version.
  const unchanged = await workflowService.updateWorkflow(workflow._id, ownerId, {
    name: 'Test Workflow',
    description: 'Updated description',
    status: 'active',
    nodes: updated.nodes,
    edges: updated.edges,
    trigger: updated.trigger,
    tags: ['updated'],
    prompt: 'Updated prompt',
  });
  assert.strictEqual(unchanged.version, 2);

  // Restoring an older version persists its complete workflow snapshot.
  const restored = await workflowService.restoreWorkflowVersion(workflow._id, ownerId, 1);
  assert.strictEqual(restored.version, 3);
  assert.strictEqual(restored.description, 'Original description');
  assert.strictEqual(restored.status, 'draft');
  assert.deepStrictEqual(restored.trigger, { type: 'manual' });
  assert.strictEqual(restored.nodes.length, 1);
  assert.strictEqual(restored.edges.length, 0);
  assert.deepStrictEqual(restored.tags, ['original']);
  assert.strictEqual(restored.prompt, 'Original prompt');

  const reloadedAfterRestore = await workflowService.getWorkflow(workflow._id, ownerId);
  assert.strictEqual(reloadedAfterRestore.version, 3);
  assert.strictEqual(reloadedAfterRestore.nodes.length, 1);
  assert.strictEqual(reloadedAfterRestore.description, 'Original description');

  // Restoring a snapshot identical to the current state is a no-op.
  const historyLength = reloadedAfterRestore.versionHistory.length;
  const restoredWithoutChanges = await workflowService.restoreWorkflowVersion(workflow._id, ownerId, 1);
  assert.strictEqual(restoredWithoutChanges.version, 3);
  assert.strictEqual(restoredWithoutChanges.versionHistory.length, historyLength);

  // A subsequent real state change is the only operation that increments again.
  const changedAfterRestore = await workflowService.updateWorkflow(workflow._id, ownerId, {
    name: 'Test Workflow',
    description: 'Changed after restore',
    status: 'draft',
    nodes: restoredWithoutChanges.nodes,
    edges: restoredWithoutChanges.edges,
    trigger: restoredWithoutChanges.trigger,
    tags: restoredWithoutChanges.tags,
    prompt: restoredWithoutChanges.prompt,
  });
  assert.strictEqual(changedAfterRestore.version, 4);

  await mongoose.disconnect();
  await mongo.stop();
  console.log('workflow versioning tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
