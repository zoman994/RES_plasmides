import { describe, expect, it } from 'vitest'

import {
  assessGateEvidence,
  assertSupportedArguments,
  compareInventory,
  summarizeRssSamples,
} from '../vitest-gate.mjs'

function rssPairs(count = 1) {
  return Array.from({ length: count }, (_, index) => ([
    {
      probeFile: 'worker-1.ndjson',
      moduleId: `/module-${index}.test.js`,
      phase: 'setup',
      rss: 111 + index,
      heapUsed: 999,
    },
    {
      probeFile: 'worker-1.ndjson',
      moduleId: `/module-${index}.test.js`,
      phase: 'afterAll',
      rss: 222 + index,
      heapUsed: 1,
    },
  ])).flat()
}

function passingEvidence(overrides = {}) {
  return {
    rawExitCode: 0,
    runEndReason: 'passed',
    unhandledErrorCount: 0,
    jsonSuccess: true,
    expected: ['designer\0A'],
    ended: ['designer\0A'],
    runEndModules: ['designer\0A'],
    expectedJsonModules: ['A'],
    jsonModules: ['A'],
    expectedModuleIds: ['/module-0.test.js'],
    endedModuleStates: [{ moduleId: '/module-0.test.js', state: 'passed' }],
    rssSamples: rssPairs(),
    ...overrides,
  }
}

describe('Vitest gate evidence', () => {
  it('rejects a lost module even when the raw Vitest process exits zero', () => {
    const evidence = assessGateEvidence(passingEvidence({
      expected: ['designer\0A', 'designer\0B'],
      ended: ['designer\0A'],
      runEndModules: ['designer\0A'],
      expectedJsonModules: ['A', 'B'],
      jsonModules: ['A'],
      rssSamples: rssPairs(2),
    }))

    expect(evidence.passed).toBe(false)
    expect(evidence.inventory.missing).toEqual(['designer\0B'])
    expect(evidence.failures).toContain('inventory mismatch')
  })

  it('rejects duplicate module evidence instead of collapsing it into a set', () => {
    expect(compareInventory(['A', 'B'], ['A', 'A', 'B'])).toMatchObject({
      exact: false,
      actualDuplicates: [{ value: 'A', count: 2 }],
    })
  })

  it('labels worker RSS as point samples and never substitutes heap usage', () => {
    expect(summarizeRssSamples(
      rssPairs(),
      ['/module-0.test.js'],
      [{ moduleId: '/module-0.test.js', state: 'passed' }],
    )).toMatchObject({
      complete: true,
      sampleCount: 2,
      observedMaxRssBytes: 222,
      completedPairCount: 1,
      scope: 'worker point samples; not process-tree total or guaranteed peak',
    })
  })

  it('fails closed when RSS evidence is absent', () => {
    const evidence = assessGateEvidence(passingEvidence({
      rssSamples: [],
    }))

    expect(evidence.passed).toBe(false)
    expect(evidence.failures).toContain('worker RSS evidence missing or invalid')
  })

  it('fails closed when a passed module has setup RSS but no matching afterAll sample', () => {
    const evidence = assessGateEvidence(passingEvidence({
      rssSamples: [{
        probeFile: 'worker-1.ndjson',
        moduleId: '/module-0.test.js',
        phase: 'setup',
        rss: 222,
        heapUsed: 111,
      }],
    }))

    expect(evidence.passed).toBe(false)
    expect(evidence.rss).toMatchObject({
      complete: false,
      setupSampleCount: 1,
      afterAllSampleCount: 0,
      completedPairCount: 0,
    })
  })

  it('accepts setup-only RSS only when the same reporter module ended skipped', () => {
    const evidence = assessGateEvidence(passingEvidence({
      endedModuleStates: [{ moduleId: '/module-0.test.js', state: 'skipped' }],
      rssSamples: [{
        probeFile: 'worker-1.ndjson',
        moduleId: '/module-0.test.js',
        phase: 'setup',
        rss: 222,
        heapUsed: 111,
      }],
    }))

    expect(evidence.passed).toBe(true)
    expect(evidence.rss).toMatchObject({
      complete: true,
      setupSampleCount: 1,
      afterAllSampleCount: 0,
      skippedSetupOnlyModules: ['/module-0.test.js'],
    })
  })

  it('also accepts an exact RSS pair when a skipped module executes afterAll', () => {
    const summary = summarizeRssSamples(
      rssPairs(),
      ['/module-0.test.js'],
      [{ moduleId: '/module-0.test.js', state: 'skipped' }],
    )

    expect(summary).toMatchObject({
      complete: true,
      completedPairCount: 1,
      skippedSetupOnlyCount: 0,
    })
  })

  it.each([
    ['unknown sample module', {
      samples: rssPairs().map((sample) => ({ ...sample, moduleId: '/unknown.test.js' })),
      expected: ['/module-0.test.js'],
      states: [{ moduleId: '/module-0.test.js', state: 'passed' }],
      error: /unexpected RSS sample/,
    }],
    ['missing setup sample', {
      samples: [],
      expected: ['/module-0.test.js'],
      states: [{ moduleId: '/module-0.test.js', state: 'passed' }],
      error: /got none/,
    }],
    ['missing sample moduleId', {
      samples: rssPairs().map(({ probeFile, phase, rss, heapUsed }) => ({
        probeFile,
        phase,
        rss,
        heapUsed,
      })),
      expected: ['/module-0.test.js'],
      states: [{ moduleId: '/module-0.test.js', state: 'passed' }],
      error: /got none/,
    }],
    ['duplicate setup phase', {
      samples: [rssPairs()[0], rssPairs()[0], rssPairs()[1]],
      expected: ['/module-0.test.js'],
      states: [{ moduleId: '/module-0.test.js', state: 'passed' }],
      error: /got setup,setup,afterAll/,
    }],
    ['cross-process pair', {
      samples: [
        rssPairs()[0],
        { ...rssPairs()[1], probeFile: 'worker-2.ndjson' },
      ],
      expected: ['/module-0.test.js'],
      states: [{ moduleId: '/module-0.test.js', state: 'passed' }],
      error: /span 2 probe files/,
    }],
    ['unsupported ended state', {
      samples: rssPairs(),
      expected: ['/module-0.test.js'],
      states: [{ moduleId: '/module-0.test.js', state: 'failed' }],
      error: /unsupported ended state/,
    }],
    ['duplicate ended state', {
      samples: rssPairs(),
      expected: ['/module-0.test.js'],
      states: [
        { moduleId: '/module-0.test.js', state: 'passed' },
        { moduleId: '/module-0.test.js', state: 'passed' },
      ],
      error: /expected one ended state; got 2/,
    }],
    ['ambiguous module across projects', {
      samples: rssPairs(),
      expected: ['/module-0.test.js', '/module-0.test.js'],
      states: [{ moduleId: '/module-0.test.js', state: 'passed' }],
      error: /ambiguous expected module/,
    }],
  ])('rejects RSS evidence with %s', (_label, { samples, expected, states, error }) => {
    const summary = summarizeRssSamples(samples, expected, states)

    expect(summary.complete).toBe(false)
    expect(summary.sequenceErrors.some((message) => error.test(message))).toBe(true)
  })

  it('rejects unhandled Vitest errors even with complete passing inventories', () => {
    const evidence = assessGateEvidence(passingEvidence({
      unhandledErrorCount: 1,
    }))

    expect(evidence.passed).toBe(false)
    expect(evidence.failures).toContain('Vitest reported 1 unhandled error(s)')
  })

  it.each([
    ['extra ended module', { ended: ['designer\0A', 'designer\0B'] }],
    ['zero inventory', {
      expected: [],
      ended: [],
      runEndModules: [],
      expectedJsonModules: [],
      jsonModules: [],
      rssSamples: [],
    }],
    ['duplicate expected module', {
      expected: ['designer\0A', 'designer\0A'],
      ended: ['designer\0A', 'designer\0A'],
      runEndModules: ['designer\0A', 'designer\0A'],
      expectedJsonModules: ['A', 'A'],
      jsonModules: ['A', 'A'],
      rssSamples: rssPairs(2),
    }],
    ['run-end mismatch', { runEndModules: [] }],
    ['JSON mismatch', { jsonModules: [] }],
  ])('rejects %s', (_label, overrides) => {
    const evidence = assessGateEvidence(passingEvidence(overrides))

    expect(evidence.passed).toBe(false)
    expect(evidence.failures).toContain('inventory mismatch')
  })

  it.each(['--watch', '--watch=true', '-w', '-w=true'])(
    'rejects watch-mode alias %s',
    (argument) => {
      expect(() => assertSupportedArguments([argument])).toThrow(/owns/)
    },
  )
})
