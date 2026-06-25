// Secrets are not emitted by `wrangler types` (they live only in the secrets
// store, never in wrangler.capital.toml). Merge them into the generated
// global Env interface here.
//
// Set in production with:
//   wrangler secret put CAPITAL_AUTH_TOKEN --config wrangler.capital.toml

// Extend the wrangler-generated Env (which has CAPITAL_DB, TRADING_ETF_DB_RO)
// with the CAPITAL_AUTH_TOKEN secret.
//
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Env {
  /** Single-user bearer token gating every mutation endpoint. */
  CAPITAL_AUTH_TOKEN: string
}
