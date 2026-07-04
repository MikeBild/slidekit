# Contributing to slidekit

Thanks for your interest in improving slidekit!

## Getting started

```bash
npm install
npm run serve     # run the service
npm test          # fast unit tests
npm run lint      # ESLint
npm run format    # Prettier
npm run dev       # preview examples/demo.md with Slidev
```

Requires Node.js >= 20.12.

## Development guidelines

- **Keep it dependency-light.** The server code imports only Node built-ins
  (`node:http`, `node:test`, built-in `.env` loading); rendering is delegated to
  the bundled Slidev toolchain (the only runtime dependency). Please don't add
  new dependencies without a strong reason.
- **Source lives in `src/`** as small, single-purpose ESM modules. Pure helpers
  (no I/O) belong in `html-postprocess.mjs` and are unit-tested.
- **Everything in English** — code, comments, docs, UI strings.
- **Add tests** for new logic (`test/unit/*.test.mjs`). Keep `npm test` fast and
  free of Slidev/Vite; end-to-end checks go in `test/integration` behind
  `RUN_INTEGRATION=1`.
- **Don't break the single-file guarantee.** Rendered output must stay fully
  self-contained (no external requests). The integration test enforces this.
- **Mind security.** `/render` executes code — see [SECURITY.md](./SECURITY.md).
  Don't weaken auth, rate limiting, or the build caps.

## Pull requests

1. Fork and branch from the default branch.
2. Make your change with tests and updated docs.
3. Run `npm test` (and `npm run test:integration` for build-path changes).
4. Open a PR describing the motivation and the change. Keep PRs focused.

By contributing you agree your contributions are licensed under the
[MIT License](./LICENSE).

## Releasing

Releases are cut by pushing a version tag:

```bash
# 1. move the [Unreleased] notes in CHANGELOG.md into a new version section
# 2. bump package.json and create the tag:
npm version 1.2.3
git push --follow-tags
```

The `release` workflow then builds the self-contained binary **natively on each
platform** (macOS arm64, Linux x64/arm64), generates `SHA256SUMS`, and publishes a
GitHub Release with the binaries attached.
