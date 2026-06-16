import type { ETF } from '../types/etf'

export const etfUniverse: ETF[] = [
  // ── US Treasury & Fixed Income ──────────────────────────────────────────
  {
    ticker: 'SGOV',
    name: 'iShares 0-3 Month Treasury Bond ETF',
    description: '持有 0–3 個月到期的美國國庫券，近乎無利率風險，年息約 4–5%，是現金替代工具。',
    category: 'US_TREASURY',
    currency: 'USD',
    assetClass: 'Treasury',
    region: 'US',
    riskLevel: 'LOW',
    enabledInPresets: ['defensive', 'balanced', 'growth', 'target10']
  },
  {
    ticker: 'SHY',
    name: 'iShares 1-3 Year Treasury Bond ETF',
    description: '持有 1–3 年期美國國債，久期短、波動低，利率上升時損失有限，適合作防守緩衝。',
    category: 'US_TREASURY',
    currency: 'USD',
    assetClass: 'Treasury',
    region: 'US',
    riskLevel: 'LOW',
    enabledInPresets: ['defensive', 'balanced']
  },
  {
    ticker: 'IEF',
    name: 'iShares 7-10 Year Treasury Bond ETF',
    description: '持有 7–10 年期美國國債，久期約 7.5 年。利率下降時升值顯著，股市下跌時通常提供保護。',
    category: 'US_TREASURY',
    currency: 'USD',
    assetClass: 'Treasury',
    region: 'US',
    riskLevel: 'MEDIUM',
    enabledInPresets: ['defensive', 'balanced', 'growth', 'target10']
  },
  {
    ticker: 'TLT',
    name: 'iShares 20+ Year Treasury Bond ETF',
    description: '持有 20 年以上長期美國國債，久期約 17 年，對利率極度敏感。利率頂部時潛在升幅大，但現階段風險偏高。',
    category: 'US_TREASURY',
    currency: 'USD',
    assetClass: 'Treasury',
    region: 'US',
    riskLevel: 'HIGH',
    enabledInPresets: ['defensive', 'balanced']
  },
  {
    ticker: 'TIP',
    name: 'iShares TIPS Bond ETF',
    description: '持有通脹保值美國國債（TIPS），本金隨 CPI 調整。通脹預期上升時有保護作用，通脹低迷時跑輸普通國債。',
    category: 'US_TREASURY',
    currency: 'USD',
    assetClass: 'Treasury',
    region: 'US',
    riskLevel: 'LOW',
    enabledInPresets: ['defensive', 'balanced']
  },
  {
    ticker: 'BND',
    name: 'Vanguard Total Bond Market ETF',
    description: '廣泛持有美國投資級債券，包括國債、機構債及企業債，超過 10,000 個持倉。多元分散，費用率極低（0.03%）。',
    category: 'US_TREASURY',
    currency: 'USD',
    assetClass: 'Aggregate Bond',
    region: 'US',
    riskLevel: 'LOW',
    enabledInPresets: ['defensive', 'balanced']
  },
  {
    ticker: 'LQD',
    name: 'iShares Investment Grade Corporate Bond ETF',
    description: '持有 BBB 級或以上的美國投資級企業債，收益高於國債約 1–1.5%，但在市場壓力時與股票相關性上升。',
    category: 'US_TREASURY',
    currency: 'USD',
    assetClass: 'Corporate Bond',
    region: 'US',
    riskLevel: 'MEDIUM',
    enabledInPresets: ['balanced', 'growth', 'target10']
  },

  // ── US Equity Core ──────────────────────────────────────────────────────
  {
    ticker: 'VOO',
    name: 'Vanguard S&P 500 ETF',
    description: '追蹤標普 500 指數，持有美國最大 500 家上市公司，費用率 0.03%。長期年化回報約 10–11%，是最核心的增長引擎。',
    category: 'US_EQUITY_CORE',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'MEDIUM',
    enabledInPresets: ['defensive', 'balanced', 'growth', 'target10']
  },
  {
    ticker: 'VTI',
    name: 'Vanguard Total Stock Market ETF',
    description: '追蹤美國全市場，包括大中小型股共約 3,700 家公司。比 VOO 多了中小型股暴露，長期表現與 VOO 接近。',
    category: 'US_EQUITY_CORE',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'MEDIUM',
    enabledInPresets: ['defensive', 'balanced', 'growth', 'target10']
  },
  {
    ticker: 'QQQ',
    name: 'Invesco QQQ Trust (Nasdaq 100)',
    description: '追蹤那斯達克 100 指數，以科技股為主（Apple、Nvidia、Microsoft 等佔大比重）。高回報潛力，波動比 VOO 大約 40%。',
    category: 'US_EQUITY_CORE',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'HIGH',
    enabledInPresets: ['balanced', 'growth', 'target10']
  },

  // ── High Yield Bond ─────────────────────────────────────────────────────
  {
    ticker: 'HYG',
    name: 'iShares iBoxx High Yield Corporate Bond ETF',
    description: '持有 BB 級或以下的美國高收益企業債（垃圾債），息率約 6–8%。與股市高度相關，信用利差擴闊時跌幅顯著。',
    category: 'HY_BOND',
    currency: 'USD',
    assetClass: 'Credit',
    region: 'US',
    riskLevel: 'HIGH',
    enabledInPresets: ['balanced', 'growth', 'target10']
  },
  {
    ticker: 'JNK',
    name: 'SPDR Bloomberg High Yield Bond ETF',
    description: '與 HYG 類似的高收益企業債 ETF，持倉略有差異，流動性相若。風險偏好市場中可作息率增強工具。',
    category: 'HY_BOND',
    currency: 'USD',
    assetClass: 'Credit',
    region: 'US',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
  },

  // ── International Equity ────────────────────────────────────────────────
  {
    ticker: 'VXUS',
    name: 'Vanguard Total International Stock ETF',
    description: '持有美國以外全球股票，約 7,700 家公司，涵蓋已發展及新興市場。對沖美股集中風險的最簡單方法。',
    category: 'INTL_EQUITY',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'International',
    riskLevel: 'MEDIUM',
    enabledInPresets: ['balanced', 'growth', 'target10']
  },
  {
    ticker: 'EFA',
    name: 'iShares MSCI EAFE ETF',
    description: '追蹤歐洲、澳洲、遠東等已發展市場，排除美加。以日本、英國、法國、德國為主，估值通常低於美股。',
    category: 'INTL_EQUITY',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'International Developed',
    riskLevel: 'MEDIUM',
    enabledInPresets: ['balanced', 'growth', 'target10']
  },
  {
    ticker: 'EEM',
    name: 'iShares MSCI Emerging Markets ETF',
    description: '追蹤新興市場股票，以中國、台灣、印度、韓國為主。高增長潛力但波動大，政治及匯率風險較高。',
    category: 'INTL_EQUITY',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'Emerging Markets',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
  },
  {
    ticker: 'ACWI',
    name: 'iShares MSCI ACWI ETF',
    description: '追蹤全球股票市場（美國 + 國際），約 2,400 家公司。一隻 ETF 覆蓋全球，簡化版全球股票暴露。',
    category: 'INTL_EQUITY',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'Global',
    riskLevel: 'MEDIUM',
    enabledInPresets: ['balanced', 'growth']
  },

  // ── Hong Kong / China ───────────────────────────────────────────────────
  {
    ticker: '2800.HK',
    name: 'Tracker Fund of Hong Kong',
    description: '追蹤恒生指數，港股最大的被動基金，流動性極高。以金融、科技、地產為主，HKD 計價，適合港股核心配置。',
    category: 'HK_CHINA',
    currency: 'HKD',
    assetClass: 'Equity',
    region: 'Hong Kong',
    riskLevel: 'HIGH',
    enabledInPresets: ['balanced', 'growth', 'target10']
  },
  {
    ticker: '3067.HK',
    name: 'CSOP Hang Seng TECH Index ETF',
    description: '追蹤恒生科技指數，持有騰訊、阿里、美團等 30 隻港股科技龍頭。波動極大，牛市時升幅可觀，熊市時跌幅深。',
    category: 'HK_CHINA',
    currency: 'HKD',
    assetClass: 'Equity',
    region: 'Hong Kong',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
  },
  {
    ticker: '3033.HK',
    name: 'CSOP Hang Seng Tech ETF (Synthetic)',
    description: '恒生科技指數的另一版本 ETF，持倉與 3067.HK 高度重疊。如已持有 3067.HK 則無需重複配置。',
    category: 'HK_CHINA',
    currency: 'HKD',
    assetClass: 'Equity',
    region: 'Hong Kong',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
  },
  {
    ticker: '2828.HK',
    name: 'Hang Seng China Enterprises Index ETF',
    description: '追蹤恒生中國企業指數（H 股），持有在港上市的中國大型國企如中銀、中移動、中石油。估值低但政策風險較高。',
    category: 'HK_CHINA',
    currency: 'HKD',
    assetClass: 'Equity',
    region: 'China',
    riskLevel: 'HIGH',
    enabledInPresets: ['balanced', 'growth']
  },
  {
    ticker: '3188.HK',
    name: 'Huaxia CSI 300 Index ETF',
    description: '追蹤滬深 300 指數，直接暴露中國 A 股市場。受惠中國政策刺激時表現突出，但受資本管制及監管風險影響。',
    category: 'HK_CHINA',
    currency: 'HKD',
    assetClass: 'Equity',
    region: 'China',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
  },

  // ── Gold ────────────────────────────────────────────────────────────────
  {
    ticker: 'GLD',
    name: 'SPDR Gold Shares',
    description: '全球最大的實物黃金 ETF，每份代表約 0.1 盎司黃金。股市下跌或地緣政治風險上升時通常提供保護。',
    category: 'GOLD',
    currency: 'USD',
    assetClass: 'Commodity',
    region: 'Global',
    riskLevel: 'MEDIUM',
    enabledInPresets: ['defensive', 'balanced', 'growth', 'target10']
  },
  {
    ticker: 'IAU',
    name: 'iShares Gold Trust',
    description: '與 GLD 同樣追蹤實物黃金，費用率更低（0.25% vs GLD 的 0.40%），但每份只代表 0.01 盎司，單價較低。',
    category: 'GOLD',
    currency: 'USD',
    assetClass: 'Commodity',
    region: 'Global',
    riskLevel: 'MEDIUM',
    enabledInPresets: ['defensive', 'balanced']
  },
  {
    ticker: '2840.HK',
    name: 'SPDR Gold Shares HK',
    description: '與美股 GLD 同一底層資產（實物黃金），在港交所上市以 HKD 計價，適合港股帳戶持有黃金倉位。',
    category: 'GOLD',
    currency: 'HKD',
    assetClass: 'Commodity',
    region: 'Hong Kong',
    riskLevel: 'MEDIUM',
    enabledInPresets: ['defensive', 'balanced']
  },

  // ── Commodities ─────────────────────────────────────────────────────────
  {
    ticker: 'PDBC',
    name: 'Invesco Optimum Yield Diversified Commodity ETF',
    description: '廣泛持有能源、金屬、農產品等商品期貨，通脹上升時有保護作用。期貨展期成本會影響長期回報，適合短至中期持有。',
    category: 'COMMODITY',
    currency: 'USD',
    assetClass: 'Commodity',
    region: 'Global',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
  },

  // ── REIT ────────────────────────────────────────────────────────────────
  {
    ticker: 'VNQ',
    name: 'Vanguard Real Estate ETF',
    description: '持有美國上市房地產信託基金（REIT），涵蓋商業、住宅、工業地產等。股息率約 4%，對利率敏感，利率下降時受益。',
    category: 'REIT',
    currency: 'USD',
    assetClass: 'Real Estate',
    region: 'US',
    riskLevel: 'MEDIUM',
    enabledInPresets: ['balanced', 'growth']
  },

  // ── Sector ──────────────────────────────────────────────────────────────
  {
    ticker: 'SMH',
    name: 'VanEck Semiconductor ETF',
    description: '集中持有半導體行業股票，包括 Nvidia、TSMC、ASML 等。AI 驅動需求强劲，但週期性強，供需失衡時波動劇烈。',
    category: 'SECTOR',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
  },
  {
    ticker: 'XLV',
    name: 'Health Care Select Sector SPDR ETF',
    description: '持有標普 500 醫療保健板塊，包括 UnitedHealth、Johnson & Johnson 等。防守性強，與市場相關性較低，適合風險管理。',
    category: 'SECTOR',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'MEDIUM',
    enabledInPresets: ['defensive', 'balanced']
  },
  {
    ticker: 'XLE',
    name: 'Energy Select Sector SPDR ETF',
    description: '持有標普 500 能源板塊，以 ExxonMobil、Chevron 為主。油價上升時跑贏大市，通脹環境及商品週期中表現突出。',
    category: 'SECTOR',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'HIGH',
    enabledInPresets: ['balanced', 'growth']
  },

  // ── Dividend ────────────────────────────────────────────────────────────
  {
    ticker: 'SCHD',
    name: 'Schwab US Dividend Equity ETF',
    description: '篩選高股息且財務穩健的美國股票，股息率約 3.5%，歷史上股息每年穩步增長。防守性與增長性兼備，費用率僅 0.06%。',
    category: 'DIVIDEND',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'MEDIUM',
    enabledInPresets: ['defensive', 'balanced', 'target10']
  },
  {
    ticker: 'VIG',
    name: 'Vanguard Dividend Appreciation ETF',
    description: '持有連續 10 年以上增加股息的美國公司，注重股息增長而非高息率。質量因子明顯，熊市時通常跑贏大市。',
    category: 'DIVIDEND',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'MEDIUM',
    enabledInPresets: ['defensive', 'balanced']
  }
]

export const regimeTickerSymbols = ['^VIX'] as const
