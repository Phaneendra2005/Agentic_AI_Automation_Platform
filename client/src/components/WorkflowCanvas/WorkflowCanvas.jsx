import { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import useWorkflowStore from '@/store/workflowStore';
import { v4 as uuid } from 'uuid';

const NODE_COLORS = {
  trigger_manual: '#7c3aed',
  trigger_schedule: '#7c3aed',
  action_email: '#0891b2',
  action_slack: '#0891b2',
  action_discord: '#0891b2',
  action_sheets: '#0891b2',
  ai_generate: '#059669',
  ai_classify: '#059669',
  logic_condition: '#d97706',
  logic_filter: '#d97706',
};

function buildNodeStyle(type) {
  const color = NODE_COLORS[type] || '#6b7280';
  return {
    background: `${color}22`,
    border: `1px solid ${color}66`,
    borderRadius: 10,
    padding: '10px 14px',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    minWidth: 140,
  };
}

export default function WorkflowCanvas({ onSave, readOnly = false }) {
  const { nodes: storeNodes, edges: storeEdges, canvasRevision, setSelectedNode } = useWorkflowStore();
  const reactFlowWrapper = useRef(null);

  const [nodes, setNodes, onNodesChange] = useNodesState(
    storeNodes.map((n) => ({ ...n, style: buildNodeStyle(n.data?.nodeType || n.nodeType || n.type) }))
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);

  const { setNodes: storeSetNodes, setEdges: storeSetEdges } = useWorkflowStore();

  // A workflow load, save, or version restore replaces the complete canvas.
  // Normal edits do not change canvasRevision, so React Flow can retain transient
  // drag/selection state while the user is editing.
  useEffect(() => {
    setNodes(
      storeNodes.map((node) => ({
        ...node,
        style: buildNodeStyle(node.data?.nodeType || node.nodeType || node.type),
      }))
    );
    setEdges(storeEdges);
  }, [canvasRevision]); // eslint-disable-line react-hooks/exhaustive-deps

  // When Zustand node data changes (e.g. NodeConfigPanel updateNode call), sync the
  // data field back into the local ReactFlow state so the canvas label updates
  // immediately.  Only `data` is merged — position/dimensions/selection are left
  // to ReactFlow to avoid fighting its internal state.
  useEffect(() => {
    const byId = Object.fromEntries(storeNodes.map((n) => [n.id, n]));
    setNodes((prev) =>
      prev.map((n) => {
        const z = byId[n.id];
        return z ? { ...n, data: z.data, style: buildNodeStyle(z.data?.nodeType || z.nodeType || z.type) } : n;
      })
    );
  }, [storeNodes]); // eslint-disable-line react-hooks/exhaustive-deps

  const onConnect = useCallback(
    (params) => {
      const newEdges = addEdge({ ...params, animated: true }, edges);
      setEdges(newEdges);
      storeSetEdges(newEdges);
    },
    [edges, setEdges, storeSetEdges]
  );

  const onNodeClick = useCallback(
    (_, node) => {
      // Use the Zustand node (which has the latest updateNode data) rather than
      // the ReactFlow node object (which may lag behind after config panel edits).
      const zustandNode = storeNodes.find((n) => n.id === node.id) || node;
      setSelectedNode(zustandNode);
    },
    [storeNodes, setSelectedNode]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('application/reactflow');
      if (!raw) return;
      const { type, label, operation } = JSON.parse(raw);

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = {
        x: e.clientX - bounds.left - 70,
        y: e.clientY - bounds.top - 20,
      };

      const newNode = {
        id: uuid(),
        type: 'default',
        position,
        data: {
          label,
          nodeType: type,
          ...(operation ? { operation } : {}),
        }, // nodeType in data so updateNode merges keep it
        nodeType: type, // also top-level for MiniMap / buildNodeStyle
        style: buildNodeStyle(type),
      };

      // ReactFlow local state: functional update keeps current positions from drag ops.
      setNodes((prev) => [...prev, newNode]);
      // Zustand (persisted on Save): use storeNodes as the base so any data edits
      // made via NodeConfigPanel (updateNode) aren't overwritten by stale local state.
      storeSetNodes([...storeNodes, newNode]);
    },
    [storeNodes, storeSetNodes]
  );

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onDrop={readOnly ? undefined : onDrop}
        onDragOver={readOnly ? undefined : onDragOver}
        fitView
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
      >
        <Background variant={BackgroundVariant.Dots} color="#1f2937" gap={20} />
        <Controls className="!bg-gray-800 !border-gray-700 !rounded-xl" />
        <MiniMap
          className="!bg-gray-900 !border-gray-700 !rounded-xl"
          nodeColor={(n) => NODE_COLORS[n.nodeType] || '#6b7280'}
        />
      </ReactFlow>
    </div>
  );
}
