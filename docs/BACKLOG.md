# BodgeGene backlog

Only unfinished product/architecture work belongs here. Confirmed defects belong in [`BUGS.md`](../BUGS.md); immediate execution belongs in [`CURRENT_TASK.md`](../CURRENT_TASK.md). Completed work and sprint reports are intentionally absent.

## Now — pre-release stabilization

### Assembly ranges and derived reactions

Recompute auto-reaction ranges when `piece.ranges` changes. A derived operation must not keep coordinates from an earlier piece shape. Add transition tests covering resize/edit after initial derivation. Legacy debt ID: `TD-T8-PIECE-RANGE-RECOMPUTE`.

### Sanger notebook safety

Close clone-to-focus gaps and replace save-on-blur-only behavior where focus changes can lose data. Persist explicit, testable draft/commit state and keep expected design separate from observed reads. Legacy debt IDs: `TD-T10-SHOW-NOTEBOOK-WIRE`, `TD-T10-NOTES-FLUSH`.

### Revision and annotation history

Complete sequence/annotation history through the current project/library revision model. Define one user-visible history path and migration behavior before adding more revision UI. Legacy debt IDs: `TD-ARCH-ANNOTATION-VERSIONING`, `TD-PLASMID-GIT-LOSS`.

### Modal event isolation

Audit and fix event propagation/focus ownership in `PiecePrimersPickModal` and `PieceCreateModal`. Escape, Enter and click-outside must affect only the active transient surface.
Refactor `AddModal` open-transition reset away from synchronous state writes inside `useEffect`;
the pattern already exists in HEAD and keeps scoped ESLint red even when new modal code is clean.
Legacy debt ID: `TD-CROSS-PORTAL-AUDIT`.

### Lint baseline and scoped command

Restore a green project-wide ESLint baseline and add a true scoped script. Today
`npm run lint -- <paths>` still executes `eslint .` before the requested paths, so a package
must invoke the local ESLint binary directly to separate its result from unrelated legacy errors.
Move the remaining user-visible `.bodge` Open/StartScreen literal strings into the i18n
dictionary; BG-003's scoped gate is error-free but still reports these Cyrillic-string warnings.

### Search follow-ups

- make `name:`, `feature:` and resolved `in:` executable before offering them;
- implement or remove `headVersionsOnly`;
- index description/organism consistently;
- design the corpus filter/index layer before adding new search modes (`TD-SEARCH-INDEX-EAGER`): cheap metadata/scope filters
  first, exact sequence index next, approximate verification only for surviving documents;
- converge `LibrarySearchBar` with the shared DNA contract or label its current behavior explicitly;
  it is still a separate min-3, forward-only literal ACGT substring filter without circular or
  approximate semantics;
- decide whether global explicit `seq:` should keep bypassing `minQueryLen`; today bare DNA uses the
  configurable auto-detection floor, explicit `seq:` accepts any non-empty A/C/G/T query, and Ctrl+F
  independently requires 8 nt;
- make equal-key grouping in `search-hit-summary` resumable if a future producer can create a large
  identical group; current DNA output bounds such a group to the two strands, so this is hardening,
  not a correctness blocker;
- replace raw hex values in `identity-color.js` with design tokens across all consumers;
- normalize inline typed errors with worker errors if consumers ever need a common `.reason`;
- prove whether the full `seq` field in `search-result-vm` has any production consumer and remove
  it from row view-models if dead; the rendered locus summary already needs only compact metrics;
- keep provider failure/incomplete and strict final AND contracts unchanged.

### Weak-PC search benchmark (deferred check)

Removed from the blocking gate by the product owner; kept here so it is not forgotten. The reference
run is a single command on a 2-core / 8 GB Windows machine — it cannot be produced on a development
machine, because `Emulation.setCPUThrottlingRate` only reaches the renderer main thread and never the
worker, and pinning Chrome to two cores does not slow a single thread down.

Everything needed is already built and archived outside the repository:
`D:\bodgegene-bench\u6-weakpc` (both production builds, both cap-lifted measurement builds,
manifested corpora, harness, `MANIFEST.json`), plus
`D:\bodgegene-bench\u6-weakpc-2026-07-31.zip`,
SHA-256 `bdb069ba4ea9acf20d8c64279cecba6ed6feec4d08d5672eb116452f2c477033`. Run `node run-all.mjs`;
it produces one `WEAKPC-REPORT.txt`. Re-run it before any claim that a weak machine is supported.

Two things are therefore NOT claimed by the U6 acceptance and belong to this run: behaviour on a weak
machine, and the search worker's own memory peak on the current build. The U6 memory figures are an
aggregate working set across all Chrome processes and do not measure or isolate the search worker's
own peak.

### Restriction-primer protective bases

Replace the fixed/asymmetric `GCGC` policy with an enzyme-aware, symmetric and validated protective-base policy. Preserve separate Type IIS/classical restriction semantics and add end-to-end primer/export tests. Legacy debt ID: `TD-PRIMER-PER-ENZYME-IDENTITY`.

## Next — connected capabilities

### T9 design/materialization UI

`CREATE_DESIGN_VARIANT` and `MATERIALIZE_REACTION` have reducer/test foundations but no current production dispatch. Re-design the UI against the present store contract; do not resurrect incompatible legacy wizards. Legacy debt ID: `TD-T9-K13-K14-WIRE`.

### Transcript and isoform model

Introduce explicit transcript identity for alternative intron/exon sets, non-table-1 translation and compound/origin-crossing CDS. Protein search and translation must consume selected transcript variants rather than a union of introns.

### Annotation UX convergence

- converge the duplicated type registries and three edit surfaces on one schema;
- make `detail`, `point` and compound locations consistently selectable and editable
  in Overview, Sequence, Map and Annotator (maps already render more than Sequence);
- share one provenance summary for source, identity, coverage and incomplete/reference
  state across all surfaces;
- surface protein effect and coding-frame consequences before committing CDS edits;
- add keyboard-accessible feature selection/editing, dialog/menu semantics and focus
  restoration without relying on the SVG map as the only control;
- give common-feature curation an explicit edit transaction or undo, validated DNA/
  IUPAC/frame semantics and a preview before destructive dedup.

The fast select -> name -> Enter creation path and detail/point rendering on overview
maps already exist; do not plan them again. Correctness defects discovered by the
annotation audit are tracked only as BG-026…BG-034 in `BUGS.md`.

### Primer-pool interaction after ANN-0L

After the lossless record/site foundation is accepted, add one keyboard-first primer
workflow rather than another editor surface: occurrence selection shared by Map and
SequenceView, `E`/double-click to edit, guarded Delete/Backspace, Escape/focus return,
and explicit version/variant behavior when the full oligo changes. Keep source-declared
sites distinct from computed off-targets and do not infer tubes, lots or physical stock.

### Assembly workbench convergence

Unify piece acquisition, junction configuration, primer-tail derivation and live graph projection around the current four-tier model and [`ASSEMBLY_WORKBENCH.md`](specs/ASSEMBLY_WORKBENCH.md). Finish PrimerPool reuse without reviving legacy wizards.

### `.bodge` v2 completion

Complete the normative core, migrations, notebook content, provenance and implementation plan under `docs/specs/`. Keep strict validation and explicit downgrade/loss reporting.
The next vertical must include conflict-safe project-owned primer identity, typed reaction/pair
references, real `.bodgeassembly` merge semantics, recoverable cross-store import cleanup and
byte-preserving handling of unknown optional extensions. BG-003 unified project Open but did not
claim any of these format/repository cutovers.

### Alignment/Sanger trust

Resume the blocked alignment reliability specification only after current repository/schema gates are stable. Require quality evidence and corpus-based acceptance, not presentation-only confidence.

## Maintenance after format checkpoint

### Oversized module boundaries

Do not split stable files merely to satisfy a byte counter. Before the next feature change in these areas, characterize behavior and extract along live ownership boundaries. Current hard-zone changed modules include `SequenceView/index.jsx` (71.5 KiB), `AssemblyShellBody.jsx` (59.5 KiB), `ContainerEditorSkeleton.jsx` (42.7 KiB), `store/librarySlice.js` (47.8 KiB), `zone-pieces-to-dag.js` (31.9 KiB) and `skeleton-state.js` (26.8 KiB). New soft-zone entrants in the 0.8.8 WIP snapshot are `PrimerTrack.jsx` (35.2 KiB), `PlasmidMapV2.jsx` (30.7 KiB) and `skeleton-state-assembly.js` (24.7 KiB). Existing watch items also include `RangePickerModal.jsx`, `PlasmidMiniMap.jsx`, `LibrarySingleInspector.jsx`, `AnnotationTrack.jsx` and `AATrack.jsx`. Generated/data dictionaries are exempt. Prioritize a split only when the file is in scope and change coupling is demonstrated. Legacy debt IDs: `TD-SIZE-SEQUENCEVIEW-INDEX`, `TD-SIZE-CONTAINER-EDITOR-SKELETON`, `TD-SIZE-LIBRARYSLICE`, `TD-SIZE-PLASMID-MINI-MAP`, `TD-SIZE-LIBRARYSINGLEINSPECTOR`, `TD-LIBRARYSINGLEINSPECTOR-DECOMP-V2`, `TD-ANNOTATIONTRACK-DECOMPOSE-V2`, `TD-SIZE-AATRACK`, `TD-SKELETON-STATE-SIZE`.

### Legacy `project.dag` state

Remove the remaining low-priority store orphan after `.bodge` compatibility/migration no longer depends on it. Legacy debt ID: `TD-DEAD-DAG-STORE-MODEL`.

### Legacy annotation IDs

New write paths already provide IDs. Add a narrow migration for historical detail/point annotations that still lack them; avoid a broad importer rewrite.

### Performance baselines

Maintain reproducible benchmarks on the reference 2-core/8-GB machine: UI cancellation p95, metadata preview, exact DNA search, project open and memory for a 10-Mb library. Legacy debt ID: `TD-DEV-POLICY-LEGACY-HARDWARE`.

### Feature database build pipeline

Move the curated cross-name/AmpR dedup rules from `scripts/dedup_common_features.py` into the tested SnapGene feature builder, then delete the separate postprocessor. Until then, its local snapshots belong only in ignored `scripts/.backups/`.

### Library metadata editing

Expose tags and topology in the current `LibraryWorkspace` with direct, tested persistence to the library entry. Do not restore the retired importer workspace merely to recover its old metadata column.

## Legacy debt migrated from `TECH_DEBT.md`

These unresolved IDs were consolidated here on 26.08.2026. Detailed historical wording
remains in Git history; activation still requires a scoped `CURRENT_TASK.md` package.

- **Assembly/primer:** remove the remaining parallel assembly reducer
  (`TD-ASSEMBLYREDUCER-REMOVAL`) and define PCR-operation primer-name consumers
  (`TD-PRIMER-NAME-OP-PCR-CONSUMERS`).
- **Library UX/data:** complete character apply (`TD-LIB-K10-CHARACTER-APPLY`), preview
  and auto-trigger behavior (`TD-LIB-K4-VIEW-PREVIEW`, `TD-LIB-K4-AUTO-TRIGGER`),
  library-card drag/drop (`TD-DRAG-DROP-LIBRARY-CARDS`), replace deprecated Mine-tag
  grouping (`TD-MINE-TAG-GROUPING-DEPRECATED`), finish pending-delete cleanup
  (`TD-LIBRARY-CLEANUP-PENDING-DELETES`), persisted tag storage
  (`TD-LIBRARY-PERSISTED-TAG-DB`) and search/sort/bulk workflows
  (`TD-LIBRARY-SEARCH-SORT-BULK`).
- **Sequence/accessibility:** wrap keyboard navigation (`TD-WRAP-KEYBOARD-NAV`), category
  button semantics (`TD-A11Y-CATEGORY-BUTTONS`), shift selection and focus visibility
  (`TD-SEQUENCEVIEW-SHIFT-SELECTION`, `TD-SEQUENCEVIEW-FOCUS-RING`), prediction labels
  (`TD-LINEAR-BAR-PREDICTIONS`) and the remaining environment nit (`NIT-3`).
- **Annotation/data sources:** per-CDS SignalP (`TD-PER-CDS-SIGNALIP`), Addgene and open
  plasmid repositories (`TD-ADDGENE-API-PENDING`, `TD-OPEN-PLASMID-REPOS`) and optional
  CAZy integration (`TD-CAZY-INTEGRATION`).
- **Platform/future:** measure before any Rust core (`TD-RUST-CORE-PARSER`,
  `TD-RUST-CORE-PROGRESSIVE`), evaluate native shell/UI only from evidence
  (`TD-DESKTOP-NATIVE-SHELL`, `TD-NATIVE-UI-EVALUATION`), retain a mobile-viewer probe
  (`TD-MOBILE-VIEWER-PROBE`), file association (`TD-BODGE-FILE-ASSOCIATION`), OS fallback
  for Ctrl+N (`TD-CTRL-N-OS-FALLBACK`) and optional onboarding video
  (`TD-ONBOARDING-INTRO-VIDEO`).
- **Maintenance:** repeat a current production reachability audit before deleting further
  remnants (`TD-DEAD-REMNANT-630KB`); the old size/count estimate is not authoritative.

## Active specifications

| Area | Documents |
|---|---|
| Portable format | [`SPEC_BODGE_FORMAT_V2_CORE.md`](specs/SPEC_BODGE_FORMAT_V2_CORE.md), [`BODGE_V2_IMPLEMENTATION_PLAN.md`](specs/BODGE_V2_IMPLEMENTATION_PLAN.md), [`SPEC_REPRODUCIBLE_RECIPE.md`](specs/SPEC_REPRODUCIBLE_RECIPE.md) |
| Assembly convergence | [`ASSEMBLY_WORKBENCH.md`](specs/ASSEMBLY_WORKBENCH.md) |
| Alignment trust | [`SPEC_ALIGNMENT_RELIABILITY_AND_SANGER_VERIFICATION.md`](specs/SPEC_ALIGNMENT_RELIABILITY_AND_SANGER_VERIFICATION.md) |

A task becomes active only when copied into `CURRENT_TASK.md` with scope, acceptance criteria and verification.

## Ideas, not commitments

- optional versioned local models for ranking annotation, primer and design candidates;
- plugin boundary for external databases and alternative compute backends;
- publication pack and reproducible construction passport;
- collaboration/sync that preserves local-first operation.
- typed biological parts: a declarative class registry validates annotations and enables a two-click, strand-aware replacement of promoters, CDS, tags and other compatible features;
- an independent "Autolab" batch mode: generate validated combinatorial construct variants, primers, protocols and optional robot worklists without overloading the interactive assembly DAG.

These ideas stay subordinate to correctness, reproducibility and the reference-hardware budget.
