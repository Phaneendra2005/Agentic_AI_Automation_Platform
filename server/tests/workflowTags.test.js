const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Workflow = require('../src/models/Workflow');
const User = require('../src/models/User');
const workflowService = require('../src/services/workflowService');

let mongoServer;

async function setup() {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), {});
}

async function teardown() {
  await mongoose.disconnect();
  await mongoServer.stop();
}

async function clearDB() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

async function runTests() {
  try {
    await setup();

    const user = await User.create({ name: 'Test', email: 'test@example.com', password: 'password123' });
    const ownerId = user._id;

    // Test 1: Create workflow with valid tags
    console.log('Testing: Create workflow with valid tags');
    const wf1 = await workflowService.createWorkflow(ownerId, {
      name: 'Valid tags',
      tags: ['Email', 'Finance']
    });
    if (wf1.tags.length !== 2) throw new Error('Expected 2 tags');

    // Test 2: Reject empty tags
    console.log('Testing: Reject empty tags');
    try {
      await workflowService.createWorkflow(ownerId, { name: 'Empty tag', tags: [''] });
      throw new Error('Should have failed validation');
    } catch (e) {
      if (!e.errors?.['tags.0']) throw e;
    }

    // Test 3: Reject > 30 characters
    console.log('Testing: Reject > 30 characters tags');
    try {
      await workflowService.createWorkflow(ownerId, { name: 'Long tag', tags: ['a'.repeat(31)] });
      throw new Error('Should have failed validation');
    } catch (e) {
      if (!e.errors?.['tags.0']) throw e;
    }

    // Test 4: Reject > 10 tags
    console.log('Testing: Reject > 10 tags');
    try {
      await workflowService.createWorkflow(ownerId, { 
        name: 'Many tags', 
        tags: Array.from({length: 11}, (_, i) => `tag${i}`) 
      });
      throw new Error('Should have failed validation');
    } catch (e) {
      if (!e.errors?.tags) throw e;
    }

    // Test 5: Reject case-insensitive duplicates
    console.log('Testing: Reject case-insensitive duplicates');
    try {
      await workflowService.createWorkflow(ownerId, { 
        name: 'Duplicate', 
        tags: ['Email', 'email'] 
      });
      throw new Error('Should have failed validation');
    } catch (e) {
      if (!e.errors?.tags) throw e;
    }

    // Test 6: Update tags
    console.log('Testing: Update tags');
    const wfUpdated = await workflowService.updateWorkflow(wf1._id, ownerId, {
      tags: ['Email', 'Production']
    });
    if (wfUpdated.tags.length !== 2 || wfUpdated.tags[1] !== 'Production') {
      throw new Error('Update failed');
    }

    // Test 7: Default empty array
    console.log('Testing: Default empty tags');
    const wfDefault = await workflowService.createWorkflow(ownerId, { name: 'Default' });
    if (!Array.isArray(wfDefault.tags) || wfDefault.tags.length !== 0) {
      throw new Error('Expected empty array');
    }

    // Test 8: Search by tags
    console.log('Testing: Search by tags');
    const searchRes = await workflowService.listWorkflows(ownerId, { search: 'Production' });
    if (searchRes.workflows.length !== 1 || searchRes.workflows[0].name !== 'Valid tags') {
      throw new Error('Search failed');
    }

    // Test 9: Filter by tags
    console.log('Testing: Filter by tags');
    const filterRes = await workflowService.listWorkflows(ownerId, { tags: ['Email', 'Production'] });
    if (filterRes.workflows.length !== 1) {
      throw new Error('Filter failed');
    }

    // Test 9.5: Case-insensitive Filter by tags
    console.log('Testing: Case-insensitive filter by tags');
    const filterCaseRes = await workflowService.listWorkflows(ownerId, { tags: ['eMaiL', 'producTion'] });
    if (filterCaseRes.workflows.length !== 1) {
      throw new Error('Case-insensitive filter failed');
    }

    // Test 10: Sort by tags
    console.log('Testing: Sort by tags');
    await workflowService.createWorkflow(ownerId, { name: 'Sort1', tags: ['Zebra'] });
    await workflowService.createWorkflow(ownerId, { name: 'Sort2', tags: ['Apple'] });
    
    const sortResAsc = await workflowService.listWorkflows(ownerId, { sortBy: 'tags', sortDir: 'asc', limit: 10 });
    // Empty array tags go first usually in MongoDB, so let's filter to just the ones with tags
    const workflowsWithTagsAsc = sortResAsc.workflows.filter(w => w.tags.length > 0);
    // Sort logic depends on MongoDB, but Apple should be before Zebra
    const aIndex = workflowsWithTagsAsc.findIndex(w => w.name === 'Sort2');
    const zIndex = workflowsWithTagsAsc.findIndex(w => w.name === 'Sort1');
    if (aIndex >= zIndex) {
      throw new Error(`Sort failed: Apple (${aIndex}) should be before Zebra (${zIndex})`);
    }

    console.log('✅ All workflow tags tests passed.');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exitCode = 1;
  } finally {
    await teardown();
  }
}

runTests();
