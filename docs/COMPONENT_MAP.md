# BodgeGene component map

This is a navigation aid for the current repository, not a generated dependency graph. Search the live source before assuming a file is the only consumer.

## Entry points

- `gui/designer/src/main.jsx` — React mount.
- `gui/designer/src/App.jsx` — bootstrap, file-level commands and global wiring.
- `gui/designer/src/components/AppShell/` — shell and workspace router.
- `gui/designer/src/store/index.js` — composed Zustand store.
- `gui/designer/src/index.css` — global styles and theme tokens.
- `gui/designer/src/i18n.js` and `gui/designer/src/lib/strings.js` — localized/user-facing strings.

## Workspaces and major UI domains

| Area | Primary location | Responsibility |
|---|---|---|
| Library | `components/Library/` | Projects, molecules, versions, annotations, import and global search |
| Assembly/canvas | `components/CanvasSkeleton/` | Pieces, junctions, operations, layout/graph projection and assembly editing |
| Sequence viewer | `components/SequenceView/` | Sequence rows, annotation/AA/primer tracks, selection and editing |
| Primer pool | `components/PrimerPool/` | Canonical primer collection and primer-level workflows |
| Alignment | `components/Align/` | Reference/read alignment and quality display |
| Restriction sites | `components/RestrictionSites/` | Enzyme/site analysis surfaces |
| Annotator | `components/Annotator/` | Annotation review and plugins |
| Start/shell | `components/StartScreen/`, `components/AppShell/` | Project entry, navigation and common shell |
| Shared search UI | `components/Search/` | Store-free combobox, mode, filter and results primitives |
| Shared UI | `components/common/`, `components/icons/`, `components/Toast/` | Reusable controls, icons and feedback |

`components/Dag/` holds one placeholder (`ContainerWindowPlaceholder.jsx`) for the
`containerWindow` fullscreen route; no production code pushes that route. `src/canvas/`
holds the Notebook/Markdown/Export components, which no production component mounts.
Verify live routing before editing or deleting either subtree.

## State ownership

Zustand slices live in `gui/designer/src/store/`.

- `projectSlice.js` — project identity and project-level operations.
- `librarySlice.js` — library entries, versions and persistence-facing actions.
- `projectAssembliesSlice.js` — assembly associations.
- `primerSlice.js` — canonical primer pool.
- `alignmentSlice.js` — alignment sessions.
- `annotatorSlice.js` and `commonFeaturesSlice.js` — annotation workflows/data.
- `customEnzymesSlice.js` and `restrictionViewSlice.js` — restriction state.
- `workspaceSlice.js`, `canvasSlice.js`, `uiSlice.js` — workspace/navigation/presentation state.
- `searchSessionSlice.js` — search corpus/entry/buffer generations, return frame, navigation requests.
- `annotatorSlice.js` is composed inside `createUiSlice`, not directly in `store/index.js`.

Read selectors narrowly. Domain mutation belongs in store actions or explicit controllers, not arbitrary component effects.

## Biological and data libraries

Most browser-side logic is in `gui/designer/src/lib/` and selected top-level helpers.

| Domain | Typical locations |
|---|---|
| Search | `lib/library-search.js`, `lib/search-*.js`, `lib/search.worker.js`, `lib/dna-*.js`, Library search controllers |
| Annotation | `annotation-model.js`, `import-annotations.js`, `auto-annotate.js` (top-level `src/`), `lib/annotation-*.js`, `lib/feature-*` |
| Alignment | `lib/alignment/` and `components/Align/` (no worker today: alignment runs synchronously in `store/alignmentSlice.js`) |
| Splicing/proteins | `lib/splice/`, protein/search helpers |
| Assembly | `components/CanvasSkeleton/lib/`, `local-primer-design.js`, `golden-gate.js`, `restriction-db.js` |
| Restriction/GG | `restriction-db.js`, `golden-gate.js`, restriction helpers |
| Persistence | `db/`, `lib/bodge-zip.js`, `lib/project-bodge-state.js`, `CanvasSkeleton/lib/skeleton-bodge-bridge.js`, `StartScreen/lib/open-bodge.js` (`lib/bodge-migrations/` and notebook migrations have no production consumer) |
| File import | GenBank/FASTA/SnapGene parsers and import adapters under `lib/` / `gui/api/` |

Before changing annotation, assembly or restriction contracts, use the matching project skill in `.agents/skills/`.

## Workers

Two workers exist: `gui/designer/src/lib/search.worker.js` (client
`lib/search-worker-client.js`, coordinator `lib/sequence-search-coordinator.js`) and
`gui/designer/src/lib/workers/predictor.worker.js` (client `lib/annotator-worker-client.js`).
The client owns cancellation, lifecycle and protocol validation; pure engines do not
manipulate React state. Stale replies must not replace a newer session. Only the search
worker has a cancel protocol; the predictor worker has none (see BACKLOG «Heavy compute
off the UI thread»).

## Persistence and formats

- `gui/designer/src/db/` — Dexie schema and persistence adapters.
- `gui/designer/src/lib/bodge-zip.js` — `.bodge` read/write boundary.
- `gui/designer/src/lib/bodge-migrations/` — v1→v2 migration helpers without a production consumer (see BACKLOG «Dead-but-tested modules»).
- `docs/specs/SPEC_BODGE_FORMAT_V2_CORE.md` — normative portable-format contract.
- `gui/api/` — optional local parser/API helper.
- `src/pvcs/` — secondary Python CLI/backend package.

## Tests

- Frontend tests are colocated in `__tests__/` directories and run through `gui/designer/package.json`.
- Python tests live under `tests/`.
- Browser smoke complements tests for integrated user-facing changes; it does not replace deterministic tests.

## Finding a change surface

1. Start from the visible workspace/component.
2. Find its controller/hook and store selectors/actions.
3. Follow normalized data into pure algorithms or persistence adapters.
4. Search dynamic imports, registries, workers, routes and tests before declaring code unused.
5. Use a fresh Graphify graph only as an aid. A graph built for another HEAD is not deletion evidence.

The architectural rules behind this map are in [ARCHITECTURE.md](ARCHITECTURE.md); the active task and scope remain in [`CURRENT_TASK.md`](../CURRENT_TASK.md).
