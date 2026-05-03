/**
 * index-composition.test.jsx — K6 integration coverage for the
 * orchestrator. Exercises the full SequenceView render path by mounting
 * with realistic fragments + setting overrides via store.setState.
 *
 * Three cases match Sprint M-B.3 §6 K6:
 *  1) full render → root testid + at least one strand row + ruler + ann
 *  2) framesMode='single' → reverse AA rows are NOT rendered
 *  3) showBottomStrand=false → bottom strand absent on every line
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import SequenceView from "../index";
import { useStore } from "../../../store";

// Generate a 240 nt construct with one CDS spanning most of it so the
// "auto" strategy resolves to 'single' (covers > threshold).
const SEQ = (() => {
  const cds = "ATG" + "GCC".repeat(70) + "TAA"; // 213 nt
  return cds + "AAA".repeat(9); // total 240
})();

const FRAGMENT = {
  id: "frag-1",
  name: "demo",
  type: "CDS",
  sequence: SEQ,
  strand: 1,
  annotations: [
    {
      id: "r1",
      type: "CDS",
      name: "demoCDS",
      start: 0,
      end: 213,
      level: "region",
    },
  ],
};

function resetSequenceViewSettings() {
  // Provide a fresh sequenceView slice for the test; defaults applied.
  useStore.setState({
    sequenceView: {
      showBottomStrand: true,
      framesMode: "auto",
      autoThreshold: 0.8,
      primerStyle: "filled",
      reOrientation: "vertical",
    },
  });
}

beforeEach(() => {
  resetSequenceViewSettings();
});
afterEach(() => {
  cleanup();
});

describe("SequenceView — K6 composition", () => {
  it("1) full render mounts root + line rows + at least one ruler + annotation", () => {
    render(<SequenceView fragments={[FRAGMENT]} circular={false} />);
    const root = screen.getByTestId("sequence-view-root");
    expect(root).toBeTruthy();
    const lines = screen.getAllByTestId("sequence-view-line");
    expect(lines.length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("sequence-view-ruler").length).toBeGreaterThan(0);
    // demoCDS is wide → label fits inside or via leader on every visible line.
    expect(screen.getAllByTestId("sequence-view-annotation").length).toBeGreaterThan(0);
  });

  it("2) framesMode='single' suppresses reverse AA rows", () => {
    useStore.setState((s) => ({
      sequenceView: { ...s.sequenceView, framesMode: "single" },
    }));
    render(<SequenceView fragments={[FRAGMENT]} circular={false} />);
    const aaRows = screen.queryAllByTestId("sequence-view-aa-row");
    // 'single' strategy → only forward, only one row.
    aaRows.forEach((el) => {
      expect(el.dataset.aaStrand).toBe("1");
    });
  });

  it("3) showBottomStrand=false hides bottom strand on every line", () => {
    useStore.setState((s) => ({
      sequenceView: { ...s.sequenceView, showBottomStrand: false },
    }));
    render(<SequenceView fragments={[FRAGMENT]} circular={false} />);
    const root = screen.getByTestId("sequence-view-root");
    expect(root.dataset.showBottomStrand).toBe("false");
    // No StrandsTrack mounted with which="bottom".
    const bottomTracks = document.querySelectorAll('[data-which="bottom"]');
    expect(bottomTracks.length).toBe(0);
  });
});
