import { Module } from '@nestjs/common';
import { ProductsController } from './catalog/products.controller';
import { ProductsService } from './catalog/products.service';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
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
  controllers: [CategoriesController, ProductsController, DashboardController, VoiceController],
  providers: [
    CategoriesService,
    ProductsService,
    DashboardService,
    VoiceService,
    { provide: PRODUCT_REPOSITORY, useClass: FixtureProductRepository },
    { provide: CATEGORY_REPOSITORY, useClass: FixtureCategoryRepository },
    { provide: DASHBOARD_REPOSITORY, useClass: FixtureDashboardRepository },
  ],
})
export class AppModule {}
