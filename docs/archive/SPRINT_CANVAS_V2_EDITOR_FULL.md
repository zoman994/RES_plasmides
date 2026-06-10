> **Архивировано 27.05.2026 — консолидация docs/ (S4). РЕАЛИЗОВАНО.** ContainerEditorSkeleton — живой компонент (`TD-CONTAINER-EDITOR-SKELETON`; один из 5 дизайн-виверов). Учтено в `BACKLOG.md` §Канвас-и-окна.

# SPRINT_CANVAS_V2_EDITOR_FULL.md — полнофункциональный editor контейнера

> **Тип:** B (фича среднего объёма) — переиспользование Library-инфраструктуры через адаптер.
> **Версия скелета:** v2 (paradigma assembly canvas, см. `NOTES_CANVAS_V2_KICKOFF.md`).
> **Создан:** 11.05.2026 поздний вечер.
> **Триггер:** Игорь хочет, чтобы двойной клик на container на canvas открывал тот же функциональный набор, что Library SingleInspector — tabs, аннотации, редактирование фич, embedded Annotator.
> **Stop-условие:** после K7 — `npm test` зелёный + ручная проверка двойного клика на pUC19 + ждать визуальной приёмки в отдельной сессии.

---

## 0. Срез размеров затрагиваемых модулей

`gui/designer/src/components/CanvasSkeleton/editor/`
- ContainerEditorSkeleton.jsx — **10.21 KB** (переписывается, ожидание ~11-13 KB)
- OperationsToolbar.jsx — 4.17 KB (удаляется)
- TabsBar.jsx — 2.81 KB (удаляется)
- PillsBar.jsx — 2.57 KB (удаляется)
- operations/ — 4 popup'а (удаляются)
- derive-primers.js — 2.78 KB (остаётся)
- fixture-puc19.js — 4.71 KB (остаётся)

`gui/designer/src/components/CanvasSkeleton/store/`
- skeleton-state.js — **8.55 KB** (расширяется, ожидание ~11 KB)
- skeleton-context.jsx — 4.63 KB (минимально дополняется)

`gui/designer/src/components/Library/inspector/` (только переиспользование, без правок!)
- LibrarySingleInspector.jsx — 38.73 KB (НЕ трогаем, читаем как референс)
- FeatureEditorModal.jsx — 25.60 KB (импорт через `import`)
- InlineEditableTitle.jsx — 2.82 KB (импорт)
- tabs/{TabBar, OverviewTab, SequenceTab, AnnotationsTab, HistoryTab, LinearFeatureBar}.jsx — импорт
- hooks/{useFeatureEditorFlow, useAnnotationUndoRedo}.js — импорт

**Hard-лимиты соблюдены:** все целевые .jsx ниже 40 KB, .js ниже 25 KB.

---

## 1. Контекст

Сейчас `ContainerEditorSkeleton` — это:
- лёгкий wrapper над `SequenceView` + `PlasmidMapInteractive` (toggle linear / plasmid-map);
- `OperationsToolbar` с 4 кнопками (PCR / Restriction / Mutagenesis / Gibson);
- 4 popup'а параметризации операций;
- `PillsBar` / `TabsBar` для multi-draft session.

Operations съезжают на canvas (отдельный sprint, ромб → popover с выбором kind + popup параметров на сам ромб). Editor освобождается от operation-state и становится **viewer-of-truth** для контейнера — функциональный паритет с Library SingleInspector.

Игорь явно: «полный рабочий сиквенс вивер (как в библиотеке) … с редактированием фич аннотатором и полным набором всего функционала».

## 2. Где задача сядет (R4 §17)

**Затрагивает (переписывается):**
- `components/CanvasSkeleton/editor/ContainerEditorSkeleton.jsx`
- `components/CanvasSkeleton/store/skeleton-state.js` (расширение actions)
- `components/CanvasSkeleton/store/skeleton-context.jsx` (экспорты actions)

**Удаляется:**
- `components/CanvasSkeleton/editor/OperationsToolbar.jsx`
- `components/CanvasSkeleton/editor/TabsBar.jsx`
- `components/CanvasSkeleton/editor/PillsBar.jsx`
- `components/CanvasSkeleton/editor/operations/` целиком (4 popup'а)

**Переиспользуется напрямую через import (НЕ копируется):**
- `Library/inspector/tabs/TabBar.jsx`
- `Library/inspector/tabs/OverviewTab.jsx`
- `Library/inspector/tabs/SequenceTab.jsx`
- `Library/inspector/tabs/AnnotationsTab.jsx`
- `Library/inspector/tabs/HistoryTab.jsx`
- `Library/inspector/tabs/LinearFeatureBar.jsx`
- `Library/inspector/FeatureEditorModal.jsx`
- `Library/inspector/InlineEditableTitle.jsx`
- `Library/inspector/hooks/useFeatureEditorFlow.js`
- `Library/inspector/hooks/useAnnotationUndoRedo.js`

**Annotator переиспользуется через global Zustand** (`uiSlice.openAnnotator(scope)` / `closeAnnotator()` + `selectAnnotator()`). Annotator уже работает в Library; для skeleton-у достаточно дёрнуть его теми же действиями со своим `scope.sequenceId`.

**НЕ трогать** (production Library, риск регрессии):
- LibrarySingleInspector.jsx — это оркестратор, в spectator-режиме мы строим свой
- LibraryMetaColumn.jsx — Library-specific (теги, origin, tags pool)
- LibrarySaveActions.jsx + LibraryInspectorTitleRow.jsx + ManualEditConfirmModal.jsx — Library-specific
- useEditableModeToggle / useLibrarySaveFlow / useManualEditBranching / useIdlePrewarm — Library-specific

**Что может сломаться** при правке: editor-tests (полная переделка фикстур). Operations-tests тоже умрут — это ОК, operations переедут в canvas-side тесты в следующем sprint'е.

## 3. Стратегия

ContainerEditorSkeleton переписывается как композиция тех же sub-tabs, что Library SingleInspector, но driver-state = skeleton-state (не librarySlice).

**Ключевой адаптер:** `container → item-shape`. Tabs ожидают `{id, name, sequence, annotations, topology, length, _fileName, ...}`. Container shape — `{id, name, sequence, annotations, topology: {circular: bool}, length, ...}`. Различие минимально, маппится одной функцией.

**Edits buffer.** Library использует `perFileEdits[fileName] = { editedAnnotations, editedSequence, editedTopology }` — transient до Save. Skeleton делает то же по containerId: `pendingEditsByContainer[containerId]`. Editor открывается → читает container + pending → передаёт в tabs как `item` + `edits`. Tabs дёргают `onUpdateEdits` → запись в pendingEditsByContainer. Кнопка «✓ Применить» → applies в state.containers, чистит buffer. «↶ Отменить» → discard buffer.

**Annotator.** AnnotationsTab уже mount'ит Annotator внутри себя через `useStore(selectAnnotator)` + дёргает `onApplyAnnotatorResults` когда биолог принимает регионы. Editor wire'ит:
1. `onOpenAnnotator(scope)` → `openAnnotator({...scope, sequenceId: 'skeleton::' + containerId})` (через global action) + переключает activeTab='annotations'.
2. `onApplyAnnotatorResults(acceptedRegions)` → applies batch к pendingEditsByContainer (как в Library, через `applyAnnotationEdit({kind: 'create-batch', payload})`).

Skeleton ничего своего у Annotator'а не пишет, использует тот же contract.

**Чем editor отличается от Library SingleInspector:**
- Нет `useEditableModeToggle` — editor в skeleton'е ВСЕГДА editable (нет readonly_bodge zone).
- Нет `useLibrarySaveFlow` / `useManualEditBranching` — skeleton mutable directly, без branching.
- Нет `useIdlePrewarm` — для skeleton с 5 контейнерами prewarm не нужен. Можно eager mount всех tabs либо lazy без warming.
- Save buttons заменены на inline «✓ Применить» / «↶ Отменить» в title row.

## 4. Scope IN

- ContainerEditorSkeleton полностью переписан под композицию tabs + LinearFeatureBar + FeatureEditorModal + Annotator wire.
- Двойной клик на feature в SequenceView → открывает FeatureEditorModal (через `useFeatureEditorFlow`).
- Кнопка «🔍 Аннотатор» в AnnotationsTab открывает fullscreen Annotator с правильным scope.
- ПКМ «Annotate selection» в SequenceView → `onOpenAnnotator({kind: 'region', region})`.
- Inline rename контейнера через `InlineEditableTitle` в title row (двойной клик).
- Cursor / selection / Ctrl+Z/Y для annotation edits через `useAnnotationUndoRedo`.
- Pending edits buffer per-container (carry-over при закрытии без apply).
- OperationsToolbar / popups / PillsBar / TabsBar / operations/ — удалены (operations перевозятся на canvas, отдельный sprint).

## 5. Scope OUT

- **Operations на canvas** — ромб → popover выбора kind → popup параметров на сам ромб. Отдельный sprint после этого.
- **Save flow (.bodge persistence)** — skeleton остаётся mock, контейнеры живут только в state.
- **Manual sequence edit (character insert/delete keyboard)** — skeleton mutable directly без branching. Если в SequenceTab `onSequenceEdit` дёрнется — обрабатываем простой `container.sequence` mutation в pending; если потребуется — открытый вопрос Q3 ниже.
- **MetaColumn-full** (TagsEditor, origin, tags pool) — skeleton не имеет тегов; topology toggle inline в title row, length subtitle inline. Полноценный MetaColumn — после R4 fix + если biolog скажет «не хватает».
- **History tab** — placeholder, либо рендерим `HistoryTab` с пустым commits-list, и он сам отобразит «нет истории». ProjectCommits в skeleton — есть, но они **связь между контейнерами на canvas**, а не история одного контейнера. Решить — Q4.
- **PlasmidMapInteractive** (текущий circular-mode toggle) — выкидываем; OverviewTab уже содержит PlasmidMiniMap. Если нужен interactive circular — возвращаем в отдельный sprint.

## 6. Архитектурные решения

**DEC-CANVAS-V2-EDITOR-01 — editor = композиция tabs из Library/inspector/tabs/.** Не копируем код, импортируем напрямую. Sub-tabs универсальны (документировать в комментариях editor'а).

**DEC-CANVAS-V2-EDITOR-02 — container-к-item adapter** — функция `buildItemFromContainer(container)`. Возвращает item-shape со следующими полями: `id`, `_fileName = container.id` (sub-tabs используют для cache keys), `name`, `sequence`, `annotations`, `topology: container.topology?.circular ? 'circular' : 'linear'` (Library использует string, не object — конвертируем), `length`, `_libraryEntryId: null` (отключает manual-edit branching code path в SequenceTab), `zone: 'skeleton'`. Файл: `components/CanvasSkeleton/editor/adapt-container-to-item.js`.

**DEC-CANVAS-V2-EDITOR-03 — pending edits per-container, carry-over.** Закрытие editor'а без apply сохраняет pending в `state.pendingEditsByContainer[containerId]`. Повторный двойной клик восстанавливает их. «↶ Отменить» — explicit discard. Это match'ит Library поведение `perFileEdits` через session.

**DEC-CANVAS-V2-EDITOR-04 — Annotator scope namespace `skeleton::${containerId}`.** Annotator slice (annotator.scope.sequenceId) — global, должен различать skeleton-target от Library-target. Префикс `skeleton::` — explicit разделитель. Если Annotator switch на skeleton-target → Library не должна реагировать (selectAnnotator вернёт скоп с чужим sequenceId, AnnotationsTab в Library не должен mount его — проверить в K1).

**DEC-CANVAS-V2-EDITOR-05 — editor всегда editable.** Нет readonly_bodge zone в skeleton. `editable = true` константа, не hook. Если в будущем будет «frozen-on-use» mutability (Q4 из kickoff'а) — это lifecycle на уровне state.containers, не на уровне editor'а.

**DEC-CANVAS-V2-EDITOR-06 — apply/discard kbd:** «✓ Применить» (Ctrl+S) / «↶ Отменить» (Ctrl+Z на пустом стеке OR explicit button) / «← Назад» (Escape) — close editor sохраняя pending.

## 7. Файлы (новые и изменяемые)

### Новый `editor/adapt-container-to-item.js` (~1 KB)

```
function buildItemFromContainer(container)
  returns: item-shape object
function buildEditsFromPending(pending)
  returns: { editedAnnotations?, editedSequence?, editedTopology? } | null
```

Без логики, чистый mapping. Unit-тесты: 2 (basic mapping, edge case container с null sequence — теперь возможен в paradigma V2 placeholder, см. ниже Q5).

### Переписанный `editor/ContainerEditorSkeleton.jsx` (~12 KB target)

Структура (псевдо-выклад):

```
function ContainerEditorSkeleton() {
  state, actions from useSkeletonState/useSkeletonActions
  tabContainerId from useEditorTabContext (existing)
  container = useContainerById(tabContainerId)
  pending = state.pendingEditsByContainer[tabContainerId]
  item = buildItemFromContainer(container)
  edits = buildEditsFromPending(pending)

  cursor state (cursorPos / cursorAnchor / mode / strand / pendingScroll) — local useState (5 штук, как в Library)

  useAnnotationUndoRedo({ itemKey: container.id, currentAnnotations, onUpdateEdits })
  useFeatureEditorFlow({ item, edits, applyOp, dispatchEdit })

  onBarSettle / onBarScrub / onCaretChange / onSelectRange / onAnnotationEdit / onSequenceEdit
    (логика из LibrarySingleInspector lines 233-360, адаптированная)

  onUpdateEdits = (patch) => actions.setPendingEdits(container.id, patch)
  onApply = () => actions.commitPendingEdits(container.id)
  onDiscard = () => actions.discardPendingEdits(container.id)
  onRename = (newName) => actions.setContainerName(container.id, newName)

  onOpenAnnotator = (scopeArg) => {
    scope = { kind: scopeArg?.kind || 'full', sequenceId: `skeleton::${container.id}`, region: scopeArg?.region }
    useStore.getState().openAnnotator(scope)
    setActiveTab('annotations')
  }

  onApplyAnnotatorResults — стандартный паттерн из Library SingleInspector lines 461-485

  Layout:
    <header>
      ← Назад (closeEditor)
      <InlineEditableTitle value={container.name} onChange={onRename} />
      subtitle: length · linear/circular · regions count
      «✓ Применить» (disabled if !pending)
      «↶ Отменить» (disabled if !pending)
      ⇄ topology toggle (читает container.topology.circular)
    </header>

    <TabBar activeTab onChange showHistory={container.commits?.length > 0} />

    {activeTab !== 'overview' && <LinearFeatureBar annotations onSelect={onBarSettle} onScrub={onBarScrub} cursorPosition={cursorPos} />}

    <main>
      OverviewTab (active === 'overview')
      SequenceTab (active === 'sequence')
        props: entryId=container.id, sequence, annotations, topology, name, fileKey=container.id,
               onUpdateEdits, pendingScroll, onPendingScrollHandled,
               caretPos, caretAnchor, selectionMode, selectionStrand,
               onCaretChange, onSelectRange, onAnnotationEdit,
               onOpenAnnotator, onOpenFeatureEditor,
               editable=true, isReadOnlyZone=false,
               onSequenceEdit
      AnnotationsTab (active === 'annotations')
        props: sequence, annotations, fileName=container.id, active,
               isReadOnlyZone=false, onApplyAnnotatorResults,
               onAnnotationEdit, onOpenFeatureEditor,
               pendingScroll, onPendingScrollHandled
      HistoryTab (active === 'history' && container.commits?.length > 0)
    </main>

    <FeatureEditorModal feature={featureUnderEdit} seqLength neighbours
                        onSave onMerge onDelete onClose />
}
```

**Important:** не дёргать `useEditableModeToggle`, `useLibrarySaveFlow`, `useManualEditBranching`, `useIdlePrewarm`. Не mount'ить `LibraryInspectorTitleRow`, `LibrarySaveActions`, `ManualEditConfirmModal`, `SettingsPopover` (если SequenceTab сам не зовёт — проверить в K1; если зовёт — выясняется уже на разведке).

### Изменяемый `store/skeleton-state.js`

Новые поля в state:
- `pendingEditsByContainer: { [containerId]: { editedAnnotations?, editedSequence?, editedTopology?, editedName? } }` (default `{}`)

Новые actions (через reducer):
- `SET_PENDING_EDITS` — `(containerId, patch)` мерджит patch в pendingEditsByContainer[containerId].
- `COMMIT_PENDING_EDITS` — `(containerId)` applies pending → state.containers[i], clears pending, queues toast.
- `DISCARD_PENDING_EDITS` — `(containerId)` clears pending без apply.
- `SET_CONTAINER_NAME` — `(containerId, newName)` direct mutation в state.containers (inline rename).

Существующий `COMMIT_ANNOTATION_EDIT` (DEC-SKELETON-FIX1-01) — **остаётся** для атомарных правок через SequenceView (он уже работает). Связь с pendingEditsByContainer: editor.adapter.onUpdateEdits → SET_PENDING_EDITS; SequenceView.onAnnotationEdit поднимается через `applyAnnotationEdit` → пишется в pending, а не сразу в container. Это паттерн Library, не текущий skeleton'овый «сразу в container».

⚠ Это **меняет** existing behaviour DEC-SKELETON-FIX1-01: annotation edits больше не пишутся напрямую в `container.annotations`, а буферизуются в pendingEditsByContainer до Apply. Это правильно (consistent с Library), но это **regression в тестах** на FIX1 — те тесты нужно переписать под новый flow.

### Изменяемый `store/skeleton-context.jsx`

Добавить в `actions` мемо:
- `setPendingEdits(containerId, patch)`
- `commitPendingEdits(containerId)`
- `discardPendingEdits(containerId)`
- `setContainerName(containerId, newName)`

Convenience hook `usePendingEdits(containerId)` — возвращает `state.pendingEditsByContainer[containerId] || null`.

## 8. Порядок выполнения K1..K7

### K1 — разведка sub-tabs (≤30 минут)

Прочитать без правок:
- `Library/inspector/tabs/SequenceTab.jsx`
- `Library/inspector/tabs/AnnotationsTab.jsx`
- `Library/inspector/tabs/OverviewTab.jsx`
- `Library/inspector/tabs/TabBar.jsx`
- `Library/inspector/tabs/LinearFeatureBar.jsx`
- `Library/inspector/tabs/HistoryTab.jsx`
- `Library/inspector/FeatureEditorModal.jsx`
- `Library/inspector/InlineEditableTitle.jsx`
- `Library/inspector/hooks/useFeatureEditorFlow.js`
- `Library/inspector/hooks/useAnnotationUndoRedo.js`

Документ K1: список **реально требуемых props** для каждого (включая optional / required), грань `useStore` calls inside (если AnnotationsTab или SequenceTab внутри дёргают `useStore` для **не-Annotator** slices типа libraryEntries / projectSlice — выяснить, как от этого отвязаться).

**Блокер K1:** если AnnotationsTab внутри селектирует не только annotator slice — описать какие именно selectors, и решить — либо безопасно (slice global / читается только Annotator state), либо shim (передавать через props). Если shim требует править Library code — **остановиться**, поднять к Chat для пересмотра scope.

Тесты K1: нет — это разведка.

### K2 — skeleton-state extension

В `store/skeleton-state.js`:
- Добавить `pendingEditsByContainer: {}` в `buildInitialState`.
- Добавить 4 action handlers в reducer (SET_PENDING_EDITS / COMMIT_PENDING_EDITS / DISCARD_PENDING_EDITS / SET_CONTAINER_NAME).

В `store/skeleton-context.jsx`:
- Экспорт 4 actions из useMemo + опциональный hook usePendingEdits.

Тесты K2 (новый файл `__tests__/skeleton-state.pending-edits.test.js`):
- SET_PENDING_EDITS мерджит patch (не replace).
- COMMIT_PENDING_EDITS applies к containers + clears + toast.
- DISCARD_PENDING_EDITS clears без apply.
- SET_CONTAINER_NAME mutates state.containers[i].name.

**Стоп: 4 теста, плюс ~2 вариации по паттерну (edge case: container не найден; commit пустого pending — no-op).**

### K3 — adapter

Новый `editor/adapt-container-to-item.js`. Сигнатуры — секция 7. Без логики кроме мапинга.

Тесты K3 (новый `__tests__/adapt-container-to-item.test.js`):
- Mapping container с sequence/annotations/circular topology → item-shape.
- Mapping container с null sequence (paradigma V2 placeholder) → item с пустой sequence + 0 length.
- buildEditsFromPending — пустой pending → null, partial pending → подмножество.

**Стоп: 3 теста.**

### K4 — editor rewrite (главный шаг)

`editor/ContainerEditorSkeleton.jsx` — переписать целиком по структуре из секции 7.

Удалить файлы:
- `editor/OperationsToolbar.jsx`
- `editor/TabsBar.jsx`
- `editor/PillsBar.jsx`
- `editor/operations/PCRPopup.jsx`
- `editor/operations/RestrictionPopup.jsx`
- `editor/operations/MutagenesisPopup.jsx`
- `editor/operations/GibsonPopup.jsx`
- директорию `editor/operations/` целиком если пустая

Удалить из `store/skeleton-state.js`:
- `OPEN_POPUP` / `CLOSE_POPUP` actions
- `popup` state field
- `COMMIT_OPERATION` reducer **— подожди, не удалять**. COMMIT_OPERATION останется для canvas-driven operations (отдельный sprint). Удалить только popup-related actions/state.

Удалить из `store/skeleton-context.jsx`:
- exports `openPopup` / `closePopup`

В `index.jsx` — обновить doc-comment (TabsBar / PillsBar отпали).

Тесты K4 (старые удалить, новые написать в `__tests__/container-editor-skeleton-v2.test.jsx`):
- Editor mount на pUC19 → видим TabBar / LinearFeatureBar / OverviewTab по умолчанию.
- Click на Sequence tab → SequenceTab mount + visible.
- Click на Annotations tab → AnnotationsTab mount + visible.
- Двойной клик на feature → FeatureEditorModal open.
- Annotation edit через onAnnotationEdit → пишет в pendingEditsByContainer, НЕ в container.annotations.
- ✓ Применить → applies pending в container + clears buffer.
- ↶ Отменить → clears buffer, container остаётся как был.
- Close editor с pending → carry-over (re-open показывает pending).
- Inline rename → SET_CONTAINER_NAME + container.name updated.

**Стоп: ~9 тестов + ~3-5 вариаций по паттерну (regression на skeleton-FIX1, edge cases).**

### K5 — Annotator wire

В editor — `onOpenAnnotator` + `onApplyAnnotatorResults`. Тестируется через mock-Annotator state (см. как Library тестит).

Тесты K5 (в том же файле):
- onOpenAnnotator(full) → openAnnotator action called с правильным scope.
- onOpenAnnotator(region) → scope.kind === 'region' + region передан.
- onApplyAnnotatorResults(acceptedRegions) → batch применяется через applyAnnotationEdit → пишет в pendingEditsByContainer.editedAnnotations.

**Стоп: 3 теста.**

### K6 — InlineEditableTitle wire + topology subtitle

Title row с `InlineEditableTitle` + length / topology / regions subtitle inline в editor header.

Тесты K6:
- Двойной клик на title → input visible + focused.
- Type + Enter → onChange → SET_CONTAINER_NAME.
- Escape → cancel, name unchanged.

**Стоп: 3 теста.**

### K7 — финальная зачистка + check

- `npm test` зелёный.
- Старые operations-тесты (по PCR / Restriction / Mutagenesis / Gibson popups) удалены.
- Старые FIX1-тесты, проверяющие «edit пишет напрямую в container.annotations», переписаны на «edit пишет в pendingEditsByContainer».
- Документация editor'а обновлена в JSDoc.
- list_directory_with_sizes на editor/ — sanity-check, что editor под hard-лимитом 40 KB .jsx.

**Stop: финальный test count + size editor + commit hash. Не финализировать DECISIONS / COMPONENT_MAP / PROJECT_STATE / CURRENT_TASK — Chat сделает в следующей сессии после визуальной приёмки.**

## 9. Тесты — итого

K2: 4 + ~2 вариации = 6
K3: 3
K4: ~9 + ~3-5 вариаций = 12-14
K5: 3
K6: 3

**Ожидание новых: ~27-29.** Старые удалённые: ~5-10 (operations popups + FIX1-тесты с прямой мутацией). Чистый рост ~17-24 теста.

## 10. Риски

1. **Sub-tabs могут оказаться не-универсальными.** Если SequenceTab / AnnotationsTab внутри читают librarySlice / parsedItem напрямую — адаптер не сработает, потребуется либо shim, либо рефакторинг Library. **Mitigation:** K1 — разведка ПЕРЕД rewrite. Если обнаружится зашитость — остановиться, поднять к Chat для пересмотра.

2. **Annotator state shared между Library и Skeleton.** Annotator slice — global. Если biolog открыл skeleton-editor, запустил Annotator с scope.sequenceId='skeleton::c-puc19', а потом переключился в Library — Library AnnotationsTab может попытаться рендерить «свой» Annotator поверх неправильного scope. **Mitigation:** в `selectAnnotator` consumers (AnnotationsTab + LinearFeatureBar `mergeStripWithPredicted`) добавить guard — игнорировать results если scope.sequenceId не префиксован ожидаемым namespace'ом. Если в Library hook этого нет — это **bug Library** (не наш скоуп). **K1 проверить.**

3. **FeatureEditorModal зависит от librarySlice через collision-check / tag suggestions.** **Mitigation:** K1 grep imports FeatureEditorModal.jsx, проверить useStore calls. Если есть — shim через props default'ы либо noop store-actions для skeleton-mode.

4. **PendingEditsByContainer carry-over между re-open'ами.** Пользовательский ожидаемый поведения: «случайно закрыл — открыл снова — мои изменения остались». Library: yes (perFileEdits живёт всю session). Skeleton: должно быть consistent. **Mitigation:** carry-over default ON; explicit «↶ Отменить» — единственный путь discard. Документировать в K4 test cases.

5. **useAnnotationUndoRedo привязан к itemKey.** Если itemKey меняется (пользователь меняет container на canvas → re-mount editor с другим containerId) — undo стек сбрасывается. Это **правильно**, но нужно явно проверить в тестах. **Mitigation:** test K4 «re-open другого контейнера → undo стек чистый».

## 11. Открытые вопросы

**Q1 — PlasmidMapInteractive (текущий toggle linear / plasmid-map).**
Текущий editor имеет toggle между LinearView и PlasmidMapInteractive (drag-select на circular map). В Library аналог — `OverviewTab` содержит PlasmidMiniMap (но не interactive). Решение: **удаляем** PlasmidMapInteractive, оставляем OverviewTab. Если biolog скажет «не хватает interactive circular» — отдельный sprint по апгрейду OverviewTab.

**Q2 — MetaColumn.**
Library рендерит MetaColumn как соседнюю колонку с TagsEditor / origin / IUPAC warning / multi-row meta. Skeleton не имеет тегов и origin'а в полном виде. Решение по умолчанию: **inline в title row** (length / topology / regions). Если biolog позже скажет «хочу теги» — отдельный sprint с реальным расширением state.containers под теги.

**Q3 — Manual sequence edit (character insert / delete keyboard).**
Library: ветвит entry через `createManualEditBranch` (manual_edit lineage). Skeleton mutable directly. Решение по умолчанию: `onSequenceEdit` callback в SequenceTab активен; при ops insert/delete/replace — пишем в pendingEditsByContainer.editedSequence + auto-shift annotations через existing `applySequenceEditOnLibraryEntry`-аналог helper. **Скоуп — IN**, но **не блокер для K4**: если SequenceTab разрешает passing `onSequenceEdit={null}` — отключение допустимо в K4, доделать в K7 или вынести в next sprint.

**Q4 — HistoryTab.**
Library HistoryTab — рендерит `item.commits` (manual_edit lineage timeline). Skeleton commits — ProjectCommits (связь между контейнерами на canvas). Это **разные сущности**. Решение: **скрыть HistoryTab вкладку** в skeleton editor'е (`showHistory={false}` всегда). История на canvas — это сам DAG, отдельный surface. Если biolog хочет per-container changelog — отдельный sprint.

**Q5 — Placeholder containers (V2 paradigma).**
По NOTES_CANVAS_V2_KICKOFF §2, container с `sequence = null` — placeholder. Двойной клик на него — disabled либо открывает Tree-picker. **Решение: в K4 editor guard'ит** — если `container.sequence == null`, показать prompt «Сначала наполните контейнер через Tree-picker» с кнопкой close, не mount'ить tabs. Это **не блокер** этого sprint'а — placeholder containers ещё не реализованы в state, но guard поставить нужно сразу.

## 12. Что Chat НЕ финализирует пока Code не завершит

- `DECISIONS.md` — не пишу DEC-CANVAS-V2-EDITOR-01..06 сейчас (paradigma ещё в коде стабилизируется).
- `COMPONENT_MAP.md` — обновление после визуальной приёмки в next session (R5 §17).
- `PROJECT_STATE.md` — версия не bump'ается, skeleton отдельный track.
- `RELEASES.md` — не трогать.
- `TECH_DEBT.md` — если K1 обнаружит зашитость Library sub-tabs на librarySlice — это новый TD-entry, фиксируется по факту.

---

## Code handoff (одной фразой)

> Прочитай CHAT_PLAYBOOK.md, CLAUDE.md, BUGS.md, CURRENT_TASK.md, docs/NOTES_CANVAS_V2_KICKOFF.md, и эту спеку `docs/SPRINT_CANVAS_V2_EDITOR_FULL.md`. Выполни шаги K1–K7. K1 — разведка с **остановкой на блокере** (если AnnotationsTab/SequenceTab дёргают не-Annotator slices глобально). Спеку в docs/ не переписывай. После K7 (зелёный test + size sanity) остановись — жду визуальной приёмки в отдельной сессии. Не финализируй DECISIONS / COMPONENT_MAP / PROJECT_STATE / RELEASES / BUGS / TECH_DEBT / CLAUDE.md.

---

_Последнее обновление: 11.05.2026 поздний вечер. Спека написана после прочтения LibrarySingleInspector.jsx (38.73 KB) и инвентаризации Library/inspector/tabs/ + hooks/ + FeatureEditorModal.jsx._
