import { z } from 'zod';
import { INDIA_BOUNDS } from './constants.ts';
import { SUPPORTED_LANGUAGE_CODES, type SupportedLanguage } from './languages.ts';

export const SupportedLanguageEnum = z.enum(SUPPORTED_LANGUAGE_CODES);
export type { SupportedLanguage };

export const LocationSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(120),
  state: z.string().trim().max(120).optional().default(''),
  lat: z.number().min(INDIA_BOUNDS.minLat).max(INDIA_BOUNDS.maxLat),
  lon: z.number().min(INDIA_BOUNDS.minLon).max(INDIA_BOUNDS.maxLon),
});

export type IndianLocation = z.infer<typeof LocationSchema>;

export const AirQuerySchema = z.object({
  lat: z.coerce.number().min(INDIA_BOUNDS.minLat, 'Latitude must be within India').max(INDIA_BOUNDS.maxLat, 'Latitude must be within India'),
  lon: z.coerce.number().min(INDIA_BOUNDS.minLon, 'Longitude must be within India').max(INDIA_BOUNDS.maxLon, 'Longitude must be within India'),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  refresh: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export type AirQuery = z.infer<typeof AirQuerySchema>;

export const GeocodeQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, 'Enter at least 2 characters to search')
    .max(80, 'Search query is too long')
    .regex(/^[\p{L}\p{N}\s,.'-]+$/u, 'Search contains unsupported characters'),
});

export const ReverseGeocodeQuerySchema = z.object({
  lat: z.coerce.number().min(INDIA_BOUNDS.minLat).max(INDIA_BOUNDS.maxLat),
  lon: z.coerce.number().min(INDIA_BOUNDS.minLon).max(INDIA_BOUNDS.maxLon),
});

export const WeatherSnapshotSchema = z.object({
  temperatureC: z.number(),
  humidityPct: z.number().min(0).max(100),
  windSpeedKmh: z.number().min(0),
  windDirectionDeg: z.number().min(0).max(360).nullable(),
  weatherCode: z.number().int().nullable(),
  sourceName: z.string(),
});

export type WeatherSnapshot = z.infer<typeof WeatherSnapshotSchema>;

export const AirSourceSchema = z.object({
  id: z.enum(['openaq', 'cpcb_datagov', 'waqi', 'open_meteo']),
  name: z.string(),
  isModelled: z.boolean(),
  stationName: z.string().nullable(),
});

export type AirSource = z.infer<typeof AirSourceSchema>;

export const AirQualitySnapshotSchema = z.object({
  location: LocationSchema,
  aqi: z.number().int().min(0).max(500),
  cpcbCategory: z.enum(['good', 'satisfactory', 'moderate', 'poor', 'very_poor', 'severe']),
  usEpaAqi: z.number().int().min(0).max(500),
  usEpaCategory: z.enum([
    'good',
    'moderate',
    'unhealthy_sensitive',
    'unhealthy',
    'very_unhealthy',
    'hazardous',
  ]),
  pm25: z.number().min(0).nullable(),
  pm10: z.number().min(0).nullable(),
  no2: z.number().min(0).nullable(),
  so2: z.number().min(0).nullable(),
  o3: z.number().min(0).nullable(),
  co: z.number().min(0).nullable(),
  dominantPollutant: z.enum(['PM2.5', 'PM10', 'NO2', 'SO2', 'O3', 'CO', 'AQI']),
  weather: WeatherSnapshotSchema.nullable(),
  source: AirSourceSchema,
  updatedAtIso: z.string(),
  fetchedAtIso: z.string(),
  freshness: z.enum(['live', 'recent', 'stale']),
  freshnessMinutes: z.number().int().min(0),
  cacheHit: z.boolean(),
});

export type AirQualitySnapshot = z.infer<typeof AirQualitySnapshotSchema>;

export const HouseholdTypeEnum = z.enum([
  'working_professional',
  'family_with_kids',
  'senior_citizens',
  'students',
  'community_group',
]);

export const CommuteModeEnum = z.enum([
  'car_solo',
  'two_wheeler',
  'metro_bus',
  'auto_cab',
  'walk_cycle',
  'wfh',
]);

export const OutdoorHabitEnum = z.enum([
  'kids_play',
  'morning_walk',
  'outdoor_sports',
  'market_errands',
  'none',
]);

export const HealthSensitivityEnum = z.enum([
  'asthma',
  'allergies',
  'elderly',
  'pregnancy',
  'heart_lung',
  'none',
]);

export const HomeSetupSchema = z.object({
  hasPurifier: z.boolean().default(false),
  windowType: z.enum(['sealed_ac', 'standard_mesh', 'open_ventilation']).default('standard_mesh'),
  cookingFuel: z.enum(['lpg_png', 'induction', 'biomass_kerosene']).default('lpg_png'),
  hasExhaustFan: z.boolean().default(true),
  indoorPlants: z.boolean().default(false),
});

export const UserProfileSchema = z.object({
  householdType: HouseholdTypeEnum.default('family_with_kids'),
  commuteMode: CommuteModeEnum.default('metro_bus'),
  commuteMinutes: z.number().int().min(0).max(240).default(35),
  outdoorHabits: z.array(OutdoorHabitEnum).max(5).default(['morning_walk']),
  healthSensitivities: z.array(HealthSensitivityEnum).max(6).default(['none']),
  homeSetup: HomeSetupSchema.default({
    hasPurifier: false,
    windowType: 'standard_mesh',
    cookingFuel: 'lpg_png',
    hasExhaustFan: true,
    indoorPlants: false,
  }),
  optionalIndoorPm25: z.number().min(0).max(999).nullable().optional().default(null),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

export const DEFAULT_USER_PROFILE: UserProfile = UserProfileSchema.parse({});

export const AdviceStylePrefsSchema = z.object({
  language: SupportedLanguageEnum.default('en'),
  detail: z.enum(['concise', 'detailed']).default('concise'),
  tone: z.enum(['plain', 'technical']).default('plain'),
  tempUnit: z.enum(['C', 'F']).default('C'),
  aqiScale: z.enum(['CPCB', 'EPA']).default('CPCB'),
  preferredMask: z.enum(['N95', 'FFP2', 'surgical', 'cloth']).default('N95'),
});

export type AdviceStylePrefs = z.infer<typeof AdviceStylePrefsSchema>;

export const DailyPeriodAdviceSchema = z.object({
  period: z.enum(['morning', 'afternoon', 'evening']),
  windowSummary: z.string().min(3).max(260),
  action: z.string().min(3).max(400),
  commuteAndActivity: z.string().min(3).max(400),
  maskGuidance: z.string().min(3).max(300),
  hydrationAndRecovery: z.string().min(3).max(300),
  why: z.string().min(3).max(400),
  expectedBenefit: z.string().min(3).max(260),
  assumptionNote: z.string().min(3).max(260),
});

export const IndoorRecommendationSchema = z.object({
  title: z.string().min(2).max(140),
  action: z.string().min(3).max(400),
  why: z.string().min(3).max(400),
  expectedBenefit: z.string().min(3).max(260),
  assumptionNote: z.string().min(3).max(260),
});

export const SustainableAlternativeSchema = z.object({
  title: z.string().min(2).max(140),
  action: z.string().min(3).max(400),
  comparedTo: z.string().min(2).max(200),
  why: z.string().min(3).max(400),
  expectedBenefit: z.string().min(3).max(260),
  assumptionNote: z.string().min(3).max(260),
});

export const DecisionPlanSchema = z.object({
  todaysVerdict: z.string().min(5).max(260),
  severitySummary: z.string().min(5).max(320),
  dailyPlanner: z.object({
    morning: DailyPeriodAdviceSchema,
    afternoon: DailyPeriodAdviceSchema,
    evening: DailyPeriodAdviceSchema,
  }),
  indoorGuide: z.object({
    indoorReadingNote: z.string().min(5).max(320),
    ventilationVerdict: z.enum(['seal', 'brief_ventilate', 'ventilate']),
    ventilationReason: z.string().min(5).max(320),
    recommendations: z.array(IndoorRecommendationSchema).min(3).max(6),
  }),
  sustainablePlanner: z.object({
    alternatives: z.array(SustainableAlternativeSchema).min(3).max(6),
  }),
  whyThisAdvice: z.object({
    dataUsed: z.array(z.string().min(2).max(260)).min(2).max(8),
    reasoning: z.string().min(10).max(900),
    medicalDisclaimer: z.string().min(10).max(360),
  }),
});

export type DecisionPlan = z.infer<typeof DecisionPlanSchema>;

export const PlanRequestSchema = z.object({
  location: LocationSchema,
  profile: UserProfileSchema,
  advicePrefs: AdviceStylePrefsSchema.optional().default({
    language: 'en',
    detail: 'concise',
    tone: 'plain',
    tempUnit: 'C',
    aqiScale: 'CPCB',
    preferredMask: 'N95',
  }),
});

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(1200),
});

export const ChatRequestSchema = z.object({
  location: LocationSchema,
  profile: UserProfileSchema,
  advicePrefs: AdviceStylePrefsSchema.optional().default({
    language: 'en',
    detail: 'concise',
    tone: 'plain',
    tempUnit: 'C',
    aqiScale: 'CPCB',
    preferredMask: 'N95',
  }),
  question: z.string().trim().min(2, 'Please enter a question').max(500, 'Question is too long'),
  history: z.array(ChatMessageSchema).max(10).optional().default([]),
});

export const ChatResponseSchema = z.object({
  answer: z.string().min(5).max(1200),
  actionableSteps: z.array(z.string().min(2).max(260)).min(1).max(4),
  why: z.string().min(5).max(450),
  confidenceNote: z.string().min(5).max(320),
  medicalDisclaimer: z.string().min(5).max(300),
});

export type ChatReply = z.infer<typeof ChatResponseSchema>;

export const PlannerSectionsSchema = z.object({
  daily: z.boolean().default(true),
  indoor: z.boolean().default(true),
  sustainable: z.boolean().default(true),
});

export const UserPreferencesSchema = z.object({
  schemaVersion: z.literal(2).default(2),
  language: SupportedLanguageEnum.default('en'),
  tempUnit: z.enum(['C', 'F']).default('C'),
  aqiScale: z.enum(['CPCB', 'EPA']).default('CPCB'),
  timeFormat: z.enum(['12h', '24h']).default('12h'),
  theme: z.enum(['light', 'dark', 'system']).default('dark'),
  textSize: z.enum(['normal', 'large', 'xl']).default('normal'),
  highContrast: z.boolean().default(false),
  reduceMotion: z.boolean().default(false),
  adviceDetail: z.enum(['concise', 'detailed']).default('concise'),
  adviceTone: z.enum(['plain', 'technical']).default('plain'),
  showWhyByDefault: z.boolean().default(false),
  defaultLocation: LocationSchema.nullable().default(null),
  useCurrentLocationOnOpen: z.boolean().default(false),
  plannerSections: PlannerSectionsSchema.default({
    daily: true,
    indoor: true,
    sustainable: true,
  }),
  defaultCommuteMode: CommuteModeEnum.default('metro_bus'),
  preferredMask: z.enum(['N95', 'FFP2', 'surgical', 'cloth']).default('N95'),
  tourCompleted: z.boolean().default(false),
  tourVersion: z.number().int().min(0).default(0),
  seenHints: z.array(z.string().min(1).max(60)).max(20).default([]),
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const DEFAULT_USER_PREFERENCES: UserPreferences = UserPreferencesSchema.parse({});

export const UserPreferencesPatchSchema = UserPreferencesSchema.partial();

/**
 * Migrates stored preference objects (including legacy v1 shapes or partially invalid values)
 * safely into a validated v2 UserPreferences object without throwing.
 */
export function migratePreferences(
  raw: unknown,
  osPrefersReducedMotion = false
): UserPreferences {
  const base: UserPreferences = {
    ...DEFAULT_USER_PREFERENCES,
    reduceMotion: osPrefersReducedMotion,
  };

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return base;
  }

  const input = { ...(raw as Record<string, unknown>) };

  // Legacy v1 -> v2 migration rules
  if (input.schemaVersion === 1 || input.schemaVersion === undefined) {
    const legacyLangMap: Record<string, SupportedLanguage> = {
      english: 'en',
      en: 'en',
      hindi: 'hi',
      hi: 'hi',
      marathi: 'mr',
      mr: 'mr',
      punjabi: 'pa',
      panjabi: 'pa',
      pa: 'pa',
      bengali: 'bn',
      bn: 'bn',
      tamil: 'ta',
      ta: 'ta',
      telugu: 'te',
      te: 'te',
      gujarati: 'gu',
      gu: 'gu',
      kannada: 'kn',
      kn: 'kn',
      malayalam: 'ml',
      ml: 'ml',
    };
    if (typeof input.lang === 'string') {
      const mapped = legacyLangMap[input.lang.toLowerCase()];
      if (mapped) input.language = mapped;
    }
    if (input.units === 'imperial') {
      input.tempUnit = 'F';
      input.aqiScale = 'EPA';
    } else if (input.units === 'metric') {
      input.tempUnit = 'C';
      input.aqiScale = 'CPCB';
    }
    if (typeof input.compactAdvice === 'boolean' && input.adviceDetail === undefined) {
      input.adviceDetail = input.compactAdvice ? 'concise' : 'detailed';
    }
    input.schemaVersion = 2;
  }

  // Fast path: fully valid v2 object
  const fullParse = UserPreferencesSchema.safeParse(input);
  if (fullParse.success) {
    return fullParse.data;
  }

  // Field-by-field recovery so one corrupted field never wipes valid user preferences
  const recovered: Record<string, unknown> = { ...base };
  const shape = UserPreferencesSchema.shape;
  for (const key of Object.keys(shape) as Array<keyof typeof shape>) {
    if (key === 'schemaVersion') {
      recovered.schemaVersion = 2;
      continue;
    }
    if (key in input) {
      const fieldResult = shape[key].safeParse(input[key]);
      if (fieldResult.success) {
        recovered[key] = fieldResult.data;
      }
    }
  }
  return UserPreferencesSchema.parse(recovered);
}

export const SavedLocationSchema = LocationSchema.extend({
  id: z.string().min(1).max(80),
  alertsEnabled: z.boolean().default(true),
});

export type SavedLocation = z.infer<typeof SavedLocationSchema>;

export const AlertPrefsSchema = z.object({
  enabled: z.boolean().default(false),
  thresholdAqi: z.number().int().min(50).max(450).default(200),
  sensitiveMode: z.boolean().default(false),
  categoryChangeAlerts: z.boolean().default(true),
  morningBriefingEnabled: z.boolean().default(false),
  morningBriefingTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm 24h format')
    .default('07:30'),
  quietHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm 24h format')
    .default('22:00'),
  quietHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm 24h format')
    .default('06:30'),
  dailyCap: z.number().int().min(1).max(12).default(4),
});

export type AlertPrefs = z.infer<typeof AlertPrefsSchema>;
export const DEFAULT_ALERT_PREFS: AlertPrefs = AlertPrefsSchema.parse({});

export const LastNotifiedEntrySchema = z.object({
  aqi: z.number().int().min(0).max(500),
  category: z.enum(['good', 'satisfactory', 'moderate', 'poor', 'very_poor', 'severe']),
  sentAtIso: z.string(),
  type: z.enum(['threshold', 'category_change', 'recovery', 'morning_briefing']),
});

export const AlertStateSchema = z.object({
  lastNotifiedByLoc: z.record(z.string(), LastNotifiedEntrySchema).default({}),
  dailyCountDate: z.string().default(''),
  dailyCountSent: z.number().int().min(0).default(0),
  lastBriefingDate: z.string().default(''),
});

export type AlertState = z.infer<typeof AlertStateSchema>;
export const DEFAULT_ALERT_STATE: AlertState = AlertStateSchema.parse({});

export const FcmTokenEntrySchema = z.object({
  token: z.string().min(10).max(512),
  platform: z.string().max(60).default('web'),
  updatedAtIso: z.string(),
});

export type FcmTokenEntry = z.infer<typeof FcmTokenEntrySchema>;

export const NotificationItemSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(140),
  body: z.string().min(1).max(400),
  reason: z.string().min(1).max(200),
  severity: z.enum(['info', 'moderate', 'high', 'severe']),
  sourceName: z.string().max(120).optional().default(''),
  dataTimestampIso: z.string().optional().default(''),
  createdAtIso: z.string(),
  read: z.boolean().default(false),
});

export type NotificationItem = z.infer<typeof NotificationItemSchema>;

export const SavedLocationsListSchema = z.array(SavedLocationSchema).max(5);

export function mergeGuestWithAccountData(params: {
  guestProfile: UserProfile;
  guestPreferences: UserPreferences;
  accountProfile: UserProfile;
  accountPreferences: UserPreferences;
  strategy: 'prefer_guest' | 'prefer_account';
}): { profile: UserProfile; preferences: UserPreferences } {
  if (params.strategy === 'prefer_account') {
    return {
      profile: UserProfileSchema.parse(params.accountProfile),
      preferences: migratePreferences(params.accountPreferences),
    };
  }

  // Merge hints & tour progress conservatively while applying guest profile/preferences
  const mergedHints = Array.from(
    new Set([...params.accountPreferences.seenHints, ...params.guestPreferences.seenHints])
  ).slice(-20);

  return {
    profile: UserProfileSchema.parse(params.guestProfile),
    preferences: migratePreferences({
      ...params.accountPreferences,
      ...params.guestPreferences,
      tourCompleted:
        params.accountPreferences.tourCompleted || params.guestPreferences.tourCompleted,
      tourVersion: Math.max(
        params.accountPreferences.tourVersion,
        params.guestPreferences.tourVersion
      ),
      seenHints: mergedHints,
      schemaVersion: 2,
    }),
  };
}



