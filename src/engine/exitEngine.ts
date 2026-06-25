import type { Position } from '../types/capital'
import { checkExitRules } from './riskEngine'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExitCard = {
  ticker: string
  positionId: number
  action: 'SELL' | 'REDUCE'
  qtyToClose: number
  currentPriceCents: number
  ruleDescription: string
  ruleDetail: string
  pnlCents: number       // signed (negative = loss)
  returnPct: number      // signed decimal, e.g. -0.12
}

export type PeakUpdate = {
  positionId: number
  ticker: string
  newPeakPriceCents: number
}

export type SectorRow = {
  sector: string
  valueCents: number
  pct: number            // fraction of capitalBaseCents
  overweight: boolean
}

export type EodResult = {
  exitCards: ExitCard[]
  peakUpdates: PeakUpdate[]
  sectors: SectorRow[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SECTOR_LIMIT_PCT = 0.25

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * EOD exit evaluation — pure function, no DB, no network.
 *
 * 1. Checks each position for hard-stop / trailing-stop trigger.
 * 2. Detects sector overweight (> 25% of capitalBaseCents) and emits REDUCE cards.
 * 3. Returns new peak prices for positions that made a new high.
 *
 * Positions already flagged for SELL are excluded from sector overweight calculation.
 */
export function runEodExit(
  positions: Position[],
  priceMap: Record<string, number>,   // ticker → cents
  capitalBaseCents: number,
): EodResult {
  const exitCards: ExitCard[] = []
  const peakUpdates: PeakUpdate[] = []
  const closingIds = new Set<number>()

  // ── 1. Stop-trigger check ──────────────────────────────────────────────────
  for (const pos of positions) {
    const currentPrice = priceMap[pos.ticker]
    if (currentPrice === undefined) continue

    if (currentPrice > pos.peakPriceCents) {
      peakUpdates.push({
        positionId: pos.id,
        ticker: pos.ticker,
        newPeakPriceCents: currentPrice,
      })
    }

    const signal = checkExitRules(pos, currentPrice)
    if (signal.shouldExit) {
      closingIds.add(pos.id)
      const v = signal.violations[0]
      exitCards.push({
        ticker: pos.ticker,
        positionId: pos.id,
        action: 'SELL',
        qtyToClose: pos.qty,
        currentPriceCents: currentPrice,
        ruleDescription: v.description,
        ruleDetail: v.detail,
        pnlCents: (currentPrice - pos.avgCostCents) * pos.qty,
        returnPct: (currentPrice - pos.avgCostCents) / pos.avgCostCents,
      })
    }
  }

  // ── 2. Sector overweight check (skip positions already being closed) ────────
  const sectorMap: Record<string, { cents: number; positions: Position[] }> = {}
  for (const pos of positions) {
    if (closingIds.has(pos.id)) continue
    const price = priceMap[pos.ticker] ?? pos.avgCostCents
    const val = price * pos.qty
    if (!sectorMap[pos.sector]) sectorMap[pos.sector] = { cents: 0, positions: [] }
    sectorMap[pos.sector].cents += val
    sectorMap[pos.sector].positions.push(pos)
  }

  const sectors: SectorRow[] = []
  for (const [sector, { cents, positions: sPos }] of Object.entries(sectorMap)) {
    const pct = capitalBaseCents > 0 ? cents / capitalBaseCents : 0
    const overweight = pct > SECTOR_LIMIT_PCT
    sectors.push({ sector, valueCents: cents, pct, overweight })

    if (overweight) {
      const excessCents = cents - Math.round(capitalBaseCents * SECTOR_LIMIT_PCT)
      // Reduce the largest position in the sector first
      const target = [...sPos].sort((a, b) => {
        const va = (priceMap[a.ticker] ?? a.avgCostCents) * a.qty
        const vb = (priceMap[b.ticker] ?? b.avgCostCents) * b.qty
        return vb - va
      })[0]

      if (target) {
        const price = priceMap[target.ticker] ?? target.avgCostCents
        const qtyToClose = Math.min(Math.ceil(excessCents / price), target.qty)
        exitCards.push({
          ticker: target.ticker,
          positionId: target.id,
          action: 'REDUCE',
          qtyToClose,
          currentPriceCents: price,
          ruleDescription: '板塊超限 25%',
          ruleDetail: `${sector} 板塊 ${fmtPct(pct)} > 上限 ${fmtPct(SECTOR_LIMIT_PCT)}，需減持約 $${fmtDollar(excessCents)}`,
          pnlCents: (price - target.avgCostCents) * qtyToClose,
          returnPct: (price - target.avgCostCents) / target.avgCostCents,
        })
      }
    }
  }

  return { exitCards, peakUpdates, sectors }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPct(r: number): string { return `${(r * 100).toFixed(1)}%` }
function fmtDollar(cents: number): string { return (cents / 100).toFixed(0) }
