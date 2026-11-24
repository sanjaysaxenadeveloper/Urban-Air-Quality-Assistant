// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoachmarkTour } from '../src/components/CoachmarkTour.tsx';
import { HelpPage, extractYouTubeVideoId } from '../src/components/HelpPage.tsx';
import { CURRENT_TOUR_VERSION } from '../src/components/tourSteps.ts';
import { I18nProvider } from '../src/i18n/I18nContext.tsx';

afterEach(() => {
  cleanup();
});

describe('CoachmarkTour accessibility, progression & edge cases', () => {
  it('progresses from welcome modal through steps with Next, Back, Arrow keys, handles missing target, and adapts step 7 copy for guest vs signed-in', () => {
    const onStartTour = vi.fn();
    const onCompleteOrSkip = vi.fn();

    // Render with only 1 of 7 target elements present to verify missing-target fallback works cleanly
    const { rerender } = render(
      <I18nProvider language="en">
        <div id="tour-location-picker">Location picker</div>
        <CoachmarkTour
          phase="welcome"
          isSignedIn={false}
          reduceMotion={true}
          onStartTour={onStartTour}
          onCompleteOrSkip={onCompleteOrSkip}
        />
      </I18nProvider>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Take the tour/i }));
    expect(onStartTour).toHaveBeenCalledOnce();

    // Switch to active phase as Guest
    rerender(
      <I18nProvider language="en">
        <div id="tour-location-picker">Location picker</div>
        <CoachmarkTour
          phase="active"
          isSignedIn={false}
          reduceMotion={true}
          onStartTour={onStartTour}
          onCompleteOrSkip={onCompleteOrSkip}
        />
      </I18nProvider>
    );

    // Step 1 of 7
    expect(screen.getByText('1 of 7')).toBeInTheDocument();
    // Target element must NOT be hidden from assistive tech
    expect(document.getElementById('tour-location-picker')).not.toHaveAttribute('aria-hidden');

    // Advance via ArrowRight -> Step 2 (target #tour-air-snapshot is missing -> fallback renders!)
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByText('2 of 7')).toBeInTheDocument();

    // Go back via ArrowLeft -> Step 1
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByText('1 of 7')).toBeInTheDocument();

    // Advance all the way to Step 7 (guest copy mentions optional sign-in)
    for (let i = 0; i < 6; i++) {
      fireEvent.keyDown(document, { key: 'ArrowRight' });
    }
    expect(screen.getByText('7 of 7')).toBeInTheDocument();
    expect(screen.getByText(/Guest mode works/i)).toBeInTheDocument();

    // Re-render Step 7 as signed-in user -> copy adapts!
    rerender(
      <I18nProvider language="en">
        <div id="tour-location-picker">Location picker</div>
        <CoachmarkTour
          phase="active"
          isSignedIn={true}
          reduceMotion={true}
          onStartTour={onStartTour}
          onCompleteOrSkip={onCompleteOrSkip}
        />
      </I18nProvider>
    );
    expect(screen.getByText(/signed in/i)).toBeInTheDocument();

    // Finish persists CURRENT_TOUR_VERSION
    fireEvent.click(screen.getByRole('button', { name: /Done/i }));
    expect(onCompleteOrSkip).toHaveBeenCalledWith(CURRENT_TOUR_VERSION);
  });

  it('closes on Escape and persists tour completion version', () => {
    const onCompleteOrSkip = vi.fn();
    render(
      <I18nProvider language="en">
        <CoachmarkTour
          phase="active"
          isSignedIn={false}
          reduceMotion={false}
          onStartTour={vi.fn()}
          onCompleteOrSkip={onCompleteOrSkip}
        />
      </I18nProvider>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCompleteOrSkip).toHaveBeenCalledWith(CURRENT_TOUR_VERSION);
  });

  it('renders an unobstructed SVG cutout spotlight, focus frame, and directional pointer arrow aligned to the highlighted target', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    const target = document.createElement('div');
    target.id = 'tour-location-picker';
    target.getBoundingClientRect = () =>
      ({
        top: 90,
        left: 120,
        width: 800,
        height: 110,
        right: 920,
        bottom: 200,
        x: 120,
        y: 90,
        toJSON: () => {},
      }) as DOMRect;
    document.body.appendChild(target);

    try {
      render(
        <I18nProvider language="en">
          <CoachmarkTour
            phase="active"
            isSignedIn={false}
            reduceMotion={true}
            onStartTour={vi.fn()}
            onCompleteOrSkip={vi.fn()}
          />
        </I18nProvider>
      );

      // SVG cutout spotlight mask punches a black hole over the highlighted target
      const maskSvg = screen.getByTestId('tour-spotlight-mask');
      expect(maskSvg).toBeInTheDocument();
      expect(maskSvg.querySelector('mask rect[fill="black"]')).not.toBeNull();

      // Glowing focus frame wraps the cutout
      expect(screen.getByTestId('tour-spotlight-frame')).toBeInTheDocument();

      // Directional pointer arrow points directly toward the highlighted element
      const arrow = screen.getByTestId('tour-arrow');
      expect(arrow).toBeInTheDocument();
      expect(arrow).toHaveAttribute('data-placement', 'bottom');
    } finally {
      target.remove();
    }
  });
});

describe('HelpPage video facade, FAQ accordion & URL parsing', () => {
  it('parses standard youtube.com, youtu.be, and embed URLs cleanly', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeVideoId('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
    expect(extractYouTubeVideoId('not-a-url')).toBeNull();
  });

  it('renders click-to-load video facade without iframe initially, loads youtube-nocookie iframe on Play, and supports keyboard FAQ accordion', () => {
    const onTryDemo = vi.fn();
    render(
      <I18nProvider language="en">
        <HelpPage
          onBack={vi.fn()}
          onStartTour={vi.fn()}
          onTryDemo={onTryDemo}
          videoUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        />
      </I18nProvider>
    );

    // No iframe loaded initially (privacy facade!)
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('link', { name: /Open video on YouTube/i })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    );

    // Click Play -> mounts youtube-nocookie.com iframe
    fireEvent.click(screen.getByRole('button', { name: /Play 2-minute walkthrough video/i }));
    const iframe = document.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toContain(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
    );

    // FAQ keyboard navigation & toggle
    const firstFaq = screen.getByRole('button', {
      name: /Where does the live air-quality data come from/i,
    });
    const secondFaq = screen.getByRole('button', {
      name: /Why do two residents in the same city/i,
    });
    expect(firstFaq).toHaveAttribute('aria-expanded', 'true');
    expect(secondFaq).toHaveAttribute('aria-expanded', 'false');

    firstFaq.focus();
    fireEvent.keyDown(firstFaq, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(secondFaq);

    fireEvent.click(secondFaq);
    expect(secondFaq).toHaveAttribute('aria-expanded', 'true');

    // Demo scenario trigger works
    const tryButtons = screen.getAllByRole('button', { name: /Try this scenario/i });
    expect(tryButtons).toHaveLength(3);
    fireEvent.click(tryButtons[0]);
    expect(onTryDemo).toHaveBeenCalledOnce();
  });
});
