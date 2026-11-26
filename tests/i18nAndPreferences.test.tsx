// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_USER_PREFERENCES,
  migratePreferences,
} from '../shared/schemas.ts';
import {
  DICTIONARIES,
  flattenDictionaryKeys,
  translate,
} from '../src/i18n/I18nContext.tsx';
import {
  PREFERENCES_STORAGE_KEY,
  PreferencesProvider,
  loadStoredPreferences,
  usePreferences,
} from '../src/context/PreferencesContext.tsx';
import { SettingsPage } from '../src/components/SettingsPage.tsx';
import { createSafeStorage } from '../src/lib/storage.ts';

afterEach(() => {
  cleanup();
  document.documentElement.className = '';
  document.documentElement.lang = 'en';
  delete document.documentElement.dataset.textSize;
});

describe('i18n dictionaries (all 10 regional languages parity)', () => {
  it('fails if any translation key is missing in any of the 10 supported Indian languages', () => {
    const enKeys = flattenDictionaryKeys(DICTIONARIES.en as unknown as Record<string, unknown>);
    expect(enKeys.length).toBeGreaterThan(80);

    for (const [lang, dict] of Object.entries(DICTIONARIES)) {
      if (lang === 'en') continue;
      const langKeys = flattenDictionaryKeys(dict as unknown as Record<string, unknown>);
      const missingInLang = enKeys.filter((k) => !langKeys.includes(k));
      const extraInLang = langKeys.filter((k) => !enKeys.includes(k));
      expect(missingInLang, `Missing keys in ${lang}`).toEqual([]);
      expect(extraInLang, `Extra keys in ${lang}`).toEqual([]);
    }
  });

  it('interpolates variables across regional languages and falls back cleanly for unknown keys', () => {
    expect(translate('en', 'location.active', { name: 'Pune' })).toBe('Active: Pune');
    expect(translate('hi', 'location.active', { name: 'पुणे' })).toBe('चयनित: पुणे');
    expect(translate('mr', 'location.active', { name: 'पुणे' })).toBe('निवडलेले: पुणे');
    expect(translate('pa', 'location.active', { name: 'ਅੰਮ੍ਰਿਤਸਰ' })).toBe('ਚੁਣਿਆ ਗਿਆ: ਅੰਮ੍ਰਿਤਸਰ');
    expect(translate('en', 'nonexistent.key')).toBe('nonexistent.key');
  });
});

describe('Preferences schema v2, migration, and invalid value recovery', () => {
  it('returns defaults and respects OS reduced-motion when raw input is missing or malformed', () => {
    expect(migratePreferences(null, true).reduceMotion).toBe(true);
    expect(migratePreferences('corrupt', false)).toEqual(DEFAULT_USER_PREFERENCES);
    expect(migratePreferences([], false)).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it('migrates legacy v1 schema fields cleanly to v2', () => {
    const v1 = {
      schemaVersion: 1,
      lang: 'hindi',
      units: 'imperial',
      compactAdvice: false,
      theme: 'dark',
    };
    const migrated = migratePreferences(v1);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.language).toBe('hi');
    expect(migrated.tempUnit).toBe('F');
    expect(migrated.aqiScale).toBe('EPA');
    expect(migrated.adviceDetail).toBe('detailed');
    expect(migrated.theme).toBe('dark');
    expect(DEFAULT_USER_PREFERENCES.theme).toBe('dark');
    expect(migratePreferences({ schemaVersion: 1, lang: 'panjabi' }).language).toBe('pa');
    expect(migratePreferences({ schemaVersion: 1, lang: 'marathi' }).language).toBe('mr');
  });

  it('recovers valid fields when other fields have invalid values', () => {
    const corrupted = {
      schemaVersion: 2,
      language: 'hi',
      tempUnit: 'KELVIN_INVALID',
      theme: 'dark',
      textSize: 'giant_invalid',
      highContrast: true,
    };
    const recovered = migratePreferences(corrupted);
    expect(recovered.language).toBe('hi');
    expect(recovered.theme).toBe('dark');
    expect(recovered.highContrast).toBe(true);
    expect(recovered.tempUnit).toBe('C');
    expect(recovered.textSize).toBe('normal');
  });
});

describe('Guest persistence and blocked-storage fallback', () => {
  it('falls back to in-memory storage when localStorage throws SecurityError', () => {
    const throwingBackend = {
      getItem: () => {
        throw new Error('SecurityError: storage blocked');
      },
      setItem: () => {
        throw new Error('SecurityError: storage blocked');
      },
      removeItem: () => {
        throw new Error('SecurityError: storage blocked');
      },
    };
    const adapter = createSafeStorage(throwingBackend);
    expect(adapter.mode).toBe('memory');

    adapter.setItem('test_key', 'hello');
    expect(adapter.getItem('test_key')).toBe('hello');
    adapter.removeItem('test_key');
    expect(adapter.getItem('test_key')).toBeNull();
  });

  it('persists preferences to storage and handles corrupt JSON cleanly', () => {
    const map = new Map<string, string>();
    const workingBackend = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
    };
    const adapter = createSafeStorage(workingBackend);
    expect(adapter.mode).toBe('localStorage');

    adapter.setItem(PREFERENCES_STORAGE_KEY, '{bad json');
    expect(loadStoredPreferences(adapter).language).toBe('en');

    adapter.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 2, language: 'hi', tempUnit: 'F' })
    );
    const loaded = loadStoredPreferences(adapter);
    expect(loaded.language).toBe('hi');
    expect(loaded.tempUnit).toBe('F');
  });
});

describe('SettingsPage & PreferencesProvider instant DOM application', () => {
  it('defaults to dark/black theme, switches to Marathi, Punjabi, and Hindi, toggles light/high-contrast/text-size, announces updates, and resets', () => {
    const memStorage = createSafeStorage(null);
    render(
      <PreferencesProvider storage={memStorage}>
        <SettingsPage onBack={() => {}} />
      </PreferencesProvider>
    );

    // Default theme is dark/black
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    // Switch language to Marathi
    fireEvent.click(screen.getByRole('button', { name: /मराठी/i }));
    expect(document.documentElement.lang).toBe('mr');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('प्राधान्ये आणि सुलभता');

    // Switch language to Punjabi
    fireEvent.click(screen.getByRole('button', { name: /ਪੰਜਾਬੀ/i }));
    expect(document.documentElement.lang).toBe('pa');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ਤਰਜੀਹਾਂ ਅਤੇ ਪਹੁੰਚਯੋਗਤਾ');

    // Switch language to Hindi
    fireEvent.click(screen.getByRole('button', { name: /हिन्दी/i }));
    expect(document.documentElement.lang).toBe('hi');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('प्राथमिकताएं और सुगम्यता');

    // Switch theme to Light then back to Dark
    fireEvent.click(screen.getByRole('button', { name: 'लाइट' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'डार्क' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    // Switch text size to Extra Large
    fireEvent.click(screen.getByRole('button', { name: 'बहुत बड़ा' }));
    expect(document.documentElement.dataset.textSize).toBe('xl');

    // Toggle high contrast
    const highContrastBox = screen.getByLabelText('उच्च कंट्रास्ट बॉर्डर और टेक्स्ट');
    fireEvent.click(highContrastBox);
    expect(document.documentElement.classList.contains('high-contrast')).toBe(true);

    // Live region announced update
    expect(screen.getByRole('status')).not.toHaveTextContent(/^$/);

    // Reset all preferences -> returns to defaults (en, dark, normal, no high-contrast)
    fireEvent.click(screen.getByRole('button', { name: 'सभी प्राथमिकताएं रीसेट करें' }));
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.dataset.textSize).toBe('normal');
    expect(document.documentElement.classList.contains('high-contrast')).toBe(false);
  });

  it('covers PreferencesContext detectOsReducedMotion, detectOsDark, corrupted profile, and system theme mediaQuery change', async () => {
    const { loadStoredProfile } = await import('../src/context/PreferencesContext.tsx');

    // 1. Corrupted profile in storage triggers catch block (line 59)
    const brokenStorage = createSafeStorage(null);
    brokenStorage.setItem('uaqa_profile_v1', '{ invalid json');
    const profile = loadStoredProfile(brokenStorage);
    expect(profile.householdType).toBe('family_with_kids');

    // 2. matchMedia prefers-reduced-motion: reduce and prefers-color-scheme: dark
    const origMatchMedia = window.matchMedia;
    let changeHandler: (() => void) | null = null;

    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_ev: string, handler: any) => {
        changeHandler = handler;
      },
      removeEventListener: () => {},
      dispatchEvent: () => true,
    })) as any;

    const loadedPrefs = loadStoredPreferences(brokenStorage);
    expect(loadedPrefs.reduceMotion).toBe(true);

    // 3. System theme mediaQuery change handler (lines 113-116)
    brokenStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ ...DEFAULT_USER_PREFERENCES, theme: 'system' }));
    const { unmount } = render(
      <PreferencesProvider storage={brokenStorage}>
        <div>Test Child</div>
      </PreferencesProvider>
    );

    // Trigger mediaQuery change
    if (changeHandler) {
      changeHandler();
    }
    unmount();

    // 4. updateProfile with invalid schema fallback (line 162) and duplicate markHintSeen (line 192)
    function PrefsTester() {
      const { updateProfile, markHintSeen } = usePreferences();
      return (
        <div>
          <button onClick={() => updateProfile({ householdType: 'invalid_type' } as any)}>InvalidProfile</button>
          <button onClick={() => markHintSeen('hint-dup')}>Hint</button>
        </div>
      );
    }
    const r2 = render(
      <PreferencesProvider storage={brokenStorage}>
        <PrefsTester />
      </PreferencesProvider>
    );
    fireEvent.click(screen.getByText('InvalidProfile'));
    fireEvent.click(screen.getByText('Hint'));
    fireEvent.click(screen.getByText('Hint'));
    r2.unmount();

    window.matchMedia = origMatchMedia;
  });
});
