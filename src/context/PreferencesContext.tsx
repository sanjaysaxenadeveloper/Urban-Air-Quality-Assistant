import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_USER_PREFERENCES,
  DEFAULT_USER_PROFILE,
  UserProfileSchema,
  migratePreferences,
  type AdviceStylePrefs,
  type UserPreferences,
  type UserProfile,
} from '../../shared/schemas.ts';
import { I18nProvider, translate } from '../i18n/I18nContext.tsx';
import { safeStorage, type StorageAdapter } from '../lib/storage.ts';

export const PREFERENCES_STORAGE_KEY = 'uaqa_preferences_v2';
export const PROFILE_STORAGE_KEY = 'uaqa_profile_v1';

function detectOsReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function detectOsDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function loadStoredPreferences(storage: StorageAdapter = safeStorage): UserPreferences {
  const osReduced = detectOsReducedMotion();
  const raw = storage.getItem(PREFERENCES_STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_USER_PREFERENCES, reduceMotion: osReduced };
  }
  try {
    return migratePreferences(JSON.parse(raw), osReduced);
  } catch {
    return { ...DEFAULT_USER_PREFERENCES, reduceMotion: osReduced };
  }
}

export function loadStoredProfile(storage: StorageAdapter = safeStorage): UserProfile {
  const raw = storage.getItem(PROFILE_STORAGE_KEY);
  if (!raw) return DEFAULT_USER_PROFILE;
  try {
    const parsed = UserProfileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_USER_PROFILE;
  } catch {
    return DEFAULT_USER_PROFILE;
  }
}

export interface PreferencesContextValue {
  preferences: UserPreferences;
  profile: UserProfile;
  advicePrefs: AdviceStylePrefs;
  storageMode: 'localStorage' | 'memory';
  announcement: string;
  updatePreferences: (patch: Partial<UserPreferences>, settingLabel?: string) => void;
  replacePreferences: (next: UserPreferences) => void;
  updateProfile: (next: UserProfile) => void;
  resetPreferences: () => void;
  resetTour: () => void;
  markHintSeen: (hintId: string) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({
  children,
  storage = safeStorage,
  onSyncPreferences,
  onSyncProfile,
}: {
  children: ReactNode;
  storage?: StorageAdapter;
  onSyncPreferences?: (prefs: UserPreferences) => void;
  onSyncProfile?: (profile: UserProfile) => void;
}) {
  const [preferences, setPreferences] = useState<UserPreferences>(() =>
    loadStoredPreferences(storage)
  );
  const [profile, setProfile] = useState<UserProfile>(() => loadStoredProfile(storage));
  const [announcement, setAnnouncement] = useState('');

  // Apply appearance, text size, contrast, and reduced motion instantly to <html>
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    const applyTheme = () => {
      const shouldBeDark =
        preferences.theme === 'dark' || (preferences.theme === 'system' && detectOsDark());
      root.classList.toggle('dark', shouldBeDark);
    };

    applyTheme();
    root.dataset.textSize = preferences.textSize;
    root.classList.toggle('high-contrast', preferences.highContrast);
    root.classList.toggle('reduce-motion', preferences.reduceMotion);

    if (preferences.theme === 'system' && typeof window.matchMedia === 'function') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme();
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    return undefined;
  }, [
    preferences.theme,
    preferences.textSize,
    preferences.highContrast,
    preferences.reduceMotion,
  ]);

  const persistPreferences = useCallback(
    (next: UserPreferences) => {
      storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next));
      onSyncPreferences?.(next);
    },
    [storage, onSyncPreferences]
  );

  const updatePreferences = useCallback(
    (patch: Partial<UserPreferences>, settingLabel?: string) => {
      setPreferences((prev) => {
        const merged = migratePreferences({ ...prev, ...patch, schemaVersion: 2 });
        persistPreferences(merged);
        if (settingLabel) {
          setAnnouncement(
            translate(merged.language, 'settings.announcedUpdated', { setting: settingLabel })
          );
        }
        return merged;
      });
    },
    [persistPreferences]
  );

  const replacePreferences = useCallback(
    (next: UserPreferences) => {
      const clean = migratePreferences(next);
      setPreferences(clean);
      storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(clean));
    },
    [storage]
  );

  const updateProfile = useCallback(
    (next: UserProfile) => {
      const parsed = UserProfileSchema.safeParse(next);
      const valid = parsed.success ? parsed.data : next;
      setProfile(valid);
      storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(valid));
      onSyncProfile?.(valid);
    },
    [storage, onSyncProfile]
  );

  const resetPreferences = useCallback(() => {
    const fresh: UserPreferences = {
      ...DEFAULT_USER_PREFERENCES,
      reduceMotion: detectOsReducedMotion(),
    };
    setPreferences(fresh);
    persistPreferences(fresh);
    setAnnouncement(translate(fresh.language, 'settings.announcedReset'));
  }, [persistPreferences]);

  const resetTour = useCallback(() => {
    setPreferences((prev) => {
      const next: UserPreferences = { ...prev, tourCompleted: false, tourVersion: 0 };
      persistPreferences(next);
      setAnnouncement(translate(next.language, 'settings.announcedTourReset'));
      return next;
    });
  }, [persistPreferences]);

  const markHintSeen = useCallback(
    (hintId: string) => {
      setPreferences((prev) => {
        if (prev.seenHints.includes(hintId)) return prev;
        const next: UserPreferences = {
          ...prev,
          seenHints: [...prev.seenHints, hintId].slice(-20),
        };
        persistPreferences(next);
        return next;
      });
    },
    [persistPreferences]
  );

  const advicePrefs = useMemo<AdviceStylePrefs>(
    () => ({
      language: preferences.language,
      detail: preferences.adviceDetail,
      tone: preferences.adviceTone,
      tempUnit: preferences.tempUnit,
      aqiScale: preferences.aqiScale,
      preferredMask: preferences.preferredMask,
    }),
    [
      preferences.language,
      preferences.adviceDetail,
      preferences.adviceTone,
      preferences.tempUnit,
      preferences.aqiScale,
      preferences.preferredMask,
    ]
  );

  const value = useMemo<PreferencesContextValue>(
    () => ({
      preferences,
      profile,
      advicePrefs,
      storageMode: storage.mode,
      announcement,
      updatePreferences,
      replacePreferences,
      updateProfile,
      resetPreferences,
      resetTour,
      markHintSeen,
    }),
    [
      preferences,
      profile,
      advicePrefs,
      storage.mode,
      announcement,
      updatePreferences,
      replacePreferences,
      updateProfile,
      resetPreferences,
      resetTour,
      markHintSeen,
    ]
  );

  return (
    <PreferencesContext.Provider value={value}>
      <I18nProvider language={preferences.language}>
        {children}
        {/* Accessible screen-reader announcement region for instant preference changes */}
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </div>
      </I18nProvider>
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used within PreferencesProvider');
  }
  return ctx;
}
