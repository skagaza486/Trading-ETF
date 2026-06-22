/**
 * Fetches a 7-day company-news *count* per ticker from Finnhub.
 *
 * Used only by build-snapshot.ts (GitHub Actions) to attach an event-density
 * signal (newsCount7d) to a small subset of stocks. We deliberately serialise
 * with a delay because the Finnhub free tier caps at ~60 calls/min; for the
 * ~50–80 changed/bullish stocks we query, this stays comfortably under quota.
 *
 * Returns a Map of ticker -> count. Tickers that error out are simply omitted
 * (the snapshot field stays undefined and the UI/priority score treat it as 0).
 */

const FINNHUB_NEWS = 'https://finnhub.io/api/v1/company-news'
const CALL_DELAY_MS = 1200   // ~50 calls/min — safely under the 60/min free-tier cap

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

async function fetchCount(ticker: string, apiKey: string, from: string, to: string): Promise<number | null> {
  const params = new URLSearchParams({ symbol: ticker, from, to, token: apiKey })
  const res = await fetch(`${FINNHUB_NEWS}?${params}`)
  if (!res.ok) throw new Error(`Finnhub news HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data.length : null
}

export async function fetchFinnhubNewsCounts(tickers: string[], apiKey: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const to = ymd(new Date())
  const from = ymd(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))

  for (const ticker of tickers) {
    try {
      const count = await fetchCount(ticker, apiKey, from, to)
      if (count !== null) out.set(ticker, count)
    } catch (err) {
      console.warn(`Finnhub news count failed for ${ticker}:`, (err as Error).message)
    }
    await new Promise(r => setTimeout(r, CALL_DELAY_MS))
  }
  return out
}
