import { RequestHandler } from 'express';
import { prisma } from '../lib/prisma';
import { publicUser } from './authController';
import { taskQuerySchema } from '../validation';

export const listUsers: RequestHandler = async (req, res) => {
  const { page, limit } = taskQuerySchema.parse(req.query);
  const users = await prisma.user.findMany({ select: publicUser, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit });
  res.json({ data: { users } });
};
