import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { normalizeProduct } from '../catalog/product-card';
import type { FilterSchemaDto, ProductQuery } from '../contracts/catalog';
import type {
  VoiceContinueRequest, VoiceResponse, VoiceResultItem, VoiceStartRequest,
} from '../contracts/voice';
import { nearestStore } from '../location/nearest-store';
import {
  CATEGORY_REPOSITORY, PRODUCT_REPOSITORY, STORE_LOCATION_REPOSITORY,
  type CategoryRepository, type ProductRepository, type StoreLocationRepository,
} from '../repositories';
import {
  VOICE_SESSION_REPOSITORY, VOICE_SESSION_TTL_SECONDS, type VoiceSessionRepository,
} from './sessions/voice-session.repository';
import { clarificationQuestion, mergeVoiceSession, missingVoiceFields } from './voice-state';
import { NLP_PARSER, type NlpParseInput, type NlpParser, type VoiceSession } from './voice-types';

@Injectable()
export class VoiceService {
  constructor(
    @Inject(NLP_PARSER) private readonly nlp: NlpParser,
    @Inject(VOICE_SESSION_REPOSITORY) private readonly sessions: VoiceSessionRepository,
    @Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(STORE_LOCATION_REPOSITORY) private readonly locations: StoreLocationRepository,
  ) {}

  async start(request: VoiceStartRequest): Promise<VoiceResponse> {
    const context = await this.nlpContext(request.text);
    const parsed = await this.nlp.parse(context);
    return this.advance({
      ...parsed,
      latitude: request.latitude,
      longitude: request.longitude,
    });
  }

  async continue(request: VoiceContinueRequest): Promise<VoiceResponse> {
    let previous: VoiceSession | null;
    try {
      previous = await this.sessions.get(request.sessionId);
    } catch {
      throw new ServiceUnavailableException('Voice session unavailable');
    }
    if (!previous) throw new NotFoundException('Voice session not found or expired');
    const context = await this.nlpContext(request.text, previous.category);
    const parsed = await this.nlp.parse(context);
    return this.advance(mergeVoiceSession(previous, parsed, context.schemas), request.sessionId);
  }

  private async nlpContext(text: string, currentCategory?: string | null): Promise<NlpParseInput> {
    const categories = await this.categories.findAll();
    const schemas = (await Promise.all(categories.map((category) =>
      this.categories.findFilters(category.slug),
    ))).filter((schema): schema is FilterSchemaDto => schema !== null);
    return { text, categories, schemas, currentCategory };
  }

  private async advance(session: VoiceSession, sessionId?: string): Promise<VoiceResponse> {
    const missingFields = missingVoiceFields(session);
    if (missingFields.length > 0) {
      const id = sessionId ?? randomUUID();
      try {
        await this.sessions.set(id, session, VOICE_SESSION_TTL_SECONDS);
      } catch {
        throw new ServiceUnavailableException('Voice session unavailable');
      }
      return {
        status: 'needs_clarification',
        sessionId: id,
        question: clarificationQuestion(missingFields),
        missingFields,
      };
    }
    const result = await this.result(session);
    if (sessionId) {
      try {
        await this.sessions.delete(sessionId);
      } catch {
        // The short TTL still bounds stale state if cleanup fails.
      }
    }
    return result;
  }

  private async result(session: VoiceSession): Promise<VoiceResponse> {
    if (!session.intent || !session.category) {
      throw new ServiceUnavailableException('Voice query incomplete');
    }
    const filters: NonNullable<ProductQuery['filters']> = {};
    for (const [key, value] of Object.entries(session.filters)) {
      if (value !== null) filters[key] = [value];
    }
    const products = (await this.products.findProducts({
      category: session.category,
      filters,
      sort: 'price_asc',
    })).map(normalizeProduct).filter((product) => product.offers.length > 0)
      .sort((a, b) => a.minPrice - b.minPrice);

    const limit = session.intent === 'cheapest' ? 1 : 3;
    const items: VoiceResultItem[] = [];
    for (const product of products.slice(0, limit)) {
      const offer = product.offers[0];
      if (!offer) continue;
      const locations = await this.locations.findByStoreCode(offer.storeCode);
      const nearest = nearestStore(session.latitude, session.longitude, locations);
      items.push({
        name: product.name,
        price: offer.price,
        store: offer.storeName,
        address: nearest?.location.address ?? null,
        distanceMeters: nearest ? Math.round(nearest.distanceMeters) : null,
        imageUrl: product.imageUrl,
      });
    }
    const mode = session.intent === 'cheapest' ? 'single' : 'list';
    return { status: 'result', mode, items, speech: this.speech(items, mode) };
  }

  private speech(items: VoiceResultItem[], mode: 'single' | 'list'): string {
    if (items.length === 0) return 'Подходящих товаров не найдено.';
    if (mode === 'single') {
      const item = items[0];
      if (!item) return 'Подходящих товаров не найдено.';
      const nearest = item.address && item.distanceMeters !== null
        ? ` Ближайшая точка — ${item.address}, примерно ${item.distanceMeters} ${metersWord(item.distanceMeters)}.` : '';
      return `Самое дешёвое предложение: ${item.name} за ${item.price} тенге в ${item.store}.${nearest}`;
    }
    const introduction = items.length === 1 ? 'Нашёл один вариант.' : `Нашёл ${items.length} варианта.`;
    return `${introduction} ` + items.map((item, index) =>
      `${['Первый', 'Второй', 'Третий'][index]} — ${item.name} за ${item.price} тенге в ${item.store}.`,
    ).join(' ');
  }
}

function metersWord(distance: number): string {
  const lastTwo = distance % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'метров';
  const last = distance % 10;
  return last === 1 ? 'метр' : last >= 2 && last <= 4 ? 'метра' : 'метров';
}
