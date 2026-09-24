import { Injectable } from '@nestjs/common';
import type { OfferDto } from '../contracts/catalog';
import type { StoreLocation } from '../location/nearest-store';
import type { StoreLocationRepository } from '../repositories';
import { mapLocation } from './prisma-mappers';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaStoreLocationRepository implements StoreLocationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByStoreCode(storeCode: OfferDto['storeCode']): Promise<StoreLocation[]> {
    const rows = await this.prisma.storeLocation.findMany({
      where: { store: { code: storeCode } },
      include: { store: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(mapLocation);
  }
}
