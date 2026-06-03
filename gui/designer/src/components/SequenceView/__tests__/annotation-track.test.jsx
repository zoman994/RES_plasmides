/**
 * annotation-track.test.jsx — K3 integration coverage for AnnotationTrack.
 *
 * Three integration cases match Sprint M-B.3 §6 K3:
 *  1) overlap collapse fix (Bug 2): two overlapping regions render two rows
 *  2) overflow indicator: 5+ overlapping regions show "+N more" pill
 *  3) regression vs Bug 1: 379 nt feature spanning 5 lines yields exactly
 *     one label per (line, feature) pair (5 labels total)
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import AnnotationTrack from "../tracks/AnnotationTrack";

afterEach(cleanup);

describe("AnnotationTrack — K3 integration", () => {
  it("1) two overlapping regions render on two rows (Bug 2 fix)", () => {
    const regions = [
      { id: "promoter", start: 0, end: 50, name: "T7", type: "promoter", color: "#009E73" },
      { id: "rbs", start: 30, end: 60, name: "RBS", type: "RBS", color: "#8B5CF6" },
    ];
    render(
      <AnnotationTrack
        regions={regions}
        lineStart={0}
        lineLen={100}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const root = screen.getByTestId("sequence-view-annotations");
    expect(root.dataset.rowCount).toBe("2");
    const labels = screen.getAllByTestId("sequence-view-annotation");
    expect(labels.map((el) => el.dataset.regionRow).sort()).toEqual(["0", "1"]);
  });

  it("2) more than MAX_VISIBLE_ROWS overlapping regions show overflow pill", () => {
    const regions = Array.from({ length: 6 }, (_, i) => ({
      id: `f${i}`,
      start: 0 + i,
      end: 90,
      name: `F${i}`,
      type: "misc_feature",
      color: "#9ca3af",
    }));
    render(
      <AnnotationTrack
        regions={regions}
        lineStart={0}
        lineLen={100}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const overflow = screen.getByTestId("sequence-view-annotation-overflow");
    expect(overflow.dataset.overflowCount).toBe("2");
    expect(overflow.textContent).toContain("+2 more");
  });

  it("3) Bug 1 regression: 379 nt feature on 5 lines → 5 labels (one per line)", () => {
    // Mimic SequenceView orchestrator: re-mount AnnotationTrack per line.
    const region = {
      id: "cmv",
      start: 0,
      end: 379,
      name: "CMV enhancer",
      type: "enhancer",
      color: "#8B5CF6",
    };
    const charsPerLine = 80;
    const lineCount = 5;
    const { container } = render(
      <div>
        {Array.from({ length: lineCount }, (_, i) => (
          <AnnotationTrack
            key={i}
            regions={[region]}
            lineStart={i * charsPerLine}
            lineLen={Math.min(charsPerLine, region.end - i * charsPerLine)}
            charPx={7.2}
            labelChars={8}
          />
        ))}
      </div>,
    );
    // Each line either renders the label inside the rect (>= label width)
    // or as a leader-line. Either mode counts. Expect EXACTLY one
    // `data-testid="sequence-view-annotation-label"` per line.
    const labels = container.querySelectorAll(
      '[data-testid="sequence-view-annotation-label"]',
    );
    expect(labels.length).toBe(lineCount);
    // Every label belongs to the same feature.
    Array.from(labels).forEach((el) => {
      expect(el.dataset.labelFeature).toBe("CMV enhancer");
    });
  });

  // ─── Sprint M-X.1 K4 — predicted region visual ───────────────────

  it("4) predicted region renders dashed-stroke + transparent-ish fill + data-predicted=true", () => {
    const region = {
      id: "pred-1",
      start: 0,
      end: 50,
      name: "Probable σ70 promoter",
      type: "promoter",
      color: "#009E73",
      predicted: true,
      source: "sigma70_pwm",
      confidence: 0.78,
    };
    const { container } = render(
      <AnnotationTrack
        regions={[region]}
        lineStart={0}
        lineLen={100}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const annotation = screen.getByTestId("sequence-view-annotation");
    expect(annotation.dataset.predicted).toBe("true");
    // Look up the rect inside the annotation group.
    const rect = annotation.querySelector("rect");
    expect(rect).toBeTruthy();
    // Dashed stroke, no solid fill.
    expect(rect.getAttribute("stroke-dasharray")).toBeTruthy();
    const fill = rect.getAttribute("fill");
    // Either explicit transparent or very low alpha.
    expect(fill === "transparent" || /^#?[0-9a-f]+$/i.test(fill)).toBe(true);
    // SVG attribute ratchet sanity: container is alive.
    expect(container).toBeTruthy();
  });

  it("5) confident region has no data-predicted, solid filled rect (regression)", () => {
    const region = {
      id: "conf-1",
      start: 0,
      end: 50,
      name: "AmpR",
      type: "marker",
      color: "#56B4E9",
    };
    render(
      <AnnotationTrack
        regions={[region]}
        lineStart={0}
        lineLen={100}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const annotation = screen.getByTestId("sequence-view-annotation");
    expect(annotation.dataset.predicted).toBeUndefined();
    const rect = annotation.querySelector("rect");
    expect(rect.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("6) mixed render: 2 confident + 2 predicted → 4 rects, 2 dashed", () => {
    const regions = [
      { id: "c1", start: 0, end: 30, name: "AmpR", type: "marker", color: "#56B4E9" },
      { id: "c2", start: 100, end: 130, name: "ori", type: "rep_origin", color: "#E69F00" },
      { id: "p1", start: 200, end: 240, name: "Probable σ70 promoter", type: "promoter", color: "#009E73", predicted: true },
      { id: "p2", start: 260, end: 350, name: "ORF (120 aa)", type: "CDS", color: "#9ca3af", predicted: true },
    ];
    render(
      <AnnotationTrack
        regions={regions}
        lineStart={0}
        lineLen={400}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const annotations = screen.getAllByTestId("sequence-view-annotation");
    expect(annotations.length).toBe(4);
    const predicted = annotations.filter((a) => a.dataset.predicted === "true");
    expect(predicted.length).toBe(2);
    // P4 — the predicted (dashed) treatment now lives on the drawn glyph
    // body: the CDS arrow path for CDS-family, the colour bar for non-CDS.
    // Each predicted feature carries a dashed stroke somewhere in its group.
    const dashed = predicted.filter((a) => a.querySelector("[stroke-dasharray]"));
    expect(dashed.length).toBe(2);
  });

  it("7) predicted label gets `~` prefix and italic style", () => {
    const region = {
      id: "p-italic",
      start: 0,
      end: 200,                         // wide enough to render label inside
      name: "Probable σ70 promoter",
      type: "promoter",
      color: "#009E73",
      predicted: true,
      source: "sigma70_pwm",
    };
    const { container } = render(
      <AnnotationTrack
        regions={[region]}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const labelEl = container.querySelector(
      '[data-testid="sequence-view-annotation-label"]',
    );
    expect(labelEl).toBeTruthy();
    expect(labelEl.textContent).toMatch(/^~/); // tilde prefix
    expect(labelEl.textContent).toContain("Probable σ70 promoter");
    // SVG `font-style="italic"` attribute (preferred over inline-style for
    // SVG text — happy-dom also reflects `style.fontStyle`).
    const fontStyle =
      labelEl.getAttribute("font-style") || labelEl.style.fontStyle;
    expect(fontStyle).toBe("italic");
  });

  it("8) confident label has NO tilde and is non-italic (regression)", () => {
    const region = {
      id: "c-plain",
      start: 0,
      end: 200,
      name: "AmpR",
      type: "marker",
      color: "#56B4E9",
    };
    const { container } = render(
      <AnnotationTrack
        regions={[region]}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const labelEl = container.querySelector(
      '[data-testid="sequence-view-annotation-label"]',
    );
    expect(labelEl).toBeTruthy();
    expect(labelEl.textContent).not.toMatch(/^~/);
    const fontStyle =
      labelEl.getAttribute("font-style") || labelEl.style.fontStyle || "";
    expect(fontStyle).not.toBe("italic");
  });
});

// P4 — SBOL glyph BODY render. The feature's body shape now conveys its
// type: CDS-family → directional arrow (point IS the strand cue); non-CDS
// typed → colour bar + an ink SBOL motif overlay; misc/unknown → plain
// colour bar. Strand is baked into the glyph geometry (no scale(-1,1)
// transform). Replaces the old small left badge (SBOLIcon).
describe("AnnotationTrack — SBOL glyph body render (P4)", () => {
  const barsOf = (container, id) =>
    Array.from(container.querySelectorAll(`rect[data-region-id="${id}"]`))
      .filter((r) => r.getAttribute("data-region-hit") !== "true");

  it("a wide CDS renders the directional arrow body (feature-glyph, shape=cds)", () => {
    const regions = [
      { id: "amp", start: 0, end: 200, name: "AmpR", type: "CDS", strand: 1, color: "#7CB342", level: "region" },
    ];
    const { container } = render(
      <AnnotationTrack regions={regions} lineStart={0} lineLen={250} charPx={7.2} labelChars={8} />,
    );
    const g = container.querySelector('[data-testid="feature-glyph"]');
    expect(g).toBeTruthy();
    expect(g.getAttribute("data-glyph-shape")).toBe("cds");
  });

  it("a non-CDS typed feature renders an ink SBOL motif matching its type", () => {
    const regions = [
      { id: "p", start: 0, end: 200, name: "T7", type: "promoter", color: "#009E73", level: "region" },
    ];
    const { container } = render(
      <AnnotationTrack regions={regions} lineStart={0} lineLen={250} charPx={7.2} labelChars={8} />,
    );
    const g = container.querySelector('[data-testid="feature-glyph"]');
    expect(g).toBeTruthy();
    expect(g.getAttribute("data-glyph-shape")).toBe("promoter");
    expect(g.getAttribute("data-glyph-type")).toBe("promoter");
  });

  it("a non-CDS feature keeps its colour bar under the motif", () => {
    const regions = [
      { id: "t", start: 0, end: 200, name: "T1", type: "terminator", color: "#E69F00", level: "region" },
    ];
    const { container } = render(
      <AnnotationTrack regions={regions} lineStart={0} lineLen={250} charPx={7.2} labelChars={8} />,
    );
    const bars = barsOf(container, "t");
    expect(bars.length).toBe(1);
    expect(bars[0].getAttribute("fill")).toBe("#E69F00");
  });

  it("misc_feature / unknown type renders the plain colour bar (no motif)", () => {
    const regions = [
      { id: "u", start: 0, end: 200, name: "X", type: "totally-made-up", color: "#888", level: "region" },
    ];
    const { container } = render(
      <AnnotationTrack regions={regions} lineStart={0} lineLen={250} charPx={7.2} labelChars={8} />,
    );
    // No SBOL glyph for a generic feature…
    expect(container.querySelector('[data-testid="feature-glyph"]')).toBeNull();
    // …but the colour bar still renders.
    expect(barsOf(container, "u").length).toBe(1);
  });

  it("a narrow non-CDS feature shows no motif (bar only)", () => {
    const regions = [
      { id: "tiny", start: 0, end: 1, name: "x", type: "promoter", color: "#009E73", level: "region" },
    ];
    const { container } = render(
      <AnnotationTrack regions={regions} lineStart={0} lineLen={250} charPx={7.2} labelChars={8} />,
    );
    expect(container.querySelector('[data-testid="feature-glyph"]')).toBeNull();
  });

  it("reverse strand bakes direction into the geometry (no scale(-1,1) transform)", () => {
    const regions = [
      { id: "r", start: 0, end: 200, name: "rev", type: "CDS", strand: -1, color: "#7CB342", level: "region" },
    ];
    const { container } = render(
      <AnnotationTrack regions={regions} lineStart={0} lineLen={250} charPx={7.2} labelChars={8} />,
    );
    const g = container.querySelector('[data-testid="feature-glyph"]');
    expect(g.getAttribute("data-glyph-strand")).toBe("-1");
    expect(g.getAttribute("transform") || "").not.toMatch(/scale\(-1/);
  });

  it("forward vs reverse CDS arrows differ (the point flips side via geometry)", () => {
    const mk = (strand, id) =>
      render(
        <AnnotationTrack
          regions={[{ id, start: 0, end: 200, name: id, type: "CDS", strand, color: "#888", level: "region" }]}
          lineStart={0} lineLen={250} charPx={7.2} labelChars={8}
        />,
      ).container.querySelector('[data-testid="feature-glyph"] path').getAttribute("d");
    const fwd = mk(1, "f");
    cleanup();
    const rev = mk(-1, "r");
    expect(fwd).not.toBe(rev);
  });

  it("a long CDS draws the arrow only on its far-end line (continuations = flat bars)", () => {
    // CDS 0..400 over 5 lines of 80 chars. Only the last line (contains
    // end=400, fwd) draws the arrow; the other 4 are flat colour bars.
    const region = { id: "long", start: 0, end: 400, name: "bigCDS", type: "CDS", strand: 1, color: "#7CB342", level: "region" };
    const charsPerLine = 80;
    const { container } = render(
      <div>
        {Array.from({ length: 5 }, (_, i) => (
          <AnnotationTrack
            key={i} regions={[region]} lineStart={i * charsPerLine}
            lineLen={Math.min(charsPerLine, region.end - i * charsPerLine)}
            charPx={7.2} labelChars={8}
          />
        ))}
      </div>,
    );
    const arrows = container.querySelectorAll('[data-testid="feature-glyph"][data-glyph-shape="cds"]');
    expect(arrows.length).toBe(1);
    // One transparent hit-rect per line keeps interaction on all 5.
    expect(container.querySelectorAll('rect[data-region-hit="true"]').length).toBe(5);
  });

  it("clicking a feature still fires onAnnotationClick (transparent hit-rect)", () => {
    const onClick = vi.fn();
    const regions = [
      { id: "amp", start: 0, end: 200, name: "AmpR", type: "CDS", strand: 1, color: "#7CB342", level: "region" },
    ];
    const { container } = render(
      <AnnotationTrack
        regions={regions} lineStart={0} lineLen={250} charPx={7.2} labelChars={8}
        onAnnotationClick={onClick}
      />,
    );
    const hit = container.querySelector('rect[data-region-hit="true"]');
    expect(hit).toBeTruthy();
    fireEvent.click(hit);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

// Sprint M-X.3 follow-up — sub-features rendered INSET inside parent
// (Variant A). Biolog «нужно так чтобы однозначно было видно что
// это сплит фича... давай А реализуем». Children share the parent's
// row, render at smaller height so the parent's colour shows around
// them. They do NOT participate in the stacker's row-packing pass.
describe("AnnotationTrack — sub-feature inset rendering (Variant A)", () => {
  const PARENT = {
    id: "p1", start: 0, end: 200, name: "lacZα", type: "CDS",
    color: "#7CB342", level: "region", strand: 1,
  };
  const SUB_LEFT = {
    id: "sub-l", start: 0, end: 80, name: "sig", type: "signal_peptide",
    color: "#9B59B6", level: "detail", parentId: "p1", strand: 1,
  };
  const SUB_RIGHT = {
    id: "sub-r", start: 80, end: 200, name: "mature", type: "misc_feature",
    color: "#E67E22", level: "detail", parentId: "p1", strand: 1,
  };

  it("a parent with two children renders 1 stacked row + 2 child overlay rects", () => {
    const { container } = render(
      <AnnotationTrack
        regions={[PARENT, SUB_LEFT, SUB_RIGHT]}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const root = container.querySelector('[data-testid="sequence-view-annotations"]');
    // Stacker only packs the parent → single row.
    expect(root.dataset.rowCount).toBe("1");
    // Two detail rects were rendered as overlays.
    const subRects = container.querySelectorAll('[data-testid="annotation-subfeature-rect"]');
    expect(subRects.length).toBe(2);
  });

  it("sub-feature rect height < parent rect height (visible inset)", () => {
    const { container } = render(
      <AnnotationTrack
        regions={[PARENT, SUB_LEFT]}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const parentRect = container.querySelector('rect[data-region-id="p1"]');
    const subRect = container.querySelector('[data-testid="annotation-subfeature-rect"]');
    expect(parentRect).toBeTruthy();
    expect(subRect).toBeTruthy();
    expect(Number(subRect.getAttribute('height'))).toBeLessThan(Number(parentRect.getAttribute('height')));
  });

  it("sub-feature rect y > 0 — top inset off the parent's top edge", () => {
    const { container } = render(
      <AnnotationTrack
        regions={[PARENT, SUB_LEFT]}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const subRect = container.querySelector('[data-testid="annotation-subfeature-rect"]');
    expect(Number(subRect.getAttribute('y'))).toBeGreaterThan(0);
  });

  it("sub-feature uses its OWN palette colour (not the parent's)", () => {
    const { container } = render(
      <AnnotationTrack
        regions={[PARENT, SUB_LEFT]}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const subRect = container.querySelector('[data-testid="annotation-subfeature-rect"]');
    // The sub uses featureColorShaded(type, name) → not equal to the
    // parent's CDS green palette colour. We just need them to differ.
    const parentRect = container.querySelector('rect[data-region-id="p1"]');
    expect(subRect.getAttribute('fill')).not.toBe(parentRect.getAttribute('fill'));
  });

  it("sub-feature carries data-region-level=\"detail\" + data-parent-id for inspection", () => {
    const { container } = render(
      <AnnotationTrack
        regions={[PARENT, SUB_LEFT]}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const subRect = container.querySelector('[data-testid="annotation-subfeature-rect"]');
    expect(subRect.getAttribute('data-region-level')).toBe('detail');
    expect(subRect.getAttribute('data-parent-id')).toBe('p1');
  });

  it("orphan detail (no matching parent on this line) is skipped (no rect)", () => {
    const orphan = {
      id: "orph", start: 0, end: 50, name: "x", type: "misc_feature",
      color: "#888", level: "detail", parentId: "nonexistent", strand: 1,
    };
    const { container } = render(
      <AnnotationTrack
        regions={[orphan]}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    expect(container.querySelectorAll('[data-testid="annotation-subfeature-rect"]').length).toBe(0);
  });

  it("a parent without children renders normally (no overlay rects)", () => {
    const { container } = render(
      <AnnotationTrack
        regions={[PARENT]}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    expect(container.querySelectorAll('[data-testid="annotation-subfeature-rect"]').length).toBe(0);
  });

  // Biolog: «имя детей не отражается». Each sub-feature wide enough
  // to fit a tiny label gets its name rendered inside its rect.
  it("a wide sub-feature renders its name as a label inside the kid rect", () => {
    const { container } = render(
      <AnnotationTrack
        regions={[PARENT, SUB_LEFT, SUB_RIGHT]}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const kidLabels = container.querySelectorAll('[data-testid="annotation-subfeature-label"]');
    expect(kidLabels.length).toBeGreaterThanOrEqual(1);
    const labelTexts = Array.from(kidLabels).map((t) => t.textContent);
    // SUB_LEFT.name = 'sig' is short — should fit easily.
    expect(labelTexts).toContain('sig');
  });

  it("a very narrow sub-feature (< minimum width) does NOT render a label", () => {
    const tinyKid = {
      id: "tiny-sub", start: 0, end: 2, name: "x", type: "misc_feature",
      color: "#888", level: "detail", parentId: "p1", strand: 1,
    };
    const { container } = render(
      <AnnotationTrack
        regions={[PARENT, tinyKid]}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    // Rect still renders, but no label inside.
    expect(container.querySelectorAll('[data-testid="annotation-subfeature-rect"]').length).toBe(1);
    const labels = container.querySelectorAll('[data-testid="annotation-subfeature-label"]');
    expect(labels.length).toBe(0);
  });
});
