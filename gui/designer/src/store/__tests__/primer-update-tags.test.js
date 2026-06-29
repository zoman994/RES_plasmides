/**
 * primerSlice — PRIMER-3 (Игорь /loop 28.06): tags + general field edit. Pins
 * that normalizePrimer preserves a `tags` array and `updatePrimerFields` patches
 * name/tags (state + Dexie), guarding bad input.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../index';
import { getPrimer } from '../../db/dexie-schema';

beforeEach(() => {
  try { useStore.setState({ primersById: {}, _primersHydrated: true }); } catch { /* */ }
});

describe('primer tags + updatePrimerFields', () => {
  it('addPrimerToPool preserves a tags array', async () => {
    await useStore.getState().addPrimerToPool({
      primer: { id: 't1', name: 'p', sequence: 'ACGT', tags: ['колония', 'M13'] },
      projectId: null, status: 'designed',
    });
    expect(useStore.getState().primersById.t1.tags).toEqual(['колония', 'M13']);
  });

  it('addPrimerToPool defaults tags to [] when absent', async () => {
    await useStore.getState().addPrimerToPool({ primer: { id: 't2', name: 'p', sequence: 'ACGT' } });
    expect(useStore.getState().primersById.t2.tags).toEqual([]);
  });

  it('updatePrimerFields patches name + tags in state and persists to Dexie', async () => {
    await useStore.getState().addPrimerToPool({ primer: { id: 't3', name: 'old', sequence: 'ACGT' } });
    const out = await useStore.getState().updatePrimerFields('t3', { name: 'newName', tags: ['seq', 'fwd'] });
    expect(out.name).toBe('newName');
    expect(useStore.getState().primersById.t3.name).toBe('newName');
    expect(useStore.getState().primersById.t3.tags).toEqual(['seq', 'fwd']);
    const row = await getPrimer('t3');
    expect(row.name).toBe('newName');
    expect(row.tags).toEqual(['seq', 'fwd']);
  });

  it('updatePrimerFields trims a blank name to a no-op (keeps prior name)', async () => {
    await useStore.getState().addPrimerToPool({ primer: { id: 't4', name: 'keep', sequence: 'ACGT' } });
    await useStore.getState().updatePrimerFields('t4', { name: '   ' });
    expect(useStore.getState().primersById.t4.name).toBe('keep');
  });

  it('updatePrimerFields returns null for unknown id', async () => {
    const out = await useStore.getState().updatePrimerFields('nope', { name: 'x' });
    expect(out).toBe(null);
  });

  it('updatePrimerFields can add then remove tags (round-trip)', async () => {
    await useStore.getState().addPrimerToPool({ primer: { id: 't5', name: 'p', sequence: 'ACGT', tags: ['a', 'b'] } });
    await useStore.getState().updatePrimerFields('t5', { tags: ['a'] });
    expect(useStore.getState().primersById.t5.tags).toEqual(['a']);
    await useStore.getState().updatePrimerFields('t5', { tags: [] });
    expect(useStore.getState().primersById.t5.tags).toEqual([]);
  });
});
