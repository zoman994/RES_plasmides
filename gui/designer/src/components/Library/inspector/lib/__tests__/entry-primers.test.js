/**
 * entry-primers.test.js — Игорь 18.05.2026: «должно ещё в библиотеке
 * работать, в общем на всех сиквенсвиверах». Pure layer behind
 * useEntryPrimers — pool round-trip shape + entry-scoped selection.
 */
import { describe, it, expect } from "vitest";
import {
  buildEntryPrimerPayload,
  selectEntryPrimers,
} from "../entry-primers";

describe("buildEntryPrimerPayload", () => {
  it("shapes a pool-add payload scoped to the entry via origin", () => {
    const out = buildEntryPrimerPayload({
      id: "p1",
      name: "  myP  ",
      sequence: "atgc aaa\nggg",
      direction: "forward",
      entryId: "ENTRY-7",
      projectId: "proj-1",
    });
    expect(out).toEqual({
      primer: {
        id: "p1",
        name: "myP",
        sequence: "ATGCAAAGGG",
        bindingSequence: "ATGCAAAGGG", // V173 — no tail → binding = full seq
        tail: "",
        direction: "forward",
        length: 10,
      },
      projectId: "proj-1",
      status: "designed",
      origin: { kind: "library-selection", entryId: "ENTRY-7" },
    });
  });

  it("normalises direction (anything !== reverse → forward) and defaults projectId to null", () => {
    expect(buildEntryPrimerPayload({
      id: "p2", name: "x", sequence: "ACGTACGTAC", direction: "reverse", entryId: "E",
    }).primer.direction).toBe("reverse");
    expect(buildEntryPrimerPayload({
      id: "p3", name: "x", sequence: "ACGTACGTAC", direction: "weird", entryId: "E",
    }).primer.direction).toBe("forward");
    expect(buildEntryPrimerPayload({
      id: "p4", name: "x", sequence: "ACGTACGTAC", entryId: "E",
    }).projectId).toBe(null);
  });

  it("keeps an empty name empty (pool default handles naming)", () => {
    expect(buildEntryPrimerPayload({
      id: "p5", name: "   ", sequence: "ACGTACGTAC", direction: "forward", entryId: "E",
    }).primer.name).toBe("");
  });

  it("returns null when id missing or sequence has no usable bases", () => {
    expect(buildEntryPrimerPayload({
      name: "x", sequence: "ACGTACGTAC", direction: "forward", entryId: "E",
    })).toBe(null);
    expect(buildEntryPrimerPayload({
      id: "p6", name: "x", sequence: "    \n--", direction: "forward", entryId: "E",
    })).toBe(null);
  });
});

describe("selectEntryPrimers", () => {
  const mk = (id, entryId, extra = {}) => ({
    id,
    name: `n-${id}`,
    sequence: "ACGTACGTACGT",
    direction: "forward",
    tm: 60,
    addedAt: extra.addedAt || "2026-05-18T00:00:00.000Z",
    origin: { kind: "library-selection", entryId },
    ...extra,
  });

  it("returns a stable shared EMPTY ref when nothing matches", () => {
    const a = selectEntryPrimers({}, "E1");
    const b = selectEntryPrimers({ x: mk("x", "OTHER") }, "E1");
    const c = selectEntryPrimers(null, "E1");
    const d = selectEntryPrimers({ x: mk("x", "E1") }, null);
    expect(a).toEqual([]);
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(a).toBe(d);
  });

  it("filters by origin.kind + origin.entryId and maps to the viewer-primer shape", () => {
    const primersById = {
      p1: mk("p1", "E1", { name: "fwd", direction: "forward", sequence: "AAACCCGGGTTT", tm: 58 }),
      p2: mk("p2", "E1", { name: "rev", direction: "reverse", sequence: "TTTGGGCCCAAA", tm: null }),
      p3: mk("p3", "E2"), // other entry
      p4: { id: "p4", origin: { kind: "paste" }, sequence: "ACGTACGTACGT", name: "imp" }, // other origin
    };
    const out = selectEntryPrimers(primersById, "E1");
    expect(out).toHaveLength(2);
    const byName = Object.fromEntries(out.map((p) => [p.name, p]));
    expect(byName.fwd).toEqual({
      // `id` kept for identity-consumers (PiecePrimersPickModal);
      // PrimerTrack ignores it — viewer shape otherwise unchanged.
      id: "p1",
      name: "fwd",
      sequence: "AAACCCGGGTTT",
      bindingSequence: "AAACCCGGGTTT",
      tail: "", // V173 — viewer shape now carries tail (empty for tail-less primers)
      direction: "forward",
      tmBinding: 58,
    });
    // null tm → tmBinding omitted (PrimerTrack label gate is truthy).
    expect(byName.rev.tmBinding).toBeUndefined();
    expect(byName.rev.direction).toBe("reverse");
  });

  it("orders deterministically by addedAt ascending", () => {
    const primersById = {
      late: mk("late", "E1", { name: "late", addedAt: "2026-05-18T10:00:00.000Z" }),
      early: mk("early", "E1", { name: "early", addedAt: "2026-05-18T09:00:00.000Z" }),
    };
    expect(selectEntryPrimers(primersById, "E1").map((p) => p.name)).toEqual([
      "early", "late",
    ]);
  });
});
