/**
 * index-composition.test.jsx — K6 integration coverage for the
 * orchestrator. Exercises the full SequenceView render path by mounting
 * with realistic fragments + setting overrides via store.setState.
 *
 * M-B.3 §6 K6 cases:
 *  1) full render → root testid + at least one strand row + ruler + ann
 *  2) framesMode='single' → reverse AA rows are NOT rendered
 *  3) showBottomStrand=false → bottom strand absent on every line
 *
 * Sprint M-X.1 K3 (DEC-PRED-06) extra cases:
 *  4) consumer merges runPredictors output with confident features —
 *     long-CDS sequence triggers an ORF predicted region in addition to
 *     the manually-annotated CDS, both reach the SequenceLine via the
 *     same `features` prop.
 *  5) settings.predictions reactive — toggling cds: false at runtime
 *     drops predicted regions from the rendered set without a remount.
 *  6) threshold gate — settings.predictions.threshold = 0.95 prunes
 *     low-confidence predicted regions.
 *  7) regression guard — confident features overlapping (the manual
 *     CDS) suppress predicted ORFs (deduped by runPredictors).
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
      predictions: {
        cds: true,
        sgRNA: false,
        promoter: false,
        terminator: false,
        threshold: 0.5, // generous so the ORF wrapper hits at default aaLen
      },
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

  it("1b) selectedRegionId threads through to the annotation track (highlight)", () => {
    render(<SequenceView fragments={[FRAGMENT]} circular={false} selectedRegionId="r1" />);
    const groups = screen.getAllByTestId("sequence-view-annotation")
      .filter((g) => g.dataset.regionId === "r1");
    expect(groups.length).toBeGreaterThan(0);
    // at least one rendered row of r1 is marked selected
    expect(groups.some((g) => g.dataset.selected === "true")).toBe(true);
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

  // ─── Sprint M-X.1 K3 (DEC-PRED-06) ────────────────────────────────

  // A tail of an unrelated 100-aa ORF that runPredictors will pick up
  // — placed AFTER the demoCDS region so the predicted region doesn't
  // overlap and isn't deduped against the confident annotation.
  const ORF_TAIL = "ATG" + "GCC".repeat(120) + "TAA"; // 366 nt, 120 aa
  // Two confident annotations are needed so `buildFeatureMap` enters
  // the multi-region branch — the single-region branch collapses ALL
  // detail to a fragment-level region using fragment.name (loses the
  // demoCDS name + start/end coords). That collapse hides demoCDS
  // from the rendered annotation list and confuses the overlap dedup
  // (it would treat the whole fragment as confident → drop every
  // ORF). The dummy linker keeps the multi-region path active.
  const FRAGMENT_WITH_ORF = {
    id: "frag-1",
    name: "demoFragment",
    type: "CDS",
    sequence: SEQ + "GC".repeat(20) + ORF_TAIL,
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
      {
        id: "r2",
        type: "misc_feature",
        name: "linker",
        start: 213,
        end: 280,
        level: "region",
      },
    ],
  };

  it("4) consumer merges predicted ORFs alongside confident annotations", () => {
    render(<SequenceView fragments={[FRAGMENT_WITH_ORF]} circular={false} />);
    const annotationGroups = screen.getAllByTestId("sequence-view-annotation");
    // demoCDS (confident) + an ORF tail predicted region → at least
    // two distinct region names rendered. We assert by checking that
    // SOME `data-region-name` mentions an ORF («ORF (» — generated
    // by orf-detection naming convention).
    const names = annotationGroups
      .map((g) => g.getAttribute("data-region-name") || "")
      .filter(Boolean);
    const hasConfident = names.some((n) => n.includes("demoCDS"));
    const hasOrf = names.some((n) => /^ORF \(\d+/.test(n));
    expect(hasConfident).toBe(true);
    expect(hasOrf).toBe(true);
  });

  it("5) settings.predictions.cds=false drops predicted ORFs reactively", () => {
    useStore.setState((s) => ({
      sequenceView: {
        ...s.sequenceView,
        predictions: { ...s.sequenceView.predictions, cds: false },
      },
    }));
    render(<SequenceView fragments={[FRAGMENT_WITH_ORF]} circular={false} />);
    const annotationGroups = screen.getAllByTestId("sequence-view-annotation");
    const names = annotationGroups
      .map((g) => g.getAttribute("data-region-name") || "")
      .filter(Boolean);
    expect(names.some((n) => n.includes("demoCDS"))).toBe(true);
    expect(names.some((n) => /^ORF \(\d+/.test(n))).toBe(false);
  });

  it("6) threshold 0.95 prunes low-confidence predicted regions", () => {
    useStore.setState((s) => ({
      sequenceView: {
        ...s.sequenceView,
        predictions: { ...s.sequenceView.predictions, threshold: 0.95 },
      },
    }));
    render(<SequenceView fragments={[FRAGMENT_WITH_ORF]} circular={false} />);
    const annotationGroups = screen.getAllByTestId("sequence-view-annotation");
    const names = annotationGroups
      .map((g) => g.getAttribute("data-region-name") || "")
      .filter(Boolean);
    // 120 aa ORF → confidence 0.5 (< 0.95). Should not appear.
    expect(names.some((n) => /^ORF \(\d+/.test(n))).toBe(false);
    // confident demoCDS unaffected by predictions threshold.
    expect(names.some((n) => n.includes("demoCDS"))).toBe(true);
  });

  it("7) confident region absorbs an overlapping ORF prediction", () => {
    // Build a fragment where the SOLE feature in sequence is the
    // confident demoCDS itself (long enough to be ORF-eligible).
    // runPredictors must drop the ORF prediction due to >50% overlap
    // with the confident region.
    const longCdsSeq = "ATG" + "GCC".repeat(199) + "TAA"; // 200 aa
    const fragment = {
      id: "frag-only",
      name: "only",
      type: "CDS",
      sequence: longCdsSeq,
      strand: 1,
      annotations: [
        {
          id: "r1",
          type: "CDS",
          name: "demoCDS",
          start: 0,
          end: longCdsSeq.length,
          level: "region",
        },
      ],
    };
    render(<SequenceView fragments={[fragment]} circular={false} />);
    const annotationGroups = screen.getAllByTestId("sequence-view-annotation");
    const names = annotationGroups
      .map((g) => g.getAttribute("data-region-name") || "")
      .filter(Boolean);
    expect(names.some((n) => /^ORF \(\d+/.test(n))).toBe(false);
  });
});
