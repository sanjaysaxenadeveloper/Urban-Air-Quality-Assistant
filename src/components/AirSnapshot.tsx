import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Droplets,
  Flame,
  Info,
  OctagonAlert,
  RefreshCw,
  ShieldCheck,
  Thermometer,
  Wind,
} from 'lucide-react';
import {
  CPCB_CATEGORIES,
  US_EPA_CATEGORIES,
  type CpcbCategoryId,
  type UsEpaCategoryId,
} from '../../shared/constants.ts';
import { getLanguageOption, type SupportedLanguage } from '../../shared/languages.ts';
import type { AirQualitySnapshot } from '../../shared/schemas.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

const ICON_MAP = {
  'check-circle': CheckCircle2,
  'shield-check': ShieldCheck,
  'alert-circle': AlertCircle,
  'alert-triangle': AlertTriangle,
  flame: Flame,
  'octagon-alert': OctagonAlert,
} as const;

const SEVERITY_SURFACE_MAP: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100',
  2: 'border-lime-200 bg-lime-50 text-lime-950 dark:border-lime-800 dark:bg-lime-950/60 dark:text-lime-100',
  3: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100',
  4: 'border-orange-200 bg-orange-50 text-orange-950 dark:border-orange-800 dark:bg-orange-950/60 dark:text-orange-100',
  5: 'border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-100',
  6: 'border-purple-200 bg-purple-50 text-purple-950 dark:border-purple-800 dark:bg-purple-950/60 dark:text-purple-100',
};

interface AirSnapshotProps {
  snapshot: AirQualitySnapshot;
  aqiScale?: 'CPCB' | 'EPA';
  tempUnit?: 'C' | 'F';
  timeFormat?: '12h' | '24h';
  onRefresh: () => void;
  refreshing?: boolean;
}

export function formatTemp(tempC: number, unit: 'C' | 'F'): string {
  if (unit === 'F') {
    const f = Math.round(((tempC * 9) / 5 + 32) * 10) / 10;
    return `${f}°F`;
  }
  return `${tempC}°C`;
}

export function formatTime(
  iso: string,
  timeFormat: '12h' | '24h',
  lang: SupportedLanguage = 'en'
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString(getLanguageOption(lang).locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: timeFormat === '12h',
  });
}

export function AirSnapshot({
  snapshot,
  aqiScale = 'CPCB',
  tempUnit = 'C',
  timeFormat = '12h',
  onRefresh,
  refreshing = false,
}: AirSnapshotProps) {
  const { t, language } = useI18n();
  const useEpa = aqiScale === 'EPA';
  const displayedAqi = useEpa ? snapshot.usEpaAqi : snapshot.aqi;

  const meta = useEpa
    ? US_EPA_CATEGORIES.find((c) => c.id === (snapshot.usEpaCategory as UsEpaCategoryId)) ??
      US_EPA_CATEGORIES[0]
    : CPCB_CATEGORIES.find((c) => c.id === (snapshot.cpcbCategory as CpcbCategoryId)) ??
      CPCB_CATEGORIES[0];

  const CategoryIcon = ICON_MAP[meta.icon];
  const categoryLabel = t(`snapshot.categories.${meta.id}`);

  const freshnessLabel =
    snapshot.freshness === 'live'
      ? t('snapshot.freshnessLive', { mins: snapshot.freshnessMinutes })
      : snapshot.freshness === 'recent'
        ? t('snapshot.freshnessRecent', { mins: snapshot.freshnessMinutes })
        : t('snapshot.freshnessStale', { mins: snapshot.freshnessMinutes });

  return (
    <section
      id="tour-air-snapshot"
      aria-labelledby="air-snapshot-heading"
      aria-live="polite"
      className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="air-snapshot-heading"
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100"
          >
            {snapshot.location.name}
            {snapshot.location.state ? `, ${snapshot.location.state}` : ''}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span>{snapshot.source.name}</span>
            {snapshot.source.stationName ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{snapshot.source.stationName}</span>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 font-mono-tabular">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {t('snapshot.updatedAt', {
                time: formatTime(snapshot.updatedAtIso, timeFormat, language),
              })}
            </span>
            <span aria-hidden="true">·</span>
            <span
              className={
                snapshot.freshness === 'stale'
                  ? 'font-medium text-amber-700 dark:text-amber-300'
                  : ''
              }
            >
              {freshnessLabel}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 px-3.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          {t('app.actions.refresh')}
        </button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`rounded-xl border p-4 ${SEVERITY_SURFACE_MAP[meta.severity]}`}>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <CategoryIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {useEpa ? 'US EPA' : 'CPCB'} · {categoryLabel}
            </span>
          </div>
          <p className="font-mono-tabular mt-2 text-4xl font-bold tracking-tight">{displayedAqi}</p>
          <p className="mt-1.5 text-xs leading-relaxed opacity-90">{meta.shortImpact}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('snapshot.particulatesTitle')}
          </p>
          <div className="mt-2.5 space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-600 dark:text-slate-400">PM2.5</span>
              <span className="font-mono-tabular text-lg font-semibold text-slate-900 dark:text-slate-100">
                {snapshot.pm25 !== null ? `${snapshot.pm25} µg/m³` : '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-600 dark:text-slate-400">PM10</span>
              <span className="font-mono-tabular text-sm font-medium text-slate-800 dark:text-slate-200">
                {snapshot.pm10 !== null ? `${snapshot.pm10} µg/m³` : '—'}
              </span>
            </div>
          </div>
          <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
            {t('snapshot.dominantLabel')}{' '}
            <strong className="font-mono-tabular font-semibold text-slate-800 dark:text-slate-200">
              {snapshot.dominantPollutant}
            </strong>
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {useEpa ? t('snapshot.cpcbEquiv') : t('snapshot.usEpaRef')}
          </p>
          <p className="font-mono-tabular mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {useEpa ? snapshot.aqi : snapshot.usEpaAqi}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 font-mono-tabular text-xs text-slate-600 dark:text-slate-400">
            <span>NO₂: {snapshot.no2 !== null ? `${snapshot.no2}` : '—'}</span>
            <span>O₃: {snapshot.o3 !== null ? `${snapshot.o3}` : '—'}</span>
            <span>SO₂: {snapshot.so2 !== null ? `${snapshot.so2}` : '—'}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('snapshot.weatherTitle')}
          </p>
          {snapshot.weather ? (
            <div className="mt-2.5 space-y-2 text-sm text-slate-800 dark:text-slate-200">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <Thermometer className="h-3.5 w-3.5" aria-hidden="true" /> {t('snapshot.temp')}
                </span>
                <span className="font-mono-tabular font-semibold">
                  {formatTemp(snapshot.weather.temperatureC, tempUnit)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <Droplets className="h-3.5 w-3.5" aria-hidden="true" /> {t('snapshot.humidity')}
                </span>
                <span className="font-mono-tabular font-medium">
                  {snapshot.weather.humidityPct}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <Wind className="h-3.5 w-3.5" aria-hidden="true" /> {t('snapshot.wind')}
                </span>
                <span className="font-mono-tabular font-medium">
                  {snapshot.weather.windSpeedKmh} km/h
                </span>
              </div>
            </div>
          ) : (
            <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
              {t('snapshot.weatherUnavailable')}
            </p>
          )}
        </div>
      </div>

      {snapshot.source.isModelled && (
        <p className="mt-4 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <span>{t('snapshot.modelledDisclosure')}</span>
        </p>
      )}
    </section>
  );
}
