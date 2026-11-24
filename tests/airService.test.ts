import { describe, expect, it, vi } from 'vitest';
import { CPCB_BREAKPOINTS } from '../shared/constants.ts';
import { loadConfig } from '../server/config.ts';
import {
  AirCache,
  AirDataUnavailableError,
  AirService,
  calculateCpcbAqi,
  calculateUsEpaAqi,
  computeFreshness,
  computeSubIndex,
  getCpcbCategory,
  getUsEpaCategory,
} from '../server/services/airService.ts';

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AQI calculation and category mapping', () => {
  it('maps CPCB AQI values across all 6 official categories including boundaries', () => {
    expect(getCpcbCategory(-5)).toBe('good');
    expect(getCpcbCategory(0)).toBe('good');
    expect(getCpcbCategory(50)).toBe('good');
    expect(getCpcbCategory(51)).toBe('satisfactory');
    expect(getCpcbCategory(100)).toBe('satisfactory');
    expect(getCpcbCategory(101)).toBe('moderate');
    expect(getCpcbCategory(200)).toBe('moderate');
    expect(getCpcbCategory(201)).toBe('poor');
    expect(getCpcbCategory(300)).toBe('poor');
    expect(getCpcbCategory(301)).toBe('very_poor');
    expect(getCpcbCategory(400)).toBe('very_poor');
    expect(getCpcbCategory(401)).toBe('severe');
    expect(getCpcbCategory(500)).toBe('severe');
    expect(getCpcbCategory(999)).toBe('severe');
  });

  it('maps US EPA AQI values across all 6 categories', () => {
    expect(getUsEpaCategory(25)).toBe('good');
    expect(getUsEpaCategory(75)).toBe('moderate');
    expect(getUsEpaCategory(125)).toBe('unhealthy_sensitive');
    expect(getUsEpaCategory(175)).toBe('unhealthy');
    expect(getUsEpaCategory(250)).toBe('very_unhealthy');
    expect(getUsEpaCategory(350)).toBe('hazardous');
    expect(getUsEpaCategory(650)).toBe('hazardous');
  });

  it('computes sub-indices accurately including null, negative, fractional gap, and cap values', () => {
    expect(computeSubIndex(null, CPCB_BREAKPOINTS.pm25)).toBeNull();
    expect(computeSubIndex(-1, CPCB_BREAKPOINTS.pm25)).toBeNull();
    expect(computeSubIndex(Number.NaN, CPCB_BREAKPOINTS.pm25)).toBeNull();
    expect(computeSubIndex(0, CPCB_BREAKPOINTS.pm25)).toBe(0);
    expect(computeSubIndex(30, CPCB_BREAKPOINTS.pm25)).toBe(50);
    // Fractional gap between 30 and 31 clamps cleanly to 50
    expect(computeSubIndex(30.4, CPCB_BREAKPOINTS.pm25)).toBe(50);
    expect(computeSubIndex(90, CPCB_BREAKPOINTS.pm25)).toBe(200);
    expect(computeSubIndex(600, CPCB_BREAKPOINTS.pm25)).toBe(500);
  });

  it('identifies dominant pollutant and handles reportedAqi fallback', () => {
    const pm25Dominant = calculateCpcbAqi({
      pm25: 185,
      pm10: 140,
      no2: 35,
      so2: 12,
      o3: 40,
      co: 0.8,
      reportedAqi: null,
    });
    expect(pm25Dominant.dominantPollutant).toBe('PM2.5');
    expect(pm25Dominant.category).toBe('very_poor');
    expect(pm25Dominant.aqi).toBeGreaterThanOrEqual(301);

    const pm10Dominant = calculateCpcbAqi({
      pm25: 20,
      pm10: 320,
      no2: null,
      so2: null,
      o3: null,
      co: null,
      reportedAqi: null,
    });
    expect(pm10Dominant.dominantPollutant).toBe('PM10');
    expect(pm10Dominant.category).toBe('poor');

    const reportedOnly = calculateCpcbAqi({
      pm25: null,
      pm10: null,
      no2: null,
      so2: null,
      o3: null,
      co: null,
      reportedAqi: 245,
    });
    expect(reportedOnly).toEqual({ aqi: 245, category: 'poor', dominantPollutant: 'AQI' });

    const allEmpty = calculateCpcbAqi({
      pm25: null,
      pm10: null,
      no2: null,
      so2: null,
      o3: null,
      co: null,
      reportedAqi: null,
    });
    expect(allEmpty).toEqual({ aqi: 0, category: 'good', dominantPollutant: 'AQI' });
  });

  it('calculates US EPA AQI from PM2.5, PM10, or fallback AQI', () => {
    const highPm25 = calculateUsEpaAqi({ pm25: 150, pm10: 80, fallbackAqi: 200 });
    expect(highPm25.category).toBe('very_unhealthy');

    const highPm10 = calculateUsEpaAqi({ pm25: 5, pm10: 300, fallbackAqi: 100 });
    expect(highPm10.aqi).toBeGreaterThan(150);

    const fallback = calculateUsEpaAqi({ pm25: null, pm10: null, fallbackAqi: 180 });
    expect(fallback).toEqual({ aqi: 180, category: 'unhealthy' });
  });
});

describe('Freshness calculation and AirCache', () => {
  it('classifies live, recent, stale, and invalid timestamps', () => {
    const now = Date.parse('2026-11-20T12:00:00Z');
    expect(computeFreshness('2026-11-20T11:45:00Z', now)).toEqual({
      freshness: 'live',
      freshnessMinutes: 15,
    });
    expect(computeFreshness('2026-11-20T11:00:00Z', now)).toEqual({
      freshness: 'recent',
      freshnessMinutes: 60,
    });
    expect(computeFreshness('2026-11-20T09:00:00Z', now)).toEqual({
      freshness: 'stale',
      freshnessMinutes: 180,
    });
    expect(computeFreshness('not-a-date', now).freshness).toBe('stale');
  });

  it('caches by rounded coordinates, respects TTL expiry, and supports clear', () => {
    const cache = new AirCache(60_000);
    const now = 1_000_000;
    const sample = {
      location: { name: 'Delhi', state: 'Delhi', lat: 28.6139, lon: 77.209 },
      aqi: 340,
      cpcbCategory: 'very_poor' as const,
      usEpaAqi: 230,
      usEpaCategory: 'very_unhealthy' as const,
      pm25: 170,
      pm10: 260,
      no2: 45,
      so2: 12,
      o3: 30,
      co: 1.4,
      dominantPollutant: 'PM2.5' as const,
      weather: null,
      source: { id: 'open_meteo' as const, name: 'Open-Meteo Air Quality (Modelled)', isModelled: true, stationName: null },
      updatedAtIso: new Date(now).toISOString(),
      fetchedAtIso: new Date(now).toISOString(),
      freshness: 'live' as const,
      freshnessMinutes: 0,
      cacheHit: false,
    };

    expect(cache.get(28.6139, 77.209, now)).toBeNull();
    cache.set(28.6139, 77.209, sample, now);
    expect(cache.size()).toBe(1);

    const hit = cache.get(28.6141, 77.2089, now + 10_000);
    expect(hit?.cacheHit).toBe(true);

    const expired = cache.get(28.6139, 77.209, now + 60_001);
    expect(expired).toBeNull();
    expect(cache.size()).toBe(0);

    cache.set(28.6139, 77.209, sample, now);
    cache.clear();
    expect(cache.size()).toBe(0);
  });
});

describe('AirService fallback chain, caching, and error handling', () => {
  const fixedNow = Date.parse('2026-11-20T10:30:00Z');
  const weatherOk = {
    current: {
      temperature_2m: 18.4,
      relative_humidity_2m: 62,
      wind_speed_10m: 6.5,
      wind_direction_10m: 280,
      weather_code: 45,
    },
  };

  it('uses OpenAQ primary provider when configured and caches subsequent reads', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('api.openaq.org/v3/locations?')) {
        return mockJsonResponse({
          results: [
            {
              id: 101,
              name: 'ITO Delhi CPCB',
              sensors: [
                { id: 1, parameter: { name: 'pm25' } },
                { id: 2, parameter: { name: 'pm10' } },
              ],
            },
          ],
        });
      }
      if (url.includes('api.openaq.org/v3/locations/101/latest')) {
        return mockJsonResponse({
          results: [
            { sensorsId: 1, value: 145, datetime: { utc: '2026-11-20T10:15:00Z' } },
            { sensorsId: 2, value: 240, datetime: { utc: '2026-11-20T10:15:00Z' } },
          ],
        });
      }
      if (url.includes('api.open-meteo.com/v1/forecast')) {
        return mockJsonResponse(weatherOk);
      }
      return mockJsonResponse({}, 404);
    });

    const config = loadConfig({ OPENAQ_API_KEY: 'test-oaq', AIR_CACHE_TTL_MS: '600000' });
    const service = new AirService({ config, fetchFn: fetchMock, nowFn: () => fixedNow });

    const first = await service.getLiveAirSnapshot({
      lat: 28.6139,
      lon: 77.209,
      city: 'Delhi',
      state: 'Delhi',
    });

    expect(first.source.id).toBe('openaq');
    expect(first.source.isModelled).toBe(false);
    expect(first.source.stationName).toBe('ITO Delhi CPCB');
    expect(first.pm25).toBe(145);
    expect(first.cpcbCategory).toBe('very_poor');
    expect(first.weather?.temperatureC).toBe(18.4);
    expect(first.cacheHit).toBe(false);

    // Second call hits cache without calling fetch again
    const callsBefore = fetchMock.mock.calls.length;
    const second = await service.getLiveAirSnapshot({ lat: 28.6139, lon: 77.209, city: 'Delhi' });
    expect(second.cacheHit).toBe(true);
    expect(fetchMock.mock.calls.length).toBe(callsBefore);

    // Bypass cache triggers fresh fetch
    const third = await service.getLiveAirSnapshot({
      lat: 28.6139,
      lon: 77.209,
      city: 'Delhi',
      bypassCache: true,
    });
    expect(third.cacheHit).toBe(false);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore);

    service.clearCache();
  });

  it('falls back through OpenAQ -> CPCB -> WAQI -> Open-Meteo when earlier providers fail', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('api.openaq.org')) return mockJsonResponse({}, 500);
      if (url.includes('api.data.gov.in')) return mockJsonResponse({ records: [] });
      if (url.includes('api.waqi.info')) return mockJsonResponse({ status: 'error' });
      if (url.includes('air-quality-api.open-meteo.com')) {
        return mockJsonResponse({
          current: {
            time: '2026-11-20T10:00',
            pm2_5: 88.5,
            pm10: 132,
            nitrogen_dioxide: 38,
            sulphur_dioxide: 11,
            ozone: 42,
            carbon_monoxide: 1200,
          },
        });
      }
      if (url.includes('api.open-meteo.com/v1/forecast')) {
        throw new Error('Weather timeout');
      }
      return mockJsonResponse({}, 404);
    });

    const config = loadConfig({
      OPENAQ_API_KEY: 'oaq-key',
      DATA_GOV_IN_API_KEY: 'gov-key',
      WAQI_API_TOKEN: 'waqi-key',
    });
    const service = new AirService({ config, fetchFn: fetchMock, nowFn: () => fixedNow });

    const snap = await service.getLiveAirSnapshot({ lat: 26.8467, lon: 80.9462, city: 'Lucknow' });
    expect(snap.source.id).toBe('open_meteo');
    expect(snap.source.isModelled).toBe(true);
    expect(snap.pm25).toBe(88.5);
    expect(snap.co).toBe(1.2);
    expect(snap.weather).toBeNull();
    expect(snap.freshness).toBe('live');
  });

  it('uses CPCB data.gov.in when OpenAQ fails and CPCB returns records', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('api.data.gov.in')) {
        return mockJsonResponse({
          records: [
            { station: 'Talkatora, Lucknow', pollutant_id: 'PM2.5', avg_value: '110', last_update: '2026-11-20T10:00:00Z' },
            { station: 'Talkatora, Lucknow', pollutant_id: 'PM10', avg_value: '190', last_update: '2026-11-20T10:00:00Z' },
          ],
        });
      }
      if (url.includes('api.open-meteo.com/v1/forecast')) return mockJsonResponse(weatherOk);
      return mockJsonResponse({}, 500);
    });

    const config = loadConfig({ DATA_GOV_IN_API_KEY: 'gov-key' });
    const service = new AirService({ config, fetchFn: fetchMock, nowFn: () => fixedNow });
    const snap = await service.getLiveAirSnapshot({ lat: 26.8467, lon: 80.9462, city: 'Lucknow' });
    expect(snap.source.id).toBe('cpcb_datagov');
    expect(snap.source.stationName).toBe('Talkatora, Lucknow');
    expect(snap.cpcbCategory).toBe('poor');
  });

  it('uses WAQI when configured and earlier providers are skipped or fail', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('api.waqi.info')) {
        return mockJsonResponse({
          status: 'ok',
          data: {
            aqi: 155,
            city: { name: 'Bandra, Mumbai' },
            time: { iso: '2026-11-20T10:05:00Z' },
            iaqi: { pm25: { v: 64 }, pm10: { v: 112 } },
          },
        });
      }
      if (url.includes('api.open-meteo.com/v1/forecast')) return mockJsonResponse(weatherOk);
      return mockJsonResponse({}, 500);
    });

    const config = loadConfig({ WAQI_API_TOKEN: 'waqi-token' });
    const service = new AirService({ config, fetchFn: fetchMock, nowFn: () => fixedNow });
    const snap = await service.getLiveAirSnapshot({ lat: 19.076, lon: 72.8777 });
    expect(snap.source.id).toBe('waqi');
    expect(snap.location.name).toContain('19.08');
  });

  it('throws AirDataUnavailableError (503) and never fabricates values when all providers fail', async () => {
    const fetchMock = vi.fn(async () => mockJsonResponse({ error: 'down' }, 503));
    const config = loadConfig({ OPENAQ_API_KEY: 'oaq', WAQI_API_TOKEN: 'waqi' });
    const service = new AirService({ config, fetchFn: fetchMock, nowFn: () => fixedNow });

    await expect(
      service.getLiveAirSnapshot({ lat: 28.6139, lon: 77.209, city: 'Delhi' })
    ).rejects.toThrow(AirDataUnavailableError);

    try {
      await service.getLiveAirSnapshot({ lat: 28.6139, lon: 77.209, city: 'Delhi' });
    } catch (err) {
      expect(err).toBeInstanceOf(AirDataUnavailableError);
      const typed = err as AirDataUnavailableError;
      expect(typed.statusCode).toBe(503);
      expect(typed.attemptedProviders).toEqual(['openaq', 'waqi', 'open_meteo']);
    }
  });
});

describe('Config loader', () => {
  it('applies safe defaults and parses custom env vars cleanly', () => {
    const defaults = loadConfig({});
    expect(defaults.port).toBe(3000);
    expect(defaults.geminiModel).toBe('gemini-4-hydrogen');
    expect(defaults.airCacheTtlMs).toBe(720_000);

    const custom = loadConfig({
      PORT: '8080',
      GEMINI_MODEL: 'gemini-4-neon',
      CORS_ALLOWED_ORIGINS: 'https://a.example.com, https://b.example.com',
      AIR_CACHE_TTL_MS: 'invalid',
      PROVIDER_TIMEOUT_MS: '-5',
    });
    expect(custom.port).toBe(8080);
    expect(custom.geminiModel).toBe('gemini-4-neon');
    expect(custom.corsAllowedOrigins).toEqual(['https://a.example.com', 'https://b.example.com']);
    expect(custom.airCacheTtlMs).toBe(720_000);
    expect(custom.providerTimeoutMs).toBe(6000);
  });
});
