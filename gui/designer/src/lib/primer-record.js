/**
 * primer-record.js — the canonical imported primer record (ANN-0L, v2).
 *
 * One source record in, one record out. No merging by name, sequence or hash:
 * two entries in a file are two things the user created, and collapsing them
 * destroys one of them.
 *
 * A record holds `0..N` binding sites. Three facts stay separate, and `null`
 * always means "unknown" while `''` means "proven absent":
 *
 *   sequence                  the full ordered oligo 5'->3', only when the
 *                             source actually states it
 *   site.annealedSequence     the stretch that anneals, in primer orientation
 *   site.tail                 the 5' prefix before it, only when provable
 *
 * A stretch read off the template is NEVER promoted to `sequence`: it is what
 * anneals there, not what the user ordered.
 */

import { makeId } from './ids';
import { reverseComplement } from '../sequence-utils';

export const PRIMER_RECORD_VERSION = 2;

/** Free-text `sequence: ACGT…` form some tools write into a note. */
const NOTE_SEQ_RE = /sequence\s*[:=]\s*([ACGTURYSWKMBDHVN]+)/i;

const clean = (s) => (typeof s === 'string' ? s.trim().toUpperCase() : '');

/** A blank canonical record. Everything unknown is `null`, never invented. */
export function makePrimerRecord(over = {}) {
  return {
    schemaVersion: PRIMER_RECORD_VERSION,
    id: over.id || makeId(),
    ...over,
    name: over.name || 'primer',
    description: over.description || '',
    sequenceSource: over.sequenceSource || 'unknown',
    origin: over.origin || { kind: 'unknown' },
    // `null` is the contract's "unknown oligo"; `undefined` is just an absent
    // key, and letting it through would make the record fail a deep-equal
    // round-trip for no reason.
    sequence: over.sequence ?? null,
    sites: Array.isArray(over.sites) ? over.sites : [],
  };
}

/**
 * Derive what anneals at one site.
 *
 * `annealedBases` from the source wins. Otherwise the exact target slice is
 * taken, reverse-complemented for a minus-strand site so the value is always in
 * primer orientation. Unknown stays `null`.
 */
function annealedAt(site, template) {
  const declared = clean(site.annealedBases ?? site.annealedSequence);
  if (declared) return declared;
  if (!template) return null;

  // Read every segment in traversal order, so a binding that runs across the
  // origin yields the bases the oligo actually anneals to. Reading only
  // `start..end` there gives the wrap sentinel (end <= start) and nothing at all.
  const segs = Array.isArray(site.segments) && site.segments.length
    ? site.segments
    : (Number.isInteger(site.start) && Number.isInteger(site.end)
      ? [{ start: site.start, end: site.end }]
      : []);
  if (segs.length === 0) return null;

  let top = '';
  for (const sg of segs) {
    if (!Number.isInteger(sg.start) || !Number.isInteger(sg.end)) return null;
    if (sg.start < 0 || sg.end <= sg.start || sg.end > template.length) return null;
    top += template.slice(sg.start, sg.end);
  }
  top = top.toUpperCase();
  return site.strand === -1 ? reverseComplement(top) : top;
}

/**
 * The 5' tail, only when it can be proved.
 *
 * A sourced full oligo that literally ends with the annealed stretch has that
 * prefix as its tail; equal strings mean a proven-absent tail (`''`); anything
 * else is unknown (`null`). Never reconstructed by arithmetic.
 */
function provableTail(fullOligo, annealed) {
  if (!fullOligo || !annealed) return null;
  if (fullOligo === annealed) return '';
  if (fullOligo.endsWith(annealed)) return fullOligo.slice(0, -annealed.length);
  return null;
}

/** One canonical site from a source binding site. */
function buildSite(raw, index, template, targetEntryId, targetDocument = null) {
  const strand = raw.strand === -1 ? -1 : (raw.strand === 1 ? 1 : null);
  const segments = Array.isArray(raw.segments) && raw.segments.length
    ? raw.segments.map((s) => ({ start: s.start, end: s.end }))
    : (Number.isInteger(raw.start) && Number.isInteger(raw.end)
      ? [{ start: raw.start, end: raw.end }]
      : []);
  return {
    id: raw.id || makeId(),
    sourceIndex: index,
    // ANN-0M root C — WHICH molecule, and WHICH VERSION of it, this site was
    // declared against. `entryId` alone cannot tell that the sequence has been
    // edited since, so an old coordinate kept looking like the file's own
    // answer. The values come from the committed library row, never from here.
    target: {
      entryId: targetEntryId ?? null,
      resourceHash: targetDocument?.resourceHash ?? null,
      topology: targetDocument?.topology ?? null,
    },
    location: {
      kind: segments.length > 1 ? 'join' : 'single',
      segments,
    },
    strand,
    annealedSequence: annealedAt({ ...raw, strand }, template),
    tail: null,
    meltingTemperature: typeof raw.meltingTemperature === 'number'
      ? raw.meltingTemperature
      : null,
    sourceVisibility: raw.sourceVisibility || 'shown',
    // The form the FILE used, as the parser reported it. Guessing it from a
    // `simplified` flag that the batch may not carry loses the distinction.
    sourceForms: raw.sourceForms
      || (raw.sourceForm ? [raw.sourceForm] : [raw.simplified ? 'simplified' : 'standard']),
  };
}

/**
 * Collapse only an exact duplicate SERIALISATION of one site.
 *
 * Same location + strand written twice (SnapGene emits a `simplified` copy) is
 * one biological site with two source forms. This is a representation
 * normalisation — it never merges two different primers.
 */
/**
 * The facts that make two statements the SAME binding (ANN-0M root B).
 *
 * A source file often states one site twice - SnapGene writes a `simplified`
 * repeat alongside the full form. Those may be folded. But two statements that
 * disagree about where the oligo anneals, how tightly it binds, or whether the
 * file meant to show it are two different claims, and folding them would
 * publish a third value that the file never made. Only the form itself may
 * differ, because the form is how the file spoke, not what it said.
 */
function siteIdentity(site) {
  return JSON.stringify([
    site.location.segments,
    site.strand,
    site.annealedSequence,
    site.meltingTemperature,
    site.sourceVisibility,
  ]);
}

function foldDuplicateForms(sites) {
  const out = [];
  for (const site of sites) {
    const key = siteIdentity(site);
    const seen = out.find((s) => siteIdentity(s) === key);
    if (seen) {
      // Same binding, stated again: remember the extra form, change nothing else.
      for (const f of site.sourceForms || []) {
        if (!seen.sourceForms.includes(f)) seen.sourceForms.push(f);
      }
      continue;
    }
    out.push({ ...site, sourceForms: [...(site.sourceForms || [])] });
  }
  return out;
}

/** Attach the per-site tail once the full oligo is known. */
function withTails(record) {
  record.sites = record.sites.map((s) => ({
    ...s,
    tail: provableTail(record.sequence, s.annealedSequence),
  }));
  return record;
}

/**
 * SnapGene primer packet -> canonical records.
 *
 * `sites` are the ones SnapGene displays; `allSites` additionally carries the
 * ones it hides. Hidden sites are KEPT and marked, because a hidden site is
 * still a place the file says this oligo anneals.
 */
/**
 * Which record of the source packet this is (ANN-0M root B).
 *
 * The parser's own value wins when it is usable; otherwise the position in the
 * packet is the answer. Converting one primer at a time made every record
 * "position 0", which is the only thing that told two identically named oligos
 * apart - so this must be read from the WHOLE packet, never from a slice.
 */
function packetIndex(raw, i) {
  const declared = raw?.sourceRecordIndex;
  return Number.isSafeInteger(declared) && declared >= 0 ? declared : i;
}

export function primerRecordsFromSnapGenePacket(packet, opts = {}) {
  const {
    template = '', entryId = null, sourceFileName = null, targetDocument = null,
  } = opts;
  return (Array.isArray(packet) ? packet : []).map((p, i) => {
    const shown = Array.isArray(p.sites) ? p.sites : [];
    const all = Array.isArray(p.allSites) && p.allSites.length ? p.allSites : shown;
    const shownKeys = new Set(shown.map((s) => `${s.start}:${s.end}:${s.strand}`));

    const sites = foldDuplicateForms(all.map((raw, k) => buildSite({
      ...raw,
      sourceVisibility: shownKeys.has(`${raw.start}:${raw.end}:${raw.strand}`)
        ? 'shown'
        : 'hidden',
    }, k, template, entryId, targetDocument)));

    const sourced = clean(p.sequence);
    // A parser-reconstructed value is not a stated oligo.
    const isSourced = sourced && p.sequenceSource !== 'derived';

    return withTails(makePrimerRecord({
      name: p.name || 'primer',
      description: p.description || '',
      sequence: isSourced ? sourced : null,
      sequenceSource: isSourced ? 'source' : 'unknown',
      origin: {
        kind: 'file_import',
        format: 'snapgene',
        entryId,
        sourceFileName,
        sourceRecordIndex: packetIndex(p, i),
      },
      sites,
    }));
  });
}

/**
 * GenBank `primer_bind` features -> canonical records.
 *
 * One feature is one record. Two features that happen to share a name and an
 * oligo remain two records: the file lists them separately, so the user has two.
 */
export function primerRecordsFromFeatures(features, opts = {}) {
  const {
    template = '', entryId = null, sourceFileName = null, targetDocument = null,
  } = opts;
  const binds = (Array.isArray(features) ? features : [])
    .filter((f) => f && f.type === 'primer_bind');

  return binds.map((f, i) => {
    const q = f.qualifiers || {};
    const note = Array.isArray(q.note) ? q.note.join(' ') : (q.note || '');
    const sourced = clean(q.primer_seq) || clean(NOTE_SEQ_RE.exec(note)?.[1] || '');

    // The canonical location wins when the parser supplies one: a `primer_bind`
    // that crosses the origin is two segments, and its scalar projection is the
    // wrap sentinel, not a span that can be drawn.
    const segments = Array.isArray(f.location?.segments) && f.location.segments.length
      ? f.location.segments.map((sg) => ({ start: sg.start, end: sg.end }))
      : null;
    // ANN-0L C1 — a feature whose location the gate refused yields ZERO usable
    // sites, not one empty site. The oligo and its provenance are kept; there
    // is simply nowhere on the molecule to draw it.
    const hasUsableLocation = !f.locationRejected
      && (segments !== null || (Number.isInteger(f.start) && Number.isInteger(f.end)));
    const sites = hasUsableLocation
      ? foldDuplicateForms([
        buildSite(
          { segments, start: f.start, end: f.end, strand: f.strand },
          0, template, entryId, targetDocument,
        ),
      ])
      : [];

    return withTails(makePrimerRecord({
      name: f.name || q.label || 'primer',
      description: typeof note === 'string' ? note : '',
      sequence: sourced || null,
      sequenceSource: sourced ? 'source' : 'unknown',
      origin: {
        kind: 'file_import',
        format: 'genbank',
        entryId,
        sourceFileName,
        sourceRecordIndex: packetIndex(f, i),
      },
      sites,
    }));
  });
}
