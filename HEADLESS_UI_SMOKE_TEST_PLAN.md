# Headless UI Smoke Test Plan

本文件定義這個 repo 的第一套 headless UI smoke test 方案。

目標不是一次做到完整 E2E，而是先用最少複雜度，穩定抓出以下問題：

- 頁面載入失敗
- tab / sub-tab 切換失效
- loading / error / empty state 沒顯示
- table 橫向爆版
- card overlap / layout 跑位
- mobile breakpoint 斷版
- onboarding / help dialog 遮擋主內容
- Quant Lab 研究表格在資料刷新後結構失效

---

## 1. 測試定位

這一套屬於 `headless UI smoke test`，主要用途是：

- 驗證 UI 基本可用
- 驗證主要互動不報錯
- 驗證 layout 沒有明顯破版
- 驗證 responsive 在關鍵 viewport 下仍可讀

這一套 **不是**：

- 視覺設計最終審美判定
- 完整交易研究正確性測試
- 全量 regression suite

研究數據正確性繼續由現有 engine / sync script 負責，例如 `research:sync-exp009`。

---

## 2. 建議技術棧

第一版建議使用 `Playwright`。

原因：

- 支援 headless browser
- 可量 DOM box，適合檢查 overlap / overflow
- 支援 screenshot，方便後續升級到 visible / visual regression QA
- 對 tab 切換、dialog、table scroll、mobile viewport 都足夠成熟

第一版不需要：

- Storybook
- Cypress component test
- AI 視覺評分

這些可以留到第二階段。

---

## 3. 測試範圍

### 3.1 主頁面

需要覆蓋四個主 tab：

- `Dashboard`
- `Stocks`
- `ETFs`
- `Quant Lab`

### 3.2 Quant Lab 子頁

需要覆蓋三個 sub-tab：

- `ETF Replay`
- `Stock Replay`
- `Stock Research`

### 3.3 全域互動

需要覆蓋：

- workspace tab 切換
- Quant Lab sub-tab 切換
- `Refresh Research`
- `Refresh Screener`
- `Load Stock Signals`
- help dialog 開關
- onboarding overlay 存在時對主內容的影響

---

## 4. Viewport Matrix

第一版固定三組：

- `desktop-wide`: `1440 x 900`
- `tablet`: `1024 x 768`
- `mobile`: `390 x 844`

如果時間夠，可再加：

- `small-mobile`: `360 x 740`

目的：

- desktop 抓 card grid / table / hero layout 問題
- tablet 抓過渡 breakpoint 問題
- mobile 抓 segmented control、table-wrap、card metrics 擠壓問題

---

## 5. 需要自動檢查的 Area

以下是這個 repo 目前最值得自動檢查的區域。

### A1. Workspace Tabs

風險：

- tab 切換後內容不更新
- active tab 樣式正確但內容沒換
- mobile 下 tab 擠壓換行

檢查：

- 四個主 tab 都能點擊
- 每個 tab 進入後都有該頁代表性 heading / panel
- tab 容器沒有 overflow viewport

### A2. Dashboard Hero + Radar

風險：

- Hero metric 擠壓
- Action Radar 卡片高度失衡
- warning message 把 grid 推壞

檢查：

- Hero panel 可見
- 至少一個 dashboard grid 存在
- radar cards 沒有互相 overlap
- 在 mobile 下沒有水平溢出

### A3. Stocks Card Grid

風險：

- `stock-card-grid` 在窄螢幕重疊
- sparkline 壓到文字
- featured card 高度異常
- earnings badge 導致 footer 跑位

檢查：

- `stock-card` 至少出現一批
- 任兩張 card bounding box 不重疊
- card 內容沒有 `scrollWidth > clientWidth`
- page 沒有整體水平卷軸

### A4. ETFs Card Grid + Table

風險：

- card metrics 在 mobile 被擠爆
- category 展開收合後 layout 跳壞
- table wrap 失效

檢查：

- ETF card grid 存在
- table 模式下 `.table-wrap` 存在
- `.table-wrap table` 不可超出包裹容器太多而完全不可讀
- mobile 下 category 區塊可展開

### A5. Quant Lab Sub-tabs

風險：

- sub-tab overlap 再發
- active sub-tab 與內容不同步
- refresh 後 panel header 或表格消失

檢查：

- 三個 sub-tab 都能切換
- 每個 sub-tab 都有對應 section heading
- sub-tab nav 本身不 overlap
- mobile 下 sub-tab 容器無水平爆版

### A6. Gate Summary / Research Tables

風險：

- 欄位太多導致 table 完全不可用
- Refresh 後欄位消失
- Copy MD 按鈕位置跑掉

檢查：

- `Gate Summary` heading 存在
- 表格至少有 header row + data row
- `Refresh Research` 與 `Copy MD` 按鈕可見
- `.table-wrap` 真的包住 table
- 在 mobile 下 table 可以橫向 scroll，但 page 本身不可整頁爆寬

### A7. Dialog / Overlay

風險：

- onboarding overlay 阻止主要 smoke flow
- help dialog 打開後無法關閉
- dialog 超出 viewport

檢查：

- 若 onboarding 存在，能被關閉或略過
- help dialog 可開可關
- dialog box 在 viewport 內

### A8. Loading / Empty / Error States

風險：

- fetch 慢時 UI 空白
- API 失敗時沒有錯誤提示
- empty data 導致 crash

檢查：

- 初次進入 Stocks / Quant Lab 時有 loading 文案或狀態轉換
- mock 失敗情境下 warning / error panel 存在
- empty rows 時仍顯示 fallback 文案，不是整頁空白

---

## 6. 自動化檢查規則

第一版建議做四類 rule。

### R1. Page Readiness

- 頁面載入後主 heading 存在
- console 無 `error`
- page 無未捕捉 exception

### R2. Layout Safety

- 重要 panel 的 bounding box 不應為 0
- card 與 card 不應 overlap
- dialog 不應超出 viewport
- 主要 toolbar / header-actions 不應掉出容器

### R3. Overflow Safety

- `document.documentElement.scrollWidth <= viewport width + tolerance`
- 重要 card / button / label 不應文字被截到完全不可讀
- `.table-wrap` 允許局部水平 scroll，但不允許整頁橫向爆版

### R4. Interaction Smoke

- tabs 可切換
- sub-tabs 可切換
- refresh buttons 可點
- help dialog 可開關
- copy button 可被定位到

---

## 7. 建議測試檔拆分

第一版建議拆成以下幾個 spec：

- `tests/ui/dashboard.smoke.spec.ts`
- `tests/ui/stocks.smoke.spec.ts`
- `tests/ui/etfs.smoke.spec.ts`
- `tests/ui/quant-lab.smoke.spec.ts`
- `tests/ui/global-layout.smoke.spec.ts`

### `dashboard.smoke.spec.ts`

覆蓋：

- Dashboard 載入
- Hero / summary cards / radar cards 可見
- mobile 下沒有 page-level overflow

### `stocks.smoke.spec.ts`

覆蓋：

- Stocks tab 載入
- stock card grid 出現
- card 不 overlap
- refresh button 可點

### `etfs.smoke.spec.ts`

覆蓋：

- ETFs tab 載入
- category / card grid / table-wrap 正常
- mobile breakpoint 不爆版

### `quant-lab.smoke.spec.ts`

覆蓋：

- Quant Lab 載入
- 三個 sub-tab 可切換
- Gate Summary 存在
- `Refresh Research` / `Copy MD` 可見

### `global-layout.smoke.spec.ts`

覆蓋：

- help dialog
- onboarding overlay
- console errors
- root page horizontal overflow

---

## 8. 測試資料策略

第一版不建議直接依賴即時 Yahoo / Finnhub 成功率來做 UI smoke。

建議策略：

- `smoke mode` 下 stub `/api/yahoo` 與 `/api/finnhub`
- 回傳固定 fixture
- 讓 UI 渲染結果可重現

原因：

- 真實資料延遲會令 smoke test 不穩
- rate limit 不應成為 UI QA blocker
- smoke 的目標是驗證畫面和互動，不是資料來源穩定性

第二層才保留少量 live smoke：

- 每日或手動跑一次 live mode
- 只確認真實 API 未完全壞掉

---

## 9. Phase 1 Implementation Order

### Phase 1A. Test Harness

- 加入 Playwright
- 建立 `playwright.config`
- 加入 desktop / tablet / mobile projects
- 建立 mock route fixture

### Phase 1B. Critical Smoke

- Dashboard
- Stocks
- Quant Lab / Stock Research

這三個先做，因為最容易出現 layout 與資料載入交互問題。

### Phase 1C. Layout Rules

- overlap 檢查 helper
- horizontal overflow 檢查 helper
- dialog in viewport helper
- table-wrap helper

### Phase 1D. ETF + Global Coverage

- ETFs page
- help dialog
- onboarding overlay

---

## 10. 建議 helper

可以抽出以下通用 helper：

- `closeOnboardingIfPresent(page)`
- `openTab(page, name)`
- `openQuantLabSubTab(page, name)`
- `assertNoHorizontalOverflow(page)`
- `assertElementsDoNotOverlap(page, selector)`
- `assertElementInViewport(page, selector)`
- `assertTableWrapUsable(page, selector = '.table-wrap')`
- `collectConsoleErrors(page)`

---

## 11. 成功標準

第一版 smoke suite 達成以下條件即可算成功：

- 本地可一鍵執行
- 四個主 tab 全覆蓋
- Quant Lab 三個 sub-tab 全覆蓋
- desktop / mobile 至少兩組 viewport
- 能穩定抓出 page-level overflow / overlap / load failure / tab failure
- 不依賴即時 API 才能通過

---

## 12. 第二階段可擴充

之後可以往下加：

- screenshot baseline
- 視覺 diff
- 字體 / 間距 token consistency 檢查
- AI screenshot review
- CI 自動上傳 failure screenshots
- 針對 `Copy MD`、`Refresh Research`、`research:sync-exp009` 串成跨層 QA

---

## 13. 目前建議結論

這個 repo 最適合的第一步不是全量 E2E，而是：

1. 先建立 `mocked headless smoke harness`
2. 先保護 `Dashboard`、`Stocks`、`Quant Lab`
3. 優先自動抓：
   - overflow
   - overlap
   - tab failure
   - dialog failure
   - loading / empty / error state 缺失

這樣投入最小，但對目前 repo 的 UI 穩定性回報最大。
