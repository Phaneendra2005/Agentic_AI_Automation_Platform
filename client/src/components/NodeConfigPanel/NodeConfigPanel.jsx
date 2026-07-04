import { X, Settings } from 'lucide-react';
import useWorkflowStore from '@/store/workflowStore';

const FIELD_DEFS = {
  action_email: [
    { key: 'to', label: 'To', type: 'text', placeholder: 'recipient@example.com' },
    { key: 'subject', label: 'Subject', type: 'text', placeholder: 'Email subject' },
    { key: 'body', label: 'Body', type: 'textarea', placeholder: 'Email body…' },
  ],
  action_slack: [
    { key: 'channel', label: 'Channel', type: 'text', placeholder: '#general' },
    { key: 'message', label: 'Message', type: 'textarea', placeholder: 'Slack message…' },
  ],
  action_discord: [
    { key: 'channelId', label: 'Channel ID', type: 'text', placeholder: 'Discord channel ID' },
    { key: 'message', label: 'Message', type: 'textarea', placeholder: 'Discord message…' },
  ],
  action_sheets: {
    append: [
      { key: 'spreadsheetId', label: 'Spreadsheet ID', type: 'text', placeholder: 'Google Sheets ID' },
      { key: 'range', label: 'Range', type: 'text', placeholder: 'Sheet1!A1:D1' },
      { key: 'values', label: 'Values (JSON)', type: 'textarea', placeholder: '[["A1","B1"]]' },
    ],
    read: [
      { key: 'spreadsheetId', label: 'Spreadsheet ID', type: 'text', placeholder: 'Google Sheets ID' },
      { key: 'range', label: 'Range', type: 'text', placeholder: 'Sheet1!A1:D1' },
    ],
  },
  ai_generate: [
    { key: 'prompt', label: 'Prompt', type: 'textarea', placeholder: 'Your prompt…' },
    { key: 'model', label: 'Model', type: 'text', placeholder: 'openai/gpt-4o' },
  ],
  ai_classify: [
    { key: 'input', label: 'Input field', type: 'text', placeholder: 'Field name to classify' },
    { key: 'categories', label: 'Categories', type: 'text', placeholder: 'positive, negative, neutral' },
  ],
  logic_condition: [
    { key: 'field', label: 'Field', type: 'text', placeholder: 'Field to evaluate' },
    { key: 'operator', label: 'Operator', type: 'text', placeholder: 'equals | contains | gt | lt' },
    { key: 'value', label: 'Value', type: 'text', placeholder: 'Expected value' },
  ],
  logic_filter: [
    { key: 'field', label: 'Field', type: 'text', placeholder: 'Field to filter on' },
    { key: 'condition', label: 'Condition', type: 'text', placeholder: 'truthy | exists' },
  ],
  trigger_manual: [],
  trigger_schedule: [
    { key: 'cron', label: 'Cron expression', type: 'text', placeholder: '0 9 * * 1-5' },
  ],
};

function getFieldDefs(nodeType, operation) {
  if (nodeType === 'action_sheets') {
    return FIELD_DEFS.action_sheets[operation] || FIELD_DEFS.action_sheets.append;
  }
  return FIELD_DEFS[nodeType] || [];
}

export default function NodeConfigPanel() {
  const { selectedNode, updateNode, setSelectedNode } = useWorkflowStore();

  if (!selectedNode) return null;

  const nodeType = selectedNode.data?.nodeType || selectedNode.nodeType || selectedNode.type;
  const data = selectedNode.data || {};
  const operation = data.operation || 'append';
  const fields = getFieldDefs(nodeType, operation);

  function handleChange(key, value) {
    updateNode(selectedNode.id, { [key]: value });
  }

  return (
    <aside className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-violet-400" />
          <p className="text-sm font-semibold text-white">{data.label || selectedNode.type}</p>
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          className="p-1 text-gray-500 hover:text-white rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Node label</label>
          <input
            type="text"
            value={data.label || ''}
            onChange={(e) => handleChange('label', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
            placeholder="Node label"
          />
        </div>

        {nodeType === 'action_sheets' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Operation</label>
            <select
              value={operation}
              onChange={(e) => handleChange('operation', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
            >
              <option value="append">Append Row</option>
              <option value="read">Read Range</option>
            </select>
          </div>
        )}

        {fields.map(({ key, label, type, placeholder }) => (
          <div key={key}>
            <label className="block text-xs text-gray-500 mb-1">{label}</label>
            {type === 'textarea' ? (
              <textarea
                value={data[key] || ''}
                onChange={(e) => handleChange(key, e.target.value)}
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors resize-none"
                placeholder={placeholder}
              />
            ) : (
              <input
                type="text"
                value={data[key] || ''}
                onChange={(e) => handleChange(key, e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
                placeholder={placeholder}
              />
            )}
          </div>
        ))}

        {fields.length === 0 && (
          <p className="text-xs text-gray-600">No configuration required for this node type.</p>
        )}
      </div>

      <div className="px-4 py-3 border-t border-gray-800">
        <p className="text-xs text-gray-600">Node ID: {selectedNode.id}</p>
      </div>
    </aside>
  );
}
