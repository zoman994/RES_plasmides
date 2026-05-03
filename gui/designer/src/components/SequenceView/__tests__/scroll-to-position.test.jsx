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

  it("regression — no .sequence-view-line-flash class is added (gold flash removed)", () => {
    // 04.05.2026 evening — биолог: «убери золотистую рамку на ОРФ при
    // жимканье». The caret + smooth scroll already signal the jump;
    // the flash class was double-redundant feedback. Test stays as a
    // regression guard so a future refactor that resurrects the
    // flash fails fast.
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
    expect(targetLine.classList.contains("sequence-view-line-flash")).toBe(false);
  });
});
