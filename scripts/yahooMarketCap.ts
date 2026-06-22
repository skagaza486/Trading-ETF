/**
 * Fetches market caps from Yahoo Finance /v8/finance/quote.
 * Batches 80 tickers per request to stay within URL length limits.
 * Returns null values for tickers Yahoo can't resolve.
 *
 * Only called from build-snapshot.ts (GitHub Actions), not from the Worker,
 * so subrequest limits are not a concern.
 */

const YAHOO_QUOTE = 'https://query1.finance.yahoo.com/v8/finance/quote'
const BATCH_SIZE = 80

type QuoteResult = {
  symbol: string
  regularMarketCap?: number
}

type QuoteResponse = {
  quoteResponse?: {
    result?: QuoteResult[]
    error?: unknown
  }
}

async function fetchBatch(tickers: string[]): Promise<Map<string, number>> {
  const params = new URLSearchParams({
    symbols: tickers.join(','),
    fields: 'regularMarketCap',
    formatted: 'false',
  })
  const res = await fetch(`${YAHOO_QUOTE}?${params}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`Yahoo quote HTTP ${res.status}`)
  const data = await res.json() as QuoteResponse
  const results = data.quoteResponse?.result ?? []
  const out = new Map<string, number>()
  for (const q of results) {
    if (q.regularMarketCap && q.regularMarketCap > 0) {
      out.set(q.symbol, q.regularMarketCap)
    }
  }
  return out
}

export async function fetchYahooMarketCaps(tickers: string[]): Promise<Map<string, number>> {
  const all = new Map<string, number>()
  const batches: string[][] = []
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    batches.push(tickers.slice(i, i + BATCH_SIZE))
  }
  for (const batch of batches) {
    try {
      const caps = await fetchBatch(batch)
      caps.forEach((v, k) => all.set(k, v))
    } catch (err) {
      console.warn('Yahoo market cap batch failed:', (err as Error).message)
    }
  }
  return all
}
