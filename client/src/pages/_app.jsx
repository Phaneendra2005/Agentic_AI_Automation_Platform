import '@/styles/globals.css';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import useAuthStore from '@/store/authStore';
import useNotificationStore from '@/store/notificationStore';
import useSettingsStore from '@/store/settingsStore';
import api from '@/lib/axios';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { applyTheme } from '@/lib/theme';

function NotificationLoader() {
  const router = useRouter();
  const { isAuthenticated, setUser, logout } = useAuthStore();
  const { setNotifications, addNotification } = useNotificationStore();
  const { setSettings, setIntegrations, resetSettings } = useSettingsStore();

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      return;
    }

    let socket;

    api.get('/settings')
      .then(({ data }) => {
        if (data.user) setUser(data.user);
        if (data.settings) setSettings(data.settings);
        if (data.integrations) setIntegrations(data.integrations);
      })
      .catch(() => {});

    api.get('/notifications')
      .then(({ data }) => setNotifications(data.notifications || []))
      .catch(() => {});

    socket = connectSocket();

    const forceLogout = () => {
      logout();
      resetSettings();
      disconnectSocket();
      if (router.pathname !== '/login') router.push('/login');
    };
    const onProfile = (payload) => {
      if (payload.user) setUser(payload.user);
      if (payload.settings) setSettings(payload.settings);
    };
    const onTheme = (payload) => {
      if (payload.settings) setSettings(payload.settings);
      else if (payload.theme) setSettings({ theme: payload.theme });
    };
    const onNotifications = (payload) => {
      if (payload.settings) setSettings(payload.settings);
      else if (payload.notificationPreferences) {
        setSettings({ notificationPreferences: payload.notificationPreferences });
      }
    };
    const onIntegration = (payload) => {
      if (payload.integrations) setIntegrations(payload.integrations);
    };
    const onNotification = (notification) => {
      addNotification(notification);
      const prefs = useSettingsStore.getState().settings.notificationPreferences || {};
      if (
        prefs.browserNotifications &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        window.Notification.permission === 'granted'
      ) {
        new window.Notification(notification.title, { body: notification.message });
      }
    };

    socket.on('profile.updated', onProfile);
    socket.on('settings.theme.updated', onTheme);
    socket.on('settings.notifications.updated', onNotifications);
    socket.on('integration.connected', onIntegration);
    socket.on('integration.disconnected', onIntegration);
    socket.on('integration.reconnected', onIntegration);
    socket.on('security.passwordChanged', forceLogout);
    socket.on('security.logoutAll', forceLogout);
    socket.on('notification:new', onNotification);

    return () => {
      socket.off('profile.updated', onProfile);
      socket.off('settings.theme.updated', onTheme);
      socket.off('settings.notifications.updated', onNotifications);
      socket.off('integration.connected', onIntegration);
      socket.off('integration.disconnected', onIntegration);
      socket.off('integration.reconnected', onIntegration);
      socket.off('security.passwordChanged', forceLogout);
      socket.off('security.logoutAll', forceLogout);
      socket.off('notification:new', onNotification);
    };
  }, [isAuthenticated, setUser, logout, router, setSettings, setIntegrations, resetSettings, setNotifications, addNotification]);

  useEffect(() => {
    const syncTheme = () => {
      const theme = useSettingsStore.getState().settings.theme;
      applyTheme(theme);
    };
    window.addEventListener('storage', syncTheme);
    const media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener?.('change', syncTheme);
    return () => {
      window.removeEventListener('storage', syncTheme);
      media.removeEventListener?.('change', syncTheme);
    };
  }, []);

  return null;
}

export default function App({ Component, pageProps }) {
  return (
    <>
      <NotificationLoader />
      <Component {...pageProps} />
    </>
  );
}
