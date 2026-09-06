/**
 * wrap-bridge-tracks-v102.test.jsx — V102 §5.2 / §5.3 coverage.
 *
 * On a wrap-bridge row (`wrapsOrigin === true`) the plasmid START
 * [0, wrapWidthChars) is shown a SECOND time in columns [wrapAt, lineLen),
 * past the ▶1 origin divider. Before V102 §5 the content tracks filtered
 * elements to the real range [lineStart, lineEnd) only, so primers and
 * restriction sites living at the plasmid start were invisible on the
 * bridge line — defeating the whole point of the wrap-tail (carrying
 * elements across the origin).
 *
 * Coordinate split (spec §4):
 *   - real segment: plasmid [lineStart, seqLength) → render columns [0, wrapAt)
 *   - wrap  segment: plasmid [0, wrapWidthChars)   → render columns [wrapAt, lineLen)
 *     (render column = wrapAt + position-within-wrap)
 *
 * Scenarios:
 *   PrimerTrack
 *     1) primer binding at the plasmid start renders on the wrap-half
 *     2) non-bridge row unchanged (legacy real-column render)
 *   RestrictionTrack
 *     3) site at a wrap position renders with the wrap render column
 *     4) non-bridge row unchanged
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PrimerTrack from "../tracks/PrimerTrack";
import RestrictionTrack from "../tracks/RestrictionTrack";

afterEach(cleanup);

// 100 bp plasmid; a unique 14-bp forward primer footprint sits at the
// very start (index 0). The tail is all-A so the footprint never recurs.
const PLASMID = "AAAACCCCGGGGTT" + "A".repeat(86); // length 100
const originPrimer = {
  name: "P_origin",
  direction: "forward",
  bindingSequence: "AAAACCCCGGGGTT",
  tmBinding: 60,
};

describe("PrimerTrack — V102 §5.2 wrap-bridge awareness", () => {
  it("1) primer binding at plasmid start renders on the wrap-half", () => {
    // Bridge: lineStart=80, wrapAt=20, lineLen=40, seqLength=100 →
    // wrapWidth=20. The primer hit [0..14) never touches the real range
    // [80..100) but fully lands inside the wrap range [0..20).
    render(
      <PrimerTrack
        primers={[originPrimer]}
        fullSeq={PLASMID}
        lineStart={80}
        lineLen={40}
        charPx={7.2}
        labelChars={8}
        primerStyle="filled"
        wrapsOrigin
        wrapAt={20}
        seqLength={100}
      />,
    );
    const hits = screen.getAllByTestId("sequence-view-primer");
    expect(hits.length).toBe(1);
    // xLeft = (labelChars + wrapAt + visStart) * charPx = (8 + 20 + 0)*7.2 = 201.6
    expect(hits[0].getAttribute("transform")).toContain("translate(201.6");
    // Inscribed bases come from the ABSOLUTE slice [0,14) → start-of-plasmid.
    expect(screen.getByTestId("sequence-view-primer-bases").textContent).toBe(
      "AAAACCCCGGGGTT",
    );
  });

  it("2) non-bridge row renders unchanged (legacy real column)", () => {
    render(
      <PrimerTrack
        primers={[originPrimer]}
        fullSeq={PLASMID}
        lineStart={0}
        lineLen={100}
        charPx={7.2}
        labelChars={8}
        primerStyle="filled"
        // no wrapsOrigin / wrapAt / seqLength → legacy path
      />,
    );
    const hits = screen.getAllByTestId("sequence-view-primer");
    expect(hits.length).toBe(1);
    // xLeft = (labelChars + (start - lineStart)) * charPx = (8 + 0)*7.2 = 57.6
    expect(hits[0].getAttribute("transform")).toContain("translate(57.6");
  });
});

describe("RestrictionTrack — V102 §5.3 wrap-bridge awareness", () => {
  it("3) site at a wrap position renders with the wrap render column", () => {
    // Bridge: lineStart=80, wrapAt=20, lineLen=40, seqLength=100 →
    // wrapWidth=20. A site at plasmid position 5 is below lineStart=80
    // (invisible under the legacy real-only filter) but inside [0..20).
    render(
      <RestrictionTrack
        sites={[{ enzyme: "EcoRI", position: 5 }]}
        lineStart={80}
        lineLen={40}
        charPx={7.2}
        labelChars={8}
        wrapsOrigin
        wrapAt={20}
        seqLength={100}
      />,
    );
    const site = screen.getByTestId("sequence-view-re-site");
    expect(site.getAttribute("data-position")).toBe("5");
    // renderCi = wrapAt + position = 25; cut tick naturalX =
    // (labelChars + renderCi + 0.5) * charPx = (8 + 25 + 0.5) * 7.2 = 241.2
    const tick = site.querySelector('[data-testid="sequence-view-re-cut-tick"]');
    expect(Number(tick.getAttribute("x1"))).toBeCloseTo((8 + 25 + 0.5) * 7.2, 3);
  });

  it("4) non-bridge row renders unchanged (legacy real column)", () => {
    render(
      <RestrictionTrack
        sites={[{ enzyme: "EcoRI", position: 5 }]}
        lineStart={0}
        lineLen={100}
        charPx={7.2}
        labelChars={8}
        // no wrapsOrigin / wrapAt / seqLength → legacy path
      />,
    );
    const site = screen.getByTestId("sequence-view-re-site");
    expect(site.getAttribute("data-position")).toBe("5");
    // renderCi = position - lineStart = 5; naturalX = (8 + 5 + 0.5)*7.2 = 97.2
    const tick = site.querySelector('[data-testid="sequence-view-re-cut-tick"]');
    expect(Number(tick.getAttribute("x1"))).toBeCloseTo((8 + 5 + 0.5) * 7.2, 3);
  });

  it("5) adjacent real-end and wrap-start sites keep their coordinates and use separate lanes", () => {
    render(
      <RestrictionTrack
        sites={[
          { enzyme: "EcoRI", position: 99 },
          { enzyme: "BamHI", position: 0 },
        ]}
        lineStart={80}
        lineLen={40}
        charPx={7.2}
        labelChars={8}
        wrapsOrigin
        wrapAt={20}
        seqLength={100}
      />,
    );

    const rendered = Object.fromEntries(screen.getAllByTestId("sequence-view-re-site")
      .map((site) => [site.getAttribute("data-enzyme"), site]));
    expect(rendered.EcoRI.getAttribute("data-position")).toBe("99");
    expect(rendered.BamHI.getAttribute("data-position")).toBe("0");
    expect(rendered.EcoRI.getAttribute("data-lane"))
      .not.toBe(rendered.BamHI.getAttribute("data-lane"));

    const ecoTick = rendered.EcoRI.querySelector('[data-testid="sequence-view-re-cut-tick"]');
    const bamTick = rendered.BamHI.querySelector('[data-testid="sequence-view-re-cut-tick"]');
    expect(Number(ecoTick.getAttribute("x1"))).toBeCloseTo((8 + 19 + 0.5) * 7.2, 3);
    expect(Number(bamTick.getAttribute("x1"))).toBeCloseTo((8 + 20 + 0.5) * 7.2, 3);
  });
});
