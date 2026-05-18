# SPRINT_UI_PROJECT_ACTIVATION.md — спека спринта M-X.7c

> **Статус:** ✅ РЕАЛИЗОВАНО 10.05.2026 (приёмка прошла, версия v0.8.1).
> **Дата создания:** 10.05.2026.
> **Кодовое имя:** Sprint UI-PROJ-ACT (M-X.7c).
> **Тип задачи (по `CHAT_PLAYBOOK.md` §13):** A — архитектура / алгоритм + крупная UX-волна. Спека ≤50 КБ.
> **Источники требований:**
> - `docs/UI_REVISION_2026_05.md` — ревью кнопок Library экрана 10.05.2026.
> - `docs/ARCHITECTURE_3LEVELS.md` — архитектура 09.05.2026.
> - `DECISIONS.md` секция 09.05.2026: DEC-NAV-3LEVEL-01, DEC-PROJECT-OPEN-MERGE-01, DEC-CONTAINER-DIFF-STORAGE-01.
> - Скриншот baseline v0.8.0 (10.05.2026 экран Library с активным «НОВЫЙ ПРОЕКТ.BODGE»).
> **Зависимости:**
> - **Не блокирует** Этапы 2/3 kill старого верстака — можно делать параллельно.
> - **Не зависит** от R4 (AddModal Submit). R4 закроет дыру в Submit; этот спринт не трогает Submit-логику AddModal, только окружение.
> - **Совмещает** функциональную часть DEC-PROJECT-OPEN-MERGE-01 (унификация openProject + import) с UX-ревизией.

---

## 0. Срез размеров затрагиваемых модулей (R0)

Перед началом Code прогоняет `list_directory_with_sizes` на эти директории и подтверждает текущие размеры. Hard 40 КБ для `.jsx`, soft 30 КБ. Hard 25 КБ для `.js`, soft 20 КБ.

| Файл | Размер | Зона | Состояние |
|---|---|---|---|
| `components/Library/inspector/LibrarySingleInspector.jsx` | 38.7 КБ | inspector | **Soft warning, близко к hard.** Декомпозиция отслеживается в TD-SINGLEINSPECTOR-SELECTIONSTATE-EXTRACT. В этой спеке — **не дописывать**, только править существующее (переименования + удаление кнопки «Открыть» + context-aware disabled). |
| `components/Library/index.jsx` | 35.1 КБ | legacy | **Не трогать.** Помечен на kill в Этапе 4 (после R4). Любая правка в нём — через Chat. |
| `components/Library/LibraryWorkspace.jsx` | 15.7 КБ | workspace | Soft warning близко (>15 КБ). Если в спеке потребуется больше 1-2 КБ дописать — декомпозируем подкомпонент. |
| `components/Library/inspector/LibrarySaveActions.jsx` | 10.2 КБ | inspector bottom-bar | Главный target K6. |
| `components/Library/inspector/LibraryActionRow.jsx` | 3.2 КБ | inspector | Возможный target K6. |
| `components/Library/tree/LibraryTreeRoot.jsx` | 7.1 КБ | tree root | Главный target K4 (реорганизация). |
| `components/Library/tree/LooseZone.jsx` | 9.2 КБ | tree zone | Target K4 (переименование). |
| `components/Library/tree/ProjectZone.jsx` | 7.1 КБ | tree zone | Target K4 (убрать DAG-узел). |
| `components/Library/tree/LabPoolZone.jsx` | 3.3 КБ | tree zone | **Удалить целиком** (DEAD по архитектуре, Lab pool = View, не Zone). |
| `components/Library/tree/TreeItemRow.jsx` | 6.9 КБ | tree row | Target K5 (hover-revealed quick-add). |
| `components/StartScreen/Sidebar.jsx` | 10.3 КБ | shell sidebar | Target K2 (переименование + убрать пункты меню). |
| `components/StartScreen/start-screen-data.js` | 2.6 КБ | sidebar data | Target K2 (источник пунктов меню). |
| `components/StartScreen/RecentRow.jsx` | 3.7 КБ | sidebar | Возможный reuse в K7 (дропдаун последних проектов). |
| `lib/strings.js` | 16.9 КБ | i18n dictionary | Target K1 (новые ключи). |
| `lib/library-zones.js` | 1.9 КБ | classifier | Target K3 (упрощение зон до 2 + projectId). |
| `lib/library-actions.js` | 9.2 КБ | actions | Target K8 (`activateProject(id)`). |
| `librarySlice` (в `store/`) | ? | state | Target K3, K8. Code определяет точный путь через grep. |

**Если хоть один файл превысил hard на момент старта** — Code останавливается, отчёт Chat: «X.jsx hard violation, нужна декомпозиция первой задачей». Чат решает: декомпозировать этой спекой или отдельной.

---

## 1. Контекст и где задача сядет (§17 R4)

**Где сядет:**

Спринт затрагивает шесть областей кодовой базы:

1. **`lib/strings.js`** — все user-facing строки этой ревизии добавляются здесь как новые ключи STRINGS namespace. По DEC-MA2-01 bilingual policy (русский в UI). Старые ключи **остаются** до конца спринта (не удаляем синхронно — сначала вводим новые, переключаем callsites, потом чистим).

2. **`components/StartScreen/Sidebar.jsx` + `start-screen-data.js`** — переименование «Открыть .bodge» в «Загрузить .bodge». Удаление пунктов меню «Конструкции (soon)», «Реакции (soon)» из РАБОЧЕЕ МЕСТО. «Праймеры (soon)» — оставить как заглушку (станет глобальным View в M-E).

3. **`components/AppShell/`** — топ-бар. Сейчас показывает «BodgeGene › Без активного проекта» / «BodgeGene › Имя проекта». Добавить **дропдаун последних активных проектов** на клик по этому элементу. Code определяет точный файл (`AppShell/index.jsx` или `AppShell/Topbar*.jsx` если выжил после Sidebar refactor).

4. **`components/Library/tree/*` + `lib/library-zones.js`** — реорганизация Tree:
   - Переименование `loose` → отображается как «⎀ БЕЗ ПРОЕКТА» (визуально), внутри код может оставить ключ `loose`.
   - Сокращение четырёх зон до двух логически: `loose` + `bodge`. Зона `lab_pool` удаляется (DEAD по архитектуре). Зоны `active_bodge` / `readonly_bodge` сливаются в одну зону `bodge` — различение через `projectId`, а **не через зону**.
   - Тег `[active]` — только на одном проекте (`projectSlice.activeProjectId`). Остальные .bodge без тега.
   - Убрать узел «DAG» внутри ProjectZone — DAG это режим правой панели, не папка.
   - Stretch: hover-revealed «+» quick-add (K5) на записях вместо стрелки ↑.

5. **`components/Library/inspector/LibrarySaveActions.jsx`** + связанные — bottom-bar Inspector. Переименование кнопок, удаление «Открыть», context-aware disabled.

6. **`librarySlice` + `lib/library-actions.js`** — единая точка входа `activateProject(id)` (DEC-PROJECT-OPEN-MERGE-01). Гарантия что только один проект имеет `activeProjectId`. Импорт `.bodge` всегда вызывает `activateProject`. Удаление различения «openProject» vs «import».

**Что может сломаться:**

- **Тесты по text-match** — multiple test files queries by text используют старые строки кнопок, пунктов меню, имени Loose-зоны. Snapshot tests или RTL `getByText('Открыть .bodge...')`. Code заменяет на новые строки одной волной.
- **Старый Importer** (`Library/index.jsx`, помечен на kill) использует свой UX — но ОН уже изолирован, новый Tree рисуется через `LibraryWorkspace.jsx`. Спринт **не трогает старый Importer**, биолог продолжает им пользоваться для импорта `.bodge` пока не сделан R4.
- **`workspace.active` vs `canvas.activeFullscreen`** — текущий dual-state navigation. Спринт **не сливает** эти два state'а (это Стадия 5 в roadmap). Только не должен ломать существующие переходы.
- **Multi-tab guard** (`navigator.locks` из M-A.1) работает на уровне «одна вкладка на `.bodge`», не на уровне «один проект активен». Не ломаем — просто следим что `activateProject` совместим с lock'ом.

**Что НЕ задевается** (чтобы Code случайно не залез):

- `Library/index.jsx` (35 КБ) — старый Importer, на kill.
- `Library/hooks/useLibraryState.js` — hook старого Importer, на kill.
- `Library/import/PreImportModal.jsx` + `MultiImportView.jsx` — рабочая тропа импорта, R4 их подключит к новому AddModal. Эта спека не их target.
- `Library/AddModal/SourceTiles.jsx` — Submit logic в R4. Здесь только окружение (Tree, Sidebar, Inspector).
- `Library/inspector/FeatureEditorModal.jsx` (25.6 КБ) — двойной клик на feature, не задевается.
- `SequenceView/`, `Annotator/`, `Dag/` — не задеваются.

---

## 2. Стратегия

Девять K-блоков. Делаются последовательно, каждый — отдельный коммит. Между крупными K-блоками Code прогоняет `npm test` чтобы ловить регрессии рано.

| K | Блок | Тип | Зависимость |
|---|---|---|---|
| K1 | Расширение `lib/strings.js` новыми ключами | подготовка | — |
| K2 | Sidebar — переименование «Открыть .bodge», удаление «Конструкции/Реакции» | UI | K1 |
| K3 | `lib/library-zones.js` + `librarySlice` — упрощение зон до 2, единственный `activeProjectId` | модель | K1 |
| K4 | Tree — переименование Loose, единственный [active] tag, убрать DAG-узел | UI | K3 |
| K5 | Tree quick-add — hover-revealed «+» icon | UI | K4 |
| K6 | Inspector bottom-bar — переименования + удалить «Открыть» + context-aware disabled | UI | K1 |
| K7 | Топ-бар — дропдаун последних активных проектов | UI | K3 |
| K8 | `activateProject(id)` — унификация openProject + import (DEC-PROJECT-OPEN-MERGE-01) | модель | K3 |
| K9 | Cleanup `lib/strings.js` — удаление осиротевших ключей, регрессионный прогон | cleanup | K2-K8 |

Финальный прогон `npm test` + `npx vite build` — ожидаются 1666+/1666+ passing. Build clean, PWA precache в зоне +/− 5 КБ от baseline.

---

## 3. Scope IN / OUT

### IN

- Все переименования из `docs/UI_REVISION_2026_05.md` (Sidebar, Tree zones, Inspector bottom-bar).
- Удаление пунктов меню «Конструкции (soon)», «Реакции (soon)» из Sidebar.
- Удаление узла «DAG» из ProjectZone в Tree.
- Удаление зоны `LabPoolZone.jsx` целиком (DEAD).
- Слияние зон `active_bodge` + `readonly_bodge` в одну зону `bodge` с дифференциацией через `projectId`.
- Гарантия что `activeProjectId` в `projectSlice` указывает на один проект максимум.
- Тег `[active]` в Tree — только на текущем активном проекте.
- Hover-revealed quick-add «+» на записях контейнеров в Tree (замена стрелки ↑).
- Удаление кнопки «Открыть» из bottom-bar Inspector.
- Context-aware disabled на «Добавить в активный проект» (раньше «Использовать в активном») когда нет активного проекта.
- Топ-бар «BodgeGene › Имя проекта / Без активного проекта» становится кликабельным дропдауном последних активных проектов + кнопка «+ Создать проект».
- `activateProject(id)` action в librarySlice — единая точка активации. Импорт `.bodge` вызывает `activateProject` после создания проекта.

### OUT

- **R4 (AddModal Submit)** — отдельный мини-спринт типа C, тут только UI окружение.
- **Этап 4 kill** (старый `Library/index.jsx` + `useLibraryState.js`) — после R4.
- **DEC-CONTAINER-DIFF-STORAGE-01** (diff-режим в `.bodge` сериализации) — backend-задача, отдельно.
- **Вкладка «История»** в Inspector (DEC-LIB-K7-VERSION-COW-01 уже даёт версии, но UI-вкладка под них появится после diff-storage).
- **M-C.2 Container Window** — отдельный большой спринт.
- **M-E Парт-канвас** — отдельный большой спринт.
- **Слияние `canvas.activeFullscreen` + `workspace.active`** — Стадия 5 в roadmap.
- **TD-CIRCULAR-SELECTION**, **TD-ANNOTATIONTRACK-DECOMPOSE-V2** — параллельные технодолги.
- **Реализация диалога Settings, Hotkeys cheatsheet** — не трогаем.

---

## 4. Архитектурные решения этой спеки

### DEC-UIRREV-ZONES-MERGE-01 — Tree зон 2, не 4

`library-zones.js::classifyEntryZone` сейчас возвращает четыре варианта: `loose`, `active_bodge`, `readonly_bodge`, `lab_pool`.

После K3 — **две зоны**: `loose` (БЕЗ ПРОЕКТА) и `bodge` (любой `.bodge`-проект). Различение между конкретными проектами идёт через `entry.projectId`, не через зону.

**Обоснование:** «active» / «readonly» — это **состояние UI**, не свойство записи. Один и тот же entry становится active/readonly в зависимости от того, какой проект сейчас активен у биолога. Записывать это в `entry.zone` дублирует state и создаёт рассинхрон. По архитектуре Игоря «Tree зон 2: ⎀ БЕЗ ПРОЕКТА + 📦 *.bodge».

### DEC-UIRREV-ACTIVE-SINGLE-01 — один активный проект одновременно

`projectSlice.activeProjectId` — единственное поле, определяющее который проект «активный». Тег `[active]` в Tree рендерится только когда `entry.projectId === activeProjectId`.

Алгоритм `activateProject(newId)`:
1. Если у текущего `activeProjectId` есть unsaved-state — flush в IndexedDB (PWA autosave уже это делает).
2. `activeProjectId = newId` в store.
3. Tree пересчитывает [active] tag, header пересчитывает имя.

**Никаких множественных `[active]` тегов**, как сейчас на скриншоте. Если их видно — это или баг, или старая интерпретация тега как «открыт хоть раз». Спека удаляет любую такую интерпретацию.

### DEC-UIRREV-IMPORT-EQ-ACTIVATE-01 — импорт = активация (функциональное закрытие DEC-PROJECT-OPEN-MERGE-01)

Импорт `.bodge` через любую точку входа (`+ Добавить` в Tree, drag-drop в Library, файл-пикер в Sidebar «Загрузить .bodge») в конце пайплайна вызывает `activateProject(newProjectId)`. Биолог сразу видит DAG нового проекта в правой панели.

Никакого «импортировал, нужно ещё открыть». Никакой кнопки «Открыть» как отдельной операции.

### DEC-UIRREV-DAG-NOT-FOLDER-01 — DAG не папка в Tree

В ProjectZone сейчас рендерится узел `DAG` рядом с `Контейнеры` и `Праймеры`. Это смешение «папок с записями» и «режимов отображения». DAG — это представление **проекта целиком**, не папка с записями.

После K4 — узел `DAG` из ProjectZone **удаляется**. DAG показывается в правой панели когда биолог:
- Кликает по заголовку проекта в Tree (project root).
- Кликает по узлу `Контейнеры` внутри проекта (визуально показывает то же — список контейнеров проекта в виде графа).

Toggle Tree-Inspector / Tree-DAG в правой панели идёт через переключатель (или contextual: project root → DAG, конкретная запись → Inspector).

### DEC-UIRREV-QUICKADD-HOVER-01 — quick-add в Tree через hover (DEC-LIB-K8-QUICKADD-01 расширение)

Стрелка ↑ на каждой записи Tree сейчас всегда видна и ассоциируется с экспортом. Меняем на «+» (или «➤») hover-revealed (opacity 0 default → opacity 1 на :hover row + 120 ms transition) — паттерн уже есть в проекте (DEC-LIB-K8-QUICKADD-01 для Mine-секции). Расширяем на все записи в bodge-зонах. Видна только когда `activeProjectId` есть И `entry.projectId !== activeProjectId` (иначе бессмысленно).

Click → `addContainerToActiveProject(entry.id)` → toast «{entry.name} добавлен в {activeProject.name}» → новый узел появляется в DAG активного проекта.

### DEC-UIRREV-OPEN-DOUBLECLICK-ONLY-01 — единственная точка входа в Container Window

Двойной клик по записи плазмиды в Tree → Container Window (после M-C.2). До M-C.2 — двойной клик открывает Inspector в более развёрнутом виде (текущее поведение).

Кнопка «Открыть» в bottom-bar **удаляется**. Дублирование жеста создаёт шум, биолог быстро запоминает «двойной клик».

Discoverability: tooltip на hover record «двойной клик — открыть в полном редакторе» (Container Window после M-C.2 / Inspector сейчас).

---

## 5. K-блоки — детально

### K1 — `lib/strings.js` расширение

**Цель:** добавить новые ключи STRINGS для всех переименований этого спринта. Не удалять старые в этом блоке — старые продолжают работать пока их callsites не переключены (K2-K8). Удаление — в K9.

**Что добавить:**

В существующий namespace `STRINGS.sidebar` (Code находит через grep) добавить:
- `loadBodge`: «Загрузить .bodge...» (заменяет `STRINGS.sidebar.openBodge` со значением «Открыть .bodge...»).
- (Старый ключ `openBodge` остаётся в файле до K9.)

Удалить из меню в `start-screen-data.js`:
- «Конструкции (soon)»
- «Реакции (soon)»

В новый или существующий namespace `STRINGS.library` (если есть; иначе создать) добавить:
- `loose.title`: «⎀ БЕЗ ПРОЕКТА» (заменяет «К. личная подборка плазмид»).
- `loose.subtitle`: «свободный стол биолога» (опционально, если в Tree есть подзаголовок).
- `tag.active`: «active» (как сейчас, но используется только на одном проекте).

В namespace `STRINGS.inspector.actions` (или эквивалент):
- `addToActiveProject`: «Добавить в активный проект» (заменяет «Использовать в активном»).
- `addToActiveProjectDisabled`: «Нет активного проекта» (tooltip когда disabled).
- `createCopyForEdit`: «Создать копию для правки» (заменяет «Manual-edit ветка»).
- `moveToFolder`: «Переместить в папку...» (заменяет «Переместить»).
- (Удалить из callsites: `STRINGS.inspector.actions.open` со значением «Открыть» — кнопка убирается.)

В namespace `STRINGS.tree.row`:
- `quickAddTooltip`: «Добавить в активный проект» (для hover-revealed «+»).

В namespace `STRINGS.topbar`:
- `noActiveProject`: «Без активного проекта».
- `recentProjectsHeader`: «Недавние проекты».
- `createNewProjectInDropdown`: «+ Создать проект».

**Acceptance K1:**
- Файл `lib/strings.js` собирается без ошибок.
- Все новые ключи доступны через `STRINGS.x.y.z` навигацию.
- Файл не превысил hard 25 КБ (.js). Сейчас 16.9 КБ → ожидаемо до 18-19 КБ.

### K2 — Sidebar

**Цель:** переименовать «Открыть .bodge», убрать пункты «Конструкции», «Реакции» из меню.

**Что меняется:**

В `components/StartScreen/Sidebar.jsx` (10.3 КБ):
- Кнопка «↑ Открыть .bodge...» с хоткеем `^O` использует `STRINGS.sidebar.openBodge`. Переключить на `STRINGS.sidebar.loadBodge`.
- Иконка остаётся `↑` (стрелка вверх — load up). Хоткей `^O` остаётся.

В `components/StartScreen/start-screen-data.js` (2.6 КБ):
- Найти массив пунктов меню РАБОЧЕЕ МЕСТО.
- Удалить элементы «Конструкции» и «Реакции».
- «Праймеры (soon)» — **оставить** (станет глобальным View в M-E, заглушка нужна для discoverability).
- «Главная», «Библиотека» — оставить.

**Тесты:**
- `start-screen-data.test.js` (если есть) — обновить assertions на 4 пункта меню вместо 6.
- `Sidebar.test.jsx` (если есть в `__tests__/`) — обновить text query на «Загрузить .bodge...».
- Snapshot tests — пересохранить.

**Acceptance K2:**
- Sidebar показывает 4 пункта в РАБОЧЕЕ МЕСТО: Главная / Библиотека / Праймеры (soon) / Хоткеи.
- Кнопка показывает «↑ Загрузить .bodge...» с хоткеем `^O`.
- `npm test` зелёно.

### K3 — `library-zones.js` + librarySlice — упрощение зон, единственный activeProjectId

**Цель:** четыре зоны → две. Гарантия одного `activeProjectId`.

**Что меняется:**

В `lib/library-zones.js` (1.9 КБ):

Текущий код возвращает `loose | active_bodge | readonly_bodge | lab_pool`. Меняем на возврат `loose | bodge` (две зоны).

Сигнатура helper:
```
function classifyEntryZone(entry, ctx?) → 'loose' | 'bodge'
```

Логика:
- Если `entry.kind === 'primer' && entry.inLabStock === true` → раньше `lab_pool`, теперь — **выбрасываем флаг inLabStock в helper**, а зона — `loose` (если без проекта) или `bodge` (если с projectId). `inLabStock` остаётся флагом на entry, но не определяет зону.
- Если `entry.projectId` set → `bodge`.
- Иначе → `loose`.
- `ctx.activeProjectId` параметр **больше не используется** в classifier (active/readonly различение уехало в UI — Tree рендерит [active] tag по projectSlice.activeProjectId напрямую).

Constants: `VALID_ZONES = new Set(['loose', 'bodge'])`. `LIBRARY_ZONES = ['loose', 'bodge']`.

Lazy migration: entries с `entry.zone === 'active_bodge'` или `'readonly_bodge'` → derived to `'bodge'`. Entries с `entry.zone === 'lab_pool'` → derived через `entry.projectId` (если есть, → `bodge`; если нет, → `loose`). Migration runs in `hydrateLibrary` (где сейчас migration heuristics, DEC-LIB-MIGRATE-HEURISTIC-01).

В librarySlice (Code находит через grep `activeProjectId`, `projectSlice`):

`activateProject(id)` — ensure single-active. Если в данных приходит хвост [active] с других проектов, ОК — UI рендерит `[active]` только на одном через сравнение `entry.projectId === store.projectSlice.activeProjectId`. Нет «активной» entry — есть один активный проект.

**Тесты:**
- `library-zones.test.js` — обновить test cases. Раньше тест на 4 значения, теперь на 2. Migration test для entries с `zone: 'lab_pool'` / `'active_bodge'` / `'readonly_bodge'` → ожидаемая зона.
- librarySlice tests — `activateProject(id)` устанавливает activeProjectId. Никаких множественных активных.

**Acceptance K3:**
- `classifyEntryZone` возвращает только `'loose'` или `'bodge'`.
- LabPoolZone больше нигде не reference'ится в коде (grep `lab_pool`, `LabPoolZone`).
- Тесты зелёные после migration.

### K4 — Tree zones — переименование, единственный [active], убрать DAG-узел

**Цель:** Tree выглядит так:
```
⎀ БЕЗ ПРОЕКТА                    142
  Контейнеры                     142
  Праймеры                         0

📦 НОВЫЙ ПРОЕКТ.BODGE  [active]    2
  Контейнеры                       2
    bleMX6  922 bp · circular · 4 features  [+]
    kanMX  1357 bp · circular · 4 features  [+]
  Праймеры                         0

📦 32132131.BODGE                  0
  Контейнеры                       0
  Праймеры                         0
```

(квадратные скобки `[+]` — hover-revealed, реализуется в K5)

**Что меняется:**

`components/Library/tree/LooseZone.jsx` (9.2 КБ):
- Переименовать секцию через `STRINGS.library.loose.title`. Раньше hardcoded «К. личная подборка плазмид» — переключить.
- Иконка `🚩 К.` → `⎀` (новый Unicode символ для свободного стола, согласован в DEC-UIRREV-ZONES-MERGE-01).

`components/Library/tree/ProjectZone.jsx` (7.1 КБ):
- **Удалить рендер узла «DAG»** внутри проекта. Сейчас под `Контейнеры` рендерится узел `DAG` с числом entry.commits (или подобным). Убрать целиком. Если есть импорты — почистить.
- Тег `[active]` рендерится только когда `entry.projectId === activeProjectId` из projectSlice. Раньше показывался на entry с `entry.zone === 'active_bodge'` — это после K3 не работает (зона `bodge` единая). Переключить на сравнение через `useStore.projectSlice.activeProjectId`.

`components/Library/tree/LibraryTreeRoot.jsx` (7.1 КБ):
- Если рендерит `<LabPoolZone />` — удалить импорт и рендер.
- Pre-K3 рендерил две версии bodge-зон (active/readonly) — после K3 рендерит одну зону `bodge` с группировкой по `projectId`.

`components/Library/tree/LabPoolZone.jsx` (3.3 КБ) — **удалить файл**. Lab pool = View, не Zone (по архитектуре Игоря).

**Тесты:**
- `LooseZone.test.jsx` — обновить text «⎀ БЕЗ ПРОЕКТА».
- `ProjectZone.test.jsx` — assertion что узел DAG отсутствует. Tag [active] на одном проекте.
- `LibraryTreeRoot.test.jsx` — assertion что LabPoolZone не рендерится. Группировка bodge по projectId.
- Удалить `LabPoolZone.test.jsx` (если есть в `__tests__/`).

**Acceptance K4:**
- Tree рендерит две зоны: `⎀ БЕЗ ПРОЕКТА` + один `📦 *.bodge` блок на каждый проект.
- Тег `[active]` на одном проекте (или ни на одном если нет активного).
- Узла «DAG» внутри проектов нет.
- LabPoolZone удалён из codebase.

### K5 — Tree quick-add — hover-revealed «+»

**Цель:** заменить вечно видимую стрелку ↑ на каждой записи на «+» icon с hover-revealed pattern.

**Что меняется:**

`components/Library/tree/TreeItemRow.jsx` (6.9 КБ):
- Найти стрелку ↑ (Code определяет через grep `↑` или icon name).
- Заменить на `+` (или `➤` — Code решает по визуальной согласованности с остальным проектом, опираясь на DEC-LIB-K8-QUICKADD-01 паттерн где он живёт сейчас в Mine-секции).
- CSS: `opacity: 0` default → `:hover` (parent row) opacity `1`, transition 120 ms (DEC-LIB-K8-QUICKADD-01 шаблон).
- Видна **только когда** `activeProjectId !== null && entry.projectId !== activeProjectId`. Иначе скрыта (запись уже в активном проекте, добавлять не нужно).
- Click handler: `onClick = () => addContainerToActiveProject(entry.id)` + toast «{entry.name} добавлен в {activeProject.name}».
- Tooltip: `STRINGS.tree.row.quickAddTooltip`.

**Тесты:**
- `TreeItemRow.test.jsx` — добавить test case на hover-reveal: render row, query icon by role/test-id, assert opacity 0 / on `:hover` 1. Click handler called.
- Test case: when `activeProjectId === null`, icon не рендерится (или has `display: none`).
- Test case: when `entry.projectId === activeProjectId`, icon скрыт.

**Acceptance K5:**
- На скриншоте Tree после mouse hover на записи в чужой зоне (или в БЕЗ ПРОЕКТА когда есть активный проект) видна «+» иконка справа от метаданных.
- Click добавляет запись в активный проект, toast подтверждает.
- В записях активного проекта иконка скрыта.

### K6 — Inspector bottom-bar — переименования + удалить «Открыть» + context-aware disabled

**Цель:** bottom-bar Inspector выглядит так:
```
[Добавить в активный проект]  [Создать копию для правки]  [Переместить в папку...]  [Экспорт]  [Удалить]
```
(на скриншоте baseline было 6 кнопок: «Использовать в активном», «Открыть», «Manual-edit ветка», «Переместить», «Экспорт», «Удалить» — становится 5).

**Что меняется:**

`components/Library/inspector/LibrarySaveActions.jsx` (10.2 КБ) или `LibraryActionRow.jsx` (3.2 КБ) — Code определяет через grep какой компонент рендерит bottom-bar. Скорее всего LibrarySaveActions (имя «save actions» подходит к bottom-bar action panel).

Кнопки:
- «Использовать в активном» → переименовать через `STRINGS.inspector.actions.addToActiveProject`. Иконка остаётся (синий круг). 
  - **Disabled state:** когда `store.projectSlice.activeProjectId === null`. Tooltip: `STRINGS.inspector.actions.addToActiveProjectDisabled`.
  - **Hidden state:** когда entry уже в активном проекте (`entry.projectId === activeProjectId`). Кнопка не имеет смысла.
- «Открыть» — **удалить кнопку целиком**. Click handler в коде — найти все callsites и удалить (двойной клик в Tree остаётся единственной точкой входа).
- «Manual-edit ветка» → переименовать через `STRINGS.inspector.actions.createCopyForEdit`. Иконка ✏️ остаётся.
- «Переместить» → переименовать через `STRINGS.inspector.actions.moveToFolder`. Иконка 📁 остаётся.
- «Экспорт» / «Удалить» — без изменений.

Логика disabled для «Добавить в активный проект»:
```
const activeProjectId = useStore(s => s.projectSlice.activeProjectId);
const isInActive = entry.projectId === activeProjectId;
const noActive = activeProjectId === null;
const buttonState = noActive ? 'disabled' : isInActive ? 'hidden' : 'enabled';
```

**Тесты:**
- `LibrarySaveActions.test.jsx` (если есть) — обновить text queries. Удалить test для кнопки «Открыть» (она исчезла). Добавить test cases для disabled / hidden state кнопки «Добавить в активный».

**Acceptance K6:**
- Bottom-bar показывает 5 кнопок в указанном порядке.
- Кнопка «Открыть» отсутствует.
- Двойной клик по записи в Tree открывает Inspector (текущее поведение).
- В сценарии «нет активного проекта» кнопка «Добавить в активный проект» disabled с tooltip.
- В сценарии «entry уже в активном проекте» кнопка скрыта (или disabled с другим tooltip — Code решает, но скрытие чище).

### K7 — Топ-бар — дропдаун последних активных проектов

**Цель:** клик по «BodgeGene › Без активного проекта» (или по имени проекта когда активен) открывает дропдаун:
```
┌─────────────────────────────────┐
│ Недавние проекты                │
├─────────────────────────────────┤
│ 📦 НОВЫЙ ПРОЕКТ.BODGE  [active] │
│ 📦 32132131.BODGE              │
│ 📦 Старый эксперимент.BODGE    │
├─────────────────────────────────┤
│ + Создать проект                │
└─────────────────────────────────┘
```

**Что меняется:**

Code находит компонент топ-бара через grep `BodgeGene › ` или `noActiveProject` — это либо `AppShell/index.jsx`, либо отдельный `Topbar.jsx`. После Sidebar Single-Shell refactor (09.05.2026) точная структура — Code разбирается.

Новый под-компонент `RecentProjectsDropdown.jsx` (~3 КБ):
- Выпадайка по клику на crumb-зону (имя проекта / «Без активного проекта»).
- Источник данных: список всех `.bodge` entries в библиотеке (selectAllProjects из librarySlice). Сортировка по `updatedAt` desc, ограничение 8 последних.
- Текущий активный — с тегом `[active]`, не кликается (он уже активен).
- Остальные — кликабельны → `activateProject(id)` → дропдаун закрывается, header пересчитывает имя.
- Footer кнопка «+ Создать проект» — открывает существующий flow создания проекта.

Стиль: shadow + 200 px ширина + 8 px padding rows. Согласовать с design system (DEC-LIB-K8-QUICKADD-01 паттерны teach styling).

**Тесты:**
- `RecentProjectsDropdown.test.jsx` — render, click on item triggers activateProject, click on «+ Создать» triggers create flow, активный не кликается.

**Acceptance K7:**
- Click по топ-бар crumb открывает дропдаун.
- Список последних 8 проектов показывается.
- Click по проекту → активный меняется, DAG в правой панели обновляется.
- Click «+ Создать проект» → создание + activate.

### K8 — `activateProject(id)` — унификация openProject + import

**Цель:** функциональное закрытие DEC-PROJECT-OPEN-MERGE-01.

**Что меняется:**

В `lib/library-actions.js` (9.2 КБ) и/или librarySlice (Code определяет через grep `openProject`, `importBodge`, `activeProjectId`):

Создать `activateProject(id)` если ещё нет, или унифицировать существующие:
```
function activateProject(projectId)
  → ensures projectId is valid (project exists in IndexedDB)
  → flush current activeProject state to IndexedDB (PWA autosave hook)
  → set projectSlice.activeProjectId = projectId
  → toast «Открыт проект {name}» (опционально, по решению Code)
```

В существующем `import.bodge` flow (Code находит через grep `importBodge` или подобное):
- После создания project в IndexedDB и записи всех его entries → call `activateProject(newProjectId)`.

Удалить отдельный action `openProject(id)` если он был — `activateProject` его заменяет.

Все callsites старого `openProject` (Code находит через grep) — переключить на `activateProject`.

**Тесты:**
- `library-actions.test.js` — `activateProject(id)` устанавливает activeProjectId. Несуществующий id → throws or no-op (Code решает, но throws чище).
- `import.bodge` integration test — после успешного import активный проект — это импортированный.

**Acceptance K8:**
- В librarySlice одна функция `activateProject(id)`.
- Импорт `.bodge` сразу делает проект активным.
- Click по заголовку проекта в Tree → activateProject → правая панель обновляется.

### K9 — Cleanup и регрессионный прогон

**Цель:** удалить осиротевшие STRINGS ключи, прогнать full test suite.

**Что меняется:**

В `lib/strings.js`:
- Удалить `STRINGS.sidebar.openBodge` (заменён loadBodge в K2).
- Удалить `STRINGS.inspector.actions.open` (кнопка убрана в K6).
- Удалить ключи для пунктов «Конструкции» / «Реакции» (если они были выделены — Code решает по структуре файла).
- Старое имя Loose-зоны «К. личная подборка плазмид» если хранилось как ключ — удалить.

Финальный grep по удаляемым ключам — никто не должен на них ссылаться.

`npm test` + `npx vite build`:
- Тесты зелёные (~1666+/1666+ passing).
- Build clean.
- PWA precache в зоне baseline +/− 5 КБ (учитывая удалённые строки + добавленные).

**Acceptance K9:**
- `lib/strings.js` сжимается на удалённые ключи (~16-17 КБ ожидаемо).
- Все callsites используют новые ключи.
- `npm test` зелёно.
- `npx vite build` чисто.

---

## 6. Порядок выполнения

```
K1 (strings)
   ↓
K2 (Sidebar) ─────────────────┐
   ↓                           │
K3 (zones + librarySlice)     │
   ↓                           │
K4 (Tree zones)               │
   ↓                           │
K5 (Tree quick-add)           │
   ↓                           │
K6 (Inspector) ─────── K7 (Topbar dropdown)
   ↓                           ↓
K8 (activateProject) ──────────┘
   ↓
K9 (cleanup + regression)
```

K2, K6, K7 могут быть параллельны после K3, но разумнее последовательно для ясности коммитов.

Между K3 и K4 — обязательный `npm test` (migration логика — высокий риск регрессии).

После K8 — обязательный `npm test` (унификация openProject — затрагивает интеграционные пути).

---

## 7. STOP-условие и формат отчёта

**STOP-условие:**
- Все 9 K-блоков завершены.
- Финальный `npm test` зелёно (~1666+/1666+ passing, +/− тесты в зависимости от удалённых тестов LabPoolZone и добавленных RecentProjectsDropdown).
- `npx vite build` clean.
- Скриншот результата от Code (или текстовое описание) — Tree выглядит как описано в K4 acceptance, bottom-bar как в K6, дропдаун как в K7.
- **Не финализировать** PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / CLAUDE.md / BUGS.md / `docs/COMPONENT_MAP.md` — это работа Chat в следующей сессии после визуальной приёмки.
- Отчёт записывается в `CURRENT_TASK.md` в конце.

**Формат отчёта Code:**

```
## Отчёт Sprint UI-PROJ-ACT (M-X.7c)

### K1 — strings.js
- Добавлено N новых ключей в STRINGS namespaces sidebar / library / inspector / tree / topbar.
- Старые ключи openBodge / inspector.actions.open сохранены до K9.

### K2 — Sidebar
- Sidebar.jsx переключён на STRINGS.sidebar.loadBodge.
- start-screen-data.js: убраны пункты «Конструкции», «Реакции».
- Тесты обновлены: M прошли, K updated snapshots.

### K3 — Zones + activeProjectId
- library-zones.js: VALID_ZONES = ['loose', 'bodge'].
- Migration: K entries with zone='lab_pool' / 'active_bodge' / 'readonly_bodge' → derived to bodge or loose.
- librarySlice: activateProject(id) единственная точка установки activeProjectId.

### K4 — Tree
- LooseZone: title «⎀ БЕЗ ПРОЕКТА».
- ProjectZone: убран узел «DAG», тег [active] на одном проекте через сравнение с activeProjectId.
- LabPoolZone.jsx удалён.
- LibraryTreeRoot: убран импорт LabPoolZone, группировка bodge по projectId.

### K5 — Quick-add
- TreeItemRow: «+» icon hover-revealed, opacity 0 default → 1 on row hover.
- Visible только при activeProjectId set И entry.projectId !== activeProjectId.

### K6 — Inspector bottom-bar
- Кнопки переименованы через STRINGS.
- Кнопка «Открыть» удалена (handler удалён в N callsites).
- «Добавить в активный» disabled когда нет activeProjectId, hidden когда уже в активном.

### K7 — Topbar dropdown
- RecentProjectsDropdown.jsx ~K KB.
- Click по crumb открывает выпадайку, click по проекту вызывает activateProject.

### K8 — activateProject
- Единая точка входа в lib/library-actions.js.
- Импорт .bodge вызывает activateProject(newProjectId) после записи в IndexedDB.
- Старая action openProject удалена, callsites переключены (N штук).

### K9 — Cleanup
- Удалены осиротевшие STRINGS ключи: openBodge, inspector.actions.open, M других.
- lib/strings.js: было 16.9 КБ → стало X КБ.

### Итог
- Vitest: M / M passing + N skipped (было 1666 / 1666 + 1 skipped).
- pytest: 112 / 112.
- Build clean. PWA precache: X KiB (было 1171.16 KiB).
- Ничего из OUT не тронуто.

STOP. Жду визуальной приёмки.
```

---

## 8. Риски

1. **Migration K3 ломает существующие IndexedDB записи биолога.** Митигация: lazy migration в `hydrateLibrary` (idempotent, как DEC-LIB-MIGRATE-HEURISTIC-01) — entries со старыми зонами безопасно переписываются на runtime, оригинальные данные в IndexedDB остаются (миграция при чтении, не write-through). Если что-то пошло не так — биолог теряет только UI-zone, данные целы.

2. **Тесты по text-match массово ломаются.** Митигация: K1 добавляет новые ключи без удаления старых. K2-K8 переключают callsites, тесты в каждом блоке обновляются синхронно. K9 удаляет старое только когда никто не ссылается. Между блоками — `npm test`, чтобы ловить ранние регрессии.

3. **Старый `Library/index.jsx` Importer ломается.** Митигация: спека **не трогает** старый Importer. Он использует свою модель и свои строки. Тесты старого Importer пропускаются (они в очереди на удаление в Этапе 4 после R4).

4. **Двойной клик в Tree не открывает Inspector / Container Window после удаления кнопки «Открыть».** Митигация: Code проверяет в K6, что двойной клик handler существует и работает. Если кнопка «Открыть» вызывала отдельную логику (не overlap с двойным кликом) — копировать эту логику в `onDoubleClick` handler row, не терять.

5. **Topbar dropdown конфликтует с существующими click handlers на crumb.** Митигация: Code сначала grep'ит существующие handlers, документирует, потом добавляет dropdown как replacement. Если crumb был просто текстом — добавление click handler безопасно.

6. **`LabPoolZone.jsx` удаление ломает что-то живое.** Митигация: Code grep'ит `LabPoolZone` по проекту перед удалением. Если есть живые импорты — стоп, отчёт. Карта компонентов говорит «DEAD по архитектуре», но verified через grep.

---

## 9. Открытые вопросы

1. **Иконка quick-add: «+» или «➤»?** Биолог видит на скриншоте стрелку ↑, она ассоциируется с upload/export. Кандидаты:
   - **«+»** — добавление в активный, прямой смысл, известный паттерн.
   - **«➤»** — переслать / отправить, тоже подходит.
   - **«↗»** — отправить-вверх (используется в Inspector «Открыть»).
   - Code выбирает «+» по DEC-UIRREV-QUICKADD-HOVER-01, если биолог не возразил перед стартом.

2. **Tooltip на двойной клик («двойной клик — открыть в полном редакторе») — где живёт?** Варианты: на каждой Tree row (избыточно), на header проекта в Tree (один раз), в onboarding hint (одноразово). Code выбирает minimal — вообще без явного hint, биолог обнаружит через привычку (это стандартный жест).

3. **Когда биолог удаляет активный проект — что становится активным?** Варианты: следующий проект из списка / `null` (БЕЗ ПРОЕКТА) / последний открытый в истории. Code выбирает `null` как safest — биолог попадает в свободный режим, явно выбирает следующий.

4. **«Праймеры (soon)» в Sidebar остаётся или нет?** Решено в K2: оставить как заглушку (станет глобальным View в M-E). Если биолог хочет убрать — отдельная мини-правка.

5. **«+ Создать проект» в дропдауне — открывает текущий create flow или вариант в дропдауне?** K7 предполагает существующий flow (модалка с именем проекта). Если такого flow нет — K7 расширяется до создания этой модалки. Code сообщает в начале K7 если flow отсутствует.

---

## 10. Handoff Code

**Фраза для одной строки:**

> Прочитай CLAUDE.md, BUGS.md, CURRENT_TASK.md, docs/SPRINT_UI_PROJECT_ACTIVATION.md, docs/COMPONENT_MAP.md (R1 §17 playbook). Сделай Sprint M-X.7c — все 9 K-блоков последовательно по описанному порядку. Между K3-K4 и после K8 — обязательный `npm test`. Финальный прогон `npm test` + `npx vite build`. Отчёт в CURRENT_TASK.md в формате из §7 спеки. Не финализируй PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / CLAUDE.md / BUGS.md / docs/COMPONENT_MAP.md — это работа Chat следующей сессии после визуальной приёмки. На любом сомнении (LabPoolZone имеет живой импорт, openProject имеет неожиданные callsites, и т.п.) — стоп, отчёт Chat.

---

**Дата:** 10.05.2026.
**Размер спеки:** ~32 КБ (под лимит тип A 50 КБ).
