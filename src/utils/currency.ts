import type { Currency } from '../types/etf'

export function toHkd(value: number, currency: Currency, usdHkd: number): number {
  return currency === 'USD' ? value * usdHkd : value
}

export function fromHkd(value: number, currency: Currency, usdHkd: number): number {
  return currency === 'USD' ? value / usdHkd : value
}
