import type { CategoryDto, FilterSchemaDto } from '../contracts/catalog';

export type VoiceIntent = 'cheapest' | 'search';
export type VoiceFilterValue = string | number | boolean | null;

export interface ParsedVoiceQuery {
  intent: VoiceIntent | null;
  category: string | null;
  filters: Record<string, VoiceFilterValue>;
}

export interface NlpParseInput {
  text: string;
  categories: CategoryDto[];
  schemas: FilterSchemaDto[];
  currentCategory?: string | null;
}

export interface NlpParser {
  parse(input: NlpParseInput): Promise<ParsedVoiceQuery>;
}

export const NLP_PARSER = Symbol('NlpParser');

export interface VoiceSession extends ParsedVoiceQuery {
  latitude: number;
  longitude: number;
}
