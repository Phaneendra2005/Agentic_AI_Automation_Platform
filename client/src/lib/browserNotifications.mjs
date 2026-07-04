export async function resolveBrowserNotificationPreference(enabled, browserWindow = globalThis.window) {
  if (!enabled) return { enabled: false, error: '' };
  if (!browserWindow || !('Notification' in browserWindow)) {
    return { enabled: false, error: 'Browser notifications are not supported in this browser' };
  }
  const permission = await browserWindow.Notification.requestPermission();
  if (permission !== 'granted') {
    return { enabled: false, error: 'Browser notification permission was not granted' };
  }
  return { enabled: true, error: '' };
}
