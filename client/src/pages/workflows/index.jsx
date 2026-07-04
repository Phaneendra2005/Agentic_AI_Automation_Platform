import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell/AppShell';
import ProtectedRoute from '@/components/ProtectedRoute/ProtectedRoute';
import api from '@/lib/axios';
import { connectSocket } from '@/lib/socket';
import {
  Plus, Search, ExternalLink, Copy, Trash2, Workflow,
  Clock, Tag, ArrowUpDown, ArrowUp, ArrowDown,
  ChevronLeft, ChevronRight, AlertCircle,
} from 'lucide-react';

const STATUS_COLORS = {
  active:   'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  draft:    'bg-gray-700/50 text-gray-400 border-gray-600/30',
  paused:   'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  archived: 'bg-red-500/10 text-red-400 border-red-500/20',
};

function SkeletonRow() {
  return (
    <tr>
      {[...Array(6)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-800 rounded animate-pulse" style={{ width: `${60 + (i * 13) % 35}%` }} />
        </td>
      ))}
    </tr>
  );
}

function SortButton({ label, col, sortKey, sortDir, onToggle }) {
  const active = sortKey === col;
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      onClick={() => onToggle(col)}
      className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-white transition-colors"
    >
      {label}
      <Icon className={`w-3 h-3 ${active ? 'text-violet-400' : 'opacity-40'}`} />
    </button>
  );
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('updatedAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionLoading, setActionLoading] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/workflows', {
        params: { page, limit: 20, sortBy: sortKey, sortDir, search, tags: selectedTags.join(',') },
      });
      setWorkflows(data.workflows ?? data ?? []);
      if (data.pagination) setTotalPages(data.pagination.totalPages ?? 1);
    } catch {
      setError('Failed to load workflows. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [page, sortKey, sortDir, search, selectedTags]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchWorkflows();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchWorkflows]);

  useEffect(() => {
    const socket = connectSocket();
    const handleWorkflowUpdate = () => fetchWorkflows();
    socket.on('workflow:updated', handleWorkflowUpdate);
    return () => socket.off('workflow:updated', handleWorkflowUpdate);
  }, [fetchWorkflows]);

  const filtered = workflows;

  function toggleSort(col) {
    if (sortKey === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(col); setSortDir('asc'); }
    setPage(1);
  }

  async function handleDuplicate(id) {
    setActionLoading(`${id}:dup`);
    try {
      await api.post(`/workflows/${id}/duplicate`);
      await fetchWorkflows();
    } catch {
      setError('Failed to duplicate workflow.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete "${name}"? This action cannot be undone.`)) return;
    setActionLoading(`${id}:del`);
    try {
      await api.delete(`/workflows/${id}`);
      // Stay on previous page if we emptied the last one
      setPage((p) => (filtered.length === 1 && p > 1 ? p - 1 : p));
      await fetchWorkflows();
    } catch {
      setError('Failed to delete workflow.');
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <ProtectedRoute>
      <AppShell>
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Workflows</h1>
            <p className="text-gray-500 text-sm mt-1">Manage and monitor all your automation workflows</p>
          </div>
          <Link
            href="/workflows/builder"
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Workflow
          </Link>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-2 mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400/60 hover:text-red-400">✕</button>
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search workflows, descriptions, or tags…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full bg-gray-900 border border-gray-800 text-sm text-white placeholder-gray-600 rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-colors"
            />
          </div>
          <div className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter by tags (comma separated)…"
                value={selectedTags.join(', ')}
                onChange={(e) => {
                  const parts = e.target.value.split(',').map(t => t.trim());
                  // We only set it if it's different, but for simplicity we can just set it.
                  setSelectedTags(parts.filter(Boolean));
                  if (!e.target.value) setSelectedTags([]);
                  setPage(1);
                }}
                className="w-full bg-gray-900 border border-gray-800 text-sm text-white placeholder-gray-600 rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-4 py-3 text-left">
                    <SortButton label="Name" col="name" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortButton label="Last Updated" col="updatedAt" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Version
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortButton label="Tags" col="tags" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {loading ? (
                  Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} />)
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center text-gray-600">
                        <Workflow className="w-8 h-8 mb-3 opacity-30" />
                        {search ? (
                          <p className="text-sm">
                            No workflows match "<span className="text-gray-400">{search}</span>"
                          </p>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-gray-500">
                              No workflows yet — create one to get started
                            </p>
                            <Link
                              href="/workflows/builder"
                              className="mt-3 inline-flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Create your first workflow
                            </Link>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((wf) => (
                    <tr key={wf._id} className="hover:bg-gray-800/50 transition-colors group">
                      {/* Name + description */}
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-white font-medium truncate group-hover:text-violet-300 transition-colors">
                          {wf.name}
                        </p>
                        {wf.description && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{wf.description}</p>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                            STATUS_COLORS[wf.status] ?? STATUS_COLORS.draft
                          }`}
                        >
                          {wf.status ?? 'draft'}
                        </span>
                      </td>

                      {/* Last execution / updated */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <Clock className="w-3 h-3 text-gray-600 flex-shrink-0" />
                          {wf.lastExecutedAt
                            ? new Date(wf.lastExecutedAt).toLocaleString()
                            : wf.updatedAt
                            ? new Date(wf.updatedAt).toLocaleString()
                            : '—'}
                        </div>
                      </td>

                      {/* Version */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-400">v{wf.version ?? 1}</span>
                      </td>

                      {/* Tags */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1" title={wf.tags?.join(', ') || ''}>
                          {wf.tags?.length > 0 ? (
                            <>
                              {wf.tags.slice(0, 3).map((tag) => (
                                <button
                                  key={tag}
                                  onClick={() => {
                                    if (!selectedTags.includes(tag)) {
                                      setSelectedTags([...selectedTags, tag]);
                                      setPage(1);
                                    }
                                  }}
                                  className="inline-flex items-center gap-0.5 text-xs text-gray-400 bg-gray-800 hover:bg-gray-700 hover:text-white border border-gray-700 rounded px-1.5 py-0.5 transition-colors cursor-pointer"
                                >
                                  <Tag className="w-2.5 h-2.5 text-gray-500" />
                                  {tag}
                                </button>
                              ))}
                              {wf.tags.length > 3 && (
                                <span className="inline-flex items-center text-xs text-gray-600 px-1">+{wf.tags.length - 3}</span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-gray-700">—</span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/workflows/${wf._id}`}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-400 hover:text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Open
                          </Link>
                          <button
                            onClick={() => handleDuplicate(wf._id)}
                            disabled={actionLoading === `${wf._id}:dup`}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
                          >
                            <Copy className="w-3 h-3" />
                            {actionLoading === `${wf._id}:dup` ? '…' : 'Duplicate'}
                          </button>
                          <button
                            onClick={() => handleDelete(wf._id, wf.name)}
                            disabled={actionLoading === `${wf._id}:del`}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-red-400 bg-gray-800 hover:bg-red-500/10 border border-gray-700 hover:border-red-500/20 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
                          >
                            <Trash2 className="w-3 h-3" />
                            {actionLoading === `${wf._id}:del` ? '…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
              <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
