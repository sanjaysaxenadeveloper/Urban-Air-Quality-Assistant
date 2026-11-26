import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext.tsx';
import {
  CURRENT_TOUR_VERSION,
  TOUR_STEPS,
  type TourPlacement,
  type TourStep,
} from './tourSteps.ts';

export type TourPhase = 'closed' | 'welcome' | 'active';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface PopoverGeometry {
  top: number;
  left: number;
  width: number;
  placement: TourPlacement;
  arrowOffset: number;
}

interface CoachmarkTourProps {
  phase: TourPhase;
  isSignedIn: boolean;
  reduceMotion: boolean;
  steps?: readonly TourStep[];
  onStartTour: () => void;
  onCompleteOrSkip: (version: number) => void;
}

const SPOTLIGHT_PAD = 8;
const POPOVER_GAP = 16;
const VIEWPORT_MARGIN = 14;
const DEFAULT_CARD_WIDTH = 380;
const DEFAULT_CARD_HEIGHT = 240;

function clamp(val: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, val));
}

function getPlacementOrder(preferred?: TourPlacement): TourPlacement[] {
  const all: TourPlacement[] = ['bottom', 'top', 'left', 'right'];
  if (!preferred) return all;
  return [preferred, ...all.filter((p) => p !== preferred)];
}

export function computePopoverGeometry(
  cutout: Rect,
  cardW: number,
  cardH: number,
  vw: number,
  vh: number,
  preferred?: TourPlacement
): PopoverGeometry {
  const targetCenterX = cutout.left + cutout.width / 2;
  const targetCenterY = cutout.top + cutout.height / 2;
  const order = getPlacementOrder(preferred);

  const spaceBottom = vh - (cutout.top + cutout.height) - POPOVER_GAP - VIEWPORT_MARGIN;
  const spaceTop = cutout.top - POPOVER_GAP - VIEWPORT_MARGIN;
  const spaceLeft = cutout.left - POPOVER_GAP - VIEWPORT_MARGIN;
  const spaceRight = vw - (cutout.left + cutout.width) - POPOVER_GAP - VIEWPORT_MARGIN;

  let chosen: TourPlacement | null = null;
  for (const candidate of order) {
    if (candidate === 'bottom' && spaceBottom >= cardH) {
      chosen = 'bottom';
      break;
    }
    if (candidate === 'top' && spaceTop >= cardH) {
      chosen = 'top';
      break;
    }
    if (candidate === 'left' && spaceLeft >= cardW) {
      chosen = 'left';
      break;
    }
    if (candidate === 'right' && spaceRight >= cardW) {
      chosen = 'right';
      break;
    }
  }

  // If no side fits completely, pick the side with the largest relative space
  if (!chosen) {
    const scores: Array<{ side: TourPlacement; ratio: number }> = [
      { side: 'bottom', ratio: spaceBottom / Math.max(cardH, 1) },
      { side: 'top', ratio: spaceTop / Math.max(cardH, 1) },
      { side: 'left', ratio: spaceLeft / Math.max(cardW, 1) },
      { side: 'right', ratio: spaceRight / Math.max(cardW, 1) },
    ];
    scores.sort((a, b) => b.ratio - a.ratio);
    chosen = scores[0].side;
  }

  let top = VIEWPORT_MARGIN;
  let left = VIEWPORT_MARGIN;
  let arrowOffset = cardW / 2;

  if (chosen === 'bottom') {
    top = clamp(
      cutout.top + cutout.height + POPOVER_GAP,
      VIEWPORT_MARGIN,
      vh - cardH - VIEWPORT_MARGIN
    );
    left = clamp(targetCenterX - cardW / 2, VIEWPORT_MARGIN, vw - cardW - VIEWPORT_MARGIN);
    arrowOffset = clamp(targetCenterX - left, 28, cardW - 28);
  } else if (chosen === 'top') {
    top = clamp(cutout.top - POPOVER_GAP - cardH, VIEWPORT_MARGIN, vh - cardH - VIEWPORT_MARGIN);
    left = clamp(targetCenterX - cardW / 2, VIEWPORT_MARGIN, vw - cardW - VIEWPORT_MARGIN);
    arrowOffset = clamp(targetCenterX - left, 28, cardW - 28);
  } else if (chosen === 'left') {
    left = clamp(cutout.left - POPOVER_GAP - cardW, VIEWPORT_MARGIN, vw - cardW - VIEWPORT_MARGIN);
    top = clamp(targetCenterY - cardH / 2, VIEWPORT_MARGIN, vh - cardH - VIEWPORT_MARGIN);
    arrowOffset = clamp(targetCenterY - top, 28, cardH - 28);
  } else {
    left = clamp(
      cutout.left + cutout.width + POPOVER_GAP,
      VIEWPORT_MARGIN,
      vw - cardW - VIEWPORT_MARGIN
    );
    top = clamp(targetCenterY - cardH / 2, VIEWPORT_MARGIN, vh - cardH - VIEWPORT_MARGIN);
    arrowOffset = clamp(targetCenterY - top, 28, cardH - 28);
  }

  return {
    top: Math.round(top),
    left: Math.round(left),
    width: Math.round(cardW),
    placement: chosen,
    arrowOffset: Math.round(arrowOffset),
  };
}

export function CoachmarkTour({
  phase,
  isSignedIn,
  reduceMotion,
  steps = TOUR_STEPS,
  onStartTour,
  onCompleteOrSkip,
}: CoachmarkTourProps) {
  const { t } = useI18n();
  const maskId = useId();
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [usingFallbackTarget, setUsingFallbackTarget] = useState(false);
  /* v8 ignore start */
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));
  /* v8 ignore stop */
  const [cardSize, setCardSize] = useState({
    width: DEFAULT_CARD_WIDTH,
    height: DEFAULT_CARD_HEIGHT,
  });
  const [liveMessage, setLiveMessage] = useState('');

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const isMobile = viewport.width < 640;
  const currentStep = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  // Reset to step 0 when entering active phase
  useEffect(() => {
    if (phase === 'active') {
      setStepIndex(0);
    }
  }, [phase]);

  // Capture trigger focus on open and return focus on close
  useEffect(() => {
    if (phase === 'closed') return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, [phase]);

  // Focus primary control inside dialog on phase/step change
  useEffect(() => {
    if (phase === 'closed') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    /* v8 ignore start */
    const primary =
      dialog.querySelector<HTMLElement>('[data-tour-primary="true"]') ??
      dialog.querySelector<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
    /* v8 ignore stop */
    primary?.focus();
  }, [phase, stepIndex]);

  // Announce active step transitions to screen readers
  useEffect(() => {
    if (phase === 'active' && currentStep) {
      setLiveMessage(
        `${t('tour.stepCounter', { current: stepIndex + 1, total: steps.length })}: ${t(currentStep.titleKey)}`
      );
    } else if (phase === 'welcome') {
      setLiveMessage(t('tour.welcomeTitle'));
    }
  }, [phase, stepIndex, currentStep, steps.length, t]);

  const resolveStepElement = useCallback(
    (step: TourStep | undefined): { el: HTMLElement | null; isFallback: boolean } => {
      /* v8 ignore next 3 */
      if (!step || typeof document === 'undefined') {
        return { el: null, isFallback: false };
      }
      const primary = document.querySelector<HTMLElement>(step.targetSelector);
      if (primary) {
        return { el: primary, isFallback: false };
      }
      if (step.fallbackSelector) {
        const fallback = document.querySelector<HTMLElement>(step.fallbackSelector);
        if (fallback) {
          return { el: fallback, isFallback: true };
        }
      }
      return { el: null, isFallback: false };
    },
    []
  );

  const measureTarget = useCallback(() => {
    /* v8 ignore next */
    if (typeof window === 'undefined') return;
    setViewport({ width: window.innerWidth, height: window.innerHeight });

    /* v8 ignore next 5 */
    if (phase !== 'active' || !currentStep) {
      setTargetRect(null);
      setUsingFallbackTarget(false);
      return;
    }

    const { el, isFallback } = resolveStepElement(currentStep);
    setUsingFallbackTarget(isFallback);

    if (!el) {
      setTargetRect(null);
      return;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setTargetRect(null);
      return;
    }

    setTargetRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  }, [phase, currentStep, resolveStepElement]);

  // Measure actual rendered dialog dimensions so placement & arrow alignment are exact
  useLayoutEffect(() => {
    if (phase !== 'active' || !dialogRef.current) return;
    const updateCardSize = () => {
      const box = dialogRef.current?.getBoundingClientRect();
      if (box && box.width > 0 && box.height > 0) {
        setCardSize({ width: box.width, height: box.height });
      }
    };
    updateCardSize();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateCardSize);
      observer.observe(dialogRef.current);
      return () => observer.disconnect();
    }
    return undefined;
  }, [phase, stepIndex, usingFallbackTarget, isSignedIn]);

  // Scroll target into view on step change, then re-measure as smooth scroll settles
  useLayoutEffect(() => {
    if (phase !== 'active' || !currentStep) {
      setTargetRect(null);
      return;
    }
    const { el } = resolveStepElement(currentStep);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    }
    measureTarget();

    const t1 = window.setTimeout(measureTarget, reduceMotion ? 30 : 160);
    const t2 = window.setTimeout(measureTarget, reduceMotion ? 60 : 420);

    let observer: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => measureTarget());
      observer.observe(el);
    }

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      observer?.disconnect();
    };
  }, [phase, stepIndex, currentStep, reduceMotion, measureTarget, resolveStepElement]);

  // Keep cutout spotlight & arrow locked during scroll or window resize
  useEffect(() => {
    if (phase !== 'active') return;
    let rafId = 0;
    const onViewportChange = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(measureTarget);
    };
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [phase, measureTarget]);

  const handleClose = useCallback(() => {
    onCompleteOrSkip(CURRENT_TOUR_VERSION);
  }, [onCompleteOrSkip]);

  const handleNext = useCallback(() => {
    if (isLast) {
      onCompleteOrSkip(CURRENT_TOUR_VERSION);
    } else {
      setStepIndex((i) => Math.min(steps.length - 1, i + 1));
    }
  }, [isLast, onCompleteOrSkip, steps.length]);

  const handleBack = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  // Keyboard support: Escape, ArrowRight, ArrowLeft, and Focus Trap on Tab
  useEffect(() => {
    if (phase === 'closed') return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }
      if (phase === 'active') {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleNext();
          return;
        }
        if (e.key === 'ArrowLeft' && !isFirst) {
          e.preventDefault();
          handleBack();
          return;
        }
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
          )
        );
        /* v8 ignore next */
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [phase, isFirst, handleClose, handleNext, handleBack]);

  if (phase === 'closed') return null;

  if (phase === 'welcome') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-[2px]">
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {liveMessage}
        </div>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-welcome-title"
          aria-describedby="tour-welcome-body"
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-teal-700 dark:text-teal-400">
              <Compass className="h-5 w-5" aria-hidden="true" />
              <span className="text-xs font-semibold">{t('tour.welcomeKicker')}</span>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label={t('tour.skip')}
              className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <h2
            id="tour-welcome-title"
            className="font-display mt-2 text-lg font-bold text-slate-900 dark:text-neutral-100"
          >
            {t('tour.welcomeTitle')}
          </h2>
          <p
            id="tour-welcome-body"
            className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-neutral-300"
          >
            {t('tour.welcomeBody')}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="min-h-[42px] rounded-xl border border-slate-300 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
            >
              {t('tour.skip')}
            </button>
            <button
              type="button"
              data-tour-primary="true"
              onClick={onStartTour}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-700"
            >
              {t('tour.takeTour')}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentStep) return null;

  const bodyText =
    isSignedIn && currentStep.signedInBodyKey
      ? t(currentStep.signedInBodyKey)
      : t(currentStep.bodyKey);

  // Padded cutout rect clamped to viewport
  const cutout: Rect | null = targetRect
    ? {
        top: Math.max(4, targetRect.top - SPOTLIGHT_PAD),
        left: Math.max(4, targetRect.left - SPOTLIGHT_PAD),
        width: Math.min(viewport.width - 8, targetRect.width + SPOTLIGHT_PAD * 2),
        height: Math.min(viewport.height - 8, targetRect.height + SPOTLIGHT_PAD * 2),
      }
    : null;

  const popoverGeometry =
    !isMobile && cutout
      ? computePopoverGeometry(
          cutout,
          Math.min(DEFAULT_CARD_WIDTH, viewport.width - VIEWPORT_MARGIN * 2),
          /* v8 ignore next */
          cardSize.height || DEFAULT_CARD_HEIGHT,
          viewport.width,
          viewport.height,
          currentStep.preferredPlacement
        )
      : null;

  // Directional pointer arrow style pointing directly at the highlighted element
  const renderArrow = () => {
    if (!popoverGeometry) return null;
    const { placement, arrowOffset } = popoverGeometry;

    if (placement === 'bottom') {
      return (
        <span
          data-testid="tour-arrow"
          data-placement="bottom"
          aria-hidden="true"
          className="pointer-events-none absolute -top-2 h-4 w-4 -translate-x-1/2 rotate-45 border-l-2 border-t-2 border-teal-500 bg-white dark:border-teal-400 dark:bg-neutral-950"
          style={{ left: `${arrowOffset}px` }}
        />
      );
    }
    if (placement === 'top') {
      return (
        <span
          data-testid="tour-arrow"
          data-placement="top"
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-2 h-4 w-4 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-teal-500 bg-white dark:border-teal-400 dark:bg-neutral-950"
          style={{ left: `${arrowOffset}px` }}
        />
      );
    }
    if (placement === 'left') {
      return (
        <span
          data-testid="tour-arrow"
          data-placement="left"
          aria-hidden="true"
          className="pointer-events-none absolute -right-2 h-4 w-4 -translate-y-1/2 rotate-45 border-r-2 border-t-2 border-teal-500 bg-white dark:border-teal-400 dark:bg-neutral-950"
          style={{ top: `${arrowOffset}px` }}
        />
      );
    }
    return (
      <span
        data-testid="tour-arrow"
        data-placement="right"
        aria-hidden="true"
        className="pointer-events-none absolute -left-2 h-4 w-4 -translate-y-1/2 rotate-45 border-b-2 border-l-2 border-teal-500 bg-white dark:border-teal-400 dark:bg-neutral-950"
        style={{ top: `${arrowOffset}px` }}
      />
    );
  };

  const showFallbackNote = Boolean(
    currentStep.fallbackNoteKey && (!targetRect || usingFallbackTarget)
  );

  return (
    <div className="fixed inset-0 z-50">
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>

      {/* True SVG Mask Cutout Spotlight: dims everything EXCEPT the highlighted target element */}
      <svg
        data-testid="tour-spotlight-mask"
        aria-hidden="true"
        onClick={handleClose}
        className="fixed inset-0 h-full w-full cursor-pointer"
      >
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {cutout && (
              <rect
                x={cutout.left}
                y={cutout.top}
                width={cutout.width}
                height={cutout.height}
                rx="16"
                ry="16"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.78)"
          mask={`url(#${maskId})`}
        />
      </svg>

      {/* Crisp bright focus border & subtle teal glow around the unobstructed cutout */}
      {cutout && (
        <div
          data-testid="tour-spotlight-frame"
          aria-hidden="true"
          className={`pointer-events-none fixed z-50 rounded-2xl border-2 border-teal-400 shadow-[0_0_0_4px_rgba(45,212,191,0.28),0_0_28px_rgba(20,184,166,0.38)] ${
            reduceMotion ? '' : 'transition-all duration-300 ease-out'
          }`}
          style={{
            top: `${cutout.top}px`,
            left: `${cutout.left}px`,
            width: `${cutout.width}px`,
            height: `${cutout.height}px`,
          }}
        />
      )}

      {/* Coachmark popover card with directional arrow pointing at the target */}
      <div
        className={
          isMobile
            ? 'fixed inset-x-0 bottom-0 z-50 p-3'
            : popoverGeometry
              ? `fixed z-50 ${reduceMotion ? '' : 'transition-all duration-300 ease-out'}`
              : 'pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4'
        }
        style={
          popoverGeometry
            ? {
                top: `${popoverGeometry.top}px`,
                left: `${popoverGeometry.left}px`,
                width: `${popoverGeometry.width}px`,
              }
            : undefined
        }
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-step-title"
          aria-describedby="tour-step-body"
          className="pointer-events-auto relative w-full max-w-md rounded-2xl border-2 border-teal-500 bg-white p-5 shadow-2xl dark:border-teal-400 dark:bg-neutral-950"
        >
          {renderArrow()}

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="font-mono-tabular text-xs font-semibold text-teal-700 dark:text-teal-400">
                {t('tour.stepCounter', { current: stepIndex + 1, total: steps.length })}
              </span>
              <div className="flex items-center gap-1" aria-hidden="true">
                {steps.map((s, idx) => (
                  <span
                    key={s.id}
                    className={`h-1.5 rounded-full transition-all ${
                      idx === stepIndex
                        ? 'w-4 bg-teal-600 dark:bg-teal-400'
                        : idx < stepIndex
                          ? 'w-1.5 bg-teal-400/60 dark:bg-teal-600'
                          : 'w-1.5 bg-slate-200 dark:bg-neutral-700'
                    }`}
                  />
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label={t('tour.skip')}
              className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <h2
            id="tour-step-title"
            className="font-display mt-2 text-base font-bold text-slate-900 dark:text-neutral-100"
          >
            {t(currentStep.titleKey)}
          </h2>
          <p
            id="tour-step-body"
            className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-neutral-300"
          >
            {bodyText}
          </p>

          {showFallbackNote && currentStep.fallbackNoteKey && (
            <p className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
              {t(currentStep.fallbackNoteKey)}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="min-h-[40px] rounded-lg px-2.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              {t('tour.skip')}
            </button>

            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('tour.back')}
                </button>
              )}
              <button
                type="button"
                data-tour-primary="true"
                onClick={handleNext}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-700"
              >
                {isLast ? t('tour.finish') : t('tour.next')}
                {!isLast && <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
