export const EMPTY_DASHBOARD_METRICS = Object.freeze({
  totalWorkflows: 0,
  activeWorkflows: 0,
  totalExecutions: 0,
  completedExecutions: 0,
  failedExecutions: 0,
  cancelledExecutions: 0,
  runningExecutions: 0,
  pausedExecutions: 0,
  successRate: 0,
});

export const RECENT_WORKFLOWS_ROUTE = '/workflows';

export function normalizeDashboardMetrics(data = {}) {
  return Object.fromEntries(
    Object.entries(EMPTY_DASHBOARD_METRICS).map(([key, fallback]) => [
      key,
      Number.isFinite(Number(data[key])) ? Number(data[key]) : fallback,
    ])
  );
}

export function formatRelativeTime(timestamp, now = Date.now()) {
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(timestamp).getTime()) / 1000));
  if (elapsedSeconds < 60) return 'just now';
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
