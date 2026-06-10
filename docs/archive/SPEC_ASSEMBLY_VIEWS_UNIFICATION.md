# SPEC_ASSEMBLY_VIEWS_UNIFICATION.md — три представления сборки: matrix actions, gaps, унификация

> **Тип задачи:** B (UX unification + audit). Размер спеки ~18 KB.
> **Sprint:** **M-ASSEMBLY-VIEWS-UNIFY** (Code ~3-5 дней). Низкий-средний риск (точечные правки в existing components).
> **Приоритет:** средний — выполняется **после** M-ASSEMBLY-EDITOR-CLEANUP. Cleanup убирает дубли (layout), эта спека выравнивает **affordances** между тремя viewModes.
> **Связанные spec'и:** SPEC_ASSEMBLY_EDITOR_CLEANUP (cleanup), SPEC_ASSEMBLY_WORKFLOW_UX (workflow base).

---

## 0. Scope & non-goals

### IN scope
- Аудит трёх представлений zone: Frame view (canvas) + Sequence view (canvas) + Editor (full-screen).
- Matrix actions × views — что доступно где, где gaps.
- Унификация entry-points pieces (4 types: plasmid / snippet / synthesis / gap) across all 3 views.
- Унификация actions (group / primer / mutation / junction / realise / delete) across all 3 views.
- Visual consistency: icons / colors / labels для одних и тех же элементов одинаковые во всех views.
- Единое context menu (right-click) с одинаковыми actions per element type.
- Onboarding hints консистентны (один tone, одинаковая структура).

### OUT scope
- Создание **нового** view — работаем только с тремя существующими.
- Performance optimization (render scaling) — отдельная задача.
- Mobile / touch input — не сейчас.
- Cross-zone connections в визуализации — T-future.

---

## 1. Контекст: что уже реализовано

### 1.1 Frame view (Canvas, `ZoneFrame.jsx`)

Zone-as-Miro-frame с 3 lanes автоматически разложенными dagre layout (T4.5):
- **ИСТОЧНИКИ** (top lane) — sourced pieces (containers).
- **ПРОМЕЖУТОЧНОЕ** (middle lane) — intermediate pieces (outputs ops в pipeline mid-layers).
- **ФИНАЛЫ** (bottom lane) — final outputs zone (containers `derivedFromOpId !== null && isLastLayer`).

Visual: rectangles с lanes-divider. Containers внутри — `ContainerBlock.jsx`. Ops — `OperationNode.jsx`. Primers — `OligonucleotideBlock.jsx`. Connections — wires.

Header zone: title `Сборка 1`, counter `N узлов`, кнопки `G` (toggle viewMode) + `🪄 Открыть сборку` (open editor).

**Доступные actions** (что я видел в коде):
- Drag из library в lane ИСТОЧНИКИ → adds container.
- Hover op-rhombus → `HoverOpIconRow` показывает быстрые actions.
- Right-click zone → `ZoneContextMenu` (rename / delete / etc).
- `G` button → переключить на Sequence view.
- `🪄 Открыть сборку` → open Editor.

### 1.2 Sequence view (Canvas, `zone-sequence-mode/`)

Inline content **внутри zone-frame** когда `zone.viewMode === 'sequence'`. Не открывает editor, показывает прямо на canvas.

Три sub-states (через `selectZoneSequenceState`):
- **empty** (`ZoneEmptyView`) — нет pieces.
- **palette** (`ZonePaletteView`) — есть pieces, но нет финала. Куски разложены палитрой (likely strip-like).
- **assembled** (`ZoneAssembledView`) — есть final product. Sequence view с раскрашенными regions.

Toggle через `G` button в Frame header. Возврат к Frame view — повторный `G` или другой control.

**Доступные actions** (предположение из layout):
- Palette: возможно click piece → детали; некий picker для добавления нового.
- Assembled: viewer sequence read-only? Или есть selection actions?

### 1.3 Editor view (Full-screen, `assembly-mode/AssemblyShellBody.jsx`)

Открывается через `🪄 Открыть сборку` в Frame view header. Покрывает весь canvas area, MiniProjectCanvas остаётся как mental anchor.

Включает:
- AssemblyHeader (title, метрика, linear toggle, Палитра, Realise).
- SequenceTab (центр — viewer с coloredZones).
- AssemblySidebar (Источники, right column 248px).
- AssemblyPrimersPanel (под sidebar).
- AssemblyPipelinePanel (Схема сборки, rightmost 280px).
- SegmentList (bottom table).
- AssemblyToolbar (bottom: 4 add buttons + Сшить + Undo/Redo).

**Доступные actions** — самые полные:
- 4 entry-points pieces (toolbar buttons).
- Click strip area → popover (после M-ASSEMBLY-EDITOR-CLEANUP).
- Selection + Сшить → grouping.
- Praimers panel actions (auto/manual flag).
- Mutation context menu в SequenceView.
- Realise via header button.

---

## 2. Matrix actions × views (выявленные gaps)

| Action / Capability | Frame view | Sequence view | Editor |
|---|---|---|---|
| **Add sourced piece (plasmid)** | ✓ drag из library | ? unclear | ✓ + Плазмида / click popover |
| **Add snippet (tag/linker)** | ✗ нет UI | ? unclear | ✓ + Обвес / click popover |
| **Add synthesis (long ПСО)** | ✗ нет UI | ? unclear | ✓ + Синтез |
| **Add gap (placeholder)** | ✗ нет UI | ? unclear | ✓ + Gap |
| **Add mutation на piece** | ✗ нет UI | ? unclear | ✓ context menu в SequenceView |
| **Group pieces (Сшить)** | ✗ нет UI | ? unclear | ✓ select + Сшить |
| **Ungroup / change op kind** | ? unclear | ? unclear | ✓ via OpGroupPicker |
| **Edit junction params** | ✓ JunctionPopover | ? unclear | ✓ Junction modal |
| **Edit primer manual** | ? OligonucleotideBlock click? | ? unclear | ✓ Primers panel |
| **Reorder pieces** | ✗ drag в lane изменяет order? | ? unclear | ✓ Drag в strip |
| **View sequence (text)** | ✗ нет text | ✓ assembled state | ✓ SequenceTab |
| **Realise pipeline** | ✓ hover op-icon? | ✗? | ✓ header Realise |
| **Delete piece / op** | ✓ context menu | ? unclear | ✓ context menu |
| **Rename zone / piece** | ✓ context menu | ? unclear | ✓ InlineEditableTitle |

**Видимые gaps** (нужны twins-confirmation через code review):
- **Frame view не имеет** add snippet/synthesis/gap/mutation. Биолог должен открыть editor чтобы добавить tag. Это раздражающее ограничение (хочешь quick His6 — приходится open Sequence editor).
- **Sequence view actions** — большинство unclear из code review (компоненты не прочитаны детально). Скорее всего тоже limited.
- **Group / ungroup** — только в Editor. Frame view не позволяет создать group через UI.

---

## 3. Принципы унификации

### 3.1 Action availability rule

**Правило большого пальца:** Frame view = **structural editing** (что есть, как связано). Sequence view = **content editing** (последовательности, ranges, mutations). Editor = **полный набор** (все actions всех views + детализация).

То есть:
- **Frame view actions:** create zone / drag container / hover-op-icons / group via context menu / delete / rename / view summary.
- **Sequence view actions:** add piece via click popover / reorder pieces / view sequence / view colored regions / edit primer inline.
- **Editor actions:** все вышеуказанные + детальная primer/mutation/junction editing + multi-step pipeline view.

### 3.2 Visual consistency rule

Один и тот же элемент (piece, op, container, primer) должен иметь:
- **Одинаковую иконку / цвет** во всех 3 views.
- **Одинаковый label** (имя piece из state, не отдельные fallback'и per view).
- **Одинаковое context menu** на right-click (тот же набор actions).

Сейчас: piece в Frame view = `ContainerBlock` (color = palette assigned). Piece в Editor strip = colored bar (same palette). Piece в Sequence view = ??? (unclear).

**Унификация:** иконки + цвета + labels — single source of truth (palette assignment). Components rendering — different (block / colored-bar / etc), но **visual attributes** одинаковые.

### 3.3 Onboarding consistency rule

Hints / empty-state messages в трёх views одинаковые по структуре:

- **Заголовок** + emoji.
- **Что делать дальше** — bullet list 3-5 actions.
- **Подсказка про hotkey** если применимо.

Структура одна — текст адаптируется к контексту view.

---

## 4. Что добавить / убрать / переименовать

### 4.1 Frame view (`ZoneFrame.jsx` и связанные)

**Добавить:**
1. **Add piece menu** на double-click в empty area внутри zone (или на `+` button в zone header) → popover с 4 options (Плазмида / Обвес / Синтез / Gap). Same popover как в Editor strip click.
2. **Group context menu** — right-click на selected pieces (через cmd-click multi-select) → «Сшить эти →» с op kind submenu.
3. **Mutation context menu** на ContainerBlock right-click → «Добавить mutation» → modal с position + nucleotide.

**Убрать:**
- Дубль hover-op-icons если они дублируют context menu actions (нужен code review `HoverOpIconRow`).

### 4.2 Sequence view (`zone-sequence-mode/`)

**Добавить (если отсутствует):**
1. **Click popover для add piece** — то же что в Frame view + Editor.
2. **Selection + context menu group** — выделил pieces, right-click → Сшить.
3. **Primer inline editing** — click на primer glyph → mini modal с binding/tail/Tm.
4. **Mutation marker click** — open mutation modal (как в Editor).

**Унифицировать:**
- Colors regions = same palette как ContainerBlock в Frame + colored bars в Editor strip.
- Labels = piece.name (не отдельные truncation policies).

### 4.3 Editor view (`assembly-mode/`)

**Уже самый полный.** После M-ASSEMBLY-EDITOR-CLEANUP — toolbar simplified до Сшить + Undo/Redo, entry-points через click-popover.

**Добавить (для consistency):**
- **`G` toggle button в AssemblyHeader** или editor-tab — позволяет переключиться на Sequence view zone (zone.viewMode='sequence') **без открытия editor'а**. Это даёт биологу 3 levels of zoom: Frame (overview) → Sequence (medium) → Editor (full).

**Убрать:**
- Уже purged в M-ASSEMBLY-EDITOR-CLEANUP.

### 4.4 Cross-view: единое context menu

Right-click на любом piece (block в Frame / colored-bar в Sequence / piece-card в Editor) показывает **одинаковое menu**:

```
┌────────────────────────────────────────┐
│ ✏️ Переименовать                        │
│ 🔄 Обратное дополнение (RC)             │
│ 📝 Изменить диапазон ...                │
│ 💎 Добавить mutation ...                │
│ ──                                      │
│ 🔗 Сшить с... (если есть selection)     │
│ ──                                      │
│ 🗑 Удалить                              │
└────────────────────────────────────────┘
```

Right-click на op (rhombus в Frame / boundary в Sequence / junction в Editor):

```
┌────────────────────────────────────────┐
│ ⚙️ Параметры стыка...                   │
│ 🔄 Изменить тип op (Gibson/GG/...)      │
│ ──                                      │
│ 🗑 Удалить группу                       │
└────────────────────────────────────────┘
```

### 4.5 Cross-view: единое empty-state hint

Каждый view на empty показывает:
- Frame view (zone created, нет pieces): «Зона пуста. Перетащите плазмиду из библиотеки или нажмите `+` в заголовке зоны.»
- Sequence view empty (zone created, нет pieces): same text.
- Editor (segments.length === 0): EmptyAssemblyHint (как в SPEC_ASSEMBLY_EDITOR_CLEANUP §5.7).

Один tone, упоминают same 4 entry-points.

---

## 5. Конкретные правки file by file

### 5.1 `ZoneFrame.jsx`

- Добавить `+` button в zone header → click → AddPiecePopover.
- Wire context menu actions: extend `ZoneContextMenu.jsx` с group/mutation/junction actions.

### 5.2 `HoverOpIconRow.jsx`

- Audit: какие icons доступны? Какие дублируют context menu? Удалить дубли, оставить unique fast-path actions (например quick PCR).

### 5.3 `zone-sequence-mode/ZonePaletteView.jsx`

- Добавить click-to-add popover при click на empty area.
- Selection model (cmd-click) + context menu group action.

### 5.4 `zone-sequence-mode/ZoneAssembledView.jsx`

- Primer inline click → mini modal.
- Mutation marker → modal (reuse existing MutationModal).
- Read-only viewer? Если да — добавить edit affordances (либо линковать к Editor через double-click).

### 5.5 Новый компонент `AddPiecePopover.jsx`

Shared component для всех трёх views. Renders popover с 4 options:

```jsx
function AddPiecePopover({ anchorPos, zoneId, onClose }) {
  return (
    <Popover at={anchorPos} onClose={onClose}>
      <PopoverItem icon="🧬" label="Из плазмиды" hotkey="P" onClick={() => openPlasmidPicker(zoneId)} />
      <PopoverItem icon="✦" label="Обвес" hotkey="S" onClick={() => openSnippetCatalog(zoneId)} />
      <PopoverItem icon="🧪" label="Синтез" hotkey="." onClick={() => openSynthesisModal(zoneId)} />
      <PopoverItem icon="◊" label="Заглушка" hotkey="G" onClick={() => openGapModal(zoneId)} />
    </Popover>
  );
}
```

Reused в:
- ZoneFrame `+` button.
- ZoneSequenceMode empty/palette views click.
- Editor strip click.

Single source of truth → consistency guaranteed.

### 5.6 Shared context menus

Extract `PieceContextMenu.jsx` + `OpContextMenu.jsx` — used by ZoneFrame, zone-sequence-mode, AssemblyShellBody.

---

## 6. K-точки для Code

**K1 — Matrix audit.** Code reviewер открывает каждый из 3 views в running app, проверяет каждую action из §2 matrix, заполняет actual state. Output: updated matrix как часть отчёта. **Не правит код**, только audit. +0 tests.

**K2 — AddPiecePopover shared component.** Создать `canvas/AddPiecePopover.jsx` ~80 LOC + tests. Refactor существующие openers (toolbar buttons в Editor, etc) на reuse этого компонента. +6 tests.

**K3 — Frame view add piece UI.** Добавить `+` button в `ZoneFrame.jsx` header → onClick mount AddPiecePopover anchored на button. +4 tests.

**K4 — Frame view mutation context menu.** Extend `ContainerBlock.jsx` right-click → mount existing `MutationModal`. +3 tests.

**K5 — Frame view group via selection.** Multi-select на pieces в lane (cmd-click) + context menu «Сшить →». Wire to existing `OpGroupPicker`. +4 tests.

**K6 — Sequence view add piece.** В `ZonePaletteView`/`ZoneEmptyView` click on empty → AddPiecePopover. +4 tests.

**K7 — Sequence view selection + group.** Same selection model как Frame view (cmd-click). +3 tests.

**K8 — Sequence view primer inline editing.** Click на primer glyph → mini modal с binding/tail/Tm. Reuse existing PrimerEditModal. +3 tests.

**K9 — Shared context menus.** Extract `PieceContextMenu.jsx` + `OpContextMenu.jsx`. Replace inline menus в ZoneFrame / sequence-mode / AssemblyShellBody на reuse. +6 tests.

**K10 — Editor `G` toggle button.** В AssemblyHeader (или editor-tab strip) добавить кнопку «Sequence view» которая возвращает на canvas + переключает zone.viewMode='sequence' (без полного closing editor — это alt path). +3 tests.

**K11 — Visual consistency audit.** Verify piece.color used uniformly across views (no separate hardcoded colors). Verify piece.name used uniformly (no truncation differences). +4 tests.

**K12 — Empty state hint consistency.** Unified text across 3 views (Frame zone empty / Sequence empty / Editor EmptyAssemblyHint). Same tone, same 4 entry-points mentioned. +3 tests.

**K13 — Smoke test.** Manual flow:
1. Empty project → create zone (Сборка 1) → opens in Frame view.
2. In Frame view: click `+` in zone header → popover → click «Обвес» → SnippetCatalog → 6×His → piece added.
3. Toggle `G` → Sequence view. 6×His piece visible как colored band.
4. Click empty area to right → popover → click «Из плазмиды» → range picker on pET-28b → another piece.
5. Cmd-click both pieces → right-click → «Сшить → OvPCR» → group created.
6. Toggle `G` → back to Frame. Pieces visible в lane ИСТОЧНИКИ, op-rhombus, intermediate в ПРОМЕЖУТОЧНОЕ.
7. Right-click op-rhombus → «Параметры стыка» → JunctionPopover.
8. Open editor (🪄 кнопка) → all changes persisted. Tab strip + AssemblyHeader title `Сборка 1`.
9. Make mutation via context menu в Editor → return to Frame → mutation marker visible на ContainerBlock.

---

## 7. STOP-условие

Code останавливается после K13. Отчёт включает:
- Matrix audit results (final state of §2 table).
- Shared components created (AddPiecePopover, PieceContextMenu, OpContextMenu).
- Visual consistency verified.
- Vitest counter delta (~+40-50 tests).
- Smoke test 9 steps PASS/FAIL.

---

## 8. Открытые вопросы

1. **Frame view `+` button placement** — в zone header (рядом с `G` / `Открыть сборку`) или floating top-left zone bounds? Я склоняюсь к header (рядом с другими controls). Подтверждение Игоря в визуальной приёмке.

2. **Sequence view editing extent** — какие правки делать inline (на canvas) vs «открыть editor для деталей»? Чем больше inline — тем меньше context switch'ей. Но canvas zone узкий, full primer editor не помещается. Решение: inline = quick edits (rename, RC, delete, simple primer override). Full editor = complex (multi-step pipeline view, snippet catalog с категориями, etc).

3. **`G` button hotkey** — global или only когда focus в zone? Я бы делал когда focus on zone (биолог click'нул zone — `G` toggle'ит её view). Не глобальный (мешает Ctrl+G и тp).

4. **Context menu language** — русский (как сейчас часть) или английский (как часть)? Я предлагаю русский везде. Glossary file (отложен) зафиксирует точные термины для меню.

5. **Mutation visualization в Frame view** — где marker? На ContainerBlock как маленький badge `💎N` (N = число mutations)? Tooltip hover показывает details. T-future polish.

---

## 9. Связь с другими спеками

- **SPEC_ASSEMBLY_EDITOR_CLEANUP** — выполняется **first**. Cleanup'ит layout / conditional / дубли. Эта спека (unification) идёт **второй**, расширяет capabilities в Frame + Sequence views.
- **SPEC_ASSEMBLY_WORKFLOW_UX** — базовая workflow модель. Эта спека её **не меняет** (5-step workflow остаётся), только расширяет available views.
- **SPEC_MAIN_SCREEN_CLEANUP / SPEC_PROJECT_CANVAS_CLEANUP** — independent.

---

**Дата:** 20.05.2026.
**Author:** Chat (BodgeGene Architecture).
**Реализация:** Sprint M-ASSEMBLY-VIEWS-UNIFY (Code, ~3-5 дней).
**Зависимости:** M-ASSEMBLY-EDITOR-CLEANUP completed.
**Не блокирует:** SPEC_MAIN_SCREEN_CLEANUP / SPEC_PROJECT_CANVAS_CLEANUP — независимые.
