import { useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ExternalLink,
  HelpCircle,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { CPCB_CATEGORIES, DEMO_SCENARIOS, type DemoScenarioPreset } from '../../shared/constants.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

export function extractYouTubeVideoId(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = parsed.pathname.slice(1).split('/')[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'm.youtube.com') {
      const v = parsed.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const parts = parsed.pathname.split('/').filter(Boolean);
      const embedIdx = parts.findIndex((p) => p === 'embed' || p === 'shorts');
      if (embedIdx >= 0 && parts[embedIdx + 1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[embedIdx + 1])) {
        return parts[embedIdx + 1];
      }
    }
  } catch {
    return null;
  }
  return null;
}

const FAQ_ITEMS = [
  {
    id: 'sources',
    q: 'Where does the live air-quality data come from, and what does "Modelled" mean?',
    a: 'Our backend fetches live measurements in a strict fallback chain: OpenAQ v3 ground stations -> official CPCB data.gov.in -> WAQI -> Open-Meteo Air Quality (CAMS atmospheric model), paired with Open-Meteo Weather. We always show the exact source name, timestamp, and freshness. When Open-Meteo is used, it is clearly labelled "Modelled" because street-level traffic or construction smoke can be higher than regional averages. If every upstream feed fails, we show an error and never fabricate AQI values.',
  },
  {
    id: 'personalization',
    q: 'Why do two residents in the same city receive different recommendations?',
    a: 'Air exposure depends heavily on who you are and how you move. A solo two-wheeler commuter in Delhi receives mask sealing, transit swap, and peak-hour timing advice, whereas a senior couple working from home with asthma receives stricter indoor sealing, HEPA placement, and morning-walk postponement guidance — using the exact same live AQI snapshot.',
  },
  {
    id: 'indoor',
    q: 'Does the assistant know the air quality inside my home?',
    a: 'No — unless you enter an optional indoor PM2.5 reading from your own air purifier or monitor. Without a sensor reading, the Indoor Air Quality Guide clearly states that indoor AQI is estimated from outdoor pollution plus your window type, cooking fuel, exhaust fan, and purifier setup.',
  },
  {
    id: 'estimates',
    q: 'Are the exposure reductions and CO₂ savings exact measurements?',
    a: 'No. Every benefit figure (such as % exposure reduction or kg CO₂ saved) is clearly labelled as an estimate along with the assumption behind it (for example, switching a 40-minute solo petrol car commute to metro or carpool). Use them to compare practical choices, not as clinical or certified carbon accounting.',
  },
  {
    id: 'guest',
    q: 'Do I need to create an account to use the app?',
    a: 'No. Guest Mode unlocks the entire decision assistant — live all-India air data, personalized daily planner, indoor guide, low-emission swaps, grounded Q&A, language/accessibility settings, and live in-app threshold alerts — in one click with zero login. Signing in is optional and adds cloud sync, up to 5 saved locations, and scheduled background push alerts.',
  },
  {
    id: 'alerts',
    q: 'How do proactive smog alerts and quiet hours work?',
    a: 'Signed-in users can configure AQI thresholds (default 200, or stricter 100+ for sensitive households), category-change and recovery alerts, daily morning briefings, IST quiet hours (default 22:00–06:30), a daily alert cap, and per-location toggles. Our scheduler fetches air once per unique city, skips stale data so false alerts are never sent, and enforces a 3-hour cooldown.',
  },
  {
    id: 'accessibility',
    q: 'Can I use the app in Hindi or high-contrast / large text mode?',
    a: 'Yes. Open Settings anytime to switch between English and Hindi (हिन्दी), change between CPCB (India) and US EPA AQI scales, switch °C/°F, enable Light/Dark/System themes, increase text size (Normal / Large / Extra Large), turn on High Contrast borders, or Reduce Motion.',
  },
  {
    id: 'medical',
    q: 'Is this medical advice?',
    a: 'No. Urban Air Quality Assistant provides general environmental and preventive lifestyle guidance based on public air-quality data. If you or a family member experience wheezing, chest tightness, severe coughing, or shortness of breath, follow your doctor’s action plan or seek medical care immediately.',
  },
];

interface HelpPageProps {
  onBack: () => void;
  onStartTour: () => void;
  onTryDemo: (scenario: DemoScenarioPreset) => void;
  videoUrl?: string;
}

export function HelpPage({ onBack, onStartTour, onTryDemo, videoUrl }: HelpPageProps) {
  const { t } = useI18n();
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [openFaqId, setOpenFaqId] = useState<string | null>(FAQ_ITEMS[0].id);
  const faqButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const resolvedVideoUrl =
    videoUrl ??
    (import.meta.env.VITE_TUTORIAL_VIDEO_URL as string | undefined) ??
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const videoId = extractYouTubeVideoId(resolvedVideoUrl);
  const watchUrl = videoId
    ? `https://www.youtube.com/watch?v=${videoId}`
    : resolvedVideoUrl;
  const embedUrl = videoId
    ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`
    : null;
  const thumbnailUrl = videoId
    ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    : null;

  function handleFaqKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      faqButtonRefs.current[(idx + 1) % FAQ_ITEMS.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      faqButtonRefs.current[(idx - 1 + FAQ_ITEMS.length) % FAQ_ITEMS.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      faqButtonRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      faqButtonRefs.current[FAQ_ITEMS.length - 1]?.focus();
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-medium text-teal-700 hover:underline dark:text-teal-400"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('app.actions.backToAssistant')}
          </button>
          <h1 className="font-display mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {t('help.heading')}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {t('help.subtitle')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            onStartTour();
            onBack();
          }}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-teal-700 bg-white px-4 text-xs font-semibold text-teal-800 hover:bg-teal-50 dark:bg-slate-900 dark:text-teal-300 dark:hover:bg-teal-950/40"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t('settings.resetTour')}
        </button>
      </div>

      {/* 1. Quick Start in 3 steps */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <h2 className="font-display text-base font-bold">{t('help.quickStartTitle')}</h2>
        </div>
        <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              step: '1',
              title: 'Pick any Indian city',
              desc: 'Search any locality across India, tap Use my location, or click a quick-pick chip.',
            },
            {
              step: '2',
              title: 'Tailor your household',
              desc: 'Choose household type, commute, health sensitivities, and home air setup (or load a 1-click demo).',
            },
            {
              step: '3',
              title: 'Act on Today’s Verdict',
              desc: 'Review outdoor windows, indoor sealing/purifier steps, low-emission swaps, and ask grounded Q&A.',
            },
          ].map((item) => (
            <li
              key={item.step}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
            >
              <span className="font-mono-tabular inline-flex h-6 w-6 items-center justify-center rounded-md bg-teal-700 text-xs font-bold text-white">
                {item.step}
              </span>
              <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {item.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {item.desc}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* 2. Click-to-Load Privacy-Enhanced Video Walkthrough */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
            <h2 className="font-display text-base font-bold">{t('help.videoTitle')}</h2>
          </div>
          <a
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
          >
            Open video on YouTube
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          Walkthrough summary: See how to select any Indian city, inspect live CPCB AQI and source freshness, compare two households in the same smog event, and enable proactive smog alerts. Captions (CC) are supported on YouTube; a full written quick-start guide is also provided on this page.
        </p>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-900 dark:border-slate-800">
          {videoLoaded && embedUrl ? (
            <div className="aspect-video w-full">
              <iframe
                src={embedUrl}
                title="Urban Air Quality Assistant 2-minute walkthrough video"
                loading="lazy"
                className="h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden bg-slate-900 p-6 text-center text-white">
              {thumbnailUrl && (
                <img
                  src={thumbnailUrl}
                  alt="Preview thumbnail for Urban Air Quality Assistant walkthrough video"
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover opacity-40"
                />
              )}
              <div className="relative z-10 flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => setVideoLoaded(true)}
                  disabled={!embedUrl}
                  aria-label="Play 2-minute walkthrough video (loads privacy-enhanced YouTube player)"
                  className="inline-flex min-h-[52px] items-center gap-2.5 rounded-xl bg-teal-600 px-5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
                >
                  <Play className="h-5 w-5 fill-current" aria-hidden="true" />
                  Play walkthrough video
                </button>
                <p className="mt-3 max-w-md text-xs text-slate-200">
                  Click-to-load privacy facade: nothing is loaded from YouTube (youtube-nocookie.com) until you press Play.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. Try One-Click Demo Scenarios */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-display text-base font-bold">{t('help.demosTitle')}</h2>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Each demo prefills only the household profile and city — air quality and weather always come from live feeds.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {DEMO_SCENARIOS.map((demo) => (
            <div
              key={demo.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
            >
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {demo.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  {demo.subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onTryDemo(demo)}
                className="mt-3 min-h-[38px] rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800"
              >
                Try this scenario
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Accessible FAQ Accordion */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <h2 className="font-display text-base font-bold">{t('help.faqTitle')}</h2>
        </div>

        <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {FAQ_ITEMS.map((item, idx) => {
            const isOpen = openFaqId === item.id;
            const panelId = `faq-panel-${item.id}`;
            const btnId = `faq-btn-${item.id}`;
            return (
              <div key={item.id}>
                <h3>
                  <button
                    ref={(el) => {
                      faqButtonRefs.current[idx] = el;
                    }}
                    id={btnId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenFaqId(isOpen ? null : item.id)}
                    onKeyDown={(e) => handleFaqKeyDown(e, idx)}
                    className="flex min-h-[48px] w-full items-center justify-between gap-3 py-3 text-left text-sm font-semibold text-slate-900 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:text-slate-100 dark:hover:text-teal-400"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                </h3>
                {isOpen && (
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={btnId}
                    className="pb-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300"
                  >
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. Air Quality Glossary */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <h2 className="font-display text-base font-bold">{t('help.glossaryTitle')}</h2>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
            <dt className="font-semibold text-slate-900 dark:text-slate-100">AQI (Air Quality Index)</dt>
            <dd className="mt-1 leading-relaxed text-slate-600 dark:text-slate-400">
              A 0–500 summary index combining key pollutants. By default we use India’s official CPCB National AQI scale; you can switch to US EPA in Settings.
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
            <dt className="font-semibold text-slate-900 dark:text-slate-100">PM2.5 &amp; PM10 (µg/m³)</dt>
            <dd className="mt-1 leading-relaxed text-slate-600 dark:text-slate-400">
              PM2.5 are fine particles (&le;2.5 µm) from vehicles, biomass/crop burning, and winter smog that penetrate deep into lungs. PM10 includes coarser road and construction dust.
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
            <dt className="font-semibold text-slate-900 dark:text-slate-100">N95 / FFP2 vs Cloth &amp; Surgical Masks</dt>
            <dd className="mt-1 leading-relaxed text-slate-600 dark:text-slate-400">
              Properly fitted N95 or FFP2 respirators filter &ge;94–95% of PM2.5 particles. Loose surgical masks and cloth masks offer very little protection against winter smog.
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
            <dt className="font-semibold text-slate-900 dark:text-slate-100">CPCB Categories (0–500)</dt>
            <dd className="mt-1 space-y-1 text-slate-600 dark:text-slate-400">
              {CPCB_CATEGORIES.map((cat) => (
                <div key={cat.id} className="flex justify-between gap-2">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{cat.label}</span>
                  <span className="font-mono-tabular">
                    {cat.min}–{cat.max}
                  </span>
                </div>
              ))}
            </dd>
          </div>
        </dl>
      </section>

      {/* 6. Troubleshooting */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <h2 className="font-display text-base font-bold">{t('help.troubleshootingTitle')}</h2>
        </div>

        <ul className="mt-4 space-y-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          <li>
            <strong className="text-slate-900 dark:text-slate-100">Location permission denied or outside India:</strong>{' '}
            Use the all-India locality search bar or any of the 8 quick-pick city chips. We never silently fall back to Delhi.
          </li>
          <li>
            <strong className="text-slate-900 dark:text-slate-100">Browser push notifications blocked or on iOS Safari:</strong>{' '}
            In-app bell notifications work automatically without browser permission. On iPhone/iPad Safari, use Share -&gt; Add to Home Screen to unlock background Web Push. On desktop, click the lock icon next to the URL to re-allow notifications.
          </li>
          <li>
            <strong className="text-slate-900 dark:text-slate-100">Live air data temporarily unavailable:</strong>{' '}
            Wait a moment and click &ldquo;Retry live data.&rdquo; When all upstream providers fail, we display an honest error rather than invented AQI readings.
          </li>
        </ul>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <strong>Medical disclaimer:</strong> This assistant provides general environmental and preventive guidance only and is not a substitute for professional medical advice, diagnosis, or treatment.
          </p>
        </div>
      </section>
    </div>
  );
}
