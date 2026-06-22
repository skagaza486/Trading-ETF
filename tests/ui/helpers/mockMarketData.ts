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

const MOCK_INDICATORS = {
  close: 192.0, low: 190.0,
  ema20: 191.0, ema50: 185.0, ema200: 170.0,
  ema20Slope: 0.05, ema50Slope: 0.03,
  rsi14: 52, macdHistogram: 0.2, rvol: 0.85,
  cmf20: 0.05, obvSlope: 0.01, clv: 0.65,
  atrSlope50: -0.01, rvolRecentAvg10: 0.8,
  breakout20d: false, breakdown20d: false,
  relStrengthVsSpy: 0.03, atr: 3.5,
  aboveEma200: true, nearHigh52w: true,
  recentPullbackNearEma20: true,
  lowRvolDaysInWindow: 2, atrCompressing: false,
  priorBaseStreak: null, pullbackRvolAvg: 0.8,
  rsiSlope3: 2.0, ema150: 180.0, adx14: 22,
  udVolRatio50: 1.1, nr7: null, extendedFromPivot: false,
  rsLine: null, rsLineEma50: null, rsLineAboveEma: null, rsLineNewHigh120d: null,
}

export function buildSnapshotPayload() {
  return {
    generatedAt: new Date().toISOString(),
    date: '2026-06-22',
    regime: 'long_friendly',
    proxyWeakBreadth: false,
    stocks: [
      {
        ticker: 'AAPL', name: 'Apple Inc', sector: 'Technology', tier: 1,
        prevClose: 190.0, recentClose: [192.0, 191.0, 190.0, 189.0, 188.0],
        label: 'LONG_BOUNCE', previousLabel: 'WATCH',
        researchFlags: [], indicators: MOCK_INDICATORS,
        regime: 'long_friendly', earningsWithinWindow: false,
        reason: 'Bounce from EMA20', rsRank: 75,
      },
      {
        ticker: 'MSFT', name: 'Microsoft Corp', sector: 'Technology', tier: 1,
        prevClose: 420.0, recentClose: [422.0, 421.0, 420.0, 419.0, 418.0],
        label: 'LONG_BASE', previousLabel: 'LONG_BASE',
        researchFlags: [], indicators: { ...MOCK_INDICATORS, close: 422.0, low: 418.0 },
        regime: 'long_friendly', earningsWithinWindow: false,
        reason: 'Base building', rsRank: 65,
      },
    ],
    sectors: [],
  }
}

export function buildSignalStatsPayload() {
  return {
    since: '2026-03-22',
    days: 90,
    stats: [
      { label: 'LONG_BOUNCE', n: 45, avg_ret5d: 1.57, avg_ret10d: 2.1, avg_vs_spy: 1.09, win_rate: 64, avg_mfe5d: 3.2, avg_mae5d: -1.8 },
      { label: 'LONG_BREAK',  n: 12, avg_ret5d: 2.5,  avg_ret10d: 3.8, avg_vs_spy: 2.3,  win_rate: 67, avg_mfe5d: 4.1, avg_mae5d: -1.2 },
      { label: 'LONG_VCP',   n: 8,  avg_ret5d: 0.54, avg_ret10d: 1.1, avg_vs_spy: 0.34, win_rate: 52, avg_mfe5d: 2.0, avg_mae5d: -1.5 },
    ],
  }
}

export function buildSignalBreadthPayload() {
  const rows = Array.from({ length: 20 }, (_, i) => {
    const d = new Date('2026-06-02')
    d.setDate(d.getDate() + i)
    return {
      date: d.toISOString().slice(0, 10),
      strong_bull: 8 + (i % 5),
      base: 15 + (i % 3),
      bear: 3 + (i % 4),
      total: 294,
    }
  })
  return { since: '2026-05-22', days: 30, rows }
}

export function buildPerfByPeriodPayload(label = 'LONG_BOUNCE') {
  return {
    label,
    periods: [
      { period: '2026-06', n: 12, avg_ret5d: 1.8, avg_vs_spy: 1.2, win_rate: 67, avg_mfe5d: 3.5, avg_mae5d: -1.6 },
      { period: '2026-05', n: 18, avg_ret5d: 1.4, avg_vs_spy: 0.9, win_rate: 61, avg_mfe5d: 3.0, avg_mae5d: -1.9 },
      { period: '2026-04', n: 14, avg_ret5d: 0.9, avg_vs_spy: 0.5, win_rate: 57, avg_mfe5d: 2.8, avg_mae5d: -2.1 },
    ],
  }
}
