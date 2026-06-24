/**
 * strands-track.test.jsx — K2 integration coverage for StrandsTrack +
 * RulerTrack basics.
 *
 * Updated 03.05.2026 evening for the DOM-reduction refactor: nt spans
 * are now grouped into RUNS by (tint, intron) — see
 * `tracks/StrandsTrack.jsx` `buildRuns`. Tests assert on `data-strand`
 * + `data-testid="sequence-view-nt-run"` + concatenated text instead
 * of one span per nucleotide. The visual contract is identical — same
 * monospace cells, same colours, same lowercased intron letters —
 * just an order-of-magnitude fewer DOM nodes for paint.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import StrandsTrack from "../tracks/StrandsTrack";
import RulerTrack from "../tracks/RulerTrack";

afterEach(cleanup);

const SEQ_100 = "ATGC".repeat(25);

const annNull = (n) => new Array(n).fill(null);

function joinRunsText(strand) {
  const runs = screen
    .getAllByTestId("sequence-view-nt-run")
    .filter((el) => el.dataset.strand === strand);
  return runs.map((el) => el.textContent).join("");
}

describe("StrandsTrack — K2", () => {
  it("1) renders 100 bp top strand text (grouped into runs)", () => {
    render(
      <StrandsTrack
        lineStart={0}
        seq={SEQ_100}
        annMap={annNull(SEQ_100.length)}
        labelChars={8}
        showBottomStrand
      />,
    );
    // No annotations → all 100 nt collapse into a single run.
    expect(joinRunsText("top")).toBe(SEQ_100);
    expect(joinRunsText("top").length).toBe(100);
  });

  it("2) renders top + bottom by default and bottom carries complement", () => {
    render(
      <StrandsTrack
        lineStart={0}
        seq="ATGC"
        annMap={annNull(4)}
        labelChars={8}
        showBottomStrand
      />,
    );
    expect(screen.getByTestId("sequence-view-strands-top")).toBeTruthy();
    expect(screen.getByTestId("sequence-view-strands-bottom")).toBeTruthy();
    // ATGC complement (3'->5') = TACG
    expect(joinRunsText("bottom")).toBe("TACG");
  });

  it("3) region tint is applied via inline background style on the tinted run", () => {
    const ann = { id: "r1", color: "#56B4E9", type: "CDS" };
    const annMap = [ann, ann, null, null];
    render(
      <StrandsTrack
        lineStart={0}
        seq="ATGC"
        annMap={annMap}
        labelChars={8}
        showBottomStrand
      />,
    );
    const topRuns = screen
      .getAllByTestId("sequence-view-nt-run")
      .filter((el) => el.dataset.strand === "top");
    // Two runs expected: tinted (AT, positions 0-1) + transparent (GC, 2-3).
    expect(topRuns).toHaveLength(2);
    expect(topRuns[0].textContent).toBe("AT");
    expect(topRuns[1].textContent).toBe("GC");
    // happy-dom keeps 8-digit hex (#RRGGBBAA) verbatim instead of
    // normalising to rgba(); just assert the alpha-suffixed value made
    // it onto the inline style.
    expect(topRuns[0].style.background.toLowerCase()).toContain("#56b4e9");
    expect(topRuns[1].style.background).toBe("transparent");
    // Position metadata preserved on the run boundaries.
    expect(topRuns[0].dataset.posStart).toBe("0");
    expect(topRuns[0].dataset.posEnd).toBe("1");
    expect(topRuns[1].dataset.posStart).toBe("2");
    expect(topRuns[1].dataset.posEnd).toBe("3");
  });

  it("4) intron annotation lowercases and adds diagonal hatching", () => {
    const intron = { id: "i1", type: "intron", color: "#999999" };
    const annMap = [null, intron, intron, null];
    render(
      <StrandsTrack
        lineStart={0}
        seq="ATGC"
        annMap={annMap}
        labelChars={8}
        showBottomStrand
      />,
    );
    const topRuns = screen
      .getAllByTestId("sequence-view-nt-run")
      .filter((el) => el.dataset.strand === "top");
    // Three runs: A (no intron), tg (intron, lowercased), C (no intron).
    expect(topRuns).toHaveLength(3);
    expect(topRuns[0].textContent).toBe("A");
    expect(topRuns[0].dataset.intron).toBe("false");
    expect(topRuns[1].textContent).toBe("tg");
    expect(topRuns[1].dataset.intron).toBe("true");
    expect(topRuns[1].style.backgroundImage).toContain("repeating-linear-gradient");
    expect(topRuns[2].textContent).toBe("C");
    expect(topRuns[2].dataset.intron).toBe("false");
    // happy-dom returns "initial"/"" for unset background-image; either is fine.
    expect(topRuns[2].style.backgroundImage || "").not.toContain(
      "repeating-linear-gradient",
    );
  });

  it("5) showBottomStrand=false hides the bottom row entirely", () => {
    render(
      <StrandsTrack
        lineStart={0}
        seq="ATGC"
        annMap={annNull(4)}
        labelChars={8}
        showBottomStrand={false}
      />,
    );
    expect(screen.queryByTestId("sequence-view-strands-top")).toBeTruthy();
    expect(screen.queryByTestId("sequence-view-strands-bottom")).toBeNull();
  });
});

describe("StrandsTrack — align per-line gutter label (opt-in)", () => {
  it("renders the reference name in the top gutter when gutterLabel is set", () => {
    render(
      <StrandsTrack
        lineStart={120}
        seq="ATGC"
        annMap={annNull(4)}
        labelChars={8}
        which="top"
        charPx={8}
        gutterLabel="pUC19"
      />,
    );
    expect(screen.getByTestId("strand-gutter-label").textContent).toBe("pUC19");
  });

  it("renders no gutter label without the prop (back-compat)", () => {
    render(
      <StrandsTrack lineStart={0} seq="ATGC" annMap={annNull(4)} labelChars={8} which="top" charPx={8} />,
    );
    expect(screen.queryByTestId("strand-gutter-label")).toBeNull();
  });

  it("never labels the bottom strand", () => {
    render(
      <StrandsTrack lineStart={0} seq="ATGC" annMap={annNull(4)} labelChars={8} which="bottom" charPx={8} gutterLabel="pUC19" />,
    );
    expect(screen.queryByTestId("strand-gutter-label")).toBeNull();
  });
});

describe("RulerTrack — smoke", () => {
  it("renders SVG with major+minor ticks for a 60 bp line", () => {
    render(<RulerTrack lineStart={0} lineLen={60} charPx={7.2} labelChars={8} />);
    const svg = screen.getByTestId("sequence-view-ruler");
    expect(svg.tagName).toBe("svg");
    // Major tick labels at positions 10, 20, 30, 40, 50, 60.
    const majorTexts = svg.querySelectorAll("text");
    const labels = Array.from(majorTexts).map((t) => t.textContent);
    // Includes line-end label (60) plus per-major labels.
    expect(labels).toContain("10");
    expect(labels).toContain("60");
  });
});

describe("StrandsTrack — restriction cut overlays (12.05.2026)", () => {
  const SEQ = "ATGC".repeat(50); // 200 bp
  const CHAR_PX = 10;
  const LABEL_CHARS = 8;

  // SnapGene-style (Игорь 22.06): the cut is a caret glyph (svg) CENTERED on the
  // gap — container left = (labelChars + pos)*charPx − charPx, width = 2*charPx.
  it("top-strand cut caret centered on gap x = (labelChars + pos) * charPx", () => {
    render(
      <StrandsTrack
        lineStart={0}
        seq={SEQ}
        annMap={annNull(SEQ.length)}
        labelChars={LABEL_CHARS}
        which="top"
        charPx={CHAR_PX}
        cutPositions={[{ key: 'EcoRI-50-top', pos: 51 }]}
      />,
    );
    const bars = screen.getAllByTestId('sequence-view-strand-cut');
    expect(bars.length).toBe(1);
    expect(bars[0].getAttribute('data-strand')).toBe('top');
    expect(bars[0].getAttribute('data-cut-pos')).toBe('51');
    expect(bars[0].tagName.toLowerCase()).toBe('svg');
    // A caret triangle is part of the glyph.
    expect(bars[0].querySelector('polygon')).toBeTruthy();
    // container left = (8 + 51)*10 − 10 = 580; cut line centered at +charPx.
    expect(bars[0].style.left).toBe('580px');
  });

  it("bottom-strand cut at a different position than top — true sticky-end picture", () => {
    render(
      <StrandsTrack
        lineStart={0}
        seq={SEQ}
        annMap={annNull(SEQ.length)}
        labelChars={LABEL_CHARS}
        which="bottom"
        charPx={CHAR_PX}
        cutPositions={[{ key: 'EcoRI-50-bot', pos: 55 }]}
      />,
    );
    const bars = screen.getAllByTestId('sequence-view-strand-cut');
    expect(bars.length).toBe(1);
    expect(bars[0].getAttribute('data-strand')).toBe('bottom');
    // container left = (8 + 55)*10 − 10 = 620
    expect(bars[0].style.left).toBe('620px');
  });

  it("sticky-end connector line joins the strand cuts (top strand only)", () => {
    // Top strand renders the inter-strand connector spanning the overhang.
    const { unmount } = render(
      <StrandsTrack
        lineStart={0}
        seq={SEQ}
        annMap={annNull(SEQ.length)}
        labelChars={LABEL_CHARS}
        which="top"
        charPx={CHAR_PX}
        overhangs={[{ key: 'EcoRI-50-ov', startPos: 51, endPos: 55 }]}
      />,
    );
    const conn = screen.getAllByTestId('sequence-view-strand-cut-connector');
    expect(conn.length).toBe(1);
    // left = (8 + 51)*10 = 590; width = (55 - 51)*10 = 40
    expect(conn[0].style.left).toBe('590px');
    expect(conn[0].style.width).toBe('40px');
    unmount();
    // Bottom strand does NOT duplicate the connector (it lives at the boundary).
    render(
      <StrandsTrack
        lineStart={0}
        seq={SEQ}
        annMap={annNull(SEQ.length)}
        labelChars={LABEL_CHARS}
        which="bottom"
        charPx={CHAR_PX}
        overhangs={[{ key: 'EcoRI-50-ov', startPos: 51, endPos: 55 }]}
      />,
    );
    expect(screen.queryAllByTestId('sequence-view-strand-cut-connector').length).toBe(0);
  });

  it("overhang highlight band spans from min to max cut on this strand row", () => {
    render(
      <StrandsTrack
        lineStart={0}
        seq={SEQ}
        annMap={annNull(SEQ.length)}
        labelChars={LABEL_CHARS}
        which="top"
        charPx={CHAR_PX}
        overhangs={[{ key: 'EcoRI-50-ov', startPos: 51, endPos: 55 }]}
      />,
    );
    const band = screen.getAllByTestId('sequence-view-strand-overhang');
    expect(band.length).toBe(1);
    // left = (8 + 51) * 10 = 590; width = (55 - 51) * 10 = 40
    expect(band[0].style.left).toBe('590px');
    expect(band[0].style.width).toBe('40px');
  });

  it("cuts outside line range are filtered out", () => {
    render(
      <StrandsTrack
        lineStart={100}
        seq={SEQ.slice(0, 50)}
        annMap={annNull(50)}
        labelChars={LABEL_CHARS}
        which="top"
        charPx={CHAR_PX}
        cutPositions={[
          { key: 'in-range', pos: 120 },   // inside [100, 150]
          { key: 'before', pos: 50 },      // before lineStart
          { key: 'after', pos: 200 },      // beyond lineEnd
        ]}
      />,
    );
    const bars = screen.getAllByTestId('sequence-view-strand-cut');
    expect(bars.length).toBe(1);
    expect(bars[0].getAttribute('data-cut-pos')).toBe('120');
  });

  it("binding-zone highlight spans the FULL recognition site width", () => {
    render(
      <StrandsTrack
        lineStart={0}
        seq={SEQ}
        annMap={annNull(SEQ.length)}
        labelChars={LABEL_CHARS}
        which="top"
        charPx={CHAR_PX}
        bindingHighlights={[
          { key: 'EcoRI-50-bind', startPos: 50, endPos: 56 }, // GAATTC = 6 bp
        ]}
      />,
    );
    const bind = screen.getAllByTestId('sequence-view-strand-binding');
    expect(bind.length).toBe(1);
    expect(bind[0].getAttribute('data-strand')).toBe('top');
    // left = (8 + 50) * 10 = 580; width = (56 - 50) * 10 = 60
    expect(bind[0].style.left).toBe('580px');
    expect(bind[0].style.width).toBe('60px');
  });

  it("binding highlight present on BOTH strands when passed to each", () => {
    // Top strand
    const { unmount } = render(
      <StrandsTrack
        lineStart={0}
        seq={SEQ}
        annMap={annNull(SEQ.length)}
        labelChars={LABEL_CHARS}
        which="top"
        charPx={CHAR_PX}
        bindingHighlights={[{ key: 'b1', startPos: 30, endPos: 36 }]}
      />,
    );
    expect(screen.getAllByTestId('sequence-view-strand-binding')[0].getAttribute('data-strand')).toBe('top');
    unmount();
    // Bottom strand
    render(
      <StrandsTrack
        lineStart={0}
        seq={SEQ}
        annMap={annNull(SEQ.length)}
        labelChars={LABEL_CHARS}
        which="bottom"
        charPx={CHAR_PX}
        bindingHighlights={[{ key: 'b1', startPos: 30, endPos: 36 }]}
      />,
    );
    expect(screen.getAllByTestId('sequence-view-strand-binding')[0].getAttribute('data-strand')).toBe('bottom');
  });

  it("no cuts/overhangs/bindings → renders just plain chars (back-compat)", () => {
    render(
      <StrandsTrack
        lineStart={0}
        seq={SEQ}
        annMap={annNull(SEQ.length)}
        labelChars={LABEL_CHARS}
        which="top"
        charPx={CHAR_PX}
      />,
    );
    expect(screen.queryAllByTestId('sequence-view-strand-cut').length).toBe(0);
    expect(screen.queryAllByTestId('sequence-view-strand-overhang').length).toBe(0);
    expect(screen.queryAllByTestId('sequence-view-strand-binding').length).toBe(0);
    expect(joinRunsText('top')).toBe(SEQ);
  });
});
