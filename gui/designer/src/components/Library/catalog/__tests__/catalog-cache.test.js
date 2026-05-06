/**
 * Sprint M-B.2 K2 — catalog-cache fetch + dedupe unit tests.
 *
 * Verifies MAX_CATALOG_LENGTH cull and that fetchCategory hits the network
 * once per slug (cached for the rest of the session).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchIndex, fetchCategory, prefetchAllCategories, MAX_CATALOG_LENGTH,
  __resetCachesForTest,
} from '../catalog-cache';

beforeEach(() => {
  __resetCachesForTest();
  vi.restoreAllMocks();
});

const MOCK_INDEX = {
  total: 10,
  categories: [
    { slug: 'demo_a', name: 'Demo A', count: 2 },
    { slug: 'demo_b', name: 'Demo B', count: 3 },
  ],
};

describe('M-B.2 K2 — catalog-cache', () => {
  it('1) MAX_CATALOG_LENGTH culls oversize plasmids from a category', async () => {
    expect(MAX_CATALOG_LENGTH).toBe(20000);
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        plasmids: [
          { name: 'small', length: 1500 },
          { name: 'medium', length: 12000 },
          { name: 'huge', length: 30000 },
        ],
      }),
    });

    const cat = await fetchCategory('demo_a');
    expect(cat.plasmids.map(p => p.name)).toEqual(['small', 'medium']);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('2) fetchCategory caches per slug — two calls = one network hit', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ plasmids: [{ name: 'x', length: 1000 }] }),
    });

    await fetchCategory('demo_b');
    await fetchCategory('demo_b');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('3) prefetchAllCategories merges every category into a flat cache once', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (url) => ({
      ok: true,
      json: async () => {
        if (url.includes('demo_a')) return { plasmids: [{ name: 'a1', length: 1000 }] };
        if (url.includes('demo_b')) return { plasmids: [{ name: 'b1', length: 2000 }, { name: 'b2', length: 3000 }] };
        return { plasmids: [] };
      },
    }));

    const flat = await prefetchAllCategories(MOCK_INDEX);
    expect(flat.items.map(i => i.name).sort()).toEqual(['a1', 'b1', 'b2']);
    expect(flat.items[0]._badge).toBeTruthy();
    expect(flat.items[0]._slug).toBeTruthy();

    // Second call returns the cached flat — no extra network.
    fetchMock.mockClear();
    const flat2 = await prefetchAllCategories(MOCK_INDEX);
    expect(flat2).toBe(flat);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('4) fetchIndex caches the static index JSON', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => MOCK_INDEX,
    });

    const a = await fetchIndex();
    const b = await fetchIndex();
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
