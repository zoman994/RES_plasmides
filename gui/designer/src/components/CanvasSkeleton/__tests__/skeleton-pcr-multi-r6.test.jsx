/**
 * skeleton-pcr-multi-r6.test.jsx — Multi-template PCR.
 *
 * R6-4 (14.05.2026). Verifies:
 *   - executePCR with templateIds[] returns one amplicon per template.
 *   - Auto-design path emits oligo container per template.
 *   - Primer pair path skips templates where primer doesn't anneal.
 *   - All templates fail to anneal → error.
 *   - Single templateId (legacy) path still works.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { executePCR } from '../canvas/operations/lib-adapters';

describe('R6-4 — executePCR multi-template', () => {
  it('single templateId path unchanged (legacy)', () => {
    const tpl = {
      id: 't1', kind: 'molecule', name: 'tpl1',
      sequence: 'ATCGATCGATCGATCGATCGATCGATCGATCG',
      topology: { circular: false },
    };
    const op = {
      id: 'op', kind: 'pcr',
      params: { templateId: 't1', autoDesign: true },
    };
    const result = executePCR(op, { containers: { t1: tpl } });
    expect(result.error).toBeUndefined();
    expect(result.outputs).toHaveLength(2); // amplicon + oligo
    expect(result.outputs[0].kind).toBe('molecule');
    expect(result.outputs[1].kind).toBe('oligonucleotide');
  });

  it('multi-template auto-design returns amplicon+oligo per template', () => {
    const t1 = {
      id: 't1', kind: 'molecule', name: 'A',
      sequence: 'AAAATTTTGGGGCCCCAAAATTTTGGGGCCCCAAAATTTTGGGGCCCC',
    };
    const t2 = {
      id: 't2', kind: 'molecule', name: 'B',
      sequence: 'ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG',
    };
    const op = {
      id: 'op', kind: 'pcr',
      params: { templateIds: ['t1', 't2'], autoDesign: true },
    };
    const result = executePCR(op, { containers: { t1, t2 } });
    expect(result.error).toBeUndefined();
    // 2 templates × 2 outputs (amplicon + oligo) = 4 outputs
    expect(result.outputs).toHaveLength(4);
    const amplicons = result.outputs.filter((c) => c.kind === 'molecule');
    const oligos = result.outputs.filter((c) => c.kind === 'oligonucleotide');
    expect(amplicons).toHaveLength(2);
    expect(oligos).toHaveLength(2);
    expect(amplicons[0].name).toBe('A_amplicon');
    expect(amplicons[1].name).toBe('B_amplicon');
    expect(amplicons[0].origin.multiTemplate).toBe(true);
  });

  it('multi-template auto-design skips a short template and keeps valid outputs', () => {
    const short = { id: 'short', kind: 'molecule', name: 'short', sequence: 'ACGTACGTA' };
    const valid = {
      id: 'valid', kind: 'molecule', name: 'valid',
      sequence: 'ATCGATCGATCGATCGATCGATCGATCGATCG',
    };
    const result = executePCR({
      id: 'op', kind: 'pcr', params: { templateIds: ['short', 'valid'], autoDesign: true },
    }, { containers: { short, valid } });

    expect(result.error).toBeUndefined();
    expect(result.outputs).toHaveLength(2);
    expect(result.outputs[0].name).toBe('valid_amplicon');
    expect(result.outputs[0].origin.skipped).toContain('short');
  });

  it('multi-template auto-design fails when every generated pair has a short 3-prime anchor', () => {
    const a = { id: 'a', kind: 'molecule', name: 'A', sequence: 'ACGTACGTA' };
    const b = { id: 'b', kind: 'molecule', name: 'B', sequence: 'TGCATGCAT' };
    const result = executePCR({
      id: 'op', kind: 'pcr', params: { templateIds: ['a', 'b'], autoDesign: true },
    }, { containers: { a, b } });

    expect(result.error).toMatch(/меньше 10/i);
    expect(result.outputs).toBeUndefined();
  });

  it('multi-template с primer pair skips non-matching templates', () => {
    const fwdSeq = 'GGGGCCCCGGGG';
    const revSeq = 'CGATCGATCGAT';
    const revRc = 'ATCGATCGATCG';
    const t1 = {
      id: 't1', kind: 'molecule', name: 'matching',
      sequence: 'AAAA' + fwdSeq + 'NNNNNNNNNN' + revRc + 'TTTT',
    };
    const t2 = {
      id: 't2', kind: 'molecule', name: 'no-match',
      sequence: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    };
    const oligo = {
      id: 'p1', kind: 'oligonucleotide',
      payload: { sequences: [{ name: 'fwd', sequence: fwdSeq }, { name: 'rev', sequence: revSeq }] },
    };
    const op = {
      id: 'op', kind: 'pcr',
      params: { templateIds: ['t1', 't2'], primerPairId: 'p1', autoDesign: false },
    };
    const result = executePCR(op, { containers: { t1, t2, p1: oligo } });
    expect(result.error).toBeUndefined();
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0].name).toBe('matching_amplicon');
    expect(result.outputs[0].origin.skipped).toContain('no-match');
  });

  it('multi-template все темплейты не сматчили → error', () => {
    const fwdSeq = 'ACACACACACAC';
    const revSeq = 'TGTGTGTGTGTG';
    const t1 = { id: 't1', kind: 'molecule', name: 'A', sequence: 'ATCGATCGATCG' };
    const t2 = { id: 't2', kind: 'molecule', name: 'B', sequence: 'GGGGGGGGGGGG' };
    const oligo = {
      id: 'p1', kind: 'oligonucleotide',
      payload: { sequences: [{ name: 'fwd', sequence: fwdSeq }, { name: 'rev', sequence: revSeq }] },
    };
    const op = {
      id: 'op', kind: 'pcr',
      params: { templateIds: ['t1', 't2'], primerPairId: 'p1', autoDesign: false },
    };
    const result = executePCR(op, { containers: { t1, t2, p1: oligo } });
    expect(result.error).toMatch(/ни один template/);
  });
});
