# CURRENT_TASK.md

## Sprint M-X.6 Mini-cleanup — активен

**Статус:** 🟡 Спека готова, ожидает Code  
**Спека:** `docs/SPRINT_M-X.6_MINI_CLEANUP.md` (~21 KB)  
**Версия после финализации:** **v0.8.1**  
**Ветка:** продолжать на `feature/library-as-workspace` либо новая `feature/m-x-6-cleanup` (Code решает).

---

## TL;DR

Mini-cleanup поверх v0.8.0:
- **K0 (тип A)** — LibrarySingleInspector 45.94 KB → ≤28 KB (extract 3 hooks + опц. TitleRow).
- **K1 (тип C)** — удалить 4 dead-файла + flip 'importer' literal → 'library' + remove route alias.
- **K2 (тип B)** — character-level apply в SequenceView (insert/Backspace/Delete с indel-aware annotation shift). Закрывает S5 acceptance fail.
- **K3 (тип C, companion к K2)** — circular keyboard nav через origin (Shift+Arrow / Home / End / PageUp/Down).
- **K12 (тип C/D)** — 4 cosmetic polish: PreImportModal location, catalog/ rename, K4 view preview, K4 auto-trigger.
- **Финал v0.8.1** — version bump после визуальной приёмки (включая 5e468a8 + c17899f hotfix-ы).

---

## Порядок чтения перед началом

1. `docs/SPRINT_M-X.6_MINI_CLEANUP.md` — спека (целиком).
2. `TECH_DEBT.md` секции «M-X.5 entries» + «M-X.2-fix entries» — контекст deferred items.
3. Целевые файлы для K0:
   - `gui/designer/src/components/Library/inspector/LibrarySingleInspector.jsx` (45.94 KB).
   - Существующие hooks-аналоги для pattern: `Library/inspector/hooks/{useIdlePrewarm,useAnnotationUndoRedo,useFeatureEditorFlow}.js`.
4. Целевые файлы для K2/K3:
   - `gui/designer/src/components/SequenceView/hooks/useSequenceKeyboard.js` (5.59 KB).
   - `gui/designer/src/components/Library/inspector/ManualEditConfirmModal.jsx` (3.95 KB).
   - `gui/designer/src/store/librarySlice.js` (28.34 KB) — `createManualEditBranch` action.
   - `gui/designer/src/components/Library/hooks/useManualEditDetection.js`.

---

## Чеклист

### K0 — LibrarySingleInspector decomp (тип A)

- [ ] Создать `Library/inspector/hooks/useLibrarySaveFlow.js` (~3-4 KB) — K7 wiring.
- [ ] Создать `Library/inspector/hooks/useEditableModeToggle.js` (~1.5-2 KB) — K6 state.
- [ ] Создать `Library/inspector/hooks/useManualEditBranching.js` (~3-4 KB) — K10 wiring + useManualEditDetection.
- [ ] Опционально (если main >28 KB после 3 hooks): `Library/inspector/LibraryInspectorTitleRow.jsx` (~6-8 KB).
- [ ] Edit `LibrarySingleInspector.jsx` → import hooks, удалить inline state/handlers/effects, landing ≤28 KB.
- [ ] Тесты:
  - [ ] `__tests__/use-library-save-flow.test.js` — ~6 unit.
  - [ ] `__tests__/use-editable-mode-toggle.test.js` — ~4 unit.
  - [ ] `__tests__/use-manual-edit-branching.test.js` — ~6 unit.
  - [ ] (если 4-й extract) `LibraryInspectorTitleRow.test.jsx` — ~3 unit.
- [ ] Existing `LibrarySingleInspector.test.jsx` pass без изменений API.

### K1 — Dead-code purge (тип C)

- [ ] Pre-K1: `grep -rn "'importer'" gui/designer/src --include="*.jsx" --include="*.js"`. Классифицировать каждое попадание.
- [ ] Удалить файлы: `MultiInspector.jsx`, `EmptyInspector.jsx`, `ActionsBar.jsx`, `SessionSummary.jsx` + соответствующие тесты.
- [ ] Удалить импорты этих файлов в `Library/index.jsx`.
- [ ] `App.jsx` — удалить `case 'importer':` line + comment block.
- [ ] `store/canvasSlice.js` — удалить `'importer'` из FULLSCREENS array.
- [ ] `AppShell/Topbar.jsx` — `isImporter` → `isLibrary`; `pushFullscreen({ fullscreen: 'importer', ... })` → `'library'`.
- [ ] `StartScreen/index.jsx` — `pushFullscreen({ fullscreen: 'importer', payload: { target: 'library' } })` → `'library'`.
- [ ] Test fixtures (~15) — grep-replace `'importer'` где fullscreen literal. Не трогать payload values.
- [ ] Regression тесты:
  - [ ] `App.test.jsx` либо `App-routes.test.jsx` — pushFullscreen('importer') no-op.
  - [ ] `canvasSlice.test.js` — FULLSCREENS не содержит 'importer'.
- [ ] Финальный grep `'importer'` (fullscreen literal) → 0 hits.

### K2 — Character apply (тип B)

- [ ] Edit `SequenceView/hooks/useSequenceKeyboard.js` — новые props `editable`, `topology`, `onSequenceEdit?`. Emit op shape по DEC-MX6-02.
- [ ] Создать `Library/lib/library-sequence-edit.js` (~3 KB) — pure helper `applySequenceEditToEntry(entry, op)` с indel-aware annotation shift.
- [ ] Edit `store/librarySlice.js` — slice action `applySequenceEditOnLibraryEntry(id, op)` (~10 LOC, thin wrapper).
- [ ] Edit `SequenceView/index.jsx` — props threading `editable` / `topology` / `onSequenceEdit` через `useSequenceKeyboard`. **Если >40 KB → stop, mini-spec.**
- [ ] Edit `Library/inspector/tabs/SequenceTab.jsx` — props threading в SequenceView.
- [ ] Edit `LibrarySingleInspector.jsx` (после K0 в `useManualEditBranching` либо top-level) — composite handler `onSequenceEdit(op)`:
  - manual_edit branch → direct apply.
  - parent → буферизация op в pending state, после confirm OK → replay через applySequenceEditOnLibraryEntry.
- [ ] Тесты:
  - [ ] `useSequenceKeyboard.test.js` extension — ~10 unit (edit gate, insert/Backspace/Delete, selection-replace, Ctrl+IUPAC pass-through).
  - [ ] `library-sequence-edit.test.js` — ~8 unit (insert/delete shift, drop/clip, replace composition).
  - [ ] `librarySlice.test.js` extension — ~4 unit (happy + persist + pendingDelete + invalid op).
  - [ ] `LibrarySingleInspector.test.jsx` — ~3 integration (first keystroke replay в branch + subsequent direct apply).
- [ ] Acceptance: S5 working — biolog → EDITABLE → буква → modal → confirm → branch с буквой applied → subsequent keystroke direct.

### K3 — Circular keyboard nav (тип C, companion)

- [ ] Edit `SequenceView/hooks/useSequenceKeyboard.js` — accept `topology` prop, circular wrap-arithmetic при `topology === 'circular'`. Linear unchanged (regression guard).
- [ ] Edit caller (`SequenceView/index.jsx` если ещё не сделано в K2) — pass `topology` prop down chain.
- [ ] Тесты `useSequenceKeyboard.test.js` extension — ~7 unit (linear-no-wrap + 6 circular cases).
- [ ] Acceptance: Shift+ArrowRight в конце circular плазмиды — extends через origin как pointer-drag.

### K12 — Cosmetic polish (тип C/D)

- [ ] **K12.1** (D): move `Library/PreImportModal.jsx` → `Library/import/PreImportModal.jsx` + update imports (~5-7 callsites).
- [ ] **K12.2** (D): move `Library/catalog/{catalog-cache.js, length-pattern.js}` → `Library/lib/`. Remove empty catalog/ если осталась пустая.
- [ ] **K12.3** (C, TD-LIB-K4-VIEW-PREVIEW): eye-icon button в MultiImportView row → expand inline 180×180 PlasmidMiniMap. Reuse existing PlasmidMiniMap. Local `useState(null)` (single expanded row). ~30-50 LOC + 1 integration test.
- [ ] **K12.4** (C, TD-LIB-K4-AUTO-TRIGGER): useEffect в LibrarySingleInspector mount — если `entry.ext?.annotationChoice === 'auto'` && `!entry.ext?.autoRun?.done` → trigger L1 + mark autoRun.done. ~30 LOC + 2 unit tests.

### Финал v0.8.1 bump (только после визуальной приёмки)

- [ ] `gui/designer/package.json` version 0.8.0 → 0.8.1.
- [ ] `gui/designer/src/lib/version.js` APP_VERSION.
- [ ] `RELEASES.md` v0.8.1 блок (5e468a8 + c17899f + всё M-X.6).
- [ ] `PROJECT_STATE.md` snapshot update (версия / тесты / «Что работает»).
- [ ] `TECH_DEBT.md` close 8 entries:
  - TD-LIBRARYSINGLEINSPECTOR-DECOMP-V2 (K0).
  - TD-LIB-K2-DEAD-CODE-PURGE (K1).
  - TD-LIB-K10-CHARACTER-APPLY (K2).
  - TD-WRAP-KEYBOARD-NAV (K3).
  - TD-LIB-K4-VIEW-PREVIEW (K12.3).
  - TD-LIB-K4-AUTO-TRIGGER (K12.4).
  - TD-LIB-PREIMPORT-LOCATION (K12.1).
  - TD-LIB-CATALOG-RENAME (K12.2).
- [ ] `BUGS.md` — никаких ожидаемых OPEN добавлений (если что-то всплыло — записать).

---

## STOP-условие

**После K12.4 commit Code останавливается, ждёт визуальной приёмки.** Не финализирует PROJECT_STATE/RELEASES/TECH_DEBT/version bump до явного «финализируем v0.8.1» от биолога.

---

## Формат отчёта Code

В CURRENT_TASK.md в конце либо в чате:

- Коммит-хэши по K0 / K1 / K2 / K3 / K12.1-4 (минимум по одному на K-step; K2+K3 могут быть один коммит).
- Финальные счётчики Vitest + pytest.
- Build status.
- Размеры затронутых файлов:
  - LibrarySingleInspector.jsx после K0.
  - useSequenceKeyboard.js после K2+K3.
  - librarySlice.js после K2.
  - SequenceView/index.jsx после K2.
- **Отклонения от спеки** явным блоком (не «всё по спеке»).
- Список новых тестов с counts.
- Финальный grep `'importer'` (как fullscreen literal) — должен быть 0 hits.

---

## Что делать при регрессии

- Если K0 landing >28 KB после 3 hooks — добавить 4-й extract `<LibraryInspectorTitleRow>`. Если и это >28 → stop, репорт.
- Если K2 librarySlice >30 KB — stop, mini-spec на slice decomp (новый TD).
- Если K2 SequenceView/index >40 KB — stop, mini-spec на decomp (TD-SIZE-SEQUENCEVIEW-INDEX уже зафиксирован).
- Если K1 grep пропускает callsite — vitest catches; включить `grep 'importer' final: N hits, классификация» в отчёт.

---

## Открытые вопросы (биолог решает до старта Code либо параллельно)

См. спека §9. Default proposals:

1. Manual_edit branch — **ручное** переключение inspector (biolog нажимает на новую entry в Library tree после toast).
2. Circular Backspace-at-pos-0 — **wrap** (consistent с round-trip arithmetic).
3. `importerTarget` rename → `libraryTarget` — **keep** (rename отдельным cosmetic в M-X.7+).
4. K12.3 preview button — **только container kind**.

Биолог может оспорить любой default до старта Code.
