import { SlidersHorizontal, Sparkles } from 'lucide-react';
import { DEMO_SCENARIOS, type DemoScenarioPreset } from '../../shared/constants.ts';
import type { UserProfile } from '../../shared/schemas.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

interface ProfilePanelProps {
  profile: UserProfile;
  onChangeProfile: (next: UserProfile) => void;
  onApplyDemo: (scenario: DemoScenarioPreset) => void;
  onGeneratePlan: () => void;
  canGenerate: boolean;
  generating: boolean;
}

const HOUSEHOLD_KEYS: Array<UserProfile['householdType']> = [
  'working_professional',
  'family_with_kids',
  'senior_citizens',
  'students',
  'community_group',
];

const COMMUTE_KEYS: Array<UserProfile['commuteMode']> = [
  'car_solo',
  'two_wheeler',
  'metro_bus',
  'auto_cab',
  'walk_cycle',
  'wfh',
];

const OUTDOOR_KEYS: Array<'kids_play' | 'morning_walk' | 'outdoor_sports' | 'market_errands'> = [
  'kids_play',
  'morning_walk',
  'outdoor_sports',
  'market_errands',
];

const SENSITIVITY_KEYS: Array<'asthma' | 'allergies' | 'elderly' | 'pregnancy' | 'heart_lung'> = [
  'asthma',
  'allergies',
  'elderly',
  'pregnancy',
  'heart_lung',
];

export function ProfilePanel({
  profile,
  onChangeProfile,
  onApplyDemo,
  onGeneratePlan,
  canGenerate,
  generating,
}: ProfilePanelProps) {
  const { t } = useI18n();

  function toggleArrayValue<T extends string>(list: T[], value: T): T[] {
    const cleaned = list.filter((item) => item !== ('none' as T));
    if (cleaned.includes(value)) {
      const next = cleaned.filter((item) => item !== value);
      return next.length > 0 ? next : (['none'] as T[]);
    }
    return [...cleaned, value];
  }

  return (
    <aside
      id="tour-profile-panel"
      aria-labelledby="profile-heading"
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <h2
            id="profile-heading"
            className="font-display text-base font-bold text-slate-900 dark:text-slate-100"
          >
            {t('profile.heading')}
          </h2>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('profile.subtitle')}</p>
      </div>

      <div className="space-y-2 border-b border-slate-200 pb-4 dark:border-slate-800">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          {t('profile.demosTitle')}
        </p>
        <div className="grid grid-cols-1 gap-2">
          {DEMO_SCENARIOS.map((demo) => (
            <button
              key={demo.id}
              type="button"
              onClick={() => onApplyDemo(demo)}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left transition-colors hover:border-teal-500 hover:bg-teal-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-teal-600 dark:hover:bg-teal-950/30"
            >
              <span className="block text-xs font-semibold text-slate-900 dark:text-slate-100">
                {t(`demos.${demo.id}.title`)}
              </span>
              <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                {t(`demos.${demo.id}.subtitle`)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="household-type-select"
          className="block text-xs font-medium text-slate-700 dark:text-slate-300"
        >
          {t('profile.householdType')}
        </label>
        <select
          id="household-type-select"
          value={profile.householdType}
          onChange={(e) =>
            onChangeProfile({
              ...profile,
              householdType: e.target.value as UserProfile['householdType'],
            })
          }
          className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        >
          {HOUSEHOLD_KEYS.map((key) => (
            <option key={key} value={key}>
              {t(`profile.options.household.${key}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label
            htmlFor="commute-mode-select"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            {t('profile.commuteMode')}
          </label>
          <select
            id="commute-mode-select"
            value={profile.commuteMode}
            onChange={(e) =>
              onChangeProfile({
                ...profile,
                commuteMode: e.target.value as UserProfile['commuteMode'],
              })
            }
            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            {COMMUTE_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`profile.options.commute.${key}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="commute-minutes-input"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            {t('profile.commuteMinutes')}
          </label>
          <input
            id="commute-minutes-input"
            type="number"
            min={0}
            max={240}
            step={5}
            value={profile.commuteMinutes}
            onChange={(e) => {
              const val = Math.max(0, Math.min(240, Number(e.target.value) || 0));
              onChangeProfile({ ...profile, commuteMinutes: val });
            }}
            className="font-mono-tabular min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-slate-700 dark:text-slate-300">
          {t('profile.outdoorHabits')}
        </legend>
        <div className="flex flex-wrap gap-2">
          {OUTDOOR_KEYS.map((key) => {
            const active = profile.outdoorHabits.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChangeProfile({
                    ...profile,
                    outdoorHabits: toggleArrayValue(profile.outdoorHabits, key),
                  })
                }
                className={`min-h-[38px] rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                  active
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {t(`profile.options.outdoor.${key}`)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-slate-700 dark:text-slate-300">
          {t('profile.healthSensitivities')}
        </legend>
        <div className="flex flex-wrap gap-2">
          {SENSITIVITY_KEYS.map((key) => {
            const active = profile.healthSensitivities.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChangeProfile({
                    ...profile,
                    healthSensitivities: toggleArrayValue(profile.healthSensitivities, key),
                  })
                }
                className={`min-h-[38px] rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                  active
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {t(`profile.options.sensitivity.${key}`)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <legend className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          {t('profile.homeSetup')}
        </legend>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label
              htmlFor="window-type-select"
              className="block text-xs text-slate-600 dark:text-slate-400"
            >
              {t('profile.windows')}
            </label>
            <select
              id="window-type-select"
              value={profile.homeSetup.windowType}
              onChange={(e) =>
                onChangeProfile({
                  ...profile,
                  homeSetup: {
                    ...profile.homeSetup,
                    windowType: e.target.value as UserProfile['homeSetup']['windowType'],
                  },
                })
              }
              className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {(['sealed_ac', 'standard_mesh', 'open_ventilation'] as const).map((w) => (
                <option key={w} value={w}>
                  {t(`profile.options.windows.${w}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="cooking-fuel-select"
              className="block text-xs text-slate-600 dark:text-slate-400"
            >
              {t('profile.cookingFuel')}
            </label>
            <select
              id="cooking-fuel-select"
              value={profile.homeSetup.cookingFuel}
              onChange={(e) =>
                onChangeProfile({
                  ...profile,
                  homeSetup: {
                    ...profile.homeSetup,
                    cookingFuel: e.target.value as UserProfile['homeSetup']['cookingFuel'],
                  },
                })
              }
              className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {(['lpg_png', 'induction', 'biomass_kerosene'] as const).map((f) => (
                <option key={f} value={f}>
                  {t(`profile.options.fuel.${f}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 text-xs text-slate-700 dark:text-slate-300">
          <label className="flex min-h-[36px] cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={profile.homeSetup.hasPurifier}
              onChange={(e) =>
                onChangeProfile({
                  ...profile,
                  homeSetup: { ...profile.homeSetup, hasPurifier: e.target.checked },
                })
              }
              className="h-4 w-4 rounded border-slate-300 accent-teal-700"
            />
            {t('profile.hasPurifier')}
          </label>
          <label className="flex min-h-[36px] cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={profile.homeSetup.hasExhaustFan}
              onChange={(e) =>
                onChangeProfile({
                  ...profile,
                  homeSetup: { ...profile.homeSetup, hasExhaustFan: e.target.checked },
                })
              }
              className="h-4 w-4 rounded border-slate-300 accent-teal-700"
            />
            {t('profile.hasExhaustFan')}
          </label>
          <label className="flex min-h-[36px] cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={profile.homeSetup.indoorPlants}
              onChange={(e) =>
                onChangeProfile({
                  ...profile,
                  homeSetup: { ...profile.homeSetup, indoorPlants: e.target.checked },
                })
              }
              className="h-4 w-4 rounded border-slate-300 accent-teal-700"
            />
            {t('profile.indoorPlants')}
          </label>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="indoor-pm25-input"
            className="block text-xs text-slate-600 dark:text-slate-400"
          >
            {t('profile.indoorPm25Label')}
          </label>
          <input
            id="indoor-pm25-input"
            type="number"
            min={0}
            max={999}
            placeholder={t('profile.indoorPm25Placeholder')}
            value={profile.optionalIndoorPm25 ?? ''}
            onChange={(e) => {
              const raw = e.target.value.trim();
              onChangeProfile({
                ...profile,
                optionalIndoorPm25: raw === '' ? null : Math.max(0, Math.min(999, Number(raw))),
              });
            }}
            className="font-mono-tabular min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
      </fieldset>

      <button
        type="button"
        onClick={onGeneratePlan}
        disabled={!canGenerate || generating}
        className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        {generating ? t('profile.updatingPlan') : t('profile.updatePlan')}
      </button>
    </aside>
  );
}
