# SPEC_ASSEMBLY_EDITOR_CLEANUP.md — assembly editor: убрать дубли + прогрессивная сложность + container-only-in-zone

> **Тип задачи:** B (feature/UX, mid-сложности). Размер спеки ~26 KB.
> **Sprint:** **M-ASSEMBLY-EDITOR-CLEANUP** (Code ~3-5 дней, low-mid risk).
> **Приоритет:** **высокий** — биолог реально работает в assembly editor, перегрузка тут самое раздражающее место.
> **Связанные spec'и:** SPEC_MAIN_SCREEN_CLEANUP (уже написана) + SPEC_PROJECT_CANVAS_CLEANUP (нуждается в amendments — см. §12).
> **Эта спека вносит amendments в SPEC_PROJECT_CANVAS_CLEANUP** через зафиксированную в §2 ментальную модель «container — всегда внутри сборки».

---

## 0. Scope & non-goals

### IN scope
- Удалить дубль primary Realise: оставить только `🪄 Realise as DAG` в AssemblyHeader (top-right), удалить `Realise pipeline →` из AssemblyPipelinePanel.
- Conditional rendering panel'ов по 3 состояниям (empty / with-segments / with-groups). Прогрессивная сложность UI.
- Default zone name `"Сборка N"` при creation (убирает `(пустой)` из tab strip + MiniProjectCanvas).
- Conditional `🎨 Палитра` button — только когда есть coloured zones.
- Conditional Mini DAG в AssemblyPipelinePanel — только когда есть groups.
- Unified empty-state messaging: один onboarding-hint в центре когда segments пусто, остальные empty states silent.
- `SegmentList` stale text `+ Сегмент` → корректные 4 entry-points.
- `🔗 Сшить` в AssemblyToolbar как **conditional button** (показывается при selection ≥ 2).
- AssemblySidebar (Источники) — упростить, убрать дубль с project canvas search.
- **Mental model: container — всегда внутри zone.** Drag из library в canvas создаёт zone автоматически (см. §2).

### OUT scope
- **WYSIWYG primer editor** — отдельный sprint v2.1.
- **Cross-zone connections** (output одной zone → input другой) — T-future.
- **Mutation как separate slice** — остаётся `piece.mutations[]`.
- **Library search bar UI implementation** — относится к SPEC_PROJECT_CANVAS_CLEANUP, не здесь.
- **Корзина relocation в Settings** — отдельная задача (упомянута в main screen cleanup).
- **Auto-grouping algorithm tuning** — heuristic в `auto-group-pipeline.js` оставлен как есть.

---

## 1. Контекст

### 1.1 Что реализовано после M-CANVAS-WORKFLOW-UX (visited code 20.05.2026)

`AssemblyShellBody.jsx` mounts:
- `AssemblyHeader` (top toolbar: title / 🧬 emoji / length+segm+topology / linear toggle / 🎨 Палитра / 🪄 Realise as DAG).
- `SnippetOnboardingTip` (conditional при first snippet usage).
- Main horizontal split:
  - `SequenceTab` (center, flex 1) — viewer с coloured zones.
  - Right column 248px: `AssemblySidebar` (containers list с filter) + `AssemblyPrimersPanel` (под sidebar, max 220px).
  - `AssemblyPipelinePanel` (rightmost 280px) — Схема сборки + Auto-собрать + groups list + Mini DAG + Realise pipeline.
  - `SegmentDetailPanel` (conditional при detail open).
- `SegmentList` (bottom table # / Источник / Длина / RC / Действия).
- `AssemblyToolbar` (bottom: + Плазмида / + Обвес / + Синтез / + Gap / Undo / Redo).
- Floating overlay: `MiniProjectCanvas` (200×150 read-only project thumbnail, top-right).
- Modals on demand: `PlaceholderTreePicker` / `RangePickerModal` / `InsertGapModal` / `SnippetCatalogModal` / `SynthesisModal` / `OpGroupPicker` / `RealiseModal` / `MutationModal`.

### 1.2 Найденные проблемы при code review

| # | Тип | Описание | Локация |
|---|---|---|---|
| 1 | **Дубль** | Два Realise button оба → `setRealiseOpen(true)` | `AssemblyHeader.jsx` + `AssemblyPipelinePanel.jsx` |
| 2 | **Bug** | Tab name `(пустой)` потому что draft.name пустой при creation; header показывает `"Сборка"` (placeholder), tab показывает `🧬 (пустой)` — рассинхрон | `EditorTabStrip::asmLabel`+ zone creation reducer |
| 3 | **Перегрузка** | 528px правых panels одновременно на любом state, включая empty | `AssemblyShellBody.jsx` |
| 4 | **Перегрузка** | 5 разных empty-state messages одновременно на пустой сборке | `SequenceTab + AssemblySidebar + AssemblyPrimersPanel + AssemblyPipelinePanel + SegmentList` |
| 5 | **Stale text** | `+ Сегмент` в SegmentList hint — нет такой кнопки, есть 4 (+ Плазмида / + Обвес / + Синтез / + Gap) | `SegmentList.jsx` |
| 6 | **UX** | 🎨 Палитра показывает «Нет сегментов» dropdown на empty | `AssemblyHeader.jsx` |
| 7 | **UX** | Mini DAG box показывает «—» dashed placeholder на empty | `AssemblyPipelinePanel.jsx` |
| 8 | **Дубль search** | AssemblySidebar filter «Поиск контейнера…» дублирует project canvas search bar (см. SPEC_PROJECT_CANVAS_CLEANUP) | `AssemblySidebar.jsx` |
| 9 | **Дубль counter** | `📋 Сборки (N)` button в project canvas + zones visible на canvas + Pipeline panel в editor | разные места |
| 10 | **`+ Операция` standalone** | На project canvas есть `+ Операция` который никак не wire'd на текущую модель (op живёт внутри zone) | project canvas bottom-right |

### 1.3 Что обсудили (20.05.2026)

| # | Решение Игоря | Действие |
|---|---|---|
| A | Один primary action на состояние — `🪄 Realise as DAG` в header | Удалить `Realise pipeline →` из panel |
| B | Default zone name `"Сборка N"` | Reducer + UI fallback unified |
| C | Conditional panels: hide AssemblyPipelinePanel когда нет groups, AssemblyPrimersPanel когда нет primers AND нет segments | Conditional rendering |
| D | Empty state hint в центре с 4-line breakdown | Новый `EmptyAssemblyHint` component |
| E | `🔗 Сшить` в toolbar bottom вместо floating button | AssemblyToolbar расширить |
| F | **Container не может жить вне zone** | Большая mental model amendment — см. §2 |
| G | Drop из library в canvas создаёт zone (если drop на пустую область) или добавляет в existing zone (если drop на zone border) | wire в project canvas + amendments to SPEC_PROJECT_CANVAS_CLEANUP |
| H | Удалить `+ Операция` standalone на project canvas | Operations только внутри editor через grouping |

---

## 2. Mental model: container — всегда внутри сборки

**Базовое правило:** в проекте **нет standalone containers**. Любой container на canvas является частью какой-то zone (= сборки). Даже «просто посмотреть pUC19» = создание zone-with-one-piece.

### 2.1 Что это даёт

- Унификация: всё что biolog видит на canvas — это **либо zones**, **либо outputs zones** (final containers wired из своих zones).
- `+ Сборка` — единственный primary action на пустом проекте.
- Drag из library в canvas — однозначное поведение: либо создаёт новую zone, либо добавляет в существующую (по точке drop).
- Library = pool **source-плазмид** (read-only refs).

### 2.2 Что хранится где

```
Project = list of zones + their inter-zone connections (T-future)
Zone (= assembly) = pieces + operations + groups + primers + finalTopology
Piece = sourced (refs container) / snippet / synthesis / gap / intermediate / final
Container = всегда либо source в каком-то zone, либо output какой-то op
Library = pool of source containers (доступные для drag)
```

Library entry = container metadata. Чтобы использовать → **обязательно** через zone (даже single-piece zone для viewing).

### 2.3 Use cases

**1. «Просто посмотреть pUC19 в SequenceView».**
- Library search → click pUC19 → автоматически создаётся zone `"pUC19 view"` (или `"Сборка N"` если biolog не назвал).
- Editor открывается с одним sourced piece = full pUC19.
- Biolog видит sequence, annotations, restriction sites. Может закрыть zone или работать дальше.

**2. «Одна точечная мутация в pET-28b».**
- Library → drag pET-28b в canvas → новая zone.
- Editor: 1 sourced piece + biolog добавляет mutation через context menu.
- `🔗 Сшить` на 1 piece → OpGroupPicker → KLD → group → Realise → final container с мутацией.

**3. «4-fragment Gibson».**
- `+ Сборка` или drag первой плазмиды → zone.
- Drag остальных в ту же zone (drop на zone border) → 4 sources.
- Grouping → Gibson → Realise → circular final.

**4. «Пустой проект, что делать».**
- Empty canvas + single primary CTA `+ Создать сборку` в центре.
- Click → zone created → editor открывается с empty assembly hint.

### 2.4 Amendments к SPEC_PROJECT_CANVAS_CLEANUP

Эта спека вносит **conceptual amendments** в SPEC_PROJECT_CANVAS_CLEANUP.md (написана 20.05.2026):

- §0 OUT scope `+ Сборка vs + Операция unification` → теперь **IN scope** этой спеки: **`+ Операция` standalone удаляется**, остаётся только `+ Сборка`.
- §3.2 «Container на canvas» → containers всегда являются source в каком-то zone. Standalone container на canvas невозможен.
- §3.3 Drop file behavior расширяется: drop `.gb`/`.dna` → автоматически создаётся zone + container становится её source.
- §5 «Что отложено до M-ASSEMBLY-CLEANUP» → закрывается этой спекой.

Конкретные правки SPEC_PROJECT_CANVAS_CLEANUP применяются вместе с M-ASSEMBLY-EDITOR-CLEANUP sprint'ом (Code amends оба коммитом с M-ASSEMBLY-CLEANUP K-точки).

---

## 3. Финальный layout — 3 состояния

### 3.1 Состояние A — пустая сборка (только что создана)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Назад  [🧬 Сборка 1 ✕]                                                    │  editor header
├──────────────────────────────────────────────────────────────────────────────┤
│ 🧬 Сборка 1   ✎             0 bp · 0 сегм. · linear      🪄 Realise (disabled)│  assembly header
│                              [— linear]              (без 🎨 Палитра)         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│                                                                                │
│              ┌──────────────────────────────────────────────────┐            │
│              │  📦 Скелет сборки пуст                            │            │
│              │                                                    │            │
│              │  📚 Перетащите плазмиду из библиотеки или         │            │
│              │     нажмите «+ Плазмида» внизу                     │            │
│              │  ✦ «+ Обвес» — tag / linker / restriction site   │            │
│              │  🧪 «+ Синтез» — длинный кусок ПСО (≥100 bp)     │            │
│              │  ◊ «+ Gap» — placeholder без последовательности   │            │
│              │                                                    │            │
│              │  Когда соберёте 2+ куска — нажмите                │            │
│              │  🪄 Realise as DAG вверху справа.                 │            │
│              └──────────────────────────────────────────────────┘            │
│                                                                                │
│                                                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│  [+ Плазмида]  [+ Обвес]  [+ Синтез]  [+ Gap]            ↶ Undo  ↷ Redo     │  toolbar
└──────────────────────────────────────────────────────────────────────────────┘
```

**Видно только:**
- Editor header (back, tab `🧬 Сборка 1`).
- Assembly header (title editable, метрика 0 bp, linear toggle, Realise disabled).
- **EmptyAssemblyHint** в центре (большой onboarding).
- Bottom toolbar (4 add buttons + Undo/Redo).

**Скрыто:**
- AssemblySidebar (containers list — нечего drag'ать в пустое).
- AssemblyPrimersPanel.
- AssemblyPipelinePanel.
- 🎨 Палитра button.
- SegmentList footer (нет сегментов).
- `🔗 Сшить` button.
- MiniProjectCanvas — collapsed по умолчанию.

### 3.2 Состояние B — есть фрагменты, нет ещё groups

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Назад  [🧬 Сборка 1 ✕]                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ 🧬 Сборка 1                3045 bp · 3 сегм. · linear   🎨 Палитра  🪄Realise│
├─────────────────────────────────────────────────┬────────────────────────────┤
│                                                  │ Источники          [🔍]   │
│   Strip view (SequenceTab + coloredZones):       ├────────────────────────────┤
│   ▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰         │ ⭕ pUC19       432 bp     │
│   pUC19      gap-X       3kb-CDS                 │ ⭕ pET-28b(+)  360 bp     │
│                                                  │ ⭕ pGEX-4T-1   363 bp     │
│   ATGCATATGAAGCTTTAATA... (sequence visible)     │ — линейный    1000 bp     │
│                                                  │  (drag в strip ↓)         │
├──────────────────────────────────────────────────┤                            │
│  # │ Источник       │ Длина │ RC │ Действия      │ ── Праймеры 0 ──          │
│  1 │ pUC19 [0:432]  │ 432bp │ —  │ ▲ ▼ ✏️ 💎 ✕   │ (выдели → Ctrl+R)         │
│  2 │ gap-X          │ 1213bp│ —  │ ▲ ▼ ✏️ 💎 ✕   │                            │
│  3 │ 3kb-CDS [0:1400]│1400bp│ — │ ▲ ▼ ✏️ 💎 ✕   │                            │
├──────────────────────────────────────────────────┴────────────────────────────┤
│  [+ Плазмида]  [+ Обвес]  [+ Синтез]  [+ Gap]                ↶ Undo ↷ Redo  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Появилось:**
- Strip view (вместо EmptyAssemblyHint).
- AssemblySidebar (Источники) — справа, ~260px.
- AssemblyPrimersPanel — под sidebar, **compact** (empty hint).
- 🎨 Палитра button **активна**.
- 🪄 Realise as DAG **активна** (3 сегмента ≥ 2).
- SegmentList table.

**Скрыто:**
- AssemblyPipelinePanel — нет groups ещё.
- `🔗 Сшить` — нет selection.

### 3.3 Состояние C — есть groups (multi-step pipeline)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Назад  [🧬 Сборка 1 ✕]                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ 🧬 Сборка 1               5847 bp · 8 сегм. · circular   🎨 Палитра 🪄Realise│
├──────────────────────────────────────┬────────────┬───────────────────────────┤
│                                       │ Источники  │ Схема сборки              │
│   Strip с groups visual borders:      │ (compact)  ├───────────────────────────┤
│   ┌── Group A: OvPCR ──┐              │ ⭕ pUC19   │ ⚡ Auto-собрать           │
│   │ ▰▰▱▱▱▱ frag1+arm+tag │            │ ⭕ pET-28b ├───────────────────────────┤
│   └─────────────────────┘              │ ⭕ pGEX    │ Layer 1                  │
│              ↓                         │            │ ├ OvPCR-A (3 куск.) [✕] │
│   ┌── Group B: OvPCR ──┐              ├────────────┤ ├ OvPCR-B (3 куск.) [✕] │
│   │ ▰▰▰▱▱▱ frag2+...    │             │ Праймеры 8 │                          │
│   └─────────────────────┘              │ 🔧 fwd-1   │ Layer 2                  │
│              ↓                         │ 🔧 rev-1   │ └ Gibson (2 int.) [✕]    │
│   ┌── Final Gibson ───┐                │ 🔧 fwd-2   ├───────────────────────────┤
│   │ ▰▰▰▰▰ interm-A+B   │               │ ...        │ Mini DAG                 │
│   └─────────────────────┘              │ Границы 4/4│ ┌──────────────────────┐ │
│                                        │            │ │ A→B→[Gibson]→[final] │ │
│                                        │            │ └──────────────────────┘ │
├────────────────────────────────────────┴────────────┴───────────────────────┤
│  # │ Источник       │ Длина │ RC │ Действия                                 │
│  ... (rows)                                                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│  [+ Плазмида]  [+ Обвес]  [+ Синтез]  [+ Gap]  [🔗 Сшить (3)]  ↶ Undo ↷    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Появилось:**
- AssemblyPipelinePanel (Схема сборки) ~280px правее.
- Groups visual borders в strip.
- Mini DAG block (внутри pipeline panel).
- `🔗 Сшить (N)` в toolbar — есть selection 3 piece'ов.

**Удалено:**
- `Realise pipeline →` button — primary action только в header.

---

## 4. Conditional rendering rules (таблица)

| Element | Visible когда |
|---|---|
| **EmptyAssemblyHint в центре** | `draft.segments.length === 0` |
| **SequenceTab (strip view)** | `draft.segments.length > 0` |
| **AssemblySidebar (Источники)** | `state.containers.length > 0` (containers в проекте есть) |
| **AssemblyPrimersPanel** | `primers.length > 0 OR draft.segments.length > 0` |
| **AssemblyPipelinePanel** | `groups.length > 0` (op-groups для текущей zone) |
| **🎨 Палитра button** | `coloredZones.length > 0` |
| **🪄 Realise as DAG** | enabled при `draft.segments.length >= 2`, disabled с tooltip иначе |
| **`🔗 Сшить (N)` button в toolbar** | `selectedSegmentIds.size >= 2` |
| **SegmentList table** | `draft.segments.length > 0` |
| **MiniProjectCanvas** | collapsed default; biolog может развернуть кнопкой `[−]` |
| **Mini DAG block** | `groups.length > 0` (нестандартно — внутри pipeline panel) |
| **`Realise pipeline →` в panel** | **никогда** (удалён — функция дублирует header) |

---

## 5. Конкретные правки file by file

### 5.1 `AssemblyShellBody.jsx`

#### 5.1.1 EmptyAssemblyHint mount

В main split area вместо unconditional `<SequenceTab>`:

```jsx
{draft.segments.length === 0 ? (
  <EmptyAssemblyHint />
) : (
  <SequenceTab ... />
)}
```

#### 5.1.2 AssemblySidebar conditional

```jsx
{(state.containers || []).length > 0 && (
  <AssemblySidebar containers={state.containers || []} />
)}
```

(Когда library пуст и в проекте containers тоже нет — sidebar не нужен.)

#### 5.1.3 AssemblyPrimersPanel conditional

```jsx
{(primers.length > 0 || draft.segments.length > 0) && (
  <AssemblyPrimersPanel draftId={draftId} />
)}
```

`primers` уже доступен через `state.assemblyDraftPrimers[draftId]` в AssemblyPrimersPanel — нужно поднять для условия в parent или передать count.

#### 5.1.4 AssemblyPipelinePanel conditional

```jsx
const opGroups = useMemo(() => (state.operations || []).filter(
  (op) => op && op.isOpGroup && op.zoneId === draftId,
), [state.operations, draftId]);

{opGroups.length > 0 && (
  <AssemblyPipelinePanel
    draftId={draftId}
    zoneId={draftId}
    onAutomode={...}
    // onRealise prop удалён — function moved to header only
  />
)}
```

#### 5.1.5 AssemblyToolbar расширить

Передать `selectedSegmentIds` + handler:

```jsx
<AssemblyToolbar
  onAddSegment={() => setPickerOpen(true)}
  onAddSnippet={() => setSnippetOpen(true)}
  onAddSynthesis={() => setSynthesisOpen(true)}
  onAddGap={() => setGapOpen(true)}
  selectedSegmentIds={selectedSegmentIds}
  onSewSelected={() => setGroupPickerIds(Array.from(selectedSegmentIds))}
/>
```

### 5.2 `AssemblyHeader.jsx`

#### 5.2.1 Conditional 🎨 Палитра

```jsx
{(paletteLegend || []).length > 0 && (
  <div style={{ position: 'relative' }}>
    <button type="button" data-testid="assembly-palette-legend-toggle" ...>
      🎨 Палитра
    </button>
    {/* legend dropdown как сейчас */}
  </div>
)}
```

#### 5.2.2 Realise button фиксируется как единственный entry-point

Без изменений — он остаётся. Удаляется только дубль из AssemblyPipelinePanel (см. §5.4).

#### 5.2.3 Title fallback

InlineEditableTitle уже имеет `placeholder="Сборка"`. **Не trogать** — placeholder OK когда biolog намеренно стёр имя. Реальный fix — default name при creation (см. §6).

### 5.3 `AssemblyToolbar.jsx`

Добавить conditional `🔗 Сшить` button:

```jsx
<button type="button" data-testid="assembly-add-segment" onClick={onAddSegment} style={btn()}>
  + Плазмида
</button>
{/* ... 3 more add buttons ... */}

{selectedSegmentIds.size >= 2 && (
  <button
    type="button"
    data-testid="assembly-sew-selected"
    onClick={onSewSelected}
    style={btn({ background: 'var(--accent-500, #b85c3e)', color: '#fff', fontWeight: 600 })}
  >
    🔗 Сшить ({selectedSegmentIds.size})
  </button>
)}

<div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
  {/* Undo / Redo */}
</div>
```

`🔗 Сшить (N)` имеет accent цвет когда активна — primary в этом state.

### 5.4 `AssemblyPipelinePanel.jsx`

#### 5.4.1 Удалить нижнюю кнопку Realise pipeline

Удалить целиком блок:

```jsx
{/* DELETE THIS BLOCK */}
<div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
  <button
    type="button"
    data-testid="assembly-pipeline-realise"
    onClick={onRealise}
    style={{ ...primaryBtn, width: '100%' }}
  >Realise pipeline →</button>
</div>
```

`onRealise` prop становится unused — удалить из interface.

#### 5.4.2 Mini DAG conditional (внутри panel)

Сейчас:
```jsx
<div data-testid="assembly-pipeline-dag" style={{ padding: '8px 12px', ... }}>
  <div style={{ marginBottom: 4 }}>Mini DAG</div>
  <div style={{ minHeight: 40, border: '1px dashed ...', ... }}>
    {groups.length === 0 ? '—' : `${groups.length} групп · ${layers.length} слой(ёв)`}
  </div>
</div>
```

Заменить на:

```jsx
{groups.length > 0 && (
  <div data-testid="assembly-pipeline-dag" style={{ padding: '8px 12px', ... }}>
    <div style={{ marginBottom: 4 }}>Mini DAG</div>
    <div style={{ minHeight: 40, border: '1px solid ...', ... }}>
      {`${groups.length} групп · ${layers.length} слой(ёв)`}
    </div>
  </div>
)}
```

Но **AssemblyPipelinePanel сам conditional** в parent (§5.1.4 — показывается только когда groups.length > 0). То есть **panel никогда не рендерится с empty groups**. Логика Mini DAG conditional остаётся для defensiveness, но `groups.length === 0` ветка фактически dead code.

#### 5.4.3 Empty hint в panel

Сейчас:
```jsx
{groups.length === 0 ? (
  <div data-testid="assembly-pipeline-empty" ...>
    Группы пока не созданы. Выдели куски в strip и нажми «🔗 Сшить».
  </div>
) : (
  /* render groups */
)}
```

После cleanup'а — panel вообще не появляется при empty. Empty hint — dead code, но **оставить** для defensiveness (e.g. if panel mounted in test directly).

### 5.5 `SegmentList.jsx`

Найти строку:
> «Сегментов нет. Перетащите контейнер или «+ Сегмент».»

Заменить на:
> «Сегментов нет. Перетащите плазмиду из правого сайдбара, либо используйте кнопки внизу: + Плазмида / + Обвес / + Синтез / + Gap.»

(Уточняется когда `draft.segments.length === 0` — но в этом случае SegmentList table сам conditional, см. §4. Hint виден только если parent логика mount'ит даже на empty — defensiveness.)

### 5.6 `EditorTabStrip.jsx`

`asmLabel(d)` сейчас возвращает `🧬 ${(d && d.name) || ph()}`. Где `ph()` = `STRINGS.canvasSkeleton.editorWindow.placeholderTabLabel || '(пустой)'`.

Не trogать — fallback logic правильный. Реальный fix — **default zone name при creation** (см. §6).

### 5.7 Новый компонент `EmptyAssemblyHint.jsx`

Local в `assembly-mode/` directory. Примерно 50-60 LOC, ~2-3 KB.

```jsx
/**
 * EmptyAssemblyHint — shown when draft.segments.length === 0.
 * Replaces the scatter of empty-state messages with one onboarding
 * hint in the centre. SPEC_ASSEMBLY_EDITOR_CLEANUP §5.7.
 */
export default function EmptyAssemblyHint() {
  return (
    <div
      data-testid="assembly-empty-hint"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 16,
        padding: 40,
        color: 'var(--text-secondary)',
      }}
    >
      <div style={{ fontSize: 32 }}>📦</div>
      <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Скелет сборки пуст</h3>
      <ul style={{ listStyle: 'none', padding: 0, lineHeight: 1.8, fontSize: 12, maxWidth: 480 }}>
        <li>📚 Перетащите плазмиду из библиотеки <em>или</em> нажмите <strong>+ Плазмида</strong> внизу.</li>
        <li>✦ <strong>+ Обвес</strong> — tag / linker / restriction site (встроится в primer).</li>
        <li>🧪 <strong>+ Синтез</strong> — длинный кусок ПСО (≥100 bp).</li>
        <li>◊ <strong>+ Gap</strong> — placeholder без последовательности.</li>
      </ul>
      <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: 0 }}>
        Когда соберёте 2+ куска — кнопка <strong>🪄 Realise as DAG</strong> вверху справа.
      </p>
    </div>
  );
}
```

### 5.8 `AssemblySidebar.jsx`

Сейчас filter input `Поиск контейнера…` дублирует project canvas search bar.

**Решение:** оставить filter в AssemblySidebar (он работает над **текущим проектом**, не над всей library — это разные источники), но **переименовать placeholder** для disambiguation:

> `Поиск контейнера…` → `Фильтр по контейнерам проекта…`

Это семантически точнее: sidebar показывает **containers данного проекта** (drag-source для сборки), не library. Project canvas top search bar — поиск по library + проекту.

### 5.9 `AssemblyPrimersPanel.jsx`

При conditional rendering в parent (см. §5.1.3), сам компонент не меняется. Empty hint внутри (`Выдели участок и нажми Ctrl+R...`) остаётся — он валиден когда есть segments но нет primers.

---

## 6. Default zone name logic

### 6.1 Что меняется

Сейчас при создании zone (через `+ Сборка` или drag-into-empty-canvas) — `zone.name = ''` (empty string). Из-за этого:
- EditorTabStrip показывает `🧬 (пустой)`.
- MiniProjectCanvas показывает `(пустой)` для empty containers/zones.
- AssemblyHeader InlineEditableTitle показывает placeholder `"Сборка"` (другой fallback).

**Fix:** в reducer `createZone` (или `createAssemblyDraft`):

```javascript
function nextZoneName(zones) {
  const existing = new Set((zones || []).map(z => z.name).filter(Boolean));
  let n = 1;
  while (existing.has(`Сборка ${n}`)) n += 1;
  return `Сборка ${n}`;
}

// in CREATE_ZONE / CREATE_ASSEMBLY_DRAFT handler:
const name = action.name && action.name.trim()
  ? action.name.trim()
  : nextZoneName(state.zones);
```

### 6.2 Edge cases

- Biolog **стёр** name (cleared input) → placeholder `"Сборка"` показывается (InlineEditableTitle behavior). Tab показывает `🧬 (пустой)`. Это **намеренное** behavior (biolog знает что он сделал).
- Биолог дублирует zone → counter подбирает next available номер (e.g. если есть `Сборка 1`, `Сборка 3` — новая будет `Сборка 2`).
- Migration: existing zones с `name === ''` после migration → reducer assigns default `Сборка N` при first save (idempotent).

### 6.3 Где править

Поиск reducer'ов по `CREATE_ASSEMBLY_DRAFT` / `CREATE_ZONE`:
- `gui/designer/src/components/CanvasSkeleton/store/skeleton-state-zones.js` (вероятно).
- Или whatever handles zone creation в four-tier T3 reducer.

---

## 7. Project canvas amendments (применяются в этом же sprint'е)

### 7.1 `+ Операция` standalone — удалить

В project canvas (`CanvasLayoutView` или wherever) — кнопка `+ Операция` bottom-right удаляется. Operations создаются **только** внутри editor через `🔗 Сшить` + OpGroupPicker.

Связанное wiring: action `createOperation(...)` который вызывался из этой кнопки — оставить available в reducer (legacy ops через четыре-tier model могут create), но UI entry-point удалить.

### 7.2 Drag-from-library behavior

В project canvas drop area handler:

```javascript
function handleDrop(e) {
  e.preventDefault();
  const containerId = e.dataTransfer.getData('application/x-bodge-container-id');
  if (!containerId) return;
  
  const dropZoneId = findZoneAtPoint(e.clientX, e.clientY);
  
  if (dropZoneId) {
    // Drop on existing zone — add container as new piece source
    actions.addPieceToZone(dropZoneId, containerId);
  } else {
    // Drop on empty area — create new zone with this container as sole source
    const newZoneId = actions.createZoneWithSource(containerId);
    // Open editor for new zone
    actions.openAssemblyEditor(newZoneId);
  }
}
```

`createZoneWithSource` — новая action в reducer. Combines `createZone` + `insertSegment` атомарно.

### 7.3 `+ Сборка` button placement

- **Empty проект** (zones.length === 0): large primary CTA в центре canvas.
- **Non-empty проект** (zones.length > 0): small secondary button bottom-right (рядом с `🗑 Очистить`).

Кнопка делает: `createZone()` + `openAssemblyEditor(newZoneId)`. Editor открывается с empty assembly hint.

### 7.4 `📋 Сборки (N)` counter — удалить

После cleanup'а zones visible на canvas сами по себе (Miro-frames). Отдельный counter button bottom-right избыточен. Удаляем.

### 7.5 Layout / Graph toggle — оставить как есть

Решение отложено в OUT scope. После M-ASSEMBLY-EDITOR-CLEANUP — отдельный раунд (визуальная приёмка с zones на canvas).

### 7.6 Ghost placeholder block `+ Пусто · click / drop запчасть` — удалить

На canvas виден standalone ghost block (dashed border) с текстом `+ Пусто · click / drop запчасть`. Это **rudiment** старой модели где container мог свободно жить на canvas как «slot to fill».

**В новой модели (container = всегда внутри zone, см. §2):** этот блок противоречит ментальной модели и создаёт **третий путь** drop'а который никуда не ведёт:

1. Drop container в zone (в lane ИСТОЧНИКИ) → добавляется в zone как source. ✓ valid.
2. Drop container на пустую область canvas → создаётся новая zone (§7.2). ✓ valid.
3. Drop container в standalone ghost block → ??? — undefined в новой модели.

**Удалить ghost block целиком.** Empty area canvas достаточно как drop target — drag-from-library behavior (§7.2) обрабатывает empty area drop корректно (создание новой zone). Без визуального placeholder.

**Где править:** компонент рендерящий empty canvas state. Вероятно в `CanvasLayoutView` или `canvas/index.jsx` (нужно code review при реализации). Удалить mount + удалить связанный empty-state JSX.

**Onboarding на empty проекте** — заменяется на единый primary CTA `+ Создать сборку` в центре (§7.3). Это и есть полный empty state без ghost-блоков.


---

## 8. K-точки для Code

**K1 — EmptyAssemblyHint component.** New `assembly-mode/EmptyAssemblyHint.jsx` ~50-60 LOC. +3 tests (render content, snapshots disabled).

**K2 — AssemblyShellBody conditional rendering.** Mount EmptyAssemblyHint когда `segments.length === 0`. AssemblySidebar conditional (`containers.length > 0`). AssemblyPrimersPanel conditional (`primers.length > 0 OR segments.length > 0`). AssemblyPipelinePanel conditional (`opGroups.length > 0`). +6 tests (presence/absence per state).

**K3 — AssemblyHeader conditional Палитра.** `paletteLegend.length > 0` gate. +2 tests.

**K4 — AssemblyToolbar Сшить button.** Conditional `🔗 Сшить (N)` при `selectedSegmentIds.size >= 2`. Wire `onSewSelected` → `setGroupPickerIds`. +3 tests.

**K5 — AssemblyPipelinePanel удалить Realise button + conditional Mini DAG.** Delete `Realise pipeline →` block. Mini DAG inside panel — conditional на `groups.length > 0` (defensiveness). `onRealise` prop удалить из interface. +3 tests (button absent assertion, Mini DAG conditional).

**K6 — Default zone name.** Reducer `createZone` / `createAssemblyDraft` — assign `"Сборка N"` если name пустой. Counter computed from existing zone names. +5 tests (sequential creation, gap fill, manual override preserved).

**K7 — SegmentList stale text fix.** Replace `+ Сегмент` reference. +1 test.

**K8 — AssemblySidebar placeholder rename.** `Поиск контейнера…` → `Фильтр по контейнерам проекта…`. +1 test.

**K9 — Project canvas amendments.** Remove `+ Операция` standalone button. Remove `📋 Сборки (N)` counter. Remove ghost placeholder block `+ Пусто · click / drop запчасть` (§7.6). `+ Сборка` placement logic (center large на empty, bottom-right small на non-empty). +6 tests.

**K10 — Drag-from-library creates zone.** Drop handler logic per §7.2. New action `createZoneWithSource(containerId)`. Auto-open editor for new zone. +6 tests.

**K11 — Smoke test.** Full manual flow:
1. Open empty project → canvas пуст, `+ Создать сборку` в центре.
2. Click → zone created с name `"Сборка 1"`, editor opens с EmptyAssemblyHint.
3. AssemblyHeader: title `Сборка 1`, метрика 0 bp, Realise disabled, без Палитра.
4. Right panels не видны (AssemblySidebar, Primers, Pipeline).
5. Click `+ Плазмида` → picker → range → piece added.
6. Strip view replaces EmptyAssemblyHint. AssemblySidebar appears. AssemblyPrimersPanel appears (empty hint).
7. Add 2 more pieces, select all 3 → `🔗 Сшить (3)` button visible в toolbar.
8. Click → OpGroupPicker → OvPCR → group created.
9. AssemblyPipelinePanel appears с Group A.
10. `🪄 Realise as DAG` enabled, click → RealiseModal opens.
11. Back to canvas → zone visible с Miro-frame + sources внутри.
12. Drag pUC19 из library в **empty area** canvas → new zone `Сборка 2` + editor opens automatically с pUC19 как первый piece.
13. Back → 2 zones на canvas.
14. Verify: no `+ Операция` button on canvas. No `📋 Сборки (2)` button.

---

## 9. STOP-условие

Code останавливается после K11. Отчёт включает:
- AssemblyShellBody size before/after.
- AssemblyPipelinePanel size before/after.
- New EmptyAssemblyHint size.
- Default zone names verified (counter increment, gap fill).
- Drag-from-library creates zone verified.
- Vitest counter delta (~+30-40 tests).
- Smoke test 14 steps PASS/FAIL.

**Координационные файлы Code не trogаt.**

---

## 10. Открытые вопросы

1. **EmptyAssemblyHint текст** — приведён в §5.7. Биолог может скорректировать формулировку при визуальной приёмке. Это **content**, не **architecture**.

2. **`🔗 Сшить (N)` цвет** — accent (orange primary) когда есть selection, либо secondary (gray ghost)? Я склоняюсь к **accent** когда активна (визуальный affordance). Решение Игоря в визуальной приёмке.

3. **`Сборка N` counter после удаления zone** — biolog удалил `Сборка 2`, потом создаёт новую. Это `Сборка 2` (gap fill) или `Сборка 4` (always max+1)? Я склоняюсь к **gap fill** (intuitive). Реализовать через `nextZoneName(zones)` который скан existing names и берёт первый free номер.

4. **Drop на zone border** — каков визуальный feedback во время drag? Highlight zone border + cursor `copy`? Tooltip «Добавить в Сборка N»? T-future polish, не блокер.

5. **`+ Сборка` button placement при non-empty проекте** — bottom-right (рядом с `🗑 Очистить`) или top-right? Я склоняюсь к **bottom-right** (action area). Решение Игоря.

6. **AssemblyPipelinePanel вообще нужен ли на screen в Состоянии C?** Возможно auto-collapsible — biolog может свернуть в pill (как MiniProjectCanvas)? T-future enhancement.

---

## 11. Связь с другими спеками

- **SPEC_MAIN_SCREEN_CLEANUP** — не пересекается с этой спекой. Sidebar изменения там, assembly editor здесь.
- **SPEC_PROJECT_CANVAS_CLEANUP** — **расширяется** через §2.4 + §7. Применяется amendments вместе с этим sprint'ом (commit M-ASSEMBLY-EDITOR-CLEANUP включает project canvas правки).
- **SPEC_ASSEMBLY_WORKFLOW_UX** (M-CANVAS-WORKFLOW-UX, уже реализован Code) — эта спека **patches** реализацию того spec'а. Не противоречит, докручивает UX полировкой.
- **SPEC_BODGE_FORMAT_V2_CORE / SPEC_BODGE_NOTEBOOK_MARKDOWN** — не пересекается.

---

## 12. Что обновить в SPEC_PROJECT_CANVAS_CLEANUP

Эта спека обновляет SPEC_PROJECT_CANVAS_CLEANUP.md в следующих местах. Apply при Code sprint M-ASSEMBLY-EDITOR-CLEANUP — single commit включает обе spec'и.

**§0 OUT scope** — пункт `+ Сборка / + Операция unification` → **IN scope этой спеки**, `+ Операция` удаляется. Зачеркнуть из OUT scope в SPEC_PROJECT_CANVAS_CLEANUP.

**§3.5 «Действие удаления `+ Операция`»** — новая sub-секция в SPEC_PROJECT_CANVAS_CLEANUP §3, описывает удаление кнопки + action wire-up.

**§5 «Что отложено до M-ASSEMBLY-CLEANUP»** — **закрывается** через эту спеку. Заменить на ссылку «See SPEC_ASSEMBLY_EDITOR_CLEANUP §7».

**§4.X «Drag-from-library creates zone»** — новая sub-секция в SPEC_PROJECT_CANVAS_CLEANUP §4 или §7, описывает drop handler logic.

**§8 «Дубликаты pUC19 / pET-28b ×2»** open question — не closed напрямую, но fixture data (8 entries из start-screen-data.js). Если bug — отдельная диагностика. Не в этом sprint'е.

---

**Дата:** 20.05.2026.
**Author:** Chat (BodgeGene Architecture).
**Реализация:** Sprint M-ASSEMBLY-EDITOR-CLEANUP (Code, ~3-5 дней).
**Зависимости:** M-CANVAS-WORKFLOW-UX completed (existing AssemblyShellBody / Header / Pipeline / Toolbar / Sidebar / Primers). Reducer support for `createZoneWithSource` action (new). Default zone naming logic.
**Включает amendments к:** SPEC_PROJECT_CANVAS_CLEANUP (см. §12).
**Не блокирует:** SPEC_MAIN_SCREEN_CLEANUP — independent sprint.
