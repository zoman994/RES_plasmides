# Sprint M-X.2 — Annotation Editing in SequenceView + Annotator

**Статус:** ✅ РЕАЛИЗОВАНО 06.05.2026 (см. `RELEASES.md` блок v0.7.2).
**Тип:** A (новая UX-механика поверх существующего viewer + новый fullscreen + plugin contract).
**База:** v0.7.1 (M-X.1 closed informally 04.05.2026, ветка `feature/structural-predictor` HEAD `1c75857`).
**Предпосылка:** биологу нужен интегрированный workflow редактирования аннотаций в SequenceView (selection+Del удалить, selection+H создать, drag-handles за края подвинуть, двойной клик inline rename, E-key edit modal) — плюс «нырнуть в Аннотатор» когда не уверен что аннотировать. M-X.1 положил frontend baseline предсказательного слоя и transient `runPredictors`; M-X.2 строит поверх него интегрированный editor + fullscreen plugin orchestrator.

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Сейчас | Прогноз | Зона |
|------|--------|---------|------|
| `components/SequenceView/index.jsx` | **78.54 KB** | требует декомпозиции в K1 | **hard 40 — декомпозиция первый K-шаг** |
| `components/SequenceView/tracks/AnnotationTrack.jsx` | 17.63 KB | ~20-22 KB | safe |
| `components/AnnotationEditor.jsx` | 17.81 KB | без изменений | safe |
| `components/Importer/inspector/SingleInspector.jsx` | 20.15 KB | ~21-22 KB | soft (warning от 20 KB) |
| `components/Importer/inspector/tabs/AnnotationsTab.jsx` | 4.61 KB | ~5 KB | safe |
| `store/uiSlice.js` | 11.94 KB | ~12.5 KB | safe |
| `predicted-detection.js`, `annotation-model.js`, `auto-annotate.js` | без изменений | — | safe |
| **новый** `components/Annotator/` (директория) | — | ~25-35 KB | safe (несколько файлов) |
| **новый** `lib/annotation-edit.js` | — | ~6-8 KB | safe |
| **новый** `lib/annotator-plugins/` | — | ~12-18 KB | safe |

Лимиты: `.jsx` hard 40 / soft 30; `.js` hard 25 / soft 20; data-файлы без лимита (⚓ DECISIONS 22.04.2026).

`SequenceView/index.jsx` 78.54 KB — почти 2× hard. K1 = декомпозиция (см. §6). Без K1 другие шаги не стартуют — Code не имеет права дописывать в раздутый файл.

`SingleInspector.jsx` в soft-зоне — risk-bullet §9.

---

## 0.5. Ответы Игоря на kickoff-интервью 04.05.2026

Снимок Q/A на момент интервью, не правится после написания.

**Scope.**
- **Q:** Annotator как отдельный tool или интегрированный editor? **A:** Интегрированный workflow редактирования. В SequenceView базовые операции над фичами (изменить координаты, добавить/убрать покрытие нуклеотидов), удалить selection+Del, добавить selection+горячая клавиша/контекстное меню. При создании и редактировании можно явно нырнуть в Annotator. «Мы делаем всю систему для редактирования и помощи биологу».
- **Q:** Один sprint или разделить? **A:** Объединить. Тип A с +50% от лимита (30-45 KB).
- **Q:** Двойной клик на existing region → Annotator? **A:** Нет. Двойной клик = inline rename. Annotator — только для создания и для bulk pass.

**Data model.**
- **Q:** ContainerCommit для annotation edits? **A:** B — features вне commits. Snapshot.hash считается только от sequence + topology + ends. Annotations = mutable `MoleculeContainer.annotations[]`.
- **Q:** Frozen Library entry annotations? **A:** Не обсуждали (см. §5 предположение #4).

**UX.**
- **Q:** Quick-create popup на selection+H — link «нырнуть в Annotator» или равноправная кнопка? **A:** Равноправная кнопка. «Документация будет хорошая, не держи за дебилов пользователей».
- **Q:** Drag-handles или modal или inline? **A:** Drag-handles за края фичи как primary. Edit modal через клавишу E на selected region для точных координат.
- **Q:** Settings popover в SequenceView (M-X.1) дублирует Annotator? **A:** Оба остаются. Settings — quick toggle при чтении, Annotator — fullscreen для bulk pass.

**Plugin model.**
- **Q:** BLAST NCBI в M-X.2? **A:** Stub plugin contract + UI hookup + mock results. Реальная NCBI integration — отдельный mini-sprint после baseline.
- **Q:** Что показываем для unavailable плагина? **A:** Серый чекбокс с tooltip-причиной.

**Re-annotate.** Не дали явного ответа — default по принципу least-surprise = append (см. §4 DEC-ANN-09).

### Уточнения позже

(пусто)

---

## 1. Контекст

В v0.7.1 биолог открывает плазмиду в Importer Inspector → SequenceView показывает annotations (filled solid confident, unfilled+dashed predicted из M-X.1). Что биолог **не может** сделать прямо в Sequence tab:

1. **Удалить ошибочную auto-annotation** — только через AnnotationsTab → AnnotationEditor (отдельная вкладка, table-style editor). Разрыв workflow.
2. **Добавить region из selection** — selection в SequenceView не связан с add-form в AnnotationsTab.
3. **Подвинуть координаты existing region** — никак из SequenceView, только number input'ы в AnnotationsTab.
4. **Переименовать region** — двойной клик в SequenceView не работает.
5. **Запустить алгоритмический annotator на выделенный участок** — нет такой возможности. Settings popover (M-X.1 K5) даёт глобальный toggle 4 plugins + threshold, но не фокусную работу с участком.
6. **Видеть результаты «всех available annotators одновременно»** при импорте unannotated плазмиды. Сейчас `enrichWithCommonFeatures` (homology + auto-annotate) + `runPredictors` через transient layer SequenceView. Нет UI «прогнать batch + accept/reject».

M-X.2 закрывает это интегрированной системой: edit-операции прямо в SequenceView (Часть 1 K2-K5) + Annotator fullscreen с plugin orchestration (Часть 2 K6-K10). K1 (декомпозиция SequenceView/index.jsx 78.54 KB) — обязательная база для всех остальных.

**Связь с M-X.1.** M-X.1 положил `runPredictors(seq, settings, existingConfident)` в `predicted-detection.js` — orchestrator с 4 detectors (orf_scan / sigma70_pwm / stem_loop / sgrna_scaffold). Settings popover в SequenceView вызывает его через useMemo, transient regions (DEC-PRED-06). Annotator переиспользует те же 4 detectors как 4 плагина (через adapters), плюс добавляет 2 новых: **common-features homology** (wrapper над `detectCommonFeaturesAsync` из `feature-detection.js`) и **BLAST NCBI stub** (mock results).

**Vital ANCHORS context.**
- ⚓ DEC-PARSER-COORD-01: координаты 0-based exclusive end end-to-end. Все edit-операции должны respect.
- ⚓ DEC-V2-28: dual-context fullscreens. Annotator — push в stack (§1.9 ARCHITECTURE_v2).
- ⚓ DEC-SV-01..04: caret sync, scrollIntoView pattern, drag-scrubber, selection context menu. M-X.2 расширяет existing context menu новым пунктом, не пересоздаёт.

---

## 2. Стратегия

**Часть 1.** Edit-операции реализуются как набор interaction handlers + минимальный UI surface (drag-handles на rect ends, inline rename input на double-click, quick-create popup на selection+H, edit modal на E-key) поверх M-B.3 SequenceView. Все правки идут через одну точку — `applyAnnotationEdit(annotations, edit)` из нового `lib/annotation-edit.js` — которая возвращает новый array, store пишет в `MoleculeContainer.annotations[]` либо в `perFileEdits.editedAnnotations` (Importer контекст). Никаких ContainerCommits — DEC-ANN-01.

**Часть 2.** Новый компонент `components/Annotator/` — fullscreen с тремя секциями: target preview (linear strip), plugin selection (left), results pane (right). Plugin orchestration через `runAnnotatorPipeline(sequence, region?, enabledPlugins, options)` из `lib/annotator-pipeline.js`. State в Zustand `annotator` slice (внутри `uiSlice.js`) — transient между сессиями, preserved при close-reopen.

**Plugin contract** единый: `(sequence, region?, options) → Promise<AnnotatorResult>` + metadata. Регистрация в `lib/annotator-plugins/registry.js`. M-X.2 регистрирует 6 плагинов: 4 структурных из M-X.1, common-features homology, BLAST NCBI stub.

---

## 3. Scope

### IN

**Часть 1 — Edit operations:** декомпозиция `SequenceView/index.jsx` (K1). Новые `lib/annotation-edit.js`, `hooks/useSelectionEdit.js`, `hooks/useAnnotationDrag.js`, `hooks/useAnnotationRename.js`, `popups/CreateAnnotationPopup.jsx`, `popups/EditAnnotationModal.jsx`, `popups/InlineRenameInput.jsx`. Расширение `AnnotationTrack.jsx` (drag-handles + onDoubleClick). Wiring через `SingleInspector.jsx` → `onUpdateEdits` (existing M-B.2 flow).

**Часть 2 — Annotator:** новый `components/Annotator/` (6 файлов). Новый `lib/annotator-pipeline.js`. Новые `lib/annotator-plugins/` (registry + structural adapters + common-features wrapper + blast-ncbi stub). Расширение `store/uiSlice.js` (annotator state slice).

**Часть 3 — Glue:** entry points (Importer AnnotationsTab button + SelectionContextMenu пункт + CreateAnnotationPopup `[Найти в Аннотаторе]`). Apply flow (Annotator `[Сохранить]` → onApplyAnnotatorResults → onUpdateEdits в Importer).

Полный список файлов и сигнатур — §6.

### OUT

- **Real BLAST NCBI client.** Stub возвращает mock results. Реальная NCBI Entrez API integration — M-X.2.1 mini-sprint после baseline.
- **Pfam / SignalP / AUGUSTUS plugins** — M-X.3..M-X.5, отдельные sprints с backend.
- **Direct Library annotation.** Биолог редактирует только проектные контейнеры. Library entry annotations frozen (DEC-LIB-05 distribute на annotations, см. §5 #4). Чтобы аннотировать Library — clone в проект → правит → re-import.
- **Cross-container batch annotation** — выбрать N контейнеров и прогнать плагины на всех сразу. M-D Container Window либо позже.
- **Versioning UI annotations** (история одного feature) — не поддерживается из-за DEC-ANN-01. Если потребуется — отдельный mechanism в v1.5+.
- **Undo/Redo per annotation** — в M-D Container Window (стандартный browser-style undo стек).
- **TabBar в Annotator** (Region info / Evidence / Source) — упрощено в один single-pane результат. Polish после v1.0.
- **Re-annotate с diff-merge UI.** Default = append (DEC-ANN-09). Diff-merge — TODO в M-X.2.1.
- **Двойной клик на region → Annotator.** Убран по решению Игоря — двойной клик = inline rename.

---

## 4. Архитектурные решения

### ⚓ DEC-ANN-01 — Annotations выносятся из Snapshot.hash, живут как mutable `MoleculeContainer.annotations[]`

Snapshot.hash считается только от sequence + topology + ends. Поле `regions/details/points` либо удаляется из Snapshot, либо остаётся для backward-compat в импортированных .gb файлах но не входит в content hash. Аннотации живут в отдельном поле `MoleculeContainer.annotations[]`.

**Почему:**
1. Аннотации = интерпретация sequence, не сама sequence. Биолог переаннотирует gene 5 раз — это не должно создавать 5 commits в DAG.
2. Биолог часто работает в режиме «попробовал — не понравилось — отменил» (особенно в Annotator). Если каждое движение = commit → отбивает желание экспериментировать.
3. Drag-handles за края region на 1 nt = высокочастотные events. Без debounce шум в commits, с debounce — лишняя сложность.
4. Provenance важен на уровне «что это за молекула и как она получилась», не «как мы её разметили».

**Последствия:** ContainerCommit type `'annotation_edit'` (ARCHITECTURE_v2 §2.3) — становится либо dead-code, либо удаляется. Решение Code: оставить в schema на forward-compat без callers в M-X.2 коде. Это ⚓ — supersede планируемого ContainerCommit `annotation_edit`. Вносится в ANCHORS.md при финализации.

**Альтернативы отклонили:** (A) полный git — high-freq drag events ломают, batch on close сложен; (C) smart split — размывается граница «было автоматически — не commit, тронул руками — commit», confusing mental model.

### DEC-ANN-02 — Drag-handles за края region rect для координат

Левый/правый край region rect — drag-handle (2-3 px hover-зона, cursor: ew-resize). PointerDown→start drag, pointerMove→live update region.start или region.end, pointerUp→finalize через `applyAnnotationEdit`.

**Сложность:** при overlapping regions нижний row может быть unreachable для drag-by-edge. **Митигация:** drag работает только на той row, чей rect под cursor pointer. Если совсем перекрыто — fallback через E-key edit modal.

### DEC-ANN-03 — Quick-create popup при selection+H, равноправные кнопки

Биолог выделяет участок → нажимает `H` (или контекстное меню → «Создать аннотацию...»). Popup рядом с правым краем selection: Name (text), Type (select из TYPE_GROUPS), Start (number 1-based), End (number 1-based), Strand (radio).

3 равноправные кнопки: `[Отмена]`, `[Найти в Аннотаторе]` (открывает Annotator scope=region), `[Создать]` (immediately через `applyAnnotationEdit`). Outside-click / Esc → закрытие без эффекта.

### DEC-ANN-04 — Edit modal через клавишу E на selected region

Биолог кликает на region (selection range = whole region через `onSelectRangeFromView` уже existing M-B.3 callback) → нажимает `E` → modal с number input'ами для точных координат (1-based inclusive end в UI).

### DEC-ANN-05 — Двойной клик на region → inline rename

Двойной клик на region rect → label превращается в input. Enter (save) / Esc (cancel) / blur (save). Inline rename быстрее modal — самая частая операция (rename auto-detected misc_feature в `pAOX1 promoter`).

### DEC-ANN-06 — Selection+Del удаляет одну region, требует selection cover full region

Биолог кликает на region (selection range = whole region) → Del → удаляется через `applyAnnotationEdit(... 'delete')`. Без confirmation. Если selection не = region.start..region.end — Del → no-op (не удаляем все regions попадающие в selection — slippery slope).

### DEC-ANN-07 — Annotator state в Zustand `annotator` slice внутри uiSlice

State shape:
```
annotator: {
  open: boolean,
  scope: { kind: 'full' | 'region', sequenceId, region? } | null,
  enabledPluginIds: Record<string, boolean>,
  results: Record<pluginId, AnnotatorResult>,
  acceptedRegionIds: Record<regionId, true>,
  rejectedRegionIds: Record<regionId, true>,
  pendingEdits: Record<regionId, Partial<region>>,
  threshold: number,
  running: Record<pluginId, boolean>,
}
```

Zustand+Immer работает с plain objects → `Set` храним как `Record<string, true>`, `Map` как `Record<string, value>`.

**Persistence:** только `enabledPluginIds` + `threshold` в localStorage `bodgegene-ui-annotator`. Остальное — transient. State preserved при close-reopen в той же сессии (DEC-ANN-07). При смене плазмиды (`scope.sequenceId !== new.sequenceId`) — reset results / accepted / rejected / pendingEdits, preserved enabled + threshold.

### DEC-ANN-08 — Plugin contract: pure async function + metadata

```
interface AnnotatorPlugin {
  id: string;
  name: string;
  shortDescription: string;
  capabilities: {
    needsRegion, fullSequenceOk, async, requiresNetwork, requiresBackend, speedHint
  };
  isAvailable: (runtimeContext) => boolean;
  unavailableReason?: (runtimeContext) => string | null;
  run: (sequence, region | null, options) => Promise<AnnotatorResult>;
}

interface AnnotatorResult {
  pluginId, pluginName, regions, runAt, parameters, durationMs, error?
}
```

Регистрация в `lib/annotator-plugins/registry.js`. `getAvailablePlugins(runtimeContext)` фильтрует по `isAvailable`.

### DEC-ANN-09 — Re-annotate default: append, не wipe

Bulk pass на плазмиде с existing annotations — accepted результаты **добавляются** к existing, не replace. Дубликаты (overlap >50% same-type) — silent skip с counter в Annotator footer.

**Почему:** Игорь не дал явного ответа на Q4, default по least-surprise. Diff-merge UI — M-X.2.1.

**Edge case:** биолог хочет re-annotate с нуля — workflow «AnnotationsTab → выделить все → Del → bulk Annotator». Не идеально, но прозрачно.

### DEC-ANN-10 — UI 1-based inclusive end, store 0-based exclusive end

Все popup'ы / edit modal / drag-handle tooltips показывают 1-based inclusive (`146..469` для CDS длиной 324 nt). Store пишет/читает 0-based exclusive (`145..469`).

Конверсия в `lib/annotation-edit.js`:
```
toUiCoords(start, end) → {uiStart: start+1, uiEnd: end}
fromUiCoords(uiStart, uiEnd) → {start: uiStart-1, end: uiEnd}
```

⚓ DEC-PARSER-COORD-01 фиксирует контракт «0-based exclusive end end-to-end» в backend. Frontend store следует. UI показывает биологически естественные координаты.

### DEC-ANN-11 — BLAST stub plugin как реальный plugin контракт

`lib/annotator-plugins/blast-ncbi-stub.js` — полноценный plugin object с `run(seq, region?, opts) → Promise<AnnotatorResult>`. Возвращает 5-10 fake hits с реалистичными именами / coords / e-values. Badge `MOCK` в pluginName делает явным.

Promise с искусственным delay (300-1500ms random) — биолог видит spinner, тестирует UX async loading. Реальная BLAST integration в M-X.2.1 — заменяется только implementation `run()`, контракт тот же.

---

## 5. Предположения

1. **`MoleculeContainer.annotations[]` уже работает как mutable array.** Источник: M-B.2 codebase — perFileEdits.editedAnnotations пишется через `onUpdateEdits`, AnnotationEditor вызывает `onChange(updatedArray)`. Проверено: да. Container Window M-D будет иметь свой annotations flow, для M-X.2 работаем только в Importer контексте.

2. **SequenceView containerRef имеет focus-able state для keyboard handlers.** Источник: M-B.3 — `containerRef.current?.focus({preventScroll: true})` уже вызывается в onRootClickFallback. Проверено: да.

3. **`runPredictors` orchestrator работает без модификаций.** Источник: M-X.1 `predicted-detection.js`. Проверено: да. Adapters в `lib/annotator-plugins/structural.js` оборачивают 4 detectors индивидуально (биолог в Annotator выбирает какие включить, не общий threshold) — не runPredictors orchestrator, а прямые `detectORFsAsPredicted`, `detectPromotersSigma70` etc.

4. **Frozen Library entry annotations.** Не обсуждали явно. Предполагаю: M-X.2 редактирует только проектные контейнеры (Importer perFileEdits flow). Library entry annotations frozen после `addLibraryEntry` (DEC-LIB-05 distribute на annotations). **Если не так** — биолог может через M-X.2 сломать Library shared catalog. **Действие в Code:** в `applyAnnotationEdit` добавить assertion / warning если caller передаёт Library entry. Если Игорь скажет иначе на acceptance — TD-LIBRARY-FROZEN-ANNOTATIONS, mini-spec.

5. **`onSelectRangeFromView` от feature-click уже есть в SingleInspector.** Источник: M-B.3 cycle DEC-SV-04. Проверено: да. M-X.2 расширяет: при `mode === 'feature'` (новый mode) — selection покрывает region.start..region.end и biolog может Del / E / H работать с этим selection.

6. **CSS variables для popup styling уже определены.** Источник: M-A.1 polish + DESIGN_SYSTEM.md. Проверено: да, `var(--surface-1)`, `var(--border-default)`, `var(--radius-md)` используются в context menu DEC-SV-04. M-X.2 popups переиспользуют те же tokens.

7. **i18n strings.** Source: M-A.2 STRINGS namespace. Действие в Code: новые UI strings — в `lib/strings.js` под namespace `STRINGS.annotator` и `STRINGS.annotationEdit`. Bilingual policy DEC-MA2-01.

---

## 6. Задачи

### K1 — Декомпозиция `SequenceView/index.jsx`

**Файл:** `components/SequenceView/index.jsx` (78.54 KB → разбить).

**Цель:** index.jsx ≤ 50 KB, новые файлы ≤ 15 KB каждый. Pure refactor — все existing tests должны pass без изменений.

**Извлечения:**
- `hooks/useSelectionState.js` — selection state (caretPos, caretAnchor, selectionMode, selectionStrand) + handlers (onCaretChange, onSelectRange, onPointer*).
- `hooks/useAutoScroll.js` — auto-scroll on drag (existing logic из onRootPointerMove + autoScrollRafRef).
- `hooks/useSequenceKeyboard.js` — все onKeyDown cases (arrows, Home/End, PageUp/PageDown, Ctrl+C/Alt+C/Shift+C). K3 расширит этот хук Del / H / E handlers.
- `popups/SelectionContextMenu.jsx` — existing tri-modal copy menu DEC-SV-04. K9 добавит пункт «Аннотировать выделение...».

**Тесты:** existing 11 файлов в `__tests__/SequenceView/` — все pass без правок. Если правки нужны — отклонение от плана, Code останавливается.

### K2 — `lib/annotation-edit.js`

**Файл:** новый `lib/annotation-edit.js` (~6-8 KB). Pure helpers, никакого UI.

**Сигнатуры:**
- `generateAnnotationId({start, end, type, name}) → string` — совместим с annotation-model.js getRegions backfill pattern (`region:145:469:CDS:lacZα`).
- `createAnnotation({name, type, start, end, level?, strand?}) → annotation` — конструктор с auto-id, throws on invalid coords.
- `deleteAnnotation(annotations, annotationId) → annotations[]` — filtered array.
- `updateAnnotation(annotations, annotationId, patch) → annotations[]` — patch с re-validate coords.
- `validateAnnotationCoords(start, end, seqLength) → {valid, error?}` — start<0 / end>seqLen / start>=end.
- `applyAnnotationEdit(annotations, edit) → annotations[]` — dispatcher по `edit.kind` (`'create'|'delete'|'update'|'create-batch'`). Throws on bad kind.
- `toUiCoords(start, end) / fromUiCoords(uiStart, uiEnd)` — конверсия 0-based exclusive ↔ 1-based inclusive.

**Тесты** (`lib/__tests__/annotation-edit.test.js`, +12): happy path / invalid coords / id-not-found / patch coord re-validate / dispatch all kinds / round-trip coord conversion. Шаблон — см. §6 K2 в spec'е v1, ниже сжатый.

### K3 — Edit operations (Del / H / E)

**Файлы:**
- `hooks/useSelectionEdit.js` — keyboard handlers Del/H/E.
- `popups/CreateAnnotationPopup.jsx` — quick-create popup (DEC-ANN-03).
- `popups/EditAnnotationModal.jsx` — edit modal (DEC-ANN-04).
- `SequenceView/index.jsx` — wire новые handlers.
- `Importer/inspector/SingleInspector.jsx` — pass `onAnnotationEdit({kind, payload})` callback в SequenceView, internally → `onUpdateEdits({editedAnnotations})`.

**Хук `useSelectionEdit({annotations, selectionRange, selectedAnnotationId, onAnnotationEdit, seqLength})` возвращает:**
- `handleKeyDown(e) → boolean` — Del удаляет selectedAnnotation, H открывает CreateAnnotationPopup при non-collapsed selection, E открывает EditAnnotationModal при selectedAnnotationId. Игнорирует когда target — input/textarea.
- `isCreatePopupOpen / closeCreatePopup / isEditModalOpen / closeEditModal`.

**`CreateAnnotationPopup`:**
- Position: рядом с правым краем selection.
- Fields: Name (focus on mount), Type select (TYPE_GROUPS), Start/End (number, 1-based pre-filled через toUiCoords), Strand radio (+/-). Type default = 'CDS'.
- Buttons: `[Отмена]`, `[Найти в Аннотаторе]` (→ openAnnotator scope=region), `[Создать]` (→ applyAnnotationEdit kind='create').
- Outside-click / Esc → close без эффекта. Stop propagation на pointer events (как existing context menu).

**`EditAnnotationModal`:**
- Center-of-screen + backdrop overlay.
- Pre-filled из `annotations.find(a => a.id === selectedAnnotationId)` через toUiCoords.
- Buttons: `[Отмена]`, `[OK]` (→ applyAnnotationEdit kind='update' через fromUiCoords).

**Тесты** (`__tests__/edit-operations.test.jsx`, +10): Del → onAnnotationEdit delete; H → popup opens; popup `[Создать]` → applyAnnotationEdit create; popup `[Найти в Аннотаторе]` → openAnnotator action; E → modal opens с pre-filled; modal `[OK]` → applyAnnotationEdit update; coords conversion 1↔0 based; keyboard ignored when input focused; Esc closes popups.

### K4 — Drag-handles за края region rect

**Файлы:**
- `hooks/useAnnotationDrag.js` (~5-7 KB).
- `tracks/AnnotationTrack.jsx` — добавить edge overlays + drag affordance.

**Хук `useAnnotationDrag({annotations, charPx, containerRef, onAnnotationEdit, seqLength})` возвращает:**
- `onPointerDownEdge(e, annotationId, edge: 'left'|'right')` — setPointerCapture, save initial state.
- onPointerMove (handler attached to root) — compute new coord (`e.clientX → seq position`), update local state (НЕ store), render tooltip с toUiCoords label.
- onPointerUp — releasePointerCapture, `onAnnotationEdit({kind: 'update', payload: {id, patch: {start: newStart} | {end: newEnd}}})`.
- onPointerCancel — reset без commit.
- Validation: предотвратить flip (start >= end), clamp [0, seqLength].
- isDragging / draggedAnnotationId / draggedEdge / draggedTooltip.

**AnnotationTrack additions:**
- Каждая region rect получает 2 invisible 4 px wide rect overlays на левом и правом крае:
  - `data-annotation-id={ann.id}`, `data-region-edge="left|right"`, fill="transparent", cursor: ew-resize.
  - onPointerDown=onPointerDownEdge.
- Active drag → region rect получает opacity 0.7 (через class или style).
- Tooltip — absolute element поверх SequenceView через React portal либо absolute child containerRef.

**Тесты** (`__tests__/annotation-drag.test.jsx`, +8): pointerdown→isDragging; pointermove→state local не вызывает callback; pointerup→callback с patch; left edge→patch.start, right edge→patch.end; clamp [0,seqLen]; flip prevention; pointerCancel→no callback; tooltip shows uiCoord.

### K5 — Inline rename на двойной клик

**Файлы:**
- `hooks/useAnnotationRename.js` (~3-4 KB).
- `popups/InlineRenameInput.jsx` (~2-3 KB).
- `tracks/AnnotationTrack.jsx` — onDoubleClick handler propagate.

**`useAnnotationRename({onAnnotationEdit})`** возвращает: `isRenamingId / startRename(annotation) / cancelRename / saveRename(newName)`.

**`InlineRenameInput`:** position absolute поверх region rect (по rect bbox), `<input>` с auto-focus, auto-select, onBlur=save, Enter=save, Esc=cancel. Width = max(80px, regionWidth). Стиль через CSS variables.

**AnnotationTrack:** onDoubleClick на region rect → `startRename(annotation)`. Если `isRenamingId === annotation.id` — render `InlineRenameInput`, hide native label.

**Тесты** (`__tests__/annotation-rename.test.jsx`, +5): double-click→input appears; Enter→onAnnotationEdit update name; Esc→no callback; outside-click→save; empty name→no save.

### K6 — Annotator state slice + actions

**Файл:** `store/uiSlice.js` (расширить).

State (см. DEC-ANN-07):
```
annotator: {
  open, scope, enabledPluginIds, results, acceptedRegionIds,
  rejectedRegionIds, pendingEdits, threshold, running
}
```

Defaults: `enabledPluginIds = {orf-scan: true, common-features-homology: true, sgrna-scaffold: true}` (DEC-PRED-03 priors), threshold = 0.7.

**Actions** (через Immer mutator pattern uiSlice уже использует):
- `openAnnotator(scope)` — set state.open=true. Если scope.sequenceId !== current → reset results/accepted/rejected/pendingEdits.
- `closeAnnotator()` — set state.open=false, остальное preserved.
- `togglePlugin(pluginId)`, `setThreshold(value)`.
- `runAnnotator()` async — calls `runAnnotatorPipeline` (K7), populates results/running.
- `acceptRegion(id)` / `rejectRegion(id)` — mutually exclusive (accept clears reject и vice versa).
- `editPendingRegion(id, patch)`.
- `applyAnnotatorResults() → Array<region>` — extracts accepted regions с применением pendingEdits patches; возвращает array (caller wires в onUpdateEdits).
- `resetAnnotatorScope()` — clears results/accepted/rejected/pendingEdits.

**Persistence:** только `enabledPluginIds` + `threshold` в localStorage `bodgegene-ui-annotator` через existing `getJSON`/`setJSON` pattern. Остальное — transient.

**Тесты** (`store/__tests__/annotator-slice.test.js`, +8): open/close preserves state; togglePlugin; setThreshold persists; acceptRegion / rejectRegion mutually exclusive; resetAnnotatorScope; persistence — enabled + threshold но не results.

### K7 — Plugin contract + registry + 6 plugins + pipeline

**Файлы:**
- `lib/annotator-plugins/registry.js` (~2-3 KB).
- `lib/annotator-plugins/structural.js` (~5-7 KB) — 4 adapters.
- `lib/annotator-plugins/common-features.js` (~3-4 KB) — homology wrapper.
- `lib/annotator-plugins/blast-ncbi-stub.js` (~3-4 KB) — mock plugin.
- `lib/annotator-pipeline.js` (~3-5 KB) — orchestrator.

**`registry.js`:** `registerPlugin(plugin) / getAllPlugins() / getPluginById(id) / getAvailablePlugins(runtimeContext)`. Все плагины зарегистрированы на module load.

**`structural.js`:** 4 plugin objects (`'orf-scan'`, `'sigma70-promoter'`, `'stem-loop-terminator'`, `'sgrna-scaffold'`) — adapters над M-X.1 detectors:
- `orf-scan` wraps `detectORFsAsPredicted(seq, existingConfident)`. capabilities.async=false, fullSequenceOk=true, needsRegion=false.
- `sigma70-promoter` wraps `detectPromotersSigma70(seq, threshold)`. opts.threshold respected.
- `stem-loop-terminator` wraps `detectTerminatorsStemLoop(seq, threshold)`.
- `sgrna-scaffold` wraps `detectGuideRNAScaffolds(seq)`. threshold не применяется (binary identity).

Для region-scoped запуска: adapter slice'ит sequence на `[region.start..region.end]`, запускает detector, **смещает** все region.start / region.end в результате на `+region.start` чтобы координаты были в полной sequence.

**`common-features.js`:** plugin id `'common-features-homology'`. `run(seq, region?, opts)` → calls `detectCommonFeaturesAsync(seq)` из existing `feature-detection.js`. Возвращает hits в shape AnnotatorResult.

**`blast-ncbi-stub.js`:** plugin id `'blast-ncbi'`. capabilities.async=true, requiresNetwork=true. `run` → `await new Promise(r => setTimeout(r, randomDelay(300, 1500)))` → return mock hits (5-10 fake regions с realistic-looking names типа `hypothetical protein WP_000123456.1`, random e-values 1e-50..1e-5, random identity 40-99%). Badge `(mock)` в pluginName.

**`annotator-pipeline.js`:**
```
runAnnotatorPipeline(sequence, region | null, enabledPluginIds, options)
  → Promise<{results: Record<pluginId, AnnotatorResult>, errors: Record<pluginId, string>}>
```
- Получает все plugins через `getAllPlugins()`, фильтрует по `enabledPluginIds`.
- Параллельно через `Promise.allSettled`. Возвращает после завершения всех.

**Тесты:**
- `registry.test.js` (+5): registerPlugin / getById / getAll / getAvailable filter / module-load defaults.
- `structural.test.js` (+6): orf-scan на pUC19 returns predicted regions; region scope shifts coords back; sigma70 respects threshold; sgrna-scaffold на synthetic Cas9 sequence; plugin objects valid (id/capabilities/run); structural async=false but resolved next tick.
- `annotator-pipeline.test.js` (+5): 1/3 plugins → all results populated; plugin throws → error captured, others continue; empty enabled → empty results; region scope passed correctly.

### K8 — Annotator UI components

**Файлы:**
- `components/Annotator/index.jsx` (~10-12 KB) — root layout.
- `components/Annotator/TargetPreview.jsx` (~5-6 KB) — linear strip наверху.
- `components/Annotator/PluginPanel.jsx` (~5-6 KB) — left pane.
- `components/Annotator/ResultsPane.jsx` (~6-8 KB) — right pane, grouped by pluginId.
- `components/Annotator/ResultRow.jsx` (~3-4 KB) — one row.
- `components/Annotator/EmptyAnnotator.jsx` (~1-2 KB) — placeholder.
- `App.jsx` либо root component — render Annotator при `state.annotator.open`.

**Layout `Annotator/index.jsx`:**
- Header: `← Назад` (closeAnnotator), title «Аннотатор», scope info, threshold slider.
- TargetPreview наверху (под header): linear strip, существующие annotations + scope highlight (если scope.region — overlay на участке).
- Body: 2 pane — PluginPanel (left, ~280 px) + ResultsPane (flex).
- Footer: summary («Принято: N · Отклонено: M · Изменено: K»), `[Сохранить]` button.

**`TargetPreview`:** reuse `LinearFeatureBar` shape но read-only (без drag-scrubber), показывает existing annotations + scope highlight.

**`PluginPanel`:** список плагинов, каждый row — checkbox + plugin name + speedHint badge (instant/fast/slow) + status (idle / running spinner / done with count). Disabled state для unavailable plugins (серый + tooltip с unavailableReason). `[Запустить N]` button enabled когда хотя бы 1 plugin enabled и не running.

**`ResultsPane`:** group by pluginId (expandable header с count), внутри — список ResultRow.

**`ResultRow`:** name + coords (uiCoords) + confidence pill + 3 buttons. Status indicator: accepted/rejected/pending. `[Принять]`/`[Отклонить]` toggle, `[Редактировать]` → inline edit fields → editPendingRegion.

**`EmptyAnnotator`:** placeholder когда нет enabled plugins / нет results.

**Root mount:** в `App.jsx` добавить `{annotatorState.open && <Annotator />}`. Z-index выше Importer / SequenceView. Не использует router — pure store-driven overlay.

**Тесты** (`__tests__/annotator-ui.test.jsx`, +12): не render когда open=false; renders когда open=true; PluginPanel disabled state; toggle plugin → action; `[Запустить]` → runAnnotator action; results grouped; accept/reject buttons → actions; edit inline; `[Сохранить]` → applyAnnotatorResults + closeAnnotator; `← Назад` → closeAnnotator без apply; UI coords 1-based.

### K9 — Entry points

**Файлы:**
- `Importer/inspector/tabs/AnnotationsTab.jsx` — replace disabled stub button с `🔍 Аннотатор` (active).
- `popups/SelectionContextMenu.jsx` (extracted в K1) — добавить пункт «Аннотировать выделение...» после tri-modal copy.
- `popups/CreateAnnotationPopup.jsx` (создан K3) — wire `[Найти в Аннотаторе]` button.

**Wiring:**
- AnnotationsTab `🔍 Аннотатор` → `openAnnotator({kind:'full', sequenceId: currentEntryId})`.
- SelectionContextMenu новый пункт → `openAnnotator({kind:'region', region: selectionRange})` + close menu. Disabled когда selection empty (как existing tri-modal).
- CreateAnnotationPopup `[Найти в Аннотаторе]` → `openAnnotator({kind:'region', region:{start,end}})` + closeCreatePopup.

**Тесты** (`__tests__/annotator-entry-points.test.jsx`, +6): AnnotationsTab button → openAnnotator full; ContextMenu имеет новый пункт; click → openAnnotator region; popup `[Найти]` → openAnnotator + close popup; popup `[Создать]` → applyAnnotationEdit (не openAnnotator); ContextMenu пункт disabled когда selection empty.

### K10 — Apply Annotator results + integration test

**Файлы:**
- `Annotator/index.jsx` — `[Сохранить]` button wiring.
- `Importer/inspector/SingleInspector.jsx` — pickup applied regions через `onUpdateEdits`.
- `lib/annotation-edit.js` — extension в K2: kind `'create-batch'`.

**Apply flow:**
- Annotator footer `[Сохранить]` → collect `acceptedRegionIds` → собрать regions из results с применением pendingEdits patches → emit array → call `onApplyAnnotatorResults` callback.
- В Importer SingleInspector:
  ```
  onApplyAnnotatorResults(acceptedRegions) {
    const next = applyAnnotationEdit(annotations, {kind:'create-batch', payload: acceptedRegions});
    onUpdateEdits?.({editedAnnotations: next});
    closeAnnotator();
  }
  ```

**`applyAnnotationEdit` extension** kind='create-batch' с DEC-ANN-09 dedup: для each region — если overlap >50% с existing same-type → skip. Returns `{next: annotations[], skipped: number}`.

**Integration test** (`__tests__/integration/annotator-flow.test.jsx`, +5):
1. **Full bulk pass:** Importer → AnnotationsTab → `🔍 Аннотатор` → toggle ORF + common-features → Запустить → wait results → accept 2 → Сохранить. perFileEdits.editedAnnotations contains existing + 2 new.
2. **Region scope:** Importer → SequenceTab → select 145..245 → H → CreateAnnotationPopup → `[Найти в Аннотаторе]`. Annotator opens scope=region. TargetPreview highlights.
3. **Edit + apply:** Annotator → accept → Edit → rename → Сохранить. editedAnnotations contains region с новым именем.
4. **Reject не applies:** accept 2, reject 1 → Сохранить → editedAnnotations contains только 2 accepted.
5. **Append-only re-annotate (DEC-ANN-09):** existing CDS 145..469. Annotator returns predicted ORF 144..470 (>50% overlap, same type) → accept → Сохранить → existing CDS preserved, predicted skipped, summary toast «1 hit skipped as duplicate».

---

## 7. Порядок и оценка

K1 → K2 → K3 → K4 → K5 → K6 → K7 → K8 → K9 → K10. Порядок строго фиксирован:

- K1 первый (декомпозиция). Без него запрещено дописывать в раздутый index.jsx.
- K2 до K3 — applyAnnotationEdit нужен везде.
- K3 до K4-K5 — все три используют onAnnotationEdit callback flow.
- K6 до K7 — runAnnotator action нужен для testing pipeline integration.
- K7 до K8 — UI рендерит results которые делает pipeline.
- K8 до K9 — entry points wire'ят openAnnotator action которая показывает UI.
- K10 закрывает loop.

Code после **каждого** K-шага запускает vitest целиком — пробежать все 947 existing tests + новые. Если existing test упал — стоп, понять regression перед продолжением.

---

## 8. STOP-условие и формат отчёта

### STOP

После commit K10 Code останавливается. **НЕ:**
- обновляет `PROJECT_STATE.md` / `RELEASES.md` / `DECISIONS.md` / `ANCHORS.md` / `BUGS.md` (это Chat в сессии приёмки);
- перемещает спеку в `docs/archive/`;
- начинает следующий спринт;
- трогает OPEN баги не из этого скоупа.

### Формат отчёта

Code дописывает в конец `CURRENT_TASK.md`:

```
## Отчёт Code по Sprint M-X.2

### Коммиты K1..K10
- K1 <hash>: декомпозиция SequenceView/index.jsx (-XX KB)
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
- (другие если изменились)

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

### Отклонения от §3 / §4 / §6
<явный список или «нет»>

### Противоречия с §0.5
<список или «нет»>
```

Если отчёта нет — Chat не финализирует приёмку, просит отчёт.

---

## 9. Риски

1. **K1 декомпозиция SequenceView не помещается в один коммит без regression.** 78.54 KB index.jsx, многие хуки внутри связаны через shared state (caretPos / caretAnchor / selectionMode / selectionStrand). Извлечение `useSelectionState` рискует ломать порядок Rules-of-Hooks (existing comment в коде про hoist — это уже было pain point). **Митигация:** K1 максимально conservative — извлекать только то, что не пересекается с existing state. Если хук-extraction даёт >5 failed tests — stop, остаться с index.jsx ≤55 KB, accept warning, продолжить K2+. **Fallback:** если K1 не доводит ≤45 KB без regression — Code останавливается и просит mini-spec на более глубокий рефакторинг (отдельный sprint M-X.2-pre).

2. **`SingleInspector.jsx` уже 20.15 KB (soft warning).** K3 wiring + K9 button — добавит ~1-2 KB. 22 ≪ 25 hard, но close. **Митигация:** Code measure после K9, если ≥22 KB — extract `useAnnotationEditWiring` хук в `inspector/hooks/`. Если ≥24 KB — stop + mini-spec.

3. **Drag-handles edge hit-detection при overlapping regions.** Stack может перекрыть нижний rect для drag-by-edge. **Митигация:** K4 implementation использует `e.currentTarget` для определения active edge (не полагается на pointerdown floating up к containerRef). Если test показывает не работает — fallback логика «drag только на верхней row», документировать в DEC-ANN-02 после acceptance.

4. **Annotator state preserved при close-reopen — но что если плазмида сменилась?** Биолог открыл Annotator на pUC19, accept-нул 5, close. Открыл другую плазмиду. Снова открывает Annotator. Ожидание — clean state. **Митигация:** в `openAnnotator(scope)` — если `state.scope.sequenceId !== scope.sequenceId` → reset results / accepted / rejected / pendingEdits. Тест на это.

5. **BLAST NCBI stub mock data может выглядеть «неживо»** для биолога во время acceptance. **Митигация:** mock generator использует реальные UniProt/RefSeq accession patterns + realistic e-values + random но в правдоподобных границах. Игорь во время acceptance говорит «выглядит ОК как stub» либо «не похоже на BLAST» → подкрутить mock generator в acceptance fix.

6. **Existing M-X.1 Settings popover в SequenceView дублирует часть Annotator функциональности.** Решение Игоря (вариант A) — оба остаются. Confusing UX risk: «зачем две UI которые делают одно». **Митигация:** Settings popover ясно label «Быстрый просмотр предсказаний», Annotator — «Полный аннотатор». Tooltip в Settings popover «Для подробной работы — открыть Аннотатор». Не спека-критично, post-v1.0 polish.

7. **Plugin registry зависит от import-side-effects.** registry.js на module load регистрирует все плагины. Если import order не гарантирован (Vite + ESM) — registry может быть пуст в test environment. **Митигация:** в test setup (vitest.setup.js) либо explicit imports в test files явно `import './lib/annotator-plugins/structural'; ...`. Документировать в registry.js.

8. **DEC-ANN-01 — annotation_edit ContainerCommit как dead-code в schema.** Forward-compat риск: если в M-D Container Window решим вернуть commits для annotations (multi-user collab) — DEC-ANN-01 нужно будет supersede обратно. **Митигация:** при финализации зафиксировать в ANCHORS.md что annotation_edit остаётся в ContainerCommit type union как reserved-for-future, но в M-X.2 codepath не вызывается. Schema migration не нужна.

---

## 10. Открытые вопросы

1. **Frozen Library entry annotations** (assumption #4 §5). Заблокировать edit (read-only state в SequenceView для Library entries) либо allow + Confirm flow создаёт копию entry в Library с edited annotations? **Default до ответа:** в M-X.2 я предполагаю любой entry в Importer editable (perFileEdits flow); если Игорь скажет «Library entries должны быть annotation-read-only» на acceptance — TD-LIBRARY-FROZEN-ANNOTATIONS, mini-spec.

2. **Re-annotate с wipe-existing.** DEC-ANN-09 говорит default = append. Биолог может реально хотеть «прогнать заново». В UI Annotator footer добавить toggle `[ ] Заменить existing` или это в M-X.2.1? **Default:** не добавлять в M-X.2 — workflow «select all → Del → Annotator» работает.

3. **Plugin parameters UI.** σ70 promoter имеет threshold (M-X.1 K5 popover). Per-plugin parameters (slider для threshold per plugin) или общий? DEC-ANN-07 говорит общий. **Default:** общий threshold в M-X.2. Per-plugin — post-v1.0 polish.

4. **Stack-навигация Annotator при unsaved changes.** Биолог accept'нул 5, не нажал `[Сохранить]`, нажал `← Назад`. Confirmation dialog или silent loose? Согласно ARCHITECTURE_v2 §1.9 «Mix Workspace draft = unsaved tab, не закрывается при уходе» — preserve unsaved state. **Default:** silent close — state preserved (DEC-ANN-07). При смене плазмиды → reset (риск 4). Confirmation dialog не нужен.

---

_Spec status: ⏳ Pending compact + Code execution. После K10 commit — визуальная приёмка Игорем (отдельная сессия, fresh context)._

_После реализации: перенос в `docs/archive/` с пометкой `**Статус:** ✅ РЕАЛИЗОВАНО [дата]` (при финализации release block v0.7.2 / v0.8.0 — зависит от того, идёт ли M-X.2 на minor bump). DEC-ANN-01 переносится в ANCHORS.md как ⚓ при финализации._
