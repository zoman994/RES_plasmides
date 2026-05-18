/**
 * primer-restriction.test.jsx — K5 integration coverage for PrimerTrack
 * + RestrictionTrack.
 *
 * Four cases match Sprint M-B.3 §6 K5:
 *  1) PrimerTrack hides itself when primers=[]
 *  2) PrimerTrack 'filled' renders forward primer as a solid blue arrow
 *  3) PrimerTrack 'outline' renders outline-only and includes binding seq
 *  (Redesign 18.05.2026 — primer body is a directed arrow <path
 *   data-primer-arrow>, not a <rect> bar; sequence inscribed inside.)
 *  4) RestrictionTrack 'vertical' rotates label 90deg; 'horizontal' does not
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PrimerTrack from "../tracks/PrimerTrack";
import RestrictionTrack from "../tracks/RestrictionTrack";

afterEach(cleanup);

const SEQ = "ATGCAAAGGGCCCTAACGTTAAA" + "G".repeat(100);
//          0123456789...

const fwdPrimer = {
  name: "fwd_test",
  bindingSequence: "ATGCAAAGGGCCC",
  direction: "forward",
  tmBinding: 60,
};

describe("PrimerTrack — K5", () => {
  it("1) returns null when primers=[]", () => {
    const { container } = render(
      <PrimerTrack
        primers={[]}
        fullSeq={SEQ}
        lineStart={0}
        lineLen={SEQ.length}
        charPx={7.2}
        labelChars={8}
        primerStyle="filled"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("2) 'filled' renders forward primer as a solid blue arrow", () => {
    render(
      <PrimerTrack
        primers={[fwdPrimer]}
        fullSeq={SEQ}
        lineStart={0}
        lineLen={SEQ.length}
        charPx={7.2}
        labelChars={8}
        primerStyle="filled"
      />,
    );
    const root = screen.getByTestId("sequence-view-primers");
    expect(root.dataset.primerStyle).toBe("filled");
    const prim = screen.getByTestId("sequence-view-primer");
    expect(prim.dataset.primerDirection).toBe("forward");
    const arrow = prim.querySelector("[data-primer-arrow]");
    expect(arrow.tagName.toLowerCase()).toBe("path");
    expect(arrow.getAttribute("data-primer-arrow")).toBe("forward");
    expect(arrow.getAttribute("fill")).toBe("#3b82f6");
  });

  it("3) 'outline' renders outline-only arrow and includes binding seq", () => {
    render(
      <PrimerTrack
        primers={[fwdPrimer]}
        fullSeq={SEQ}
        lineStart={0}
        lineLen={SEQ.length}
        charPx={7.2}
        labelChars={8}
        primerStyle="outline"
      />,
    );
    const root = screen.getByTestId("sequence-view-primers");
    expect(root.dataset.primerStyle).toBe("outline");
    const arrow = root.querySelector("[data-primer-arrow]");
    expect(arrow.getAttribute("fill")).toBe("none");
    expect(arrow.getAttribute("stroke")).toBe("#3b82f6");
    expect(root.textContent).toContain("ATGCAAAGGGCCC");
  });
});

describe("RestrictionTrack — K5", () => {
  const sites = [{ enzyme: "EcoRI", position: 5 }];

  it("4) 'vertical' rotates label 90deg; 'horizontal' has no rotate", () => {
    const { rerender } = render(
      <RestrictionTrack
        sites={sites}
        lineStart={0}
        lineLen={50}
        charPx={7.2}
        labelChars={8}
        reOrientation="vertical"
      />,
    );
    let root = screen.getByTestId("sequence-view-restriction");
    expect(root.dataset.orientation).toBe("vertical");
    let text = root.querySelector("text");
    expect(text.getAttribute("transform") || "").toContain("rotate(-90");

    rerender(
      <RestrictionTrack
        sites={sites}
        lineStart={0}
        lineLen={50}
        charPx={7.2}
        labelChars={8}
        reOrientation="horizontal"
      />,
    );
    root = screen.getByTestId("sequence-view-restriction");
    expect(root.dataset.orientation).toBe("horizontal");
    text = root.querySelector("text");
    expect(text.getAttribute("transform") || "").not.toContain("rotate");
  });

  it("returns null with empty sites", () => {
    const { container } = render(
      <RestrictionTrack
        sites={[]}
        lineStart={0}
        lineLen={50}
        charPx={7.2}
        labelChars={8}
        reOrientation="vertical"
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
