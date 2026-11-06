import { z } from 'zod';

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password must fit in 72 bytes')
}).strict();

const taskFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE'])
};
export const createTaskSchema = z.object({
  title: taskFields.title,
  description: taskFields.description.default(''),
  status: taskFields.status.default('TODO')
}).strict();
export const updateTaskSchema = z.object(taskFields).partial().strict()
  .refine(body => Object.keys(body).length > 0, 'Provide at least one task field');
export const taskIdSchema = z.string().uuid();
export const taskQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
}).strict();
