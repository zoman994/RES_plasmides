import { randomBytes } from 'node:crypto'
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'

function comparablePath(value) {
  const pathValue = String(value)
  const resolved = isAbsolute(pathValue) ? normalize(pathValue) : pathValue
  const portable = resolved.replaceAll('\\', '/')
  return process.platform === 'win32' ? portable.toLowerCase() : portable
}

export function makeInventoryEntry(project, moduleId) {
  const normalizedModuleId = comparablePath(moduleId)
  const normalizedProject = String(project ?? '')
  return {
    project: normalizedProject,
    moduleId: normalizedModuleId,
    key: `${normalizedProject}\0${normalizedModuleId}`,
  }
}

function valueCounts(values) {
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return counts
}

export function compareInventory(expected, actual) {
  const expectedCounts = valueCounts(expected)
  const actualCounts = valueCounts(actual)
  const missing = []
  const unexpected = []
  const expectedDuplicates = []
  const actualDuplicates = []

  for (const [value, count] of expectedCounts) {
    if (!actualCounts.has(value)) missing.push(value)
    if (count > 1) expectedDuplicates.push({ value, count })
  }
  for (const [value, count] of actualCounts) {
    if (!expectedCounts.has(value)) unexpected.push(value)
    if (count > 1) actualDuplicates.push({ value, count })
  }

  missing.sort()
  unexpected.sort()
  expectedDuplicates.sort((a, b) => a.value.localeCompare(b.value))
  actualDuplicates.sort((a, b) => a.value.localeCompare(b.value))

  return {
    exact:
      expected.length > 0
      && expected.length === actual.length
      && missing.length === 0
      && unexpected.length === 0
      && expectedDuplicates.length === 0
      && actualDuplicates.length === 0,
    expectedCount: expected.length,
    actualCount: actual.length,
    missing,
    unexpected,
    expectedDuplicates,
    actualDuplicates,
  }
}

export function summarizeRssSamples(samples, expectedModuleIds, endedModuleStates) {
  const isModuleId = (value) => typeof value === 'string' && value.length > 0
  const normalizedExpectedModuleIds = expectedModuleIds
    .filter(isModuleId)
    .map(comparablePath)
  const normalizedModuleStates = endedModuleStates
    .filter((entry) => isModuleId(entry?.moduleId) && typeof entry?.state === 'string')
    .map((entry) => ({ moduleId: comparablePath(entry.moduleId), state: entry.state }))
  const validSamples = samples.filter((sample) => (
    Number.isFinite(sample?.rss)
    && sample.rss > 0
    && typeof sample.probeFile === 'string'
    && sample.probeFile.length > 0
    && isModuleId(sample.moduleId)
    && (sample.phase === 'setup' || sample.phase === 'afterAll')
  )).map((sample) => ({ ...sample, moduleId: comparablePath(sample.moduleId) }))
  const expectedCounts = valueCounts(normalizedExpectedModuleIds)
  const statesByModule = new Map()
  const samplesByModule = new Map()

  for (const entry of normalizedModuleStates) {
    const states = statesByModule.get(entry.moduleId) ?? []
    states.push(entry.state)
    statesByModule.set(entry.moduleId, states)
  }
  for (const sample of validSamples) {
    const moduleSamples = samplesByModule.get(sample.moduleId) ?? []
    moduleSamples.push(sample)
    samplesByModule.set(sample.moduleId, moduleSamples)
  }

  const sequenceErrors = []
  for (const [moduleId, count] of expectedCounts) {
    if (count !== 1) sequenceErrors.push(`${moduleId}: ambiguous expected module (${count})`)
  }
  for (const moduleId of statesByModule.keys()) {
    if (!expectedCounts.has(moduleId)) sequenceErrors.push(`${moduleId}: unexpected ended state`)
  }
  for (const moduleId of samplesByModule.keys()) {
    if (!expectedCounts.has(moduleId)) sequenceErrors.push(`${moduleId}: unexpected RSS sample`)
  }

  let completedPairCount = 0
  const skippedSetupOnlyModules = []
  for (const moduleId of normalizedExpectedModuleIds) {
    if (expectedCounts.get(moduleId) !== 1) continue

    const states = statesByModule.get(moduleId) ?? []
    const moduleSamples = samplesByModule.get(moduleId) ?? []
    const phases = moduleSamples.map((sample) => sample.phase)
    const probeFiles = new Set(moduleSamples.map((sample) => sample.probeFile))

    if (states.length !== 1) {
      sequenceErrors.push(`${moduleId}: expected one ended state; got ${states.length}`)
      continue
    }
    if (probeFiles.size > 1) {
      sequenceErrors.push(`${moduleId}: RSS samples span ${probeFiles.size} probe files`)
      continue
    }

    const [state] = states
    const hasPair = phases.length === 2
      && phases[0] === 'setup'
      && phases[1] === 'afterAll'
    const isSkippedSetupOnly = state === 'skipped'
      && phases.length === 1
      && phases[0] === 'setup'

    if (hasPair && (state === 'passed' || state === 'skipped')) {
      completedPairCount += 1
    } else if (isSkippedSetupOnly) {
      skippedSetupOnlyModules.push(moduleId)
    } else if (state !== 'passed' && state !== 'skipped') {
      sequenceErrors.push(`${moduleId}: unsupported ended state ${JSON.stringify(state)}`)
    } else {
      const locations = moduleSamples.map((sample) => (
        `${sample.probeFile}:${sample.probeLine ?? '?'}`
      ))
      sequenceErrors.push(
        `${moduleId}: state ${state} expected ${state === 'skipped' ? 'setup or setup,afterAll' : 'setup,afterAll'}; got ${phases.join(',') || 'none'} (${locations.join(',') || 'no probe'})`,
      )
    }
  }

  const setupSampleCount = validSamples.filter((sample) => sample.phase === 'setup').length
  const afterAllSampleCount = validSamples.filter((sample) => sample.phase === 'afterAll').length
  const expectedModuleCount = expectedModuleIds.length
  const expectedCountIsValid = expectedModuleCount > 0
    && normalizedExpectedModuleIds.length === expectedModuleCount
  return {
    scope: 'worker point samples; not process-tree total or guaranteed peak',
    expectedModuleCount,
    sampleCount: samples.length,
    validSampleCount: validSamples.length,
    invalidSampleCount: samples.length - validSamples.length,
    setupSampleCount,
    afterAllSampleCount,
    completedPairCount,
    skippedSetupOnlyCount: skippedSetupOnlyModules.length,
    skippedSetupOnlyModules: skippedSetupOnlyModules.sort(),
    sampledModuleCount: samplesByModule.size,
    probeFileCount: new Set(validSamples.map((sample) => sample.probeFile)).size,
    sequenceErrors,
    observedMaxRssBytes: validSamples.length
      ? Math.max(...validSamples.map((sample) => sample.rss))
      : null,
    complete:
      expectedCountIsValid
      && normalizedModuleStates.length === endedModuleStates.length
      && validSamples.length === samples.length
      && setupSampleCount === expectedModuleCount
      && sequenceErrors.length === 0,
  }
}

export function assessGateEvidence({
  rawExitCode,
  runEndReason,
  unhandledErrorCount = 0,
  jsonSuccess,
  expected,
  ended,
  runEndModules = ended,
  expectedJsonModules = [],
  jsonModules,
  expectedModuleIds = expectedJsonModules,
  endedModuleStates = [],
  rssSamples,
  artifactErrors = [],
}) {
  const inventory = compareInventory(expected, ended)
  const runEndInventory = compareInventory(expected, runEndModules)
  const jsonInventory = compareInventory(expectedJsonModules, jsonModules)
  const rss = summarizeRssSamples(rssSamples, expectedModuleIds, endedModuleStates)
  const failures = [...artifactErrors]

  if (rawExitCode !== 0) failures.push(`Vitest exit was ${String(rawExitCode)}`)
  if (runEndReason !== 'passed') failures.push(`Vitest reason was ${String(runEndReason)}`)
  if (unhandledErrorCount !== 0) {
    failures.push(`Vitest reported ${String(unhandledErrorCount)} unhandled error(s)`)
  }
  if (jsonSuccess !== true) failures.push('Vitest JSON success was not true')
  if (!inventory.exact || !runEndInventory.exact || !jsonInventory.exact) {
    failures.push('inventory mismatch')
  }
  if (!rss.complete) failures.push('worker RSS evidence missing or invalid')

  return {
    passed: failures.length === 0,
    failures,
    inventory,
    runEndInventory,
    jsonInventory,
    rss,
  }
}

function readJson(path, label, artifactErrors) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    artifactErrors.push(`${label}: ${error.message}`)
    return null
  }
}

function readNdjson(path, label, artifactErrors) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    artifactErrors.push(`${label}: ${error.message}`)
    return []
  }

  const records = []
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line) continue
    try {
      records.push(JSON.parse(line))
    } catch (error) {
      artifactErrors.push(`${label} line ${index + 1}: ${error.message}`)
    }
  }
  return records
}

function readRssSamples(artifactDirectory, artifactErrors) {
  const rssDirectory = join(artifactDirectory, 'rss')
  let files
  try {
    files = readdirSync(rssDirectory).filter((name) => name.endsWith('.ndjson')).sort()
  } catch (error) {
    artifactErrors.push(`worker RSS directory: ${error.message}`)
    return []
  }

  return files.flatMap((name) => (
    readNdjson(join(rssDirectory, name), `worker RSS ${name}`, artifactErrors)
      .map((sample, index) => ({ ...sample, probeFile: name, probeLine: index + 1 }))
  ))
}

function captureVitest(command, args, options, stdoutPath, stderrPath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const stdoutFile = openSync(stdoutPath, 'w')
    const stderrFile = openSync(stderrPath, 'w')
    let closed = false
    const closeFiles = () => {
      if (closed) return
      closed = true
      closeSync(stdoutFile)
      closeSync(stderrFile)
    }

    const child = spawn(command, args, {
      ...options,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (chunk) => {
      writeSync(stdoutFile, chunk)
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      writeSync(stderrFile, chunk)
      process.stderr.write(chunk)
    })
    child.once('error', (error) => {
      closeFiles()
      rejectPromise(error)
    })
    child.once('close', (code, signal) => {
      closeFiles()
      resolvePromise({ code, signal, pid: child.pid })
    })
  })
}

function uniqueRunId() {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${randomBytes(4).toString('hex')}`
}

export function assertSupportedArguments(args) {
  const forbidden = args.find((arg) => (
    arg === '-w'
    || arg.startsWith('-w=')
    || arg === '--watch'
    || arg.startsWith('--watch=')
    || arg.startsWith('--reporter')
    || arg.startsWith('--outputFile')
  ))
  if (forbidden) {
    throw new Error(`test:gate owns ${forbidden}; pass only test filters and execution flags`)
  }
}

function hasMaxWorkers(args) {
  return args.some((arg) => arg === '--maxWorkers' || arg.startsWith('--maxWorkers='))
}

async function runGate() {
  const designerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const repositoryRoot = resolve(designerRoot, '..', '..')
  const artifactDirectory = join(repositoryRoot, 'tmp', 'vitest-gate', uniqueRunId())
  mkdirSync(artifactDirectory, { recursive: true })

  const userArguments = process.argv.slice(2)
  assertSupportedArguments(userArguments)
  const executionArguments = hasMaxWorkers(userArguments)
    ? userArguments
    : [...userArguments, '--maxWorkers=4']
  const executionMode = executionArguments.includes('--no-file-parallelism')
    ? 'serial-files'
    : 'parallel-files'
  const vitestCli = join(designerRoot, 'node_modules', 'vitest', 'vitest.mjs')
  const reporter = join(designerRoot, 'scripts', 'vitest-inventory-reporter.mjs')
  const jsonPath = join(artifactDirectory, 'vitest.json')
  const stdoutPath = join(artifactDirectory, 'stdout.log')
  const stderrPath = join(artifactDirectory, 'stderr.log')
  const commandArguments = [
    vitestCli,
    'run',
    ...executionArguments,
    '--reporter=default',
    `--reporter=${reporter}`,
    '--reporter=json',
    `--outputFile.json=${jsonPath}`,
  ]
  const startedAt = new Date().toISOString()
  writeFileSync(join(artifactDirectory, 'command.json'), `${JSON.stringify({
    startedAt,
    command: process.execPath,
    arguments: commandArguments,
    cwd: designerRoot,
    artifactDirectory,
  }, null, 2)}\n`)

  const child = await captureVitest(
    process.execPath,
    commandArguments,
    {
      cwd: designerRoot,
      env: {
        ...process.env,
        BODGE_VITEST_GATE_DIR: artifactDirectory,
      },
    },
    stdoutPath,
    stderrPath,
  )

  const artifactErrors = []
  const expectedDocument = readJson(
    join(artifactDirectory, 'expected-inventory.json'),
    'expected inventory',
    artifactErrors,
  )
  const lifecycle = readNdjson(
    join(artifactDirectory, 'lifecycle.ndjson'),
    'lifecycle',
    artifactErrors,
  )
  const runEndDocument = readJson(
    join(artifactDirectory, 'run-end.json'),
    'run end',
    artifactErrors,
  )
  const jsonDocument = readJson(jsonPath, 'Vitest JSON', artifactErrors)
  const rssSamples = readRssSamples(artifactDirectory, artifactErrors)
  const expectedEntries = expectedDocument?.modules ?? []
  const endedEvents = lifecycle.filter((event) => event.event === 'ended')
  const endedEntries = endedEvents.map((event) => event.module)
  const runEndEntries = runEndDocument?.modules ?? []
  const jsonModules = (jsonDocument?.testResults ?? []).map((result) => comparablePath(result.name))
  const evidence = assessGateEvidence({
    rawExitCode: child.code,
    runEndReason: runEndDocument?.reason,
    unhandledErrorCount: runEndDocument?.unhandledErrorCount,
    jsonSuccess: jsonDocument?.success,
    expected: expectedEntries.map((entry) => entry.key),
    ended: endedEntries.map((entry) => entry.key),
    runEndModules: runEndEntries.map((entry) => entry.key),
    expectedJsonModules: expectedEntries.map((entry) => entry.moduleId),
    jsonModules,
    expectedModuleIds: expectedEntries.map((entry) => entry.moduleId),
    endedModuleStates: endedEvents.map((event) => ({
      moduleId: event.module?.moduleId,
      state: event.state,
    })),
    rssSamples,
    artifactErrors,
  })
  const summary = {
    ...evidence,
    startedAt,
    finishedAt: new Date().toISOString(),
    executionMode,
    child,
    vitest: jsonDocument
      ? {
          success: jsonDocument.success,
          testFiles: jsonDocument.testResults?.length ?? 0,
          totalTests: jsonDocument.numTotalTests,
          passedTests: jsonDocument.numPassedTests,
          failedTests: jsonDocument.numFailedTests,
          pendingTests: jsonDocument.numPendingTests,
        }
      : null,
    artifacts: {
      directory: artifactDirectory,
      stdout: stdoutPath,
      stderr: stderrPath,
    },
  }
  writeFileSync(join(artifactDirectory, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)

  const verdict = evidence.passed ? 'PASS' : 'FAIL'
  process.stdout.write(
    `\nBodgeGene Vitest gate: ${verdict}; expected ${evidence.inventory.expectedCount}, ended ${evidence.inventory.actualCount}; artifacts ${artifactDirectory}\n`,
  )
  if (!evidence.passed) {
    process.stderr.write(`Gate failures: ${evidence.failures.join('; ')}\n`)
    process.exitCode = 1
  }
}

const isMain = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false

if (isMain) {
  runGate().catch((error) => {
    process.stderr.write(`Vitest gate crashed: ${error.stack ?? error.message}\n`)
    process.exitCode = 1
  })
}

export { comparablePath }
