import type { ETFPriceData, PriceCache } from '../../types/price'

export const PRICE_CACHE_TTL_MS = 4 * 60 * 60 * 1000

const priceKey = (ticker: string) => `priceCache:${ticker}`

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage)

export function isOlderThan(timestamp: string, ttlMs: number): boolean {
  return Date.now() - new Date(timestamp).getTime() > ttlMs
}

export function readPriceCache(ticker: string): PriceCache | null {
  if (!canUseStorage()) return null

  const raw = window.localStorage.getItem(priceKey(ticker))
  if (!raw) return null

  try {
    return JSON.parse(raw) as PriceCache
  } catch {
    return null
  }
}

export function writePriceCache(ticker: string, data: ETFPriceData): void {
  if (!canUseStorage()) return

  const cache: PriceCache = {
    ticker,
    data,
    fetchedAt: new Date().toISOString()
  }

  window.localStorage.setItem(priceKey(ticker), JSON.stringify(cache))
}

export function markPriceAsCached(data: ETFPriceData): ETFPriceData {
  return {
    ...data,
    source: 'CACHE',
    isStale: isOlderThan(data.fetchedAt, PRICE_CACHE_TTL_MS)
  }
}
