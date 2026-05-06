# CURRENT_TASK.md

## Sprint M-X.5 Library as Primary Workspace — Этап 1 закрыт (07.05.2026)

**Статус:** 🟢 Этап 0 (v0.7.4 финализация) + Этап 1 (v0.7.5 refactor) закрыты в один день в auto-mode. Готов к визуальной приёмке Этапа 1 биологом перед стартом Этапа 2 (v0.8.0 features).
**Спека:** `docs/SPRINT_M-X.5_LIBRARY_AS_WORKSPACE.md` (~74 KB, тип A архитектурный).
**План:** `~/.claude/plans/delightful-hugging-backus.md` (incremental rollout).
**Базовый коммит:** `7bbca01` (HEAD `feature/sequence-view-feature-strip` после round-18 ghost-edit fix).
**Ветка после Этапа 0:** `feature/library-as-workspace` от чистого `main` с тэгом `v0.7.4`.
**Целевые версии:** v0.7.5 (Этап 1, refactor) → v0.8.0 (Этап 2, features, major bump).

---

## TL;DR

Биолог 06.05.2026: «Importer как отдельный fullscreen раздражает. Library = primary workspace. Manual edit sequence — это новая ветка. Annotations правятся явно (перезаписать / версия). Onboarding — нэдж banner.»

**M-X.5 supersede 8 ⚓:**
- DEC-IMP-01..05 → **DEC-IMP-06 ⚓** (Importer fullscreen abolished, Library = primary workspace).
- DEC-LIB-05 → **DEC-LIB-12 ⚓** (sequence mutable через manual-edit branching).
- DEC-LIB-06 расширяется **DEC-LIB-13 ⚓** (annotations через explicit save flow).
- + Новые **DEC-LIB-14..17 ⚓** (edit parity, targets, read-only-by-default, onboarding nudge).

**Q1-Q5 закрыты в плане:** hybrid catalog (выбранные онбордингом → IndexedDB); heuristic origin migration (demo-tag → demo_category, иначе file_import); manual-edit confirm scope per-mount; default version name `${parent.name} (v2)` через autoname collision; soft-deleted parent → hard fail с toast.

---

## 2 этапа реализации

### Этап 0 — Финализация v0.7.4 ✅ (06–07.05.2026)

- [x] RELEASES.md новый блок v0.7.4 (rounds 12–18)
- [x] PROJECT_STATE.md snapshot → v0.7.4
- [x] DECISIONS.md sprint-level блок
- [x] CURRENT_TASK.md reset
- [x] package.json + lib/version.js → 0.7.4
- [x] vitest + vite build verification
- [x] commit `2fbc44c` финализации
- [x] git tag v0.7.4 на финальный коммит
- [x] git checkout -b feature/library-as-workspace от того же коммита (main устарел на 384 коммита, поэтому ветка от v0.7.4 commit, не от main)

### Этап 1 — Refactor v0.7.5 ✅ (07.05.2026)

Pure refactor. Library рендерится как старый Importer. Закрыли hard violation CatalogColumn 64KB. Tests 1461/1461.

- [x] **Hot-fix** — TD-LIBRARY-WRITE-API write-through (commit `53db4e1`). Биолог: «после сохранения и обновления страницы, аннотация не сохраняется». `librarySlice.writeLibraryEntryAnnotations` + `useLibraryState.updateEdits` write-through для Mine entries.
- [x] **K1** — Library namespace skeleton + migration (commit `24b8919`). git mv Importer→Library 45 файлов с history; internal renames SingleInspector→LibrarySingleInspector, MetaColumn→LibraryMetaColumn, importer-state→useLibraryState, use-catalog-sources→useLibrarySources; origin migration heuristic в hydrateLibrary; +3 unit tests.
- [x] **K2** — Минимальный route alias 'library' для 'importer' (commit `1ea48f7`). Удаление dead-code (MultiInspector/EmptyInspector/ActionsBar/SessionSummary) deferred в Этап 2 (с K4/K5/K7 заменами).
- [x] **K3** — LibraryTree decomposition (commit `fcf2aa3`). 5 файлов: library-folder-tree.js (3.5KB) + LibraryGroupHeader (6KB) + LibraryNestedSubGroup (10.8KB) + LibraryItemRow (9KB) + LibraryTree.jsx (38KB soft warning, под hard 40KB).
- [x] **K9 stub** — Multi-drop disable с toast (commit `240aa32`). Single→state.addFiles unchanged. Multi→toast «Multi-import будет в v0.8.0». Реальная MultiImportView в K4 Этап 2.
- [x] Bump 0.7.4 → 0.7.5, RELEASES.md блок, PROJECT_STATE.md/DECISIONS.md updates, tag v0.7.5.

**Визуальная приёмка Этапа 1 (биологу):** Library должна выглядеть как старый Importer kроме переименования заголовка «Импорт» → «Library» в Topbar (роут `library` теперь обработан в App.jsx). Multi-drop теперь даёт toast вместо открытия MultiInspector. Single-file drop / paste / catalog click — без изменений. Annotation save — теперь персистентен после refresh (hot-fix).

### Этап 2 — Features v0.8.0 (K4-K8 + K10-K11 + K12)

Фундаментальные изменения UX и data model.

- [ ] **K4** — MultiImportView (drag-drop N>1 → таблица per-file annotation choice + folder selection + soft-warning при >20 файлов). ~2-3 дня.
- [ ] **K5** — Onboarding nudge + curated 7 категорий (basic_cloning, pET&Duet, mammalian, yeast, crispr, plant, fluorescent). Tags: `['demo', 'demo:<slug>', categoryLabel]` + folder `Demo / categoryLabel`. ~2 дня.
- [ ] **K6** — Read-only/Editable toggle для SequenceView (DEC-LIB-16 ⚓). ~2-3 дня.
- [ ] **K7** — Library Save Flow (Перезаписать / Сохранить как версию, DEC-LIB-13 ⚓). ~1 день.
- [ ] **K8** — Quick-add icon hover-revealed (только при active project). ~1 день.
- [ ] **K10** — Manual edit branching (DEC-LIB-12 ⚓ + Q5 hard-fail на soft-deleted parent). ~2 дня.
- [ ] **K11** — Visual origin icons в Library tree. ~30 мин.
- [ ] **K12** — Final size check + 8 acceptance scenarios S1-S8.
- [ ] Bump 0.7.5 → 0.8.0, ⚓ promote в ANCHORS.md, archive spec.

---

## После каждого K-шага

```bash
cd gui/designer && npx vitest run && npx vite build
```

Если ≥3 existing tests неожиданно ломаются — стоп, разбираемся с биологом.

---

## STOP-условия

- **K1**: git mv ломает test snapshots → стоп.
- **K2**: live usage `'importer'` в DAG triggers либо deeplink → стоп.
- **K3**: декомпозиция требует менять existing tests (regression) → стоп.
- **K6**: SequenceView keyboard hook ломает existing keyboard nav → стоп.
- **K10**: manual-edit branching не очищает edits после switch → стоп.

---

## После Этапа 2 (v0.8.0)

8 acceptance scenarios S1-S8 (см. план §K12 / спека §6). Каждый — manual run в dev + screenshot для приёмки биологом. Если все PASS → ⚓ promotion в ANCHORS.md (DEC-IMP-06, DEC-LIB-12..17), archive `docs/SPRINT_M-X.5_LIBRARY_AS_WORKSPACE.md` со штампом ✅, ARCHITECTURE_v2.md → v1.3 changelog (rewrite §2.7 Library, удалить §3.5 Importer).

---

## Pre-K1 quick check (для биолога перед стартом K1)

В dev console:
```js
const entries = Object.values(useStore.getState().libraryEntries);
console.table(entries.map(e => ({ id: e.id, name: e.name, tags: e.tags?.join(',') || '<none>' })));
```
Если у demo entries есть tag `demo:` префикс — heuristic migration их матчнёт корректно. Если нет — поставит `file_import` как fallback (loss of provenance, но не блокатор).

---

## Финализатор

Этап 0 (финализация v0.7.4) — Claude (auto mode после approved plan).
Этап 1 → Этап 2 — Code в обычном цикле с приёмкой биологом между этапами.
