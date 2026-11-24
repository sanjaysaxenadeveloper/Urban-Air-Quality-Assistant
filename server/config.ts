import { AIR_CACHE_TTL_MS } from '../shared/constants.ts';

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  appUrl: string;
  corsAllowedOrigins: string[];
  geminiApiKey: string;
  geminiModel: string;
  openAqApiKey: string;
  dataGovInApiKey: string;
  waqiApiToken: string;
  airCacheTtlMs: number;
  providerTimeoutMs: number;
  schedulerSecret: string;
  firebaseProjectId: string;
  firebaseDatabaseId: string;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';

const VALID_GEMINI_MODEL_PATTERN = /^(?:models\/)?gemini-[a-z0-9][a-z0-9._-]{1,70}$/i;
const DEPRECATED_GEMINI_MODEL_PATTERN = /^(?:models\/)?(?:gemini-1\.5-|gemini-2\.0-|gemini-pro$)/i;

export function resolveGeminiModel(raw: string | undefined): string {
  if (!raw) return DEFAULT_GEMINI_MODEL;
  const cleaned = raw.trim().replace(/^["']|["']$/g, '').trim();
  if (
    !cleaned ||
    !VALID_GEMINI_MODEL_PATTERN.test(cleaned) ||
    DEPRECATED_GEMINI_MODEL_PATTERN.test(cleaned)
  ) {
    console.warn(
      `[config] Ignoring invalid GEMINI_MODEL value; falling back to default model "${DEFAULT_GEMINI_MODEL}".`
    );
    return DEFAULT_GEMINI_MODEL;
  }
  return cleaned.replace(/^models\//i, '');
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const rawOrigins = env.CORS_ALLOWED_ORIGINS ?? env.APP_URL ?? 'http://localhost:3000';
  const corsAllowedOrigins = rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    port: parsePositiveInt(env.PORT, 3000),
    nodeEnv: env.NODE_ENV ?? 'development',
    appUrl: env.APP_URL ?? 'http://localhost:3000',
    corsAllowedOrigins,
    geminiApiKey: env.GEMINI_API_KEY ?? '',
    geminiModel: resolveGeminiModel(env.GEMINI_MODEL),
    openAqApiKey: env.OPENAQ_API_KEY?.trim() ?? '',
    dataGovInApiKey: env.DATA_GOV_IN_API_KEY?.trim() ?? '',
    waqiApiToken: env.WAQI_API_TOKEN?.trim() ?? '',
    airCacheTtlMs: parsePositiveInt(env.AIR_CACHE_TTL_MS, AIR_CACHE_TTL_MS),
    providerTimeoutMs: parsePositiveInt(env.PROVIDER_TIMEOUT_MS, 6000),
    schedulerSecret: env.SCHEDULER_SECRET?.trim() ?? '',
    firebaseProjectId: env.FIREBASE_PROJECT_ID?.trim() ?? '',
    firebaseDatabaseId: env.FIREBASE_DATABASE_ID?.trim() ?? '',
  };
}
