import { useState, useEffect, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────

export type PositionTier = 'ETF' | 'Core' | 'Tactical'

export type PortfolioPosition = {
  id: string // crypto.randomUUID()
  ticker: string
  name: string
  tier: PositionTier
  shares: number
  entryPrice: number // HKD per share
  entryDate: string // YYYY-MM-DD
  stopLoss: number | null // absolute price level; null = no stop set
  notes: string
}

export type JournalAction = 'BUY' | 'SELL' | 'CLOSE'

export type JournalEntry = {
  id: string
  date: string // YYYY-MM-DD
  ticker: string
  action: JournalAction
  shares: number
  price: number // HKD per share
  reason: string // mandatory — process discipline per EXECUTION_PLAN §11
  exitConditions: string // optional free-text exit plan
}

// ── Paper P&L Tracker (T2.10) ────────────────────────────────────────

export type PaperPosition = {
  id: string
  ticker: string
  name: string
  signalDate: string // YYYY-MM-DD — when the signal was generated
  signalLabel: string // LONG_BREAK / LONG_VCP / LONG_BOUNCE
  entryPrice: number // paper entry at next open
  entryDate: string // YYYY-MM-DD
  shares: number // paper shares
  stopLoss: number | null // absolute price
  exitPrice: number | null // set when closed; null = still open
  exitDate: string | null
  exitReason: string
  notes: string
}

export type PortfolioData = {
  positions: PortfolioPosition[]
  journal: JournalEntry[]
  paperPositions: PaperPosition[]
}

// Risk limits from EXECUTION_PLAN §2
export const RISK_LIMITS = {
  maxSingleStockHKD: 50_000,
  maxSingleSectorPct: 0.25,
  maxPositions: 15,
  hardStopPct: -0.10,
  trailingStopPct: -0.20,
  minCashPct: { RISK_ON: 0.05, NEUTRAL: 0.15, RISK_OFF: 0.30 },
  maxNewPerMonth: 4,
  consecutiveLossPause: 3,
}

const STORAGE_KEY = 'portfolio_v2'

// ── Helpers ──────────────────────────────────────────────────────────

function loadFromStorage(): PortfolioData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    // migrate v1 → v2 (add paperPositions)
    if (!raw) {
      const v1Raw = localStorage.getItem('portfolio_v1')
      if (v1Raw) {
        const v1 = JSON.parse(v1Raw)
        return { positions: v1.positions ?? [], journal: v1.journal ?? [], paperPositions: [] }
      }
      return { positions: [], journal: [], paperPositions: [] }
    }
    const parsed = JSON.parse(raw) as PortfolioData
    return {
      positions: Array.isArray(parsed.positions) ? parsed.positions : [],
      journal: Array.isArray(parsed.journal) ? parsed.journal : [],
      paperPositions: Array.isArray(parsed.paperPositions) ? parsed.paperPositions : [],
    }
  } catch {
    return { positions: [], journal: [], paperPositions: [] }
  }
}

function saveToStorage(data: PortfolioData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // localStorage full — silently degrade
  }
}

// ── Hook ─────────────────────────────────────────────────────────────

export function usePortfolioStore() {
  const [data, setData] = useState<PortfolioData>(() => loadFromStorage())

  // Persist on every change
  useEffect(() => {
    saveToStorage(data)
  }, [data])

  // ── Position CRUD ──────────────────────────────────────────────────

  const addPosition = useCallback((pos: Omit<PortfolioPosition, 'id'>) => {
    const id = crypto.randomUUID()
    setData(prev => ({
      ...prev,
      positions: [...prev.positions, { ...pos, id }],
    }))
    return id
  }, [])

  const updatePosition = useCallback((id: string, patch: Partial<Omit<PortfolioPosition, 'id'>>) => {
    setData(prev => ({
      ...prev,
      positions: prev.positions.map(p => (p.id === id ? { ...p, ...patch } : p)),
    }))
  }, [])

  const removePosition = useCallback((id: string) => {
    setData(prev => ({
      ...prev,
      positions: prev.positions.filter(p => p.id !== id),
    }))
  }, [])

  // ── Journal CRUD ───────────────────────────────────────────────────

  const addJournalEntry = useCallback((entry: Omit<JournalEntry, 'id'>) => {
    const id = crypto.randomUUID()
    setData(prev => ({
      ...prev,
      journal: [{ ...entry, id }, ...prev.journal],
    }))
    return id
  }, [])

  const removeJournalEntry = useCallback((id: string) => {
    setData(prev => ({
      ...prev,
      journal: prev.journal.filter(e => e.id !== id),
    }))
  }, [])

  // ── Paper P&L CRUD (T2.10) ─────────────────────────────────────

  const addPaperPosition = useCallback((pp: Omit<PaperPosition, 'id'>) => {
    const id = crypto.randomUUID()
    setData(prev => ({
      ...prev,
      paperPositions: [{ ...pp, id }, ...prev.paperPositions],
    }))
    return id
  }, [])

  const updatePaperPosition = useCallback((id: string, patch: Partial<Omit<PaperPosition, 'id'>>) => {
    setData(prev => ({
      ...prev,
      paperPositions: prev.paperPositions.map(p => (p.id === id ? { ...p, ...patch } : p)),
    }))
  }, [])

  const removePaperPosition = useCallback((id: string) => {
    setData(prev => ({
      ...prev,
      paperPositions: prev.paperPositions.filter(p => p.id !== id),
    }))
  }, [])

  // ── Derived ────────────────────────────────────────────────────

  const positionsByTier = useCallback(() => {
    const map: Record<PositionTier, PortfolioPosition[]> = { ETF: [], Core: [], Tactical: [] }
    data.positions.forEach(p => map[p.tier].push(p))
    return map
  }, [data.positions])

  const sectorAllocation = useCallback((sectorMap: Record<string, string>): Record<string, number> => {
    // sectorMap: ticker → sector name (from snapshot)
    const alloc: Record<string, number> = {}
    data.positions.forEach(p => {
      const sector = sectorMap[p.ticker] ?? 'Unknown'
      const value = p.shares * p.entryPrice // book value for allocation check
      alloc[sector] = (alloc[sector] ?? 0) + value
    })
    return alloc
  }, [data.positions])

  return {
    positions: data.positions,
    journal: data.journal,
    paperPositions: data.paperPositions,
    addPosition,
    updatePosition,
    removePosition,
    addJournalEntry,
    removeJournalEntry,
    addPaperPosition,
    updatePaperPosition,
    removePaperPosition,
    positionsByTier,
    sectorAllocation,
  }
}
