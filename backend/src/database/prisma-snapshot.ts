import { InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from './prisma.service';

// Pin offers AND global canonical metadata to one repeatable-read view.
// No cache and no legacy/mixed-history fallback.
export function withPublishedSnapshot<T>(
  prisma: PrismaService,
  read: (tx: Prisma.TransactionClient, snapshotId: string) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const snapshot = await tx.snapshot.findFirst({
      where: { status: 'published', publishedAt: { not: null } },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    if (!snapshot) throw new InternalServerErrorException('Published catalog unavailable');
    return read(tx, snapshot.id);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
