import {
  AIR_CACHE_TTL_MS,
  CPCB_BREAKPOINTS,
  CPCB_CATEGORIES,
  FRESHNESS_LIVE_MAX_MINUTES,
  FRESHNESS_RECENT_MAX_MINUTES,
  US_EPA_BREAKPOINTS,
  US_EPA_CATEGORIES,
  type AqiBreakpoint,
  type CpcbCategoryId,
  type UsEpaCategoryId,
} from '../../shared/constants.ts';
import {
  AirQualitySnapshotSchema,
  type AirQualitySnapshot,
  type WeatherSnapshot,
} from '../../shared/schemas.ts';
import type { ServerConfig } from '../config.ts';
import {
  fetchCpcbDataGov,
  fetchOpenAQv3,
  fetchOpenMeteoAir,
  fetchOpenMeteoWeather,
  fetchWaqi,
  type FetchLike,
  type RawAirReading,
} from './dataProviders.ts';

export class AirDataUnavailableError extends Error {
  public readonly statusCode = 503;
  public readonly attemptedProviders: string[];

  constructor(message: string, attemptedProviders: string[]) {
    super(message);
    this.name = 'AirDataUnavailableError';
    this.attemptedProviders = attemptedProviders;
  }
}

export function computeSubIndex(
  concentration: number | null,
  breakpoints: readonly AqiBreakpoint[]
): number | null {
  if (concentration === null || !Number.isFinite(concentration) || concentration < 0) {
    return null;
  }
  const top = breakpoints[breakpoints.length - 1];
  if (concentration >= top.cHigh) {
    return top.iHigh;
  }

  for (let i = 0; i < breakpoints.length; i++) {
    const bp = breakpoints[i];
    const next = breakpoints[i + 1];
    // Handle fractional gaps between consecutive integer breakpoints (e.g. 30.4 between 30 and 31)
    if (concentration <= bp.cHigh || (next && concentration < next.cLow)) {
      const clamped = Math.min(Math.max(concentration, bp.cLow), bp.cHigh);
      const ratio = (clamped - bp.cLow) / (bp.cHigh - bp.cLow);
      return Math.round(bp.iLow + ratio * (bp.iHigh - bp.iLow));
    }
  }
  /* v8 ignore next */
  return top.iHigh;
}

export function getCpcbCategory(aqi: number): CpcbCategoryId {
  const clamped = Math.max(0, Math.min(500, Math.round(aqi)));
  for (const cat of CPCB_CATEGORIES) {
    if (clamped >= cat.min && clamped <= cat.max) {
      return cat.id;
    }
  }
  return 'severe';
}

export function getUsEpaCategory(aqi: number): UsEpaCategoryId {
  const clamped = Math.max(0, Math.min(500, Math.round(aqi)));
  for (const cat of US_EPA_CATEGORIES) {
    if (clamped >= cat.min && clamped <= cat.max) {
      return cat.id;
    }
  }
  return 'hazardous';
}

export function calculateCpcbAqi(reading: {
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  so2: number | null;
  o3: number | null;
  co: number | null;
  reportedAqi: number | null;
}): {
  aqi: number;
  category: CpcbCategoryId;
  dominantPollutant: 'PM2.5' | 'PM10' | 'NO2' | 'SO2' | 'O3' | 'CO' | 'AQI';
} {
  const candidates: Array<{
    name: 'PM2.5' | 'PM10' | 'NO2' | 'SO2' | 'O3' | 'CO';
    value: number | null;
  }> = [
    { name: 'PM2.5', value: computeSubIndex(reading.pm25, CPCB_BREAKPOINTS.pm25) },
    { name: 'PM10', value: computeSubIndex(reading.pm10, CPCB_BREAKPOINTS.pm10) },
    { name: 'NO2', value: computeSubIndex(reading.no2, CPCB_BREAKPOINTS.no2) },
    { name: 'SO2', value: computeSubIndex(reading.so2, CPCB_BREAKPOINTS.so2) },
    { name: 'O3', value: computeSubIndex(reading.o3, CPCB_BREAKPOINTS.o3) },
    { name: 'CO', value: computeSubIndex(reading.co, CPCB_BREAKPOINTS.co) },
  ];

  let bestAqi = -1;
  let dominant: 'PM2.5' | 'PM10' | 'NO2' | 'SO2' | 'O3' | 'CO' | 'AQI' = 'AQI';

  for (const c of candidates) {
    if (c.value !== null && c.value > bestAqi) {
      bestAqi = c.value;
      dominant = c.name;
    }
  }

  if (bestAqi < 0 && reading.reportedAqi !== null) {
    bestAqi = Math.min(500, Math.max(0, Math.round(reading.reportedAqi)));
    dominant = 'AQI';
  }

  const finalAqi = Math.min(500, Math.max(0, bestAqi < 0 ? 0 : bestAqi));
  return {
    aqi: finalAqi,
    category: getCpcbCategory(finalAqi),
    dominantPollutant: dominant,
  };
}

export function calculateUsEpaAqi(reading: {
  pm25: number | null;
  pm10: number | null;
  fallbackAqi: number;
}): { aqi: number; category: UsEpaCategoryId } {
  const pm25Idx = computeSubIndex(reading.pm25, US_EPA_BREAKPOINTS.pm25);
  const pm10Idx = computeSubIndex(reading.pm10, US_EPA_BREAKPOINTS.pm10);

  let best = -1;
  if (pm25Idx !== null && pm25Idx > best) best = pm25Idx;
  if (pm10Idx !== null && pm10Idx > best) best = pm10Idx;

  const finalAqi = Math.min(500, Math.max(0, best >= 0 ? best : reading.fallbackAqi));
  return {
    aqi: finalAqi,
    category: getUsEpaCategory(finalAqi),
  };
}

export function computeFreshness(
  updatedAtIso: string,
  nowMs: number = Date.now()
): { freshness: 'live' | 'recent' | 'stale'; freshnessMinutes: number } {
  const parsed = Date.parse(updatedAtIso);
  if (Number.isNaN(parsed)) {
    return { freshness: 'stale', freshnessMinutes: FRESHNESS_RECENT_MAX_MINUTES + 1 };
  }
  const diffMinutes = Math.max(0, Math.floor((nowMs - parsed) / 60000));
  if (diffMinutes <= FRESHNESS_LIVE_MAX_MINUTES) {
    return { freshness: 'live', freshnessMinutes: diffMinutes };
  }
  if (diffMinutes <= FRESHNESS_RECENT_MAX_MINUTES) {
    return { freshness: 'recent', freshnessMinutes: diffMinutes };
  }
  return { freshness: 'stale', freshnessMinutes: diffMinutes };
}

interface CacheEntry {
  snapshot: AirQualitySnapshot;
  expiresAtMs: number;
}

export class AirCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = AIR_CACHE_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  public static buildKey(lat: number, lon: number): string {
    return `${lat.toFixed(2)},${lon.toFixed(2)}`;
  }

  public get(lat: number, lon: number, nowMs: number = Date.now()): AirQualitySnapshot | null {
    const key = AirCache.buildKey(lat, lon);
    const entry = this.store.get(key);
    if (!entry) return null;
    if (nowMs >= entry.expiresAtMs) {
      this.store.delete(key);
      return null;
    }
    return { ...entry.snapshot, cacheHit: true };
  }

  public set(lat: number, lon: number, snapshot: AirQualitySnapshot, nowMs: number = Date.now()): void {
    const key = AirCache.buildKey(lat, lon);
    this.store.set(key, {
      snapshot: { ...snapshot, cacheHit: false },
      expiresAtMs: nowMs + this.ttlMs,
    });
  }

  public clear(): void {
    this.store.clear();
  }

  public size(): number {
    return this.store.size;
  }
}

export interface AirServiceDeps {
  config: ServerConfig;
  cache?: AirCache;
  fetchFn?: FetchLike;
  nowFn?: () => number;
}

export interface LiveAirRequest {
  lat: number;
  lon: number;
  city?: string;
  state?: string;
  bypassCache?: boolean;
}

export class AirService {
  private readonly config: ServerConfig;
  private readonly cache: AirCache;
  private readonly fetchFn?: FetchLike;
  private readonly nowFn: () => number;

  constructor(deps: AirServiceDeps) {
    this.config = deps.config;
    this.cache = deps.cache ?? new AirCache(deps.config.airCacheTtlMs);
    this.fetchFn = deps.fetchFn;
    this.nowFn = deps.nowFn ?? (() => Date.now());
  }

  public async getLiveAirSnapshot(req: LiveAirRequest): Promise<AirQualitySnapshot> {
    const nowMs = this.nowFn();

    if (!req.bypassCache) {
      const cached = this.cache.get(req.lat, req.lon, nowMs);
      if (cached) {
        const fresh = computeFreshness(cached.updatedAtIso, nowMs);
        return {
          ...cached,
          freshness: fresh.freshness,
          freshnessMinutes: fresh.freshnessMinutes,
          location: {
            ...cached.location,
            name: req.city || cached.location.name,
            state: req.state ?? cached.location.state,
          },
        };
      }
    }

    const providerOpts = {
      fetchFn: this.fetchFn,
      timeoutMs: this.config.providerTimeoutMs,
    };

    // Fetch weather in parallel without letting a weather blip block real air data
    const weatherPromise: Promise<WeatherSnapshot | null> = fetchOpenMeteoWeather(
      req.lat,
      req.lon,
      providerOpts
    ).catch(() => null);

    const attempted: string[] = [];
    let rawReading: RawAirReading | null = null;

    const tryProvider = async (
      name: string,
      fn: () => Promise<RawAirReading | null>
    ): Promise<void> => {
      if (rawReading) return;
      attempted.push(name);
      try {
        const result = await fn();
        if (result) {
          rawReading = result;
        }
      } catch {
        // Move to next provider in fallback chain
      }
    };

    if (this.config.openAqApiKey) {
      await tryProvider('openaq', () =>
        fetchOpenAQv3(req.lat, req.lon, this.config.openAqApiKey, providerOpts)
      );
    }
    if (this.config.dataGovInApiKey && req.city) {
      await tryProvider('cpcb_datagov', () =>
        fetchCpcbDataGov(req.city, this.config.dataGovInApiKey, providerOpts)
      );
    }
    if (this.config.waqiApiToken) {
      await tryProvider('waqi', () =>
        fetchWaqi(req.lat, req.lon, this.config.waqiApiToken, providerOpts)
      );
    }
    await tryProvider('open_meteo', () => fetchOpenMeteoAir(req.lat, req.lon, providerOpts));

    const weather = await weatherPromise;

    if (!rawReading) {
      throw new AirDataUnavailableError(
        'Live air quality data is temporarily unavailable from all providers. Please try again shortly.',
        attempted
      );
    }

    const reading: RawAirReading = rawReading;
    const cpcb = calculateCpcbAqi(reading);
    const epa = calculateUsEpaAqi({
      pm25: reading.pm25,
      pm10: reading.pm10,
      fallbackAqi: cpcb.aqi,
    });
    const fresh = computeFreshness(reading.updatedAtIso, nowMs);

    const snapshot = AirQualitySnapshotSchema.parse({
      location: {
        name: req.city || `Location (${req.lat.toFixed(2)}, ${req.lon.toFixed(2)})`,
        state: req.state ?? '',
        lat: Math.round(req.lat * 10000) / 10000,
        lon: Math.round(req.lon * 10000) / 10000,
      },
      aqi: cpcb.aqi,
      cpcbCategory: cpcb.category,
      usEpaAqi: epa.aqi,
      usEpaCategory: epa.category,
      pm25: reading.pm25,
      pm10: reading.pm10,
      no2: reading.no2,
      so2: reading.so2,
      o3: reading.o3,
      co: reading.co,
      dominantPollutant: cpcb.dominantPollutant,
      weather,
      source: reading.source,
      updatedAtIso: reading.updatedAtIso,
      fetchedAtIso: new Date(nowMs).toISOString(),
      freshness: fresh.freshness,
      freshnessMinutes: fresh.freshnessMinutes,
      cacheHit: false,
    });

    this.cache.set(req.lat, req.lon, snapshot, nowMs);
    return snapshot;
  }

  public clearCache(): void {
    this.cache.clear();
  }
}
