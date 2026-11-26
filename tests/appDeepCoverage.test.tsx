// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

import {
  DEFAULT_ALERT_PREFS,
  DEFAULT_USER_PREFERENCES,
  DEFAULT_USER_PROFILE,
  type AirQualitySnapshot,
  type DecisionPlan,
  type IndianLocation,
} from '../shared/schemas.ts';

const { authState } = vi.hoisted(() => ({
  authState: {
    user: null as any,
    authReady: true,
    cloudLoaded: false,
    sessionExpired: false,
    emailVerificationNeeded: false,
    savedLocations: [] as any[],
    alertPrefs: {
      enabled: true,
      thresholdAqi: 200,
      sensitiveMode: false,
      categoryChangeAlerts: true,
      quietHoursStart: 22,
      quietHoursEnd: 7,
      morningBriefingEnabled: false,
      morningBriefingTime: '07:30',
      cooldownMinutes: 180,
      dailyCap: 5,
    },
    cloudNotifications: [] as any[],
    pendingMerge: null as any,
    authStatusMessage: null as string | null,
    clearAuthStatus: vi.fn(),
    getIdToken: vi.fn(async () => 'mock-token'),
    signInWithGoogle: vi.fn(async () => {}),
    signInWithEmail: vi.fn(async () => {}),
    signUpWithEmail: vi.fn(async () => {}),
    resendVerificationEmail: vi.fn(async () => {}),
    sendPasswordReset: vi.fn(async () => {}),
    signOutUser: vi.fn(async () => {}),
    resolveGuestMerge: vi.fn(async () => {}),
    syncProfileToCloud: vi.fn(async () => {}),
    syncPreferencesToCloud: vi.fn(async () => {}),
    toggleSavedLocation: vi.fn(async () => {}),
    toggleLocationAlert: vi.fn(async () => {}),
    updateAlertPrefs: vi.fn(async () => {}),
    saveFcmToken: vi.fn(async () => {}),
    syncNotificationHistory: vi.fn(async () => {}),
    exportAccountData: vi.fn(async () => {}),
    deleteAccountAndData: vi.fn(async () => {}),
  },
}));

vi.mock('../src/context/AuthContext.tsx', () => ({
  useAuth: () => authState,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const SAMPLE_LOC: IndianLocation = {
  id: 'delhi',
  name: 'Delhi',
  state: 'Delhi',
  lat: 28.6139,
  lon: 77.209,
};

const SAMPLE_SNAPSHOT: AirQualitySnapshot = {
  location: SAMPLE_LOC,
  aqi: 320,
  cpcbCategory: 'very_poor',
  usEpaAqi: 220,
  usEpaCategory: 'very_unhealthy',
  pm25: 160,
  pm10: 280,
  no2: 45,
  so2: 12,
  o3: 20,
  co: 1.1,
  dominantPollutant: 'PM2.5',
  weather: {
    temperatureC: 19,
    humidityPct: 60,
    windSpeedKmh: 6,
    windDirectionDeg: 270,
    weatherCode: 45,
    sourceName: 'Open-Meteo Weather',
  },
  source: {
    id: 'cpcb_live',
    name: 'CPCB Official Live (India)',
    isModelled: false,
    stationName: 'Anand Vihar, Delhi',
  },
  updatedAtIso: '2026-11-25T12:00:00.000Z',
  fetchedAtIso: '2026-11-25T12:05:00.000Z',
  freshness: 'live',
  freshnessMinutes: 5,
  cacheHit: false,
};

const SAMPLE_PLAN: DecisionPlan = {
  todaysVerdict: 'Severe winter smog in Delhi. Keep windows shut and move exercise indoors.',
  severitySummary: 'Very Poor air quality driven by fine particulate matter PM2.5.',
  dailyPlanner: {
    morning: {
      period: 'morning',
      windowSummary: 'Heavy morning smog inversion',
      action: 'Stay indoors, run HEPA purifier.',
      commuteAndActivity: 'Use metro; keep windows up.',
      maskGuidance: 'Wear N95 if outdoors.',
      hydrationAndRecovery: 'Drink warm water.',
      why: 'Cold morning air traps particulates.',
      expectedBenefit: 'Avoids 75% PM2.5 exposure.',
      assumptionNote: 'Assumes indoor room is sealed.',
    },
    afternoon: {
      period: 'afternoon',
      windowSummary: 'Slight midday dispersion',
      action: 'Quick outdoor errands only.',
      commuteAndActivity: 'Combine errands into one trip.',
      maskGuidance: 'Keep N95 handy.',
      hydrationAndRecovery: 'Stay hydrated.',
      why: 'Sunlight raises boundary layer slightly.',
      expectedBenefit: 'Less exposure than morning peak.',
      assumptionNote: 'Assumes errands under 30 mins.',
    },
    evening: {
      period: 'evening',
      windowSummary: 'Night inversion drops back down',
      action: 'Stay indoors with air purifier on medium.',
      commuteAndActivity: 'Keep car AC on recirculation.',
      maskGuidance: 'N95 required outdoors.',
      hydrationAndRecovery: 'Wash face and eyes.',
      why: 'Traffic rush hour and cooling trap smoke.',
      expectedBenefit: 'Avoids evening peak particulates.',
      assumptionNote: 'Assumes HEPA running.',
    },
  },
  indoorGuide: {
    indoorReadingNote: 'Inferred from outdoor air quality.',
    ventilationVerdict: 'seal',
    ventilationReason: 'Outdoor air is too polluted for ventilation.',
    recommendations: [
      {
        title: 'Run HEPA Purifier',
        action: 'Turn purifier to high in the living room.',
        why: 'Traps airborne PM2.5.',
        expectedBenefit: '70% reduction in indoor particulates.',
        assumptionNote: 'Assumes doors and windows are closed.',
      },
    ],
  },
  sustainablePlanner: {
    alternatives: [
      {
        title: 'Metro / Public Transit',
        action: 'Take Delhi Metro line instead of private car.',
        comparedTo: 'Single-occupancy car commute',
        why: 'Cuts local vehicular exhaust.',
        expectedBenefit: 'Avoids 4.2 kg CO2 per trip.',
        assumptionNote: 'Assumes nearest station within 1km.',
      },
    ],
  },
  whyThisAdvice: {
    dataUsed: ['PM2.5 160 ug/m3', 'Winter morning temperature inversion'],
    reasoning: 'Cold trapped air concentrates fine PM; high AQI requires proactive indoor filtering.',
    medicalDisclaimer: 'Not a substitute for personalised medical advice from a pulmonologist.',
  },
};

vi.mock('../src/lib/apiClient.ts', () => ({
  fetchLiveAirApi: vi.fn(async () => SAMPLE_SNAPSHOT),
  generatePlanApi: vi.fn(async () => ({
    airSnapshot: SAMPLE_SNAPSHOT,
    plan: SAMPLE_PLAN,
    modelUsed: 'gemini',
  })),
  reverseGeocodeApi: vi.fn(async () => SAMPLE_LOC),
  searchLocationsApi: vi.fn(async () => [SAMPLE_LOC]),
  sendChatQuestionApi: vi.fn(async () => ({
    airSnapshot: SAMPLE_SNAPSHOT,
    reply: { answer: 'Answer', actionableSteps: [], suggestedFollowUps: [] },
  })),
}));

import App from '../src/App.tsx';
import { PreferencesProvider } from '../src/context/PreferencesContext.tsx';
import { I18nProvider } from '../src/i18n/I18nContext.tsx';
import { fetchLiveAirApi, generatePlanApi } from '../src/lib/apiClient.ts';

beforeEach(() => {
  window.localStorage.clear();
  window.URL.createObjectURL = vi.fn(() => 'blob:mock');
  window.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  document.documentElement.className = '';
  document.documentElement.lang = 'en';
  delete document.documentElement.dataset.textSize;
  authState.user = null;
  authState.sessionExpired = false;
  authState.emailVerificationNeeded = false;
  authState.pendingMerge = null;
  authState.authStatusMessage = null;
});

describe('App Deep Integration Suite', () => {
  it('loads demo scenario and renders all planner sections, air snapshot, and chat', async () => {
    const map = new Map<string, string>();
    map.set(
      'uaqa_preferences_v2',
      JSON.stringify({ ...DEFAULT_USER_PREFERENCES, tourCompleted: true })
    );
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) => map.get(k) ?? null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => map.set(k, v));

    render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    // Click demo persona button: 'Working Commuter · Delhi'
    const demoBtn = screen.getAllByRole('button', { name: /Working Commuter · Delhi/i })[0];
    fireEvent.click(demoBtn);

    // Wait for live air data and plan to render
    await waitFor(() => {
      expect(screen.getByText(/Today's Verdict/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText(/320/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/CPCB Official Live \(India\)/i)[0]).toBeInTheDocument();

    // Verify all planner sections are rendered
    expect(screen.getByText(/Heavy morning smog inversion/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Run HEPA Purifier/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/Metro \/ Public Transit/i)).toBeInTheDocument();

    // Click Refresh button in AirSnapshot
    const refreshBtn = screen.getByRole('button', { name: /^Refresh$/i });
    fireEvent.click(refreshBtn);
    expect(fetchLiveAirApi).toHaveBeenCalled();

    // Dismiss whyHint
    const dismissHintBtn = screen.queryByRole('button', { name: /Got it/i });
    if (dismissHintBtn) {
      fireEvent.click(dismissHintBtn);
    }

    // Switch language from top bar select
    const langSelect = screen.getByRole('combobox', { name: /Select language/i });
    fireEvent.change(langSelect, { target: { value: 'hi' } });
    await waitFor(() => {
      expect(generatePlanApi).toHaveBeenCalled();
    });
  });

  it('renders auth banners: session expired, email verification, pending merge, and status message', async () => {
    authState.sessionExpired = true;
    authState.emailVerificationNeeded = true;
    authState.pendingMerge = {
      accountProfile: DEFAULT_USER_PROFILE,
      accountPreferences: DEFAULT_USER_PREFERENCES,
    };
    authState.authStatusMessage = 'Test status banner message';

    render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    expect(screen.getByText(/Your sign-in session expired/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sign in again/i }));

    expect(screen.getByText(/Please verify your email address/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Resend verification email/i }));
    expect(authState.resendVerificationEmail).toHaveBeenCalled();

    expect(screen.getByText(/We found guest profile & preferences on this device/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Merge guest data into account/i }));
    expect(authState.resolveGuestMerge).toHaveBeenCalledWith('prefer_guest');

    fireEvent.click(screen.getByRole('button', { name: /Use saved account data/i }));
    expect(authState.resolveGuestMerge).toHaveBeenCalledWith('prefer_account');

    expect(screen.getByText('Test status banner message')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Dismiss status message/i));
    expect(authState.clearAuthStatus).toHaveBeenCalled();
  });

  it('renders signed-in profile menu and menu actions', async () => {
    authState.user = {
      uid: 'user-header-1',
      email: 'header@example.com',
      displayName: 'Header User',
      emailVerified: true,
    };

    render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    // Open user menu
    const userMenuBtn = screen.getByRole('button', { name: /Header User/i });
    fireEvent.click(userMenuBtn);

    // Click Settings from menu
    const menuSettings = screen.getByRole('menuitem', { name: /Settings/i });
    fireEvent.click(menuSettings);
    expect(screen.getByRole('heading', { level: 1, name: /Preferences & Accessibility/i })).toBeInTheDocument();

    // Go back
    fireEvent.click(screen.getByRole('button', { name: /Back to Assistant/i }));

    // Open menu again and click Sign Out
    fireEvent.click(screen.getByRole('button', { name: /Header User/i }));
    const menuSignOut = screen.getByRole('menuitem', { name: /Sign out/i });
    fireEvent.click(menuSignOut);
    expect(authState.signOutUser).toHaveBeenCalled();
  });

  it('handles air error and plan error retry states', async () => {
    (fetchLiveAirApi as any).mockRejectedValueOnce(new Error('Sensors offline in Delhi'));

    render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    const demoBtn = screen.getAllByRole('button', { name: /Working Commuter · Delhi/i })[0];
    fireEvent.click(demoBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/Sensors offline in Delhi/i)).toBeInTheDocument();

    // Click retry air
    (fetchLiveAirApi as any).mockResolvedValueOnce(SAMPLE_SNAPSHOT);
    const retryBtn = screen.getByRole('button', { name: /Retry live data/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText(/Today's Verdict/i)).toBeInTheDocument();
    });
  });

  it('handles plan error and retry', async () => {
    (generatePlanApi as any).mockRejectedValueOnce(new Error('AI generation overloaded'));

    render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    const demoBtn = screen.getAllByRole('button', { name: /Working Commuter · Delhi/i })[0];
    fireEvent.click(demoBtn);

    await waitFor(() => {
      expect(screen.getByText(/AI generation overloaded/i)).toBeInTheDocument();
    });

    // Click retry plan
    (generatePlanApi as any).mockResolvedValueOnce({
      airSnapshot: SAMPLE_SNAPSHOT,
      plan: SAMPLE_PLAN,
      modelUsed: 'gemini',
    });
    const retryPlanBtn = screen.getByRole('button', { name: /Retry advice generation/i });
    fireEvent.click(retryPlanBtn);

    await waitFor(() => {
      expect(screen.getByText(/Today's Verdict/i)).toBeInTheDocument();
    });
  });

  it('handles footer navigation and tour replay', () => {
    render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    // Click Help in footer
    const footerHelp = screen.getByRole('button', { name: /^Help & Guide$/i });
    fireEvent.click(footerHelp);
    expect(screen.getByRole('heading', { level: 1, name: /Help & Guide/i })).toBeInTheDocument();

    // In HelpPage, click a demo scenario button to trigger onTryDemo
    const helpDemoBtn = screen.getAllByRole('button', { name: /Try this scenario/i })[0];
    if (helpDemoBtn) fireEvent.click(helpDemoBtn);

    // If still in HelpPage or back, navigate back if button present
    const backBtn = screen.queryByRole('button', { name: /Back to Assistant/i });
    if (backBtn) fireEvent.click(backBtn);

    // Click Reset tour in footer
    const footerResetTour = screen.getByRole('button', { name: /Restart onboarding tour/i });
    fireEvent.click(footerResetTour);
  });

  it('covers tour welcome modal start and skip interactions', () => {
    // When tourCompleted is false, welcome modal renders
    render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    // Click "Take the tour"
    const startTourBtn = screen.getByRole('button', { name: /Take the tour/i });
    fireEvent.click(startTourBtn);

    // Click "Skip" on the coachmark
    const skipBtn = screen.getAllByRole('button', { name: /^Skip$/i })[0];
    if (skipBtn) fireEvent.click(skipBtn);
  });

  it('covers toggle save location in LocationPicker when signed in', async () => {
    authState.user = {
      uid: 'u-save-loc',
      email: 'saveloc@example.com',
      emailVerified: true,
      displayName: 'Save Loc User',
    };

    render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    // Click demo to select a location
    const demoBtn = screen.getAllByRole('button', { name: /Working Commuter · Delhi/i })[0];
    fireEvent.click(demoBtn);

    await waitFor(() => {
      expect(screen.getByText(/Today's Verdict/i)).toBeInTheDocument();
    });

    // In LocationPicker, find the save location button "Save (0/5)"
    const saveLocBtn = screen.getByRole('button', { name: /Save \(\d+\/5\)/i });
    fireEvent.click(saveLocBtn);
    expect(authState.toggleSavedLocation).toHaveBeenCalled();
  });

  it('handles font adjustment, theme toggles, profile menu Escape and outside click', () => {
    authState.user = {
      uid: 'u-toggle',
      email: 'toggle@example.com',
      displayName: 'Toggle User',
      emailVerified: true,
    };

    render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    // Font step buttons
    const incFont = screen.getByRole('button', { name: /Increase font size/i });
    fireEvent.click(incFont);
    const decFont = screen.getByRole('button', { name: /Decrease font size/i });
    fireEvent.click(decFont);

    // Theme toggle button
    const themeBtn = screen.getByRole('button', { name: /Switch to (light|dark) theme/i });
    fireEvent.click(themeBtn);

    // Profile menu open and Escape key
    const userBtn = screen.getByRole('button', { name: /Toggle User/i });
    fireEvent.click(userBtn);
    expect(screen.getByRole('menuitem', { name: /Sign out/i })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    // Open profile menu again and click outside
    fireEvent.click(userBtn);
    fireEvent.mouseDown(document.body);
  });

  it('handles notification interactions and test alert dispatch', async () => {
    const testNotif = {
      id: 'notif-1',
      title: 'Winter Smog Alert',
      body: 'AQI crossed 300 in Anand Vihar',
      reason: 'Breached poor threshold',
      severity: 'severe' as const,
      sourceName: 'CPCB',
      dataTimestampIso: new Date().toISOString(),
      createdAtIso: new Date().toISOString(),
      read: false,
    };

    window.localStorage.setItem('uaqa_notifications_v1', JSON.stringify([testNotif]));

    render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    // Open notification center via bell button
    const bellBtn = screen.getByRole('button', { name: /^Notifications/i });
    fireEvent.click(bellBtn);

    expect(screen.getByText(/Winter Smog Alert/i)).toBeInTheDocument();

    // Mark as read
    const readBtn = screen.getByRole('button', { name: /Mark "Winter Smog Alert" as read/i });
    fireEvent.click(readBtn);

    // Open alert settings from notification center
    const manageBtn = screen.getByRole('button', { name: /Manage alert thresholds/i });
    fireEvent.click(manageBtn);
    expect(screen.getByRole('heading', { level: 1, name: /Preferences & Accessibility/i })).toBeInTheDocument();
  });

  it('handles settings export, account delete modal, and test alert trigger', async () => {
    authState.user = {
      uid: 'u-settings-test',
      email: 'settings@example.com',
      displayName: 'Settings Tester',
      emailVerified: true,
    };

    // Mock global fetch for test-alert endpoint
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/user/test-alert')) {
        return {
          ok: true,
          json: async () => ({
            notification: {
              id: 'n-test-alert',
              title: 'Test Air Alert',
              body: 'Test alert body',
              reason: 'Manual test',
              severity: 'info',
              sourceName: 'CPCB',
              dataTimestampIso: new Date().toISOString(),
              createdAtIso: new Date().toISOString(),
              read: false,
            },
          }),
        } as any;
      }
      return originalFetch ? originalFetch(url) : ({} as any);
    });

    render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    // Navigate to settings via user menu
    const userBtn = screen.getByRole('button', { name: /Settings Tester/i });
    fireEvent.click(userBtn);
    const menuSettings = screen.getByRole('menuitem', { name: /Settings/i });
    fireEvent.click(menuSettings);

    // Export account data
    const exportBtn = screen.getByRole('button', { name: /Export my account data/i });
    fireEvent.click(exportBtn);
    expect(authState.exportAccountData).toHaveBeenCalled();

    // Trigger test alert in settings before deleting account
    const testAlertBtn = screen.getByRole('button', { name: /Send test alert/i });
    fireEvent.click(testAlertBtn);

    // Delete account modal: open and cancel
    const deleteBtn = screen.getByRole('button', { name: /Delete my account and data/i });
    fireEvent.click(deleteBtn);
    expect(screen.getByText(/Permanently delete your account, saved locations/i)).toBeInTheDocument();

    const cancelDeleteBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelDeleteBtn);

    // Delete account modal: open and confirm
    const deleteBtn2 = screen.getByRole('button', { name: /Delete my account and data/i });
    fireEvent.click(deleteBtn2);
    const confirmDeleteBtn = screen.getByRole('button', { name: /Yes, delete permanently/i });
    fireEvent.click(confirmDeleteBtn);
    expect(authState.deleteAccountAndData).toHaveBeenCalled();

    global.fetch = originalFetch;
  });

  it('handles geolocation and planner tab switching', async () => {
    // Mock navigator.geolocation
    const originalGeo = navigator.geolocation;
    const mockGetCurrentPosition = vi.fn((success: any) => {
      success({
        coords: { latitude: 28.6139, longitude: 77.209 },
      });
    });
    (navigator as any).geolocation = { getCurrentPosition: mockGetCurrentPosition };

    const map = new Map<string, string>();
    map.set(
      'uaqa_preferences_v2',
      JSON.stringify({
        ...DEFAULT_USER_PREFERENCES,
        useCurrentLocationOnOpen: true,
        tourCompleted: true,
        tourVersion: 1,
        seenHints: [],
      })
    );
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) => map.get(k) ?? null);

    render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    await waitFor(() => {
      expect(mockGetCurrentPosition).toHaveBeenCalled();
      expect(screen.getByText(/Today's Verdict/i)).toBeInTheDocument();
    });

    // Test DailyPlanner period switching
    const afternoonTab = screen.getByRole('tab', { name: /Afternoon/i });
    fireEvent.click(afternoonTab);
    expect(screen.getByText(/Slight midday dispersion/i)).toBeInTheDocument();

    const eveningTab = screen.getByRole('tab', { name: /Evening/i });
    fireEvent.click(eveningTab);
    expect(screen.getByText(/Night inversion drops back down/i)).toBeInTheDocument();

    // Test why hint dismiss
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Got it/i })).toBeInTheDocument();
    });
    const dismissHintBtn = screen.getByRole('button', { name: /Got it/i });
    fireEvent.click(dismissHintBtn);

    // Test update personalized plan in ProfilePanel
    const updatePlanBtn = screen.getByRole('button', { name: /Update personalized plan/i });
    fireEvent.click(updatePlanBtn);

    (navigator as any).geolocation = originalGeo;
  });

  it('covers App notification center onMarkAllRead and onClearAll', () => {
    const sampleNotifs = [
      {
        id: 'n-test-1',
        title: 'Severe AQI Alert',
        body: 'PM2.5 above safe limits.',
        reason: 'Smog peak',
        severity: 'high',
        sourceName: 'CPCB',
        dataTimestampIso: new Date().toISOString(),
        createdAtIso: new Date().toISOString(),
        read: false,
      },
    ];
    window.localStorage.setItem('uaqa_notifications_v1', JSON.stringify(sampleNotifs));

    render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    // Open notifications
    const bellBtn = screen.getByRole('button', { name: /Notifications/i });
    fireEvent.click(bellBtn);

    // Mark all read
    const markReadBtn = screen.queryByRole('button', { name: /Mark all read/i });
    if (markReadBtn) fireEvent.click(markReadBtn);

    // Clear all notifications
    const clearBtn = screen.getByRole('button', { name: /Clear all notifications/i });
    fireEvent.click(clearBtn);
  });

  it('covers App LoginPage onOpenSettings navigation', () => {
    window.history.pushState(null, '', '#login');
    authState.user = {
      uid: 'u-login-test',
      email: 'test@example.com',
      emailVerified: true,
      displayName: 'Test User',
    };

    render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    const openSettingsBtn = screen.getByRole('button', { name: /Open Settings/i });
    fireEvent.click(openSettingsBtn);
  });

  it('covers App hashchange, corrupted notifications JSON, and cloud notification merging', () => {
    // 1. Corrupted notification json (line 165)
    window.localStorage.setItem('uaqa_notifications_v1', '{invalid-json');

    // 2. Cloud notifications merging (lines 189-195)
    authState.user = {
      uid: 'u-cloud-sync',
      email: 'cloud@example.com',
      emailVerified: true,
      displayName: 'Cloud User',
    };
    authState.cloudLoaded = true;
    authState.emailVerificationNeeded = false;
    authState.cloudNotifications = [
      {
        id: 'cn-1',
        title: 'Cloud Alert 1',
        body: 'Cloud air alert body',
        reason: 'CPCB',
        severity: 'high',
        sourceName: 'CPCB',
        dataTimestampIso: new Date().toISOString(),
        createdAtIso: '2026-11-25T10:00:00.000Z',
        read: false,
      },
      {
        id: 'cn-2',
        title: 'Cloud Alert 2',
        body: 'Cloud air alert body 2',
        reason: 'CPCB',
        severity: 'info',
        sourceName: 'CPCB',
        dataTimestampIso: new Date().toISOString(),
        createdAtIso: '2026-11-25T11:00:00.000Z',
        read: false,
      },
    ];

    const { unmount } = render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    // Clear notifications or mark all read to trigger persistNotifications with user (line 207)
    const bellBtn = screen.getByRole('button', { name: /Notifications/i });
    fireEvent.click(bellBtn);
    const clearBtn = screen.getByRole('button', { name: /Clear all notifications/i });
    fireEvent.click(clearBtn);

    // 3. hashchange listener (line 152)
    window.location.hash = '#settings';
    window.dispatchEvent(new Event('hashchange'));

    unmount();
  });

  it('covers App navigation buttons, test alert API success and fallback', async () => {
    // 1. Guest view on Settings: onOpenSignIn (line 544), accountPrivacySlot sign in (line 610), app title (line 634), assistant nav (line 646)
    window.location.hash = '#settings';
    authState.user = null;
    authState.cloudLoaded = false;
    authState.getIdToken = vi.fn(async () => null);

    const { unmount, rerender } = render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    // Click "Send test alert" as guest to hit lines 518-531
    const guestTestAlertBtn = screen.getByRole('button', { name: /Send test alert/i });
    fireEvent.click(guestTestAlertBtn);

    await waitFor(() => {
      expect(screen.queryByText('Sending...')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Send test alert/i })).not.toBeDisabled();
    });

    // Click "Sign in for scheduled alerts" in AlertsSettingsPanel (line 544)
    const alertsSignInBtn = screen.getByRole('button', { name: /Sign in for scheduled alerts/i });
    fireEvent.click(alertsSignInBtn);

    // Navigate back to Settings via hashchange and click "Sign in" in accountPrivacySlot (line 610)
    window.location.hash = '#settings';
    window.dispatchEvent(new Event('hashchange'));
    rerender(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );
    const privacySignInBtn = screen.getAllByRole('button', { name: /^Sign in$/i })[1];
    fireEvent.click(privacySignInBtn);

    // Click app title button (line 634)
    const appTitleBtn = screen.getByRole('button', { name: /^Urban Air Quality Assistant$/i });
    fireEvent.click(appTitleBtn);

    // Click Assistant navigation button (line 646)
    const assistantNavBtn = screen.getByRole('button', { name: /^Assistant$/i });
    fireEvent.click(assistantNavBtn);

    // Navigate to Settings view via header settings button
    const headerSettingsBtn = screen.getByRole('button', { name: /Settings/i });
    fireEvent.click(headerSettingsBtn);

    // 2. handleSendTestAlert API success (lines 510-514) and addNotificationItem cloud sync (line 219)
    authState.user = {
      uid: 'u-alert-test',
      email: 'alert@example.com',
      emailVerified: true,
      displayName: 'Alert Tester',
    };
    authState.cloudLoaded = true;
    authState.emailVerificationNeeded = false;
    authState.getIdToken = vi.fn(async () => 'valid-fcm-token');

    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        notification: {
          id: 'test-alert-notif-1',
          title: 'Test Air Alert · Delhi',
          body: 'Alerts working!',
          reason: 'Test',
          severity: 'info',
          sourceName: 'UAQA',
          dataTimestampIso: new Date().toISOString(),
          createdAtIso: new Date().toISOString(),
          read: false,
        },
      }),
    })) as any;

    rerender(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    // Click "Send test alert"
    const sendTestAlertBtn = screen.getByRole('button', { name: /Send test alert/i });
    fireEvent.click(sendTestAlertBtn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.queryByText('Sending...')).not.toBeInTheDocument();
    });

    // 3. handleSendTestAlert API failure / fallback branch (lines 518-531)
    authState.getIdToken = vi.fn(async () => null);
    const sendTestAlertBtn2 = screen.getByRole('button', { name: /Send test alert/i });
    fireEvent.click(sendTestAlertBtn2);

    await waitFor(() => {
      expect(screen.queryByText('Sending...')).not.toBeInTheDocument();
    });

    globalThis.fetch = origFetch;
    unmount();
  });

  it('covers App geolocation error with defaultLocation and useCurrentLocationOnOpen false', async () => {
    // 1. useCurrentLocationOnOpen=true, geolocation fails with error callback -> loads defaultLocation (lines 384-385)
    window.localStorage.setItem(
      'uaqa_preferences_v2',
      JSON.stringify({
        ...DEFAULT_USER_PREFERENCES,
        useCurrentLocationOnOpen: true,
        defaultLocation: SAMPLE_LOC,
      })
    );

    const origGeo = navigator.geolocation;
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((_success, error) => {
          if (error) error({ code: 1, message: 'User denied geolocation' });
        }),
      },
      configurable: true,
      writable: true,
    });

    const { unmount } = render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Delhi')).toBeInTheDocument();
    });
    unmount();

    // 2. Geolocation success callback throws / reverseGeocodeApi failure -> loads defaultLocation (lines 378-379)
    const apiClient = await import('../src/lib/apiClient.ts');
    vi.spyOn(apiClient, 'reverseGeocodeApi').mockRejectedValueOnce(new Error('Reverse geocode failed'));

    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((success) => {
          if (success) success({ coords: { latitude: 28.6, longitude: 77.2 } } as any);
        }),
      },
      configurable: true,
      writable: true,
    });

    const r2 = render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Delhi')).toBeInTheDocument();
    });
    r2.unmount();

    // 3. useCurrentLocationOnOpen=false with defaultLocation (line 394)
    window.localStorage.setItem(
      'uaqa_preferences_v2',
      JSON.stringify({
        ...DEFAULT_USER_PREFERENCES,
        useCurrentLocationOnOpen: false,
        defaultLocation: SAMPLE_LOC,
      })
    );

    const r3 = render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Delhi')).toBeInTheDocument();
    });
    r3.unmount();

    Object.defineProperty(navigator, 'geolocation', {
      value: origGeo,
      configurable: true,
      writable: true,
    });
  });

  it('covers App handleSelectLocation and handleUpdatePlanOnly error catch', async () => {
    const apiClient = await import('../src/lib/apiClient.ts');
    vi.spyOn(apiClient, 'searchLocationsApi').mockResolvedValueOnce([SAMPLE_LOC]);
    vi.spyOn(apiClient, 'fetchLiveAirApi').mockResolvedValueOnce(SAMPLE_SNAPSHOT);

    const { unmount } = render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    // 1. handleSelectLocation (lines 399-403)
    const searchInput = screen.getByRole('searchbox');
    fireEvent.change(searchInput, { target: { value: 'Delhi' } });
    fireEvent.submit(searchInput.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Delhi')).toBeInTheDocument();
    });

    // 2. handleUpdatePlanOnly error catch (lines 436-437)
    vi.spyOn(apiClient, 'generatePlanApi').mockRejectedValueOnce(new Error('Plan generation timeout'));
    const updatePlanBtn = screen.getByRole('button', { name: /update|personal air plan/i });
    fireEvent.click(updatePlanBtn);

    await waitFor(() => {
      expect(screen.getByText(/Plan generation timeout/i)).toBeInTheDocument();
    });

    unmount();
  });

  it('covers remaining App.tsx branches: help/settings toggles, system theme, dedupe, profile menu, stale requests, and non-Error catches', async () => {
    const apiClient = await import('../src/lib/apiClient.ts');

    // 1. #help initial route (line 67), non-array notifications JSON (line 163), theme='system' with dark OS (line 458)
    const origMM1 = window.matchMedia;
    window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as any;
    window.localStorage.setItem('uaqa_notifications_v1', '{}');
    window.localStorage.setItem(
      'uaqa_preferences_v2',
      JSON.stringify({ ...DEFAULT_USER_PREFERENCES, theme: 'system', useCurrentLocationOnOpen: false })
    );
    window.location.hash = '#help';
    authState.user = { uid: 'u-null-meta', email: null, displayName: null, emailVerified: true };
    authState.cloudLoaded = false;

    const rHelp = render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );
    // Toggle Help off -> assistant (line 775)
    fireEvent.click(screen.getByRole('button', { name: /^Help$/i }));
    // Toggle Settings on then off (line 791)
    fireEvent.click(screen.getByRole('button', { name: /^Settings$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Settings$/i }));

    // handleSwitchLanguage with same language ('en') and without selectedLocation (lines 446, 448)
    const langSelect = screen.getByLabelText(/Select language/i);
    fireEvent.change(langSelect, { target: { value: 'en' } });
    fireEvent.change(langSelect, { target: { value: 'hi' } });
    fireEvent.change(langSelect, { target: { value: 'en' } });

    // Profile menu with null email/displayName (lines 815, 826), inside click (line 273), non-Escape keydown (line 278)
    const profileBtn = screen.getByRole('button', { name: /Account/i });
    fireEvent.click(profileBtn);
    fireEvent.mouseDown(screen.getByText('Signed in'));
    fireEvent.keyDown(document, { key: 'Enter' });
    rHelp.unmount();
    window.matchMedia = origMM1;

    // 2. Cloud notifications with duplicate id (line 192) & marking 1 of 2 read (line 763)
    window.location.hash = '';
    window.localStorage.setItem(
      'uaqa_notifications_v1',
      JSON.stringify([
        { id: 'dup-1', title: 'Local1', body: 'B1', reason: 'R', severity: 'info', sourceName: 'S', dataTimestampIso: new Date().toISOString(), createdAtIso: '2026-11-25T09:00:00.000Z', read: false },
        { id: 'keep-2', title: 'Local2', body: 'B2', reason: 'R', severity: 'info', sourceName: 'S', dataTimestampIso: new Date().toISOString(), createdAtIso: '2026-11-25T08:00:00.000Z', read: false },
      ])
    );
    authState.cloudLoaded = true;
    authState.emailVerificationNeeded = false;
    authState.cloudNotifications = [
      { id: 'dup-1', title: 'CloudDup', body: 'B1', reason: 'R', severity: 'info', sourceName: 'S', dataTimestampIso: new Date().toISOString(), createdAtIso: '2026-11-25T09:00:00.000Z', read: false },
    ];
    const rNotif = render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /Notifications/i }));
    const markReadBtns = screen.getAllByRole('button', { name: /as read/i });
    if (markReadBtns[0]) fireEvent.click(markReadBtns[0]);
    rNotif.unmount();

    // 3. Threshold alert branches (241, 244, 248, 256, 258), non-Error rejections (330, 353, 437), null result (344, 347, 429, 432)
    authState.alertPrefs = { ...authState.alertPrefs, thresholdAqi: 100, sensitiveMode: false };
    vi.spyOn(apiClient, 'searchLocationsApi').mockResolvedValue([SAMPLE_LOC]);
    vi.spyOn(apiClient, 'fetchLiveAirApi')
      .mockResolvedValueOnce({ ...SAMPLE_SNAPSHOT, aqi: 50, cpcbCategory: 'good' }) // below threshold (241)
      .mockResolvedValueOnce({ ...SAMPLE_SNAPSHOT, aqi: 420, cpcbCategory: 'severe', pm25: null }) // severe + pm25=null (248, 256)
      .mockResolvedValueOnce({ ...SAMPLE_SNAPSHOT, aqi: 420, cpcbCategory: 'severe', pm25: null }) // dedupe hit (244)
      .mockResolvedValueOnce({ ...SAMPLE_SNAPSHOT, aqi: 150, cpcbCategory: 'moderate' }) // moderate (258)
      .mockRejectedValueOnce('plain-air-err'); // non-Error air catch (330)

    vi.spyOn(apiClient, 'generatePlanApi')
      .mockResolvedValueOnce(null as any) // i=0: null result (344, 347)
      .mockRejectedValueOnce('plain-plan-err') // i=1: non-Error plan catch (353)
      .mockResolvedValueOnce(null as any) // i=2
      .mockResolvedValueOnce(null as any) // i=3
      .mockRejectedValueOnce('plain-update-err') // upBtn 1: non-Error handleUpdatePlanOnly catch (437)
      .mockResolvedValueOnce(null as any); // upBtn 2: null result in handleUpdatePlanOnly (429, 432)

    const rFlow = render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );
    const sb = screen.getByRole('searchbox');
    for (let i = 0; i < 4; i++) {
      fireEvent.change(sb, { target: { value: 'Delhi' } });
      fireEvent.submit(sb.closest('form')!);
      await waitFor(() => expect(apiClient.fetchLiveAirApi).toHaveBeenCalledTimes(i + 1));
    }
    // Trigger non-Error plan update & null result plan update
    const upBtn = screen.getByRole('button', { name: /update|personal air plan/i });
    fireEvent.click(upBtn);
    await waitFor(() => expect(screen.getByText(/Could not refresh personalized plan/i)).toBeInTheDocument());
    fireEvent.click(upBtn);

    // Non-Error air error
    fireEvent.change(sb, { target: { value: 'Delhi' } });
    fireEvent.submit(sb.closest('form')!);
    await waitFor(() => expect(screen.getByText(/Live air quality data is temporarily unavailable/i)).toBeInTheDocument());
    rFlow.unmount();

    // 4. Stale-request race guards (324, 328, 343, 351, 356, 428, 436, 439) + geo after user select (372, 375)
    let resolveSlowAir!: (v: any) => void;
    let rejectSlowAir!: (e: any) => void;
    let resolveSlowPlan!: (v: any) => void;
    let rejectSlowPlan!: (e: any) => void;
    let resolveSlowGeo!: (v: any) => void;

    window.localStorage.setItem(
      'uaqa_preferences_v2',
      JSON.stringify({ ...DEFAULT_USER_PREFERENCES, useCurrentLocationOnOpen: true, defaultLocation: SAMPLE_LOC })
    );
    const origGeo = navigator.geolocation;
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((ok) => {
          ok({ coords: { latitude: 28.6, longitude: 77.2 } });
        }),
      },
      configurable: true,
      writable: true,
    });
    vi.spyOn(apiClient, 'reverseGeocodeApi').mockImplementationOnce(
      () => new Promise((r) => { resolveSlowGeo = r; })
    );
    (apiClient.fetchLiveAirApi as any).mockClear();
    vi.spyOn(apiClient, 'fetchLiveAirApi')
      .mockImplementationOnce(() => new Promise((r) => { resolveSlowAir = r; }))
      .mockImplementationOnce(() => new Promise((_r, rej) => { rejectSlowAir = rej; }))
      .mockResolvedValue(SAMPLE_SNAPSHOT);
    vi.spyOn(apiClient, 'generatePlanApi')
      .mockImplementationOnce(() => new Promise((r) => { resolveSlowPlan = r; }))
      .mockImplementationOnce(() => new Promise((_r, rej) => { rejectSlowPlan = rej; }))
      .mockResolvedValue({ airSnapshot: SAMPLE_SNAPSHOT, plan: SAMPLE_PLAN, modelUsed: 'g' } as any);

    const rRace = render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );
    const sbRace = screen.getByRole('searchbox');
    // Request 1 (slow air resolve) -> superseded by Request 2 (slow air reject) -> superseded by Request 3 (fast air, slow plan resolve)
    fireEvent.change(sbRace, { target: { value: 'Delhi' } });
    fireEvent.submit(sbRace.closest('form')!);
    fireEvent.change(sbRace, { target: { value: 'Delhi' } });
    fireEvent.submit(sbRace.closest('form')!);
    fireEvent.change(sbRace, { target: { value: 'Delhi' } });
    fireEvent.submit(sbRace.closest('form')!);
    await waitFor(() => expect(apiClient.fetchLiveAirApi).toHaveBeenCalledTimes(3));
    resolveSlowAir(SAMPLE_SNAPSHOT);
    rejectSlowAir(new Error('stale air'));
    resolveSlowGeo(SAMPLE_LOC);

    // Now Request 3 is waiting on slow plan -> supersede with Request 4 (fast air, slow plan reject) -> supersede with Request 5 (fast)
    fireEvent.change(sbRace, { target: { value: 'Delhi' } });
    fireEvent.submit(sbRace.closest('form')!);
    await waitFor(() => expect(apiClient.fetchLiveAirApi).toHaveBeenCalledTimes(4));
    fireEvent.change(sbRace, { target: { value: 'Delhi' } });
    fireEvent.submit(sbRace.closest('form')!);
    await waitFor(() => expect(apiClient.fetchLiveAirApi).toHaveBeenCalledTimes(5));
    resolveSlowPlan({ airSnapshot: SAMPLE_SNAPSHOT, plan: SAMPLE_PLAN });
    rejectSlowPlan(new Error('stale plan'));

    // Also supersede handleUpdatePlanOnly via language switch (428, 436, 439)
    let resolveUp1!: (v: any) => void;
    let rejectUp2!: (e: any) => void;
    vi.spyOn(apiClient, 'generatePlanApi')
      .mockImplementationOnce(() => new Promise((r) => { resolveUp1 = r; }))
      .mockImplementationOnce(() => new Promise((_r, rej) => { rejectUp2 = rej; }))
      .mockResolvedValueOnce({ airSnapshot: SAMPLE_SNAPSHOT, plan: SAMPLE_PLAN, modelUsed: 'g' } as any);
    const langRace = screen.getByLabelText(/Select language/i);
    fireEvent.change(langRace, { target: { value: 'hi' } });
    fireEvent.change(langRace, { target: { value: 'mr' } });
    fireEvent.change(langRace, { target: { value: 'ta' } });
    resolveUp1({ airSnapshot: SAMPLE_SNAPSHOT, plan: SAMPLE_PLAN });
    rejectUp2(new Error('stale up'));
    rRace.unmount();
    delete (navigator as any).geolocation;

    // 5. handleSendTestAlert with fetch returning { ok: false } (line 510) + theme='system' without matchMedia (line 458) + async geo callbacks after user selection (375, 381, 387)
    const origMatchMedia = window.matchMedia;
    (window as any).matchMedia = undefined;
    window.localStorage.setItem(
      'uaqa_preferences_v2',
      JSON.stringify({ ...DEFAULT_USER_PREFERENCES, theme: 'system', useCurrentLocationOnOpen: false })
    );
    window.location.hash = '#settings';
    authState.getIdToken = vi.fn(async () => 'tok-ok');
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({ ok: false })) as any;
    const rAlertFail = render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /Send test alert/i }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    globalThis.fetch = origFetch;
    rAlertFail.unmount();
    window.matchMedia = origMatchMedia;

    // 6. Async geolocation callbacks firing AFTER userSelectedLocationRef.current = true (lines 375, 381, 387)
    window.location.hash = '';
    window.localStorage.setItem(
      'uaqa_preferences_v2',
      JSON.stringify({ ...DEFAULT_USER_PREFERENCES, useCurrentLocationOnOpen: true, defaultLocation: SAMPLE_LOC })
    );
    let geoOkCb!: (pos: any) => void;
    let geoErrCb!: (err: any) => void;
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((ok, err) => {
          geoOkCb = ok;
          geoErrCb = err;
        }),
      },
      configurable: true,
      writable: true,
    });
    vi.spyOn(apiClient, 'fetchLiveAirApi').mockResolvedValue(SAMPLE_SNAPSHOT);
    vi.spyOn(apiClient, 'generatePlanApi').mockResolvedValue({ airSnapshot: SAMPLE_SNAPSHOT, plan: SAMPLE_PLAN, modelUsed: 'g' } as any);

    const rGeoLate = render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );
    const sbLate = screen.getByRole('searchbox');
    fireEvent.change(sbLate, { target: { value: 'Delhi' } });
    fireEvent.submit(sbLate.closest('form')!);
    await waitFor(() => expect(screen.getByText('Delhi')).toBeInTheDocument());

    geoOkCb({ coords: { latitude: 28.6, longitude: 77.2 } });
    geoErrCb({ code: 2 });

    let rejectLateRev!: (e: any) => void;
    vi.spyOn(apiClient, 'reverseGeocodeApi').mockImplementationOnce(
      () => new Promise((_r, rej) => { rejectLateRev = rej; })
    );
    const rGeoCatch = render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );
    geoOkCb({ coords: { latitude: 28.6, longitude: 77.2 } });
    const sbCatch = rGeoCatch.container.querySelector('input[type="search"]')!;
    fireEvent.change(sbCatch, { target: { value: 'Delhi' } });
    fireEvent.submit(sbCatch.closest('form')!);
    rejectLateRev(new Error('late rev fail'));
    await waitFor(() => expect(apiClient.fetchLiveAirApi).toHaveBeenCalled());
    rGeoCatch.unmount();
    rGeoLate.unmount();
    delete (navigator as any).geolocation;
  });
});
