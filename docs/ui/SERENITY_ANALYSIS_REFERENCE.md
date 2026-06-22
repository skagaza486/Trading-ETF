# Serenity Analysis Reference

本文件整理你提供的參考站 `https://analysissite.vercel.app/`，重點不是評論它好不好看，而是拆解：

- 它真正強在哪裡
- 哪些地方適合借到我們的 `市場羅盤`
- 哪些地方不應照抄
- 如果要落地，應落在哪些頁面與資料欄位

更新背景：

- 參考站於本次檢視時，前台可見快照日期主要落在 `2026-05-28` 到 `2026-05-29`
- 我們 repo 當前產品方向以 `ROADMAP.md`、`REDESIGN_BLUEPRINT.md` 與 `src/web/` 為準

---

## 1. 一句話判斷

`Serenity Analysis` 不是技術信號平台，而是「事件驅動 + AI 敘事重排」的投研工作台。

它最值得學的不是 signal 定義本身，而是：

1. 如何把「有邊際變化的標的」壓成一個可執行隊列
2. 如何把「看多 / 看空」和「風險高低」拆成兩個維度
3. 如何在每條訊號旁邊補上「仍需驗證什麼」的風險限定語

它最不值得學的是：

1. 把產品重心過度押在 AI 敘事與提及熱度
2. 讓 signal 語義變鬆，從可解釋規則退化成內容排序標籤
3. 用高密度文字流取代清楚的市場漏斗與新手導覽

---

## 2. 它實際在做什麼

從首頁與分頁可見，這站的主軸是：

- 首頁先列「先處理有邊際變化的股票」
- 依據 `推文 / 新聞 / 披露 / AI 觀點變化 / 風險隊列` 重排
- 每個標的附帶：
  - 近 `24h / 7天 / 30天` 提及頻次
  - `看多 / 中性 / 看空`
  - `高風險偏多 / 觀察 / 謹慎` 之類的工作隊列
  - 一段 AI 摘要，說明最新變化與仍需驗證的事
- 額外提供：
  - `股票池`
  - `AI 提及收益`
  - `View × Horizon` 戰績矩陣
  - `AI 分析` 覆蓋狀態

所以它的 signal 比較像：

- `narrative change signal`
- `attention / crowding signal`
- `work queue priority signal`

而不是：

- `entry trigger`
- `trend structure trigger`
- `risk-managed execution signal`

---

## 3. 它值得參考的地方

## 3.1 邊際變化優先，不是靜態強弱優先

這是它最有產品價值的一點。

它不是單純把最強股票永遠排前面，而是問：

- 今天有什麼新變化？
- 哪些標的值得先重新看一次？
- 哪些敘事剛升溫或風險剛變大？

這個思路非常適合借到我們的 `Market` 與 `Discover`。

對我們的啟發：

- 不要只顯示「最強」
- 要多一條「今天先看誰」隊列
- 排序依據應偏向 `change detection`，不只是 `current label strength`

適合映射成我們的欄位：

- `previousLabel -> label` 是否變動
- `rsRank` 是否大幅跳升
- `earnings risk` 是否進入窗口
- `sector leadership` 是否切換
- `researchFlags` 是否新增高風險標記

---

## 3.2 看法與風險分開表達

它很少用單一 bullish / bearish 把事情講完，而是會出現：

- `高風險偏多`
- `積極觀察`
- `謹慎`

這代表它其實在做兩件事：

1. 方向判斷
2. 風險/可操作性判斷

這點比單一 label 更接近真實決策。

對我們有價值的不是照抄字眼，而是吸收這個結構：

- 主信號仍表達方向/形態
- 第二層 overlay 表達風險與擁擠度

建議映射方式：

- 主 label 保持 `LONG_BREAK / LONG_VCP / LONG_BOUNCE / WATCH / AVOID_CHOP`
- 額外增加 overlay：
  - `crowdingRisk: low | medium | high`
  - `eventRisk: none | earnings | news_pending | verification_needed`
  - `executionReadiness: ready | early | wait | avoid`

這樣可以保留我們的 explainable core，同時吸收它的決策語感。

---

## 3.3 風險限定語寫得好

它很常在摘要裡直接說：

- 這只能作為供應鏈線索
- 仍需公司披露驗證
- 不能直接寫成訂單事實
- 情緒升溫但估值風險提高

這種語氣非常值得借。

原因：

- 不會把研究線索包裝成事實
- 降低使用者誤讀
- 提高信任感
- 很適合我們目前的研究階段定位

對我們的落地建議：

- `DetailView` 補一張「仍要確認什麼」卡
- `Discover` 卡片補一行「風險限定語」
- `Market` 首頁的「今日值得研究」不只講機會，也講失效條件與未驗證部分

特別適合對接的現有欄位：

- `researchFlags`
- `earningsWithinWindow`
- `reason`
- `SignalStatsCard` 的 sample gating 狀態

---

## 3.4 工作入口很清楚

它首頁不是一般 dashboard 式「很多指標很多卡片」，而是明確告訴你：

- 今日優先隊列
- 最新信息流
- 隊列分布
- 下鑽入口

這種 workflow 思維比一般行情站更值得借。

我們現在的 `Market -> Sectors -> Discover -> Detail -> Lab` 漏斗已經正確，但還可以再補強：

- `Market` 回答「今天大市如何」
- `Discover` 回答「今天先看誰」
- `Detail` 回答「這檔值不值得深看」
- `Lab` 回答「這種訊號歷史上是否站得住」

也就是說，我們不用學它的頁面名字，但要學它「每頁只回答一個核心問題」。

---

## 3.5 Performance 呈現方式可作為 Lab 靈感

它的 `View × Horizon` 矩陣，雖然未必足以支撐交易決策，但表達方式很有效率：

- 橫向看不同 horizon
- 縱向看不同 view / 隊列
- 一眼看到哪類型狀態在哪個持有窗口較佔優

這點對我們的 `LabView` 很有啟發。

我們已經有：

- `ret1d / ret3d / ret5d / ret10d`
- `ret5d_vs_spy / ret10d_vs_spy`
- gate summary
- rolling robustness

可以考慮再補一個：

- `Signal × Horizon` heatmap

目的不是炫績效，而是降低研究資料的讀取成本。

---

## 4. 它的 signal 有哪些精華可借

如果只問 signal 層本身，我認為可借的不是 label 名稱，而是三種「訊號維度」。

## 4.1 Marginal Change Signal

定義：

- 不是問這檔是否一直強
- 而是問「今天相對昨天有沒有更值得看」

可借原因：

- 比靜態榜單更符合日常 workflow
- 適合首頁與發現頁排序

我們的可落地來源：

- `previousLabel !== label`
- `WATCH -> LONG_*`
- `LONG_* -> REVIEW / AVOID_CHOP`
- `earningsWithinWindow` 由 false -> true
- `sector leader` 切換

## 4.2 Risk Overlay Signal

定義：

- 方向可以偏多，但同時風險可以很高

可借原因：

- 能避免把「有機會」誤讀成「適合重倉」
- 更貼近 PM-style 決策

我們的可落地來源：

- 財報窗口
- MAE / stop-loss-hit 歷史特徵
- 過熱板塊
- `researchFlags`
- 後續若加入新聞/事件，也可納入

## 4.3 Verification Needed Signal

定義：

- 這不是告訴你「買」
- 而是告訴你「如果要深入看，下一步要驗證什麼」

可借原因：

- 很適合研究階段產品
- 能把 AI/內容型資訊降成風險提示，而非主決策器

我們的可落地形式：

- `needs earnings check`
- `needs news catalyst check`
- `sample too small`
- `historical stats insufficient`
- `regime mismatch`

---

## 5. 哪些地方不要照抄

## 5.1 不要把它的工作隊列 label 直接當主 signal

例如：

- `積極觀察`
- `高風險偏多`
- `謹慎`

這些標籤對 workflow 有用，但不適合直接取代我們的主分類器。

原因：

- 語義較鬆
- 難做規則驗證
- 不利於回測與研究歸因
- 容易讓產品從 signal engine 退化成人工敘事板

正確做法：

- 保留我們的主 label
- 把它降成 secondary overlay / queue state

## 5.2 不要把提及熱度當主排序邏輯

提及熱度很有用，但只能作：

- crowding
- attention
- follow-up priority

不能直接作為：

- entry signal
- quality proxy
- conviction proxy

否則會出現兩個問題：

1. 把擁擠敘事誤當 alpha
2. 把內容生產頻率誤當成公司事實

## 5.3 不要把大量 AI 摘要放到首頁核心區

對方站首頁文字密度很高，適合研究者，但對我們的目標人群不是最佳路徑。

我們應維持：

- `Hero` 用白話判斷
- `Discover` 才做標的工作隊列
- `Detail` 再提供較深的文字與理由

這樣比較符合 blueprint 的新手漏斗。

## 5.4 不要忽略資料新鮮度感知

這站前台顯示的日期停留在 `2026-05-28` / `2026-05-29`，對使用者來說是一個很大的信任訊號。

這提醒我們：

- 更新時間必須常駐可見
- 「今天是否最新」比「資料很多」更重要
- 一旦資料可能延遲，要明確說明

這點我們現在已在 TopBar / snapshot time 做得比它更接近正確方向，應繼續強化，不應退步。

---

## 6. 對我們產品的具體落地建議

## 6.1 Market 頁

可新增：

- `今日有變化` 區塊
- `今天先看誰` 3-5 檔隊列
- 每檔只顯示：
  - ticker / 名稱
  - 新舊 signal 變化
  - 一句人話原因
  - 一句風險限定語

不要做：

- 長篇 AI 摘要流
- 以提及熱度作首頁核心排序

## 6.2 Discover 頁

可新增：

- `Changed Today` filter
- `Risk Raised` filter
- `Needs Verification` filter
- 卡片中的 `why now` / `watch-out` 兩行文案

最適合承接外站精華的頁面其實是 Discover，不是 Lab。

## 6.3 Detail 頁

可新增三張卡：

1. `今天為何浮上來`
2. `仍需確認什麼`
3. `若失效，通常怎樣失效`

這樣可以把我們現有的：

- signal explanation
- stats sample gating
- earnings warning
- research flags

整合成更完整的決策敘事。

## 6.4 Lab 頁

可新增：

- `Signal × Horizon` heatmap
- `Signal × Regime` 簡表
- `sample sufficiency` 直觀標示

注意：

- Lab 應吸收它的閱讀效率
- 不應吸收它的敘事主導邏輯

---

## 7. 建議新增的內部資料欄位

如果未來要把這種參考轉成我們自己的系統能力，可以考慮新增以下衍生欄位。

## 7.1 Queue 層

- `changePriorityScore`
- `changedToday`
- `changedReason`

## 7.2 Risk 層

- `crowdingRisk`
- `eventRisk`
- `verificationNeeded`
- `verificationNote`

## 7.3 UX copy 層

- `whyNowPlainZh`
- `watchoutPlainZh`
- `invalidationPlainZh`

這些欄位不一定全要進 snapshot schema，但至少可作為 UI 組裝的目標模型。

---

## 8. 最後結論

這個參考站最值得借的是：

- workflow 隊列感
- 邊際變化優先
- 風險 overlay
- 驗證導向的限定語

最不值得借的是：

- 把 AI 敘事變成主決策器
- 用鬆散工作隊列取代可驗證 signal
- 用高密度文字流壓過新手漏斗

一句話總結：

我們應該學它「怎樣安排今天的研究順序」，而不是學它「用什麼取代我們的 signal engine」。
