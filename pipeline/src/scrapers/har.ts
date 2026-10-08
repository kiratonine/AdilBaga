export type Har = { log: { entries: { request: { url: string }; response: { status: number; content: { mimeType?: string; text?: string; encoding?: string } } }[] } }

export function extractJsonResponses(har: Har, urlPattern: RegExp): unknown[] {
  const out: unknown[] = []
  for (const e of har.log.entries) {
    const c = e.response.content
    if (e.response.status !== 200 || !urlPattern.test(e.request.url) || !c.text || !c.mimeType?.includes('json')) continue
    const text = c.encoding === 'base64' ? Buffer.from(c.text, 'base64').toString('utf8') : c.text
    try { out.push(JSON.parse(text)) } catch { /* обрезанный ответ в HAR — пропускаем */ }
  }
  return out
}
