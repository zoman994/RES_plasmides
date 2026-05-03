/**
 * scroll-to-position.test.jsx — imperative scroll API on SequenceView.
 *
 * Sprint Importer-merge-tabs K1. Verifies the new
 *   ref.current.scrollToPosition(absoluteSeqPos)
 * imperative handle exposed through React.forwardRef. The handle is
 * how LinearFeatureBar (in the merged tab) tells the viewer «jump to
 * this feature's start». Pure DOM-side — no state side-effect.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createRef } from "react";
import { render, cleanup } from "@testing-library/react";
import SequenceView from "../index";

afterEach(() => cleanup());

const FRAGMENT = {
  id: "f-scroll",
  name: "scroll-target",
  sequence: "ATGC".repeat(500), // 2000 nt → many lines
  annotations: [],
  type: "misc_feature",
  strand: 1,
};

describe("SequenceView.scrollToPosition — Importer-merge-tabs K1", () => {
  it("forwardRef exposes a scrollToPosition function", () => {
    const ref = createRef();
    render(<SequenceView ref={ref} fragments={[FRAGMENT]} circular={false} />);
    expect(ref.current).toBeTruthy();
    expect(typeof ref.current.scrollToPosition).toBe("function");
  });

  it("does not throw when called with an arbitrary position", () => {
    const ref = createRef();
    render(<SequenceView ref={ref} fragments={[FRAGMENT]} circular={false} />);
    expect(() => ref.current.scrollToPosition(0)).not.toThrow();
    expect(() => ref.current.scrollToPosition(1500)).not.toThrow();
    // Out-of-range still safe — no-op.
    expect(() => ref.current.scrollToPosition(99999)).not.toThrow();
    expect(() => ref.current.scrollToPosition(-1)).not.toThrow();
  });

  it("flags the target line via .sequence-view-line-flash class", () => {
    const ref = createRef();
    const { container } = render(
      <SequenceView ref={ref} fragments={[FRAGMENT]} circular={false} />,
    );
    const lines = container.querySelectorAll(
      '[data-testid="sequence-view-line"]',
    );
    expect(lines.length).toBeGreaterThan(2);
    const targetLine = lines[2];
    const targetStart = parseInt(targetLine.dataset.lineStart, 10);
    ref.current.scrollToPosition(targetStart + 5);
    // Briefly highlights the target line so the biolog notices the jump.
    expect(targetLine.classList.contains("sequence-view-line-flash")).toBe(true);
  });

  it("picks the LATEST line whose start ≤ position (containment rule)", () => {
    const ref = createRef();
    const { container } = render(
      <SequenceView ref={ref} fragments={[FRAGMENT]} circular={false} />,
    );
    const lines = Array.from(
      container.querySelectorAll('[data-testid="sequence-view-line"]'),
    );
    // Pick a position inside line index 4 (between line[4].start and line[5].start).
    if (lines.length < 6) return; // skip if narrow render mode
    const inLine4 = parseInt(lines[4].dataset.lineStart, 10) + 1;
    ref.current.scrollToPosition(inLine4);
    expect(lines[4].classList.contains("sequence-view-line-flash")).toBe(true);
    expect(lines[5].classList.contains("sequence-view-line-flash")).toBe(false);
  });
});
