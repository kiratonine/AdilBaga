import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export const token = 'part13-dummy-session-token';
export function fake({ now = Date.now, capacity = 1024 } = {}) {
  const entries = new Map();
  return createServer(async (req, res) => {
    const reply = (status, result) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ result })); };
    if (req.method !== 'POST' || req.url !== '/' || req.headers.authorization !== `Bearer ${token}`) return reply(403, null);
    let bytes = 0, chunks = [];
    try {
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 1 << 20) return reply(413, null); chunks.push(chunk); }
      const c = JSON.parse(Buffer.concat(chunks));
      if (!Array.isArray(c) || typeof c[1] !== 'string' || !/^voice-session:v1:[a-f0-9]{64}$/.test(c[1])) return reply(400, null);
      for (const [key, value] of entries) if (value.until <= now()) entries.delete(key);
      if (c[0] === 'SET' && c.length === 5 && typeof c[2] === 'string' && c[3] === 'EX' && c[4] === 600) {
        if (!entries.has(c[1]) && entries.size >= capacity) return reply(503, null);
        entries.set(c[1], { value: c[2], until: now() + 600_000 }); return reply(200, 'OK');
      }
      if (c[0] === 'GET' && c.length === 2) return reply(200, entries.get(c[1])?.value ?? null);
      if (c[0] === 'DEL' && c.length === 2) return reply(200, Number(entries.delete(c[1])));
      reply(400, null);
    } catch { reply(400, null); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Container has no published ports and runs only on the owned internal network.
  if (process.env.PART13_FAKE_CONTAINER !== '1') throw Error('container-only fake');
  const server = fake(); server.listen(8082, '0.0.0.0');
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
