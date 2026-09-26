import { Injectable } from '@nestjs/common';
import type { NlpParseInput } from '../voice-types';

const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
export const GEMINI_TIMEOUT_MS = 8_000;
export const GEMINI_KEY_NAMES = ['GEMINI_API_KEY', 'GEMINI_API_KEY2', 'GEMINI_API_KEY3'] as const;

export function configuredGeminiKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  return [...new Set(GEMINI_KEY_NAMES.map((name) => env[name]?.trim()).filter((key): key is string => Boolean(key)))];
}

// One body and one deadline for the entire chain. No provider errors or secrets escape.
export async function requestGeminiWithFailover(
  keys: readonly string[], url: string, body: string,
  request: typeof fetch = fetch, timeoutMs = GEMINI_TIMEOUT_MS,
): Promise<unknown> {
  const signal = AbortSignal.timeout(timeoutMs);
  for (const apiKey of [...new Set(keys.map((key) => key.trim()).filter(Boolean))]) {
    if (signal.aborted) break;
    try {
      const response = await request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        signal, body,
      });
      if (!response.ok) continue;
      const text = extractResponseText(await response.json());
      if (!text) continue;
      const result: unknown = JSON.parse(text);
      if (!signal.aborted) return result;
    } catch {
      // Provider/network/JSON failures retry the same NLP request with the next key.
    }
  }
  throw new Error('Gemini request failed');
}

@Injectable()
export class GeminiNlpParser {
  isConfigured(): boolean {
    return configuredGeminiKeys().length > 0;
  }

  async parse(input: NlpParseInput): Promise<unknown> {
    const keys = configuredGeminiKeys();
    if (!keys.length) throw new Error('Gemini is not configured');
    const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
    const filterProperties = Object.fromEntries(
      input.schemas.flatMap((schema) =>
        schema.filters.map((filter) => {
          const valueType =
            filter.type === 'boolean'
              ? 'boolean'
              : typeof filter.options?.[0] === 'number'
                ? 'number'
                : 'string';

          return [
            filter.key,
            {
              anyOf: [
                { type: valueType },
                { type: 'null' },
              ],
            },
          ];
        }),
      ),
    );
    const prompt = [
      'Extract only intent, category, and explicitly stated filter values from the user text.',
      'Use null for missing intent/category and omit missing filters. Return JSON only.',
      'Allowed intents: cheapest, search. Do not select products, prices, stores, or locations.',
      `Allowed category and filter context: ${JSON.stringify(input.schemas)}`,
      `Allowed category slugs: ${input.categories.map((category) => category.slug).join(', ')}`,
      `Current category for a clarification, if any: ${input.currentCategory ?? 'none'}`,
      `User text: ${input.text}`,
    ].join('\n');
    return requestGeminiWithFailover(
      keys,
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: {
              type: 'object',
              properties: {
                intent: {
                  anyOf: [
                    { type: 'string' },
                    { type: 'null' },
                  ],
                },
                category: {
                  anyOf: [
                    { type: 'string' },
                    { type: 'null' },
                  ],
                },
                filters: {
                  type: 'object',
                  properties: filterProperties,
                  additionalProperties: false,
                },
              },
              required: ['intent', 'category', 'filters'],
              additionalProperties: false,
            },
          },
      }),
    );
  }
}

function extractResponseText(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('candidates' in body) ||
    !Array.isArray(body.candidates)) return null;
  const candidate: unknown = body.candidates[0];
  if (typeof candidate !== 'object' || candidate === null || !('content' in candidate)) return null;
  const content: unknown = candidate.content;
  if (typeof content !== 'object' || content === null || !('parts' in content) ||
    !Array.isArray(content.parts)) return null;
  for (const part of content.parts as unknown[]) {
    if (typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string') {
      return part.text;
    }
  }
  return null;
}
