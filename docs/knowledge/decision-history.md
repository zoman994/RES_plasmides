# Decision history — major threads from Igor ↔ Claude conversations

Distilled record of the big decisions and project threads, so the graph knows the "why"
behind the code, not just its structure.

## Architecture epoch
- v0.6+ wiped v0.5 data deliberately (⚓ DEC-V2-08 "quality > speed"). Architecture
  aggregator: `docs/ARCHITECTURE.md`. Skeleton store (useReducer + Context) is SEPARATE
  from the global Zustand store — cross-store coupling is intentionally avoided.

## Canvas / assembly model
- Zones == assemblies. `ProjectAssemblyWorkspace` is a two-level tab workspace replacing the
  old floating ZoneFrame canvas. Finalizer pattern: `applyJunctionConfig` derives primers.
- Dual layout systems: zone frame (3-lane) vs inner graph (dagre) are separate concerns;
  node size is a top-level width/height, not `node.kind`.
- Assembly engine: `deriveAutoPrimers` (four-tier), `deriveSelfClosurePrimers`,
  `methodsFromJunctions`, `realiseAssembly` (zone-pieces-to-dag.js), `METHOD_TO_OP_KIND`
  (overlap_pcr → 'gibson'), `buildOverlapTail`, `enzymeTailParams`.

## Biological invariants (hard rules, not style)
- GG_ENZYMES (golden-gate.js, Type IIS, `.recognition`) vs RE_ENZYMES (restriction-db.js,
  `.site`/`.cut`/`.overhang`) — STRICT separation, two dicts, never merged.
- Topology determines valid methods: linear+overlap→Overlap PCR; circular+overlap→Gibson;
  circular+backbone→KLD/RE-ligation. Merge through a ligation junction is biologically
  impossible → blocked, not asked.
- Annotations: 3-level (region/detail/point) in ONE `annotations[]` with `level`; NO separate
  `domains[]`. Every annotation needs a stable `id` (makeId / lib/ids.js). Coords are 0-based
  end-exclusive in the model; convert to 1-based only at the UI boundary.

## T-series four-tier + schema drift
- T1–T10 shipped one-at-a-time, acceptance-gated. SCHEMA_VERSION_CURRENT runs ahead of spec
  numbers — derive the real N from code, not the spec. SPEC §0 baselines are stale: verify
  file sizes + Dexie DB_VERSION from code.

## Tooling threads
- Circularization (M-CIRCULARIZE): кольцевание as a working tool + closure modal; engine gap
  was that realiseAssembly never made the closure junction (since addressed).
- Consistency audit (2026-06): interface↔logic↔biology↔code alignment, ~43 findings, fixed
  across ~28 commits incl. enzyme threading (F), method correctness, KLD gating, GG interior
  site guard, junction auto-classify by enzyme provenance.
- Global interface audit + LibraryWorkspace persistence audit (2026-06-14): fixed annotation
  persistence (4548025), sequence-edit persistence (005beb4), annotator selection/delete
  (1717c83). See intended-behavior-library-annotator.md.

## Process anchors
- TDD-first; full-suite + build each change; bugs only in BUGS.md; reuse components; respond
  in Russian. See working-agreements.md.
