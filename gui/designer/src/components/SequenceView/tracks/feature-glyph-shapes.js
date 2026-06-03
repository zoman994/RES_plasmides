/**
 * feature-glyph-shapes.js — parametric SBOL Visual glyph geometry
 * (ANNOTATION_TRACK_DECOMP_PLAN §3/§4.3, paraSBOLv idiom; PMC8546602).
 *
 * Pure core for the linear-track feature glyph render: a data-driven
 * `type → { shape, so }` map and a `buildGlyphPrimitives` function that
 * emits renderer-agnostic SVG primitive descriptors parametric in the
 * feature's on-screen (width, height, strand). The React component
 * (`FeatureGlyph.jsx`) is a thin renderer over these descriptors.
 *
 * Coordinate frame (matches AnnotationTrack's per-feature <g>):
 *   - local x ∈ [0, width], y ∈ [0, height]
 *   - the BACKBONE baseline is the bottom edge (y = height); every glyph
 *     bbox TOUCHES it (maxY === height) so glyphs sit on the strand line.
 *   - forward strand = +1 (default); reverse = −1 mirrors directional glyphs.
 *
 * Normative SBOL Visual rules honoured here (CANVAS_DESIGN_PROPOSAL §2.2):
 *   - specific-not-generic: only `misc_feature` / unknown → 'unspecified'.
 *   - reverse-strand directional glyphs point the other way.
 *   - `feature.soTerm` is stored additively (Sequence Ontology accession).
 *
 * Primitive descriptors (the only shapes the renderer must understand):
 *   { k:'path',   d, fill }          — fill:true → filled+stroked, else stroke
 *   { k:'circle', cx, cy, r, fill }
 *   { k:'rect',   x, y, w, h, rx, fill }
 */

// ─── type → shape + Sequence Ontology accession ──────────────────────
// Only misc_feature carries the generic 'unspecified' shape; everything
// else resolves to a specific SBOL glyph (specific-not-generic rule).
export const GLYPH = {
  CDS:          { shape: "cds",         so: "SO:0000316" },
  gene:         { shape: "cds",         so: "SO:0000704" },
  mRNA:         { shape: "cds",         so: "SO:0000234" },
  marker:       { shape: "cds",         so: "SO:0000316" },
  reporter:     { shape: "cds",         so: "SO:0000316" },
  promoter:     { shape: "promoter",    so: "SO:0000167" },
  core_promoter:{ shape: "promoter",    so: "SO:0000167" },
  terminator:   { shape: "terminator",  so: "SO:0000141" },
  rep_origin:   { shape: "origin",      so: "SO:0000296" },
  RBS:          { shape: "rbs",         so: "SO:0000139" },
  primer_bind:  { shape: "primer",      so: "SO:0005850" },
  protein_bind: { shape: "operator",    so: "SO:0000409" },
  operator:     { shape: "operator",    so: "SO:0000057" },
  regulatory:   { shape: "operator",    so: "SO:0005836" },
  misc_feature: { shape: "unspecified", so: "SO:0000001" },
};

/** Generic Sequence Ontology term for an unmapped feature type. */
const SO_SEQUENCE_FEATURE = "SO:0000110";

/** Directional shapes whose geometry mirrors on the reverse strand. */
export const DIRECTIONAL_SHAPES = new Set(["cds", "promoter", "primer"]);

/** Resolve a feature `type` to a glyph shape (specific-not-generic). */
export function shapeForType(type) {
  const def = type != null ? GLYPH[type] : undefined;
  return (def && def.shape) || "unspecified";
}

/** Resolve a feature `type` to its SO accession (additive metadata). */
export function soTermForType(type) {
  const def = type != null ? GLYPH[type] : undefined;
  return (def && def.so) || SO_SEQUENCE_FEATURE;
}

/**
 * Build the SVG primitive descriptors + bbox for a glyph shape at a given
 * on-screen size. Pure: no DOM, no allocation beyond the returned object.
 *
 * @param {object}  opts
 * @param {string}  opts.shape    one of the shape keys (else 'unspecified')
 * @param {number}  opts.width    glyph box width in px (feature span)
 * @param {number}  opts.height   glyph box height in px (row height)
 * @param {number} [opts.strand]  +1 forward (default), −1 reverse
 * @returns {{ primitives: Array, bbox: {x,y,w,h}, directional: boolean }}
 */
export function buildGlyphPrimitives({ shape, width, height, strand = 1 }) {
  const W = width;
  const H = height;
  const fwd = strand !== -1;

  switch (shape) {
    // ── CDS / gene / marker / reporter — directional pentagon arrow ──
    case "cds": {
      const aw = Math.max(2, Math.min(W * 0.4, H)); // arrowhead length
      let d;
      if (fwd) {
        const bodyEnd = Math.max(0, W - aw);
        d = `M0,0 L${bodyEnd},0 L${W},${H / 2} L${bodyEnd},${H} L0,${H} Z`;
      } else {
        const bodyStart = Math.min(W, aw);
        d = `M${W},0 L${bodyStart},0 L0,${H / 2} L${bodyStart},${H} L${W},${H} Z`;
      }
      return { primitives: [{ k: "path", d, fill: true }], bbox: { x: 0, y: 0, w: W, h: H }, directional: true };
    }

    // ── promoter — bent arrow: riser at the 5′ elbow + arrowhead ──
    case "promoter": {
      const ah = Math.max(2, Math.min(4, Math.floor(H / 3)));
      const topY = ah;
      let riser, head;
      if (fwd) {
        riser = `M0,${H} L0,${topY} L${W},${topY}`;
        head = `M${W - ah},0 L${W},${topY} L${W - ah},${2 * ah}`;
      } else {
        riser = `M${W},${H} L${W},${topY} L0,${topY}`;
        head = `M${ah},0 L0,${topY} L${ah},${2 * ah}`;
      }
      return {
        primitives: [{ k: "path", d: riser, fill: false }, { k: "path", d: head, fill: false }],
        bbox: { x: 0, y: 0, w: W, h: H },
        directional: true,
      };
    }

    // ── terminator — centred "T" (non-directional) ──
    case "terminator": {
      const cx = W / 2;
      const barHalf = Math.min(W / 2, H / 2);
      const stem = `M${cx},${H} L${cx},0`;
      const bar = `M${cx - barHalf},0 L${cx + barHalf},0`;
      return {
        primitives: [{ k: "path", d: stem, fill: false }, { k: "path", d: bar, fill: false }],
        bbox: { x: cx - barHalf, y: 0, w: 2 * barHalf, h: H },
        directional: false,
      };
    }

    // ── origin of replication — circle sitting on the backbone ──
    case "origin": {
      const r = Math.max(2, Math.min(H / 2, W / 2) - 0.5);
      const cx = W / 2;
      const cy = H - r; // bottom of circle touches baseline
      return {
        primitives: [{ k: "circle", cx, cy, r, fill: false }],
        bbox: { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r },
        directional: false,
      };
    }

    // ── RBS — filled half-dome on the backbone ──
    case "rbs": {
      const r = Math.max(2, Math.min(W / 2, H));
      const cx = W / 2;
      const d = `M${cx - r},${H} A${r},${r} 0 0 1 ${cx + r},${H} Z`;
      return {
        primitives: [{ k: "path", d, fill: true }],
        bbox: { x: cx - r, y: H - r, w: 2 * r, h: r },
        directional: false,
      };
    }

    // ── primer binding site — thin directional half-arrow on backbone ──
    case "primer": {
      const ah = Math.max(2, Math.min(4, Math.floor(H / 3)));
      let line, head;
      if (fwd) {
        line = `M0,${H} L${W},${H}`;
        head = `M${W - ah},${H - ah} L${W},${H}`;
      } else {
        line = `M${W},${H} L0,${H}`;
        head = `M${ah},${H - ah} L0,${H}`;
      }
      return {
        primitives: [{ k: "path", d: line, fill: false }, { k: "path", d: head, fill: false }],
        bbox: { x: 0, y: H - ah, w: W, h: ah },
        directional: true,
      };
    }

    // ── operator / protein_bind — small filled square on backbone ──
    case "operator": {
      const s = Math.max(2, Math.min(W, H) - 2);
      const x = (W - s) / 2;
      const y = H - s;
      return {
        primitives: [{ k: "rect", x, y, w: s, h: s, rx: 1, fill: true }],
        bbox: { x, y, w: s, h: s },
        directional: false,
      };
    }

    // ── unspecified / fallback — generic rounded rect (current look) ──
    case "unspecified":
    default:
      return {
        primitives: [{ k: "rect", x: 0, y: 0, w: W, h: H, rx: 2, fill: true }],
        bbox: { x: 0, y: 0, w: W, h: H },
        directional: false,
      };
  }
}
