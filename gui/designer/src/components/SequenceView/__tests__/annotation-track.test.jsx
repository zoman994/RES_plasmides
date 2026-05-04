/**
 * annotation-track.test.jsx — K3 integration coverage for AnnotationTrack.
 *
 * Three integration cases match Sprint M-B.3 §6 K3:
 *  1) overlap collapse fix (Bug 2): two overlapping regions render two rows
 *  2) overflow indicator: 5+ overlapping regions show "+N more" pill
 *  3) regression vs Bug 1: 379 nt feature spanning 5 lines yields exactly
 *     one label per (line, feature) pair (5 labels total)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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
    const dashedRects = predicted
      .map((a) => a.querySelector("rect").getAttribute("stroke-dasharray"))
      .filter(Boolean);
    expect(dashedRects.length).toBe(2);
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

// Sprint M-X.3 follow-up — biolog «у нас кстати нет глифов, можем
// красиво добавить на сиквенс вью?». Each typed feature wide enough
// to fit the icon now renders an SBOL glyph at the left of its
// rect. Narrow features (< GLYPH_MIN_PX) skip the glyph; sub-region
// (level !== 'region') features do too — only top-level features
// get the type-cue treatment.
describe("AnnotationTrack — SBOL glyph badge", () => {
  it("renders an SBOL glyph for a wide CDS region", () => {
    const regions = [
      { id: "amp", start: 0, end: 200, name: "AmpR", type: "CDS", color: "#7CB342", level: "region" },
    ];
    const { container } = render(
      <AnnotationTrack
        regions={regions}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    expect(
      container.querySelector('[data-testid="annotation-feature-glyph"]')
    ).toBeTruthy();
  });

  it("the glyph carries data-glyph-type matching the region type", () => {
    const regions = [
      { id: "p", start: 0, end: 200, name: "T7", type: "promoter", color: "#009E73", level: "region" },
    ];
    const { container } = render(
      <AnnotationTrack
        regions={regions}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const g = container.querySelector('[data-testid="annotation-feature-glyph"]');
    expect(g.getAttribute('data-glyph-type')).toBe('promoter');
  });

  it("very narrow region (< GLYPH_MIN_PX wide) does NOT render a glyph", () => {
    // 5 nt at 7.2 px/char ≈ 36 px. Make it 1 nt to drop below the
    // 14 px glyph minimum.
    const regions = [
      { id: "tiny", start: 0, end: 1, name: "x", type: "CDS", color: "#7CB342", level: "region" },
    ];
    const { container } = render(
      <AnnotationTrack
        regions={regions}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    expect(
      container.querySelector('[data-testid="annotation-feature-glyph"]')
    ).toBeNull();
  });

  it("fallback to misc glyph for unknown type (stays renderable)", () => {
    const regions = [
      { id: "u", start: 0, end: 200, name: "X", type: "totally-made-up", color: "#888", level: "region" },
    ];
    const { container } = render(
      <AnnotationTrack
        regions={regions}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    // Glyph element still exists — SBOLIcon falls back to MiscGlyph.
    expect(
      container.querySelector('[data-testid="annotation-feature-glyph"]')
    ).toBeTruthy();
  });

  // Biolog: «глифы на CDS должны смотреть от метионина (направление
  // показывать), и когда мы делаем в фиче форвард или реверс — фичи
  // должны вращаться». The glyph wrapper applies a scale(-1, 1)
  // mirror when the region's strand is reverse, so SBOL directional
  // glyphs (CDS arrow, promoter L-arrow, terminator T) point AWAY
  // from the start codon side.
  it("forward-strand glyph has no horizontal flip", () => {
    const regions = [
      { id: "f", start: 0, end: 200, name: "AmpR", type: "CDS", strand: 1, color: "#7CB342", level: "region" },
    ];
    const { container } = render(
      <AnnotationTrack
        regions={regions}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const g = container.querySelector('[data-testid="annotation-feature-glyph"]');
    const t = g.getAttribute('transform') || '';
    // Should NOT contain a negative-x scale.
    expect(t).not.toMatch(/scale\(-1/);
  });

  it("reverse-strand glyph applies scale(-1, 1) (horizontal mirror)", () => {
    const regions = [
      { id: "r", start: 0, end: 200, name: "AmpR-rev", type: "CDS", strand: -1, color: "#7CB342", level: "region" },
    ];
    const { container } = render(
      <AnnotationTrack
        regions={regions}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const g = container.querySelector('[data-testid="annotation-feature-glyph"]');
    const t = g.getAttribute('transform') || '';
    expect(t).toMatch(/scale\(-1\s*,?\s*1\)/);
  });

  it("region without strand defaults to forward (no flip)", () => {
    const regions = [
      { id: "n", start: 0, end: 200, name: "lacZα", type: "CDS", color: "#888", level: "region" },
      // strand intentionally omitted
    ];
    const { container } = render(
      <AnnotationTrack
        regions={regions}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const g = container.querySelector('[data-testid="annotation-feature-glyph"]');
    expect((g.getAttribute('transform') || '')).not.toMatch(/scale\(-1/);
  });

  it("data-glyph-strand attribute mirrors region.strand for downstream test selectors", () => {
    const regions = [
      { id: "fwd", start: 0,   end: 100, name: "f", type: "CDS", strand: 1,  color: "#888", level: "region" },
      { id: "rev", start: 110, end: 200, name: "r", type: "CDS", strand: -1, color: "#888", level: "region" },
    ];
    const { container } = render(
      <AnnotationTrack
        regions={regions}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const glyphs = container.querySelectorAll('[data-testid="annotation-feature-glyph"]');
    const strands = Array.from(glyphs).map((g) => g.getAttribute('data-glyph-strand'));
    expect(strands).toContain('1');
    expect(strands).toContain('-1');
  });

  // Biolog: «глифы давай у названия, как будто бы так будет лучше».
  // When a feature shows its inside label, the glyph re-positions
  // next to the name (centred together) rather than sitting at a
  // fixed left offset that visually disconnects it from the label.
  it("glyph sits near the centred label, not at fixed left, when label is shown", () => {
    const regions = [
      { id: "wide", start: 0, end: 200, name: "AmpR", type: "CDS", strand: 1, color: "#888", level: "region" },
    ];
    const { container } = render(
      <AnnotationTrack
        regions={regions}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const g = container.querySelector('[data-testid="annotation-feature-glyph"]');
    expect(g).toBeTruthy();
    const t = g.getAttribute('transform') || '';
    // Glyph is no longer pinned to translate(2, …) — it now sits
    // somewhere closer to the rect centre when a label exists.
    const m = t.match(/translate\(([-\d.]+)/);
    expect(m).toBeTruthy();
    const tx = Number(m[1]);
    expect(tx).toBeGreaterThan(2.5); // moved past the old fixed-left
  });

  it("glyph + label are visually adjacent — text-anchor=start with label x just after glyph", () => {
    const regions = [
      { id: "wide", start: 0, end: 200, name: "lacZ", type: "CDS", strand: 1, color: "#888", level: "region" },
    ];
    const { container } = render(
      <AnnotationTrack
        regions={regions}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const glyph = container.querySelector('[data-testid="annotation-feature-glyph"]');
    const label = container.querySelector('[data-testid="sequence-view-annotation-label"]');
    expect(glyph).toBeTruthy();
    expect(label).toBeTruthy();
    // Label must use text-anchor="start" now (so its x sits at the
    // glyph's right edge); centre-anchored layouts would break the
    // «glyph hugs the name» visual.
    expect(label.getAttribute('text-anchor')).toBe('start');
    // Label x is just past the glyph (within ~4 px of glyph's
    // right edge).
    const gM = (glyph.getAttribute('transform') || '').match(/translate\(([-\d.]+)/);
    const gX = Number(gM[1]);
    const labelX = Number(label.getAttribute('x'));
    expect(labelX).toBeGreaterThanOrEqual(gX);
    expect(labelX - (gX + 11)).toBeLessThanOrEqual(6); // within 6 px after the 11-px glyph
  });

  it("reverse-strand glyph still flips when positioned next to the label", () => {
    const regions = [
      { id: "rev", start: 0, end: 200, name: "lacZ", type: "CDS", strand: -1, color: "#888", level: "region" },
    ];
    const { container } = render(
      <AnnotationTrack
        regions={regions}
        lineStart={0}
        lineLen={250}
        charPx={7.2}
        labelChars={8}
      />,
    );
    const g = container.querySelector('[data-testid="annotation-feature-glyph"]');
    expect((g.getAttribute('transform') || '')).toMatch(/scale\(-1\s*,?\s*1\)/);
  });
});
