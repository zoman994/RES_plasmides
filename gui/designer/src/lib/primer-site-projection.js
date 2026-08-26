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
 *             'computed' — no source site for this molecule, so an EXACT match
 *                          of the known binding sequence was located instead
 *
 * A computed hit is never written back as a source fact, and approximate or
 * off-target scanning is deliberately absent: it belongs in an explicit
 * analysis, not on the map.
 */

import { reverseComplement } from '../sequence-utils';
import { resolveAnchoredOligo, ANCHORED_OLIGO_OK } from './primer-identity';

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

/** Every exact occurrence of `needle`, as occurrences on this molecule. */
function exactHits(primer, current, template, { circular, direction }) {
  const needle = current.binding;
  if (!needle || !template) return [];
  const out = [];
  const n = template.length;

  const push = (idx, strand, seq) => {
    // A hit running past the end is only real on a circular molecule, where it
    // continues across the origin as two segments of one binding.
    const end = idx + seq.length;
    const segments = end <= n
      ? [{ start: idx, end }]
      : [{ start: idx, end: n }, { start: 0, end: end - n }];
    out.push({
      primerId: primer.id,
      siteId: null,
      key: `${primer.id}#computed:${idx}:${strand}`,
      segments,
      strand,
      sequence: current.sequence,
      annealedSequence: current.binding,
      // A computed hit locates the oligo; it proves nothing new about it, so a
      // tail the record already knows is carried, never invented.
      tail: current.tail
        || (typeof primer.tailSequence === 'string' && primer.tailSequence
          ? primer.tailSequence : null),
      oligoStatus: current.status,
      evidence: 'computed',
      sourceVisibility: 'shown',
      wrapsOrigin: segments.length > 1,
    });
  };

  // Searching template+template lets an origin-crossing locus be found once;
  // an index at or past `n` is the same locus seen a second time.
  const haystack = circular && n > 0 ? template + template : template;
  const scan = (seq, strand) => {
    for (let i = haystack.indexOf(seq); i !== -1; i = haystack.indexOf(seq, i + 1)) {
      if (i >= n) break;
      if (!circular && i + seq.length > n) break;
      push(i, strand, seq);
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
        const segments = siteSegments(site);
        if (!segmentsAreDrawable(segments, length, circular)) return null;
        // SEQ-VIS-1 — the site owns WHERE, the record owns WHAT. Handing the
        // site's own `tail`/`annealedSequence` straight to the renderer meant a
        // tail added after the landing was declared never appeared, while a
        // stale one did; and a record storing its overhang inside a long
        // `bindingSequence` drew only its historical snapshot. Read against the
        // fixed anchor, the current oligo splits into overhang + landing — and
        // `binding` is exactly the anchor's length, so the footprint below is
        // untouched. Anything unreadable keeps the site's own answer rather
        // than inventing a tail.
        const current = resolveAnchoredOligo(oligoRecord(primer), { anchor: site.annealedSequence });
        const resolved = current.status === ANCHORED_OLIGO_OK;
        return {
          primerId: primer.id,
          siteId: site.id,
          key: `${primer.id}#${site.id}`,
          segments,
          strand: site.strand === 1 || site.strand === -1 ? site.strand : null,
          sequence: resolved ? current.sequence : null,
          annealedSequence: resolved
            ? current.binding
            : null,
          tail: resolved ? (current.tail || null) : null,
          bindingModel: resolved ? (current.bindingModel || null) : null,
          alignment: resolved ? (current.alignment || null) : null,
          oligoStatus: current.status,
          evidence: 'source',
          sourceVisibility: site.sourceVisibility || 'shown',
          wrapsOrigin: wrapsOrigin(segments),
        };
      })
      .filter(Boolean);
  }

  // No source site confirmed for this document — fall back to an exact search
  // of what we know anneals, marked `computed` so no consumer mistakes it for
  // a fact from the file.
  const current = resolveAnchoredOligo(oligoRecord(primer));
  if (current.status !== ANCHORED_OLIGO_OK || !current.binding) return [];
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
