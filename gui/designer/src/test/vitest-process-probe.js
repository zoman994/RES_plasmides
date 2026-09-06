import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

import { afterAll, expect } from 'vitest'

const artifactDirectory = process.env.BODGE_VITEST_GATE_DIR
const workerId = String(process.env.VITEST_WORKER_ID ?? 'unknown').replace(/[^a-zA-Z0-9_.-]/g, '_')
const moduleId = expect.getState().testPath

function recordWorkerMemory(phase) {
  if (!artifactDirectory) return

  const rssDirectory = join(artifactDirectory, 'rss')
  mkdirSync(rssDirectory, { recursive: true })
  const memory = process.memoryUsage()
  const record = {
    timestamp: new Date().toISOString(),
    phase,
    pid: process.pid,
    ppid: process.ppid,
    workerId,
    moduleId,
    rss: memory.rss,
    heapTotal: memory.heapTotal,
    heapUsed: memory.heapUsed,
    external: memory.external,
    arrayBuffers: memory.arrayBuffers,
  }
  appendFileSync(
    join(rssDirectory, `worker-${process.pid}-${workerId}.ndjson`),
    `${JSON.stringify(record)}\n`,
    'utf8',
  )
}

recordWorkerMemory('setup')

afterAll(() => {
  recordWorkerMemory('afterAll')
})
