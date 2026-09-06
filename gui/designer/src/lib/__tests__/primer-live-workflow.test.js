/**
 * primer-live-workflow — PRIMER-LIVE-1 roots 2 and 3 (pure layer).
 *
 * A primer made from a selection must exist IMMEDIATELY and must remember
 * where it was made: which molecule, which version of it, which strand, which
 * half-open interval, and what it actually anneals to in its own orientation.
 * Without that anchor a later edit turns the coordinate into a confident lie.
 *
 * The lab-match side answers a different question — «do I already have this
 * tube?» — dynamically, as the selection moves, and only from real stock.
 */
import { describe, it, expect } from 'vitest';
import {
  buildPrimerFromSelection,
  matchLabPrimersForSelection,
  evaluatePrimerWarnings,
  anchorState,
} from '../primer-live-workflow';
import { PRIMER_SCOPE_GLOBAL, PRIMER_SCOPE_PROJECT } from '../primer-identity';
import { calcTm, checkHairpin, checkHomodimer } from '../../tm-calculator';

// Deliberately NOT repetitive at the landing sites, so a substitution test
// cannot accidentally match somewhere else.
const TPL = 'AAAACCCCGGGGTTTT'.repeat(4) // 64
  + 'ACGTTGCAACGTTGCA' // 16 @64..80
  + 'TTTTGGGGCCCCAAAA'.repeat(4); // 64 → total 144

const stock = (over = {}) => ({
  id: over.id || 'g1',
  name: over.name || 'stock',
  scope: PRIMER_SCOPE_GLOBAL,
  status: 'received',
  tail: '',
  ...over,
});

describe('buildPrimerFromSelection', () => {
  it('anchors a forward primer to the document, version and interval', () => {
    const p = buildPrimerFromSelection({
      template: TPL, topology: 'circular', start: 64, end: 80,
      direction: 'forward', name: 'fwd', id: 'p-f',
      entryId: 'e1', documentHash: 'h1',
    });
    expect(p.sequence).toBe('ACGTTGCAACGTTGCA');
    expect(p.direction).toBe('forward');
    expect(p.sites).toHaveLength(1);
    const [site] = p.sites;
    expect(site.target).toEqual({ entryId: 'e1', resourceHash: 'h1', topology: 'circular' });
    expect(site.location.segments).toEqual([{ start: 64, end: 80 }]);
    expect(site.strand).toBe(1);
    expect(site.annealedSequence).toBe('ACGTTGCAACGTTGCA');
  });

  it('stores the reverse primer in ITS OWN orientation, on the minus strand', () => {
    const p = buildPrimerFromSelection({
      template: TPL, topology: 'circular', start: 64, end: 80,
      direction: 'reverse', id: 'p-r', entryId: 'e1', documentHash: 'h1',
    });
    // reverse-complement of ACGTTGCAACGTTGCA
    expect(p.sites[0].annealedSequence).toBe('TGCAACGTTGCAACGT');
    expect(p.sites[0].strand).toBe(-1);
    expect(p.sequence).toBe('TGCAACGTTGCAACGT');
  });

  it('keeps a 5-prime tail out of the landing but inside the oligo', () => {
    const p = buildPrimerFromSelection({
      template: TPL, topology: 'linear', start: 64, end: 80,
      direction: 'forward', tail: 'gaattc', id: 'p-t',
      entryId: 'e1', documentHash: 'h1',
    });
    expect(p.tail).toBe('GAATTC');
    expect(p.bindingSequence).toBe('ACGTTGCAACGTTGCA');
    expect(p.sequence).toBe('GAATTCACGTTGCAACGTTGCA');
    expect(p.sites[0].location.segments).toEqual([{ start: 64, end: 80 }]);
  });

  it('is a project record — making a primer never stocks the freezer', () => {
    const p = buildPrimerFromSelection({
      template: TPL, topology: 'linear', start: 64, end: 80, id: 'p-s',
      entryId: 'e1', documentHash: 'h1',
    });
    expect(p.scope).toBe(PRIMER_SCOPE_PROJECT);
    expect(p.status).not.toBe('received');
  });
});

describe('matchLabPrimersForSelection', () => {
  const selection = { start: 64, end: 80 };
  const top = 'ACGTTGCAACGTTGCA';
  const rc = 'TGCAACGTTGCAACGT';

  it('returns an exact match for a received oligo on either orientation', () => {
    const records = [
      stock({ id: 'fwd', sequence: top, bindingSequence: top, direction: 'forward' }),
      stock({ id: 'rev', sequence: rc, bindingSequence: rc, direction: 'reverse' }),
    ];
    const got = matchLabPrimersForSelection({
      template: TPL, topology: 'circular', ...selection, records,
    });
    expect(got.exact.map((m) => m.record.id).sort()).toEqual(['fwd', 'rev']);
    expect(got.exact.find((m) => m.record.id === 'fwd').orientation).toBe('forward');
    expect(got.exact.find((m) => m.record.id === 'rev').orientation).toBe('reverse');
  });

  it('never offers a project record or an ordered oligo as stock', () => {
    const records = [
      stock({ id: 'proj', scope: PRIMER_SCOPE_PROJECT, sequence: top, bindingSequence: top }),
      stock({ id: 'ord', status: 'ordered', sequence: top, bindingSequence: top }),
    ];
    const got = matchLabPrimersForSelection({
      template: TPL, topology: 'circular', ...selection, records,
    });
    expect(got.exact).toEqual([]);
    expect(got.substitutions).toEqual([]);
  });

  it('ranks a same-length mismatching oligo BELOW exact, as advisory', () => {
    const oneOff = `${top.slice(0, 5)}A${top.slice(6)}`;
    expect(oneOff).not.toBe(top);
    const records = [
      stock({ id: 'sub', sequence: oneOff, bindingSequence: oneOff }),
      stock({ id: 'ex', sequence: top, bindingSequence: top }),
    ];
    const got = matchLabPrimersForSelection({
      template: TPL, topology: 'circular', ...selection, records,
    });
    expect(got.exact.map((m) => m.record.id)).toEqual(['ex']);
    expect(got.substitutions.map((m) => m.record.id)).toEqual(['sub']);
    expect(got.substitutions[0].mismatches).toBe(1);
    expect(got.substitutions[0].advisory).toBe(true);
  });

  it('does not offer an oligo of a different length as a substitution', () => {
    const shorter = top.slice(0, 12);
    const records = [stock({ id: 'short', sequence: shorter, bindingSequence: shorter })];
    const got = matchLabPrimersForSelection({
      template: TPL, topology: 'circular', ...selection, records,
    });
    expect(got.exact).toEqual([]);
    expect(got.substitutions).toEqual([]);
  });

  it('lists a palindromic site ONCE, not once per orientation', () => {
    // A palindrome reads the same on both strands, so both orientations are the
    // same physical answer; showing it twice invents a second option.
    const pal = 'GAATTC';
    const palTpl = `${'AAAA'.repeat(10)}${pal}${'TTTT'.repeat(10)}`;
    const records = [stock({ id: 'pal', sequence: pal, bindingSequence: pal })];
    const got = matchLabPrimersForSelection({
      template: palTpl, topology: 'circular', start: 40, end: 46, records,
    });
    expect(got.exact).toHaveLength(1);
  });

  it('changes its answer when the selection moves', () => {
    const records = [stock({ id: 'ex', sequence: top, bindingSequence: top })];
    const here = matchLabPrimersForSelection({
      template: TPL, topology: 'circular', start: 64, end: 80, records,
    });
    const elsewhere = matchLabPrimersForSelection({
      template: TPL, topology: 'circular', start: 0, end: 16, records,
    });
    expect(here.exact).toHaveLength(1);
    expect(elsewhere.exact).toHaveLength(0);
  });
});

describe('warnings are visible, never a veto', () => {
  it('reports a deliberate substitution with its position and keeps the oligo whole', () => {
    const mutated = `${'ACGTTGCA'}T${'CGTTGCA'}`; // one base changed at index 8
    const record = {
      id: 'm', scope: PRIMER_SCOPE_PROJECT, sequence: mutated, bindingSequence: mutated,
      direction: 'forward',
      sites: [{
        id: 's', target: { entryId: 'e1', resourceHash: 'h1', topology: 'circular' },
        location: { kind: 'single', segments: [{ start: 64, end: 80 }] },
        strand: 1, annealedSequence: mutated, tail: '',
      }],
    };
    const warnings = evaluatePrimerWarnings(record, {
      template: TPL, topology: 'circular', entryId: 'e1', documentHash: 'h1',
    });
    const mm = warnings.find((w) => w.code === 'mismatch');
    expect(mm).toBeTruthy();
    expect(mm.positions).toContain(72);
    expect(mm.blocking).toBe(false);
    // The record's own oligo is never trimmed to fit the template.
    expect(record.sequence).toBe(mutated);
  });

  it('reports a large delta-Tm without blocking', () => {
    // The terminal 12-nt seed is intentionally unique. A periodic ACGT repeat
    // has several valid 3′ endpoints with different paired lengths, for which
    // strict thermodynamics must withhold one arbitrary scalar Tm.
    const primerSequence = 'GCGCGCATGCCGTTACGCGC';
    const warnings = evaluatePrimerWarnings(
      { id: 'a', sequence: primerSequence, bindingSequence: primerSequence },
      { template: `${primerSequence}${TPL}`, topology: 'linear', partnerSequence: 'ATATATATAT' },
    );
    const d = warnings.find((w) => w.code === 'delta-tm');
    expect(d).toBeTruthy();
    expect(d.blocking).toBe(false);
  });
});

describe('anchorState', () => {
  const anchored = (over = {}) => ({
    id: 'p', sequence: 'ACGTTGCAACGTTGCA', bindingSequence: 'ACGTTGCAACGTTGCA',
    direction: 'forward',
    sites: [{
      id: 's',
      target: { entryId: 'e1', resourceHash: 'h1', topology: 'circular' },
      location: { kind: 'single', segments: [{ start: 64, end: 80 }] },
      strand: 1, annealedSequence: 'ACGTTGCAACGTTGCA', tail: '',
      ...over,
    }],
  });

  it('is live on the document it was made against', () => {
    expect(anchorState(anchored(), {
      template: TPL, entryId: 'e1', documentHash: 'h1', topology: 'circular',
    })).toBe('live');
  });

  it('goes stale when the document version changes', () => {
    expect(anchorState(anchored(), {
      template: TPL, entryId: 'e1', documentHash: 'h2', topology: 'circular',
    })).toBe('stale');
  });

  it('goes stale when the topology is flipped', () => {
    expect(anchorState(anchored(), {
      template: TPL, entryId: 'e1', documentHash: 'h1', topology: 'linear',
    })).toBe('stale');
  });

  it('a stale anchor hides the landing but never deletes the record', () => {
    const rec = anchored();
    expect(anchorState(rec, {
      template: TPL, entryId: 'e-other', documentHash: 'h1', topology: 'circular',
    })).toBe('stale');
    expect(rec.sequence).toBe('ACGTTGCAACGTTGCA');
    expect(rec.sites).toHaveLength(1);
  });
});

/**
 * PRIMER-LIVE-1 correction — the warnings have to be the SPECIFIC ones, and
 * they have to come from the checks the rest of the app already uses. A test
 * that only asserts "some text appeared" would pass while showing the wrong
 * warning, or the right warning computed a second, disagreeing way.
 */
describe('specific, production-sourced warnings', () => {
  const codes = (w) => w.map((x) => x.code).sort();

  it('names a hairpin, using the shared checkHairpin geometry', () => {
    // Stem GGGGCC…GGCCCC with a 4 nt loop — a real stem/loop, not a guess.
    const seq = 'GGGGCCAAAAGGCCCC';
    expect(checkHairpin(seq)).toBe(true); // the production check agrees
    const w = evaluatePrimerWarnings(
      { id: 'h', sequence: seq, bindingSequence: seq },
      { template: TPL, topology: 'linear' },
    );
    expect(codes(w)).toContain('hairpin');
    expect(w.find((x) => x.code === 'hairpin').blocking).toBe(false);
  });

  it('names a homodimer, using the shared checkHomodimer rule', () => {
    const seq = 'ACGTTGCAACGTTGCA';
    expect(checkHomodimer(seq)).toBe(true);
    const w = evaluatePrimerWarnings(
      { id: 'd', sequence: seq, bindingSequence: seq },
      { template: TPL, topology: 'linear' },
    );
    expect(codes(w)).toContain('self-dimer');
  });

  it('stays quiet about a hairpin when there is none', () => {
    const seq = 'AAAAAAAAAAAAAAAA';
    expect(checkHairpin(seq)).toBe(false);
    const w = evaluatePrimerWarnings(
      { id: 'q', sequence: seq, bindingSequence: seq },
      { template: TPL, topology: 'linear' },
    );
    expect(codes(w)).not.toContain('hairpin');
  });

  it('never marks any of them blocking', () => {
    const w = evaluatePrimerWarnings(
      { id: 'x', sequence: 'GGGGCCAAAAGGCCCC', bindingSequence: 'GGGGCCAAAAGGCCCC' },
      { template: TPL, topology: 'linear', partnerSequence: 'ATATATATAT' },
    );
    expect(w.length).toBeGreaterThan(0);
    expect(w.every((x) => x.blocking === false)).toBe(true);
  });
});

describe('lab matching answers exact vs sameBinding through classifyLabCandidate', () => {
  const top = 'ACGTTGCAACGTTGCA';

  it('an oligo with a different 5-prime tail is NOT exact', () => {
    const records = [stock({
      id: 'tailed', sequence: `GAATTC${top}`, bindingSequence: top, tail: 'GAATTC',
    })];
    const got = matchLabPrimersForSelection({
      template: TPL, topology: 'circular', start: 64, end: 80, records,
    });
    expect(got.exact).toEqual([]);
    expect(got.sameBinding.map((m) => m.record.id)).toEqual(['tailed']);
    expect(got.sameBinding[0].tailDiffers).toBe(true);
  });

  it('an oligo carrying a modification is NOT exact either', () => {
    const records = [stock({
      id: 'phos', sequence: top, bindingSequence: top, modifications: ['5-phos'],
    })];
    const got = matchLabPrimersForSelection({
      template: TPL, topology: 'circular', start: 64, end: 80, records,
    });
    expect(got.exact).toEqual([]);
    expect(got.sameBinding.map((m) => m.record.id)).toEqual(['phos']);
    expect(got.sameBinding[0].modificationsDiffer).toBe(true);
  });

  it('the bare oligo with no tail and no mods IS exact', () => {
    const records = [stock({ id: 'plain', sequence: top, bindingSequence: top })];
    const got = matchLabPrimersForSelection({
      template: TPL, topology: 'circular', start: 64, end: 80, records,
    });
    expect(got.exact.map((m) => m.record.id)).toEqual(['plain']);
    expect(got.sameBinding).toEqual([]);
  });
});

/**
 * PRIMER-LIVE-1B — a substitution made AFTER the primer exists.
 *
 * `editPrimerInPlace` deliberately preserves `sites` and rewrites
 * `bindingSequence`: an ordinary edit must not re-anchor the landing. That is
 * the right storage rule, and it is exactly why the mismatch check could not
 * be asked of `site.annealedSequence` — the anchor holds the stretch as it was
 * when the primer was declared, so comparing that snapshot to the template can
 * only ever answer «identical». A base the biolog changed on purpose stayed
 * invisible on every surface.
 *
 * The question the warning answers is: does THIS oligo, as it is written now,
 * match the template under the landing it is anchored to?
 */
describe('a mismatch is measured against the oligo as it is NOW', () => {
  const ANCHOR = 'ACGTTGCAACGTTGCA'; // TPL[64..80)

  const anchored = (over = {}, siteOver = {}) => ({
    id: 'edited',
    scope: PRIMER_SCOPE_PROJECT,
    direction: 'forward',
    sequence: ANCHOR,
    bindingSequence: ANCHOR,
    tail: '',
    sites: [{
      id: 's',
      target: { entryId: 'e1', resourceHash: 'h1', topology: 'circular' },
      location: { kind: 'single', segments: [{ start: 64, end: 80 }] },
      strand: 1,
      annealedSequence: ANCHOR,
      tail: '',
      ...siteOver,
    }],
    ...over,
  });

  const ctx = {
    template: TPL, topology: 'circular', entryId: 'e1', documentHash: 'h1',
  };
  const mismatchOf = (rec) => evaluatePrimerWarnings(rec, ctx)
    .find((w) => w.code === 'mismatch');

  it('reports a one-base substitution while the anchor stays untouched', () => {
    const mutated = 'ACGTTGCATCGTTGCA'; // ANCHOR with index 8 A→T
    const rec = anchored({ sequence: mutated, bindingSequence: mutated });
    // The anchor is deliberately the pre-edit snapshot — that is what an
    // in-place edit leaves behind, and the warning must not depend on it.
    expect(rec.sites[0].annealedSequence).toBe(ANCHOR);
    const mm = mismatchOf(rec);
    expect(mm).toBeTruthy();
    expect(mm.positions).toEqual([72]); // 64 + 8, template coordinates
    expect(mm.blocking).toBe(false);
    expect(rec.bindingSequence).toBe(mutated); // never trimmed to fit
  });

  it('reports it in template coordinates for a minus-strand landing', () => {
    // A reverse primer stores its binding 5'->3' on its OWN strand. Keep the
    // changed base internal: index 0 is its biological 5′ edge and may instead
    // become an unpaired prefix under sequence-first placement.
    const mutated = 'TACAACGTTGCAACGT'; // rc(ANCHOR) with index 1 G→A
    const rec = anchored(
      { direction: 'reverse', sequence: mutated, bindingSequence: mutated },
      { strand: -1, annealedSequence: 'TGCAACGTTGCAACGT' },
    );
    const mm = mismatchOf(rec);
    expect(mm).toBeTruthy();
    expect(mm.positions).toEqual([78]); // reverse index 1 → 64 + 14
  });

  it('stays quiet while the oligo still matches its landing', () => {
    // Negative control for the check itself: the same code path, an unedited
    // record, and no mismatch invented. (Other non-blocking warnings may fire;
    // this asserts the mismatch channel specifically.)
    expect(mismatchOf(anchored())).toBeUndefined();
  });

  it('does not invent a mismatch for an exact biological 5-prime trim', () => {
    const shorter = ANCHOR.slice(1);
    expect(mismatchOf(anchored({ sequence: shorter, bindingSequence: shorter })))
      .toBeUndefined();
  });

  it('measures every landing of a primer that binds more than once', () => {
    const mutated = 'ACGTTGCATCGTTGCA';
    const rec = anchored({ sequence: mutated, bindingSequence: mutated });
    rec.sites.push({
      id: 's2',
      target: { entryId: 'e1', resourceHash: 'h1', topology: 'circular' },
      location: { kind: 'single', segments: [{ start: 0, end: 16 }] },
      strand: 1,
      annealedSequence: ANCHOR,
      tail: '',
    });
    const all = evaluatePrimerWarnings(rec, ctx).filter((w) => w.code === 'mismatch');
    expect(all).toHaveLength(2);
    expect(all[0].positions).toEqual([72]);
    expect(all[1].positions.length).toBeGreaterThan(0); // TPL[0..16) is a different stretch
  });
});

/**
 * SEQ-VIS-1 contract A — warnings and Tm read the EFFECTIVE binding.
 *
 * The live record stores `AAAAAAAA` + a 31-nt anchor inside one long
 * `bindingSequence`. Compared whole against a 31-nt landing that is a length
 * mismatch, so the check bailed out as «an indel, not per-base» and the primer
 * silently lost its mismatch reporting altogether. The eight A's are a 5'
 * overhang: they do not anneal, so they are not part of the comparison, and
 * they are not part of the Tm either.
 */
describe('SEQ-VIS-1 — the anchored binding is what gets checked', () => {
  const ANCHOR = 'ACGTTGCAACGTTGCAACGTTGCAACGTTGC';   // 31 nt
  const POLY_A = 'AAAAAAAA';
  const TPL2 = `${'T'.repeat(10)}${ANCHOR}${'T'.repeat(59)}`; // anchor at [10,41)
  const DOC = 'sha256:seqvis-v1';

  const legacy = (over = {}) => ({
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
      tail: '',
    }],
    ...over,
  });

  const ctx = { template: TPL2, topology: 'linear', entryId: 'E1', documentHash: DOC };
  const mismatchOf = (rec) => evaluatePrimerWarnings(rec, ctx)
    .find((w) => w.code === 'mismatch');

  it('reports a substitution inside the landing even behind a poly-A overhang', () => {
    const mut = `${ANCHOR.slice(0, 30)}A`; // last base of the landing swapped
    const mm = mismatchOf(legacy({
      bindingSequence: `${POLY_A}${mut}`, sequence: `${POLY_A}${mut}`,
    }));
    expect(mm).toBeTruthy();
    // 10 + 30. The eight overhang bases contribute NO positions: they never
    // touch the template, so they cannot disagree with it.
    expect(mm.positions).toEqual([40]);
  });

  it('stays quiet when only the overhang was added', () => {
    expect(mismatchOf(legacy())).toBeUndefined();
  });

  it('computes Tm from the annealing part alone', () => {
    // A short AT-rich landing with a long overhang: including the overhang
    // would quote a Tm for bases that never anneal.
    const SHORT = 'ATATATATATAT'; // 12 nt
    const tpl = `${'G'.repeat(6)}${SHORT}${'G'.repeat(6)}`; // landing at [6,18)
    const rec = {
      id: 'p2',
      direction: 'forward',
      tail: '',
      bindingSequence: `${POLY_A}${SHORT}`,
      sequence: `${POLY_A}${SHORT}`,
      sites: [{
        id: 's1',
        target: { entryId: 'E1', resourceHash: DOC, topology: 'linear' },
        location: { kind: 'single', segments: [{ start: 6, end: 18 }] },
        strand: 1,
        annealedSequence: SHORT,
        tail: '',
      }],
    };
    const w = evaluatePrimerWarnings(rec, {
      template: tpl, topology: 'linear', entryId: 'E1', documentHash: DOC,
    }).find((x) => x.code === 'low-tm');
    expect(w).toBeTruthy();
    expect(w.tm).toBe(Math.round(calcTm(SHORT) * 10) / 10);
    // and NOT the Tm of the whole stored oligo
    expect(w.tm).not.toBe(Math.round(calcTm(`${POLY_A}${SHORT}`) * 10) / 10);
  });

  it('projects a shorter oligo by its physical 3-prime end', () => {
    const short = ANCHOR.slice(2);
    expect(mismatchOf(legacy({ bindingSequence: short, sequence: short }))).toBeUndefined();
  });

  it('does not emit mismatch coordinates or Tm from a foreign raw anchor', () => {
    const short = 'ATATATATATAT';
    const mutated = 'TTATATATATAT';
    const rec = {
      id: 'foreign', direction: 'forward', tail: '',
      bindingSequence: mutated, sequence: mutated,
      sites: [{
        id: 'foreign-site',
        target: { entryId: 'OTHER', resourceHash: DOC, topology: 'linear' },
        location: { kind: 'single', segments: [{ start: 6, end: 18 }] },
        strand: 1, annealedSequence: short, tail: '',
      }],
    };
    const warnings = evaluatePrimerWarnings(rec, {
      template: `${'G'.repeat(6)}${short}${'G'.repeat(6)}`,
      topology: 'linear', entryId: 'E1', documentHash: DOC,
      partnerSequence: 'GCGCGCGCGCGCGCGC',
    });
    expect(warnings.filter((w) => w.code === 'mismatch')).toEqual([]);
    expect(warnings.filter((w) => w.code === 'low-tm' || w.code === 'delta-tm')).toEqual([]);
  });

  it('withholds confident Tm for invalid or heterogeneous anchors independent of site order', () => {
    const full = 'GGATATATATATAT';
    const template = `${full.slice(-12)}${'C'.repeat(8)}${full.slice(-10)}${'C'.repeat(8)}`;
    const site = (id, start, length) => ({
      id,
      target: { entryId: 'E1', resourceHash: DOC, topology: 'linear' },
      location: { kind: 'single', segments: [{ start, end: start + length }] },
      strand: 1,
      annealedSequence: full.slice(-length),
      tail: '',
    });
    const sites = [site('long', 0, 12), site('short', 20, 10)];
    const thermal = (record) => evaluatePrimerWarnings(record, {
      template, topology: 'linear', entryId: 'E1', documentHash: DOC,
      partnerSequence: 'GCGCGCGCGCGCGCGC',
    }).filter((w) => w.code === 'low-tm' || w.code === 'delta-tm');

    const heterogeneous = {
      id: 'heterogeneous', direction: 'forward', tail: '',
      bindingSequence: full, sequence: full, sites,
    };
    expect(thermal(heterogeneous)).toEqual([]);
    expect(thermal({ ...heterogeneous, sites: [...sites].reverse() })).toEqual([]);

    const invalid = {
      ...heterogeneous,
      tail: 'GAATTC',
      bindingSequence: full.slice(-10),
      sequence: `GAATTC${full.slice(-10)}`,
      sites: [sites[0]],
    };
    expect(thermal(invalid)).toEqual([]);
  });
});

describe('PRIMER-INDEL-1 — aligned edits and thermodynamic honesty', () => {
  const ANCHOR = 'ACGTCAGTACGATCGA';
  const PREFIX = 'TTTTT';
  const DOC = 'sha256:primer-indel-v1';
  const template = `${PREFIX}${ANCHOR}${'T'.repeat(20)}`;
  const site = {
    id: 's1',
    target: { entryId: 'E1', resourceHash: DOC, topology: 'linear' },
    location: { kind: 'single', segments: [{ start: PREFIX.length, end: PREFIX.length + ANCHOR.length }] },
    strand: 1,
    annealedSequence: ANCHOR,
    tail: null,
  };
  const warningsFor = (body) => evaluatePrimerWarnings({
    id: 'p1', direction: 'forward', bindingModel: 'aligned-v1',
    tail: '', bindingSequence: body, sequence: body, sites: [site],
  }, {
    template, topology: 'linear', entryId: 'E1', documentHash: DOC,
    partnerSequence: 'GCGCGCGCGCGCGCGC',
  });

  it('surfaces an insertion at its template boundary and withholds scalar Tm', () => {
    const body = `${ANCHOR.slice(0, 6)}G${ANCHOR.slice(6)}`;
    const warnings = warningsFor(body);
    expect(warnings).toContainEqual(expect.objectContaining({
      code: 'insertion', count: 1, positions: [PREFIX.length + 6], blocking: false,
    }));
    expect(warnings).toContainEqual(expect.objectContaining({
      code: 'gapped-tm-unknown', tm: null, blocking: false,
    }));
    expect(warnings.filter((w) => w.code === 'low-tm' || w.code === 'delta-tm')).toEqual([]);
  });

  it('surfaces a deletion at the deleted template base', () => {
    const body = `${ANCHOR.slice(0, 6)}${ANCHOR.slice(7)}`;
    expect(warningsFor(body)).toContainEqual(expect.objectContaining({
      code: 'deletion', count: 1, positions: [PREFIX.length + 6], blocking: false,
    }));
  });

  it('marks a physical 3-prime gap high severity but never blocks Save', () => {
    const warning = warningsFor(`${ANCHOR}G`).find((w) => w.code === 'three-prime-gap');
    expect(warning).toMatchObject({ severity: 'high', blocking: false });
  });

  it('marks a terminal 3-prime substitution as zero complementary terminal bases', () => {
    const terminal = `${ANCHOR.slice(0, -1)}${ANCHOR.at(-1) === 'A' ? 'C' : 'A'}`;
    expect(warningsFor(terminal)).toContainEqual(expect.objectContaining({
      code: 'three-prime-short', length: 0, severity: 'high', blocking: false,
    }));
  });

  it('marks an exact 1–9 nt landing as a high non-blocking 3-prime warning', () => {
    expect(warningsFor(ANCHOR.slice(-9))).toContainEqual(expect.objectContaining({
      code: 'three-prime-short', length: 9, severity: 'high', blocking: false,
    }));
  });

  it('does not emit the short-anchor warning after 10 exact physical 3-prime matches', () => {
    expect(warningsFor(ANCHOR.slice(-10)).filter((w) => w.code === 'three-prime-short'))
      .toEqual([]);
  });

  it('marks a computed exact 7-nt landing with the same 3-prime warning', () => {
    const binding = 'ATGCGTA';
    const warnings = evaluatePrimerWarnings({
      id: 'computed-short', direction: 'forward',
      tail: '', bindingSequence: binding, sequence: binding, sites: [],
    }, {
      template: `GG${binding}CC`, topology: 'linear',
      entryId: 'E1', documentHash: DOC,
    });
    expect(warnings).toContainEqual(expect.objectContaining({
      code: 'three-prime-short', length: 7, severity: 'high', blocking: false,
    }));
  });

  it('treats a noncanonical leading base as an unpaired 5-prime prefix', () => {
    const body = 'NAAAAAAAAAAAAAAA';
    const warnings = evaluatePrimerWarnings({
      id: 'noncanonical', direction: 'forward', bindingModel: 'aligned-v1',
      tail: '', bindingSequence: body, sequence: body,
      sites: [{
        id: 'noncanonical-site',
        target: { entryId: 'E1', resourceHash: DOC, topology: 'linear' },
        location: { kind: 'single', segments: [{ start: 2, end: 2 + body.length }] },
        strand: 1, annealedSequence: body, tail: '',
      }],
    }, {
      template: `GG${body}CC`, topology: 'linear', entryId: 'E1', documentHash: DOC,
      partnerSequence: 'GCGCGCGCGCGCGCGC',
    });

    expect(warnings.some((warning) => warning.code === 'duplex-tm-unknown')).toBe(false);
    expect(warnings).toContainEqual(expect.objectContaining({
      code: 'low-tm', blocking: false,
    }));
  });

  it('uses the noncanonical thermodynamic reason even when N is an alignment X', () => {
    const body = `${ANCHOR.slice(0, 4)}N${ANCHOR.slice(5)}`;
    const warnings = warningsFor(body);
    expect(warnings).toContainEqual(expect.objectContaining({
      code: 'duplex-tm-unknown', tm: null, reason: 'noncanonical-base', blocking: false,
    }));
    expect(warnings.filter((warning) => warning.code === 'gapped-tm-unknown')).toEqual([]);
  });
});

describe('full physical oligo drives structural warnings', () => {
  it('includes a legacy tailSequence when sequence is omitted', () => {
    const tail = 'GCGC';
    const binding = 'AAAAGCGC';
    const full = `${tail}${binding}`;
    expect(checkHairpin(full)).toBe(true);
    expect(checkHairpin(binding)).toBe(false);

    expect(evaluatePrimerWarnings({
      id: 'legacy-structure', direction: 'forward',
      tailSequence: tail, bindingSequence: binding, sites: [],
    })).toContainEqual(expect.objectContaining({ code: 'hairpin', blocking: false }));
  });
});
