import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();
// Reuse one connection pool across all requests.
