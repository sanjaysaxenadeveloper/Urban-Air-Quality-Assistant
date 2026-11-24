export interface AqiBreakpoint {
  cLow: number;
  cHigh: number;
  iLow: number;
  iHigh: number;
}

export type CpcbCategoryId =
  | 'good'
  | 'satisfactory'
  | 'moderate'
  | 'poor'
  | 'very_poor'
  | 'severe';

export type UsEpaCategoryId =
  | 'good'
  | 'moderate'
  | 'unhealthy_sensitive'
  | 'unhealthy'
  | 'very_unhealthy'
  | 'hazardous';

export interface CategoryMeta<TId extends string> {
  id: TId;
  label: string;
  min: number;
  max: number;
  severity: 1 | 2 | 3 | 4 | 5 | 6;
  icon: 'check-circle' | 'shield-check' | 'alert-circle' | 'alert-triangle' | 'flame' | 'octagon-alert';
  colorToken: 'emerald' | 'lime' | 'amber' | 'orange' | 'rose' | 'purple';
  shortImpact: string;
}

export const CPCB_CATEGORIES: readonly CategoryMeta<CpcbCategoryId>[] = [
  {
    id: 'good',
    label: 'Good',
    min: 0,
    max: 50,
    severity: 1,
    icon: 'check-circle',
    colorToken: 'emerald',
    shortImpact: 'Minimal health impact.',
  },
  {
    id: 'satisfactory',
    label: 'Satisfactory',
    min: 51,
    max: 100,
    severity: 2,
    icon: 'shield-check',
    colorToken: 'lime',
    shortImpact: 'Minor breathing discomfort for sensitive people.',
  },
  {
    id: 'moderate',
    label: 'Moderate',
    min: 101,
    max: 200,
    severity: 3,
    icon: 'alert-circle',
    colorToken: 'amber',
    shortImpact: 'Breathing discomfort for people with asthma, lungs, or heart conditions.',
  },
  {
    id: 'poor',
    label: 'Poor',
    min: 201,
    max: 300,
    severity: 4,
    icon: 'alert-triangle',
    colorToken: 'orange',
    shortImpact: 'Breathing discomfort for most people on prolonged exposure.',
  },
  {
    id: 'very_poor',
    label: 'Very Poor',
    min: 301,
    max: 400,
    severity: 5,
    icon: 'flame',
    colorToken: 'rose',
    shortImpact: 'Respiratory illness risk on prolonged exposure.',
  },
  {
    id: 'severe',
    label: 'Severe',
    min: 401,
    max: 500,
    severity: 6,
    icon: 'octagon-alert',
    colorToken: 'purple',
    shortImpact: 'Affects healthy people and seriously impacts those with existing conditions.',
  },
] as const;

export const US_EPA_CATEGORIES: readonly CategoryMeta<UsEpaCategoryId>[] = [
  {
    id: 'good',
    label: 'Good',
    min: 0,
    max: 50,
    severity: 1,
    icon: 'check-circle',
    colorToken: 'emerald',
    shortImpact: 'Air quality is satisfactory.',
  },
  {
    id: 'moderate',
    label: 'Moderate',
    min: 51,
    max: 100,
    severity: 2,
    icon: 'shield-check',
    colorToken: 'lime',
    shortImpact: 'Acceptable; minor risk for unusually sensitive people.',
  },
  {
    id: 'unhealthy_sensitive',
    label: 'Unhealthy for Sensitive Groups',
    min: 101,
    max: 150,
    severity: 3,
    icon: 'alert-circle',
    colorToken: 'amber',
    shortImpact: 'Sensitive groups may experience health effects.',
  },
  {
    id: 'unhealthy',
    label: 'Unhealthy',
    min: 151,
    max: 200,
    severity: 4,
    icon: 'alert-triangle',
    colorToken: 'orange',
    shortImpact: 'Everyone may begin to experience health effects.',
  },
  {
    id: 'very_unhealthy',
    label: 'Very Unhealthy',
    min: 201,
    max: 300,
    severity: 5,
    icon: 'flame',
    colorToken: 'rose',
    shortImpact: 'Health alert: increased risk for everyone.',
  },
  {
    id: 'hazardous',
    label: 'Hazardous',
    min: 301,
    max: 500,
    severity: 6,
    icon: 'octagon-alert',
    colorToken: 'purple',
    shortImpact: 'Health warning of emergency conditions.',
  },
] as const;

// Official Indian CPCB National Air Quality Index (NAQI) breakpoints (ug/m3, CO in mg/m3)
export const CPCB_BREAKPOINTS: Record<'pm25' | 'pm10' | 'no2' | 'so2' | 'o3' | 'co', readonly AqiBreakpoint[]> = {
  pm25: [
    { cLow: 0, cHigh: 30, iLow: 0, iHigh: 50 },
    { cLow: 31, cHigh: 60, iLow: 51, iHigh: 100 },
    { cLow: 61, cHigh: 90, iLow: 101, iHigh: 200 },
    { cLow: 91, cHigh: 120, iLow: 201, iHigh: 300 },
    { cLow: 121, cHigh: 250, iLow: 301, iHigh: 400 },
    { cLow: 251, cHigh: 500, iLow: 401, iHigh: 500 },
  ],
  pm10: [
    { cLow: 0, cHigh: 50, iLow: 0, iHigh: 50 },
    { cLow: 51, cHigh: 100, iLow: 51, iHigh: 100 },
    { cLow: 101, cHigh: 250, iLow: 101, iHigh: 200 },
    { cLow: 251, cHigh: 350, iLow: 201, iHigh: 300 },
    { cLow: 351, cHigh: 430, iLow: 301, iHigh: 400 },
    { cLow: 431, cHigh: 600, iLow: 401, iHigh: 500 },
  ],
  no2: [
    { cLow: 0, cHigh: 40, iLow: 0, iHigh: 50 },
    { cLow: 41, cHigh: 80, iLow: 51, iHigh: 100 },
    { cLow: 81, cHigh: 180, iLow: 101, iHigh: 200 },
    { cLow: 181, cHigh: 280, iLow: 201, iHigh: 300 },
    { cLow: 281, cHigh: 400, iLow: 301, iHigh: 400 },
    { cLow: 401, cHigh: 600, iLow: 401, iHigh: 500 },
  ],
  so2: [
    { cLow: 0, cHigh: 40, iLow: 0, iHigh: 50 },
    { cLow: 41, cHigh: 80, iLow: 51, iHigh: 100 },
    { cLow: 81, cHigh: 380, iLow: 101, iHigh: 200 },
    { cLow: 381, cHigh: 800, iLow: 201, iHigh: 300 },
    { cLow: 801, cHigh: 1600, iLow: 301, iHigh: 400 },
    { cLow: 1601, cHigh: 2100, iLow: 401, iHigh: 500 },
  ],
  o3: [
    { cLow: 0, cHigh: 50, iLow: 0, iHigh: 50 },
    { cLow: 51, cHigh: 100, iLow: 51, iHigh: 100 },
    { cLow: 101, cHigh: 168, iLow: 101, iHigh: 200 },
    { cLow: 169, cHigh: 208, iLow: 201, iHigh: 300 },
    { cLow: 209, cHigh: 748, iLow: 301, iHigh: 400 },
    { cLow: 749, cHigh: 1000, iLow: 401, iHigh: 500 },
  ],
  co: [
    { cLow: 0, cHigh: 1.0, iLow: 0, iHigh: 50 },
    { cLow: 1.1, cHigh: 2.0, iLow: 51, iHigh: 100 },
    { cLow: 2.1, cHigh: 10.0, iLow: 101, iHigh: 200 },
    { cLow: 10.1, cHigh: 17.0, iLow: 201, iHigh: 300 },
    { cLow: 17.1, cHigh: 34.0, iLow: 301, iHigh: 400 },
    { cLow: 34.1, cHigh: 50.0, iLow: 401, iHigh: 500 },
  ],
};

// Official US EPA 2024 AQI breakpoints for PM2.5 and PM10 (ug/m3)
export const US_EPA_BREAKPOINTS: Record<'pm25' | 'pm10', readonly AqiBreakpoint[]> = {
  pm25: [
    { cLow: 0.0, cHigh: 9.0, iLow: 0, iHigh: 50 },
    { cLow: 9.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
    { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
    { cLow: 55.5, cHigh: 125.4, iLow: 151, iHigh: 200 },
    { cLow: 125.5, cHigh: 225.4, iLow: 201, iHigh: 300 },
    { cLow: 225.5, cHigh: 500.4, iLow: 301, iHigh: 500 },
  ],
  pm10: [
    { cLow: 0, cHigh: 54, iLow: 0, iHigh: 50 },
    { cLow: 55, cHigh: 154, iLow: 51, iHigh: 100 },
    { cLow: 155, cHigh: 254, iLow: 101, iHigh: 150 },
    { cLow: 255, cHigh: 354, iLow: 151, iHigh: 200 },
    { cLow: 355, cHigh: 424, iLow: 201, iHigh: 300 },
    { cLow: 425, cHigh: 604, iLow: 301, iHigh: 500 },
  ],
};

// Geographic bounding box covering all Indian states & union territories
export const INDIA_BOUNDS = {
  minLat: 6.0,
  maxLat: 37.6,
  minLon: 68.0,
  maxLon: 97.5,
} as const;

export interface QuickPickCity {
  id: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
}

export const QUICK_PICK_CITIES: readonly QuickPickCity[] = [
  { id: 'delhi', name: 'Delhi', state: 'Delhi', lat: 28.6139, lon: 77.209 },
  { id: 'noida', name: 'Noida', state: 'Uttar Pradesh', lat: 28.5355, lon: 77.391 },
  { id: 'gurugram', name: 'Gurugram', state: 'Haryana', lat: 28.4595, lon: 77.0266 },
  { id: 'mumbai', name: 'Mumbai', state: 'Maharashtra', lat: 19.076, lon: 72.8777 },
  { id: 'kolkata', name: 'Kolkata', state: 'West Bengal', lat: 22.5726, lon: 88.3639 },
  { id: 'lucknow', name: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lon: 80.9462 },
  { id: 'patna', name: 'Patna', state: 'Bihar', lat: 25.5941, lon: 85.1376 },
  { id: 'bhopal', name: 'Bhopal', state: 'Madhya Pradesh', lat: 23.2599, lon: 77.4126 },
] as const;

export const AIR_CACHE_TTL_MS = 12 * 60 * 1000; // 12 minutes
export const FRESHNESS_LIVE_MAX_MINUTES = 30;
export const FRESHNESS_RECENT_MAX_MINUTES = 90;
export const CURRENT_TOUR_VERSION = 1;
export const CURRENT_PREFERENCES_SCHEMA_VERSION = 2;

export interface DemoScenarioPreset {
  id: 'delhi_commuter' | 'mumbai_family' | 'kolkata_seniors';
  title: string;
  subtitle: string;
  location: QuickPickCity;
  profile: {
    householdType: 'working_professional' | 'family_with_kids' | 'senior_citizens' | 'students' | 'community_group';
    commuteMode: 'car_solo' | 'two_wheeler' | 'metro_bus' | 'auto_cab' | 'walk_cycle' | 'wfh';
    commuteMinutes: number;
    outdoorHabits: Array<'kids_play' | 'morning_walk' | 'outdoor_sports' | 'market_errands' | 'none'>;
    healthSensitivities: Array<'asthma' | 'allergies' | 'elderly' | 'pregnancy' | 'heart_lung' | 'none'>;
    homeSetup: {
      hasPurifier: boolean;
      windowType: 'sealed_ac' | 'standard_mesh' | 'open_ventilation';
      cookingFuel: 'lpg_png' | 'induction' | 'biomass_kerosene';
      hasExhaustFan: boolean;
      indoorPlants: boolean;
    };
    optionalIndoorPm25: number | null;
  };
}

export const DEMO_SCENARIOS: readonly DemoScenarioPreset[] = [
  {
    id: 'delhi_commuter',
    title: 'Working Commuter in Delhi',
    subtitle: '50 min daily two-wheeler/car commute · morning walk · no purifier yet',
    location: QUICK_PICK_CITIES[0], // Delhi
    profile: {
      householdType: 'working_professional',
      commuteMode: 'two_wheeler',
      commuteMinutes: 50,
      outdoorHabits: ['morning_walk'],
      healthSensitivities: ['allergies'],
      homeSetup: {
        hasPurifier: false,
        windowType: 'standard_mesh',
        cookingFuel: 'lpg_png',
        hasExhaustFan: true,
        indoorPlants: false,
      },
      optionalIndoorPm25: null,
    },
  },
  {
    id: 'mumbai_family',
    title: 'Family with 2 Kids in Mumbai',
    subtitle: 'Evening park play · child asthma sensitivity · HEPA purifier at home',
    location: QUICK_PICK_CITIES[3], // Mumbai
    profile: {
      householdType: 'family_with_kids',
      commuteMode: 'car_solo',
      commuteMinutes: 40,
      outdoorHabits: ['kids_play', 'market_errands'],
      healthSensitivities: ['asthma'],
      homeSetup: {
        hasPurifier: true,
        windowType: 'sealed_ac',
        cookingFuel: 'lpg_png',
        hasExhaustFan: true,
        indoorPlants: true,
      },
      optionalIndoorPm25: null,
    },
  },
  {
    id: 'kolkata_seniors',
    title: 'Senior Couple in Kolkata',
    subtitle: 'Early morning walk · elderly & respiratory sensitivity · open windows',
    location: QUICK_PICK_CITIES[4], // Kolkata
    profile: {
      householdType: 'senior_citizens',
      commuteMode: 'auto_cab',
      commuteMinutes: 20,
      outdoorHabits: ['morning_walk', 'market_errands'],
      healthSensitivities: ['elderly', 'heart_lung'],
      homeSetup: {
        hasPurifier: false,
        windowType: 'open_ventilation',
        cookingFuel: 'lpg_png',
        hasExhaustFan: false,
        indoorPlants: true,
      },
      optionalIndoorPm25: null,
    },
  },
] as const;

