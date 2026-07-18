# Architecture

slidekit is a small Node `http` service whose own code imports only Node
built-ins; the **Slidev toolchain is its single runtime dependency** and does the
rendering. Its one job: turn uploaded Markdown into a single, fully self-contained
Slidev HTML.

## Request lifecycle (`POST /render`)

```
client ──Markdown──▶ server.mjs
  1. security headers + (optional) API-key auth + rate limit + body-size cap
  2. resolve theme + parse metadata from query
  3. forceBaseTheme(markdown)                 # normalize deck `theme:` to the base theme
  4. ensureHashRouting(markdown)              # offline + presenter without a server
  5. build.run(): queue → swap style.css to theme → `slidev build` (real Vite)
  6. read the single index.html (vite-plugin-singlefile inlined CSS/JS/fonts)
  7. stripExternals(html)                     # remove favicon + Google Fonts links
  8. injectMeta(html, meta)                   # title + OpenGraph/Twitter, deduped
  ◀── one self-contained HTML (attachment when download=1)
```

The deck is genuinely built by Slidev, so output matches Slidev exactly. Fonts
are base64-inlined (`fonts.css`), so the result has **no external requests**.

## Modules (`src/`)

| Module                 | Responsibility                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `config.mjs`           | Parse/validate env (+ `.env`), derive paths, freeze                                 |
| `logger.mjs`           | Leveled JSON/pretty stdout logger with `child()` bindings                           |
| `server.mjs`           | Composition root: routing, middleware, lifecycle                                    |
| `build.mjs`            | The dangerous core — queue, concurrency, timeout, `slidev build`, cleanup           |
| `html-postprocess.mjs` | Pure helpers: hash routing, theme normalization, external stripping, meta injection |
| `themes.mjs`           | Theme discovery + activation                                                        |
| `auth.mjs`             | API-key extraction + constant-time check                                            |
| `ratelimit.mjs`        | In-memory fixed-window limiter                                                      |
| `openapi.mjs`          | Route registry → OpenAPI 3.1                                                        |
| `metrics.mjs`          | In-memory Prometheus metrics                                                        |
| `stats.mjs`            | Durable, bounded hourly product statistics behind the existing service auth         |
| `trace-context.mjs`    | W3C Trace Context validation, creation and continuation                             |
| `multipart.mjs`        | Minimal `multipart/form-data` parser                                                |

Root `server.mjs` is a thin entry (`start()`), kept so the binary launcher can
spawn `node server.mjs`.

## OpenAPI from a single source of truth

`openapi.mjs` defines a `ROUTES` registry; `buildOpenApi(themes, opts)` turns it
into the spec served at `/openapi.json`. The theme `enum` and the auth security
scheme are injected dynamically, so the docs cannot drift from the runtime.

## Binary packaging

`build-binary.sh` downloads and SHA-256 verifies the pinned official Node.js
22.23.1 runtime, then tars it with `node_modules` + `src/` + themes/fonts/
docs/config into `payload.tgz`, hashes it into a cache key, and compiles a Bun
launcher (`bin/slidekit.ts`) that embeds the payload. On first run the launcher
extracts to `~/.cache/slidekit-deck/<hash>` and spawns the embedded Node running
`server.mjs`. The result is one file with no Docker and no external `node_modules`.
