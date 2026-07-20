# SlideKit archival record

SlideKit was retired as a standalone service on 2026-07-20 after its complete
deck lifecycle moved into ContentKit v1.18.0. This repository is retained as
read-only source and release history; `v1.3.0` is the final standalone release.

## Successor

- Repository: <https://github.com/MikeBild/contentkit>
- Release: <https://github.com/MikeBild/contentkit/releases/tag/v1.18.0>
- Deck guide: <https://github.com/MikeBild/contentkit/blob/main/docs/SLIDE_DECKS.md>
- Migration runbook: <https://github.com/MikeBild/contentkit/blob/main/docs/SLIDEKIT_MIGRATION.md>
- OpenAPI: <https://contentkit-api.mikebild.dev/openapi.json>

ContentKit now owns immutable `kind: deck` revisions, deterministic DeckPlans,
information architecture and narrative, semantic SVG/PNG components, neutral
and editorial themes, self-contained offline Slidev HTML, presenter mode,
named previews, atomic release/rollback, signed publication webhooks,
Prometheus metrics and site-scoped product statistics.

## API mapping

| Historical SlideKit                  | ContentKit successor                                                    |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `POST /render`                       | `POST /v1/sites/{site}/decks/compile`                                   |
| `POST /render?async=1` and `/jobs/*` | `async: true` and `/v1/sites/{site}/deck-jobs/*`                        |
| `GET /themes`                        | `GET /v1/deck-themes`                                                   |
| `GET /v1/stats/builds`               | `GET /v1/sites/{site}/stats/decks`                                      |
| Standalone HTML response             | Headless compile result or immutable `/{locale}/slides/{slug}/` release |
| Standalone service keys              | Site-scoped ContentKit grants including `deck:render`                   |

Use ContentKit's migration CLI for existing Markdown:

```bash
npm run migrate:slidekit -- ../slidekit/examples/demo.md \
  --out examples/decks/demo.en.md --locale en --theme neutral
```

## Production retirement proof

- ContentKit `v1.18.0` passed unit, contract, PostgreSQL integration, binary E2E,
  real Slidev rendering, visual SVG/PNG matrix and dependency-audit gates.
- Production passed semantic plan/validation, sync/async hash equivalence,
  named preview, Chromium navigation/presenter/offline checks, release/read API,
  telemetry, migration, webhook and rollback/reactivation checks.
- The standalone systemd unit is disabled and removed, port 4040 is closed, the
  deployment workflow and credentials are removed, and the old hostname returns
  `410 Gone` with ContentKit as its successor.
- Former production files were moved to the recoverable root-only archive
  `/var/backups/retired-slidekit/20260720T104000Z` rather than deleted.

Historical issues and releases remain useful for provenance. New issues,
features and security fixes belong in ContentKit.
