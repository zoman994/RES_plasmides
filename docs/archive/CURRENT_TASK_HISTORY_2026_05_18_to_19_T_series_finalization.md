# CURRENT_TASK_HISTORY — T-series финализация + post-148936a UX батчи (18-19.05.2026)

Архив CURRENT_TASK.md от завершения T1-T10 sprint до начала M-FORMAT-V2-CORE.

**Контекст:** этот файл — snapshot CURRENT_TASK.md по состоянию на 19.05.2026 перед перезаписью под новый sprint M-FORMAT-V2-CORE. Содержит финальный отчёт Code по T-серии + 4 пост-финализационных батча UX-фиксов которые не вошли в коммит `148936a chore(release): v0.8.3-alpha finalization`.

**Ссылки:**
- Финализационный коммит: `148936a` (468 файлов, v0.8.3-alpha bump + coord-доки + архив 10 устаревших спек + T-спеки).
- Vitest на момент архивации: **3296 pass / 1 skip / 0 fail** (после post-148936a батчей: assembly-unify +3 → 3287, zone-attach H1/H4 +5 → 3291 (− 0 рег), zone-attach H2/H3 +5 → 3296, piece-from-primers in-place → 3296).
- Незакоммиченные изменения (post-148936a, ждут отдельного коммита): assembly-unify, zone-attach H1/H4 + H2/H3, piece-from-primers source/shape fix.
- Предыдущий архив: `docs/archive/CURRENT_TASK_HISTORY_2026_05_16_to_18_T_series.md` (202 KB, по Code work до финализации).

---

## Что было сделано Code (T1-T10 + extras) — краткий перечень

**Sprint T1-T10 (four-tier architecture):**
- T1 Pieces State — piece как первичная сущность, derivedReactionId, frozen, schema v6.
- T2 Pieces Migration — op.inputPieces + op-piece-bridge, surgical opt-in adapters (DEC-T2-09 surgical, не литеральная замена), миграция v5→v6.
- T3 Zones Data — `state.zones` slice + `zoneId` на узлах, миграция v6→v7. Default zone «Сборка 1» (DEC-T3-08, **позже реверснут**).
- T4 Zones Rendering — ZoneFrame/ZoneLayer/ZoneContextMenu, drag/resize/merge, hit-detect, cross-zone junctions dashed. Интеграция: вариант B (informed go, K9 graph-view отложен по design-mismatch).
- T4.5 Zone 3-lane Auto-Layout — Source/Intermediate/Final lanes через dagre, pinned-флаг (auto-pin при drag), миграция v9→v10.
- T5 Piece Authoring UI — 4 способа (selection / feature / existing-primers / new-primers), PieceCreateModal + PiecePrimersPickModal + хоткей P.
- T6 Sequence-Mode Migration — assembly-mode→pieces через dual-source dual-resolution (НЕ литеральный no-op §5.9). Adapter foundation + 14 UI файлов мигрированы. Миграция v7→v8.
- T7 Dual-Mode Toggle + Sync — inline sequence-mode (3 состояния), хоткей G/S, ATTACH/DETACH/REORDER, focusedZoneId.
- T8 Auto-Reactions + Cross-Zone Links — finalizer создаёт/удаляет ромбы по piece.acquisitionMethod; ZoneLinkBadge «← Зона N» с pan + highlight.
- T9 Variants — design variants (variantGroupId) vs clone variants (op.materializedClones, hard cap 96). BranchingVisual rewrite 3 kinds. Миграция v8→v9.
- T10 Sanger MVP — right panel hotkey B, 4-status segmented control, notes ≤500. BranchingVisual цветные indicators.

**Bug fixes:**
- V82 — AssemblyDraftsPanel переписана zone-based.
- V83 — gap с известной ПСО сохраняется в `gapSequence`, не подменяется поли-N.
- V84 — realise-продукты наследуют аннотации через `transferAnnotations` + `concatSegmentAnnotations`.

**Canvas UX батч (17.05):**
- 4-сторонние коннекторы (edgeAnchors).
- Wheel-zoom-к-курсору (focal-invariant).
- Бесконечный канвас (canvasContentExtent + edge-auto-pan).
- Hand-pan «хватать канвас» (panScrollTarget, gate by closest-target).
- Stationary zoom-индикатор (non-scrolling wrapper).
- Drag-release ромба не открывает viewer (justDraggedRef guard).
- «Очистить канвас» gated RESET.

**Реверс ⚓-уровня (17.05, по решению Игоря):**
- **DEC-T3-08 РЕВЕРС** — `buildInitialState` больше НЕ сидит default zone; `zones:[]` всегда.
- **V61 РЕВЕРС** — `ensureGhostPlaceholder` финализатор отключён; чистый старт без ghost.
- Кнопка «Сборки» перенесена bottom-right.

**Primer redesign (18.05):**
- `PrimerFromSelectionModal` через right-click «праймер» во всех 5 виверах.
- Кликабельность праймеров везде (back-compat: без callback — декоративный).
- Double-click → редактирование через ту же модалку.
- Flank-highlight только для fwd+rev пары.
- Pentagon-arrow glyph по обе стороны цепи.
- Selected primer: bold ring + colour-halo.

**Cross-cutting:**
- `primer-canvas-editor` — ContainerEditorSkeleton через `useEntryPrimers`.
- `viewer-sync` — `showSelectionTm` на 5 дизайн-виверах.
- `annotator-toggle` — вкладка «Аннотации» → toggle-кнопка в `TabBar`.
- `inspector-decomp` — `useInspectorSelectionNav` hook extract. `LibrarySingleInspector.jsx` 39.34 → **31.28 KB**.
- Primer pool: `origin.kind='library-selection'` новая конвенция.
- `hydratePrimers()` вызывается в проде через Library/Container hook.

---

## Что должен был сделать Chat (финализация — выполнено)

### Пачка 1c (18.05) — PROJECT_STATE.md
- ✅ first line bump v0.8.2 → v0.8.3-alpha + Vitest 3276 + Schema v10. Journal entry с массивным sprint-блоком 16-18.05.

### Пачка 2 (19.05) — ANCHORS/DECISIONS/TECH_DEBT/RELEASES
- ✅ **ANCHORS.md** — реверс ⚓ DEC-T3-08 + V61. Кандидаты-⚓ DEC-CANVAS-4T-01 (piece первичная), DEC-CANVAS-4T-07 (zone Miro-frame), DEC-CANVAS-4T-31 (3-lane structure).
- ✅ **DECISIONS.md** — sprint-block v0.8.3-alpha с DEC-T1..T10 + T4.5 + V82-V84 + canvas UX + primer redesign + annotator-toggle + useInspectorSelectionNav.
- ✅ **TECH_DEBT.md** — TD-LIBRARYSINGLEINSPECTOR-DECOMP-V2 → CLOSED. TD-SIZE-LIBRARYSINGLEINSPECTOR → Watch. **TD-CANVAS-LAYOUTVIEW-DECOMP** Active candidate (41.35 KB, пробил hard 40). TD-SIZE-SEQUENCEVIEW-INDEX → Active candidate (~39 KB).
- ✅ **RELEASES.md** — v0.8.3-alpha entry.
- ✅ **package.json + version.js** — bump до v0.8.3-alpha.

### Пачка 3 (18.05) — Архивация
- ✅ Архивация устаревших спек F1-F4 + A1-A4 + D1 + NOTES в `docs/archive/2026-05-16-pre-four-tier/` (PowerShell Move-Item ровно по скрипту).

### Финализационный коммит
- ✅ `148936a chore(release): v0.8.3-alpha finalization` (468 файлов, 18.05 поздно). Сознательно исключены `docs/design_assets/*` (личное: passport, договоры, xlsx, data.zip, test.bodge) — трижды проверено leak-чеком.
- ⚠️ Для будущего Chat'а: рекомендовать `docs/design_assets/` в `.gitignore` — риск попадания в `git add -A` при невнимательности.

---

## Post-148936a батчи Code (НЕ закоммичено, ждут следующего коммита)

### 1. Унификация «Сборки» — «Только зона» (18.05 поздно)
Диагноз: на канвасе сосуществовали 2 модели — зона «Сборка N» (four-tier, целевая) и легаси-карточка `assembly_N` (AssemblyDraft, pre-four-tier).
Фикс: новый `canvas/assembly-zone-create.js::buildAssemblyZoneAction(state)` — единственный источник CREATE_ZONE-экшена. Оба входа (index.jsx «+ Сборка» + AssemblyDraftsPanel.createZone) переведены. Легаси `CREATE_ASSEMBLY_DRAFT`/reducer оставлен UI-недостижимым (no-op для ~50 легаси-тестов).
`CanvasLayoutView.jsx` (41.35 KB, TD-SIZE Active hard-breached) НЕ тронут.
TDD: `__tests__/assembly-zone-create.test.js` (3 теста). Vitest 3284 +3 → 3287.

### 2. TD-ZONE-ATTACH-CONTAINMENT H1/H4 — scroll-uncorrected hit-test → unified `viewportToWorld`
Корень: drop-hit-test считал точку без скролла, позиция узла при драге — со скроллом → на проскролленном канвасе дроп резолвился неправильно.
Фикс: новый `canvas/canvas-layout.js::viewportToWorld({clientX,clientY,rect,scrollLeft,scrollTop,zoom})` — единственный screen→world transform. Использован в drop-hit-test И в `applyDragAt`.
TDD: `__tests__/canvas-viewport-to-world.test.js` (5 тестов). Vitest 3287 +5 → 3291 (− 0 рег).

### 3. TD-ZONE-ATTACH-CONTAINMENT H2+H3 — drop→`laneLayout:'manual'`
Решение: при ручном дропе узла В зону переключать эту зону `laneLayout→'manual'` (gated на target.laneLayout !== 'manual'). Manual-зона пропускает 3-lane `applyZoneLayouts` (соседей не перекладывает = H2) и попадает в grow-only union (bounds растут охватывая брошенный узел = H3).
TDD: `__tests__/zone-attach-containment.test.js` (4 теста, зеркало zone-frame-stability harness). Vitest 3291 +5 → 3296.
**TD-ZONE-ATTACH-CONTAINMENT — ПОЛНОСТЬЮ ЗАКРЫТО.**

### 4. «Праймеры есть, а кусок выбрать нельзя» — PiecePrimersPickModal fix (19.05)
Два рассинхрона: (a) ContainerEditorSkeleton кормил `<PiecePrimersPickModal primers={state.primers || []}>` — пустой легаси-массив вместо unified-pool через `useEntryPrimers`; (b) `selectEntryPrimers` мапил без `id`, а модалка использует `<option value={p.id}>`.
Фикс: `primers={entryPrimers}` + `selectEntryPrimers` сохраняет `id: p.id` в выводе (viewer-shape не задет, аддитивно).
TDD: `entry-primers.test.js` дополнен `id:"p1"`. Vitest 3296 (in-place update).

---

## Открытые вопросы от Code (для будущих acceptances)

### Annotator-toggle scope
Распространять ли annotator-toggle + chrome-унификацию `TabBar` на Assembly/PCR? Сейчас scope = Library/Importer + container-editor.

### LibrarySingleInspector — опциональный 2-й extract
Annotation-edit pipeline (`itemRef`/`editsRef` + `onAnnotationEditFromView` + `applyOpToAnnotations` + `useFeatureEditorFlow` + auto-run + undo-redo) → ещё ~5-7 KB, увело бы под soft 30 (31.28 → ~24-26). Code сознательно НЕ сделал — энтэнглд, риск > ценность.

### T9 follow-ups
- K13/K14 + graph-block badge — wire trigger-пункты CREATE_DESIGN_VARIANT / MATERIALIZE_REACTION в context-menu.
- Materialize trigger через op context-menu vs OP_EXECUTE-flow (DEC-T9 open-Q #1).
- Variant label numeric-by-createdAt vs буквенный (#3).
- «Merge variants back» explicit action (#2).

### T10 follow-ups
- `SHOW_SANGER_LAB_NOTEBOOK` click→focus link (BranchingVisual clone indicator → scroll-в-notebook+highlight).
- Notes save-on-blur потеря при panel-close до blur (R-T10-2, debounce/flush, post-MVP).

### T8 follow-ups
- Auto-reaction toast (created/removed/manual-remove-warning) — нужны ли.
- piece.ranges change → auto-reaction `params.range` recompute (#1).

### T6 follow-ups
- §5.9 vs Открытый-вопрос-#1 спека-противоречие — закрепить «assemblyReducer kept живым, no-op в T-future» в DECISIONS.
- Orphan-UX в zone-mode.
- InsertGapModal rename + editorContext.tabs rewrite — T-future cleanup.

### T5 follow-ups
- Op/PCR-консьюмеры primer-name follow-up.
- Способ Г (new-primers toast-orchestration в ContainerEditorSkeleton).

### Cross-portal pattern (для Chat в будущем)
Любой портал-модал из SequenceView ОБЯЗАН гасить `keydown` + `pointer` + `contextmenu` на backdrop — React-bubbling идёт по дереву компонентов, портал DOM-изоляции событий НЕ даёт. Кандидаты на аудит: `CreateAnnotationPopup`, `SelectionContextMenu`, `EditAnnotationModal`, `PiecePrimersPickModal`, `PieceCreateModal`.

---

## Метаданные на момент архивации (19.05.2026)

- **Version:** v0.8.3-alpha (version.js, package.json).
- **Schema:** 10 (T1=5 → T2=6 → T3=7 → T6=8 → T9=9 → T4.5=10).
- **Vitest:** 3296 pass / 1 skip / 0 fail.
- **pytest:** 112/112 (не запускался — фронт-sprint).
- **Build:** vite build clean, 0 console errors.
- **Известный flake:** TD-PRIMER-WIZARD-FLAKE (intermittent под parallel-load, isolated 2/2 — pre-existing).
- **Size watch:**
  - `CanvasLayoutView.jsx` 41.35 KB (.jsx hard 40 пробит — TD-CANVAS-LAYOUTVIEW-DECOMP Active).
  - `SequenceView/index.jsx` ~39 KB (close to hard).
  - `ContainerEditorSkeleton.jsx` 34.37 KB (soft 30 over).
  - `LibrarySingleInspector.jsx` 31.28 KB (Watch).

---

**Дата архивации:** 19.05.2026.
**Следующий sprint:** M-FORMAT-V2-CORE (см. `docs/SPEC_BODGE_FORMAT_V2_CORE.md`).
