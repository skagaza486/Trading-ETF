# HYP-015 Universe Snapshot Backfill

> ⚠️ **2026-06-23 重大更新（讀呢段先）：** 下面原本嘅 sparse-reconstruction 流程**解決唔到真正嘅偏差**，而且偏差比原先理解嚴重。詳見文末 **「§ 2026-06-23 Provenance 死結與 Option A 分岔」**。原文以下章節保留作背景。

`HYP-015` is no longer blocked on plumbing. The remaining problem is historical month coverage: `point_in_time=1` already works, but it can only be as good as the `watchlist_universe_snapshots` rows we load into D1.

## Current constraint

- Git history for `src/data/watchlist.ts` currently only yields `2026-06`.
- Earlier months therefore need manual reconstruction from whatever monthly review artifact or portfolio-governance note existed at the time.
- We should not fake those older rosters from today's watchlist. That would only hide survivorship / selection bias instead of fixing it.

## Sparse reconstruction flow

The backfill script now supports sparse manual snapshots and auto-carries them forward month by month until the next explicit change month.

Example:

- You provide `2025-04` and `2025-09`.
- The script emits `2025-04`, `2025-05`, `2025-06`, `2025-07`, `2025-08` from the `2025-04` roster.
- `2025-09` then becomes the new carried roster until the next explicit month.

That means we only need to reconstruct months where the watchlist actually changed, plus the first month we want to cover.

## Seed file

Use [universe-snapshots.template.json](/Users/tony/COde/Trading%20ETF/docs/research/universe-snapshots.template.json) as the manual seed file.

Fill it with the earliest trusted month plus any later change months:

```json
{
  "snapshots": [
    {
      "snapshotMonth": "2025-04",
      "effectiveDate": "2025-04-30",
      "tickers": [
        { "ticker": "AAPL", "name": "Apple", "sector": "Technology", "tier": 1 }
      ]
    }
  ]
}
```

## Apply

```bash
INGEST_TOKEN=... npm run research:backfill-universe -- --merge-file docs/research/universe-snapshots.template.json --apply
```

## Verify

1. `curl https://trading-etf.skagaza486.workers.dev/api/d1/research-health`
2. Confirm `pointInTimeHealth.monthsBeforeFirstSnapshot = 0`
3. Run `python scripts/ml/fetch_signals.py --days 730 --point-in-time`
4. Confirm `missing_months=0` and `dropped_before_first_snapshot=0`

---

## § 2026-06-23 Provenance 死結與 Option A 分岔

### 查證到嘅事實

| 事實 | 證據 |
| --- | --- |
| 信號史 = 2025-04-25 → 2026-06-05（280 交易日） | D1 `SELECT MIN/MAX(signal_date)` |
| Repo 最早 commit = **2026-06-17**（仲遲過最後信號日） | `git log --reverse` |
| `watchlist.ts` 只有 2 個 commit（6-18, 6-19） | `git log --follow` |
| 15 個月 universe 快照每月都係**同一批 299 隻**（首尾零差異） | D1 `EXCEPT` 比對 |
| watchlist 係**手揀贏家名單**（PLTR/APP/SMCI/ARM/CRDO…） | `src/data/watchlist.ts` |
| **信號生成讀靜態 `stockWatchlist`，唔讀 universe 快照** | `researchAgent.ts:3,234`、`cronSnapshot.ts:11,483` |
| **Yahoo 唔 serve 退市股**（SPLK/ATVI/FRC/SIVB 全 "delisted, no data"） | `query1.finance.yahoo.com/v8/finance/chart` 探查 |

### 結論：偏差比原先理解嚴重，且內部無法修復

1. **唔止 survivorship（漏退市股），仲有 inclusion bias**：universe 係用 2026-06 後見之明手揀贏家，倒填 14 個月前。
2. **carry-forward backfill 反而坐實偏差**：本 doc 上半部嘅 sparse 流程，因為只有 2026-06 一個 commit-月，`expandMonthlyCarryForward` 把今日 roster 倒蓋全部月份——正正係 doc 自己警告過嘅「faking older rosters」。
3. **偏差喺信號生成層 baked in**：就算 D1 有真 PIT 快照，信號本身只為今日 299 隻生成過 → 淨係 filter 快照解決唔到。
4. **out-of-time holdout 都除唔到**：選股已用咗到 2026-06 嘅資訊。

### Option A（用戶 2026-06-23 選定：外部 PIT universe 重跑）— 兩個子路

> Make-or-break：真零偏差 backtest 需要**含已退市證券**嘅價格資料，而免費 Yahoo 冇。

| 子路 | 除到嘅偏差 | universe 來源 | 價格資料 | 成本 |
| --- | --- | --- | --- | --- |
| **A-full** | inclusion + delisting（連歸零股）→ 真零偏差 | 規則型 PIT index 歷史成員 | **付費 vendor**（Sharadar / Norgate / Polygon delisted / EODHD / CRSP） | 💰 訂閱 + 整合 |
| **A-lite** | inclusion bias（最大嗰個） | 規則型 PIT index 歷史成員（如 S&P500，Wikipedia changes 表可免費重建） | 免費 Yahoo，只得生存股 | 免費 |

**共通工程（兩路都要）：**
1. 規則型 PIT 成員產生器 → 輸出 merge-file JSON（重用 `--merge-file` 注入口）。
2. **重構信號生成**：由讀靜態 `stockWatchlist` 改為按 `signal_date` 讀 PIT 成員（`researchAgent.ts` / `cronSnapshot.ts`）。
3. 重跑全部歷史成員（含 A-full 嘅退市股）信號 backfill → D1。
4. 跑 GATE-EDGE（[`GATE_EDGE.md`](../../GATE_EDGE.md)）出真裁決。

**A-full 額外：** 接付費 vendor adapter（價格 + delisting date）。
**A-lite caveat：** GATE-EDGE PASS 須註明「未除 delisting bias」，唔可作真錢晉級之充分理由。

**決策（2026-06-23）：A-lite 先行**（免費，S&P500 Wikipedia PIT 成員 + Yahoo 存活股）。A-full 付費 vendor（Sharadar / EODHD / Norgate）延後，視 GATE-EDGE 結果再評估。

---

## § 2026-06-23 A-lite 工程交付

### 已建立

| 交付物 | 路徑 | 說明 |
| --- | --- | --- |
| PIT 產生器 | `scripts/ml/build_pit_sp500.py` | Wikipedia S&P500 scraper → 月份快照 JSON；dry-run ✅（503 成員，28 個異動） |
| PIT backfill flag | `scripts/localResearchBackfill.ts --pit` | 從 D1 讀 PIT 成員作 fetch universe；按 `signal_date` 月份過濾信號；舊行為 `--` 無 flag 不變 |

### 執行順序（逐步）

```bash
# 1. 生成 PIT JSON（從 Wikipedia 重建 2025-04 → 今）
python3 scripts/ml/build_pit_sp500.py --out data/pit_sp500_snapshots.json

# 2. 注入 D1（覆寫現有假快照）
INGEST_TOKEN=... .tools/node-v22.22.3-darwin-arm64/bin/node \
  scripts/backfillUniverseSnapshotsFromGit.mjs \
  --merge-file data/pit_sp500_snapshots.json --apply

# 3. PIT-aware 歷史 backfill（~530 tickers × 2y；需數小時）
#    compile → patch → run（同 npm run research:backfill-local）
.tools/node-v22.22.3-darwin-arm64/bin/node ./node_modules/typescript/bin/tsc -p tsconfig.research-sync.json && \
.tools/node-v22.22.3-darwin-arm64/bin/node ./scripts/patchResearchSyncImports.mjs && \
.tools/node-v22.22.3-darwin-arm64/bin/node ./.cache/research-sync/scripts/localResearchBackfill.js --pit --chunk-size 10

# 4. 重建 ML features
.tools/node-v22.22.3-darwin-arm64/bin/node scripts/ml/export_signals_d1.mjs \
  --out data/signals_full.csv
python3 scripts/ml/label.py --in data/signals_full.csv \
  --k 1.5 --out data/signals_labeled.csv

# 5. 確認 research-health
curl https://trading-etf.skagaza486.workers.dev/api/d1/research-health
```

### ⚠️ A-lite 殘餘偏差

- **除去**：inclusion bias（手揀 2026 贏家）— S&P500 PIT 成員係規則型，無後見之明
- **未除**：delisting bias（SPLK/ATVI/FRC/SIVB 等退市股無法從 Yahoo 取得歷史價格）
- **影響**：GATE-EDGE PASS 須附 caveat「delisting bias not corrected」，唔可作真錢晉級充分理由；如需全除偏差，升 A-full（Sharadar/EODHD/Norgate）
