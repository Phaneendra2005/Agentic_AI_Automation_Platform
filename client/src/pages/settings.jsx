import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Bell, CheckCircle, CircleAlert, CircleOff, Database, KeyRound, Lock,
  LogOut, Monitor, PlugZap, RefreshCw, Shield, TestTube2, Upload, User,
} from 'lucide-react';
import AppShell from '@/components/AppShell/AppShell';
import ProtectedRoute from '@/components/ProtectedRoute/ProtectedRoute';
import useAuthStore from '@/store/authStore';
import useSettingsStore, { DEFAULT_NOTIFICATION_PREFERENCES } from '@/store/settingsStore';
import api from '@/lib/axios';
import { disconnectSocket } from '@/lib/socket';
import { assetUrl } from '@/lib/url';
import { resolveBrowserNotificationPreference } from '@/lib/browserNotifications.mjs';

const STATUS_STYLES = {
  Active: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  Healthy: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  Connected: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  Missing: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400',
  Invalid: 'border-red-500/20 bg-red-500/10 text-red-400',
  Expired: 'border-red-500/20 bg-red-500/10 text-red-400',
  'Token Expired': 'border-red-500/20 bg-red-500/10 text-red-400',
  Disconnected: 'border-gray-600 bg-gray-800 text-gray-400',
  Degraded: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400',
  Offline: 'border-red-500/20 bg-red-500/10 text-red-400',
};

function statusClass(status) {
  return STATUS_STYLES[status] || 'border-gray-600 bg-gray-800 text-gray-400';
}

function StatusBadge({ status }) {
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}>{status}</span>;
}

function Section({ icon: Icon, title, error, children }) {
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-violet-400" />
          <h2 className="text-sm font-semibold text-white">{title}</h2>
        </div>
      </div>
      {error && <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
      {children}
    </section>
  );
}

function SkeletonRows({ rows = 3 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-lg bg-gray-800" />
      ))}
    </div>
  );
}

function Toggle({ label, checked, disabled, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-800 bg-gray-950 px-3 py-3">
      <span className="text-sm text-gray-200">{label}</span>
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-violet-500"
      />
    </label>
  );
}

function relativeDate(value) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

export default function Settings() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const { user, setUser, logout } = useAuthStore();
  const {
    settings,
    integrations,
    health,
    apiKeys,
    encryption,
    setSettings,
    setIntegrations,
    setHealth,
    setApiKeys,
    resetSettings,
  } = useSettingsStore();

  const [profileForm, setProfileForm] = useState({ name: '' });
  const [avatarData, setAvatarData] = useState('');
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState({});

  const preferences = useMemo(
    () => ({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...(settings.notificationPreferences || {}) }),
    [settings.notificationPreferences]
  );

  const loadSettings = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) setLoading(true);
    try {
      const [{ data }, apiKeyRes, healthRes] = await Promise.all([
        api.get('/settings'),
        api.get('/settings/api-keys'),
        api.get('/settings/health'),
      ]);
      if (data.user) {
        setUser(data.user);
        setProfileForm({ name: data.user.name || '' });
      }
      if (data.settings) setSettings(data.settings);
      if (data.integrations) setIntegrations(data.integrations);
      setApiKeys(apiKeyRes.data.apiKeys || [], apiKeyRes.data.encryption || null);
      setHealth(healthRes.data.health || null);
      setErrors((current) => ({ ...current, load: '' }));
    } catch {
      setErrors((current) => ({ ...current, load: 'Unable to load settings' }));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [setUser, setSettings, setIntegrations, setApiKeys, setHealth]);

  useEffect(() => {
    loadSettings({ showLoading: true });
    const timer = window.setInterval(() => loadSettings(), 30000);
    return () => window.clearInterval(timer);
  }, [loadSettings]);

  useEffect(() => {
    setProfileForm({ name: user?.name || '' });
  }, [user?.name]);

  function setSectionError(section, message) {
    setErrors((current) => ({ ...current, [section]: message }));
  }

  function setSectionSuccess(section, message) {
    setSuccess((current) => ({ ...current, [section]: message }));
    window.setTimeout(() => setSuccess((current) => ({ ...current, [section]: '' })), 2500);
  }

  async function handleAvatar(file) {
    setAvatarData('');
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      setSectionError('profile', 'Avatar must be a PNG, JPEG, WebP, or GIF image');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setSectionError('profile', 'Avatar image must be 2 MB or smaller');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarData(String(reader.result || ''));
    reader.readAsDataURL(file);
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSaving((current) => ({ ...current, profile: true }));
    setSectionError('profile', '');
    try {
      const { data } = await api.put('/settings/profile', { name: profileForm.name, avatarData });
      if (data.user) setUser(data.user);
      if (data.settings) setSettings(data.settings);
      setAvatarData('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSectionSuccess('profile', 'Profile updated');
    } catch (err) {
      setSectionError('profile', err.response?.data?.message || 'Unable to update profile');
    } finally {
      setSaving((current) => ({ ...current, profile: false }));
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setSaving((current) => ({ ...current, password: true }));
    setSectionError('password', '');
    try {
      await api.put('/settings/password', passwordForm);
      setSectionSuccess('password', 'Password changed');
      logout();
      resetSettings();
      disconnectSocket();
      router.push('/login');
    } catch (err) {
      setSectionError('password', err.response?.data?.message || 'Unable to change password');
    } finally {
      setSaving((current) => ({ ...current, password: false }));
    }
  }

  async function logoutAll() {
    setSaving((current) => ({ ...current, logoutAll: true }));
    setSectionError('password', '');
    try {
      await api.post('/settings/logout-all');
      logout();
      resetSettings();
      disconnectSocket();
      router.push('/login');
    } catch (err) {
      setSectionError('password', err.response?.data?.message || 'Unable to logout all sessions');
      setSaving((current) => ({ ...current, logoutAll: false }));
    }
  }

  async function saveTheme(theme) {
    const previous = settings.theme;
    setSettings({ theme });
    setSaving((current) => ({ ...current, theme: true }));
    setSectionError('theme', '');
    try {
      const { data } = await api.put('/settings/theme', { theme });
      if (data.settings) setSettings(data.settings);
    } catch {
      setSettings({ theme: previous });
      setSectionError('theme', 'Unable to save theme');
    } finally {
      setSaving((current) => ({ ...current, theme: false }));
    }
  }

  async function savePreference(key, value) {
    let next = { ...preferences, [key]: value };
    if (key === 'browserNotifications' && value) {
      const resolved = await resolveBrowserNotificationPreference(true, window);
      next = { ...next, browserNotifications: resolved.enabled };
      if (resolved.error) setSectionError('notifications', resolved.error);
    }

    const previous = preferences;
    setSettings({ notificationPreferences: next });
    setSaving((current) => ({ ...current, notifications: true }));
    try {
      const { data } = await api.put('/settings/notifications', { notificationPreferences: next });
      if (data.settings) setSettings(data.settings);
      setSectionSuccess('notifications', 'Preferences saved');
    } catch {
      setSettings({ notificationPreferences: previous });
      setSectionError('notifications', 'Unable to save preferences');
    } finally {
      setSaving((current) => ({ ...current, notifications: false }));
    }
  }

  async function integrationAction(provider, action) {
    setSaving((current) => ({ ...current, [`${provider}:${action}`]: true }));
    setSectionError('integrations', '');
    try {
      const { data } = await api.post(`/settings/integrations/${provider}/${action}`);
      if (data.integrations) setIntegrations(data.integrations);
      if (data.url) window.location.href = data.url;
      if (action === 'test') setSectionSuccess('integrations', `${provider} connection verified`);
    } catch (err) {
      const fallback = action === 'test' ? 'Unable to test connection' : 'Unable to load integration status';
      setSectionError('integrations', err.response?.data?.message || fallback);
    } finally {
      setSaving((current) => ({ ...current, [`${provider}:${action}`]: false }));
    }
  }

  const avatarPreview = avatarData || assetUrl(user?.avatar);

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Settings</h1>
            <p className="mt-1 text-sm text-gray-500">Profile, security, preferences, integrations, and system health</p>
          </div>
          <button
            type="button"
            onClick={() => loadSettings({ showLoading: true })}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {errors.load && <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">{errors.load}</div>}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Section icon={User} title="Profile" error={errors.profile}>
            {loading ? <SkeletonRows rows={4} /> : (
              <form onSubmit={saveProfile} className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-violet-600">
                    {avatarPreview ? <img src={avatarPreview} alt="" className="h-full w-full object-cover" /> : <User className="h-6 w-6 text-white" />}
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
                    >
                      <Upload className="h-4 w-4" />
                      Upload avatar
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => handleAvatar(event.target.files?.[0])} />
                    <p className="mt-1 text-xs text-gray-500">PNG, JPEG, WebP, or GIF. 2 MB maximum.</p>
                  </div>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs text-gray-500">Full name</span>
                  <input
                    value={profileForm.name}
                    onChange={(event) => setProfileForm({ name: event.target.value })}
                    className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
                  />
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="text-sm text-gray-200">{user?.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Role</p>
                    <p className="text-sm capitalize text-gray-200">{user?.role}</p>
                  </div>
                </div>
                {success.profile && <p className="text-sm text-emerald-400">{success.profile}</p>}
                <button disabled={saving.profile} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {saving.profile ? 'Saving...' : 'Save profile'}
                </button>
              </form>
            )}
          </Section>

          <Section icon={Shield} title="Security Controls" error={errors.password}>
            {loading ? <SkeletonRows rows={4} /> : (
              <form onSubmit={changePassword} className="space-y-3">
                {['currentPassword', 'newPassword', 'confirmPassword'].map((field) => (
                  <label key={field} className="block">
                    <span className="mb-1 block text-xs text-gray-500">
                      {field === 'currentPassword' ? 'Current password' : field === 'newPassword' ? 'New password' : 'Confirm password'}
                    </span>
                    <input
                      type="password"
                      value={passwordForm[field]}
                      onChange={(event) => setPasswordForm((current) => ({ ...current, [field]: event.target.value }))}
                      className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
                    />
                  </label>
                ))}
                <p className="text-xs text-gray-500">Password must include uppercase, lowercase, number, and symbol characters.</p>
                {success.password && <p className="text-sm text-emerald-400">{success.password}</p>}
                <div className="flex flex-wrap gap-2">
                  <button disabled={saving.password} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                    <Lock className="h-4 w-4" />
                    {saving.password ? 'Changing...' : 'Change password'}
                  </button>
                  <button type="button" disabled={saving.logoutAll} onClick={logoutAll} className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 disabled:opacity-60">
                    <LogOut className="h-4 w-4" />
                    {saving.logoutAll ? 'Signing out...' : 'Logout all sessions'}
                  </button>
                </div>
              </form>
            )}
          </Section>

          <Section icon={Bell} title="Notification Preferences" error={errors.notifications}>
            {loading ? <SkeletonRows rows={5} /> : (
              <div className="space-y-2">
                <Toggle label="Workflow Completed" checked={preferences.workflowCompleted} disabled={saving.notifications} onChange={(value) => savePreference('workflowCompleted', value)} />
                <Toggle label="Workflow Failed" checked={preferences.workflowFailed} disabled={saving.notifications} onChange={(value) => savePreference('workflowFailed', value)} />
                <Toggle label="Workflow Started" checked={preferences.workflowStarted} disabled={saving.notifications} onChange={(value) => savePreference('workflowStarted', value)} />
                <Toggle label="Browser Notifications" checked={preferences.browserNotifications} disabled={saving.notifications} onChange={(value) => savePreference('browserNotifications', value)} />
                <Toggle label="Email Notifications" checked={preferences.emailNotifications} disabled={saving.notifications} onChange={(value) => savePreference('emailNotifications', value)} />
                {success.notifications && <p className="text-sm text-emerald-400">{success.notifications}</p>}
              </div>
            )}
          </Section>

          <Section icon={Monitor} title="Theme Settings" error={errors.theme}>
            <div className="grid grid-cols-3 gap-2">
              {['dark', 'light', 'system'].map((theme) => (
                <button
                  key={theme}
                  type="button"
                  disabled={saving.theme}
                  onClick={() => saveTheme(theme)}
                  className={`rounded-lg border px-3 py-3 text-sm font-semibold capitalize ${
                    settings.theme === theme
                      ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                      : 'border-gray-700 bg-gray-950 text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  {theme}
                </button>
              ))}
            </div>
          </Section>

          <Section icon={KeyRound} title="API Key Status Monitoring">
            {loading ? <SkeletonRows rows={4} /> : (
              <div className="space-y-2">
                {apiKeys.map((item) => (
                  <div key={item.key} className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950 px-3 py-3">
                    <span className="text-sm text-gray-200">{item.key}</span>
                    <StatusBadge status={item.status} />
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section icon={Lock} title="Encryption Key Health">
            {loading ? <SkeletonRows rows={1} /> : (
              <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950 px-3 py-3">
                <span className="text-sm text-gray-200">Encrypt/decrypt diagnostic</span>
                <StatusBadge status={encryption?.status || 'Missing'} />
              </div>
            )}
          </Section>

          <Section icon={PlugZap} title="Credential Management" error={errors.integrations}>
            {loading ? <SkeletonRows rows={4} /> : (
              <div className="space-y-3">
                {integrations.map((integration) => (
                  <div key={integration.provider} className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-white">{integration.label}</p>
                        <p className="text-xs text-gray-500">Last connected: {relativeDate(integration.lastConnectedAt)}</p>
                      </div>
                      <StatusBadge status={integration.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" disabled={saving[`${integration.provider}:reconnect`]} onClick={() => integrationAction(integration.provider, 'reconnect')} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
                        {integration.connected ? 'Reconnect' : 'Connect'}
                      </button>
                      <button type="button" disabled={saving[`${integration.provider}:disconnect`] || !integration.connected} onClick={() => integrationAction(integration.provider, 'disconnect')} className="rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 disabled:opacity-50">
                        Disconnect
                      </button>
                      <button type="button" disabled={saving[`${integration.provider}:test`] || !integration.connected} onClick={() => integrationAction(integration.provider, 'test')} className="inline-flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 disabled:opacity-50">
                        <TestTube2 className="h-3.5 w-3.5" />
                        Test
                      </button>
                    </div>
                  </div>
                ))}
                {success.integrations && <p className="text-sm text-emerald-400">{success.integrations}</p>}
              </div>
            )}
          </Section>

          <Section icon={Database} title="System Health">
            {loading || !health ? <SkeletonRows rows={7} /> : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-3">
                  <p className="text-xs text-gray-500">App Version</p>
                  <p className="text-sm text-gray-200">{health.appVersion}</p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-3">
                  <p className="text-xs text-gray-500">Environment</p>
                  <p className="text-sm text-gray-200">{health.environment}</p>
                </div>
                {[
                  ['Backend Status', health.backend?.status, CheckCircle],
                  ['MongoDB Status', health.mongodb?.status, Database],
                  ['Redis Status', health.redis?.status, CircleAlert],
                  ['Socket.IO Status', health.socketio?.status, PlugZap],
                  ['LangGraph Status', health.langGraph?.status, CircleOff],
                ].map(([label, status, Icon]) => (
                  <div key={label} className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950 px-3 py-3">
                    <span className="flex items-center gap-2 text-sm text-gray-200"><Icon className="h-4 w-4 text-gray-500" />{label}</span>
                    <StatusBadge status={status} />
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
