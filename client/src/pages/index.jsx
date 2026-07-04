import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Zap, Cpu, GitBranch, Link2, ArrowRight } from 'lucide-react';
import useAuthStore from '@/store/authStore';

const FEATURES = [
  {
    icon: Zap,
    title: 'AI Workflow Generation',
    desc: 'Describe any automation in plain English. The AI generates a full visual workflow graph instantly.',
  },
  {
    icon: Cpu,
    title: 'Multi-Agent Orchestration',
    desc: 'Five specialized agents — Planner, Execution, Validation, Recovery, and Monitoring — chain together for every run.',
  },
  {
    icon: GitBranch,
    title: 'Visual Drag-and-Drop Editor',
    desc: 'React Flow canvas with a node palette, animated edges, and a real-time configuration panel.',
  },
  {
    icon: Link2,
    title: 'Real OAuth Integrations',
    desc: 'Gmail, Slack, Discord, and Google Sheets connected via OAuth with encrypted credential storage.',
  },
];

const AGENTS = ['Planner', 'Execution', 'Validation', 'Recovery', 'Monitoring'];

export default function Landing() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) router.replace('/dashboard');
  }, [isAuthenticated, router]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-violet-400" />
            <span className="font-bold text-base">Agentflow AI</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-gray-400 hover:text-white transition-colors font-medium">
              Sign in
            </Link>
            <Link
              href="/register"
              className="text-sm bg-violet-600 hover:bg-violet-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-violet-600/10 border border-violet-500/20 rounded-full px-4 py-1.5 text-violet-400 text-xs font-medium mb-8">
          <Cpu className="w-3.5 h-3.5" />
          Powered by multi-agent AI orchestration
        </div>
        <h1 className="text-5xl font-bold leading-tight mb-6 bg-gradient-to-br from-white to-gray-400 bg-clip-text text-transparent">
          Automate operations with<br />AI-powered workflows
        </h1>
        <p className="text-gray-400 text-lg leading-relaxed mb-10 max-w-2xl mx-auto">
          Describe any automation in plain English. Agentflow generates a visual workflow, executes it
          through a chain of AI agents, and handles failures automatically — like n8n, but with an
          explicit agentic layer on top.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/register"
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Start automating <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/login"
            className="text-sm bg-gray-800 hover:bg-gray-700 text-white font-medium px-6 py-3 rounded-xl transition-colors"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Agent chain */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="text-xl font-semibold text-center mb-8 text-gray-200">The execution chain</h2>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {AGENTS.map((agent, i) => (
            <div key={agent} className="flex items-center gap-3">
              <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-center">
                <div className="text-xs text-violet-400 font-medium mb-0.5">Agent {i + 1}</div>
                <div className="text-white text-sm font-semibold">{agent}</div>
              </div>
              {i < AGENTS.length - 1 && <ArrowRight className="w-4 h-4 text-gray-700" />}
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-6 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center mb-4">
                <Icon className="w-4.5 h-4.5 text-violet-400" />
              </div>
              <h3 className="text-white font-semibold mb-2">{title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-gray-800 py-8 text-center text-gray-600 text-sm">
        Agentflow AI — AI Operations Automation Platform
      </footer>
    </div>
  );
}
