import 'dotenv/config';
import { z } from 'zod';

const environment = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3005),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info')
}).safeParse(process.env);

if (!environment.success) {
  // Only report field names; connection strings and secrets stay private.
  throw new Error('Invalid environment: ' + environment.error.issues.map(i => i.path.join('.')).join(', '));
}
export const config = environment.data;
