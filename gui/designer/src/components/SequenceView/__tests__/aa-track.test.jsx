/**
 * aa-track.test.jsx — K4 integration coverage for AATrack.
 *
 * Four integration cases match Sprint M-B.3 §6 K4:
 *  1) strategy='single' with dominantCDS → exactly ONE forward row
 *  2) strategy='hybrid' → six rows (3 frames × 2 strands)
 *  3) framesMode='auto' hybrid: AA chars outside ORF have opacity 0.35
 *  4) framesMode='all' hybrid: all AA chars have opacity 1
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AATrack from "../tracks/AATrack";

afterEach(cleanup);

const PROTEIN_SEQ = (() => {
  // 10 codons: ATG GCC GCC GCC GCC GCC GCC GCC GCC TAA
  return "ATG" + "GCC".repeat(8) + "TAA";
})();

const dominant = {
  start: 0,
  end: PROTEIN_SEQ.length,
  strand: 1,
  frame: 0,
  aaLen: 9,
};
const orfRanges = [dominant];
// In 'single' strategy AATrack reads CDS from `regions` (per-CDS frame
// detection — fixes M-skipped on multi-CDS plasmids 02.05.2026). Stub a
// matching CDS region for the existing test plasmid.
const REGIONS = [
  { id: "demo-cds", type: "CDS", start: 0, end: PROTEIN_SEQ.length, strand: 1 },
];

describe("AATrack — K4", () => {
  it("1) strategy='single' renders ONE forward row with M as start codon", () => {
    render(
      <AATrack
        fullSeq={PROTEIN_SEQ}
        lineStart={0}
        lineLen={PROTEIN_SEQ.length}
        labelChars={8}
        strategy="single"
        framesMode="single"
        orfRanges={orfRanges}
        dominantCDS={dominant}
        regions={REGIONS}
      />,
    );
    const root = screen.getByTestId("sequence-view-aa");
    expect(root.dataset.rowCount).toBe("1");
    const rows = screen.getAllByTestId("sequence-view-aa-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].dataset.aaStrand).toBe("1");
    // First codon must be M (was sometimes missing pre-fix when dominantCDS
    // frame did not match the region's actual frame).
    const aaChars = screen.getAllByTestId("sequence-view-aa-char");
    expect(aaChars[0].dataset.aa).toBe("M");
  });

  it("2) strategy='hybrid' framesMode='all' renders six rows (3 frames × 2 strands)", () => {
    // Use framesMode='all' here — 'auto' now prunes rows with no ORF
    // / CDS signal (DEC-SQV-AA-AUTO-PRUNE 03.05.2026 evening: «когда
    // включена автодетекция КДС надо убирать рамки автоматически в
    // которых ничего нет»). The 6-row contract holds for 'all' which
    // explicitly asks to see every frame regardless of signal.
    render(
      <AATrack
        fullSeq={PROTEIN_SEQ}
        lineStart={0}
        lineLen={PROTEIN_SEQ.length}
        labelChars={8}
        strategy="hybrid"
        framesMode="all"
        orfRanges={orfRanges}
        dominantCDS={dominant}
      />,
    );
    expect(screen.getAllByTestId("sequence-view-aa-row")).toHaveLength(6);
  });

  it("3) framesMode='auto' hybrid: AA outside ORF is hidden (opacity 0)", () => {
    // Updated 03.05.2026 evening — biolog asked for clean rendering:
    // «авто по покрытию должно расставлять автоматические рамки
    // считывания но при этом СКРЫВАТЬ между ними остальное».
    // Out-of-ORF positions return opacity 0 (filler space, no AA char
    // emitted) instead of opacity 0.35 (faded ghost). The contract
    // becomes: in `auto`, every rendered AA char is at opacity 1.
    const padded = PROTEIN_SEQ + "A".repeat(60);
    render(
      <AATrack
        fullSeq={padded}
        lineStart={0}
        lineLen={padded.length}
        labelChars={8}
        strategy="hybrid"
        framesMode="auto"
        orfRanges={orfRanges}
        dominantCDS={dominant}
      />,
    );
    const aaChars = screen.getAllByTestId("sequence-view-aa-char");
    expect(aaChars.length).toBeGreaterThan(0);
    // All rendered AA chars must be at full opacity — faded ghosts
    // are no longer emitted in auto mode.
    const fadedChars = aaChars.filter((el) => el.dataset.aaOpacity === "0.35");
    expect(fadedChars.length).toBe(0);
    const fullChars = aaChars.filter((el) => el.dataset.aaOpacity === "1");
    expect(fullChars.length).toBe(aaChars.length);
  });

  it("regression 02.05.2026: 'single' renders M for EACH forward CDS even when frames differ", () => {
    // Plasmid mock: two CDS regions in DIFFERENT frames (the bug was that
    // only the dominantCDS frame got translated → second CDS lost its M).
    //   region A starts at index 0 (frame 0): ATG GCC GCC TAA → M A A *
    //   region B starts at index 13 (frame 13 % 3 = 1): NN ATG TTT TAA NN → M F *
    const seq = "ATGGCCGCCTAACC" + "ATGTTTTAANN"; // 14 + 11 = 25 nt
    const regions = [
      { id: "rA", type: "CDS", start: 0, end: 12, strand: 1 },
      { id: "rB", type: "CDS", start: 14, end: 23, strand: 1 },
    ];
    render(
      <AATrack
        fullSeq={seq}
        lineStart={0}
        lineLen={seq.length}
        labelChars={8}
        strategy="single"
        framesMode="single"
        orfRanges={[]}
        dominantCDS={{ start: 0, end: 12, strand: 1 }}
        regions={regions}
      />,
    );
    const aaChars = screen.getAllByTestId("sequence-view-aa-char");
    const ms = aaChars.filter((el) => el.dataset.aa === "M");
    // Exactly TWO Ms — one per CDS region.
    expect(ms).toHaveLength(2);
    // First M sits inside region A; second inside region B.
    expect(ms[0].dataset.aaRegion).toBe("rA");
    expect(ms[1].dataset.aaRegion).toBe("rB");
  });

  it("regression 02.05.2026: reverse-strand CDS shows M at the 3'-end of top strand", () => {
    // Top strand: ........... CAT TAA AAA <-- reverse-strand CDS reads 3'→5'
    // antisense:               GTA ATT TTT
    // Reading antisense 3'→5' (= top 5'→3' from end): ATG TTT TAA = M F *
    //   (top 0..7 = "CCCATTAA" — irrelevant prefix; CDS at top-strand
    //    indices 5..14 = "CATTTTTAA" reversed-complemented = "TTAAAAATG"
    //    reverse-read = "ATGAAATAA")
    // For simplicity build a clear case: top "AAACCCATG_TTAAAA" where
    // antisense codons starting from end are M F *.
    // top:        0123456789012345678901
    // top:        AAACCCATGCATTTTTAACCAA  ← length 22
    //                              ^^^ top positions 13-15 = TTA (= antisense AAT = N? no)
    // Let's just craft directly:
    //   want antisense read 3'→5' (i.e. complement of top 5'→3' reversed)
    //   ATG codon on antisense at top-strand positions [end-3, end-1]:
    //     top "CAT" at positions e-3, e-2, e-1 → complement "GTA" → reversed = "ATG"
    //   so the CDS region on top-strand span [start, end) where end-3..end = "CAT"
    //   For a 9-nt CDS: positions [e-9, e). Top "??? ??? CAT" reading from end
    //   gives "ATG NNN NNN" antisense, which in 5'→3' = M ? ?.
    // Concrete: CDS at top [10, 19), end=19, top[10..19] = "TTACATCAT" (9 chars).
    //   antisense 5'→3' (from top end inward): complement(top[18])+complement(top[17])+...
    //   complement(T)=A, A→T, C→G, A→T, T→A, A→T, T→A, A→T, C→G, A→T, T→A → ATG ATG TAA
    //   Wait let me just engineer the right bytes.
    //   We want antisense reading: ATG XXX TAA  (M ? *)
    //   Top reading ant antisense reversed: M-codon at top[e-3..e] should make
    //     top base at e-1 = complement(A) = T
    //     top base at e-2 = complement(T) = A
    //     top base at e-3 = complement(G) = C
    //   So top[e-3..e] = "CAT".
    //   For *-codon (TAA on antisense) at top[start..start+3]:
    //     top[s] = complement(A) = T
    //     top[s+1] = complement(A) = T
    //     top[s+2] = complement(T) = A
    //   So top[s..s+3] = "TTA".
    //   Middle codon any (use ATA → antisense TAT = Y for clarity).
    //     top[s+3..s+6] = "TAT" → antisense "ATA" → I (Ile)
    //   So top sequence for CDS = "TTA" + "TAT" + "CAT" = "TTATATCAT" (9 nt).
    //   Antisense 5'→3' = "ATG ATA TAA" = M I *
    const seq = "AAANN" + "TTATATCAT" + "GGGCC"; // padding + CDS at [5, 14)
    const regions = [{ id: "ampr-rev", type: "CDS", start: 5, end: 14, strand: -1 }];
    render(
      <AATrack
        fullSeq={seq}
        lineStart={0}
        lineLen={seq.length}
        labelChars={8}
        strategy="single"
        framesMode="single"
        orfRanges={[]}
        dominantCDS={null}
        regions={regions}
      />,
    );
    const chars = screen.getAllByTestId("sequence-view-aa-char");
    // DOM order is left-to-right on the TOP strand. A reverse-strand CDS
    // is therefore displayed * I M (stop at low coords, M at high coords),
    // i.e. mirrored versus the antisense reading direction. That mirror
    // is the whole point — biolog wants to see M sitting on the right
    // edge of the AmpR bar where the actual start codon lives in
    // top-strand space.
    expect(chars.map((el) => el.dataset.aa).join("")).toBe("*IM");
    // M lands on the top-strand position end-2 = 12 (middle base of "CAT").
    const mChar = chars.find((el) => el.dataset.aa === "M");
    expect(mChar.dataset.aaPos).toBe("12");
    expect(mChar.dataset.aaStrand).toBe("-1");
    expect(mChar.dataset.aaRegion).toBe("ampr-rev");
  });

  it("4) framesMode='all' hybrid: every rendered AA char has opacity 1", () => {
    render(
      <AATrack
        fullSeq={PROTEIN_SEQ}
        lineStart={0}
        lineLen={PROTEIN_SEQ.length}
        labelChars={8}
        strategy="hybrid"
        framesMode="all"
        orfRanges={orfRanges}
        dominantCDS={dominant}
      />,
    );
    const aaChars = screen.getAllByTestId("sequence-view-aa-char");
    expect(aaChars.length).toBeGreaterThan(0);
    aaChars.forEach((el) => {
      expect(el.dataset.aaOpacity).toBe("1");
    });
  });
});
