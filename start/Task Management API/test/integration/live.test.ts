import request from 'supertest';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { app } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { redis } from '../../src/lib/cache';

const prefix = 'jest-' + randomUUID();
const password = 'Integration-password-123';
const emails = [prefix + '@example.com', prefix + '-other@example.com', prefix + '-admin@example.com'];
let token: string; let otherToken: string; let adminToken: string; let taskId: string;
const bearer = () => 'Bearer ' + token;
beforeAll(async () => {
  await prisma.$connect(); await redis.connect();
  for (const email of emails.slice(0, 2)) await request(app).post('/auth/register').send({ email, password }).expect(201);
  await prisma.user.create({ data: { email: emails[2], passwordHash: await bcrypt.hash(password, 12), role: 'ADMIN' } });
  const login = async (email: string) => (await request(app).post('/auth/login').send({ email, password }).expect(200)).body.data.accessToken;
  token = await login(emails[0]); otherToken = await login(emails[1]); adminToken = await login(emails[2]);
});
afterAll(async () => {
  // Only remove records created by this test run, never reset a shared database.
  const users = await prisma.user.findMany({ where: { email: { in: emails } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  for (const user of users) await redis.del('tasks:version:' + user.id);
  await redis.quit(); await prisma.$disconnect();
});

test('registration persists a bcrypt hash and normalizes email', async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: emails[0] } });
  expect(user.role).toBe('USER'); expect(user.passwordHash).not.toBe(password); expect(await bcrypt.compare(password, user.passwordHash)).toBe(true);
});
test('real readiness reaches PostgreSQL and Redis', async () => { const res = await request(app).get('/ready').expect(200); expect(res.body.data).toEqual({ database: 'connected', redis: 'connected' }); });
test('duplicate registration returns 409', async () => { await request(app).post('/auth/register').send({ email: emails[0], password }).expect(409); });
test('real task create persists owner relation', async () => {
  const res = await request(app).post('/tasks').set('Authorization', bearer()).send({ title: 'Integration task' }).expect(201); taskId = res.body.data.task.id;
  const saved = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { owner: true } }); expect(saved.owner.email).toBe(emails[0]);
});
test('real Redis returns MISS then HIT', async () => {
  const first = await request(app).get('/tasks').set('Authorization', bearer()).expect(200);
  const second = await request(app).get('/tasks').set('Authorization', bearer()).expect(200);
  expect(first.headers['x-cache']).toBe('MISS'); expect(second.headers['x-cache']).toBe('HIT'); expect(first.body).toEqual(second.body);
});
test('second user cannot read, update, or delete owner task', async () => {
  for (const method of ['get', 'put', 'delete'] as const) {
    const req = request(app)[method]('/tasks/' + taskId).set('Authorization', 'Bearer ' + otherToken);
    if (method === 'put') req.send({ status: 'DONE' }); await req.expect(404);
  }
  const res = await request(app).get('/tasks').set('Authorization', 'Bearer ' + otherToken).expect(200); expect(res.body.data.tasks).toEqual([]);
});
test('update invalidates real cache and returns fresh status', async () => {
  await request(app).put('/tasks/' + taskId).set('Authorization', bearer()).send({ status: 'DONE' }).expect(200);
  const res = await request(app).get('/tasks').set('Authorization', bearer()).expect(200); expect(res.headers['x-cache']).toBe('MISS'); expect(res.body.data.tasks[0].status).toBe('DONE');
});
test('real RBAC denies USER and accepts ADMIN', async () => { await request(app).get('/admin/users').set('Authorization', bearer()).expect(403); const res = await request(app).get('/admin/users').set('Authorization', 'Bearer ' + adminToken).expect(200); expect(JSON.stringify(res.body)).not.toContain('passwordHash'); });
test('delete invalidates cache and persists deletion', async () => {
  await request(app).delete('/tasks/' + taskId).set('Authorization', bearer()).expect(204);
  expect(await prisma.task.findUnique({ where: { id: taskId } })).toBeNull();
  const res = await request(app).get('/tasks').set('Authorization', bearer()).expect(200); expect(res.headers['x-cache']).toBe('MISS'); expect(res.body.data.tasks).toEqual([]);
  await request(app).get('/tasks/' + taskId).set('Authorization', bearer()).expect(404);
});
