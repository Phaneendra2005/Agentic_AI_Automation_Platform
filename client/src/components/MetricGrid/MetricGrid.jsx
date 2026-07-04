import { TrendingUp, Activity, CheckCircle, Zap } from 'lucide-react';

const ICONS = {
  workflows: Zap,
  active: Activity,
  executions: TrendingUp,
  success: CheckCircle,
};

const COLORS = {
  workflows: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
  active: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  executions: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  success: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
};

export default function MetricGrid({ metrics, loading = false }) {
  const cards = [
    { key: 'workflows', label: 'Total Workflows', value: metrics?.totalWorkflows ?? 0 },
    { key: 'active', label: 'Active Workflows', value: metrics?.activeWorkflows ?? 0 },
    { key: 'executions', label: 'Total Executions', value: metrics?.totalExecutions ?? 0 },
    { key: 'success', label: 'Success Rate', value: `${metrics?.successRate ?? 0}%` },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ key, label, value }) => {
        const Icon = ICONS[key];
        const color = COLORS[key];
        return (
          <div key={key} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
              <div className={`w-7 h-7 rounded-lg border flex items-center justify-center ${color}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
            </div>
            {loading ? (
              <div
                aria-label={`Loading ${label}`}
                className="h-8 w-16 animate-pulse rounded-md bg-gray-800"
              />
            ) : (
              <p className="text-2xl font-bold text-white">{value}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
