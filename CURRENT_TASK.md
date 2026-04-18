# CURRENT_TASK.md — Этап 1.1: Центральный sanitizeSequence

**Статус:** ✅ ВЫПОЛНЕНО 18.04.2026
**Приоритет:** Высокий (P2-arch из BUGS.md)
**Фактическое время:** ~2 часа
**Ветка:** main

---

## Результат

P2 (∅ в последовательностях) и два скрытых IUPAC-бага решены архитектурно. `sanitizeSequence()` — единственная точка санитизации ДНК во всей кодобазе.

## Что сделано

### sequence-utils.js расширен
- `sanitizeSequence(seq)` — канонический порядок IUPAC: `ATGCNRYSWKMBDHV`
- `isValidDNA(seq)` — проверка без санитизации
- `hasInvalidChars(seq)` — диагностика (возвращает список проблемных символов)
- `IUPAC_DNA_REGEX` / `IUPAC_DNA_CHAR_REGEX` — экспортируемые константы для cursor-position logic (anti-drift)
- TODO-коммент про `COMPLEMENT_MAP` без IUPAC (известное ограничение, вынесено в BUGS.md v1.1)

### Применено на 9 точках входа (было заявлено 7)
1. **`genbank-parser.js:167`** — `result.sequence = sanitizeSequence(seqLines.join(''))`
2. **`file-import.js:24`** — FASTA: `sanitizeSequence(seqParts.join(''))`
3. **`file-import.js:61`** — backend `.dna` response: `data.sequence = sanitizeSequence(data.sequence)`
4. **`AddFragmentModal.jsx`** — удалён локальный `clean` helper (17 использований в файле), все заменены на `sanitizeSequence`. 3 textarea-onChange обёрнуты. Cursor regex переведён на `IUPAC_DNA_REGEX`/`IUPAC_DNA_CHAR_REGEX`. `extractFeature` (setSequence из API) санитизирует вход.
5. **`FragmentEditor.jsx`** — 3 места: `applyDnaInsert`, textarea seq, insertSeq input
6. **`PlasmidUseWizard.jsx`** — 2 места: `rcInsertSeq` parse + textarea onChange
7. **`SequenceEditor.jsx`** — useState initializer + textarea onChange

### Миграция store v6→v7
- `version: 6` → `version: 7` в `persistConfig` и `beforeunload` handler
- Новый шаг миграции: проход по `persisted.parts[*].sequence` и `persisted.assemblies[*].fragments[*].sequence` через `sanitizeSequence`
- `subFragments` не трогаем — производные от `parent.sequence`

### Inline workarounds удалены (Блок 11-era)
- `local-primer-design.js` — убран `.replace(/[^ATGCNRYSWKMBDHV]/g, '')` в 3 местах (`overlapTail` ×2, `designPrimersLocal`)
- `PlasmidViewer.jsx:45` — убран inline sanitize для display

### Скрытые баги, пойманные по пути (в FIXED секцию BUGS.md)
- **P-wizard-iupac:** `PlasmidUseWizard` использовал `[^ATGCN]` (без IUPAC) — R/Y/S/W/K/M/B/D/H/V стирались при импорте insert
- **P-addfrag-iupac:** `AddFragmentModal.clean = s.replace(/[^ATCGNatcgn]/g, '')` + 2 textarea без sanitize вообще + cursor-regex вариант

Итого схлопнули **4 разных buggy-regex варианта** в один источник:
- `[^ATGCNRYSWKMBDHV]` (local-primer-design, 3 места)
- `[^ATGCNRYWSMKHBVD]` (SequenceEditor + FragmentEditor, 4 места)
- `[^ATGCN]` (PlasmidUseWizard, 2 места)
- `[^ATCGNatcgn]` (AddFragmentModal, 17 использований)

## Тесты
- **+28 новых** в `sequence-utils.test.js` (BOM, null bytes, whitespace, digits, IUPAC, регрессии ∅/P-wizard-iupac, anti-drift между regex и sanitizeSequence)
- **Обновлён** crit-fixes P2 тест — теперь тестирует architecture contract (sanitize-at-entry), а не defensive depth внутри designPrimersLocal
- **Регрессия до удаления workaround:** 583/583 ✅
- **Регрессия после удаления workaround:** 583/583 ✅
- **`npx vite build`:** clean ✅

## Следующий шаг (Этап 1.2)

TYPE_MAP пересмотр в `import-annotations.js` — исправить семантические ошибки `mat_peptide → catalytic`, `gene → CDS`, `mRNA → CDS`, `transit_peptide → signal_peptide`. Ждать задачу от Claude Chat.
