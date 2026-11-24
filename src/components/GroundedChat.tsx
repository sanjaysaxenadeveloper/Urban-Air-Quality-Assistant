import { useState } from 'react';
import { Loader2, MessageSquareText, Send, ShieldAlert } from 'lucide-react';
import type {
  AdviceStylePrefs,
  AirQualitySnapshot,
  ChatReply,
  IndianLocation,
  UserProfile,
} from '../../shared/schemas.ts';
import { useI18n } from '../i18n/I18nContext.tsx';
import { sendChatQuestionApi } from '../lib/apiClient.ts';

interface ChatTurn {
  id: string;
  question: string;
  reply: ChatReply;
}

interface GroundedChatProps {
  location: IndianLocation;
  profile: UserProfile;
  airSnapshot: AirQualitySnapshot;
  advicePrefs?: Partial<AdviceStylePrefs>;
}

export function GroundedChat({
  location,
  profile,
  airSnapshot,
  advicePrefs,
}: GroundedChatProps) {
  const { t } = useI18n();
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestedQuestions = [t('chat.sample1'), t('chat.sample2'), t('chat.sample3')];

  async function ask(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 2 || sending) return;

    setSending(true);
    setError(null);

    const history = turns.flatMap((turn) => [
      { role: 'user' as const, content: turn.question },
      { role: 'assistant' as const, content: turn.reply.answer },
    ]);

    try {
      const res = await sendChatQuestionApi({
        location,
        profile,
        advicePrefs,
        question: trimmed,
        history,
      });
      setTurns((prev) => [
        ...prev,
        { id: `${Date.now()}`, question: trimmed, reply: res.reply },
      ]);
      setQuestion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to answer right now. Please retry.');
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(question);
  }

  return (
    <section
      id="tour-grounded-chat"
      aria-labelledby="grounded-chat-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <h2
            id="grounded-chat-heading"
            className="font-display text-lg font-bold text-slate-900 dark:text-slate-100"
          >
            {t('chat.heading')}
          </h2>
        </div>
        <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
          {t('chat.groundedIn', {
            city: location.name,
            aqi: airSnapshot.aqi,
            source: airSnapshot.source.name,
          })}
        </span>
      </div>

      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('chat.subtitle')}</p>

      <div className="mt-3.5 flex flex-wrap gap-2" role="group" aria-label={t('chat.heading')}>
        {suggestedQuestions.map((sample) => (
          <button
            key={sample}
            type="button"
            disabled={sending}
            onClick={() => ask(sample)}
            className="min-h-[38px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs text-slate-700 transition-colors hover:border-teal-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-teal-600"
          >
            {sample}
          </button>
        ))}
      </div>

      {turns.length > 0 && (
        <div
          aria-live="polite"
          className="mt-4 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800"
        >
          {turns.map((turn) => (
            <div key={turn.id} className="space-y-2.5">
              <div className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                {turn.question}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-950">
                <p className="leading-relaxed text-slate-800 dark:text-slate-100">
                  {turn.reply.answer}
                </p>
                <ul className="mt-3 space-y-1 text-xs text-slate-700 dark:text-slate-300">
                  {turn.reply.actionableSteps.map((step, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden="true" className="text-teal-700 dark:text-teal-400">
                        •
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                  <strong className="font-semibold text-slate-800 dark:text-slate-200">
                    {t('planner.why')}
                  </strong>{' '}
                  {turn.reply.why}
                </p>
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {t('chat.dataNote')} {turn.reply.confidenceNote}
                </p>
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {turn.reply.medicalDisclaimer}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2.5 sm:flex-row">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.ariaLabel')}
          className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={sending || question.trim().length < 2}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          {t('chat.askButton')}
        </button>
      </form>
    </section>
  );
}
