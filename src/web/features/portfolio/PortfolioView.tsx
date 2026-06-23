import { useState, useMemo, useEffect } from 'react'
import { useSnapshot } from '../../shared/hooks/useSnapshot'
import { useIntraday } from '../../shared/hooks/useIntraday'
import { usePortfolioStore, RISK_LIMITS, type PortfolioPosition, type PositionTier, type JournalAction, type JournalEntry, type PaperPosition } from './usePortfolioStore'
import styles from './PortfolioView.module.css'

// ── Helpers ──────────────────────────────────────────────────────────

function fmtHKD(value: number): string {
  return `HK$${value.toLocaleString('en-HK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
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

function usePositionPrice(ticker: string): PriceState {
  const state = useIntraday(ticker, '1D')
  if (state.status === 'loading') return { status: 'loading' }
  if (state.status === 'error' || state.status === 'idle') return { status: 'error' }
  const bars = state.bars
  if (bars.length < 2) return { status: 'error' }
  return {
    status: 'ok',
    price: bars[bars.length - 1].close,
    prevClose: bars.length >= 2 ? bars[bars.length - 2].close : null,
  }
}

// ── Position Row ─────────────────────────────────────────────────────

function PositionRow({
  pos,
  onEdit,
  onRemove,
}: {
  pos: PortfolioPosition
  onEdit: (id: string) => void
  onRemove: (id: string) => void
}) {
  const priceState = usePositionPrice(pos.ticker)
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

  const hardStopHit = livePrice !== null && livePrice <= pos.entryPrice * 0.9

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
        <label>Entry Price (HKD)<input type="number" value={form.entryPrice || ''} onChange={e => setForm(p => ({ ...p, entryPrice: Number(e.target.value) }))} placeholder="0.00" min={0} step={0.01} /></label>
        <label>Entry Date<input type="date" value={form.entryDate} onChange={e => setForm(p => ({ ...p, entryDate: e.target.value }))} /></label>
      </div>
      <div className={styles.formRow}>
        <label>Stop Loss (HKD, optional)<input type="number" value={form.stopLoss ?? ''} onChange={e => { const v = e.target.value; setForm(p => ({ ...p, stopLoss: v === '' ? null : Number(v) })) }} placeholder="e.g. 90.00" min={0} step={0.01} /></label>
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
        <label>Price (HKD)<input type="number" value={form.price || ''} onChange={e => setForm(p => ({ ...p, price: Number(e.target.value) }))} placeholder="0.00" min={0} step={0.01} /></label>
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

function computeRiskAlerts(positions: PortfolioPosition[], journal: JournalEntry[], regime: string): RiskAlert[] {
  const alerts: RiskAlert[] = []

  if (positions.length > RISK_LIMITS.maxPositions)
    alerts.push({ severity: 'breach', message: `${positions.length} positions (limit: ${RISK_LIMITS.maxPositions})` })
  else if (positions.length >= RISK_LIMITS.maxPositions - 2)
    alerts.push({ severity: 'warn', message: `${positions.length} positions — approaching limit of ${RISK_LIMITS.maxPositions}` })

  positions.forEach(p => {
    const v = p.shares * p.entryPrice
    if (v > RISK_LIMITS.maxSingleStockHKD)
      alerts.push({ severity: 'breach', message: `${p.ticker}: ${fmtHKD(v)} exceeds HK$50K limit` })
  })

  const totalInvested = positions.reduce((s, p) => s + p.shares * p.entryPrice, 0)
  const cashPct = Math.max(0, 1 - totalInvested / 500_000)
  const regimeKey = regime === 'long_friendly' ? 'RISK_ON' : regime === 'short_friendly' ? 'RISK_OFF' : 'NEUTRAL'
  const minCash = RISK_LIMITS.minCashPct[regimeKey] ?? 0.15
  if (cashPct < minCash)
    alerts.push({ severity: 'breach', message: `Cash ${(cashPct * 100).toFixed(0)}% below ${regimeKey} floor ${(minCash * 100).toFixed(0)}%` })

  // 3-consecutive-loss flag
  const closedTrades = journal.filter(e => e.action === 'CLOSE' || e.action === 'SELL').sort((a, b) => b.date.localeCompare(a.date))
  const recentCloses = closedTrades.filter(e => (Date.now() - new Date(e.date).getTime()) / 86400000 <= 14)
  if (recentCloses.length >= 3)
    alerts.push({ severity: 'warn', message: `${recentCloses.length} closes in last 14 days — check P&L. Pause 2 weeks if 3 consecutive losses.` })

  // Monthly new-position counter
  const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const buysThisMonth = journal.filter(e => e.action === 'BUY' && e.date.startsWith(thisMonth)).length
  if (buysThisMonth >= RISK_LIMITS.maxNewPerMonth)
    alerts.push({ severity: 'breach', message: `${buysThisMonth} new positions this month (limit: ${RISK_LIMITS.maxNewPerMonth})` })
  else if (buysThisMonth >= RISK_LIMITS.maxNewPerMonth - 1)
    alerts.push({ severity: 'warn', message: `${buysThisMonth}/${RISK_LIMITS.maxNewPerMonth} new positions this month` })

  return alerts
}

// ── P&L Summary Bar ──────────────────────────────────────────────────

function PortfolioPnLSummary({ positions }: { positions: PortfolioPosition[] }) {
  const totalInvested = positions.reduce((s, p) => s + p.shares * p.entryPrice, 0)
  const allocPct = totalInvested > 0 ? (totalInvested / 500_000) * 100 : 0
  return (
    <div className={styles.pnlSummary}>
      <div className={styles.pnlSummaryCard}>
        <span>Portfolio Value (book)</span>
        <strong>{fmtHKD(totalInvested)}</strong>
        <small>{allocPct.toFixed(0)}% of Phase 1 HK$500K</small>
      </div>
      <div className={styles.pnlSummaryCard}>
        <span>ETF Base Target</span>
        <strong>HK$300,000</strong>
        <small>SPY 40% · QQQ 25% · IWM 15% · GLD 10% · SGOV 10%</small>
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

function AllocationSummary({ positions }: { positions: PortfolioPosition[] }) {
  const totalInvested = positions.reduce((s, p) => s + p.shares * p.entryPrice, 0)
  const cashPct = Math.max(0, 1 - totalInvested / 500_000)
  const byTier = { ETF: 0, Core: 0, Tactical: 0 }
  positions.forEach(p => { byTier[p.tier] += p.shares * p.entryPrice })

  return (
    <div className={styles.allocGrid}>
      <div className={styles.allocCard}><span>Total Invested</span><strong>{fmtHKD(totalInvested)}</strong></div>
      <div className={styles.allocCard}><span>Cash (Phase 1 HK$500K)</span><strong className={cashPct < 0.05 ? styles.breachText : ''}>{(cashPct * 100).toFixed(0)}%</strong></div>
      <div className={styles.allocCard}><span>ETF Allocation</span><strong>{fmtHKD(byTier.ETF)}</strong><small>{totalInvested > 0 ? ((byTier.ETF / totalInvested) * 100).toFixed(0) : 0}%</small></div>
      <div className={styles.allocCard}><span>Core / Tactical</span><strong>{fmtHKD(byTier.Core + byTier.Tactical)}</strong><small>{totalInvested > 0 ? (((byTier.Core + byTier.Tactical) / totalInvested) * 100).toFixed(0) : 0}%</small></div>
      <div className={styles.allocCard}><span>Positions</span><strong>{positions.length}</strong><small>max {RISK_LIMITS.maxPositions}</small></div>
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
}: {
  pp: PaperPosition
  onClose: (id: string, exitPrice: number) => void
  onRemove: (id: string) => void
}) {
  const priceState = usePositionPrice(pp.ticker)
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

  const hardStopHit = isOpen && livePrice !== null && livePrice <= pp.entryPrice * 0.9

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
}: {
  paperPositions: PaperPosition[]
  onClose: (id: string, exitPrice: number) => void
  onRemove: (id: string) => void
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
        <button className={styles.goScreenerBtn} onClick={() => {
          const el = document.querySelector('button:has-text("📋 Track")');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }}>↑ Go to Screener</button>
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
                {openPositions.map(pp => <PaperRow key={pp.id} pp={pp} onClose={onClose} onRemove={onRemove} />)}
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
  const wins = allSignals.filter(s => (s.ret5d ?? 0) > 0).length
  const total = allSignals.length
  const avgRet = allSignals.reduce((s, x) => s + (x.ret5d ?? 0), 0) / total
  const avg1d = allSignals.reduce((s, x) => s + (x.ret1d ?? 0), 0) / total
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
              <div style={{ width: `${((wins / total) * 100).toFixed(0)}%`, height: '100%', borderRadius: 3, background: wins / total >= 0.5 ? 'var(--color-gain)' : 'var(--color-loss)', transition: 'width 0.4s' }} />
            </div>
            <strong style={{ color: wins / total >= 0.5 ? 'var(--color-gain)' : 'var(--color-loss)', fontSize: '0.95rem' }}>
              {((wins / total) * 100).toFixed(0)}%
            </strong>
          </div>
          <small>{wins}/{total}</small>
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
          <span>Proj. Annual / Worst</span>
          <strong>
            {bestTotal > 0 && avgBestRet != null ? (
              <><span style={{ color: 'var(--color-gain)' }}>{fmtReturn(Math.pow(1 + avgBestRet, 250 / avgDays) - 1)}</span>
              {' / '}
              <span style={{ color: 'var(--color-loss)' }}>{avgWorstRet != null ? fmtReturn(Math.pow(1 + avgWorstRet, 250 / avgDays) - 1) : '—'}</span></>
            ) : '—'}
          </strong>
          <small>best / worst window</small>
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

export default function PortfolioView() {
  const snapshot = useSnapshot()
  const store = usePortfolioStore()
  const [showAddPosition, setShowAddPosition] = useState(false)
  const [editingPosition, setEditingPosition] = useState<PortfolioPosition | null>(null)
  const [showJournal, setShowJournal] = useState(false)

  const regime = snapshot.status === 'ok' ? snapshot.snapshot.regime : 'neutral'
  const alerts = useMemo(() => computeRiskAlerts(store.positions, store.journal, regime), [store.positions, store.journal, regime])

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
      shares: 100, // default paper size
      stopLoss: c.close !== null ? +(c.close * 0.9).toFixed(2) : null, // −10% hard stop
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
      <section className={styles.regimeBanner}>
        <div className={styles.regimeBadge} data-regime={regime}>
          <span>Market Regime</span>
          <strong>{regime === 'long_friendly' ? 'RISK_ON ↗' : regime === 'short_friendly' ? 'RISK_OFF ↘' : 'NEUTRAL →'}</strong>
        </div>
        <div className={styles.regimeRules}>
          <span>Cash floor: {regime === 'long_friendly' ? '5%' : regime === 'short_friendly' ? '30%' : '15%'}</span>
          <span>Max new/month: {RISK_LIMITS.maxNewPerMonth}</span>
          <span>Max positions: {RISK_LIMITS.maxPositions}</span>
          <span>Hard stop: −10%</span>
        </div>
      </section>

      {alerts.length > 0 && (
        <section className={styles.alertsSection}>
          {alerts.map((a, i) => (
            <div key={i} className={styles.alertItem} data-severity={a.severity}>
              {a.severity === 'breach' ? '🚫' : '⚠️'} {a.message}
            </div>
          ))}
        </section>
      )}

      <PortfolioPnLSummary positions={store.positions} />

      <section className={styles.panelCard}>
        <div className={styles.sectionHeader}>
          <div><h2>Allocation / 配置概覽</h2><p className={styles.subtle}>Phase 1 capital: HK$500,000 · manual entry via Futu</p></div>
        </div>
        <AllocationSummary positions={store.positions} />
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
            <p className={styles.subtle}>ETF reference: SPY 40%, QQQ 25%, IWM 15%, GLD 10%, SGOV 10% of HK$300K ETF base.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.positionsTable}>
              <thead><tr><th>Ticker</th><th className={styles.numHeader}>Shares</th><th className={styles.numHeader}>Entry $</th><th className={styles.numHeader}>Live $</th><th className={styles.numHeader}>Cost Basis</th><th className={styles.numHeader}>P&L</th><th className={styles.numHeader}>Stop</th><th className={styles.numHeader}>Days</th><th></th></tr></thead>
              <tbody>
                {store.positions.map(p => <PositionRow key={p.id} pos={p} onEdit={id => { const pos = store.positions.find(x => x.id === id); if (pos) { setEditingPosition(pos); setShowAddPosition(true) } }} onRemove={store.removePosition} />)}
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
          <ScreenerPanel onTrackCandidate={handleTrackCandidate} />
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
    </div>
  )
}
