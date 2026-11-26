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
  type NotificationItem,
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
    pendingMerge: null,
    authStatusMessage: null,
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

import { LoginPage } from '../src/components/LoginPage.tsx';
import { SettingsPage } from '../src/components/SettingsPage.tsx';
import { CoachmarkTour } from '../src/components/CoachmarkTour.tsx';
import { LocationPicker } from '../src/components/LocationPicker.tsx';
import { AlertsSettingsPanel } from '../src/components/AlertsSettingsPanel.tsx';
import { NotificationCenter } from '../src/components/NotificationCenter.tsx';
import { ProfilePanel } from '../src/components/ProfilePanel.tsx';
import { HelpPage, extractYouTubeVideoId } from '../src/components/HelpPage.tsx';
import { GroundedChat } from '../src/components/GroundedChat.tsx';
import { DailyPlanner } from '../src/components/DailyPlanner.tsx';
import { AirSnapshot } from '../src/components/AirSnapshot.tsx';
import { ErrorBoundary } from '../src/components/ErrorBoundary.tsx';
import App from '../src/App.tsx';

import { I18nProvider } from '../src/i18n/I18nContext.tsx';
import { PreferencesProvider } from '../src/context/PreferencesContext.tsx';

beforeEach(() => {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock');
  window.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  document.documentElement.className = '';
  document.documentElement.lang = 'en';
  delete document.documentElement.dataset.textSize;
  authState.user = null;
});

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
    ventilationVerdict: 'keep_closed',
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
    sustainableTip: 'Car-pool or ride public transit to cut regional emissions.',
    why: 'Vehicular emissions account for ~30% of urban winter smoke.',
    emissionReductionEstimate: 'Estimate: 4.2 kg CO2 and 12 g PM saved per trip.',
    assumptionNote: 'Compared to a single-occupancy petrol car.',
  },
};

describe('LoginPage Deep Coverage', () => {
  it('covers signed-out mode: signin, signup, reset, google, and error mapping', async () => {
    authState.user = null;
    const onBack = vi.fn();
    const onOpenSettings = vi.fn();

    render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <LoginPage onBack={onBack} onOpenSettings={onOpenSettings} />
        </I18nProvider>
      </PreferencesProvider>
    );

    // Click back to assistant
    fireEvent.click(screen.getByRole('button', { name: /Back to Assistant/i }));
    expect(onBack).toHaveBeenCalled();

    // Click Continue with Google
    fireEvent.click(screen.getByRole('button', { name: /Continue with Google/i }));
    expect(authState.signInWithGoogle).toHaveBeenCalled();

    // Sign in form submit
    const emailInput = screen.getByLabelText(/Email address/i);
    const passInput = screen.getByLabelText(/Password/i);
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
    fireEvent.change(passInput, { target: { value: 'password123' } });

    fireEvent.submit(emailInput.closest('form')!);
    expect(authState.signInWithEmail).toHaveBeenCalledWith('user@example.com', 'password123');

    // Switch to Sign Up tab
    const signUpTab = screen.getByRole('tab', { name: /Create account/i });
    fireEvent.click(signUpTab);

    const nameInput = screen.getByLabelText(/Your name/i);
    fireEvent.change(nameInput, { target: { value: 'User Name' } });
    fireEvent.submit(nameInput.closest('form')!);
    expect(authState.signUpWithEmail).toHaveBeenCalledWith('user@example.com', 'password123', 'User Name');

    // Switch to Reset tab
    const resetTab = screen.getByRole('tab', { name: /Reset password/i });
    fireEvent.click(resetTab);
    fireEvent.submit(emailInput.closest('form')!);
    expect(authState.sendPasswordReset).toHaveBeenCalledWith('user@example.com');

    // Test error mapping via failed Google sign in
    authState.signInWithGoogle = vi.fn(async () => {
      throw new Error('popup-closed-by-user');
    });
    fireEvent.click(screen.getByRole('button', { name: /Continue with Google/i }));
  });

  it('covers signed-in view with user details, settings link, and sign out', () => {
    authState.user = {
      uid: 'u-12345',
      email: 'signedin@example.com',
      displayName: 'Signed In User',
      emailVerified: true,
    };
    const onBack = vi.fn();
    const onOpenSettings = vi.fn();

    render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <LoginPage onBack={onBack} onOpenSettings={onOpenSettings} />
        </I18nProvider>
      </PreferencesProvider>
    );

    expect(screen.getByText('You are signed in')).toBeInTheDocument();
    expect(screen.getByText(/signedin@example\.com/)).toBeInTheDocument();

    // Click Go to Settings
    fireEvent.click(screen.getByRole('button', { name: /Open Settings/i }));
    expect(onOpenSettings).toHaveBeenCalled();

    // Click Sign Out
    fireEvent.click(screen.getByRole('button', { name: /Sign out/i }));
    expect(authState.signOutUser).toHaveBeenCalled();
  });
});

describe('SettingsPage Deep Coverage', () => {
  it('covers all settings sections: export, reset tour, language, theme, font size, units, scales, advice detail, and tone', () => {
    const onBack = vi.fn();
    const onStartTour = vi.fn();

    render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <SettingsPage
            onBack={onBack}
            onStartTour={onStartTour}
            alertsSlot={<div data-testid="alertsSlot">Alerts</div>}
            accountPrivacySlot={<div data-testid="privacySlot">Privacy</div>}
          />
        </I18nProvider>
      </PreferencesProvider>
    );

    expect(screen.getByTestId('alertsSlot')).toBeInTheDocument();
    expect(screen.getByTestId('privacySlot')).toBeInTheDocument();

    // Back button
    fireEvent.click(screen.getByRole('button', { name: /Back to Assistant/i }));
    expect(onBack).toHaveBeenCalled();

    // Export button
    fireEvent.click(screen.getByRole('button', { name: /Export preferences & profile \(JSON\)/i }));
    expect(window.URL.createObjectURL).toHaveBeenCalled();

    // Restart tour button
    fireEvent.click(screen.getByRole('button', { name: /Restart onboarding tour/i }));
    expect(onStartTour).toHaveBeenCalled();

    // Language buttons: click Hindi
    fireEvent.click(screen.getByRole('button', { name: /हिन्दी/i }));

    // Units: Fahrenheit, Celsius
    fireEvent.click(screen.getByRole('button', { name: /°F/i }));
    fireEvent.click(screen.getByRole('button', { name: /°C/i }));

    // AQI scale: US EPA, CPCB
    fireEvent.click(screen.getByRole('button', { name: /US EPA/i }));
    fireEvent.click(screen.getByRole('button', { name: /CPCB \(India\)/i }));

    // Theme buttons: Dark, Light, System
    fireEvent.click(screen.getByRole('button', { name: /Dark/i }));
    fireEvent.click(screen.getByRole('button', { name: /Light/i }));
    fireEvent.click(screen.getByRole('button', { name: /System/i }));

    // Text size buttons: Large, Extra large, Normal
    fireEvent.click(screen.getByRole('button', { name: /^Large$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Extra large$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Normal$/i }));

    // Checkboxes
    const highContrastCb = screen.getByLabelText(/High contrast borders & text/i);
    fireEvent.click(highContrastCb);

    const reduceMotionCb = screen.getByLabelText(/Reduce motion & animations/i);
    fireEvent.click(reduceMotionCb);

    const showWhyCb = screen.getByLabelText(/Expand 'Why this advice\?' automatically/i);
    fireEvent.click(showWhyCb);

    // Advice detail: Concise, Detailed
    fireEvent.click(screen.getByRole('button', { name: /Concise/i }));
    fireEvent.click(screen.getByRole('button', { name: /Detailed/i }));

    // Advice tone: Plain language, Technical
    fireEvent.click(screen.getByRole('button', { name: /Technical/i }));
    fireEvent.click(screen.getByRole('button', { name: /Plain language/i }));

    // Default location select
    const locSelect = screen.getByLabelText(/Default location on open/i);
    fireEvent.change(locSelect, { target: { value: 'Mumbai' } });

    // Reset all preferences
    fireEvent.click(screen.getByRole('button', { name: /Reset all preferences/i }));
  });
});

describe('CoachmarkTour Geometry & Stepping Deep Coverage', () => {
  it('covers CoachmarkTour placement arrows (top, bottom, left, right) and step completion', () => {
    const onStartTour = vi.fn();
    const onCompleteOrSkip = vi.fn();

    // Create target element
    const targetEl = document.createElement('div');
    targetEl.id = 'tour-location-picker';
    document.body.appendChild(targetEl);

    const { rerender } = render(
      <I18nProvider language="en">
        <CoachmarkTour
          phase="active"
          isSignedIn={true}
          reduceMotion={false}
          onStartTour={onStartTour}
          onCompleteOrSkip={onCompleteOrSkip}
        />
      </I18nProvider>
    );

    // Test step navigation Next through all 7 steps
    for (let i = 1; i <= 6; i++) {
      const nextBtn = screen.getByRole('button', { name: /Next/i });
      fireEvent.click(nextBtn);
    }

    // Step 7 of 7: Finish button
    expect(screen.getByText('7 of 7')).toBeInTheDocument();
    const finishBtn = screen.getByRole('button', { name: /Done/i });
    fireEvent.click(finishBtn);
    expect(onCompleteOrSkip).toHaveBeenCalled();

    document.body.removeChild(targetEl);
  });
});

describe('LocationPicker, AlertsSettingsPanel, and ProfilePanel Deep Coverage', () => {
  it('covers LocationPicker search, quick cities, saved locations, and geolocation', async () => {
    const onSelectLocation = vi.fn();
    const onToggleSaved = vi.fn();

    render(
      <I18nProvider language="en">
        <LocationPicker
          selectedLocation={SAMPLE_LOC}
          onSelectLocation={onSelectLocation}
          savedLocations={[SAMPLE_LOC]}
          onToggleSavedLocation={onToggleSaved}
        />
      </I18nProvider>
    );

    // Quick pick cities: click Mumbai
    const mumbaiBtn = screen.getByRole('button', { name: /Mumbai/i });
    fireEvent.click(mumbaiBtn);
    expect(onSelectLocation).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mumbai' }));

    // Search input typing
    const searchInput = screen.getByPlaceholderText(/Search any Indian city or locality/i);
    fireEvent.change(searchInput, { target: { value: 'Bengaluru' } });

    // Geolocation trigger
    const geoBtn = screen.getByRole('button', { name: /Use my location/i });
    fireEvent.click(geoBtn);
  });

  it('covers AlertsSettingsPanel inputs and toggles', async () => {
    const onUpdateAlertPrefs = vi.fn();
    const onToggleLocationAlert = vi.fn();
    const onSendTestAlert = vi.fn();

    render(
      <I18nProvider language="en">
        <AlertsSettingsPanel
          isSignedIn={true}
          emailVerified={true}
          alertPrefs={{ ...DEFAULT_ALERT_PREFS, enabled: true }}
          savedLocations={[{ ...SAMPLE_LOC, id: 'delhi', alertsEnabled: true }]}
          onUpdateAlertPrefs={onUpdateAlertPrefs}
          onToggleLocationAlert={onToggleLocationAlert}
          onSaveFcmToken={vi.fn()}
          onSendTestAlert={onSendTestAlert}
          onOpenSignIn={vi.fn()}
        />
      </I18nProvider>
    );

    // Toggle location alert
    const locCheckbox = screen.getByRole('checkbox', { name: 'Delhi' });
    fireEvent.click(locCheckbox);
    expect(onToggleLocationAlert).toHaveBeenCalledWith('delhi');

    // Toggle sensitive mode
    const sensitiveCheckbox = screen.getByRole('checkbox', { name: /Sensitive-group stricter alerts/i });
    fireEvent.click(sensitiveCheckbox);
    expect(onUpdateAlertPrefs).toHaveBeenCalled();

    // Toggle morning briefing
    const briefingCheckbox = screen.getByRole('checkbox', { name: /Daily morning air briefing/i });
    fireEvent.click(briefingCheckbox);
    expect(onUpdateAlertPrefs).toHaveBeenCalled();

    // Change threshold slider
    const slider = screen.getByRole('slider', { name: /CPCB AQI threshold/i });
    fireEvent.change(slider, { target: { value: '250' } });
    expect(onUpdateAlertPrefs).toHaveBeenCalled();

    // Toggle category change & recovery alerts
    const catChangeCheckbox = screen.getByRole('checkbox', {
      name: /Category change & recovery alerts/i,
    });
    fireEvent.click(catChangeCheckbox);
    expect(onUpdateAlertPrefs).toHaveBeenCalled();

    // Daily cap select
    const capSelect = screen.getByLabelText(/Max alerts per day/i);
    fireEvent.change(capSelect, { target: { value: '3' } });
    expect(onUpdateAlertPrefs).toHaveBeenCalledWith(expect.objectContaining({ dailyCap: 3 }));

    // Unsubscribe all
    const unsubBtn = screen.getByRole('button', { name: /Unsubscribe all/i });
    fireEvent.click(unsubBtn);
    expect(onUpdateAlertPrefs).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('covers ProfilePanel household and commute selections', () => {
    const onUpdateProfile = vi.fn();
    const onApplyDemo = vi.fn();

    render(
      <I18nProvider language="en">
        <ProfilePanel
          profile={DEFAULT_USER_PROFILE}
          onChangeProfile={onUpdateProfile}
          onApplyDemo={onApplyDemo}
        />
      </I18nProvider>
    );

    // Household type select
    const householdSelect = screen.getByLabelText(/Household type/i);
    fireEvent.change(householdSelect, { target: { value: 'family_with_kids' } });
    expect(onUpdateProfile).toHaveBeenCalledWith(expect.objectContaining({ householdType: 'family_with_kids' }));

    // Commute mode select
    const commuteSelect = screen.getByLabelText(/Commute mode/i);
    fireEvent.change(commuteSelect, { target: { value: 'metro_bus' } });
    expect(onUpdateProfile).toHaveBeenCalledWith(expect.objectContaining({ commuteMode: 'metro_bus' }));

    // Commute duration input
    const minutesInput = screen.getByLabelText(/Daily commute \(mins\)/i);
    fireEvent.change(minutesInput, { target: { value: '45' } });
    expect(onUpdateProfile).toHaveBeenCalledWith(expect.objectContaining({ commuteMinutes: 45 }));

    // Sensitivity toggle button
    fireEvent.click(screen.getByRole('button', { name: /^Asthma$/i }));
    expect(onUpdateProfile).toHaveBeenCalled();

    // One-click demo button
    fireEvent.click(screen.getByRole('button', { name: /Family with 2 Kids · Mumbai/i }));
    expect(onApplyDemo).toHaveBeenCalled();

    // Window type select
    const windowSelect = screen.getByLabelText(/Windows/i);
    fireEvent.change(windowSelect, { target: { value: 'sealed_ac' } });
    expect(onUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        homeSetup: expect.objectContaining({ windowType: 'sealed_ac' }),
      })
    );

    // Cooking fuel select
    const fuelSelect = screen.getByLabelText(/Cooking fuel/i);
    fireEvent.change(fuelSelect, { target: { value: 'induction' } });
    expect(onUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        homeSetup: expect.objectContaining({ cookingFuel: 'induction' }),
      })
    );

    // Checkboxes: Purifier, Exhaust fan, Plants
    const purifierCheckbox = screen.getByLabelText(/Have a HEPA air purifier at home/i);
    fireEvent.click(purifierCheckbox);
    expect(onUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        homeSetup: expect.objectContaining({ hasPurifier: true }),
      })
    );

    const exhaustCheckbox = screen.getByLabelText(/Kitchen exhaust fan \/ chimney installed/i);
    fireEvent.click(exhaustCheckbox);
    expect(onUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        homeSetup: expect.objectContaining({ hasExhaustFan: false }),
      })
    );

    const plantsCheckbox = screen.getByLabelText(/Keep indoor plants/i);
    fireEvent.click(plantsCheckbox);
    expect(onUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        homeSetup: expect.objectContaining({ indoorPlants: true }),
      })
    );

    // Indoor PM2.5 input
    const pm25Input = screen.getByLabelText(/Optional: Indoor purifier\/monitor PM2.5/i);
    fireEvent.change(pm25Input, { target: { value: '45' } });
    expect(onUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ optionalIndoorPm25: 45 })
    );

    fireEvent.change(pm25Input, { target: { value: '' } });
    expect(onUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ optionalIndoorPm25: null })
    );

    // Outdoor habits toggle
    const habitBtn = screen.getByRole('button', { name: /Kids' play/i });
    fireEvent.click(habitBtn);
    expect(onUpdateProfile).toHaveBeenCalled();
  });
});

describe('HelpPage and GroundedChat Deep Coverage', () => {
  it('covers HelpPage video extraction and accordions', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeVideoId('')).toBeNull();
    expect(extractYouTubeVideoId('not_a_valid_youtube_video_url_format')).toBeNull();

    const onBack = vi.fn();
    render(
      <I18nProvider language="en">
        <HelpPage onBack={onBack} onStartTour={vi.fn()} onOpenSettings={vi.fn()} />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /Back to Assistant/i }));
    expect(onBack).toHaveBeenCalled();

    // Click FAQ accordions
    const faqButtons = screen.getAllByRole('button', { expanded: false });
    if (faqButtons.length > 0) {
      fireEvent.click(faqButtons[0]);
    }
  });

  it('covers GroundedChat asking questions and quick prompt pills', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        airSnapshot: SAMPLE_SNAPSHOT,
        reply: { answer: 'Safe outdoors with N95.', actionableSteps: ['Wear N95'], suggestedFollowUps: [] },
      }),
    } as unknown as Response);

    render(
      <I18nProvider language="en">
        <GroundedChat
          location={SAMPLE_LOC}
          airSnapshot={SAMPLE_SNAPSHOT}
          profile={DEFAULT_USER_PROFILE}
        />
      </I18nProvider>
    );

    // Type question and submit
    const input = screen.getByPlaceholderText(/Ask about outdoor play, masks, evening walks, or indoor cooking\.\.\./i);
    fireEvent.change(input, { target: { value: 'Can I exercise outside today?' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Safe outdoors with N95.')).toBeInTheDocument();
    });
  });
});

describe('Full App Integration Deep Coverage', () => {
  it('renders App, switches routes via navigation, opens notification center, demo presets, and confirm delete modal', async () => {
    const map = new Map<string, string>();
    map.set('uaqa_preferences_v2', JSON.stringify({ ...DEFAULT_USER_PREFERENCES, tourCompleted: true }));
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) => map.get(k) ?? null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => {
      map.set(k, v);
    });

    render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <App />
        </I18nProvider>
      </PreferencesProvider>
    );

    // Top bar buttons
    const settingsBtn = screen.getByRole('button', { name: /^Settings$/i });
    fireEvent.click(settingsBtn);
    expect(screen.getByRole('heading', { level: 1, name: /Preferences & Accessibility/i })).toBeInTheDocument();

    // Back to assistant
    fireEvent.click(screen.getByRole('button', { name: /Back to Assistant/i }));

    // Open Help view
    const helpBtn = screen.getByRole('button', { name: /^Help$/i });
    fireEvent.click(helpBtn);
    expect(screen.getByRole('heading', { level: 1, name: /Help & Guide/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Back to Assistant/i }));

    // Open Notifications dropdown
    const notifBtn = screen.getByRole('button', { name: /Notifications/i });
    fireEvent.click(notifBtn);
  });
});
