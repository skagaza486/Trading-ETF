export type IndicatorSource = 'AUTO' | 'MANUAL'

export type RegimeInputs = {
  vixLevel: number | null
  vixSource: IndicatorSource
  sp500Above200Ma: boolean | null
  sp500Source: IndicatorSource
  hkMarketAbove200Ma: boolean | null
  hkMarketSource: IndicatorSource
  goldAbove200Ma: boolean | null
  goldSource: IndicatorSource
  creditSpreadWidening: boolean | null
  creditSpreadSource: IndicatorSource
  inflationRising: boolean | null
  inflationSource: IndicatorSource
}

export type MarketRegime = 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF'
