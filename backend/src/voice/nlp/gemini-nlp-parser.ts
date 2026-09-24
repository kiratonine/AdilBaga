import { Injectable } from '@nestjs/common';
import type { NlpParseInput } from '../voice-types';

const DEFAULT_MODEL = 'gemini-3.1-flash-lite';

@Injectable()
export class GeminiNlpParser {
  isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  async parse(input: NlpParseInput): Promise<unknown> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Gemini is not configured');
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
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(8_000),
        body: JSON.stringify({
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
      },
    );
    if (!response.ok) throw new Error('Gemini request failed');
    const body: unknown = await response.json();
    const text = extractResponseText(body);
    if (!text) throw new Error('Gemini returned no JSON text');
    return JSON.parse(text) as unknown;
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
