/**
 * primer-identity — PRIMER-LIVE-1 root 1.
 *
 * «Есть в лаборатории» is a claim about a physical tube, so it needs a rule
 * that cannot be satisfied by wishful thinking:
 *
 *   * only a personal/global inventory record with status `received` is stock;
 *     a project record, a donor `.bodge` record and an `ordered` oligo are not,
 *     no matter how convincingly they resemble one;
 *   * physical identity is the normalised FULL oligo plus its normalised
 *     chemical modifications — the same landing part with another 5' tail or
 *     another modification is a DIFFERENT tube;
 *   * a project record and a global record that happen to share a raw id are
 *     two different things and must not overwrite one another.
 */
import { describe, it, expect } from 'vitest';
import {
  PRIMER_SCOPE_GLOBAL,
  PRIMER_SCOPE_PROJECT,
  primerScopeOf,
  primerKey,
  makePrimerKey,
  parsePrimerKey,
  primerRawId,
  normalizeOligoSequence,
  normalizeModifications,
  physicalIdentityKey,
  isLabStock,
  classifyLabCandidate,
  resolvePhysicalOligo,
  resolveAnchoredOligo,
} from '../primer-identity';

const rec = (over = {}) => ({
  id: 'p1',
  name: 'oligo',
  sequence: 'ACGTACGTACGTAA',
  bindingSequence: 'ACGTACGTACGTAA',
  tail: '',
  scope: PRIMER_SCOPE_PROJECT,
  status: 'designed',
  ...over,
});

describe('resolvePhysicalOligo — helper fields do not define biology', () => {
  const core = 'ACGTCAGTACGATCGA';
  const prefix = 'CCCGATTACA';
  const sequence = `${prefix}${core}`;

  it.each([
    { tail: prefix, bindingSequence: core, sequence },
    { tail: 'CCC', bindingSequence: `GATTACA${core}`, sequence },
    { tail: '', bindingSequence: core, sequence },
    { tail: '', bindingSequence: sequence, sequence },
  ])('resolves one physical sequence from every legacy helper split', (record) => {
    const out = resolvePhysicalOligo(record, { anchor: core });
    expect(out.status).toBe('ok');
    expect(out.sequence).toBe(sequence);
    expect(`${out.tail}${out.binding}`).toBe(sequence);
  });

  it('still rejects contradictory physical fields', () => {
    expect(resolvePhysicalOligo({
      tail: 'CCC', bindingSequence: core, sequence: `TTT${core}`,
    }, { anchor: core }).status).toBe('conflict');
  });

  it('keeps a known physical oligo even when the helper binding field is empty', () => {
    expect(resolvePhysicalOligo({
      tail: prefix, bindingSequence: '', sequence,
    })).toEqual({
      tail: prefix,
      binding: core,
      sequence,
      status: 'ok',
    });
  });

  it('accepts the legacy tailSequence alias as part of the physical oligo', () => {
    expect(resolvePhysicalOligo({
      tailSequence: prefix, bindingSequence: core,
    }).sequence).toBe(sequence);
  });
});

describe('scope-qualified identity', () => {
  it('keys a global and a project record with the same raw id differently', () => {
    const project = rec({ id: 'shared', scope: PRIMER_SCOPE_PROJECT });
    const global = rec({ id: 'shared', scope: PRIMER_SCOPE_GLOBAL });
    expect(primerKey(project)).not.toBe(primerKey(global));
    // The project form stays the bare raw id — every existing consumer keys on
    // it, and a package that renames the common case breaks all of them.
    expect(primerKey(project)).toBe('shared');
    expect(primerKey(global)).toBe('global:shared');
  });

  it('round-trips a key back to its scope and raw id', () => {
    expect(parsePrimerKey('global:shared')).toEqual({
      scope: PRIMER_SCOPE_GLOBAL, rawId: 'shared',
    });
    expect(parsePrimerKey('shared')).toEqual({
      scope: PRIMER_SCOPE_PROJECT, rawId: 'shared',
    });
    expect(makePrimerKey(PRIMER_SCOPE_GLOBAL, 'x')).toBe('global:x');
  });

  it('defaults an unscoped legacy record to the project scope', () => {
    const legacy = { id: 'old', sequence: 'ACGT' };
    expect(primerScopeOf(legacy)).toBe(PRIMER_SCOPE_PROJECT);
    expect(primerKey(legacy)).toBe('old');
  });

  it('recovers the raw id from a record whose id is already qualified', () => {
    expect(primerRawId({ id: 'global:abc', scope: PRIMER_SCOPE_GLOBAL })).toBe('abc');
    expect(primerRawId({ id: 'abc', rawId: 'abc' })).toBe('abc');
  });
});

describe('lab stock', () => {
  it('accepts only a global record that has been received', () => {
    expect(isLabStock(rec({ scope: PRIMER_SCOPE_GLOBAL, status: 'received' }))).toBe(true);
  });

  it('refuses a project record even when it says received', () => {
    expect(isLabStock(rec({ scope: PRIMER_SCOPE_PROJECT, status: 'received' }))).toBe(false);
  });

  it('refuses an ordered global oligo — ordered is not in the freezer', () => {
    expect(isLabStock(rec({ scope: PRIMER_SCOPE_GLOBAL, status: 'ordered' }))).toBe(false);
  });

  it('refuses a record that arrived from a donor .bodge', () => {
    const donor = rec({
      scope: PRIMER_SCOPE_PROJECT,
      status: 'received',
      origin: { kind: 'file_import', format: 'bodge' },
    });
    expect(isLabStock(donor)).toBe(false);
  });
});

describe('physical identity', () => {
  it('normalises case and whitespace but not content', () => {
    expect(normalizeOligoSequence(' acgt acgt ')).toBe('ACGTACGT');
    expect(normalizeOligoSequence(null)).toBe('');
  });

  it('normalises modifications into a stable ordered set', () => {
    expect(normalizeModifications([' 5-phos ', 'BIOTIN', 'biotin']))
      .toEqual(['5-PHOS', 'BIOTIN']);
    expect(normalizeModifications(undefined)).toEqual([]);
  });

  it('is the full oligo plus its modifications', () => {
    const a = physicalIdentityKey({ sequence: 'ACGTAA', modifications: ['biotin'] });
    const b = physicalIdentityKey({ sequence: 'acgtaa', modifications: ['BIOTIN'] });
    expect(a).toBe(b);
  });

  it('separates two oligos that differ only by a modification', () => {
    const plain = physicalIdentityKey({ sequence: 'ACGTAA', modifications: [] });
    const phos = physicalIdentityKey({ sequence: 'ACGTAA', modifications: ['5-phos'] });
    expect(plain).not.toBe(phos);
  });

  it('has no identity for an oligo whose sequence is unknown', () => {
    expect(physicalIdentityKey({ sequence: null })).toBeNull();
  });
});

describe('classifyLabCandidate', () => {
  const query = { sequence: 'GGGGACGTACGTACGTAA', bindingSequence: 'ACGTACGTACGTAA', tail: 'GGGG' };

  it('reports an exact physical duplicate', () => {
    const kept = rec({
      scope: PRIMER_SCOPE_GLOBAL, status: 'received',
      sequence: 'GGGGACGTACGTACGTAA', bindingSequence: 'ACGTACGTACGTAA', tail: 'GGGG',
    });
    expect(classifyLabCandidate(query, kept).kind).toBe('exact');
  });

  it('reports a same-binding oligo with another tail as a DIFFERENT oligo', () => {
    const other = rec({
      scope: PRIMER_SCOPE_GLOBAL, status: 'received',
      sequence: 'TTTTACGTACGTACGTAA', bindingSequence: 'ACGTACGTACGTAA', tail: 'TTTT',
    });
    const got = classifyLabCandidate(query, other);
    expect(got.kind).toBe('same-binding');
  });

  it('reports a same-binding oligo carrying a modification as a DIFFERENT oligo', () => {
    const modified = rec({
      scope: PRIMER_SCOPE_GLOBAL, status: 'received',
      sequence: 'GGGGACGTACGTACGTAA', bindingSequence: 'ACGTACGTACGTAA', tail: 'GGGG',
      modifications: ['5-phos'],
    });
    expect(classifyLabCandidate(query, modified).kind).toBe('same-binding');
  });

  it('reports nothing for an unrelated oligo', () => {
    const unrelated = rec({
      scope: PRIMER_SCOPE_GLOBAL, status: 'received',
      sequence: 'TTTTTTTTTTTT', bindingSequence: 'TTTTTTTTTTTT',
    });
    expect(classifyLabCandidate(query, unrelated).kind).toBe('none');
  });
});

/**
 * PRIMER-LIVE-1 correction — keys must be INJECTIVE.
 *
 * A donor `.bodge` names its own primer ids. If one of them is literally
 * `global:x`, the naive «project keys are the bare raw id» rule makes it key
 * as `global:x` — the same slot as the freezer's own `x`. Opening somebody
 * else's project would then overwrite the record of a real tube.
 */
describe('key injectivity against a hostile namespace', () => {
  it('a donor project id that looks like a freezer key cannot collide with one', () => {
    const donor = { id: 'global:x', scope: PRIMER_SCOPE_PROJECT };
    const freezer = { id: 'x', scope: PRIMER_SCOPE_GLOBAL };
    expect(primerKey(donor)).not.toBe(primerKey(freezer));
    expect(primerKey(freezer)).toBe('global:x');
  });

  it('escapes a reserved prefix rather than trusting it', () => {
    expect(makePrimerKey(PRIMER_SCOPE_PROJECT, 'global:x')).toBe('project:global:x');
    expect(makePrimerKey(PRIMER_SCOPE_PROJECT, 'project:y')).toBe('project:project:y');
    // An ordinary id is untouched — every existing consumer keys on it.
    expect(makePrimerKey(PRIMER_SCOPE_PROJECT, 'plain')).toBe('plain');
  });

  it('escapes prototype-shaped ids so a pool map cannot be poisoned', () => {
    for (const evil of ['__proto__', 'constructor', 'prototype']) {
      const key = makePrimerKey(PRIMER_SCOPE_PROJECT, evil);
      expect(key).toBe(`project:${evil}`);
      expect(parsePrimerKey(key)).toEqual({ scope: PRIMER_SCOPE_PROJECT, rawId: evil });
    }
  });

  it('round-trips every escaped form back to its scope and raw id', () => {
    const cases = [
      [PRIMER_SCOPE_PROJECT, 'plain'],
      [PRIMER_SCOPE_PROJECT, 'global:x'],
      [PRIMER_SCOPE_PROJECT, '__proto__'],
      [PRIMER_SCOPE_GLOBAL, 'x'],
      [PRIMER_SCOPE_GLOBAL, 'global:x'],
    ];
    const seen = new Set();
    for (const [scope, rawId] of cases) {
      const key = makePrimerKey(scope, rawId);
      expect(seen.has(key)).toBe(false); // injective
      seen.add(key);
      expect(parsePrimerKey(key)).toEqual({ scope, rawId });
    }
  });
});

describe('exact vs sameBinding is about the TUBE, not the site', () => {
  const base = {
    sequence: 'GGGGACGTACGTACGTAA', bindingSequence: 'ACGTACGTACGTAA', tail: 'GGGG',
  };

  it('same binding + same tail + same mods is exact', () => {
    expect(classifyLabCandidate(base, { ...base, modifications: [] }).kind).toBe('exact');
  });

  it('same binding, different tail is sameBinding and says so', () => {
    const got = classifyLabCandidate(base, {
      sequence: 'TTTTACGTACGTACGTAA', bindingSequence: 'ACGTACGTACGTAA', tail: 'TTTT',
    });
    expect(got.kind).toBe('same-binding');
    expect(got.tailDiffers).toBe(true);
    expect(got.modificationsDiffer).toBe(false);
  });

  it('same oligo, different modification is sameBinding and says which', () => {
    const got = classifyLabCandidate(base, { ...base, modifications: ['5-phos'] });
    expect(got.kind).toBe('same-binding');
    expect(got.modificationsDiffer).toBe(true);
    expect(got.tailDiffers).toBe(false);
  });
});

/**
 * SEQ-VIS-1 contract A — the anchored current oligo.
 *
 * Two owners, one rule. The SOURCE SITE owns geometry and history: where the
 * oligo landed, and what the template read there when it was declared. The
 * CURRENT RECORD owns the physical oligo: what is actually in the tube now.
 *
 * The anchor's length N is therefore fixed — an ordinary edit cannot make a
 * primer bind further than it was declared to bind. So any current oligo longer
 * than N is read as `5' prefix + N-nt binding`: the extra bases are an
 * unbound overhang, not a longer landing. Same-length differences inside the
 * binding stay substitutions, which are warnings, not re-anchors.
 *
 * Everything shorter, absent or self-contradictory fails closed rather than
 * being guessed into a tail.
 */
describe('resolveAnchoredOligo', () => {
  const ANCHOR = 'ACGTTGCAACGTTGCAACGTTGCAACGTTGC';        // 31 nt
  const POLY_A = 'AAAAAAAA';                                // 8 nt
  // ANCHOR with its LAST base swapped — a substitution inside the landing.
  const MUT = `${ANCHOR.slice(0, 30)}A`;

  it('splits the live legacy record: tail:"" plus a full binding longer than the anchor', () => {
    // The shape the user actually has in pE-SUMOpro Kan: nobody ever wrote a
    // tail, the whole oligo was stored as the binding, and the eight A's
    // disappeared because only the 31-nt snapshot was ever drawn.
    const out = resolveAnchoredOligo(
      { tail: '', bindingSequence: `${POLY_A}${ANCHOR}`, sequence: `${POLY_A}${ANCHOR}` },
      { anchor: ANCHOR },
    );
    expect(out.status).toBe('ok');
    expect(out.tail).toBe(POLY_A);
    expect(out.binding).toBe(ANCHOR);
    expect(out.binding).toHaveLength(ANCHOR.length); // the landing never grew
    expect(out.sequence).toBe(`${POLY_A}${ANCHOR}`); // no letter is lost
  });

  it('an explicit current tail outranks whatever the site remembers', () => {
    const out = resolveAnchoredOligo(
      { tail: 'GAATTC', bindingSequence: ANCHOR, sequence: `GAATTC${ANCHOR}` },
      { anchor: ANCHOR },
    );
    expect(out.status).toBe('ok');
    expect(out.tail).toBe('GAATTC');
    expect(out.binding).toBe(ANCHOR);
  });

  it('never steals an explicit tail to pad a binding shorter than the fixed anchor', () => {
    const shortBinding = ANCHOR.slice(6);
    const out = resolveAnchoredOligo(
      {
        tail: 'GAATTCCA',
        bindingSequence: shortBinding,
        sequence: `GAATTCCA${shortBinding}`,
      },
      { anchor: ANCHOR },
    );
    expect(out.status).toBe('unsupported');
    expect(out.binding).not.toContain('GAATTC');
  });

  it('recovers a legacy prefix when tail:null leaves it unknown but full + N binding are known', () => {
    const out = resolveAnchoredOligo(
      { tail: null, bindingSequence: ANCHOR, sequence: `${POLY_A}${ANCHOR}` },
      { anchor: ANCHOR },
    );
    expect(out).toEqual({
      tail: POLY_A,
      binding: ANCHOR,
      sequence: `${POLY_A}${ANCHOR}`,
      status: 'ok',
    });
  });

  it('does not turn tail:null into proven-empty when no full oligo is known', () => {
    const out = resolveAnchoredOligo(
      { tail: null, bindingSequence: ANCHOR },
      { anchor: ANCHOR },
    );
    expect(out.status).toBe('unsupported');
    expect(out.tail).toBe('');
  });

  it('a prefix and a substitution hold at the same time', () => {
    const out = resolveAnchoredOligo(
      { tail: '', bindingSequence: `${POLY_A}${MUT}`, sequence: `${POLY_A}${MUT}` },
      { anchor: ANCHOR },
    );
    expect(out.status).toBe('ok');
    expect(out.tail).toBe(POLY_A);
    expect(out.binding).toBe(MUT); // the swapped base stays inside the landing
  });

  it('a same-length substitution is a substitution, not a tail', () => {
    const out = resolveAnchoredOligo(
      { tail: '', bindingSequence: MUT, sequence: MUT },
      { anchor: ANCHOR },
    );
    expect(out.status).toBe('ok');
    expect(out.tail).toBe('');
    expect(out.binding).toBe(MUT);
  });

  it('reads a reverse primer by the same rule — the anchor is in the oligo orientation', () => {
    const out = resolveAnchoredOligo(
      {
        direction: 'reverse',
        tail: '',
        bindingSequence: `${POLY_A}${ANCHOR}`,
        sequence: `${POLY_A}${ANCHOR}`,
      },
      { anchor: ANCHOR },
    );
    expect(out.tail).toBe(POLY_A);
    expect(out.binding).toBe(ANCHOR);
  });

  it('fails closed when the current oligo is SHORTER than the anchor', () => {
    // Trimming the landing is a re-anchor. It is not guessed, and it is
    // certainly not reported as a tail.
    const out = resolveAnchoredOligo(
      { tail: '', bindingSequence: ANCHOR.slice(0, 20), sequence: ANCHOR.slice(0, 20) },
      { anchor: ANCHOR },
    );
    expect(out.status).not.toBe('ok');
    expect(out.tail).toBe('');
  });

  it('fails closed when sequence disagrees with tail + binding', () => {
    const out = resolveAnchoredOligo(
      { tail: 'GAATTC', bindingSequence: ANCHOR, sequence: `TTTTTT${ANCHOR}` },
      { anchor: ANCHOR },
    );
    expect(out.status).toBe('conflict');
  });

  it('fails closed when nothing usable is stated', () => {
    expect(resolveAnchoredOligo({}, { anchor: ANCHOR }).status).not.toBe('ok');
    expect(resolveAnchoredOligo(null, { anchor: ANCHOR }).status).not.toBe('ok');
  });

  it('without an anchor the record’s own split stands', () => {
    const out = resolveAnchoredOligo(
      { tail: 'GAATTC', bindingSequence: ANCHOR, sequence: `GAATTC${ANCHOR}` },
      {},
    );
    expect(out.status).toBe('ok');
    expect(out.tail).toBe('GAATTC');
    expect(out.binding).toBe(ANCHOR);
  });

  it('aligned-v1 permits a shorter mutagenic body and reports target-only deletion', () => {
    const body = `${ANCHOR.slice(0, 12)}${ANCHOR.slice(13)}`;
    const out = resolveAnchoredOligo(
      {
        bindingModel: 'aligned-v1', tail: '', bindingSequence: body, sequence: body,
      },
      { anchor: ANCHOR },
    );
    expect(out.status).toBe('ok');
    expect(out.bindingModel).toBe('aligned-v1');
    expect(out.binding).toBe(body);
    expect(out.alignment.counts).toMatchObject({ I: 0, D: 1 });
  });

  it('aligned-v1 keeps a real tail separate from an insertion in the body', () => {
    const body = `${ANCHOR.slice(0, 12)}G${ANCHOR.slice(12)}`;
    const out = resolveAnchoredOligo(
      {
        bindingModel: 'aligned-v1', tail: 'GAATTC', bindingSequence: body,
        sequence: `GAATTC${body}`,
      },
      { anchor: ANCHOR },
    );
    expect(out.status).toBe('ok');
    expect(out.tail).toBe('GAATTC');
    expect(out.binding).toBe(body);
    expect(out.alignment.counts).toMatchObject({ I: 1, D: 0 });
  });

  it('aligned-v1 still blocks an internally contradictory physical oligo', () => {
    const out = resolveAnchoredOligo(
      {
        bindingModel: 'aligned-v1', tail: 'GAATTC', bindingSequence: ANCHOR,
        sequence: `TTTTTT${ANCHOR}`,
      },
      { anchor: ANCHOR },
    );
    expect(out.status).toBe('conflict');
  });
});
