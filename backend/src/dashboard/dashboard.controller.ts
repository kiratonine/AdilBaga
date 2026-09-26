import { Controller, Get } from '@nestjs/common';
import type { DashboardDto } from '../contracts/catalog';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  getDashboard(): Promise<DashboardDto> {
    return this.dashboard.getDashboard();
  }
}
