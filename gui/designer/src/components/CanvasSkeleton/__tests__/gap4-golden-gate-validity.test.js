/**
 * gap4-golden-gate-validity — GAP-4 / P3 (Игорь /loop 28.06): «Golden Gate Type IIS
 * в ориентации/замыкании». Grounding correction: GG does NOT go through orientFragments.
 * RE overhangs are enzyme-INTRINSIC (fixed per fragment → sticky-end mating via
 * junctionInterlock). GG overhangs are DESIGNED from the fragment boundaries
 * (golden-gate.js designOverhangs: last N/2 of left + first N/2 of right), so a GG
 * assembly's validity is NOT end-mating but overhang-set ORTHOGONALITY (unique,
 * non-palindromic, no RC clash) — exactly what validateOverhangs checks.
 *
 * Crucially designOverhangs ALREADY models CLOSURE: circular=true adds the wrap
 * junction (i+1)%n, so a ring's last→first overhang is validated too. This test PINS
 * that GG's own closure/validity model is correct + complete for the assembler — the
 * right home for «GG в замыкании» (NOT a sticky-end solver). Remaining (follow-up,
 * needs a UX decision): surface designOverhangs issues in the assembly readiness panel
 * for golden_gate junctions, the way junctionInterlock surfaces for RE.
 */
import { describe, it, expect } from 'vitest';
import { designOverhangs } from '../../../golden-gate';

// boundary-built fragments: overhang = last 2 of left + first 2 of right (BsaI ovLen 4)
const frag = (name, seq) => ({ name, sequence: seq });
// Orthogonal circular set: AATG (f0→f1), GCTA (f1→f2), TCCG (f2→f0 wrap).
//   f0 starts CG (for wrap TC+CG=TCCG), ends AA (AA+TG=AATG)
//   f1 starts TG, ends GC (GC+TA=GCTA)
//   f2 starts TA, ends TC
const F0 = frag('f0', 'CGAAACCCAA');
const F1 = frag('f1', 'TGAAACCCGC');
const F2 = frag('f2', 'TAAAACCCTC');

describe('GAP-4 — Golden Gate overhang validity is GG-native (designOverhangs), incl. closure', () => {
  it('linear GG (n−1 junctions): orthogonal boundaries → valid', () => {
    const r = designOverhangs([F0, F1, F2], 'BsaI', false);
    expect(r.overhangs).toHaveLength(2); // n-1 internal junctions
    expect(r.overhangs.map((o) => o.sequence)).toEqual(['AATG', 'GCTA']);
    expect(r.valid).toBe(true);
  });

  it('circular GG adds the CLOSURE (wrap) junction → n junctions validated', () => {
    const r = designOverhangs([F0, F1, F2], 'BsaI', true);
    expect(r.overhangs).toHaveLength(3); // +1 closure junction (f2→f0)
    expect(r.overhangs[2].sequence).toBe('TCCG'); // the ring-closing overhang
    expect(r.valid).toBe(true);
  });

  it('palindromic boundary overhang → invalid (self-ligation flagged)', () => {
    // f0 ends AT, f1 starts AT → overhang ATAT (rc ATAT) palindrome.
    const a = frag('a', 'CGAAACCCAT');
    const b = frag('b', 'ATAAACCCGC');
    const r = designOverhangs([a, b], 'BsaI', false);
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.type === 'palindrome')).toBe(true);
  });

  it('duplicate overhang on two junctions → invalid (cross-ligation flagged)', () => {
    // both junctions yield AATG → duplicate.
    const a = frag('a', 'CGAAACCCAA');
    const b = frag('b', 'TGAAACCCAA'); // starts TG (→AATG), ends AA
    const c = frag('c', 'TGAAACCCGC'); // starts TG (b→c: AA+TG=AATG dup)
    const r = designOverhangs([a, b, c], 'BsaI', false);
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.type === 'duplicate')).toBe(true);
  });
});
