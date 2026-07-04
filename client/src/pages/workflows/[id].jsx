import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AppShell from '@/components/AppShell/AppShell';
import ProtectedRoute from '@/components/ProtectedRoute/ProtectedRoute';
import WorkflowCanvas from '@/components/WorkflowCanvas/WorkflowCanvas';
import NodePalette from '@/components/NodePalette/NodePalette';
import NodeConfigPanel from '@/components/NodeConfigPanel/NodeConfigPanel';
import WorkflowConfigPanel from '@/components/WorkflowConfigPanel/WorkflowConfigPanel';
import useWorkflowStore from '@/store/workflowStore';
import api from '@/lib/axios';
import useNotificationStore from '@/store/notificationStore';
import { Save, Play, Copy, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { connectSocket } from '@/lib/socket';

export default function WorkflowEditor() {
  const router = useRouter();
  const { id } = router.query;
  const { setWorkflow, nodes, edges, isDirty, workflow, markSaved, selectedNode } = useWorkflowStore();
  const { addNotification } = useNotificationStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!id) return;
    api
      .get(`/workflows/${id}`)
      .then(({ data }) => setWorkflow(data.workflow))
      .catch(() => setError('Workflow not found.'))
      .finally(() => setLoading(false));

    const socket = connectSocket();
    const handleWorkflowUpdate = (payload) => {
      if (payload.id === id) {
        // Need to fetch latest state because setWorkflow replaces it all
        const currentWorkflow = useWorkflowStore.getState().workflow;
        if (currentWorkflow) {
          setWorkflow({ ...currentWorkflow, ...payload });
        }
      }
    };
    socket.on('workflow:updated', handleWorkflowUpdate);
    return () => {
      socket.off('workflow:updated', handleWorkflowUpdate);
    };
  }, [id, setWorkflow]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError('');
    setToast(null);
    try {
      const { data } = await api.put(`/workflows/${id}`, {
        name: workflow?.name || '',
        description: workflow?.description || '',
        status: workflow?.status || 'draft',
        trigger: workflow?.trigger || {},
        tags: workflow?.tags || [],
        nodes,
        edges,
      });
      setWorkflow(data.workflow);
      markSaved(nodes, edges);
      addNotification({
        id: `notif-${Date.now()}`,
        type: 'success',
        title: 'Workflow saved',
        message: 'Workflow saved successfully',
        read: false,
        createdAt: new Date().toISOString(),
      });
      setToast({ type: 'success', message: 'Workflow saved successfully' });
      setTimeout(() => setToast(null), 3000);
    } catch {
      setError('Failed to save.');
      addNotification({
        id: `notif-${Date.now()}`,
        type: 'error',
        title: 'Save failed',
        message: 'Failed to save workflow',
        read: false,
        createdAt: new Date().toISOString(),
      });
      setToast({ type: 'error', message: 'Failed to save workflow' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleRestoreVersion(version) {
    setRestoringVersion(true);
    setError('');
    try {
      const { data } = await api.post(`/workflows/${id}/restore`, { version });
      setWorkflow(data.workflow);
    } catch {
      setError('Failed to restore workflow version.');
    } finally {
      setRestoringVersion(false);
    }
  }

  async function handleDuplicate() {
    try {
      const { data } = await api.post(`/workflows/${id}/duplicate`);
      router.push(`/workflows/${data.workflow._id}`);
    } catch {
      setError('Failed to duplicate.');
    }
  }

  function getRequiredFields(node) {
    const type = node.data?.nodeType || node.nodeType || node.type;
    if (type === 'action_sheets') {
      return node.data?.operation === 'read'
        ? ['spreadsheetId', 'range']
        : ['spreadsheetId', 'range', 'values'];
    }

    const REQUIRED_INPUTS = {
      action_email: ['to', 'subject', 'body'],
      action_slack: ['channel', 'message'],
      action_discord: ['channelId', 'message'],
      ai_generate: ['prompt'],
      ai_classify: ['input', 'categories'],
      trigger_schedule: ['cron'],
    };

    return REQUIRED_INPUTS[type] || [];
  }

  function getMissingFields(node) {
    const required = getRequiredFields(node);
    if (!required.length) return [];

    return required.filter((field) => {
      const value = node.data?.[field];
      return value === undefined || value === null || String(value).trim() === '';
    });
  }

  async function handleRun() {
    setRunning(true);
    setError('');

    const invalidNode = nodes.find((node) => {
      const missing = getMissingFields(node);
      return missing.length > 0;
    });

    if (invalidNode) {
      const missing = getMissingFields(invalidNode);
      const label = invalidNode.data?.label || invalidNode.label || 'Google Sheets node';
      setError(`${label} is missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
      setRunning(false);
      return;
    }

    try {
      const { data } = await api.post(`/workflows/${id}/execute`);
      addNotification({
        id: `notif-${Date.now()}`,
        type: 'success',
        title: 'Execution started',
        message: `Workflow "${workflow?.name}" is now running`,
        read: false,
        createdAt: new Date().toISOString(),
      });
      router.push('/executions');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start execution.');
    } finally {
      setRunning(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this workflow?')) return;
    await api.delete(`/workflows/${id}`);
    router.push('/dashboard');
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <AppShell>
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        </AppShell>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <AppShell>
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold text-white">{workflow?.name || 'Workflow Editor'}</h1>
            <p className="text-xs text-gray-500">v{workflow?.version} · {workflow?.status}</p>
          </div>
          <div className="flex items-center gap-2">
            {isDirty && <span className="text-xs text-yellow-400">Unsaved changes</span>}
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="flex items-center gap-1.5 text-sm bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleRun}
              disabled={running}
              className="flex items-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              {running
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Play className="w-3.5 h-3.5" />}
              {running ? 'Running…' : 'Run'}
            </button>
            <button onClick={handleDuplicate} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
              <Copy className="w-4 h-4" />
            </button>
            <button onClick={handleDelete} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-2 mb-3">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {workflow?.versionHistory?.length > 0 && (
          <div className="mb-3 rounded-lg border border-gray-800 bg-gray-900/70 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Version History</h2>
              <span className="text-xs text-gray-500">Restore a saved snapshot</span>
            </div>
            <div className="space-y-2">
              {[...workflow.versionHistory].reverse().map((entry) => (
                <div key={`${entry.version}-${entry.createdAt}`} className="flex items-center justify-between rounded-lg border border-gray-800 bg-black/30 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-white">v{entry.version}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(entry.createdAt).toLocaleString()} 
                      {entry.version === workflow.version ? '(current)' : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRestoreVersion(entry.version)}
                    disabled={restoringVersion || entry.version === workflow.version}
                    className="rounded-lg border border-violet-500/40 px-2.5 py-1 text-xs font-medium text-violet-300 transition-colors hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {restoringVersion ? 'Restoring…' : 'Restore'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Editor layout */}
        <div className="flex h-[calc(100vh-180px)] rounded-xl overflow-hidden border border-gray-800">
          <NodePalette />
          <WorkflowCanvas />
          {selectedNode ? <NodeConfigPanel /> : <WorkflowConfigPanel />}
        </div>

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
            <div
              className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl border ${
                toast.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/20 text-red-400'
              }`}
            >
              {toast.type === 'success' ? (
                <span>✓ {toast.message}</span>
              ) : (
                <span>✕ {toast.message}</span>
              )}
            </div>
          </div>
        )}
      </AppShell>
    </ProtectedRoute>
  );
}
