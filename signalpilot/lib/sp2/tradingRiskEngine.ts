import type { OpenLotRow, RiskDecision } from './types'
import type { Sp2Policy } from './policy'

export function checkRisk(
  ticker: string,
  sector: string | null,
  openLots: OpenLotRow[],
  newPositionsToday: number,
  navCents: number,
  policy: Sp2Policy,
): RiskDecision {
  if (openLots.length >= policy.maxOpenPositions) {
    return { approved: false, code: 'MAX_POSITIONS_REACHED' }
  }
  if (newPositionsToday >= policy.maxNewPositionsPerDay) {
    return { approved: false, code: 'MAX_DAILY_ENTRIES_REACHED' }
  }
  if (sector && navCents > 0) {
    const sectorCostCents = openLots
      .filter(l => l.sector === sector)
      .reduce((sum, l) => sum + l.total_cost_cents, 0)
    const projectedPct = (sectorCostCents + policy.targetNotionalCents) / navCents
    if (projectedPct > policy.maxSectorExposurePct) {
      const sectorKey = sector.toUpperCase().replaceAll(' ', '_')
      return { approved: false, code: `SECTOR_CAP_${sectorKey}` }
    }
  }
  return { approved: true }
}
