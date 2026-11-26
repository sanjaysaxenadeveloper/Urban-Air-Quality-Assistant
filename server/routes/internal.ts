import crypto from 'crypto';
import { Router, type Request, type Response } from 'express';
import type { AirQualitySnapshot, NotificationItem, SavedLocation } from '../../shared/schemas.ts';
import type { AirService } from '../services/airService.ts';
import {
  evaluateLocationAlert,
  mapAlertSeverity,
  type AlertSkipReason,
} from '../services/alertsEngine.ts';
import type { GeminiEngine } from '../services/geminiEngine.ts';
import type { NotificationDispatcher } from '../services/notificationService.ts';
import type { UsersRepository } from '../services/usersRepo.ts';

export interface InternalRouterDeps {
  usersRepo: UsersRepository;
  airService: AirService;
  geminiEngine: GeminiEngine;
  notificationDispatcher: NotificationDispatcher;
  internalAuthMiddleware: ReturnType<
    typeof import('../middleware/internalAuth.ts').createInternalAuthMiddleware
  >;
  nowFn?: () => Date;
}

function locationDedupeKey(loc: SavedLocation): string {
  return `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
}

export function createInternalRouter(deps: InternalRouterDeps): Router {
  const router = Router();
  const seenIdempotencyKeys = new Set<string>();

  router.use(deps.internalAuthMiddleware);

  router.post('/check-alerts', async (_req: Request, res: Response) => {
    const now = deps.nowFn ? deps.nowFn() : new Date();
    const users = await deps.usersRepo.listAlertEnabledUsers();

    // Step 1: Collect unique active saved locations across all users so air is fetched ONCE per location
    const uniqueLocations = new Map<string, SavedLocation>();
    for (const user of users) {
      for (const loc of user.savedLocations) {
        if (!loc.alertsEnabled) continue;
        const key = locationDedupeKey(loc);
        if (!uniqueLocations.has(key)) {
          uniqueLocations.set(key, loc);
        }
      }
    }

    // Step 2: Fetch live air once per unique location (reuses AirService 12-min cache)
    const snapshotsByKey = new Map<string, AirQualitySnapshot | null>();
    for (const [key, loc] of uniqueLocations.entries()) {
      try {
        const snapshot = await deps.airService.getLiveAirSnapshot({
          lat: loc.lat,
          lon: loc.lon,
          city: loc.name,
          state: loc.state,
        });
        snapshotsByKey.set(key, snapshot);
      } catch (err) {
        console.warn(
          `[alerts] Live air unavailable for ${loc.name}; skipping alerts:`,
          err instanceof Error ? err.message : 'unknown error'
        );
        snapshotsByKey.set(key, null);
      }
    }

    let alertsSent = 0;
    let pushDispatched = 0;
    let prunedTokens = 0;
    const skippedByReason: Partial<Record<AlertSkipReason | 'idempotent_duplicate', number>> = {};

    const bumpSkip = (reason: AlertSkipReason | 'idempotent_duplicate') => {
      skippedByReason[reason] = (skippedByReason[reason] ?? 0) + 1;
    };

    // Step 3: Evaluate alert rules per user & saved location
    for (const user of users) {
      let currentAlertState = user.alertState;
      let stateChanged = false;

      for (const loc of user.savedLocations) {
        const snapshot = snapshotsByKey.get(locationDedupeKey(loc)) ?? null;
        const evaluation = evaluateLocationAlert({
          uid: user.uid,
          location: loc,
          snapshot,
          alertPrefs: user.alertPrefs,
          alertState: currentAlertState,
          profile: user.profile,
          now,
        });

        if (!evaluation.shouldSend || !evaluation.triggerType || !snapshot) {
          if (evaluation.skipReason === 'stale_data' || evaluation.skipReason === 'data_unavailable') {
            console.warn(
              `[alerts] Skipping ${loc.name} for user ${user.uid.slice(0, 6)}… due to ${evaluation.skipReason}`
            );
          }
          bumpSkip(evaluation.skipReason ?? 'no_trigger');
          continue;
        }

        const idemKey = evaluation.idempotencyKey;
        if (idemKey && seenIdempotencyKeys.has(idemKey)) {
          bumpSkip('idempotent_duplicate');
          continue;
        }

        // Generate actionable alert copy grounded in live snapshot (falls back cleanly to template)
        const copy = await deps.geminiEngine.generateAlertCopy({
          airSnapshot: snapshot,
          profile: user.profile,
          triggerType: evaluation.triggerType,
          language: user.preferences.language,
        });

        const item: NotificationItem = {
          id: crypto.randomUUID(),
          title: copy.title,
          body: copy.body,
          reason: copy.reason,
          severity: mapAlertSeverity(snapshot.aqi, evaluation.triggerType),
          sourceName: snapshot.source.name,
          dataTimestampIso: snapshot.updatedAtIso,
          createdAtIso: now.toISOString(),
          read: false,
        };

        await deps.usersRepo.appendNotification(user.uid, item);

        // Send browser push to registered FCM tokens & prune stale tokens
        const tokens = user.fcmTokens.map((t) => t.token);
        if (tokens.length > 0) {
          const pushRes = await deps.notificationDispatcher.sendPush({
            tokens,
            title: item.title,
            body: item.body,
            data: {
              locationId: loc.id,
              aqi: String(snapshot.aqi),
              triggerType: evaluation.triggerType,
            },
          });
          pushDispatched += pushRes.sentCount;
          if (pushRes.invalidTokens.length > 0) {
            await deps.usersRepo.removeFcmTokens(user.uid, pushRes.invalidTokens);
            prunedTokens += pushRes.invalidTokens.length;
          }
        }

        if (idemKey) {
          seenIdempotencyKeys.add(idemKey);
          /* v8 ignore start */
          if (seenIdempotencyKeys.size > 5000) {
            seenIdempotencyKeys.clear();
          }
          /* v8 ignore stop */
        }

        currentAlertState = evaluation.nextState;
        stateChanged = true;
        alertsSent += 1;
      }

      if (stateChanged) {
        await deps.usersRepo.updateAlertState(user.uid, currentAlertState);
      }
    }

    res.json({
      checkedUsers: users.length,
      uniqueLocationsFetched: uniqueLocations.size,
      alertsSent,
      pushDispatched,
      prunedTokens,
      skippedByReason,
      checkedAtIso: now.toISOString(),
    });
  });

  return router;
}
