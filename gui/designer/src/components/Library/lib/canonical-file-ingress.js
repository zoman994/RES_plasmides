/**
 * canonical-file-ingress.js — the ONE owner of "dropped files became library rows".
 *
 * Every import surface (StartScreen drag-drop, LibraryWorkspace picker/paste)
 * routes through `importFilesToLibrary`, so a molecule can only enter the
 * library one way: parse → enrich → shape → awaited durable commit → primers.
 *
 * What this exists to prevent (ANN-0I):
 *   * StartScreen read `.dna` as TEXT and stored the raw file as the sequence;
 *   * it called `addLibraryEntriesBulk({ projectId, entries })` — the slice
 *     takes an ARRAY — never awaited it, and reported success unconditionally,
 *     so nothing was written and the biologist was told it worked;
 *   * a feature the location gate refused vanished with no warning at all.
 *
 * Contract of the return value:
 *   ok         — true only when at least one row was durably committed
 *   committed  — the rows the STORE confirmed, never the rows we hoped to write
 *   rejected   — [{ file, count, items:[{name, reason}] }] per file
 *   warnings   — human-readable partial-import lines, one per affected file
 *   errors     — per-file parse/commit failures
 */

import { parseFile, enrichAnnotations, extractItemName } from '../../../file-import';
import { buildLibraryEntry } from './build-library-entry';
import { makeId } from '../../../lib/ids';
import { computeResourceHash } from './resource-hash';
import { tf, t } from '../../../i18n';
import {
  primerRecordsFromSnapGenePacket,
  primerRecordsFromFeatures,
} from '../../../lib/primer-record';

/** Longest run of plain nucleotides in a free-text note (`sequence: ACGT…`). */
const NOTE_SEQ_RE = /sequence\s*[:=]\s*([ACGTURYSWKMBDHVN]+)/i;

/**
 * Shape one source primer into a canonical record (ANN-0L v2).
 *
 * Delegates to `lib/primer-record`, which owns the rules: `0..N` sites, the
 * full oligo / annealed part / tail kept as three separate facts, `null` for
 * unknown and `''` only for proven-absent. Nothing here merges records.
 *
 * Still exported so the ambiguity rules can be asserted directly — multi-site
 * packets are a `.dna` shape that a GenBank fixture cannot express.
 */
export function shapePrimersForPool(primers, templateSequence, opts = {}) {
  const targetDocument = opts.targetDocument ?? null;
  const list = Array.isArray(primers) ? primers : [];
  // ANN-0M root B - ONE conversion for the WHOLE packet. Calling the converter
  // per primer handed it a one-element array, and it numbers records by their
  // position in the array it is given, so every record came back as record 0.
  // Positions are stamped here, against the whole list, before any split.
  const withIndex = list.map((p, i) => ({
    ...p,
    sourceRecordIndex: Number.isSafeInteger(p?.sourceRecordIndex) ? p.sourceRecordIndex : i,
  }));
  const isPacket = (p) => Array.isArray(p.sites) || Array.isArray(p.allSites);
  const shared = {
    template: templateSequence,
    entryId: opts.entryId ?? null,
    sourceFileName: opts.sourceFileName ?? null,
    // ANN-0M root C - the identity of the molecule as it was COMMITTED.
    targetDocument,
  };

  const packetRecords = primerRecordsFromSnapGenePacket(withIndex.filter(isPacket), shared);
  const featureRecords = primerRecordsFromFeatures(
    withIndex.filter((p) => !isPacket(p)).map((primer) => ({
      type: 'primer_bind',
      name: primer.name,
      location: primer.location || null,
      locationRejected: primer.locationRejected === true,
      start: primer.start,
      end: primer.end,
      strand: primer.strand,
      sourceRecordIndex: primer.sourceRecordIndex,
      qualifiers: primer.qualifiers || (primer.sequence
        ? { primer_seq: primer.sequence, note: primer.note }
        : { note: primer.note }),
    })),
    shared,
  );

  // Reassemble in the packet's own order.
  const byIndex = new Map();
  for (const r of [...packetRecords, ...featureRecords]) {
    byIndex.set(r.origin.sourceRecordIndex, r);
  }
  return withIndex
    .map((p) => byIndex.get(p.sourceRecordIndex))
    .filter(Boolean)
    .map(withLegacyProjection);
}

/** Legacy scalar projection for consumers that predate record v2. */
function withLegacyProjection(record) {
  // `direction` is published only when every known site agrees on a strand.
  const strands = new Set(record.sites.map((x) => x.strand).filter((x) => x != null));
  const direction = strands.size === 1
    ? ([...strands][0] === -1 ? 'reverse' : 'forward')
    : null;
  const primarySite = record.sites[0] || null;
  return {
    ...record,
    bindingSequence: primarySite?.annealedSequence ?? null,
    tail: primarySite?.tail ?? null,
    direction,
  };
}

/** Single-primer convenience over the batch. Kept for direct contract checks. */
export function shapePrimerForPool(primer, templateSequence, opts = {}) {
  const [only] = shapePrimersForPool([primer], templateSequence, opts);
  return only;
}


/** One partial-import warning line: file, how many were lost, and why. */
function formatWarning(entry) {
  const first = entry.items[0] || { name: '?', reason: t('ingress.parseFailed') };
  return tf('ingress.partial', {
    file: entry.file,
    count: entry.count,
    name: first.name,
    reason: first.reason,
    more: entry.count > 1 ? tf('ingress.partialMore', { n: entry.count - 1 }) : '',
  });
}

/**
 * Import files into the library.
 *
 * @param {File[]} files
 * @param {object} opts
 * @param {{addLibraryEntriesBulk:Function, addPrimerToPool?:Function}} opts.store
 * @param {string|null} [opts.projectId]
 * @param {boolean} [opts.autoAnnotate=true]
 * @param {string} [opts.nameOverride]
 * @param {string} [opts.topologyOverride]
 * @returns {Promise<{ok, committed, rejected, warnings, errors}>}
 */
export async function importFilesToLibrary(files, opts = {}) {
  const {
    store,
    projectId = null,
    autoAnnotate = true,
    nameOverride,
    topologyOverride,
  } = opts;

  const list = Array.from(files || []);
  const result = { ok: false, committed: [], rejected: [], warnings: [], errors: [] };
  if (list.length === 0 || !store?.addLibraryEntriesBulk) return result;

  const staged = [];

  for (const file of list) {
    try {
      const parsed = await parseFile(file);
      const item = autoAnnotate
        ? await enrichAnnotations(parsed, { autoAnnotate: true })
        : parsed;

      // A feature the gate refused is recorded per file, with the first
      // name/reason, so the UI can say what was lost and not just how much.
      const refused = parsed._rejected || [];
      if (refused.length > 0) {
        const entry = {
          file: file.name,
          count: refused.length,
          items: refused.map((r) => ({
            name: r.name || 'feature',
            reason: r.reason || t('ingress.parseFailed'),
          })),
        };
        result.rejected.push(entry);
        result.warnings.push(formatWarning(entry));
      }

      const name = (nameOverride && nameOverride.trim())
        || extractItemName(item, file);
      // ANN-0M root C - the molecule's identity is computed here, at the point
      // it becomes a stored document, so a primer site can be stamped with the
      // version it was actually declared against. `buildLibraryEntry` takes the
      // hash from its caller and was being handed `null`, which left every row
      // - and therefore every site - with no version to check against.
      let resourceHash = null;
      try {
        resourceHash = await computeResourceHash({
          sequence: item.sequence || '',
          topology: topologyOverride || item.topology,
          ends: item.ends || null,
        });
      } catch { /* no crypto -> no identity; sites will fail closed */ }
      const entry = buildLibraryEntry({ ...item, _fileName: file.name }, name, resourceHash);
      if (topologyOverride && entry.payload) entry.payload.topology = topologyOverride;
      // Ownership is stamped BEFORE persistence — a row must never land in the
      // store and only afterwards learn which project it belongs to.
      entry.projectId = projectId || null;
      entry.origin = {
        kind: 'file_import',
        sourceFileName: file.name,
        importedAt: new Date().toISOString(),
      };

      staged.push({ entry, primers: item._metadata?.primers || [], file });
    } catch (err) {
      result.errors.push(`${file.name}: ${err?.message || err}`);
    }
  }

  if (staged.length === 0) return result;

  // ── the one durable commit ────────────────────────────────────────────────
  let committed = [];
  try {
    committed = await store.addLibraryEntriesBulk(staged.map((s) => s.entry));
  } catch (err) {
    result.errors.push(tf('ingress.commitFailed', { error: err?.message || err }));
    return result;
  }
  const committedIds = new Set((committed || []).map((e) => e && e.id).filter(Boolean));
  result.committed = (committed || []).filter(Boolean);
  // Success is a property of what the STORE confirmed, never of what we sent.
  result.ok = result.committed.length > 0;

  // ── primers, only for rows that actually persisted ────────────────────────
  if (result.ok && typeof store.addPrimerToPool === 'function') {
    for (const s of staged) {
      if (!committedIds.has(s.entry.id)) continue;
      const template = s.entry.payload?.sequence || '';
      // The COMMITTED row is the receipt: identity is read back from what the
      // store confirmed, never from what we hoped to write. If the commit
      // produced no hash the record is still saved - its glyph simply fails
      // closed until the molecule has an identity to check against.
      const committedRow = (committed || []).find((e) => e && e.id === s.entry.id) || s.entry;
      const targetDocument = {
        resourceHash: committedRow.payload?.resourceHash ?? null,
        topology: committedRow.payload?.topology ?? null,
      };
      // ANN-0J root 7 — exactly one `addPrimerToPool` per distinct oligo. The
      // same primer can arrive twice (once from the SnapGene packet, once from
      // a `primer_bind` feature) and a packet primer may carry several binding
      // sites; neither may mint a duplicate pool row.
      // ANN-0M root B — the packet is converted as a packet, once, so each
      // record keeps its own position in it. ANN-0L — one source record stays
      // one pool record: no merging by name, sequence or hash, and a record
      // with no site or no known oligo is still a record the user owns.
      const shapedAll = shapePrimersForPool(s.primers, template, {
        entryId: s.entry.id, sourceFileName: s.file.name, targetDocument,
      });
      for (let k = 0; k < shapedAll.length; k++) {
        const shaped = shapedAll[k];
        const p = s.primers[k] || {};
        try {
          await store.addPrimerToPool({
            primer: { ...shaped, id: shaped.id || makeId() },
            projectId: projectId || null,
            status: 'imported',
            origin: {
              kind: 'file_import',
              entryId: s.entry.id,
              sourceFileName: s.file.name,
            },
          });
        } catch (err) {
          result.errors.push(tf('ingress.primerFailed', {
            file: s.file.name, name: p.name || '', error: err?.message || err,
          }));
        }
      }
    }
  }

  return result;
}
