/**
 * primer-tail-pydna-golden.test.js — Assembly Workbench primer-tail engine
 * layers 1 (diagnosis) + 2 (fix), guarded against the pydna ground truth.
 *
 * Ground truth (offline, run 2026-06-04, pydna 5.5.13 / biopython 1.87):
 *   tools/pydna/primer_tail_golden.py + .json — the experiment + golden refs.
 *   VERDICT (Chat-сверено §9b): overlap/gibson + kld/ligation engine CORRECT;
 *   golden_gate WRONG → V124; restriction WRONG → V125 (NEB-empirical).
 *
 * Layer 2 (§9b) applies the fix via the canonical buildOverlapTail:
 *   • GG  : rev tail rc's ONLY the overhang, not the whole recognition (V124).
 *   • RE  : fwd tail gets protective bases OUTSIDE the site (V125).
 *   • overlap: one-sided per overlapTarget (default 'right', 30 nt — §1 #6).
 *   • Tm-binding / Tm-tail length (A1b / A1); literal 'N' spacer → concrete 'A'.
 *   • V130: realise consumes the auto-group primer (with tail), not the
 *     tailless fallback.
 */
import { describe, it, expect } from 'vitest';
import { deriveAutoPrimers, buildOverlapTail, bindingLen } from '../lib/primer-derive';
import { realiseAssembly } from '../lib/zone-pieces-to-dag';
import { reverseComplement } from '../../../sequence-utils';
import { calcTm } from '../../../tm-calculator';

// Same non-repetitive 55-nt pieces the pydna experiment used.
const P1 = 'ATGCGTACGGATCCTTAGCACTGACATGGTCAGTACCGATTACGGCATTGCAACG';
const P2 = 'TTGACATCCGTAAGCTTGGCCAATTGCCATGAGTCTAGACCGGTATCAAGCTTGA';
const P3 = 'CCATGGTACCGAGCTCGAATTCACTGGCCGTCGTTTTACAACGTCGTGACTGGGA';
const GOLDEN_OVERLAP_PRODUCT = P1 + P2 + P3; // pydna golden_product (165 nt)

const REC = 'GGTCTC';
const REC_RC = 'GAGACC';
const RE_SITE = 'GAATTC';
const OVL = 30; // §9b temp default overlapLength

// ─── helpers ────────────────────────────────────────────────────────────
function piece(id, sequence, extra = {}) {
  return { id, kind: 'intermediate', sequence, ...extra };
}
function runDerive(kind, pieces) {
  const opGroup = { id: 'og', kind, inputPieces: pieces.map((p) => p.id), zoneId: 'z-none' };
  return deriveAutoPrimers(opGroup, { pieces });
}
function primerFor(primers, pieceId, side) {
  return primers.find((p) => p.source.pieceId === pieceId && p.source.side === side);
}
function reconstruct(primers, p) {
  const fwd = primerFor(primers, p.id, 'fwd');
  const rev = primerFor(primers, p.id, 'rev');
  return fwd.tail + p.sequence + reverseComplement(rev.tail);
}
function mergeOverlap(a, b, min = 20) {
  const max = Math.min(a.length, b.length);
  for (let k = max; k >= min; k -= 1) {
    if (a.slice(a.length - k) === b.slice(0, k)) return a + b.slice(k);
  }
  return null;
}
function assembleByOverlap(amps) {
  return amps.reduce((acc, x) => (acc === null ? null : mergeOverlap(acc, x)));
}

// ─── buildOverlapTail — canonical helper (A1/A1b/A2) ──────────────────────

describe('buildOverlapTail — overlap/gibson convention + overlapTarget', () => {
  it('fwd = neighbour.slice(-overlapLength) verbatim', () => {
    expect(buildOverlapTail('fwd', P1, { method: 'overlap_pcr', overlapTarget: 'both', overlapLength: OVL }))
      .toBe(P1.slice(-OVL));
  });
  it('rev = rc(neighbour.slice(0, overlapLength))', () => {
    expect(buildOverlapTail('rev', P1, { method: 'overlap_pcr', overlapTarget: 'both', overlapLength: OVL }))
      .toBe(reverseComplement(P1.slice(0, OVL)));
  });
  it("overlapTarget 'right' drops the upstream rev tail (one-sided)", () => {
    expect(buildOverlapTail('rev', P1, { method: 'overlap_pcr', overlapTarget: 'right', overlapLength: OVL })).toBe('');
    expect(buildOverlapTail('fwd', P1, { method: 'overlap_pcr', overlapTarget: 'right', overlapLength: OVL })).toBe(P1.slice(-OVL));
  });
  it("overlapTarget 'left' drops the downstream fwd tail", () => {
    expect(buildOverlapTail('fwd', P1, { method: 'overlap_pcr', overlapTarget: 'left', overlapLength: OVL })).toBe('');
    expect(buildOverlapTail('rev', P1, { method: 'overlap_pcr', overlapTarget: 'left', overlapLength: OVL })).toBe(reverseComplement(P1.slice(0, OVL)));
  });
  it('gibson uses the identical overlap convention', () => {
    expect(buildOverlapTail('fwd', P1, { method: 'gibson', overlapTarget: 'both', overlapLength: OVL }))
      .toBe(buildOverlapTail('fwd', P1, { method: 'overlap_pcr', overlapTarget: 'both', overlapLength: OVL }));
  });
});

describe('buildOverlapTail — golden_gate (V124) + restriction (V125)', () => {
  it('GG fwd = recognition + spacer + overhang (recognition forward)', () => {
    expect(buildOverlapTail('fwd', '', { method: 'golden_gate', overhang: 'AATG' })).toBe(`${REC}AAATG`);
  });
  it('GG rev rc\'s ONLY the overhang, NOT the whole recognition (V124)', () => {
    const rev = buildOverlapTail('rev', '', { method: 'golden_gate', overhang: 'AATG' });
    expect(rev).toBe(`${REC}A${reverseComplement('AATG')}`); // GGTCTCA + CATT
    expect(rev).not.toBe(reverseComplement(`${REC}AAATG`)); // the old (wrong) rc-of-whole
  });
  it('GG spacer is a concrete base, not a literal N', () => {
    expect(buildOverlapTail('fwd', '', { method: 'golden_gate', overhang: 'AATG' })).not.toContain('N');
    expect(buildOverlapTail('rev', '', { method: 'golden_gate', overhang: 'AATG' })).not.toContain('N');
  });
  it('RE fwd has protective bases OUTSIDE the site (V125) — not flush at 5′', () => {
    const fwd = buildOverlapTail('fwd', '', { method: 'restriction', reSite: RE_SITE });
    expect(fwd.startsWith(RE_SITE)).toBe(false);
    expect(fwd.includes(RE_SITE)).toBe(true);
    expect(fwd.endsWith(`${RE_SITE}GG`)).toBe(true);
  });
  it('RE fwd respects an explicit protective override', () => {
    expect(buildOverlapTail('fwd', '', { method: 'restriction', reSite: RE_SITE, protective: 'TTT' }))
      .toBe(`TTT${RE_SITE}GG`);
  });
  it('kld / direct_ligation / unknown → empty tail', () => {
    for (const method of ['kld', 'direct_ligation', 'blunt', undefined]) {
      expect(buildOverlapTail('fwd', P1, { method })).toBe('');
      expect(buildOverlapTail('rev', P1, { method })).toBe('');
    }
  });
});

describe('buildOverlapTail / bindingLen — Tm-driven lengths (A1/A1b)', () => {
  it('overlap tail length grows to hit overlapTm within [18,40]', () => {
    const tail = buildOverlapTail('fwd', P1, { method: 'overlap_pcr', overlapTarget: 'both', overlapTm: 60 });
    expect(tail.length).toBeGreaterThanOrEqual(18);
    expect(tail.length).toBeLessThanOrEqual(40);
    expect(calcTm(tail) >= 60 || tail.length === Math.min(40, P1.length)).toBe(true);
  });
  it('bindingLen explicit length is honoured (default 20)', () => {
    expect(bindingLen(P1, 'fwd', 20, null)).toBe(20);
    expect(bindingLen(P1, 'fwd', undefined, null)).toBe(20);
  });
  it('bindingLen by Tm stays within [16,36]', () => {
    const n = bindingLen(P1, 'fwd', null, 58);
    expect(n).toBeGreaterThanOrEqual(16);
    expect(n).toBeLessThanOrEqual(36);
    expect(calcTm(P1.slice(0, n)) >= 58 || n === 36).toBe(true);
  });
});

// ─── overlap/gibson — engine CORRECT, now one-sided (pydna golden) ─────────

describe('primer-tail golden — overlap/gibson (one-sided, assembles to golden)', () => {
  it('amplicons assemble seamlessly into the pydna golden product', () => {
    const pieces = [piece('p1', P1), piece('p2', P2), piece('p3', P3)];
    const primers = runDerive('overlap_pcr', pieces);
    const amps = pieces.map((p) => reconstruct(primers, p));
    // One-sided 'right' default: p1 carries no tail; the homology arm rides
    // the downstream piece's fwd primer.
    expect(amps[0]).toBe(P1);
    expect(amps[1].startsWith(P1.slice(-OVL))).toBe(true);
    expect(amps[2].startsWith(P2.slice(-OVL))).toBe(true);
    expect(assembleByOverlap(amps)).toBe(GOLDEN_OVERLAP_PRODUCT);
  });
  it('gibson assembles to the same golden product', () => {
    const pieces = [piece('p1', P1), piece('p2', P2), piece('p3', P3)];
    const assembled = assembleByOverlap(pieces.map((p) => reconstruct(runDerive('gibson', pieces), p)));
    expect(assembled).toBe(GOLDEN_OVERLAP_PRODUCT);
  });
});

describe('primer-tail golden — kld/ligation (empty tail, blunt)', () => {
  it.each(['kld', 'direct_ligation'])('%s pieces carry no overlap tail', (kind) => {
    const pieces = [piece('p1', P1), piece('p2', P2)];
    const primers = runDerive(kind, pieces);
    primers.forEach((pr) => expect(pr.tail).toBe(''));
    expect(reconstruct(primers, pieces[1])).toBe(P2);
  });
});

// ─── golden_gate — V124 FIXED (both ends digest to 5′ overhangs) ───────────

describe('primer-tail golden — golden_gate V124 (fixed)', () => {
  const OH = 'AATG';
  const pieces = [piece('p1', P1, { ggOverhang: OH }), piece('p2', P2, { ggOverhang: 'GCTT' })];

  it('downstream end presents the recognition INWARD (rc → 5′ overhang on digest)', () => {
    const primers = runDerive('golden_gate', pieces);
    const amp = reconstruct(primers, pieces[0]); // p1 has the downstream junction
    expect(amp.slice(-12).includes(REC_RC)).toBe(true);
    // overhang + rc(spacer) + rc(recognition) at the very 3′ terminus
    expect(amp.endsWith(`${OH}T${REC_RC}`)).toBe(true);
  });
  it('upstream end presents the recognition forward (→ 5′ overhang on digest)', () => {
    const primers = runDerive('golden_gate', pieces);
    const amp = reconstruct(primers, pieces[1]); // p2 has the upstream junction
    expect(amp.startsWith(`${REC}A${OH}`)).toBe(true); // recognition + spacer + designed overhang
  });
});

// ─── restriction — V125 FIXED (protective bases OUTSIDE the site) ──────────

describe('primer-tail golden — restriction V125 (fixed)', () => {
  const pieces = [piece('p1', P1, { reSite: RE_SITE }), piece('p2', P2, { reSite: RE_SITE })];

  it('the upstream RE amplicon has protective bases OUTSIDE the site (not flush at 5′)', () => {
    const primers = runDerive('restriction', pieces);
    const amp = reconstruct(primers, pieces[1]); // p2 carries the upstream RE fwd tail
    expect(amp.startsWith(RE_SITE)).toBe(false);
    expect(amp.includes(RE_SITE)).toBe(true);
  });
});

// ─── V130 — realise consumes the auto-group primer (with tail) ─────────────

describe('primer-tail golden — V130 (realise keeps the overlap tail)', () => {
  it('realiseAssembly uses the auto-group primer (with tail), not the tailless fallback', () => {
    const container = { id: 'cA', name: 'src', sequence: P1 + P2, annotations: [] };
    const pieces = [
      { id: 'p1', kind: 'sourced', zoneId: 'z1', createdAt: 1, ranges: [{ sourceId: 'cA', start: 0, end: 55, orientation: 'forward' }] },
      { id: 'p2', kind: 'sourced', zoneId: 'z1', createdAt: 2, ranges: [{ sourceId: 'cA', start: 55, end: 110, orientation: 'forward' }] },
    ];
    const zone = { id: 'z1', name: 'asm', topology: { circular: false } };
    const opGroup = { id: 'og', kind: 'overlap_pcr', inputPieces: ['p1', 'p2'], zoneId: 'z1' };
    const baseState = { containers: [container], pieces, zones: [zone], positions: {} };
    const primers = deriveAutoPrimers(opGroup, baseState);
    const state = { ...baseState, assemblyDraftPrimers: { z1: primers } };

    const result = realiseAssembly(state, 'z1', ['gibson']);
    expect(result.ok).toBe(true);
    const p2op = result.diff.operations.find((o) => o.origin && o.origin.segmentId === 'p2');
    expect(p2op).toBeTruthy();
    const fwd = p2op.params.userPrimers[0].forward;
    // V130: the auto-group fwd primer carries the overlap tail (P1's last 30
    // nt). Pre-fix, mapPrimersForSegment missed the auto-group kind and
    // realise fell back to a tailless slice(0,20).
    expect(fwd.startsWith(P1.slice(-OVL))).toBe(true);
    expect(fwd.length).toBeGreaterThan(20);
  });
});
