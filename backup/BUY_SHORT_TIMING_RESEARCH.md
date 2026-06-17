# Buy / Short Timing Signal Research

## 1. 研究結論先行

沒有任何免費或付費 indicator 可以「準確預測」買入和沽空時機。

這份研究文件的目標不是尋找神奇指標，而是建立一套可驗證的 signal framework：

- 用免費資料提高「入場方向正確」的概率
- 用 forward return 檢驗 signal 是否真的有用
- 把 `Early`、`Setup`、`Confirm` 三層信號分開處理
- 明確排除 options flow、options chain、IV、greeks
- 防止把漂亮的 dashboard 分類誤當成可交易優勢
- 防止資料源限制被低估，避免在資料不足時硬上架構

核心原則：

```text
Signal quality = direction edge + timing edge + regime fit + liquidity + event safety
```

重要前提：信號只是建議。在信號被 forward return 數據驗證前，它只是假設，不是結論。

---

## 2. 對 OptionFlow Stock Screener 邏輯的拆解

截圖中的 stock screener 把股票分成：

- `Strong UP`
- `Early UP`
- `Strong DOWN`
- `Early DOWN`
- `Promoted`
- `Neutral`

它的核心不是 option flow，而是三層結構：

- `JT`: 趨勢線或價格結構
- `FF`: 資金流或 volume-flow 類 signal
- `Smart Money (PC)`: 可能是 proprietary smart-money proxy
- `4H / 1D / 1W`: 多時間框架確認

### 2.1 Strong UP

原邏輯：

- `JT` 最近 3 bar 連續上升
- `FF` 最近 3 bar 連續流入
- `Smart Money (PC)` 連續熱
- 多時間框架同向

我對它的理解：

- 這是「趨勢延續」signal
- 它不是最早入場點
- 它適合用來找 momentum continuation
- 好處是 false positive 較少
- 壞處是入場通常較遲，risk/reward 可能變差
- 在我們的架構對應 `LONG_CONFIRM`

### 2.2 Early UP

原邏輯：

- `JT` 出現 V-shape
- `FF` 出現 V-shape
- smart-money proxy 由冷轉熱

我對它的理解：

- 這是「早期反轉」signal
- 它比 `Strong UP` 早，但噪音更高
- V-shape 的定義需要量化：例如前 N bar 連跌後轉升，或 slope 從負轉正
- 最需要 regime filter 和 stop logic
- 應該先當作 watchlist trigger，而不是直接買入 trigger
- 在我們的架構對應 `LONG_WATCH` 或 `LONG_SETUP`

### 2.3 Strong DOWN

原邏輯：

- `JT` 最近 3 bar 連續下跌
- `FF` 最近 3 bar 連續流出
- smart-money proxy 連續冷
- 多時間框架同向

我對它的理解：

- 這是「下跌趨勢延續」signal
- 對沽空或避開 long entry 有參考價值
- 但沽空需要額外處理 gap risk、borrow risk、short squeeze risk
- 對本 app，初期建議先輸出 `SHORT_WATCH`，不要輸出直接做空建議
- 在我們的架構對應 `SHORT_CONFIRM`

### 2.4 Early DOWN

原邏輯：

- `JT` inverted V
- `FF` inverted V
- smart-money proxy 由熱轉冷

我對它的理解：

- 這是「早期轉弱」signal
- 對 existing long 的 exit warning 很有價值
- 若用作沽空 entry，必須加 market regime、volume confirmation、support breakdown
- 在我們的架構對應 `SHORT_WATCH` 或 `SHORT_SETUP`

### 2.5 Promoted

原邏輯：

- 昨日是 early reversal
- 今日變成 confirmed strong trend

**這個設計值得保留，而且比單日 signal 更有研究價值。**

原因：

- Promotion 代表信號在時間維度上得到連續確認
- 它的 false positive rate 理論上低於單日 `STRONG`
- 它可以用來做 signal transition 研究：`EARLY → STRONG` 的 promotion 後，未來 3/5/10 日回報是否顯著優於直接 `STRONG`？

建議在我們 app 中命名為：

- `UP_PROMOTION`: 前日 `LONG_SETUP`，今日升至 `LONG_CONFIRM`
- `DOWN_PROMOTION`: 前日 `SHORT_SETUP`，今日降至 `SHORT_CONFIRM`

### 2.6 Signal Transition Matrix

定義每個 signal 可以轉換的方向：

```text
LONG_WATCH   -> LONG_SETUP     (條件增加)
LONG_WATCH   -> NEUTRAL        (momentum 未能持續)
LONG_SETUP   -> LONG_CONFIRM   (promotion 發生)
LONG_SETUP   -> LONG_WATCH     (部分條件失去)
LONG_SETUP   -> SHORT_WATCH    (快速反轉)
LONG_CONFIRM -> LONG_CONFIRM   (維持)
LONG_CONFIRM -> LONG_SETUP     (部分確認條件失去)
LONG_CONFIRM -> SHORT_WATCH    (趨勢反轉早期訊號)

SHORT_WATCH  -> SHORT_SETUP    (條件增加)
SHORT_WATCH  -> NEUTRAL        (反彈)
SHORT_SETUP  -> SHORT_CONFIRM  (promotion 發生)
SHORT_SETUP  -> SHORT_WATCH    (部分條件失去)
SHORT_CONFIRM-> SHORT_CONFIRM  (維持)
SHORT_CONFIRM-> SHORT_SETUP    (部分確認條件失去)
SHORT_CONFIRM-> LONG_WATCH     (反彈早期訊號)

任何狀態  -> REVIEW            (data issue 或 event risk)
```

Transition 本身可以是研究對象：

- `UP_PROMOTION` 出現後的平均 forward return 是否優於其他時刻的 `LONG_CONFIRM`？
- `SHORT_CONFIRM` 快速轉 `LONG_WATCH` 是否出現 short squeeze pattern？

---

## 3. 原邏輯的主要問題

### 3.1 指標定義不透明

`JT`, `FF`, `MCDX`, `Smart Money (PC)` 都不是標準免費資料欄位。

問題：

- 不知道計算方式
- 不知道是否用了 options 或 proprietary data
- 不知道是否有 look-ahead bias
- 不容易重現和回測

建議：

- 不直接複製名稱
- 只保留架構
- 用免費 OHLCV 指標替代

### 3.2 3-bar 規則太容易 overfit

`t0 > t1 > t2` 或 `t0 < t1 < t2` 很直觀，但有幾個風險：

- 過度依賴最近 3 根 bar
- 容易追高或追低
- 在震盪市會反覆翻轉
- 如果沒有 volatility filter，容易被小幅波動誤導

改善方法：

- 加入 `ATR` 或 `NATR` 過濾
- 要求 move 大於 minimum threshold（例如 > 0.5 ATR）
- 用 slope / z-score 取代單純三連升
- 對 V-shape 偵測：要求前 N 日下跌幅度超過 X ATR，再確認反轉

### 3.3 Multi-timeframe 規則需要統一

建議：

- `1D` 是主決策 timeframe
- `4H` 是 early trigger（如果資料可用）
- `1W` 只作 regime/context
- `1W` 不直接決定 `Strong` 或 `Early`

Phase 1 暫時只做 `1D` + `1W`，等資料驗證後才引入 `4H`。

### 3.4 沽空不能直接鏡像買入

買入和沽空不是完全對稱。

沽空額外風險：

- gap up
- earnings surprise
- short squeeze
- hard-to-borrow
- broader market rebound

所以 `SHORT_CONFIRM` 不應直接等於 `SHORT_NOW`。

輸出應該是警示等級：

- `SHORT_WATCH`: 條件開始成立，需留意
- `SHORT_SETUP`: 條件完整，但仍需人工確認
- `SHORT_CONFIRM`: 所有條件成立，但仍受 event risk 過濾

### 3.5 免費資料源的 API 限制比預期嚴重

這是計劃中最容易被低估的風險。

**Alpha Vantage 免費版：**

- 硬限制：25 API calls / day
- 每隻股票抓一次 daily OHLCV time series = 1 call
- 若另外呼叫 indicator endpoints（RSI、MACD、EMA）= 每隻股票 3-5 additional calls
- 結論：**用 indicator endpoints 的話，免費版只能覆蓋 4-6 隻股票/天**
- 修正策略：只抓原始 OHLCV，所有指標本地計算，不用 indicator endpoints

> 即使只抓 OHLCV，25 calls/day 也只能覆蓋 25 隻股票。

設計影響：

- Universe 初始上限應設在 25-50 隻（加 benchmark）
- 必須有 local cache 層，不可以每次 render 都打 API
- 考慮 rotating universe：每天只更新 30% 的 ticker，其餘用 cached data

**其他資料源的限制：**

| 來源 | 免費限制 | 歷史深度 | 主要問題 |
| --- | --- | --- | --- |
| Alpha Vantage | 25 calls/day | 20+ years | 每日 call 配額極低 |
| Polygon.io free | 5 calls/min, unlimited/day | 2 years | 每分鐘限制，但 daily 無上限 |
| Finnhub | 60 calls/min | 有限 | 主要用途是 earnings calendar |
| Stooq | 無官方 API，CSV download | 多年 | 非正式，需 scraping 或 URL pattern |
| Yahoo Finance (yfinance) | 非官方，unstable | 多年 | Rate limit 不透明，隨時失效 |

**推薦初期策略：**

- Primary OHLCV: Yahoo Finance（yfinance）或 Stooq，用 aggressive caching
- Backup OHLCV: Alpha Vantage（只抓原始 OHLCV，不用 indicator endpoints）
- Earnings calendar: Finnhub（60 calls/min，足夠）
- 所有 technical indicators: 本地用 OHLCV 計算，不依賴 remote indicator API

### 3.6 Look-ahead Bias 風險

回測或 replay 時容易無意中使用了「未來的」資料。

常見錯誤：

- 用 adjusted close 時，未來的 split/dividend adjustment 反推到過去
- Moving average 計算包含了當日仍未收市的 bar
- 用整個資料集的 min/max 做 normalization

防範規則（詳見 Section 6.4）。

---

## 4. 免費資料可替代的指標

### 4.1 替代 JT: Trend / Price Structure

計算方式（全部用 OHLCV）：

```text
EMA(20) = exponential moving average of close, span=20
EMA(50) = exponential moving average of close, span=50
trend_up   = close > EMA(20) AND EMA(20) > EMA(50)
trend_down = close < EMA(20) AND EMA(20) < EMA(50)

ema20_slope = (EMA(20)[t] - EMA(20)[t-5]) / EMA(20)[t-5]
  positive slope threshold: > +0.002 (configurable)
  negative slope threshold: < -0.002

breakout_20d = close > max(high[-20:-1])  # exclude today
breakdown_20d = close < min(low[-20:-1])  # exclude today
```

建議初期保留：

- `EMA(20) > EMA(50)` 作為 trend confirmation
- `close > EMA(20)` 作為 price location
- `ema20_slope` 作為 trend direction filter
- `breakout_20d` / `breakdown_20d` 作為confirmation trigger

### 4.2 替代 FF: Volume / Flow Proxy

計算方式：

```text
RVOL = volume[t] / mean(volume[-20:-1])
  high: > 1.5
  moderate: 1.2 - 1.5
  normal: 0.8 - 1.2
  low: < 0.8

OBV[t] = OBV[t-1] + (volume[t] if close[t] > close[t-1] else -volume[t])
obv_slope = linear regression slope of OBV over last 10 bars

CMF(20):
  MFV = ((close - low) - (high - close)) / (high - low) * volume
  CMF = sum(MFV[-20:]) / sum(volume[-20:])
  bullish: > 0.05
  neutral: -0.05 to 0.05
  bearish: < -0.05

CLV (close location value):
  CLV = (close - low) / (high - low)   # 0 = closed at low, 1 = closed at high
  bullish: > 0.65
  bearish: < 0.35
```

建議初期保留：

- `RVOL`：最容易計算，最直觀
- `CMF(20)`：比 OBV 更穩定，不受 volume spike 單日影響
- `CLV`：配合 breakout 使用

### 4.3 替代 Smart Money (PC): Participation Confirmation

因為 options out of scope，所以不要嘗試假裝有 smart money data。

改用「參與度確認」組合：

```text
participation_confirmed =
  RVOL > 1.5
  AND CLV > 0.65
  AND CMF(20) > 0
  AND (gap_not_reversed OR no_significant_gap)
```

這不是 smart money，只是「價格和成交量是否有參與度」。

注意：三個條件同時滿足才算 confirmed。若只有一個或兩個滿足，歸入 `LONG_SETUP` 而非 `LONG_CONFIRM`。

### 4.4 Momentum Indicators

```text
RSI(14):
  formula: RSI = 100 - 100 / (1 + RS)
  RS = average_gain(14) / average_loss(14)
  overbought: > 70
  bullish: 55 - 70
  neutral: 45 - 55
  bearish: 30 - 45
  oversold: < 30

MACD:
  MACD_line = EMA(12) - EMA(26)
  Signal_line = EMA(9) of MACD_line
  Histogram = MACD_line - Signal_line
  bullish: histogram turning positive
  bearish: histogram turning negative

Relative Strength vs SPY:
  RS = (stock_close / stock_close[-20]) / (SPY_close / SPY_close[-20])
  outperforming: RS > 1.05
  underperforming: RS < 0.95
```

### 4.5 Regime Filter 計算

```text
SPY_trend = SPY_close > EMA(50, SPY)
QQQ_trend = QQQ_close > EMA(50, QQQ)
VIX_level: low=<15, normal=15-22, elevated=22-30, fear=>30

long_friendly =
  SPY_trend = True
  AND QQQ_trend = True
  AND VIX_level in [low, normal]

short_friendly =
  SPY_trend = False
  AND QQQ_trend = False
  AND VIX_level in [elevated, fear]

neutral_regime =
  SPY_trend != QQQ_trend   # 兩者不一致
  OR (SPY_close within 1% of EMA(50))  # 在 MA 附近震盪
```

VIX 閾值不是固定的，要根據當時 market context 調整。25 是保守值，正常市場可用 20。

### 4.6 V-shape Detection

用於識別 `LONG_WATCH` / `SHORT_WATCH` 的反轉早期訊號：

```text
# Long V-shape (底部反轉)
prior_decline = min(close[-5:-1]) < close[-6] * 0.97   # 前 5 日有 3% 以上下跌
recovery_start = close[t] > close[t-1]                  # 今日收升
rsi_recovering = RSI(14)[t] > RSI(14)[t-2]              # RSI 連升 2 日
volume_picking_up = RVOL > 1.1

early_long_reversal =
  prior_decline
  AND recovery_start
  AND rsi_recovering
  AND volume_picking_up

# Short inverted-V (頂部反轉)
prior_rally = max(close[-5:-1]) > close[-6] * 1.03      # 前 5 日有 3% 以上上升
reversal_start = close[t] < close[t-1]                   # 今日收跌
rsi_weakening = RSI(14)[t] < RSI(14)[t-2]               # RSI 連跌 2 日

early_short_reversal =
  prior_rally
  AND reversal_start
  AND rsi_weakening
```

以上閾值是起點，需要透過 forward return 研究調整。

---

## 5. 推薦的 v0 Signal 架構

### 5.1 三層 Long Signal Ladder

**`LONG_WATCH`** — 早期訊號，需要進一步確認

觸發條件（滿足以下大部分）：

- RSI(14) 穿越 50 向上（從下方穿越）
- MACD histogram 由負轉正
- CMF(20) 由負轉正（從 < -0.05 轉為 > 0）
- V-shape detection 成立
- 前期下跌幅度超過 1 ATR

用途：加入 watchlist，等待更多確認，不建議直接買入。

---

**`LONG_SETUP`** — 條件成形，但未完全確認

觸發條件（需全部滿足）：

- `close > EMA(20)`
- `EMA(20) slope > 0`（5 日 slope 為正）
- `RSI(14) > 55`
- `RVOL > 1.2`
- `CMF(20) > 0`（輕微正向流入）
- Market regime: long_friendly 或 neutral（不能是 short_friendly）

用途：進入高度關注名單，計劃入場點，評估 stop 位置。

---

**`LONG_CONFIRM`** — 強確認，可考慮行動

觸發條件（需全部滿足）：

- `breakout_20d = True`（突破 20 日高位）
- `RVOL > 1.5`
- `CMF(20) > 0.05`（明確正向流入）
- `CLV > 0.65`（收盤接近日高）
- `EMA(20) > EMA(50)`
- `RSI(14) > 55`
- Market regime: long_friendly
- Not within earnings danger window（距 earnings 超過 5 個交易日）

用途：最強的 long signal，仍然是建議，不是指令。

---

**`UP_PROMOTION`** — 連續確認，信號質量最高

觸發條件：

- 前一個交易日 signal 為 `LONG_SETUP`
- 今日 signal 升至 `LONG_CONFIRM`

特點：

- 比單日 `LONG_CONFIRM` 有更多時間維度的驗證
- 需要單獨追蹤 forward return，以驗證是否比普通 `LONG_CONFIRM` 更有優勢

---

### 5.2 三層 Short Signal Ladder

**`SHORT_WATCH`** — 早期弱化訊號

觸發條件（滿足以下大部分）：

- `close < EMA(20)`（今日首次跌穿）
- `RSI(14) 穿越 50 向下`
- Relative strength vs SPY 開始弱化（RS < 0.97 且仍在下跌）
- V-shape 反轉（inverted）訊號

用途：現有 long position 的 exit warning，不建議作為沽空入場。

---

**`SHORT_SETUP`** — 條件成形

觸發條件（需全部滿足）：

- `close < EMA(20)`
- `EMA(20) slope < 0`
- `RSI(14) < 45`
- `CMF(20) < 0`（資金流出）
- Market regime: short_friendly 或 neutral

用途：明確的 short 候選，仍需人工確認 event risk 和 squeeze risk。

---

**`SHORT_CONFIRM`** — 強確認

觸發條件（需全部滿足）：

- `breakdown_20d = True`（跌穿 20 日低位）
- `RVOL > 1.5`
- `CMF(20) < -0.05`
- `CLV < 0.35`（收盤接近日低）
- `EMA(20) < EMA(50)`
- `RSI(14) < 45`
- Market regime: short_friendly
- No earnings within 5 trading days

用途：研究標籤，表示 short setup 完整，但仍需人工確認。

---

**`DOWN_PROMOTION`** — 連續下跌確認

觸發條件：

- 前一個交易日 signal 為 `SHORT_SETUP`
- 今日 signal 降至 `SHORT_CONFIRM`

---

### 5.3 非方向性標籤

**`NEUTRAL`**

- 指標方向衝突（例如 RSI 強但 CMF 負，或 trend 正但 regime 負）
- 無明確 setup，只是平靜

**`AVOID_CHOP`**

- 價格反覆穿越 EMA(20)（過去 5 日超過 2 次）
- ATR 上升但無方向
- RSI 在 45-55 之間震盪
- RVOL 低於 0.8

**`REVIEW_DATA`**

- 缺少 OHLCV 資料
- 資料 stale（超過 2 個交易日未更新）
- 歷史不足（少於 60 個交易日）

**`REVIEW_EVENT`**

- Earnings within 3 個交易日
- 異常 gap（超過 3 ATR）
- 股票出現 halt 或停牌記錄

---

### 5.4 Signal 優先順序與衝突處理

當同一隻股票在不同條件下可能同時觸發多個標籤時，優先順序如下：

```text
REVIEW_DATA     > 所有其他標籤    (資料問題優先)
REVIEW_EVENT    > 所有方向性標籤  (事件風險優先)
AVOID_CHOP      > 方向性標籤      (震盪期不輸出方向)
LONG_CONFIRM    > LONG_SETUP      (條件更強的優先)
SHORT_CONFIRM   > SHORT_SETUP     (同上)
UP_PROMOTION    > LONG_CONFIRM    (promotion 是附加標籤，可與 LONG_CONFIRM 並存)
DOWN_PROMOTION  > SHORT_CONFIRM   (同上)
NEUTRAL         (最後，無其他觸發時)
```

---

## 6. 指標有效性的研究方法

### 6.1 不用主觀判斷，要用 forward return

每個 signal 都要記錄：

```text
signal_date:           YYYY-MM-DD
ticker:                symbol
signal_class:          LONG_CONFIRM / LONG_SETUP / etc.
close_at_signal:       收盤價
ret_1d:                next 1-day return
ret_3d:                next 3-day return
ret_5d:                next 5-day return
ret_10d:               next 10-day return
ret_1d_vs_spy:         ret_1d - SPY_ret_1d
ret_5d_vs_spy:         ret_5d - SPY_ret_5d
mfe_5d:                max favorable excursion over 5 days
mfe_10d:               max favorable excursion over 10 days
mae_5d:                max adverse excursion over 5 days
mae_10d:               max adverse excursion over 10 days
earnings_in_window:    True/False (earnings within 10-day holding period)
regime_at_signal:      long_friendly / short_friendly / neutral
atr_at_signal:         ATR value on signal date
rvol_at_signal:        RVOL on signal date
```

### 6.2 Long Signal 評估

Long signal 好壞，不只看 win rate。

需要看：

| Metric | 說明 |
| --- | --- |
| Mean 5D return | 平均 5 日回報 |
| Median 5D return | 中位數（比 mean 更 robust） |
| Hit rate vs SPY | 跑贏 SPY 的比例 |
| Mean MAE (5D) | 平均最大逆向波動 |
| False breakout rate | 突破後 3 日內收回突破點的比例 |
| Signal count | 樣本量足夠才有統計意義 |
| Return by regime | 分 regime 看回報，避免 regime bias |

Win rate 不是主要評估標準。重點是 **mean return > 0 and significantly > SPY** 在足夠大的樣本中。

### 6.3 Short Signal 評估

Short signal 需要更嚴格，因為背景風險不對稱。

需要看：

| Metric | 說明 |
| --- | --- |
| Mean 3D / 5D downside follow-through | 是否真的繼續跌？ |
| Probability of immediate rebound | 1D 內反彈超過 1% 的比例 |
| Mean MAE (5D) | 沽空後被軋倉的幅度 |
| Performance in weak regime only | 只在 short_friendly 時有效？ |
| Earnings gap risk | earnings window 內的失敗比例 |
| Short squeeze frequency | 極端逆向事件的比例 |

建議：short signal 在研究初期只做 research label，不輸出交易建議。

### 6.4 Look-ahead Bias 防範規則

每個 replay 或 backtest 必須遵守以下規則：

```text
規則 1: 資料截止點
  對於 week_ending_date = W，只能使用 close_date <= W 的資料。
  不得使用 W+1 或之後的 price、indicator、或 announcement。

規則 2: Adjusted close 的使用
  如果用 split/dividend adjusted close，必須確認 adjustment factor
  是以當日可知的資訊計算，不能把未來的 split 回推到過去。
  建議：用 unadjusted close 計算 returns，只用 adjusted close 計算 indicators。

規則 3: Moving average lookback window
  計算 EMA(20) 需要至少 20 個 data points。
  如果歷史不足，該 ticker 的 signal 輸出 REVIEW_DATA，不輸出方向性標籤。

規則 4: Forward return 的計算起點
  Forward return 從 signal_date 的次日開盤（或次日收盤）計算。
  不能用 signal_date 的收盤價做 round trip。

規則 5: Universe 的 survivorship bias
  不能只用「今日仍在交易的股票」做回測。
  否則 forward return 會偏向存活下來的贏家。
  初期處理：記錄每個 ticker 的加入和退出日期，replay 時只包含當時已在 universe 的 ticker。

規則 6: V-shape 的定義不能用未來 bar
  V-shape 的識別必須只用 t0 當日或之前的資料。
  不能說「因為明天收高所以今天是 V-shape 底部」。
```

### 6.5 下行風險量度

除了 win rate 和 mean return 之外，必須追蹤：

```text
Max drawdown during holding period:
  對每個 signal，計算從 signal_date 到 signal_date + N 日的路徑中的最大回撤

MAE (max adverse excursion):
  每個 signal 的最大逆向波動（long 的話就是最低點距入場的跌幅）
  MAE > 5% 的 signal 比例：代表需要很大的 stop 才能持有

Risk-adjusted return:
  mean_return / mean_MAE（越高越好）

Tail events:
  forward return < -10% 的 signal 佔比（大輸的比例）
  特別要看 earnings 在 window 內的 tail event 比例
```

### 6.6 統計有效性要求

在宣稱某個 signal 有用之前，需要：

```text
Sample size:      至少 50 個 signal instances（更多更好）
T-test:           mean return 顯著大於 0（p < 0.05）
Benchmark test:   mean return 顯著大於 SPY 同期回報
Regime split:     long_friendly regime 和 neutral regime 分開看
Subperiod check:  把樣本分成兩半，各自的結論是否一致？

如果以上任何一項不能滿足，該 signal 標記為 UNVALIDATED，不能進入 production。
```

---

## 7. 第一批要測的假設

### 7.1 Momentum Continuation

假設：

- `close > EMA(20)`
- `EMA(20) > EMA(50)`
- `RSI(14) > 55`
- `RVOL > 1.2`

問題：

- 未來 5D 是否跑贏 SPY？
- 加上 `CMF(20) > 0` 是否提高 hit rate？
- 只有在 `long_friendly regime` 才有效嗎？

### 7.2 Breakout Confirmation

假設：

- `breakout_20d = True`
- `RVOL > 1.5`
- `CLV > 0.65`

問題：

- False breakout rate 是否低於無 volume filter 的 breakout？
- 5D MAE 是否可接受？
- 在 VIX > 22 時，false breakout rate 是否明顯上升？

### 7.3 Early Reversal

假設：

- RSI 穿越 50 向上
- MACD histogram 由負轉正
- CMF(20) 由負轉正

問題：

- 是否真的比 `LONG_CONFIRM` 更早出現？
- Early signal 的 false positive 是否超過 50%？
- `LONG_SETUP → LONG_CONFIRM` 的 UP_PROMOTION 是否比單獨 early signal 有更好的 5D return？

### 7.4 Short Breakdown

假設：

- `breakdown_20d = True`
- `RSI(14) < 45`
- `CMF(20) < 0`
- `short_friendly regime`

問題：

- 未來 3D / 5D 是否有 downside follow-through？
- 只有在 `SPY < EMA(50)` 時有效？
- MAE（逆向波動）是否在可接受範圍？

### 7.5 Signal Transition Hypothesis

假設：

- `UP_PROMOTION` 出現（前日 `LONG_SETUP`，今日 `LONG_CONFIRM`）

與對照組比較：

- 非 promotion 的普通 `LONG_CONFIRM`

問題：

- UP_PROMOTION 的 5D / 10D mean return 是否顯著高於普通 LONG_CONFIRM？
- UP_PROMOTION 的 MAE 是否較小（即信號更穩定）？
- UP_PROMOTION 的 false breakout rate 是否較低？

### 7.6 Regime Dependency

假設：

- 同樣的 `LONG_CONFIRM` signal
- 分 `long_friendly` 和 `neutral` regime 看結果

問題：

- `long_friendly` regime 的 mean return 是否顯著高於 `neutral` regime？
- 如果 regime filter 移除，signal 的 hit rate 下降多少？
- Regime filter 對 `SHORT_CONFIRM` 的影響是否更大？

### 7.7 Volume Filter 的邊際價值

假設：

- `LONG_CONFIRM` 分成兩組：`RVOL > 1.5` vs `RVOL 1.2-1.5`

問題：

- 高 RVOL 組的 forward return 是否顯著更好？
- 低 RVOL 的 breakout 的 false breakout rate 是否更高？

---

## 8. Data Source 詳細分析

### 8.1 Alpha Vantage

官方文件：<https://www.alphavantage.co/documentation/>

**免費版限制：**

- 25 API calls / day（固定硬限制）
- Rate limit: 5 calls / minute

**適合用途：**

- 小型 universe 的 daily OHLCV 抓取（每日 batch，有 caching 的情況下）
- 不適合用來做 indicator endpoints（浪費 call 配額）

**策略：**

- 只呼叫 `TIME_SERIES_DAILY_ADJUSTED`
- 所有 indicator（RSI、MACD、EMA、OBV、CMF）全部本地計算
- 每日 batch job：只抓 universe 中過去 24 小時有更新的 ticker
- 考慮以 Polygon.io 或 Stooq 作為 primary，Alpha Vantage 作為 fallback

### 8.2 Polygon.io

官方文件：<https://polygon.io/docs/>

**免費版限制：**

- 5 API calls / minute
- Unlimited calls / day
- 歷史資料：2 年
- Real-time data: 需要付費，免費版有 15 分鐘延遲

**適合用途：**

- 小型 universe 的 daily OHLCV（每次抓幾隻，加 rate limit 處理）
- Aggregates API 返回 OHLCV 格式，容易處理

**策略：**

- 用 `aggs/ticker/{stocksTicker}/range/1/day/{from}/{to}` endpoint
- 每批 request 之間加 12 秒 sleep（5 calls/min = 12 秒/call）
- 每日 batch 在收市後執行，不做 intraday polling

### 8.3 Finnhub

官方文件：<https://finnhub.io/docs/api>

**免費版限制：**

- 60 API calls / minute
- Earnings calendar 免費

**適合用途：**

- Earnings calendar（主要用途）
- 不適合作為 primary OHLCV 來源（歷史深度有限）

**策略：**

- 只用 `/calendar/earnings?from={from}&to={to}&symbol={symbol}`
- 每週更新一次 earnings risk window
- 快取 earnings 日期，signal engine 在輸出時自動查表

### 8.4 Yahoo Finance (yfinance)

官方：非官方 Python 庫，使用 Yahoo Finance 的非正式 endpoint

**限制：**

- Rate limit 不透明，容易被 block
- 沒有官方 SLA 或保證
- 隨時可能失效

**適合用途：**

- 研究階段、prototype、本地開發
- 不適合作為 production primary source

**策略：**

- 只在開發和研究階段使用
- Production 必須換成有正式 SLA 的來源
- 每次 request 後加 0.5-1 秒 sleep，避免被 block

### 8.5 Stooq

官方：<https://stooq.com/db/h/>

**特點：**

- 非官方，通過 URL pattern 下載 CSV
- 覆蓋廣泛（美股、港股、指數）
- 歷史深度長

**策略：**

- 用於研究和 backtesting 的 historical data 下載
- URL pattern: `https://stooq.com/q/d/l/?s={ticker}&d1={from}&d2={to}&i=d`
- 不適合用作實時或每日更新的 production source

### 8.6 推薦的 Data Source 組合

**Phase 1（研究和 prototype）：**

```text
Primary OHLCV:      yfinance（快，容易，夠用做研究）
Historical batch:   Stooq（補充長歷史）
Earnings calendar:  Finnhub
All indicators:     本地計算（pandas-ta 或手動實現）
```

**Phase 2 以後（production 考慮）：**

```text
Primary OHLCV:      Polygon.io free tier（有正式限制，相對穩定）
Fallback:           Alpha Vantage（只抓 OHLCV，25 calls/day）
Earnings calendar:  Finnhub
All indicators:     本地計算
```

---

## 9. Universe 大小與資料限制

### 9.1 Alpha Vantage 限制下的 Universe 上限

```text
25 calls / day
減去 benchmark: SPY, QQQ, IWM, VIX = 4 calls
剩餘: 21 calls 給 universe ticker
Universe 上限: 21 隻股票（每隻每日 1 call for OHLCV）
```

### 9.2 Polygon.io 限制下的 Universe 上限

```text
5 calls / minute = 300 calls / hour
如果 batch job 在 30 分鐘完成：150 calls
減去 benchmark: 4 calls
Universe 上限: 146 隻股票（理論上）
實際建議: 50-100 隻（留餘量給 retry 和 error handling）
```

### 9.3 初始 Universe 設計建議

```text
ETF universe:         20-30 隻（已在 etfUniverse.ts）
Stock core universe:  50 隻（S&P 500 流動性前 50 或手動篩選）
Stock watchlist:      10-20 隻（用戶自定）
Benchmark series:     SPY, QQQ, IWM, VIX（4 隻，每日必抓）
```

**設計原則：**

- Universe 大小必須由資料源限制決定，不能反過來
- 先確定 data pipeline，再決定 universe 大小
- 如果用 Polygon.io，universe 可以適當擴大

### 9.4 Local Cache 設計要求

因為 API 配額有限，cache 必須是 first-class consideration：

```text
Cache 結構:
  data/cache/{ticker}/{YYYY-MM-DD}.json   (daily OHLCV)
  data/cache/earnings/{ticker}.json        (earnings calendar)
  data/cache/benchmark/{ticker}/{YYYY-MM-DD}.json

Cache 規則:
  讀取優先：先查 cache，cache miss 才打 API
  Cache TTL：daily OHLCV = 收市後固定更新，不 expire
  Earnings：每週更新一次
  Stale check：如果 cache 最新日期距今超過 2 個交易日，標記 REVIEW_DATA
```

---

## 10. 指標有效性的驗收標準

在宣稱某個 indicator 正式進入 v1 signal rule 之前，必須通過以下 gate：

```text
Gate 1: Sample size
  該 signal class 在 research dataset 中出現至少 100 次
  （若 universe 只有 50 隻 stock × 6 個月，大約 130 個交易日，
   每日出現 3 隻 = 390 個 signal instances，足夠的話）

Gate 2: Direction
  Long signal: mean 5D return > 0
  Short signal: mean 5D return < 0

Gate 3: Benchmark excess return
  Long signal: mean 5D return > mean SPY 5D return + 0.5%

Gate 4: Consistency
  把樣本前半和後半分開，兩半的 direction 都是同向

Gate 5: Regime robustness
  不能只在 long_friendly regime 才有效
  至少在 neutral regime 也要有正向 mean return

Gate 6: Downside acceptable
  Long signal: mean MAE (5D) < 3%
  （即平均逆向波動在 3% 以下，止蝕位可設在合理位置）
```

未通過 gate 的 indicator 標記為 `EXPERIMENTAL`，不進入 production classifier。

---

## 11. Academic / Evidence References

這些不是用來證明某個短線 indicator 一定有效，而是用來設定研究方向：

- **Jegadeesh and Titman (1993)**: momentum effect in buying past winners and selling past losers.
- **Moskowitz, Ooi and Pedersen (2012)**: time-series momentum across asset classes.
- **Lo, Mamaysky and Wang (2000)**: technical analysis can be studied with formal statistical pattern recognition rather than subjective chart reading.
- **Asness, Moskowitz and Pedersen (2013)**: value and momentum premia appear across multiple markets and asset classes.
- **Fama and French (1988)**: dividend yields and return predictability — regime context matters.
- **Blume, Easley and O'Hara (1994)**: volume and information: volume carries information beyond prices alone, supporting RVOL as a useful filter.

參考：

- Jegadeesh and Titman: <https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1540-6261.1993.tb04702.x>
- Time Series Momentum: <https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2089463>
- Foundations of Technical Analysis: <https://papers.ssrn.com/sol3/papers.cfm?abstract_id=228099>
- Value and Momentum Everywhere: <https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1363476>

---

## 12. 建議落地次序

### Phase A: 只做 daily data

先不要急著做 4H。

理由：

- 免費 intraday data 容易有限制
- 4H replay 容易因 data availability 不一致而失真
- daily signal 已經足夠驗證大部分假設

先做：

- `1D` trend
- `1D` momentum
- `1D` volume proxy
- `1W` context

### Phase B: 確認 data pipeline

在開始建 signal engine 之前，先確認：

- 選定的資料源能穩定抓到 universe 中所有 ticker 的 daily OHLCV
- Cache 層正常運作
- Earnings calendar 能正確識別 event risk window
- Benchmark series（SPY、QQQ、VIX）每日更新

### Phase C: 建立 signal research dataset

每一日生成 classification：

```text
LONG_WATCH
LONG_SETUP
LONG_CONFIRM
UP_PROMOTION
SHORT_WATCH
SHORT_SETUP
SHORT_CONFIRM
DOWN_PROMOTION
NEUTRAL
AVOID_CHOP
REVIEW_DATA
REVIEW_EVENT
```

追蹤未來 1/3/5/10 日結果，包括 forward return、MAE、MFE。

### Phase D: 統計審查

按照 Section 10 的 gate 驗收每個 indicator。

移除未通過的 indicator，調整閾值，然後重跑。

### Phase E: 決定是否需要 4H

只有當 daily research 證明有基礎 edge，才加入 4H。

4H 的角色：early trigger、tighter timing，不是 main signal source。

---

## 13. Recommendation

保留 OptionFlow screener 的「分類思想」，重寫成這個 app 可驗證的免費資料版本：

| OptionFlow Label | 本 App Label |
| --- | --- |
| Strong UP | `LONG_CONFIRM` |
| Early UP | `LONG_WATCH` / `LONG_SETUP` |
| Strong DOWN | `SHORT_CONFIRM` |
| Early DOWN | `SHORT_WATCH` / `SHORT_SETUP` |
| Promoted | `UP_PROMOTION` / `DOWN_PROMOTION` |
| Neutral | `NEUTRAL` |
| (新增) | `AVOID_CHOP` |
| (新增) | `REVIEW_DATA` / `REVIEW_EVENT` |

最重要的一點：

```text
Signal first, trade later.
Data pipeline first, signal later.
```

先確定資料能穩定取得，再建 signal。先驗證 signal 對未來 3/5/10 日有統計價值，再考慮是否把它變成建議。
