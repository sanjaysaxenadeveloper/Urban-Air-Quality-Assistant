import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { firebaseApp } from './firebase.ts';

export type BrowserNotificationPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function getBrowserNotificationPermission(): BrowserNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function isIosSafariNotStandalone(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isStandalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return isIos && !isStandalone;
}

export interface EnablePushResult {
  permission: BrowserNotificationPermission;
  fcmToken: string | null;
  note: string;
}

/**
 * Must ONLY be called directly inside a user-initiated click handler after
 * showing the pre-permission explanation UI.
 */
export async function enableBrowserPushNotifications(): Promise<EnablePushResult> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      permission: 'unsupported',
      fcmToken: null,
      note: 'This browser does not support Web Push notifications. In-app alerts remain active.',
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      permission,
      fcmToken: null,
      note:
        permission === 'denied'
          ? 'Browser notifications are blocked in your browser site settings. In-app alerts still work.'
          : 'Notification permission was dismissed. You can try again anytime.',
    };
  }

  let swRegistration: ServiceWorkerRegistration | undefined;
  if ('serviceWorker' in navigator) {
    try {
      swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    } catch {
      // Service worker optional for local notifications
    }
  }

  const vapidKey = (import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined)?.trim();
  if (!vapidKey) {
    return {
      permission: 'granted',
      fcmToken: null,
      note: 'Browser notifications enabled! To receive background push while the tab is closed, set VITE_FIREBASE_VAPID_KEY in your environment.',
    };
  }

  try {
    const supported = await isSupported();
    if (!supported) {
      return {
        permission: 'granted',
        fcmToken: null,
        note: 'Browser notifications enabled locally (FCM Web Push is not supported in this browser environment).',
      };
    }
    const messaging = getMessaging(firebaseApp);
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swRegistration,
    });
    if (token) {
      return {
        permission: 'granted',
        fcmToken: token,
        note: 'Browser push alerts enabled and registered for background smog updates.',
      };
    }
    return {
      permission: 'granted',
      fcmToken: null,
      note: 'Browser notifications enabled, but no FCM token was returned.',
    };
  } catch {
    return {
      permission: 'granted',
      fcmToken: null,
      note: 'Browser notifications enabled locally. Background FCM token registration could not complete in this browser.',
    };
  }
}

export function showLocalBrowserNotification(title: string, body: string): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    new Notification(title, { body, tag: 'uaqa-live-alert' });
    return true;
  } catch {
    return false;
  }
}
