import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";
import type { AuthTokenPayload } from "../services/auth.service";
import { verifyToken } from "../services/auth.service";
import type { UserRole } from "../db/users.repo";

export const AUTH_COOKIE_NAME = "rubric_token";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
  if (!token) {
    next(new AppError(401, "UNAUTHENTICATED", "Authentication required"));
    return;
  }

  try {
    req.auth = verifyToken(token);
    next();
  } catch {
    next(new AppError(401, "UNAUTHENTICATED", "Invalid or expired session"));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(new AppError(401, "UNAUTHENTICATED", "Authentication required"));
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(new AppError(403, "FORBIDDEN", "You do not have access to this resource"));
      return;
    }
    next();
  };
}
