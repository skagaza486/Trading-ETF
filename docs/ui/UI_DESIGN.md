# UI Design Document

本文件描述目前 `Trading ETF` 應用的 UI 結構、視覺語言、各區塊責任與後續可改進方向，方便日後做重構、增量優化或重新整理資訊架構時，有一份對齊現況的設計參考。

## 1. 文檔定位

這份文檔現已作為 `UI 1.0 design` 的正式描述。

這份文檔的目的是：

- 記錄現有 UI 真正長什麼樣、承擔什麼功能
- 把每個區塊的產品角色說清楚
- 指出哪些地方未來應優先改善
- 幫後續把單一 `App.tsx` 拆成更清晰的 UI modules

補充：

- 本文已揉合 [`FUTU_NAV_REFERENCE.md`](./FUTU_NAV_REFERENCE.md) 的 mobile-first 導航建議
- `UI 1.0` 已鎖定為「收斂版」
- 設計優先級改為：清晰度 > 氣氛 > 展示感

## 1.1 UI 1.0 Locked Decisions

以下決策視為 `UI 1.0` 正式方向：

- 品牌名使用 `Pulse`
- 頂部採用矮 header，不再使用大型 hero 作為全域預設
- 主導航使用 sticky bottom nav
- 主導航名稱固定為：
  - `Home / 總覽`
  - `Stocks / 股票`
  - `ETF`
  - `Verify / 驗證`
- 介面風格採用「收斂版」：保留高端科技感，但降低光效、色彩事件與厚重裝飾
- 首屏採 summary-first，而不是 hero-first

## 2. Source Of Truth

目前 UI 的主要來源：

- `src/App.tsx`
- `src/styles/dashboard.css`
- `src/styles/global.css`
- `src/ui/labelDisplay.ts`

如果未來文檔與實作不一致，以以上檔案為準，再回寫本文件。

## 3. 產品層 UI 原則

目前畫面的設計語氣，已經很明確不是一般 dashboard，而是偏向：

- real-data-first command centre
- 研究導向，而非交易執行終端
- 可以快速掃描，但不應過度承諾 signal 品質
- 中英混排，兼顧說明性與交易語境

與 `ROADMAP.md` 一致的 UI 約束：

- explainable rule-based signals
- real-data-first
- 研究驗證先於 UI 承諾

這代表 UI 要做的是「幫助理解與判斷」，不是用很強的視覺語氣假裝 signal 已經 fully productionized。

另外，根據 mobile 使用情境與 Futu 類投資 app 的結構啟發，下一版應補上一條操作層原則：

- app-level navigation 優先於 page-level hero

意思是：

- 主頁切換應像 app section，而不是像 desktop dashboard 分頁
- 手機首屏應優先看到可操作內容，而不是大段頁首說明

## 4. 整體視覺語言

### 4.1 Look and Feel

目前整體風格是深色 fintech command centre：

- 深黑綠底色
- 綠 / 青作為正向與科技感主色
- 黃作為警示或觀望
- 紅作為弱勢 / 風險
- 紫作為 review / research 狀態

背景不是純色，而是由：

- radial gradient
- 微弱網格
- panel blur

共同組成，目的是讓畫面有「市場工作台」而不是單層卡片頁的感覺。

### 4.2 Typography

目前字體分工：

- 標題：`Space Grotesk`
- 內文與資料：`IBM Plex Sans` + `Noto Sans TC`

這個組合有效地把：

- headline 的現代感
- 中文閱讀穩定性
- 數字資訊密度

結合在一起，建議保留。

### 4.3 Semantic Colors

目前顏色語義很穩定：

- 綠：`FAVOUR`、長倉偏多、正向結果
- 黃：`WATCH`、警示、觀望
- 紅：`AVOID`、short、負向結果
- 紫：`REVIEW`、研究旗標、資料不足
- 青：資訊型 highlight、accent、次主色

未來新增模組時，應盡量沿用這套語義，不要重新發明 badge 色彩。

## 5. 全域 UI 骨架

### 5.1 App Shell

最外層是單欄工作區：

- `.app-shell` 提供全頁背景與氛圍
- `.workspace` 限制內容最大寬度
- 所有主要資訊區塊都以 `.panel` 為基礎容器

這種結構的好處是：

- 每個模組都像獨立儀表板單元
- 後續增減 sections 不會破壞整體佈局

### 5.2 Header Strategy

#### 現況

目前每個主要 tab 頁面頂部都先給一個 hero-like 區塊，用來承載：

- 頁面定位
- 中英雙語簡介
- status chips
- 3 個重點 hero metrics
- research disclaimer

這是現況 UI 中最重要的「上下文建立層」。

#### UI 1.0

UI 1.0 不再把這些資訊集中成大 hero，而是拆成：

- 一個非 sticky 矮 header bar
- 一個頁內 summary block

header bar 建議只保留：

- logo
- 當前頁名稱
- 1 到 2 個工具位，例如 help / refresh / search

高度建議：

- 約 56px 到 64px

不再放在 header 的內容：

- `eyebrow`
- 大段英文 description
- 中文 subtitle

這些內容改為：

- 放進 onboarding
- 放進 help
- 或縮成每頁第一個 section 的一行微說明

若做 component 化，建議把現況 `PageHero` 重構成兩層：

- `AppHeader`
- `PageSummaryStrip`

### 5.3 Brand And Naming

#### UI 1.0 品牌名

UI 1.0 app 名稱固定為：

- English: `Pulse`

建議 display 方式：

- mobile header：`Pulse`
- 文檔 / onboarding：`Pulse`

#### Logo 建議

logo 概念建議極簡，不做券商式圖騰：

- 圓角方塊底
- 一條向右上折線
- 一個小圓點

語意：

- market pulse
- signal confirmation

### 5.4 Navigation

#### UI 1.0

主導航改成 sticky bottom tab bar，讓 section 切換更像 mobile investing app。

UI 1.0 名稱固定為：

1. `Home / 總覽`
2. `Stocks / 股票`
3. `ETF / ETF`
4. `Verify / 驗證`

對應舊名稱：

- `Dashboard` -> `Home / 總覽`
- `Stocks` -> `Stocks / 股票`
- `ETFs` -> `ETF / ETF`
- `Quant Lab` -> `Verify / 驗證`

這組命名比現有名稱更：

- 短
- 手機導向
- 對第一次使用者更易懂
- 更像產品導航，而不是工程內部分類

建議 bottom tab icon 概念：

- `Home`：小型總覽格
- `Signals`：折線 + ping 點
- `Sectors`：堆疊方塊
- `Verify`：check / magnifier / grid

### 5.5 共通元件模式

目前反覆出現的 UI pattern：

- panel
- summary cards
- status chips
- label pills
- cards / table 雙視圖
- warning banner
- segmented controls
- table-wrap horizontal scroll

這些其實已經接近一套小型 design system，後續可以正式命名並抽元件。

建議下一版新增兩種 mobile-first pattern：

- sticky bottom tab bar
- compact page header

## 6. 各區塊設計說明

## 6.1 Home / Dashboard

`Dashboard` 在 UI 1.0 中改名為 `Home / 總覽`。

這一頁的任務仍然是「3 秒看懂今日市場基調」。

### A. 頁面總覽區

用途：

- 告訴使用者目前正在看總覽頁
- 顯示 regime、資料載入數、失敗數、更新時間
- 用 3 個 metrics 快速傳達市場重點

現況 metrics：

- `Favour ETFs`
- `Active Long`
- `Avoid ETFs`

設計角色：

- 這不是詳細分析區
- 這是 decision preface

改進方向：

- 下一版不建議再用大 hero 呈現，而是改成 compact summary strip
- 可加更直覺的「今日應偏進攻 / 防守 / 等待」一句話
- metric 標題可更 PM 化，例如 `Risk-On Setup`, `Actionable Longs`

### B. Regime Hero

用途：

- 用最大語氣告訴使用者市場環境
- 把 `long_friendly / neutral / short_friendly` 轉成可讀敘述
- 在 `proxyWeakBreadth` 觸發時提供額外警示

目前內容：

- regime badge
- 英文 regime label
- breadth warning
- 一段中文敘述

設計角色：

- 全產品的「大局判斷區」
- Dashboard 的第一優先閱讀點

改進方向：

- 可加入更明確的行動語句，例如倉位建議或風險等級
- 若未來 regime 訊號增多，可把判斷因素拆成 tooltip 或明細抽屜

### C. Action Radar

用途：

- 從股票信號中，抽出最值得看的強弱案例
- 分為 `攻擊` 與 `防禦`

目前內容：

- 左欄：升勢確認 top picks
- 右欄：弱勢迴避 top picks
- 每張 radar card 包含 ticker、name、label、research flags

設計角色：

- 把 Stocks tab 的資訊先濃縮一版給 Dashboard
- 讓使用者不用切 tab 也能抓到今日焦點

改進方向：

- 可加入排序依據說明，例如按 RS、RVOL、signal confidence
- 可加入直接 deep-link 到 Stocks 對應卡片或篩選狀態

### D. Sector Snapshot

用途：

- 從 ETF Weekly 中抽出強勢與弱勢板塊
- 作為 Dashboard 的中觀補充

目前內容：

- `FAVOUR top 3`
- `AVOID bottom 3`
- 顯示 13W return，部分項目顯示 rank score

設計角色：

- 幫股票信號提供板塊背景
- 讓 Dashboard 形成 macro -> action -> sector 的閱讀順序

改進方向：

- 可加入 category 標記，避免不同 ETF 主題混在一起
- 若未來空間足夠，可顯示更多 context，例如 `40W MA` 或 breadth note

## 6.2 Signals / Stocks

`Stocks` 在 UI 1.0 中保留英文 `Stocks`，中文標示為 `股票`。

這一頁是日常使用時最偏「行動掃描」的頁面。

### A. Screener Summary

用途：

- 說明資料來源與信號範圍
- 顯示目前 universe、long/short bias、earnings guard、更新時間

設計角色：

- 讓使用者知道現在看到的是 live screener，不是歷史回測

改進方向：

- 下一版建議不再用厚 hero，而是用較薄的 summary block 接在矮 header 後
- 可把 `earnings configured` 變成更具體的風險文案
- 若未來加入資料品質分數，可放在這裡

### B. Summary Cards

用途：

- 用四張卡快速總結 signal 結構

目前分類：

- `Long Labels`
- `Short Labels`
- `Neutral`
- `Review`

設計角色：

- 讓使用者在看細節前，先理解今天市場分佈

改進方向：

- 可加入佔比而非只有數量
- 可加入與前一日比較，讓變化更有意義

### C. Live Signals

這是 Stocks tab 的核心模組。

用途：

- 顯示即時股票信號
- 支援 `卡片 / 列表` 兩種視圖
- 提供 refresh 操作

#### Card View

目前卡片內容：

- featured tag
- label pill
- ticker / name / sector
- sparkline
- RSI / RVOL / RS vs SPY
- earnings date
- plain reason
- action badge
- english code
- research flags

設計角色：

- 快速掃描、偏主觀判斷
- 適合每日使用

改進方向：

- 前四張 `Featured Focus` 目前只按排序前列，不一定等於最高 conviction，未來可重新定義
- card 上可加入「為什麼上榜」更短的 secondary line
- 可以提供排序與篩選控制，例如只看 long、只看有 flag、只看 earnings-free

#### Table View

目前表格內容：

- ticker / name / sector
- signal label
- RSI / RVOL / RS
- flags
- plain + technical reason

設計角色：

- 適合比較與審核
- 比 card view 更適合研究與核對

改進方向：

- 可加入排序能力
- technical reason 可考慮折疊或 tooltip，避免橫向閱讀壓力

## 6.3 ETF / ETFs

`ETFs` 在 UI 1.0 中簡化為 `ETF`。

這一頁是中觀市場確認層，幫助判斷板塊輪動與環境共振。

### A. Summary Cards

用途：

- 以 `Favour / Watch / Avoid / Review` 四張卡總結 ETF universe

設計角色：

- 快速感受整體板塊健康度

改進方向：

- 可把 `WAIT` 也納入更明確顯示，避免只在詳細列表中出現

### B. ETF Weekly Main Section

用途：

- 顯示最新 ETF weekly classification
- 支援 `卡片 / 列表` 兩種視圖
- 提供 live refresh

#### Card View

目前採 accordion + category 分組：

- 每個 category 可展開 / 收起
- header 顯示分類名、數量、是否有 `FAVOUR` / `WATCH`
- 內部每張 ETF card 顯示 label、ticker、name、13W、40W、RS、sparkline、reason

設計角色：

- 比 table 更符合 sector scanning 工作流
- category grouping 對 ETF 特別重要，應保留

改進方向：

- category header 可加更具體的 group summary，例如最強 / 最弱一檔
- 可加入 `expand all / collapse all`
- category 順序未來可由市場重要性或當前強弱驅動

#### Table View

用途：

- 提供完整、可逐列核對的 ETF 清單

目前欄位：

- ticker
- name
- label
- 13W return
- price / 40W MA
- reason

改進方向：

- 可補 `rankScore`
- 若欄位變多，應加 sticky first column 或 column grouping

## 6.4 Verify / Quant Lab

`Quant Lab` 在 UI 1.0 中改名為 `Verify / 驗證`。

改名原因：

- `Verify` 比 `Quant Lab` 更直白
- 更能表達這一頁是驗證 signal，而不是做學術研究
- 在 mobile bottom nav 中也更易懂

它目前由三個 sub-tabs 組成：

- `ETF Replay`
- `Stock Replay`
- `Stock Research`

這個分法是對的，因為三者的閱讀心智完全不同。

UI 1.0 子頁顯示名建議同步改為：

- `ETF Check / ETF 回看`
- `Stock Check / 個股回看`
- `Signal Proof / 信號驗證`

### A. Verify 共享特徵

共通設計語言：

- 高資訊密度
- summary cards + table 為主
- 使用者預期是研究者而非 casual viewer

改進原則：

- 不應過度美化成 marketing dashboard
- 應優先提高可驗證性與信息結構清晰度
- 在手機上應優先讓使用者先見到 summary、filter、shortlist，再進入重表格

### B. ETF Replay

用途：

- 驗證 ETF labels 在 rolling window 下的實際 forward behavior

目前區塊：

- label summary cards
- relative performance cards
- replay ticker selector
- replay table
- expand / collapse rows

設計角色：

- 回答「這些 ETF label 過去有沒有用」

改進方向：

- `ALL` 與單一 ticker 的比較語義不同，UI 可做更清楚區隔
- 可補一個視覺化時間軸或簡單勝率趨勢圖

### C. Stock Replay

用途：

- 觀察單一股票在 replay window 內的歷史 signal 與後續表現

目前區塊：

- ticker selector
- long / short / avg return summary cards
- all signals table
- expand / collapse rows

設計角色：

- 從單一標的角度研究 signal 行為

改進方向：

- 可加入按 label 過濾
- 可加入 signal-to-signal 間距或 clustering 提示
- 可補 sparkline / price context，讓表格不只是數字列表

### D. Stock Research

這是目前整個 app 研究濃度最高的區塊。

#### D1. Research Summary

用途：

- 說明樣本來源、時間窗與當前 research 狀態
- 顯示 records、long/short signals、updated time

設計角色：

- 把使用者心態切換到「驗證模式」

改進方向：

- 下一版建議視覺上改成 summary strip，而不是與其他頁同等高度的 hero

#### D2. Dataset Summary Cards

用途：

- 高層概覽 long / short excess、dataset window、universe

設計角色：

- 讓研究者先抓大方向，再看細表

#### D3. Gate Summary

用途：

- 用七關卡評估 labels 是否具備升格資格

目前包含：

- criteria 說明
- copy markdown
- gate legend toggle
- refresh research
- 詳細 gate table

設計角色：

- Stock Research 的核心模組
- 也是最接近「研究決策門檻」的 UI

改進方向：

- 七關卡是關鍵語義，應在全產品統一，不要在其他地方仍寫六關卡
- table 很重要，未來可考慮固定 label 欄或增加 sortable columns

#### D4. Research Flags Snapshot

用途：

- 專門觀察研究旗標的樣本與表現

設計角色：

- 新 signal 未升格前的觀察層

改進方向：

- 若未來 flags 增多，可改成卡片 + 小表混合

#### D5. Rolling Robustness Walk-forward

用途：

- 觀察不同時間視窗下，label 是否仍穩定

設計角色：

- 防止只在單一市況有效的假強信號

改進方向：

- 這區很適合後續視覺化，例如 pass heatmap
- 目前同一區塊在畫面中重複渲染兩次，後續應合併為一次

#### D6. Regime Split

用途：

- 比較同一 label 在不同 regime 下的表現

設計角色：

- 幫助回答「什麼環境下這個 signal 才可信」

改進方向：

- 可補每個 regime 的方向正確率
- 可加入更明確的 regime recommendation note

#### D7. Record Explorer

用途：

- 提供最細粒度的 replay records 檢查
- 可依 label 與 research flag 篩選

設計角色：

- 研究資料探查器
- 出現異常時的 debug 入口

改進方向：

- 可加 search
- 可加 export CSV / markdown
- 可將 record 點開後顯示該日 price context

## 7. 持久型輔助 UI

### 7.1 Help FAB

用途：

- 讓新使用者隨時能打開簡短說明

目前內容：

- 四個 tab 的用途說明
- 研究免責聲明
- 重看 onboarding 按鈕

設計角色：

- 在高資訊密度 app 中降低陌生感

改進方向：

- 可加入 glossary，例如 regime、RVOL、MAE、MFE
- 可加入 section deep links

### 7.2 Onboarding Modal

用途：

- 首次進站時解釋產品定位與 signal ladder

目前三步：

1. 歡迎與定位
2. signal ladder
3. 研究階段聲明

設計角色：

- 建立正確預期，防止使用者把 research signal 誤解為即時交易建議

改進方向：

- 文案應與最新 gate 數量、signal taxonomy 保持同步
- 若後續 signal 結構變多，可改為可跳過但可回看式 onboarding

## 8. 響應式行為與 Mobile-First 調整

目前 mobile 調整方向大致正確：

- tab 改為橫向可滑
- status chips 可橫向 scroll
- hero metrics 壓縮
- stock cards 改單欄
- ETF cards 變 2 欄
- 小螢幕隱藏部分次要資訊

設計判斷上，這代表目前策略是：

- 保留資訊密度
- 透過壓縮與捲動維持功能完整
- 不追求 mobile 完全重新排版

後續改進方向：

- 主導航應由頁頂 segmented control 遷移到底部 sticky tab bar
- 首屏應由「大 hero」改為「矮 header + 薄 summary」
- mobile 的 table 仍偏重，未來可加更多 card-first fallback
- `Verify` 在小螢幕上仍會很吃力，應視為次優先但要可用

## 9. 參考 Futu 的結構啟發

這裡指的是資訊架構與操作節奏，不是品牌視覺。

值得借鑑的地方：

- app-level 導航固定在底部
- 每頁只保留短 header
- 一級頁做粗分類，頁內再做二級分流
- search / filter 靠近內容，不綁在全域 hero
- 長頁內容以 list、row、summary block 組合，而不是每段都做厚卡片

不建議照抄的地方：

- Futu 的橙色品牌語言
- 發現 / 社區 / 廣告式入口
- 過多橫向二級 tab
- 券商風格的品牌語氣

## 10. UI 1.0 實作重點

- header 只承載品牌、當前頁名稱、少量工具位
- summary strip 承接狀態與關鍵 metrics
- 底部主導航取代頁首 tab
- `ETF` 單語顯示，不做中英重複
- `Verify / 驗證` 作為研究入口，名稱要比 `Quant Lab` 直白
- 整體視覺採收斂版：減 glow、減卡片層、減色彩搶眼事件

## 11. 目前 UI 的一致性觀察

以下不是 bug list，而是文檔角度下值得後續整理的地方：

- `Stock Research` 中 `Rolling Robustness Walk-forward` 目前重複出現兩次
- onboarding / help 仍有 `六關卡` 說法，但主研究區已是 `七關卡`
- Dashboard hero、Stocks hero、Research hero 的文案風格仍有些混合，有些偏產品語氣，有些偏工程說明
- 部分英文標題仍偏 generic，例如 `ETF + US Stocks Signal App`，未完全反映 command centre 定位
- 現有主 tab 名稱偏 desktop 與工程內部命名，與 mobile-first 導航不完全匹配
- 現有 header 承載過多產品介紹，壓縮了首屏可操作內容

## 12. 建議的後續優化優先順序

### 優先級 A：資訊架構與一致性

- 把 `Quant Lab` 顯示名統一替換成 `Verify / 驗證`
- 統一全產品對 signal maturity、七關卡、research status 的說法
- 去除重複區塊
- 取消大 hero 作為全域預設，改成矮 header + 頁內 summary

### 優先級 B：互動與可掃描性

- Bottom tab 導航落地
- Stocks 加 filters / sorts
- ETFs 加 category-level summary
- Dashboard 加跨 tab deep links

### 優先級 C：研究可視化

- Gate Summary 可排序
- Robustness 改 heatmap
- Replay 增加輕量時間序列圖

### 優先級 D：技術拆件

建議未來按下列順序拆 component：

- `AppHeader`
- `BottomTabBar`
- `PageSummaryStrip`
- `SummaryMetricGrid`
- `DashboardRegimeHero`
- `ActionRadar`
- `SectorSnapshot`
- `StockSignalSection`
- `ETFWeeklySection`
- `VerifyETFCheck`
- `VerifyStockCheck`
- `VerifySignalProof`
- `HelpPanel`
- `OnboardingModal`

## 13. 一句話總結

目前這套 UI 已經具備明確個性：它不是一般投資 dashboard，而是一個研究導向、可掃描、帶 command-centre 氣質的市場判讀工作台。下一版最值得做的，不是單純換皮，而是把它重構成更像 mobile investing product 的結構：矮 header、底部主導航、簡短命名，以及更直白的 `Verify / 驗證` 研究入口。
