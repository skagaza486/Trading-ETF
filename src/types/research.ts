import type { RegimeClass, StockSignalLabel } from './signal'

export type ForwardReturnRecord = {
  signalDate: string
  ticker: string
  label: StockSignalLabel
  closeAtSignal: number
  ret1d: number | null
  ret3d: number | null
  ret5d: number | null
  ret10d: number | null
  ret5dVsSpy: number | null
  ret10dVsSpy: number | null
  mfe5d: number | null
  mfe10d: number | null
  mae5d: number | null
  mae10d: number | null
  earningsInWindow: boolean
  regimeAtSignal: RegimeClass
  rvolAtSignal: number | null
  atrAtSignal: number | null
  suggestedStopLoss: number | null
  stopLossHit: boolean | null
}
