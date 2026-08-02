import { NextFunction, Request, Response } from 'express';
import { AppError, ApiErrorShape } from '../types';
import logger from '../utils/logger';

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiErrorShape = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  };
  res.status(404).json(body);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const reqId = (req as unknown as { id?: string }).id;
  const ctx = { reqId, method: req.method, url: req.originalUrl };

  if (err instanceof AppError) {
    logger.warn(
      `AppError [${err.code}] ${err.message} | ${JSON.stringify(ctx)}${
        err.details ? ` | details=${JSON.stringify(err.details)}` : ''
      }`
    );
    const body: ApiErrorShape = {
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  logger.error(
    `Unhandled error ${err.name}: ${err.message} | ${JSON.stringify(ctx)}\n${err.stack}`
  );

  const body: ApiErrorShape = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred.',
      details: process.env.NODE_ENV === 'production'
        ? { name: err.name, reqId }
        : { name: err.name, stack: err.stack, reqId },
    },
  };
  res.status(500).json(body);
}
