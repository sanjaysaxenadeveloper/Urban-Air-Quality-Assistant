import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

function timingSafeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf-8');
  const bBuf = Buffer.from(b, 'utf-8');
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function createInternalAuthMiddleware(schedulerSecret: string) {
  return function internalAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!schedulerSecret) {
      res.status(503).json({
        error: 'SCHEDULER_NOT_CONFIGURED',
        message: 'Internal alert scheduler secret is not configured on this server.',
      });
      return;
    }

    const headerSecret = req.header('x-scheduler-secret')?.trim();
    const authHeader = req.header('authorization')?.trim();
    const bearerSecret =
      authHeader && authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : undefined;

    const candidate = headerSecret || bearerSecret;
    if (!candidate || !timingSafeEquals(candidate, schedulerSecret)) {
      res.status(401).json({
        error: 'UNAUTHORIZED_SCHEDULER',
        message: 'Missing or invalid scheduler credentials.',
      });
      return;
    }

    next();
  };
}
