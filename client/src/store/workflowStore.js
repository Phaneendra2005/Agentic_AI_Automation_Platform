import { create } from 'zustand';

// Friendly display names used when a node loaded from the DB is missing data.label.
// This covers workflows generated before the server-side normalisation was in place.
const DEFAULT_NODE_LABELS = {
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

function normalizeNode(n) {
  const nodeType =
    n.data?.nodeType ||
    n.nodeType ||
    (n.type !== 'default' ? n.type : undefined) ||
    'unknown';
  const label =
    n.data?.label ||
    DEFAULT_NODE_LABELS[nodeType] ||
    nodeType;

  const data = { ...n.data, label, nodeType };
  if (nodeType === 'action_sheets' && !data.operation) {
    data.operation = 'append';
  }

  return {
    ...n,
    type: 'default',
    data,
  };
}

const useWorkflowStore = create((set) => ({
  nodes: [],
  edges: [],
  selectedNode: null,
  workflow: null,
  isDirty: false,
  lastSavedSnapshot: null,
  canvasRevision: 0,

  setNodes: (nodes) => set({ nodes, isDirty: true }),
  setEdges: (edges) => set({ edges, isDirty: true }),
  setSelectedNode: (selectedNode) => set({ selectedNode }),
  setWorkflow: (workflow) =>
    set((state) => ({
      workflow,
      nodes: (workflow?.nodes || []).map(normalizeNode),
      edges: workflow?.edges || [],
      isDirty: false,
      selectedNode: null,
      canvasRevision: state.canvasRevision + 1,
      lastSavedSnapshot: {
        nodes: (workflow?.nodes || []).map(normalizeNode),
        edges: workflow?.edges || [],
      },
    })),
  updateWorkflowState: (data) => 
    set((state) => ({
      workflow: { ...state.workflow, ...data },
      isDirty: true,
    })),
  updateNode: (id, data) =>
    set((state) => {
      const nodes = state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n));
      const updatedNode = nodes.find((n) => n.id === id);
      return {
        nodes,
        isDirty: true,
        selectedNode: state.selectedNode?.id === id ? updatedNode : state.selectedNode,
      };
    }),
  markSaved: (nodes, edges) =>
    set({
      isDirty: false,
      lastSavedSnapshot: { nodes, edges },
    }),
  resetCanvas: () =>
    set((state) => ({
      nodes: [],
      edges: [],
      selectedNode: null,
      workflow: null,
      isDirty: false,
      lastSavedSnapshot: null,
      canvasRevision: state.canvasRevision + 1,
    })),
}));

export default useWorkflowStore;
