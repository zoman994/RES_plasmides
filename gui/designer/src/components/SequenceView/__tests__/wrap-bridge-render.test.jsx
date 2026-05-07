/**
 * wrap-bridge-render.test.jsx — M-X.5 hotfix coverage (07.05.2026).
 *
 * Round-10 (06.05.2026) introduced the inline wrap-bridge — the last
 * main row of a circular plasmid is physically extended past the
 * origin with wrap chars from plasmid start. The K-fix in
 * AnnotationTrack adds paired-rect rendering: for `wrapsOrigin === true`
 * lines, an annotation overlapping `[0, lineLen - wrapAt)` plasmid
 * coords gets a SECOND rect at columns wrapAt..wrapAt+overlapLen so
 * the bar reads continuously across the orange origin divider.
 *
 * Plan §K-fix scenarios (3 + regression guard):
 *   1) renders annotation across origin on bridge line as two rects
 *   2) wrap-segment appears only when annotation overlaps origin region
 *   3) label rendered once on the wider segment
 *   4) regression — non-bridge main row renders unchanged (single rect)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AnnotationTrack from "../tracks/AnnotationTrack";

afterEach(cleanup);

describe("AnnotationTrack — M-X.5 hotfix wrap-bridge render", () => {
  it("1) renders annotation across origin on bridge line as two rects", () => {
    // 100 bp circular plasmid; bridge line covers [80..100) ∪ [0..wrapWidth=20)
    // (lineStart=80, wrapAt=20, lineLen=40 — 20 chars real-end + 20 chars
    // wrap-half from plasmid start). Annotation [0..100] = whole plasmid.
    const regions = [
      { id: "whole", start: 0, end: 100, name: "Whole", type: "misc_feature", color: "#9ca3af" },
    ];
    render(
      <AnnotationTrack
        regions={regions}
        lineStart={80}
        lineLen={40}
        charPx={7.2}
        labelChars={8}
        wrapsOrigin
        wrapAt={20}
        seqLength={100}
      />,
    );
    const allRectGroups = screen.getAllByTestId("sequence-view-annotation");
    // Two <g data-testid="sequence-view-annotation"> for the same id —
    // one real-segment, one wrap-segment.
    expect(allRectGroups.length).toBe(2);
    const segments = allRectGroups.map((el) => el.dataset.regionSegment || "real");
    expect(segments.includes("wrap")).toBe(true);
    // The wrap-segment <g> sits at x = (labelChars + wrapAt) * charPx =
    // (8 + 20) * 7.2 = 201.6, for the wrap-part of the plasmid.
    const wrapGroup = allRectGroups.find((el) => el.dataset.regionSegment === "wrap");
    expect(wrapGroup).toBeTruthy();
    const transform = wrapGroup.getAttribute("transform") || "";
    expect(transform).toContain("translate(201.6");
  });

  it("2) wrap-segment appears only when annotation overlaps origin region", () => {
    // 100 bp circular, bridge lineStart=80, wrapAt=20, lineLen=40,
    // wrapWidth = lineLen - wrapAt = 20. Annotation [50..70] is fully
    // inside the real-half of the plasmid (50 < lineStart=80? — no,
    // 50 < 80 so it doesn't even land on the bridge line at all in
    // half-open overlap math). Use a feature that DOES land on the
    // bridge but ONLY in the real-half: [85..95]. wrapWidth check:
    // wrapAnnEnd = min(95, 20) = 20, wrapAnnStart = max(85, 0) = 85,
    // wrapVisLen = max(0, 20 - 85) = 0 → no wrap-segment.
    const regions = [
      { id: "real-only", start: 85, end: 95, name: "RealOnly", type: "CDS", color: "#0ea5e9" },
    ];
    render(
      <AnnotationTrack
        regions={regions}
        lineStart={80}
        lineLen={40}
        charPx={7.2}
        labelChars={8}
        wrapsOrigin
        wrapAt={20}
        seqLength={100}
      />,
    );
    const allRectGroups = screen.getAllByTestId("sequence-view-annotation");
    expect(allRectGroups.length).toBe(1);
    expect(allRectGroups[0].dataset.regionSegment).toBeFalsy();
  });

  it("3) label rendered once on the wider segment", () => {
    // 100 bp circular, bridge lineStart=80, wrapAt=10 (small real-part!),
    // lineLen=40, wrapWidth=30 (large wrap-part). Annotation [0..100] —
    // real-segment width = (90 - 80) = 10 chars × 7.2 = 72 px;
    // wrap-segment width = 30 chars × 7.2 = 216 px > 72 → label on wrap.
    const regions = [
      { id: "wider-wrap", start: 0, end: 100, name: "WiderWrap", type: "misc_feature", color: "#a3a3a3" },
    ];
    render(
      <AnnotationTrack
        regions={regions}
        lineStart={80}
        lineLen={40}
        charPx={7.2}
        labelChars={8}
        wrapsOrigin
        wrapAt={10}
        seqLength={100}
      />,
    );
    // There should be exactly one annotation label, attached to the
    // wrap-segment <g>. The real-segment <g> exists but its inline
    // label is suppressed via `labelGoesOnWrap`.
    const labels = screen.queryAllByTestId("sequence-view-annotation-label");
    expect(labels.length).toBe(1);
    const labelParent = labels[0].closest('[data-testid="sequence-view-annotation"]');
    expect(labelParent?.dataset.regionSegment).toBe("wrap");
  });

  it("4) non-bridge main row renders unchanged (regression guard)", () => {
    // Standard main row, no wrap awareness. Should produce ONE
    // <g data-testid="sequence-view-annotation"> per region — wrap
    // props absent / falsy collapses to legacy single-rect path.
    const regions = [
      { id: "regular", start: 0, end: 50, name: "T7", type: "promoter", color: "#009E73" },
    ];
    render(
      <AnnotationTrack
        regions={regions}
        lineStart={0}
        lineLen={100}
        charPx={7.2}
        labelChars={8}
        // NB: no `wrapsOrigin` / `wrapAt` / `seqLength` — defaults to
        // legacy single-rect render.
      />,
    );
    const allRectGroups = screen.getAllByTestId("sequence-view-annotation");
    expect(allRectGroups.length).toBe(1);
    expect(allRectGroups[0].dataset.regionSegment).toBeFalsy();
  });
});
