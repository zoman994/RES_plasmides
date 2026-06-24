/**
 * derived-primer-records — designed mutagenesis primers → canonical
 * assembly-pool records with project + assembly provenance (Кирпич 3b).
 */
import { describe, it, expect } from 'vitest';
import { deriveAssemblyPrimerRecords } from '../lib/derived-primer-records';

const PLAN_PRIMERS = [
  { name: 'KLD_fwd', sequence: 'TGCCGCC', bindingSequence: 'TGCCGCC', tailSequence: '', tmBinding: 58, gcPercent: 60, direction: 'forward' },
  { name: 'KLD_rev', sequence: 'GGCGGCA', bindingSequence: 'GGCGGCA', tailSequence: '', tmBinding: 57, gcPercent: 57, direction: 'reverse' },
];
let n = 0;
const idGen = () => `id${n++}`;

describe('deriveAssemblyPrimerRecords', () => {
  it('maps designed primers to pool records with project+assembly provenance', () => {
    n = 0;
    const recs = deriveAssemblyPrimerRecords(PLAN_PRIMERS, {
      draftId: 'z1',
      anchorPos: 300,
      provenance: { kind: 'derived-mutagenesis', projectId: 'p1', assemblyId: 'z1', mechanism: 'kld' },
      idGen,
      now: () => 123,
    });
    expect(recs).toHaveLength(2);
    expect(recs[0].source).toMatchObject({
      kind: 'derived-mutagenesis', projectId: 'p1', assemblyId: 'z1', mechanism: 'kld',
    });
    expect(recs[0].draftId).toBe('z1');
    expect(recs[0].sequence).toBe('TGCCGCC');
    expect(recs[0].tm).toBe(58);
    expect(recs[0].status).toBe('derived');
    expect(recs[0].createdAt).toBe(123);
    // a pair shares one pairId
    expect(recs[0].pairId).toBe(recs[1].pairId);
  });

  it('positions fwd at the edit and rev just before it', () => {
    n = 0;
    const recs = deriveAssemblyPrimerRecords(PLAN_PRIMERS, { draftId: 'z1', anchorPos: 300, idGen });
    const fwd = recs.find((r) => r.direction === 'forward');
    const rev = recs.find((r) => r.direction === 'reverse');
    expect(fwd.range).toEqual({ start: 300, end: 307 });
    expect(rev.range).toEqual({ start: 293, end: 300 });
  });

  it('empty / null → []', () => {
    expect(deriveAssemblyPrimerRecords([], { draftId: 'z' })).toEqual([]);
    expect(deriveAssemblyPrimerRecords(null, {})).toEqual([]);
  });
});
