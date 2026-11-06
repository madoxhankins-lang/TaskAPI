import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { credentialsSchema } from '../src/validation';

const db = new PrismaClient();
async function seed() {
  const { email, password } = credentialsSchema.parse({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  const existing = await db.user.findUnique({ where: { email } });
  if (existing && existing.role !== 'ADMIN') throw new Error('Seed email belongs to a regular user; choose a different admin email');
  if (!existing) await db.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 12), role: 'ADMIN' } });
  console.log('Admin account ready. Credentials stay in .env.');
}
seed().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
