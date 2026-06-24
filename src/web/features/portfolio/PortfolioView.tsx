import { useState, useMemo, useEffect, useRef } from 'react'
import { useSnapshot } from '../../shared/hooks/useSnapshot'
import { useIntraday } from '../../shared/hooks/useIntraday'
import { usePortfolioStore, type PortfolioPosition, type PositionTier, type JournalAction, type JournalEntry, type PaperPosition } from './usePortfolioStore'
import { type PortfolioConfig, type EtfSleeve, maxSingleStockValue, etfBaseValue, regimeRiskKey, etfRef, SLEEVE_ORDER, BUILTIN_PRESETS } from './portfolioConfig'
import styles from './PortfolioView.module.css'

// ── Helpers ──────────────────────────────────────────────────────────

function fmtMoney(value: number, currency = 'HKD'): string {
  const prefix = currency === 'HKD' ? 'HK$' : currency === 'USD' ? 'US$' : `${currency} `
  return `${prefix}${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// Back-compat alias for call sites without a config in scope.
function fmtHKD(value: number): string {
  return fmtMoney(value, 'HKD')
}

function fmtPct(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${(value * 100).toFixed(1)}%`
}

function daysHeld(entryDate: string): number {
  const entry = new Date(entryDate)
  const now = new Date()
  return Math.max(0, Math.floor((now.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24)))
}

// ── Live price hook ──────────────────────────────────────────────────

type PriceState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ok'; price: number; prevClose: number | null }

function usePositionPrice(ticker: string, snapshotPrevClose?: number | null): PriceState {
  const state = useIntraday(ticker, '1D')
  if (state.status === 'loading') return { status: 'loading' }
  if (state.status === 'error' || state.status === 'idle') return { status: 'error' }
  const bars = state.bars
  if (bars.length < 1) return { status: 'error' }
  // prevClose priority: snapshot prevClose (prior session close) > today's open (proxy) > null
  const prevClose = snapshotPrevClose ?? (bars.length >= 1 ? bars[0].open : null)
  return {
    status: 'ok',
    price: bars[bars.length - 1].close,
    prevClose,
  }
}

// ── Position Row ─────────────────────────────────────────────────────

function PositionRow({
  pos,
  onEdit,
  onRemove,
  prevClose,
  hardStopPct,
}: {
  pos: PortfolioPosition
  onEdit: (id: string) => void
  onRemove: (id: string) => void
  prevClose?: number | null
  hardStopPct: number
}) {
  const priceState = usePositionPrice(pos.ticker, prevClose)
  const costBasis = pos.shares * pos.entryPrice
  const held = daysHeld(pos.entryDate)

  const livePrice = priceState.status === 'ok' ? priceState.price : null
  const pnlHKD = livePrice !== null ? (livePrice - pos.entryPrice) * pos.shares : null
  const pnlPct = livePrice !== null ? (livePrice - pos.entryPrice) / pos.entryPrice : null

  const distToStopPct = pos.stopLoss !== null && livePrice !== null
    ? (livePrice - pos.stopLoss) / livePrice
    : null
  const stopProximity: 'far' | 'close' | 'breach' | null =
    distToStopPct === null ? null
    : distToStopPct <= 0 ? 'breach'
    : distToStopPct < 0.03 ? 'close'
    : 'far'

  const hardStopHit = livePrice !== null && livePrice <= pos.entryPrice * (1 + hardStopPct)

  return (
    <tr className={`${styles.positionRow} ${hardStopHit ? styles.rowBreach : ''}`}>
      <td className={styles.tickerCell}>
        <strong>{pos.ticker}</strong>
        <span className={styles.tierBadge} data-tier={pos.tier}>{pos.tier}</span>
      </td>
      <td className={styles.numCell}>{pos.shares.toLocaleString()}</td>
      <td className={styles.numCell}>${pos.entryPrice.toFixed(2)}</td>
      <td className={styles.numCell}>
        {priceState.status === 'loading' && <span className={styles.priceLoading}>...</span>}
        {priceState.status === 'error' && <span className={styles.priceNA}>n/a</span>}
        {priceState.status === 'ok' && (
          <span className={styles.priceValue}>
            ${priceState.price.toFixed(2)}
            {priceState.prevClose !== null && (
              <small className={priceState.price >= priceState.prevClose ? styles.gain : styles.loss}>
                {' '}{fmtPct((priceState.price - priceState.prevClose) / priceState.prevClose)}
              </small>
            )}
          </span>
        )}
      </td>
      <td className={styles.numCell}>{fmtHKD(costBasis)}</td>
      <td className={styles.numCell}>
        {pnlHKD !== null ? (
          <span style={{ color: pnlHKD >= 0 ? 'var(--color-gain)' : 'var(--color-loss)' }}>
            {pnlHKD >= 0 ? '+' : ''}{fmtHKD(pnlHKD)}
            <small>{' '}{fmtPct(pnlPct!)}</small>
          </span>
        ) : (
          <span className={styles.pnlPlaceholder}>—</span>
        )}
      </td>
      <td className={styles.numCell}>
        {pos.stopLoss !== null ? (
          <span className={styles.stopCell}>
            ${pos.stopLoss.toFixed(2)}
            {distToStopPct !== null && (
              <small className={
                stopProximity === 'far' ? styles.stopFar
                : stopProximity === 'close' ? styles.stopClose
                : styles.stopBreach
              }>
                {' '}{fmtPct(distToStopPct)}
              </small>
            )}
          </span>
        ) : (
          <span className={styles.noStop}>none</span>
        )}
      </td>
      <td className={styles.numCell}>{held}d</td>
      <td className={styles.actionsCell}>
        <button className={styles.actionBtn} onClick={() => onEdit(pos.id)} title="Edit">✎</button>
        <button className={styles.actionBtn} onClick={() => onRemove(pos.id)} title="Remove">✕</button>
      </td>
    </tr>
  )
}

// ── Add/Edit Position Form ───────────────────────────────────────────

const EMPTY_POSITION: Omit<PortfolioPosition, 'id'> = {
  ticker: '', name: '', tier: 'Core', shares: 0, entryPrice: 0,
  entryDate: new Date().toISOString().slice(0, 10), stopLoss: null, notes: '',
}

function PositionForm({
  initial, onSave, onCancel,
}: {
  initial?: PortfolioPosition
  onSave: (p: Omit<PortfolioPosition, 'id'>) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<Omit<PortfolioPosition, 'id'>>(initial ?? EMPTY_POSITION)

  return (
    <form className={styles.positionForm} onSubmit={e => { e.preventDefault(); if (form.ticker.trim()) onSave(form) }}>
      <div className={styles.formRow}>
        <label>Ticker<input type="text" value={form.ticker} onChange={e => setForm(p => ({ ...p, ticker: e.target.value.toUpperCase() }))} placeholder="SPY" required /></label>
        <label>Name<input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="S&P 500 ETF" /></label>
        <label>Tier<select value={form.tier} onChange={e => setForm(p => ({ ...p, tier: e.target.value as PositionTier }))}><option value="ETF">ETF</option><option value="Core">Core</option><option value="Tactical">Tactical</option></select></label>
      </div>
      <div className={styles.formRow}>
        <label>Shares<input type="number" value={form.shares || ''} onChange={e => setForm(p => ({ ...p, shares: Number(e.target.value) }))} placeholder="0" min={0} step={0.01} /></label>
        <label>Entry Price (USD)<input type="number" value={form.entryPrice || ''} onChange={e => setForm(p => ({ ...p, entryPrice: Number(e.target.value) }))} placeholder="0.00" min={0} step={0.01} /></label>
        <label>Entry Date<input type="date" value={form.entryDate} onChange={e => setForm(p => ({ ...p, entryDate: e.target.value }))} /></label>
      </div>
      <div className={styles.formRow}>
        <label>Stop Loss (USD, optional)<input type="number" value={form.stopLoss ?? ''} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, stopLoss: v === '' ? null : Number(v) })) }} placeholder="e.g. 90.00" min={0} step={0.01} /></label>
        <label className={styles.formNotes}>Notes<input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional" /></label>
      </div>
      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryBtn}>{initial ? 'Update' : 'Add Position'}</button>
        <button type="button" className={styles.secondaryBtn} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

// ── Journal Form ─────────────────────────────────────────────────────

const EMPTY_JOURNAL = { date: new Date().toISOString().slice(0, 10), ticker: '', action: 'BUY' as JournalAction, shares: 0, price: 0, reason: '', exitConditions: '' }

function JournalForm({ onSave, onCancel }: { onSave: (e: typeof EMPTY_JOURNAL) => void; onCancel: () => void }) {
  const [form, setForm] = useState(EMPTY_JOURNAL)
  return (
    <form className={styles.journalForm} onSubmit={e => { e.preventDefault(); if (form.ticker.trim() && form.reason.trim()) { onSave(form); setForm(EMPTY_JOURNAL) } }}>
      <div className={styles.formRow}>
        <label>Date<input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></label>
        <label>Ticker<input type="text" value={form.ticker} onChange={e => setForm(p => ({ ...p, ticker: e.target.value.toUpperCase() }))} placeholder="SPY" required /></label>
        <label>Action<select value={form.action} onChange={e => setForm(p => ({ ...p, action: e.target.value as JournalAction }))}><option value="BUY">BUY</option><option value="SELL">SELL</option><option value="CLOSE">CLOSE</option></select></label>
      </div>
      <div className={styles.formRow}>
        <label>Shares<input type="number" value={form.shares || ''} onChange={e => setForm(p => ({ ...p, shares: Number(e.target.value) }))} placeholder="0" min={0} step={0.01} /></label>
        <label>Price (USD)<input type="number" value={form.price || ''} onChange={e => setForm(p => ({ ...p, price: Number(e.target.value) }))} placeholder="0.00" min={0} step={0.01} /></label>
      </div>
      <label className={styles.formReason}>Entry Reason *<textarea value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="Why this trade? Per EXECUTION_PLAN §11." rows={3} required /></label>
      <label className={styles.formReason}>Exit Conditions<textarea value={form.exitConditions} onChange={e => setForm(p => ({ ...p, exitConditions: e.target.value }))} placeholder="When will you exit?" rows={2} /></label>
      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryBtn}>Log Entry</button>
        <button type="button" className={styles.secondaryBtn} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

// ── Risk Alerts ──────────────────────────────────────────────────────

type RiskAlert = { severity: 'warn' | 'info' | 'breach'; message: string }

function computeRiskAlerts(
  positions: PortfolioPosition[],
  journal: JournalEntry[],
  regime: string,
  cfg: PortfolioConfig,
  sectorMap: Record<string, string>,
): RiskAlert[] {
  const alerts: RiskAlert[] = []
  const { risk } = cfg
  const money = (v: number) => fmtMoney(v, cfg.currency)

  if (positions.length > risk.maxPositions)
    alerts.push({ severity: 'breach', message: `${positions.length} positions (limit: ${risk.maxPositions})` })
  else if (positions.length >= risk.maxPositions - 2)
    alerts.push({ severity: 'warn', message: `${positions.length} positions — approaching limit of ${risk.maxPositions}` })

  const stockCap = maxSingleStockValue(cfg)
  positions.forEach(p => {
    const v = p.shares * p.entryPrice
    if (v > stockCap)
      alerts.push({ severity: 'breach', message: `${p.ticker}: ${money(v)} exceeds ${money(stockCap)} single-position cap (${(risk.maxSingleStockPct * 100).toFixed(0)}%)` })
  })

  const totalInvested = positions.reduce((s, p) => s + p.shares * p.entryPrice, 0)

  // Single-sector concentration (EXECUTION_PLAN §2 — was unimplemented)
  if (totalInvested > 0 && Object.keys(sectorMap).length > 0) {
    const bySector: Record<string, number> = {}
    positions.forEach(p => {
      const sector = sectorMap[p.ticker] ?? 'Unknown'
      bySector[sector] = (bySector[sector] ?? 0) + p.shares * p.entryPrice
    })
    for (const [sector, val] of Object.entries(bySector)) {
      if (sector === 'Unknown') continue
      const pct = val / totalInvested
      if (pct > risk.maxSingleSectorPct)
        alerts.push({ severity: 'breach', message: `${sector} ${(pct * 100).toFixed(0)}% of book — exceeds ${(risk.maxSingleSectorPct * 100).toFixed(0)}% sector cap` })
    }
  }

  const cashPct = Math.max(0, 1 - totalInvested / cfg.capitalBase)
  const regimeKey = regimeRiskKey(regime)
  const minCash = risk.minCashPct[regimeKey] ?? 0.15
  if (cashPct < minCash)
    alerts.push({ severity: 'breach', message: `Cash ${(cashPct * 100).toFixed(0)}% below ${regimeKey} floor ${(minCash * 100).toFixed(0)}%` })

  // 3-consecutive-loss flag (proxy: recent closes — journal has no realised P&L yet)
  const closedTrades = journal.filter(e => e.action === 'CLOSE' || e.action === 'SELL').sort((a, b) => b.date.localeCompare(a.date))
  const recentCloses = closedTrades.filter(e => (Date.now() - new Date(e.date).getTime()) / 86400000 <= 14)
  if (recentCloses.length >= risk.consecutiveLossPause)
    alerts.push({ severity: 'warn', message: `${recentCloses.length} closes in last 14 days — check P&L. Pause 2 weeks if ${risk.consecutiveLossPause} consecutive losses.` })

  // Monthly new-position counter
  const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const buysThisMonth = journal.filter(e => e.action === 'BUY' && e.date.startsWith(thisMonth)).length
  if (buysThisMonth >= risk.maxNewPerMonth)
    alerts.push({ severity: 'breach', message: `${buysThisMonth} new positions this month (limit: ${risk.maxNewPerMonth})` })
  else if (buysThisMonth >= risk.maxNewPerMonth - 1)
    alerts.push({ severity: 'warn', message: `${buysThisMonth}/${risk.maxNewPerMonth} new positions this month` })

  return alerts
}

// ── P&L Summary Bar ──────────────────────────────────────────────────

type ETFTargetItem = { id: string; ticker: string; name: string; allocationPct: number; sleeve: string }

const SLEEVE_INFO: Record<string, string> = {
  '核心': '全市場 Beta 基石，追蹤 S&P 500，長期持有不擇時',
  '增長': '科技傾斜，長期超額回報潛力高，波動也較大',
  '收入': 'Covered call 每月派息，升市上限被鎖、跌市有 premium 緩衝',
  '小型': '分散大型股集中風險，景氣復甦期表現佳',
  '避險': '與股票低相關性，通脹對沖，極端風險時保值',
  '現金': '零風險月派息，等同現金，等待機會時收息',
}

const SLEEVE_LABEL: Record<string, string> = {
  'US Equity Beta': '核心',
  'Growth': '增長',
  'Small/Mid Cap': '小型',
  'Intl Equity': '國際',
  'Gold / Real Assets': '避險',
  'Bonds / Cash': '現金',
  'Other': '',
}

function sleeveLabel(t: ETFTargetItem): string {
  return t.sleeve || SLEEVE_LABEL[etfRef(t.ticker).sleeve] || ''
}

function PortfolioPnLSummary({ positions, etfTargets, cfg, onAddEtf, onRemoveEtf }: {
  positions: PortfolioPosition[]
  etfTargets: ETFTargetItem[]
  cfg: PortfolioConfig
  onAddEtf: (ticker: string, allocPct: number) => void
  onRemoveEtf: (id: string) => void
}) {
  const [showAddEtf, setShowAddEtf] = useState(false)
  const [newTicker, setNewTicker] = useState('')
  const [newAlloc, setNewAlloc] = useState('10')
  const money = (v: number) => fmtMoney(v, cfg.currency)
  const totalInvested = positions.reduce((s, p) => s + p.shares * p.entryPrice, 0)
  const allocPct = totalInvested > 0 ? (totalInvested / cfg.capitalBase) * 100 : 0
  const etfBase = etfBaseValue(cfg)
  const etfTotalAlloc = etfTargets.reduce((s, t) => s + t.allocationPct, 0)

  return (
    <div className={styles.pnlSummary}>
      <div className={styles.pnlSummaryCard}>
        <span>Portfolio Value (book)</span>
        <strong>{money(totalInvested)}</strong>
        <small>{allocPct.toFixed(0)}% of {cfg.presetName}</small>
      </div>
      <div className={styles.pnlSummaryCard}>
        <span>ETF Base Target<button className={styles.inlineAddBtn} title="Add ETF target" onClick={() => setShowAddEtf(v => !v)}>+</button></span>
        {showAddEtf && (
          <div className={styles.addEtfRow}>
            <input className={styles.etfInput} placeholder="Ticker e.g. JEPQ" value={newTicker} onChange={e => setNewTicker(e.target.value.toUpperCase())} maxLength={6} />
            <input className={styles.etfAllocInput} type="number" min={1} max={100} value={newAlloc} onChange={e => setNewAlloc(e.target.value)} />
            <span className={styles.unit}>%</span>
            <button className={styles.etfAddBtn} onClick={() => { const pct = parseInt(newAlloc, 10) || 10; if (newTicker) { onAddEtf(newTicker, pct); setNewTicker(''); setNewAlloc('10'); setShowAddEtf(false) } }}>Add</button>
          </div>
        )}
        <strong>{money(etfBase)}</strong>
        <small>{(cfg.etfBasePct * 100).toFixed(0)}% of base</small>
        <small>
          {etfTargets.length === 0 ? 'No ETF targets configured' :
            etfTargets.map(t => {
              const sl = sleeveLabel(t)
              const info = sl ? SLEEVE_INFO[sl] ?? '' : ''
              return (
                <span key={t.id} className={styles.etfChip} title={info ? `${sl} — ${info}` : t.name}>
                  {t.ticker} {sl ? <span className={styles.etfChipSleeve}>{sl}</span> : null} {t.allocationPct}%
                  <button className={styles.etfChipRemove} onClick={() => onRemoveEtf(t.id)}>×</button>
                </span>
              )
            })}
          {etfTotalAlloc > 0 && etfTotalAlloc !== 100 && (
            <span className={styles.etfWarn}> ⚠ {etfTotalAlloc}% total</span>
          )}
        </small>
      </div>
      <div className={styles.pnlSummaryCard}>
        <span>Live P&L</span>
        <strong className={styles.pnlLiveNote}>per row above</strong>
        <small>15-min delayed · indicative only</small>
      </div>
    </div>
  )
}

// ── Allocation Summary ───────────────────────────────────────────────

function AllocationSummary({ positions, cfg }: { positions: PortfolioPosition[]; cfg: PortfolioConfig }) {
  const money = (v: number) => fmtMoney(v, cfg.currency)
  const totalInvested = positions.reduce((s, p) => s + p.shares * p.entryPrice, 0)
  const cashPct = Math.max(0, 1 - totalInvested / cfg.capitalBase)
  const minCashFloor = cfg.risk.minCashPct.NEUTRAL
  const byTier = { ETF: 0, Core: 0, Tactical: 0 }
  positions.forEach(p => { byTier[p.tier] += p.shares * p.entryPrice })

  return (
    <div className={styles.allocGrid}>
      <div className={styles.allocCard}><span>Total Invested</span><strong>{money(totalInvested)}</strong></div>
      <div className={styles.allocCard}><span>Cash ({money(cfg.capitalBase)} base)</span><strong className={cashPct < minCashFloor ? styles.breachText : ''}>{(cashPct * 100).toFixed(0)}%</strong></div>
      <div className={styles.allocCard}><span>ETF Allocation</span><strong>{money(byTier.ETF)}</strong><small>{totalInvested > 0 ? ((byTier.ETF / totalInvested) * 100).toFixed(0) : 0}%</small></div>
      <div className={styles.allocCard}><span>Core / Tactical</span><strong>{money(byTier.Core + byTier.Tactical)}</strong><small>{totalInvested > 0 ? (((byTier.Core + byTier.Tactical) / totalInvested) * 100).toFixed(0) : 0}%</small></div>
      <div className={styles.allocCard}><span>Positions</span><strong>{positions.length}</strong><small>max {cfg.risk.maxPositions}</small></div>
    </div>
  )
}

// ── Weekly SOP ───────────────────────────────────────────────────────

function WeeklyChecklist() {
  const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()]
  const isMonthStart = new Date().getDate() <= 3
  const items = [
    { day: 'Mon', action: 'Review positions: P&L, stop triggers', dur: '30 min' },
    { day: 'Wed', action: 'Run screener → review candidates → shortlist', dur: '1 hr' },
    { day: 'Thu', action: 'Decide: add new positions this week?', dur: '30 min' },
    { day: 'Fri', action: 'Record decisions + reasons; check next week earnings', dur: '30 min' },
    { day: 'Month 1st', action: 'ETF rebalance + monthly review', dur: '2 hr' },
  ]

  return (
    <div className={styles.weeklyChecklist}>
      <h3>Weekly SOP / 每週流程</h3>
      <div className={styles.checklistItems}>
        {items.map(item => {
          const today = item.day === dayName || (item.day === 'Month 1st' && isMonthStart)
          return (
            <div key={item.day} className={`${styles.checklistItem} ${today ? styles.checklistToday : ''}`}>
              <span className={styles.checklistDay}>{item.day}</span>
              <span className={styles.checklistAction}>{item.action}</span>
              <span className={styles.checklistDuration}>{item.dur}</span>
              {today && <span className={styles.checklistMarker}>← today</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Screener Panel (fetches from /api/d1/screener-candidates) ─────────

type ScreenerCandidate = {
  ticker: string; name: string; sector: string; label: string
  rsRank: number | null; close: number | null
  roe: number | null; pe: number | null; debtToEquity: number | null
  profitable: boolean | null; passedFundamentals: boolean; fundamentalsNote: string
}

function useScreener() {
  const [state, setState] = useState<{ status: 'loading' | 'error' | 'ok'; candidates: ScreenerCandidate[]; snapshotDate: string | null; totalStocks: number; passedCount: number }>({ status: 'loading', candidates: [], snapshotDate: null, totalStocks: 0, passedCount: 0 })

  useEffect(() => {
    let cancelled = false
    fetch('/api/d1/screener-candidates')
      .then(r => r.json())
      .then((d: { candidates: ScreenerCandidate[]; snapshotDate: string; totalStocks: number; passedFundamentals: number }) => {
        if (cancelled) return
        setState({ status: 'ok', candidates: d.candidates, snapshotDate: d.snapshotDate, totalStocks: d.totalStocks, passedCount: d.passedFundamentals })
      })
      .catch(() => { if (!cancelled) setState(s => ({ ...s, status: 'error' })) })
    return () => { cancelled = true }
  }, [])

  return state
}

function ScreenerPanel({ onTrackCandidate }: { onTrackCandidate: (c: ScreenerCandidate) => void }) {
  const data = useScreener()

  return (
    <div className={styles.cockpitCard}>
      <h3>Weekly Candidates / 每週候選</h3>
      <div className={styles.limitationsNote}>
        <strong>⚠️ Research tool — not a backtested edge.</strong>
        <p>Fundamentals gates: profitable, ROE ≥ 12%, P/E ≤ 40, D/E ≤ 2.0. Data from yfinance (current/TTM only — no PIT history).</p>
        <p>Stock funnel is a <strong>paper-validated discretionary heuristic</strong>. Do not trade without recording reasons in the journal.</p>
      </div>

      {data.status === 'loading' && <p className={styles.subtle}>Loading screener candidates...</p>}
      {data.status === 'error' && <p className={styles.subtle}>Screener unavailable — check snapshot freshness.</p>}

      {data.status === 'ok' && (
        <>
          <div className={styles.screenerMeta}>
            <span>Snapshot {data.snapshotDate}</span>
            <span>{data.totalStocks} stocks scanned</span>
            <span>{data.candidates.length} candidates</span>
            <span className={data.passedCount > 0 ? styles.gain : ''}>{data.passedCount} passed fundamentals</span>
          </div>
          {data.candidates.length === 0 ? (
            <p className={styles.subtle}>No LONG_BREAK/VCP/BOUNCE signals in today's snapshot.</p>
          ) : (
            <div className={styles.candidateList}>
              {data.candidates.map(c => (
                <div key={c.ticker} className={`${styles.candidateRow} ${c.passedFundamentals ? styles.candidatePass : styles.candidateFail}`}>
                  <div className={styles.candidateHead}>
                    <strong>{c.ticker}</strong>
                    <span>{c.name}</span>
                    <span className={styles.candidateLabel}>{c.label.replace('LONG_', 'L_')}</span>
                    <span className={styles.candidateRS}>RS {c.rsRank}</span>
                    <button className={styles.trackBtn} onClick={() => onTrackCandidate(c)} title="Track paper P&L">📋 Track</button>
                  </div>
                  <div className={styles.candidateFundamentals}>
                    <span className={styles.fundTag} data-pass={c.passedFundamentals}>
                      {c.passedFundamentals ? '✓ PASS' : '✗ FAIL'}: {c.fundamentalsNote}
                    </span>
                    {c.pe !== null && <span>P/E {c.pe.toFixed(0)}</span>}
                    {c.roe !== null && <span>ROE {(c.roe * 100).toFixed(0)}%</span>}
                    {c.debtToEquity !== null && <span>D/E {c.debtToEquity.toFixed(1)}</span>}
                    {c.profitable !== null && <span>{c.profitable ? 'Profitable' : 'Not profitable'}</span>}
                    {c.close !== null && <span>${c.close.toFixed(2)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Paper P&L Tracker (T2.10) ────────────────────────────────────────

function PaperRow({
  pp,
  onClose,
  onRemove,
  prevClose,
  hardStopPct,
}: {
  pp: PaperPosition
  onClose: (id: string, exitPrice: number) => void
  onRemove: (id: string) => void
  prevClose?: number | null
  hardStopPct: number
}) {
  const priceState = usePositionPrice(pp.ticker, prevClose)
  const livePrice = priceState.status === 'ok' ? priceState.price : null
  const isOpen = pp.exitPrice === null
  const costBasis = pp.shares * pp.entryPrice

  const pnlHKD = isOpen && livePrice !== null
    ? (livePrice - pp.entryPrice) * pp.shares
    : pp.exitPrice !== null
    ? (pp.exitPrice - pp.entryPrice) * pp.shares
    : null
  const pnlPct = pnlHKD !== null ? pnlHKD / costBasis : null

  const distToStopPct = isOpen && pp.stopLoss !== null && livePrice !== null
    ? (livePrice - pp.stopLoss) / livePrice
    : null
  const stopProximity: 'far' | 'close' | 'breach' | null =
    distToStopPct === null ? null
    : distToStopPct <= 0 ? 'breach'
    : distToStopPct < 0.03 ? 'close'
    : 'far'

  const hardStopHit = isOpen && livePrice !== null && livePrice <= pp.entryPrice * (1 + hardStopPct)

  const [showClose, setShowClose] = useState(false)
  const [closePrice, setClosePrice] = useState(livePrice?.toFixed(2) ?? '')

  return (
    <tr className={`${styles.positionRow} ${!isOpen ? styles.paperClosed : hardStopHit ? styles.rowBreach : ''}`}>
      <td className={styles.tickerCell}>
        <strong>{pp.ticker}</strong>
        <span className={styles.paperLabel}>📄 paper</span>
        <span className={styles.tierBadge} data-tier="Tactical">{pp.signalLabel.replace('LONG_', 'L_')}</span>
      </td>
      <td className={styles.numCell}>{pp.shares.toLocaleString()}</td>
      <td className={styles.numCell}>${pp.entryPrice.toFixed(2)}</td>
      <td className={styles.numCell}>
        {!isOpen ? (
          <span className={styles.priceNA}>closed</span>
        ) : priceState.status === 'loading' ? (
          <span className={styles.priceLoading}>...</span>
        ) : priceState.status === 'error' ? (
          <span className={styles.priceNA}>n/a</span>
        ) : (
          <span className={styles.priceValue}>
            ${priceState.price.toFixed(2)}
          </span>
        )}
      </td>
      <td className={styles.numCell}>{fmtHKD(costBasis)}</td>
      <td className={styles.numCell}>
        {pnlHKD !== null ? (
          <span style={{ color: pnlHKD >= 0 ? 'var(--color-gain)' : 'var(--color-loss)' }}>
            {pnlHKD >= 0 ? '+' : ''}{fmtHKD(pnlHKD)}
            <small>{' '}{fmtPct(pnlPct!)}</small>
          </span>
        ) : (
          <span className={styles.pnlPlaceholder}>—</span>
        )}
      </td>
      <td className={styles.numCell}>
        {pp.stopLoss !== null ? (
          <span className={styles.stopCell}>
            ${pp.stopLoss.toFixed(2)}
            {distToStopPct !== null && (
              <small className={
                stopProximity === 'far' ? styles.stopFar
                : stopProximity === 'close' ? styles.stopClose
                : styles.stopBreach
              }>
                {' '}{fmtPct(distToStopPct)}
              </small>
            )}
          </span>
        ) : (
          <span className={styles.noStop}>none</span>
        )}
      </td>
      <td className={styles.numCell}>{daysHeld(pp.entryDate)}d</td>
      <td className={styles.actionsCell}>
        {isOpen && (
          <>
            {!showClose ? (
              <button className={styles.actionBtn} onClick={() => { setShowClose(true); setClosePrice(livePrice?.toFixed(2) ?? '') }} title="Close paper position">✕</button>
            ) : (
              <span className={styles.closeForm}>
                <input type="number" className={styles.closeInput} value={closePrice} onChange={e => setClosePrice(e.target.value)} placeholder={livePrice?.toFixed(2)} step={0.01} />
                <button className={styles.actionBtn} onClick={() => { const p = parseFloat(closePrice); if (p > 0) onClose(pp.id, p) }} title="Confirm close">✓</button>
              </span>
            )}
          </>
        )}
        <button className={styles.actionBtn} onClick={() => onRemove(pp.id)} title="Remove">🗑</button>
      </td>
    </tr>
  )
}

function PaperTracker({
  paperPositions,
  onClose,
  onRemove,
  prevCloseMap,
  hardStopPct,
  onGoToScreener,
}: {
  paperPositions: PaperPosition[]
  onClose: (id: string, exitPrice: number) => void
  onRemove: (id: string) => void
  prevCloseMap: Record<string, number>
  hardStopPct: number
  onGoToScreener: () => void
}) {
  const openPositions = paperPositions.filter(p => p.exitPrice === null)
  const closedPositions = paperPositions.filter(p => p.exitPrice !== null)

  // Cumulative paper P&L
  const totalPnL = paperPositions.reduce((sum, p) => {
    if (p.exitPrice !== null) return sum + (p.exitPrice - p.entryPrice) * p.shares
    return sum // open positions not counted until closed
  }, 0)

  const winCount = closedPositions.filter(p => (p.exitPrice! - p.entryPrice) * p.shares > 0).length
  const totalClosed = closedPositions.length

  if (paperPositions.length === 0) {
    return (
      <div className={styles.cockpitCard}>
        <h3>Paper P&L Tracker / 紙本盈虧追蹤</h3>
        <p className={styles.subtle}>No paper positions yet.</p>
        <button className={styles.goScreenerBtn} onClick={onGoToScreener}>↑ Go to Screener</button>
        <p className={styles.subtle}>Go-live criteria (EXECUTION_PLAN §6): ≥ 4 consecutive weeks with ≥ 3 candidates + paper P&L positive + no single drawdown &gt; −15%.</p>
      </div>
    )
  }

  return (
    <div className={styles.cockpitCard}>
      <h3>Paper P&L Tracker / 紙本盈虧追蹤</h3>
      <div className={styles.paperSummary}>
        <div className={styles.paperSummaryCard}>
          <span>Cumulative P&L</span>
          <strong style={{ color: totalPnL >= 0 ? 'var(--color-gain)' : 'var(--color-loss)' }}>
            {totalPnL >= 0 ? '+' : ''}{fmtHKD(totalPnL)}
          </strong>
        </div>
        <div className={styles.paperSummaryCard}>
          <span>Win Rate (closed)</span>
          <strong>{totalClosed > 0 ? `${((winCount / totalClosed) * 100).toFixed(0)}%` : '—'}</strong>
          <small>{winCount}/{totalClosed} closed</small>
        </div>
        <div className={styles.paperSummaryCard}>
          <span>Open / Total</span>
          <strong>{openPositions.length} / {paperPositions.length}</strong>
        </div>
        <div className={styles.paperSummaryCard}>
          <span>Go-Live Goal</span>
          <strong className={totalPnL >= 0 ? styles.gain : styles.loss}>
            {totalPnL >= 0 ? '✓ on track' : '✗ below'}
          </strong>
          <small>positive + no drawdown &gt; −15%</small>
        </div>
      </div>

      {openPositions.length > 0 && (
        <>
          <h4 className={styles.paperSubheading}>Open ({openPositions.length})</h4>
          <div className={styles.tableWrap}>
            <table className={styles.positionsTable}>
              <thead><tr><th>Ticker</th><th className={styles.numHeader}>Shares</th><th className={styles.numHeader}>Entry $</th><th className={styles.numHeader}>Live $</th><th className={styles.numHeader}>Cost Basis</th><th className={styles.numHeader}>P&L</th><th className={styles.numHeader}>Stop</th><th className={styles.numHeader}>Days</th><th></th></tr></thead>
              <tbody>
                {openPositions.map(pp => <PaperRow key={pp.id} pp={pp} onClose={onClose} onRemove={onRemove} prevClose={prevCloseMap[pp.ticker]} hardStopPct={hardStopPct} />)}
              </tbody>
            </table>
          </div>
        </>
      )}

      {closedPositions.length > 0 && (
        <>
          <h4 className={styles.paperSubheading}>Closed ({closedPositions.length})</h4>
          <div className={styles.tableWrap}>
            <table className={styles.positionsTable}>
              <thead><tr><th>Ticker</th><th className={styles.numHeader}>Shares</th><th className={styles.numHeader}>Entry $</th><th className={styles.numHeader}>Exit $</th><th className={styles.numHeader}>Cost Basis</th><th className={styles.numHeader}>P&L</th><th className={styles.numHeader}>Exit Date</th><th className={styles.numHeader}>Days</th><th></th></tr></thead>
              <tbody>
                {closedPositions.map(pp => (
                  <tr key={pp.id} className={`${styles.positionRow} ${styles.paperClosed}`}>
                    <td className={styles.tickerCell}>
                      <strong>{pp.ticker}</strong>
                      <span className={styles.paperLabel}>📄 paper</span>
                    </td>
                    <td className={styles.numCell}>{pp.shares.toLocaleString()}</td>
                    <td className={styles.numCell}>${pp.entryPrice.toFixed(2)}</td>
                    <td className={styles.numCell}>${pp.exitPrice!.toFixed(2)}</td>
                    <td className={styles.numCell}>{fmtHKD(pp.shares * pp.entryPrice)}</td>
                    <td className={styles.numCell}>
                      <span style={{ color: (pp.exitPrice! - pp.entryPrice) * pp.shares >= 0 ? 'var(--color-gain)' : 'var(--color-loss)' }}>
                        {((pp.exitPrice! - pp.entryPrice) * pp.shares >= 0 ? '+' : '')}{fmtHKD((pp.exitPrice! - pp.entryPrice) * pp.shares)}
                        <small>{' '}{fmtPct((pp.exitPrice! - pp.entryPrice) / pp.entryPrice)}</small>
                      </span>
                    </td>
                    <td className={styles.numCell}>{pp.exitDate ?? '—'}</td>
                    <td className={styles.numCell}>{daysHeld(pp.entryDate)}d</td>
                    <td className={styles.actionsCell}>
                      <button className={styles.actionBtn} onClick={() => onRemove(pp.id)} title="Remove">🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ── System Paper Reference (T2.11) ────────────────────────────────────

type SettledSignalRow = {
  ticker: string; signal_date: string; label: string
  close: number | null
  ret1d: number | null; ret5d: number | null; ret10d: number | null
  ret5d_vs_spy: number | null
  roe: number | null; pe: number | null; debt_to_equity: number | null
  profitable: number | null; sector: string | null
}

function useSettledSignals() {
  const [state, setState] = useState<{ status: 'loading' | 'error' | 'ok'; signals: SettledSignalRow[] }>({ status: 'loading', signals: [] })

  useEffect(() => {
    let cancelled = false
    fetch('/api/d1/recent-settled-signals', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: { signals: SettledSignalRow[] }) => {
        if (cancelled) return
        setState({ status: 'ok', signals: d.signals })
      })
      .catch(() => { if (!cancelled) setState({ status: 'error', signals: [] }) })
    return () => { cancelled = true }
  }, [])

  return state
}

function fmtReturn(val: number | null): string {
  if (val == null) return '—'
  const pct = (val * 100).toFixed(1)
  return `${val >= 0 ? '+' : ''}${pct}%`
}

const DEFAULT_SHOW = 15

function SystemPaperReference() {
  const data = useSettledSignals()
  const [expanded, setExpanded] = useState(false)
  const [tickerFilter, setTickerFilter] = useState('')
  const [labelFilter, setLabelFilter] = useState('ALL')

  if (data.status === 'loading') return (
    <div className={styles.cockpitCard}>
      <h3>System Signal Reference / 系統訊號參考</h3>
      <p className={styles.subtle}>Loading settled signals...</p>
    </div>
  )

  if (data.status === 'error') return (
    <div className={styles.cockpitCard}>
      <h3>System Signal Reference / 系統訊號參考</h3>
      <p className={styles.subtle}>Unavailable.</p>
    </div>
  )

  const allSignals = data.signals
  if (allSignals.length === 0) return null

  // ── Filter ──────────────────────────────────────────────────────
  const filtered = allSignals.filter(s => {
    if (tickerFilter && !s.ticker.toLowerCase().includes(tickerFilter.toLowerCase())) return false
    if (labelFilter !== 'ALL' && s.label !== labelFilter) return false
    return true
  })

  const visible = expanded ? filtered : filtered.slice(0, DEFAULT_SHOW)
  const hiddenCount = filtered.length - visible.length

  // ── Summary stats ────────────────────────────────────────────────
  // Only count signals where the return is actually settled (non-null).
  // Including nulls as 0 dilutes both win rate and average return.
  const settled5d = allSignals.filter(s => s.ret5d !== null)
  const settledTotal = settled5d.length
  const wins = settled5d.filter(s => s.ret5d! > 0).length
  const total = allSignals.length
  const avgRet = settledTotal > 0 ? settled5d.reduce((s, x) => s + x.ret5d!, 0) / settledTotal : 0
  const settled1d = allSignals.filter(s => s.ret1d !== null)
  const avg1d = settled1d.length > 0 ? settled1d.reduce((s, x) => s + x.ret1d!, 0) / settled1d.length : 0
  const avg10d = allSignals.reduce((s, x) => {
    if (x.ret10d == null) return s
    return s + x.ret10d
  }, 0)
  const cnt10d = allSignals.filter(s => s.ret10d != null).length
  const avg10dVal = cnt10d > 0 ? avg10d / cnt10d : null
  const bestSig = allSignals.reduce((b, x) => (x.ret5d ?? -Infinity) > (b.ret5d ?? -Infinity) ? x : b, allSignals[0])
  const worstSig = allSignals.reduce((w, x) => (x.ret5d ?? Infinity) < (w.ret5d ?? Infinity) ? x : w, allSignals[0])

  // Best/worst exit day distribution
  let best1d = 0, best5d = 0, best10d = 0
  let bestRetSum = 0, worstRetSum = 0, worstCount = 0
  for (const s of allSignals) {
    const c: [number | null, string][] = [[s.ret1d, '1d'], [s.ret5d, '5d'], [s.ret10d, '10d']]
    const bestWin = c.reduce((a, b) => (a[0] ?? -Infinity) >= (b[0] ?? -Infinity) ? a : b)
    const worstWin = c.reduce((a, b) => (a[0] ?? Infinity) <= (b[0] ?? Infinity) ? a : b)
    if (bestWin[0] != null) {
      bestRetSum += bestWin[0]
      if (bestWin[1] === '1d') best1d++
      else if (bestWin[1] === '5d') best5d++
      else best10d++
    }
    if (worstWin[0] != null) { worstRetSum += worstWin[0]; worstCount++ }
  }
  const bestTotal = best1d + best5d + best10d
  const avgBestRet = bestTotal > 0 ? bestRetSum / bestTotal : null
  const avgWorstRet = worstCount > 0 ? worstRetSum / worstCount : null
  const avgDays = bestTotal > 0 ? (1 * best1d + 5 * best5d + 10 * best10d) / bestTotal : 0

  // ── Mini sparkline: cumulative ret5d over time ──────────────────
  const sorted = [...allSignals].sort((a, b) => a.signal_date.localeCompare(b.signal_date))
  let cum = 0
  const points: { date: string; cum: number }[] = []
  for (const s of sorted) {
    if (s.ret5d != null) {
      cum += s.ret5d
      points.push({ date: s.signal_date, cum })
    }
  }
  const svgW = 320, svgH = 48
  const cumVals = points.map(p => p.cum)
  const minCum = Math.min(...cumVals, 0)
  const maxCum = Math.max(...cumVals, 0.001)
  const range = maxCum - minCum || 1
  const polyPoints = points.map((p, i) => {
    const x = (i / Math.max(points.length - 1, 1)) * (svgW - 4) + 2
    const y = svgH - 4 - ((p.cum - minCum) / range) * (svgH - 8)
    return `${x},${y}`
  }).join(' ')
  const zeroY = svgH - 4 - ((0 - minCum) / range) * (svgH - 8)

  // ── Available labels for filter ─────────────────────────────────
  const labels = [...new Set(allSignals.map(s => s.label))].sort()

  return (
    <div className={styles.cockpitCard}>
      <h3>
        System Signal Reference / 系統訊號參考
        <span className={styles.refCount}>{total} settled</span>
      </h3>

      <div className={styles.refSummary}>
        <div className={styles.refSummaryCard}>
          <span>Win Rate (5d)</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ width: `${settledTotal > 0 ? ((wins / settledTotal) * 100).toFixed(0) : 0}%`, height: '100%', borderRadius: 3, background: settledTotal > 0 && wins / settledTotal >= 0.5 ? 'var(--color-gain)' : 'var(--color-loss)', transition: 'width 0.4s' }} />
            </div>
            <strong style={{ color: settledTotal > 0 && wins / settledTotal >= 0.5 ? 'var(--color-gain)' : 'var(--color-loss)', fontSize: '0.95rem' }}>
              {settledTotal > 0 ? ((wins / settledTotal) * 100).toFixed(0) : '—'}%
            </strong>
          </div>
          <small>{wins}/{settledTotal} settled</small>
        </div>
        <div className={styles.refSummaryCard}>
          <span>Avg 1d</span>
          <strong style={{ color: avg1d >= 0 ? 'var(--color-gain)' : 'var(--color-loss)' }}>
            {fmtReturn(avg1d)}
          </strong>
        </div>
        <div className={styles.refSummaryCard}>
          <span>Avg 5d</span>
          <strong style={{ color: avgRet >= 0 ? 'var(--color-gain)' : 'var(--color-loss)' }}>
            {fmtReturn(avgRet)}
          </strong>
        </div>
        <div className={styles.refSummaryCard}>
          <span>Avg 10d</span>
          <strong style={{ color: (avg10dVal ?? 0) >= 0 ? 'var(--color-gain)' : 'var(--color-loss)' }}>
            {avg10dVal != null ? fmtReturn(avg10dVal) : '—'}
          </strong>
          <small>{cnt10d} settled</small>
        </div>
        <div className={styles.refSummaryCard}>
          <span>Best / Worst 5d</span>
          <strong>
            <span style={{ color: 'var(--color-gain)' }}>{fmtReturn(bestSig.ret5d)}</span>
            {' / '}
            <span style={{ color: 'var(--color-loss)' }}>{fmtReturn(worstSig.ret5d)}</span>
          </strong>
          <small>{bestSig.ticker} / {worstSig.ticker}</small>
        </div>
        <div className={styles.refSummaryCard}>
          <span>Best Exit / Avg Ret</span>
          <strong style={{ color: 'var(--accent)' }}>
            {bestTotal > 0 ? `${avgDays.toFixed(1)}d / ${fmtReturn(avgBestRet)}` : '—'}
          </strong>
          <small>best day</small>
        </div>
        <div className={styles.refSummaryCard}>
          <span>Best-Exit Annual ⚠️</span>
          <strong>
            {bestTotal > 0 && avgBestRet != null ? (
              <><span style={{ color: 'var(--color-gain)' }}>{fmtReturn(Math.pow(1 + avgBestRet, 250 / avgDays) - 1)}</span>
              {' / '}
              <span style={{ color: 'var(--color-loss)' }}>{avgWorstRet != null ? fmtReturn(Math.pow(1 + avgWorstRet, 250 / avgDays) - 1) : '—'}</span></>
            ) : '—'}
          </strong>
          <small>hindsight best exit — not achievable</small>
        </div>
      </div>

      {/* ── Sparkline ──────────────────────────────────────────── */}
      {points.length > 1 && (
        <div className={styles.sparkWrap}>
          <svg width="100%" height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none">
            <line x1="0" y1={zeroY} x2={svgW} y2={zeroY} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <polyline points={polyPoints} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
          </svg>
          <div className={styles.sparkLabels}>
            <span>{points[0].date}</span>
            <span style={{ color: cum >= 0 ? 'var(--color-gain)' : 'var(--color-loss)' }}>
              {fmtReturn(cum)} total
            </span>
            <span>{points[points.length - 1].date}</span>
          </div>
        </div>
      )}

      {/* ── Filters ────────────────────────────────────────────── */}
      <div className={styles.refFilters}>
        <input
          type="text"
          className={styles.filterInput}
          placeholder="Search ticker…"
          value={tickerFilter}
          onChange={e => { setTickerFilter(e.target.value); setExpanded(true) }}
        />
        <select className={styles.filterSelect} value={labelFilter} onChange={e => { setLabelFilter(e.target.value); setExpanded(true) }}>
          <option value="ALL">All labels</option>
          {labels.map(l => <option key={l} value={l}>{l.replace('LONG_', 'L_')}</option>)}
        </select>
        <span className={styles.filterCount}>{filtered.length} / {total}</span>
      </div>

      {/* ── Expand hint (top) ──────────────────────────────────── */}
      {hiddenCount > 0 && !expanded && (
        <button className={styles.expandBtn} onClick={() => setExpanded(true)} style={{ marginBottom: 8 }}>
          ▼ Show all {filtered.length} ({hiddenCount} more)
        </button>
      )}

      {/* ── Table ──────────────────────────────────────────────── */}
      <div className={styles.refTableWrap}>
        <table className={styles.refTable}>
          <thead>
            <tr>
              <th>Date</th><th>Ticker</th><th>Label</th><th className={styles.numHeader}>Close</th>
              <th className={styles.numHeader}>1d Ret</th><th className={styles.numHeader}>5d Ret</th>
              <th className={styles.numHeader}>10d Ret</th><th className={styles.numHeader} title="Best holding day among 1d/5d/10d">↑Best</th>
              <th className={`${styles.numHeader} ${styles.colVsSpy}`} title="5-day return vs S&P 500">vs SPY</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s, i) => {
              const bestCand: [number, string][] = [[s.ret1d ?? -Infinity, '1d'], [s.ret5d ?? -Infinity, '5d'], [s.ret10d ?? -Infinity, '10d']]
              const bestWin = bestCand.reduce((a, b) => a[0] >= b[0] ? a : b)
              const bestLabel = bestWin[0] === -Infinity ? '—' : bestWin[1]
              return (
              <tr key={`${s.ticker}-${s.signal_date}-${i}`} className={styles.refRow}>
                <td className={styles.refDate}>{s.signal_date}</td>
                <td><strong>{s.ticker}</strong></td>
                <td><span className={styles.refLabel}>{s.label.replace('LONG_', 'L_')}</span></td>
                <td className={styles.numCell}>{s.close !== null ? `$${s.close.toFixed(2)}` : '—'}</td>
                <td className={styles.numCell} style={{ color: (s.ret1d ?? 0) >= 0 ? 'var(--color-gain)' : 'var(--color-loss)' }}>
                  {fmtReturn(s.ret1d)}
                </td>
                <td className={styles.numCell} style={{ color: (s.ret5d ?? 0) >= 0 ? 'var(--color-gain)' : 'var(--color-loss)' }}>
                  {fmtReturn(s.ret5d)}
                </td>
                <td className={styles.numCell} style={{ color: (s.ret10d ?? 0) >= 0 ? 'var(--color-gain)' : 'var(--color-loss)' }}>
                  {fmtReturn(s.ret10d)}
                </td>
                <td className={styles.numCell} style={{ fontWeight: 600, color: 'var(--accent)' }}>{bestLabel}</td>
                <td className={`${styles.numCell} ${styles.colVsSpy}`} style={{ color: (s.ret5d_vs_spy ?? 0) >= 0 ? 'var(--color-gain)' : 'var(--color-loss)' }}>
                  {fmtReturn(s.ret5d_vs_spy)}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Expand hint (bottom) ───────────────────────────────── */}
      {hiddenCount > 0 && (
        <button className={styles.expandBtn} onClick={() => setExpanded(v => !v)}>
          {expanded
            ? `▲ Show fewer (${DEFAULT_SHOW})`
            : `▼ Show all ${filtered.length} (${hiddenCount} more)`}
        </button>
      )}
    </div>
  )
}

// ── Config bar (preset + capital base) ───────────────────────────────

function ConfigBar({ cfg, onApplyPreset, onUpdateConfig }: {
  cfg: PortfolioConfig
  onApplyPreset: (presetId: string) => void
  onUpdateConfig: (patch: Partial<PortfolioConfig>) => void
}) {
  const isCustom = cfg.presetId === 'custom'
  return (
    <div className={styles.configBar}>
      <label className={styles.configField}>
        <span>Preset</span>
        <select
          value={isCustom ? 'custom' : cfg.presetId}
          onChange={e => { if (e.target.value !== 'custom') onApplyPreset(e.target.value) }}
        >
          {isCustom && <option value="custom">Custom</option>}
          {BUILTIN_PRESETS.map(p => <option key={p.presetId} value={p.presetId}>{p.presetName}</option>)}
        </select>
      </label>
      <label className={styles.configField}>
        <span>Capital base</span>
        <input type="number" min={0} step={10000} value={cfg.capitalBase}
          onChange={e => onUpdateConfig({ capitalBase: Math.max(0, Number(e.target.value)) })} />
      </label>
      <label className={styles.configField}>
        <span>Currency</span>
        <select value={cfg.currency} onChange={e => onUpdateConfig({ currency: e.target.value })}>
          <option value="HKD">HKD</option>
          <option value="USD">USD</option>
        </select>
      </label>
      <label className={styles.configField}>
        <span>ETF base %</span>
        <input type="number" min={0} max={100} step={5} value={Math.round(cfg.etfBasePct * 100)}
          onChange={e => onUpdateConfig({ etfBasePct: Math.min(1, Math.max(0, Number(e.target.value) / 100)) })} />
      </label>
      <span className={styles.configHint}>
        {isCustom ? '✎ Custom config' : `${cfg.presetName}`} · single-stock cap {(cfg.risk.maxSingleStockPct * 100).toFixed(0)}% = {fmtMoney(maxSingleStockValue(cfg), cfg.currency)}
      </span>
    </div>
  )
}

// ── Sub-tab navigation ───────────────────────────────────────────────

type SubTab = 'portfolio' | 'etf' | 'plan'

function PortfolioSubNav({ active, onChange }: { active: SubTab; onChange: (t: SubTab) => void }) {
  const tabs: { id: SubTab; label: string }[] = [
    { id: 'portfolio', label: '組合 Portfolio' },
    { id: 'etf', label: 'ETF 配置 Allocation' },
    { id: 'plan', label: '計劃參考 Plan' },
  ]
  return (
    <div className={styles.subNav}>
      {tabs.map(t => (
        <button key={t.id} className={active === t.id ? styles.subNavActive : styles.subNavItem} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── ETF Allocation Model (transparent, rules-based — NOT a signal) ────

function EtfAllocationTab({ cfg, etfTargets, onAddEtf, onRemoveEtf, onUpdateEtf }: {
  cfg: PortfolioConfig
  etfTargets: { id: string; ticker: string; name: string; allocationPct: number }[]
  onAddEtf: (ticker: string, allocPct: number) => void
  onRemoveEtf: (id: string) => void
  onUpdateEtf: (id: string, allocPct: number) => void
}) {
  const money = (v: number) => fmtMoney(v, cfg.currency)
  const base = etfBaseValue(cfg)
  const totalPct = etfTargets.reduce((s, t) => s + t.allocationPct, 0)

  // Group weights by sleeve
  const bySleeve = new Map<EtfSleeve, number>()
  for (const t of etfTargets) {
    const sleeve = etfRef(t.ticker).sleeve
    bySleeve.set(sleeve, (bySleeve.get(sleeve) ?? 0) + t.allocationPct)
  }
  const sleeveRows = SLEEVE_ORDER
    .filter(s => bySleeve.has(s))
    .map(s => ({ sleeve: s, pct: bySleeve.get(s)! }))

  // Concentration: how much sits in highly-correlated equity-beta sleeves
  const equityBetaPct = (bySleeve.get('US Equity Beta') ?? 0) + (bySleeve.get('Growth') ?? 0) + (bySleeve.get('Small/Mid Cap') ?? 0)
  const diversifierPct = (bySleeve.get('Gold / Real Assets') ?? 0) + (bySleeve.get('Bonds / Cash') ?? 0)
  const equityShare = totalPct > 0 ? equityBetaPct / totalPct : 0

  const [newTicker, setNewTicker] = useState('')
  const [newAlloc, setNewAlloc] = useState('10')

  return (
    <>
      <section className={styles.panelCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>ETF Allocation Model / ETF 配置模型</h2>
            <p className={styles.subtle}>
              Transparent, rules-based allocation aid — <strong>not a predictive signal</strong>. ETFs are beta
              instruments (EXECUTION_PLAN §4: no edge claim). Diversification comes from holding
              <em> low-correlation sleeves</em>, not more tickers in the same sleeve.
            </p>
          </div>
        </div>

        {/* Diversification headline */}
        <div className={styles.allocGrid}>
          <div className={styles.allocCard}>
            <span>ETF Base</span><strong>{money(base)}</strong>
            <small>{(cfg.etfBasePct * 100).toFixed(0)}% of {money(cfg.capitalBase)}</small>
          </div>
          <div className={styles.allocCard}>
            <span>Total Target</span>
            <strong className={totalPct !== 100 ? styles.breachText : ''}>{totalPct}%</strong>
            <small>{totalPct === 100 ? '✓ balanced' : totalPct > 100 ? 'over-allocated' : 'under-allocated'}</small>
          </div>
          <div className={styles.allocCard}>
            <span>Equity Beta</span>
            <strong className={equityShare > 0.85 ? styles.breachText : ''}>{(equityShare * 100).toFixed(0)}%</strong>
            <small>SPY/QQQ/IWM ≈ 0.85–0.95 corr</small>
          </div>
          <div className={styles.allocCard}>
            <span>True Diversifiers</span>
            <strong style={{ color: 'var(--color-gain)' }}>{diversifierPct}%</strong>
            <small>gold + cash/bonds</small>
          </div>
        </div>

        {equityShare > 0.85 && totalPct > 0 && (
          <div className={styles.alertItem} data-severity="warn" style={{ marginTop: 12 }}>
            ⚠️ {(equityShare * 100).toFixed(0)}% of the ETF base sits in highly-correlated US equity beta
            (SPY/QQQ/IWM move together in a drawdown). The only real ballast is gold + cash/bonds ({diversifierPct}%).
          </div>
        )}
      </section>

      {/* Sleeve breakdown */}
      <section className={styles.panelCard}>
        <div className={styles.sectionHeader}><div><h2>By Sleeve / 按資產類別</h2><p className={styles.subtle}>Where the real diversification is — grouped by correlation behaviour.</p></div></div>
        <div className={styles.sleeveList}>
          {sleeveRows.map(({ sleeve, pct }) => (
            <div key={sleeve} className={styles.sleeveRow}>
              <span className={styles.sleeveName}>{sleeve}</span>
              <div className={styles.sleeveBarTrack}>
                <div className={styles.sleeveBarFill} data-sleeve={sleeve} style={{ width: `${Math.min(100, totalPct > 0 ? (pct / totalPct) * 100 : 0)}%` }} />
              </div>
              <span className={styles.sleevePct}>{pct}%</span>
            </div>
          ))}
          {sleeveRows.length === 0 && <p className={styles.subtle}>No ETF targets configured.</p>}
        </div>
      </section>

      {/* Per-ETF table with role + why */}
      <section className={styles.panelCard}>
        <div className={styles.sectionHeader}><div><h2>Targets / 目標明細</h2><p className={styles.subtle}>Each ETF's role and approximate correlation to SPY (illustrative reference).</p></div></div>
        <div className={styles.tableWrap}>
          <table className={styles.positionsTable}>
            <thead><tr><th>Ticker</th><th>Sleeve</th><th>Role / 為什麼</th><th className={styles.numHeader}>~Corr SPY</th><th className={styles.numHeader}>Target %</th><th className={styles.numHeader}>Value</th><th></th></tr></thead>
            <tbody>
              {etfTargets.map(t => {
                const ref = etfRef(t.ticker)
                return (
                  <tr key={t.id} className={styles.positionRow}>
                    <td className={styles.tickerCell}><strong>{t.ticker}</strong></td>
                    <td><span className={styles.sleeveTag} data-sleeve={ref.sleeve}>{ref.sleeve}</span></td>
                    <td className={styles.etfRoleCell}>{ref.role}</td>
                    <td className={styles.numCell} style={{ color: ref.corrToSpy >= 0.7 ? 'var(--color-loss)' : ref.corrToSpy <= 0.2 ? 'var(--color-gain)' : 'var(--text-secondary)' }}>{ref.corrToSpy.toFixed(2)}</td>
                    <td className={styles.numCell}>
                      <input className={styles.etfAllocInput} type="number" min={0} max={100} value={t.allocationPct}
                        onChange={e => onUpdateEtf(t.id, Math.max(0, Math.min(100, Number(e.target.value))))} />
                    </td>
                    <td className={styles.numCell}>{money(base * t.allocationPct / 100)}</td>
                    <td className={styles.actionsCell}><button className={styles.actionBtn} onClick={() => onRemoveEtf(t.id)} title="Remove">✕</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className={styles.addEtfRow} style={{ marginTop: 12 }}>
          <input className={styles.etfInput} placeholder="Ticker e.g. TLT" value={newTicker} onChange={e => setNewTicker(e.target.value.toUpperCase())} maxLength={6} />
          <input className={styles.etfAllocInput} type="number" min={1} max={100} value={newAlloc} onChange={e => setNewAlloc(e.target.value)} />
          <span className={styles.unit}>%</span>
          <button className={styles.etfAddBtn} onClick={() => { const pct = parseInt(newAlloc, 10) || 10; if (newTicker) { onAddEtf(newTicker, pct); setNewTicker(''); setNewAlloc('10') } }}>Add ETF</button>
        </div>
      </section>

      <section className={styles.limitationsFooter}>
        <h3>How to read this / 怎麼用</h3>
        <ul>
          <li>This is a <strong>framework, not a forecast</strong> — it tells you the structure of your basket, not what will go up.</li>
          <li>Correlation figures are illustrative long-run references, not live-computed. They show <em>behaviour</em>, not precision.</li>
          <li>Holding SPY + QQQ + IWM is mostly one bet (US equity beta). In a selloff they fall together.</li>
          <li>Gold (GLD) and cash/bonds (SGOV/TLT) are the parts that hold up when equities drop — that's your ballast.</li>
        </ul>
      </section>
    </>
  )
}

// ── Plan reference (read-only worked example) ────────────────────────

function PlanReferenceTab({ activePresetId, onApplyPreset }: { activePresetId: string; onApplyPreset: (id: string) => void }) {
  const phases = BUILTIN_PRESETS.filter(p => p.presetId.startsWith('personal-'))
  return (
    <>
      <section className={styles.panelCard}>
        <div className={styles.sectionHeader}><div>
          <h2>Capital Plan / 資本計劃</h2>
          <p className={styles.subtle}>A worked example, not a rule. Reference for how the tool above is meant to be configured. Source: EXECUTION_PLAN §1–§2.</p>
        </div></div>
        <div className={styles.allocGrid}>
          {phases.map(p => (
            <div key={p.presetId} className={`${styles.allocCard} ${activePresetId === p.presetId ? styles.allocCardActive : ''}`}>
              <span>{p.presetName.replace('Tony · ', '')}</span>
              <strong>{fmtMoney(p.capitalBase, p.currency)}</strong>
              <small>ETF base {(p.etfBasePct * 100).toFixed(0)}% · stocks {(100 - p.etfBasePct * 100).toFixed(0)}%</small>
              <button className={styles.secondaryBtn} style={{ marginTop: 8 }} onClick={() => onApplyPreset(p.presetId)}>
                {activePresetId === p.presetId ? '✓ Active' : 'Apply'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.panelCard}>
        <div className={styles.sectionHeader}><div><h2>Risk Rules / 風控規則 (§2)</h2><p className={styles.subtle}>Non-negotiable. Stored as % of capital base so they scale across phases.</p></div></div>
        <div className={styles.tableWrap}>
          <table className={styles.positionsTable}>
            <thead><tr><th>Rule</th><th>Value</th></tr></thead>
            <tbody>
              <tr className={styles.positionRow}><td>Max single stock</td><td>10% of base</td></tr>
              <tr className={styles.positionRow}><td>Max single sector</td><td>25% of book</td></tr>
              <tr className={styles.positionRow}><td>Max positions</td><td>15 total (incl. ETFs)</td></tr>
              <tr className={styles.positionRow}><td>Hard stop (stocks)</td><td>−10% from entry</td></tr>
              <tr className={styles.positionRow}><td>Trailing stop (stocks)</td><td>−20% from peak</td></tr>
              <tr className={styles.positionRow}><td>Min cash</td><td>5% RISK_ON / 15% NEUTRAL / 30% RISK_OFF</td></tr>
              <tr className={styles.positionRow}><td>Pre-earnings</td><td>Reduce 50% one week before</td></tr>
              <tr className={styles.positionRow}><td>Max new / month</td><td>4</td></tr>
              <tr className={styles.positionRow}><td>3 consecutive losses</td><td>Pause 2 weeks</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.limitationsFooter}>
        <h3>Honest Limitations / 研究限制</h3>
        <ul>
          <li>Stock funnel is a discretionary heuristic, not a backtested system.</li>
          <li>Fundamentals filter uses current data only — no point-in-time validation possible with free data.</li>
          <li>Medium-term backtest is single-regime (2025-H2 bull). Other regimes unobserved.</li>
          <li>5-day UPPER edge ≠ 3–6 month edge. Different holding period, different risk.</li>
          <li>ETF allocation is a beta basket with no edge claim — sizing is judgment, not prediction.</li>
        </ul>
      </section>
    </>
  )
}

export default function PortfolioView() {
  const snapshot = useSnapshot()
  const store = usePortfolioStore()
  const [subTab, setSubTab] = useState<SubTab>('portfolio')
  const [showAddPosition, setShowAddPosition] = useState(false)
  const [editingPosition, setEditingPosition] = useState<PortfolioPosition | null>(null)
  const [showJournal, setShowJournal] = useState(false)
  const screenerRef = useRef<HTMLDivElement>(null)

  const regime = snapshot.status === 'ok' ? snapshot.snapshot.regime : 'neutral'
  const sectorMap = useMemo(() => {
    const m: Record<string, string> = {}
    if (snapshot.status === 'ok') {
      for (const s of snapshot.snapshot.stocks) {
        if (s.sector) m[s.ticker] = s.sector
      }
    }
    return m
  }, [snapshot])

  const prevCloseMap = useMemo(() => {
    const m: Record<string, number> = {}
    if (snapshot.status === 'ok') {
      for (const s of snapshot.snapshot.stocks) {
        if (s.prevClose != null) m[s.ticker] = s.prevClose
      }
    }
    return m
  }, [snapshot])
  const alerts = useMemo(
    () => computeRiskAlerts(store.positions, store.journal, regime, store.config, sectorMap),
    [store.positions, store.journal, regime, store.config, sectorMap],
  )

  const handleSavePosition = (data: Omit<PortfolioPosition, 'id'>) => {
    if (editingPosition) { store.updatePosition(editingPosition.id, data); setEditingPosition(null) }
    else { store.addPosition(data) }
    setShowAddPosition(false)
  }

  const handleTrackCandidate = (c: ScreenerCandidate) => {
    const today = new Date().toISOString().slice(0, 10)
    store.addPaperPosition({
      ticker: c.ticker,
      name: c.name,
      signalDate: today,
      signalLabel: c.label,
      entryPrice: c.close ?? 0,
      entryDate: today,
      shares: c.close !== null && c.close > 0
        ? Math.max(1, Math.floor(maxSingleStockValue(store.config) / c.close))
        : 1,
      stopLoss: c.close !== null ? +(c.close * (1 + store.config.risk.hardStopPct)).toFixed(2) : null,
      exitPrice: null,
      exitDate: null,
      exitReason: '',
      notes: `Screener: ${c.label}, RS ${c.rsRank}, P/E ${c.pe?.toFixed(0) ?? '?'}, ROE ${c.roe !== null ? (c.roe*100).toFixed(0)+'%' : '?'}`,
    })
  }

  const handleClosePaper = (id: string, exitPrice: number) => {
    store.updatePaperPosition(id, {
      exitPrice,
      exitDate: new Date().toISOString().slice(0, 10),
      exitReason: 'manual close',
    })
  }

  if (snapshot.status === 'loading') return <div className={styles.loading}>Loading regime data...</div>

  return (
    <div className={styles.portfolio}>
      <ConfigBar cfg={store.config} onApplyPreset={store.applyPreset} onUpdateConfig={store.updateConfig} />
      <PortfolioSubNav active={subTab} onChange={setSubTab} />

      {subTab === 'etf' && (
        <EtfAllocationTab
          cfg={store.config}
          etfTargets={store.etfTargets}
          onAddEtf={(ticker, allocPct) => store.addEtfTarget({ ticker, name: ticker, allocationPct: allocPct })}
          onRemoveEtf={store.removeEtfTarget}
          onUpdateEtf={(id, allocPct) => store.updateEtfTarget(id, { allocationPct: allocPct })}
        />
      )}

      {subTab === 'plan' && (
        <PlanReferenceTab activePresetId={store.config.presetId} onApplyPreset={store.applyPreset} />
      )}

      {subTab === 'portfolio' && (
      <>
      {alerts.length > 0 && (
        <section className={styles.alertsSection}>
          {alerts.map((a, i) => (
            <div key={i} className={styles.alertItem} data-severity={a.severity}>
              {a.severity === 'breach' ? '🚫' : '⚠️'} {a.message}
            </div>
          ))}
        </section>
      )}

      <PortfolioPnLSummary
        positions={store.positions}
        etfTargets={store.etfTargets}
        cfg={store.config}
        onAddEtf={(ticker, allocPct) => store.addEtfTarget({ ticker, name: ticker, allocationPct: allocPct })}
        onRemoveEtf={store.removeEtfTarget}
      />

      <section className={styles.panelCard}>
        <div className={styles.sectionHeader}>
          <div><h2>Allocation / 配置概覽</h2><p className={styles.subtle}>Capital base {fmtMoney(store.config.capitalBase, store.config.currency)} · manual entry via Futu</p></div>
        </div>
        <AllocationSummary positions={store.positions} cfg={store.config} />
      </section>

      <section className={styles.panelCard}>
        <div className={styles.sectionHeader}>
          <div><h2>Positions / 持倉</h2><p className={styles.subtle}>Manual entry. Live prices from Yahoo (15-min delayed). P&L shown per row.</p></div>
          <button className={styles.primaryBtn} onClick={() => { setEditingPosition(null); setShowAddPosition(v => !v) }}>{showAddPosition ? '—' : '+ Add Position'}</button>
        </div>
        {showAddPosition && <PositionForm initial={editingPosition ?? undefined} onSave={handleSavePosition} onCancel={() => { setShowAddPosition(false); setEditingPosition(null) }} />}
        {store.positions.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No positions yet. Add your first position above.</p>
            <p className={styles.subtle}>ETF reference: see ETF Base Target card above.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.positionsTable}>
              <thead><tr><th>Ticker</th><th className={styles.numHeader}>Shares</th><th className={styles.numHeader}>Entry $</th><th className={styles.numHeader}>Live $</th><th className={styles.numHeader}>Cost Basis</th><th className={styles.numHeader}>P&L</th><th className={styles.numHeader}>Stop</th><th className={styles.numHeader}>Days</th><th></th></tr></thead>
              <tbody>
                {store.positions.map(p => <PositionRow key={p.id} pos={p} onEdit={id => { const pos = store.positions.find(x => x.id === id); if (pos) { setEditingPosition(pos); setShowAddPosition(true) } }} onRemove={store.removePosition} prevClose={prevCloseMap[p.ticker]} hardStopPct={store.config.risk.hardStopPct} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <WeeklyChecklist />

      <section className={styles.panelCard}>
        <div className={styles.sectionHeader}>
          <div><h2>Decision Cockpit / 決策艙</h2><p className={styles.subtle}>Weekly screener candidates + trade journal.</p></div>
        </div>
        <div className={styles.cockpitGrid}>
          <div ref={screenerRef}>
            <ScreenerPanel onTrackCandidate={handleTrackCandidate} />
          </div>
          <div className={styles.cockpitCard}>
            <div className={styles.journalHeader}>
              <h3>Trade Journal / 交易日誌</h3>
              <button className={styles.primaryBtn} onClick={() => setShowJournal(v => !v)}>{showJournal ? '—' : '+ New Entry'}</button>
            </div>
            {showJournal && <JournalForm onSave={e => { store.addJournalEntry(e); setShowJournal(false) }} onCancel={() => setShowJournal(false)} />}
            {store.journal.length === 0 ? (
              <p className={styles.subtle}>No journal entries yet. Log every trade with reasons.</p>
            ) : (
              <div className={styles.journalList}>
                {store.journal.slice(0, 20).map(entry => (
                  <div key={entry.id} className={styles.journalEntry}>
                    <div className={styles.journalEntryHead}>
                      <span className={styles.journalAction} data-action={entry.action}>{entry.action}</span>
                      <strong>{entry.ticker}</strong>
                      <span>{entry.shares} @ ${entry.price.toFixed(2)}</span>
                      <span className={styles.journalDate}>{entry.date}</span>
                      <button className={styles.actionBtn} onClick={() => store.removeJournalEntry(entry.id)}>✕</button>
                    </div>
                    <p className={styles.journalReason}>{entry.reason}</p>
                    {entry.exitConditions && <p className={styles.journalExit}>Exit: {entry.exitConditions}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.panelCard}>
        <PaperTracker
          paperPositions={store.paperPositions}
          onClose={handleClosePaper}
          onRemove={store.removePaperPosition}
          prevCloseMap={prevCloseMap}
          hardStopPct={store.config.risk.hardStopPct}
          onGoToScreener={() => screenerRef.current?.scrollIntoView({ behavior: 'smooth' })}
        />
      </section>

      <section className={styles.panelCard}>
        <SystemPaperReference />
      </section>

      <section className={styles.limitationsFooter}>
        <h3>Honest Limitations / 研究限制</h3>
        <ul>
          <li>Stock funnel is a discretionary heuristic, not a backtested system.</li>
          <li>Fundamentals filter uses current data only — no point-in-time validation possible with free data.</li>
          <li>Medium-term backtest is single-regime (2025-H2 bull). Other regimes unobserved.</li>
          <li>5-day UPPER edge ≠ 3–6 month edge. Different holding period, different risk.</li>
          <li>Live prices from Yahoo are 15-min delayed. P&L indicative only.</li>
          <li>Position data is browser-local. No cloud sync. Export/backup not yet built.</li>
        </ul>
      </section>
      </>
      )}
    </div>
  )
}
