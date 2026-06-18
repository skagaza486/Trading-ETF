# UI 1.1 / 300-Stock UX Addendum

本文件是 [`UI_1_1_VISUAL_PLAN.md`](./UI_1_1_VISUAL_PLAN.md) 的補充。

它聚焦於一個新前提：

- `Stocks` universe 已提升到約 `300` 檔

這個變化不只是數量增加，而是會直接改變：

- `Stocks` 頁面的資訊架構
- `Verify` 頁面的研究工作流
- snapshot / live-fetch 的產品心智
- 整體 UI 對「快速掃描」與「深度驗證」的分工

---

## 1. 為什麼 300 檔會改變 UI 決策

當 universe 還小時：

- card view 可以接受
- 用戶可以靠滾動直接掃頁
- `Verify` 可以把大量研究表格直接放進單頁

當 universe 接近 `300` 檔時：

- card wall 會明顯降低掃描效率
- 用戶不再可能靠肉眼逐個掃完整頁
- filter / sort / segmentation 變成主功能，而不是附屬功能
- `Verify` 若仍維持「一進頁就堆滿表格」，會變得沉重且難用

結論：

- `Stocks` 必須轉向 `terminal-like list UX`
- `Verify` 必須轉向 `overview-first research workbench`

---

## 2. Stocks Page 必須改變的地方

## 2.1 頁面定位

`Stocks` 不應再被視為：

- card dashboard
- browse-everything page

而應重新定義為：

- `daily snapshot screener`
- `scan → filter → sort → drill-down` 的工作台

這表示首屏任務不是「展示所有股票」，而是：

- 先幫用戶快速定位最值得看的 20-50 檔

## 2.2 視圖策略

`Stocks` 頁建議改成：

- 預設 `List`
- 次要 `Cards`

理由：

- 300 檔時 list 的掃描密度遠高於 cards
- cards 應只保留給：
  - `featured signals`
  - `top 12`
  - `mobile focus mode`

不建議：

- 保持 `cards` 為預設

## 2.3 首屏結構

建議首屏改成以下結構：

1. `Top Stats`
2. `Filter Toolbar`
3. `Sort Bar`
4. `Segmented Result Blocks`
5. `Signal List`

### Top Stats

建議保留三個主 stats：

- `Long Bias`
- `Short Bias`
- `Updated`

可選第四個：

- `Review Blockers`

### Filter Toolbar

至少要有：

- `Market`
- `Cap`
- `Sector`
- `Label`
- `Earnings Risk`

可延後加入：

- `Research Flag`
- `RS Rank bucket`
- `Liquidity / RVOL`

### Sort Bar

至少要有：

- `Signal Strength`
- `RS Rank`
- `Recent Change`
- `Ticker`

預設規則：

- 同等 signal strength 下，`Tier 1` 先於 `Tier 2`
- 這裡的 `Tier 1 / Tier 2` 指股票 universe 分層：
  - `Tier 1` = growth / momentum
  - `Tier 2` = defensive / value
- 不可與 logo / icon 資產分級混用；圖案系統應使用 `LogoLevel`

未來可加：

- `Earnings Date`
- `Sector`

## 2.4 結果分段

不應直接把 300 檔作為單一長列表展示。

建議拆成：

- `Top Signals`
- `Needs Review`
- `All Results`

也可以進一步拆為：

- `Long Setups`
- `Short Risks`
- `Neutral / Wait`
- `Review / Data Issues`

目標：

- 用戶一打開頁面，先看到高價值區段，而不是原始全集

## 2.5 列表行結構

每行建議固定成：

- 左：logo / ticker / company / tags
- 中：sparkline / signal badge
- 右：price / change / RSI / RVOL / RS Rank

補充：

- `Tier 2` 沿用 `防禦` badge，放在 ticker / company 區旁
- `Tier 1` 不必強制顯示 badge，可透過排序與結果分段自然優先顯示
- 若未來要顯示 `Tier 1`，建議文案用 `Growth`，避免與圖案系統 `LogoLevel 1` 混淆

交互建議：

- 點一行展開 detail drawer
- 不在列表內塞過多說明文字
- reason / technical explanation 放到 drawer / modal

---

## 3. Verify Page 必須改變的地方

## 3.1 頁面定位

`Verify` 不應再被理解為：

- 一個把所有研究表格全部貼上的頁面

而應重新定義為：

- `research workbench`
- `overview → diagnose → inspect records`

## 3.2 子頁模式

保留三個子頁：

- `ETF Check`
- `Stock Check`
- `Signal Proof`

但三者的資訊層級要更清楚：

### ETF Check

偏向：

- replay analytics
- favour / avoid 相對表現
- board-level validation

### Stock Check

偏向：

- ticker-level replay history
- 單一標的的歷史 signal timeline

### Signal Proof

偏向：

- gate summary
- robustness
- regime split
- records explorer

## 3.3 Signal Proof 首屏

建議首屏順序改為：

1. `Pass / Fail Overview`
2. `Top Problems`
3. `Gate Summary`
4. `Robustness`
5. `Records Explorer`

也就是：

- 先給結論
- 再給診斷
- 最後才給原始表

## 3.4 Records Explorer

300 檔 universe 下，不應預設展示大量 records。

建議：

- 必須先選 label / flag / ticker / regime 其中至少一個條件
- 再顯示 records

這樣可避免：

- 首屏過重
- 表格雜訊太多
- 使用者迷失在大量資料中

---

## 4. 邏輯與資料策略要同步改

命名注意：

- 本文件中的 `Tier 1 / Tier 2` 一律指股票 universe 分層
- 若提到 logo / ticker badge / ETF category icon，應使用 `LogoLevel 1 / 2 / 3`

## 4.1 Stocks = Snapshot-first

在 300 檔規模下，`Stocks` 的產品心智應明確切成：

- `snapshot-first`
- `fast-loading`
- `browseable`

不應再以「前端逐檔 live fetch + 即時計算」作為主要體驗承諾。

建議對外文案也改成：

- daily snapshot
- latest computed signals
- updated at snapshot time

而不是強調「live Yahoo for 300 names」

## 4.2 Verify = Research-first

`Verify` 的資料策略應與 `Stocks` 分離：

- `Stocks` 追求快
- `Verify` 接受較重，但必須更有結構

因此：

- `Verify` 更適合使用預計算 artifacts / worker outputs / persisted research data
- 不應讓它的負擔污染 `Stocks` 首屏體驗

## 4.3 Historical Signal Computation

在 300 檔 universe 下，`buildHistoricalSignals` / replay / gate 計算的成本會更明顯。

因此方向上建議：

- 頁面內避免不必要全量重算
- 優先使用：
  - snapshot
  - offline research artifacts
  - worker / cron precompute

---

## 5. 視覺層補充規則

300 檔時，視覺上要更偏終端而不是展示頁。

建議新增以下規則：

- card 使用量下降
- list row 使用量上升
- 每個 section 更像工作區而不是 showcase
- 數字、排序、filters 的視覺權重提高
- 長說明文字的權重下降

換句話說：

- `information density` 要升
- `decorative density` 要降

---

## 6. UI 1.1 執行優先級更新

在 300-stock 前提下，建議把 `UI 1.1` 順序改成：

1. `Stocks` 頁重構為 list-first screener
2. `Stocks` filters / sort / sectioning
3. `Verify` 改為 overview-first workbench
4. `Home desktop` command center
5. logo / icon / ticker badge 全面接入
6. `ETF` page polish

原因：

- 300 檔最先衝擊的是 `Stocks` 體驗
- 第二個被衝擊的是 `Verify` 的研究可用性
- `Home` 和 icon system 仍重要，但次序略後

---

## 7. Definition Of Done

當以下條件達成，才算 `UI 1.1 + 300-stock UX` 完成：

- `Stocks` 頁預設為 list-first
- `Stocks` 已有 filter / sort / section blocks
- 用戶能在 300 檔中快速定位前 20-50 個高價值結果
- `Verify` 首屏以 overview / diagnosis 為主，而不是長表
- `Record Explorer` 不再預設灌出大量 records
- snapshot-first / research-first 角色分工清楚
- `npm run build` 與 `npm run ui:qa` 通過
