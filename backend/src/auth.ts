import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Pool } from 'pg';

export const DEFAULT_DEV_USER_ID = '00000000-0000-4000-8000-000000000001';

export type CurrentUser = {
  id: string;
  status: 'ACTIVE';
};

declare global {
  namespace Express {
    interface Request {
      user?: CurrentUser;
    }
  }
}

type UserLookup = Pick<Pool, 'query'>;

export function developmentAuthentication(
  database: UserLookup,
  configuredUserId = process.env.DEV_USER_ID ?? DEFAULT_DEV_USER_ID,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await database.query<{ id: string; status: 'ACTIVE' | 'DISABLED' }>(
        'SELECT id, status FROM public.users WHERE id = $1',
        [configuredUserId],
      );
      const user = result.rows[0];
      if (!user) {
        res.status(401).json({ error: 'Development identity is not configured.', code: 'unauthenticated' });
        return;
      }
      if (user.status !== 'ACTIVE') {
        res.status(403).json({ error: 'This user is disabled.', code: 'user_disabled' });
        return;
      }
      req.user = { id: user.id, status: 'ACTIVE' };
      next();
    } catch {
      console.error('Current-user resolution failed.');
      res.status(500).json({ error: 'Could not resolve the current user.' });
    }
  };
}

export function currentUser(req: Request): CurrentUser {
  if (!req.user) throw new Error('Authentication middleware is required.');
  return req.user;
}

const ownershipFields = new Set(['ownerId', 'owner_id', 'userId', 'user_id']);

function forbiddenOwnershipField(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = forbiddenOwnershipField(item);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (ownershipFields.has(key)) return key;
    const found = forbiddenOwnershipField(child);
    if (found) return found;
  }
  return null;
}

export function rejectClientOwnership(req: Request, res: Response, next: NextFunction): void {
  const forbidden = forbiddenOwnershipField(req.body);
  if (forbidden) {
    res.status(400).json({ error: `Client ownership field '${forbidden}' is not allowed.`, code: 'owner_not_allowed' });
    return;
  }
  next();
}
