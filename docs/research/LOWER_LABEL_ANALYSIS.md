# LOWER Label Drag — Root Cause Analysis

> **建立：** 2026-06-24 · **依據：** `models/gate_edge_result.json` + `models/EXPERIMENT_LOG.md`
> **結論 TL;DR：** k=1.5 不是問題。LOWER 信號是真實輸家，不是標籤誤差。唯一出路是 ML 過濾。

---

## 1. 數字拆解

GATE-EDGE v1 holdout（n=75）：

| label | n | mean ret5d (net) | 佔全樣本 | 對整體 mean 貢獻 |
|---|---|---|---|---|
| UPPER | 28 | +7.76% | 37.3% | **+2.90%** |
| VERTICAL | 29 | −0.58% | 38.7% | −0.22% |
| LOWER | 18 | −5.37% | 24.0% | **−1.29%** |
| **合計** | **75** | **+1.38%** | — | — |

驗算：2.90 − 0.22 − 1.29 = **+1.39%** ✓（與 gate_edge_result.json 的 1.38% 吻合）

**如果策略只持有 UPPER 信號（假設能完美預測）：**
- n=28，mean=+7.76%，95% CI [+5.35%, +10.41%]，已 BH-significant
- 但這需要一個能預測 UPPER vs 非-UPPER 的模型，即 ML v1.0.2

---

## 2. 「k=1.5 太窄」假說的反駁

一個直覺是：把 k 調大（例如 2.0），LOWER 信號變少，整體 mean 上升。

**這個邏輯有缺陷：**

1. `ret5d` 是真實 5 日持有回報，由 Yahoo 收盤價決定。**k 只影響標籤分類，不影響回報數字。**
2. 把 k 從 1.5 調到 2.0，只是把一些 LOWER 重新貼標為 VERTICAL——但這些信號的 `ret5d` 仍然是負的，只是 ML 訓練時不再被標為「清楚失敗」。
3. 調大 k → ML 失去辨別力（LOWER 樣本變少，hard negative 減少）→ AUC 可能下降。

**結論：k=1.5 是合理的。LOWER 信號是真實輸家。**

數量化：LOWER 閾值 = 1.5 × ATR。對典型 S&P 500 股票，5 日 ATR 約 2-3%，觸發 LOWER 需要 3-4.5% 的最大不利偏移（MAE）在 5 日內出現。這是有意義的止損信號，不是噪音。

---

## 3. 為什麼 ML overlay v1.0.1 在 holdout 完全失效

`gate_edge_result.json`：
```
ml_overlay.n_take = 0
ml_overlay.max_proba_in_holdout ≈ 0.334 (< threshold 0.48)
```

**原因（已知）：** v1.0.1 訓練於舊 422 訊號（2026-06 手揀贏家名單倒填）。PIT 修正後 holdout 的特徵分佈完全不同——模型對任何信號都沒有信心（max proba 僅 0.334）。這是**分佈轉移**，不是閾值問題。

EXPERIMENT_LOG v1.0.2（33343556）顯示：
- PIT 數據上 OOF AUC=0.558（略高於 v1.0.1 的 0.5537）
- precision@take=0.4848 vs always-take=0.4021（+8.3pp，遠高於 v1.0.1 的 +2.8pp）
- **唯一失敗原因：fold 4（n=21）AUC=0.425 < 0.50**
- Fold 4 = 2026-04-08 之後，只有 21 個測試樣本，高方差；也可能是真實模型退化

v1.0.2 沒有被拒，只是「等更多樣本」。再累積 1-2 個月資料（n fold 4 → ~40+）後重練。

---

## 4. 結論與下一步

| 問題 | 答案 |
|---|---|
| k=1.5 太窄導致 LOWER 過多？ | 否。k 只改標籤，不改回報。 |
| LOWER 信號本身有 edge？ | 否。mean=−5.37%，p=1.0。這些是真實輸家。 |
| 應該排除 LOWER 信號？ | 不能直接排除（入場前不知道哪些會 LOWER）。需要 ML 模型預測。 |
| 策略改進路徑？ | **只持有 ML 預測為 UPPER 的信號**（見 `GATE_EDGE_v2.md`） |
| ML 何時能用？ | v1.0.2 已接近（fold 4 不穩定），等 2026-08+ 累積 ~100 新信號後重練 |

---

## 5. 給 GATE_EDGE_v2 的輸入

- **Primary hypothesis 改變：** 從「全部 eligible 信號」→「ML 預測 UPPER 的信號」
- **Required pre-condition：** ML v1.0.2 通過 promotion gate（fold 4 AUC ≥ 0.50）
- **新 holdout 最低要求：** 在 ML-filtered UPPER-predicted 子集中 n ≥ 50（全樣本需更多）
- **不要改 k：** k=1.5 保持，確保 LOWER 訓練樣本充足

---

_關聯：[`GATE_EDGE.md`](../../GATE_EDGE.md) §12a · [`GATE_EDGE_v2.md`](../../GATE_EDGE_v2.md) · [`models/EXPERIMENT_LOG.md`](../../models/EXPERIMENT_LOG.md)_
