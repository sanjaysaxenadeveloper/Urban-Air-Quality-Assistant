// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ALERT_PREFS,
  DEFAULT_USER_PROFILE,
  type AirQualitySnapshot,
  type DecisionPlan,
  type NotificationItem,
} from '../shared/schemas.ts';
import { AirSnapshot } from '../src/components/AirSnapshot.tsx';
import { AlertsSettingsPanel } from '../src/components/AlertsSettingsPanel.tsx';
import { DailyPlanner } from '../src/components/DailyPlanner.tsx';
import { ErrorBoundary } from '../src/components/ErrorBoundary.tsx';
import { GroundedChat } from '../src/components/GroundedChat.tsx';
import { IndoorGuide } from '../src/components/IndoorGuide.tsx';
import { LocationPicker } from '../src/components/LocationPicker.tsx';
import { NotificationCenter } from '../src/components/NotificationCenter.tsx';
import { ProfilePanel } from '../src/components/ProfilePanel.tsx';
import { SustainablePlanner } from '../src/components/SustainablePlanner.tsx';
import { VerdictBanner } from '../src/components/VerdictBanner.tsx';
import { I18nProvider } from '../src/i18n/I18nContext.tsx';
import {
  fetchLiveAirApi,
  generatePlanApi,
  reverseGeocodeApi,
  searchLocationsApi,
  sendChatQuestionApi,
} from '../src/lib/apiClient.ts';
import {
  getBrowserNotificationPermission,
  isIosSafariNotStandalone,
  showLocalBrowserNotification,
} from '../src/lib/notifications.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SAMPLE_LOC = {
  id: 'delhi',
  name: 'Delhi',
  state: 'Delhi',
  lat: 28.6139,
  lon: 77.209,
};

const SAMPLE_SNAPSHOT: AirQualitySnapshot = {
  location: SAMPLE_LOC,
  aqi: 342,
  cpcbCategory: 'very_poor',
  usEpaAqi: 245,
  usEpaCategory: 'very_unhealthy',
  pm25: 175.4,
  pm10: 298.2,
  no2: 41,
  so2: 14,
  o3: 22,
  co: 1.2,
  dominantPollutant: 'PM2.5',
  weather: {
    temperatureC: 18,
    humidityPct: 64,
    windSpeedKmh: 5.5,
    windDirectionDeg: 280,
    weatherCode: 45,
    sourceName: 'Open-Meteo Weather',
  },
  source: {
    id: 'open_meteo',
    name: 'Open-Meteo Air Quality (Modelled)',
    isModelled: true,
    stationName: null,
  },
  updatedAtIso: '2026-11-20T05:30:00.000Z',
  fetchedAtIso: '2026-11-20T05:35:00.000Z',
  freshness: 'live',
  freshnessMinutes: 5,
  cacheHit: false,
};

const SAMPLE_PLAN: DecisionPlan = {
  todaysVerdict: 'Avoid outdoor workouts in Delhi today; keep windows sealed and run HEPA indoors.',
  severitySummary: 'Very Poor air (AQI 342, PM2.5 175 µg/m³) with low wind dispersion.',
  dailyPlanner: {
    morning: {
      period: 'morning',
      windowSummary: 'Peak winter inversion (6am–10am)',
      action: 'Skip outdoor morning walk; exercise indoors.',
      commuteAndActivity: 'Use metro instead of two-wheeler for commute.',
      maskGuidance: 'Wear a tightly sealed N95/FFP2 respirator outdoors.',
      hydrationAndRecovery: 'Drink warm water and use saline nasal rinse after commute.',
      why: 'PM2.5 at 175 µg/m³ traps near ground level during calm morning winds.',
      expectedBenefit: 'Estimated ~70–85% reduction in inhaled PM2.5.',
      assumptionNote: 'Estimate assumes proper N95 seal and moving exercise indoors.',
    },
    afternoon: {
      period: 'afternoon',
      windowSummary: 'Slightly better dispersion (1pm–4pm)',
      action: 'Keep essential errands brief between 1pm and 3pm.',
      commuteAndActivity: 'Chain errands into a single trip.',
      maskGuidance: 'Keep N95 on outdoors near arterial roads.',
      hydrationAndRecovery: 'Stay hydrated and avoid outdoor jogging.',
      why: 'Afternoon mixing lowers ground smoke slightly, though AQI stays Very Poor.',
      expectedBenefit: 'Estimated ~25–35% lower exposure vs morning rush hour.',
      assumptionNote: 'Estimate assumes brief (<20 min) outdoor errands.',
    },
    evening: {
      period: 'evening',
      windowSummary: 'Rapid smog build-up after sunset',
      action: 'Stay indoors after 6pm and run purifier on medium.',
      commuteAndActivity: 'Keep car AC on recirculation mode.',
      maskGuidance: 'N95 required for any evening transit.',
      hydrationAndRecovery: 'Wash face/hands on returning indoors.',
      why: 'Evening cooling drops boundary layer height and spikes PM2.5.',
      expectedBenefit: 'Estimated ~60% lower evening indoor PM2.5.',
      assumptionNote: 'Estimate assumes sealed windows and HEPA purifier running.',
    },
  },
  indoorGuide: {
    indoorReadingNote: 'No indoor sensor reading provided; advice is inferred from outdoor AQI 342.',
    ventilationVerdict: 'seal',
    ventilationReason: 'Outdoor PM2.5 (175 µg/m³) is severely elevated; keep windows shut.',
    recommendations: [
      {
        title: 'Run HEPA purifier centrally',
        action: 'Place purifier 1m from walls in main bedroom and run continuously.',
        why: 'Outdoor infiltration raises indoor PM2.5 without active filtration.',
        expectedBenefit: 'Estimated 50–75% lower indoor PM2.5.',
        assumptionNote: 'Estimate assumes room matches purifier CADR rating.',
      },
      {
        title: 'Avoid indoor smoke sources',
        action: 'Skip incense (agarbatti), mosquito coils, and dry sweeping; use damp mop.',
        why: 'Indoor combustion adds fine particulate spikes on top of outdoor smog.',
        expectedBenefit: 'Estimated 20–40% fewer indoor PM2.5 spikes.',
        assumptionNote: 'Estimate assumes daily damp mopping instead of dry sweeping.',
      },
      {
        title: 'Honest note on indoor plants',
        action: 'Keep plants for greenery, not as a substitute for a HEPA purifier.',
        why: 'Houseplants have negligible PM2.5 removal compared to mechanical filtration.',
        expectedBenefit: 'Estimated <2% PM2.5 impact from typical room plants.',
        assumptionNote: 'Based on controlled chamber studies of potted plants.',
      },
    ],
  },
  sustainablePlanner: {
    alternatives: [
      {
        title: 'Switch solo car commute to Delhi Metro',
        action: 'Take Metro + short e-rickshaw last mile instead of solo car.',
        comparedTo: '45 min solo petrol car commute',
        why: 'Reduces tailpipe NO2/PM2.5 emissions during Very Poor inversion.',
        expectedBenefit: 'Estimated ~2.4 kg CO2 saved per day and ~40% lower road-dust exposure.',
        assumptionNote: 'Estimate assumes 18 km round-trip petrol car replaced by electric metro.',
      },
      {
        title: 'Work from home on Very Poor days',
        action: 'Shift 2 days/week to WFH when AQI exceeds 300.',
        comparedTo: 'Daily peak-hour road commute',
        why: 'Eliminates traffic-corridor PM2.5 peaks completely on WFH days.',
        expectedBenefit: 'Estimated ~4.8 kg CO2 saved/week and ~60% lower commute exposure.',
        assumptionNote: 'Estimate assumes 2 WFH days replacing solo car trips.',
      },
      {
        title: 'Chain neighborhood errands into one trip',
        action: 'Combine grocery and pharmacy stops into a single midday trip.',
        comparedTo: 'Multiple short evening scooter trips',
        why: 'Cold engine starts emit disproportionately high particulates.',
        expectedBenefit: 'Estimated ~0.6 kg CO2 saved/week.',
        assumptionNote: 'Estimate assumes consolidating 3 short trips into 1.',
      },
    ],
  },
  whyThisAdvice: {
    dataUsed: [
      'Delhi live snapshot: CPCB AQI 342, PM2.5 175.4 µg/m³ (Open-Meteo Modelled).',
      'Local weather: 18°C, 64% humidity, 5.5 km/h wind.',
    ],
    reasoning:
      'Matched Very Poor AQI category and low wind dispersion with household commute and home setup, prioritizing window sealing, HEPA filtration, and fitted N95 masks.',
    medicalDisclaimer: 'General environmental guidance only — not medical advice.',
  },
};

describe('Core Decision-Support UI Components', () => {
  it('renders AirSnapshot with CPCB/EPA scales, °C/°F conversion, modelled disclosure, and refresh trigger', () => {
    const onRefresh = vi.fn();
    const { rerender } = render(
      <I18nProvider language="en">
        <AirSnapshot
          snapshot={SAMPLE_SNAPSHOT}
          aqiScale="CPCB"
          tempUnit="C"
          timeFormat="12h"
          onRefresh={onRefresh}
        />
      </I18nProvider>
    );

    expect(screen.getByText('342')).toBeInTheDocument();
    expect(screen.getByText(/18\s*°C/)).toBeInTheDocument();
    expect(screen.getByText(/modelled atmospheric data/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));
    expect(onRefresh).toHaveBeenCalledOnce();

    rerender(
      <I18nProvider language="en">
        <AirSnapshot
          snapshot={SAMPLE_SNAPSHOT}
          aqiScale="EPA"
          tempUnit="F"
          timeFormat="24h"
          onRefresh={onRefresh}
        />
      </I18nProvider>
    );
    expect(screen.getByText('245')).toBeInTheDocument();
    expect(screen.getByText(/64\.?4?\s*°F/)).toBeInTheDocument();
  });

  it('renders VerdictBanner and toggles Why this advice? panel with medical disclaimer', () => {
    render(
      <I18nProvider language="en">
        <VerdictBanner plan={SAMPLE_PLAN} showWhyByDefault={false} />
      </I18nProvider>
    );

    expect(screen.getByText(SAMPLE_PLAN.todaysVerdict)).toBeInTheDocument();
    const whyBtn = screen.getByRole('button', { name: /Why this advice/i });
    expect(whyBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(whyBtn);
    expect(whyBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/not medical advice/i)).toBeInTheDocument();
  });

  it('renders DailyPlanner, IndoorGuide, and SustainablePlanner with impact notes', () => {
    render(
      <I18nProvider language="en">
        <DailyPlanner planner={SAMPLE_PLAN.dailyPlanner} />
        <IndoorGuide guide={SAMPLE_PLAN.indoorGuide} />
        <SustainablePlanner planner={SAMPLE_PLAN.sustainablePlanner} />
      </I18nProvider>
    );

    expect(screen.getByText(/Skip outdoor morning walk/i)).toBeInTheDocument();
    expect(screen.getByText(/No indoor sensor reading provided/i)).toBeInTheDocument();
    expect(screen.getByText(/Run HEPA purifier centrally/i)).toBeInTheDocument();
    expect(screen.getByText(/Switch solo car commute to Delhi Metro/i)).toBeInTheDocument();
  });

  it('allows editing household profile, demo persona selection, and plan generation in ProfilePanel', () => {
    const onChangeProfile = vi.fn();
    const onApplyDemo = vi.fn();
    const onGeneratePlan = vi.fn();

    render(
      <I18nProvider language="en">
        <ProfilePanel
          profile={DEFAULT_USER_PROFILE}
          onChangeProfile={onChangeProfile}
          onApplyDemo={onApplyDemo}
          onGeneratePlan={onGeneratePlan}
          canGenerate={true}
          generating={false}
        />
      </I18nProvider>
    );

    fireEvent.change(screen.getByLabelText(/Household type/i), {
      target: { value: 'senior_citizens' },
    });
    expect(onChangeProfile).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^Asthma$/i }));
    expect(onChangeProfile).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: /Update personalized plan/i }));
    expect(onGeneratePlan).toHaveBeenCalledOnce();
  });

  it('supports quick-pick selection, saved locations strip, and geolocation denied message in LocationPicker', () => {
    const onSelectLocation = vi.fn();
    const onToggleSaveLocation = vi.fn();

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: unknown, err: (e: { code: number; PERMISSION_DENIED: number }) => void) =>
          err({ code: 1, PERMISSION_DENIED: 1 }),
      },
    });

    render(
      <I18nProvider language="en">
        <LocationPicker
          selectedLocation={SAMPLE_LOC}
          onSelectLocation={onSelectLocation}
          isSignedIn={true}
          savedLocations={[{ ...SAMPLE_LOC, id: 'delhi', alertsEnabled: true }]}
          onToggleSaveLocation={onToggleSaveLocation}
        />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /Mumbai/i }));
    expect(onSelectLocation).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mumbai' }));

    fireEvent.click(screen.getByRole('button', { name: /Saved/i }));
    expect(onToggleSaveLocation).toHaveBeenCalledWith(SAMPLE_LOC);

    fireEvent.click(screen.getByRole('button', { name: /Use my location/i }));
    expect(screen.getByText(/Location access was denied/i)).toBeInTheDocument();
  });

  it('submits grounded Q&A question in GroundedChat and renders live answer', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          airSnapshot: SAMPLE_SNAPSHOT,
          reply: {
            answer: 'At AQI 342 in Delhi, skip outdoor football at 5pm and switch to indoor play.',
            actionableSteps: ['Move football practice indoors today.', 'Wear N95 if commuting.'],
            why: 'PM2.5 is 175.4 µg/m³ (Very Poor), which causes high lung deposition during running.',
            confidenceNote: 'Grounded in live Delhi AQI 342 (Open-Meteo Modelled).',
            medicalDisclaimer: 'General guidance only, not medical advice.',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    render(
      <I18nProvider language="en">
        <GroundedChat
          location={SAMPLE_LOC}
          profile={DEFAULT_USER_PROFILE}
          airSnapshot={SAMPLE_SNAPSHOT}
        />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /football at 5pm/i }));
    await waitFor(() => {
      expect(screen.getByText(/skip outdoor football at 5pm/i)).toBeInTheDocument();
    });
  });

  it('opens NotificationCenter popover, marks single/all read, and clears items', () => {
    const items: NotificationItem[] = [
      {
        id: 'n1',
        title: 'Delhi Air Alert: AQI 342',
        body: 'Keep windows sealed.',
        reason: 'PM2.5 175 µg/m³',
        severity: 'high',
        sourceName: 'OpenAQ v3',
        dataTimestampIso: '2026-11-20T05:30:00.000Z',
        createdAtIso: '2026-11-20T05:35:00.000Z',
        read: false,
      },
    ];
    const onMarkRead = vi.fn();
    const onMarkAllRead = vi.fn();
    const onClearAll = vi.fn();

    render(
      <NotificationCenter
        items={items}
        onMarkRead={onMarkRead}
        onMarkAllRead={onMarkAllRead}
        onClearAll={onClearAll}
        onOpenAlertSettings={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Notifications \(1 unread\)/i }));
    expect(screen.getByText('Delhi Air Alert: AQI 342')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Mark all read/i }));
    expect(onMarkAllRead).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: /Clear all notifications/i }));
    expect(onClearAll).toHaveBeenCalledOnce();
  });

  it('renders AlertsSettingsPanel pre-permission prompt, test alert action, and signed-in controls', async () => {
    const onUpdateAlertPrefs = vi.fn(async () => {});
    const onSendTestAlert = vi.fn(async () => {});

    render(
      <AlertsSettingsPanel
        isSignedIn={true}
        emailVerified={true}
        alertPrefs={{ ...DEFAULT_ALERT_PREFS, enabled: true }}
        savedLocations={[{ ...SAMPLE_LOC, id: 'delhi', alertsEnabled: true }]}
        onUpdateAlertPrefs={onUpdateAlertPrefs}
        onToggleLocationAlert={vi.fn(async () => {})}
        onSaveFcmToken={vi.fn(async () => {})}
        onSendTestAlert={onSendTestAlert}
        onOpenSignIn={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Send test alert/i }));
    await waitFor(() => expect(onSendTestAlert).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: /Unsubscribe all/i }));
    await waitFor(() =>
      expect(onUpdateAlertPrefs).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
    );
  });

  it('ErrorBoundary catches child render errors and shows recovery UI', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Boom(): never {
      throw new Error('Synthetic render crash');
    }

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('apiClient & notifications utilities handle responses and unsupported environments gracefully', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [SAMPLE_LOC] }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ location: SAMPLE_LOC }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(SAMPLE_SNAPSHOT), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ airSnapshot: SAMPLE_SNAPSHOT, plan: SAMPLE_PLAN, model: 'gemini' }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Upstream down' }), { status: 503 })
      );

    expect(await searchLocationsApi('Delhi')).toHaveLength(1);
    expect((await reverseGeocodeApi(28.61, 77.21)).name).toBe('Delhi');
    expect((await fetchLiveAirApi(SAMPLE_LOC, true)).aqi).toBe(342);
    expect(
      (await generatePlanApi({ location: SAMPLE_LOC, profile: DEFAULT_USER_PROFILE })).plan
        .todaysVerdict
    ).toContain('Delhi');
    await expect(
      sendChatQuestionApi({
        location: SAMPLE_LOC,
        profile: DEFAULT_USER_PROFILE,
        question: 'Safe?',
        history: [],
      })
    ).rejects.toThrow('Upstream down');

    expect(fetchSpy).toHaveBeenCalledTimes(5);
    expect(['default', 'granted', 'denied', 'unsupported']).toContain(
      getBrowserNotificationPermission()
    );
    expect(typeof isIosSafariNotStandalone()).toBe('boolean');
    expect(showLocalBrowserNotification('Test', 'Body')).toBe(false);
  });
});
