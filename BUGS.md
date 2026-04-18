# BUGS.md — BodgeGene

Баги → сюда. Починены → `[x]`. Claude Code читает при старте сессии.

---

## OPEN

### Критичные

- [ ] **P1 (повтор):** 1 фрагмент → 4 праймера. Корень: App.jsx auto-design useEffect не очищает stale-праймеры.

### Высокие

- [ ] **P4 (повтор):** Нет аннотаций на PartBlock после «Как backbone». migratePartAnnotations не помог.

### Средние

- [ ] **P6:** Мутагенез: клик на 1 нуклеотид подсвечивает 2 соседних (весь кодон). При режиме "Нуклеотид → мутация ДНК" должен подсвечиваться только 1 нуклеотид, не триплет. 03.04.2026.

### Низкие

- [ ] **B7 (deferred):** GG overhang palette: stale state after re-render.

---

## FEATURE REQUESTS

- [ ] **F1:** Добавить свои праймеры на последовательность в PlasmidViewer. Primer mapping + визуализация на circular map и sequence view. Запрос 03.04.2026.

---

## FIXED

### 18.04.2026 — Этап 1.2: TYPE_MAP пересмотр в import-annotations.js

- [x] **TYPE_MAP:** Семантические ошибки в `import-annotations.js` исправлены. Region-level: `gene` → специализированная `normalizeGeneType(feat)` (по `/ncRNA_class` и `/product`), `mRNA`, `tRNA`, `rRNA`, `ncRNA`, `misc_RNA`, `oriT`, `repeat_region`, `mobile_element`, `D-loop` — собственные типы. Detail-level: `mat_peptide/domain/region → catalytic` заменены на identity, `transit_peptide → signal_peptide` → `transit_peptide`, `motif → binding` → `motif`. Новые маппинги: `CAAT_signal`/`GC_signal` → `core_promoter`, `polyA_site` → `poly_a`, `unsure`. Gene-filter расширен до всех RNA/CDS детей (`GENE_CHILD_TYPES`). `EXON_BEARING_TYPES` (`CDS`+`gene`+`mRNA`) для интрон-извлечения. `extractColor` учитывает `ApEinfo_revcolor` для strand=-1. `strand: feat.strand || 1` добавлен в 3 push-объекта (detail/point/unknown-heuristic). Backend: `snapgene_parser.py` `_TYPE_MAP['gene']` → `'gene'`. `ANNOTATION_COLORS` расширен 14 новыми ключами. +20 тестов в `import-annotations-typemap.test.js`, 5 правок в `import-annotations.test.js`.

### Известные ограничения (TODO v1.1)

- **Legacy-annotations с типом `catalytic`:** плазмиды в store из прошлых сессий могут содержать аннотации с типом `catalytic` (маппинг из `mat_peptide`/`domain`/`region` до Этапа 1.2). Автоматическая миграция невозможна — исходный INSDC-тип потерян. Render не ломается (`ANNOTATION_COLORS.catalytic` = `#2563EB` существует). Для получения корректных типов — переимпортировать исходный `.gb`/`.dna` файл.

### 18.04.2026 — Этап 1.1: Центральный sanitizeSequence (P2-arch)

- [x] **P2-arch:** Санитизация ДНК была в 3+ местах через разные regex. Fix: единая `sanitizeSequence()` в `sequence-utils.js` + экспортируемые константы `IUPAC_DNA_REGEX`/`IUPAC_DNA_CHAR_REGEX`. Применено на 9 точках входа: genbank-parser, file-import (FASTA + backend .dna), AddFragmentModal (clean helper + 3 onChange + extractFeature), FragmentEditor (3 места), PlasmidUseWizard (2 места), SequenceEditor (useState + textarea). Миграция store v6→v7 санитизирует legacy-данные. Inline workarounds удалены из local-primer-design (3 места) и PlasmidViewer. +28 тестов в `sequence-utils.test.js`.
- [x] **P-wizard-iupac:** `PlasmidUseWizard` использовал `[^ATGCN]` без IUPAC-кодов — IUPAC символы R/Y/S/W/K/M/B/D/H/V стирались при импорте insert. Fix: замена на `sanitizeSequence`.
- [x] **P-addfrag-iupac:** `AddFragmentModal` `clean` helper с `[^ATCGNatcgn]` (17 использований в файле) + 2 textarea без sanitize + cursor-position regex. Fix: централизация через `sanitizeSequence` + `IUPAC_DNA_REGEX`/`IUPAC_DNA_CHAR_REGEX` для cursor logic.

### Известные ограничения (TODO v1.1)

- `COMPLEMENT_MAP` не поддерживает IUPAC R/Y/S/W/K/M/B/D/H/V → `reverseComplement()` превращает их в N. Если реальные данные потребуют — расширить до полной IUPAC-таблицы.

### 03.04.2026 — Блок 11b

- [x] **P1v2:** 1 фрагмент "без ПЦР" → 4 stale-праймера. Fix: App.jsx useEffect else-ветка очищает stale primers при fragments<2. Блок 11b (03.04.2026).
- [x] **P3b:** Annotation bar — блёклые цвета + невидимый белый текст. Fix: region opacity 0.5→0.9, detail 0.85→0.7 в AnnotationEditor.jsx. Блок 11b (03.04.2026).
- [x] **P1:** 1 фрагмент "без ПЦР" → 4 праймера (дубли). Fix: useRef guard + partId dedup в handleUseWhole (StrictMode double-fire). Блок 11 (03.04.2026).
- [x] **P2:** ∅ в начале последовательности праймера. Fix: sanitize seq в designPrimersLocal + overlapTail. Блок 11 (03.04.2026).
- [x] **P3:** Circular map — блёклые цвета при повторном импорте. Fix: dedup regions по start-end-type в PlasmidMap. Блок 11 (03.04.2026). Требует визуальной верификации.
- [x] **P4:** Аннотации не отображаются на PartBlock после "Как backbone". Fix: migratePartAnnotations в handleUseWhole. Блок 11 (03.04.2026).
- [x] **P5:** Нет переключателя Карта/Стадион для backbone. Fix: inherit circular topology в handleUseWhole. Блок 11 (03.04.2026).
- [x] **B1:** Первый нуклеотид ∅/N в PlasmidViewer. Fix: sanitize seq. Блок 10 (03.04.2026).
- [x] **B2/B9:** Circular map спагетти. Fix: single plasmid + subArcs + assignSubTracks. Блок 10b-c (03.04.2026).
- [x] **B3:** RE cut markers в sequence view. Fix: reCutMap + inline markers. Блок 10b (03.04.2026).
- [x] **B4:** CDS validation ложные warnings. Fix: auto-trim к ATG + UTR hint. Блок 10b (03.04.2026).
- [x] **B5:** Region labels в sequence. Fix: color dot + name + length. Блок 10b (03.04.2026).
- [x] **B8:** RE junction preview. Fix: inline view в wizard step 3. Блок 10 (03.04.2026).
- [x] **B10:** presetMode instant actions. Fix: useEffect с handler dispatch. Блок 10d (03.04.2026).
- [x] **B11:** SequenceViewer plain text. Fix: per-fragment color. Блок 10 (03.04.2026).
- [x] **B12:** Несмежные регионы — verified корректно. Блок 10b (03.04.2026).
- [x] **B13:** Двойной клик дубли. Fix: creating guard. Блок 10 (03.04.2026).
- [x] **B14:** Дедупликация при импорте. Fix: mergeParts name+id check. Блок 10b (03.04.2026).
- [x] **B15:** Каталог topology. Fix: <1000bp→linear. Блок 10b (03.04.2026).
- [x] **B16:** HTML в каталоге. Fix: stripHtml. Блок 10 (03.04.2026).
- [x] **B17:** Circular map для 18bp. Fix: linear view <100bp. Блок 10b (03.04.2026).
- [x] **B18:** Ghost nodes Flow. Fix: filter missing partId. Блок 10b (03.04.2026).
- [x] **B19:** Settings dropdown обрезан. Fix: top-full. Блок 10 (03.04.2026).
- [x] **Hotkey hints** на пустом canvas. Fix: n>0 guard. Блок 10b (03.04.2026).
- [x] **CRIT-1..5, HIGH-1,3,6,9,10:** System audit фиксы. Блоки 4b, 7, 8a (03.04.2026).
- [x] **BUG-01..83:** Сессии 22-28.
