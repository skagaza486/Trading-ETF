import type { StockSnapshotEntry } from '../../../types/snapshot'
import { getStockMeta } from '../i18n/stockNames'

export type SectorLeadership = {
  sectorZh: string
  sector: string
  count: number
  bullish: number
  bearish: number
  bullishPct: number
  avgRs: number
  avgDayPct: number | null
  upgrades: number
  downgrades: number
  improvementScore: number
  leadershipScore: number
  topTicker: string
  leaders: StockSnapshotEntry[]
  stocks: StockSnapshotEntry[]
}

const BULL_LABELS = new Set(['LONG_BREAK', 'LONG_VCP', 'LONG_BOUNCE', 'LONG_BASE'])
const BEAR_LABELS = new Set(['SHORT_BREAK', 'SHORT_BASE', 'SHORT_WATCH', 'AVOID_CHOP'])

export function getStockDayPct(stock: StockSnapshotEntry) {
  const close = stock.indicators.close
  return stock.prevClose && stock.prevClose > 0
    ? ((close - stock.prevClose) / stock.prevClose) * 100
    : null
}

export function buildSectorLeadership(stocks: StockSnapshotEntry[]): SectorLeadership[] {
  const groups = new Map<string, { sector: string; stocks: StockSnapshotEntry[] }>()

  for (const stock of stocks) {
    const sectorZh = getStockMeta(stock.ticker, stock.name).sectorZh
    if (!groups.has(sectorZh)) groups.set(sectorZh, { sector: stock.sector, stocks: [] })
    groups.get(sectorZh)!.stocks.push(stock)
  }

  return Array.from(groups.entries())
    .map(([sectorZh, { sector, stocks: sectorStocks }]) => {
      const bullish = sectorStocks.filter(stock => BULL_LABELS.has(stock.label)).length
      const bearish = sectorStocks.filter(stock => BEAR_LABELS.has(stock.label)).length
      const bullishPct = sectorStocks.length ? (bullish / sectorStocks.length) * 100 : 0
      const rsValues = sectorStocks.map(stock => stock.rsRank ?? 50)
      const avgRs = rsValues.reduce((sum, value) => sum + value, 0) / rsValues.length
      const dayPcts = sectorStocks.map(getStockDayPct).filter((value): value is number => value !== null)
      const avgDayPct = dayPcts.length
        ? dayPcts.reduce((sum, value) => sum + value, 0) / dayPcts.length
        : null
      const upgrades = sectorStocks.filter(stock =>
        stock.previousLabel !== undefined &&
        stock.previousLabel !== stock.label &&
        BULL_LABELS.has(stock.label) &&
        !BULL_LABELS.has(stock.previousLabel)
      ).length
      const downgrades = sectorStocks.filter(stock =>
        stock.previousLabel !== undefined &&
        stock.previousLabel !== stock.label &&
        BEAR_LABELS.has(stock.label)
      ).length
      const improvementScore = ((upgrades - downgrades) / sectorStocks.length) * 100
      const leaders = [...sectorStocks]
        .sort((a, b) => (b.rsRank ?? 0) - (a.rsRank ?? 0))
        .slice(0, 3)

      // Density remains primary, while signal count prevents one-stock sectors
      // from being overstated and RS breaks otherwise similar groups.
      const leadershipScore = bullishPct + Math.log2(bullish + 1) * 5 + avgRs * 0.1

      return {
        sectorZh,
        sector,
        count: sectorStocks.length,
        bullish,
        bearish,
        bullishPct,
        avgRs,
        avgDayPct,
        upgrades,
        downgrades,
        improvementScore,
        leadershipScore,
        topTicker: leaders[0]?.ticker ?? '',
        leaders,
        stocks: sectorStocks,
      }
    })
    .sort((a, b) => b.leadershipScore - a.leadershipScore)
}
