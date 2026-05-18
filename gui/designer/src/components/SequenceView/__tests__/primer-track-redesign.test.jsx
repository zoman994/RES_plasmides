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
const base = {
  fullSeq: SEQ, lineStart: 0, lineLen: SEQ.length, labelChars: 8, primerStyle: "filled",
};

describe("PrimerTrack redesign — letters / clickable / selected", () => {
  it("renders the binding bases as letters (grid-aligned)", () => {
    render(<PrimerTrack {...base} primers={[fwd]} charPx={7.2} />);
    const bases = screen.getByTestId("sequence-view-primer-bases");
    expect(bases.textContent).toBe("ATGCAAAGGGCCC"); // top-strand footprint
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
  });

  it("clickable when onPrimerClick is provided → fires (key, hit)", () => {
    const onClick = vi.fn();
    render(<PrimerTrack {...base} primers={[fwd]} charPx={7.2} onPrimerClick={onClick} />);
    const g = screen.getByTestId("sequence-view-primer");
    expect(g.style.cursor).toBe("pointer");
    fireEvent.click(g);
    expect(onClick).toHaveBeenCalledTimes(1);
    const [key, hit] = onClick.mock.calls[0];
    expect(typeof key).toBe("string");
    expect(hit.start).toBe(0);
    expect(hit.end).toBe(13);
    expect(key).toBe(primerHitKey(hit));
  });

  it("selected primer → data-selected=true + a selection ring", () => {
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
    expect(g.getAttribute("data-selected")).toBe("true");
    // Redesign 18.05.2026: body is now an arrow <path data-primer-arrow>;
    // selection adds a ring <rect>. Assert both (new shape contract).
    expect(g.querySelector("rect")).toBeTruthy(); // selection ring
    expect(g.querySelector("[data-primer-arrow]")).toBeTruthy();
  });

  it("selected primer shows a prominent halo + ring (явно выделяется)", () => {
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
    expect(g.querySelector("[data-primer-selection-halo]")).toBeTruthy();
    expect(g.querySelectorAll("rect").length).toBeGreaterThanOrEqual(2); // halo + ring
  });

  it("double-click fires onPrimerDoubleClick(hit) (consumer-gated)", () => {
    const onDbl = vi.fn();
    render(
      <PrimerTrack {...base} primers={[fwd]} charPx={7.2} onPrimerDoubleClick={onDbl} />,
    );
    const g = screen.getByTestId("sequence-view-primer");
    expect(g.style.cursor).toBe("pointer"); // interactable via dbl alone
    fireEvent.doubleClick(g);
    expect(onDbl).toHaveBeenCalledTimes(1);
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
    const rev = {
      name: "p_rev",
      bindingSequence: "GGGCCCTTTGCAT",
      direction: "reverse",
      tmBinding: 58,
    };
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
