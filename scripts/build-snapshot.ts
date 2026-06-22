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
import { stockWatchlist } from '../src/data/watchlist'
import { fetchHistoricalEarningsMapNode, serializeHistoricalEarningsMap } from '../src/worker/researchData'
import { fetchFredLiquidity } from './fredLiquidity'
import { fetchYahooMarketCaps } from './yahooMarketCap'
import { fetchFinnhubNewsCounts } from './finnhubNews'

const INGEST_URL = process.env.INGEST_URL
  || 'https://trading-etf.skagaza486.workers.dev/api/admin/ingest-snapshot'
const INGEST_TOKEN = process.env.INGEST_TOKEN
const FRED_API_KEY = process.env.FRED_API_KEY   // optional; skips liquidity note if absent
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY   // optional; skips news-density if absent
const MIN_STOCKS = Number(process.env.MIN_STOCKS ?? 100)

// Event-density subset: only the stocks worth a Finnhub call — bullish or
// anything whose signal changed today. Keeps us well under the free-tier quota.
const BULLISH = new Set(['LONG_BREAK', 'LONG_VCP', 'LONG_BOUNCE', 'LONG_BASE', 'WATCH'])

async function main(): Promise<void> {
  if (!INGEST_TOKEN) {
    console.error('Missing INGEST_TOKEN env var')
    process.exit(1)
  }

  console.log('Building snapshot (patient fetch: concurrency=3, retries=4)…')
  const [{ snapshot }, liquidityNote] = await Promise.all([
    buildDailySnapshot({
      stockConcurrency: 3,
      tuning: { retries: 4, retryDelayMs: 1500, batchDelayMs: 900 },
    }),
    FRED_API_KEY ? fetchFredLiquidity(FRED_API_KEY) : Promise.resolve(null),
  ])
  if (liquidityNote) {
    snapshot.liquidityNote = liquidityNote
    console.log(`FRED liquidity: ${liquidityNote.slope} (${liquidityNote.change4wB > 0 ? '+' : ''}${liquidityNote.change4wB}B / 4w, asOf ${liquidityNote.asOf})`)
  } else {
    console.log('FRED liquidity: skipped (no key or fetch failed)')
  }

  // Fetch market caps from Yahoo for Sector Treemap (Pro mode UI only)
  const tickers = snapshot.stocks.map(s => s.ticker)
  console.log(`Fetching market caps for ${tickers.length} tickers…`)
  const marketCaps = await fetchYahooMarketCaps(tickers)
  let capCount = 0
  for (const stock of snapshot.stocks) {
    const cap = marketCaps.get(stock.ticker)
    if (cap) { stock.marketCap = cap; capCount++ }
  }
  console.log(`Market caps attached: ${capCount}/${tickers.length}`)

  // Event density (Finnhub 7-day news count) — only for the changed/bullish subset.
  if (FINNHUB_API_KEY) {
    const subset = snapshot.stocks.filter(
      s => BULLISH.has(s.label) || (s.previousLabel !== undefined && s.previousLabel !== s.label)
    )
    console.log(`Fetching 7-day news counts for ${subset.length} changed/bullish tickers…`)
    const newsCounts = await fetchFinnhubNewsCounts(subset.map(s => s.ticker), FINNHUB_API_KEY)
    let newsAttached = 0
    for (const stock of snapshot.stocks) {
      const c = newsCounts.get(stock.ticker)
      if (c !== undefined) { stock.newsCount7d = c; newsAttached++ }
    }
    console.log(`News counts attached: ${newsAttached}/${subset.length}`)
  } else {
    console.log('News density: skipped (no FINNHUB_API_KEY)')
  }

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

  console.log(`Fetching 2y historical earnings archive (SEC Edgar) for ${stockWatchlist.length} watchlist tickers…`)
  const historicalEarnings = await fetchHistoricalEarningsMapNode(stockWatchlist.map(stock => stock.ticker))
  const historicalEarningsPayload = serializeHistoricalEarningsMap(historicalEarnings)
  const earningsRows = historicalEarningsPayload.reduce((sum, item) => sum + item.dates.length, 0)
  console.log(`Historical earnings archive attached: ${historicalEarningsPayload.length} tickers / ${earningsRows} rows`)

  const res = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${INGEST_TOKEN}` },
    body: JSON.stringify({
      snapshot,
      historicalEarnings: historicalEarningsPayload
    }),
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
