/**
 * primer-site-projection.js — the ONE shared projection every primer renderer
 * reads (ANN-0L).
 *
 * The circular map, the linear map and the SequenceView must agree on where a
 * primer binds. Before this, each surface decided for itself — and the
 * SequenceView decided by scanning the template with `indexOf`, so a declared
 * site on a repetitive molecule multiplied into phantom hits while a primer
 * with no site vanished from every view.
 *
 * ── Trust boundary (ANN-0L C2) ────────────────────────────────────────────
 * A source site is a fact about ONE version of ONE molecule. Shown against a
 * different entry, a different topology, or an edited buffer it stops being
 * evidence and becomes a stale coordinate wearing the file's authority. So the
 * caller must say which document it is drawing, and a site that named a target
 * is confirmed only against that same target:
 *
 *   * the site names an entry, the caller names none      → withheld
 *   * the site names an entry, the caller names another   → withheld
 *   * the site names a document version that no longer
 *     matches (same-length edit, topology change,
 *     rotate-origin, unsaved buffer)                      → withheld
 *   * any segment out of range, inverted, or non-integer  → withheld
 *   * a wrap on a molecule with no origin to cross        → withheld
 *
 * Withheld means the GLYPH is withheld. The record always survives — a primer
 * the user owns is not deleted because a coordinate went stale.
 *
 * Document identity is `payload.resourceHash`, the model librarySlice already
 * recomputes on every edit; this adds no second owner.
 *
 * Occurrence shape:
 *   { primerId, siteId, key, segments, strand, sequence, annealedSequence,
 *     tail, evidence, sourceVisibility, wrapsOrigin }
 *
 *   evidence: 'source'   — the file says the primer binds here (authoritative)
 *             'computed' — no source site for this molecule, so an EXACT
 *                          canonical terminal 3′ seed of the physical oligo
 *                          was located and extended toward 5′ instead
 *
 * A computed hit is never written back as a source fact, and approximate or
 * off-target scanning is deliberately absent: it belongs in an explicit
 * analysis, not on the map.
 */

import { reverseComplement } from '../sequence-utils';
import {
  resolvePhysicalOligo,
  ANCHORED_OLIGO_OK,
} from './primer-identity';
import {
  alignPrimerBindingAtThreePrimeEnd,
  focusAlignment,
} from './primer-binding-alignment';
import { DEFAULT_PRIMER_BINDING_MIN_LENGTH } from './primer-binding-search';
import { deriveFivePrimeLanding } from './primer-five-prime-projection';

function oligoRecord(primer) {
  if (typeof primer?.tail === 'string' && primer.tail) return primer;
  if (typeof primer?.tailSequence === 'string' && primer.tailSequence) {
    return { ...primer, tail: primer.tailSequence };
  }
  return primer;
}

/** Segments run 5'->3' over forward coordinates; one high→low step is a wrap. */
function wrapsOrigin(segments) {
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].start < segments[i - 1].start) return true;
  }
  return false;
}

function siteSegments(site) {
  const segs = site?.location?.segments;
  if (Array.isArray(segs) && segs.length) {
    return segs.map((s) => ({ start: s.start, end: s.end }));
  }
  if (Number.isInteger(site?.start) && Number.isInteger(site?.end)) {
    return [{ start: site.start, end: site.end }];
  }
  return [];
}

/** Forward-coordinate positions of a footprint, in segment reading order. */
function segmentPositions(segments) {
  const out = [];
  for (const s of segments) for (let p = s.start; p < s.end; p += 1) out.push(p);
  return out;
}

/** Group a forward-ordered position list back into contiguous half-open segments. */
function positionsToSegments(positions) {
  const out = [];
  let segStart = positions[0];
  let prev = positions[0];
  for (let k = 1; k < positions.length; k += 1) {
    const p = positions[k];
    if (p === prev + 1) { prev = p; continue; }
    out.push({ start: segStart, end: prev + 1 });
    segStart = p;
    prev = p;
  }
  out.push({ start: segStart, end: prev + 1 });
  return out;
}

/**
 * Shrink the anchor footprint to the effective landing subspan.
 *
 * A terminal trim shortens the honest landing: the query lands on a SUBSPAN of
 * the anchor, and the clipped anchor bases leave the footprint entirely rather
 * than becoming deletions. `span` is in the primer's own orientation, so a
 * minus-strand landing is mapped from its 3′ (forward-low) edge. Returns `null`
 * when the footprint cannot be reconciled with the anchor length — a trim we
 * cannot place is withheld, not drawn at a guessed length.
 */
function effectiveFootprint(segments, strand, span, anchorLength) {
  const forward = segmentPositions(segments);
  if (forward.length !== anchorLength) return null;
  const ordered = strand === -1 ? forward.slice().reverse() : forward;
  const sub = ordered.slice(span.start, span.end);
  if (!sub.length) return null;
  const forwardSub = strand === -1 ? sub.slice().reverse() : sub;
  return positionsToSegments(forwardSub);
}

/**
 * Is this geometry drawable on this molecule?
 *
 * Rejects what cannot be true rather than clamping it into something that
 * looks plausible: a clamped span is a wrong answer rendered confidently.
 */
function segmentsAreDrawable(segments, length, circular) {
  if (!Array.isArray(segments) || segments.length === 0) return false;
  // More than one segment means the binding crosses the origin, and only a
  // circular molecule has an origin to cross.
  if (segments.length > 1 && !circular) return false;
  if (segments.length > 2) return false;
  for (const s of segments) {
    if (!Number.isSafeInteger(s.start) || !Number.isSafeInteger(s.end)) return false;
    if (s.start < 0 || s.end <= s.start) return false;
    if (Number.isFinite(length) && length > 0 && s.end > length) return false;
  }
  return true;
}

/** Current template bases under a source footprint, in primer orientation. */
function templateBinding(template, segments, strand) {
  if (!template || (strand !== 1 && strand !== -1)) return null;
  const top = segments.map(({ start, end }) => template.slice(start, end)).join('');
  return strand === -1 ? reverseComplement(top) : top;
}

/**
 * Does this source site describe the document the caller is drawing?
 *
 * Fails closed: anything unproven counts as "not this document".
 */
function siteBelongsToDocument(site, { entryId, documentHash, topology }) {
  const target = site?.target || null;
  const targetEntry = target?.entryId ?? null;
  if (targetEntry == null) {
    // Nothing was claimed about a molecule, so nothing can be confirmed.
    return true;
  }
  // The site named a molecule. An unidentified host cannot claim to be it.
  if (entryId == null || targetEntry !== entryId) return false;

  // It must also name a VERSION. A site with no recorded version cannot be
  // shown to still hold - the sequence may have been edited a dozen times
  // since - so it is withheld rather than presented as the file's own answer.
  const targetHash = target?.resourceHash ?? null;
  if (targetHash == null) return false;
  if (documentHash == null || targetHash !== documentHash) return false;

  // Topology is part of what the coordinates mean: the same bases read as a
  // ring and as a line are different molecules. The stored document hash is
  // not refreshed on a topology flip, so it is compared here explicitly.
  const targetTopology = target?.topology ?? null;
  if (targetTopology != null && topology != null && targetTopology !== topology) return false;
  return true;
}

/**
 * The ONE context every primer surface is given (ANN-0M root D).
 *
 * Built once by the host that knows what is on screen, then handed down
 * unchanged. Assembling a partial variant per surface is how two views ended
 * up disagreeing about whether a primer binds at all.
 *
 * @param {object} args
 * @param {string|null} args.entryId       which molecule
 * @param {string} args.sequence           its CURRENT bases
 * @param {string} args.topology           'circular' | 'linear'
 * @param {string|null} args.documentHash  its committed resourceHash, or null
 *                                         for a buffer nobody has committed
 */
export function buildRenderContext({
  entryId = null, sequence = '', topology = 'linear', documentHash = null,
} = {}) {
  const template = typeof sequence === 'string' ? sequence : '';
  return {
    entryId: entryId ?? null,
    template,
    // Length is derived, never passed alongside: a length that disagrees with
    // the sequence is a bounds gate checking against the wrong molecule.
    length: template.length,
    topology: topology === 'circular' ? 'circular' : 'linear',
    documentHash: documentHash ?? null,
  };
}

/**
 * Every exact occurrence of one split-independent terminal 3′ seed.
 *
 * The tail/body fields are authoring helpers, so neither may choose the
 * candidate set. A fixed suffix of the full physical oligo locates possible
 * 3′ endpoints; the full oligo is then locally aligned at that endpoint so
 * upstream complementary islands survive internal X/I/D runs.
 */
function exactHits(primer, current, template, { circular, direction }) {
  if (!current.sequence || !template) return [];
  const out = [];
  const seen = new Set();
  const n = template.length;
  const seedLength = Math.min(DEFAULT_PRIMER_BINDING_MIN_LENGTH, current.sequence.length);
  const needle = current.sequence.slice(-seedLength);

  // Ambiguity codes are not proof of exact complementarity. Also refuse a
  // seed longer than a circular molecule: repeating template bases for a
  // second lap would manufacture a landing that no physical ring contains.
  if (!/^[ACGT]+$/.test(needle) || needle.length > n) return [];

  const push = (idx, strand) => {
    // A hit running past the end is only real on a circular molecule, where it
    // continues across the origin as two segments of one binding.
    const end = idx + needle.length;
    const seedSegments = end <= n
      ? [{ start: idx, end }]
      : [{ start: idx, end: n }, { start: 0, end: end - n }];
    const target = templateBinding(template, seedSegments, strand);
    const alignment = alignPrimerBindingAtThreePrimeEnd(current.sequence, target);
    const landing = deriveFivePrimeLanding({
      sequence: current.sequence,
      alignment,
      segments: seedSegments,
      strand,
      template,
      circular,
    });
    if (!landing || !segmentsAreDrawable(landing.segments, n, circular)) return;
    // A computed candidate is identified by strand and biological 3′ endpoint,
    // not by how far its 5′ side happened to extend. This is the invariant that
    // survives moving bases between the two helper fields.
    const threePrimeEnd = strand === -1
      ? idx
      : (circular ? (idx + needle.length) % n : idx + needle.length);
    const key = `${primer.id}#computed:${threePrimeEnd}:${strand}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      primerId: primer.id,
      siteId: null,
      key,
      segments: landing.segments,
      strand,
      sequence: current.sequence,
      annealedSequence: landing.annealedSequence,
      tail: landing.tail,
      unpairedPrefixLength: landing.unpairedPrefixLength,
      confirmedFivePrimeSuffixLength: landing.confirmedFivePrimeSuffixLength,
      bindingModel: current.bindingModel || null,
      oligoStatus: current.status,
      alignment: landing.alignment,
      evidence: 'computed',
      sourceVisibility: 'shown',
      wrapsOrigin: wrapsOrigin(landing.segments),
    });
  };

  // Searching template+template lets an origin-crossing locus be found once;
  // an index at or past `n` is the same locus seen a second time.
  const haystack = circular && n > 0 ? template + template : template;
  const scan = (seq, strand) => {
    for (let i = haystack.indexOf(seq); i !== -1; i = haystack.indexOf(seq, i + 1)) {
      if (i >= n) break;
      if (!circular && i + seq.length > n) break;
      push(i, strand);
    }
  };

  // An explicit direction is a fact about the oligo. Reporting the opposite
  // strand because the reverse complement also matches would contradict it.
  const rc = reverseComplement(needle);
  if (rc === needle) {
    // Self-complementary: both orientations land on the SAME loci, so there is
    // one set of hits and the record's own direction says which strand it is.
    // Skipping them because "the forward scan is not allowed" would lose a
    // reverse primer's binding site entirely.
    scan(needle, direction === 'reverse' ? -1 : 1);
  } else {
    if (direction !== 'reverse') scan(needle, 1);
    if (direction !== 'forward') scan(rc, -1);
  }
  return out;
}

/**
 * Project one primer record onto the molecule the caller is drawing.
 *
 * A source site ALWAYS wins over a search: if the file declares where this
 * oligo binds, that is the answer, and a repetitive template must not
 * manufacture extra copies. Only when the record has no *confirmed* source
 * site for this document is an exact fallback search performed.
 *
 * @param {object} primer canonical record
 * @param {object} ctx
 * @param {string} ctx.template          the molecule's sequence
 * @param {string|null} ctx.entryId      which molecule this is
 * @param {string|null} ctx.documentHash its current resourceHash
 * @param {string} ctx.topology          'circular' | 'linear'
 * @param {number} [ctx.length]          defaults to template.length
 */
export function projectPrimerSites(primer, ctx = {}) {
  if (!primer) return [];
  const {
    template = '', entryId = null, documentHash = null, topology,
  } = ctx;
  const length = Number.isFinite(ctx.length) ? ctx.length : (template ? template.length : 0);
  const circular = topology === 'circular';
  const sites = Array.isArray(primer.sites) ? primer.sites : [];

  const confirmed = sites.filter(
    (s) => siteBelongsToDocument(s, { entryId, documentHash, topology }),
  );

  if (confirmed.length > 0) {
    // Every confirmed site with unusable geometry is dropped, and the fallback
    // is NOT run: dressing a search up as the file's own answer, for a primer
    // the file already placed, is exactly the confusion this boundary exists
    // to prevent.
    return confirmed
      .map((site) => {
        let segments = siteSegments(site);
        if (!segmentsAreDrawable(segments, length, circular)) return null;
        const strand = site.strand === 1 || site.strand === -1 ? site.strand : null;
        // SEQ-VIS-1 — the site owns WHERE, the record owns WHAT. Handing the
        // site's own `tail`/`annealedSequence` straight to the renderer meant a
        // tail added after the landing was declared never appeared, while a
        // stale one did; and a record storing its overhang inside a long
        // `bindingSequence` drew only its historical snapshot. Read against the
        // fixed anchor, the current oligo splits into overhang + landing.
        // Anything unreadable keeps the site's own answer rather than inventing
        // a tail.
        // Resolve only the physical oligo here. A confirmed site's historical
        // helper split is not biological evidence: legacy/imported records may
        // put the same bases on either side of the tail/body UI boundary. The
        // pinned full-sequence alignment below is the sole owner of the current
        // landing and its true unpaired 5′ prefix.
        const current = resolvePhysicalOligo(oligoRecord(primer), {
          anchor: site.annealedSequence,
        });
        const resolved = current.status === ANCHORED_OLIGO_OK;
        // The site snapshot is only the historical split anchor. Biological
        // complementarity is always judged against the CURRENT molecule under
        // the confirmed footprint, including legacy/imported records that do
        // not carry a binding-model marker.
        const actualTarget = templateBinding(
          String(template || '').toUpperCase(), segments, strand,
        );
        let alignment = resolved && actualTarget != null
          // The full physical oligo is the biological input. `tail` and
          // `bindingSequence` are authoring conveniences and must not change
          // the landing when their concatenation is the same.
          ? alignPrimerBindingAtThreePrimeEnd(current.sequence, actualTarget)
          : null;
        // P5 — a terminal trim lands the whole query on a SUBSPAN of the anchor.
        // The clipped anchor bases leave the footprint (they are honest clips,
        // not deletions), so the drawn segments shrink to the effective landing
        // and the alignment is re-based onto it. A trim we cannot geometrically
        // reconcile with the anchor is withheld, never drawn at a wrong length.
        if (alignment && alignment.targetSpan
          && (alignment.targetSpan.start !== 0
            || alignment.targetSpan.end !== alignment.target.length)) {
          const shrunk = strand != null
            ? effectiveFootprint(segments, strand, alignment.targetSpan, alignment.target.length)
            : null;
          if (!shrunk || !segmentsAreDrawable(shrunk, length, circular)) return null;
          segments = shrunk;
          alignment = focusAlignment(alignment);
        }
        let landing = null;
        if (resolved && alignment && strand != null) {
          landing = deriveFivePrimeLanding({
            sequence: current.sequence,
            alignment,
            segments,
            strand,
            template: String(template || '').toUpperCase(),
            circular,
          });
          if (!landing || !segmentsAreDrawable(landing.segments, length, circular)) return null;
          segments = landing.segments;
          alignment = landing.alignment;
        }
        return {
          primerId: primer.id,
          siteId: site.id,
          key: `${primer.id}#${site.id}`,
          segments,
          strand,
          sequence: resolved ? current.sequence : null,
          annealedSequence: resolved
            ? (landing?.annealedSequence || current.binding)
            : null,
          tail: resolved ? (landing ? landing.tail : (current.tail || null)) : null,
          unpairedPrefixLength: resolved
            ? (landing?.unpairedPrefixLength ?? current.tail.length)
            : null,
          confirmedFivePrimeSuffixLength: landing?.confirmedFivePrimeSuffixLength ?? 0,
          bindingModel: resolved ? (current.bindingModel || null) : null,
          alignment,
          oligoStatus: current.status,
          evidence: 'source',
          sourceVisibility: site.sourceVisibility || 'shown',
          wrapsOrigin: wrapsOrigin(segments),
        };
      })
      .filter(Boolean);
  }

  // No source site confirmed for this document — locate an exact canonical
  // terminal 3′ seed of the FULL physical oligo, then derive its anchored-local
  // landing in the current template. The helper tail/body split never chooses
  // candidate loci.
  const current = resolvePhysicalOligo(oligoRecord(primer));
  if (current.status !== ANCHORED_OLIGO_OK || !current.sequence) return [];
  return exactHits(
    primer,
    current,
    (template || '').toUpperCase(),
    { circular, direction: primer.direction || null },
  );
}

/** Project a whole pool; input order is preserved. */
export function projectPrimerPool(primers, ctx = {}) {
  const out = [];
  (primers || []).forEach((p, i) => {
    // A legacy pool row can have no id; index it so occurrence keys stay unique
    // and one id-less primer never masks another.
    const fallbackId = p?.id ?? `#${i}`;
    for (const occ of projectPrimerSites(p, ctx)) {
      out.push(occ.primerId == null
        ? { ...occ, primerId: fallbackId, key: `${fallbackId}${occ.key.slice(String(occ.primerId).length)}` }
        : occ);
    }
  });
  return out;
}
