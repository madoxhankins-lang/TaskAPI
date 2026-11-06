import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { HttpError } from './errors';

export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.get('Authorization');
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Bearer token required');
  let userId: string;
  try {
    const payload = jwt.verify(header.slice(7), config.JWT_SECRET, {
      algorithms: ['HS256'], issuer: 'task-api', audience: 'task-api-client'
    });
    if (typeof payload === 'string' || typeof payload.sub !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub)) {
      throw new Error('Invalid subject');
    }
    userId = payload.sub;
  } catch { throw new HttpError(401, 'Invalid or expired token'); }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true } });
  if (!user) throw new HttpError(401, 'Account no longer exists');
  req.user = user;
  next();
};

export const requireRole = (role: Role): RequestHandler => (req, _res, next) => {
  if (!req.user) throw new HttpError(401, 'Authentication required');
  if (req.user.role !== role) throw new HttpError(403, 'Admin access required');
  next();
};
