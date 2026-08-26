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

  it('anchors a production KLD pair as canonical aligned-v1 sites on the source template', () => {
    n = 0;
    const template = `ATG${'ACG'.repeat(99)}AAA${'TGC'.repeat(99)}TAA`;
    const primers = [
      { ...PLAN_PRIMERS[0], sequence: 'GAATGCTGCTGCTGCTGCTGC', bindingSequence: 'GAATGCTGCTGCTGCTGCTGC' },
      { ...PLAN_PRIMERS[1], sequence: 'CGTCGTCGTCGTCGTCGTCG', bindingSequence: 'CGTCGTCGTCGTCGTCGTCG' },
    ];
    const recs = deriveAssemblyPrimerRecords(primers, {
      draftId: 'draft-1',
      anchorPos: 300,
      templateSequence: template,
      target: { entryId: 'draft-1', resourceHash: 'sha256:draft-v1', topology: 'circular' },
      reactionId: 'reaction-1',
      sourcePieceId: 'piece-parent',
      variantPieceId: 'piece-variant',
      provenance: { kind: 'aa-mutagenesis', projectId: 'project-1' },
      idGen,
    });

    expect(recs).toHaveLength(2);
    expect(recs.every((record) => (
      record.bindingModel === 'aligned-v1'
      && record.sequence === `${record.tail}${record.bindingSequence}`
      && record.reactionId === 'reaction-1'
      && record.sites.length === 1
    ))).toBe(true);
    const fwd = recs.find((record) => record.direction === 'forward');
    const rev = recs.find((record) => record.direction === 'reverse');
    expect(fwd.sites[0]).toMatchObject({
      target: { entryId: 'draft-1', resourceHash: 'sha256:draft-v1', topology: 'circular' },
      location: { kind: 'single', segments: [{ start: 300, end: 321 }] },
      strand: 1,
      annealedSequence: 'AAATGCTGCTGCTGCTGCTGC',
      alignment: { counts: { M: 20, X: 1, I: 0, D: 0 }, threePrimeMatchLength: 20 },
    });
    expect(rev.sites[0]).toMatchObject({
      location: { kind: 'single', segments: [{ start: 280, end: 300 }] },
      strand: -1,
      annealedSequence: 'CGTCGTCGTCGTCGTCGTCG',
      alignment: { counts: { M: 20, X: 0, I: 0, D: 0 }, threePrimeMatchLength: 20 },
    });
    expect(recs.every((record) => record.source.sourcePieceId === 'piece-parent'
      && record.source.variantPieceId === 'piece-variant'
      && record.source.reactionId === 'reaction-1')).toBe(true);
  });

  it('stores no duplex Tm for canonical X/I/D bodies while a perfect M mate keeps its scalar', () => {
    const template = 'A'.repeat(40);
    const cases = [
      { op: 'X', bindingSequence: 'TAAAAAA', bindingTargetLength: 7 },
      { op: 'I', bindingSequence: 'TAAAAAAA', bindingTargetLength: 7 },
      { op: 'D', bindingSequence: 'AAAAAA', bindingTargetLength: 7 },
    ];
    const observed = cases.map((item, caseIndex) => {
      let serial = 0;
      const recs = deriveAssemblyPrimerRecords([
        {
          name: `mut-${item.op}`, sequence: item.bindingSequence,
          bindingSequence: item.bindingSequence, bindingTargetLength: item.bindingTargetLength,
          tailSequence: '', tmBinding: 61, direction: 'forward',
        },
        {
          name: 'perfect-M', sequence: 'TTTTTTT', bindingSequence: 'TTTTTTT',
          bindingTargetLength: 7, tailSequence: '', tmBinding: 59, direction: 'reverse',
        },
      ], {
        draftId: `draft-${caseIndex}`,
        anchorPos: 10,
        templateSequence: template,
        target: { entryId: `draft-${caseIndex}`, resourceHash: `sha256:${caseIndex}`, topology: 'circular' },
        idGen: () => `${caseIndex}-${serial += 1}`,
      });
      const mutating = recs.find((record) => record.direction === 'forward');
      const perfect = recs.find((record) => record.direction === 'reverse');
      return {
        op: item.op,
        counts: mutating.sites[0].alignment.counts,
        tm: mutating.tm,
        siteTm: mutating.sites[0].meltingTemperature,
        perfectTm: perfect.tm,
        perfectSiteTm: perfect.sites[0].meltingTemperature,
      };
    });

    expect(observed).toEqual(cases.map(({ op }) => ({
      op,
      counts: {
        M: op === 'I' ? 7 : 6,
        X: op === 'X' ? 1 : 0,
        I: op === 'I' ? 1 : 0,
        D: op === 'D' ? 1 : 0,
      },
      tm: null,
      siteTm: null,
      perfectTm: 59,
      perfectSiteTm: 59,
    })));
  });

  it('empty / null → []', () => {
    expect(deriveAssemblyPrimerRecords([], { draftId: 'z' })).toEqual([]);
    expect(deriveAssemblyPrimerRecords(null, {})).toEqual([]);
  });
});
