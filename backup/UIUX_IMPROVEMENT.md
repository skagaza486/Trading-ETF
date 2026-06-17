# UI / UX 改善計劃（Simple Mode 重設計）

## 目的

現有介面是「研究工具」的外觀，但目標用戶是 **新手投資者** 和 **70 歲長者**（練一會也要看得懂）。
這份文件定義一套以「一句人話 + 紅綠燈」為核心的重設計，並保留現有研究功能。

**設計三原則：**

1. **一個畫面回答一條問題** —「今日邊啲值得留意？我該點做？」
2. **預設給普通人，研究功能收進進階** — 雙模式切換（Simple / Advanced）。
3. **看得清、撳得到** — 大字、高對比、形狀+顏色+文字三重編碼。

**已確定的方向（與用戶確認）：**

- 架構：**雙模式切換**（預設 Simple Mode，頂部一個切掣入 Advanced / 研究模式）
- 語言：**中英並列**（中文為主，ticker / 英文術語保留在細字，方便查資料對照）
- 本文件為 **設計文檔**，不含代碼改動；落地時再轉成 Codex prompt 或直接實作。

---

## 現狀診斷（用目標用戶的眼睛看）

對照現有 `src/App.tsx` + `src/styles/dashboard.css`：

| 現在畫面上的東西 | 代碼位置 | 新手 / 長者的反應 |
| --- | --- | --- |
| 標籤是 `LONG_CONFIRM` / `UP_PROMOTION` / `AVOID_CHOP` | `App.tsx` label-pill 直接印 `row.label` | 「呢啲英文係咩意思？」完全看不懂 |
| `eyebrow: DataHealth`、`Reason: Regime long_friendly \| RSI 62.3 \| RVOL 1.8 \| CMF 0.12` | `pageIntro()`、`reason` 字串 | 像工程師除錯訊息，不是給人看的 |
| 4 個 tab 混了消費者用 + 研究者用 | `tabs` = ['ETF Weekly','ETF Replay','Stock Screener','Stock Research'] | 一進來見到 13 欄 Gate G1-G6，直接嚇退 |
| 全英文 | 整個 UI | 文檔是中文但 UI 全英文，長者讀不了 |
| 表格 `0.86rem` 字、`white-space: nowrap`、密集 | `dashboard.css` table / th / td | 眼睛吃力，平板要左右拉 |
| 標籤只講「狀態」不講「我該做咩」 | label 設計 | 看完仍不知「咁我買唔買？」 |

**根本問題：兩種人（普通人 vs 研究者）的需求被擠在同一個畫面。**

---

## 一、雙模式架構

```
┌─ 頂部常駐 ───────────────────────────────────┐
│  ETF 信號助手          [ 簡單 ●——○ 進階 ]  [? 點睇] │
└──────────────────────────────────────────────┘

簡單模式（預設）                進階模式（研究者）
─────────────                  ─────────────
[ 今日精選 ]                    [ ETF Weekly ]
[ ETF 每週 ]                    [ ETF Replay ]
                               [ Stock Screener ]
                               [ Stock Research / Gate Summary ]
```

- 切掣狀態存進 `localStorage`，下次記得用戶選擇。
- 預設 **Simple**。`DataHealth` / `Gate Summary` / `Replay analytics` 在 Simple 模式完全不出現。
- 切到 Advanced = 現有介面（可逐步加中文，但不是這次重點）。

---

## 二、標籤翻譯表（最高影響的一步）

把 12 個內部代碼 → **紅綠燈 + 中文短語 + 一句人話 + 一個動作**。
英文代碼保留在細字（中英並列），方便進階用戶對照。

| 內部代碼 | 燈號 | 中文（主） | 英文（細字） | 一句點解（口語） | 動作詞 |
| --- | --- | --- | --- | --- | --- |
| `UP_PROMOTION` | 🟢🟢 | **升勢確認＋加強** | UP_PROMOTION | 「連續轉強，升得有力」 | 可考慮 |
| `LONG_CONFIRM` | 🟢 | **升勢已確認** | LONG_CONFIRM | 「升得有力，成交配合」 | 可考慮 |
| `LONG_SETUP` | 🟢 | **接近買入點** | LONG_SETUP | 「升勢成形，留意入場」 | 可考慮 |
| `LONG_WATCH` | 🟡 | **初現上升跡象** | LONG_WATCH | 「啱啱轉好，未到位，先睇住」 | 先觀察 |
| `NEUTRAL` | ⚪ | **方向未明** | NEUTRAL | 「冇明顯方向，暫時觀望」 | 先觀察 |
| `AVOID_CHOP` | 🟠 | **上落市，避開** | AVOID_CHOP | 「上上落落冇方向，唔好掂」 | 避開 |
| `SHORT_WATCH` | 🟠 | **走勢轉弱** | SHORT_WATCH | 「開始偏弱，小心」 | 避開 |
| `SHORT_SETUP` | 🔴 | **跌勢成形** | SHORT_SETUP | 「跌緊，唔好接」 | 避開 |
| `SHORT_CONFIRM` | 🔴 | **跌勢已確認** | SHORT_CONFIRM | 「明顯下跌，遠離」 | 避開 |
| `DOWN_PROMOTION` | 🔴🔴 | **跌勢確認＋加強** | DOWN_PROMOTION | 「連續轉弱，跌得急」 | 避開 |
| `REVIEW_DATA` | ⚫ | **暫時無法判斷** | REVIEW_DATA | 「資料不足，避開」 | 避開 |
| `REVIEW_EVENT` | ⚫ | **快出財報** | REVIEW_EVENT | 「臨近財報波動大，避開」 | 避開 |

**動作詞只用三種**（降低決策負擔）：

- 🟢 **可考慮** —「值得留意，可以研究入場」
- 🟡⚪ **先觀察** —「未到位，繼續睇住」
- 🟠🔴⚫ **避開** —「唔好掂」

> 實作建議：新增一個 `src/ui/labelDisplay.ts`，輸入 `StockSignalLabel`，輸出 `{ light, zhText, enCode, plainReason, action }`。
> 這層只負責「翻譯」，不碰任何 engine 邏輯，把 UI 文案和信號計算徹底分離。

---

## 三、大市狀態翻譯（首屏最頂一句）

把 `regime: RegimeClass` 翻譯成人話橫額：

| regime | 顯示 |
| --- | --- |
| `long_friendly` | 🟢 **今日大市偏好** — 可以積極啲（Market: Long-friendly） |
| `neutral` | 🟡 **今日大市普通** — 小心揀（Market: Neutral） |
| `short_friendly` | 🔴 **今日大市偏弱** — 建議避險（Market: Short-friendly） |

放在首屏最頂，讓用戶先有大局觀再看個股。

---

## 四、卡片取代表格（Simple Mode 首屏）

現有是密集表格。Simple Mode 改成**一隻股票一張大卡**，已按「值得留意程度」排好（沿用現有 `stockPriority` 排序）。

```
┌──────────────────────────────────────────────┐
│  🟢  NVDA · 輝達                                │
│      升勢已確認                  〔可考慮〕       │
│  ────────────────────────────────────────     │
│  點解：升得有力，成交配合                          │
│  過去 3 個月 +18%      跑贏大市 +5%               │
│                                                 │
│  〔 點解咁講？ ▾ 〕    ← 撳開先見技術細節           │
└──────────────────────────────────────────────┘
```

撳開「點解咁講？」才顯示技術細節（中英並列）：

```
   ┌─ 技術細節 (Technical) ───────────────┐
   │  相對強弱 RSI ........... 62  (偏強)    │
   │  成交量倍數 RVOL ........ 1.8 (放量)    │
   │  資金流 CMF ............. +0.12 (流入)  │
   │  大市環境 Regime ........ 偏好          │
   └──────────────────────────────────────┘
```

- 技術細節每項都「中文 + 英文 + 一個白話判語（偏強/放量/流入）」。
- 預設摺疊，普通人永遠不用展開也能用。

---

## 五、無障礙規格（針對 70 歲）

對照現有 `dashboard.css`，Simple Mode 需要：

| 項目 | 現狀 | Simple Mode 規格 |
| --- | --- | --- |
| 基礎字體 | 表格 `0.86rem` | **≥ 1.05rem**；卡片標題 ≥ 1.4rem |
| 燈號編碼 | 只靠顏色 | **形狀 + 文字 + 顏色**三重（🟢圓＝可考慮、🟠菱＝避開…）避免色盲只靠色分不出 |
| 橫向捲動 | 表格 `nowrap` 要左右拉 | **禁止**；卡片式垂直流，一行一重點 |
| 按鈕大小 | `min-height: 34px` | **≥ 44px**（老花/手指友善） |
| 對比度 | 深綠底中綠字偏低 | 主文字對比 **≥ 7:1**（WCAG AAA） |
| 數字格式 | `+18.0%` | 大字、正負用顏色＋符號雙重標示 |

> 注意：燈號用 emoji 之外，最好同時用「圓形/菱形/方形」形狀，因為部分長者裝置 emoji 渲染不一致。

---

## 六、首次進入導覽（Onboarding）

第一次開 App（`localStorage` 無紀錄）彈一個三步小卡：

```
┌─ 歡迎 (1/3) ──────────────────┐
│  呢個 App 幫你睇                │
│  「今日邊啲股票/ETF 值得留意」    │
│           [ 下一步 ]            │
└───────────────────────────────┘
┌─ 點睇 (2/3) ──────────────────┐
│  🟢 可考慮   🟡 先觀察   🔴 避開  │
│  跟住燈號顏色就得               │
│           [ 下一步 ]            │
└───────────────────────────────┘
┌─ 提醒 (3/3) ──────────────────┐
│  呢個係參考工具，唔係投資建議。   │
│  最後決定喺你自己。              │
│           [ 開始用 ]            │
└───────────────────────────────┘
```

頂部常駐「? 點睇」可隨時重看。

---

## 七、Simple Mode 完整 User Flow

```
開 App
  ↓ (首次) 三步導覽
  ↓
首屏最頂：「今日大市：🟡 普通 — 小心揀」
  ↓
往下捲 = 一疊紅綠燈卡片（已按值得留意程度排好，🟢 喺最上）
  ↓
睇到一張 🟢 NVDA「升勢已確認 〔可考慮〕」
  ↓ 讀一句點解就夠
想知多啲？ → 撳「點解咁講？」展開技術細節
  ↓
(切換) 頂部撳「進階」→ 入返 Gate Summary / Replay（研究者）
```

**對比現狀流程**：現在一進來就是英文表格 + DataHealth chip + 13 欄 Gate，
新手第一秒就 lost。新流程第一秒就見到「今日大市」一句中文 + 顏色卡。

---

## 八、兩種模式的 tab 對應

| Simple Mode | Advanced Mode（≈ 現狀） |
| --- | --- |
| 今日精選（= Stock Screener 卡片化 + 翻譯） | Stock Screener（原表格） |
| ETF 每週（= ETF Weekly 卡片化 + 翻譯） | ETF Weekly（原表格） |
| —（隱藏） | ETF Replay |
| —（隱藏） | Stock Research / Gate Summary |

Simple 只保留兩個「今日可以睇咩」的 tab；所有回測 / 統計驗證歸 Advanced。

---

## 九、落地階段（更新後狀態 — 2026-06-18）

> 方向修訂：放棄 Simple/Advanced 雙模式，改為優化單一進階模式對新手的可讀性。

| 階段 | 內容 | 工程量 | 狀態 |
| --- | --- | --- | --- |
| P1 | `labelDisplay.ts` 翻譯層 + 中英 label pills + reason cells + 免責聲明 | 低 | ✅ 完成 |
| P2 | ~~Simple / Advanced 切掣~~ — 已放棄，改單一進階模式雙語化 | — | ✅ 方向已定 |
| P3 | Stock Screener 卡片化（卡片/列表 toggle，預設卡片） | 中 | ✅ 完成 (2026-06-18) |
| P4 | ~~ETF Weekly 卡片化~~ — 延後 | 中 | 延後 |
| P5 | 無障礙規格：字體 ≥ 1.05rem、觸控 ≥ 44px、形狀編碼、對比度 | 中 | ✅ 完成 (2026-06-18) |
| P6 | 「? 點睇」Gate 說明 + 常駐 help FAB + 3 步入門導覽 | 低 | ✅ 完成 (2026-06-18) |

### 已落地的 B5 具體改動（2026-06-18）

- `global.css`：`:root` 加 `font-size: 1.05rem`
- `dashboard.css`：
  - `button, select, input, textarea` 的 `min-height` 34px → **44px**（WCAG 觸控目標）
  - `table` 字體 0.86rem → **0.9rem**
  - `.label-pill--stock-short` 改為方角（`border-radius: 4px`）作形狀編碼，LONG 保留圓形
  - `.zh-subtitle` 顏色加強（#5a7a60 → #8aaa90）
  - `.disclaimer-inline` 顏色加強（#7a6020 → #a08030）
  - 新增 `.gate-legend` 系列 CSS

### 已落地的 B3 具體改動（2026-06-18）

- `App.tsx`：Stock Screener 新增 `stockViewMode: 'table' | 'cards'` state，預設 `cards`
- 新增卡片/列表 toggle 按鈕（`.view-toggle` CSS）
- 卡片模式（`.stock-card-grid`）：每股一張卡，顯示 ticker / name / sector / signal pill / RSI / RVOL / RS vs SPY / 財報日期 / plainReason
- 卡片依 group（long/short/neutral）有左邊框顏色區分
- `dashboard.css` 新增 `.stock-card-grid`、`.stock-card`、`.view-toggle` 相關 CSS

### 已落地的 B6 具體改動（2026-06-18）

- `App.tsx`：
  - Gate Summary section「? 點睇 Gate 說明」toggle 按鈕（展開 G1–G6 面板）
  - 新增 `onboardingStep` state：首次訪問自動彈出 3 步導覽（localStorage `onboarding_v1_done` 控制）
  - 新增 `showHelp` state：右下角常駐「?」FAB，點擊展開快速說明面板（含「重看導覽」按鈕）
- `dashboard.css` 新增 `.help-fab`、`.help-panel`、`.onboarding-overlay`、`.onboarding-modal` CSS

---

## 十、文案原則（中英並列）

- **中文在前、大字；英文 ticker / 術語在後、細字。** 例：`輝達 NVDA`、`相對強弱 RSI 62`。
- 動作詞固定三個：可考慮 / 先觀察 / 避開。不要出現第四種講法。
- 禁止在 Simple Mode 出現：`regime`、`Gate`、`MAE`、`vs SPY`、`DataHealth`、`forward return` 等術語（全部翻譯或收進 Advanced）。
- 每個畫面底部常駐一句免責：**「參考工具，非投資建議，最後決定喺你自己。」**

---

## 待確認 / 後續

- 卡片上「過去 3 個月 / 跑贏大市」的數字，Simple Mode 要用百分比定埋文字描述（如「升咗一成八」）？長者可能對文字更易讀。
- 是否要加「字體大細」調整掣（A / A+ / A++）給長者自選。
- 深色主題對長者是否最佳？部分長者偏好淺底黑字，未來可考慮 Simple Mode 提供淺色選項。
