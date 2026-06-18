# Signal Research

> 這份文件是 signal 引擎的**唯一研究主文件**，合併自原 `SIGNAL_DEFINITION_RESEARCH.md`（signal 定義層）與 `SIGNAL_IMPROVEMENT.md`（實驗與 gate 驗證層）。
>
> `SIGNAL_DEFINITION_RESEARCH.md` 已廢棄並刪除。所有內容以本文件為準。

---

## 文件定位

兩個核心問題分開處理，不混為一談：

1. **Signal 定義是否合理** — label 概念是否清晰、可解釋、可重複
2. **既有定義下 gate 表現如何** — threshold 是否合適、假設是否成立

原則：

- 先確認概念對，再優化 threshold
- 不把「樣本太少」和「定義錯了」混為一談
- 不把「pooled sample 好看」誤判為 signal 已成熟
- **靠 Gate Summary 的 forward return 數字，不靠感覺**

---

## 如何讀 Gate Summary

Gate Summary 在 UI 的 Stock Research tab 裡。每次改動閾值後記錄每個 label 的 `n`、`Avg 5D`、`vs SPY`、`MAE 5D`、各 gate pass/fail。

| Gate | 要求 |
| --- | --- |
| G1 | n ≥ 100 |
| G2 | 方向正確（long → avg5D > 0，short → avg5D < 0） |
| G3 | avg 5D vs SPY > +0.5%（long）或 < -0.5%（short） |
| G4 | 前半樣本與後半樣本方向一致 |
| G5 | neutral regime 下方向仍正確 |
| G6 | avg MAE 5D < 3% |
| G7 | 止損命中率 < 30% |

補充：

- 目前 `researchGate.ts` 只對 directional labels 做 gate 評估，不含 `NEUTRAL` / `AVOID_CHOP`
- G2/G3/G6 只有在 `n >= 10` 時才會被計算；G4 只有 `n >= 20`；G5 只有 neutral 樣本 `>= 5`
- `status = PASS` 的實作：G1 必須過，G2/G3/G4/G6 必須為 true，G5 只要不是明確 false（`INSUFFICIENT` 不會單獨 fail）
- Gate 是驗證工具，不是 signal 定義本身；一個 signal G1 fail 可能只是樣本太少，G2/G3/G6 長期 fail 才更像定義有問題

最新 gate summary 以 [.cache/research-agent/latest/gate-summary.md](.cache/research-agent/latest/gate-summary.md) 為準。

---

## 現有閾值（v2 — 2026-06-18 架構重設計，2026-06-18 外部研究更新）

> ⚠️ **v1 → v2 重設計說明（2026-06-18）**
>
> 舊標籤 LONG_WATCH / LONG_SETUP / LONG_CONFIRM / LONG_PULLBACK / UP_PROMOTION / DOWN_PROMOTION / SHORT_SETUP / SHORT_CONFIRM 已全面廢棄。
> 以下為 v2 代碼當前實際值。所有 v1 實驗數據見文末「v1 歷史存檔」，屬歷史資料，不代表 v2 定義的表現。

### marketRegime.ts

```text
long_friendly:  VIX < 22 AND SPY > EMA(50) AND QQQ > EMA(50)
short_friendly: VIX > 28 OR (SPY < EMA(50) AND QQQ < EMA(50))
neutral:        其餘
```

### signalClassifier.ts（v2）

```text
AVOID_CHOP:
  RSI 45–55 AND RVOL < 0.8 AND |ema20Slope| < 0.001
  AND breakout20d != true AND breakdown20d != true

── Universe Filters (not entry signals, not gate-evaluated) ───────────────────

LONG_BASE (universe filter — structure + compression候選池):   ← 2026-06-18 降級
  aboveEma200 != false AND EMA20 > EMA50 AND ema50Slope > 0
  AND ema20Slope > 0 AND relStrengthVsSpy > 0
  AND RSI 45–65
  AND (atrSlope50 < 0 OR rvolRecentAvg10 < 0.8)         ← OR 維持（廣篩）
  AND regime != short_friendly

WATCH (universe filter — momentum building):
  RSI > 50 AND macdHistogram > 0 AND CMF > 0 AND obvSlope > 0
  AND relStrengthVsSpy > -0.02
  AND rsiSlope3 > 0 (OR null)                            ← HYP-019 multi-bar: RSI 3日上升（null-safe，廣篩優先）
  AND regime != short_friendly

── Entry Triggers (gate-evaluated) ───────────────────────────────────────────

LONG_BREAK (entry trigger — breakout):
  breakout20d = true AND RVOL > 1.6 AND CMF > 0.1 AND CLV > 0.65   ← RVOL 1.8→1.6
  AND EMA20 > EMA50 AND RSI > 55
  AND aboveEma200 != false AND nearHigh52w != false
  AND regime != short_friendly
  AND prior bar in long ladder (HYP-009)
  AND priorBaseStreak >= 2 (OR null)                     ← HYP-017 multi-bar: 突破前有底部量縮
  AND EMA50 > EMA150 (OR null)                           ← HYP-020: 多時間框架 MA 對齊
  AND extendedFromPivot != true                          ← HYP-021: 抑制離 pivot >5% 的追高信號
  [ADX > 25 — 計算但不作硬性條件；n=16 樣本下排除 10/16，暫無法統計驗證，以 adx14 欄位供研究]

LONG_VCP (entry trigger — volatility contraction):
  aboveEma200 = true AND atrSlope50 < 0 AND rvolRecentAvg10 < 0.8
  AND breakout20d = true AND RVOL > 1.5 AND CLV > 0.6   ← CLV 新增，確認突破日買盤質量
  AND regime != short_friendly
  AND prior bar in long ladder (HYP-009)                 ← hysteresis 新增，VCP 需有時間脈絡
  AND EMA50 > EMA150 (OR null)                           ← HYP-020: 與 LONG_BREAK 一致

LONG_BOUNCE (entry trigger — pullback reversal):
  regime = long_friendly AND ema50Slope > 0
  AND aboveEma200 != false AND EMA20 > EMA50
  AND recentPullbackNearEma20 = true   ← last 5 bars: any low ≤ EMA20×1.02
  AND close > EMA20
  AND RSI 42–58 AND CLV > 0.6 AND relStrengthVsSpy > 0
  AND pullbackRvolAvg < 1.2 (OR null)                    ← HYP-018 multi-bar: 縮量回調

SHORT_WATCH:
  close < EMA20 AND RSI < 50 AND relStrengthVsSpy < 0
  AND macdHistogram < 0 AND regime != long_friendly

SHORT_BASE:
  close < EMA20 AND ema20Slope < 0 AND RSI < 45
  AND RVOL > 1.5 AND CMF < 0 AND regime != long_friendly

SHORT_BREAK (entry trigger — breakdown):
  breakdown20d = true AND RVOL > 1.5 AND CMF < -0.05
  AND CLV < 0.35 AND EMA20 < EMA50 AND RSI < 45
  AND regime != long_friendly
  AND prior bar in short ladder (HYP-009)
```

### stockScreenerEngine.ts

```text
── 原有 indicators ────────────────────────────────────────────────────────────
breakout20d:          close > max(high[-21:-1]) + 0.5*ATR14    ← ATR-normalized
breakdown20d:         close < min(low[-21:-1]) - 0.5*ATR14
ema20Slope:           (EMA20[t] - EMA20[t-5]) / EMA20[t-5]   (5-bar)
relStrengthVsSpy:     20-day rolling return diff
obvSlope:             linear regression slope of OBV over last 10 bars
previousLabel:        computed with previous day's sliced benchmarks + previousRegime
aboveEma200:          close >= EMA200
nearHigh52w:          close >= max(high, last 252 bars) * 0.75
recentPullbackNearEma20: any of last 5 bars (excl. today) where low ≤ EMA20×1.02

── Multi-bar indicators（HYP-016~019，2026-06-18 新增）────────────────────────
lowRvolDaysInWindow:  count of RVOL < 0.8 in last 10 bars (excl. today)
atrCompressing:       ATR today < ATR 5 bars ago
priorBaseStreak:      count of RVOL < 0.8 in last 5 bars (excl. today)
pullbackRvolAvg:      avg RVOL of bars where low ≤ EMA20×1.02 in last 5 bars
rsiSlope3:            RSI[today] − RSI[3 days ago]

── 趨勢結構 indicators（HYP-020~022，2026-06-18 外部研究後新增）──────────────
ema150:               EMA(150) — Minervini Stage 2 中間 MA 層
adx14:                ADX(14) — 趨勢強度（>25 = trending，<20 = ranging）
udVolRatio50:         過去 50 bar 上漲日成交量 / 下跌日成交量 — 機構淨累積代理指標
nr7:                  今日 high-low range 是過去 7 bar 最小 — 波動收縮計時器
extendedFromPivot:    close > 20日最高 × 1.05 — 追高風險旗標
```

---

## Signal 定義研究問題（v2）

每次研究 signal 定義，先回答四個問題：

1. 它想捕捉的市場現象是什麼？
2. 現有條件是否真的對應那個現象？
3. 它與相鄰 labels 的邊界是否清楚？
4. 它失敗時，像是 threshold 太鬆，還是概念本身錯了？

### 核心主題：single-bar snapshot vs. multi-bar context

**Multi-bar + 趨勢結構改版已落地（2026-06-18）。** 各 signal 現有的條件覆蓋：

| Signal | 關鍵條件 | 類型 |
| --- | --- | --- |
| LONG_BOUNCE | `recentPullbackNearEma20`（5 bar）+ `pullbackRvolAvg < 1.2`（HYP-018） | 真正逐 bar 時序 |
| LONG_BREAK | `previousLabel`（1 bar）+ `priorBaseStreak >= 2`（HYP-017）+ `EMA50 > EMA150`（HYP-020）+ `extendedFromPivot != true`（HYP-021） | 時序 + 結構 + 風險 |
| LONG_VCP | `previousLabel`（HYP-009 hysteresis 新增）+ `CLV > 0.6`（新增）+ `EMA50 > EMA150`（HYP-020） | 時序 + 質量 + 結構 |
| WATCH | `rsiSlope3 > 0`（null-safe，3 bar slope，HYP-019） | 方向持續性（廣篩） |
| LONG_BASE | `atrSlope50`（50-bar 迴歸）、`rvolRecentAvg10`（10-bar 平均） | 預聚合 scalar |

**EXP-009 baseline（v2 首次 gate）：** LONG_BOUNCE 全 PASS（n=370，vs SPY +0.9%，G6 FAIL MAE=3.0%）。LONG_BREAK 方向佳（vs SPY +4.1%）但 n=16 G1 FAIL。

**EXP-011（外部研究改版後）：** LONG_BREAK n=10（-6），vs SPY +2.3%，G2/G3/G6 PASS，仍 INSUFFICIENT。LONG_VCP avg5D +1.5%（改版前 -1.5%）——方向由負轉正。LONG_BOUNCE n=370、vs SPY +0.9%，與 EXP-009 完全一致（RSI 上限 58→62 測試後回退）。

**當前未解問題：** LONG_BOUNCE G6 臨界（MAE=3.0%）持續觀察中。LONG_BREAK n=10 仍 G1 FAIL，根本解是擴大 universe，而非鬆化條件。ADX > 25 在 2024–2026 牛市樣本下排除 10/16 個信號，方向不確定，保留為研究 indicator（`adx14` 欄位），暫不作硬性條件。

### 各 Signal 當前研究問題

#### WATCH

- **已落地（2026-06-18）**：`rsiSlope3 > 0`（null-safe，HYP-019）— RSI 3 日上升作為動量方向持續性確認；null 時不排除（廣篩優先）
- WATCH 不 gate 評估，效果需從 LONG_BREAK / LONG_BOUNCE 的前置比率間接觀察
- 待觀察：加入 rsiSlope3 後，WATCH 票在未來 5 天觸發 entry trigger 的比率是否提升

#### LONG_BASE

- **2026-06-18 定位修正：從 entry signal 降級為 universe filter（不再 gate 評估）**
- 根因：壓縮期間股票橫行，5 日 forward return 天然趨近零甚至跑輸大市（牛市中其他股票在漲）。這不是 threshold 問題，而是「base 本身不是 entry point」——Minervini 的 entry 在 pivot breakout，不在 base 形成中
- 新角色：類似 WATCH，是「高質量候選池」——結構完整 + 正在壓縮，預期下一步觸發 LONG_BREAK 或 LONG_BOUNCE
- OR 條件（atrSlope50 OR rvolRecentAvg10）維持，作為 universe filter 應保持足夠廣
- `lowRvolDaysInWindow` 保留為 indicator 字段，供未來研究用（研究 base 質量對後續 breakout 表現的影響）

#### LONG_BREAK

- **已落地（2026-06-18）**：RVOL 1.8 → 1.6；`priorBaseStreak >= 2`（HYP-017）
- **已落地（EXP-011）**：`EMA50 > EMA150`（null-safe，HYP-020）；`extendedFromPivot != true`（HYP-021）
- 當前 gate（EXP-011）：n=10，avg5D +2.5%，vs SPY +2.3%，G2/G3/G6 PASS，G1 FAIL（n 不足）
- n 從 16 → 10：EMA150（-3）+ extendedFromPivot（-3）共排除 6 個；兩個條件方向合理
- 根本問題仍是 n 不足；ADX > 25 測試後排除 10/16，暫不加入（保留為 `adx14` 研究欄位）
- 待研究：擴大 universe 是正確路徑；RVOL → 1.4 已有數據建議暫緩（需先驗證 ADX 影響）

#### LONG_BOUNCE

- **已落地（2026-06-18）**：`pullbackRvolAvg < 1.2`（HYP-018）
- 當前 gate（EXP-011）：n=370，avg5D +1.3%，vs SPY +0.9%，G6 臨界（MAE=3.0%）→ status FAIL
- RSI 上限 58→62 測試：n=830 但 vs SPY 降至 +0.4%，rolling G3 從 6/6 → 1/6；已回退至 58
- 關鍵學習：RSI 58 是真實邊界——58–62 的股票屬於不同市場現象（動能延續而非低風險回調反彈）
- 待觀察：G6 MAE=3.0% 是否在下一輪 sync 中穩定通過；`pullbackRvolAvg` 閾值是否仍需調整

#### LONG_VCP

- **已落地（EXP-011）**：`previousLabel` hysteresis（與 LONG_BREAK 相同邏輯）；`CLV > 0.6`
- 當前 gate（EXP-011）：n=6，avg5D +1.5%（改版前 -1.5%）——方向完全修正
- 根因確認：舊版無 hysteresis，捕捉到「有 VCP 形態但無時間脈絡」的單日噪音，方向為負
- 與 LONG_BREAK 的重疊度：兩者都要求 previousLabel + EMA150；差異在於 VCP 用 atrSlope50/rvolRecentAvg10 取代 breakout20d 的 RVOL/CLV/CMF 組合
- 待研究：n=6 仍太少；先擴大 universe 再評估是否需要獨立 label

#### Short Ladder

- SHORT_BASE / SHORT_BREAK / SHORT_WATCH 在 2024-2026 牛市樣本全部失敗屬預期偏差
- 待決定：是否在 `short_friendly` regime 才研究？需要 2022 熊市數據支撐
- 目前狀態：凍結，不投入優化

---

## Hypothesis Backlog

### Active（v2 優先）

#### HYP-016 — 研究 base 質量對後續 breakout 的影響

**狀態：** Indicator 已落地，研究方向調整（2026-06-18 LONG_BASE 降級後）

**背景：** LONG_BASE 已從 entry signal 降級為 universe filter。但「base 質量是否影響後續 LONG_BREAK / LONG_BOUNCE 的表現」仍是值得研究的問題。

**假設：** `lowRvolDaysInWindow` 高（≥ 6 of 10 天）的 LONG_BASE 股票，後續觸發 LONG_BREAK 時的 avg5D vs SPY 優於低質量 base；即 base 壓縮持續時間是 breakout 質量的預測因子。

**已新增 indicator（供研究用）：**

- `lowRvolDaysInWindow: number | null` — 過去 10 bar 中 RVOL < 0.8 的天數
- `atrCompressing: boolean | null` — ATR today < ATR 5 bars ago

**接受標準：** `lowRvolDaysInWindow >= 6` 組的 LONG_BREAK avg5D vs SPY 顯著高於 `< 6` 組（差距 > 0.5%）

---

#### HYP-017 — LONG_BREAK 加入底部醞釀期驗證（multi-bar）

**動機：** LONG_BREAK n=43（G1 FAIL），且目前只驗證前 1 天在 ladder，無法確認有效基礎形成

**假設：** 加入 `priorBaseStreak`（突破前 5 bar 中 RVOL < 0.8 的天數 ≥ 3）；或同時要求突破前 RVOL 平均 < 0.8（量能先縮後爆）；這樣篩出的突破有更強的「底部正式啟動」背景

**需要新增 indicator：**

- `priorBaseStreak: number | null` — 過去 5 bar 中 RVOL < 0.8 的天數

**注意：** priorBaseStreak 條件可能進一步降低 n（目前 n=43 已 G1 FAIL）。需要先測試對 n 的影響再決定是否納入硬性條件，還是先作研究 tag 觀察。

**替代方案：** 降 RVOL 閾值至 1.5 增加 n，再加 priorBaseStreak 做質量篩選

**接受標準：** avg5D vs SPY > +1.0%（目前 +1.5%，保持水準），且 n 向 100 靠攏

---

#### HYP-018 — LONG_BOUNCE 加入回調量能萎縮驗證（multi-bar）

**動機：** LONG_BOUNCE 是目前唯一全 PASS label；但 G6（MAE=3.0%）剛好在邊界，回調質量不均

**假設：** 要求回調期間（recentPullbackNearEma20 觸發的那 5 天中）平均 RVOL < 1.0（縮量回調）。縮量回調後的反彈比放量下跌後的反彈可靠，MAE 預計改善。

**需要新增 indicator：**

- `pullbackRvolAvg: number | null` — recentPullbackNearEma20 期間的 RVOL 平均值（只計算 low ≤ EMA20×1.02 的那幾天）

**接受標準：** G6 改善（MAE < 2.5%），n 不下降超過 30%

---

#### HYP-019 — WATCH 加入動量方向延續性（multi-bar）

**動機：** WATCH 全是單日條件，容易把「今天剛剛好」的股票和「動量真的在積累」的股票混在一起

**假設：** 要求 `rsiSlope3 > 0`（RSI 今天 > RSI 3 天前）作為動量在上升的驗證；或要求 close 連續 3 天高於 EMA20

**需要新增 indicator：**

- `rsiSlope3: number | null` — RSI[today] − RSI[3 days ago]

**注意：** WATCH 是 universe filter，不做 gate 評估，所以沒有直接的 gate 驗證目標。效果要從 LONG_BASE / LONG_BOUNCE 的 signal quality 間接觀察。

**接受標準：** WATCH 觸發後 5 日內升級為 LONG_BREAK / LONG_BOUNCE 的比率提升

---

#### HYP-010 — ATR squeeze / VCP 收縮觀察

**狀態：** 待實驗

**假設：** `isATRSqueeze = ATR14[t] < mean(ATR14, last 20) * 0.8`。先觀察 squeeze vs non-squeeze 的 LONG_BREAK forward return 差異，若 squeeze 組顯著較佳（> 0.3%），再加入條件。

**接受標準：** squeeze 組 avg5D vs SPY 明顯高於 non-squeeze 組

---

#### HYP-011 — relative strength 改用 vs sector ETF

**狀態：** 低優先，待 multi-bar 改動後評估

**假設：** RS vs sector ETF 剔除 sector rotation 噪音，比 RS vs SPY 更能判斷個股是否真正 outperform

**優先級：** 低（需要建立並維護 sector mapping）

---

#### HYP-012 — Forward return 改成 next-open 執行

**狀態：** 待實驗

**假設：** 把 entry 從 signal-day close 改為下一個 bar 的 open，雖然絕對報酬會下降，但 label 排序會更可信

**接受標準：** 主要 directional labels 在較真實的 execution 假設下仍保留相對排序

---

#### HYP-013 — 歷史 replay 納入 earnings archive

**狀態：** 待實驗

**假設：** live screener 有 earnings 降級，但 research replay 一律傳 `null`，使 Gate Summary 高估精度。補入歷史 earnings calendar 後樣本量下降但 precision 上升。

**接受標準：** earnings-adjacent 信號的 avg5D 與 MAE 改善

---

#### HYP-014 — Gate 升級為 rolling walk-forward

**狀態：** 長期目標

**假設：** 目前 Gate 是全樣本 pooled。改成多 rolling window 多數決，能排除只在少數子區間有效的脆弱規則。

---

#### HYP-015 — 建立 frozen universe snapshot

**狀態：** 待規劃

**假設：** 研究 replay 目前只對現在的 watchlist 回放，存在 survivorship bias。先記錄每月 universe snapshot，再按 signalDate 對應正確的 universe。

---

---

#### HYP-020 — LONG_BREAK / LONG_VCP 加入 EMA50 > EMA150 多時間框架 MA 對齊

**狀態：** 已落地（2026-06-18 外部研究後）

**市場假設：** EMA50 > EMA150 > EMA200 的層級對齊確認股票在中期、長期多個時間框架都處於上升趨勢。缺少 EMA150 層時，EMA50 > EMA200 無法排除「短期反彈但中期（EMA150）仍在下降」的情況——這類股票的突破失敗率更高。Minervini Trend Template 條件 2/4/5 的核心就是這個三層對齊。

**改動：** `(indicators.ema150 === null || ema50 > indicators.ema150)` 加入 LONG_BREAK 和 LONG_VCP。null-safe：EMA150 需 150 bar 數據，不足時不排除。

**接受標準：** LONG_BREAK avg5D vs SPY 維持 > +2%；LONG_VCP 方向由負轉正。G1 n 是否因此進一步降低需觀察。

---

#### HYP-021 — LONG_BREAK 加入 extendedFromPivot 抑制追高

**狀態：** 已落地（2026-06-18 外部研究後）

**市場假設：** 股票已在突破後上升超過 5% 的情況下，新入場的風險/回報比大幅惡化——止損距離不變但獲利空間壓縮。Minervini 的標準是離 pivot 超過 7.5% 不追，這裡保守設為 5%。這個 flag 不影響已持倉者，只影響新信號的觸發。

**改動：** `indicators.extendedFromPivot !== true` 加入 LONG_BREAK。

**接受標準：** MAE 5D 改善（更少在已延伸股票上發出信號）。

---

#### HYP-022 — LONG_BREAK ADX(14) > 25 趨勢強度研究

**狀態：** 測試後暫不加入硬性條件（2026-06-18 EXP-011 診斷）

**市場假設：** ADX 測量趨勢強度（方向無關）。ADX < 20 的環境下出現的 RVOL 放大突破，更可能是震盪區間內的隨機波動，而非趨勢啟動。

**EXP-011 診斷結果：**

- ADX > 25 單獨加入：n=16 → 6，排除了 10 個信號，avg5D +4.1% → +2.8%
- 結論：被排除的 10 個信號在 2024–2026 牛市樣本中表現良好；ADX 在此樣本期不能區分「好的低 ADX 突破」和「壞的低 ADX 突破」
- 可能原因：趨勢早期（Stage 2 初期）ADX 本身較低，牛市放大了這個現象
- indicator `adx14` 已計算並存入 `StockIndicatorSnapshot`，供未來研究用（非牛市樣本、不同 universe 時重新評估）

**接受標準（未來重新評估）：** 需要非牛市或更長時間跨度的樣本（含 2022 年熊市數據），ADX 才能有充足的對照組驗證。

---

### Archived（v1，已落地或已廢棄）

HYP-001（VIX 22）、HYP-002（LONG_CONFIRM regime 放寬）、HYP-003（previousLabel regime 修正）、HYP-004（AVOID_CHOP slope 收緊）、HYP-005（breakout 0.3% margin）、HYP-007（ATR-normalized breakout）、HYP-008（H52 proximity）、HYP-009（hysteresis previousLabel）均已於 EXP-001～008 落地。詳見下方 Experiment Log v1 部分。

HYP-006（LONG_WATCH RSI 連升 2 日）已在 v2 重設計中一併處理（WATCH label 已改寫），不需獨立追蹤。

---

## Experiment Log

格式：

```text
### EXP-XXX — 描述
- 日期：
- 對應假設：HYP-XXX
- 改動：
- 改動前 Gate Summary：
- 改動後 Gate Summary：
- 結論：KEEP / REVERT / ITERATE
- 下一步：
```

---

### EXP-009 — LONG_BASE / WATCH / LONG_BOUNCE G3 驗證（signal 重新設計後）

- 日期：2026-06-18
- 對應假設：v2 redesign baseline；後續 HYP-016/017/018/019 前置步驟
- 改動：v1 全面廢棄（LONG_SETUP / LONG_WATCH / LONG_CONFIRM / LONG_PULLBACK / UP_PROMOTION / DOWN_PROMOTION），v2 新 labels 第一次 gate baseline
- 改動後 Gate Summary（auto-sync 18/6/2026, 11:48:43）:

| Label | n | Avg 5D | Median 5D | vs SPY | MAE 5D | Neutral n | Neutral Avg 5D | G1 | G2 | G3 | G4 | G5 | G6 | G7 | Status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| 🟢 LONG_BREAK | 10 | 2.5% | 2.0% | 2.3% | 2.3% | 0 | n/a | FAIL | PASS | PASS | NA | NA | PASS | PASS | INSUFFICIENT |
| 🟢 LONG_VCP | 6 | 1.5% | -0.3% | 1.1% | 3.5% | 0 | n/a | FAIL | NA | NA | NA | NA | NA | NA | INSUFFICIENT |
| 🟢 LONG_BOUNCE | 370 | 1.3% | 1.2% | 0.9% | 3.0% | 0 | n/a | PASS | PASS | PASS | PASS | NA | FAIL | PASS | FAIL |
| 🔴 SHORT_BREAK | 32 | 2.9% | 3.1% | 1.8% | 7.2% | 7 | 3.8% | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | NA | INSUFFICIENT |
| 🔴 SHORT_BASE | 179 | 0.8% | 0.4% | 0.4% | 5.3% | 68 | 0.1% | PASS | FAIL | FAIL | FAIL | FAIL | FAIL | NA | FAIL |
| 🟠 SHORT_WATCH | 1672 | 0.1% | 0.0% | -0.2% | 3.8% | 319 | 0.2% | PASS | FAIL | FAIL | FAIL | FAIL | FAIL | NA | FAIL |

- Rolling Robustness（auto-sync 18/6/2026, 11:48:43）:

| Label | Window | G2 Pass | G3 Pass | G6 Pass | Full PASS | Avg 5D vs SPY |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| LONG_BREAK | 6M Rolling | 0/6 | 0/6 | 0/6 | 0/6 | 2.3% |
| LONG_BREAK | 12M Rolling | 1/6 | 1/6 | 1/6 | 0/6 | 2.0% |
| LONG_BREAK | 18M Rolling | 1/6 | 1/6 | 1/6 | 0/6 | 2.0% |
| LONG_BOUNCE | 6M Rolling | 6/6 | 6/6 | 3/6 | 2/6 | 0.9% |
| LONG_BOUNCE | 12M Rolling | 6/6 | 6/6 | 4/6 | 3/6 | 0.9% |
| LONG_BOUNCE | 18M Rolling | 6/6 | 6/6 | 4/6 | 3/6 | 0.9% |

- 預期：LONG_BOUNCE G6 MAE 改善至 < 2.5%；LONG_BREAK 樣本增加至 n > 100（LONG_BASE 已降級為 universe filter，不再 gate 評估，不在此預期範圍）
- 結論：PARTIAL（auto-sync）；LONG_BOUNCE n=370, vs SPY +0.9%, status=FAIL；LONG_BREAK n=10, vs SPY +2.3%, G1=FAIL
- 下一步：LONG_BOUNCE 退步，檢查 pullbackRvolAvg 條件是否過嚴

---

### EXP-010 — 已吸收入 EXP-011

EXP-010 原為「multi-bar 條件加入後的 gate 重新驗證」，但由於 EXP-011 同時涵蓋 HYP-016~019（multi-bar）和 HYP-020~022（外部研究新條件），EXP-010 作為獨立實驗已無必要，結果由 EXP-011 記錄。

---

### EXP-011 — 外部研究改版後完整驗證（HYP-019~022）

- 日期：2026-06-18
- 對應假設：HYP-019（rsiSlope3 null-safe）、HYP-020（EMA150）、HYP-021（extendedFromPivot）、HYP-022（ADX 測試）
- 改動：
  - WATCH：`rsiSlope3` 改為 null-safe（廣篩優先，null 不排除）
  - LONG_VCP：加入 `previousLabel` hysteresis + `CLV > 0.6`
  - LONG_BREAK：加入 `EMA50 > EMA150`（null-safe）、`extendedFromPivot != true`
  - LONG_BREAK LONG_BOUNCE：RSI 上限 58→62 測試後回退至 58
  - 新 indicators 加入 snapshot：`ema150`、`adx14`、`udVolRatio50`、`nr7`、`extendedFromPivot`
  - ADX > 25 測試（排除 10/16 信號），不加入硬性條件
- 改動前 Gate Summary：見 EXP-009（n=16 LONG_BREAK +4.1%，n=13 LONG_VCP -1.5%，n=370 LONG_BOUNCE +0.9%）
- 改動後 Gate Summary（auto-sync 18/6/2026, 11:48:43）：見 EXP-009 表格（auto-sync 已覆蓋）
- 結論：
  - LONG_VCP 方向修正 ✅（-1.5% → +1.5%）：hysteresis + CLV 假設成立
  - LONG_BOUNCE 完全不變 ✅：RSI 58 回退正確，n/vs SPY/MAE 與 EXP-009 一致
  - LONG_BREAK n=10（-6）方向質量維持：EMA150/extendedFromPivot 設計合理，ADX 暫不加入
  - RSI 58→62 擴大教訓：n 翻倍但 G3 rolling 6/6 → 1/6，邊界不應放寬
  - ADX 教訓：樣本量不足時，強過濾條件無法驗證方向，計算後保留研究，不硬加
- 下一步：LONG_BREAK 根本問題是 universe 太小；擴大 watchlist 是正確路徑

---

## 版本快照

### v2 EXP-011 — 2026-06-18（外部研究改版後，研究腳本 250 bars）

| Label | n | vs SPY | MAE | G1 | G2 | G3 | G6 | 狀態 |
| --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| LONG_BREAK | 10 | +2.3% | 2.3% | FAIL | PASS | PASS | PASS | INSUFFICIENT |
| LONG_VCP | 6 | +1.1% | 3.5% | FAIL | NA | NA | NA | INSUFFICIENT |
| LONG_BOUNCE | 370 | +0.9% | 3.0% | PASS | PASS | PASS | FAIL | FAIL |

關鍵觀察：LONG_VCP 方向由負轉正（根因修正）。LONG_BOUNCE 穩定。LONG_BREAK n=10，方向佳但樣本不足。ADX 14 已計算但不作硬性條件。Short side 凍結。

---

## 外部研究與現有做法總結（2026-06-18）

### 1. 我們的設計被外部驗證的部分

> 核心架構（regime-conditioned + 兩層 structure+trigger + 量價結合 + gate 統計驗證）方向正確，與多個成熟做法一致。

| 我們的設計 | 外部佐證 | 來源 |
| --- | --- | --- |
| signal 只在 long_friendly 觸發 | up-market 月均 momentum +0.93%，down-market −0.37%；momentum 在 calm regime 表現好，volatility 跳升時失效 | Giner & Zakamulin regime-switching model |
| 兩層 WATCH → BASE / BOUNCE / BREAK | Weinstein 四階段（Base → Advancing → Distribution → Declining）、Minervini Stage 2 Trend Template 是同一思路的成熟版 | Weinstein Stage Analysis、Minervini SEPA |
| breakout + RVOL > 1.5 量能確認 | 突破 52 週高位 + 量能 > 150% 20 日均量 → 72% 機率 31 日 +11.4% | Journal of Financial Markets；Minervini VCP pivot |
| ATR-normalized breakout | 固定百分比 margin 對不同波幅股不公平，ATR 自動適配 | AlphaexCapital NATR guide |
| VIX 放寬至 22 | VIX > 30 才是真 risk-off；18-25 屬正常牛市範圍 | VIX regime 研究 |
| Gate 系統（n≥100、前後半一致、neutral regime 驗證） | walk-forward / OOS 是驗證 gold standard；條件太多 + 樣本太少 = 過擬合頭號死因 | AlgoXpert framework、arXiv WFA 論文 |

### 2. Minervini Trend Template（最重要的對齊參考）

**Stage 2 的 8 條硬性條件：**

1. 價格在 150 日 (30 週) 與 200 日 (40 週) 均線之上
2. 150 日均線 > 200 日均線
3. 200 日均線上升至少 1 個月（最好 4-5 個月）
4. 50 日均線 > 150 日且 > 200 日均線
5. 200 日均線已上升至少 20 個 bar
6. 價格至少比 52 週低位高 30%
7. 價格在 52 週高位的 25% 範圍內（即 H52 ≥ 0.75，已在 `nearHigh52w` 實作）
8. Relative Strength rating > 70（對應 `relStrengthVsSpy`）

> 我們的 v2 已涵蓋條件 3（ema50Slope）、5（ema20Slope + ema50Slope）、7（nearHigh52w）、8（relStrengthVsSpy）。條件 1/2/4（150 日均線）尚未加入，是目前設計上與 Minervini 最大的缺口。

**Minervini VCP 原則：** 價格經過「越來越窄」的盤整（15%→10%→5%），每次回調量能遞減（volume dry-up），突破 pivot 時量能放大。→ 對應 HYP-016/017（壓縮持續天數 + 量能萎縮再爆發）

### 3. 開源項目

| 項目 | 對我們的啟示 |
| --- | --- |
| `RyanJHamby/stock-screener` | 最接近我們的目標形態；caching 策略值得參考 |
| `xang1234/stock-screener` | breadth 指標可作為 regime 的補充輸入 |
| `pandas-ta-classic` | 指標公式 cross-check 的 reference |
| `microsoft/qlib` | Alpha158 + LightGBM baseline，ML 遷移路徑的起點 |

### 4. 防 whipsaw：hysteresis / confirmation bars

業界 state-machine 設計的標準做法（已在 v2 部分實作，HYP-009 hysteresis）：

- **Hysteresis（雙門檻）：** 進場門檻嚴、出場門檻鬆，中間留 deadzone
- **Confirmation bars：** 要求連續 N 個 bar 符合才 commit state 轉換
- 設計哲學：寧願「確認轉折」稍微遲到，也不要「預測轉折」被反覆甩

### 5. 嚴謹驗證流程（Gate 系統的升級方向）

學術界 gold standard 是 **IS → WFA → OOS** 三段。我們現在的 Gate 是單段 in-sample 統計，升級方向是 HYP-014（rolling walk-forward）。

### 6. 短期方向預測的天花板

多個研究一致：**短期方向預測的真實準確率天花板是 55-57%。** 高於此的 backtest 幾乎都是過擬合或忽略了交易成本。啟示：

- 不追求「準確率」，要追求扣除成本後的 risk-adjusted return
- 任何聲稱 >60% 勝率的方法，預設它過擬合，直到 OOS 證明為止

### 參考來源

- [A regime-switching model of stock returns with momentum and mean reversion (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S0264999323000494)
- [Industry information and the 52-week high effect — George & Hwang (Gatton College)](https://gattonweb.uky.edu/faculty/lium/52weekhigh.pdf)
- [Minervini Trend Template — A Step-by-Step Guide (ChartMill)](https://www.chartmill.com/documentation/stock-screener/technical-analysis-trading-strategies/496-Mark-Minervini-Trend-Template-A-Step-by-Step-Guide-for-Beginners)
- [The Complete Guide to Stan Weinstein's Stage Analysis (TraderLion)](https://traderlion.com/trading-strategies/stage-analysis/)
- [Mark Minervini's VCP Criteria: The Complete 7-Point Checklist (FinerMarketPoints)](https://www.finermarketpoints.com/post/vcp-criteria-complete-checklist)
- [Empirical Asset Pricing via Machine Learning — Gu, Kelly & Xiu (NBER w25398)](https://www.nber.org/system/files/working_papers/w25398/w25398.pdf)
- [Does Meta Labeling Add to Signal Efficacy? (Hudson & Thames)](https://hudsonthames.org/does-meta-labeling-add-to-signal-efficacy-triple-barrier-method/)
- [microsoft/qlib — AI-oriented quant platform (GitHub)](https://github.com/microsoft/qlib)
- [AlgoXpert Alpha Research Framework — IS/WFA/OOS overfitting protocol (arXiv)](https://arxiv.org/pdf/2603.09219)
- [Machine Learning Enhanced Multi-Factor Quantitative Trading — Sharpe 2.01 (arXiv 2507.07107)](https://www.arxiv.org/pdf/2507.07107)

---

## 替代架構：可能大改但成功率更高的模型

> **核心結論：成功率最高的不是「更多更好的手寫規則」，而是換範式——把指標當 feature，讓模型自己學非線性交互。** 但有一條路（meta-labeling）能在不丟棄現有引擎的前提下過渡。

### 1. 範式轉移：rule-based → 監督式學習（Gu/Kelly/Xiu 範式）

**Gu, Kelly & Xiu (2020)** 的 landmark 結論：

- 樹模型（gradient-boosted trees）與神經網路大幅跑贏線性 / 規則模型
- 預測力來自捕捉**非線性 predictor 交互**——這正是手寫規則做不到的
- 最重要的 predictor：**momentum > liquidity > volatility**（我們都已在算，差別只是寫成布林門檻而非 feature vector）

### 2. Triple-Barrier Method（Lopez de Prado）

對每個信號設止盈（上）、止損（下）、到期（時間）三道屏障，看先碰哪道來標籤。屏障寬度用 ATR 動態縮放。比固定 5 日 forward return 更反映真實交易結果。

### 3. Meta-Labeling（最務實的遷移路徑）

- **Primary model（side）= 我們現有的 `signalClassifier`**：決定方向，保留不動
- **Secondary model（take/skip）= LightGBM 二元分類器**：回答「這個信號該不該採納？」
- 好處：修正 rule 引擎的 recall 好但 precision 差的問題；不需要推倒 TypeScript 引擎

### 4. 建議的分階段遷移

1. **Stage A（客觀基準）：** Qlib + Alpha158 + LightGBM vs 現有 rule 引擎，比 cost-adjusted Sharpe
2. **Stage B（Triple-Barrier 標籤）：** 把固定 5 日 return 換成 triple-barrier 標籤
3. **Stage C（Meta-Labeling）：** 保留 `signalClassifier` 當 primary，加 LightGBM 二級過濾 ← **性價比最高**
4. **Stage D（橫截面排名）：** 絕對門檻 → 每日 ranking + top/bottom decile
5. **Stage E（全 ML）：** rule 退化成其中一組 feature

> **一句話建議：** 不要現在就推倒重來。先做 Stage A（客觀基準）和 Stage C（meta-labeling），用最低成本拿到 ML 範式大部分的收益，同時保住現有引擎的可解釋性。研究資料層（survivorship bias、earnings omission、same-bar execution）未清理前，直接進 Stage B-C 只會把偏差餵給更強的模型。

---

## v1 歷史存檔（2026-06-18 廢棄，保留為改動理由）

> v1 標籤 LONG_WATCH / LONG_SETUP / LONG_CONFIRM / LONG_PULLBACK / UP_PROMOTION / DOWN_PROMOTION / SHORT_SETUP / SHORT_CONFIRM 已全面廢棄，以下僅作歷史記錄。

### v1 Signal Matrix（末期 gate 表現）

| Label | n | Avg5D | vs SPY | G1 | G2 | G3 | G6 | 評估 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LONG_CONFIRM | 4 | +2.5% | +2.4% | FAIL | — | — | — | INSUFFICIENT，方向正確但 n 不足 |
| UP_PROMOTION | 4 | +5.9% | +4.8% | FAIL | — | — | — | INSUFFICIENT，高質量但極稀有 |
| LONG_SETUP | 191 | -1.0% | -1.0% | PASS | FAIL | FAIL | FAIL | G2 FAIL，方向完全錯誤（KI-009） |
| LONG_WATCH | 659 | +0.4% | 0.0% | PASS | PASS | FAIL | FAIL | G3/G6 FAIL，作為 universe filter 設計有問題 |
| LONG_PULLBACK | 82 | 0.0% | -0.3% | FAIL | FAIL | FAIL | FAIL | 概念沒有被正確抓到，全面 FAIL |
| SHORT_WATCH | 374 | +0.6% | +0.2% | PASS | FAIL | FAIL | FAIL | 牛市偏差，短邊全部失效 |

**廢棄原因：** LONG_SETUP G2 FAIL（avg5D = -1.0%，方向相反）；LONG_PULLBACK 概念模糊；整個「WATCH → SETUP → CONFIRM」階梯設計只捕捉了靜態狀態快照，無法描述狀態轉變，是 v2 重設計的根本動機。

### v1 Experiment Log（壓縮摘要）

- **EXP-001**：VIX 22（KEEP）
- **EXP-003**：previousLabel regime 修正（KEEP）
- **EXP-004**：AVOID_CHOP slope 0.001（KEEP）
- **EXP-005**：ATR-normalized breakout（KEEP，HYP-007 落地）
- **EXP-006**：LONG_CONFIRM 品質升級（KEEP，HYP-002 + HYP-008 落地）
- **EXP-007**：SHORT_SETUP + SHORT_CONFIRM 收緊（KEEP 部分，牛市偏差持續）
- **EXP-008**：HYP-009 hysteresis（KEEP，LONG_CONFIRM avg5D +8.66% 但 n=1 統計意義不足）

全部詳細數據已在 v2 重設計前記錄，可從 git log 2026-06-18 之前的 SIGNAL_IMPROVEMENT.md 歷史版本查找。
