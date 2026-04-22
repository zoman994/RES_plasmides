import { describe, it, expect } from 'vitest';
import {
  bootstrapBaseSnapshot,
  createCommit,
  replay,
  replayDiff,
  resolveAutoOverride,
  adjustAnnotationCoords,
  codonStart,
} from '../plasmid-git';

// ATG GCT AAA GAG TTT  →  M A K E F   (15 nt)
const BASE_SEQ = 'ATGGCTAAAGAGTTT';
const BASE_ANN = [
  { id: 'r1', start: 0, end: 15, level: 'region', type: 'CDS', name: 'test' },
];
const makeBase = () => ({ sequence: BASE_SEQ, annotations: BASE_ANN });

// Monotonic createdAt helper so commits order deterministically.
let _t = 1_700_000_000_000;
const nextT = () => ++_t;

describe('plasmid-git — primitives', () => {
  it('codonStart floors nt → codon boundary', () => {
    expect(codonStart(0)).toBe(0);
    expect(codonStart(2)).toBe(0);
    expect(codonStart(3)).toBe(3);
    expect(codonStart(7)).toBe(6);
  });

  it('bootstrapBaseSnapshot deep-copies annotations', () => {
    const frag = { sequence: BASE_SEQ, annotations: BASE_ANN };
    const snap = bootstrapBaseSnapshot(frag);
    expect(snap.sequence).toBe(BASE_SEQ);
    expect(snap.annotations).not.toBe(BASE_ANN);
    expect(snap.annotations[0]).not.toBe(BASE_ANN[0]);
    snap.annotations[0].start = 999;
    expect(BASE_ANN[0].start).toBe(0);
  });

  it('createCommit returns uuid-id + applied:true', () => {
    const c = createCommit('substitution', 3, { newCodon: 'GGG' }, 'A2G', undefined, nextT());
    expect(c.id).toMatch(/^[0-9a-f-]{36}$|^c_/);
    expect(c.applied).toBe(true);
    expect(c.type).toBe('substitution');
    expect(c.parentPos).toBe(3);
    expect(c.payload.newCodon).toBe('GGG');
    expect(typeof c.createdAt).toBe('number');
  });

  it('adjustAnnotationCoords shifts downstream by delta', () => {
    const anns = [{ start: 0, end: 15 }, { start: 6, end: 9 }];
    const shifted = adjustAnnotationCoords(anns, -3, 5);
    expect(shifted[0]).toEqual({ start: 0, end: 12 });
    expect(shifted[1]).toEqual({ start: 3, end: 6 });
  });
});

describe('plasmid-git — replay', () => {
  it('empty commits → baseSnapshot clone', () => {
    const { sequence, annotations, warnings } = replay(makeBase(), []);
    expect(sequence).toBe(BASE_SEQ);
    expect(annotations).toEqual(BASE_ANN);
    expect(annotations).not.toBe(BASE_ANN);
    expect(warnings).toEqual([]);
  });

  it('single substitution applied → same length, codon changed', () => {
    const c = createCommit('substitution', 3, { newCodon: 'TTT' }, 'A2F', undefined, nextT());
    const { sequence } = replay(makeBase(), [c]);
    expect(sequence.length).toBe(BASE_SEQ.length);
    expect(sequence.slice(3, 6)).toBe('TTT');
    expect(sequence.slice(0, 3)).toBe('ATG');
  });

  it('single deletion applied → length decreased, annotations shifted', () => {
    const c = createCommit('deletion', 3, { deleteLength: 3 }, 'ΔA2', undefined, nextT());
    const { sequence, annotations } = replay(makeBase(), [c]);
    expect(sequence.length).toBe(12);
    expect(sequence).toBe('ATGAAAGAGTTT');
    expect(annotations[0].end).toBe(12);
  });

  it('V22 regression: deletion before substitution → replayDiff highlights only substitution HEAD coord, no tail', () => {
    // baseSnapshot: ATG GCT AAA GAG TTT
    // Delete codon 1 (GCT, parentPos=3, len=3) → ATG AAA GAG TTT (length 12)
    // Substitute codon 3 of baseline (parentPos=9, GAG→CAG) → remapped to 6 (9-3)
    const del = createCommit('deletion', 3, { deleteLength: 3 }, 'ΔA2', undefined, nextT());
    const sub = createCommit('substitution', 9, { newCodon: 'CAG' }, 'E4Q', undefined, nextT());
    const { sequence } = replay(makeBase(), [del, sub]);
    expect(sequence).toBe('ATGAAACAGTTT');
    const hi = replayDiff(makeBase(), [del, sub]);
    // Only substitution HEAD coords (6,7,8) are highlighted. Nothing else.
    expect([...hi.keys()].sort((a, b) => a - b)).toEqual([6, 7, 8]);
  });

  it('auto-override: two substitutions on same codon → replay uses latest (first disabled)', () => {
    const a = createCommit('substitution', 3, { newCodon: 'GCA' }, 'A2A_syn', undefined, nextT());
    const { commits: afterA } = resolveAutoOverride([], a);
    afterA.push(a);
    const b = createCommit('substitution', 3, { newCodon: 'GAA' }, 'A2E', undefined, nextT());
    const { commits: withDisabled, overriddenId } = resolveAutoOverride(afterA, b);
    withDisabled.push(b);
    expect(overriddenId).toBe(a.id);
    expect(withDisabled.find(c => c.id === a.id).applied).toBe(false);
    const { sequence } = replay(makeBase(), withDisabled);
    expect(sequence.slice(3, 6)).toBe('GAA');
  });

  it('toggle applied=false of one of two → replay reflects only the other', () => {
    const a = createCommit('substitution', 3, { newCodon: 'CCC' }, 'A2P', undefined, nextT());
    const b = createCommit('substitution', 9, { newCodon: 'TGG' }, 'E4W', undefined, nextT());
    const toggledA = { ...a, applied: false };
    const { sequence } = replay(makeBase(), [toggledA, b]);
    // Codon 1 untouched, codon 3 (pos 9..12) replaced.
    expect(sequence.slice(3, 6)).toBe('GCT');
    expect(sequence.slice(9, 12)).toBe('TGG');
  });

  it('createdAt ordering is deterministic: order of commits in array does not matter', () => {
    const t1 = nextT();
    const t2 = nextT();
    const a = createCommit('substitution', 3, { newCodon: 'GAA' }, 'A2E', undefined, t1);
    const b = createCommit('substitution', 3, { newCodon: 'GCC' }, 'A2A', undefined, t2);
    // b is later ⇒ auto-override would normally fire, but here we test pure replay
    // with two conflicting applied subs. Latest-by-createdAt wins on the same nt.
    const { sequence: s1 } = replay(makeBase(), [a, b]);
    const { sequence: s2 } = replay(makeBase(), [b, a]);
    expect(s1).toBe(s2);
    expect(s1.slice(3, 6)).toBe('GCC');
  });

  it('replay is pure: two calls with same input → deep-equal output', () => {
    const c = createCommit('deletion', 3, { deleteLength: 3 }, 'ΔA2', undefined, nextT());
    const r1 = replay(makeBase(), [c]);
    const r2 = replay(makeBase(), [c]);
    expect(r1).toEqual(r2);
    // Result annotations are fresh copies each time.
    expect(r1.annotations).not.toBe(r2.annotations);
  });

  it('insertion + substitution: remap offsets correctly', () => {
    // Insert CCC at pos 3 → ATG CCC GCT AAA GAG TTT (length 18)
    // Then substitute at parentPos 9 (baseline GAG) → remapped to 12 in current seq
    const ins = createCommit('insertion', 3, { insertSequence: 'CCC' }, '+CCC', undefined, nextT());
    const sub = createCommit('substitution', 9, { newCodon: 'TGG' }, 'E4W', undefined, nextT());
    const { sequence } = replay(makeBase(), [ins, sub]);
    expect(sequence.length).toBe(18);
    expect(sequence.slice(3, 6)).toBe('CCC');
    expect(sequence.slice(12, 15)).toBe('TGG');
  });

  it('frame-shift warning when cumulative indel not divisible by 3', () => {
    const del1 = createCommit('deletion', 3, { deleteLength: 1 }, 'Δ1nt', undefined, nextT());
    const { warnings } = replay(makeBase(), [del1]);
    expect(warnings.join(' ')).toMatch(/рамк|frame|сдвиг/i);
  });

  it('replayDiff silent vs nonsilent: CODON_TABLE classification', () => {
    // ATG(M) GCT(A) — GCT → GCA is synonymous (A→A), should be silent.
    const syn = createCommit('substitution', 3, { newCodon: 'GCA' }, 'A2A_syn', undefined, nextT());
    const hi = replayDiff(makeBase(), [syn], [{ start: 0, end: 15 }]);
    for (const k of hi.values()) expect(k).toBe('silent');
    // GCT → GAA (A→E) is nonsilent.
    const ns = createCommit('substitution', 3, { newCodon: 'GAA' }, 'A2E', undefined, nextT());
    const hi2 = replayDiff(makeBase(), [ns], [{ start: 0, end: 15 }]);
    for (const k of hi2.values()) expect(k).toBe('nonsilent');
  });

  it('toggle + re-toggle round-trip → replay returns to baseline', () => {
    const c = createCommit('substitution', 3, { newCodon: 'GAA' }, 'A2E', undefined, nextT());
    const off = { ...c, applied: false };
    const { sequence: s1 } = replay(makeBase(), [off]);
    expect(s1).toBe(BASE_SEQ);
    const onAgain = { ...off, applied: true };
    const { sequence: s2 } = replay(makeBase(), [onAgain]);
    expect(s2.slice(3, 6)).toBe('GAA');
  });
});

describe('plasmid-git — resolveAutoOverride edge cases', () => {
  it('no existing applied substitution on same codon → overriddenId null, commits unchanged', () => {
    const existing = createCommit('substitution', 3, { newCodon: 'GAA' }, 'A2E', undefined, nextT());
    const newOne = createCommit('substitution', 9, { newCodon: 'TGG' }, 'E4W', undefined, nextT());
    const { commits, overriddenId } = resolveAutoOverride([existing], newOne);
    expect(overriddenId).toBe(null);
    expect(commits).toEqual([existing]);
  });

  it('non-substitution new commit → no override even on same codon', () => {
    const existing = createCommit('substitution', 3, { newCodon: 'GAA' }, 'A2E', undefined, nextT());
    const del = createCommit('deletion', 3, { deleteLength: 3 }, 'ΔA2', undefined, nextT());
    const { overriddenId } = resolveAutoOverride([existing], del);
    expect(overriddenId).toBe(null);
  });

  it('existing disabled substitution on same codon → not overridden again', () => {
    const disabled = { ...createCommit('substitution', 3, { newCodon: 'GAA' }, 'A2E', undefined, nextT()), applied: false };
    const newOne = createCommit('substitution', 3, { newCodon: 'TTT' }, 'A2F', undefined, nextT());
    const { overriddenId } = resolveAutoOverride([disabled], newOne);
    expect(overriddenId).toBe(null);
  });
});
