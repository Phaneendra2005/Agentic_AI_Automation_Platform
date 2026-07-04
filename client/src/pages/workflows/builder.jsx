import { useState } from 'react';
import { useRouter } from 'next/router';
import AppShell from '@/components/AppShell/AppShell';
import ProtectedRoute from '@/components/ProtectedRoute/ProtectedRoute';
import GraphPreviewPanel from '@/components/WorkflowCanvas/GraphPreviewPanel';
import NodeConfigPanel from '@/components/NodeConfigPanel/NodeConfigPanel';
import useWorkflowStore from '@/store/workflowStore';
import api from '@/lib/axios';
import { Wand2, Loader2, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react';

const EXAMPLE_PROMPTS = [
  'Send an email when an invoice is overdue',
  'Post a Slack notification when a new sheet row is added',
  'Classify customer feedback and route to the correct team',
  'Send a Discord alert and log details to Google Sheets',
];

export default function WorkflowBuilder() {
  const router = useRouter();
  const { setWorkflow, nodes } = useWorkflowStore();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function handleGenerate(e) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const { data } = await api.post('/workflows/generate', { prompt });
      setWorkflow(data.workflow);
      setResult({ id: data.workflow._id, source: data.source, name: data.workflow.name });
    } catch (err) {
      setError(err.response?.data?.message || 'Generation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Workflow Builder</h1>
          <p className="text-gray-500 text-sm mt-1">Describe an automation — AI generates the workflow graph</p>
        </div>

        <div className="flex gap-4 h-[calc(100vh-200px)]">
          {/* Left panel */}
          <div className="w-96 flex-shrink-0 flex flex-col gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <label className="block text-sm font-semibold text-white mb-3">
                <Wand2 className="inline w-4 h-4 text-violet-400 mr-1.5" />
                Automation prompt
              </label>

              <form onSubmit={handleGenerate} className="space-y-3">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors resize-none"
                  placeholder="e.g. Send a welcome email when a new user registers, then log the event to Google Sheets"
                />

                <button
                  type="submit"
                  disabled={loading || !prompt.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      Generate Workflow
                    </>
                  )}
                </button>
              </form>

              {error && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg px-3 py-2.5 mt-3">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              {result && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-3 mt-3">
                  <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium mb-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Generated via {result.source}
                  </div>
                  <p className="text-xs text-gray-400 truncate mb-2">{result.name}</p>
                  <button
                    onClick={() => router.push(`/workflows/${result.id}`)}
                    className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 font-medium"
                  >
                    Open in editor <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Example prompts */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Example prompts
              </p>
              <div className="space-y-2">
                {EXAMPLE_PROMPTS.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setPrompt(ex)}
                    className="w-full text-left text-xs text-gray-400 hover:text-white bg-gray-800/50 hover:bg-gray-800 rounded-lg px-3 py-2 transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Canvas area */}
          <div className="flex flex-1 min-w-0 gap-0 rounded-xl overflow-hidden border border-gray-800">
            <GraphPreviewPanel />
            <NodeConfigPanel />
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
