// API-key authentication. Enforced only when keys are configured. Keys are
// compared by SHA-256 digest with timingSafeEqual (constant time, equal length).
import { createHash, timingSafeEqual } from 'node:crypto'

const digest = (s) => createHash('sha256').update(String(s)).digest()

// Extract a key from headers: "Authorization: Bearer <key>" preferred, else
// "X-API-Key: <key>".
export function extractApiKey(headers) {
  const auth = headers['authorization']
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim()
  const x = headers['x-api-key']
  return x ? String(x).trim() : ''
}

export function createAuthChecker(keys) {
  const enabled = Array.isArray(keys) && keys.length > 0
  const digests = enabled ? keys.map(digest) : []
  return {
    enabled,
    // true when auth is disabled or the key matches one configured key.
    check(key) {
      if (!enabled) return true
      if (!key) return false
      const d = digest(key)
      return digests.some((k) => timingSafeEqual(k, d))
    },
  }
}

// Short, non-reversible fingerprint for logging (never log the raw key).
export function fingerprint(key) {
  if (!key) return null
  return digest(key).toString('hex').slice(0, 8)
}
