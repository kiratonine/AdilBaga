import { Inject, Injectable } from '@nestjs/common';
import type { DashboardDto } from '../contracts/catalog';
import { DASHBOARD_REPOSITORY, type DashboardRepository } from '../repositories';

@Injectable()
export class DashboardService {
  constructor(@Inject(DASHBOARD_REPOSITORY) private readonly dashboard: DashboardRepository) {}

  getDashboard(): Promise<DashboardDto> {
    return this.dashboard.getDashboard();
  }
}
