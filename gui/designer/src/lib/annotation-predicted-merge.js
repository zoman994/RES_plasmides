/**
 * annotation-predicted-merge.js — reconciliation between CONFIRMED annotations
 * and the Annotator's PREDICTED regions.
 *
 * Extracted from `annotation-edit.js` (ANN-0A corrective): editing an
 * annotation and deciding whether a prediction duplicates an existing feature
 * are separate responsibilities, and keeping both in one file pushed it past
 * the 25 KiB hard budget for a `.js` helper.
 *
 * Pure and display-oriented — nothing here mutates or persists an annotation.
 */

import { overlapFraction } from './annotation-location';

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
