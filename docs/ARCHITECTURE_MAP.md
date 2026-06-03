# BodgeGene — Architecture Map

Auto-generated structural map of the BodgeGene frontend (visual plasmid designer; React SPA + Python CLI backend). Derived from static import-graph cluster analysis.

**Graph at a glance:** 462 modules, 973 imports, 47 clusters. This document covers the major clusters; the import graph is dominated by a small set of hubs.

**Top hub modules (by inbound import count):**

| Module | Importers | Role |
|--------|-----------|------|
| `lib/strings.js` | 84 | Centralised UI string dictionary (all user-facing EN text) |
| `store/index.js` | 73 | Zustand store composition root — the single `useStore` hook |
| `sequence-utils.js` | 32 | DNA sanitize / complement / reverseComplement |
| `components/CanvasSkeleton/store/skeleton-context.jsx` | 23 | Canvas workbench isolated state layer |
| `annotation-model.js` | 17 | Three-level annotation schema + selectors |
| `restriction-db.js` | 17 | 63 Type II RE database + digest pipeline |
| `codons.js` | 15 | Codon table + translation / optimization |
| `tm-calculator.js` | 13 | SantaLucia NN Tm |

Two architectural facts shape everything below: (1) the **domain engine is framework-independent** — sequence/annotation/primer/enzyme logic lives in plain-JS root modules that never touch React (except `App.jsx`); (2) **state is split between one global Zustand store and one isolated `useReducer` island** (CanvasSkeleton), which is a deliberate decision (DEC-SKELETON-01) and the source of most cross-boundary coupling.

---

### root — domain engine + app bootstrap

The framework-independent biological logic layer plus the React entry point that wires everything together.

**Purpose:** Provides all domain-specific, UI-agnostic logic — DNA manipulation, file parsing (GenBank/FASTA/.dna), the three-level annotation model, thermodynamic primer design, construct validation, restriction and Golden Gate enzyme databases, mutagenesis, ORF/feature detection, and export. `App.jsx` + `main.jsx` are the only React-aware members; they hydrate the store and mount every UI subsystem.

| File | Role |
|------|------|
| `App.jsx` | Application root — mounts the shell, wires hotkeys, handles file open/save/drop, bootstraps the store (hydrate projects/library/common-features), routes overlays, renders Sidebar + AppShell |
| `sequence-utils.js` | Single source of truth for DNA sanitize, IUPAC complement table, `reverseComplement`, `isValidDNA`, `sanitizeWithReport` |
| `annotation-model.js` | Canonical region/detail/point schema, `PREDICTOR_SOURCES`, `REGION_RENDER_RULES`, selectors (`getRegions`/`getDetails`/`getPoints`/`isPredicted`) |
| `local-primer-design.js` | Client-side primer engine for overlap/GG/KLD/RE — Tm-driven binding search, tag-aware extension, tail generation; no backend |
| `restriction-db.js` | 63 Type II REs with `digest()`, `checkDoubleDigest()`, `generateRETail()` — the RE cloning backbone |
| `file-import.js` | Unified import pipeline — `parseFile()` (sync), `enrichAnnotations()` (async auto-annotate + common-feature homology) |
| `validate.js` | Construct/primer validation — CDS frame checks, junction-end compatibility, overlap/GG/RE site validation |
| `auto-annotate.js` | Region-aware auto-annotation — CDS sub-elements (start/stop, His/protein tags), promoter/terminator structural elements |

**Responsibilities:** DNA sanitize/complement/RC with full IUPAC support; GenBank/FASTA/.dna parsing (binary via backend proxy); three-level annotation model + selectors; client-side primer design; strictly-separated RE (63) and Golden Gate (5 Type IIS) enzyme DBs; construct/junction validation; auto-annotation + common-feature homology enrichment; mutagenesis strategy selection; ORF/structural feature prediction (σ70 PWM, stem-loop, sgRNA scaffold); GenBank + protocol export; app bootstrap (store hydration, hotkey registration, drop routing, PWA); theme tokens (Okabe-Ito) and codon tables for 5 organisms.

**Depends on:** `lib` (9 — strings, hotkeys, bodge-zip, file-system, pwa-install, ids, feature-match-core, …), `components/StartScreen` (4), `store` (2), `components/Dag` (2), `components/AppShell` (1).

**Used by:** `components/CanvasSkeleton` (30 — heaviest consumer), `components/Library` (20), `components/SequenceView` (20), `lib` (10 — re-uses domain helpers), `components/PlasmidViewer.jsx` (8), `hooks` (8).

**Risks:**
- `restriction-db.js` is the largest file (37.9 KB / 631 LOC) — within the 40 KB hard limit but any new enzyme pushes it over without decomposition.
- `auto-annotate.js` (19 KB) and `predicted-detection.js` (18.7 KB) approach the 25 KB hard limit for `.js` helpers; rate-of-change risk if annotation detectors keep accruing.
- `App.jsx` mixes bootstrap, hotkeys, file I/O, drop routing, PWA in one component — high coupling to store shape; any slice rename forces edits here.
- `feature-detection.js` is a thin re-export shim over `lib/feature-match-core.js` — two-hop indirection that confuses import tracing and tree-shaking.
- `sequence-utils.js` (imported 10+ times) has no tests for `sanitizeWithReport` edge cases (BOM + IUPAC) — silent corruption risk on exotic paste.
- RE and GG databases are separated by file but both imported into `validate.js` and `local-primer-design.js`; no runtime guard enforces the strict-separation invariant.
- No barrel/index export — 40+ files imported individually by path, so moving a helper is a multi-file find-and-replace.

---

### store — Zustand + Immer monolith (7 slices)

Single source of truth for all app-wide mutable state, composed from 7 flat slices into one `useStore` hook.

**Purpose:** Every component subscribes to the one `useStore`. Slices are spread into a single Immer-wrapped Zustand store (`index.js`) so cross-slice reads are zero-cost (no event bus). Persists to IndexedDB (Dexie) via async actions baked into each slice; UI preferences persist to localStorage.

| File | Role |
|------|------|
| `store/index.js` | Composition root — `create(immer(...))`, spreads all 7 slices, re-exports selectors, exports `bootstrapStore`. **73 importers — most-imported file in the codebase** |
| `store/librarySlice.js` | Largest slice (43.8 KB). Flat `libraryEntries` dict; CRUD + soft-delete, bulk atomic import, onboarding loader, copy-on-write versioning, manual-edit branching, zone-aware moves, folder mgmt, dedup, selectors. Immediate Dexie writes |
| `store/projectSlice.js` | (26.9 KB) `projects` dict, `currentProjectId`, recent/pinned, file-handle metadata, autosave (2 s debounce), multi-tab lock, DAG sub-model (positions/edges/viewport) |
| `store/uiSlice.js` | (18.1 KB) theme, agent identity, importer mode, display settings, SequenceView render options — all to localStorage. Re-exports annotatorSlice for back-compat |
| `store/annotatorSlice.js` | (12.4 KB) Annotator panel state (open/scope/plugins/results/accepted/rejected/pendingEdits). Split out of uiSlice to stay under budget |
| `store/workspaceSlice.js` | (3.2 KB) top-level router — `workspace.active` (startup/library/construct/flow/importer/mix) + capped history |
| `store/canvasSlice.js` | (3.5 KB) `canvas.activeFullscreen` + `navStack`; persists top entry to localStorage; `FULLSCREENS` enum |
| `store/commonFeaturesSlice.js` | (9.9 KB) user overlay for common-features DB (net-new + field overrides), merged-cache invalidation, debounced (400 ms) Dexie writes. **Imports `useStore` from index.js — circular** |

**Responsibilities:** the single `useStore` for 215+ files; project persistence via debounced autosave; library entry lifecycle (import/dedup/soft-delete/versioning/branching/zones/folders); multi-tab locking via BroadcastChannel; top-level workspace + canvas-overlay routing; preference persistence to localStorage; annotator session state; user-editable common-features overlay; app bootstrap (wipe v0.5 legacy, apply theme).

**Depends on:** `db/dexie-schema`, `lib/storage`, `lib/v05-cleanup`, `lib/multi-tab-lock`, `lib/ids`, several `components/Library/lib/*` helpers (compute-suggested-name, resource-hash, library-sequence-edit, folder-tree), `feature-detection` (loadFeatureDB), `lib/feature-dedup`.

**Used by:** `components/Library` (26), `components/CanvasSkeleton` (13), `components/Annotator` (6), `components/Dag` (5), `components/SequenceView` (5), `components/StartScreen` (4), and effectively all components (339 import occurrences across 215 files).

**Risks:**
- **SIZE:** `librarySlice.js` at 43.8 KB vs a 25 KB hard budget — well into Active decomp territory. Grew across M-X.3→M-X.7a; bundles CRUD, bulk import, onboarding, versioning, branching, zone/folder ops, and selectors.
- **CIRCULAR DEPENDENCY:** `commonFeaturesSlice.js` ↔ `index.js`. Works because Zustand `create()` runs after all factories are defined, but fragile to module-evaluation-order changes.
- **COUPLING:** single flat Immer draft — a slice misspelling a key (e.g. setting `state.libraryEntries` from projectSlice) silently corrupts sibling state with no type safety.
- **TECH DEBT:** `projectSlice` mutates `state.canvas.*` directly inside its Immer mutations, breaking the slice boundary and scattering canvas-routing logic across two files.
- **SIZE:** `uiSlice.js` (18.1 KB) is in the soft zone; already triggered one extraction (annotatorSlice) and will likely need a second split.

---

### AppShell — content-area frame + workspace router

Thin `<main>` wrapper that switches between Library, DAG, and the legacy Importer via `store.workspace.active`.

**Purpose:** Top-level content region. Renders either an explicit overlay child passed from `App.jsx` (container window, multiTabBlocked) or delegates to `WorkspaceRouter`, which lazily mounts the correct heavy workspace. **`Topbar` and `NavRail` are dead modules** — no longer imported anywhere; `App.jsx` now owns the Sidebar outside this component.

| File | Role |
|------|------|
| `components/AppShell/index.jsx` | Active entry point — default `AppShell` (flex `<main>`) + named `WorkspaceRouter` (lazy switcher driven by `store.workspace.active`). The only imported file |
| `components/AppShell/NavRail.jsx` | DEPRECATED dead code — 56 px icon rail (M-X.7a K5). Scheduled for deletion |
| `components/AppShell/Topbar.jsx` | DEPRECATED dead code — header bar (back-nav, project name/dirty-dot, save flash, settings, ThemeToggle, HotkeyCheatsheet). Superseded by Sidebar |
| `store/workspaceSlice.js` | Owns `workspace.active`, `workspace.history` (capped 10), `workspace.context` + selectors |

**Responsibilities:** route the content area by `store.workspace.active`; lazy-load heavy workspace bundles (LibraryWorkspace, DagWorkspace, Importer) so the shell paint stays cheap; show a placeholder spinner during Suspense and stubs for unimplemented workspaces; accept overlay children from `App.jsx`; preserve the `app-shell` testid.

**Depends on:** `store/index.js`, `store/workspaceSlice.js`, `lib/strings.js` (dead path), `lib/hotkeys.js` (dead path), `components/Library/LibraryWorkspace` + `Library/index.jsx` (lazy), `components/Dag/DagWorkspace` (lazy), `ThemeToggle.jsx` + `HotkeyCheatsheet.jsx` (deprecated Topbar only).

**Used by:** `App.jsx` (sole active consumer).

**Risks:**
- Dead-code accumulation: `Topbar.jsx` (241 LOC) + `NavRail.jsx` (123 LOC) = 364 of the cluster's 484 LOC, never imported — they mislead readers until the promised deletion lands.
- Two overlapping routing layers: `AppShell` routes via `store.workspace.active`, but `App.jsx` also has a `canvas.activeFullscreen` layer above it — confusion about which controls what.
- Stub workspaces (startup/mix/construct) render placeholder text with no error boundary — a mis-navigation silently shows an empty panel.
- Importer entry preserved only for "power users" (DEC-IMP-06) with no deprecation timeline.

---

### StartScreen — home/dashboard surface

App entry surface when no project canvas is active: project list, sidebar nav, file drop zone, help popover.

**Purpose:** Renders a collapsible sidebar (nav, file I/O, theme, pinned projects) plus a dashboard showing real recent projects from the store with search/tag filtering, create/open CTAs, an onboarding banner when the library is empty, and a help popover. Also handles full-screen drag-and-drop of sequence files and `.bodge` archives.

| File | Role |
|------|------|
| `components/StartScreen/StartScreen.jsx` | Root wrapper — drop zone, routes `.bodge`/sequence files to store actions, drag overlay |
| `components/StartScreen/MainPanel.jsx` | Dashboard — live recent-projects list (sorted by updatedAt), search, tag pills, row click → `pushFullscreen` to canvasSkeleton, pin/unpin, empty state, HelpPopover, onboarding banner |
| `components/StartScreen/Sidebar.jsx` | **App-wide nav shell (mounted in App.jsx, not inside StartScreen)** — create/open-bodge/import, Home/Library/All-Projects, pinned section, theme, settings, PWA install, version |
| `components/StartScreen/RecentRow.jsx` | Memoised project card — deterministic ring SVG from id hash, tag chips, time-ago, pin star |
| `components/StartScreen/HelpPopover.jsx` | Modal with 4 tabs (Guide/Hotkeys/Glossary/Hidden-features); Esc/outside dismiss |
| `components/StartScreen/hooks/useSidebarCollapsed.js` | Collapse state machine — localStorage, Ctrl+B, responsive auto-collapse with override guard |
| `components/StartScreen/SidebarItem.jsx` | Reusable sidebar button primitive (primary/active/disabled, tooltip, right-slot) |
| `components/StartScreen/EmptyCard.jsx` | Bottom CTA — `buildStarterSet()` to bulk-add 4 starter vectors |

**Responsibilities:** render home when `activeFullscreen === 'start'`; live recent-projects filtering; drop-handling for sequence files (→ Library bulk import) and `.bodge` (→ `openProjectFromFileData`); primary nav; sidebar file I/O; pinned-projects section (cap 15); collapsible sidebar; 4-tab help with hidden-feature registry; library onboarding banner + starter set; pin/unpin toggle.

**Depends on:** `store/index.js` (large action surface), `lib/bodge-zip.js` (readBodge), `lib/file-system.js`, `lib/strings.js`, `lib/version.js`, `lib/pwa-install.js`, `components/Library/lib/starter-set.js`, `start-screen-data.js` (static mock, mostly vestigial).

**Used by:** `App.jsx` — imports StartScreen, Sidebar, useSidebarCollapsed, StartScreen.css directly; Sidebar is lifted into the App shell app-wide.

**Risks:**
- `Sidebar` is mounted directly by `App.jsx` (not via the cluster index) — a de-facto App-level component living inside StartScreen; misleading ownership, coupling risk if StartScreen is refactored.
- `start-screen-data.js` holds hardcoded `RECENT_PROJECTS` no longer rendered — dead data.
- `MainPanel` calls `useStore.setState()` imperatively in `handleProjectClick`, bypassing the slice abstraction.
- Sidebar uses 15+ ungrouped `useStore` selectors — increased re-render surface.
- HelpPopover "hidden" tab is a hand-maintained registry with no link to code — will drift.
- `EmptyCard` reaches into `components/Library/lib/starter-set.js` — cross-cluster dependency that breaks silently on API change.

---

### components/Dag — project-level container DAG

Fullscreen three-pane workspace: library palette + drag-to-canvas + ReactFlow node graph of plasmid containers with auto-layout.

**Purpose:** The M-C.1 "Container DAG" — browse library plasmids in a searchable palette, preview in a slide-in drawer, arrange them on a ReactFlow canvas as named nodes joined by neutral edges. Node positions, edges, and viewport persist in `Project.dag.*`. Double-click pushes a secondary fullscreen (ContainerWindowPlaceholder, future M-C.2). Self-contained vertical slice: palette → preview → canvas → store.

| File | Role |
|------|------|
| `components/Dag/DagWorkspace.jsx` | Composition root — three-pane split, `previewEntry` state, "Add to canvas" |
| `components/Dag/DagCanvas.jsx` | ReactFlow canvas — derives nodes/edges from store, native HTML5 drop (`application/x-bodgegene-dag-add`), debounced position/viewport sync, auto-layout trigger |
| `components/Dag/Palette/DagPalette.jsx` | 280 px pane — four collapsible groups (thisProject/demo/mine/snapgene), sticky search, persistent open-state, lazy SnapGene loading |
| `components/Dag/Palette/DagPaletteItemRow.jsx` | Palette row — native drag source, inline PlasmidMiniMap, click → onPreview |
| `components/Dag/PlasmidNode.jsx` | ReactFlow custom node (memo) — 280×220 card, MiniMap, meta, ≤4 region badges; double-click → containerWindow |
| `components/Dag/PreviewDrawer.jsx` | 340 px detail drawer — 180×180 MiniMap, region list, add-to-canvas CTA |
| `components/Dag/NeutralEdge.jsx` | Single edge type — smooth-step, accent on select, no markers (typed edges deferred to M-G) |
| `components/Dag/ContainerWindowPlaceholder.jsx` | Drill-in stub for M-C.2 |

**Responsibilities:** render the three-pane DAG; browsable/searchable palette across four sources incl. lazy SnapGene; native-MIME drag-drop onto canvas at drop coords; duplicate-prevention with toast + flash; debounced persistence of positions/edges/viewport; dagre LR auto-layout; container nodes with badges; manual edge create + node/edge delete; drill into per-container view.

**Depends on:** `store/index.js` (DAG actions + fullscreen), `lib/strings.js` (`STRINGS.dag`), `lib/dag-layout.js` (`computeAutoLayout`), `annotation-model.js` (`getRegions`), `feature-palette.js` (`featureColor`), `components/PlasmidMiniMap.jsx`, `components/Library/hooks/useLibrarySources`.

**Used by:** `App.jsx` (eager — 'flow' + 'containerWindow' modes), `components/AppShell/index.jsx` (lazy — `active === 'flow'`).

**Risks:**
- `PlasmidMiniMap` rendered three times per palette row context — heavy SVG repaints; palette list not virtualised, so large groups jank.
- Position debounce (400 ms) closes over stale `nodes` — persisted positions can lag a frame on fast drags.
- `DagWorkspace` reads `useStore.getState()` in an event handler rather than subscribing — could diverge on a slice rename.
- `ContainerWindowPlaceholder` is a stub; M-C.2 must preserve the push/pop fullscreen contract already under test.
- No virtualisation on SnapGene category lists — large categories flush all rows to DOM.
- Palette localStorage keys (`pvcs-dag-palette-group-*`) differ from the Library workspace — a future merge must reconcile namespaces.

---

### CanvasSkeleton — four-tier assembly workbench

Self-contained canvas + editor + operations + zones feature, with isolated `useReducer` state persisted per-project to IndexedDB.

**Purpose:** The entire "canvas workbench" under `/canvas-skeleton`. Implements the four-tier model (containers → pieces → operations → zones), a free-form 2-D layout canvas with Miro-style zone frames, a multi-tab container editor reusing Library inspector sub-tabs, a full assembly editor (segment list, coloured zones, primer writing, realise-to-DAG), and operation adapters (PCR/Cut/Gibson/Golden Gate/KLD/Mutagenesis/Ligate). State lives in an isolated `useReducer` context — **no global Zustand except a single `popFullscreen` on exit** — auto-saved per project with schema-versioned migrations (v1–v12).

| File | Role |
|------|------|
| `components/CanvasSkeleton/index.jsx` | Root — mounts SkeletonProvider, orchestrates header + CanvasArea (Layout/Graph views), EditorOverlay, ToastBridge, DeleteKeyHandler, global Ctrl+Z/Y |
| `components/CanvasSkeleton/store/skeleton-context.jsx` | **State-layer hub (23 cluster imports)** — `useReducer` in Context; exposes `useSkeletonState`/`Actions`/`History` + convenience hooks; wires IndexedDB rehydration + debounced auto-save |
| `components/CanvasSkeleton/store/skeleton-state.js` | (25 KB) Main reducer router — chains six sub-reducers (canvas/operations/editor/assembly/pieces/zones); owns RESET/SET_VIEW/OP_EXECUTE/ASSEMBLY_REALISE; calls bio-validation helpers |
| `components/CanvasSkeleton/editor/ContainerEditorSkeleton.jsx` | **Largest file (39 KB)** — full sequence/annotation editor for one container; reuses Library inspector tabs; buffers edits per container; surfaces PieceCreate/PiecePrimersPick modals |
| `components/CanvasSkeleton/editor/assembly-mode/AssemblyShellBody.jsx` | (31 KB) Assembly editor body — coloured SequenceTab zones, SegmentList, primers panel, range/mutation/realise modals, editable-assembly routing |
| `components/CanvasSkeleton/canvas/operations/lib-adapters.js` | Operation execution facade — dispatches to per-kind adapter via op-kinds-registry; validates with `assertContainerOk` |
| `components/CanvasSkeleton/lib/zone-pieces-to-dag.js` | Reverse-DAG "Realise" — converts a zone's pieces into N containers + N−1 junctions + N PCR op-nodes with primers + grid layout |
| `components/CanvasSkeleton/store/skeleton-persistence.js` | IndexedDB auto-save + rehydration; v1–v12 migration chain; refuses newer-schema loads; per-project keyed |

**Responsibilities:** four-tier data model in isolated state; free-form 2-D board (LayoutView frames + GraphView xyflow DAG per zone); Miro-style zone frames (drag/resize/3-lane dagre auto-layout/collapse/mode-toggle); container editor overlay reusing Library sub-tabs with pending-edits buffer + annotation undo/redo; assembly editor (segment authoring, range-picker sourcing, per-boundary method picker, primer writing, editable-sequence mode); operation adapters dispatched via op-kinds-registry; realise-to-DAG; auto-primer derivation, Sanger row, codon stats, RE popover, protocol export; per-project IndexedDB persistence with 12-step migration; undo/redo + scoped global keyboard handler.

**Depends on:** `lib/strings.js` (84), `store/index.js` (73 — `currentProjectId`/`showToast`/`libraryEntries`/`projects`), `sequence-utils.js` (32), `annotation-model.js` (17), `restriction-db.js` (17), `tm-calculator.js` (13), `codons.js` (15), `components/Library` inspector sub-tabs (reused directly), `components/SequenceView/popups`, `lib/dag-layout.js`, `lib/bio/annotation-conflicts.js`, `hooks/useSequenceSelection`.

**Used by:** `App.jsx` (sole mount — `canvasSkeleton` fullscreen), `components/SequenceView/popups/PiecePrimersPickModal.jsx` (reads/writes pieces via skeleton-context).

**Risks:**
- **SIZE:** `ContainerEditorSkeleton.jsx` (39 KB) and `AssemblyShellBody.jsx` (31 KB) are at/above the hard threshold — further additions trigger mandatory decomposition (CLAUDE.md §7).
- `skeleton-state.js` (25 KB) and `skeleton-state-canvas.js` (27 KB) are above the 25 KB `.js` hard limit; already split once (OPS K2) but the canvas sub-reducer keeps growing.
- State isolation (DEC-SKELETON-01) is deliberate but the escape hatch to global Zustand (`currentProjectId`/`showToast`/`libraryEntries`) is scattered across SkeletonProvider, CanvasLayoutView, ContainerEditorSkeleton — any slice rename silently breaks the canvas.
- Deep Library reuse (10+ inspector sub-components imported directly) means Library refactors propagate here without an explicit contract; `adapt-container-to-item.js` is the only isolation layer.
- Schema migration chain (v1–v12) is forward-only — refuses newer snapshots but has no downgrade path, risking data loss on rollback.
- `assembly-realise.js` is a thin re-export shim over `zone-pieces-to-dag.js` (T6 K6 alias) still imported by tests; dual zone-id/legacy-assemblyDraft resolution adds indirection that will break when legacy drafts are removed.
- 158 modules / ~29,000 LOC in one directory with no published public API; the 23-import hub on `skeleton-context.jsx` couples nearly every sub-component to the full state shape, making incremental extraction hard.

---

### components/Library — Library workspace + Importer + inspector

Full-screen "Библиотека": file/paste import pipeline, entry browser (project/loose/trash tree), and multi-tab sequence inspector.

**Purpose:** The complete Library surface (canvas fullscreen `'library'`), covering three concerns in one cluster: (1) **LibraryWorkspace** — 312 px tree + right-panel inspector to browse all entries across projects, loose zone, trash, and the Common Features DB; (2) **legacy Importer** (`index.jsx`) — session-local pipeline for parsing files/paste/catalog items before committing as entries; (3) **LibrarySingleInspector** — tabbed Overview/Sequence/Annotations/History viewer with in-place annotation editing, manual-edit branching, save-flow, undo/redo. Owns the entire "how a DNA part enters and lives in the library" lifecycle.

| File | Role |
|------|------|
| `components/Library/LibraryWorkspace.jsx` | Primary workspace shell (M-X.7a v2 K4) — 312 px tree + inspector, selection, import orchestration, soft-delete/undo, GenBank export, AddModal, Ctrl+F search. The canonical Library entrypoint |
| `components/Library/index.jsx` | (35.1 KB) Legacy Importer fullscreen — session `parsedItems` via useImporterState, `runConfirm` (hash dedup → AutonameModal → buildLibraryEntry → store), PrimerWizard/PreImport modals, MultiImportView routing |
| `components/Library/inspector/LibrarySingleInspector.jsx` | (31.9 KB) Tabbed inspector — title row, TabBar, lazy Overview/Sequence/Annotations/History, LinearFeatureBar, undo/redo, FeatureEditor/ManualEditConfirm modals, save-flow, entry-scoped primers, Annotator integration. Shared by Workspace and Importer |
| `components/Library/tree/LibraryTreeRoot.jsx` | Left 312 px tree — LooseZone, current ProjectZone, pinned projects, all-projects group, Common Features node, TrashZone, filter, add |
| `components/Library/hooks/useLibraryState.js` | Importer-local state — parsedItems, per-file flags/edits, pendingImport envelope, parsers, `commitPendingImport`, write-through hot-fix to librarySlice |
| `components/Library/CommonFeaturesPanel/index.jsx` | Master-detail editor for common-features DB (DEC-CF-06/10/12) — filterable list with factory/user/overridden badges, inline header inputs, editable SequenceView |
| `components/Library/lib/build-library-entry.js` | Pure factory — parsedItem + name + hash → well-shaped LibraryEntry. Shared by Importer + Workspace |
| `components/Library/LibraryTopBar.jsx` | Top header — breadcrumb, open-project, undo/redo, global IUPAC-aware DNA search across container entries |

**Responsibilities:** parse DNA files + paste via `parseFile`/`enrichAnnotations`; capture import metadata via PreImportModal; commit via `buildLibraryEntry` + store with SHA-256 dedup + AutonameModal + per-row commit; import embedded primers via PrimerWizard; project/loose/trash/common-features tree; multi-tab inspector with lazy-mount + hang guard; in-place annotation editing (drag-resize, Del/H/E, split/merge, Annotator merge) via `applyAnnotationEdit`; rolling undo/redo; manual-edit branch gate (DEC-LIB-12); save-flow + read-only/editable pill; soft-delete to Trash + hard-purge; GenBank/zip export; global DNA search with identity bucketing; common-features browse/edit; multi-file drops; starter-set seeding.

**Depends on:** `store/index.js` (large surface incl. commonFeaturesSlice actions), `lib/strings.js`, `file-import`, `annotation-model.js`, `lib/annotation-edit.js`, `sequence-utils.js`, `lib/sequence-search.js`, `lib/library-actions.js`, `lib/export-genbank.js`, `exports.js`, `feature-detection.js`, `codons.js`, `store/commonFeaturesSlice`, `components/SequenceView` (+ SettingsPopover, usePromoteToCommon), `components/PlasmidMiniMap.jsx`, `hooks/useSequenceSelection`.

**Used by:** `components/CanvasSkeleton` (mounts both Workspace and legacy Importer for `'library'`), `components/AppShell`, `store` (drains pending-files queue, reads navStack), `App.jsx`, `components/Dag`, `components/PlasmidViewer.jsx`.

**Risks:**
- **SIZE:** `index.jsx` (35.1 KB) and `LibrarySingleInspector.jsx` (31.9 KB) at/above the 30 KB soft warning; the inspector was decomposed once (18.05) but is drifting back up.
- **Dual entrypoint:** `LibraryWorkspace` (canonical) and `index.jsx` (legacy Importer) coexist with a `LibraryTreeStub` placeholder — divergent code paths risk regressions when a feature lands in one but not the other.
- **Stale-closure write-through** in `useLibraryState.updateEdits` — fire-and-forget `writeLibraryEntryAnnotations` bypasses save-flow (known TD-LIBRARY-WRITE-API).
- **SAFE-01 atomicity gap:** bulk-commit reverted to per-row after a cache bug — a partial batch failure leaves orphaned entries with no rollback.
- `runConfirm` closure captures stale `parsedItems` between batched setState and commit (mitigated by `itemsOverride`, still fragile).
- `CommonFeaturesPanel` debounces edits to Dexie — a hard crash/fast nav can lose the latest in-flight edit.
- `useManualEditBranching` replays queued keystrokes after async branch creation — a slow store action lets keystrokes accumulate against the parent.
- Deep import graph (16+ root/lib/src files + SequenceView + several slices) — a change to `annotation-model.js` or `applyAnnotationEdit` ripples into both inspector and Importer simultaneously.

---

### components/SequenceView — interactive linear DNA viewer

Scrollable monospace character-grid with stacked per-line SVG tracks (primer/RE/ruler/strands/annotation/AA), overlays, and edit operations.

**Purpose:** Renders any construct as DNA rows with stacked tracks above/below each strand. Provides pointer/keyboard selection of DNA or AA ranges, caret nav, context-menu copy, wrap-tail context for circular plasmids, inline annotation CRUD, primer creation from selection, and promote-to-common. **Has no store logic of its own** — a display/edit surface wired via callback props, reusable across Library, Importer, Annotator, and Container Editor unchanged.

| File | Role |
|------|------|
| `components/SequenceView/index.jsx` | Root — ResizeObserver measure, partitions seq into lines (incl. wrap-tail/bridge for circular), fans props into SequenceLine, mounts overlays/popups, coordinates 8 hooks, exposes `scrollToPosition` |
| `components/SequenceView/SequenceLine.jsx` | `React.memo` row subtree — one DNA line + all 6 tracks with `contain:paint`; memoizes per-position annotation map |
| `components/SequenceView/tracks/AnnotationTrack.jsx` | SVG feature bars — greedy multi-row stacking, chevrons, SBOL glyphs, leader labels, overflow pill, drag handles, predicted dashed style |
| `components/SequenceView/tracks/AATrack.jsx` | AA translation — single-frame (dominant CDS) or hybrid (6-frame); opacity fade for non-ORF |
| `components/SequenceView/hooks/useSelectionState.js` | Pointer selection — DNA/AA drag, auto-scroll RAF, context-menu, copy dispatcher, click-fallback caret |
| `components/SequenceView/lib/feature-map.js` | Pure helpers — buildFeatureMap, mergeWithPredicted, buildLineAnnMap, flattenSites |
| `components/SequenceView/lib/grid.js` | Char-grid math — measureCharPx, clampCharsPerLine, linesFromSeq (single source so SVG aligns to HTML rows) |
| `components/SequenceView/lib/wrap-tail.js` | Circular context — shouldEnableWrapTail, pick/build wrap-tail + bridge lines |

**Responsibilities:** measure host + compute charsPerLine; partition seq into line objects incl. origin-crossing bridge/tail; render tracks in canonical order (Primer→RE→Ruler→Strands fwd/rev→Annotation→AA fwd/rev); stacked annotation bars with packing/overflow/SBOL/drag-resize/rename; AA single/hybrid mode; primer arrows + 2-primer fragment highlight; RE labels with collision offset + hover bar; pointer DNA/AA selection with auto-scroll + context-menu (copy/annotation/BLAST/primer/piece/promote); keyboard nav + editable input + annotation hotkeys; `scrollToPosition` imperative handle; circular overlays (origin marker/divider); search-hit + out-of-range overlays; consumer-gated modals; near-cursor Tm tooltip; display-settings persistence to uiSlice + localStorage.

**Depends on:** `store/index.js` + `store/uiSlice.js` (settings/defaults), `lib/strings.js`, `sequence-utils.js`, `annotation-model.js`, `restriction-db.js` (scanAllSites/RE_ENZYMES), `feature-palette.js`, `codons.js` (translateDNA), `tm-calculator.js`, `predicted-detection.js`, `sbol-glyphs`, `lib/annotation-edit.js`, `components/CanvasSkeleton/store/skeleton-context.jsx` (indirect, via ContainerEditor reuse).

**Used by:** `components/Library/inspector/tabs/SequenceTab.jsx` (primary embed), `Library/CommonFeaturesPanel`, `Library/inspector/LibrarySingleInspector` (SettingsPopover + usePromoteToCommon), `components/Annotator/PreviewTab.jsx`, `components/CanvasSkeleton/editor/ContainerEditorSkeleton.jsx` (PieceCreate/PiecePrimersPick/usePromoteToCommon).

**Risks:**
- **SIZE:** `index.jsx` (1182 LOC / ~37 KB) below the 40 KB hard limit but in the soft zone; `AnnotationTrack.jsx` (1086 LOC) similarly dense — both Watch-list candidates.
- **Coupling breadth:** `index.jsx` has 20 root-level imports — effectively a hub; any breaking change in those modules propagates here.
- **layoutEpoch cascade:** the V96 epoch mechanism is correct but brittle — a new overlay that forgets to consume `layoutEpoch` shows stale geometry silently after reflow.
- **Prop-explosion:** 30+ consumer-gated callback props — new modes add more, raising the chance of silent no-op bugs when a prop is omitted.
- **Two-phase tracksReady:** annotation/AA tracks mount in an idle callback (~250 ms); tests bypass via `__IS_TEST_ENV__` — a test that forgets the flag sees missing tracks with no clear failure.
- **Wrap-tail regression risk:** reverted once already; the always-on-for-circular ~200 bp approach means any change to charsPerLine or bridge logic can silently break tail coordinate math.

---

### components/Annotator — multi-level annotation orchestrator

Fullscreen/embedded panel that runs the plugin pipeline, surfaces ghost predictions, and lets the user accept/reject/edit before committing to a fragment.

**Purpose:** Complete UI + orchestration for the three-level workflow (L1 common-features homology auto-run, L2 structural predictors, L3 BLAST stub). Two modes: large modal overlay (from Importer) and inline panel inside Library's AnnotationsTab. Manages plugin dispatch, threshold filtering, per-region verdicts, and the save step that emits accepted regions via `onApplyAnnotatorResults`.

| File | Role |
|------|------|
| `components/Annotator/index.jsx` | Root orchestrator (~530 LOC) — dual-mode shell, L1 auto-run (double-rAF deferred), L2/L3 dispatcher, handleSave, Esc capture, pendingScroll merge, store wiring |
| `components/Annotator/LevelPanel.jsx` | Right pane — three-section (L1/L2/L3) list with run/accept-all, threshold+duplicate filtering, ResultRow per hit; exports `LEVELS` |
| `components/Annotator/PreviewTab.jsx` | Left pane — merges confirmed+predicted into one fragment for SequenceView/PlasmidMiniMap, reconciles partials (V134/V136), hosts GhostDrillInPanel + progress bar |
| `components/Annotator/ResultRow.jsx` | Result card — name + 1-based coords + confidence pill + Accept/Reject/Edit; click name → onLocate scroll |
| `components/Annotator/GhostDrillInPanel.jsx` | 280 px slide-over on ghost click — metadata + verdict buttons + stub BLAST/predictor re-run |
| `components/Annotator/TargetPreview.jsx` | 22 px SVG feature strip (modal only) — confirmed annotations + accent overlay for scoped regions |
| `components/Annotator/AnnotatorProgressBar.jsx` | Indeterminate stripe reading `store.annotator.running` |
| `components/Annotator/TabBar.jsx` | Stateless Linear\|Circular toggle for PreviewTab |

**Responsibilities:** L1 auto-run on open (double-rAF, keyed to sequence content); manual L2/L3 dispatch via `runAnnotatorPipeline`; per-region verdicts in annotatorSlice; uniform threshold filtering across LevelPanel + PreviewTab; reconcile confirmed with L1 partials; render ghosts via `predicted:true`, flip to solid on accept; merge inner + parent scroll; emit accepted/edited regions on Save; dual modal/embedded rendering; 3-state Save button.

**Depends on:** `store/index.js` + `store/uiSlice.js` (annotatorSlice surface), `lib/strings.js`, `lib/annotator-pipeline.js`, `lib/annotator-plugins`, `lib/annotation-edit.js` (isDuplicatePrediction/reconcileConfirmedWithPartials/toUiCoords), `components/SequenceView`, `components/PlasmidMiniMap.jsx`, `feature-palette.js`.

**Used by:** `components/Library/inspector/tabs/AnnotationsTab.jsx` (sole consumer — embedded mode).

**Risks:**
- `index.jsx` (~530 LOC) already absorbs L1 auto-run, dual-mode, scroll merge, save orchestration — a future L2/L3 sprint risks the 40 KB hard limit.
- L3 BLAST is a stub (`onRunBlast`/`onRunPredictors` no-ops) — backend proxy not built; "Coming soon" placeholder needs replacement.
- annotatorSlice is shared between modal + embedded via one store key — two simultaneously mounted instances would corrupt each other's state.
- Auto-run keyed on the full sequence string — very large sequences create a long synchronous scan; double-rAF masks but doesn't fix the ~450 ms main-thread block.
- `reconcileConfirmedWithPartials`/`isDuplicatePrediction` run every render via useMemo on the full annotations array — expensive on feature-dense plasmids.
- GhostDrillInPanel BLAST/predictor buttons are no-op stubs — dead interactive surface that may confuse users if long-lived.

---

### lib — cross-cutting service layer

Non-React infrastructure backbone: `.bodge` ZIP I/O (v1/v2), persistence, annotation editing, sequence search, UI strings, hotkeys, DAG layout, and bio algorithms.

**Purpose:** All stateless pure helpers and thin platform adapters that components/store depend on but that belong in no single component. Owns the entire `.bodge` format, the localStorage/memory persistence layer, the annotation-editing API, the seed-extend search engine, the annotator plugin pipeline, global hotkeys, DAG auto-layout, the centralised string dictionary, and smaller bio helpers.

| File | Role |
|------|------|
| `lib/strings.js` | **Single source of truth for all UI text (49 KB, 84 importers).** Namespace-keyed dictionary + parameterised functions; designed for zero-cost react-i18next migration |
| `lib/bodge-zip.js` | `.bodge` I/O entry — `writeBodge`/`readBodge` dispatch v1↔v2; aggregates manifest-v2, hash, container-genbank, assembly-json, primers-json, readme-writer, attachments |
| `lib/feature-match-core.js` | (25 KB) Pure identity/scoring engine — 6-frame protein match for CDS/marker/reporter + sliding-window DNA identity (≥96%). Shared by annotator plugin + promote-dedup |
| `lib/annotation-edit.js` | (20 KB) Pure CRUD on `fragment.annotations[]` — `applyAnnotationEdit` dispatcher + 0-based↔1-based coordinate conversion. Single write-path for SequenceView + Annotator |
| `lib/sequence-search.js` | (22 KB) Adaptive seed-and-extend search — single-nt indel tolerance, both strands, identity threshold |
| `lib/annotator-pipeline.js` | Multi-plugin orchestrator — `Promise.allSettled`, routes CPU-heavy plugins to the predictor Web Worker, partial results on failure |
| `lib/hotkeys.js` | (14 KB) Global hotkey registry + `useHotkey` hook — scope levels, single keydown listener pattern, STRINGS integration |
| `lib/storage.js` | Thin localStorage adapter with in-memory fallback (tests/incognito/SSR) |

**Responsibilities:** `.bodge` format (write v1/v2, read, manifest build/validate, per-asset sha256, raw-bytes recovery, atomic write+verify, v1→v2 migration, export profiles, loss-detection); persistence (kv store, multi-tab lock via Web Locks + BroadcastChannel, File System Access wrapper); annotation editing (coordinate-validated CRUD, deterministic IDs, coord conversion); sequence search (indel-tolerant, both strands, mismatch map, recent history); feature matching; annotator plugin infra (registry, structural detector, BLAST stub, worker client + fallback, orchestrator); UI string dictionary; global hotkeys; DAG auto-layout (dagre wrapper); bio helpers (`lib/bio/` — codon optimise, Sanger/Gibson primer design, strain compat, annotation conflicts); notebook markdown (lazy markdown-it singleton); library classification; misc (makeId, color-utils, image-compress, PWA, v0.5 cleanup).

**Depends on:** root `src/` modules (codons, sequence-utils, tm-calculator, mutagenesis, auto-annotate), `store/index.js` (hotkeys reads active project), `components/Library/lib/importer-strings.js` (re-exported by strings), `fflate`, `@dagrejs/dagre`, `markdown-it` + `DOMPurify` + plugins, Web platform APIs (crypto.randomUUID, navigator.locks, localStorage, File System Access, BroadcastChannel, Web Workers).

**Used by:** `components/CanvasSkeleton` (41 paths — heaviest), `components/Library` (27), `components/SequenceView` (16), `components/Annotator` (14), root `App.jsx`/`main.jsx` (9), `components/Dag` (7).

**Risks:**
- `strings.js` at 49 KB is well above the 25 KB `.js` hard limit (the data-file exemption applies to pure dictionaries; this file has parameterised functions + cross-imports IMPORTER_STRINGS). Growth risk as each sprint adds a namespace.
- `feature-match-core.js` at 25 KB sits at the hard-limit boundary; any algorithm change risks Active decomp.
- `bodge-zip.js` aggregates 7 sub-modules — a change in any requires end-to-end ZIP round-trip regression.
- `annotator-plugins/index.js` uses side-effect imports for registration — tree-shaking can silently drop plugins if the import chain breaks.
- `lib/bio/` has no barrel — consumers import by file path, making the namespace fragile to refactor.
- `hotkeys.js` imports `useStore` + STRINGS at module load — non-pure, harder to test, couples the registry to runtime app state.
- `multi-tab-lock.js` depends on Web Locks (Chrome 69+); the BroadcastChannel tab-eviction fallback has no visible test coverage.

---

### components/(legacy v0.5 singletons + misc) — pre-refactor flat bucket

33 flat-directory components forming the assembly-canvas interaction layer: wizards, junction controls, plasmid viewers, protocol tracking, and app-level modals.

**Purpose:** The historical "everything else" bucket predating the v0.6 sub-directory refactor. Contains components mounted directly by the assembly canvas or by `App.jsx` as global overlays. The densest coupling zone in the frontend — most files import 4–6 core lib modules directly.

| File | Role |
|------|------|
| `components/PlasmidUseWizard.jsx` | 10-mode modal wizard for a dropped circular Part — restriction cloning, disassembly, extract, mutate, insert, delete, versions. **38.8 KB, largest in cluster**, above soft limit |
| `components/PlasmidMap.jsx` | (35.6 KB, near hard) Core SVG circular map — zoom/pan, multi-track arcs, RE overlay, junction markers, primer arcs. Used by 4 consumers |
| `components/JunctionBlock.jsx` | (29.2 KB) Junction type selector (overlap/GG/RE/KLD/ligation) — enzyme search, overhang validation, context menu |
| `components/ProtocolTracker.jsx` | (31 KB) Lab protocol tracker — per-step completion, timestamps, gel photo upload, concentration; localStorage |
| `components/PlasmidMiniMap.jsx` | (28.9 KB) Compact read-only thumbnail — **most cross-cut component (9+ locations)**; two-mode contract (inline vs overlay with leader-labels) |
| `components/AnnotationEditor.jsx` | (17.4 KB) Region/detail/point tree with SBOL icons + inline coords; exports `PART_TYPE_GROUPS` consumed by Library FeatureEditorModal |
| `components/MutagenesisWizard.jsx` | (18.1 KB) KLD/QuikChange/overlap wizard — designs mutant primers, **calls Python backend via api.js** |
| `components/utils/fragment-topology.js` | Pure helper — `getFragmentTopology()` + `expectedJunctionCount()`; single source for the linear-vs-circular junction-count rule |

**Responsibilities:** circular plasmid SVG map (multi-track arcs, RE scanning, primer overlays, zoom/pan); compact thumbnail across all list/card contexts; the 10-mode PlasmidUseWizard; junction type/params + overhang validation; junction DNA visualisation; lab protocol tracking; oligo order registry; annotation tree editing; full-detail part viewer; split-pane map+sequence workspace; part lineage tree; site-directed mutagenesis wizard; global modals (Settings, ProjectInfo, CommandPalette, SequenceSearch, HotkeyCheatsheet, MultiTabBlocked, ReadOnlyForced); small primitives (ContextMenu, CopySeqButton, ConcentrationInput, ThemeToggle, ConnectorDropdown, SubFragmentBar, ReplacePicker, DagPlaceholder); centralised junction-count rule.

**Depends on:** `store/index.js` (nearly every component), `lib/strings.js`, `restriction-db.js`, `annotation-model.js`, `tm-calculator.js`, `golden-gate.js`, `codons.js`, `feature-palette.js`, `auto-annotate.js` (ANNOTATION_COLORS), `mutagenesis.js`, `protocol-data.js`, `sequence-utils.js`, `lib/sequence-search*`, `lib/hotkeys.js`, `lib/multi-tab-lock.js`, `exports.js`, `primer-reuse.js`, `sequence-diff.js`, `part-categories.js`.

**Used by:** `App.jsx` (most global modals), `AppShell/Topbar.jsx` (HotkeyCheatsheet — dead path), Library/Dag/Annotator/CanvasSkeleton (all mount `PlasmidMiniMap`), `PlasmidViewer`/`PlasmidWorkspace`/`PlasmidUseWizard` (mount `PlasmidMap`), Library FeatureEditorModal (imports `PART_TYPE_GROUPS`), SequenceView + CanvasSkeleton (import `ContextMenu` + topology helpers).

**Risks:**
- **SIZE:** `PlasmidUseWizard.jsx` (38.8 KB) approaches the 40 KB hard limit; `PlasmidMap.jsx` (35.6 KB), `ProtocolTracker.jsx` (31 KB), `JunctionBlock.jsx` (29.2 KB) in soft-warning territory — all carry embedded sub-workflows rather than delegating.
- **COUPLING:** `PlasmidMap` is imported by four consumers — its prop surface is a de-facto contract that cascades widely.
- **TECH DEBT:** `PlasmidMiniMap` (28.9 KB, 9+ locations) has a complex/fragile two-mode contract + hover-bridge logic (see V37/V38/V46/V66 history in its header).
- **TECH DEBT:** `MutagenesisWizard` still calls the Python backend (`fetchConstructs`/`fetchFeatures`) while all other primer design is client-side — fails silently when the backend is offline.
- **LEGACY SHAPE:** flat layout is v0.5 residue — 33 ungrouped files, harder to discover than the sub-directory subsystems.
- **ISOLATION RISK:** PlasmidUseWizard/PlasmidViewer/PlasmidVersionTree/DataManager are used only by `App.jsx` via store flags — a ModalStack refactor must touch all simultaneously.
- **MISSING TESTS:** ActionBar, ProtocolTracker, JunctionBlock, JunctionDNA, MutagenesisWizard, OligoManager, PlasmidUseWizard, PlasmidVersionTree, PlasmidWorkspace, QuickStart, ConnectorDropdown, ReplacePicker, SubFragmentBar have no dedicated tests.

---

### hooks — App-level React hooks

Four cross-cutting hooks extracting side-effects, fragment mutation, sequence selection, and markdown-ref resolution from `App.jsx`.

**Purpose:** Centralises concerns previously inline in `App.jsx` or duplicated across call-sites: global shortcuts + auto-primer side-effects, all fragment editing/mutagenesis/assembly logic, a unified caret/drag-select/RE-click state machine for every SequenceView, and project-entity-aware markdown `@@ref` resolution. Exists to keep `App.jsx` thin and prevent logic drift.

| File | Role |
|------|------|
| `hooks/useFragmentHandlers.js` | (~453 LOC, largest) All fragment-mutation callbacks — split/trim/replace, save/swap variant, mutagenesis assembly (KLD + multi-fragment), topology toggle, complete-assembly, clear, add-custom. Writes via `updateActive`/`pushUndo` |
| `hooks/useAppEffects.js` | (~116 LOC) Side-effects only — Ctrl+Z/Y + Ctrl+5 toggle handler; mount-time `fetchParts()` merge preserving user variants; useMemo auto-primer design with mutagenesis-primer guard |
| `hooks/useSequenceSelection.js` | (~206 LOC) Shared controlled-selection state machine for all SequenceView call-sites — caret/anchor/drag-grace (250 ms), selectionMode/strand, RE-click in 3 strategies; returns spreadable `viewerProps` |
| `hooks/useMarkdownRefResolver.js` | (~67 LOC) Registers a kind+id→label resolver on `lib/markdown-ref-plugin` from live entity state; clears on unmount |

**Responsibilities:** extract fragment callbacks (split with annotation-offset propagation, mutagenesis dispatch, complete-assembly product creation); own the single undo checkpoint before mutations; client-side auto-primer design on every fragment/junction change with mutagenesis guard; register global shortcuts + merge `fetchParts()`; provide the canonical caret/selection machine; resolve `@@ref` tokens to labels with lifecycle-safe cleanup.

**Depends on:** `store/index.js`, `local-primer-design.js`, `mutagenesis.js`, `lib/mutagenesis-payload.js`, `lib/split-annotations.js`, `lib/markdown-ref-plugin.js`, `assembly-utils.js`, `api.js` (fetchParts), `inventory.js`, `theme.js`, `parts-grouping.js`, `protocol-data.js`.

**Used by:** `App.jsx` (useFragmentHandlers + useAppEffects — primary), `components/CanvasSkeleton` (useSequenceSelection, 4 usages), `components/Library` (useSequenceSelection, 2), `canvas` (useSequenceSelection, 1).

**Risks:**
- `useFragmentHandlers.js` (~453 LOC, 10 imports) — any change to fragment shape, mutagenesis strategy, or annotation contract risks silent breakage across split/mutagenesis/complete-assembly simultaneously.
- `useAppEffects.js` couples primer auto-design (useMemo) with store side-effects (useEffect) in one hook; `eslint-disable-line` on both suppresses exhaustive-deps warnings, masking stale-closure bugs.
- `useSequenceSelection.js` drag-grace uses `Date.now()` ref comparison — fragile under high-frequency pointer events or synthetic tests; the 250 ms constant isn't call-site configurable.
- `useMarkdownRefResolver.js` deps on `entityState` object identity — a freshly constructed object per render (common with selectors) re-registers the resolver every frame.

---

### canvas — lab notebook + export modal (NOT YET WIRED)

Two standalone, fully-built feature slices that are currently dead-code-eliminated from the bundle.

**Purpose:** Houses (1) a full lab notebook system (NotebookTab host + list/search/editor/ref-picker) for markdown journal entries with image attachments, `@@ref` cross-links, and live preview; and (2) `ExportProjectModal`, a profile-driven export dialog. Both are built and tested but **no parent component imports them** — wiring is an explicit follow-up ("under Igor's responsibility").

| File | Role |
|------|------|
| `canvas/NotebookTab.jsx` | Host — active-entry state, wires NotebookList + Search + EntryEditor (lazy) + RefPickerModal, calls useMarkdownRefResolver |
| `canvas/NotebookEntryEditor.jsx` | (9.6 KB, largest) Split-pane textarea + live MarkdownView, 500 ms debounce, Ctrl+S, scroll sync, drag-drop/clipboard image attach, `@@ref` insertion |
| `canvas/ExportProjectModal.jsx` | Export dialog — profile picker (full/public-supp/containers-bundle/single-assembly/custom), per-section checkboxes, summary counts; returns opts via callback |
| `canvas/NotebookRefPickerModal.jsx` | Entity ref-picker — tabbed across containers/zones/pieces/operations/primers/clones/external, resolves `@@ref:kind:id@@` |
| `canvas/MarkdownView.jsx` | Async renderer — calls `lib/markdown-renderer`, sets innerHTML from DOMPurify-sanitized HTML |
| `canvas/NotebookToolbar.jsx` | Stateless toolbar — 16 snippet-insert buttons + attach/ref/preview-toggle |
| `canvas/NotebookList.jsx` | Sidebar entry list — title/date/first-line/tags |
| `canvas/NotebookSearch.jsx` | Substring + tag filter input |

**Responsibilities:** notebook display/create/select/edit with title/markdown/tags/timestamps; split-pane editing with live preview + scroll-sync + shortcuts; image attach (drag/paste/picker) via `lib/bodge-attachments`; `@@ref` cross-linking; markdown rendering delegated to `lib/markdown-renderer`; ref-label resolution via `useMarkdownRefResolver`; project export (profile selection, section matrix, summary, returns opts); entry search/filter.

**Depends on:** `lib/markdown-renderer.js`, `lib/markdown-ref-plugin.js`, `lib/bodge-attachments.js`, `lib/bodge-export-profiles.js`, `hooks/useMarkdownRefResolver.js`.

**Used by:** *(nothing — not wired in)*

**Risks:**
- **Not wired into the app:** tree-shaking eliminates the entire cluster; wiring is deferred to the project owner.
- **Bundle-size cliff on wiring:** mounting NotebookTab pulls markdown-it + DOMPurify (~60 KB gz) and optionally KaTeX (~250 KB gz on first formula) — currently zero-cost, non-trivial first-load hit after integration.
- `dangerouslySetInnerHTML` in MarkdownView — security depends entirely on DOMPurify upstream; any regression bypasses React's XSS protection.
- No store dependency — all state prop-drilled; the wiring parent must manage persistence/hydration against Dexie/bodge-format.
- **Naming ambiguity:** `src/canvas/` has no relation to the drawing canvas (`src/components/CanvasSkeleton/canvas/`) — the directory name collides and will confuse contributors.

---

### components/Toast — notification stack

Fixed-position stack rendering ephemeral success/error/warning/info toasts with optional undo and auto-dismiss.

**Purpose:** App-wide transient feedback. Driven by `showToast`/`clearToast` in uiSlice, rendered at a fixed bottom-left anchor by `ToastStack`, individually managed (auto-dismiss timer, undo callback, manual close) by `Toast`. Consumers anywhere call the store action; only `App.jsx` mounts `ToastStack`.

| File | Role |
|------|------|
| `components/Toast/index.jsx` | Barrel — re-exports Toast, ToastStack, ToastIcon |
| `components/Toast/ToastStack.jsx` | Container — reads `toasts[]` + `clearToast` from uiSlice, renders fixed stack (z 1100) |
| `components/Toast/Toast.jsx` | Single tile — auto-dismiss setTimeout (useRef guard), undo + manual-close, msg + icon + action |
| `components/Toast/toast-icons.jsx` | SVG icon set for 4 kinds with per-kind colour constants |

**Responsibilities:** subscribe to uiSlice `toasts[]` and render all active toasts; auto-dismiss after `autoDismissMs` (default 3500 ms) via a per-instance timer guarded by `dismissedRef`; per-toast undo button (fires `onUndo` + dismisses); manual close; optional `onAutoDismiss` on expiry; cap queue at `TOAST_CAPACITY` (shift oldest); render a semantic SVG icon per kind.

**Depends on:** `store/index.js` (uiSlice — toasts/showToast/clearToast), `lib/strings.js` (undo/close labels).

**Used by:** `App.jsx` (sole mount; all other components trigger via store actions, not by importing Toast).

**Risks:**
- Inline styles bypass the design-system token layer (DESIGN_SYSTEM.md) — colours like `#262626`/`#fbbf24`/`#a3a3a3` are hard-coded.
- `dismissedRef` guard works only within a single component lifetime — rapid re-mount (HMR/StrictMode double-invoke) can double-dismiss.
- `TOAST_CAPACITY`/`TOAST_DEFAULT_DISMISS_MS` defined in uiSlice, not exported here — callers must know the default implicitly.
- Low size/coupling risk (187 LOC / 4 files); stable cluster.

---

### db — Dexie/IndexedDB persistence layer

Single-file persistence boundary: schema versioning (v1–v6) + CRUD helpers for all 6 tables.

**Purpose:** The entire client-side persistence boundary. Defines the IndexedDB schema across all 6 migrations, exposes a singleton `BodgeDB` via `getDB()`, and exports async CRUD helpers consumed directly by the store and a couple of components. **Nothing outside this cluster talks to Dexie directly.**

| File | Role |
|------|------|
| `db/dexie-schema.js` | Single entry point — `BodgeDB` class (Dexie, schema v1–v6 with upgrade hooks), singleton `getDB()`/`resetDBForTests()`, and all CRUD helpers for projects/containers/library/primers/snippets/commonFeatures |

**Responsibilities:** define + migrate the schema across 6 versions; expose the singleton; project CRUD (putProject/getProject/listAll/listRecent/deleteProject/clearAll); library CRUD (put/putBulk atomic/get/list with soft-delete filter/delete/listAllTags); primer-pool CRUD (M-B.1 unified pool, incl. findPrimerByResourceHash); account-global snippet CRUD; common-features overlay CRUD; v3 upgrade migrating legacy `kind='primer'` library rows into the primers table; v4 upgrade full-wipe for a dev-env schema break (DEC-MX7A-V2-03).

**Depends on:** `dexie` (npm).

**Used by:** `store/index.js` (project/container/library/primer persistence), `components/SettingsModal.jsx` (`clearAll()` for "wipe database").

**Risks:**
- Single 334-LOC file with no internal splitting; rate-of-change is high (v5+v6 added recently) — heading toward the `.js` soft zone.
- `listLibraryEntries`/`listPrimers` do full `toArray()` scans then in-memory filter — no indexed query on zone/projectId/status; degrades as the library grows.
- `clearAll()` intentionally excludes snippets + commonFeatures (account-global) — correct per spec but a silent asymmetry for callers expecting a full wipe.
- `resetDBForTests` nulls `_db` only when called with no name — every test must pass an explicit name to avoid leaking the singleton between suites.
- `DB_VERSION` export must stay in sync with the highest `.version()` call (currently 6) — easy to forget on future additions.

---

## Cross-cutting hubs & systemic risks

A handful of modules are imported so widely that they behave as the load-bearing spine of the codebase. A breaking change in any of them ripples across most clusters.

**The hubs (and why they are risky):**

- **`lib/strings.js` (84 importers, 49 KB).** Every user-facing string flows through here, so it is touched by virtually every UI sprint and is the most-imported file after the store. It is well over the 25 KB `.js` hard limit, and the data-file exemption does not cleanly apply because it contains parameterised functions and cross-imports `IMPORTER_STRINGS`. There is no rate-of-change trigger documented, but it grows a namespace per sprint.
- **`store/index.js` (73 importers).** The single Zustand composition root — 339 `useStore` occurrences across 215 files. The store is one flat Immer draft with no type safety, so a misspelled key in any slice silently corrupts a sibling. It also harbours a **circular dependency** (`commonFeaturesSlice` ↔ `index.js`) that only works because of Zustand's late `create()` call, and a **slice-boundary violation** (`projectSlice` mutating `state.canvas.*`).
- **`sequence-utils.js` (32 importers).** The DNA primitive layer under the entire domain engine; untested edge cases in `sanitizeWithReport` (BOM + IUPAC) are a silent-corruption vector across every parse path.
- **`components/CanvasSkeleton/store/skeleton-context.jsx` (23 cluster importers).** The state hub for the largest single feature directory (158 modules / ~29,000 LOC). Nearly every sub-component is coupled to the full state shape, making incremental extraction difficult.
- **`annotation-model.js` (17), `restriction-db.js` (17), `codons.js` (15), `tm-calculator.js` (13).** The domain contract hubs. Changes to the annotation schema or the RE database propagate into Library, SequenceView, CanvasSkeleton, and the legacy plasmid components at once.

**Biggest files / size pressure (CLAUDE.md §7 budgets — 40 KB `.jsx` hard, 25 KB `.js` hard):**

| File | Size | Status |
|------|------|--------|
| `store/librarySlice.js` | 43.8 KB | **Over `.js` hard** — Active decomp territory |
| `components/CanvasSkeleton/editor/ContainerEditorSkeleton.jsx` | 39 KB | At `.jsx` hard threshold |
| `components/PlasmidUseWizard.jsx` | 38.8 KB | Near `.jsx` hard |
| `restriction-db.js` | 37.9 KB | Near `.jsx` hard (data file) |
| `components/SequenceView/index.jsx` | ~37 KB | Soft zone / Watch list |
| `PlasmidMap.jsx` | 35.6 KB | Near hard |
| `components/Library/index.jsx` | 35.1 KB | Over soft |
| `components/Library/inspector/LibrarySingleInspector.jsx` | 31.9 KB | Over soft (decomposed once, drifting back) |
| `AssemblyShellBody.jsx` | 31 KB | At hard for assembly body |
| `ProtocolTracker.jsx` / `JunctionBlock.jsx` | 31 / 29.2 KB | Soft zone |
| `lib/strings.js` | 49 KB | Over `.js` hard (data-file exemption disputed) |

**Systemic structural risks:**

1. **Two routing layers.** `App.jsx`'s `canvas.activeFullscreen` overlay router and `AppShell`'s `store.workspace.active` router overlap with no clear ownership boundary — a recurring source of "which one controls this view?" confusion, compounded by stub workspaces that fail silently with no error boundary.

2. **Two state systems.** The global Zustand store and CanvasSkeleton's isolated `useReducer` island (DEC-SKELETON-01) coexist; the only bridges (`currentProjectId`, `showToast`, `libraryEntries`) are scattered across several skeleton components, so any store-slice rename silently breaks the canvas with no compile-time signal.

3. **Implicit cross-cluster reach-in.** CanvasSkeleton imports 10+ Library inspector sub-components directly; StartScreen reaches into `Library/lib/starter-set.js`; the store imports several `Library/lib/*` helpers. None of these have a published contract — Library refactors ripple outward unpredictably (`adapt-container-to-item.js` is the lone isolation layer for the biggest case).

4. **No barrel exports in the domain layer.** 40+ root `src/` modules and the `lib/bio/` namespace are imported by individual file path, turning any "move a helper" refactor into a high-surface find-and-replace.

5. **Dead / unwired code on disk.** `AppShell/Topbar.jsx` + `NavRail.jsx` (364 LOC), `start-screen-data.js` mock data, the entire `src/canvas/` notebook+export cluster, and back-compat shims (`feature-detection.js`, `assembly-realise.js`) inflate apparent size and mislead readers until promised cleanups land.

6. **Latent backend coupling.** `MutagenesisWizard` is the lone primer path still calling the Python backend (`api.js`) while everything else is client-side — it fails silently when the backend is offline.

7. **Forward-only persistence.** Both Dexie (v6) and CanvasSkeleton (v1–v12) migration chains refuse newer-schema snapshots with no downgrade path — version rollback risks data loss, and `DB_VERSION`/migration counters must be hand-kept in sync.
