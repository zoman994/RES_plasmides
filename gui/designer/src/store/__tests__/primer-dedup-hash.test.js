/**
 * PRIMER-10 (V177) — addPrimerToPool must stamp a resourceHash on every pool
 * addition (not only the Importer), so checkPrimerDedup actually fires across
 * paths. Same canonical hash the Importer uses → identical primers dedup.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../index';

beforeEach(() => {
  try { useStore.setState({ primersById: {}, _primersHydrated: true }); } catch { /* */ }
});

describe('addPrimerToPool — resourceHash for dedup (V177)', () => {
  it('stamps a sha256 resourceHash when none provided', async () => {
    await useStore.getState().addPrimerToPool({ primer: { id: 'd1', name: 'p', sequence: 'ACGTACGTACGT' } });
    const row = useStore.getState().primersById.d1;
    expect(row.resourceHash).toMatch(/^sha256:/);
  });

  it('the stamped hash is findable via checkPrimerDedup (dedup now fires)', async () => {
    await useStore.getState().addPrimerToPool({ primer: { id: 'd1', name: 'p', sequence: 'ACGTACGTACGT' } });
    const h = useStore.getState().primersById.d1.resourceHash;
    const dupe = await useStore.getState().checkPrimerDedup(h);
    expect(dupe?.id).toBe('d1');
  });

  it('same sequence (case-insensitive) → same hash → cross-path dedup', async () => {
    await useStore.getState().addPrimerToPool({ primer: { id: 'd1', sequence: 'ACGTACGTACGT' } });
    await useStore.getState().addPrimerToPool({ primer: { id: 'd2', sequence: 'acgtacgtacgt' } });
    const a = useStore.getState().primersById.d1.resourceHash;
    const b = useStore.getState().primersById.d2.resourceHash;
    expect(a).toBe(b);
  });

  it('an explicit resourceHash (Importer path) is preserved, not overwritten', async () => {
    await useStore.getState().addPrimerToPool({ primer: { id: 'd3', sequence: 'TTTT', resourceHash: 'sha256:custom' } });
    expect(useStore.getState().primersById.d3.resourceHash).toBe('sha256:custom');
  });
});
