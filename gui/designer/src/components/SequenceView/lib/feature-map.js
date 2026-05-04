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

import { getRegions } from "../../../annotation-model.js";
import { featureColorShaded } from "../../../feature-palette.js";
import { RE_ENZYMES } from "../../../restriction-db.js";

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
    if (regions.length > 1) {
      regions.forEach((r, ri) => {
        feats.push({
          id: `${f.id || i}_r${ri}`,
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

export function flattenSites(scanResult, filterMode) {
  if (!Array.isArray(scanResult)) return [];
  const rows =
    filterMode === "unique"
      ? scanResult.filter((re) => re.isUnique)
      : filterMode === "double"
        ? scanResult.filter((re) => re.cutCount <= 2)
        : scanResult;
  const out = [];
  for (const re of rows) {
    const cutOffset = (RE_ENZYMES[re.enzyme] && RE_ENZYMES[re.enzyme].cut[0]) || 0;
    for (const pos of re.positions) {
      out.push({
        enzyme: re.enzyme,
        position: pos.position + cutOffset,
      });
    }
  }
  return out;
}
