/**
 * annotation-stacking.test.js — K3 unit coverage for greedy-pack stacker.
 *
 * Six unit cases match Sprint M-B.3 §6 K3:
 *  1) empty input → empty rows + empty overflow
 *  2) non-overlapping regions land in row 0
 *  3) two overlapping regions split across rows 0 + 1
 *  4) cap at MAX_VISIBLE_ROWS — extras land in overflow
 *  5) sort stability — earlier-start wins, broader on ties
 *  6) line filter — regions outside [lineStart, lineEnd) are dropped
 */
import { describe, it, expect } from "vitest";
import { stackAnnotations, MAX_VISIBLE_ROWS } from "../lib/annotation-stacking";

describe("stackAnnotations — K3", () => {
  it("1) returns empty rows for empty/nullish input", () => {
    expect(stackAnnotations([], 0, 100)).toEqual({
      rows: [],
      overflow: [],
      visibleCount: 0,
      overflowCount: 0,
    });
    expect(stackAnnotations(null, 0, 100).rows).toEqual([]);
  });

  it("2) non-overlapping regions all collapse onto row 0", () => {
    const regions = [
      { start: 0, end: 30 },
      { start: 40, end: 60 },
      { start: 70, end: 100 },
    ];
    const out = stackAnnotations(regions, 0, 200);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toHaveLength(3);
    expect(out.rows[0].every((r) => r.row === 0)).toBe(true);
    expect(out.overflowCount).toBe(0);
  });

  it("3) overlapping regions split into successive rows", () => {
    const regions = [
      { start: 0, end: 50 },
      { start: 20, end: 70 },
      { start: 60, end: 90 },
    ];
    const out = stackAnnotations(regions, 0, 200);
    // First region row 0; second overlaps so row 1; third can re-use row 0.
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0].map((r) => [r.start, r.end])).toEqual([
      [0, 50],
      [60, 90],
    ]);
    expect(out.rows[1].map((r) => [r.start, r.end])).toEqual([[20, 70]]);
  });

  it("4) caps at MAX_VISIBLE_ROWS — overflow bin collects extras", () => {
    // 6 fully-overlapping regions: only first MAX_VISIBLE_ROWS land in rows.
    const regions = Array.from({ length: 6 }, (_, i) => ({
      start: 0 + i,
      end: 100,
      id: `r${i}`,
    }));
    const out = stackAnnotations(regions, 0, 200);
    expect(out.rows).toHaveLength(MAX_VISIBLE_ROWS);
    expect(out.overflowCount).toBe(6 - MAX_VISIBLE_ROWS);
    expect(out.overflow.map((r) => r.id)).toEqual(["r4", "r5"]);
  });

  it("5) post-reorder: longer feature on top, shorter at the bottom", () => {
    const regions = [
      { id: "narrow", start: 10, end: 20 },
      { id: "broad", start: 10, end: 80 },
    ];
    const out = stackAnnotations(regions, 0, 200);
    // Biolog feedback 03.05.2026 evening (DNA-first layout flip):
    // longest at the TOP of the stack (closer to the DNA strand ABOVE
    // the annotation track now that DNA renders before annotations),
    // shorter sub-features layered BELOW their broad parent. Greedy-pack
    // lands them on separate rows due to overlap; the post-pack row
    // reorder by max-length DESCENDING pushes broad (length 70) to the
    // top row and narrow (length 10) to the bottom row. Pre-03.05.2026
    // this was reversed when annotations sat ABOVE DNA — see git
    // history of annotation-stacking.js.
    expect(out.rows[0][0].id).toBe("broad");
    expect(out.rows[1][0].id).toBe("narrow");
    // `row` index on each region is re-stamped to the final position.
    expect(out.rows[0][0].row).toBe(0);
    expect(out.rows[1][0].row).toBe(1);
  });

  it("6) drops regions outside the [lineStart, lineEnd) window", () => {
    const regions = [
      { id: "before", start: 0, end: 5 },
      { id: "inside", start: 12, end: 20 },
      { id: "after", start: 40, end: 50 },
      { id: "spans-end", start: 25, end: 35 },
    ];
    const out = stackAnnotations(regions, 10, 30);
    const visibleIds = out.rows.flat().map((r) => r.id);
    expect(visibleIds).toContain("inside");
    expect(visibleIds).toContain("spans-end");
    expect(visibleIds).not.toContain("before");
    expect(visibleIds).not.toContain("after");
  });
});
