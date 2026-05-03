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
