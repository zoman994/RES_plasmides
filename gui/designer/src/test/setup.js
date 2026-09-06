import { afterEach, beforeEach, vi } from 'vitest'

import { createCommonFeaturesFetch } from './common-features-fetch.js'
import './vitest-process-probe.js'

const happyDomFetch = globalThis.fetch.bind(globalThis)

function installTestFetch() {
  // Direct assignment keeps this harness outside Vitest's local stub registry.
  // A test can stub fetch and then call unstubAllGlobals() without exposing the
  // real happy-dom network implementation to effects still finishing cleanup.
  globalThis.fetch = vi.fn(createCommonFeaturesFetch(happyDomFetch))
}

beforeEach(installTestFetch)
afterEach(installTestFetch)
