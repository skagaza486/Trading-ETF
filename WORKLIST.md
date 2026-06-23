# 長線工作清單（Web App + SignalPilot）

> ⚠️ **方向已轉變（2026-06-24）：個人資本管理 pivot。** 現行 backlog 與任務分配見
> [`docs/planning/EXECUTION_PLAN.md`](docs/planning/EXECUTION_PLAN.md)（§4 兩線執行）＋
> [`docs/planning/MULTI_AI_WORKFLOW.md`](docs/planning/MULTI_AI_WORKFLOW.md)（§2 任務矩陣）。
> **本文件以下為舊 SaaS 方向 backlog，屬歷史紀錄、已被取代**（保留未刪除）。

> **建立：** 2026-06-23 · **治理來源：** [`ROADMAP.md`](ROADMAP.md) 北極星與決策閘（P0–P5）
> **本檔角色：** 跨兩條產品線嘅單一 backlog。**排序、阻塞、依賴**以此為準；設計理由看各自 roadmap / plan。
>
> **接班 AI 讀取順序：** `CLAUDE.md`（sprint 狀態）→ 本文件（backlog）→ `docs/HANDOFF_GPT.md`（任務範圍 + 禁區）  
> **完成任何項目後：** 在對應行打 `[x]` + 日期，不要另開文件記錄。

---

## 0. 點用呢份清單

- **治理鐵律：** 資源優先序永遠係 **數據真相（P0）→ 倖存者修正（P1）→ edge 驗證（P2/GATE-EDGE）→ 下游執行（SignalPilot SP-5+）**。閘未過，唔好把工程倒落下游。
- **狀態符號：** ✅ 完成 · 🟡 進行中 · ⬜ 未開始 · ⛔ BLOCKED（被閘擋）· 🔒 政策凍結 · 🧊 明確延後（Phase 4+）
- **每個項目標依賴**（`← 依賴 X`）同**所屬閘**（`[Pn]`）。
- 完成一項就剔格 + 更新對應 roadmap，**唔好喺度同 roadmap 各記一份數**（避免 doc drift）。

---

## 1. 🎯 關鍵路徑：解鎖 GATE-EDGE（跨線最高優先）

> 呢五項係而家真正卡住一切嘅瓶頸。做完先有資格問「到底有冇 edge」。

- [x] **P0 數據真相** — earnings 污染解除（production 3.12%，74,043/2,308 實測）`[P0]` ✅
- [ ] **P1 真 point-in-time universe** `[P1]` 🟡 **選定：A-lite（S&P500 PIT + Yahoo 存活股）**
  - [x] 查證假覆蓋成因 — 15 月快照係今日 299 隻倒蓋（成員零變動）
  - [x] ⚠️ **發現 provenance 死結**：信號史 2025-04→2026-06 早過 repo 出生（2026-06-17）；watchlist 係手揀贏家名單（inclusion bias）→ 偏差**無法由 git / 內部資料修復**
  - [x] **選項拍板（2026-06-23）**：A-lite — S&P500 Wikipedia 歷史成員 + Yahoo（無退市價格）
  - [x] `scripts/ml/build_pit_sp500.py` 建立 — Wikipedia PIT 產生器，dry-run ✅（503 現成員，28 個範圍內異動）
  - [x] `scripts/localResearchBackfill.ts` 加 `--pit` flag — 從 D1 讀 PIT 成員，按 `signal_date` 過濾信號
  - [x] **Step 1 — 生成 PIT JSON**：`python3 scripts/ml/build_pit_sp500.py --out data/pit_sp500_snapshots.json`
  - [x] **Step 2 — 注入 D1**：`INGEST_TOKEN=... node scripts/backfillUniverseSnapshotsFromGit.mjs --merge-file data/pit_sp500_snapshots.json --apply`
  - [x] **Step 3 — PIT backfill**（~530 tickers × 2y Yahoo）：完成
  - [x] **Step 4 — 重跑 export + label**：`export_signals_d1.mjs` → `label.py`
  - [x] **Step 5 — 確認 research-health** coverage 已更新（universe 由 299 擴至 ~530 PIT tickers）
  - ⚠️ **A-lite caveat**：除 inclusion bias（最大問題）；**未除 delisting bias**（SPLK/ATVI/FRC 等無法取價）。GATE-EDGE PASS 須附此 caveat，唔得用作真錢晉級充分理由。
- [ ] **P4 holdout set** `[P4]` ⬜
  - [ ] 切一段時間（或一批 ticker）做**永不觸碰** holdout，凍結直到 GATE-EDGE 最終測試
  - [ ] 記錄 holdout 定義喺版本化檔，防止事後偷睇
- [x] **P2 GATE-EDGE 已執行（2026-06-23）** `[P2]` 🟡 **裁決：ITERATE**（[`GATE_EDGE.md`](GATE_EDGE.md) §12）
  - [x] 預登記模板：假設 / 統計方法 / 決策規則框架已落 [`GATE_EDGE.md`](GATE_EDGE.md)
  - [x] 門檻/方法已鎖定（§11 簽核 2026-06-23，commit c025fe8）
  - [x] `scripts/ml/gate_edge.py` 已實作（block-bootstrap + BH 校正 + ML overlay）
  - [x] holdout 最終測試：p=0.085（未達 0.05），mean=+1.38%，ITERATE。結果 → `models/gate_edge_result.json`
  - [x] LOWER label 拖累根因分析 ✅ 2026-06-24 — `docs/research/LOWER_LABEL_ANALYSIS.md`；結論：k=1.5 正確，LOWER 是真實輸家，需 ML 過濾
  - [x] `GATE_EDGE_v2.md` 草稿 ✅ 2026-06-24 — 策略改為 ML-filtered UPPER-only；鎖定條件：ML v1.0.2 promoted + 2026-08+ n≥100
  - **下一 gate（GATE_EDGE_v2.md）**：🔴 等 ML v1.0.2 promotion（fold 4 n≥~40）+ 2026-08+ 樣本（n≥100）後鎖定 §11
- [ ] **P3 維持 SignalPilot 凍結** `[P3]` 🔒 — GATE-EDGE 未過前，SP-5→SP-8 唔開工

---

## 2. Web App（`trading-etf`）線

### 2A 資料完整性 & 研究紀律（最高，餵養 GATE-EDGE）

- [ ] HYP-015 真 point-in-time 重建（見 §1，跨線共用）`[P1]`
- [ ] Shorts 重啟評估 — SHORT_* 因 2024–26 牛市樣本凍結；待見到一段 drawdown regime 先重評區分力 ⬜
- [ ] 牛市依賴體檢 — 量化所有 gate 喺 neutral / risk_off regime 嘅表現（而家幾乎全牛市樣本）⬜
- [ ] LONG_BREAK 樣本飢餓結構解 — 每股 ~0.15 訊號/250bars，n=100 需 ~800 股；評估 S&P500 server-side 擴充（B1 架構）`← Phase 3 B1` ⬜
- [ ] EXPERIMENT_LOG 紀律 — 每次訓練/實驗前後讀寫 `models/EXPERIMENT_LOG.md`，防重覆失敗實驗 🟡

### 2B Signal engine 深化（GATE-EDGE 後先大投入）

- [ ] R1 Breadth regime 升級（`proxyWeakBreadth` → 正式 regime enum）← I1 live 證明有用後 🧊
- [ ] R2 ETF conditional routing（不同 regime 不同 scoring）← R1 後 🧊
- [ ] R6 FRED 簡化濾網（liquidity slope/warning 作 regime note）← B1+ cron 穩定後 ⬜
- [ ] HYP-022 ADX 區分力 — 非牛市或更長跨度重新評估 ← 需更多樣本 🧊
- [ ] AVOID_DISTRIBUTION（Wyckoff）— 現為 patternTag，待 Gate 驗證先入 classifier ⬜

### 2C UI / 產品（受研究結論約束，唔好走在驗證前）

- [x] 詳情頁 / 研究室持續打磨（現 UI 2.0 已上線）✅ 2026-06-24 — uncommitted UI files reviewed, tsc passed, deployed
- [x] 把「edge 未證」嘅誠實狀態反映落 UI 文案（避免對長者用戶過度承諾）✅ Onboarding 已明示「研究工具 / edge 尚未證實」；Discover 機會佇列保留「訊號是研究起點，不是買賣指令」
- [ ] 港股 onboarding — 維持鎖定「即將推出」，直到有真實覆蓋 🔒
  - [x] HK-0 copy honesty — onboarding / 入口文案明示「目前未有足夠真實覆蓋，暫未開放」
  - [ ] HK-1 coverage definition — 定義港股 universe / ticker schema / 資料來源 / research-health 指標
  - [ ] HK-2 internal validation — 先做內部 coverage smoke test，不解鎖 onboarding
  - [ ] HK-3 release gate — 只有當 coverage、關鍵頁面可用、限制文案齊備，先可解除「即將推出」
- [x] ETF metadata bundle hygiene — `src/web` 改用 `useEtfMeta()` lazy import，production build 已確認 `dist/index.html` 無 preload `etfUniverse`；legacy `src/App.tsx` 暫維持研究流程依賴

### 2D 資料管線 robustness

- [ ] Yahoo 限流韌性 — manual trigger 仍 ~43 股上限；評估 chunk 化（如 `runBackfillChunk`）⬜
- [x] 每日 snapshot 監控 — GH Actions `snapshot.yml` 失敗告警 ✅ 2026-06-24（`notify-on-failure` job 加入，開 / 更新 GitHub issue on failure）
- [ ] research-health 作單一真相 — 所有「數據健康」數字只引此端點，唔散落各檔 🟡

---

## 3. SignalPilot 線

### 3A 收尾現有 phase（可即做，唔受 GATE-EDGE 擋）

- [x] **SP-1 E2E smoke test** — 8-step smoke test 通過（2026-06-23）：ANET approved / URI POSITION_TOO_SMALL / chain.ok=true；idempotency guard + `return await` fix deployed ✅
- [ ] SP-1 partial fill / reject / cancel / expired 情境測試 ⬜
- [x] SP-2 三層 attribution（strategy / execution / portfolio）— `GET /api/sp2/attribution` 端點實作 + deployed ✅ 2026-06-24
- [x] SP-3 資料契約凍結 — next-bar open / spread / slippage / fees 假設定版 ✅ 2026-06-24 — `data/sp3_contract_v1.json`
- [ ] SP-3 sector/industry 欄位 ← 依賴 P1 真 universe ⬜（P1 A-lite ✅，可開工）

### 3B SP-4 ML（GATE-EDGE 前只做「誠實化」，唔做「催谷」）

- [ ] SP-4 retrain v1.1.0 — 加真 point-in-time sector features ← 依賴 P1 ⛔
- [x] LOWER barrier 分析 ✅ 2026-06-24 — 0% LOWER 是 v1.0.0 mae5d 符號 bug，v1.0.1 已修；k=1.5 正確，見 `docs/research/LOWER_LABEL_ANALYSIS.md`
- [ ] drift / confidence 分佈監控 — model 文件已 commit（15fbc16），下一交易日起 `sp4_shadow_inferences` 開始累積；待有足夠數據後觀察 drift 🟡
- [ ] ⚠️ **唔好**把 feature-importance 剪枝 / threshold sweep 當頭等大事（EXPERIMENT_LOG 顯示 naive pruning 傷 AUC；未證 edge 前係 premature optimization）

### 3C 真錢階梯 — 🔒 全部 BLOCKED until GATE-EDGE passes

- [ ] SP-5 AI-Gated Paper Trading（人工逐筆批准）⛔ ← GATE-EDGE
- [ ] SP-6 Broker Paper Integration ⛔ ← SP-5；**先決 ADR-SP-001（Alpaca vs IBKR paper）**
- [ ] SP-7 Live Suggestion / Human Approval 🔴 真錢 ⛔ ← SP-6 + 用戶明確批准（三重閘）
- [ ] SP-8 Limited Automation 🔴 真錢 ⛔ ← SP-7 穩定後（全自動非預設終點）

### 3D 待決 ADR

- [ ] ADR-SP-001 — 第一個 broker paper adapter：Alpaca vs IBKR ← SP-6 前 ⬜

---

## 4. 跨線 / 治理 hygiene

- [x] **模型版本對齊** — `SIGNALPILOT_ROADMAP.md` §SP-4 已更新：promoted=`model_v1.0.1_ef58f809`（threshold=0.48）；D1 `sp4_model_registry` 僅有 `8aa032a3`（stale，需另行 POST /api/sp4/model 補錄）✅ 2026-06-24
- [ ] **單一真相來源紀律** — 數據健康只引 `/api/d1/research-health`；roadmap 引用唔重抄數字 🟡
- [ ] **多重檢定治理** — 維持 holdout（P4）+ 每個假設記入 EXPERIMENT_LOG，避免 p-hacking ⬜
- [ ] **主軸聚焦（P5）** — solo operator 唔三線全速；每 sprint 明確邊條係脊骨 🟡

---

## 5. 🧊 明確延後（Phase 4+，現時唔投入大量工程）

| 項目 | 延後原因 |
| --- | --- |
| L1 FRED 完整流動性矩陣（WALCL/TGA/RRP） | 需預計算架構成熟 |
| L2 SEC Form 4 Insider Cluster | 接入複雜、易成噪音 |
| L3 Fundamentals overlay（ROIC/margin） | 超出輕量邊界、需資料治理 |
| L4 Options / IV-HV 濾網 | 易把 repo 拉向衍生品平台 |
| L5 Social sentiment | 噪音高、可驗證性弱 |
| L6 Macro blackout calendar | 不應早於核心 signal quality |

---

## 6. 🚫 不做清單（anti-goals）

- 唔喺 GATE-EDGE 未過前，把工程倒落 SignalPilot SP-5+。
- 唔新增大量 regime enum（先用 flag/warning overlay 驗證）。
- 唔把 ETF engine 改成完整多因子黑盒 scoring。
- 唔把 `LONG_BASE_BREAK` 直接升成 UI 主推訊號。
- 唔先做 options / social sentiment 再回頭補 research discipline。
- 唔把多源資料全部放前端即時抓取。
- 唔喺 plateau / walk-forward / holdout 未建前跳去 ML 催谷。
- 唔靠倒蓋今日 universe 扮 point-in-time（已踩過，見 HYP-015 假覆蓋）。

---

_關聯：[`ROADMAP.md`](ROADMAP.md)（治理閘 + web app 細節）· [`SIGNALPILOT_ROADMAP.md`](SIGNALPILOT_ROADMAP.md)（SP 里程碑）· [`TECHNICAL_OVERVIEW.md`](TECHNICAL_OVERVIEW.md)（架構與 constraints）_
