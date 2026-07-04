const ExecutionLog = require('../models/ExecutionLog');
const AgentMemory = require('../models/AgentMemory');

async function run(execution, workflow, emit) {
  emit('planner', 'info', 'planner:start', 'Planner agent analysing workflow structure');

  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];

  // Build adjacency for topological sort
  const adjList = {};
  const inDegree = {};
  nodes.forEach((n) => { adjList[n.id] = []; inDegree[n.id] = 0; });
  edges.forEach((e) => {
    if (adjList[e.source]) adjList[e.source].push(e.target);
    if (inDegree[e.target] !== undefined) inDegree[e.target]++;
  });

  // Kahn's topological sort
  const queue = nodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    (adjList[id] || []).forEach((next) => {
      inDegree[next]--;
      if (inDegree[next] === 0) queue.push(next);
    });
  }

  const confidence = order.length === nodes.length ? 0.95 : 0.6;

  await AgentMemory.create({
    execution: execution._id,
    workflow: workflow._id,
    agent: 'planner',
    key: 'nodeOrder',
    value: order,
    confidence,
  });

  await ExecutionLog.create({
    execution: execution._id,
    workflow: workflow._id,
    agent: 'planner',
    level: 'success',
    event: 'planner:complete',
    message: `Execution plan created — ${order.length} nodes, confidence ${(confidence * 100).toFixed(0)}%`,
    metadata: { order, confidence },
  });

  emit('planner', 'success', 'planner:complete', `Plan ready — ${order.length} nodes ordered`, { order, confidence });

  return { order, confidence };
}

module.exports = { run };
