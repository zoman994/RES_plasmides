/**
 * feature-glyph.test.jsx — P3 render coverage for <FeatureGlyph>
 * (ANNOTATION_TRACK_DECOMP_PLAN §4.3).
 *
 * The component is a thin SVG renderer over feature-glyph-shapes' primitive
 * descriptors. It must:
 *   - resolve type → shape (specific-not-generic) and expose it + the SO
 *     term + strand as data-* hooks for downstream selectors;
 *   - render the right primitive kind per shape (path / circle / rect);
 *   - colour filled shapes with the feature colour and stroke-only shapes
 *     (promoter, terminator, primer) with the feature colour on the stroke;
 *   - apply the predicted (dashed) treatment per DEC-PRED-05.
 *
 * NOTE (P3): the component is NOT yet wired into AnnotationTrack — the swap
 * is P4 (visual-acceptance gated). These tests exercise it standalone.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { FeatureGlyph } from "../tracks/FeatureGlyph.jsx";

afterEach(cleanup);

// Render a single glyph inside an <svg> wrapper (SVG elements need an SVG
// root in happy-dom to mount cleanly).
function renderGlyph(props) {
  return render(
    <svg>
      <FeatureGlyph width={40} height={14} color="#7CB342" {...props} />
    </svg>,
  );
}

describe("FeatureGlyph — shape resolution + data hooks", () => {
  it("renders a <g data-testid=feature-glyph> with the resolved shape", () => {
    const { container } = renderGlyph({ type: "CDS" });
    const g = container.querySelector('[data-testid="feature-glyph"]');
    expect(g).toBeTruthy();
    expect(g.getAttribute("data-glyph-shape")).toBe("cds");
  });

  it("resolves promoter / misc_feature / unknown shapes correctly", () => {
    expect(
      renderGlyph({ type: "promoter" }).container
        .querySelector('[data-testid="feature-glyph"]').getAttribute("data-glyph-shape"),
    ).toBe("promoter");
    expect(
      renderGlyph({ type: "misc_feature" }).container
        .querySelector('[data-testid="feature-glyph"]').getAttribute("data-glyph-shape"),
    ).toBe("unspecified");
    expect(
      renderGlyph({ type: "totally-made-up" }).container
        .querySelector('[data-testid="feature-glyph"]').getAttribute("data-glyph-shape"),
    ).toBe("unspecified");
  });

  it("exposes the SO accession as data-glyph-so", () => {
    const g = renderGlyph({ type: "CDS" }).container.querySelector('[data-testid="feature-glyph"]');
    expect(g.getAttribute("data-glyph-so")).toBe("SO:0000316");
  });

  it("data-glyph-strand reflects the strand (default forward)", () => {
    const fwd = renderGlyph({ type: "CDS" }).container.querySelector('[data-testid="feature-glyph"]');
    expect(fwd.getAttribute("data-glyph-strand")).toBe("1");
    const rev = renderGlyph({ type: "CDS", strand: -1 }).container.querySelector('[data-testid="feature-glyph"]');
    expect(rev.getAttribute("data-glyph-strand")).toBe("-1");
  });

  it("forwards extra props (e.g. transform) onto the <g>", () => {
    const g = renderGlyph({ type: "CDS", transform: "translate(5, 2)" }).container
      .querySelector('[data-testid="feature-glyph"]');
    expect(g.getAttribute("transform")).toBe("translate(5, 2)");
  });
});

describe("FeatureGlyph — primitive rendering per shape", () => {
  it("CDS renders a single filled <path> (fill = feature colour, no dash)", () => {
    const { container } = renderGlyph({ type: "CDS" });
    const path = container.querySelector('[data-testid="feature-glyph"] path');
    expect(path).toBeTruthy();
    expect(path.getAttribute("fill")).not.toBe("none");
    expect(path.getAttribute("fill")).toBeTruthy();
    expect(path.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("origin renders a <circle>", () => {
    const { container } = renderGlyph({ type: "rep_origin" });
    expect(container.querySelector('[data-testid="feature-glyph"] circle')).toBeTruthy();
  });

  it("unspecified renders a <rect> spanning the box", () => {
    const { container } = renderGlyph({ type: "misc_feature" });
    const rect = container.querySelector('[data-testid="feature-glyph"] rect');
    expect(rect).toBeTruthy();
    expect(Number(rect.getAttribute("width"))).toBeCloseTo(40, 5);
    expect(Number(rect.getAttribute("height"))).toBeCloseTo(14, 5);
  });

  it("terminator is stroke-only (every path has fill=none) and carries the feature colour on the stroke", () => {
    const { container } = renderGlyph({ type: "terminator" });
    const paths = container.querySelectorAll('[data-testid="feature-glyph"] path');
    expect(paths.length).toBeGreaterThanOrEqual(2);
    paths.forEach((p) => {
      expect(p.getAttribute("fill")).toBe("none");
      expect(p.getAttribute("stroke")).toBe("#7CB342");
    });
  });
});

describe("FeatureGlyph — predicted treatment (DEC-PRED-05)", () => {
  it("predicted glyph dashes its stroke + sets data-predicted=true", () => {
    const { container } = renderGlyph({ type: "CDS", predicted: true });
    const g = container.querySelector('[data-testid="feature-glyph"]');
    expect(g.getAttribute("data-predicted")).toBe("true");
    const path = g.querySelector("path");
    expect(path.getAttribute("stroke-dasharray")).toBeTruthy();
  });

  it("confident glyph has no dash + no data-predicted (regression)", () => {
    const { container } = renderGlyph({ type: "CDS" });
    const g = container.querySelector('[data-testid="feature-glyph"]');
    expect(g.getAttribute("data-predicted")).toBeNull();
    expect(g.querySelector("path").getAttribute("stroke-dasharray")).toBeNull();
  });

  it("predicted filled shape uses transparent fill so the dashed outline reads (pLannotate)", () => {
    const { container } = renderGlyph({ type: "CDS", predicted: true });
    const path = container.querySelector('[data-testid="feature-glyph"] path');
    expect(path.getAttribute("fill")).toBe("transparent");
  });
});

describe("FeatureGlyph — outline mode (motif overlay on a coloured bar)", () => {
  it("outline forces every primitive to stroke-only (fill=none) in the given colour", () => {
    // rbs/operator are normally FILLED; outline must strip the fill so the
    // motif reads as ink line-art on top of the feature's colour bar.
    for (const type of ["RBS", "operator", "rep_origin", "terminator"]) {
      const { container } = renderGlyph({ type, color: "#1c1917", outline: true });
      const els = container.querySelectorAll('[data-testid="feature-glyph"] path, [data-testid="feature-glyph"] circle, [data-testid="feature-glyph"] rect');
      expect(els.length).toBeGreaterThanOrEqual(1);
      els.forEach((el) => {
        expect(el.getAttribute("fill")).toBe("none");
        expect(el.getAttribute("stroke")).toBe("#1c1917");
      });
      cleanup();
    }
  });

  it("outline still mirrors direction on reverse strand (geometry baked, no transform flip)", () => {
    const fwd = renderGlyph({ type: "promoter", outline: true, strand: 1 }).container
      .querySelector('[data-testid="feature-glyph"] path').getAttribute("d");
    cleanup();
    const rev = renderGlyph({ type: "promoter", outline: true, strand: -1 }).container
      .querySelector('[data-testid="feature-glyph"] path').getAttribute("d");
    expect(fwd).not.toBe(rev);
  });

  it("non-outline filled shape keeps its fill (regression)", () => {
    const { container } = renderGlyph({ type: "RBS", color: "#1c1917" });
    const path = container.querySelector('[data-testid="feature-glyph"] path');
    expect(path.getAttribute("fill")).not.toBe("none");
  });
});

describe("FeatureGlyph — smoke render for every mapped type", () => {
  const TYPES = [
    "CDS", "gene", "marker", "reporter", "promoter", "core_promoter",
    "terminator", "rep_origin", "RBS", "primer_bind", "protein_bind",
    "operator", "regulatory", "misc_feature",
  ];
  it.each(TYPES)("renders type '%s' without crashing and emits a primitive", (type) => {
    const { container } = renderGlyph({ type });
    const g = container.querySelector('[data-testid="feature-glyph"]');
    expect(g).toBeTruthy();
    // At least one drawable primitive element under the group.
    expect(g.querySelector("path, circle, rect")).toBeTruthy();
  });
});
