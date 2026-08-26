/**
 * ANN-0A — canonical annotation location contract.
 *
 * One coordinate system for every annotation in BodgeGene:
 *   store    0-based, end-exclusive `[start, end)` segments
 *   UI       1-based inclusive
 *   file     GenBank 1-based inclusive, converted exactly once per boundary
 *
 * These tests exercise the PRODUCTION-shaped boundaries (parseGenBank →
 * importFeatures → store → entryToGenbank) rather than the helper alone, because
 * BG-028 lives in the boundaries: `join(...)` was flattened to `min(start)..max(end)`
 * and an origin-crossing CDS became a near-full-length molecule.
 */
import { describe, it, expect } from 'vitest';

import {
  LOCATION_KINDS,
  getSegments,
  locationLength,
  locationSpan,
  wrapsOrigin,
  isPoint,
  normalizeLocation,
  makeLocation,
  toUiSegments,
  formatUiRange,
  parseGenBankLocation,
  formatGenBankLocation,
} from '../annotation-location';

import { parseGenBank } from '../../genbank-parser';
import { importFeatures } from '../../import-annotations';
import { entryToGenbank } from '../export-genbank';
import {
  updateAnnotation,
  createAnnotation,
  splitAnnotation,
  mergeAnnotations,
} from '../annotation-edit';
import { rotateOriginToPosition } from '../../rotate-origin';

// ═══ fixtures ═══

/** Deterministic ACGT filler of exactly `n` bases. */
function seqOf(n) {
  const unit = 'ACGT';
  let s = '';
  while (s.length < n) s += unit;
  return s.slice(0, n);
}

/** Wrap a features/sequence pair into the GenBank text the parser really sees. */
function gbText({ length, topology = 'circular', features = [] }) {
  const seq = seqOf(length);
  let out = `LOCUS       TESTPLASMID     ${length} bp    DNA     ${topology}   SYN 20260802\n`;
  out += `DEFINITION  ANN-0A fixture\n`;
  out += `FEATURES             Location/Qualifiers\n`;
  for (const f of features) {
    out += `     ${f.type.padEnd(16)}${f.loc}\n`;
    out += `                     /label="${f.label}"\n`;
  }
  out += `ORIGIN\n`;
  const lower = seq.toLowerCase();
  for (let i = 0; i < lower.length; i += 60) {
    const chunks = [];
    for (let j = 0; j < 60 && i + j < lower.length; j += 10) {
      chunks.push(lower.slice(i + j, i + j + 10));
    }
    out += `${String(i + 1).padStart(9)} ${chunks.join(' ')}\n`;
  }
  out += `//\n`;
  return out;
}

function entryOf(annotations, { length = 5000, topology = 'circular' } = {}) {
  return {
    id: 'e1',
    name: 'TESTPLASMID',
    payload: { sequence: seqOf(length), annotations, topology },
  };
}

const CIRC = { length: 5000, topology: 'circular' };
const LIN = { length: 5000, topology: 'linear' };

// ─────────────────────────────────────────────────────────────────────────────
// 1. simple forward range: file → canonical → UI, converted exactly once
// ─────────────────────────────────────────────────────────────────────────────

describe('ANN-0A/1 — simple range 1..10', () => {
  it('GenBank 1..10 parses to canonical [0,10) and displays as 1–10', () => {
    const parsed = parseGenBank(gbText({
      length: 200, topology: 'linear',
      features: [{ type: 'CDS', loc: '1..10', label: 'tiny' }],
    }));
    const { annotations } = importFeatures(parsed.features, parsed.length, 'genbank', { length: parsed.length, topology: 'linear' });
    const ann = annotations.find((a) => a.name === 'tiny');

    expect(getSegments(ann)).toEqual([{ start: 0, end: 10 }]);
    expect(ann.location.kind).toBe(LOCATION_KINDS.SINGLE);
    expect(locationLength(ann)).toBe(10);
    expect(locationSpan(ann)).toEqual({ start: 0, end: 10 });
    expect(toUiSegments(ann)).toEqual([{ uiStart: 1, uiEnd: 10 }]);
    expect(formatUiRange(ann)).toBe('1–10');
  });

  it('re-export then re-import adds no second offset', () => {
    const ann = normalizeLocation(
      { id: 'a1', name: 'tiny', type: 'CDS', level: 'region', strand: 1, start: 0, end: 10 },
      { length: 200, topology: 'linear' },
    );
    const gb = entryToGenbank(entryOf([ann], { length: 200, topology: 'linear' }));
    expect(gb).toMatch(/CDS\s+1\.\.10/);

    const reparsed = parseGenBank(gb);
    const back = importFeatures(reparsed.features, reparsed.length, 'genbank', { length: reparsed.length, topology: 'linear' })
      .annotations.find((a) => a.name === 'tiny');
    expect(getSegments(back)).toEqual([{ start: 0, end: 10 }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. complement: strand is separate from coordinates, coordinates never flip
// ─────────────────────────────────────────────────────────────────────────────

describe('ANN-0A/2 — complement(1..10)', () => {
  it('keeps identical coordinates and records strand −1 separately', () => {
    const parsed = parseGenBank(gbText({
      length: 200, topology: 'linear',
      features: [{ type: 'CDS', loc: 'complement(1..10)', label: 'rev' }],
    }));
    const { annotations } = importFeatures(parsed.features, parsed.length, 'genbank', { length: parsed.length, topology: 'linear' });
    const ann = annotations.find((a) => a.name === 'rev');

    expect(getSegments(ann)).toEqual([{ start: 0, end: 10 }]);
    expect(ann.strand).toBe(-1);
    expect(toUiSegments(ann)).toEqual([{ uiStart: 1, uiEnd: 10 }]);
  });

  it('round-trips back out as complement(1..10)', () => {
    const ann = normalizeLocation(
      { id: 'r1', name: 'rev', type: 'CDS', level: 'region', strand: -1, start: 0, end: 10 },
      { length: 200, topology: 'linear' },
    );
    expect(formatGenBankLocation(ann)).toBe('complement(1..10)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. point features are exactly one base wide
// ─────────────────────────────────────────────────────────────────────────────

describe('ANN-0A/3 — point location', () => {
  it('GenBank position 5 becomes [4,5) and reads back as position 5', () => {
    const { location } = parseGenBankLocation('5', LIN);
    expect(location.segments).toEqual([{ start: 4, end: 5 }]);

    const ann = normalizeLocation(
      { id: 'p1', name: 'mut', type: 'variation', level: 'point', strand: 1, start: 4, end: 5 },
      LIN,
    );
    expect(isPoint(ann)).toBe(true);
    expect(locationLength(ann)).toBe(1);
    expect(formatUiRange(ann)).toBe('5');
  });

  it('rejects a zero-length or two-base "point"', () => {
    expect(() => makeLocation(LOCATION_KINDS.SINGLE, [{ start: 4, end: 4 }])).toThrow();
    const two = normalizeLocation(
      { id: 'p2', name: 'x', type: 'variation', level: 'point', strand: 1, start: 4, end: 6 },
      LIN,
    );
    expect(isPoint(two)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. linear join keeps every segment — no min/max collapse
// ─────────────────────────────────────────────────────────────────────────────

describe('ANN-0A/4 — linear join(101..150,201..250)', () => {
  it('preserves two segments and does not span the intervening gap', () => {
    const parsed = parseGenBank(gbText({
      length: 500, topology: 'linear',
      features: [{ type: 'CDS', loc: 'join(101..150,201..250)', label: 'spliced' }],
    }));
    const { annotations } = importFeatures(parsed.features, parsed.length, 'genbank', { length: parsed.length, topology: 'linear' });
    const ann = annotations.find((a) => a.name === 'spliced');

    expect(ann.location.kind).toBe(LOCATION_KINDS.JOIN);
    expect(getSegments(ann)).toEqual([
      { start: 100, end: 150 },
      { start: 200, end: 250 },
    ]);
    // the biological length is the sum of exons, NOT the bounding span
    expect(locationLength(ann)).toBe(100);
    expect(wrapsOrigin(ann, LIN)).toBe(false);
    expect(formatUiRange(ann)).toBe('101–150, 201–250');
  });

  it('exports the join unchanged', () => {
    const ann = normalizeLocation(
      {
        id: 'j1', name: 'spliced', type: 'CDS', level: 'region', strand: 1,
        location: makeLocation(LOCATION_KINDS.JOIN, [
          { start: 100, end: 150 }, { start: 200, end: 250 },
        ]),
      },
      { length: 500, topology: 'linear' },
    );
    const gb = entryToGenbank(entryOf([ann], { length: 500, topology: 'linear' }));
    expect(gb).toMatch(/CDS\s+join\(101\.\.150,201\.\.250\)/);
  });

  it('order(...) stays order and does not become join', () => {
    const { location } = parseGenBankLocation('order(101..150,201..250)', LIN);
    expect(location.kind).toBe(LOCATION_KINDS.ORDER);
    expect(location.segments).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. circular origin-crossing join — the BG-028 core defect
// ─────────────────────────────────────────────────────────────────────────────

describe('ANN-0A/5 — circular join(4901..5000,1..30)', () => {
  const gbSrc = gbText({
    ...CIRC,
    features: [{ type: 'CDS', loc: 'join(4901..5000,1..30)', label: 'wrapCDS' }],
  });

  it('keeps both segments in 5′→3′ traversal order instead of collapsing to 1..5000', () => {
    const parsed = parseGenBank(gbSrc);
    const { annotations } = importFeatures(parsed.features, parsed.length, 'genbank', CIRC);
    const ann = annotations.find((a) => a.name === 'wrapCDS');

    expect(getSegments(ann)).toEqual([
      { start: 4900, end: 5000 },
      { start: 0, end: 30 },
    ]);
    // the regression this package exists to kill: 130 bp, not 5000 bp
    expect(locationLength(ann)).toBe(130);
    expect(wrapsOrigin(ann, CIRC)).toBe(true);
    expect(formatUiRange(ann)).toBe('4901–5000, 1–30');
  });

  it('projects the wrap sentinel, never a molecule-wide min..max span', () => {
    const parsed = parseGenBank(gbSrc);
    const { annotations } = importFeatures(parsed.features, parsed.length, 'genbank', CIRC);
    const ann = annotations.find((a) => a.name === 'wrapCDS');

    // The scalar compatibility projection is what every pre-ANN-0A consumer
    // still reads. For a wrap it must be { first.start, last.end } — i.e.
    // `end <= start` — and NOT the bounding span, which would report this
    // 130 bp CDS as covering the entire 5000 bp plasmid (BG-028).
    expect(locationSpan(ann)).toEqual({ start: 4900, end: 30 });
    expect(ann.start).toBe(4900);
    expect(ann.end).toBe(30);
    expect(ann.end).toBeLessThanOrEqual(ann.start);
  });

  it('survives export → re-import with identical segments', () => {
    const parsed = parseGenBank(gbSrc);
    const imported = importFeatures(parsed.features, parsed.length, 'genbank', CIRC).annotations;

    const gb = entryToGenbank(entryOf(imported, CIRC));
    expect(gb).toMatch(/CDS\s+join\(4901\.\.5000,1\.\.30\)/);

    const reparsed = parseGenBank(gb);
    const back = importFeatures(reparsed.features, reparsed.length, 'genbank', CIRC)
      .annotations.find((a) => a.name === 'wrapCDS');

    expect(getSegments(back)).toEqual([
      { start: 4900, end: 5000 },
      { start: 0, end: 30 },
    ]);
    expect(locationLength(back)).toBe(130);
  });

  it('wrapsOrigin is derived, not a stored independent truth', () => {
    const ann = normalizeLocation(
      {
        id: 'w1', name: 'wrapCDS', type: 'CDS', level: 'region', strand: 1,
        location: makeLocation(LOCATION_KINDS.JOIN, [
          { start: 4900, end: 5000 }, { start: 0, end: 30 },
        ]),
      },
      CIRC,
    );
    expect(wrapsOrigin(ann, CIRC)).toBe(true);
    // identical segments on a LINEAR document are not a wrap — they are illegal
    expect(() => normalizeLocation(ann, LIN)).toThrow(/circular|topolog/i);
  });

  it('accepts the SnapGene/API feature shape (bare `segments` array)', () => {
    // gui/api/server.py emits 0-based half-open segments alongside the scalar
    // projection; importFeatures must lift them into a canonical location
    // rather than trusting the scalar alone.
    const apiFeature = {
      type: 'CDS',
      name: 'wrapCDS',
      start: 4900,
      end: 30,
      strand: 1,
      location_kind: 'join',
      segments: [{ start: 4900, end: 5000 }, { start: 0, end: 30 }],
      qualifiers: { label: 'wrapCDS' },
    };
    const { annotations } = importFeatures([apiFeature], 5000, 'snapgene', CIRC);
    const ann = annotations.find((a) => a.name === 'wrapCDS');

    expect(getSegments(ann)).toEqual([
      { start: 4900, end: 5000 },
      { start: 0, end: 30 },
    ]);
    expect(locationLength(ann)).toBe(130);
    expect(wrapsOrigin(ann, CIRC)).toBe(true);
    expect(locationSpan(ann)).toEqual({ start: 4900, end: 30 });
  });

  it('allows at most one high→low transition', () => {
    expect(() => makeLocation(LOCATION_KINDS.JOIN, [
      { start: 4000, end: 4100 },
      { start: 0, end: 30 },
      { start: 100, end: 200 },
      { start: 10, end: 20 },
    ])).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. legacy scalar annotations migrate without identity change
// ─────────────────────────────────────────────────────────────────────────────

describe('ANN-0A/6 — legacy scalar migration', () => {
  it('becomes a single-segment location, keeps its id, and does not mutate the input', () => {
    const legacy = Object.freeze({
      id: 'stable-id-123', name: 'AmpR', type: 'CDS', level: 'region',
      strand: 1, start: 100, end: 400,
    });
    const next = normalizeLocation(legacy, CIRC);

    expect(next.id).toBe('stable-id-123');
    expect(next.location.kind).toBe(LOCATION_KINDS.SINGLE);
    expect(getSegments(next)).toEqual([{ start: 100, end: 400 }]);
    expect(locationSpan(next)).toEqual({ start: 100, end: 400 });
    // input untouched — no in-place mutation, no invented id
    expect(legacy.location).toBeUndefined();
  });

  it('is idempotent — normalizing twice changes nothing', () => {
    const once = normalizeLocation(
      { id: 'x', name: 'n', type: 'CDS', level: 'region', strand: 1, start: 10, end: 20 },
      CIRC,
    );
    const twice = normalizeLocation(once, CIRC);
    expect(getSegments(twice)).toEqual(getSegments(once));
    expect(twice.id).toBe('x');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. metadata edits must never flatten a compound location
// ─────────────────────────────────────────────────────────────────────────────

describe('ANN-0A/7 — name/color edit on a compound annotation', () => {
  const compound = normalizeLocation(
    {
      id: 'c1', name: 'wrapCDS', type: 'CDS', level: 'region', strand: 1, color: '#aaa',
      location: makeLocation(LOCATION_KINDS.JOIN, [
        { start: 4900, end: 5000 }, { start: 0, end: 30 },
      ]),
    },
    CIRC,
  );

  it('renaming keeps both segments', () => {
    const next = updateAnnotation([compound], 'c1', { name: 'renamed' }, CIRC.length, CIRC);
    const ann = next.find((a) => a.name === 'renamed');
    expect(ann).toBeTruthy();
    expect(getSegments(ann)).toEqual([
      { start: 4900, end: 5000 },
      { start: 0, end: 30 },
    ]);
    expect(locationLength(ann)).toBe(130);
  });

  it('recolouring keeps both segments', () => {
    const next = updateAnnotation([compound], 'c1', { color: '#123456' }, CIRC.length, CIRC);
    const ann = next[0];
    expect(ann.color).toBe('#123456');
    expect(getSegments(ann)).toEqual([
      { start: 4900, end: 5000 },
      { start: 0, end: 30 },
    ]);
  });

  it('refuses a destructive scalar coordinate edit instead of silently flattening', () => {
    expect(() =>
      updateAnnotation([compound], 'c1', { start: 10, end: 20 }, CIRC.length, CIRC),
    ).toThrow(/compound|segment/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. rotate-origin keeps one biological feature and its children
// ─────────────────────────────────────────────────────────────────────────────

describe('ANN-0A/8 — rotate origin across a feature', () => {
  it('produces one wrapping feature, preserving id and child regionId links', () => {
    const seq = seqOf(5000);
    const parent = normalizeLocation(
      { id: 'gene1', name: 'wrapGene', type: 'CDS', level: 'region', strand: 1, start: 100, end: 400 },
      CIRC,
    );
    const child = normalizeLocation(
      { id: 'dom1', name: 'domain', type: 'domain', level: 'detail', strand: 1, start: 150, end: 200, regionId: 'gene1' },
      CIRC,
    );

    // cut at 1-based 300 → the parent [100,400) straddles the new origin
    const out = rotateOriginToPosition(seq, [parent, child], 300, { topology: 'circular' });

    const genes = out.annotations.filter((a) => a.name === 'wrapGene');
    expect(genes).toHaveLength(1);
    const gene = genes[0];
    expect(gene.id).toBe('gene1');
    expect(locationLength(gene)).toBe(300);
    expect(wrapsOrigin(gene, CIRC)).toBe(true);
    // cut k = 299: old 100 → 100 - 299 + 5000 = 4801; old 400 → 101
    expect(getSegments(gene)).toEqual([
      { start: 4801, end: 5000 },
      { start: 0, end: 101 },
    ]);

    // the child must still point at a live parent
    const dom = out.annotations.find((a) => a.name === 'domain');
    expect(dom.regionId).toBe('gene1');
    expect(out.annotations.some((a) => a.id === dom.regionId)).toBe(true);
  });

  it('a feature entirely after the cut is simply shifted', () => {
    const seq = seqOf(5000);
    const ann = normalizeLocation(
      { id: 'a1', name: 'late', type: 'CDS', level: 'region', strand: 1, start: 1000, end: 1100 },
      CIRC,
    );
    const out = rotateOriginToPosition(seq, [ann], 300, { topology: 'circular' });
    const moved = out.annotations[0];
    expect(getSegments(moved)).toEqual([{ start: 701, end: 801 }]);
    expect(moved.id).toBe('a1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. malformed input is rejected, never repaired by guesswork
// ─────────────────────────────────────────────────────────────────────────────

describe('ANN-0A/9 — malformed and incoherent locations', () => {
  it('rejects a reversed scalar range rather than swapping the ends', () => {
    expect(() => normalizeLocation(
      { id: 'bad1', name: 'x', type: 'CDS', level: 'region', strand: 1, start: 400, end: 100 },
      LIN,
    )).toThrow();
  });

  it('rejects coordinates outside the document', () => {
    expect(() => normalizeLocation(
      { id: 'bad2', name: 'x', type: 'CDS', level: 'region', strand: 1, start: 0, end: 6000 },
      LIN,
    )).toThrow();
    expect(() => normalizeLocation(
      { id: 'bad3', name: 'x', type: 'CDS', level: 'region', strand: 1, start: -5, end: 10 },
      LIN,
    )).toThrow();
  });

  it('rejects non-integer coordinates', () => {
    expect(() => makeLocation(LOCATION_KINDS.SINGLE, [{ start: 1.5, end: 10 }])).toThrow();
    expect(() => makeLocation(LOCATION_KINDS.SINGLE, [{ start: 0, end: Number.NaN }])).toThrow();
  });

  it('rejects an incoherent dual representation (location disagrees with scalar projection)', () => {
    expect(() => normalizeLocation(
      {
        id: 'bad4', name: 'x', type: 'CDS', level: 'region', strand: 1,
        start: 0, end: 50, // claims [0,50)
        location: makeLocation(LOCATION_KINDS.SINGLE, [{ start: 100, end: 400 }]),
      },
      LIN,
    )).toThrow(/coheren|disagree|projection/i);
  });

  it('rejects an empty segment list', () => {
    expect(() => makeLocation(LOCATION_KINDS.JOIN, [])).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. API ingress — kind and traversal order are the backend's, not guessed
// ─────────────────────────────────────────────────────────────────────────────

describe('ANN-0A/11 — ingress honours location_kind and topology', () => {
  function apiFeature(over = {}) {
    return {
      type: 'CDS', name: 'probe', strand: 1,
      qualifiers: { label: 'probe' },
      ...over,
    };
  }

  it('keeps `order` as order instead of coercing every multi-segment to join', () => {
    const { annotations } = importFeatures([apiFeature({
      start: 100, end: 250, location_kind: 'order',
      segments: [{ start: 100, end: 150 }, { start: 200, end: 250 }],
    })], 500, 'genbank', LIN);
    const ann = annotations.find((a) => a.name === 'probe');
    expect(ann.location.kind).toBe(LOCATION_KINDS.ORDER);
  });

  // Fail-closed is per FEATURE, not per document: the bad location never enters
  // the model, but one malformed feature must not make the whole file
  // unopenable. `rejected` carries the reason so the UI can surface it.
  it('rejects a high→low segment list on a LINEAR document', () => {
    const out = importFeatures([apiFeature({
      start: 4900, end: 30, location_kind: 'join',
      segments: [{ start: 4900, end: 5000 }, { start: 0, end: 30 }],
    })], 5000, 'genbank', LIN);
    expect(out.annotations).toHaveLength(0);
    expect(out.rejected).toHaveLength(1);
    expect(out.rejected[0].reason).toMatch(/circular|topolog/i);
  });

  it('imports the valid features even when one is rejected', () => {
    const out = importFeatures([
      apiFeature({ name: 'good', start: 100, end: 200 }),
      apiFeature({
        name: 'bad', start: 4900, end: 30, location_kind: 'join',
        segments: [{ start: 4900, end: 5000 }, { start: 0, end: 30 }],
      }),
    ], 5000, 'genbank', LIN);
    expect(out.annotations.map((a) => a.name)).toEqual(['good']);
    expect(out.rejected.map((r) => r.name)).toEqual(['bad']);
  });

  it('accepts the same list on a CIRCULAR document', () => {
    const { annotations } = importFeatures([apiFeature({
      start: 4900, end: 30, location_kind: 'join',
      segments: [{ start: 4900, end: 5000 }, { start: 0, end: 30 }],
    })], 5000, 'genbank', CIRC);
    expect(getSegments(annotations[0])).toEqual([
      { start: 4900, end: 5000 }, { start: 0, end: 30 },
    ]);
  });

  it('does not sort or "repair" a multi-descent segment list', () => {
    const out = importFeatures([apiFeature({
      start: 0, end: 500, location_kind: 'join',
      segments: [
        { start: 400, end: 410 }, { start: 1, end: 10 },
        { start: 100, end: 110 }, { start: 5, end: 8 },
      ],
    })], 500, 'genbank', CIRC);
    expect(out.annotations).toHaveLength(0);
    expect(out.rejected).toHaveLength(1);
  });

  it('rejects a feature that lies outside the sequence instead of clamping it', () => {
    const out = importFeatures(
      [apiFeature({ name: 'oob', start: 99, end: 400 })],
      60, 'genbank', { length: 60, topology: 'linear' },
    );
    expect(out.annotations).toHaveLength(0);
    expect(out.rejected[0].reason).toMatch(/exceeds sequence length/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. every write path emits a coherent location
// ─────────────────────────────────────────────────────────────────────────────

describe('ANN-0A/12 — write-path coherence', () => {
  /** Every produced annotation must satisfy projection === scalar fields. */
  function expectCoherent(ann) {
    expect(locationSpan(ann)).toEqual({ start: ann.start, end: ann.end });
    expect(getSegments(ann).length).toBeGreaterThan(0);
  }

  it('createAnnotation accepts a supplied location without pre-validating a scalar range', () => {
    const ann = createAnnotation({
      id: 'c1', name: 'wrap', type: 'CDS', level: 'region', strand: 1,
      location: makeLocation(LOCATION_KINDS.JOIN, [
        { start: 4900, end: 5000 }, { start: 0, end: 30 },
      ]),
    }, CIRC.length, CIRC);
    expect(getSegments(ann)).toEqual([
      { start: 4900, end: 5000 }, { start: 0, end: 30 },
    ]);
    expectCoherent(ann);
  });

  it('createAnnotation rejects a location that contradicts a supplied scalar', () => {
    expect(() => createAnnotation({
      id: 'c2', name: 'x', type: 'CDS', level: 'region', strand: 1,
      start: 0, end: 50,
      location: makeLocation(LOCATION_KINDS.SINGLE, [{ start: 100, end: 400 }]),
    }, LIN.length, LIN)).toThrow(/coheren|disagree|projection/i);
  });

  it('createAnnotation refuses to mint a circular wrap on a linear document', () => {
    expect(() => createAnnotation({
      id: 'c3', name: 'x', type: 'CDS', level: 'region', strand: 1,
      location: makeLocation(LOCATION_KINDS.JOIN, [
        { start: 400, end: 500 }, { start: 0, end: 30 },
      ]),
    }, LIN.length, LIN)).toThrow(/circular|topolog/i);
  });

  it('a point annotation must be exactly one base', () => {
    expect(() => createAnnotation({
      id: 'p1', name: 'snp', type: 'variation', level: 'point', strand: 1,
      start: 4, end: 6,
    }, LIN.length, LIN)).toThrow(/point/i);

    const ok = createAnnotation({
      id: 'p2', name: 'snp', type: 'variation', level: 'point', strand: 1,
      start: 4, end: 5,
    }, LIN.length, LIN);
    expect(isPoint(ok)).toBe(true);
    expectCoherent(ok);
  });

  it('splitAnnotation gives every child its own single location', () => {
    const parent = normalizeLocation(
      { id: 'r1', name: 'gene', type: 'CDS', level: 'region', strand: 1, start: 100, end: 400 },
      LIN,
    );
    const out = splitAnnotation([parent], 'r1', 3, LIN.length, LIN);
    expect(out).toHaveLength(3);
    for (const child of out) {
      expect(child.location.kind).toBe(LOCATION_KINDS.SINGLE);
      expect(getSegments(child)).toHaveLength(1);
      expectCoherent(child);
    }
    expect(getSegments(out[0])[0]).toEqual({ start: 100, end: 200 });
    expect(getSegments(out[2])[0]).toEqual({ start: 300, end: 400 });
  });

  it('mergeAnnotations builds a new location instead of inheriting the dominant one', () => {
    const a = normalizeLocation(
      { id: 'a', name: 'big', type: 'CDS', level: 'region', strand: 1, start: 100, end: 300 },
      LIN,
    );
    const b = normalizeLocation(
      { id: 'b', name: 'small', type: 'CDS', level: 'region', strand: 1, start: 300, end: 350 },
      LIN,
    );
    const out = mergeAnnotations([a, b], 'a', 'b', LIN);
    expect(out).toHaveLength(1);
    const merged = out[0];
    expect(getSegments(merged)).toEqual([{ start: 100, end: 350 }]);
    expectCoherent(merged);
  });

  it('split and merge refuse to act on a compound annotation', () => {
    const compound = normalizeLocation(
      {
        id: 'cmp', name: 'wrap', type: 'CDS', level: 'region', strand: 1,
        location: makeLocation(LOCATION_KINDS.JOIN, [
          { start: 4900, end: 5000 }, { start: 0, end: 30 },
        ]),
      },
      CIRC,
    );
    const other = normalizeLocation(
      { id: 'nb', name: 'nb', type: 'CDS', level: 'region', strand: 1, start: 30, end: 90 },
      CIRC,
    );
    expect(() => splitAnnotation([compound], 'cmp', 2, CIRC.length, CIRC))
      .toThrow(/compound|segment/i);
    expect(() => mergeAnnotations([compound, other], 'cmp', 'nb', CIRC))
      .toThrow(/compound|segment/i);
  });

  it('synthetic intron details from import carry a canonical location', () => {
    const parsed = parseGenBank(gbText({
      length: 500, topology: 'linear',
      features: [{ type: 'CDS', loc: 'join(101..150,201..250)', label: 'spliced' }],
    }));
    const { annotations } = importFeatures(parsed.features, parsed.length, 'genbank', LIN);
    const intron = annotations.find((a) => a.type === 'intron');
    expect(intron).toBeTruthy();
    expectCoherent(intron);
    expect(getSegments(intron)).toEqual([{ start: 150, end: 200 }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. existing simple scenarios keep their meaning
// ─────────────────────────────────────────────────────────────────────────────

describe('ANN-0A/10 — no semantic drift for ordinary annotations', () => {
  it('region / detail / point imports keep the coordinates they had before ANN-0A', () => {
    const parsed = parseGenBank(gbText({
      length: 1000, topology: 'circular',
      features: [
        { type: 'CDS', loc: '146..469', label: 'lacZa' },
        { type: 'sig_peptide', loc: '146..200', label: 'signal' },
        { type: 'variation', loc: '600', label: 'snp' },
      ],
    }));
    const { annotations } = importFeatures(parsed.features, parsed.length, 'genbank', CIRC);

    const region = annotations.find((a) => a.name === 'lacZa');
    expect(region.level).toBe('region');
    expect(region.start).toBe(145);
    expect(region.end).toBe(469);
    expect(locationSpan(region)).toEqual({ start: 145, end: 469 });

    const detail = annotations.find((a) => a.name === 'signal');
    expect(detail.level).toBe('detail');
    expect(detail.start).toBe(145);
    expect(detail.end).toBe(200);
    expect(detail.regionId).toBe(region.id);

    const point = annotations.find((a) => a.name === 'snp');
    expect(point.level).toBe('point');
    expect(point.start).toBe(599);
    expect(point.end).toBe(600);
    expect(isPoint(point)).toBe(true);
  });

  it('every imported annotation carries a coherent location and a stable id', () => {
    const parsed = parseGenBank(gbText({
      length: 1000, topology: 'circular',
      features: [
        { type: 'CDS', loc: '146..469', label: 'lacZa' },
        { type: 'promoter', loc: 'complement(50..100)', label: 'pLac' },
      ],
    }));
    const { annotations } = importFeatures(parsed.features, parsed.length, 'genbank', CIRC);
    for (const a of annotations) {
      expect(typeof a.id).toBe('string');
      expect(a.id.length).toBeGreaterThan(0);
      expect(getSegments(a).length).toBeGreaterThan(0);
      expect(locationSpan(a)).toEqual({ start: a.start, end: a.end });
    }
  });
});
