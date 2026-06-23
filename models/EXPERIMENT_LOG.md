# SP-4 ML Experiment Log

Iteration history for the SignalPilot meta-labeling model. One entry per training run
(promoted, rejected, or reverted). The goal is to never repeat a failed experiment and
to preserve the *reasoning* behind each change — git history and `meta_*.json` capture
the *what*, this file captures the *why* and the *counterfactuals*.

**How to use:** add an entry at the top whenever you train a new model or run an
experiment. Record the hypothesis, the change, the result (with numbers), and the
conclusion. Mark reverted/rejected experiments clearly so future-you doesn't re-try them.

**Current promoted model:** `model_v1.0.1_ef58f809` (threshold = 0.48)
**v1.0.2 run files:** `meta_v1.0.1_33343556.json` · `baselines_74ea0a58.json` · `folds_v1.0.1_33343556.json`

---

## Baselines reference

Gate is **relative to baselines**, recomputed per run (baselines drift with labels):

| Baseline | Meaning |
| --- | --- |
| `B0_always_take` | Take every eligible signal — precision = base rate |
| `B3_logreg` | Logistic regression on same features — AUC floor |

Promotion criteria (all must pass): AUC > LogReg +0.02 · precision > AlwaysTake +0.02 ·
avg_prec > AlwaysTake · Brier < AlwaysTake · last 2 OOF folds AUC ≥ 0.50 (folds with
< 20 test samples skipped).

---

## v1.0.2 — `33343556` — 2026-06-24 — ❌ Not promoted (PIT universe, fold 4 instability)

**Hypothesis:** PIT S&P 500 universe (A-lite) removes inclusion bias — the old watchlist
was 2026-06 hand-picked hindsight winners backfilled to 2025-04. Expect AUC to shift vs
v1.0.1 baseline 0.5537; direction uncertain (bias may have inflated OR deflated apparent
signal quality). 536 eligible signals (+27% vs 422 in v1.0.1).

**Change:** Features built on PIT-filtered signals from `watchlist_universe_snapshots`
(S&P 500 Wikipedia PIT, 15 months 2025-04→2026-06, ~503 members/month). Signal backfill
re-ran with `--pit` flag; signals outside S&P 500 at `signal_date` dropped.
Schema v1.0.1, hash 88b7c91b50fc (same 33 features — sector/industry still blocked on HYP-015).

**A-lite caveat:** delisting bias not corrected (Yahoo has no prices for delisted stocks).
GATE-EDGE PASS with this data must carry this caveat.

**Result:**
- Label distribution: LOWER 27.6% · VERTICAL 40.1% · UPPER 32.3% (TAKE=173, 32.3%)
- Baselines: B0_always_take prec=0.4021 · B3_logreg AUC=0.4714 (numerical instability — divide-by-zero warnings; logreg below 0.5)
- OOF AUC=0.558 (vs v1.0.1: 0.5537 → slight improvement) · precision@take=0.4848 vs AlwaysTake=0.4021 (+8.3pp, up from +2.8pp in v1.0.1)
- Brier 0.2406 · avg_prec 0.4682
- Fold breakdown: F1(n=113) AUC=0.564 · F2(n=52) AUC=0.560 · F3(n=8 → SKIP) · F4(n=21) AUC=0.425
- **Gate: FAIL** — fold 4 AUC 0.425 < 0.50 (21 samples, high variance)

**Conclusion:** ❌ Not promoted. All criteria pass except fold 4 stability.
Fold 4 covers 2026-04-08+ data (~last 2 months) with only 21 test samples — AUC at this
sample size is high-variance (a few mispredictions swing ±0.05+). However, the weak recent
performance is also consistent with real model degradation on newer data.
Aggregate OOF and precision metrics are better than v1.0.1, suggesting PIT correction helped
overall. Promoted model stays **v1.0.1_ef58f809**.
Next step: GATE-EDGE takes precedence — don't re-tune; run the pre-registered holdout test
with v1.0.1 on PIT-corrected signals before further model iterations.

---

## v1.0.1 — `ef58f809` — 2026-06-23 — ✅ PROMOTED (current)

**Hypothesis:** The LOWER triple-barrier was firing 0% of the time, which is
statistically implausible for breakout signals. Suspected a sign bug.

**Change (`scripts/ml/label.py`):** `mae5d` is stored in D1 as a **positive absolute
value** (max drawdown magnitude), but the labeler tested `mae <= -k*atr`, which can
never be true. Fixed to `mae = df["mae5d"].abs()` and `lower_hit = mae >= k*atr`.

**Result:**
- Label distribution: UPPER 33.6%→32.0% · VERTICAL 66.4%→40.8% · **LOWER 0%→27.3% (115 signals)**
- OOF AUC 0.5794 → 0.5537 (task got *harder* — 115 hard negatives re-categorised correctly)
- Gate **failed at t=0.50** (precision +0.018, needs +0.020); **passed at t=0.48**
  (precision 0.4271 vs AlwaysTake 0.3987, recall 0.4098, take_rate 0.392)

**Conclusion:** ✅ Fixed a root-cause data bug. AUC drop is expected and *honest* — the
old model never learned the stop-loss side. Shadow inference threshold set to 0.48.

**Open item:** precision collapses at t > 0.52 (only ~11 TAKE at t=0.55, prec ~0.36) —
calibration issue (`CalibratedClassifierCV` with small folds). Address in v2.

---

## v1.1.0 — `db2b17a5` — 2026-06-23 — ❌ REVERTED (feature pruning)

**Hypothesis:** 7 near-zero-importance boolean features (`aboveEma200`, `nearHigh52w`,
`breakout20d`, etc.) are noise and should be pruned.

**Change:** Dropped 7 booleans → 26 features (from 33).

**Result:** OOF AUC 0.5794 → **0.5267** (−0.053). Gate fails AUC margin.

**Conclusion:** ❌ Reverted. These booleans look zero-importance because they're
**near-constant in breakout signals** (the SP-2 filter already implies them — selection
bias), but their *interaction effects* still contribute. Pruning hurt. **Do not re-try
naive importance-based pruning.** Schema reverted to 33 features (kept version as 1.0.1
to track the label fix separately).

---

## v1.0.0 — `8aa032a3` — 2026-06-23 — ⚠️ SUPERSEDED (had label bug)

**First promoted model.** 422 signals, 33 features, triple-barrier k=1.5.

**Result:** OOF AUC 0.5794 vs LogReg 0.4960 · precision@take 0.4615 vs AlwaysTake
0.4248 · Brier 0.2441. Gate passed at t=0.50.

**Conclusion:** ⚠️ Superseded by v1.0.1. The 0% LOWER label rate (later found to be the
`mae5d` sign bug) means this model never learned the downside — its metrics were
optimistic. Kept in repo for reference only; **do not deploy.**

---

## Backlog / next experiments

1. **Calibration fix** — precision unstable at high thresholds; `CalibratedClassifierCV`
   folds too small. Try isotonic vs sigmoid, or larger calibration set.
2. **Threshold sweep v1.0.1** — finer scan around 0.46–0.52 once calibration improves.
3. **HYP-015 sector features** — needs 14+ months `watchlist_universe_snapshots`
   (currently 1). Adds `sector`/`industry` → retrain as v1.1.x.
4. **k sweep** — now that LOWER fires, re-evaluate k=1.5 vs 1.0/2.0 for barrier width.
