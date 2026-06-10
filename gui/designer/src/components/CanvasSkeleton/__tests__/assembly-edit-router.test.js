/**
 * assembly-edit-router.test.js — SPEC_EDITABLE_ASSEMBLY_S1 §7.1.
 *
 * Pure unit tests for routeAssemblyEdit — translation of an
 * `onSequenceEdit`-op (assembly coordinates) into a piece operation:
 *  - insert on a piece/piece boundary or assembly edge → new snippet block
 *  - insert inside (or at the right edge of) an inline piece → append
 *  - insert strictly inside a sourced piece → no-op (S2 split deferred)
 *  - delete / replace fully inside one inline piece → edit its sequence
 *  - delete/replace crossing a boundary or touching sourced → no-op
 *  - snippet ↔ synthesis kind flip on threshold crossing
 *  - emptying an inline piece → remove-block
 *
 * The router consumes the SAME draft + boundaries the assembly shell
 * already derives (draftFromZone segment shape + segmentBoundaries), so
 * the tests build boundaries with the real segmentBoundaries helper.
 */
import { describe, it, expect } from 'vitest';
import {
  routeAssemblyEdit,
  computeSeqDelta,
  SYNTHESIS_THRESHOLD_DEFAULT,
} from '../lib/assembly-edit-router';
import { segmentBoundaries } from '../lib/assembly-model';

function mkDraft(segments) {
  return {
    id: 'z', name: 'z', topology: { circular: false }, segments,
  };
}
function bounds(draft) {
  return segmentBoundaries(draft).boundaries;
}
const sourced = (id, seq, opts = {}) => ({
  id,
  pieceKind: 'sourced',
  source: { type: 'container', containerId: opts.containerId || 'c' },
  start: opts.start ?? 0,
  end: opts.end ?? seq.length,
  reverseComplement: !!opts.rc,
  sequence: seq,
  length: seq.length,
});
const snippet = (id, seq) => ({
  id, pieceKind: 'snippet', sequence: seq, length: seq.length,
});
const synthesis = (id, seq) => ({
  id, pieceKind: 'synthesis', sequence: seq, length: seq.length,
});
const gapUnknown = (id, len) => ({
  id, pieceKind: 'gap', sequence: '', length: len, gapKind: 'unknown',
});
const gapKnown = (id, seq) => ({
  id, pieceKind: 'gap', sequence: seq, length: seq.length, gapKind: 'known',
});

describe('routeAssemblyEdit — constant', () => {
  it('SYNTHESIS_THRESHOLD_DEFAULT is 80', () => {
    expect(SYNTHESIS_THRESHOLD_DEFAULT).toBe(80);
  });
});

describe('routeAssemblyEdit — insert resolution', () => {
  it('insert on a sourced/sourced boundary → new-block at the boundary index', () => {
    const d = mkDraft([sourced('s0', 'AAAA'), sourced('s1', 'CCCC')]);
    const r = routeAssemblyEdit({ kind: 'insert', pos: 4, char: 'A' }, d, bounds(d));
    expect(r).toEqual({ kind: 'new-block', insertAtIndex: 1, char: 'A' });
  });

  it('insert at the leading edge (pos 0) → new-block at index 0', () => {
    const d = mkDraft([sourced('s0', 'AAAA')]);
    const r = routeAssemblyEdit({ kind: 'insert', pos: 0, char: 'G' }, d, bounds(d));
    expect(r).toEqual({ kind: 'new-block', insertAtIndex: 0, char: 'G' });
  });

  it('insert at the trailing edge (pos === totalLength) after a sourced → new-block appended', () => {
    const d = mkDraft([sourced('s0', 'AAAA'), sourced('s1', 'CCCC')]);
    const r = routeAssemblyEdit({ kind: 'insert', pos: 8, char: 'T' }, d, bounds(d));
    expect(r).toEqual({ kind: 'new-block', insertAtIndex: 2, char: 'T' });
  });

  it('insert strictly inside a sourced piece → split-insert (S2)', () => {
    const d = mkDraft([sourced('s0', 'AAAACCCC')]);
    const r = routeAssemblyEdit({ kind: 'insert', pos: 3, char: 'A' }, d, bounds(d));
    expect(r).toEqual({
      kind: 'split-insert', pieceId: 's0', atOffset: 3, char: 'A', insertAtIndex: 1,
    });
  });

  it('insert inside a snippet → update-inline append at the local offset', () => {
    // s0=[0,4), snip=[4,7), s1=[7,11)
    const d = mkDraft([sourced('s0', 'AAAA'), snippet('sn', 'TTT'), sourced('s1', 'CCCC')]);
    const r = routeAssemblyEdit({ kind: 'insert', pos: 5, char: 'G' }, d, bounds(d));
    expect(r).toEqual({
      kind: 'update-inline', pieceId: 'sn', targetKind: 'snippet', sequence: 'TGTT',
    });
  });

  it('insert at the RIGHT edge of a snippet → append (extend the just-built block)', () => {
    const d = mkDraft([sourced('s0', 'AAAA'), snippet('sn', 'TT')]);
    // snip=[4,6); pos 6 == snippet end → still belongs to the snippet
    const r = routeAssemblyEdit({ kind: 'insert', pos: 6, char: 'G' }, d, bounds(d));
    expect(r).toEqual({
      kind: 'update-inline', pieceId: 'sn', targetKind: 'snippet', sequence: 'TTG',
    });
  });
});

describe('routeAssemblyEdit — typing ATG on a boundary yields ONE block', () => {
  it('three sequential inserts grow a single snippet (route-level simulation)', () => {
    // Start: [sourced AAAA][sourced CCCC]
    let segs = [sourced('s0', 'AAAA'), sourced('s1', 'CCCC')];
    let d = mkDraft(segs);
    const r1 = routeAssemblyEdit({ kind: 'insert', pos: 4, char: 'A' }, d, bounds(d));
    expect(r1).toEqual({ kind: 'new-block', insertAtIndex: 1, char: 'A' });

    // Apply r1 — snippet 'A' inserted at index 1.
    segs = [sourced('s0', 'AAAA'), snippet('sn', 'A'), sourced('s1', 'CCCC')];
    d = mkDraft(segs);
    const r2 = routeAssemblyEdit({ kind: 'insert', pos: 5, char: 'T' }, d, bounds(d));
    expect(r2).toEqual({
      kind: 'update-inline', pieceId: 'sn', targetKind: 'snippet', sequence: 'AT',
    });

    // Apply r2 — snippet now 'AT'.
    segs = [sourced('s0', 'AAAA'), snippet('sn', 'AT'), sourced('s1', 'CCCC')];
    d = mkDraft(segs);
    const r3 = routeAssemblyEdit({ kind: 'insert', pos: 6, char: 'G' }, d, bounds(d));
    expect(r3).toEqual({
      kind: 'update-inline', pieceId: 'sn', targetKind: 'snippet', sequence: 'ATG',
    });
  });
});

describe('routeAssemblyEdit — snippet ↔ synthesis flip', () => {
  it('snippet growing past the threshold flips to synthesis', () => {
    const seq80 = 'A'.repeat(80);
    const d = mkDraft([snippet('sn', seq80)]);
    // insert at the end → length becomes 81 > 80
    const r = routeAssemblyEdit({ kind: 'insert', pos: 80, char: 'C' }, d, bounds(d));
    expect(r.kind).toBe('update-inline');
    expect(r.sequence.length).toBe(81);
    expect(r.kindFlip).toBe('synthesis');
  });

  it('snippet at exactly the threshold does NOT flip (strict >)', () => {
    const seq79 = 'A'.repeat(79);
    const d = mkDraft([snippet('sn', seq79)]);
    const r = routeAssemblyEdit({ kind: 'insert', pos: 79, char: 'C' }, d, bounds(d));
    expect(r.sequence.length).toBe(80);
    expect(r.kindFlip).toBeUndefined();
  });

  it('synthesis shrinking to ≤ threshold flips back to snippet', () => {
    const seq81 = 'A'.repeat(81);
    const d = mkDraft([synthesis('sy', seq81)]);
    // delete one char → length 80 ≤ 80
    const r = routeAssemblyEdit({ kind: 'delete', pos: 80, length: 1 }, d, bounds(d));
    expect(r.kind).toBe('update-inline');
    expect(r.sequence.length).toBe(80);
    expect(r.kindFlip).toBe('snippet');
  });

  it('threshold override is honoured', () => {
    const d = mkDraft([snippet('sn', 'AAAA')]);
    const r = routeAssemblyEdit({ kind: 'insert', pos: 4, char: 'C' }, d, bounds(d), { threshold: 4 });
    expect(r.sequence.length).toBe(5);
    expect(r.kindFlip).toBe('synthesis');
  });
});

describe('routeAssemblyEdit — delete / replace', () => {
  it('delete inside an inline snippet → update-inline', () => {
    const d = mkDraft([sourced('s0', 'AAAA'), snippet('sn', 'TTGG')]);
    // snip=[4,8); delete pos 5 len 1 → range [5,6) inside snippet
    const r = routeAssemblyEdit({ kind: 'delete', pos: 5, length: 1 }, d, bounds(d));
    expect(r).toEqual({
      kind: 'update-inline', pieceId: 'sn', targetKind: 'snippet', sequence: 'TGG',
    });
  });

  it('deleting the last nucleotide of a snippet → remove-block', () => {
    const d = mkDraft([sourced('s0', 'AAAA'), snippet('sn', 'T')]);
    const r = routeAssemblyEdit({ kind: 'delete', pos: 4, length: 1 }, d, bounds(d));
    expect(r).toEqual({ kind: 'remove-block', pieceId: 'sn' });
  });

  it('replace fully inside a snippet → update-inline (selection overtype)', () => {
    const d = mkDraft([snippet('sn', 'AAAA')]);
    const r = routeAssemblyEdit({
      kind: 'replace', start: 1, end: 3, replacement: 'G',
    }, d, bounds(d));
    expect(r).toEqual({
      kind: 'update-inline', pieceId: 'sn', targetKind: 'snippet', sequence: 'AGA',
    });
  });

  it('replace emptying a snippet (Delete on full selection) → remove-block', () => {
    const d = mkDraft([snippet('sn', 'AAAA')]);
    const r = routeAssemblyEdit({
      kind: 'replace', start: 0, end: 4, replacement: '',
    }, d, bounds(d));
    expect(r).toEqual({ kind: 'remove-block', pieceId: 'sn' });
  });

  it('delete crossing a piece boundary → spanning plan (S2)', () => {
    const d = mkDraft([sourced('s0', 'AAAA'), snippet('sn', 'TTTT')]);
    // range [3,6) spans the sourced/snippet boundary
    const r = routeAssemblyEdit({ kind: 'delete', pos: 3, length: 3 }, d, bounds(d));
    expect(r.kind).toBe('plan');
    expect(r.steps).toEqual([
      { op: 'trim', pieceId: 's0', range: { sourceId: 'c', start: 0, end: 3, orientation: 'forward' } },
      { op: 'splice-inline', pieceId: 'sn', sequence: 'TT', targetKind: 'snippet' },
    ]);
  });

  it('delete in the middle of a sourced piece → split-delete (S2)', () => {
    const d = mkDraft([sourced('s0', 'AAAACCCC')]);
    const r = routeAssemblyEdit({ kind: 'delete', pos: 2, length: 2 }, d, bounds(d));
    expect(r).toEqual({ kind: 'split-delete', pieceId: 's0', atOffset: 2, deleteLen: 2 });
  });
});

describe('routeAssemblyEdit — S2 sourced edits', () => {
  it('equal-length replace inside a sourced piece → mutate (substitution)', () => {
    const d = mkDraft([sourced('s0', 'AAAA')]);
    const r = routeAssemblyEdit({ kind: 'replace', start: 1, end: 2, replacement: 'G' }, d, bounds(d));
    expect(r.kind).toBe('mutate');
    expect(r.pieceId).toBe('s0');
    expect(r.mutations).toEqual([{
      position: 1, fromBase: 'A', toBase: 'G', kind: 'silent', notes: 'editable-view',
    }]);
  });

  it('multi-base equal-length replace → one mutation per differing position', () => {
    const d = mkDraft([sourced('s0', 'AAAA')]);
    const r = routeAssemblyEdit({ kind: 'replace', start: 0, end: 3, replacement: 'GAG' }, d, bounds(d));
    expect(r.kind).toBe('mutate');
    // pos 0 A→G, pos 1 A==A (skip), pos 2 A→G
    expect(r.mutations.map((m) => m.position)).toEqual([0, 2]);
  });

  it('delete at the LEFT edge of a sourced piece → trim', () => {
    const d = mkDraft([sourced('s0', 'AAAACCCC')]);
    const r = routeAssemblyEdit({ kind: 'delete', pos: 0, length: 2 }, d, bounds(d));
    expect(r).toEqual({ kind: 'trim', pieceId: 's0', range: { sourceId: 'c', start: 2, end: 8, orientation: 'forward' } });
  });

  it('delete at the RIGHT edge of a sourced piece → trim', () => {
    const d = mkDraft([sourced('s0', 'AAAACCCC')]);
    const r = routeAssemblyEdit({ kind: 'delete', pos: 6, length: 2 }, d, bounds(d));
    expect(r).toEqual({ kind: 'trim', pieceId: 's0', range: { sourceId: 'c', start: 0, end: 6, orientation: 'forward' } });
  });

  it('left-edge delete of a REVERSE sourced piece trims the source end (rc-aware)', () => {
    const d = mkDraft([sourced('s0', 'AAAACCCC', { rc: true })]);
    const r = routeAssemblyEdit({ kind: 'delete', pos: 0, length: 2 }, d, bounds(d));
    // assembled-left maps to range.end on a reverse piece → end -= 2
    expect(r).toEqual({ kind: 'trim', pieceId: 's0', range: { sourceId: 'c', start: 0, end: 6, orientation: 'reverse' } });
  });

  it('deleting a whole sourced piece → remove-block', () => {
    const d = mkDraft([sourced('s0', 'AAAA'), sourced('s1', 'CCCC')]);
    const r = routeAssemblyEdit({ kind: 'replace', start: 0, end: 4, replacement: '' }, d, bounds(d));
    expect(r).toEqual({ kind: 'remove-block', pieceId: 's0' });
  });

  it('spanning replace with a replacement → plan ending in an insert-snippet', () => {
    const d = mkDraft([sourced('s0', 'AAAA'), sourced('s1', 'CCCC')]);
    // select [2,6) across the boundary, type 'X'
    const r = routeAssemblyEdit({ kind: 'replace', start: 2, end: 6, replacement: 'X' }, d, bounds(d));
    expect(r.kind).toBe('plan');
    const last = r.steps[r.steps.length - 1];
    expect(last).toEqual({ op: 'insert-snippet', insertAtIndex: 1, sequence: 'X' });
    // s0 trimmed right to [0,2), s1 trimmed left to [2,4)
    expect(r.steps[0]).toEqual({ op: 'trim', pieceId: 's0', range: { sourceId: 'c', start: 0, end: 2, orientation: 'forward' } });
    expect(r.steps[1]).toEqual({ op: 'trim', pieceId: 's1', range: { sourceId: 'c', start: 2, end: 4, orientation: 'forward' } });
  });

  it('mid replace of a different length inside a sourced piece → split-delete + insert', () => {
    const d = mkDraft([sourced('s0', 'AAAACCCC')]);
    // select [2,5) (3 nt) inside, type 'X' (1 nt) → delete 3, insert block
    const r = routeAssemblyEdit({ kind: 'replace', start: 2, end: 5, replacement: 'X' }, d, bounds(d));
    expect(r).toEqual({
      kind: 'split-delete', pieceId: 's0', atOffset: 2, deleteLen: 3, insertSeq: 'X', insertAtIndex: 1,
    });
  });
});

describe('routeAssemblyEdit — gap pieces are inline-editable', () => {
  it('insert into a KNOWN gap → update-inline targetKind gap', () => {
    const d = mkDraft([sourced('s0', 'AAAA'), gapKnown('gk', 'GGG')]);
    const r = routeAssemblyEdit({ kind: 'insert', pos: 5, char: 'T' }, d, bounds(d));
    expect(r).toEqual({
      kind: 'update-inline', pieceId: 'gk', targetKind: 'gap', sequence: 'GTGG',
    });
  });

  it('insert into an UNKNOWN-length gap fills against its poly-N span', () => {
    const d = mkDraft([gapUnknown('g', 3)]);
    // gap renders NNN (span [0,3)); insert at offset 1
    const r = routeAssemblyEdit({ kind: 'insert', pos: 1, char: 'A' }, d, bounds(d));
    expect(r).toEqual({
      kind: 'update-inline', pieceId: 'g', targetKind: 'gap', sequence: 'NANN',
    });
  });

  it('gap never flips kind even past the threshold', () => {
    const d = mkDraft([gapKnown('gk', 'A'.repeat(80))]);
    const r = routeAssemblyEdit({ kind: 'insert', pos: 80, char: 'C' }, d, bounds(d));
    expect(r.kind).toBe('update-inline');
    expect(r.sequence.length).toBe(81);
    expect(r.kindFlip).toBeUndefined();
  });
});

describe('routeAssemblyEdit — intermediate / guards', () => {
  it('typing strictly inside an intermediate piece is a no-op (op-group output, not S1)', () => {
    const d = mkDraft([{
      id: 'im', pieceKind: 'intermediate', sequence: 'AAAACCCC', length: 8,
    }]);
    const r = routeAssemblyEdit({ kind: 'insert', pos: 3, char: 'A' }, d, bounds(d));
    expect(r.kind).toBe('noop');
  });

  it('a malformed op is a no-op', () => {
    const d = mkDraft([snippet('sn', 'AAAA')]);
    expect(routeAssemblyEdit(null, d, bounds(d)).kind).toBe('noop');
    expect(routeAssemblyEdit({ kind: 'insert', char: 'A' }, d, bounds(d)).kind).toBe('noop');
    expect(routeAssemblyEdit({ kind: 'replace', start: 4, end: 2 }, d, bounds(d)).kind).toBe('noop');
  });
});

describe('computeSeqDelta — S3 §5.2', () => {
  it('insert → +1 at pos', () => {
    expect(computeSeqDelta({ kind: 'insert', pos: 7, char: 'A' })).toEqual({ atPos: 7, delta: 1 });
  });
  it('delete → −length at pos', () => {
    expect(computeSeqDelta({ kind: 'delete', pos: 7, length: 3 })).toEqual({ atPos: 7, delta: -3 });
  });
  it('shorter replace → negative delta at start', () => {
    expect(computeSeqDelta({ kind: 'replace', start: 5, end: 9, replacement: 'X' })).toEqual({ atPos: 5, delta: -3 });
  });
  it('equal-length replace (substitution) → delta 0', () => {
    expect(computeSeqDelta({ kind: 'replace', start: 5, end: 6, replacement: 'G' })).toEqual({ atPos: 5, delta: 0 });
  });
  it('malformed op → null', () => {
    expect(computeSeqDelta(null)).toBeNull();
    expect(computeSeqDelta({ kind: 'wat' })).toBeNull();
  });
});
