// SP-4 shadow inference handlers.
//
// Shadow inferences are AI scores produced by the Python LightGBM model running
// in GitHub Actions. They never affect trades — they exist to accumulate a record
// of what the model would have done vs what SP-2 rule-only did.

import { json, jsonError } from '../http'
import { PAPER_ACCOUNT_ID } from '../sp1/types'

interface InferenceRow {
  id: string
  inferenceDate: string
  ticker: string
  signalDate: string
  signalLabel: string
  probTake: number
  decision: string
  modelRunId: string
  schemaVersion: string
  featureHash: string
}

interface ModelRegistration {
  runId: string
  schemaVersion: string
  promotedAt: string
  oofAuc?: number
  oofPrecision?: number
  oofBrier?: number
  nRows?: number
  nFeatures?: number
  featureHash?: string
  notes?: string
}

// POST /api/sp4/shadow — receive daily inferences from Python scorer
export async function handleSp4Shadow(request: Request, env: Env): Promise<Response> {
  let body: { inferences?: unknown } | null = null
  try {
    body = await request.json() as { inferences?: unknown }
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  if (!Array.isArray(body?.inferences) || body.inferences.length === 0) {
    return jsonError('inferences must be a non-empty array', 400)
  }

  const rows = body.inferences as InferenceRow[]
  const now = new Date().toISOString()
  let written = 0

  for (const r of rows) {
    if (!r.id || !r.inferenceDate || !r.ticker || !r.modelRunId) continue
    try {
      await env.SIGNALPILOT_DB.prepare(`
        INSERT OR IGNORE INTO sp4_shadow_inferences
          (id, inference_date, account_id, ticker, signal_date, signal_label,
           prob_take, decision, model_run_id, schema_version, feature_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        r.id,
        r.inferenceDate,
        PAPER_ACCOUNT_ID,
        r.ticker,
        r.signalDate ?? r.inferenceDate,
        r.signalLabel ?? '',
        r.probTake,
        r.decision,
        r.modelRunId,
        r.schemaVersion ?? '',
        r.featureHash ?? '',
        now,
      ).run()
      written++
    } catch {
      // skip duplicate (UNIQUE constraint) silently
    }
  }

  return json({ written, total: rows.length, date: rows[0]?.inferenceDate })
}

// GET /api/sp4/shadow — read recent inferences
export async function handleSp4ShadowRead(url: URL, env: Env): Promise<Response> {
  const days    = Math.min(Number(url.searchParams.get('days')   ?? '7'),  90)
  const limit   = Math.min(Number(url.searchParams.get('limit')  ?? '200'), 1000)
  const ticker  = url.searchParams.get('ticker')
  const cutoff  = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

  let query = `
    SELECT * FROM sp4_shadow_inferences
    WHERE account_id = ? AND inference_date >= ?
  `
  const binds: unknown[] = [PAPER_ACCOUNT_ID, cutoff]

  if (ticker) {
    query += ' AND ticker = ?'
    binds.push(ticker.toUpperCase())
  }
  query += ' ORDER BY inference_date DESC, ticker ASC LIMIT ?'
  binds.push(limit)

  const { results } = await env.SIGNALPILOT_DB.prepare(query).bind(...binds).all()

  const rows2 = results as unknown as InferenceRow[]
  const takes  = rows2.filter(r => r.decision === 'TAKE')
  const passes = rows2.filter(r => r.decision === 'PASS')

  return json({
    count:  results.length,
    takes:  takes.length,
    passes: passes.length,
    rows:   rows2,
  })
}

// POST /api/sp4/model — register a promoted model in the model registry
export async function handleSp4ModelRegister(request: Request, env: Env): Promise<Response> {
  let body: ModelRegistration | null = null
  try {
    body = await request.json() as ModelRegistration
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  if (!body?.runId || !body.schemaVersion || !body.promotedAt) {
    return jsonError('runId, schemaVersion, promotedAt required', 400)
  }

  const now = new Date().toISOString()
  await env.SIGNALPILOT_DB.prepare(`
    INSERT OR REPLACE INTO sp4_model_registry
      (run_id, schema_version, promoted_at, oof_auc, oof_precision, oof_brier,
       n_rows, n_features, feature_hash, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.runId,
    body.schemaVersion,
    body.promotedAt,
    body.oofAuc    ?? null,
    body.oofPrecision ?? null,
    body.oofBrier  ?? null,
    body.nRows     ?? null,
    body.nFeatures ?? null,
    body.featureHash ?? null,
    body.notes     ?? null,
    now,
  ).run()

  return json({ registered: body.runId, at: now })
}
