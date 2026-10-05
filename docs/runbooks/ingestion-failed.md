# One-shot ingestion failed

## LOCAL NOW

Inspect safe ingestion_complete mode/phase/error_code/duration and counts, then
operator-only snapshot/SourceRun state using scoped read-only diagnostics.
Never log raw source products/payloads or use API credential for history. A failed
staged snapshot must not replace the previous published snapshot: verify latest
published identity, counts, filters/dashboard/Voice remain from the old publish.

Before any separately approved apply, dry-run the prepared bundle, check drop/
quality/fingerprint/stable canonical identity gates and advisory-lock availability.
Do not forcibly release another process's lock or re-publish partial data. Publish
is atomic; a failed staged snapshot stays non-public until an explicitly reviewed
recovery action. Usually recovery means **keep previous published snapshot**, not
rewind DB/delete history. Follow [rollback](rollback.md) for confirmed corruption.

Part11 permits only disposable local lifecycle tests. No production writer LOGIN,
dry-run/apply, parser/scraper, N+1 publication or ingestion scheduler here.

## FUTURE VPS

Activation of operator credentials/apply is separate owner approval. Delivery
and ingestion cadence are deferred; never introduce parser cron as incident fix.
