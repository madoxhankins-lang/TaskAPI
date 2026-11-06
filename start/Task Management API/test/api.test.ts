import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { app } from '../src/app';
import { config } from '../src/config';
import { prisma } from '../src/lib/prisma';
import { taskCache } from '../src/lib/cache';

jest.mock('../src/lib/prisma', () => ({ prisma: {
  user: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
  task: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
  $queryRaw: jest.fn()
} }));
jest.mock('../src/lib/cache', () => ({ redis: { isReady: true }, taskCache: {
  version: jest.fn(), get: jest.fn(), set: jest.fn(), invalidate: jest.fn()
} }));
jest.mock('bcryptjs', () => ({ __esModule: true, default: { hashSync: jest.fn(() => 'dummy'), hash: jest.fn(), compare: jest.fn() } }));
const db = prisma as unknown as { user: Record<string, jest.Mock>; task: Record<string, jest.Mock>; $queryRaw: jest.Mock };
const cache = taskCache as jest.Mocked<typeof taskCache>;
const ownerId = '11111111-1111-4111-8111-111111111111';
const taskId = '22222222-2222-4222-8222-222222222222';
const user = { id: ownerId, email: 'student@example.com', role: 'USER' };
const task = { id: taskId, ownerId, title: 'Finish assignment', description: '', status: 'TODO' };
const credentials = { email: 'student@example.com', password: 'Student-password-123' };
const token = (options: jwt.SignOptions = {}) => jwt.sign({}, config.JWT_SECRET, { subject: ownerId, issuer: 'task-api', audience: 'task-api-client', expiresIn: '15m', ...options });
const auth = () => 'Bearer ' + token();
beforeEach(() => {
  jest.resetAllMocks();
  db.user.findUnique.mockResolvedValue(user);
  cache.version.mockResolvedValue('v1'); cache.get.mockResolvedValue(null);
  cache.set.mockResolvedValue(); cache.invalidate.mockResolvedValue();
});

describe('HTTP plumbing and authentication', () => {
  test('health responds with security headers and request ID', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.headers['x-request-id']).toBeDefined(); expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
  test('ready checks the database', async () => { await request(app).get('/ready').expect(200); expect(db.$queryRaw).toHaveBeenCalled(); });
  test('unknown routes return JSON 404', async () => { const res = await request(app).get('/missing').expect(404); expect(res.body.error.message).toBe('Route not found'); });
  test('malformed JSON returns 400', async () => { await request(app).post('/auth/login').set('Content-Type', 'application/json').send('{').expect(400); });
  test('register hashes the password and forces USER', async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password'); db.user.create.mockResolvedValue(user);
    const res = await request(app).post('/auth/register').send(credentials).expect(201);
    expect(bcrypt.hash).toHaveBeenCalledWith(credentials.password, 12);
    expect(db.user.create.mock.calls[0][0].data).toEqual({ email: credentials.email, passwordHash: 'hashed-password', role: 'USER' });
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });
  test('registration cannot choose ADMIN', async () => { await request(app).post('/auth/register').send({ ...credentials, role: 'ADMIN' }).expect(400); expect(db.user.create).not.toHaveBeenCalled(); });
  test('short password fails validation', async () => { await request(app).post('/auth/register').send({ ...credentials, password: 'short' }).expect(400); });
  test('duplicate email returns 409', async () => {
    db.user.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }));
    await request(app).post('/auth/register').send(credentials).expect(409);
  });
  test('login returns a verifiable 15-minute token', async () => {
    db.user.findUnique.mockResolvedValue({ ...user, passwordHash: 'hash' }); (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const res = await request(app).post('/auth/login').send(credentials).expect(200);
    const decoded = jwt.verify(res.body.data.accessToken, config.JWT_SECRET) as jwt.JwtPayload;
    expect(decoded.sub).toBe(ownerId); expect(decoded.exp! - decoded.iat!).toBe(900);
  });
  test('wrong password returns 401', async () => { (bcrypt.compare as jest.Mock).mockResolvedValue(false); await request(app).post('/auth/login').send(credentials).expect(401); });
  test('unknown account returns same login error', async () => { db.user.findUnique.mockResolvedValue(null); await request(app).post('/auth/login').send(credentials).expect(401); expect(bcrypt.compare).toHaveBeenCalled(); });
  test.each(['/me', '/tasks', '/admin/users'])('%s requires a token', async route => { await request(app).get(route).expect(401); });
  test('invalid token returns 401', async () => { await request(app).get('/me').set('Authorization', 'Bearer invalid').expect(401); });
  test('expired token returns 401', async () => { await request(app).get('/me').set('Authorization', 'Bearer ' + token({ expiresIn: -1 })).expect(401); });
  test('deleted account cannot use an old token', async () => { db.user.findUnique.mockResolvedValue(null); await request(app).get('/me').set('Authorization', auth()).expect(401); });
  test('database failure is not disguised as invalid credentials', async () => { db.user.findUnique.mockRejectedValue(new Error('private database details')); const res = await request(app).get('/me').set('Authorization', auth()).expect(500); expect(JSON.stringify(res.body)).not.toContain('private database'); });
  test('profile excludes password hash', async () => { const res = await request(app).get('/me').set('Authorization', auth()).expect(200); expect(res.body.data.user).toEqual(user); });
  test('USER cannot list users', async () => { await request(app).get('/admin/users').set('Authorization', auth()).expect(403); expect(db.user.findMany).not.toHaveBeenCalled(); });
  test('ADMIN can list users with safe projection', async () => { db.user.findUnique.mockResolvedValue({ ...user, role: 'ADMIN' }); db.user.findMany.mockResolvedValue([user]); await request(app).get('/admin/users').set('Authorization', auth()).expect(200); expect(db.user.findMany.mock.calls[0][0].select.passwordHash).toBeUndefined(); });
});

describe('task controllers and cache integration', () => {
  test('cache miss queries only the current owner and saves the result', async () => {
    db.task.findMany.mockResolvedValue([task]); db.task.count.mockResolvedValue(1);
    const res = await request(app).get('/tasks').set('Authorization', auth()).expect(200);
    expect(res.headers['x-cache']).toBe('MISS'); expect(db.task.findMany.mock.calls[0][0].where).toEqual({ ownerId });
    expect(cache.set).toHaveBeenCalledWith(expect.stringContaining(ownerId + ':v1'), res.body);
  });
  test('cache hit avoids database task queries', async () => {
    const body = { data: { tasks: [task], pagination: { page: 1, limit: 20, total: 1 } } }; cache.get.mockResolvedValue(body);
    const res = await request(app).get('/tasks').set('Authorization', auth()).expect(200);
    expect(res.headers['x-cache']).toBe('HIT'); expect(res.body).toEqual(body); expect(db.task.findMany).not.toHaveBeenCalled(); expect(db.task.count).not.toHaveBeenCalled();
  });
  test('Redis outage bypasses the cache', async () => { cache.version.mockResolvedValue(null); db.task.findMany.mockResolvedValue([]); db.task.count.mockResolvedValue(0); const res = await request(app).get('/tasks').set('Authorization', auth()).expect(200); expect(res.headers['x-cache']).toBe('BYPASS'); expect(cache.get).not.toHaveBeenCalled(); });
  test('pagination uses separate cache keys and database offsets', async () => { db.task.findMany.mockResolvedValue([]); db.task.count.mockResolvedValue(0); await request(app).get('/tasks?page=2&limit=5').set('Authorization', auth()).expect(200); expect(cache.get).toHaveBeenCalledWith(expect.stringContaining(':2:5')); expect(db.task.findMany.mock.calls[0][0]).toMatchObject({ skip: 5, take: 5 }); });
  test('invalid pagination is rejected', async () => { await request(app).get('/tasks?page=0').set('Authorization', auth()).expect(400); });
  test('create gets owner from the token and invalidates lists', async () => { db.task.create.mockResolvedValue(task); await request(app).post('/tasks').set('Authorization', auth()).send({ title: task.title }).expect(201); expect(db.task.create.mock.calls[0][0].data.ownerId).toBe(ownerId); expect(cache.invalidate).toHaveBeenCalledWith(ownerId); });
  test('client cannot change owner', async () => { await request(app).post('/tasks').set('Authorization', auth()).send({ title: 'test', ownerId: taskId }).expect(400); expect(db.task.create).not.toHaveBeenCalled(); });
  test.each([{ title: ' ' }, { title: 'test', status: 'INVALID' }])('invalid task is rejected: %j', async body => { await request(app).post('/tasks').set('Authorization', auth()).send(body).expect(400); });
  test('read includes owner in database condition', async () => { db.task.findFirst.mockResolvedValue(task); await request(app).get('/tasks/' + taskId).set('Authorization', auth()).expect(200); expect(db.task.findFirst).toHaveBeenCalledWith({ where: { id: taskId, ownerId } }); });
  test('missing or another owner task returns 404', async () => { db.task.findFirst.mockResolvedValue(null); await request(app).get('/tasks/' + taskId).set('Authorization', auth()).expect(404); });
  test('invalid task ID returns 400', async () => { await request(app).get('/tasks/not-an-id').set('Authorization', auth()).expect(400); });
  test('update atomically checks ownership and invalidates lists', async () => { db.task.update.mockResolvedValue({ ...task, status: 'DONE' }); await request(app).put('/tasks/' + taskId).set('Authorization', auth()).send({ status: 'DONE' }).expect(200); expect(db.task.update).toHaveBeenCalledWith({ where: { id: taskId, ownerId }, data: { status: 'DONE' } }); expect(cache.invalidate).toHaveBeenCalledWith(ownerId); });
  test('empty update returns 400', async () => { await request(app).put('/tasks/' + taskId).set('Authorization', auth()).send({}).expect(400); });
  test('delete atomically checks owner, invalidates, and returns empty 204', async () => { db.task.delete.mockResolvedValue(task); const res = await request(app).delete('/tasks/' + taskId).set('Authorization', auth()).expect(204); expect(res.text).toBe(''); expect(db.task.delete).toHaveBeenCalledWith({ where: { id: taskId, ownerId } }); expect(cache.invalidate).toHaveBeenCalledWith(ownerId); });
  test('missing update returns 404', async () => { db.task.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('missing', { code: 'P2025', clientVersion: '6.19.3' })); await request(app).put('/tasks/' + taskId).set('Authorization', auth()).send({ status: 'DONE' }).expect(404); });
  test('failed mutation does not invalidate cache', async () => { db.task.create.mockRejectedValue(new Error('database failed')); await request(app).post('/tasks').set('Authorization', auth()).send({ title: 'test' }).expect(500); expect(cache.invalidate).not.toHaveBeenCalled(); });
});
