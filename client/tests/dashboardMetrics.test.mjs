import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPTY_DASHBOARD_METRICS,
  RECENT_WORKFLOWS_ROUTE,
  formatRelativeTime,
  normalizeDashboardMetrics,
} from '../src/lib/dashboardMetrics.mjs';

test('API failure fallback contains zeros and never placeholders', () => {
  const fallback = normalizeDashboardMetrics();
  assert.deepEqual(fallback, EMPTY_DASHBOARD_METRICS);
  assert.equal(fallback.totalExecutions, 0);
  assert.equal(fallback.successRate, 0);
  assert.ok(!Object.values(fallback).includes('-'));
});

test('dashboard API values are normalized for rendering', () => {
  const metrics = normalizeDashboardMetrics({
    totalWorkflows: 3,
    activeWorkflows: 2,
    totalExecutions: 4,
    completedExecutions: 3,
    successRate: 75,
  });
  assert.equal(metrics.totalExecutions, 4);
  assert.equal(metrics.successRate, 75);
});

test('relative activity timestamps are stable', () => {
  const now = new Date('2026-06-27T10:05:00Z').getTime();
  assert.equal(formatRelativeTime('2026-06-27T10:03:00Z', now), '2 minutes ago');
});

test('Recent Workflows View all targets the workflows index', () => {
  assert.equal(RECENT_WORKFLOWS_ROUTE, '/workflows');
});
