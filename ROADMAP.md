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

### L9. Headless UI Smoke Test Harness

目標：

- 為 `Dashboard` / `Stocks` / `ETFs` / `Quant Lab` 建立第一套可重跑的 headless UI smoke test
- 自動抓 layout 跑位、responsive 斷版、card overlap、table overflow、tab / sub-tab 切換失效、dialog 阻擋主流程等問題

建議範圍：

- `Playwright` headless smoke
- 固定 viewport：desktop / tablet / mobile
- 以 mocked market-data fixtures 為主，避免 Yahoo / Finnhub rate limit 令 smoke 不穩
- 第一版先保護 `Dashboard`、`Stocks`、`Quant Lab`，之後再補 `ETFs` 與 global dialog / onboarding

延後原因：

- 這是高價值的品質基建，但不應早於 `EXP-009`、`R8`、`R7` 這些研究主線
- 若研究條件與 UI 結構仍在快速改動，太早建立 smoke baseline 會令維護成本偏高
- 較適合在 Phase 2 核心研究項初步穩定後，再作為 Phase 3 的 UI 穩定性護欄

---

## 建議時間線

### Phase 1：立即做 ✅ 完成（2026-06-18）

所有 I1–I7 已落地。額外完成：

- **EXP-009**：LONG_BASE / WATCH / LONG_BOUNCE RS 過濾（signal 重新設計後已更新追蹤目標）
- **Signal 架構重設計**：舊 LONG_WATCH/LONG_SETUP/LONG_CONFIRM/LONG_PULLBACK 全面重命名，改為 structure+trigger 兩層設計（WATCH / LONG_BASE / LONG_BREAK / LONG_BOUNCE / LONG_VCP），UP_PROMOTION / DOWN_PROMOTION 移除
- **UI 修復**：Quant Lab sub-tab overlap、backtick text、placeholder text

### Phase 2：研究版驗證（進行中）

**已完成**：

- [x] 新設計首次 gate baseline（EXP-009）：LONG_BOUNCE 全 PASS，LONG_BASE G3 FAIL，LONG_BREAK G1 FAIL（n 不足）
- [x] Gate Summary UI「📋 Copy MD」按鈕已實作
- [x] `SIGNAL_DEFINITION_RESEARCH.md` 已與 `SIGNAL_IMPROVEMENT.md` 合併（2026-06-18）
- [x] R8 AVOID_DISTRIBUTION 派發預警已實作
- [x] **Multi-bar signal 改版**（2026-06-18）：
  - LONG_BREAK：RVOL 1.8 → 1.6，新增 `priorBaseStreak >= 2`（HYP-017）
  - LONG_BOUNCE：新增 `pullbackRvolAvg < 1.2`（HYP-018）
  - WATCH：新增 `rsiSlope3 > 0`（HYP-019）
  - 新 indicator 字段：`lowRvolDaysInWindow`, `atrCompressing`, `priorBaseStreak`, `pullbackRvolAvg`, `rsiSlope3`
- [x] **LONG_BASE 降級為 universe filter**（2026-06-18）：
  - 根本問題：base formation 期間 5D 回報天然偏低，G2 FAIL 是架構問題而非閾值問題
  - Minervini 框架：entry 在 pivot breakout，不在 base formation 中
  - LONG_BASE 從 gate-evaluated entry signal 改為 universe filter，不再納入 Gate Summary
- [x] **外部研究（兩輪，2026-06-18）**：
  - GitHub（RyanJHamby、Minervini screener）、Reddit r/algotrading、學術論文（arXiv 2512.12924）
  - 發現：EMA150 缺口（Minervini 8 條件）、ADX 趨勢強度、NR7、VCP 遞減結構、ADX 牛市樣本限制
  - 確認：RVOL 1.6 合理（社群 min ≥ 1.5）、RSI 42–58 回調邊界正確、regime conditioning 方向正確
- [x] **EXP-011 外部研究改版驗證**（2026-06-18）：
  - WATCH `rsiSlope3` → null-safe（廣篩優先）
  - LONG_VCP 加入 `previousLabel` hysteresis + `CLV > 0.6`：avg5D -1.5% → +1.5%（方向修正）
  - LONG_BREAK 加入 `EMA50 > EMA150`（null-safe）+ `extendedFromPivot != true`：n=16 → 10，方向維持
  - LONG_BOUNCE RSI 58→62 測試後回退：vs SPY +0.9% → +0.4%，rolling G3 6/6 → 1/6，58 是真實邊界
  - ADX > 25 測試後不加入（排除 10/16 信號，2024–2026 牛市樣本不具區分力）
  - 新 indicators 落地：`ema150`, `adx14`, `udVolRatio50`, `nr7`, `extendedFromPivot`（均為研究字段）

**當前追蹤項**：

- [x] LONG_BOUNCE G6 觀察（EXP-012 完成 2026-06-18）：HYP-026 rsLineAboveEma 過濾後 MAE=3.1%（微升），無效 — MAE 問題在 entry timing，非 RS 方向；rsLineAboveEma 降級為 research tag
- [ ] LONG_BOUNCE MAE 控制（待驗證）：考慮提高 CLV floor（0.6→0.7）或收窄 `recentPullbackNearEma20` 定義（EXP-013）
- [ ] LONG_BREAK n=10（G1 FAIL）：根本解是擴大 watchlist universe，而非鬆化條件
- [ ] ADX（HYP-022）：在非牛市或更長時間跨度樣本中重新評估是否有區分力

**Phase 2 剩餘主線**：

- [ ] `R1` 正式 breadth regime 評估（I1 已有 proxyWeakBreadth，觀察 live 後決定是否升級）
- [ ] `R7` walk-forward robustness（Gate 多 window 驗證，見 SIGNAL_IMPROVEMENT.md HYP-014）
- [ ] `R2` conditional routing 驗證
- [ ] `R6` FRED 簡化濾網

完成定義：

- LONG_BREAK n 達到 100+（G1 PASS）
- LONG_BOUNCE 維持全 PASS（含 G6 MAE < 3%）
- Gate Summary 多 window 驗證（R7）已有初步結果

### Phase 3：架構演化（Backend Evolution）

**觸發條件：** LONG_BREAK n ≥ 100（G1 PASS）且 LONG_BOUNCE 維持全 PASS ≥ 2 個月 — signal 定義穩定後才值得投入基建。

**目標：** 突破 pure client-side 的三個根本限制：

1. 大 universe 計算（500 隻 × 每日，瀏覽器做不到）
2. 跨 session 數據積累（Gate 歷史、實驗對比）
3. ML 模型服務（Stage C Meta-Labeling 需要 Python 生態）

---

#### B1. Cloudflare KV + Cron Triggers（最小改動，留在現有生態）

**前提：** 已有 `worker.ts` 和 Cloudflare 部署，免費 tier 已涵蓋所需。

**架構：**

```text
Cron Trigger（每日 16:30 ET 收市後）
  → Worker 執行：
      fetch S&P 500 ticker 清單（Wikipedia / Finnhub /stock/symbol）
      fetch 所有股票 OHLCV（Yahoo Finance，已有 proxy 邏輯）
      計算橫截面 RS 排名（126d return percentile）
      計算個股 indicators snapshot
  → 結果寫入 Cloudflare KV
      key: "daily-snapshot:{date}"
      value: JSON（所有股票當日 indicators + RS 排名）

Browser SPA（現有）
  → Worker 讀 KV 的 pre-computed snapshot
  → 本地做 signal classification（現有 signalClassifier 不變）
  → 顯示結果
```

**解鎖：**

- **HYP-025 Path A**：真正的橫截面 RS 排名（500 隻 universe，排名有意義）
- **Universe 擴大**：從 ~100 隻 watchlist 擴至 S&P 500，LONG_BREAK n 問題根本解
- **每日自動刷新**：不再依賴用戶 page load 觸發計算

**學到：** Edge computing、KV 存儲設計、Serverless cron、API 合約設計

**Cloudflare 免費 tier 限制確認（截至 2026）：**

- KV：10 GB 存儲，100K 讀/日，1K 寫/日 — 每日一個 snapshot 完全足夠
- Cron Triggers：每個 Worker 支援多個 cron，每月 100K 次調用

---

#### B2. Cloudflare D1（SQLite Edge Database）

**前提：** B1 穩定運行 ≥ 1 個月，確認 KV 架構無問題後才加 DB。

**架構：** KV 存最新快照（讀取快），D1 存歷史序列（可查詢）。

**Schema 設計（初版）：**

```sql
-- 每次 EXP 的 Gate Summary 快照
CREATE TABLE gate_snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  exp_id      TEXT NOT NULL,          -- 'EXP-012'
  snapshot_date TEXT NOT NULL,
  label       TEXT NOT NULL,
  n           INTEGER,
  avg_5d      REAL,
  vs_spy      REAL,
  mae_5d      REAL,
  g1 TEXT, g2 TEXT, g3 TEXT, g4 TEXT, g5 TEXT, g6 TEXT, g7 TEXT,
  status      TEXT
);

-- 信號歷史（供 walk-forward 查詢）
CREATE TABLE signals (
  ticker      TEXT NOT NULL,
  signal_date TEXT NOT NULL,
  label       TEXT NOT NULL,
  regime      TEXT,
  indicators  TEXT,                   -- JSON blob
  ret_5d      REAL,
  ret_5d_vs_spy REAL,
  mae_5d      REAL,
  PRIMARY KEY (ticker, signal_date)
);
```

**解鎖：**

- **跨 session 實驗對比**：EXP-009 vs EXP-011 vs EXP-012 自動記錄，不再靠手動複製 MD 表格
- **Gate Summary 歷史趨勢**：觀察每個 label 的 n / MAE / vs SPY 隨時間變化
- **R7 Walk-forward（HYP-014）升級**：直接 SQL 查詢切片，不再在瀏覽器記憶體做

**學到：** 關聯式資料庫基礎、Schema 設計、SQL 查詢、Edge database 概念

---

#### B3. Python Research Backend（Meta-Labeling 前置條件）

**前提：** Gate Summary 多 window 驗證（R7/HYP-014）穩定 — 數據層乾淨才能進 ML。

**架構：**

```text
Python (FastAPI / 本地 or Railway 免費 tier)
  ├── data_pipeline.py    → 讀 D1 信號歷史，用 yfinance 補齊數據
  ├── features.py         → 計算特徵向量（現有 indicators + RS Line + Alpha158 子集）
  ├── labeler.py          → Triple-Barrier Method 標籤生成（HYP Stage B）
  ├── model.py            → LightGBM Meta-Labeling 訓練（Stage C）
  └── api.py              → /predict endpoint 供前端 SPA 呼叫

Browser SPA
  → 現有 signal classification（primary model，保留不動）
  → 呼叫 Python /predict（secondary model — take/skip）
  → 顯示 ML 過濾後的高信心信號
```

**解鎖：**

- **Stage C Meta-Labeling**：保留現有 rule engine 作 primary model，LightGBM 做二級 take/skip 過濾
- **Stage B Triple-Barrier 標籤**：比固定 5D return 更貼近實盤的標籤方法
- **HYP-025 Path A + ML 交叉**：橫截面 RS 排名作為 LightGBM feature 之一

**學到：** Python 後端架構、REST API、ML pipeline（特徵工程 → 訓練 → 推論）、前後端 API 合約設計

---

**Phase 3 完成定義：**

- B1：S&P 500 daily snapshot 穩定寫入 KV，HYP-025 Path A 已實作並產生橫截面排名數據
- B2：Gate Summary 歷史在 D1 中積累 ≥ 30 天，EXP 對比流程自動化
- B3：Meta-Labeling 二級模型在 OOS 樣本中 Sharpe > rule-only baseline

### Phase 4：長期多源資料

- `L1-L9` 視 Phase 3 成熟度逐步啟動

完成定義：

- 預計算架構穩定
- headless UI smoke 對核心頁面提供基本護欄
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

Phase 1 全部完成。Signal 架構重設計完成。Multi-bar signal 改版（HYP-016~019）及外部研究改版（HYP-020~022，EXP-011）完成。

**本輪確立的研究原則**：改動目標是優化 signal 真實成效，不是讓 gate 通過。每個條件改動前須先說明市場假設，gate 結果只是驗證假設是否在數據中可見。

Phase 2 當前優先順序：

1. **LONG_BREAK 樣本擴充**：n=10（G1 FAIL），根本解是擴大 watchlist universe；RVOL 1.4 降低暫緩（需先有足夠樣本才能驗證）
2. **LONG_BOUNCE MAE 控制（EXP-013）**：HYP-026 rsLineAboveEma 已驗證無效（EXP-012，MAE 3.1%）；下一個假設：提高 CLV floor 或收窄 pullback 定義
3. **R7 Walk-forward**：Gate 多視窗驗證（HYP-014），升級 `researchGate.ts` 為 rolling multi-window
4. **R6 FRED 簡化濾網**：Worker proxy 已有 FRED endpoint，加 net liquidity slope 作 regime note
5. **R1 breadth regime**：I1 proxyWeakBreadth 已有，觀察 live 表現後決定是否升級為正式 regime state
