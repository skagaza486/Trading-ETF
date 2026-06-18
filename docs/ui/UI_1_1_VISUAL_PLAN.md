# UI 1.1 Visual Plan

本文件把 `UI 1.0` 之後的下一輪設計方向正式化。

若 universe 提升到約 `300` 檔，請一併參考 [`UI_1_1_300_STOCK_UX_ADDENDUM.md`](./UI_1_1_300_STOCK_UX_ADDENDUM.md)。

`UI 1.0` 解決的是：

- 品牌命名收斂
- 主導航收斂
- header / summary / bottom nav 基本骨架收斂
- 整體風格從「太花」收回到較克制的科技感

`UI 1.1` 要解決的是：

- 畫面與設計圖的結構落差
- mobile / desktop 缺少明確頁面模式
- icon / logo / ticker 圖案仍未形成完整資產系統
- 現有 UI 還偏向通用 dashboard，而不是投資研究終端

## 1. 核心目標

`UI 1.1` 的目標不是再做一次小修，而是把產品從「收斂版 dashboard」推進到「有清楚視覺系統的 research terminal」。

核心目標：

- 讓 `Stocks mobile` 更貼近目標設計圖的列表式交易介面
- 讓 `Home desktop` 變成真正的 command center，而不是單欄堆疊
- 建立 `Pulse` 的 logo / icon / ticker badge 資產策略
- 讓每一頁有自己的 layout 模式，而不是四頁共用同一套視覺節奏

## 2. 現況與設計圖差距

目前與設計圖最主要的差距，不在顏色，而在以下三層：

### 2.1 資訊架構密度

現況問題：

- `Stocks` 頁仍偏向卡片式 dashboard
- `Home` desktop 仍偏向直向堆疊
- summary / section 的資訊節奏不夠像終端產品

目標方向：

- mobile `Stocks` 改成列表型 market terminal
- desktop `Home` 改成三區 command center
- top snapshot / filters / sort / list rows 要變成一級資訊，不只是附屬控制

### 2.2 元件形狀一致性

現況問題：

- 某些 panel、badge、button、cards 的半徑、描邊、密度仍有舊樣式殘留
- 邊框存在感仍偏強
- icon 仍有佔位符感

目標方向：

- card / panel / badge / toolbar 統一幾何語言
- 層次更多依靠 spacing 與字級，而不是每塊都框起來
- active state 更精煉，不再像泛用 component library

### 2.3 頁面模式分化

現況問題：

- `Home`、`Stocks`、`ETF`、`Verify` 還共用太多相同版面思路

目標方向：

- `Home`: command center
- `Stocks`: signal terminal
- `ETF`: rotation board
- `Verify`: research workbench

## 3. Visual Foundation

`UI 1.1` 先建立資產與圖案系統，避免之後每次都用文字或臨時圖形補位。

### 3.1 Brand Assets

需要的品牌資產：

- `Pulse` logo mark
- `Pulse` horizontal logo
- `Pulse` app icon

logo 概念：

- 圓角方框底
- 一條向右上折線
- 一個小圓點

### 3.2 Navigation Icons

底部導航正式 icon：

- `Home`
- `Stocks`
- `ETF`
- `Verify`

目前原則：

- 不再使用字母 `H/S/E/V` 作主 icon
- icon 需簡潔、單色、細線、可在深色背景上穩定顯示

### 3.3 Utility Icons

需要的工具 icon：

- `Search`
- `Alert / Inbox`
- `Filter`
- `Sort`
- `Refresh`
- `More`

### 3.4 Signal Icons

需要的 signal 類型圖案。

這裡的 icon 是 `UI grouping`，不是直接等同每一個 engine label：

- `Long`
- `Strong Long`
- `Short`
- `Watch`
- `Review`

對應規則：

- `Strong Long`：對應 `LONG_BREAK` + `LONG_VCP`
- `Long`：對應 `LONG_BOUNCE` + `LONG_BASE`
- `Short`：對應 `SHORT_BREAK` + `SHORT_BASE` + `SHORT_WATCH`
- `Watch`：對應 `WATCH`
- `Review`：對應 `NEUTRAL` + `AVOID_CHOP` + data / validation issues

## 4. Ticker / ETF 圖案策略

不能要求每隻股票與 ETF 都立即有完整品牌資產，因此 `UI 1.1` 要採資產分級策略。

注意：

- 這裡不使用 `Tier` 一詞
- `tier` 在 codebase 內已代表股票 universe 的 `T1 growth / T2 defensive`
- 為避免與 signal tier 衝突，圖案系統統一使用 `LogoLevel`

### 4.1 LogoLevel 1: 熱門股票真 logo

先支援高頻標的，例如：

- `NVDA`
- `MSFT`
- `AAPL`
- `TSLA`
- `AMZN`
- `META`
- `AMD`
- `NIO`

### 4.2 LogoLevel 2: Ticker Monogram Fallback

若沒有官方 logo，則自動生成：

- 單色或雙色 `ticker badge`
- 固定底形
- 固定字重
- 固定 semantic accent

### 4.3 LogoLevel 3: ETF Category Icon

ETF 不要求每隻都有品牌 logo。

可改用 category icon，例如：

- `Tech`
- `Energy`
- `Health Care`
- `Gold`
- `Treasury`
- `China / HK`

## 5. 頁面級方案

### 5.1 Stocks Mobile First

這一頁是 `UI 1.1` 第一優先。

需要改動：

- 頂部 summary 改成 3 個 stats cards：
  - `Long Bias`
  - `Short Bias`
  - `Updated`
- 加入 `filter toolbar`
  - `Market`
  - `Cap`
  - `Sector`
  - `More filters`
- `Live Stock Signals` 標題列加入 `Sort`
- 主內容改成列表 rows，而不是大 card grid

每列建議結構：

- 左：logo / ticker / company / tier badge
- 中：sparkline + signal badge
- 右：price / daily return / RSI + RVOL

補充規則：

- `tier badge` 是股票 universe 分層，不是 signal icon 分層
- `Tier 2` 目前沿用 `防禦` badge
- list-first 版本中，badge 放在 ticker / company 區旁邊，維持低視覺權重
- 預設排序需保留 `Tier 1` 先於 `Tier 2` 的規則，除非使用者明確改用其他 sort mode

### 5.2 Home Desktop Command Center

這一頁是 desktop 第二優先。

建議結構：

1. 左側 `sidebar`
2. 上方 `market snapshot strip`
3. 中間主工作區
4. 右側輔助欄

主工作區內容：

- `Market State`
- `Action Radar`
- `ETF Leaders`

右側輔助欄內容：

- `Regime & Breadth`
- `Market Warnings`
- `Upcoming Events`

### 5.3 ETF Page

方向：

- 保留 cards / table 切換
- 強化 sector / category 的視覺分組
- 讓 `rank score` 更像 board 指標，而不是附帶欄位

### 5.4 Verify Page

方向：

- `ETF Check` 偏 replay analytics
- `Stock Check` 偏 ticker-level replay history
- `Signal Proof` 偏 gate / robustness / explorer

## 6. 視覺規則更新

`UI 1.1` 建議新增以下視覺規則：

- 邊框透明度再下降 15-20%
- 顏色只在重要狀態使用，不做大面積裝飾
- section title 更大，meta label 更小更淡
- badge 更扁、更短、更接近 tag 而非 button
- sparkline 更細、更亮，但面積更小
- table / list 的行高要偏終端式，不要太像 marketing dashboard

## 7. 資產命名規範

建議新增一套固定資產命名。

### 7.1 Brand

- `brand/pulse-logo-mark.svg`
- `brand/pulse-logo-horizontal.svg`
- `brand/pulse-app-icon.svg`

### 7.2 Nav

- `nav/icon-home.svg`
- `nav/icon-stocks.svg`
- `nav/icon-etf.svg`
- `nav/icon-verify.svg`

### 7.3 Utility

- `utility/icon-search.svg`
- `utility/icon-alert.svg`
- `utility/icon-filter.svg`
- `utility/icon-sort.svg`
- `utility/icon-refresh.svg`

### 7.4 Signals

- `signals/icon-long.svg`
- `signals/icon-strong-long.svg`
- `signals/icon-short.svg`
- `signals/icon-watch.svg`
- `signals/icon-review.svg`

### 7.5 Fallback

- `fallback/ticker-badge-template.svg`

## 8. 對應 Copy Key 擴充

`UI 1.1` 會新增以下 key 類別：

- `icon.*`
- `stocks.tier.*`
- `stocks.filters.*`
- `stocks.sort.*`
- `stocks.stats.*`
- `home.snapshot.*`
- `home.sidebar.*`
- `verify.subnav.*`

具體 key 應同步更新 `UI_COPY_KEYS.md`。

## 9. 執行順序

建議按以下順序落地：

1. 寫定 `UI 1.1` 文檔與資產清單
2. 生成 `Pulse` 品牌 logo 與 nav / utility / signal icons
3. 重做 `Stocks mobile`
4. 重做 `Home desktop`
5. 接入 ticker logo / fallback badge system
6. 最後補 `ETF` / `Verify` 的 visual polish

## 10. Definition Of Done

以下條件達成後，才算 `UI 1.1` 完成：

- `Stocks mobile` 已由 card grid 改成列表式 signal terminal
- `Home desktop` 已從單欄改成 sidebar + main + right-rail 佈局
- 不再使用字母 icon 佔位
- `Pulse` logo 與主 icon 已正式接入
- 熱門 ticker logo 與 fallback badge 有一致策略
- `Verify` 的子頁不再像單純堆表
- `npm run build` 與 `npm run ui:qa` 通過
