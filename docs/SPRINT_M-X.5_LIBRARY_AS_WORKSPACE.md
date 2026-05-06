# SPRINT M-X.5 — Library as Primary Workspace

**Тип:** A (архитектурный, фундаментальная переработка Library/Importer)
**Объём:** ~35-40 KB спека, ~3-4 недели Code work, ~80-120 коммитов
**Ветка:** `feature/library-as-workspace` (новая, ответвлённая от `main` после v0.7.3 финализации)
**Базовый коммит:** `20f1c7f` (HEAD `feature/sequence-view-feature-strip`, M-X.3 финализация 06.05.2026)
**Целевые версии после реализации:** v0.8.0 (major bump — фундаментальное архитектурное изменение)

---

## §0. TL;DR

Полный refactor: Importer как отдельный fullscreen **выкидывается**. Library становится **единым местом** где биолог: импортирует плазмиды, организует их в папки, редактирует annotations и sequence, переносит в проекты. SnapGene catalog растворяется в общую Library под единые законы.

**Что меняется фундаментально:**
- **DEC-IMP-01..05 supersede** — Importer как fullscreen больше не существует. Импорт = drag-drop файла в Library либо paste в Library либо file picker в Library toolbar.
- **DEC-LIB-05 supersede** — sequence в Library entry mutable через manual-edit branching (3-й путь). Manual edit создаёт новую entry с `manualEdit: true` flag и parent reference.
- **DEC-LIB-06 уточняется** — library_clone остаётся, но добавляется механика «открыл entry в Library → правишь annotations → save back в ту же entry либо как новая версия».
- **Onboarding:** при первом запуске Library пустая → nudge banner «Загрузить базовые плазмиды по категориям».
- **Multi-import** появляется автоматически при drag-drop N>1 файлов, с per-batch выбором (auto / manual / no-annotation) + per-file override.
- **Read-only by default + Editable toggle** в SequenceView — biolog нажимает READ-ONLY pill чтобы переключить в EDITABLE, после чего sequence editing включён.
- **Library Save Flow** — две явные кнопки «Перезаписать в библиотеке» / «Сохранить как новую версию» появляются после правок annotations.

**Что остаётся:**
- Все existing UI components: SequenceView, Annotator (embedded в AnnotationsTab), FeatureEditorModal, sub-features rendering, SBOL glyphs, drag-handles, three-level LevelPanel.
- Library как Dexie-backed personal collection.
- Folder system, drag-drop между папками, tags as folders, soft-delete.
- DAG проекта, Container Window, Mix Workspace, Primer Pool — **не трогаем** в этом sprint'е.
- `cross_project_clone` через DagView readOnly modal (§3.4 ARCHITECTURE_v2) — не трогаем.

**Acceptance gate:** биолог гоняет UI по 8 integration scenarios (см. §6). Если PASS → v0.8.0 release. Если FAIL → fix список + повторная приёмка.

---

## §1. Контекст и мотивация

### 1.1 Почему этот sprint

После M-X.2 (annotation editing) + M-X.3 (wrap-tail rendering) + 70-коммитного bug bash биолог зафиксировал на 06.05.2026:

> «Импортер как отдельная сущность раздражает. Multi-режим появляется когда не ожидаешь, скрывает интерфейс, "Loaded N files" непонятно. SnapGene catalog отдельно от моей Library — путаница. Единые законы для всего: импорт = появление в Library, открытие плазмиды = single inspector, batch-mode = только при многофайловом импорте.»

Это противоречит зафиксированной архитектуре. ARCHITECTURE_v2 §2.7 + §3.5 говорит «Library = flat personal collection, Importer = отдельный fullscreen для парсинга». Биолог теперь говорит «Library = primary workspace, Importer не нужен как отдельный экран».

Значит зафиксированная архитектура была **неправильно угадана** Chat'ом 01.05.2026. M-A.3 Library minimal CRUD реализовался под старую модель. Теперь pre-M-H polish (который должен был придти позже) превращается в фундаментальный rewrite.

### 1.2 Биологический use case (sanity check #1)

Биолог в реальной работе:

1. Открывает BodgeGene → Start screen → жмёт «Library» → попадает в Library workspace.
2. Drag-drop'ит 3 файла .gb из Finder → они появляются в Library как entries в папке «Untagged» (либо в drag-target папке).
3. Видит «3 файлов загружено · аннотировать как: [Авто] [Вручную] [Не нужно]» — выбирает Авто.
4. Auto-annotation запускается per file → entries обновляются с found features.
5. Кликает на entry pUC19_v2 → открывается single inspector в Library.
6. Редактирует annotations через SequenceView / Annotator.
7. Жмёт «Сохранить» → выбор «Перезаписать pUC19_v2» либо «Сохранить как новую версию pUC19_v3».
8. Хочет работать с этой плазмидой в проекте → жмёт `+` quick-add icon рядом с entry в Library tree → Library «предлагает создать проект» → создаётся проект, entry добавлена как контейнер.

Без context switching между Library и Importer. Без «multi-import overlay» на ровном месте. Без двух отдельных catalog'ов (SnapGene tutorial vs My Library).

### 1.3 Industry baseline (sanity check #2)

**SnapGene** — Library + Files открываются как fullscreen. Drag-drop файлов добавляет в текущий folder. Click on file → opens in main view (sequence + map). Edit annotations → автоматический save в file (но это desktop app, file = source of truth). Manual sequence edit → возможен, но через явный menu action «Convert to editable» с warning что это правка молекулы.

**Benchling** — Inventory как primary place. Drag-drop в folder. Click → opens detail view in same window. Annotation edit auto-saves. Sequence edit через явный «Edit sequence» mode toggle → создаёт new version.

**ApE** — File-based, нет Library как абстракции. Open file → editable by default → save overwrites.

Наш паттерн ближе всего к **Benchling** (inventory + click → detail + edit mode toggle), не к **SnapGene** (catalog separate from files).

### 1.4 Что НЕ хочется делать

- НЕ убирать SnapGene catalog как функционал. Биолог пользуется им регулярно для reference plasmids (pUC19, pET28b, etc).
- НЕ ломать существующий .bodge формат (DEC-IMP-04 / §4.2 ARCHITECTURE_v2). Содержимое Library entries сохраняется в IndexedDB как сейчас.
- НЕ ломать Project DAG / Container Window / Mix Workspace. Эти контексты не затрагиваются.
- НЕ блокировать визуальную приёмку M-X.2 / M-X.3 — они уже released как v0.7.2 + v0.7.3, акцептованы биологом.
- НЕ менять backend (FastAPI parsing). Backend остаётся stateless calculation service.

---

## §2. Архитектурные supersede и новые ⚓

### 2.1 DEC-IMP-01..05 → SUPERSEDED полностью

**Старая модель (DECISIONS 01.05.2026):**

> DEC-IMP-01 — Importer как фулскрин для парсинга external форматов в внутренние сущности. Library не источник Importer'а. Три раздельные операции: «Импорт в library / Импорт в проект / Добавить из library».
> DEC-IMP-02 — 3 типа источника: file / paste / cross-project .bodge.
> DEC-IMP-03 — Импорт sequence на старт-экране удалён.
> DEC-IMP-04 — Два контекста запуска Importer'а: in-project / into-library.
> DEC-IMP-05 — Rich preview default в Importer wizard.

**Новая модель (DEC-IMP-06 ⚓):** Importer как отдельный fullscreen **не существует**. Импорт = drag-drop / paste / file picker внутри Library workspace. Library — единственная точка входа для external sequence data.

Преемственность с DEC-IMP-05 (rich preview default) — preview сохраняется, но рендерится **inline в Library** при hover/click на entry, не в отдельном wizard'е.

Преемственность с DEC-IMP-02 (3 типа источника) — file / paste / cross-project .bodge остаются как 3 пути ввода, но все они через Library UI, не через отдельный Importer.

«Добавить из библиотеки» (DEC-IMP-01 третья операция) превращается в **quick-add icon `+`** на каждом Library entry row при наличии активного проекта. Hover-revealed.

### 2.2 DEC-LIB-05 → SUPERSEDED частично

**Старая модель:**
> DEC-LIB-05 — Sequence в Library entry заморожен после первой загрузки. Изменение sequence — только два пути: (1) preview-step в Importer wizard, (2) клонирование в проект как library_clone.

**Новая модель (DEC-LIB-12 ⚓):** Sequence в Library entry **mutable через manual-edit branching**. Биолог может редактировать sequence напрямую в Library single inspector, **но любая такая правка** автоматически:

1. Создаёт новую entry в Library с `origin: { kind: 'manual_edit', parentEntryId, parentEntryHash, editedAt }` (immutable).
2. Помечается визуально (pencil icon / «manual edit» badge в Library tree).
3. DAG ветка между parent entry и manual-edit entry формируется (этот же DAG что для library_clone).

Original entry **не изменяется**. Annotations — separate, см. DEC-LIB-13.

DEC-LIB-05 **частично остаётся в силе** для:
- Sequence НЕ изменяется silent (write-through автоматический не существует).
- Manual edit требует explicit confirm на первый character change.
- Entry origin фиксируется при создании, не меняется.

### 2.3 DEC-LIB-06 → УТОЧНЯЕТСЯ

**Старая модель:**
> DEC-LIB-06 — Связь library ↔ project — копия. Контейнер из Library в проекте получает новый UUIDv7 + `origin: library_clone`. Изменения в копии не влияют на Library entry.

**Новая модель (DEC-LIB-13 ⚓ дополняет DEC-LIB-06):** Annotations в Library entry mutable через **explicit save flow**. Биолог редактирует annotations в Library single inspector → правки в `perFileEdits.editedAnnotations` (transient) → жмёт «Сохранить» → выбор:

- **«Перезаписать в библиотеке»** — обновляет existing entry, увеличивает `version` counter, старая annotations теряется.
- **«Сохранить как новую версию»** — создаёт новую entry с copy sequence + новыми annotations + `origin: { kind: 'version', parentEntryId, parentEntryHash, ... }`. Старая остаётся.

Auto-save в Library entry **отключён** (write-through). Все правки annotations transient до явного save.

Это симметрично DEC-LIB-12 (manual edit для sequence) — оба обеспечивают «explicit save» pattern.

### 2.4 Новые ⚓ (фундаментальные для v0.8.0)

**DEC-LIB-14 ⚓ Edit parity SequenceView ↔ Annotator.** Любая annotation edit использует один dispatcher `applyAnnotationEdit` через `onUpdateEdits` callback. Annotator embedded в AnnotationsTab и SequenceView в Sequence tab прокидывают одни и те же handlers (`onAnnotationEdit`, `onOpenFeatureEditor`, `onBlastSelection`). Два mode-specific edit path запрещены.

(Это была DEC-EDIT-PARITY-01 ⚓ кандидат в M-X.2-fix, теперь промотируется в actual ⚓ при реализации M-X.5.)

**DEC-LIB-15 ⚓ Library targets — Library only / Library + project.** При импорте файла биолог явно выбирает таргет:
- **Library only** — entry в Library, не в проект.
- **Library + project** — entry в Library AND в текущий проект (требует активного проекта).

Третий вариант (только в проект, не в библиотеку) **не существует**. Каждая плазмида проходит через Library.

(Промоция DEC-IMPORTER-TARGETS-01 ⚓ кандидат из M-X.2-fix.)

**DEC-LIB-16 ⚓ Read-only по умолчанию для sequence editing.** SequenceView рендерится в read-only режиме когда entry открыт в Library single inspector. Биолог явно жмёт READ-ONLY pill в title row → переключается в EDITABLE → может вводить characters в SequenceView для manual edit. Это **защита от случайных правок** (DEC-LIB-12 manual-edit branch создаётся только при характерах в sequence).

Annotation editing (drag handles, rename, FeatureEditorModal) **доступен в обоих режимах** — это не sequence editing, это metadata.

**DEC-LIB-17 ⚓ Onboarding through nudge, not modal.** При первом запуске (либо когда Library пустая) — Library открывается с nudge banner «Добавить базовые плазмиды по категориям». Banner неинтрузивный, биолог может игнорить и сразу drag-drop'нуть свой файл. Modal-blocking onboarding **запрещён**.

### 2.5 Sprint-level DEC (без ⚓)

**DEC-LIB-MULTI-01 — Multi-import view как in-place transformation Library tree.** При drag-drop N>1 файлов Library tree **временно** заменяется на multi-import table (per-file rows с annotation choice, folder selection). После «Готово» возврат к обычной Library tree с новыми entries.

Альтернатива — modal over Library — отвергнута: cреди модальных окон уже PreImportModal, FeatureEditorModal, AutonameModal, PrimerWizardStepModal, добавлять ещё одно для multi-import = модальный hell.

**DEC-LIB-MULTI-02 — Per-batch annotation choice + per-file override.** В multi-import view сверху table — radio group «Все файлы: Авто / Вручную / Не нужно». В table per-file row — dropdown с тем же выбором, default = batch choice, override per-file. Биолог обычно делает один выбор для всех, в редких случаях override per-file.

**DEC-LIB-MULTI-03 — «Аннотировать вручную» открывает Annotator embedded в Library single inspector.** Если биолог выбрал «вручную» для file → после Готово biolog попадает на entry в Library single inspector с открытым Annotator, маленькая table сверху Annotator показывает list batch файлов, биолог переключается между ними через эту table. После аннотации каждой biolog жмёт Save в Annotator.

(Альтернатива — открыть Annotator модально — отвергнута, embedded UX уже работает.)

**DEC-LIB-MANUAL-01 — Manual edit confirm on first character change.** Когда biolog переключил READ-ONLY → EDITABLE и нажал первую букву в SequenceView → modal confirm «Это manual edit. Будет создана новая ветка плазмиды [name] (manual edit). Продолжить?» → confirm → создаётся новая entry, биолог продолжает работать с копией. Subsequent character changes в той же сессии **не** spawn новый confirm (entry уже manual-edit branch).

**DEC-LIB-QUICKADD-01 — Quick-add icon hover-revealed.** Иконка `+` или ➤ появляется на каждом Library entry row при hover, **только если есть активный проект** в navStack. Click → entry добавляется в проект как library_clone, Library закрывается, возврат на canvas.

**DEC-LIB-SAVE-01 — Save UI: две кнопки.** В Library single inspector header (либо footer) появляются две кнопки **только когда есть unsaved changes** (`perFileEdits.editedAnnotations` не пуст):
- `[Перезаписать]` — overwrite entry в Library, increment version counter.
- `[Сохранить как версию]` — create new entry с parent reference.

Disabled state когда нет changes. Tooltip объясняет что делает каждая.

---

## §3. Что переписывается / удаляется / остаётся

### 3.1 Удаляется из codebase

**`gui/designer/src/components/Importer/`** как fullscreen — компоненты:
- `Importer/index.jsx` (~22 KB) — уходит. Logic split'ится:
  - Confirm flow (`runConfirm`) → переезжает в `librarySlice.commitImport`.
  - PreImportModal flow → переезжает в `Library/import/`.
- `Importer/PreImportModal.jsx` — переименовывается в `Library/import/PreImportModal.jsx`, остаётся.
- `Importer/inspector/SingleInspector.jsx` (32 KB) — переименовывается в `Library/inspector/LibrarySingleInspector.jsx`. Все хуки (idle-prewarm, undo-redo, feature-editor-flow) остаются.
- `Importer/inspector/MultiInspector.jsx` (10.7 KB) — **удаляется полностью.** Multi-import view имеет другую модель (см. §3.2).
- `Importer/inspector/EmptyInspector.jsx` — **удаляется**. Empty state теперь в Library tree (nudge banner).
- `Importer/inspector/MetaColumn.jsx` — переезжает в `Library/inspector/`.
- `Importer/inspector/ActionsBar.jsx` — **удаляется**. Save кнопки переезжают в LibrarySingleInspector header.
- `Importer/inspector/SessionSummary.jsx` — **удаляется**. Session summary как концепция уходит — biolog видит результаты в Library tree после import'а.
- `Importer/catalog/CatalogColumn.jsx` (60 KB) — переезжает в `Library/tree/LibraryTree.jsx`. Folder logic, drag-drop, tag system, MAX_INDENT_DEPTH — все остаётся. **Декомпозиция** в этот же sprint (см. §3.2.4) потому что 60 KB — серьёзный hard violation.
- `Importer/catalog/use-catalog-sources.js` — переезжает в `Library/hooks/useLibrarySources.js`.
- `Importer/lib/importer-state.js` (19 KB) — переписывается как `Library/hooks/useLibraryState.js` (~10 KB). Многое уходит (parsedItems / currentIdx / activeTab / activeSource / catalogQuery / addedItems concepts) либо переезжает в Zustand store.

### 3.2 Что добавляется

**`gui/designer/src/components/Library/`** — новый namespace, на месте старого `Importer/`:

```
Library/
├── index.jsx                         # Library fullscreen container (~10 KB)
├── tree/
│   ├── LibraryTree.jsx               # tree из CatalogColumn (~25-30 KB после декомпозиции)
│   ├── LibraryGroupHeader.jsx        # extracted (~5 KB)
│   ├── LibraryNestedSubGroup.jsx     # extracted (~7 KB)
│   ├── LibraryItemRow.jsx            # extracted (~5 KB)
│   ├── LibraryItemRow.live.jsx       # с liveAnnotations override (~3 KB)
│   ├── LibraryFolderTree.js          # buildFolderTree + indent helpers (~3 KB)
│   └── LibraryDropZone.jsx           # drag-drop area + paste textarea (~5 KB)
├── inspector/
│   ├── LibrarySingleInspector.jsx    # was Importer/inspector/SingleInspector (~30 KB после K3 hooks)
│   ├── LibraryMetaColumn.jsx         # was Importer/inspector/MetaColumn (~12 KB)
│   ├── LibrarySaveActions.jsx        # NEW: 2 buttons «Перезаписать / Save as version» (~3 KB)
│   ├── ManualEditConfirmModal.jsx    # NEW: confirm dialog для DEC-LIB-MANUAL-01 (~3 KB)
│   └── hooks/                         # already extracted в M-X.2-fix
│       ├── useIdlePrewarm.js
│       ├── useAnnotationUndoRedo.js
│       └── useFeatureEditorFlow.js
├── import/
│   ├── PreImportModal.jsx            # was Importer/PreImportModal (~10 KB)
│   ├── MultiImportView.jsx           # NEW: per-file table multi-import (~12 KB)
│   ├── AutonameModal.jsx             # was Importer/modals/AutonameModal
│   └── PrimerWizardStepModal.jsx     # was Importer/modals/PrimerWizardStepModal
├── hooks/
│   ├── useLibraryState.js            # was importer-state.js, переписан (~10 KB)
│   ├── useLibrarySources.js          # was use-catalog-sources.js (~8 KB)
│   └── useManualEditDetection.js     # NEW: detect first char change в EDITABLE mode (~2 KB)
├── onboarding/
│   ├── OnboardingNudge.jsx           # NEW: banner на пустую Library (~5 KB)
│   ├── CategoryPickerModal.jsx       # NEW: «выбрать категории» modal (~8 KB)
│   └── demo-categories.js            # NEW: hardcoded categories list (~2 KB)
└── lib/
    ├── build-library-entry.js        # was Importer/lib/build-library-entry
    ├── compute-suggested-name.js     # was Importer/lib/compute-suggested-name
    ├── folder-tree.js                # was Importer/lib/folder-tree
    ├── pending-files.js              # was Importer/lib/pending-files (drag-drop queue)
    └── resource-hash.js              # was Importer/lib/resource-hash
```

Total estimated size of new code:
- LibraryTree decomposition: ~55 KB (down from CatalogColumn 60 KB).
- MultiImportView: ~12 KB (new).
- LibrarySaveActions: ~3 KB (new).
- ManualEditConfirmModal: ~3 KB (new).
- OnboardingNudge + CategoryPickerModal: ~13 KB (new).
- LibrarySingleInspector: ~30 KB (was 32 KB, marginal change).

Additional hooks: ~12 KB total new.

**Total new code added:** ~50 KB. Removed: ~55 KB (Importer fullscreen). Net: ~5 KB reduction несмотря на новые фичи (через декомпозицию + удаление dead code from Importer).

### 3.3 Что остаётся unchanged

**Production baseline на 06.05.2026 (v0.7.3 release).** Биолог явно подтвердил эти элементы как working as intended (визуальная приёмка через скриншот pGEX-2T inspector view, 06.05.2026 23:37 MSK) — не переписываются в M-X.5, только переезжают из `Importer/` namespace в `Library/` (K1-K2 rename, без functional changes):

**Sequence view core (`SequenceView/`, ~145 KB):**
- Multi-line wrap с rulers + complement strand + AA translation row под CDS.
- LinearFeatureBar «колбаса» в header — instant visual map, click-navigation.
- Annotation rectangles с inline labels + SBOL glyphs (chevron icons показывают strand direction).
- Ruler ticks каждые 10 bp + numbered позиции.
- AA translation row с цветами по гидрофобности.
- Wrap-tail rendering для circular plasmids (M-X.3 finalized v0.7.3).
- Drag-handle edge resizing для regions с live preview rect.
- Caret + selection с keyboard shortcuts (Ctrl+C, Ctrl+Alt+C, Shift+arrow extend).
- Settings popover ⚙ с display options.

В M-X.5 добавится **только**: Editable mode toggle handler (K6) — keyboard listener активируется когда `editable: true`.

**Annotator (`Annotator/`, ~70 KB) — "работает шикарно, визуал отличный" (биолог 06.05.2026):**
- Embedded mode в AnnotationsTab (DEC-ANN-13).
- Three-level LevelPanel (L1 homology auto-run, L2 predictors manual, L3 BLAST stub).
- PreviewTab linear / circular sub-tabs.
- Region-scope context menu из SequenceView.
- Idle pre-warm для instant tab switch (DEC-IDLE-PREWARM-01).
- Save flow с `justSavedAt` confirmation.
- Threshold bidirectional sync с SequenceView.

**Feature editing:**
- `FeatureEditorModal.jsx` (25.6 KB) — двухtabовая (Feature / Subfeatures), split + merge + delete.
- Sub-features data model (level: 'detail' + parentId, DEC-FEATURE-SUBFEATURES-01).
- SBOL glyphs (DEC-ANN-SBOL-01) — paired с label, flips on reverse strand.
- Inline rename через dblclick на label.

**Inspector header (M-X.2-fix baseline):**
- Title row: InlineEditableTitle + ⚙ settings + READ-ONLY pill + length · topology · regions counter.
- Selection live counter (bp + aa когда mode = 'aa').
- LinearFeatureBar «колбаса» под TabBar.
- TabBar overview / sequence / annotations + history (conditional).
- Idle pre-warm visibility toggle для tabs.

**MetaColumn (right rail, ~12 KB):**
- TAGS editor inline.
- TOPOLOGY toggle Circular / Linear с persisted edit (`editedTopology`).
- ORIGIN (BP) input для circular (DEC-MB-03 origin returned to MetaColumn).
- INTERGENIC REGIONS chips list (computed).
- LENGTH bp display.
- INFO + DESCRIPTION + ORGANISM + SOURCE из metadata.

**Library tree (was CatalogColumn, переезжает в `Library/tree/` в K3) — "колбаса работает, рендер быстрый":**
- Folder hierarchy с MAX_INDENT_DEPTH=5 + recursive nesting.
- Drag-drop файлов в любую папку (`targetFolderTag`).
- Drag-drop entries между папками (rewrites tags).
- Hover-revealed delete `×`, add child folder `+`, add file `⤓`.
- Per-row plasmid mini-icon (PlasmidMiniMap inline mode).
- `content-visibility: auto` + `contain: paint` + ItemRow memo gate (perf на ~700 SnapGene entries).
- localStorage persistence: open/closed groups, opened folders, user folders.
- Render-time merge для catalog icon (`liveAnnotationsByLibId`).
- Search bar overlay flat search через все 4 sources.

**Performance baselines (acked 06.05.2026):**
- Render быстрый, no jank на ~5 KB plasmids с 11+ regions.
- CPU idle 1-2% (после Vite HMR pin + PlasmidMap memo).
- Memory ~300 MB stable.
- Scroll smooth даже на 700 SnapGene entries.

**Не переписывается в M-X.5:**
- `SequenceView/tracks/AnnotationTrack.jsx` (41.6 KB hard violation) — TD-ANNOTATIONTRACK-DECOMPOSE-V2 carries в M-X.6.
- `store/projectSlice.js`, `store/annotatorSlice.js`, `store/uiSlice.js` — без изменений в logic, только мелкие правки в slice creators для новых actions из §3.4.
- DAG проекта (`flow/`), Container Window, Mix Workspace, Primer Pool — не трогаем.
- Cross-project import modal (DagView readOnly) — не трогаем.

**Объём unmodified кода:** ~250 KB сохраняется как есть из v0.7.3 baseline. Только rename (K1) + dead code removal (K2) + декомпозиция CatalogColumn (K3) — ~25% кода трогается mechanically. Остальное (K4-K11) — добавление новой функциональности на чистом ground.

### 3.4 Что меняется в `librarySlice.js`

`store/librarySlice.js` (currently 6.14 KB) расширяется до ~12-15 KB. Новые actions:

```js
// New actions for M-X.5:

/**
 * Overwrite existing library entry с новыми annotations.
 * Increments entry.version counter.
 * Используется из LibrarySaveActions «Перезаписать».
 */
overwriteLibraryEntryAnnotations: async (id, annotations) => { ... }

/**
 * Save annotations as new version — создаёт новую entry с parent reference.
 * `origin: { kind: 'version', parentEntryId, parentEntryHash, ... }`.
 * Возвращает id новой entry.
 */
saveLibraryEntryAsVersion: async (parentId, annotations, name) => { ... }

/**
 * Manual edit branch — создаёт новую entry с edited sequence.
 * `origin: { kind: 'manual_edit', parentEntryId, parentEntryHash, editedAt }`.
 * Возвращает id новой entry.
 */
createManualEditBranch: async (parentId, editedSequence, editedAnnotations) => { ... }

/**
 * Bulk import N files в одну операцию.
 * Per-file: parses, resource-hashes, dedupes, applies annotation choice.
 * Идёт через тот же `addLibraryEntry` для каждого file, но atomically.
 * Возвращает array of created entry ids.
 */
commitMultiImport: async (filesWithChoices, targetFolder) => { ... }

/**
 * Onboarding: загрузить N base plasmids из demo-categories.
 * Per category: fetch from `/snapgene-catalog/<slug>` или `/demo-categories/<slug>`,
 * добавляет каждую как regular entry с tag = `demo:<categorySlug>`.
 * Возвращает count.
 */
loadOnboardingPlasmids: async (categorySlug) => { ... }
```

Существующие actions остаются. `updateLibraryEntryAnnotations` (которая была удалена в M-X.2-fix) — не возвращается, заменяется на `overwriteLibraryEntryAnnotations` с правильной семантикой.

### 3.5 Что меняется в `LibraryEntry` data model

```typescript
interface LibraryEntry {
  id: UUID;
  kind: 'container' | 'primer';
  resourceId: UUID;
  resourceHash: string;
  name: string;
  tags: string[];
  addedAt: ISO8601;

  // NEW M-X.5:
  origin: LibraryEntryOrigin;       // ⚓ immutable — откуда взялась entry
  version: number;                  // ⚓ monotonically increasing per entry id; 1 на create
  parentEntryId?: UUID;             // если manual_edit или version — ссылка на parent
  parentEntryHash?: string;         // ⚓ snapshot hash parent при разветвлении
  manualEditFlag?: boolean;         // если origin.kind === 'manual_edit', true; иначе undefined
  payload: LibraryEntryPayload;

  ext: object;
}

type LibraryEntryOrigin =
  | { kind: 'file_import';   sourceFileName: string; sourceFormat: 'gb'|'dna'|'fasta'; importedAt: ISO8601 }
  | { kind: 'paste_import';  importedAt: ISO8601 }
  | { kind: 'demo_category'; categorySlug: string; sourcePlasmidName: string; importedAt: ISO8601 }
  | { kind: 'manual_edit';   parentEntryId: UUID; parentEntryHash: string; editedAt: ISO8601 }
  | { kind: 'version';       parentEntryId: UUID; parentEntryHash: string; createdAt: ISO8601; changeDescription?: string };

interface LibraryEntryPayload {
  sequence: string;                 // IUPAC
  topology: 'linear' | 'circular';
  ends: Ends | null;                // unchanged from current
  annotations: Annotation[];        // mutable through DEC-LIB-13 (overwrite or save-as-version)
  length: number;                   // derived = sequence.length
  description?: string;
  organism?: string;
  resourceHash: string;             // дублируется для O(1) resource lookup
}
```

Migration plan для existing Library entries в IndexedDB на момент upgrade:
- Каждая existing entry получает `origin: { kind: 'file_import', sourceFileName: entry.name, sourceFormat: 'gb', importedAt: entry.addedAt }` (best-guess fallback).
- `version: 1`.
- Прочие поля undefined.

Migration runs в `hydrateLibrary()` lazy при first read entry без `origin` field.

---

## §4. K-шаги (12 шагов, ~3-4 недели Code work)

### K1 — Library namespace skeleton + migration

**Цель:** создать `components/Library/` directory, переместить файлы из Importer/, мигрировать existing данные.

**Файлы:**
- Создать `Library/` directory tree (см. §3.2).
- Переместить (git mv) файлы из Importer/ в Library/ с переименованием.
- Обновить imports во всех existing файлах.
- В `librarySlice.js` добавить migration logic в `hydrateLibrary` для existing entries без `origin` field.
- В `App.jsx` либо routing — заменить `Importer` route на `Library` route.

**Тесты:**
- Existing `Importer/__tests__/*` тесты переименовать в `Library/__tests__/*`.
- Исключить тесты которые тестируют MultiInspector / EmptyInspector / ActionsBar / SessionSummary (эти удаляются — K2).
- Добавить migration test: existing entry без `origin` после `hydrateLibrary` имеет `origin.kind === 'file_import'`.

**Acceptance:** `npm test` passing после rename. Existing UI работает (Library открывается из Start screen, можно увидеть entries).

**Размер патча:** ~30-50 файлов moved. Логика без изменений. ~3-4 часа Code work.

---

### K2 — Удалить Importer fullscreen + dead code

**Цель:** удалить `Importer/index.jsx` и зависимые компоненты (MultiInspector, EmptyInspector, ActionsBar, SessionSummary).

**Файлы:**
- Удалить `components/Importer/` целиком (если что-то осталось после K1).
- Удалить `components/Importer/inspector/MultiInspector.jsx` + tests.
- Удалить `components/Importer/inspector/EmptyInspector.jsx` + tests.
- Удалить `components/Importer/inspector/ActionsBar.jsx` + tests.
- Удалить `components/Importer/inspector/SessionSummary.jsx` + tests.
- В `canvasSlice.js` либо `uiSlice.js` — удалить `activeFullscreen: 'importer'` из union types, заменить везде на `'library'`.
- В `App.jsx` — удалить routing для `'importer'`.
- В Start screen + `+ New project` flow — заменить «Open Importer» triggers на «Open Library».
- В Project DAG toolbar — заменить `+ Импорт` на `+ Из библиотеки» (которое и так существует) либо удалить дубликат.

**Тесты:**
- Удалить tests которые ссылаются на deleted компоненты.
- Routing tests: `'importer'` → `'library'`.

**Acceptance:** `npm test` passing. Approach Library работает. `+ Импорт` button с DAG toolbar теперь ведёт в Library в режиме «Library + project» target.

**Размер патча:** ~10-15 файлов deleted, ~5-10 файлов modified. ~2-3 часа Code work.

---

### K3 — LibraryTree декомпозиция (was CatalogColumn 60 KB)

**Цель:** разбить 60 KB CatalogColumn на 6 sub-component'ов в `Library/tree/`. Хард violation .jsx 60 KB → новые файлы все < 30 KB soft.

**Файлы:**
- `LibraryTree.jsx` — main container (~25-28 KB). Принимает `liveAnnotationsByLibId`, `query`, `onQueryChange`, `onSelectItem`, `onFiles`, `onPasteText`. Render структура из §1 CatalogColumn.
- `LibraryGroupHeader.jsx` — extracted из CatalogColumn (~5 KB). Top-level group header с drag handlers, add buttons, drop zone. Принимает `groupKey`, `label`, `count`, `open`, `onToggle`, etc.
- `LibraryNestedSubGroup.jsx` — extracted (~7 KB). Recursive folder header inside Mine, sub-folder rendering.
- `LibraryItemRow.jsx` — extracted (~5 KB). Single item row с PlasmidMiniMap + name + length + delete + drag handle.
- `LibraryFolderTree.js` — pure helpers (~3 KB). `buildFolderTree`, `indentForDepth`, `depthBackground`, `readGroupState`, `writeGroupState`, `readSet`, `writeSet`.
- `LibraryDropZone.jsx` — bottom drop zone + paste textarea (~5 KB).

Логика остаётся **точно** такой же. Это pure refactoring.

**Тесты:**
- Existing tests на CatalogColumn переехали с K1. Они должны passing после декомпозиции.
- Добавить unit tests на `LibraryFolderTree.buildFolderTree` (extracted helper).

**Acceptance:** все tests passing. Library tree рендерит то же самое визуально.

**STOP-условие:** если декомпозиция требует менять existing tests → regression, стоп.

**Размер патча:** ~6 новых файлов, ~60 KB перераспределено. ~1-2 дня Code work.

---

### K4 — Multi-import view

**Цель:** заменить current MultiInspector behavior на новый MultiImportView pattern (DEC-LIB-MULTI-01..03).

**Триггер:** drag-drop N>1 файлов в Library / paste multiple sequences / file picker selecting N>1 files.

**Файлы:**
- `Library/import/MultiImportView.jsx` (~12 KB) — новый компонент. Заменяет Library tree временно.
- `Library/index.jsx` — добавить state `multiImportPending: ParsedFile[] | null`. Если non-null — render MultiImportView вместо LibraryTree.

**MultiImportView UI:**

```
+----------------------------------------------------+
|  ← Cancel                  Готово (3 файла)       |
+----------------------------------------------------+
|                                                    |
|  Аннотировать все: [● Авто] [○ Вручную] [○ Не нужно]
|  Сохранить в папку: [Untagged ▾]                  |
|                                                    |
+----------------------------------------------------+
|  ☑ pUC19_v2.gb              Авто  ▾  [view]       |
|  ☑ pET28b_modified.gb       Авто  ▾  [view]       |
|  ☐ random_seq.fasta         Не нужно  ▾  [view]   |
+----------------------------------------------------+
```

Per-file row:
- Checkbox (default ☑) — biolog может exclude file без удаления.
- File name.
- Annotation choice dropdown (overrides batch choice).
- `[view]` button — preview file inline (rich preview, leverages existing PlasmidMiniMap).

Top controls:
- Radio group annotation choice (default = «Авто»).
- Folder selector (default = «Untagged»). Биолог может выбрать существующую папку или создать новую inline.

`[Готово]` button → calls `librarySlice.commitMultiImport` → entries appear in selected folder → MultiImportView unmounts → LibraryTree shows updated state.

`[Cancel]` → discard parsed files, return to LibraryTree without changes.

**Тесты:**
- Drag-drop 1 file → no MultiImportView (single-file path).
- Drag-drop 3 files → MultiImportView renders.
- Toggle annotation choice per file → state update.
- Done → entries appear in store.
- Cancel → no entries appear.

**Acceptance:** биолог dragging 3 .gb files → видит таблицу с настройками → жмёт Готово → видит 3 новых entries в Library tree.

**STOP-условие:** если parsing одного из файлов fails — error inline в row, biolog может exclude его и continue с остальными.

**Размер патча:** ~12 KB new код + ~5 KB changes в Library/index.jsx + ~3 KB tests. ~2-3 дня Code work.

---

### K5 — Onboarding: nudge + category picker

**Цель:** при пустой Library показать nudge banner «Добавить базовые плазмиды по категориям». Click → modal с category list. Select → entries приходят в Library.

**Файлы:**
- `Library/onboarding/OnboardingNudge.jsx` (~5 KB) — banner inline в Library tree когда `Object.keys(libraryEntries).length === 0`.
- `Library/onboarding/CategoryPickerModal.jsx` (~8 KB) — modal с list categories (см. ниже).
- `Library/onboarding/demo-categories.js` (~2 KB) — hardcoded categories список.

**Categories:**

```js
export const ONBOARDING_CATEGORIES = [
  { slug: 'cloning_basic',     name: 'Базовые векторы клонирования', plasmids: ['pUC19', 'pBR322', 'pET28b', ...] },
  { slug: 'fungi_expression',  name: 'Экспрессия в грибах',          plasmids: ['pPICZα', 'pAOX1', 'pHisA', ...] },
  { slug: 'bacteria_expression', name: 'Экспрессия в бактериях',     plasmids: ['pET21', 'pGEX-2T', 'pMAL-c2', ...] },
  { slug: 'yeast_expression',  name: 'Экспрессия в дрожжах',         plasmids: ['p426', 'pYES2', 'pRS415', ...] },
  { slug: 'shuttle',           name: 'Shuttle векторы',              plasmids: ['pSV2', 'pBluescript', ...] },
];
```

Source — currently shipped через `gui/designer/public/snapgene-catalog/` (existing M-A.3 SnapGene catalog data). Эти plasmids уже доступны как demo source — М-X.5 переиспользует это data, не вводит новый source.

Categories выбираются сразу при первой open Library (либо если biolog нажал «Добавить базовые» после очистки Library).

**Onboarding flow:**

1. Library открывается.
2. Если `Object.keys(libraryEntries).length === 0` → render `OnboardingNudge` banner внутри LibraryTree поверх «Untagged» empty state.
3. Banner: «Загрузить базовые плазмиды для начала работы» + button «Выбрать категории...» + close `×` button (dismiss banner without action).
4. Click «Выбрать категории» → CategoryPickerModal opens.
5. Modal: list of 5 categories с count plasmids в каждой, multi-select checkboxes.
6. Click `Добавить выбранное (N)` → batch import per selected category → entries appear in Library с tag = `demo:<categorySlug>` AND folder = `Demo/<categoryName>`.
7. Banner dismisses.

**Banner после dismiss:** не появляется снова в той же сессии. Если biolog очистит Library (delete all) и refresh → появится снова. Persist `onboardingDismissed: boolean` в localStorage не нужно — derive из libraryEntries empty.

**Тесты:**
- Empty Library → banner visible.
- Non-empty Library → banner hidden.
- Click button → modal opens.
- Select 2 categories → click Done → entries appear с правильными tags.

**Acceptance:** биолог at first launch видит pUC19/pBR322 etc. в категориях, выбирает «Базовые векторы», получает их в Library.

**Размер патча:** ~13 KB new + ~5 KB tests. ~2 дня Code work.

---

### K6 — Read-only / Editable toggle для SequenceView

**Цель:** добавить mode toggle в LibrarySingleInspector header. SequenceView рендерится в read-only mode по умолчанию. Click on READ-ONLY pill → switch to EDITABLE mode.

**Файлы:**

- `LibrarySingleInspector.jsx` — modify header. READ-ONLY pill становится `<button>` clickable element.
- `SequenceView/index.jsx` — добавить prop `editable: boolean = false`. Default rendering unchanged. Когда `editable: true`, добавить keyboard listener для character input в position cursorPos.
- `useManualEditDetection.js` (~2 KB) — new hook. Listens character input в SequenceView. On first character change, fires callback to LibrarySingleInspector.

**Pill behavior:**

```jsx
<button
  className="readonly-pill"
  data-mode={editable ? 'editable' : 'readonly'}
  onClick={() => setEditable(v => !v)}
  title={editable ? 'Click to lock sequence' : 'Click to enable manual edit'}
>
  {editable ? S.sequenceEditable : S.sequenceReadOnly}
</button>
```

Visual:
- READ-ONLY: surface-2 background, secondary text color.
- EDITABLE: amber accent background, primary text. Optional pulsing dot.

Когда `editable: true`:
- SequenceView listens keyboard. Любая буква (A/T/G/C/N + IUPAC degenerate) → попытка character change at cursorPos.
- Backspace / Delete → попытка character delete.
- Paste (Ctrl+V) → multi-character insert.

Все попытки **первый раз** триггерят `useManualEditDetection` callback → `ManualEditConfirmModal` появляется → biolog confirms → DEC-LIB-MANUAL-01 branch создаётся.

После confirm — modal не появляется снова в той же сессии (для той же entry). Subsequent changes пишутся в `editedSequence` локально на новой entry-копии.

**Edge cases:**
- Если entry уже manual-edit branch (origin.kind === 'manual_edit') — confirm не показывается, биолог уже в manual-edit mode, character changes идут directly.
- Если biolog переключил EDITABLE → READ-ONLY с unsaved changes → confirm «У вас несохранённые изменения. Вернуться в edit mode?» либо «Сбросить изменения?».

**Тесты:**
- Pill render корректно в обоих режимах.
- Click pill → toggle.
- Editable mode + character → modal appears.
- Confirm → new entry created.
- Cancel → sequence unchanged.

**Acceptance:** биолог открыл pUC19 → жмёт READ-ONLY pill → видит EDITABLE state → печатает букву → видит confirm → подтверждает → видит «pUC19 (manual edit)» entry в Library.

**Размер патча:** ~8 KB new + ~3 KB SequenceView changes + ~3 KB tests. ~2-3 дня Code work.

---

### K7 — Library Save Flow (две кнопки)

**Цель:** добавить `LibrarySaveActions` в LibrarySingleInspector. Две кнопки Save после правок annotations.

**Файлы:**
- `Library/inspector/LibrarySaveActions.jsx` (~3 KB) — два button'а. Visible only когда `edits.editedAnnotations` exists.
- `LibrarySingleInspector.jsx` — mount LibrarySaveActions в header под TabBar (либо в footer).
- `librarySlice.js` — implement `overwriteLibraryEntryAnnotations` + `saveLibraryEntryAsVersion` (см. §3.4).

**LibrarySaveActions UI:**

```jsx
<div className="library-save-actions" data-has-changes={hasChanges}>
  <button
    onClick={handleOverwrite}
    disabled={!hasChanges}
    title="Перезаписать annotations в текущей entry. Старая версия будет потеряна."
  >
    Перезаписать в библиотеке
  </button>
  <button
    onClick={handleSaveAsVersion}
    disabled={!hasChanges}
    title="Сохранить как новую entry. Текущая остаётся unchanged."
  >
    Сохранить как новую версию
  </button>
</div>
```

Disabled state когда `hasChanges = !edits.editedAnnotations` либо `edits.editedAnnotations` равно `item.annotations` (no actual changes).

**Save flow logic:**

`handleOverwrite`:
1. Confirm dialog «Это перезапишет annotations entry [name]. Изменения нельзя откатить. Продолжить?».
2. → `librarySlice.overwriteLibraryEntryAnnotations(item._libraryEntryId, edits.editedAnnotations)`.
3. → toast «Сохранено» 2s.
4. → clear `perFileEdits.editedAnnotations` для этой entry.

`handleSaveAsVersion`:
1. Modal с input «Имя для новой версии: [pUC19_v2 (default suggestion)]» + autoname suggestion если collision.
2. → `librarySlice.saveLibraryEntryAsVersion(parentId, edits.editedAnnotations, newName)`.
3. → returns new entry id.
4. → switch LibrarySingleInspector to new entry (it has the edits applied).
5. → toast «Сохранено как [newName]».

**Тесты:**
- No edits → buttons disabled.
- Edit annotations → buttons enabled.
- Click Overwrite → entry annotations updated.
- Click Save as Version → new entry created с parent reference.

**Acceptance:** биолог редактирует region pUC19 → видит две кнопки → жмёт «Перезаписать» → entry обновлена. Либо «Сохранить как версию» → новая entry «pUC19_v2».

**Размер патча:** ~3 KB UI + ~5 KB slice actions + ~3 KB tests. ~1 день Code work.

---

### K8 — Quick-add icon

**Цель:** на каждом Library item row при hover (только если есть active project) показать `+` icon. Click → entry добавлена в проект как library_clone.

**Файлы:**
- `LibraryItemRow.jsx` — добавить optional prop `onQuickAdd: (item) => void`. Если non-null — render hover-revealed `+` button.
- `LibraryTree.jsx` — pass `onQuickAdd` callback который calls `useStore.getState().addContainerToCurrentProject(libraryClone)`.
- `LibraryGroupHeader.jsx` — quick-add не нужен (не на entry rows).

**Logic:**

```jsx
function LibraryItemRow({ item, onSelectItem, onQuickAdd, ... }) {
  const hasProject = useStore(s => !!s.currentProjectId);
  const showQuickAdd = hasProject && onQuickAdd;
  return (
    <div className="library-item-row">
      {/* ... existing PlasmidMiniMap + name + length ... */}
      {showQuickAdd && (
        <button
          className="library-quick-add"
          onClick={(e) => { e.stopPropagation(); onQuickAdd(item); }}
          title={`Добавить в проект ${currentProjectName}`}
        >
          ➤
        </button>
      )}
    </div>
  );
}
```

CSS: `.library-quick-add` opacity 0 by default, opacity 1 on `.library-item-row:hover`.

`onQuickAdd` callback в LibraryTree:
1. Get current project from store.
2. Build `library_clone` Container с new UUIDv7 + `origin: { kind: 'library_clone', sourceLibraryEntryId: item.id, sourceLibraryEntryHash: item.payload.resourceHash, clonedAt: ... }`.
3. Call `useStore.getState().addContainerToCurrentProject(container)`.
4. Toast «Добавлено в проект [projectName]» + popFullscreen() back to canvas.

**Тесты:**
- No active project → quick-add icon hidden.
- Active project + hover → icon visible.
- Click → container в project.

**Acceptance:** биолог в Library с открытым проектом → hover на pUC19 → видит `+` → click → возврат на canvas, pUC19 в DAG.

**Размер патча:** ~2 KB UI + ~3 KB callback wiring + ~2 KB tests. ~1 день Code work.

---

### K9 — Drag-drop / paste detection в Library + per-file vs multi-file routing

**Цель:** определить is-multi-import при drag-drop / paste / file picker. Single → direct LibraryTree update, Multi → MultiImportView.

**Файлы:**
- `Library/index.jsx` — главный routing. Listens drag-drop / paste / file picker events.
- `Library/hooks/useLibraryState.js` — state для `multiImportPending`.

**Detection logic:**

```js
function handleFiles(files) {
  if (files.length === 0) return;
  if (files.length === 1) {
    // Single file → direct path. PreImportModal либо direct add to Library tree.
    handleSingleFile(files[0]);
  } else {
    // Multi-file → multi-import view.
    parseAllAndShowMultiImport(files);
  }
}

function handlePasteText(text) {
  // Paste → always single-file path. Multiple sequences in one paste = single sequence.
  handleSinglePaste(text);
}
```

`parseAllAndShowMultiImport(files)`:
1. Parse each file через existing parsers.
2. Build ParsedFile array: `[{ fileName, parsedContent, parseError? }, ...]`.
3. `setMultiImportPending(parsedFiles)`.
4. LibraryTree unmounts, MultiImportView mounts.

**Single-file path:**

`handleSingleFile(file)`:
1. Parse file.
2. Show PreImportModal (existing M-X.2 component) для metadata capture.
3. On confirm → add as Library entry.

PreImportModal остаётся как есть для single-file path. Multi-file пропускает PreImportModal — metadata собирается per-file inside MultiImportView table.

**Тесты:**
- Drop 1 file → PreImportModal opens.
- Drop 3 files → MultiImportView opens.
- Paste sequence → single-file path.

**Acceptance:** drag-drop 3 файлов → MultiImportView. Single drop → PreImportModal (current behavior).

**Размер патча:** ~5 KB routing logic + ~3 KB tests. ~1 день Code work.

---

### K10 — Manual edit branching implementation

**Цель:** implement `librarySlice.createManualEditBranch` action. Connect `useManualEditDetection` hook → action → new entry creation.

**Файлы:**
- `librarySlice.js` — implement `createManualEditBranch` action (см. §3.4).
- `Library/inspector/ManualEditConfirmModal.jsx` (~3 KB) — confirm dialog с descriptive text.
- `useManualEditDetection.js` — already created K6, wire to slice action.
- `LibrarySingleInspector.jsx` — handle event when manual-edit branch created → switch active entry to new branch.

**ManualEditConfirmModal UI:**

```
+--------------------------------------------------+
|  Manual edit                                     |
+--------------------------------------------------+
|                                                  |
|  Это manual edit. Будет создана новая ветка     |
|  плазмиды [name] (manual edit).                 |
|                                                  |
|  Текущая entry [name] остаётся неизменной.      |
|  Все ваши правки идут в новую копию.            |
|                                                  |
|  [Отмена]   [Создать ветку и продолжить]        |
+--------------------------------------------------+
```

Logic:
1. Cancel → revert character change, return EDITABLE pill to READ-ONLY, no entry created.
2. Confirm → `librarySlice.createManualEditBranch(parentId, originalSequence, originalAnnotations)` → new entry created с одинаковыми sequence + annotations.
3. Switch LibrarySingleInspector to new entry.
4. New entry now has manual-edit flag + parent reference.
5. `editedSequence` теперь applies к new entry, biolog продолжает manual editing.
6. Subsequent character changes в этой session → no confirm, direct edits.

`createManualEditBranch` slice action:

```js
createManualEditBranch: async (parentId, sequence, annotations) => {
  const parent = get().libraryEntries[parentId];
  if (!parent) return null;
  const newId = uuidv7();
  const newName = `${parent.name} (manual edit)`;
  // autoname collision check
  const safeName = get().getSuggestedLibraryName(newName);
  const newEntry = {
    id: newId,
    kind: parent.kind,
    name: safeName,
    tags: parent.tags,
    addedAt: new Date().toISOString(),
    origin: {
      kind: 'manual_edit',
      parentEntryId: parentId,
      parentEntryHash: parent.payload.resourceHash,
      editedAt: new Date().toISOString(),
    },
    version: 1,  // first version of manual-edit branch
    parentEntryId: parentId,
    parentEntryHash: parent.payload.resourceHash,
    manualEditFlag: true,
    payload: {
      ...parent.payload,
      sequence,
      annotations,
      // resourceHash recomputed
      resourceHash: await computeResourceHash({ sequence, topology: parent.payload.topology, ends: parent.payload.ends }),
    },
  };
  set(state => { state.libraryEntries[newId] = newEntry; });
  await putLibraryEntry(newEntry);
  return newId;
}
```

**Тесты:**
- Manual edit confirm → new entry в store.
- New entry has correct origin.kind === 'manual_edit'.
- New entry has parentEntryId reference.
- Subsequent edits в той же session don't trigger modal.

**Acceptance:** биолог делает manual edit → видит modal → confirm → видит «pUC19 (manual edit)» в Library tree → продолжает editing без modal.

**Размер патча:** ~5 KB modal + ~5 KB slice action + ~5 KB wiring + ~3 KB tests. ~2 дня Code work.

---

### K11 — Visual differentiation в Library tree (manual edit / version icons)

**Цель:** в Library tree рядом с entry row показывать icon если entry — manual-edit branch либо version. Биолог визуально различает provenance.

**Файлы:**
- `LibraryItemRow.jsx` — добавить small icon based on `item.origin.kind`:
  - `file_import` — no icon (default).
  - `paste_import` — paste icon (📋).
  - `demo_category` — demo icon (📚) либо category-specific.
  - `manual_edit` — pencil icon (✎) с tooltip «Manual edit branch from [parent name]».
  - `version` — version icon (⎘) с tooltip «Version [N] of [parent name]».

**CSS:**

```css
.library-item-origin-icon {
  margin-right: 4px;
  font-size: 10px;
  color: var(--text-tertiary);
  cursor: help;
}
.library-item-origin-icon[data-origin="manual_edit"] {
  color: var(--accent-700, #c2410c);  /* amber accent for manual edits */
}
```

**Тесты:**
- Render LibraryItemRow with origin.kind === 'manual_edit' → pencil icon visible.

**Acceptance:** биолог в Library tree различает оригиналы и manual-edit ветки.

**Размер патча:** ~1 KB UI + ~1 KB tests. ~30 минут Code work.

---

### K12 — Final size check + commit + tests

**Цель:** убедиться что все hard violations cleared, прогон tests чистый, готов к acceptance.

**Чек-лист:**

- [ ] `LibraryTree.jsx` ≤ 30 KB (soft .jsx 30, hard 40). Was 60 KB CatalogColumn.
- [ ] `LibrarySingleInspector.jsx` ≤ 32 KB (soft 30, +2 OK). Was SingleInspector 32 KB.
- [ ] `MultiImportView.jsx` ≤ 15 KB (new).
- [ ] `librarySlice.js` ≤ 20 KB (soft .js 20, hard 25). Was 6.14 KB → ~12-15 KB.
- [ ] All new files в `Library/` directory tree per §3.2.
- [ ] No remaining files в `components/Importer/` directory.

**Тесты:**
- `npx vitest run` — all passing. Estimated +60-80 new tests, total ~1500-1530.
- pytest 112/112 unchanged.
- Build clean.

**Commit message:**

```
refactor(m-x.5): Library as primary workspace

K1 chore: rename components/Importer → components/Library
K2 chore: remove Importer fullscreen + dead code
K3 refactor: LibraryTree decomposition (CatalogColumn 60 → 30 KB + 5 sub-components)
K4 feat(library): MultiImportView with per-batch + per-file annotation choice
K5 feat(library): onboarding nudge + category picker modal
K6 feat(library): editable mode toggle + manual edit detection hook
K7 feat(library): two-button save flow (overwrite / save as version)
K8 feat(library): quick-add icon for active project
K9 feat(library): single vs multi import routing
K10 feat(library): manual edit branching
K11 feat(library): visual origin icons в Library tree
K12 chore: size budget verification

⚓ DEC-IMP-06: Importer fullscreen abolished, Library = primary workspace
⚓ DEC-LIB-12: sequence mutable through manual-edit branching (supersedes DEC-LIB-05)
⚓ DEC-LIB-13: annotations mutable through explicit save flow (extends DEC-LIB-06)
⚓ DEC-LIB-14: edit parity SequenceView ↔ Annotator
⚓ DEC-LIB-15: import targets — Library only / Library + project
⚓ DEC-LIB-16: read-only by default for sequence editing
⚓ DEC-LIB-17: onboarding through nudge, not modal

Sprint-level DEC: DEC-LIB-MULTI-01..03, DEC-LIB-MANUAL-01, DEC-LIB-QUICKADD-01, DEC-LIB-SAVE-01.

Tests: ~1500/1500 passing. Build clean. Hard violations: 1 (AnnotationTrack 41.6 KB
deferred от M-X.2-fix, не в этом sprint scope).
```

---

## §5. Migration plan

### 5.1 Existing data в IndexedDB

Existing Library entries имеют schema:
```js
{ id, kind, resourceId, resourceHash, name, tags, addedAt, payload, ext }
```

**Migration runs lazy в `hydrateLibrary()`.** Для каждой existing entry без `origin` field:

```js
function migrateEntry(entry) {
  if (entry.origin) return entry;  // already migrated
  return {
    ...entry,
    origin: {
      kind: 'file_import',
      sourceFileName: entry.name,
      sourceFormat: 'gb',  // best-guess fallback
      importedAt: entry.addedAt,
    },
    version: 1,
    parentEntryId: undefined,
    parentEntryHash: undefined,
    manualEditFlag: undefined,
  };
}
```

Migration write to Dexie atomically per entry. Если biolog имеет 100 entries → 100 small write transactions при first hydrate. Acceptable (one-time cost).

### 5.2 Project containers (DAG)

Project containers — не затрагиваются. `origin: library_clone` остаётся как было.

### 5.3 Settings и user preferences

Sprint M-X.5 не меняет user preferences. localStorage keys same.

---

## §6. Acceptance criteria

8 integration scenarios. Биолог проходит каждый. Все должны PASS для acceptance.

### S1: First launch onboarding

1. Wipe IndexedDB (clear all data).
2. Open BodgeGene.
3. Click Library в Start screen sidebar.
4. **Expect:** Library opens, OnboardingNudge banner visible над пустым «Untagged» group.
5. Click «Выбрать категории».
6. **Expect:** CategoryPickerModal opens с 5 categories.
7. Select «Базовые векторы клонирования».
8. Click `Добавить выбранное (1)`.
9. **Expect:** modal closes, banner dismisses, entries appear в `Demo / Базовые векторы клонирования` folder. Toast «Загружено N плазмид».

### S2: Multi-file import

1. Library open.
2. Drag-drop 3 .gb files (например pUC19, pET28b, pBR322 из любых sources).
3. **Expect:** LibraryTree unmounts, MultiImportView replaces it. 3 rows visible с file names.
4. Top control: «Аннотировать все: [● Авто]» selected.
5. Folder selector: «Untagged» selected.
6. Click `Готово (3 файла)`.
7. **Expect:** auto-annotation runs, MultiImportView unmounts, LibraryTree shows 3 new entries в Untagged folder. Каждая имеет annotations from common-features-homology auto-annotator.

### S3: Single-file edit + Save as version

1. Library tree shows pUC19_v2 entry.
2. Click pUC19_v2.
3. **Expect:** LibrarySingleInspector opens. Title row shows «pUC19_v2 · 2746 bp · circular». Pill shows «READ-ONLY» (clickable).
4. Click Annotations tab.
5. Embedded Annotator runs Level 1 auto-annotate.
6. Result row: «AmpR» (95% confidence). Click `Accept`.
7. Click `Save N` button (top-right of Annotator).
8. **Expect:** annotation accepted in editedAnnotations.
9. Switch to Sequence tab.
10. **Expect:** AmpR rectangle visible in SequenceView annotations track.
11. Header now shows two save buttons: `[Перезаписать]` `[Сохранить как версию]` (enabled).
12. Click `Сохранить как версию`.
13. **Expect:** name input modal with default «pUC19_v2 (v2)».
14. Confirm.
15. **Expect:** new entry created, LibrarySingleInspector switches to «pUC19_v2 (v2)». Toast «Сохранено как pUC19_v2 (v2)». Library tree shows both pUC19_v2 (original, unchanged) and pUC19_v2 (v2) (new).

### S4: Single-file edit + Overwrite

1. Same as S3 шаги 1-11.
2. Click `Перезаписать в библиотеке`.
3. Confirm dialog «Перезаписать pUC19_v2 — продолжить?» → confirm.
4. **Expect:** entry annotations updated, version counter incremented (visible in MetaColumn liner). Toast «Сохранено». No new entry.

### S5: Manual edit branching

1. Library tree shows pUC19_v2 entry.
2. Click pUC19_v2 → LibrarySingleInspector opens.
3. Click READ-ONLY pill.
4. **Expect:** pill changes to EDITABLE с amber accent.
5. Switch to Sequence tab. Click on position 145 в SequenceView.
6. Caret visible at 145.
7. Press `T` on keyboard.
8. **Expect:** ManualEditConfirmModal opens.
9. Confirm.
10. **Expect:** new entry «pUC19_v2 (manual edit)» created. LibrarySingleInspector switches to it. Sequence at 145 now T (was C, changed). Library tree shows both entries with pencil icon on new one.
11. Type more characters → no modal (already in manual-edit branch).

### S6: Quick-add to project

1. Open project «MyProject1» (from Recent либо create new).
2. Open Library из Project DAG toolbar.
3. **Expect:** Library opens, navStack shows DAG underneath.
4. Library tree shows entries. Hover on pUC19_v2.
5. **Expect:** `➤` icon appears on hovered row (right side).
6. Click `➤`.
7. **Expect:** Library closes, return to project DAG canvas. pUC19_v2 visible как Container node на DAG. Toast «Добавлено в MyProject1».

### S7: Multi-import with mixed annotation choice

1. Library open.
2. Drag-drop 3 files: pUC19_v2.gb, custom_construct.gb, plasmid_no_features.fasta.
3. MultiImportView opens.
4. Top control: select «Авто».
5. For row plasmid_no_features.fasta: change dropdown to «Не нужно».
6. For row custom_construct.gb: change dropdown to «Вручную».
7. Click `Готово (3 файла)`.
8. **Expect:** pUC19_v2 — auto-annotated. plasmid_no_features — saved without annotations. custom_construct — Library opens to it with Annotator embedded, batch table at top of Annotator showing «1 of 1 manual annotation pending: custom_construct.gb». Biolog annotates manually, saves.
9. **Expect:** all 3 entries в Library tree.

### S8: Read-only / Editable transition с unsaved changes

1. Open pUC19_v2 entry in LibrarySingleInspector.
2. Click READ-ONLY → EDITABLE.
3. Type one character (e.g. position 145: A → T).
4. ManualEditConfirmModal opens. **Cancel** instead of confirm.
5. **Expect:** sequence reverts (still A at 145), pill returns to READ-ONLY либо stays EDITABLE no change. No new entry.
6. Click pill again → EDITABLE.
7. Type another character → modal opens again (still first character of session).

---

## §7. Risks + mitigations

### R1: Migration corrupts existing entries

**Mitigation:** Migration runs lazy on read, не bulk при upgrade. Each entry validated пред write. If validation fails → log warning, skip migration for that entry (entry remains old schema, will retry on next read). Backup IndexedDB через export перед M-X.5 upgrade — biolog должен сделать «Export all .bodge» перед обновлением.

### R2: Multi-file drag-drop confuses biolog

**Mitigation:** MultiImportView обозначен явно (header «Multi-import: 3 файла»), Cancel button прозрачен возврат, defaults safe (Авто annotation, Untagged folder). Single-file path остаётся unchanged через PreImportModal.

### R3: Manual-edit branching раздражает при exploration

**Mitigation:** Read-only по умолчанию защищает от случайного branching. Biolog должен явно жать READ-ONLY pill → только потом can break sequence. Confirm dialog tells what will happen.

### R4: Quick-add icon clutter

**Mitigation:** Hover-revealed only. Visible only когда есть active project. Никакой clutter в Library standalone view (со Start screen).

### R5: AnnotationTrack 41.6 KB hard violation остаётся

**Не митигируется в этом sprint'е.** TD-ANNOTATIONTRACK-DECOMPOSE-V2 переносится в M-X.6 polish sprint после acceptance M-X.5.

### R6: SnapGene catalog rendering slows Library tree

**Mitigation:** existing `content-visibility: auto` + `contain: paint` + ItemRow memo gate сохраняются (К3 декомпозиция не меняет per-row rendering perf). Onboarding default = только 1-2 категории, не весь catalog.

### R7: Multi-import view ломается на больших batches (>20 files)

**Mitigation:** soft cap 20 files в batch. >20 → warning «Слишком много файлов. Загрузите по частям.» либо paginated view (опц., не в первой версии).

---

## §8. Open questions for kickoff

Если что-то непонятно перед стартом — Code останавливается, спрашивает Chat.

### Q1: SnapGene catalog data location в M-X.5

Existing catalog entries (~700 plasmids) live в `gui/designer/public/snapgene-catalog/`. После M-X.5 они должны:
- (а) Остаться там как «virtual entries» (показываются в LibraryTree с tag `demo:<category>` НО физически в IndexedDB не попадают, copy-on-click).
- (б) Migrated в IndexedDB при first hydrate (~700 entries в personal Library) — biolog видит свою personalized Library с this всеми plasmids.
- (в) Hybrid: лишь selected categories (через onboarding) попадают в IndexedDB, остальные доступны через separate browse mode.

Я склоняюсь к **(в)** — это хороший баланс между «единые законы» (DEC-IMP-06) и не-засорением Library.

### Q2: Existing v0.7.x Library entries — какие origin при migration?

Все existing entries созданы через old Importer flow. Migration ставит `origin: { kind: 'file_import', sourceFileName: entry.name, sourceFormat: 'gb', ... }` как default. Это loses информации (если entry была paste либо demo).

Альтернатива — добавить migration heuristic:
- `entry.tags` contains «demo» → `origin: { kind: 'demo_category', ... }`.
- `entry.name` matches SnapGene catalog name → `origin: { kind: 'demo_category', ... }`.
- Otherwise `file_import`.

Я склоняюсь к heuristic — лучше approximate но meaningful чем universal `file_import`.

### Q3: ManualEditConfirmModal — как часто?

Я предложил «один раз per session per entry». Но что значит «session»? Зашёл в Library, переключился на другую entry, вернулся — это та же session? Я бы шёл «один раз per LibrarySingleInspector mount» — каждый раз когда biolog заходит в entry, первый character change → confirm. Если biolog уходит и возвращается — confirm снова.

### Q4: «Сохранить как новую версию» — какое имя default

Если parent name = «pUC19_v2» — default = «pUC19_v2 (v2)» либо «pUC19_v3»? autoname collision check уже работает в M-A.3. Я склоняюсь к «pUC19_v2 (v2)» — biolog меняет на любое.

---

## §9. Тесты

Estimated +60-80 new tests, total ~1500-1530 после M-X.5.

**Coverage areas:**

- **K1-K2 migration** (15 tests): rename imports, deleted components have no usages, store routing.
- **K3 LibraryTree decomposition** (8 tests): folder rendering, drag-drop unchanged, item row memo gate.
- **K4 MultiImportView** (12 tests): single vs multi routing, per-file override, batch annotation choice, cancel flow.
- **K5 Onboarding** (8 tests): empty Library shows nudge, category select, demo entries created.
- **K6 Edit toggle** (10 tests): pill render, click toggle, character detection, modal trigger.
- **K7 Save flow** (10 tests): buttons enabled/disabled, overwrite action, save-as-version action, autoname.
- **K8 Quick-add** (5 tests): hover reveal, click action, no project case.
- **K9 Drag-drop routing** (5 tests): single → PreImportModal, multi → MultiImportView.
- **K10 Manual edit branching** (10 tests): confirm flow, new entry created, parent reference.
- **K11 Origin icons** (5 tests): render per origin.kind.
- **К12 size check** (manual verification).

Plus integration tests на 8 acceptance scenarios (S1-S8) — каждый из которых end-to-end.

---

## §10. Acceptance gate + finalization

**После K12 и all tests passing:**

1. Push branch `feature/library-as-workspace` to GitHub.
2. **Визуальная приёмка биологом** — проходит все 8 scenarios (S1-S8). Записывает PASS / FAIL по каждому.
3. Если все PASS → finalization.
4. Если есть FAIL → fix sprint M-X.5-fix (точечный, тип D-C).

**Finalization tasks:**

- ⚓ Promote DEC-IMP-06, DEC-LIB-12..17, DEC-LIB-14 (edit parity), DEC-LIB-15 (targets) в `ANCHORS.md`.
- DEC-LIB-MULTI-01..03, DEC-LIB-MANUAL-01, DEC-LIB-QUICKADD-01, DEC-LIB-SAVE-01 → `DECISIONS.md`.
- ARCHITECTURE_v2 v1.3 changelog: rewrite §2.7 Library, §3.5 Importer (delete), §3.7 Mermaid (Library as primary), §7 Roadmap (M-X.5 entry), §10 NOT-DO list (DEC-IMP-XX supersede).
- `RELEASES.md` v0.8.0 entry.
- `PROJECT_STATE.md` update first line to v0.8.0 + что вошло.
- Spec `SPRINT_M-X.5_LIBRARY_AS_WORKSPACE.md` → `docs/archive/` со штампом ✅.
- Journal entry в `PROJECT_STATE.md` журнал сессий.
- Closing TECH_DEBT entries: TD-LIBRARY-WRITE-API (closed by K7).
- Carrying TECH_DEBT: TD-ANNOTATIONTRACK-DECOMPOSE-V2 (carries over к M-X.6), TD-CIRCULAR-SELECTION (carries over к whenever биолог захочет).

**Версия:** v0.8.0 (major bump из-за фундаментального architectural change).

---

**Дата создания:** 06 мая 2026.
**Статус:** 🔴 В разработке — ожидает утверждения биолога.
**Author:** Claude Chat.
**Сложность:** Тип A (архитектурный, ~3-4 недели Code work).
