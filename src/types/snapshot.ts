import type { RegimeClass, ResearchFlag, StockSignalLabel, StockIndicatorSnapshot } from './signal'

export type StockSnapshotEntry = {
  ticker: string
  name: string
  sector: string
  tier: 1 | 2
  prevClose: number | null   // previous trading day's close
  recentClose: number[]      // last 5 closes, newest -> oldest
  label: StockSignalLabel
  previousLabel?: StockSignalLabel
  researchFlags: ResearchFlag[]
  indicators: StockIndicatorSnapshot
  regime: RegimeClass
  earningsWithinWindow: boolean
  reason: string
  rsRank: number | null  // percentile 0–100 of 126d return vs snapshot universe
}

export type DailySnapshot = {
  generatedAt: string    // ISO datetime
  date: string           // YYYY-MM-DD signal date
  regime: RegimeClass
  proxyWeakBreadth: boolean
  stocks: StockSnapshotEntry[]
}
