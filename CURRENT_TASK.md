# CURRENT_TASK.md

## 🟢 Статус: T-серия завершена Code; финализация Chat в процессе — 18.05.2026

T1-T10 four-tier architecture + T4.5 zone auto-layout + V82-V84 баги + canvas UX батч + primer redesign + Library/Importer-inspector декомпозиция — **всё реализовано Code** между 16-18.05. Vitest **3276 pass / 1 skip / 0 fail** (baseline v0.8.2 = 2320, рост +956), `vite build` clean, 0 console errors. Schema v=10 через 6 миграций (v5→v6→v7→v8→v9→v10).

Архив отчётов Code → `docs/archive/CURRENT_TASK_HISTORY_2026_05_16_to_18_T_series.md` (202 KB, сохранён до перезаписи).

---

## Что было сделано Code (краткий перечень)

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
- V82 — AssemblyDraftsPanel перепи��ана zone-based (счётчик показывает default zone «Сборка 1»).
- V83 — gap с известной ПСО (T2A linker / своя ПСО) сохраняется в `gapSequence`, не подменяется поли-N.
- V84 — realise-продукты наследуют аннотации источника через `transferAnnotations` + новый `concatSegmentAnnotations`.

**Canvas UX батч (17.05):**
- 4-сторонние коннекторы (edgeAnchors).
- Wheel-zoom-к-курсору (zoomAtPoint focal-инвариант).
- Бесконечный канвас (canvasContentExtent + edgePanVelocity edge-auto-pan).
- Hand-pan «хватать канвас» (panScrollTarget, gate by closest-target).
- Stationary zoom-индикатор (внешний non-scrolling wrapper).
- Drag-release ромба не открывает viewer (justDraggedRef guard).
- «Очистить канвас» gated RESET button.

**Реверс ⚓-уровня (17.05, по AskUserQuestion Игоря «Полностью из state»):**
- **DEC-T3-08 РЕВЕРС** — `buildInitialState` больше НЕ сидит default zone; `zones:[]` всегда.
- **V61 РЕВЕРС** — `ensureGhostPlaceholder` финализатор отключён; чистый старт без ghost.
- Кнопка «Сборки» перенесена bottom-right (стек: +Операция 20 / +Сборка 64 / Сборки 108 / Очистить 152).

**Primer redesign (18.05):**
- `PrimerFromSelectionModal` (имя/ПСО/RC-toggle) — открывается из right-click «праймер» во всех 5 виверах.
- Кликабельность праймеров везде (`onPrimerClick`/`selectedPrimerKeys`), back-compat: без callback — декоративный.
- Double-click по праймеру → редактирование через ту же модалку (`primerDraft.name` pre-fill).
- Flank-highlight только для fwd+rev пары (биоинвариант: fwd-fwd / rev-rev не задают ампликон).
- Pentagon-arrow glyph по обе стороны цепи (forward сверху, reverse снизу) с вписанными binding-буквами.
- Selected primer: bold ring + colour-halo + full-opacity arrow.

**Cross-cutting:**
- `primer-canvas-editor` — ContainerEditorSkeleton теперь через `useEntryPrimers`, K10-заглушка закрыта.
- `viewer-sync` — `showSelectionTm` добавлен на все 5 дизайн-виверов (Library/Importer-инспектор, ContainerEditor×2, Assembly, PCR). Все несут одинаковую пятёрку: `primers`+`onWritePrimer`+`showSelectionTm`+caret+selection.
- `annotator-toggle` — вкладка «Аннотации» → toggle-кнопка в общем `TabBar.showAnnotations/onToggleAnnotator`. Scope: Library/Importer + container-editor.
- `inspector-decomp` — extract `useInspectorSelectionNav` hook (~170 строк caret/selection/LinearFeatureBar-навигации). `LibrarySingleInspector.jsx` 39.34 → **31.28 KB** (TD-SIZE эскалация СНЯТА, 8.7 KB запаса до hard).
- Primer pool extension: `origin.kind='library-selection'` (новая конвенция).
- `hydratePrimers()` теперь вызывается в проде через Library/Container hook (раньше dead code).

---

## Что должен сделать Chat (финализация)

### Пачка 1c (сейчас, продолжение текущей сессии)
- **PROJECT_STATE.md** — first line bump v0.8.2 → v0.8.3-alpha + Vitest 3276 + Schema v10. Journal entry с массивным sprint-блоком 16-18.05. Снять «M-X.8 PROJECT-HUB кандидат» (он уже в v0.8.2).

### Пачка 2 (следующая сессия после compact)
- **ANCHORS.md** — реверс ⚓ DEC-T3-08 + V61 (по прямому запросу Игоря). Добавить кандидаты-⚓: DEC-CANVAS-4T-01 (piece как первичная сущность), DEC-CANVAS-4T-07 (zone как Miro-frame), DEC-CANVAS-4T-31 (3-lane auto-layout structure).
- **DECISIONS.md** — sprint-block v0.8.3-alpha с DEC-T1..T10 + T4.5 + V82-V84 + canvas UX + primer redesign + annotator-toggle + useInspectorSelectionNav.
- **TECH_DEBT.md** — обновить статусы:
  - TD-LIBRARYSINGLEINSPECTOR-DECOMP-V2 → **CLOSED** (декомпозиция выполнена, 31.28 KB).
  - TD-SIZE-LIBRARYSINGLEINSPECTOR → Watch (1.28 KB в soft >30, не блокер).
  - TD-CANVAS-LAYOUTVIEW-DECOMP — новый, Active candidate (41.35 KB после T4.5 pin-бейджи, пробил hard 40 .jsx).
  - TD-SIZE-SEQUENCEVIEW-INDEX → Active candidate (39+ KB, близко к hard 40).
- **RELEASES.md** — v0.8.3-alpha entry.
- **package.json + version.js** — bump до v0.8.3-alpha.

### Пачка 3 (cleanup, можно отложить)
- Архивация устаревших спек F1-F4 + A1-A4 + D1 в `docs/archive/2026-05-16-pre-four-tier/` (+README). Filesystem MCP не имеет delete — нужен PowerShell move или stub-перезапись.
- Архивация `NOTES_FOUR_TIER_MODEL_DRAFT.md`, `NOTES_CANVAS_V2_KICKOFF.md` (устарели после `SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md`).
- Глубокая ротация `docs/` (текущее 53 файла против лимита 8) — отдельный side-quest `TD-DOCS-ROTATION`.

---

## Открытые вопросы от Code (для решения Chat в визуальной приёмке)

### Annotator-toggle scope
Распространять ли annotator-toggle + chrome-унификацию `TabBar` на Assembly/PCR? Сейчас scope = Library/Importer + container-editor (Assembly/PCR не тронуты — synthetic/template-последовательности, аннотатор там семантически неопределён).

### LibrarySingleInspector — опциональный 2-й extract
Annotation-edit pipeline (`itemRef`/`editsRef` + `onAnnotationEditFromView`/`onSequenceEditFromView`/`applyOpToAnnotations`/`useFeatureEditorFlow` + auto-run + undo-redo) → ещё ~5-7 KB, увело бы файл под soft 30 (31.28 → ~24-26). Code сознательно НЕ сделал в проход декомпозиции — энтэнглд, риск > ценность (hard-эскалация уже снята с большим запасом). Опциональный шаг, решение Игоря.

### T9 follow-ups
- K13/K14 + graph-block badge — wire trigger-пунктов CREATE_DESIGN_VARIANT / MATERIALIZE_REACTION в context-menu (substance готова, отложен только entry-point — слепая правка 36 KB CanvasLayoutView в хвосте сессии = риск).
- Materialize trigger через op context-menu vs OP_EXECUTE-flow (DEC-T9 open-Q #1).
- Variant label numeric-by-createdAt vs буквенный (open-Q #3, сейчас numeric).
- «Merge variants back» explicit action (open-Q #2, сейчас manual delete).

### T10 follow-ups
- `SHOW_SANGER_LAB_NOTEBOOK` click→focus link (BranchingVisual clone indicator → scroll-в-notebook+highlight) — event-bus/ref решение, отложено в визуальную приёмку.
- Notes save-on-blur потеря при panel-close до blur (R-T10-2, debounce/flush, post-MVP).

### T8 follow-ups
- Auto-reaction toast (created/removed/manual-remove-warning) — нужны ли (finalizer сейчас silent).
- piece.ranges change → auto-reaction `params.range` recompute (open-Q #1; finalizer пересоздаёт op только при kind-mismatch — изменения range при том же методе НЕ пересчитываются).

### T6 follow-ups
- §5.9 vs Открытый-вопрос-#1 спека-противоречие — закрепить решение «assemblyReducer kept живым, no-op в T-future» в DECISIONS.
- Orphan-UX в zone-mode (piece удаляется вместо badge/convert).
- InsertGapModal rename + editorContext.tabs rewrite — T-future cleanup-спайк.

### T5 follow-ups
- Op/PCR-консьюмеры primer-name follow-up (имя из модала не сохраняется по их create-пути).
- Способ Г (new-primers toast-orchestration в ContainerEditorSkeleton) — builder готов, отложена только toast-склейка.

### Cross-portal pattern для Chat
Любой портал-модал, монтируемый из SequenceView (или иного хоста с root-level keyboard/pointer-хендлерами), ОБЯЗАН гасить `keydown` + `pointer` + `contextmenu` на своём backdrop — React-bubbling идёт по дереву компонентов, портал DOM-изоляции событий НЕ даёт. Кандидаты на тот же аудит: `CreateAnnotationPopup`, `SelectionContextMenu`, `EditAnnotationModal`, `PiecePrimersPickModal`, `PieceCreateModal`.

---

## Sprint metadata

- **Version bump:** v0.8.2 → **v0.8.3-alpha** (patch, по решению Игоря).
- **Schema version:** 10 (T1=5 → T2=6 → T3=7 → T6=8 → T9=9 → T4.5=10).
- **Tests:** Vitest 3276 / 1 skip / 0 fail. pytest 112/112 (не запускался — фронтовый sprint).
- **Build:** vite build clean, 0 console errors.
- **Известный flake:** TD-PRIMER-WIZARD-FLAKE (`primer-wizard.test.jsx`, intermittent под parallel-load, isolated 2/2 — pre-existing, не связан с T-серией).
- **Size watch:** `CanvasLayoutView.jsx` 41.35 KB (`.jsx` hard 40 пробит после T4.5 pin-бейджи — TD-SIZE Active). `SequenceView/index.jsx` ~39 KB (close to hard). `ContainerEditorSkeleton.jsx` 34.37 KB (soft 30 over). `LibrarySingleInspector.jsx` 31.28 KB (после декомпозиции, Watch).

---

**Следующий шаг Chat:** обновить `PROJECT_STATE.md` (Пачка 1c), затем compact, затем Пачка 2.

---

## Code addendum — live UX-фиксы ПОСЛЕ snapshot Chat (18.05, продолжение сессии)

Snapshot выше зафиксировал Vitest **3276**. Игорь продолжил живую приёмку праймеров/виверов — ещё 3 правки поверх (Chat: учесть в PROJECT_STATE/RELEASES/DECISIONS, метаданные ниже актуализированы):

1. **`primer-hotkeys-everywhere`** — новый `SequenceView/hooks/usePrimerHotkeys.js` (зеркало `usePieceHotkey`): `pcr-primer-forward` (Ctrl+R)/`pcr-primer-reverse` (Ctrl+Alt+R) регистрируются в самом SequenceView → праймер-из-выделения хоткеи работают во ВСЕХ виверах (Library/container-editor), не только assembly/PCR. Shared-id конфликт разобран: `_handlers` single-per-id, child-эффект раньше parent, caret-dep handler shell'ов ре-регистрируется последним → assembly/PCR direct-write сохранён. +6 тестов (`use-primer-hotkeys.test.jsx`).
2. **`assembly-band-anchor`** — `SegmentZonesOverlay` брал `height=line.offsetHeight`; после primer-редизайна (forward над цепью / reverse под) высота строки скачет → полоса окраски сегмента «сдвигалась». Теперь полоса якорится к DNA strand-рядам (`[data-testid="sequence-view-strands"]` span), стабильна независимо от primer/ruler/annotation/AA. Геометрия (jsdom offset=0) — full-suite zone/assembly зелёные, визуал — браузерный приём Игоря.
3. **`tm-1-150-cap`** — `selectionTm`: счётчик нуклеотидов остаётся ВСЕГДА; убирается только Tm вне 2–150 п.о. (`tm=null` → подсказка `«N bp»` без `Tm ≈ …°C`). Праймер >150 bp невозможен + снимает тяжёлый расчёт. `SequenceFloatingTooltips` рендерит count всегда, Tm-префикс условно. 2 теста `selection-tm.test.jsx` обновлены (>150 → count есть, Tm нет; ровно 150 → Tm+count).

Также в этот пост-snapshot отрезок (часть уже могла быть в 3276, но для полноты): `primer-modal-fix` (portal+fixed+autofocus), `hotkeys-modal-fix` (Esc в React-onKeyDown, не window-listener — иначе stopPropagation глушил bubble-window хоткеи), `primer-click-fix` (transparent hit-rect + снят `pe:none` с baseс-текста), `primer-pointerdown-bail` (`useSelectionState.onRootPointerDown` bail на `sequence-view-primer` — настоящий фикс «клик не работает»; зеркало RE-site/annotation bail), `primers-in-annotator-preview` (`primers`/`onWritePrimer` проброшены host→`AnnotationsTab`→`Annotator`→`PreviewTab`→SequenceView).

**Актуальные метаданные (перекрывают snapshot выше):**
- **Tests:** Vitest **3284** / 1 skip / 0 fail (snapshot 3276 +8: use-primer-hotkeys +6, selection-tm +2; промежуточные modal/click фиксы — обновления in-place, без приращения числа).
- **Новые файлы:** `SequenceView/hooks/usePrimerHotkeys.js`, `SequenceView/hooks/useInspectorSelectionNav.js` (decomp), `SequenceView/__tests__/use-primer-hotkeys.test.jsx`, `SequenceView/__tests__/primer-pointer-bail.test.jsx`, `Library/inspector/hooks/useInspectorSelectionNav.js`.
- **Build:** vite build clean, dev-сервер 0 console-ошибок.
- **Size watch (актуально):** без изменений к snapshot — добавления проп-проводочные/мелкие хуки; `LibrarySingleInspector.jsx` 31.28 KB (Watch), `CanvasLayoutView.jsx` 41.35 KB (TD-SIZE Active, не трогался), `SequenceView/index.jsx` ~39 KB (+мелочь от usePrimerHotkeys-вызова/Tm-гейта, под hard).
- **Cross-portal pattern** (см. выше) — подтверждён на практике этими фиксами; кандидаты-аудит без изменений.

**СТОП.** Координационные файлы (PROJECT_STATE/DECISIONS/ANCHORS/RELEASES/TECH_DEBT/package.json/version.js) Code не трогал — финализация Chat.
