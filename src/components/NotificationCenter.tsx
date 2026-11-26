import { useEffect, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  Info,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import type { NotificationItem } from '../../shared/schemas.ts';

interface NotificationCenterProps {
  items: NotificationItem[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onOpenAlertSettings: () => void;
}

function severityMeta(severity: NotificationItem['severity']) {
  switch (severity) {
    case 'severe':
      return {
        label: 'Severe',
        Icon: AlertOctagon,
        badgeClass: 'text-rose-800 dark:text-rose-300',
        bgClass: 'bg-rose-50/70 dark:bg-rose-950/30',
      };
    case 'high':
      return {
        label: 'High',
        Icon: ShieldAlert,
        badgeClass: 'text-orange-800 dark:text-orange-300',
        bgClass: 'bg-orange-50/60 dark:bg-orange-950/30',
      };
    case 'moderate':
      return {
        label: 'Moderate',
        Icon: AlertTriangle,
        badgeClass: 'text-amber-800 dark:text-amber-300',
        bgClass: 'bg-amber-50/60 dark:bg-amber-950/20',
      };
    default:
      return {
        label: 'Update',
        Icon: Info,
        badgeClass: 'text-teal-800 dark:text-teal-300',
        bgClass: 'bg-slate-50 dark:bg-slate-900',
      };
  }
}

function formatShortTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch /* v8 ignore next */ {
    return '';
  }
}

export function NotificationCenter({
  items,
  onMarkRead,
  onMarkAllRead,
  onClearAll,
  onOpenAlertSettings,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastTopIdRef = useRef<string | null>(items[0]?.id ?? null);

  const unreadCount = items.filter((i) => !i.read).length;

  useEffect(() => {
    const top = items[0];
    if (top && top.id !== lastTopIdRef.current) {
      lastTopIdRef.current = top.id;
      setLiveAnnouncement(`New air quality alert: ${top.title}. ${top.reason}`);
    }
  }, [items]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'
        }
        className="relative inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="font-mono-tabular absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-700 px-1 text-[10px] font-bold text-white"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Screen-reader polite announcement for incoming alerts */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveAnnouncement}
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="In-app notification center"
          className="absolute right-0 mt-2 w-[min(92vw,380px)] rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                Air Alerts
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2 text-xs font-medium text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/40"
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Mark all read
                </button>
              )}
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAll}
                  aria-label="Clear all notifications"
                  className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {items.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No air alerts yet. Alerts trigger automatically when live AQI crosses your threshold or when you run a test alert in Settings.
              </div>
            ) : (
              items.map((item) => {
                const meta = severityMeta(item.severity);
                const Icon = meta.Icon;
                return (
                  <article
                    key={item.id}
                    className={`p-3.5 transition-colors ${item.read ? 'opacity-75' : meta.bgClass}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.badgeClass}`} aria-hidden="true" />
                        <span className={meta.badgeClass}>{meta.label}</span>
                        <span className="text-slate-400">·</span>
                        <time className="font-mono-tabular font-normal text-slate-500 dark:text-slate-400">
                          {formatShortTime(item.createdAtIso)}
                        </time>
                      </div>
                      {!item.read && (
                        <button
                          type="button"
                          onClick={() => onMarkRead(item.id)}
                          aria-label={`Mark "${item.title}" as read`}
                          className="inline-flex min-h-[28px] items-center gap-1 rounded px-2 text-[11px] font-medium text-teal-700 hover:bg-white/70 dark:text-teal-400 dark:hover:bg-slate-800"
                        >
                          <Check className="h-3 w-3" aria-hidden="true" />
                          Read
                        </button>
                      )}
                    </div>
                    <h3 className="mt-1 text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {item.body}
                    </p>
                    <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {item.reason}
                      {item.sourceName ? ` · ${item.sourceName}` : ''}
                    </p>
                  </article>
                );
              })
            )}
          </div>

          <div className="border-t border-slate-200 px-4 py-2.5 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenAlertSettings();
              }}
              className="w-full min-h-[38px] rounded-lg text-center text-xs font-semibold text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/40"
            >
              Manage alert thresholds &amp; push settings →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
