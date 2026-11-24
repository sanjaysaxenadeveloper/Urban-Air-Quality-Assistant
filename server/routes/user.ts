import crypto from 'crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import {
  AlertPrefsSchema,
  FcmTokenEntrySchema,
  SavedLocationsListSchema,
  UserPreferencesSchema,
  UserProfileSchema,
  mergeGuestWithAccountData,
  migratePreferences,
  type NotificationItem,
} from '../../shared/schemas.ts';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import type { NotificationDispatcher } from '../services/notificationService.ts';
import type { UsersRepository } from '../services/usersRepo.ts';

const MergeRequestSchema = z.object({
  guestProfile: UserProfileSchema,
  guestPreferences: z.unknown(),
  strategy: z.enum(['prefer_guest', 'prefer_account']),
});

export function createUserRouter(deps: {
  usersRepo: UsersRepository;
  authMiddleware: ReturnType<typeof import('../middleware/authMiddleware.ts').createAuthMiddleware>;
  notificationDispatcher?: NotificationDispatcher;
}): Router {
  const router = Router();
  router.use(deps.authMiddleware);

  router.get('/me', async (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const record = await deps.usersRepo.getOrCreateUser(user.uid, user.email);
    res.json({ user: record });
  });

  router.put('/profile', async (req: AuthenticatedRequest, res: Response) => {
    const parsed = UserProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'INVALID_PROFILE',
        message: 'Invalid household profile data.',
        details: parsed.error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })),
      });
      return;
    }
    const user = req.authUser!;
    const updated = await deps.usersRepo.updateProfile(user.uid, user.email, parsed.data);
    res.json({ profile: updated.profile });
  });

  router.put('/preferences', async (req: AuthenticatedRequest, res: Response) => {
    const parsed = UserPreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'INVALID_PREFERENCES',
        message: 'Invalid preferences payload.',
        details: parsed.error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })),
      });
      return;
    }
    const user = req.authUser!;
    const updated = await deps.usersRepo.updatePreferences(user.uid, user.email, parsed.data);
    res.json({ preferences: updated.preferences });
  });

  router.put('/locations', async (req: AuthenticatedRequest, res: Response) => {
    const parsed = SavedLocationsListSchema.safeParse(req.body?.locations ?? req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'INVALID_LOCATIONS',
        message: 'Provide up to 5 valid Indian locations.',
      });
      return;
    }
    const user = req.authUser!;
    const updated = await deps.usersRepo.updateSavedLocations(user.uid, user.email, parsed.data);
    res.json({ savedLocations: updated.savedLocations });
  });

  router.put('/alerts', async (req: AuthenticatedRequest, res: Response) => {
    const parsed = AlertPrefsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'INVALID_ALERT_PREFS',
        message: 'Invalid alert preferences.',
      });
      return;
    }
    const user = req.authUser!;
    const updated = await deps.usersRepo.updateAlertPrefs(user.uid, user.email, parsed.data);
    res.json({ alertPrefs: updated.alertPrefs });
  });

  router.post('/fcm-token', async (req: AuthenticatedRequest, res: Response) => {
    const parsed = FcmTokenEntrySchema.safeParse({
      token: req.body?.token,
      platform: req.body?.platform ?? 'web',
      updatedAtIso: new Date().toISOString(),
    });
    if (!parsed.success) {
      res.status(400).json({
        error: 'INVALID_FCM_TOKEN',
        message: 'Provide a valid FCM registration token.',
      });
      return;
    }
    const user = req.authUser!;
    await deps.usersRepo.registerFcmToken(user.uid, user.email, parsed.data);
    res.json({ ok: true });
  });

  router.post('/merge', async (req: AuthenticatedRequest, res: Response) => {
    const parsed = MergeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'INVALID_MERGE_PAYLOAD',
        message: 'Invalid guest merge payload.',
      });
      return;
    }
    const user = req.authUser!;
    const current = await deps.usersRepo.getOrCreateUser(user.uid, user.email);
    const merged = mergeGuestWithAccountData({
      guestProfile: parsed.data.guestProfile,
      guestPreferences: migratePreferences(parsed.data.guestPreferences),
      accountProfile: current.profile,
      accountPreferences: current.preferences,
      strategy: parsed.data.strategy,
    });
    await deps.usersRepo.updateProfile(user.uid, user.email, merged.profile);
    const finalRecord = await deps.usersRepo.updatePreferences(
      user.uid,
      user.email,
      merged.preferences
    );
    res.json({ profile: finalRecord.profile, preferences: finalRecord.preferences });
  });

  router.get('/export', async (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const record = await deps.usersRepo.getOrCreateUser(user.uid, user.email);
    res.json({
      exportedAt: new Date().toISOString(),
      account: {
        uid: record.uid,
        email: record.email,
        displayName: record.displayName,
        createdAtIso: record.createdAtIso,
        profile: record.profile,
        preferences: record.preferences,
        savedLocations: record.savedLocations,
        alertPrefs: record.alertPrefs,
        notificationHistory: record.notificationHistory,
      },
    });
  });

  router.post('/test-alert', async (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const record = await deps.usersRepo.getOrCreateUser(user.uid, user.email);
    const nowIso = new Date().toISOString();
    const cityLabel =
      typeof req.body?.city === 'string' && req.body.city.trim().length > 0
        ? req.body.city.trim().slice(0, 60)
        : record.savedLocations[0]?.name || 'your saved city';

    const item: NotificationItem = {
      id: crypto.randomUUID(),
      title: `Test Air Alert · ${cityLabel}`,
      body: `Alerts are configured properly for ${cityLabel}. Real alerts only trigger from verified live air-quality readings.`,
      reason: 'User-triggered test notification',
      severity: 'info',
      sourceName: 'Urban Air Quality Assistant',
      dataTimestampIso: nowIso,
      createdAtIso: nowIso,
      read: false,
    };

    await deps.usersRepo.appendNotification(user.uid, item);

    let pushSentCount = 0;
    const tokens = record.fcmTokens.map((t) => t.token);
    if (deps.notificationDispatcher && tokens.length > 0) {
      const pushRes = await deps.notificationDispatcher.sendPush({
        tokens,
        title: item.title,
        body: item.body,
        data: { type: 'test_alert' },
      });
      pushSentCount = pushRes.sentCount;
      if (pushRes.invalidTokens.length > 0) {
        await deps.usersRepo.removeFcmTokens(user.uid, pushRes.invalidTokens);
      }
    }

    res.json({ notification: item, pushSentCount });
  });

  router.delete('/account', async (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    await deps.usersRepo.deleteUser(user.uid);
    res.json({ deleted: true });
  });

  return router;
}
