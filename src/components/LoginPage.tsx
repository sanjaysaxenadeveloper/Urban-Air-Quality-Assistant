import { useState } from 'react';
import {
  ArrowLeft,
  BellRing,
  CheckCircle2,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useI18n } from '../i18n/I18nContext.tsx';

interface LoginPageProps {
  onBack: () => void;
  onOpenSettings: () => void;
}

type AuthMode = 'signin' | 'signup' | 'reset';

export function LoginPage({ onBack, onOpenSettings }: LoginPageProps) {
  const {
    user,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    signOutUser,
  } = useAuth();
  const { t } = useI18n();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function mapAuthError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('popup-closed-by-user')) return t('auth.errors.popupClosed');
    if (msg.includes('invalid-credential') || msg.includes('wrong-password')) {
      return t('auth.errors.invalidCredential');
    }
    if (msg.includes('email-already-in-use')) return t('auth.errors.emailInUse');
    if (msg.includes('weak-password')) return t('auth.errors.weakPassword');
    if (msg.includes('operation-not-allowed')) return t('auth.errors.operationNotAllowed');
    return t('auth.errors.generic');
  }

  async function handleGoogle() {
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      await signInWithGoogle();
      onBack();
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
        onBack();
      } else if (mode === 'signup') {
        await signUpWithEmail(email, password, displayName);
        onBack();
      } else {
        await sendPasswordReset(email);
        setInfo(t('auth.resetSent'));
      }
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const benefits = [
    {
      Icon: SlidersHorizontal,
      title: t('auth.benefit1Title'),
      body: t('auth.benefit1Body'),
    },
    {
      Icon: MapPin,
      title: t('auth.benefit2Title'),
      body: t('auth.benefit2Body'),
    },
    {
      Icon: BellRing,
      title: t('auth.benefit3Title'),
      body: t('auth.benefit3Body'),
    },
    {
      Icon: ShieldCheck,
      title: t('auth.benefit4Title'),
      body: t('auth.benefit4Body'),
    },
  ];

  return (
    <section
      aria-labelledby="login-page-heading"
      className="mx-auto max-w-5xl space-y-6"
    >
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('app.actions.backToAssistant')}
        </button>
      </div>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* Left column: Value & Guest Mode assurance */}
        <div className="space-y-6 lg:col-span-6">
          <div>
            <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
              {t('auth.pageKicker')}
            </p>
            <h1
              id="login-page-heading"
              className="font-display mt-1.5 text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance] sm:text-3xl dark:text-slate-50"
            >
              {t('auth.pageTitle')}
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {t('auth.pageSubtitle')}
            </p>
          </div>

          <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('auth.benefitsHeading')}
            </h2>
            <ul className="mt-4 space-y-4">
              {benefits.map(({ Icon, title, body }) => (
                <li key={title} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {title}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              {t('auth.continueGuest')}
            </button>
          </div>
        </div>

        {/* Right column: Dedicated Authentication Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
          {user ? (
            <div className="space-y-5">
              <div className="flex items-center gap-2.5 text-teal-700 dark:text-teal-400">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                  {t('auth.signedInTitle')}
                </h2>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {t('auth.signedInAs', { email: user.email ?? user.displayName ?? '' })}
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                >
                  {t('auth.goToAssistant')}
                </button>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  {t('auth.openSettings')}
                </button>
                <button
                  type="button"
                  onClick={() => void signOutUser()}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-rose-300 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/40"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  {t('auth.signOut')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleGoogle}
                disabled={submitting}
                className="flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {t('auth.continueGoogle')}
              </button>

              <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                <span>{t('auth.orWithEmail')}</span>
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              </div>

              <div
                role="tablist"
                aria-label={t('auth.pageTitle')}
                className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
              >
                {(
                  [
                    ['signin', t('auth.tabSignIn')],
                    ['signup', t('auth.tabSignUp')],
                    ['reset', t('auth.tabReset')],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => {
                      setMode(m);
                      setError(null);
                      setInfo(null);
                    }}
                    className={`min-h-[38px] flex-1 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                      mode === m
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleFormSubmit} className="mt-5 space-y-4">
                {mode === 'signup' && (
                  <div>
                    <label
                      htmlFor="login-name"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      {t('auth.nameLabel')}
                    </label>
                    <input
                      id="login-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                      maxLength={80}
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    {t('auth.emailLabel')}
                  </label>
                  <div className="relative mt-1">
                    <Mail
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                </div>

                {mode !== 'reset' && (
                  <div>
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      {t('auth.passwordLabel')}
                    </label>
                    <div className="relative mt-1">
                      <Lock
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                      <input
                        id="login-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                  </div>
                )}

                {error && (
                  <p role="alert" aria-live="assertive" className="text-xs text-rose-700 dark:text-rose-400">
                    {error}
                  </p>
                )}
                {info && (
                  <p role="status" aria-live="polite" className="text-xs text-teal-800 dark:text-teal-300">
                    {info}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[46px] w-full rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50"
                >
                  {mode === 'signin'
                    ? t('auth.submitSignIn')
                    : mode === 'signup'
                      ? t('auth.submitSignUp')
                      : t('auth.submitReset')}
                </button>
              </form>

              <p className="mt-5 flex items-start gap-2 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                <span>{t('auth.privacyNote')}</span>
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
