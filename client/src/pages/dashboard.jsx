import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell/AppShell';
import ProtectedRoute from '@/components/ProtectedRoute/ProtectedRoute';
import MetricGrid from '@/components/MetricGrid/MetricGrid';
import useAuthStore from '@/store/authStore';
import api from '@/lib/axios';
import { connectSocket } from '@/lib/socket';
import {
  EMPTY_DASHBOARD_METRICS,
  formatRelativeTime,
  normalizeDashboardMetrics,
  RECENT_WORKFLOWS_ROUTE,
} from '@/lib/dashboardMetrics.mjs';
import {
  Clock, ArrowRight, Workflow, Play, CheckCircle, XCircle,
  PauseCircle, RotateCcw, Ban, Tag,
} from 'lucide-react';

const STATUS_COLORS = {
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  draft: 'bg-gray-700/50 text-gray-400 border-gray-600/30',
  paused: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  archived: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const ACTIVITY_CONFIG = {
  'execution:started': { label: 'Workflow started', icon: Play, color: 'text-blue-400 bg-blue-400/10' },
  'execution:completed': { label: 'Workflow completed', icon: CheckCircle, color: 'text-emerald-400 bg-emerald-400/10' },
  'execution:failed': { label: 'Workflow failed', icon: XCircle, color: 'text-red-400 bg-red-400/10' },
  'execution:cancelled': { label: 'Workflow cancelled', icon: Ban, color: 'text-gray-400 bg-gray-400/10' },
  'execution:paused': { label: 'Workflow paused', icon: PauseCircle, color: 'text-yellow-400 bg-yellow-400/10' },
  'execution:resumed': { label: 'Workflow resumed', icon: RotateCcw, color: 'text-violet-400 bg-violet-400/10' },
};

export default function Dashboard() {
  const { user } = useAuthStore();
  const [metrics, setMetrics] = useState(EMPTY_DASHBOARD_METRICS);
  const [recentWorkflows, setRecentWorkflows] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) setLoading(true);
    try {
      const { data } = await api.get('/workflows/dashboard');
      setMetrics(normalizeDashboardMetrics(data));
      setRecentWorkflows(data.recentWorkflows || []);
      setActivity(data.recentWorkflowActivity || []);
      setError('');
    } catch {
      setMetrics(EMPTY_DASHBOARD_METRICS);
      setRecentWorkflows([]);
      setActivity([]);
      setError('Unable to load dashboard metrics.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard({ showLoading: true });
  }, [loadDashboard]);

  useEffect(() => {
    const socket = connectSocket();
    const refresh = () => loadDashboard();
    const applyMetrics = (payload = {}) => {
      if (!payload.metrics) {
        refresh();
        return;
      }
      setMetrics(normalizeDashboardMetrics(payload.metrics));
      setRecentWorkflows(payload.metrics.recentWorkflows || []);
      setActivity(payload.metrics.recentWorkflowActivity || []);
      setError('');
    };
    socket.on('dashboard.metrics.updated', applyMetrics);
    socket.on('dashboard:updated', refresh);
    return () => {
      socket.off('dashboard.metrics.updated', applyMetrics);
      socket.off('dashboard:updated', refresh);
    };
  }, [loadDashboard]);

  useEffect(() => {
    const refreshRelativeTimes = window.setInterval(() => {
      setActivity((current) => [...current]);
    }, 60000);
    return () => window.clearInterval(refreshRelativeTimes);
  }, []);

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Welcome back, {user?.name?.split(' ')[0] || 'Operator'}
            </h1>
            <p className="text-gray-500 text-sm mt-1">Operator Console</p>
          </div>
          <Link
            href="/workflows/builder"
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            New workflow <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="mb-6">
          <MetricGrid metrics={metrics} loading={loading} />
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">Recent Workflows</h2>
              <Link href={RECENT_WORKFLOWS_ROUTE} className="text-xs text-violet-400 hover:text-violet-300">
                View all
              </Link>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-gray-800 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : recentWorkflows.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-600">
                <Workflow className="w-6 h-6 mb-2 opacity-30" />
                <p className="text-sm">No workflows yet</p>
                <Link href="/workflows/builder" className="text-xs text-violet-400 mt-1 hover:text-violet-300">
                  Create your first workflow
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {recentWorkflows.map((wf) => (
                  <Link
                    key={wf._id}
                    href={`/workflows/${wf._id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-800 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium truncate group-hover:text-violet-300 transition-colors">
                        {wf.name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-3 h-3 text-gray-600" />
                        <p className="text-xs text-gray-500">
                          {new Date(wf.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5" title={wf.tags?.join(', ') || ''}>
                        {wf.tags?.length > 0 ? (
                          <>
                            {wf.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-0.5 text-[10px] text-gray-400 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5"
                              >
                                <Tag className="w-2 h-2 text-gray-500" />
                                {tag}
                              </span>
                            ))}
                            {wf.tags.length > 3 && (
                              <span className="inline-flex items-center text-[10px] text-gray-600 px-1">+{wf.tags.length - 3}</span>
                            )}
                          </>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                        STATUS_COLORS[wf.status] || STATUS_COLORS.draft
                      }`}
                    >
                      {wf.status}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">AI Agent Activity</h2>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-800" />
                ))}
              </div>
            ) : activity.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center text-gray-600">
                <p className="text-sm">No execution activity yet</p>
              </div>
            ) : (
              <div className="max-h-80 space-y-1 overflow-y-auto">
                {activity.map((item) => {
                  const config = ACTIVITY_CONFIG[item.event] || ACTIVITY_CONFIG['execution:started'];
                  const Icon = config.icon;
                  return (
                    <div key={item._id} className="flex items-start gap-3 rounded-lg p-2.5 hover:bg-gray-800/70">
                      <div className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${config.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-200">{config.label}</p>
                        <p className="truncate text-sm text-white">{item.workflowName}</p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {item.status} · {formatRelativeTime(item.timestamp)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
