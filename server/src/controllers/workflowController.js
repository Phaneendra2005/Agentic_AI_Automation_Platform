const workflowService = require('../services/workflowService');
const aiGenerationService = require('../services/aiGenerationService');
const executionService = require('../services/executionService');

async function getDashboard(req, res, next) {
  try {
    const metrics = await workflowService.getDashboardMetrics(req.user._id);
    res.json({ success: true, ...metrics });
  } catch (err) {
    next(err);
  }
}

async function getDashboardActiveDebug(req, res, next) {
  try {
    const debug = await workflowService.getActiveExecutionDebug(req.user._id);
    console.log('[DashboardActiveDebug]', {
      ownerId: req.user._id,
      runningExecutionIds: debug.runningExecutionIds,
      pausedExecutionIds: debug.pausedExecutionIds,
    });
    res.json({ success: true, ...debug });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const result = await workflowService.listWorkflows(req.user._id, {
      ...req.query,
      search: req.query.search,
      tags: req.query.tags,
      sortBy: req.query.sortBy,
      sortDir: req.query.sortDir,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const workflow = await workflowService.getWorkflow(req.params.id, req.user._id);
    res.json({ success: true, workflow });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const workflow = await workflowService.createWorkflow(req.user._id, req.body);
    res.status(201).json({ success: true, workflow });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const workflow = await workflowService.updateWorkflow(req.params.id, req.user._id, req.body);
    const { emitWorkflowUpdate } = require('../config/socket');
    emitWorkflowUpdate(req.user._id, workflow);
    res.json({ success: true, workflow });
  } catch (err) {
    next(err);
  }
}

async function restoreVersion(req, res, next) {
  try {
    const workflow = await workflowService.restoreWorkflowVersion(req.params.id, req.user._id, req.body.version);
    res.json({ success: true, workflow });
  } catch (err) {
    next(err);
  }
}

async function duplicate(req, res, next) {
  try {
    const workflow = await workflowService.duplicateWorkflow(req.params.id, req.user._id);
    res.status(201).json({ success: true, workflow });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await workflowService.deleteWorkflow(req.params.id, req.user._id);
    res.json({ success: true, message: 'Workflow deleted' });
  } catch (err) {
    next(err);
  }
}

async function generate(req, res, next) {
  try {
    const { prompt } = req.body;
    if (!prompt?.trim()) {
      return res.status(400).json({ success: false, message: 'Prompt is required' });
    }
    const generated = await aiGenerationService.generateWorkflow(prompt.trim());
    console.log(`[AI Generation] provider used: ${generated.source}`);
    // Persist the generated workflow
    const workflow = await workflowService.createWorkflow(req.user._id, {
      name: generated.name || prompt.slice(0, 80),
      description: generated.description || prompt,
      nodes: generated.nodes || [],
      edges: generated.edges || [],
      prompt: prompt.trim(),
      status: 'draft',
    });
    res.status(201).json({ success: true, workflow, source: generated.source });
  } catch (err) {
    next(err);
  }
}

async function execute(req, res, next) {
  try {
    const execution = await executionService.startExecution(req.params.id, req.user._id, req.body.input);
    res.status(202).json({ success: true, execution });
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboard, getDashboardActiveDebug, list, get, create, update, restoreVersion, duplicate, remove, generate, execute };
