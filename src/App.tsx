import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Compass,
  Download,
  HelpCircle,
  Languages,
  Lightbulb,
  Loader2,
  LogIn,
  LogOut,
  MailCheck,
  Moon,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  UserCircle,
  X,
} from 'lucide-react';
import { DEMO_SCENARIOS, type DemoScenarioPreset } from '../shared/constants.ts';
import { LANGUAGE_OPTIONS, type SupportedLanguage } from '../shared/languages.ts';
import type {
  AirQualitySnapshot,
  DecisionPlan,
  IndianLocation,
  NotificationItem,
  UserProfile,
} from '../shared/schemas.ts';
import { AirSnapshot } from './components/AirSnapshot.tsx';
import { AlertsSettingsPanel } from './components/AlertsSettingsPanel.tsx';
import { CoachmarkTour, type TourPhase } from './components/CoachmarkTour.tsx';
import { DailyPlanner } from './components/DailyPlanner.tsx';
import { GroundedChat } from './components/GroundedChat.tsx';
import { HelpPage } from './components/HelpPage.tsx';
import { IndoorGuide } from './components/IndoorGuide.tsx';
import { LocationPicker } from './components/LocationPicker.tsx';
import { LoginPage } from './components/LoginPage.tsx';
import { NotificationCenter } from './components/NotificationCenter.tsx';
import { ProfilePanel } from './components/ProfilePanel.tsx';
import { SettingsPage } from './components/SettingsPage.tsx';
import { SustainablePlanner } from './components/SustainablePlanner.tsx';
import { VerdictBanner } from './components/VerdictBanner.tsx';
import { CURRENT_TOUR_VERSION } from './components/tourSteps.ts';
import { useAuth } from './context/AuthContext.tsx';
import { usePreferences } from './context/PreferencesContext.tsx';
import { useI18n } from './i18n/I18nContext.tsx';
import { fetchLiveAirApi, generatePlanApi, reverseGeocodeApi } from './lib/apiClient.ts';
import { showLocalBrowserNotification } from './lib/notifications.ts';
import { safeStorage } from './lib/storage.ts';

const GUEST_NOTIFICATIONS_KEY = 'uaqa_notifications_v1';
const TEXT_SIZE_ORDER = ['normal', 'large', 'xl'] as const;

type ActiveView = 'assistant' | 'settings' | 'help' | 'login';

function getInitialViewFromLocation(): ActiveView {
  if (typeof window === 'undefined') return 'assistant';
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  const path = window.location.pathname.replace(/^\/+/, '').toLowerCase();
  const route = hash || path;
  if (route === 'login') return 'login';
  if (route === 'settings') return 'settings';
  if (route === 'help') return 'help';
  return 'assistant';
}

function PlanSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="h-3 w-28 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="mt-3 h-7 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin text-teal-700" aria-hidden="true" />
          {label}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="h-28 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />
          <div className="h-28 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const {
    preferences,
    profile,
    advicePrefs,
    updatePreferences,
    updateProfile,
    markHintSeen,
  } = usePreferences();
  const {
    user,
    cloudLoaded,
    sessionExpired,
    emailVerificationNeeded,
    savedLocations,
    alertPrefs,
    cloudNotifications,
    pendingMerge,
    authStatusMessage,
    clearAuthStatus,
    getIdToken,
    resendVerificationEmail,
    signOutUser,
    resolveGuestMerge,
    syncProfileToCloud,
    syncPreferencesToCloud,
    toggleSavedLocation,
    toggleLocationAlert,
    updateAlertPrefs,
    saveFcmToken,
    syncNotificationHistory,
    exportAccountData,
    deleteAccountAndData,
  } = useAuth();
  const { t } = useI18n();

  const [view, setView] = useState<ActiveView>(() => getInitialViewFromLocation());
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [tourPhase, setTourPhase] = useState<TourPhase>(() =>
    !preferences.tourCompleted || preferences.tourVersion < CURRENT_TOUR_VERSION
      ? 'welcome'
      : 'closed'
  );

  const navigateTo = useCallback((nextView: ActiveView) => {
    setView(nextView);
    if (typeof window !== 'undefined') {
      const targetHash = nextView === 'assistant' ? '' : `#/${nextView}`;
      if (window.location.hash !== targetHash) {
        window.history.replaceState(null, '', targetHash || window.location.pathname);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => {
      setView(getInitialViewFromLocation());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    try {
      const raw = safeStorage.getItem(GUEST_NOTIFICATIONS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as NotificationItem[]).slice(0, 50) : [];
    } catch {
      return [];
    }
  });

  const [selectedLocation, setSelectedLocation] = useState<IndianLocation | null>(null);
  const [airSnapshot, setAirSnapshot] = useState<AirQualitySnapshot | null>(null);
  const [plan, setPlan] = useState<DecisionPlan | null>(null);

  const [loadingAir, setLoadingAir] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [airError, setAirError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const autoInitRef = useRef(false);
  const activeRequestIdRef = useRef(0);
  const userSelectedLocationRef = useRef(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const lastSyncedPrefsRef = useRef<string>('');
  const lastSyncedProfileRef = useRef<string>('');
  const alertedSnapshotKeysRef = useRef<Set<string>>(new Set());

  // Hydrate cloud notifications when signed in
  useEffect(() => {
    if (user && cloudLoaded && cloudNotifications.length > 0) {
      setNotifications((prev) => {
        const mergedMap = new Map<string, NotificationItem>();
        for (const item of [...cloudNotifications, ...prev]) {
          if (!mergedMap.has(item.id)) mergedMap.set(item.id, item);
        }
        return Array.from(mergedMap.values())
          .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
          .slice(0, 50);
      });
    }
  }, [user, cloudLoaded, cloudNotifications]);

  const persistNotifications = useCallback(
    (next: NotificationItem[]) => {
      const capped = next.slice(0, 50);
      setNotifications(capped);
      safeStorage.setItem(GUEST_NOTIFICATIONS_KEY, JSON.stringify(capped));
      if (user && !emailVerificationNeeded && cloudLoaded) {
        void syncNotificationHistory(capped);
      }
    },
    [user, emailVerificationNeeded, cloudLoaded, syncNotificationHistory]
  );

  const addNotificationItem = useCallback(
    (item: NotificationItem) => {
      setNotifications((prev) => {
        const next = [item, ...prev.filter((i) => i.id !== item.id)].slice(0, 50);
        safeStorage.setItem(GUEST_NOTIFICATIONS_KEY, JSON.stringify(next));
        if (user && !emailVerificationNeeded && cloudLoaded) {
          void syncNotificationHistory(next);
        }
        return next;
      });
    },
    [user, emailVerificationNeeded, cloudLoaded, syncNotificationHistory]
  );

  // Automatic live in-app alert (works in Guest Mode too!) when loaded live air crosses threshold
  useEffect(() => {
    if (!airSnapshot || airSnapshot.freshness === 'stale') return;
    const isSensitive =
      alertPrefs.sensitiveMode ||
      profile.householdType === 'family_with_kids' ||
      profile.householdType === 'senior_citizens' ||
      profile.healthSensitivities.some((s) =>
        ['asthma', 'elderly', 'pregnancy', 'heart_lung'].includes(s)
      );
    const effectiveThreshold = isSensitive
      ? Math.min(alertPrefs.thresholdAqi, 100)
      : alertPrefs.thresholdAqi;

    if (airSnapshot.aqi < effectiveThreshold) return;

    const dedupeKey = `${airSnapshot.location.name}:${airSnapshot.cpcbCategory}:${airSnapshot.updatedAtIso.slice(0, 13)}`;
    if (alertedSnapshotKeysRef.current.has(dedupeKey)) return;
    alertedSnapshotKeysRef.current.add(dedupeKey);

    const pmText =
      airSnapshot.pm25 !== null ? `PM2.5 ${airSnapshot.pm25} µg/m³` : `AQI ${airSnapshot.aqi}`;
    const catLabel = airSnapshot.cpcbCategory.replace('_', ' ');
    const item: NotificationItem = {
      id: `live-${dedupeKey}`,
      title: `${airSnapshot.location.name}: AQI ${airSnapshot.aqi} (${catLabel})`,
      body: `Live reading crossed ${effectiveThreshold} AQI (${pmText}). Limit prolonged outdoor exposure and keep windows sealed.`,
      reason: `${pmText} · threshold ${effectiveThreshold} AQI${isSensitive ? ' (sensitive group)' : ''}`,
      severity:
        airSnapshot.aqi >= 401
          ? 'severe'
          : airSnapshot.aqi >= 201
            ? 'high'
            : 'moderate',
      sourceName: airSnapshot.source.name,
      dataTimestampIso: airSnapshot.updatedAtIso,
      createdAtIso: new Date().toISOString(),
      read: false,
    };
    addNotificationItem(item);
  }, [airSnapshot, alertPrefs.sensitiveMode, alertPrefs.thresholdAqi, profile, addNotificationItem]);

  // Close profile menu on Escape or outside click
  useEffect(() => {
    if (!profileMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setProfileMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [profileMenuOpen]);

  // Sync preferences to Firestore once cloud document has loaded and no merge is pending
  useEffect(() => {
    if (!user || emailVerificationNeeded || !cloudLoaded || pendingMerge) {
      lastSyncedPrefsRef.current = JSON.stringify(preferences);
      return;
    }
    const serialized = JSON.stringify(preferences);
    if (serialized === lastSyncedPrefsRef.current) return;
    lastSyncedPrefsRef.current = serialized;
    void syncPreferencesToCloud(preferences);
  }, [preferences, user, emailVerificationNeeded, cloudLoaded, pendingMerge, syncPreferencesToCloud]);

  // Sync profile to Firestore once cloud document has loaded and no merge is pending
  useEffect(() => {
    if (!user || emailVerificationNeeded || !cloudLoaded || pendingMerge) {
      lastSyncedProfileRef.current = JSON.stringify(profile);
      return;
    }
    const serialized = JSON.stringify(profile);
    if (serialized === lastSyncedProfileRef.current) return;
    lastSyncedProfileRef.current = serialized;
    void syncProfileToCloud(profile);
  }, [profile, user, emailVerificationNeeded, cloudLoaded, pendingMerge, syncProfileToCloud]);

  const loadLocationAndPlan = useCallback(
    async (loc: IndianLocation, activeProfile: UserProfile, forceRefreshAir = false) => {
      const requestId = ++activeRequestIdRef.current;
      setSelectedLocation(loc);
      setAirError(null);
      setPlanError(null);
      setLoadingAir(true);
      setLoadingPlan(true);

      let fetchedAir: AirQualitySnapshot | null = null;
      try {
        fetchedAir = await fetchLiveAirApi(loc, forceRefreshAir);
        if (requestId !== activeRequestIdRef.current) return;
        setAirSnapshot(fetchedAir);
        setLoadingAir(false);
      } catch (err) {
        if (requestId !== activeRequestIdRef.current) return;
        setAirError(
          err instanceof Error ? err.message : 'Live air quality data is temporarily unavailable.'
        );
        setLoadingAir(false);
        setLoadingPlan(false);
        return;
      }

      try {
        const result = await generatePlanApi({
          location: loc,
          profile: activeProfile,
          advicePrefs,
        });
        if (requestId !== activeRequestIdRef.current) return;
        if (result?.airSnapshot) {
          setAirSnapshot(result.airSnapshot);
        }
        if (result?.plan) {
          setPlan(result.plan);
        }
      } catch (err) {
        if (requestId !== activeRequestIdRef.current) return;
        setPlanError(
          err instanceof Error ? err.message : 'Unable to generate personalized recommendations.'
        );
      } finally {
        if (requestId === activeRequestIdRef.current) {
          setLoadingPlan(false);
        }
      }
    },
    [advicePrefs]
  );

  // Respect explicit user preference for default location or GPS on open (never silently default to Delhi)
  useEffect(() => {
    if (autoInitRef.current) return;
    autoInitRef.current = true;

    if (preferences.useCurrentLocationOnOpen && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (userSelectedLocationRef.current) return;
          try {
            const loc = await reverseGeocodeApi(pos.coords.latitude, pos.coords.longitude);
            if (userSelectedLocationRef.current) return;
            await loadLocationAndPlan(loc, profile, false);
          } catch {
            if (!userSelectedLocationRef.current && preferences.defaultLocation) {
              await loadLocationAndPlan(preferences.defaultLocation, profile, false);
            }
          }
        },
        () => {
          if (!userSelectedLocationRef.current && preferences.defaultLocation) {
            void loadLocationAndPlan(preferences.defaultLocation, profile, false);
          }
        },
        { timeout: 6000 }
      );
      return;
    }

    if (preferences.defaultLocation) {
      void loadLocationAndPlan(preferences.defaultLocation, profile, false);
    }
  }, [preferences.defaultLocation, preferences.useCurrentLocationOnOpen, profile, loadLocationAndPlan]);

  async function handleSelectLocation(loc: IndianLocation) {
    userSelectedLocationRef.current = true;
    navigateTo('assistant');
    setAirSnapshot(null);
    setPlan(null);
    await loadLocationAndPlan(loc, profile, false);
  }

  async function handleApplyDemo(scenario: DemoScenarioPreset) {
    userSelectedLocationRef.current = true;
    navigateTo('assistant');
    updateProfile(scenario.profile);
    setAirSnapshot(null);
    setPlan(null);
    await loadLocationAndPlan(scenario.location, scenario.profile, false);
  }

  async function handleUpdatePlanOnly(overrideLanguage?: SupportedLanguage) {
    if (!selectedLocation) return;
    const requestId = ++activeRequestIdRef.current;
    setPlanError(null);
    setLoadingPlan(true);
    try {
      const result = await generatePlanApi({
        location: selectedLocation,
        profile,
        advicePrefs: overrideLanguage
          ? { ...advicePrefs, language: overrideLanguage }
          : advicePrefs,
      });
      if (requestId !== activeRequestIdRef.current) return;
      if (result?.airSnapshot) {
        setAirSnapshot(result.airSnapshot);
      }
      if (result?.plan) {
        setPlan(result.plan);
      }
    } catch (err) {
      if (requestId !== activeRequestIdRef.current) return;
      setPlanError(err instanceof Error ? err.message : 'Could not refresh personalized plan.');
    } finally {
      if (requestId === activeRequestIdRef.current) {
        setLoadingPlan(false);
      }
    }
  }

  function handleSwitchLanguage(nextLang: SupportedLanguage) {
    if (preferences.language === nextLang) return;
    updatePreferences({ language: nextLang }, t('settings.languageLabel'));
    if (selectedLocation && airSnapshot) {
      void handleUpdatePlanOnly(nextLang);
    }
  }

  const isEffectiveDark =
    preferences.theme === 'dark' ||
    (preferences.theme === 'system' &&
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  function handleToggleTheme() {
    const nextTheme = isEffectiveDark ? 'light' : 'dark';
    updatePreferences({ theme: nextTheme }, t('settings.themeLabel'));
  }

  const textSizeIndex = TEXT_SIZE_ORDER.indexOf(preferences.textSize);
  const canDecreaseFont = textSizeIndex > 0;
  const canIncreaseFont = textSizeIndex < TEXT_SIZE_ORDER.length - 1;

  function handleStepFont(delta: -1 | 1) {
    const nextIdx = Math.max(0, Math.min(TEXT_SIZE_ORDER.length - 1, textSizeIndex + delta));
    const nextSize = TEXT_SIZE_ORDER[nextIdx];
    if (nextSize !== preferences.textSize) {
      updatePreferences({ textSize: nextSize }, t('settings.textSizeLabel'));
    }
  }

  function handleReplayTour() {
    navigateTo('assistant');
    setTourPhase('active');
  }

  async function handleRefreshAir() {
    if (!selectedLocation) return;
    await loadLocationAndPlan(selectedLocation, profile, true);
  }

  async function handleConfirmDeleteAccount() {
    setDeletingAccount(true);
    try {
      await deleteAccountAndData();
      setConfirmDeleteOpen(false);
    } finally {
      setDeletingAccount(false);
    }
  }

  async function handleSendTestAlert() {
    const cityLabel =
      selectedLocation?.name || savedLocations[0]?.name || 'Delhi NCR';
    const token = await getIdToken();
    if (token) {
      const resp = await fetch('/api/user/test-alert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ city: cityLabel }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { notification: NotificationItem };
        addNotificationItem(data.notification);
        showLocalBrowserNotification(data.notification.title, data.notification.body);
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const fallbackItem: NotificationItem = {
      id: `test-${Date.now()}`,
      title: `Test Air Alert · ${cityLabel}`,
      body: `In-app and browser alerts are working for ${cityLabel}. Real alerts only fire from verified live air-quality readings.`,
      reason: 'User-triggered test notification',
      severity: 'info',
      sourceName: 'Urban Air Quality Assistant',
      dataTimestampIso: nowIso,
      createdAtIso: nowIso,
      read: false,
    };
    addNotificationItem(fallbackItem);
    showLocalBrowserNotification(fallbackItem.title, fallbackItem.body);
  }

  const alertsSlot = (
    <AlertsSettingsPanel
      isSignedIn={Boolean(user)}
      emailVerified={Boolean(user && !emailVerificationNeeded)}
      alertPrefs={alertPrefs}
      savedLocations={savedLocations}
      onUpdateAlertPrefs={updateAlertPrefs}
      onToggleLocationAlert={toggleLocationAlert}
      onSaveFcmToken={saveFcmToken}
      onSendTestAlert={handleSendTestAlert}
      onOpenSignIn={() => navigateTo('login')}
    />
  );

  const accountPrivacySlot = user ? (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden="true" />
        <p>
          Signed in as <strong className="text-slate-900 dark:text-slate-100">{user.email}</strong>. We store only your household profile, app preferences, up to 5 saved Indian locations, alert preferences, and recent notification history strictly under your private Firestore record (<code className="font-mono-tabular">users/{user.uid.slice(0, 8)}…</code>).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void exportAccountData()}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-300 px-4 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Export my account data (JSON)
        </button>

        {!confirmDeleteOpen ? (
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-rose-300 px-4 text-xs font-semibold text-rose-800 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete my account and data
          </button>
        ) : (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2.5 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100"
          >
            <span className="font-medium">
              Permanently delete your account, saved locations, and cloud profile?
            </span>
            <button
              type="button"
              disabled={deletingAccount}
              onClick={() => void handleConfirmDeleteAccount()}
              className="min-h-[36px] rounded-lg bg-rose-700 px-3 font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
            >
              {deletingAccount ? 'Deleting...' : 'Yes, delete permanently'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(false)}
              className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
        Sign in (optional) to sync your household profile, save up to 5 locations across India, and unlock proactive smog alerts.
      </p>
      <button
        type="button"
        onClick={() => navigateTo('login')}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-teal-700 px-4 text-xs font-semibold text-white hover:bg-teal-800"
      >
        <LogIn className="h-4 w-4" aria-hidden="true" />
        {t('app.actions.signIn')}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-black dark:text-neutral-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-teal-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        {t('app.skipToContent')}
      </a>

      {/* Clean responsive top bar with regional language, font-size, theme, coachmark tour & login controls */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md dark:border-neutral-800 dark:bg-black/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => navigateTo('assistant')}
              className="font-display text-left text-base font-bold tracking-tight text-slate-900 sm:text-lg dark:text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded"
            >
              {t('app.title')}
            </button>

            <nav
              aria-label="Primary navigation"
              className="hidden items-center gap-5 text-sm font-medium text-slate-600 xl:flex dark:text-slate-300"
            >
              <button
                type="button"
                onClick={() => navigateTo('assistant')}
                className={`hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0 ${
                  view === 'assistant' ? 'font-semibold text-teal-700 dark:text-teal-400' : ''
                }`}
              >
                {t('app.nav.assistant')}
              </button>
              {view === 'assistant' && (
                <>
                  <a href="#tour-daily-planner" className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0">
                    {t('app.nav.dailyPlan')}
                  </a>
                  <a href="#tour-indoor-guide" className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0">
                    {t('app.nav.indoorGuide')}
                  </a>
                  <a href="#tour-grounded-chat" className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0">
                    {t('app.nav.chat')}
                  </a>
                </>
              )}
            </nav>
          </div>

          <div
            id="tour-header-actions"
            className="flex flex-wrap items-center gap-1.5 sm:gap-2"
          >
            {/* Regional Indian Language Switcher (10 Languages) */}
            <div className="relative inline-flex items-center shrink-0">
              <Languages
                className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-teal-700 dark:text-teal-400"
                aria-hidden="true"
              />
              <select
                aria-label={t('toolbar.selectLanguage')}
                value={preferences.language}
                onChange={(e) => handleSwitchLanguage(e.target.value as SupportedLanguage)}
                className="min-h-[40px] cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:bg-neutral-900"
              >
                {LANGUAGE_OPTIONS.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.code === 'en'
                      ? lang.nativeLabel
                      : `${lang.nativeLabel} (${lang.englishLabel})`}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-slate-500 dark:text-neutral-400"
                aria-hidden="true"
              />
            </div>

            {/* Quick Font Size Controls (A- / A+) */}
            <div
              role="group"
              aria-label={t('toolbar.fontSizeGroup')}
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 shrink-0"
            >
              <button
                type="button"
                onClick={() => handleStepFont(-1)}
                disabled={!canDecreaseFont}
                aria-label={t('toolbar.decreaseFont')}
                title={t('toolbar.decreaseFont')}
                className="inline-flex min-h-[38px] min-w-[36px] items-center justify-center rounded-l-lg px-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                A−
              </button>
              <span className="h-4 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
              <button
                type="button"
                onClick={() => handleStepFont(1)}
                disabled={!canIncreaseFont}
                aria-label={t('toolbar.increaseFont')}
                title={t('toolbar.increaseFont')}
                className="inline-flex min-h-[38px] min-w-[36px] items-center justify-center rounded-r-lg px-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                A+
              </button>
            </div>

            {/* Quick Light / Dark Theme Toggle */}
            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label={isEffectiveDark ? t('toolbar.themeToLight') : t('toolbar.themeToDark')}
              title={isEffectiveDark ? t('toolbar.themeToLight') : t('toolbar.themeToDark')}
              aria-pressed={isEffectiveDark}
              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {isEffectiveDark ? (
                <Sun className="h-4 w-4 text-amber-400" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4 text-slate-600" aria-hidden="true" />
              )}
              <span className="hidden lg:inline">
                {isEffectiveDark ? t('toolbar.lightShort') : t('toolbar.darkShort')}
              </span>
            </button>

            {/* Quick Coachmark Tour Replay Button */}
            <button
              type="button"
              onClick={handleReplayTour}
              aria-label={t('toolbar.tourAria')}
              title={t('toolbar.tourAria')}
              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Compass className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
              <span className="hidden md:inline">{t('toolbar.tourButton')}</span>
            </button>

            <NotificationCenter
              items={notifications}
              onMarkRead={(id) =>
                persistNotifications(
                  notifications.map((item) => (item.id === id ? { ...item, read: true } : item))
                )
              }
              onMarkAllRead={() =>
                persistNotifications(notifications.map((item) => ({ ...item, read: true })))
              }
              onClearAll={() => persistNotifications([])}
              onOpenAlertSettings={() => navigateTo('settings')}
            />

            <button
              type="button"
              onClick={() => navigateTo(view === 'help' ? 'assistant' : 'help')}
              aria-label={t('app.nav.help')}
              title={t('app.nav.help')}
              aria-pressed={view === 'help'}
              className={`inline-flex min-h-[40px] min-w-[40px] items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 whitespace-nowrap shrink-0 ${
                view === 'help'
                  ? 'border-teal-600 bg-teal-700 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only lg:not-sr-only">{t('app.nav.help')}</span>
            </button>

            <button
              type="button"
              onClick={() => navigateTo(view === 'settings' ? 'assistant' : 'settings')}
              aria-label={t('app.nav.settings')}
              title={t('app.nav.settings')}
              aria-pressed={view === 'settings'}
              className={`inline-flex min-h-[40px] min-w-[40px] items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 whitespace-nowrap shrink-0 ${
                view === 'settings'
                  ? 'border-teal-600 bg-teal-700 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              <span className="hidden lg:inline">{t('app.nav.settings')}</span>
            </button>

            {user ? (
              <div ref={profileMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((v) => !v)}
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="menu"
                  className="inline-flex min-h-[40px] max-w-[160px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  <UserCircle className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                  <span className="truncate">{user.displayName || user.email?.split('@')[0] || 'Account'}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </button>

                {profileMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                      <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {user.displayName || 'Signed in'}
                      </p>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {user.email}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        navigateTo('settings');
                      }}
                      className="mt-1 flex min-h-[40px] w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Settings className="h-4 w-4" aria-hidden="true" />
                      {t('app.nav.settings')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        void signOutUser();
                      }}
                      className="flex min-h-[40px] w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-medium text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                    >
                      <LogOut className="h-4 w-4" aria-hidden="true" />
                      {t('auth.signOut')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navigateTo('login')}
                aria-current={view === 'login' ? 'page' : undefined}
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 whitespace-nowrap shrink-0 ${
                  view === 'login'
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-teal-700 text-white hover:bg-teal-800'
                }`}
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                <span>{t('app.actions.signIn')}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        {/* Session expired banner */}
        {sessionExpired && (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          >
            <span>Your sign-in session expired. Guest mode continues uninterrupted, or sign in again to resume sync.</span>
            <button
              type="button"
              onClick={() => navigateTo('login')}
              className="min-h-[36px] rounded-lg bg-amber-800 px-3 font-semibold text-white hover:bg-amber-900"
            >
              Sign in again
            </button>
          </div>
        )}

        {/* Email verification needed banner */}
        {emailVerificationNeeded && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-xs text-teal-950 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100"
          >
            <span className="flex items-center gap-2">
              <MailCheck className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden="true" />
              Please verify your email address to enable cloud sync and saved locations.
            </span>
            <button
              type="button"
              onClick={() => void resendVerificationEmail()}
              className="min-h-[36px] rounded-lg border border-teal-700 bg-white px-3 font-semibold text-teal-800 hover:bg-teal-50 dark:bg-slate-900 dark:text-teal-300"
            >
              Resend verification email
            </button>
          </div>
        )}

        {/* Guest-to-Account Merge banner */}
        {pendingMerge && (
          <div
            role="region"
            aria-label="Merge guest settings with your account"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-300 bg-teal-50 px-4 py-3.5 text-xs text-teal-950 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-100"
          >
            <div>
              <p className="font-semibold">We found guest profile &amp; preferences on this device.</p>
              <p className="mt-0.5 text-teal-900/80 dark:text-teal-200/80">
                Would you like to merge your guest changes into your account, or load your previously saved account settings?
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void resolveGuestMerge('prefer_guest')}
                className="min-h-[38px] rounded-lg bg-teal-700 px-3.5 font-semibold text-white hover:bg-teal-800"
              >
                Merge guest data into account
              </button>
              <button
                type="button"
                onClick={() => void resolveGuestMerge('prefer_account')}
                className="min-h-[38px] rounded-lg border border-teal-700 bg-white px-3.5 font-semibold text-teal-800 hover:bg-teal-50 dark:bg-slate-900 dark:text-teal-300"
              >
                Use saved account data
              </button>
            </div>
          </div>
        )}

        {/* General auth status notice */}
        {authStatusMessage && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <span>{authStatusMessage}</span>
            <button
              type="button"
              onClick={clearAuthStatus}
              aria-label="Dismiss status message"
              className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {view === 'login' ? (
          <LoginPage
            onBack={() => navigateTo('assistant')}
            onOpenSettings={() => navigateTo('settings')}
          />
        ) : view === 'settings' ? (
          <SettingsPage
            onBack={() => navigateTo('assistant')}
            onStartTour={handleReplayTour}
            alertsSlot={alertsSlot}
            accountPrivacySlot={accountPrivacySlot}
          />
        ) : view === 'help' ? (
          <HelpPage
            onBack={() => navigateTo('assistant')}
            onStartTour={handleReplayTour}
            onTryDemo={(scenario) => {
              void handleApplyDemo(scenario);
            }}
          />
        ) : (
          <>
            <LocationPicker
              selectedLocation={selectedLocation}
              onSelectLocation={handleSelectLocation}
              loading={loadingAir || loadingPlan}
              isSignedIn={Boolean(user && !emailVerificationNeeded)}
              savedLocations={savedLocations}
              onToggleSaveLocation={(loc) => void toggleSavedLocation(loc)}
            />

            <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
              <div className="space-y-6 lg:col-span-8">
                {!selectedLocation && !loadingAir && (
                  <section
                    id="tour-hero-demos"
                    className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-neutral-800 dark:bg-neutral-950"
                  >
                    <div className="flex items-center gap-2 text-teal-700 dark:text-teal-400">
                      <Compass className="h-5 w-5" aria-hidden="true" />
                      <span className="text-xs font-semibold">{t('app.guestBadge')}</span>
                    </div>
                    <h1 className="font-display mt-2 text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance] sm:text-3xl dark:text-neutral-100">
                      {t('hero.headline')}
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-neutral-300">
                      {t('hero.subtitle')}
                    </p>

                    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {DEMO_SCENARIOS.map((demo) => (
                        <button
                          key={demo.id}
                          type="button"
                          onClick={() => handleApplyDemo(demo)}
                          className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition-colors hover:border-teal-600 hover:bg-teal-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-neutral-800 dark:bg-black dark:hover:border-teal-500"
                        >
                          <div>
                            <p className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {t(`demos.${demo.id}.title`)}
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                              {t(`demos.${demo.id}.subtitle`)}
                            </p>
                          </div>
                          <span className="mt-3 text-xs font-semibold text-teal-700 dark:text-teal-400">
                            {t('hero.loadLivePlan')}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {loadingAir && (
                  <div
                    aria-busy="true"
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                  >
                    <Loader2 className="h-5 w-5 animate-spin text-teal-700" aria-hidden="true" />
                    {t('snapshot.loading', { city: selectedLocation?.name ?? '' })}
                  </div>
                )}

                {airError && !loadingAir && (
                  <div
                    role="alert"
                    className="rounded-2xl border border-rose-200 bg-rose-50 p-6 dark:border-rose-900 dark:bg-rose-950/40"
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle
                        className="mt-0.5 h-5 w-5 shrink-0 text-rose-700 dark:text-rose-400"
                        aria-hidden="true"
                      />
                      <div className="flex-1">
                        <h2 className="font-display text-base font-bold text-rose-950 dark:text-rose-100">
                          {t('snapshot.unavailableTitle')}
                        </h2>
                        <p className="mt-1 text-sm text-rose-900 dark:text-rose-200">{airError}</p>
                        <p className="mt-1 text-xs text-rose-800/80 dark:text-rose-300/80">
                          {t('snapshot.neverFabricateNote')}
                        </p>
                        {selectedLocation && (
                          <button
                            type="button"
                            onClick={handleRefreshAir}
                            className="mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white hover:bg-rose-800"
                          >
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('snapshot.retryAir')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {plan && !loadingPlan && (
                  <>
                    <VerdictBanner plan={plan} showWhyByDefault={preferences.showWhyByDefault} />
                    {tourPhase === 'closed' &&
                      !preferences.seenHints.includes('why_advice_hint') && (
                        <div
                          role="note"
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-2.5 text-xs text-teal-950 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100"
                        >
                          <span className="flex items-center gap-2">
                            <Lightbulb className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                            {t('tour.whyHint')}
                          </span>
                          <button
                            type="button"
                            onClick={() => markHintSeen('why_advice_hint')}
                            className="min-h-[32px] rounded-lg border border-teal-700 bg-white px-2.5 font-semibold text-teal-800 hover:bg-teal-50 dark:bg-slate-900 dark:text-teal-300"
                          >
                            {t('tour.dismissHint')}
                          </button>
                        </div>
                      )}
                  </>
                )}

                {airSnapshot && !loadingAir && (
                  <AirSnapshot
                    snapshot={airSnapshot}
                    aqiScale={preferences.aqiScale}
                    tempUnit={preferences.tempUnit}
                    timeFormat={preferences.timeFormat}
                    onRefresh={handleRefreshAir}
                    refreshing={loadingAir || loadingPlan}
                  />
                )}

                {loadingPlan && !loadingAir && <PlanSkeleton label={t('verdict.planLoading')} />}

                {planError && !loadingPlan && (
                  <div
                    role="alert"
                    className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                  >
                    <p className="font-semibold">{t('verdict.planErrorTitle')}</p>
                    <p className="mt-1 text-xs">{planError}</p>
                    <button
                      type="button"
                      onClick={() => void handleUpdatePlanOnly()}
                      className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-amber-800 px-4 text-xs font-semibold text-white hover:bg-amber-900"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('verdict.retryPlan')}
                    </button>
                  </div>
                )}

                {plan && !loadingPlan && (
                  <>
                    {preferences.plannerSections.daily && (
                      <DailyPlanner planner={plan.dailyPlanner} />
                    )}
                    {preferences.plannerSections.indoor && (
                      <IndoorGuide guide={plan.indoorGuide} />
                    )}
                    {preferences.plannerSections.sustainable && (
                      <SustainablePlanner planner={plan.sustainablePlanner} />
                    )}
                  </>
                )}

                {selectedLocation && airSnapshot && !loadingAir && (
                  <GroundedChat
                    key={`${selectedLocation.name}-${selectedLocation.lat.toFixed(2)}-${selectedLocation.lon.toFixed(2)}`}
                    location={selectedLocation}
                    profile={profile}
                    airSnapshot={airSnapshot}
                    advicePrefs={advicePrefs}
                  />
                )}
              </div>

              <div className="lg:col-span-4 lg:sticky lg:top-20">
                <ProfilePanel
                  profile={profile}
                  onChangeProfile={updateProfile}
                  onApplyDemo={handleApplyDemo}
                  onGeneratePlan={() => void handleUpdatePlanOnly()}
                  canGenerate={Boolean(selectedLocation)}
                  generating={loadingPlan}
                />
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="mt-12 border-t border-slate-200 bg-white/80 dark:border-neutral-800 dark:bg-black/95">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:text-slate-400">
          <div className="space-y-1">
            <p className="font-medium text-slate-800 dark:text-slate-200">
              {t('app.title')} · {t('footer.dataSources')}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('footer.disclaimer')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigateTo('help')}
              className="min-h-[36px] font-semibold text-teal-700 hover:underline dark:text-teal-400"
            >
              {t('help.heading')}
            </button>
            <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
            <button
              type="button"
              onClick={handleReplayTour}
              className="inline-flex min-h-[36px] items-center gap-1 font-semibold text-teal-700 hover:underline dark:text-teal-400"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {t('settings.resetTour')}
            </button>
            <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
            <a
              href={
                (import.meta.env.VITE_FEEDBACK_URL as string | undefined) ||
                'mailto:support@urbanairassistant.example'
              }
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[36px] inline-flex items-center font-semibold text-slate-700 hover:underline dark:text-slate-300"
            >
              {t('footer.feedback')}
            </a>
          </div>
        </div>
      </footer>

      <CoachmarkTour
        phase={view === 'assistant' ? tourPhase : 'closed'}
        isSignedIn={Boolean(user)}
        reduceMotion={preferences.reduceMotion}
        onStartTour={() => setTourPhase('active')}
        onCompleteOrSkip={(version) => {
          setTourPhase('closed');
          updatePreferences({ tourCompleted: true, tourVersion: version });
        }}
      />
    </div>
  );
}
