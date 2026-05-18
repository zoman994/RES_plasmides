# DECISIONS.md — Sprint-Level Decisions

> **Назначение.** Sprint-level решения без ⚓ (DEC-XX-NN). Не-фундаментальные выборы сделанные в ходе конкретного спринта. Читается всегда.
>
> **Ротация.** Записи старше 2 спринтов → `docs/archive/DECISIONS_YYYY_QN.md`. При финализации каждого спринта Chat проверяет и переносит устаревшие блоки.
>
> **Куда идёт что:**
> - Фундаментальное решение (явно закрепляется или supersede'ит другое фундаментальное) → `ANCHORS.md` с пометкой ⚓.
> - Sprint-level решение (паттерн, выбор библиотеки, UX-конкретика) → `DECISIONS.md` (этот файл).
>
> **История решений до v0.6.3 split.** Все sprint-level решения спринтов v0.5.x и v0.6.0..v0.6.2 остались в `ANCHORS.md` (в sprint-блоках §2–§15) вместе со своими ⚓ решениями — split сделан при реструктуризации 01.05.2026 без разбора их на fundamentals/sprint. Будущие спринты пишут сразу в правильный файл.

---

## Sprint v0.8.3-alpha — Four-tier architecture (T1-T10 + T4.5) + canvas UX + primer redesign (16-18.05.2026)

> **Контекст.** Архитектурный поворот canvas-skeleton от draft/segment-based к four-tier модели (containers/pieces/operations/zones). 10 T-спринтов реализованы Code 16-18.05 + T4.5 auto-layout + canvas UX батч + primer redesign + V82-V84 fixes + LibrarySingleInspector decomp. Якорь: `docs/SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md` (~32 KB). Полные обоснования DEC — в `docs/SPRINT_T1..T10.md` + `SPRINT_T4_5_ZONE_AUTO_LAYOUT_3LANE.md` (~360 KB суммарно). Этот sprint-block — указатель, не дубликат. **Schema migrations:** v5→v6→v7→v8→v9→v10 (все идемпотентны). **Tests:** Vitest 3276 pass / 1 skip / 0 fail + 1 pre-existing flake; +956 от v0.8.2 baseline 2320. **84 sprint-level DEC** + cross-cutting ниже.

### T1 — Pieces State (`SPRINT_T1_PIECES_STATE.md`)

Piece как первичная сущность в `state.pieces[]`. Schema v5→v6.

- **DEC-T1-01** — piece живёт в собственном slice, НЕ в op.params/container.fragments. **Кандидат ⚓ (DEC-CANVAS-4T-01).**
- **DEC-T1-02** — piece имеет origin (`'selection'|'feature'|'existing-primers'|'new-primers'|'legacy-migration'|'manual-gap'`), acquisitionMethod (`'pcr'|'restriction'|'ov-pcr'|'synthesis'|'direct'|'undefined'`), производные поля frozen + derivedReactionId + color.
- **DEC-T1-03** — piece.color stable HSL hash (детерминированный, не random). Hue по djb2 hash piece.id.
- **DEC-T1-04** — piece-model.js с фабриками createPiece / autoPieceName / generatePieceColor.
- **DEC-T1-05** — piece-invariants.js: sourceIds.length === ranges.length или kind='gap' (T6 ext).
- **DEC-T1-06** — ranges как array (multi-range piece — multi-source assembly): future-proof для кросс-источниковых кусков.
- **DEC-T1-07** — 8 actions: CREATE_PIECE / UPDATE_PIECE / REMOVE_PIECE / SET_PIECE_ACQUISITION_METHOD / FREEZE_PIECE / UNFREEZE_PIECE / UPDATE_PIECE_COLOR / CLONE_PIECE.
- **DEC-T1-08** — 7 selectors: selectPiece / selectPiecesByZoneId / selectPiecesBySourceId / selectFinalProductsInZone / selectPieceSequence / selectPieceLength / selectPiecesByVariantGroup (T9 ext).
- **DEC-T1-09** — piece.frozen field, не derived: explicit freeze при первом использовании в op (DEC-MUTABILITY-FREEZE-ON-USE-01 paradigm).
- **DEC-T1-10** — piece.derivedReactionId — nullable back-ref на op.id, устанавливается finalizer'ом T8.
- **DEC-T1-11** — origin не меняется после создания (audit trail).
- **DEC-T1-12** — acquisitionMethod default `'undefined'` при origin='selection'/'feature' (биолог решит позже).
- **DEC-T1-13** — functionalLabel опциональный («промотор» / «маркер Hyg» / «gRNA-spacer»).
- **DEC-T1-14** — zoneId nullable on piece (свободные pieces легитимны).
- **DEC-T1-15** — миграция v5→v6: добавляет пустой pieces:[]. Идемпотентна.

### T2 — Pieces Migration (op.inputPieces) (`SPRINT_T2_PIECES_OP_INPUT_MIGRATION.md`)

`op.inputPieces[]` primary + legacy `op.inputs[]` compat. Schema v6→v7 (noop).

- **DEC-T2-01** — op.inputPieces[] new primary, op.inputs[] kept as legacy (back-compat).
- **DEC-T2-02** — bridge resolver: `resolveOpInputs(op, state)` returns containers (legacy path) или pieces (new path) на выбор adapter.
- **DEC-T2-03** — op-piece-bridge.js — 6 helpers (resolvePiecesForOp / resolveContainersForOp / hasPieceInputs / hasContainerInputs / migrateOpInputs / cleanupOrphanInputs).
- **DEC-T2-04..08** — adapter cleanup per-kind (pcr / cut / gibson / golden-gate / ligate / kld / mutagenesis): каждый adapter работает через bridge resolver, не читая op.inputs direct.
- **DEC-T2-09** — **Surgical opt-in adapter migration:** byte-identical legacy при пустом inputPieces. NEW path активируется только при наличии. Снижает regression risk. Не литеральная замена.
- **DEC-T2-10..14** — cascade cleanup at REMOVE_PIECE / REMOVE_OPERATION / REMOVE_CONTAINER; null инварианты в оставшихся op'ах.
- **DEC-T2-15** — миграция v6→v7: nullable поле добавляется, существующие op'ы получают inputPieces:[]. Noop.

### T3 — Zones Data + Frames (`SPRINT_T3_ZONES_DATA_AND_FRAMES.md`)

`state.zones[]` Miro-style контейнеры + `zoneId` на узлах. Schema v7→v8.

- **DEC-T3-01** — zone имеет bounds {x,y,width,height} + viewMode `'graph'|'sequence'` + collapsed + notes + autoResize. **Кандидат ⚓ (DEC-CANVAS-4T-07).**
- **DEC-T3-02** — zoneId nullable on container/piece/operation — свободные узлы легитимны.
- **DEC-T3-03..06** — 12 zone actions: CREATE_ZONE / UPDATE_ZONE_BOUNDS / DRAG_ZONE / RESIZE_ZONE_BOUNDS / MERGE_ZONES / REMOVE_ZONE / SET_ZONE_VIEW_MODE / SET_ZONE_COLLAPSED / UPDATE_ZONE_NOTES / WRAP_LOOSE_NODES_IN_ZONE / MOVE_NODE_TO_ZONE / RECOMPUTE_ZONE_BOUNDS.
- **DEC-T3-07** — zone.bounds computed bbox при autoResize=true: следит за узлами. autoResize=false — manual bounds preserved.
- **DEC-T3-08** — ~~Default zone «Сборка 1» seeded в buildInitialState.~~ **REVERSED 17.05.2026** по AskUserQuestion Игоря «Полностью из state» (см. ANCHORS.md sprint v0.8.3-alpha). Чистый старт без default zone.
- **DEC-T3-09** — ⚓ DEC-CANVAS-MERGE-ZONES: bounds = bbox A ∪ B, all nodes preserved в zone_B с zoneId update.
- **DEC-T3-10** — cross-zone references legitimate (piece в zone A с sourceId из zone B). Cross-zone link rendering в T8.
- **DEC-T3-11** — selectFinalProductsInZone: container без исходящих junctions в той же zone.
- **DEC-T3-12** — zone.notes free-form text ≤ 1000 chars, badge 📝 в header если не пусто.
- **DEC-T3-13..15** — zone selectors (selectAllZones / selectZoneByNodeId / selectZoneBoundsContainingPoint / nodeListInZone).
- **DEC-T3-16** — миграция v7→v8: zones:[] + zoneId:null на узлах.
- **DEC-T3-17** — zone immutable id формат `zn-<uuidv7>`.

### T4 — Zones Rendering (`SPRINT_T4_ZONES_RENDERING_GRAPH.md`)

ZoneFrame / ZoneLayer / ZoneContextMenu + drag/resize/merge + hit-detect.

- **DEC-T4-01..04** — ZoneFrame mounted в CanvasLayoutView за zIndex=0 (под узлами); DOM/CSS frame, НЕ SVG.
- **DEC-T4-05..08** — drag header / 8-direction resize handles / merge by 30% overlap drop / collapsed state hide body.
- **DEC-T4-09..12** — hit-detect on pointer-up (не drag-over): performance reason, drag-over re-render тяжела.
- **DEC-T4-13..15** — ZoneContextMenu (rename / merge with... / delete / collapse / notes / wrap loose).
- **DEC-T4-16** — cross-zone junctions — dashed pattern (`stroke-dasharray:6,3`) + warning icon — визуальный hint «биологически возможно но необычно».
- **DEC-T4-17** — variant B (informed go): K9 graph-view отложен по design-mismatch — отдельный фикс post-T4 сессии.

### T4.5 — Zone 3-lane Auto-Layout (`SPRINT_T4_5_ZONE_AUTO_LAYOUT_3LANE.md`)

3 lanes (sources/intermediate/finals) + dagre LR + pinned. Schema v9→v10.

- **DEC-T4.5-01** — 3 lanes: sources (top, no incoming junctions) / intermediate (middle, dagre LR) / finals (bottom, no outgoing junctions). **Кандидат ⚓ (DEC-CANVAS-4T-31).**
- **DEC-T4.5-02** — dagre как npm dependency: ~40 KB bundle, Mermaid uses, proven. Bundle cost оправдан.
- **DEC-T4.5-03** — `node.pinned: false` field default; drag → auto-pin (финалайзер не пересчитывает pinned).
- **DEC-T4.5-04** — context-menu «Открепить» на pinned node.
- **DEC-T4.5-05** — `zone.laneLayout: 'auto'|'manual'` per zone (default 'auto'). Manual = freeform, dagre skipped.
- **DEC-T4.5-06..10** — lane Y-offsets / horizontal spacing / dagre config (rankdir:LR, nodesep:30, ranksep:80) / collision handling / auto-pin guard.
- **DEC-T4.5-11..14** — hotkey toggle / visibility classifier / source bucket / intermediate bucket.
- **DEC-T4.5-15** — миграция v9→v10: pinned:false добавляется на все containers/pieces/operations; idempotent.

### T5 — Piece Authoring UI (`SPRINT_T5_PIECE_AUTHORING_UI.md`)

4 способа создать piece (А/Б/В/Г) + PieceCreateModal + PiecePrimersPickModal.

- **DEC-T5-01** — Способ А: selection + хоткей P → PieceCreateModal. origin='selection'.
- **DEC-T5-02** — Способ Б: feature click → modal pre-filled из feature.start/end. origin='feature'.
- **DEC-T5-03** — Способ В: existing primers → PiecePrimersPickModal с binding search. origin='existing-primers' acquisitionMethod='pcr'.
- **DEC-T5-04** — Способ Г: new primers (Ctrl+R/Ctrl+Alt+R в PcrModeShell) → piece create. origin='new-primers' acquisitionMethod='pcr'.
- **DEC-T5-05..09** — piece-authoring.js: 4 pure builders + binding search hash-table lookup + RC reverse-complement check.
- **DEC-T5-10** — reuse `extraItems` pattern из V72-V74 SelectionContextMenu (НЕ новый контекст-меню для писов).
- **DEC-T5-11..14** — hotkey P scoped к SequenceView via useHotkey, scope-bound focusedZoneId.
- **DEC-T5-15** — modal cancel-on-Esc + Tab-cycle + RU/EN bilingual («Functional label» / «Функц. метка»).

### T6 — Sequence-Mode Migration (`SPRINT_T6_SEQUENCE_MODE_MIGRATE_FROM_ASSEMBLY.md`)

assembly-mode UI мигрирован с segments на pieces. Schema v8→v9.

- **DEC-T6-01** — assembly-realise.js → zone-pieces-to-dag.js (rename + rewrite читать pieces из zone). 14 UI файлов assembly-mode mapped.
- **DEC-T6-02** — segment-to-piece-adapter.js: dual-source dual-resolution (segments или pieces) для back-compat. Gap segments → `piece.kind='gap'` + gapLength + gapHint.
- **DEC-T6-03..07** — миграция v8→v9: assemblyDrafts[] → zones с viewMode='sequence' + segments → pieces.
- **DEC-T6-08** — gap исходно хранится только gapLength (текст поли-N). **Позже расширен V83 → optional gapSequence.**
- **DEC-T6-09..13** — InsertGapModal / SegmentList → PieceList rename / palette assembly UI.
- **DEC-T6-14** — assemblyReducer оставлен живым (no-op в reducer router) вместо literal removal: ~50 legacy assembly-тестов сохраняют compat. TD-ASSEMBLYREDUCER-REMOVAL в T-future.
- **DEC-T6-15** — §5.9 §-question: T6 K14 deviation — ratio risk vs cleanup; pragmatic keep, TD tracked.

### T7 — Dual-Mode Toggle + Sync (`SPRINT_T7_DUAL_MODE_TOGGLE_AND_SYNC.md`)

Inline sequence-mode per zone + hotkey G/S + ATTACH_PIECE_TO_ASSEMBLY.

- **DEC-T7-01..03** — 3 sequence-mode состояния: empty (zone без pieces) / palette (pieces draggable) / assembled (strip + ImplicitJunction).
- **DEC-T7-04** — hotkey G (graph) / S (sequence) toggle через focusedZoneId (uiSlice extension).
- **DEC-T7-05** — focusedZoneId set on zone hover/click (работает для любых узлов в zone).
- **DEC-T7-06..08** — ATTACH_PIECE_TO_ASSEMBLY / DETACH_PIECE_FROM_ASSEMBLY / REORDER_PIECES_IN_ZONE actions + piece.order field.
- **DEC-T7-09..12** — bidirectional sync: drag piece в strip → ATTACH → T8 finalizer создаёт auto-reaction.
- **DEC-T7-13..14** — BranchingVisual stub для N final продуктов (переписан в T9 с 3 kinds).
- **DEC-T7-15** — visibility:hidden на узлах graph-mode при zone.viewMode='sequence' (не unmount — keep DOM).

### T8 — Auto-Reactions + Cross-Zone Links (`SPRINT_T8_AUTO_REACTIONS_AND_ZONE_LINKS.md`)

Finalizer pattern для auto-create ops + zone link badges.

- **DEC-T8-01..03** — finalizer: piece.acquisitionMethod ∈ {'pcr','restriction','ov-pcr'} → auto-reaction. {'undefined','direct','synthesis'} → no reaction.
- **DEC-T8-04..06** — method change → atomic op delete + create (не update, ибо kind может меняться). derivedReactionId обновляется.
- **DEC-T8-07** — piece.ranges change НЕ пересчитывает реакцию при том же method (op.params.range stale). TD-T8-PIECE-RANGE-RECOMPUTE.
- **DEC-T8-08..10** — ZoneLinkBadge «← Зона N» в header zone B (если piece sourceIds из zone A). Group by source zone, не per-piece.
- **DEC-T8-11..13** — click badge → smooth pan + 1s highlight target zone. zone-link-resolver.js.
- **DEC-T8-14** — toast info silent (не всплывает при auto-create — finalizer transparent, не отвлекает).

### T9 — Design + Clone Variants (`SPRINT_T9_DESIGN_AND_CLONE_VARIANTS.md`)

Design variants (variantGroupId) vs clone variants (op.materializedClones).

- **DEC-T9-01..02** — design variants: piece.variantGroupId=`vg-<uuid>`, группа pieces — альтернативы. CREATE_DESIGN_VARIANT clone+regroup.
- **DEC-T9-03..05** — clone variants: op.materializedClones[] (hard cap 96), MATERIALIZE_REACTION action, MaterializeCloneModal с auto-labels.
- **DEC-T9-06..08** — BranchingVisual rewrite 3 kinds: clones (vertical stack) / design-variants (Y-разветвитель) / independent (side-by-side).
- **DEC-T9-09..11** — variantGroup selectors + group highlight 2s on click. selectMaterializedClones / selectDesignVariants.
- **DEC-T9-12** — миграция v8→v9 (в одной с T6): variantGroupId:null + materializedClones:null. Idempotent.
- **DEC-T9-13** — K13/K14 wire trigger-пунктя в op context-menu НЕ реализован (отложен). TD-T9-K13-K14-WIRE.

### T10 — Sanger MVP Lab Notebook (`SPRINT_T10_SANGER_MVP_LAB_NOTEBOOK.md`)

Right panel + 4-status segmented control + notes.

- **DEC-T10-01** — SangerLabNotebook right panel, hotkey B, per-zone scope (focusedZoneId из T7).
- **DEC-T10-02..04** — 4 statuses: pending / verified / failed / null. Segmented control. Cycle on click.
- **DEC-T10-05..07** — notes ≤500 chars, save-on-blur. Filter by status. Counter в header.
- **DEC-T10-08..10** — BranchingVisual получает colored dot indicator (✓ green / ✗ red / ∘ grey).
- **DEC-T10-11** — click clone indicator → focus notebook через event-bus НЕ реализован (отложен). TD-T10-SHOW-NOTEBOOK-WIRE.
- **DEC-T10-12** — R-T10-2: notes save-on-blur edge case (panel close до blur — потеря). TD-T10-NOTES-FLUSH.

### Cross-cutting (между T-спринтами и после)

**[2026-05-17] DEC-V0.8.3-CANVAS-CLEAN-START** — По AskUserQuestion Игоря «Полностью из state»: реверс DEC-T3-08 (default zone seeded) + V61 (ghost auto-respawn finalizer). Чистый canvas на свежем снапшоте. Сборки/операции создаются explicit (кнопки + Сборка / + Операция / drag-drop). `justDraggedRef` guard сохранён и расширен на op-drag (drop-release ромба не открывает viewer). См. ANCHORS sprint v0.8.3-alpha.

**[2026-05-17] DEC-V0.8.3-CANVAS-UX-BATCH** — 7 canvas UX фиксов: (1) edgeAnchors 4-сторонние коннекторы по доминантной оси (вместо bottom-only); (2) wheel-zoom-к-курсору zoomAtPoint focal-инвариант (видимая точка под курсором остаётся там же при zoom); (3) бесконечный канвас через canvasContentExtent + edge-pan-velocity edge-auto-pan; (4) hand-pan panScrollTarget gate by closest-target (пустые области = pan, узлы = drag); (5) стационарный zoom-индикатор (внешний non-scrolling wrapper, оверлей на scrollable canvas); (6) drag-release ромба не открывает viewer (justDraggedRef на op); (7) «Очистить канвас» gated RESET button bottom-right.

**[2026-05-18] DEC-V0.8.3-PRIMER-REDESIGN** — (1) PrimerFromSelectionModal (имя/ПСО/RC-toggle) во всех 5 виверах: right-click «праймер» → модал (не сразу запись). Esc/backdrop close. (2) Cross-portal pattern: backdrop гасит keydown+pointer+contextmenu (React-bubbling по дереву компонентов, портал DOM-изоляции НЕ даёт) — TD-CROSS-PORTAL-AUDIT распространить на 6 кандидатов. (3) Pentagon-arrow glyph по обе стороны цепи (fwd сверху, rev снизу) с вписанными binding-буквами. (4) Selected primer: bold ring + colour-halo + full-opacity arrow. onPrimerClick/selectedPrimerKeys props, back-compat (без callback — декоративный). (5) Double-click → редактирование через ту же модалку (primerDraft.name pre-fill). (6) Flank-highlight только fwd+rev пары: биоинвариант (fwd-fwd/rev-rev не задают ампликон).

**[2026-05-18] DEC-V0.8.3-VIEWER-SYNC** — Все 5 дизайн-виверов (Library/Importer-инспектор, ContainerEditor×2, Assembly, PCR) несут одинаковую пятёрку: primers + onWritePrimer + showSelectionTm + caret + selection. Annotator preview тоже (точка 4-точечного primer UX). origin.kind='library-selection' (новая конвенция). useEntryPrimers hook (ContainerEditorSkeleton K10 closed). hydratePrimers() вызывается в проде (была dead code).

**[2026-05-18] DEC-V0.8.3-ANNOTATOR-TOGGLE** — Вкладка «Аннотации» → toggle-кнопка в общем `TabBar.showAnnotations/onToggleAnnotator/annotatorActive`. aria-pressed, accent-wash. Scope: Library/Importer + container-editor. Assembly/PCR НЕ тронуты (synthetic/template seq, аннотатор там семантически неопределён). Open follow-up: распространять ли на Assembly/PCR — решение Игоря.

**[2026-05-18] DEC-V0.8.3-INSPECTOR-DECOMP** — LibrarySingleInspector.jsx 39.34 → 31.28 KB через extract `useInspectorSelectionNav` hook (~170 строк caret/selection/LinearFeatureBar-навигации). Behavior-preserving refactor, zero регрессия. TD-LIBRARYSINGLEINSPECTOR-DECOMP-V2 CLOSED. Опциональный 2-й extract (annotation-edit pipeline ~5-7 KB) уведёт под soft 30 — решение Игоря.

**[2026-05-17] DEC-V0.8.3-V82-DRAFTS-PANEL-ZONE-BASED** — AssemblyDraftsPanel переписана zone-based: счётчик/карточки от selectAllZones вместо state.assemblyDrafts.length (T6 мигрировал drafts → zones). Card узлы = nodeListInZone. Pin/Unpin убран (zone всегда on-canvas). Позже (17.05 реверс DEC-T3-08) panel стартует с 0 (было 1 из default zone).

**[2026-05-17] DEC-V0.8.3-V83-GAP-KNOWN-SEQUENCE** — Gap-piece с известной ПСО (линкер T2A 54 нт / своя ПСО) хранится в `piece.gapSequence` (расширение T6 DEC-T6-08), НЕ подменяется поли-N. gapHint='known'. End-to-end в createPiece + invariants + zone-assembly-write-adapter + draftFromZone + segment-to-piece-adapter. Поли-N сохраняется как fallback при hint='unknown'.

**[2026-05-17] DEC-V0.8.3-V84-PRODUCT-ANNOTATIONS** — Realise-продукты (frag/product) наследуют аннотации источника через `transferAnnotations(parentAnns, lo, hi, rc, srcId)` (DRY с legacy assembly-model.makeSourcedSegment). Новый чистый `concatSegmentAnnotations(segments)` в assembly-model.js: аннотации со сдвигом на char-offset в конкатенации (gap двигает offset, фич не даёт). draftFromZone sourced-сегмент больше НЕ хардкодит `annotations:[]`. -product контейнер агрегирует со сдвигом.

---

## Sprint M-CANVAS-OPS-ARCH-II — Registry + queue + migration (R12, 15.05.2026)

> **Контекст.** Продолжение M-CANVAS-OPS-ARCH. После R10-R11 заложили types + bio-helpers relocation — R12 закрывает оставшиеся architectural debts: op kind dispatch dup'ы, single-slot toast clobbering, snapshot без migration path, skeleton-state-canvas.js over hard. 4 sprint-level DEC + 13 новых тестов. Финал: 2320 PASS + 1 skipped, build clean.

**[2026-05-15] DEC-OPS-KIND-REGISTRY-01** — **Central op-kinds-registry.js — single source of truth.** R12-1: до этого момента kind dispatch дублировался в:
   - OpKindPicker.OP_KINDS (label / desc).
   - OpPopupRouter switch (popup component).
   - op-icons.ICONS (icon component).
   - lib-adapters.REGISTRY (adapter function).
Каждое добавление нового kind = 5+ touches, drift неизбежен. Этот DEC закрепляет `op-kinds-registry.js` как единую точку: каждый kind register'ит {label, desc, originKind, adapter, popup, inputsLabel, min/maxInputs, acceptsMultiSelectInputs}. Consumers: `getOpKindDef(kind)`, `getAdapter(kind)`, `getPopupComponent(kind)`, `isKnownKind(kind)`, `canAcceptMultiSelectAsInputs(kind)`. Migrated: OpKindPicker.OP_KINDS (derived от list), OpPopupRouter (switch заменён `getPopupComponent`), lib-adapters.REGISTRY (заменён `getAdapter`). Будущие добавления — 1 entry в OP_KINDS_LIST.

**[2026-05-15] DEC-OPS-TOAST-QUEUE-01** — **Toast queue (state.toasts array) вместо single overwriting slot.** R12-2: до этого `state.toast` был single object, 2 ops back-to-back теряли первый toast. Этот DEC заменяет single-slot на queue:
   - `state.toasts` array of `{id, kind, message, timestamp}`.
   - `state.toast` остаётся как «latest» pointer для legacy (= last item).
   - `pushToast` finalizer в main reducer: если `next.toast !== state.toast`, stamp + push на queue. Sub-reducers продолжают писать `state.toast = {...}` без изменений.
   - `CLEAR_TOAST` без id — drains queue + nulls toast.
   - `CLEAR_TOAST({toastId})` — removes specific from queue, restores `toast` = newest remaining.
   - `ToastBridge` iterates queue и flushes ALL items в global ToastStack, then drains.
Side-effect refactor: все base actions раньше использовали early `return` в switch, что обходило финалайзеры. Заменены на `next = ...; break;` чтобы финалайзеры всегда выполнялись. R3-13 orphan cleanup tightened — теперь работает только когда `containers.length DECREASED` (а не на каждом action). 7 новых тестов.

**[2026-05-15] DEC-OPS-SNAPSHOT-MIGRATE-01** — **Snapshot schemaVersion + migration chain + transient UI stripping.** R12-3: до этого `loadSnapshot()` blindly доверял shape; refactor `containers` shape silently ломал старые snapshot'ы. Теперь:
   - `SCHEMA_VERSION_CURRENT = 2` (v1 → v2 в R12).
   - `MIGRATIONS = {1: migrate_v1_to_v2, ...}` — chain function per version.
   - `migrateSnapshot(state, fromVersion)` — runs migrations sequentially.
   - `loadSnapshot()`: refuse если schema > current (future user downgrade), refuse если migration impossible (corrupted), run migrations если schema < current.
   - Transient UI поля (view, highlightedContainerId, toast, toasts, selectedContainerIds, editorOpen, editorContext) **stripped** перед save через `stripTransientFields()`.
   - `REPLACE_STATE` reducer merges loaded state с `buildInitialState()` defaults для transient полей. После reload toasts всегда `[]`, view всегда `'layout'`.
v1 → v2 migration: добавляет `toasts: []` + ensures `cascadeIndex` numeric. Refusal cases tested. **Cost:** users теряют highlighted container / open editor state при reload — приемлемая trade-off для clean restart. 7 новых тестов.

**[2026-05-15] DEC-OPS-STATE-CANVAS-SPLIT-01** — **CUT_CONTAINER_AT_CURSOR (167 lines) extracted в skeleton-state-canvas-cut.js.** R12-4: skeleton-state-canvas.js был 27.5 KB over 25 KB hard (Watch since R9). После extract'а — 22 KB (under hard). `handleCutAtCursor(state, action)` экспортируется из нового файла; main reducer делегирует через single-line case. Behavior byte-identical (regression-checked 504 skeleton tests pass).

**Carry-over:**
- TD-SIZE-SKELETON-STATE-CANVAS (Watch since R9): RESOLVED через DEC-OPS-STATE-CANVAS-SPLIT-01.
- DEC-OPS-FORMAL-TYPES-01 (R11): validation hook на executeOperation продолжает работать; registry change через DEC-OPS-KIND-REGISTRY-01 не задевает.

**Sub-sprint Watch:**
- `skeleton-state.js`: 15.4 KB (+5 KB R12 from base actions refactor + REPLACE_STATE merge + toast queue stamper). Under 25 KB hard, no concern.
- `skeleton-state-canvas.js`: 22 KB (resolved).
- `protocol-export.js`: 18.6 KB (stable).
- `op-kinds-registry.js` (новый): 4.3 KB.
- `skeleton-state-canvas-cut.js` (новый): 5.9 KB.

---

## Sprint M-CANVAS-OPS-ARCH — Architectural cleanup (R10-R11, 14-15.05.2026)

> **Контекст.** Продолжение audit-loop'а. После R5-R9 bio-fidelity layer окреп, но проявились архитектурные слабости: ad-hoc `origin` shape, bio-helpers misplaced в `canvas/operations/` (хотя они не op-coupled). R10 — visual story upgrade (containers as live plasmid maps); R11 — types + relocation.

**[2026-05-14] DEC-OPS-LIVE-PLASMID-VISUAL-01** — **ContainerBlock использует MiniPlasmidMap SVG: circular → ring with feature arcs, linear → strip, linearizedFromCircular → broken-circle с cut-marker, excised → dim, frozen → ghost overlay.** R10: вместо statichнoгo pill — живой визуал. State derived from `origin.parentWasCircular` / `origin.isExcised` flags. Block height bumped 72→110 для размещения SVG. Junction Y tolerance bumped 40→60. Cut adapter (R10-3) tag'ит origin полями для рендера: `parentWasCircular: boolean`, `isExcised: boolean` (smallest fragment в multi-cut), `fragmentIndex: number`. Status badge снизу показывает `◯ plasmid` / `✂ linearized` / `⊟ excised` / `— linear` + enzyme list. Биолог видит «дикую плёл резалось EcoRI'ом» одним взглядом. 12 тестов в `skeleton-mini-plasmid-map-r10.test.jsx`.

**[2026-05-15] DEC-OPS-FORMAL-TYPES-01** — **Formal Container + Origin JSDoc schemas + runtime validators в `canvas/operations/types.js`.** R11-1: до этого каждый adapter писал ad-hoc origin shape. R10 добавил `parentWasCircular` / `isExcised` без формального типа — следующий adapter мог collision'нуть. Этот DEC закрепляет:
   - `@typedef Container` (id / kind / name / sequence / topology / annotations / ends / origin / parentCommitId / frozen?).
   - `@typedef Annotation` (с aliases для type/kind/feature/featureType — поддержка разных shape conventions).
   - 13 origin variants: placeholder, tree_drag, tree_pick, fork, op_pcr, op_pcr_designed, op_cut, op_gibson, op_golden_gate, op_ligate, op_kld, op_mutagenesis, op_gibson_primer_designed.
   - `validateOrigin(origin)` / `validateContainer(container)` — returns array of error strings.
   - `assertContainerOk(container, ctx)` — DEV mode warn в console; production silent.
   - `KNOWN_ORIGIN_KINDS` Set для exhaustive switch checks.
`executeOperation` dispatcher (lib-adapters.js facade) теперь прогоняет outputs через `assertContainerOk` в DEV. 18 тестов: invariant violations caught, real adapter outputs pass smoke. **Style:** JSDoc вместо TS чтобы не тащить compiler dependency — IDE подсветка работает.

**[2026-05-15] DEC-OPS-BIO-HELPERS-RELOCATE-01** — **Bio-knowledge helpers переехали из `canvas/operations/` в `src/lib/bio/`.** R11-3: до этого helpers (codon-optimize-ecoli, sanger-primer-design, gibson-primer-design, strain-compatibility, annotation-conflicts) лежали под `CanvasSkeleton/canvas/operations/` что подразумевало coupling с canvas-ops dispatcher. На деле они standalone bio-knowledge модули — могут быть переиспользованы main app'ом (Library Inspector, Annotator). Новые пути:
   - `src/lib/bio/codon-optimize-ecoli.js`
   - `src/lib/bio/sanger-primer-design.js`
   - `src/lib/bio/gibson-primer-design.js`
   - `src/lib/bio/strain-compatibility.js`
   - `src/lib/bio/annotation-conflicts.js`
Обновлены 10 import statements в 9 файлах (1 в protocol-export.js — два импорта в одном файле). Sanger / Gibson primer designs корректировали `tm-calculator` relative path: было `../../../../tm-calculator`, стало `../../tm-calculator`. Тесты обновлены — 490 skeleton тестов passed после relocation.

**Carry-over:**
- DEC-OPS-LIB-ADAPTERS-SPLIT-01 (R9-2): adapter-разбивка остаётся; в lib-adapters.js facade теперь добавлен validation hook через DEC-OPS-FORMAL-TYPES-01.
- TD-SIZE-SKELETON-STATE-CANVAS (R9 Watch): не закрыт; 27.5 KB остаётся, может потребоваться decomp в M-CANVAS-OPS-POLISH.

**Sub-sprint Watch:**
- `protocol-export.js`: 18.6 KB (стабильно, после R11 не выросло).
- `skeleton-state-canvas.js`: 27.5 KB (Watch, +0 в R11).
- `lib-adapters.js` facade: 2.9 KB (resolved через R9-2 split, R11 validation hook добавил +0.1 KB).
- `types.js` (новый): 6.3 KB.

---

## Sprint M-CANVAS-OPS-BIO — Real bio-fidelity audit (R5-R9, 14.05.2026)

> **Контекст.** Five-round audit-loop по запросу Игоря «проверь логику взаимодействия всех элементов, правь криво работающее, не спеши, биологический angle». Раунды 5-9 = 14.05.2026, после первой итерации M-CANVAS-OPS (K1-K11 + S1-S3 + A4-A6 + B1-B12 + T13-T14 от 12-13.05). Цель — переход от skeleton/mock implementations к realistic bio-pipeline output, по which биолог в РАН может реально планировать сборку и получать корректный protocol + warnings. 17 sprint-level решений ниже. Стабильно 2264 PASS + 1 skipped тестов в финале R9.

**[2026-05-14] DEC-OPS-KLD-REAL-BIO-01** — **executeKLD реализует back-to-back primer annealing detection + insertion/deletion mutation arithmetic.** R6-1: вместо stub'а "copy template" — finds longest 3'-suffix match (≥10 nt) для fwd / revRC primers, validates back-to-back orientation (`longWay ≤ shortWay` на circular), reject регулярного PCR mode (primers face each other). Insertion size = 5'-tail length от обоих primers; deletion size = `gap` (forward distance rev_anneal_end → fwd_anneal_start). Annotations внутри interior region (template между fwd_anneal_end и rev_anneal_start) preserve'аются с shift'ом; пересекающие primer regions — drop'аются (мутация invalidate'ит). 8 тестов в `skeleton-kld-r6.test.jsx`. **Открытый вопрос:** DpnI methylation state не tracked в skeleton (assumed dam+ template); добавить flag в container.origin при создании KLD-template.

**[2026-05-14] DEC-OPS-PROTOCOL-EXPORT-01** — **protocol-export module генерит lab-notebook-style step-by-step text из executed operations.** R6-2: `buildProtocol(operations, containers)` walks executed ops отсортированные по `executedAt`, эмитит шаги с реальными реагентами / temperatures / временами для каждого `kind`: Cut (CutSmart buffer + 37°C 1 h + heat-inactivation), PCR (Q5 / Phusion + специфичный thermocycler protocol), Gibson (NEBuilder HiFi 50°C 15 min + DH5α transformation), Golden Gate (BsaI + T4 ligase + 37°C/16°C × 30 циклов), Ligate (T4 + PEG для blunt + 16°C O/N), KLD (NEB Q5 SDM Kit M0554 25°C 5 min), Mutagenesis (KLD-pipeline narrative). Reagents block в конце с enzymes + primer oligonucleotides из выходных containers. Bio-fidelity warnings (missingOverlap > 0, zeroOverhang на sticky ligate, dpniDigest=false на KLD) внедрены прямо в step body как `⚠ WARNING`. Биолог копирует текст в Notion / Word / лабораторную тетрадь. 10 тестов.

**[2026-05-14] DEC-OPS-PRIMER-ORDER-PANEL-01** — **PrimerOrderPanel собирает все oligonucleotide containers с canvas и экспортирует в TSV (Evrogen/Syntol bulk), FASTA, plain text.** R6-3: button bottom-left, panel side-overlay. Scale (25/100/250 nmol) + Purification (Standard / HPLC / PAGE) дропдауны для TSV. Таблица primer'ов в panel'е (name / sequence / nt / Tm / GC%). Copy-to-clipboard button. Подходит для bulk upload форм Evrogen / Syntol / Sintol / IDT.

**[2026-05-14] DEC-OPS-MULTI-TEMPLATE-PCR-01** — **executePCR принимает `params.templateIds[]` для batch PCR.** R6-4: when array length >1 — per-template PCR. С primerPairId: shared primer pair против каждого, skip'ает templates где primer не аннелирует (origin.skipped[] list). С autoDesign: per-template primer design, выдаёт `2N outputs` (amplicon + oligo per template). Single-template path (`params.templateId`) сохранён legacy. PCROpPopup получил multi-template checkbox + multi-select list. 4 теста.

**[2026-05-14] DEC-OPS-MUTAGENESIS-ANNOTATION-SHIFT-01** — **executeMutagenesis preserve annotations через shift arithmetic per mutation type.** R6-6: point — annotations не двигаются (только base substitution); insertion — annotations с `start >= pos` сдвинуты на `+ins.length`, перекрывающие pos получают `end += ins.length`; deletion — fully-contained dropped, after-region сдвинуты на `-len`, перекрывающие края trim'аются. До этого аннотации после mutagenesis тупо терялись. 5 тестов.

**[2026-05-14] DEC-OPS-GIBSON-PRIMER-DESIGN-01** — **gibson-primer-design.js helper + UI section в GibsonOpPopup.** R7-1: `designGibsonPrimerPair(fragment, prev, next)` строит fwd с 5'-homology tail = last N bp prev fragment + Tm-aware anneal на fragment 5' end; rev = revcomp(first N bp next fragment) + revcomp anneal на 3' end. Linear assembly — first/last fragments без tail с соответствующей стороны. Default homologyLen=20, customizable. GibsonOpPopup при ≥2 fragments показывает preview table; кнопка «+ Добавить праймеры на canvas» вызывает `actions.addContainer(oligo)` через новый `ADD_CONTAINER` action (см. DEC-CANVAS-ADD-CONTAINER-ACTION-01). 7 тестов.

**[2026-05-14] DEC-OPS-SANGER-PRIMER-DESIGN-01** — **sanger-primer-design.js helper.** R7-2: `designSangerPrimer(template, target, strand='fwd', opts)` — fwd primer в окне `[target.start - deadZone - walkLen .. target.start - deadZone]` (default deadZone=50, walkLen=50), GC/Tm filters (40-60%, 58°C target), 4+ same-base run filter (избегает hairpin risk). `designSangerWalk(template, region, stepBp=600)` для long-read walking. UI integration — отложена в M-CANVAS-POLISH (helper готов, кнопка в editor'е следующий sprint). 8 тестов.

**[2026-05-14] DEC-OPS-CODON-OPTIMIZE-ECOLI-01** — **codon-optimize-ecoli.js с lookup table E.coli K-12 preferred codons.** R7-3: `translateDNA(cds)` (frame 0, X для invalid), `optimizeCdsForEcoli(cds)` returns `{optimized, changes, replaced}` (silent mutations preserving aa sequence), `codonScore(cds)` % preferred per AA + overall (грубая CAI proxy), `findRareCodons(cds)`. Lookup table из GenScript / Kazusa DB. NOT included: mRNA folding, RE site avoidance, codon-tandem detection — это reach goals в отдельном спринте. 11 тестов.

**[2026-05-14] DEC-OPS-STRAIN-COMPAT-01** — **strain-compatibility.js — dam/dcm methylation sensitivity check.** R8-1: список DAM_BLOCKED (BclI, MboI, ClaI, XbaI, NruI, TaqI, BspDI etc.), DCM_BLOCKED (EcoRII, StuI, AvrII, NciI etc.), DAM_REQUIRED (DpnI). `checkStrainCompatibility(operations)` сканирует Cut/GG enzymes + KLD-ops. `recommendStrainsForOps(operations)` — single strain recommendation: KLD+dam-sensitive → CONFLICT high severity (PCR в DH5α dam+, затем re-isolate в JM110 dam-); только dam-sensitive → JM110 medium; только KLD → DH5α info; common enzymes → standard. Wired в protocol-export как «E.coli strain» section. 13 тестов.

**[2026-05-14] DEC-OPS-CODON-STATS-IN-PROTOCOL-01** — **protocol-export детектирует CDS annotations в output containers и добавляет "Codon usage" section.** R8-2: walks `op.outputs[]`, для каждого container.annotations findAll где `type='CDS'` / `kind='CDS'` / `feature='CDS'` / `name contains "CDS"`. Per-CDS — score + first 10 rare codons (или counter "+N more"). Detection через `isCDSAnnotation(ann)` поддерживает разные shape conventions. 4 теста.

**[2026-05-14] DEC-OPS-ANNOTATION-CONFLICTS-01** — **annotation-conflicts.js — структурные warnings.** R8-3: `detectAnnotationConflicts(container)` returns warnings по kinds: `duplicate` (same name+range — merge artifact на junction), `overlapping_cds` (≥6 bp overlap — frame conflict), `promoter_in_cds` (biologically unusual), `cds_no_start` (не ATG/GTG/TTG), `cds_no_stop` (не TAA/TAG/TGA на конце), `cds_not_triplet` (length % 3 ≠ 0). `summarizeConflicts(conflicts)` для toast. 10 тестов.

**[2026-05-14] DEC-OPS-BIO-VALIDATION-ON-EXECUTE-01** — **handleOpExecute сканирует output containers detectAnnotationConflicts() и promote'ит в warning toast.** R9-1: после adapter execution + frozen-on-use, перед constructing result state, walks outputs, выбирает первый с medium/high severity conflicts, append'ит summary в toast.message. Существующий warning (Gibson missingOverlap / Ligate zeroOverhang) сохраняется как primary; conflict добавляется как «Also: ...». Биолог СРАЗУ видит сломанный frame / no stop codon без открытия editor'а. 3 теста + verification existing OP_EXECUTE tests still pass.

**[2026-05-14] DEC-OPS-LIB-ADAPTERS-SPLIT-01** — **lib-adapters.js (40 KB монолит) декомпозирован на adapters/{cut,pcr,gibson,golden-gate,ligate,kld,mutagenesis}.js + adapters/_shared.js + lib-adapters.js facade (2.7 KB).** R9-2: triggered TD-SIZE rate-of-change rule (≥5 KB рост 2 спринта подряд) — после R6/R7/R8 файл вырос с 25 KB до 40 KB. Per-op files all <7 KB (well under 25 KB hard для .js). Facade re-exports + REGISTRY + executeOperation dispatcher; impact на callers нулевой (named imports работают неизменно). 451 skeleton тестов passed после split (regression check).

**[2026-05-14] DEC-OPS-CODON-STATS-PANEL-01** — **CodonStatsPanel.jsx — UI помещён в canvas overlay для highlighted molecule.** R9-3: bottom-left button (после Lineage / Protocol / Primer Order), panel side-overlay. Только видна если highlighted container имеет CDS annotations. Per-CDS card — score (% preferred, ✓/⚠/⚠⚠ icon), rare codons list (top 30 + counter), `<details>` E.coli-optimized variant с silent mutations. До этого helper был invisible (только в protocol text). 5 тестов.

**[2026-05-14] DEC-CANVAS-ADD-CONTAINER-ACTION-01** — **generic ADD_CONTAINER reducer case + addContainer action для уже построенных containers (designed oligos etc).** В отличие от ADD_CONTAINER_FROM_ENTRY (строит из library entry), `ADD_CONTAINER(container, position?)` принимает готовый objet с собственным id. Position default = cascade slot из `cascadeSlotPosition(state.cascadeIndex)`. Защита от duplicate id. Используется GibsonOpPopup для emit'а designed primer oligos.

**[2026-05-14] DEC-OPS-AUTO-ANNOTATE-ASSEMBLY-01** — **handleOpExecute обогащает annotations для assembly outputs через existing src/auto-annotate.js.** R9-4: `enrichAssemblyAnnotations(container)` builds part-shape, calls existing `autoAnnotate(part)`, filters out auto-generated `misc`-region (assembly не имеет canonical type), де-дубликаты по `start__end__name__type`. Wired для kinds {gibson, ligate, golden_gate, kld, cut} — PCR amplicon пропускается (всё аннотации уже от parent). Биолог получает RE sites на junction'ах + start/stop codons в новых ORF без manual annotator-run. 5 тестов.

**[2026-05-14] DEC-OPS-LINEAGE-MULTI-INPUT-HINT-01** — **LineagePanel показывает «+N more» для multi-input ops.** R6-7: walking origin chain через `inputIds[0]` теряет других parents (Gibson c 4 фрагментами показывает только один). Без полного multi-parent rendering — добавлен informational hint «(+3 more)» рядом с node.name. Полное multi-parent graph traversal — открытый ресечь.

**[2026-05-14] DEC-OPS-SHOW-TOAST-ACTION-01** — **`SHOW_TOAST` action в state.js + `actions.showToast`.** R5-12 / R6: для UX feedback из UI (frozen-op drop, какой-то action отказан) попрежнему через single-channel toast; raised в реальный SHOW_TOAST action для использования в pure event handlers (без проксирования через op-execute результат). Validates `action.toast.message` is string чтобы не пушить undefined.

**Sub-sprint Watch list (size budget rate-of-change):**
- `lib-adapters.js`: 40 KB → 2.7 KB (resolved via DEC-OPS-LIB-ADAPTERS-SPLIT-01).
- `protocol-export.js`: 14 KB → 18.6 KB (still under 25 KB hard, but +4.6 KB R8 — Watch).
- `skeleton-state-canvas.js`: 26 KB → 27.5 KB (+1.5 KB ADD_CONTAINER case — Watch).

**Carry-over:**
- DEC-CANVAS-V2-EDITOR-MUTAGENESIS-STUB-01: ещё stub, не реализован in-editor (helper R7-3 codon-optimize применим как backend).
- DEC-CANVAS-V2-OPS-CANVAS-ONLY-01: подтвердился в практике R6-R9 — все operations on canvas, editor только viewer.

---

## Sprint v0.8.2-skeleton-v2 — Canvas V2 paradigma + полнофункциональный editor (12.05.2026)

> **Контекст.** Кикофф V2 paradigma (11.05.2026 поздний вечер, `docs/NOTES_CANVAS_V2_KICKOFF.md`) → реализация Игорем + Code 12.05.2026. Спека `docs/SPRINT_CANVAS_V2_EDITOR_FULL.md` (тип B, 15 KB) выполнена + расширена в направлении NOTES §2/§3/§4 (placeholder containers, drag from Library Tree, удаление через Del, junctions с auto-detect + manual override). 16 решений ниже — sprint-level, кандидаты на ⚓ после второго подтверждающего sprint'а.

**[2026-05-12] DEC-CANVAS-V2-PARADIGM-01** — **Assembly canvas с placeholder контейнерами, не all-containers-auto.** Стартовая сцена нового проекта — 2 placeholder контейнера (`sequence=''`, `origin.kind='placeholder'`) на canvas. Биолог заполняет их через drag из левого Library tree либо click → `PlaceholderTreePicker` (project-scoped с loose fallback). **Partially supersedes** DEC-CANVAS-02 (11.05.2026 «все проектные контейнеры на canvas всегда»): paradigma переориентирована с «материалы пушатся в canvas из проекта» на «биолог собирает план до материалов». Drag from tree на свободное место → `ADD_CONTAINER_FROM_ENTRY` (новый id), drop на placeholder → `FILL_PLACEHOLDER` (сохраняет id + position).

**[2026-05-12] DEC-CANVAS-V2-INSTANCES-NOT-DEDUP-01** — **Drag одной и той же Library entry повторно = новый container с новым `uuidv7()`, без дедупа.** Связь с исходником через `origin.sourceEntryId`. Два экземпляра одной плазмиды на canvas — допустимо и ожидаемо: каждый имеет свою судьбу (один в PCR, другой в Cut). Drop того же tree-item повторно — всегда create-new. **Совместимо с DEC-CANVAS-04** («дубликаты от повторных операций не сливаем»). UX-индикатор «это клон, не оригинал» (counter `(2)` либо badge `⎘`) — открытый вопрос.

**[2026-05-12] DEC-CANVAS-V2-FILL-PLACEHOLDER-01** — **In-place fill placeholder'а сохраняет container.id + position.** `FILL_PLACEHOLDER(containerId, entry)` подменяет sequence/annotations/topology/name/ends/origin, но id и position остаются. Это семантически не то же что `ADD_CONTAINER_FROM_ENTRY` (которое создаёт новый id). Различие важно для UX «положил две заготовки → заполнил в нужных позициях» — позиции не сбиваются. Trigger: drag на placeholder, либо click → PlaceholderTreePicker → pick.

**[2026-05-12] DEC-CANVAS-V2-TREE-FROM-LIBRARY-01** — **Левое дерево skeleton'а = production `LibraryTreeRoot` через `LibraryTreeHost` wrapper, не bespoke.** Снесён `tree/SkeletonTree` (3 раздела ⭐/📥/🔬). Skeleton получает поведение Library tree целиком: search, Loose zone, Project zones, pinned + collapsible «все проекты (N)», Trash zone, drag-and-drop с MIME `application/x-bodge-entry-id`, AddModal, hover-quick-add, inline rename. `LibraryTreeHost` — локальный `query`/`selectedId` state + wire global librarySlice. R1 §17 в чистом виде — взять существующее вместо клона. Совместимо с DEC-CANVAS-06 (3 раздела Tree остаются в Library; skeleton наследует структуру).

**[2026-05-12] DEC-CANVAS-V2-DETECT-KIND-HEURISTIC-01** — **Auto-detect junction kind по парам `ends`/`topology` через простую эвристику, не ML.** `detectJunctionKind(from, to)` в `canvas/junction-styles.js`: оба circular → auto; mixed circular+linear → overlap (Gibson); оба linear + 4-nt overhang с обоих концов → golden_gate; оба linear + любой overhang → re_ligation; blunt+blunt → ligation; default → overlap. Baseline, корректный для типовых случаев. Manual override через `SET_JUNCTION_KIND` (popover `JunctionMethodPicker` на стыке). Дальнейшие усложнения (BsaI/BsmBI overhangs → GG с детекцией type IIS сайтов; complementarity check для Gibson) — отдельный sprint.

**[2026-05-12] DEC-CANVAS-V2-JUNCTIONS-AUTO-RECONCILE-01** — **Junctions пересчитываются reducer'ом RECONCILE_AUTO_JUNCTIONS на pointer-up после drag-move.** Diff между `state.junctions` и желаемым набором pairs (по proximity через `computeAutoJunctions(containers, positions)`): auto-junctions без пары → drop, новые пары без junction → create kind=auto-detected. **Manual junctions** (kind ≠ 'auto') не reconcile'ятся — после `SET_JUNCTION_KIND` junction живёт независимо от proximity. Optimization: avoid state churn при unchanged set (length + id-array equality check).

**[2026-05-12] DEC-CANVAS-V2-JUNCTION-PALETTE-V05-01** — **Палитра 9 типов junction'ов скопирована из v0.5 `JunctionBlock.jsx` в `canvas/junction-styles.js`.** Игорь 12.05.2026: «переиспользовать кодовую базу V0.5». Прямой import невозможен (JunctionBlock heavily store-coupled), но цветовые константы переносимы. Типы: auto (grey) / overlap (blue Gibson) / golden_gate (green) / re_ligation (orange) / ligation (red) / kld (purple) / sticky_end (orange) / blunt (gray) / preformed (gray). Per-kind stitch markers в SVG: overlap-parallelogram / GG-arrows / RE-zigzag / KLD-dots / ligation-bars. Палитра — общий язык между skeleton и production canvas (cross-consistency важнее DRY).

**[2026-05-12] DEC-CANVAS-V2-OPS-CANVAS-ONLY-01** — **Operations (PCR/Restriction/Mutagenesis/Gibson) живут на canvas (ромб → popover выбора kind → popup параметров), не в Container Editor.** Editor — viewer-of-truth для одной молекулы (sequence + annotations + features), он не запускает operations. Биолог собирает план реакций на canvas как граф; editor открывается двойным кликом на filled container для просмотра / редактирования аннотаций / mutagenesis intra-container. Этот sprint реализовал junctions (соединения между containers), но не operations (типы реакций) — они на следующий sprint. `OperationNode.jsx` (1.96 KB) для Graph view остался как есть. **Reformulates DEC-CANVAS-08** («контейнер-редактор = SequenceView + operation toolbar»): toolbar убран из editor'а, перемещается на canvas-side. Алгоритмы (mutagenesis / golden-gate / restriction-db / tm-calculator / local-primer-design) — harvest без изменений.

**[2026-05-12] DEC-CANVAS-V2-DELETE-VIA-DEL-01** — **Del/Backspace на highlighted container удаляет его с canvas + cleanup всех state-полей.** `REMOVE_CONTAINER(containerId)` снимает container из containers/positions/pendingEditsByContainer/selectionByTab/sequenceViewModeByTab/junctions (где container — участник)/highlight/editor (если открыт на удаляемом). Guards в `DeleteKeyHandler` (window keydown listener в `index.jsx`): editor открыт → Del работает на features (через `useSelectionEdit` в SequenceView), не на canvas; target = input/textarea/contenteditable → текст; highlightedContainerId=null → no-op. NOTES §3 generalised для filled containers.

**[2026-05-12] DEC-CANVAS-V2-EDITOR-01** — **Editor = композиция Library/inspector/tabs/*, не клон.** `ContainerEditorSkeleton.jsx` импортирует `TabBar` / `SequenceTab` / `AnnotationsTab` / `HistoryTab` / `LinearFeatureBar` / `FeatureEditorModal` / `InlineEditableTitle` напрямую из `Library/inspector/`. Hooks `useFeatureEditorFlow` + `useAnnotationUndoRedo` переиспользуются. **Не используются:** `useEditableModeToggle` / `useLibrarySaveFlow` / `useManualEditBranching` / `useIdlePrewarm` / `LibraryInspectorTitleRow` / `LibrarySaveActions` / `ManualEditConfirmModal` / `LibraryMetaColumn` (Library-specific). Editor собирает свой layout с своими hooks (cursor / selection / scroll) под адаптер `container → item-shape`.

**[2026-05-12] DEC-CANVAS-V2-EDITOR-02** — **`container → item-shape` адаптер в `editor/adapt-container-to-item.js`.** `buildItemFromContainer(container)` маппит skeleton container shape (id / name / sequence / annotations / `topology: {circular}` / length / origin / commits) в Library item-shape (id / `_fileName=container.id` / name / sequence / annotations / `topology: 'circular'|'linear'` / length / `_libraryEntryId=null` / `zone='skeleton'`). `_libraryEntryId=null` отключает manual-edit branching path в SequenceTab. `buildEditsFromPending(pending)` → `{editedAnnotations?, editedSequence?, editedTopology?, editedName?} | null`. `hasPendingEdits(pending)` — boolean для apply/discard кнопок.

**[2026-05-12] DEC-CANVAS-V2-EDITOR-03** — **Pending edits per-container с carry-over между re-open'ами.** `state.pendingEditsByContainer[containerId]` буферизует annotation/sequence/topology/name изменения до явного «✓ Применить» (`COMMIT_PENDING_EDITS`) или «↶ Отменить» (`DISCARD_PENDING_EDITS`). Закрытие editor'а без apply — pending сохраняется; повторный двойной клик показывает pending. Match Library pattern (`perFileEdits[fileName]`). Annotation edits через `onAnnotationEdit` → `applyAnnotationEdit` → `SET_PENDING_EDITS({editedAnnotations: next})`, **не** в `state.containers[i].annotations` напрямую. **Modifies** DEC-SKELETON-FIX1-01 (11.05): старый `COMMIT_ANNOTATION_EDIT` reducer-case остался в state.js, но editor его не дёргает — кандидат на удаление в следующем sprint.

**[2026-05-12] DEC-CANVAS-V2-EDITOR-04** — **Annotator scope namespace `skeleton::${containerId}` для разделения от Library-target.** Editor дёргает global `openAnnotator({kind, sequenceId: 'skeleton::' + containerId, region?})`. AnnotationsTab внутри editor'а monitorит `selectAnnotator` global. `onApplyAnnotatorResults(acceptedRegions)` пайплинит через `applyAnnotationEdit({kind:'create-batch', payload})` → `SET_PENDING_EDITS({editedAnnotations: next})`. **Известный risk:** Library AnnotationsTab + LinearFeatureBar.mergeStripWithPredicted не имеют guard'а на `skeleton::*` scope; при одновременной работе skeleton + Library Library может рендерить ghost results. Сейчас skeleton и Library — разные fullscreen, одновременно не запускаются, риск низкий. Если выстрелит — багфикс с guard в Library `AnnotationsTab.jsx`.

**[2026-05-12] DEC-CANVAS-V2-EDITOR-05** — **Editor всегда editable, нет readonly_bodge zone в skeleton.** `editable=true` / `isReadOnlyZone=false` константно. `useEditableModeToggle` (DEC-LIB-16 ⚓ Library) не используется — толк проявляется только при interop с Dexie-backed readonly entries; skeleton mock-everywhere.

**[2026-05-12] DEC-CANVAS-V2-EDITOR-OVERVIEW-OFF-01** — **OverviewTab выпилен из canvas editor'а; default activeTab = 'sequence'.** Игорь 12.05.2026: «overview — фишка библиотеки/импортёра, не нужна при заходе из канваса. При нажатии два раза на контейнер открывается сиквенс вивер без оверьвю.» Canvas editor открывается на контейнере уже в pipeline — биолог знает что внутри, нужен sequence напрямую. **TabBar** в `Library/inspector/tabs/TabBar.jsx` расширен пропсами `showOverview` (default `true`, Library не ломается) и `showMutagenesis` (default `false`). Canvas editor передаёт `showOverview={false}` + `showMutagenesis={true}`. **Watch:** это расширение Library tabs ради canvas — отклонение от правила «Library не трогать» в спеке. Library tests должны пройти; если падают — bugfix.

**[2026-05-12] DEC-CANVAS-V2-EDITOR-MUTAGENESIS-STUB-01** — **Tab 'mutagenesis' в editor'е = заглушка-копия SequenceTab.** Игорь 12.05.2026: «вкладка мутагенез дублирует сиквенс вивер, но добавляет возможности... позже. пока скопируй сиквенс вивер.» `fileKey={id}-mutagenesis` — отдельный cache key. Реальные mutagenesis-tools (point mutation wizard через `mutagenesis.js` core; primer design для KLD/QuickChange; library design batch) — следующий sprint **M-CANVAS-MUTAGENESIS**. Сейчас вкладка только маркирует место.

**Сверх sprint'а — что не реализовано из NOTES_CANVAS_V2_KICKOFF:**
- «+ кнопка» добавления placeholder вручную (NOTES §3): добавить можно только через drag из tree.
- Operations as ops на canvas (PCR/Cut/Mutate kind picker на ромбе): реализована только junction-side (соединения), не reaction-kind side.
- Сборка из праймеров (NOTES Q1).
- Mutability «frozen-on-use» (NOTES Q4): pending edits есть, frozen-on-use lifecycle — нет. Не блокер пока operations нет.
- Drop entry на уже filled container (NOTES Q5): сейчас filled-блоки не имеют drop-handlers, drop проходит на canvas-level ADD path. Семантика replace/merge/refuse не выбрана.

**Carry-over из 11.05.2026:**
- DEC-CANVAS-02 partially superseded (см. DEC-CANVAS-V2-PARADIGM-01).
- DEC-CANVAS-03 (immutable, каждая операция → новый container) — совместим с V2 paradigma, остаётся.
- DEC-CANVAS-05 (топология → категория) — остаётся; placeholder без topology не категоризуется, после fill применяется.
- DEC-CANVAS-06 (Tree 3 раздела) — остаётся в Library; skeleton использует LibraryTreeRoot через host, наследует структуру.
- DEC-CANVAS-08 — operation toolbar в editor'е reformulated (см. DEC-CANVAS-V2-OPS-CANVAS-ONLY-01).
- DEC-SKELETON-FIX1-01 — modified (см. DEC-CANVAS-V2-EDITOR-03).

---

## Architecture session 11.05.2026 — Canvas-model fundament (M-Canvas kickoff)

> **Контекст.** Kickoff-сессия M-C («ДАГ+канвас», детальное обсуждение Игорь ↔ Chat 11.05.2026). Базовая модель v0.6+ переписана с трёхуровневой (DEC-NAV-3LEVEL-01) на одно-workspace с двумя view. Реализация — последующие сессии с макетами, перед этим архитектурный документ `docs/ARCHITECTURE_CANVAS_MODEL.md`. Все 8 решений ниже — **кандидаты на ⚓ promotion** после первой M-Canvas acceptance.

**[2026-05-11] DEC-CANVAS-01** — **Один workspace = Canvas. DAG = Graph view canvas, не отдельный режим.** Три инструмента, три роли: **Canvas** (с двумя view: Layout / Graph) — inter-container biology, все материалы проекта + связи через operations; **Контейнер-редактор** — одна молекула в SequenceView + scalpel toolbar, intra-container biology; **Tree (Library)** — иерархия материалов проекта по родословной, навигация и импорт. Layout view — авторский spatial, биолог расставляет сборки. Graph view — auto-layout bipartite (operations как ромбы, materials как прямоугольники, всё развёрнуто, чтение картины эксперимента целиком). Один и тот же набор данных, два рендера. DAG **как отдельный мезо/макро уровень растворяется**. Library Inspector как «отдельный workspace» тоже растворяется — это Tree-сайдбар + редактор справа при клике. **Supersedes** DEC-NAV-3LEVEL-01 (трёхуровневая модель). Подтверждено reference-скриншотом Игоря (Graph view с PCR/Gibson/Cut/Library-clone-lazy рёбрами, минимап, Cmd+L center, Cmd+K search).

**[2026-05-11] DEC-CANVAS-02** — **Все проектные контейнеры на canvas всегда, автоматически.** Импорт контейнера в проект = моментальное появление блока на canvas. Биолог не таскает руками «что мне сейчас нужно для сборки» — всё доступно сразу как ингредиенты. Drag из Tree-сайдбара остаётся **только для импорта из других проектов** (cross-project clone, lazy). Это снимает развилку «как биолог приносит второй контейнер в контекст» — он уже здесь, picker'ы не нужны.

**[2026-05-11] DEC-CANVAS-03** — **Immutable model: каждая операция порождает новый контейнер (или несколько). ContainerCommit как сущность отменяется.** Substitution / mutagenesis / insertion / replace — все генерируют новые containers с явным `parentCommit`. Исходный контейнер неприкосновенен. ProjectCommit обобщается до `n inputs → m outputs` (PCR 1→1, Cut 1→2/много, Gibson n→1, Mutagenesis 1→1). История бесплатна — откат к старой версии = открыть старый контейнер, он живой. Цена: много контейнеров — компенсируется Tree-структурой (DEC-CANVAS-06) и автоматической категоризацией (DEC-CANVAS-05). **Partially supersedes** DEC-CONTAINER-DIFF-STORAGE-01 (diff-storage остаётся допустимой техникой compression, но не как UX-понятие «версия плазмиды in-place»). **Supersedes** ARCHITECTURE_v2 §2.4 разделение ContainerCommit / ProjectCommit.

**[2026-05-11] DEC-CANVAS-04** — **Дубликаты от повторного запуска операций не сливаем.** PCR того же template теми же primer'ами дважды → два разных containers с разными commit'ами. Honest к историчности процесса, проще для отката, биолог может пометить «копия Y» вручную через tag, но система не дедуплицирует. Применимо ко всем reaction-методам.

**[2026-05-11] DEC-CANVAS-05** — **Топология решает категорию контейнера автоматически.** **Circular** = всегда **★ Итог** (жизнеспособная плазмида, готова к трансформации). **Linear** = всегда **Материал** (промежуточный — ампликон, digest fragment, gblock). Биолог не управляет категорией ручкой — она derived из `topology` поля контейнера. Импортированные circular получают ★ автоматически (pUC19, pET28b empty); импортированные linear — без ★ (gBlock_Bsal). Циркулярная плазмида может стать template'ом для PCR — это не убирает её ★, у неё появляются «дети» (линейные ампликоны), сама остаётся ★. Линейный продукт ligation'а который биолог планирует циркуляризовать — остаётся Материалом до циркуляризации (правило применяется к моментальной топологии контейнера, не к будущему намерению). Решает multi-parent проблему в дереве: ★ Итоги — отдельная секция, не вложены под родителями, дубликатов нет.

**[2026-05-11] DEC-CANVAS-06** — **Tree проекта — три раздела:** `⭐ Итоги` (все circular контейнеры проекта, плоский список — финальные артефакты), `📥 Материалы` (imported linear + промежуточные linear, **раскрытие children inline** — у каждого контейнера можно развернуть стрелочку и увидеть что из него родилось операциями), `🔬 Праймеры` (плоский список primer-pool, не висят под template'ами — primer-pool это параметр reaction'а, не child template'а). Циркуляры показаны **только в Итогах**, не дублируются в Материалах. Linear-цепочки в Материалах терминируются ссылкой `→ собрано в плазмиду Y` (reference на Итог). Это снимает раздел «Промежуточные» как сущность — родословная встроена в основной просмотр Материалов через expand/collapse.

**[2026-05-11] DEC-CANVAS-07** — **SequenceView получает второй режим отображения для circular molecules — plasmid map (кольцо с features).** Toggle linear ⇄ circular в углу вивера. Бесплатно достаётся всем 4 контекстам где SequenceView используется (Importer, Library Inspector, Annotator, Контейнер-редактор). Глубина первой реализации (минимальная: кольцо + features как дуги + основные labels; vs полная: restriction sites внутри кольца, точное label routing с overlap resolution, ruler по координатам) — открытый параметр, решается в сессии реализации. На уровне фундамента закрепляется только наличие режима. Скоуп ограничен только A (отображение в SequenceView) — отдельный side-pane «полка кольцевых» в Tree/Canvas отброшен биологом.

**[2026-05-11] DEC-CANVAS-08** — **Контейнер-редактор — отдельная сущность поверх SequenceView, не «SequenceView в новом контексте».** Структура: SequenceView (universal viewer, фундамент) + operation toolbar (ПЦР, Restriction, Мутагенез, Replace, и т.п.) + inline operation popups (праймер из selection, ПЦР inline confirmation, мутагенез parameters) + расширенный SelectionContextMenu (operations доступны из right-click). Точка входа — двойной клик на любой материал-блок canvas (любой kind, любая зона). SequenceView сам остаётся чистым universal viewer'ом — не место для operations. Любая будущая правка operations не трогает SequenceView и не разрушает Importer / Library Inspector / Annotator. Это закрывает развилку «где живут скальпели intra-container» — в контейнер-редакторе, отдельной сущности с собственной ответственностью. **Алгоритмы операций harvest'ятся из v0.5** (`golden-gate.js`, `restriction-db.js`, `tm-calculator.js`, `local-primer-design.js`, `mutagenesis.js`, junction-метод-по-концам из `JunctionBlock`); **UI v0.5 wizards выбрасывается** (`PlasmidUseWizard`, `MutagenesisWizard`, `OligoManager` как modal, `PrimerPanel` как side-panel) — operations переписываются inline, не как modal wizards.

**Что выкидывается / переписывается на основе DEC-CANVAS-*:**
- `gui/designer/src/components/Dag/` (M-C.1 K4 заглушка, ~30 KB) — на kill полностью. Harvest: ReactFlow setup, dagre LR layout, drop-handling pattern. Остальное — переписывается под Canvas-модель.
- M-X.7a v2 Library Inspector scope меняется: становится Tree-сайдбар + редактор справа, не отдельный workspace. Tree получает три раздела (DEC-CANVAS-06).
- M-X.7c L2/L3 деление по 3LEVELS-модели отменяется (не было реализовано, спека была частичной).
- `docs/ARCHITECTURE_3LEVELS.md` — на archive после оформления `docs/ARCHITECTURE_CANVAS_MODEL.md`.

**Открытые вопросы для следующих M-Canvas сессий** (с макетами): (1) «+ Сборка» как UX-жест — ghost-placeholder operation, drag-to-port от materials к ports; (2) multi-step операции в Layout view (PCR обоих → ligation как одна visual-сборка со стадиями vs два отдельных commit'а); (3) цикл переключения Layout ⇄ Graph — позиции сохраняются или auto-relayout; (4) layout algorithm — где появляется блок при добавлении, cascade поведение; (5) draft / verified state операции (failed pTest-GG со скриншота); (6) виртуальная сборка для проверки (zone «черновики» или draft-flag); (7) Tree shared между Library Inspector и Canvas или дублируется; (8) operations toolbar минимальный набор для первой итерации (ПЦР+Restriction+Мутагенез = 80% workflow'ов); (9) plasmid map глубина для первой итерации (минимальная vs полная); (10) primer entity на Graph view — узлы рядом с PCR-ромбом (биолог хотел «как сущность») или параметры PCR-узла (показано на скриншоте) — уточнить в макетной сессии.

---

## Architecture session 09.05.2026 — 3-level navigation hierarchy

**[2026-05-09] DEC-NAV-3LEVEL-01** ⚠ **SUPERSEDED by DEC-CANVAS-01 (2026-05-11).** Трёхуровневая навигация (макро DAG / мезо парт-канвас / микро Container Window) переписана на одно-workspace модель: Canvas с двумя view (Layout / Graph) + контейнер-редактор как drill-in. DAG растворился в Graph view, парт-канвас исчез как отдельная сущность, Container Window переименован в контейнер-редактор и стал четвёртым контекстом SequenceView со слоем operations. Все ARCHITECTURE_3LEVELS-зависимости переписываются (Dag/ K4 на kill, M-X.7a v2 scope меняется, M-X.7c L2/L3 деление отменяется). Запись сохранена для истории решений. Оригинал ниже. ─── Навигация BodgeGene разведена на три уровня — **макро** (DAG всего проекта), **мезо** (парт-канвас редактора одной сборки), **микро** (Container Window редактора одного контейнера). DAG read-only по семантике — рёбра и узлы появляются как следствие операций на других уровнях (импорт → новый узел; подтверждение сборки → новый узел + рёбра; операция в Container Window → новый узел/ребро). Парт-канвас открывается как fullscreen-overlay над DAG (не отдельный workspace — R3 §17 playbook пройдён), закрытие Esc → возврат в DAG. **Две точки входа в парт-канвас:** «+ Сборка» в DAG-палитре (пустая лента) + двойной клик по ребру сборки (редактирование существующей). **Один объект Сборка — два представления:** в DAG как мульти-входной узел/ребро («откуда пришло»), в парт-канвасе как лента блоков с junction-логикой («что с чем стыкуется») — согласуется с эпистемологией Игоря «Library + DAG = два режима одного компонента». **Junction-логика v0.5 переиспользуется:** `JunctionBlock.jsx` (29 KB) + `JunctionDNA.jsx` (14 KB) — 8 типов стыковки (overlap/Gibson, golden_gate, re_ligation, ligation, kld, sticky_end, blunt, preformed); алгоритм выбора метода по паре концов (sticky+sticky→ligation; blunt+blunt→KLD; overlap+overlap→Gibson; BsaI/BsmBI overhangs→Golden Gate) харвестится, UI переписывается. Старый drag-drop холст v0.5 (`DesignCanvas` + `PartsPalette` + `PartsLibrary` + `PartBlock` + `AddFragmentModal`) на kill в Этапе 3 `docs/SPRINT_KILL_DEAD.md`. **Праймеры не висят узлами в DAG, но визуально явно обозначены** — это ресурс уровня проекта, видятся в Library tab «Праймеры» (View-агрегация над всеми primer entries) и в junction-блоках парт-канваса («Gibson, P1+P2»). **На ребрах DAG** на входной стороне (ближе к исходному фрагменту) рисуется боковой отросток-иконка (две стрелочки «→ ←» как метафора PCR-пары) на каждую пару P1+P2; цвет отростка отражает статус из OligoManager (серый «не заказан» / оранжевый «заказан» / зелёный «получен» / красный «плохой»), биолог видит «эту сборку ещё нельзя делать» без drill-in. На macro-zoom — только иконка; hover → всплывают имена; клик → Library tab «Праймеры» или PreviewDrawer справа. **Порядок реализации:** Этапы 2/3 kill старого верстака → R4 + Этап 4 kill старого импортёра → M-C.2 Container Window (оживляет wizards-сирот) → M-E Парт-канвас (оживляет JunctionBlock harvest). Полный разбор в `docs/ARCHITECTURE_3LEVELS.md` (~12 KB). **Открытые вопросы для M-E проектирования:** (1) версионирование сборки при пересмотре (update ребра vs новый узел-версия); (2) circularization (линейная лента с меткой vs круговое размещение); (3) multi-step протоколы PCR→Gibson (одна сборка внутри vs две связанные в DAG); (4) черновики Container Window (терять vs «draft-ребро» в DAG). **Кандидат на ⚓ promotion** после M-C.2 acceptance (когда Container Window подтвердит схему «двойной клик на узел/ребро → оверлей над DAG → возврат Esc» в реальной практике).

---

**[2026-05-09] DEC-PROJECT-OPEN-MERGE-01** — Отдельной операции «открыть проект» в BodgeGene **нет**. Импорт `.bodge` всегда равен открытию — файл появляется в Library Tree (`📦 *.bodge`) и сразу становится активным. Клик по заголовку другого проекта = переключение активного (прошлый автосохраняется в IndexedDB). `librarySlice.openProject(id)` + `import.bodge` сливаются в `activateProject(id)`. Из UX исчезают кнопка «Открыть», режим «импорт без открытия», экран StartScreen «Открыть». Остаются только «Импортировать .bodge» и «+ Создать проект». «Проект» в UI сводится к ячейке Tree, не к workspace. Совпадает с хвостом «Tree группировка по `projectId`, выкорчевать `entry.zone`». **Кандидат на ⚓ promotion** вместе с DEC-NAV-3LEVEL-01.

**[2026-05-09] DEC-CONTAINER-DIFF-STORAGE-01** ⚠ **PARTIALLY SUPERSEDED by DEC-CANVAS-03 (2026-05-11).** Immutable модель (каждая операция → новый container, не in-place version) отменяет diff-storage как **UX-понятие «версия плазмиды»**. Diff-storage остаётся допустимой техникой **на уровне хранения** для compression (новый контейнер с `parentContainerId` + `ops` вместо полной копии sequence) — но это deployment-detail, не часть data model'и которую видит биолог. Версия v0.7.1 fragment-level паттерн (`baseSnapshot` + `commits[]` с replay) сохраняется в SequenceView для intra-container правок без commit. Оригинал ниже. ─── `MoleculeContainer` в `.bodge/containers.json` хранится в одном из двух режимов: **полный** (`payload: { sequence, annotations }`) — для листьев DAG (импортированных плазмид, базовых backbone), **diff** (`payload: { parentContainerId, ops }`) — для версий плазмиды по DEC-LIB-K7-VERSION-COW-01 (мутагенез, manual edit). Sequence версии вычисляется при открытии как `parent.sequence` + apply ops. **Обоснование:** без diff-storage 50 итераций мутагенеза 10 kb плазмиды отъедают пол МБ на ветку; с diff — один baseSnapshot + 50 × ~200 байт ops. Реалистичный `.bodge` остаётся 1–5 МБ даже в больших проектах. На уровне fragment этот паттерн уже работает (`baseSnapshot` + `commits[]` с replay, v0.7.1). Lazy migration: импортируемые до v0.9 `.bodge` остаются в full режиме, новые версии — в diff. **Кандидат на ⚓ promotion** вместе с DEC-BODGE-STRUCTURE-01.

---

## Sprint v0.8.2 — M-X.7c FAIL-fixes + M-X.8 PROJECT-HUB + M-X.9 SEQUENCE-SEARCH + Фикс 7 (10.05–11.05.2026)

**[2026-05-10] DEC-PROJSLICE-ACTIVATE-PURE-01 — `projectSlice.activateProject(id)` side-effect-free.** Корень FAIL #4 (Tree click non-current переключал в DAG): `activateProject` мутировал `state.canvas.activeFullscreen='dag'` + navStack синхронно с currentProjectId+MRU update. После фикса action делает только canonical state (`currentProjectId` + MRU bump). Workspace mode (`'library' | 'dag'`) — responsibility вызывающего callsite (Sidebar / MainPanel / DAG handlers). Existing callsites уже ставят mode явно — не сломаны. **Применимость:** инвариант для всех store actions — action = canonical state, side-effect-free; UI-mode переключают callsites, не actions. **Кандидат на ⚓ promotion** сразу — фундаментальный pattern.

**[2026-05-10] DEC-UIRREV-PINNED-EXPLICIT-01 — `pinnedProjectIds: string[]` как явный жест биолога, cap 15, hard block.** Не MRU. Закрепление — намерение биолога «эти проекты сейчас в работе». MRU остаётся отдельным полем `recentProjectIds` (migration: при пустом `pinnedProjectIds` сидим top-3 из MRU). Cap превышен → hard block с toast «Лимит 15 закреплённых», звезда disabled на остальных. Soft FIFO рассмотрен но отвергнут — биолог не должен терять закреплённое silently.

**[2026-05-10] DEC-UIRREV-TREE-CURRENT-EXPANDED-ONLY-01 — В Library Tree развёрнут только текущий проект, остальные свёрнуты.** Per-project expand override как Map; смена `currentProjectId` auto-collapses siblings. Library = архив всех проектов + погружение в историю; не workspace всех проектов параллельно.

**[2026-05-10] DEC-UIRREV-TREE-OTHERS-COLLAPSIBLE-GROUP-01 — Незакреплённые non-current проекты в Tree сгруппированы под одним collapsible `📚 Все проекты (N)`.** В свёрнутом виде — одна строка. Закреплённые + текущий + `⎀ БЕЗ ПРОЕКТА` остаются на верхнем уровне. Снижает visual noise при N>15 проектах в архиве.

**[2026-05-10] DEC-UIRREV-TREE-CLICK-ACTIVATE-01 — Click по заголовку non-current проекта в Tree = `activateProject` + auto-expand (без mode switch в DAG).** Закрывает gap M-X.7c K8 (раньше click был только toggle раскрытия). Click по current (развёрнутому) — toggle expand state без деактивации.

**[2026-05-10] DEC-UIRREV-TREE-CURRENT-FIRST-01 — Текущий проект всегда первой позицией в Tree после `LooseZone`, независимо от pinned-статуса.** Pinned others идут вторыми, collapsible `Все проекты (N)` третьим. Биолог видит свой проект без скроллинга/поиска.

**[2026-05-10] DEC-UIRREV-SIDEBAR-PINNED-SECTION-01 — Секция «В работе» в Sidebar между actions и «Рабочее место», counter `N/15`.** Каждый закреплённый — `SidebarItem` с иконкой `📦` (или `●` если current). Click → `activateProject` + переход в Library. Footer кнопка «Все проекты» (хоткей `⌘P`) открывает Command Palette. Порядок секций после FAIL-fix: actions → **РАБОЧЕЕ МЕСТО** → **В РАБОТЕ** → СПРАВКА → footer (биолог явно попросил swap).

**[2026-05-10] DEC-UIRREV-COMMAND-PALETTE-PROJECTS-01 — `CommandPalette.jsx` (~11 KB) overlay по `⌘P` + из sidebar.** Группы: `ЗАКРЕПЛЕНО · N` сверху + `ОСТАЛЬНЫЕ · M` снизу. ★/☆ слева — toggle pin без активации; click по строке — activate + close. Filter input. Footer «+ Создать проект» создаёт + закрывает. Esc / outside-click закрывают. Pin cap → toast warning.

**[2026-05-10] DEC-UIRREV-BREADCRUMB-STATIC-01 — Topbar dropdown снесён, breadcrumb статикой.** `RecentProjectsDropdown.jsx` (M-X.7c K7) удалён. `LibraryTopBar` — `BodgeGene › 📦 [имя]`. `✓ сохранён` pill вынесен из crumb в правый tray (между search + bell). Закрывает UX-гэп K7 M-X.7c.

**[2026-05-10] DEC-UIRREV-ACTIVATE-WITHOUT-PIN-01 — Click по проекту активирует без автопина.** Пин — явный жест (★ на карточке Главной + ★ в палитре). Использовал/посмотрел ≠ хочу видеть в «В работе».

**[2026-05-10] DEC-PROJ-STRINGS-FORMALIZATION-01 — Project name display: без UPPERCASE, без суффикса `.bodge`.** В Tree имя проекта `★ Имя` (mixed case), не `★ ИМЯ.BODGE`. CSS `text-transform: uppercase` снято с zone-header (условно — только для не-active вариантов). Суффикс `.bodge` отрезается в title-формировании ProjectZone. `sidebarOpenAll` — `Все проекты` без `+` и `…` (явное действие — не open dialog). `+ Создать проект` остаётся (`+` = создание). `Загрузить .bodge…` / `Импорт .gb / .dna…` остаются (`…` = open file picker).

**[2026-05-10] DEC-SEARCH-SEED-EXTEND-01 — Seed-and-extend без gaps как алгоритмическое ядро M-X.9.** Адаптивный seed `max(4, min(8, floor(qLen/2)))`. Score match +1, mismatch −2. Stop при drop ≥5 от max ИЛИ run-of-3 mismatches. Identity threshold ≥80% default, ползунок 50-100% live re-render. Min query 8 nt. Обе цепи всегда (toggle нет). Smith-Waterman с gaps отложен — субституции 90%+ кейсов. Indels не ловятся в этой итерации — ожидаемый design limit (новый TD-SEARCH-INDEL-UX про misleading сообщение).

**[2026-05-11] DEC-SEARCH-FULL-WINDOW-ALIGNMENT-01 — После seed-and-extend находит hitAnchor, делается full-window alignment query vs target[hitAnchor : hitAnchor + queryLen].** Матчи/мисматчи считаются по всем queryLen позициям, `queryIdentity = matches / queryLen` математически не зависит от позиции mismatch. Стандартный BLAST-pattern. Закрывает баг Фикса 7: position-dependent identity (mm на pos 2 → 97%, mm на pos 15 → <80%). После фикса проверено на скринах биолога: 1 mm = 95.0% ровно, 2 mm = 90.0% ровно (= (N-K)/N константно). Side-effects: `queryCoverage` теперь = 1.0 при full alignment кроме edge-case overhang за конец target; `hitIdentity` (matches/extensionLength) убран — perdu смысл; `extensionLength` промежуточное, не выходное поле.

**[2026-05-10] DEC-SEARCH-PER-QUERY-IDENTITY-01 — Primary identity для биолога = `queryIdentity` (matches / queryLen), не `hitIdentity` (matches / extensionLength).** Идентифицирует «насколько мой query соответствует найденному региону», что биолог ожидает. Identity bucket цвет переходит на queryIdentity: ≥90% зелёный, 80-89% жёлтый, 70-79% оранжевый, <70% серый. Sort by queryIdentity desc → hitIdentity desc → targetStart asc. **Supersede** изначальный M-X.9 K1 контракт где primary был hitIdentity (биолог в визуальной приёмке указал что это контр-интуитивно).

**[2026-05-10] DEC-SEARCH-SEPARATE-PRIMER-01 — Sequence search (Ctrl+F) и Primer binding sites (Ctrl+R, будущий M-X.10) — два разных workflow с разными алгоритмами и UI.** Ctrl+F — универсальный поиск ПСО, identity threshold, info-only 3'-end indicator. Ctrl+R — биологические Tm-based параметры (min match at 3'-end, allow single isolated 3'-end mismatch, min Tm) как в SnapGene Hybridization. Привычка SnapGene-биологов = разделять.

**[2026-05-10] DEC-SEARCH-3END-INFO-NOT-FILTER-01 — 3'-end indicator info-only, не hard filter.** Auto-detect: query.length ≤50 nt → primer mode → ✓/⚠/✗ в last 3 nt indicator. >50 → indicator hidden. Биологический backbone: 2-3 mm в last 3 nt = primer не работает (Taq требует perfect 3'-OH). Hit не выкидывается из results — биолог сам решает. Hard filter — в Ctrl+R workflow.

**[2026-05-10] DEC-SEARCH-SNAPGENE-EXCLUDED-01 — SnapGene catalog исключён из глобального search index.** Включаются entries с `kind === 'container'` из зон `loose` и `bodge` — рабочие данные биолога. SnapGene 2822 плазмид — демо/коммерческие backbone, шум при глобальном поиске. Toggle «искать в каталоге» — отдельная итерация если будет нужна. Primers (`kind !== 'container'`) тоже исключены — их искать не имеет смысла в этом flow.

**[2026-05-10] DEC-SEARCH-HOTKEY-ALTERNATES-01 — `Ctrl+Shift+P` и `Ctrl+Shift+F` как alternates для `command-palette` и `sequence-search`.** Не replace primary `Ctrl+P` / `Ctrl+F`, а OR-pair: `HOTKEYS.{command-palette,sequence-search}.keys` принимает array of combos, resolver iterates. Браузерные Ctrl+P (печать) / Ctrl+F (поиск страницы) могут быть перехвачены — alternates дают workaround без потери Tauri-future поведения. В UI hints показываем только primary, alternates документируются в `HotkeyCheatsheet` отдельной заметкой.

**[2026-05-10] DEC-SEARCH-WORKER-DEFERRED-01 — Worker-based search (DEC-SEARCH-WORKER-PATTERN-01 из спеки) НЕ реализован в v0.8.2.** Sync path в `searchLibrary` работает быстро на small libraries (<200 entries × ≤5 KB). Worker — perf-оптимизация, отложен до измеримого freeze. Записывается как TD-SEARCH-WORKER. Аналогично DEC-SEARCH-INDEX-EAGER-DEFERRED-01 — eager build пре-mount тоже не реализован, on-demand работает приемлемо. Записан как TD-SEARCH-INDEX-EAGER.

**[2026-05-10] DEC-ARCH-RUST-WASM-TWIN-TARGET-01 — Browser + native (Tauri) — оба first-class targets через Rust core.** WASM сборка для browser, FFI для Tauri. PWA не отказываемся. UI остаётся на React. Не Rust-native UI. Фундирует TD-RUST-CORE-* и TD-DESKTOP-NATIVE-SHELL. **Применимость:** все compute-heavy модули (parser / Tm / primer-design / restriction / alignment) — кандидаты на progressive port в Rust core по perf-триггерам. Текущий FastAPI backend — temporary, уходит вместе с TD-RUST-CORE-PARSER.

**Promoted в ANCHORS.md новых ⚓ в v0.8.2:** DEC-UIRREV-ACTIVE-SINGLE-01 (M-X.7c, паттерн «1 activeProject» переехал в реальный workflow M-X.8), DEC-UIRREV-ZONES-MERGE-01 (M-X.7c, паттерн «2 зоны» подтверждён реальным workflow), DEC-PROJSLICE-ACTIVATE-PURE-01 (новый, фундаментальный pattern для всех store actions). **Кандидаты на ⚓ promotion** после M-C.2 / M-E acceptance: DEC-NAV-3LEVEL-01, DEC-PROJECT-OPEN-MERGE-01, DEC-CONTAINER-DIFF-STORAGE-01 (carried over).

---

## Sprint v0.8.2 — M-X.7c FAIL-fixes + M-X.8 PROJECT-HUB + M-X.9 SEQUENCE-SEARCH + Фикс 7 (10–11.05.2026)

**Контекст спринта.** Три независимых пакета слиты в один version bump: (a) шесть FAIL-fixes после первой приёмки M-X.8/M-X.9 (10.05), (b) сам функционал M-X.8 PROJECT-HUB (8 K-блоков) и M-X.9 SEQUENCE-SEARCH (4 K-блока), (c) Фикс 7 Identity position-independence (11.05) как алгоритмический патч после повторной приёмки. Pin-функционал, Command Palette, локальный + глобальный поиск ПСО — всё новое за один цикл.

### Архитектура

**[2026-05-10] DEC-ARCH-RUST-WASM-TWIN-TARGET-01** — Browser + native оба first-class targets через единое Rust ядро. WASM-сборка для browser/PWA, FFI-сборка для Tauri shell. UI остаётся на React. PWA не отказываемся. **Обоснование:** один источник для compute-heavy логики (parser, primer design, alignment) — дешевле поддерживать чем два параллельных стека (Python backend + JS). Twin-target фундирует TD-RUST-CORE-PARSER / -PROGRESSIVE и TD-DESKTOP-NATIVE-SHELL. Дискуссия — без немедленного implementation, якорь для будущих perf/distribution разговоров.

### projectSlice purity

**[2026-05-10] DEC-PROJSLICE-ACTIVATE-PURE-01** — `projectSlice.activateProject(id)` — pure canonical-state action. Мутирует только `currentProjectId` + MRU. **НЕ** мутирует `canvas.activeFullscreen` / `workspace.active` / navigation stack. Workspace mode — responsibility вызывающего сайта (Sidebar / MainPanel / DAG handlers явно ставят `'library'` / `'dag'`). **Корень:** FAIL #4 в первой приёмке M-X.8 — click на non-current проект в Tree активировал И переключал в DAG, биолог терял Library mode. Investigation Code'а локализовала строки 370-371 `activateProject`. **Применимость:** инвариант для всех будущих actions — action = canonical state, mode/route/UI = callsite. **Кандидат на ⚓ promotion** (в ANCHORS.md этого же спринта).

### M-X.8 PROJECT-HUB

**[2026-05-10] DEC-UIRREV-PINNED-EXPLICIT-01** — `pinnedProjectIds: string[]` как явный выбор биолога, не derived MRU. Cap **15**, hard block (превышение → toast, `★` на незакреплённых disabled). Migration в `hydrateProjectsFromDexie`: при пустом `pinnedProjectIds` сидим top-3 из `recentProjectIds`. **Обоснование:** MRU не отражает «то что биолог сейчас держит на оперативном столе» — старый часто-используемый проект может вылететь из топа когда биолог разово открыл новый. Explicit pin — явный долгосрочный сигнал. Soft FIFO рассмотрен и отвергнут (биолог может неожиданно потерять pinned).

**[2026-05-10] DEC-UIRREV-COMMAND-PALETTE-PROJECTS-01** — `CommandPalette.jsx` overlay-панель `⌘P` / `Ctrl+P` + кнопка из sidebar «Все проекты». Две группы: `ЗАКРЕПЛЕНО · N` (filled ★, click ★ = unpin) + `ОСТАЛЬНЫЕ · M` (hollow ☆, click ☆ = pin). Filter input. Click row → `activateProject` + close. Footer «+ Создать проект» → создание + close. Esc / outside-click закрывают. **Применимость:** паттерн «overlay-навигация по dataset» (проекты сейчас, плазмиды/фичи потом) — переиспользуется когда нужен поиск-по-имени с pin-маркерами.

**[2026-05-10] DEC-UIRREV-BREADCRUMB-STATIC-01** — Topbar dropdown M-X.7c K7 (`RecentProjectsDropdown.jsx`) **снесён**. LibraryTopBar — статичный breadcrumb `BodgeGene › 📦 [имя текущего]`. `✓ сохранён` pill вынесен из crumb в правый tray (между search и bell). **Обоснование:** в приёмке M-X.7c биолог оценил dropdown как «надмозговое решение» — клик-таргет спрятан, префикс «Активный проект:» избыточен. Переключение проектов переехало в sidebar секцию «В работе» + Command Palette. Topbar теперь чисто индикатор контекста.

**[2026-05-10] DEC-UIRREV-ACTIVATE-WITHOUT-PIN-01** — Pin и активация — два независимых жеста. Click по проекту (sidebar / Главная / Tree / Command Palette row) → активация без авто-pin. Click по ★/☆ (Главная карточка / Command Palette) → toggle pin без активации. **Обоснование:** биолог может открыть редкий проект на один раз без засорения pin-секции; может закрепить проект «впрок» не покидая текущий. Раздельные жесты = explicit user intent для каждого state change.

**[2026-05-10] DEC-UIRREV-TREE-CURRENT-FIRST-01** — В LibraryTreeRoot после LooseZone первая позиция всегда — текущий проект (`currentProjectId`), независимо от pinned-статуса. Дальше: pinned others → collapsible `📚 Все проекты (N)`. **Обоснование:** биолог в первую очередь видит свой контекст, не «список из 50 проектов где надо искать текущий». Fix #2 из FAIL-ветки.

**[2026-05-10] DEC-UIRREV-TREE-CLICK-LIBRARY-MODE-01** — Click по header non-current проекта в Tree = `activateProject(id)` + `setExpandedProjectId(id)`. **Не** переключает `workspace.active`. Mode остаётся `'library'` если уже там. Биолог продолжает работать в Library с новым current, не выкидывается в DAG. Совместно с DEC-PROJSLICE-ACTIVATE-PURE-01. Fix #4 из FAIL-ветки.

### M-X.9 SEQUENCE-SEARCH

**[2026-05-10] DEC-SEARCH-SEED-EXTEND-01** — Алгоритм: seed-and-extend без gaps, базовый pattern BLAST-style. Адаптивный seed `max(4, min(8, floor(qLen/2)))`. Score match +1, mismatch −2. Stop extension при drop ≥5 от max ИЛИ run-of-3 mismatches. Identity threshold ≥80% default, ползунок 50-100% live re-render. Min query 8 nt. Обе цепи всегда (toggle нет). **Обоснование:** субституции покрывают 90%+ use cases (поиск гомолога с mismatches, primer binding, RE/feature lookup). Smith-Waterman с gaps отложен до момента когда биолог упрётся в «indel в гомологе не ловится» — отдельная итерация. **Применимость:** core sequence search для всех BLAST-like UX.

**[2026-05-10] DEC-SEARCH-SEPARATE-PRIMER-01** — Sequence search (Ctrl+F) и Primer binding sites (Ctrl+R) — два разных workflow, два разных алгоритма, два разных UI. Ctrl+F — универсальный поиск ПСО с identity threshold + info-only 3'-end indicator. Ctrl+R (отдельный milestone M-X.10) — primer binding через tm-calculator.js + local-primer-design.js, SnapGene Hybridization Parameters паттерн (min match at 3'-end, allow single 3'-end mm, min Tm как hard filter). **Обоснование:** биолог-привычка SnapGene разделяет «найти где есть похожая последовательность» и «найти где этот праймер сядет». Слияние workflow создаёт false expectations (Ctrl+F найдёт что-то с 80% identity, а биолог ожидал что это будет рабочий primer site).

**[2026-05-10] DEC-SEARCH-INDEX-EAGER-01** — 8-nt seed → `Map<seed, Array<{entryId, pos}>>` индекс по всем library entries. Eager build при mount Library, фоном в worker. Full rebuild при `addLibraryEntry` / `deleteLibraryEntry` / `updateLibraryEntry`. Память ~3-5 MB heap для 200 плазмид. **Текущая реализация:** on-demand per-entry index (Code отложил eager до perf-триггера, sync path работает быстро на <200 entries × 5 KB). Eager + cached оставлен как oптимизация при росте library.

**[2026-05-10] DEC-SEARCH-SNAPGENE-EXCLUDED-01** — SnapGene catalog (2822 коммерческих плазмид) исключён из global search index. Включаются только entries с `kind === 'container'` из зон `loose` и `bodge` (рабочие данные биолога). Primers тоже не индексируются (`kind !== 'container'`). **Обоснование:** биолог ищет «где у меня в проекте этот фрагмент», не «в каком из 2822 демо-плазмид есть похожее». Toggle «искать в каталоге» отложен до момента когда биолог попросит.

**[2026-05-10] DEC-SEARCH-WORKER-PATTERN-01** — `lib/workers/sequence-search.worker.js` + `lib/sequence-search-client.js` (lazy singleton). Паттерн копируется с annotator-worker (DEC-PERF-WORKER-01). Vitest happy-dom через `import.meta.env.VITEST` early-return → fallback на sync. **Текущая реализация:** worker не создан (Code отложил до perf-замера). Sync path в main thread работает быстро.

**[2026-05-10] DEC-SEARCH-3END-INFO-NOT-FILTER-01** — При query.length ≤50 nt активируется primer-mode индикатор `threePrimeOk: bool` (✓/⚠/✗ для last 3 nt). **Это информация для биолога, не hard filter.** Hit с failing 3'-end НЕ выкидывается из результатов — биолог видит badge и сам решает. Hard filter (Tm + strict 3'-end matching) — отдельный Ctrl+R workflow. **Обоснование:** Ctrl+F универсален, не делает биологических предположений. Hard primer-binding filtering — explicit user intent через Ctrl+R.

### Фикс 7 — algorithm correctness

**[2026-05-11] DEC-SEARCH-FULL-WINDOW-ALIGNMENT-01** — После seed-and-extend находит hit anchor — обязательный full-window alignment query vs target[hitAnchor : hitAnchor + queryLen]. `queryIdentity = matches / queryLen` математически инвариант к позиции mismatch'а. **Корень бага в фиксе 6:** `matches` counter в `extendDirectional` считался только внутри extension window (`bestMatches` snapshot at best-score point). Позиции query вне extension просто выпадали из счёта, не учитывались как mismatches. Близкий к началу/концу query mm выдавал короткое extension → меньше matches → identity «плавал» по позиции. **Алгоритмический фикс:** в `buildHit` после seed-extend — `preAnchor = targetStart - queryStart` + `postAnchor = targetEnd - queryEnd`, walk pre/post 1:1 до краёв target. Overhang case: walk обрывается на target edge (`alignableStart > 0` или `alignableEnd < queryLen`) → `alignableLen < queryLen`. **Применимость:** инвариант для любых future identity-метрик — нормализация по полной query length, не по window.

**[2026-05-11] DEC-SEARCH-IDENTITY-ALIAS-01** — `hitIdentity` (matches / extensionLength) **удалён** из hit object — потерял смысл при full-window alignment (теперь length = queryLen всегда при full coverage). Поле `identity` оставлено как back-compat alias к `queryIdentity` (LibraryTopBar/legacy callers). Sort tie-break перешёл с `hitIdentity` desc → `length` desc (alignment window size). **Применимость:** при изменении inner semantics поля — alias старого имени на новое значение для back-compat, явное удаление полей с deprecated semantics.

### Hotkeys

**[2026-05-10] DEC-HOTKEY-ALTERNATES-01** — `command-palette` и `sequence-search` получили второй binding (OR-pair, не replace): primary `mod+p` / `mod+f`, alternate `mod+shift+p` / `mod+shift+f`. `HOTKEYS.{action}.keys` теперь принимает array of combos, resolver iterates. В UI tooltips показываются только primary; alternates документированы в `HotkeyCheatsheet.jsx` с browser-override-note (`Ctrl+P` / `Ctrl+F` могут быть перехвачены браузером — alternate как escape). **Обоснование:** в Tauri-future primary keys будут работать всегда. В браузере биолог нажимает Ctrl+P → открывается диалог печати, в Chrome перехват необратим. Alternate — workaround на текущий момент, тривиальная цена (одна строка в keys array).

### Promoted в ANCHORS.md

**3 promotion в этом sprint** (после PASS-приёмки):
- **DEC-UIRREV-ACTIVE-SINGLE-01** (был в v0.8.1, deferred) — один активный проект одновременно, инвариант `[active]` тега в Tree;
- **DEC-UIRREV-ZONES-MERGE-01** (был в v0.8.1, deferred) — 2 зоны (loose/bodge) вместо 4, projectId различает проекты внутри зоны;
- **DEC-PROJSLICE-ACTIVATE-PURE-01** (новый из этого sprint, FAIL #4) — action = canonical state, mode = callsite responsibility.

Итого `ANCHORS.md` после v0.8.2: **64 ⚓** (было 61).

---

## Sprint v0.8.1 — M-X.7c UI revision + project activation merge (10.05.2026)

**[2026-05-10] DEC-UIRREV-ZONES-MERGE-01 — Tree зон 2, не 4.** `library-zones.js::classifyEntryZone` возвращал 4 варианта: `loose | active_bodge | readonly_bodge | lab_pool`. После K3 — две зоны: `loose` (БЕЗ ПРОЕКТА) и `bodge` (любой .bodge-проект). Различение между конкретными проектами идёт через `entry.projectId`, не через зону. **Обоснование:** «active» / «readonly» — состояние UI, не свойство записи. Один и тот же entry становится active/readonly в зависимости от того какой проект сейчас активен у биолога. Записывать это в `entry.zone` дублирует state и создаёт рассинхрон. Lab pool = View, не Zone (`inLabStock` остаётся флагом на entry, но в Tree не используется). Lazy migration: legacy zones мапятся в hydrate. **Кандидат на ⚓ promotion** после M-X.8 acceptance.

**[2026-05-10] DEC-UIRREV-ACTIVE-SINGLE-01 — Один активный проект одновременно.** `projectSlice.activeProjectId` — единственное поле определяющее какой проект «активный». Тег `[active]` в Tree рендерится только когда `entry.projectId === activeProjectId`. Никаких множественных `[active]` тегов, как было на baseline скрине (или это баг, или старая интерпретация тега как «открыт хотя бы раз» — удаляется). **Кандидат на ⚓ promotion** после M-X.8 acceptance вместе с DEC-UIRREV-CURRENT-PROJECT-SINGLE (rename activeProjectId → currentProjectId).

**[2026-05-10] DEC-UIRREV-IMPORT-EQ-ACTIVATE-01 — Импорт = активация (функциональное закрытие DEC-PROJECT-OPEN-MERGE-01).** Импорт `.bodge` через любую точку входа (`+ Добавить` в Tree, drag-drop в Library, файл-пикер в Sidebar «Загрузить .bodge») в конце пайплайна вызывает `activateProject(newProjectId)`. Биолог сразу видит DAG нового проекта в правой панели. Никакого «импортировал, нужно ещё открыть». Никакой кнопки «Открыть» как отдельной операции. **Это выполнение отложенного** DEC-PROJECT-OPEN-MERGE-01 от 09.05.2026 (был sprint-level кандидат на ⚓). Реализуется через единую action `projectSlice.activateProject(id)` в K8.

**[2026-05-10] DEC-UIRREV-DAG-NOT-FOLDER-01 — DAG не папка в Tree.** В ProjectZone до этого рендерился узел `DAG` рядом с `Контейнеры` и `Праймеры`. Это смешение «папок с записями» и «режимов отображения». DAG — репрезентация проекта целиком, не папка с записями. После K4 — узел удалён. DAG показывается в правой панели когда биолог кликает по заголовку проекта в Tree (project root) или по узлу `Контейнеры` внутри проекта. **Применимость:** любые representations of project / view modes не должны жить в Tree как «папки» рядом с entry-collections.

**[2026-05-10] DEC-UIRREV-QUICKADD-HOVER-01 — Hover-revealed `+` в Tree на все записи bodge-зон (расширение DEC-LIB-K8-QUICKADD-01).** Стрелка ↑ на каждой записи (изначально ассоциация с export) заменена на `+` hover-revealed (opacity 0 default → 1 на :hover row + 120 ms transition) — паттерн уже был в проекте (DEC-LIB-K8-QUICKADD-01 для Mine-секции). Расширен на все записи в bodge-зонах. Visible только когда `currentProjectId` есть И `entry.projectId !== currentProjectId` И `entry.kind !== 'primer'` (иначе бессмысленно). Click → `cloneEntryToActiveProject(entry.id)` + toast «{name} добавлен в {activeProject.name}». Старая стрелка ↑ (origin char) сохранена справа от quick-add — другой смысл (origin индикатор), не дублирует.

**[2026-05-10] DEC-UIRREV-OPEN-DOUBLECLICK-ONLY-01 — Двойной клик — единственная точка входа в Container Window.** Двойной клик по записи плазмиды в Tree → Container Window (после M-C.2). До M-C.2 — двойной клик открывает Inspector в более развёрнутом виде (текущее поведение). Кнопка «Открыть» в bottom-bar Inspector удалена. Дублирование жеста создаёт шум, биолог быстро запоминает «двойной клик». Discoverability: tooltip на hover record «двойной клик — открыть в полном редакторе» (Container Window после M-C.2 / Inspector сейчас).

**Promoted в ANCHORS.md новых ⚓:** — (нет в этом спринте; кандидаты отложены до M-X.8 acceptance).

---

## Sprint v0.8.0 — M-X.5 Этап 2 Library features (07.05.2026, MAJOR)
**[2026-05-07] DEC-LIB-K7-OVERWRITE-01 — Explicit save = `overwriteLibraryEntryAnnotations` + version bump.** Биолог получает явный COMMIT POINT, не silent write-through. Confirm dialog → bumps `entry.version` → toast «Сохранено · v{N}» → clear pending edits. Q5 plan guard: hard-fail с specific toast если parent.pendingDelete (биолог должен un-delete first). **Применимость:** explicit save pattern — каждый «commit» имеет visible side-effect (toast + version bump) чтобы biolog мог отслеживать revisions.

**[2026-05-07] DEC-LIB-K7-VERSION-COW-01 — Save-as-version creates new entry с parent reference (copy-on-write).** Modal name input prefilled с `${parent.name} (v2)` через existing `getSuggestedLibraryName` collision check (Q4 plan reuse). New entry: `origin: { kind: 'version', parentEntryId, parentEntryHash, createdAt }`, recomputed resourceHash, `version: 1`, parent stays unchanged. Returns new id but parent stays open в inspector — biolog sees toast + new entry в Library tree, переключение явное (click). Альтернатива (auto-switch inspector to new entry) рассмотрена но отвергнута: меньше surprise если biolog ожидает working copy на parent.

**[2026-05-07] DEC-LIB-K6-EDIT-PILL-01 — READ-ONLY pill turns into clickable button с amber accent + pulsing dot для EDITABLE mode.** Default false: SequenceView refuses character keystrokes via useManualEditDetection hook. Click → flips to true + amber background + 1.4s pulsing dot (`@keyframes editable-pulse`, honours prefers-reduced-motion). Reset to read-only on plasmid switch (item.id change) — каждый open starts safe. Visual signal — biolog ВИДИТ что mutation armed, не путается с annotation editing.

**[2026-05-07] DEC-LIB-K10-MANUAL-BRANCH-01 — Manual-edit branch creation Q5-guarded, per-mount confirm scope.** `createManualEditBranch(parentId, sequence, annotations)` forks entry в new library row (`origin.kind = 'manual_edit'` + parent reference + `manualEditFlag: true`, recomputed resourceHash). Q5 plan: parent.pendingDelete → hard-fail. Q3 plan: per-LibrarySingleInspector mount confirm scope — switching plasmid triggers modal again, защищая от случайных правок при cross-mount navigation. Caveat: commit lands modal + branch creation flow but не wires character-level apply в SequenceView (M-X.6 polish requires extending useSequenceKeyboard.js with edit handlers — substantial scope). Today new branch identical к parent except origin marker.

**[2026-05-07] DEC-LIB-K10-DETECTION-WINDOW-01 — Window-level keydown listener для manual edit detection.** `Library/hooks/useManualEditDetection.js` — window.addEventListener('keydown') active только при armed=true (editable && Mine entry && Sequence tab). Filters: not in input/textarea/contenteditable, no Ctrl/Meta/Alt chord, key matches IUPAC ACGTUNRYWSKMBDHV или Backspace/Delete. Fires `onFirstEdit` once per arm cycle (latch resets when armed flips). Альтернатива (callback prop через SequenceView's keyboard hook) рассмотрена но отвергнута: window-level listener избегает threading дополнительного callback через 3 уровня DOM children. **Применимость:** any «detect first user gesture in this mode» pattern — armed boolean + latch + window listener.

**[2026-05-07] DEC-LIB-K5-CURATED-7-01 — Onboarding curates 7 категорий из 19; tag triple для filtering.** Hand-picked subset: basic_cloning_vectors, pet_and_duet, mammalian_expression, yeast_plasmids, crispr_plasmids, plant_vectors, fluorescent_protein_genes. Esoteric остальные 12 (lucigen / qiagen / structural genomics / image consortium / gateway / insect / luciferase / coronavirus / ta_gc / topo / pgex / viral) hidden от onboarding picker — accessible через future «Browse all demo» mode. Q1 plan: hybrid catalog. Per-entry tags `['demo', 'demo:<slug>', categoryLabel]` для три уровня filtering: «demo» (все демо), `demo:<slug>` (категория), categoryLabel (human-readable filter). FolderPath = `Demo / categoryLabel` parallel.

**[2026-05-07] DEC-LIB-K8-QUICKADD-01 — Hover-revealed `➤` icon только при active project (DEC-LIB-QUICKADD-01).** Mine entries surface action ONLY когда есть `currentProjectId` И item has id И row hovered (CSS opacity 0 default, `:hover` opacity 1, 120ms transition). No clutter on standalone Library opened from Start screen. Click → `addContainerToCurrentProject(id)` + toast + popFullscreen() back to canvas. Альтернатива (always-visible icon) рассмотрена и отвергнута — занимает 24px в каждой row даже когда нерелевантна.

**[2026-05-07] DEC-LIB-K4-MULTIIMPORT-01 — In-place multi-import view с soft cap, no hard limit.** Drop N>1 files → MultiImportView replaces CatalogColumn inline. Per-file checkbox + annotation choice dropdown + folder selector. Soft cap warning at >20 files («Многовато файлов ({N}) — рендер может тормозить») без блокировки. Hard limit explicitly avoided per plan Q. `commitMultiImport(entries, defaults)` builds N entries в memory + `addLibraryEntriesBulk` (single Dexie tx) → atomic-ish (либо все, либо никто). Per-file annotation choice метаданные на `entry.ext.annotationChoice` для future use; auto-trigger при entry open deferred к M-X.6 polish.

**[2026-05-07] DEC-LIB-WRITE-THROUGH-HYBRID-01 — v0.7.5 silent write-through coexists с v0.8.0 explicit save flow.** План §K7 предполагал «replace by K7 explicit only». Но biolog feedback: «после refresh не теряются правки даже если забыл нажать Save» — user expectation. Compromise: keep silent `writeLibraryEntryAnnotations` як safety-net (every keystroke flushes to Dexie без version bump), explicit Save buttons (K7) добавляют COMMIT POINT layer с version bump + toast. Two-tier model: continuous persistence (safety) + explicit revision marker (provenance). DEC-LIB-13 ⚓ pure form available если biolog решит «edits transient until Save» — drop call site в `useLibraryState.updateEdits` и safety-net function становится thin wrapper around overwriteLibraryEntryAnnotations minus version bump.

**[2026-05-07] DEC-VITEST-POOL-FORKS-01 — vitest test.pool = 'forks' instead of default 'threads' for Windows reliability.** Symptom mid-K7: ~half test files (everything calling render()) failed с «document is not defined» / `environment 0ms` после K7 commit. Diagnosis: happy-dom cannot initialise inside worker_threads pool на Windows once suite is large enough to spawn many workers (resource-limit / fs-handle exhaustion). Reproducible: tests fail even на committed v0.7.5 baseline (где раньше passed). Forks pool gives each test file its own process — slower (~30%) но reliable. No tests в codebase depend on shared module state across workers, so forks safe. Set explicitly в vite.config.js test section.

**Promoted в ANCHORS.md (7 новых ⚓):** DEC-IMP-06 (Importer fullscreen abolished, Library = primary workspace — supersedes DEC-IMP-01..05); DEC-LIB-12 (sequence mutable через manual-edit branching — supersedes DEC-LIB-05); DEC-LIB-13 (annotations mutable через explicit save flow — extends DEC-LIB-06); DEC-LIB-14 (edit parity SequenceView ↔ Annotator через single dispatcher); DEC-LIB-15 (import targets — Library only / Library + project); DEC-LIB-16 (read-only по умолчанию для sequence editing); DEC-LIB-17 (onboarding through nudge, not modal).

---

## Sprint v0.7.5 — M-X.5 Этап 1 Library namespace refactor (07.05.2026)

**[2026-05-07] DEC-LIB-WRITE-THROUGH-HOTFIX-01 — TD-LIBRARY-WRITE-API hot-fix через `librarySlice.writeLibraryEntryAnnotations` + `useLibraryState.updateEdits` write-through.** Биолог 07.05 morning: «после сохранения и обновления страницы, аннотация не сохраняется на сохраненном (импортированном) неаннотированном фрагменте». Корень — DEC-LIB-11 (Library entries frozen) + transient `perFileEdits.editedAnnotations`: правки FeatureEditorModal / drag edges / H/E hotkeys / Del жили только в local React state, refresh страницы сбрасывал state → правки исчезали. M-X.5 K7 закроет это архитектурно через explicit save flow («Перезаписать» + version increment + confirm; «Сохранить как версию» + parent reference). До K7 — silent overwrite: новая slice action `writeLibraryEntryAnnotations(id, annotations)` (overwrite payload.annotations + putLibraryEntry); в `updateEdits` — fire-and-forget вызов когда patch несёт `editedAnnotations` И item — Mine-source (`_libraryEntryId` определён). Catalog/paste/file imports остаются transient — у них ещё нет library entry. **Заменится** в M-X.5 K7. **Применимость:** любой transient editing layer над persistent storage где user expects «my edits stick» — нужен либо явный save flow (preferred), либо silent write-through.

**[2026-05-07] DEC-LIB-MIGRATE-HEURISTIC-01 — Origin migration heuristic в `hydrateLibrary` (Q2 plan decision).** Pre-M-X.5 entries lack `origin` / `version` / `parentEntry*` fields. План §K1 предлагал две альтернативы: (a) lazy heuristic by tag prefix vs (b) full match against `plasmids-index.json`. Выбрано (a) — `deriveOriginForExisting(entry)` runs lazy on hydrate, demo-tag prefix `demo:<slug>` → `origin.kind = 'demo_category'` с categorySlug + sourcePlasmidName, иначе → `file_import` fallback. Idempotent на already-migrated entries. **Trade-off:** entries загруженные через старый M-A.3 SnapGene catalog flow без `demo:` prefix получают `file_import` (loss of provenance). Acceptable per план — re-import через onboarding K5 починит. **Применимость:** lazy migration без I/O в hydrate — паттерн для всех будущих data model evolutions где shape меняется без breaking writes.

**[2026-05-07] DEC-LIB-K2-ROUTE-ALIAS-01 — App.jsx case 'importer' → case 'library' fall-through (минимальный K2 scope для Этапа 1).** План §K2 expecting удаление 'importer' literal + dead-code purge (MultiInspector, EmptyInspector, ActionsBar, SessionSummary). Но в Этапе 1 без K4/K5/K7 заменителей это создаёт broken UX (нет multi-import view, нет empty state, нет save flow) в промежуточном v0.7.5 release. Биолог fixed Этап 1 acceptance как «undistinguishable from v0.7.4 functionally», что несовместимо с aggressive K2 purge. Compromise: case 'importer' → fall-through к case 'library' (оба mount Library) + dead-code остаётся inline (используется existing flow), флипание ~10 callsites + ~15 test fixtures + dead-code purge → Этап 2 параллельно с DEC-IMP-06 ⚓ promotion. **Применимость:** при architectural rewrite через несколько releases — alias path сохраняет совместимость промежуточного цикла, синхронный flip всех callsites идёт когда новые формы готовы.

**[2026-05-07] DEC-LIB-K3-DECOMP-01 — LibraryTree.jsx 38 KB landed (soft warning, под hard 40 KB).** Pre-K3 `CatalogColumn.jsx` 64 KB hard violation. План §K3 целил ≤30 KB main + 5 sub-files. Достижимый landing: helpers (3.5 KB) + LibraryGroupHeader (6 KB) + LibraryNestedSubGroup+InlineItemList+SnapgeneCategoryRow (10.8 KB) + LibraryItemRow+CatalogCard+EmptyHint (9 KB) + LibraryTree main (38 KB). Main file соft warning >30 KB но под hard 40 KB — биолог принимает или нет (план разрешает «soft OK if hard не превышен»). Дополнительные extracts (DropZone footer ~5 KB → отдельный LibraryDropZone.jsx, MineSection ~7 KB → отдельный компонент) deferred в M-X.5 K12 polish если ROI оправдан. **Применимость:** при decomposition большого монолита — extract'ить sub-components пока размер не landed comfortable; если main не доходит до hard violation — оставить soft warning в release notes для visibility.

**[2026-05-07] DEC-LIB-K9-MULTIDROP-DISABLE-01 — Multi-drop disabled с toast в Этапе 1 stub.** План §K9 для Этапа 1 предлагал sequential PreImportModal'ки для multi-drop (3 файлов → 3 модалки). Биолог feedback (planning round): «многовато для biolog'а, будет раздражать в v0.7.5 release». Альтернатива (B): disable multi-drop с toast «Multi-import будет в v0.8.0. Пока загружайте по одному файлу.» — выбрана. `Library/index.jsx` `handleAddFiles(files, opts)` — single → state.addFiles forwarding с opts (target folder); multi → showToast + bail. Single-paste через PreImportModal остаётся unchanged. Реальная MultiImportView UI — M-X.5 K4 Этап 2.

---

## Sprint v0.7.4 — M-X.3 wrap-tail post-acceptance polish rounds 12–18 (06.05.2026)

**[2026-05-06] DEC-WRAPTAIL-04 — Trailing wrap-tail restored под bridge с offset через bridgeWrapped.** Round-12 биолог: drag-selection через origin сверху-вниз требует визуальной зоны под main band, не только над. Round-10 inline-bridge без trailing rows ломал этот use case. Fix: `buildWrapTailLines({ trailingStart })` параметр — trailing rows начинаются от `bridgeWrapped` (количество wrap-half chars в bridge line), что предотвращает дублирование с wrap-half. Получили асимметричную compose: leading wrap-tail (~2 строки) → main:first..main:last с inline bridge → trailing wrap-tail (~3 строки). Round-13 fix `computeSegments` в SelectionOverlay — bridge detected по `data-wraps-origin` атрибуту, для trailing-wrap segments не пропускается первый bridge-region.

**[2026-05-06] DEC-WRAPTAIL-05 — Bridge wrap-half emits extended-domain caret (round-14b).** Биолог: «всё ещё одна буква в призраке не выделяется». Корень — `posFromPointerEvent` в `useSelectionState` при detect bridge wrap-half (rawOffset > bridgeWrapAt) emit'ил каретку в [0, bridgeWrapped] domain, что breaking `computeSegments` который ожидает trailing-wrap caret в (seqLength, 2×seqLength). Fix: bridge wrap-half emits caret `seqLength + (rawOffset - bridgeWrapAt)` — extended domain полностью консистентен с trailing-wrap rows ниже. **Применимость:** любые «inline bridge» патsterns где одна row рендерит две логических области (origin-crossing).

**[2026-05-06] DEC-LAYOUT-PAINT-ONLY-01 — Paint-only decorations через `box-shadow inset` для accent stripes над absolute-coord overlays.** Round-15 → 15b → 15c — три попытки починить «рамка выделения сдвинута, лишняя буква в призраке». Round-15/15b пытались починить direction-aware rounding (numeric anchor compare → row-kind based), оба не помогали. Биолог breakthrough: «рамка выделения сдвинута! буква то может и не лишняя». **Корень:** `border-left + padding-left: 3px` на `.sequence-line[data-wraptail-kind]` вызывал реальный CSS layout shift content на 3 px вправо, но SelectionOverlay рисовал absolute coords без сдвига → визуальное расхождение. **Fix round-15c:** replaced `border-left + padding-left` → `box-shadow: inset 3px 0 0 var(--accent-500)` — paint-only декорация без layout shift. **Учебный момент:** при наличии absolute-coord overlay (selection rect, caret, annotation rect) накладывающейся на text content, любая декоративная вставка через `border + padding` выдвинет content и создаст mismatch. Используй `box-shadow inset` либо `outline + outline-offset` для paint-only. **Применимость:** любые accent stripes над character grids (SequenceView, AnnotationTrack rect overlays, любые fixed-position character views).

**[2026-05-06] DEC-COMMON-FEATURES-DEDUP-01 — Canonical-key collapse в common-features при h=2 hash collision.** Round-14 биолог: «из комон фичей надо вымарать дубликаты. типо AmpR-BlaR они накладываются друг на друга именами, хотя это одни и те же гены». `gui/designer/public/common-features.json` содержал 419 features; некоторые гены представлены 2-3 entries с разными именами + одинаковой sequence (h=2 collision). `scripts/dedup_common_features.py` дропнул 11 дубликатов (419 → 408) через CANONICAL map: AmpR ≡ Amp(R) ≡ BlaR (canonical=AmpR, drop variants); Tet-On 3G ≡ rtTA-Advanced ≡ rtTA3 (canonical=Tet-On 3G); T7 tag вариации; sacB вариации; SV40 promoter вариации; UbiC promoter вариации; LTR (5'/3') variants; ITR (5'/3') variants. Скрипт ASCII-safe (cp1251 console encoding fix для Windows). **Применимость:** при добавлении новых common features требуется hash-check + canonical-name decision; dedup pass перед commit'ом common-features.json.

**[2026-05-06] DEC-ANN-LOCATE-01 — `onLocate` prop chain Annotator → SequenceView через `useImperativeHandle.scrollToPosition`.** Round-16 биолог: «нужно чтобы когда нажимаешь на имя комон фичи она тебя телепортировала на нее в сиквенс вью». Annotator's `ResultRow` component получил `onLocate(region)` prop, который при click пробрасывается через `LevelPanel` → `Annotator/index.jsx` → `PreviewTab` → `SequenceView.scrollToPosition({ pos: region.start, behavior: 'smooth' })`. Annotator внутри имеет local `innerScroll` state, мерджится с parent `pendingScroll` через `useImperativeHandle` ref-API. Click on feature name pill → smooth scroll to feature start position в SequenceView, caret moves to start. **Применимость:** все surfaces где navigation overview (Annotator, LinearFeatureBar) ссылается на detail view (SequenceView, MoleculeWorkspace в M-D).

**[2026-05-06] DEC-LINEAR-BAR-EMPTY-01 — LinearFeatureBar render всегда (ghost-only поддерживается).** Round-17 биолог скрин: «колбаса пропала в аннотаторе и в сиквенсе! если беру импортированный файл. Аннотации у него нет но колбаа и пустая с гост фичами должна быть». В M-X.2 LinearFeatureBar имел early-return при `!annotations.length` (для предотвращения empty render). Это блокировало показ ghost predictions из Annotator results на пустых плазмидах. Fix: removed `!annotations.length` гейт + `displayAnnotations.length > 0` гейт в SingleInspector. Bar теперь рендерится всегда; ghost-only mode supported. **Применимость:** любая UI surface которая аккумулирует confirmed + predicted features — гейт на one of them разорвёт ghost-only path.

**[2026-05-06] DEC-FEATURE-GHOST-EDIT-01 — Ghost CREATE conversion в `useFeatureEditorFlow.js` через `existsConfirmed` detection.** Round-18 биолог: «поправь сначала баг что фича не применяется если на нее зайти с вклакдки сиквенс и нажать два раза и сказать "сейф"». **Корень:** `applyAnnotationEdit({kind:'update', id})` для predicted (ghost) feature был silent no-op, потому что synthetic id (`${start}:${end}:${type}:${name}`) НЕ существует в `editedAnnotations` (predictions живут в `annotator.results`, не в confirmed array). `updateAnnotation` возвращает same array при id miss → save flow выглядел как «ничего не произошло». Fix в `useFeatureEditorFlow.js`: detect `existsConfirmed = baseAnnotations.some(a => a.id === parentId)`. Если ghost (existsConfirmed=false) → конвертирую save в `{kind: 'create', payload: {...featureUnderEdit, ...patch, level: 'region', predicted: false, confidence: undefined}}`. Strip `predicted` + `confidence` чтобы новая entry рендерилась solid (не dashed/italic). Existing dedup-heuristic `isDuplicateOfConfirmed` (overlap fraction + name/type match) подавляет original ghost (PreviewTab merge / showDuplicates filter). **Применимость:** любой dispatcher через single-API (`applyAnnotationEdit`, `applyMutation`, и т.п.) над несколькими storage layers (confirmed + predicted; baseSnapshot + commits) требует явного gate-check «существует ли target». **Усиливает DEC-EDIT-PARITY-01** (single dispatcher pattern) добавлением `existsConfirmed` precondition.

**Кандидаты на ⚓ promotion в M-X.5:** DEC-EDIT-PARITY-01 (от v0.7.2, подтверждён round-18) → промоция как **DEC-LIB-14 ⚓** в `ANCHORS.md` после M-X.5 K6. DEC-IMPORTER-TARGETS-01 (от v0.7.2) → промоция как **DEC-LIB-15 ⚓** после M-X.5 K9.

---

## Sprint v0.7.3 — M-X.3 Wrap-tail rendering + 11 polish rounds (06.05.2026)

**[2026-05-06] DEC-WRAPTAIL-01 — Wrap-tail visual layer без data-model изменений.** Selection через origin (TD-CIRCULAR-SELECTION) — отдельный sprint; в M-X.3 caretAnchor + caretPos остаются в [0, seqLength] для click-time, расширяются в (-seqLength, 2×seqLength) ТОЛЬКО для drag-extend через wrap-tail rows (round-8 partial). Точка в данных (annotation start/end) не меняется. Render layer плюс dragsemantic — это всё.

**[2026-05-06] DEC-WRAPTAIL-02 — Feature filtering at SequenceLine level вместо AnnotationTrack.** Позволил отложить TD-ANNOTATIONTRACK-DECOMPOSE-V2 (41.6 KB hard violation). SequenceLine принимает `features` как полный массив, AnnotationTrack клипает по `[lineStart, lineLen)` внутри. Wrap-tail rows получают тот же массив; AnnotationTrack рендерит features которые попадают в их absolute coords (что для leading-wrap = end-of-plasmid features, для trailing — start-of-plasmid).

**[2026-05-06] DEC-WRAPTAIL-03 — Round-10 inline wrap-bridge supersedes отдельные trailing-wrap rows.** Биолог: «продолжать должно дальше, просто поставить вертикальный разделитель и все. но новой строки быть не должно». Trailing wrap-tail strip больше не существует — last main row расширяется до full cpl с wrap chars от plasmid start, vertical orange divider INSIDE the line at wrapAt column. Leading wrap-tail остаётся как 2 строки выше main:first (DEC-WRAPTAIL-01). Asymmetric — биолог принял. **Trade-off:** AnnotationTrack / PrimerTrack / RestrictionTrack / AATrack не клипают по wrap-half bridge line (они filter [lineStart, lineLen) что для bridge line uncircularly extends past seqLength). Только RulerTrack + StrandsTrack рендерят корректно. **Кандидат на ⚓** если pattern переиспользуется в M-D Container Window.

**[2026-05-06] DEC-CARET-TRANSITION-01 — body.caret-gliding gating для caret transition.** Биолог round-5: 80 ms CSS transition на каретке конфликтует с keyboard repeat ~30 Hz (~33 ms между events) — каждый next transform-target прерывает текущую анимацию на полпути, каретка отстаёт от cursorPos на 50–80 ms, при отпускании клавиши «докатывается» ещё 80 ms. Fix: transition OFF по умолчанию (`.sequence-view-caret-anim { transition: none }`), `body.caret-gliding .sequence-view-caret-anim { transition: transform 80ms linear }`. SingleInspector тогглит class на body во время drag-scrub'а (внутри rAF callback), снимает через 120 ms таймером после last tick. Keyboard nav и click — instant; drag-scrub сохраняет glide через нуклеотиды. **Применимость:** любые caret-like overlays where keyboard cadence != mouse cadence.

**[2026-05-06] DEC-PERF-MEMO-01 — useCallback / scalar props для React.memo bail.** Биолог 5-point perf review: identity-нестабильные handlers (inline closures + `annDrag.onPointerDownEdge` через ref) ломали `React.memo` на SequenceLine — каждый cursorPos update регенерировал closure'ы → memo bail-out не срабатывал → все ~60 lines re-render. Fix: useMemo / useCallback на `onAnnotationEdgePointerDown` / `onAnnotationDoubleClick` / `onAnnotationFeatureDoubleClick` (PERF-1). Также `settings` prop split на скаляры (showBottomStrand / framesMode / primerStyle / reOrientation / visibleFrames) — zustand emitting fresh slice object на ANY field change инвалидировал каждую memo (PERF-4). PERF-3 rAF-coalesce drag-scrub в SingleInspector (latest pos в ref + один rAF tick на frame, 4 setStates → 1 batch). PERF-5 dropped translateZ(0) + backfaceVisibility:hidden на line wrappers — на слабых интегрированных GPU 60 forced layers стоили больше чем contain:paint уже даёт. **Применимость:** все React-memo'd lists в проекте (PartsPalette, CatalogColumn, AnnotationEditor rows).

**[2026-05-06] DEC-LFB-OVERLAP-EPSILON-01 — LinearFeatureBar `clusterByOverlap` требует ≥1 px intersection.** Биолог round-11: features которые НЕ overlap всё равно объединяются в общую рамку. Корень — float-rounding на пикселях делал touching features (AmpR end vs AmpR promoter start at same plasmid coord) overlapping на ≤0.5 px → `clusterByOverlap` группировал в один outer stroke. Fix: `intersection > OVERLAP_EPSILON` (= 1 px) вместо строгого `<` ranges. Touching pairs остаются independent. Также bumped AnnotationTrack rect width subtract from 1 px → 2 px for visible gap on 1× scale.

---

## Sprint v0.7.2 — Annotator perf + animation polish (05–06.05.2026)

Не финализирован. Здесь копятся sprint-level решения текущей волны UX/perf правок поверх v0.7.1 baseline. Финализация — после визуальной приёмки M-X.2 (CURRENT_TASK.md).

**[2026-05-06] DEC-PERF-WORKER-01 — Annotator predictor plugins (L1 common-features-homology + L2 structural orf-scan/sigma70/stem-loop/sgrna-scaffold) бегут в Web Worker.** Рантайм-флоу: `runAnnotatorPipeline` для каждого плагина с `capabilities.requiresNetwork===false && capabilities.requiresBackend===false` сначала зовёт `runPluginInWorker(pluginId, sequence, region, options)` из `lib/annotator-worker-client.js`. Клиент — lazy singleton над `lib/workers/predictor.worker.js` (Vite собирает через `new URL(..., import.meta.url)` + `type:'module'` → отдельный chunk `predictor.worker-*.js`, 12.62 KB gzipped). Worker side-effect-импортирует `annotator-plugins/index.js`, регистрация плагинов реплицируется в worker scope, `getPluginById(id)` находит плагин по pluginId из `postMessage`-payload. **Fallback-контракт:** клиент возвращает `null` когда `Worker` недоступен (vitest happy-dom через `import.meta.env.VITEST` early-return) или конструктор бросает; pipeline видит `null` и катится синхронно через `plugin.run` на main thread. Worker-крах в runtime тоже catch'ится — `onerror` сбрасывает singleton, повторный вызов попытается поднять worker заново. **Зачем:** L1 auto-run на открытии Annotator на 5–10 kb плазмиде блокировал main thread на 200–500 ms (биолог 06.05: «между переключением между сиквенсом и аннотатором секунда ожидания — оно должно быстрее мысли переключаться»). Двух-rAF-defer (DEC-PERF-DEFER-L1 от 05.05.2026, коммит `5279e44`) дал paint первого фрейма Annotator до scan'а, но сам scan всё ещё держал main thread когда биолог пытался переключать табы или скроллить strip. С worker'ом scan уезжает в параллельный поток — Annotator shell, progress bar, PreviewTab body рендерятся без contention. **Тесты:** `annotator-worker-client.test.js` пинит null-bypass контракт под vitest (без него happy-dom зависнет при попытке postMessage); все 5 тестов в `annotator-pipeline.test.js` идут через fallback-путь и остаются зелёными. **Что не покрыто:** BLAST stub (L3) с `requiresNetwork:true` остаётся на main thread — fetch policies в worker scope могут отличаться, и BLAST это I/O-bound, не CPU-bound. **Кандидат на ⚓** если pattern переиспользуется в M-D Container Window для других CPU-bound операций (BLAST, motif scanning, codon optimization).

---

## Sprint v0.7.1 — V50 PRE-K1 + Parser-Unification + SnapGene Refresh + M-B.3 Sequence Viewer + interaction extensions (03–04.05.2026)

Финализация четырёх под-спринтов одной release-волной v0.7.1. ⚓ fundamentals в `ANCHORS.md` (DEC-PARSER-COORD-01 уже там от 03.05.2026; DEC-PARSER-UNIFY-01..03 — кандидаты, сейчас только в commit message Parser-Unification, перенос отложен до следующей milestone-сессии). Ниже — sprint-level outputs.

### M-B.3 SequenceView interaction extensions (sprint-level, DEC-SV-01..04)

**[2026-05-04] DEC-SV-01 — Caret synchronization across LinearFeatureBar и SequenceView через single state.** Один `cursorPos` в SingleInspector управляет LinearFeatureBar cursor + SequenceView caret одновременно. Каждая SequenceLine самостоятельно проверяет попадает ли caretPos в её диапазон и рисует 1.5 px оранжевую вертикальную полоску на левом крае колонки нуклеотида во всю высоту строки; линии вне диапазона полностью пропускают рендер (no perf cost). Клавиатурная навигация: ←/→ ±1 nt, ↑/↓ ±charsPerLine, Home/End границы строки, PageUp/PageDown ±10 строк; clamps в [0, seqLength-1], push в onCaretChange → mirrors в cursorPos + emits `{instant:true}` pendingScroll (smooth не успевает за зажатой стрелкой). **Применимость:** все surfaces где есть navigation overview + detail view (Container Window M-D map↔sequence, Mix Workspace M-E component overview↔detail). **Кандидат на ⚓** если паттерн повторится в M-D без модификаций.

**[2026-05-04] DEC-SV-02 — `scrollIntoView({block:'center'})` вместо `containerRef.scrollTop = offset` когда контейнер в foreign overflow.** SequenceView containerRef в M-B.3 не overflow-ит сам по себе — overflow живёт у родительского `importer-single-tab-content`. Прямая запись `root.scrollTop = offset` игнорировалась — биолог видел курсор на колбасе но viewer не двигался. **Fix:** `target.scrollIntoView({block:'center', behavior})` — находит ближайшего скроллируемого предка автоматически. **Применимость:** все nested fullscreen layouts где компонент не управляет своим viewport'ом (Container Window M-D, Mix Workspace M-E с inline plasmid views). **Кандидат на ⚓** — universal pattern, ловушка будет повторяться в любом нестед fullscreen.

**[2026-05-04] DEC-SV-03 — Drag-scrubber на LinearFeatureBar как interaction pattern.** PointerDown стартует drag, pointermove живо двигает курсор + scroll'ит viewer instant'ом, pointerup финализирует smooth-scroll'ом. `setPointerCapture` держит drag живым когда указатель ушёл за SVG. `touchAction:'none'` запрещает браузеру забирать жест на native scroll/zoom. `scrollToPosition` принимает `{ behavior }` opts через всю цепочку (drag-scrub → 'auto' instant, settle → 'smooth'). SingleInspector разделил callbacks: `onBarSettle` (smooth, может переключить таб) vs `onBarScrub` (instant, не переключает таб посреди drag'а). **Применимость:** Racetrack timeline в M-E, DAG-overview scrubber в M-I, любые navigation bar'ы в проекте.

**[2026-05-04] DEC-SV-04 — Selection context menu с tri-modal copy.** ContextMenu на selection с тремя опциями: «Копировать (прямая цепь) Ctrl+C» / «Копировать обратную цепь Ctrl+Alt+C» / «Копировать аминокислоты Ctrl+Shift+C». Selection highlight (бледно-розовый с прозрачным fill) корректно работает над forward+reverse strands в reverse-strand context (numbers count down 249→200, AA-track перевёрнут, CDS region перевёрнут). selection.start/end остаются в forward sequence coords — visual orientation separate. Selection и caret coexist как separate states (можно иметь selection и двигать caret стрелками). Tri-modal copy — каркас под будущие selection-actions: «Создать праймер из выделения», «Аннотировать как...», «Перевести в AA с frame...», «Найти ферменты в выделении». **Применимость:** все sequence views в M-D Container Window + M-E Mix Workspace component sequence preview.

### Origin location reverse (sprint-level, DEC-MB-03 supersedes DEC-MB-02)

**[2026-05-04] DEC-MB-03 — Origin-rotate возвращён в MetaColumn (supersedes DEC-MB-02 от 02.05.2026).** В Sprint M-B FINAL (DEC-MB-02) origin-offset input + apply + intergenic-hints были перенесены из MetaColumn в SequenceTab toolbar (логика: «выбор точки начала доступен только на сиквенс вью где видны номера»). После rewrite SequenceView в M-B.3 SequenceTab стал чисто viewer-only — origin контролы семантически в правом sidebar'е возле топологии и intergenic information. Биолог в сессии 04.05: «Origin/межгенные участки/применить переехали в MetaColumn под Topology. SequenceTab теперь чисто viewer-only». MetaColumn получил обратно: Origin Card, originOffset state, useEffect reset, onApplyOrigin handler, computeIntergenicHints импорт. SequenceTab потерял те же. Control рендерится при `topology === 'circular'`. Тесты: `meta-column.test.jsx::origin block for circular`, `sequence-tab-origin.test.jsx::regression guard "in-tab панель не должна вернуться"`.

---

## Sprint M-B FINAL — Importer rework + post-acceptance polish + Catalog tree rewrite (02.05.2026, v0.7.0)

Финализация в одной сессии после Code one-shot M-B.1 + M-B.2 + 3 round'а post-acceptance polish (Игорь напрямую с Code) + v0.7.0 catalog tree rewrite. ⚓ fundamentals (DEC-IMP-15 lazy-mount tabs, DEC-DS-02 palette A+v2 + canonical-key, DEC-CAT-04 folder-as-slash-path) — в `ANCHORS.md`. Ниже — sprint-level outputs цикла.

### Importer (sprint-level, DEC-IMP-13..14, DEC-IMP-16..18)

**[2026-05-02] DEC-IMP-13 — Single-screen 4-column layout заменил Step1→Step2 двухэкранный flow.** `[CatalogColumn 320px] [Inspector flex] [MetaColumn 200px]` + footer (`SessionSummary` + `ActionsBar`). Биолог за полгода работы с v0.5 ImportStartScreen привык к single-screen паттерну; M-B.1 двухэкранный flow расходился с ожиданием. Inspector внутри несёт TabBar — Обзор / Последовательность / Аннотации / История (conditional при commits.length>0, в M-B.2 always false). Step semantic (`step`/`goNext`/`goBack`) выпилен из `useImporterState`; добавлены `activeTab` + `activeSource` (CatalogColumn drill-down state, выпилен в v0.7.0 при no-drilldown rewrite — см. DEC-CAT-01).

**[2026-05-02] DEC-IMP-14 — CatalogColumn — универсальный entry для 4 источников (Этот проект / Учебные / Моя библиотека / SnapGene catalog).** Все 4 источника рендерятся как однотипные узлы collapsible-tree с одним `onSelectItem` handler. Drop zone + paste textarea — в углу той же колонки, не отдельный screen. Sticky search input наверху с length-pattern (`>5kb` / `<2k` / `2k-3k`). MAX_CATALOG_LENGTH=20000 фильтр для SnapGene catalog. Lazy fetch SnapGene categories через `catalog-cache.js` (module-level cache, идентично v0.5 `prefetchAllCategories` + `fetchCategory`). v0.5 ImportStartScreen catalog parts pattern портирован с переписью под v0.6 store (`selectVisibleLibraryEntries` для «Моя библиотека», `currentProject.containerIds` для «Этот проект»).

**[2026-05-02] DEC-IMP-16 — Edit annotations через `perFileEdits[fn].editedAnnotations`, без commits[] в M-B.2.** Pending-state модель из M-B.1 K5 переиспользуется. При переключении файлов в multi-mode edits сохранены per-fileName, не теряются. При Confirm: `entry.payload.annotations = editedAnnotations ?? enrichedCache ?? parsedAnnotations`. Diff visualizer не делается. `editedTags` и `editedName` добавлены параллельно (Code-добавление сверх спеки, принято — для inline rename + multi-row rename + TagsEditor inline). **Future:** когда commits[] на molecule станут first-class в M-D Container Window, pre-commit edits импортёра станут initial commits на baseSnapshot — апгрейд contract'а LibraryEntry без breaking changes (текущее `entry.commits` либо undefined либо []).

**[2026-05-02] DEC-IMP-17 — SessionSummary footer как accumulating list (как v0.5).** Каждое action (Канвас / Библиотека / +N регионов / Заменён / Уже добавлено) добавляет entry в `state.addedItems[]`. Висит между MetaColumn'ом и ActionsBar'ом, видно всю сессию импорта. Replaces toast-only feedback из M-B.1 (toast ушёл — биолог забыл). `appendSessionEntry(prev, entry)` дедуплицирует annotate-action на same name с zero deltaRegions — копия v0.5 `session-log.js`.

**[2026-05-02] DEC-IMP-18 — MoleculeWorkspace компонент keep для M-D Container Window, НЕ импортируется в M-B.2 Importer.** Файлы `MoleculeWorkspace/{index,LeftPane,RightPane}.jsx` остаются в репо; контракт DEC-IMP-12 ⚓ (props без mode-prop, layout-only) валиден для будущего Container Window. M-B.2 Inspector нативно рендерит PlasmidMiniMap / SequenceMapView / AnnotationEditor по lazy-mount табам — табы Importer-specific UX, Container Window M-D будет другой layout. TD-MOLECULEWORKSPACE-M-D отслеживает компонент.

### Catalog tree (sprint-level, DEC-CAT-01..03; DEC-CAT-04 ⚓ в ANCHORS.md)

**[2026-05-02] DEC-CAT-01 — No drilldown — все группы collapsible-tree inline.** Изначально CatalogColumn в M-B.2 имел drill-down режим (`activeSource={kind, value}` с «← Назад» header'ом, как v0.5 ImportStartScreen). v0.7.0 round выкинул drill-down: все группы (Mine / Canvas / Demo / SnapGene + nested subgroups + folders) — collapsible dropdown'ы inline, на одном scroll'е. Items внутри каждой подгруппы — полный список, без «Показать все/меньше» пагинации. Order top-level: **Моя библиотека первой** (по запросу биолога), далее «Этот проект», «Учебные / demo», SnapGene catalog. Lazy fetch SnapGene категорий — на первое раскрытие.

**[2026-05-02] DEC-CAT-02 — Per-depth translucent accent tint для visual hierarchy.** `depthBackground(d) = 2.5%·d`, max 8% — banded визуальная иерархия для nested folder уровней. Через CSS variable `--depth-bg` (не inline-style), чтобы `:hover` не блокировался. `indentForDepth(d) = 12 + d*12`, capped at 72 px. `CHEVRON_GUTTER = 16` добавлен к items чтобы text лёг под parent text column. Без depth-tint биолог теряется в глубоком дереве (`Backbones/Pichia/AOX1/derivatives/`).

**[2026-05-02] DEC-CAT-03 — File-manager hover-icons (＋ создать папку / ⤓ импорт файла) на header'е каждой top-level группы и каждой папки.** Visible at opacity 0.5 (не hover-only — биолог пропускал hidden), opacity 1 на row hover. Эмодзи `📥` → Unicode `⤓` (DOWNWARDS ARROW TO BAR, согласуется с символами проекта ▾ ▸ ＋ ‹ ⋯ ↻). Drop file на section header «Моя библиотека» → импорт в root; drop на folder row → импорт с folder-path в `editedTags`. **Folder/file creation Mine-only** — Canvas/Demo/SnapGene GroupHeader без `onAddChild` (биолог: «запрети создавать папки и файлы внутри SnapGene демо и прочих кроме библиотеки»). `renderFolderNodes` гейтит actions через `isMine && !isUntagged`.

### Auto-annotate cleanup (sprint-level, DEC-AA-01)

**[2026-05-02] DEC-AA-01 — Auto-annotate radically scoped down («не надо НАСТОЛЬКО МНОГО»).** Удалены детекторы шума из `auto-annotate.js`: **linker detection** в `annotateCDS` (производил 25+ «Linker N» на каждой плазмиде); **promoter sub-features** (-10 element / -35 element / RBS / TATA box / CAAT box) — `annotatePromoter()` целиком; **terminator sub-features** (Poly-A signal) — `annotateTerminator()` целиком; **signal_peptide + propeptide** в CDS auto-flow — биолог: «отдельно при нажатии на CDS можно выбрать через сигнал IP» (отложено в TD-PER-CDS-SIGNALIP). Все типы (`linker`, `core_promoter`, `regulatory`, `polyA_signal`, `signal_peptide`, `propeptide`) **остались** в `TYPE_GROUPS` + палитре — пользователь добавляет вручную через AnnotationEditor. Unused helpers (`findConsensus`, `isProkaryote`, `PROKARYOTE_KEYWORDS`) удалены. **Auto-annotate UI moved** из ActionsBar overflow ⋯ в AnnotationsTab toolbar (биолог: «явно вынести на вкладку аннотаций»). Manual-trigger button сейчас disabled stub под per-CDS SignalIP next iteration; checkbox («авто-аннотация при импорте») рабочий.

### Library wipe + Importer surface как single entry (sprint-level, DEC-MB-01..02)

**[2026-05-02] DEC-MB-01 — Library fullscreen window удалён, browse function переехала в Importer CatalogColumn → группа «Моя библиотека».** `components/Library/` (4 файла + `Library.test.jsx`) wiped. `librarySlice` data API сохранён без изменений (M-A.3 контракт). Tag-editing — только при импорте через TagsEditor inline в SingleInspector (пишет в `perFileEdits.editedTags` → Confirm flow промотит в `entry.tags`). Soft-delete пользовательских entries отложен в M-D Container Window. StartScreen `Library` SidebarLink — opens Importer с target=library + full catalog visible. **Обоснование:** при flat tagging (DEC-LIB-09) и одном источнике browse (Importer CatalogColumn) отдельный fullscreen Library дублирует UI без выгод; биолог получает «open library» behaviour через Importer'ный path. M-A.3 группы D/E/F/H tests удалены вместе с фуллскрином, coverage data API остался в integration-тестах Importer.

**[2026-05-02] DEC-MB-02 — Origin-rotate переехал из MetaColumn на SequenceTab.** Биолог: «выбор точки начала для плазмид должен быть доступен только на сиквенс вью, где можно тыкнуть на нуклеотид (там хоть номера видны)». Origin-offset input + apply + intergenic-hints перенесены из правого sidebar (`MetaColumn`) в верхний toolbar `SequenceTab` — над `SequenceMapView`, где видны позиции. MetaColumn потерял: origin Card, `originOffset` state, `useEffect` reset, `onApplyOrigin`, импорт `computeIntergenicHints`. Топология toggle + length / info / IUPAC / description / organism / source остались в MetaColumn. SequenceTab принимает новые props `fileKey` + `onUpdateEdits`, рендерит control только при `topology === 'circular'`.

---

## (Старше 2 спринтов — в archive)

Решения спринтов v0.5.x и v0.6.0 (DEC-MA-01..04), Sprint M-A.1 (DEC-MA1-01..04), Sprint M-A.2 FINAL (DEC-MA2-02) живут в `ANCHORS.md` sprint-блоках и `docs/archive/DECISIONS_2026_Q2.md`. Исторический журнал по версиям — в `RELEASES.md`.
