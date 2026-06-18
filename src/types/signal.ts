export type ETFLabel = 'FAVOUR' | 'WATCH' | 'WAIT' | 'AVOID' | 'REVIEW'

export type LongSignalLabel =
  | 'LONG_WATCH'
  | 'LONG_SETUP'
  | 'LONG_VCP'
  | 'LONG_PULLBACK'
  | 'LONG_CONFIRM'
  | 'UP_PROMOTION'

export type ShortSignalLabel =
  | 'SHORT_WATCH'
  | 'SHORT_SETUP'
  | 'SHORT_CONFIRM'
  | 'DOWN_PROMOTION'

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
}
