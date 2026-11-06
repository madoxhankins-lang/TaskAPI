import { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  let status = 500;
  let message = 'Internal server error';
  let details: unknown;
  if (error instanceof HttpError) { status = error.status; message = error.message; }
  else if (error instanceof ZodError) {
    status = 400; message = 'Invalid input';
    details = error.issues.map(i => ({ field: i.path.join('.'), message: i.message }));
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') { status = 409; message = 'Email already registered'; }
    if (error.code === 'P2025') { status = 404; message = 'Task not found'; }
  } else if (error?.type === 'entity.parse.failed') { status = 400; message = 'Malformed JSON'; }
  else if (error?.type === 'entity.too.large') { status = 413; message = 'Request body too large'; }
  if (status >= 500) logger.error('Request failed', { requestId: req.requestId, errorType: error?.name });
  res.status(status).json({ error: { message, ...(details ? { details } : {}) }, requestId: req.requestId });
};
