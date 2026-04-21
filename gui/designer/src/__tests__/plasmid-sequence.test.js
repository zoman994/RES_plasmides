import { describe, it, expect } from 'vitest';
import { buildPlasmidSequence } from '../plasmid-sequence';

describe('buildPlasmidSequence', () => {
  it('returns empty for empty/invalid input', () => {
    expect(buildPlasmidSequence([])).toEqual({ sequence: '', annotations: [] });
    expect(buildPlasmidSequence(null)).toEqual({ sequence: '', annotations: [] });
    expect(buildPlasmidSequence(undefined)).toEqual({ sequence: '', annotations: [] });
  });

  it('concatenates two forward fragments and shifts annotations by cumulative offset', () => {
    const fragments = [
      {
        sequence: 'AAAA',
        annotations: [
          { id: 'a1', name: 'first', level: 'region', start: 0, end: 4, type: 'CDS' },
        ],
      },
      {
        sequence: 'GGGG',
        annotations: [
          { id: 'a2', name: 'second', level: 'region', start: 0, end: 4, type: 'CDS' },
        ],
      },
    ];
    const { sequence, annotations } = buildPlasmidSequence(fragments);
    expect(sequence).toBe('AAAAGGGG');
    expect(annotations).toHaveLength(2);
    expect(annotations[0]).toMatchObject({ id: 'a1', start: 0, end: 4 });
    expect(annotations[1]).toMatchObject({ id: 'a2', start: 4, end: 8 });
  });

  it('inverts annotations and rev-comps sequence when strand === -1', () => {
    // Sequence ATGCAA, annotation [0,3) covers 'ATG' (CDS start).
    // After revComp → TTGCAT, annotation should cover [3,6) = 'CAT' (rc of 'ATG').
    const fragments = [
      {
        sequence: 'ATGCAA',
        strand: -1,
        annotations: [
          { id: 'r1', name: 'cds', level: 'region', start: 0, end: 3, strand: 1 },
        ],
      },
    ];
    const { sequence, annotations } = buildPlasmidSequence(fragments);
    expect(sequence).toBe('TTGCAT');
    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toMatchObject({ id: 'r1', start: 3, end: 6, strand: -1 });
  });

  it('honours reversed:true as an alias for strand:-1', () => {
    const fragments = [
      {
        sequence: 'ATGC',
        reversed: true,
        annotations: [{ start: 0, end: 2 }],
      },
    ];
    const { sequence, annotations } = buildPlasmidSequence(fragments);
    expect(sequence).toBe('GCAT');
    expect(annotations[0]).toMatchObject({ start: 2, end: 4 });
  });

  it('cumulative offset applies to reversed fragments too', () => {
    const fragments = [
      { sequence: 'AAAA' }, // offset 0, length 4
      {
        sequence: 'ATGC', // revComp → GCAT, appears at offset 4
        strand: -1,
        annotations: [{ id: 'x', start: 0, end: 2, level: 'region' }],
      },
    ];
    const { sequence, annotations } = buildPlasmidSequence(fragments);
    expect(sequence).toBe('AAAAGCAT');
    // original [0,2) in length-4 fragment → invert to [2,4), then +offset 4 → [6,8)
    expect(annotations).toEqual([
      expect.objectContaining({ id: 'x', start: 6, end: 8 }),
    ]);
  });

  it('handles fragments without annotations', () => {
    const fragments = [
      { sequence: 'AAA' },
      { sequence: 'GGG', annotations: undefined },
      { sequence: 'TTT', annotations: [] },
    ];
    const { sequence, annotations } = buildPlasmidSequence(fragments);
    expect(sequence).toBe('AAAGGGTTT');
    expect(annotations).toEqual([]);
  });

  it('skips malformed annotations (missing start/end) but keeps the rest', () => {
    const fragments = [
      {
        sequence: 'AAAA',
        annotations: [
          { id: 'ok', start: 0, end: 2 },
          { id: 'bad' }, // no start/end
          null,
          { id: 'ok2', start: 2, end: 4 },
        ],
      },
    ];
    const { annotations } = buildPlasmidSequence(fragments);
    expect(annotations).toHaveLength(2);
    expect(annotations.map(a => a.id)).toEqual(['ok', 'ok2']);
  });

  it('preserves overlapping annotations inside a single fragment', () => {
    const fragments = [
      {
        sequence: 'ATGCATGCATGC', // 12 bp
        annotations: [
          { id: 'outer', level: 'region', start: 0, end: 12 },
          { id: 'inner1', level: 'detail', start: 0, end: 6 },
          { id: 'inner2', level: 'detail', start: 3, end: 9 },
        ],
      },
    ];
    const { annotations } = buildPlasmidSequence(fragments);
    expect(annotations).toHaveLength(3);
    const byId = Object.fromEntries(annotations.map(a => [a.id, a]));
    expect(byId.outer).toMatchObject({ start: 0, end: 12 });
    expect(byId.inner1).toMatchObject({ start: 0, end: 6 });
    expect(byId.inner2).toMatchObject({ start: 3, end: 9 });
  });

  it('total sequence length equals sum of fragment lengths regardless of strand', () => {
    const fragments = [
      { sequence: 'AAAAA' },
      { sequence: 'GGGGG', strand: -1 },
      { sequence: 'TTTTT' },
    ];
    const { sequence } = buildPlasmidSequence(fragments);
    expect(sequence).toHaveLength(15);
    expect(sequence).toBe('AAAAACCCCCTTTTT');
  });

  it('uppercases sequences on the way through', () => {
    const fragments = [{ sequence: 'atgc', annotations: [{ start: 0, end: 4 }] }];
    const { sequence } = buildPlasmidSequence(fragments);
    expect(sequence).toBe('ATGC');
  });
});
