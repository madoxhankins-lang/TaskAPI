import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import { routes } from './routes';
import { prisma } from './lib/prisma';
import { redis } from './lib/cache';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, HttpError } from './middleware/errors';

export const app = express();
app.disable('x-powered-by');
app.use(requestLogger);
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN, exposedHeaders: ['X-Cache', 'X-Request-Id'] }));
app.use(express.json({ limit: '16kb' }));
app.get('/health', (_req, res) => { res.json({ data: { status: 'ok' } }); });
app.get('/ready', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ data: { database: 'connected', redis: redis.isReady ? 'connected' : 'unavailable' } });
});
app.use(routes);
app.use((_req, _res, next) => next(new HttpError(404, 'Route not found')));
app.use(errorHandler);
