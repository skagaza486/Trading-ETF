#!/usr/bin/env bash
# SP-1 Paper Ledger smoke test
# Run: SP_AUTH_TOKEN=<your_token> bash scripts/sp1-smoke-test.sh
#
# Exit gate: ANET LONG_BOUNCE → APPROVED, URI LONG_BREAK → POSITION_TOO_SMALL,
#            audit chain.ok = true

set -euo pipefail

BASE="https://signalpilot.skagaza486.workers.dev"
TOKEN="${SP_AUTH_TOKEN:?Set SP_AUTH_TOKEN env var}"

echo "=== SP-1 Smoke Test ==="
echo "Base: $BASE"

# 1. Health check (public, no auth)
echo -e "\n--- 1. Health check ---"
curl -sf "$BASE/health" | jq .

# 2. Resume trading (trading starts disabled fail-closed)
echo -e "\n--- 2. Resume trading (enable kill switch) ---"
TS=$(($(date +%s) * 1000))
N="smoke-$(uuidgen | tr '[:upper:]' '[:lower:]')"
curl -sf -X POST "$BASE/api/control/resume" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-SP-Timestamp: $TS" \
  -H "X-SP-Nonce: $N" | jq .

# 3. Intent: ANET LONG_BOUNCE 2026-06-04 → expect APPROVED
echo -e "\n--- 3. Intent ANET LONG_BOUNCE 2026-06-04 (expect APPROVED) ---"
TS2=$(($(date +%s) * 1000))
N2="smoke-$(uuidgen | tr '[:upper:]' '[:lower:]')"
curl -sf -X POST "$BASE/api/sp1/intent" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-SP-Timestamp: $TS2" \
  -H "X-SP-Nonce: $N2" \
  -H "Content-Type: application/json" \
  -d '{"ticker":"ANET","signalDate":"2026-06-04"}' | jq '{eligibility_status: .intent.eligibility_status, qty: .fill.qty, fill_price_cents: .fill.fill_price_cents, price_source: .fill.price_source, cash_balance_usd: (.cash_balance_cents / 100)}'

# 4. Intent: URI LONG_BREAK 2026-06-03 → expect POSITION_TOO_SMALL (~$1062/share)
echo -e "\n--- 4. Intent URI LONG_BREAK 2026-06-03 (expect POSITION_TOO_SMALL) ---"
TS3=$(($(date +%s) * 1000))
N3="smoke-$(uuidgen | tr '[:upper:]' '[:lower:]')"
curl -sf -X POST "$BASE/api/sp1/intent" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-SP-Timestamp: $TS3" \
  -H "X-SP-Nonce: $N3" \
  -H "Content-Type: application/json" \
  -d '{"ticker":"URI","signalDate":"2026-06-03"}' | jq '{eligibility_status: .intent.eligibility_status, rejection_reason: .intent.rejection_reason}'

# 5. No token → expect 401
echo -e "\n--- 5. No token → expect 401 ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST "$BASE/api/sp1/intent" \
  -H "Content-Type: application/json" \
  -d '{"ticker":"ANET","signalDate":"2026-06-04"}'

# 6. Account balance
echo -e "\n--- 6. Account balance ---"
curl -sf "$BASE/api/sp1/account" \
  -H "Authorization: Bearer $TOKEN" | jq '{accountId, cash_balance_usd}'

# 7. Open positions
echo -e "\n--- 7. Open positions ---"
curl -sf "$BASE/api/sp1/positions" \
  -H "Authorization: Bearer $TOKEN" | jq '{count, positions: (.positions[:3] // [])}'

# 8. Audit chain integrity
echo -e "\n--- 8. Audit chain (chain.ok must be true) ---"
curl -sf "$BASE/api/audit?limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq '{chain_ok: .chain.ok, count}'

echo -e "\n=== Done. Verify: ANET=APPROVED, URI=POSITION_TOO_SMALL, chain.ok=true ==="
