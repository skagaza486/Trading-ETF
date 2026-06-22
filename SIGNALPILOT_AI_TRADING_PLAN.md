# SignalPilot（訊號領航）AI 交易計劃

> **文件狀態：** Proposed v1.0  
> **建立日期：** 2026-06-22  
> **產品定位：** 以現有可解釋 signal 決定方向，以可驗證 ML 決定是否採納，以確定性規則控制風險，先模擬、後人工批准，再逐步自動化。

---

## 1. 計劃名稱

**SignalPilot（訊號領航）**

- **Signal**：沿用現有 `signalClassifier`，不推倒已建立的研究與解釋能力。
- **Pilot**：AI 是領航與決策輔助，不是沒有邊界的自主交易員。
- **核心句：** Signal 決定方向，AI 決定取捨，Risk Engine 決定上限，Broker Adapter 負責執行。

這是一條獨立於 UI redesign 的產品路線。它把目前的「市場訊號與研究工具」逐步升級為「可審計的交易決策與執行系統」。

---

## 2. 為甚麼現在建立這條路線

目前系統已具備：

- 每日真實市場資料與約 299 隻股票 snapshot。
- `signalClassifier` 的結構 + 觸發式入場標籤。
- D1 signal 歷史、forward return、MFE、MAE、ATR 與相對 SPY 表現。
- Triple-Barrier labeling 的 Python 基建。
- Gate、走勢一致性與研究紀律。

但「有訊號」與「可安全操作資金」之間仍缺少四層：

1. **選擇層**：同日多個 signal 中，哪些值得採納？
2. **組合層**：每筆做多少，如何限制集中度與總風險？
3. **執行層**：如何產生、批准、送出、取消及追蹤訂單？
4. **會計層**：如何準確記錄 fills、現金、持倉、已實現及未實現損益？

SignalPilot 的目的，就是補齊這四層，同時保留研究系統的可解釋性。

---

## 3. 成功定義

SignalPilot 成功，不等於「AI 猜升跌更準」。成功必須同時滿足：

- 每一筆建議都能追溯到 signal、特徵、模型版本、風控決定和最終 fill。
- Paper portfolio 能按交易日重建現金、持倉及 P&L，帳目差異為零。
- 使用 next-bar open 或真實 fill 評估，不使用 same-bar close 製造不可能成交的回測。
- 模型只在 out-of-sample、扣除成本後仍優於不使用模型的 signal baseline 才可晉級。
- 任何模型失效、資料過期、broker 異常或風險越界都會停止開新倉。
- 自動化程度可以逐級提高，也可以一鍵降級回人工批准或只讀模式。

### 北極星指標

`Net risk-adjusted return of accepted signals vs all eligible signals`，並同時觀察：

- 扣除 spread、slippage、fees 後的 expectancy。
- 相對 SPY alpha、Sharpe、Sortino、最大回撤。
- Precision、coverage、calibration 與 abstain rate。
- Signal 到 order、order 到 fill 的漏斗轉換率。
- Slippage、拒單率、取消率、資料延遲與帳本對帳差異。

任何單一勝率都不能獨立作為上線依據。

---

## 4. 不做甚麼

首階段明確排除：

- 不讓 LLM 直接讀新聞後自由決定買賣及金額。
- 不使用槓桿、孖展、期權、沽空或盤前自動市價單。
- 不以未修正的 earnings 污染資料訓練正式模型。
- 不把模型 confidence 當成預期回報或保證勝率。
- 不在沒有 ledger、reconciliation 與 kill switch 前連接真實資金。
- 不因 UI 顯示了「買入」就視為已成交；只有 broker fill 才改變持倉。
- 不以 LLM 取代 deterministic risk rules。

---

## 5. 系統原則

### 5.1 Real-data-first

研究、模擬與執行共用 canonical market data contract。Mock data 只用於測試和故障演練，不作產品主要路徑。

### 5.2 Deterministic risk, probabilistic selection

- 模型可以輸出 `TAKE`、`SKIP`、`ABSTAIN` 和 calibrated probability。
- 模型不可繞過單股上限、現金儲備、總曝險、事件窗口及資料新鮮度限制。
- 同一輸入、同一模型版本、同一政策版本，必須產生相同決定。

### 5.3 Event-sourced audit trail

Signal、decision、order、fill、cash movement 與 position adjustment 只追加、不覆寫。修正以新事件表示，保留完整歷史。

### 5.4 Fail closed

當資料、模型、broker 或帳本狀態不可信時，停止新開倉；平倉與取消訂單仍保留人工通道。

### 5.5 Promotion by evidence

功能完成不等於可用真錢。每一階段必須通過指定 evidence gate，才能提高自動化權限。

### 5.6 Audit rigor scales with proximity to real money

審計嚴格度與「距離真錢的遠近」掛鈎，避免在純 paper 階段過度工程：

- **Phase 1–3（純 paper、無真錢）**：append-only event log + deterministic replay 即足夠，可用輕量帳本驗證帳目正確。
- **Phase 5+（接 broker / 真錢）**：才要求完整 reconciliation engine、RBAC、嚴格 idempotency 與 server-side audit trail。

原則不變（event-sourced、fail-closed），但實作完整度按 phase 遞增，不在 paper 階段先建用不到的對帳引擎。

---

## 6. 目標架構

```text
Yahoo/Finnhub/Market Data
          |
          v
Daily Snapshot + D1 Signal History
          |
          v
Primary Signal Engine
signalClassifier: side + setup + invalidation
          |
          v
AI Selection Layer
meta-label model: TAKE / SKIP / ABSTAIN + confidence
          |
          v
Deterministic Portfolio & Risk Engine
eligibility + sizing + exposure + cash + event/data guards
          |
          v
Trade Intent -> Approval -> Order Manager -> Broker Adapter
          |                                |
          v                                v
Immutable Decision Log              Orders / Fills / Rejects
          |                                |
          +---------------+----------------+
                          v
                Ledger + Positions + P&L
                          |
                          v
             Reconciliation + Monitoring
```

### 邊界規則

- Signal engine 不知道 broker API。
- AI model 不直接建立 broker order。
- Risk engine 不依賴 LLM 文字輸出。
- Order manager 不自行推測策略意圖。
- Position 只由 fill event 更新，不由 order submission 更新。
- UI 是 control plane，不是 source of truth。

### 執行平面（與現有基建對齊）

現有 Worker 是無狀態、受 subrequest 與 CPU 時限約束的環境；snapshot 管線已因為單次 invocation 只能處理 ~43 隻股而搬去 GitHub Actions。SignalPilot 必須沿用同一邊界，不能假設有 Worker cron：

- **Worker = control plane + 只讀／審批 API。** 提供 candidates、decisions、positions、ledger、approve/reject、kill-switch 端點；不跑長任務、不做盤中輪詢。
- **GitHub Actions（或等效外部批次）= 日終批次引擎。** 產 candidates → meta-label inference → risk decision → trade intent → simulated/broker fill → ledger → reconciliation，全部在日終一次跑完。
- **Exit 為 EOD-only。** Worker + GH Actions 體系做不到可靠的盤中 stop 監控，因此止損、time stop、signal invalidation 一律以收市後重新評估觸發；不承諾 intraday stop（見 §19）。
- **Broker 同步以日終 polling 為主**，不依賴常駐 webhook 接收進程；Phase 5 若需 webhook，需另起可常駐的 receiver，不放 Worker。

---

## 7. AI 的準確角色

「AI 交易」在本計劃中分成兩類，權限完全不同。

### 7.1 Predictive ML：可參與交易決策

首選 LightGBM 或同類 tabular model，作為 meta-label：

- **輸入**：signal 產生當刻已知的特徵。
- **Primary side**：由 `signalClassifier` 決定，例如 `LONG_BOUNCE`。
- **輸出**：`TAKE`、`SKIP` 或 `ABSTAIN`，另帶 calibrated probability。
- **用途**：降低低質 signal 的採納率，或作同日候選排序。
- **限制**：不自行決定突破風控上限的倉位，不直接呼叫 broker。

候選特徵：

- Signal label、tier、regime、sector。
- RSI、RVOL、CLV、CMF、MACD histogram、OBV slope。
- EMA 結構與斜率、ATR、距離 pivot、52 周高位距離。
- 相對 SPY 強度、近期市場 breadth、VIX / liquidity context。
- 距離 earnings 的交易日數、資料品質 flags。
- 當時 portfolio exposure、同 sector 已有曝險。

嚴禁 feature leakage：`ret1d/3d/5d`、MFE、MAE、stop-loss result 等結果欄位只能作 label 或評估，不能作入場時可見 feature。

### 7.2 LLM：只作解釋與操作輔助

LLM 可負責：

- 把 signal、模型與 risk rejection 翻譯成人類可讀理由。
- 生成每日候選摘要和異常報告。
- 回答「為何跳過這一筆？」或「今日曝險在哪裏？」。
- 協助研究假設、產生實驗草案，但不得自動改 production policy。

LLM 不可負責：

- 自由生成 ticker、價格或下單金額。
- 覆蓋 risk engine 的 reject。
- 在沒有結構化 schema validation 下產生可執行 order。
- 把新聞語氣直接轉換為真實交易。

---

## 8. 核心資料契約

以下是概念契約；實作時放入 `src/types/trading.ts` 並版本化。

```ts
type TradeDecision = {
  decisionId: string
  signalId: string
  ticker: string
  side: 'BUY' | 'SELL'
  action: 'TAKE' | 'SKIP' | 'ABSTAIN'
  modelVersion: string
  policyVersion: string
  probability: number | null
  reasonCodes: string[]
  decidedAt: string
}

type TradeIntent = {
  intentId: string
  decisionId: string
  ticker: string
  side: 'BUY' | 'SELL'
  quantity: number
  orderType: 'LIMIT' | 'MARKET'
  limitPrice: number | null
  timeInForce: 'DAY'
  expiresAt: string
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'EXPIRED'
}

type BrokerOrder = {
  orderId: string
  clientOrderId: string
  intentId: string
  broker: 'PAPER' | 'ALPACA' | 'IBKR'
  brokerOrderId: string | null
  status: 'PENDING' | 'ACCEPTED' | 'PARTIALLY_FILLED' | 'FILLED' |
          'CANCELLED' | 'REJECTED'
  submittedAt: string | null
}

type Fill = {
  fillId: string
  orderId: string
  quantity: number
  price: number
  fee: number
  filledAt: string
}
```

另外必須有：

- `Account`：base currency、broker、mode、buying power。
- `CashLedgerEntry`：deposit、withdrawal、trade settlement、fee、dividend、FX。
- `PositionLot`：ticker、quantity、cost basis、openedAt、remainingQuantity。
- `PositionSnapshot`：由 fills/ledger 派生，不作原始真相。
- `RiskDecision`：每一條規則的 pass/reject、輸入值與 policy version。
- `ModelInference`：feature schema hash、model version、probability、latency。
- `ReconciliationRun`：內部帳本與 broker account 的差異及處置狀態。

所有金額以 integer minor units 或明確 decimal handling 儲存，禁止用浮點數作帳本真相。

---

## 9. 交易生命週期

1. 每日 snapshot 產生 signal，建立唯一 `signalId`。
2. 資料品質與 eligibility guard 先排除不可信候選。
3. Meta-label model 輸出 `TAKE/SKIP/ABSTAIN`。
4. Portfolio engine 根據資金與現有曝險計算候選倉位。
5. Risk engine 逐條檢查並產生 `RiskDecision`。
6. 通過者建立 `TradeIntent`；早期必須人工批准。
7. Order manager 加上 idempotency key 後送往 paper broker。
8. Broker 回報 accepted、partial fill、fill、cancel 或 reject。
9. Ledger 只按 fill 更新 cash 與 position lots。
10. 收市後 reconciliation 對比 broker 與內部帳本。
11. 到達止損、時間屏障、signal invalidation 或 exit policy 時建立平倉 intent。
12. 結果回流研究資料，但不可覆寫當時的 feature snapshot。

### Idempotency

`clientOrderId` 必須由 account + intent + revision 生成。重試同一 intent 不可產生第二張新單；修改價格必須先取消原單，再建立新 revision。

---

## 10. 初始交易政策

以下只作 paper-trading 初始值，必須由設定檔版本化，不能散落在 UI：

| 規則 | Paper v0 建議值 |
| --- | --- |
| 允許方向 | Long only |
| 候選 signal | `LONG_BREAK`、`LONG_VCP`、`LONG_BOUNCE` |
| `LONG_BASE` | 只觀察，不入場 |
| 每筆名義金額 | USD 1,500 或 NAV 的 2%，取較低者 |
| 單一股票最大權重 | NAV 5% |
| 單一 sector 最大權重 | NAV 20% |
| 總股票曝險上限 | NAV 60% |
| 最低現金儲備 | NAV 30% |
| 同日新開倉上限 | 5 筆 |
| 財報窗口 | 前後 7 日禁止新倉 |
| 資料新鮮度 | snapshot 超過一個交易日即禁止新倉 |
| 入場基準 | next regular-session bar open；paper fill 加 slippage |
| 訂單 | 首階段 DAY limit；不使用盤前自動市價單 |
| 單筆風險 | 以 entry 到 stop 距離計，最大 NAV 0.5% |
| Exit | ATR stop、signal invalidation、time stop 三者先到先執行 |

Position sizing：

```text
risk_budget = NAV * max_risk_per_trade
risk_per_share = abs(planned_entry - stop_price)
risk_based_qty = floor(risk_budget / risk_per_share)
notional_based_qty = floor(max_trade_notional / planned_entry)
final_qty = min(risk_based_qty, notional_based_qty, exposure_caps_qty)
```

若 stop 不可計算、價格過期或 `final_qty <= 0`，結果必須是 `ABSTAIN`，不能猜測。

---

## 11. Risk Engine 必備規則

### 入場前

- Market calendar 顯示市場開放且不是未知半日市。
- Snapshot、quote、FX rate 均未過期。
- Signal 未過期、未重複使用、ticker 可交易。
- 無 earnings blackout、halt 或 corporate action 未解狀態。
- 不超過單股、sector、總曝險、每日筆數與現金限制。
- 計入 open orders 後仍不超限。
- Limit price 偏離參考價不超過政策容許範圍。
- Model/schema/policy 版本均是 production allowlist。

### 持倉期間

- Stop、time exit、signal invalidation 每日重新評估。
- 部分成交後按真實 quantity 重算曝險。
- Broker position 與內部 position 不一致時停止新倉。
- 每日 loss limit 或 drawdown limit 觸發後，降級為只可減倉。

### Kill switch

以下任何一項自動關閉新開倉：

- Market data stale 或主要資料源失敗。
- Broker API authentication、order status 或 account sync 異常。
- Reconciliation 存在未處理差異。
- 當日拒單率或 slippage 超過政策門檻。
- 模型輸入 schema drift、缺欄或輸出分布異常。
- Daily loss / drawdown 超限。
- 人工 `TRADING_DISABLED=true`。

Kill switch 必須 server-side 生效，不能只隱藏 UI 按鈕。

---

## 12. 回測與模型驗證

### 12.1 先修資料，再訓練

> **樣本量不是瓶頸。** D1 已累積約 74,000 條 signal、跨約 14 個月（2025-04 起）、絕大多數已 settle forward return。過往「等 D1 ≥ 30 天 / 等樣本成熟」的門檻已不適用；唯一真正的前置是**資料品質**（下列 HYP-013／015），不是樣本數。

正式模型訓練前必須完成：

- **HYP-013**：修復 historical earnings contamination。注意這不只是改 code——既有約 74k 樣本的 `earnings_in_window` 全部為 false，修復後必須**重新 backfill 全歷史**，是一次 data migration，不是只修往後。
- **HYP-015**：建立當時可見 universe snapshot，降低 survivorship bias。
- 將 signal-time features 固化，避免用今日資料回填過去。
- 明確 next-bar open、spread、slippage、fees 與未成交規則。**注意：現有 signals 表只存 `close_at_signal`，沒有 open 價**；next-bar open 成交需要先在資料管線加入次一交易日 open 的取得路徑（見 Phase 1）。
- Triple-Barrier 目前以 MFE/MAE 大小近似先後次序；正式評估應加入逐日或 intraday barrier touch order，或把近似誤差列為限制。

### 12.2 Baseline

至少比較：

1. 所有合資格 signal 等額採納。
2. 現有 rule + deterministic risk，不使用 ML。
3. Rule + meta-label threshold。
4. Rule + meta-label ranking，每日 top K。
5. 現金或 SPY benchmark。

### 12.3 Split 方法

- 使用 anchored walk-forward，不作隨機 train/test split。
- 同一 ticker 相鄰樣本不可跨 split 洩漏重疊 forward window。
- Threshold、feature selection、calibration 都只能在 train/validation 決定。
- Final out-of-sample 只評估一次；失敗後不可反覆調整再稱為 OOS。
- 報告按月份、signal label、regime、sector、tier 拆分。

### 12.4 Model promotion gate

模型由 `research` 晉級 `shadow`，最低要求：

- Feature schema 與 leakage audit 通過。
- OOS 扣成本 expectancy 高於 rule-only baseline。
- 至少兩個主要時間切片方向一致，不依賴單月暴利。
- Calibration 可接受；高 confidence 組實際 precision 較高。
- Coverage 不可低到只靠極少樣本製造漂亮結果。
- Earnings、regime、sector subgroup 沒有無法解釋的崩潰。

由 `shadow` 晉級 `paper`，再要求連續至少 20 個交易日 inference 穩定且沒有 schema、latency 或決策重現問題。

---

## 13. 分階段交付

### Phase 0 — Foundation Cleanup

**目標：** 清除會污染模型及交易評估的已知問題。

工作：

- 修復 HYP-013 earnings calendar/backfill。
- 完成 HYP-015 point-in-time universe。
- 定義 canonical quote、market calendar 與 signal-time feature snapshot。
- 建立 execution assumptions 文件及 cost model。
- 為 signal 生成穩定 `signalId`。

**Exit gate：** 歷史資料可重建、無已知 leakage、research report 明示成本與成交假設。

### Phase 0.5 — Auth & Audit Spine

**目標：** 在任何「會改變狀態」的端點上線前，先建立身份與審計骨架。

> **為何獨立成 phase：** 目前 Worker 的 17 個 API 全是公開只讀，repo 內**完全沒有任何 auth / token / CSRF / audit 基建**。§15 的安全要求是 greenfield，不能散在各 phase 默認帶過。一旦 `approve`、`reject`、`kill-switch` 等 mutation 端點上線在公開 Worker，等於任何人都能操作組合。

工作：

- 單一使用者 token（server-side secret，不進前端 bundle / KV snapshot / 日誌）。
- 所有 mutation route 強制驗證 + replay/CSRF protection。
- Server-side `TRADING_DISABLED` flag（存 KV，非只隱藏 UI 按鈕）。
- Append-only audit log：approval、policy change、kill switch、model promotion。

**Exit gate：** 未帶有效憑證無法呼叫任何 mutation 端點；kill switch 在 server 端生效；所有狀態變更都有 audit 記錄。

### Phase 1 — Paper Ledger MVP

**目標：** 不使用 AI，先證明交易帳目與生命週期正確。

工作：

- **擴充資料管線寫入次一交易日 open 價**（現有 snapshot/D1 只有 close）；這是 next-bar open 成交的硬前置。
- 新增 account、trade intent、order、fill、cash ledger、position lot schema。
- 建立 deterministic `PaperBrokerAdapter`。
- 用 next-bar open + configurable slippage 模擬 fills。
- 支援 partial fill、reject、cancel、expired 的測試情境。
- 建立 daily reconciliation 與 NAV/P&L report。
- UI 顯示 proposed、approved、filled、closed 狀態，不混為一談。

**Exit gate：** 任意交易日可由 events 重建相同 cash/positions/P&L；重跑不會重複下單；對帳差異為零。

### Phase 2 — Rule-Only Shadow Portfolio

**目標：** 用現有 signal + risk engine 建立可信 baseline。

工作：

- 只讓已批准 entry labels 建立 intent。
- 實作 sizing、exposure caps、earnings/data guards、exit policies。
- 每日自動生成候選，但不需人工逐筆輸入。
- 記錄 rejected reason codes 與 opportunity cost。
- 建立 strategy、execution、portfolio 三層 attribution。

**Exit gate：** 至少 20 個交易日無帳本或風控錯誤；所有拒絕與成交均可解釋。

### Phase 3 — AI Shadow Mode

**目標：** 訓練 meta-label model，但不影響交易。

工作：

- 建立 feature builder 與 versioned feature schema。
- 訓練、calibrate、walk-forward 評估 LightGBM。
- 每日對所有候選產生 shadow inference。
- 比較 AI take/skip、rule-only 與實際 forward outcome。
- 加入 drift、missing feature、confidence distribution 監控。

**Exit gate：** 通過 model promotion gate；shadow inference 可完整重現。

### Phase 4 — AI-Gated Paper Trading

**目標：** AI 開始影響 paper portfolio，人工批准每張新單。

工作：

- 只有 `TAKE` 且 risk pass 才建立 proposed intent。
- `ABSTAIN` 與所有拒絕理由顯示於 decision log。
- 人工可批准或拒絕，但不可修改成超過 risk cap 的金額。
- 比較 human override 的結果，找出流程或模型盲點。
- LLM 生成每日 briefing，但只引用結構化決策資料。

**Exit gate：** 連續 30–60 個交易日，系統穩定、扣成本優於 rule-only paper baseline，且沒有重大風控違規。

### Phase 5 — Broker Paper Integration

**目標：** 連接真實 broker 的 paper environment，驗證 API 現實。

工作：

- 實作統一 `BrokerAdapter`，首個 provider 選 Alpaca 或 IBKR paper。
- Webhook/polling 同步 order、partial fill、fill、cancel、reject。
- 建立 broker reconciliation、rate-limit、retry、idempotency。
- API secrets 只放 server-side secrets store。
- 故障演練：timeout、重複 callback、斷線、狀態延遲、休市。

**Exit gate：** 至少 30 個交易日 broker paper 對帳零未解差異；重試不產生 duplicate orders。

### Phase 6 — Live Suggestion / Human Approval

**目標：** 使用真實帳戶資料產生建議，由人逐筆批准送單。

限制：

- 初始資金與每筆 notional 採極低上限。
- Long-only、無槓桿、regular hours only。
- 每日與每週 loss limit。
- 每次批准需要顯示 signal、AI、risk、price freshness、exit plan。
- 任何 reconciliation 差異立即停止新倉。

**Exit gate：** 由使用者明確批准是否進入半自動；工程完成不會自動晉級。

### Phase 7 — Limited Automation

**目標：** 只自動化已證明穩定、低風險且定義狹窄的場景。

例如：

- 只交易 allowlist signals。
- 只在 confidence 與 liquidity 高於保守門檻時開倉。
- 單筆、每日、總曝險均採比人工模式更低上限。
- 平倉風控可比開倉更高優先級自動執行。

全自動不是預設終點；若 human-approval 模式已達到產品目標，可以長期停留在 Phase 6。

---

## 14. 建議程式結構

```text
src/
  types/
    trading.ts
    ledger.ts
    model.ts
  engine/
    eligibilityEngine.ts
    positionSizer.ts
    tradingRiskEngine.ts
    exitEngine.ts
    portfolioAccounting.ts
    reconciliationEngine.ts
  trading/
    decisionService.ts
    orderManager.ts
    brokerAdapter.ts
    paperBrokerAdapter.ts
  worker/
    tradingRoutes.ts        # 只讀 + 審批 API（control plane）
scripts/
  ml/
    build_features.py
    train_meta_model.py
    evaluate_walk_forward.py
    export_model.py
  trading/
    dailyBatch.ts           # 日終批次引擎，跑在 GitHub Actions（非 Worker cron）
    reconcile.ts
    replay-ledger.ts
```

> 注意：daily 交易 job 跑在 **GitHub Actions**，不是 Worker cron。Worker cron 已因 subrequest 上限被移除（snapshot 管線同樣搬去 GH Actions）。`tradingRoutes.ts` 只負責只讀 + 審批 API（見 §6 執行平面）。

D1 建議新增：

```text
trading_accounts
trade_decisions
trade_intents
broker_orders
order_events
fills
cash_ledger
position_lots
risk_decisions
model_inferences
reconciliation_runs
strategy_daily_snapshots
```

Migration 必須向前追加，production table 不作破壞式重建。

---

## 15. API 與權限面

初始 API：

- `GET /api/trading/candidates`
- `GET /api/trading/decisions/:id`
- `POST /api/trading/intents/:id/approve`
- `POST /api/trading/intents/:id/reject`
- `POST /api/trading/orders/:id/cancel`
- `GET /api/trading/positions`
- `GET /api/trading/ledger`
- `GET /api/trading/reconciliation/latest`
- `POST /api/admin/trading/kill-switch`

安全要求：

- 所有 mutation route 必須驗證身份、角色與 CSRF/replay protection。
- Approval、policy change、model promotion、kill switch 都寫 audit log。
- Broker credential 不進前端 bundle、KV snapshot、日誌或 model feature。
- Paper 與 live account 使用不同 secrets、account id、資料表 namespace 和醒目 UI 標識。
- Live order endpoint 預設不存在；只有 Phase 6 經明確部署設定才註冊。

---

## 16. 可觀測性與每日報告

### 開市前

- Snapshot 日期與完整度。
- 今日 signals、AI take/skip/abstain 分布。
- Earnings/data/reconciliation blocks。
- 預計新曝險、sector 集中度、現金餘額。

### 交易時段

- Proposed、approved、submitted、partial、filled、rejected 數量。
- Quote age、order latency、slippage、broker errors。
- Kill switch 狀態與觸發原因。

### 收市後

- Broker 與 ledger reconciliation。
- Realized/unrealized P&L、cash、NAV、exposure。
- Strategy alpha、execution slippage、fees、cash drag。
- AI accepted vs skipped 的反事實觀察，但不把未成交候選當成真實 P&L。
- 所有 policy/model/manual override 變更。

---

## 17. 測試策略

### Unit tests

- Position sizing 邊界與 rounding。
- Cash、fees、partial fills、average cost、realized P&L。
- Exposure、earnings、stale data、daily loss guards。
- Idempotency 與 duplicate webhook。

### Property tests

- Cash + positions market value = NAV（容許已定義 rounding tolerance）。
- Filled quantity 不超過 ordered quantity。
- Position quantity 等於所有有效 fills 的淨和。
- 同一 event replay 一次或多次，結果一致。

### Integration tests

- Signal → decision → intent → approval → order → partial fill → fill → ledger。
- Reject、cancel、expire、broker timeout、out-of-order callback。
- Kill switch 後不可建立新 opening order，但可取消及減倉。

### Replay tests

- 以固定歷史資料重播一個完整交易月。
- 每次 build 的 decisions、orders、ledger hash 應一致；模型版本改變時例外但需明示 diff。

---

## 18. 主要風險與對策

| 風險 | 對策 |
| --- | --- |
| 回測 leakage | point-in-time features、walk-forward、feature allowlist |
| Earnings 污染 | HYP-013 修復列為 Phase 0 blocker |
| Survivorship bias | HYP-015 universe snapshot |
| 模型過度擬合 | baseline、OOS、subgroup、calibration、coverage gate |
| Same-bar execution | next-bar open 或真實 fill；加入成本與未成交 |
| LLM hallucination | LLM 無下單權；結構化資料與 schema validation |
| Duplicate orders | idempotent client order id + immutable intent revision |
| Partial fill accounting | fill-level ledger 與 lot accounting |
| Broker/API failure | retries、reconciliation、kill switch、人工取消通道 |
| 風控設定漂移 | versioned policy + approval + audit log |
| Paper/live 混淆 | 分離 credentials、namespace、UI、deployment flag |
| 模型 drift | feature/output monitoring、shadow fallback、model rollback |

---

## 19. 決策記錄

### 已採納

- 保留 rule-based signal 作 primary direction。
- Meta-labeling 是第一個 ML production candidate。
- LLM 不在 order authority chain 內。
- 先 ledger，再 broker；先 paper，再 live。
- 風控使用 deterministic code 與 versioned policy。
- 初始 long-only、regular hours、無槓桿。
- **Exit 為 EOD-only**：CF Worker + GH Actions 體系無法可靠做盤中 stop 監控，止損／time stop／invalidation 一律收市後重評估。
- **交易執行平面**：Worker = 只讀 + 審批 control plane；日終批次跑 GitHub Actions（無 Worker cron）。

### 尚待決定

- 第一個 broker paper adapter：Alpaca 或 IBKR。
- 帳戶 base currency：USD-only MVP，或首版同時支援 HKD/FX ledger。
- Tax lot 方法：FIFO 或 broker-reported lots。
- Model serving：Python service、離線批次 inference，或導出到 Worker 可執行格式。

這些選擇會影響架構，不應在實作中默認帶過；應在相應 Phase 開始前寫 ADR。

---

## 20. 建議立即執行順序

> **關鍵認知：樣本量已足夠（~74k 條、~14 個月），瓶頸只在資料品質。** HYP-013／015 只 block ML 訓練（Phase 3），**不** block ledger（Phase 1）與 rule-only baseline（Phase 2）——後兩者不碰 earnings feature，因此可與資料修復**並行**，縮短關鍵路徑。

1. 把本文件加入 `ROADMAP.md`，列為獨立 **SignalPilot Track**。
2. 先做 **Phase 0.5 Auth & Audit Spine**，作為任何 mutation 端點的硬前置。
3. 並行兩條線：
   - **資料線**：完成 HYP-013（含全歷史重 backfill）與 HYP-015，凍結可信訓練資料契約。
   - **工程線**：實作 Paper Ledger MVP（含 next-open 資料路徑）→ 用現有 signals 跑 Rule-Only Shadow Portfolio 建立乾淨 baseline。兩者不等資料線。
4. 資料修復達標後，完成 meta-label model 的 walk-forward 訓練。
5. AI 先進 shadow，再進 gated paper；不跳級連 broker live。

### 第一個工程里程碑

**SP-001 — Auditable Paper Trade**

> **前置：**（a）資料管線已寫入次一交易日 open 價（Phase 1）；（b）append-only ledger + replay 已就緒。兩者是 SP-001 能跑出「next-open 成交 + 可重播」的硬依賴。

輸入一個既有 signal，系統能自動：

```text
signal
  -> deterministic eligibility/risk decision
  -> proposed USD 1,500 trade intent
  -> paper order
  -> simulated fill at next regular-session open + slippage
  -> cash/position ledger
  -> current P&L and full audit trail
```

驗收重點不是畫面，而是同一筆交易可以從 signal 一路追溯至 fill 與 P&L，並可重播得到完全相同結果。

---

## 21. 最終產品形態

SignalPilot 的理想操作不是「問 AI 明天買甚麼」，而是每天提供一份有邊界、可核查的決策清單：

- **方向：** 哪個既有 signal 出現？
- **選擇：** AI 為何 TAKE、SKIP 或 ABSTAIN？
- **風險：** 最多可做多少，哪條規則限制了它？
- **執行：** 建議價格、訂單狀態、實際成交和 slippage 是甚麼？
- **退出：** 止損、失效條件與最長持有期是甚麼？
- **結果：** 收益來自 signal、選擇、執行，還是市場 beta？

當這六個問題都有結構化答案，系統才真正由「訊號展示」進化成「AI 輔助交易操作平台」。
