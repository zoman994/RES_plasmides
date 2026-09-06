import { appendFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { makeInventoryEntry } from './vitest-gate.mjs'

function atomicJson(path, value) {
  const temporaryPath = `${path}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temporaryPath, path)
}

function moduleEntry(testModule) {
  return makeInventoryEntry(testModule.project?.name, testModule.moduleId)
}

export default class BodgeGeneInventoryReporter {
  constructor() {
    this.artifactDirectory = process.env.BODGE_VITEST_GATE_DIR
    this.lifecyclePath = this.artifactDirectory
      ? join(this.artifactDirectory, 'lifecycle.ndjson')
      : null
  }

  ensureArtifactDirectory() {
    if (!this.artifactDirectory) {
      throw new Error('BODGE_VITEST_GATE_DIR is required by the inventory reporter')
    }
    mkdirSync(this.artifactDirectory, { recursive: true })
  }

  record(event, testModule) {
    this.ensureArtifactDirectory()
    const record = {
      timestamp: new Date().toISOString(),
      event,
      module: moduleEntry(testModule),
      state: typeof testModule.state === 'function' ? testModule.state() : null,
      diagnostic: typeof testModule.diagnostic === 'function' ? testModule.diagnostic() : null,
    }
    appendFileSync(this.lifecyclePath, `${JSON.stringify(record)}\n`, 'utf8')
  }

  onTestRunStart(specifications) {
    this.ensureArtifactDirectory()
    const modules = specifications.map((specification) => (
      makeInventoryEntry(specification.project?.name, specification.moduleId)
    ))
    atomicJson(join(this.artifactDirectory, 'expected-inventory.json'), {
      capturedAt: new Date().toISOString(),
      modules,
    })
    appendFileSync(this.lifecyclePath, `${JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'run-started',
      expectedCount: modules.length,
    })}\n`, 'utf8')
  }

  onTestModuleQueued(testModule) {
    this.record('queued', testModule)
  }

  onTestModuleCollected(testModule) {
    this.record('collected', testModule)
  }

  onTestModuleStart(testModule) {
    this.record('started', testModule)
  }

  onTestModuleEnd(testModule) {
    this.record('ended', testModule)
  }

  onTestRunEnd(testModules, unhandledErrors, reason) {
    this.ensureArtifactDirectory()
    atomicJson(join(this.artifactDirectory, 'run-end.json'), {
      capturedAt: new Date().toISOString(),
      reason,
      unhandledErrorCount: unhandledErrors.length,
      modules: testModules.map(moduleEntry),
    })
  }
}
