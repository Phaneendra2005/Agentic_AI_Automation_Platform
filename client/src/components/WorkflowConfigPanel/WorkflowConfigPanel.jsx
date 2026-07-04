import { useState, useRef } from 'react';
import { Settings, X, AlertCircle } from 'lucide-react';
import useWorkflowStore from '@/store/workflowStore';

export default function WorkflowConfigPanel() {
  const { workflow, updateWorkflowState } = useWorkflowStore();
  const [tagInput, setTagInput] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  if (!workflow) return null;

  function handleChange(key, value) {
    updateWorkflowState({ [key]: value });
  }

  function validateTag(tag) {
    const trimmed = tag.trim();
    if (!trimmed) return 'Tag cannot be empty';
    if (trimmed.length > 30) return 'Tag cannot exceed 30 characters';
    const currentTags = workflow.tags || [];
    if (currentTags.length >= 10) return 'Maximum 10 tags allowed';
    if (currentTags.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      return 'Duplicate tag';
    }
    return null;
  }

  function addTag(tag) {
    const trimmed = tag.trim();
    if (!trimmed) return;
    const err = validateTag(trimmed);
    if (err) {
      setError(err);
      return;
    }
    setError('');
    const newTags = [...(workflow.tags || []), trimmed];
    handleChange('tags', newTags);
    setTagInput('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput) {
      const currentTags = workflow.tags || [];
      if (currentTags.length > 0) {
        handleChange('tags', currentTags.slice(0, -1));
        setError('');
      }
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    if (!pasted) return;
    
    // Split by comma or newline
    const parts = pasted.split(/[\n,]/).map(t => t.trim()).filter(Boolean);
    if (parts.length === 0) return;

    const currentTags = [...(workflow.tags || [])];
    let newErr = '';

    for (const part of parts) {
      if (currentTags.length >= 10) {
        newErr = 'Maximum 10 tags allowed';
        break;
      }
      if (part.length > 30) {
        newErr = 'Tag cannot exceed 30 characters';
        continue; // skip this one but keep going
      }
      if (currentTags.some(t => t.toLowerCase() === part.toLowerCase())) {
        newErr = 'Duplicate tag';
        continue;
      }
      currentTags.push(part);
    }
    
    if (newErr) setError(newErr);
    else setError('');

    handleChange('tags', currentTags);
    setTagInput('');
  }

  function removeTag(index) {
    const currentTags = workflow.tags || [];
    handleChange('tags', currentTags.filter((_, i) => i !== index));
    setError('');
  }

  return (
    <aside className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col flex-shrink-0">
      <div className="flex items-center px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-violet-400" />
          <p className="text-sm font-semibold text-white">Workflow Properties</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Name</label>
          <input
            type="text"
            value={workflow.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
            placeholder="Workflow Name"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Description</label>
          <textarea
            value={workflow.description || ''}
            onChange={(e) => handleChange('description', e.target.value)}
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors resize-none"
            placeholder="Workflow description..."
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select
            value={workflow.status || 'draft'}
            onChange={(e) => handleChange('status', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Tags</label>
          <div
            className={`w-full bg-gray-800 border ${error ? 'border-red-500/50' : 'border-gray-700'} rounded-lg p-2 flex flex-wrap gap-1.5 focus-within:border-violet-500 transition-colors min-h-[42px] cursor-text`}
            onClick={() => inputRef.current?.focus()}
          >
            {(workflow.tags || []).map((tag, i) => (
              <span
                key={`${tag}-${i}`}
                className="inline-flex items-center gap-1 bg-gray-900 border border-gray-700 text-xs text-gray-300 px-2 py-1 rounded-md"
              >
                {tag}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeTag(i); }}
                  className="text-gray-500 hover:text-red-400 transition-colors focus:outline-none focus:ring-1 focus:ring-violet-500 rounded-sm"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              type="text"
              value={tagInput}
              onChange={(e) => {
                setTagInput(e.target.value);
                setError('');
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              className="flex-1 bg-transparent min-w-[60px] text-sm text-white focus:outline-none placeholder-gray-600"
              placeholder={(workflow.tags || []).length < 10 ? "Add tag..." : ""}
              disabled={(workflow.tags || []).length >= 10}
            />
          </div>
          {error && (
            <div className="flex items-center gap-1 text-red-400 mt-1.5 text-xs">
              <AlertCircle className="w-3 h-3" />
              <span>{error}</span>
            </div>
          )}
          <p className="text-[10px] text-gray-600 mt-1">Press Enter or comma to add. Max 10 tags.</p>
        </div>
      </div>
    </aside>
  );
}
