import 'dotenv/config';
import { GEMINI_KEY_NAMES, requestGeminiWithFailover } from '../src/voice/nlp/gemini-nlp-parser';

async function verifyKeys(): Promise<void> {
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: 'Return JSON only: {"ok":true}' }] }],
    generationConfig: { responseMimeType: 'application/json' },
  });
  for (const name of GEMINI_KEY_NAMES) {
    let passed = false;
    const key = process.env[name]?.trim();
    if (key) {
      try {
        // Exactly one request per configured key; no cross-key failover in this manual smoke.
        const result = await requestGeminiWithFailover([key], url, body);
        passed = typeof result === 'object' && result !== null && 'ok' in result && result.ok === true;
      } catch { /* Never print provider responses, headers, keys or error causes. */ }
    }
    console.log(`${name}: ${passed ? 'PASS' : 'FAIL'}`);
    if (!passed) process.exitCode = 1;
  }
}

void verifyKeys();
