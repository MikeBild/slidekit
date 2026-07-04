#!/usr/bin/env node
// Entry point. Real implementation lives in src/. Kept at the repo root so the
// binary launcher (bin/slidekit.ts) and build-binary.sh can spawn `node server.mjs`,
// and so `npx slidekit` / a global install can start the service.
import { start } from './src/server.mjs'

start()
