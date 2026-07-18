# Deployment

> Before exposing slidekit, read [SECURITY.md](../SECURITY.md): `/render`
> executes code, so it must run authenticated and OS-isolated.

## Run it

As a Node service:

```bash
npm ci
node server.mjs            # configure via env / .env
```

Or as the single self-contained binary (no Node/Docker on the host):

```bash
npm run build:binary      # on the target OS/arch
./dist/slidekit-deck --version
PORT=4030 SLIDEKIT_API_KEYS=$KEYS ./dist/slidekit-deck
```

## Production checklist

- **Auth on:** set `SLIDEKIT_API_KEYS` (and `SLIDEKIT_REQUIRE_AUTH_ALL=1` if you
  also want `/themes`, `/docs`, etc. gated).
- **Durable product statistics:** ensure `SLIDEKIT_ANALYTICS_STATE_PATH` points
  into the service's writable state directory. `/v1/stats/builds` reuses the
  existing service keys and fails closed when no key is configured.
- **Bind locally behind a proxy:** `HOST=127.0.0.1`, terminate TLS + add WAF/auth
  at the proxy. Set `SLIDEKIT_TRUST_PROXY=1` so client IPs (and per-IP rate
  limits) are correct.
- **Limits sized to your load:** `SLIDEKIT_RATE_LIMIT_MAX`,
  `SLIDEKIT_MAX_BODY_BYTES`, `SLIDEKIT_BUILD_TIMEOUT_MS`,
  `SLIDEKIT_BUILD_CONCURRENCY`, `SLIDEKIT_BUILD_QUEUE_MAX`.
- **OS isolation:** non-root user, ephemeral + egress-restricted container/VM.

## Health & lifecycle

- `GET /health` — liveness (200 while the process is up).
- `GET /ready` — readiness (200 when accepting work; **503 while draining**).
- On `SIGTERM`/`SIGINT` the service fails `/ready`, stops accepting connections,
  drains the in-flight build (up to `SLIDEKIT_SHUTDOWN_GRACE_MS`), then exits 0.

Point your load balancer / orchestrator liveness at `/health` and readiness at
`/ready` so rolling deploys drain cleanly.

## Logging

Structured logs go to **stdout** (one JSON line per record; `LOG_FORMAT=pretty`
for local dev). Collect stdout with your platform's log pipeline; the service
does not write log files. API keys are never logged (only short fingerprints).
Request records include W3C `trace_id`/`span_id`/`parent_span_id`, service
version and deployment environment; valid incoming trace context is continued
into callbacks.

## Binary cache

The build downloads the pinned official Node.js 22.23.1 runtime and verifies its
platform-specific SHA-256 checksum. It does not embed the local package-manager
runtime. The binary extracts its runtime to `~/.cache/slidekit-deck/<payload-hash>` on
first run (later starts are instant). A rebuilt binary uses a new hash and prunes
old versions. Ensure the home/cache directory is writable.
