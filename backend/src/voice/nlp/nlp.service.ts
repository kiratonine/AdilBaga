import { Injectable } from '@nestjs/common';
import type { NlpParseInput, NlpParser, ParsedVoiceQuery } from '../voice-types';
import { FallbackNlpParser } from './fallback-nlp-parser';
import { GeminiNlpParser } from './gemini-nlp-parser';
import { validateNlpResult } from './validate-nlp-result';

@Injectable()
export class NlpService implements NlpParser {
  constructor(
    private readonly gemini: GeminiNlpParser,
    private readonly fallback: FallbackNlpParser,
  ) {}

  async parse(input: NlpParseInput): Promise<ParsedVoiceQuery> {
    if (this.gemini.isConfigured()) {
      try {
        const parsed = validateNlpResult(await this.gemini.parse(input), input);
        if (parsed) return parsed;
      } catch {
        // One bounded provider chain; deterministic parser handles the demo vocabulary.
      }
    }
    return validateNlpResult(this.fallback.parse(input), input) ??
      { intent: null, category: null, filters: {} };
  }
}
