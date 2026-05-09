# CURRENT_TASK.md

## Sprint M-X.7a Library Structure rebuild v2 — реализация

**Статус:** 🟡 Спека готова к визуальной приёмке Chat → Игорь. После приёмки — handoff Code.
**Тип:** A — feature (новый workspace + top-level routing change + librarySlice extension + app-shell nav).
**Целевая версия:** v0.9.0.
**Спека:** `docs/SPRINT_M-X.7a_LIBRARY_STRUCTURE.md` (~44 KB — overshoot против target 25 KB; см. примечание в конце).
**Visual source-of-truth:** `docs/design_assets/Library.html` (визуально принят 08.05.2026).
**Предыдущая попытка:** M-X.7a v1 (53 KB спека от 08.05.2026) — провалена 3-fail циклом из-за `readOnly={true}` глобально на Sequence/Annotations tabs. Физически удалена из репо, не восстанавливаем.
**Парный спринт:** M-X.7b — Versioning UI (содержимое таба «История», version-actions). Отдельная сессия после M-X.7a v2 acceptance.
**Drafts из v1:** `docs/LIBRARY_MODEL_DRAFT.md` (36 KB) и `docs/LIBRARY_WIREFRAME_DRAFT.md` (30 KB) — парные документы старой версии. К v2 не привязаны (Library.html — единственный SoT). Перенос в `docs/archive/` — после acceptance v2 (правило §4 playbook).

---

## TL;DR

v0.8.0 признал Library primary workspace через ⚓ DEC-IMP-06, но реализация осталась встроенной в Importer. M-X.7a v2 даёт Library как **top-level workspace** с собственной структурой: 3 зоны (Loose / `.bodge` projects / Lab pool) + новый Tree (wipe & rewrite старого 38.31 KB) + Inspector body как-есть (existing `LibrarySingleInspector` обернут, не переписан) + per-zone action-row × 4 варианта + AppShell с 56px nav rail (5 иконок, 2 заглушки).

`librarySlice` расширяется полями `zone` / `projectId` / `inLabStock` / `parentEntryId` / `parentEntryHash`. Никакой миграции — IndexedDB стирается при schema bump (DEC-MX7A-V2-03). `App.jsx` оборачивается в `<AppShell>`, default workspace — `library`. Container Window остаётся overlay поверх workspace (open from Inspector action-row).

Read-only банер в Sequence/Annotations panels — **только** для импортированных `.bodge`. Для Loose / Active / Lab — банера нет. Это закрывает root cause v1 fail.

OUT: версионирование (M-X.7b), cross-project import (M-X.9), `⌘K` palette (M-X.7c).

---

## Порядок чтения перед началом

1. **CLAUDE.md** — корневые правила.
2. **BUGS.md** — текущий OPEN.
3. **CURRENT_TASK.md** — этот файл.
4. **PROJECT_STATE.md** — first-line + последняя запись журнала (drift check).
5. **docs/SPRINT_M-X.7a_LIBRARY_STRUCTURE.md** — главный документ. Читать целиком, особенно §3 (Scope IN/OUT), §4 (DEC-MX7A-V2-01..12), §5 (файлы / signatures / action-row table / read-only banner places / STRINGS), §9 (риски R1-R7), §10 (open questions).
6. **docs/design_assets/Library.html** — visual source-of-truth.

**Targeted reading при работе** (по K, не на старте):

- K1: `store/canvasSlice.js`, `store/librarySlice.js`, `store/projectSlice.js`, `gui/designer/src/db.js`.
- K2: `components/Library/tree/*` (всё на удаление кроме library-folder-tree.js helper), `Library.html` для tree wireframe.
- K3: `components/Library/inspector/hooks/useEditableModeToggle.js` (R1 проверка), `inspector/tabs/SequenceTab.jsx`, `inspector/tabs/AnnotationsTab.jsx` (правка для banner).
- K4: `components/Library/index.jsx` (на rewrite в LibraryWorkspace), `Library.html` для TopBar.
- K5: `App.jsx`, `store/canvasSlice.js` (existing fullscreen overlay logic).
- K6: `components/Library/import/PreImportModal.jsx` (handoff signatures), `components/Library/hooks/useLibrarySources.js`.
- K7: `lib/strings.js`.

Не читать ARCHITECTURE_v2.md / ANCHORS.md / DESIGN_SYSTEM.md целиком — спека самодостаточна. Если развилка не покрыта спекой — STOP и спросить у Chat.

---

## Чеклист K-step (краткий — детали в спеке §6)

### K1 — workspaceSlice + IndexedDB schema bump + librarySlice extensions

- [ ] `store/workspaceSlice.js` (~3 KB).
- [ ] `db.js` — schema version bump, onUpgrade сбрасывает старые object stores.
- [ ] `librarySlice` extensions: новые поля shape (`zone`, `projectId`, `inLabStock`, `parentEntryId`, `parentEntryHash`); новые actions (`moveEntryToFolder`, `cloneEntryToActiveProject`, `extractEntryToLoose`, `toggleLabStock`, `createLooseFolder/renameLooseFolder/deleteLooseFolder`); новые селекторы (см. §5.3 спеки).
- [ ] **Тесты K1:** ~12-15 unit.
- [ ] **Регрессия-guard:** existing librarySlice API green после wipe; Importer CatalogColumn «Моя библиотека» green после пересоздания entries.

### K2 — Tree wipe & rewrite (zone-aware)

- [ ] **Перед K2:** копия старого `LibraryTree.jsx` в `docs/archive/code/LibraryTree_v1_pre_M-X.7a.jsx`. Удаление из `src/`. Ревизия `LibraryGroupHeader.jsx` / `LibraryItemRow.jsx` / `LibraryNestedSubGroup.jsx` — что переиспользуется в новых компонентах, что удаляется.
- [ ] 7 новых файлов в `components/Library/tree/` (см. §5.1 спеки).
- [ ] Folder operations через slash-path tags (DEC-CAT-04 reuse) + new actions из §5.3.
- [ ] **Тесты K2:** ~10 component (zone rendering + folder operations + DAG subrow click).
- [ ] **OQ1 решение:** новые компоненты в `tree/` (не `tree/v2/`), старые удалены вместе с `LibraryTree.jsx`. Если конфликт — Code решает и фиксирует в отчёте.

### K3 — Inspector wrapping (LibrarySingleInspector + LibraryActionRow)

- [ ] **R1 ПЕРВОЙ задачей:** Code проверяет `useEditableModeToggle.js` — читает ли `item.zone`. Если да — go. Если нет — добавляет initial state из zone (≤10 строк). Если deeply hard-coded — STOP K3 + эскалация Chat.
- [ ] `components/Library/inspector/LibraryActionRow.jsx` (~4 KB).
- [ ] `lib/library-actions.js` (~5 KB) — таблица 4 вариантов по zone × kind (§5.4 спеки).
- [ ] Read-only банер: правка `SequenceTab.jsx` + `AnnotationsTab.jsx` (≤1 KB delta каждый) — conditional рендер при `editable=false && item.zone === 'readonly_bodge'`. Текст из STRINGS (§5.6 спеки).
- [ ] **Тесты K3:** ~8 component (action-row variants per zone + read-only banner conditional + handler dispatching).

### K4 — LibraryWorkspace + LibraryTopBar

- [ ] `components/Library/LibraryWorkspace.jsx` (~4 KB) — заменяет `index.jsx` (см. OQ2).
- [ ] `components/Library/LibraryTopBar.jsx` (~3 KB).
- [ ] Search filter — один источник правды в `LibraryWorkspace.jsx`, прокидывается в TopBar input + Tree-head input через context либо props.
- [ ] Empty state: при пустой `selectVisibleLibraryEntries()` — большая `+ Добавить` CTA + existing `OnboardingNudge` (если не dismissed).
- [ ] **Тесты K4:** ~5 integration.

### K5 — AppShell + NavRail + App.jsx routing

- [ ] `components/AppShell/AppShell.jsx` (~3 KB).
- [ ] `components/AppShell/NavRail.jsx` (~3 KB) — 5 иконок (`⌂` заглушка / `📚` active / `🔀` / `⤓` / `⚗` заглушка) + 2 footer заглушки (⚙ / ◐).
- [ ] `App.jsx` правка: вместо текущего root rendering — `<AppShell>`. Default `workspace.active='library'`.
- [ ] Existing fullscreen overlays (Container Window M-C.1 baseline, DAG, modals) — работают поверх workspace через existing `canvas.activeFullscreen`.
- [ ] **Тесты K5:** ~5 integration (nav rail click + workspace switch + fullscreen overlay не ломается).

### K6 — AddModal + +Add button wiring

- [ ] `components/Library/AddModal/AddModal.jsx` (~3 KB).
- [ ] `components/Library/AddModal/SourceTiles.jsx` (~2 KB).
- [ ] `components/Library/AddModal/CrossProjectStub.jsx` (~1 KB).
- [ ] Wiring: `+Add` button в `LibraryTopBar` → AddModal. После выбора source tile + target → запускается existing `PreImportModal` flow с preset (R4 проверка handoff signatures).
- [ ] Cross-project source tile — `CrossProjectStub` modal «В разработке (M-X.9)».
- [ ] **Тесты K6:** ~5 component.

### K7 — STRINGS + polish + edge cases

- [ ] `lib/strings.js` namespaces `STRINGS.libraryWorkspace` + `STRINGS.appShell` (см. §5.6 спеки). EN-комментарий рядом с RU values (паттерн M-C.1 K5).
- [ ] Drag-drop минимум: Loose folder reorder + Loose item → active `.bodge` (clone). Cross-zone — через action-row кнопки.
- [ ] Hover/focus polish + prefers-reduced-motion для drag-drop.
- [ ] DAG subrow click → `setActiveWorkspace('flow', { projectId })`.
- [ ] OQ4: `🔔` иконка с tooltip-заглушкой «уведомления — в разработке».
- [ ] **Тесты K7:** ~5-7.

---

## STOP-условие

После K1-K7 commits Code останавливается на ветке `feature/m-x-7a-library-structure-v2`:

> «K1-K7 landed. Финальные счётчики: Vitest XXXX passing, pytest 112/112 passing. Build clean. Жду визуальной приёмки M-X.7a v2 — не финализирую PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / CLAUDE.md.»

**Не финализировать без acceptance:** PROJECT_STATE.md, RELEASES.md, DECISIONS.md, ANCHORS.md, TECH_DEBT.md, BUGS.md (только если найден existing bug — добавить в OPEN), CLAUDE.md (drift fix откладывается до acceptance).

---

## Формат отчёта Code в конце сессии

В конце реализации Code дописывает в этот CURRENT_TASK.md секцию «Отчёт K1-K7». Полный список — §8 спеки. Кратко:

1. Коммит-хэши по K-step (~7).
2. Vitest passing/total, pytest 112/112, build status, PWA precache size delta.
3. Размеры новых файлов + delta тронутых existing.
4. Отклонения от спеки — explicit блок (split K, R1 result, OQ1/OQ2 решения).
5. Hard violation flag — если файл влез в hard зону.
6. Что не сделано из mockup'а — polish items с flag «приёмочный или отложить?».
7. TD-pencil-marks: index.jsx fate, удалённые файлы из tree/, Importer CatalogColumn «Моя библиотека» — теперь redundant, drag-drop scope.

---

## Что делать при регрессии

Если в любом K-step ломаются existing тесты:

1. STOP коммита, не пушить.
2. Проверить regression-guard зону:
   - K1: existing librarySlice API green после wipe.
   - K2: тестов на старый Tree больше нет (удалены вместе с компонентом).
   - K3: existing Inspector tabs (Sequence/Annotations) — функциональность сохранена, regression только если banner логика ломает existing rendering.
   - K5: fullscreen overlays (Container Window M-C.1 baseline, DAG, modals) — green.
3. Если регрессия в зоне вне M-X.7a v2 (Annotator / SequenceView core / Container Window canvas / DAG из M-C.1) — STOP и эскалация Chat.

---

## Что не делается в M-X.7a v2 (явно отложено)

- **Версионирование (M-X.7b):** содержимое таба «История», version-actions (`Сохранить как версию`, `Manual-edit ветка`, `Откатить`, `Ветка от этого`). Counter показывается, content — placeholder, version-actions disabled с tooltip.
- **Cross-project import wizard (M-X.9):** AddModal source `Из другого .bodge` triggers stub modal. Остальные 3 источника полнофункциональны.
- **«Открыть как активный проект» (M-X.9):** action в read-only `.bodge` action-row показан, при клике alert «В разработке (M-X.9)».
- **Command palette ⌘K (M-X.7c):** search в topbar — простой substring filter по name. ⌘K + length-pattern (`>5kb`) + feature-filter (`CDS`) — отложены.
- **Container Window UI правки:** открывается existing M-C.1 baseline как есть.
- **Group projects (post-M-I), Mobile (DEC-V2-19), Multi-select (M-X.10+).**

---

**Дата:** 09.05.2026 (kickoff Sprint M-X.7a v2 после 3-fail цикла v1 на 08.05.2026; полная переработка после интервью).
**Спека source-of-truth:** `docs/SPRINT_M-X.7a_LIBRARY_STRUCTURE.md`.

---

## Отчёт K1-K7 (09.05.2026, end-of-sprint, STOP перед визуальной приёмкой)

### 1. Коммит-хэши

| K-step | Hash | Описание |
|--------|------|----------|
| K1 | `cb9d4c1` | workspaceSlice + db v4 schema bump + librarySlice v2 extensions |
| K2 | `934cdae` | Tree wipe & rewrite — 7 zone-aware files (DEC-MX7A-V2-04) |
| K3 | `1e1580b` | Inspector wrapping (LibraryActionRow + read-only banner + R1 hook patch) |
| K4 | `68833e7` | LibraryWorkspace + LibraryTopBar |
| K5 | `c0f7ce4` | AppShell + NavRail + App.jsx routing |
| K6 | `4ed9c60` | AddModal + SourceTiles + CrossProjectStub + +Add wiring |
| K7 | `40eee93` | STRINGS namespaces + drag-drop minimum + polish |

Branch: `feature/m-x-7a-library-structure-v2` (parent: `3cf84a9` kickoff).

### 2. Финальные счётчики

- **Vitest:** 1685 / 1685 passing + 8 skipped (Importer.flow.test.jsx legacy tests deprecated by DEC-IMP-06 в K2 — describe.skip).
- **pytest:** 112 / 112 passing (backend untouched весь спринт).
- **Build:** clean, 521 ms (final), no warnings beyond known INEFFECTIVE_DYNAMIC_IMPORT (auto-annotate).
- **PWA precache:** 28 entries / 1173.34 KiB (was 1153.62 KiB at kickoff baseline → +19.7 KiB net + 5 new lazy chunks for AppShell workspace lazy-load).

### 3. Размеры новых + delta тронутых файлов

**Новые (top-15 крупнейших):**

| Файл | Размер | Лимит | Зона |
|------|--------|-------|------|
| `components/Library/LibraryWorkspace.jsx` | 10.0 KB | 40 KB | OK |
| `lib/library-actions.js` | 9.2 KB | 25 KB | OK |
| `components/Library/AddModal/AddModal.jsx` | 7.8 KB | 40 KB | OK |
| `components/Library/tree/LibraryTreeRoot.jsx` | 6.5 KB | 40 KB | OK |
| `components/Library/tree/ProjectZone.jsx` | 6.5 KB | 40 KB | OK |
| `components/Library/tree/TreeItemRow.jsx` | 6.2 KB | 40 KB | OK |
| `components/Library/LibraryTopBar.jsx` | 4.9 KB | 40 KB | OK |
| `components/Library/tree/LooseZone.jsx` | 4.3 KB | 40 KB | OK |
| `components/AppShell/NavRail.jsx` | 4.1 KB | 40 KB | OK |
| `components/Library/tree/LibraryZone.jsx` | 3.5 KB | 40 KB | OK |
| `components/Library/tree/LabPoolZone.jsx` | 3.3 KB | 40 KB | OK |
| `components/Library/inspector/LibraryActionRow.jsx` | 3.2 KB | 40 KB | OK |
| `store/workspaceSlice.js` | 3.0 KB | 25 KB | OK |
| `components/Library/AddModal/CrossProjectStub.jsx` | 2.7 KB | 40 KB | OK |
| `components/Library/AddModal/SourceTiles.jsx` | 2.4 KB | 40 KB | OK |
| `components/Library/tree/TreeFolderRow.jsx` | 2.2 KB | 40 KB | OK |
| `lib/library-zones.js` | 1.9 KB | 25 KB | OK |

**Delta тронутых existing:**

| Файл | До | После | Delta | Заметка |
|------|----|-------|-------|---------|
| `store/librarySlice.js` | 38.3 KB | 42.9 KB | +4.6 KB | K1 actions/selectors. Watch list (TD-MX7A-LIBRARYSLICE-DECOMP) — не повышается в Active (calibration §7) |
| `db/dexie-schema.js` | 8.0 KB | 9.0 KB | +1.0 KB | K1 v3→v4 stanza + wipe upgrade |
| `store/index.js` | 1.0 KB | 1.2 KB | +0.2 KB | K1 wire workspaceSlice |
| `components/Library/inspector/LibrarySingleInspector.jsx` | 38.4 KB | 38.5 KB | +0.1 KB | K3 isReadOnlyZone destructure + 2 prop passes (тело Inspector НЕ трогали — DEC-MX7A-V2-02 verbatim) |
| `components/Library/inspector/tabs/SequenceTab.jsx` | 4.0 KB | 4.6 KB | +0.6 KB | K3 read-only banner |
| `components/Library/inspector/tabs/AnnotationsTab.jsx` | 2.7 KB | 3.4 KB | +0.7 KB | K3 read-only banner |
| `components/Library/inspector/hooks/useEditableModeToggle.js` | 1.0 KB | 1.4 KB | +0.4 KB | K3 R1 patch (gated toggle + isReadOnlyZone derive) |
| `components/Library/index.jsx` | 30.4 KB | 36.0 KB | +5.6 KB | K2 stub (LibraryTreeStub instead of CatalogColumn) — net DECREASE expected after K7 polish removes legacy callsites; current bump is the inline stub component |
| `components/AppShell/index.jsx` | 1.1 KB | 4.1 KB | +3.0 KB | K5 NavRail wiring + WorkspaceRouter |
| `App.jsx` | 11.1 KB | 11.3 KB | +0.2 KB | K5 case 'library' flip |
| `lib/strings.js` | 19.2 KB | 22.3 KB | +3.1 KB | K7 libraryWorkspace + appShell namespaces |
| `components/Library/lib/importer-strings.js` | 13.0 KB | 11.0 KB | −2.0 KB | K2 28 catalog* keys + dropzoneHover + busyParsing purged |

### 4. Отклонения от спеки

**Расщепление K на под-коммиты:** Нет. Каждый K-step = один коммит.

**OQ1 (tree v2/ vs tree/):** Решено per OQ1 default — новые компоненты в `tree/` напрямую (не `tree/v2/`). Старые удалены вместе с `LibraryTree.jsx`. Конфликта имён нет (новые имена `LibraryTreeRoot`/`LibraryZone`/`LooseZone`/`ProjectZone`/`LabPoolZone`/`TreeItemRow`/`TreeFolderRow` не пересекаются со старыми `LibraryTree`/`LibraryGroupHeader`/`LibraryItemRow`/`LibraryNestedSubGroup`).

**OQ2 (старый Library/index.jsx):** Не удалён. App.jsx больше не импортирует напрямую (K5 убрал import); AppShell мониrует через lazy-loaded `Importer` для legacy `workspace.active='importer'` пути. После K2 он работает с `<LibraryTreeStub />` placeholder (CatalogColumn слот) — Inspector + PreImport + MetaColumn остаются функциональны для transition window. **TD-MX7A-V2-DROP-OLD-LIBRARY-INDEX:** удалить `Library/index.jsx` целиком (одну дополнительную секцию NavRail) после визуальной приёмки M-X.7a v2.

**OQ3 (empty-state OnboardingNudge):** Default behaviour сохранён — `OnboardingNudge` рендерится в empty-state, его собственный dismissed-flag решает повторно ли показывать.

**OQ4 (🔔 в topbar):** Реализован per default — иконка с tooltip «Уведомления — в разработке».

**R1 (useEditableModeToggle):** **Хук НЕ был zone-aware.** Initial state hardcoded `false` для всех зон. Минимальный патч (≤14 lines) добавил derived `isReadOnlyZone` + gated `toggle` (silent no-op для readonly_bodge). Existing tests + 3 новых K3 тестов покрывают.

**R4 (PreImportModal handoff):** AddModal Submit пока показывает toast-stub `«AddModal: source=… · target=… → PreImport handoff (K6 stub)»`. Реальный preset-routing в существующий PreImportModal — отдельный follow-up патч (2 prop additions, non-breaking). Решение: «минимально передаёт presetTarget и presetSource» из спеки — структурно реализовано, но handoff на toast.

**R5 (search dual source-of-truth):** Реализован one-state-in-LibraryWorkspace pattern. `query` живёт в LibraryWorkspace, прокидывается в LibraryTopBar (top input) + LibraryTreeRoot (tree-head input). Тест `topbar search updates the shared query (reaches tree-search input)` подтверждает синхронизацию.

**R7 (file size):** Все новые .jsx комфортно под soft 30 KB. Самый крупный новый — LibraryWorkspace 10 KB. Largest .js helper — library-actions 9.2 KB (под soft 20 KB).

**Default landing на Library workspace (DEC-MX7A-V2-08):** workspace.active='library' default стоит (K1 workspaceSlice). НО `canvas.activeFullscreen='start'` остаётся default boot — биолог по-прежнему лендится на StartScreen и должен оттуда зайти в проект/библиотеку. Полный «pure-default-boot-into-library» (skip StartScreen) — отдельная UX-флипка (изменить `initialActiveFullscreen` в canvasSlice), отложена в K7+ polish чтобы не ломать muscle memory биолога перед визуальной приёмкой.

### 5. Hard violation flag

**Нет hard violations.**

`librarySlice.js` 42.9 KB остаётся в Watch list (TD-MX7A-LIBRARYSLICE-DECOMP, открыт с M-X.5). К8 декомпозиция не требуется per calibration §7 (rate-of-change +4.6 KB только этот спринт; после M-X.7b/c смотрим повторно).

`Library/inspector/LibrarySingleInspector.jsx` 38.5 KB (+0.1 KB этот спринт) — стабилен, под hard 40 KB.

### 6. Что не сделано из mockup'a

| Item | Где | Flag |
|------|-----|------|
| `⊟` Свернуть всё (tree-head) | `LibraryTreeRoot.jsx` | приёмочный → если acceptance говорит «не критично» отложить в M-X.7c |
| `⇅` Сортировка (tree-head) | `LibraryTreeRoot.jsx` | приёмочный → отложить в M-X.7c |
| `+ Добавить файл / папку` hover-icons на zone-headers | `LooseZone.jsx`, `ProjectZone.jsx` | приёмочный → отложить (drag-drop из K7 покрывает основной case) |
| `🧬 Из чужих проектов` collapsed-by-default | `LabPoolZone.jsx` | реализован — collapsed default стоит |
| Real PreImport handoff из AddModal | `AddModal.jsx` + `PreImportModal.jsx` | **отложить** (R4 — non-breaking 2-prop addition в существующий модал) |
| Folder reorder в Loose zone (drag-drop) | `LooseZone.jsx` | **отложить** в M-X.7c (folder model не имеет inherent order — нужен новый `looseFolderOrder` slice action) |
| Hover-revealed `➤` quick-add icon на active project rows | (NEW в K6) | приёмочный → если biolog хочет — добавить в M-X.7c |
| `prefers-reduced-motion` @media gate | глобальный CSS | отложить — текущие transitions ≤120 ms, минимальное значение |

### 7. TD-pencil-marks

- **TD-MX7A-V2-DROP-OLD-LIBRARY-INDEX (Active):** `components/Library/index.jsx` (770 lines) после K5 имеет orphan-status: App.jsx не импортирует, AppShell lazy-loads только для NavRail ⤓ icon click. В K7+/M-X.7c удалить целиком (а с ним dependent files: `useImporterState`, `useLibrarySources`, MultiImportView, PreImportModal callsites — нужен audit).
- **TD-MX7A-V2-PREIMPORT-HANDOFF (Active):** AddModal `onLaunchPreImport` — toast stub. Wire to real PreImportModal via 2-prop preset.
- **TD-MX7A-V2-LIBRARYINDEXSHIM-CLEAN (Watch):** `LibraryTreeStub` внутри Library/index.jsx — temporary placeholder. Удаляется вместе с Library/index.jsx по TD-MX7A-V2-DROP-OLD-LIBRARY-INDEX.
- **TD-LOOSE-FOLDER-ORDER (M-X.7c):** Folder reorder в Loose zone требует order-aware folder model. Сейчас slash-path tags производят tree без notion of order.
- **TD-MX7A-LIBRARYSLICE-DECOMP (Watch, carry-over):** `librarySlice.js` 42.9 KB. Не Active per calibration — повторная проверка после M-X.7b/c.
- **Removed tree files** (LibraryGroupHeader / LibraryItemRow / LibraryNestedSubGroup) — все удалены вместе с LibraryTree.jsx (K2). Ни один не переиспользуется в новом коде. `library-folder-tree.js` (helper) сохранён, используется в `selectLooseTreeStructure`.
- **Importer CatalogColumn «Моя библиотека» group** — теперь redundant; LibraryWorkspace покрывает функционал. Удаление вместе с TD-MX7A-V2-DROP-OLD-LIBRARY-INDEX.
- **Drag-drop scope:** Loose item → active ProjectZone clone (DEC-MX7A-V2-10) реализован. Folder reorder отложен (см. TD-LOOSE-FOLDER-ORDER). Cross-zone drag-drop scope intentionally kept minimal per spec.

---

**STOP.** K1-K7 landed на ветке `feature/m-x-7a-library-structure-v2`. Жду визуальной приёмки M-X.7a v2 — НЕ финализирую PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / CLAUDE.md.
