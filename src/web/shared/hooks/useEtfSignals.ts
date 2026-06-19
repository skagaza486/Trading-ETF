import { useEffect, useState } from 'react'

export type EtfSignalLabel = 'FAVOUR' | 'WATCH' | 'WAIT' | 'AVOID'

export type EtfIndicators = {
  return13w: number | null
  return26w: number | null
  priceVs40wMa: number | null
  relStrengthVsSpy: number | null
  rsSlope: number | null
}

export type EtfSignalEntry = {
  ticker: string
  weekEndingDate: string
  label: EtfSignalLabel
  regime: string
  closeAtSignal: number | null
  indicators: EtfIndicators
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; entries: EtfSignalEntry[] }

export function useEtfSignals(): State {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    fetch('/api/d1/etf-signals?weeks=2')
      .then(r => r.json())
      .then((data: { rows?: unknown[]; error?: string }) => {
        if (cancelled) return
        if (data.error || !Array.isArray(data.rows)) {
          setState({ status: 'error', message: data.error ?? 'ETF signals unavailable' })
          return
        }

        // Keep only the most recent signal per ticker
        const latest = new Map<string, EtfSignalEntry>()
        for (const row of data.rows as Array<{
          ticker: string
          weekEndingDate: string
          label: string
          regime: string
          closeAtSignal: number | null
          indicatorsJson?: string
        }>) {
          const existing = latest.get(row.ticker)
          if (!existing || row.weekEndingDate > existing.weekEndingDate) {
            let parsed: Record<string, number> = {}
            try { parsed = JSON.parse(row.indicatorsJson ?? '{}') } catch { /* ignore */ }
            latest.set(row.ticker, {
              ticker: row.ticker,
              weekEndingDate: row.weekEndingDate,
              label: row.label as EtfSignalLabel,
              regime: row.regime,
              closeAtSignal: row.closeAtSignal,
              indicators: {
                return13w:        parsed.return13w        ?? null,
                return26w:        parsed.return26w        ?? null,
                priceVs40wMa:    parsed.priceVs40wMa    ?? null,
                relStrengthVsSpy: parsed.relStrengthVsSpy ?? null,
                rsSlope:          parsed.rsSlope          ?? null,
              },
            })
          }
        }

        setState({ status: 'ok', entries: Array.from(latest.values()) })
      })
      .catch(e => {
        if (!cancelled) setState({ status: 'error', message: e.message ?? 'Fetch failed' })
      })

    return () => { cancelled = true }
  }, [])

  return state
}
