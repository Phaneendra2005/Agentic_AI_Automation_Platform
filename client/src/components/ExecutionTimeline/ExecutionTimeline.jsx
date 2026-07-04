import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';

const AGENT_COLORS = {
  planner: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  execution: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  validation: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  recovery: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  monitoring: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  orchestrator: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
};

const LEVEL_ICONS = {
  success: <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />,
  error: <XCircle className="w-3.5 h-3.5 text-red-400" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />,
  info: <Info className="w-3.5 h-3.5 text-blue-400" />,
};

export default function ExecutionTimeline({ events = [], loading = false }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="w-16 h-5 bg-gray-800 rounded animate-pulse" />
            <div className="flex-1 h-5 bg-gray-800 rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-sm text-gray-600 py-4 text-center">No events yet — waiting for agent activity…</p>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((ev, i) => {
        const agentColor = AGENT_COLORS[ev.agent] || AGENT_COLORS.orchestrator;
        return (
          <div key={ev._id || i} className="flex flex-col gap-2 py-2">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">{LEVEL_ICONS[ev.level] || LEVEL_ICONS.info}</div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${agentColor}`}>
                {ev.agent}
              </span>
              <p className="text-sm text-gray-300 flex-1 min-w-0">{ev.message}</p>
              <span className="text-xs text-gray-600 flex-shrink-0">
                {new Date(ev.createdAt).toLocaleTimeString()}
              </span>
            </div>
            {ev.metadata && Object.keys(ev.metadata).length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-950/80 p-3 text-xs text-gray-300 overflow-x-auto">
                {ev.metadata.output ? (
                  <>
                    <div className="font-semibold text-gray-200 mb-1">Output</div>
                    <pre className="whitespace-pre-wrap break-words">{JSON.stringify(ev.metadata.output, null, 2)}</pre>
                  </>
                ) : (
                  <pre className="whitespace-pre-wrap break-words">{JSON.stringify(ev.metadata, null, 2)}</pre>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
