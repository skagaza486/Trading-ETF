# SignalPilot Roadmap（執行追蹤）

> 🔵 **UN-LIVE 通知（2026-06-25）：** 因應 Capital Manager REVAMP，
> **`signalpilot` worker 已 undeploy，`signalpilot-daily.yml` 已改為 dispatch-only（停止自動跑）。**
> Code、config、`signalpilot-db`、`SP_CONTROL_KV` 全部保留 repo，隨時可由
> `git checkout baseline/pre-revamp -- signalpilot/ wrangler.signalpilot.toml` + `npm run sp:deploy` 復活。
> **不投工程、不改動、不部署。** 詳見 [`docs/planning/REVAMP_PLAN.md`](docs/planning/REVAMP_PLAN.md) §2 UN-LIVE。
>
> ❄️ **舊凍結通知（2026-06-24）：** 因應個人資本管理 pivot，**SP-5→SP-8 無限期暫停**。（仍有效，現升級為 UN-LIVE）

> **狀態：** Active v1.0 · 建立 2026-06-23
> **規格來源：** [`SIGNALPILOT_AI_TRADING_PLAN.md`](SIGNALPILOT_AI_TRADING_PLAN.md)（本文件只負責里程碑、排序、依賴與進度；設計理由看 plan）
> **產品線：** 獨立於 `trading-etf` web app 的交易決策／執行系統。

---

## 0. 架構邊界決定（ADR-SP-000）

SignalPilot 是**獨立服務邊界 + 共用唯讀資料層**，不是獨立產品、不另開 repo。

| 維度 | 決定 |
| --- | --- |
| Git repo | 同一 monorepo（共用 `src/engine/signalClassifier.ts` + `src/types/` 作 library） |
| Worker | **新 Worker `signalpilot`**（獨立 `wrangler.signalpilot.toml`、獨立 auth、獨立 secrets） |
| D1 — 讀 signal | 唯讀綁定現有 `trading-etf-db` |
| D1 — 交易表 | **新 `signalpilot-db`**（ledger / intents / orders / fills / positions / risk / inferences / reconciliation） |
| 每日批次 | 新 GH Actions `signalpilot-daily.yml`（無 Worker cron） |
| Exit 執行 | EOD-only（CF + GH Actions 做不到可靠 intraday stop，見 plan §6） |

**為何分離：** ① 公開唯讀 app 不能與動錢的 mutation 端點 + broker 憑證同 Worker；② UI 快速迭代 vs 交易需審計級穩定，釋出風險檔次不同；③ fail-closed 隔離互不拖垮。

---

## 1. 分工與跨線依賴

| 線 | 負責 | 範圍 |
| --- | --- | --- |
| `trading-etf`（現有 app） | **Claude + 接班 AI**（GPT 已離線 2026-06-24） | UI、signal 引擎、資料管線（HYP-013 ✅、HYP-015 ✅ A-lite）— 見 [`docs/HANDOFF_GPT.md`](docs/HANDOFF_GPT.md) |
| SignalPilot（本 roadmap） | Claude / 用戶 | 交易決策、ledger、risk engine、broker adapter、meta-label ML |

**交接依賴（已解除）：** HYP-013 ✅（earnings 3.16%）+ HYP-015 ✅ A-lite（PIT universe 2025-04→2026-06）均已完成。SP-3/SP-4 的資料前置不再阻塞。

---

## 2. 里程碑地圖

| ID | 名稱 | 對應 plan phase | 動錢距離 | 依賴 |
| --- | --- | --- | --- | --- |
| **SP-0** | Auth & Audit Spine | Phase 0.5 | — | 無 |
| **SP-1** | Paper Ledger MVP（含 SP-001 可審計交易） | Phase 1 | paper | SP-0 |
| **SP-2** | Rule-Only Shadow Portfolio | Phase 2 | paper | SP-1 |
| **SP-3** | Feature Builder + 資料契約凍結 | Phase 3（前半） | — | GPT: HYP-013/015 |
| **SP-4** | AI Shadow（meta-label 訓練 + 評估） | Phase 3（後半） | paper | SP-2, SP-3 |
| **🚦 GATE-EDGE** | **edge 驗證閘**：修正污染+倖存者+多重檢定後，excess return 仍正且顯著嗎？ | 治理閘 | — | P0 ✅ + P1 ✅(A-lite) + P4 ✅ → **v1 ITERATE（p=0.085）**；v2 待 2026-08+ |
| **SP-5** | AI-Gated Paper Trading（人工逐筆批准） | Phase 4 | paper | **GATE-EDGE** |
| **SP-6** | Broker Paper Integration（Alpaca/IBKR paper） | Phase 5 | paper(broker) | SP-5 |
| **SP-7** | Live Suggestion / Human Approval | Phase 6 | **真錢** | SP-6 + 用戶明確批准 |
| **SP-8** | Limited Automation（窄場景） | Phase 7 | 真錢 | SP-7 穩定後 |

> **🔒 凍結令（2026-06-23）：** `SP-5→SP-8` 全部 **BLOCKED until GATE-EDGE passes**。P0 ✅ + P1 ✅(A-lite) + P4 ✅ 前置已達；**GATE-EDGE v1 已跑（2026-06-23），裁決 ITERATE（p=0.085，mean=+1.38%，未達顯著）**。下一次 = GATE_EDGE_v2.md，等 2026-08+ n≥100。詳見 [`ROADMAP.md`](ROADMAP.md) · [`GATE_EDGE.md`](GATE_EDGE.md) §12。**工程完成不自動晉級。**

---

## 3. 關鍵路徑與並行

```text
SP-0 ──► SP-1 ──► SP-2 ─────────────┐
                                     ├─► SP-4 ──► 🚦GATE-EDGE ──► SP-5 ─► SP-6 ─► SP-7 ─► SP-8
HYP-013 ✅ + HYP-015 ✅(A-lite) ──► SP-3 ┘   🚦 GATE-EDGE v1 ITERATE → v2 待 2026-08+；🔒 SP-5+ BLOCKED
        （資料線，與 SP-1/SP-2 並行）
```

- **資料線** 與 **工程線（SP-1/SP-2）** 並行，互不阻塞 → 縮短關鍵路徑數週。
- SP-4 是匯流點：需要 SP-2 的乾淨 baseline + SP-3 的乾淨 features 同時就緒。
- **🚦 GATE-EDGE 係新增嘅硬閘**：SP-4 之後**不自動進 SP-5**。需先用 pre-registered writeup 證明 edge（修正倖存者偏差 P1 + holdout P4 後仍正且顯著）。前置缺一不可。
- SP-7 之後**不自動晉級**；進真錢需用戶明確批准。

---

## 4. Phase 追蹤

### SP-0 — Auth & Audit Spine　🟡 程式碼完成，待 provisioning + deploy 驗收

**Exit gate：** 無有效憑證無法呼叫任何 mutation 端點；kill switch server-side 生效；所有狀態變更有 audit 記錄。

- [x] 新 Worker `signalpilot` skeleton + `wrangler.signalpilot.toml`（`signalpilot/`，獨立 tsconfig + 真 typecheck，dry-run bundle 通過）
- [x] 單用戶 token middleware（`SP_AUTH_TOKEN` secret、constant-time 比對、不進 bundle/KV/日誌）
- [x] 所有 mutation route 強制驗證 + replay 保護（timestamp window + 單次性 nonce；CSRF 因非 cookie bearer 不適用，已記錄）
- [x] server-side `trading_disabled` flag（D1 control_flags 為真相 + KV 鏡像；**fail-closed**，預設停用）
- [x] append-only **hash-chained** `audit_log` 表 + 鏈完整性驗證（`/api/audit` 回 `chain.ok`）
- [x] **provisioning（已完成 2026-06-23）：** `signalpilot-db`（`095a9cf7`）+ `SP_CONTROL_KV`（`feedaa9c`）建立，schema 套用，`SP_AUTH_TOKEN` 已設，Worker 部署至 `https://signalpilot.skagaza486.workers.dev`
- [x] **線上 smoke test 通過（2026-06-23）：** 無 token→401、resume→`tradingDisabled:false`、replay→409、kill→disabled、preflight→423、`chain.ok=True`（4 rows）

### SP-1 — Paper Ledger MVP　✅ Exit gate met（2026-06-23）

**Exit gate：** 任意交易日可由 events 重建相同 cash/positions/P&L；重跑不重複下單；對帳差異為零。✅

- [x] **資料前置：** `signals.next_open` 欄位由 GPT 補上（schema ✅、API ✅、backfill ~22% 進行中）；PaperBrokerAdapter 以 `close_at_signal` 作 fallback
- [x] **ADR-SP-002 決定（2026-06-23）：** USD-only MVP。無 FX conversion。
- [x] **ADR-SP-003 決定（2026-06-23）：** FIFO tax lots。最常見美國預設、具決定性。
- [x] `signalpilot-db` schema：accounts / trade_intents / broker_orders / order_events / fills / cash_ledger / position_lots / reconciliation（8 張表，`schema/signalpilot-sp1.sql` 已套用）
- [x] deterministic `PaperBrokerAdapter`（`signalpilot/lib/brokers/paper.ts`：next_open + 10bps slippage；fallback close_at_signal）
- [x] 金額以 integer minor units 儲存（cents；禁浮點作帳本真相）
- [x] **SP-001 端到端路由（`POST /api/sp1/intent`）：** signal → eligibility stub → size（$1k notional）→ cash check → paper fill → cash_ledger → position_lots → audit_log
- [x] 讀取端點：`GET /api/sp1/account`（餘額）、`GET /api/sp1/positions`（倉位）、`GET /api/sp1/ledger`（帳本）
- [x] Worker 已部署（2026-06-23 v106856e6）；D1 seed：paper-001 帳戶 $100,000
- [x] **E2E smoke test 驗收（2026-06-23）：** ANET LONG_BOUNCE approved / URI POSITION_TOO_SMALL rejected / audit chain.ok=true（8-step smoke test 全通過；idempotency guard + `return await` fix deployed）
- [ ] partial fill / reject / cancel / expired 測試情境（SP-2）
- [ ] daily reconciliation + NAV/P&L report（SP-2）

### SP-2 — Rule-Only Shadow Portfolio　✅ Exit gate met（2026-06-23）

**Exit gate：** ≥20 個交易日無帳本或風控錯誤；所有拒絕與成交可解釋。✅

- [x] `eligibilityEngine` + `positionSizer` + `tradingRiskEngine` + `exitEngine`（`signalpilot/lib/sp2/`）
- [x] 只有 plan §10 allowlist labels（LONG_BREAK/VCP/BOUNCE）建立 intent（`sp2/policy.ts`）
- [x] exposure caps / earnings / stale-data guards（EOD 重評估 exit）
- [x] 每日自動產候選 + 記錄 rejected reason codes（`candidate_decisions` 表 + `recordDecision()`）
- [x] versioned policy 設定檔（`SP2_POLICY v1.0.0`，不散落 UI）
- [x] `POST /api/sp2/batch`（token + replay + kill-switch + audit）、`GET /api/sp2/candidates`、`GET /api/sp2/portfolio`
- [x] `schema/signalpilot-sp2.sql` 套用（`strategy_daily_snapshots` + `candidate_decisions` + `atr_at_entry`/`sector` columns）
- [x] GH Actions `signalpilot-daily.yml` + `scripts/trading/sp2DailyBatch.ts`（2026-06-23 部署 f96f0ad1）
- [x] **idempotency guard（2026-06-23）：** `batchFlow.ts` exit + entry path 均加入 `meta.changes===0` 檢查（`DUPLICATE_INTENT` code）；`exitedTodayTickers` Set 防同日重入
- [x] **22-date historical backfill（2026-06-23）：** `scripts/trading/sp2Backfill.mjs` 跑完 2025-09-22 至 2026-03-27 共 22 個交易日，零帳本錯誤 → Exit gate met
- [ ] strategy / execution / portfolio 三層 attribution（資料持續累積中）

### SP-3 — Feature Builder + 資料契約凍結　🟡 部分解鎖（HYP-013 ✅，HYP-015 待補）

**Exit gate：** feature schema 版本化、leakage audit 通過、signal-time features 固化。

- [x] ~~HYP-013 earnings~~ ✅：SEC Edgar 8-K 替換 Finnhub（**production 實測 3.12%，74,043 settled / 2,308 flagged，2026-06-23**；舊文檔講 0.02% 已過時）— P0 達標
- [ ] **⛔ HYP-015 point-in-time universe（假覆蓋，未解）**：`watchlist_universe_snapshots` 有 15 個月（2025-04→2026-06）**但每月都係今日 299 隻倒蓋**——2025-04 vs 2026-06 成員**零差異** = survivorship bias 完全未除。**有 row ≠ 有 point-in-time 成員歷史**。需真正重建歷史成員變動 — GATE-EDGE 之 P1 前置
- [x] `scripts/ml/feature_schema.json`：frozen feature contract v1.0.0，含 leakage blocklist + 30 at-signal-time features
- [x] `scripts/ml/build_features.py`：reads signals CSV → expands `indicators_json` → enforces blocklist → outputs versioned parquet + meta sidecar
- [x] `scripts/ml/leakage_audit.py`：validates any feature file against blocklist（exit 1 on leakage）
- [x] **leakage fix in `label.py`**：`feature_cols()` was including `ret1d/mfe5d/mae5d` — replaced with at-signal-time only
- [ ] 凍結 next-bar open / spread / slippage / fees 假設（SP-4 前確認）
- [ ] sector / industry 欄位（pending HYP-015）

### SP-4 — AI Shadow Mode　✅ pipeline 可重現（首模型 promoted）；⚠️ edge 未證

> **誠實定性（2026-06-23）：** 呢度個 ✅ 指 **pipeline 端到端可重現 + promotion gate 機制運作**，**唔係**指 ML 加到 alpha。**當前 promoted 模型：`model_v1.0.1_ef58f809`**（supersedes `8aa032a3`，promoted 2026-06-23T02:49Z）；threshold=0.48；OOF AUC=**0.554**（153 signals，PIT universe）；precision@take=0.427 vs always-take 0.399（+2.8pp）；422 樣本 / 33 features，overfitting 風險高；訓練數據仲帶 P1 倖存者偏差（HYP-015 A-lite 已注入但 delisting bias 仍存）。**呢個係腳手架里程碑，唔可當 edge 證據。** edge 真偽留待 GATE-EDGE 裁決。
>
> ⚠️ **D1 `sp4_model_registry` 仍只有 `8aa032a3` 那行**（首次 seed 後未更新）。`models/promotion_ef58f809.json` + `CLAUDE.md` 係 promoted 版本真相來源。如需補錄 D1，需另跑 `POST /api/sp4/model`。

**Exit gate：** 通過 model promotion gate（plan §12.4）；shadow inference 可完整重現。✅（注意：此 gate 只證 pipeline，不證 edge）

- [x] LightGBM 訓練 + calibrate + anchored walk-forward（`scripts/ml/train_lgbm.py`）
- [x] 5 條 baseline 比較（`scripts/ml/baselines.py`：B0 always-take / B1 always-pass / B2 prior / B3 logreg / B4 RF）
- [x] model promotion gate（`scripts/ml/evaluate.py`：AUC/precision/brier vs baselines + last-2-fold check）
- [x] `POST /api/sp4/shadow`（ingest inferences）、`GET /api/sp4/shadow`（read）、`POST /api/sp4/model`（register）
- [x] `schema/signalpilot-sp4.sql`：`sp4_model_registry` + `sp4_shadow_inferences`（套用 2026-06-23，14 tables）
- [x] `scripts/ml/shadow_inference.py`：loads promoted model → scores signals → POSTs to Worker；含 drift alert
- [x] GH Actions `sp4-shadow` job（`signalpilot-daily.yml`）：runs after sp2-batch；skips if no promotion_*.json
- [x] ADR-SP-004 決定：offline batch（GH Actions Python）→ Worker endpoint → D1
- [x] **SP-4 historical indicator backfill（2026-06-23）：** 419/422 signals 補齊所有 indicators（3 PSTG 跳過，已退市）
- [x] **首次模型訓練 + promote（2026-06-23）：** `model_v1.0.0_8aa032a3`；422 signals；33 features；triple-barrier k=1.5；OOF AUC=0.579 vs LogReg 0.496；precision@take=0.462 vs AlwaysTake 0.425；全 4 項 gate checks 通過（已被 v1.0.1 supersede）
- [x] **v1.0.1 retrain + promote（2026-06-23）：** `model_v1.0.1_ef58f809`；153 signals（PIT universe）；33 features；threshold=0.48；OOF AUC=0.554 vs LogReg 0.470（+0.02）；precision@take=0.427 vs AlwaysTake 0.399（+0.02）；全 4 項 gate checks 通過；`models/promotion_ef58f809.json` 記錄
- [x] **shadow inference 上線：** `sp4_model_registry` 已 seed；GH Actions `sp4-shadow` job 從今日起每夜跑；`sp4_shadow_inferences` 累積中
- [x] **ML 迭代策略確認：** 用歷史 OOF 資料持續優化（不等 live shadow 資料）；下一步：feature importance 剪枝 → threshold sweep → retrain
- [ ] **下一 iteration：** feature importance 分析 → 砍 noise features → retrain → OOF 評估
- [ ] LOWER barrier 分析（目前 0% LOWER labels，k=1.5 可能過寬）
- [ ] sector/industry features（pending HYP-015）→ retrain v1.1.0
- [ ] drift / confidence-distribution 監控（框架已內建，待真實資料觀察）
- [ ] research → shadow 晉級審查（SP-5）

### SP-5 — AI-Gated Paper Trading　🔒 BLOCKED

> ⛔ **BLOCKED — 需 GATE-EDGE 通過先解鎖（見 §2/§3）。** edge 未證之前，唔好把工程資源倒落呢層。

**Exit gate：** 連續 30–60 個交易日穩定、扣成本優於 rule-only paper baseline、無重大風控違規。

- [ ] 只有 `TAKE` + risk pass 才建 proposed intent
- [ ] decision log 顯示 ABSTAIN + 所有拒絕理由
- [ ] 人工批准/拒絕（不可改成超 risk cap 金額）
- [ ] human override 結果分析
- [ ] LLM 每日 briefing（只引用結構化決策資料，無下單權）

### SP-6 — Broker Paper Integration　🔒 BLOCKED

> ⛔ **BLOCKED — 需 GATE-EDGE 通過先解鎖（見 §2/§3）。**

**Exit gate：** ≥30 個交易日 broker paper 對帳零未解差異；重試不產生 duplicate orders。

- [ ] 統一 `BrokerAdapter`，首 provider = **Alpaca 或 IBKR paper（待 ADR）**
- [ ] order/fill/cancel/reject 同步（日終 polling 為主）
- [ ] broker reconciliation + rate-limit + retry + idempotency
- [ ] secrets 只放 server-side store
- [ ] 故障演練：timeout / 重複 callback / 斷線 / 狀態延遲 / 休市

### SP-7 — Live Suggestion / Human Approval　🔴 真錢 · 🔒 BLOCKED

> ⛔ **BLOCKED — 需 GATE-EDGE 通過 + 上游 SP-5/SP-6 完成 + 用戶明確批准（三重閘）。** 真錢階梯，最高戒備。

**Exit gate：** 用戶明確批准進入半自動；工程完成不自動晉級。

- [ ] 極低初始資金 + 每筆 notional 上限；long-only、無槓桿、regular hours
- [ ] 每日/每週 loss limit
- [ ] 每次批准顯示 signal / AI / risk / price freshness / exit plan
- [ ] live order endpoint 預設不存在，只經明確部署設定註冊（plan §15）

### SP-8 — Limited Automation　🔴 真錢 · 🔒 BLOCKED

> ⛔ **BLOCKED — 需 GATE-EDGE 通過 + SP-7 穩定。** 全自動非預設終點。

**Exit gate：** 只自動化已證明穩定、低風險、定義狹窄的場景。

- [ ] allowlist signals only + 保守 confidence/liquidity 門檻
- [ ] 比人工模式更低的單筆/每日/總曝險上限
- [ ] 平倉風控可比開倉更高優先級自動執行

> 全自動不是預設終點；若 SP-7 已達產品目標，可長期停留。

---

## 5. 待決 ADR（各 phase 開始前必須寫）

| ADR | 問題 | 何時決 |
| --- | --- | --- |
| ADR-SP-001 | 第一個 broker paper adapter：Alpaca vs IBKR | SP-6 前 |
| ADR-SP-002 | 帳戶 base currency：USD-only MVP vs HKD/FX ledger | SP-1 前 |
| ADR-SP-003 | Tax lot 方法：FIFO vs broker-reported | SP-1 前 |
| ADR-SP-004 | Model serving：Python service vs 離線批次 vs 導出 Worker 格式 | SP-4 前 |

（plan §19「尚待決定」的 intraday-vs-EOD 已定為 **EOD-only**，不再是 open question。）

---

## 6. 立即下一步

1. ~~把本 roadmap 連同 plan 列為獨立 **SignalPilot Track**~~（已建文件）。
2. 通知 GPT 把 **HYP-013 + HYP-015** 列為 `trading-etf` 線的優先項（見 `docs/HANDOFF_GPT.md`）。
3. **SP-0 程式碼已完成**（`signalpilot/` + `wrangler.signalpilot.toml` + `schema/signalpilot-init.sql`，typecheck/bundle 通過）。剩 **provisioning + deploy + 線上 smoke test** 收 exit gate——步驟見 [`signalpilot/README.md`](signalpilot/README.md)（建 D1/KV、套 schema、設 `SP_AUTH_TOKEN`、`npm run sp:deploy`）。⚠️ 會建立雲端資源，需用戶明確執行。
4. SP-0 收尾後接 **SP-1**（含 next-open 資料路徑 + SP-001 端到端）。
