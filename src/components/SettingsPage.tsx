import { ArrowLeft, Bell, Download, Globe, Palette, RotateCcw, Sliders, Sparkles } from 'lucide-react';
import { QUICK_PICK_CITIES } from '../../shared/constants.ts';
import { LANGUAGE_OPTIONS } from '../../shared/languages.ts';
import type { UserPreferences } from '../../shared/schemas.ts';
import { usePreferences } from '../context/PreferencesContext.tsx';
import { useI18n } from '../i18n/I18nContext.tsx';

interface SettingsPageProps {
  onBack: () => void;
  onStartTour?: () => void;
  alertsSlot?: React.ReactNode;
  accountPrivacySlot?: React.ReactNode;
}

export function SettingsPage({
  onBack,
  onStartTour,
  alertsSlot,
  accountPrivacySlot,
}: SettingsPageProps) {
  const {
    preferences,
    profile,
    storageMode,
    updatePreferences,
    resetPreferences,
    resetTour,
  } = usePreferences();
  const { t } = useI18n();

  function handleExportLocalJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      preferences,
      profile,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'urban-air-assistant-data.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleRestartTour() {
    resetTour();
    onStartTour?.();
    onBack();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-medium text-teal-700 hover:underline dark:text-teal-400"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('app.actions.backToAssistant')}
          </button>
          <h1 className="font-display mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {t('settings.heading')}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {t('settings.subtitle')}
          </p>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {storageMode === 'localStorage'
            ? t('settings.storageGuestNote')
            : t('settings.storageMemoryNote')}
        </p>
      </div>

      {/* 1. Language */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <h2 className="font-display text-base font-bold">{t('settings.sections.language')}</h2>
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400">
          {t('settings.languageLabel')}
        </p>
        <div
          role="group"
          aria-label={t('settings.languageLabel')}
          className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5"
        >
          {LANGUAGE_OPTIONS.map((lang) => {
            const active = preferences.language === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  updatePreferences(
                    { language: lang.code },
                    `${lang.nativeLabel} (${lang.englishLabel})`
                  )
                }
                className={`flex min-h-[52px] flex-col items-start justify-center rounded-xl border px-3.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                  active
                    ? 'border-teal-600 bg-teal-50 text-teal-950 dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-100'
                    : 'border-slate-200 bg-slate-50/70 text-slate-800 hover:border-slate-300 hover:bg-slate-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-700'
                }`}
              >
                <span className="text-sm font-semibold leading-tight">{lang.nativeLabel}</span>
                <span className="mt-0.5 text-[11px] text-slate-500 dark:text-neutral-400">
                  {lang.englishLabel}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Units & Display */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <h2 className="font-display text-base font-bold">{t('settings.sections.units')}</h2>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {t('settings.tempUnitLabel')}
            </p>
            <div className="mt-2 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {(['C', 'F'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={preferences.tempUnit === u}
                  onClick={() => updatePreferences({ tempUnit: u }, `°${u}`)}
                  className={`min-h-[38px] flex-1 rounded-lg text-xs font-semibold ${
                    preferences.tempUnit === u
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  °{u}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {t('settings.aqiScaleLabel')}
            </p>
            <div className="mt-2 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {(['CPCB', 'EPA'] as const).map((scale) => (
                <button
                  key={scale}
                  type="button"
                  aria-pressed={preferences.aqiScale === scale}
                  onClick={() => updatePreferences({ aqiScale: scale }, scale)}
                  className={`min-h-[38px] flex-1 rounded-lg text-xs font-semibold ${
                    preferences.aqiScale === scale
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {scale === 'CPCB' ? 'CPCB (India)' : 'US EPA'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {t('settings.timeFormatLabel')}
            </p>
            <div className="mt-2 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {(['12h', '24h'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  aria-pressed={preferences.timeFormat === fmt}
                  onClick={() => updatePreferences({ timeFormat: fmt }, fmt)}
                  className={`min-h-[38px] flex-1 rounded-lg text-xs font-semibold ${
                    preferences.timeFormat === fmt
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 3. Appearance & Accessibility */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <h2 className="font-display text-base font-bold">{t('settings.sections.appearance')}</h2>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {t('settings.themeLabel')}
            </p>
            <div className="mt-2 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {(
                [
                  ['light', t('settings.themeLight')],
                  ['dark', t('settings.themeDark')],
                  ['system', t('settings.themeSystem')],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  aria-pressed={preferences.theme === val}
                  onClick={() => updatePreferences({ theme: val }, label)}
                  className={`min-h-[38px] flex-1 rounded-lg text-xs font-semibold ${
                    preferences.theme === val
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {t('settings.textSizeLabel')}
            </p>
            <div className="mt-2 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {(
                [
                  ['normal', t('settings.textNormal')],
                  ['large', t('settings.textLarge')],
                  ['xl', t('settings.textXl')],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  aria-pressed={preferences.textSize === val}
                  onClick={() => updatePreferences({ textSize: val }, label)}
                  className={`min-h-[38px] flex-1 rounded-lg text-xs font-semibold ${
                    preferences.textSize === val
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 text-sm">
          <label className="flex min-h-[40px] cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={preferences.highContrast}
              onChange={(e) =>
                updatePreferences({ highContrast: e.target.checked }, t('settings.highContrastLabel'))
              }
              className="h-4 w-4 accent-teal-700"
            />
            <span>{t('settings.highContrastLabel')}</span>
          </label>

          <label className="flex min-h-[40px] cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={preferences.reduceMotion}
              onChange={(e) =>
                updatePreferences({ reduceMotion: e.target.checked }, t('settings.reduceMotionLabel'))
              }
              className="h-4 w-4 accent-teal-700"
            />
            <span>{t('settings.reduceMotionLabel')}</span>
          </label>
        </div>
      </section>

      {/* 4. Advice Style */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <h2 className="font-display text-base font-bold">{t('settings.sections.advice')}</h2>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {t('settings.adviceDetailLabel')}
            </p>
            <div className="mt-2 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {(
                [
                  ['concise', t('settings.detailConcise')],
                  ['detailed', t('settings.detailDetailed')],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  aria-pressed={preferences.adviceDetail === val}
                  onClick={() => updatePreferences({ adviceDetail: val }, label)}
                  className={`min-h-[38px] flex-1 rounded-lg text-xs font-semibold ${
                    preferences.adviceDetail === val
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {t('settings.adviceToneLabel')}
            </p>
            <div className="mt-2 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {(
                [
                  ['plain', t('settings.tonePlain')],
                  ['technical', t('settings.toneTechnical')],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  aria-pressed={preferences.adviceTone === val}
                  onClick={() => updatePreferences({ adviceTone: val }, label)}
                  className={`min-h-[38px] flex-1 rounded-lg text-xs font-semibold ${
                    preferences.adviceTone === val
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="mt-4 flex min-h-[40px] cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={preferences.showWhyByDefault}
            onChange={(e) =>
              updatePreferences(
                { showWhyByDefault: e.target.checked },
                t('settings.showWhyDefaultLabel')
              )
            }
            className="h-4 w-4 accent-teal-700"
          />
          <span>{t('settings.showWhyDefaultLabel')}</span>
        </label>
      </section>

      {/* 5. Location & Planner Defaults */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-display text-base font-bold">{t('settings.sections.locationDefaults')}</h2>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="default-location-select"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              {t('settings.defaultLocationLabel')}
            </label>
            <select
              id="default-location-select"
              value={preferences.defaultLocation?.name ?? ''}
              onChange={(e) => {
                const city = QUICK_PICK_CITIES.find((c) => c.name === e.target.value) ?? null;
                updatePreferences(
                  { defaultLocation: city },
                  city ? city.name : t('settings.noDefaultLocation')
                );
              }}
              className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">{t('settings.noDefaultLocation')}</option>
              {QUICK_PICK_CITIES.map((city) => (
                <option key={city.id} value={city.name}>
                  {city.name}, {city.state}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="preferred-mask-select"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              {t('settings.preferredMaskLabel')}
            </label>
            <select
              id="preferred-mask-select"
              value={preferences.preferredMask}
              onChange={(e) =>
                updatePreferences(
                  { preferredMask: e.target.value as UserPreferences['preferredMask'] },
                  e.target.value
                )
              }
              className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="N95">N95</option>
              <option value="FFP2">FFP2 / KN95</option>
              <option value="surgical">Surgical (limited PM2.5)</option>
              <option value="cloth">Cloth (not recommended for smog)</option>
            </select>
          </div>
        </div>

        <label className="mt-4 flex min-h-[40px] cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={preferences.useCurrentLocationOnOpen}
            onChange={(e) =>
              updatePreferences(
                { useCurrentLocationOnOpen: e.target.checked },
                t('settings.useCurrentOnOpenLabel')
              )
            }
            className="h-4 w-4 accent-teal-700"
          />
          <span>{t('settings.useCurrentOnOpenLabel')}</span>
        </label>

        <div className="mt-4">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
            {t('settings.plannerSectionsLabel')}
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            {(
              [
                ['daily', t('app.nav.dailyPlan')],
                ['indoor', t('app.nav.indoorGuide')],
                ['sustainable', t('app.nav.sustainable')],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex min-h-[38px] cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={preferences.plannerSections[key]}
                  onChange={(e) =>
                    updatePreferences(
                      {
                        plannerSections: {
                          ...preferences.plannerSections,
                          [key]: e.target.checked,
                        },
                      },
                      label
                    )
                  }
                  className="h-4 w-4 accent-teal-700"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Alerts & Notifications */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <h2 className="font-display text-base font-bold">{t('settings.sections.alerts')}</h2>
        </div>
        <div className="mt-3">
          {alertsSlot ?? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t('settings.alertsSignedOutNote')}
            </p>
          )}
        </div>
      </section>

      {/* 7. Privacy & Reset */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-display text-base font-bold">{t('settings.sections.privacy')}</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleExportLocalJson}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-300 px-4 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {t('settings.exportLocal')}
          </button>

          <button
            type="button"
            onClick={handleRestartTour}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-300 px-4 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t('settings.resetTour')}
          </button>

          <button
            type="button"
            onClick={resetPreferences}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-rose-300 px-4 text-xs font-semibold text-rose-800 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
          >
            {t('settings.resetAll')}
          </button>
        </div>
        {accountPrivacySlot ? <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">{accountPrivacySlot}</div> : null}
      </section>
    </div>
  );
}
