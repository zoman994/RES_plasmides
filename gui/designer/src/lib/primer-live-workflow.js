/**
 * primer-live-workflow.js — making a primer from a selection, and answering
 * «do I already have this one?» while the selection moves.
 *
 * Creating a primer is one step. There is no draft that must later be promoted
 * into a real record: the moment the user says «forward primer here», the
 * record exists, and it remembers what it was made against — which molecule,
 * which version of it, which strand, which half-open interval, and what it
 * anneals to in its OWN orientation. Without that anchor the coordinate later
 * becomes a confident lie about an edited sequence.
 *
 * The lab-match side only ever looks at real stock, and only at the site under
 * the selection. It is not an off-target scan: a whole-molecule approximate
 * search belongs in an explicit analysis, not under the cursor.
 */

import { reverseComplement } from '../sequence-utils';
import { calcTm, checkHairpin, checkHomodimer } from '../tm-calculator';
import { makeId } from './ids';
import { evaluateStandardPcrAnnealing } from './primer-annealing-policy';
import { evaluatePrimerDuplexThermodynamics } from './primer-duplex-thermodynamics';
import { projectPrimerSites, projectPrimerPool } from './primer-site-projection';
import { attachKnownPrimerSite } from './primer-known-placement';
import {
  PRIMER_SCOPE_PROJECT,
  normalizeOligoSequence,
  bindingOf,
  isLabStock,
  classifyLabCandidate,
  resolvePhysicalOligo,
  ANCHORED_OLIGO_OK,
} from './primer-identity';

const MIN_TM = 50;
const MAX_DELTA_TM = 3;

/**
 * A stable name for «this molecule, this version of it».
 *
 * The host's committed `resourceHash` is preferred whenever it exists — that
 * is the identity the library already maintains, and adding a second owner of
 * the same fact is how two surfaces end up disagreeing.
 *
 * Otherwise a deterministic fingerprint over topology, length and bases. It is
 * NOT the sequence: storing a whole molecule inside a primer's anchor would
 * bloat every record and quietly turn a reference into a copy. A 64-bit FNV-1a
 * pair is enough to notice an edit, which is the entire job — this is a
 * staleness check, not a security boundary.
 *
 * @param {{sequence?: string, topology?: string, resourceHash?: string|null}} doc
 * @returns {string|null}
 */
export function documentIdentityOf({ sequence = '', topology = 'linear', resourceHash = null } = {}) {
  if (typeof resourceHash === 'string' && resourceHash) return resourceHash;
  const seq = normalizeOligoSequence(sequence);
  if (!seq) return null;
  const topo = topology === 'circular' ? 'circular' : 'linear';
  const payload = `${topo}|${seq.length}|${seq}`;
  // Two offset basis values → 64 bits of separation without a crypto dependency
  // or an async digest on a render path.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < payload.length; i += 1) {
    const c = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return `fp1:${h1.toString(36)}${h2.toString(36)}`;
}

/** Segments for a selection, split at the origin when it runs past the end. */
function selectionSegments(start, end, length, circular) {
  if (circular && length > 0 && end > length) {
    return [{ start, end: length }, { start: 0, end: end - length }];
  }
  return [{ start, end }];
}

function topStrandOf(template, segments) {
  return segments.map((s) => template.slice(s.start, s.end)).join('');
}

function primerTargetPositions(segments, strand) {
  const positions = [];
  for (const segment of segments) {
    for (let position = segment.start; position < segment.end; position += 1) {
      positions.push(position);
    }
  }
  return strand === -1 ? positions.reverse() : positions;
}

/**
 * The record a selection becomes.
 *
 * A project record, always. Drawing a primer on a sequence says nothing about
 * whether a tube of it exists, so this never lands in the personal inventory.
 */
export function buildPrimerFromSelection({
  template = '', topology = 'linear', start, end,
  direction = 'forward', name = '', tail = '',
  entryId = null, documentHash = null, id, addedAt,
} = {}) {
  const tpl = normalizeOligoSequence(template);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return null;
  const circular = topology === 'circular';
  const segments = selectionSegments(start, end, tpl.length, circular);
  const top = topStrandOf(tpl, segments);
  if (!top) return null;

  const dir = direction === 'reverse' ? 'reverse' : 'forward';
  // The annealed stretch is stored in the PRIMER's orientation, so a reverse
  // primer reads 5'->3' as the user would order it — not as the top strand.
  const annealed = dir === 'reverse' ? reverseComplement(top) : top;
  const cleanTail = normalizeOligoSequence(tail);
  const rawId = id || makeId();
  const tm = calcTm(annealed);

  const record = {
    schemaVersion: 2,
    id: rawId,
    rawId,
    scope: PRIMER_SCOPE_PROJECT,
    name: String(name || '').trim() || `primer_${start + 1}-${end}`,
    description: '',
    sequence: `${cleanTail}${annealed}`,
    sequenceSource: 'designed',
    bindingSequence: annealed,
    bindingModel: 'aligned-v1',
    tail: cleanTail,
    direction: dir,
    status: 'designed',
    tm: Number.isFinite(tm) ? tm : null,
    length: cleanTail.length + annealed.length,
    origin: { kind: 'selection', entryId },
    addedAt: addedAt || new Date().toISOString(),
    sites: [],
  };
  return attachKnownPrimerSite(record, {
    entryId,
    documentHash,
    topology: circular ? 'circular' : 'linear',
    template: tpl,
    start,
    end,
    sourceForm: 'designed',
  }) || record;
}

function countMismatches(a, b) {
  let out = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) out += 1;
  return out;
}

/**
 * Which real tubes fit the stretch currently under the selection.
 *
 * Exact matches are the answer; same-length near misses are advisory and are
 * returned separately so a caller cannot accidentally present one as
 * confirmed. Only `received` global inventory is considered — a project record
 * or an ordered oligo is not something that exists in the freezer.
 */
export function matchLabPrimersForSelection({
  template = '', topology = 'linear', start, end, records = [],
} = {}) {
  const empty = { exact: [], substitutions: [] };
  const tpl = normalizeOligoSequence(template);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return empty;
  const circular = topology === 'circular';
  const segments = selectionSegments(start, end, tpl.length, circular);
  const top = topStrandOf(tpl, segments);
  if (!top) return empty;
  const rc = reverseComplement(top);
  // A palindromic site reads the same on both strands, so the two orientations
  // are one physical answer. Offering it twice invents a second option.
  const palindromic = rc === top;

  const exact = [];
  const sameBinding = [];
  const substitutions = [];

  for (const record of records) {
    if (!isLabStock(record)) continue;
    const bind = bindingOf(record);
    if (!bind || bind.length !== top.length) continue;

    if (bind === top || bind === rc) {
      const orientation = palindromic
        ? (record.direction === 'reverse' ? 'reverse' : 'forward')
        : (bind === top ? 'forward' : 'reverse');
      // Landing on this site is not the same as BEING this oligo. The tube in
      // the freezer may carry a 5' tail or a modification the selection knows
      // nothing about, and then it is a different thing you would have to
      // order. One owner decides that — `classifyLabCandidate`.
      const verdict = classifyLabCandidate(
        { sequence: bind === top ? top : rc, bindingSequence: bind, tail: '', modifications: [] },
        record,
      );
      const entry = {
        record, orientation, mismatches: 0, advisory: verdict.kind !== 'exact',
      };
      if (verdict.kind === 'exact') {
        exact.push(entry);
      } else {
        sameBinding.push({
          ...entry,
          tailDiffers: verdict.tailDiffers === true,
          modificationsDiffer: verdict.modificationsDiffer === true,
        });
      }
      continue;
    }
    const mmTop = countMismatches(bind, top);
    const mmRc = countMismatches(bind, rc);
    const best = Math.min(mmTop, mmRc);
    substitutions.push({
      record,
      orientation: mmTop <= mmRc ? 'forward' : 'reverse',
      mismatches: best,
      advisory: true,
    });
  }

  substitutions.sort((a, b) => a.mismatches - b.mismatches);
  return { exact, sameBinding, substitutions };
}

/**
 * Everything worth telling the user about an oligo, none of it a veto.
 *
 * A mismatch is a deliberate act as often as it is a mistake — the user may be
 * introducing a substitution on purpose — so it is reported with its position
 * and the oligo is left exactly as written.
 */
export function evaluatePrimerWarnings(record, {
  template = '', topology = 'linear', entryId = null, documentHash = null,
  partnerSequence = null,
} = {}) {
  const out = [];
  if (!record) return out;
  const tpl = normalizeOligoSequence(template);

  // Trust the same projected occurrences the renderer can actually use. Raw
  // sites may belong to another entry/version, and must not leak authoritative
  // coordinates or decide which anchor supplies Tm.
  const occurrences = projectPrimerSites(record, {
    template: tpl, topology, entryId, documentHash,
  });
  const usable = occurrences.filter((occ) => (
    occ.oligoStatus === ANCHORED_OLIGO_OK
    && normalizeOligoSequence(occ.annealedSequence).length > 0
    && Array.isArray(occ.segments)
    && occ.segments.length > 0
  ));
  const editWarnings = [];
  for (const occ of usable) {
    const segs = occ.segments;
    if (!segs.length || !tpl) continue;
    if (occ.alignment) {
      const targetPositions = primerTargetPositions(segs, occ.strand);
      const substitutions = [];
      const insertions = [];
      const deletions = [];
      let insertedCount = 0;
      let deletedCount = 0;
      for (const run of occ.alignment.runs) {
        if (run.op === 'X') {
          for (let offset = run.targetStart; offset < run.targetEnd; offset += 1) {
            if (targetPositions[offset] != null) substitutions.push(targetPositions[offset]);
          }
        } else if (run.op === 'I') {
          const boundary = run.targetStart < targetPositions.length
            ? targetPositions[run.targetStart]
            : (targetPositions[targetPositions.length - 1] ?? 0) + (occ.strand === -1 ? -1 : 1);
          insertions.push(boundary);
          insertedCount += run.queryEnd - run.queryStart;
        } else if (run.op === 'D') {
          for (let offset = run.targetStart; offset < run.targetEnd; offset += 1) {
            if (targetPositions[offset] != null) deletions.push(targetPositions[offset]);
          }
          deletedCount += run.targetEnd - run.targetStart;
        }
      }
      if (substitutions.length) {
        editWarnings.push({ code: 'mismatch', blocking: false, positions: substitutions });
      }
      if (insertedCount) {
        editWarnings.push({
          code: 'insertion', blocking: false, count: insertedCount, positions: insertions,
        });
      }
      if (deletedCount) {
        editWarnings.push({
          code: 'deletion', blocking: false, count: deletedCount, positions: deletions,
        });
      }
      const annealing = evaluateStandardPcrAnnealing(occ.alignment);
      if (occ.alignment.threePrimeGap) {
        editWarnings.push({ code: 'three-prime-gap', blocking: false, severity: 'high' });
      } else if (annealing.reason === 'no-three-prime-anchor'
        || annealing.reason === 'short-three-prime-anchor') {
        editWarnings.push({
          code: 'three-prime-short', blocking: false, severity: 'high',
          length: annealing.threePrimeMatchLength,
        });
      } else if (annealing.reason === 'noncanonical-three-prime-anchor') {
        editWarnings.push({
          code: 'three-prime-noncanonical', blocking: false, severity: 'high',
          length: annealing.threePrimeMatchLength,
        });
      } else if (annealing.reason === 'invalid-three-prime-anchor-evidence') {
        editWarnings.push({
          code: 'three-prime-evidence-invalid', blocking: false, severity: 'high',
        });
      }
      continue;
    }
    const top = topStrandOf(tpl, segs);
    // PRIMER-LIVE-1B — compare the oligo AS IT IS NOW, not the anchor's
    // snapshot. `site.annealedSequence` is the stretch recorded when the
    // landing was declared, and an in-place edit deliberately preserves it
    // (an ordinary edit must not re-anchor) — so asking the snapshot whether
    // it matches the template can only ever answer «identical», and a base
    // the biolog changed on purpose stayed invisible on every surface.
    // The binding is stored 5'->3' on the primer's OWN strand, so a
    // minus-strand landing is compared back in top-strand orientation and the
    // reported positions stay template coordinates.
    const bind = normalizeOligoSequence(occ.annealedSequence);
    const bindingTop = occ.strand === -1 ? reverseComplement(bind) : bind;
    // A length change is an indel, not a per-base substitution: lining up two
    // different lengths would report everything past the shift as «wrong».
    if (!top || !bindingTop || top.length !== bindingTop.length) continue;
    const positions = [];
    let cursor = 0;
    for (const seg of segs) {
      for (let i = seg.start; i < seg.end; i += 1, cursor += 1) {
        if (bindingTop[cursor] !== tpl[i]) positions.push(i);
      }
    }
    if (positions.length) editWarnings.push({ code: 'mismatch', blocking: false, positions });
  }
  out.push(...editWarnings);

  // One confident Tm exists only when every projected landing has a readable
  // composition and all of them resolve to the same effective binding. This is
  // deliberately a set decision, never "whichever raw site came first".
  const uniqueBindings = new Set(usable.map((occ) => normalizeOligoSequence(occ.annealedSequence)));
  const landingThermodynamics = usable.map((occ) => (
    evaluatePrimerDuplexThermodynamics({ alignment: occ.alignment })
  ));
  // A confident scalar Tm exists only for a canonical perfect duplex. An exact
  // terminal trim still qualifies; X/I/D uses the existing gapped warning, and
  // a noncanonical exact alignment reports why no scalar was calculated.
  const unavailableReasons = [...new Set(landingThermodynamics
    .filter((result) => result.fullDuplex.status !== 'calculated')
    .map((result) => result.fullDuplex.reason || 'not-calculated'))].sort();
  const strictUnavailableReason = unavailableReasons.find(
    (reason) => reason !== 'imperfect-duplex',
  );
  if (strictUnavailableReason) {
    out.push({
      code: 'duplex-tm-unknown', blocking: false, tm: null,
      reason: strictUnavailableReason,
    });
  } else if (unavailableReasons.includes('imperfect-duplex')) {
    out.push({ code: 'gapped-tm-unknown', blocking: false, tm: null });
  }
  const hasConfidentLandingSet = unavailableReasons.length === 0 && occurrences.length > 0
    && usable.length === occurrences.length
    && uniqueBindings.size === 1;
  let tm = Number.NaN;
  if (hasConfidentLandingSet) {
    const values = landingThermodynamics.map((result) => result.fullDuplex.tmC);
    if (values.length && values.every((value) => Number.isFinite(value))) tm = values[0];
  }
  if (Number.isFinite(tm) && tm < MIN_TM) {
    out.push({ code: 'low-tm', blocking: false, tm: Math.round(tm * 10) / 10 });
  }
  if (partnerSequence) {
    const normalizedPartner = normalizeOligoSequence(partnerSequence);
    const partnerTm = /^[ACGT]+$/.test(normalizedPartner)
      ? calcTm(normalizedPartner)
      : Number.NaN;
    if (Number.isFinite(tm) && Number.isFinite(partnerTm)
      && Math.abs(tm - partnerTm) > MAX_DELTA_TM) {
      out.push({
        code: 'delta-tm', blocking: false,
        deltaTm: Math.round(Math.abs(tm - partnerTm) * 10) / 10,
      });
    }
  }
  // The production checks, not a second opinion. `checkHairpin` walks real
  // stem/loop geometry with a ΔG threshold and `checkHomodimer` looks at 3'
  // complementarity — reimplementing either here would give the biolog two
  // different answers about the same oligo depending on which screen they are on.
  const physical = resolvePhysicalOligo(record);
  const full = physical.status === ANCHORED_OLIGO_OK ? physical.sequence : '';
  if (full && checkHairpin(full)) out.push({ code: 'hairpin', blocking: false });
  if (full && checkHomodimer(full)) out.push({ code: 'self-dimer', blocking: false });

  return out;
}

/**
 * Turn the viewer's clicked hits into the landings the resolver needs.
 *
 * A viewer hit is ONE DRAWN SEGMENT: an origin-crossing binding is painted as
 * two arrows, and handing either of them over on its own would describe a
 * footprint shorter than the oligo — which the resolver would correctly refuse
 * as an indel. So the occurrence is looked up whole, through the SAME
 * projection the track drew it with, and matched by its occurrence key.
 *
 * @param {Array<{key: string, hit: object}>} selected the viewer's selection
 * @param {Array} primers the pool the viewer is rendering
 * @param {object} ctx `{ template, entryId, documentHash, topology }`
 */
export function selectedOccurrencesFor(selected, primers, ctx = {}) {
  if (!Array.isArray(selected) || selected.length === 0) return [];
  const byKey = new Map();
  for (const occ of projectPrimerPool(primers, ctx)) byKey.set(occ.key, occ);

  const out = [];
  const seen = new Set();
  for (const entry of selected) {
    const key = entry?.hit?._occKey || entry?.key;
    const occ = key ? byKey.get(key) : null;
    // A selection whose occurrence no longer projects is a landing that has
    // gone stale under the user. It is reported as such rather than dropped,
    // so the action says why it is unavailable instead of silently vanishing.
    if (!occ) {
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push({ key, primerId: entry?.hit?.id ?? null, stale: true });
      }
      continue;
    }
    if (seen.has(occ.key)) continue;
    seen.add(occ.key);
    const segs = occ.segments || [];
    out.push({
      key: occ.key,
      primerId: occ.primerId,
      segments: segs,
      start: segs.length ? segs[0].start : null,
      end: segs.length ? segs[segs.length - 1].end : null,
      strand: occ.strand,
      evidence: occ.evidence,
      siteId: occ.siteId ?? null,
      sequence: occ.sequence ?? null,
      annealedSequence: occ.annealedSequence ?? null,
      tail: occ.tail ?? null,
      unpairedPrefixLength: occ.unpairedPrefixLength ?? null,
      confirmedFivePrimeSuffixLength: occ.confirmedFivePrimeSuffixLength ?? 0,
      bindingModel: occ.bindingModel ?? null,
      oligoStatus: occ.oligoStatus ?? null,
      sourceVisibility: occ.sourceVisibility ?? null,
      wrapsOrigin: occ.wrapsOrigin === true,
      topology: ctx.topology === 'circular' ? 'circular' : 'linear',
      // PCR must receive the same alignment the viewer projected. Rebuilding
      // the occurrence as geometry-only turns a valid aligned-v1 I/D back
      // into an unsupported length mismatch at the product boundary.
      alignment: occ.alignment || null,
    });
  }
  return out;
}

/**
 * Does this record's landing still describe the document on screen?
 *
 * Answered THROUGH the shared projection rather than by re-implementing its
 * trust boundary here: a second copy of that rule would drift, and the two
 * copies would disagree about whether a primer binds at all.
 *
 *   'live'        — the file's own site was confirmed for this document
 *   'stale'       — the record has sites, but none of them holds here
 *   'unanchored'  — the record never claimed a site
 */
export function anchorState(record, ctx = {}) {
  const sites = Array.isArray(record?.sites) ? record.sites : [];
  if (sites.length === 0) return 'unanchored';
  const occurrences = projectPrimerSites(record, ctx);
  return occurrences.some((o) => o.evidence === 'source') ? 'live' : 'stale';
}
