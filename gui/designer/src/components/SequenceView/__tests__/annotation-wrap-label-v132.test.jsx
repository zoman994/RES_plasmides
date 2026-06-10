/**
 * annotation-wrap-label-v132.test.jsx — V132.
 *
 * On a wrap-bridge row an origin-crossing feature renders in BOTH the
 * real stack (cols [0, wrapAt)) and the wrap stack (cols [wrapAt, lineLen)).
 * Before V132 each half drew its full label and near the ▶1 divider they
 * clamped to the seam and overlapped («скомкано»). Fix: the label is drawn
 * exactly once, on the wider visible half; the other half keeps its
 * rect/glyph/chevron but drops the label + leader. Also: a partial name
 * (`*_part_X-Y`) already carries its range, so the track no longer appends
 * a redundant «(span)».
 *
 * Bridge harness: lineStart=80, wrapAt=20, lineLen=40, seqLength=100 →
 * wrapWidthChars=20, realLineEnd=100. Real end [80,100) → cols [0,20);
 * plasmid start [0,20) → cols [20,40).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import AnnotationTrack from "../tracks/AnnotationTrack";

afterEach(cleanup);

const bridge = {
  lineStart: 80,
  lineLen: 40,
  charPx: 7.2,
  labelChars: 8,
  wrapsOrigin: true,
  wrapAt: 20,
  seqLength: 100,
};

describe("AnnotationTrack — V132 wrap-bridge single label", () => {
  it("1) origin-crossing feature shows exactly ONE label (on the wider half), none in the wrap group", () => {
    // [8,99]: realVis = min(99,100)-max(8,80) = 19; wrapVis = min(99,20)-max(8,0) = 12.
    // Both halves are wide enough to fit «AmpR (91)» (so the old code drew TWO
    // labels). 19 >= 12 → label on the REAL half, suppressed on the wrap half.
    const region = { id: "ampR", start: 8, end: 99, name: "AmpR", type: "CDS", color: "#56B4E9" };
    const { container } = render(<AnnotationTrack regions={[region]} {...bridge} />);
    const labels = container.querySelectorAll('[data-testid="sequence-view-annotation-label"]');
    expect(labels.length).toBe(1);
    expect(labels[0].dataset.labelFeature).toBe("AmpR");
    // The wrap-half group still renders (rect/chevron) but NOT the label.
    const wrapGroup = container.querySelector('[data-region-segment="wrap"]');
    expect(wrapGroup).toBeTruthy();
    expect(wrapGroup.querySelector('[data-testid="sequence-view-annotation-label"]')).toBeNull();
  });

  it("2) wide *_part_X-Y feature shows the bare name, no redundant (span) suffix", () => {
    const region = { id: "p", start: 0, end: 200, name: "AmpR_part_530-861", type: "CDS", color: "#56B4E9" };
    const { container } = render(
      <AnnotationTrack regions={[region]} lineStart={0} lineLen={250} charPx={7.2} labelChars={8} />,
    );
    const label = container.querySelector('[data-testid="sequence-view-annotation-label"]');
    expect(label).toBeTruthy();
    expect(label.textContent).toBe("AmpR_part_530-861");
    expect(label.textContent).not.toMatch(/\(\d+\)/);
  });

  it("3) regression: a start-only feature (realVis=0, e.g. MCS) keeps its label on the wrap half", () => {
    // [0,15]: realVis = max(0, min(15,100)-max(0,80)) = 0 → NOT origin-crossing → not suppressed.
    const region = { id: "mcs", start: 0, end: 15, name: "MCS", type: "misc_feature", color: "#78716C" };
    const { container } = render(<AnnotationTrack regions={[region]} {...bridge} />);
    const labels = container.querySelectorAll('[data-testid="sequence-view-annotation-label"]');
    expect(labels.length).toBe(1);
    const wrapGroup = container.querySelector('[data-region-segment="wrap"]');
    expect(wrapGroup.querySelector('[data-testid="sequence-view-annotation-label"]')).toBeTruthy();
  });

  it("4) regression: non-bridge line draws the label as before, (span) kept for a non-partial", () => {
    const region = { id: "ampR2", start: 0, end: 200, name: "AmpR", type: "CDS", color: "#56B4E9" };
    const { container } = render(
      <AnnotationTrack regions={[region]} lineStart={0} lineLen={250} charPx={7.2} labelChars={8} />,
    );
    const labels = container.querySelectorAll('[data-testid="sequence-view-annotation-label"]');
    expect(labels.length).toBe(1);
    expect(labels[0].textContent).toContain("AmpR");
    expect(labels[0].textContent).toMatch(/\(200\)/);
  });
});
