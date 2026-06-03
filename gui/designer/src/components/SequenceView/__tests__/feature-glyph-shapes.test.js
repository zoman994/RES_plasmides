/**
 * feature-glyph-shapes.test.js — P3 unit coverage for the parametric SBOL
 * glyph geometry (ANNOTATION_TRACK_DECOMP_PLAN §4.3).
 *
 * The shapes module is the pure core of the glyph render: a `type → shape`
 * map (SBOL specific-not-generic), `soTerm` lookup, and a primitive builder
 * that emits SVG-ready descriptors parametric in (width, height, strand).
 *
 * Normative SBOL Visual rules under test (§2.2 of CANVAS_DESIGN_PROPOSAL):
 *   - specific-not-generic: only misc_feature / unknown → 'unspecified'
 *   - reverse strand mirrors directional glyphs (CDS arrow, promoter, primer)
 *   - every glyph's bbox TOUCHES the backbone baseline (maxY === height)
 *   - every glyph's bbox stays within [0,width] × [0,height]
 */
import { describe, it, expect } from "vitest";
import {
  GLYPH,
  shapeForType,
  soTermForType,
  buildGlyphPrimitives,
  DIRECTIONAL_SHAPES,
} from "../tracks/feature-glyph-shapes.js";

const W = 40;
const H = 14;
const ALL_SHAPES = [
  "cds",
  "promoter",
  "terminator",
  "origin",
  "rbs",
  "primer",
  "operator",
  "unspecified",
];

describe("feature-glyph-shapes — type → shape mapping", () => {
  it("maps the core biological types to specific SBOL shapes", () => {
    expect(shapeForType("CDS")).toBe("cds");
    expect(shapeForType("gene")).toBe("cds");
    expect(shapeForType("marker")).toBe("cds");
    expect(shapeForType("reporter")).toBe("cds");
    expect(shapeForType("promoter")).toBe("promoter");
    expect(shapeForType("terminator")).toBe("terminator");
    expect(shapeForType("rep_origin")).toBe("origin");
    expect(shapeForType("RBS")).toBe("rbs");
    expect(shapeForType("primer_bind")).toBe("primer");
    expect(shapeForType("protein_bind")).toBe("operator");
  });

  it("specific-not-generic: misc_feature and unknown types fall back to 'unspecified'", () => {
    expect(shapeForType("misc_feature")).toBe("unspecified");
    expect(shapeForType("totally-made-up")).toBe("unspecified");
    expect(shapeForType(undefined)).toBe("unspecified");
    expect(shapeForType(null)).toBe("unspecified");
    expect(shapeForType("")).toBe("unspecified");
  });

  it("GLYPH map only ever uses 'unspecified' for misc_feature (no other generic leak)", () => {
    for (const [type, def] of Object.entries(GLYPH)) {
      if (def.shape === "unspecified") {
        expect(type).toBe("misc_feature");
      }
    }
  });
});

describe("feature-glyph-shapes — soTerm lookup", () => {
  it("returns the SO accession for known types", () => {
    expect(soTermForType("CDS")).toBe("SO:0000316");
    expect(soTermForType("promoter")).toBe("SO:0000167");
    expect(soTermForType("terminator")).toBe("SO:0000141");
    expect(soTermForType("rep_origin")).toBe("SO:0000296");
    expect(soTermForType("RBS")).toBe("SO:0000139");
    expect(soTermForType("primer_bind")).toBe("SO:0005850");
  });

  it("unknown types resolve to the generic sequence_feature SO term", () => {
    expect(soTermForType("totally-made-up")).toBe("SO:0000110");
    expect(soTermForType(undefined)).toBe("SO:0000110");
  });

  it("every SO term is a well-formed SO accession", () => {
    for (const def of Object.values(GLYPH)) {
      expect(def.so).toMatch(/^SO:\d{7}$/);
    }
  });
});

describe("feature-glyph-shapes — buildGlyphPrimitives invariants", () => {
  it.each(ALL_SHAPES)("shape '%s' produces at least one primitive + a bbox", (shape) => {
    const out = buildGlyphPrimitives({ shape, width: W, height: H, strand: 1 });
    expect(Array.isArray(out.primitives)).toBe(true);
    expect(out.primitives.length).toBeGreaterThanOrEqual(1);
    expect(out.bbox).toBeTruthy();
    // every primitive declares a renderable kind
    for (const p of out.primitives) {
      expect(["path", "circle", "rect"]).toContain(p.k);
    }
  });

  it.each(ALL_SHAPES)("shape '%s' bbox TOUCHES the backbone baseline (maxY === height)", (shape) => {
    const { bbox } = buildGlyphPrimitives({ shape, width: W, height: H, strand: 1 });
    expect(bbox.y + bbox.h).toBeCloseTo(H, 5);
  });

  it.each(ALL_SHAPES)("shape '%s' bbox stays within [0,width] × [0,height]", (shape) => {
    const { bbox } = buildGlyphPrimitives({ shape, width: W, height: H, strand: 1 });
    expect(bbox.x).toBeGreaterThanOrEqual(-0.001);
    expect(bbox.y).toBeGreaterThanOrEqual(-0.001);
    expect(bbox.x + bbox.w).toBeLessThanOrEqual(W + 0.001);
    expect(bbox.y + bbox.h).toBeLessThanOrEqual(H + 0.001);
  });

  it("unknown shape name degrades to the unspecified rounded rect", () => {
    const out = buildGlyphPrimitives({ shape: "no-such-shape", width: W, height: H, strand: 1 });
    expect(out.primitives.length).toBe(1);
    expect(out.primitives[0].k).toBe("rect");
  });
});

describe("feature-glyph-shapes — strand directionality", () => {
  const DIRECTIONAL = ["cds", "promoter", "primer"];
  const NON_DIRECTIONAL = ["terminator", "origin", "rbs", "operator", "unspecified"];

  it("exports the directional-shape set for the renderer", () => {
    expect(DIRECTIONAL_SHAPES instanceof Set).toBe(true);
    for (const s of DIRECTIONAL) expect(DIRECTIONAL_SHAPES.has(s)).toBe(true);
    for (const s of NON_DIRECTIONAL) expect(DIRECTIONAL_SHAPES.has(s)).toBe(false);
  });

  it.each(DIRECTIONAL)("directional shape '%s' differs between forward and reverse strand", (shape) => {
    const fwd = buildGlyphPrimitives({ shape, width: W, height: H, strand: 1 });
    const rev = buildGlyphPrimitives({ shape, width: W, height: H, strand: -1 });
    expect(JSON.stringify(fwd.primitives)).not.toBe(JSON.stringify(rev.primitives));
  });

  it.each(NON_DIRECTIONAL)("non-directional shape '%s' is identical for both strands", (shape) => {
    const fwd = buildGlyphPrimitives({ shape, width: W, height: H, strand: 1 });
    const rev = buildGlyphPrimitives({ shape, width: W, height: H, strand: -1 });
    expect(JSON.stringify(fwd.primitives)).toBe(JSON.stringify(rev.primitives));
  });

  it("CDS forward points its arrow to the RIGHT (tip near x = width)", () => {
    const { primitives } = buildGlyphPrimitives({ shape: "cds", width: W, height: H, strand: 1 });
    const d = primitives[0].d;
    expect(d).toContain(`L${W},${H / 2}`); // tip vertex at (width, height/2)
  });

  it("CDS reverse points its arrow to the LEFT (tip near x = 0)", () => {
    const { primitives } = buildGlyphPrimitives({ shape: "cds", width: W, height: H, strand: -1 });
    const d = primitives[0].d;
    expect(d).toContain(`L0,${H / 2}`); // tip vertex at (0, height/2)
  });
});

describe("feature-glyph-shapes — shape primitive kinds", () => {
  it("cds is a single filled path", () => {
    const { primitives } = buildGlyphPrimitives({ shape: "cds", width: W, height: H, strand: 1 });
    expect(primitives).toHaveLength(1);
    expect(primitives[0].k).toBe("path");
    expect(primitives[0].fill).toBe(true);
  });

  it("origin is a circle", () => {
    const { primitives } = buildGlyphPrimitives({ shape: "origin", width: W, height: H, strand: 1 });
    expect(primitives.some((p) => p.k === "circle")).toBe(true);
  });

  it("unspecified is a rounded rect spanning the full box", () => {
    const { primitives } = buildGlyphPrimitives({ shape: "unspecified", width: W, height: H, strand: 1 });
    expect(primitives[0].k).toBe("rect");
    expect(primitives[0].w).toBeCloseTo(W, 5);
    expect(primitives[0].h).toBeCloseTo(H, 5);
  });

  it("terminator is a stroke T (two non-filled paths)", () => {
    const { primitives } = buildGlyphPrimitives({ shape: "terminator", width: W, height: H, strand: 1 });
    expect(primitives.length).toBeGreaterThanOrEqual(2);
    expect(primitives.every((p) => p.k === "path" && p.fill === false)).toBe(true);
  });
});

describe("feature-glyph-shapes — degenerate widths don't escape the box", () => {
  it.each(ALL_SHAPES)("shape '%s' stays in-bounds at width = 6 px", (shape) => {
    const { bbox } = buildGlyphPrimitives({ shape, width: 6, height: H, strand: 1 });
    expect(bbox.x).toBeGreaterThanOrEqual(-0.001);
    expect(bbox.x + bbox.w).toBeLessThanOrEqual(6 + 0.001);
    expect(bbox.y + bbox.h).toBeCloseTo(H, 5);
  });

  it("does not throw for width = 1 px on any shape", () => {
    for (const shape of ALL_SHAPES) {
      expect(() => buildGlyphPrimitives({ shape, width: 1, height: H, strand: 1 })).not.toThrow();
    }
  });
});
