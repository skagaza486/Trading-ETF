# 設計系統 — Calm Fintech（方向 A）

> 目標客群：投資新手 + 年長用戶。定位：可信賴的「市場羅盤」，不是密集的行情終端。
> 研究依據：2026 fintech/trading app 設計趨勢（見文末來源）。
> 落地位置：tokens 全部定義在 `src/web/app/styles/web-global.css`，元件一律用 `var(--…)`。

---

## 0. 三條設計原則

1. **紅綠是神聖的**：`--color-gain` / `--color-loss` **只**用於漲跌與信號，底色與 UI chrome 一律中性。整屏不再帶綠調，漲跌色才有對比與意義。
2. **顏色必雙編碼**：漲跌除了顏色再加形狀（▲▼ / 🟢🟡🔴），照顧 ~8% 色盲用戶。
3. **Hero 優先、漸進揭露**：每頁第一眼是「一句話結論」，專業數據收進次級層 / Pro Mode。守 Robinhood 式簡潔，避免 moomoo 式密集（新手 40 分鐘 vs 5 分鐘落單）。

---

## 1. 顏色 Token

| 用途 | Token | 值 | 說明 |
|---|---|---|---|
| App 底 | `--bg-base` | `#0A0C10` | 中性深炭灰、微冷調 |
| 卡片 | `--bg-card` | `#12151B` | |
| 抬升層/輸入 | `--bg-elevated` | `#161A21` | |
| Sheet/onboarding | `--bg-surface` | `#11141A` | |
| Popover/tooltip | `--bg-overlay` | `#1B2027` | |
| 主文字 | `--text-primary` | `#F3F5F8` | 中性近白 |
| 次文字 | `--text-secondary` | `#9BA6B4` | 中性灰（去綠調） |
| 弱文字 | `--text-muted` | `#616B79` | |
| **互動主色** | `--accent` | `#4C9DF7` | 冷靜藍，**刻意非綠**（與 gain 區隔） |
| 漲 | `--color-gain` | `#2FD183` | 中性底上更突出，降神經綠 |
| 跌 | `--color-loss` | `#F2606A` | |
| 警示 | `--color-warn` | `#F5B544` | |
| 邊框 | `--border-faint/subtle/medium` | white-alpha 0.06 / 0.10 / 0.16 | 中性、去綠 |

> 信號 pill 色（green/yellow/grey/red）同步調至中性底；對比 ≥ 4.5:1（WCAG AA）。

## 2. 字體與型錄

- 介面：`IBM Plex Sans` + `Noto Sans TC`（中文）。
- 數字：`--font-num`（Space Grotesk + tabular-nums）——價格/百分比用 `.num` 確保等寬對齊。
- 型錄 token：`--fs-display 30 / --fs-h1 22 / --fs-h2 17 / --fs-body 14 / --fs-sm 12 / --fs-xs 10`。
- 視覺層級：主數字大字高對比（display/h1），次要指標小字 muted。

## 3. 間距 / 圓角 / 陰影 / 動畫 Token

- 間距：`--sp-1…6`（4/8/12/16/20/24）。
- 圓角：`--r-sm 6 / --r-md 10 / --r-lg 16 / --r-xl 22`。
- 陰影：`--shadow-card`（細）、`--shadow-pop`（popover）。
- 動畫：`--ease`、`--dur-fast/dur/dur-slow`；primitives：`pulse-dot`（live 指示）、`fade-up`（內容入場）。`.live-pulse` / `.fade-up` utility。
- **`prefers-reduced-motion` 已全域降級**（長者/前庭敏感友好）。

## 4. 卡片解剖（StockCard）

```
┌──────────────────────────────────────┐
│ [logo44] 中文名 TICKER          ⭐     │  名稱主、代號次
│          一句話業務簡介                │  text-secondary, 2 行截斷
│ $股價      EMA50 ▲1.8%      ▁▃▅▆▇     │  價=num 大字；漲跌=色+▲▼ 雙編碼
│ 🟢 形態：白話徽章            RS 92     │  徽章 emoji 雙編碼
└──────────────────────────────────────┘
```

## 5. 微互動

| 元素 | 互動 | Token |
|---|---|---|
| TopBar regime dot | 持續脈動代表 live 數據 | `pulse-dot 2.2s` |
| 卡片 | hover 邊框/底色過渡 | `--dur` |
| InfoDot 說明 | 點擊彈出 popover（手機 tap 開合） | `--shadow-pop` |
| 內容入場 | `fade-up`（可選用於列表/詳情） | `--dur-slow` |

## 6. 導航

- 底部 4 destinations（大市/板塊/發現/研究室），Simple Mode 隱藏研究室。
- 時間框選擇器貼住圖表（已實作）。

---

## 7. 已落實 vs 待滾動

**已落實**
- ✅ Token 地基整套換成 Calm Fintech（全 app 自動換膚）
- ✅ TopBar / BottomNav 去綠底（neutral）+ regime dot live 脈動 + nav active glow 改 accent 藍
- ✅ MarketView 層級：WeatherCard hero 提到信號 chips 之上
- ✅ StockCard 漲跌雙編碼（▲▼ + 色）
- ✅ 型錄/間距/動畫/陰影 token + reduced-motion 降級
- ✅ **全 app 硬編碼舊色清零**：Sparkline / BreadthCard Bar 改 `var()`；WeatherCard / SectorHeatMap / MarketView / StockCard / MarketTopPicks / Onboarding / DetailView / LabView 的 rgba 全部對齊新 token RGB；PriceChart（lightweight-charts）燭/量/十字線改新 hex；BreadthChart SVG 改新色

**待滾動**
- ⬜ 全面套用 `.num`（`--font-num` 等寬數字）到所有價格/百分比
- ⬜ 詳情頁 / Discover / Sectors 卡片套新型錄層級（`--fs-*`）
- ⬜ 列表入場 `fade-up`

> **Canvas 例外**：`PriceChart`（lightweight-charts）與 SVG presentation 屬性無法解析 `var()`，故直接用 token 對應 hex（`#2FD183`/`#F2606A`/`#4C9DF7`）。這是已知且唯一的硬編碼例外。

---

*來源：Lollypop《Trading App Design 2026》、Eleken / Fuselab / GitNexa 2026 fintech UX、moomoo vs Robinhood 新手上手對比。*
