import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createBuildStats, resolveStatsWindow } from '../../src/stats.mjs'

test('durably aggregates product statistics by UTC hour', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'slidekit-stats-'))
  const statePath = join(dir, 'stats.json')
  let now = Date.parse('2026-07-18T05:15:00Z')
  const stats = createBuildStats({ statePath, serviceVersion: '1.3.0', now: () => now })
  stats.recordRender('sync')
  stats.recordCache('miss')
  stats.recordBuild({ result: 'success', durationSeconds: 2.5, outputBytes: 2048 })
  stats.recordJob('queued')
  await stats.flush()

  const persisted = JSON.parse(await readFile(statePath, 'utf8'))
  assert.equal(persisted.schema_version, 1)
  const restored = createBuildStats({ statePath, serviceVersion: '1.3.0', now: () => now })
  const result = restored.query({
    from: Date.parse('2026-07-18T05:00:00Z'),
    to: Date.parse('2026-07-18T06:00:00Z'),
  })
  assert.equal(result.rows[0].builds.success, 1)
  assert.equal(result.rows[0].builds.duration_seconds_sum, 2.5)
  assert.equal(result.rows[0].builds.output_bytes_sum, 2048)
  assert.equal(result.rows[0].cache.miss, 1)
  assert.equal(result.quality.partial, true)
  assert.deepEqual(result.quality.reasons, [
    'window_precedes_retained_state',
    'window_includes_open_hour',
  ])
})

test('stats windows default to the previous 24 closed hours and reject invalid ranges', () => {
  const now = Date.parse('2026-07-18T05:15:00Z')
  const defaults = resolveStatsWindow(new URLSearchParams(), now)
  assert.equal(new Date(defaults.to).toISOString(), '2026-07-18T05:00:00.000Z')
  assert.equal((defaults.to - defaults.from) / 3_600_000, 24)
  assert.throws(
    () =>
      resolveStatsWindow(
        new URLSearchParams({ from: '2026-07-18T05:30:00Z', to: '2026-07-18T06:00:00Z' }),
        now,
      ),
    /full UTC hour/,
  )
})

test('malformed state is recovered and marked partial without leaking its content', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'slidekit-stats-'))
  const statePath = join(dir, 'stats.json')
  await import('node:fs/promises').then(({ writeFile }) => writeFile(statePath, '{secret'))
  const now = Date.parse('2026-07-18T07:15:00Z')
  const stats = createBuildStats({ statePath, serviceVersion: '1.3.0', now: () => now })
  const result = stats.query({ from: now - 3_600_000, to: now - 3_600_000 + 3_600_000 })
  assert.equal(result.quality.partial, true)
  assert.ok(result.quality.reasons.includes('state_recovered_after_corruption'))
  assert.doesNotMatch(JSON.stringify(result), /secret/)
})
