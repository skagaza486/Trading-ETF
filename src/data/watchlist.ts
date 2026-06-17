export type WatchlistStock = {
  ticker: string
  name: string
  sector: string
}

export const stockWatchlist: WatchlistStock[] = [
  // Technology (16)
  { ticker: 'AAPL',  name: 'Apple',                    sector: 'Technology' },
  { ticker: 'MSFT',  name: 'Microsoft',                sector: 'Technology' },
  { ticker: 'NVDA',  name: 'NVIDIA',                   sector: 'Technology' },
  { ticker: 'AVGO',  name: 'Broadcom',                 sector: 'Technology' },
  { ticker: 'AMD',   name: 'Advanced Micro Devices',   sector: 'Technology' },
  { ticker: 'PLTR',  name: 'Palantir',                 sector: 'Technology' },
  { ticker: 'CRM',   name: 'Salesforce',               sector: 'Technology' },
  { ticker: 'ORCL',  name: 'Oracle',                   sector: 'Technology' },
  { ticker: 'ADBE',  name: 'Adobe',                    sector: 'Technology' },
  { ticker: 'QCOM',  name: 'Qualcomm',                 sector: 'Technology' },
  { ticker: 'MU',    name: 'Micron Technology',        sector: 'Technology' },
  { ticker: 'AMAT',  name: 'Applied Materials',        sector: 'Technology' },
  { ticker: 'NOW',   name: 'ServiceNow',               sector: 'Technology' },
  { ticker: 'PANW',  name: 'Palo Alto Networks',       sector: 'Technology' },
  { ticker: 'SNOW',  name: 'Snowflake',                sector: 'Technology' },
  { ticker: 'TTD',   name: 'The Trade Desk',           sector: 'Technology' },
  { ticker: 'CRWD',  name: 'CrowdStrike',              sector: 'Technology' },
  { ticker: 'LRCX',  name: 'Lam Research',             sector: 'Technology' },
  { ticker: 'APP',   name: 'AppLovin',                 sector: 'Technology' },

  // Communication Services (7)
  { ticker: 'META',  name: 'Meta Platforms',           sector: 'Communication Services' },
  { ticker: 'GOOGL', name: 'Alphabet',                 sector: 'Communication Services' },
  { ticker: 'NFLX',  name: 'Netflix',                  sector: 'Communication Services' },
  { ticker: 'DIS',   name: 'Walt Disney',              sector: 'Communication Services' },
  { ticker: 'T',     name: 'AT&T',                     sector: 'Communication Services' },
  { ticker: 'ROKU',  name: 'Roku',                     sector: 'Communication Services' },
  { ticker: 'SNAP',  name: 'Snap',                     sector: 'Communication Services' },

  // Consumer Discretionary (8)
  { ticker: 'AMZN',  name: 'Amazon',                   sector: 'Consumer Discretionary' },
  { ticker: 'TSLA',  name: 'Tesla',                    sector: 'Consumer Discretionary' },
  { ticker: 'HD',    name: 'Home Depot',               sector: 'Consumer Discretionary' },
  { ticker: 'MCD',   name: "McDonald's",               sector: 'Consumer Discretionary' },
  { ticker: 'NKE',   name: 'Nike',                     sector: 'Consumer Discretionary' },
  { ticker: 'BKNG',  name: 'Booking Holdings',         sector: 'Consumer Discretionary' },
  { ticker: 'ABNB',  name: 'Airbnb',                   sector: 'Consumer Discretionary' },
  { ticker: 'LOW',   name: "Lowe's",                   sector: 'Consumer Discretionary' },
  { ticker: 'SBUX',  name: 'Starbucks',                sector: 'Consumer Discretionary' },
  { ticker: 'UBER',  name: 'Uber Technologies',        sector: 'Consumer Discretionary' },

  // Consumer Staples (7)
  { ticker: 'COST',  name: 'Costco',                   sector: 'Consumer Staples' },
  { ticker: 'WMT',   name: 'Walmart',                  sector: 'Consumer Staples' },
  { ticker: 'PG',    name: 'Procter & Gamble',         sector: 'Consumer Staples' },
  { ticker: 'KO',    name: 'Coca-Cola',                sector: 'Consumer Staples' },
  { ticker: 'PEP',   name: 'PepsiCo',                  sector: 'Consumer Staples' },
  { ticker: 'MDLZ',  name: 'Mondelez International',   sector: 'Consumer Staples' },
  { ticker: 'PM',    name: 'Philip Morris',            sector: 'Consumer Staples' },

  // Financials (10)
  { ticker: 'JPM',   name: 'JPMorgan Chase',           sector: 'Financials' },
  { ticker: 'GS',    name: 'Goldman Sachs',            sector: 'Financials' },
  { ticker: 'BAC',   name: 'Bank of America',          sector: 'Financials' },
  { ticker: 'V',     name: 'Visa',                     sector: 'Financials' },
  { ticker: 'MA',    name: 'Mastercard',               sector: 'Financials' },
  { ticker: 'MS',    name: 'Morgan Stanley',           sector: 'Financials' },
  { ticker: 'BLK',   name: 'BlackRock',                sector: 'Financials' },
  { ticker: 'AXP',   name: 'American Express',         sector: 'Financials' },
  { ticker: 'SCHW',  name: 'Charles Schwab',           sector: 'Financials' },
  { ticker: 'C',     name: 'Citigroup',                sector: 'Financials' },
  { ticker: 'WFC',   name: 'Wells Fargo',              sector: 'Financials' },
  { ticker: 'BX',    name: 'Blackstone',               sector: 'Financials' },

  // Health Care (10)
  { ticker: 'LLY',   name: 'Eli Lilly',                sector: 'Health Care' },
  { ticker: 'UNH',   name: 'UnitedHealth Group',       sector: 'Health Care' },
  { ticker: 'ABBV',  name: 'AbbVie',                   sector: 'Health Care' },
  { ticker: 'JNJ',   name: 'Johnson & Johnson',        sector: 'Health Care' },
  { ticker: 'MRK',   name: 'Merck',                    sector: 'Health Care' },
  { ticker: 'PFE',   name: 'Pfizer',                   sector: 'Health Care' },
  { ticker: 'AMGN',  name: 'Amgen',                    sector: 'Health Care' },
  { ticker: 'ISRG',  name: 'Intuitive Surgical',       sector: 'Health Care' },
  { ticker: 'GILD',  name: 'Gilead Sciences',          sector: 'Health Care' },
  { ticker: 'DXCM',  name: 'DexCom',                   sector: 'Health Care' },
  { ticker: 'CVS',   name: 'CVS Health',               sector: 'Health Care' },

  // Energy (5)
  { ticker: 'XOM',   name: 'Exxon Mobil',              sector: 'Energy' },
  { ticker: 'CVX',   name: 'Chevron',                  sector: 'Energy' },
  { ticker: 'COP',   name: 'ConocoPhillips',           sector: 'Energy' },
  { ticker: 'SLB',   name: 'SLB',                      sector: 'Energy' },
  { ticker: 'OXY',   name: 'Occidental Petroleum',     sector: 'Energy' },
  { ticker: 'MPC',   name: 'Marathon Petroleum',       sector: 'Energy' },

  // Industrials (8)
  { ticker: 'BA',    name: 'Boeing',                   sector: 'Industrials' },
  { ticker: 'CAT',   name: 'Caterpillar',              sector: 'Industrials' },
  { ticker: 'HON',   name: 'Honeywell',                sector: 'Industrials' },
  { ticker: 'GE',    name: 'GE Aerospace',             sector: 'Industrials' },
  { ticker: 'RTX',   name: 'RTX',                      sector: 'Industrials' },
  { ticker: 'LMT',   name: 'Lockheed Martin',          sector: 'Industrials' },
  { ticker: 'UPS',   name: 'United Parcel Service',    sector: 'Industrials' },
  { ticker: 'FDX',   name: 'FedEx',                    sector: 'Industrials' },
  { ticker: 'DE',    name: 'Deere & Company',          sector: 'Industrials' },

  // Materials (4)
  { ticker: 'FCX',   name: 'Freeport-McMoRan',         sector: 'Materials' },
  { ticker: 'NEM',   name: 'Newmont',                  sector: 'Materials' },
  { ticker: 'LIN',   name: 'Linde',                    sector: 'Materials' },
  { ticker: 'NUE',   name: 'Nucor',                    sector: 'Materials' },

  // Real Estate (4)
  { ticker: 'AMT',   name: 'American Tower',           sector: 'Real Estate' },
  { ticker: 'EQIX',  name: 'Equinix',                  sector: 'Real Estate' },
  { ticker: 'PLD',   name: 'Prologis',                 sector: 'Real Estate' },
  { ticker: 'WELL',  name: 'Welltower',                sector: 'Real Estate' },

  // Utilities (4)
  { ticker: 'NEE',   name: 'NextEra Energy',           sector: 'Utilities' },
  { ticker: 'DUK',   name: 'Duke Energy',              sector: 'Utilities' },
  { ticker: 'SO',    name: 'Southern Company',         sector: 'Utilities' },
  { ticker: 'CEG',   name: 'Constellation Energy',     sector: 'Utilities' },

  // International / US-listed ADR (7)
  { ticker: 'TSM',   name: 'Taiwan Semiconductor',     sector: 'International' },
  { ticker: 'ASML',  name: 'ASML Holding',             sector: 'International' },
  { ticker: 'NVO',   name: 'Novo Nordisk',             sector: 'International' },
  { ticker: 'MELI',  name: 'MercadoLibre',             sector: 'International' },
  { ticker: 'SHOP',  name: 'Shopify',                  sector: 'International' },
  { ticker: 'BABA',  name: 'Alibaba',                  sector: 'International' },
  { ticker: 'SE',    name: 'Sea Limited',              sector: 'International' },
]
