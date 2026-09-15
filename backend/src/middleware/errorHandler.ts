import type { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { AppError } from "../errors/AppError";
import { logger } from "../utils/logger";

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function notFoundHandler(_req: Request, res: Response) {
  const body: ErrorResponseBody = { error: { code: "NOT_FOUND", message: "Not found" } };
  res.status(404).json(body);
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    const body: ErrorResponseBody = {
      error: { code: err.code, message: err.message, details: err.details },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof MulterError) {
    const body: ErrorResponseBody = { error: { code: "BAD_REQUEST", message: err.message } };
    res.status(400).json(body);
    return;
  }

  logger.error({ err, requestId: req.id }, "Unhandled error");
  const body: ErrorResponseBody = {
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  };
  res.status(500).json(body);
}
