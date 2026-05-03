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
});
