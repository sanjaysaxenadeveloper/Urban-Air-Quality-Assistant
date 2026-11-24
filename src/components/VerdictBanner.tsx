import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle, ShieldAlert } from 'lucide-react';
import type { DecisionPlan } from '../../shared/schemas.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

interface VerdictBannerProps {
  plan: DecisionPlan;
  showWhyByDefault?: boolean;
  onInspectWhy?: () => void;
}

export function VerdictBanner({
  plan,
  showWhyByDefault = false,
  onInspectWhy,
}: VerdictBannerProps) {
  const { t } = useI18n();
  const [showWhy, setShowWhy] = useState(showWhyByDefault);

  useEffect(() => {
    setShowWhy(showWhyByDefault);
  }, [showWhyByDefault]);

  return (
    <section
      id="tour-verdict"
      aria-labelledby="todays-verdict-heading"
      aria-live="polite"
      className="rounded-2xl border border-teal-200 bg-white p-6 sm:p-7 dark:border-teal-900/70 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
            {t('verdict.kicker')}
          </p>
          <h1
            id="todays-verdict-heading"
            className="font-display mt-1.5 text-2xl font-bold leading-snug tracking-tight text-slate-900 [text-wrap:balance] sm:text-3xl dark:text-slate-50"
          >
            {plan.todaysVerdict}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {plan.severitySummary}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowWhy((prev) => !prev);
            onInspectWhy?.();
          }}
          aria-expanded={showWhy}
          aria-controls="why-this-advice-panel"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
        >
          <HelpCircle className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          {t('verdict.whyButton')}
          {showWhy ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {showWhy && (
        <div
          id="why-this-advice-panel"
          className="mt-5 space-y-4 border-t border-slate-200 pt-5 text-sm dark:border-slate-800"
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <h2 className="font-display text-xs font-semibold text-slate-900 dark:text-slate-100">
                {t('verdict.dataUsedTitle')}
              </h2>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {plan.whyThisAdvice.dataUsed.map((item, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span aria-hidden="true" className="text-teal-700 dark:text-teal-400">
                      •
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="font-display text-xs font-semibold text-slate-900 dark:text-slate-100">
                {t('verdict.reasoningTitle')}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {plan.whyThisAdvice.reasoning}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            <p>{plan.whyThisAdvice.medicalDisclaimer}</p>
          </div>
        </div>
      )}
    </section>
  );
}
