/**
 * assembly-model.test.js — A1 K1 pure layer (merged MODEL⊕DATA decisions).
 *
 * Covers the pure libs: segment-color-palette, segment-annotation-transfer,
 * assembly-model (draft/segment helpers, derived boundaries, derived
 * sequence), assembly-invariants (caps + consistency).
 *
 * Merge decisions in force:
 *  - slice/entity: AssemblyDraft (G1 naming)
 *  - segment.source discriminated union container|manual|imported (G1)
 *  - sequence cached + frozen on segment; computeAssemblySequence concats
 *    cached segment sequences (G1 semantics, A1 API)
 *  - no stored offset; boundaries derived cumulatively (derived consequence)
 *  - invariants + hard caps (A1); splitSegment (A1)
 *  - annotation transfer in scope (G1)
 */
import { describe, it, expect } from 'vitest';
import {
  SEGMENT_COLORS, getNextSegmentColor, getColorBySegmentId,
} from '../lib/segment-color-palette';
import { transferAnnotations } from '../lib/segment-annotation-transfer';
import {
  createDraft, makeSourcedSegment, makeManualSegment,
  addSegment, removeSegment, moveSegment, updateSegment, splitSegment,
  segmentBoundaries, computeAssemblySequence,
} from '../lib/assembly-model';
import {
  validateNoOverlap, validateMonotonicOrder, validateSourceConsistency,
  validateMaxLength, validateGapSequence, validateDraft, ASM_CAPS,
} from '../lib/assembly-invariants';

// ── segment-color-palette ────────────────────────────────────────────
describe('K1 segment-color-palette', () => {
  it('SEGMENT_COLORS has 12 distinct hex colors', () => {
    expect(SEGMENT_COLORS).toHaveLength(12);
    expect(new Set(SEGMENT_COLORS).size).toBe(12);
    SEGMENT_COLORS.forEach((c) => expect(c).toMatch(/^#[0-9a-fA-F]{6}$/));
  });
  it('getNextSegmentColor cycles modulo 12', () => {
    expect(getNextSegmentColor(0)).toBe(SEGMENT_COLORS[0]);
    expect(getNextSegmentColor(11)).toBe(SEGMENT_COLORS[11]);
    expect(getNextSegmentColor(12)).toBe(SEGMENT_COLORS[0]);
    expect(getNextSegmentColor(25)).toBe(SEGMENT_COLORS[1]);
  });
  it('getColorBySegmentId is stable for the same id', () => {
    const a = getColorBySegmentId('seg-abc');
    const b = getColorBySegmentId('seg-abc');
    expect(a).toBe(b);
    expect(SEGMENT_COLORS).toContain(a);
  });
});

// ── segment-annotation-transfer ──────────────────────────────────────
// Annotation coords are 1-based inclusive (annotation-contract). Segment
// range is 0-based [start,end) (DEC-PARSER-COORD-01). transferAnnotations
// converts at the boundary.
describe('K1 segment-annotation-transfer', () => {
  const ann = (o) => ({ id: 'src', level: 'region', type: 'CDS', name: 'x', strand: 1, ...o });

  it('keeps only annotations overlapping the 0-based [start,end) segment range, clipped + regenerated id', () => {
    const parent = [
      ann({ start: 1, end: 10, name: 'before' }),   // 1-based 1..10 → 0-based 0..10
      ann({ start: 21, end: 40, name: 'inside' }),   // within [20,60)
      ann({ start: 90, end: 99, name: 'after' }),
    ];
    const out = transferAnnotations(parent, 20, 60, false);
    expect(out.map((a) => a.name)).toEqual(['inside']);
    const a = out[0];
    expect(a.id).toBeTypeOf('string');
    expect(a.id).not.toBe('src');                 // regenerated
    expect(a.level).toBe('region');               // level preserved
    // segment-local 1-based: parent 1-based 21..40, segment 0-based start 20
    expect(a.start).toBe(1);
    expect(a.end).toBe(20);
    expect(a.origin).toMatchObject({ type: 'transferred' });
  });

  it('clips a partially-overlapping annotation to the segment window', () => {
    const out = transferAnnotations([ann({ start: 15, end: 35, name: 'straddle' })], 20, 60, false);
    expect(out).toHaveLength(1);
    expect(out[0].start).toBe(1);   // clipped to segment start
    expect(out[0].end).toBe(15);    // parent 1-based 35 → local
  });

  it('RC flips coordinates within the segment and inverts strand', () => {
    // segment [20,60) length 40; annotation parent 1-based 21..30 (local fwd 1..10)
    const out = transferAnnotations([ann({ start: 21, end: 30, name: 'r', strand: 1 })], 20, 60, true);
    expect(out).toHaveLength(1);
    expect(out[0].strand).toBe(-1);
    // local fwd [1,10] in length-40 → RC: 40-10+1 .. 40-1+1 = 31..40
    expect(out[0].start).toBe(31);
    expect(out[0].end).toBe(40);
  });

  it('empty / no-overlap → empty array (never throws)', () => {
    expect(transferAnnotations([], 0, 10, false)).toEqual([]);
    expect(transferAnnotations([ann({ start: 100, end: 110 })], 0, 10, false)).toEqual([]);
    expect(transferAnnotations(null, 0, 10, false)).toEqual([]);
  });
});

// ── assembly-model: draft + segment helpers ──────────────────────────
describe('K1 assembly-model draft/segment', () => {
  const C = { id: 'c1', name: 'pUC', sequence: 'AAAACCCCGGGGTTTT', annotations: [] };

  it('createDraft: unique asm- id, empty segments, sane defaults', () => {
    const d = createDraft();
    expect(d.id).toMatch(/^asm-/);
    expect(d.segments).toEqual([]);
    expect(d.topology).toEqual({ circular: false });
    expect(d.name).toBeTypeOf('string');
    expect(createDraft().id).not.toBe(d.id);
  });
  it('createDraft respects name/topology/position', () => {
    const d = createDraft({ name: 'My', topology: { circular: true }, position: { x: 5, y: 6 } });
    expect(d.name).toBe('My');
    expect(d.topology.circular).toBe(true);
    expect(d.position).toEqual({ x: 5, y: 6 });
  });

  it('makeSourcedSegment caches the sliced sequence (forward)', () => {
    const s = makeSourcedSegment({ sourceContainer: C, start: 4, end: 8, rc: false });
    expect(s.id).toMatch(/^seg-/);
    expect(s.source).toEqual({ type: 'container', containerId: 'c1', sourceContainerName: 'pUC' });
    expect(s.sequence).toBe('CCCC');             // 0-based [4,8)
    expect(s.reverseComplement).toBe(false);
    expect(SEGMENT_COLORS).toContain(s.color);
  });
  it('makeSourcedSegment caches reverse-complemented sequence when rc', () => {
    const s = makeSourcedSegment({ sourceContainer: C, start: 0, end: 4, rc: true });
    expect(s.sequence).toBe('TTTT');             // RC of AAAA
    expect(s.reverseComplement).toBe(true);
  });
  it('makeManualSegment with inline sequence', () => {
    const s = makeManualSegment({ sequence: 'GAGA', label: 'linker' });
    expect(s.source.type).toBe('manual');
    expect(s.sequence).toBe('GAGA');
    expect(s.label).toBe('linker');
  });
  it('makeManualSegment placeholder (A1 gap-as-placeholder folded into manual)', () => {
    const s = makeManualSegment({ length: 6, gapKind: 'unknown', gapLabel: '??? 6 bp' });
    expect(s.source.type).toBe('manual');
    expect(s.sequence).toBe('');                 // unknown placeholder
    expect(s.length).toBe(6);
    expect(s.gapKind).toBe('unknown');
  });

  it('addSegment appends then derives boundaries cumulatively (no stored offset)', () => {
    let d = createDraft();
    d = addSegment(d, makeSourcedSegment({ sourceContainer: C, start: 0, end: 4 }));   // AAAA
    d = addSegment(d, makeManualSegment({ sequence: 'GG' }));
    expect(d.segments).toHaveLength(2);
    expect(d.segments[0]).not.toHaveProperty('offset');
    const b = segmentBoundaries(d);
    expect(b.totalLength).toBe(6);
    expect(b.boundaries.map((x) => [x.startOnAssembly, x.endOnAssembly])).toEqual([[0, 4], [4, 6]]);
  });
  it('addSegment insertAtIndex middle keeps order', () => {
    let d = createDraft();
    d = addSegment(d, makeManualSegment({ sequence: 'AAA' }));
    d = addSegment(d, makeManualSegment({ sequence: 'TTT' }));
    d = addSegment(d, makeManualSegment({ sequence: 'GG' }), 1);
    expect(d.segments.map((s) => s.sequence)).toEqual(['AAA', 'GG', 'TTT']);
  });
  it('removeSegment pulls boundaries back', () => {
    let d = createDraft();
    d = addSegment(d, makeManualSegment({ sequence: 'AAA' }));
    d = addSegment(d, makeManualSegment({ sequence: 'TT' }));
    d = removeSegment(d, d.segments[0].id);
    expect(segmentBoundaries(d).totalLength).toBe(2);
  });
  it('moveSegment reorders', () => {
    let d = createDraft();
    d = addSegment(d, makeManualSegment({ sequence: 'A' }));
    d = addSegment(d, makeManualSegment({ sequence: 'C' }));
    d = addSegment(d, makeManualSegment({ sequence: 'G' }));
    d = moveSegment(d, d.segments[2].id, 0);
    expect(d.segments.map((s) => s.sequence)).toEqual(['G', 'A', 'C']);
  });
  it('updateSegment changing sequence length re-derives boundaries', () => {
    let d = createDraft();
    d = addSegment(d, makeManualSegment({ sequence: 'AAAA' }));
    d = addSegment(d, makeManualSegment({ sequence: 'TT' }));
    d = updateSegment(d, d.segments[0].id, { sequence: 'A' });
    expect(segmentBoundaries(d).boundaries.map((x) => x.endOnAssembly)).toEqual([1, 3]);
  });
  it('splitSegment splits one into two; lengths sum to original', () => {
    let d = createDraft();
    d = addSegment(d, makeManualSegment({ sequence: 'AAAATTTT' }));
    d = splitSegment(d, d.segments[0].id, 4);
    expect(d.segments).toHaveLength(2);
    expect(d.segments[0].sequence).toBe('AAAA');
    expect(d.segments[1].sequence).toBe('TTTT');
  });

  it('computeAssemblySequence concats cached segment sequences', () => {
    let d = createDraft();
    d = addSegment(d, makeSourcedSegment({ sourceContainer: C, start: 0, end: 4 }));   // AAAA
    d = addSegment(d, makeManualSegment({ sequence: 'gg' }));
    const r = computeAssemblySequence(d);
    expect(r.sequence).toBe('AAAAgg');
    expect(r.segmentMap).toHaveLength(2);
    expect(r.topology).toEqual({ circular: false });
    expect(r.orphans).toEqual([]);
  });
  it('computeAssemblySequence unknown placeholder → N*length, flagged', () => {
    let d = createDraft();
    d = addSegment(d, makeManualSegment({ length: 5, gapKind: 'unknown' }));
    const r = computeAssemblySequence(d);
    expect(r.sequence).toBe('NNNNN');
  });
});

// ── assembly-invariants ──────────────────────────────────────────────
describe('K1 assembly-invariants', () => {
  const seg = (seq) => makeManualSegment({ sequence: seq });

  it('validateMonotonicOrder ok for normal ordered segments', () => {
    let d = createDraft();
    d = addSegment(d, seg('AAA'));
    d = addSegment(d, seg('TT'));
    expect(validateMonotonicOrder(d).ok).toBe(true);
  });
  it('validateNoOverlap ok for derived non-overlapping boundaries', () => {
    let d = createDraft();
    d = addSegment(d, seg('AAA'));
    d = addSegment(d, seg('CC'));
    expect(validateNoOverlap(d).ok).toBe(true);
  });
  it('validateSourceConsistency fails when range exceeds source bounds', () => {
    const s = makeManualSegment({ sequence: 'AAA' });
    s.source = { type: 'container', containerId: 'c1' };
    s.start = 0; s.end = 999;
    const r = validateSourceConsistency({ containers: [{ id: 'c1', sequence: 'AAAA' }] }, s);
    expect(r.ok).toBe(false);
  });
  it('validateSourceConsistency flags orphan when container missing', () => {
    const s = makeManualSegment({ sequence: 'AAA' });
    s.source = { type: 'container', containerId: 'gone' };
    const r = validateSourceConsistency({ containers: [] }, s);
    expect(r.orphan).toBe(true);
  });
  it('validateMaxLength fails over the hard total cap', () => {
    let d = createDraft();
    d = addSegment(d, makeManualSegment({ length: ASM_CAPS.totalLengthHard + 1, gapKind: 'unknown' }));
    expect(validateMaxLength(d).ok).toBe(false);
  });
  it('validateGapSequence rejects non-ACGTN', () => {
    expect(validateGapSequence(makeManualSegment({ sequence: 'ACGT' })).ok).toBe(true);
    expect(validateGapSequence(makeManualSegment({ sequence: 'AXZ' })).ok).toBe(false);
  });
  it('validateDraft aggregates errors + warnings', () => {
    let d = createDraft();
    d = addSegment(d, seg('ACGT'));
    const r = validateDraft({ containers: [] }, d);
    expect(r.ok).toBe(true);
    expect(Array.isArray(r.errors)).toBe(true);
    expect(Array.isArray(r.warnings)).toBe(true);
  });
});
