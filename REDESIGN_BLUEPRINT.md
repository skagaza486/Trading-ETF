# 改革設計藍圖 — REDESIGN BLUEPRINT

> 目標：把產品從「signal 工具」重構成「新手打開即懂的市場羅盤」。
> 來源：首輪內部測試回饋 + 網絡調查（Robinhood / Public / 富途牛牛 / Finviz / TradingView / 2026 fintech onboarding 研究）。
> 現狀：單一 `App.tsx`，tabs = `Dashboard | Stocks | ETFs | Quant Lab`。本文件 = 改造後的目標態。

---

## 0. 設計原則（每個決策都回到這 5 條）

1. **由大到小的漏斗**：大市 → 板塊 → 個股。這是新手的認知路徑（富途第一屏只給大市溫度）。
2. **白話優先（Hero 永遠是人話）**：`LONG_VCP` 等 label 下沉，前台 hero 給「形態：突破整理」+ 一句解釋。
3. **漸進揭露**：Simple Mode 預設、Pro Mode 解鎖深度。研究證實可提升完成率最高 50%。
4. **每個專業詞都有出口**：「?」tooltip + 微文案，不留黑話孤島。
5. **不浪費現有資產**：signal 引擎 / gate / winrate 全部保留，下沉到「研究室」。

---

## 1. 資訊架構（IA）— 五區結構

```
┌──────────────────────────────────────────────────────────┐
│  TOP BAR:   [🇺🇸 美股 | 🇭🇰 港股]   logo        [Simple ⇄ Pro] │
├──────────────────────────────────────────────────────────┤
│                                                            │
│                    （當前頁面內容）                          │
│                                                            │
├──────────────────────────────────────────────────────────┤
│  🌡️大市      🗺️板塊      ⭐發現      🔬研究室                │
└──────────────────────────────────────────────────────────┘
            （詳情頁從任何卡片點入，非底部 tab）
```

| 區 | 路由 | 取代現有 | 預設可見模式 |
|---|---|---|---|
| 🌡️ 大市 Market | `/market` (首頁) | Dashboard | Simple + Pro |
| 🗺️ 板塊 Sectors | `/sectors` | （新增） | Simple + Pro |
| ⭐ 發現/自選 Discover | `/discover` | Stocks + ETFs 合併 | Simple + Pro |
| 📄 詳情頁 Detail | `/s/:ticker` | （新增，點入式） | Simple + Pro |
| 🔬 研究室 Quant Lab | `/lab` | Quant Lab + gate + winrate | **Pro only** |

**全域狀態**：
- `marketScope: 'US' | 'HK'` — 頂部 segment control，影響大市/板塊/發現三區的資料源。
- `uiMode: 'simple' | 'pro'` — 頂部切換，控制揭露深度。
- 兩者持久化到 localStorage，由 onboarding 設定初值。

---

## 2. Onboarding（首次開啟，3 屏）

```
 屏 1/3                    屏 2/3                    屏 3/3
┌───────────────┐        ┌───────────────┐        ┌───────────────┐
│  你想先看？     │        │  你的經驗？     │        │  你最關心？     │
│               │        │               │        │               │
│ ┌───┐ ┌───┐  │        │ ┌─────────┐  │        │ ┌─────────┐  │
│ │🇺🇸 │ │🇭🇰 │  │        │ │ 新手     │  │        │ │ 大市走勢 │  │
│ │美股│ │港股│  │        │ │（推薦）  │  │        │ └─────────┘  │
│ └───┘ └───┘  │        │ └─────────┘  │        │ ┌─────────┐  │
│  （可都選）    │        │ ┌─────────┐  │        │ │ 個別股票 │  │
│               │        │ │ 進階     │  │        │ └─────────┘  │
│  ● ○ ○        │        │ │ 我懂技術 │  │        │               │
│               │        │ └─────────┘  │        │  ○ ○ ●        │
│      [下一步] │        │  ○ ● ○        │        │   [開始使用]  │
└───────────────┘        └───────────────┘        └───────────────┘
   → marketScope          → uiMode 初值            → 決定落地首頁
                          新手=simple              大市→/market
                          進階=pro                 個股→/discover
```

- 跳過按鈕永遠在右上（不強迫）。
- 微文案：每屏一句說明「為什麼問」。
- 結果寫入 localStorage；之後可在設定改。

---

## 3. 🌡️ 大市首頁（Market）— 改革核心

### Simple Mode 線框

```
┌──────────────────────────────────────────┐
│ [🇺🇸 美股 | 港股]            [Simple ⇄ Pro] │
├──────────────────────────────────────────┤
│                                            │
│   今日市場                                  │
│   🟡 震盪偏多                               │
│   「指數小漲，但上漲家數不夠多，             │
│     適合觀察、不宜追高」                     │
│                                            │
├──────────────────────────────────────────┤
│  市寬 ❓          波幅 ❓          量能 ❓    │
│ ┌────────┐    ┌────────┐    ┌────────┐  │
│ │ 📈      │    │ 😌      │    │ 📊      │  │
│ │ 58%    │    │ VIX    │    │ 1.1x   │  │
│ │ 站上MA50│    │ 16 低  │    │ 略高於均│  │
│ │ ▁▃▅▆▅  │    │ ▆▅▃▂▁  │    │ ▃▄▅▄▆  │  │
│ └────────┘    └────────┘    └────────┘  │
├──────────────────────────────────────────┤
│  主要指數（過去一個月）                      │
│  ┌──────────────────────────────────┐    │
│  │  S&P500  ╱╲    ╱──  +2.1%         │    │
│  │  Nasdaq ╱  ╲╱╱      +3.4%         │    │
│  │  道指    ──╲___     -0.3%         │    │
│  └──────────────────────────────────┘    │
│  [看指數日線圖 →]                          │
├──────────────────────────────────────────┤
│  今日值得看（3 張卡，連到詳情頁）            │
│  [NVDA 卡] [AAPL 卡] [MSFT 卡]            │
└──────────────────────────────────────────┘
```

### Pro Mode 額外揭露（同頁，往下展開）

```
├──────────────────────────────────────────┤
│  ▼ 進階：市場內部結構                        │
│  • A-D line（漲跌家數淨值）  +312          │
│  • % above MA50 / MA200     58% / 47%     │
│  • McClellan Oscillator（簡化）  +21       │
│  • Regime（marketRegime.ts）long_friendly │
│  • 距離前高 / 回撤              -4.2%       │
└──────────────────────────────────────────┘
```

**三張卡定義（市寬 / 波幅 / 量能）**
| 卡 | Simple 顯示 | 資料源 | Pro 展開 |
|---|---|---|---|
| 市寬 | % 站上 MA50 + emoji + 迷你圖 | watchlist 全體 history 計算 | A-D line、MA200、McClellan |
| 波幅 | VIX(美)/恒指波幅(港) + 紅綠燈 | `^VIX` / `^VHSI` | 20D/IV、ATR 區間 |
| 量能 | 今日量 / 20日均量 | 指數成交量 | 各板塊量能分布 |

**「今日市場」天氣引擎**：直接複用 `marketRegime.ts` 的 `classifyRegime()`，把 `RegimeClass` 映射成天氣 + 白話：
- `long_friendly` → 🟢 偏多
- 中性 → 🟡 震盪
- `short_friendly` → 🔴 偏空
- 白話句子由「VIX 水平 + 市寬 %」模板生成。

---

## 4. 🗺️ 板塊頁（Sectors）

### Simple Mode — 板塊輪動清單

```
┌──────────────────────────────────────────┐
│  今日板塊強弱（紅綠 = 漲跌）                  │
│  ┌────────────────────────────────────┐  │
│  │ 🟢 科技      +2.4%   ▆▆▆▆▆▆        │  │
│  │ 🟢 通訊      +1.1%   ▆▆▆           │  │
│  │ 🟡 金融      +0.2%   ▆             │  │
│  │ 🔴 能源      -0.8%   ▾▾            │  │
│  │ 🔴 公用事業  -1.3%   ▾▾▾           │  │
│  └────────────────────────────────────┘  │
│  點任一板塊 → 看成份股                       │
└──────────────────────────────────────────┘
```

### Pro Mode — Finviz/TradingView 式 Treemap

```
┌──────────────────────────────────────────┐
│  ┌──────────┬──────┬────────┐            │
│  │  科技     │ 通訊  │  金融   │ ← 面積=市值│
│  │ ████████ │ ███  │ ▒▒▒▒   │   色=漲跌  │
│  │ NVDA AAPL│ GOOGL│ JPM BAC │            │
│  ├──────────┼──────┴────────┤            │
│  │ 消費      │  醫療  能源    │            │
│  │ ▒▒▒      │ ▓▓   ░░       │            │
│  └──────────┴───────────────┘            │
│  + 板塊 RS（相對強度）排行 → 餵 HYP-011     │
└──────────────────────────────────────────┘
```

- 美股：11 個 GICS 板塊（SPY 成份分類）。
- 港股：恒指行業分類（科技/金融/地產/能源…）。
- 點板塊 → 過濾後的成份股清單（複用「發現」頁卡片）。
- **副產品**：板塊 RS 排行直接實作 roadmap pending 的 RS-sector (HYP-011)。

---

## 5. ⭐ 發現/自選頁（Discover）

合併現有 Stocks + ETFs，頂部 segment 由 `marketScope` 控制美/港。

```
┌──────────────────────────────────────────┐
│ [全部] [自選] [ETF] [個股]    [排序 ▾]      │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │ [logo] 輝達 NVDA            ⭐       │  │ ← 卡片規格見 §6
│  │ 全球 AI 晶片龍頭                     │  │
│  │ $880.1   +2.4%   ▁▃▅▆▇             │  │
│  │ 🟢 形態：突破整理                    │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │ [logo] 蘋果 AAPL                    │  │
│  │ iPhone / 服務生態龍頭                │  │
│  │ $213.4   -0.3%   ▇▆▅▅▆             │  │
│  │ 🟡 形態：高位整理（觀察）            │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

---

## 6. 卡片設計規格（解決「馬上知道名稱簡介」）

```
┌──────────────────────────────────────┐
│ [logo48]  中文名 TICKER          ⭐    │  ← 公司中文名 + 代號，logo 必有
│           一句話業務簡介               │  ← 新增欄位：descriptionZh
│ $股價    +漲跌%    ▁▃▅▆▇ sparkline    │  ← 迷你 5~20 日走勢
│ 🟢 形態：白話 label（狀態詞）          │  ← labelDisplay 翻譯，hero 是白話
└──────────────────────────────────────┘
```

**新增資料需求**：`watchlist.ts` / `etfUniverse.ts` 每項補 `nameZh`、`descriptionZh`（一句話）。
**徽章映射（labelDisplay.ts 擴充）**：

| 引擎 label | Simple 徽章（白話） | 顏色 |
|---|---|---|
| LONG_BREAK | 形態：強勢突破 | 🟢 |
| LONG_VCP | 形態：突破整理 | 🟢 |
| LONG_BOUNCE | 形態：回升反彈 | 🟢 |
| LONG_BASE | 形態：打底築底 | 🟡 |
| WATCH | 觀察中 | 🟡 |
| NEUTRAL | 中性 | ⚪ |
| AVOID_CHOP | 震盪勿追 | 🔴 |
| SHORT_* | 偏弱（進階） | 🔴 |

> Simple Mode 永遠先顯示白話；Pro Mode 在白話旁加註原始 label（如「突破整理 · LONG_VCP」）。

---

## 7. 📄 個股 / ETF 詳情頁（Detail）

從任何卡片點入。

```
┌──────────────────────────────────────────┐
│ ←返回   [logo] 輝達 NVDA            ⭐ 加自選│
│ 全球 AI 晶片龍頭                            │
│ $880.10   +2.4% (+$20.6)                  │
├──────────────────────────────────────────┤
│  日線圖                          [1月|3月|1年]│
│  ┌────────────────────────────────────┐  │
│  │              ╱╲    ╱──              │  │
│  │      ╱╲╱╲╱╲╱  ╲╱╱   MA50 …………       │  │
│  │   ╱╱╱              MA200 ┄┄┄        │  │
│  │  ▁▁▂▃▂▁▂▄▅▃▂  ← 成交量              │  │
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  為什麼現在值得研究？ ❓                     │
│  🟢 突破整理形態：股價剛站上 50 日均線，      │
│     量能放大，過去類似形態 5 日平均 +1.2%。   │
│     （研究階段，非買入建議）                  │
├──────────────────────────────────────────┤
│  關鍵數據                                   │
│  距MA50  +1.8%   距52週高  -4%   RS  87     │
├──────────────────────────────────────────┤
│  ▼ Pro：signal 細節 / gate / 歷史 winrate   │
└──────────────────────────────────────────┘
```

- **白話 signal 解釋**用 winrate baseline（roadmap 已有：LONG_BREAK +1.2%、LONG_BOUNCE +0.89%…）生成。
- 永遠帶研究階段 disclaimer（沿用現有 Simple Mode 規則）。
- Pro 區掛現有 gate / robustness / forward-return。

---

## 8. 🔬 研究室（Quant Lab）— Pro Only

現有 `Quant Lab`（ETF Replay / Stock Replay / Stock Research）+ gate summary + winrate 全部原樣搬入。新手 Simple Mode 看不到此 tab，零學習負擔；進階用戶仍有完整深度。

---

## 9. Simple ⇄ Pro 對照總表

| 區域 | Simple Mode | Pro Mode 額外 |
|---|---|---|
| 大市 | 天氣 + 3 卡 + 指數圖 | A-D line、McClellan、MA200、regime |
| 板塊 | 強弱清單 | Treemap、RS 排行 |
| 卡片 | 白話徽章 | 原始 label 並列 |
| 詳情 | 白話解釋 + 關鍵數據 | gate / winrate / forward return |
| 研究室 | （隱藏） | 完整 Quant Lab |

---

## 10. 技術 / 資料需求清單

**前端**
- [ ] 拆分 `App.tsx` → 路由化五區（建議引入輕量 router 或 state-based view switch）。
- [ ] 新增 `marketScope` / `uiMode` 全域狀態 + localStorage 持久化。
- [ ] Onboarding 元件（3 屏，首訪觸發）。
- [ ] 卡片元件抽出 + sparkline + logo（複用 `assetRegistry.ts`）。
- [ ] 日線圖元件（含 MA50/MA200 + 量）。
- [ ] Treemap 元件（板塊）。

**資料**
- [ ] `watchlist.ts` / `etfUniverse.ts` 補 `nameZh` + `descriptionZh`。
- [ ] 板塊分類欄位（GICS for US / 恒指行業 for HK）。
- [ ] 市寬計算服務（全 watchlist % above MA）。
- [ ] `^VIX` / `^VHSI` 波幅資料。

**港股接入（P3）**
- [ ] 港股 watchlist + 板塊（`.HK` 後綴，如 `0700.HK`）。
- [ ] 第二條 cron：約 `30 8 * * 1-5` UTC（港股 16:00 HKT 收盤後）。
- [ ] KV/D1 schema 加 `market` 維度（US/HK）。
- [ ] 貨幣 / 交易時段 / 假期處理。

**引擎複用（零浪費）**
- `marketRegime.ts` → 大市天氣。
- `signalClassifier.ts` + `labelDisplay.ts` → 卡片白話徽章。
- winrate baseline → 詳情頁白話解釋。
- gate / robustness → 研究室 + 詳情頁 Pro 區。
- RS-sector (HYP-011) → 板塊 RS 排行（順帶清掉 roadmap pending）。

### 10.1 免費資料源拓展（按 價值/成本 排序）

> 真正缺口：Treemap 需**市值**、卡片需**中文簡介**、新手要**新聞**（富途成功要素之一）。Yahoo + Finnhub 已接線，優先吃滿。

| 排序 | 來源 | 補的缺口 | 端點 / 方式 | 成本 |
|---|---|---|---|---|
| ⭐1 | **Finnhub（已接線）** | 市值(Treemap 面積)、logo、行業、新聞、財報日 | `/stock/profile2`、`/company-news`、`/calendar/earnings`（proxy `worker.ts:155` 已就緒） | 免費 60 req/min |
| ⭐2 | **Cloudflare Workers AI** | 自動生成 `nameZh`/`descriptionZh`（免手填 ~130 檔） | Worker 內呼叫翻譯模型，結果存 KV/D1 | 免費額度內 |
| 3 | **FRED**（聖路易聯儲） | 大市頁宏觀脈絡：利率 / CPI / 失業率 | REST，免費 key | 免費 |
| 4 | **Stooq** | 指數 / 日線 **免 key fallback**（Yahoo rate-limit 備援） | CSV 下載 | 免費 |
| 5 | FMP（備選） | Finnhub 基本面不足時補 P/E 等 | REST，免費 key | 免費 250 req/日 |

**策略**：先用 **Finnhub** 拿市值+新聞+財報日（零新整合），再用 **Workers AI** 批次生成中文簡介存進 D1。港股仍以 Yahoo `.HK` 為主（Finnhub 免費層港股覆蓋弱）。市值補齊後，§4 板塊 Treemap 的「面積=市值」才能真正成立。

---

## 11. Hybrid 資料模型（核心架構決策）

> 已確認：`yahooFinanceProvider` 的 `interval`/`range` 已參數化（`src/services/marketData/yahooFinanceProvider.ts:53-55`），worker `/api/yahoo` proxy 透傳整個 query string（`worker.ts:113-116`）。**intraday 在資料層零新整合**，問題只在「運算節奏」。

### 11.1 最重要原則：把「圖表時間框」與「signal 運算節奏」解耦

| 維度 | 決策 | 理由 |
|---|---|---|
| **Signal 引擎** | **維持純 EOD**（cron 一天一次，完全不動） | 目標客戶（新手/70+）不 day-trade；winrate baseline 全是 EOD；盤中重算需重驗證 + KV/D1 成本暴增 |
| **詳情頁圖表** | 時間框切換，5 日內走 **intraday 按需抓取** | 純視覺化，不觸碰 signal；資料層已就緒 |
| **大市/板塊** | EOD 快照即可 | 新手看日內市寬無意義 |

```
signal 引擎  ──► EOD（cron 一天一次，不動）
詳情頁圖表  ──► 1日/5日 走 intraday 按需抓 + KV 短快取；1月/1年 走 EOD
大市/板塊   ──► EOD 快照
```

### 11.2 Intraday 按需抓取（Hybrid 的關鍵機制）

- 用戶打開詳情頁才抓**那一支**的 intraday，**不進 cron、不為每支股票預算**。
- 呼叫：`/api/yahoo/v8/finance/chart/NVDA?interval=5m&range=5d`（proxy 已支援，前端今天即可 PoC）。
- 快取：KV `intraday:{ticker}:{interval}`，盤中 TTL 60–120s、收盤後拉長至下次開盤 → 壓低熱門股重複抓取，避開 Yahoo 免費 rate limit。

### 11.3 Yahoo intraday 硬限制（決定能給多細）

| interval | 可抓歷史 | 詳情頁時間框 |
|---|---|---|
| `1m` | ~7 天 | 「今日」分時 |
| `5m`/`15m`/`30m` | ~60 天 | 5日 / 1月 |
| `60m` (1h) | ~730 天 | 季 / 半年 |
| `1d` | 多年 | 1年+ |

→ 分鐘線**只能看近期**（無法回補歷史），用途天然限定為「最近走勢視覺化」，與「signal 維持 EOD」一致。

### 11.4 圖表庫選型

採 **TradingView lightweight-charts**（開源、~45KB gzip、原生 candlestick + 量 + 多時間框）。比手畫 SVG 省事，且天然支援 §11 的時間框切換。

---

## 12. Repo 重組：同 repo「兩個 App 共存」（決議）

> **決議**：保留舊 app 凍結為 `legacy`，新 app 在 `web/` greenfield 開發，共用 domain 層。**不採 Strangler**——舊 `App.tsx`（3054 行）原樣保留當參考/fallback，新 app 不必逐行掏空它。

### 12.1 為什麼「兩 app 共存」優於原地重構

| 面向 | 兩 app 共存 | （原 Strangler） |
|---|---|---|
| 舊 app | 凍結、隨時可回退/對照 | 被逐步掏空、最終刪除 |
| 新 app | greenfield 乾淨開發 | 受舊碼結構牽制 |
| 風險 | 低（互不影響） | 中（邊改邊跑） |
| 共用 | engine/services/types/data 兩 app 共享，零重複 | 同 |
| 代價 | 多一個 bundle、需保持共用 API 穩定、日後 sunset legacy | — |

### 12.2 目標結構（多入口 + 共用 domain 層）

```
src/
  ── 共用 domain 層（兩 app 都 import，位置不動）──
  engine/                # ★ 不動：signal 引擎
  types/                 # ★ 不動
  services/marketData/   # ★ 既有 + 新增 intradayProvider / breadthService / finnhub / 翻譯
  data/
    us/                  # watchlist + sectors（美股，現有 watchlist 移入）
    hk/                  # watchlist + sectors（港股）

  ── 舊 app（凍結）──
  legacy/
    App.tsx              # 現有 3054 行原樣移入（import 路徑微調指向共用層）
    main.tsx, styles/

  ── 新 app（greenfield）──
  web/
    main.tsx
    app/                 # 精簡 shell：頂 bar + 底 nav + view 切換 + 全域 state
    features/            # onboarding / market / sectors / discover / detail / lab
    shared/
      components/        # Card, Sparkline, PriceChart(lightweight-charts), Treemap, Weather, Tooltip
      hooks/             # useSnapshot, useIntraday, useScope
      i18n/              # labelDisplay(白話徽章) / nameZh / descriptionZh / 微文案

index.html               # → src/web/main.tsx     （新 app，根路徑 /）
legacy.html              # → src/legacy/main.tsx  （舊 app，/legacy）

worker/
  index.ts               # 入口（原 worker.ts）：route + 服務兩個 HTML
  routes/                # yahoo, finnhub, snapshot, d1, market, sectors, intraday, admin
  cron/
    usSnapshot.ts        # 原 cronSnapshot.ts
    hkSnapshot.ts        # 港股 cron
```

### 12.3 構建與服務（多入口關鍵）

- **Vite multi-page**：`vite.config.ts` 設 `build.rollupOptions.input = { main: 'index.html', legacy: 'legacy.html' }`，產出兩個 entry 共享 vendor chunk。
- **Worker 服務**：`/legacy*` → `legacy.html`，其餘 → `index.html`（新 app）。API route（`/api/*`）兩 app 共用，完全不變。
- **單次部署**：仍是 `vite build && wrangler deploy`，同一個 `trading-etf` Worker。

### 12.4 檔案搬遷對照

| 現有 | 去向 | 動作 |
|---|---|---|
| `src/App.tsx`（3054 行） | `src/legacy/App.tsx` | **整檔移動凍結**，只改 import 路徑指向共用層 |
| `src/main.tsx` | `src/legacy/main.tsx` | 移動；新增 `src/web/main.tsx` |
| `src/engine/*`、`src/types/*` | 原位 | **不動**，兩 app 共用 |
| `src/services/marketData/*` | 原位 | 保留 + 加 intraday / breadth / finnhub / 翻譯 |
| `src/ui/labelDisplay.ts` | `src/web/shared/i18n/`（legacy 仍 import 舊位或共用） | 新 app 用擴充版；legacy 不動 |
| `src/ui/assetRegistry.ts` | 共用（兩 app 都用） | 保留 |
| `src/data/watchlist.ts` | `src/data/us/watchlist.ts` | 移動 + 加 nameZh/sector（legacy import 跟著改） |
| `src/worker/cronSnapshot.ts` | `worker/cron/usSnapshot.ts` | 移動 + 抽共用 |
| `worker.ts` | `worker/index.ts` + `worker/routes/*` | 拆 route + 加服務 legacy.html |

> 原則：**共用層（engine/types/services/data）位置盡量不動**，把改動集中在新增的 `web/` 與 worker route 拆分，降低牽動 legacy 的風險。

---

## 13. 詳細工作 Roadmap

> 標記：⬜ 待辦　🔁 依賴前項　★ 複用既有　⚠️ 風險點。每階段結束需過 `tsc --noEmit` 零錯誤 + `vite build && wrangler deploy` 部署驗證。

### Phase 0 — 地基（兩 app 共存骨架 + 全域狀態）〔解鎖一切〕

| # | 任務 | 備註 |
|---|---|---|
| 0.1 | ⬜ 現 `App.tsx`/`main.tsx` 移入 `src/legacy/`，import 改指共用層 → 舊 app 凍結 | ⚠️ 過 `tsc` + 部署驗證 legacy 仍運作 |
| 0.2 | ⬜ Vite 多入口：`index.html`→`web/main.tsx`、`legacy.html`→`legacy/main.tsx`；worker `/legacy*` 服務 legacy | §12.3 |
| 0.3 | ⬜ 建 `web/app` 精簡 shell（頂 bar + 底 nav + view 切換） | greenfield，不掛舊碼 |
| 0.4 | ⬜ `MarketScope`(US/HK) + `UiMode`(simple/pro) 全域 state + localStorage | ⚠️ 全新 app 依賴 |
| 0.5 | ⬜ `web/features/` 五個空殼 + 註冊表（state-based，不引 router） | lab 殼先連到 `/legacy` 入口 |
| 0.6 | ⬜ 接入 `lightweight-charts` + `web/shared/components/PriceChart` | 為 P2 圖表鋪路 |
| **驗收** | `/` 出新 app 骨架可切五區、scope/mode 有持久化；`/legacy` 出舊 app 完整可用 | |

### Phase 1 — 大市首頁 + Onboarding（P0 體驗核心）〔解決「無從入手」〕

| # | 任務 | 備註 |
|---|---|---|
| 1.1 | ⬜ `breadthService`：從 watchlist 算 % above MA50/200、漲跌家數 | ★ 複用 `computeProxyWeakBreadth` |
| 1.2 | ⬜ 大市天氣引擎：`classifyRegime()` → 天氣 emoji + 白話模板 | ★ 複用 `marketRegime.ts` |
| 1.3 | ⬜ 抓 `^VIX`/指數序列，cron 增寫「大市快照」KV key | 一個新 key |
| 1.4 | ⬜ 大市首頁 Simple：天氣 + 市寬/波幅/量能三卡 + 指數比較圖 + 3 張卡 | |
| 1.5 | ⬜ Pro 揭露：A-D line、MA200、McClellan、regime | 🔁 1.1 |
| 1.6 | ⬜ Onboarding 3 屏（市場→經驗→關心點）寫入 scope/mode 初值 | 🔁 0.2 |
| 1.7 | ⬜ Simple/Pro 全域貫穿 + 「?」tooltip 元件 | |
| **驗收** | 新手首訪走完 onboarding，落在大市首頁，一眼看懂今日市場 | |

### Phase 2 — 卡片改造 + 詳情頁 + Hybrid 圖表（P1）〔解決「不知道是什麼」〕

| # | 任務 | 備註 |
|---|---|---|
| 2.1 | ⬜ `data/us/watchlist.ts` 補 `sector`；用 **Workers AI** 批次生成 `nameZh`/`descriptionZh` 存 D1 | §10.1 ⭐2，免手填 |
| 2.1b | ⬜ Finnhub `/stock/profile2` 抓**市值**+logo+行業，入大市快照/D1 | §10.1 ⭐1，proxy 已就緒 |
| 2.2 | ⬜ `labelDisplay` 擴白話徽章映射表 | ★ §6 對照表 |
| 2.3 | ⬜ `shared/components/Card`（logo + 中文名 + 簡介 + sparkline + 徽章） | |
| 2.4 | ⬜ `discover` 頁：合併 Stocks+ETFs，scope 切換、排序、篩選 | |
| 2.5 | ⬜ `useIntraday` hook + `/api/intraday/:ticker`（KV 短快取） | ★ proxy 已支援；⚠️ rate limit |
| 2.6 | ⬜ `detail` 頁：時間框切換（1日/5日 intraday・1月/1年 EOD）+ MA/量 | 🔁 0.5, 2.5 |
| 2.7 | ⬜ 詳情頁白話 signal 解釋（用 winrate baseline 生成）+ disclaimer | ★ baseline 已有 |
| 2.8 | ⬜ Pro 區掛 gate / robustness / forward-return | ★ 既有 |
| 2.9 | ⬜ 詳情頁掛 Finnhub 新聞 + 財報日（富途式 7/24 資訊） | §10.1 ⭐1 |
| **驗收** | 點任一卡 → 詳情頁見日線+分鐘線切換、公司簡介、白話解釋 | |

### Phase 3 — 板塊頁 + Treemap + RS 排行（P2）

| # | 任務 | 備註 |
|---|---|---|
| 3.1 | ⬜ 板塊聚合服務（按 `sector` 分組算漲跌/RS） | 🔁 2.1 |
| 3.2 | ⬜ 板塊 RS 排行 → 實作 roadmap pending **HYP-011** | ★ 順帶清 backlog |
| 3.3 | ⬜ Simple：板塊強弱清單；Pro：`Treemap` 元件（Finviz 式，**面積=市值**） | 🔁 2.1b 市值 |
| 3.4 | ⬜ 板塊 → 成份股清單（複用 discover 卡片） | 🔁 2.3 |
| **驗收** | 板塊頁見強弱排序，點板塊看成份股，Pro 見 treemap | |

### Phase 4 — 港股接入（P3）〔解決「拆分美股港股」〕

| # | 任務 | 備註 |
|---|---|---|
| 4.1 | ⬜ `data/hk/`：港股 watchlist（`.HK`）+ 恒指行業分類 + logo | |
| 4.2 | ⬜ KV/D1 加 `market` 維度（US/HK 區隔） | ⚠️ schema migration |
| 4.3 | ⬜ `worker/cron/hkSnapshot.ts` + 第二 cron `30 8 * * 1-5` UTC | |
| 4.4 | ⬜ `^VHSI` 波幅 + 恒指序列接大市/板塊 | 🔁 1.3 |
| 4.5 | ⬜ 交易時段 / 貨幣 / 假期處理 | |
| **驗收** | 頂部切港股，大市/板塊/發現/詳情全部呈現港股資料 | |

### 橫切關注（每階段都要顧）

- ⬜ 長者可用性：字級、對比、點擊區 ≥ 44px、永遠保留研究階段 disclaimer。
- ⬜ 每階段更新 `MEMORY.md` 的 roadmap-progress。
- ⬜ Yahoo rate limit 監控（intraday 上線後重點看）。

### 依賴關係速覽

```text
Phase 0（地基）─┬─► Phase 1（大市+onboarding）
                ├─► Phase 2（卡片+詳情+圖表）
                └─► Phase 3（板塊）── 需 2.1/2.3
Phase 1.3 ──────────► Phase 4.4（港股波幅復用）
Phase 0–3 全部美股完成後 ─► Phase 4（港股 = 套用同結構）
```

---

*來源調查：StockBrokers.com（行動交易）、富途牛牛產品拆解（人人都是產品經理）、Liberated Stock Trader（heatmaps）、Eleken / CleverTap（2026 fintech onboarding 漸進揭露）。*

---

## 14. Trust-First 重定向（多輪 AI 評估後的優先序修正）

> **背景**：在 §1–§13 的「功能擴張」藍圖之上，經過四輪獨立評估（Sonnet / Opus 兩輪自評 + 兩個外部 AI）收斂出一個更上游的結論——
>
> **最大風險不是畫面不好，而是畫面呈現出的「成熟與確定感」高於數據驗證與功能完整度。** 精確回報數字、港股入口、自選承諾與市寬語意，正在傷害新用戶最重要的資產：**信任**。
>
> 因此在繼續鋪 §3–§13 的新頁面之前，**先做一輪「止血信任」（trust-first）**，把畫面的確定感拉回到數據實際能支撐的程度。

### 14.1 核心定位（取代「告訴新手買什麼」）

> **每天用三分鐘，知道市場環境、值得研究的變化，以及應該等待什麼確認。**

此定位既貼合 EOD signal 引擎（§11），也最適合新手與年長用戶；產品是「市場羅盤」，不是「明牌機」。

### 14.2 四輪評估的關鍵發現（已驗證屬實）

| 發現 | 性質 | 出處 |
|---|---|---|
| 港股 onboarding 可選，選後只見「即將推出」placeholder → 第一個承諾即跳票 | 信任 | GPT |
| `DetailView` 寫死「平均 5 日回報 +1.2%/+1.1%/+0.9%」，無樣本數/期間/gate → 新手誤當預期回報 | 信任 / liability | GPT |
| 市寬「升跌家數」由 signal label 推算，非當日實際升跌 → 名實不符 | 正確性 | GPT |
| 卡片 ❓ 是純裝飾字元、無 handler → UI 承諾「點我有解釋」卻落空 | 體驗 | 外部 AI + 自評 |
| 無真正自選/收藏；`DiscoverView` 的 `watchlist` filter 其實只是 LONG_BASE/WATCH 分類 | 留存 | 全部 |
| snapshot 是 signal-first payload：無 `prevClose`、無 `close[]` → 卡片無法顯示日漲跌% / sparkline | 結構限制 | Opus |
| 「今日動向」機制（previousLabel→ChangeRow）已存在，但埋在 Discover、未上大市首頁 | 留存 | Opus |

### 14.3 修正後的優先序（取代 §13 的純階段推進）

**P0 — 止血信任（純前端，零資料層/部署風險）✅ 本輪已落實**
- ✅ 港股鎖定：onboarding 禁選 HK + 「即將推出」標示（`Onboarding.tsx`）
- ✅ 回報數字摘要化：移除 `DetailView` 寫死回報；改用真實已結算樣本（`/api/d1/signal-stats`，經 `useSignalStats`）動態顯示 n / 5日均報 / 勝率 / 相對大盤 / MAE / MFE；**樣本 < 20 時刻意不顯示回報數字**（`SignalStatsCard`）
- ✅ 市寬改名：「升跌家數」→「偏強/偏弱訊號數」（`BreadthCard.tsx`）
- ✅ ❓ 變可點：新增 `InfoDot` 元件（手機友好），接入市寬 / VIX / RVOL 三卡

**P1 — 建立新手決策流程**（待辦）
- ⬜ 首頁「值得留意」由排名榜 → 行動板：每張主選加「機會 / 主要風險 / 失效條件」三行
- ⬜ 詳情頁加「現在處於哪一步」：觀察 / 等確認 / 已觸發 / 失效
- ⬜ 顯示資料與研究最後更新時間
- ⬜ snapshot 補 `prevClose` + 短 `close[]`（**需動 cron**）→ 解鎖卡片日漲跌% + sparkline

**P2 — 建立回訪閉環（留存核心）**（待辦）
- ⬜ 真正的 ⭐ 自選（localStorage 先上，之後帳戶同步）
- ⬜ 把「今日動向」上提到大市首頁（複用現成 `ChangeRow`）
- ⬜ 自選標的每日變動摘要 + 信號變化提醒（複用 server 端 change detection）
- ⬜ 「下一步任務」面板（加 N 檔到自選 / 觀察一週）掛在自選之上

**P3 — 加深度**（信任與閉環完成後才做）
- ⬜ 新聞、財報摘要、板塊 treemap、港股資料、完整研究統計（即 §3–§13 餘下項目）

> **執行原則**：先 P0 止血、再 P2 通閉環、最後 P3 加深度。否則資訊愈多，只會令產品更像另一個行情 dashboard。

---

## 15. 資料管線重置（Cloudflare vs AWS 決議）

> **背景**：手動觸發 snapshot 只攞到 43/130 隻，且重跑確定性一樣。診斷後確認：**唔係** Worker subrequest 上限（帳號係 paid，限額 1000），而係 **Yahoo 對 Worker egress IP 限流**——`buildDailySnapshot` 喺 Worker 內要趕住喺 CPU/時間預算內 concurrency=8 爆抓，被大量拒絕。實測當下 Yahoo（429）同 Stooq（JS 反爬挑戰）**都封緊**，證明問題喺資料源頭，唔係雲供應商。

### 15.1 決議：唔搬 AWS，只把「批次管線」搬離 Worker

- 用戶保留來源 = 「serverless 老是撞限制」。但換 AWS 解決唔到 Yahoo 限流，serving 層搬去 Lambda+APIGW 仲更貴更受限。
- **服務層**（派 `dist/` + 讀 KV/D1 API）留喺 Cloudflare——佢最叻、最平。
- **批次管線**（抓 130 隻 + 算信號）搬去 **GitHub Actions**（full Node、可跑 10+ 分鐘、可耐心重試），喺 off-peak 21:30 UTC 跑。

### 15.2 架構（POST-to-ingest，重用 binding 寫入）

```
GitHub Actions (Node, 無 Worker 限制)
  └─ scripts/build-snapshot.ts
       buildDailySnapshot({ stockConcurrency:3, tuning:{retries:4, backoff, batchDelay} })
       └─ POST 完整 snapshot ──► Worker  POST /api/admin/ingest-snapshot  (Bearer INGEST_TOKEN)
                                          └─ KV put + writeSignalsToD1（現有 binding 寫入路徑）
Worker cron（保留做 fallback + settle/gate/ETF）
```

- **點解 POST-to-ingest 而唔係 CI 跑 wrangler 寫 SQL**：Action 只需 1 個 secret（`INGEST_TOKEN`）+ Worker URL，唔使 wrangler-in-CI、唔使 D1 API token、唔使生 SQL、零 schema drift；寫入重用已驗證嘅 `writeSignalsToD1` + KV binding。
- **安全閥**：`scripts/build-snapshot.ts` 有 `MIN_STOCKS`（預設 100）守門，抓唔夠就 abort，唔會用 thin snapshot 覆蓋好快照。
- **`buildDailySnapshot` 已參數化** retry/concurrency/delay；Worker cron 用預設值（行為零改變），Node runner 用耐心參數。

### 15.3 已落實 / 待用戶設定

- ✅ `buildDailySnapshot` + `fetchBatch` 加 `FetchTuning`（retry/backoff/batchDelay）
- ✅ Worker `POST /api/admin/ingest-snapshot`（token 保護，已部署，已實測 auth + KV + D1 寫入）
- ✅ `scripts/build-snapshot.ts`（tsx 跑）+ `.github/workflows/snapshot.yml`（cron 21:30 UTC + manual dispatch）
- ⬜ **用戶要做**：GitHub repo Settings → Secrets 加 `INGEST_TOKEN`（值已生成、見對話）；首次喺 Actions tab 手動 dispatch 驗證 off-peak Yahoo 抓滿 130
- ⬜ **後續**：Yahoo 若 off-peak 都唔穩，加第二源（Tiingo / Twelve Data；Stooq 已加 JS 反爬、唔再係簡單 fallback）
- ⬜ 驗證綠燈後，可移除 Worker cron 嘅 snapshot 部分（留 settle/gate/ETF）

