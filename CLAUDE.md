# CLAUDE.md — PlasmidVCS / BodgeGene

## Quick context restore (after /clear)

> **Запрос для восстановления контекста:**
> `Прочитай CLAUDE.md, PROJECT_STATE.md и CURRENT_TASK.md из C:\Users\Zoman\Desktop\RESplasmide`
>
> Этих трёх файлов достаточно для полного восстановления. Читай в таком порядке:
> 1. **CLAUDE.md** (этот файл) — архитектура, структура, правила
> 2. **PROJECT_STATE.md** — текущее состояние, журнал сессий, баги
> 3. **CURRENT_TASK.md** — конкретное задание для выполнения
>
> Дополнительно (по необходимости):
> - **DECISIONS.md** — архитектурные решения (не пересматривать!)
> - **docs/INDEX.md** — индекс всей документации

---

## What is this project

PlasmidVCS (UI: BodgeGene) — version control + visual design system for genetic constructs (plasmids).
Two layers: Python CLI backend (diff, versioning, assembly) + React SPA frontend (construct designer).

**Author:** Igor Sinelnikov, FRC Biotechnology RAS
**Repository:** https://github.com/isinelnikov/plasmidvcs
**Local path:** `C:\Users\Zoman\Desktop\RESplasmide`

---

## Repository structure

```
RESplasmide/
├── CLAUDE.md                       ← you are here (architecture + rules)
├── PROJECT_STATE.md                ← dynamic state (modules, bugs, session log)
├── CURRENT_TASK.md                 ← current task for Claude Code
├── DECISIONS.md                    ← architectural decisions (append-only)
├── CHANGELOG.md                    ← version history
├── TEST_RESULTS.md                 ← code audit results (40 tests)
├── PALETTE_SPEC.md                 ← palette + modes specification
├── pyproject.toml                  ← Python package config
│
├── docs/                           ← detailed specifications
│   ├── INDEX.md                    ← ★ master index of all docs
│   ├── ARCHITECTURE_v2.md          ← ★ data model spec (Part, Fragment, Junction, Primer)
│   ├── ASSEMBLY_ENGINE_v2.md       ← assembly + primer design spec
│   ├── PART_MODEL.md               ← part inheritance + versioning
│   ├── REFACTORING_ANNOTATIONS.md  ← region-based annotation architecture
│   ├── AUDIT_RU.md                 ← architecture audit (10 findings)
│   ├── ROADMAP_v2.md               ← development roadmap (15 modules)
│   ├── DOCUMENTATION_SYSTEM.md     ← how docs work
│   ├── plasmide_operator           ← plasmid operations spec (wizard/viewer)
│   └── hand_test                   ← manual testing checklist
│
├── src/pvcs/                       ← Python backend (22 modules, 6600+ lines)
│   ├── cli.py                      ← Click CLI (pvcs command)
│   ├── diff.py                     ← ★ semantic diff engine
│   ├── assembly_engine.py          ← core assembly algorithms
│   ├── golden_gate.py              ← GG assembly (5 enzymes)
│   ├── kld.py                      ← KLD mutagenesis (NEB #M0554)
│   ├── overlap.py                  ← Gibson/overlap assembly
│   ├── primers.py                  ← primer registry + generation
│   ├── utils.py                    ← Tm calc (SantaLucia NN), RC, GC, primer3-py
│   ├── parser.py                   ← GenBank parsing
│   ├── models.py                   ← dataclasses (Project, Construct, Feature, Part, Strain)
│   ├── database.py                 ← SQLite storage
│   ├── parts.py                    ← part library management
│   ├── strains.py                  ← strain registry (YAML)
│   ├── search.py                   ← search across constructs
│   ├── export.py                   ← GenBank export
│   ├── restriction.py              ← RE database
│   ├── feature_db.py               ← feature database
│   ├── intron_detection.py         ← intron/exon detection
│   └── config.py                   ← project init
│
├── tests/                          ← Python tests (pytest, 112 tests)
│   ├── conftest.py
│   ├── test_assembly.py, test_cli.py, test_database.py, test_diff.py
│   ├── test_golden_gate.py, test_kld.py, test_overlap.py, test_primers.py
│   ├── test_parser.py, test_parts.py, test_search.py, test_strains.py
│   ├── test_feature_db.py, test_introns.py
│   └── fixtures/                   ← test data (real plasmid .gb files)
│
├── gui/
│   ├── api/server.py               ← FastAPI REST API (~250 lines)
│   │
│   └── designer/                   ← ★ React SPA (Vite + Tailwind)
│       ├── vite.config.js          ← Vite + React Compiler + Vitest
│       ├── package.json            ← react 19, zustand 5, tailwind 4, vitest
│       │
│       └── src/
│           ├── main.jsx            ← entry point
│           ├── App.jsx             ← root layout (~585 lines, pure store wiring)
│           │
│           ├── store/              ← ★ Zustand store (5 domain slices)
│           │   ├── index.js        ← store creation, middleware, undo/redo
│           │   ├── projectSlice.js ← projects, assemblies, active selection
│           │   ├── fragmentSlice.js← fragments CRUD, parts library
│           │   ├── junctionSlice.js← junctions, Golden Gate, auto-adjust
│           │   ├── primerSlice.js  ← assembly/custom primers, polymerase
│           │   └── uiSlice.js      ← modals, tabs, expert mode
│           │
│           ├── hooks/              ← extracted handlers
│           │   ├── useGeneratePrimers.js
│           │   └── useFragmentHandlers.js
│           │
│           ├── components/         ← 20+ React components
│           │   ├── DesignCanvas.jsx      ← ★ canvas (3 views: blocks/sequence/map)
│           │   ├── PartBlock.jsx         ← fragment block (mutations, domains, primers)
│           │   ├── JunctionBlock.jsx     ← junction (overlap/GG/RE/KLD)
│           │   ├── PartsPalette.jsx      ← parts library sidebar
│           │   ├── PartsLibrary.jsx      ← full parts library modal
│           │   ├── FragmentEditor.jsx    ← ★ sequence editor (DNA/protein/mutagenesis)
│           │   ├── SequencePreview.jsx   ← compact sequence view (60nt lines)
│           │   ├── SequenceMapView.jsx   ← SnapGene-like double-strand
│           │   ├── PlasmidMap.jsx        ← circular plasmid map (SVG)
│           │   ├── PlasmidViewer.jsx     ← plasmid viewer modal
│           │   ├── ProtocolTracker.jsx   ← staged assembly protocol
│           │   ├── PrimerPanel.jsx       ← primer table (3 categories)
│           │   ├── SequenceViewer.jsx    ← construct sequence display
│           │   ├── ExperimentSelector.jsx← project switcher
│           │   ├── DataManager.jsx       ← export/import modal
│           │   ├── AddFragmentModal.jsx  ← add part dialog
│           │   ├── AnnotationEditor.jsx  ← annotation tree editor
│           │   ├── MutagenesisWizard.jsx ← mutagenesis workflow
│           │   └── ...                   ← ~10 more components
│           │
│           ├── __tests__/          ← Vitest tests (193 tests)
│           │
│           ├── tm-calculator.js    ← SantaLucia 1998 NN Tm (±1-2°C)
│           ├── golden-gate.js      ← GG enzyme DB, overhangs, validation
│           ├── mutagenesis.js      ← inline mutagenesis, KLD primers
│           ├── codons.js           ← codon table, translation
│           ├── validate.js         ← construct warnings, primer quality
│           ├── auto-annotate.js    ← auto-annotation (CDS, promoter, terminator)
│           ├── exports.js          ← GenBank export, data export/import
│           ├── sbol-glyphs.jsx     ← 27 SBOL Visual 3.0 glyphs
│           ├── i18n.js             ← Russian/English translations
│           ├── api.js              ← backend API calls
│           └── ...                 ← ~15 more utility modules
│
├── gui/parts/                      ← parts library data (.gb files by type)
├── gui/constructs/                 ← working plasmid files
├── gui/strains/                    ← strain registry (YAML)
└── scripts/                        ← utility scripts
```

---

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
| GG fidelity (optional) | tatapov | ≥0.1 |
| CLI | Click + Rich | ≥8.1 |
| Tests (Py) | pytest | ≥8.0 |

---

## Architecture principles

1. **Zustand store** — 5 domain slices, no useState in App.jsx. Selectors with shallow equality.
2. **React Compiler** — automatic memoization, no manual useMemo/useCallback.
3. **SantaLucia 1998 NN** — Tm calculator on both frontend and backend (±1-2°C).
4. **Prefix sum array** — O(1) coordinate transforms for primer positions.
5. **Character-grid rendering** — all sequence views use monospace `ch` units for annotations, primers, AA.
6. **Undo/redo** — manual snapshot stack (debounced 300ms, max 50 levels).
7. **Throttled persist** — localStorage writes max 1/sec.
8. **devtools only in DEV** — conditional middleware for production perf.
9. **Three annotation levels** — region (CDS/promoter) > detail (signal_peptide/intron) > point (start_codon/RE site).
10. **Part versioning** — mutations create child variants (never overwrite original). derivation types: mutation, split, fusion, insertion, deletion, intron_removal.

---

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

# Full build check (run after every change!)
cd gui/designer && npx vite build && npx vitest run
```

---

## Data flow

```
User action → Zustand store action → Immer draft mutation → React re-render
                                   → pushUndo() snapshot (debounced 300ms)
                                   → throttled localStorage persist (1/sec)

Generate primers: App.jsx → useGeneratePrimers hook → API call → store.updateActive()
Save fragment:    FragmentEditor → useFragmentHandlers → variant creation + KLD primers
Add to canvas:    PartsPalette drag → addFragment() → if circular+regions: PlasmidUseWizard
```

---

## What NOT to do

- Don't add `useState` to App.jsx — use store slices
- Don't use absolute pixel positioning for sequence annotations — use character grid (`ch` units)
- Don't deep-clone state on every action — use shallow snapshots, deep clone only on undo/redo
- Don't use zundo (temporal middleware) — incompatible with our middleware stack
- Don't compute derived values in useEffect — use useMemo or store selectors
- Don't use Context for shared state — Zustand selectors are more performant
- Don't use manual useMemo/useCallback — React Compiler handles it
- Don't overwrite original Parts on mutation — always create child variant with parentId

---

## Documentation system

### Core files (root of repo)

| Файл | Тип | Назначение | Когда читать |
|------|-----|-----------|-------------|
| **CLAUDE.md** | Статичный | Архитектура, правила, структура | Claude Code: **ПЕРВЫМ** |
| **PROJECT_STATE.md** | Динамический | Статусы модулей, баги, журнал сессий | При старте сессии |
| **CURRENT_TASK.md** | Задание | Конкретные задачи для выполнения | После CLAUDE.md |
| **DECISIONS.md** | Append-only | Архитектурные решения | Не пересматривать! |
| **CHANGELOG.md** | Версионный | История версий | При ревью |
| **TEST_RESULTS.md** | Аудит | Результаты 40 тестов, список багов | Контекст багов |
| **PALETTE_SPEC.md** | Спецификация | Палитка, режимы, DnD | При работе с UI |

### Detailed specs (docs/)

| Файл | Назначение |
|------|-----------|
| **docs/INDEX.md** | Мастер-индекс всей документации |
| **docs/ARCHITECTURE_v2.md** | ★ Модель данных (Part, Fragment, Junction, Primer) |
| **docs/ASSEMBLY_ENGINE_v2.md** | Движок сборки + праймер-дизайн |
| **docs/PART_MODEL.md** | Наследование Part + версионирование |
| **docs/REFACTORING_ANNOTATIONS.md** | Region-based аннотации |
| **docs/AUDIT_RU.md** | 10 findings аудита + приоритеты |
| **docs/ROADMAP_v2.md** | Roadmap на 15 модулей |
| **docs/plasmide_operator** | PlasmidUseWizard + PlasmidViewer спека |
| **docs/hand_test** | Чеклист ручного тестирования |

### Workflow

```
Claude Code сессия:
1. Читай CLAUDE.md → правила и архитектура
2. Читай PROJECT_STATE.md → где мы сейчас
3. Читай CURRENT_TASK.md → что делать
4. Выполняй задачу
5. Проверяй: cd gui/designer && npx vite build && npx vitest run
6. ОБНОВЛЯЙ документацию:
   - PROJECT_STATE.md → новая запись в журнале сессий + статусы
   - CURRENT_TASK.md → отметь выполненные задачи
   - DECISIONS.md → если принято архитектурное решение
```

---

## Key domain concepts

| Термин | Что это |
|--------|---------|
| **Part** | Генетический элемент в библиотеке (CDS, promoter, terminator...) |
| **Fragment** | Part размещённый на canvas сборки |
| **Junction** | Соединение между фрагментами (overlap/GG/RE/KLD) |
| **Assembly** | Конструкт = набор фрагментов + junctions |
| **Primer** | Олигонуклеотид для ПЦР (assembly/custom/verification) |
| **Annotation** | Разметка на Part (3 уровня: region > detail > point) |
| **Variant** | Дочерний Part (mutation/split/fusion от родителя) |
| **Topology** | circular (плазмида) или linear (фрагмент) |
