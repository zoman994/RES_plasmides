/**
 * primer-tail-pydna-golden.test.js — SPEC_PRIMER_TAIL_UNIFICATION §6.1 layer 1.
 *
 * Biology-invariant guard for the assembly primer-tail conventions, with the
 * ground truth established OFFLINE by pydna / Bio.Restriction (the authority
 * that decides A2 / V131 by FACT, not argument). See:
 *   tools/pydna/primer_tail_golden.py     — the offline experiment
 *   tools/pydna/primer_tail_golden.json   — its emitted golden references
 *
 * pydna VERDICT (run 2026-06-04, pydna 5.5.13 / biopython 1.87 on py3.14):
 *   • overlap / gibson : engine convention CORRECT — amplicons from
 *       deriveAutoPrimers assemble seamlessly into P1+P2+P3 (len 165). ✓
 *   • golden_gate      : engine convention WRONG (V124/V131). Digesting the
 *       current GG amplicon leaves the DOWNSTREAM end BLUNT (no sticky end →
 *       won't ligate). The V124 convention (recognition kept, only the overhang
 *       reverse-complemented) yields BOTH designed 5' overhangs → ligates. ✓
 *   • restriction      : NOT pydna-decidable. pydna's idealised digest cuts a
 *       site flush at the terminus regardless of flanking bases; terminal
 *       cleavage EFFICIENCY is empirical (NEB "Cleavage Close to the End of DNA
 *       Fragments"). V125 (protective bases OUTSIDE the site) rests on that
 *       empirical data, not on pydna.
 *
 * Layer 1 is DIAGNOSIS, not the fix ("без слоя 1 в GG/RE-ветки движка не
 * лезем"). The GG/RE invariants below assert the pydna-proven CORRECT
 * convention, which the current engine does NOT yet meet → they are marked
 * `it.fails` (xfail): GREEN now (documenting V124/V131 + V125), and layer 2
 * flips each `it.fails` → `it` once buildOverlapTail applies the fix.
 */
import { describe, it, expect } from 'vitest';
import { deriveAutoPrimers } from '../lib/primer-derive';
import { reverseComplement } from '../../../sequence-utils';

// Same non-repetitive pieces the pydna experiment used (55 nt each), so the
// reconstructed overlap assembly is identical to the pydna golden product.
const P1 = 'ATGCGTACGGATCCTTAGCACTGACATGGTCAGTACCGATTACGGCATTGCAACG';
const P2 = 'TTGACATCCGTAAGCTTGGCCAATTGCCATGAGTCTAGACCGGTATCAAGCTTGA';
const P3 = 'CCATGGTACCGAGCTCGAATTCACTGGCCGTCGTTTTACAACGTCGTGACTGGGA';

// pydna golden (tools/pydna/primer_tail_golden.json).
const GOLDEN_OVERLAP_PRODUCT =
  'ATGCGTACGGATCCTTAGCACTGACATGGTCAGTACCGATTACGGCATTGCAACG' +
  'TTGACATCCGTAAGCTTGGCCAATTGCCATGAGTCTAGACCGGTATCAAGCTTGA' +
  'CCATGGTACCGAGCTCGAATTCACTGGCCGTCGTTTTACAACGTCGTGACTGGGA';

const REC = 'GGTCTC';     // BsaI recognition (engine literal)
const REC_RC = 'GAGACC';  // its reverse-complement
const RE_SITE = 'GAATTC'; // EcoRI

// ─── helpers ──────────────────────────────────────────────────────────────

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

/** Reconstruct an amplicon's top strand from the derived primer pair:
 *  amplicon = fwd.tail + pieceSeq + rc(rev.tail). */
function reconstruct(primers, p) {
  const fwd = primerFor(primers, p.id, 'fwd');
  const rev = primerFor(primers, p.id, 'rev');
  return fwd.tail + p.sequence + reverseComplement(rev.tail);
}

/** Greedy max-overlap merge (mirrors pydna Assembly homology join). */
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

// ─── OVERLAP / GIBSON — engine convention CORRECT (pydna-confirmed) ─────────

describe('primer-tail golden — overlap/gibson (engine correct)', () => {
  it('amplicons from deriveAutoPrimers assemble seamlessly into the pydna golden product', () => {
    const pieces = [piece('p1', P1), piece('p2', P2), piece('p3', P3)];
    const primers = runDerive('overlap_pcr', pieces);
    const amps = pieces.map((p) => reconstruct(primers, p));
    // Each interior junction carries a homology arm of OVERLAP_LEN (25 nt).
    expect(amps[0].endsWith(P2.slice(0, 25))).toBe(true);   // p1 amplicon → p2 head
    expect(amps[2].startsWith(P2.slice(-25))).toBe(true);   // p3 amplicon ← p2 tail
    const assembled = assembleByOverlap(amps);
    expect(assembled).toBe(GOLDEN_OVERLAP_PRODUCT);
  });

  it('gibson uses the identical overlap convention', () => {
    const pieces = [piece('p1', P1), piece('p2', P2), piece('p3', P3)];
    const assembled = assembleByOverlap(
      pieces.map((p) => reconstruct(runDerive('gibson', pieces), p)),
    );
    expect(assembled).toBe(GOLDEN_OVERLAP_PRODUCT);
  });
});

// ─── KLD / direct ligation — empty tail, blunt (engine correct) ────────────

describe('primer-tail golden — kld/ligation (engine correct)', () => {
  it.each(['kld', 'direct_ligation'])('%s pieces carry no overlap tail (blunt)', (kind) => {
    const pieces = [piece('p1', P1), piece('p2', P2)];
    const primers = runDerive(kind, pieces);
    primers.forEach((pr) => expect(pr.tail).toBe(''));
    // amplicon == the bare piece
    expect(reconstruct(primers, pieces[1])).toBe(P2);
  });
});

// ─── GOLDEN GATE — V124/V131 (pydna-PROVEN engine convention WRONG) ─────────
// Invariant: at the DOWNSTREAM (rev-side) end of a GG amplicon the Type IIS
// recognition must appear reverse-complemented (GAGACC) so the enzyme reads
// INTO the insert and the cut releases the designed 5' overhang. The current
// engine reverse-complements the WHOLE recognition+spacer+overhang, leaving
// GGTCTC pointing OUTWARD → pydna shows the downstream end comes out BLUNT.
// `it.fails`: currently RED (proves V124); layer 2 flips to `it`.

describe('primer-tail golden — golden_gate (V124/V131 evidence)', () => {
  const pieces = [piece('p1', P1, { ggOverhang: 'AATG' }), piece('p2', P2, { ggOverhang: 'GCTT' })];

  it.fails('GG downstream end presents the recognition INWARD (rc) — CORRECT convention', () => {
    const primers = runDerive('golden_gate', pieces);
    const amp = reconstruct(primers, pieces[0]); // p1 has the downstream junction
    const downstreamEnd = amp.slice(-12);
    // Correct GG (V124): recognition reverse-complemented at the outer end.
    expect(downstreamEnd.includes(REC_RC)).toBe(true);
  });

  it('CURRENT engine instead leaves the recognition FORWARD at the downstream end (the defect)', () => {
    const primers = runDerive('golden_gate', pieces);
    const amp = reconstruct(primers, pieces[0]);
    const downstreamEnd = amp.slice(-12);
    // Documents the present (wrong) state: GGTCTC forward, no GAGACC.
    expect(downstreamEnd.includes(REC)).toBe(true);
    expect(downstreamEnd.includes(REC_RC)).toBe(false);
  });
});

// ─── RESTRICTION — V125 (NEB-empirical; engine convention WRONG) ────────────
// Invariant: the RE site must have protective bases OUTSIDE it (a 5' flank at
// the terminus) so the enzyme can cleave near the end. The current engine puts
// the site FLUSH at the 5' terminus (reSite+'GG' tail). pydna can't decide this
// (idealised cut), but NEB terminal-cleavage data requires the flank.
// `it.fails`: currently RED (documents V125); layer 2 flips to `it`.

describe('primer-tail golden — restriction (V125 evidence)', () => {
  const pieces = [piece('p1', P1, { reSite: RE_SITE }), piece('p2', P2, { reSite: RE_SITE })];

  it.fails('RE amplicon has protective bases OUTSIDE the site — CORRECT convention', () => {
    const primers = runDerive('restriction', pieces);
    const amp = reconstruct(primers, pieces[1]); // p2 carries the upstream RE tail
    // Correct (V125): site is NOT flush at the 5' terminus.
    expect(amp.startsWith(RE_SITE)).toBe(false);
  });

  it('CURRENT engine instead puts the RE site FLUSH at the 5′ terminus (the defect)', () => {
    const primers = runDerive('restriction', pieces);
    const amp = reconstruct(primers, pieces[1]);
    expect(amp.startsWith(RE_SITE)).toBe(true); // documents the present (wrong) state
  });
});
