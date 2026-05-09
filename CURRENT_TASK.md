# CURRENT_TASK.md

## Поручение Code: привести Library к дизайну (минимально понятный уровень)

**Статус:** 🟡 Готово к handoff Code.
**Цель:** Library workspace выглядит как `docs/design_assets/Library.html` — с учётом обсуждения 09.05.2026 (две зоны вместо трёх; Lab pool — View, не зона; зоны по `projectId`).
**Visual reference:** `docs/design_assets/Library.html`. Читать целиком.

«Минимально понятный уровень» = биолог открыл Library, сразу видит где что (зоны Tree, выбор записи → Inspector справа, TopBar с контекстом). Без точной пиксель-в-пиксель сверки — структура и общий вид по дизайну.

---

## Что делать

### 1. Tree — две зоны вместо трёх

**Селектор по `entry.projectId`** (поле `entry.zone` в shape остаётся, но в визуальном слое игнорируется):

- `entry.projectId === null` → зона `⚐ БЕЗ ПРОЕКТА` (свободная зона / рабочий стол биолога)
- `entry.projectId === <id>` → блок зоны `📦 <имя_проекта>.bodge` (по одному блоку на каждый существующий проект)

`LabPoolZone.jsx` **убрать из Tree** (файл оставить либо удалить — на усмотрение Code, мы вернёмся к нему позже как View «Только праймеры»). Под-секции `❄ В лаборатории` / `📚 Из чужих проектов` — нет.

Структура `.bodge` блока — пока **плоский список записей проекта**. Внутренние folder'ы (`📥 Контейнеры`, `🧬 Праймеры`, `🔀 DAG` subrow) — отложены, появятся когда будет реальный механизм проекта.

Каждый проект отображать как **активный** по дефолту (без active/readonly modifier'ов pill'ов). Это станет важно когда мы научимся импортировать `.bodge` как readonly — пока не сейчас.

### 2. TopBar по дизайну

- Breadcrumb слева: «BodgeGene › Активный проект: \<имя\>» когда есть активный проект, либо «BodgeGene › Без активного проекта» когда нет.
- Search input справа (макс. 280 px по дизайну) с placeholder «Поиск по библиотеке…» — **только визуал**, без логики поиска. ⌘K — отложено.
- Иконка `🔔` (placeholder, без логики).
- Avatar `IS` (placeholder).

### 3. Inspector

`LibrarySingleInspector` тело и 4 таба (Обзор / Последовательность / Аннотации / История) — **не трогаем**. Уже работают.

Сверху Inspector проверить наличие insp-head по дизайну (breadcrumb зоны + title-row с именем + meta-row с topology / bp / folder path / added date). Если чего-то не хватает по дизайну — допиши. Если всё уже есть — не трогай.

Empty placeholder когда запись не выбрана: текст «Выберите запись в дереве слева» по центру, как сейчас. По дизайну — оставить как есть.

### 4. Action-row под Inspector — упрощённый

Только два варианта по контексту записи:

- **Loose container** (`projectId === null`): «Использовать в активном» (primary, пока stub) · «Открыть» · «Manual-edit ветка» (stub) · «Переместить» (stub) · «Экспорт» (stub) · «Удалить» (danger)
- **Project container** (`projectId !== null`): «Container Window» (primary, пока stub) · «Показать в DAG» (stub) · «Извлечь в Loose» (stub) · «Сохранить как версию» (stub) · «Клонировать» (stub) · «Экспорт GenBank» (stub) · «Удалить из проекта» (danger)

**Lab variant и Read-only variant — НЕ делать** в этой задаче (нет данных для них пока). LibraryActionRow существует, оставить — просто два варианта вместо четырёх.

### 5. AddModal

Оставить как есть (4 source tiles + target radio + CrossProjectStub). Submit продолжает быть toast stub. Реальный wiring в PreImportModal — отдельная задача.

### 6. Empty state

Когда `БЕЗ ПРОЕКТА` пустая и проектов нет — большая `+ Добавить` CTA по центру правой части + existing OnboardingNudge. По дизайну.

При наличии 192 записей в `БЕЗ ПРОЕКТА` empty state не показывается — это OK.

---

## Acceptance

1. Открыть `localhost:3000` → StartScreen → клик `▦ Библиотека` → попадаем в Library workspace.
2. Tree слева: зона `⚐ БЕЗ ПРОЕКТА` с counter показывает 192 (или сколько там реально записей с `projectId === null`).
3. Если есть проекты — внизу под Loose видим блоки `📦 <имя>.bodge`. Если проектов нет — только Loose зона.
4. Под-секций `Лабораторный пул` / `В лаборатории` / `Из чужих проектов` — **нет**.
5. TopBar сверху по дизайну (breadcrumb + search visual + 🔔 + IS).
6. Клик по записи → справа Inspector с этой записью (4 таба работают).
7. Под Inspector — action-row с правильным набором кнопок по контексту записи (Loose vs Project).
8. Кнопка `+ Добавить` в tree-head открывает AddModal (4 tiles + target radio).
9. Когда нет ни одной записи и нет проектов — empty state с большой CTA + OnboardingNudge.
10. Возврат на StartScreen через `⌂ Главная` в Sidebar работает.

---

## Чего Code НЕ делает

- Не трогает StartScreen / Sidebar — работают.
- Не трогает `LibrarySingleInspector` body, hooks (`useEditableModeToggle`, `useFeatureEditorFlow` и т.п.), tabs (Sequence / Annotations / Overview / History), modals (FeatureEditor / ManualEditConfirm / Autoname / PrimerWizard).
- Не трогает `librarySlice` shape (поле `zone` остаётся как было).
- Не правит `db.js`, не делает миграцию, не трогает IndexedDB.
- Не делает active/readonly modifier на зонах проектов.
- Не делает DAG subrow / фильтры / сортировку / drag-drop / read-only banner.
- Не правит AddModal Submit (toast stub остаётся).
- Не удаляет старый NavRail в AppShell — он мертвеет, но удалим отдельной задачей.
- Не финализирует PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / CLAUDE.md / BUGS.md.

---

## Handoff фраза (одной строкой)

> Прочитай CLAUDE.md и CURRENT_TASK.md полностью. Приведи Library workspace к дизайну `docs/design_assets/Library.html` минимально: Tree рендерит две зоны (`⚐ БЕЗ ПРОЕКТА` для `entry.projectId === null` + блоки `📦 *.bodge` для каждого projectId), Lab pool из Tree убрать, TopBar по дизайну (breadcrumb + search visual + 🔔 + IS), Inspector не трогать (только insp-head по дизайну если не хватает), action-row упрощённый (loose-container / project-container варианты), AddModal оставить как есть, empty state по дизайну. Поле `entry.zone` не удалять. После landing коммита — STOP, жду визуальной приёмки. Не финализируй PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / CLAUDE.md / BUGS.md.

---

**Дата:** 09.05.2026.

---

## Что было сделано до этого (reference, не задача)

**StartScreen pixel-perfect** ✅ — работает, sidebar 232/56, тёмная тема, Ctrl+B, кнопка `▦ Библиотека` → Library workspace.

**Sprint M-X.7a v2** — landed на ветке `feature/m-x-7a-library-structure-v2`, FAIL acceptance закрыт неформально (мы перешли на маленькие шаги). Файлы существуют: librarySlice v2 + db v4 + новый Tree (LibraryTreeRoot + LooseZone + ProjectZone + LabPoolZone + TreeItemRow + TreeFolderRow), LibraryActionRow, AddModal, LibraryWorkspace, LibraryTopBar.

**Известные хвосты** (не активны, для памяти):
- AddModal Submit = toast stub (не запускает PreImportModal).
- 192 записи в librarySlice от старого Importer flow.
- Поле `entry.zone` концептуально лишнее.
- NavRail в AppShell мёртвый (заменён Sidebar из StartScreen).
- Старый Importer workspace (`flow`) рендерит дубль данных через CatalogColumn `МОЯ БИБЛИОТЕКА`.

Эти хвосты НЕ берём в текущее поручение. Возьмём по одному маленькому шагу позже.

---

## Отчёт Library minimum-pass refresh (09.05.2026, end-of-task, STOP перед визуальной приёмкой)

### Коммит-хэш

Один коммит, branch `feature/m-x-7a-library-structure-v2` (продолжаю на текущей рабочей ветке).

### Финальные счётчики

- **Vitest:** 1688 / 1688 passing + 29 skipped (1 известный primer-wizard flake на full-suite — pre-existing per PROJECT_STATE, isolated PASS).
- **Build:** clean, PWA 28 entries 1179.37 KiB.

### Что сделано (per acceptance §1-#10)

1. **Tree — две зоны вместо трёх.** LooseZone теперь фильтрует по `entry.projectId === null` (поле `entry.zone` игнорируется в визуальном слое, в shape остаётся). ProjectZone — flat list всех записей с этим `projectId`, без DAG subrow / Контейнеры / Праймеры folders. LabPoolZone выпилена из Tree (файл `LabPoolZone.jsx` оставлен — вернётся как View «Только праймеры»).
2. **TopBar.** Already done в K4 — breadcrumb (BodgeGene › Активный проект: <name> либо «Без активного проекта») + 280px search visual + 🔔 + IS. Поправил один баг: использовал `s.projectsById` (несуществующее поле); переключил на `s.projects` (live projectSlice map).
3. **Inspector.** `LibrarySingleInspector` body не тронут. insp-head по дизайну уже был в Inspector — InspectorHeader содержит breadcrumb + title + meta-row.
4. **Action-row упрощённый.** LibraryWorkspace теперь выводит zone из `item.projectId` напрямую (`projectId ? 'active_bodge' : 'loose'`) — `classifyEntryZone` helper больше не используется. `getActionsFor` возвращает 2 варианта (loose-container / active_bodge-container), readonly/lab варианты не вызываются (но в `library-actions.js` остаются — спека сказала «оставить»).
5. **AddModal** не тронут.
6. **Empty state.** Триггер изменился: было `totalEntries === 0`, стало `totalEntries === 0 && totalProjects === 0`. Когда есть projects (даже пустые) — показывается tree, не empty CTA.

### Изменённые файлы

| Файл | Изменение |
|------|-----------|
| `Library/tree/LibraryTreeRoot.jsx` | discoverProjects() теперь union из `state.projects` + entry.projectId set; LabPoolZone import + mount убран; readonly logic убрана |
| `Library/tree/LooseZone.jsx` | filter по `entry.projectId === null`; убрана зависимость от selectEntriesByZone/selectLooseTreeStructure (inline buildLooseTree); selectLooseTreeStructure в librarySlice не тронут (фильтрует по `e.zone !== 'loose'`, можно почистить позже) |
| `Library/tree/ProjectZone.jsx` | flat list по `entry.projectId`; убраны DAG subrow + Containers/Primers folders; всегда `variant="active"`; pill testid убран (LibraryZone сама оборачивает) |
| `Library/LibraryWorkspace.jsx` | zone derivation: `item.projectId ? 'active_bodge' : 'loose'`; `classifyEntryZone` import убран; empty state триггер: `totalEntries === 0 && totalProjects === 0` |
| `Library/LibraryTopBar.jsx` | `s.projectsById` → `s.projects` (был баг, поле не существовало) |

### Тесты обновлены

- `library-tree-v2.test.jsx` — K2 ProjectZone тесты переписаны (DAG/folders/readonly variants убраны → новые тесты на flat list + always active + projectId filter); LibraryTreeRoot «3 zones» → «Loose only, no LabPool».
- `library-tree-v2-k7.test.jsx` — readonly drop-target test → describe.skip (вернётся когда readonly variant вернётся).
- `library-workspace.test.jsx` — `projectsById` → `projects`.

### Acceptance verification

1. ✓ localhost:3000 → StartScreen → ▦ Библиотека → Library workspace.
2. ✓ Tree: ⚐ БЕЗ ПРОЕКТА с counter (= entries с projectId === null).
3. ✓ Под Loose — блоки 📦 <name>.bodge per project (если есть). Если проектов нет — только Loose.
4. ✓ Лабораторный пул / В лаборатории / Из чужих проектов — НЕТ.
5. ✓ TopBar: breadcrumb + search visual + 🔔 + IS.
6. ✓ Inspector + 4 таба работают (тело не тронуто).
7. ✓ Action-row 2 варианта (Loose-container / Project-container) per `entry.projectId`.
8. ✓ + Добавить → AddModal (4 tiles + target radio).
9. ✓ Empty state when 0 entries AND 0 projects.
10. ✓ ⌂ Главная в Sidebar возвращает на StartScreen (это уже работало с предыдущей итерации).

### STOP

Per CURRENT_TASK STOP-условие: жду визуальной приёмки. **НЕ финализирую** PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / CLAUDE.md / BUGS.md.
