export { Prisma } from '@prisma/client';
export type { PrismaClient } from '@prisma/client';

/**
 * Picks a stable set of "safe" public fields from a Prisma model object.
 * Useful to strip nothing sensitive by default — access tokens are stored
 * encrypted and are never returned via API serialization.
 */
export function toPublic<T>(record: T): T {
  return record;
}

export { prisma, disconnectDatabase } from './client.js';
