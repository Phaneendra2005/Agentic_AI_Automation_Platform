const { OPENROUTER_API_KEY, GEMINI_API_KEY } = require('../config/env');
const axios = require('axios');
const { v4: uuid } = require('uuid');

// ─── node normalisation ───────────────────────────────────────────────────────
// LLMs sometimes omit data.label (especially on trigger nodes), place it at the
// top level instead of inside data, or set `type` to the semantic nodeType value
// rather than 'default'.  This function fixes all three so every node that enters
// the DB is in a consistent shape regardless of generation source.

const DEFAULT_LABELS = {
  trigger_manual:   'Manual Trigger',
  trigger_schedule: 'Scheduled Trigger',
  action_email:     'Send Email',
  action_slack:     'Slack Message',
  action_discord:   'Discord Message',
  action_sheets:    'Google Sheets',
  ai_generate:      'AI Generate',
  ai_classify:      'AI Classify',
  logic_condition:  'Condition',
  logic_filter:     'Filter',
};

function normalizeNode(node) {
  // Resolve the semantic type: prefer data.nodeType, then top-level nodeType, then
  // node.type only if it isn't 'default' (in that case the LLM put the semantic
  // type in the wrong field).
  const nodeType =
    node.data?.nodeType ||
    node.nodeType ||
    (node.type !== 'default' ? node.type : undefined) ||
    'unknown';

  // Resolve the display label: data.label first, then top-level label (LLM mistake),
  // then a friendly fallback derived from the semantic type.
  const label =
    node.data?.label ||
    node.label ||
    DEFAULT_LABELS[nodeType] ||
    nodeType;

  const normalizedData = {
    ...node.data,
    label,
    nodeType,
  };

  if (nodeType === 'action_sheets' && !normalizedData.operation) {
    normalizedData.operation = 'append';
  }

  return {
    ...node,
    type: 'default',    // React Flow render type — always the built-in default renderer
    data: normalizedData,
  };
}

// ─── deterministic rule-based builder ───────────────────────────────────────

const RULE_PATTERNS = [
  {
    keywords: ['email', 'gmail', 'send mail', 'invoice'],
    build: (prompt) => makeGraph(prompt, [
      { type: 'trigger_manual', label: 'Manual Trigger' },
      { type: 'ai_generate', label: 'Generate Email Body' },
      { type: 'action_email', label: 'Send Email' },
    ]),
  },
  {
    keywords: ['slack', 'notify slack', 'slack message'],
    build: (prompt) => makeGraph(prompt, [
      { type: 'trigger_manual', label: 'Manual Trigger' },
      { type: 'action_slack', label: 'Post to Slack' },
    ]),
  },
  {
    keywords: ['discord', 'discord message', 'discord bot'],
    build: (prompt) => makeGraph(prompt, [
      { type: 'trigger_manual', label: 'Manual Trigger' },
      { type: 'action_discord', label: 'Post to Discord' },
    ]),
  },
  {
    keywords: ['sheet', 'spreadsheet', 'google sheet', 'append row', 'log to sheet'],
    build: (prompt) => makeGraph(prompt, [
      { type: 'trigger_manual', label: 'Manual Trigger' },
      { type: 'action_sheets', label: 'Append to Sheet' },
    ]),
  },
  {
    keywords: ['invoice', 'route', 'routing', 'classify'],
    build: (prompt) => makeGraph(prompt, [
      { type: 'trigger_manual', label: 'Manual Trigger' },
      { type: 'ai_classify', label: 'Classify Input' },
      { type: 'logic_condition', label: 'Check Category' },
      { type: 'action_email', label: 'Send Notification' },
    ]),
  },
];

function makeGraph(prompt, steps) {
  const nodes = steps.map((step, i) => ({
    id: uuid(),
    type: 'default',
    position: { x: 250, y: i * 140 + 60 },
    data: { label: step.label, nodeType: step.type },
  }));

  const edges = nodes.slice(0, -1).map((n, i) => ({
    id: uuid(),
    source: n.id,
    target: nodes[i + 1].id,
    animated: true,
    type: 'default',
  }));

  return { nodes, edges, name: prompt.slice(0, 80), description: prompt, prompt };
}

function ruleBasedGenerate(prompt) {
  const lower = prompt.toLowerCase();
  for (const pattern of RULE_PATTERNS) {
    if (pattern.keywords.some((k) => lower.includes(k))) {
      return { ...pattern.build(prompt), source: 'rule-based' };
    }
  }
  // default: two-node fallback
  return {
    ...makeGraph(prompt, [
      { type: 'trigger_manual', label: 'Manual Trigger' },
      { type: 'ai_generate', label: 'AI Action' },
    ]),
    source: 'rule-based',
  };
}

// ─── LLM prompt template ─────────────────────────────────────────────────────

function buildSystemPrompt() {
  return `You are a workflow generation engine. Given a user automation prompt, return ONLY a valid JSON object (no markdown, no explanation) with this exact shape:
{
  "name": "Short workflow name",
  "description": "What this workflow does",
  "nodes": [
    { "id": "uuid", "type": "default", "position": { "x": 250, "y": 60 }, "data": { "label": "Manual Trigger", "nodeType": "trigger_manual" } },
    { "id": "uuid", "type": "default", "position": { "x": 250, "y": 200 }, "data": { "label": "Send Email", "nodeType": "action_email" } }
  ],
  "edges": [
    { "id": "uuid", "source": "first-node-id", "target": "second-node-id", "animated": true, "type": "default" }
  ]
}
Rules:
- node.type MUST always be "default" (never use the nodeType value here).
- data.label is REQUIRED on EVERY node — including the first trigger node. Never omit it.
- data.nodeType holds the semantic type.
Available nodeTypes: trigger_manual, trigger_schedule, action_email, action_slack, action_discord, action_sheets, ai_generate, ai_classify, logic_condition, logic_filter.
Space nodes 140px apart vertically starting at y=60, x=250. Use valid UUIDs for ids.`;
}

// ─── OpenRouter ───────────────────────────────────────────────────────────────

async function generateWithOpenRouter(prompt) {
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Agentflow AI',
      },
      timeout: 30000,
    }
  );
  const content = response.data.choices[0].message.content.trim();
console.log('[AI] ✅ Generated workflow using OpenRouter');
return { ...JSON.parse(content), source: 'openrouter' };
}

// ─── Google Gemini ────────────────────────────────────────────────────────────

async function generateWithGemini(prompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const result = await model.generateContent(
    `${buildSystemPrompt()}\n\nUser prompt: ${prompt}`
  );
  const text = result.response.text().trim();
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}') + 1;
const parsed = JSON.parse(text.slice(jsonStart, jsonEnd));
console.log('[AI] ✅ Generated workflow using Gemini');
return { ...parsed, source: 'gemini' };
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function generateWorkflow(prompt) {
  let result;

  if (OPENROUTER_API_KEY) {
    try {
      result = await generateWithOpenRouter(prompt);
    } catch (err) {
      console.warn('[AI] OpenRouter failed, trying Gemini:', err.message);
    }
  }

  if (!result && GEMINI_API_KEY) {
    try {
      result = await generateWithGemini(prompt);
    } catch (err) {
      console.warn('[AI] Gemini failed, falling back to rule-based:', err.message);
    }
  }

  if (!result) {
    console.log('[AI] Using rule-based generation');
    result = ruleBasedGenerate(prompt);
  }

  // Normalise every node regardless of generation source so the DB always
  // receives consistent shapes: type='default', data.label present, data.nodeType set.
  result.nodes = (result.nodes || []).map(normalizeNode);
  return result;
}

module.exports = { generateWorkflow };
