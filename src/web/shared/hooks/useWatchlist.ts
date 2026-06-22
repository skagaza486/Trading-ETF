import { useState, useCallback } from 'react'

const KEY = 'trading-etf-watchlist'

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function save(set: Set<string>) {
  localStorage.setItem(KEY, JSON.stringify(Array.from(set)))
}

export function useWatchlist() {
  const [starred, setStarred] = useState<Set<string>>(load)

  const toggle = useCallback((ticker: string) => {
    setStarred(prev => {
      const next = new Set(prev)
      if (next.has(ticker)) {
        next.delete(ticker)
      } else {
        next.add(ticker)
      }
      save(next)
      return next
    })
  }, [])

  return { starred, toggle }
}
