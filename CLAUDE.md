# CLAUDE.md — PlasmidVCS

## What is this project

PlasmidVCS — version control + visual design system for genetic constructs (plasmids).
Two layers: Python CLI backend (diff, versioning, assembly) + React SPA frontend (construct designer).

## Repository structure

```
RESplasmide/
├── CLAUDE.md                       ← you are here
├── CHANGELOG.md                    ← full change log
├── pyproject.toml                  ← Python package config
│
├── docs/
│   ├── ARCHITECTURE_v2.md          ← ★ data model spec (Part, Fragment, Junction, Primer)
│   ├── AUDIT_RU.md                 ← architecture audit with priorities
│   ├── ROADMAP_v2.md               ← development roadmap
│   └── architecture.md             ← original architecture doc
│
├── src/pvcs/                       ← Python backend
│   ├── cli.py                      ← Click CLI
│   ├── diff.py                     ← ★ semantic diff engine
│   ├── assembly_engine.py          ← assembly operations
│   ├── golden_gate.py              ← GG assembly
│   ├── kld.py                      ← KLD mutagenesis
│   ├── overlap.py                  ← overlap designer
│   ├── primers.py                  ← primer registry
│   ├── utils.py                    ← Tm calc (SantaLucia NN), RC, GC, primer3-py integration
│   ├── parser.py                   ← GenBank parsing
│   ├── models.py                   ← dataclasses
│   ├── database.py                 ← SQLite
│   └── ...                         ← restriction, parts, strains, search, export
│
├── tests/                          ← Python tests (pytest, 112 tests)
│
└── gui/designer/                   ← ★ React SPA (Vite + Tailwind)
    ├── vite.config.js              ← Vite + React Compiler + Vitest
    ├── package.json                ← zustand, immer, react-dnd, vitest, happy-dom
    │
    └── src/
        ├── main.jsx                ← entry point
        ├── App.jsx                 ← root layout (~585 lines, pure wiring)
        │
        ├── store/                  ← ★ Zustand store (5 slices)
        │   ├── index.js            ← store creation, middleware, selectors, undo/redo
        │   ├── projectSlice.js     ← projects, assemblies, active selection
        │   ├── fragmentSlice.js    ← fragments CRUD, parts library
        │   ├── junctionSlice.js    ← junctions, Golden Gate, auto-adjust
        │   ├── primerSlice.js      ← assembly/custom primers, polymerase
        │   └── uiSlice.js          ← modals, tabs, expert mode
        │
        ├── hooks/                  ← ★ extracted handlers
        │   ├── useGeneratePrimers.js  ← async primer gen via API + protocol build
        │   └── useFragmentHandlers.js ← save, split, mutate, complete, clear
        │
        ├── components/             ← React components
        │   ├── DesignCanvas.jsx    ← ★ main canvas (3 view modes: blocks/sequence/map)
        │   ├── PartBlock.jsx       ← fragment block on canvas (mutations, domains, primers)
        │   ├── JunctionBlock.jsx   ← junction between blocks (overlap/GG/RE/KLD)
        │   ├── PartsPalette.jsx    ← parts library sidebar (expandable cards)
        │   ├── PartsLibrary.jsx    ← full parts library modal
        │   ├── FragmentEditor.jsx  ← ★ sequence editor (DNA/protein tabs, mutagenesis, color)
        │   ├── SequenceMapView.jsx ← SnapGene-like double-strand view
        │   ├── PlasmidMap.jsx      ← circular plasmid map (SVG)
        │   ├── ProtocolTracker.jsx ← staged protocol (PCR→assembly→transform)
        │   ├── PrimerPanel.jsx     ← primer table (3 categories)
        │   ├── SequenceViewer.jsx  ← construct sequence display
        │   ├── ExperimentSelector.jsx ← project switcher (ProjectBar)
        │   ├── AssemblyTabs.jsx    ← assembly tab bar
        │   ├── JunctionDNA.jsx     ← junction DNA visualization
        │   ├── DataManager.jsx     ← export/import modal
        │   ├── AddFragmentModal.jsx
        │   ├── FragmentSplitter.jsx
        │   ├── MutagenesisWizard.jsx
        │   ├── OligoManager.jsx
        │   ├── ConcentrationInput.jsx
        │   ├── ExperimentStats.jsx
        │   ├── RestrictionPanel.jsx
        │   └── VerificationPanel.jsx
        │
        ├── __tests__/             ← Frontend tests (Vitest, 193 tests)
        │   ├── tm-calculator.test.js
        │   ├── golden-gate.test.js
        │   ├── codons.test.js
        │   ├── mutagenesis.test.js
        │   ├── validate.test.js
        │   ├── biology.test.js
        │   └── modules.test.js
        │
        ├── tm-calculator.js       ← SantaLucia 1998 NN Tm (±1-2°C)
        ├── golden-gate.js         ← GG enzyme DB, overhang design, validation
        ├── mutagenesis.js         ← inline mutagenesis, common substitutions, KLD primers
        ├── assembly-utils.js      ← efficiency, planning, domain adjustment
        ├── part-variants.js       ← variant detection, family collection
        ├── validate.js            ← construct warnings, primer quality, identical fragments
        ├── codons.js              ← codon table, translation, optimization
        ├── sbol-glyphs.jsx        ← 27 SBOL Visual 3.0 SVG glyphs
        ├── domain-detection.js    ← signal peptide, His-tag auto-detection
        ├── exports.js             ← GenBank export, data export/import
        ├── protocol-data.js       ← PCR mixes, assembly protocols
        ├── theme.js               ← Okabe-Ito colors, custom types
        ├── collections.js         ← part collections CRUD
        ├── inventory.js           ← PCR products, verified plasmids
        ├── primer-reuse.js        ← primer registry matching
        ├── part-descriptions.js   ← ~30 part tooltips
        ├── api.js                 ← backend API calls
        └── i18n.js                ← Russian/English translations
```

## Tech stack

| Layer | Tech | Version |
|-------|------|---------|
| Frontend | React | 19.x |
| Build | Vite | 8.x |
| CSS | Tailwind | 4.x |
| State | Zustand + Immer | 5.x |
| Compiler | React Compiler | 1.0 |
| DnD | react-dnd | 16.x |
| Tests (JS) | Vitest + happy-dom | 4.x |
| Backend | Python | 3.11+ |
| Bio | BioPython | ≥1.83 |
| Tm (optional) | primer3-py | ≥2.0 |
| CLI | Click + Rich | ≥8.1 |
| Tests (Py) | pytest | ≥8.0 |

## Architecture principles (from audit)

1. **Zustand store** — 5 domain slices, no useState in App.jsx. Selectors with shallow equality.
2. **React Compiler** — automatic memoization, no manual useMemo/useCallback.
3. **SantaLucia 1998 NN** — Tm calculator on both frontend and backend (±1-2°C).
4. **Prefix sum array** — O(1) coordinate transforms for primer positions.
5. **Character-grid rendering** — Sequence View uses same monospace char grid for annotations, primers, AA.
6. **Undo/redo** — manual snapshot stack (debounced 300ms, max 50 levels).
7. **Throttled persist** — localStorage writes max 1/sec.
8. **devtools only in DEV** — conditional middleware for production perf.

## Key commands

```bash
# Frontend
cd gui/designer
npm run dev          # start dev server (port 3000)
npm run build        # production build
npm test             # run 193 Vitest tests

# Backend
pip install -e ".[dev]"
pytest tests/ -v     # run 112 Python tests

# Full build check
cd gui/designer && npx vite build && npx vitest run
```

## Data flow

```
User action → Zustand store action → Immer draft mutation → React re-render
                                   → pushUndo() snapshot
                                   → throttled localStorage persist

Generate primers: App.jsx → useGeneratePrimers hook → API call → store.updateActive()
Save fragment:    FragmentEditor → useFragmentHandlers → variant creation + KLD primers
```

## What NOT to do

- Don't add useState to App.jsx — use store slices
- Don't use absolute pixel positioning for sequence annotations — use character grid (ch units)
- Don't deep-clone state on every action — use shallow snapshots, deep clone only on undo/redo
- Don't use zundo (temporal middleware) — incompatible with our middleware stack
- Don't compute derived values in useEffect — use useMemo or store selectors
- Don't use Context for shared state — Zustand selectors are more performant
