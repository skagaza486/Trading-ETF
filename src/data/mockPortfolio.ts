import type { Portfolio } from '../types/portfolio'

export const mockPortfolio: Portfolio = {
  id: 'sample-portfolio',
  name: 'Sample ETF Portfolio',
  baseCurrency: 'HKD',
  startingPortfolioValueHkd: 100000,
  netContributionHkd: 0,
  cashBalanceHkd: 10000,
  holdings: [
    { ticker: 'SGOV', shares: 20, averageCost: 100.5, currency: 'USD' },
    { ticker: 'IEF', shares: 12, averageCost: 93, currency: 'USD' },
    { ticker: 'VOO', shares: 10, averageCost: 470, currency: 'USD' },
    { ticker: 'QQQ', shares: 8, averageCost: 430, currency: 'USD' },
    { ticker: '2800.HK', shares: 500, averageCost: 18.5, currency: 'HKD' }
  ]
}
