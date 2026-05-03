# SPRINT_M-A-3.md — Library minimal CRUD (skeleton)

**Тип задачи (по CHAT_PLAYBOOK §13):** B — фича среднего объёма.
**Статус:** ✅ РЕАЛИЗОВАНО 01.05.2026 (Library skeleton, K1–K5 коммиты `5fcceea`→`1167bba`, 6 коммитов в `feature/racetrack-canvas`, 788/788 Vitest, build clean). Визуальная приёмка PASS на структуру (Topbar / toolbar / empty state / `+ Import` disabled / topology dropdown visibility / tab switcher); группы D-list-rows / E-soft-delete / F-tags-editor / H-persistence — отложенная приёмка после M-B.1 Importer (когда Library наполнится через реальный import; покрыты 10 unit-тестами в `Library.test.jsx`).
**Дата:** 01.05.2026 (третья сессия — спека; четвёртая сессия — финализация и приёмка).
**Зависимости:** M-A core ✅, M-A.1 polish ✅, M-A.2 i18n-prep ✅. M-B.1 Importer — параллельный спринт, не блокер.
**Ветка:** `feature/racetrack-canvas`.

---

## 0. Срез размеров затрагиваемых модулей

Проверка на лимит .jsx 40 KB hard / .js 25 KB hard (DECISIONS.md ⚓ 22.04.2026).

| Файл | Текущий | После M-A.3 | Зона |
|------|---------|-------------|------|
| `db/dexie-schema.js` | 1.43 KB | ~3.0 KB (+1.6) | green |
| `store/librarySlice.js` | — | ~6-8 KB | green |
| `lib/strings.js` | 6.42 KB | ~7.5 KB (+1.1 namespace `library`) | green |
| `components/Library/index.jsx` | — | ~8-10 KB | green |
| `components/Library/LibraryListRow.jsx` | — | ~3-4 KB | green |
| `components/Library/LibraryToolbar.jsx` | — | ~2-3 KB | green |
| `components/Library/TagsInlineEditor.jsx` | — | ~3-4 KB | green |
| `App.jsx` | 9.22 KB | ~9.5 KB (+nav case `library`) | green |
| `components/AppShell/Topbar.jsx` | 5.04 KB | ~5.2 KB | green |

Все новые файлы в green-зоне. Декомпозиции на старте не требуется. Risk-bullet: если `components/Library/index.jsx` перевалит 15 KB при реализации — Code останавливается и просит mini-spec на extract `LibraryFilters.jsx` (но текущий прогноз 8-10 KB, headroom большой).

---

## 1. Контекст

После M-A trifecta (core ✅ + M-A.1 polish ✅ + M-A.2 i18n-prep ✅) v0.6 frontend имеет рабочий стартовый экран + DAG-placeholder + Settings + ProjectInfoModal. Library в M-A core — `UnderConstruction.jsx` заглушка с текстом «В разработке», доступная из Start screen sidebar и из in-project DAG-toolbar (DEC-V2-28 dual-context).

M-B Kickoff формализация (третья сессия 01.05) зафиксировала Library как **flat личную коллекцию контейнеров и праймеров вне проектов** (DEC-LIB-01..09). Library — не 3-tier ownership, не Benchling Inventory, не folder hierarchy; UX-ориентиры — SnapGene Files / ApE / pLannotate. Два kind в одной IndexedDB table: `container` и `primer` (DEC-LIB-02 + DEC-LIB-03). Features — derived state контейнеров, не browsable отдельно (DEC-LIB-04). Sequence frozen после первой загрузки (DEC-LIB-05). Связь project ↔ library = копия с новым UUIDv7 + `origin: library_clone` (DEC-LIB-06).

**Что блокирует продвижение без M-A.3.** M-B.1 Importer (in-project context) автоматически копирует контейнер в Library по DEC-IMP-04. Если Library UI не существует — biolog после import видит результат только на DAG, никакого browse / удаления / тегирования. M-A.3 закрывает эту дыру skeleton-ом list view, не блокируя на M-B.1: оба спринта могут идти параллельно, схождение в точке когда Code проверяет связку «import создаёт LibraryEntry → Library list rerender».

**M-A.3 strict scope.** Это **skeleton**, не финальный Library UX. Полировка (search, sort, bulk-select, dedup при reimport, persisted Tag-DB, advanced filtering) — **M-H** по roadmap (ARCHITECTURE_v2 §7). Detail pane при click row (PlasmidMiniMap reuse + biological context actions) — **отдельный kickoff** после M-A.3 release («там всё глубже» по формулировке Игоря 01.05.2026).

**Q1 collision разрешён.** Поле `MoleculeContainer.tagIds: UUID[]` из ARCHITECTURE_v2 §2.1 (29.04 draft) убирается из data-model. Теги живут только на LibraryEntry. Filter «найти все bacterial backbones» работает на Library через `LibraryEntry.tags`. В проекте организация молекул идёт через DAG-навигацию, не через теги. Если когда-нибудь понадобятся теги внутри проекта — добавим в v0.7+ как separate concern.

---

## 2. Стратегия

Skeleton list view с inline tags editing и soft-delete, без detail pane и без add-pathway. Реюзим устоявшиеся проектные паттерны (soft-delete DEC-MA1-02, tag suggestions derived DEC-MA-04, bilingual code DEC-MA2-01). Data-model расширяется на одну IndexedDB table; Zustand добавляет один slice; Library fullscreen занимает позицию `activeFullscreen === 'library'` (поле уже есть в canvasSlice).

Add-pathway отсутствует by design. Library в release-сборке стартует пустой, при тестировании Code пишет fixture через прямой вызов `addLibraryEntry()` action. На handoff визуальную приёмку Игорь выполняет двумя способами: (1) Code прогоняет сценарий руками с временным fixture в dev console; (2) после интеграции с M-B.1 импорт реально наполняет Library, приёмка повторяется.

---

## 3. Scope

### IN

- Schema v2 расширение: table `library` с indexes по DEC-V2-22 (`[kind+addedAt]`, multi-entry `tags`).
- `librarySlice` — CRUD + soft-delete + filter state + derived selectors.
- Library fullscreen skeleton:
  - Header с back-button (stack pop) + title «Library» + Settings + ThemeToggle.
  - Toolbar с tab switcher Containers/Primers + topology filter dropdown (Все/Circular/Linear, только для kind=container) + `+ Импорт` placeholder (disabled, tooltip «Available in M-B.1»).
  - List view с rows: name + topology icon + length (для container) или Tm/GC (для primer) + tags chips inline editable + hover-`×` для soft-delete.
  - Empty state: text «Library is empty. Import containers and primers from project DAG (coming in M-B).»
- Soft-delete pattern (DEC-MA1-02): `markPendingDelete` → toast «Entry "name" deleted» с Undo (5s) → commit / cancel.
- Tags inline editor: chip click → edit mode (один chip per row активен в edit mode), `+ tag` input с suggestions из всех `LibraryEntry.tags` cross-entries (DEC-MA-04 паттерн).
- i18n: namespace `library` в `lib/strings.js` (~12 keys).
- Wiring: nav case `'library'` в App.jsx (push в navStack), Topbar back-button в Library context = `popFullscreen` или `'start'` если standalone.

### OUT

- **Add-pathway** — будет в M-B.1 (Importer контекст into-library) и в M-B.2 (paste). В M-A.3 `+ Импорт` button существует как UI-placeholder, click — no-op с tooltip «Available in M-B.1».
- **Detail pane при click row** — отдельный kickoff после M-A.3 release. PlasmidMiniMap reuse, biological context actions (Add to project / View commits / Edit name) — все в kickoff.
- **Search bar / sort / bulk-select / dedup** — M-H polish.
- **Persisted Tag-DB cross-project** — M-H. Tag suggestions в M-A.3 derived из `library` table в текущей IndexedDB (cross-entry, intra-library), не из всех `.bodge` files.
- **Edit name / sequence / annotations entry** — frozen sequence по DEC-LIB-05; edit name отложен на детали (нужно ли вообще, или только rename via re-import).
- **Add to project (clone-on-import)** — кнопка появится в detail pane (отдельный kickoff). DAG-toolbar `+ Из библиотеки` library picker — отдельная задача после M-B.
- **TagFusionPicker reuse** — есть в `components/TagFusionPicker.jsx` 4.49 KB но это для biology tag/fusion partners (DNA tags типа 6xHis, FLAG), не для Library tags. Не путать.
- **Hotkeys внутри Library** (J/K navigation, X для delete, T для tag) — M-H. В M-A.3 только глобальные хоткеи из M-A registry работают (Esc back, ⌘I project info — в Library context inert, ⌘N inert так как modal-guard блокирует).

---

## 4. Архитектурные решения

**4.1 Теги — только на LibraryEntry, не на MoleculeContainer.** (Закрытие Q1 collision, кандидат в ⚓ DEC-LIB-10 после реализации.) Поле `MoleculeContainer.tagIds: UUID[]` убирается из data-model. Filter в Library работает по `LibraryEntry.tags`. В проекте у молекул нет тегов — организация через DAG-навигацию + future provenance breadcrumb (M-C). Симметрично с DEC-V2-30 (Project.tags = flat strings на агрегаторе) и DEC-LIB-09 (Library = flat tagging).

**4.2 LibraryEntry — wrapper над frozen ресурсом, не сам ресурс.** Field `resourceId: UUID` ссылается на отдельную таблицу хранения (для container — отдельная table, для primer — отдельная). В M-A.3 ресурсы хранятся inline в LibraryEntry (`payload: { sequence, topology, ends, length, baselineAnnotations? }` для container; `payload: { sequence, tm?, gc? }` для primer) — это упрощение для skeleton. Финальная структура с separate tables `containers` / `primers` и refs через resourceId — M-B.1 / M-F. Контракт `resourceId === entry.id` в M-A.3 (одна сущность представляет и wrapper и payload), мигрируется в M-B.1 без data loss.

**4.3 Soft-delete на entry, не на резерв.** `_pendingDelete: boolean` флаг на LibraryEntry, фильтрация в selector. Симметрично DEC-MA1-04 (entity flag, не ui slice Set). При timeout 5s — actually delete из IndexedDB. При undo — unmark. При close tab до timeout — entry остаётся в IndexedDB с `_pendingDelete: true` — при следующем open Library этот flag учитывается selector'ом, entry не показывается; явная очистка через GC утром следующей сессии (или manually через Settings → reset, отложено на M-H).

**4.4 Toolbar `+ Импорт` button — visible disabled, не hidden.** Tooltip `Available in M-B.1` — биолог (читай Code/Игорь при тестировании) сразу видит куда придёт основной workflow. Удаление placeholder и wiring к Importer (`pushFullscreen('importer', { target: 'library' })`) — M-B.1 task.

**4.5 Filter state в slice, persistance в memory only.** `filterKind: 'container' | 'primer'`, `filterTopology: 'all' | 'circular' | 'linear'`. Не persist'ится в IndexedDB / localStorage — после reload Library возвращается к defaults (`'container'` + `'all'`). Persist preferences — M-H.

**4.6 Bilingual policy (DEC-MA2-01).** Все UI strings через `STRINGS.library.<key>` namespace. Code comments + JSDoc + console + commit messages — английский.

---

## 5. Файлы / сигнатуры / тесты

### K1. Schema v2 + library helpers (`db/dexie-schema.js`)

**Расширение existing файла.** Bump `DB_VERSION = 2`, добавить `.upgrade()` callback для миграции v1→v2 (на старте v0.6 после wipe — фактически noop, т.к. table `library` отсутствует и просто создаётся).

```js
// shape: LibraryEntry
{
  id: UUIDv7,
  kind: 'container' | 'primer',
  name: string,
  tags: string[],
  addedAt: ISO8601,
  payload: { ... },          // см. §4.2
  _pendingDelete?: boolean,   // §4.3
  ext: object,
}
```

Schema declaration:
```js
this.version(2).stores({
  projects: 'id, name, createdAt, updatedAt',
  containers: 'id, projectId, kind, name, [projectId+kind]',
  library: 'id, kind, addedAt, [kind+addedAt], *tags',
}).upgrade(async (tx) => { /* noop on v0.6 fresh start */ });
```

Helpers (5 новых функций, JSDoc-документированы):
- `putLibraryEntry(entry) → Promise<void>` — upsert в `library`.
- `getLibraryEntry(id) → Promise<LibraryEntry | undefined>`.
- `listLibraryEntries({ kind?, includeDeleted? }) → Promise<LibraryEntry[]>` — фильтр по kind, по умолчанию excludes `_pendingDelete: true`.
- `deleteLibraryEntry(id) → Promise<void>` — actually remove (вызывается после soft-delete commit).
- `listAllLibraryTags() → Promise<string[]>` — derived list для tag suggestions, distinct.

**Тесты (3 в `db/__tests__/dexie-schema-library.test.js`):**
1. `library` table создаётся при upgrade v1→v2 (fresh init).
2. `putLibraryEntry` + `listLibraryEntries({ kind: 'primer' })` фильтрует только primer entries.
3. `listLibraryEntries()` без kind возвращает оба типа, sorted by `addedAt` desc.

### K2. librarySlice (`store/librarySlice.js`)

Новый Zustand slice. Composed в `store/index.js` рядом с `projectSlice` / `canvasSlice` / `uiSlice`.

State:
```js
{
  libraryEntries: { [id]: LibraryEntry },     // hydrated на init из IndexedDB
  filterKind: 'container' | 'primer',          // DEC-MA2-01: 'container' default
  filterTopology: 'all' | 'circular' | 'linear',
  editingTagsEntryId: UUID | null,             // single-row tags edit mode
}
```

Actions:
- `hydrateLibrary()` — async, читает все non-deleted entries из IndexedDB в state. Вызывается в App init после Dexie ready.
- `addLibraryEntry(entry)` — put в state + put в IndexedDB. Используется M-B.1 Importer (стороннее API).
- `updateLibraryEntryTags(id, tags: string[])` — обновляет tags on entry, persist в IndexedDB. Soft-limit 10 tags (DEC-V2-30 паттерн).
- `markPendingDelete(id)` — выставляет `_pendingDelete: true` on entry в state (фильтр selector скрывает); persist в IndexedDB. Возвращает entry (для toast undo).
- `unmarkPendingDelete(id)` — снимает флаг, entry возвращается видимым.
- `commitPendingDelete(id)` — actually removes entry из state + IndexedDB. Silent return если `_pendingDelete !== true` (race-protection, DEC-MA1-04 паттерн).
- `setLibraryFilterKind(kind)`, `setLibraryFilterTopology(topology)` — UI state.
- `setEditingTagsEntry(id | null)` — single-row edit mode.

Selectors (export'нутые helpers, для использования в компонентах через `useStore`):
- `selectVisibleLibraryEntries(state)` — filter `_pendingDelete !== true`, по `filterKind`, для kind=container ещё по `filterTopology` (читая `payload.topology`). Sort by `addedAt` desc.
- `selectAllLibraryTags(state)` — distinct tags из всех visible entries, sort by frequency then alphabetical (DEC-MA-04 паттерн).

**Тесты (8 в `store/__tests__/librarySlice.test.js`):**
1. `addLibraryEntry` сохраняет entry в state и IndexedDB.
2. `markPendingDelete` устанавливает флаг, selector скрывает entry.
3. `unmarkPendingDelete` возвращает entry в visible.
4. `commitPendingDelete` удаляет из state и IndexedDB.
5. `commitPendingDelete` silent return при `_pendingDelete: false` (race с manual close toast).
6. `updateLibraryEntryTags` обновляет tags, persist в IndexedDB.
7. `selectVisibleLibraryEntries` фильтрует по kind + topology корректно.
8. `selectAllLibraryTags` returns distinct list sorted by frequency.

### K3. Library fullscreen skeleton (`components/Library/`)

Новая директория с 4 файлами:

**`Library/index.jsx`** (~8-10 KB):
- Root компонент Library fullscreen.
- На mount вызывает `hydrateLibrary()` (idempotent).
- Layout: `<LibraryToolbar />` + main `<LibraryListView />`.
- Empty state: если `selectVisibleLibraryEntries` пуст для текущего filter — render text `STRINGS.library.empty`.

**`Library/LibraryToolbar.jsx`** (~2-3 KB):
- Tab switcher Containers / Primers (использует `STRINGS.library.tabContainers` / `tabPrimers`).
- Topology filter dropdown (renderится только при `filterKind === 'container'`).
- `+ Импорт` button (disabled, tooltip `STRINGS.library.importDisabledTooltip`).

**`Library/LibraryListRow.jsx`** (~3-4 KB):
- Один row в list view. Props: `entry`, `onDelete`, `onTagsEdit`.
- Layout: name + topology icon (○ circular / — linear, для container) + length / Tm + tags chips inline + hover-`×` для soft-delete.
- Click на tag chip → activate `setEditingTagsEntry(entry.id)`, render inline editor (через `<TagsInlineEditor />` slot).
- `×` click → `markPendingDelete(entry.id)` + dispatch toast (через `useStore.getState().showToast(...)`) с `onUndo` + `onAutoDismiss` callbacks.

**`Library/TagsInlineEditor.jsx`** (~3-4 KB):
- Render'ится в активной row при `state.editingTagsEntryId === entry.id`.
- Existing chips с `×` для удаления.
- `+ tag` input с autocomplete suggestions из `selectAllLibraryTags` (exclude already-added on this entry).
- Esc / blur → `setEditingTagsEntry(null)`, save через `updateLibraryEntryTags`.
- Pattern взят из `ProjectInfoModal.jsx` (DEC-MA-04 tag suggestions).

**Тесты (10 в `components/__tests__/Library.test.jsx`):**
1. Empty state renders при пустом `libraryEntries`.
2. Tab switcher переключает `filterKind`.
3. Topology dropdown скрыт при `filterKind === 'primer'`.
4. List rows render корректное количество для текущего filter.
5. Hover на row показывает `×` button.
6. Click `×` → `markPendingDelete` вызван + toast shown.
7. Toast undo → `unmarkPendingDelete` + entry визуально возвращается.
8. Toast auto-dismiss → `commitPendingDelete` вызван.
9. Click на chip → `TagsInlineEditor` mount'ится для row.
10. `+ Импорт` button disabled + tooltip visible.

### K4. App wiring (`App.jsx` + `components/AppShell/Topbar.jsx`)

**App.jsx изменения** (~15 строк):
- В switch-case `activeFullscreen === 'library'` → render `<Library />` вместо `<UnderConstruction title="Library" />`.
- Не трогать: hotkey-resolver, ProjectInfoModal logic, modal-guard logic.

**Topbar.jsx изменения** (~10 строк):
- При `activeFullscreen === 'library'`: title = `STRINGS.library.title`, back-button → `popFullscreen()` (если nav stack non-empty) или `setActiveFullscreen('start')` (если standalone).

**Тесты:** существующие App.test.jsx / Topbar.test.jsx покрывают switching. Новых тестов не добавляем — обновляем 1-2 existing assertion'а.

### K5. i18n strings (`lib/strings.js`)

Добавить namespace `library` (~12 keys):
- `title: 'Library'`
- `tabContainers: 'Containers'`
- `tabPrimers: 'Primers'`
- `topologyAll: 'All'`
- `topologyCircular: 'Circular'`
- `topologyLinear: 'Linear'`
- `importButton: '+ Import'`
- `importDisabledTooltip: 'Available in M-B.1'`
- `empty: 'Library is empty. Import containers and primers from project DAG (coming in M-B).'`
- `entryDeletedToast: (name) => \`Entry "${name}" deleted\``
- `addTagPlaceholder: '+ tag'`
- `tagsLimit: (limit) => \`Maximum ${limit} tags per entry\``

**Тесты:** не нужны (data file, без логики).

---

## 6. Порядок выполнения + оценка

K1 → K2 → K3 → K4 → K5 (можно K5 в любой момент параллельно).

| Задача | Оценка Code |
|--------|-------------|
| K1 schema v2 + helpers | 1.0 ч |
| K2 librarySlice | 1.5 ч |
| K3 Library components | 3.0 ч |
| K4 App + Topbar wiring | 0.5 ч |
| K5 i18n strings | 0.3 ч |
| Vitest + ручной прогон | 1.0 ч |
| **Итого** | **~7-8 ч** |

5-7 коммитов в `feature/racetrack-canvas`: один на K1, один на K2, 1-2 на K3 (K3a структура + K3b inline tags editor), один на K4+K5, один на test-fixture demo (если нужно).

---

## 7. STOP-условие + формат отчёта

**STOP:** после K1-K5 + Vitest pass + `vite build` clean. Не финализировать `PROJECT_STATE.md` / `DECISIONS.md` / `BUGS.md` / `TECH_DEBT.md` / `CURRENT_TASK.md` — это работа Chat в следующей сессии после визуальной приёмки.

**Отчёт в `CURRENT_TASK.md`:**
- Коммит-хэши K1..K5.
- Финальные счётчики тестов (Vitest должен быть baseline 764 + ~21 новых = ~785).
- Build status (clean / warnings).
- Размеры новых файлов и `App.jsx` после wiring (size budget check).
- **Отклонения от спеки** — явный блок. Если, например, payload structure отличается от §4.2 в каких-то деталях — фиксировать.
- Sanity check для визуальной приёмки: краткий how-to для Игоря добавить test fixture руками через dev console (`useStore.getState().addLibraryEntry({...})`) с примером для container и primer. Это нужно потому что Library стартует пустой.

---

## 8. Риски

**8.1 Dexie миграция v1→v2 на existing IndexedDB.** В dev-окружении у Игоря может быть IndexedDB с DB_VERSION=1 от предыдущих сессий. Dexie должен корректно apply'нуть upgrade-callback при open. Митигация: upgrade callback noop (просто declares `library` table), Dexie сам её создаёт. Тест K1#1 проверяет.

**8.2 hydrateLibrary вызывается дважды (race на init).** Если App mount + Library mount оба вызывают hydrate — двойной запрос к IndexedDB. Митигация: idempotent guard в slice (`if (state._libraryHydrated) return`), флаг `_libraryHydrated` в slice state.

**8.3 Tag autocomplete тормозит при большом количестве entries.** При 500+ entries `selectAllLibraryTags` каждый рендер делает O(N) проход. Митигация: useMemo с dep на `libraryEntries`. На M-A.3 scope (skeleton) проблема не проявится — Library пуста. Закладка для M-H polish.

**8.4 Soft-delete crash window.** Между `markPendingDelete` и `commitPendingDelete` (5s) если browser crash'ится — entry остаётся в IndexedDB с `_pendingDelete: true`. Selector скрывает, entry de facto «удалён» с точки зрения UI. Реальная очистка — GC при следующем session start (отложено на M-H через `cleanupPendingDeletes()` helper). Принимаем как known limitation в M-A.3.

**8.5 Q1 follow-up в ARCHITECTURE_v2.** Удаление `MoleculeContainer.tagIds` из ARCHITECTURE_v2 §2.1 — задача Chat'а, не Code. Делается в следующей Chat-сессии после M-A.3 финализации (Chat-direct правка типа D, ~5 строк edit_file). Контейнерные данные пустые, миграция кода не нужна.

---

## 9. Открытые вопросы

**9.1 Q3 detail pane — отдельный kickoff после M-A.3.** Когда биолог clicks row, что показываем? PlasmidMiniMap reuse (DEC-REUSE-01)? Biological actions (Add to project / View commits / Edit name)? Edit name vs frozen sequence (DEC-LIB-05) — как combined? Ожидает kickoff-сессии Игорь ↔ Chat, не блокирует M-A.3.

**9.2 Edit name на LibraryEntry — yes / no / частично.** DEC-LIB-05 говорит «sequence frozen», про name явно не сказано. Можно editable inline (через InlineEditableTitle reuse) — это не нарушает frozen sequence, но создаёт расхождение между entry.name и payload-derived name (например `LOCUS` из GenBank). Решается в kickoff Q3 detail pane.

**9.3 `+ Из библиотеки` library picker UI в DAG-toolbar.** Не входит в M-A.3 (отдельная задача после M-B). Может реюзить тот же `<Library>` компонент в режиме `mode='picker'` (с onSelect callback вместо delete) — закладка для M-B/M-C/M-D.

**9.4 Soft-limit на tags 10 vs 5.** DEC-V2-30 Project.tags soft-limit 10. Применимо ли это к LibraryEntry.tags? Биолог может хотеть больше тегов на плазмиде (organism + topology + selection + project + год + version). В M-A.3 ставим 10 как соответствие, но это не якорное. Можно повысить до 15-20 в M-H по результатам use.

---

## 10. После реализации (Chat tasks, не Code scope)

После Code финализации M-A.3 + визуальной приёмки Игорем — Chat в следующей сессии:

1. **Ротация по §4 playbook**: эта спека → `docs/archive/SPRINT_M-A-3.md` со штампом «✅ РЕАЛИЗОВАНО [дата]».
2. **DEC-LIB-10 в DECISIONS.md** (⚓): «`MoleculeContainer.tagIds` убирается из data-model. Теги — только на LibraryEntry. Filter «найти все bacterial» работает через `LibraryEntry.tags`. В проекте организация молекул через DAG-навигацию + future provenance breadcrumb (M-C). Кейсы биолога разрешены: тегирование (на LibraryEntry), clone-on-import (теги остаются в Library, клон в проекте без тегов), filter (по `LibraryEntry.tags`).»
3. **ARCHITECTURE_v2 §2.1** Chat-direct правка (тип D): убрать `tagIds: UUID[]` из MoleculeContainer interface. Обновить changelog v1.1 → v1.2.
4. **TECH_DEBT.md** обновление: новые TD candidates (cleanupPendingDeletes GC, persisted tag-DB, advanced search/sort) — все pinned to M-H.

Chat не делает эти 4 пункта в спека-сессии. Только перечисляет здесь как memo.

---

**Дата создания:** 01.05.2026 (третья сессия).
**Последнее обновление:** 01.05.2026.
**Автор:** Claude Chat по итогам разговора Игорь ↔ Chat (Q1 collision: α; Q2 N/A — Library в release пустая до M-B.1; Q3 → отдельный kickoff).
