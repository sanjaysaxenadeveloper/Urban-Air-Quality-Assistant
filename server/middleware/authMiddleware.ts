import type { NextFunction, Request, Response } from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthenticatedUser;
}

export type VerifyIdTokenFn = (
  token: string
) => Promise<{ uid: string; email?: string; email_verified?: boolean }>;

function resolveFirebaseProjectId(explicitProjectId?: string): string | undefined {
  if (explicitProjectId) return explicitProjectId;
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as { projectId?: string };
      if (parsed.projectId && parsed.projectId !== 'remixed-project-id') {
        return parsed.projectId;
      }
    }
  } catch {
    // Ignore read error and fall back to undefined
  }
  return undefined;
}

export function createFirebaseTokenVerifier(projectId?: string): VerifyIdTokenFn {
  const resolvedProjectId = resolveFirebaseProjectId(projectId);
  return async (token: string) => {
    const app = getApps().length
      ? getApp()
      : initializeApp(resolvedProjectId ? { projectId: resolvedProjectId } : undefined);
    const decoded = await getAuth(app).verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email,
      email_verified: decoded.email_verified,
    };
  };
}

export function createAuthMiddleware(verifyToken: VerifyIdTokenFn) {
  return async function authMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({
        error: 'MISSING_AUTH_TOKEN',
        message: 'Authentication required. Please sign in to access this endpoint.',
      });
      return;
    }

    const parts = authHeader.trim().split(/\s+/);
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || parts[1].length < 10) {
      res.status(401).json({
        error: 'MALFORMED_AUTH_HEADER',
        message: 'Authorization header must be in the format: Bearer <token>.',
      });
      return;
    }

    const token = parts[1];
    try {
      const decoded = await verifyToken(token);
      if (!decoded?.uid) {
        res.status(401).json({
          error: 'INVALID_AUTH_TOKEN',
          message: 'Invalid authentication token.',
        });
        return;
      }
      // Never trust any client-sent uid; always bind exclusively from verified token
      req.authUser = {
        uid: decoded.uid,
        email: decoded.email ?? '',
        emailVerified: Boolean(decoded.email_verified),
      };
      next();
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      const message = err instanceof Error ? err.message : '';
      const isExpired =
        code === 'auth/id-token-expired' || message.toLowerCase().includes('expired');

      res.status(401).json({
        error: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_AUTH_TOKEN',
        message: isExpired
          ? 'Your session has expired. Please sign in again.'
          : 'Authentication token is invalid or revoked.',
      });
    }
  };
}
