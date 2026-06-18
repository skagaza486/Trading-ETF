type QuoteSeries = {
  open: Array<number | null>
  high: Array<number | null>
  low: Array<number | null>
  close: Array<number | null>
  volume: Array<number | null>
}

type TickerProfile = {
  base: number
  drift: number
  wave: number
  volume: number
}

const PROFILE_OVERRIDES: Record<string, TickerProfile> = {
  SPY: { base: 520, drift: 0.0012, wave: 4.6, volume: 92_000_000 },
  QQQ: { base: 458, drift: 0.0016, wave: 5.8, volume: 74_000_000 },
  IWM: { base: 214, drift: 0.0007, wave: 3.2, volume: 31_000_000 },
  RSP: { base: 172, drift: 0.0008, wave: 2.3, volume: 12_000_000 },
  GLD: { base: 224, drift: 0.0005, wave: 1.8, volume: 10_000_000 },
  SGOV: { base: 100.2, drift: 0.00005, wave: 0.04, volume: 4_000_000 },
  '^VIX': { base: 17.2, drift: -0.0004, wave: 1.9, volume: 0 },
  '2800.HK': { base: 18.8, drift: 0.0004, wave: 0.4, volume: 6_000_000 }
}

function hashTicker(ticker: string): number {
  return [...ticker].reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 3), 0)
}

function defaultProfile(ticker: string): TickerProfile {
  const seed = hashTicker(ticker)
  const isInverse = ticker.startsWith('S') || ticker.includes('SHORT') || ticker === 'TZA'
  return {
    base: 24 + (seed % 240),
    drift: isInverse ? -0.0007 : 0.0009 - (seed % 5) * 0.00018,
    wave: 0.8 + (seed % 7) * 0.55,
    volume: 1_500_000 + (seed % 18) * 550_000
  }
}

function buildBars(ticker: string, count = 320): {
  timestamps: number[]
  quote: QuoteSeries
  adjclose: number[]
} {
  const profile = PROFILE_OVERRIDES[ticker] ?? defaultProfile(ticker)
  const start = Date.UTC(2024, 0, 2)
  const timestamps: number[] = []
  const quote: QuoteSeries = { open: [], high: [], low: [], close: [], volume: [] }
  const adjclose: number[] = []

  let dayCursor = 0
  let barIndex = 0
  let previousClose = profile.base

  while (barIndex < count) {
    const date = new Date(start + dayCursor * 24 * 60 * 60 * 1000)
    dayCursor += 1

    const weekday = date.getUTCDay()
    if (weekday === 0 || weekday === 6) continue

    const swing = Math.sin(barIndex / 8) * profile.wave
    const drifted = previousClose * (1 + profile.drift)
    const close = Math.max(2, drifted + swing)
    const open = previousClose * (1 + Math.sin(barIndex / 11) * 0.0025)
    const high = Math.max(open, close) * 1.006
    const low = Math.min(open, close) * 0.994
    const volume = Math.round(profile.volume * (1 + ((barIndex % 9) - 4) * 0.035))

    timestamps.push(Math.floor(date.getTime() / 1000))
    quote.open.push(Number(open.toFixed(2)))
    quote.high.push(Number(high.toFixed(2)))
    quote.low.push(Number(low.toFixed(2)))
    quote.close.push(Number(close.toFixed(2)))
    quote.volume.push(volume)
    adjclose.push(Number(close.toFixed(2)))

    previousClose = close
    barIndex += 1
  }

  return { timestamps, quote, adjclose }
}

export function buildYahooChartPayload(ticker: string) {
  const bars = buildBars(ticker)
  const closes = bars.quote.close.filter((value): value is number => value !== null)
  const regularMarketPrice = closes[closes.length - 1]
  const previousClose = closes[closes.length - 2] ?? regularMarketPrice

  return {
    chart: {
      result: [
        {
          meta: {
            regularMarketPrice,
            chartPreviousClose: previousClose,
            previousClose
          },
          timestamp: bars.timestamps,
          indicators: {
            quote: [bars.quote],
            adjclose: [{ adjclose: bars.adjclose }]
          }
        }
      ],
      error: null
    }
  }
}

export function buildFinnhubPayload(symbol: string) {
  const date = symbol === 'NVDA' ? '2026-08-23' : symbol === 'AAPL' ? '2026-08-29' : null

  return {
    earningsCalendar: date ? [{ symbol, date }] : []
  }
}
