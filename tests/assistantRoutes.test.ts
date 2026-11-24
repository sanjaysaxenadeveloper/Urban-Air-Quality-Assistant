import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app.ts';
import { loadConfig } from '../server/config.ts';
import { GeminiEngine } from '../server/services/geminiEngine.ts';
import { DEFAULT_USER_PROFILE } from '../shared/schemas.ts';

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const VALID_PLAN_JSON = JSON.stringify({
  todaysVerdict: 'Limit outdoor exposure today and run exhaust while cooking.',
  severitySummary: 'Moderate to Poor air in Mumbai.',
  dailyPlanner: {
    morning: {
      period: 'morning',
      windowSummary: 'Short window before 8 AM',
      action: 'Keep morning walk under 20 mins.',
      commuteAndActivity: 'Use closed windows in car.',
      maskGuidance: 'Carry N95 mask for traffic junctions.',
      hydrationAndRecovery: 'Stay hydrated.',
      why: 'Morning traffic elevates PM2.5.',
      expectedBenefit: 'Estimate: 40% lower exposure.',
      assumptionNote: 'Assumes shorter walk near park.',
    },
    afternoon: {
      period: 'afternoon',
      windowSummary: 'Best sea-breeze dispersion 1–4 PM',
      action: 'Complete errands midday.',
      commuteAndActivity: 'Light outdoor play acceptable.',
      maskGuidance: 'N95 optional away from main roads.',
      hydrationAndRecovery: 'Drink water regularly.',
      why: 'Sea breeze lowers PM2.5.',
      expectedBenefit: 'Estimate: 35% lower exposure vs evening.',
      assumptionNote: 'Assumes coastal wind continues.',
    },
    evening: {
      period: 'evening',
      windowSummary: 'Rush-hour smog rises after 6 PM',
      action: 'Shift kids play indoors after dusk.',
      commuteAndActivity: 'Use AC recirculation in traffic.',
      maskGuidance: 'Wear N95 near arterial roads.',
      hydrationAndRecovery: 'Wash face after commute.',
      why: 'Evening peak traffic raises particulates.',
      expectedBenefit: 'Estimate: 50% lower evening exposure.',
      assumptionNote: 'Assumes indoor air is cleaner.',
    },
  },
  indoorGuide: {
    indoorReadingNote: 'No indoor sensor reading provided; advice is inferred from outdoor readings.',
    ventilationVerdict: 'brief_ventilate',
    ventilationReason: 'Brief midday cross-ventilation helps refresh indoor air.',
    recommendations: [
      {
        title: 'Use HEPA purifier in bedroom',
        action: 'Run purifier on medium 1 hour before bedtime.',
        why: 'Reduces overnight PM2.5.',
        expectedBenefit: 'Estimate: 60–75% lower bedroom PM2.5.',
        assumptionNote: 'Assumes closed door and matched CADR.',
      },
      {
        title: 'Run kitchen chimney',
        action: 'Keep exhaust on during tadka and frying.',
        why: 'Captures indoor cooking smoke.',
        expectedBenefit: 'Estimate: 50% lower kitchen peaks.',
        assumptionNote: 'Assumes working exhaust vent.',
      },
      {
        title: 'Indoor plants note',
        action: 'Keep plants for comfort, not as a PM2.5 filter.',
        why: 'Houseplants have minimal measurable PM2.5 filtration.',
        expectedBenefit: 'Estimate: <5% particulate impact.',
        assumptionNote: 'Based on residential chamber studies.',
      },
    ],
  },
  sustainablePlanner: {
    alternatives: [
      {
        title: 'Carpool with neighbors',
        action: 'Share the 40-minute school/office car trip twice a week.',
        comparedTo: 'Solo car commute',
        why: 'Cuts tailpipe emissions directly.',
        expectedBenefit: 'Estimate: ~1.8 kg CO2 saved per carpool day.',
        assumptionNote: 'Assumes 15 km round trip petrol car.',
      },
      {
        title: 'Switch off engine at signals',
        action: 'Turn off ignition for red lights longer than 30 seconds.',
        comparedTo: 'Idling in traffic',
        why: 'Eliminates localized NO2 and PM hotspots.',
        expectedBenefit: 'Estimate: ~0.25 kg CO2 saved/day.',
        assumptionNote: 'Assumes 8 minutes of daily signal idling.',
      },
      {
        title: 'Combine weekend errands',
        action: 'Bundle market and pharmacy trips into one route.',
        comparedTo: 'Separate short drives',
        why: 'Reduces cold-start emissions.',
        expectedBenefit: 'Estimate: ~0.5 kg CO2 saved/week.',
        assumptionNote: 'Assumes 2 trips merged into 1.',
      },
    ],
  },
  whyThisAdvice: {
    dataUsed: ['Mumbai live PM2.5 72 µg/m³', 'Family with kids & asthma sensitivity'],
    reasoning: 'Coastal breeze improves midday air while asthma sensitivity requires cautious evening play guidance.',
    medicalDisclaimer: 'General environmental guidance only, not medical advice.',
  },
});

describe('Assistant API routes (/api/plan and /api/chat)', () => {
  const okAirFetch = vi.fn(async (url: string | URL) => {
    if (String(url).includes('air-quality-api.open-meteo.com')) {
      return jsonRes({ current: { time: '2026-11-20T10:00', pm2_5: 72, pm10: 120 } });
    }
    return jsonRes({ current: { temperature_2m: 28, relative_humidity_2m: 70, wind_speed_10m: 14 } });
  });

  it('POST /api/plan validates input and returns live air + structured Gemini plan', async () => {
    const geminiEngine = new GeminiEngine({
      apiKey: 'test',
      model: 'gemini-4-hydrogen',
      generateTextFn: vi.fn(async () => VALID_PLAN_JSON),
    });
    const app = createApp({
      config: loadConfig({}),
      fetchFn: okAirFetch,
      geminiEngine,
      disableRateLimit: true,
    });

    const badReq = await request(app).post('/api/plan').send({ location: { name: '' } });
    expect(badReq.status).toBe(400);

    const okReq = await request(app)
      .post('/api/plan')
      .send({
        location: { name: 'Mumbai', state: 'Maharashtra', lat: 19.076, lon: 72.8777 },
        profile: DEFAULT_USER_PROFILE,
      });
    expect(okReq.status).toBe(200);
    expect(okReq.body.airSnapshot.pm25).toBe(72);
    expect(okReq.body.plan.todaysVerdict).toContain('Limit outdoor exposure');
  });

  it('POST /api/plan returns 503 if air providers fail and 502 if Gemini fails', async () => {
    const failAirFetch = vi.fn(async () => jsonRes({}, 503));
    const appAirFail = createApp({
      fetchFn: failAirFetch,
      geminiEngine: new GeminiEngine({
        apiKey: 'test',
        model: 'gemini-4-hydrogen',
        generateTextFn: vi.fn(async () => VALID_PLAN_JSON),
      }),
      disableRateLimit: true,
    });

    const res503 = await request(appAirFail)
      .post('/api/plan')
      .send({
        location: { name: 'Delhi', state: 'Delhi', lat: 28.6139, lon: 77.209 },
        profile: DEFAULT_USER_PROFILE,
      });
    expect(res503.status).toBe(503);

    const appGeminiFail = createApp({
      fetchFn: okAirFetch,
      geminiEngine: new GeminiEngine({
        apiKey: 'test',
        model: 'gemini-4-hydrogen',
        generateTextFn: vi.fn(async () => 'bad json'),
      }),
      disableRateLimit: true,
    });
    const res502 = await request(appGeminiFail)
      .post('/api/plan')
      .send({
        location: { name: 'Delhi', state: 'Delhi', lat: 28.6139, lon: 77.209 },
        profile: DEFAULT_USER_PROFILE,
      });
    expect(res502.status).toBe(502);
  });

  it('POST /api/chat validates question and returns grounded Q&A reply', async () => {
    const geminiEngine = new GeminiEngine({
      apiKey: 'test',
      model: 'gemini-4-hydrogen',
      generateTextFn: vi.fn(async () =>
        JSON.stringify({
          answer: 'Better to keep practice brief indoors today.',
          actionableSteps: ['Move drills inside'],
          why: 'Live PM2.5 is 72 µg/m³.',
          confidenceNote: 'Based on current reading; no 5pm forecast available.',
          medicalDisclaimer: 'General guidance only, not medical advice.',
        })
      ),
    });

    const app = createApp({
      fetchFn: okAirFetch,
      geminiEngine,
      disableRateLimit: true,
    });

    const badChat = await request(app).post('/api/chat').send({ question: 'a' });
    expect(badChat.status).toBe(400);

    const okChat = await request(app)
      .post('/api/chat')
      .send({
        location: { name: 'Mumbai', state: 'Maharashtra', lat: 19.076, lon: 72.8777 },
        profile: DEFAULT_USER_PROFILE,
        question: 'Can my child play football at 5pm?',
      });
    expect(okChat.status).toBe(200);
    expect(okChat.body.reply.answer).toContain('indoors');
  });
});
