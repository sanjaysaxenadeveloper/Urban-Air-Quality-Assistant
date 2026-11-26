import { useEffect, useRef, useState } from 'react';
import { Loader2, Lock, Mail, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

type Mode = 'signin' | 'signup' | 'reset';

function mapAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('popup-closed-by-user')) return 'Sign-in window was closed before completing.';
  if (msg.includes('invalid-credential') || msg.includes('wrong-password'))
    return 'Incorrect email or password. Please check and try again.';
  if (msg.includes('email-already-in-use'))
    return 'An account already exists with this email. Try signing in instead.';
  if (msg.includes('weak-password'))
    return 'Please choose a stronger password (at least 6 characters).';
  if (msg.includes('operation-not-allowed'))
    return 'Email/password sign-in is not yet enabled in the Firebase console. Use Google Sign-In or enable Email/Password in Firebase Auth.';
  return 'Could not complete sign-in right now. Please try again.';
}

export function AuthModal({ open, onClose }: AuthModalProps) {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, sendPasswordReset } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setError(null);
    setInfo(null);

    const dialog = dialogRef.current;
    const focusables = dialog?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusables?.[0]?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && dialog) {
        const list = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        /* v8 ignore next */
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  async function handleGoogle() {
    setSubmitting(true);
    setError(null);
    try {
      await signInWithGoogle();
      onClose();
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
        onClose();
      } else if (mode === 'signup') {
        await signUpWithEmail(email, password, displayName);
        onClose();
      } else {
        await sendPasswordReset(email);
        setInfo('Password reset link sent. Please check your email inbox.');
      }
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        aria-describedby="auth-modal-desc"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="auth-modal-title"
              className="font-display text-lg font-bold text-slate-900 dark:text-slate-100"
            >
              Sign in to save your profile &amp; get alerts
            </h2>
            <p id="auth-modal-desc" className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Optional upgrade — guest mode always stays fully available without an account.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign-in modal"
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Google Sign-In */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={submitting}
          className="mt-5 flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Continue with Google
        </button>

        <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          <span>or with email</span>
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        </div>

        {/* Mode switch */}
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {(
            [
              ['signin', 'Sign in'],
              ['signup', 'Create account'],
              ['reset', 'Reset'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
                setInfo(null);
              }}
              className={`min-h-[36px] flex-1 rounded-lg text-xs font-semibold ${
                mode === m
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleFormSubmit} className="mt-4 space-y-3">
          {mode === 'signup' && (
            <div>
              <label htmlFor="auth-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Your name
              </label>
              <input
                id="auth-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                maxLength={80}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Email address
            </label>
            <div className="relative mt-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
          </div>

          {mode !== 'reset' && (
            <div>
              <label htmlFor="auth-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Password
              </label>
              <div className="relative mt-1">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm dark:border-slate-700 dark:bg-slate-950"
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
            className="min-h-[46px] w-full rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
          >
            {mode === 'signin'
              ? 'Sign in with email'
              : mode === 'signup'
                ? 'Create account & send verification'
                : 'Send password reset email'}
          </button>
        </form>

        {/* Short privacy note */}
        <p className="mt-4 flex items-start gap-2 border-t border-slate-200 pt-3.5 text-[11px] leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <span>
            We store only your household profile, app preferences, up to 5 saved Indian locations, and alert settings strictly under your private account. Export or delete everything anytime in Settings.
          </span>
        </p>
      </div>
    </div>
  );
}
