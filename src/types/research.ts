import type { RegimeClass, ResearchFlag, StockSignalLabel } from './signal'

export type ForwardReturnRecord = {
  signalDate: string
  ticker: string
  label: StockSignalLabel
  closeAtSignal: number
  nextOpen: number | null
  ret1d: number | null
  ret3d: number | null
  ret5d: number | null
  ret10d: number | null
  ret5dVsSpy: number | null
  ret10dVsSpy: number | null
  // Medium-term horizons (trading-day based: 1m=21, 3m=63, 6m=126, 12m=252 td).
  // Settle months after the signal; stay null until outcome bars land. See EXECUTION_PLAN §9.
  ret1m: number | null
  ret3m: number | null
  ret6m: number | null
  ret12m: number | null
  ret1mVsSpy: number | null
  ret3mVsSpy: number | null
  ret6mVsSpy: number | null
  ret12mVsSpy: number | null
  mfe5d: number | null
  mfe10d: number | null
  mae5d: number | null
  mae10d: number | null
  earningsInWindow: boolean
  regimeAtSignal: RegimeClass
  researchFlags: ResearchFlag[]
  rvolAtSignal: number | null
  atrAtSignal: number | null
  suggestedStopLoss: number | null
  stopLossHit: boolean | null
}
