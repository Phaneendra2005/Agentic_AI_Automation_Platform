import { useEffect, useState, useCallback, useRef } from 'react';
import AppShell from '@/components/AppShell/AppShell';
import ProtectedRoute from '@/components/ProtectedRoute/ProtectedRoute';
import ExecutionTimeline from '@/components/ExecutionTimeline/ExecutionTimeline';
import { useExecutionSocket } from '@/hooks/useExecution';
import useNotificationStore from '@/store/notificationStore';
import api from '@/lib/axios';
import { connectSocket } from '@/lib/socket';
import {
  Play, Clock, CheckCircle, XCircle, Loader2, RefreshCw,
  AlertCircle, ChevronLeft, ChevronRight,
} from 'lucide-react';

const STATUS_CONFIG = {
  COMPLETED: { color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', icon: CheckCircle },
  FAILED:    { color: 'text-red-400 bg-red-400/10 border-red-400/20',             icon: XCircle },
  RUNNING:   { color: 'text-blue-400 bg-blue-400/10 border-blue-400/20',          icon: Loader2 },
  PENDING:   { color: 'text-gray-400 bg-gray-400/10 border-gray-400/20',          icon: Clock },
  PAUSED:    { color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',    icon: Clock },
  CANCELLED: { color: 'text-gray-500 bg-gray-500/10 border-gray-500/20',          icon: XCircle },
  RETRYING:  { color: 'text-orange-400 bg-orange-400/10 border-orange-400/20',    icon: RefreshCw },
};

const ACTION_PAST = { pause: 'paused', resume: 'resumed', cancel: 'cancelled' };

// Shared class for the two control dropdowns
const SELECT_CLS =
  'flex-1 bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg px-2.5 py-1.5 ' +
  'focus:ring-1 focus:ring-violet-500 focus:border-violet-500 outline-none cursor-pointer';

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.color}`}>
      <Icon className={`w-3 h-3 ${status === 'RUNNING' ? 'animate-spin' : ''}`} />
      {status}
    </span>
  );
}

function ExecutionOutputCard({ nodeId, node, result }) {
  const [expanded, setExpanded] = useState(false);
  const [viewRaw, setViewRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const payload = result && typeof result === 'object' && 'output' in result ? result.output : result;
  const jsonValue = JSON.stringify(payload, null, 2);
  const isSheetValues = payload && typeof payload === 'object' && Array.isArray(payload.values);
  const rows = isSheetValues ? payload.values : null;
  const rowCount = rows?.length || 0;
  const hasManyRows = rowCount > 10;
  const rowsToShow = hasManyRows ? rows.slice(0, 10) : rows;
  const title = node?.data?.label || node?.label || nodeId;
  const subtitle = node?.data?.nodeType === 'action_sheets' && node?.data?.operation === 'read'
    ? 'Read Google Sheets result'
    : 'Node result';

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (_) {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/80 overflow-hidden">
      <div className="sticky top-0 z-10 bg-gray-950/90 border-b border-gray-800 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold text-white">{title}</div>
          <div className="text-[11px] text-gray-500">{subtitle}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setViewRaw((prev) => !prev)}
            className="rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1 text-[11px] font-medium text-gray-200 hover:bg-gray-800"
          >
            {viewRaw ? 'View Table' : 'View Raw'}
          </button>
          <button
            type="button"
            onClick={copyJson}
            className="rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1 text-[11px] font-medium text-gray-200 hover:bg-gray-800"
          >
            {copied ? 'Copied' : 'Copy JSON'}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1 text-[11px] font-medium text-gray-200 hover:bg-gray-800"
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="max-h-[350px] min-h-[180px] overflow-auto bg-gray-900 p-4 text-xs font-mono leading-6 text-gray-200">
          {isSheetValues && !viewRaw ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
                <span>Showing {Math.min(10, rowCount)} of {rowCount} rows</span>
                {hasManyRows && (
                  <button
                    type="button"
                    onClick={() => setViewRaw(true)}
                    className="rounded-lg border border-gray-700 bg-gray-950 px-2 py-1 text-[11px] text-gray-200 hover:bg-gray-800"
                  >
                    View All
                  </button>
                )}
              </div>
              <div className="min-w-full overflow-auto rounded-lg border border-gray-800 bg-gray-950">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead className="bg-gray-900 text-gray-300">
                    <tr>
                      {(rowsToShow[0] || []).map((cell, index) => (
                        <th key={index} className="border-b border-gray-800 px-3 py-2 font-medium text-gray-300">
                          {String(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rowsToShow.slice(1).map((row, rowIndex) => (
                      <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-gray-950' : 'bg-gray-900'}>
                        {(row || []).map((cell, cellIndex) => (
                          <td key={cellIndex} className="border-b border-gray-800 px-3 py-2 align-top text-gray-200">
                            {String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-words">{jsonValue}</pre>
          )}
        </div>
      )}
    </div>
  );
}

export default function Executions() {
  const [executions, setExecutions]     = useState([]);
  const [selected, setSelected]         = useState(null);
  const [timeline, setTimeline]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [controlLoading, setControlLoading]   = useState(null);
  const [controlError, setControlError]       = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortBy, setSortBy]             = useState('newest');
  const [page, setPage]                 = useState(1);
  const [totalPages, setTotalPages]     = useState(1);
  const { addNotification } = useNotificationStore();

  // Stable ref so the filter-change effect can check selected without it being
  // a dependency (which would cause infinite re-fetch loops).
  const selectedRef = useRef(null);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // ── Main data fetch ──────────────────────────────────────────────────────────
  // Re-runs whenever filter, sort, or page changes.  Uses a cancellation flag so
  // a stale response from a slow request doesn't overwrite a faster later one.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const q = new URLSearchParams();
    if (filterStatus) q.set('status', filterStatus);
    q.set('sort', sortBy);
    q.set('page', String(page));
    q.set('limit', '20');

    api.get(`/executions?${q}`)
      .then(({ data }) => {
        if (cancelled) return;
        const list = data.executions || [];
        setExecutions(list);
        setTotalPages(data.pages || 1);
        // Deselect if the selected execution no longer appears in the filtered result.
        // This only applies to explicit filter/sort/page changes — control actions
        // (pause/resume/cancel) use refreshList() which deliberately keeps the panel.
        const sel = selectedRef.current;
        if (sel && !list.find((e) => e._id === sel._id)) {
          setSelected(null);
          setTimeline([]);
        }
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [filterStatus, sortBy, page]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket: live timeline + real-time status sync ───────────────────────────
  const refreshList = useCallback(async () => {
    const q = new URLSearchParams();
    if (filterStatus) q.set('status', filterStatus);
    q.set('sort', sortBy);
    q.set('page', String(page));
    q.set('limit', '20');
    const { data } = await api.get(`/executions?${q}`);
    const list = data.executions || [];
    setExecutions(list);
    setTotalPages(data.pages || 1);
    const sel = selectedRef.current;
    if (sel) {
      const updated = list.find((e) => e._id === sel._id);
      if (updated) setSelected(updated);
    }
  }, [filterStatus, sortBy, page]);

  const refreshSelected = useCallback(async (id = selectedRef.current?._id) => {
    if (!id) return;
    const { data } = await api.get(`/executions/${id}`);
    setSelected(data.execution);
  }, []);

  const refreshExecutionData = useCallback(async (executionId) => {
    await Promise.all([
      refreshList().catch(() => {}),
      selectedRef.current?._id === executionId ? refreshSelected(executionId).catch(() => {}) : Promise.resolve(),
    ]);
  }, [refreshList, refreshSelected]);

  useEffect(() => {
    const socket = connectSocket();
    const events = [
      'execution:created',
      'execution:started',
      'execution:paused',
      'execution:resumed',
      'execution:completed',
      'execution:failed',
      'execution:cancelled',
      'execution:updated',
    ];
    const handleExecutionChange = (payload = {}) => {
      const executionId = String(payload.executionId || payload.execution?._id || '');
      refreshExecutionData(executionId);
    };
    const handleReconnect = () => {
      refreshList().catch(() => {});
      refreshSelected().catch(() => {});
    };

    events.forEach((event) => socket.on(event, handleExecutionChange));
    socket.on('connect', handleReconnect);
    return () => {
      events.forEach((event) => socket.off(event, handleExecutionChange));
      socket.off('connect', handleReconnect);
    };
  }, [refreshExecutionData, refreshList, refreshSelected]);

  useExecutionSocket(selected?._id, useCallback((event) => {
    setTimeline((prev) => [...prev, {
      _id: `live-${Date.now()}`,
      agent: event.agent,
      level: event.level,
      event: event.event,
      message: event.message,
      metadata: event.metadata,
      createdAt: event.timestamp || new Date().toISOString(),
    }]);

    if (event.executionId) refreshExecutionData(String(event.executionId)).catch(() => {});

    addNotification({
      id: `notif-${Date.now()}`,
      type: event.level === 'success' ? 'success' : event.level === 'error' ? 'failure' : 'info',
      title: event.message,
      message: `Execution ${event.executionId?.slice(-6)}`,
      read: false,
      createdAt: new Date().toISOString(),
    });
  }, [addNotification, refreshExecutionData]));

  useEffect(() => { setControlError(''); }, [selected?._id]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  async function loadTimeline(execution) {
    setTimelineLoading(true);
    try {
      const [{ data: executionData }, { data: timelineData }] = await Promise.all([
        api.get(`/executions/${execution._id}`),
        api.get(`/executions/${execution._id}/timeline`),
      ]);
      setSelected(executionData.execution);
      setTimeline(timelineData.timeline || []);
    } catch {
      setSelected(execution);
      setTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  }

  // Refresh the list using the current filter/sort/page.  Called after control
  // actions (pause/resume/cancel): updates the list and selected badge but does
  // NOT clear the panel if the execution falls outside the current filter after
  // a status change.
  async function handleControl(id, action) {
    setControlLoading(action);
    setControlError('');
    try {
      const { data } = await api.post(`/executions/${id}/${action}`);
      if (data.execution) setSelected(data.execution);
      await Promise.all([refreshList(), refreshSelected(id)]);
      addNotification({
        id: `notif-${Date.now()}`,
        type: 'success',
        title: `Execution ${ACTION_PAST[action] || action}`,
        message: `Execution ${id.slice(-6)} is now ${ACTION_PAST[action] || action}`,
        read: false,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      setControlError(err.response?.data?.message || `Failed to ${action} execution.`);
      try { await refreshList(); } catch {}
    } finally {
      setControlLoading(null);
    }
  }

  const isBusy = controlLoading !== null;

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Executions</h1>
          <p className="text-gray-500 text-sm mt-1">All workflow execution runs with live timeline</p>
        </div>

        <div className="flex gap-4 h-[calc(100vh-200px)]">

          {/* ── Left column: controls + list + pagination ── */}
          <div className="w-96 flex-shrink-0 flex flex-col gap-2">

            {/* Filter + sort dropdowns */}
            <div className="flex gap-2">
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                className={SELECT_CLS}
              >
                <option value="">All statuses</option>
                {['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'PAUSED', 'CANCELLED', 'RETRYING'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                className={SELECT_CLS}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="longest">Longest duration</option>
                <option value="shortest">Shortest duration</option>
              </select>
            </div>

            {/* Execution list */}
            <div className="flex-1 min-h-0 bg-gray-900 border border-gray-800 rounded-xl overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
                </div>
              ) : executions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-600">
                  <Play className="w-7 h-7 mb-2 opacity-30" />
                  <p className="text-sm">
                    {filterStatus
                      ? `No ${filterStatus.toLowerCase()} executions`
                      : 'No executions yet'}
                  </p>
                </div>
              ) : (
                executions.map((ex) => (
                  <button
                    key={ex._id}
                    onClick={() => loadTimeline(ex)}
                    className={`w-full text-left px-4 py-4 border-b border-gray-800 hover:bg-gray-800 transition-colors ${
                      selected?._id === ex._id ? 'bg-gray-800' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="text-sm text-white font-medium truncate">
                        {ex.workflow?.name || 'Workflow'}
                      </p>
                      <StatusBadge status={ex.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{new Date(ex.createdAt).toLocaleString()}</span>
                      {ex.duration && <span>{(ex.duration / 1000).toFixed(1)}s</span>}
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Pagination — only shown when there is more than one page */}
            {totalPages > 1 && (
              <div className="flex-shrink-0 flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* ── Right column: detail / timeline panel ── */}
          <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl flex flex-col overflow-hidden">
            {!selected ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
                <Play className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-sm">Select an execution to view the timeline</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                  <div>
                    <p className="text-sm font-semibold text-white">{selected.workflow?.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{selected._id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={selected.status} />

                    {selected.status === 'RUNNING' && (
                      <button
                        onClick={() => handleControl(selected._id, 'pause')}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1.5 text-xs text-yellow-400 hover:text-yellow-300 bg-yellow-400/10 border border-yellow-400/20 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
                      >
                        {controlLoading === 'pause' && <Loader2 className="w-3 h-3 animate-spin" />}
                        Pause
                      </button>
                    )}

                    {selected.status === 'PAUSED' && (
                      <button
                        onClick={() => handleControl(selected._id, 'resume')}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-400/10 border border-blue-400/20 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
                      >
                        {controlLoading === 'resume' && <Loader2 className="w-3 h-3 animate-spin" />}
                        Resume
                      </button>
                    )}

                    {['PENDING', 'RUNNING', 'PAUSED'].includes(selected.status) && (
                      <button
                        onClick={() => handleControl(selected._id, 'cancel')}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 bg-red-400/10 border border-red-400/20 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
                      >
                        {controlLoading === 'cancel' && <Loader2 className="w-3 h-3 animate-spin" />}
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline error bar */}
                {controlError && (
                  <div className="flex items-center gap-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs px-5 py-2.5">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {controlError}
                    <button
                      onClick={() => setControlError('')}
                      className="ml-auto text-red-400/60 hover:text-red-400 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}

                <div className="px-5 py-4 border-b border-gray-800 overflow-hidden">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Execution output</p>
                  {selected.output?.nodeResults && Object.keys(selected.output.nodeResults).length > 0 ? (
                    <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                      {Object.entries(selected.output.nodeResults).map(([nodeId, result]) => {
                        const node = selected.workflowSnapshot?.nodes?.find((n) => n.id === nodeId);
                        return <ExecutionOutputCard key={nodeId} nodeId={nodeId} node={node} result={result} />;
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-gray-800 bg-gray-950/80 p-3 text-xs text-gray-400">
                      No persisted node outputs are available for this execution.
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Agent Timeline</p>
                  <ExecutionTimeline events={timeline} loading={timelineLoading} />
                </div>
              </>
            )}
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
