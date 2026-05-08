# SPRINT_M-X.7a — Library structure

> **Статус:** активная спека, 08.05.2026. Готова к реализации Code.
> **Тип:** A (новый workspace + top-level routing change + librarySlice extension).
> **Целевая версия:** v0.9.0.
> **Парные документы:** `LIBRARY_MODEL_DRAFT.md` (data model + 3 зоны), `LIBRARY_WIREFRAME_DRAFT.md` rev 3 (rationale + open questions), `design_assets/Library.html` (визуальный источник правды от дизайнера 08.05.2026).
> **Парный спринт:** M-X.7b — Versioning UI (содержимое таба История + version-actions). Пишется отдельной спекой когда Игорь зафиксирует модель версионирования.

---

## 0. Срез размеров затрагиваемых модулей

Проверка на калибровку DEC-SIZE-CALIBRATION-01 (CLAUDE.md §7).

**Существующие в скоупе:**

| Файл | Размер | Зона | Действие |
|------|--------|------|----------|
| `store/librarySlice.js` | ~12 KB | safe | extend (+3 KB delta), no decomposition |
| `App.jsx` | ~4 KB | safe | extend (+1 KB delta) |
| `lib/strings.js` | varies | safe | extend (+2 KB delta) |
| `components/Importer/inspector/SequenceMapView.jsx` | ~? | check K3 | possibly +readOnly prop (~0.3 KB) |
| `components/Importer/inspector/AnnotationEditor.jsx` | ~? | check K3 | possibly +readOnly prop (~0.3 KB) |
| `store/canvasSlice.js` | varies | safe | maybe +0.5 KB workspace coordination |

**Существующие dead код для удаления (TD-LIB-K2-DEAD-CODE-PURGE):**
- Старые `components/Library/*` файлы периода M-A.3 (если ещё в репо после v0.6.4 wipe). Code проверяет в K1 и удаляет если присутствуют.

Все новые файлы в `components/Library/` создаются с нуля под size budget (распределение по подкомпонентам, см. §5.1).

**Ничего в hard зоне в скоупе → декомпозиция не требуется.** При этом структура `components/Library/` создаётся декомпозированной от старта (§5.1) — превентивная мера.

---

## 1. Контекст

В v0.8.0 (M-X.5 Этап 2) Library признана primary workspace через ⚓ DEC-IMP-06, но фактическая Library workspace реализация остаётся встроенной в Importer (CatalogColumn группа «Моя библиотека»). Биологу некуда идти после открытия app — workspace выбирается через Importer flow. Отдельного entry-point для просмотра/организации сохранённых плазмид нет.

`LIBRARY_MODEL_DRAFT.md` (08.05.2026) формализовал mental model: 3 зоны (Loose / `.bodge` archives / Lab pool), `+ Add` единая точка входа, lineage trail, frozen sequence в Loose vs DAG-операции в активном `.bodge`. Дизайнер отрисовал HTML mockup (`design_assets/Library.html`, 08.05.2026) с tabbed Inspector по паттерну Importer'а v0.8.0.

M-X.7a реализует Library structure без version management. Tab «История» виден с counter (commits.length), контент = placeholder. Action-actions связанные с версионированием (`Сохранить как версию`, `Manual-edit ветка`, `Откатить`, `Ветка от этого`) — disabled с tooltip «M-X.7b».

**Связи:**
- ⚓ DEC-IMP-06 (Library is primary workspace) — материализуется в M-X.7a.
- ⚓ DEC-LIB-01..17 — частично пересматриваются (см. `LIBRARY_MODEL_DRAFT.md` §7, ревизия в M-X.7a финализируется).
- DEC-LIB-K11 (Library = unified projection of IndexedDB grouped by ownership zones) — promote в ⚓ после acceptance M-X.7a.
- DEC-IMP-13 (PreImport flow reuse) — AddModal интегрируется через него.

---

## 2. Стратегия

Создаём `components/Library/` как новый workspace с собственной структурой (Tree + Inspector + AddModal + TopBar). Tree рендерит 3 зоны как derived view над `librarySlice.entries[]` + `projectsSlice.projects[]`. Inspector следует tabbed-паттерну Importer'а — Обзор / Последовательность / Аннотации / История(N) — но Последовательность и Аннотации **всегда readOnly в Library** (edit идёт через Container Window). Версионирование вынесено в M-X.7b: tab История = placeholder с counter.

`librarySlice` расширяется fields zone/projectId/inLabStock/manualEditFlag/parentEntryId/parentEntryHash без breaking changes (lazy migration в hydrate). Существующие callsites (Importer CatalogColumn, ImportConfirm flow) продолжают работать.

`App.jsx` получает top-level route `library` — landing default при загрузке app (вытесняет старый landing). `canvas.activeFullscreen` остаётся для Container Window и DAG fullscreen — Library это **не** fullscreen, а корневой view рядом с Construct.

---

## 3. Scope

### 3.1 IN

- **Tree:** 3 зоны (`⚐ Без проекта` / `📦 .bodge` archives / `🧬 Лабораторный пул`), sub-row структура `.bodge`, mini-lineage в строках, filter в дереве, drag-drop (move/clone/copy-out/blocked), folder create/rename/delete (только в Loose), context-menu actions.
- **Inspector:** header с context banner (per zone цвет + текст-правило), tab bar Обзор / Последовательность / Аннотации / История(N), ActionRow per-zone, lineage trail в Обзоре, readOnly Sequence/Annotations через reuse Importer'овских компонентов, История = placeholder с counter.
- **AddModal:** 4 source tiles (Файл / Вставить последовательность / Каталог / Из другого .bodge), target zone picker (3 radio), default per источник, интеграция с PreImport flow (DEC-IMP-13).
- **librarySlice extension** + migration heuristic (idempotent hydrate).
- **App.jsx routing:** library = top-level workspace, default landing.
- **App-level top-bar:** app branding слева, breadcrumb «Активный проект: <name>» центр, простой text-фильтр справа (поиск по `entry.name`).
- **Lab pool:** promote/demote toggle, PrimerUsage counter inline в meta-line, sequence-match подсветка между cross-project primer и lab-stock entry.
- **Drag-семантика:** cursor state per drop target, tooltip с операцией (move/clone/copy-out/blocked), drop guards.
- **Read-only markers** для импортированных `.bodge`: heading lock-icon + cursor not-allowed на rows.

### 3.2 OUT (отложено)

- **Версионирование (M-X.7b):** содержимое таба История, version-actions (`Сохранить как версию`, `Manual-edit ветка`, `Откатить`, `Ветка от этого`). M-X.7a показывает counter + placeholder + disabled actions.
- **Cross-project import wizard (M-X.9):** AddModal source `Из другого .bodge` triggers stub modal «В разработке (M-X.9)». Остальные 3 источника полнофункциональны.
- **«Открыть как активный проект» switch (M-X.9):** action в read-only `.bodge` action-row — показан, при клике alert «В разработке (M-X.9)». Импорт `.bodge` в read-only зону работает (для view), edit-переключение не работает.
- **Command palette ⌘K (M-X.7c):** в M-X.7a search field — простой text-фильтр по name. ⌘K hotkey + length-pattern (`>5kb`) + feature-filter (`CDS`) — отложены.
- **Group projects (post-M-I):** один agent одновременно — DEC-V2-29 не пересекается.
- **Mobile layout:** out-of-scope per DEC-V2-19.
- **Multi-select / box-select:** M-X.10+.

### 3.3 Боковые эффекты на существующий код

- `Importer` CatalogColumn группа «Моя библиотека» остаётся работоспособной в M-X.7a (читает ту же `librarySlice.entries[]`, новые fields ей безразличны). После acceptance M-X.7a Importer Library группа становится потенциально redundant — флаг для M-X.6 cleanup.
- `librarySlice.entries` API стабилен. Existing callsites (`addLibraryEntry`, `checkLibraryDedup`, `getSuggestedLibraryName`, `selectVisibleLibraryEntries`, `selectAllLibraryTags`) — без breaking changes.
- Тесты, тестирующие старую LibraryTree (v0.5 либо v0.6.4 wiped era): помечаются `.skip` либо удаляются, если обновление сложное (Code решает).
- Старые landing screens / quick-start panels — Library теперь default landing, эти экраны переезжают как secondary actions в Library workspace либо удаляются (Code оценивает в K5).

---

## 4. Архитектурные решения

**DEC-MX7A-01 — Library = top-level workspace, не fullscreen route.**
Library — корневой view приложения, default landing после загрузки app. Не nested под `canvas.activeFullscreen`. `App.jsx` корневой switch: `{ 'library' | 'construct' | 'flow' | + fullscreen overlay }`. Library workspace — `state.workspace.active === 'library'`. Конкретизирует DEC-IMP-06 («primary» → «default landing»).

**DEC-MX7A-02 — librarySlice расширяется без breaking changes через lazy migration.**
Новые fields в LibraryEntry: `zone: 'loose'|'project'|'lab_pool'`, `projectId?: UUID`, `inLabStock?: boolean`, `manualEditFlag?: boolean`, `parentEntryId?: UUID`, `parentEntryHash?: string`. Hydrate-time `migrateLibraryEntry(entry, projects)` идемпотентен. Heuristic:

1. Если `entry.zone` уже set — return entry (no-op).
2. Иначе если `entry.tags` содержит `'Lab'` или `'In freezer'` — `zone='lab_pool'`, `inLabStock = (tags includes 'In freezer')`.
3. Иначе если существует `project` с `containerIds.includes(entry.resourceId)` либо `primerIds.includes(entry.resourceId)` — `zone='project'`, `projectId=<тот project.id>`.
4. Иначе — `zone='loose'`.

Loss-of-data acceptable (entries без явного projectId уезжают в Loose). Migration logged через `migratedCount` per zone в console на dev mode.

**DEC-MX7A-03 — `.bodge` папки в дереве — derived view, не отдельные records.**
Папка `📦 ProjectName.bodge` рендерится из `projectsSlice.projects[]` через selector `selectProjectsForTree() → [{id, displayName, isActive, isReadOnly, fileHandle?}]`. Sub-rows DAG/Контейнеры/Праймеры — derived через `selectContainersByProject(projectId)` и `selectPrimersByProject(projectId)`. Project entity с `kind='project'` остаётся source-of-truth.

**DEC-MX7A-04 — Library Inspector — новый компонент, не extend Importer Inspector.**
`components/Library/Inspector/Inspector.jsx` импортирует `SequenceMapView` и `AnnotationEditor` из `components/Importer/inspector/` с props `{readOnly: true}`. Reasons: разный action set, разные tabs (нет «Обзор» в Importer'е, есть «История» в Library), разная семантика context banner. Изоляция позволяет независимо эволюционировать. Стоимость — некоторое дублирование tab-bar boilerplate (~50 строк, acceptable).

**Допущение:** `SequenceMapView` и `AnnotationEditor` принимают prop `readOnly`. Если нет — Code добавляет prop в существующие компоненты с default `false` (no-op для existing Importer callsites). См. R1.

**DEC-MX7A-05 — Tab «История» в M-X.7a показывает counter но не контент.**
Counter `commits.length` доступен из `MoleculeContainer.commits[]` независимо от UI-семантики версионирования. Если `commits.length === 0` — таб скрыт целиком. Если `> 0` — таб виден с числом-counter (как у дизайнера: «История 3»), контент = placeholder card «Список коммитов и version-actions — M-X.7b». Version-actions в ActionRow рендерятся с `disabled={true}` и `tooltip='M-X.7b: версионирование'`.

**DEC-MX7A-06 — Action-row через таблицу `{zone × kind} → actions[]`.**
Helper `lib/library-actions.js` экспортирует `getActionsFor(selection)` returning `Action[]`, где `Action = {key, label, variant: 'primary'|'outline'|'destructive', disabled?, tooltip?, onClick}`. Inspector рендерит `<ActionRow actions={...}/>` без знания о составе. Изменение action set per zone — изменение в helper'е, не в UI компоненте.

**DEC-MX7A-07 — Context banner в Inspector header — обязательный элемент.**
`getInspectorBanner(selection)` returning `{tone, icon, text}` либо `null` (zone heading). Tones: `neutral` (Loose), `warning` (active `.bodge`), `danger` (read-only `.bodge`), `info` (Lab pool). Banner persistent (не dismissable). Это правило-в-одну-строку которое биолог видит до того как пытается сделать что-то невозможное в зоне. Полная таблица — §5.4.

**DEC-MX7A-08 — Inline read-only баннер на табах Sequence/Annotations.**
На активном табе Последовательность либо Аннотации сверху над контентом — persistent inline banner: «🔒 Просмотр read-only. Edit аннотаций / последовательности — в Container Window.» с кликабельной link `→ Container Window`. Не toast при попытке edit. Proactive UX.

**DEC-MX7A-09 — Drag-семантика per drop target с явным cursor state.**
Drop matrix:

| Drag from | Drop to | Operation | Cursor |
|-----------|---------|-----------|--------|
| Loose item | Loose folder | `move` | `move` |
| Loose item | активный `.bodge` `📥 Контейнеры` | `clone` | `copy` |
| активный `.bodge` item | Loose | `copy-out` (новый entry с origin=`project_extract`) | `copy` |
| read-only `.bodge` item | anywhere | blocked | `not-allowed` |
| `🧬 Праймеры` `.bodge` | Lab pool «В лаборатории» | `promote` (toggle inLabStock=true) | `copy` |
| Lab pool primer | anywhere outside lab | blocked | `not-allowed` |

Cursor state определяется в `onDragOver` через `getDropOperation(source, target)`; tooltip с operation label через CSS либо HTML title.

**DEC-MX7A-10 — Mini-lineage в строках tree рендерится из origin.kind.**
Helper `getOriginSummary(entry)` returning string per `origin.kind`:

- `file_import` → `«↑ <filename>»` (truncate 24 chars)
- `paste` → `«↑ paste · <date>»`
- `catalog` → `«↑ <vendor> / <catalogId>»`
- `library_clone` → `«<source-bodge-name> / <source-name>»`
- `cross_project_clone` → `«🔗 <source-bodge-name> · <date>»`
- `manual_edit` → `«✎ создан вручную»`
- `manual_create` → `«✎ создан с нуля»`
- `project_commit` → `null` (не показывается в плоском списке Контейнеры — это PCR/Gibson product, виден только в DAG view)

Render под именем item'а в `ItemRow`, 11px secondary-text. Truncate с ellipsis если шире доступного места.

**DEC-MX7A-11 — App-level top-bar в M-X.7a = простой text-фильтр.**
`<LibraryTopBar>` сверху Library workspace: app branding слева (`b. BodgeGene`), breadcrumb «Активный проект: <name>» с status indicator («сохранён» / «не сохранён»), простой search field справа. Search фильтрует tree по `entry.name` (case-insensitive substring). ⌘K hotkey + length-pattern (`>5kb`) + feature-filter (`CDS`) — отложены в M-X.7c. Hint placeholder `Поиск по библиотеке…` без command palette syntax.

**DEC-MX7A-12 — Sequence-match подсветка между cross-project primer и lab-stock entry.**
`📚 Из чужих проектов` primer entry с `entry.resourceHash` matching lab-stock primer'у — small badge / icon на cross-project entry: «совпадает с <lab-stock-name>». Hash-match через `entry.resourceHash === labStockEntry.resourceHash`. UI-only feature, без silent auto-merge (биолог сам решает promote через explicit action).

---

## 5. По задаче

### 5.1 Файлы

**Новые:**

```
gui/designer/src/
├── components/
│   └── Library/
│       ├── Library.jsx                       — корневой workspace (~4 KB)
│       ├── LibraryTopBar.jsx                 — app branding + breadcrumb + search (~3 KB)
│       ├── Tree/
│       │   ├── LibraryTree.jsx               — drag-drop корневой контейнер (~6 KB)
│       │   ├── ZoneHeader.jsx                — heading зоны + collapse toggle (~2 KB)
│       │   ├── ItemRow.jsx                   — строка container/primer + mini-lineage (~4 KB)
│       │   ├── FolderRow.jsx                 — папка Loose с children (~3 KB)
│       │   ├── ProjectFolder.jsx             — `📦` папка с DAG/Контейнеры/Праймеры sub-rows (~4 KB)
│       │   └── LabPoolSection.jsx            — Lab pool с двумя секциями (~3 KB)
│       ├── Inspector/
│       │   ├── Inspector.jsx                 — корневой Inspector (~4 KB)
│       │   ├── InspectorHeader.jsx           — name + meta-line + breadcrumb (~2 KB)
│       │   ├── InspectorBanner.jsx           — context banner (~2 KB)
│       │   ├── InspectorTabs.jsx             — tab bar (~2 KB)
│       │   ├── tabs/
│       │   │   ├── OverviewTab.jsx           — lineage + preview + metadata (~5 KB)
│       │   │   ├── SequenceTab.jsx           — wrapper SequenceMapView readOnly + inline banner (~2 KB)
│       │   │   ├── AnnotationsTab.jsx        — wrapper AnnotationEditor readOnly + inline banner (~2 KB)
│       │   │   └── HistoryTab.jsx            — placeholder в M-X.7a (~2 KB)
│       │   ├── LineageTrail.jsx              — chain of origins (~3 KB)
│       │   └── ActionRow.jsx                 — per-zone actions render (~2 KB)
│       └── AddModal/
│           ├── AddModal.jsx                  — корневой modal (~3 KB)
│           ├── SourceTiles.jsx               — 4 source tiles (~3 KB)
│           ├── TargetZonePicker.jsx          — 3 radio (~2 KB)
│           └── sources/
│               ├── FileSourceFlow.jsx        — file picker + format detect (~3 KB)
│               ├── PasteSourceFlow.jsx       — textarea + format detect (~3 KB)
│               ├── CatalogSourceFlow.jsx     — reuse CatalogColumn data (~3 KB)
│               └── CrossProjectStub.jsx      — placeholder M-X.9 (~1 KB)
├── lib/
│   ├── library-actions.js                    — getActionsFor / getInspectorBanner / canDrop / getDropOperation (~6 KB)
│   ├── library-origin.js                     — getOriginSummary + getLineageChain (~3 KB)
│   └── library-migration.js                  — migrateLibraryEntry + migrateAllEntries (~2 KB)
├── store/
│   └── workspaceSlice.js                     — top-level workspace router (~2 KB)
└── __tests__/
    ├── components/Library/                   — component tests
    ├── lib/library-actions.test.js
    ├── lib/library-origin.test.js
    ├── lib/library-migration.test.js
    └── store/workspaceSlice.test.js
```

**Модифицируемые:**

```
gui/designer/src/
├── App.jsx                                   — top-level routing (+1 KB)
├── store/librarySlice.js                     — fields + new actions + selectors (+3 KB)
├── store/canvasSlice.js                      — workspace coordination (+0.5 KB if needed)
├── lib/strings.js                            — STRINGS.library namespace (+2 KB)
└── components/Importer/inspector/
    ├── SequenceMapView.jsx                   — readOnly prop если ещё не есть (+0.3 KB)
    └── AnnotationEditor.jsx                  — readOnly prop если ещё не есть (+0.3 KB)
```

### 5.2 Helper signatures

`lib/library-actions.js`:

```javascript
// Selection: { kind: 'container'|'primer'|'folder'|'project-row', zone, entry?, project?, isReadOnlyProject? }

export function getActionsFor(selection): Action[]
// Action = { key, label, variant: 'primary'|'outline'|'destructive', disabled?: boolean, tooltip?: string, onClick: () => void }
// Полная таблица — §5.4.

export function getInspectorBanner(selection): Banner | null
// Banner = { tone: 'neutral'|'warning'|'danger'|'info', icon: string, text: string }
// Полная таблица — §5.5.

export function canDrop(source, target): boolean
// source, target: { zone, kind, projectId?, isReadOnly? }

export function getDropOperation(source, target): 'move' | 'clone' | 'copy-out' | 'promote' | null
// null = blocked, cursor not-allowed.
```

`lib/library-origin.js`:

```javascript
export function getOriginSummary(entry): string | null
// Returns short string for tree mini-lineage. null для project_commit kind.

export function getLineageChain(entry, library, projects): LineageStep[]
// LineageStep = { kind, location: string, when: ISO8601, agent?: { name, email }, isCrossProject?: boolean }
// Resolves cross_project_clone references through projects[] (либо string fallback если original недоступен).
```

`lib/library-migration.js`:

```javascript
export function migrateLibraryEntry(entry, projects): LibraryEntry
// Idempotent. Returns extended entry либо unchanged.

export function migrateAllEntries(entries, projects): { entries: LibraryEntry[], migratedCount: { loose: N, project: N, lab_pool: N } }
// Bulk migration в slice hydrate. Logs migratedCount в console на dev mode.
```

`store/librarySlice.js` — новые actions / selectors:

```javascript
// Existing API preserved. New:
moveEntryToFolder(entryId, targetTagPath)            // Loose folder change через tags slash-path
cloneEntryToActiveProject(entryId)                   // DEC-MX7A-09 clone op
extractEntryToLoose(projectId, entryId)              // copy-out
toggleLabStock(entryId)                              // promote/demote primer
createLooseFolder(folderPath)                        // только в Loose
renameLooseFolder(oldPath, newPath)                  // только в Loose, batch update tags
deleteLooseFolder(folderPath, options)               // только в Loose, confirm dialog

// Selectors:
selectEntriesByZone(zone)                            // filter zone field
selectContainersByProject(projectId)                 // project's `📥 Контейнеры`
selectPrimersByProject(projectId)                    // project's `🧬 Праймеры`
selectLooseTreeStructure()                           // build folder tree from Loose entries (slash-paths)
selectLabPoolStructure()                             // split into «В лаборатории» / «Из чужих проектов»
selectPrimerUsageCount(primerId)                     // PrimerUsage rendering inline
selectMatchingLabStockPrimer(crossProjectEntry)      // sequence-match подсветка (DEC-MX7A-12)
```

`store/workspaceSlice.js`:

```javascript
state: {
  active: 'library' | 'construct' | 'flow',          // top-level workspace
  history: ['library', 'construct'],                 // back-навигация для breadcrumb
}

actions: {
  setActiveWorkspace(name)
  goBack()                                           // pop history
}

selectors: {
  selectActiveWorkspace()
  selectIsInLibrary()
}
```

### 5.3 Component contracts

`<Library>` — children — корневой workspace. Рендерит `<LibraryTopBar>` + split-pane `<LibraryTree>` | `<Inspector>`. Selection state в `uiSlice.libSelection` (persists между рендерами, не теряется при перерендере Tree).

`<LibraryTree onSelect={(selection) => ...} selection={current}>` — render 3 зоны через `<ZoneHeader>` + соответствующие children. Drag-drop на root level (handles cross-zone drops).

`<Inspector selection={...}/>` — заголовок (`<InspectorHeader>` + `<InspectorBanner>`) + tab bar (`<InspectorTabs>`) + active tab content. Tab state local в самом Inspector (`useState('overview')`). Tab persistence: тот же selection после повторного select → последний tab; новый selection → reset на `overview`.

`<InspectorBanner banner={getInspectorBanner(selection)}/>` — null banner = no render.

`<ActionRow actions={getActionsFor(selection)}/>` — render список action buttons с variants. Empty actions array = no render.

`<AddModal open={bool} onClose={() => ...} defaultSource={'file'|'paste'|'catalog'|'cross-project'} defaultTarget={'project'|'loose'|'lab'}/>` — multi-step (source → target → preview wizard через DEC-IMP-13 reuse).

### 5.4 Action table per zone

Полная таблица для `getActionsFor`:

#### Container в Loose (zone='loose')

| Action key | Variant | Label | Disabled when |
|------------|---------|-------|---------------|
| `useInActive` | primary | «Использовать в активном» | no active project → disabled, tooltip «Откройте проект» |
| `open` | outline | «Открыть» | — |
| `manualEditBranch` | outline | «Manual-edit ветка» | always (M-X.7b → disabled, tooltip «M-X.7b: версионирование») |
| `moveToFolder` | outline | «Переместить» | — |
| `export` | outline | «Экспорт» | — |
| `delete` | destructive | «Удалить» | — |

#### Container в активном `.bodge` (zone='project', isReadOnlyProject=false)

| Action key | Variant | Label | Disabled when |
|------------|---------|-------|---------------|
| `openContainerWindow` | primary | «Container Window» | — |
| `useInDag` | outline | «Использовать в DAG» | — (точная семантика — OQ3, реализация в K3, TD «primer wizard integration») |
| `extractToLoose` | outline | «Извлечь в Loose» | — |
| `saveAsVersion` | outline | «Сохранить как версию» | always (M-X.7b → disabled, tooltip) |
| `removeFromProject` | destructive | «Удалить из проекта» | — |

#### Container в read-only `.bodge` (zone='project', isReadOnlyProject=true)

| Action key | Variant | Label | Disabled when |
|------------|---------|-------|---------------|
| `copyToActive` | primary | «Скопировать в активный» | no active project → disabled |
| `copyToLoose` | outline | «Скопировать в Loose» | — |
| `openAsActive` | outline | «Открыть как активный проект» | always (M-X.9 → onClick alert «В разработке») |
| `view` | outline | «Просмотр» | — |

#### Primer в Lab pool (zone='lab_pool')

| Action key | Variant | Label | Disabled when |
|------------|---------|-------|---------------|
| `useInProject` | primary | «Использовать в проекте» | no active project → disabled, tooltip |
| `editNotes` | outline | «Редактировать заметки» | — |
| `toggleLabStock` | outline | «Снять метку «в лаборатории»» либо «Промотить в лабораторию» (depends on `inLabStock`) | — |
| `delete` | destructive | «Удалить» | — |

#### Primer в активном `.bodge` (zone='project', kind='primer', isReadOnlyProject=false)

| Action key | Variant | Label | Disabled when |
|------------|---------|-------|---------------|
| `openInWizard` | primary | «Открыть в Primer Wizard» | — |
| `promoteToLab` | outline | «В лабораторию» | — |
| `removeFromProject` | destructive | «Удалить из проекта» | — |

#### Folder в Loose (kind='folder')

| Action key | Variant | Label | Disabled when |
|------------|---------|-------|---------------|
| `renameFolder` | primary | «Переименовать» | — |
| `addToFolder` | outline | «Добавить сюда» | open AddModal с pre-filled target path |
| `deleteFolder` | destructive | «Удалить папку» | confirm dialog с warning о нелезаемых items |

### 5.5 Banner table per zone

Для `getInspectorBanner`:

| Selection | Tone | Icon | Text |
|-----------|------|------|------|
| Container в Loose | `neutral` | `flag` | «⚐ Без проекта · свободная зона · sequence frozen» |
| Container в активном `.bodge` | `warning` | `package` | «📦 Активный проект · изменения сохраняются в `<name>.bodge`» |
| Container в read-only `.bodge` | `danger` | `lock` | «🔒 Read-only · импортированный проект · `<name>.bodge`» |
| Primer в активном `.bodge` | `warning` | `package` | «📦 Активный проект · изменения сохраняются в `<name>.bodge`» |
| Primer в Lab pool «В лаборатории» | `info` | `flask` | «🧬 Лабораторный пул · primer в морозильнике» |
| Primer в Lab pool «Из чужих проектов» | `info` | `flask` | «🧬 Лабораторный пул · `inLabStock: false` — можно промотить кнопкой» |
| Folder в Loose | `neutral` | `flag` | «⚐ Без проекта / `<folder-path>`» |
| Zone heading selected | hidden | — | (no banner) |

### 5.6 Tests

Целевой объём: **+30-40 unit / +15-20 component / +8-12 integration**. Характерные:

`__tests__/lib/library-migration.test.js` (+8 unit):
- `migrateLibraryEntry` идемпотентен — entry с `zone` уже set не меняется
- Tag `Lab` → `zone='lab_pool'`, `inLabStock=false`
- Tags `['Lab', 'In freezer']` → `zone='lab_pool'`, `inLabStock=true`
- Entry чей resourceId в `project.containerIds` → `zone='project'`, `projectId` set
- Entry без matches → `zone='loose'`
- `migrateAllEntries` возвращает корректный `migratedCount` per zone
- Tag-priority: `Lab` побеждает `containerIds match` (примеры edge cases)

`__tests__/lib/library-actions.test.js` (+12 unit):
- `getActionsFor` для каждого `{zone × kind}` возвращает correct labels из таблицы §5.4
- `saveAsVersion` / `manualEditBranch` всегда disabled в M-X.7a
- `useInActive` disabled когда нет активного проекта
- `copyToActive` disabled когда нет активного проекта в read-only context
- `canDrop` blocks drag из read-only `.bodge` в любую цель
- `canDrop` allows move внутри Loose folder
- `getDropOperation` returns 'clone' для Loose → активный `.bodge`
- `getDropOperation` returns 'copy-out' для активный `.bodge` → Loose
- `getInspectorBanner` per zone returns correct tone/text

`__tests__/lib/library-origin.test.js` (+6 unit):
- `getOriginSummary` для каждого `origin.kind` returns expected string
- `project_commit` returns null
- Truncation для длинных filenames
- `getLineageChain` resolves cross_project_clone refs через projects[]
- `getLineageChain` falls back на string если original проект недоступен

`__tests__/components/Library/Tree/LibraryTree.test.jsx` (+8 component):
- 3 зоны рендерятся в правильном порядке (Loose → `.bodge` archives → Lab pool)
- Selection item'а триггерит `onSelect` с правильным `selection`
- Drag из Loose в Loose folder → `moveEntryToFolder` called
- Drop из Loose в активный `.bodge` → `cloneEntryToActiveProject` called
- Drag из read-only `.bodge` blocked (cursor not-allowed)
- Mini-lineage рендерится для каждого `origin.kind`
- Filter в дереве (text-search) фильтрует by `entry.name`

`__tests__/components/Library/Inspector/Inspector.test.jsx` (+10 component):
- Default tab — `Обзор` при первом select
- Tab persistence: повторный select того же → последний tab; новый select → reset на `Обзор`
- Tab «История» виден если `commits.length > 0`, скрыт если 0
- Tab «История» в M-X.7a показывает placeholder
- Context banner per zone рендерится с правильным tone
- Inline read-only banner на табах Sequence / Annotations
- ActionRow рендерит правильный набор для каждого zone
- `saveAsVersion` / `manualEditBranch` buttons disabled с tooltip
- Action `useInActive` disabled когда нет активного проекта

`__tests__/components/Library/AddModal/AddModal.test.jsx` (+5 component):
- 4 source tiles рендерятся
- Cross-project tile → stub modal «В разработке (M-X.9)»
- Default target zone per источник из таблицы DEC-MX7A-09
- «Далее» → integration с PreImport flow (DEC-IMP-13)
- Esc / click outside closes modal без сохранения

`__tests__/components/Library/Library.integration.test.jsx` (+5 integration):
- Открытие app (пустая IndexedDB) → Library default landing с empty state
- Импорт файла через AddModal → entry попадает в выбранную zone
- Selection в tree → Inspector рендерит correct content
- Promote primer в lab pool — toggle reflected в обоих местах (UI + librarySlice)
- Drag container из Loose в активный `.bodge` создаёт clone в `📥 Контейнеры`

Plus regression-guard:
- Importer CatalogColumn «Моя библиотека» group остаётся работоспособным (читает ту же librarySlice).
- ImportConfirm flow legacy callsites не сломаны.
- Existing tests librarySlice (basic CRUD operations) — green.

---

## 6. Порядок выполнения

K-step список:

### K1 — Data model + migration

- `librarySlice.js` extend (fields + new actions + selectors).
- `library-migration.js` + tests.
- `workspaceSlice.js` создание + тесты.
- `lib/library-actions.js` начальная version с `getActionsFor` / `getInspectorBanner` / `canDrop` / `getDropOperation`.
- `lib/library-origin.js` + `getOriginSummary` + `getLineageChain`.
- Тесты: +8 (migration) +12 (actions) +6 (origin) +3 (workspace) = +29 unit.
- Артефакты K1: 4 новых файла + delta `librarySlice.js` ~+3 KB.

### K2 — Tree component

- `Library.jsx` корневой layout.
- `LibraryTopBar.jsx` (app branding + breadcrumb + simple search).
- `LibraryTree.jsx` с drag-drop корневой контейнер.
- `ZoneHeader.jsx` / `ItemRow.jsx` / `FolderRow.jsx` / `ProjectFolder.jsx` / `LabPoolSection.jsx`.
- Mini-lineage rendering inline в `ItemRow`.
- Drag-drop integration с `canDrop` + `getDropOperation`.
- Folder context-menu (создать / переименовать / удалить — только в Loose).
- Read-only markers для импортированных `.bodge`.
- Тесты: +8 component (LibraryTree.test).
- Артефакты K2: 8 новых файлов в `components/Library/` (root + Tree/).

### K3 — Inspector + tabs

- `Inspector.jsx` + `InspectorHeader.jsx` + `InspectorBanner.jsx` + `InspectorTabs.jsx`.
- Tab компоненты: `OverviewTab.jsx` (lineage + preview + metadata), `SequenceTab.jsx` (wrapper), `AnnotationsTab.jsx` (wrapper), `HistoryTab.jsx` (placeholder).
- `LineageTrail.jsx` с chain rendering.
- `ActionRow.jsx` с variant-styled кнопками.
- Inline read-only banner на табах Sequence / Annotations.
- Tab persistence logic (selection-aware).
- **R1: Code проверяет prop `readOnly` в SequenceMapView / AnnotationEditor.** Если нет — добавляет с default false. Если внутри много hard-coded edit-логики — STOP коммита K3, эскалация.
- Тесты: +10 component (Inspector.test).
- Артефакты K3: 11-12 новых файлов в `components/Library/Inspector/` + delta SequenceMapView/AnnotationEditor если нужно.

### K4 — AddModal

- `AddModal.jsx` корневой.
- `SourceTiles.jsx` + `TargetZonePicker.jsx`.
- 4 source flow компоненты: File / Paste / Catalog / CrossProject (stub).
- Default target per источник из DEC-MX7A-09 таблица.
- Integration с PreImport flow (DEC-IMP-13 reuse).
- Тесты: +5 component.
- Артефакты K4: 7 новых файлов в `components/Library/AddModal/`.

### K5 — App routing + landing

- `App.jsx` top-level switch для workspace.
- `workspaceSlice` integration.
- Default landing на Library (вытесняет старый landing — Quick Start panel etc).
- Open project в `projectSlice.openProjectFromIndexedDB` обновляет workspace но остаётся в Library; активный проект `📦` появляется как папка в Tree.
- Construct (DAG) и Container Window остаются доступны через actions / breadcrumb.
- Старые landing screens / quick-start panels — оценка Code: переезжают как secondary actions (например в `LibraryTopBar`) либо удаляются.
- Тесты: +5 integration (Library.integration.test).
- Артефакты K5: delta `App.jsx` + `workspaceSlice.js` finalization.

### K6 — STRINGS + Lab pool details + edge cases

- `lib/strings.js` namespace `STRINGS.library` — все labels EN + RU mirror (DEC-MA2-01).
- Lab pool: PrimerUsage rendering inline (`used in N проектах`) + sequence-match подсветка (DEC-MX7A-12).
- Empty states per zone.
- Hover/focus states polish.
- Read-only markers (lock icon + cursor not-allowed на rows).
- prefers-reduced-motion для drag-drop animations.
- Тесты: +5-7.
- Артефакты K6: delta `strings.js` + edge polish across K2-K4 файлов.

---

## 7. STOP-условие

После K1-K6 commits Code останавливается на ветке `feature/m-x-7a-library-structure`:

> «K1-K6 landed. Финальные счётчики: Vitest XXX passing, pytest 112/112 passing. Build clean. Жду визуальной приёмки M-X.7a — не финализирую PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT.»

**Не финализировать:**
- `PROJECT_STATE.md` (журнал сессии + first-line) — только после acceptance.
- `RELEASES.md`.
- `DECISIONS.md` (DEC-MX7A-01..12 уже в спеке, promotion в DECISIONS только после acceptance).
- `ANCHORS.md` (no ⚓ promotions без явного запроса Игоря; DEC-LIB-K11 — кандидат, решает Игорь).
- `TECH_DEBT.md` (новые TD только если Code обнаружил соответствующие в процессе).
- `BUGS.md` (только если найден existing bug — добавить в OPEN, не закрывать ничего).

---

## 8. Формат отчёта Code

В конце реализации Code дописывает в `CURRENT_TASK.md` секцию «Отчёт K1-K6»:

1. **Коммит-хэши** по каждому K-step (~6 hashes).
2. **Финальные счётчики:** Vitest passing/total, pytest 112/112, build status, PWA precache size delta.
3. **Размеры новых файлов** — таблица с топ-15 крупнейших новых файлов в `components/Library/`.
4. **Отклонения от спеки** — явный блок «Что отличается от §3-§5 спеки», конкретно:
   - Split K на под-коммиты.
   - Decisions Code где спека была неоднозначной (особенно OQ1 workspaceSlice scope).
   - Mismatch размеров файлов от §5.1 targets.
   - Нашёл ли Code prop `readOnly` в SequenceMapView / AnnotationEditor готовым либо добавлял (R1).
   - Workspace scope — отдельный slice либо append в canvasSlice (OQ1).
5. **Hard violation flag** — если хоть один файл влез в hard зону (40 KB .jsx / 25 KB .js) — explicit red flag с предложением декомпозиции в M-X.7c.
6. **TD-pencil-marks:**
   - Если Code обнаружил dead Library code старой версии (TD-LIB-K2-DEAD-CODE-PURGE) — отметить состояние (purged / not found / partial).
   - Если Importer CatalogColumn «Моя библиотека» group теперь redundant — флаг для M-X.6 cleanup.
   - Если SequenceMapView / AnnotationEditor требуют значительных изменений для readOnly mode — TD «readOnly mode hardening».
7. **Migration heuristic результаты** — на dev fixture сколько entries попало в каждую зону (`{ loose: N, project: N, lab_pool: N }`).

---

## 9. Риски

**R1. SequenceMapView / AnnotationEditor могут не иметь `readOnly` prop готовым.**
Митигация: K3 первая задача — Code проверяет существующие props. Если нет — добавляет с default `false`, no-op для existing callsites Importer'а. Существующие тесты Importer'а должны продолжить работать. Если внутри компонентов много edit-логики hard-coded — Code может обнаружить что добавление prop требует значительного рефакторинга. В этом случае STOP коммита K3, эскалация Игорю — возможно вынос readOnly mode в M-X.7c.

**R2. workspaceSlice конфликт с canvasSlice.**
Текущая архитектура: `canvas.activeFullscreen` управляет fullscreen overlay'ями. Новый `workspaceSlice.active` управляет top-level workspace. Конфликт: если active='library' но canvas.activeFullscreen='containerWindow' — что показывается?
Митигация: workspace = root, fullscreen = overlay. Library с открытым Container Window fullscreen-overlay'ем означает «биолог в Library, но Container Window перекрыл view». Это валидная конфигурация (он закроет Container Window — вернётся в Library). При смене workspace на Construct из Library — fullscreen закрывается автоматически.

**R3. Migration heuristic ошибается для legacy entries.**
Currently `librarySlice.entries[]` не имеет `zone` field. После migration тегированные `Lab` entries попадают в lab pool, остальные — в Loose. Если у биолога есть entries которые он мысленно ассоциирует с проектом, но resourceId не matched ни одному `project.containerIds` — entry уходит в Loose.
Митигация: Migration idempotent + visible — после первого hydrate новые fields persist в IndexedDB через autosave. Биолог может вручную перетащить misplaced entries. Логирование `migratedCount` per zone в console на dev mode — для отладки.

**R4. AddModal CrossProject stub vs full.**
Source tile «Из другого .bodge» в M-X.7a показывает stub modal. Биолог пытается импортировать чужой `.bodge` через AddModal → видит «В разработке (M-X.9)». Workaround в M-X.7a — импорт через File source с `.bodge` extension работает (это создаёт read-only project entry в Library tree).
Митигация: hint в stub modal — «Используйте Файл → выберите `.bodge` для импорта проекта». Cross-project clone container в активный — сценарий M-X.9.

**R5. История tab placeholder vs hidden — counter без контента.**
M-X.7a показывает counter но контент = placeholder. Если `commits.length === 0` — таб скрыт. Если `> 0` — таб виден с counter, но контент = placeholder. Биолог может удивиться: «История есть (число рядом), но при клике пустота».
Митигация: placeholder text явный «Список коммитов и version-actions — M-X.7b». Counter оставить как есть (показывает что данные в model присутствуют). После M-X.7b placeholder заменится реальным списком, counter останется.

**R6. Folder operations в Loose требуют DEC-CAT-04 (slash-paths) integration.**
Папки Loose реализованы через `entry.tags` со slash-paths (`Folder/Subfolder`). Создание папки = добавление tag с этим path первому entry в папке.
Митигация: Code решает в K2 — folder = derived view над tags (folder без entries не существует). Edge case: пустая папка после move последнего item'а исчезает. Это feature, не bug. Empty folder создаётся только в момент drop первого item'а в неё (или через `+ Add` с target folder pre-selected). Альтернатива (separate folders table) — overengineering, не делаем.

**R7. Drag из активного `.bodge` в Loose — копирование с какой семантикой origin?**
DEC-MX7A-09 говорит «copy-out» с `origin.kind = 'project_extract'` (новый kind). Этого kind нет в LIBRARY_MODEL_DRAFT §2.2 origin discriminated union. Нужно расширение data model.
Митигация: K1 добавляет `'project_extract'` в Origin union с полями `{ kind: 'project_extract', sourceProjectId, sourceContainerId, sourceContainerHash, extractedAt }`. Mini-lineage helper обновляется. Это micro-extension, не нарушает backward compat.

**R8. Top-bar breadcrumb «Активный проект» когда нет активного проекта.**
Биолог только что открыл app, ни один проект не активный. Что в breadcrumb?
Митигация: «Активный проект: —» либо «Без активного проекта». При попытке action типа «Использовать в активном» — disabled с tooltip «Откройте проект через `+ Add`». OK для M-X.7a.

---

## 10. Открытые вопросы

**OQ1 — workspaceSlice scope.**
Стоит ли создавать новый `workspaceSlice`, либо append поле `state.canvas.activeWorkspace` в existing `canvasSlice`?
- Pros workspaceSlice: clean separation, легче тестировать в изоляции.
- Pros append в canvasSlice: меньше boilerplate, координация workspace ↔ fullscreen в одном месте.

**Решение Code в K1.** Спека описывает требуемое поведение, не структуру.

**OQ2 — Folder создание от первого drop'а vs explicit «Новая папка».**
Биолог может создать папку:
(а) Drag первого item'а в zone root + dialog «куда положить — root либо новая папка <name>?»
(б) Explicit context-menu «Новая папка» на zone heading.

**Спека предлагает (б)** — explicit разумнее. Дизайнер на скрине показал кнопку «Переместить» в action-row Loose item'а — возможно это (а)-flavor, надо уточнить позже. **Решение Code: реализовать (б), добавить TD «folder creation UX iteration» если выяснится что (а) нужнее.**

**OQ3 — primer «Использовать в проекте» semantics.**
В Lab pool action-row primary action — что делает?
(а) Open Primer Wizard с pre-filled primer.
(б) Add primer в активный проект `🧬 Праймеры`, без user input.
(в) Highlight primer в DAG nodes где он используется.

**Спека предлагает (а)** — это аналог `+ Add` flow для primer'а. **Code: реализовать (а), TD «primer wizard integration» если потом изменится семантика.**

**OQ4 — Default landing когда нет ни одного entry.**
Если IndexedDB пустая (первый запуск) — что биолог видит?

**Спека предлагает empty state** «Добавьте первую плазмиду» с большой `+ Add` CTA по центру правого pane. Tree пустой, Inspector пустой. Onboarding nudge — отложить в M-X.7c.

**OQ5 — Default tab при первом select item'а.**
DEC-MX7A-04 говорит default = `Обзор` (lineage trail — ключевая инфа). Альтернатива: запоминать последний активный tab globally.

**Закрыто скрин-приёмкой 08.05.2026: Обзор default.** На скрине дизайнера 2 (Inspector История активна) — это была демонстрация контента таба, не default-state.

**OQ6 — Tab «История» когда `commits.length === 0`.**
- Скрыть таб целиком (DEC-MX7A-05 default).
- Показать таб с empty state «Этот контейнер ещё не редактировался».

**Закрыто скрин-приёмкой 08.05.2026: скрыть.** Counter (число рядом с label таба) корректно отражает что есть в data.

**OQ7 — Action `useInDag` для container в активном `.bodge` — иконка confusing.**
Дизайнер использовал ✎ иконку, но это action не редактирования а «использовать в DAG-операции». В коде используем нейтральную иконку (`arrow-right` либо `flask`).

**Закрыто: Code выбирает иконку при реализации, ✎ заменяется на семантически корректную.**

---

**Дата создания:** 08.05.2026 (после концепт-приёмки дизайна Library.html). **Парные документы:** `LIBRARY_MODEL_DRAFT.md` (data model), `LIBRARY_WIREFRAME_DRAFT.md` rev 3 (rationale), `design_assets/Library.html` (визуальный источник правды).

**Парный спринт:** M-X.7b — Versioning UI. Пишется отдельной спекой когда модель версионирования зафиксирована Игорем.
