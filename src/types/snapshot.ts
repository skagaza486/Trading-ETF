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
  marketCap?: number     // USD market cap from Yahoo quote; absent from Worker-cron snapshots
}

export type SectorTrajectoryPoint = {
  rs: number
  thrust: number
}

export type SectorSnapshotEntry = {
  sectorZh: string
  sector: string
  count: number
  trend20d: number[]
  trajectory20d: SectorTrajectoryPoint[]
}

export type LiquiditySlope = 'expanding' | 'flat' | 'contracting'

export type LiquidityNote = {
  slope: LiquiditySlope
  netLiquidityB: number   // Fed net liquidity in $B (WALCL − TGA − RRP)
  change4wB: number       // 4-week change in $B (positive = expanding)
  asOf: string            // YYYY-MM-DD of latest FRED observation
}

export type DailySnapshot = {
  generatedAt: string    // ISO datetime
  date: string           // YYYY-MM-DD signal date
  regime: RegimeClass
  proxyWeakBreadth: boolean
  stocks: StockSnapshotEntry[]
  sectors?: SectorSnapshotEntry[]
  liquidityNote?: LiquidityNote  // FRED net liquidity note; absent if key not set
}
