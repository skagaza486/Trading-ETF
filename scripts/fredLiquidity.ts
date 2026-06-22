/**
 * Fetches Fed net liquidity from FRED: WALCL − WTREGEN − RRPONTSYD.
 * All three series are weekly-aligned via FRED's frequency=w aggregation.
 *
 * Units: WALCL + WTREGEN in millions USD; RRPONTSYD in billions USD.
 * Net Liquidity ($B) = (WALCL − WTREGEN) / 1000 − RRPONTSYD
 *
 * Slope thresholds (4-week change): > +100B = expanding, < -100B = contracting.
 * Returns null on any failure (non-fatal; snapshot proceeds without note).
 */
import type { LiquidityNote } from '../src/types/snapshot'

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'

async function fetchWeekly(seriesId: string, apiKey: string, limit = 6): Promise<{ date: string; value: number }[]> {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: 'json',
    limit: String(limit),
    sort_order: 'desc',
    frequency: 'w',
    aggregation_method: 'eop',
  })
  const res = await fetch(`${FRED_BASE}?${params}`)
  if (!res.ok) throw new Error(`FRED ${seriesId}: HTTP ${res.status}`)
  const data = await res.json() as { observations: { date: string; value: string }[] }
  return data.observations
    .filter(o => o.value !== '.')
    .map(o => ({ date: o.date, value: parseFloat(o.value) }))
}

function netLiqB(walclM: number, tgaM: number, rrpB: number): number {
  return (walclM - tgaM) / 1000 - rrpB
}

export async function fetchFredLiquidity(apiKey: string): Promise<LiquidityNote | null> {
  try {
    const [walcl, tga, rrp] = await Promise.all([
      fetchWeekly('WALCL',     apiKey, 6),  // Fed total assets, millions USD
      fetchWeekly('WTREGEN',   apiKey, 6),  // Treasury General Account, millions USD
      fetchWeekly('RRPONTSYD', apiKey, 6),  // Overnight RRP, billions USD
    ])

    if (!walcl.length || !tga.length || !rrp.length) return null

    const latest = netLiqB(walcl[0].value, tga[0].value, rrp[0].value)
    const idx = Math.min(4, Math.min(walcl.length, tga.length, rrp.length) - 1)
    const old   = netLiqB(walcl[idx].value, tga[idx].value, rrp[idx].value)
    const change4w = latest - old

    return {
      slope: change4w > 100 ? 'expanding' : change4w < -100 ? 'contracting' : 'flat',
      netLiquidityB: Math.round(latest),
      change4wB: Math.round(change4w),
      asOf: walcl[0].date,
    }
  } catch (err) {
    console.warn('FRED liquidity fetch skipped:', (err as Error).message)
    return null
  }
}
