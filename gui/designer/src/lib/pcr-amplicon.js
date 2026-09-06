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
import {
  normalizeOligoSequence,
  resolvePhysicalOligo,
  ANCHORED_OLIGO_OK,
  ANCHORED_OLIGO_CONFLICT,
} from './primer-identity';
import { alignPrimerBinding } from './primer-binding-alignment';
import { evaluatePrimerDuplexThermodynamics } from './primer-duplex-thermodynamics';
import { evaluateStandardPcrAnnealing } from './primer-annealing-policy';

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

function occStart(occ) {
  if (Number.isSafeInteger(occ?.start)) return occ.start;
  return Array.isArray(occ?.segments) && occ.segments.length
    ? occ.segments[0].start
    : null;
}

function occEnd(occ) {
  if (Number.isSafeInteger(occ?.end)) return occ.end;
  return Array.isArray(occ?.segments) && occ.segments.length
    ? occ.segments[occ.segments.length - 1].end
    : null;
}

function fail(reason, extra = {}) {
  return { ok: false, reason, warnings: [], ...extra };
}

function copySegments(segments) {
  return Array.isArray(segments)
    ? segments.map(({ start, end }) => ({ start, end }))
    : null;
}

function copyAlignment(alignment) {
  if (!alignment) return null;
  return {
    ...alignment,
    runs: Array.isArray(alignment.runs)
      ? alignment.runs.map((run) => ({ ...run }))
      : alignment.runs,
    counts: alignment.counts ? { ...alignment.counts } : alignment.counts,
    targetSpan: alignment.targetSpan ? { ...alignment.targetSpan } : alignment.targetSpan,
  };
}

function copyThermodynamics(result) {
  if (!result) return null;
  return {
    conditions: { ...result.conditions },
    fullDuplex: { ...result.fullDuplex },
    threePrimeAnchor: { ...result.threePrimeAnchor },
    pcr: { ...result.pcr, reasons: [...result.pcr.reasons] },
  };
}

/** One resolved landing, complete enough to be copied out of the pool. */
function describeSide(side, direction) {
  return {
    key: side.occ.key,
    primerId: side.occ.primerId,
    name: side.record?.name ?? null,
    direction,
    start: occStart(side.occ),
    end: occEnd(side.occ),
    fullSequence: side.full,
    bindingSequence: side.binding,
    bindingModel: side.record?.bindingModel || null,
    segments: copySegments(side.occ.segments),
    alignment: copyAlignment(side.alignment),
    thermodynamics: copyThermodynamics(side.thermodynamics),
    tail: side.tail || null,
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

function occurrenceTargetSequence(occ, template, circular) {
  const n = template.length;
  const segments = Array.isArray(occ.segments) && occ.segments.length
    ? occ.segments
    : [{ start: occ.start, end: occ.end }];
  if (segments.length > 2 || (segments.length > 1 && !circular)) return null;
  if (segments.length === 2
    && (segments[0].end !== n || segments[1].start !== 0
      || segments[1].start >= segments[0].start)) return null;
  for (const segment of segments) {
    if (!Number.isSafeInteger(segment.start) || !Number.isSafeInteger(segment.end)
      || segment.start < 0 || segment.end <= segment.start || segment.end > n) return null;
  }
  const top = segments.map(({ start, end }) => template.slice(start, end)).join('');
  return occ.strand === -1 ? reverseComplement(top) : top;
}

function sameAlignmentEvidence(stated, canonical) {
  return stated.editDistance === canonical.editDistance
    && stated.threePrimeGap === canonical.threePrimeGap
    && stated.threePrimeMatchLength === canonical.threePrimeMatchLength
    && JSON.stringify(stated.targetSpan) === JSON.stringify(canonical.targetSpan)
    && JSON.stringify(stated.counts) === JSON.stringify(canonical.counts)
    && JSON.stringify(stated.runs) === JSON.stringify(canonical.runs);
}

/** Verify occurrence-carried evidence against current bases and geometry. */
function verifiedOccurrenceAlignment(side, template, circular) {
  const stated = side.occ?.alignment;
  if (stated == null) return { alignment: null, invalid: false };
  if (!Array.isArray(stated.runs)) return { alignment: null, invalid: true };
  const target = occurrenceTargetSequence(side.occ, template, circular);
  if (target == null || target.length !== occLength(side.occ)) {
    return { alignment: null, invalid: true };
  }
  if (normalizeOligoSequence(stated.query) !== side.binding
    || normalizeOligoSequence(stated.target) !== target
    || stated.targetSpan?.start !== 0
    || stated.targetSpan?.end !== target.length) {
    return { alignment: null, invalid: true };
  }
  const canonical = alignPrimerBinding(side.binding, target);
  return sameAlignmentEvidence(stated, canonical)
    ? { alignment: canonical, invalid: false }
    : { alignment: null, invalid: true };
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
  const annealing = evaluateStandardPcrAnnealing(alignment);
  if (alignment.threePrimeGap) {
    out.push(warn('three-prime-gap', { severity: 'high' }));
  } else if (annealing.reason === 'short-three-prime-anchor') {
    out.push(warn('three-prime-short', {
      severity: 'high', length: annealing.threePrimeMatchLength,
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

  // Resolve the physical oligo once. `sequence` and tail/binding are equivalent
  // storage shapes when either proves the same 5′→3′ molecule; the helper
  // boundary is never allowed to change PCR biology.
  for (const side of [forward, reverse]) {
    const physical = resolvePhysicalOligo(side.record);
    if (physical.status === ANCHORED_OLIGO_CONFLICT) {
      return fail('tail-binding-conflict');
    }
    if (physical.status !== ANCHORED_OLIGO_OK || !physical.sequence) {
      return fail('unknown-sequence');
    }
    side.physical = physical;
    side.full = physical.sequence;
    if (typeof side.occ?.sequence === 'string'
      && normalizeOligoSequence(side.occ.sequence) !== side.full) {
      return fail('tail-binding-conflict');
    }
  }

  // A projected occurrence may carry the biological split established by the
  // current template. Verify that evidence against the resolved full oligo;
  // otherwise retain the record split only as a fallback for older callers.
  for (const side of [forward, reverse]) {
    const projectedBinding = typeof side.occ?.annealedSequence === 'string'
      ? normalizeOligoSequence(side.occ.annealedSequence)
      : null;
    if (projectedBinding !== null) {
      if (!projectedBinding || !side.full.endsWith(projectedBinding)) {
        return fail('tail-binding-conflict');
      }
      const derivedTail = side.full.slice(0, side.full.length - projectedBinding.length);
      if (Object.prototype.hasOwnProperty.call(side.occ, 'tail')) {
        const statedOccurrenceTail = side.occ.tail == null
          ? ''
          : normalizeOligoSequence(side.occ.tail);
        if (statedOccurrenceTail !== derivedTail) return fail('tail-binding-conflict');
      }
      side.binding = projectedBinding;
      side.tail = derivedTail;
    } else {
      side.binding = side.physical.binding;
      side.tail = side.physical.tail;
    }
  }

  // A legacy landing cannot explain a length difference. aligned-v1 can: its
  // deterministic alignment says exactly which query bases are inserted and
  // which target bases are deleted, while the occurrence still owns the
  // template footprint.
  for (const side of [forward, reverse]) {
    const verified = verifiedOccurrenceAlignment(side, tpl, circular);
    if (verified.invalid) return fail('indel-unsupported');
    side.alignment = verified.alignment;
    if (side.binding.length > 0
      && occLength(side.occ) !== side.binding.length
      && !side.alignment) {
      return fail('indel-unsupported');
    }
    const target = occurrenceTargetSequence(side.occ, tpl, circular);
    const currentAlignment = side.alignment || (target != null
      ? alignPrimerBinding(side.binding, target)
      : null);
    side.thermodynamics = evaluatePrimerDuplexThermodynamics({
      alignment: currentAlignment,
    });
    // P6a — PCR viability follows the current alignment, never a saved scalar
    // Tm. Zero continuous 3′ pairing refuses standard PCR while the oligo stays
    // a valid record that can still be inspected and saved elsewhere.
    if (side.thermodynamics.pcr.status === 'refused') {
      const reason = side.thermodynamics.pcr.reasons.find((item) => [
        'no-three-prime-anchor',
        'short-three-prime-anchor',
        'noncanonical-three-prime-anchor',
        'invalid-three-prime-anchor-evidence',
      ].includes(item)) || 'short-three-prime-anchor';
      return fail(reason, { primerId: side.occ.primerId });
    }
  }

  const fs = occStart(forward.occ);
  const lenF = occLength(forward.occ);
  const re = occEnd(reverse.occ);
  const lenR = occLength(reverse.occ);
  if (!Number.isSafeInteger(fs) || !Number.isSafeInteger(re)) return fail('no-product');

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

  // A scalar full-duplex Tm is honest only for a perfectly complementary
  // landing. Any real substitution, insertion or internal deletion (editDistance
  // > 0) makes a perfect-kernel scalar describe a duplex that does not form; an exact
  // terminal-trimmed landing (editDistance 0) may still use it. Mismatch/bulge
  // thermodynamics are P6, not modeled here.
  const thermalSides = [forward, reverse];
  const unknownFullDuplex = thermalSides.filter(
    (side) => side.thermodynamics.fullDuplex.status !== 'calculated',
  );
  if (unknownFullDuplex.some(
    (side) => side.thermodynamics.fullDuplex.reason === 'imperfect-duplex',
  )) {
    warnings.push(warn('gapped-tm-unknown', { tm: null }));
  }
  if (unknownFullDuplex.some(
    (side) => side.thermodynamics.fullDuplex.reason !== 'imperfect-duplex',
  )) {
    const reason = unknownFullDuplex.find(
      (side) => side.thermodynamics.fullDuplex.reason !== 'imperfect-duplex',
    ).thermodynamics.fullDuplex.reason;
    warnings.push(warn('duplex-tm-unknown', { tm: null, reason }));
  }
  if (unknownFullDuplex.length === 0) {
    const tmF = forward.thermodynamics.fullDuplex.tmC;
    const tmR = reverse.thermodynamics.fullDuplex.tmC;
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
