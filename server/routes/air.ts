import { Router, type Request, type Response } from 'express';
import {
  AirQuerySchema,
  GeocodeQuerySchema,
  ReverseGeocodeQuerySchema,
} from '../../shared/schemas.ts';
import { AirDataUnavailableError, type AirService } from '../services/airService.ts';
import {
  reverseGeocodeIndia,
  searchIndianLocations,
  type FetchLike,
} from '../services/dataProviders.ts';

export interface AirRouterDeps {
  airService: AirService;
  timeoutMs: number;
  fetchFn?: FetchLike;
}

export function createAirRouter(deps: AirRouterDeps): Router {
  const router = Router();

  router.get('/air', async (req: Request, res: Response) => {
    const parsed = AirQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: 'INVALID_LOCATION_QUERY',
        message: 'Provide valid latitude and longitude coordinates within India.',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }

    try {
      const snapshot = await deps.airService.getLiveAirSnapshot({
        lat: parsed.data.lat,
        lon: parsed.data.lon,
        city: parsed.data.city,
        state: parsed.data.state,
        bypassCache: parsed.data.refresh,
      });
      res.json(snapshot);
    } catch (err) {
      if (err instanceof AirDataUnavailableError) {
        res.status(503).json({
          error: 'AIR_DATA_UNAVAILABLE',
          message: err.message,
          attemptedProviders: err.attemptedProviders,
        });
        return;
      }
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Unexpected error while retrieving live air data.',
      });
    }
  });

  router.get('/geocode', async (req: Request, res: Response) => {
    const parsed = GeocodeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: 'INVALID_SEARCH_QUERY',
        message: parsed.error.issues[0]?.message ?? 'Invalid search query.',
      });
      return;
    }

    try {
      const results = await searchIndianLocations(parsed.data.q, {
        fetchFn: deps.fetchFn,
        timeoutMs: deps.timeoutMs,
      });
      res.json({ results });
    } catch {
      res.status(503).json({
        error: 'GEOCODE_UNAVAILABLE',
        message: 'Location search is temporarily unavailable. Try a quick-pick city or retry.',
      });
    }
  });

  router.get('/reverse-geocode', async (req: Request, res: Response) => {
    const parsed = ReverseGeocodeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: 'OUTSIDE_INDIA_OR_INVALID',
        message: 'Detected coordinates are invalid or outside India. Please search for an Indian city.',
      });
      return;
    }

    const location = await reverseGeocodeIndia(parsed.data.lat, parsed.data.lon, {
      fetchFn: deps.fetchFn,
      timeoutMs: deps.timeoutMs,
    });
    res.json({ location });
  });

  return router;
}
