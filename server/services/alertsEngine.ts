import type { CpcbCategoryId } from '../../shared/constants.ts';
import type {
  AirQualitySnapshot,
  AlertPrefs,
  AlertState,
  NotificationItem,
  SavedLocation,
  UserProfile,
} from '../../shared/schemas.ts';

export type AlertTriggerType = 'threshold' | 'category_change' | 'recovery' | 'morning_briefing';

export type AlertSkipReason =
  | 'alerts_disabled'
  | 'location_disabled'
  | 'data_unavailable'
  | 'stale_data'
  | 'quiet_hours'
  | 'daily_cap_reached'
  | 'cooldown_active'
  | 'no_trigger';

export interface AlertEvaluationResult {
  shouldSend: boolean;
  triggerType?: AlertTriggerType;
  skipReason?: AlertSkipReason;
  effectiveThreshold: number;
  idempotencyKey?: string;
  nextState: AlertState;
}

export const COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 hours
export const STALE_MAX_AGE_MINS = 180; // 3 hours
export const SENSITIVE_MAX_THRESHOLD = 100;

const CATEGORY_RANK: Record<CpcbCategoryId, number> = {
  good: 0,
  satisfactory: 1,
  moderate: 2,
  poor: 3,
  very_poor: 4,
  severe: 5,
};

/**
 * Computes India Standard Time (UTC+05:30) date string and minutes since midnight.
 */
export function getIstDateParts(now: Date): { dateKey: string; minutesOfDay: number; hourBucket: string } {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffsetMs);
  const year = ist.getUTCFullYear();
  const month = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const day = String(ist.getUTCDate()).padStart(2, '0');
  const hours = ist.getUTCHours();
  const minutes = ist.getUTCMinutes();
  const dateKey = `${year}-${month}-${day}`;
  const hourBucket = `${dateKey}T${String(hours).padStart(2, '0')}`;
  return {
    dateKey,
    minutesOfDay: hours * 60 + minutes,
    hourBucket,
  };
}

export function parseHHmm(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number.parseInt(hStr ?? '0', 10);
  const m = Number.parseInt(mStr ?? '0', 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.max(0, Math.min(23, h)) * 60 + Math.max(0, Math.min(59, m));
}

export function isWithinQuietHours(
  nowMinutes: number,
  quietStartHHmm: string,
  quietEndHHmm: string
): boolean {
  const start = parseHHmm(quietStartHHmm);
  const end = parseHHmm(quietEndHHmm);
  if (start === end) return false;
  if (start < end) {
    // Same-day window, e.g. 13:00 -> 15:00
    return nowMinutes >= start && nowMinutes < end;
  }
  // Overnight wraparound window, e.g. 22:00 -> 06:30
  return nowMinutes >= start || nowMinutes < end;
}

export function isSensitiveHousehold(alertPrefs: AlertPrefs, profile: UserProfile): boolean {
  if (alertPrefs.sensitiveMode) return true;
  if (
    profile.householdType === 'family_with_kids' ||
    profile.householdType === 'senior_citizens'
  ) {
    return true;
  }
  return profile.healthSensitivities.some((s) =>
    ['asthma', 'elderly', 'pregnancy', 'heart_lung'].includes(s)
  );
}

export function getEffectiveThreshold(alertPrefs: AlertPrefs, profile: UserProfile): number {
  if (isSensitiveHousehold(alertPrefs, profile)) {
    return Math.min(alertPrefs.thresholdAqi, SENSITIVE_MAX_THRESHOLD);
  }
  return alertPrefs.thresholdAqi;
}

export function mapAlertSeverity(
  aqi: number,
  triggerType: AlertTriggerType
): NotificationItem['severity'] {
  if (triggerType === 'recovery') return 'info';
  if (aqi >= 401) return 'severe';
  if (aqi >= 201) return 'high';
  if (aqi >= 101) return 'moderate';
  return 'info';
}

export function evaluateLocationAlert(params: {
  uid: string;
  location: SavedLocation;
  snapshot: AirQualitySnapshot | null;
  alertPrefs: AlertPrefs;
  alertState: AlertState;
  profile: UserProfile;
  now?: Date;
}): AlertEvaluationResult {
  const now = params.now ?? new Date();
  const { alertPrefs, profile, location, snapshot } = params;
  const effectiveThreshold = getEffectiveThreshold(alertPrefs, profile);

  const normalizedState: AlertState = {
    lastNotifiedByLoc: { ...params.alertState.lastNotifiedByLoc },
    dailyCountDate: params.alertState.dailyCountDate,
    dailyCountSent: params.alertState.dailyCountSent,
    lastBriefingDate: params.alertState.lastBriefingDate,
  };

  if (!alertPrefs.enabled) {
    return { shouldSend: false, skipReason: 'alerts_disabled', effectiveThreshold, nextState: normalizedState };
  }

  if (!location.alertsEnabled) {
    return { shouldSend: false, skipReason: 'location_disabled', effectiveThreshold, nextState: normalizedState };
  }

  if (!snapshot) {
    return { shouldSend: false, skipReason: 'data_unavailable', effectiveThreshold, nextState: normalizedState };
  }

  // Never send false alerts on stale data
  const snapshotAgeMins = Math.max(
    0,
    Math.round((now.getTime() - new Date(snapshot.updatedAtIso).getTime()) / 60_000)
  );
  if (snapshot.freshness === 'stale' || snapshotAgeMins > STALE_MAX_AGE_MINS) {
    return { shouldSend: false, skipReason: 'stale_data', effectiveThreshold, nextState: normalizedState };
  }

  const { dateKey, minutesOfDay, hourBucket } = getIstDateParts(now);

  // Reset daily counter on a new IST calendar day
  if (normalizedState.dailyCountDate !== dateKey) {
    normalizedState.dailyCountDate = dateKey;
    normalizedState.dailyCountSent = 0;
  }

  if (isWithinQuietHours(minutesOfDay, alertPrefs.quietHoursStart, alertPrefs.quietHoursEnd)) {
    return { shouldSend: false, skipReason: 'quiet_hours', effectiveThreshold, nextState: normalizedState };
  }

  if (normalizedState.dailyCountSent >= alertPrefs.dailyCap) {
    return { shouldSend: false, skipReason: 'daily_cap_reached', effectiveThreshold, nextState: normalizedState };
  }

  const prev = normalizedState.lastNotifiedByLoc[location.id];
  const elapsedMs = prev ? now.getTime() - new Date(prev.sentAtIso).getTime() : Number.POSITIVE_INFINITY;
  const currRank = CATEGORY_RANK[snapshot.cpcbCategory];
  const prevRank = prev ? CATEGORY_RANK[prev.category] : -1;

  let triggerType: AlertTriggerType | undefined;

  // 1. Morning briefing within +/- 15 min window of configured IST time, once per day
  if (alertPrefs.morningBriefingEnabled && normalizedState.lastBriefingDate !== dateKey) {
    const targetMins = parseHHmm(alertPrefs.morningBriefingTime);
    if (Math.abs(minutesOfDay - targetMins) <= 15) {
      triggerType = 'morning_briefing';
    }
  }

  // 2. Category worsening or recovery
  if (!triggerType && alertPrefs.categoryChangeAlerts && prev && prev.category !== snapshot.cpcbCategory) {
    if (currRank > prevRank && snapshot.aqi >= effectiveThreshold) {
      // Worsened into a higher category (bypass cooldown if jumping to severe or >= 60m elapsed)
      if (snapshot.cpcbCategory === 'severe' || elapsedMs >= 60 * 60 * 1000) {
        triggerType = 'category_change';
      }
    } else if (prevRank >= CATEGORY_RANK.poor && currRank <= CATEGORY_RANK.moderate) {
      // Recovery from Poor/Very Poor/Severe down to Moderate/Satisfactory/Good
      triggerType = 'recovery';
    }
  }

  // 3. Threshold breach (respecting 3-hour cooldown for same location & non-escalating category)
  if (!triggerType && snapshot.aqi >= effectiveThreshold) {
    if (elapsedMs < COOLDOWN_MS && prev && currRank <= prevRank) {
      return {
        shouldSend: false,
        skipReason: 'cooldown_active',
        effectiveThreshold,
        nextState: normalizedState,
      };
    }
    triggerType = 'threshold';
  }

  if (!triggerType) {
    return { shouldSend: false, skipReason: 'no_trigger', effectiveThreshold, nextState: normalizedState };
  }

  // Enforce cooldown for non-escalating, non-briefing, non-recovery alerts
  if (triggerType === 'threshold' && elapsedMs < COOLDOWN_MS) {
    return {
      shouldSend: false,
      skipReason: 'cooldown_active',
      effectiveThreshold,
      nextState: normalizedState,
    };
  }

  const nextState: AlertState = {
    lastNotifiedByLoc: {
      ...normalizedState.lastNotifiedByLoc,
      [location.id]: {
        aqi: snapshot.aqi,
        category: snapshot.cpcbCategory,
        sentAtIso: now.toISOString(),
        type: triggerType,
      },
    },
    dailyCountDate: dateKey,
    dailyCountSent: normalizedState.dailyCountSent + 1,
    lastBriefingDate:
      triggerType === 'morning_briefing' ? dateKey : normalizedState.lastBriefingDate,
  };

  const idempotencyKey = `${params.uid}:${location.id}:${triggerType}:${snapshot.cpcbCategory}:${hourBucket}`;

  return {
    shouldSend: true,
    triggerType,
    effectiveThreshold,
    idempotencyKey,
    nextState,
  };
}
