import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AppShell from '@/components/AppShell/AppShell';
import ProtectedRoute from '@/components/ProtectedRoute/ProtectedRoute';
import api from '@/lib/axios';
import { CheckCircle, XCircle, ExternalLink, RefreshCw, Loader2 } from 'lucide-react';

const PROVIDER_META = {
  gmail: { label: 'Gmail', description: 'Send and read email via Google', color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20' },
  slack: { label: 'Slack', description: 'Post messages to channels', color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20' },
  discord: { label: 'Discord', description: 'Post messages via bot', color: 'text-indigo-400', bg: 'bg-indigo-400/10 border-indigo-400/20' },
  'google-sheets': { label: 'Google Sheets', description: 'Append and read spreadsheet rows', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
};

export default function Integrations() {
  const router = useRouter();
  const [status, setStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(null);

  useEffect(() => {
    load();
    // Handle OAuth callback params
    const { connected, error } = router.query;
    if (connected) {
      console.log('[OAuth] Connected:', connected);
    }
    if (error) {
      console.error('[OAuth] Error:', error);
    }
  }, [router.query]);

  async function load() {
    try {
      const { data } = await api.get('/integrations/status');
      setStatus(data.status || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect(provider) {
    setConnecting(provider);
    try {
      const { data } = await api.get(`/integrations/oauth/${provider}/start`);
      window.location.href = data.url;
    } catch (err) {
      console.error('[OAuth start]', err.response?.data || err.message);
      const msg = err.response?.data?.message || err.response?.data?.error || err.message || 'OAuth start failed';
      // Show user-friendly error
      alert(`Failed to start OAuth for ${provider}: ${msg}`);
      setConnecting(null);
    }
  }

  async function handleDisconnect(provider) {
    try {
      await api.delete(`/integrations/${provider}`);
      await load();
    } catch (err) {
      console.error('[Disconnect]', err.message);
    }
  }

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Integrations</h1>
          <p className="text-gray-500 text-sm mt-1">Connect third-party services via OAuth</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
            {Object.entries(PROVIDER_META).map(([provider, meta]) => {
              const providerStatus = status.find((s) => s.provider === provider);
              const connected = providerStatus?.connected || false;
              const isConnecting = connecting === provider;

              return (
                <div key={provider} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${meta.bg}`}>
                        <span className={`text-lg font-bold ${meta.color}`}>
                          {meta.label[0]}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{meta.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{meta.description}</p>
                      </div>
                    </div>
                    {connected ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-gray-600 flex-shrink-0" />
                    )}
                  </div>

                  {connected && providerStatus?.accountEmail && (
                    <p className="text-xs text-gray-500 mb-4">
                      Connected as <span className="text-gray-300">{providerStatus.accountEmail}</span>
                    </p>
                  )}

                  {providerStatus?.error && (
                    <p className="text-xs text-red-400 mb-3 bg-red-400/10 rounded px-2 py-1">
                      {providerStatus.error}
                    </p>
                  )}

                  <div className="flex gap-2">
                    {connected ? (
                      <>
                        <button
                          onClick={() => handleConnect(provider)}
                          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" /> Reconnect
                        </button>
                        <button
                          onClick={() => handleDisconnect(provider)}
                          className="text-xs text-red-400 hover:text-red-300 bg-red-400/10 hover:bg-red-400/20 border border-red-400/20 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleConnect(provider)}
                        disabled={isConnecting}
                        className="flex items-center gap-1.5 text-xs text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {isConnecting ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <ExternalLink className="w-3 h-3" />
                        )}
                        {isConnecting ? 'Redirecting…' : 'Connect'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AppShell>
    </ProtectedRoute>
  );
}
