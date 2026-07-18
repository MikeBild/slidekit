# Configuration

slidekit is configured entirely via environment variables (12-factor). For local
use, copy [`.env.example`](../.env.example) to `.env` (gitignored) — it is loaded
automatically via Node's built-in `process.loadEnvFile`. Invalid values fail fast
at startup.

| Variable                        | Purpose                                                                                            | Default                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `PORT`                          | HTTP listen port                                                                                   | `4030`                                    |
| `HOST`                          | Bind address (`0.0.0.0` = all interfaces; `127.0.0.1` behind a proxy)                              | `0.0.0.0`                                 |
| `LOG_LEVEL`                     | `debug` \| `info` \| `warn` \| `error`                                                             | `info`                                    |
| `LOG_FORMAT`                    | `json` \| `pretty`                                                                                 | `json`                                    |
| `DEPLOYMENT_ENVIRONMENT`        | Stable environment name included in structured logs                                                | `NODE_ENV` or `development`               |
| `SLIDEKIT_API_KEYS`             | Comma-separated keys. Non-empty ⇒ `/render` requires a valid key. Empty ⇒ auth off (warns at boot) | (empty)                                   |
| `SLIDEKIT_REQUIRE_AUTH_ALL`     | `1` ⇒ require a key on all routes except `/health` and `/ready`                                    | `0`                                       |
| `SLIDEKIT_TRUST_PROXY`          | `1` ⇒ derive client IP from `X-Forwarded-For` (only behind a trusted proxy)                        | `0`                                       |
| `SLIDEKIT_RATE_LIMIT_MAX`       | Max `/render` requests per window per identity; `0` disables                                       | `30`                                      |
| `SLIDEKIT_RATE_LIMIT_WINDOW_MS` | Rate-limit window (ms)                                                                             | `60000`                                   |
| `SLIDEKIT_MAX_BODY_BYTES`       | Max upload size → `413`                                                                            | `1048576` (1 MiB)                         |
| `SLIDEKIT_BUILD_TIMEOUT_MS`     | Kill a build (and its whole process group) after this → `504`                                      | `120000`                                  |
| `SLIDEKIT_BUILD_CONCURRENCY`    | Concurrent builds (keep `1`; `style.css` is shared)                                                | `1`                                       |
| `SLIDEKIT_BUILD_QUEUE_MAX`      | Queued builds before `503`                                                                         | `20`                                      |
| `SLIDEKIT_QUEUE_TIMEOUT_MS`     | Max time a request waits in the build queue before `503`                                           | `30000`                                   |
| `SLIDEKIT_JANITOR_INTERVAL_MS`  | Periodic sweep of stale temp files (`.deck-*.md`, work dir); `0` disables                          | `0`                                       |
| `SLIDEKIT_REQUEST_TIMEOUT_MS`   | `http.Server.requestTimeout` — bounds slow/hung uploads; `0` off                                   | `130000`                                  |
| `SLIDEKIT_HEADERS_TIMEOUT_MS`   | `http.Server.headersTimeout` — bounds slow-loris header sends; `0` off                             | `15000`                                   |
| `SLIDEKIT_CACHE_MAX`            | In-memory render-cache entries (same Markdown + theme); `0` disables                               | `50`                                      |
| `SLIDEKIT_CACHE_TTL_MS`         | Render-cache entry TTL; `0` = never expire                                                         | `0`                                       |
| `SLIDEKIT_JOBS_MAX`             | Max retained async jobs/results (`?async=1`)                                                       | `100`                                     |
| `SLIDEKIT_JOB_TTL_MS`           | Async job + result lifetime                                                                        | `600000`                                  |
| `SLIDEKIT_WEBHOOK_ALLOW`        | Comma-separated host allowlist for the async `callback` URL; empty ⇒ webhooks disabled             | (empty)                                   |
| `SLIDEKIT_COMPRESSION`          | gzip/deflate/br-compress compressible responses; `0` disables                                      | `1`                                       |
| `SLIDEKIT_CORS_ORIGIN`          | Value for `Access-Control-Allow-Origin` (e.g. `*`); empty ⇒ no CORS headers                        | (empty)                                   |
| `SLIDEKIT_DEFAULT_THEME`        | Fallback CSS-overlay theme name                                                                    | `neutral`                                 |
| `SLIDEKIT_BASE_THEME`           | Slidev base theme (installed npm theme); the deck's own `theme:` is normalized to this             | `seriph`                                  |
| `SLIDEKIT_THEMES_DIR`           | Directory of `*.css` themes                                                                        | `<root>/themes`                           |
| `SLIDEKIT_WORK_DIR`             | Scratch dir for build outputs                                                                      | `<tmpdir>/slidekit`                       |
| `SLIDEKIT_ANALYTICS_STATE_PATH` | Durable aggregate state used by the authenticated product statistics API                           | `$XDG_STATE_HOME/slidekit/analytics.json` |
| `XDG_STATE_HOME`                | Platform state root used when `SLIDEKIT_ANALYTICS_STATE_PATH` is unset                             | `~/.local/state`                          |
| `SLIDEKIT_SHUTDOWN_GRACE_MS`    | Drain time for the in-flight build on SIGTERM                                                      | `10000`                                   |

## Notes

- **Auth identity for rate limiting** is the API key when auth is enabled, else
  the client IP (which requires a correct `SLIDEKIT_TRUST_PROXY` behind a proxy).
- **Rate limiting and the render cache/job store are in-memory / per process.**
  Running multiple instances needs a shared store or a proxy-level equivalent.
- **Product statistics are durable and low-cardinality.** The aggregate state
  contains no deck content, names, URLs, job IDs, user identifiers or credentials.
- **Webhooks (`callback`)** are the only outbound requests slidekit makes from
  user input; they are refused unless the target host is in `SLIDEKIT_WEBHOOK_ALLOW`.
- **Themes/fonts** are bundled; see the main README for adding themes.
