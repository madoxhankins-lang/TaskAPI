import { app } from './app';
import { config } from './config';
import { prisma } from './lib/prisma';
import { redis } from './lib/cache';
import { logger } from './lib/logger';

async function start() {
  await prisma.$connect();
  // PostgreSQL is required; Redis can reconnect while requests bypass caching.
  void redis.connect().catch(() => logger.warn('Redis initial connection failed'));
  const server = app.listen(config.PORT, '0.0.0.0', () => logger.info('Task API listening', { port: config.PORT }));
  const shutdown = () => {
    server.close(() => {
      void Promise.all([prisma.$disconnect(), redis.quit()]).finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
start().catch(async error => {
  logger.error('Startup failed', { errorType: error.name });
  await prisma.$disconnect();
  if (redis.isOpen) await redis.disconnect();
  process.exit(1);
});
