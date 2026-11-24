import type {
  AdviceStylePrefs,
  AirQualitySnapshot,
  ChatReply,
  DecisionPlan,
  IndianLocation,
  UserProfile,
} from '../../shared/schemas.ts';

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
  }
}

async function requestJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 35_000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiClientError(
        data.error || 'REQUEST_FAILED',
        data.message || `Request failed (${res.status})`,
        res.status
      );
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiClientError('TIMEOUT', 'The request took too long. Please try again.', 504);
    }
    throw new ApiClientError(
      'NETWORK_ERROR',
      err instanceof Error ? err.message : 'Unable to reach the server.',
      0
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function searchLocationsApi(query: string): Promise<IndianLocation[]> {
  const data = await requestJson<{ results: IndianLocation[] }>(
    `/api/geocode?q=${encodeURIComponent(query)}`,
    { method: 'GET' },
    10_000
  );
  return data.results;
}

export async function reverseGeocodeApi(lat: number, lon: number): Promise<IndianLocation> {
  const data = await requestJson<{ location: IndianLocation }>(
    `/api/reverse-geocode?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
    { method: 'GET' },
    10_000
  );
  return data.location;
}

export async function fetchLiveAirApi(
  location: IndianLocation,
  refresh = false
): Promise<AirQualitySnapshot> {
  const params = new URLSearchParams({
    lat: String(location.lat),
    lon: String(location.lon),
    city: location.name,
    state: location.state ?? '',
    ...(refresh ? { refresh: 'true' } : {}),
  });
  return requestJson<AirQualitySnapshot>(`/api/air?${params.toString()}`, { method: 'GET' }, 15_000);
}

export async function generatePlanApi(payload: {
  location: IndianLocation;
  profile: UserProfile;
  advicePrefs?: Partial<AdviceStylePrefs>;
}): Promise<{ airSnapshot: AirQualitySnapshot; plan: DecisionPlan; modelUsed: string }> {
  return requestJson(
    '/api/plan',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    60_000
  );
}

export async function sendChatQuestionApi(payload: {
  location: IndianLocation;
  profile: UserProfile;
  advicePrefs?: Partial<AdviceStylePrefs>;
  question: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<{ airSnapshot: AirQualitySnapshot; reply: ChatReply }> {
  return requestJson(
    '/api/chat',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    45_000
  );
}
