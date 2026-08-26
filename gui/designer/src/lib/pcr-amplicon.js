/**
 * pcr-amplicon.js — the ONE resolver behind every PCR product in this package.
 *
 * It is handed the TWO landings the user actually chose. It never re-locates a
 * primer with `indexOf`: on a repetitive plasmid that quietly answers about a
 * different site than the one highlighted on screen, and the user has no way
 * of noticing. If a caller cannot say which occurrences it means, it has not
 * asked a well-formed question.
 *
 * The product is what the polymerase would make:
 *
 *     forward oligo (WHOLE)  +  template between the landings  +  rc(reverse oligo)
 *
 * so a 5' tail and a deliberately substituted base are part of the product —
 * they are part of the primer. The template's own base at a substituted
 * position is reported as a warning, never silently restored.
 *
 * Fail-closed. Same direction, a stale landing, an unknown oligo, a record
 * that contradicts itself and an indel without an aligned-v1 landing are
 * BLOCKING; a modeled substitution/indel, a low Tm and a large delta-Tm are
 * WARNINGS. The difference is whether the biology can happen at all.
 */

import { reverseComplement } from '../sequence-utils';
import { calcTm } from '../tm-calculator';
import { normalizeOligoSequence } from './primer-identity';

/** Bases of a circular template starting at `from`, `len` long. */
function sliceCircular(template, from, len) {
  const n = template.length;
  if (n === 0 || len <= 0) return '';
  let out = '';
  for (let i = 0; i < len; i += 1) out += template[(from + i) % n];
  return out;
}

/** Footprint length of an occurrence, from segments when it has them. */
function occLength(occ) {
  if (Array.isArray(occ.segments) && occ.segments.length) {
    return occ.segments.reduce((sum, s) => sum + (s.end - s.start), 0);
  }
  return occ.end - occ.start;
}

function fail(reason, extra = {}) {
  return { ok: false, reason, warnings: [], ...extra };
}

/** One resolved landing, complete enough to be copied out of the pool. */
function describeSide(side, direction) {
  return {
    key: side.occ.key,
    primerId: side.occ.primerId,
    name: side.record?.name ?? null,
    direction,
    start: side.occ.start,
    end: side.occ.end,
    fullSequence: side.full,
    bindingSequence: side.binding,
    bindingModel: side.record?.bindingModel || null,
    alignment: side.alignment || null,
    tail: typeof side.record?.tail === 'string'
      ? normalizeOligoSequence(side.record.tail)
      : null,
  };
}

function warn(code, extra = {}) {
  return { code, blocking: false, ...extra };
}

/** Positions (absolute, template coordinates) where the oligo differs. */
function mismatchPositions(annealedTop, templateTop, start, n) {
  const out = [];
  const len = Math.min(annealedTop.length, templateTop.length);
  for (let i = 0; i < len; i += 1) {
    if (annealedTop[i] !== templateTop[i]) out.push(n > 0 ? (start + i) % n : start + i);
  }
  return out;
}

function validAlignedLanding(side) {
  if (side.record?.bindingModel !== 'aligned-v1') return null;
  const alignment = side.occ?.alignment;
  if (!alignment || !Array.isArray(alignment.runs)) return null;
  if (normalizeOligoSequence(alignment.query) !== side.binding) return null;
  if (normalizeOligoSequence(alignment.target).length !== occLength(side.occ)) return null;
  return alignment;
}

function occurrenceTargetPositions(occ) {
  const positions = [];
  const segments = Array.isArray(occ.segments) && occ.segments.length
    ? occ.segments
    : [{ start: occ.start, end: occ.end }];
  for (const segment of segments) {
    for (let position = segment.start; position < segment.end; position += 1) {
      positions.push(position);
    }
  }
  return occ.strand === -1 ? positions.reverse() : positions;
}

function normalizedPosition(position, length, circular) {
  if (!circular || length <= 0) return position;
  return ((position % length) + length) % length;
}

function alignmentWarnings(side, length, circular) {
  const alignment = side.alignment;
  if (!alignment) return [];
  const targetPositions = occurrenceTargetPositions(side.occ);
  const substitutions = [];
  const insertions = [];
  const deletions = [];
  let insertedCount = 0;
  let deletedCount = 0;
  for (const run of alignment.runs) {
    if (run.op === 'X') {
      for (let offset = run.targetStart; offset < run.targetEnd; offset += 1) {
        if (targetPositions[offset] != null) substitutions.push(targetPositions[offset]);
      }
    } else if (run.op === 'I') {
      const rawBoundary = run.targetStart < targetPositions.length
        ? targetPositions[run.targetStart]
        : (targetPositions[targetPositions.length - 1] ?? side.occ.start)
          + (side.occ.strand === -1 ? -1 : 1);
      insertions.push(normalizedPosition(rawBoundary, length, circular));
      insertedCount += run.queryEnd - run.queryStart;
    } else if (run.op === 'D') {
      for (let offset = run.targetStart; offset < run.targetEnd; offset += 1) {
        if (targetPositions[offset] != null) deletions.push(targetPositions[offset]);
      }
      deletedCount += run.targetEnd - run.targetStart;
    }
  }
  const out = [];
  if (substitutions.length) out.push(warn('mismatch', { positions: substitutions }));
  if (insertedCount) {
    out.push(warn('insertion', { count: insertedCount, positions: insertions }));
  }
  if (deletedCount) {
    out.push(warn('deletion', { count: deletedCount, positions: deletions }));
  }
  if (alignment.threePrimeGap) {
    out.push(warn('three-prime-gap', { severity: 'high' }));
  } else if (alignment.editDistance > 0 && alignment.threePrimeMatchLength < 8) {
    out.push(warn('three-prime-short', {
      severity: 'high', length: alignment.threePrimeMatchLength,
    }));
  }
  return out;
}

/**
 * Resolve the product of two explicitly chosen landings.
 *
 * @param {object} args
 * @param {string} args.template            the molecule's bases
 * @param {'circular'|'linear'} args.topology
 * @param {Array} args.occurrences          EXACTLY two chosen landings:
 *   `{ key, primerId, start, end, strand, evidence?, stale?, segments? }`
 * @param {Record<string, object>} args.primersById  the records behind them
 */
export function resolvePcrProduct({
  template = '', topology = 'linear', occurrences = [], primersById = {},
  // WHICH molecule, and WHICH VERSION of it, this resolution is about. It
  // travels with the product so a later execution can check that it is still
  // looking at the same molecule instead of trusting coordinates alone.
  documentIdentity = null,
} = {}) {
  const tpl = normalizeOligoSequence(template);
  const n = tpl.length;
  const circular = topology === 'circular';

  if (!Array.isArray(occurrences) || occurrences.length !== 2) {
    return fail('need-two-occurrences');
  }
  if (!n) return fail('no-product');

  const sides = occurrences.map((occ) => ({
    occ,
    record: primersById[occ.primerId] || null,
    reverse: occ.strand === -1,
  }));

  // A landing whose evidence no longer holds is not a landing. Amplifying from
  // it would present an old coordinate as a current fact.
  if (sides.some((s) => s.occ.stale === true || s.occ.evidence === 'stale')) {
    return fail('stale-site');
  }
  if (sides.some((s) => !s.record)) return fail('unknown-sequence');
  if (sides[0].reverse === sides[1].reverse) return fail('same-direction');

  const forward = sides.find((s) => !s.reverse);
  const reverse = sides.find((s) => s.reverse);

  // The full oligo must be known before anything can be built from it: a
  // product assembled from an unknown sequence is a guess with a length.
  for (const side of [forward, reverse]) {
    const full = normalizeOligoSequence(side.record.sequence);
    if (!full) return fail('unknown-sequence');
    side.full = full;
  }

  // A record that states all three of sequence / tail / binding must agree
  // with itself. Picking one of the two contradictory answers here would make
  // the product depend on which field this code happened to read.
  for (const side of [forward, reverse]) {
    const tail = typeof side.record.tail === 'string'
      ? normalizeOligoSequence(side.record.tail) : null;
    const bind = typeof side.record.bindingSequence === 'string'
      ? normalizeOligoSequence(side.record.bindingSequence) : null;
    if (tail !== null && bind !== null && `${tail}${bind}` !== side.full) {
      return fail('tail-binding-conflict');
    }
    side.binding = bind || side.full;
  }

  // A legacy landing cannot explain a length difference. aligned-v1 can: its
  // deterministic alignment says exactly which query bases are inserted and
  // which target bases are deleted, while the occurrence still owns the
  // template footprint.
  for (const side of [forward, reverse]) {
    side.alignment = validAlignedLanding(side);
    if (occLength(side.occ) !== side.binding.length && !side.alignment) {
      return fail('indel-unsupported');
    }
  }

  const fs = forward.occ.start;
  const lenF = occLength(forward.occ);
  const re = reverse.occ.end;
  const lenR = occLength(reverse.occ);

  // Distance travelled along the top strand from the forward 5' end to the
  // reverse landing's far edge. On a ring, zero means the whole molecule.
  let span = ((re - fs) % n + n) % n;
  if (span === 0) span = n;
  const wrapsOrigin = circular && re <= fs;

  if (!circular) {
    if (re <= fs) return fail('no-product');
    span = re - fs;
  }
  const interiorLen = span - lenF - lenR;
  if (interiorLen < 0) return fail('no-product');

  const interior = circular
    ? sliceCircular(tpl, fs + lenF, interiorLen)
    : tpl.slice(fs + lenF, fs + lenF + interiorLen);

  const sequence = forward.full + interior + reverseComplement(reverse.full);

  // ── warnings — visible, never a veto ────────────────────────────────────
  const warnings = [];
  const fwdTop = circular ? sliceCircular(tpl, fs, lenF) : tpl.slice(fs, fs + lenF);
  const revTop = circular
    ? sliceCircular(tpl, reverse.occ.start, lenR)
    : tpl.slice(reverse.occ.start, reverse.occ.start + lenR);
  const revAnnealTop = reverseComplement(reverse.binding);

  const mmF = forward.alignment
    ? [] : mismatchPositions(forward.binding, fwdTop, fs, circular ? n : 0);
  const mmR = reverse.alignment
    ? [] : mismatchPositions(revAnnealTop, revTop, reverse.occ.start, circular ? n : 0);
  if (mmF.length || mmR.length) {
    warnings.push(warn('mismatch', { positions: [...mmF, ...mmR].sort((a, b) => a - b) }));
  }
  warnings.push(
    ...alignmentWarnings(forward, n, circular),
    ...alignmentWarnings(reverse, n, circular),
  );

  const hasGappedBinding = [forward, reverse].some((side) => side.alignment?.hasGap);
  if (hasGappedBinding) {
    warnings.push(warn('gapped-tm-unknown', { tm: null }));
  } else {
    const tmF = calcTm(forward.binding);
    const tmR = calcTm(reverse.binding);
    if (Number.isFinite(tmF) && Number.isFinite(tmR) && Math.abs(tmF - tmR) > 3) {
      warnings.push(warn('delta-tm', { deltaTm: Math.round(Math.abs(tmF - tmR) * 10) / 10 }));
    }
    for (const [side, tm] of [[forward, tmF], [reverse, tmR]]) {
      if (Number.isFinite(tm) && tm < 50) {
        warnings.push(warn('low-tm', {
          primerId: side.occ.primerId, tm: Math.round(tm * 10) / 10,
        }));
      }
    }
  }

  return {
    ok: true,
    warnings,
    product: {
      sequence,
      length: sequence.length,
      wrapsOrigin,
      // Where the product sits on the template — the piece builder needs the
      // span, and on a ring the end may legitimately be behind the start.
      start: fs,
      end: circular ? (fs + span) % n || n : re,
      templateSpan: span,
      documentIdentity,
      // The same footprint as REAL spans. A ring cannot be expressed as one
      // `start > end` range — the piece invariant forbids it, and rightly so:
      // an inverted range is indistinguishable from a typo. A wrap is two
      // honest spans, [fs..n) and [0..end).
      templateRanges: wrapsOrigin
        ? [{ start: fs, end: n }, { start: 0, end: (fs + span) - n }]
        : [{ start: fs, end: fs + span }],
      // Each side carries everything a downstream consumer needs to describe
      // the oligo, so nothing has to reach back into the pool — which is the
      // whole point on a machine where that pool does not exist.
      forward: describeSide(forward, 'forward'),
      reverse: describeSide(reverse, 'reverse'),
    },
  };
}
