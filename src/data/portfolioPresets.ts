import type { PortfolioPreset } from '../types/portfolio'

export const portfolioPresets: PortfolioPreset[] = [
  {
    id: 'defensive',
    name: 'Defensive (~6%)',
    description: 'Treasury-heavy. Low volatility, capital preservation. Expected ~6% p.a.',
    benchmarkLabel: 'Capital preservation blend',
    policy: {
      benchmarkReturn: 0.06,
      maxDrawdown: 0.08,
      minTradeSizeHkd: 15000,
      targetCashReserveWeight: 10,
      maxSingleEtfWeight: 25,
      maxNewPositionWeight: 8,
      reviewFrequency: 'WEEKLY'
    },
    allocations: [
      { ticker: 'SGOV', targetWeight: 20 },
      { ticker: 'SHY', targetWeight: 15 },
      { ticker: 'IEF', targetWeight: 20 },
      { ticker: 'VOO', targetWeight: 25 },
      { ticker: 'GLD', targetWeight: 10 },
      { ticker: '2840.HK', targetWeight: 10 }
    ]
  },
  {
    id: 'balanced',
    name: 'Balanced (~7.5%)',
    description: 'Bond + equity mix. Moderate growth, drawdown limited to ~12%. Expected ~7.5% p.a.',
    benchmarkLabel: 'Balanced income-growth blend',
    policy: {
      benchmarkReturn: 0.075,
      maxDrawdown: 0.12,
      minTradeSizeHkd: 20000,
      targetCashReserveWeight: 8,
      maxSingleEtfWeight: 22,
      maxNewPositionWeight: 10,
      reviewFrequency: 'WEEKLY'
    },
    allocations: [
      { ticker: 'SGOV', targetWeight: 10 },
      { ticker: 'SHY', targetWeight: 5 },
      { ticker: 'IEF', targetWeight: 10 },
      { ticker: 'LQD', targetWeight: 5 },
      { ticker: 'VOO', targetWeight: 25 },
      { ticker: 'QQQ', targetWeight: 15 },
      { ticker: 'SCHD', targetWeight: 5 },
      { ticker: 'HYG', targetWeight: 5 },
      { ticker: 'GLD', targetWeight: 10 },
      { ticker: '2800.HK', targetWeight: 10 }
    ]
  },
  {
    id: 'target10',
    name: 'Target 10% (~10%)',
    description: 'Optimised for 10% p.a. on HKD 1M. 65% equity, requires accepting ~18% max drawdown.',
    benchmarkLabel: 'HKD 1M target-return mandate',
    policy: {
      benchmarkReturn: 0.1,
      maxDrawdown: 0.18,
      minTradeSizeHkd: 25000,
      targetCashReserveWeight: 5,
      maxSingleEtfWeight: 20,
      maxNewPositionWeight: 12,
      reviewFrequency: 'WEEKLY'
    },
    allocations: [
      { ticker: 'SGOV', targetWeight: 5 },
      { ticker: 'IEF', targetWeight: 10 },
      { ticker: 'VOO', targetWeight: 30 },
      { ticker: 'QQQ', targetWeight: 20 },
      { ticker: 'SCHD', targetWeight: 10 },
      { ticker: 'EFA', targetWeight: 7 },
      { ticker: 'HYG', targetWeight: 5 },
      { ticker: 'GLD', targetWeight: 5 },
      { ticker: '2800.HK', targetWeight: 8 }
    ]
  },
  {
    id: 'growth',
    name: 'Growth (~9%)',
    description: 'Higher equity and HK tech exposure. Volatile — suits multi-year horizon. Expected ~9% p.a.',
    benchmarkLabel: 'Growth mandate',
    policy: {
      benchmarkReturn: 0.09,
      maxDrawdown: 0.18,
      minTradeSizeHkd: 25000,
      targetCashReserveWeight: 5,
      maxSingleEtfWeight: 25,
      maxNewPositionWeight: 12,
      reviewFrequency: 'WEEKLY'
    },
    allocations: [
      { ticker: 'SGOV', targetWeight: 5 },
      { ticker: 'IEF', targetWeight: 10 },
      { ticker: 'VOO', targetWeight: 30 },
      { ticker: 'QQQ', targetWeight: 25 },
      { ticker: 'HYG', targetWeight: 5 },
      { ticker: 'GLD', targetWeight: 5 },
      { ticker: '2800.HK', targetWeight: 10 },
      { ticker: '3067.HK', targetWeight: 10 }
    ]
  }
]
