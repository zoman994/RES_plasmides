/**
 * assembly-combinatorics — EXECUTABLE SPEC of «все биологически-верные сочетания
 * сборок» (Игорь, autonomous loop 28.06). One file that PINS the assembly logic:
 * which DNA ends mate, which method joins which ends, which methods may fuse an
 * internal seam vs close a ring, and which op kind each method realises to. Green
 * == the engine's combinatorics match the biology; `todo` markers track the gaps
 * the loop is closing (exonuclease blunting, re-amplify a digest product, a deep
 * multi-step chain on the auto-DAG).
 *
 * The four axes the loop holds equal — биология · логика · удобство · визуал —
 * meet here on the FIRST two (biology = the mate/method truth table; logic = the
 * method→op→junction wiring). Convenience/visual are asserted in their own UI
 * suites (zone-graph-content-drag, sticky-end-fragment, assembly-dag-*).
 *
 * Pure functions only — no store, no React. Sources of truth referenced:
 *   • segment-overhangs.js  junctionInterlock / orientFragments / segmentOverhangs
 *   • junction-derive.js    INTERNAL_METHODS / CLOSURE_METHODS / *ForMethod
 *   • zone-pieces-to-dag.js METHOD_TO_OP_KIND / METHOD_TO_JUNCTION
 *   • op-kinds-registry.js  KNOWN_OP_KINDS
 */
import { describe, it, expect } from 'vitest';
import {
  junctionInterlock,
  orientFragments,
} from '../lib/segment-overhangs';
import {
  INTERNAL_METHODS,
  CLOSURE_METHODS,
  junctionKindForMethod,
  methodForJunctionKind,
  defaultEnzymeForMethod,
} from '../lib/junction-derive';
import { METHOD_TO_OP_KIND, METHOD_TO_JUNCTION } from '../lib/zone-pieces-to-dag';
import { KNOWN_OP_KINDS } from '../canvas/operations/op-kinds-registry';
import { RE_ENZYMES } from '../../../restriction-db';

// ── end-state factory ───────────────────────────────────────────────────────
// The four physical end-states a linear DNA terminus can carry (the rows/cols of
// the mate matrix). Polarity (5′ vs 3′) is a first-class axis — NOT flattened.
const E = {
  blunt: { type: 'blunt', seq: '', delta: 0, label: 'тупой' },
  fiveAATT: { type: '5prime', seq: 'AATT', delta: 4, label: '5′ AATT' }, // EcoRI
  fiveGATC: { type: '5prime', seq: 'GATC', delta: 4, label: '5′ GATC' }, // BamHI
  threeTGCA: { type: '3prime', seq: 'TGCA', delta: -4, label: '3′ TGCA' }, // PstI
  degenerate: { type: '5prime', seq: 'CWWG', delta: 4, label: '5′ CWWG' }, // StyI-like
};

const mate = (a, b) => junctionInterlock(a, b).verdict;

describe('combinatorics — END-STATE mate matrix (биология)', () => {
  // The truth table a biologist would draw: same overhang seq AND same polarity
  // mate; blunt mates only blunt; cross-polarity never mates; ambiguous → manual.
  it('blunt + blunt → blunt (ligatable in any orientation)', () => {
    expect(mate(E.blunt, E.blunt)).toBe('blunt');
  });
  it('identical sticky overhang + same polarity → compatible', () => {
    expect(mate(E.fiveAATT, E.fiveAATT)).toBe('compatible');
    expect(mate(E.threeTGCA, E.threeTGCA)).toBe('compatible');
  });
  it('different sticky overhang sequences → incompatible', () => {
    expect(mate(E.fiveAATT, E.fiveGATC)).toBe('incompatible');
  });
  it('same seq but OPPOSITE polarity (5′ vs 3′) → incompatible', () => {
    expect(mate({ ...E.fiveAATT }, { type: '3prime', seq: 'AATT', delta: -4 })).toBe('incompatible');
  });
  it('blunt + sticky → incompatible (must blunt one end first — see GAP-1)', () => {
    expect(mate(E.blunt, E.fiveAATT)).toBe('incompatible');
    expect(mate(E.fiveAATT, E.blunt)).toBe('incompatible');
  });
  it('degenerate/IUPAC overhang → unknown (never a false compatible)', () => {
    expect(mate(E.degenerate, E.degenerate)).toBe('unknown');
  });
  it('a missing end (no overhang info) → unknown', () => {
    expect(mate(null, E.fiveAATT)).toBe('unknown');
  });
});

describe('combinatorics — METHOD → OP → JUNCTION wiring (логика)', () => {
  // Every assembly method the user can pick resolves to exactly one registered
  // op kind (what materialises) and one junction kind (what the seam looks like).
  const METHODS = ['overlap_pcr', 'gibson', 'golden_gate', 'restriction', 'direct_ligation', 'kld'];

  it('every method maps to a registered op kind', () => {
    METHODS.forEach((m) => {
      const opKind = METHOD_TO_OP_KIND[m];
      expect(opKind, `method ${m} → op`).toBeTruthy();
      expect(KNOWN_OP_KINDS.has(opKind), `${opKind} registered`).toBe(true);
    });
  });

  it('overlap/Gibson realise via the gibson op; RE/blunt via ligate; GG/KLD self', () => {
    expect(METHOD_TO_OP_KIND.overlap_pcr).toBe('gibson');
    expect(METHOD_TO_OP_KIND.gibson).toBe('gibson');
    expect(METHOD_TO_OP_KIND.golden_gate).toBe('golden_gate');
    expect(METHOD_TO_OP_KIND.restriction).toBe('ligate'); // digest is a SEPARATE cut op
    expect(METHOD_TO_OP_KIND.direct_ligation).toBe('ligate');
    expect(METHOD_TO_OP_KIND.kld).toBe('kld');
  });

  it('each method maps to a seam (junction) kind', () => {
    expect(METHOD_TO_JUNCTION.overlap_pcr).toBe('overlap');
    expect(METHOD_TO_JUNCTION.gibson).toBe('overlap');
    expect(METHOD_TO_JUNCTION.golden_gate).toBe('golden_gate');
    expect(METHOD_TO_JUNCTION.restriction).toBe('re_ligation');
    expect(METHOD_TO_JUNCTION.direct_ligation).toBe('ligation');
    expect(METHOD_TO_JUNCTION.kld).toBe('kld');
  });

  it('junctionKindForMethod ↔ methodForJunctionKind round-trips the canonical kinds', () => {
    ['overlap_pcr', 'golden_gate', 'restriction', 'kld'].forEach((m) => {
      expect(methodForJunctionKind(junctionKindForMethod(m))).toBe(m);
    });
    // direct_ligation → 'ligation' → direct_ligation (preformed also folds here)
    expect(methodForJunctionKind('ligation')).toBe('direct_ligation');
    expect(methodForJunctionKind('preformed')).toBe('direct_ligation');
  });

  it('enzyme-driven methods seed a default enzyme; homology/blunt methods do not', () => {
    expect(defaultEnzymeForMethod('golden_gate')).toBe('BsaI'); // Type IIS (GG dict)
    expect(defaultEnzymeForMethod('restriction')).toBe('EcoRI'); // classical RE dict
    expect(defaultEnzymeForMethod('overlap_pcr')).toBeNull();
    expect(defaultEnzymeForMethod('gibson')).toBeNull();
    expect(defaultEnzymeForMethod('kld')).toBeNull();
  });
});

describe('combinatorics — INTERNAL fuse vs RING closure method classes (биология+логика)', () => {
  // RC-SEP (Игорь 25.06): an internal seam ≠ a ring-closing reaction. overlap_pcr
  // stitches a LINEAR product (its ring counterpart is Gibson). KLD is a 1-plasmid
  // self-closure, never a two-fragment internal fuse.
  it('internal seam may be made by overlap/Gibson-homology, GG, RE, or blunt', () => {
    expect(INTERNAL_METHODS).toEqual(
      expect.arrayContaining(['overlap_pcr', 'golden_gate', 'restriction', 'direct_ligation']),
    );
  });
  it('KLD and bare gibson are NOT internal-fuse methods', () => {
    expect(INTERNAL_METHODS).not.toContain('kld');
    expect(INTERNAL_METHODS).not.toContain('gibson'); // gibson is a CLOSURE counterpart
  });
  it('ring closure may be Gibson, Golden Gate, KLD, or RE sticky ligation', () => {
    expect(CLOSURE_METHODS).toEqual(
      expect.arrayContaining(['gibson', 'golden_gate', 'kld', 'restriction']),
    );
  });
  it('overlap_pcr is NOT a closure method (linear product, not a ring)', () => {
    expect(CLOSURE_METHODS).not.toContain('overlap_pcr');
  });
});

describe('combinatorics — orientation + ring closure on real RE fragments (биология)', () => {
  // segment factory matching segment-overhangs' restriction shape (V157).
  const reSeg = (id, enzymes, positions, seq) => ({
    id,
    sequence: seq || 'ACGT'.repeat(20),
    acquisitionMethod: 'restriction',
    acquisitionParams: {
      enzymes,
      cutSites: positions.map((position) => ({ position })),
      ...(enzymes.length === 1 ? { single: true } : {}),
    },
  });

  it('two EcoRI-cut fragments (AATT both ends) close into a ring', () => {
    const f0 = reSeg('f0', ['EcoRI'], [10]);
    const f1 = reSeg('f1', ['EcoRI'], [50]);
    const r = orientFragments([f0, f1], RE_ENZYMES, { circular: true });
    expect(r.chainMates).toBe(true);
    expect(r.closes).toBe(true);
  });

  it('directional EcoRI×BamHI pair closes (each seam a distinct overhang)', () => {
    // f0 = [EcoRI .. BamHI], f1 = [BamHI .. EcoRI] → internal GATC↔GATC, closure AATT↔AATT.
    const f0 = reSeg('f0', ['EcoRI', 'BamHI'], [10, 40]);
    const f1 = reSeg('f1', ['BamHI', 'EcoRI'], [10, 40]);
    const r = orientFragments([f0, f1], RE_ENZYMES, { circular: true });
    expect(r.closes).toBe(true);
  });

  it('EcoRI (5′) vs PstI (3′) fragments cannot close — polarity clash', () => {
    const f0 = reSeg('f0', ['EcoRI'], [10]);
    const f1 = reSeg('f1', ['PstI'], [50]);
    const r = orientFragments([f0, f1], RE_ENZYMES, { circular: true });
    expect(r.closes).toBe(false);
  });

  it('a single RE fragment self-closes when its two ends share an overhang', () => {
    const f0 = reSeg('f0', ['EcoRI'], [10]);
    const r = orientFragments([f0], RE_ENZYMES, { circular: true });
    // 1 fragment: no internal junction; closure seam = its own two AATT ends.
    expect(r.closes).toBe(true);
  });
});

// ── GAPS the loop is closing — executable roadmap, kept out of the green count ──
describe('combinatorics — GAPS (roadmap markers, биология+логика+удобство+визуал)', () => {
  // GAP-1 DONE: exonuclease/polymerase blunting. Engine = lib/end-blunting.js
  // (end-blunting.test.js); op = `blunt` kind wired into the registry with an
  // adapter + popup + icon + colour (blunt-op.test.js). A digest fragment with an
  // incompatible overhang → chew/fill to BLUNT → then blunt ligation / KLD / Gibson.
  it('GAP-1 — `blunt` is a registered, executable op kind', () => {
    expect(KNOWN_OP_KINDS.has('blunt')).toBe(true);
  });

  // GAP-2 DONE: re-amplify a restriction fragment. The skip in primer-derive.js:414
  // is intent-scoped (digest→ligate), NOT a wall — promoting acquisitionMethod
  // restriction→ov-pcr/pcr (SegmentList picker) re-enables primers → new PCR product
  // → Gibson. Covered by gap2-reamplify-restriction.test.js + a SegmentList UX hint.

  // GAP-3 DONE (rendering): a deep chain source→cut→frag→pcr→amplicon→gibson→product
  // lays out depth-ordered on the SHARED renderer (buildGraphNodesEdges +
  // computeGraphPositions, dagre); DAG (AssemblyDagView) and canvas (ZoneFrame) both
  // feed it → seamless. Covered by gap3-deep-chain-layout.test.js. (The live PREVIEW
  // derivePiecesToGraph stays a shallow per-piece shorthand by design.)

  // GAP-4 DONE (grounding correction): GG is NOT a sticky-end orientFragments case —
  // its overhangs are DESIGNED from fragment boundaries, so validity = orthogonality
  // (unique / non-palindromic / no RC clash) via golden-gate.js designOverhangs, which
  // ALREADY models closure (circular=true adds the wrap junction). Covered by
  // gap4-golden-gate-validity.test.js. Follow-up (UX): surface designOverhangs issues in
  // the readiness panel for golden_gate junctions, as junctionInterlock does for RE.

  // GAP-5 DONE (V172): orientFragments now backtracks (stored-first DFS, greedy fallback)
  // → finds a closable N≥3 ring whose only solution needs seg0 flipped. Covered by
  // orient-solver-n3-v172.test.js.
});
