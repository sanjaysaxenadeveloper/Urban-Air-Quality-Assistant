import { Home, Info, ShieldAlert, Wind } from 'lucide-react';
import type { DecisionPlan } from '../../shared/schemas.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

interface IndoorGuideProps {
  guide: DecisionPlan['indoorGuide'];
}

const VENTILATION_STYLE = {
  seal: 'border-orange-200 bg-orange-50 text-orange-950 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-100',
  brief_ventilate:
    'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100',
  ventilate:
    'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100',
} as const;

export function IndoorGuide({ guide }: IndoorGuideProps) {
  const { t } = useI18n();

  return (
    <section
      id="tour-indoor-guide"
      aria-labelledby="indoor-guide-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center gap-2">
        <Home className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
        <h2
          id="indoor-guide-heading"
          className="font-display text-lg font-bold text-slate-900 dark:text-slate-100"
        >
          {t('indoor.heading')}
        </h2>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className={`rounded-xl border p-4 ${VENTILATION_STYLE[guide.ventilationVerdict]}`}>
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <Wind className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t(`indoor.${guide.ventilationVerdict}`)}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed opacity-90">{guide.ventilationReason}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
            <Info className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden="true" />
            {t('indoor.readingNoteTitle')}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {guide.indoorReadingNote}
          </p>
        </div>
      </div>

      <div className="mt-5 divide-y divide-slate-200 dark:divide-slate-800">
        {guide.recommendations.map((rec, idx) => (
          <article key={idx} className="py-4 first:pt-0 last:pb-0">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              {rec.title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {rec.action}
            </p>
            <div className="mt-2 space-y-1 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                <strong className="font-semibold text-slate-800 dark:text-slate-200">
                  {t('planner.why')}
                </strong>{' '}
                {rec.why}
              </p>
              <p className="text-teal-800 dark:text-teal-300">
                <strong className="font-semibold">{t('planner.estimatedBenefit')}</strong>{' '}
                {rec.expectedBenefit}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('planner.assumption')} {rec.assumptionNote}
              </p>
            </div>
          </article>
        ))}
      </div>

      <p className="mt-4 flex items-center gap-1.5 border-t border-slate-200 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t('indoor.combustionWarning')}
      </p>
    </section>
  );
}
