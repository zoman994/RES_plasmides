/**
 * primer-track-redesign.test.jsx — Игорь 18.05.2026: «праймер — не
 * только полоска, но и последовательность буквами; кликабельность».
 *
 * PrimerTrack now renders the binding bases as letters, is clickable
 * (onPrimerClick + selectedPrimerKeys, consumer-gated), and shows a
 * selected ring + data-selected. Back-compat: no onPrimerClick ⇒ the
 * old decorative behaviour (pointer-events:none), all existing
 * data-testids/attrs preserved.
 */
import {
  describe, it, expect, afterEach, vi,
} from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import PrimerTrack, { primerHitKey } from "../tracks/PrimerTrack";

afterEach(cleanup);

const SEQ = "ATGCAAAGGGCCCTAACGTTAAA" + "G".repeat(60);
const fwd = {
  name: "p_fwd", bindingSequence: "ATGCAAAGGGCCC", direction: "forward", tmBinding: 60,
};
const rev = {
  name: "p_rev", bindingSequence: "GGGCCCTTTGCAT", direction: "reverse", tmBinding: 58,
};
const base = {
  fullSeq: SEQ, lineStart: 0, lineLen: SEQ.length, labelChars: 8, primerStyle: "filled",
};

describe("PrimerTrack redesign — letters / clickable / selected", () => {
  it("interactive compact view hides letters until this occurrence is expanded", () => {
    const { rerender } = render(
      <PrimerTrack {...base} primers={[fwd]} charPx={7.2} onPrimerClick={() => {}} />,
    );
    const primer = screen.getByTestId('sequence-view-primer');
    expect(primer.getAttribute('data-expanded')).toBe('false');
    expect(screen.queryByTestId("sequence-view-primer-bases")).toBeNull();
    rerender(
      <PrimerTrack
        {...base}
        primers={[fwd]}
        charPx={7.2}
        onPrimerClick={() => {}}
        expandedPrimerKey={primer.dataset.primerKey}
      />,
    );
    const bases = screen.getByTestId("sequence-view-primer-bases");
    expect(bases.textContent).toBe("ATGCAAAGGGCCC"); // top-strand footprint
    expect(bases.getAttribute("fill")).toBe("var(--primer-feature-body-text)");
  });

  it("hides letters at tiny zoom (charPx < 5) — no clutter", () => {
    render(<PrimerTrack {...base} primers={[fwd]} charPx={3} />);
    expect(screen.queryByTestId("sequence-view-primer-bases")).toBeNull();
    // bar itself still rendered
    expect(screen.getByTestId("sequence-view-primer")).toBeTruthy();
  });

  it("back-compat: without onPrimerClick the track is decorative", () => {
    const { container } = render(<PrimerTrack {...base} primers={[fwd]} charPx={7.2} />);
    const svg = container.querySelector('[data-testid="sequence-view-primers"]');
    expect(svg.style.pointerEvents).toBe("none");
    const g = screen.getByTestId("sequence-view-primer");
    expect(g.getAttribute("data-selected")).toBe("false");
    expect(g.getAttribute("data-primer-name")).toBe("p_fwd"); // attrs preserved
    expect(g.getAttribute("role")).toBeNull();
    expect(g.getAttribute("tabindex")).toBeNull();
  });

  it("clickable when onPrimerClick is provided → fires (key, hit)", () => {
    const onClick = vi.fn();
    render(<PrimerTrack {...base} primers={[fwd]} charPx={7.2} onPrimerClick={onClick} />);
    const g = screen.getByTestId("sequence-view-primer");
    expect(g.style.cursor).toBe("pointer");
    expect(g.getAttribute("role")).toBe("button");
    expect(g.getAttribute("tabindex")).toBe("0");
    expect(g.getAttribute("aria-label")).toMatch(/p_fwd.*прям/i);
    fireEvent.click(g, { ctrlKey: true });
    fireEvent.keyDown(g, { key: "Enter", metaKey: true });
    fireEvent.keyDown(g, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(3);
    const [key, hit, intent] = onClick.mock.calls[0];
    expect(typeof key).toBe("string");
    expect(hit.start).toBe(0);
    expect(hit.end).toBe(13);
    expect(key).toBe(primerHitKey(hit));
    expect(intent).toEqual({ additive: true, source: 'pointer' });
    expect(onClick.mock.calls[1][2]).toEqual({ additive: true, source: 'keyboard' });
  });

  it.each([
    ['forward', fwd, 'p_fwd|forward|0', 'var(--viz-primer-fwd)'],
    ['reverse', rev, 'p_rev|reverse|0', 'var(--viz-primer-rev)'],
  ])("selected %s primer keeps its direction color and uses short amber brackets", (
    direction, primer, selectedKey, directionColor,
  ) => {
    render(
      <PrimerTrack
        {...base}
        primerStyle="outline"
        primers={[primer]}
        charPx={7.2}
        onPrimerClick={() => {}}
        selectedPrimerKeys={[selectedKey]}
        expandedPrimerKey={selectedKey}
      />,
    );
    const g = screen.getByTestId("sequence-view-primer");
    expect(g.getAttribute("data-selected")).toBe("true");
    const shape = g.querySelector("[data-primer-arrow]");
    expect(shape).toBeTruthy();
    expect(shape.getAttribute('data-primer-arrow')).toBe(direction);
    expect(shape.getAttribute('fill')).toBe('none');
    expect(shape.getAttribute('stroke')).toBe(directionColor);
    const brackets = g.querySelectorAll('[data-primer-selection-bracket]');
    expect(brackets).toHaveLength(2);
    expect([...brackets].every((node) => node.getAttribute('stroke') === 'var(--accent-500)'))
      .toBe(true);
  });

  it("selected primer has no translucent bounding halo or box ring", () => {
    render(
      <PrimerTrack
        {...base}
        primers={[fwd]}
        charPx={7.2}
        onPrimerClick={() => {}}
        selectedPrimerKeys={["p_fwd|forward|0"]}
      />,
    );
    const g = screen.getByTestId("sequence-view-primer");
    expect(g.querySelector("[data-primer-selection-halo]")).toBeNull();
    expect(g.querySelector("[data-primer-selection-box]")).toBeNull();
  });

  it.each(['filled', 'outline'])(
    'selection changes only the amber brackets, not the expanded %s glyph body',
    (primerStyle) => {
      const key = 'p_fwd|forward|0';
      const props = {
        ...base,
        primerStyle,
        primers: [fwd],
        charPx: 7.2,
        onPrimerClick: () => {},
        expandedPrimerKey: key,
      };
      const { rerender } = render(<PrimerTrack {...props} />);
      const shapeSnapshot = () => [...screen.getByTestId('sequence-view-primer')
        .querySelectorAll('[data-primer-arrow], [data-testid="sequence-view-primer-run"]')]
        .map((node) => ({
          fill: node.getAttribute('fill'),
          fillOpacity: node.getAttribute('fill-opacity'),
          opacity: node.getAttribute('opacity'),
          stroke: node.getAttribute('stroke'),
        }));
      const unselected = shapeSnapshot();

      rerender(<PrimerTrack {...props} selectedPrimerKeys={[key]} />);
      expect(shapeSnapshot()).toEqual(unselected);
      expect(screen.getByTestId('sequence-view-primer')
        .querySelectorAll('[data-primer-selection-bracket]')).toHaveLength(2);
    },
  );

  it("double-click fires onPrimerDoubleClick(hit) (consumer-gated)", () => {
    const onDbl = vi.fn();
    render(
      <PrimerTrack {...base} primers={[fwd]} charPx={7.2} onPrimerDoubleClick={onDbl} />,
    );
    const g = screen.getByTestId("sequence-view-primer");
    expect(g.style.cursor).toBe("pointer"); // interactable via dbl alone
    fireEvent.doubleClick(g);
    fireEvent.keyDown(g, { key: "Enter" });
    expect(onDbl).toHaveBeenCalledTimes(2);
    expect(onDbl.mock.calls[0][0].start).toBe(0);
    expect(onDbl.mock.calls[0][0].name).toBe("p_fwd");
  });

  // Regression — Игорь 18.05.2026 «клики на праймерах не работают»:
  // an outline arrow (<path fill="none">) only hit-tests on its
  // hairline stroke and the inscribed bases text must not swallow
  // clicks. A transparent full-area hit rect restores clickability.
  it("interactive primer has a transparent full-area hit rect (any style)", () => {
    const onClick = vi.fn();
    render(
      <PrimerTrack
        {...base}
        primerStyle="outline"
        primers={[fwd]}
        charPx={7.2}
        onPrimerClick={onClick}
        expandedPrimerKey="p_fwd|forward|0"
      />,
    );
    const g = screen.getByTestId("sequence-view-primer");
    const hit = g.querySelector("[data-primer-hit]");
    expect(hit).toBeTruthy();
    expect(hit.getAttribute("fill")).toBe("transparent"); // NOT "none"
    // inscribed bases must NOT be pointer-events:none (was the bug)
    const txt = g.querySelector('[data-testid="sequence-view-primer-bases"]');
    expect(txt.style.pointerEvents).toBe("");
  });

  it("decorative track (no handlers) has NO hit rect", () => {
    const { container } = render(<PrimerTrack {...base} primers={[fwd]} charPx={7.2} />);
    expect(container.querySelector("[data-primer-hit]")).toBeNull();
  });

  it("back-compat: no onPrimerClick/onPrimerDoubleClick ⇒ decorative", () => {
    const { container } = render(<PrimerTrack {...base} primers={[fwd]} charPx={7.2} />);
    const svg = container.querySelector('[data-testid="sequence-view-primers"]');
    expect(svg.style.pointerEvents).toBe("none");
  });

  // Redesign 18.05.2026 (Игорь): «форвард и реверс по обе стороны от
  // цепи; сам праймер — стрелка, последовательность вписана».
  it("draws a directed arrow path (pentagon), not a plain rect bar", () => {
    render(<PrimerTrack {...base} primers={[fwd]} charPx={7.2} />);
    const arrow = screen
      .getByTestId("sequence-view-primer")
      .querySelector("[data-primer-arrow]");
    expect(arrow).toBeTruthy();
    expect(arrow.tagName.toLowerCase()).toBe("path");
    expect(arrow.getAttribute("data-primer-arrow")).toBe("forward");
    // pentagon = 5 points → path has 5 line/move commands + close
    expect(arrow.getAttribute("d")).toMatch(/^M0,0 L.* Z$/);
  });

  it("directionFilter renders only that strand's primers", () => {
    // RC("GGGCCCTTTGCAT") === "ATGCAAAGGGCCC" → reverse hit at 0..13.
    // forward-only: the reverse primer is filtered out
    const fwdOnly = render(
      <PrimerTrack {...base} primers={[fwd, rev]} charPx={7.2} directionFilter="forward" />,
    );
    let primersEls = fwdOnly.container.querySelectorAll(
      '[data-testid="sequence-view-primer"]',
    );
    expect(primersEls.length).toBe(1);
    expect(primersEls[0].getAttribute("data-primer-direction")).toBe("forward");
    cleanup();
    // reverse-only: arrow points left (data-primer-arrow=reverse)
    const revOnly = render(
      <PrimerTrack {...base} primers={[fwd, rev]} charPx={7.2} directionFilter="reverse" />,
    );
    primersEls = revOnly.container.querySelectorAll(
      '[data-testid="sequence-view-primer"]',
    );
    expect(primersEls.length).toBe(1);
    expect(primersEls[0].getAttribute("data-primer-direction")).toBe("reverse");
    expect(
      primersEls[0].querySelector("[data-primer-arrow]").getAttribute("data-primer-arrow"),
    ).toBe("reverse");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wrapped binding draws ONE 3′-head, not two arrows (Игорь 24.05.2026). When a
// binding is split across a line-wrap, clipHit yields two lineHits fragments;
// the arrowhead marks the 3′-END (forward: hit.end; reverse: hit.start) and
// must appear on exactly that fragment — the fragment at the wrap edge gets a
// blunt край so the wrapped primer reads as one continuous figure.
describe("PrimerTrack — wrapped binding: single 3′-head, blunt wrap edge", () => {
  // fwd binding "ATGCAAAGGGCCC" / its RC sits at [0,13). lineLen 8 → the
  // binding crosses the wrap at column 8: line 0 = [0,8), line 1 = [8,16).
  const REV = {
    name: "p_rev", bindingSequence: "GGGCCCTTTGCAT", direction: "reverse", tmBinding: 58,
  };
  const wrapLine = (lineStart, primer) => ({
    fullSeq: SEQ, lineStart, lineLen: 8, labelChars: 8, primerStyle: "filled", charPx: 7.2,
    primers: [primer],
  });
  const arrowD = () =>
    screen.getByTestId("sequence-view-primer").querySelector("[data-primer-arrow]").getAttribute("d");
  // pentagon (pointed) has 4 `L` commands; blunt rect has 3.
  const lSegs = (d) => (d.match(/L/g) || []).length;
  // the apex vertex is the only point at y = ARROW_H/2 = 7.
  const pointed = (d) => d.includes(",7 ");
  const HEAD = 6; // PrimerTrack arrowhead extent (px)

  it("forward: head only on the 3′ fragment (hit.end), blunt at the wrap edge", () => {
    // line 0 [0,8) — does NOT hold the 3′-end (13) → blunt край, no point
    const { unmount } = render(<PrimerTrack {...wrapLine(0, fwd)} />);
    let d = arrowD();
    expect(lSegs(d)).toBe(3);
    expect(pointed(d)).toBe(false);
    unmount();
    // line 1 [8,16) — holds the 3′-end → pointed head (right)
    render(<PrimerTrack {...wrapLine(8, fwd)} />);
    d = arrowD();
    expect(lSegs(d)).toBe(4);
    expect(pointed(d)).toBe(true);
  });

  it("reverse: head only on the 3′ fragment (hit.start), blunt at the wrap edge", () => {
    // line 0 [0,8) — holds the 3′-end (start=0) → pointed head (left)
    const { unmount } = render(<PrimerTrack {...wrapLine(0, REV)} />);
    let d = arrowD();
    expect(lSegs(d)).toBe(4);
    expect(pointed(d)).toBe(true);
    unmount();
    // line 1 [8,16) — does NOT hold the 3′-end → blunt край
    render(<PrimerTrack {...wrapLine(8, REV)} />);
    d = arrowD();
    expect(lSegs(d)).toBe(3);
    expect(pointed(d)).toBe(false);
  });

  it("unbroken binding (one fragment) → pentagon with head, unchanged", () => {
    render(<PrimerTrack {...base} primers={[fwd]} charPx={7.2} />);
    const d = arrowD();
    expect(lSegs(d)).toBe(4);
    expect(pointed(d)).toBe(true);
  });

  // hit-target must NOT extend by HEAD past a blunt wrap
  // edge (Игорь 24.05.2026) — the HEAD overhang belongs only to the side that
  // actually has the point.
  it("forward wrap-edge fragment: hit-target clipped at the blunt right край (no HEAD overhang)", () => {
    render(
      <PrimerTrack {...wrapLine(0, fwd)} onPrimerClick={() => {}} selectedPrimerKeys={["p_fwd|forward|0"]} />,
    );
    const g = screen.getByTestId("sequence-view-primer");
    const W = 8 * 7.2; // visible binding cols [0,8)
    const hit = g.querySelector("[data-primer-hit]");
    const hitRight = Number(hit.getAttribute("x")) + Number(hit.getAttribute("width"));
    expect(hitRight).toBeCloseTo(W + 2, 3); // +2 pad only, NOT +HEAD
  });

  it("forward 3′ fragment: hit-target keeps the HEAD overhang on the right (unchanged)", () => {
    render(
      <PrimerTrack {...wrapLine(8, fwd)} onPrimerClick={() => {}} selectedPrimerKeys={["p_fwd|forward|0"]} />,
    );
    const g = screen.getByTestId("sequence-view-primer");
    const W = 5 * 7.2; // visible binding cols [8,13)
    const hit = g.querySelector("[data-primer-hit]");
    const hitRight = Number(hit.getAttribute("x")) + Number(hit.getAttribute("width"));
    expect(hitRight).toBeCloseTo(W + HEAD + 2, 3);
  });

  it("reverse wrap-edge fragment: hit-target clipped at the blunt left край (no HEAD overhang)", () => {
    // line 1 [8,16) — does NOT hold the reverse 3′-end (start 0) → blunt left
    render(
      <PrimerTrack {...wrapLine(8, REV)} onPrimerClick={() => {}} selectedPrimerKeys={["p_rev|reverse|0"]} />,
    );
    const g = screen.getByTestId("sequence-view-primer");
    const hit = g.querySelector("[data-primer-hit]");
    expect(Number(hit.getAttribute("x"))).toBeCloseTo(-2, 3); // -headExt-2, headExt=0
  });

  it("reverse 3′ fragment: hit-target keeps the HEAD overhang on the left (unchanged)", () => {
    // line 0 [0,8) — holds the reverse 3′-end → head left
    render(
      <PrimerTrack {...wrapLine(0, REV)} onPrimerClick={() => {}} selectedPrimerKeys={["p_rev|reverse|0"]} />,
    );
    const g = screen.getByTestId("sequence-view-primer");
    const hit = g.querySelector("[data-primer-hit]");
    expect(Number(hit.getAttribute("x"))).toBeCloseTo(-HEAD - 2, 3);
  });
});
