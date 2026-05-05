# Sprint M-X.2-fix — Архитектурная санация перед визуальной приёмкой

**Тип:** D (mini-spec, точечные фиксы) + одна архитектурная правка контракта Library
**Объём:** ~6 K-шагов, ~5–10 KB патча
**Ветка:** продолжаем `feature/sequence-view-feature-strip`
**Базовый коммит:** `d36d27ab` (последний из bug bash на 05.05.2026)
**Целевой коммит:** один merge-commit `m-x.2-fix` после всех K-шагов

---

## TL;DR

После 70-коммитного bug bash bug bash вылилось в новый функционал (sub-features, FeatureEditorModal, three-level Annotator, embedded Annotator в AnnotationsTab, PreImportModal, English UI) — это всё хорошо и остаётся. Но три проблемы блокируют приёмку:

1. **Library write-through нарушает продуктовую модель.** Каждый drag-handle / Del / rename автоматически перезаписывает Library entry. Биолог фиксировал: правки фичей сохраняются **explicit** через выбор «перезаписать» или «сохранить как версию», а не silently. Удалить write-through из `SingleInspector.onUpdateEdits`, заменить bug «иконка не обновляется в каталоге» на render-time merge.
2. **Hard violations размеров файлов** — `SingleInspector.jsx` 43.96 KB (+4 KB над hard 40), `AnnotationTrack.jsx` 40.65 KB (+0.65 KB), `uiSlice.js` 27.17 KB (+2 KB над hard 25). Систематическое нарушение ⚓ DECISIONS 22.04.2026.
3. **`mergeStripWithPredicted` 84-строчный helper inline в SingleInspector** — должен быть в `lib/annotation-edit.js`.

K1 — фундамент (контракт Library). K2-K6 — декомпозиция god-component'ов и extracts. После — **приёмка** на чистой архитектуре.

Save flow «перезаписать в библиотеке / сохранить как версию» — **отдельный sprint M-X.4 «Library Save Flow»**, спека идёт после этого fix sprint'а.

---

## §1 Контекст и мотивация

После M-X.2 K1-K10 (commit `be2afcc`) и polish (`7849bb3`) Code сделал 70 коммитов bug bash до `d36d27ab`. Bug bash был **нужен** — Code закрыл реальный pain points биолога (sub-features data model, three-level Annotator UX, embedded mode в tab, idle pre-warm для V49 fix, English UI, Vite HMR pin для CPU 25%). Все эти изменения остаются в коде.

Проблемы которые Chat выявил при post-bash review:

**(а) Library write-through.** В `SingleInspector.onUpdateEdits`:
```js
const onUpdateEdits = useCallback((patch) => {
  rawOnUpdateEdits?.(patch);  // perFileEdits — OK
  if (patch?.editedAnnotations && item?._libraryEntryId) {
    updateLibraryEntryAnnotations(item._libraryEntryId, patch.editedAnnotations);
  }
}, [...]);
```

Каждое redактирование annotation сразу перезаписывает Library entry payload. Фикс был добавлен чтобы решить bug «иконка миникарты в каталоге показывает старые annotations после правки». Решение через write-through неправильное — биолог зафиксировал что Library — primary storage, правки в неё идут **explicitly** (overwrite или save-as-version), не silent.

**(б) Hard violations размеров.**
- `SingleInspector.jsx` 43.96 KB / hard 40 KB — god-component с 10 responsibility (idle pre-warm, selection state, library write-through, mergeStripWithPredicted helper, undo/redo stack, feature edit flow, sub-features composite save, Annotator entry points, SettingsPopover, live selection counter).
- `AnnotationTrack.jsx` 40.65 KB / hard 40 KB — sub-features inset rendering inline, drag preview, hover indicators, SBOL glyphs paired centring, predicted-vs-confident styling, multi-line chevrons. Любая правка одной фичи рискует ломать другую.
- `uiSlice.js` 27.17 KB / hard 25 KB — 13 actions Annotator + sequenceView mirror + toast system. Логически чисто, но превышает.
- `AATrack.jsx` 38.58 KB — soft warning, близко к hard.

**(в) `mergeStripWithPredicted` helper inline.** 84 строки в SingleInspector которые должны быть в `lib/annotation-edit.js` рядом с `applyAnnotationEdit` / `isDuplicatePrediction`.

Все три — **мешают визуальной приёмке**. Hard violations — нарушение зафиксированного anchor (DECISIONS 22.04.2026). Library write-through — нарушение продуктовой модели зафиксированной 05.05.2026 устно. mergeStripWithPredicted — code smell который мешает читать SingleInspector.

---

## §2 Цели

1. Удалить Library write-through. Подмена контракта на «explicit save» (sprint M-X.4 покроет UI).
2. Решить bug «иконка не обновляется» через render-time merge `displayItem = stored + perFileEdits`.
3. Декомпозировать `SingleInspector` через extract хуков и helpers в `lib/`.
4. Декомпозировать `AnnotationTrack` через extract sub-component'ов для sub-features / glyphs / drag preview.
5. Extract `lib/annotator-slice.js` из `uiSlice.js`.
6. Извлечь `mergeStripWithPredicted` в `lib/annotation-edit.js`.

Не цели:
- НЕ переписываем функциональность.
- НЕ меняем UX.
- НЕ добавляем новый «Save to library» action — это M-X.4.
- НЕ трогаем что Code сделал в bug bash как функционал (sub-features, three-level Annotator, etc.).
- НЕ трогаем `AATrack.jsx` (soft warning, не критично, отложить в M-X.2.2 polish при необходимости).

---

## §3 K-шаги

### K1 — Удалить Library write-through, fix catalog icon через render-time merge

**Цель:** annotations Library entry frozen. Catalog icon обновляется через rendering, не через mutation.

**Файлы:**

`gui/designer/src/components/Importer/inspector/SingleInspector.jsx`:
- Удалить call к `updateLibraryEntryAnnotations` в `onUpdateEdits`.
- Удалить subscription `useStore(s => s.updateLibraryEntryAnnotations)`.
- Упростить `onUpdateEdits = rawOnUpdateEdits` напрямую (если callback больше ничего не делает) либо оставить useCallback с пустой обёрткой если есть другие обязанности.

`gui/designer/src/store/librarySlice.js`:
- **Оставить** функцию `updateLibraryEntryAnnotations` без изменений. Она нужна для будущего sprint M-X.4 «Save to library» action — там будет explicit вызов из save-кнопки.
- Добавить JSDoc-предупреждение «only called from M-X.4 explicit save flow, NOT from edit dispatcher».

`gui/designer/src/components/Importer/catalog/use-catalog-sources.js`:
- Расширить `libraryEntryToCatalogItem` — принимать optional второй параметр `perFileEditsByEntryId` (Map<entryId, editedAnnotations>).
- При наличии edits для данной entry — использовать `editedAnnotations` вместо `entry.payload.annotations`.

`gui/designer/src/components/Importer/catalog/CatalogColumn.jsx`:
- В `useCatalogSources()` подписаться на `useStore(s => s.perFileEdits)` (если slice так называется — проверить в `projectSlice.js` на это).
- Передавать perFileEdits в `libraryEntryToCatalogItem`.

**Логика merge:** для each `entry` в Library, найти `perFileEdits[entry.id]` (или по `_fileName`/другому ключу — Code знает текущий механизм). Если есть `editedAnnotations` — сделать `{...entry.payload, annotations: editedAnnotations}` для catalog rendering. Original entry в store нетронут.

**Тесты:** новый файл `__tests__/library-write-through-removal.test.jsx` с 3 сценариями:
- Edit annotation в Inspector → Library entry annotations НЕ изменилась.
- Edit annotation в Inspector → catalog icon показывает edited annotations (через mini-map).
- Close project → reopen → catalog icon снова показывает stored entry annotations (perFileEdits не персистится в Library).

**STOP-условие:** если catalog rendering ломается на edge case (entry без _libraryEntryId — например свежий импорт до commit) — остановиться, спросить как обрабатывать.

**Размер патча:** ~30-50 строк (удаление + render-time merge wiring).

---

### K2 — Извлечь `mergeStripWithPredicted` в `lib/annotation-edit.js`

**Цель:** очистить SingleInspector от 84-строчного helper.

**Файлы:**

`gui/designer/src/lib/annotation-edit.js`:
- Добавить export `mergeAnnotationsWithPredicted(confirmed, results, threshold, acceptedIds, rejectedIds, showDuplicates)`.
- Тело функции — copy-paste существующего `mergeStripWithPredicted` из SingleInspector.
- Сохранить comment-блок про confirmedNames suppress label logic.

`gui/designer/src/components/Importer/inspector/SingleInspector.jsx`:
- Удалить inline функцию `mergeStripWithPredicted`.
- Импортировать из `lib/annotation-edit.js`.
- Использовать импортированную версию в `stripAnnotations` computation.

**Тесты:** новый файл `__tests__/lib/annotation-edit-merge.test.js` (5 сценариев):
- Empty results → confirmed возвращается as-is.
- Predicted region выше threshold → попадает в результат.
- Predicted region ниже threshold → отфильтровывается.
- Same-id duplicate в confirmed и results → не дублируется.
- ShowDuplicates false + same-name duplicate → suppress label flag.

**Размер патча:** ~90 строк (move + 5 тестов).

---

### K3 — Декомпозиция `SingleInspector.jsx` через extract хуков

**Цель:** SingleInspector ≤ 30 KB (soft 30 .jsx). Extract self-contained logic в hooks.

**Извлекаемые хуки** (новый каталог `gui/designer/src/components/Importer/inspector/hooks/`):

1. **`useIdlePrewarm.js`** (~3 KB) — V49 fix logic. Управляет `warmedTabs` Set + 2 useEffect chunks для requestIdleCallback Sequence/Annotations + reset on plasmid switch + `__PREWARM_DISABLED__` test bypass.
   - Signature: `useIdlePrewarm({ activeTab, itemKey }) → { warmedTabs, isMounted, visibilityStyle }`.

2. **`useAnnotationUndoStack.js`** (~3 KB) — undoStackRef / redoStackRef + Ctrl+Z/Y window keydown listener + reset on plasmid switch.
   - Signature: `useAnnotationUndoStack({ itemKey, edits, item, onUpdateEdits }) → { pushUndoSnapshot, undo, redo }`.

3. **`useSelectionStateInspector.js`** (~3 KB) — cursorPos / cursorAnchor / cursorSelectionMode / cursorSelectionStrand + onBarSettle / onBarScrub / onCaretChangeFromView / onSelectRangeFromView / pendingScroll.
   - Signature: `useSelectionStateInspector({ activeTab, onActiveTabChange }) → {cursorPos, cursorAnchor, cursorSelectionMode, cursorSelectionStrand, pendingScroll, onPendingScrollHandled, onBarSettle, onBarScrub, onCaretChangeFromView, onSelectRangeFromView}`.

4. **`useFeatureEditorFlow.js`** (~2.5 KB) — `featureUnderEdit` state + `openFeatureEditor` / `closeFeatureEditor` / `onFeatureSave` (composite parent + subFeatures save) / `onFeatureMerge` / `onFeatureDelete` / `applyOpToAnnotations` (locks через pushUndoSnapshot).
   - Signature: `useFeatureEditorFlow({ item, edits, onUpdateEdits, pushUndoSnapshot }) → {featureUnderEdit, openFeatureEditor, closeFeatureEditor, onFeatureSave, onFeatureMerge, onFeatureDelete}`.

**Файлы:**

- Создать 4 new файла в `hooks/`.
- В `SingleInspector.jsx` убрать соответствующие useState/useRef/useEffect/useCallback, заменить вызовами хуков.
- Все existing handler сигнатуры остаются (`onAnnotationEditFromView`, `onCaretChangeFromView`, etc.) — это API наружу, которое потребляет SequenceTab/AnnotationsTab. Меняется ТОЛЬКО внутренняя организация.

**Размер патча:** ~600-800 строк move (без re-implement; copy-paste с малыми правками imports).

**Acceptance:** `SingleInspector.jsx` ≤ 30 KB. Тесты которые сейчас passing — продолжают passing без правок (это refactor, не regression).

**STOP-условие:** если декомпозиция требует менять existing test → это regression, стоп. Если хук-extract тривиально не работает (cyclic dep, store-subscription issues) → стоп, обсудить альтернативу.

---

### K4 — Декомпозиция `AnnotationTrack.jsx` через extract sub-components

**Цель:** AnnotationTrack ≤ 30 KB (soft .jsx). Extract render concerns в отдельные sub-components.

**Извлекаемые компоненты** (новый каталог `gui/designer/src/components/SequenceView/tracks/parts/`):

1. **`AnnotationRect.jsx`** (~6-8 KB) — main rect + chevron + glyph-paired-with-label + drag preview rect + edge handles + hover indicators. Per-region rendering.
   - Props: `region, lineStart, lineEnd, charPx, labelChars, draggedAnnotationId, draggedEdge, draggedCurrentCoord, hover, setHover, onAnnotationClick, onAnnotationDoubleClick, onAnnotationFeatureDoubleClick, onPointerDownEdge`.

2. **`SubFeatureOverlays.jsx`** (~3 KB) — sub-features inset rendering. Принимает kids (children regions) + parent rect coords и рендерит каждый child rect + labels.
   - Props: `kids, parentVisStart, parentVisEnd, lineStart, lineEnd, charPx, onAnnotationClick, onAnnotationFeatureDoubleClick`.

3. **`OverflowPill.jsx`** (~1 KB) — `+N more` indicator. Простой sub-component.
   - Props: `count, x, y, width, labelFontSize`.

4. **`LabelText.jsx`** — already extracted в bug bash, **оставить** где есть.

5. **`useAnnotationHoverEdge.js`** (~1 KB) — extract hover state + setHover в hook чтобы AnnotationTrack не держал useState.
   - Signature: `useAnnotationHoverEdge() → {hover, onPointerEnterEdge, onPointerLeaveEdge}`.

**Файлы:**

- Создать 4 new файла.
- В `AnnotationTrack.jsx` оставить только: stacking + height computation + iteration по rows + dispatch к `<AnnotationRect>` + `<OverflowPill>`. Хелперы `darkenColor` / `chevronPath` / `ensureColor` / `labelLengthChars` оставить либо переехать в `lib/annotation-render.js` (если ≥3 потребителя — иначе оставить локально).

**Размер патча:** ~500-700 строк move.

**Acceptance:** `AnnotationTrack.jsx` ≤ 30 KB. Все existing tests (особенно integration tests на drag-edges + sub-features rendering) — passing без правок.

**STOP-условие:** если AnnotationRect props balloon (>15 props) — пересмотреть, объединить родственные в объект `{ dragState }` / `{ hoverState }`.

---

### K5 — Extract `lib/annotator-slice.js` из `uiSlice.js`

**Цель:** `uiSlice.js` ≤ 25 KB (hard .js).

**Файлы:**

`gui/designer/src/store/lib/annotator-slice.js` (новый, ~10 KB):
- ANNOTATOR_DEFAULTS / ANNOTATOR_STORAGE_KEY / ANNOTATOR_TABS constants.
- `loadInitialAnnotator()` / `persistAnnotator()` / `sanitizeEnabledPluginIds()` helpers.
- Export `selectAnnotator(state)` selector.
- Export `createAnnotatorSlice(set)` factory с 13 actions:
  - openAnnotator / closeAnnotator / setAnnotatorActiveTab / togglePlugin / setAnnotatorThreshold / setAnnotatorShowDuplicates / setAnnotatorRunning / setAnnotatorResult / acceptRegion / acceptManyRegions / rejectRegion / setSelectedGhost / clearRegionVerdict / editPendingRegion / resetAnnotatorScope.
- Threshold sync с `state.sequenceView.predictions.threshold` — оставить inside `setAnnotatorThreshold` (cross-slice знание про sequenceView, без него mirror сломается).

`gui/designer/src/store/uiSlice.js`:
- Удалить annotator-block (constants + loaders + selector + 13 actions).
- Импортировать из `lib/annotator-slice.js`: `createAnnotatorSlice`, `selectAnnotator`, `loadInitialAnnotator`, `ANNOTATOR_DEFAULTS`, `ANNOTATOR_STORAGE_KEY`.
- В `createUiSlice(set)` подключить annotator: `...createAnnotatorSlice(set), annotator: loadInitialAnnotator()`.
- В `setSequenceViewSetting('predictions.threshold', v)` оставить mirror в annotator (cross-slice, как сейчас).

`gui/designer/src/store/index.js`:
- Если annotator slice вынесен полностью в отдельный файл — может потребовать spread в combinedReducer / store creation. Code знает.

**Тесты:** existing `store/__tests__/annotator-slice.test.js` — passing без правок (тестируют контракт, не file location).

**Размер патча:** ~400 строк move + 50 строк wiring.

**Acceptance:** `uiSlice.js` ≤ 22 KB (запас 3 KB до hard 25 чтобы не balloon снова при следующем M-).

**STOP-условие:** если `setSequenceViewSetting` mirror ломается (cross-slice access из annotator-slice.js без зависимости на sequenceView) — оставить mirror в `setSequenceViewSetting` (uiSlice), `setAnnotatorThreshold` пишет только в annotator. Биолог уже одобрил bidirectional, но если технически проще one-way — обсудить.

---

### K6 — Final size check + commit

**Цель:** убедиться что все hard violations закрыты, прогон тестов чистый.

**Чек-лист:**

- [ ] `SingleInspector.jsx` ≤ 30 KB (soft .jsx 30, hard 40).
- [ ] `AnnotationTrack.jsx` ≤ 30 KB (soft .jsx 30, hard 40).
- [ ] `uiSlice.js` ≤ 22 KB (soft .js 20, hard 25).
- [ ] `lib/annotation-edit.js` — вырос на ~3 KB (mergeAnnotationsWithPredicted), всё ещё < 15 KB.
- [ ] `lib/annotator-slice.js` — новый ~10 KB.
- [ ] Hooks дир в Inspector — 4 файла по 2-3 KB.
- [ ] AnnotationTrack/parts дир — 3 файла по 1-8 KB.

**Тесты:**
- `npx vitest run` — все passing.
- pytest unchanged (backend не тронут).
- Build clean.

**Commit message:**
```
refactor(m-x.2-fix): K1-K6 architectural cleanup before acceptance

K1 fix(library): remove write-through, render-time merge in catalog
K2 refactor(annotation-edit): extract mergeStripWithPredicted helper
K3 refactor(SingleInspector): extract 4 hooks (idle-prewarm, undo-stack,
                              selection-state, feature-editor-flow)
                              43.96 KB → ~28 KB
K4 refactor(AnnotationTrack): extract AnnotationRect / SubFeatureOverlays
                              / OverflowPill / useAnnotationHoverEdge
                              40.65 KB → ~22 KB
K5 refactor(annotator-slice): extract from uiSlice
                              uiSlice.js 27.17 KB → ~17 KB
                              new lib/annotator-slice.js ~10 KB
K6 chore: size budget verification

Hard violations: 4 → 0
Soft warnings: 4 → 1 (AATrack — deferred to M-X.2.2)
Tests: pass before & after
```

---

## §4 STOP-conditions (для Code)

В дополнение к per-K-step STOP-conditions, общие условия остановки:

1. **Existing test fails после K-step.** Не двигаться дальше — root-cause regression в текущем K, починить либо обсудить с Chat если требует отклонения от плана.
2. **K3 размер не доходит до 30 KB.** Если после extract 4 хуков SingleInspector всё ещё > 32 KB — стоп, спросить какой 5-й хук extract.
3. **K4 AnnotationRect props balloon.** Если AnnotationRect требует > 15 props — пересмотреть design (объединить hover / drag state в объекты).
4. **K5 cross-slice access.** Если annotator-slice не может писать в sequenceView через `set(state => state.sequenceView…)` — оставить mirror в uiSlice'овском `setSequenceViewSetting` only (one-way), `setAnnotatorThreshold` отвечает только за свой slice.

---

## §5 Что НЕ делается в этом sprint'е

**Записано в очередь, отдельные sprint'ы:**

- **M-X.4 «Library Save Flow»** — UI кнопок «Перезаписать в библиотеке» / «Сохранить как новую версию» + version metadata + DEC-LIB-VERSIONING-01. После M-X.2-fix acceptance.
- **M-X.2.1 «AATrack decomposition»** — soft warning (38.58 KB). Отложить до тех пор, пока кто-то не дойдёт до hard 40.
- **TD-WRAPTAIL-RENDERING** — circular plasmid wrap-tail в SequenceView. Отдельный sprint M-X.3.
- **TD-CIRCULAR-SELECTION** — selection через origin. Отдельный sprint после M-X.3.

---

## §6 Открытые вопросы для kickoff

Если что-то непонятно, **остановиться** и попросить Chat дополнить:

1. **K1 perFileEdits keying.** В `mergeStripWithPredicted` сейчас edits идентифицируются через `item._libraryEntryId`. В projectSlice проверить — perFileEdits keyed по `_fileName` (filename) или `_libraryEntryId` (canonical UUID)? Catalog merge должен использовать тот же key.
2. **K3 useFeatureEditorFlow.** Логика `onFeatureSave` композитная — обновляет parent + diff sub-features. Если эта логика требует knowledge о `applyAnnotationEdit` dispatcher signature — оставить inline в SingleInspector либо вытащить вместе с `applyOpToAnnotations` в hook.
3. **K5 mirror direction.** Current implementation — `setAnnotatorThreshold(v)` пишет в **обе** slices (annotator + sequenceView), `setSequenceViewSetting('predictions.threshold', v)` пишет в **обе** (sequenceView + annotator). После extract — annotator-slice.js имеет доступ к sequenceView через `set(state => state.sequenceView.…)` если slice merged в одном Zustand store (что обычно так и есть). Если архитектурно не выходит — сделать one-way (setSequenceViewSetting видит обе, setAnnotatorThreshold только свой slice).

---

## §7 Формат отчёта Code

После K6 commit Code дописывает в `CURRENT_TASK.md`:

```
## Отчёт Code по Sprint M-X.2-fix

### Коммиты K1-K6
- K1 <hash>: removed library write-through; render-time merge in catalog
- K2 <hash>: mergeAnnotationsWithPredicted moved to lib/annotation-edit.js
- K3 <hash>: SingleInspector decomposition (4 hooks)
- K4 <hash>: AnnotationTrack decomposition (3 parts + 1 hook)
- K5 <hash>: annotator-slice extracted from uiSlice
- K6 <hash>: final commit

### Размеры (с указанием Δ)
- SingleInspector.jsx: 43.96 → X (Δ-Y; soft 30 — OK / WARN)
- AnnotationTrack.jsx: 40.65 → Y (Δ-Z; soft 30 — OK / WARN)
- uiSlice.js: 27.17 → Y (Δ-Z; hard 25 — OK)
- lib/annotation-edit.js: A → B
- lib/annotator-slice.js: новый, X KB
- (другие если изменились >2 KB)

### Тесты
- Vitest: N baseline → M (+K) — `npx vitest run` summary
- pytest: 112 (без изменений)
- Build: clean

### Open questions из §6 — что выбрали
1. perFileEdits keying: <fileName / libraryEntryId / другое>
2. useFeatureEditorFlow extract: <inline / в hook / частично>
3. K5 mirror direction: <bidirectional работает / one-way / другое>

### Отклонения от §3
<явный список или «нет»>

### Pending для Игоря
- Визуальная приёмка (когда K6 PASS).
```

---

## §8 После приёмки

При финализации Sprint M-X.2 + M-X.2-fix:

1. **⚓ DEC-LIB-11** (новый) — annotations on library entries are mutable, sequence/topology/ends frozen. Update только через explicit save action (M-X.4). Supersede DEC-LIB-05 в части annotations.
2. **⚓ DEC-EDIT-PARITY-01** (новый) — единый `applyAnnotationEdit` dispatcher между SequenceView и Annotator embedded.
3. **⚓ DEC-IMPORTER-TARGETS-01** (новый) — Импортер с двумя таргетами: Library only, Library + project.
4. **DEC-FEATURE-SUBFEATURES-01..DEC-PLUGIN-OVERFETCH-01** (sprint-level) → DECISIONS.md.
5. RELEASES.md → v0.7.2 либо v0.8.0.
6. PROJECT_STATE.md update.
7. Спека M-X.2 + этот fix-mini-spec → archive.
8. M-X.4 «Library Save Flow» — kickoff.

---

**Статус:** 🔴 В процессе (готов для Code)
**Утверждение Игоря:** [pending]
