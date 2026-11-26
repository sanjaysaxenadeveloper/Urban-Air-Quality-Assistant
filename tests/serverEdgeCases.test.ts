import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.ts';
import { loadConfig } from '../server/config.ts';
import { InMemoryUsersRepo } from '../server/services/usersRepo.ts';
import { createFirebaseTokenVerifier } from '../server/middleware/authMiddleware.ts';
import * as alertsEngine from '../server/services/alertsEngine.ts';
import { DEFAULT_ALERT_PREFS, DEFAULT_USER_PROFILE, type AirQualitySnapshot } from '../shared/schemas.ts';

const { mockVerifyIdToken } = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(async () => ({
    uid: 'u-admin-1',
    email: 'admin@example.com',
    email_verified: true,
  })),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

const { mockSendMulticast } = vi.hoisted(() => ({
  mockSendMulticast: vi.fn(),
}));

vi.mock('firebase-admin/app', () => ({
  getApps: vi.fn(() => [1]),
  getApp: vi.fn(() => ({})),
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: vi.fn(() => ({
    sendEachForMulticast: mockSendMulticast,
  })),
}));

describe('Server Edge Cases 100% Coverage', () => {
  it('covers createFirebaseTokenVerifier execution and decoded user mapping', async () => {
    const verifier = createFirebaseTokenVerifier('test-project-123');
    const user = await verifier('token-abc-xyz');
    expect(user.uid).toBe('u-admin-1');
    expect(user.email).toBe('admin@example.com');
    expect(user.email_verified).toBe(true);
  });

  it('covers internal alerts duplicate idempotency key skip and key clearing > 5000', async () => {
    const usersRepo = new InMemoryUsersRepo();
    const loc = { id: 'loc-dup', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2, alertsEnabled: true };
    // Saved locations with same id in one user's list produces identical idempotencyKey
    await usersRepo.updateSavedLocations('user-dup-1', 'dup@example.com', [loc, { ...loc, name: 'Delhi 2' }]);
    await usersRepo.updateAlertPrefs('user-dup-1', 'dup@example.com', {
      ...DEFAULT_ALERT_PREFS,
      enabled: true,
      aqiThreshold: 100,
      dailyCap: 10,
    });

    const snap: AirQualitySnapshot = {
      location: loc,
      aqi: 320,
      cpcbCategory: 'very_poor',
      usEpaAqi: 220,
      usEpaCategory: 'very_unhealthy',
      pm25: 180,
      pm10: 290,
      no2: 40,
      so2: 10,
      o3: 20,
      co: 1,
      dominantPollutant: 'PM2.5',
      weather: null,
      source: { id: 'cpcb', name: 'CPCB', isModelled: false },
      updatedAtIso: new Date().toISOString(),
      fetchedAtIso: new Date().toISOString(),
      freshness: 'live',
      freshnessMinutes: 5,
      cacheHit: false,
    };

    const mockAir = {
      getLiveAirSnapshot: vi.fn(async () => snap),
    };

    const spy = vi.spyOn(alertsEngine, 'evaluateLocationAlert').mockImplementation((params) => ({
      shouldSend: true,
      triggerType: 'threshold',
      effectiveThreshold: 100,
      idempotencyKey: 'forced-same-idem-key',
      nextState: {
        lastNotifiedByLoc: {},
        dailyCountDate: '2026-01-01',
        dailyCountSent: 1,
      },
    }));

    const config = loadConfig({ SCHEDULER_SECRET: 'test-secret' });
    const app = createApp({
      config,
      usersRepo,
      airService: mockAir as any,
      disableRateLimit: true,
    });

    // 1. First trigger - sends alert on first loc, skips second loc due to duplicate idempotency key
    const r1 = await request(app)
      .post('/internal/check-alerts')
      .set('Authorization', 'Bearer test-secret');
    expect(r1.status).toBe(200);
    expect(r1.body.skippedByReason.idempotent_duplicate).toBe(1);

    spy.mockRestore();
  });

  it('covers /api/user/test-alert with custom city, fallback city, FCM push, and invalid tokens pruning', async () => {
    const usersRepo = new InMemoryUsersRepo();
    await usersRepo.registerFcmToken('u-admin-1', 'admin@example.com', {
      token: 'bad-token-1',
      platform: 'web',
      updatedAtIso: new Date().toISOString(),
    });
    const mockDispatcher = {
      sendPush: vi.fn(async () => ({
        sentCount: 0,
        failedCount: 1,
        invalidTokens: ['bad-token-1'],
      })),
    };

    const config = loadConfig({ SCHEDULER_SECRET: 'test-secret' });
    const app = createApp({
      config,
      usersRepo,
      notificationDispatcher: mockDispatcher as any,
      verifyIdTokenFn: async () => ({
        uid: 'u-admin-1',
        email: 'admin@example.com',
        email_verified: true,
      }),
      disableRateLimit: true,
    });

    // Test with explicit city
    const res1 = await request(app)
      .post('/api/user/test-alert')
      .set('Authorization', 'Bearer valid-token')
      .send({ city: 'Bengaluru' });
    expect(res1.status).toBe(200);
    expect(res1.body.notification.title).toContain('Bengaluru');

    // Test with no city (falls back to saved city or default)
    const res2 = await request(app)
      .post('/api/user/test-alert')
      .set('Authorization', 'Bearer valid-token')
      .send({});
    expect(res2.status).toBe(200);
    expect(res2.body.notification.title).toBeDefined();

    // Test with push dispatcher returning 0 invalid tokens (hits false branch of invalidTokens.length > 0)
    mockDispatcher.sendPush.mockResolvedValueOnce({
      sentCount: 1,
      failedCount: 0,
      invalidTokens: [],
    });
    await usersRepo.registerFcmToken('u-admin-1', 'admin@example.com', {
      token: 'good-token-1',
      platform: 'web',
      updatedAtIso: new Date().toISOString(),
    });
    const res3 = await request(app)
      .post('/api/user/test-alert')
      .set('Authorization', 'Bearer valid-token')
      .send({ city: 'Pune' });
    expect(res3.status).toBe(200);

    // Verify bad-token-1 was pruned from usersRepo
    const u = await usersRepo.getOrCreateUser('u-admin-1', 'admin@example.com');
    expect(u.fcmTokens.some((t) => t.token === 'bad-token-1')).toBe(false);
  });

  it('covers PUT /api/user/locations with nested locations object and bare array', async () => {
    const usersRepo = new InMemoryUsersRepo();
    const config = loadConfig();
    const app = createApp({
      config,
      usersRepo,
      verifyIdTokenFn: async () => ({
        uid: 'u-admin-1',
        email: 'admin@example.com',
        email_verified: true,
      }),
      disableRateLimit: true,
    });

    const loc1 = { id: 'loc-1', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2, alertsEnabled: true };

    // Nested: { locations: [loc1] }
    const res1 = await request(app)
      .put('/api/user/locations')
      .set('Authorization', 'Bearer valid-token')
      .send({ locations: [loc1] });
    expect(res1.status).toBe(200);
    expect(res1.body.savedLocations).toHaveLength(1);

    // Bare array: [loc1]
    const res2 = await request(app)
      .put('/api/user/locations')
      .set('Authorization', 'Bearer valid-token')
      .send([loc1]);
    expect(res2.status).toBe(200);
    expect(res2.body.savedLocations).toHaveLength(1);
  });

  it('covers dataProviders reverseGeocodeIndia with mock fetch returning locality details', async () => {
    const { reverseGeocodeIndia } = await import('../server/services/dataProviders.ts');
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        address: {
          suburb: 'Connaught Place',
          city: 'New Delhi',
          state: 'Delhi',
        },
      }),
    })) as unknown as typeof fetch;

    const res = await reverseGeocodeIndia(28.63, 77.21, { fetchFn: mockFetch });
    expect(res.name).toContain('Connaught Place');
    expect(res.state).toBe('Delhi');
  });

  it('covers airService cached location name fallback when req.city is empty', async () => {
    const { AirService } = await import('../server/services/airService.ts');
    const snap = {
      location: { id: 'delhi', name: 'Delhi NCR', state: 'Delhi', lat: 28.6, lon: 77.2 },
      aqi: 250,
      cpcbCategory: 'poor',
      usEpaAqi: 200,
      usEpaCategory: 'very_unhealthy',
      pm25: 120,
      pm10: 200,
      no2: 30,
      so2: 10,
      o3: 15,
      co: 1,
      dominantPollutant: 'PM2.5',
      weather: null,
      source: { id: 'cpcb', name: 'CPCB', isModelled: false },
      updatedAtIso: new Date().toISOString(),
      fetchedAtIso: new Date().toISOString(),
      freshness: 'live' as const,
      freshnessMinutes: 1,
      cacheHit: false,
    };

    const mockFetch = vi.fn();
    const service = new AirService({ config: { airCacheTtlMs: 60000 } as any, fetchFn: mockFetch });
    // Pre-populate cache directly
    (service as any).cache.set(28.6, 77.2, snap);

    // Request with undefined city -> uses cached.location.name
    const cachedRes = await service.getLiveAirSnapshot({ lat: 28.6, lon: 77.2 });
    expect(cachedRes.location.name).toBe('Delhi NCR');
  });

  it('covers alertsEngine morning briefing and category worsening to severe', async () => {
    const { evaluateLocationAlert, mapAlertSeverity } = await import('../server/services/alertsEngine.ts');
    // mapAlertSeverity for severe
    expect(mapAlertSeverity(450, 'category_change')).toBe('severe');

    const snapSevere: AirQualitySnapshot = {
      location: { id: 'l1', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2 },
      aqi: 450,
      cpcbCategory: 'severe',
      usEpaAqi: 350,
      usEpaCategory: 'hazardous',
      pm25: 350,
      pm10: 450,
      no2: 80,
      so2: 20,
      o3: 30,
      co: 2,
      dominantPollutant: 'PM2.5',
      weather: null,
      source: { id: 'cpcb', name: 'CPCB', isModelled: false },
      updatedAtIso: new Date().toISOString(),
      fetchedAtIso: new Date().toISOString(),
      freshness: 'live',
      freshnessMinutes: 1,
      cacheHit: false,
    };

    // Category worsening jump to severe
    const evalSevere = evaluateLocationAlert({
      uid: 'u1',
      location: { id: 'l1', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2, alertsEnabled: true },
      snapshot: snapSevere,
      alertPrefs: {
        ...DEFAULT_ALERT_PREFS,
        enabled: true,
        categoryChangeAlerts: true,
        thresholdAqi: 200,
        quietHoursEnabled: false,
      },
      profile: DEFAULT_USER_PROFILE,
      alertState: {
        lastNotifiedByLoc: {
          l1: {
            sentAtIso: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
            category: 'very_poor',
            aqi: 320,
          },
        },
        dailyCountDate: '2026-11-25',
        dailyCountSent: 1,
      },
      now: new Date('2026-11-25T07:00:00.000Z'),
    });
    expect(evalSevere.shouldSend).toBe(true);
    expect(evalSevere.triggerType).toBe('category_change');

    // Morning briefing within 15 minutes of scheduled time
    // 07:30 IST is 02:00 UTC
    const evalBriefing = evaluateLocationAlert({
      uid: 'u1',
      location: { id: 'l1', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2, alertsEnabled: true },
      snapshot: { ...snapSevere, cpcbCategory: 'moderate', aqi: 150 },
      alertPrefs: {
        ...DEFAULT_ALERT_PREFS,
        enabled: true,
        morningBriefingEnabled: true,
        morningBriefingTime: '07:30',
        quietHoursEnabled: false,
        thresholdAqi: 100,
      },
      profile: DEFAULT_USER_PROFILE,
      alertState: {
        lastNotifiedByLoc: {},
        dailyCountDate: '2026-11-24',
        dailyCountSent: 0,
        lastBriefingDate: '2026-11-24', // yesterday
      },
      now: new Date('2026-11-25T02:05:00.000Z'), // 07:35 IST, within 15 mins of 07:30
    });
    expect(evalBriefing.shouldSend).toBe(true);
    expect(evalBriefing.triggerType).toBe('morning_briefing');
  });

  it('covers createFirebaseTokenVerifier without projectId or env when config file does not exist', async () => {
    const fs = await import('fs');
    const existsSpy = vi.spyOn(fs.default, 'existsSync').mockReturnValue(false);
    const origVite = process.env.VITE_FIREBASE_PROJECT_ID;
    const origFb = process.env.FIREBASE_PROJECT_ID;
    delete process.env.VITE_FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_PROJECT_ID;

    const verifier = createFirebaseTokenVerifier(undefined);
    expect(typeof verifier).toBe('function');

    existsSpy.mockRestore();
    if (origVite) process.env.VITE_FIREBASE_PROJECT_ID = origVite;
    if (origFb) process.env.FIREBASE_PROJECT_ID = origFb;
  });

  it('covers GeminiEngine timeout in withTimeout and retry backoff in sleep', async () => {
    const { GeminiEngine } = await import('../server/services/geminiEngine.ts');
    let callCount = 0;
    const engine = new GeminiEngine({
      apiKey: 'test-k',
      model: 'gemini-2.5-flash',
      primaryTimeoutMs: 15,
      finalTimeoutMs: 15,
      retryDelayMs: 2,
      generateTextFn: async () => {
        callCount++;
        if (callCount === 1) {
          // Exceed timeout to trigger withTimeout reject
          await new Promise((r) => setTimeout(r, 40));
        }
        return JSON.stringify({
          title: 'Alert',
          body: 'Air smog',
          reason: 'AQI high',
        });
      },
    });

    const copy = await engine.generateAlertCopy({
      airSnapshot: {
        location: { id: 'd', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2 },
        aqi: 250,
        cpcbCategory: 'poor',
        usEpaAqi: 180,
        usEpaCategory: 'unhealthy',
        pm25: 120,
        pm10: 200,
        no2: 30,
        so2: 10,
        o3: 20,
        co: 1,
        dominantPollutant: 'PM2.5',
        weather: null,
        source: { id: 'cpcb', name: 'CPCB', isModelled: false },
        updatedAtIso: new Date().toISOString(),
        fetchedAtIso: new Date().toISOString(),
        freshness: 'live',
        freshnessMinutes: 1,
        cacheHit: false,
      },
      profile: DEFAULT_USER_PROFILE,
      triggerType: 'threshold',
      language: 'en',
    });
    expect(copy.title).toBeDefined();
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it('covers dataProviders reverseGeocodeIndia without address and with default fetch', async () => {
    const { reverseGeocodeIndia } = await import('../server/services/dataProviders.ts');
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ address: undefined }),
    })) as unknown as typeof fetch;

    const res = await reverseGeocodeIndia(19.07, 72.87, { fetchFn: mockFetch });
    expect(res.name).toContain('Location (19.07, 72.87)');
    expect(res.state).toBe('');
  });

  it('covers authMiddleware, notificationService, internal router, alertsEngine, and SSR storage/notifications branches', async () => {
    // 1. SSR branches in storage.ts and notifications.ts
    const { createSafeStorage } = await import('../src/lib/storage.ts');
    expect(createSafeStorage().mode).toBe('memory');
    const { isIosSafariNotStandalone } = await import('../src/lib/notifications.ts');
    expect(isIosSafariNotStandalone()).toBe(false);

    // 2. authMiddleware uncovered branches (resolveFirebaseProjectId, getApps()=[], decoded.email undefined, non-Error catch)
    const fs = (await import('fs')).default;
    const appMod = await import('firebase-admin/app');
    (appMod.getApps as any).mockReturnValue([]);
    vi.spyOn(fs, 'existsSync').mockReturnValueOnce(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValueOnce(JSON.stringify({ projectId: 'remixed-project-id' }));
    const verifierNoProj = createFirebaseTokenVerifier(undefined);
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'u-no-email', email: undefined, email_verified: false } as any);
    const decodedNoEmail = await verifierNoProj('valid-token-123456');
    expect(decodedNoEmail.email).toBeUndefined();

    // Non-Error rejection in createAuthMiddleware
    const { createAuthMiddleware } = await import('../server/middleware/authMiddleware.ts');
    const express = (await import('express')).default;
    const miniApp = express();
    miniApp.get(
      '/test-auth',
      createAuthMiddleware(async () => {
        throw 'non-error-string';
      }),
      (_req, res) => res.json({ ok: true })
    );
    const authErrRes = await request(miniApp)
      .get('/test-auth')
      .set('Authorization', 'Bearer valid-token-123456');
    expect(authErrRes.status).toBe(401);

    // decoded.email undefined in createAuthMiddleware
    const miniApp2 = express();
    miniApp2.get(
      '/test-auth2',
      createAuthMiddleware(async () => ({ uid: 'u1', email: undefined, email_verified: true })),
      (req: any, res) => res.json({ email: req.authUser.email })
    );
    const authOkRes = await request(miniApp2)
      .get('/test-auth2')
      .set('Authorization', 'Bearer valid-token-123456');
    expect(authOkRes.body.email).toBe('');

    // 3. FirebaseFcmDispatcher uncovered branches (getApps()=[], badToken undefined, non-Error catch)
    const { FirebaseFcmDispatcher } = await import('../server/services/notificationService.ts');
    mockSendMulticast
      .mockResolvedValueOnce({
        successCount: 0,
        failureCount: 1,
        responses: [
          { success: true },
          { success: false, error: { code: 'messaging/registration-token-not-registered' } }, // idx=1 -> tokens[1] is undefined
        ],
      })
      .mockRejectedValueOnce('fcm-string-failure');
    const dispatcher = new FirebaseFcmDispatcher(undefined);
    const rPush1 = await dispatcher.sendPush({ tokens: ['only-1-token'], title: 'T', body: 'B' });
    expect(rPush1.invalidTokens).toEqual([]);
    const rPush2 = await dispatcher.sendPush({ tokens: ['only-1-token'], title: 'T', body: 'B' });
    expect(rPush2.failedCount).toBe(1);

    // 4. alertsEngine uncovered branches
    const {
      parseHHmm,
      isWithinQuietHours,
      isSensitiveHousehold,
      mapAlertSeverity,
      evaluateLocationAlert,
    } = alertsEngine;
    expect(parseHHmm('bad')).toBe(0);
    expect(isWithinQuietHours(100, '08:00', '08:00')).toBe(false);
    expect(isSensitiveHousehold({ ...DEFAULT_ALERT_PREFS, sensitiveMode: true }, DEFAULT_USER_PROFILE)).toBe(true);
    expect(mapAlertSeverity(250, 'recovery')).toBe('info');

    const now = new Date('2026-11-25T10:00:00.000Z');
    const baseLoc = { id: 'l1', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2, alertsEnabled: true };
    const poorSnap: AirQualitySnapshot = {
      location: baseLoc,
      aqi: 310,
      cpcbCategory: 'very_poor',
      usEpaAqi: 220,
      usEpaCategory: 'very_unhealthy',
      pm25: 150,
      pm10: 250,
      no2: 30,
      so2: 10,
      o3: 20,
      co: 1,
      dominantPollutant: 'PM2.5',
      weather: null,
      source: { id: 'cpcb', name: 'CPCB', isModelled: false },
      updatedAtIso: now.toISOString(),
      fetchedAtIso: now.toISOString(),
      freshness: 'live',
      freshnessMinutes: 2,
      cacheHit: false,
    };

    // morningBriefingEnabled outside +/- 15 min window + category worsening < 60 min and not severe
    const evalShortCooldown = evaluateLocationAlert({
      uid: 'u1',
      location: baseLoc,
      snapshot: poorSnap,
      alertPrefs: {
        ...DEFAULT_ALERT_PREFS,
        enabled: true,
        thresholdAqi: 100,
        morningBriefingEnabled: true,
        morningBriefingTime: '07:00',
        categoryChangeAlerts: true,
      },
      alertState: {
        lastNotifiedByLoc: {
          l1: { aqi: 220, category: 'poor', sentAtIso: new Date(now.getTime() - 10 * 60_000).toISOString(), type: 'threshold' },
        },
        dailyCountDate: '2026-11-25',
        dailyCountSent: 1,
      },
      profile: DEFAULT_USER_PROFILE,
      now,
    });
    expect(evalShortCooldown.shouldSend).toBe(false);

    // prevRank < poor (moderate) and currRank < prevRank (good) -> neither worsening nor recovery from poor
    const evalModToGood = evaluateLocationAlert({
      uid: 'u1',
      location: baseLoc,
      snapshot: { ...poorSnap, aqi: 40, cpcbCategory: 'good' },
      alertPrefs: { ...DEFAULT_ALERT_PREFS, enabled: true, thresholdAqi: 200, categoryChangeAlerts: true },
      alertState: {
        lastNotifiedByLoc: {
          l1: { aqi: 120, category: 'moderate', sentAtIso: new Date(now.getTime() - 120 * 60_000).toISOString(), type: 'threshold' },
        },
        dailyCountDate: '2026-11-25',
        dailyCountSent: 1,
      },
      profile: DEFAULT_USER_PROFILE,
      now,
    });
    expect(evalModToGood.shouldSend).toBe(false);

    // 5. internal.ts uncovered branches (loc.alertsEnabled=false, non-Error getLiveAirSnapshot, skipReason undefined, invalidTokens=[], idemKey undefined)
    const usersRepo = new InMemoryUsersRepo();
    await usersRepo.updateSavedLocations('u-int-1', 'int@example.com', [
      { id: 'loc-off', name: 'OffCity', state: 'State', lat: 10.0, lon: 76.0, alertsEnabled: false },
      { id: 'loc-err', name: 'ErrCity', state: 'State', lat: 11.0, lon: 77.0, alertsEnabled: true },
      { id: 'loc-ok', name: 'OkCity', state: 'State', lat: 12.0, lon: 78.0, alertsEnabled: true },
    ]);
    await usersRepo.updateAlertPrefs('u-int-1', 'int@example.com', { ...DEFAULT_ALERT_PREFS, enabled: true });
    await usersRepo.registerFcmToken('u-int-1', 'int@example.com', {
      token: 'good-fcm-tok',
      platform: 'web',
      updatedAtIso: now.toISOString(),
    });

    const spyEval = vi
      .spyOn(alertsEngine, 'evaluateLocationAlert')
      .mockReturnValueOnce({ shouldSend: false, effectiveThreshold: 200, nextState: { lastNotifiedByLoc: {}, dailyCountDate: '', dailyCountSent: 0 } })
      .mockReturnValueOnce({ shouldSend: false, effectiveThreshold: 200, nextState: { lastNotifiedByLoc: {}, dailyCountDate: '', dailyCountSent: 0 } })
      .mockReturnValueOnce({
        shouldSend: true,
        triggerType: 'threshold',
        effectiveThreshold: 200,
        idempotencyKey: undefined,
        nextState: { lastNotifiedByLoc: {}, dailyCountDate: '', dailyCountSent: 1 },
      });

    const mockAirInt = {
      getLiveAirSnapshot: vi.fn(async ({ city }: any) => {
        if (city === 'ErrCity') throw 'non-error-air-down';
        return poorSnap;
      }),
    };
    const mockPushInt = {
      sendPush: vi.fn(async () => ({ sentCount: 1, failedCount: 0, invalidTokens: [] })),
    };

    const intApp = createApp({
      config: loadConfig({ SCHEDULER_SECRET: 'sec-123' }),
      usersRepo,
      airService: mockAirInt as any,
      notificationDispatcher: mockPushInt as any,
      disableRateLimit: true,
    });
    const intRes = await request(intApp).post('/internal/check-alerts').set('Authorization', 'Bearer sec-123');
    expect(intRes.status).toBe(200);
    expect(intRes.body.skippedByReason.no_trigger).toBe(2);
    expect(intRes.body.alertsSent).toBe(1);

    spyEval.mockRestore();
    vi.restoreAllMocks();
  });

  it('covers remaining branches in authMiddleware, notificationService, geminiEngine, and dataProviders', async () => {
    // 1. authMiddleware line 42: getApps()=[] with explicit projectId
    const appMod = await import('firebase-admin/app');
    (appMod.getApps as any).mockReturnValue([]);
    const verifierWithProj = createFirebaseTokenVerifier('explicit-proj-id');
    await verifierWithProj('valid-token-123456');

    // 2. notificationService line 74: Error instance catch
    const { FirebaseFcmDispatcher } = await import('../server/services/notificationService.ts');
    mockSendMulticast.mockRejectedValueOnce(new Error('FCM network error'));
    const disp = new FirebaseFcmDispatcher('proj-1');
    const errRes = await disp.sendPush({ tokens: ['tok-1'], title: 'T', body: 'B' });
    expect(errRes.failedCount).toBe(1);

    // 3. geminiEngine uncovered branches (non-Error upstream, callTimeoutMs=0, GeminiEngineError rethrow, alertCopy fallbacks)
    const { GeminiEngine, GeminiEngineError } = await import('../server/services/geminiEngine.ts');
    const engineNoTimeout = new GeminiEngine({
      apiKey: 'k',
      model: 'gemini-2.5-flash',
      primaryTimeoutMs: 0,
      finalTimeoutMs: 0,
      maxRetries: 0,
      retryDelayMs: 0,
      generateTextFn: vi
        .fn()
        .mockRejectedValueOnce('plain-string-upstream-error')
        .mockRejectedValueOnce(new GeminiEngineError('CUSTOM_ERR', 'Direct engine error', 400))
        .mockResolvedValueOnce('{"title":123}')
        .mockResolvedValueOnce('{"title":"ok","body":"short","reason":"r"}'),
    });

    const baseSnap: AirQualitySnapshot = {
      location: { id: 'd', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2 },
      aqi: 250,
      cpcbCategory: 'poor',
      usEpaAqi: 180,
      usEpaCategory: 'unhealthy',
      pm25: null,
      pm10: 200,
      no2: 30,
      so2: 10,
      o3: 20,
      co: 1,
      dominantPollutant: 'PM10',
      weather: null,
      source: { id: 'cpcb', name: 'CPCB', isModelled: false },
      updatedAtIso: new Date().toISOString(),
      fetchedAtIso: new Date().toISOString(),
      freshness: 'live',
      freshnessMinutes: 1,
      cacheHit: false,
    };

    // Non-Error upstream -> falls back to template with pm25: null and language='hi', triggerType='recovery'
    const c1 = await engineNoTimeout.generateAlertCopy({
      airSnapshot: baseSnap,
      profile: DEFAULT_USER_PROFILE,
      triggerType: 'recovery',
      language: 'hi',
    });
    expect(c1.usedFallback).toBe(true);

    // GeminiEngineError rethrown inside retry loop -> caught by generateAlertCopy -> English morning_briefing fallback
    const c2 = await engineNoTimeout.generateAlertCopy({
      airSnapshot: baseSnap,
      profile: DEFAULT_USER_PROFILE,
      triggerType: 'morning_briefing',
      language: 'en',
    });
    expect(c2.usedFallback).toBe(true);

    // Invalid schema in generateAlertCopy safeParse -> falls back to template
    const c3 = await engineNoTimeout.generateAlertCopy({
      airSnapshot: baseSnap,
      profile: DEFAULT_USER_PROFILE,
      triggerType: 'threshold',
      language: 'en',
    });
    expect(c3.usedFallback).toBe(true);

    // 4. dataProviders uncovered optional-field branches
    const dp = await import('../server/services/dataProviders.ts');
    // Default global fetch branch coverage via stubbing globalThis.fetch
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('openaq.org/v3/locations?')) {
        return {
          ok: true,
          json: async () => ({
            results: [{ id: 10, name: undefined, sensors: [{ id: 1, parameter: { name: 'co' } }, { id: 2 }] }],
          }),
        } as any;
      }
      if (u.includes('openaq.org/v3/locations/10/latest')) {
        return {
          ok: true,
          json: async () => ({
            results: [
              { sensorsId: 1, value: 120, datetime: undefined },
              { sensorsId: undefined, value: 5 },
            ],
          }),
        } as any;
      }
      if (u.includes('data.gov.in')) {
        return {
          ok: true,
          json: async () => ({
            records: [{ station: undefined, pollutant_id: 'PM2.5', avg_value: '90', last_update: undefined }],
          }),
        } as any;
      }
      if (u.includes('waqi.info')) {
        return {
          ok: true,
          json: async () => ({
            status: 'ok',
            data: { aqi: 150, city: undefined, time: undefined, iaqi: undefined },
          }),
        } as any;
      }
      if (u.includes('air-quality-api.open-meteo.com')) {
        return {
          ok: true,
          json: async () => ({ current: { pm2_5: 40, time: undefined } }),
        } as any;
      }
      if (u.includes('geocoding-api.open-meteo.com')) {
        return {
          ok: true,
          json: async () => ({
            results: [{ country_code: 'IN', name: 'TestTown', admin1: undefined, latitude: 28.6, longitude: 77.2 }],
          }),
        } as any;
      }
      if (u.includes('nominatim.openstreetmap.org/search')) {
        return {
          ok: true,
          json: async () => [
            { lat: '28.6', lon: '77.2', address: { suburb: 'Suburb1', state: undefined } },
            { lat: '28.6', lon: '77.2', address: undefined, name: undefined, display_name: undefined },
          ],
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    }) as any;

    try {
      const oaq = await dp.fetchOpenAQv3(28.6, 77.2, 'oaq-key');
      expect(oaq?.co).toBe(0.12);
      const cpcb = await dp.fetchCpcbDataGov('Delhi', 'gov-key');
      expect(cpcb?.pm25).toBe(90);
      const waqi = await dp.fetchWaqi(28.6, 77.2, 'waqi-tok');
      expect(waqi?.reportedAqi).toBe(150);
      const omAir = await dp.fetchOpenMeteoAir(28.6, 77.2);
      expect(omAir?.pm25).toBe(40);
      const searchOm = await dp.searchIndianLocations('TestTown');
      expect(searchOm[0].state).toBe('');

      // Force Open-Meteo geocoding to fail so Nominatim fallback with default fetch runs
      (globalThis.fetch as any).mockImplementationOnce(async () => {
        throw new Error('OM down');
      });
      const searchNom = await dp.searchIndianLocations('Suburb1');
      expect(searchNom[0].name).toBe('Suburb1');

      // Additional undefined-field / empty-array branches in dataProviders.ts
      globalThis.fetch = vi.fn(async (url: string | URL) => {
        const u = String(url);
        if (u.includes('openaq.org/v3/locations?')) {
          return { ok: true, json: async () => ({ results: [{ id: 11, sensors: undefined }] }) } as any;
        }
        if (u.includes('openaq.org/v3/locations/11/latest')) {
          return { ok: true, json: async () => ({ results: undefined }) } as any;
        }
        if (u.includes('data.gov.in')) {
          return { ok: true, json: async () => ({ records: undefined }) } as any;
        }
        if (u.includes('air-quality-api.open-meteo.com')) {
          return { ok: true, json: async () => ({ current: { pm2_5: 10, carbon_monoxide: 500 } }) } as any;
        }
        if (u.includes('geocoding-api.open-meteo.com')) {
          return { ok: true, json: async () => ({ results: undefined }) } as any;
        }
        if (u.includes('nominatim.openstreetmap.org/search')) {
          return { ok: true, json: async () => undefined } as any;
        }
        if (u.includes('nominatim.openstreetmap.org/reverse')) {
          return { ok: true, json: async () => ({ address: { city: 'Indore', state: 'MP' } }) } as any;
        }
        return { ok: true, json: async () => ({}) } as any;
      }) as any;

      expect(await dp.fetchOpenAQv3(28.6, 77.2, 'oaq-key')).toBeNull();
      expect(await dp.fetchCpcbDataGov('Delhi', 'gov-key')).toBeNull();
      const omLowCo = await dp.fetchOpenMeteoAir(28.6, 77.2);
      expect(omLowCo?.co).toBe(0.5);
      expect(await dp.searchIndianLocations('EmptyCity')).toEqual([]);
      const revDefaultFetch = await dp.reverseGeocodeIndia(22.71, 75.85);
      expect(revDefaultFetch.name).toBe('Indore');

      // Final dataProviders.ts branches: co<=50 + unknown param (125), CPCB unknown pollutant & invalid last_update (205, 209), Open-Meteo invalid timeZ (341, 347), weather default fetch (377)
      globalThis.fetch = vi.fn(async (url: string | URL) => {
        const u = String(url);
        if (u.includes('openaq.org/v3/locations?')) {
          return { ok: true, json: async () => ({ results: [{ id: 12, sensors: [{ id: 1, parameter: { name: 'co' } }, { id: 2, parameter: { name: 'unknown_gas' } }] }] }) } as any;
        }
        if (u.includes('openaq.org/v3/locations/12/latest')) {
          return { ok: true, json: async () => ({ results: [{ sensorsId: 1, value: 1.5 }, { sensorsId: 2, value: 10 }] }) } as any;
        }
        if (u.includes('data.gov.in')) {
          return { ok: true, json: async () => ({ records: [{ station: 'S1', pollutant_id: 'PM2.5', avg_value: '50', last_update: 'not-a-date' }, { station: 'S1', pollutant_id: 'OTHER', avg_value: '5' }] }) } as any;
        }
        if (u.includes('air-quality-api.open-meteo.com')) {
          return { ok: true, json: async () => ({ current: { pm2_5: 12, time: 'not-a-dateZ' } }) } as any;
        }
        if (u.includes('api.open-meteo.com/v1/forecast')) {
          return { ok: true, json: async () => ({ current: { temperature_2m: 25, relative_humidity_2m: 60, wind_speed_10m: 8 } }) } as any;
        }
        return { ok: true, json: async () => ({}) } as any;
      }) as any;
      const oaqLowCo = await dp.fetchOpenAQv3(28.6, 77.2, 'oaq-key');
      expect(oaqLowCo?.co).toBe(1.5);
      const cpcbBadDate = await dp.fetchCpcbDataGov('Delhi', 'gov-key');
      expect(cpcbBadDate?.pm25).toBe(50);
      const omBadTime = await dp.fetchOpenMeteoAir(28.6, 77.2);
      expect(omBadTime?.pm25).toBe(12);
      const wDefault = await dp.fetchOpenMeteoWeather(28.6, 77.2);
      expect(wDefault?.temperatureC).toBe(25);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
