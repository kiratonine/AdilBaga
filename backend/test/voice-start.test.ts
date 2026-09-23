import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/create-app';

let app: INestApplication;
let baseUrl: string;

before(async () => {
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await app?.close();
});

test('POST /api/voice/start returns a structured transport result', async () => {
  const response = await fetch(`${baseUrl}/api/voice/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'найди самое дешевое молоко', latitude: 43.6, longitude: 51.1 }),
  });
  assert.equal(response.status, 201);
  const body: unknown = await response.json();
  assert.deepEqual(body, {
    status: 'result',
    mode: 'single',
    speech: 'Запрос получен. Голосовой сценарий подключен.',
    items: [],
  });
});
