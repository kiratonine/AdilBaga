import { Injectable } from '@nestjs/common';
import type { NlpParseInput, ParsedVoiceQuery } from '../voice-types';

const categoryKeywords: ReadonlyArray<[RegExp, string]> = [
  [/молок[оа]/iu, 'milk'],
  [/хлеб/iu, 'bread'],
  [/яйц[ао]/iu, 'eggs'],
  [/сахар/iu, 'sugar'],
  [/масл[оа]/iu, 'oil'],
];

@Injectable()
export class FallbackNlpParser {
  parse(input: NlpParseInput): ParsedVoiceQuery {
    const text = input.text.toLocaleLowerCase('ru');
    const detected = categoryKeywords.find(([pattern]) => pattern.test(text))?.[1] ?? null;
    const category = detected && input.categories.some((item) => item.slug === detected)
      ? detected : null;
    const effectiveCategory = category ?? input.currentCategory;
    const filters: ParsedVoiceQuery['filters'] = {};

    if (effectiveCategory === 'milk') {
      const schema = input.schemas.find((item) => item.category === 'milk');
      const allowed = (key: string, value: number): boolean =>
        schema?.filters.find((item) => item.key === key)?.options?.includes(value) ?? false;
      const volume = /\b500\s*мл(?!\p{L})/iu.test(text) ? 500
        : /(?:^|[^\p{L}\p{N}])(?:1|один)\s*(?:литр(?:а)?|л)(?!\p{L})/iu.test(text)
          ? 1000 : null;
      const percent = /\b(\d+(?:[.,]\d+)?)\s*(?:%|процент(?:а|ов)?)(?!\p{L})/iu.exec(text);
      const fatPercent = percent ? Number(percent[1]?.replace(',', '.')) : null;
      if (volume !== null && allowed('volumeMl', volume)) filters.volumeMl = volume;
      if (fatPercent !== null && Number.isFinite(fatPercent) && allowed('fatPercent', fatPercent)) {
        filters.fatPercent = fatPercent;
      }
    }

    const intent = /деш[её]в|дешевле/iu.test(text) ? 'cheapest'
      : /цены|найди|найти|покажи/iu.test(text) ? 'search' : null;
    return { intent, category, filters };
  }
}
