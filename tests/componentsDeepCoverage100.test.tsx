// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, renderHook } from '@testing-library/react';
import type { AirQualitySnapshot, IndianLocation, UserProfile } from '../shared/schemas.ts';

const { mockChatSend, mockAuth } = vi.hoisted(() => {
  return {
    mockChatSend: vi.fn(),
    mockAuth: {
      user: null as any,
      signInWithEmail: vi.fn(),
      signUpWithEmail: vi.fn(),
      signInWithGoogle: vi.fn(),
      sendPasswordReset: vi.fn(),
    },
  };
});

vi.mock('../src/lib/apiClient.ts', () => ({
  sendChatQuestionApi: (...args: any[]) => mockChatSend(...args),
  searchLocationsApi: vi.fn(async () => []),
  reverseGeocodeApi: vi.fn(),
  fetchLiveAirApi: vi.fn(),
  generatePlanApi: vi.fn(),
}));

vi.mock('../src/context/AuthContext.tsx', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AirSnapshot, formatTemp, formatTime } from '../src/components/AirSnapshot.tsx';
import { ErrorBoundary } from '../src/components/ErrorBoundary.tsx';
import { GroundedChat } from '../src/components/GroundedChat.tsx';
import { AuthModal } from '../src/components/AuthModal.tsx';
import { LoginPage } from '../src/components/LoginPage.tsx';
import { AlertsSettingsPanel } from '../src/components/AlertsSettingsPanel.tsx';
import { HelpPage } from '../src/components/HelpPage.tsx';
import { LocationPicker } from '../src/components/LocationPicker.tsx';
import { CoachmarkTour } from '../src/components/CoachmarkTour.tsx';
import { SettingsPage } from '../src/components/SettingsPage.tsx';
import { ProfilePanel } from '../src/components/ProfilePanel.tsx';
import { NotificationCenter } from '../src/components/NotificationCenter.tsx';
import { PreferencesProvider, usePreferences } from '../src/context/PreferencesContext.tsx';
import { I18nProvider, useI18n } from '../src/i18n/I18nContext.tsx';

describe('Components Deep 100% Coverage Suite', () => {
  afterEach(() => {
    mockAuth.user = null;
    vi.clearAllMocks();
  });

  it('covers AirSnapshot null pollutants, null weather, EPA scale, formatTemp F, formatTime 24h', () => {
    const loc: IndianLocation = { id: 'mumbai', name: 'Mumbai', state: 'Maharashtra', lat: 19.07, lon: 72.87 };
    const nullSnap: AirQualitySnapshot = {
      location: loc,
      aqi: 120,
      cpcbCategory: 'moderate',
      usEpaAqi: 110,
      usEpaCategory: 'unhealthy_sensitive',
      pm25: null,
      pm10: null,
      no2: null,
      so2: null,
      o3: null,
      co: null,
      dominantPollutant: 'PM10',
      weather: null,
      source: { id: 'test', name: 'CPCB Modelled', isModelled: true },
      updatedAtIso: '2026-11-25T14:30:00.000Z',
      fetchedAtIso: '2026-11-25T14:35:00.000Z',
      freshness: 'stale',
      freshnessMinutes: 120,
      cacheHit: false,
    };

    expect(formatTemp(25, 'F')).toBe('77°F');
    expect(formatTemp(25, 'C')).toBe('25°C');
    expect(formatTime('2026-11-25T14:30:00.000Z', '24h', 'en')).toBeDefined();

    render(
      <I18nProvider language="en">
        <AirSnapshot
          snapshot={nullSnap}
          aqiScale="EPA"
          tempUnit="F"
          timeFormat="24h"
          onRefresh={vi.fn()}
        />
      </I18nProvider>
    );

    expect(screen.getByText(/Mumbai, Maharashtra/i)).toBeInTheDocument();
    expect(screen.getByText(/Live weather temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('covers ErrorBoundary catch and reload app click', () => {
    const reloadMock = vi.fn();
    const origLocation = window.location;
    // @ts-expect-error mock window.location
    delete window.location;
    // @ts-expect-error mock window.location
    window.location = { ...origLocation, reload: reloadMock };

    const Thrower = () => {
      throw new Error('Test crash in UI tree');
    };

    const spyConsole = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    const reloadBtn = screen.getByRole('button', { name: /Reload app/i });
    fireEvent.click(reloadBtn);
    expect(reloadMock).toHaveBeenCalled();

    spyConsole.mockRestore();
    window.location = origLocation;
  });

  it('covers GroundedChat api error display', async () => {
    mockChatSend.mockRejectedValueOnce(new Error('API network timeout error'));

    const loc: IndianLocation = { id: 'd', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2 };
    const snap: AirQualitySnapshot = {
      location: loc,
      aqi: 200,
      cpcbCategory: 'poor',
      usEpaAqi: 150,
      usEpaCategory: 'unhealthy',
      pm25: 100,
      pm10: 200,
      no2: 30,
      so2: 10,
      o3: 20,
      co: 1,
      dominantPollutant: 'PM2.5',
      weather: null,
      source: { id: 'c', name: 'CPCB', isModelled: false },
      updatedAtIso: new Date().toISOString(),
      fetchedAtIso: new Date().toISOString(),
      freshness: 'live',
      freshnessMinutes: 5,
      cacheHit: false,
    };
    const prof: UserProfile = {
      householdType: 'single_adult',
      commuteMode: 'metro_bus',
      commuteMinutes: 30,
      outdoorHabits: ['morning_walk'],
      healthSensitivities: ['none'],
      homeSetup: { hasPurifier: false, windowType: 'standard_mesh', cookingFuel: 'lpg_png', hasExhaustFan: true, indoorPlants: false },
      optionalIndoorPm25: null,
    };

    render(
      <I18nProvider language="en">
        <GroundedChat
          location={loc}
          profile={prof}
          airSnapshot={snap}
        />
      </I18nProvider>
    );

    const input = screen.getByPlaceholderText(/Ask about outdoor play/i);
    fireEvent.change(input, { target: { value: 'Should I walk outside?' } });
    fireEvent.submit(screen.getByRole('button', { name: /^Ask$/i }));

    await waitFor(() => {
      expect(screen.getByText(/API network timeout error/i)).toBeInTheDocument();
    });
  });

  it('covers AuthModal signin, password reset, and auth error display', async () => {
    mockAuth.signInWithEmail.mockRejectedValueOnce(new Error('Firebase: Error (auth/invalid-credential).'));

    render(
      <I18nProvider language="en">
        <AuthModal
          open={true}
          initialMode="signin"
          onClose={vi.fn()}
        />
      </I18nProvider>
    );

    // Fill email and password and submit
    const emailInput = screen.getByLabelText(/Email address/i);
    const passInput = screen.getByLabelText(/Password/i);
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passInput, { target: { value: 'wrongpass' } });

    const submitBtn = screen.getByRole('button', { name: /Sign in with email/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Incorrect email or password/i)).toBeInTheDocument();
    });

    // Test remaining error mapping branches for AuthModal (lines 17-23)
    const errorCases = [
      { code: 'auth/email-already-in-use', expected: /already exists with this email/i },
      { code: 'auth/weak-password', expected: /choose a stronger password/i },
      { code: 'auth/operation-not-allowed', expected: /Email\/password sign-in is not yet enabled/i },
      { code: 'auth/unknown-error', expected: /Could not complete sign-in right now/i },
      { code: 'auth/popup-closed-by-user', expected: /Sign-in window was closed/i },
    ];

    for (const ec of errorCases) {
      mockAuth.signInWithEmail.mockRejectedValueOnce(new Error(ec.code));
      fireEvent.click(submitBtn);
      await waitFor(() => {
        expect(screen.getByText(ec.expected)).toBeInTheDocument();
      });
    }

    // Switch to Reset password tab
    const resetBtn = screen.getByRole('button', { name: /^Reset$/i });
    fireEvent.click(resetBtn);

    const resetSubmitBtn = screen.getByRole('button', { name: /Send password reset email/i });
    fireEvent.click(resetSubmitBtn);

    await waitFor(() => {
      expect(mockAuth.sendPasswordReset).toHaveBeenCalledWith('test@example.com');
      expect(screen.getByText(/Password reset link sent/i)).toBeInTheDocument();
    });
  });

  it('covers LoginPage auth error mapping branches', async () => {
    const errorsToTest = [
      'auth/popup-closed-by-user',
      'auth/email-already-in-use',
      'auth/weak-password',
      'auth/operation-not-allowed',
      'auth/other-unknown-error',
    ];

    for (const code of errorsToTest) {
      mockAuth.signInWithGoogle.mockRejectedValueOnce(new Error(`Firebase: Error (${code}).`));

      const { unmount } = render(
        <I18nProvider language="en">
          <LoginPage
            onBack={vi.fn()}
            onOpenSettings={vi.fn()}
          />
        </I18nProvider>
      );

      // Trigger Google sign in
      const googleBtn = screen.getByRole('button', { name: /Continue with Google/i });
      fireEvent.click(googleBtn);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      unmount();
    }
  });

  it('covers AlertsSettingsPanel quiet hours and morning briefing time inputs', () => {
    mockAuth.user = { uid: 'u-alerts', email: 'alerts@example.com' };
    const onUpdate = vi.fn();
    const prefs = {
      enabled: true,
      pushEnabled: true,
      inAppEnabled: true,
      aqiThreshold: 200,
      sensitiveThreshold: 100,
      autoSensitiveThreshold: true,
      categoryChangeAlerts: true,
      recoveryAlerts: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '06:00',
      morningBriefingEnabled: true,
      morningBriefingTime: '07:30',
      cooldownMinutes: 180,
      dailyCap: 5,
    };

    render(
      <I18nProvider language="en">
        <AlertsSettingsPanel
          isSignedIn={true}
          emailVerified={true}
          savedLocations={[]}
          onToggleLocationAlert={vi.fn()}
          onSaveFcmToken={vi.fn()}
          onOpenSignIn={vi.fn()}
          alertPrefs={prefs as any}
          onUpdateAlertPrefs={onUpdate}
          onSendTestAlert={vi.fn()}
        />
      </I18nProvider>
    );

    // Morning briefing time
    const morningTimeInput = screen.getByLabelText(/Morning briefing time/i);
    fireEvent.change(morningTimeInput, { target: { value: '08:00' } });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ morningBriefingTime: '08:00' }));

    // Quiet hours start
    const startInput = screen.getByLabelText(/Quiet hours start \(IST\)/i);
    fireEvent.change(startInput, { target: { value: '23:00' } });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ quietHoursStart: '23:00' }));

    // Quiet hours end
    const endInput = screen.getByLabelText(/Quiet hours end \(IST\)/i);
    fireEvent.change(endInput, { target: { value: '07:00' } });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ quietHoursEnd: '07:00' }));
  });

  it('covers HelpPage FAQ ArrowUp, Home, End keyboard navigation and restart tour', () => {
    const onStartTour = vi.fn();
    const onBack = vi.fn();

    render(
      <I18nProvider language="en">
        <HelpPage
          onBack={onBack}
          onStartTour={onStartTour}
          onTryDemo={vi.fn()}
        />
      </I18nProvider>
    );

    const faqButtons = screen.getAllByRole('button', { name: /\?/i });
    if (faqButtons.length > 0) {
      faqButtons[0].focus();
      fireEvent.keyDown(faqButtons[0], { key: 'ArrowDown' });
      fireEvent.keyDown(faqButtons[0], { key: 'ArrowUp' });
      fireEvent.keyDown(faqButtons[0], { key: 'Home' });
      fireEvent.keyDown(faqButtons[0], { key: 'End' });
    }

    // Click Reset tour button at top
    const restartTourBtn = screen.getByRole('button', { name: /Restart onboarding tour/i });
    fireEvent.click(restartTourBtn);
    expect(onStartTour).toHaveBeenCalled();
    expect(onBack).toHaveBeenCalled();
  });

  it('covers LocationPicker selecting search result and saved location chips', async () => {
    const onSelect = vi.fn();
    const savedLocs: IndianLocation[] = [
      { id: 'delhi-saved', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2 },
    ];

    render(
      <I18nProvider language="en">
        <LocationPicker
          selectedLocation={null}
          savedLocations={savedLocs}
          isSignedIn={true}
          onSelectLocation={onSelect}
          onToggleSaveLocation={vi.fn()}
          onUseMyLocation={vi.fn()}
          loading={false}
        />
      </I18nProvider>
    );

    // Click saved location chip (second Delhi button, after quick-pick)
    const savedChips = screen.getAllByRole('button', { name: 'Delhi' });
    const savedChip = savedChips[savedChips.length - 1];
    fireEvent.click(savedChip);
    expect(onSelect).toHaveBeenCalledWith(savedLocs[0]);
  });

  it('covers usePreferences throwing when outside PreferencesProvider', () => {
    expect(() => {
      renderHook(() => usePreferences());
    }).toThrow('usePreferences must be used within PreferencesProvider');
  });

  it('covers useI18n default context implementation', () => {
    const { result } = renderHook(() => useI18n());
    expect(result.current.t('app.title')).toBe('Urban Air Quality Assistant');
  });

  it('covers CoachmarkTour placement arrows top, left, right and tab trapping', () => {
    render(
      <I18nProvider language="en">
        <CoachmarkTour
          phase="active"
          isSignedIn={false}
          onStartTour={vi.fn()}
          onCompleteOrSkip={vi.fn()}
        />
      </I18nProvider>
    );

    // Tab key handling
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    // Window resize & scroll event handling during active tour
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('scroll'));
  });

  it('covers LocationPicker search submission auto-select, no matches, and error handling', async () => {
    const { searchLocationsApi } = await import('../src/lib/apiClient.ts');
    const onSelect = vi.fn();

    // 1. Single match auto-select
    (searchLocationsApi as any).mockResolvedValueOnce([
      { id: 'lucknow', name: 'Lucknow', state: 'Uttar Pradesh', lat: 26.84, lon: 80.94 },
    ]);

    const { rerender } = render(
      <I18nProvider language="en">
        <LocationPicker
          selectedLocation={null}
          savedLocations={[]}
          isSignedIn={false}
          onSelectLocation={onSelect}
          onToggleSaveLocation={vi.fn()}
          onUseMyLocation={vi.fn()}
          loading={false}
        />
      </I18nProvider>
    );

    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'Lucknow' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Lucknow' }));
    });

    // 2. Zero matches message
    (searchLocationsApi as any).mockResolvedValueOnce([]);
    fireEvent.change(input, { target: { value: 'NonexistentPlace' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(/No matching Indian cities/i)).toBeInTheDocument();
    });

    // 3. Search API rejects with error
    (searchLocationsApi as any).mockRejectedValueOnce(new Error('Search service down'));
    fireEvent.change(input, { target: { value: 'Delhi' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(/Search service down/i)).toBeInTheDocument();
    });

    // 4. Multiple matches: clicking list item
    (searchLocationsApi as any).mockResolvedValueOnce([
      { id: 'delhi-1', name: 'Delhi Cantt', state: 'Delhi', lat: 28.59, lon: 77.13 },
      { id: 'delhi-2', name: 'Delhi North', state: 'Delhi', lat: 28.70, lon: 77.20 },
    ]);
    fireEvent.change(input, { target: { value: 'Delhi' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Delhi North')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Delhi North'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Delhi North' }));

    // 5. Test debounce search and submitting when results.length > 0 (lines 42-54, 108-109)
    (searchLocationsApi as any).mockResolvedValueOnce([
      { id: 'agra', name: 'Agra', state: 'Uttar Pradesh', lat: 27.18, lon: 78.01 },
    ]);
    fireEvent.change(input, { target: { value: 'Agra' } });
    await waitFor(() => {
      expect(screen.getByText('Agra')).toBeInTheDocument();
    }, { timeout: 1000 });
    // Now results.length > 0, submit the form -> hits lines 108-109 (handleSelect(results[0]))
    fireEvent.submit(input.closest('form')!);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Agra' }));

    // 6. Test debounce zero matches (lines 47-49)
    (searchLocationsApi as any).mockResolvedValueOnce([]);
    fireEvent.change(input, { target: { value: 'Zz' } });
    await waitFor(() => {
      expect(screen.getByText(/No matching Indian cities/i)).toBeInTheDocument();
    }, { timeout: 1000 });

    // 7. Test debounce search rejection (lines 51-53)
    (searchLocationsApi as any).mockRejectedValueOnce(new Error('Debounce network failure'));
    fireEvent.change(input, { target: { value: 'FailCity' } });
    await waitFor(() => {
      expect(screen.getByText(/Debounce network failure/i)).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it('covers AlertsSettingsPanel browser push confirm, not now, and guest sign in prompt', async () => {
    // @ts-expect-error mock Notification
    window.Notification = {
      permission: 'default',
      requestPermission: vi.fn(async () => 'granted'),
    };
    const notifsModule = await import('../src/lib/notifications.ts');
    vi.spyOn(notifsModule, 'enableBrowserPushNotifications').mockResolvedValue({
      permission: 'granted',
      fcmToken: 'test-fcm-token-123',
      note: 'Notifications enabled successfully.',
    });

    const onSaveToken = vi.fn();
    const onUpdatePrefs = vi.fn();
    const onOpenSignIn = vi.fn();

    // 1. Signed in & email verified with pre-prompt
    const { rerender } = render(
      <I18nProvider language="en">
        <AlertsSettingsPanel
          alertPrefs={{
            enabled: false,
            morningBriefingEnabled: true,
            morningBriefingTime: '07:30',
            thresholdAqi: 200,
            categoryChangeAlerts: true,
            quietHoursEnabled: true,
            quietHoursStart: '22:00',
            quietHoursEnd: '07:00',
            dailyCap: 3,
            pushFcmToken: undefined,
          }}
          savedLocations={[]}
          isSignedIn={true}
          emailVerified={true}
          onUpdateAlertPrefs={onUpdatePrefs}
          onToggleLocationAlert={vi.fn()}
          onSaveFcmToken={onSaveToken}
          onOpenSignIn={onOpenSignIn}
        />
      </I18nProvider>
    );

    // Click "Enable browser alerts" to open pre-prompt
    const enableBrowserBtn = screen.getByRole('button', { name: /Enable browser alerts/i });
    fireEvent.click(enableBrowserBtn);

    // Click "Not now" button to hit line 161
    const notNowBtn = screen.getByRole('button', { name: /Not now/i });
    fireEvent.click(notNowBtn);

    // Click "Enable browser alerts" again to open pre-prompt
    const enableBrowserBtnAgain = screen.getByRole('button', { name: /Enable browser alerts/i });
    fireEvent.click(enableBrowserBtnAgain);

    // Click "Continue & allow notifications" -> hits line 62 (onSaveFcmToken)
    const continueBtn = screen.getByRole('button', { name: /Continue & allow notifications/i });
    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(onSaveToken).toHaveBeenCalledWith('test-fcm-token-123');
    });

    // Toggle master switch
    const enableCheckbox = screen.getByRole('checkbox', { name: /Enable scheduled air-quality alerts/i });
    fireEvent.click(enableCheckbox);
    expect(onUpdatePrefs).toHaveBeenCalled();

    // 2. Guest mode: click "Sign in for scheduled alerts"
    rerender(
      <I18nProvider language="en">
        <AlertsSettingsPanel
          alertPrefs={{
            enabled: false,
            morningBriefingEnabled: true,
            morningBriefingTime: '07:30',
            thresholdAqi: 200,
            categoryChangeAlerts: true,
            quietHoursEnabled: true,
            quietHoursStart: '22:00',
            quietHoursEnd: '07:00',
            dailyCap: 3,
            pushFcmToken: undefined,
          }}
          savedLocations={[]}
          isSignedIn={false}
          emailVerified={false}
          onUpdateAlertPrefs={onUpdatePrefs}
          onToggleLocationAlert={vi.fn()}
          onSaveFcmToken={onSaveToken}
          onOpenSignIn={onOpenSignIn}
        />
      </I18nProvider>
    );

    const guestSignInBtn = screen.getByRole('button', { name: /Sign in for scheduled alerts/i });
    fireEvent.click(guestSignInBtn);
    expect(onOpenSignIn).toHaveBeenCalled();

    // 3. Signed in but unverified email message
    rerender(
      <I18nProvider language="en">
        <AlertsSettingsPanel
          alertPrefs={{
            enabled: false,
            morningBriefingEnabled: true,
            morningBriefingTime: '07:30',
            thresholdAqi: 200,
            categoryChangeAlerts: true,
            quietHoursEnabled: true,
            quietHoursStart: '22:00',
            quietHoursEnd: '07:00',
            dailyCap: 3,
            pushFcmToken: undefined,
          }}
          savedLocations={[]}
          isSignedIn={true}
          emailVerified={false}
          onUpdateAlertPrefs={onUpdatePrefs}
          onToggleLocationAlert={vi.fn()}
          onSaveFcmToken={onSaveToken}
          onOpenSignIn={onOpenSignIn}
        />
      </I18nProvider>
    );
    expect(screen.getByText(/Verify your email address to save scheduled alert/i)).toBeInTheDocument();
  });

  it('covers SettingsPage time format toggle, preferred mask, useCurrentOnOpen, and planner sections', () => {
    render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <SettingsPage
            onBack={vi.fn()}
            onStartTour={vi.fn()}
          />
        </I18nProvider>
      </PreferencesProvider>
    );

    // Toggle time format to 24h then 12h
    const btn24h = screen.getByRole('button', { name: '24h' });
    fireEvent.click(btn24h);
    const btn12h = screen.getByRole('button', { name: '12h' });
    fireEvent.click(btn12h);

    // Change preferred mask
    const maskSelect = screen.getByLabelText(/Preferred Mask Type/i);
    fireEvent.change(maskSelect, { target: { value: 'FFP2' } });

    // Toggle use current location on open
    const useCurrentCheckbox = screen.getByRole('checkbox', { name: /Automatically request my GPS location on open/i });
    fireEvent.click(useCurrentCheckbox);

    // Toggle planner sections (Daily Plan, Indoor Guide, Low-Emission)
    const dailySection = screen.getByRole('checkbox', { name: /^Daily Plan$/i });
    fireEvent.click(dailySection);
  });

  it('covers ProfilePanel health sensitivity toggle on and off returning none', async () => {
    const { DEFAULT_USER_PROFILE } = await import('../shared/schemas.ts');
    const onUpdateProfile = vi.fn();
    const profile: UserProfile = {
      ...DEFAULT_USER_PROFILE,
      healthSensitivities: ['asthma'],
    };

    render(
      <I18nProvider language="en">
        <ProfilePanel
          profile={profile}
          onChangeProfile={onUpdateProfile}
          onApplyDemo={vi.fn()}
          onGeneratePlan={vi.fn()}
          canGenerate={true}
          generating={false}
        />
      </I18nProvider>
    );

    // Uncheck asthma button -> list becomes empty so it falls back to ['none']
    const asthmaBtn = screen.getByRole('button', { name: /^Asthma$/i });
    fireEvent.click(asthmaBtn);
    expect(onUpdateProfile).toHaveBeenCalledWith(expect.objectContaining({ healthSensitivities: ['none'] }));
  });

  it('covers NotificationCenter clear all, close button, escape key, and invalid date string', () => {
    const onClearAll = vi.fn();
    const onMarkAll = vi.fn();

    const items = [
      {
        id: 'n1',
        title: 'High PM2.5 in Delhi',
        body: 'AQI reached 320.',
        reason: 'Severe smog',
        severity: 'high' as const,
        sourceName: 'CPCB',
        dataTimestampIso: 'not-a-valid-date-iso',
        createdAtIso: 'not-a-valid-date-iso',
        read: false,
      },
    ];

    render(
      <I18nProvider language="en">
        <NotificationCenter
          items={items}
          onMarkRead={vi.fn()}
          onMarkAllRead={onMarkAll}
          onClearAll={onClearAll}
          onOpenAlertSettings={vi.fn()}
        />
      </I18nProvider>
    );

    // Open notifications popover
    const bellBtn = screen.getByRole('button', { name: /Notifications/i });
    fireEvent.click(bellBtn);

    // Close notifications via close button (X)
    const closeBtn = screen.getByRole('button', { name: /Close notifications/i });
    fireEvent.click(closeBtn);

    // Reopen and close via Escape key
    fireEvent.click(bellBtn);
    fireEvent.keyDown(document, { key: 'Escape' });

    // Reopen and clear all notifications
    fireEvent.click(bellBtn);
    const clearBtn = screen.getByRole('button', { name: /Clear all notifications/i });
    fireEvent.click(clearBtn);
    expect(onClearAll).toHaveBeenCalled();
  });

  it('covers AuthModal Google button and Google error handling', async () => {
    mockAuth.signInWithGoogle.mockRejectedValueOnce(new Error('popup-closed-by-user'));

    render(
      <I18nProvider language="en">
        <AuthModal
          open={true}
          onClose={vi.fn()}
        />
      </I18nProvider>
    );

    const googleBtn = screen.getByRole('button', { name: /Continue with Google/i });
    fireEvent.click(googleBtn);

    await waitFor(() => {
      expect(screen.getByText(/Sign-in window was closed/i)).toBeInTheDocument();
    });
  });

  it('covers LoginPage invalid credential error', async () => {
    mockAuth.signInWithEmail.mockRejectedValueOnce(new Error('invalid-credential'));

    render(
      <I18nProvider language="en">
        <LoginPage
          onBack={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      </I18nProvider>
    );

    const emailInput = document.getElementById('login-email') as HTMLInputElement;
    const passwordInput = document.getElementById('login-password') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'bad@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpass' } });

    const submitBtn = screen.getByRole('button', { name: /Sign in with email/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Incorrect email or password/i)).toBeInTheDocument();
    });
  });

  it('covers GroundedChat question submission and error handling', async () => {
    const loc: IndianLocation = { id: 'delhi', name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2 };
    const profile: UserProfile = {
      householdType: 'single_adult',
      vulnerableGroups: ['none'],
      commuteMode: 'metro_bus',
      commuteDurationMins: 30,
      airPurifierAtHome: false,
      cookFuelType: 'lpg',
      healthSensitivities: ['none'],
      homeSetup: { windowType: 'sealed', acType: 'split_inverter' },
    };

    const snap: AirQualitySnapshot = {
      location: loc,
      aqi: 280,
      cpcbCategory: 'poor',
      usEpaAqi: 200,
      usEpaCategory: 'very_unhealthy',
      pm25: 140,
      pm10: 220,
      no2: 30,
      so2: 10,
      o3: 20,
      co: 1,
      dominantPollutant: 'PM2.5',
      weather: null,
      source: { id: 'cpcb', name: 'CPCB Live', isModelled: false },
      updatedAtIso: new Date().toISOString(),
      fetchedAtIso: new Date().toISOString(),
      freshness: 'live',
      freshnessMinutes: 1,
      cacheHit: false,
    };

    mockChatSend.mockRejectedValueOnce(new Error('Chat backend busy'));

    render(
      <I18nProvider language="en">
        <GroundedChat
          location={loc}
          airSnapshot={snap}
          profile={profile}
          advicePrefs={{ tone: 'balanced', detail: 'standard', focusAreas: [] }}
        />
      </I18nProvider>
    );

    const input = screen.getByRole('textbox');
    const sendBtn = screen.getByRole('button', { name: /^Ask$/i });

    // Short (< 2 chars) input early return (line 42)
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.submit(input.closest('form')!);

    fireEvent.change(input, { target: { value: 'Is it safe to run outdoors?' } });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText(/Chat backend busy/i)).toBeInTheDocument();
    });

    // Non-Error rejection fallback (line 66)
    mockChatSend.mockRejectedValueOnce('plain-string-error');
    fireEvent.change(input, { target: { value: 'Another question?' } });
    fireEvent.click(sendBtn);
    await waitFor(() => {
      expect(screen.getByText(/Unable to answer right now/i)).toBeInTheDocument();
    });

    // Turn 1 succeeds, then Turn 2 exercises turns.flatMap (line 47)
    mockChatSend.mockResolvedValueOnce({
      reply: { answer: 'Limit outdoor runs.', actionableSteps: ['Wear N95'], citedSources: ['CPCB'] },
    });
    fireEvent.change(input, { target: { value: 'Turn one question?' } });
    fireEvent.click(sendBtn);
    await waitFor(() => {
      expect(screen.getByText(/Limit outdoor runs/i)).toBeInTheDocument();
    });

    mockChatSend.mockResolvedValueOnce({
      reply: { answer: 'Yes, indoors is fine.', actionableSteps: [], citedSources: [] },
    });
    fireEvent.change(input, { target: { value: 'Turn two question?' } });
    fireEvent.click(sendBtn);
    await waitFor(() => {
      expect(screen.getByText(/Yes, indoors is fine/i)).toBeInTheDocument();
    });
  });

  it('covers ErrorBoundary with empty error message fallback', () => {
    const ProblemChild = () => {
      throw new Error('');
    };

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();

    // Call componentDidCatch directly with empty componentStack (line 27 fallback)
    const boundary = new ErrorBoundary({ children: null });
    boundary.componentDidCatch(new Error('test'), { componentStack: '' });
  });

  it('covers LocationPicker GPS location lookup success, failure, and submit with existing results', async () => {
    const { reverseGeocodeApi } = await import('../src/lib/apiClient.ts');
    const onSelect = vi.fn();

    const originalGeo = navigator.geolocation;
    let mockSuccessCb: ((pos: any) => void) | null = null;
    let mockErrorCb: ((err: any) => void) | null = null;

    (navigator as any).geolocation = {
      getCurrentPosition: (success: any, error: any) => {
        mockSuccessCb = success;
        mockErrorCb = error;
      },
    };

    render(
      <I18nProvider language="en">
        <LocationPicker
          selectedLocation={null}
          savedLocations={[]}
          isSignedIn={false}
          onSelectLocation={onSelect}
          onToggleSaveLocation={vi.fn()}
          onUseMyLocation={vi.fn()}
          loading={false}
        />
      </I18nProvider>
    );

    // 1. Click use my location button
    const useMyLocBtn = screen.getByRole('button', { name: /Use my location/i });
    fireEvent.click(useMyLocBtn);

    // Trigger success callback with successful reverseGeocodeApi
    (reverseGeocodeApi as any).mockResolvedValueOnce({
      id: 'gps-loc',
      name: 'Noida',
      state: 'Uttar Pradesh',
      lat: 28.53,
      lon: 77.39,
    });
    mockSuccessCb!({ coords: { latitude: 28.53, longitude: 77.39 } });

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Noida' }));
    });

    // Trigger success callback with failing reverseGeocodeApi
    (reverseGeocodeApi as any).mockRejectedValueOnce(new Error('Outside India boundaries'));
    mockSuccessCb!({ coords: { latitude: 0, longitude: 0 } });
    await waitFor(() => {
      expect(screen.getByText(/Outside India boundaries/i)).toBeInTheDocument();
    });

    (navigator as any).geolocation = originalGeo;
  });

  it('covers AuthModal Google success onClose, email success onClose, and Tab key wrap', async () => {
    const onClose = vi.fn();
    mockAuth.signInWithGoogle.mockResolvedValueOnce({});
    mockAuth.signInWithEmail.mockResolvedValueOnce({});

    const { rerender } = render(
      <I18nProvider language="en">
        <AuthModal
          open={true}
          onClose={onClose}
        />
      </I18nProvider>
    );

    // Google success
    const googleBtn = screen.getByRole('button', { name: /Continue with Google/i });
    fireEvent.click(googleBtn);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });

    // Email success
    onClose.mockClear();
    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/^Password$/i);
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'securePass123' } });

    const submitBtn = screen.getByRole('button', { name: /Sign in with email/i });
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });

    // Tab key wrap from last element to first (lines 70-71)
    const focusables = screen.getByRole('dialog').querySelectorAll('button, input, [tabindex="0"]');
    const lastEl = focusables[focusables.length - 1] as HTMLElement;
    lastEl.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
  });

  it('covers HelpPage extractYouTubeVideoId non-matching youtube url', async () => {
    const { extractYouTubeVideoId } = await import('../src/components/HelpPage.tsx');
    expect(extractYouTubeVideoId('https://youtube.com/feed/subscriptions')).toBeNull();
    expect(extractYouTubeVideoId(undefined)).toBeNull();
    expect(extractYouTubeVideoId('')).toBeNull();
  });

  it('covers NotificationCenter moderate and update severity, invalid date, and mousedown outside to close', () => {
    const items = [
      {
        id: 'n-mod',
        title: 'Moderate AQI',
        body: 'Dust levels elevated.',
        reason: 'Windy weather',
        severity: 'moderate' as const,
        sourceName: 'CPCB',
        dataTimestampIso: new Date().toISOString(),
        createdAtIso: new Date().toISOString(),
        read: false,
      },
      {
        id: 'n-info',
        title: 'Air update',
        body: 'Clear skies.',
        reason: 'Normal',
        severity: 'info' as const,
        sourceName: 'CPCB',
        dataTimestampIso: new Date().toISOString(),
        createdAtIso: 'invalid-date', // hits line 63 catch block in formatShortTime
        read: true,
      },
    ];

    render(
      <I18nProvider language="en">
        <NotificationCenter
          items={items}
          onMarkRead={vi.fn()}
          onMarkAllRead={vi.fn()}
          onClearAll={vi.fn()}
          onOpenAlertSettings={vi.fn()}
        />
      </I18nProvider>
    );

    // Open notifications
    const bellBtn = screen.getByRole('button', { name: /Notifications/i });
    fireEvent.click(bellBtn);

    expect(screen.getByText('Moderate AQI')).toBeInTheDocument();
    expect(screen.getByText('Air update')).toBeInTheDocument();

    // Click outside on document body to trigger line 92-93 mousedown close
    fireEvent.mouseDown(document.body);
  });

  it('covers CoachmarkTour computePopoverGeometry and all placement branches', async () => {
    const { computePopoverGeometry } = await import('../src/components/CoachmarkTour.tsx');
    // 1. Bottom fit
    const gBottom = computePopoverGeometry(
      { top: 50, left: 100, width: 200, height: 100 },
      300, 200, 1000, 1000, 'bottom'
    );
    expect(gBottom.placement).toBe('bottom');

    // 2. Top fit
    const gTop = computePopoverGeometry(
      { top: 700, left: 100, width: 200, height: 100 },
      300, 200, 1000, 1000, 'top'
    );
    expect(gTop.placement).toBe('top');

    // 3. Left fit
    const gLeft = computePopoverGeometry(
      { top: 400, left: 700, width: 200, height: 100 },
      300, 200, 1000, 1000, 'left'
    );
    expect(gLeft.placement).toBe('left');

    // 4. Right fit
    const gRight = computePopoverGeometry(
      { top: 400, left: 50, width: 200, height: 100 },
      300, 200, 1000, 1000, 'right'
    );
    expect(gRight.placement).toBe('right');

    // 5. No side fits completely (ratio fallback)
    const gRatio = computePopoverGeometry(
      { top: 200, left: 200, width: 600, height: 600 },
      800, 800, 1000, 1000, undefined
    );
    expect(['bottom', 'top', 'left', 'right']).toContain(gRatio.placement);
  });

  it('covers CoachmarkTour active arrow rendering for top, left, and right placement', () => {
    // Setup ResizeObserver and scrollIntoView
    const origResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      private _cb: any;
      private _called = false;
      constructor(cb: any) {
        this._cb = cb;
      }
      observe = vi.fn(() => {
        if (!this._called) {
          this._called = true;
          this._cb([], this);
        }
      });
      disconnect = vi.fn();
      unobserve = vi.fn();
    } as any;
    const origScroll = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = vi.fn();

    // Create target container with fallback elements
    const container = document.createElement('div');
    container.id = 'tour-target-test';
    container.setAttribute('data-testid', 'primary-target');
    document.body.appendChild(container);

    // Mock getBoundingClientRect
    const origGetBCR = HTMLElement.prototype.getBoundingClientRect;

    try {
      // 1. Force top placement (target near bottom)
      HTMLElement.prototype.getBoundingClientRect = function () {
        if (this.id === 'tour-target-test') {
          return { top: 750, left: 400, width: 100, height: 100, bottom: 850, right: 500 } as DOMRect;
        }
        return { top: 0, left: 0, width: 320, height: 200, bottom: 200, right: 320 } as DOMRect;
      };

      const customSteps = [
        {
          id: 'step-top',
          targetSelector: '#tour-target-test',
          fallbackSelector: '#nonexistent-fallback',
          titleKey: 'app.title',
          bodyKey: 'app.title',
          preferredPlacement: 'top' as const,
        },
      ];

      const { rerender, unmount } = render(
        <I18nProvider language="en">
          <CoachmarkTour
            phase="active"
            steps={customSteps}
            isSignedIn={false}
            onStartTour={vi.fn()}
            onCompleteOrSkip={vi.fn()}
          />
        </I18nProvider>
      );

      // Check if arrow with data-placement="top" rendered
      const arrowTop = screen.queryByTestId('tour-arrow');
      expect(arrowTop).toBeInTheDocument();
      expect(arrowTop?.getAttribute('data-placement')).toBe('top');

      // 2. Force left placement (target near right)
      HTMLElement.prototype.getBoundingClientRect = function () {
        if (this.id === 'tour-target-test') {
          return { top: 400, left: 800, width: 100, height: 100, bottom: 500, right: 900 } as DOMRect;
        }
        return { top: 0, left: 0, width: 320, height: 200, bottom: 200, right: 320 } as DOMRect;
      };

      const customStepsLeft = [
        {
          id: 'step-left',
          targetSelector: '#tour-target-test',
          fallbackSelector: '#nonexistent-fallback',
          titleKey: 'app.title',
          bodyKey: 'app.title',
          preferredPlacement: 'left' as const,
        },
      ];

      rerender(
        <I18nProvider language="en">
          <CoachmarkTour
            phase="active"
            steps={customStepsLeft}
            isSignedIn={false}
            onStartTour={vi.fn()}
            onCompleteOrSkip={vi.fn()}
          />
        </I18nProvider>
      );

      const arrowLeft = screen.queryByTestId('tour-arrow');
      expect(arrowLeft).toBeInTheDocument();
      expect(arrowLeft?.getAttribute('data-placement')).toBe('left');

      // 3. Force right placement (target near left)
      HTMLElement.prototype.getBoundingClientRect = function () {
        if (this.id === 'tour-target-test') {
          return { top: 400, left: 30, width: 50, height: 50, bottom: 450, right: 80 } as DOMRect;
        }
        return { top: 0, left: 0, width: 320, height: 200, bottom: 200, right: 320 } as DOMRect;
      };

      const customStepsRight = [
        {
          id: 'step-right',
          targetSelector: '#tour-target-test',
          fallbackSelector: '#nonexistent-fallback',
          titleKey: 'app.title',
          bodyKey: 'app.title',
          preferredPlacement: 'right' as const,
        },
      ];

      rerender(
        <I18nProvider language="en">
          <CoachmarkTour
            phase="active"
            steps={customStepsRight}
            isSignedIn={false}
            onStartTour={vi.fn()}
            onCompleteOrSkip={vi.fn()}
          />
        </I18nProvider>
      );

      const arrowRight = screen.queryByTestId('tour-arrow');
      expect(arrowRight).toBeInTheDocument();
      expect(arrowRight?.getAttribute('data-placement')).toBe('right');

      unmount();
    } finally {
      globalThis.ResizeObserver = origResizeObserver;
      HTMLElement.prototype.scrollIntoView = origScroll;
      HTMLElement.prototype.getBoundingClientRect = origGetBCR;
      container.remove();
    }
  });

  it('covers CoachmarkTour welcome phase, fallback target selector, and empty steps', () => {
    // 1. Welcome phase -> hits measureTarget lines 238-240
    const { rerender, unmount } = render(
      <I18nProvider language="en">
        <CoachmarkTour
          phase="welcome"
          steps={[]}
          onStartTour={vi.fn()}
          onCompleteOrSkip={vi.fn()}
        />
      </I18nProvider>
    );

    // 2. Active phase with empty steps -> hits line 216 (!step)
    rerender(
      <I18nProvider language="en">
        <CoachmarkTour
          phase="active"
          steps={[]}
          onStartTour={vi.fn()}
          onCompleteOrSkip={vi.fn()}
        />
      </I18nProvider>
    );

    // 3. Fallback target selector matched -> hits line 225
    const fallbackEl = document.createElement('div');
    fallbackEl.id = 'coachmark-fallback-target';
    document.body.appendChild(fallbackEl);

    rerender(
      <I18nProvider language="en">
        <CoachmarkTour
          phase="active"
          steps={[
            {
              id: 's-fallback',
              targetSelector: '#non-existent-primary',
              fallbackSelector: '#coachmark-fallback-target',
              titleKey: 'app.title',
              bodyKey: 'app.title',
            },
          ]}
          onStartTour={vi.fn()}
          onCompleteOrSkip={vi.fn()}
        />
      </I18nProvider>
    );

    fallbackEl.remove();
    unmount();
  });

  it('covers AirSnapshot formatTime with invalid date, EPA scale, recent freshness, and null state/station', () => {
    expect(formatTime('not-a-date', '12h', 'en')).toBe('not-a-date');

    const snap: AirQualitySnapshot = {
      location: { id: 'blr', name: 'Bengaluru', lat: 12.97, lon: 77.59 }, // no state
      aqi: 70,
      cpcbCategory: 'satisfactory',
      usEpaAqi: 65,
      usEpaCategory: 'moderate',
      pm25: 25,
      pm10: 60,
      no2: 20,
      so2: 5,
      o3: 15,
      co: 0.5,
      dominantPollutant: 'PM10',
      weather: null,
      source: { id: 'cpcb', name: 'CPCB Feed', isModelled: false }, // no stationName
      updatedAtIso: new Date().toISOString(),
      fetchedAtIso: new Date().toISOString(),
      freshness: 'recent',
      freshnessMinutes: 25,
      cacheHit: false,
    };

    render(
      <I18nProvider language="en">
        <AirSnapshot
          snapshot={snap}
          aqiScale="EPA"
          onRefresh={vi.fn()}
        />
      </I18nProvider>
    );

    expect(screen.getByText('Bengaluru')).toBeInTheDocument();
    expect(screen.getByText(/CPCB Feed/i)).toBeInTheDocument();

    // Unrecognized categories fallback for EPA and CPCB
    render(
      <I18nProvider language="en">
        <AirSnapshot
          snapshot={{ ...snap, usEpaCategory: 'unknown' as any, cpcbCategory: 'unknown' as any }}
          aqiScale="EPA"
          onRefresh={vi.fn()}
        />
      </I18nProvider>
    );
    render(
      <I18nProvider language="en">
        <AirSnapshot
          snapshot={{ ...snap, usEpaCategory: 'unknown' as any, cpcbCategory: 'unknown' as any }}
          aqiScale="CPCB"
          onRefresh={vi.fn()}
        />
      </I18nProvider>
    );
  });

  it('covers remaining branches in SettingsPage, NotificationCenter, HelpPage, ProfilePanel, LocationPicker, AuthModal, LoginPage, and AlertsSettingsPanel', async () => {
    // 1. SettingsPage: clear defaultLocation select to ''
    const rSettings = render(
      <PreferencesProvider>
        <I18nProvider language="en">
          <SettingsPage onBack={vi.fn()} onStartTour={vi.fn()} />
        </I18nProvider>
      </PreferencesProvider>
    );
    const defaultLocSelect = document.getElementById('default-location-select') as HTMLSelectElement;
    fireEvent.change(defaultLocSelect, { target: { value: 'Delhi' } });
    fireEvent.change(defaultLocSelect, { target: { value: '' } });
    rSettings.unmount();

    // 2. NotificationCenter: >9 unread, empty sourceName, click inside container, non-Escape keydown
    const tenItems = Array.from({ length: 10 }, (_, idx) => ({
      id: `n-${idx}`,
      title: `Title ${idx}`,
      body: 'Body',
      reason: 'Reason',
      severity: 'info' as const,
      sourceName: '',
      dataTimestampIso: new Date().toISOString(),
      createdAtIso: new Date().toISOString(),
      read: false,
    }));
    const rNotif = render(
      <I18nProvider language="en">
        <NotificationCenter
          items={tenItems}
          onMarkRead={vi.fn()}
          onMarkAllRead={vi.fn()}
          onClearAll={vi.fn()}
          onOpenAlertSettings={vi.fn()}
        />
      </I18nProvider>
    );
    expect(screen.getByText('9+')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/i }));
    fireEvent.mouseDown(screen.getByText('Title 0'));
    fireEvent.keyDown(document, { key: 'Enter' });
    rNotif.unmount();

    // 3. HelpPage: extractYouTubeVideoId variants + non-youtube videoUrl + non-nav keydown
    const { extractYouTubeVideoId } = await import('../src/components/HelpPage.tsx');
    expect(extractYouTubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeVideoId('https://youtu.be/bad')).toBeNull();
    expect(extractYouTubeVideoId('https://example.com/watch?v=123')).toBeNull();

    const rHelp = render(
      <I18nProvider language="en">
        <HelpPage videoUrl="https://example.com/not-youtube" onBack={vi.fn()} />
      </I18nProvider>
    );
    const firstFaqBtn = rHelp.container.querySelector('button[aria-expanded]') as HTMLButtonElement;
    if (firstFaqBtn) {
      fireEvent.keyDown(firstFaqBtn, { key: 'Tab' });
    }
    rHelp.unmount();

    // 4. ProfilePanel: toggle off last sensitivity -> ['none'], and clear indoor PM2.5 -> null
    const onChangeProfile = vi.fn();
    const { DEFAULT_USER_PROFILE } = await import('../shared/schemas.ts');
    const rProfile = render(
      <I18nProvider language="en">
        <ProfilePanel
          profile={{
            ...DEFAULT_USER_PROFILE,
            householdType: 'single_adult',
            healthSensitivities: ['asthma'],
            commuteMode: 'metro_bus',
            airPurifierAtHome: false,
            outdoorHabits: ['morning_walk'],
            optionalIndoorPm25: 45,
          }}
          onChangeProfile={onChangeProfile}
          onApplyDemo={vi.fn()}
          onGeneratePlan={vi.fn()}
          canGenerate={true}
          generating={false}
        />
      </I18nProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /^Asthma$/i }));
    expect(onChangeProfile).toHaveBeenCalledWith(expect.objectContaining({ healthSensitivities: ['none'] }));
    const pmInput = document.getElementById('indoor-pm25-input') as HTMLInputElement;
    if (pmInput) {
      fireEvent.change(pmInput, { target: { value: '' } });
    }
    rProfile.unmount();

    // 5. LocationPicker: short submit (<2 chars), empty state, non-Error rejections, missing id in results
    const { searchLocationsApi, reverseGeocodeApi } = await import('../src/lib/apiClient.ts');
    const rLoc = render(
      <I18nProvider language="en">
        <LocationPicker
          selectedLocation={{ id: 's1', name: 'TestCity', state: '', lat: 28.6, lon: 77.2 }}
          savedLocations={[]}
          isSignedIn={false}
          onSelectLocation={vi.fn()}
          onToggleSaveLocation={vi.fn()}
          onUseMyLocation={vi.fn()}
          loading={false}
        />
      </I18nProvider>
    );
    const searchBox = screen.getByRole('searchbox');
    fireEvent.change(searchBox, { target: { value: 'a' } });
    fireEvent.submit(searchBox.closest('form')!);
    (searchLocationsApi as any).mockRejectedValueOnce('string-search-err');
    fireEvent.change(searchBox, { target: { value: 'FailStr' } });
    fireEvent.submit(searchBox.closest('form')!);
    await waitFor(() => {
      expect(screen.getByText(/No matching Indian cities/i)).toBeInTheDocument();
    });

    (searchLocationsApi as any).mockResolvedValueOnce([
      { id: undefined as any, name: 'NoStateCity1', state: '', lat: 20.1, lon: 78.1 },
      { id: undefined as any, name: 'NoStateCity2', state: '', lat: 20.2, lon: 78.2 },
    ]);
    fireEvent.change(searchBox, { target: { value: 'NoState' } });
    fireEvent.submit(searchBox.closest('form')!);
    await waitFor(() => {
      expect(screen.getByText('NoStateCity1')).toBeInTheDocument();
    });

    // Geolocation non-PERMISSION_DENIED and non-Error reverseGeocode rejection
    const origGeo = navigator.geolocation;
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((_ok, errCb) => {
          errCb({ code: 2, PERMISSION_DENIED: 1 });
        }),
      },
      configurable: true,
      writable: true,
    });
    fireEvent.click(screen.getByRole('button', { name: /Use my location/i }));

    (reverseGeocodeApi as any).mockRejectedValueOnce('plain-geo-err');
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((okCb) => {
          okCb({ coords: { latitude: 28.6, longitude: 77.2 } });
        }),
      },
      configurable: true,
      writable: true,
    });
    fireEvent.click(screen.getByRole('button', { name: /Use my location/i }));
    Object.defineProperty(navigator, 'geolocation', { value: origGeo, configurable: true, writable: true });
    rLoc.unmount();

    // 6. AuthModal non-Error rejection + non-Tab keydown
    mockAuth.signInWithEmail.mockRejectedValueOnce('popup-closed-by-user');
    const rAuthM = render(
      <I18nProvider language="en">
        <AuthModal open={true} onClose={vi.fn()} />
      </I18nProvider>
    );
    fireEvent.change(screen.getByLabelText(/Email address/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in with email/i }));
    await waitFor(() => {
      expect(screen.getByText(/Sign-in window was closed/i)).toBeInTheDocument();
    });
    fireEvent.keyDown(document, { key: 'Enter' });
    rAuthM.unmount();

    // 7. LoginPage non-Error rejection + password reset info banner
    mockAuth.signInWithEmail.mockRejectedValueOnce('popup-closed-by-user');
    mockAuth.sendPasswordReset.mockResolvedValueOnce(undefined);
    const rLogin = render(
      <I18nProvider language="en">
        <LoginPage onBack={vi.fn()} onOpenSettings={vi.fn()} />
      </I18nProvider>
    );
    fireEvent.change(document.getElementById('login-email')!, { target: { value: 'a@b.com' } });
    fireEvent.change(document.getElementById('login-password')!, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in with email/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('tab', { name: /Reset/i }));
    fireEvent.click(screen.getByRole('button', { name: /Send password reset email/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
    rLogin.unmount();

    // 8. AlertsSettingsPanel: permission='denied', iOS notice, test-alert non-Error reject, already-enabled push confirm
    const origNav = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...origNav, userAgent: 'iPhone; CPU iPhone OS 15_0 like Mac OS X' },
      configurable: true,
      writable: true,
    });
    // @ts-expect-error mock Notification
    window.Notification = { permission: 'denied' };
    const onSendTest = vi.fn().mockRejectedValueOnce('non-error-test-alert');
    const rAlerts = render(
      <I18nProvider language="en">
        <AlertsSettingsPanel
          alertPrefs={{
            enabled: true,
            morningBriefingEnabled: true,
            morningBriefingTime: '07:30',
            thresholdAqi: 200,
            categoryChangeAlerts: true,
            quietHoursEnabled: true,
            quietHoursStart: '22:00',
            quietHoursEnd: '07:00',
            dailyCap: 3,
            pushFcmToken: undefined,
          }}
          savedLocations={[]}
          isSignedIn={true}
          emailVerified={true}
          onUpdateAlertPrefs={vi.fn()}
          onToggleLocationAlert={vi.fn()}
          onSaveFcmToken={vi.fn()}
          onSendTestAlert={onSendTest}
          onOpenSignIn={vi.fn()}
        />
      </I18nProvider>
    );
    expect(screen.getByText(/Blocked in browser site settings/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Send test alert/i }));
    await waitFor(() => {
      expect(screen.getByText(/Could not send test alert/i)).toBeInTheDocument();
    });
    Object.defineProperty(globalThis, 'navigator', { value: origNav, configurable: true, writable: true });
    rAlerts.unmount();

    // 9. HelpPage FAQ toggle close (line 324)
    const rHelp2 = render(
      <I18nProvider language="en">
        <HelpPage onBack={vi.fn()} />
      </I18nProvider>
    );
    const faqBtn2 = rHelp2.container.querySelector('button[aria-expanded]') as HTMLButtonElement;
    if (faqBtn2) {
      fireEvent.click(faqBtn2);
      fireEvent.click(faqBtn2);
    }
    rHelp2.unmount();

    // 10. ProfilePanel lines 61, 176, 374
    const rProf2 = render(
      <I18nProvider language="en">
        <ProfilePanel
          profile={{
            ...DEFAULT_USER_PROFILE,
            healthSensitivities: ['asthma', 'elderly'],
            commuteMinutes: 30,
          }}
          onChangeProfile={vi.fn()}
          onApplyDemo={vi.fn()}
          onGeneratePlan={vi.fn()}
          canGenerate={true}
          generating={false}
        />
      </I18nProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /^Asthma$/i }));
    const commuteInput = document.getElementById('commute-minutes-input') as HTMLInputElement;
    if (commuteInput) fireEvent.change(commuteInput, { target: { value: '' } });
    const pmInput2 = document.getElementById('indoor-pm25-input') as HTMLInputElement;
    if (pmInput2) fireEvent.change(pmInput2, { target: { value: '55' } });
    rProf2.unmount();

    // 11. LoginPage line 195: user with null email & null displayName
    mockAuth.user = { uid: 'u-null', email: null, displayName: null };
    const rLoginNull = render(
      <I18nProvider language="en">
        <LoginPage onBack={vi.fn()} onOpenSettings={vi.fn()} />
      </I18nProvider>
    );
    rLoginNull.unmount();
    mockAuth.user = null;

    // 12. LocationPicker lines 52-59: debounce non-Error reject + <2 char cleanup
    const rLoc2 = render(
      <I18nProvider language="en">
        <LocationPicker
          selectedLocation={null}
          savedLocations={[]}
          isSignedIn={false}
          onSelectLocation={vi.fn()}
          onToggleSaveLocation={vi.fn()}
          onUseMyLocation={vi.fn()}
          loading={false}
        />
      </I18nProvider>
    );
    const sb2 = screen.getByRole('searchbox');
    (searchLocationsApi as any).mockRejectedValueOnce('debounce-str-err');
    fireEvent.change(sb2, { target: { value: 'ab' } });
    await waitFor(() => {
      expect(screen.getByText(/No matching Indian cities/i)).toBeInTheDocument();
    }, { timeout: 1000 });
    fireEvent.change(sb2, { target: { value: 'a' } });
    rLoc2.unmount();

    // 13. AlertsSettingsPanel lines 61-64: fcmToken=null and alertPrefs.enabled=true
    const notifsModule = await import('../src/lib/notifications.ts');
    vi.spyOn(notifsModule, 'enableBrowserPushNotifications').mockResolvedValueOnce({
      permission: 'granted',
      fcmToken: null,
      note: 'No token',
    });
    // @ts-expect-error mock Notification
    window.Notification = { permission: 'default', requestPermission: vi.fn(async () => 'granted') };
    const rAlerts2 = render(
      <I18nProvider language="en">
        <AlertsSettingsPanel
          alertPrefs={{
            enabled: true,
            morningBriefingEnabled: true,
            morningBriefingTime: '07:30',
            thresholdAqi: 200,
            categoryChangeAlerts: true,
            quietHoursEnabled: true,
            quietHoursStart: '22:00',
            quietHoursEnd: '07:00',
            dailyCap: 3,
            pushFcmToken: undefined,
          }}
          savedLocations={[]}
          isSignedIn={true}
          emailVerified={true}
          onUpdateAlertPrefs={vi.fn()}
          onToggleLocationAlert={vi.fn()}
          onSaveFcmToken={vi.fn()}
          onOpenSignIn={vi.fn()}
        />
      </I18nProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /Enable browser alerts/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continue & allow notifications/i }));
    await waitFor(() => {
      expect(screen.getByText(/No token/i)).toBeInTheDocument();
    });
    rAlerts2.unmount();

    // 14. CoachmarkTour remaining branches: clamp max<min, reduceMotion=true, isMobile, fallbackNoteKey, welcome keydown, Tab wrap
    const { computePopoverGeometry } = await import('../src/components/CoachmarkTour.tsx');
    computePopoverGeometry({ top: 10, left: 10, width: 20, height: 20 }, 300, 200, 100, 100, 'bottom');

    const origW = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true, writable: true });
    const tEl = document.createElement('div');
    tEl.id = 'cm-mobile-target';
    tEl.scrollIntoView = vi.fn();
    document.body.appendChild(tEl);

    const rCmWelcome = render(
      <I18nProvider language="en">
        <CoachmarkTour phase="welcome" onStartTour={vi.fn()} onCompleteOrSkip={vi.fn()} />
      </I18nProvider>
    );
    fireEvent.keyDown(document, { key: 'Enter' });
    rCmWelcome.unmount();

    const rCmActive = render(
      <I18nProvider language="en">
        <CoachmarkTour
          phase="active"
          reduceMotion={true}
          steps={[
            {
              id: 's1',
              targetSelector: '#cm-mobile-target',
              titleKey: 'app.title',
              bodyKey: 'app.title',
              fallbackNoteKey: 'app.title',
            },
          ]}
          onStartTour={vi.fn()}
          onCompleteOrSkip={vi.fn()}
        />
      </I18nProvider>
    );
    const cmFocusables = rCmActive.container.querySelectorAll('button');
    (cmFocusables[cmFocusables.length - 1] as HTMLElement).focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
    // Tab when activeElement is first (not last) -> hits false branch of line 388
    (cmFocusables[0] as HTMLElement).focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });

    // CoachmarkTour with targetRect present AND usingFallbackTarget=false AND fallbackNoteKey set (line 544)
    const origGetBCR2 = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = () =>
      ({ top: 100, left: 100, width: 100, height: 100, bottom: 200, right: 200 }) as DOMRect;
    const rCmPresent = render(
      <I18nProvider language="en">
        <CoachmarkTour
          phase="active"
          steps={[
            {
              id: 's-present',
              targetSelector: '#cm-mobile-target',
              titleKey: 'app.title',
              bodyKey: 'app.title',
              fallbackNoteKey: 'app.title',
            },
          ]}
          onStartTour={vi.fn()}
          onCompleteOrSkip={vi.fn()}
        />
      </I18nProvider>
    );
    rCmPresent.unmount();
    HTMLElement.prototype.getBoundingClientRect = origGetBCR2;

    tEl.remove();
    rCmActive.unmount();
    Object.defineProperty(window, 'innerWidth', { value: origW, configurable: true, writable: true });
  });
});
