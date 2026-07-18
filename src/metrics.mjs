// Tiny in-memory Prometheus-style metrics. No dependencies.
const BUILD_BUCKETS = [0.5, 1, 2.5, 5, 10, 30, 60, 120]

function escapeLabel(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')
}

export function createMetrics() {
  const requests = new Map()
  const buildResults = { success: 0, error: 0 }
  const buildDurationBuckets = BUILD_BUCKETS.map(() => 0)
  let buildDurationCount = 0
  let buildDurationSum = 0
  const jobTransitions = { queued: 0, running: 0, done: 0, error: 0 }
  let cacheHits = 0
  let cacheMisses = 0

  return {
    requestDone(route, status) {
      const key = `${route}|${status}`
      const entry = requests.get(key) || { route, status: String(status), value: 0 }
      entry.value++
      requests.set(key, entry)
    },
    buildObserved(ms, result = 'success') {
      if (!(result in buildResults)) return
      buildResults[result]++
      const seconds = Math.max(0, ms) / 1000
      buildDurationCount++
      buildDurationSum += seconds
      for (let index = 0; index < BUILD_BUCKETS.length; index++) {
        if (seconds <= BUILD_BUCKETS[index]) buildDurationBuckets[index]++
      }
    },
    jobTransition(status) {
      if (status in jobTransitions) jobTransitions[status]++
    },
    cacheHit() {
      cacheHits++
    },
    cacheMiss() {
      cacheMisses++
    },
    render(inflight) {
      let out = ''
      out += '# HELP slidekit_requests_total Total HTTP requests by normalized route and status.\n'
      out += '# TYPE slidekit_requests_total counter\n'
      for (const { route, status, value } of requests.values()) {
        out += `slidekit_requests_total{route="${escapeLabel(route)}",status="${escapeLabel(status)}"} ${value}\n`
      }
      out += '# HELP slidekit_builds_total Total deck build attempts by result.\n'
      out += '# TYPE slidekit_builds_total counter\n'
      for (const [result, value] of Object.entries(buildResults)) {
        out += `slidekit_builds_total{result="${result}"} ${value}\n`
      }
      out += '# HELP slidekit_build_duration_seconds Deck build duration in seconds.\n'
      out += '# TYPE slidekit_build_duration_seconds histogram\n'
      for (let index = 0; index < BUILD_BUCKETS.length; index++) {
        out += `slidekit_build_duration_seconds_bucket{le="${BUILD_BUCKETS[index]}"} ${buildDurationBuckets[index]}\n`
      }
      out += `slidekit_build_duration_seconds_bucket{le="+Inf"} ${buildDurationCount}\n`
      out += `slidekit_build_duration_seconds_sum ${buildDurationSum}\n`
      out += `slidekit_build_duration_seconds_count ${buildDurationCount}\n`
      // Compatibility window for v1.2 consumers; remove after the next minor release.
      out +=
        '# HELP slidekit_build_duration_ms_sum Deprecated sum of build durations in milliseconds.\n'
      out += '# TYPE slidekit_build_duration_ms_sum counter\n'
      out += `slidekit_build_duration_ms_sum ${buildDurationSum * 1000}\n`
      out += '# HELP slidekit_builds_inflight Builds currently running.\n'
      out += '# TYPE slidekit_builds_inflight gauge\n'
      out += `slidekit_builds_inflight ${inflight}\n`
      out += '# HELP slidekit_cache_hits_total Render cache hits.\n'
      out += '# TYPE slidekit_cache_hits_total counter\n'
      out += `slidekit_cache_hits_total ${cacheHits}\n`
      out += '# HELP slidekit_cache_misses_total Render cache misses.\n'
      out += '# TYPE slidekit_cache_misses_total counter\n'
      out += `slidekit_cache_misses_total ${cacheMisses}\n`
      out += '# HELP slidekit_job_transitions_total Async job transitions by status.\n'
      out += '# TYPE slidekit_job_transitions_total counter\n'
      for (const [status, value] of Object.entries(jobTransitions)) {
        out += `slidekit_job_transitions_total{status="${status}"} ${value}\n`
      }
      return out
    },
  }
}
