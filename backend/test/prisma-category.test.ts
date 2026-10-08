import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import { PrismaCategoryRepository } from '../src/database/prisma-category.repository';
import type { PrismaService } from '../src/database/prisma.service';

// Query-shape proof only. Real SQL semantics/parity are checked on disposable PG.
test('Prisma category list pins latest published snapshot and current usable offers', async () => {
  const tx = {
    snapshot: { findFirst: async (query: unknown) => {
      assert.deepEqual(query, {
        where: { status: 'published', publishedAt: { not: null } },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], select: { id: true },
      });
      return { id: 'current-published' };
    } },
    category: { findMany: async (query: unknown) => {
      assert.deepEqual(query, {
        where: { canonicalProducts: { some: { offers: { some: {
          inStock: true, price: { gt: 0 }, snapshotId: 'current-published',
        } } } } }, orderBy: { slug: 'asc' },
      });
      return [{ id: 'current', slug: 'milk', name: 'Молоко', filterSchema: {} }];
    } },
  };
  const prisma = { $transaction: async (
    read: (client: typeof tx) => Promise<unknown>, options: unknown,
  ) => {
    assert.deepEqual(options, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return read(tx);
  } } as unknown as PrismaService;
  assert.deepEqual(await new PrismaCategoryRepository(prisma).findAll(), [
    { id: 'current', slug: 'milk', name: 'Молоко' },
  ]);
});

test('Prisma category list fails closed without a published snapshot', async () => {
  let queriedCategories = false;
  const tx = {
    snapshot: { findFirst: async () => null },
    category: { findMany: async () => { queriedCategories = true; return []; } },
  };
  const prisma = { $transaction: async (read: (client: typeof tx) => Promise<unknown>) => read(tx) } as unknown as PrismaService;
  await assert.rejects(new PrismaCategoryRepository(prisma).findAll(), /Published catalog unavailable/);
  assert.equal(queriedCategories, false);
});
