// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockIsSupported = vi.fn();
const mockGetToken = vi.fn();
const mockGetMessaging = vi.fn(() => ({}));

vi.mock('firebase/messaging', () => ({
  isSupported: () => mockIsSupported(),
  getToken: (...args: any[]) => mockGetToken(...args),
  getMessaging: (...args: any[]) => mockGetMessaging(...args),
}));

import { enableBrowserPushNotifications } from '../src/lib/notifications.ts';

describe('src/lib/notifications.ts FCM push coverage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('handles window without Notification (unsupported)', async () => {
    const orig = (globalThis as any).Notification;
    delete (globalThis as any).Notification;
    const res = await enableBrowserPushNotifications();
    expect(res.permission).toBe('unsupported');
    (globalThis as any).Notification = orig;
  });

  it('handles service worker registration success and failure', async () => {
    (import.meta.env as any).VITE_FIREBASE_VAPID_KEY = 'test-vapid-key';

    class GrantedNotification {
      static permission: NotificationPermission = 'granted';
      static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
    }
    (globalThis as any).Notification = GrantedNotification;

    // Navigator with service worker
    const registerMock = vi.fn(async () => ({} as any));
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: registerMock },
      configurable: true,
      writable: true,
    });

    mockIsSupported.mockResolvedValueOnce(false);
    const rNotSupported = await enableBrowserPushNotifications();
    expect(rNotSupported.note).toContain('FCM Web Push is not supported');
    expect(registerMock).toHaveBeenCalled();

    // With service worker registration failure
    registerMock.mockRejectedValueOnce(new Error('SW failed'));
    mockIsSupported.mockResolvedValueOnce(true);
    mockGetToken.mockResolvedValueOnce('fcm-token-123');

    const rWithToken = await enableBrowserPushNotifications();
    expect(rWithToken.fcmToken).toBe('fcm-token-123');

    // With getToken returning null
    mockIsSupported.mockResolvedValueOnce(true);
    mockGetToken.mockResolvedValueOnce(null);
    const rNoToken = await enableBrowserPushNotifications();
    expect(rNoToken.fcmToken).toBeNull();
    expect(rNoToken.note).toContain('no FCM token was returned');

    // With getToken throwing error
    mockIsSupported.mockResolvedValueOnce(true);
    mockGetToken.mockRejectedValueOnce(new Error('VAPID key invalid'));
    const rError = await enableBrowserPushNotifications();
    expect(rError.fcmToken).toBeNull();
    expect(rError.note).toContain('Background FCM token registration could not complete');

    delete (import.meta.env as any).VITE_FIREBASE_VAPID_KEY;
  });
});
