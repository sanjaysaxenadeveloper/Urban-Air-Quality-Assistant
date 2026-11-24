import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  DEFAULT_ALERT_PREFS,
  DEFAULT_ALERT_STATE,
  DEFAULT_USER_PREFERENCES,
  DEFAULT_USER_PROFILE,
} from '../shared/schemas.ts';
import { createApp } from '../server/app.ts';
import { loadConfig } from '../server/config.ts';
import { evaluateLocationAlert } from '../server/services/alertsEngine.ts';
import { FirebaseFcmDispatcher } from '../server/services/notificationService.ts';
import { InMemoryUsersRepo } from '../server/services/usersRepo.ts';

describe('Backend Edge Cases & Hardening Coverage', () => {
  it('returns 503 SCHEDULER_NOT_CONFIGURED when SCHEDULER_SECRET is empty', async () => {
    const config = loadConfig({ ...process.env, SCHEDULER_SECRET: '' });
    const app = createApp({ config, disableRateLimit: true });

    const res = await request(app).post('/internal/check-alerts');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('SCHEDULER_NOT_CONFIGURED');
  });

  it('handles PUT /preferences, PUT /alerts, and POST /test-alert with invalid token pruning', async () => {
    const usersRepo = new InMemoryUsersRepo();
    const sendPush = vi.fn(async () => ({
      sentCount: 1,
      failedCount: 1,
      invalidTokens: ['dead_token_123456'],
    }));
    const app = createApp({
      usersRepo,
      verifyIdTokenFn: async () => ({
        uid: 'uid-edge-1',
        email: 'edge@example.com',
        email_verified: true,
      }),
      notificationDispatcher: { sendPush },
      disableRateLimit: true,
    });

    const authHeader = 'Bearer valid-edge-token-12345';

    const prefRes = await request(app)
      .put('/api/user/preferences')
      .set('Authorization', authHeader)
      .send({ ...DEFAULT_USER_PREFERENCES, language: 'hi', tempUnit: 'F' });
    expect(prefRes.status).toBe(200);
    expect(prefRes.body.preferences.language).toBe('hi');

    const badPrefRes = await request(app)
      .put('/api/user/preferences')
      .set('Authorization', authHeader)
      .send({ language: 'klingon' });
    expect(badPrefRes.status).toBe(400);

    const alertRes = await request(app)
      .put('/api/user/alerts')
      .set('Authorization', authHeader)
      .send({ ...DEFAULT_ALERT_PREFS, enabled: true, thresholdAqi: 175 });
    expect(alertRes.status).toBe(200);
    expect(alertRes.body.alertPrefs.thresholdAqi).toBe(175);

    const badAlertRes = await request(app)
      .put('/api/user/alerts')
      .set('Authorization', authHeader)
      .send({ thresholdAqi: 9999 });
    expect(badAlertRes.status).toBe(400);

    await usersRepo.registerFcmToken('uid-edge-1', 'edge@example.com', {
      token: 'good_token_123456',
      platform: 'web',
      updatedAtIso: new Date().toISOString(),
    });
    await usersRepo.registerFcmToken('uid-edge-1', 'edge@example.com', {
      token: 'dead_token_123456',
      platform: 'web',
      updatedAtIso: new Date().toISOString(),
    });

    const testAlertRes = await request(app)
      .post('/api/user/test-alert')
      .set('Authorization', authHeader)
      .send({ city: 'Lucknow' });
    expect(testAlertRes.status).toBe(200);
    expect(testAlertRes.body.notification.title).toContain('Lucknow');
    expect(testAlertRes.body.pushSentCount).toBe(1);

    const stored = await usersRepo.getUser('uid-edge-1');
    expect(stored?.fcmTokens.map((t) => t.token)).toEqual(['good_token_123456']);
  });

  it('FirebaseFcmDispatcher returns zeros cleanly when given empty token list', async () => {
    const dispatcher = new FirebaseFcmDispatcher('demo-project');
    const res = await dispatcher.sendPush({ tokens: [], title: 'Hi', body: 'Test' });
    expect(res).toEqual({ sentCount: 0, failedCount: 0, invalidTokens: [] });
  });

  it('alertsEngine returns alerts_disabled and location_disabled reasons properly', () => {
    const loc = {
      id: 'patna',
      name: 'Patna',
      state: 'Bihar',
      lat: 25.5941,
      lon: 85.1376,
      alertsEnabled: false,
    };

    const disabledMaster = evaluateLocationAlert({
      uid: 'u1',
      location: { ...loc, alertsEnabled: true },
      snapshot: null,
      alertPrefs: { ...DEFAULT_ALERT_PREFS, enabled: false },
      alertState: DEFAULT_ALERT_STATE,
      profile: DEFAULT_USER_PROFILE,
    });
    expect(disabledMaster.skipReason).toBe('alerts_disabled');

    const disabledLoc = evaluateLocationAlert({
      uid: 'u1',
      location: loc,
      snapshot: null,
      alertPrefs: { ...DEFAULT_ALERT_PREFS, enabled: true },
      alertState: DEFAULT_ALERT_STATE,
      profile: DEFAULT_USER_PROFILE,
    });
    expect(disabledLoc.skipReason).toBe('location_disabled');
  });
});
