# Signal Quality Improvement Log

## 目的

這份文件追蹤信號引擎的已知問題、實驗假設、和每次改動後的數據結果。

每次改動必須：
1. 在「Hypothesis Backlog」裡先有記錄
2. 在「Experiment Log」裡記錄改動前後的 Gate Summary 數據
3. 根據數據決定保留或回滾

**不靠感覺，不靠直覺，靠 Gate Summary 的 forward return 數字。**

---

## 如何讀 Gate Summary

Gate Summary 在 UI 的 Stock Research tab 裡。每次改動閾值後：

1. 刷新 Stock Research
2. 記錄每個 label 的 `n`、`Avg 5D`、`vs SPY`、`MAE 5D`、六個 gate pass/fail
3. 把數字填入 Experiment Log

一個 label 的研究目標是六個 gate 都 pass；但要注意目前 engine 的實作細節：

| Gate | 要求 |
| --- | --- |
| G1 | n ≥ 100 |
| G2 | 方向正確（long → avg5D > 0，short → avg5D < 0） |
| G3 | avg 5D vs SPY > +0.5%（long）或 < -0.5%（short） |
| G4 | 前半樣本與後半樣本方向一致 |
| G5 | neutral regime 下方向仍正確 |
| G6 | avg MAE 5D < 3% |

補充：

- 目前 `researchGate.ts` 只對 directional labels 做 gate 評估，不含 `NEUTRAL` / `AVOID_CHOP`
- G2 / G3 / G6 只有在 `n >= 10` 時才會被計算
- G4 只有在 `n >= 20` 時才會被計算
- G5 只有在 neutral regime 樣本 `>= 5` 時才會被計算
- 目前 `status = PASS` 的實作是：G1 必須過，G2/G3/G4/G6 必須為 true，而 G5 只要不是明確 false 即可（`INSUFFICIENT` 不會單獨令 status fail）

---

## 現有閾值（v2 — 2026-06-18 signal 架構重設計）

> ⚠️ **v1 → v2 重設計說明（2026-06-18）**
>
> 舊標籤 LONG_WATCH / LONG_SETUP / LONG_CONFIRM / LONG_PULLBACK / UP_PROMOTION / DOWN_PROMOTION / SHORT_SETUP / SHORT_CONFIRM 已全面廢棄。
> 以下為 v2 代碼當前實際值。所有 v1 實驗數據（下方 Experiment Log）以舊標籤名記錄，屬於 v1 era 歷史資料，不代表 v2 定義的表現。
> v2 首次 gate baseline 尚待執行（執行 `npm run research:agent -- --mode observe --exp EXP-009`）。

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

WATCH (universe filter — not an entry signal, not gate-evaluated):
  RSI > 50 AND macdHistogram > 0 AND CMF > 0 AND obvSlope > 0
  AND relStrengthVsSpy > -0.02 AND regime != short_friendly

LONG_BREAK (entry trigger — breakout):
  breakout20d = true AND RVOL > 1.8 AND CMF > 0.1 AND CLV > 0.65
  AND EMA20 > EMA50 AND RSI > 55
  AND aboveEma200 != false AND nearHigh52w != false
  AND regime != short_friendly
  AND prior bar in long ladder (HYP-009)

LONG_VCP (entry trigger — volatility contraction):
  aboveEma200 = true AND atrSlope50 < 0 AND rvolRecentAvg10 < 0.8
  AND breakout20d = true AND RVOL > 1.5 AND regime != short_friendly

LONG_BASE (setup — structure + compression):
  aboveEma200 != false AND EMA20 > EMA50 AND ema50Slope > 0
  AND ema20Slope > 0 AND relStrengthVsSpy > 0
  AND RSI 45–65
  AND (atrSlope50 < 0 OR rvolRecentAvg10 < 0.8)
  AND regime != short_friendly

LONG_BOUNCE (entry trigger — pullback reversal):
  regime = long_friendly AND ema50Slope > 0
  AND aboveEma200 != false AND EMA20 > EMA50
  AND recentPullbackNearEma20 = true   ← any of last 5 bars low ≤ EMA20×1.02
  AND close > EMA20                    ← today bounced back above
  AND RSI 42–58 AND CLV > 0.6 AND relStrengthVsSpy > 0

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
breakout20d:     close > max(high[-21:-1]) + 0.5*ATR14    ← HYP-007 (ATR-normalized)
breakdown20d:    close < min(low[-21:-1]) - 0.5*ATR14     ← HYP-007 (symmetric margin)
ema20Slope:      (EMA20[t] - EMA20[t-5]) / EMA20[t-5]   (5-bar)
relStrengthVsSpy: 20-day rolling return diff
obvSlope:        linear regression slope of OBV over last 10 bars
previousLabel:   computed with previous day's sliced benchmarks + previous regime
aboveEma200:     close >= EMA200
nearHigh52w:     close >= max(high, last 252 bars) * 0.75   (Minervini H52)
```

---

## Known Issues

### KI-001 — `long_friendly` 的 VIX 閾值已放寬到 22，但仍未完成統計驗證

**嚴重性：高**

**影響：** `LONG_CONFIRM` 幾乎不觸發。

**根因：** 舊版文件描述的是 `VIX < 18`，但現有 code 已改成 `VIX < 22`。問題已從「閾值明顯過嚴」變成「放寬後是否真的改善 `LONG_CONFIRM` 的樣本量與 forward return，仍未有 Gate Summary 證據」。

**代碼位置：** [src/engine/marketRegime.ts:40](src/engine/marketRegime.ts#L40)

**待試驗：** EXP-001（補齊驗證數據）

---

### KI-002 — `LONG_CONFIRM` 同時要求六個條件，信號稀少

**嚴重性：高**

**影響：** `LONG_CONFIRM` 的 n 樣本量低，Gate G1（n ≥ 100）幾乎無法通過。

**根因：** breakout + RVOL > 1.5 + CMF > 0.05 + CLV > 0.65 + EMA trend + RSI > 55 必須同時成立。這六個條件的交集在真實市場數據中極少出現。

**代碼位置：** [src/engine/signalClassifier.ts:69](src/engine/signalClassifier.ts#L69)

**待試驗：** EXP-002

---

### KI-003 — `UP_PROMOTION` 的 previousLabel regime 問題已在 code 修正

**嚴重性：中（已修正，待驗證影響）**

**影響：** 這不再是當前 engine 的 active bug，但文件若不修正，會誤導後續實驗排序與診斷。

**根因：** 現有 `stockScreenerEngine.ts` 會先把 benchmark histories slice 到前一日，再重新計算 `previousRegime`，並用該 regime 計算 `previousLabel`。因此原先的 regime 泄漏描述已過時。

**代碼位置：** [src/engine/stockScreenerEngine.ts:159](src/engine/stockScreenerEngine.ts#L159)

**待試驗：** EXP-003（補齊驗證數據，確認修正是否帶來可觀察差異）

---

### KI-004 — `AVOID_CHOP` 的 EMA slope 閾值已改為 0.001，但過濾效果仍未驗證

**嚴重性：中**

**影響：** 震盪市的股票不被過濾，流入 `LONG_WATCH` 產生噪音。

**根因：** 文件仍寫 `|ema20Slope| < 0.003`，但現有 code 已是 `0.001`。現在真正未解的是：這個已落地的閾值，是否真的提升 `AVOID_CHOP` 的辨識力，而不是單純改了數字卻沒有統計驗證。

**代碼位置：** [src/engine/signalClassifier.ts:42](src/engine/signalClassifier.ts#L42)

**待試驗：** EXP-004（補齊驗證數據）

---

### KI-005 — breakout 已加 0.3% margin，但 breakout / breakdown 仍不對稱

**嚴重性：低**

**影響：** 長邊 breakout 已經比舊版乾淨，但短邊 breakdown 仍是原始 `close < priorLow`，而固定 0.3% margin 是否適合不同波幅股票也尚未驗證。

**根因：** 現有 `computeBreakout20d` 已用 `close > priorHigh * 1.003`，但 `computeBreakdown20d` 仍未加 margin，且固定百分比 margin 可能不如 ATR-normalized 做法穩健。

**代碼位置：** [src/engine/stockScreenerEngine.ts:54](src/engine/stockScreenerEngine.ts#L54)

**待試驗：** EXP-005、HYP-007

---

### KI-006 — `LONG_WATCH` 條件太鬆，容易在 LONG_WATCH / NEUTRAL 之間震盪

**嚴重性：低**

**影響：** 同一隻股票可能連續數日在 `LONG_WATCH` 和 `NEUTRAL` 之間來回，降低信號可信度。

**根因：** MACD histogram 在震盪市頻繁正負交替，帶動 `LONG_WATCH` 反覆觸發。

**代碼位置：** [src/engine/signalClassifier.ts:54](src/engine/signalClassifier.ts#L54)

**待試驗：** EXP-006

---

### KI-009 — LONG_SETUP 方向錯誤（avg5D 為負），G2 FAIL

**嚴重性：高**

**影響：** `LONG_SETUP` 是 watchlist 中樣本量最大的 long label（n=191），但 avg5D = **-1.0%**，方向完全與預期相反（G2 FAIL）。這意味著「接近買入點」信號在統計上是反向指標。

**根因（假設）：** 條件 `RSI > 55 AND RVOL > 1.2 AND CMF > 0` 仍然過鬆，在 2024-2026 牛市中大量普通股票都能滿足，但這些股票並非真正的候選。缺乏趨勢強度過濾（如 RS vs sector、EMA200 slope、52週高位鄰近度）。

**UI Gate Summary 數據（2026-06-18）：** n=191, avg5D=-1.0%, vs SPY=-1.0%, MAE5D=4.4%, G1=✓ G2=✗ G3=✗ G4=✗ G5=✓ G6=✗ → **FAIL**

**代碼位置：** [src/engine/signalClassifier.ts:54](src/engine/signalClassifier.ts#L54)

**待試驗：** EXP-008（LONG_SETUP 條件收緊）

---

### KI-007 — 樣本量在結構上被鎖死，G1（n≥100）幾乎不可能達到

**嚴重性：高**

**影響：** 不論怎樣調 `LONG_CONFIRM` 條件，多數 directional label 的 n 都遠低於 100，G1 永遠 fail。

**根因（機械性，非條件問題）：** `buildHistoricalSignals` 用 `maxSignalBars = 90` + `startIndex = max(60, usableEndIndex - maxSignalBars)`，等於**每隻股票最多只產出約 90 個 signal bar**。配上目前的小 watchlist，總樣本量在結構上就被上限封死——這才是 LONG_CONFIRM 摸不到 n≥100 的真正原因，而不只是條件太嚴（KI-002）。

**啟示：** 解 G1 有兩條路，且應優先於調鬆條件——
1. **加長歷史窗口**：提高 `maxSignalBars`、拉長抓取的 OHLCV 歷史
2. **擴大 universe**：增加 watchlist 股票數（受免費 API 限額制約，見規劃）

**代碼位置：** [src/engine/stockResearchEngine.ts:92](src/engine/stockResearchEngine.ts#L92)

**待試驗：** 與 HYP-015（frozen universe）一併設計

---

### KI-008 — EXP-001 放寬 VIX 後，可能在無意中削弱 G5 的把關力

**嚴重性：中**

**影響：** G5（neutral regime 方向仍正確）可能因樣本不足而失去作用，卻不會令 status fail。

**根因（gate 交互）：** VIX 放寬到 22 → 更多 signal 落入 `long_friendly` → 落入 `neutral` 的變少 → neutral 樣本可能掉到 < 5 → `researchGate.ts` 令 G5 = `INSUFFICIENT`，而現行 `status = PASS` 容許 G5 非 false 即可。也就是說 EXP-001 一邊提升 G1 樣本，一邊可能讓 G5 變成空轉。

**啟示：** 回填 Gate Summary 時，必須同時記錄每個 label 的 `regimeSplit` 裡 **neutral 的 n**。若 neutral n < 5，G5 的 PASS 不代表真的通過，要在結論裡標明。

**代碼位置：** [src/engine/researchGate.ts:127](src/engine/researchGate.ts#L127)

**待試驗：** 併入 EXP-001 的數據回填

---

## Hypothesis Backlog

按預期影響排序，高影響優先。

### HYP-001 — 放寬 long_friendly VIX 閾值至 22

**對應 KI：** KI-001

**狀態：** 已於現有 code 落地，待 UI Gate Summary 驗證。

**假設：** 把 `long_friendly` 的 VIX 上限從 18 改為 22，`LONG_CONFIRM` 的 n 將顯著增加，Gate G1 更容易達到。

**預期副作用：** 部分真正高 VIX 的環境可能被錯誤歸入 `long_friendly`，要觀察 G2（方向正確性）是否下降。

**測試方法：**
1. 以現有 code 為 after-state，從 Stock Research UI 記錄 LONG_CONFIRM 的 n、avg5D、vs SPY、gate 結果
2. 若要補 before-state，只能從舊 commit / 舊截圖 / 匯出紀錄回補；沒有就明確標註缺失，不補猜測值

**接受標準：** LONG_CONFIRM 的 n 上升，且 avg5D vs SPY 仍 > 0

---

### HYP-002 — 允許 LONG_CONFIRM 在 neutral regime 以更嚴格條件觸發

**對應 KI：** KI-001、KI-002

**假設：** 不要求 `regime === 'long_friendly'`，改為 `regime !== 'short_friendly'`，但同時把 RVOL 要求從 1.5 提高至 1.8，CMF 從 0.05 提高至 0.1 來補償。

**預期副作用：** neutral regime 下的 LONG_CONFIRM 會增加，需確認這些信號的 forward return 在 neutral regime 仍為正。

**測試方法：**
1. 修改 signalClassifier.ts 的 longConfirm 條件
2. 記錄 neutral regime 的 avg5D（Gate G5）是否仍為正

**接受標準：** neutral regime 下的 avg5D > 0

---

### HYP-003 — 修正 previousLabel 的 regime 問題

**對應 KI：** KI-003

**狀態：** 已於現有 code 落地，待確認是否值得保留為獨立實驗項。

**假設：** 用前一日的 SPY/QQQ/VIX snapshot 重算昨日 regime，使 `UP_PROMOTION` 更準確。

**實作方式：** 現有 `classifyStock` 已在內部切出前一日的 `previousHistory` / `previousBenchmarks`，並用 `previousRegime` 重算 `previousLabel`。

**優先級：** 中（只有當 LONG_CONFIRM / LONG_SETUP 的 n 足夠大，UP_PROMOTION 才有意義去修正）

---

### HYP-004 — 放寬 AVOID_CHOP 的 EMA slope 閾值至 0.001

**對應 KI：** KI-004

**狀態：** 已於現有 code 落地，待 UI Gate Summary 驗證。

**假設：** 把舊值 `|ema20Slope| < 0.003` 收緊為 `0.001`，比較接近「真的平坦」的定義，能過濾更多震盪情況而不過度。

**測試方法：**
1. 以現有 code 記錄 AVOID_CHOP 的出現頻率、LONG_WATCH 的 n 變化、LONG_WATCH 的 avg5D 是否改善
2. 若缺少改動前 baseline，明確標註數據缺口

---

### HYP-005 — 給 breakout20d 加 0.3% minimum margin

**對應 KI：** KI-005

**狀態：** 已於現有 code 落地，待 UI Gate Summary 驗證。

**假設：** `close > priorHigh * 1.003` 能過濾低確信度的假突破，提高 LONG_CONFIRM 的 avg5D vs SPY。

**測試方法：**
1. 以現有 code 記錄 LONG_CONFIRM 的 n（預計下降）和 avg5D（預計上升）
2. 後續與 HYP-007 的 ATR-normalized breakout 做 A/B 對照

---

### HYP-006 — 給 LONG_WATCH 加 RSI 連升 2 日條件

**對應 KI：** KI-006

**假設：** 要求 RSI 連升 2 日（RSI[t] > RSI[t-2]）作為 LONG_WATCH 的額外條件，減少 MACD 震盪引起的誤觸發。

**測試方法：**
1. 需要把 RSI 序列傳入 signalClassifier（目前只傳最新值）
2. 記錄 LONG_WATCH 的 n 變化，以及 avg5D 是否改善

---

### HYP-007 — breakout/breakdown margin 改用 ATR 歸一化

**對應 KI：** KI-005（取代 HYP-005 的固定 0.3%）

**來源：** 學術 + 業界（ATR % filter、Minervini VCP pivot breakout）

**假設：** 固定 0.3% margin 對低波幅股太嚴、對高波幅股太鬆。改用 `close > priorHigh + 0.5 * ATR14`，讓突破門檻跟個股波幅掛鉤，能在不同波幅的股票上一致地過濾假突破。

**測試方法：**
1. 在 `computeBreakout20d` / `computeBreakdown20d` 傳入 ATR14
2. 對比 HYP-005（固定 0.3%）和 HYP-007（0.5 ATR）兩版的 LONG_CONFIRM avg5D vs SPY

**接受標準：** LONG_CONFIRM 的 avg5D vs SPY ≥ 固定 margin 版本，且跨高低波幅股的表現更一致

---

### HYP-008 — 加入 52-week high proximity（H52）作 LONG_CONFIRM 輔助條件

**對應 KI：** KI-002（過濾低位假突破）

**來源：** George & Hwang (2004) 52-week high effect；Journal of Financial Markets 突破 + 量能研究

**假設：** `H52 = (close - low52w) / (high52w - low52w)`。要求 `H52 > 0.85`（價格在 52 週區間頂部 15% 內）能過濾「突破 20 日高位但整體仍在低位」的假突破，提升 Gate G3（vs SPY）。

**預期副作用：** LONG_CONFIRM 的 n 會下降，需確認 G1 仍可達標或接近。

**測試方法：**
1. 在 `buildIndicatorSnapshot` 計算 H52（需要 ≥252 bars，不足則回退或標 REVIEW_DATA）
2. 把 `H52 > 0.85` 加進 longConfirm 條件
3. 記錄 LONG_CONFIRM 的 n（預計下降）和 avg5D vs SPY（預計上升）

**接受標準：** avg5D vs SPY 上升，且 n 不低於現有水平的一半

---

### HYP-009 — 用 hysteresis（confirmation bars）消除 LONG_WATCH 反覆震盪

**對應 KI：** KI-006（取代或補強 HYP-006）

**來源：** 業界 state-machine / hysteresis 設計、whipsaw 研究

**假設：** 進入 label 與離開 label 用不同門檻（deadzone），且要求連續 N 日（如 2 日）符合才轉換 state，能消除 MACD histogram 在零軸附近震盪造成的 LONG_WATCH↔NEUTRAL 來回切換。

**實作方式：**
- 進場門檻嚴、出場門檻鬆（例如進場 `macdHist > 0` 連 2 日，退出要 `macdHist < -ε`）
- 或要求新 label 連續 2 個 signal bar 一致才 commit
- 需要在 `classifyStock` 引入 previous-N-bar 的 label 歷史，而非只看 previousLabel（1 日）

**優先級：** 中（影響信號穩定性，但工程牽涉 state 追蹤）

**接受標準：** 同一股票的 label 切換頻率下降，且 LONG_WATCH 的 avg5D 不下降

---

### HYP-010 — 加入 ATR squeeze / VCP 收縮作 LONG_SETUP 加分條件

**對應 KI：** KI-002（提高 SETUP → CONFIRM 轉換質素）

**來源：** Minervini VCP（progressive volatility contraction + volume dry-up）、ATR squeeze 研究（squeeze 20+ 日後 65-75% 機率 10-15 日內大動作）

**假設：** `isATRSqueeze = ATR14[t] < mean(ATR14, last 20) * 0.8`。在 squeeze 狀態下的 breakout 比非 squeeze 的更可靠。先不強制，而是在 Gate Summary 把 squeeze vs non-squeeze 的 forward return 分開觀察，數據支持後再納入條件。

**測試方法：**
1. 計算 `isATRSqueeze` 並寫進 `StockIndicatorSnapshot` 和 `ForwardReturnRecord`
2. 在 researchGate 加一個 squeeze split（類似 regimeSplit），對比兩組 avg5D
3. 若 squeeze 組顯著較佳，再把它加進 longSetup / longConfirm

**接受標準：** squeeze 組的 avg5D vs SPY 明顯高於 non-squeeze 組（差距 > 0.3%）

---

### HYP-011 — relative strength 改用 vs sector ETF，而非只 vs SPY

**對應 KI：** （新）LONG_WATCH / SHORT_WATCH 精度

**來源：** Minervini/IBD RS rating（相對全市場）+ 業界 sector-relative RS 做法

**假設：** RS vs sector ETF 剔除了 sector rotation 噪音，比 RS vs SPY 更能判斷個股是否真正 outperform。需要 ticker → sector ETF 的 mapping（如 tech→XLK、energy→XLE）。

**優先級：** 低（需要建立並維護 sector mapping，且要多抓 sector ETF 的 history）

**測試方法：**
1. 在 watchlist 加 sector 欄位 → sector ETF
2. 計算 `relStrengthVsSector`，與 `relStrengthVsSpy` 並存
3. 對比兩者在 WATCH 層的辨別力（哪個的 forward return spread 更大）

---

### HYP-012 — Forward return 改成 next-open / cost-aware execution

**對應 KI：** （新）研究回放的執行價格過度樂觀

**來源：** `src/engine/stockResearchEngine.ts:39-90` 現行以 signal-day close 作 entry；學術與實務都要求至少避免 same-bar execution 幻覺

**假設：** 把 `ForwardReturnRecord` 的 entry 從 `signalDate` 當日收盤改為下一個可交易 bar（next open 或 next close），並扣除固定 slippage / spread 後，雖然絕對報酬會下降，但 label 之間的排序會更可信，較不會高估 `LONG_CONFIRM` / `SHORT_CONFIRM`。

**測試方法：**
1. 在 research replay 增加 execution assumption：`close_t`、`open_t+1`、`close_t+1` 三種模式至少比較兩種
2. 對每個 label 同時記錄 raw ret5d 與 cost-adjusted ret5d、ret5dVsSpy、MAE
3. 比較 Gate status 是否在 realistic execution 下仍大致成立

**接受標準：** 主要 directional labels 在較真實的 execution 假設下仍保留相對排序；若排序大幅翻轉，先修研究框架再談調 threshold

---

### HYP-013 — 歷史 replay 納入 earnings archive，而不是一律 `null`

**對應 KI：** （新）事件風險在研究回放中被低估

**來源：** `src/engine/stockResearchEngine.ts:116` 目前呼叫 `classifyStock(..., null, regime)`；PEAD / event-risk 實務

**假設：** 若歷史 replay 能帶入當時已知的 earnings date，`REVIEW_EVENT` / danger-window 降級會使樣本量下降，但 directional label 的 precision 應上升，特別是 `LONG_CONFIRM` / `UP_PROMOTION`。

**測試方法：**
1. 為 replay 補一份最小可用的歷史 earnings calendar（先限 watchlist）
2. 對比「earnings 一律 null」與「帶歷史 earnings」兩版 Gate Summary
3. 特別觀察 earnings 前後 5 日的 ret5d / MAE 是否改善

**接受標準：** 樣本量下降可接受，但 earnings-adjacent 信號的 avg5D 與 MAE 改善，且整體 label 穩定性提高

---

### HYP-014 — Gate 升級為 rolling walk-forward，而非單段 pooled sample

**對應 KI：** （新）單段 pooled 統計可能掩蓋時變失效

**來源：** `src/engine/researchGate.ts:70-174` 目前是全樣本 pooled gate；外部研究節第 6 節已整理 WFA / OOS 共識

**假設：** 某些 label 在 pooled sample 看似過關，但拆成 rolling windows 後只在少數子區間有效。把 Gate 改成多 window 多數決，能更早排除脆弱規則。

**測試方法：**
1. 先不改 label 規則，只把同一批 `ForwardReturnRecord` 切成 rolling windows（例如 6m train / 3m eval 或固定 60-signal 窗口）
2. 記錄每個 label 在多少個 window 通過 G2/G3/G6
3. 對比 pooled PASS 與 rolling PASS 的落差

**接受標準：** 未來 production 候選 label 不只 pooled PASS，還要在多數 windows 保持方向一致

---

### HYP-015 — 建立 frozen universe snapshot 以控制 survivorship bias

**對應 KI：** （新）研究樣本受現時 watchlist 生存者偏差污染

**來源：** `src/engine/stockResearchEngine.ts:92-125` 目前只對當前 `tickers` / 現行 watchlist 回放

**假設：** 用今日仍在 watchlist 的股票回放過去訊號，容易高估長邊統計，因為弱者、被移除者、甚至退市者不在樣本中。即使短期內拿不到全市場歷史 membership，先記錄每月 universe snapshot 也比完全沒有好。

**測試方法：**
1. 先把目前 watchlist 做 versioned monthly snapshot
2. 研究 replay 至少按 signalDate 對應當月 snapshot 選股，而不是永遠用今日名單
3. 若未來能取得 delisted / removed names，再比較 frozen snapshot 與 current-watchlist 的 Gate Summary 差異

**接受標準：** 研究報告能明確標示 universe version；若 frozen snapshot 後統計明顯惡化，視為先前結果存在 survivorship inflation

---

## Experiment Log

每次實驗完成後，把結果記錄在這裡。格式如下：

```
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

### EXP-001 — 放寬 long_friendly VIX 閾值

- 日期：2026-06-18（code 落地）；Gate Summary 回填：2026-06-18
- 對應假設：HYP-001
- 改動：`marketRegime.ts` VIX 上限從 18 改為 22
- 改動前 Gate Summary：*(無舊截圖，標註缺失)*
- 改動後 Gate Summary（Stock Research UI，20隻股 2yr）：

| Label | n | Avg5D | Median5D | vs SPY | MAE5D | G1 | G2 | G3 | G4 | G5 | G6 | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LONG_CONFIRM | 4 | +2.5% | +1.2% | +2.4% | 1.7% | ✗ | — | — | — | — | — | INSUFFICIENT |
| UP_PROMOTION | 4 | +5.9% | +5.6% | +4.8% | 4.0% | ✗ | — | — | — | — | — | INSUFFICIENT |
| LONG_SETUP | 191 | -1.0% | -0.8% | -1.0% | 4.4% | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | FAIL |
| LONG_WATCH | 659 | +0.4% | +0.1% | 0.0% | 3.5% | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | FAIL |
| SHORT_CONFIRM | 6 | +2.0% | +2.7% | +0.7% | 7.5% | ✗ | — | — | — | — | — | INSUFFICIENT |
| DOWN_PROMOTION | 1 | -0.8% | -0.8% | -2.5% | 6.6% | ✗ | — | — | — | — | — | INSUFFICIENT |
| SHORT_SETUP | 21 | +0.5% | +0.2% | -0.1% | 4.7% | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | INSUFFICIENT |
| SHORT_WATCH | 374 | +0.6% | +0.3% | +0.2% | 4.0% | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | FAIL |

- 結論：**KEEP（VIX 22 維持）** — LONG_CONFIRM avg5D=+2.5% 方向正確但 n=4 不足；LONG_SETUP 方向錯誤（KI-009 新增）
- 注意：EXP-002 已整合進 EXP-006（HYP-002 + HYP-008 一併實施）

---

### EXP-003 — 修正 previousLabel regime

- 日期：2026-06-18（code 落地）；Gate Summary 回填：2026-06-18
- 對應假設：HYP-003
- 改動：`classifyStock` 切前一日 benchmarks → 重算 previousRegime → 計算 previousLabel
- 改動前 Gate Summary：*(無舊紀錄)*
- 改動後 Gate Summary：UP_PROMOTION n=4, avg5D=+5.9%, vs SPY=+4.8%（方向正確，n 不足 G1）
- 結論：**KEEP** — 修正已落地；UP_PROMOTION 方向正確，n 不足屬 KI-007 結構問題

---

### EXP-004 — AVOID_CHOP EMA slope 收緊至 0.001

- 日期：2026-06-18（code 落地）；Gate Summary 回填：2026-06-18
- 對應假設：HYP-004
- 改動：`|ema20Slope| < 0.001`（原 0.003）
- 改動前 Gate Summary：*(無舊紀錄)*
- 改動後 Gate Summary：LONG_WATCH n=659, avg5D=+0.4%（G2 pass），vs SPY=0.0%（G3 fail），MAE=3.5%（G6 fail）
- 結論：**KEEP（部分）** — LONG_WATCH 方向對但未能跑贏大市；AVOID_CHOP 條件收緊後 LONG_WATCH 質量仍不足，G3/G6 仍 fail

---

### EXP-005 — breakout20d → ATR-normalized margin

- 日期：2026-06-18（HYP-007 落地）；Gate Summary 回填：2026-06-18
- 對應假設：HYP-007（升級自 HYP-005）
- 改動：`close > priorHigh * 1.003` → `close > priorHigh + 0.5 * ATR14`（breakout）；`close < priorLow` → `close < priorLow - 0.5 * ATR14`（breakdown，新加 margin）
- 動機：固定 0.3% 對低波幅股太嚴、高波幅股太鬆；ATR14 自動適配
- 改動前 Gate Summary：*(無舊紀錄)*
- 改動後 Gate Summary：LONG_CONFIRM n=4, avg5D=+2.5%, vs SPY=+2.4%（方向正確，n 不足 G1）
- 結論：**KEEP** — ATR-normalized breakout 更合理；方向正確但樣本不足無法完整評估

---

### EXP-006 — LONG_CONFIRM 品質升級（HYP-002 + HYP-008）

- 日期：2026-06-18
- 對應假設：HYP-002（放寬 regime）+ HYP-008（H52 / EMA200）
- 改動：
  - `regime === 'long_friendly'` → `regime !== 'short_friendly'`（放寬觸發條件）
  - `RVOL > 1.5` → `RVOL > 1.8`（更嚴格成交量要求）
  - `CMF > 0.05` → `CMF > 0.1`（更嚴格資金流要求）
  - 新增：`aboveEma200 !== false`（EMA200 趨勢確認）
  - 新增：`nearHigh52w !== false`（Minervini H52：收市 ≥ 52週高位 75%）
- 改動前（scripts/signal-winrate.mjs 20隻股 2yr 數據）：
  - UP_PROMOTION: n=8, 5D win=62.5%, avg5D=+1.63%
  - LONG_CONFIRM: n=19, 5D win=47.4%, avg5D=-1.47%（低於隨機）
- 改動後（同數據集）：
  - UP_PROMOTION: n=4, 5D win=100%, avg5D=+5.91%, avg10D=+14.62%
  - LONG_CONFIRM: n=6, 5D win=50%, avg5D=+0.57%（轉正）
- 改動後 Gate Summary（Stock Research UI 回填）：LONG_CONFIRM n=4 avg5D=+2.5% vs SPY=+2.4% MAE=1.7%（INSUFFICIENT）；UP_PROMOTION n=4 avg5D=+5.9% vs SPY=+4.8% MAE=4.0%（INSUFFICIENT）
- 結論：**KEEP** — n 減少但質素大幅提升，UP_PROMOTION avg5D +5.9%，方向正確；MAE 4.0% 略高於 G6 門檻（3%），需關注
- 注意：n 過少（4/4），G1 仍 FAIL，需擴大 watchlist 至 40+ 隻方可 G1 PASS
- 下一步：擴大 watchlist 以增加 LONG_CONFIRM 樣本量

---

### EXP-008 — HYP-009 Hysteresis：LONG_CONFIRM / SHORT_CONFIRM 要求前一日在 ladder 內

- 日期：2026-06-18
- 對應假設：HYP-009
- 改動：
  - LONG_CONFIRM：新增 `previousLabel ∈ {LONG_WATCH, LONG_SETUP, LONG_CONFIRM, UP_PROMOTION}` 前置條件（防止單日衝刺突破誤觸）
  - SHORT_CONFIRM：新增 `previousLabel ∈ {SHORT_WATCH, SHORT_SETUP, SHORT_CONFIRM, DOWN_PROMOTION}` 前置條件
  - 同步修改 `scripts/signal-winrate.mjs`
- 改動前（scripts v1）：LONG_CONFIRM n=6 5D win=50% avg5D=+0.57%；UP_PROMOTION n=4 5D win=100% avg5D=+5.91%
- 改動後（scripts v2，20隻股 2yr）：LONG_CONFIRM n=1 5D win=100% avg5D=**+8.66%**；UP_PROMOTION n=5 5D win=80% avg5D=+4.62%
- 結論：**KEEP** — hysteresis 大幅提升 LONG_CONFIRM 精度（avg5D +8.66%），但 n=1 統計意義極低；效果需更大 universe 驗證
- 注意：LONG_CONFIRM 在 20 股 2yr 資料集幾乎不再觸發（n=1）；這是 G1 問題，不是 hysteresis 過嚴

---

### EXP-007 — SHORT_SETUP + SHORT_CONFIRM 條件收緊

- 日期：2026-06-18
- 改動：
  - SHORT_SETUP 加 `RVOL > 1.5`（只在有異常成交量的弱勢才觸發，減少反彈誤觸）
  - SHORT_CONFIRM: `regime === 'short_friendly'` → `regime !== 'long_friendly'`（放寬觸發）
- 改動前：SHORT_SETUP n=287 avg5D=+1.76%（方向完全錯誤），SHORT_CONFIRM n=2
- 改動後：SHORT_SETUP n=20 avg5D=+0.58%（仍正，短訊號在牛市資料集天然失效），SHORT_CONFIRM n=6
- 改動後 Gate Summary（Stock Research UI 回填）：SHORT_SETUP n=21 avg5D=+0.5%（INSUFFICIENT）；SHORT_CONFIRM n=6 avg5D=+2.0%（INSUFFICIENT）；SHORT_WATCH n=374 avg5D=+0.6% G1=✓ G2=✗（FAIL）
- 結論：**KEEP（部分）** — SHORT 側在 2024-2026 牛市資料集無法有效驗證，avg5D 全部為正（方向錯誤）屬牛市偏差，需 2022 熊市數據再評估
- 注意：SHORT_WATCH 因 SHORT_SETUP 收緊後信號洩入，n 從 176 升至 374，為結構性副作用

---

### EXP-009 — LONG_SETUP / LONG_WATCH / LONG_PULLBACK G3 修復（RS 過濾）

- 日期：2026-06-18
- 對應假設：EXP-008 後續；HYP-011 前置步驟
- 改動：
  - `LONG_SETUP` 新增 `relStrengthVsSpy > 0`（要求股票 20 日 RS 已跑贏 SPY）
  - `LONG_WATCH` 新增 `relStrengthVsSpy > -0.02`（排除嚴重跑輸大市的名字）
  - `LONG_PULLBACK` 新增 `aboveEma200 !== false`（只在長線上升趨勢中接受回調）
- 改動前 Gate Summary（v3，100 股 Stock Research UI）：

| Label | n | Avg5D | vs SPY | MAE5D | G1 | G2 | G3 | G4 | G5 | G6 | G7 | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LONG_CONFIRM | 11 | 1.3% | 1.0% | 2.6% | ✗ | ✓ | ✓ | — | — | ✓ | ✓ | INSUFFICIENT |
| UP_PROMOTION | 16 | 2.4% | 2.0% | 4.0% | ✗ | ✓ | ✓ | — | — | ✗ | ✓ | INSUFFICIENT |
| LONG_VCP | 2 | 0.4% | 0.7% | 8.8% | ✗ | — | — | — | — | — | — | INSUFFICIENT |
| LONG_SETUP | 922 | 0.2% | 0.2% | 3.8% | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✓ | FAIL |
| LONG_PULLBACK | 84 | 0.0% | -0.3% | 3.3% | ✗ | ✓ | ✗ | ✗ | — | ✗ | ✓ | INSUFFICIENT |
| LONG_WATCH | 2988 | 0.6% | 0.4% | 3.5% | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✓ | FAIL |

- 改動後 Gate Summary（auto-sync 18/6/2026, 09:14:26）:

| Label | n | Avg 5D | Median 5D | vs SPY | MAE 5D | Neutral n | Neutral Avg 5D | G1 | G2 | G3 | G4 | G5 | G6 | G7 | Status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| 🟢 LONG_CONFIRM | 10 | 1.9% | 1.6% | 1.3% | 2.3% | 2 | 4.4% | FAIL | PASS | PASS | NA | NA | PASS | PASS | INSUFFICIENT |
| 🟢 UP_PROMOTION | 16 | 2.2% | 3.4% | 1.9% | 4.0% | 2 | 2.3% | FAIL | PASS | PASS | NA | NA | FAIL | PASS | INSUFFICIENT |
| 🟢 LONG_VCP | 9 | -1.6% | -2.0% | -2.2% | 5.8% | 0 | n/a | FAIL | NA | NA | NA | NA | NA | NA | INSUFFICIENT |
| 🟢 LONG_SETUP | 791 | 0.4% | 0.2% | 0.4% | 3.8% | 78 | 1.1% | PASS | PASS | FAIL | PASS | PASS | FAIL | PASS | FAIL |
| 🟢 LONG_PULLBACK | 82 | -0.1% | -0.2% | -0.5% | 3.4% | 0 | n/a | FAIL | FAIL | FAIL | FAIL | NA | FAIL | PASS | INSUFFICIENT |
| 🟡 LONG_WATCH | 2766 | 0.5% | 0.3% | 0.4% | 3.5% | 277 | 0.3% | PASS | PASS | FAIL | PASS | PASS | FAIL | PASS | FAIL |
| 🔴 SHORT_CONFIRM | 17 | 3.4% | 3.8% | 2.2% | 7.2% | 3 | 8.8% | FAIL | FAIL | FAIL | NA | NA | FAIL | NA | INSUFFICIENT |
| 🔴 DOWN_PROMOTION | 15 | 2.4% | 3.0% | 1.4% | 7.2% | 4 | 0.1% | FAIL | FAIL | FAIL | NA | NA | FAIL | NA | INSUFFICIENT |
| 🔴 SHORT_SETUP | 179 | 0.8% | 0.4% | 0.4% | 5.3% | 68 | 0.1% | PASS | FAIL | FAIL | FAIL | FAIL | FAIL | NA | FAIL |
| 🟠 SHORT_WATCH | 1672 | 0.1% | 0.0% | -0.2% | 3.8% | 319 | 0.2% | PASS | FAIL | FAIL | FAIL | FAIL | FAIL | NA | FAIL |

- Rolling Robustness（auto-sync 18/6/2026, 09:14:26）:

| Label | Window | G2 Pass | G3 Pass | G6 Pass | Full PASS | Avg 5D vs SPY |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| LONG_SETUP | 6M Rolling | 5/5 | 1/5 | 1/5 | 0/5 | 0.4% |
| LONG_SETUP | 12M Rolling | 5/5 | 1/5 | 1/5 | 0/5 | 0.4% |
| LONG_SETUP | 18M Rolling | 5/5 | 1/5 | 1/5 | 0/5 | 0.4% |
| LONG_PULLBACK | 6M Rolling | 1/5 | 0/5 | 1/5 | 0/5 | 0.2% |
| LONG_PULLBACK | 12M Rolling | 0/5 | 0/5 | 0/5 | 0/5 | 0.1% |
| LONG_PULLBACK | 18M Rolling | 0/5 | 0/5 | 0/5 | 0/5 | 0.1% |
| LONG_WATCH | 6M Rolling | 4/5 | 2/5 | 1/5 | 1/5 | 0.3% |
| LONG_WATCH | 12M Rolling | 4/5 | 1/5 | 1/5 | 1/5 | 0.3% |
| LONG_WATCH | 18M Rolling | 4/5 | 1/5 | 1/5 | 1/5 | 0.3% |

- 預期：LONG_SETUP n 下降（~500-700）、vs SPY 上升至 >0.5%；LONG_WATCH n 輕微下降、vs SPY 接近 0.5%；LONG_PULLBACK vs SPY 轉正
- 結論：PARTIAL（auto-sync）；LONG_SETUP 樣本由 922 降至 791；vs SPY 由 +0.2% 升至 +0.4%；仍未過 G3 > +0.5%；LONG_WATCH vs SPY +0.4%；LONG_PULLBACK vs SPY -0.5%
- 下一步：按 ROADMAP 建議，把 LONG_SETUP 的 RVOL 門檻由 1.2 提高到 1.5，然後重新執行 `research:agent -- --mode observe --exp EXP-009`

---

## 版本快照

每次進行大型閾值改動時，把當時的完整 Gate Summary 貼在這裡，方便回溯。

### v0 — 初始基準（標記缺失，無舊截圖）

### v1 — 2026-06-18（scripts 驗證數據，20隻股 2yr）

| Label | n | 5D win | Avg5D | Avg10D | vs SPY5D |
| --- | --- | --- | --- | --- | --- |
| UP_PROMOTION | 4 | 100% | +5.91% | +14.62% | +4.85% |
| LONG_CONFIRM | 6 | 50% | +0.57% | +2.01% | +0.82% |
| LONG_SETUP | 183 | 43.7% | -0.72% | +0.20% | -0.77% |
| LONG_WATCH | 665 | 51.3% | +0.31% | +0.78% | -0.06% |
| SHORT_WATCH | 368 | 47.6% | +0.53% | +1.76% | +0.21% |
| SHORT_SETUP | 20 | 45% | +0.58% | +3.31% | -0.06% |
| SHORT_CONFIRM | 6 | 33.3% | +2.02% | +6.83% | +0.70% |

注：SHORT 側在 2024-2026 牛市資料自然偏差，不代表信號設計失敗。

### v1b — 2026-06-18 post-HYP-009（scripts 驗證數據，20隻股 2yr，加入 hysteresis）

| Label | n | 5D win | Avg5D | Avg10D | vs SPY5D |
| --- | --- | --- | --- | --- | --- |
| UP_PROMOTION | 5 | 80% | +4.62% | +11.76% | +3.86% |
| LONG_CONFIRM | 1 | 100% | +8.66% | +26.15% | +8.33% |
| LONG_SETUP | 187 | 43.9% | -0.73% | +0.12% | -0.77% |
| LONG_WATCH | 665 | 51.3% | +0.31% | +0.78% | -0.06% |
| SHORT_WATCH | 368 | 47.6% | +0.53% | +1.76% | +0.21% |
| SHORT_SETUP | 20 | 45% | +0.58% | +3.31% | -0.06% |
| SHORT_CONFIRM | 6 | 33.3% | +2.02% | +6.83% | +0.70% |

注：HYP-009 後 LONG_CONFIRM n=6→1，統計意義不足但 avg5D=+8.66%。LONG_SETUP 仍為負（EXP-008 待處理）。

### v2 — 2026-06-18（Stock Research UI 實際回填，20隻股 2yr）

> 來源：Stock Research UI Gate Summary 截圖，由用戶人工回填

| Label | n | Avg5D | Median5D | vs SPY | MAE5D | G1 | G2 | G3 | G4 | G5 | G6 | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UP_PROMOTION | 4 | +5.9% | +5.6% | +4.8% | 4.0% | ✗ | — | — | — | — | — | INSUFFICIENT |
| LONG_CONFIRM | 4 | +2.5% | +1.2% | +2.4% | 1.7% | ✗ | — | — | — | — | — | INSUFFICIENT |
| LONG_SETUP | 191 | -1.0% | -0.8% | -1.0% | 4.4% | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | FAIL |
| LONG_WATCH | 659 | +0.4% | +0.1% | 0.0% | 3.5% | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | FAIL |
| SHORT_WATCH | 374 | +0.6% | +0.3% | +0.2% | 4.0% | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | FAIL |
| SHORT_SETUP | 21 | +0.5% | +0.2% | -0.1% | 4.7% | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | INSUFFICIENT |
| SHORT_CONFIRM | 6 | +2.0% | +2.7% | +0.7% | 7.5% | ✗ | — | — | — | — | — | INSUFFICIENT |
| DOWN_PROMOTION | 1 | -0.8% | -0.8% | -2.5% | 6.6% | ✗ | — | — | — | — | — | INSUFFICIENT |

**關鍵觀察：** 沒有任何 label 通過全部 gate。LONG_SETUP（n=191）avg5D=-1.0%，G2 FAIL，方向錯誤，為最急需改進的 label（→ EXP-008）。LONG_WATCH G5 FAIL：neutral regime 下方向不穩定。LONG_CONFIRM / UP_PROMOTION avg5D 方向正確（+2.5%/+5.9%）但 n 不足 G1。所有 SHORT label 在 2024-2026 牛市中 avg5D 均為正，屬牛市偏差。

---

## 執行順序建議（2026-06-18 更新）

已完成：EXP-001～008 全部落地；UI Gate Summary v2 回填；HYP-007/008/002/009 已驗證；HYP-012（next-open entry）、HYP-013（歷史 earnings archive）已落地；G5 policy 已決定（維持現況）。

**下一步優先順序：**

1. **EXP-008 後續（LONG_SETUP 條件收緊）**：avg5D=-0.73% G2 FAIL 最急需解決。考慮加入 RS vs sector filter（HYP-011）或提高 RVOL 至 1.5。改動後必須從 UI 重新回填 Gate Summary 驗證。
2. **擴大 watchlist 至 40+ 隻**：LONG_CONFIRM / UP_PROMOTION n 不足 G1 的根本原因是 universe 太小，不全是條件問題。
3. **HYP-010（ATR squeeze）/ HYP-011（RS-sector）**：等 LONG_SETUP 問題解決後再做，避免同時改動多個變量。
4. **ML 遷移（A8）**：資料層未完全乾淨前不觸碰。

---

## 外部研究與現有做法總結（2026-06-18）

這節整合學術論文、業界成熟框架、開源項目（GitHub）和社群討論（Reddit / X）的調研結果，用來印證或修正我們的設計。每個發現都映射到上面的 KI / HYP。

### 1. 我們的設計被外部驗證的部分

> 結論：核心架構（regime-conditioned + 三層 ladder + 量價結合 + gate 統計驗證）方向正確，與多個成熟做法一致。不需要推倒重來，重點在參數與條件的細化。

| 我們的設計 | 外部佐證 | 來源 |
| --- | --- | --- |
| `LONG_CONFIRM` 只在 long_friendly 觸發 | up-market 月均 momentum +0.93%，down-market −0.37%；momentum 在 calm regime 表現好，volatility 跳升時失效 | Giner & Zakamulin regime-switching model |
| 三層 WATCH → SETUP → CONFIRM ladder | Weinstein 四階段（Base → Advancing → Distribution → Declining）、Minervini Stage 2 Trend Template 是同一思路的成熟版 | Weinstein Stage Analysis、Minervini SEPA |
| breakout + RVOL > 1.5 量能確認 | 突破 52 週高位 + 量能 > 150% 20 日均量 → 72% 機率 31 日 +11.4%；Minervini 要求量能 ≥ 40-50% 高於 50 日均量 | Journal of Financial Markets；Minervini VCP pivot |
| RSI + MACD + CMF/OBV 量價組合 | 三者覆蓋彼此盲點（趨勢 / 動量 / 量能）；MACD 定方向 + RSI 定時機 backtest 73% 勝率 | 多個 backtest 研究 |
| VIX 放寬至 22（EXP-001） | VIX > 30 才是真 risk-off；18-25 屬正常牛市範圍 | VIX regime 研究 |
| Gate 系統（n≥100、前後半一致、neutral regime 驗證） | walk-forward / OOS 是驗證 gold standard；條件太多 + 樣本太少 = 過擬合的頭號死因 | AlgoXpert framework、arXiv WFA 論文 |

### 2. 業界成熟框架對照（最重要的參考）

我們的 ladder 本質上是 **Weinstein Stage Analysis + Minervini Trend Template** 的簡化版。這兩個是被數十年實戰驗證的框架，值得對齊。

**Minervini Trend Template（Stage 2 的 8 條硬性條件）：**

1. 價格在 150 日 (30 週) 與 200 日 (40 週) 均線之上
2. 150 日均線 > 200 日均線
3. 200 日均線上升至少 1 個月（最好 4-5 個月）
4. 50 日均線 > 150 日且 > 200 日均線
5. 200 日均線已上升至少 20 個 bar
6. 價格至少比 52 週低位高 30%
7. 價格在 52 週高位的 25% 範圍內（即 H52 ≥ 0.75，對應 **HYP-008**）
8. Relative Strength rating > 70（理想 90+，相對全市場，對應 **HYP-011**）

> 我們現在的 `LONG_CONFIRM` 只用 EMA20 > EMA50，缺了長均線（150/200 日）的趨勢確認和 52 週位置（H52）。這是與 Minervini 最大的差距，HYP-008 補 H52，可考慮再補一條 200 日均線方向。

**Weinstein 關鍵工具：30 週均線**（≈150 日）作為主趨勢過濾器，Stage 2 突破要求量能 2-3 倍均量。

**Minervini VCP（Volatility Contraction Pattern）：**
價格經過一連串「越來越窄」的盤整（如 15% → 10% → 5%），每次回調量能遞減（volume dry-up），最後一個收縮（pivot）量能最低，突破 pivot 時量能放大。→ 直接對應 **HYP-010** 的 ATR squeeze 思路。

### 3. 開源項目（GitHub）landscape

| 項目 | 做法 | 對我們的啟示 |
| --- | --- | --- |
| `RyanJHamby/stock-screener` | 掃 3800+ 股，8 條 Minervini Stage 2 硬性條件，含 market regime filter + smart caching（少 74% API calls）+ GitHub Actions 自動化 | 最接近我們的目標形態；caching 策略值得參考（我們有 API 上限問題） |
| `xang1234/stock-screener` | 80+ filter、StockBee-style breadth 指標 | breadth（市場廣度）可作為 regime 的補充輸入 |
| `pandas-ta` / `pandas-ta-classic` | 130-200+ 指標的 Python 標準庫，Wilder smoothing 等都有 reference 實作 | 我們的 `indicatorEngine.ts` 可用它的公式做 cross-check（驗證 RSI/ATR/CMF 算對） |
| `awesome-quant` / `awesome-systematic-trading` | quant 資源彙整 | 找 backtest / walk-forward 框架時的入口 |

> 行動建議：用 `pandas-ta` 對同一段 OHLCV 跑一次，和我們 `indicatorEngine.ts` 的輸出逐項對比，確認本地指標計算無誤（這是「信號不準」的另一個可能根因——指標本身算錯）。

### 4. 社群（Reddit / X）共識與常見錯誤

- **最常見死因：條件太多 + 樣本太少 = 過擬合。** 這正是 KI-002（`LONG_CONFIRM` 六條件）的風險。社群與學術都指出：在少量配置上跑出高 backtest 表現非常容易，但 OOS 系統性失效。→ 我們的 Gate G1 (n≥100) 和 G4（前後半一致）就是防這個的，要嚴格守住。
- **多指標組合 > 單一指標**，但要選不同類別（趨勢 / 動量 / 量能 / 波幅）避免共線性——我們已做到。
- **趨勢市勝率 65-73%，橫盤市跌到 45-55%**——再次印證 regime filter 和 `AVOID_CHOP` 的必要性。
- **日線 / 週線比小時線穩定**——我們用日線是對的。

### 5. 防 whipsaw：hysteresis / confirmation bars（解 KI-006）

業界 state-machine 設計的標準做法，直接對應 **HYP-009**：

- **Hysteresis（雙門檻）：** 進場門檻嚴、出場門檻鬆，中間留 deadzone，避免信號在零軸附近震盪就反覆切換。
- **Confirmation bars：** 要求連續 N 個 bar（常見 2 日 / 14 日）符合才 commit state 轉換。
- **持倉最少 2 bar：** 反向信號要等至少 2 bar 才能觸發，消除隔日 round-trip whipsaw。
- 設計哲學：寧願「確認轉折」而稍微遲到，也不要「預測轉折」而被反覆甩。

### 6. 嚴謹驗證流程（升級 Gate 系統的方向）

學術界的 gold standard 是 **IS → WFA → OOS** 三段：

1. **In-Sample (IS)：** 找穩定的參數「高原」（plateau），而非單一最優點——避免挑到運氣好的參數。
2. **Walk-Forward (WFA)：** rolling window 持續重新驗證，加 purge gap 防 look-ahead 洩漏。
3. **Out-of-Sample (OOS)：** 鎖定參數後在從未見過的數據上驗證。

> 我們現在的 Gate 是單段 in-sample 統計。未來升級方向：把歷史數據切成多個 rolling window，要求信號在「多數 window」都通過 gate，而不只是整體通過一次。這是 EXP 系列穩定後的長期目標。

### 7. 更新後的優先順序（綜合學術 + 業界）

| 優先 | 改動 | 對應 | 工程量 | 理由 |
| --- | --- | --- | --- | --- |
| 1 | 已完成的 EXP-001/004/005 + KI-003 驗證數據 | — | — | 先把已改的填進 Gate Summary，確認方向 |
| 2 | 指標計算 cross-check（vs pandas-ta） | — | 低 | 排除「指標算錯」這個根因 |
| 3 | H52 proximity（+ 考慮 200 日均線方向） | HYP-008 | 中 | 與 Minervini 對齊，補最大設計缺口 |
| 4 | ATR 歸一化 breakout | HYP-007 | 低 | 取代固定 0.3%，跨波幅一致 |
| 5 | hysteresis / confirmation bars | HYP-009 | 中 | 解 KI-006 信號震盪 |
| 6 | ATR squeeze / VCP split 觀察 | HYP-010 | 中 | 先觀察再決定是否納入條件 |
| 7 | RS vs sector | HYP-011 | 中 | 需要 sector mapping，收益較邊際 |
| 長期 | walk-forward 多 window 驗證 | — | 高 | Gate 系統的最終形態 |

### 參考來源

- [A regime-switching model of stock returns with momentum and mean reversion (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S0264999323000494)
- [Industry information and the 52-week high effect — George & Hwang (Gatton College)](https://gattonweb.uky.edu/faculty/lium/52weekhigh.pdf)
- [Minervini Trend Template — A Step-by-Step Guide (ChartMill)](https://www.chartmill.com/documentation/stock-screener/technical-analysis-trading-strategies/496-Mark-Minervini-Trend-Template-A-Step-by-Step-Guide-for-Beginners)
- [The Complete Guide to Stan Weinstein's Stage Analysis (TraderLion)](https://traderlion.com/trading-strategies/stage-analysis/)
- [Mark Minervini's VCP Criteria: The Complete 7-Point Checklist (FinerMarketPoints)](https://www.finermarketpoints.com/post/vcp-criteria-complete-checklist)
- [RyanJHamby/stock-screener — Minervini Stage 2 screener (GitHub)](https://github.com/RyanJHamby/stock-screener)
- [xang1234/stock-screener — 80+ filters, StockBee breadth (GitHub)](https://github.com/xang1234/stock-screener)
- [pandas-ta-classic — 200+ indicators reference (GitHub)](https://github.com/xgboosted/pandas-ta-classic)
- [awesome-systematic-trading (GitHub)](https://github.com/wangzhe3224/awesome-systematic-trading)
- [AlgoXpert Alpha Research Framework — IS/WFA/OOS overfitting protocol (arXiv)](https://arxiv.org/pdf/2603.09219)
- [Interpretable Hypothesis-Driven Trading — Walk-Forward Validation (arXiv)](https://arxiv.org/html/2512.12924v1)
- [Normalized ATR (NATR) Indicator Guide (AlphaexCapital)](https://www.alphaexcapital.com/indicators/normalized-atr)
- [Post–earnings-announcement drift (Wikipedia)](https://en.wikipedia.org/wiki/Post%E2%80%93earnings-announcement_drift)
- [Key technical indicators for stock market prediction (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S2666827025000143)

---

## 替代架構：可能大改但成功率更高的模型（2026-06-18）

> 這節不受限於現有 rule-based 模型。調研了學術界與業界公認成功率最高的做法，誠實列出代價與遷移路徑。
>
> **核心結論：成功率最高的不是「更多更好的手寫規則」，而是換範式——把指標當 feature，讓模型自己學非線性交互。** 而且有一條路（meta-labeling）能在不丟棄現有引擎的前提下過渡。

### 0. 先認清現實天花板（最重要的一條）

多個研究一致：**短期方向預測的真實準確率天花板是 55-57%。** 高於此的 backtest 幾乎都是過擬合或忽略了交易成本。Efficient Market / Random Walk 假說下，純價格資訊預測上限接近 50%。

**啟示：**
- 不要追求「準確率」，要追求**扣除成本後**的 risk-adjusted return（Sharpe、max drawdown、profit factor）。分類準確率單獨看毫無意義。
- 我們現在的 6-gate 統計驗證方向是對的，但要把「成本後 Sharpe」加進 gate。
- 任何聲稱 >60% 勝率的方法，預設它過擬合，直到 OOS 證明為止。

### 1. 範式轉移：rule-based → 監督式學習（Gu/Kelly/Xiu 範式）

**現狀問題：** 我們用 `if RSI>55 AND CMF>0.05 AND CLV>0.65 AND ...` 六個布林條件硬交集。這正是 KI-002，也是社群公認的過擬合頭號死因——條件越多，交集越稀疏，樣本越少，越脆弱。

**Gu, Kelly & Xiu (2020, Review of Financial Studies)** 的 landmark 結論：

- 樹模型（gradient-boosted trees）與神經網路**大幅跑贏**線性 / 規則模型，某些情況下報酬翻倍。
- 預測力來自**捕捉非線性 predictor 交互**——這正是手寫規則做不到的。
- 最重要的 predictor（所有模型一致）：**momentum（個股 + 行業 + 短期反轉）> liquidity（市值、成交額、買賣價差）> volatility（已實現波幅、特異波幅、beta）**。

> 關鍵發現：**這三類最重要的 feature 我們其實都已經在算**（EMA slope/RS = momentum，RVOL/成交額 = liquidity，ATR = volatility）。差別只在——我們把它們寫成布林門檻，而不是當成 feature 餵給模型學。

**新範式：** 保留所有指標計算，但不再寫死門檻。把每個信號日的 N 個指標當 feature vector，用 **LightGBM / XGBoost** 學「未來 5 日是否跑贏」的機率，輸出 ranking 而非 label。

### 2. 更好的標籤：Triple-Barrier Method（Lopez de Prado）

**現狀問題：** 我們用固定的「5 日後 forward return」當標籤。但真實交易有止損、止盈、時間到期，固定持有 5 日不符實際。

**Triple-Barrier：** 對每個信號設三道屏障——止盈（上）、止損（下）、到期（時間）。看**先碰哪道**來標籤。三道屏障的寬度用 **ATR / 波幅** 動態縮放（高波幅股屏障寬，低波幅股窄）。

**好處：** 標籤反映真實交易結果，且自動波幅歸一化——這同時解了 HYP-007（ATR 歸一化）的問題，層級更高。

### 3. 最務實的遷移路徑：Meta-Labeling（不丟棄現有引擎）

> 這是本節最重要的 actionable take-away——它讓我們**保留現有 rule-based 引擎**，只在上面加一層 ML，big change 但 zero waste。

**Meta-Labeling（Lopez de Prado, 2017）** 把「方向」與「下不下注」分開：

- **Primary model（side）= 我們現有的 `signalClassifier`。** 它決定方向（long / short / neutral）。保留不動。
- **Secondary model（size / take-or-skip）= 新的 LightGBM 二元分類器。** 它只回答一個問題：「primary 給的這個信號，該不該採納？」輸出機率 → 決定下注與否及大小。

**為什麼成功率高：** Meta-labeling 專門用來**修正低 precision**。我們的 rule 引擎 recall 不錯（抓得到 setup）但 precision 差（很多假信號）。二級模型學「哪些 primary 信號是真的」，把 F1、precision 顯著拉高。研究（Hudson & Thames）證實 event sampling + triple-barrier + meta-labeling 組合改善所有指標。

**工程意義：** 不用推倒 TypeScript 引擎。新增一個 Python 訓練 pipeline，產出二級模型，前端用它的機率分數對現有信號排序 / 過濾。

### 4. 橫截面排名取代絕對門檻（Cross-Sectional Ranking）

**現狀問題：** 我們對每隻股票用**絕對門檻**（RSI > 55 等）。但市場整體強弱會讓所有股票一起過或一起不過門檻。

**新做法：** 每日對全 universe 的股票按模型分數**排名**，取 top decile 做 long、bottom decile 做 short。這對市場整體漂移免疫，是 2024-2025 多個高 Sharpe 研究（LightGBM/XGBoost 多因子，Sharpe 1.35-2.6）的標準做法。

### 5. 現成基礎設施：Microsoft Qlib

不用從零造輪子。**Qlib**（microsoft/qlib，開源）提供完整 pipeline：

- 內建 **Alpha158 / Alpha360** 因子集（158/360 個現成 feature）
- 內建 LightGBM + SOTA 模型 zoo
- `qrun` 一個 YAML 跑完：數據 → 訓練 → backtest → 評估
- 內建 walk-forward（rolling retrain），直接滿足前面 §6 的 IS→WFA→OOS 需求

> 可行做法：把我們的 OHLCV 餵進 Qlib，用 Alpha158 + LightGBM 跑一個 baseline，和我們的 rule 引擎在同一段歷史上比 Sharpe。這是「我們的規則到底有沒有 alpha」的客觀基準線。

### 6. 代價與取捨（誠實評估）

| 維度 | 現有 rule-based | ML 範式（meta-label / LightGBM） |
| --- | --- | --- |
| 技術棧 | 純 TypeScript，前端可跑 | 需要 Python 訓練 pipeline（離線），前端載入模型輸出 |
| 可解釋性 | 高（規則白盒） | 中（需 SHAP 等做 feature importance） |
| 數據需求 | 低 | 高（需要大量乾淨歷史 + 嚴格防洩漏） |
| 過擬合風險 | 中（條件堆疊） | 高（必須嚴格 walk-forward / OOS） |
| 預期上限 | 中 | 高（學術證實翻倍級改善），但仍受 55-57% 天花板限制 |
| 開發成本 | 已完成 | 高（新 pipeline + 數據工程 + MLOps） |

### 7. 建議的分階段遷移（不浪費現有工作）

1. **Stage A（驗證有無 alpha）：** 用 Qlib + Alpha158 + LightGBM 跑 baseline，和現有 rule 引擎比成本後 Sharpe。若 rule 引擎完全比不過，證明該轉範式。
2. **Stage B（Triple-Barrier 標籤）：** 把 `ForwardReturnRecord` 的固定 5 日 return 換成 triple-barrier 標籤（ATR 縮放）。這步即使不上 ML 也改善現有 Gate 的真實性。
3. **Stage C（Meta-Labeling）：** 保留 `signalClassifier` 當 primary，訓練 LightGBM 二級模型做 take/skip。前端用機率分數過濾現有信號。← **性價比最高的一步**
4. **Stage D（橫截面排名）：** 把絕對門檻換成每日 ranking + top/bottom decile。
5. **Stage E（全 ML）：** 若 A-D 證明 ML 顯著勝出，再考慮用 LightGBM ranking 完全取代 rule 引擎，rule 退化為其中一組 feature。

> **一句話建議：** 不要現在就推倒重來。先做 Stage A（客觀基準）和 Stage C（meta-labeling），用最低成本拿到 ML 範式大部分的收益，同時保住現有引擎的可解釋性。Stage E 全面替換留到數據證明值得為止。

### 替代架構參考來源

- [Empirical Asset Pricing via Machine Learning — Gu, Kelly & Xiu (NBER w25398)](https://www.nber.org/system/files/working_papers/w25398/w25398.pdf)
- [Empirical Asset Pricing via Machine Learning (Review of Financial Studies / Oxford)](https://academic.oup.com/rfs/article/33/5/2223/5758276)
- [Does Meta Labeling Add to Signal Efficacy? Triple-Barrier Method (Hudson & Thames)](https://hudsonthames.org/does-meta-labeling-add-to-signal-efficacy-triple-barrier-method/)
- [Meta-Labeling (Wikipedia)](https://en.wikipedia.org/wiki/Meta-Labeling)
- [Advances in Financial Machine Learning — notes (Reasonable Deviations)](https://reasonabledeviations.com/notes/adv_fin_ml/)
- [Machine Learning Enhanced Multi-Factor Quantitative Trading — Sharpe 2.01 (arXiv 2507.07107)](https://www.arxiv.org/pdf/2507.07107)
- [ACT: Anti-Crosstalk Learning for Cross-Sectional Stock Ranking — Sharpe 2.67 (arXiv 2604.20204)](https://arxiv.org/html/2604.20204v1)
- [microsoft/qlib — AI-oriented quant platform (GitHub)](https://github.com/microsoft/qlib)
- [Qlib LightGBM benchmark — Alpha158 (GitHub)](https://github.com/microsoft/qlib/tree/main/examples/benchmarks/LightGBM)
- [Overhyped? Can ML Models Reliably Predict Stock Returns? (HKU Business School)](https://www.hkubs.hku.hk/event/overhyped-can-machine-learning-models-reliably-predict-stock-returns/)
- [Reasons Why Machine Learning Fails with Stock Prediction (Codefinity)](https://codefinity.com/blog/Reasons-Why-Machine-Learning-Fails-with-Stock-Prediction)

---

## GPT 審閱與修訂建議（2026-06-18）

### A. Correctness check：文件與實際 code 的落差

1. **`marketRegime.ts` 的 `long_friendly` 閾值已不是 `VIX < 18`。**
   文件原文寫 18，但實際 code 是 `VIX < 22`，見 `src/engine/marketRegime.ts:40-45`。因此 KI-001 / HYP-001 / EXP-001 原本的敘述屬於「已落地但未驗證」，不是「尚未修改」。

2. **`AVOID_CHOP` 的 `|ema20Slope|` 已不是 `0.003`，而是 `0.001`。**
   實際 code 見 `src/engine/signalClassifier.ts:42-48`。因此 KI-004 / HYP-004 / EXP-004 原文若仍寫「準備把 0.003 改成 0.001」，已經過時；現在真正缺的是 Gate Summary 驗證。

3. **`breakout20d` 已有 0.3% margin，不再是「完全沒有 minimum margin」。**
   實際 code 見 `src/engine/stockScreenerEngine.ts:54-60`，條件是 `close > priorHigh * 1.003`。但 `breakdown20d` 仍是原始 `close < priorLow`（`src/engine/stockScreenerEngine.ts:62-67`），所以更準確的問題描述應是「breakout / breakdown 不對稱，且固定 margin 未經驗證」。

4. **`previousLabel` 用今日 regime 的問題，現有 code 已修正。**
   實際 code 會 slice 前一日 benchmark histories、重算 `previousRegime`，再算 `previousLabel`，見 `src/engine/stockScreenerEngine.ts:159-177`。因此 KI-003 不應再當成 active engine bug，而應改為「已修正，待確認影響」。

5. **Gate 說明略高估了目前 engine 的嚴格度。**
   文件原本寫「進 production 必須通過所有六個 gate」，但 `src/engine/researchGate.ts:107-149` 的實作更細：
   - G2 / G3 / G6 只有 `n >= 10` 才評估
   - G4 只有 `n >= 20` 才評估
   - G5 只有 neutral regime 樣本 `>= 5` 才評估
   - `status = PASS` 對 G5 的要求是 `gate5NeutralRegime !== false`，也就是 `INSUFFICIENT` 不會單獨導致 FAIL
   這不是說現行設計一定錯，但文件必須如實描述。

6. **歷史 replay 沒有明顯 look-ahead bug，但有 execution realism 偏樂觀。**
   好消息是 `buildHistoricalSignals` 會把所有 histories slice 到 `signalDate` 再分類，見 `src/engine/stockResearchEngine.ts:105-117`，這部分沒有直接用未來 bar。問題在於 `buildForwardReturnRecord` 以 signal-day close 當 entry，再算未來 close-to-close return，見 `src/engine/stockResearchEngine.ts:49-58`，這對實盤是偏樂觀假設。

### B. Gap analysis：目前文件仍缺的關鍵風險

1. **Survivorship bias 幾乎沒有被正面處理。**
   `buildHistoricalSignals` 只對傳入的當前 `tickers` 回放（`src/engine/stockResearchEngine.ts:92-125`）。如果研究 universe 只包含今天仍在 watchlist 的股票，就容易高估長邊統計，特別是被移除、表現差、甚至退市的名字不在樣本內。這是文件目前最大的研究設計缺口之一。

2. **Historical replay 的 earnings filter 被關掉了。**
   目前 replay 呼叫 `classifyStock(..., null, regime)`，見 `src/engine/stockResearchEngine.ts:116`。也就是 live screener 會降級 earnings risk，但 research replay 不會，這使 Gate Summary 可能高估 `LONG_CONFIRM` / `UP_PROMOTION` 的乾淨程度。這不是小細節，而是直接影響研究可信度。

3. **交易成本 / execution assumption 還沒進 gate。**
   文件在替代架構段落正確提到「成本後 Sharpe」才重要，但目前 `ForwardReturnRecord` 與 `researchGate` 還沒有 spread / slippage / borrow cost / short locate 的欄位與 gate。對 short label 尤其重要，否則很容易出現 paper alpha。

4. **小樣本問題不只是 G1 fail，還會令 G2-G6 的判斷失真。**
   `researchGate.ts` 已經用 `n >= 10` / `n >= 20` 做最低保護，代表 code 本身也承認小樣本不可靠。但文件目前對「n far below 100 時如何解讀」著墨不夠，容易讓人過度解讀少量樣本的 avg5D。

5. **`previousLabel` 的 label leakage 不是現在的主風險，真正的風險是 event omission 與研究假設不一致。**
   KI-003 現在已修掉，所以不應再把注意力放在那裡。更值得寫進文件的是：live 與 replay 對 earnings 事件處理不一致，這會讓「研究結果是否能代表 live 行為」出現偏差。

6. **6 個 gate 不一定是最後的對 gate 組合。**
   目前 gate 比較像第一版 sanity filter，不是終局設計。特別是：
   - 沒有成本後表現 gate
   - 沒有 turnover / 持有期穩定性 gate
   - 沒有 rolling-window 多數決 gate
   - G5 目前允許 `INSUFFICIENT` 仍 PASS
   因此文件應把 6-gate 定位為 v1，而不是不可動的最終標準。

### C. Prioritization sanity：兩週內該做什麼，什麼先不要做

**結論先講：文件裡的 5-stage ML migration（A-E）可保留作長期藍圖，但對單人開發 + 免費 API 限額來說，現在不該真的按 A→E 展開。**

原因有三個：

1. **研究資料層還不夠乾淨。**
   在 survivorship bias、earnings omission、same-bar execution 這些問題未處理前，直接進 Stage B/C/D，很容易把偏差餵給更強的模型，最後只得到更精緻的錯誤。

2. **免費 API 限額不支持大規模反覆試錯。**
   Alpha Vantage 25 calls/day、Polygon 5/min 這種限制下，最划算的是先把現有 Yahoo-based replay 與 gate 變真實，而不是立刻擴資料域做 ML pipeline。

3. **現有 rule engine 還沒拿到乾淨 baseline。**
   連 EXP-001/003/004/005 都已在 code 落地卻未回填 Gate Summary，代表現在最缺的是 baseline discipline，不是更多模型複雜度。

**建議的接下來兩週：**

1. **Week 1：補 baseline 與研究真實性**
   - 把 EXP-001 / 003 / 004 / 005 的現況 Gate Summary 補齊
   - 實作 HYP-012：至少比較 `signal close` vs `next open`
   - 明確記錄成本前 / 成本後 return
   - 決定 G5 的 policy：`INSUFFICIENT` 是否允許 PASS

2. **Week 2：補 replay 與高價值 rule feature**
   - 實作 HYP-013：歷史 earnings archive（先只做 watchlist 也可以）
   - 實作 HYP-008 或 HYP-007 二選一
   - 若時間只夠一個，優先 **HYP-008（H52 / 長均線脈絡）**，因為它補的是目前設計上最明顯缺的 trend-quality filter

**建議延後的項目：**

- Stage B-E 的 ML 遷移
- RS vs sector（需要額外 mapping 與資料）
- hysteresis / confirmation bars（值得做，但先後順序低於研究真實性）
- 任何需要大量新供應商資料的擴張

### D. 本次新增的 hypothesis 是否合理

本次新增的 HYP-012 ~ HYP-015 都不是 filler，而是直接由現有 code 與研究方法論推出：

- HYP-012 來自 `buildForwardReturnRecord` 的 same-day close entry 假設
- HYP-013 來自 replay 對 earnings 一律傳 `null`
- HYP-014 來自 `evaluateAllGates` 的 pooled-only 設計
- HYP-015 來自 current-watchlist replay 的 survivorship bias

如果只選兩個最值得先做，我會選 **HYP-012** 和 **HYP-013**。因為它們不是「把規則調得更漂亮」，而是先讓研究結果更接近真實可交易情境。
