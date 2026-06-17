export type RegimeInputs = {
  spyAboveEma50: boolean | null
  qqqAboveEma50: boolean | null
  vixLevel: number | null
  hkMarketAboveEma40w: boolean | null
  goldAboveEma40w: boolean | null
}

export type MarketRegime = 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF'

export type RegimeClass = 'long_friendly' | 'short_friendly' | 'neutral'
