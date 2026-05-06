# CURRENT_TASK.md

## Sprint M-X.5 Library as Primary Workspace — kickoff approved (07.05.2026)

**Статус:** 🟢 План apply'нут, Этап 0 (финализация v0.7.4) в работе, дальше Этап 1 (v0.7.5 refactor).
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

### Этап 0 — Финализация v0.7.4 (в работе)

- [x] RELEASES.md новый блок v0.7.4 (rounds 12–18)
- [x] PROJECT_STATE.md snapshot → v0.7.4
- [x] DECISIONS.md sprint-level блок (DEC-WRAPTAIL-04..05, DEC-LAYOUT-PAINT-ONLY-01, DEC-COMMON-FEATURES-DEDUP-01, DEC-ANN-LOCATE-01, DEC-LINEAR-BAR-EMPTY-01, DEC-FEATURE-GHOST-EDIT-01)
- [x] CURRENT_TASK.md reset (этот файл)
- [ ] package.json + lib/version.js → 0.7.4
- [ ] vitest + vite build verification
- [ ] commit финализации
- [ ] git tag -a v0.7.4 на финальный коммит
- [ ] merge `feature/sequence-view-feature-strip` → main (либо PR через GitHub)
- [ ] git checkout -b feature/library-as-workspace от main

### Этап 1 — Refactor v0.7.5 (K1-K3 + K9)

Pure refactor. Library рендерится как старый Importer. Цель — закрыть hard violation (CatalogColumn 64 KB → 6 файлов ≤ 30 KB) + namespace для Этапа 2.

- [ ] **K1** — Library namespace skeleton + migration. `git mv` Importer→Library (~30-50 файлов), update imports, migration в `hydrateLibrary` (heuristic deriveOriginForExisting). ~3-4ч.
- [ ] **K2** — Удалить Importer fullscreen + dead code (MultiInspector, EmptyInspector, ActionsBar, SessionSummary). App.jsx routing 'importer' → 'library'. ~2-3ч.
- [ ] **K3** — LibraryTree decomposition (CatalogColumn 64KB → LibraryTree.jsx ≤30KB + LibraryGroupHeader/LibraryNestedSubGroup/LibraryItemRow/LibraryItemRow.live/LibraryFolderTree.js/LibraryDropZone). Pure refactoring, no logic change. ~1-2 дня.
- [ ] **K9 (Этап 1 заглушка)** — Drag-drop routing: single → PreImportModal (unchanged), multi (>1 file) → toast «Multi-import будет в v0.8.0». Большой paste остаётся single через PreImportModal. ~0.5 дня.
- [ ] Bump 0.7.4 → 0.7.5, tag, RELEASES.md блок, visual acceptance биологом.

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
