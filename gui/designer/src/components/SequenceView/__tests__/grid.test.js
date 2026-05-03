/**
 * grid.test.js — K1 unit coverage for lib/grid.js.
 *
 * Five cases match Sprint M-B.3 §6 K1:
 *  1) measureCharPx — returns width / 100 of probe rect
 *  2) clampCharsPerLine — snaps DOWN to multiples of 10 (default snap)
 *  3) clampCharsPerLine — clamps to [30, 200] floor / ceiling
 *  4) linesFromSeq — chunks a 100 nt sequence into 10-char rows
 *  5) linesFromSeq — empty / nullish input → []
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  measureCharPx,
  clampCharsPerLine,
  linesFromSeq,
} from "../lib/grid.js";

describe("lib/grid.js — measureCharPx", () => {
  let host;

  beforeEach(() => {
    host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", {
      configurable: true,
      get: () => 600,
    });
    document.body.appendChild(host);
  });

  afterEach(() => {
    document.body.removeChild(host);
  });

  it("returns width / 100 of the probe span when geometry is available", () => {
    // happy-dom doesn't run a layout engine, so `getBoundingClientRect()`
    // on the probe span returns 0×0 by default. Stub the proto so this
    // test exercises the divide-by-N branch deterministically.
    const protoSpy = (Element.prototype.getBoundingClientRect = function () {
      return {
        width: 720,
        height: 14,
        top: 0,
        left: 0,
        right: 720,
        bottom: 14,
        x: 0,
        y: 0,
        toJSON() { return {}; },
      };
    });
    const chW = measureCharPx(host);
    // 720 px / 100 chars = 7.2 px per char.
    expect(chW).toBeCloseTo(7.2, 5);
    // Probe must be removed after measurement so it never leaks into layout.
    expect(host.querySelector("span")).toBeNull();
    void protoSpy;
  });

  it("returns 0 for a null host (safe fallback for callers)", () => {
    expect(measureCharPx(null)).toBe(0);
  });

  it("returns 0 for a zero-width host (avoids divide-by-zero)", () => {
    Object.defineProperty(host, "clientWidth", {
      configurable: true,
      get: () => 0,
    });
    expect(measureCharPx(host)).toBe(0);
  });
});

describe("lib/grid.js — clampCharsPerLine", () => {
  it("snaps DOWN to multiples of 10 by default", () => {
    expect(clampCharsPerLine(87)).toBe(80);
    expect(clampCharsPerLine(80)).toBe(80);
    expect(clampCharsPerLine(79)).toBe(70);
    expect(clampCharsPerLine(199)).toBe(190);
  });

  it("clamps to [30, 200] (floor/ceiling) and survives non-finite input", () => {
    expect(clampCharsPerLine(0)).toBe(30);
    expect(clampCharsPerLine(-50)).toBe(30);
    expect(clampCharsPerLine(25)).toBe(30);
    expect(clampCharsPerLine(500)).toBe(200);
    expect(clampCharsPerLine(NaN)).toBe(30);
    expect(clampCharsPerLine(Infinity)).toBe(200);
  });

  it("respects custom snap / minChars / maxChars", () => {
    expect(clampCharsPerLine(63, { snap: 5 })).toBe(60);
    expect(clampCharsPerLine(7, { minChars: 5 })).toBe(5);
    expect(clampCharsPerLine(123, { maxChars: 100 })).toBe(100);
  });
});

describe("lib/grid.js — linesFromSeq", () => {
  it("chunks a 100 nt sequence into 10-char rows", () => {
    const seq = "ATGC".repeat(25); // 100 nt
    const rows = linesFromSeq(seq, 10);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toEqual({ start: 0, seq: seq.slice(0, 10) });
    expect(rows[9]).toEqual({ start: 90, seq: seq.slice(90, 100) });
    // Sequence reconstructs exactly from row chunks.
    expect(rows.map((r) => r.seq).join("")).toBe(seq);
  });

  it("preserves a trailing partial line", () => {
    const seq = "A".repeat(15);
    const rows = linesFromSeq(seq, 10);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({ start: 10, seq: "AAAAA" });
  });

  it("returns [] for empty / nullish input", () => {
    expect(linesFromSeq("", 10)).toEqual([]);
    expect(linesFromSeq(null, 10)).toEqual([]);
    expect(linesFromSeq(undefined, 10)).toEqual([]);
  });

  it("floors fractional / sub-1 charsPerLine to 1 row per char", () => {
    expect(linesFromSeq("ATG", 0.5)).toEqual([
      { start: 0, seq: "A" },
      { start: 1, seq: "T" },
      { start: 2, seq: "G" },
    ]);
  });
});
