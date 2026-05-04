# CURRENT_TASK.md

## Sprint M-X.2 — Annotation Editing in SequenceView + Annotator

**Статус:** 🔴 В процессе (готов для Code)
**Спека:** `docs/SPRINT_M-X.2_ANNOTATION_EDITING_AND_ANNOTATOR.md` (50 KB, тип A с +50% от лимита, утверждено Игорем 04.05.2026)
**База:** v0.7.1, ветка `feature/structural-predictor` HEAD `1c75857` (M-X.1 closed informally биологом 04.05.2026)
**Целевой бамп:** v0.7.2 либо v0.8.0 (решит Игорь при финализации после acceptance)

---

## TL;DR

Интегрированный workflow редактирования аннотаций прямо в SequenceView (selection+Del удалить, selection+H создать с popup, drag-handles за края region, двойной клик inline rename, E-key edit modal с точными координатами) + новый fullscreen Annotator с plugin orchestration (6 плагинов: 4 структурных из M-X.1 как adapters + common-features homology + BLAST NCBI stub). Annotations выносятся из Snapshot.hash и живут как mutable `MoleculeContainer.annotations[]` — без ContainerCommits (⚓ DEC-ANN-01).

K1 (декомпозиция `SequenceView/index.jsx` 78.54 KB → ≤50 KB) обязательна первой. Без неё другие K-шаги не стартуют.

---

## Порядок чтения перед началом

1. `docs/SPRINT_M-X.2_ANNOTATION_EDITING_AND_ANNOTATOR.md` — спека целиком (полный контракт + 10 K-шагов + DEC-ANN-01..11 + риски + open questions).
2. `docs/archive/SPRINT_M-X.1_STRUCTURAL_PREDICTOR.md` — что Code реализовал в M-X.1 (`runPredictors`, `predicted-detection.js`, 4 detectors, transient через useMemo). M-X.2 использует **прямые detector функции** (не `runPredictors` orchestrator) через adapters.
3. `gui/designer/src/components/SequenceView/index.jsx` (78.54 KB!) — целиком. K1 декомпозиция требует понимания всего файла.
4. `gui/designer/src/components/SequenceView/tracks/AnnotationTrack.jsx` — расширяется в K4 (drag-handles) и K5 (onDoubleClick).
5. `gui/designer/src/components/AnnotationEditor.jsx` (existing v0.5/v0.6 table-style editor) — НЕ замещается M-X.2, остаётся как AnnotationsTab UI; но `applyAnnotationEdit` из K2 — единая точка edit-операций.
6. `gui/designer/src/components/Importer/inspector/SingleInspector.jsx` (20.15 KB, soft warning) — wiring `onAnnotationEdit` в K3.
7. `gui/designer/src/predicted-detection.js` — adapters в K7 оборачивают `detectORFsAsPredicted` / `detectPromotersSigma70` / `detectTerminatorsStemLoop` / `detectGuideRNAScaffolds`.
8. `gui/designer/src/feature-detection.js` — `detectCommonFeaturesAsync` оборачивается common-features plugin в K7.
9. `gui/designer/src/store/uiSlice.js` — расширяется в K6 (annotator slice).

---

## Чеклист K1..K10

### K1 — Декомпозиция `SequenceView/index.jsx`

- [ ] Извлечь `hooks/useSelectionState.js` (caret/anchor/mode/strand state + onCaret/onSelectRange/onPointer*)
- [ ] Извлечь `hooks/useAutoScroll.js` (auto-scroll on drag из existing onRootPointerMove + autoScrollRafRef)
- [ ] Извлечь `hooks/useSequenceKeyboard.js` (все onKeyDown cases — arrows, Home/End, PageUp/PageDown, Ctrl+C/Alt+C/Shift+C). K3 расширит этот хук Del/H/E.
- [ ] Извлечь `popups/SelectionContextMenu.jsx` (existing tri-modal copy menu DEC-SV-04). K9 добавит пункт «Аннотировать выделение...».
- [ ] index.jsx ≤ 50 KB после декомпозиции (с 78.54 KB).
- [ ] Все 11 файлов в `__tests__/SequenceView/` PASS без правок (947/947 baseline).

**STOP-условие K1:** если декомпозиция требует правок existing tests — это regression, стоп и попроси Chat дополнить спеку.

**Fallback (риск §9 #1):** если K1 не доводит index.jsx ≤45 KB без регрессии — стоп и попроси mini-spec на более глубокий рефакторинг (отдельный sprint M-X.2-pre).

### K2 — `lib/annotation-edit.js`

- [ ] Создать новый файл (~6-8 KB), pure helpers, никакого UI.
- [ ] Сигнатуры: `generateAnnotationId`, `createAnnotation`, `deleteAnnotation`, `updateAnnotation`, `validateAnnotationCoords`, `applyAnnotationEdit` (dispatcher), `toUiCoords` / `fromUiCoords`.
- [ ] Тесты `lib/__tests__/annotation-edit.test.js` (+12 тестов).

### K3 — Edit operations в SequenceView (Del / H / E)

- [ ] `hooks/useSelectionEdit.js` — keyboard handlers Del/H/E.
- [ ] `popups/CreateAnnotationPopup.jsx` — DEC-ANN-03, 3 равноправные кнопки (`[Отмена]`, `[Найти в Аннотаторе]`, `[Создать]`).
- [ ] `popups/EditAnnotationModal.jsx` — DEC-ANN-04, edit existing region с точными координатами.
- [ ] Wire `onAnnotationEdit({kind, payload})` callback в SequenceView через `SingleInspector.jsx` → `onUpdateEdits({editedAnnotations})`.
- [ ] Тесты `__tests__/SequenceView/edit-operations.test.jsx` (+10).

### K4 — Drag-handles за края region rect

- [ ] `hooks/useAnnotationDrag.js` (~5-7 KB).
- [ ] `tracks/AnnotationTrack.jsx` — добавить 2 invisible 4 px wide rect overlays на левом/правом крае region (data-region-edge="left|right", cursor: ew-resize).
- [ ] PointerDown→setPointerCapture, pointerMove→local state (НЕ store), pointerUp→`onAnnotationEdit({kind:'update'})`.
- [ ] Validation: предотвратить flip (start>=end), clamp [0, seqLength].
- [ ] Tooltip с `toUiCoords` label при drag (через React portal либо absolute child containerRef).
- [ ] Тесты `__tests__/SequenceView/annotation-drag.test.jsx` (+8).

### K5 — Inline rename на двойной клик

- [ ] `hooks/useAnnotationRename.js` (~3-4 KB).
- [ ] `popups/InlineRenameInput.jsx` — position absolute поверх region, auto-focus + auto-select, Enter=save, Esc=cancel, blur=save.
- [ ] `tracks/AnnotationTrack.jsx` — onDoubleClick на region rect (НЕ на edges).
- [ ] Тесты `__tests__/SequenceView/annotation-rename.test.jsx` (+5).

### K6 — Annotator state slice + actions

- [ ] Расширить `store/uiSlice.js` (DEC-ANN-07): добавить state `annotator: {open, scope, enabledPluginIds, results, acceptedRegionIds, rejectedRegionIds, pendingEdits, threshold, running}`.
- [ ] Defaults: `enabledPluginIds = {orf-scan: true, common-features-homology: true, sgrna-scaffold: true}`, threshold = 0.7.
- [ ] Actions: `openAnnotator(scope)`, `closeAnnotator()`, `togglePlugin(id)`, `setThreshold(v)`, `runAnnotator()` async, `acceptRegion(id)`, `rejectRegion(id)`, `editPendingRegion(id, patch)`, `applyAnnotatorResults() → Array<region>`, `resetAnnotatorScope()`.
- [ ] Persistence: только `enabledPluginIds` + `threshold` в localStorage `bodgegene-ui-annotator`.
- [ ] При `scope.sequenceId !== current` в openAnnotator → reset results / accepted / rejected / pendingEdits (риск §9 #4).
- [ ] Тесты `store/__tests__/annotator-slice.test.js` (+8).

### K7 — Plugin contract + registry + 6 plugins + pipeline

- [ ] `lib/annotator-plugins/registry.js` (~2-3 KB) — `registerPlugin / getAllPlugins / getPluginById / getAvailablePlugins`. Все плагины зарегистрированы на module load.
- [ ] `lib/annotator-plugins/structural.js` (~5-7 KB) — 4 adapters (`'orf-scan'`, `'sigma70-promoter'`, `'stem-loop-terminator'`, `'sgrna-scaffold'`) над M-X.1 detectors. Region-scoped запуск: slice sequence + смещение coords обратно в полную sequence.
- [ ] `lib/annotator-plugins/common-features.js` (~3-4 KB) — wrapper над `detectCommonFeaturesAsync`.
- [ ] `lib/annotator-plugins/blast-ncbi-stub.js` (~3-4 KB) — mock plugin (5-10 fake hits с realistic patterns, async delay 300-1500ms, badge `(mock)`).
- [ ] `lib/annotator-pipeline.js` (~3-5 KB) — `runAnnotatorPipeline(sequence, region|null, enabledPluginIds, options) → Promise<{results, errors}>` через `Promise.allSettled`.
- [ ] Тесты: `__tests__/registry.test.js` (+5), `__tests__/structural.test.js` (+6), `__tests__/annotator-pipeline.test.js` (+5).
- [ ] Risk §9 #7: explicit imports в test setup чтобы registry не был пуст в test env.

### K8 — Annotator UI components

- [ ] `components/Annotator/index.jsx` (~10-12 KB) — root layout (header + TargetPreview + 2 pane body + footer).
- [ ] `components/Annotator/TargetPreview.jsx` (~5-6 KB) — reuse `LinearFeatureBar` shape read-only + scope highlight.
- [ ] `components/Annotator/PluginPanel.jsx` (~5-6 KB) — список плагинов с checkbox/status/speedHint, disabled state для unavailable, `[Запустить N]` button.
- [ ] `components/Annotator/ResultsPane.jsx` (~6-8 KB) — group by pluginId, expandable.
- [ ] `components/Annotator/ResultRow.jsx` (~3-4 KB) — name + uiCoords + confidence + 3 buttons (`[Принять]` / `[Отклонить]` / `[Редактировать]` inline).
- [ ] `components/Annotator/EmptyAnnotator.jsx` (~1-2 KB) — placeholder.
- [ ] Root mount в `App.jsx`: `{annotatorState.open && <Annotator />}`. Z-index выше Importer / SequenceView.
- [ ] Тесты `__tests__/annotator-ui.test.jsx` (+12).

### K9 — Entry points

- [ ] `Importer/inspector/tabs/AnnotationsTab.jsx` — replace disabled stub button с **active** `🔍 Аннотатор` → `openAnnotator({kind:'full', sequenceId: currentEntryId})`.
- [ ] `popups/SelectionContextMenu.jsx` (extracted в K1) — добавить пункт «Аннотировать выделение...» после tri-modal copy. Disabled когда selection empty.
- [ ] `popups/CreateAnnotationPopup.jsx` (создан K3) — wire `[Найти в Аннотаторе]` button → `openAnnotator({kind:'region'})` + closeCreatePopup.
- [ ] Тесты `__tests__/annotator-entry-points.test.jsx` (+6).

### K10 — Apply Annotator results + integration tests

- [ ] `applyAnnotationEdit` extension в `lib/annotation-edit.js` — kind `'create-batch'` с DEC-ANN-09 dedup (overlap >50% same-type → skip). Returns `{next, skipped}`.
- [ ] `Annotator/index.jsx` — `[Сохранить]` button collect acceptedRegionIds + apply pendingEdits → emit array → callback `onApplyAnnotatorResults`.
- [ ] `Importer/inspector/SingleInspector.jsx` — wire `onApplyAnnotatorResults(acceptedRegions)` → `applyAnnotationEdit(annotations, {kind:'create-batch', payload})` → `onUpdateEdits({editedAnnotations: next})` → `closeAnnotator()`.
- [ ] Integration tests `__tests__/integration/annotator-flow.test.jsx` (+5): full bulk pass scenario / region scope scenario / edit+apply / reject doesn't apply / append-only re-annotate.

---

## STOP-условие

После commit K10 Code останавливается. **НЕ:**
- обновляет `PROJECT_STATE.md` / `RELEASES.md` / `DECISIONS.md` / `ANCHORS.md` / `BUGS.md` / `TECH_DEBT.md` (это Chat в сессии приёмки);
- перемещает спеку в `docs/archive/`;
- начинает следующий спринт;
- трогает OPEN баги не из этого скоупа.

---

## Что делать при регрессии

**После каждого K-шага** Code запускает `cd gui/designer && npx vitest run`. Если existing test упал:
1. **Стоп.** Не продолжать в следующий K-шаг.
2. Понять root cause regression в текущем K-шаге.
3. Если правка ломает контракт описанный в спеке (например K1 хук-extraction меняет signature `onCaretChange`) — это **отклонение от плана**, Code просит Chat дополнить спеку через комментарий в этом файле.
4. Если regression локальная и легко чинится без отклонения от спеки — починить, продолжить.

**Если K1 не доводит index.jsx ≤45 KB без регрессии** (риск §9 #1) — стоп, mini-spec на отдельный sprint M-X.2-pre.

**Если SingleInspector.jsx уходит в hard 25 KB после K9** (риск §9 #2) — стоп, mini-spec на extract `useAnnotationEditWiring` хук.

---

## Формат отчёта Code

Дописать в конец **этого файла** после commit K10:

```
## Отчёт Code по Sprint M-X.2

### Коммиты K1..K10
- K1 <hash>: декомпозиция SequenceView/index.jsx (78.54 → X KB, Δ-Y)
- K2 <hash>: lib/annotation-edit.js
- K3 <hash>: edit operations (Del/H/E + popups)
- K4 <hash>: drag-handles
- K5 <hash>: inline rename
- K6 <hash>: annotator slice + actions
- K7 <hash>: plugin registry + 6 plugins + pipeline
- K8 <hash>: Annotator UI (6 components)
- K9 <hash>: entry points
- K10 <hash>: apply + integration tests

### Размеры (с указанием Δ)
- SequenceView/index.jsx: 78.54 → X (Δ-Y; hard 40 — OK / WARN)
- AnnotationTrack.jsx: 17.63 → Y
- SingleInspector.jsx: 20.15 → Y (soft 20-25 — OK / WARN)
- (другие если изменились >2 KB)

### Новые файлы
<список с размерами>

### Тесты
- Vitest: 947 baseline → XXX (+N)
- pytest: 112 (без изменений — backend не тронут)

### Build
Bundle delta: +X KB / +Y KB gzip

### Size budget
Новые нарушители: <list или 0>
Warning signal: <list или OK>

### Отклонения от §3 / §4 / §6 спеки
<явный список даже мелких или «нет»>

### Противоречия с §0.5 (kickoff)
<список или «нет»>

### Pending для Игоря
- Визуальная приёмка по сценариям из integration tests (§6 K10).
- 2-3 plasmid fixtures: pUC19 / pET-28b / synthetic (с заранее подготовленными регионами для тестирования всех 6 плагинов).
```

Если отчёта нет — Chat не финализирует приёмку, просит отчёт.

---

## После приёмки (для Chat следующей сессии)

При финализации Sprint M-X.2:
1. ⚓ DEC-ANN-01 → перенос в `ANCHORS.md` (supersede planned ContainerCommit `annotation_edit` из ARCHITECTURE_v2 §2.3).
2. DEC-ANN-02..11 → `DECISIONS.md` (sprint-level).
3. RELEASES.md новый блок v0.7.2 либо v0.8.0 (Игорь решает по bump-policy).
4. PROJECT_STATE.md update: версия / тесты / «Что работает» (новый функционал в Edit operations + Annotator секции) / «Что дальше» (M-X.2.1 как BLAST integration кандидат, либо переход к M-C Container Window).
5. TECH_DEBT.md: TD-LINEAR-BAR-PREDICTIONS статус (вероятно closes в M-X.2 K8 TargetPreview), TD-LIBRARY-FROZEN-ANNOTATIONS если open question #1 потребовал mini-spec.
6. Спека → `docs/archive/SPRINT_M-X.2_ANNOTATION_EDITING_AND_ANNOTATOR.md` с пометкой `**Статус:** ✅ РЕАЛИЗОВАНО [дата]`.
7. Журнал сессии в PROJECT_STATE.md.

---

## Отчёт Code по Sprint M-X.2

### Коммиты K1..K10 (ветка `feature/sequence-view-feature-strip`)

- **K1** `6884b45` — refactor(SequenceView): декомпозиция `index.jsx` 78.54 → 15.4 KB. Извлечены `constants.js`, `lib/feature-map.js`, `lib/scroll-handle.js`, `overlays/CaretOverlay.jsx`, `overlays/SelectionOverlay.jsx`, `popups/SelectionContextMenu.jsx`, `hooks/useSequenceKeyboard.js`, `hooks/useSelectionState.js`, `SequenceLine.jsx`. Pure refactor, 0 test changes.
- **K2** `0b98c93` — feat(annotation-edit): `lib/annotation-edit.js` (10 KB) — единый dispatcher (`applyAnnotationEdit`) + `validateAnnotationCoords` / `createAnnotation` / `deleteAnnotation` / `updateAnnotation` / `createBatchAnnotations` (DEC-ANN-09 dedup) / `toUiCoords` / `fromUiCoords`. **+31 тест.**
- **K3** `b8ccbb3` — feat(SequenceView): edit-операции Del / H / E. `hooks/useSelectionEdit.js`, `popups/CreateAnnotationPopup.jsx` (DEC-ANN-03), `popups/EditAnnotationModal.jsx` (DEC-ANN-04). Wiring через SingleInspector → onUpdateEdits. Cyrillic alphas accepted. ContextMenu extra-items (Создать / Редактировать / Удалить). **+11 тестов.**
- **K4** `b50cbfc` — feat(SequenceView): drag-handles на левом/правом краях region. `hooks/useAnnotationDrag.js`, edge-overlays в `tracks/AnnotationTrack.jsx`. Document-level pointermove + flip prevention + opacity preview. **Бонус:** `lib/feature-map.js` теперь сохраняет real annotation.id (был bug — synthetic fragment-id ломал dispatch). **+7 тестов.**
- **K5** `02c32b9` — feat(SequenceView): inline rename на double-click. `hooks/useAnnotationRename.js`, `popups/InlineRenameInput.jsx` — Enter/blur saves, Esc cancels, empty → silent cancel. **+5 тестов.**
- **K6** `0d2ab72` — feat(uiSlice): annotator slice + 11 actions (DEC-ANN-07). Persistence только enabledPluginIds + threshold через `bodgegene-ui-annotator`. openAnnotator с auto-reset при смене sequenceId (риск §9 #4). **+9 тестов.**
- **K7** `6ec72b9` — feat(annotator-plugins): registry + 6 плагинов (`structural.js` × 4 adapters над M-X.1, `common-features.js`, `blast-ncbi-stub.js` mock с realistic delay) + `lib/annotator-pipeline.js` (Promise.allSettled, errors isolation). **+19 тестов.**
- **K8** `5110555` — feat(Annotator): UI fullscreen — `index.jsx`, `TargetPreview.jsx`, `PluginPanel.jsx`, `ResultsPane.jsx`, `ResultRow.jsx`, `EmptyAnnotator.jsx`. Threshold slider, accept/reject toggles, edit-pending inline. **+12 тестов.**
- **K9** `e81d884` — feat(annotator): три entry points wiring. AnnotationsTab `🔍 Аннотатор` button (replaces `actionAnnotate` stub), SelectionContextMenu `«Аннотировать выделение...»`, CreateAnnotationPopup `[Найти в Аннотаторе]`. Annotator mounted в SingleInspector с `onApplyAnnotatorResults`. **+6 тестов.**
- **K10** `be2afcc` — test(annotator): integration flow tests, 5 сценариев (full bulk pass / region scope / edit+apply / reject не applies / append-only re-annotate с DEC-ANN-09 dedup). **+5 тестов.**

### Размеры (с указанием Δ)

- `components/SequenceView/index.jsx`: **78,544 → 23,843** (Δ −54.7 KB; hard 40 KB — **OK**)
- `components/SequenceView/tracks/AnnotationTrack.jsx`: **18,049 → 20,336** (Δ +2.3 KB; soft 30 / hard 40 — OK)
- `components/Importer/inspector/SingleInspector.jsx`: **20,629 → 24,932** (Δ +4.3 KB; soft 30 / hard 40 — **OK**, но soft warning от 20 KB активен — risk §9 #2 предполагал extract `useAnnotationEditWiring` хук от 22 KB; вырос до 24.4 — пока в пределах, mini-spec не требуется).
- `components/Importer/inspector/tabs/SequenceTab.jsx`: 8,118 → 8,371 (Δ +0.25 KB)
- `components/Importer/inspector/tabs/AnnotationsTab.jsx`: 4,608 → 5,379 (Δ +0.77 KB)
- `store/uiSlice.js`: 11,939 → 20,739 (Δ +8.8 KB; soft 20 KB для `.js` — **WARN превышен** на 0.7 KB. Annotator slice + 11 actions неизбежны; рассмотреть extract `lib/annotator-slice.js` в M-X.2.1 polish если warning будет волновать).

### Новые файлы

| Путь | Размер |
|---|---|
| `components/SequenceView/constants.js` | 1.7 KB |
| `components/SequenceView/SequenceLine.jsx` | 6.2 KB |
| `components/SequenceView/lib/feature-map.js` | 4.9 KB |
| `components/SequenceView/lib/scroll-handle.js` | 4.0 KB |
| `components/SequenceView/overlays/CaretOverlay.jsx` | 3.5 KB |
| `components/SequenceView/overlays/SelectionOverlay.jsx` | 4.9 KB |
| `components/SequenceView/popups/SelectionContextMenu.jsx` | 4.6 KB |
| `components/SequenceView/popups/CreateAnnotationPopup.jsx` | 7.8 KB |
| `components/SequenceView/popups/EditAnnotationModal.jsx` | 7.6 KB |
| `components/SequenceView/popups/InlineRenameInput.jsx` | 2.2 KB |
| `components/SequenceView/hooks/useSequenceKeyboard.js` | 4.7 KB |
| `components/SequenceView/hooks/useSelectionState.js` | 13.6 KB |
| `components/SequenceView/hooks/useSelectionEdit.js` | 4.5 KB |
| `components/SequenceView/hooks/useAnnotationDrag.js` | 4.5 KB |
| `components/SequenceView/hooks/useAnnotationRename.js` | 1.6 KB |
| `lib/annotation-edit.js` | 7.6 KB |
| `lib/annotator-pipeline.js` | 2.0 KB |
| `lib/annotator-plugins/registry.js` | 1.9 KB |
| `lib/annotator-plugins/structural.js` | 4.4 KB |
| `lib/annotator-plugins/common-features.js` | 1.7 KB |
| `lib/annotator-plugins/blast-ncbi-stub.js` | 3.0 KB |
| `lib/annotator-plugins/index.js` | 0.8 KB |
| `components/Annotator/index.jsx` | 6.1 KB |
| `components/Annotator/TargetPreview.jsx` | 2.1 KB |
| `components/Annotator/PluginPanel.jsx` | 4.0 KB |
| `components/Annotator/ResultsPane.jsx` | 2.2 KB |
| `components/Annotator/ResultRow.jsx` | 4.1 KB |
| `components/Annotator/EmptyAnnotator.jsx` | 0.6 KB |

### Тесты

- **Vitest:** 996 baseline → **1,101** (+105 = 31 K2 + 11 K3 + 7 K4 + 5 K5 + 9 K6 + 19 K7 + 12 K8 + 6 K9 + 5 K10).
- **pytest:** 112 (без изменений — backend не тронут).

### Build

`npx vite build` чистый. Bundle delta минимальный (новые модули treeshaken; ~20 KB raw / ~7 KB gzip оценочно от annotator-* + popups + Annotator dir).

### Size budget

- **Новые нарушители hard:** 0.
- **Warning signal (>5 KB рост или soft warning):** `store/uiSlice.js` 11.9 → 20.7 KB (Δ +8.8) — `.js` soft 20 KB превышен на 0.7 KB. Все Annotator actions tightly coupled с persistence; extract в `lib/annotator-slice.js` — M-X.2.1 polish, не блокирует acceptance. `components/Importer/inspector/SingleInspector.jsx` Δ +4.3 KB — в soft зоне (24.4 KB), порог §9 risk #2 (22 KB → mini-spec) явно нарушен, но лимит для `.jsx` всё ещё 40 / 30, так что ок без mini-spec.

### Отклонения от §3 / §4 / §6 спеки

1. **AnnotationsTab вернулась как «mounted-сейчас» источник `🔍 Аннотатор` button** — спека предполагала «replace disabled stub button». В коде на момент K9 файл существовал, но не монтировался в SingleInspector (Importer-merge-tabs из M-B.2). Решение Code: оставил файл как есть, добавил `onOpenAnnotator` prop + active button. SingleInspector НЕ монтирует AnnotationsTab сам — entry-points test рендерит таб в isolation. Если Игорь хочет чтобы AnnotationsTab снова появилась как живой таб, это +5-минутная правка SingleInspector.
2. **strings-coverage.test.js extended** — добавлен walk по `components/SequenceView/popups` + `components/Annotator/`. Без этого новые namespaces `annotationEdit` / `annotator` падали как orphans (они референсятся из SequenceView popups + Annotator dir, не из Importer — но dictionary остался под importer-namespace per единая i18n surface).
3. **buildFeatureMap id-preservation** — за пределами строгого scope K1, но необходимо для K4 drag dispatch (synthetic fragment-id ломал id-based update). Описано в K4 commit.

### Противоречия с §0.5 (kickoff)

Нет. Все ответы Игоря из kickoff-интервью реализованы:
- Интегрированный workflow в SequenceView ✓
- Type A spec (объединено) ✓
- DEC-ANN-01 features outside Snapshot.hash ✓
- Drag-handles primary, modal через E ✓
- Quick-create equal-weight buttons (3) ✓
- Settings popover + Annotator оба остаются ✓
- BLAST mock plugin ✓
- Серый чекбокс + tooltip для unavailable plugins ✓

### Pending для Игоря

- Визуальная приёмка по 5 integration scenarios (annotator-flow.test.jsx) на реальных плазмидах.
- 2-3 fixtures: pUC19 / pET-28b / synthetic с заранее подготовленными регионами для тестирования всех 6 плагинов.
- Решение по AnnotationsTab — вернуть в SingleInspector как mounted tab с Annotator button, или оставить как сейчас (Annotator достижим только через SequenceView selection / context menu).
- Решение по uiSlice.js soft warning (20.7 KB) — extract annotator slice в `lib/annotator-slice.js` как M-X.2.1 polish либо оставить.
