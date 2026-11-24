import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { loadConfig, type ServerConfig } from './config.ts';
import {
  createAuthMiddleware,
  createFirebaseTokenVerifier,
  type VerifyIdTokenFn,
} from './middleware/authMiddleware.ts';
import { createInternalAuthMiddleware } from './middleware/internalAuth.ts';
import { createAirRouter } from './routes/air.ts';
import { createAssistantRouter } from './routes/assistant.ts';
import { createInternalRouter } from './routes/internal.ts';
import { createUserRouter } from './routes/user.ts';
import { AirService } from './services/airService.ts';
import type { FetchLike } from './services/dataProviders.ts';
import { GeminiEngine } from './services/geminiEngine.ts';
import {
  FirebaseFcmDispatcher,
  type NotificationDispatcher,
} from './services/notificationService.ts';
import { InMemoryUsersRepo, type UsersRepository } from './services/usersRepo.ts';

export interface CreateAppOptions {
  config?: ServerConfig;
  airService?: AirService;
  geminiEngine?: GeminiEngine;
  usersRepo?: UsersRepository;
  verifyIdTokenFn?: VerifyIdTokenFn;
  notificationDispatcher?: NotificationDispatcher;
  fetchFn?: FetchLike;
  nowFn?: () => Date;
  disableRateLimit?: boolean;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const config = options.config ?? loadConfig();
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        const allowed =
          config.corsAllowedOrigins.includes('*') ||
          config.corsAllowedOrigins.includes(origin) ||
          origin.endsWith('.run.app') ||
          origin.startsWith('http://localhost:');
        callback(null, allowed);
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '64kb' }));

  if (!options.disableRateLimit) {
    app.use(
      '/api',
      rateLimit({
        windowMs: 60 * 1000,
        limit: 90,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: {
          error: 'RATE_LIMITED',
          message: 'Too many requests. Please pause for a moment and try again.',
        },
      })
    );
  }

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'urban-air-quality-assistant',
      timestamp: new Date().toISOString(),
    });
  });

  const airService =
    options.airService ??
    new AirService({
      config,
      fetchFn: options.fetchFn,
    });

  const geminiEngine =
    options.geminiEngine ??
    new GeminiEngine({
      apiKey: config.geminiApiKey,
      model: config.geminiModel,
    });

  const usersRepo = options.usersRepo ?? new InMemoryUsersRepo();
  const authMiddleware = createAuthMiddleware(
    options.verifyIdTokenFn ?? createFirebaseTokenVerifier(config.firebaseProjectId || undefined)
  );
  const notificationDispatcher =
    options.notificationDispatcher ??
    new FirebaseFcmDispatcher(config.firebaseProjectId || undefined);
  const internalAuthMiddleware = createInternalAuthMiddleware(config.schedulerSecret);

  app.use(
    '/api',
    createAirRouter({
      airService,
      timeoutMs: config.providerTimeoutMs,
      fetchFn: options.fetchFn,
    })
  );

  app.use(
    '/api',
    createAssistantRouter({
      airService,
      geminiEngine,
      modelName: config.geminiModel,
    })
  );

  app.use(
    '/api/user',
    createUserRouter({
      usersRepo,
      authMiddleware,
      notificationDispatcher,
    })
  );

  app.use(
    '/internal',
    createInternalRouter({
      usersRepo,
      airService,
      geminiEngine,
      notificationDispatcher,
      internalAuthMiddleware,
      nowFn: options.nowFn,
    })
  );

  return app;
}
