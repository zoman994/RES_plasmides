# PlasmidVCS Changelog

> Note: between [0.2.0] (2026-03-28) and [0.5.2-alpha] (2026-04-26), the repository did not perform explicit version bumps in `package.json` per release. The versions below are reconstructed from the session journal (`PROJECT_STATE.md`), architectural decisions (`DECISIONS.md`, `docs/archive/DECISIONS_2026_Q2.md`), and bug history (`docs/archive/BUGS_HISTORY.md`) at logical milestones. For exact commit hashes per fix, see `docs/archive/BUGS_HISTORY.md`.

---

## [0.6.4] — 2026-05-02 — M-B.2 Importer Rework + post-acceptance polish

Patch over v0.6.3 (M-A.3) carrying the full M-B.2 «Importer Rework» (K1..K6, single-screen 4-column layout with lazy tabs — V49 50-sec hang fixed) plus three rounds of post-acceptance polish driven by visual review with Игорь. Formal M-B sub-sprint release (v0.7.0) lands separately after final acceptance.

### Added
- **Importer single-screen rewrite (M-B.2 K1..K6).** Replaced Step1Source → Step2Combined two-pane flow with single-screen layout: `[CatalogColumn 320px | Inspector flex | MetaColumn 200px]` + footer (`SessionSummary` + `ActionsBar`) + AutonameModal / PrimerWizardStepModal overlays. Inspector hosts TabBar with «Обзор» (eager, lightweight) / «Последовательность» / «Аннотации» / «История» (last conditional on commits). SequenceTab + AnnotationsTab are React-conditional (only mount when `activeTab` matches) — ditches the V49 50-sec hang.
- **CatalogColumn — 4 sources.** «Этот проект» / «Учебные / demo» / «Моя библиотека» (sub-grouped by `entry.tags` with flat fallback) / «Каталог SnapGene» (lazy-fetched per category). Sticky search input with length-pattern parser (`>5kb` / `<2k` / `2k-3k`). Drop zone footer with file picker + paste textarea (Ctrl+Enter). Persistent group state via `pvcs-catalog-group-{key}` localStorage.
- **Inline TagsEditor** in SingleInspector — chip list + add-input + suggestions from existing Library tag pool. Writes to `perFileEdits.editedTags`; Confirm flow promotes into `entry.tags`. Replaces former Library fullscreen tag-editing UI.
- **OverviewTab** — PlasmidMiniMap 180 px overlay + categorised «Что в файле» (СЕЛЕКЦИЯ / ПРОМОТОРЫ / ORIGIN / TAGS) + remaining CDS top-5 + RE sites + collapsible warnings. 2-column grid (mini-map | summary) — fills horizontal space.
- **MetaColumn** — topology toggle / origin offset+apply with intergenic gap hints / length / from-file vs enriched counts / IUPAC warning.
- **MultiInspector** — full table layout for batch import: `[thumb 36 | name (inline-edit) | length | regions | annotate-checkbox | × remove]` with tristate master + footer batch actions.
- **Feature palette A+v2 + shade-by-name + canonical-key collapse.** Approved over comparison mockup. Base hex changed for CDS / promoter / resistance / reporter (warm-sepia preserved). New `featureColorShaded(type, name)` applies HSL shade (lightness ±10%, hue ±6°) keyed by `canonicalFeatureKey(name)` — so AmpR ≡ ApR ≡ bla render the same shade (one underlying gene), but AmpR ≠ KanR. PlasmidMap + PlasmidMiniMap switched to shaded variant; chip-list consumers (AnnotationEditor / FileSummaryCard / SequencePane / OverviewTab) keep base. ~30 entries in canonical-key table cover common plasmid biology synonyms.
- **DESIGN_SYSTEM §2.1 updated** with the A+v2 palette, shade-by-name + canonical-key description, pointer to `docs/design_assets/feature-palette-comparison.html` mockup.

### Changed
- **Library fullscreen wiped** — its function (browse saved containers) is now covered by Importer's CatalogColumn → «Моя библиотека» group. CRUD over existing entries dropped (tag-editing happens at import time via TagsEditor; soft-delete deferred to M-D Container Window). `librarySlice` data layer kept as-is. StartScreen `Library` SidebarLink now opens Importer with target=library + full catalog visible (default groups expanded).
- **AppShell** `min-height:100vh` → `height:100vh` + `overflow:hidden` — fixes flex-chain collapse so footer with primary actions («На канвас» / «В библиотеку») stays in viewport instead of being pushed below the fold.
- **Importer: simple/advanced mode toggle dropped.** Always-advanced single-screen flow. «Не делать аннотацию» surfaces as `autoAnnotate` toggle in ActionsBar overflow menu (default ON). Removed `simple-import.js`, SimpleFlashOverlay, mode-toggle UI, related strings.
- **ActionsBar context-aware.** target=library → primary «В библиотеку» (or «Скопировать в библиотеку» for catalog source); target=project → primary «На канвас» (gated by hasCurrentProject with tooltip). Catalog item that hasn't been edited shows «Скопировать» — explicit copy semantics, not modify-source.
- **EmptyInspector** — context-aware empty state: `target=library + libraryEmpty=true` → 📚 onboarding card with explicit «add first plasmid» instructions; otherwise generic hint.
- **Cancel × → ‹ Назад in left header** — matches StartScreen Topbar pattern; was floating absolute in upper-right disconnected from header.
- **OverviewTab feature/meta labels** (СЕЛЕКЦИЯ / ПРОМОТОРЫ / etc.) bumped from `text-tertiary 9-10px weight 500` → `text-secondary 10-11px weight 600` letter-spacing 0.6 for readability on dark theme.
- **SequenceMapView** — new `readOnly` prop drops the 120 px primer-label reservation when no primers exist; ~20% more chars per line in Importer SequenceTab. Initial-mount race guard: skip `measure()` when `clientWidth=0`. SequenceTab wrapper enforces `width:100%` + `min-width:0`.
- **AnnotationsTab** — `compact=false` + `hideBar=false` (was both true). Now uses normal-size editor rows + restores the linear «колбаса» feature strip from v0.5 above the editable list. Width fills inspector instead of drowning in a narrow column.
- **MetaColumn intergenic hints** — was inline italic 10px tertiary («межгенные участки: ...»). Now stacked label + monospace text-primary value; readable like a proper data field.
- **MetaColumn `_fromFileCount` for catalog items** — `addCatalogItem` now propagates `_fromFileCount = annotations.length` so the «Из файла: N» panel shows real numbers instead of 0.
- **CatalogColumn scroll boundary** — `overflow:hidden` on aside + `importer-body` + `inspector-pane` so catalog tree's `overflowY:auto` actually stops at the column edge; drop-zone footer + right panes don't drift up with body scroll on long catalogs.
- **StartScreen RecentCard layout** — was flex 1.1/0.9 splitting card into two halves with ~600px of empty air at 1200px width. Now grid `[1fr 280px]` gap 18 — desc gets fixed compact width, left block fills the rest. Card padding 12/14 → 14/16.
- **StartScreen RecentCard chevron ▷** — removed entirely; card itself is the click target (no need for secondary near-invisible affordance).
- **StartScreen RecentCard × delete** — now hover-only (opacity:0 default → 0.7 on card hover → 1 on button hover with danger-bg highlight); no more accidental click target on edge.
- **StartScreen description column** color `--ss-text-secondary` → `--ss-text-primary` opacity 0.85; tag chips color secondary → primary; gap-y between meta and tags 7→10.
- **StartScreen sidebar** — gap 2→4, Browse links get 2px border-left amber accent on hover (Linear/Notion sidebar pattern). Padding-left aligned with Logo (20px both).
- **StartScreen Topbar Guide / Settings buttons** — added padding 4/10, border-radius, hover-bg → reads as ghost-buttons (was plain text without affordance).

### Removed
- `gui/designer/src/components/Library/` (4 files: index, LibraryToolbar, LibraryListRow, TagsInlineEditor) + `components/__tests__/Library.test.jsx`.
- `gui/designer/src/components/Importer/lib/simple-import.js` + `__tests__/simple-import.test.jsx` — dead code after simple-mode removal.
- Importer M-B.1 Step1Source / Step2Combined / MultiFileList components + `steps/` + `inspectors/` directories (rewritten as single-screen in M-B.2 K1).

### Fixed
- **V49** — 50-second hang on Step2Combined default open (5333 bp / 12-region plasmid). Fixed by lazy mount of SequenceTab + AnnotationsTab — heavy components no longer mount on default Inspector open. Regression guard: `lazy-tabs.test.jsx::default-overview-no-annotation-editor`.

### Tests
- Vitest 891/891 (was 834 baseline at v0.6.3 + M-B.1 patches; +57 net across M-B.2 K1..K6 unit + integration suites, palette canonical-key matrix, tags-editor, lazy-tab guard, multi-inspector). pytest 112/112 (backend untouched).

---

## [0.5.2-alpha] — 2026-04-26 — Plasmid-Git Data Model

Finalized as a single event after visual acceptance of Sprint X / X-fix / X-fix-2 / X-fix-3 cycle on EGFP (5 PASS scenarios). One of the largest architectural shifts since the Zustand migration (0.2.0).

### Added
- **Plasmid-Git data model** (⚓ DECISIONS.md): `fragment.baseSnapshot` (immutable sequence + annotations + length) + `fragment.commits[]` (ordered list with `op`, absolute coordinates relative to baseline, and `applied: bool` flag) + `fragment.HEAD` (virtual cursor, reserved for v0.6+ history panel) + replay for sequence/Tm/GC%. Replaces flat `fragment.mutations[]` array.
- **`applyMutationsBatch` reducer** (Sprint X-fix-2) — single `pushUndo` per batch instead of N calls in a loop.
- **Single-circular self-closure primers** (Sprint X-fix K5) — `designPrimersLocal` at `fragments.length === 1 && circular` generates primer pair with overhang-tails for physical self-closure (closes the K12 Sprint 1.7 contract: +30 bp PCR tails were display-only before).
- **`lib/plasmid-git-reducers.js`** (5.02 KB) — new module with reducer functions for Plasmid-Git operations.
- **Backward-compat lazy migration** — fragments without `baseSnapshot`/`commits` get migrated at first commit (current sequence → baseSnapshot, commits=[]).

### Changed
- **`pushUndo` synchronous snapshot capture** (Sprint X-fix-3 commit `4292506`, ⚓ DECISIONS.md) — module-level `_pendingSnapshot`, captures `shallowSnapshot(get())` synchronously at first call in 300ms window before any `set()`. Cleanup of `_pendingSnapshot` + `_pushTimeout` in `undo()` / `redo()` closes race "apply → Ctrl+Z <300ms → new apply". Debounce semantics for merging fast actions into single Ctrl+Z step preserved. Fixes pre-existing bug introduced with debounced undo, which surfaced only on batch-apply.
- **`FragmentEditor::handleSaveMutagenesis` workflow rewire** (Sprint X-fix) — main workflow now goes through Plasmid-Git reducers instead of legacy variant-flow.
- **Test pattern for side-effect functions** (⚓ DECISIONS.md) — `vi.useFakeTimers()` + assert observable state after `advanceTimersByTime` instead of spy-on-call. Lesson from Sprint X-fix-2 K-fix2-1 spy that passed while pushUndo timing bug was live.

### Fixed
- **V22 HIGHLIGHT-INDEL-TAIL** (High) — false red tail past last mutation for indels in sub-fragments. Closed architecturally via Plasmid-Git replay (indel-aware highlights from commit op + start/end, not positional diff applied vs parent).
- **V24 SINGLE-CIRCULAR-NO-PRIMERS** (High) — single-circular self-closure didn't generate primers (early-return at `fragments.length < 2` in `local-primer-design.js`). Closed by extension in Sprint X-fix K5.
- **V27 MUTATION-DELETE-NO-REVERT** (High) — ✕ button in Mutations panel removed mutation from list but didn't revert sequence. Closed via `applied: bool` toggle on commit + replay.

### Tests
- 774 → **846 Vitest** (+72 across the cycle).
- 112 pytest unchanged.

### Files Added
- `gui/designer/src/lib/plasmid-git-reducers.js`
- `gui/designer/src/store/__tests__/undo-batch.test.js`
- `gui/designer/src/store/__tests__/fragmentSlice-git.test.js`

### Files Modified (significant)
- `gui/designer/src/store/index.js` — pushUndo synchronous capture (10.70 → 12.06 KB)
- `gui/designer/src/components/FragmentEditor/index.jsx` — handleSaveMutagenesis rewire (39.55 → 39.32 KB)
- `gui/designer/src/local-primer-design.js` — single-circular self-closure path
- `gui/designer/src/components/FragmentEditor/EditorPanels.jsx` — Mutations panel ✕ via toggleCommit

---

## [0.5.1-alpha] — 2026-04-23 — FragmentEditor Decomposition + UX-1 Prototype Review

### Added
- **UX-1 prototype-first review track** — `?ux=prototype` URL switch isolating Canvas Blocks / PlasmidViewer / AnnotationEditor with paper/ink design language and `feature-palette.js` V2. Validated 8 acceptance criteria across 3 component classes; prototype branch discarded by design, palette retained as design-system asset for upcoming UX-1 series.
- **`docs/UX_1_PROTOTYPE_REVIEW.md`** — review document with palette validation, scope-gap list, four pre-existing bugs reproduced (V31/V30/V9/V10), and phased UX-1 plan (preflight → 1a Canvas Blocks → 1b PlasmidMap/Viewer → 1c AnnotationEditor + SBOL polish).

### Changed
- **FragmentEditor decomposition** (Sprint 2a + Sprint 2a.1) — `components/FragmentEditor.jsx` (72 KB / 1353 lines) split into `components/FragmentEditor/` package across 8 files:
  - `index.jsx` (35.57 KB) — main composition
  - `EditorPanels.jsx` (9.39 KB) — Annotations / Mutations / Protein collapsible panels (Sprint 2a.1)
  - `SequenceGrid.jsx` (7.67 KB), `DnaMutationPopup.jsx` (5.97 KB, incl. `NucTooltip`), `AAMutationPopup.jsx` (5.17 KB), `FullViewGrid.jsx` (2.31 KB)
  - `highlights.js` (3.54 KB), `region-types.js` (2.82 KB), `color-palette.js` (1.35 KB)
  - Hard limit 40 KB closed.
- **Module size limits** (⚓ DECISIONS.md): `.jsx` hard 40 KB / soft 30 KB; `.js` hard 25 KB / soft 20 KB; data files unlimited. Decomposition spec must close hard limit in single sprint (lesson from Sprint 2a→2a.1 split).

### Process Changes (⚓ DECISIONS.md)
- **Kickoff interview before spec** for feature/refactor/unclear-bugfix — closed-question batches via `ask_user_input_v0`, answers fixed in spec §0.5 as source of truth. Adapted from Claude Code `/feature-dev` pattern.
- **Prototype-first for large UX sprints** — spec for prototype on 2–3 surfaces → Code implements → Igor reviews on live components → only then full UX sprint spec.
- **`.claude/skills/*`** added to Chat write zone (was previously Code-only).

### Tests
- 738 → **822 Vitest** (no regressions; UX-1 prototype +7).
- 112 pytest unchanged.

### Files Added
- `gui/designer/src/components/FragmentEditor/` (8 files)
- `gui/designer/src/components/CanvasBlocksView.jsx` (UX-1 prototype fork)
- `docs/UX_1_PROTOTYPE_REVIEW.md`

### Files Removed
- `gui/designer/src/components/FragmentEditor.jsx` (72 KB single file, replaced by package)

---

## [0.5.0-alpha] — 2026-04-22 — Unified Editor & Per-Fragment Topology

### Added
- **Unified Editor** (Sprint 1.7 K10) — tabs «Sequence/Protein» removed in favor of mode switcher (Edit/Mutagenesis) + sequence primary (DNA + AA under each codon) + 3 collapsible panels (Annotations / Mutations / Protein). Mode-dependent AA clicks: default cursor in Edit, mutation menu in Mutagenesis.
- **Virtual Full Sequence** (Sprint 1.7 K11) — toggle «Fragment N bp / Full gene M bp» in Editor header for split-group sub-fragments. Full-view: read-only sequence + «Virtual view» banner + `highlightRegion` on current sub.
- **Per-fragment `fragment.topology`** (Sprint 1.7 K12, ⚓ DECISIONS.md) — persisted as `linear|circular`. Header toggle 📏 Linear / ⭕ Circular + PartBlock context menu. Single-circular gets self-closure indicator (⟲ closure) and +30 bp PCR display; split-group sub's all `linear`.
- **`expectedJunctionCount(fragments)`** as junction-validation source of truth (⚓ DECISIONS.md): single-circular = 0 (self-closure via primer tails, separate junction object deferred to v1.1), N linear = N−1, N circular = N.

### Changed
- **Mutation highlights numerical comparison** (Sprint 1.7 K9) — `isMutated` switched from substring match on `label` to numerical `codonStart`/`position` (V15 fix); `computeMutationHighlights` accounts for `fragment.templateStart` (V16 fix); deletion mapping no longer drifts after indel.
- **Tests proportionate to code** (⚓ DECISIONS.md) — TDD-first for biological algorithms, state slices, data-model invariants; UX components get happy path + 1–2 edge cases (target growth: code/test ≤ 1:2).

### Fixed
- **V15 SUBSTRING-MATCH-FALSE-POSITIVES** — mutation labels matched by substring caused false highlights on unrelated AA positions.
- **V16 IGNORED-TEMPLATE-START** — `computeMutationHighlights` didn't account for `fragment.templateStart > 0` in sub-fragments.
- **V17 DECORATIVE-JUNCTION-AT-SINGLE-LINEAR** — single-linear no longer renders decorative 30-bp junction on the right.

### Tests
- 700 → **738 Vitest** (+38).

---

## [0.4.1-alpha] — 2026-04-21 — Mutagenesis UX v2 & Map Workspace

### Added
- **PlasmidWorkspace** vertical split (Sprint Map-WS-1) — `PlasmidMap` + `SequencePane` (read-only) with resizable splitter (`localStorage 'plasmid-workspace-bottom-h'`), `selectedRegionId` as synced cursor between map and sequence. `buildPlasmidSequence(fragments)` helper.
- **`feature-palette.js`** (Sprint Map-WS-1-fix, ⚓ DECISIONS.md) — canonical color contract for 15 region families + `FEATURE_STROKE` warm-dark-brown `#3A2F1F`. Normalizer `featureColor(type, name?)` with CDS→{resistance, reporter, his, tag, linker} refine, GenBank-aliases. Used by `PlasmidMap` sub-arcs and `SequencePane` region backgrounds.
- **Responsive `charsPerLine`** in `SequencePane` (Sprint Map-WS-1-fix-B K4.5) — `ResizeObserver` with clamp `[60, 120]` step 10. Default 80 for GenBank-habit-compat.
- **`getRegions(annotations)` deterministic id-backfill** (Sprint Map-WS-1-fix-B K4.1, ⚓ DECISIONS.md) — `id = region:${start}:${end}:${type}:${name}` for annotations without id (catalog whole-plasmid imports). Read-path normalize as safety net for legacy `.bodgegene` projects; write-path `crypto.randomUUID()` migration deferred to v1.0.
- **Mutagenesis UX v2.1** (Sprint 1.6) — split-group canvas containers with shared `splitGroupId`/`splitGroupParentName`/`splitGroupIndex`/`splitGroupTotal`, biology-aware annotation trimming for sub-fragments (`trimAnnotationsForSubFragment`), per-nt and per-codon mutation highlights via `computeMutationHighlights`.
- **Top-level mode switcher** in FragmentEditor (V12 Sprint 1.5, partial pre-Unified-Editor) — radio Edit/Mutagenesis above tabs, with mutation-handling guards.

### Changed (⚓ DECISIONS.md)
- **`resetJunctionForType(j, newType)`** — single source of junction-state cleanup; 7 call-sites now route through helper. GG default = `BsaI`, ligation/re_ligation mirror `reEnzyme`→`enzyme`.
- **`computeMutagenesisStrategy` as single source of truth** for both UX paths (Wizard + FragmentEditor in-place). Replaces legacy `designInlineKLDPrimers`.
- **`chooseStrategy` accepts `fragmentContext`** (V14 Sprint 1.5) — KLD only when `topology === 'circular' && isStandalone === true`. Linear or non-standalone fragments always go through two/multi_fragment overlap PCR.
- **`junction.overlapSequence` contract extension** for `local-primer-design.js` — split-mode tail prioritizes explicit overlap sequence over WT-flanks.
- **No-PCR guard for two/multi_fragment mutagenesis** — `needsAmplification === false` + two/multi split = blocked with `apiWarning`. KLD on No-PCR fragments allowed.

### Fixed
- **V11 KLD-PRIMERS-ZERO-TM** — `makeKLDStrategy` returned hardcoded `{tmBinding: 0, tmFull: 0, gcPercent: 0}`, breaking `annealTemp`.
- **V13 PLASMIDVIEWER-MUTATE-LOST-TEMPLATE** — `🔄 Mutagenesis` from PlasmidViewer footer didn't carry plasmid context to MutagenesisWizard.
- **V14 MUTAGENESIS-STRATEGY-CONTEXT-BLIND** — `chooseStrategy` didn't consider fragment's topology/standalone status; linear two_fragment cases incorrectly chose KLD.
- **K5 PROTEIN-READONLY-IN-EDIT** (Sprint 1.6) — Protein tab in `mode='edit'` switched to read-only with → Mutagenesis button.
- **K6 SPLIT-ANNOTATIONS-BIOLOGY** (Sprint 1.6) — coordinate-only annotation map+filter replaced by `trimAnnotationsForSubFragment` with biological rules per annotation type (signal_peptide drop on partial overlap, CDS rename with trimmed-suffix, etc.).
- **K7 SPLIT-GROUP-CANVAS** (Sprint 1.6) — split-fragments get visual grouping container with dashed purple frame, tinted background, badge «parent (split: N parts)».
- **K8 MUTATION-HIGHLIGHTS** (Sprint 1.6) — `computeMutationHighlights(fragment, parent)` exported, primary via `sequenceDiff` against parent-part with mutations fallback list.
- **Map-WS-1-fix-B K4.4** — labels and directional markers on `PlasmidMap` migrated from `fill: '#fff'` to `FEATURE_STROKE`; `textShadow` removed (pastel + warm-dark already contrasts).

### Tests
- 637 → **774 Vitest** (+137 across Sprints 1.5/1.6/Map-WS-1 cycle).

### Files Added
- `gui/designer/src/components/PlasmidWorkspace.jsx`
- `gui/designer/src/components/SequencePane.jsx`
- `gui/designer/src/feature-palette.js`
- `gui/designer/src/lib/split-annotations.js`
- `gui/designer/src/lib/junction-utils.js` (`resetJunctionForType` helper)

---

## [0.4.0-alpha] — 2026-04-20 — Mutagenesis Pipeline

### Added
- **Mutagenesis with full primer design** (Sprint 1) — KLD + two-fragment + multi-fragment strategies with project-prefixed primer names (`<prefix>NNN_mut_<dir>_<template>`) and complete protocol steps (PCR → DpnI → KLD → Transform → Screening → Sequencing for KLD; PCR parts → Overlap PCR → Transform → … for split). Both UX paths (Wizard + FragmentEditor in-place) now generate primers correctly.
- **`buildMutagenesisPayload(result, ctx)`** — pure helper translating `computeMutagenesisStrategy` result to project-prefixed primers + `protocolSteps` + `apiWarnings`.
- **`mutagenesis-payload.js`** module (V4-helper).
- **MutagenesisWizard sanitize-at-entry** (MUTWIZ-SANITIZE) — replaced 2 legacy inline regexes with central `sanitizeSequence`; full IUPAC alphabet preserved (NNK/NNN/MNN/NDT saturation codons, R/Y/S/W/K/M/B/D/H/V ambiguity).

### Fixed
- **V3 JUNCTION-STALE-RE** — junction type switching now resets enzyme/overhang fields of previous type via `resetJunctionForType`. 6 call-sites in `JunctionBlock.jsx`.
- **V3-bulk** — `App.jsx:460` bulk-switch to GG had same stale-state problem; fixed via same helper.
- **V4 MUTAGEN-NO-PRIMERS** (5 sub-fixes) — core mutagenesis workflow broken in both UX paths; full pipeline rebuilt:
  - V4-A: `App.jsx` auto-design useEffect won't overwrite mutagenesis primers (`isMutagenesis` guard).
  - V4-wizard: `MutagenesisWizard::onComplete` payload carries strategy/primers/protocol/warnings.
  - V4-overlap: `local-primer-design.js::overlapTail` prioritizes `junction.overlapSequence` for mutation-in-overlap.
  - V4-inplace: `handleSaveFragment` rewritten to dispatch by strategy (KLD inline replace, two/multi fragment splice).
- **V5 ANNOTATION-BAR-CONTRAST** — `getTextColor(bgHex)` luminance-aware text color in `AnnotationEditor` (WCAG threshold 0.55, fallback white on malformed hex).

### Tests
- 604 → **637 Vitest** (+33 across Sprint 1 + MUTWIZ-SANITIZE).

---

## [0.3.0-alpha] — 2026-04-18 — Sanitize-at-Entry Contract & Annotation Type-Map

### Added
- **Central `sanitizeSequence()`** in `sequence-utils.js` (Этап 1.1, ⚓ DECISIONS.md) — single point of DNA sanitization at 9 entry points (paste, file import, API response, GenBank parser, FASTA parser, AddFragmentModal, FragmentEditor, PlasmidUseWizard, SequenceEditor). Inline workarounds removed from `local-primer-design.js` and `PlasmidViewer.jsx`. Canonical IUPAC order `ATGCNRYSWKMBDHV`.
- **Exported `IUPAC_DNA_REGEX` / `IUPAC_DNA_CHAR_REGEX`** — anti-drift mechanism for cursor synchronization in `AddFragmentModal`.
- **`normalizeGeneType(feat)`** in `import-annotations.js` (Этап 1.2, ⚓ DECISIONS.md) — gene semantics from qualifiers (`/ncRNA_class` → ncRNA; `/product` matches → tRNA/rRNA), not free-text `/note` heuristics.
- **New region types**: `oriT` (≠ `rep_origin`, biologically distinct — conjugation vs replication, ⚓ DECISIONS.md), `mRNA`, `tRNA`, `rRNA`, `ncRNA`, `misc_RNA`, `mobile_element`, `D-loop`, `repeat_region`. `ANNOTATION_COLORS` extended with 14 new keys.

### Changed
- **TYPE_MAP semantics** — removed problematic mappings (`mat_peptide`/`domain`/`region` → `catalytic` etc.); identity preserved instead. New: `CAAT_signal`/`GC_signal` → `core_promoter`, `polyA_site` → `poly_a`, `unsure`. `extractColor` accounts for `ApEinfo_revcolor` on strand=−1.
- **`GENE_CHILD_TYPES`** expanded to all RNA/CDS children for gene-filter; `EXON_BEARING_TYPES` (CDS+gene+mRNA) for intron extraction.
- **Store v6→v7 migration** — sanitizes legacy data on load.
- **Backend `snapgene_parser.py`** — `_TYPE_MAP['gene'] = 'gene'`.

### Known Limitations
- Legacy annotations with type `catalytic` (from before Этап 1.2) are not auto-migrated — source INSDC type is lost. Re-import `.gb`/`.dna` to refresh types. Render doesn't break (`ANNOTATION_COLORS.catalytic` exists).

### Tests
- 576 → **604 Vitest** (+28 sanitize/typemap, including `import-annotations-typemap.test.js`).

---

## [0.2.6-alpha] — 2026-04-03 — UX Polish, Restriction Cloning, SnapGene Catalog

This release covers a single-day intensive series of blocks 4b–11b.

### Added
- **Restriction Cloning** (Block 4b, ⚓ DECISIONS.md) — 3-step wizard (enzymes → insert → preview), Junction Sequence Preview with color-coded backbone/RE-site/insert, reading frame check, RE tails on primers (protective bases + site). New: `digest()`, `checkDoubleDigest()`, `checkInsertSites()`, `checkReadingFrame()`, `generateRETail()`. Three modes: linearize / excise same enzyme / excise two enzymes.
- **`autoAdjustJunctions()` ligation guard** (⚓ DECISIONS.md) — `if (j.type === 'ligation' || j.type === 're_ligation') return`. Prevents ligation → overlap auto-switch.
- **N+N + ligation = valid assembly** (⚓ DECISIONS.md) — two fragments without PCR + ligation junction is a valid digest+ligate operation. Warning «overlap impossible» gated on `junc.type === 'overlap'`.
- **Quick Start panel** (Block 5) — empty canvas shows 7 workflow actions + SnapGene Catalog entry.
- **Smart Import** (Block 5) — `ImportDecisionModal` chooses action on file drop.
- **`ImportPrompt`** (Block 5) — «Import vector» prompt for empty parts library in restriction/mutagenesis flows.
- **SnapGene Catalog** (Block 8) — 2822 plasmids, 19 categories, lazy-loaded. `plasmids-index.json` (~867 KB) without sequences + `plasmids-data/*.json` per category. Search by name/feature, filter by category. Footer actions: To library / View / Clone / As backbone. Attribution: snapgene.com/resources.
- **`common-features.json`** — 415 verified features extracted from 2822 SnapGene files (correct AmpR/CmR/KanR sequences) for enrichment pipeline.
- **First-time User Flow** (Block 9) — onboarding sequence.
- **Project Flow Phase 2** (TASK_FLOW_PHASE2_3, archived 2026-04-26) — 5 node types (PlasmidNode, PCRNode, AssemblyNode, OligoNode, CheckpointNode), 3 edge types, dagre layout, MIRO+ panel with RE/KLD/ligation operations.
- **PlasmidViewer enhancements** (Block 10/10b/10c/10d) — single-plasmid rendering (`mapFragments = [{whole plasmid}]`, ⚓ DECISIONS.md), `onSelectRegion` callback, sequence sanitize for first nt (strip BOM/null), footer action buttons (🔪 Clone / ⚗️ As backbone / 🔄 Mutagenesis / 🧬 cDNA / GenBank), preset-mode instant actions («As backbone» → canvas without menu), RE sites toggle (1× / ≤2× / All), CDS validation warnings.
- **Track-based arc layout** for circular map (Block 10) — features on tracks via `assignSubTracks()` (max 4 tracks), no overlapping.

### Fixed (selection)
- **CRIT-1** — DNA insert/delete in FragmentEditor now shifts annotations correctly.
- **CRIT-2** — `autoAnnotate()` reruns after mutations (useEffect 500 ms debounce).
- **CRIT-4** — `flipFragment` in GG re-runs `autoDesignGGOverhangs()` + emits `apiWarning`.
- **HIGH-1** — `flipFragment` inverts annotation strand.
- **P1, P3b** — root cause fixes for primer-recompute issues (Block 11b).
- **P2/P3/P4/P5** — Block 11 bugfix series.

Full list of fixes — `docs/archive/BUGS_HISTORY.md` (sections «Block 4b» through «Block 11b»).

### Tests
- ~480 Vitest, ~80 pytest (estimated; Python backend tests added during these blocks).

---

## [0.2.0] — 2026-03-28 — Architecture Overhaul

### Architecture (Audit Implementation)
- **Zustand v5 migration** — replaced 1350-line App.jsx monolith with 5 domain slices:
  - `store/projectSlice.js` — projects, assemblies, active selection
  - `store/fragmentSlice.js` — fragments CRUD, parts library
  - `store/junctionSlice.js` — junctions, Golden Gate overhangs, auto-adjust
  - `store/primerSlice.js` — assembly/custom primers, polymerase settings
  - `store/uiSlice.js` — modals, tabs, expert mode, strategy
  - `store/index.js` — combined store with persist, devtools, immer middleware
- **React Compiler v1.0** — `babel-plugin-react-compiler` for automatic memoization
- **Prefix sum selector** — `usePrefixSums()` for O(1) primer coordinate transforms
- **SantaLucia 1998 NN Tm calculator** — `tm-calculator.js` replaces Wallace rule (±1-2°C vs ±5°C)
  - Owczarzy 2008 Mg2+ correction
  - Hairpin and homodimer detection
  - GC% utility
- **primer3-py optional integration** — hairpin/dimer/heterodimer analysis on Python backend
- **192 frontend tests** — Vitest + happy-dom covering Tm, codons, Golden Gate, mutagenesis, validation
- **tatapov dependency** — Potapov 2018 fidelity data for Golden Gate overhang design (pyproject.toml)

### Files Changed (Architecture)
- `gui/designer/vite.config.js` — React Compiler + Vitest config
- `gui/designer/package.json` — zustand, immer, babel-plugin-react-compiler, happy-dom, @testing-library
- `gui/designer/src/store/` — NEW: 6 files (index + 5 slices)
- `gui/designer/src/App.jsx` — 1350→982 lines, useState→useStore
- `gui/designer/src/tm-calculator.js` — NEW: SantaLucia 1998 NN model
- `gui/designer/src/__tests__/tm-calculator.test.js` — NEW: 14 tests
- `gui/designer/src/__tests__/golden-gate.test.js` — NEW: 12 tests
- `gui/designer/src/__tests__/codons.test.js` — NEW: 10 tests
- `gui/designer/src/__tests__/mutagenesis.test.js` — NEW: 10 tests
- `gui/designer/src/__tests__/validate.test.js` — NEW: 8 tests
- `src/pvcs/utils.py` — primer3-py optional hairpin/dimer analysis
- `pyproject.toml` — primer3-py, tatapov optional dependencies
- `docs/AUDIT_RU.md` — NEW: architecture audit (Russian)
- `docs/ARCHITECTURE_v2.md` — NEW: data model specification

---

## [0.1.0] — 2026-03-25..27 — Feature Sprint

### Multi-Project Support
- `ProjectBar` — dropdown project switcher, create/rename/delete projects
- Multi-project localStorage with migration from old format
- `DataManager` — export/import: full backup, projects, primers, parts (JSON)

### Assembly & Golden Gate
- Configurable assembly strategy: Auto / All-at-once / 3 parts / 2 parts
- Efficiency indicator per strategy (green/amber/red)
- Visual junction type coding on canvas: overlap(blue), GG(green), RE(orange), KLD(purple)
- Golden Gate enzyme database: BsaI, BpiI, BsmBI, BtgZI, SapI
- Auto-extract overhangs from junction sequences
- Overhang validation: palindromes, duplicates, RC conflicts, GC extremes
- Internal enzyme site detection with alternative suggestions
- 32 orthogonal pre-validated overhangs for identical fragments
- Auto-force GG for identical adjacent fragments
- PCR deduplication for identical fragments (1 reaction for N copies)
- Per-junction method selector (visual buttons: Overlap / GG / RE / KLD)
- KLD junction type with NEB #M0554 protocol (no phosphorylation needed)

### Mutagenesis
- Inline mutagenesis from FragmentEditor — click AA → substitution popup
- 20 amino acids × 2-4 biochemically motivated substitutions each
- Minimal nucleotide changes: `chooseMutantCodon()` selects closest codon
- Multi-AA selection (Shift+click) for range mutations / Ala scan
- Inline codon editing: click → input, Tab → next codon, AA auto-updates
- KLD primer auto-design around mutation site
- KLD protocol auto-generation (inverse PCR → KLD → transformation)
- Mutations create child variants in Parts Library (never overwrite original)

### Part Versioning
- Parent/child variant tree with `parentId` linking
- `detectModification()` — auto-detect truncation/deletion/mutation/insertion
- Variant badge on PartBlock with popup showing all family members
- Test results per variant (active/inactive/reduced/enhanced + % activity)
- Expandable part cards in PartsPalette showing variants, assemblies, inventory

### Protocol Tracker
- Staged protocol layout (numbered stages with progress tracking)
- Junction-type-aware protocol: PCR → Overlap → GG → RE → KLD → Transform
- GoldenGateContent, KLDContent, REContent — specialized protocol cards
- Timeline summary: stages, steps, estimated days, progress bar
- Assembly mix calculator from measured concentrations

### Three View Modes
- Canvas toggle: 📦 Blocks (Ctrl+1) / 🧬 Sequence (Ctrl+2) / ⭕ Map (Ctrl+3)
- SequenceMapView (SnapGene-like): double-strand DNA + annotations + primers
- Amino acid translation under CDS regions in Sequence View
- Primer tracks with category-aware styling (assembly/custom/verification)
- Selection info bar: position, length, Tm, GC%, primer creation buttons
- Keyboard shortcuts: P (fwd primer), R (rev primer), Ctrl+C, ? (help)

### Three Primer Categories
- `assembly[]` — auto-generated, overwritten on recalculate
- `custom[]` — user-created in Sequence View, preserved across recalculations
- `verification[]` — colony PCR + sequencing (placeholder)
- Category-aware display: colored dots in PrimerPanel, styled tracks in SequenceView

### Student/Expert Mode
- Progressive disclosure toggle in header
- Welcome screen on first launch
- Student mode hides: Golden Gate, mutagenesis, oligos, polymerase selector, protocol/stats tabs, split/edit buttons, junction config
- Subtle upgrade hints: "🎓 Базовые элементы. Показать все →"

### SBOL Glyphs & Parts Library
- 27 SBOL Visual 3.0 glyphs (CDS, promoter, terminator, RBS, operator, enhancer, restriction, recombination, tag, NLS, linker, domain, transmembrane, intron, polyA, ncRNA, aptamer, spacer, scar, overhang, plasmid, primer_bind, insulator, marker, signal, origin, misc)
- Asymmetric terminator glyph (shows direction correctly when flipped)
- Custom part types with name + color + glyph selection
- Glyphs in parts library list, filter buttons, and detail panel
- Expandable part cards: variants, assemblies containing part, actions

### Color System
- Dropdown color palette for fragments and domains (18 standard + user colors)
- Live sync: color changes instantly reflected on canvas
- User color persistence in localStorage
- Replace-in-place editing of user palette colors

### UI Improvements
- Non-CDS fragments: numbered sequence display (60bp lines, 10-char blocks)
- Numbered amino acid lines on Белок tab (50 AA/line, gaps every 10)
- Mutation popup via portal (positioned near click, not stuck to top)
- Compact canvas for >12 fragments (smaller blocks, hidden primers/PCR size)

### Bug Fixes
- `CODON_TABLE` missing import in mutagenesis.js → white screen crash
- `gcPercent('')` → NaN (division by zero)
- Duplicate primers for identical fragments (10 copies = 20 identical primers)
- Mutation overwrites original Part instead of creating child variant
- Color palette: all circles same color (React onChange fires on every drag)
- Color palette: user colors not saved (useMemo with [] deps)
- Junction popup clipped by overflow (portal rendering)
- Terminator glyph symmetric (doesn't show direction)

### Files Added
- `gui/designer/src/golden-gate.js` — enzyme DB, overhang design, validation
- `gui/designer/src/part-variants.js` — variant detection, family collection
- `gui/designer/src/tm-calculator.js` — SantaLucia 1998 NN Tm
- `gui/designer/src/components/SequenceMapView.jsx` — SnapGene-like view
- `gui/designer/src/components/DataManager.jsx` — export/import modal
- `gui/designer/src/store/` — Zustand store (6 files)
- `docs/AUDIT_RU.md` — architecture audit
- `docs/ARCHITECTURE_v2.md` — data model specification
- `docs/ROADMAP_v2.md` — development roadmap

### Files Modified (Major)
- `gui/designer/src/App.jsx` — Zustand migration, all features
- `gui/designer/src/components/FragmentEditor.jsx` — mutagenesis, color picker, codon editing
- `gui/designer/src/components/PartBlock.jsx` — variant badge, compact mode, junction coding
- `gui/designer/src/components/JunctionBlock.jsx` — 4 junction types, GG overhangs, identical detection
- `gui/designer/src/components/PartsPalette.jsx` — expandable cards, student mode
- `gui/designer/src/components/PartsLibrary.jsx` — custom types, glyphs, test results
- `gui/designer/src/components/DesignCanvas.jsx` — 3 view modes, keyboard shortcuts
- `gui/designer/src/components/ProtocolTracker.jsx` — staged layout, junction-aware
- `gui/designer/src/components/PrimerPanel.jsx` — 3 categories, delete custom
- `gui/designer/src/components/ExperimentSelector.jsx` — multi-project dropdown
- `gui/designer/src/sbol-glyphs.jsx` — 20 new glyphs (7→27 total)
- `gui/designer/src/mutagenesis.js` — inline mutagenesis, common substitutions
- `gui/designer/src/validate.js` — identical fragment detection, grouping
- `gui/designer/src/exports.js` — data export/import functions
- `src/pvcs/utils.py` — primer3-py optional integration
- `pyproject.toml` — optional dependencies
