import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  DEFAULT_USER_PREFERENCES,
  DEFAULT_USER_PROFILE,
  mergeGuestWithAccountData,
} from '../shared/schemas.ts';
import { createApp } from '../server/app.ts';
import { createAuthMiddleware, type VerifyIdTokenFn } from '../server/middleware/authMiddleware.ts';
import { InMemoryUsersRepo } from '../server/services/usersRepo.ts';

describe('Firebase Auth Middleware & Protected User Endpoints', () => {
  function buildTestApp(verifyIdTokenFn: VerifyIdTokenFn) {
    const usersRepo = new InMemoryUsersRepo();
    const app = createApp({
      usersRepo,
      verifyIdTokenFn,
      disableRateLimit: true,
    });
    return { app, usersRepo };
  }

  it('returns 401 MISSING_AUTH_TOKEN when Authorization header is absent', async () => {
    const verify = vi.fn<VerifyIdTokenFn>();
    const { app } = buildTestApp(verify);

    const res = await request(app).get('/api/user/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('MISSING_AUTH_TOKEN');
    expect(verify).not.toHaveBeenCalled();
  });

  it('returns 401 MALFORMED_AUTH_HEADER for non-Bearer or short tokens', async () => {
    const verify = vi.fn<VerifyIdTokenFn>();
    const { app } = buildTestApp(verify);

    const res1 = await request(app).get('/api/user/me').set('Authorization', 'Basic abcdefghijkl');
    expect(res1.status).toBe(401);
    expect(res1.body.error).toBe('MALFORMED_AUTH_HEADER');

    const res2 = await request(app).get('/api/user/me').set('Authorization', 'Bearer short');
    expect(res2.status).toBe(401);
    expect(res2.body.error).toBe('MALFORMED_AUTH_HEADER');
    expect(verify).not.toHaveBeenCalled();
  });

  it('returns 401 TOKEN_EXPIRED when Firebase reports auth/id-token-expired', async () => {
    const verify = vi.fn<VerifyIdTokenFn>(async () => {
      const err = new Error('Firebase ID token has expired') as Error & { code?: string };
      err.code = 'auth/id-token-expired';
      throw err;
    });
    const { app } = buildTestApp(verify);

    const res = await request(app)
      .get('/api/user/me')
      .set('Authorization', 'Bearer expired-token-1234567890');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TOKEN_EXPIRED');
  });

  it('returns 401 INVALID_AUTH_TOKEN when token verification rejects or returns empty uid', async () => {
    const verifyInvalid = vi.fn<VerifyIdTokenFn>(async () => {
      throw new Error('Signature invalid');
    });
    const { app: app1 } = buildTestApp(verifyInvalid);
    const res1 = await request(app1)
      .get('/api/user/me')
      .set('Authorization', 'Bearer invalid-token-1234567890');
    expect(res1.status).toBe(401);
    expect(res1.body.error).toBe('INVALID_AUTH_TOKEN');

    const verifyEmptyUid = vi.fn<VerifyIdTokenFn>(async () => ({ uid: '' }));
    const { app: app2 } = buildTestApp(verifyEmptyUid);
    const res2 = await request(app2)
      .get('/api/user/me')
      .set('Authorization', 'Bearer empty-uid-token-123456');
    expect(res2.status).toBe(401);
    expect(res2.body.error).toBe('INVALID_AUTH_TOKEN');
  });

  it('binds uid strictly from verified token and ignores any client-supplied uid', async () => {
    const verify = vi.fn<VerifyIdTokenFn>(async (token) => {
      if (token === 'token-for-user-a-12345') {
        return { uid: 'uid-user-a', email: 'a@example.com', email_verified: true };
      }
      if (token === 'token-for-user-b-12345') {
        return { uid: 'uid-user-b', email: 'b@example.com', email_verified: true };
      }
      throw new Error('bad token');
    });

    const { app, usersRepo } = buildTestApp(verify);

    // User A updates profile while attempting to pass a spoofed uid in body
    const putRes = await request(app)
      .put('/api/user/profile')
      .set('Authorization', 'Bearer token-for-user-a-12345')
      .send({
        ...DEFAULT_USER_PROFILE,
        uid: 'uid-user-b',
        householdType: 'senior_citizens',
        commuteMode: 'wfh',
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.profile.householdType).toBe('senior_citizens');

    // Verify User B was NOT modified
    const userB = await usersRepo.getOrCreateUser('uid-user-b', 'b@example.com');
    expect(userB.profile.householdType).toBe(DEFAULT_USER_PROFILE.householdType);

    // User A reads /me and sees their own data
    const meRes = await request(app)
      .get('/api/user/me')
      .set('Authorization', 'Bearer token-for-user-a-12345');
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.uid).toBe('uid-user-a');
    expect(meRes.body.user.profile.householdType).toBe('senior_citizens');
  });

  it('enforces max 5 saved locations, supports export, FCM token registration, merge, and account deletion', async () => {
    const verify = vi.fn<VerifyIdTokenFn>(async () => ({
      uid: 'uid-tester-1',
      email: 'tester@example.com',
      email_verified: true,
    }));
    const { app } = buildTestApp(verify);
    const authHeader = 'Bearer valid-token-for-tester-1';

    // Rejects 6 locations
    const sixLocations = Array.from({ length: 6 }, (_, i) => ({
      id: `loc-${i}`,
      name: `City ${i}`,
      state: 'India',
      lat: 20 + i,
      lon: 77 + i,
      alertsEnabled: true,
    }));
    const tooManyRes = await request(app)
      .put('/api/user/locations')
      .set('Authorization', authHeader)
      .send({ locations: sixLocations });
    expect(tooManyRes.status).toBe(400);

    // Accepts 2 locations
    const validLocsRes = await request(app)
      .put('/api/user/locations')
      .set('Authorization', authHeader)
      .send({ locations: sixLocations.slice(0, 2) });
    expect(validLocsRes.status).toBe(200);
    expect(validLocsRes.body.savedLocations).toHaveLength(2);

    // Registers FCM token
    const fcmRes = await request(app)
      .post('/api/user/fcm-token')
      .set('Authorization', authHeader)
      .send({ token: 'fcm_registration_token_sample_123456', platform: 'web' });
    expect(fcmRes.status).toBe(200);
    expect(fcmRes.body.ok).toBe(true);

    // Merges guest profile & preferences
    const mergeRes = await request(app)
      .post('/api/user/merge')
      .set('Authorization', authHeader)
      .send({
        guestProfile: {
          ...DEFAULT_USER_PROFILE,
          householdType: 'family_with_kids',
          healthSensitivities: ['asthma'],
        },
        guestPreferences: {
          ...DEFAULT_USER_PREFERENCES,
          language: 'hi',
          tempUnit: 'F',
        },
        strategy: 'prefer_guest',
      });
    expect(mergeRes.status).toBe(200);
    expect(mergeRes.body.profile.householdType).toBe('family_with_kids');
    expect(mergeRes.body.preferences.language).toBe('hi');

    // Exports account data
    const exportRes = await request(app)
      .get('/api/user/export')
      .set('Authorization', authHeader);
    expect(exportRes.status).toBe(200);
    expect(exportRes.body.account.uid).toBe('uid-tester-1');
    expect(exportRes.body.account.savedLocations).toHaveLength(2);

    // Deletes account
    const delRes = await request(app)
      .delete('/api/user/account')
      .set('Authorization', authHeader);
    expect(delRes.status).toBe(200);
    expect(delRes.body.deleted).toBe(true);
  });

  it('middleware calls next() directly on valid token', async () => {
    const mw = createAuthMiddleware(async () => ({
      uid: 'u123',
      email: 'u@example.com',
      email_verified: true,
    }));
    const req = {
      headers: { authorization: 'Bearer valid-jwt-token-123456' },
    } as Parameters<typeof mw>[0];
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Parameters<typeof mw>[1];
    const next = vi.fn();

    await mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.authUser).toEqual({
      uid: 'u123',
      email: 'u@example.com',
      emailVerified: true,
    });
  });
});

describe('mergeGuestWithAccountData', () => {
  const guestProfile = {
    ...DEFAULT_USER_PROFILE,
    householdType: 'family_with_kids' as const,
    commuteMode: 'metro_bus' as const,
  };
  const accountProfile = {
    ...DEFAULT_USER_PROFILE,
    householdType: 'senior_citizens' as const,
    commuteMode: 'wfh' as const,
  };
  const guestPreferences = {
    ...DEFAULT_USER_PREFERENCES,
    language: 'hi' as const,
    tourCompleted: true,
    tourVersion: 1,
    seenHints: ['why_advice'],
  };
  const accountPreferences = {
    ...DEFAULT_USER_PREFERENCES,
    language: 'en' as const,
    tourCompleted: false,
    tourVersion: 0,
    seenHints: ['indoor_sensor'],
  };

  it('keeps guest profile & preferences while preserving union of hints when prefer_guest is chosen', () => {
    const merged = mergeGuestWithAccountData({
      guestProfile,
      guestPreferences,
      accountProfile,
      accountPreferences,
      strategy: 'prefer_guest',
    });

    expect(merged.profile.householdType).toBe('family_with_kids');
    expect(merged.preferences.language).toBe('hi');
    expect(merged.preferences.tourCompleted).toBe(true);
    expect(merged.preferences.tourVersion).toBe(1);
    expect(merged.preferences.seenHints).toEqual(
      expect.arrayContaining(['why_advice', 'indoor_sensor'])
    );
  });

  it('keeps saved account profile & preferences intact when prefer_account is chosen', () => {
    const merged = mergeGuestWithAccountData({
      guestProfile,
      guestPreferences,
      accountProfile,
      accountPreferences,
      strategy: 'prefer_account',
    });

    expect(merged.profile.householdType).toBe('senior_citizens');
    expect(merged.preferences.language).toBe('en');
    expect(merged.preferences.tourCompleted).toBe(false);
    expect(merged.preferences.tourVersion).toBe(0);
    expect(merged.preferences.seenHints).toEqual(['indoor_sensor']);
  });
});
