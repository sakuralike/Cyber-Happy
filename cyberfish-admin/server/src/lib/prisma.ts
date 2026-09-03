import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [
      { level: 'warn', emit: 'event' },
      { level: 'error', emit: 'event' },
    ],
  });

// @ts-expect-error - Prisma 事件类型在运行时绑定
prisma.$on('warn', (e: { message: string }) => logger.warn({ prisma: true }, e.message));
// @ts-expect-error - Prisma 事件类型在运行时绑定
prisma.$on('error', (e: { message: string }) => logger.error({ prisma: true }, e.message));

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export type Prisma = typeof prisma;
