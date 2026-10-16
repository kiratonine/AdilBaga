// Pure measurement helper. No endpoint, secret, invalidation or production access.
export async function observeConvergence({ target, acceptedAt, get, now = () => performance.now(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), detailCalls = () => 0 }) {
  const budget = 5000;
  let first = true, firstFresh = false, firstHeaders = null, firstElapsed = null;
  let stale = 0, requests = 0, fresh = false, elapsed, failure = null;
  while (now() - acceptedAt < budget) {
    try {
      const remaining = Math.max(1, Math.floor(budget - (now() - acceptedAt)));
      requests++;
      const response = await get(target.path, remaining);
      elapsed = Math.ceil(now() - acceptedAt);
      fresh = target.isFresh(response.text);
      if (first) {
        firstFresh = fresh; firstHeaders = response.headers ?? null; firstElapsed = elapsed; first = false;
      }
      if (fresh) break;
      stale++;
      const pause = Math.min(100, budget - (now() - acceptedAt));
      if (pause > 0) await sleep(pause);
    } catch { failure = 'local_http_operation_failed'; break }
  }
  const passed = fresh && elapsed <= budget && !failure;
  return { target: target.name, first_response_cache_status: firstHeaders?.['x-nextjs-cache'] ?? null,
    first_response_headers: firstHeaders, first_response_fresh: firstFresh, first_response_elapsed_ms: firstElapsed,
    eventual_freshness: passed ? 'PASS' : 'FAIL', elapsed_ms: elapsed ?? Math.ceil(now() - acceptedAt),
    stale_response_count: stale, request_count: requests, detail_api_fetch_count: detailCalls(), failure_class: failure };
}
