import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSnapshot } from '../../../web/shared/hooks/useSnapshot'
import { useCapitalApi } from '../../shared/hooks/useCapitalApi'
import type { PaperTrade } from '../../../types/capital'
import styles from './PaperWallView.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const SECTORS = [
  'Technology', 'Healthcare', 'Financials', 'Consumer Discretionary',
  'Industrials', 'Energy', 'Materials', 'Utilities',
  'Real Estate', 'Communication Services', 'Consumer Staples',
]

// Paper wall pass criteria (REVAMP_PLAN §6)
const MIN_WEEKS = 4
const MIN_CANDIDATES_PER_WEEK = 3
const MAX_DRAWDOWN = -0.15  // -15%

// ── Date helpers ──────────────────────────────────────────────────────────────

function mondayOf(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function currentWeekStart(): string {
  return mondayOf(new Date())
}

function addWeeks(isoDate: string, n: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + n * 7)
  return d.toISOString().slice(0, 10)
}

function formatWeek(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00')
  const end = new Date(d)
  end.setDate(d.getDate() + 4)
  const mo = d.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })
  const fri = end.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })
  return `${mo} – ${fri}`
}

// ── Pass criteria logic ───────────────────────────────────────────────────────

type WeekGroup = {
  weekStart: string
  trades: PaperTrade[]
  regime: string  // most common regime this week
}

type CriteriaResult = {
  consecutiveWeeks: number
  weekCount: boolean        // ≥4 consecutive weeks
  minCandidates: boolean    // each week ≥3
  positiveReturn: boolean
  noDeepDrawdown: boolean
  hasNonRiskOn: boolean
  periodPnlPct: number | null
  worstDrawdown: number | null
  passed: boolean
}

function computeCriteria(groups: WeekGroup[]): CriteriaResult {
  // Sort weeks ascending
  const sorted = [...groups].sort((a, b) => a.weekStart.localeCompare(b.weekStart))

  // Find longest streak of consecutive weeks (no gap > 7 days)
  let maxStreak = 0
  let streak = sorted.length > 0 ? 1 : 0
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].weekStart
    const curr = sorted[i].weekStart
    const daysDiff = (new Date(curr).getTime() - new Date(prev).getTime()) / 86400000
    if (daysDiff <= 7) {
      streak++
    } else {
      maxStreak = Math.max(maxStreak, streak)
      streak = 1
    }
  }
  maxStreak = Math.max(maxStreak, streak)

  const weekCount = maxStreak >= MIN_WEEKS
  const minCandidates = sorted.every(g => g.trades.length >= MIN_CANDIDATES_PER_WEEK)

  // Period P&L: sum simulated pnl across all open trades that have a current price
  let totalCost = 0
  let totalValue = 0
  let hasAnyPriced = false
  let worstDrawdown = 0

  for (const group of sorted) {
    for (const t of group.trades) {
      const exitPrice = t.status === 'closed' ? (t.closedPriceCents ?? null) : t.currentPriceCents
      if (exitPrice !== null && t.entryPriceCents > 0) {
        totalCost += t.entryPriceCents
        totalValue += exitPrice
        hasAnyPriced = true
        const dd = (exitPrice - t.entryPriceCents) / t.entryPriceCents
        if (dd < worstDrawdown) worstDrawdown = dd
      }
    }
  }

  const periodPnlPct = hasAnyPriced ? (totalValue - totalCost) / totalCost : null
  const positiveReturn = periodPnlPct !== null ? periodPnlPct > 0 : false
  const noDeepDrawdown = worstDrawdown > MAX_DRAWDOWN
  const hasNonRiskOn = sorted.some(g => g.regime !== 'long_friendly')

  return {
    consecutiveWeeks: maxStreak,
    weekCount,
    minCandidates,
    positiveReturn,
    noDeepDrawdown,
    hasNonRiskOn,
    periodPnlPct,
    worstDrawdown: hasAnyPriced ? worstDrawdown : null,
    passed: weekCount && minCandidates && positiveReturn && noDeepDrawdown && hasNonRiskOn,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const REGIME_LABEL: Record<string, string> = {
  long_friendly: '偏多', neutral: '中性', short_friendly: '防守',
}

function fmtPct(r: number, signed = false): string {
  const s = signed && r > 0 ? '+' : ''
  return `${s}${(r * 100).toFixed(1)}%`
}

function fmtPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function pnlPct(entry: number, current: number): number {
  return (current - entry) / entry
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PaperWallView() {
  const { snapshot } = useSnapshot()
  const regime = snapshot?.regime ?? 'neutral'
  const api = useCapitalApi()

  const [trades, setTrades] = useState<PaperTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Price update inputs: id → dollar string
  const [priceInputs, setPriceInputs] = useState<Record<number, string>>({})

  // Add form
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({
    ticker: '',
    priceDollars: '',
    sector: SECTORS[0],
    weekStart: currentWeekStart(),
  })

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadTrades = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const fetched = await api.fetchPaperTrades()
      setTrades(fetched)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load paper trades')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { loadTrades() }, [loadTrades])

  // ── Grouping ──────────────────────────────────────────────────────────────

  const weekGroups = useMemo<WeekGroup[]>(() => {
    const map = new Map<string, PaperTrade[]>()
    for (const t of trades) {
      const arr = map.get(t.weekStart) ?? []
      arr.push(t)
      map.set(t.weekStart, arr)
    }
    return Array.from(map.entries())
      .map(([weekStart, wTrades]) => ({
        weekStart,
        trades: wTrades,
        regime: wTrades[0]?.regime ?? 'neutral',
      }))
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart)) // newest first
  }, [trades])

  const criteria = useMemo(() => computeCriteria(weekGroups), [weekGroups])

  const thisWeek = currentWeekStart()

  // ── Mutations ─────────────────────────────────────────────────────────────

  const addTrade = useCallback(async () => {
    const cents = Math.round((parseFloat(addForm.priceDollars) || 0) * 100)
    if (!addForm.ticker || cents <= 0) return
    try {
      const created = await api.addPaperTrade({
        ticker: addForm.ticker.toUpperCase(),
        weekStart: addForm.weekStart,
        entryPriceCents: cents,
        sector: addForm.sector,
        regime,
      })
      setTrades(prev => [created, ...prev])
      setAddForm(f => ({ ...f, ticker: '', priceDollars: '' }))
      setShowAdd(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add trade')
    }
  }, [addForm, regime, api])

  const savePrice = useCallback(async (id: number) => {
    const val = priceInputs[id]
    const cents = Math.round((parseFloat(val) || 0) * 100)
    if (cents <= 0) return
    try {
      const updated = await api.updatePaperTrade(id, { currentPriceCents: cents })
      setTrades(prev => prev.map(t => t.id === updated.id ? updated : t))
      setPriceInputs(p => { const n = { ...p }; delete n[id]; return n })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update price')
    }
  }, [priceInputs, api])

  const closeTrade = useCallback(async (id: number) => {
    const t = trades.find(x => x.id === id)
    const closePrice = t?.currentPriceCents ?? undefined
    try {
      const updated = await api.closePaperTrade(id, closePrice ?? undefined)
      setTrades(prev => prev.map(x => x.id === updated.id ? updated : x))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close trade')
    }
  }, [trades, api])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.view}>

      {/* ── Error banner ── */}
      {error && (
        <div className={styles.errorBanner}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* ── Header ── */}
      <div className={styles.header}>
        <span className={styles.title}>Paper 牆</span>
        <span className={`${styles.passBadge} ${criteria.passed ? styles.passed : styles.pending}`}>
          {criteria.passed ? '✓ 通過' : `${criteria.consecutiveWeeks}/${MIN_WEEKS} 週`}
        </span>
      </div>

      {/* ── Pass criteria card ── */}
      <div className={styles.criteriaCard}>
        <div className={styles.criteriaTitle}>通過條件</div>
        <div className={styles.criteriaList}>
          <CriteriaRow
            ok={criteria.weekCount}
            label={`≥${MIN_WEEKS} 連續週`}
            value={`${criteria.consecutiveWeeks} 週`}
          />
          <CriteriaRow
            ok={criteria.minCandidates}
            label={`每週 ≥${MIN_CANDIDATES_PER_WEEK} 候選`}
            value={weekGroups.every(g => g.trades.length >= MIN_CANDIDATES_PER_WEEK) ? '全部達標' : '有週不足'}
          />
          <CriteriaRow
            ok={criteria.positiveReturn}
            label="期間盈利"
            value={criteria.periodPnlPct !== null ? fmtPct(criteria.periodPnlPct, true) : '未報價'}
          />
          <CriteriaRow
            ok={criteria.noDeepDrawdown}
            label="單倉最大 −15%"
            value={criteria.worstDrawdown !== null ? fmtPct(criteria.worstDrawdown, true) : '未報價'}
          />
          <CriteriaRow
            ok={criteria.hasNonRiskOn}
            label="至少一週非偏多"
            value={criteria.hasNonRiskOn ? '已達標' : '全為偏多週'}
          />
        </div>
      </div>

      {loading && <div className={styles.emptyRow}>載入中…</div>}

      {/* ── This week section ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>本週 {formatWeek(thisWeek)}</span>
          <span className={`${styles.regimePill} ${styles['regime_' + regime]}`}>
            {REGIME_LABEL[regime]}
          </span>
          <button className={styles.addBtn} onClick={() => setShowAdd(v => !v)}>
            {showAdd ? '取消' : '＋ 加入候選'}
          </button>
        </div>

        {showAdd && (
          <div className={styles.addCard}>
            <div className={styles.addRow}>
              <input
                className={styles.addInput}
                placeholder="AAPL"
                value={addForm.ticker}
                onChange={e => setAddForm(f => ({ ...f, ticker: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addTrade()}
              />
              <div className={styles.priceWrap}>
                <span className={styles.dollar}>$</span>
                <input
                  className={styles.addInput}
                  type="number" min="0" step="0.01" placeholder="進場價"
                  value={addForm.priceDollars}
                  onChange={e => setAddForm(f => ({ ...f, priceDollars: e.target.value }))}
                />
              </div>
            </div>
            <div className={styles.addRow}>
              <select
                className={styles.addSelect}
                value={addForm.sector}
                onChange={e => setAddForm(f => ({ ...f, sector: e.target.value }))}
              >
                {SECTORS.map(s => <option key={s}>{s}</option>)}
              </select>
              <select
                className={styles.addSelect}
                value={addForm.weekStart}
                onChange={e => setAddForm(f => ({ ...f, weekStart: e.target.value }))}
                title="Week"
              >
                {/* Current week + 3 past weeks as options */}
                {[0, -1, -2, -3].map(offset => {
                  const ws = addWeeks(thisWeek, offset)
                  return <option key={ws} value={ws}>{formatWeek(ws)}</option>
                })}
              </select>
              <button className={styles.addSaveBtn} onClick={addTrade}>加入</button>
            </div>
          </div>
        )}

        <WeekTradeList
          trades={weekGroups.find(g => g.weekStart === thisWeek)?.trades ?? []}
          priceInputs={priceInputs}
          onPriceChange={(id, v) => setPriceInputs(p => ({ ...p, [id]: v }))}
          onSavePrice={savePrice}
          onClose={closeTrade}
          emptyMsg="本週尚無候選 — 按「＋ 加入候選」開始記錄"
        />
      </div>

      {/* ── Past weeks ── */}
      {weekGroups.filter(g => g.weekStart !== thisWeek).map(group => (
        <div key={group.weekStart} className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>{formatWeek(group.weekStart)}</span>
            <span className={`${styles.regimePill} ${styles['regime_' + group.regime]}`}>
              {REGIME_LABEL[group.regime] ?? group.regime}
            </span>
            <span className={styles.weekCount}>{group.trades.length} 候選</span>
          </div>
          <WeekTradeList
            trades={group.trades}
            priceInputs={priceInputs}
            onPriceChange={(id, v) => setPriceInputs(p => ({ ...p, [id]: v }))}
            onSavePrice={savePrice}
            onClose={closeTrade}
          />
        </div>
      ))}

      {!loading && trades.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📋</div>
          <div className={styles.emptyTitle}>尚無 Paper 記錄</div>
          <div className={styles.emptyDesc}>
            每週加入 ≥{MIN_CANDIDATES_PER_WEEK} 個候選，連續 {MIN_WEEKS} 週通過條件後，
            即可接駁 Futu 真錢交易。
          </div>
        </div>
      )}

      <div className={styles.footer}>
        Paper 牆：酌情啟發法候選，非回測 edge。通過後接駁 Futu GTC 硬止損。
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CriteriaRow({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <div className={styles.criteriaRow}>
      <span className={ok ? styles.critOk : styles.critPending}>{ok ? '✓' : '○'}</span>
      <span className={styles.critLabel}>{label}</span>
      <span className={`${styles.critValue} ${ok ? styles.critValueOk : ''}`}>{value}</span>
    </div>
  )
}

type TradeListProps = {
  trades: PaperTrade[]
  priceInputs: Record<number, string>
  onPriceChange: (id: number, v: string) => void
  onSavePrice: (id: number) => void
  onClose: (id: number) => void
  emptyMsg?: string
}

function WeekTradeList({ trades, priceInputs, onPriceChange, onSavePrice, onClose, emptyMsg }: TradeListProps) {
  if (trades.length === 0 && emptyMsg) {
    return <div className={styles.emptyRow}>{emptyMsg}</div>
  }

  return (
    <div className={styles.tradeList}>
      {trades.map(t => {
        const exitPrice = t.status === 'closed'
          ? (t.closedPriceCents ?? null)
          : t.currentPriceCents
        const pnl = exitPrice !== null ? pnlPct(t.entryPriceCents, exitPrice) : null
        const hasInput = (priceInputs[t.id] ?? '').length > 0

        return (
          <div
            key={t.id}
            className={`${styles.tradeRow} ${t.status === 'closed' ? styles.tradeClosed : ''}`}
          >
            <div className={styles.tradeLeft}>
              <span className={styles.tradeTicker}>{t.ticker}</span>
              <span className={styles.tradeSub}>{t.sector}</span>
            </div>
            <div className={styles.tradeMid}>
              <span className={styles.tradeEntry}>進 {fmtPrice(t.entryPriceCents)}</span>
              {exitPrice !== null && (
                <span className={styles.tradeCurrent}>現 {fmtPrice(exitPrice)}</span>
              )}
              {pnl !== null && (
                <span className={`${styles.tradePnl} ${pnl >= 0 ? styles.pnlGain : styles.pnlLoss}`}>
                  {fmtPct(pnl, true)}
                </span>
              )}
              {pnl !== null && pnl <= MAX_DRAWDOWN && (
                <span className={styles.drawdownWarn}>⚠ 深度回撤</span>
              )}
            </div>
            {t.status === 'open' && (
              <div className={styles.tradeRight}>
                <div className={styles.priceInputWrap}>
                  <span className={styles.dollar}>$</span>
                  <input
                    className={styles.priceInput}
                    type="number" min="0" step="0.01" placeholder="現價"
                    value={priceInputs[t.id] ?? ''}
                    onChange={e => onPriceChange(t.id, e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && hasInput && onSavePrice(t.id)}
                  />
                </div>
                {hasInput && (
                  <button className={styles.savePriceBtn} onClick={() => onSavePrice(t.id)}>更新</button>
                )}
                <button className={styles.closeBtn} onClick={() => onClose(t.id)} title="關閉">✕</button>
              </div>
            )}
            {t.status === 'closed' && (
              <div className={styles.closedBadge}>已關</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
