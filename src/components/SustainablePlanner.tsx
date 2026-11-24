import { ArrowRight, Leaf } from 'lucide-react';
import type { DecisionPlan } from '../../shared/schemas.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

interface SustainablePlannerProps {
  planner: DecisionPlan['sustainablePlanner'];
}

export function SustainablePlanner({ planner }: SustainablePlannerProps) {
  const { t } = useI18n();

  return (
    <section
      id="tour-sustainable-planner"
      aria-labelledby="sustainable-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center gap-2">
        <Leaf className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
        <h2
          id="sustainable-heading"
          className="font-display text-lg font-bold text-slate-900 dark:text-slate-100"
        >
          {t('sustainable.heading')}
        </h2>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {t('sustainable.subtitle')}
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        {planner.alternatives.map((alt, idx) => (
          <article
            key={idx}
            className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/50"
          >
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <span>{t('sustainable.insteadOf', { current: alt.comparedTo })}</span>
                <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              </p>
              <h3 className="font-display mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {alt.title}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                {alt.action}
              </p>
            </div>

            <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
              <p className="text-slate-600 dark:text-slate-400">
                <strong className="font-semibold text-slate-800 dark:text-slate-200">
                  {t('planner.why')}
                </strong>{' '}
                {alt.why}
              </p>
              <p className="font-medium text-teal-800 dark:text-teal-300">
                {t('sustainable.estimatedImpact')} {alt.expectedBenefit}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('planner.assumption')} {alt.assumptionNote}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
