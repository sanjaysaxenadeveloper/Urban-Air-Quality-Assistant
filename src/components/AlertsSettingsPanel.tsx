import { useState } from 'react';
import {
  BellOff,
  BellRing,
  CheckCircle2,
  Info,
  Send,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';
import type { AlertPrefs, SavedLocation } from '../../shared/schemas.ts';
import {
  enableBrowserPushNotifications,
  getBrowserNotificationPermission,
  isIosSafariNotStandalone,
  type BrowserNotificationPermission,
} from '../lib/notifications.ts';

interface AlertsSettingsPanelProps {
  isSignedIn: boolean;
  emailVerified: boolean;
  alertPrefs: AlertPrefs;
  savedLocations: SavedLocation[];
  onUpdateAlertPrefs: (next: AlertPrefs) => Promise<void>;
  onToggleLocationAlert: (locId: string) => Promise<void>;
  onSaveFcmToken: (token: string) => Promise<void>;
  onSendTestAlert: () => Promise<void>;
  onOpenSignIn: () => void;
}

export function AlertsSettingsPanel({
  isSignedIn,
  emailVerified,
  alertPrefs,
  savedLocations,
  onUpdateAlertPrefs,
  onToggleLocationAlert,
  onSaveFcmToken,
  onSendTestAlert,
  onOpenSignIn,
}: AlertsSettingsPanelProps) {
  const [permission, setPermission] = useState<BrowserNotificationPermission>(() =>
    getBrowserNotificationPermission()
  );
  const [showPrePrompt, setShowPrePrompt] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const iosNotice = isIosSafariNotStandalone();
  const canEditCloudAlerts = isSignedIn && emailVerified;

  async function handleConfirmEnableBrowserPush() {
    setEnablingPush(true);
    setStatusNote(null);
    try {
      const res = await enableBrowserPushNotifications();
      setPermission(res.permission);
      setStatusNote(res.note);
      setShowPrePrompt(false);
      if (res.fcmToken && canEditCloudAlerts) {
        await onSaveFcmToken(res.fcmToken);
      }
      if (res.permission === 'granted' && canEditCloudAlerts && !alertPrefs.enabled) {
        await onUpdateAlertPrefs({ ...alertPrefs, enabled: true });
      }
    } finally {
      setEnablingPush(false);
    }
  }

  async function handleUnsubscribeAll() {
    setStatusNote('All proactive alerts disabled. You can re-enable them anytime.');
    if (canEditCloudAlerts) {
      await onUpdateAlertPrefs({
        ...alertPrefs,
        enabled: false,
        morningBriefingEnabled: false,
      });
    }
  }

  async function handleTestAlertClick() {
    setSendingTest(true);
    setStatusNote(null);
    try {
      await onSendTestAlert();
      setStatusNote('Test alert sent! Check the bell icon in the top bar.');
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : 'Could not send test alert.');
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Pre-permission status & Browser Push registration */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Browser push notifications
            </p>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              {permission === 'granted'
                ? 'Enabled in this browser. In-app alerts are also active.'
                : permission === 'denied'
                  ? 'Blocked in browser site settings. In-app bell alerts still work automatically.'
                  : permission === 'unsupported'
                    ? 'Web Push is unavailable in this browser. In-app bell alerts still work.'
                    : 'Get notified before smog spikes, during recovery, or at your morning briefing time.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {permission === 'default' && !showPrePrompt && (
              <button
                type="button"
                onClick={() => setShowPrePrompt(true)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 text-xs font-semibold text-white hover:bg-teal-800"
              >
                <BellRing className="h-4 w-4" aria-hidden="true" />
                Enable browser alerts
              </button>
            )}
            <button
              type="button"
              disabled={sendingTest}
              onClick={() => void handleTestAlertClick()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              {sendingTest ? 'Sending...' : 'Send test alert'}
            </button>
          </div>
        </div>

        {/* Pre-permission explanation BEFORE calling Notification.requestPermission() */}
        {showPrePrompt && (
          <div
            role="region"
            aria-label="Browser notification permission explanation"
            className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-3.5 text-xs text-teal-950 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100"
          >
            <p className="font-semibold">Why we ask for notification permission</p>
            <p className="mt-1 leading-relaxed">
              We send concise, actionable smog alerts only for your chosen Indian locations when AQI crosses your threshold or improves — respecting your quiet hours and daily limit. You can unsubscribe in one click anytime.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={enablingPush}
                onClick={() => void handleConfirmEnableBrowserPush()}
                className="min-h-[38px] rounded-lg bg-teal-700 px-3.5 font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {enablingPush ? 'Requesting permission...' : 'Continue & allow notifications'}
              </button>
              <button
                type="button"
                onClick={() => setShowPrePrompt(false)}
                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                Not now
              </button>
            </div>
          </div>
        )}

        {iosNotice && (
          <p className="mt-3 flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden="true" />
            <span>
              Using Safari on iOS? Tap Share -&gt; <strong>Add to Home Screen</strong> to enable background Web Push notifications. In-app alerts work immediately.
            </span>
          </p>
        )}

        {statusNote && (
          <p role="status" aria-live="polite" className="mt-3 flex items-center gap-1.5 text-xs font-medium text-teal-800 dark:text-teal-300">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {statusNote}
          </p>
        )}
      </div>

      {!isSignedIn ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden="true" />
            <span>
              Guest mode automatically shows in-app alerts when your selected city exceeds AQI 200 (or 100 for sensitive groups). Sign in to unlock scheduled background push alerts, quiet hours, and per-location controls for up to 5 cities.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenSignIn}
            className="min-h-[38px] rounded-lg bg-teal-700 px-3.5 font-semibold text-white hover:bg-teal-800 whitespace-nowrap shrink-0"
          >
            Sign in for scheduled alerts
          </button>
        </div>
      ) : !emailVerified ? (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Verify your email address to save scheduled alert preferences to your account.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Master switch + unsubscribe */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex min-h-[40px] cursor-pointer items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={alertPrefs.enabled}
                onChange={(e) =>
                  void onUpdateAlertPrefs({ ...alertPrefs, enabled: e.target.checked })
                }
                className="h-4 w-4 accent-teal-700"
              />
              <span>Enable scheduled air-quality alerts</span>
            </label>

            {alertPrefs.enabled && (
              <button
                type="button"
                onClick={() => void handleUnsubscribeAll()}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-rose-300 px-3 text-xs font-semibold text-rose-800 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
              >
                <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
                Unsubscribe all
              </button>
            )}
          </div>

          {/* Threshold & trigger types */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="alert-threshold-input"
                className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                <span>CPCB AQI threshold</span>
                <span className="font-mono-tabular font-bold text-teal-700 dark:text-teal-400">
                  AQI {alertPrefs.thresholdAqi}+
                </span>
              </label>
              <input
                id="alert-threshold-input"
                type="range"
                min={50}
                max={450}
                step={25}
                value={alertPrefs.thresholdAqi}
                onChange={(e) =>
                  void onUpdateAlertPrefs({
                    ...alertPrefs,
                    thresholdAqi: Number(e.target.value),
                  })
                }
                className="mt-2 w-full accent-teal-700"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>50 (Satisfactory)</span>
                <span>200 (Poor)</span>
                <span>400+ (Severe)</span>
              </div>
            </div>

            <div>
              <label
                htmlFor="alert-daily-cap"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Max alerts per day
              </label>
              <select
                id="alert-daily-cap"
                value={alertPrefs.dailyCap}
                onChange={(e) =>
                  void onUpdateAlertPrefs({ ...alertPrefs, dailyCap: Number(e.target.value) })
                }
                className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                {[1, 2, 3, 4, 6, 8, 12].map((n) => (
                  <option key={n} value={n}>
                    Up to {n} per day
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2.5 text-sm">
            <label className="flex min-h-[38px] cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={alertPrefs.sensitiveMode}
                onChange={(e) =>
                  void onUpdateAlertPrefs({ ...alertPrefs, sensitiveMode: e.target.checked })
                }
                className="h-4 w-4 accent-teal-700"
              />
              <span className="flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                Sensitive-group stricter alerts (triggers from AQI 100+ for asthma, kids, elderly)
              </span>
            </label>

            <label className="flex min-h-[38px] cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={alertPrefs.categoryChangeAlerts}
                onChange={(e) =>
                  void onUpdateAlertPrefs({
                    ...alertPrefs,
                    categoryChangeAlerts: e.target.checked,
                  })
                }
                className="h-4 w-4 accent-teal-700"
              />
              <span>Category change &amp; recovery alerts (e.g. Poor -&gt; Very Poor, or clearing)</span>
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex min-h-[38px] cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={alertPrefs.morningBriefingEnabled}
                  onChange={(e) =>
                    void onUpdateAlertPrefs({
                      ...alertPrefs,
                      morningBriefingEnabled: e.target.checked,
                    })
                  }
                  className="h-4 w-4 accent-teal-700"
                />
                <span>Daily morning air briefing (IST)</span>
              </label>
              {alertPrefs.morningBriefingEnabled && (
                <input
                  type="time"
                  aria-label="Morning briefing time"
                  value={alertPrefs.morningBriefingTime}
                  onChange={(e) =>
                    void onUpdateAlertPrefs({
                      ...alertPrefs,
                      morningBriefingTime: e.target.value,
                    })
                  }
                  className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              )}
            </div>
          </div>

          {/* Quiet Hours */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="quiet-hours-start"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Quiet hours start (IST)
              </label>
              <input
                id="quiet-hours-start"
                type="time"
                value={alertPrefs.quietHoursStart}
                onChange={(e) =>
                  void onUpdateAlertPrefs({ ...alertPrefs, quietHoursStart: e.target.value })
                }
                className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label
                htmlFor="quiet-hours-end"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Quiet hours end (IST)
              </label>
              <input
                id="quiet-hours-end"
                type="time"
                value={alertPrefs.quietHoursEnd}
                onChange={(e) =>
                  void onUpdateAlertPrefs({ ...alertPrefs, quietHoursEnd: e.target.value })
                }
                className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
          </div>

          {/* Per-location toggles */}
          <div>
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Per-location alert toggles ({savedLocations.length}/5 saved)
            </p>
            {savedLocations.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Save any Indian city from the location bar to toggle scheduled alerts for it here.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {savedLocations.map((loc) => (
                  <label
                    key={loc.id}
                    className="inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium dark:border-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={loc.alertsEnabled}
                      onChange={() => void onToggleLocationAlert(loc.id)}
                      className="h-3.5 w-3.5 accent-teal-700"
                    />
                    <span>{loc.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
