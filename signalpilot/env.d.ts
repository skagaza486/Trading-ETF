// Secrets are not emitted by `wrangler types` (they live only in the secrets
// store, never in wrangler.signalpilot.toml). Merge them into the generated
// global Env interface here.
//
// Set in production with:
//   wrangler secret put SP_AUTH_TOKEN --config wrangler.signalpilot.toml
interface Env {
  /** Single-user bearer token gating every mutation endpoint. */
  SP_AUTH_TOKEN?: string
}
