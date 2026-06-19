// 手寫繁中名稱 + 一句簡介。未列出的 ticker 會 fallback 到英文名稱。
export type StockMeta = {
  nameZh: string
  descriptionZh: string
  sectorZh: string
}

export const STOCK_META: Record<string, StockMeta> = {
  // ── Technology ──────────────────────────────────────────────────────
  AAPL:  { nameZh: '蘋果',             descriptionZh: 'iPhone/Mac 生態龍頭，服務收入佔比持續擴大',       sectorZh: '科技' },
  MSFT:  { nameZh: '微軟',             descriptionZh: 'Azure 雲端 + Office 365，企業軟件一哥',          sectorZh: '科技' },
  NVDA:  { nameZh: '輝達',             descriptionZh: 'AI 訓練晶片龍頭，H100/B200 供不應求',            sectorZh: '科技' },
  AVGO:  { nameZh: '博通',             descriptionZh: '定制 AI 晶片（XPU）+ 網絡半導體',                sectorZh: '科技' },
  AMD:   { nameZh: '超微',             descriptionZh: 'CPU/GPU 雙線，MI300 挑戰輝達 AI 市場',           sectorZh: '科技' },
  PLTR:  { nameZh: '帕蘭提爾',         descriptionZh: 'AI 數據分析平台，美國政府+企業客戶',              sectorZh: '科技' },
  CRM:   { nameZh: 'Salesforce',       descriptionZh: '全球 CRM 一哥，AI Agentforce 新動力',           sectorZh: '科技' },
  ORCL:  { nameZh: '甲骨文',           descriptionZh: '企業數據庫 + 雲端基建，AI 需求帶動收入加速',      sectorZh: '科技' },
  ADBE:  { nameZh: '奧多比',           descriptionZh: 'Photoshop/Acrobat 等創意軟件，AI Firefly 賦能', sectorZh: '科技' },
  QCOM:  { nameZh: '高通',             descriptionZh: '手機基帶晶片龍頭，車用+AI PC 開拓新市場',        sectorZh: '科技' },
  MU:    { nameZh: '美光',             descriptionZh: 'DRAM/NAND 記憶體，AI 伺服器 HBM 需求爆發',      sectorZh: '科技' },
  AMAT:  { nameZh: '應用材料',         descriptionZh: '半導體設備龍頭，覆蓋沉積、蝕刻等關鍵製程',        sectorZh: '科技' },
  NOW:   { nameZh: 'ServiceNow',       descriptionZh: '企業 IT 工作流平台，AI 自動化核心受益者',         sectorZh: '科技' },
  PANW:  { nameZh: '帕洛阿爾托',       descriptionZh: '零信任網絡安全龍頭，AI 驅動自動威脅偵測',         sectorZh: '科技' },
  SNOW:  { nameZh: 'Snowflake',        descriptionZh: '雲端數據倉儲平台，跨雲數據共享',                 sectorZh: '科技' },
  TTD:   { nameZh: 'trade Desk',       descriptionZh: '程序化廣告買方平台，CTV 廣告份額持續增',         sectorZh: '科技' },
  CRWD:  { nameZh: 'CrowdStrike',      descriptionZh: 'Falcon 雲原生終端安全，AI 行為分析防黑客',        sectorZh: '科技' },
  LRCX:  { nameZh: '泛林研究',         descriptionZh: '晶圓蝕刻設備一哥，先進製程必備',                 sectorZh: '科技' },
  APP:   { nameZh: 'AppLovin',         descriptionZh: '移動廣告 AI 引擎，AXON 精準投放推動利潤爆升',    sectorZh: '科技' },
  ARM:   { nameZh: 'Arm Holdings',     descriptionZh: '處理器架構授權，智能手機/AI 晶片普遍採用',        sectorZh: '科技' },
  SMCI:  { nameZh: '超微電腦',         descriptionZh: 'AI 伺服器定制化組裝，英偉達 GPU 主要系統商',     sectorZh: '科技' },
  MRVL:  { nameZh: '邁威爾',           descriptionZh: '數據中心網絡晶片 + 定制 AI 矽',                  sectorZh: '科技' },
  KLAC:  { nameZh: 'KLA',              descriptionZh: '晶圓缺陷檢測設備，良率控制不可或缺',              sectorZh: '科技' },
  CRDO:  { nameZh: 'Credo Technology', descriptionZh: '高速以太網 AEC 連接，AI 超大規模數據中心',       sectorZh: '科技' },
  ONTO:  { nameZh: 'Onto Innovation',  descriptionZh: '先進製程量測設備，封裝/3D NAND 受益',            sectorZh: '科技' },
  DDOG:  { nameZh: 'Datadog',          descriptionZh: '雲端可觀測性平台，DevOps 監控標準工具',           sectorZh: '科技' },
  NET:   { nameZh: 'Cloudflare',       descriptionZh: '全球 CDN + Zero Trust 安全，AI Workers 新業務', sectorZh: '科技' },
  HUBS:  { nameZh: 'HubSpot',          descriptionZh: '中小企業 CRM + 行銷自動化，AI Breeze 賦能',      sectorZh: '科技' },
  MDB:   { nameZh: 'MongoDB',          descriptionZh: '文件型 NoSQL 數據庫，Atlas 雲服務持續增長',       sectorZh: '科技' },
  FTNT:  { nameZh: 'Fortinet',         descriptionZh: '防火牆 + 網絡安全平台，SMB 及電信市場強',        sectorZh: '科技' },
  ZS:    { nameZh: 'Zscaler',          descriptionZh: 'Zero Trust 雲安全代理，SASE 架構核心',            sectorZh: '科技' },
  OKTA:  { nameZh: 'Okta',             descriptionZh: '身份認證 + SSO 平台，企業零信任入口',             sectorZh: '科技' },
  MPWR:  { nameZh: 'Monolithic Power', descriptionZh: '高效能電源管理 IC，AI 伺服器供電關鍵',            sectorZh: '科技' },
  CDNS:  { nameZh: 'Cadence',          descriptionZh: 'EDA 晶片設計軟件龍頭，AI 晶片設計不可缺',        sectorZh: '科技' },
  SNPS:  { nameZh: 'Synopsys',         descriptionZh: 'EDA + 安全測試軟件，Ansys 收購擴大版圖',         sectorZh: '科技' },
  ANET:  { nameZh: 'Arista Networks',  descriptionZh: '超大規模數據中心以太網交換機，Meta/微軟主要供應商',sectorZh: '科技' },
  WDAY:  { nameZh: 'Workday',          descriptionZh: '企業人力資源及財務雲端 SaaS，大型客戶黏性高',    sectorZh: '科技' },
  INTU:  { nameZh: 'Intuit',           descriptionZh: 'TurboTax + QuickBooks，美國中小企業財務軟件龍頭',sectorZh: '科技' },
  VRT:   { nameZh: 'Vertiv',           descriptionZh: '數據中心電源及散熱基建，AI 算力擴張直接受益',     sectorZh: '科技' },
  RBLX:  { nameZh: 'Roblox',           descriptionZh: '元宇宙遊戲平台，青少年用戶基數龐大',              sectorZh: '科技' },
  NXPI:  { nameZh: '恩智浦',           descriptionZh: '汽車 + 工業嵌入式半導體，MCU 全球前三',          sectorZh: '科技' },
  PSTG:  { nameZh: 'Pure Storage',     descriptionZh: '全快閃存儲陣列，AI/ML 工作負載數據存儲',         sectorZh: '科技' },
  TXN:   { nameZh: '德州儀器',         descriptionZh: '模擬半導體龍頭，工業 + 汽車市場廣泛滲透',         sectorZh: '科技' },
  ADI:   { nameZh: 'Analog Devices',   descriptionZh: '高精度模擬信號處理，工業 + 醫療 + 汽車',         sectorZh: '科技' },
  INTC:  { nameZh: '英特爾',           descriptionZh: 'x86 PC/服務器 CPU，製程追趕中，轉型壓力大',      sectorZh: '科技' },
  IBM:   { nameZh: 'IBM',              descriptionZh: '企業 AI (Watson) + 混合雲，Red Hat 是核心資產', sectorZh: '科技' },
  DELL:  { nameZh: '戴爾',             descriptionZh: 'AI 伺服器及 PowerEdge，企業 IT 基建龍頭',        sectorZh: '科技' },
  CSCO:  { nameZh: '思科',             descriptionZh: '企業網絡設備龍頭，轉型訂閱制軟件安全',            sectorZh: '科技' },
  GLW:   { nameZh: '康寧',             descriptionZh: '光纖電纜 + 顯示屏玻璃，AI 數據中心光纖需求爆升', sectorZh: '科技' },
  DELL:  { nameZh: '戴爾',             descriptionZh: 'AI 伺服器及存儲，企業 IT 直銷模式',              sectorZh: '科技' },
  TSM:   { nameZh: '台積電',           descriptionZh: '全球晶圓代工龍頭，2nm/3nm 先進製程核心',         sectorZh: '科技' },
  ASML:  { nameZh: 'ASML',             descriptionZh: 'EUV 光刻機全球唯一供應商，先進晶片不可缺',        sectorZh: '科技' },

  // ── Communication Services ──────────────────────────────────────────
  GOOGL: { nameZh: 'Google母公司 Alphabet', descriptionZh: '搜索廣告 + YouTube + Google Cloud，AI Gemini 全線賦能', sectorZh: '通訊' },
  META:  { nameZh: 'Meta Platforms',  descriptionZh: 'Facebook/Instagram 廣告 + AI 眼鏡，全球社交媒體龍頭',      sectorZh: '通訊' },
  NFLX:  { nameZh: 'Netflix',          descriptionZh: '全球串流媒體一哥，廣告訂閱層持續增長',                      sectorZh: '通訊' },
  RDDT:  { nameZh: 'Reddit',           descriptionZh: '社群討論平台，AI 數據授權及廣告兩條腿增長',                sectorZh: '通訊' },
  PINS:  { nameZh: 'Pinterest',        descriptionZh: '視覺靈感搜索平台，AI 廣告精準投放改善貨幣化',              sectorZh: '通訊' },
  SPOT:  { nameZh: 'Spotify',          descriptionZh: '全球音樂串流一哥，播客 + 有聲書擴展版圖',                  sectorZh: '通訊' },

  // ── Consumer Discretionary ──────────────────────────────────────────
  AMZN:  { nameZh: '亞馬遜',           descriptionZh: '電商 + AWS 雲服務，Prime 會員黏性高',                      sectorZh: '消費' },
  TSLA:  { nameZh: '特斯拉',           descriptionZh: '電動車 + FSD 自動駕駛 + 儲能，Optimus 機器人長線',         sectorZh: '消費' },
  SBUX:  { nameZh: '星巴克',           descriptionZh: '全球最大咖啡連鎖，品牌溢價+會員飛輪',                      sectorZh: '消費' },
  LULU:  { nameZh: 'lululemon',        descriptionZh: '高端運動服飾，北美女性消費者忠誠度極高',                    sectorZh: '消費' },
  DECK:  { nameZh: 'Deckers',          descriptionZh: 'UGG + HOKA 運動鞋，HOKA 增長加速',                        sectorZh: '消費' },
  ONON:  { nameZh: 'On Holding',       descriptionZh: '瑞士跑鞋品牌，高端運動消費增長明星',                       sectorZh: '消費' },
  ULTA:  { nameZh: 'Ulta Beauty',      descriptionZh: '美國最大美容零售商，會員制強黏性',                         sectorZh: '消費' },
  CELH:  { nameZh: 'Celsius Holdings', descriptionZh: '健康能量飲料品牌，美國市場份額快速增',                     sectorZh: '消費' },
  DUOL:  { nameZh: 'Duolingo',         descriptionZh: '語言學習 AI App，訂閱用戶爆發式增長',                     sectorZh: '消費' },
  MELI:  { nameZh: 'MercadoLibre',     descriptionZh: '拉丁美洲電商 + 金融科技龍頭，Mercado Pago 賦能',          sectorZh: '消費' },
  SHOP:  { nameZh: 'Shopify',          descriptionZh: '電商建站 SaaS 龍頭，中小商家及品牌出海首選',              sectorZh: '消費' },

  // ── Financials ──────────────────────────────────────────────────────
  JPM:   { nameZh: '摩根大通',         descriptionZh: '全美最大銀行，投行 + 零售 + 資管全方位',                   sectorZh: '金融' },
  GS:    { nameZh: '高盛',             descriptionZh: '頂級投行 + 資產管理，市場波動受益',                        sectorZh: '金融' },
  V:     { nameZh: 'Visa',             descriptionZh: '全球支付網絡龍頭，跨境交易手續費受益全球復甦',             sectorZh: '金融' },
  MA:    { nameZh: 'Mastercard',       descriptionZh: '全球支付二哥，與 Visa 雙寡頭壟斷支付基礎設施',            sectorZh: '金融' },
  COF:   { nameZh: 'Capital One',      descriptionZh: '美國第六大銀行，信用卡 + 數字化銀行',                     sectorZh: '金融' },
  DFS:   { nameZh: 'Discover Financial',descriptionZh: '信用卡 + 學生貸款，Capital One 收購目標',               sectorZh: '金融' },
  COIN:  { nameZh: 'Coinbase',         descriptionZh: '美國最大加密貨幣交易所，監管合規領先同業',                 sectorZh: '金融' },
  HOOD:  { nameZh: 'Robinhood',        descriptionZh: '零佣金零售券商，加密+期權+退休金戶擴展',                  sectorZh: '金融' },

  // ── Healthcare ──────────────────────────────────────────────────────
  LLY:   { nameZh: '禮來',             descriptionZh: 'GLP-1 減肥針 Mounjaro/Zepbound，糖尿病+肥胖症龍頭',     sectorZh: '醫療' },
  NVO:   { nameZh: '諾和諾德',         descriptionZh: 'GLP-1 Ozempic/Wegovy，全球減肥藥先行者',                 sectorZh: '醫療' },
  GEHC:  { nameZh: 'GE HealthCare',    descriptionZh: '醫療影像設備 + AI 診斷，從 GE 分拆獨立上市',             sectorZh: '醫療' },
  MDT:   { nameZh: '美敦力',           descriptionZh: '心臟 + 神經外科醫療設備龍頭，全球最大醫療器械商',         sectorZh: '醫療' },
  BSX:   { nameZh: 'Boston Scientific', descriptionZh: '心臟支架 + 電生理設備，微創手術器械',                   sectorZh: '醫療' },
  VEEV:  { nameZh: 'Veeva Systems',    descriptionZh: '生命科學雲端 SaaS，製藥公司臨床數據管理',                sectorZh: '醫療' },

  // ── Industrials ──────────────────────────────────────────────────────
  GE:    { nameZh: 'GE Aerospace',     descriptionZh: '航空發動機龍頭，售後服務佔大比收入',                      sectorZh: '工業' },
  IONQ:  { nameZh: 'IonQ',             descriptionZh: '量子計算上市公司，離子阱量子比特路線',                    sectorZh: '工業' },
  ETN:   { nameZh: '伊頓',             descriptionZh: '電力管理 + 數據中心電氣，AI 基建電力需求受益',            sectorZh: '工業' },
  AXON:  { nameZh: 'Axon Enterprise',  descriptionZh: '電擊槍 + 警察攝像機 + AI 執法軟件',                     sectorZh: '工業' },
  CAT:   { nameZh: '卡特彼勒',         descriptionZh: '工程機械 + 礦山設備龍頭，基建週期受益',                   sectorZh: '工業' },
  BA:    { nameZh: '波音',             descriptionZh: '商用飛機製造，737MAX 質量危機後復甦',                    sectorZh: '工業' },
  HON:   { nameZh: '霍尼韋爾',         descriptionZh: '工業自動化 + 航天材料 + 建築控制，多元工業巨頭',         sectorZh: '工業' },
  RTX:   { nameZh: '雷神技術',         descriptionZh: '導彈 + 飛機引擎 + 航電，國防訂單持續',                   sectorZh: '工業' },
  LMT:   { nameZh: '洛克希德馬丁',     descriptionZh: 'F-35 戰機 + 導彈防衛，全球最大國防承包商',              sectorZh: '工業' },
  NOC:   { nameZh: '諾斯洛普格魯門',   descriptionZh: 'B-21 轟炸機 + 太空系統，美國下一代國防核心',            sectorZh: '工業' },
  GD:    { nameZh: '通用動力',         descriptionZh: '核潛艇 + 星際戰機 + 商務飛機（灣流）',                   sectorZh: '工業' },
  UPS:   { nameZh: 'UPS',              descriptionZh: '全球物流快遞巨頭，電商物流 + B2B 配送',                  sectorZh: '工業' },

  // ── Energy ──────────────────────────────────────────────────────────
  XOM:   { nameZh: '埃克森美孚',       descriptionZh: '全球最大石油公司之一，上中下游一體化',                    sectorZh: '能源' },
  CVX:   { nameZh: '雪佛龍',           descriptionZh: '美國第二大石油公司，股息穩定',                            sectorZh: '能源' },
  FSLR:  { nameZh: 'First Solar',      descriptionZh: '美國薄膜太陽能板製造商，IRA 補貼最大受益者',             sectorZh: '能源' },
  ENPH:  { nameZh: 'Enphase Energy',   descriptionZh: '微型逆變器 + 家用儲能電池，分布式太陽能龍頭',            sectorZh: '能源' },
  CEG:   { nameZh: 'Constellation Energy', descriptionZh: '美國最大核電運營商，AI 數據中心無碳電力供應',       sectorZh: '能源' },

  // ── Materials ──────────────────────────────────────────────────────
  FCX:   { nameZh: '自由港',           descriptionZh: '全球最大銅礦商，電動車 + 電網銅需求受益',                sectorZh: '原材料' },
  ALB:   { nameZh: '雅寶',             descriptionZh: '鋰礦 + 鋰化合物，電動車電池供應鏈',                     sectorZh: '原材料' },

  // ── Real Estate ──────────────────────────────────────────────────────
  AMT:   { nameZh: 'American Tower',   descriptionZh: '全球最大電訊鐵塔 REIT，5G 升級長期受益',                sectorZh: '房地產' },
  EQIX:  { nameZh: 'Equinix',          descriptionZh: '數據中心 REIT 龍頭，互聯互通最密集節點',                 sectorZh: '房地產' },
  DLR:   { nameZh: 'Digital Realty',   descriptionZh: '全球數據中心 REIT，AI 基建租約長期',                    sectorZh: '房地產' },

  // ── International ──────────────────────────────────────────────────
  BABA:  { nameZh: '阿里巴巴',         descriptionZh: '中國電商 + 阿里雲，AI 投入加碼反彈',                    sectorZh: '國際' },
  SE:    { nameZh: 'Sea Limited',      descriptionZh: '東南亞電商（Shopee）+ 遊戲（Garena），新興市場龍頭',    sectorZh: '國際' },
  BIDU:  { nameZh: '百度',             descriptionZh: '中國搜索引擎 + 文心一言 AI + Apollo 自動駕駛',         sectorZh: '國際' },
  JD:    { nameZh: '京東',             descriptionZh: '中國自營電商 + 物流網絡，B2C 品質電商',                 sectorZh: '國際' },
  PDD:   { nameZh: '拼多多',           descriptionZh: '中國農村電商 + Temu 出海，低價策略持續擴張',            sectorZh: '國際' },
}

export function getStockMeta(ticker: string, englishName?: string): StockMeta {
  return STOCK_META[ticker] ?? {
    nameZh: englishName ?? ticker,
    descriptionZh: '',
    sectorZh: '其他'
  }
}
