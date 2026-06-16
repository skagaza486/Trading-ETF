export type ETFCategory =
  | 'US_TREASURY'
  | 'US_EQUITY_CORE'
  | 'HY_BOND'
  | 'INTL_EQUITY'
  | 'HK_CHINA'
  | 'GOLD'
  | 'COMMODITY'
  | 'REIT'
  | 'SECTOR'
  | 'DIVIDEND'

export type Currency = 'USD' | 'HKD'

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export type ETF = {
  ticker: string
  name: string
  description: string
  category: ETFCategory
  currency: Currency
  assetClass: string
  region: string
  riskLevel: RiskLevel
  enabledInPresets: string[]
}

export type ETFWithPrice = ETF & {
  priceData: import('./price').ETFPriceData | null
}
