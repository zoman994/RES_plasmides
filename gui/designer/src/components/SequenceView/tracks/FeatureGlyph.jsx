/**
 * FeatureGlyph — parametric SBOL Visual glyph for the linear feature track
 * (ANNOTATION_TRACK_DECOMP_PLAN §3/§4.3, paraSBOLv idiom).
 *
 * Thin SVG renderer over `feature-glyph-shapes` primitive descriptors: it
 * resolves `type → shape` (specific-not-generic), draws the primitives, and
 * exposes shape / SO term / strand as data-* hooks. The glyph renders in the
 * caller's local coordinate frame (x ∈ [0,width], y ∈ [0,height]); reverse
 * strand is baked into the geometry, so the caller does NOT need a flip
 * transform.
 *
 * Colour rules (mirror the legacy rect render so the palette stays in
 * lock-step across LinearFeatureBar / PlasmidMiniMap / AnnotationTrack):
 *   - FILLED shapes (cds, origin-fill, rbs, operator, unspecified):
 *       confident → fill = feature colour @ fillOpacity, stroke = theme line
 *       predicted → fill = transparent, dashed feature-coloured outline
 *   - STROKE-ONLY shapes (promoter, terminator, primer): the feature colour
 *       lives on the STROKE (no fill to carry it); dashed when predicted.
 *   - `outline` mode (P4 «motif on a coloured bar»): force EVERY primitive to
 *       stroke-only ink line-art in `color`, so the glyph reads as a motif
 *       overlaid on the feature's own colour bar (rendered separately).
 */
import { ROW_HEIGHT } from "./annotation-track-constants.js";
import { ensureColor } from "./annotation-colors.js";
import { shapeForType, soTermForType, buildGlyphPrimitives } from "./feature-glyph-shapes.js";

const THEME_LINE = "var(--text-secondary, #3A2F1F)";
const PREDICTED_DASH = "3,2";

export function FeatureGlyph({
  type,
  width,
  height = ROW_HEIGHT,
  strand = 1,
  color = "#9ca3af",
  predicted = false,
  fillOpacity = 0.55,
  outline = false,
  ...rest
}) {
  const shape = shapeForType(type);
  const { primitives } = buildGlyphPrimitives({ shape, width, height, strand });
  const baseColor = ensureColor(color);
  const dash = predicted ? PREDICTED_DASH : undefined;

  return (
    <g
      data-testid="feature-glyph"
      data-glyph-shape={shape}
      data-glyph-type={type || ""}
      data-glyph-strand={strand === -1 ? "-1" : "1"}
      data-glyph-so={soTermForType(type)}
      data-predicted={predicted ? "true" : undefined}
      {...rest}
    >
      {primitives.map((p, i) => {
        // In outline mode every primitive is stroke-only ink line-art in
        // `color` (a motif laid over the feature's own colour bar).
        const filled = !outline && p.fill === true;
        // Filled glyphs carry the feature colour in the fill; stroke-only
        // glyphs (and outline mode) carry it in the stroke.
        const fill = filled ? (predicted ? "transparent" : baseColor) : "none";
        const stroke = outline
          ? baseColor
          : filled
            ? (predicted ? baseColor : THEME_LINE)
            : baseColor;
        const strokeWidth = filled ? (predicted ? 1 : 0.6) : predicted ? 1.2 : 1.4;
        const common = {
          fill,
          fillOpacity: filled ? (predicted ? 1 : fillOpacity) : undefined,
          stroke,
          strokeWidth,
          strokeDasharray: dash,
          strokeLinejoin: "round",
          strokeLinecap: "round",
        };
        if (p.k === "circle") {
          return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} {...common} />;
        }
        if (p.k === "rect") {
          return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.rx} {...common} />;
        }
        return <path key={i} d={p.d} {...common} />;
      })}
    </g>
  );
}

export default FeatureGlyph;
