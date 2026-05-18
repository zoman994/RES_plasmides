# SPRINT M-CANVAS-WINDOW — Window System Foundation (F1)

**Дата спеки:** 15.05.2026 (вечер, после walkthrough-сессии).
**Тип:** A.
**Target размер спеки:** ~25 KB.
**Источник:** `docs/NOTES_CANVAS_V2_KICKOFF.md` §9.5 F1 + §9.9.1 пересмотр window system.
**Цепочка:** F1 (этот sprint) → F2 Junction Contract → F3 PCR Operation Mode → F4 Live Product Preview. Acceptance gate в отдельной chat-сессии между стадиями (§9.6 NOTES).
**Статус:** утверждён 15.05.2026 — Игорь принял дефолты по Q1-Q4 (см. §9). Готов к handoff Code после compact.

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Сейчас | Статус | Действие |
|---|---|---|---|
| `editor/ContainerEditorSkeleton.jsx` | 33.95 KB | Watch (soft 30 / hard 40) | header trim → ожидаем **-3..-5 KB**, итог ~29-31 KB |
| `store/skeleton-state.js` | 15.04 KB | OK | +1.5-2 KB (router cases) |
| `store/skeleton-state-editor.js` | 6.61 KB | OK | +2.5-3 KB (multi-tab fields + cases) |
| `store/skeleton-context.jsx` | 10.58 KB | OK | +0.5-0.8 KB (actions + helpers) |
| `store/skeleton-history.js` | 3.04 KB | OK | минор (NAV_ACTIONS whitelist) |
| `CanvasSkeleton/index.jsx` | 9.48 KB | OK | минор (EditorOverlay → shell) |
| `canvas/CanvasLayoutView.jsx` | 34.36 KB | Watch | **не трогаем** |
| `canvas/CanvasGraphView.jsx` | 14.10 KB | OK | **не трогаем** |

**Новые файлы** (все под soft limit):
- `editor/EditorWindowShell.jsx` ~7-9 KB
- `editor/EditorTabStrip.jsx` ~3-4 KB
- `canvas/MiniProjectCanvas.jsx` ~5-7 KB
- `editor/useTabHotkey.js` ~1 KB

**Декомпозиция ContainerEditorSkeleton.jsx — в этом sprint'е НЕ нужна.** Чистое изменение по этому файлу отрицательное (header trim). Если по факту реализации вырастет — повторно оценить в acceptance.

Блокер D из CURRENT_TASK (skeleton-state-canvas.js 26.87 KB) **устарел**: после R12 split — 21.51 KB, Watch zone, не блокер. Spec 1 этот файл не трогает.

---

## 1. Контекст и связи перед действием (§17 R4)

### Откуда

§9.9.1 NOTES переломил исходное «узкая левая колонка 250-300 px» (решение #2 первой записи §9) → **full-screen viewer + mini-canvas в углу**. Аргумент — на ноутбуке 1366×768 левая колонка теснит SequenceView, mini-canvas сохраняет ментальную привязку к canvas при минимуме потерянного места.

Spec 1 — инфраструктура: множественные открытые контейнеры в одном overlay'е, hotkey TAB, мини-карта проекта в углу, breadcrumb-tabs, frozen UI. Без operation-логики, без junction-контракта, без live product — это Spec 2/3/4.

### Где задача сядет (existing → new)

- `CanvasSkeleton/index.jsx::EditorOverlay` — сейчас thin wrapper `if (state.editorOpen) return <ContainerEditorSkeleton />`. Заменяется на `<EditorWindowShell />`.
- `editor/ContainerEditorSkeleton.jsx` — каждый tab → mount с `key={activeTabId}`. Один minor edit: header trim (back-button + apply/discard/fork кнопки + frozen banner переезжают в shell / strip, чтобы не было двух конкурирующих UI элементов одного назначения).
- `store/skeleton-state-editor.js::editorContext` — расширяется на массив tabs + activeTabId. Существующее поле `viewOnlyContainerId` остаётся как derived для backward-compat.
- `store/skeleton-context.jsx::useEditorTabContext()` — API не меняется, возвращает прежний shape `{tabContainerId, draftId, viewOnly}` с containerId derived от active tab. ContainerEditorSkeleton и все его hooks компилируются без правок.
- `skeleton-persistence.js::debouncedSaver` — уже работает на любую state mutation; tabs persist в IndexedDB автоматически, restore при rehydrate без дополнительного кода.
- `canvas/CanvasLayoutView.jsx` + `canvas/CanvasGraphView.jsx` — read-only consumer mini-canvas через свой hook, сами файлы не трогаем.
- `lib/strings.js::STRINGS.canvasSkeleton.editorWindow` — новая sub-секция для breadcrumb / close / TAB hint.

### Что НЕ задеваем

- `Library/inspector/tabs/*` — без изменений (sub-tabs SequenceTab / AnnotationsTab / TabBar / FeatureEditorModal).
- Annotator slice / scope — без изменений, `skeleton::${containerId}` остаётся уникальным per-tab.
- `pendingEditsByContainer` буфер — без изменений (per-container, multi-tab совместим).
- Algorithm core — без изменений.
- Undo/Redo logic — расширяется только NAV_ACTIONS whitelist (tab open/close не пишутся в past stack).

### Дубли check (§17 R1)

- `EditorOverlay` уже есть — расширение естественно, не плодим сущность.
- `MiniProjectCanvas` — отдельный, потому что CanvasLayoutView заточен под full-interactivity (drag/drop/junction layer). Conditional `interactive={false}` раздул бы Watch zone в hard.
- `EditorTabStrip` — atomic UI, отделение от shell для тестируемости.

### Запрещённые слова §17 R3 — обоснования

- «**Новый компонент** EditorWindowShell»: EditorOverlay сейчас 5-строчный wrapper без multi-tab structure; расширение через правку index.jsx на месте дало бы ~8 KB логики там, где должна быть только композиция.
- «**Новый компонент** MiniProjectCanvas»: см. выше про CanvasLayoutView.
- «**Новый компонент** EditorTabStrip»: tab strip — самостоятельная UI единица с close, hover, overflow-scroll; отдельный файл легче тестировать.

---

## 2. Стратегия

`EditorOverlay` эволюционирует из «один контейнер = одно overlay» в **multi-tab shell с mini-canvas в углу**. `ContainerEditorSkeleton` остаётся per-tab view, mount'ится для активного tab'а. State multi-tab кладётся в `editorContext.tabs[]` + `activeTabId`; legacy `viewOnlyContainerId` — derived (backward-compat).

Persistence через existing `skeleton-persistence`, нулевая стоимость. TAB hotkey — minimal hook, mount-once в shell. Mini-canvas — read-only SVG miniature, читает skeleton-state своим hook'ом, рисует containers как маленькие маркеры с подсветкой активного tab'а, клик по маркеру → switch / open tab.

Breadcrumb для Spec 1 — простой: `📦 <container.name>` + 🔒 если frozen. Operation-context (`🔬 PCR · pET28a → amplicon_42`) — расширение в Spec 3.

---

## 3. Scope IN / OUT

### IN

- Multi-tab orchestration в editor overlay.
- Tab strip: label `📦 <name>` (+🔒 frozen) + close ×.
- TAB / Shift+TAB hotkey для переключения tabs.
- Mini-canvas в правом-верхнем углу (fixed для baseline — см. Q1).
- Подсветка в mini-canvas активного container'а + операций placeholder'ами.
- Click по container в mini-canvas → switch existing tab или открыть новый (см. Q3).
- Breadcrumb format: `📦 <name>` + 🔒 frozen.
- Last-tab-close UX (см. Q2).
- Backward-compat actions `OPEN_EDITOR_VIEW_ONLY` / `CLOSE_EDITOR`.
- Persistence через existing debouncedSaver.
- Tests: open/close/switch/persist/frozen/multi-instance-no-op + регрессии.

### OUT

- Operation-aware breadcrumb — Spec 3.
- Junction popovers / contract — Spec 2.
- Live product preview — Spec 4.
- Decomposition ContainerEditorSkeleton.jsx.
- Cursor / selection persistence across tab-switches → TECH_DEBT `TD-EDITOR-CURSOR-PERSIST-ACROSS-TABS` (R4).
- Mini-canvas resize / move / alt dock — fixed top-right.
- Multi-instance same container — focus existing (см. DEC-WIN-03).
- Drag-reorder tabs.
- Tab overflow collapse menu — horizontal scroll достаточно для >10 tabs.
- Mini-canvas zoom / pan / drag.

---

## 4. Архитектурные решения

### DEC-CANVAS-WIN-01 — tabs[] + activeTabId

`editorContext` расширяется: `{viewOnlyContainerId, tabs: [{id, containerId, openedAt}], activeTabId}`. `viewOnlyContainerId` — derived getter (backward-compat). Любой read через `useEditorTabContext()` возвращает active tab's containerId.

### DEC-CANVAS-WIN-02 — Tab id уникален per-open

`tab.id = 'tab-' + uuidv7()`. Не привязан к containerId (заготовка под multi-instance, если когда-то понадобится). React `key={tab.id}` стабилен, focus existing не размонтирует ContainerEditorSkeleton.

### DEC-CANVAS-WIN-03 — Focus existing tab при повторном open

`OPEN_EDITOR_TAB(containerId)`: existing tab same-container → выставить его activeTabId. Иначе → новый tab + active. Default no-multi-instance (один контейнер = одно состояние).

### DEC-CANVAS-WIN-04 — Tab open/close НЕ в undo stack

Whitelist NAV_ACTIONS в `skeleton-history.js`: `OPEN_EDITOR_TAB`, `CLOSE_EDITOR_TAB`, `SWITCH_EDITOR_TAB`, `SWITCH_NEXT_TAB`, `SWITCH_PREV_TAB`. Эти actions проходят через reducer без push в past. Прецедент — `REPLACE_STATE` / `RESET` уже исключены.

### DEC-CANVAS-WIN-05 — Mini-canvas read-only, click-to-switch

Mini-canvas рисует `state.containers` + `state.operations`. Подсветка активного container'а через рамку или color fill. Click → switch existing tab или openEditorTab. `pointer-events: none` на всём кроме маркеров.

### DEC-CANVAS-WIN-06 — Mini-canvas позиция fixed top-right

`position: absolute; top: 60px; right: 16px;` (под tab strip'ом). Размер 200×150. Не resizable / не draggable в Spec 1. Параметризация в первой итерации — overkill (см. Q1).

### DEC-CANVAS-WIN-07 — TAB hotkey gated

Слушает `window.keydown`. Триггерится **только** когда editor open, фокус НЕ на `<input>`/`<textarea>`/`[contentEditable]`/`<select>`, и нет открытого modal'а. Прецедент — `DeleteKeyHandler` использует тот же паттерн.

### DEC-CANVAS-WIN-08 — Last-tab-close → close editor

Close × на последний tab → editor закрывается, возврат в canvas. Без confirm dialog'а — pending edits per-container в state, не теряются (см. Q2 если нужен alternative).

### DEC-CANVAS-WIN-09 — Frozen visualization в двух местах

Frozen state показывается дважды, **не дублируется, видимость в разных контекстах:**

- **Tab strip** (`EditorTabStrip`) — 🔒 badge рядом с label таба. Видимо всегда для любого таба (включая неактивные) — биолог видит в списке окон «это контейнер frozen».
- **Editor body** (внутри `ContainerEditorSkeleton`) — большой красный banner + Save As fork кнопка (existing, DEC-OPS-08). Видим только в active tab — биолог работает в контейнере и видит «заморожен, fork через эту кнопку».

Frozen banner внутри editor body **остаётся нетронутым** в F1 — только добавляется badge в strip.

---

## 5. Файлы и сигнатуры

### Новые файлы

**`editor/EditorWindowShell.jsx`** (~7-9 KB)

Layout:
```
EditorWindowShell (absolute inset:0, z:50)
├── EditorTabStrip (top 36 px)
├── ContainerEditorSkeleton (key={activeTabId}, fills remaining)
└── MiniProjectCanvas (absolute top:60 right:16, 200x150)
```

- Читает tabs + activeTabId через `useSkeletonState`.
- Mount'ит один `<ContainerEditorSkeleton />` для активного tab'а — другие tabs unmount'ены, их state persists в `pendingEditsByContainer`.
- Wire `useTabHotkey(actions.switchNextTab, actions.switchPrevTab)`.
- Return `null` если `tabs.length === 0` (transient state guard).

**`editor/EditorTabStrip.jsx`** (~3-4 KB)

`EditorTabStrip({ tabs, activeTabId, onSwitch, onClose })`.

- Horizontal flex, overflow-x: auto.
- Каждый tab — `<button data-testid="editor-tab" data-active={...}>` с label `📦 <name>` + 🔒 если frozen + close × на hover.
- Container resolve через `useContainerById(tab.containerId)`.
- Click body → onSwitch(tab.id); click × → onClose(tab.id). Активный tab — фоновая подсветка.

**`canvas/MiniProjectCanvas.jsx`** (~5-7 KB)

`MiniProjectCanvas()`.

- Hook `useCanvasMiniatureSource()` (внутренний или в `canvas/canvas-layout.js`) читает containers + operations + view; маппит координаты в viewBox 200×150 с padding.
- Container — `<rect>` 8×8 px (active — stroke 2 px var(--accent-500); placeholder — dashed; обычный — fade 0.6).
- Operation — `<rect rotate(45)>` 6×6 px по `op.position`.
- Click handler на rect: switch existing tab same-container ИЛИ openEditorTab.
- `pointer-events: none` на остальных элементах (контур, фон).
- Empty state (`containers.length === 0`) — hidden or label «нет контейнеров».
- View=`graph` — использовать тот же layout helper что CanvasGraphView (если в `canvas-layout.js` есть `computeGraphLayout()`) либо простую координатную сетку.

**`editor/useTabHotkey.js`** (~1 KB)

`useTabHotkey({ onNext, onPrev })`.

- `useEffect` mount'ит `window.keydown`. TAB → onNext, Shift+TAB → onPrev.
- Guards: editable target detection, modal detection (`document.querySelector('[data-modal-open]')` best-effort).
- Cleanup при unmount.

### Существующие файлы — изменения

**`store/skeleton-state-editor.js`** (+2.5-3 KB)

State shape change (DEC-WIN-01).

> **Updated 2026-05-16 (D1):** `tab.kind` расширен — `'container' | 'operation'`
> → `+ 'assembly'` (A2 `SPRINT_M-CANVAS-ASSEMBLY-CONSTRUCT.md`
> DEC-CANVAS-ASM-12: `tab.assemblyDraftId`, `OPEN_EDITOR_ASSEMBLY_TAB`,
> `REMOVE_ASSEMBLY_DRAFT` закрывает вкладку). Tab shape backward-compat
> сохранён; nav-action в history SKIPPED как `OPEN_EDITOR_OP_TAB`.

Новые reducer cases:
- `OPEN_EDITOR_TAB { containerId }` — focus existing same-container или create new tab + activate. `editorOpen = true`.
- `CLOSE_EDITOR_TAB { tabId }` — remove tab. Если был активным — switch на neighbour (prev preferred → next). Если `tabs.length` после стал 0 → `editorOpen = false`, activeTabId = null.
- `SWITCH_EDITOR_TAB { tabId }` — `activeTabId = tabId`. Guard: ignore если tab не существует.
- `SWITCH_NEXT_TAB` / `SWITCH_PREV_TAB` — cyclic переключение.

Backward-compat:
- `OPEN_EDITOR_VIEW_ONLY` → делегирует в OPEN_EDITOR_TAB.
- `CLOSE_EDITOR` → close-all-tabs.
- `viewOnlyContainerId` derived: `tabs.find(t => t.id === activeTabId)?.containerId ?? null`.

`REMOVE_CONTAINER` расширяется: если удаляемый container открыт в tab → этот tab автоматически закрывается (как при CLOSE_EDITOR_TAB; pattern same as existing «editor close если open на removed»).

**`store/skeleton-state.js`** (+1.5-2 KB)

Router расширяется на новые action types для editor sub-reducer.

**`store/skeleton-context.jsx`** (+0.5-0.8 KB)

Новые actions: `openEditorTab(containerId)`, `closeEditorTab(tabId)`, `switchEditorTab(tabId)`, `switchNextTab()`, `switchPrevTab()`.

`useEditorTabContext()` API не меняется. `openEditorViewOnly(containerId)` остаётся как alias для backward-compat. `closeEditor()` — close-all-tabs.

**`store/skeleton-history.js`** (минор)

`NAV_ACTIONS` set добавляется в whitelist.

**`CanvasSkeleton/index.jsx`** (минор)

```
function EditorOverlay() {
  const state = useSkeletonState();
  if (!state.editorOpen) return null;
  return <EditorWindowShell />;
}
```

**`editor/ContainerEditorSkeleton.jsx`** (header trim, -3..-5 KB)

`<header data-testid="skeleton-editor-header">` (back + InlineEditableTitle + Apply/Discard/SaveAsFork) — переезжает в `EditorWindowShell` / `EditorTabStrip`. Реализатор выбирает точное распределение (заголовок shell'а vs strip).

**Frozen banner остаётся внутри ContainerEditorSkeleton** (DEC-WIN-09) — не переезжает. Сохраняется большой красный banner + Save As fork кнопка.

Внутри ContainerEditorSkeleton остаётся: subtitle (размер/topology/regions), TabBar внутренних tabs, LinearFeatureBar, SequenceTab/AnnotationsTab/Mutagenesis, FeatureEditorModal, RestrictionSitePopover, useStore wire (Annotator + showReSites + sequence settings), onCutAtCursor, frozen banner + Save As fork кнопка.

**`lib/strings.js::STRINGS.canvasSkeleton.editorWindow`** (~0.3-0.5 KB)

Keys: `tabClose`, `tabFrozenBadge`, `tabHotkeyHintNext`, `tabHotkeyHintPrev`, `miniCanvasTitle`, `noContainersHint`, `placeholderTabLabel`.

### Тесты

Один новый файл: `__tests__/canvas-skeleton/editor-window-shell.test.jsx` (~10-15 KB).

Покрытие:
1. Open / close lifecycle (single → multiple → close last → editor closed).
2. TAB / Shift+TAB hotkey + guards (input → no switch).
3. Same-container open → tabs.length === 1, pending edits preserved.
4. Backward-compat (openEditorViewOnly → tabs.length === 1, viewOnlyContainerId derived корректно).
5. REMOVE_CONTAINER → tab auto-close.
6. Frozen badge в tab strip.
7. Persistence smoke (rehydrate → tabs restored).
8. Last-tab-close → editor closed (DEC-WIN-08).
9. Mini-canvas: active highlight + click marker → switch/openTab.

Плюс ~5-8 регрессионных проверок existing skeleton tests (open editor, close editor, pending edits commit/discard).

---

## 6. Порядок выполнения

### K1 — State shape extension

- Расширить editorContext (DEC-WIN-01).
- Reducer cases OPEN/CLOSE/SWITCH tab.
- Backward-compat OPEN_EDITOR_VIEW_ONLY / CLOSE_EDITOR через делегирование.
- REMOVE_CONTAINER → auto-close tab.
- NAV_ACTIONS whitelist в skeleton-history.
- Expose actions в skeleton-context.

### K2 — EditorTabStrip

- Новый компонент.
- Render labels + frozen badge + close ×.
- Click handlers (switch / close).

### K3 — EditorWindowShell + ContainerEditorSkeleton header trim

- Новый shell mount'ит TabStrip + ContainerEditorSkeleton.
- Trim header в ContainerEditorSkeleton.
- index.jsx::EditorOverlay → `<EditorWindowShell />`.
- Manual regression: open → rename → apply → frozen → Save As fork → close.

### K4 — MiniProjectCanvas

- Новый компонент SVG miniature.
- Read-only маркеры containers + operations.
- Active highlight через activeTabId.
- Click → switch / openEditorTab.

### K5 — useTabHotkey + wire

- Hook listener TAB / Shift+TAB.
- Gates: editor open, не editable target, не modal.
- Mount в EditorWindowShell.

### K6 — Persistence smoke + cleanup

- Verify через debouncedSaver: open 2 tabs → wait 500ms → rehydrate → tabs восстановлены. Если editorContext не покрыт saver scope — расширить.
- Lint / build clean.
- Финальный отчёт.

**STOP после K6.** Code НЕ финализирует PROJECT_STATE / DECISIONS / BUGS / RELEASES / ANCHORS / TECH_DEBT / CLAUDE.md / package.json / version.js. Visual acceptance — отдельная chat-сессия с compact.

---

## 7. STOP-условие и формат отчёта

Code останавливается после K6, возвращает в chat:

1. **Size budget table** (before / after, дельты): ContainerEditorSkeleton.jsx (ожидаем -3..-5 KB), skeleton-state-editor.js (+~3 KB), skeleton-state.js (+~2 KB), skeleton-context.jsx (+~0.5-0.8 KB), skeleton-history.js (минор), index.jsx (минор), 4 новых файла.
2. **Tests:** count pass / fail / skip. Build clean.
3. **DECISIONS sprint-block draft** (9 DEC-CANVAS-WIN-NN — Chat промотит в DECISIONS.md после acceptance).
4. **Manual smoke** одна фраза: «открыл/переключил/закрыл вручную, frozen banner / Save As fork работают, mini-canvas highlight active».
5. **Отклонения от спеки** явным блоком, если есть. Запрещённые слова §17 R3 — обоснование в отчёте.

---

## 8. Риски

### R1 — ContainerEditorSkeleton header trim ломает Inline Title / Apply кнопки

Trim делается в K3 поверх готового shell'а. Manual regression open → rename → apply / discard / fork перед K4.

### R2 — TAB hotkey конфликтует с keyboard navigation в SequenceTab / форм

Gate по `isEditableTarget` + modal detection (DEC-WIN-07). Прецедент DeleteKeyHandler. Acceptance test: type in input → TAB переходит к следующему полю, не переключает tabs.

### R3 — Mini-canvas падает при `state.containers.length === 0`

Explicit branch — пустой viewBox / hidden / label «нет контейнеров». Test case empty state.

### R4 — Cursor / selection теряется при switch tab (unmount-mount ContainerEditorSkeleton)

Принимаем для Spec 1. Cursor — local useState; switch → unmount → reset. Биолог снова кликает позицию.

→ TECH_DEBT `TD-EDITOR-CURSOR-PERSIST-ACROSS-TABS` — поднять cursor в `state.cursorByTab` (next sprint).

### R5 — Persistence через debouncedSaver не покрывает editorContext

Smoke в K6 — open 2 tabs → wait 500ms → unmount → re-mount → tabs восстановлены. Если debouncedSaver scope не включает editorContext — расширить там же.

---

## 9. Открытые вопросы — закрыты дефолтами 15.05.2026

### Q1 — ✅ Дефолт принят

Mini-canvas: позиция `top: 60px; right: 16px`, размер 200×150, click-to-switch без drag/resize. Закодировано в DEC-CANVAS-WIN-06.

### Q2 — ✅ Дефолт принят

Close × на последний tab → editor закрывается, возврат в canvas, без confirm dialog'а. Закодировано в DEC-CANVAS-WIN-08.

### Q3 — ✅ Дефолт принят

Click по контейнеру в mini-canvas: existing tab → switch; не открытый → openEditorTab. Закодировано в DEC-CANVAS-WIN-05.

### Q4 — ✅ Дефолт принят

Placeholder открывается в editor с tab label `📦 (пустой)`. Закодировано в §3 Scope IN.

---

## Acceptance gate

После Code commit'а + STOP — compact + новая chat-сессия. Acceptance по `docs/ACCEPTANCE_ALGORITHM.md`:

- Open container → tab, active.
- Open second → strip showing both.
- TAB / Shift+TAB switching.
- Click в mini-canvas → switch / open.
- Close × → tab gone; last → editor closed.
- Frozen banner + 🔒 badge.
- Pending edits per-tab preserved при switching.
- Reload → tabs restored.

Если приёмка FAIL — поправки в этом файле, новый Code-проход. §14 playbook: не геройствовать после 2 FAIL'ов, потребовать скриншот / референс / прямую правку.

---

_Дата:_ 15.05.2026.
_Реализация Code:_ ready for handoff после compact (Q1-Q4 закрыты дефолтами 15.05).
_Acceptance:_ отдельная chat-сессия после Code STOP.
