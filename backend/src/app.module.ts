import { Module } from '@nestjs/common';
import { ProductsController } from './catalog/products.controller';
import { ProductsService } from './catalog/products.service';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { PrismaCategoryRepository } from './database/prisma-category.repository';
import { PrismaDashboardRepository } from './database/prisma-dashboard.repository';
import { PrismaProductRepository } from './database/prisma-product.repository';
import { PrismaService } from './database/prisma.service';
import { PrismaStoreLocationRepository } from './database/prisma-store-location.repository';
import {
  FixtureCategoryRepository,
  FixtureDashboardRepository,
  FixtureProductRepository,
  FixtureStoreLocationRepository,
} from './fixtures/repositories';
import {
  CATEGORY_REPOSITORY,
  DASHBOARD_REPOSITORY,
  PRODUCT_REPOSITORY,
  STORE_LOCATION_REPOSITORY,
} from './repositories';
import { FallbackNlpParser } from './voice/nlp/fallback-nlp-parser';
import { GeminiNlpParser } from './voice/nlp/gemini-nlp-parser';
import { NlpService } from './voice/nlp/nlp.service';
import { MemoryVoiceSessionRepository } from './voice/sessions/memory-voice-session.repository';
import { UpstashVoiceSessionRepository } from './voice/sessions/upstash-voice-session.repository';
import { VOICE_SESSION_REPOSITORY } from './voice/sessions/voice-session.repository';
import { NLP_PARSER } from './voice/voice-types';
import { VoiceController } from './voice/voice.controller';
import { VoiceService } from './voice/voice.service';

// Fixtures are opt-in for deterministic tests; normal runtime always uses PostgreSQL.
const fixtureData = process.env.DATA_SOURCE === 'fixture';

@Module({
  controllers: [CategoriesController, ProductsController, DashboardController, VoiceController],
  providers: [
    CategoriesService,
    ProductsService,
    DashboardService,
    VoiceService,
    GeminiNlpParser,
    FallbackNlpParser,
    NlpService,
    ...(!fixtureData ? [PrismaService] : []),
    { provide: NLP_PARSER, useExisting: NlpService },
    { provide: PRODUCT_REPOSITORY, useClass: fixtureData ? FixtureProductRepository : PrismaProductRepository },
    { provide: CATEGORY_REPOSITORY, useClass: fixtureData ? FixtureCategoryRepository : PrismaCategoryRepository },
    { provide: DASHBOARD_REPOSITORY, useClass: fixtureData ? FixtureDashboardRepository : PrismaDashboardRepository },
    { provide: STORE_LOCATION_REPOSITORY, useClass: fixtureData ? FixtureStoreLocationRepository : PrismaStoreLocationRepository },
    {
      provide: VOICE_SESSION_REPOSITORY,
      useFactory: () => {
        const url = process.env.UPSTASH_REDIS_REST_URL;
        const token = process.env.UPSTASH_REDIS_REST_TOKEN;
        return url && token
          ? new UpstashVoiceSessionRepository(url, token)
          : new MemoryVoiceSessionRepository();
      },
    },
  ],
})
export class AppModule {}
