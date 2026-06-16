import type { ETFWithPrice } from '../types/etf'
import type { MarketRegime, RegimeInputs } from '../types/market'

function isAbove200Ma(etf: ETFWithPrice | undefined): boolean | null {
  if (!etf?.priceData) return null
  return etf.priceData.currentPrice >= etf.priceData.movingAverage200
}

export function deriveRegimeInputs(etfs: ETFWithPrice[]): RegimeInputs {
  const byTicker = new Map(etfs.map(etf => [etf.ticker, etf]))

  return {
    vixLevel: byTicker.get('^VIX')?.priceData?.currentPrice ?? null,
    vixSource: 'AUTO',
    sp500Above200Ma: isAbove200Ma(byTicker.get('VOO')),
    sp500Source: 'AUTO',
    hkMarketAbove200Ma: isAbove200Ma(byTicker.get('2800.HK')),
    hkMarketSource: 'AUTO',
    goldAbove200Ma: isAbove200Ma(byTicker.get('GLD')) ?? isAbove200Ma(byTicker.get('2840.HK')),
    goldSource: 'AUTO',
    creditSpreadWidening: null,
    creditSpreadSource: 'MANUAL',
    inflationRising: null,
    inflationSource: 'MANUAL'
  }
}

export function classifyMarketRegime(inputs: RegimeInputs): MarketRegime {
  if (inputs.vixLevel !== null && inputs.vixLevel > 25) return 'RISK_OFF'
  if (inputs.sp500Above200Ma === false) return 'RISK_OFF'
  if (inputs.vixLevel !== null && inputs.vixLevel < 18 && inputs.sp500Above200Ma) return 'RISK_ON'
  return 'NEUTRAL'
}

export function getAddBlockers(input: {
  etf: ETFWithPrice
  regimeInputs: RegimeInputs
  regime: MarketRegime
}): string[] {
  const blockers: string[] = []
  const category = input.etf.category

  if (
    input.regime === 'RISK_OFF' &&
    ['US_EQUITY_CORE', 'SECTOR', 'HK_CHINA', 'HY_BOND', 'INTL_EQUITY'].includes(category)
  ) {
    blockers.push('RISK_OFF_REGIME')
  }

  if (input.regimeInputs.creditSpreadWidening && category === 'HY_BOND') {
    blockers.push('CREDIT_SPREAD_WIDENING')
  }

  if (input.regimeInputs.hkMarketAbove200Ma === false && category === 'HK_CHINA') {
    blockers.push('HK_TREND_WEAK')
  }

  return blockers
}
