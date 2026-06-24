import { useState, useEffect, useCallback } from 'react'
import { type PortfolioConfig, DEFAULT_CONFIG, BUILTIN_PRESETS } from './portfolioConfig'

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
  etfTargets: ETFTarget[]
  config: PortfolioConfig
}

// ETF Target Allocation
export type ETFTarget = {
  id: string
  ticker: string
  name: string
  allocationPct: number // e.g. 40 for 40%
  sleeve: string // role label: 核心 / 增長 / 收入 / 小型 / 避險 / 現金
}

const DEFAULT_ETF_TARGETS: ETFTarget[] = [
  { id: 'etf-default-spy', ticker: 'SPY', name: 'S&P 500', allocationPct: 35, sleeve: '核心' },
  { id: 'etf-default-qqq', ticker: 'QQQ', name: 'Nasdaq 100', allocationPct: 15, sleeve: '增長' },
  { id: 'etf-default-jepq', ticker: 'JEPQ', name: 'JPM Nasdaq Equity Premium Inc', allocationPct: 10, sleeve: '收入' },
  { id: 'etf-default-iwm', ticker: 'IWM', name: 'Russell 2000', allocationPct: 15, sleeve: '小型' },
  { id: 'etf-default-gld', ticker: 'GLD', name: 'Gold', allocationPct: 10, sleeve: '避險' },
  { id: 'etf-default-sgov', ticker: 'SGOV', name: 'T-Bills 0-3M', allocationPct: 10, sleeve: '現金' },
]

const STORAGE_KEY = 'portfolio_v3'

// ── Helpers ──────────────────────────────────────────────────────────

function loadFromStorage(): PortfolioData {
  const base: PortfolioData = {
    positions: [], journal: [], paperPositions: [],
    etfTargets: DEFAULT_ETF_TARGETS, config: DEFAULT_CONFIG,
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
      // migrate v2 → v3 (add config) then v1 → v2 (add paperPositions)
      ?? localStorage.getItem('portfolio_v2')
      ?? localStorage.getItem('portfolio_v1')
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<PortfolioData>
    return {
      positions: Array.isArray(parsed.positions) ? parsed.positions : [],
      journal: Array.isArray(parsed.journal) ? parsed.journal : [],
      paperPositions: Array.isArray(parsed.paperPositions) ? parsed.paperPositions : [],
      etfTargets: Array.isArray(parsed.etfTargets) && parsed.etfTargets.length > 0 ? parsed.etfTargets : DEFAULT_ETF_TARGETS,
      config: resolveConfig(parsed.config),
    }
  } catch {
    return base
  }
}

function isValidConfig(c: unknown): c is PortfolioConfig {
  return !!c && typeof c === 'object'
    && typeof (c as PortfolioConfig).capitalBase === 'number'
    && !!(c as PortfolioConfig).risk
}

// Built-in presets always reflect the latest code (so HKD→USD, rule tweaks,
// etc. propagate to existing localStorage). Only 'custom' configs are kept
// verbatim from storage.
function resolveConfig(stored: unknown): PortfolioConfig {
  if (!isValidConfig(stored)) return DEFAULT_CONFIG
  if (stored.presetId === 'custom') return stored
  return BUILTIN_PRESETS.find(p => p.presetId === stored.presetId) ?? DEFAULT_CONFIG
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

  // ── ETF Targets CRUD ──────────────────────────────────────────────

  const addEtfTarget = useCallback((target: Omit<ETFTarget, 'id'>) => {
    const id = crypto.randomUUID()
    setData(prev => ({
      ...prev,
      etfTargets: [...prev.etfTargets, { ...target, id }],
    }))
    return id
  }, [])

  const updateEtfTarget = useCallback((id: string, patch: Partial<Omit<ETFTarget, 'id'>>) => {
    setData(prev => ({
      ...prev,
      etfTargets: prev.etfTargets.map(t => (t.id === id ? { ...t, ...patch } : t)),
    }))
  }, [])

  const removeEtfTarget = useCallback((id: string) => {
    setData(prev => ({
      ...prev,
      etfTargets: prev.etfTargets.filter(t => t.id !== id),
    }))
  }, [])

  // ── Config / preset ────────────────────────────────────────────────

  const applyPreset = useCallback((presetId: string) => {
    const preset = BUILTIN_PRESETS.find(p => p.presetId === presetId)
    if (!preset) return
    setData(prev => ({ ...prev, config: { ...preset, risk: { ...preset.risk, minCashPct: { ...preset.risk.minCashPct } } } }))
  }, [])

  const updateConfig = useCallback((patch: Partial<PortfolioConfig>) => {
    setData(prev => ({
      ...prev,
      // any manual edit detaches from the named preset
      config: { ...prev.config, ...patch, presetId: 'custom', presetName: patch.presetName ?? 'Custom' },
    }))
  }, [])

  const updateRisk = useCallback((patch: Partial<PortfolioConfig['risk']>) => {
    setData(prev => ({
      ...prev,
      config: { ...prev.config, presetId: 'custom', presetName: 'Custom', risk: { ...prev.config.risk, ...patch } },
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
    etfTargets: data.etfTargets,
    config: data.config,
    applyPreset,
    updateConfig,
    updateRisk,
    addPosition,
    updatePosition,
    removePosition,
    addJournalEntry,
    removeJournalEntry,
    addPaperPosition,
    updatePaperPosition,
    removePaperPosition,
    addEtfTarget,
    updateEtfTarget,
    removeEtfTarget,
    positionsByTier,
    sectorAllocation,
  }
}
