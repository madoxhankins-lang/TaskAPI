import { randomUUID } from 'node:crypto';
import { RequestHandler } from 'express';
import { logger } from '../lib/logger';

export const requestLogger: RequestHandler = (req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  const start = performance.now();
  res.on('finish', () => logger.info('HTTP request', {
    requestId: req.requestId, method: req.method, path: req.path,
    status: res.statusCode, durationMs: Math.round(performance.now() - start)
  }));
  // Never log request bodies or Authorization headers.
  next();
};
