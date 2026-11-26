import { useEffect, useRef, useState } from 'react';
import { Loader2, LocateFixed, MapPin, Search, Star } from 'lucide-react';
import { QUICK_PICK_CITIES } from '../../shared/constants.ts';
import type { IndianLocation, SavedLocation } from '../../shared/schemas.ts';
import { useI18n } from '../i18n/I18nContext.tsx';
import { reverseGeocodeApi, searchLocationsApi } from '../lib/apiClient.ts';

interface LocationPickerProps {
  selectedLocation: IndianLocation | null;
  onSelectLocation: (loc: IndianLocation) => void;
  loading?: boolean;
  isSignedIn?: boolean;
  savedLocations?: SavedLocation[];
  onToggleSaveLocation?: (loc: IndianLocation) => void;
}

export function LocationPicker({
  selectedLocation,
  onSelectLocation,
  loading = false,
  isSignedIn = false,
  savedLocations = [],
  onToggleSaveLocation,
}: LocationPickerProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<IndianLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setStatusMessage(null);
      try {
        const matches = await searchLocationsApi(trimmed);
        setResults(matches);
        if (matches.length === 0) {
          setStatusMessage(t('location.noMatches'));
        }
      } catch (err) {
        setResults([]);
        setStatusMessage(err instanceof Error ? err.message : t('location.noMatches'));
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => {
      /* v8 ignore next */
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, t]);

  function handleSelect(loc: IndianLocation) {
    setResults([]);
    setStatusMessage(null);
    setQuery('');
    onSelectLocation(loc);
  }

  function handleUseMyLocation() {
    if (!('geolocation' in navigator)) {
      setStatusMessage(t('location.geoUnsupported'));
      return;
    }

    setLocating(true);
    setStatusMessage(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const loc = await reverseGeocodeApi(latitude, longitude);
          handleSelect(loc);
        } catch (err) {
          setStatusMessage(err instanceof Error ? err.message : t('location.outsideIndia'));
        } finally {
          setLocating(false);
        }
      },
      (geoErr) => {
        setLocating(false);
        setStatusMessage(
          geoErr.code === geoErr.PERMISSION_DENIED
            ? t('location.geoDenied')
            : t('location.geoFailed')
        );
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    if (results.length > 0) {
      handleSelect(results[0]);
      return;
    }
    setSearching(true);
    setStatusMessage(null);
    try {
      const matches = await searchLocationsApi(trimmed);
      setResults(matches);
      if (matches.length === 1) {
        handleSelect(matches[0]);
      } else if (matches.length === 0) {
        setStatusMessage(t('location.noMatches'));
      }
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : t('location.noMatches'));
    } finally {
      setSearching(false);
    }
  }

  return (
    <section
      id="tour-location-picker"
      aria-labelledby="location-picker-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="location-picker-heading"
          className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          {t('location.heading')}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {selectedLocation
              ? t('location.active', {
                  name: `${selectedLocation.name}${selectedLocation.state ? `, ${selectedLocation.state}` : ''}`,
                })
              : t('location.prompt')}
          </span>
          {isSignedIn && selectedLocation && onToggleSaveLocation && (() => {
            const isSaved = savedLocations.some(
              (s) => s.name.toLowerCase() === selectedLocation.name.toLowerCase()
            );
            return (
              <button
                type="button"
                onClick={() => onToggleSaveLocation(selectedLocation)}
                aria-pressed={isSaved}
                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                  isSaved
                    ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'
                }`}
              >
                <Star
                  className={`h-3.5 w-3.5 ${isSaved ? 'fill-amber-500 text-amber-500' : ''}`}
                  aria-hidden="true"
                />
                {isSaved ? 'Saved' : `Save (${savedLocations.length}/5)`}
              </button>
            );
          })()}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('location.searchPlaceholder')}
            aria-label={t('location.searchAria')}
            autoComplete="off"
            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          {searching && (
            <Loader2
              className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-teal-600"
              aria-hidden="true"
            />
          )}
        </div>

        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={locating || loading}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          {locating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <LocateFixed className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          )}
          {t('location.useMyLocation')}
        </button>
      </form>

      {results.length > 0 && (
        <ul
          role="listbox"
          aria-label={t('location.heading')}
          className="mt-2.5 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950"
        >
          {results.map((loc) => (
            <li key={loc.id ?? `${loc.lat}-${loc.lon}`}>
              <button
                type="button"
                onClick={() => handleSelect(loc)}
                className="flex min-h-[44px] w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-white focus-visible:bg-white focus-visible:outline-none dark:hover:bg-slate-900 dark:focus-visible:bg-slate-900"
              >
                <span className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                  <MapPin className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                  <span>{loc.name}</span>
                  {loc.state ? (
                    <span className="font-normal text-slate-500 dark:text-slate-400">· {loc.state}</span>
                  ) : null}
                </span>
                <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                  {loc.lat.toFixed(2)}, {loc.lon.toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {statusMessage && (
        <p role="status" aria-live="polite" className="mt-2.5 text-xs text-amber-800 dark:text-amber-300">
          {statusMessage}
        </p>
      )}

      <div
        className="mt-3.5 flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t('location.quickPickAria')}
      >
        {QUICK_PICK_CITIES.map((city) => {
          const isSelected =
            selectedLocation !== null &&
            selectedLocation.name.toLowerCase() === city.name.toLowerCase();
          return (
            <button
              key={city.id}
              type="button"
              onClick={() => handleSelect(city)}
              aria-pressed={isSelected}
              className={`min-h-[40px] rounded-lg px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 whitespace-nowrap shrink-0 ${
                isSelected
                  ? 'bg-teal-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {city.name}
            </button>
          );
        })}
      </div>
      {isSignedIn && savedLocations.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <span className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-hidden="true" />
            Saved ({savedLocations.length}/5):
          </span>
          {savedLocations.map((loc) => {
            const isSelected =
              selectedLocation !== null &&
              selectedLocation.name.toLowerCase() === loc.name.toLowerCase();
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => handleSelect(loc)}
                aria-pressed={isSelected}
                className={`min-h-[36px] rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'border-teal-700 bg-teal-700 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'
                }`}
              >
                {loc.name}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
