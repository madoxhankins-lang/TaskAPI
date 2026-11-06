import { RequestHandler } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { credentialsSchema } from '../validation';
import { HttpError } from '../middleware/errors';

export const publicUser = { id: true, email: true, role: true, createdAt: true } as const;
const dummyHash = bcrypt.hashSync('not-a-real-account-password', 12);

export const register: RequestHandler = async (req, res) => {
  const { email, password } = credentialsSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { email, passwordHash, role: 'USER' }, select: publicUser });
  res.status(201).json({ data: { user } });
};

export const login: RequestHandler = async (req, res) => {
  const { email, password } = credentialsSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
  if (!user || !valid) throw new HttpError(401, 'Invalid email or password');
  const accessToken = jwt.sign({}, config.JWT_SECRET, {
    algorithm: 'HS256', subject: user.id, expiresIn: '15m', issuer: 'task-api', audience: 'task-api-client'
  });
  res.json({ data: { accessToken, tokenType: 'Bearer', expiresIn: 900 } });
};

export const profile: RequestHandler = (req, res) => { res.json({ data: { user: req.user } }); };
