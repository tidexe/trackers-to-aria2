# AGENTS.md

Think in English. Present to the user in Chinese.

Single-file Cloudflare Worker. Entrypoint: `src/index.js` (`export default { fetch }`). No tests, lint, typecheck, or CI.

## Commands

- `npm install` then `npm run dev` (local preview at `127.0.0.1:8787`) / `npm run deploy` (requires `npx wrangler login` first).
- No test runner exists. Test with wrangler as the test method: start `npm run dev`, then `curl` the routes below and check status/body. Do not rely on `node -e` alone since the `cf` fetch option only runs under wrangler.
- Wrangler smoke test (all verified 2026-10-13): `curl 127.0.0.1:8787/health` → 200 `ok`; `/` → usage text (same as `/help`); `/best?format=aria2` → `bt-tracker=udp://...`; `/?list=all_udp` → comma output; `/aria2` → 400; `?list=foo` → 400; `?format=yaml` → 400; `POST /` → 405.

## Architecture — `src/index.js`

- `LISTS` whitelist (12 upstream files under `ngosang/trackerslist`) + `ALIASES` map are the only allowed upstreams. Never build upstream URLs from raw user input (SSRF guard); unknown `list` must return 400.
- `normalizeList`: strips `.txt`, `trackers_` prefix, lowercases, converts `-` to `_`. Keep this when adding variants.
- Route parsing: pathname slashes trimmed; `format` trimmed + lowercased, validated before the bare-`/` branch, defaults to `comma`, must be one of `comma|aria2|lines|json` else 400; bare `/` (no path, no `list`/`type`/`file` param) returns usage text like `/help`, unless `?help=0/false/no/off` opts out (falls through to default `all`); otherwise `list` comes from `?list=` / `?type=` / `?file=`, else path segment; `aria2` is not a valid list id (`/aria2` → 400, output aria2 format via `?format=aria2`).
- Core transform: `split(/\r?\n/)` → `trim` → drop empties → `Set` dedupe → `join(",")` or per-format body. Keep dedupe.
- Upstream `fetch` uses `cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 43200, "404": 60, "500-599": 0 } }` — Cloudflare-only options, do not remove (`cacheTtlByStatus` alone does not imply `cacheEverything`). Success responses carry `cache-control: public, max-age=43200` + CORS `*`; error responses carry `cache-control: no-store` + CORS `*`.
- Only `GET`/`HEAD` allowed (else 405 with `Allow: GET, HEAD`); `HEAD` returns null body on all routes; `/health` → `ok`, `/help` → usage text (both case-insensitive, trailing-slash tolerant); `?help=0/false/no/off` passes through as a normal request; upstream non-2xx → 502, network failure → 500.

## Conventions

- Keep the worker dependency-free and single-file; `wrangler.toml` stays minimal (`main = "src/index.js"`).
- Full route/format contract lives in `README.md` — update it when `LISTS`, `ALIASES`, or formats change.
