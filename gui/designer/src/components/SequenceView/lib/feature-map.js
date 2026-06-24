/**
 * SequenceView feature-map helpers — pure functions extracted from
 * `index.jsx` in Sprint M-X.2 K1 decomposition (78.54 KB → ≤45 KB).
 * No React, no DOM, no store. Suitable for direct unit tests.
 *
 *   buildFeatureMap(fragments) → { fullSeq, features }
 *     Concatenates fragment sequences and produces a flat list of
 *     "regions" (one per top-level fragment OR one per annotation
 *     when the fragment has multiple regions). Colours come from
 *     `featureColorShaded` so the SequenceView matches the circular
 *     PlasmidMap palette (DEC-DS-02 ⚓).
 *
 *   mergeWithPredicted(features, predictedRegions) → features[]
 *     Concatenates `runPredictors` output (M-X.1) on top of the
 *     confident features, decorating each with a colour + the
 *     `predicted: true` flag the AnnotationTrack uses to switch to
 *     dashed/unfilled rendering.
 *
 *   buildLineAnnMap(features, lineStart, lineLen) → annotation[lineLen]
 *     Per-position lookup used by StrandsTrack tint and the intron
 *     lowercase rendering.
 *
 *   flattenSites(scanResult, filterMode) → [{enzyme, position}]
 *     Adapter from v0.5 `scanAllSites` shape into the flat list the
 *     RestrictionTrack consumes.
 */

import { getRegions, getAllDetails } from "../../../annotation-model.js";
import { featureColorShaded } from "../../../feature-palette.js";
import { effectiveEnzymes } from "../../../restriction-db.js";
import { filterReSites } from "../../../lib/re-site-filter.js";

export function buildFeatureMap(fragments) {
  let seq = "";
  const feats = [];
  if (!Array.isArray(fragments)) return { fullSeq: "", features: [] };
  fragments.forEach((f, i) => {
    if (!f) return;
    const fragStart = seq.length;
    seq += f.sequence || "";
    const fragEnd = seq.length;
    const fragColor = f.customColor || featureColorShaded(f.type, f.name);
    const regions = getRegions(f.annotations);
    if (regions.length >= 1) {
      // Preserve the underlying annotation's id (Sprint M-X.2 K4 —
      // drag-handles dispatch update by id, so the region must
      // surface its REAL annotation id, not a synthesized fragment-
      // index combo). Falls back to the synthesized form when the
      // raw annotation lacks an id (legacy + freshly-parsed .gb).
      regions.forEach((r, ri) => {
        feats.push({
          id: r.id || `${f.id || i}_r${ri}`,
          name: r.name,
          type: r.type,
          start: fragStart + r.start,
          end: fragStart + r.end,
          color: featureColorShaded(r.type, r.name),
          strand: r.strand || f.strand || 1,
          level: "region",
          kind: r.kind,
          predicted: r.predicted,
          source: r.source,
          confidence: r.confidence,
          signals: r.signals,
        });
      });
    } else {
      feats.push({
        id: f.id || i,
        name: f.name,
        type: f.type,
        start: fragStart,
        end: fragEnd,
        color: fragColor,
        strand: f.strand || 1,
        level: "region",
      });
    }
    // Sprint M-X.3 follow-up — detail-level sub-features need to
    // surface in the SequenceView too. Biolog «сплит не отражается
    // визуально, только в навигационной колбасе вижу потомков».
    // Include them with `level: 'detail'` + a parentId so
    // AnnotationTrack can render them stacked under their parent
    // (and style them differently if needed).
    const details = getAllDetails(f.annotations);
    details.forEach((d, di) => {
      feats.push({
        id: d.id || `${f.id || i}_d${di}`,
        name: d.name,
        type: d.type,
        start: fragStart + d.start,
        end: fragStart + d.end,
        // Honour an explicit `d.color` when set (Sprint M-X.3
        // follow-up — split children inherit a parent-shaded colour,
        // and the user can recolour them in the modal). Falls back
        // to the type-based palette for legacy detail annotations
        // that don't carry a stored colour.
        color: d.color || featureColorShaded(d.type, d.name),
        strand: d.strand || f.strand || 1,
        level: "detail",
        parentId: d.regionId || null,
      });
    });
  });
  return { fullSeq: seq, features: feats };
}

export function mergeWithPredicted(features, predictedRegions) {
  if (!Array.isArray(predictedRegions) || predictedRegions.length === 0) {
    return features;
  }
  const decorated = predictedRegions.map((r, i) => ({
    id: r.id || `pred_${i}`,
    name: r.name,
    type: r.type,
    start: r.start,
    end: r.end,
    color: featureColorShaded(r.type, r.name),
    strand: r.strand || 1,
    level: "region",
    kind: r.kind,
    predicted: true,
    source: r.source,
    confidence: r.confidence,
    signals: r.signals,
  }));
  return features.concat(decorated);
}

export function buildLineAnnMap(features, lineStart, lineLen) {
  const map = new Array(lineLen).fill(null);
  if (!features || features.length === 0) return map;
  const lineEnd = lineStart + lineLen;
  for (const f of features) {
    if (f.end <= lineStart || f.start >= lineEnd) continue;
    const from = Math.max(0, f.start - lineStart);
    const to = Math.min(lineLen, f.end - lineStart);
    for (let k = from; k < to; k++) {
      // Latest-wins is OK here because the StrandsTrack tint is
      // intentionally a low-alpha hint; the real multi-row track
      // lives in AnnotationTrack and uses the unmutated regions list.
      map[k] = f;
    }
  }
  return map;
}

/**
 * Filter scanAllSites' grouped result and flatten to [{ enzyme, position }] with
 * the top-strand cut offset applied. RS-B1 — filtering is delegated to the shared
 * `filterReSites` so the linear view and the circular map never diverge. `filter`
 * may be a legacy mode string ('all'|'unique'|'double') or a full options object
 * ({ mode, cutCount, enzymes }). RS-C2 — the cut offset resolves through
 * `effectiveEnzymes()` so CUSTOM enzymes are positioned correctly (identical to
 * RE_ENZYMES when no custom enzymes are registered).
 */
export function flattenSites(scanResult, filter) {
  if (!Array.isArray(scanResult)) return [];
  const opts = typeof filter === "string" ? { mode: filter } : (filter || {});
  const rows = filterReSites(scanResult, opts);
  const eff = effectiveEnzymes();
  const out = [];
  for (const re of rows) {
    const cutOffset = (eff[re.enzyme] && eff[re.enzyme].cut[0]) || 0;
    for (const pos of re.positions) {
      out.push({
        enzyme: re.enzyme,
        position: pos.position + cutOffset,
      });
    }
  }
  return out;
}
