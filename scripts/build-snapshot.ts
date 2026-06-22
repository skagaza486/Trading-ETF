/**
 * Daily snapshot builder — runs in full Node (GitHub Actions), NOT in the Worker.
 *
 * Why: the Worker cron fetches ~130 Yahoo histories under subrequest/CPU/time
 * pressure, so a rushed concurrency burst gets rate-limited (we saw 43/130).
 * Node has none of those limits, so we fetch *patiently* (low concurrency +
 * retries + backoff), then POST the finished snapshot to the Worker's
 * /api/admin/ingest-snapshot endpoint, which persists it via the binding path.
 *
 * Run:  INGEST_TOKEN=… node --import tsx scripts/build-snapshot.ts
 */
import { buildDailySnapshot } from '../src/worker/cronSnapshot'

const INGEST_URL = process.env.INGEST_URL
  || 'https://trading-etf.skagaza486.workers.dev/api/admin/ingest-snapshot'
const INGEST_TOKEN = process.env.INGEST_TOKEN
const MIN_STOCKS = Number(process.env.MIN_STOCKS ?? 100)

async function main(): Promise<void> {
  if (!INGEST_TOKEN) {
    console.error('Missing INGEST_TOKEN env var')
    process.exit(1)
  }

  console.log('Building snapshot (patient fetch: concurrency=3, retries=4)…')
  const { snapshot } = await buildDailySnapshot({
    stockConcurrency: 3,
    tuning: { retries: 4, retryDelayMs: 1500, batchDelayMs: 900 },
  })
  console.log(`Built snapshot: date=${snapshot.date}, stocks=${snapshot.stocks.length}`)
  const sample = snapshot.stocks[0]
  if (sample) {
    console.log(
      `Snapshot sample fields: prevClose=${sample.prevClose ?? 'null'}, recentClose=${sample.recentClose.length} points`
    )
  }

  // Guard: never overwrite a healthy snapshot with a thin (rate-limited) one.
  if (snapshot.stocks.length < MIN_STOCKS) {
    console.error(`Only ${snapshot.stocks.length} stocks (< MIN_STOCKS=${MIN_STOCKS}); aborting without ingest.`)
    process.exit(2)
  }

  const res = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${INGEST_TOKEN}` },
    body: JSON.stringify(snapshot),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`Ingest failed ${res.status}: ${text}`)
    process.exit(3)
  }
  console.log(`Ingested OK: ${text}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
