// Capital Manager API hook
//
// Provides typed CRUD functions for the capital worker API.
// Token is read from localStorage['capital-auth-token'] (persists across sessions).
// API base URL can be configured via VITE_CAPITAL_API_URL env var.

import { useCallback, useMemo } from 'react'
import type { Position, RiskState, TradeResult, PaperTrade } from '../../../types/capital'
import type { EodResult } from '../../../engine/exitEngine'

const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as Record<string, any>).env?.VITE_CAPITAL_API_URL as string | undefined)
  ?? 'https://capital.skagaza486.workers.dev'

function getToken(): string {
  return localStorage.getItem('capital-auth-token') ?? ''
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  if (!token) {
    throw new Error('請先輸入 Capital API Token')
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API error ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

export function useCapitalApi() {
  const fetchPositions = useCallback(async (sleeve?: 'stock' | 'etf'): Promise<Position[]> => {
    const qs = sleeve ? `?sleeve=${sleeve}` : ''
    const data = await apiFetch<{ positions: Position[] }>(`/api/capital/positions${qs}`)
    return data.positions
  }, [])

  const fetchRiskState = useCallback(async (): Promise<RiskState> => {
    return apiFetch<RiskState>('/api/capital/risk-state')
  }, [])

  const patchRiskState = useCallback(async (data: { capitalBaseCents?: number; regime?: string }): Promise<RiskState> => {
    return apiFetch<RiskState>('/api/capital/risk-state', {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }, [])

  const addPosition = useCallback(async (data: {
    ticker: string
    qty: number
    avgCostCents: number
    sleeve: 'stock' | 'etf'
    sector: string
    openedAt: string
    earningsDate?: string | null
  }): Promise<Position> => {
    return apiFetch<Position>('/api/capital/positions', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }, [])

  const closePosition = useCallback(async (
    id: number,
    currentPriceCents: number,
    result: TradeResult,
  ): Promise<{ pnlCents: number; result: TradeResult; newRiskState: RiskState }> => {
    return apiFetch('/api/capital/positions/' + id, {
      method: 'DELETE',
      body: JSON.stringify({ currentPriceCents, result }),
    })
  }, [])

  const updatePeak = useCallback(async (id: number, peakPriceCents: number): Promise<void> => {
    await apiFetch('/api/capital/positions/' + id, {
      method: 'PATCH',
      body: JSON.stringify({ peakPriceCents }),
    })
  }, [])

  const runEodEval = useCallback(async (priceMap: Record<string, number>): Promise<EodResult> => {
    return apiFetch<EodResult>('/api/capital/eod-eval', {
      method: 'POST',
      body: JSON.stringify({ priceMap }),
    })
  }, [])

  const recordResult = useCallback(async (result: TradeResult): Promise<RiskState> => {
    return apiFetch<RiskState>('/api/capital/record-result', {
      method: 'POST',
      body: JSON.stringify({ result }),
    })
  }, [])

  const fetchPaperTrades = useCallback(async (): Promise<PaperTrade[]> => {
    const data = await apiFetch<{ trades: PaperTrade[] }>('/api/capital/paper-trades')
    return data.trades
  }, [])

  const addPaperTrade = useCallback(async (data: {
    ticker: string
    weekStart: string
    entryPriceCents: number
    sector: string
    regime: string
    note?: string | null
  }): Promise<PaperTrade> => {
    return apiFetch<PaperTrade>('/api/capital/paper-trades', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }, [])

  const updatePaperTrade = useCallback(async (
    id: number,
    data: { currentPriceCents?: number; note?: string | null },
  ): Promise<PaperTrade> => {
    return apiFetch<PaperTrade>('/api/capital/paper-trades/' + id, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }, [])

  const closePaperTrade = useCallback(async (id: number, closedPriceCents?: number): Promise<PaperTrade> => {
    return apiFetch<PaperTrade>('/api/capital/paper-trades/' + id, {
      method: 'DELETE',
      body: JSON.stringify({ closedPriceCents }),
    })
  }, [])

  return useMemo(() => ({
    fetchPositions,
    fetchRiskState,
    patchRiskState,
    addPosition,
    closePosition,
    updatePeak,
    runEodEval,
    recordResult,
    fetchPaperTrades,
    addPaperTrade,
    updatePaperTrade,
    closePaperTrade,
  }), [
    fetchPositions,
    fetchRiskState,
    patchRiskState,
    addPosition,
    closePosition,
    updatePeak,
    runEodEval,
    recordResult,
    fetchPaperTrades,
    addPaperTrade,
    updatePaperTrade,
    closePaperTrade,
  ])
}
