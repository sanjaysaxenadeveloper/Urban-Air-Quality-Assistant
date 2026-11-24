import { INDIA_BOUNDS } from '../../shared/constants.ts';
import type { AirSource, IndianLocation, WeatherSnapshot } from '../../shared/schemas.ts';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface RawAirReading {
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  so2: number | null;
  o3: number | null;
  co: number | null; // mg/m3
  reportedAqi: number | null;
  source: AirSource;
  updatedAtIso: string;
}

export interface ProviderOptions {
  fetchFn?: FetchLike;
  timeoutMs?: number;
}

function isWithinIndia(lat: number, lon: number): boolean {
  return (
    lat >= INDIA_BOUNDS.minLat &&
    lat <= INDIA_BOUNDS.maxLat &&
    lon >= INDIA_BOUNDS.minLon &&
    lon <= INDIA_BOUNDS.maxLon
  );
}

function toFiniteNonNegative(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
    return Math.round(val * 10) / 10;
  }
  if (typeof val === 'string' && val.trim() !== '') {
    const parsed = Number(val);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.round(parsed * 10) / 10;
    }
  }
  return null;
}

async function fetchJsonWithTimeout(
  url: string,
  options: {
    headers?: Record<string, string>;
    fetchFn: FetchLike;
    timeoutMs: number;
  }
): Promise<unknown> {
  const signal = AbortSignal.timeout(options.timeoutMs);
  const res = await options.fetchFn(url, {
    headers: options.headers,
    signal,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  }
  return res.json();
}

/**
 * Primary Provider 1: OpenAQ v3 ground monitoring stations near coordinates.
 * Requires OPENAQ_API_KEY; returns null cleanly if unconfigured or no nearby stations have readings.
 */
export async function fetchOpenAQv3(
  lat: number,
  lon: number,
  apiKey: string,
  opts: ProviderOptions = {}
): Promise<RawAirReading | null> {
  if (!apiKey) return null;
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 6000;
  const headers = { 'X-API-Key': apiKey, Accept: 'application/json' };

  const locUrl = `https://api.openaq.org/v3/locations?coordinates=${lat.toFixed(4)},${lon.toFixed(4)}&radius=25000&limit=3`;
  const locData = (await fetchJsonWithTimeout(locUrl, { headers, fetchFn, timeoutMs })) as {
    results?: Array<{
      id: number;
      name?: string;
      sensors?: Array<{ id: number; parameter?: { name?: string } }>;
    }>;
  };

  const station = locData.results?.[0];
  if (!station?.id) return null;

  const latestUrl = `https://api.openaq.org/v3/locations/${station.id}/latest`;
  const latestData = (await fetchJsonWithTimeout(latestUrl, { headers, fetchFn, timeoutMs })) as {
    results?: Array<{
      sensorsId?: number;
      value?: number;
      datetime?: { utc?: string };
    }>;
  };

  const sensorMap = new Map<number, string>();
  for (const sensor of station.sensors ?? []) {
    if (sensor.id && sensor.parameter?.name) {
      sensorMap.set(sensor.id, sensor.parameter.name.toLowerCase());
    }
  }

  let pm25: number | null = null;
  let pm10: number | null = null;
  let no2: number | null = null;
  let so2: number | null = null;
  let o3: number | null = null;
  let co: number | null = null;
  let latestTimestamp: string | null = null;

  for (const item of latestData.results ?? []) {
    const param = item.sensorsId ? sensorMap.get(item.sensorsId) : undefined;
    const val = toFiniteNonNegative(item.value);
    if (!param || val === null) continue;

    if (param === 'pm25') pm25 = val;
    else if (param === 'pm10') pm10 = val;
    else if (param === 'no2') no2 = val;
    else if (param === 'so2') so2 = val;
    else if (param === 'o3') o3 = val;
    else if (param === 'co') co = val > 50 ? Math.round((val / 1000) * 100) / 100 : val;

    if (item.datetime?.utc && (!latestTimestamp || item.datetime.utc > latestTimestamp)) {
      latestTimestamp = item.datetime.utc;
    }
  }

  if (pm25 === null && pm10 === null && no2 === null && so2 === null && o3 === null && co === null) {
    return null;
  }

  return {
    pm25,
    pm10,
    no2,
    so2,
    o3,
    co,
    reportedAqi: null,
    source: {
      id: 'openaq',
      name: 'OpenAQ Ground Station',
      isModelled: false,
      stationName: station.name ?? null,
    },
    updatedAtIso: latestTimestamp ?? new Date().toISOString(),
  };
}

/**
 * Primary Provider 2: Official Indian CPCB real-time dataset via data.gov.in.
 * Requires DATA_GOV_IN_API_KEY and city name.
 */
export async function fetchCpcbDataGov(
  city: string | undefined,
  apiKey: string,
  opts: ProviderOptions = {}
): Promise<RawAirReading | null> {
  if (!apiKey || !city) return null;
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 6000;

  const url =
    `https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69` +
    `?api-key=${encodeURIComponent(apiKey)}&format=json&limit=30&filters[city]=${encodeURIComponent(city)}`;

  const data = (await fetchJsonWithTimeout(url, { fetchFn, timeoutMs })) as {
    records?: Array<{
      station?: string;
      pollutant_id?: string;
      avg_value?: string | number;
      last_update?: string;
    }>;
  };

  const records = data.records ?? [];
  if (records.length === 0) return null;

  const primaryStation = records[0].station ?? null;
  const stationRecords = primaryStation
    ? records.filter((r) => r.station === primaryStation)
    : records;

  let pm25: number | null = null;
  let pm10: number | null = null;
  let no2: number | null = null;
  let so2: number | null = null;
  let o3: number | null = null;
  let co: number | null = null;
  let updatedAtIso = new Date().toISOString();

  for (const rec of stationRecords) {
    const id = rec.pollutant_id?.toUpperCase();
    const val = toFiniteNonNegative(rec.avg_value);
    if (!id || val === null) continue;
    if (id === 'PM2.5') pm25 = val;
    else if (id === 'PM10') pm10 = val;
    else if (id === 'NO2') no2 = val;
    else if (id === 'SO2') so2 = val;
    else if (id === 'OZONE' || id === 'O3') o3 = val;
    else if (id === 'CO') co = val;

    if (rec.last_update) {
      const parsed = Date.parse(rec.last_update);
      if (!Number.isNaN(parsed)) {
        updatedAtIso = new Date(parsed).toISOString();
      }
    }
  }

  if (pm25 === null && pm10 === null && no2 === null && so2 === null && o3 === null && co === null) {
    return null;
  }

  return {
    pm25,
    pm10,
    no2,
    so2,
    o3,
    co,
    reportedAqi: null,
    source: {
      id: 'cpcb_datagov',
      name: 'CPCB India (data.gov.in)',
      isModelled: false,
      stationName: primaryStation,
    },
    updatedAtIso,
  };
}

/**
 * Fallback Provider 3: WAQI (World Air Quality Index) geo feed.
 * Requires WAQI_API_TOKEN.
 */
export async function fetchWaqi(
  lat: number,
  lon: number,
  token: string,
  opts: ProviderOptions = {}
): Promise<RawAirReading | null> {
  if (!token) return null;
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 6000;

  const url = `https://api.waqi.info/feed/geo:${lat.toFixed(4)};${lon.toFixed(4)}/?token=${encodeURIComponent(token)}`;
  const payload = (await fetchJsonWithTimeout(url, { fetchFn, timeoutMs })) as {
    status?: string;
    data?: {
      aqi?: number | string;
      city?: { name?: string };
      time?: { iso?: string };
      iaqi?: Record<string, { v?: number }>;
    };
  };

  if (payload.status !== 'ok' || !payload.data) return null;

  const iaqi = payload.data.iaqi ?? {};
  const pm25 = toFiniteNonNegative(iaqi.pm25?.v);
  const pm10 = toFiniteNonNegative(iaqi.pm10?.v);
  const no2 = toFiniteNonNegative(iaqi.no2?.v);
  const so2 = toFiniteNonNegative(iaqi.so2?.v);
  const o3 = toFiniteNonNegative(iaqi.o3?.v);
  const co = toFiniteNonNegative(iaqi.co?.v);
  const reportedAqi = toFiniteNonNegative(payload.data.aqi);

  if (pm25 === null && pm10 === null && reportedAqi === null) {
    return null;
  }

  return {
    pm25,
    pm10,
    no2,
    so2,
    o3,
    co,
    reportedAqi,
    source: {
      id: 'waqi',
      name: 'WAQI Monitoring Station',
      isModelled: false,
      stationName: payload.data.city?.name ?? null,
    },
    updatedAtIso: payload.data.time?.iso ?? new Date().toISOString(),
  };
}

/**
 * Fallback Provider 4: Open-Meteo Air Quality API (free, no key, CAMS global modelled data).
 * Explicitly marked as isModelled: true so UI discloses modelled-data limitations.
 */
export async function fetchOpenMeteoAir(
  lat: number,
  lon: number,
  opts: ProviderOptions = {}
): Promise<RawAirReading | null> {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 6000;

  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality` +
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&current=pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide&timezone=GMT`;

  const data = (await fetchJsonWithTimeout(url, { fetchFn, timeoutMs })) as {
    current?: {
      time?: string;
      pm2_5?: number;
      pm10?: number;
      nitrogen_dioxide?: number;
      sulphur_dioxide?: number;
      ozone?: number;
      carbon_monoxide?: number;
    };
  };

  const cur = data.current;
  if (!cur) return null;

  const pm25 = toFiniteNonNegative(cur.pm2_5);
  const pm10 = toFiniteNonNegative(cur.pm10);
  const no2 = toFiniteNonNegative(cur.nitrogen_dioxide);
  const so2 = toFiniteNonNegative(cur.sulphur_dioxide);
  const o3 = toFiniteNonNegative(cur.ozone);
  // Open-Meteo returns CO in ug/m3; convert to mg/m3 for CPCB breakpoints
  const rawCo = toFiniteNonNegative(cur.carbon_monoxide);
  const co = rawCo !== null ? Math.round((rawCo / 1000) * 100) / 100 : null;

  if (pm25 === null && pm10 === null && no2 === null && so2 === null && o3 === null) {
    return null;
  }

  const updatedAtIso = cur.time
    ? cur.time.endsWith('Z')
      ? cur.time
      : `${cur.time}:00Z`
    : new Date().toISOString();

  // Validate ISO date cleanly
  const validDate = Number.isNaN(Date.parse(updatedAtIso))
    ? new Date().toISOString()
    : new Date(updatedAtIso).toISOString();

  return {
    pm25,
    pm10,
    no2,
    so2,
    o3,
    co,
    reportedAqi: null,
    source: {
      id: 'open_meteo',
      name: 'Open-Meteo Air Quality (Modelled)',
      isModelled: true,
      stationName: null,
    },
    updatedAtIso: validDate,
  };
}

/**
 * Open-Meteo Weather API (free, no key): temperature, humidity, wind speed & direction.
 */
export async function fetchOpenMeteoWeather(
  lat: number,
  lon: number,
  opts: ProviderOptions = {}
): Promise<WeatherSnapshot | null> {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 6000;

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code&timezone=GMT`;

  const data = (await fetchJsonWithTimeout(url, { fetchFn, timeoutMs })) as {
    current?: {
      temperature_2m?: number;
      relative_humidity_2m?: number;
      wind_speed_10m?: number;
      wind_direction_10m?: number;
      weather_code?: number;
    };
  };

  const cur = data.current;
  if (
    !cur ||
    typeof cur.temperature_2m !== 'number' ||
    typeof cur.relative_humidity_2m !== 'number' ||
    typeof cur.wind_speed_10m !== 'number'
  ) {
    return null;
  }

  return {
    temperatureC: Math.round(cur.temperature_2m * 10) / 10,
    humidityPct: Math.min(100, Math.max(0, Math.round(cur.relative_humidity_2m))),
    windSpeedKmh: Math.max(0, Math.round(cur.wind_speed_10m * 10) / 10),
    windDirectionDeg:
      typeof cur.wind_direction_10m === 'number'
        ? Math.min(360, Math.max(0, Math.round(cur.wind_direction_10m)))
        : null,
    weatherCode: typeof cur.weather_code === 'number' ? Math.round(cur.weather_code) : null,
    sourceName: 'Open-Meteo Weather',
  };
}

/**
 * India-restricted city/locality search.
 * Primary: Open-Meteo Geocoding API (countryCode=IN).
 * Fallback: OpenStreetMap Nominatim (countrycodes=in).
 */
export async function searchIndianLocations(
  query: string,
  opts: ProviderOptions = {}
): Promise<IndianLocation[]> {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 6000;

  try {
    const omUrl =
      `https://geocoding-api.open-meteo.com/v1/search` +
      `?name=${encodeURIComponent(query)}&count=8&language=en&format=json&countryCode=IN`;
    const omData = (await fetchJsonWithTimeout(omUrl, { fetchFn, timeoutMs })) as {
      results?: Array<{
        id?: number;
        name?: string;
        admin1?: string;
        country_code?: string;
        latitude?: number;
        longitude?: number;
      }>;
    };

    const omMatches: IndianLocation[] = [];
    for (const item of omData.results ?? []) {
      if (
        item.country_code === 'IN' &&
        item.name &&
        typeof item.latitude === 'number' &&
        typeof item.longitude === 'number' &&
        isWithinIndia(item.latitude, item.longitude)
      ) {
        omMatches.push({
          id: `om-${item.id ?? `${item.latitude.toFixed(2)}-${item.longitude.toFixed(2)}`}`,
          name: item.name,
          state: item.admin1 ?? '',
          lat: Math.round(item.latitude * 10000) / 10000,
          lon: Math.round(item.longitude * 10000) / 10000,
        });
      }
    }
    if (omMatches.length > 0) return omMatches;
  } catch {
    // Fall through to Nominatim
  }

  const nomUrl =
    `https://nominatim.openstreetmap.org/search` +
    `?q=${encodeURIComponent(query)}&countrycodes=in&format=json&addressdetails=1&limit=8`;
  const nomData = (await fetchJsonWithTimeout(nomUrl, {
    fetchFn,
    timeoutMs,
    headers: { 'User-Agent': 'UrbanAirQualityAssistant/1.0 (civic-health-app)' },
  })) as Array<{
    place_id?: number;
    name?: string;
    display_name?: string;
    lat?: string;
    lon?: string;
    address?: {
      city?: string;
      town?: string;
      village?: string;
      suburb?: string;
      state?: string;
    };
  }>;

  const nomMatches: IndianLocation[] = [];
  for (const item of nomData ?? []) {
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isWithinIndia(lat, lon)) continue;

    const label =
      item.address?.suburb ||
      item.address?.city ||
      item.address?.town ||
      item.address?.village ||
      item.name ||
      item.display_name?.split(',')[0]?.trim();
    if (!label) continue;

    nomMatches.push({
      id: `nom-${item.place_id ?? `${lat.toFixed(2)}-${lon.toFixed(2)}`}`,
      name: label,
      state: item.address?.state ?? '',
      lat: Math.round(lat * 10000) / 10000,
      lon: Math.round(lon * 10000) / 10000,
    });
  }
  return nomMatches;
}

/**
 * Reverse geocode coordinates inside India into a human-friendly locality + state.
 */
export async function reverseGeocodeIndia(
  lat: number,
  lon: number,
  opts: ProviderOptions = {}
): Promise<IndianLocation> {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 6000;

  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse` +
      `?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&format=json&addressdetails=1`;
    const data = (await fetchJsonWithTimeout(url, {
      fetchFn,
      timeoutMs,
      headers: { 'User-Agent': 'UrbanAirQualityAssistant/1.0 (civic-health-app)' },
    })) as {
      address?: {
        suburb?: string;
        neighbourhood?: string;
        city?: string;
        town?: string;
        village?: string;
        county?: string;
        state?: string;
      };
    };

    const addr = data.address;
    const locality =
      addr?.suburb ||
      addr?.neighbourhood ||
      addr?.city ||
      addr?.town ||
      addr?.village ||
      addr?.county;
    const cityPart = addr?.city && addr.city !== locality ? `, ${addr.city}` : '';
    const name = locality ? `${locality}${cityPart}` : `Location (${lat.toFixed(2)}, ${lon.toFixed(2)})`;

    return {
      id: `geo-${lat.toFixed(2)}-${lon.toFixed(2)}`,
      name,
      state: addr?.state ?? '',
      lat: Math.round(lat * 10000) / 10000,
      lon: Math.round(lon * 10000) / 10000,
    };
  } catch {
    return {
      id: `geo-${lat.toFixed(2)}-${lon.toFixed(2)}`,
      name: `Current Location (${lat.toFixed(2)}, ${lon.toFixed(2)})`,
      state: 'India',
      lat: Math.round(lat * 10000) / 10000,
      lon: Math.round(lon * 10000) / 10000,
    };
  }
}
