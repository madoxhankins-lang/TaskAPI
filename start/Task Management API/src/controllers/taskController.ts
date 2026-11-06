import { RequestHandler } from 'express';
import { prisma } from '../lib/prisma';
import { taskCache } from '../lib/cache';
import { createTaskSchema, updateTaskSchema, taskIdSchema, taskQuerySchema } from '../validation';
import { HttpError } from '../middleware/errors';

export const listTasks: RequestHandler = async (req, res) => {
  const ownerId = req.user!.id;
  const { page, limit } = taskQuerySchema.parse(req.query);
  const version = await taskCache.version(ownerId);
  const key = version ? 'tasks:' + ownerId + ':' + version + ':' + page + ':' + limit : null;
  const cached = key ? await taskCache.get(key) : null;
  if (cached !== null) { res.setHeader('X-Cache', 'HIT'); res.json(cached); return; }
  const [tasks, total] = await Promise.all([
    prisma.task.findMany({ where: { ownerId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
    prisma.task.count({ where: { ownerId } })
  ]);
  const response = { data: { tasks, pagination: { page, limit, total } } };
  if (key) await taskCache.set(key, response);
  res.setHeader('X-Cache', key ? 'MISS' : 'BYPASS');
  res.json(response);
};

export const getTask: RequestHandler = async (req, res) => {
  const id = taskIdSchema.parse(req.params.id);
  const task = await prisma.task.findFirst({ where: { id, ownerId: req.user!.id } });
  if (!task) throw new HttpError(404, 'Task not found');
  res.json({ data: { task } });
};

export const createTask: RequestHandler = async (req, res) => {
  const data = createTaskSchema.parse(req.body);
  const ownerId = req.user!.id;
  const task = await prisma.task.create({ data: { ...data, ownerId } });
  await taskCache.invalidate(ownerId);
  res.status(201).json({ data: { task } });
};

export const updateTask: RequestHandler = async (req, res) => {
  const id = taskIdSchema.parse(req.params.id);
  const data = updateTaskSchema.parse(req.body);
  // The ownership condition is part of the UPDATE, not a separate check.
  const task = await prisma.task.update({ where: { id, ownerId: req.user!.id }, data });
  await taskCache.invalidate(req.user!.id);
  res.json({ data: { task } });
};

export const deleteTask: RequestHandler = async (req, res) => {
  const id = taskIdSchema.parse(req.params.id);
  await prisma.task.delete({ where: { id, ownerId: req.user!.id } });
  await taskCache.invalidate(req.user!.id);
  res.status(204).send();
};
