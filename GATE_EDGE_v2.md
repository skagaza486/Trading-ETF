# GATE-EDGE v2 — Edge 驗證預登記（Pre-Registration）

> ❄️ **凍結通知（2026-06-24）：** 因應個人資本管理 pivot，此 5 天 edge 驗證**被動繼續、不阻塞**
> 任何嘢。等 holdout 自然累積，唔好為咗趕住 PASS 而縮 holdout 或調 cost。
> 主計劃見 [`docs/planning/EXECUTION_PLAN.md`](docs/planning/EXECUTION_PLAN.md)。

> **狀態：** 🔶 DRAFT — 等待 ML v1.0.3 promotion + holdout n≥100 後鎖定 §11
> **建立：** 2026-06-24 · **最後更新：** 2026-06-24（stable_returns_assessment.py 執行後更新）
> **依據：** GATE-EDGE v1 ITERATE 裁決 + `docs/research/LOWER_LABEL_ANALYSIS.md` + `models/stable_returns_assessment.json`
> **治理：** [`ROADMAP.md`](ROADMAP.md) P2 · **backlog：** [`WORKLIST.md`](WORKLIST.md) §1

---

## 0. 為何需要 v2（v1 的教訓 + 2026-06-24 新發現）

v1 裁決：🟡 ITERATE（p=0.085，未達 α=0.05）。

### v1 的核心問題（從 LOWER 分析 + stable_returns_assessment 得出）

1. **策略設計不純粹：** v1 持有全部 eligible 信號。實際上：
   - UPPER: +7.76%, p=0.0000, BH-sig ✅（佔 37.3%）
   - VERTICAL: −0.58%, p=0.9203 ❌（佔 38.7%）  
   - LOWER: −5.37%, p=1.0 ❌（佔 24.0%）
   → 整體 mean 被 VERTICAL + LOWER 拖低至 +1.38%

2. **✅ 2026-06-24 確認：UPPER 信號有顯著 edge（p=0.0000）** — train/val n=145 mean=+5.25% + holdout n=28 mean=+7.76%，兩者均顯著。**這不是樣本偽像，是穩健的統計發現。**

3. **✅ 2026-06-24 確認：delisting bias 不推翻結論** — 即使 15 個退市信號全部 −10%，整體 mean 僅下調 −29bps（仍為正）。edge 非偏差產物。

4. **ML overlay 失效：** v1.0.1 在 PIT holdout 上分佈轉移，n_take=0。v1.0.2 已改善（precision@take=0.485 vs always-take=0.402, +8.3pp），唯 fold 4 不穩定（n=21, AUC=0.425）。

### v2 核心策略

**從「hold all eligible」→「只持有 ML 預測 UPPER 的信號」**

邏輯：已知 UPPER 標籤有顯著 edge。ML 的任務是**在 signal_time 預測哪些會是 UPPER**。如果 ML 能準確預測（precision@take > always-take + 5pp），就能實現接近理論上限的回報。

---

## 1. 待答問題（單一）

> 在 PIT-corrected universe 上，使用 ML v1.0.3（或更新版）在 signal_time 預測 UPPER，只持有 ML 預測為 UPPER 的信號，扣成本後在**從未觸碰過的新 holdout** 上，是否有正且統計顯著的 risk-adjusted edge？

**理論上限（已知，不可用作 v2 結果）：** 若完美預測 UPPER，holdout mean=+7.76%, p=0.0000。**這不是 v2 的測試目標，而是天花板參考。**

---

## 2. 必要前置（全部達到才可鎖定 §11）

| 前置 | 要求 | 狀態（2026-06-24） |
|---|---|---|
| P0 earnings 污染 | production 3.12% ✅ | ✅ 已達 |
| P1 PIT universe | A-lite S&P 500 Wikipedia PIT ✅ | ✅ 已達（殘存 delisting bias 已證不推翻結論） |
| P4 v1 holdout 不重用 | v2 holdout 必須 `signal_date > 2026-06-05` | ✅ v1 holdout 已鎖定不重用 |
| ML v1.0.3 promotion | OOF AUC > B3_logreg +0.02 · fold 4 AUC ≥ 0.50 · precision@take > always-take +0.02 | 🔴 **未達** — 需重新 export D1 signals（2026-06-05 後已累積 ~12 新 signals）→ re-label → retrain |
| ML threshold 凍結 | v2 holdout 前從 val set 選定，鎖入 holdout_freeze_v2.json | ⬜ 待 ML promotion |
| Holdout n ≥ 100 | `signal_date ≥ 2026-08-01`（估計）| 🔴 **未達** — 目前 holdout 累積率 ~16 signals/month，~1.6 月後達 n≥100 |
| UPPER prediction n ≥ 30 | ML-predicted UPPER subset on holdout | 🔴 **未達** — 需 ML 先能預測，再等累積 |

**預計鎖定時間：2026-08-15（ML v1.0.3 promotion + holdout n≥100）**

---

## 3. 策略定義（與 v1 的關鍵差異）

### 3.1 信號篩選

- **納入 label：** `LONG_BREAK` / `LONG_VCP` / `LONG_BOUNCE`（同 v1）
- **持有決策：** **ML v1.0.3（或更新 promoted 版）預測為 UPPER（prob ≥ T\*）的信號才持有**
- **T\* 選定：** 在 val set 上最大化 precision@take，不可用 holdout 數據選 T\*
- **若 ML 失效：** fallback = report rule-only（非 PASS 路徑，僅供參考）

### 3.2 回報定義

- 同 v1：5 交易日持有，`ret5d_vs_spy`（超額回報），扣 20bps 成本
- 填價：next_open，fallback close_at_signal

### 3.3 與 v1 的根本差異

| 維度 | v1 | v2 |
|------|----|----|
| 持有決策 | 全部 eligible signals | ML 預測 UPPER 者 |
| Primary 終點 | all-label 合計 mean | ML-take subset 的 mean |
| 預期 mean | ~+1.4%（實測 +1.38%） | 接近理論上限 +7.76%（但 n 較少） |
| ML 角色 | Optional overlay（未用） | **核心**：決定持有哪些 |
| n 要求 | ≥100 | ML-take subset ≥30 |

---

## 4. 資料分割

| 分割 | 時間段 | 用途 | n（est.） |
|---|---|---|---|
| Train / Val | 2025-06 → 2026-07 | 選模、定 threshold T\* | ~560 |
| **Holdout** | **2026-08-01+** | **最終裁決，只跑一次** | ≥100 |

- 邊界以 `signal_date` 切
- v1 holdout（2026-02-01→2026-06-05）納入 train/val（v1 已看過，不可重用）

---

## 5. 假設

- **H1（對立）：** holdout 上，ML-predicted UPPER 信號的扣成本 `ret5d_vs_spy` 平均 > 0。
- **H0（虛無）：** holdout 上，ML-predicted UPPER 信號的扣成本 `ret5d_vs_spy` 平均 ≤ 0。
- 單尾檢定。

## 6. 統計方法（同 v1）

- **Block bootstrap**（block=5 交易日，10,000 resamples）
- **單尾 α = 0.05**
- **Primary 終點：** ML-take subset 的扣成本 mean（1 個檢定）
- **次要切片：** per-signal-type、per-regime → Benjamini-Hochberg FDR 校正
- **一致性：** 前後半方向一致

## 7. 🔒 預先承諾的決策規則（鎖定後不可改）

| 結果 | 條件 | 行動 |
| --- | --- | --- |
| **✅ PASS** | ① ML-take mean > +0.5%；② p < 0.05；③ 前後半一致；④ neutral regime 未翻負；⑤ ML precision@take ≥ always-take + 5pp | 解凍 SP-5 paper trading |
| **🟡 ITERATE** | 方向正但未達顯著 / 顯著但 mean < 0.5% | 回 train/val 改進，新 holdout |
| **🔴 PIVOT** | ML-take mean ≤ 0 或顯著為負 | 重審策略假設 |

---

## 8. 次要終點

- win rate 5D、MAE5D、命中 stop 比例
- ML 的 precision / recall / take_rate vs always-take
- 各 signal type (BREAK/VCP/BOUNCE) 的 ML-take 表現
- Calibration（Brier, reliability curve）

---

## 9. 偏差控制 checklist

- [x] P1 PIT universe 已套用（A-lite S&P 500 PIT）
- [x] Delisting bias 已評估（stable_returns_assessment.py §PART 2: 不推翻結論）
- [x] v1 holdout 不重用（v2 另開 2026-08+）
- [x] UPPER label edge 已確認（train/val + holdout 雙重驗證）
- [ ] ML v1.0.3 promoted（待 retrain）
- [ ] Threshold T\* 凍結（鎖定時執行）
- [ ] 成本假設凍結（20bps，同 v1）
- [ ] holdout_freeze_v2.json 建立（鎖定時執行）

---

## 10. 執行步驟（前置齊備後）

```bash
# 1. Re-export signals from D1 (incorporates 2026-06-05+ new data)
node scripts/ml/export_signals_d1.mjs --out data/signals_full.csv

# 2. Re-label (k=1.5, unchanged)
python3 scripts/ml/label.py --in data/signals_full.csv --k 1.5 --out data/signals_labeled.csv

# 3. Re-build features
python3 scripts/ml/build_features.py --in data/signals_full.csv --out data/features/

# 4. Train v1.0.3 + evaluate + promote
python3 scripts/ml/train_lgbm.py --features data/features/features_v1.0.3_<hash>.parquet ...
python3 scripts/ml/evaluate.py --meta models/meta_v1.0.3_<run_id>.json --promote

# 5. Lock GATE_EDGE_v2.md §11 + create holdout_freeze_v2.json

# 6. Run gate_edge_v2.py on holdout (once, after §11 lock)
python3 scripts/ml/gate_edge_v2.py
```

---

## 11. 🔒 鎖定與簽核（跑 holdout 前填）

- 門檻/方法鎖定日期：`____-__-__`（待 ML v1.0.3 promotion + n≥100）
- 鎖定時 git commit：`________`
- 確認人：`____`
- P4 holdout freeze 檔：`data/holdout_freeze_v2.json`
- 鎖定後改動本檔 §3–§7 = 作廢本次 pre-registration

---

## 12. 結果（待執行）

| 項 | 值 |
| --- | --- |
| 執行日期 | — |
| holdout 定義 | `signal_date ≥ 2026-08-01`（鎖定時確認） |
| holdout n | — |
| ML model | v1.0.3（鎖定時確認） |
| ML threshold T* | — |
| 扣成本 mean（95% CI） | — |
| primary p-value | — |
| 前/後半一致 | — |
| neutral regime | — |
| **§7 裁決** | — |

---

_關聯：[`GATE_EDGE.md`](GATE_EDGE.md) · [`models/stable_returns_assessment.json`](models/stable_returns_assessment.json) · [`WORKLIST.md`](WORKLIST.md)_

---

## 5. 假設

- **H1（對立）：** ML-filtered UPPER 信號在 holdout 上，扣成本 `ret5d_vs_spy` 平均 > 0
- **H0（虛無）：** 扣成本 `ret5d_vs_spy` 平均 ≤ 0（ML 過濾無法找到正 edge）
- 單尾，α = 0.05

---

## 6. 統計方法（草稿，鎖定前可調整）

- **主要檢定：** 同 v1 — block-bootstrap（block = 5 日，10,000 resamples）
- **顯著水平：** 單尾 α = 0.05
- **多重檢定：** ML-filtered 子集是 primary（1 個主要檢定）；label subgroup / regime 仍用 BH 校正作次要觀察
- **一致性：** holdout 前/後半方向一致（同 v1 G3 條件）

---

## 7. 🔶 預擬決策規則（DRAFT — 鎖定前可改）

| 結果 | 條件 | 行動 |
|---|---|---|
| ✅ PASS | ① ML-filtered holdout 扣成本 mean > +0.5%；② p < 0.05；③ 前後半一致；④ ML n_take / 全樣本比率 ≥ 15%（take rate 有意義） | 解凍 GATE-EDGE → 准開 SP-5（paper）|
| 🟡 ITERATE | 方向正但未達顯著 / take rate < 15%（ML 過於保守，等更多樣本）| 回 train/val，等更多 PIT 樣本，另開 v3 |
| 🔴 PIVOT | ML-filtered holdout 扣成本 mean ≤ 0 或顯著為負 | 重新評估策略方向；考慮 UPPER-only rule-based（無 ML）|

> ⚠️ Take rate gate（新增）：若 ML 過於保守（< 15% 信號被選中），holdout n_take 太小，統計力不足。此情況觸發 ITERATE，非 PASS。

---

## 8. 次要終點（觀察，不改 PASS/FAIL）

- ML precision@take vs always-take（calibration check）
- UPPER recall（佔真實 UPPER 信號中，模型抓到多少）
- regime 切片（ML-filtered 在 long_friendly vs neutral）
- Win rate、MAE5D 分佈

---

## 9. 偏差控制 checklist（執行前逐項剔）

- [ ] ML v1.0.2+ 在 **val set**（非 holdout）上選定 threshold T*，並記入 holdout_freeze_v2.json
- [ ] holdout 窗口自定義後從未被模型/threshold 看過
- [ ] 成本假設用凍結值（20bps），不事後調鬆
- [ ] v1 holdout（2026-02→06-05）未混入 v2 holdout
- [ ] 多重檢定 BH 校正已套用於次要切片
- [ ] 決策規則（§7）已鎖定（§11 簽核前填）

---

## 10. ML v1.0.2 解鎖條件（執行前必達）

v1.0.2（run 33343556）已接近 promotion：
- OOF AUC=0.558 ✅ · precision@take +8.3pp ✅ · Brier ✅ · avg_prec ✅
- **失敗點：** fold 4（n=21，2026-04-08+）AUC=0.425

**解法：** 等 2026-08+ 再跑 retrain。fold 4 覆蓋期 n=21 → 預計 2026-08 後增至 ~50+，AUC 方差自然收窄。

**不要試圖修復 fold 4 的 AUC：** 用 class_weight / 換 CV 策略等方式強行讓 fold 4 過關 = p-hacking。等樣本是唯一誠實路徑。

---

## 11. 🔒 鎖定與簽核（跑 holdout 前填）

- 鎖定前置條件：ML v1.0.2 promoted ✅ + holdout n ≥ 100 in ML-filtered subset ✅
- 門檻/方法鎖定日期：`______`（待填）
- 鎖定時 git commit：`______`（待填）
- 確認人：`Tony`
- holdout freeze 檔：`data/holdout_freeze_v2.json`（待建）
- ML threshold T* 凍結：T* = `____`（待填，從 val set 選定）

---

## 12. 結果（待執行）

_本節留白，holdout 跑完後填。_

---

## 附：v1 vs v2 策略對比

| 維度 | GATE-EDGE v1 | GATE-EDGE v2（本文件）|
|---|---|---|
| 持有策略 | All eligible signals | ML-predicted UPPER only |
| ML 角色 | 次要 overlay（FAIL 時 fallback to rule-only） | **Primary filter**（無 ML = 無 v2 entry）|
| Primary hypothesis | All signals mean > 0 | ML-filtered signals mean > 0 |
| Holdout 窗口 | 2026-02-01→06-05（n=75）| 2026-08-01+（n≥100，估計）|
| 策略 PASS 要求 | p<0.05 + mean>0.5% | p<0.05 + mean>0.5% + take_rate≥15% |
| LOWER 問題 | 混入 all-hold，拖累 mean | ML 過濾應大幅減少 LOWER 持有 |

---

_關聯：[`GATE_EDGE.md`](GATE_EDGE.md)（v1）· [`docs/research/LOWER_LABEL_ANALYSIS.md`](docs/research/LOWER_LABEL_ANALYSIS.md) · [`WORKLIST.md`](WORKLIST.md) · [`models/EXPERIMENT_LOG.md`](models/EXPERIMENT_LOG.md)_
