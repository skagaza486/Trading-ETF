#!/usr/bin/env node
/**
 * I5: Parameter Plateau offline runner
 *
 * Tests small parameter grids on LONG_CONFIRM signal conditions to check for
 * overfitting (plateau test). Output: per-grid-cell signal count, avg 5D return,
 * avg 5D vs SPY, and ATR stop-loss-adjusted return.
 *
 * Usage: node scripts/plateau-runner.mjs
 *
 * Reads Yahoo Finance history via the Cloudflare Worker proxy (must be running locally
 * or deployed). Falls back to a direct Yahoo CORS proxy if worker is unavailable.
 *
 * ATR stop-loss simulation: if price drops below (close - 2×ATR14) within 5 days
 * of signal, the return is capped at the stop-loss drawdown instead of the 5D return.
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Parameter grid ─────────────────────────────────────────────────────────
const RVOL_THRESHOLDS = [1.5, 1.6, 1.7, 1.8, 1.9, 2.0]
const BREAKOUT_LOOKBACKS = [15, 20, 25, 30]
const ATR_PERIOD = 14
const ATR_STOP_MULTIPLIER = 2.0
const FORWARD_DAYS = 5
const MIN_BARS = 250

// ── Watchlist (matches src/data/watchlist.ts) ───────────────────────────────
const WATCHLIST = [
  'AAPL', 'MSFT', 'NVDA', 'META', 'GOOGL', 'AMZN', 'TSLA',
  'JPM', 'GS', 'BAC', 'V', 'MA',
  'UNH', 'JNJ', 'PFE',
  'XOM', 'CVX',
  'HD', 'NKE', 'MCD',
  'SPY', 'QQQ'
]
const BENCHMARKS = ['SPY', 'QQQ', '^VIX']
const ALL_TICKERS = [...new Set([...WATCHLIST, ...BENCHMARKS])]

// ── Data fetching ───────────────────────────────────────────────────────────
const PROXY_BASE = 'http://localhost:8787'
const FALLBACK_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'

async function fetchHistory(ticker) {
  const url = `${PROXY_BASE}/api/history?ticker=${encodeURIComponent(ticker)}&range=2y&interval=1d`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    return parseBars(json, ticker)
  } catch {
    // Worker not available — skip this ticker
    return null
  }
}

function parseBars(json, ticker) {
  const result = json?.chart?.result?.[0]
  if (!result) return null
  const timestamps = result.timestamp ?? []
  const quote = result.indicators?.quote?.[0] ?? {}
  const adjClose = result.indicators?.adjclose?.[0]?.adjclose ?? []
  const bars = []
  for (let i = 0; i < timestamps.length; i++) {
    const close = adjClose[i] ?? quote.close?.[i]
    if (!close || !quote.open?.[i]) continue
    bars.push({
      date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
      open: quote.open[i],
      high: quote.high[i],
      low: quote.low[i],
      close,
      volume: quote.volume?.[i] ?? 0
    })
  }
  return { ticker, bars }
}

// ── Technical indicators ────────────────────────────────────────────────────
function computeEMA(closes, period) {
  const k = 2 / (period + 1)
  const ema = new Array(closes.length).fill(null)
  let prev = null
  for (let i = 0; i < closes.length; i++) {
    if (prev === null) {
      if (i >= period - 1) {
        prev = closes.slice(0, period).reduce((s, v) => s + v, 0) / period
        ema[i] = prev
      }
    } else {
      prev = closes[i] * k + prev * (1 - k)
      ema[i] = prev
    }
  }
  return ema
}

function computeATR(bars, period) {
  const atr = new Array(bars.length).fill(null)
  const trs = bars.map((bar, i) => {
    if (i === 0) return bar.high - bar.low
    const prevClose = bars[i - 1].close
    return Math.max(bar.high - bar.low, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose))
  })
  let sum = 0
  for (let i = 0; i < trs.length; i++) {
    if (i < period) {
      sum += trs[i]
      if (i === period - 1) atr[i] = sum / period
    } else {
      atr[i] = (atr[i - 1] * (period - 1) + trs[i]) / period
    }
  }
  return atr
}

function computeRVOL(bars, period) {
  const vols = bars.map(b => b.volume)
  const rvol = new Array(bars.length).fill(null)
  for (let i = period; i < bars.length; i++) {
    const avg = vols.slice(i - period, i).reduce((s, v) => s + v, 0) / period
    rvol[i] = avg > 0 ? vols[i] / avg : null
  }
  return rvol
}

function computeCMF(bars, period) {
  const cmf = new Array(bars.length).fill(null)
  for (let i = period - 1; i < bars.length; i++) {
    let moneyFlowVol = 0, totalVol = 0
    for (let j = i - period + 1; j <= i; j++) {
      const { high, low, close, volume } = bars[j]
      const range = high - low
      const clv = range !== 0 ? ((close - low) - (high - close)) / range : 0
      moneyFlowVol += clv * volume
      totalVol += volume
    }
    cmf[i] = totalVol > 0 ? moneyFlowVol / totalVol : null
  }
  return cmf
}

function computeCLV(bars) {
  return bars.map(bar => {
    const range = bar.high - bar.low
    return range > 0 ? ((bar.close - bar.low) - (bar.high - bar.close)) / range : 0
  })
}

// ── Signal detection with parametric RVOL threshold and breakout lookback ──
function detectSignals(history, spyHistory, rvolThreshold, breakoutLookback) {
  const { bars } = history
  if (bars.length < MIN_BARS) return []

  const closes = bars.map(b => b.close)
  const ema20 = computeEMA(closes, 20)
  const ema50 = computeEMA(closes, 50)
  const ema200 = computeEMA(closes, 200)
  const rvol = computeRVOL(bars, 20)
  const cmf = computeCMF(bars, 20)
  const clv = computeCLV(bars)
  const atr = computeATR(bars, ATR_PERIOD)

  const spyCloses = spyHistory?.bars.map(b => b.close) ?? []
  const spyByDate = new Map(spyHistory?.bars.map(b => [b.date, b.close]) ?? [])

  const signals = []
  const start = Math.max(breakoutLookback + 1, 200, 20)

  for (let i = start; i < bars.length - FORWARD_DAYS; i++) {
    const bar = bars[i]
    const e20 = ema20[i]
    const e50 = ema50[i]
    const e200 = ema200[i]
    const rv = rvol[i]
    const cf = cmf[i]
    const cv = clv[i]
    const at = atr[i]

    if (!e20 || !e50 || !e200 || rv === null || cf === null || at === null) continue

    // ATR-normalised breakout
    const priorHigh = Math.max(...bars.slice(i - breakoutLookback, i).map(b => b.high))
    const breakout = bar.close > priorHigh + at * 0.5

    // LONG_CONFIRM conditions (parametric RVOL threshold)
    const isLongConfirm =
      breakout &&
      rv > rvolThreshold &&
      cf > 0.1 &&
      cv > 0.65 &&
      e20 > e50 &&
      bar.close >= e200

    if (!isLongConfirm) continue

    // Forward return
    const entryClose = bar.close
    const exitBar = bars[i + FORWARD_DAYS]
    if (!exitBar) continue
    const ret5d = (exitBar.close - entryClose) / entryClose

    // ATR stop-loss simulation
    const stopLevel = entryClose - ATR_STOP_MULTIPLIER * at
    let ret5dAdj = ret5d
    for (let k = i + 1; k <= i + FORWARD_DAYS; k++) {
      if (bars[k].low <= stopLevel) {
        ret5dAdj = (stopLevel - entryClose) / entryClose
        break
      }
    }

    // SPY return for same period
    const spyEntry = spyByDate.get(bar.date)
    const spyExit = spyByDate.get(exitBar.date)
    const ret5dVsSpy =
      spyEntry && spyExit ? ret5d - (spyExit - spyEntry) / spyEntry : null

    signals.push({ date: bar.date, ticker: history.ticker, ret5d, ret5dAdj, ret5dVsSpy })
  }

  return signals
}

// ── Stats helpers ──────────────────────────────────────────────────────────
function avg(arr) {
  const valid = arr.filter(v => v !== null && !isNaN(v))
  return valid.length === 0 ? null : valid.reduce((s, v) => s + v, 0) / valid.length
}

function fmt(v, decimals = 2) {
  return v === null ? 'n/a' : `${(v * 100).toFixed(decimals)}%`
}

function overfit(grid) {
  const scores = grid.map(c => c.avg5dAdj).filter(v => v !== null)
  if (scores.length < 2) return false
  const max = Math.max(...scores)
  const min = Math.min(...scores)
  return (max - min) > 0.02
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n📊 Plateau Runner — Parameter Grid Test\n')
  console.log(`Grid: RVOL ∈ [${RVOL_THRESHOLDS.join(', ')}] × Lookback ∈ [${BREAKOUT_LOOKBACKS.join(', ')}]`)
  console.log(`ATR stop-loss: close - ${ATR_STOP_MULTIPLIER}×ATR${ATR_PERIOD} within ${FORWARD_DAYS} days\n`)

  // Fetch all histories
  console.log('Fetching price histories...')
  const histories = {}
  for (const ticker of ALL_TICKERS) {
    process.stdout.write(`  ${ticker}... `)
    const h = await fetchHistory(ticker)
    if (h) {
      histories[ticker] = h
      process.stdout.write(`✓ (${h.bars.length} bars)\n`)
    } else {
      process.stdout.write('✗ (failed or proxy unavailable)\n')
    }
  }

  const spyHistory = histories.SPY
  const stockTickers = WATCHLIST.filter(t => !BENCHMARKS.includes(t))
  const available = stockTickers.filter(t => histories[t])

  if (available.length === 0) {
    console.log('\n⚠️  No stock histories available. Is the local Worker proxy running on port 8787?')
    console.log('   Start it with: npm run dev:worker  (or wrangler dev)')
    process.exit(1)
  }

  console.log(`\n✓ ${available.length}/${stockTickers.length} stock tickers loaded\n`)

  // Run grid
  const results = []
  for (const rvolThreshold of RVOL_THRESHOLDS) {
    for (const lookback of BREAKOUT_LOOKBACKS) {
      const allSignals = []
      for (const ticker of available) {
        const sigs = detectSignals(histories[ticker], spyHistory, rvolThreshold, lookback)
        allSignals.push(...sigs)
      }

      const n = allSignals.length
      const avg5d = avg(allSignals.map(s => s.ret5d))
      const avg5dAdj = avg(allSignals.map(s => s.ret5dAdj))
      const avg5dVsSpy = avg(allSignals.map(s => s.ret5dVsSpy))
      const stopHitRate = n > 0
        ? allSignals.filter(s => s.ret5dAdj < s.ret5d - 0.0001).length / n
        : null

      results.push({ rvolThreshold, lookback, n, avg5d, avg5dAdj, avg5dVsSpy, stopHitRate })
    }
  }

  // Print table
  console.log('RVOL  | LookB | n    | Avg5D  | Adj5D  | vsSPY  | StopHit | Ovfit?')
  console.log('------|-------|------|--------|--------|--------|---------|-------')
  for (const r of results) {
    const row = [
      r.rvolThreshold.toFixed(1).padEnd(5),
      String(r.lookback).padEnd(5),
      String(r.n).padEnd(4),
      fmt(r.avg5d).padEnd(7),
      fmt(r.avg5dAdj).padEnd(7),
      fmt(r.avg5dVsSpy).padEnd(7),
      (r.stopHitRate !== null ? `${(r.stopHitRate * 100).toFixed(0)}%` : 'n/a').padEnd(8)
    ].join('| ')
    console.log(row)
  }

  // Overfitting warning
  for (const lookback of BREAKOUT_LOOKBACKS) {
    const slice = results.filter(r => r.lookback === lookback)
    if (overfit(slice)) {
      console.log(`\n⚠️  Lookback=${lookback}: adj5D spread >2% across RVOL grid — possible overfitting`)
    }
  }
  for (const rvol of RVOL_THRESHOLDS) {
    const slice = results.filter(r => r.rvolThreshold === rvol)
    if (overfit(slice)) {
      console.log(`⚠️  RVOL=${rvol}: adj5D spread >2% across lookback grid — possible overfitting`)
    }
  }

  // Save JSON
  const outPath = join(__dirname, '..', 'plateau-results.json')
  writeFileSync(outPath, JSON.stringify({ generated: new Date().toISOString(), grid: results }, null, 2))
  console.log(`\n✓ Results saved to plateau-results.json`)
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
