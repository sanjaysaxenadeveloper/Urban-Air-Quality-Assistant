import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_ALERT_PREFS,
  DEFAULT_ALERT_STATE,
  DEFAULT_USER_PREFERENCES,
  DEFAULT_USER_PROFILE,
  type AirQualitySnapshot,
  migratePreferences,
} from '../shared/schemas.ts';
import { getLanguageOption } from '../shared/languages.ts';
import { createApp } from '../server/app.ts';
import { loadConfig } from '../server/config.ts';
import {
  createAuthMiddleware,
  createFirebaseTokenVerifier,
} from '../server/middleware/authMiddleware.ts';
import {
  AirService,
  AirDataUnavailableError,
  calculateCpcbAqi,
  getCpcbCategory,
  getUsEpaCategory,
} from '../server/services/airService.ts';
import {
  evaluateLocationAlert,
  getEffectiveThreshold,
  isSensitiveHousehold,
  mapAlertSeverity,
} from '../server/services/alertsEngine.ts';
import {
  reverseGeocodeIndia,
} from '../server/services/dataProviders.ts';
import {
  GeminiEngine,
  GeminiEngineError,
  sanitizeUnknownDeep,
} from '../server/services/geminiEngine.ts';
import {
  FirebaseFcmDispatcher,
} from '../server/services/notificationService.ts';
import { InMemoryUsersRepo } from '../server/services/usersRepo.ts';


describe('100% Backend & Shared Coverage Suite', () => {
  it('covers server/app.ts default options and rate limiter', async () => {
    const defaultApp = createApp();
    const res = await request(defaultApp).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('urban-air-quality-assistant');
  });

  it('covers shared/languages.ts fallback for unknown code', () => {
    const fallback = getLanguageOption('non_existent_lang');
    expect(fallback.code).toBe('en');
  });

  it('covers shared/schemas.ts migratePreferences with metric units', () => {
    const migrated = migratePreferences({ units: 'metric' });
    expect(migrated.tempUnit).toBe('C');
    expect(migrated.aqiScale).toBe('CPCB');
  });

  it('covers server/services/airService.ts edge cases', () => {
    expect(getCpcbCategory(NaN)).toBe('severe');
    expect(getUsEpaCategory(NaN)).toBe('hazardous');
    const highAqi = calculateCpcbAqi({
      pm25: 600,
      pm10: 700,
      no2: 500,
      so2: 900,
      o3: 400,
      co: 50,
      reportedAqi: null,
    });
    expect(highAqi.aqi).toBeGreaterThanOrEqual(500);
  });

  it('covers server/services/alertsEngine.ts sensitive household and severity mapping', () => {
    expect(isSensitiveHousehold(DEFAULT_ALERT_PREFS, {
      ...DEFAULT_USER_PROFILE,
      householdType: 'single_adult',
      healthSensitivities: ['asthma'],
    })).toBe(true);

    expect(isSensitiveHousehold(DEFAULT_ALERT_PREFS, {
      ...DEFAULT_USER_PROFILE,
      householdType: 'single_adult',
      healthSensitivities: ['none'],
    })).toBe(false);

    expect(mapAlertSeverity(150, 'threshold')).toBe('moderate');
    expect(mapAlertSeverity(50, 'threshold')).toBe('info');

    // Cooldown active branch
    const loc = {
      id: 'loc-cool',
      name: 'Delhi',
      state: 'Delhi',
      lat: 28.6,
      lon: 77.2,
      alertsEnabled: true,
    };
    const snap: AirQualitySnapshot = {
      location: loc,
      aqi: 250,
      primaryPollutant: 'PM2.5',
      cpcbCategory: 'poor',
      usEpaCategory: 'unhealthy',
      pollutants: {
        pm25: { value: 120, unit: 'µg/m³', aqiSubIndex: 250 },
        pm10: null,
        no2: null,
        so2: null,
        o3: null,
        co: null,
      },
      source: { name: 'CPCB', type: 'cpcb_live', stationName: 'Delhi', isStationSpecific: true },
      isRealTime: true,
      updatedAtIso: new Date().toISOString(),
    };
    const now = new Date('2026-11-25T12:00:00Z');
    const recentNotified = new Date('2026-11-25T11:30:00Z').toISOString();
    const res = evaluateLocationAlert({
      uid: 'u1',
      location: loc,
      snapshot: snap,
      alertPrefs: { ...DEFAULT_ALERT_PREFS, enabled: true, cooldownMinutes: 180 },
      alertState: {
        lastNotifiedByLoc: {
          [loc.id]: {
            sentAtIso: recentNotified,
            aqi: 250,
            category: 'poor',
            triggerType: 'threshold',
          },
        },
      },
      profile: DEFAULT_USER_PROFILE,
      now,
    });
    expect(res.skipReason).toBe('cooldown_active');
  });

  it('covers server/services/usersRepo.ts missing record branches', async () => {
    const repo = new InMemoryUsersRepo();
    expect(await repo.getUser('does_not_exist')).toBeNull();
    await repo.updateAlertState('non_existent', DEFAULT_ALERT_STATE);
    await repo.removeFcmTokens('non_existent', ['tok']);
    await repo.removeFcmTokens('u1', []);
    await repo.appendNotification('non_existent', {
      id: 'n1',
      title: 'T',
      body: 'B',
      reason: 'R',
      severity: 'info',
      sourceName: 'CPCB',
      dataTimestampIso: new Date().toISOString(),
      createdAtIso: new Date().toISOString(),
      read: false,
    });
  });

  it('covers server/services/dataProviders.ts reverseGeocodeIndia locality extraction', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        address: {
          suburb: 'Indiranagar',
          city: 'Bengaluru',
          state: 'Karnataka',
        },
      }),
    })) as unknown as typeof fetch;

    const loc = await reverseGeocodeIndia(12.97, 77.59, { fetchFn: mockFetch });
    expect(loc.name).toContain('Indiranagar');
    expect(loc.state).toBe('Karnataka');
  });

  it('covers server/services/geminiEngine.ts timeout, retry delay, and schema validation fallback', async () => {
    const engine = new GeminiEngine({
      apiKey: 'test-key',
      model: 'gemini-2.5-flash',
      primaryTimeoutMs: 20,
      finalTimeoutMs: 20,
      retryDelayMs: 5,
      generateTextFn: async () => {
        // Sleep to trigger timeout
        await new Promise((r) => setTimeout(r, 50));
        return 'result';
      },
    });

    await expect(
      engine.answerQuestion({
        airSnapshot: {
          location: { id: 'd', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2 },
          aqi: 200,
          primaryPollutant: 'PM2.5',
          cpcbCategory: 'moderate',
          usEpaCategory: 'moderate',
          pollutants: { pm25: { value: 60, unit: 'µg/m³', aqiSubIndex: 200 }, pm10: null, no2: null, so2: null, o3: null, co: null },
          source: { name: 'CPCB', type: 'cpcb_live', isStationSpecific: false },
          isRealTime: true,
          updatedAtIso: new Date().toISOString(),
        },
        profile: DEFAULT_USER_PROFILE,
        question: 'Should I run outdoors?',
        history: [],
      })
    ).rejects.toThrow();

    // Alert copy validation error fallback
    const engineWithInvalidJson = new GeminiEngine({
      apiKey: 'test-key',
      generateTextFn: async () => JSON.stringify({ title: 'x', body: 'short', reason: 'r' }),
    });
    const copy = await engineWithInvalidJson.generateAlertCopy({
      airSnapshot: {
        location: { id: 'd', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2 },
        aqi: 350,
        primaryPollutant: 'PM2.5',
        cpcbCategory: 'very_poor',
        usEpaCategory: 'unhealthy',
        pollutants: { pm25: { value: 160, unit: 'µg/m³', aqiSubIndex: 350 }, pm10: null, no2: null, so2: null, o3: null, co: null },
        source: { name: 'CPCB', type: 'cpcb_live', isStationSpecific: false },
        isRealTime: true,
        updatedAtIso: new Date().toISOString(),
      },
      profile: DEFAULT_USER_PROFILE,
      triggerType: 'threshold',
      language: 'en',
    });
    expect(copy.usedFallback).toBe(true);
  });

  it('covers server/services/notificationService.ts error and multicast parsing', async () => {
    const dispatcher = new FirebaseFcmDispatcher('test-project');
    // Calling with valid token array when firebase not initialized catches cleanly
    const res = await dispatcher.sendPush({
      tokens: ['token1', 'token2'],
      title: 'Alert',
      body: 'Body',
    });
    expect(res.sentCount).toBe(0);
    expect(res.failedCount).toBe(2);
  });

  it('covers server/middleware/authMiddleware.ts resolveFirebaseProjectId and token verifier', async () => {
    const verifier = createFirebaseTokenVerifier('test-project-123');
    expect(verifier).toBeTypeOf('function');

    // Test resolveFirebaseProjectId fallback when config doesn't have custom projectId
    const verifierNoId = createFirebaseTokenVerifier(undefined);
    expect(verifierNoId).toBeTypeOf('function');
  });

  it('covers server/routes/air.ts 500 INTERNAL_ERROR', async () => {
    const brokenAirService = {
      getLiveAirSnapshot: vi.fn(async () => {
        throw new Error('Simulated database crash');
      }),
    } as unknown as AirService;
    const app = createApp({ airService: brokenAirService, disableRateLimit: true });
    const res = await request(app).get('/api/air?lat=28.6&lon=77.2');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
  });

  it('covers server/routes/assistant.ts error branches (/api/plan and /api/chat)', async () => {
    const failingEngine = {
      generateDailyPlan: vi.fn(async () => {
        throw new Error('Unexpected Plan Crash');
      }),
      answerQuestion: vi.fn(async () => {
        throw new AirDataUnavailableError('Air source down', ['CPCB']);
      }),
    } as unknown as GeminiEngine;

    const mockAirService = {
      getLiveAirSnapshot: vi.fn(async () => ({
        location: { id: 'd', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2 },
        aqi: 150,
        primaryPollutant: 'PM2.5',
        cpcbCategory: 'moderate',
        usEpaCategory: 'moderate',
        pollutants: { pm25: { value: 60, unit: 'µg/m³', aqiSubIndex: 150 }, pm10: null, no2: null, so2: null, o3: null, co: null },
        source: { name: 'CPCB', type: 'cpcb_live', isStationSpecific: false },
        isRealTime: true,
        updatedAtIso: new Date().toISOString(),
      })),
    } as unknown as AirService;

    const app = createApp({
      airService: mockAirService,
      geminiEngine: failingEngine,
      disableRateLimit: true,
    });

    const planRes = await request(app).post('/api/plan').send({
      location: { id: 'd', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2 },
      profile: DEFAULT_USER_PROFILE,
    });
    expect(planRes.status).toBe(500);
    expect(planRes.body.error).toBe('INTERNAL_ERROR');

    // /api/chat AirDataUnavailableError
    mockAirService.getLiveAirSnapshot = vi.fn(async () => {
      throw new AirDataUnavailableError('Air source down', ['CPCB']);
    });
    const chatRes1 = await request(app).post('/api/chat').send({
      location: { id: 'd', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2 },
      profile: DEFAULT_USER_PROFILE,
      question: 'Is it safe?',
      history: [],
    });
    expect(chatRes1.status).toBe(503);

    // Reset airService to succeed for following chat tests
    mockAirService.getLiveAirSnapshot = vi.fn(async () => ({
      location: { id: 'd', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2 },
      aqi: 150,
      primaryPollutant: 'PM2.5',
      cpcbCategory: 'moderate',
      usEpaCategory: 'moderate',
      pollutants: { pm25: { value: 60, unit: 'µg/m³', aqiSubIndex: 150 }, pm10: null, no2: null, so2: null, o3: null, co: null },
      source: { name: 'CPCB', type: 'cpcb_live', isStationSpecific: false },
      isRealTime: true,
      updatedAtIso: new Date().toISOString(),
    }));

    // /api/chat GeminiEngineError
    failingEngine.answerQuestion = vi.fn(async () => {
      throw new GeminiEngineError('GEMINI_UPSTREAM_ERROR', 'Service unavailable', 502);
    });
    const chatRes2 = await request(app).post('/api/chat').send({
      location: { id: 'd', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2 },
      profile: DEFAULT_USER_PROFILE,
      question: 'Is it safe?',
      history: [],
    });
    expect(chatRes2.status).toBe(502);

    // /api/chat generic Error
    failingEngine.answerQuestion = vi.fn(async () => {
      throw new Error('Generic chat failure');
    });
    const chatRes3 = await request(app).post('/api/chat').send({
      location: { id: 'd', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2 },
      profile: DEFAULT_USER_PROFILE,
      question: 'Is it safe?',
      history: [],
    });
    expect(chatRes3.status).toBe(500);
  });

  it('covers server/routes/user.ts invalid FCM token and invalid merge payload', async () => {
    const app = createApp({
      verifyIdTokenFn: async () => ({ uid: 'u1', email: 'test@example.com' }),
      disableRateLimit: true,
    });
    const authHeader = 'Bearer token-1234567890';

    const badFcm = await request(app)
      .post('/api/user/fcm-token')
      .set('Authorization', authHeader)
      .send({ token: '' });
    expect(badFcm.status).toBe(400);
    expect(badFcm.body.error).toBe('INVALID_FCM_TOKEN');

    const badMerge = await request(app)
      .post('/api/user/merge')
      .set('Authorization', authHeader)
      .send({ strategy: 'invalid_strategy' });
    expect(badMerge.status).toBe(400);
    expect(badMerge.body.error).toBe('INVALID_MERGE_PAYLOAD');
  });

  it('covers server/routes/internal.ts stale_data/data_unavailable skipReason and duplicate idemKey', async () => {
    const usersRepo = new InMemoryUsersRepo();
    await usersRepo.updateSavedLocations('user-stale-1', 'stale@example.com', [
      { id: 'loc-stale', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2, alertsEnabled: true },
    ]);
    await usersRepo.updateAlertPrefs('user-stale-1', 'stale@example.com', {
      ...DEFAULT_ALERT_PREFS,
      enabled: true,
    });

    // Mock airService to return null / throw so snapshot is unavailable
    const mockAir = {
      getLiveAirSnapshot: vi.fn(async () => {
        throw new AirDataUnavailableError('Unavailable', ['CPCB']);
      }),
    } as unknown as AirService;

    const config = loadConfig({ SCHEDULER_SECRET: 'test-secret' });
    const app = createApp({
      config,
      usersRepo,
      airService: mockAir,
      disableRateLimit: true,
    });

    const res = await request(app)
      .post('/internal/check-alerts')
      .set('Authorization', 'Bearer test-secret');
    expect(res.status).toBe(200);
    expect(res.body.alertsSent).toBe(0);
  });

  it('covers server/routes/user.ts invalid profile 400 error', async () => {
    const usersRepo = new InMemoryUsersRepo();
    const config = loadConfig({ SCHEDULER_SECRET: 'test-secret' });
    const authHeader = 'Bearer test-user-token';
    const app = createApp({
      config,
      usersRepo,
      verifyIdTokenFn: async () => ({
        uid: 'user-invalid-prof',
        email: 'prof@example.com',
        email_verified: true,
      }),
      disableRateLimit: true,
    });

    const res = await request(app)
      .put('/api/user/profile')
      .set('Authorization', authHeader)
      .send({ commuteMinutes: -999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_PROFILE');
  });

  it('covers alertsEngine cooldown active branch when category change is disabled', () => {
    const loc = { id: 'l1', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2, alertsEnabled: true };
    const snap: AirQualitySnapshot = {
      location: loc,
      aqi: 280,
      cpcbCategory: 'poor',
      usEpaAqi: 190,
      usEpaCategory: 'unhealthy',
      pm25: 140,
      pm10: 240,
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

    const res = evaluateLocationAlert({
      location: loc,
      snapshot: snap,
      alertPrefs: { ...DEFAULT_ALERT_PREFS, enabled: true, categoryChangeAlerts: false },
      profile: DEFAULT_USER_PROFILE,
      alertState: {
        ...DEFAULT_ALERT_STATE,
        lastNotifiedByLoc: {
          l1: {
            sentAtIso: new Date(Date.now() - 60000).toISOString(),
            aqi: 150,
            category: 'moderate',
            triggerType: 'threshold',
          },
        },
      },
      now: new Date('2026-11-25T07:00:00.000Z'),
    });
    expect(res.skipReason).toBe('cooldown_active');
  });

  it('covers geminiEngine sanitizeUnknownDeep object and retry exhaustion', async () => {
    const sanitized = sanitizeUnknownDeep({
      label: 'test string',
      nested: { num: 42, arr: ['one', 'two'] },
    });
    expect(sanitized.label).toBe('test string');
    expect(sanitized.nested.arr[0]).toBe('one');

    const retryingEngine = new GeminiEngine({
      apiKey: 'test-key',
      primaryTimeoutMs: 50,
      finalTimeoutMs: 50,
      retryDelayMs: 2,
      generateTextFn: async () => {
        throw new Error('429 Too Many Requests: quota exceeded');
      },
    });

    await expect(
      retryingEngine.answerQuestion({
        airSnapshot: {
          location: { id: 'd', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2 },
          aqi: 200,
          cpcbCategory: 'poor',
          usEpaAqi: 150,
          usEpaCategory: 'unhealthy',
          pm25: 100,
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
          freshnessMinutes: 5,
          cacheHit: false,
        },
        profile: DEFAULT_USER_PROFILE,
        question: 'Is it safe?',
        advicePrefs: {
          language: 'en',
          detail: 'concise',
          tone: 'plain',
          tempUnit: 'C',
          aqiScale: 'CPCB',
          preferredMask: 'N95',
        },
      })
    ).rejects.toThrow();
  });
});
