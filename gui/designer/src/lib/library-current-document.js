/**
 * library-current-document.js — the single coherent view of the plasmid a
 * Library inspector is showing (ANN-INTEGRITY seam BG-026 / BG-028).
 *
 * A Library entry has a SAVED payload (`item.sequence / annotations / topology`)
 * and, while the biolog is editing, a TRANSIENT buffer
 * (`edits.editedSequence / editedAnnotations / editedTopology`). Overview,
 * Sequence, Annotator, the feature strip, the validators and the FeatureEditor
 * must all read ONE consistent document — never a saved sequence spliced
 * together with edited annotations, and never a stale `length` from the saved
 * payload after the buffer changed the sequence.
 *
 * `buildCurrentDocument` produces that one object:
 *
 *   { entryId, sequence, annotations, topology, length, docEpoch, transient }
 *
 * Rules:
 *   - `sequence` / `topology` come from the buffer when present, else the saved
 *     payload. `annotations` likewise.
 *   - `length` is ALWAYS `sequence.length` — the projection is derived, so a
 *     buffer that changed the sequence can never be shown with the old length.
 *   - `transient` is true iff the buffer diverges in SEQUENCE or TOPOLOGY. That
 *     is the edit kind that must NOT overwrite the saved payload / IndexedDB
 *     silently — it requires an explicit «Сохранить версию». An annotation-only
 *     edit is NOT transient in this sense and may be autosaved in place.
 *   - `docEpoch` is supplied by the caller (a monotonic counter bumped on every
 *     committed document change) and travels with the document so the Annotator
 *     can key its jobs on it (seam BG-033 / observable point 7).
 *
 * Pure — no React, no store, no DOM.
 */

/** True iff the transient buffer changes the SEQUENCE or TOPOLOGY of the saved entry. */
export function isSequenceDivergent(item, edits) {
  if (!edits) return false;
  const savedSeq = (item && item.sequence) || '';
  const savedTopo = (item && item.topology) || 'linear';
  if (edits.editedSequence != null && edits.editedSequence !== savedSeq) return true;
  if (edits.editedTopology != null && (edits.editedTopology || 'linear') !== savedTopo) {
    return true;
  }
  return false;
}

/** True iff there is a transient annotation buffer (edited annotations present). */
export function hasAnnotationBuffer(edits) {
  return !!(edits && Array.isArray(edits.editedAnnotations));
}

/**
 * Whether an annotation-only autosave is permitted for the current document.
 *
 * Annotation-only autosave stays for a CLEAN saved document (no sequence /
 * topology divergence). Once the buffer holds an edited sequence or topology,
 * the annotations belong to that unsaved edited document, so writing them back
 * to the saved payload would mix two different documents — refuse, and let
 * «Сохранить версию» commit the coherent new version instead.
 */
export function annotationOnlyAutosaveAllowed(item, edits) {
  if (!item) return false;
  return !isSequenceDivergent(item, edits);
}

/**
 * Build the single coherent current document from the saved entry plus the
 * transient edit buffer.
 *
 * @param {Object|null} item  — the parsed/saved library entry
 * @param {Object|null} edits — the transient buffer, or null/undefined
 * @param {number} [docEpoch] — caller-managed monotonic document generation
 * @returns {Object|null} the coherent current document, or null when no item
 */
export function buildCurrentDocument(item, edits, docEpoch = 0) {
  if (!item) return null;
  const savedSeq = item.sequence || '';
  const savedTopo = item.topology || 'linear';

  const sequence = edits && edits.editedSequence != null ? edits.editedSequence : savedSeq;
  const topology = (edits && edits.editedTopology != null ? edits.editedTopology : savedTopo)
    || 'linear';
  const annotations = hasAnnotationBuffer(edits)
    ? edits.editedAnnotations
    : (item.annotations || []);

  return {
    entryId: item._libraryEntryId || item.id || null,
    sequence,
    annotations,
    topology,
    // Derived from the shown sequence — never the saved payload's stale length.
    length: sequence.length,
    docEpoch,
    transient: isSequenceDivergent(item, edits),
  };
}

/**
 * A stable content key for the current document, sensitive to identity, epoch
 * and topology. The Annotator uses this (with the frozen scope) to detect a
 * document change between launching a job and its callback returning.
 */
export function documentKey(doc) {
  if (!doc) return 'none';
  return `${doc.entryId ?? '?'}|${doc.docEpoch ?? 0}|${doc.topology ?? 'linear'}|${doc.length ?? 0}`;
}
