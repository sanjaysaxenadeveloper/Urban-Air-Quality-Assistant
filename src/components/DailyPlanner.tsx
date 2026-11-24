import { useState } from 'react';
import { CalendarClock, Droplet, Shield, Sun, Sunrise, Sunset } from 'lucide-react';
import type { DecisionPlan } from '../../shared/schemas.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

interface DailyPlannerProps {
  planner: DecisionPlan['dailyPlanner'];
}

export function DailyPlanner({ planner }: DailyPlannerProps) {
  const { t } = useI18n();
  const [activePeriod, setActivePeriod] = useState<'morning' | 'afternoon' | 'evening'>('morning');
  const current = planner[activePeriod];

  const periods = [
    { key: 'morning' as const, label: t('planner.morning'), icon: Sunrise },
    { key: 'afternoon' as const, label: t('planner.afternoon'), icon: Sun },
    { key: 'evening' as const, label: t('planner.evening'), icon: Sunset },
  ];

  return (
    <section
      id="tour-daily-planner"
      aria-labelledby="daily-planner-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
            <h2
              id="daily-planner-heading"
              className="font-display text-lg font-bold text-slate-900 dark:text-slate-100"
            >
              {t('planner.heading')}
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {t('planner.subtitle')}
          </p>
        </div>

        <div
          role="tablist"
          aria-label={t('planner.heading')}
          className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
        >
          {periods.map(({ key, label, icon: Icon }) => {
            const selected = activePeriod === key;
            return (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`planner-panel-${key}`}
                id={`planner-tab-${key}`}
                onClick={() => setActivePeriod(key)}
                className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 whitespace-nowrap shrink-0 ${
                  selected
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`planner-panel-${activePeriod}`}
        aria-labelledby={`planner-tab-${activePeriod}`}
        className="mt-5 space-y-4"
      >
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
          <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
            {current.windowSummary}
          </p>
          <p className="mt-1.5 text-sm font-medium leading-relaxed text-slate-900 dark:text-slate-100">
            {current.action}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <strong className="font-semibold text-slate-800 dark:text-slate-200">
              {t('planner.commuteActivity')}
            </strong>{' '}
            {current.commuteAndActivity}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <Shield className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
              {t('planner.maskGuidance')}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {current.maskGuidance}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <Droplet className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
              {t('planner.hydration')}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {current.hydrationAndRecovery}
            </p>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4 text-xs dark:border-slate-800">
          <p className="text-slate-700 dark:text-slate-300">
            <strong className="font-semibold text-slate-900 dark:text-slate-100">
              {t('planner.why')}
            </strong>{' '}
            {current.why}
          </p>
          <p className="mt-1.5 text-teal-800 dark:text-teal-300">
            <strong className="font-semibold">{t('planner.estimatedBenefit')}</strong>{' '}
            {current.expectedBenefit}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {t('planner.assumption')} {current.assumptionNote}
          </p>
        </div>
      </div>
    </section>
  );
}
