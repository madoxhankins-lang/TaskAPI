import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticate, requireRole } from './middleware/auth';
import { register, login, profile } from './controllers/authController';
import { listTasks, getTask, createTask, updateTask, deleteTask } from './controllers/taskController';
import { listUsers } from './controllers/adminController';

export const routes = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: { message: 'Too many authentication attempts; try again later' } } });
routes.post('/auth/register', authLimiter, register);
routes.post('/auth/login', authLimiter, login);
routes.get('/me', authenticate, profile);

const tasks = Router();
tasks.use(authenticate);
tasks.get('/', listTasks);
tasks.post('/', createTask);
tasks.get('/:id', getTask);
tasks.put('/:id', updateTask);
tasks.delete('/:id', deleteTask);
routes.use('/tasks', tasks);
routes.get('/admin/users', authenticate, requireRole('ADMIN'), listUsers);
