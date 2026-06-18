# Futu-Style Navigation Reference

本文件整理根據你提供的 Futu app 截圖，對目前 `Trading ETF` UI 可借鑑的「非視覺風格」參考，重點是：

- header / tab 的資訊架構
- mobile-first 導航習慣
- naming 縮短
- `Quant Lab` 的重新命名

這不是要抄 Futu 視覺，而是借用它在投資 app 上比較成熟的結構語言。

## 1. 結論先講

根據現有 app 與你提供的參考，我建議下一版 UI 結構改成：

1. 把目前頁面頂部的「頁面定位 + 中英雙語簡介」縮成非 sticky 的矮 header bar。
2. 主導航改成 sticky bottom tab bar。
3. `Quant Lab` 改名成更直白的 `驗證 / Verify`。
4. 保留每頁自己的內容區塊，但整個 app 的第一感要更像「mobile investing workspace」，不是 desktop dashboard 硬縮進手機。

## 2. 建議新名字與 Logo

## 2.1 主方案

我建議 app 名字改成：

- English: `Pulse`

理由：

- 短
- 容易記
- 中英都自然
- 適合 signal / regime / market pulse 的產品定位
- 不會把產品鎖死在 ETF，也不會像 `Quant Lab` 那樣只對研究者友善

## 2.2 Logo 概念

建議 logo 做成一個非常簡單的識別，不做複雜圖形。

### Logo Mark

一個圓角方塊內，包含兩個元素：

- 一條向右上折線，代表 signal / trend
- 一個小圓點，代表 radar ping / confirmation

語意：

- 不是券商 logo
- 是「市場脈搏 + 信號確認」

### Logo 方向

- 單色版本可成立
- 小尺寸下仍能辨識
- 可以同時用於 header、bottom tab active 狀態、splash icon

### 中文 / 英文顯示方式

header 顯示建議：

- `Pulse`

我更傾向：

- mobile header 用 `Pulse`
- help / onboarding / docs 也直接用 `Pulse`

因為手機 header 最重要是短。

## 2.3 備選名字

如果你想再偏投資語境一點，可保留兩個備選：

- `Radar / 盤`
- `Signal / 訊`

但主方案我仍然選：

- `Pulse`

因為它最不像工具頁，也最容易長成產品名。

## 3. Header 改法

## 3.1 現況問題

現在 header 實際上是大型 hero：

- 頁面定位
- 英文標題
- 英文描述
- 中文副標
- status chips
- hero metrics

這在 desktop 可以成立，但在 mobile 會有幾個問題：

- 首屏被 header 吃太多高度
- 切 tab 時感覺像在切 dashboard page，不像 app section
- 使用者每次進頁都要先看一段解釋，不夠直接

## 3.2 建議新結構

把 header 改成非 sticky 矮 bar：

- 左：logo
- 中：page name
- 右：1 到 2 個工具位，例如 search / help / refresh

高度建議：

- 約 56px 到 64px

內容只保留：

- 品牌識別
- 當前頁名稱
- 快捷工具

不再保留：

- `eyebrow`
- 大段英文 description
- 中文 subtitle

這些內容改為：

- 放到第一次 onboarding
- 或放進每頁第一個 section 的一行微說明

## 3.3 Header 文案範例

### Dashboard

- `Pulse`
- 頁名：`總覽 / Home`

### Stocks

- `Pulse`
- 頁名：`信號 / Signals`

### ETFs

- `Pulse`
- 頁名：`板塊 / Sectors`

### Quant Lab renamed

- `Pulse`
- 頁名：`驗證 / Verify`

## 4. Bottom Tab 改法

## 4.1 為什麼要改到底部

Futu 這類 app 的一個核心優勢，不是顏色，而是：

- 主操作永遠在拇指區
- section 切換是 app-level，不是 page-level
- 用戶會養成固定肌肉記憶

對你這個 app 也很適合，因為它現在的四個主 tab 已經夠穩定了。

## 4.2 建議新的四個主 tab

我建議改成：

1. `Home / 總覽`
2. `Stocks / 股票`
3. `ETF / ETF`
4. `Verify / 驗證`

對應現在：

- `Dashboard` -> `Home / 總覽`
- `Stocks` -> `Stocks / 股票`
- `ETFs` -> `ETF / ETF`
- `Quant Lab` -> `Verify / 驗證`

這組名字的好處：

- 比 `Dashboard / Stocks / ETFs / Quant Lab` 更像 app 導航
- 中文更短
- 英文也更短
- `Verify` 比 `Quant Lab` 易懂很多

## 4.3 Bottom Tab Icon 建議

不需要太複雜，保持極簡即可。

| Tab | Icon Concept | 中文 |
| --- | --- | --- |
| `Home` | 4 格概覽 / 一個小儀表板 | 總覽 |
| `Stocks` | 折線 + ping 點 | 股票 |
| `ETF` | 3 個堆疊小方塊 | ETF |
| `Verify` | check + grid / magnifier | 驗證 |

設計原則：

- inactive 全部單色
- active 才上 accent
- icon stroke 要夠粗
- label 最多 2 syllables / 2-3 個中文字

## 4.4 Tab 命名不建議

我不建議保留：

- `Dashboard`
- `Quant Lab`

原因：

- 太 desktop
- 太像內部工作名稱
- 對第一次進來的人不夠直觀

## 5. `Quant Lab` 新名字建議

## 5.1 主方案

我建議直接改成：

- English: `Verify`
- 中文：`驗證`

理由：

- 一眼知道是做 signal validation
- 比 `Research` 少一點學術味
- 比 `Lab` 少一點實驗室感
- 能包 ETF Replay、Stock Replay、Stock Research

## 5.2 子頁命名同步建議

把現在 `Quant Lab` 裡的子 tab 也一起改短：

| 現在 | 建議 English | 建議中文 |
| --- | --- | --- |
| `ETF Replay` | `ETF Check` | ETF 回看 |
| `Stock Replay` | `Stock Check` | 個股回看 |
| `Stock Research` | `Signal Proof` | 信號驗證 |

如果你想更簡單，甚至可以改成：

- `ETF`
- `Stocks`
- `Rules`

但我認為第一組比較平衡。

## 6. 可以借鑑 Futu 的地方

以下是可以借鑑的「結構」，不是視覺皮膚。

## 6.1 App-Level 導航固定在底部

值得借鑑原因：

- section 切換成本低
- 對手機最自然
- 比置頂 segmented control 更像真正 app

## 6.2 每頁只保留一個短 header

值得借鑑原因：

- 首屏直接看到內容
- 頁面身分清楚
- 減少重複介紹

## 6.3 一級頁做粗分類，二級頁才做內容分流

Futu 的慣性是：

- 底部 tab 先切大區
- 頁內再用次級 tab 或 filter 切更細分類

對你這個 app 來說很適合：

- bottom tab 切 `Home / Signals / Sectors / Verify`
- 頁內再切：
  - `Signals`: Long / Short / Watch
  - `Sectors`: Favour / Watch / Avoid
  - `Verify`: ETF / Stocks / Proof

## 6.4 搜尋 / 篩選要靠近內容，不要放在全域 hero

這點很重要。

Futu 的搜尋通常屬於頁內工作，而不是整個 app 的 abstract intro。

對你這個 app 建議：

- 全域 header 只放 brand + page + 工具 icon
- 篩選器放在內容區第一屏
- search 只出現在真正需要 search 的頁面

## 6.5 長頁內容要模組化，但不是每個模組都像大 card

Futu 的結構通常是：

- 一些重點 card
- 接大量 list rows
- 節奏很清楚

你目前畫面很多內容都還包在大型 panel 裡，desktop 很合理，但 mobile 會偏重。

可借鑑方向：

- `Home`：保留 1 個 summary block + 2 個 list modules
- `Signals`：多用 row list，少用厚重 hero
- `Verify`：保留表格，但可先給 summary / filter / shortlist

## 7. 不建議照抄的地方

以下不建議直接跟：

- Futu 的橙色品牌語言
- 大量營銷入口
- 發現 / 社區 / 廣告型內容
- 頁內太多橫向二級 tab

原因：

- 你這個 app 核心是 signal clarity，不是流量分發
- 功能密度已經高，再塞內容入口會亂

## 8. 建議的新資訊架構

## 8.1 一級導航

| New | 中文 | 舊名稱 |
| --- | --- | --- |
| `Home` | 總覽 | `Dashboard` |
| `Signals` | 信號 | `Stocks` |
| `Sectors` | 板塊 | `ETFs` |
| `Verify` | 驗證 | `Quant Lab` |

## 8.2 頁內二級結構

### Home

- Market State
- Top Signals
- Sector Leaders

### Signals

- Summary
- Live Signals
- Filters

### Sectors

- Summary
- Category Groups
- ETF Rows / Cards

### Verify

- ETF Check
- Stock Check
- Signal Proof

## 9. 對現有文檔的影響

如果採用這個方向，後續要同步更新：

- [`UI_DESIGN.md`](./UI_DESIGN.md)
- [`UI_COPY_KEYS.md`](./UI_COPY_KEYS.md)
- `src/App.tsx`
- help / onboarding 文案

特別是：

- 所有 `Quant Lab` 字樣
- `Dashboard / Stocks / ETFs` 這些舊導覽名
- hero 文案結構

## 10. 我建議的下一步

如果你認同這個方向，最合理的順序是：

1. 先確定品牌名是否用 `Pulse`
2. 確定 bottom tab 四個名字
3. 確定 `Verify` 底下三個子頁名字
4. 再更新文檔與 copy key
5. 最後才改 React 結構和 CSS

## 11. 一句話總結

這次應該學 Futu 的，不是它的黑橙配色，而是它把「品牌、主導航、頁內內容、次級分類」分得很清楚。對這個 repo 來說，最值得借鑑的是矮 header + sticky bottom tabs + 更像產品名的命名 + 更直白的研究區名稱。
