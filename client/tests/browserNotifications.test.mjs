import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBrowserNotificationPreference } from '../src/lib/browserNotifications.mjs';

test('browser notification preference stays disabled when unsupported', async () => {
  const result = await resolveBrowserNotificationPreference(true, {});
  assert.equal(result.enabled, false);
  assert.equal(result.error, 'Browser notifications are not supported in this browser');
});

test('browser notification preference follows denied permission', async () => {
  const result = await resolveBrowserNotificationPreference(true, {
    Notification: { requestPermission: async () => 'denied' },
  });
  assert.equal(result.enabled, false);
  assert.equal(result.error, 'Browser notification permission was not granted');
});

test('browser notification preference enables when permission is granted', async () => {
  const result = await resolveBrowserNotificationPreference(true, {
    Notification: { requestPermission: async () => 'granted' },
  });
  assert.equal(result.enabled, true);
  assert.equal(result.error, '');
});

test('browser notification preference can be disabled without permission prompt', async () => {
  let prompted = false;
  const result = await resolveBrowserNotificationPreference(false, {
    Notification: { requestPermission: async () => { prompted = true; return 'granted'; } },
  });
  assert.equal(result.enabled, false);
  assert.equal(prompted, false);
});
