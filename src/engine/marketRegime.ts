import type { TickerHistory } from '../types/indicator'
import type { MarketRegime, RegimeClass, RegimeInputs } from '../types/market'
import { computeEMA } from './indicatorEngine'
import { latestBar } from './historyUtils'

function latestEmaSignal(history: TickerHistory | undefined, period: number): boolean | null {
  if (!history || history.bars.length < period) return null

  const ema = computeEMA(history.bars, period).at(-1) ?? null
  const close = latestBar(history)?.close ?? null

  if (ema === null || close === null) return null

  return close >= ema
}

export function deriveRegimeInputsFromHistories(histories: Record<string, TickerHistory>): RegimeInputs {
  const spyHistory = histories.SPY ?? histories.VOO

  return {
    spyAboveEma50: latestEmaSignal(spyHistory, 50),
    qqqAboveEma50: latestEmaSignal(histories.QQQ, 50),
    vixLevel: latestBar(histories['^VIX'])?.close ?? null,
    hkMarketAboveEma40w: latestEmaSignal(histories['2800.HK'], 200),
    goldAboveEma40w: latestEmaSignal(histories.GLD, 200),
    rspAboveEma50: latestEmaSignal(histories.RSP, 50)
  }
}

export function computeProxyWeakBreadth(inputs: RegimeInputs): boolean {
  return inputs.spyAboveEma50 === true && inputs.rspAboveEma50 === false
}

export function classifyMarketRegime(inputs: RegimeInputs): MarketRegime {
  const bearishSignals = [
    inputs.spyAboveEma50 === false,
    inputs.qqqAboveEma50 === false,
    inputs.hkMarketAboveEma40w === false
  ].filter(Boolean).length

  if ((inputs.vixLevel !== null && inputs.vixLevel > 28) || bearishSignals >= 2) {
    return 'RISK_OFF'
  }

  if (
    inputs.vixLevel !== null &&
    inputs.vixLevel < 22 &&
    inputs.spyAboveEma50 === true &&
    inputs.qqqAboveEma50 === true
  ) {
    return 'RISK_ON'
  }

  return 'NEUTRAL'
}

export function classifyRegime(inputs: RegimeInputs): RegimeClass {
  const regime = classifyMarketRegime(inputs)

  if (regime === 'RISK_ON') return 'long_friendly'
  if (regime === 'RISK_OFF') return 'short_friendly'
  return 'neutral'
}
