import { Router, type Request, type Response } from 'express';
import { ChatRequestSchema, PlanRequestSchema } from '../../shared/schemas.ts';
import { AirDataUnavailableError, type AirService } from '../services/airService.ts';
import { GeminiEngineError, type GeminiEngine } from '../services/geminiEngine.ts';

export interface AssistantRouterDeps {
  airService: AirService;
  geminiEngine: GeminiEngine;
  modelName: string;
}

export function createAssistantRouter(deps: AssistantRouterDeps): Router {
  const router = Router();

  router.post('/plan', async (req: Request, res: Response) => {
    const parsed = PlanRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'INVALID_PLAN_REQUEST',
        message: 'Provide a valid Indian location and household profile.',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }

    try {
      // Always ground Gemini in live server-fetched air data (reusing 12-min cache)
      const airSnapshot = await deps.airService.getLiveAirSnapshot({
        lat: parsed.data.location.lat,
        lon: parsed.data.location.lon,
        city: parsed.data.location.name,
        state: parsed.data.location.state,
      });

      const plan = await deps.geminiEngine.generateDecisionPlan({
        airSnapshot,
        profile: parsed.data.profile,
        advicePrefs: parsed.data.advicePrefs,
      });

      res.json({
        airSnapshot,
        plan,
        modelUsed: deps.modelName,
      });
    } catch (err) {
      if (err instanceof AirDataUnavailableError) {
        res.status(503).json({
          error: 'AIR_DATA_UNAVAILABLE',
          message: err.message,
          attemptedProviders: err.attemptedProviders,
        });
        return;
      }
      if (err instanceof GeminiEngineError) {
        res.status(err.statusCode).json({
          error: err.code,
          message: err.message,
        });
        return;
      }
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Unexpected error while generating personalized plan.',
      });
    }
  });

  router.post('/chat', async (req: Request, res: Response) => {
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'INVALID_CHAT_REQUEST',
        /* v8 ignore next */
        message: parsed.error.issues[0]?.message ?? 'Provide a valid question, location, and profile.',
      });
      return;
    }

    try {
      const airSnapshot = await deps.airService.getLiveAirSnapshot({
        lat: parsed.data.location.lat,
        lon: parsed.data.location.lon,
        city: parsed.data.location.name,
        state: parsed.data.location.state,
      });

      const reply = await deps.geminiEngine.answerQuestion({
        airSnapshot,
        profile: parsed.data.profile,
        advicePrefs: parsed.data.advicePrefs,
        question: parsed.data.question,
        history: parsed.data.history,
      });

      res.json({
        airSnapshot,
        reply,
      });
    } catch (err) {
      if (err instanceof AirDataUnavailableError) {
        res.status(503).json({
          error: 'AIR_DATA_UNAVAILABLE',
          message: err.message,
        });
        return;
      }
      if (err instanceof GeminiEngineError) {
        res.status(err.statusCode).json({
          error: err.code,
          message: err.message,
        });
        return;
      }
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Unexpected error while answering your question.',
      });
    }
  });

  return router;
}
