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

  // ── US Equity Core & Factor ─────────────────────────────────────────────
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
  {
    ticker: 'IWM',
    name: 'iShares Russell 2000 ETF',
    description: '追蹤羅素 2000 小型股指數，是衡量美國中小企業健康度的重要風險溫度計。小型股跑贏大型股通常預示風險偏好上升。',
    category: 'US_EQUITY_CORE',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
  },
  {
    ticker: 'IJH',
    name: 'iShares Core S&P Mid-Cap ETF',
    description: '追蹤標普 400 中型股指數，填補大型股（VOO）與小型股（IWM）之間的空白。歷史上中型股長期風險調整回報優於兩端。',
    category: 'US_EQUITY_CORE',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'MEDIUM',
    enabledInPresets: ['growth']
  },
  {
    ticker: 'IWF',
    name: 'iShares Russell 1000 Growth ETF',
    description: '追蹤羅素 1000 成長股，側重高市盈率、高收入增長的企業。牛市環境中跑贏大市，利率上升時跌幅較大。',
    category: 'US_EQUITY_CORE',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
  },
  {
    ticker: 'IWD',
    name: 'iShares Russell 1000 Value ETF',
    description: '追蹤羅素 1000 價值股，側重低市盈率、高股息企業。通脹環境及利率上升時通常跑贏成長股，與 IWF 的輪動是重要市場信號。',
    category: 'US_EQUITY_CORE',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'MEDIUM',
    enabledInPresets: ['defensive', 'balanced']
  },
  {
    ticker: 'MTUM',
    name: 'iShares MSCI USA Momentum Factor ETF',
    description: '持有近 6-12 個月動力最強的美股。動力因子本身是信號強弱的驗證工具——MTUM 在 FAVOUR 時確認趨勢，轉弱時是早期預警。',
    category: 'US_EQUITY_CORE',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
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
  {
    ticker: 'EWJ',
    name: 'iShares MSCI Japan ETF',
    description: '追蹤日本股市，日圓匯率是關鍵影響因素。日圓貶值時日股出口商受惠，日圓急升時則反向。日本是全球宏觀的重要信號市場。',
    category: 'INTL_EQUITY',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'Japan',
    riskLevel: 'MEDIUM',
    enabledInPresets: ['balanced', 'growth']
  },
  {
    ticker: 'INDA',
    name: 'iShares MSCI India ETF',
    description: '追蹤印度股市，是目前增長最快的主要新興市場。受益於人口紅利及製造業轉移，但估值偏高，短期波動受外資流向影響大。',
    category: 'INTL_EQUITY',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'India',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
  },
  {
    ticker: 'EWT',
    name: 'iShares MSCI Taiwan ETF',
    description: '追蹤台灣股市，台積電佔比超過 30%。台灣股市實質上是半導體行業的高度集中暴露，與 AI/半導體週期高度掛鈎。',
    category: 'INTL_EQUITY',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'Taiwan',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
  },
  {
    ticker: 'EWZ',
    name: 'iShares MSCI Brazil ETF',
    description: '追蹤巴西股市，以能源、金屬、銀行為主。商品價格是主要驅動力，巴西雷亞爾匯率波動顯著，屬高風險新興市場暴露。',
    category: 'INTL_EQUITY',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'Brazil',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
  },
  {
    ticker: 'EWG',
    name: 'iShares MSCI Germany ETF',
    description: '追蹤德國股市，歐洲最大經濟體。以工業、汽車、化工為主，歐元區經濟健康度及能源成本是主要影響因素。',
    category: 'INTL_EQUITY',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'Europe',
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
  {
    ticker: 'KWEB',
    name: 'KraneShares CSI China Internet ETF',
    description: '集中持有中國互聯網龍頭（騰訊、阿里、美團、拼多多等）在美上市或港股通的股票。高波動，政策敏感，是中國科技週期的核心指標。',
    category: 'HK_CHINA',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'China',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
  },
  {
    ticker: 'FXI',
    name: 'iShares China Large-Cap ETF',
    description: '追蹤富時中國 50 指數，持有規模最大的中國股票（H 股及紅籌股）。流動性高，是快速判斷中國大市走勢的代表性工具。',
    category: 'HK_CHINA',
    currency: 'USD',
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

  {
    ticker: 'GDX',
    name: 'VanEck Gold Miners ETF',
    description: '持有全球主要黃金礦業公司，對金價的波動有 2-3 倍的槓桿效應（礦業公司盈利放大金價變動）。黃金看多但想要更高彈性時的選擇。',
    category: 'GOLD',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'Global',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
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

  {
    ticker: 'SLV',
    name: 'iShares Silver Trust',
    description: '持有實物白銀，兼具工業金屬（太陽能、電子）和貴金屬雙重屬性。比黃金波動更大，工業需求令其與全球製造業週期掛鈎。',
    category: 'COMMODITY',
    currency: 'USD',
    assetClass: 'Commodity',
    region: 'Global',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
  },
  {
    ticker: 'DBA',
    name: 'Invesco DB Agriculture Fund',
    description: '持有玉米、大豆、小麥、糖等農產品期貨。供應鏈衝擊或氣候事件時有保護作用，通脹組合中的分散工具。',
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
    ticker: 'XLK',
    name: 'Technology Select Sector SPDR ETF',
    description: '持有標普 500 科技板塊（Apple、Microsoft、Nvidia 等）。是 QQQ 的簡化版，覆蓋純科技公司，不含 Meta/Google 等通訊股。',
    category: 'SECTOR',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
  },
  {
    ticker: 'XLF',
    name: 'Financial Select Sector SPDR ETF',
    description: '持有標普 500 金融板塊（JPMorgan、Visa、Mastercard 等）。利率上升時通常受益（銀行息差擴大），是利率週期的指向標。',
    category: 'SECTOR',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'MEDIUM',
    enabledInPresets: ['balanced', 'growth']
  },
  {
    ticker: 'XLI',
    name: 'Industrial Select Sector SPDR ETF',
    description: '持有標普 500 工業板塊（GE、Caterpillar、RTX 等）。景氣敏感型，基建投資及製造業 PMI 上升時跑贏，是週期轉好的早期信號。',
    category: 'SECTOR',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'MEDIUM',
    enabledInPresets: ['balanced', 'growth']
  },
  {
    ticker: 'XLU',
    name: 'Utilities Select Sector SPDR ETF',
    description: '持有標普 500 公用事業板塊（NextEra、Duke 等）。防守性最強的板塊之一，利率下降時跑贏，股息率高，AI 電力需求近年成為新催化劑。',
    category: 'SECTOR',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'LOW',
    enabledInPresets: ['defensive', 'balanced']
  },
  {
    ticker: 'XLP',
    name: 'Consumer Staples Select Sector SPDR ETF',
    description: '持有標普 500 必需消費品板塊（Costco、Procter & Gamble 等）。景氣衰退時的防守核心，股息穩定，熊市跌幅通常小於大市。',
    category: 'SECTOR',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'LOW',
    enabledInPresets: ['defensive', 'balanced']
  },
  {
    ticker: 'XLY',
    name: 'Consumer Discretionary Select Sector SPDR ETF',
    description: '持有標普 500 可選消費板塊（Amazon、Tesla、Home Depot 等）。消費者信心及就業市場改善時跑贏，是消費週期的晴雨表。',
    category: 'SECTOR',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
  },
  {
    ticker: 'XBI',
    name: 'SPDR S&P Biotech ETF',
    description: '持有標普生物科技指數，等權重配置中小型生物科技股。高度投機性，FDA 審批決定個股走勢，整體板塊動力極為集中且波動劇烈。',
    category: 'SECTOR',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
  },
  {
    ticker: 'ITB',
    name: 'iShares U.S. Home Construction ETF',
    description: '持有美國房屋建築商（D.R. Horton、Lennar 等）。對按揭利率極度敏感，利率下降時是最受益的板塊之一，是地產週期的核心指標。',
    category: 'SECTOR',
    currency: 'USD',
    assetClass: 'Equity',
    region: 'US',
    riskLevel: 'HIGH',
    enabledInPresets: ['growth']
  },
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
