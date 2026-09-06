/**
 * primer-site-projection.test.js — ANN-0L.
 *
 * The circular map, the linear map and the SequenceView must place a primer in
 * the SAME place. This is the one projection they all read, so its rules are
 * asserted here directly rather than three times over through three renderers.
 *
 * The rule that matters most: a site the FILE declared is a fact, and a fact is
 * not re-derived. Scanning the template with `indexOf` was how a single declared
 * site on a repetitive molecule turned into a handful of phantom bindings.
 */
import { describe, it, expect } from 'vitest';
import { projectPrimerSites, projectPrimerPool } from '../primer-site-projection';
import { segmentAngles, fivePrimeAnchor, tailBox } from '../primer-site-geometry';

// ANN-0M root C - a site names the molecule AND the version of it it was
// declared against. The positive ingress path proves these come from a real
// commit (see __tests__/ann0m-primer-vertical.test.jsx); here they are stated
// so the projector's own rules can be exercised directly.
const HASH = 'sha256:doc-v1';
const site = (over = {}) => ({
  id: 's1',
  sourceIndex: 0,
  target: { entryId: 'E1', resourceHash: HASH, topology: 'circular' },
  location: { kind: 'single', segments: [{ start: 10, end: 22 }] },
  strand: 1,
  annealedSequence: 'ACGTACGTACGT',
  tail: null,
  sourceVisibility: 'shown',
  ...over,
});

// A deliberately repetitive template: 'ACGTACGTACGT' occurs many times over.
const REPEAT = 'ACGT'.repeat(20); // 80 nt

describe('projectPrimerSites — a source site is authoritative', () => {
  it('does not multiply one declared site on a repetitive template', () => {
    const p = { id: 'p1', sequence: null, sites: [site()] };
    const out = projectPrimerSites(p, { template: REPEAT, entryId: 'E1', documentHash: HASH, topology: 'circular' });
    expect(out).toHaveLength(1);
    expect(out[0].segments).toEqual([{ start: 10, end: 22 }]);
    expect(out[0].evidence).toBe('source');
  });

  it('draws a primer once per declared site', () => {
    const p = {
      id: 'p1',
      sites: [
        site({ id: 'a', location: { kind: 'single', segments: [{ start: 4, end: 16 }] } }),
        site({ id: 'b', location: { kind: 'single', segments: [{ start: 40, end: 52 }] } }),
      ],
    };
    const out = projectPrimerSites(p, { template: REPEAT, entryId: 'E1', documentHash: HASH, topology: 'circular' });
    expect(out.map((o) => o.siteId)).toEqual(['a', 'b']);
    // distinct logical identities → two selectable glyphs, not one
    expect(new Set(out.map((o) => o.key)).size).toBe(2);
  });

  it('keeps an origin-crossing site as ONE occurrence of two segments', () => {
    const p = {
      id: 'p1',
      sites: [site({
        location: { kind: 'join', segments: [{ start: 74, end: 80 }, { start: 0, end: 6 }] },
      })],
    };
    // C2 - the caller must say the molecule is circular; a wrap on a linear
    // one is not a fact this projection will repeat.
    const [occ] = projectPrimerSites(p, { template: REPEAT, entryId: 'E1', documentHash: HASH, topology: 'circular' });
    expect(occ.segments).toHaveLength(2);
    expect(occ.wrapsOrigin).toBe(true);
    // one key ⇒ one selection, one label, one logical binding
    expect(occ.key).toBe('p1#s1');
  });

  it('keeps a hidden source site, marked rather than dropped', () => {
    const p = { id: 'p1', sites: [site({ sourceVisibility: 'hidden' })] };
    const [occ] = projectPrimerSites(p, { template: REPEAT, entryId: 'E1', documentHash: HASH, topology: 'circular' });
    expect(occ.sourceVisibility).toBe('hidden');
  });

  it('fails closed on an out-of-range site without losing the record', () => {
    const p = { id: 'p1', sites: [site({ location: { kind: 'single', segments: [{ start: 500, end: 512 }] } })] };
    // the glyph is withheld — old coordinates are not drawn on a molecule they
    // do not describe — but nothing here deletes or mutates the record itself
    expect(projectPrimerSites(p, { template: REPEAT, entryId: 'E1', documentHash: HASH, topology: 'circular' })).toEqual([]);
    expect(p.sites).toHaveLength(1);
  });

  it('never treats a site declared against ANOTHER molecule as a fact here', () => {
    const p = { id: 'p1', sequence: null, sites: [site({ target: { entryId: 'OTHER' } })] };
    const out = projectPrimerSites(p, { template: REPEAT, entryId: 'E1', documentHash: HASH, topology: 'circular' });
    // The declared coordinates belong to a different molecule and must not be
    // drawn here as source truth. What the oligo anneals to is still knowable,
    // so the exact fallback may report matches — clearly marked as computed.
    expect(out.some((o) => o.evidence === 'source')).toBe(false);
    expect(out.every((o) => o.evidence === 'computed')).toBe(true);
    expect(out.every((o) => o.siteId === null)).toBe(true);
  });

  it('yields nothing for a primer with no site and no sequence', () => {
    const p = { id: 'p1', sequence: null, sites: [] };
    expect(projectPrimerSites(p, { template: REPEAT, entryId: 'E1', documentHash: HASH, topology: 'circular' })).toEqual([]);
  });
});

describe('projectPrimerSites — computed fallback', () => {
  it('locates a primer that declares no site, marked `computed`', () => {
    const p = { id: 'p1', sequence: 'ACGTACGTACGT', sites: [] };
    const out = projectPrimerSites(p, { template: REPEAT, entryId: 'E1', documentHash: HASH, topology: 'circular' });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((o) => o.evidence === 'computed')).toBe(true);
    expect(out.every((o) => o.siteId === null)).toBe(true);
  });

  it('never runs when a source site exists for this molecule', () => {
    // sequence occurs all over REPEAT, yet the declared site wins outright
    const p = { id: 'p1', sequence: 'ACGTACGTACGT', sites: [site()] };
    const out = projectPrimerSites(p, { template: REPEAT, entryId: 'E1', documentHash: HASH, topology: 'circular' });
    expect(out).toHaveLength(1);
    expect(out[0].evidence).toBe('source');
  });

  it('does not invent a tail for a computed hit', () => {
    const p = { id: 'p1', sequence: 'ACGTACGTACGT', sites: [] };
    const [occ] = projectPrimerSites(p, { template: REPEAT, entryId: 'E1', documentHash: HASH, topology: 'circular' });
    expect(occ.tail).toBe(null);
  });

  it('carries an exact alignment for a computed 7-nt landing', () => {
    const binding = 'ATGCGTA';
    const [occ] = projectPrimerSites(
      { id: 'short', direction: 'forward', sequence: binding, sites: [] },
      { template: `GG${binding}CC`, topology: 'linear' },
    );
    expect(occ.alignment).toMatchObject({
      query: binding,
      target: binding,
      editDistance: 0,
      threePrimeMatchLength: 7,
    });
  });
});

describe('projectPrimerPool', () => {
  it('preserves input order and keeps id-less rows distinct', () => {
    const a = { name: 'a', sequence: 'ACGTACGTACGT', sites: [] };
    const b = { name: 'b', sequence: 'ACGTACGTACGT', sites: [] };
    const out = projectPrimerPool([a, b], { template: 'ACGTACGTACGT', topology: 'linear' });
    expect(out).toHaveLength(2);
    // two different records must not collapse onto one key just because
    // neither carries an id
    expect(out[0].key).not.toBe(out[1].key);
  });
});

describe('primer-site-geometry', () => {
  it('anchors a forward tail at the start and a reverse tail at the end', () => {
    const fwd = { segments: [{ start: 10, end: 22 }], strand: 1, tail: 'GGGG' };
    const rev = { segments: [{ start: 10, end: 22 }], strand: -1, tail: 'GGGG' };
    const toX = (bp) => bp * 2;
    // forward: the tail sits BEFORE the span and does not lengthen it
    expect(tailBox(fwd, toX, 6)).toEqual({ x: 20 - 6, width: 6 });
    // reverse: after it
    expect(tailBox(rev, toX, 6)).toEqual({ x: 44, width: 6 });
  });

  it('draws no tail box when the tail is unknown or proven absent', () => {
    const base = { segments: [{ start: 0, end: 10 }], strand: 1 };
    expect(tailBox({ ...base, tail: null }, (bp) => bp, 6)).toBe(null);
    expect(tailBox({ ...base, tail: '' }, (bp) => bp, 6)).toBe(null);
  });

  it('refuses to guess an anchor for an unknown strand', () => {
    expect(fivePrimeAnchor({ segments: [{ start: 0, end: 10 }], strand: null })).toBe(null);
  });

  it('maps a bp span onto the circle', () => {
    const { a0, a1 } = segmentAngles({ start: 0, end: 50 }, 100);
    expect(a0).toBeCloseTo(0, 6);
    expect(a1).toBeCloseTo(Math.PI, 6);
  });
});

// ===========================================================================
// ANN-0L CORRECTION C2 - the projection is a trust boundary for THIS document.
//
// A source site is a fact about one version of one molecule. Shown against a
// different entry, a different topology, or an edited buffer it is no longer
// evidence - it is a stale coordinate wearing the authority of the file. Every
// case below must withhold the glyph while keeping the record.
//
// Identity comes from the existing model (`payload.resourceHash`, recomputed by
// librarySlice on every edit); this adds no second owner.
// ===========================================================================
describe('ANN-0L C2 - stale and mismatched documents', () => {
  const TEMPLATE = 'ACGT'.repeat(20); // 80 nt
  const HASH = 'sha256:aaaa';
  const OTHER_HASH = 'sha256:bbbb';

  const targeted = (over = {}) => ({
    id: 's1', sourceIndex: 0,
    target: { entryId: 'E1', resourceHash: HASH },
    location: { kind: 'single', segments: [{ start: 10, end: 22 }] },
    strand: 1, annealedSequence: 'ACGTACGTACGT',
    tail: null, sourceVisibility: 'shown',
    ...over,
  });
  // no full oligo => nothing for the computed fallback to find, so any
  // occurrence that appears can only have come from the source site
  const rec = (site) => ({ id: 'p1', sequence: null, sites: [site] });

  const ctx = (over = {}) => ({
    template: TEMPLATE, entryId: 'E1', documentHash: HASH, topology: 'circular', ...over,
  });

  it('confirms the site on the document it was declared against', () => {
    const [occ] = projectPrimerSites(rec(targeted()), ctx());
    expect(occ.evidence).toBe('source');
  });

  it('withholds it on a DIFFERENT entry', () => {
    const out = projectPrimerSites(rec(targeted()), ctx({ entryId: 'E2', documentHash: OTHER_HASH }));
    expect(out.some((o) => o.evidence === 'source')).toBe(false);
  });

  it('withholds it when the caller did not say which document this is', () => {
    // fail closed: an unidentified host must not make a targeted site "fit all"
    const out = projectPrimerSites(rec(targeted()), ctx({ entryId: null, documentHash: null }));
    expect(out.some((o) => o.evidence === 'source')).toBe(false);
  });

  it('withholds it after a same-length edit', () => {
    // same entry, same length - only the content changed, so only the hash can
    // tell us the coordinates no longer describe this molecule
    const out = projectPrimerSites(rec(targeted()), ctx({ documentHash: OTHER_HASH }));
    expect(out.some((o) => o.evidence === 'source')).toBe(false);
  });

  it('withholds it after a topology change', () => {
    const out = projectPrimerSites(rec(targeted()), ctx({ topology: 'linear', documentHash: OTHER_HASH }));
    expect(out.some((o) => o.evidence === 'source')).toBe(false);
  });

  it('withholds it on an unsaved buffer that has no identity yet', () => {
    const out = projectPrimerSites(rec(targeted()), ctx({ documentHash: null }));
    expect(out.some((o) => o.evidence === 'source')).toBe(false);
  });

  it('withholds an inverted linear span (high to low)', () => {
    const site = targeted({ location: { kind: 'single', segments: [{ start: 40, end: 12 }] } });
    expect(projectPrimerSites(rec(site), ctx({ topology: 'linear' }))).toEqual([]);
  });

  it('withholds an out-of-range span', () => {
    const site = targeted({ location: { kind: 'single', segments: [{ start: 70, end: 500 }] } });
    expect(projectPrimerSites(rec(site), ctx())).toEqual([]);
  });

  it('withholds a non-integer or negative coordinate', () => {
    const bad = targeted({ location: { kind: 'single', segments: [{ start: -4, end: 10 }] } });
    const frac = targeted({ location: { kind: 'single', segments: [{ start: 1.5, end: 10 }] } });
    expect(projectPrimerSites(rec(bad), ctx())).toEqual([]);
    expect(projectPrimerSites(rec(frac), ctx())).toEqual([]);
  });

  it('allows a wrap on a circular molecule but not on a linear one', () => {
    const wrap = targeted({
      location: { kind: 'join', segments: [{ start: 74, end: 80 }, { start: 0, end: 6 }] },
    });
    expect(projectPrimerSites(rec(wrap), ctx())).toHaveLength(1);
    // a linear molecule has no origin to cross - the site cannot be true here
    expect(projectPrimerSites(rec(wrap), ctx({ topology: 'linear' }))).toEqual([]);
  });

  it('keeps the record itself in every one of these cases', () => {
    const r = rec(targeted());
    projectPrimerSites(r, ctx({ entryId: 'E2' }));
    expect(r.sites).toHaveLength(1);
    expect(r.id).toBe('p1');
  });
});

describe('ANN-0L C2 - the computed fallback keeps its own facts', () => {
  const TEMPLATE = 'TTTT' + 'ACGTACGTACGT' + 'TTTT'; // one exact locus at 4..16

  it('does not manufacture the opposite strand against a stated direction', () => {
    // a palindromic-by-repeat oligo matches both ways; a record that says it is
    // a forward primer must not be redrawn as a reverse one
    const p = { id: 'p1', sequence: 'ACGTACGTACGT', direction: 'forward', sites: [] };
    const out = projectPrimerSites(p, { template: TEMPLATE, entryId: 'E1', documentHash: 'h', topology: 'linear' });
    expect(out.every((o) => o.strand !== -1)).toBe(true);
  });

  it('carries a known legacy tail onto the computed occurrence', () => {
    const p = { id: 'p1', sequence: 'GGGGGACGTACGTACGT', bindingSequence: 'ACGTACGTACGT', tail: 'GGGGG', sites: [] };
    const [occ] = projectPrimerSites(p, { template: TEMPLATE, entryId: 'E1', documentHash: 'h', topology: 'linear' });
    expect(occ.tail).toBe('GGGGG');
  });

  it('finds an exact locus that crosses the origin of a circular molecule', () => {
    const ring = 'ACGTACG' + 'T'.repeat(60) + 'TACGT'; // 'TACGTACGTACG' wraps
    const p = { id: 'p1', sequence: 'TACGTACGTACG', sites: [] };
    const out = projectPrimerSites(p, { template: ring, entryId: 'E1', documentHash: 'h', topology: 'circular' });
    const wrapped = out.find((o) => o.segments.length === 2);
    expect(wrapped).toBeTruthy();
    expect(wrapped.evidence).toBe('computed');
  });
});

/**
 * SEQ-VIS-1 contract A — the projection carries the CURRENT oligo.
 *
 * The site owns geometry and history; the record owns what is in the tube. The
 * projection was handing renderers `site.tail` and `site.annealedSequence`
 * verbatim, so a tail added after the site was declared never reached the
 * glyph, and the live pE-SUMOpro Kan record — eight A's stored inside a long
 * `bindingSequence`, `tail:''` — drew only its 31-nt historical snapshot.
 *
 * The source 3′ endpoint stays fixed. The 5′ footprint may grow when the current
 * physical oligo has a positive-scoring local landing upstream of the saved
 * anchor; neither the record nor site helper field can veto that biology.
 */
describe('SEQ-VIS-1 — source occurrences report the effective tail and binding', () => {
  const ANCHOR = 'ACGTTGCAACGTTGCAACGTTGCAACGTTGC';   // 31 nt
  const POLY_A = 'AAAAAAAA';                           // 8 nt
  const TPL = `${'T'.repeat(10)}${ANCHOR}${'T'.repeat(59)}`; // 100 nt, anchor at [10,41)
  const DOC = 'sha256:seqvis-v1';

  const anchored = (over = {}, siteOver = {}) => ({
    id: 'p1',
    direction: 'forward',
    tail: '',
    bindingSequence: `${POLY_A}${ANCHOR}`,
    sequence: `${POLY_A}${ANCHOR}`,
    sites: [{
      id: 's1',
      target: { entryId: 'E1', resourceHash: DOC, topology: 'linear' },
      location: { kind: 'single', segments: [{ start: 10, end: 41 }] },
      strand: 1,
      annealedSequence: ANCHOR,
      tail: null,
      ...siteOver,
    }],
    ...over,
  });

  const ctx = (over = {}) => ({
    template: TPL, entryId: 'E1', documentHash: DOC, topology: 'linear', ...over,
  });

  it('surfaces the legacy poly-A prefix as a tail without moving the footprint', () => {
    const [occ] = projectPrimerSites(anchored(), ctx());
    expect(occ.evidence).toBe('source');
    expect(occ.tail).toBe(POLY_A);
    expect(occ.annealedSequence).toBe(ANCHOR);
    // The overhang is unbound: the genomic footprint is exactly the site's.
    expect(occ.segments).toEqual([{ start: 10, end: 41 }]);
  });

  it('ignores both helper tails and locally aligns the current physical oligo', () => {
    const [occ] = projectPrimerSites(
      anchored({ tail: 'GAATTC', bindingSequence: ANCHOR, sequence: `GAATTC${ANCHOR}` },
        { tail: 'TTTTTT' }),
      ctx(),
    );
    expect(occ.tail).toBe('GAA');
    expect(occ.annealedSequence).toBe(`TTC${ANCHOR}`);
    expect(occ.segments).toEqual([{ start: 7, end: 41 }]);
    expect(occ.alignment.counts).toEqual({ M: 33, X: 1, I: 0, D: 0 });
  });

  it('keeps a substitution visible in the binding letters', () => {
    const mut = `${ANCHOR.slice(0, 30)}A`;
    const [occ] = projectPrimerSites(
      anchored({ bindingSequence: `${POLY_A}${mut}`, sequence: `${POLY_A}${mut}` }),
      ctx(),
    );
    expect(occ.tail).toBe(POLY_A);
    expect(occ.annealedSequence).toBe(mut);
  });

  it('gives every landing of a multi-site primer the same tail, once each', () => {
    const rec = anchored();
    rec.sites.push({
      id: 's2',
      target: { entryId: 'E1', resourceHash: DOC, topology: 'linear' },
      location: { kind: 'single', segments: [{ start: 60, end: 91 }] },
      strand: 1,
      annealedSequence: ANCHOR,
      tail: null,
    });
    // Both declared sites must describe the same CURRENT biology. The previous
    // fixture put the second site over unrelated T-only sequence, so copying
    // one helper tail to both landings merely hid their different alignments.
    const repeatedTemplate = `${TPL.slice(0, 60)}${ANCHOR}${TPL.slice(91)}`;
    const occs = projectPrimerSites(rec, ctx({ template: repeatedTemplate }));
    expect(occs).toHaveLength(2);
    expect(occs.map((o) => o.tail)).toEqual([POLY_A, POLY_A]);
  });

  it('an origin-crossing landing is still ONE occurrence carrying ONE tail', () => {
    const wrapAnneal = TPL.slice(95, 100) + TPL.slice(0, 26); // 31 nt across the origin
    const [occ, ...rest] = projectPrimerSites(
      anchored(
        { bindingSequence: `${POLY_A}${wrapAnneal}`, sequence: `${POLY_A}${wrapAnneal}` },
        {
          target: { entryId: 'E1', resourceHash: DOC, topology: 'circular' },
          location: { kind: 'split', segments: [{ start: 95, end: 100 }, { start: 0, end: 26 }] },
          annealedSequence: wrapAnneal,
        },
      ),
      ctx({ topology: 'circular' }),
    );
    expect(rest).toHaveLength(0);
    expect(occ.wrapsOrigin).toBe(true);
    expect(occ.segments).toEqual([{ start: 95, end: 100 }, { start: 0, end: 26 }]);
    expect(occ.tail).toBe(POLY_A);
  });

  it('invents nothing when the current oligo contradicts itself', () => {
    // `sequence` disagrees with tail + binding. Guessing a tail out of that is
    // how a rendering turns into a claim nobody made.
    const [occ] = projectPrimerSites(
      anchored({ tail: 'GAATTC', bindingSequence: ANCHOR, sequence: `TTTTTT${ANCHOR}` }),
      ctx(),
    );
    expect(occ.oligoStatus).toBe('conflict');
    expect(occ.tail).toBeNull();
    expect(occ.annealedSequence).toBeNull();
  });

  it('places a shorter legacy oligo by its biological 3-prime end', () => {
    const short = ANCHOR.slice(2);
    const [occ] = projectPrimerSites(
      anchored({ bindingSequence: short, sequence: short }),
      ctx(),
    );
    expect(occ.oligoStatus).toBe('ok');
    expect(occ.tail).toBeNull();
    expect(occ.annealedSequence).toBe(short);
    expect(occ.segments).toEqual([{ start: 12, end: 41 }]);
    expect(occ.alignment.counts).toMatchObject({ M: short.length, X: 0, I: 0, D: 0 });
  });

  it('projects an aligned-v1 insertion without lengthening source geometry', () => {
    const body = `${ANCHOR.slice(0, 12)}G${ANCHOR.slice(12)}`;
    const [occ] = projectPrimerSites(
      anchored({
        bindingModel: 'aligned-v1', tail: '', bindingSequence: body, sequence: body,
      }),
      ctx(),
    );
    expect(occ.oligoStatus).toBe('ok');
    expect(occ.annealedSequence).toBe(body);
    expect(occ.alignment.counts).toMatchObject({ I: 1, D: 0 });
    expect(occ.segments).toEqual([{ start: 10, end: 41 }]);
  });

  it('projects an aligned-v1 deletion across the full target footprint', () => {
    const body = `${ANCHOR.slice(0, 12)}${ANCHOR.slice(13)}`;
    const [occ] = projectPrimerSites(
      anchored({
        bindingModel: 'aligned-v1', tail: '', bindingSequence: body, sequence: body,
      }),
      ctx(),
    );
    expect(occ.alignment.counts).toMatchObject({ I: 0, D: 1 });
    expect(occ.alignment.targetSpan).toEqual({ start: 0, end: ANCHOR.length });
    expect(occ.segments).toEqual([{ start: 10, end: 41 }]);
  });

  it('fails closed instead of computing a hit from a contradictory current composition', () => {
    const rec = anchored({
      sites: [],
      tail: 'GAATTC',
      bindingSequence: ANCHOR,
      sequence: `TTTTTT${ANCHOR}`,
    });
    expect(projectPrimerSites(rec, ctx())).toEqual([]);
  });
});

describe('P5 — terminal trims project an effective landing', () => {
  const DOC = 'sha256:p5-projection';

  function alignedPrimer({
    template, anchor, binding, segments, strand = 1, topology = 'linear',
  }) {
    return {
      primer: {
        id: 'p5', direction: strand === -1 ? 'reverse' : 'forward',
        bindingModel: 'aligned-v1', tail: '', bindingSequence: binding,
        sequence: binding,
        sites: [{
          id: 'site',
          target: { entryId: 'E5', resourceHash: DOC, topology },
          location: { kind: segments.length > 1 ? 'join' : 'single', segments },
          strand, annealedSequence: anchor, tail: '',
        }],
      },
      context: {
        template, topology, entryId: 'E5', documentHash: DOC,
      },
    };
  }

  it('shrinks the forward 5-prime edge while preserving the confirmed 3-prime endpoint', () => {
    const anchor = 'CTCACTATAGGGGAATT';
    const { primer, context } = alignedPrimer({
      template: `AA${anchor}GG`, anchor, binding: anchor.slice(-10),
      segments: [{ start: 2, end: 2 + anchor.length }],
    });
    const [occurrence] = projectPrimerSites(primer, context);
    expect(occurrence.segments).toEqual([{ start: 9, end: 19 }]);
    expect(occurrence.alignment.target).toBe(anchor.slice(-10));
    expect(occurrence.alignment.targetSpan).toEqual({ start: 0, end: 10 });
    expect(occurrence.alignment.counts.D).toBe(0);
    expect(occurrence.alignment.threePrimeMatchLength).toBe(10);
  });

  it('keeps a reverse 5-prime trim anchored at 3-prime while crossing the origin', () => {
    const template = 'AAAACCCCGGGGTTTTACGT';
    const anchor = 'TTTTACGT'; // RC(template[16..20] + template[0..4])
    const { primer, context } = alignedPrimer({
      template, anchor, binding: anchor.slice(-6), strand: -1,
      topology: 'circular',
      segments: [{ start: 16, end: 20 }, { start: 0, end: 4 }],
    });
    const [occurrence] = projectPrimerSites(primer, context);
    expect(occurrence.segments).toEqual([
      { start: 16, end: 20 }, { start: 0, end: 2 },
    ]);
    expect(occurrence.wrapsOrigin).toBe(true);
    expect(occurrence.alignment.target).toBe(anchor.slice(-6));
    expect(occurrence.alignment.counts.D).toBe(0);
  });

  it('aligns a legacy source oligo to the CURRENT template, not its site snapshot', () => {
    const actual = 'ACGTCAGTACGATCGA';
    const internal = `${actual.slice(0, 7)}A${actual.slice(8)}`;
    const terminal = `${actual.slice(0, -1)}T`;
    const legacyOccurrence = (binding) => projectPrimerSites({
      id: 'legacy', direction: 'forward', tail: '',
      bindingSequence: binding, sequence: binding,
      sites: [{
        id: 'legacy-site',
        target: { entryId: 'E5', resourceHash: DOC, topology: 'linear' },
        location: { kind: 'single', segments: [{ start: 2, end: 2 + actual.length }] },
        strand: 1,
        // Historical data agrees with the oligo. The current molecule does not.
        annealedSequence: binding,
        tail: '',
      }],
    }, {
      template: `TT${actual}GG`, topology: 'linear', entryId: 'E5', documentHash: DOC,
    })[0];

    const internalHit = legacyOccurrence(internal);
    expect(internalHit.alignment.target).toBe(actual);
    expect(internalHit.alignment.counts.X).toBe(1);
    expect(internalHit.alignment.threePrimeMatchLength).toBeGreaterThan(0);

    const terminalHit = legacyOccurrence(terminal);
    expect(terminalHit.alignment.target).toBe(actual);
    expect(terminalHit.alignment.counts.X).toBe(1);
    expect(terminalHit.alignment.threePrimeMatchLength).toBe(0);
  });
});
