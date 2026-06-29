/**
 * annotation-edit.js — pure helpers for the Sprint M-X.2 annotation
 * editing workflow. Single source of truth for create / delete /
 * update / create-batch operations on `annotations[]` arrays.
 *
 * No React, no DOM, no store reads — entry point for both the
 * SequenceView edit handlers (K3-K5) and the Annotator
 * apply-results flow (K10).
 *
 * Coordinate convention (⚓ DEC-ANN-10):
 *   - Store: 0-based exclusive end (`{ start, end }`, length =
 *     end - start). Same as elsewhere in the codebase post-V50 fix.
 *   - UI: 1-based inclusive end (popups, modals, drag tooltips).
 *
 * `toUiCoords` / `fromUiCoords` convert between the two.
 *
 * Dispatcher `applyAnnotationEdit(annotations, edit)` returns either
 * a new annotations array (kinds: create / delete / update) OR
 * `{ next, skipped }` for kind === 'create-batch' (DEC-ANN-09 dedup
 * counter — bulk Annotator apply needs the count for the «N
 * skipped as duplicates» footer toast).
 */

/**
 * B3 (audit) — feature type → annotation level. Mirrors AnnotationEditor's
 * TYPE_TO_LEVEL so the SequenceView create/edit popups can author all THREE
 * documented levels (region / detail / POINT), not just region. Point types
 * (start/stop codon, restriction site, mutation, variation, primer_bind) used to
 * be importable + renderable but NOT creatable — every create path hardcoded
 * 'region'. Unknown types default to 'region' (the safe legacy default).
 */
const TYPE_LEVEL = {
  // detail
  RBS: 'detail', Kozak: 'detail', polyA_signal: 'detail', signal_peptide: 'detail',
  propeptide: 'detail', tag: 'detail', linker: 'detail', T2A: 'detail', NLS: 'detail',
  intron: 'detail', catalytic: 'detail', binding: 'detail', domain: 'detail',
  cleavage_site: 'detail', active_site: 'detail', core_promoter: 'detail',
  poly_a: 'detail', stem_loop: 'detail',
  // point
  restriction_site: 'point', start_codon: 'point', stop_codon: 'point',
  variation: 'point', primer_bind: 'point', mutation: 'point',
};
export function levelForType(type) {
  return TYPE_LEVEL[type] || 'region';
}

/**
 * Produce a deterministic id for a region annotation. Compatible with
 * the backfill pattern in `annotation-model.getRegions`
 * (`region:<start>:<end>:<type>:<name>`).
 *
 * Predictable across calls — never call it on a region you've just
 * mutated and stash the result; the id should be derived fresh each
 * time the region's coords/type/name change so we don't end up with
 * stale ids in the array. The store doesn't index by id — it's a
 * stable reference for React keys + Annotator accept/reject sets.
 */
export function generateAnnotationId({ start, end, type, name }) {
  const t = type || 'unknown';
  const n = name == null ? '' : String(name);
  return `region:${start}:${end}:${t}:${n}`;
}

/**
 * Validate that a (start, end, seqLength) triple describes a valid
 * region. Returns `{ valid: true }` on success, `{ valid: false,
 * error }` with a human-readable Russian error message otherwise.
 *
 * Rules: start >= 0; end > start (no zero-length, no flips);
 *   end <= seqLength.
 */
export function validateAnnotationCoords(start, end, seqLength) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { valid: false, error: 'Координаты должны быть числами' };
  }
  if (start < 0) return { valid: false, error: 'Начало < 0' };
  if (start >= end) return { valid: false, error: 'Начало должно быть меньше конца' };
  if (Number.isFinite(seqLength) && end > seqLength) {
    return { valid: false, error: `Конец > длины последовательности (${seqLength})` };
  }
  return { valid: true };
}

/**
 * Construct a new region annotation. Throws on invalid coords (the
 * caller — popup, modal, batch dispatcher — has already validated and
 * a thrown error here is a programmer mistake, not a user mistake).
 *
 * `level` defaults to 'region' (the only level today's editing
 * surface produces); detail / point editing is out of scope for
 * Sprint M-X.2.
 */
export function createAnnotation({
  id,
  name = '',
  type = 'misc_feature',
  start,
  end,
  level = 'region',
  strand = 1,
  regionId,
  predicted,
  source,
  confidence,
  signals,
}, seqLength) {
  const v = validateAnnotationCoords(start, end, seqLength);
  if (!v.valid) throw new Error(`createAnnotation: ${v.error}`);
  const ann = {
    // Preserve an explicit id when given — cross-referencing annotations (a
    // gene + its introns linked by regionId) must keep their ids across the
    // create/create-batch apply, or the regionId link breaks and the intron
    // becomes an orphan (no exon-block render, no AA splice). Fall back to the
    // deterministic backfill id only when none is supplied.
    id: id != null ? id : generateAnnotationId({ start, end, type, name }),
    name,
    type,
    start,
    end,
    strand: strand === -1 ? -1 : 1,
    level,
  };
  // Link a detail annotation (e.g. a manually-marked intron) to its parent
  // region so the AA track can splice it (getIntronsForRegion link path).
  if (regionId != null) ann.regionId = regionId;
  // Forward predictor metadata so accepted Annotator hits keep their
  // origin trail when applied as confident regions. Skip noise — drop
  // empty arrays / nullish values so the annotation stays clean.
  if (predicted) ann.predicted = true;
  if (source) ann.source = source;
  if (Number.isFinite(confidence)) ann.confidence = confidence;
  if (Array.isArray(signals) && signals.length > 0) ann.signals = signals;
  return ann;
}

/**
 * Remove the annotation matching `annotationId`. Returns a new array
 * (does not mutate `annotations`). If the id is not present, returns
 * the original array reference unchanged — caller can detect a no-op
 * by reference equality.
 */
/**
 * Match by stored id OR by the deterministic backfill id for
 * imported annotations that arrived without one. Source files
 * (.dna / .gb / SnapGene catalog) often omit the id field; consumers
 * that read through `getRegions` see the backfilled form
 * (`region:start:end:type:name`) and dispatch edits with THAT id,
 * but the underlying array still has `id: undefined`. Strict
 * `a.id === id` would silently miss them — biolog reported drag-resize
 * worked on freshly-created annotations but не работало на existing
 * imports.
 */
function matchesAnnotationId(a, id) {
  if (!a || !id) return false;
  if (a.id === id) return true;
  if (!a.id && a.level === 'region') {
    return generateAnnotationId(a) === id;
  }
  return false;
}

export function deleteAnnotation(annotations, annotationId) {
  if (!Array.isArray(annotations)) return [];
  const next = annotations.filter((a) => !matchesAnnotationId(a, annotationId));
  return next.length === annotations.length ? annotations : next;
}

/**
 * Update an existing annotation by id. `patch` is shallow-merged onto
 * the existing entry; if it changes coords/type/name, the id is
 * regenerated to match the new shape (so consumers that hash on id
 * stay consistent).
 *
 * Throws on invalid coord patches. Returns a new annotations array.
 * Returns the original reference if the id is not found.
 */
export function updateAnnotation(annotations, annotationId, patch, seqLength) {
  if (!Array.isArray(annotations)) return [];
  let found = false;
  // Track an id shift on the edited annotation so detail/point children that
  // link to it via `regionId` can be re-pointed (V180 — otherwise editing a
  // gene's coords/name/type silently orphaned its introns/domains).
  let idShift = null;
  const next = annotations.map((a) => {
    if (!matchesAnnotationId(a, annotationId)) return a;
    found = true;
    const merged = { ...a, ...patch };
    const v = validateAnnotationCoords(merged.start, merged.end, seqLength);
    if (!v.valid) throw new Error(`updateAnnotation: ${v.error}`);
    if (merged.strand !== -1) merged.strand = 1;
    const prevId = a.id || generateAnnotationId(a); // effective id BEFORE the edit
    // Regenerate id when the identifying fields shifted, OR when
    // the annotation came in without one (now we stamp the
    // deterministic backfill so subsequent edits round-trip cleanly).
    if (
      !a.id
      || patch.start !== undefined
      || patch.end !== undefined
      || patch.type !== undefined
      || patch.name !== undefined
    ) {
      merged.id = generateAnnotationId(merged);
    }
    if (merged.id !== prevId) idShift = { from: prevId, to: merged.id };
    return merged;
  });
  if (!found) return annotations;
  // Cascade the id shift onto children: any annotation whose `regionId` pointed
  // at the old id is re-linked to the new id. A no-op when nothing changed or
  // the edited annotation has no children (only regions are parents).
  if (idShift && idShift.from !== idShift.to) {
    return next.map((a) =>
      (a && a.regionId === idShift.from ? { ...a, regionId: idShift.to } : a));
  }
  return next;
}

/**
 * Compute the overlap fraction of two regions relative to the SHORTER
 * region (avoids the asymmetry where a tiny region inside a huge one
 * would otherwise look like a small overlap %). Used by the
 * create-batch dedup heuristic (DEC-ANN-09).
 */
export function overlapFraction(a, b) {
  const lo = Math.max(a.start, b.start);
  const hi = Math.min(a.end, b.end);
  if (hi <= lo) return 0;
  const minLen = Math.min(a.end - a.start, b.end - b.start);
  if (minLen <= 0) return 0;
  return (hi - lo) / minLen;
}

/**
 * Decide whether a predicted region duplicates a confirmed
 * annotation already present on the same plasmid. The previous
 * heuristic required EXACT type equality, but the bundled
 * common-features DB tags AmpR as `marker` while a SnapGene-imported
 * plasmid tags it as `CDS` — same region, different label, dedup
 * missed it.
 *
 * Two-strike rule:
 *   1. Same name (case-insensitive trimmed) + ≥30 % overlap → dup.
 *      Catches the type-drift case described above.
 *   2. Same type (case-insensitive) + ≥50 % overlap → dup. Default
 *      DEC-ANN-09 path.
 *
 * Different name AND different type, even with full coord overlap,
 * are KEPT — a gene and its internal promoter can occupy the same
 * span and biolog needs to see both.
 *
 * Skips entries whose `level` is set and not 'region' (sub-features
 * shouldn't shadow predicted parents).
 */
/**
 * Merge predicted regions from the Annotator's results into a
 * confirmed-annotations array (used by SingleInspector's
 * LinearFeatureBar nav-strip overlay). Mirrors the filter rules
 * PreviewTab and LevelPanel apply:
 *   - drop regions below the confidence threshold
 *   - drop user-rejected regions
 *   - skip duplicates (`isDuplicatePrediction`) unless the user
 *     opted in via «Show duplicates»
 *   - accepted-this-session predictions render as solid
 *     (`predicted: false`); the rest stay ghosts
 *   - on the strip, suppress duplicate name labels when the
 *     predicted region's name already exists among confirmed
 *     regions (`_suppressLabel: true`)
 */
export function mergeStripWithPredicted(
  confirmed,
  results,
  threshold,
  acceptedIds,
  rejectedIds,
  showDuplicates,
) {
  if (!results || typeof results !== 'object') return confirmed;
  // V134 — collect raw predictions (threshold + reject), then reconcile
  // partial names: a confirmed `X` whose predicted `X_part_…` sits on the
  // same locus DISPLAYS the part name (fragment → с part) and absorbs that
  // prediction, so the strip shows one name instead of «AmpR» + «AmpR_part_…».
  const predictedRaw = [];
  for (const res of Object.values(results)) {
    for (const r of (res?.regions || [])) {
      if (Number.isFinite(r.confidence) && r.confidence < (threshold ?? 0)) continue;
      const id = r.id || `${r.start}:${r.end}:${r.type || ''}:${r.name || ''}`;
      if (rejectedIds && rejectedIds[id]) continue;
      predictedRaw.push({ ...r, id });
    }
  }
  // V136 — reconcile (one feature, part name) only when NOT showing duplicates;
  // with «Show duplicates» ON keep confirmed + the Level-1 partial both visible.
  const { confirmed: rc, predicted: predRemaining } = showDuplicates
    ? { confirmed: confirmed || [], predicted: predictedRaw }
    : reconcileConfirmedWithPartials(confirmed || [], predictedRaw);
  const out = rc.slice();
  const seenIds = new Set();
  const confirmedNames = new Set();
  for (const ann of out) {
    if (ann && ann.id) seenIds.add(ann.id);
    const nm = (ann?.name || '').toLowerCase().trim();
    if (nm) confirmedNames.add(nm);
  }
  for (const r of predRemaining) {
    const id = r.id;
    if (seenIds.has(id)) continue;
    const accepted = !!(acceptedIds && acceptedIds[id]);
    // Mirror the PreviewTab fix (2026-05-06): always skip predicted
    // duplicates of an existing confirmed region — even if the user
    // accepted them — because after Save the accepted region lives
    // in `confirmed` and the strip would otherwise stack two copies
    // (the confirmed one + the same prediction rendered solid).
    if (!showDuplicates && isDuplicatePrediction(r, rc)) continue;
    const predName = (r.name || '').toLowerCase().trim();
    const suppressLabel = !!(predName && confirmedNames.has(predName));
    out.push({
      ...r,
      id,
      predicted: accepted ? false : true,
      _suppressLabel: suppressLabel,
    });
    seenIds.add(id);
  }
  return out;
}

export function isDuplicatePrediction(predicted, confirmedRegions) {
  if (!Array.isArray(confirmedRegions) || confirmedRegions.length === 0) return false;
  const pName = (predicted.name || '').toLowerCase().trim();
  const pType = (predicted.type || '').toLowerCase();
  for (const c of confirmedRegions) {
    if (!c) continue;
    if (c.level && c.level !== 'region') continue;
    const overlap = overlapFraction(c, predicted);
    if (overlap <= 0) continue;
    const cName = (c.name || '').toLowerCase().trim();
    const cType = (c.type || '').toLowerCase();
    if (pName && cName && pName === cName && overlap > 0.3) return true;
    if (pType && cType && pType === cType && overlap > 0.5) return true;
  }
  return false;
}

/**
 * Strip a trailing `_part_A-B` suffix → the base feature name. Used to match
 * a predicted partial (`AmpR_part_10-856`) against a confirmed full feature
 * (`AmpR`). Non-strings / plain names pass through unchanged.
 */
export function basePartName(name) {
  return typeof name === 'string' ? name.replace(/_part_\d+-\d+$/, '') : name;
}

/**
 * Fragment naming reconciliation (биолог: «кусок с парт, не кусок без парт;
 * одно имя»). When a predicted partial `X_part_A-B` overlaps a confirmed `X`
 * at the same locus, the locus IS that fragment — so the confirmed region
 * DISPLAYS the part name, and the now-redundant predicted partial is absorbed
 * (one feature, one name, independent of the «Show duplicates» toggle). A full
 * match (`X` == `X`, no `_part_`) is left plain (полная фича → без part).
 * Pure / display-only — inputs are not mutated, nothing is persisted; the
 * prior name is preserved on `displayBaseName`.
 *
 * @returns {{ confirmed: Array, predicted: Array }} confirmed with upgraded
 *   display names + predicted minus the absorbed partials.
 */
export function reconcileConfirmedWithPartials(confirmed, predicted) {
  const conf = Array.isArray(confirmed) ? confirmed : [];
  const pred = Array.isArray(predicted) ? predicted : [];
  if (conf.length === 0 || pred.length === 0) {
    return { confirmed: conf, predicted: pred };
  }
  const absorbed = new Set();
  const outConfirmed = conf.map((c) => {
    if (!c || typeof c.name !== 'string') return c;
    const cName = c.name.toLowerCase().trim();
    const match = pred.find((p) => {
      if (absorbed.has(p) || !p || typeof p.name !== 'string') return false;
      if (!p.name.includes('_part_')) return false;            // only partials upgrade
      if (basePartName(p.name).toLowerCase().trim() !== cName) return false;
      return overlapFraction(c, p) > 0.5;                       // same locus
    });
    if (!match) return c;
    absorbed.add(match);
    return { ...c, name: match.name, displayBaseName: c.name };
  });
  const outPredicted = pred.filter((p) => !absorbed.has(p));
  return { confirmed: outConfirmed, predicted: outPredicted };
}

/**
 * Append a batch of new regions to an existing annotations array.
 * DEC-ANN-09 — for each candidate, if it overlaps >50% with an
 * existing region of the same type, silently skip and bump the
 * skipped counter.
 *
 * Returns `{ next, skipped }`.
 *
 * Each candidate is run through `createAnnotation` (so its id is
 * regenerated and coord validation fires). Same-strand check is NOT
 * applied — biolog 04.05.2026: dedup is type-based, strand differences
 * are intentional (e.g. lacZα reverse-strand CDS is its own region).
 */
export function createBatchAnnotations(annotations, candidates, seqLength) {
  const arr = Array.isArray(annotations) ? annotations.slice() : [];
  let skipped = 0;
  const accepted = [];
  for (const cand of (candidates || [])) {
    if (!cand) continue;
    let ann;
    try {
      ann = createAnnotation(cand, seqLength);
    } catch {
      // Bad coords → silent skip (treated as a "duplicate" for the
      // purposes of the footer counter).
      skipped += 1;
      continue;
    }
    const dup = arr.find((a) =>
      a && a.level === 'region'
      && (a.type || '') === (ann.type || '')
      && overlapFraction(a, ann) > 0.5
    );
    if (dup) {
      skipped += 1;
      continue;
    }
    accepted.push(ann);
    arr.push(ann);
  }
  return { next: arr, skipped, accepted };
}

/**
 * Dispatcher — single entry point used by SequenceView edit hooks and
 * the Annotator apply flow. Throws on unknown `kind`.
 *
 * Returns:
 *   - kind 'create' / 'delete' / 'update' → annotations[]
 *   - kind 'create-batch'                  → { next, skipped, accepted }
 *
 * `seqLength` is required for create / update / create-batch (so coord
 * validation can fire) and ignored by delete.
 */
export function applyAnnotationEdit(annotations, edit, seqLength) {
  if (!edit || typeof edit !== 'object') {
    throw new Error('applyAnnotationEdit: edit must be an object');
  }
  switch (edit.kind) {
    case 'create': {
      const ann = createAnnotation(edit.payload || {}, seqLength);
      return [...(annotations || []), ann];
    }
    case 'delete':
      return deleteAnnotation(annotations, edit.id);
    case 'update':
      return updateAnnotation(annotations, edit.id, edit.patch || {}, seqLength);
    case 'create-batch':
      return createBatchAnnotations(annotations, edit.payload || [], seqLength);
    default:
      throw new Error(`applyAnnotationEdit: unknown kind '${edit.kind}'`);
  }
}

/**
 * 0-based exclusive end → 1-based inclusive end (UI display).
 * Example: store {start:145, end:469} → UI {uiStart:146, uiEnd:469}
 * (lacZα CDS spans nucleotides 146..469 to a biologist's eye).
 */
export function toUiCoords(start, end) {
  return { uiStart: start + 1, uiEnd: end };
}

/**
 * 1-based inclusive end (UI input) → 0-based exclusive end (store).
 * Inverse of `toUiCoords`.
 */
export function fromUiCoords(uiStart, uiEnd) {
  return { start: uiStart - 1, end: uiEnd };
}

/**
 * Sprint M-X.3 follow-up — split a single feature into N equal-
 * length child features. Used by FeatureEditorModal's «Split into
 * 2 / 3 / 4» buttons.
 *
 *   in:  [{ id: 'r1', start: 100, end: 1000, name: 'lacZα', type: 'CDS' }]
 *   call: splitAnnotation(in, 'r1', 3, seqLen)
 *   out: [
 *     { id: …, start: 100,  end: 400,  name: 'lacZα-1', type: 'CDS' },
 *     { id: …, start: 400,  end: 700,  name: 'lacZα-2', type: 'CDS' },
 *     { id: …, start: 700,  end: 1000, name: 'lacZα-3', type: 'CDS' },
 *   ]
 *
 * Children inherit `type` / `strand` / `level` from the parent.
 * Coordinates are computed via integer slicing — the LAST child
 * picks up any remainder so total length is preserved exactly.
 *
 * Throws on N <= 1, on (end - start) < N, and on coords that
 * `validateAnnotationCoords` rejects post-split.
 *
 * Unknown id → no-op (returns input array unchanged).
 */
export function splitAnnotation(annotations, annotationId, n, seqLength) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 2) {
    throw new Error(`splitAnnotation: n must be ≥ 2, got ${n}`);
  }
  const idx = (annotations || []).findIndex((a) => matchesAnnotationId(a, annotationId));
  if (idx < 0) return annotations || [];
  const parent = annotations[idx];
  const total = (parent.end || 0) - (parent.start || 0);
  if (total < n) {
    throw new Error(`splitAnnotation: feature length ${total} too short for ${n}-way split`);
  }
  const chunk = Math.floor(total / n);
  const children = [];
  for (let i = 0; i < n; i++) {
    const cs = (parent.start || 0) + i * chunk;
    const ce = i === n - 1 ? (parent.end || 0) : cs + chunk;
    if (typeof seqLength === 'number') validateAnnotationCoords(cs, ce, seqLength);
    const name = parent.name ? `${parent.name}-${i + 1}` : `(unnamed)-${i + 1}`;
    const child = {
      ...parent,
      start: cs,
      end: ce,
      name,
    };
    child.id = generateAnnotationId(child);
    children.push(child);
  }
  const next = [...annotations];
  next.splice(idx, 1, ...children);
  return next;
}

/**
 * Sprint M-X.3 follow-up — merge two ADJACENT features into one
 * union range. Used by FeatureEditorModal's merge picker.
 *
 * «Adjacent» means they touch on a boundary: one's `end` equals the
 * other's `start`. Non-adjacent merges are refused — returns input
 * unchanged so the caller can show «no adjacent neighbour» in the
 * UI without a separate guard.
 *
 * Result keeps the LARGER feature's `name` / `type` / `strand` /
 * `level` (so a tiny RBS merging into a long CDS reads as a longer
 * CDS, not as a stretched RBS — biolog UX call).
 *
 * Order of `idA` / `idB` doesn't matter.
 */
export function mergeAnnotations(annotations, idA, idB) {
  const list = annotations || [];
  const a = list.find((x) => matchesAnnotationId(x, idA));
  const b = list.find((x) => matchesAnnotationId(x, idB));
  if (!a || !b) return list;
  const adjacent = a.end === b.start || b.end === a.start;
  if (!adjacent) return list;
  const lenA = (a.end || 0) - (a.start || 0);
  const lenB = (b.end || 0) - (b.start || 0);
  const dominant = lenA >= lenB ? a : b;
  const merged = {
    ...dominant,
    start: Math.min(a.start || 0, b.start || 0),
    end: Math.max(a.end || 0, b.end || 0),
  };
  merged.id = generateAnnotationId(merged);
  const aId = a.id || generateAnnotationId(a);
  const bId = b.id || generateAnnotationId(b);
  return list
    .filter((x) => {
      const xid = x.id || generateAnnotationId(x);
      return xid !== aId && xid !== bId;
    })
    .concat(merged);
}
