import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app.ts';
import { loadConfig } from '../server/config.ts';

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Air and Geocode Express API routes', () => {
  it('GET /api/health returns 200 ok', async () => {
    const app = createApp({ disableRateLimit: true });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/air rejects missing or out-of-India coordinates with 400', async () => {
    const app = createApp({ disableRateLimit: true });
    const missing = await request(app).get('/api/air');
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('INVALID_LOCATION_QUERY');

    const london = await request(app).get('/api/air?lat=51.5072&lon=-0.1276');
    expect(london.status).toBe(400);
  });

  it('GET /api/air returns normalized live data and 503 when all providers fail', async () => {
    const okFetch = vi.fn(async (url: string | URL) => {
      if (String(url).includes('air-quality-api.open-meteo.com')) {
        return jsonRes({
          current: { time: '2026-11-20T10:00', pm2_5: 130, pm10: 210 },
        });
      }
      return jsonRes({
        current: { temperature_2m: 21, relative_humidity_2m: 58, wind_speed_10m: 9 },
      });
    });

    const appOk = createApp({
      config: loadConfig({}),
      fetchFn: okFetch,
      disableRateLimit: true,
    });
    const resOk = await request(appOk).get('/api/air?lat=28.6139&lon=77.209&city=Delhi&state=Delhi');
    expect(resOk.status).toBe(200);
    expect(resOk.body.cpcbCategory).toBe('very_poor');
    expect(resOk.body.source.id).toBe('open_meteo');
    expect(resOk.body.weather.temperatureC).toBe(21);

    const failFetch = vi.fn(async () => jsonRes({}, 503));
    const appFail = createApp({
      config: loadConfig({}),
      fetchFn: failFetch,
      disableRateLimit: true,
    });
    const resFail = await request(appFail).get('/api/air?lat=28.6139&lon=77.209');
    expect(resFail.status).toBe(503);
    expect(resFail.body.error).toBe('AIR_DATA_UNAVAILABLE');
  });

  it('GET /api/geocode validates query and returns Indian results or 503 on outage', async () => {
    const okFetch = vi.fn(async () =>
      jsonRes({
        results: [
          { id: 10, name: 'Pune', admin1: 'Maharashtra', country_code: 'IN', latitude: 18.5204, longitude: 73.8567 },
        ],
      })
    );
    const app = createApp({ fetchFn: okFetch, disableRateLimit: true });

    const shortQ = await request(app).get('/api/geocode?q=a');
    expect(shortQ.status).toBe(400);

    const badChars = await request(app).get('/api/geocode?q=<script>');
    expect(badChars.status).toBe(400);

    const good = await request(app).get('/api/geocode?q=Pune');
    expect(good.status).toBe(200);
    expect(good.body.results).toHaveLength(1);
    expect(good.body.results[0].name).toBe('Pune');

    const failFetch = vi.fn(async () => jsonRes({}, 503));
    const appFail = createApp({ fetchFn: failFetch, disableRateLimit: true });
    const failRes = await request(appFail).get('/api/geocode?q=Pune');
    expect(failRes.status).toBe(503);
    expect(failRes.body.error).toBe('GEOCODE_UNAVAILABLE');
  });

  it('GET /api/reverse-geocode validates India bounds and returns locality', async () => {
    const okFetch = vi.fn(async () =>
      jsonRes({ address: { suburb: 'Bandra', city: 'Mumbai', state: 'Maharashtra' } })
    );
    const app = createApp({ fetchFn: okFetch, disableRateLimit: true });

    const outside = await request(app).get('/api/reverse-geocode?lat=40.71&lon=-74.00');
    expect(outside.status).toBe(400);

    const inside = await request(app).get('/api/reverse-geocode?lat=19.0596&lon=72.8295');
    expect(inside.status).toBe(200);
    expect(inside.body.location.name).toBe('Bandra, Mumbai');
  });

  it('enforces CORS allowlist cleanly', async () => {
    const app = createApp({
      config: loadConfig({ CORS_ALLOWED_ORIGINS: 'https://trusted.example.com' }),
      disableRateLimit: true,
    });
    const allowed = await request(app)
      .get('/api/health')
      .set('Origin', 'https://trusted.example.com');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://trusted.example.com');

    const blocked = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example.com');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});
