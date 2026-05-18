/**
 * primer-pointer-bail.test.jsx — Игорь 18.05.2026: «не работает клик
 * по праймеру».
 *
 * Root cause: useSelectionState.onRootPointerDown placed the caret and
 * called setPointerCapture() on the SequenceView root for a generic
 * press. The primer <g> only stops onClick, NOT onPointerDown — so a
 * press on a primer captured the pointer to the root and the ensuing
 * click was delivered to the root, never the primer. Fix mirrors the
 * existing RE-site / annotation bail: onRootPointerDown returns early
 * when the press originates inside a `sequence-view-primer`.
 *
 * The line element's getBoundingClientRect is stubbed non-zero so
 * posFromPointerEvent resolves a real position — without that, jsdom's
 * 0-rect makes the generic branch early-return anyway and the test
 * could not tell the bail apart from no-bail (true differential guard:
 * the "plain press" positive control proves the generic branch runs).
 */
import { useRef } from "react";
import {
  describe, it, expect, afterEach, vi,
} from "vitest";
import {
  render, screen, cleanup, fireEvent,
} from "@testing-library/react";
import { useSelectionState } from "../hooks/useSelectionState.js";

afterEach(cleanup);

function Harness({ onCaret }) {
  const containerRef = useRef(null);
  const { onRootPointerDown } = useSelectionState({
    fullSeq: "ATGC".repeat(20),
    seqLength: 80,
    charsPerLine: 80,
    charPx: 7,
    caretPos: null,
    caretAnchor: null,
    selectionMode: null,
    selectionStrand: 1,
    onCaretChange: onCaret,
    onSelectRange: () => {},
    containerRef,
  });
  return (
    <div ref={containerRef} data-testid="root" onPointerDown={onRootPointerDown}>
      <div data-testid="sequence-view-line" data-line-start="0">
        <svg data-testid="sequence-view-primers">
          <g data-testid="sequence-view-primer">
            <rect data-primer-hit="true" data-testid="hit" />
          </g>
        </svg>
        <span data-testid="plain">plain area (not a primer)</span>
      </div>
    </div>
  );
}

const RECT = {
  left: 0, top: 0, right: 560, bottom: 20, width: 560, height: 20,
};

function stubLineRect() {
  const line = screen.getByTestId("sequence-view-line");
  line.getBoundingClientRect = () => RECT;
}

describe("onRootPointerDown — primer bail", () => {
  it("positive control: a plain press DOES place caret + capture pointer", () => {
    const onCaret = vi.fn();
    render(<Harness onCaret={onCaret} />);
    stubLineRect();
    const root = screen.getByTestId("root");
    const cap = vi.fn();
    root.setPointerCapture = cap;
    fireEvent.pointerDown(screen.getByTestId("plain"), {
      button: 0, pointerId: 1, clientX: 30, clientY: 10,
    });
    expect(onCaret).toHaveBeenCalled();
    expect(cap).toHaveBeenCalled();
  });

  it("press inside a primer BAILS — no caret, no pointer-capture (click stays the primer's)", () => {
    const onCaret = vi.fn();
    render(<Harness onCaret={onCaret} />);
    stubLineRect();
    const root = screen.getByTestId("root");
    const cap = vi.fn();
    root.setPointerCapture = cap;
    fireEvent.pointerDown(screen.getByTestId("hit"), {
      button: 0, pointerId: 1, clientX: 30, clientY: 10,
    });
    expect(onCaret).not.toHaveBeenCalled();
    expect(cap).not.toHaveBeenCalled();
  });
});
