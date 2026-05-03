/**
 * predicted-acceptance.test.jsx — Sprint M-X.1 K6 acceptance integration.
 *
 * One synthetic plasmid built to trigger ALL FOUR predictors in a
 * single render. Verifies the full K1..K5 stack end-to-end:
 *   - K1 predicted-flag retrofit (ORF wrapper marks `predicted=true`)
 *   - K2 four detectors return regions with signals
 *   - K3 SequenceView consumer merges confident + predicted via useMemo,
 *     reactive on settings.predictions
 *   - K4 AnnotationTrack renders predicted regions dashed, italic +
 *     tilde-prefix labels
 *   - K5 SettingsPopover stores wire — settings shape lives here
 *
 * Plus a regression guard for DEC-PRED-06: predicted ORFs are TRANSIENT
 * — they MUST appear in the rendered AnnotationTrack but MUST NOT have
 * been written into fragment.annotations (which feeds baseSnapshot).
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import SequenceView from "../index";
import { useStore } from "../../../store";
import { CAS9_SCAFFOLD } from "../../../predicted-detection";
import { isPredicted, PREDICTOR_SOURCES } from "../../../annotation-model";

// ─── Synthetic plasmid: all 4 detectors fire on this one fragment ──

// σ70 promoter — ideal -35 + 17 nt spacer + ideal -10
const SIGMA70_BLOCK =
  "TTGACA" + "GCATCGATCGATCGATC" + "TATAAT"; // 6 + 17 + 6 = 29 nt

// Stem-loop terminator — 8 nt GC-rich palindrome stem, 4 nt loop, 6 nt
// poly-T tail (rho-independent terminator pattern)
const TERMINATOR_BLOCK = "GCCCGCCG" + "TTAA" + "CGGCGGGC" + "TTTTTT"; // 28 nt

// 20 nt sgRNA spacer + 76 nt SpCas9 scaffold
const SPACER_20 = "ACGTACGTACGTACGTACGT";
const SGRNA_BLOCK = SPACER_20 + CAS9_SCAFFOLD; // 96 nt

// 120 aa ORF (≥100 aa minimum) — ATG + 120 codons + TAA = 366 nt
const ORF_BLOCK = "ATG" + "GCC".repeat(120) + "TAA";

// Confident annotation that the ORF detector should NOT clash with
// (placed in a separate region of the sequence)
const CONFIDENT_REGION_LEN = 60;
const CONFIDENT_REGION_SEQ = "GCAT".repeat(CONFIDENT_REGION_LEN / 4);

// Random-ish padding to space the four blocks apart
const PAD_NT = "GAGCAGTAGCAGTAGCAGTA"; // 20 nt
const SYNTH_SEQ = (
  CONFIDENT_REGION_SEQ +
  PAD_NT +
  SIGMA70_BLOCK +
  PAD_NT +
  TERMINATOR_BLOCK +
  PAD_NT +
  SGRNA_BLOCK +
  PAD_NT +
  ORF_BLOCK +
  PAD_NT
);

// Confident annotations: a manual demoCDS at the start (won't overlap
// the ORF in ORF_BLOCK), plus a dummy linker so buildFeatureMap takes
// the multi-region path and uses real coords.
const CONFIDENT_ANNOTATIONS = [
  {
    id: "conf-cds",
    type: "CDS",
    name: "demoCDS",
    start: 0,
    end: CONFIDENT_REGION_LEN,
    level: "region",
  },
  {
    id: "conf-linker",
    type: "misc_feature",
    name: "linker",
    start: CONFIDENT_REGION_LEN,
    end: CONFIDENT_REGION_LEN + PAD_NT.length,
    level: "region",
  },
];

const FRAGMENT = {
  id: "synth",
  name: "synthetic_predictors",
  type: "CDS",
  sequence: SYNTH_SEQ,
  strand: 1,
  annotations: CONFIDENT_ANNOTATIONS,
};

function setSettings(predictionsOverride = {}, framesMode = "single") {
  useStore.setState({
    sequenceView: {
      showBottomStrand: true,
      framesMode,
      autoThreshold: 0.8,
      primerStyle: "filled",
      reOrientation: "vertical",
      predictions: {
        cds: true,
        sgRNA: true,
        promoter: true,
        terminator: true,
        threshold: 0.5,
        ...predictionsOverride,
      },
    },
  });
}

beforeEach(() => setSettings());
afterEach(() => cleanup());

describe("Sprint M-X.1 K6 — synthetic plasmid acceptance", () => {
  it("renders all 4 detector hits as predicted regions on one fragment", () => {
    render(<SequenceView fragments={[FRAGMENT]} circular={false} />);
    const annotationGroups = screen.getAllByTestId("sequence-view-annotation");
    const sources = annotationGroups
      .map((g) => g.dataset.regionSource)
      .filter(Boolean);
    // Confident regions don't carry data-region-source, only predicted
    // do (K4 attribute). Expect at least one of each detector source
    // in the rendered set.
    expect(sources).toContain(PREDICTOR_SOURCES.ORF_SCAN);
    expect(sources).toContain(PREDICTOR_SOURCES.SIGMA70_PWM);
    expect(sources).toContain(PREDICTOR_SOURCES.STEM_LOOP);
    expect(sources).toContain(PREDICTOR_SOURCES.SGRNA_SCAFFOLD);
  });

  it("predicted regions render dashed; confident render solid (regression)", () => {
    render(<SequenceView fragments={[FRAGMENT]} circular={false} />);
    const annotationGroups = screen.getAllByTestId("sequence-view-annotation");
    const predicted = annotationGroups.filter(
      (g) => g.dataset.predicted === "true",
    );
    const confident = annotationGroups.filter(
      (g) => g.dataset.predicted !== "true",
    );
    expect(predicted.length).toBeGreaterThan(0);
    expect(confident.length).toBeGreaterThan(0);
    // Each predicted rect carries strokeDasharray; each confident does not.
    for (const g of predicted) {
      const rect = g.querySelector("rect");
      expect(rect.getAttribute("stroke-dasharray")).toBeTruthy();
    }
    for (const g of confident) {
      const rect = g.querySelector("rect");
      expect(rect.getAttribute("stroke-dasharray")).toBeNull();
    }
  });

  it("settings all-off → no predicted regions rendered", () => {
    setSettings({
      cds: false, promoter: false, terminator: false, sgRNA: false,
    });
    render(<SequenceView fragments={[FRAGMENT]} circular={false} />);
    const annotationGroups = screen.getAllByTestId("sequence-view-annotation");
    const predicted = annotationGroups.filter(
      (g) => g.dataset.predicted === "true",
    );
    expect(predicted.length).toBe(0);
    // Confident regions still rendered.
    const confident = annotationGroups.filter(
      (g) => g.dataset.predicted !== "true",
    );
    expect(confident.length).toBeGreaterThan(0);
  });

  it("threshold 0.95 → low-confidence predictions filtered out", () => {
    setSettings({ threshold: 0.95 });
    render(<SequenceView fragments={[FRAGMENT]} circular={false} />);
    const annotationGroups = screen.getAllByTestId("sequence-view-annotation");
    const predicted = annotationGroups.filter(
      (g) => g.dataset.predicted === "true",
    );
    // ORF (120 aa) confidence = 0.5 → below 0.95 → filtered.
    // Synthetic σ70/stem-loop scores typically below 0.95 → filtered.
    // Cas9 scaffold identity 1.0 may stay; allow zero-or-more here.
    const orfHits = predicted.filter(
      (g) => g.dataset.regionSource === PREDICTOR_SOURCES.ORF_SCAN,
    );
    expect(orfHits.length).toBe(0);
  });

  it("DEC-PRED-06: predicted ORFs are TRANSIENT — fragment.annotations untouched", () => {
    render(<SequenceView fragments={[FRAGMENT]} circular={false} />);
    // The render must not have mutated the source fragment's annotations
    // array. Only the original confident set should be present (no ORF
    // entries injected by the consumer).
    expect(FRAGMENT.annotations.length).toBe(CONFIDENT_ANNOTATIONS.length);
    for (const a of FRAGMENT.annotations) {
      expect(isPredicted(a)).toBe(false);
      expect(a.source).not.toBe(PREDICTOR_SOURCES.ORF_SCAN);
    }
  });

  it("predicted labels carry ~ prefix and italic style", () => {
    render(<SequenceView fragments={[FRAGMENT]} circular={false} />);
    const labels = document.querySelectorAll(
      '[data-testid="sequence-view-annotation-label"]',
    );
    const predictedLabels = Array.from(labels).filter(
      (el) => el.dataset.labelPredicted === "true",
    );
    expect(predictedLabels.length).toBeGreaterThan(0);
    for (const el of predictedLabels) {
      expect(el.textContent.startsWith("~")).toBe(true);
      const fontStyle =
        el.getAttribute("font-style") || el.style.fontStyle;
      expect(fontStyle).toBe("italic");
    }
  });
});
