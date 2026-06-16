import type { ETFWithPrice } from '../types/etf'
import type { FxRate } from '../types/fx'
import type { Portfolio, PortfolioValuation } from '../types/portfolio'
import { toHkd } from '../utils/currency'

const DEFAULT_USDHKD = 7.78

export function calculatePortfolioValuation(input: {
  portfolio: Portfolio
  etfs: ETFWithPrice[]
  usdHkd: FxRate | null
}): PortfolioValuation {
  const usdHkd = input.usdHkd?.rate ?? DEFAULT_USDHKD
  const etfByTicker = new Map(input.etfs.map(etf => [etf.ticker, etf]))

  const holdings = input.portfolio.holdings.map(holding => {
    const etf = etfByTicker.get(holding.ticker)
    const priceData = etf?.priceData ?? null
    const currentPrice = priceData?.currentPrice ?? null
    const currentValueLocal = currentPrice === null ? null : currentPrice * holding.shares
    const currentValueHkd =
      currentValueLocal === null ? null : toHkd(currentValueLocal, holding.currency, usdHkd)
    const costValueLocal = holding.averageCost * holding.shares
    const gainLossLocal = currentValueLocal === null ? null : currentValueLocal - costValueLocal
    const gainLossPercent = gainLossLocal === null ? null : gainLossLocal / costValueLocal

    return {
      ...holding,
      currentPrice,
      currentValueLocal,
      currentValueHkd,
      marketValueWeight: 0,
      gainLossLocal,
      gainLossPercent,
      isPriceMissing: priceData === null,
      isPriceStale: Boolean(priceData?.isStale)
    }
  })

  const investedValueHkd = holdings.reduce((sum, holding) => sum + (holding.currentValueHkd ?? 0), 0)
  const cashBalanceHkd = Math.max(input.portfolio.cashBalanceHkd, 0)
  const totalValueHkd = investedValueHkd + cashBalanceHkd

  const weightedHoldings = holdings.map(holding => ({
    ...holding,
    marketValueWeight:
      totalValueHkd > 0 && holding.currentValueHkd !== null
        ? (holding.currentValueHkd / totalValueHkd) * 100
        : 0
  }))

  return {
    totalValueHkd,
    investedValueHkd,
    cashBalanceHkd,
    cashWeight: totalValueHkd > 0 ? (cashBalanceHkd / totalValueHkd) * 100 : 0,
    holdings: weightedHoldings,
    missingPriceTickers: weightedHoldings
      .filter(holding => holding.isPriceMissing)
      .map(holding => holding.ticker),
    stalePriceTickers: weightedHoldings
      .filter(holding => holding.isPriceStale)
      .map(holding => holding.ticker)
  }
}
