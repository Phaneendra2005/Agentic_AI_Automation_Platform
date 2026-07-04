import WorkflowCanvas from './WorkflowCanvas';
import useWorkflowStore from '@/store/workflowStore';
import { Workflow } from 'lucide-react';

export default function GraphPreviewPanel() {
  const { nodes } = useWorkflowStore();

  if (nodes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-950 rounded-xl border border-gray-800 text-gray-600">
        <Workflow className="w-10 h-10 mb-3 opacity-20" />
        <p className="text-sm">Generated workflow graph will appear here</p>
        <p className="text-xs mt-1">Describe an automation above to get started</p>
      </div>
    );
  }

  return (
    <div className="flex-1 rounded-xl overflow-hidden border border-gray-800">
      <WorkflowCanvas readOnly={false} />
    </div>
  );
}
