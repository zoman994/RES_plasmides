# SYSTEM_AUDIT.md — Системный анализ взаимодействий

**Дата:** 2 апреля 2026  
**Метод:** Матричный анализ всех комбинаций: 7 осей × полный перебор  
**Источники:** fragmentSlice.js, junctionSlice.js, local-primer-design.js, auto-annotate.js, TagFusionPicker.jsx, PlasmidUseWizard.jsx, mutagenesis.js, assembly-utils.js, exports.js, restriction-db.js

---

## CRITICAL (5) — ломают данные или результат

### CRIT-1: ДНК insert/delete в FragmentEditor НЕ сдвигает аннотации

**Путь:** FragmentEditor → applyDnaInsert() → setSeq() → аннотации НЕ обновлены  
**Что ломается:** Все аннотации после точки вставки/удаления имеют неправильные координаты  
**Подстановки (substitution) безопасны** — длина не меняется  
**Контраст:** createMutant() в fragmentSlice.js ПРАВИЛЬНО вызывает adjustAnnotationCoords(). Проблема только в прямом ДНК-редактировании через FragmentEditor  
**Fix:** После DNA insert/delete в FragmentEditor → вызвать adjustAnnotationCoords() или shiftAnnotations()

### CRIT-2: autoAnnotate() не перезапускается после мутаций в FragmentEditor

**Что ломается:** Detail-аннотации (His6, TATA box, -10/-35 элементы) не пересканируются после изменения ДНК. Промотор после мутации -10 элемента показывает "-10 element" на старом месте  
**Fix:** После DNA edit в FragmentEditor → re-run autoAnnotate() для изменённых регионов

### ~~CRIT-3: Смешанные junction types (overlap + ligation) — primer tail пустой~~ ✅ FIXED (03.04.2026)

**Путь:** overlapTail() для junction.type==='ligation' → return ''  
**Что ломалось:** Фрагмент между overlap и ligation junction получал tail только с одной стороны. RE-site tail не добавлялся автоматически  
**Fix:** `overlapTail()` в local-primer-design.js: ligation/re_ligation → `generateRETail(enzyme)` + rc() для reverse primer. Блок 4b.

### CRIT-4: Flip фрагмента в Golden Gate ломает сборку без предупреждения

**Что ломается:** GG overhangs направленные (non-palindromic). flipFragment() reverse-complement'ирует sequence → overhang инвертируется. Сборка невозможна  
**Fix:** После flipFragment(), если assembly = GG → re-run autoDesignGGOverhangs() + warning "GG overhangs пересчитаны после flip"

### CRIT-5: Фрагменты <18bp — весь фрагмент = binding, неспецифичный праймер

**Сценарий:** Standalone tag (His6=17bp) или linker (G4S×1=15bp) на canvas  
**Что ломается:** findBinding() minLen=18, фрагмент <18bp → binding = весь фрагмент + warning. Primer неспецифичен  
**Fix:** Warning "Фрагмент слишком короткий для специфичного праймера. Рассмотрите merge с соседним"

---

## HIGH (12) — неправильное поведение

### HIGH-1: flipFragment не переключает strand аннотаций

Координаты пересчитываются (seqLen - end, seqLen - start), но strand аннотаций не меняется. CDS strand=1 после flip должен стать strand=-1.

### HIGH-2: Tag insertion в merged fragment ломает subFragments

TagFusionPicker модифицирует TOP-level sequence merged фрагмента, но subFragments хранят свои lengths → несогласованность.

### HIGH-3: Merge через ligation junction биологически невозможен

Merge = "PCR одним праймером". Через ligation junction невозможно. Система не блокирует.

### ~~HIGH-4: N+N warning false positive для ligation~~ ✅ FIXED (03.04.2026)

Два фрагмента needsAmplification=false + ligation junction = valid (digest + ligate). Warning "overlap невозможен" уже проверяло `junc.type === 'overlap'`, поэтому ligation не триггерил warning. Подтверждено тестом в re-primer-tail.test.js.

### ~~HIGH-5: autoAdjustJunctions не учитывает ligation~~ ✅ FIXED (03.04.2026)

Автоматическая подстройка могла переключить ligation → overlap. Fix: guard `if (j.type === 'ligation' || j.type === 're_ligation') return;` в junctionSlice.js autoAdjustJunctions().

### HIGH-6: Single fragment circular → пустые праймеры

designPrimersLocal(): fragments.length < 2 → return empty. "Использовать целиком" → 1 fragment → нет праймеров.

### HIGH-7: Фрагменты >10kb — нет warning long-range PCR

PCR >10kb требует special polymerase. Нет предупреждения.

### HIGH-8: Primer names коллизия между assemblies

Два assembly с "XynTL" → оба P001_fwd_XynTL.

### HIGH-9: reorderFragments ломает GG overhangs

Junction с GG overhang привязан к конкретной паре. После reorder — overhang для неправильной пары.

### HIGH-10: removeFragment junction off-by-one edge case

При удалении последнего фрагмента в circular assembly может остаться лишний junction.

### HIGH-11: insertElement spanning annotation увеличивается вместо разрыва

Аннотация spanning insertion point — end увеличивается. Но биологически элемент нарушен.

### HIGH-12: enrichWithCommonFeatures async race condition

Import → autoAnnotate(sync) → enrichment(async). Пользователь редактирует до завершения → async может перезаписать.

---

## MEDIUM (6) — могут запутать

### MED-1: replaceFragment сохраняет old strand
### MED-2: deleteElement бессмысленные аннотации <3bp
### MED-3: use_whole circular → linear без warning
### MED-4: Undo не покрывает updateFragment/updateJunction
### MED-5: Flow DAG не обновляется при canvas changes
### MED-6: GenBank export не группирует nested annotations

---

## Матрица покрытия

| Ось анализа | Комбинаций | Проблем |
|---|---|---|
| A. Аннотации × мутации/операции | 6×3 = 18 | 4 (CRIT-1,2 + HIGH-1,2) |
| B. Assembly method × Junction × ops | 4×5×6 = 120 | 5 (CRIT-3,4 + HIGH-3,4,5) |
| C. Primer design × fragments | 8 scenarios | 4 (CRIT-5 + HIGH-6,7,8) |
| D. Fragment ops × state | 8×5 = 40 | 3 (HIGH-9,10 + MED-1) |
| E. Plasmid ops (wizard) | 9 modes | 3 (HIGH-11 + MED-2,3) |
| F. Cross-cutting | 6 concerns | 4 (HIGH-12 + MED-4,5,6) |
| **Итого** | **~200 комбинаций** | **4 CRIT + 10 HIGH + 6 MED = 20 open** (3 fixed: CRIT-3, HIGH-4, HIGH-5) |

---

## Потерянные баги из TEST_RESULTS.md (29 марта 2026)

Никогда не попали в BUGS.md. Добавлено 02.04.2026 при аудите документации.

### LOST-1 (HIGH): exportGenBank не сохраняет detail-аннотации

exports.js → exportGenBank() экспортирует только regions, но не detail/point аннотации. Нет bodgegene_level/bodgegene_regionId qualifiers.
Статус: не проверено

### LOST-2 (MED): PlasmidViewer нет автоскролла к региону

Клик в таблице аннотаций не скроллит к этому региону в последовательности. AnnotationEditor в PlasmidViewer без onSelect.
Статус: не проверено

### LOST-3 (LOW): Diff не показывает АК-замены

PlasmidVersionTree diff panel показывает только нуклеотидные замены, но не D36→E36.
Статус: не проверено

### LOST-4 (MED): SequencePreview не обрабатывает интроны

SequencePreview.jsx не показывает lowercase/hatching для интронов. Только PlasmidViewer это делает.
Статус: не проверено
