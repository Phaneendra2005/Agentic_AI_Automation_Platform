import { Zap, Mail, MessageSquare, FileSpreadsheet, GitBranch, Brain, Filter, Clock } from 'lucide-react';

const NODE_CATALOG = [
  {
    category: 'Triggers',
    nodes: [
      { type: 'trigger_manual', label: 'Manual Trigger', icon: Zap, description: 'Start workflow manually' },
      { type: 'trigger_schedule', label: 'Schedule', icon: Clock, description: 'Run on a schedule' },
    ],
  },
  {
    category: 'Actions',
    nodes: [
      { type: 'action_email', label: 'Send Email', icon: Mail, description: 'Send via Gmail' },
      { type: 'action_slack', label: 'Slack Message', icon: MessageSquare, description: 'Post to Slack channel' },
      { type: 'action_discord', label: 'Discord Message', icon: MessageSquare, description: 'Post via Discord bot' },
      { type: 'action_sheets', label: 'Append Row', icon: FileSpreadsheet, description: 'Append a row to Google Sheets', operation: 'append' },
      { type: 'action_sheets', label: 'Read Range', icon: FileSpreadsheet, description: 'Read a range from Google Sheets', operation: 'read' },
    ],
  },
  {
    category: 'AI',
    nodes: [
      { type: 'ai_generate', label: 'AI Generate', icon: Brain, description: 'Generate text with AI' },
      { type: 'ai_classify', label: 'AI Classify', icon: Brain, description: 'Classify input with AI' },
    ],
  },
  {
    category: 'Logic',
    nodes: [
      { type: 'logic_condition', label: 'Condition', icon: GitBranch, description: 'Branch on a condition' },
      { type: 'logic_filter', label: 'Filter', icon: Filter, description: 'Filter data' },
    ],
  },
];

function onDragStart(e, nodeType, label, operation) {
  e.dataTransfer.setData('application/reactflow', JSON.stringify({ type: nodeType, label, operation }));
  e.dataTransfer.effectAllowed = 'move';
}

export default function NodePalette() {
  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col overflow-y-auto flex-shrink-0">
      <div className="px-4 py-3 border-b border-gray-800">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Node Palette</p>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {NODE_CATALOG.map(({ category, nodes }) => (
          <div key={category} className="mb-3">
            <p className="text-xs text-gray-600 uppercase tracking-widest font-medium px-4 py-1.5">
              {category}
            </p>
            {nodes.map(({ type, label, icon: Icon, description, operation }) => (
              <div
                key={`${type}-${operation || 'default'}`}
                draggable
                onDragStart={(e) => onDragStart(e, type, label, operation)}
                className="flex items-center gap-2.5 px-4 py-2.5 cursor-grab hover:bg-gray-800 transition-colors group"
                title={description}
              >
                <div className="w-7 h-7 rounded-lg bg-gray-800 group-hover:bg-gray-700 border border-gray-700 flex items-center justify-center flex-shrink-0 transition-colors">
                  <Icon className="w-3.5 h-3.5 text-violet-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-300 group-hover:text-white truncate transition-colors">
                    {label}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
