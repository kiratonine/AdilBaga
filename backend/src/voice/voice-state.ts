import type { FilterSchemaDto } from '../contracts/catalog';
import type { ParsedVoiceQuery, VoiceSession } from './voice-types';

export function mergeVoiceSession(
  previous: VoiceSession,
  update: ParsedVoiceQuery,
  schemas: FilterSchemaDto[],
): VoiceSession {
  const category = update.category ?? previous.category;
  const allowedKeys = new Set(
    schemas.find((schema) => schema.category === category)?.filters.map((filter) => filter.key) ?? [],
  );
  const filters: VoiceSession['filters'] = {};
  if (category === previous.category) {
    for (const [key, value] of Object.entries(previous.filters)) {
      if (allowedKeys.has(key)) filters[key] = value;
    }
  }
  for (const [key, value] of Object.entries(update.filters)) {
    if (allowedKeys.has(key) && value !== null) filters[key] = value;
  }
  return {
    intent: previous.intent ?? update.intent,
    category,
    filters,
    latitude: previous.latitude,
    longitude: previous.longitude,
  };
}

export function missingVoiceFields(session: VoiceSession): string[] {
  const missing: string[] = [];
  if (!session.intent) missing.push('intent');
  if (!session.category) missing.push('category');
  if (session.category === 'milk') {
    if (session.filters.volumeMl == null) missing.push('volumeMl');
    if (session.filters.fatPercent == null) missing.push('fatPercent');
  }
  return missing;
}

export function clarificationQuestion(missing: string[]): string {
  if (missing.includes('intent')) return 'Что нужно сделать: найти цены или самый дешёвый товар?';
  if (missing.includes('category')) return 'Какой товар вы ищете?';
  if (missing.includes('volumeMl') && missing.includes('fatPercent')) {
    return 'Какой объём и жирность молока вам нужны?';
  }
  if (missing.includes('volumeMl')) return 'Какой объём молока вам нужен?';
  return 'Какая жирность молока вам нужна?';
}
