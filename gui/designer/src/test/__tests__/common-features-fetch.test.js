import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  COMMON_FEATURES_URL,
  createCommonFeaturesFetch,
} from '../common-features-fetch.js'

describe('common-features test fetch contract', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lets production-shaped loading resolve the deterministic empty test database', async () => {
    const { loadFeatureDB } = await import('../../feature-detection.js')

    await expect(loadFeatureDB()).resolves.toEqual({
      version: 'test',
      features: [],
    })
    expect(globalThis.fetch).toHaveBeenCalledWith('/common-features.json')
  })

  it('intercepts only the exact common-features string and returns fresh data', async () => {
    const fallback = vi.fn()
    const testFetch = createCommonFeaturesFetch(fallback)

    const firstResponse = await testFetch(COMMON_FEATURES_URL)
    const firstDatabase = await firstResponse.json()
    firstDatabase.features.push({ id: 'mutation' })
    const secondDatabase = await (await testFetch(COMMON_FEATURES_URL)).json()

    expect(firstResponse).toMatchObject({ ok: true, status: 200 })
    expect(secondDatabase).toEqual({ version: 'test', features: [] })
    expect(fallback).not.toHaveBeenCalled()
  })

  it('delegates every non-matching input with the original argument list', async () => {
    const sentinel = { ok: false, status: 418 }
    const fallback = vi.fn().mockResolvedValue(sentinel)
    const testFetch = createCommonFeaturesFetch(fallback)
    const request = new Request('http://localhost/common-features.json')
    const init = { method: 'POST', body: 'payload' }

    await expect(testFetch('/api/import', init)).resolves.toBe(sentinel)
    await expect(testFetch(request)).resolves.toBe(sentinel)

    expect(fallback).toHaveBeenNthCalledWith(1, '/api/import', init)
    expect(fallback).toHaveBeenNthCalledWith(2, request)
  })

  it('allows an explicit per-test fetch stub to override the setup default', async () => {
    const explicitFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    vi.stubGlobal('fetch', explicitFetch)

    await expect(globalThis.fetch(COMMON_FEATURES_URL)).resolves.toMatchObject({
      ok: false,
      status: 503,
    })
    expect(explicitFetch).toHaveBeenCalledOnce()
  })

  it('restores the setup fetch after a local stub is removed', () => {
    const setupFetch = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn())

    vi.unstubAllGlobals()

    expect(globalThis.fetch).toBe(setupFetch)
  })
})

describe('destructive fetch cleanup compatibility', () => {
  afterEach(() => {
    delete globalThis.fetch
  })

  it('may remove its local fetch without exposing happy-dom after cleanup', () => {
    expect(vi.isMockFunction(globalThis.fetch)).toBe(true)
  })

  afterAll(() => {
    expect(vi.isMockFunction(globalThis.fetch)).toBe(true)
  })
})
