export const CURRENT_TOUR_VERSION = 1;

export type TourPlacement = 'bottom' | 'top' | 'left' | 'right';

export interface TourStep {
  id: string;
  targetSelector: string;
  fallbackSelector?: string;
  preferredPlacement?: TourPlacement;
  titleKey: string;
  bodyKey: string;
  signedInBodyKey?: string;
  fallbackNoteKey?: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'location',
    targetSelector: '#tour-location-picker',
    preferredPlacement: 'bottom',
    titleKey: 'tour.steps.location.title',
    bodyKey: 'tour.steps.location.body',
  },
  {
    id: 'snapshot',
    targetSelector: '#tour-air-snapshot',
    fallbackSelector: '#tour-hero-demos',
    preferredPlacement: 'bottom',
    titleKey: 'tour.steps.snapshot.title',
    bodyKey: 'tour.steps.snapshot.body',
    fallbackNoteKey: 'tour.steps.snapshot.fallback',
  },
  {
    id: 'profile',
    targetSelector: '#tour-profile-panel',
    preferredPlacement: 'left',
    titleKey: 'tour.steps.profile.title',
    bodyKey: 'tour.steps.profile.body',
  },
  {
    id: 'planner',
    targetSelector: '#tour-daily-planner',
    fallbackSelector: '#tour-hero-demos',
    preferredPlacement: 'bottom',
    titleKey: 'tour.steps.planner.title',
    bodyKey: 'tour.steps.planner.body',
    fallbackNoteKey: 'tour.steps.planner.fallback',
  },
  {
    id: 'indoor',
    targetSelector: '#tour-indoor-guide',
    fallbackSelector: '#tour-profile-panel',
    preferredPlacement: 'top',
    titleKey: 'tour.steps.indoor.title',
    bodyKey: 'tour.steps.indoor.body',
    fallbackNoteKey: 'tour.steps.indoor.fallback',
  },
  {
    id: 'sustainable_chat',
    targetSelector: '#tour-grounded-chat',
    fallbackSelector: '#tour-hero-demos',
    preferredPlacement: 'top',
    titleKey: 'tour.steps.sustainableChat.title',
    bodyKey: 'tour.steps.sustainableChat.body',
    fallbackNoteKey: 'tour.steps.sustainableChat.fallback',
  },
  {
    id: 'header_actions',
    targetSelector: '#tour-header-actions',
    preferredPlacement: 'bottom',
    titleKey: 'tour.steps.headerActions.title',
    bodyKey: 'tour.steps.headerActions.guestBody',
    signedInBodyKey: 'tour.steps.headerActions.signedInBody',
  },
];
