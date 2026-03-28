# PlasmidVCS Changelog

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
