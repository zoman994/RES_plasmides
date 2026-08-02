# BodgeGene — enduring decisions

This file contains only decisions that are not obvious from one source file and still constrain current work. Sprint chronology belongs in Git, not here.

## 1. Local-first and reference hardware

- Core editing, validation, project files and deterministic fallback work without an account, internet connection or dedicated GPU.
- Reference hardware is Windows 10/11, 2 physical cores / 4 threads, 8 GB RAM and integrated graphics.
- Heavy work stays outside the UI thread, supports cancel/stale-drop and normally uses no more than one heavy worker on the reference machine.
- Accuracy is never silently reduced for speed. A preview may be cheaper only when visibly incomplete; save/export requires the exact contract.
- Rust/WASM is considered only for a measured hot kernel after indexing, caching, incremental work and transfer costs are addressed.

## 2. Canonical state and dependency direction

- Zustand domain slices hold canonical application state; components render projections and invoke actions/controllers.
- A second editable model in a canvas, modal or view is forbidden unless it has an explicit synchronization contract.
- Generic UI primitives do not import the store, persistence or biological engines.
- Cross-domain workflows are orchestrated by a controller/hook/facade, not by duplicating rules across components.
- Persisted mutations are explicit and migration-aware; hydration is idempotent.

## 3. Assembly model

The current model has four tiers:

1. Pieces — source-derived or synthetic material.
2. Junctions — intended relationships and boundary configuration.
3. Operations/reactions — transformations such as PCR, digest, ligation, Golden Gate or Gibson.
4. Outputs/clones — materialized products and provenance.

Graph/canvas views are projections of these tiers. Old DAG-primary and ProjectCommit-hyperedge descriptions are superseded.

## 4. Revisions and consequential edits

- A biologically consequential edit creates a revision/variant or an explicitly derived object; it does not silently overwrite the authoritative source.
- Expected design and observed experimental evidence remain distinct.
- Provenance records source identity, operation/algorithm version and user decision where reproducibility depends on them.

## 5. Annotation and coordinate contract

- One `annotations[]` collection represents region/detail/point hierarchy. There is no separate `domains[]` model.
- New annotations receive stable IDs at the write boundary.
- Internal coordinates are zero-based and end-exclusive.
- Strand and topology are explicit. Circular/origin-crossing objects use segment-aware locations rather than invalid linear intervals.
- Importers normalize external conventions once; UI code consumes the normalized contract.

## 6. Introns, splicing and translation

- Introns are detail annotations associated with their gene/CDS; exons and spliced sequence are derived.
- Splice/translation behavior has one shared engine instead of per-view variants.
- Prediction is scoped to a selected gene/region and produces reviewable candidates; it does not silently rewrite annotations.
- Alternative isoforms require explicit transcript identity. A union of all introns is not a valid synthetic transcript.
- Genetic code table and compound location are part of the translation contract, not display metadata.

## 7. Primers and restriction enzymes

- The primer pool is canonical across the application.
- Template-binding sequence and 5′ tail/overhang are separate fields and calculations. Synthetic tails never modify the source template.
- Type IIS enzymes for Golden Gate and classical restriction enzymes for restriction cloning are separate catalogs/semantics.
- Primer design and assembly validation must preserve topology, orientation, reading frame and enzyme-specific cut geometry.

## 8. Search

- Query meaning has three independent axes: entity scope, provider intent and field clauses.
- Default search covers user data; enzyme/reference catalogs are opt-in.
- Final mixed queries use strict AND across all requested dimensions.
- Provider timeout/crash/invalid protocol means incomplete, never confirmed absence.
- Entity identity is kind-qualified (`kind:id`); raw IDs remain domain-local.
- Library tree query and global search state are separate. Escalation replaces global state instead of merging stale filters.
- Interactive DNA queries are strict A/C/G/T after trim and uppercase. Ambiguous target symbols are mismatches, not wildcard evidence.
- DNA routing is corpus-wide `EXACT_FIRST`: exact scans every eligible document and, if anything exact exists, approximate rows are not mixed into the result.
- Exact DNA search has no upper query-length ceiling. Bare DNA uses the configurable auto-detection floor (`minQueryLen`, default 8); explicit `seq:` intentionally bypasses that floor, while Ctrl+F has its own fixed 8-nt minimum. An accepted DNA query can use the `LINEAR` approximate kernel up to 100 nt. Above 100 nt, a no-exact query returns `REQUIRES_ALIGNMENT` only when threshold is below 100%; threshold 100% is exact-only and may honestly return zero. Benchmark seams are internal and are not user settings.
- DNA identity is `M / (M + X + I + D)` over a whole-query glocal alignment. Both strands, circular segments and the canonical physical locus are part of the result contract.
- Heavy DNA work runs in a worker. Ordinary cancellation is cooperative (`cancel → unwind → ACK`); faults, timeout, malformed payload and resource exhaustion fail closed as incomplete.
- The sequence boundary is the strict envelope `{occurrences, locationCount, bestIndex}`. Alignment internals do not cross into the Search UI.
- Search is a locator/ranker, not an alignment viewer. Click and Enter open the ranked locus; Back restores the search session.

## 9. Portable project format

- `.bodge` v2 structured JSON/ZIP is the normative portable project format.
- GenBank, FASTA and SnapGene are interchange/projection formats, not the full canonical project model.
- Readers validate strictly and migrate explicitly; writers do not silently discard unknown or unsupported biological state.
- Expected construct, executed operation and observed evidence remain representable as separate facts.

## 10. Honest evidence and uncertainty

- UI state distinguishes checking, incomplete, blocked, empty and confirmed result.
- Algorithm/model/database versions participate in persisted result metadata and cache keys when they can change the conclusion.
- Statistical or neural suggestions may rank/explain/propose, but deterministic fallback and source evidence remain available.
- Test, build and browser evidence are reported separately; harness-only verification is never described as a live reproduction.

Changes to these decisions require an explicit product/architecture decision, corresponding tests where executable behavior changes, and updates to the affected normative documentation.
