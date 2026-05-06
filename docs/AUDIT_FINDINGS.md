# Audit Findings — Continuous Code Review

**Started:** 2026-05-06 (M-X.3 follow-up loop). HEAD `3482400`.

Six parallel audit agents (perf, dead code, hooks, bundle, tests, safety) seeded
this list. Items move pending → in-progress → resolved as they're worked.
Topmost pending P0/P1 takes priority each iteration.

---

## P0 (data-loss / crash / catastrophic perf / first-paint blocker)

| ID | Status | Title |
|----|--------|-------|
| ~~BUNDLE-10~~ | resolved (f362f07) | ~~PWA Workbox precaches every `**/*.json`~~ → globPatterns drops `json`; CacheFirst runtime rules for plasmid pack + common-features. Precache 24 MB → 833 KiB / 16 entries. |
| ~~BUNDLE-01~~ | resolved (5de98f7) | ~~No `manualChunks`, single 726 KB main bundle~~ → split into react / db / dnd / xyflow / compress chunks. Main bundle 726→427 KB (gz 212→116). |
| BUNDLE-04 | pending | Project Flow `flow/*` mounted from nowhere; `@xyflow/react` may ship as dead weight |
| PERF-01 | pending | `AATrack` hybrid render translates entire plasmid per line × per frame (~3M codon ops) |
| ~~PERF-02~~ | resolved | ~~`runPredictors` PWM scan re-slices 6-mers~~ → `scorePwmAt(seq, start, ...)` reads via `charCodeAt` (no slice); PWM theoretical maxima cached at module load (no per-call `Math.max(...row)`); stem-loop matcher walks via charCodeAt + complement-charcode lookup (eliminates slice/reverseComplement/regex match per probe). |
| ~~PERF-03~~ | resolved | ~~`CatalogColumn` flat-search rebuilds 2800-element pool per keystroke~~ → pre-sized array build (no spread allocation), gated fallback to `Object.values(...).flat()` only when `snapgeneFlat` not yet warm; `ensureSnapgeneFlat()` already fires from useEffect on first non-empty query. |
| ~~HOOK-09~~ | resolved | ~~`CatalogColumn` calls `sources.ensureSnapgeneFlat()` in render body~~ → moved into `useEffect([flatActive, sources])`. |
| SAFE-01 | pending | Importer Dexie writes uncoordinated — autosave can snapshot project pointing at unflushed library entry |
| ~~SAFE-06~~ | resolved | ~~`ProtocolTracker` photo upload base64 → unbounded localStorage write~~ → 12 MB input cap, downscale via canvas to 1024 px / 82% JPEG (~150 KB), localStorage setItem wrapped in try/catch with friendly alert on quota overflow. |
| DEAD-01 | blocked | `components/ImportStartScreen/` (~2378 LOC) — agent claimed dead, but `DesignCanvas.handleQuickStart` still opens it. Need user decision: retire QuickStart→ImportStartScreen path in favour of the new `Importer`? |
| ~~DEAD-04~~ | resolved | ~~Five stranded panel components~~ → deleted 5 files (~770 LOC: `SequenceViewer`, `RestrictionPanel`, `VerificationPanel`, `ExperimentStats`, `ExperimentSelector`). |
| TEST-01 | pending | `CatalogColumn` drag-drop reordering / cross-folder moves untested |
| TEST-02 | pending | LevelPanel save flow integration coverage stops at callback fire — no fragment-state assertion |
| TEST-06 | pending | `lib/plasmid-git-reducers.js` (137 LOC, critical mutation history) has no tests |

## P1 (visible bug / steady-state churn / weak test)

| ID | Status | Title |
|----|--------|-------|
| HOOK-03 | pending | Importer effect `pendingAnnotatorFile` reads stale `parsedItems` — Annotator-open race |
| HOOK-06 | pending | `SingleInspector.onAnnotationEditFromView` callback identity churns every render → drag flakiness |
| ~~HOOK-08~~ | resolved | ~~Annotator L1 auto-run promise has no cancellation~~ → effect now returns cleanup that flips a `cancelled` flag, gating `setResult`/`setRunning` and the `console.warn` on failure. Closing the Annotator mid-scan no longer warns or leaks results into a different plasmid's store slice. |
| HOOK-05 | pending | `SequenceView` ResizeObserver may attach to discarded empty-state node |
| HOOK-02 | pending | `Importer.runConfirm` closes over whole `state` object → callback churn → memo churn |
| HOOK-11 | pending | `Importer.alreadyAddedToLibrary` IIFE reads `useStore.getState()` in render — no subscription |
| ~~PERF-04~~ | resolved | ~~`useCatalogSources.mine` allocates fresh items per entry on every store tick~~ → WeakMap cache keyed on entry identity (`buildCatalogItem` runs once per entry per source); unchanged rows hand back the same reference, so downstream `ItemRow.memo` skips render. |
| ~~PERF-05~~ | resolved | ~~Five duplicate `revComp` impls~~ → consolidated into a single fast `reverseComplement` in `sequence-utils.js` (pre-sized array walk, no split/reverse/map). `feature-detection`, `predicted-detection`, `orf-detection`, `local-primer-design`, `mutagenesis`, `golden-gate` now all import from one source. |
| PERF-06 | pending | `enrichWithCommonFeatures` dedup is O(annotations × hits) |
| PERF-07 | pending | `AnnotationTrack` filters parents/details + runs stacker per line, but the split is line-invariant |
| PERF-08 | pending | `buildLineAnnMap` allocates a per-line `Array(lineLen)` per render |
| PERF-09 | pending | Hybrid AATrack hidden-row probe runs `regions.filter` twice + `computeAAOpacity` per cell twice |
| BUNDLE-03 | pending | `@dagrejs/dagre` declared but never imported |
| BUNDLE-05 | pending | `Importer` (~8.7 KLOC) eagerly imported in App.jsx — should lazy via React.lazy |
| BUNDLE-07 | pending | `restriction-db.js` (40 KB) eagerly imported into 14 files |
| BUNDLE-08 | pending | `sbol-glyphs.jsx` (24 KB SVG strings) eagerly imported by 8 components |
| SAFE-02 | pending | `parseImportFile` raw `JSON.parse` with no try/catch — corrupted backup crashes |
| SAFE-03 | pending | Multiple `localStorage.setItem` paths bypass `lib/storage.js` quota guard |
| SAFE-04 | pending | No size or count limit on file imports — 100 MB FASTA freezes UI |
| SAFE-08 | pending | `markLibraryEntryPendingDelete` fires unawaited Dexie put |
| SAFE-09 | pending | `removeProjectFromIndexedDB` doesn't await `complete` on page unload |
| SAFE-10 | pending | `App.jsx` lacks per-pane error boundaries; root boundary's "Clear data" wipes everything |
| TEST-03 | pending | PreImportModal multi-file mixed-topology untested |
| TEST-04 | pending | SequenceView popup anchor "didn't crash" smoke test (extract pure helper, unit-test it) |
| TEST-05 | pending | 40+ `toBeTruthy()` smoke assertions in Annotator + Toast |
| TEST-07 | pending | `global-ctrl-a-guard` Russian-layout `code === 'KeyA'` not exercised |
| TEST-08 | pending | `biology.test.js` `not.toThrow()` smoke at line 231/596/600 — assert specific warning |
| TEST-09 | pending | `import-annotations.test.js:73` only checks id truthy — assert id shape + uniqueness |
| TEST-10 | pending | LevelPanel `onEditPatch` round-trip (rename + accept + save) untested |
| TEST-14 | pending | `annotator-flow.test.jsx:205` `waitFor` converges on `truthy` not row count |

## P2 (cleanup / cosmetic)

| ID | Status | Title |
|----|--------|-------|
| BUNDLE-02 | pending | `zundo` declared, never imported |
| BUNDLE-09 | pending | `immer` direct dep redundant — comes via Zustand middleware |
| BUNDLE-11 | pending | `sharp` (30+ MB native) in devDeps but not invoked anywhere |
| BUNDLE-12 | pending | Two CSS systems coexist (Tailwind 4 + `Prototype/prototype-tokens.css`) |
| ~~DEAD-02~~ | resolved | ~~`api.js` orphan exports~~ → dropped `designPrimers`/`validateGoldenGate`/`calcTm` (server-side; v0.6+ does these on the client). Kept `fetchParts`/`fetchConstructs`/`fetchFeatures`. |
| ~~DEAD-03~~ | resolved | ~~`hooks/useGeneratePrimers.js` orphan~~ → file deleted (~201 LOC). |
| ~~DEAD-05~~ | resolved | ~~`Annotator/PluginPanel.jsx` superseded~~ → file deleted (134 LOC). |
| DEAD-06 | pending | Duplicate `loadSavedDomains/persistDomains/DOMAINS_LS_KEY` in CDSEditor + region-types |
| ~~DEAD-11~~ | resolved | ~~`assembly-utils.js` domain helpers~~ → dropped `adjustDomains`/`convertDomainsToAnnotations` (~50 LOC). |
| ~~DEAD-12~~ | resolved | ~~`collections.js` `deleteCollection`/`renameCollection`~~ → dropped (~9 LOC). Reintroduce when a collections-management UI ships. |
| ~~DEAD-13~~ | resolved | ~~`OligoManager.jsx` private `calcTm` shadows the canonical SantaLucia impl~~ → import `calcTm` from `tm-calculator.js` directly; oligo-registry Tm now matches primer-design / junction-validation. |
| HOOK-01 | pending | `App.jsx` window drop handler — pattern fragile, but works via `getState()` |
| HOOK-04 | pending | `SequenceView` `useImperativeHandle` writes `performScrollRef` during render |
| HOOK-07 | pending | Annotator L1 auto-run effect doesn't include `sequence` in re-run key |
| HOOK-10 | pending | Verify `useAnnotationUndoRedo` itemKey effect doesn't reset stack on every type-edit |
| HOOK-12 | pending | `App.jsx` beforeunload handler rebinds on every project switch |
| ~~PERF-10~~ | resolved | ~~SingleInspector subscribes to 5 separate annotator slices~~ → single `useShallow` selector returns the 5 fields as one object; one shallow compare per tick instead of five `Object.is` compares. |
| ~~PERF-11~~ | resolved | ~~`mergeStripWithPredicted` runs in render body of SingleInspector with no memo~~ → wrapped in `useMemo` keyed on the 7 inputs; LinearFeatureBar gets a stable `stripAnnotations` ref across unrelated re-renders. |
| PERF-12 | pending | `SequenceView.annotations` flattens fragments[].annotations on every fragments shift |
| ~~PERF-13~~ | resolved | ~~`annotateRESites` 16 sequential `indexOf` scans~~ → single O(N) walk; sites bucketed by first base via `RE_BUCKETS` lookup; only enzymes whose recognition starts with the current char are tested. |
| PERF-14 | pending | AATrack `lineEndAbs` filter probes `row.map.keys()` per line |
| ~~PERF-15~~ | resolved | ~~`selectAllLibraryTags` walks all entries every call~~ → memoised on `libraryEntries` reference (same applied to `selectVisibleLibraryEntries`); consumers via `useStore(...)` now get stable array refs across unrelated store ticks. |
| SAFE-05 | pending | `siteToRegex` falls through to raw user char — guard inputs |
| SAFE-07 | pending | Empty `catch {}` swallows IndexedDB / localStorage failures silently |
| SAFE-11 | pending | `ProtocolTracker` reparses localStorage in effect, zeroes state on bad JSON |
| TEST-11 | pending | Toast `useFakeTimers` per-test — global `afterEach` safer |
| TEST-12 | pending | `lib/strings.js` coverage guard only checks IMPORTER_STRINGS namespace |
| TEST-13 | pending | `lib/pwa-install.js` zero tests |

---

## Next iteration

Topmost actionable: **BUNDLE-10** (PWA precache fix) — one-line vite.config.js
change, no test impact, big first-install savings (~24 MB → small).

After that: HOOK-09 (CatalogColumn render-side-effect), then PERF-05 (revComp
generalization), DEAD-04 (stranded panels), DEAD-13 (calcTm shadow).
