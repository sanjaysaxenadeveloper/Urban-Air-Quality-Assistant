// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockGetDocFromServer } = vi.hoisted(() => ({
  mockGetDocFromServer: vi.fn(async () => ({})),
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getDocFromServer: (...args: any[]) => mockGetDocFromServer(...args),
  };
});
import {
  ApiClientError,
  fetchLiveAirApi,
  generatePlanApi,
  reverseGeocodeApi,
  searchLocationsApi,
  sendChatQuestionApi,
} from '../src/lib/apiClient.ts';
import {
  FIREBASE_APPLET_CONFIG,
  OperationType,
  handleFirestoreError,
  testFirestoreConnection,
  _resetConnectionTested,
  auth,
} from '../src/lib/firebase.ts';
import {
  enableBrowserPushNotifications,
  getBrowserNotificationPermission,
  isIosSafariNotStandalone,
  showLocalBrowserNotification,
} from '../src/lib/notifications.ts';
import { createSafeStorage } from '../src/lib/storage.ts';
import { migratePreferences } from '../shared/schemas.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('src/lib/storage.ts 100% Coverage', () => {
  it('covers error recovery in getItem, setItem, and removeItem', () => {
    let throwOnGet = false;
    let throwOnSet = false;
    let throwOnRemove = false;

    const faultyBackend = {
      getItem: vi.fn((key: string) => {
        if (throwOnGet) throw new Error('QuotaExceeded or SecurityError');
        return key === '__uaqa_storage_probe__' ? '1' : 'val';
      }),
      setItem: vi.fn((key: string, value: string) => {
        if (throwOnSet && key !== '__uaqa_storage_probe__') {
          throw new Error('QuotaExceeded');
        }
      }),
      removeItem: vi.fn((key: string) => {
        if (throwOnRemove && key !== '__uaqa_storage_probe__') {
          throw new Error('RemoveError');
        }
      }),
    };

    const storage = createSafeStorage(faultyBackend);
    expect(storage.mode).toBe('localStorage');

    // Test successful get
    expect(storage.getItem('k1')).toBe('val');

    // Trigger getItem failure -> falls back to memory mode
    throwOnGet = true;
    expect(storage.getItem('k1')).toBeNull();
    expect(storage.mode).toBe('memory');

    // Test storage with setItem failure
    const storage2 = createSafeStorage(faultyBackend);
    throwOnSet = true;
    storage2.setItem('k2', 'val2');
    expect(storage2.mode).toBe('memory');
    expect(storage2.getItem('k2')).toBe('val2');

    // Test storage with removeItem failure
    throwOnSet = false;
    const storage3 = createSafeStorage(faultyBackend);
    throwOnRemove = true;
    storage3.removeItem('k3');
    expect(storage3.mode).toBe('memory');

    // Backend is null
    const memStorage = createSafeStorage(null);
    expect(memStorage.mode).toBe('memory');
    memStorage.setItem('a', '1');
    expect(memStorage.getItem('a')).toBe('1');
    memStorage.removeItem('a');
    expect(memStorage.getItem('a')).toBeNull();

    // Access to window.localStorage throws SecurityError (line 20)
    const origDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('SecurityError: Access is denied for this document');
      },
      configurable: true,
    });
    const storageBlocked = createSafeStorage();
    expect(storageBlocked.mode).toBe('memory');
    if (origDescriptor) Object.defineProperty(window, 'localStorage', origDescriptor);
  });
});

describe('src/lib/apiClient.ts 100% Coverage', () => {
  it('handles ApiClientError, timeout/abort, and network errors', async () => {
    const err = new ApiClientError('CODE', 'message', 400);
    expect(err.name).toBe('ApiClientError');
    expect(err.code).toBe('CODE');
    expect(err.status).toBe(400);

    // Test abort / timeout
    const abortError = new Error('Abort');
    abortError.name = 'AbortError';
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(abortError);

    await expect(searchLocationsApi('Delhi')).rejects.toMatchObject({
      code: 'TIMEOUT',
      status: 504,
    });

    // Test generic network error
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network offline'));
    await expect(searchLocationsApi('Delhi')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });

    // Test reverseGeocodeApi, fetchLiveAirApi, generatePlanApi, and sendChatQuestionApi
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ location: { id: 'd', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2 } }),
    } as Response);
    const loc = await reverseGeocodeApi(28.6, 77.2);
    expect(loc.name).toBe('Delhi');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ aqi: 180 }),
    } as unknown as Response);
    const air = await fetchLiveAirApi(loc, true);
    expect(air.aqi).toBe(180);

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ airSnapshot: { aqi: 180 }, plan: {}, modelUsed: 'gemini' }),
    } as unknown as Response);
    const planRes = await generatePlanApi({
      location: loc,
      profile: { householdType: 'single_adult', commuteMode: 'metro', airPurifierAtHome: false, healthSensitivities: ['none'] },
    });
    expect(planRes.modelUsed).toBe('gemini');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ airSnapshot: { aqi: 180 }, reply: { answer: 'Safe', actionPoints: [] } }),
    } as unknown as Response);
    const chatRes = await sendChatQuestionApi({
      location: loc,
      profile: { householdType: 'single_adult', commuteMode: 'metro', airPurifierAtHome: false, healthSensitivities: ['none'] },
      question: 'Run outside?',
      history: [],
    });
    expect(chatRes.reply.answer).toBe('Safe');

    // Test non-ok response with JSON error
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: 'UNPROCESSABLE', message: 'Bad data' }),
    } as unknown as Response);
    await expect(searchLocationsApi('Bad')).rejects.toMatchObject({
      code: 'UNPROCESSABLE',
      message: 'Bad data',
      status: 422,
    });

    // Test res.json() rejecting -> .catch(() => ({})) fallback
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    } as unknown as Response);
    await expect(searchLocationsApi('BadJson')).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      status: 500,
    });

    // Test timeout firing controller.abort() callback
    vi.useFakeTimers();
    try {
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce((_url, init: any) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });
      const pending = searchLocationsApi('SlowCity');
      vi.advanceTimersByTime(40_000);
      await expect(pending).rejects.toMatchObject({
        code: 'TIMEOUT',
        status: 504,
      });
    } finally {
      vi.useRealTimers();
    }

    // Test non-ok response with NO message in JSON (falls back to Request failed (status))
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'INTERNAL_ERROR' }),
    } as unknown as Response);
    await expect(searchLocationsApi('Fail')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Request failed (500)',
      status: 500,
    });

    // Test network rejection with a non-Error string
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce('Raw socket disconnect');
    await expect(searchLocationsApi('Offline')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Unable to reach the server.',
      status: 0,
    });

    // Test fetchLiveAirApi with undefined state and refresh=false
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ aqi: 50 }),
    } as unknown as Response);
    const airNoState = await fetchLiveAirApi({ id: 'x', name: 'Pune', lat: 18.5, lon: 73.8 }, false);
    expect(airNoState.aqi).toBe(50);
  });
});

describe('src/lib/firebase.ts 100% Coverage', () => {
  it('covers handleFirestoreError and testFirestoreConnection', async () => {
    expect(FIREBASE_APPLET_CONFIG).toBeDefined();

    // handleFirestoreError with currentUser and providerData
    (auth as any).currentUser = {
      uid: 'u-provider',
      email: 'provider@example.com',
      emailVerified: true,
      isAnonymous: false,
      tenantId: null,
      providerData: [
        { providerId: 'google.com', email: 'provider@example.com' },
      ],
    };
    expect(() => {
      handleFirestoreError(new Error('Permission denied'), OperationType.WRITE, 'users/u1');
    }).toThrow();
    (auth as any).currentUser = null;

    // handleFirestoreError with currentUser null
    expect(() => {
      handleFirestoreError(new Error('Permission denied'), OperationType.WRITE, 'users/u1');
    }).toThrow();

    // handleFirestoreError with string error
    expect(() => {
      handleFirestoreError('String error message', OperationType.GET, null);
    }).toThrow();

    // testFirestoreConnection
    await testFirestoreConnection();
    // Second call should return immediately due to connectionTested flag
    await testFirestoreConnection();

    // Test offline error catch
    mockGetDocFromServer.mockRejectedValueOnce(new Error('the client is offline'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    _resetConnectionTested();
    await testFirestoreConnection();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Firestore client is offline')
    );
  });
});

describe('src/lib/notifications.ts 100% Coverage', () => {
  it('covers getBrowserNotificationPermission, iOS standalone check, and showLocalBrowserNotification', () => {
    // When Notification not in window
    expect(getBrowserNotificationPermission()).toBe('unsupported');

    // When Notification is in window
    // @ts-expect-error mock assignment
    globalThis.Notification = { permission: 'default' };
    expect(getBrowserNotificationPermission()).toBe('default');

    expect(isIosSafariNotStandalone()).toBe(false);

    // Mock navigator user agent for iOS
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...originalNavigator, userAgent: 'iPhone; CPU iPhone OS 15_0 like Mac OS X' },
      configurable: true,
      writable: true,
    });
    expect(isIosSafariNotStandalone()).toBe(true);

    // When iOS is in standalone mode via matchMedia
    const origMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn(() => ({ matches: true })) as any;
    expect(isIosSafariNotStandalone()).toBe(false);
    window.matchMedia = origMatchMedia;

    // Empty userAgent fallback
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...originalNavigator, userAgent: '' },
      configurable: true,
      writable: true,
    });
    expect(isIosSafariNotStandalone()).toBe(false);

    // When iOS is in standalone mode (installed PWA)
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...originalNavigator, userAgent: 'iPhone; CPU iPhone OS 15_0 like Mac OS X', standalone: true },
      configurable: true,
      writable: true,
    });
    expect(isIosSafariNotStandalone()).toBe(false);

    // When Notification permission is not granted
    expect(showLocalBrowserNotification('Title', 'Body')).toBe(false);

    // Mock Notification permission granted
    const originalNotification = globalThis.Notification;
    class MockNotification {
      static permission: NotificationPermission = 'granted';
      static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
      title: string;
      options: unknown;
      constructor(title: string, options: unknown) {
        this.title = title;
        this.options = options;
      }
    }
    // @ts-expect-error mock assignment
    globalThis.Notification = MockNotification;

    expect(showLocalBrowserNotification('Title', 'Body')).toBe(true);

    // When new Notification throws
    // @ts-expect-error mock throwing constructor
    globalThis.Notification = class ThrowingNotification {
      static permission: NotificationPermission = 'granted';
      static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
      constructor() {
        throw new Error('Not allowed');
      }
    };
    expect(showLocalBrowserNotification('Title', 'Body')).toBe(false);

    globalThis.Notification = originalNotification;
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it('covers enableBrowserPushNotifications branches', async () => {
    // 1. Permission denied
    const originalNotification = globalThis.Notification;
    class DeniedNotification {
      static permission: NotificationPermission = 'denied';
      static requestPermission = vi.fn(async () => 'denied' as NotificationPermission);
    }
    // @ts-expect-error mock
    globalThis.Notification = DeniedNotification;

    const resDenied = await enableBrowserPushNotifications();
    expect(resDenied.permission).toBe('denied');
    expect(resDenied.note).toContain('blocked');

    // 2. Permission default (dismissed)
    class DismissedNotification {
      static permission: NotificationPermission = 'default';
      static requestPermission = vi.fn(async () => 'default' as NotificationPermission);
    }
    // @ts-expect-error mock
    globalThis.Notification = DismissedNotification;

    const resDismissed = await enableBrowserPushNotifications();
    expect(resDismissed.permission).toBe('default');

    // 3. Permission granted, but no VAPID key
    class GrantedNotification {
      static permission: NotificationPermission = 'granted';
      static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
    }
    // @ts-expect-error mock
    globalThis.Notification = GrantedNotification;

    const resGranted = await enableBrowserPushNotifications();
    expect(resGranted.permission).toBe('granted');
    expect(resGranted.note).toContain('VITE_FIREBASE_VAPID_KEY');

    globalThis.Notification = originalNotification;
  });
});

describe('shared/schemas.ts 100% Branches Coverage', () => {
  it('covers migratePreferences unmapped lang, compactAdvice false, and units', () => {
    const migrated = migratePreferences({
      lang: 'unknown-lang',
      compactAdvice: false,
      units: 'metric',
    });
    expect(migrated.language).toBe('en');
    expect(migrated.adviceDetail).toBe('detailed');
    expect(migrated.tempUnit).toBe('C');
    expect(migrated.aqiScale).toBe('CPCB');

    const imperial = migratePreferences({
      units: 'imperial',
      compactAdvice: true,
    });
    expect(imperial.tempUnit).toBe('F');
    expect(imperial.aqiScale).toBe('EPA');
    expect(imperial.adviceDetail).toBe('concise');
  });
});

describe('src/i18n/I18nContext.tsx 100% Branches Coverage', () => {
  it('covers token interpolation fallback and object path fallback', async () => {
    const { translate } = await import('../src/i18n/I18nContext.tsx');
    // Token not in vars preserves {{mins}}
    const res = translate('en', 'snapshot.freshnessLive', { wrongVar: '123' });
    expect(res).toContain('{{mins}}');

    // Resolving a non-string object returns null and falls back to key
    const objRes = translate('en', 'snapshot.categories');
    expect(objRes).toBe('snapshot.categories');

    // Unsupported language falls back to English dictionary
    const fallbackRes = translate('xx' as any, 'app.title');
    expect(fallbackRes).toBe('Urban Air Quality Assistant');
  });
});
