/**
 * frames-mode.test.js — K4 unit coverage for resolveFramesMode +
 * orf-ranges + codon-walker + aa-opacity.
 *
 * Six unit cases match Sprint M-B.3 §6 K4:
 *  1) resolveFramesMode 'single' → strategy 'single' regardless of coverage
 *  2) resolveFramesMode 'all' → strategy 'hybrid' regardless of coverage
 *  3) resolveFramesMode 'auto' coverage > threshold → 'single'
 *  4) resolveFramesMode 'auto' coverage <= threshold → 'hybrid'
 *  5) detectORFRanges finds ATG..STOP on forward + reverse, drops short
 *  6) computeAAOpacity returns 1 inside ORF / 0.35 outside in 'auto' hybrid
 */
import { describe, it, expect } from "vitest";
import { resolveFramesMode } from "../lib/frames-mode";
import { detectORFRanges, dominantCoverage } from "../lib/orf-ranges";
import { walkCodons } from "../lib/codon-walker";
import { computeAAOpacity } from "../lib/aa-opacity";

const longSeq = (() => {
  // Build a sequence with a 90 nt CDS (M..stop) followed by junk to hit
  // various coverage values.
  const cds = "ATG" + "GCC".repeat(28) + "TAA"; // 1 (M) + 28 (Ala) + 1 (stop) = 30 codons
  const tail = "C".repeat(60);
  return cds + tail;
})();

describe("resolveFramesMode — K4", () => {
  it("1) framesMode='single' returns strategy='single'", () => {
    const out = resolveFramesMode("single", 0.8, [], 1000, []);
    expect(out.strategy).toBe("single");
  });

  it("2) framesMode='all' returns strategy='hybrid'", () => {
    const out = resolveFramesMode("all", 0.8, [], 1000, []);
    expect(out.strategy).toBe("hybrid");
  });

  it("3) framesMode='auto' with coverage > threshold → 'single'", () => {
    const regions = [{ type: "CDS", start: 0, end: 800 }];
    const out = resolveFramesMode("auto", 0.5, regions, 1000, []);
    expect(out.strategy).toBe("single");
    expect(out.coverage).toBeCloseTo(0.8, 5);
  });

  it("4) framesMode='auto' with coverage <= threshold → 'hybrid'", () => {
    const regions = [{ type: "CDS", start: 0, end: 200 }];
    const out = resolveFramesMode("auto", 0.5, regions, 1000, []);
    expect(out.strategy).toBe("hybrid");
  });
});

describe("detectORFRanges — K4", () => {
  it("5) finds ≥ minAA forward ORF and reports forward-strand coverage", () => {
    const orfs = detectORFRanges(longSeq, 20);
    // At least one forward ORF starting at index 0.
    const forward = orfs.filter((o) => o.strand === 1);
    expect(forward.length).toBeGreaterThan(0);
    expect(forward[0].start).toBe(0);
    expect(forward[0].aaLen).toBeGreaterThanOrEqual(20);
    const cov = dominantCoverage(orfs, longSeq.length);
    expect(cov).toBeGreaterThan(0);
  });

  it("drops ORFs shorter than minAA", () => {
    const tinySeq = "ATGTAA"; // 1 aa M then stop → aaLen=1
    expect(detectORFRanges(tinySeq, 20)).toEqual([]);
  });
});

describe("walkCodons — K4", () => {
  it("translates an in-frame ATG..stop on forward strand", () => {
    const seq = "ATGAAATAA";
    const codons = walkCodons(seq, 0, 1);
    expect(codons.map((c) => c.aa)).toEqual(["M", "K", "*"]);
    expect(codons[0].isStart).toBe(true);
    expect(codons[2].isStop).toBe(true);
    // Middle base positions: codon 0 → 1, codon 1 → 4, codon 2 → 7.
    expect(codons.map((c) => c.position)).toEqual([1, 4, 7]);
  });

  it("walks reverse strand and reports top-strand middle positions", () => {
    // top:    AAA TAA TAA  (will translate antisense)
    const seq = "TTATTATTT"; // reverse-complement is AAATAATAA
    const codons = walkCodons(seq, 0, -1);
    // First codon read 3'→5' on antisense corresponds to last 3 nt of top.
    expect(codons[0].codon).toBe("AAA"); // complement of TTT, reversed
    // All positions must lie within the sequence bounds.
    codons.forEach((c) => {
      expect(c.position).toBeGreaterThanOrEqual(0);
      expect(c.position).toBeLessThan(seq.length);
    });
  });
});

describe("computeAAOpacity — K4", () => {
  it("6) returns 1 inside ORF and 0 outside in auto hybrid", () => {
    // Updated 03.05.2026 evening — биолог: «авто по покрытию должно
    // расставлять автоматические рамки считывания но при этом СКРЫВАТЬ
    // между ними остальное, призрачные не должны отражаться». Out-of-
    // ORF + out-of-CDS positions in auto mode now return 0 (hidden)
    // instead of 0.35 (faded). `framesMode='all'` still renders every
    // position at opacity 1 for users who want exhaustive frame display.
    const orfRanges = [{ start: 0, end: 90, strand: 1, frame: 0, aaLen: 30 }];
    const inside = computeAAOpacity({
      position: 30,
      frame: 0,
      strand: 1,
      strategy: "hybrid",
      framesMode: "auto",
      orfRanges,
      dominantCDS: orfRanges[0],
    });
    expect(inside).toBe(1);
    const outside = computeAAOpacity({
      position: 200,
      frame: 0,
      strand: 1,
      strategy: "hybrid",
      framesMode: "auto",
      orfRanges,
      dominantCDS: orfRanges[0],
    });
    expect(outside).toBe(0);
  });

  it("returns 1 everywhere when framesMode='all'", () => {
    expect(
      computeAAOpacity({
        position: 999,
        frame: 1,
        strand: -1,
        strategy: "hybrid",
        framesMode: "all",
        orfRanges: [],
        dominantCDS: null,
      }),
    ).toBe(1);
  });

  it("strategy='single' gates on dominantCDS span", () => {
    const dom = { start: 10, end: 90, strand: 1, frame: 1 };
    expect(
      computeAAOpacity({
        position: 50,
        frame: 1,
        strand: 1,
        strategy: "single",
        framesMode: "single",
        orfRanges: [],
        dominantCDS: dom,
      }),
    ).toBe(1);
    expect(
      computeAAOpacity({
        position: 5,
        frame: 1,
        strand: 1,
        strategy: "single",
        framesMode: "single",
        orfRanges: [],
        dominantCDS: dom,
      }),
    ).toBe(0);
  });
});
