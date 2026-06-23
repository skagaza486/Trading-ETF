import { useEffect, useState } from 'react'
import type { ETF } from '../../../types/etf'

type EtfMetaState = {
  byTicker: Map<string, ETF>
  categoryByTicker: Map<string, ETF['category']>
  status: 'idle' | 'loading' | 'ok' | 'error'
}

const EMPTY_STATE: EtfMetaState = {
  byTicker: new Map(),
  categoryByTicker: new Map(),
  status: 'idle',
}

let cachedState: EtfMetaState | null = null
let inflight: Promise<EtfMetaState> | null = null

async function loadEtfMeta(): Promise<EtfMetaState> {
  if (cachedState) return cachedState
  if (!inflight) {
    inflight = import('../../../data/etfUniverse').then(({ etfUniverse }) => {
      const byTicker = new Map(etfUniverse.map(etf => [etf.ticker, etf]))
      const categoryByTicker = new Map(etfUniverse.map(etf => [etf.ticker, etf.category]))
      const state: EtfMetaState = { byTicker, categoryByTicker, status: 'ok' }
      cachedState = state
      return state
    })
  }
  return inflight
}

export function useEtfMeta() {
  const [state, setState] = useState<EtfMetaState>(() => cachedState ?? EMPTY_STATE)

  useEffect(() => {
    if (cachedState) {
      setState(cachedState)
      return
    }

    setState(prev => prev.status === 'ok' ? prev : { ...prev, status: 'loading' })

    let cancelled = false
    loadEtfMeta()
      .then(next => {
        if (!cancelled) setState(next)
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            byTicker: new Map(),
            categoryByTicker: new Map(),
            status: 'error',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return {
    etfMetaByTicker: state.byTicker,
    etfCategoryByTicker: state.categoryByTicker,
    status: state.status,
  }
}