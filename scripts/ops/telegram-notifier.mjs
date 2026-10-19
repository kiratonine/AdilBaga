// Outbound only. No discovery, logging, retries, polling or incoming bot server.
import https from 'node:https';

const telegram = new WeakSet();
export const isTelegramNotifier = value => telegram.has(value);
export function validateTelegramConfig({ token, admin } = {}) {
  if (typeof token !== 'string' || !/^[1-9][0-9]{0,15}:[A-Za-z0-9_-]{35}$/.test(token) || /\s/.test(token)
    || typeof admin !== 'string' || !/^[1-9][0-9]{0,15}$/.test(admin) || /\s/.test(admin)
    || !Number.isSafeInteger(Number(admin)) || Number(admin) > 4503599627370495) throw Error('telegram_configuration');
  return { token, admin };
}
// Caller selects ONLY matching lines; never evaluate dotenv or retain other entries.
export function parseTelegramEntries(lines) {
  const entries = Object.create(null);
  for (const line of lines) {
    const m = /^(?:export[ \t]+)?(BOT_TOKEN|ADMIN_ID)[ \t]*=[ \t]*(.*)$/.exec(line.trim());
    if (!m || Object.hasOwn(entries, m[1])) throw Error('telegram_configuration');
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    entries[m[1]] = v;
  }
  return validateTelegramConfig({ token: entries.BOT_TOKEN, admin: entries.ADMIN_ID });
}
export function createTelegramNotifier(config, { request = https.request, timeoutMs = 5000 } = {}) {
  const { token, admin } = validateTelegramConfig(config);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) throw Error('telegram_configuration');
  const notify = (event, signal) => new Promise(resolve => {
    if (!event || !['incident_opened','incident_recovered'].includes(event.type) || typeof event.id !== 'string'
      || !/^[a-f0-9]{32}$/.test(event.id) || event.id.length !== 32 || !Number.isSafeInteger(event.atUTC)
      || event.atUTC < 0 || event.atUTC >= 8640000000000000 || signal?.aborted) return resolve(false);
    const text = (event.type === 'incident_opened' ? 'ALERT — Aktau Market Go API\nСервис недоступен'
      : 'RECOVERED — Aktau Market Go API\nРабота восстановлена') + '\nUTC ' + new Date(event.atUTC).toISOString();
    const body = JSON.stringify({ chat_id: admin, text });
    let req, res, timer, done = false;
    const finish = ok => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel); res?.destroy(); req?.destroy(); resolve(ok === true); };
    const cancel = () => finish(false);
    timer = setTimeout(cancel, timeoutMs); signal?.addEventListener('abort', cancel, { once: true });
    try {
      req = request('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST', agent: false, rejectUnauthorized: true,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, response => {
        res = response;
        if (res.statusCode !== 200 || !/^application\/json(?:\s*;|$)/i.test(res.headers['content-type'] ?? '')) return finish(false);
        const length = res.headers['content-length'];
        if (length !== undefined && (!/^(?:0|[1-9][0-9]*)$/.test(length) || Number(length) > 32768)) return finish(false);
        let size = 0; const chunks = [];
        res.on('data', chunk => { if (done) return; size += chunk.length; if (size > 32768) finish(false); else chunks.push(chunk); });
        res.on('aborted', cancel); res.on('error', cancel);
        res.on('end', () => {
          if (done) return;
          if (!res.complete || (length !== undefined && Number(length) !== size)) return finish(false);
          try {
            const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
            const r = value?.result, chat = r?.chat;
            finish(value?.ok === true && Number.isSafeInteger(r?.message_id) && r.message_id > 0
              && (chat === undefined || (chat && Number.isSafeInteger(chat.id) && String(chat.id) === admin && chat.type === 'private')));
          } catch { finish(false); }
        });
      });
      req.on('error', cancel); req.end(body);
    } catch { finish(false); }
  });
  telegram.add(notify); return notify;
}
