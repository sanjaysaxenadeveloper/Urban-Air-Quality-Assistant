// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/context/AuthContext.tsx', () => ({
  useAuth: () => ({
    user: null,
    authReady: true,
    cloudLoaded: false,
    sessionExpired: false,
    emailVerificationNeeded: false,
    savedLocations: [],
    alertPrefs: {
      enabled: false,
      thresholdAqi: 200,
      sensitiveMode: false,
      quietHoursStart: 22,
      quietHoursEnd: 7,
      morningBriefing: false,
      cooldownMinutes: 180,
    },
    cloudNotifications: [],
    pendingMerge: null,
    authStatusMessage: null,
    clearAuthStatus: vi.fn(),
    getIdToken: vi.fn(async () => null),
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
  }),
}));

import App from '../src/App.tsx';
import { PreferencesProvider } from '../src/context/PreferencesContext.tsx';
import { createSafeStorage } from '../src/lib/storage.ts';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  document.documentElement.className = '';
  document.documentElement.lang = 'en';
  delete document.documentElement.dataset.textSize;
});

function renderAppWithTourCompleted() {
  const map = new Map<string, string>();
  map.set(
    'uaqa_preferences_v2',
    JSON.stringify({ schemaVersion: 2, tourCompleted: true, tourVersion: 1 })
  );
  const storage = createSafeStorage({
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  });

  return render(
    <PreferencesProvider storage={storage}>
      <App />
    </PreferencesProvider>
  );
}

describe('Top toolbar controls (Regional Languages, Black Default Theme, Font Size, Coachmark Tour) & Separate Login Page', () => {
  it('switches between English, Hindi, Marathi, and Punjabi directly from the top bar', () => {
    renderAppWithTourCompleted();

    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByText('Urban Air Quality Assistant')).toBeInTheDocument();

    const langSelect = screen.getByRole('combobox', { name: /Select language/i });

    // Switch to Marathi
    fireEvent.change(langSelect, { target: { value: 'mr' } });
    expect(document.documentElement.lang).toBe('mr');
    expect(screen.getByText('शहरी वायू गुणवत्ता सहाय्यक')).toBeInTheDocument();

    // Switch to Punjabi
    fireEvent.change(langSelect, { target: { value: 'pa' } });
    expect(document.documentElement.lang).toBe('pa');
    expect(screen.getByText('ਸ਼ਹਿਰੀ ਹਵਾ ਗੁਣਵੱਤਾ ਸਹਾਇਕ')).toBeInTheDocument();

    // Switch to Hindi
    fireEvent.change(langSelect, { target: { value: 'hi' } });
    expect(document.documentElement.lang).toBe('hi');
    expect(screen.getByText('शहरी वायु गुणवत्ता सहायक')).toBeInTheDocument();
    expect(screen.getAllByText('नौकरीपेशा यात्री · दिल्ली').length).toBeGreaterThanOrEqual(2);

    // Switch back to English
    fireEvent.change(langSelect, { target: { value: 'en' } });
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByText('Urban Air Quality Assistant')).toBeInTheDocument();
  });

  it('defaults to black/dark theme and toggles to Light and back to Dark, plus increases/decreases font size', () => {
    renderAppWithTourCompleted();

    // Default theme is dark/black -> toggle to light -> toggle back to dark
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Switch to light theme/i }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Switch to dark theme/i }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    // Font size controls: normal -> large -> xl -> large
    const decBtn = screen.getByRole('button', { name: /Decrease font size/i });
    const incBtn = screen.getByRole('button', { name: /Increase font size/i });
    expect(decBtn).toBeDisabled();
    expect(incBtn).not.toBeDisabled();
    expect(document.documentElement.dataset.textSize).toBe('normal');

    fireEvent.click(incBtn);
    expect(document.documentElement.dataset.textSize).toBe('large');
    expect(decBtn).not.toBeDisabled();

    fireEvent.click(incBtn);
    expect(document.documentElement.dataset.textSize).toBe('xl');
    expect(incBtn).toBeDisabled();

    fireEvent.click(decBtn);
    expect(document.documentElement.dataset.textSize).toBe('large');
  });

  it('replays the interactive Coachmark Tour on demand from the top bar', () => {
    renderAppWithTourCompleted();

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Start guided coachmark tour/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('1 of 7')).toBeInTheDocument();
  });

  it('navigates to a dedicated separate Login page and allows returning to Guest Mode (in English & Regional Languages)', () => {
    renderAppWithTourCompleted();

    fireEvent.click(screen.getByRole('button', { name: /^Sign in$/i }));
    expect(window.location.hash).toBe('#/login');
    expect(
      screen.getByRole('heading', { level: 1, name: /Sign in to Urban Air Quality Assistant/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Create account/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Reset password/i })).toBeInTheDocument();

    // Switch Login page to Hindi from top bar
    const langSelect = screen.getByRole('combobox', { name: /Select language/i });
    fireEvent.change(langSelect, { target: { value: 'hi' } });
    expect(
      screen.getByRole('heading', { level: 1, name: /शहरी वायु गुणवत्ता सहायक में साइन इन करें/i })
    ).toBeInTheDocument();

    // Return to Assistant via Continue in Guest Mode
    fireEvent.click(screen.getByRole('button', { name: /गेस्ट मोड में जारी रखें/i }));
    expect(window.location.hash).toBe('');
    expect(
      screen.getByRole('heading', { level: 1, name: /आज की हवा के लिए 10 सेकंड में सही निर्णय लें/i })
    ).toBeInTheDocument();
  });
});
