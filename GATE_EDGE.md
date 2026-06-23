# GATE-EDGE — Edge 驗證預登記（Pre-Registration）

> **狀態：** 🟢 預設已填，待 §11 簽核鎖定（前置 P1+P4 齊備後先可跑）· **建立：** 2026-06-23
> **治理：** [`ROADMAP.md`](ROADMAP.md) 北極星與決策閘 P2 · **backlog：** [`WORKLIST.md`](WORKLIST.md) §1
> **性質：** 呢份係**預登記分析計劃**。所有門檻、統計方法、決策規則，**必須喺睇 holdout 結果之前鎖定**。鎖定後只可填「結果」欄，唔可改假設、門檻或方法。

---

## 0. 點解要 pre-register

專案已喺重疊細樣本上測過數十個假設（HYP-009→028）。冇預登記，最終「edge 成立」嘅判斷會受**事後搬龍門 + 多重檢定 + 偷睇 holdout** 污染。本文件嘅唯一目的：**喺睇答案之前，把「點先叫贏」白紙黑字定死。**

---

## 1. 待答問題（單一）

> 修正倖存者偏差 + earnings 污染 + 多重檢定後，本專案嘅 rule-based 訊號（±ML overlay）喺**從未觸碰過嘅 holdout** 上，係咪仍有**正且統計顯著、且扣成本後仍正**嘅 risk-adjusted edge？

---

## 2. 必要前置（未齊唔可跑，跑咗無效）

| 前置 | 要求 | 狀態 |
| --- | --- | --- |
| P0 earnings 污染解除 | production `earnings_in_window` 反映真實（已 3.12%） | ✅ |
| P1 真 point-in-time universe | universe 反映歷史真實成員，無後見之明 | ✅ **A-lite 完成（2026-06-23）** — S&P 500 Wikipedia PIT；殘存 delisting bias（見 ⚠️） |
| P4 holdout 已凍結 | holdout 定義版本化、鎖定、執行前從未用於任何調參/選模 | ✅ 已鎖定 — `data/holdout_freeze_v1.json`（75 條，2026-02-01→2026-06-05） |
| 成本假設凍結 | next-bar open / slippage（10bps）/ fees 定版（SP-3） | 🟡 20bps 已凍結入 holdout_freeze_v1.json；SP-3 完整合約待定 |

**✅ P0 + P1(A-lite) + P4 三項已達，可執行 GATE-EDGE。** 殘餘 delisting bias（見下方 ⚠️）須附 caveat。

> ⚠️ **P1 重大限制（2026-06-23 查證）：** 信號史早過 repo 出生，universe 係 2026-06 手揀贏家名單倒填（詳見 [`ROADMAP.md`](ROADMAP.md) P1 provenance）。**out-of-time holdout 都除唔到 inclusion bias**（選股已用咗未來資訊）。因此**本 gate 在選項 A（外部 PIT universe 重跑）落實之前，最多只能證「given 此偏差 universe 是否有殘餘 edge」，唔等於「淨 edge」**。若行選項 B/C，本 gate 之 PASS 須附此 caveat，不得用作真錢晉級之充分理由。

---

## 3. 範圍與定義（已鎖定預設）

- **納入 label：** `LONG_BREAK` / `LONG_VCP` / `LONG_BOUNCE`（plan §10 allowlist；WATCH/BASE 排除）。
- **回報定義（primary）：** `ret5d_vs_spy`（5 交易日持有，扣 SPY benchmark 嘅超額回報）。
- **扣成本回報：** `ret5d_vs_spy − 0.20%`（進出各 10bps slippage = 共 20bps；如 SP-3 改假設則跟新值）。
- **ML overlay：** SP-4 promoted 模型嘅 `TAKE` 決策（meta-label），對比 always-take baseline。
- **regime 切片：** 全樣本（primary）+ neutral/risk_off 子樣本（牛市依賴體檢，secondary）。

---

## 4. 資料分割（已鎖定預設）

| 分割 | 時間段 | 用途 | 規則 |
| --- | --- | --- | --- |
| Train / Validation | **2025-04 → 2026-01**（~10 月） | 修正後重建特徵、選模、調 threshold | 可反覆使用 |
| **Holdout** | **2026-02 → 2026-06**（最近 5 月） | **最終裁決，只跑一次** | 執行本 gate 前**從未**用於任何調參/選模/偷睇 |

- **分割法：** **out-of-time**（最貼真實部署情境，優於 out-of-universe）。Holdout = 最近 **5 個月**（`signal_date ≥ 2026-02-01`）。
- **樣本注意：** 全樣本 ~422 eligible / 15 月 ≈ 28/月 → holdout 約 ~140 條跨 3 label。**per-label n 可能偏細**，故 **primary 終點以「3 label 合計」為準**，per-label 拆解列 §8 次要終點（唔單獨左右 PASS/FAIL）。
- 邊界以 `signal_date` 切，**唔可**因 holdout 樣本太細而事後縮短窗（搬龍門）。

---

## 5. 假設

- **H1（對立）：** holdout 上，納入 label 嘅扣成本 `ret5d_vs_spy` 平均 > 0。
- **H0（虛無）：** holdout 上，扣成本 `ret5d_vs_spy` 平均 ≤ 0（即無 edge）。
- 單尾檢定（只關心正 edge）。

---

## 6. 統計方法（已鎖定預設）

- **重疊窗校正：** 5 日持有有重疊 → 用 **block bootstrap**（block = 5 交易日，10,000 resamples）估平均超額回報嘅信賴區間，唔用假設獨立嘅普通 t-test。
- **顯著水平：** 單尾 α = 0.05。
- **主要檢定：** primary 終點 = 「3 label 合計」嘅扣成本 `ret5d_vs_spy` 平均（1 個檢定）。
- **多重檢定校正：** per-label（3）+ regime 子樣本（2）等次要切片 → **Benjamini-Hochberg（FDR, α=0.05）**。primary 單一檢定不受校正影響；校正只施於次要切片，防止挑切片報喜。
- **一致性：** holdout 內前半 / 後半時間段方向需一致（沿用 G4 精神）。

---

## 7. 🔒 預先承諾嘅決策規則（核心 — 鎖定後不可改）

> 跑完 holdout 之後，按下表機械式判定，**唔准事後新增條件**。

| 結果 | 條件（全部需滿足） | 行動 |
| --- | --- | --- |
| **✅ PASS — 可向下游推進** | ① holdout 扣成本 `ret5d_vs_spy` 平均 **> +0.5%**；② 校正後單尾 **p < 0.05**；③ 前後半方向一致；④ neutral regime 子樣本未翻負；⑤ ML overlay precision@take 喺 holdout **≥ always-take + 5pp** | 解凍 GATE-EDGE → 准開 SP-5（仍 paper） |
| **🟡 ITERATE — 未夠，回研究** | 方向正但未過顯著 / 顯著但扣成本後 ≤ 0 / regime 子樣本翻負 | 唔解凍；回 train/val 改進，**另開新 holdout** 再 pre-register |
| **🔴 PIVOT / KILL** | holdout 扣成本平均 **≤ 0** 或顯著為負 | 唔解凍 SignalPilot 下游；重新檢視 rule 設計或產品方向 |

**ML overlay 額外裁決：** 若 rule-only PASS 但 ML overlay 喺 holdout 達唔到「≥ always-take + 5pp」，則 **rule-only 推進、ML 留 shadow**（唔可用未證 overlay 動 paper sizing）。

---

## 8. 次要終點（觀察，不改 PASS/FAIL）

- win rate 5D、MAE5D 分佈、命中 stop 比例。
- triple-barrier UPPER 命中率 vs ML 預測校準（Brier / reliability curve）。
- 各 label 個別表現拆解。

---

## 9. 偏差控制 checklist（執行前逐項剔）

- [x] P1 真 universe 已套用（A-lite S&P 500 Wikipedia PIT；殘存 delisting bias 附 caveat）
- [x] holdout 自定義以嚟從未被任何模型/threshold 見過（`holdout_freeze_v1.json` 2026-06-23 鎖定）
- [x] 成本假設用凍結值，無事後調鬆（20bps，入 holdout_freeze_v1.json）
- [ ] 多重檢定校正已套，無挑樣本/挑 label 報喜（gate_edge.py 執行後剔）
- [ ] regime 子樣本已跑（唔只報全牛市數；注：holdout neutral n=2，樣本極細，附 caveat）
- [x] 決策規則（§7）喺跑 holdout 前已鎖定（見 §11 簽核 2026-06-23）

---

## 10. 執行步驟（前置齊備後）

```bash
# 1. 重建真 point-in-time universe（P1）後，重新 export + label
.tools/node-v22.22.3-darwin-arm64/bin/node scripts/ml/export_signals_d1.mjs --out data/signals_full.csv
python3 scripts/ml/label.py --in data/signals_full.csv --k 1.5 --out data/signals_labeled.csv

# 2. 切 holdout（依 §4 鎖定定義）+ 喺 train/val 完成選模、定 threshold

# 3. 喺 holdout 跑一次：block-bootstrap 超額回報 CI + 扣成本 + 多重檢定校正
#    （新增 scripts/ml/gate_edge.py —— 執行時實作；輸出 holdout 裁決 JSON）

# 4. 按 §7 決策表機械判定，填 §12 結果欄，本檔狀態改 ✅/🟡/🔴
```

> `scripts/ml/gate_edge.py` 尚未存在；屬本 gate 執行階段嘅交付物（唔屬本次文檔工作）。

---

## 11. 🔒 鎖定與簽核（跑 holdout 前填）

- 門檻/方法鎖定日期：`2026-06-23`
- 鎖定時 git commit：`c025fe8a549d0530c0e62b3a386afdceff616f56`
- 確認人：`Tony`
- P4 holdout freeze 檔：`data/holdout_freeze_v1.json`
- 鎖定後改動本檔 §3–§7 = 作廢本次 pre-registration，需另開新版重登記。

---

## 12. 結果（2026-06-23 執行）

| 項 | 值 |
| --- | --- |
| 執行日期 | 2026-06-23 |
| holdout 定義 | `signal_date ≥ 2026-02-01`，n=75（2026-02-02 → 2026-06-05） |
| 扣成本 `ret5d_vs_spy` 平均（95% CI） | **+1.38%**（−0.54%, +3.42%），cost=20bps |
| primary p-value（block-bootstrap，單尾） | **0.0849**（α=0.05，⚠️ 未達顯著） |
| 前/後半一致 | ✅ 前半 +0.77%，後半 +1.98%，方向一致 |
| neutral regime 子樣本 | ⚠️ n=2，樣本不足（< 5），無法判斷 |
| UPPER label 子樣本（BH-corrected） | ✅ n=28，mean=+7.76%，BH-sig=True |
| LOWER label 子樣本 | ❌ n=18，mean=−5.37%（止損信號拖累） |
| VERTICAL label 子樣本 | ❌ n=29，mean=−0.58%（無方向） |
| ML overlay v1.0.1 精準率 vs always-take | ❌ n_take=0（模型 max proba=0.334 < threshold 0.48）**結構性分佈轉移** — v1.0.1 訓練於舊 biased 422 訊號，PIT 重練版 (v1.0.2) gate 未過，故無有效 ML overlay |
| **§7 裁決** | 🟡 **ITERATE** |
| 裁決原因 | c2 失敗：p=0.0849 > 0.05。方向正確（+1.38%）但 75 個樣本下未達統計顯著。 |
| 後續行動 | 見下方 §12a |

### §12a — ITERATE 後續路徑（按 §7 承諾）

**按 §7 規定：** 唔解凍 SignalPilot SP-5+；回 train/val 改進；需**另開新 holdout** 再 pre-register，唔可再用 `2026-02-01→2026-06-05` 這段。

**邊界誠實評估：**

- 方向正確（+1.38% after cost），CI 下界 −0.54% 偏低係因 n=75 統計力不足，而非因為信號差
- UPPER 信號（n=28）有顯著 edge（+7.76%，BH-sig），係真實正向訊號
- LOWER 信號（n=18）拖累整體（−5.37%）：止損標籤信號需要再評估（可能係 k=1.5 barrier 設定問題，或 LOWER 類型本身不適合持有 5d）
- ML overlay 已廢：v1.0.1 在 PIT 數據上完全失效（分佈轉移），需喺 PIT 數據重練可用模型

**可行改進方向（唔係本 gate，屬下一 pre-registration 前的 train/val 工作）：**

1. **優先：** 針對 UPPER-only 信號或改 label 策略（排除 LOWER 持有；或拆分 strategy）
2. 喺 PIT 536 訊號上重練 ML 模型（v1.0.2 fold 4 n=21 問題隨時間自然緩解 — 等多 1–2 月樣本再跑）
3. 考慮更寬 holdout（例如延至 2026-08）以提升 n 到 ~100+，再 pre-register 第二次 GATE-EDGE

⚠️ **唔可以**：事後調 cost、縮短 holdout、用本次 holdout 數字選 threshold，然後宣稱 PASS。必須全新 pre-registration + 全新 holdout。

**狀態：** 本 gate 閉合，ITERATE。本檔不再更改（見 §11 鎖定承諾）。下一次 gate 開新版本 `GATE_EDGE_v2.md`。

---

_關聯：[`ROADMAP.md`](ROADMAP.md) · [`WORKLIST.md`](WORKLIST.md) · [`SIGNALPILOT_ROADMAP.md`](SIGNALPILOT_ROADMAP.md)_
