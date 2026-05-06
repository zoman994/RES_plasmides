# CURRENT_TASK.md

## Sprint M-X.5 Library as Primary Workspace — закрыт (07.05.2026)

**Статус:** ✅ v0.8.0 финализирован. Этап 1 (v0.7.5 refactor) + Этап 2 (v0.8.0 features) закрыты в один день в auto-mode.

**Спека:** `docs/archive/SPRINT_M-X.5_LIBRARY_AS_WORKSPACE.md` (✅ archived).
**План:** `~/.claude/plans/delightful-hugging-backus.md` (apply'нут).
**Ветка:** `feature/library-as-workspace` (от чистого `v0.7.4` тэга).
**Тэги:** `v0.7.4` → `v0.7.5` → `v0.8.0`.

---

## Что вошло в v0.8.0 (Этап 2 features)

- **K11 Visual origin icons** — Unicode glyphs в LibraryItemRow per `entry.origin.kind` (📋 paste / 📚 demo / ✎ manual_edit / ⎘ version / no icon for file_import).
- **K7 Library Save Flow** — две явные кнопки `[Перезаписать]` (overwrite + version bump) и `[Сохранить как версию]` (copy-on-write с parent reference). DEC-LIB-13 ⚓.
- **K6 Read-only/Editable toggle** — pill в title row становится button с amber accent + pulsing dot для EDITABLE. DEC-LIB-16 ⚓.
- **K10 Manual edit branching** — `createManualEditBranch` slice action + `useManualEditDetection` window-keydown hook + `ManualEditConfirmModal`. DEC-LIB-12 ⚓. Q5 plan guard: parent.pendingDelete → hard-fail.
- **K5 Onboarding** — `OnboardingNudge` banner + `CategoryPickerModal` с 7 curated категориями (basic_cloning, pET&Duet, mammalian, yeast, crispr, plant, fluorescent) + `loadOnboardingPlasmids` action. DEC-LIB-17 ⚓.
- **K8 Quick-add icon** — hover-revealed `➤` button в Mine entries при active project. DEC-LIB-QUICKADD-01.
- **K4 MultiImportView** — in-place table per-file annotation choice + folder selector + soft cap warning при >20 files + `commitMultiImport` slice action. DEC-LIB-MULTI-01..03.

## Что ушло в v0.7.5 (Этап 1 refactor)

- Hot-fix annotation write-through safety-net.
- K1 namespace skeleton (Importer/ → Library/ + 45 файлов с history) + migration heuristic.
- K2 'library' route alias для 'importer'.
- K3 LibraryTree decomposition (CatalogColumn 64KB → 5 sub-files; LibraryTree.jsx 38KB soft).
- K9 single-vs-multi drag-drop gate stub.

---

## ⚓ promoted в ANCHORS.md (7 новых)

- **DEC-IMP-06 ⚓** — Importer fullscreen abolished, Library = primary workspace (supersedes DEC-IMP-01..05).
- **DEC-LIB-12 ⚓** — Sequence mutable через manual-edit branching (supersedes DEC-LIB-05).
- **DEC-LIB-13 ⚓** — Annotations mutable через explicit save flow (extends DEC-LIB-06).
- **DEC-LIB-14 ⚓** — Edit parity SequenceView ↔ Annotator.
- **DEC-LIB-15 ⚓** — Import targets — Library only / Library + project.
- **DEC-LIB-16 ⚓** — Read-only по умолчанию для sequence editing.
- **DEC-LIB-17 ⚓** — Onboarding through nudge, not modal.

Total ⚓ fundamental в ANCHORS.md: **59** (52 → 53 после DEC-PARSER-COORD-01 → 59 после M-X.5).

---

## Deferred в M-X.6 cleanup

- **TD-LIB-K2-DEAD-CODE-PURGE** — удалить MultiInspector/EmptyInspector/ActionsBar/SessionSummary + flip 'importer' callsites на 'library' (Topbar, StartScreen, canvasSlice FULLSCREENS, ~15 test fixtures). К2 deferred потому что aggressive purge во время Этап 2 user-facing rollout создал бы broken intermediate UX.
- **TD-LIB-K10-CHARACTER-APPLY** — Реальное character-level editing в SequenceView (`useSequenceKeyboard.js` extension). Сейчас manual-edit branch identical к parent, biolog mutates annotations через FeatureEditorModal.
- **TD-LIB-K4-VIEW-PREVIEW** — Per-file PlasmidMiniMap preview button в multi-import row. План spec, skipped в K4 minimal.
- **TD-LIB-K4-AUTO-TRIGGER** — `ext.annotationChoice === 'auto'` должен auto-run L1 при first open в LibrarySingleInspector. Сейчас metadata recorded но не acted on (defacto auto через AnnotationsTab embedded Annotator).

---

## 8 acceptance scenarios (S1-S8 из спеки §6) — pending визуальной приёмки

S1 First launch onboarding · S2 Multi-file import · S3 Single-file edit + Save as version · S4 Single-file edit + Overwrite · S5 Manual edit branching · S6 Quick-add to project · S7 Multi-import с mixed annotation choice · S8 Read-only / Editable transition с unsaved changes.

Все 8 функционально доступны для приёмки. M-X.6 cleanup до приёмки **не блокирует**.

---

## Pre-acceptance quick check

Перезапусти `npm run dev:front`. Открой Library:
1. **S1:** wipe IndexedDB (DevTools → Application → Clear) → reload → видишь OnboardingNudge banner → «Выбрать категории» → modal с 7 категориями → выбери одну → entries в Demo / [категория].
2. **S2:** drop 3 файлов → MultiImportView в place of catalog → checkbox per file + annotation choice + folder → «Готово» → entries в библиотеке.
3. **S3+S4:** click на Mine entry → SingleInspector → редактируй аннотации → две кнопки `[Перезаписать]` / `[Сохранить как версию]` появились → пощупай оба сценария.
4. **S5:** click на READ-ONLY pill → EDITABLE с amber accent + pulsing dot → нажми любую DNA букву → ManualEditConfirmModal → confirm → новая entry «{name} (manual edit)» в Library tree с ✎ icon.
5. **S6:** open Project → DAG toolbar «+ Из библиотеки» (либо Topbar Library link) → hover на Mine entry → видишь `➤` icon → click → toast «Добавлен в проект» → возврат на DAG.
6. **S8:** EDITABLE → press char → Cancel → сохраняется EDITABLE (не reverts).

---

## Финализатор

Этап 0 (v0.7.4) + Этап 1 (v0.7.5) + Этап 2 (v0.8.0) — Claude (auto-mode после approval плана 07.05.2026).

## Следующий цикл — биолог решает

После визуальной приёмки v0.8.0 (PASS / FAIL):

**При PASS:** биолог выбирает next sprint:
1. **M-X.6 polish** — закрыть deferred TDs (K2 dead-code purge, K10 character-level apply, K4 view preview, AnnotationTrack 41.6KB decomposition).
2. **M-C Container Window kickoff** — следующий milestone по Roadmap. Использует SequenceView (B.3) + caret sync + scrollIntoView pattern + wrap-tail.
3. **TD-CIRCULAR-SELECTION** — полноценная wrap-aware navigation.
4. **NCBI GenBank integration** (TD-OPEN-PLASMID-REPOS).

**При FAIL:** mini-sprint с fix list — биолог формулирует что не так, Claude правит, повторная приёмка.
