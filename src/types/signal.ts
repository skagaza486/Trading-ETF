export type ETFLabel = 'FAVOUR' | 'WATCH' | 'WAIT' | 'AVOID' | 'REVIEW'

export type LongSignalLabel =
  | 'WATCH'
  | 'LONG_BASE'
  | 'LONG_VCP'
  | 'LONG_BOUNCE'
  | 'LONG_BREAK'

export type ShortSignalLabel =
  | 'SHORT_WATCH'
  | 'SHORT_BASE'
  | 'SHORT_BREAK'

export type NeutralSignalLabel =
  | 'NEUTRAL'
  | 'AVOID_CHOP'
  | 'REVIEW_DATA'
  | 'REVIEW_EVENT'

export type StockSignalLabel =
  | LongSignalLabel
  | ShortSignalLabel
  | NeutralSignalLabel

export type ResearchFlag =
  | 'BASE_BREAK'
  | 'DISTRIBUTION_WARNING'

export type ETFRecommendation = {
  ticker: string
  label: ETFLabel
  weekEndingDate: string
  indicators: ETFIndicatorSnapshot
  reason: string
}

export type StockSignal = {
  ticker: string
  signalDate: string
  label: StockSignalLabel
  previousLabel?: StockSignalLabel
  researchFlags: ResearchFlag[]
  indicators: StockIndicatorSnapshot
  regime: RegimeClass
  earningsWithinWindow: boolean
  reason: string
}

export type RegimeClass = 'long_friendly' | 'short_friendly' | 'neutral'

export type ETFIndicatorSnapshot = {
  return13w: number | null
  return26w: number | null
  priceVs10wMa: number | null
  priceVs40wMa: number | null
  relStrengthVsSpy: number | null
  rsSlope: number | null
  vixLevel: number | null
  rankScore: number | null
}

export type StockIndicatorSnapshot = {
  close: number
  low: number
  ema20: number | null
  ema50: number | null
  ema200: number | null
  ema20Slope: number | null
  ema50Slope: number | null
  rsi14: number | null
  macdHistogram: number | null
  rvol: number | null
  cmf20: number | null
  obvSlope: number | null
  clv: number | null
  atrSlope50: number | null
  rvolRecentAvg10: number | null
  breakout20d: boolean | null
  breakdown20d: boolean | null
  relStrengthVsSpy: number | null
  atr: number | null
  aboveEma200: boolean | null
  nearHigh52w: boolean | null
  recentPullbackNearEma20: boolean | null
  // Multi-bar context fields (HYP-016 to HYP-019)
  lowRvolDaysInWindow: number | null    // count of RVOL < 0.8 in last 10 bars (excl. today)
  atrCompressing: boolean | null        // ATR today < ATR 5 bars ago
  priorBaseStreak: number | null        // count of RVOL < 0.8 in last 5 bars (excl. today)
  pullbackRvolAvg: number | null        // avg RVOL during pullback bars (low ≤ EMA20×1.02)
  rsiSlope3: number | null              // RSI[today] − RSI[3 days ago]
  // Trend structure fields (HYP-020 to HYP-022)
  ema150: number | null                 // EMA(150) — Minervini Stage 2 middle MA layer
  adx14: number | null                  // ADX(14) — trend strength (>25 = trending)
  udVolRatio50: number | null           // up-day vol / down-day vol over last 50 bars — net accumulation proxy
  nr7: boolean | null                   // today's high-low range is smallest of last 7 bars — volatility compression
  extendedFromPivot: boolean | null     // close >5% above 20d high — chasing risk flag
}
