// Centralized 12-factor configuration: env vars (+ optional .env) parsed once,
// validated (fail fast on bad input), and frozen. No dependencies.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

let VERSION = '0.0.0'
try {
  VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version || VERSION
} catch {
  /* keep fallback */
}

// Load a .env file if present. Node >= 20.12 ships process.loadEnvFile, which
// throws when the file is missing — that's fine, env vars remain the source.
try {
  process.loadEnvFile(join(process.cwd(), '.env'))
} catch {
  /* no .env — env vars only */
}

function num(name, def) {
  const v = process.env[name]
  if (v == null || v === '') return def
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`Invalid number for ${name}: "${v}"`)
  return n
}
function bool(name, def) {
  const v = process.env[name]
  if (v == null || v === '') return def
  return v === '1' || v.toLowerCase() === 'true'
}
function str(name, def) {
  const v = process.env[name]
  return v == null || v === '' ? def : v
}
function list(name) {
  const v = process.env[name]
  if (!v) return []
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function loadConfig() {
  return Object.freeze({
    version: VERSION,
    // paths
    root: ROOT,
    slidevCli: join(ROOT, 'node_modules', '@slidev', 'cli', 'bin', 'slidev.mjs'),
    styleCss: join(ROOT, 'style.css'),
    themesDir: str('SLIDEKIT_THEMES_DIR', join(ROOT, 'themes')),
    docsDir: join(ROOT, 'docs'),
    workDir: str('SLIDEKIT_WORK_DIR', join(tmpdir(), 'slidekit')),
    defaultTheme: str('SLIDEKIT_DEFAULT_THEME', 'neutral'),
    // Slidev base theme (an installed npm theme). The uploaded deck's own
    // `theme:` is normalized to this so an unknown theme can't break the build;
    // the visual look is the CSS overlay chosen via ?theme=.
    baseTheme: str('SLIDEKIT_BASE_THEME', 'seriph'),

    // binding
    port: num('PORT', 4030),
    host: str('HOST', '0.0.0.0'),

    // logging
    logLevel: str('LOG_LEVEL', 'info'),
    logFormat: str('LOG_FORMAT', 'json'),

    // auth
    apiKeys: list('SLIDEKIT_API_KEYS'),
    requireAuthAll: bool('SLIDEKIT_REQUIRE_AUTH_ALL', false),
    trustProxy: bool('SLIDEKIT_TRUST_PROXY', false),

    // rate limiting
    rateLimitMax: num('SLIDEKIT_RATE_LIMIT_MAX', 30),
    rateLimitWindowMs: num('SLIDEKIT_RATE_LIMIT_WINDOW_MS', 60000),

    // build hardening
    maxBodyBytes: num('SLIDEKIT_MAX_BODY_BYTES', 1048576),
    buildTimeoutMs: num('SLIDEKIT_BUILD_TIMEOUT_MS', 120000),
    buildConcurrency: num('SLIDEKIT_BUILD_CONCURRENCY', 1),
    buildQueueMax: num('SLIDEKIT_BUILD_QUEUE_MAX', 20),
    queueTimeoutMs: num('SLIDEKIT_QUEUE_TIMEOUT_MS', 30000),
    janitorIntervalMs: num('SLIDEKIT_JANITOR_INTERVAL_MS', 0),

    // http timeouts (slow-loris / hung upload protection)
    requestTimeoutMs: num('SLIDEKIT_REQUEST_TIMEOUT_MS', 130000),
    headersTimeoutMs: num('SLIDEKIT_HEADERS_TIMEOUT_MS', 15000),

    // response cache (identical renders served from memory)
    cacheMax: num('SLIDEKIT_CACHE_MAX', 50),
    cacheTtlMs: num('SLIDEKIT_CACHE_TTL_MS', 0),

    // async jobs + webhook callback
    jobsMax: num('SLIDEKIT_JOBS_MAX', 100),
    jobTtlMs: num('SLIDEKIT_JOB_TTL_MS', 600000),
    webhookAllow: list('SLIDEKIT_WEBHOOK_ALLOW'),

    // response polish
    compression: bool('SLIDEKIT_COMPRESSION', true),
    corsOrigin: str('SLIDEKIT_CORS_ORIGIN', ''),

    // lifecycle
    shutdownGraceMs: num('SLIDEKIT_SHUTDOWN_GRACE_MS', 10000),
  })
}
