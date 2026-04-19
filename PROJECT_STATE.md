# PROJECT_STATE.md — BodgeGene

> **Обновлено:** 20 апреля 2026
> **Версия:** v0.5.0-alpha (~227 коммитов)
> **Тесты:** 746 (634 Vitest + 112 pytest)

---

## Что работает

### Canvas & UI
- Canvas: 4 вида (Blocks, Sequence, Map, Racetrack) + Project Flow DAG
- CSS zoom (не transform) — скролл работает корректно, auto-fit при изменении фрагментов
- Quick Start панель при пустом canvas (7 workflow actions + Каталог SnapGene)
- Smart Import modal (ImportDecisionModal) — выбор действия при file drop
- ImportPrompt — "Импортируйте вектор" при пустой библиотеке (restriction/mutagenesis)
- ActionBar: sticky панель после расчёта праймеров (протокол, заказ олигов, GenBank, завершить сборку)
- Header: polymerase/prefix в ⚙️ Настройки dropdown (position: top-full, не обрезается)
- Breadcrumb: Проект → Сборка навигация (Construct ↔ Flow)
- SnapGene Каталог (📚 Каталог в header): 2822 плазмид, 19 категорий, lazy-loaded
- Drag-and-drop фрагментов из палитры
- Click = select, двойной клик = edit, R/E/Del/Ctrl+C/Ctrl+D
- Compact header, type-dependent context menu
- Undo/Redo (50 levels)

### Assembly & Primer Design
- Авто-расчёт праймеров (клиентский, без API)
- 6 методов сборки: Overlap PCR, Gibson, Golden Gate, KLD, RE ligation, Restriction Cloning
- Merged fragments (склейка Ctrl+Click, развёртывание)
- Merge через ligation junction → заблокирован с warning
- Adaptive overlap (No-PCR сосед → full overlap)
- Tag-aware primer design (`findBindingTagAware()` — extend past low-complexity tags)
- Мутагенез + KLD primer design
- Фрагменты <18bp → warning "merge с соседним (Ctrl+Click)"

### PlasmidViewer
- Circular map: track-based arc layout (features по дорожкам, не пересекаются)
- Single-plasmid rendering (mapFragments = [{whole plasmid}], не массив регионов)
- Region selection: onSelectRegion callback → подсветка на карте + scroll к последовательности
- Sequence view: двуцепочечная + AA-трансляция + region labels + цветовой фон
- Первый нуклеотид: sanitize (strip BOM/null) — без артефакта ∅/N
- Footer action buttons: 🔪 Клонировать / ⚗️ Как backbone / 🔄 Мутагенез / 🧬 cDNA / GenBank
- presetMode instant actions: "Как backbone" → сразу на canvas (handleUseWhole), без меню
- RE sites toggle (1x / ≤2x / All)
- CDS validation warnings

### Restriction Cloning
- 3-step wizard: ферменты → insert → preview + создание на canvas
- Junction Sequence Preview на шаге 3: backbone + RE-site + insert, цветовое кодирование
- Reading frame check: "в рамке" / "не в рамке" warning
- digest() + checkDoubleDigest() + checkInsertSites() + checkReadingFrame() + generateRETail()
- RE-тейлы на праймерах (protective bases + site)
- Ligation junction display (🔪, red-400)

### SnapGene Каталог
- plasmids-index.json (~867KB): 2822 плазмид, 19 категорий, без sequences
- plasmids-data/*.json (19 файлов): lazy-loaded по категориям
- CatalogPanel: поиск по имени/feature, фильтр по категории
- Действия: В библиотеку / Просмотреть / Клонировать / Как backbone
- HTML в описаниях: stripHtml()
- Attribution: snapgene.com/resources

### Annotations
- 3-level model: region > detail > point (НЕТ отдельного domains[])
- Auto-annotate: CDS (signal peptide, tags, domains), promoter (-10/-35/TATA/CAAT), terminator (poly-A)
- RE sites: 63 фермента с IUPAC regex (restriction-db.js)
- ORF detection: ATG→stop ≥100aa, обе цепи, 3 рамки
- CRIT-1 fixed: DNA insert/delete в FragmentEditor сдвигает аннотации
- CRIT-2 fixed: autoAnnotate() перезапускается после мутаций (useEffect 500ms debounce)
- CRIT-4 fixed: flipFragment в GG → re-run autoDesignGGOverhangs() + apiWarning
- HIGH-1 fixed: flipFragment инвертирует strand аннотаций

### Import/Export
- .dna import: свой binary парсер (snapgene_parser.py) PRIMARY, BioPython FALLBACK
- .gb/.gbk import: parseGenBank (frontend) + enrichment pipeline
- .fasta import: sequence only + enrichment
- Enrichment: common-features.json (415 фичей из 2822 SnapGene плазмид) + ORF detection
- GenBank export, протокол export, clipboard

### Parts Library
- 94+ parts, draft/verified/archived lifecycle
- Duplicate detection при добавлении
- Part variants (мутагенез → новый part)
- Split/fuse/insert/delete operations
- Двойной клик "Создать фланки" — protection от дублирования

### Project Flow
- 5 node types (PlasmidNode, PCRNode, AssemblyNode, OligoNode, CheckpointNode)
- 3 edge types, dagre layout
- PCR node edit, real assemblies, MIRO+ с RE/KLD/лигирование

## Открытые баги

**BUGS.md** — 0 критичных, 0 высоких. 5 средних, 5 низких. 1 feature request (F1: custom primers).

## Что дальше

**Текущий статус:** Блоки 4b–10d завершены (03.04.2026). Визуальное тестирование проведено.

### Roadmap до публикации
1. Оставшиеся MED/LOW баги (один блок)
2. Docker Compose deployment
3. GitHub README + screenshots
4. Статья (Bioinformatics / JOSS)

---

## Журнал сессий

### Сессия 19–20.04.2026 — Sprint 1: Читаемые метки, чистые стыки, настоящий мутагенез

**Три класса багов в одном спринте, 7 коммитов.**

1. ✅ **V5 contrast (`7521dcb`):** `getTextColor(bgHex)` helper + luminance-aware текст в `AnnotationEditor.jsx` annotation bar. 7 тестов.
2. ✅ **V3 junction reset (`50d8bf0`):** `resetJunctionForType(j, newType)` helper + 6 call-sites в `JunctionBlock.jsx`. 6 тестов.
3. ✅ **V3-bulk (`67ae2ee`):** `App.jsx:460` bulk GG-switch через тот же helper. 1 тест.
4. ✅ **V4 mutagenesis helper (`e0f48cd`):** `buildMutagenesisPayload(result, ctx)` чистая функция + `isMutagenesis` guard в `App.jsx` useEffect. 6 тестов.
5. ✅ **V4 Wizard path (`20e7df0`):** `MutagenesisWizard.onComplete` расширен (strategy/primers/protocol/warnings/templateName), `handleMutagenesis` через helper. 3 integration-теста.
6. ✅ **V4 overlap bridge (`ea96ca2`):** `local-primer-design.js` приоритезирует `junction.overlapSequence` над WT-флангами в split-mode. 2 теста.
7. ✅ **V4 in-place (`2f66348`):** `handleSaveFragment` переписан — computeMutagenesisStrategy выбирает KLD vs two/multi_fragment, дробит фрагмент на N с annotation split. No-PCR guard. 5 integration-тестов.

**Все визуальные проверки из спеки — ожидают верификации Игорем на реальных плазмидах (pUC118, pET-28a, pDHG25).**

Тесты: 604 → **634 ✅** (+30, совпало с прогнозом спеки ровно). Pytest: **112 ✅**. Build: clean на каждом коммите.

Новый MED баг в OPEN: `MUTWIZ-SANITIZE` (MutagenesisWizard textarea не ходит через `sanitizeSequence`).

### Сессия 18.04.2026 — Этап 1.2: TYPE_MAP пересмотр в import-annotations.js

1. ✅ **Backend diff:** `snapgene_parser.py` `_TYPE_MAP['gene']: 'CDS'` → `'gene'` (1 строка). Pytest 112 ✅.
2. ✅ **REGION_TYPES расширен:** `gene`, `mRNA`, `tRNA`, `rRNA`, `ncRNA`, `misc_RNA`, `oriT`, `misc_binding`, `repeat_region`, `mobile_element`, `D-loop` (+11 новых).
3. ✅ **DETAIL_TYPES расширен:** `CAAT_signal`, `polyA_site`, `stem_loop`, `unsure` (+4 новых).
4. ✅ **TYPE_MAP переписан:** удалены ошибочные `gene/mRNA → CDS`, `oriT → rep_origin`. `gene` обрабатывается через `normalizeGeneType(feat)` по `/ncRNA_class` и `/product` (tRNA/rRNA regex).
5. ✅ **DETAIL_TYPE_MAP переписан:** `mat_peptide/domain/region → catalytic` заменены на identity, `transit_peptide → signal_peptide` → `transit_peptide`, `motif → binding` → `motif`. Новые: `CAAT_signal`/`GC_signal` → `core_promoter`, `polyA_site` → `poly_a`, `propeptide`/`disulfide_bond`/`stem_loop`/`unsure` явный identity.
6. ✅ **Gene-filter расширен:** `GENE_CHILD_TYPES` (CDS + 5 RNA-типов). Раньше фильтровал только CDS-children.
7. ✅ **`normalizeType(type, feat)`:** сигнатура расширена. Без `feat` — `gene` уходит в `misc_feature` (TYPE_MAP его не содержит).
8. ✅ **`EXON_BEARING_TYPES`:** `CDS`+`gene`+`mRNA` — покрывает intron-извлечение из `qualifiers.exons`.
9. ✅ **`extractColor`:** учитывает `ApEinfo_revcolor` для `strand === -1`.
10. ✅ **`strand: feat.strand || 1`** добавлен в 3 push-объекта (detail branch, point branch, unknown-heuristic detail), + в intron-push.
11. ✅ **`ANNOTATION_COLORS` +14 ключей:** mRNA/tRNA/rRNA/misc_RNA/oriT/repeat_region/mobile_element/D-loop, mat_peptide/transit_peptide/motif/region/unsure/stem_loop. `ncRNA`/`domain`/`gene`/`RBS` — не перезаписаны (уже существовали).
12. ✅ **Тесты:** +20 новых в `import-annotations-typemap.test.js` (red-first → green), 5 правок в `import-annotations.test.js` (обновлённые ожидания + фикстура `misc_RNA`→`weird_feature` т.к. `misc_RNA` стал known region).
13. ✅ **Известное ограничение:** legacy `catalytic` annotations из предыдущих импортов сохраняются как есть (information loss необратим, миграцию v7→v8 не делаем).
14. ✅ Vitest: **604 ✅** (было 583, +21), Build: ✅, Pytest: **112 ✅**.

### Сессия 18.04.2026 — Этап 1.1: Центральный sanitizeSequence

1. ✅ **P2-arch:** единая `sanitizeSequence` в `sequence-utils.js` + экспорт `IUPAC_DNA_REGEX`/`IUPAC_DNA_CHAR_REGEX`
2. ✅ Применено на **9 точках входа** (заявлено 7 — в процессе найдены 2 дополнительные: `file-import.js` backend `.dna` return + `AddFragmentModal.extractFeature` из API)
3. ✅ Удалён `AddFragmentModal.clean` helper (17 использований) — всё через `sanitizeSequence`
4. ✅ **P-wizard-iupac** (скрытый баг): `PlasmidUseWizard` использовал `[^ATGCN]` без IUPAC
5. ✅ **P-addfrag-iupac** (скрытый баг): `AddFragmentModal.clean = [^ATCGNatcgn]` + 2 raw textarea
6. ✅ Store migration v6→v7 с санитизацией legacy-данных
7. ✅ Удалены inline workarounds из `local-primer-design.js` (×3) и `PlasmidViewer.jsx`
8. ✅ **4 разных buggy-regex** схлопнуты в один источник через `IUPAC_DNA_REGEX`
9. ✅ Тесты: 583 ✅ (+28 новых), Build: ✅

Ожидание задачи Этапа 1.2 (TYPE_MAP пересмотр) от Claude Chat.

## Журнал сессий 03.04.2026

### Сессия 03.04.2026 (12) — Блок 11b: P1v2 + P3b

1. ✅ **P1v2** (CRIT): App.jsx useEffect не очищал stale-праймеры при fragments<2 → добавлен else-branch с clearance
2. ✅ **P3b** (HIGH): AnnotationEditor region opacity 0.5→0.9, detail 0.85→0.7 → яркие цвета + читаемый текст
3. 2 новых теста в crit-fixes.test.js
4. Тесты: 555 ✅, Build: ✅

### Сессия 03.04.2026 (11) — Блок 11: Bugfix P1-P5

1. ✅ **P1** (CRIT): handleUseWhole StrictMode double-fire → useRef guard + partId dedup
2. ✅ **P2** (HIGH): ∅ в primer sequences → sanitize regex в designPrimersLocal + overlapTail
3. ✅ **P3** (HIGH): Блёклые цвета при re-import → dedup regions в PlasmidMap (визуальная верификация нужна)
4. ✅ **P4** (HIGH): Нет аннотаций на PartBlock → migratePartAnnotations в handleUseWhole
5. ✅ **P5** (MED): Нет Карта/Стадион → inherit circular topology в handleUseWhole
6. 4 новых теста в crit-fixes.test.js
7. Тесты: 553 ✅, Build: ✅

### Сессия 03.04.2026 (10) — Блок 10d: B10 presetMode + PlasmidMap в wizard

1. ✅ PlasmidUseWizard: useEffect для instant actions (use_whole, view, disassemble, mutate, versions) → вызов напрямую вместо setStep
2. ✅ PlasmidUseWizard: mapFragments = [{whole plasmid}] (не массив регионов)
3. ❌ Claude Code не применил fix → Игорь исправил вручную (import useEffect + обе правки)

### Сессия 03.04.2026 (9) — Блок 10c: Circular Map регрессии

1. ✅ PlasmidMap: +onSelectRegion callback, +selectedRegionId prop
2. ✅ Sub-arc: id региона передаётся при клике
3. ✅ Подсветка выбранного sub-arc
4. ✅ Opacity/colors fix — увеличены контрастность

### Сессия 03.04.2026 (8) — Блок 10b: Circular Map Fix (B2/B9)

**Корневая причина:** PlasmidViewer передавал перекрывающиеся регионы как "фрагменты" → сумма длин > totalBp → арки > 360° → спагетти.

1. ✅ PlasmidViewer: mapFragments = [{whole plasmid with annotations}]
2. ✅ PlasmidMap: subArcs condition > 0 (было > 1)
3. ✅ PlasmidMap: assignSubTracks() для перекрывающихся sub-arcs

### Сессия 03.04.2026 (7) — Блок 10: Visual Testing Bugfix

1. ✅ B1: sanitize seq — strip non-ATGCN (BOM/null)
2. ✅ B8: RE cloning junction preview в wizard step 3
3. ✅ B10: useEffect presetMode sync (первая версия — неполная)
4. ✅ B13: creating guard + disabled для "Создать фланки" / "Создать на canvas"
5. ✅ B2/B9: assignTracks() + per-track radius (первая версия — недостаточно)
6. ✅ B11: SequenceViewer per-fragment color rendering
7. ✅ B16: stripHtml() в CatalogPanel
8. ✅ B19: Settings dropdown → useState + absolute top-full

### Сессия 03.04.2026 (6) — Блок 9: First-time User Flow Fixes

1. ✅ App.jsx: удалён fallback dead code
2. ✅ PlasmidViewer: 3 action buttons (clone/backbone/mutate) + onOpenWizard prop
3. ✅ ImportPrompt.jsx (NEW): "Импортируйте вектор" при пустой библиотеке
4. ✅ DesignCanvas: pendingAction + dismissed states, 4 варианта empty canvas

### Сессия 03.04.2026 (5) — Блок 8: HIGH фиксы + SnapGene каталог

**8a: HIGH фиксы:**
1. ✅ HIGH-3: Merge через ligation junction → block + warning
2. ✅ HIGH-9: reorderFragments в GG → re-design overhangs
3. ✅ HIGH-6: 1 fragment → info warning
4. ✅ HIGH-10: removeFragment junction count verified

**8b: SnapGene каталог:**
5. ✅ build_catalog_index.py → plasmids-index.json (867KB) + 19 category JSONs
6. ✅ CatalogPanel.jsx (NEW): поиск, фильтр, on-demand loading, actions
7. ✅ App.jsx: 📚 Каталог в header + showCatalog state
8. ✅ QuickStart: +catalog action

### Сессия 03.04.2026 (4) — Блок 7: SYSTEM_AUDIT CRIT фиксы

1. ✅ CRIT-4 + HIGH-1: flipFragment — GG overhang re-design + strand flip
2. ✅ CRIT-1: FragmentEditor applyDnaDel/Insert — annotation shift
3. ✅ CRIT-2: autoAnnotate useEffect (500ms debounce)
4. ✅ CRIT-5: warning text "merge (Ctrl+Click)" + short fragment warning
5. ✅ 6 новых тестов в crit-fixes.test.js

### Сессия 03.04.2026 (3) — Блок 6: UX Polish

1. ✅ ActionBar.jsx: sticky панель
2. ✅ App.jsx: header → ⚙️ Настройки dropdown
3. ✅ App.jsx: breadcrumb Проект → Сборка

### Сессия 03.04.2026 (2) — Блок 5: Quick Start + Smart Import

1. ✅ QuickStart.jsx (NEW): 7 action buttons
2. ✅ ImportDecisionModal.jsx (NEW): Smart Import при file drop
3. ✅ uiSlice + App.jsx + PlasmidUseWizard: presetMode bypass

### Сессия 03.04.2026 (1) — Блок 4b: Restriction Cloning → Canvas

1. ✅ restriction-db.js: +5 функций + 21 тест
2. ✅ local-primer-design.js: RE-тейлы на праймерах + 6 тестов
3. ✅ PlasmidUseWizard: restriction_cloning wizard
4. ✅ protocol-data.js: restriction_cloning template
5. ✅ CRIT-3 FIXED
