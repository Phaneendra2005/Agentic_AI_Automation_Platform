const executionService = require('../services/executionService');
const { langGraphStatus } = require('../agents/orchestrator');

async function list(req, res, next) {
  try {
    const result = await executionService.listExecutions(req.user._id, req.query);
    res.json({ success: true, ...result, langGraph: langGraphStatus });
  } catch (err) { next(err); }
}

async function get(req, res, next) {
  try {
    const execution = await executionService.getExecution(req.params.id, req.user._id);
    res.json({ success: true, execution, langGraph: langGraphStatus });
  } catch (err) { next(err); }
}

async function getTimeline(req, res, next) {
  try {
    const logs = await executionService.getTimeline(req.params.id, req.user._id);
    res.json({ success: true, timeline: logs, langGraph: langGraphStatus });
  } catch (err) { next(err); }
}

async function pause(req, res, next) {
  try {
    const execution = await executionService.pauseExecution(req.params.id, req.user._id);
    res.json({ success: true, execution, langGraph: langGraphStatus });
  } catch (err) { next(err); }
}

async function resume(req, res, next) {
  try {
    const execution = await executionService.resumeExecution(req.params.id, req.user._id);
    res.json({ success: true, execution, langGraph: langGraphStatus });
  } catch (err) { next(err); }
}

async function cancel(req, res, next) {
  try {
    const execution = await executionService.cancelExecution(req.params.id, req.user._id);
    res.json({ success: true, execution, langGraph: langGraphStatus });
  } catch (err) { next(err); }
}

module.exports = { list, get, getTimeline, pause, resume, cancel };
