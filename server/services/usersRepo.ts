import {
  DEFAULT_ALERT_PREFS,
  DEFAULT_ALERT_STATE,
  DEFAULT_USER_PREFERENCES,
  DEFAULT_USER_PROFILE,
  type AlertPrefs,
  type AlertState,
  type FcmTokenEntry,
  type NotificationItem,
  type SavedLocation,
  type UserPreferences,
  type UserProfile,
} from '../../shared/schemas.ts';

export interface StoredUserRecord {
  uid: string;
  email: string;
  displayName: string;
  profile: UserProfile;
  preferences: UserPreferences;
  savedLocations: SavedLocation[];
  alertPrefs: AlertPrefs;
  alertState: AlertState;
  fcmTokens: FcmTokenEntry[];
  notificationHistory: NotificationItem[];
  createdAtIso: string;
  updatedAtIso: string;
}

export interface UsersRepository {
  getOrCreateUser(uid: string, email: string, displayName?: string): Promise<StoredUserRecord>;
  getUser(uid: string): Promise<StoredUserRecord | null>;
  updateProfile(uid: string, email: string, profile: UserProfile): Promise<StoredUserRecord>;
  updatePreferences(uid: string, email: string, preferences: UserPreferences): Promise<StoredUserRecord>;
  updateSavedLocations(uid: string, email: string, locations: SavedLocation[]): Promise<StoredUserRecord>;
  updateAlertPrefs(uid: string, email: string, alertPrefs: AlertPrefs): Promise<StoredUserRecord>;
  updateAlertState(uid: string, alertState: AlertState): Promise<void>;
  registerFcmToken(uid: string, email: string, entry: FcmTokenEntry): Promise<StoredUserRecord>;
  removeFcmTokens(uid: string, tokensToRemove: string[]): Promise<void>;
  appendNotification(uid: string, item: NotificationItem): Promise<void>;
  listAlertEnabledUsers(): Promise<StoredUserRecord[]>;
  deleteUser(uid: string): Promise<void>;
}

export function buildDefaultUserRecord(
  uid: string,
  email: string,
  displayName = '',
  nowIso = new Date().toISOString()
): StoredUserRecord {
  return {
    uid,
    email,
    displayName,
    profile: { ...DEFAULT_USER_PROFILE },
    preferences: { ...DEFAULT_USER_PREFERENCES },
    savedLocations: [],
    alertPrefs: { ...DEFAULT_ALERT_PREFS },
    alertState: { ...DEFAULT_ALERT_STATE, lastNotifiedByLoc: {} },
    fcmTokens: [],
    notificationHistory: [],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
}

export class InMemoryUsersRepo implements UsersRepository {
  private readonly records = new Map<string, StoredUserRecord>();

  public async getOrCreateUser(
    uid: string,
    email: string,
    displayName = ''
  ): Promise<StoredUserRecord> {
    const existing = this.records.get(uid);
    if (existing) return existing;
    const created = buildDefaultUserRecord(uid, email, displayName);
    this.records.set(uid, created);
    return created;
  }

  public async getUser(uid: string): Promise<StoredUserRecord | null> {
    return this.records.get(uid) ?? null;
  }

  public async updateProfile(
    uid: string,
    email: string,
    profile: UserProfile
  ): Promise<StoredUserRecord> {
    const rec = await this.getOrCreateUser(uid, email);
    const updated: StoredUserRecord = {
      ...rec,
      profile,
      updatedAtIso: new Date().toISOString(),
    };
    this.records.set(uid, updated);
    return updated;
  }

  public async updatePreferences(
    uid: string,
    email: string,
    preferences: UserPreferences
  ): Promise<StoredUserRecord> {
    const rec = await this.getOrCreateUser(uid, email);
    const updated: StoredUserRecord = {
      ...rec,
      preferences,
      updatedAtIso: new Date().toISOString(),
    };
    this.records.set(uid, updated);
    return updated;
  }

  public async updateSavedLocations(
    uid: string,
    email: string,
    locations: SavedLocation[]
  ): Promise<StoredUserRecord> {
    const rec = await this.getOrCreateUser(uid, email);
    const updated: StoredUserRecord = {
      ...rec,
      savedLocations: locations.slice(0, 5),
      updatedAtIso: new Date().toISOString(),
    };
    this.records.set(uid, updated);
    return updated;
  }

  public async updateAlertPrefs(
    uid: string,
    email: string,
    alertPrefs: AlertPrefs
  ): Promise<StoredUserRecord> {
    const rec = await this.getOrCreateUser(uid, email);
    const updated: StoredUserRecord = {
      ...rec,
      alertPrefs,
      updatedAtIso: new Date().toISOString(),
    };
    this.records.set(uid, updated);
    return updated;
  }

  public async updateAlertState(uid: string, alertState: AlertState): Promise<void> {
    const rec = this.records.get(uid);
    if (!rec) return;
    this.records.set(uid, {
      ...rec,
      alertState,
      updatedAtIso: new Date().toISOString(),
    });
  }

  public async registerFcmToken(
    uid: string,
    email: string,
    entry: FcmTokenEntry
  ): Promise<StoredUserRecord> {
    const rec = await this.getOrCreateUser(uid, email);
    const deduped = rec.fcmTokens.filter((t) => t.token !== entry.token);
    const nextTokens = [...deduped, entry].slice(-10);
    const updated: StoredUserRecord = {
      ...rec,
      fcmTokens: nextTokens,
      updatedAtIso: new Date().toISOString(),
    };
    this.records.set(uid, updated);
    return updated;
  }

  public async removeFcmTokens(uid: string, tokensToRemove: string[]): Promise<void> {
    const rec = this.records.get(uid);
    if (!rec || tokensToRemove.length === 0) return;
    const drop = new Set(tokensToRemove);
    this.records.set(uid, {
      ...rec,
      fcmTokens: rec.fcmTokens.filter((t) => !drop.has(t.token)),
      updatedAtIso: new Date().toISOString(),
    });
  }

  public async appendNotification(uid: string, item: NotificationItem): Promise<void> {
    const rec = this.records.get(uid);
    if (!rec) return;
    const next = [item, ...rec.notificationHistory].slice(0, 50);
    this.records.set(uid, {
      ...rec,
      notificationHistory: next,
      updatedAtIso: new Date().toISOString(),
    });
  }

  public async listAlertEnabledUsers(): Promise<StoredUserRecord[]> {
    return Array.from(this.records.values()).filter(
      (u) => u.alertPrefs.enabled && u.savedLocations.some((l) => l.alertsEnabled)
    );
  }

  public async deleteUser(uid: string): Promise<void> {
    this.records.delete(uid);
  }
}
