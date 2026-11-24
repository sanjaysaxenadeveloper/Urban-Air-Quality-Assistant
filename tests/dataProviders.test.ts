import { describe, expect, it, vi } from 'vitest';
import {
  fetchCpcbDataGov,
  fetchOpenAQv3,
  fetchOpenMeteoAir,
  fetchOpenMeteoWeather,
  fetchWaqi,
  reverseGeocodeIndia,
  searchIndianLocations,
} from '../server/services/dataProviders.ts';

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('dataProviders unit tests', () => {
  it('OpenAQ v3 parses all pollutants, converts high CO ug/m3 to mg/m3, and handles empty results', async () => {
    expect(await fetchOpenAQv3(28.6, 77.2, '')).toBeNull();

    const emptyFetch = vi.fn(async () => jsonRes({ results: [] }));
    expect(await fetchOpenAQv3(28.6, 77.2, 'key', { fetchFn: emptyFetch })).toBeNull();

    const noReadingsFetch = vi.fn(async (url: string | URL) => {
      if (String(url).includes('/latest')) return jsonRes({ results: [{ sensorsId: 99, value: -5 }] });
      return jsonRes({ results: [{ id: 5, name: 'Station', sensors: [{ id: 1, parameter: { name: 'pm25' } }] }] });
    });
    expect(await fetchOpenAQv3(28.6, 77.2, 'key', { fetchFn: noReadingsFetch })).toBeNull();

    const fullFetch = vi.fn(async (url: string | URL) => {
      if (String(url).includes('/latest')) {
        return jsonRes({
          results: [
            { sensorsId: 1, value: 42.34, datetime: { utc: '2026-11-20T09:00:00Z' } },
            { sensorsId: 2, value: 85, datetime: { utc: '2026-11-20T10:00:00Z' } },
            { sensorsId: 3, value: 30 },
            { sensorsId: 4, value: 12 },
            { sensorsId: 5, value: 45 },
            { sensorsId: 6, value: 1500 }, // ug/m3 -> 1.5 mg/m3
          ],
        });
      }
      return jsonRes({
        results: [
          {
            id: 7,
            name: 'Anand Vihar',
            sensors: [
              { id: 1, parameter: { name: 'pm25' } },
              { id: 2, parameter: { name: 'pm10' } },
              { id: 3, parameter: { name: 'no2' } },
              { id: 4, parameter: { name: 'so2' } },
              { id: 5, parameter: { name: 'o3' } },
              { id: 6, parameter: { name: 'co' } },
            ],
          },
        ],
      });
    });

    const reading = await fetchOpenAQv3(28.6, 77.2, 'key', { fetchFn: fullFetch });
    expect(reading).not.toBeNull();
    expect(reading?.pm25).toBe(42.3);
    expect(reading?.no2).toBe(30);
    expect(reading?.so2).toBe(12);
    expect(reading?.o3).toBe(45);
    expect(reading?.co).toBe(1.5);
    expect(reading?.updatedAtIso).toBe('2026-11-20T10:00:00Z');
  });

  it('CPCB data.gov.in parses multiple pollutants and returns null when missing key/city/valid values', async () => {
    expect(await fetchCpcbDataGov('Delhi', '')).toBeNull();
    expect(await fetchCpcbDataGov(undefined, 'key')).toBeNull();

    const invalidOnly = vi.fn(async () =>
      jsonRes({ records: [{ station: 'S1', pollutant_id: 'PM2.5', avg_value: 'NA' }] })
    );
    expect(await fetchCpcbDataGov('Delhi', 'key', { fetchFn: invalidOnly })).toBeNull();

    const fullFetch = vi.fn(async () =>
      jsonRes({
        records: [
          { station: 'Mandir Marg', pollutant_id: 'PM2.5', avg_value: '95', last_update: '2026-11-20T08:00:00Z' },
          { station: 'Mandir Marg', pollutant_id: 'NO2', avg_value: '40' },
          { station: 'Mandir Marg', pollutant_id: 'SO2', avg_value: '14' },
          { station: 'Mandir Marg', pollutant_id: 'OZONE', avg_value: '36' },
          { station: 'Mandir Marg', pollutant_id: 'CO', avg_value: '1.1' },
          { station: 'Other Station', pollutant_id: 'PM2.5', avg_value: '400' },
        ],
      })
    );
    const res = await fetchCpcbDataGov('Delhi', 'key', { fetchFn: fullFetch });
    expect(res?.pm25).toBe(95);
    expect(res?.no2).toBe(40);
    expect(res?.so2).toBe(14);
    expect(res?.o3).toBe(36);
    expect(res?.co).toBe(1.1);
  });

  it('WAQI parses readings and rejects empty or non-ok payloads', async () => {
    expect(await fetchWaqi(28.6, 77.2, '')).toBeNull();

    const emptyData = vi.fn(async () => jsonRes({ status: 'ok', data: { aqi: '-', iaqi: {} } }));
    expect(await fetchWaqi(28.6, 77.2, 'tok', { fetchFn: emptyData })).toBeNull();

    const okFetch = vi.fn(async () =>
      jsonRes({
        status: 'ok',
        data: {
          aqi: 210,
          city: { name: 'Patna' },
          iaqi: { pm25: { v: 105 }, pm10: { v: 180 }, no2: { v: 25 }, so2: { v: 9 }, o3: { v: 30 }, co: { v: 1.2 } },
        },
      })
    );
    const res = await fetchWaqi(25.59, 85.13, 'tok', { fetchFn: okFetch });
    expect(res?.reportedAqi).toBe(210);
    expect(res?.pm25).toBe(105);
  });

  it('Open-Meteo Air Quality and Weather handle valid, malformed, and missing payloads', async () => {
    const emptyAir = vi.fn(async () => jsonRes({}));
    expect(await fetchOpenMeteoAir(28.6, 77.2, { fetchFn: emptyAir })).toBeNull();

    const nullPollutants = vi.fn(async () => jsonRes({ current: { time: '2026-11-20T10:00' } }));
    expect(await fetchOpenMeteoAir(28.6, 77.2, { fetchFn: nullPollutants })).toBeNull();

    const badTimeAir = vi.fn(async () => jsonRes({ current: { time: 'invalid-time', pm2_5: 50 } }));
    const resAir = await fetchOpenMeteoAir(28.6, 77.2, { fetchFn: badTimeAir });
    expect(resAir?.pm25).toBe(50);
    expect(resAir?.source.isModelled).toBe(true);

    const badWeather = vi.fn(async () => jsonRes({ current: { temperature_2m: 20 } }));
    expect(await fetchOpenMeteoWeather(28.6, 77.2, { fetchFn: badWeather })).toBeNull();

    const goodWeather = vi.fn(async () =>
      jsonRes({
        current: {
          temperature_2m: 22.66,
          relative_humidity_2m: 105,
          wind_speed_10m: 8.23,
        },
      })
    );
    const w = await fetchOpenMeteoWeather(28.6, 77.2, { fetchFn: goodWeather });
    expect(w).toEqual({
      temperatureC: 22.7,
      humidityPct: 100,
      windSpeedKmh: 8.2,
      windDirectionDeg: null,
      weatherCode: null,
      sourceName: 'Open-Meteo Weather',
    });
  });

  it('India geocoding filters non-India results and falls back to Nominatim', async () => {
    const omFetch = vi.fn(async () =>
      jsonRes({
        results: [
          { id: 1, name: 'Jaipur', admin1: 'Rajasthan', country_code: 'IN', latitude: 26.9124, longitude: 75.7873 },
          { id: 2, name: 'London', admin1: 'England', country_code: 'GB', latitude: 51.5072, longitude: -0.1276 },
        ],
      })
    );
    const primary = await searchIndianLocations('Jaipur', { fetchFn: omFetch });
    expect(primary).toHaveLength(1);
    expect(primary[0].name).toBe('Jaipur');

    // Primary throws -> Nominatim fallback succeeds and filters out-of-India coords
    const fallbackFetch = vi.fn(async (url: string | URL) => {
      if (String(url).includes('geocoding-api.open-meteo.com')) {
        throw new Error('Open-Meteo down');
      }
      return jsonRes([
        {
          place_id: 42,
          lat: '12.9716',
          lon: '77.5946',
          address: { suburb: 'Indiranagar', state: 'Karnataka' },
        },
        {
          place_id: 43,
          lat: '48.8566',
          lon: '2.3522',
          address: { city: 'Paris' },
        },
      ]);
    });
    const fallback = await searchIndianLocations('Indiranagar', { fetchFn: fallbackFetch });
    expect(fallback).toHaveLength(1);
    expect(fallback[0].name).toBe('Indiranagar');
    expect(fallback[0].state).toBe('Karnataka');
  });

  it('reverseGeocodeIndia resolves locality and falls back cleanly on error', async () => {
    const okFetch = vi.fn(async () =>
      jsonRes({
        address: {
          suburb: 'Hauz Khas',
          city: 'New Delhi',
          state: 'Delhi',
        },
      })
    );
    const loc = await reverseGeocodeIndia(28.5494, 77.2001, { fetchFn: okFetch });
    expect(loc.name).toBe('Hauz Khas, New Delhi');
    expect(loc.state).toBe('Delhi');

    const failFetch = vi.fn(async () => {
      throw new Error('Network error');
    });
    const fallback = await reverseGeocodeIndia(28.5494, 77.2001, { fetchFn: failFetch });
    expect(fallback.name).toContain('Current Location');
    expect(fallback.state).toBe('India');
  });
});
