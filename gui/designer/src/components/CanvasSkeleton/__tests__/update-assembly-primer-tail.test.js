/**
 * PRIMER-12 (V178) — UPDATE_ASSEMBLY_PRIMER must not leave a STALE tail when the
 * primer's sequence is edited. A manual sequence edit replaces the whole oligo;
 * without an explicit tail the edited sequence is the binding (no overhang), so
 * the old tail must be cleared — else PrimerTrack draws a phantom overhang.
 */
import { describe, it, expect } from 'vitest';
import { assemblyReducer, buildInitialAssemblyState } from '../store/skeleton-state-assembly';

function stateWithPrimer(primer) {
  const base = buildInitialAssemblyState();
  return { ...base, assemblyDraftPrimers: { D1: [primer] } };
}
const TAILED = {
  id: 'p1', name: 'f', direction: 'forward',
  sequence: 'GGATCCACGTACGTACGT', bindingSequence: 'ACGTACGTACGT', tail: 'GGATCC',
};

describe('UPDATE_ASSEMBLY_PRIMER — stale tail on sequence edit (V178)', () => {
  it('editing sequence WITHOUT a tail clears the old tail (binding = full edited seq)', () => {
    const s0 = stateWithPrimer(TAILED);
    const s1 = assemblyReducer(s0, {
      type: 'UPDATE_ASSEMBLY_PRIMER', draftId: 'D1', primerId: 'p1',
      patch: { sequence: 'TTTTGGGGCCCC' },
    });
    const p = s1.assemblyDraftPrimers.D1[0];
    expect(p.tail).toBe('');
    expect(p.bindingSequence).toBe('TTTTGGGGCCCC');
    expect(p.status).toBe('edited');
  });

  it('editing sequence WITH an explicit tail keeps that tail', () => {
    const s0 = stateWithPrimer(TAILED);
    const s1 = assemblyReducer(s0, {
      type: 'UPDATE_ASSEMBLY_PRIMER', draftId: 'D1', primerId: 'p1',
      patch: { sequence: 'AAGCTTACGTACGTACGT', bindingSequence: 'ACGTACGTACGT', tail: 'AAGCTT' },
    });
    const p = s1.assemblyDraftPrimers.D1[0];
    expect(p.tail).toBe('AAGCTT');
    expect(p.bindingSequence).toBe('ACGTACGTACGT');
  });

  it('a non-sequence patch (e.g. notes) leaves the tail untouched', () => {
    const s0 = stateWithPrimer(TAILED);
    const s1 = assemblyReducer(s0, {
      type: 'UPDATE_ASSEMBLY_PRIMER', draftId: 'D1', primerId: 'p1',
      patch: { notes: 'check me' },
    });
    const p = s1.assemblyDraftPrimers.D1[0];
    expect(p.tail).toBe('GGATCC'); // untouched
  });
});
