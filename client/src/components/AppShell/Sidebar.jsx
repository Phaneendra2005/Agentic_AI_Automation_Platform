import Link from 'next/link';
import { useRouter } from 'next/router';
import { LayoutDashboard, List, Workflow, Play, Link2, Settings, Zap } from 'lucide-react';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/workflows', label: 'Workflows', icon: List, exact: true },
  { href: '/workflows/builder', label: 'Workflow Builder', icon: Workflow },
  { href: '/executions', label: 'Executions', icon: Play },
  { href: '/integrations', label: 'Integrations', icon: Link2 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const { pathname } = useRouter();

  return (
    <aside className="w-60 bg-gray-900 border-r border-gray-800 flex flex-col h-full flex-shrink-0">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-800">
        <Zap className="w-5 h-5 text-violet-400" />
        <span className="text-white font-bold text-base tracking-tight">Agentflow AI</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = pathname === href || (!exact && pathname.startsWith(href + '/'));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-violet-600/20 text-violet-400 border border-violet-500/30'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-gray-800">
        <p className="text-xs text-gray-600 text-center">Agentflow AI v1.0</p>
      </div>
    </aside>
  );
}
