# BodgeGene backlog

Only unfinished product/architecture work belongs here. Confirmed defects belong in [`BUGS.md`](../BUGS.md); immediate execution belongs in [`CURRENT_TASK.md`](../CURRENT_TASK.md). Completed work and sprint reports are intentionally absent.

## Now — pre-release stabilization

### Assembly ranges and derived reactions

Recompute auto-reaction ranges when `piece.ranges` changes. A derived operation must not keep coordinates from an earlier piece shape. Add transition tests covering resize/edit after initial derivation. Legacy debt ID: `TD-T8-PIECE-RANGE-RECOMPUTE`.

### Sanger notebook safety

Close clone-to-focus gaps and replace save-on-blur-only behavior where focus changes can lose data. Persist explicit, testable draft/commit state and keep expected design separate from observed reads. Legacy debt IDs: `TD-T10-SHOW-NOTEBOOK-WIRE`, `TD-T10-NOTES-FLUSH`.

### Revision and annotation history

Complete sequence/annotation history through the current project/library revision model. Define one user-visible history path and migration behavior before adding more revision UI. Legacy debt IDs: `TD-ARCH-ANNOTATION-VERSIONING`, `TD-PLASMID-GIT-LOSS`.

### Remaining transient-surface isolation

Audit the transient surfaces outside the shared ASM-6A boundary:
`PiecePrimersPickModal`, `PieceCreateModal`, `AddModal` and canvas/library overlays that
still own ad-hoc document/window listeners. Each adopted surface needs an explicit
topmost/lifecycle contract before it joins the common stack; portals do not isolate React
events. Refactor `AddModal` open-transition reset away from synchronous state writes
inside `useEffect`. Legacy debt ID: `TD-CROSS-PORTAL-AUDIT`.

### Lint baseline and scoped command

Restore a green project-wide ESLint baseline and add a true scoped script. Today
`npm run lint -- <paths>` still executes `eslint .` before the requested paths, so a package
must invoke the local ESLint binary directly to separate its result from unrelated legacy
errors. Baseline on 05.09.2026: 360 errors / 5 458 warnings. Root causes to remove in
order: (1) `eslint.config.js` applies only `globals.browser` to every `.js/.jsx`, so
`vite.config.js` (`process`), 24 test files (`__dirname`, `Buffer`, `global`) and helpers
such as `lib/bodge-hash.js:18` fail `no-undef`; add a second config block with
`globals.node`/`globals.vitest` for tests, config and Node-fallback helpers; (2) three
Fast Refresh errors from helper exports beside a default component:
`SequenceView/SequenceLandingPreview.jsx:52`, `assembly-mode/AssemblyPrimersPanel.jsx:199`,
`SequenceView/popups/PrimerTmReadout.jsx:19`; (3) 42 of 70 `eslint-disable` directives
name rules that are not enabled (32 `no-console`, `react/*`, `jsx-a11y/*`) and surface as
unused-directive warnings; (4) `DATA_FILES_WITH_RUSSIAN` omits the dictionaries
`src/lib/strings.js` and `src/components/Library/lib/importer-strings.js`; (5) the
`no-cyrillic` rule does not visit JSXText, so hardcoded UI text in JSX is invisible to it.
Move the remaining user-visible `.bodge` Open/StartScreen literal strings into the i18n
dictionary. `.mjs` scripts under `gui/designer/scripts/` are never linted.

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
- keep provider failure/incomplete and strict final AND contracts unchanged;
- decide the fate of the legacy seed-and-extend engine `lib/sequence-search.js`
  (IUPAC, main-thread, no cancel): it still serves Align homolog ranking and exports
  `canonicalDnaQuery`/`identityBucket` to the new pipeline, and
  `SMART_SEARCH_SCOPES_PREFIXES_REV2.md` still describes it as superseded;
- `search.worker.js` overwrites `activeId` on any job frame; add defence-in-depth against a
  second concurrent job even though the client never sends one;
- refresh stale in-code comments: `search-facade.js:154` still lists `maxMismatches`;
  `search-provider-contract.js:102` and `search-provider-failures.js:21` call
  `library-search.js` “frozen (size + hash)” while it is 22 417 B with no pin test.

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

Replace the fixed/asymmetric `GCGC` policy with an enzyme-aware, symmetric and validated
protective-base policy. Two policies coexist today: `primer-derive.js:37` hard-codes
`RE_PROTECTIVE = 'GCGC'` while `CanvasSkeleton/lib/end-chemistry.js:26, 41` already carries
an enzyme-aware `minFlanking` fallback (`PROTECTIVE_DEFAULT = 6`). Converge on one.
Preserve separate Type IIS/classical restriction semantics and add end-to-end
primer/export tests. Legacy debt ID: `TD-PRIMER-PER-ENZYME-IDENTITY`.

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
  IUPAC/frame semantics and a preview before destructive dedup;
- route every annotation ingress through `ingestAnnotations`: `.bodge` open
  (`StartScreen.jsx:117`, `open-bodge.js:96`), `bodge-assembly-portable.js:53` and
  `cross-project-bodge-import.js:115` still bypass the gate, `bodge-container-genbank.js:436`
  still sets legacy `parentId`, and `cross-project-bodge-import.js:237` re-emits it;
- retire the private 16-enzyme `COMMON_RE_SITES` table in `auto-annotate.js:133-149`
  in favour of `restriction-db.js`, or declare why `restriction_site` point annotations
  need a separate catalog;
- bound `annotator.runContexts` (grows per job until document change);
- align the ANN-INTEGRITY seam numbers in untracked file headers with BUGS.md ids
  (`annotation-identity.js:3`, `annotator-run-identity.js:2`, four proof tests cite
  BG-030/032/033 for other seams);
- update `.agents/skills/annotation-contract/SKILL.md` for the opaque-id ingest gate.

The fast select -> name -> Enter creation path and detail/point rendering on overview
maps already exist; do not plan them again. Correctness defects discovered by the
annotation audit are tracked only as BG-026…BG-034 in `BUGS.md`.

### Primer-pool follow-ups

Complete Map/SequenceView occurrence-selection parity, guarded Delete/Backspace behavior
and explicit version/variant semantics when the full oligo changes. Keep source-declared
sites distinct from computed off-targets and do not infer tubes, lots or physical stock.
Residuals recorded on 05.09.2026: source-form provenance does not pass Python→JS (former
BG-035); `resolveAnchoredOligo` (`lib/primer-identity.js:308-411`) has no production
consumer after `resolvePhysicalOligo`; `segmentPositions`/`positionsToSegments` are
duplicated in `primer-site-projection.js` and `primer-five-prime-projection.js`;
`primer-known-placement.js:93` writes `tail: ''` (“proven absent”) for an unknown tail;
MIN_TM/MAX_DELTA_TM thresholds are duplicated as literals in `pcr-amplicon.js:435-439`;
the primer dialog now always writes `tm` (number or null), so renaming an unprojectable
legacy primer clears its stored Tm — deliberate and tested, but user-visible.

### Primer thermodynamics beyond P6a

Add numeric imperfect-duplex Tm only from complete published context-specific parameter
tables with an independent oracle: single internal mismatches first, strand/context-specific
single-base bulges separately, and no invented penalties for mixed/long loops. Add bounded
IUPAC ranges, project/reaction-persisted concentration profiles and vendor-specific Ta as
separate concepts; do not change the accepted P6a fail-closed `not-calculated` fallback or
silently recalibrate legacy assembly heuristics.

### Assembly workbench convergence

Unify piece acquisition, junction configuration, primer-tail derivation and live graph projection around the current four-tier model and [`ASSEMBLY_WORKBENCH.md`](specs/ASSEMBLY_WORKBENCH.md). Finish PrimerPool reuse without reviving legacy wizards.

Known model gaps registered as BG-064/065/072/073/074/076. Also: realise silently
substitutes the ring-closure method (`overlap_pcr → gibson`, `kld` with N>1 → `gibson`) in
`guardClosureMethod` (`zone-pieces-to-dag.js:608-609`) instead of blocking; UI-transient
fields `junctionPicker`, `focusedZoneId`, `highlightedVariantGroup`, `activeAssemblyId` are
persisted and restored (`skeleton-persistence.js:71`); two junction representations
(`zone.junctions[pairKey]` vs `state.junctions[]`) and two mini-map renderers
(`components/PlasmidMiniMap.jsx` vs `canvas/MiniPlasmidMap.jsx`) coexist; the test-only
window event `__v88_re_click__` lives in production `RangePickerModal.jsx:392-398` with a
deps-less effect; `MutationModal` default position is `0` while the comment promises the
piece centre (`AssemblyShellBody.jsx:1036-1040`); `onRangeConfirm` recovers the inserted
container by a `setTimeout(0)` snapshot diff with an any-new-container fallback
(`AssemblyShellBody.jsx:553-563`).

### Heavy compute off the UI thread

Only the DNA search worker honours DECISIONS §1 today. Move, with cancellation and
stale-drop, in this order: (1) `scanAllSites` — 459 REBASE + 62 curated enzymes, a full
`toUpperCase()` copy and two fresh `RegExp` per enzyme, run inside render-time `useMemo`
in `SequenceView/index.jsx:518-540`, `PlasmidMapV2.jsx:167`, `LinearMapV2.jsx:101`; the
working tree runs it twice while the primer editor is open (`primerTemplateReSites`);
cache compiled patterns per catalog generation; (2) pairwise/multi-read alignment
(`store/alignmentSlice.js:268-282`, status `running` never paints); (3) `re:`/`cut:` and
`aa:` search providers (`search-facade.js:15, 96`); (4) splice CNN
(`Annotator/index.jsx:479`), `scanLibraryForPrimer` in `PrimerBindingSites.jsx:37`,
`detectORFRanges` with per-char concatenation (`orf-ranges.js:23`), `.bodge`
`zipSync`/`unzipSync` (`bodge-zip.js:331, 639`). The predictor worker chunk pulls the whole
Zustand store (Dexie, immer, a second copy of the REBASE table; 464 kB in dist) because
`feature-detection.js:82` dynamically imports `store/commonFeaturesSlice`; it has no
cancel frame and `annotator-pipeline.js:66` silently re-runs on the main thread when the
worker rejects. Fix the chunk boundary and surface the fallback. Refresh stale perf
comments (`file-summary.js:118` “~50 enzymes”, `annotator-worker-client.js:18` “~5-15 ms”).

### `.bodge` v2 completion

Complete the normative core, migrations, notebook content, provenance and implementation plan under `docs/specs/`. Keep strict validation and explicit downgrade/loss reporting.
The next vertical must include conflict-safe project-owned primer identity, typed reaction/pair
references, real `.bodgeassembly` merge semantics, recoverable cross-store import cleanup and
byte-preserving handling of unknown optional extensions. BG-003 unified project Open but did not
claim any of these format/repository cutovers.

Documentation drift to resolve with the next format vertical: `SPEC_BODGE_FORMAT_V2_CORE.md`
§4 describes `containers/<id>.json`, vendor manifests and `ui/layout.json`, while the
writer emits `containers/<id>.gb`, `extensions/bodgegene/skeleton.json` and a
`library/entries.json` section the spec never mentions; `USER_GUIDE_FORMATS.md:31-38`
promises library and Notebook persistence that Ctrl+S does not perform (BG-027, and no
notebook slice exists); `BODGE_V2_IMPLEMENTATION_PLAN.md` §2.15 still mentions a v1
fallback that no longer exists. Defects: BG-069, BG-070, BG-071.

### Alignment/Sanger trust

Resume the blocked alignment reliability specification only after current repository/schema
gates are stable. Require quality evidence and corpus-based acceptance, not
presentation-only confidence. The five runtime defects the specification lists are now
registered as BG-077 and may be fixed ahead of the specification. None of the planned
modules (`lib/alignment/{contracts,fingerprint,session,reference-pileup,
consensus-likelihood,verification-policy}.js`, `lib/bio-compute/*`, an alignment worker)
exists; the spec cites `DEC-ALIGN-01/04`, which are not in DECISIONS.md.
`alignCircular` and `poaConsensus` are library code without production consumers. The
Notebook editor (`src/canvas/`) is not mounted by any production component and its
unmount cleanup drops the pending 500 ms debounce without flushing.

## Maintenance after format checkpoint

### Test infrastructure

После точечного common-features stub compatibility trace зафиксировал два делегированных
запроса `/api/import`, которые напечатали четыре безымянных блока `ECONNREFUSED`. Не
расширять глобальный stub: отдельно определить владельца test ingress и явные
success/error fixtures для этих запросов.

### Oversized module boundaries

Do not split stable files merely to satisfy a byte counter. Before the next feature change
in these areas, characterize behavior and extract along live ownership boundaries. Sizes on
05.09.2026 (bytes on disk; LF-normalised values are 1–3 % smaller for CRLF files).
Hard-zone `.jsx` (limit 40 960): `SequenceView/index.jsx` 74 231, `AssemblyShellBody.jsx`
62 066, `RangePickerModal.jsx` 57 745, `PlasmidMiniMap.jsx` 43 845,
`ContainerEditorSkeleton.jsx` 41 110. Hard-zone `.js` (limit 25 600):
`store/librarySlice.js` 49 163, `CanvasSkeleton/lib/zone-pieces-to-dag.js` 33 531,
`canvas/canvas-layout.js` 31 456 (14 472 B of exports have only test consumers),
`SequenceView/hooks/useSelectionState.js` 31 038, `store/projectSlice.js` 28 931,
`store/skeleton-state.js` 27 491, `store/skeleton-state-canvas.js` 27 286,
`lib/feature-match-core.js` 26 129, `lib/bodge-zip.js` 25 639. Within 200 B of the hard
line: `SegmentZonesOverlay.jsx` 40 926, `AnnotationTrack.jsx` 40 834,
`LibraryWorkspace.jsx` 40 797, `skeleton-state-assembly.js` 25 549. Soft-zone watch:
`AATrack.jsx` 38 882, `LibrarySingleInspector.jsx` 36 861, `Annotator/index.jsx` 35 480
(new entrant), `PrimerTrack.jsx` 32 903, `PlasmidMapV2.jsx` 31 404,
`lib/annotation-edit.js` 24 574 (new entrant, 96 % of hard), `primer-derive.js` 24 737,
`local-primer-design.js` 23 501, `segment-overhangs.js` 23 460, `search-sequence-contract.js`
23 445, `query-classify.js` 23 210, `auto-annotate.js` 22 432 (new entrant),
`alignmentSlice.js` 21 738, `protocol-export.js` 22 120. Generated/data dictionaries are
exempt (`restriction-db-rebase.js`, `i18n.js`, `cnn-weights.js`, `strings.js`);
`restriction-db.js` (44 190 B) mixes the curated dictionary with scanning/digest logic and
needs a data/logic split before it can be judged. Decomposition seams with line ranges
for `SequenceView/index.jsx`, `AssemblyShellBody.jsx`, `RangePickerModal.jsx`,
`PlasmidMiniMap.jsx`, `ContainerEditorSkeleton.jsx` and `canvas-layout.js` are recorded
in the 05.09.2026 audit and should be reused when a file enters scope. No automated
size check exists; add one to the hygiene tests. Legacy debt IDs unchanged.

### Legacy `project.dag` state

Remove the remaining low-priority store orphan after `.bodge` compatibility/migration no longer depends on it. Legacy debt ID: `TD-DEAD-DAG-STORE-MODEL`.

### Legacy annotation IDs

New write paths already provide IDs. Add a narrow migration for historical detail/point annotations that still lack them; avoid a broad importer rewrite.

### Performance baselines

Maintain reproducible benchmarks on the reference 2-core/8-GB machine: UI cancellation p95, metadata preview, exact DNA search, project open and memory for a 10-Mb library. Legacy debt ID: `TD-DEV-POLICY-LEGACY-HARDWARE`.

### Feature database build pipeline

Move the curated cross-name/AmpR dedup rules from `scripts/dedup_common_features.py` into the tested SnapGene feature builder, then delete the separate postprocessor. Until then, its local snapshots belong only in ignored `scripts/.backups/`.

### Dead-but-tested modules

Tests are proof of a change, not a product. The following have no production consumer
and are kept alive only by their tests; each removal needs the consumer proof and full
regression run AGENTS.md requires, or an explicit decision to wire it: `lib/bodge-migrations/`,
`lib/notebook-migrations/`, `bodge-export-profiles.applyProfile`, `bodge-atomic-write`,
`bodge-recovery` (uses CommonJS `require('fflate')` inside ESM), `bodge-extensions`,
`bodge-assembly-portable`, `canvas/ExportProjectModal.jsx` and the whole `src/canvas/`
Notebook UI; ten `canvas-layout.js` exports (collision, magnet snap, auto junctions, edge
pan, viewportToWorld); ~270 lines of persisted-undo/overwrite/save-as-version actions in
`store/librarySlice.js` (`overwriteLibraryEntryAnnotations`, `saveLibraryEntryAsVersion`,
`applySequenceEditOnLibraryEntry`, `updateLibraryEntryTopology`, `libraryUndo`);
`skeleton-bodge-bridge.js:85-107` duplicates of `primersForProject`/`primersFromCanonical`;
`selectLabPoolStructure`; `lib/alignment/align-circular.js`, `poa.js`;
`components/Dag/ContainerWindowPlaceholder.jsx` and the `containerWindow` route nothing
pushes; Python `feature_db.py`, `kld.py`, `assembly_engine.py` (no tests) and 10 of 11
`gui/api/server.py` routes.

### Store ownership leaks

`MainPanel.handleProjectClick` activates a project with raw `useStore.setState` and a
local MRU cap of 20 versus 10 in `projectSlice.activateProject`; `showReSites` is written
directly from `SequenceToolbar.jsx:45`, `ContainerEditorSkeleton.jsx:399`,
`RangePickerModal.jsx:262` although `restrictionViewSlice` exposes setters;
`ContainerEditorSkeleton` forces `reOrientation='horizontal'` on mount and restores on
unmount (:396-411) — revisit after P17 made it the default; persistence side effects run
inside immer producers in `uiSlice.js` and `annotatorSlice.js`; `projectSlice`,
`librarySlice`, `primerSlice`, `projectAssembliesSlice` import from `components/`,
inverting ARCHITECTURE §7; `commonFeaturesSlice` imports `useStore` from `./index`;
`hydrateProjectsFromDexie` has no `_hydrated` guard; `App.jsx` keeps `hotkeysOpen` in
local `useState` plus 10 manual `useCallback` and a dead `project` subscription;
`LibrarySingleInspector.jsx:419-473` calls two hooks after a conditional early return
(compiler bailout); `useSidebarCollapsed` binds Ctrl+B outside the hotkey registry.
Direct `localStorage` use in 13 files bypasses `lib/storage.js`; `SettingsModal.jsx:49`
calls `localStorage.clear()`.

### Repository hygiene

No CI, no `engines` field (Vite 8 needs Node ≥ 20.19; machine has 24.14), no
`.gitattributes` while `core.autocrlf=true` yields mixed CRLF/LF inside files
(`AATrack.jsx`, `useSelectionState.js`, `RestrictionTrack.jsx`); add `* text=auto eol=lf`.
`__tests__/ann0m-primer-vertical.test.jsx:42` embeds raw NUL bytes and is tracked as a
binary blob. Large checkpoint commits (876bad0, 6f652ac) have no body; require a body
listing streams and gate numbers. `docs/SMART_SEARCH_SCOPES_PREFIXES_REV2.md` (99 KB,
“partially implemented”) sits in the docs root and still describes the closed match-all
defect as current; move to `docs/specs/` or delete as an implemented plan.
`docs/specs/agarose-gel/` (1 496 lines) has no code behind it. `public/manifest.webmanifest`
is a stale duplicate of the VitePWA-generated manifest. `scripts/gen-rebase-enzymes.mjs`
depends on an ignored, absent `.rebase-tmp/`. Hygiene tests to add: docs paths exist,
size budget, App.jsx has no `useState`, repo-wide `outline:none`/hex guard (today only
`components/Search` is guarded).

### Python backend scope

Decide whether the `pvcs` CLI and its SQLite model remain a product surface or become the
planned `bodge` reference CLI. Until then: enzyme catalogs exist in four Python tables
(`assembly_engine.GG_ENZYMES`, `golden_gate.ENZYME_SITES`, `restriction.RE_DATABASE`,
`utils.COMMON_RE_SITES`) and two JS catalogs with different sets and `cut_offset`
semantics and no parity test; `utils.calc_tm` omits the terminal-AT initiation term the JS
kernel applies; `intron_detection.py` imports undeclared `mappy` and answers HTTP 200
`{error}`; `/api/import` wraps its own 400 into a 422; `server.py` carries unused imports
`asdict`, `design_overlaps`. Proposed decision for DECISIONS §7: JS catalogs are the
source of truth for enzymes and Tm; Python is parsing and versioning only.

## Legacy debt migrated from the retired tracker

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
