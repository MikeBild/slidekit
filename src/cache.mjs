// In-memory response cache with bounded size (LRU) and optional TTL. No deps.
// `max <= 0` disables it entirely. Used to serve identical renders (same
// prepared Markdown + theme) without re-running a Slidev build.
export function createCache({ max = 50, ttlMs = 0, now = () => Date.now() } = {}) {
  const enabled = max > 0
  const map = new Map() // key -> { value, exp }

  // Periodically drop expired entries so a low-traffic key can't pin memory.
  let sweep
  if (enabled && ttlMs > 0) {
    sweep = setInterval(
      () => {
        const t = now()
        for (const [k, e] of map) if (e.exp && e.exp <= t) map.delete(k)
      },
      Math.max(ttlMs, 1000),
    )
    if (sweep && sweep.unref) sweep.unref()
  }

  return {
    enabled,
    get(key) {
      if (!enabled) return undefined
      const e = map.get(key)
      if (!e) return undefined
      if (e.exp && e.exp <= now()) {
        map.delete(key)
        return undefined
      }
      // Bump recency: re-insert so it becomes the newest entry.
      map.delete(key)
      map.set(key, e)
      return e.value
    },
    put(key, value) {
      if (!enabled) return
      if (map.has(key)) map.delete(key)
      map.set(key, { value, exp: ttlMs > 0 ? now() + ttlMs : 0 })
      // Evict the oldest (first) entries until within bounds.
      while (map.size > max) map.delete(map.keys().next().value)
    },
    get size() {
      return map.size
    },
    stop() {
      if (sweep) clearInterval(sweep)
    },
  }
}
