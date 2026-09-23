import { Module } from '@nestjs/common';
import {
  FixtureCategoryRepository,
  FixtureDashboardRepository,
  FixtureProductRepository,
} from './fixtures/repositories';
import {
  CATEGORY_REPOSITORY,
  DASHBOARD_REPOSITORY,
  PRODUCT_REPOSITORY,
} from './repositories';
import { VoiceController } from './voice/voice.controller';
import { VoiceService } from './voice/voice.service';

@Module({
  controllers: [VoiceController],
  providers: [
    VoiceService,
    { provide: PRODUCT_REPOSITORY, useClass: FixtureProductRepository },
    { provide: CATEGORY_REPOSITORY, useClass: FixtureCategoryRepository },
    { provide: DASHBOARD_REPOSITORY, useClass: FixtureDashboardRepository },
  ],
})
export class AppModule {}
