# Sprint M-X.7a — Library Structure rebuild (v2)

**Тип:** A — feature (новый workspace + top-level routing change + librarySlice extension + app-shell nav).
**База:** v0.8.0 (07.05.2026, M-X.5 Этап 2 закрыт). Ветка: `feature/m-x-7a-library-structure-v2` (форкается от main, не от M-C.1).
**Целевая версия:** v0.9.0.
**Предпосылка:** v0.8.0 признал Library primary workspace через ⚓ DEC-IMP-06, но реализация осталась встроенной в Importer (CatalogColumn → группа «Моя библиотека»). Биологу некуда идти после открытия app — workspace выбирается через Importer flow. Первая попытка Sprint M-X.7a v1 (08.05.2026) попала в 3-fail цикл из-за `readOnly={true}` глобально на Sequence/Annotations tabs — стирала функциональность LibrarySingleInspector. Эта v2 переосмыслена: Inspector body как-есть, новая обвязка вокруг.

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Размер | Лимит | Зона |
|------|--------|-------|------|
| `components/Library/index.jsx` | 34.81 KB | 40 KB | soft (rewrite в `LibraryWorkspace.jsx` + удаление старого) |
| `components/Library/tree/LibraryTree.jsx` | 38.31 KB | 40 KB | **близко к hard — wipe & rewrite в новые zone-aware компоненты** (см. §6 K2) |
| `components/Library/inspector/LibrarySingleInspector.jsx` | 38.40 KB | 40 KB | soft — **body не трогаем**. Только props delta (zone-awareness через item) и новый рядом `LibraryActionRow` (отдельный файл). |
| `components/Library/hooks/useLibraryState.js` | 22.76 KB | 25 KB | soft (.js) — правка для подписки на новый workspaceSlice + zone selectors |
| `App.jsx` | ~30 KB (оценка) | 40 KB | OK — минимальная правка: workspace switch wrapper |
| `store/canvasSlice.js` | (текущий) | 25 KB | OK — ничего не трогаем (workspace = новый slice) |
| `lib/strings.js` | (текущий) | без лимита | OK — additions только |

**Решения по зонам:**
- **LibraryTree.jsx — wipe & rewrite.** Старый файл 38.31 KB слишком близко к hard (40), любое расширение под zone-awareness переведёт в red. Вместо extend — rewrite как 5 новых компонентов 4-12 KB каждый. Старый файл переезжает в `docs/archive/code/LibraryTree_v1_pre_M-X.7a.jsx` для reference (один раз скопировать содержимое и удалить из `src/`).
- **index.jsx — soft rewrite.** Содержимое заменяется на `LibraryWorkspace.jsx` (новое имя ясно отражает роль). Старый `index.jsx` после rewrite — re-export shim либо удаляется (Code решает).
- **LibrarySingleInspector.jsx — body как есть.** Внешние props добавляются (zone, projectId), внутренние hooks `useEditableModeToggle(item)` правится для zone-aware initial state. Размер не растёт >1 KB.

Если в процессе K-step Code обнаружит что hard зона достигнута — STOP, mini-spec на декомпозицию через Chat.

---

## 0.1. Visual reference / Source of truth

**Mockup file:** `docs/design_assets/Library.html` (69.79 KB, от 08.05.2026, визуально принят).

**Mockup audit (выполнен Chat 09.05.2026):**

Структура DOM:
- `.frame > .nav (56px) + .app`
- `.app > .topbar + .lib`
- `.lib > .tree (312px) + .insp (1fr)`
- `.tree > .tree-head (sticky) + .tree-body (3 zones) + .tree-foot`
- `.insp > .insp-head + .tabs + .panel[data-panel]`

Design tokens из mockup (для DESIGN_SYSTEM проверки):
- `--surface-base/1/2/3`, `--border-subtle/default/strong`, `--text-primary/secondary/tertiary/disabled`
- `--accent-50/100/300/500/700` (Library accent — янтарный), `--accent-text`
- `--success-bg/fg`, `--warning-bg/fg`, `--danger-bg/fg`, `--info-bg/fg`
- `--feat-cds/prom/ori/term/res/rep/tag/his/prim/misc` + `--feat-stroke` (feature palette A+v2)
- `--shadow-sm/md/lg/xl/focus`
- `--font-ui (Inter)`, `--font-mono (JetBrains Mono)`

Все токены уже существуют в `DESIGN_SYSTEM.md` v1.0 — не вводим новые.

**Acceptance rule (mandatory phrasing):**
> Всё, что нарисовано в `Library.html` (основной layout + nav rail + topbar + tree с 3 зонами + Inspector с 4 табами + per-zone action-row × 4 варианта в нижней `secondary` секции + +Add modal) = приёмочный критерий.
>
> Что НЕ в mockup'е (hover/focus подсветки за пределами того что в CSS, prefers-reduced-motion, поведение клавиатурной навигации, drag-drop visual feedback) = polish, можно отложить, но Code в финальном отчёте перечислит unmet items с явным flag «приёмочный критерий или реальный polish?».

---

## 0.2. Component reuse audit

| Use | NOT use (legacy / superseded) | Reason |
|-----|-------------------------------|--------|
| `components/Library/inspector/LibrarySingleInspector.jsx` (M-X.5 baseline, body не трогаем) | rewrite Inspector с нуля | Игорь явно сказал в kickoff Q4: тело не трогаем. Существующие 4 таба, hooks, modals, hotkeys — работают. |
| `components/SequenceView/index.jsx` (M-B.3 rewrite, track-based, плюс M-X.3 wraptail) | `components/SequenceMapView.jsx` (Importer legacy) | DEC-SQV-07 plain fragments shape. M-X.7a v1 K3 fail: Code импортировал `SequenceMapView` потому что спека не указывала «use X NOT Y». Этот раз — указано. Inspector tabs уже импортируют правильное. |
| `components/Annotator/PreviewTab.jsx` pattern (M-X.3 canonical) | inline `AnnotationEditor` в новых компонентах | Annotations встроены в SequenceView через `AnnotationTrack`. Existing `AnnotationsTab.jsx` (2.75 KB) уже правильно использует Annotator. |
| `components/Library/onboarding/OnboardingNudge.jsx` + curated-categories | новый onboarding | Существующий M-X.5 K5 работает. |
| `components/Library/import/PreImportModal.jsx` (M-X.5 baseline, 21.52 KB) | новый +Add modal с нуля | +Add modal в Library.html — обёртка-источник над существующим PreImport flow. После выбора source tile (Файл/Paste/Каталог/Cross-project) запускается PreImport pipeline. См. §5. |
| `components/Library/inspector/hooks/useEditableModeToggle.js` (DEC-LIB-16 ⚓) | новый toggle | Уже работает. Правится только initial state — читает `item.zone` для default. |

**Терминология напоминание:** не путать superseded UI (`SequenceMapView` legacy) и v0.5 algorithmic codebase (`snapgene_parser`, `mutagenesis`, `restriction-db` — переиспользуем по DEC-V2-08).

---

## 0.5. Ответы Игоря на kickoff-интервью 09.05.2026

Снимок Q/A на момент интервью. Не правится после написания спеки.

**Scope:**

- **Q1.** Что в спринт включаем, что откладываем (после 3-fail M-X.7a v1)?
  **A.** Включаем: дерево с 3 зонами + верхняя панель + кнопка `+ Добавить` + 4 варианта кнопок-действий в Inspector по зоне + Library как стартовый экран. Откладываем: содержимое таба «История» (placeholder с counter'ом), импорт «Из другого .bodge» (заглушка), `⌘K` и фишки `>5kb · CDS` (пока обычный текстовый фильтр).

- **Q2.** Левая полоска с иконками экранов — рисуем сейчас или отдельный спринт?
  **A.** Рисуем сейчас. Container Window — это и есть Sequence Viewer + Аннотатор + Обзор + расширенное редактирование (праймеры, преобразования) для работы внутри DAG. Container Window открывается из конкретной записи (кнопка в Inspector action-row или двойной клик на DAG-узле), не из nav rail. В полоске — `⌂ Стартовый` (заглушка), `📚 Библиотека` (active), `🔀 DAG`, `⤓ Importer`, `⚗ Mix` (заглушка). 5 иконок. Заглушки — нормально, тултип «В разработке».

**Data model / migration:**

- **Q3.** Что делаем с накопленными entries при переезде на 3 зоны?
  **A.** Стираем IndexedDB при переходе на v0.9.0. Никакой миграции. Это dev-окружение, живых данных нет. Одна строка в RELEASES.md «v0.9.0: wipe IndexedDB schema bump».

**UX decisions:**

- **Q4.** Inspector — действительно не трогаем?
  **A.** Да. Тело Inspector'а (4 таба, selection, hotkeys E/H/Del, undo/redo, FeatureEditor, BLAST, scroll-to-position, save flow) — как есть. Меняются ровно две вещи: новая нижняя строка кнопок-действий (4 варианта по зоне — Loose/Active/Read-only/Lab) + read-only банер в Sequence/Annotations только для импортированных `.bodge`.

- **Q5.** Пустая библиотека — что показываем?
  **A.** Большая кнопка `+ Добавить` по центру + существующая панель с 7 категориями (M-X.5 K5).

- **Q6.** Acceptance — что считаем «готово»?
  **A.** `Library.html` рендерится один-в-один. Что не нарисовано — polish, Code в финале перечислит и пометит «приёмочный или polish?».

**Что не обсуждалось (стало моими предположениями в §5):**
- Drag-drop минимальный набор: Loose folder reorder + Loose item → active `.bodge` (clone). Cross-zone clone readonly→active либо lab→project — через action-row кнопки, не drag.
- DAG subrow в `.bodge` zone tree → клик меняет workspace на `dag` для этого projectId (не fullscreen overlay).
- Search field в topbar = простой substring filter по `entry.name` (case-insensitive). Без length-pattern, без feature-filter.
- Tree-level фильтр в `.tree-head` — отдельный input, дублирует topbar search для удобства (mockup имеет оба).

Если хоть одно из этих предположений — мимо, сказать на приёмке спеки до старта Code.

---

## 1. Контекст

v0.8.0 закрыл M-X.5 Library as workspace — `librarySlice` data API работает, Importer CatalogColumn `Моя библиотека` группа функционирует, save-flow с DEC-LIB-13 (Перезаписать / Сохранить как версию) принят. **Дыра:** Library встроена в Importer, биологу негде «жить» в библиотеке как в primary workspace.

Первая попытка M-X.7a v1 (53 KB спека, 08.05.2026) пыталась решить через wrapper-компоненты `Library/Inspector/tabs/SequenceTab.jsx` и `AnnotationsTab.jsx` с `readOnly={true}` глобально. Это стирало функциональность existing `LibrarySingleInspector` (selection, hotkeys, FeatureEditor, BLAST). Игорь поправил 3 раза — Chat не услышал. Memory note 09.05.2026: «readOnly={true} ТОЛЬКО для импортированных `.bodge` zone, НЕ глобально. SequenceTab + AnnotationsTab оба СОХРАНЯЮТ полный функционал.»

**v2 reframing:** существующий LibrarySingleInspector — корректное решение, его нужно **обернуть**, а не заменить. Read-only режим — это **initial state** existing хука `useEditableModeToggle(item)`, который выводится из `item.zone === 'readonly_bodge'`. Action-row меняется по зоне через новый `LibraryActionRow` рядом с Inspector, не внутри. Tree получает zone-awareness через wipe & rewrite (старый 38.31 KB слишком близко к hard).

---

## 2. Стратегия

Library становится top-level workspace через новый `workspaceSlice` (`active: 'library'|'construct'|'flow'|'importer'|'startup'|'mix'`). Default landing — `library`. App-shell — `AppShell.jsx` с 56px nav rail слева + основной content справа. Nav rail переключает workspace, Container Window и DAG fullscreen — overlay поверх workspace.

`LibraryWorkspace.jsx` (новое имя для бывшего `index.jsx`) — корневой компонент Library экрана: `LibraryTopBar` сверху + split-pane `LibraryTreeRoot` (312px, новый zone-aware) | `LibrarySingleInspector` (existing) + `LibraryActionRow` снизу Inspector (новый, per-zone variants).

Tree wipe & rewrite в zone-aware: 3 секции (Loose / `.bodge` projects / Lab pool) с разными item shapes. `librarySlice` extends новыми селекторами `selectEntriesByZone`, `selectContainersByProject`, etc. без миграции — IndexedDB стирается при schema bump.

+Add modal — новый компонент-обёртка над existing `PreImportModal`: 4 source tiles + drop zone + target radio, после выбора tile запускается PreImport pipeline без изменений.

---

## 3. Scope IN / OUT

### IN (этот спринт)

1. **App-shell `AppShell.jsx` + nav rail 56px.** 5 иконок: ⌂ Стартовый (заглушка), 📚 Библиотека (active state), 🔀 DAG, ⤓ Importer, ⚗ Mix (заглушка). Active state через `accent-50` фон + `accent-500` левую полоску. Tooltip на hover. Footer: ⚙ Настройки + ◐ Тема (обе заглушки).
2. **`workspaceSlice` top-level routing.** Active workspace + history + `setActiveWorkspace(name)` + `goBack()`. Default `library`. Совместимость с `canvas.activeFullscreen` (Container Window/DAG fullscreen — overlay поверх).
3. **`LibraryWorkspace` корневой экран Library.** Заменяет старый `Library/index.jsx`. TopBar + split-pane Tree | Inspector + ActionRow.
4. **`LibraryTopBar`.** Breadcrumb «BodgeGene › Активный проект: <name> [✓ сохранён]» (status pill из существующих save-flow данных), search 280px справа (простой substring filter по name), `🔔` placeholder, user avatar `IS`.
5. **Tree wipe & rewrite — zone-aware.** 3 секции с modifiers `.active` / `.readonly` / `.lab`:
   - **Loose `⚐ Без проекта`** — folders (Backbones / Inserts / etc через slash-path tags) + items (containers/primers).
   - **Project `📦 *.bodge`** — caption с pill `active` или `🔒 read-only`. Sub-rows: `🔀 DAG`, `📥 Контейнеры` (folder), `🧬 Праймеры` (folder).
   - **Lab pool `🧬 Лабораторный пул`** — две подсекции: `❄ В лаборатории` (`inLabStock=true`) + `📚 Из чужих проектов` (cross-project primers).
6. **Per-zone action-row под Inspector.** Новый `LibraryActionRow` под `LibrarySingleInspector` body. 4 варианта по зоне (loose/active/readonly/lab) — точная таблица в §5. Кнопки `getActionsFor(entry, zone)`.
7. **Read-only банер в Sequence/Annotations panels** для импортированных `.bodge`. Прокидывается через existing `useEditableModeToggle(item)`: когда `item.zone === 'readonly_bodge'` → `editable=false` initial + toggle disabled (нужна ручная manual-edit ветка). Банер рендерится внутри SequenceTab/AnnotationsTab при `editable=false` AND `item.zone === 'readonly_bodge'`. **Не для Loose** (там «sequence заморожен» — текст другой), **не для Active project** (там edit идёт через DAG операции).
8. **+Add modal.** Обёртка над existing `PreImportModal`. 4 source tiles (Файл / Вставить / Каталог / Из другого .bodge → stub modal «В разработке (M-X.9)»). Target radio (Активный / Без проекта / Лабпул — последний только для primer). Esc / click outside закрывают.
9. **Empty state.** Если IndexedDB пустой и нет активного проекта — большая кнопка `+ Добавить` по центру правого pane + existing `OnboardingNudge` (M-X.5 K5) под ней.
10. **Schema bump + IndexedDB wipe.** `db.js` bump version (v3 → v4 либо аналогичное), onUpgrade сбрасывает старые object stores. Никакой миграции entries. RELEASES.md строка про wipe.
11. **Поля LibraryEntry: `zone`, `projectId`, `inLabStock`, `parentEntryId`, `parentEntryHash`** — добавляются в shape, заполняются на момент создания entry (новый поток после wipe).

### OUT (отложено явно)

- Содержимое таба История (placeholder остаётся с counter'ом, version-actions disabled с tooltip «M-X.7b: версионирование»).
- Cross-project import wizard (`Из другого .bodge` source tile = stub modal с ссылкой на M-X.9).
- «Открыть как активный проект» action в read-only zone (alert «В разработке (M-X.9)»).
- Command palette ⌘K + length-pattern (`>5kb`) + feature-filter (`CDS`) — M-X.7c.
- Container Window UI правки (открывается existing M-C.1 baseline, как есть).
- Group projects (post-M-I).
- Mobile layout (DEC-V2-19).
- Multi-select / box-select (M-X.10+).
- Drag-drop cross-zone (минимум: Loose folder reorder + Loose item → active `.bodge` clone — больше через action-row кнопки).

---

## 4. Архитектурные решения (DEC-MX7A-V2-NN)

**DEC-MX7A-V2-01.** Library — top-level workspace через новый `workspaceSlice`, не append в `canvasSlice`. Изоляция: workspace router отдельно от canvas state.

**DEC-MX7A-V2-02.** Inspector body не трогаем. Existing `LibrarySingleInspector` принимает `item` с новыми полями (`zone`, `projectId`). `useEditableModeToggle(item)` правится для zone-aware initial state. ActionRow — отдельный компонент рядом, не внутри Inspector.

**DEC-MX7A-V2-03.** Wipe IndexedDB на schema bump. Никакой миграции entries. Dev-окружение, нет живых данных.

**DEC-MX7A-V2-04.** Tree wipe & rewrite. Старый `LibraryTree.jsx` 38.31 KB → 5 новых компонентов в `tree/v2/` (см. §5). Старый файл переезжает в `docs/archive/code/` для reference.

**DEC-MX7A-V2-05.** Read-only банер только в Sequence/Annotations panels для `item.zone === 'readonly_bodge'`. Loose entries имеют отдельную фразу «sequence заморожен — DEC-LIB-05» в Sequence panel notes. Active project entries — без банера (edit через DAG).

**DEC-MX7A-V2-06.** App-shell с nav rail 56px рисуется в этом спринте. 5 иконок, 2 заглушки (`⌂ Стартовый`, `⚗ Mix`). Заглушки — серые, tooltip «В разработке».

**DEC-MX7A-V2-07.** +Add modal — обёртка-источник над existing `PreImportModal`. После выбора source tile запускается PreImport pipeline без изменений (DEC-IMP-13).

**DEC-MX7A-V2-08.** Default landing на Library workspace. Старый landing (Quick Start panel в DesignCanvas) остаётся доступен через `⌂ Стартовый` — заглушка в этой версии.

**DEC-MX7A-V2-09.** DAG subrow в `.bodge` zone tree → переключение workspace на `flow` для `projectId` записи. Не fullscreen overlay.

**DEC-MX7A-V2-10.** Drag-drop минимально: Loose folder reorder + Loose item → active `.bodge` (clone). Cross-zone операции — через action-row кнопки. Расширенный drag-drop — M-X.7c.

**DEC-MX7A-V2-11.** Search в topbar = простой substring filter по `entry.name` (case-insensitive). Tree-level filter в `.tree-head` — отдельный input, дублирует функциональность для удобства.

**DEC-MX7A-V2-12.** Workspace switching: при переключении nav rail с Library на DAG/Importer — Library state (selection, expanded zones) сохраняется в slice, восстанавливается при возврате.

Кандидаты в ⚓ ANCHORS (после acceptance): DEC-MX7A-V2-01 (workspace as top-level routing concept), DEC-MX7A-V2-02 (Inspector composition over inheritance — wrapping, not rewriting), DEC-MX7A-V2-05 (zone-aware editability initial state).

---

## 5. Файлы / helper signatures / структура

### 5.1. Новые файлы

| Файл | Размер (target) | Содержимое |
|------|-----------------|------------|
| `store/workspaceSlice.js` | ~3 KB | top-level workspace router (см. §5.2) |
| `components/AppShell/AppShell.jsx` | ~3 KB | layout shell: nav rail + content area |
| `components/AppShell/NavRail.jsx` | ~3 KB | 56px nav rail с 5 иконками + footer (⚙/◐) |
| `components/Library/LibraryWorkspace.jsx` | ~4 KB | корневой Library экран (заменяет index.jsx) |
| `components/Library/LibraryTopBar.jsx` | ~3 KB | breadcrumb + search + bell + user |
| `components/Library/tree/v2/LibraryTreeRoot.jsx` | ~4 KB | контейнер 3 зон + tree-head + tree-foot |
| `components/Library/tree/v2/LibraryZone.jsx` | ~3 KB | универсальный zone wrapper (modifiers active/readonly/lab) |
| `components/Library/tree/v2/LooseZone.jsx` | ~5 KB | `⚐ Без проекта` — folders + items, slash-path → folder tree |
| `components/Library/tree/v2/ProjectZone.jsx` | ~6 KB | `📦 *.bodge` — DAG subrow + Контейнеры folder + Праймеры folder, modifiers active/readonly |
| `components/Library/tree/v2/LabPoolZone.jsx` | ~5 KB | `🧬 Лабораторный пул` — В лаборатории + Из чужих проектов sub-sections |
| `components/Library/tree/v2/TreeItemRow.jsx` | ~5 KB | строка container/primer с mini-ring SVG + origin icon |
| `components/Library/tree/v2/TreeFolderRow.jsx` | ~3 KB | строка folder с twist + count + context-menu |
| `components/Library/inspector/LibraryActionRow.jsx` | ~4 KB | per-zone action-row под Inspector, использует `getActionsFor` |
| `components/Library/AddModal/AddModal.jsx` | ~3 KB | source-tile picker + target radio + dropzone, оборачивает PreImportModal |
| `components/Library/AddModal/SourceTiles.jsx` | ~2 KB | 4 tiles (Файл / Paste / Каталог / Cross-project) |
| `components/Library/AddModal/CrossProjectStub.jsx` | ~1 KB | заглушка «В разработке (M-X.9)» |
| `lib/library-zones.js` | ~2 KB | helpers: `classifyEntryZone(entry)` etc. |
| `lib/library-actions.js` | ~5 KB | `getActionsFor(entry, zone)` table — 4 варианта по zone × kind (container/primer) |

**Estimated total новых файлов:** ~64 KB. Все в soft зоне (.jsx hard 40, .js hard 25).

### 5.2. workspaceSlice (signatures + поведение)

```
state.workspace = {
  active: 'startup' | 'library' | 'construct' | 'flow' | 'importer' | 'mix',  // default 'library'
  history: string[]  // stack of previous workspaces, limit 10
}

actions:
  setActiveWorkspace(name)   // pushes current to history, sets active
  goBack()                    // pops history, sets active

selectors:
  selectActiveWorkspace(s)
  selectIsInLibrary(s)
  selectCanGoBack(s)
```

При `setActiveWorkspace('flow', { projectId })` — workspace меняется + опциональный side-effect (открыть DAG для конкретного проекта).

### 5.3. librarySlice extensions

Новые поля LibraryEntry shape: `zone: 'loose' | 'active_bodge' | 'readonly_bodge' | 'lab_pool'`, `projectId: string|null`, `inLabStock: boolean`, `parentEntryId: string|null`, `parentEntryHash: string|null`.

Новые actions:
- `moveEntryToFolder(entryId, slashPath)` — обновляет `entry.tags`, slash-path для folder structure (DEC-CAT-04 reuse).
- `cloneEntryToActiveProject(entryId)` — создаёт child entry с `zone: 'active_bodge'`, `projectId`, `parentEntryId`, `parentEntryHash`.
- `extractEntryToLoose(entryId)` — обратное: удаляет привязку к проекту, переносит в Loose.
- `toggleLabStock(entryId)` — `inLabStock` flag toggle.
- `createLooseFolder(slashPath)`, `renameLooseFolder(oldPath, newPath)`, `deleteLooseFolder(slashPath)`.

Новые селекторы:
- `selectEntriesByZone(zone)` — фильтр по zone.
- `selectContainersByProject(projectId)`, `selectPrimersByProject(projectId)` — для ProjectZone tree.
- `selectLooseTreeStructure()` — derives folder tree из tags slash-paths (reuse `lib/folder-tree.js`).
- `selectLabPoolStructure()` — splits into `inLabStock=true` + cross-project primers.
- `selectPrimerUsageCount(primerId)` — count of projects using primer.

### 5.4. Action-row table (`getActionsFor(entry, zone)`)

| Zone | Kind | Действия (label · icon · variant) |
|------|------|------------------------------------|
| **loose** | container | 📋 Использовать в активном (primary) · ↗ Открыть · ✎ Manual-edit ветка · 📁 Переместить · ⤓ Экспорт · 🗑 Удалить (danger) |
| **loose** | primer | 🧪 Использовать в проекте (primary) · ✎ Редактировать · 📁 Переместить · ⤓ Экспорт · 🗑 Удалить (danger) |
| **active_bodge** | container | ↗ Container Window (primary) · 🔀 Показать в DAG · 📤 Извлечь в Loose · 📚 Сохранить как версию · 📋 Клонировать · ⤓ Экспорт GenBank · 🗑 Удалить из проекта (danger) |
| **active_bodge** | primer | 🧪 Использовать в DAG (primary) · 📤 Извлечь в Loose · 📚 Сохранить как версию · 🗑 Удалить из проекта (danger) |
| **readonly_bodge** | container | 📋 Скопировать в активный (primary) · 📋 Скопировать в Loose · 🔓 Открыть как активный (alert M-X.9) · ↗ Просмотр |
| **readonly_bodge** | primer | 📋 Скопировать в активный (primary) · 📋 Скопировать в Loose · 🔓 Открыть как активный (alert M-X.9) |
| **lab_pool** | primer | 🧪 Использовать в проекте (primary) · ✎ Редактировать заметки · ❄ Снять/Поставить метку · 🗑 Удалить (danger) |

Action object shape: `{ label, icon, variant: 'primary'|'default'|'ghost'|'danger', onClick: handler, disabled?: boolean, tooltip?: string }`.

Реализация: `getActionsFor(entry, zone)` возвращает массив. Handlers подаются через context либо store actions. Disabled actions для версионирования (M-X.7b) — `disabled: true, tooltip: 'M-X.7b: версионирование'`.

### 5.5. Read-only banner — где, какой текст

| Tab | Zone | Текст |
|-----|------|-------|
| Sequence | readonly_bodge | 🔒 Просмотр read-only. Для редактирования [откройте в Container Window](handler) или создайте manual-edit ветку. |
| Sequence | loose | (нет банера, если frozen — под input notes маленьким текстом «sequence заморожен по DEC-LIB-05») |
| Sequence | active_bodge | (нет банера) |
| Sequence | lab_pool | (нет банера) |
| Annotations | readonly_bodge | 🔒 Просмотр read-only. Edit аннотаций — [в Container Window](handler). |
| Annotations | другие | (нет банера) |

### 5.6. STRINGS additions

Namespace `STRINGS.libraryWorkspace`:
- `zoneLooseTitle = "Без проекта"`
- `zoneLooseSub = "свободная зона"`
- `zoneLabTitle = "Лабораторный пул"`
- `zoneLabSub = "primer'ы в морозильнике"`
- `dagSubrow = "DAG"`
- `containersFolder = "Контейнеры"`
- `primersFolder = "Праймеры"`
- `inLab = "В лаборатории"`
- `crossProject = "Из чужих проектов"`
- `addBtn = "+ Добавить"`
- `breadcrumbActive = "Активный проект:"`
- `breadcrumbNoProject = "Без активного проекта"`
- `searchPlaceholder = "Поиск по библиотеке…"`
- `treeFilterPlaceholder = "Фильтр в дереве…"`
- `roBannerSequence = "🔒 Просмотр read-only. Для редактирования откройте в Container Window или создайте manual-edit ветку."`
- `roBannerAnnotations = "🔒 Просмотр read-only. Edit аннотаций — в Container Window."`
- 4 action-label sub-namespaces: `actionsLoose`, `actionsActive`, `actionsReadonly`, `actionsLab`.

Также `STRINGS.appShell.navTooltip*` для 5 иконок и 2 footer'ов.

EN-комментарий рядом с RU значением (паттерн M-C.1 K5). Если Code решит иначе — флаг в отчёт.

---

## 6. Порядок K-step

### K1 — workspaceSlice + IndexedDB schema bump

- `store/workspaceSlice.js` (~3 KB).
- `db.js` — bump schema version, onUpgrade сбрасывает все object stores. Тесты пересоздаются на пустом DB.
- `librarySlice` extensions: новые поля LibraryEntry shape, новые actions/selectors из §5.3.
- **Тесты:** ~12-15 unit (workspace transitions + librarySlice новые actions/selectors).
- **Регрессия-guard:** existing librarySlice API (`addLibraryEntry`, `selectVisibleLibraryEntries`, etc.) — green на пустом DB. Importer CatalogColumn «Моя библиотека» — green после пересоздания entries через UI.

### K2 — Tree wipe & rewrite (zone-aware)

- **Перед K2:** копия старого `LibraryTree.jsx` в `docs/archive/code/LibraryTree_v1_pre_M-X.7a.jsx`. Удалить из `src/`. Вместе с ним проверить: `LibraryGroupHeader.jsx`, `LibraryItemRow.jsx`, `LibraryNestedSubGroup.jsx` — какие из них переиспользуются в новых компонентах, какие удаляются. Что удалено — флаг в отчёт (TD-LIBRARY-TREE-DEAD-CODE если что-то не выяснено).
- 7 новых файлов в `tree/v2/` (из §5.1).
- Folder operations через slash-path tags (DEC-CAT-04 reuse) + new actions из §5.3.
- **Тесты:** ~10 component (zone rendering + folder operations + DAG subrow click).
- **Регрессия-guard:** новых regressions ноль (старый Tree удалён, тестов на него больше нет — старые тесты тоже удаляются вместе с компонентом).

### K3 — Inspector wrapping (LibrarySingleInspector + LibraryActionRow)

- **R1 (must-do первой задачей):** Code проверяет `useEditableModeToggle.js` — readает ли он `item.zone` для initial state. Если да — go. Если нет — добавляет: при `item.zone === 'readonly_bodge'` initial `editable=false`, toggle требует confirmation через `useManualEditBranching`. **Без правки Inspector body.**
- `LibraryActionRow.jsx` — новый компонент под Inspector. Использует `getActionsFor(entry, zone)`.
- `lib/library-actions.js` — таблица 4 вариантов по zone × kind (§5.4). Disabled actions для M-X.7b — tooltip + disabled.
- Read-only банер: правка SequenceTab.jsx + AnnotationsTab.jsx (existing tabs) — добавляется conditional рендер баннера сверху панели при `editable=false && item.zone === 'readonly_bodge'`. Минимальная правка, размер каждого файла растёт <1 KB.
- **Тесты:** ~8 component (action-row variants per zone + read-only banner conditional + handler dispatching).

### K4 — LibraryWorkspace + LibraryTopBar

- `LibraryWorkspace.jsx` (~4 KB) — заменяет старый `index.jsx`. Layout: TopBar + split-pane (312px Tree | 1fr Inspector + ActionRow).
- `LibraryTopBar.jsx` (~3 KB) — breadcrumb (читает active project из projectSlice) + search + bell placeholder + user avatar.
- Search filter: `useState` для query, передаётся в Tree через context либо prop. Tree-level filter в `.tree-head` — синхронизирован с topbar search (один источник правды).
- Empty state: при пустой `selectVisibleLibraryEntries()` рендер большой `+ Добавить` CTA + `OnboardingNudge`.
- **Тесты:** ~5 integration (workspace mount + breadcrumb update + search filter).

### K5 — AppShell + NavRail + App.jsx routing

- `AppShell.jsx` (~3 KB) — root layout: `<NavRail/>` + `<WorkspaceContent/>`. WorkspaceContent — switch по `workspace.active`.
- `NavRail.jsx` (~3 KB) — 5 иконок + 2 footer заглушки. Active state visual — `.accent-50` фон + `.accent-500` лента слева. Tooltip на hover.
- `App.jsx` правка: вместо текущего root rendering — `<AppShell>`. Default `workspace.active='library'`.
- Для existing fullscreen overlays (Container Window M-C.1 baseline, DAG fullscreen) — `canvas.activeFullscreen` остаётся, рендерится поверх workspace по логике существующего App.jsx.
- **Тесты:** ~5 integration (nav rail click → workspace switch + active state + fullscreen overlay не ломается).

### K6 — AddModal + +Add button wiring

- `AddModal.jsx` + `SourceTiles.jsx` + `CrossProjectStub.jsx` (из §5.1).
- Wiring: `+Add` button в `LibraryTopBar` (`Tree-head` уже имеет button по mockup) → открывает AddModal. После выбора source tile + target radio → `submit` запускает existing `PreImportModal` flow (минимально передаёт `presetTarget` и `presetSource`).
- 4 source tile кликов:
  - **Файл:** existing file picker → PreImport.
  - **Paste:** existing paste textarea → PreImport.
  - **Каталог:** existing CatalogColumn data через `useCatalogSources` → PreImport.
  - **Из другого .bodge:** `CrossProjectStub` modal «В разработке (M-X.9)».
- Esc/click outside закрывают AddModal без сохранения.
- **Тесты:** ~5 component (source tile selection + target radio + cross-project stub + PreImport handoff).

### K7 — STRINGS + polish + edge cases

- `lib/strings.js` namespaces из §5.6.
- Hover/focus polish из mockup CSS (state-based).
- prefers-reduced-motion для drag-drop animations.
- Drag-drop минимум: Loose folder reorder через @dnd-kit либо native HTML5 drag (Code решает); Loose item → active `.bodge` clone (drop target подсвечивается).
- DAG subrow click → `setActiveWorkspace('flow', { projectId })`.
- **Тесты:** ~5-7 (drag-drop scenarios + STRINGS coverage).

---

## 7. STOP-условие

После K1-K7 commits Code останавливается на ветке `feature/m-x-7a-library-structure-v2`:

> «K1-K7 landed. Финальные счётчики: Vitest XXXX passing, pytest 112/112 passing. Build clean. Жду визуальной приёмки M-X.7a v2 — не финализирую PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / CLAUDE.md.»

**Не финализировать без acceptance:** PROJECT_STATE.md, RELEASES.md, DECISIONS.md (DEC-MX7A-V2-01..12 уже в спеке, promotion в DECISIONS только после acceptance), ANCHORS.md (кандидаты — после Игорь решает), TECH_DEBT.md, BUGS.md (только если найден existing bug — добавить в OPEN, не закрывать), CLAUDE.md (drift fix откладывается до acceptance).

---

## 8. Формат отчёта Code в конце сессии

Code дописывает в `CURRENT_TASK.md` секцию «Отчёт K1-K7»:

1. **Коммит-хэши** по каждому K-step (~7 hashes).
2. **Финальные счётчики:** Vitest passing/total, pytest 112/112, build status, PWA precache size delta.
3. **Размеры новых файлов** — таблица топ-15 крупнейших новых файлов в `components/Library/`, `components/AppShell/`, `store/`, `lib/`, плюс delta для тронутых existing файлов (`SequenceTab.jsx`, `AnnotationsTab.jsx`, `useEditableModeToggle.js`, `App.jsx`, `lib/strings.js`).
4. **Отклонения от спеки** — explicit блок:
   - Расщепление K на под-коммиты.
   - Решения Code где спека неоднозначна (особенно: workspaceSlice scope; что удалено из old Tree zone; PreImport handoff детали).
   - Размер файлов мимо §5.1 targets.
   - R1 (useEditableModeToggle) — был ли zone-aware initial state в existing хуке либо потребовалась правка.
5. **Hard violation flag** — explicit red flag если файл влез в hard зону (40 KB .jsx / 25 KB .js).
6. **Что не сделано из mockup'а** — список polish items с явным flag «приёмочный или отложить?» (acceptance rule из §0.1).
7. **TD-pencil-marks:**
   - Старый `Library/index.jsx` после rewrite — удалён или re-export shim?
   - Удалённые файлы из `tree/` (LibraryGroupHeader/ItemRow/NestedSubGroup) — какие переиспользованы, какие удалены.
   - Importer CatalogColumn «Моя библиотека» group — теперь redundant (Library workspace покрывает функционал) → флаг для M-X.6 cleanup.
   - Drag-drop scope — что покрыто, что отложено.

---

## 9. Риски

**R1. `useEditableModeToggle.js` не zone-aware.** Если хук не читает `item.zone` для initial state — нужна правка. Митигация: K3 первой задачей. Если правка тривиальна (≤10 строк) — go. Если хук deeply hard-coded — STOP K3, эскалация Chat (возможно nuance для readonly_bodge не очевиден).

**R2. App.jsx rewrite ломает existing fullscreen overlays.** Container Window M-C.1 baseline, DAG fullscreen, и другие модалы (FeatureEditor, ManualEditConfirm, Autoname, PrimerWizard) живут в `canvas.activeFullscreen` или global modal stack. Митигация: K5 sound testing — после AppShell wrap, fullscreen overlay должен рендериться поверх workspace. Если что-то ломается — конкретный overlay в отчёт.

**R3. Wipe IndexedDB ломает existing dev data.** Это намеренное (DEC-MX7A-V2-03). Игорь подтвердил «нет живых данных». Митигация: одна строка в RELEASES.md про wipe + warning в console на первом запуске v0.9.0 «schema bump v3 → v4: данные стерты».

**R4. PreImportModal handoff из AddModal — несовпадение signatures.** Existing PreImportModal принимает определённые props (file, parsed data, etc.). AddModal передаёт source+target preset. Митигация: K6 проверка минимального handoff (2-3 props добавляются в PreImportModal без breaking changes existing Importer flow).

**R5. Search в topbar и tree-head — два source of truth.** Если Code случайно сделает локальный state в каждом — фильтрация рассинхронизируется. Митигация: один state в `LibraryWorkspace.jsx`, прокидывается props в оба input'а.

**R6. Tree wipe & rewrite оставляет dead code.** Старые компоненты (LibraryGroupHeader/ItemRow/NestedSubGroup) могут переиспользоваться в других местах (Importer CatalogColumn?). Митигация: K2 grep по проекту перед удалением. Что переиспользуется — оставляем, что нет — в archive.

**R7. Размер новых файлов превысит soft warnings.** Tree v2 (~7 файлов) и AppShell (~2 файла) могут вырасти. Митигация: targets в §5.1 — оценочные. Если файл превышает soft на K-step — Code сразу декомпозирует (split на 2-3 файла) либо STOP с эскалацией.

---

## 10. Открытые вопросы

**OQ1.** Папка `tree/v2/` или просто новые компоненты в `tree/`? Если v2/ — потом ребус с переименованием в M-X.7b. Если нет — старые удалённые компоненты не должны конфликтовать с именами. **Default:** новые компоненты прямо в `tree/`, старые удалены вместе с `LibraryTree.jsx`. Если наследие создаёт конфликты — Code решает в K2 и фиксирует в отчёте.

**OQ2.** Старый `Library/index.jsx` после rewrite — удаление или re-export shim для backward compat (если где-то остался импорт `from 'Library'`)? **Default:** удалить. Code исправляет все callsites. Если callsites > 5 — re-export shim на одну сессию, TD-LIBRARY-INDEX-RESHIM на удаление в M-X.7c.

**OQ3.** Empty state когда `selectVisibleLibraryEntries()` пустой, но `OnboardingNudge` уже показывался (`localStorage.onboardingDismissed=true`)? **Default:** OnboardingNudge не показывается повторно (existing M-X.5 K5 поведение). Большая `+ Добавить` CTA остаётся.

**OQ4.** `🔔` иконка в topbar — заглушка с tooltip «уведомления — в разработке» либо вообще не рендерится? **Default:** рендерится с tooltip-заглушкой (mockup её показывает).

---

**Дата:** 09.05.2026 (kickoff Sprint M-X.7a v2 после 3-fail цикла v1 на 08.05.2026; полная переработка после интервью).
**Spec source-of-truth:** этот файл.
**Visual source-of-truth:** `docs/design_assets/Library.html` v 08.05.2026.
**Replaces:** Sprint M-X.7a v1 (53 KB спека, физически отсутствует в репо после fail; CURRENT_TASK.md ссылки устаревшие на момент 09.05.2026).
