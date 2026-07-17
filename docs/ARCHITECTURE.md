# BodgeGene architecture

**Status:** current architectural overview for the `0.8.7-alpha` application. Runtime code and normative format specifications override this overview when they disagree.

## 1. System boundary

BodgeGene is a local-first React single-page application with a small optional Python helper and a separate Python CLI.

```text
Browser / PWA
  React UI
    ├─ Zustand application state
    ├─ Dexie / IndexedDB persistence
    ├─ biological algorithms and workers
    └─ file import/export (.bodge, GenBank, FASTA, .dna)
          │ optional localhost calls
          ▼
  FastAPI parser helper (gui/api)

Python package (src/pvcs)
  independent CLI + reusable parsing/versioning modules
```

The browser application is the primary product. The FastAPI process is not a remote source of truth and must not become required for ordinary editing or validation that already has a browser implementation.

## 2. Frontend layers

### Application shell

- `gui/designer/src/App.jsx` performs bootstrap, file-level commands and global application wiring.
- `components/AppShell/` owns the persistent shell and workspace routing.
- `store/workspaceSlice.js` identifies the active workspace and its navigation context.
- Full-screen or modal surfaces are exceptional; normal tools should be workspaces or panels.

### State

Zustand slices under `gui/designer/src/store/` own domain state. React components read selectors and call store actions; they do not invent parallel canonical copies.

Important domains include projects, library entries, assemblies, primers, alignment, restriction views, common features and UI state. Cross-domain workflows are orchestrated at a controller/hook boundary rather than by importing one component into another.

Persisted data is hydrated explicitly during bootstrap. IndexedDB/Dexie is the local operational store; `.bodge` is the portable project boundary. Local storage is limited to lightweight preferences and view state.

### UI components

Feature surfaces live under `components/`:

- `Library/` — projects, molecules, versions, annotations and global search;
- `CanvasSkeleton/` — current assembly/canvas model and operations;
- `SequenceView/` — sequence, annotation, primer and translation tracks;
- `PrimerPool/` — canonical primer collection;
- `Align/` — reference/read alignment;
- `RestrictionSites/` — restriction analysis;
- `Annotator/` — annotation workflows;
- `Search/` and `common/` — reusable UI primitives without store or algorithm ownership.

Reusable UI code must not import the store, biological engines or workspace controllers. Domain containers adapt data and actions into primitive props.

## 3. Core object model

### Project and library

A project groups related constructs and work. A library entry is a molecular resource with stable identity, sequence/topology, annotations and provenance. Revisions and variants create new records or history nodes; consequential sequence changes must not silently overwrite the source object.

### Assembly model

The current canvas uses four conceptual tiers:

1. **Pieces** — source-derived or synthetic DNA material.
2. **Junctions** — intended relationships between adjacent pieces.
3. **Operations/reactions** — PCR, digest, ligation, Golden Gate, Gibson or other transformations.
4. **Outputs/clones** — materialized products and their provenance.

Rendering is a projection of canonical assembly state, not a second editable model. A junction configuration, its primers and the realized product must derive from the same state.

### Primers

The primer pool is canonical. Assembly surfaces reference or migrate primers into that pool instead of maintaining unrelated primer objects. A primer separates template-binding sequence from 5′ tails/overhangs; display, Tm calculation and export must preserve that distinction.

### Annotations

All annotations live in one `annotations[]` collection. Hierarchy is represented by `level` (`region`, `detail`, `point`) and references/coordinates; there is no separate `domains[]` model. Importers normalize external formats into this contract before UI code consumes them.

Coordinates, topology and strand are biological data. Circular features may cross the origin and therefore cannot always be reduced to one linear `start < end` interval.

## 4. Biological computation

Algorithms live under `gui/designer/src/lib/`, selected top-level helpers and dedicated workers. UI components display their results but do not reproduce the rules.

Permanent rules:

- preserve sequence orientation and topology explicitly;
- distinguish binding sequence from synthetic additions;
- do not mix Type IIS Golden Gate enzymes with classical restriction-cloning catalogs;
- keep uncertainty and provider failure distinct from a biological negative;
- version algorithm/model/database inputs when results are persisted or cached;
- require deterministic validation before save/export when a preview was approximate.

Heavy work uses persistent workers with cancellation, stale-result dropping and bounded concurrency. The preferred optimization order is indexing/caching, incremental work, compact transfer formats and only then WASM/Rust for measured hot kernels.

## 5. Search architecture

Search separates three independent concerns:

- **entity scope** — which objects may be returned;
- **provider intent** — metadata, DNA, protein, restriction sites or enzyme catalog;
- **field clauses** — type/status/tag and other supported restrictions.

The prefix registry, lexer and classifier produce a `QueryPlan`. A facade orchestrates metadata preview and provider-backed confirmation. Final results obey strict AND semantics across requested dimensions. An unavailable provider yields an incomplete session and unconfirmed candidates; it never becomes a confirmed miss.

The library tree owns a lightweight metadata query. Escalating to full search replaces the global search state without merging stale modes or chips. Tree and global query state are intentionally separate.

Current user and technical contracts are documented in `docs/guides/USER_GUIDE_SEARCH.md` and `docs/guides/TECHNICAL_GUIDE_SEARCH.md`.

## 6. Persistence and files

### IndexedDB

Dexie stores application state locally. Schema upgrades are explicit and forward-only. Hydration must be idempotent and tolerate missing optional records. Multi-tab protection prevents concurrent writers from silently corrupting the same local state.

### `.bodge`

`.bodge` is the portable, inspectable project container. The normative contract lives in `docs/specs/SPEC_BODGE_FORMAT_V2_CORE.md`; implementation planning belongs beside it, not in this overview.

### Interchange formats

GenBank, FASTA and SnapGene `.dna` are import/export boundaries. External annotations and coordinates are normalized once. Exporters must not invent certainty or discard provenance silently.

## 7. Dependency direction

Preferred direction:

```text
UI primitives
    ↑
domain components ← controllers/hooks
    ↑                    ↑
selectors/actions      facades
    ↑                    ↑
Zustand state       pure algorithms/workers
    ↑                    ↑
persistence adapters / normalized external data
```

Disallowed shortcuts include store imports from generic primitives, algorithm copies in JSX, direct mutation of persisted domain objects and hidden fallback to a different biological rule.

## 8. Verification boundaries

- Pure biological logic: deterministic unit, property, golden or differential tests.
- Controllers/state: transition tests, including cancellation and stale results.
- Components: interaction and accessibility tests.
- Integrated changes: full Vitest suite and Vite build.
- User-visible workflows: live browser smoke; clearly report when a state was only exercised by a harness.
- Python package: `pytest` and parser fixtures.

## 9. Related current documents

- [VISION.md](VISION.md) — product direction.
- [BACKLOG.md](BACKLOG.md) — unfinished work only.
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — current visual rules.
- [COMPONENT_MAP.md](COMPONENT_MAP.md) — source navigation.
- `docs/specs/` — active normative or implementation specifications.
- [`DECISIONS.md`](../DECISIONS.md) — enduring decisions not obvious from code.
