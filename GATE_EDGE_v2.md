# GATE-EDGE v2 — Edge 驗證預登記（Pre-Registration）草稿

> **狀態：** 🔶 DRAFT — 未鎖定。鎖定條件：① ML v1.0.2 通過 promotion gate ② holdout 窗口 n ≥ 100
> **建立：** 2026-06-24 · **依據：** GATE-EDGE v1 ITERATE 裁決 + [`docs/research/LOWER_LABEL_ANALYSIS.md`](docs/research/LOWER_LABEL_ANALYSIS.md)
> **治理：** [`ROADMAP.md`](ROADMAP.md) P2 · **backlog：** [`WORKLIST.md`](WORKLIST.md) §1
>
> ⚠️ **DRAFT 期間可修改假設、門檻、方法。鎖定（§11 簽核）之後與 v1 相同——只可填結果欄，不可改設計。**

---

## 0. 為何需要 v2（v1 的教訓）

v1 裁決：🟡 ITERATE（p=0.085，未達 α=0.05）。

**v1 的核心問題（從 LOWER 分析得出）：**

1. **策略設計不純粹：** v1 持有全部 eligible 信號（UPPER/VERTICAL/LOWER 均持有）。實際上只有 UPPER 信號有 edge（+7.76%，BH-sig），LOWER（−5.37%）和 VERTICAL（−0.58%）無 edge 或為負。
2. **ML overlay 完全失效：** v1.0.1 在 PIT holdout 上分佈轉移，n_take=0。v2 需要一個在 PIT 數據上訓練且通過 fold 穩定性測試的模型。
3. **統計力不足：** n=75 在 α=0.05 下力量有限。UPPER-only 策略下目標 n≥50（ML-filtered subset），全樣本需 ~150+。

**v2 核心改變：策略從「hold all」→「ML-filtered UPPER-only」**

---

## 1. 待答問題（單一）

> 在 PIT-corrected universe 上，使用 ML v1.0.2（或更新版）過濾後，只持有模型預測為 UPPER 的信號，扣成本後在**從未觸碰過的新 holdout** 上，是否有正且統計顯著的 risk-adjusted edge？

**與 v1 的關鍵差異：**
- v1：「rule-based 信號有無 edge」（全部持有）
- v2：「ML-filtered UPPER 信號有無 edge」（只持有 ML 預測 UPPER 者）

---

## 2. 必要前置（全部達到才可鎖定 §11，才可跑 holdout）

| 前置 | 要求 | 狀態 |
|---|---|---|
| P0 earnings 污染 | production 3.12% ✅ | ✅ 已達 |
| P1 PIT universe | A-lite S&P 500 Wikipedia PIT ✅ | ✅ 已達（殘存 delisting bias，附 caveat）|
| ML v1.0.2 promotion | OOF AUC > B3_logreg +0.02 · fold 4 AUC ≥ 0.50 · precision@take > always-take +0.02 | 🔴 **未達** — fold 4 (n=21) AUC=0.425 < 0.50 |
| ML threshold 凍結 | v2 holdout 前從 val set 選定 threshold，鎖入 holdout_freeze_v2.json | ⬜ 待 ML promotion |
| Holdout n ≥ 100 | `signal_date ≥ 2026-08-01`（估計），**ML-filtered subset n ≥ 50** | 🔴 **未達** — 需 ~1-2 月累積 |
| P4 v1 holdout 與 v2 holdout 不重疊 | v2 holdout 必須 `signal_date > 2026-06-05`（v1 截止日）| ⬜ 待定義 |

**預計鎖定時間：2026-08（ML + 樣本雙就緒後）**

---

## 3. 策略定義

### 3.1 信號過濾（新增，v1 沒有）

- **過濾條件：** SP-4 ML v1.0.2（或更新 promoted 版）預測 `UPPER`（tb_label = +1）的信號，機率 ≥ 凍結 threshold T*
- **T* 選定方式：** 在 val set（2025-04 → 2026-07 的 train/val 集）上最大化 precision@take，**不可用 holdout 數字選 T***
- **若 ML 失效（n_take=0）：** 觸發 fallback = rule-only（等同 v1 策略），作為 reference，**不作為 PASS 路徑**

### 3.2 持有期與回報定義

- 同 v1：5 交易日持有，`ret5d_vs_spy`（超額回報），扣 20bps 成本
- 填價：next_open fallback close_at_signal（同 SP-3 contract）

### 3.3 納入 label

- 同 v1：`LONG_BREAK` / `LONG_VCP` / `LONG_BOUNCE`
- 但只持有 ML 預測 UPPER 的子集（過濾發生在持有決策，不是在信號生成）

---

## 4. 資料分割

| 分割 | 時間段 | 用途 |
|---|---|---|
| Train / Val | 2025-04 → 2026-07（估計） | 選模、定 threshold T* |
| **Holdout** | **2026-08-01+**（估計，n ≥ 100 才開執行）| **最終裁決，只跑一次** |

- Holdout 窗口以 `signal_date` 切，**不可** 因 n 不足縮短（見 §7 鎖定後規則）
- v1 holdout（2026-02-01→2026-06-05）**不可重用**，即使加在 train/val 亦須謹慎（部分 signals 已被 v1 看過）
- 推薦：v1 holdout 整段做 train/val，新鮮 2026-08+ 做 v2 holdout

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
