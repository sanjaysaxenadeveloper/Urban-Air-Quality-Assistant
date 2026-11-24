import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  DEFAULT_ALERT_PREFS,
  DEFAULT_ALERT_STATE,
  DEFAULT_USER_PROFILE,
  type AirQualitySnapshot,
  type SavedLocation,
} from '../shared/schemas.ts';
import { createApp } from '../server/app.ts';
import { loadConfig } from '../server/config.ts';
import type { AirService } from '../server/services/airService.ts';
import {
  evaluateLocationAlert,
  getEffectiveThreshold,
  getIstDateParts,
  isWithinQuietHours,
} from '../server/services/alertsEngine.ts';
import type { GeminiEngine } from '../server/services/geminiEngine.ts';
import type { NotificationDispatcher } from '../server/services/notificationService.ts';
import { InMemoryUsersRepo } from '../server/services/usersRepo.ts';

const DELHI_LOC: SavedLocation = {
  id: 'delhi',
  name: 'Delhi',
  state: 'Delhi',
  lat: 28.6139,
  lon: 77.209,
  alertsEnabled: true,
};

function makeSnapshot(overrides: Partial<AirQualitySnapshot> = {}): AirQualitySnapshot {
  return {
    location: DELHI_LOC,
    aqi: 285,
    cpcbCategory: 'poor',
    usEpaAqi: 210,
    usEpaCategory: 'very_unhealthy',
    pm25: 138,
    pm10: 240,
    no2: 32,
    so2: 12,
    o3: 24,
    co: 0.9,
    dominantPollutant: 'PM2.5',
    weather: {
      temperatureC: 19,
      humidityPct: 58,
      windSpeedKmh: 6,
      windDirectionDeg: 290,
      weatherCode: 45,
      sourceName: 'Open-Meteo Weather',
    },
    source: {
      id: 'openaq',
      name: 'OpenAQ v3',
      isModelled: false,
      stationName: 'ITO Delhi',
    },
    updatedAtIso: '2026-11-20T05:30:00.000Z', // 11:00 IST
    fetchedAtIso: '2026-11-20T05:35:00.000Z',
    freshness: 'live',
    freshnessMinutes: 5,
    cacheHit: false,
    ...overrides,
  };
}

describe('Alerts Engine pure rules', () => {
  it('evaluates IST date parts and overnight quiet hours accurately', () => {
    // 2026-11-20T17:00:00Z = 22:30 IST (within 22:00-06:30 quiet hours)
    const nightUtc = new Date('2026-11-20T17:00:00.000Z');
    const nightIst = getIstDateParts(nightUtc);
    expect(nightIst.dateKey).toBe('2026-11-20');
    expect(nightIst.minutesOfDay).toBe(22 * 60 + 30);
    expect(isWithinQuietHours(nightIst.minutesOfDay, '22:00', '06:30')).toBe(true);

    // 2026-11-20T05:30:00Z = 11:00 IST (outside quiet hours)
    const dayUtc = new Date('2026-11-20T05:30:00.000Z');
    const dayIst = getIstDateParts(dayUtc);
    expect(isWithinQuietHours(dayIst.minutesOfDay, '22:00', '06:30')).toBe(false);

    // Same-day quiet window 13:00-15:00
    expect(isWithinQuietHours(14 * 60, '13:00', '15:00')).toBe(true);
    expect(isWithinQuietHours(16 * 60, '13:00', '15:00')).toBe(false);
  });

  it('applies stricter threshold (100) for sensitive profiles or sensitiveMode', () => {
    const standardThreshold = getEffectiveThreshold(
      { ...DEFAULT_ALERT_PREFS, enabled: true, thresholdAqi: 200, sensitiveMode: false },
      { ...DEFAULT_USER_PROFILE, householdType: 'working_professional', healthSensitivities: [] }
    );
    expect(standardThreshold).toBe(200);

    const asthmaThreshold = getEffectiveThreshold(
      { ...DEFAULT_ALERT_PREFS, enabled: true, thresholdAqi: 200, sensitiveMode: false },
      { ...DEFAULT_USER_PROFILE, healthSensitivities: ['asthma'] }
    );
    expect(asthmaThreshold).toBe(100);

    const familyThreshold = getEffectiveThreshold(
      { ...DEFAULT_ALERT_PREFS, enabled: true, thresholdAqi: 250, sensitiveMode: false },
      { ...DEFAULT_USER_PROFILE, householdType: 'family_with_kids', healthSensitivities: [] }
    );
    expect(familyThreshold).toBe(100);
  });

  it('skips alert when data is stale or missing', () => {
    const now = new Date('2026-11-20T05:45:00.000Z'); // 11:15 IST
    const prefs = { ...DEFAULT_ALERT_PREFS, enabled: true };

    const missingRes = evaluateLocationAlert({
      uid: 'u1',
      location: DELHI_LOC,
      snapshot: null,
      alertPrefs: prefs,
      alertState: DEFAULT_ALERT_STATE,
      profile: DEFAULT_USER_PROFILE,
      now,
    });
    expect(missingRes.shouldSend).toBe(false);
    expect(missingRes.skipReason).toBe('data_unavailable');

    const staleRes = evaluateLocationAlert({
      uid: 'u1',
      location: DELHI_LOC,
      snapshot: makeSnapshot({
        freshness: 'stale',
        updatedAtIso: '2026-11-20T01:00:00.000Z',
        freshnessMinutes: 285,
      }),
      alertPrefs: prefs,
      alertState: DEFAULT_ALERT_STATE,
      profile: DEFAULT_USER_PROFILE,
      now,
    });
    expect(staleRes.shouldSend).toBe(false);
    expect(staleRes.skipReason).toBe('stale_data');
  });

  it('respects quiet hours and daily cap', () => {
    const prefs = { ...DEFAULT_ALERT_PREFS, enabled: true, dailyCap: 2 };

    // 23:00 IST -> quiet hours
    const quietRes = evaluateLocationAlert({
      uid: 'u1',
      location: DELHI_LOC,
      snapshot: makeSnapshot({ updatedAtIso: '2026-11-20T17:20:00.000Z' }),
      alertPrefs: prefs,
      alertState: DEFAULT_ALERT_STATE,
      profile: DEFAULT_USER_PROFILE,
      now: new Date('2026-11-20T17:30:00.000Z'),
    });
    expect(quietRes.shouldSend).toBe(false);
    expect(quietRes.skipReason).toBe('quiet_hours');

    // Daily cap reached on same IST date
    const capRes = evaluateLocationAlert({
      uid: 'u1',
      location: DELHI_LOC,
      snapshot: makeSnapshot(),
      alertPrefs: prefs,
      alertState: {
        ...DEFAULT_ALERT_STATE,
        dailyCountDate: '2026-11-20',
        dailyCountSent: 2,
      },
      profile: DEFAULT_USER_PROFILE,
      now: new Date('2026-11-20T05:45:00.000Z'),
    });
    expect(capRes.shouldSend).toBe(false);
    expect(capRes.skipReason).toBe('daily_cap_reached');
  });

  it('enforces 3-hour cooldown for same-severity repeats, allows category escalation to severe & recovery alerts', () => {
    const prefs = { ...DEFAULT_ALERT_PREFS, enabled: true, categoryChangeAlerts: true };
    const baseNow = new Date('2026-11-20T05:45:00.000Z'); // 11:15 IST

    // First threshold breach sends
    const first = evaluateLocationAlert({
      uid: 'u1',
      location: DELHI_LOC,
      snapshot: makeSnapshot({ aqi: 260, cpcbCategory: 'poor' }),
      alertPrefs: prefs,
      alertState: DEFAULT_ALERT_STATE,
      profile: DEFAULT_USER_PROFILE,
      now: baseNow,
    });
    expect(first.shouldSend).toBe(true);
    expect(first.triggerType).toBe('threshold');

    // 45 mins later, still Poor -> cooldown_active
    const repeat = evaluateLocationAlert({
      uid: 'u1',
      location: DELHI_LOC,
      snapshot: makeSnapshot({
        aqi: 270,
        cpcbCategory: 'poor',
        updatedAtIso: '2026-11-20T06:25:00.000Z',
      }),
      alertPrefs: prefs,
      alertState: first.nextState,
      profile: DEFAULT_USER_PROFILE,
      now: new Date('2026-11-20T06:30:00.000Z'),
    });
    expect(repeat.shouldSend).toBe(false);
    expect(repeat.skipReason).toBe('cooldown_active');

    // Escalation to Severe bypasses 3h cooldown
    const severeEscalation = evaluateLocationAlert({
      uid: 'u1',
      location: DELHI_LOC,
      snapshot: makeSnapshot({
        aqi: 430,
        cpcbCategory: 'severe',
        updatedAtIso: '2026-11-20T06:25:00.000Z',
      }),
      alertPrefs: prefs,
      alertState: first.nextState,
      profile: DEFAULT_USER_PROFILE,
      now: new Date('2026-11-20T06:30:00.000Z'),
    });
    expect(severeEscalation.shouldSend).toBe(true);
    expect(severeEscalation.triggerType).toBe('category_change');

    // Recovery from Severe down to Moderate triggers recovery alert
    const recovery = evaluateLocationAlert({
      uid: 'u1',
      location: DELHI_LOC,
      snapshot: makeSnapshot({
        aqi: 135,
        cpcbCategory: 'moderate',
        updatedAtIso: '2026-11-20T08:50:00.000Z',
      }),
      alertPrefs: prefs,
      alertState: severeEscalation.nextState,
      profile: DEFAULT_USER_PROFILE,
      now: new Date('2026-11-20T09:00:00.000Z'),
    });
    expect(recovery.shouldSend).toBe(true);
    expect(recovery.triggerType).toBe('recovery');
  });

  it('triggers daily morning briefing once within +/- 15 min window', () => {
    const prefs = {
      ...DEFAULT_ALERT_PREFS,
      enabled: true,
      morningBriefingEnabled: true,
      morningBriefingTime: '07:30',
      quietHoursStart: '22:00',
      quietHoursEnd: '06:30',
    };
    // 07:35 IST = 02:05 UTC
    const morningUtc = new Date('2026-11-20T02:05:00.000Z');
    const res1 = evaluateLocationAlert({
      uid: 'u1',
      location: DELHI_LOC,
      snapshot: makeSnapshot({
        aqi: 95,
        cpcbCategory: 'satisfactory',
        updatedAtIso: '2026-11-20T02:00:00.000Z',
      }),
      alertPrefs: prefs,
      alertState: DEFAULT_ALERT_STATE,
      profile: DEFAULT_USER_PROFILE,
      now: morningUtc,
    });
    expect(res1.shouldSend).toBe(true);
    expect(res1.triggerType).toBe('morning_briefing');

    // Second run 5 mins later on same day does NOT resend morning briefing
    const res2 = evaluateLocationAlert({
      uid: 'u1',
      location: DELHI_LOC,
      snapshot: makeSnapshot({
        aqi: 95,
        cpcbCategory: 'satisfactory',
        updatedAtIso: '2026-11-20T02:05:00.000Z',
      }),
      alertPrefs: prefs,
      alertState: res1.nextState,
      profile: DEFAULT_USER_PROFILE,
      now: new Date('2026-11-20T02:10:00.000Z'),
    });
    expect(res2.shouldSend).toBe(false);
  });
});

describe('POST /internal/check-alerts scheduler endpoint & auth', () => {
  it('rejects unauthenticated or wrong-secret requests with 401', async () => {
    const config = loadConfig({ ...process.env, SCHEDULER_SECRET: 'super-secret-123' });
    const app = createApp({ config, disableRateLimit: true });

    const missing = await request(app).post('/internal/check-alerts');
    expect(missing.status).toBe(401);
    expect(missing.body.error).toBe('UNAUTHORIZED_SCHEDULER');

    const wrong = await request(app)
      .post('/internal/check-alerts')
      .set('x-scheduler-secret', 'wrong-secret');
    expect(wrong.status).toBe(401);
  });

  it('fetches air ONCE per unique location, prunes invalid FCM tokens, and is idempotent on immediate retry', async () => {
    const usersRepo = new InMemoryUsersRepo();
    await usersRepo.updateSavedLocations('u1', 'u1@example.com', [DELHI_LOC]);
    await usersRepo.updateAlertPrefs('u1', 'u1@example.com', {
      ...DEFAULT_ALERT_PREFS,
      enabled: true,
      thresholdAqi: 200,
    });
    await usersRepo.registerFcmToken('u1', 'u1@example.com', {
      token: 'valid_token_123456',
      platform: 'web',
      updatedAtIso: '2026-11-20T05:00:00.000Z',
    });
    await usersRepo.registerFcmToken('u1', 'u1@example.com', {
      token: 'stale_token_123456',
      platform: 'web',
      updatedAtIso: '2026-11-20T05:00:00.000Z',
    });

    // Second user also tracking Delhi -> air must only be fetched ONCE!
    await usersRepo.updateSavedLocations('u2', 'u2@example.com', [DELHI_LOC]);
    await usersRepo.updateAlertPrefs('u2', 'u2@example.com', {
      ...DEFAULT_ALERT_PREFS,
      enabled: true,
      thresholdAqi: 200,
    });

    const getLiveAirSnapshot = vi.fn(async () =>
      makeSnapshot({ aqi: 315, cpcbCategory: 'very_poor' })
    );
    const generateAlertCopy = vi.fn(async () => ({
      title: 'Delhi Air Alert: AQI 315',
      body: 'Very Poor air (PM2.5 138 µg/m³). Keep windows closed and wear N95 outdoors. Source: OpenAQ v3.',
      reason: 'PM2.5 138 µg/m³ · OpenAQ v3',
      usedFallback: false,
    }));
    const sendPush = vi.fn(async () => ({
      sentCount: 1,
      failedCount: 1,
      invalidTokens: ['stale_token_123456'],
    }));

    const config = loadConfig({ ...process.env, SCHEDULER_SECRET: 'cron-secret-xyz' });
    const app = createApp({
      config,
      usersRepo,
      airService: { getLiveAirSnapshot } as unknown as AirService,
      geminiEngine: { generateAlertCopy } as unknown as GeminiEngine,
      notificationDispatcher: { sendPush } as unknown as NotificationDispatcher,
      nowFn: () => new Date('2026-11-20T05:45:00.000Z'), // 11:15 IST
      disableRateLimit: true,
    });

    const firstRun = await request(app)
      .post('/internal/check-alerts')
      .set('x-scheduler-secret', 'cron-secret-xyz');

    expect(firstRun.status).toBe(200);
    expect(firstRun.body.checkedUsers).toBe(2);
    expect(firstRun.body.uniqueLocationsFetched).toBe(1);
    expect(getLiveAirSnapshot).toHaveBeenCalledTimes(1);
    expect(firstRun.body.alertsSent).toBe(2);
    expect(firstRun.body.pushDispatched).toBe(1);
    expect(firstRun.body.prunedTokens).toBe(1);

    // Invalid token was pruned from u1
    const u1After = await usersRepo.getUser('u1');
    expect(u1After?.fcmTokens.map((t) => t.token)).toEqual(['valid_token_123456']);
    expect(u1After?.notificationHistory).toHaveLength(1);

    // Immediate duplicate scheduler trigger sends 0 alerts (cooldown + idempotency)
    const secondRun = await request(app)
      .post('/internal/check-alerts')
      .set('Authorization', 'Bearer cron-secret-xyz');
    expect(secondRun.status).toBe(200);
    expect(secondRun.body.alertsSent).toBe(0);
  });
});
