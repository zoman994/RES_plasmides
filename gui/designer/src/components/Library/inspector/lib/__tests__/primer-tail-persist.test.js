/**
 * PRIMER-7 (V173) — a primer created from a selection WITH a 5'-tail must keep
 * its tail + binding through persistence, so PrimerTrack matches the binding (not
 * tail+binding) on the template and draws the tail as an overhang.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { buildEntryPrimerPayload, selectEntryPrimers } from '../entry-primers';
import { useStore } from '../../../../../store';

describe('buildEntryPrimerPayload — tail/binding (V173)', () => {
  it('keeps tail + bindingSequence separate; sequence is the full oligo', () => {
    const out = buildEntryPrimerPayload({
      id: 'x1', name: 'p', entryId: 'E1',
      sequence: 'GGATCCCCAAAACTGACAGTTTAAAC', // tail + binding (full)
      tail: 'GGATCC',
      binding: 'CCAAAACTGACAGTTTAAAC',
      direction: 'forward',
    });
    expect(out.primer.tail).toBe('GGATCC');
    expect(out.primer.bindingSequence).toBe('CCAAAACTGACAGTTTAAAC');
    expect(out.primer.sequence).toBe('GGATCCCCAAAACTGACAGTTTAAAC');
    expect(out.primer.length).toBe(26);
  });

  it('legacy (no tail/binding): bindingSequence falls back to the full sequence, tail empty', () => {
    const out = buildEntryPrimerPayload({
      id: 'x2', name: 'p', entryId: 'E1', sequence: 'CCAAAACTGACAGTTTAAAC', direction: 'forward',
    });
    expect(out.primer.tail).toBe('');
    expect(out.primer.bindingSequence).toBe('CCAAAACTGACAGTTTAAAC');
  });

  it('selectEntryPrimers maps bindingSequence + tail to the PrimerTrack shape', () => {
    const primersById = {
      p1: {
        id: 'p1', name: 'withTail', sequence: 'GGATCCACGTACGTACGT',
        bindingSequence: 'ACGTACGTACGT', tail: 'GGATCC', direction: 'forward',
        origin: { kind: 'library-selection', entryId: 'E1' },
      },
    };
    const out = selectEntryPrimers(primersById, 'E1');
    expect(out).toHaveLength(1);
    expect(out[0].bindingSequence).toBe('ACGTACGTACGT');
    expect(out[0].tail).toBe('GGATCC');
  });
});

describe('primerSlice.normalizePrimer — persists bindingSequence + tail (V173)', () => {
  beforeEach(() => {
    try { useStore.setState({ primersById: {}, _primersHydrated: true }); } catch { /* */ }
  });

  it('addPrimerToPool keeps bindingSequence + tail', async () => {
    await useStore.getState().addPrimerToPool({
      primer: {
        id: 't1', name: 'p', sequence: 'GGATCCACGTACGTACGT',
        bindingSequence: 'ACGTACGTACGT', tail: 'GGATCC',
      },
      projectId: null, status: 'designed',
    });
    const row = useStore.getState().primersById.t1;
    expect(row.bindingSequence).toBe('ACGTACGTACGT');
    expect(row.tail).toBe('GGATCC');
  });
});
