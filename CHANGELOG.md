# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.3] - 2026-07-13

### Changed

- Dependency maintenance via Dependabot: `@slidev/cli` v52.17,
  `@iconify-json/material-symbols` patch bump, and the `eslint` v10.7 /
  `prettier` v3.9.5 dev tooling. GitHub Actions `checkout` updated to v7. No
  functional changes to the service.

## [1.2.2] - 2026-07-04

### Fixed

- **Mermaid diagrams no longer overflow the slide**: both bundled themes
  (`neutral`, `editorial`) now cap client-rendered Mermaid SVGs to the slide
  canvas (`max-width: 100%`, `max-height: 330px`, centered) while preserving
  the aspect ratio. Native-size diagrams previously blew past the ~980×552
  canvas. A per-block ` ```mermaid {scale: …} ` option still applies on top.

## [1.2.1] - 2026-07-04

### Changed

- CI/CD maintenance: GitHub Actions majors updated via Dependabot
  (`setup-node` v6, `upload-artifact` v7, `download-artifact` v8,
  `action-gh-release` v3, `codeql-action` v4) and
  `@iconify-json/material-symbols` patch bump. No functional changes to the
  service.

## [1.2.0] - 2026-07-02

### Added

- **Render cache + ETag**: identical renders (same prepared Markdown + theme) are
  served from an in-memory LRU/TTL cache without re-building
  (`SLIDEKIT_CACHE_MAX`/`SLIDEKIT_CACHE_TTL_MS`). Responses carry a strong
  `ETag`; `If-None-Match` → `304`. Cache hit/miss counters on `/metrics`.
- **Async jobs**: `POST /render?async=1` → `202` + `Location: /jobs/{id}`;
  poll `GET /jobs/{id}`, fetch the deck at `GET /jobs/{id}/result`
  (`SLIDEKIT_JOBS_MAX`/`SLIDEKIT_JOB_TTL_MS`). Optional completion webhook via
  `callback=<url>` with a host allowlist (`SLIDEKIT_WEBHOOK_ALLOW`; empty = off) —
  the only outbound request slidekit ever makes from user input.
- **Richer metadata**: extended OpenGraph/Twitter/SEO params on `/render`
  (`url` + canonical, `siteName`, `locale`, `imageAlt`, `twitterSite`,
  `twitterCreator`, `lang`, `robots`, `themeColor`) and an inline `favicon`
  (emoji → SVG, or a `data:` URI — stays offline).
- gzip/deflate/br response compression (`SLIDEKIT_COMPRESSION`), `X-Request-Id`
  on every response, `Cache-Control` on static GETs, optional CORS
  (`SLIDEKIT_CORS_ORIGIN`), content-negotiated HTML 404.

### Changed

- **Robustness hardening**: slidev builds are spawned detached and the whole
  process group is killed on timeout (no orphaned Vite/esbuild children);
  bounded queue wait (`SLIDEKIT_QUEUE_TIMEOUT_MS` → 503); server
  request/headers timeouts as a slow-loris guard
  (`SLIDEKIT_REQUEST_TIMEOUT_MS`/`SLIDEKIT_HEADERS_TIMEOUT_MS`); stale temp
  files are swept on startup and optionally by a janitor
  (`SLIDEKIT_JANITOR_INTERVAL_MS`).

## [1.1.0] - 2026-06-28

### Removed

- The human upload UI: `GET /` now returns a small JSON service descriptor
  instead of an HTML form (`src/ui.mjs` deleted).
- Redoc (human-readable API docs): `GET /docs`, `GET /docs/redoc.standalone.js`,
  and the vendored ~892 KB bundle. The machine-readable `GET /openapi.json` stays.

### Added

- Drift-guard unit tests (`test/unit/drift.test.mjs`): the OpenAPI route registry
  must match the server's actual route handlers; the LLM-docs endpoint table and
  the documented env vars must match the implementation; the OpenAPI version is
  sourced from `package.json`.

### Changed

- OpenAPI `info.version` is now read from `package.json` (was hardcoded).

## [1.0.3] - 2026-06-28

### Added

- Serve the LLM documentation from the API: `GET /llms.txt` (llmstxt.org index)
  and `GET /llms-full.txt` (full inlined reference). Both are listed in the
  generated OpenAPI spec.

## [1.0.2] - 2026-06-28

### Fixed

- `/render` no longer fails (HTTP 500 "build failed") when the uploaded deck's
  frontmatter sets a `theme:` that is not an installed Slidev theme — e.g. the
  CSS-overlay names `neutral`/`editorial`, or any uninstalled theme. The Slidev
  base theme is normalized to `SLIDEKIT_BASE_THEME` (default `seriph`); the visual
  look remains controlled by the `?theme=` overlay.

## [1.0.1] - 2026-06-28

### Changed

- Release pipeline: dropped the deprecated macOS x64 (Intel) build leg; binaries
  now cover macOS arm64 + Linux x64/arm64. No functional changes to the service.

## [1.0.0] - 2026-06-28

### Added

- HTTP service that turns uploaded Markdown into **one fully self-contained
  Slidev HTML** (CSS, JS and fonts inlined; zero external requests; offline
  `file://`; presenter mode).
- Swappable CSS themes (`neutral`, `editorial`) selectable per request.
- Upload metadata → HTML + OpenGraph/Twitter meta (`title`, `author`, `tags`,
  `description`, `image`).
- Generated OpenAPI 3.1 spec (`/openapi.json`) and offline Redoc docs (`/docs`).
- API-key authentication, in-memory rate limiting, body-size cap, build timeout
  and concurrency/queue limits.
- 12-factor configuration via env vars and an optional `.env` file; structured
  stdout logging with per-request ids; `/health` and `/ready` probes;
  Prometheus `/metrics`; graceful shutdown (SIGTERM).
- Raw `text/markdown` and `multipart/form-data` uploads; `slidekit` CLI bin.
- Single self-contained executable build (`npm run build:binary`) and a
  production `Dockerfile`.
- Unit test suite (`node:test`) and a gated integration test; GitHub Actions CI
  (lint + tests + integration).

[Unreleased]: https://github.com/mikebild/slidekit/compare/v1.2.3...HEAD
[1.2.3]: https://github.com/mikebild/slidekit/releases/tag/v1.2.3
[1.2.2]: https://github.com/mikebild/slidekit/releases/tag/v1.2.2
[1.2.1]: https://github.com/mikebild/slidekit/releases/tag/v1.2.1
[1.2.0]: https://github.com/mikebild/slidekit/releases/tag/v1.2.0
[1.1.0]: https://github.com/mikebild/slidekit/releases/tag/v1.1.0
[1.0.3]: https://github.com/mikebild/slidekit/releases/tag/v1.0.3
[1.0.2]: https://github.com/mikebild/slidekit/releases/tag/v1.0.2
[1.0.1]: https://github.com/mikebild/slidekit/releases/tag/v1.0.1
[1.0.0]: https://github.com/mikebild/slidekit/releases/tag/v1.0.0
