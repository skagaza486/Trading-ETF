# ROADMAP vNext

本文件把新一輪建議重整為三個層級：

- `立即做`：高價值、低阻力、與現有 repo 架構最相容
- `研究版先做`：值得驗證，但暫時不應直接升為 production 主邏輯
- `長期延後`：有戰略價值，但會明顯增加 scope、資料依賴或系統複雜度

目標：

- **Dashboard** — 3 秒看懂今日市場基調（Regime + Breadth + Action Radar）
- **Stocks** — 每日股票戰術信號，量價驅動，可解釋
- **ETFs** — 板塊動量排名，SGOV 風險調整，輔助 Stocks 決策
- **Quant Lab** — Signal 統計驗證（Gate Summary）、回放研究、參數高原測試

核心約束：explainable rule-based signals · real-data-first · 研究驗證先於 UI 承諾

不是要把產品改造成重型對沖基金平台，也不在研究層成熟前引入 ML。

---

## 核心原則

### 1. 先驗證，再升級

任何新 signal、新 regime、新 factor，都應先證明：

- 可解釋
- 可回測
- 不會令樣本碎裂到無法評估

### 2. 先加 filter / flag，再改核心 enum

如果一個新概念仍未證明有效，第一步應以：

- warning flag
- research tag
- ranking overlay

形式落地，而不是立即改寫整個型別系統或主分類流程。

### 3. ETF 與 Stock 仍然分開演進

- ETF 線優先處理 regime、breadth、ranking、rotation
- Stock 線優先處理 signal quality、pattern research、research validation

### 4. 前端承諾力不能超過研究驗證程度

任何更強烈的措辭、排序或 badge，都不應超過目前 signal 的實證品質。

### 5. 多源資料要以預計算架構為前提

一旦引入 FRED、SEC、fundamentals、options 等外部資料，優先解法不是在前端繼續疊 fetch，而是改成預計算輸出。

---

## 立即做 ✅ 全部完成（2026-06-18）

> Phase 1 已於 2026-06-18 完成。所有 I1–I7 已落地並推送至 main。

### I1. Regime Proxy Breadth 第一版 ✅

目標：用極少額外資料成本，提升市場內部結構判斷力。

做法：

- 新增 `RSP` 作為 breadth proxy
- 延用現有 `IWM` 基準資料
- 加入以下檢查：
  - `SPY > EMA50` 但 `RSP < EMA50`
  - `SPY` 走強但 `IWM/SPY` ratio 走弱

落地方式：

- 第一步先新增 `proxyWeakBreadth` / `breadthWarning` 類型 flag
- ETF / stock signal 先做降級或排序懲罰
- 暫時不要新增正式 `NEUTRAL_WEAK` enum

原因：

- 成本低
- 邏輯清晰
- 不會立即擴大 type / UI / replay 複雜度

### I2. ETF Ranking 升級，不先重寫分類 ✅

目標：提升 ETF weekly output 的排序品質，而不破壞現有 `FAVOUR/WATCH/WAIT/AVOID` 流程。

做法：

- 保留現有 label waterfall
- 在 `FAVOUR` 與 `WATCH` 內部增加 ranking score
- 初版 score 採用：
  - `riskAdjustedMomentum = (return13w - SGOV return13w) / volatility13w`

第一版只做：

- 排序
- 額外顯示 score / rank
- 不直接改 label 邏輯

原因：

- 排序優化比分類重寫更安全
- 較容易觀察新因子是否真的提高可用性

### I3. SGOV 作無風險基準 ✅

目標：避免把只是「有升」但其實沒跑贏現金替代的 ETF 錯判為優秀動量。

做法：

- 把 `SGOV` 視為 ETF ranking 的 base hurdle
- 先只用於 ranking score
- 未來才考慮升級成 regime routing 條件

### I4. LONG_BASE_BREAK 研究版原型 ✅

目標：研究「長期沉澱後首次異動」是否優於一般 breakout。

建議條件：

- 過去 60 天有大量低 RVOL 日
- 當日 `RVOL` 顯著放大
- `close > 60D high`
- `regime !== short_friendly`

落地方式：

- 第一版先做成 research variant
- 可以先記錄為：
  - `LONG_CONFIRM` 子類型
  - 額外 `patternTag`
  - 或獨立實驗欄位

暫時不要：

- 立即升成 production 主 label
- 立即要求 UI 主卡片用它作強承諾訊號

原因：

- 新 label 容易樣本太少
- 現有 gate 對樣本數有要求，先觀察再升級更穩

### I5. Parameter Plateau 離線版 ✅

目標：驗證現有訊號是否存在明顯過擬合。

做法：

- 先寫離線 script 或 research runner
- 只測小網格：
  - `RVOL` threshold
  - breakout lookback days
  - 其他 1 到 2 個核心參數

輸出：

- 每組參數的 signal count
- avg 5D return
- avg 5D vs SPY
- 過擬合警示
- ATR 止損模擬：若未來 5 天觸及 `close - 2×ATR`，強制把 final return 設為止損虧損值（而非觀察期末 return），令回測結果更貼近實盤摩擦成本

暫時不要：

- 第一版直接塞進前端即時計算
- 一開始就做大型熱力圖 UI

### I6. ETF Weekly 卡片化（已完成）

目標：讓 ETF weekly 模組的可讀性追上 stock screener。

做法：

- 沿用現有 labelDisplay / bilingual 思路
- 補齊 ETF 卡片視圖
- 顯示：
  - label
  - 13W / 26W
  - price vs 10W / 40W
  - regime note
  - breadth warning（若有）

原因：

- 這是已知缺口
- 不需要改 engine 就能提升 usability

### I7. Tab 架構重組 + Dashboard 主控台 ✅

目標：把 App 從「資料陳列櫃」變成「決策駕駛艙」，讓用戶 3 秒看懂今日市場基調。

**Tab 順序調整**：

現有結構太平鋪，改為四個有邏輯遞進關係的 Tab：

1. **Dashboard**（全新加入）— 宏觀定基調
2. **Stocks**（原 Stock Screener）— 微觀找機會，交易者第一關心
3. **ETFs**（原 ETF Weekly）— 中觀確認板塊共振
4. **Quant Lab**（合併 ETF Replay + Stock Replay + Stock Research）— 深度研究，週末覆盤用

原因：交易者打開工具第一個念頭是「我的自選股今天有沒有突破」，而不是「ETF 環境如何」。把 Stocks 提前，ETFs 作為確認層，符合實戰直覺。

**Dashboard MVP（只用現有資料）**：

- **Hero Section**：大字顯示當前 Regime 狀態 + 一句粵語總結（例如："大市穩健，可積極出擊"）。若 `I1` breadth warning 觸發，Hero 亮警示。
- **Action Radar**：從現有 `stockSignals` 過濾今日觸發的極端信號，分為：
  - 攻擊：當日 `LONG_CONFIRM` / `LONG_PULLBACK` top 3
  - 防禦：當日 `AVOID` / 未來加入 `AVOID_DISTRIBUTION` top 3
- **Sector Snapshot**：從現有 `etfResults` 提取 FAVOUR top 3 / AVOID bottom 3，一行列表顯示，不需要熱力圖

落地方式：

- 新增 `Dashboard` 組件，用 `useMemo` 從現有 `etfResults` / `stockSignals` 提取
- 不需要新 API，不需要新 engine 邏輯
- Dashboard 的 FRED 流動性面板、breadth warning 面板，等 `I1` / `R6` 完成後再接入

暫時不要：

- 一開始就做複雜的 SVG 熱力圖
- 把所有 L 層數據（FRED、Insider）先塞進 Dashboard 佔位

---

## 研究版先做

這一層代表「值得做，但先當實驗，不應直接寫死為產品承諾」。

### R1. 正式 `NEUTRAL_WEAK` / Breadth-Divergence Regime

前提：

- `I1` 的 breadth warning 經 replay / live observation 證明有用

之後才考慮：

- 把 `proxyWeakBreadth` 升級為正式 regime 狀態
- 重寫 regime enum、badge、copy、downgrade matrix

### R2. ETF Conditional Routing

目標：讓 ETF engine 在不同市場環境走不同 scoring 邏輯。

方向：

- `long_friendly`：risk-adjusted momentum
- `neutral`：降低追動量比重
- 弱市場 / breadth 弱：偏防守與低波

但現階段只應：

- 先用 ranking overlay 驗證
- 再決定是否重寫成完整 factor switching

### R3. Defensive / Low-Vol ETF 模式

目標：在假繁榮或震盪環境減少 whipsaw。

方向：

- 靠近 40W MA
- ATR 較低
- 防守型板塊或現金替代優先

注意：

- 應先作排序或候選池調整
- 不要太快把它變成與 momentum 平權的第二主引擎

### R4. LONG_BASE_BREAK 正式 label 評估

當以下條件成立才考慮升級：

- 樣本數達到可評估程度
- 與 `LONG_CONFIRM` 相比有明顯增益
- 不會嚴重稀釋其他 label 的研究樣本

### R5. Plateau Test 視覺化與 Gate 整合

研究目標：

- 將過擬合評估納入研究體系

順序：

- 先有離線結果
- 再決定是否加入 UI
- 最後才考慮是否成為正式 `G7/G8`

### R6. FRED 簡化版流動性濾網

原因：

- repo 在 dev 已預留 FRED proxy
- 宏觀濾網比 options / insider / social data 更容易保持 explainable

第一步建議：

- 只做簡化版 liquidity slope / warning
- 先作 regime note 或 downgrade filter
- 暫不追求完整宏觀因子矩陣

### R7. Walk-forward / multi-window robustness

目標：令研究評估不只停留在單一樣本窗。

做法：

- 多視窗 replay
- 多參數小網格
- label-level robustness summary

這比盲目增加新指標更重要。

### R8. AVOID_DISTRIBUTION 派發預警信號

目標：識別量價背離的機構派發形態，補充現有純「突破 / 不突破」二元判斷的盲點。

條件（全部使用現有 Yahoo 量價數據，不需新 API）：

- `RVOL > 2.5`
- 當日收長上影線或收盤低於開盤（巨量滯漲形態）
- 靠近 52 週高位（< 5% 距離）

落地方式：

- 第一版先作 `patternTag: distributionWarning` flag
- 不直接改 label，作 AVOID 的強化 badge
- 在 UI 上用明顯標記提示

暫時不要：

- 一開始就把它與 social sentiment 掛鉤（社交提及量是 L5，噪音高）
- 立即改寫 AVOID 主邏輯

原因：

- 使用現有數據，成本極低
- Wyckoff 派發識別邏輯清晰、可驗證
- 可與 `LONG_BASE_BREAK` 形成一對互補信號（一個找進場，一個找出場）

---

## 長期延後

這一層不是否定，而是明確標記為「現時不應投入大量工程」。

### L1. FRED 完整流動性矩陣

例如：

- `WALCL`（美聯儲總資產）
- `RRPONTSYD`（隔夜逆回購）
- `TGA`（財政部帳戶）
- **淨流動性公式**：`Net Liquidity = WALCL - TGA - RRP`
- 4 週斜率為負 → 考慮觸發 `LIQUIDITY_DRAIN` 狀態，全局降低高風險突破信號優先級

延後原因：

- 需要更成熟的資料處理與更新流程
- 更適合預計算架構，而不是現有前端即時計算模式
- `R6` 的簡化版先跑通，再升級至此

### L2. SEC Form 4 Insider Cluster

價值：

- 研究味很強
- 有機會成為高價值另類濾網

延後原因：

- 資料接入、解析、對齊 ticker 的複雜度高
- 一旦做得半吊子，很容易變成噪音來源

### L3. Fundamentals / Quality Overlay

例如：

- ROIC
- margin trend
- debt/equity

條件參考（待實作時用）：

- `ROIC < 8%` 且 `Gross Margin` 連續兩季下滑 → 即使技術面觸發 `LONG_CONFIRM`，強制降級為 `AVOID_JUNK_MOMENTUM`
- 防止追入「動量良好但財務劣化」的垃圾股

延後原因：

- 已超出現有「Yahoo price-first + explainable signals」的輕量邊界
- 需要預計算與資料治理支持（FMP 免費版每天 250 次請求，適合 GitHub Actions 跑批，不適合前端即時 fetch）

### L4. Options / IV-HV / Put-Call 類濾網

條件參考（待實作時用）：

- `IV/HV > 2.0`：隱含波動率遠超歷史波動率，市場定價二元風險（潛在做空報告、監管打擊），此時攔截所有做多信號
- Yahoo Finance options chain 本身已包含此數據，只需 proxy 層解析

延後原因：

- 雖然可能有價值，但已明顯接近另一條產品線
- 很容易把 repo 從 signal research 工具拉向衍生品資料平台

### L5. Social Sentiment / Mention Volume

延後原因：

- 噪音高
- 穩定性和可驗證性較弱
- 容易令研究資源分散

### L6. Macro Blackout Calendar

延後原因：

- 實用性有，但屬輔助風險層
- 不應早於核心 signal quality / breadth / robustness

### L7. 靜態預計算全量架構

這是長期最值得做的大基建，但不應與所有新資料源同時啟動。

建議順序：

1. 先把現有 Yahoo + engine 路徑抽出為可重用 runner
2. 再用 GitHub Actions 產出單一 `market-state.json`
3. 最後才逐步接入 FRED / SEC / fundamentals

### L8. ML / Meta-labeling / Quant Lab 化

延後原因：

- 在資料層、樣本量、walk-forward、plateau test 未成熟前，ML 只會放大偏差

---

## 建議時間線

### Phase 1：立即做 ✅ 完成（2026-06-18）

所有 I1–I7 已落地。額外完成：

- **EXP-009**：LONG_SETUP / LONG_WATCH / LONG_PULLBACK 加入 RS 過濾，修復 G3 gate failure
- **UI 修復**：Quant Lab sub-tab overlap、backtick text、placeholder text

### Phase 2：研究版驗證（進行中）

**當前阻塞項（必須先解）**：

- [ ] EXP-009 驗證：刷新 Stock Research UI → 填回 `SIGNAL_IMPROVEMENT.md` EXP-009 改動後數據
- [ ] Gate Summary UI 加「📋 Copy MD」按鈕（自動格式化為 markdown table，免手動抄數）

**Phase 2 主線**：

- [ ] `R8` AVOID_DISTRIBUTION 派發預警（成本低，與 I4 互補，優先）
- [ ] `R1` 正式 breadth regime 評估（I1 已有 proxyWeakBreadth，觀察 live 後決定是否升級）
- [ ] `R7` walk-forward robustness（Gate 多 window 驗證，見 SIGNAL_IMPROVEMENT.md HYP-014）
- [ ] `R2` conditional routing 驗證
- [ ] `R6` FRED 簡化濾網

完成定義：

- LONG_SETUP G3 通過（vs SPY > +0.5%）
- 至少一項新 research variant（BASE_BREAK / DISTRIBUTION）有初步 gate evidence
- Gate Summary 可一鍵匯出 markdown

### Phase 3：長期架構與多源資料

- `L1-L7` 視需要逐步啟動

完成定義：

- 預計算架構穩定
- 外部資料源接入有節制
- repo 仍保持 explainable、可驗證、可維護

---

## 目前不建議做的事

- 不要立即新增大量 regime enum
- 不要一口氣把 ETF engine 改成完整多因子黑盒 scoring
- 不要把 `LONG_BASE_BREAK` 直接升成 UI 主推訊號
- 不要先做 options / social sentiment，再回頭補 research discipline
- 不要把多源資料全部放在前端即時抓取
- 不要在 plateau / walk-forward 尚未建立前就跳去 ML

---

## 下一步（2026-06-18 更新）

Phase 1 全部完成。Phase 2 優先順序：

1. **EXP-009 驗證**：刷新 UI → 對比 LONG_SETUP vs SPY 是否升至 >0.5%；若仍 fail，把 RVOL 門檻從 1.2 升至 1.5（見 `SIGNAL_IMPROVEMENT.md`）
2. **Gate Summary Copy MD 按鈕**：在 Stock Research Gate Summary section 加「📋 Copy MD」，自動格式化當前 gate 結果為 markdown table，取代手動抄數
3. **R8 AVOID_DISTRIBUTION**：`patternTag: distributionWarning`，條件 RVOL>2.5 + 上影線 + 靠近 52W 高，與 BASE_BREAK 互補
4. **R7 Walk-forward**：Gate 多視窗驗證（HYP-014），升級 `researchGate.ts` 為 rolling multi-window
5. **R6 FRED 簡化濾網**：Worker proxy 已有 FRED endpoint，加 net liquidity slope 作 regime note
