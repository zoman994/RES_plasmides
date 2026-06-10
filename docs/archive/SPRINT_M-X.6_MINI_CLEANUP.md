# Sprint M-X.6 — Mini-cleanup после v0.8.0

**Статус:** ⏸️ **ОТЛОЖЕН** (07.05.2026, после v0.8.0 acceptance: решение биолога — приоритет M-C Container Window. Cleanup может вернуться как M-X.7 polish после M-C/M-D acceptance, либо включаться частично в смежные спринты по принципу «трогаешь зону — декомпозируешь её первым пунктом» из ⚓ ANCHORS.md size-budget guidance.)  
**Тип:** mixed (K0 — A; K1 — C; K2 — B; K3 — C companion; K12 — C/D polish)  
**Целевая версия:** v0.8.1 (когда вернётся)  
**Источник:** drift check 07.05.2026 + M-X.5 deferred + M-X.5 K12 polish.

> **Что зафиксировано про deferred (07.05.2026):** Все 8 TD entries (TD-LIBRARYSINGLEINSPECTOR-DECOMP-V2, TD-LIB-K2-DEAD-CODE-PURGE, TD-LIB-K10-CHARACTER-APPLY, TD-WRAP-KEYBOARD-NAV, TD-LIB-K4-VIEW-PREVIEW, TD-LIB-K4-AUTO-TRIGGER, TD-LIB-PREIMPORT-LOCATION, TD-LIB-CATALOG-RENAME) остаются OPEN в TECH_DEBT.md. Hotfix-ы 07.05 (`5e468a8` bridge annotation, `c17899f` caret bridge wrap-half) лендят в RELEASES.md при ближайшем version bump (вероятно v0.9.0 после M-C). Hard violations LibrarySingleInspector 45.94 KB и AnnotationTrack 48.54 KB остаются как есть — не блокируют M-C (DAG canvas пишет в новый projectSlice, container window read-only reuse'ит SequenceView/AnnotationTrack без правок).

---

## §0. Срез размеров затрагиваемых модулей

| Файл | KB | Лимит | Статус |
|---|---|---|---|
| `Library/inspector/LibrarySingleInspector.jsx` | **45.94** | hard 40 | 🔴 K0 первым пунктом |
| `Library/inspector/MultiInspector.jsx` | 10.71 | — | 💀 K1 delete |
| `Library/inspector/EmptyInspector.jsx` | 1.54 | — | 💀 K1 delete |
| `Library/inspector/ActionsBar.jsx` | 7.90 | — | 💀 K1 delete |
| `Library/inspector/SessionSummary.jsx` | 3.74 | — | 💀 K1 delete |
| `SequenceView/hooks/useSequenceKeyboard.js` | 5.59 | hard 25 | 🟢 K2+K3 → ~9-10 KB |
| `SequenceView/index.jsx` | **38.52** | hard 40 | 🟡 1.48 до hard, K2 трогает |
| `store/librarySlice.js` | **28.34** | hard 25 | 🔴 +3.34 over (вне M-X.6 scope, но K2 добавит ~10 LOC; основная логика в helper-файле) |
| `Library/PreImportModal.jsx` | 21.51 | — | 🟢 K12.1 move |

**Hard violations не в скоупе M-X.6:** AnnotationTrack 48.54 (TD-ANNOTATIONTRACK-DECOMPOSE-V2 escalated), librarySlice 28.34 (M-X.7+).

---

## §1. Контекст

v0.8.0 закрыт 07.05.2026 — Library как primary workspace, 7 ⚓ promoted. Финализация оставила 6 deferred TD + 2 hotfix-а 07.05 (`5e468a8` bridge annotation, `c17899f` caret bridge wrap-half) ещё не released. 

Накопленные проблемы:

1. **LibrarySingleInspector 45.94 KB hard violation** (TD-LIBRARYSINGLEINSPECTOR-DECOMP-V2). Был closed at 32 KB в M-X.2-fix K3, K6/K7/K10 wiring v0.8.0 вернул к 45.94. Любая правка одного блока рискует ломать другой; M-X.6 K2/K3 + M-C Container Window + любые следующие edit-flow расширения попадут именно сюда.

2. **Dead code в `Library/inspector/`** — 4 файла (~24 KB) не используются после Этап 2 v0.8.0; route alias `'importer'` → `'library'` всё ещё активен в App.jsx + ~10 callsites. Risk случайной ссылки на dead path.

3. **DEC-LIB-12 ⚓ promoted с partial K10 character apply.** S5 acceptance заведомо fail — biolog нажимает букву → modal → confirm → branch создан, но sequence новой ветки identical к parent. Семантика сломана.

4. **TD-WRAP-KEYBOARD-NAV** — Shift+Arrow через origin clamps на seqLength. Pointer-driven path уже fixed в `c17899f`; keyboard остался asymmetric. Companion fix — оба пути через `useSequenceKeyboard.js`.

5. **K12 cosmetic deferred from v0.8.0:** PreImportModal location, catalog/ → lib/ rename, K4 view preview, K4 auto-trigger.

---

## §2. Стратегия

Mini-cleanup с явной нумерацией K-step под TECH_DEBT entries. K0 первым (TD-LIBRARYSINGLEINSPECTOR), K1 параллельно (decoupled), K2+K3 третьим (один файл), K12 финальный (4 atomic sub-items). Финал — v0.8.1 bump (включая 5e468a8 + c17899f).

---

## §3. Scope

**IN:** LibrarySingleInspector decomp ≤28 KB; удаление 4 dead-файлов + flip 'importer' → 'library' callsites + remove route alias; character-level apply (insert/Backspace/Delete) с indel-aware annotation shift; circular keyboard nav через origin; 4 cosmetic sub-items.

**OUT (M-X.7+ либо M-D):** AnnotationTrack 48.54 KB decomp; librarySlice decomp; AATrack/SequenceView soft watches; TD-SEQUENCEVIEW-SHIFT-SELECTION (Range API); focus ring a11y; TD-CIRCULAR-SELECTION (полная wrap-aware data-model selection).

---

## §4. Архитектурные решения

### DEC-MX6-01 — LibrarySingleInspector decomp pattern

Extract по responsibility, не по line count. Pattern из закрытого TD-SINGLEINSPECTOR-SELECTIONSTATE-EXTRACT (M-X.2-fix K3 closed at 32 KB):

1. **`hooks/useLibrarySaveFlow.js`** (~3-4 KB) — K7 wiring. Builds props для `<LibrarySaveActions>` + onAfterOverwrite/Save callbacks (clear pending edits).
2. **`hooks/useEditableModeToggle.js`** (~1.5-2 KB) — K6 state. `editable` boolean + reset on plasmid switch + pill props.
3. **`hooks/useManualEditBranching.js`** (~3-4 KB) — K10 wiring. `manualEditPending` / `manualEditBusy` state + `useManualEditDetection` call + cancel/confirm action handlers.
4. **(опционально, если main >28 KB)** `LibraryInspectorTitleRow.jsx` (~6-8 KB) — title row JSX wholesale.

Решение: 3 hooks обязательны; 4-й extract conditional. Если landing ≤28 KB после трёх — sub-component не нужен. Если 28 < x ≤ 32 — extract 4-й, landing ≤24 KB.

### DEC-MX6-02 — Character apply через single dispatcher + indel-aware shift

`useSequenceKeyboard` принимает новые props `editable`, `topology`, `onSequenceEdit?`. Когда `editable === true` и keystroke — IUPAC char / Backspace / Delete: `e.preventDefault()` + emit `op` через `onSequenceEdit`.

**Shape op:**
- IUPAC char без selection → `{ kind: 'insert', pos: caret, char }`. Caret после: `pos + 1`.
- IUPAC char с selection → `{ kind: 'replace', start: min(a,f), end: max(a,f), replacement: char }`. Caret после: `start + 1`.
- Backspace без selection → `{ kind: 'delete', pos: caret - 1, length: 1 }` (no-op linear если caret === 0; см. K3 для circular).
- Backspace/Delete с selection → `{ kind: 'replace', start, end, replacement: '' }`. Caret после: `start`.
- Delete без selection → `{ kind: 'delete', pos: caret, length: 1 }` (no-op linear если caret === seqLength).

Modifier-key chords (Ctrl/Meta) НЕ перехватываются — пропускаются для existing copy hotkeys. Caret update — caller responsibility (LibrarySingleInspector dispatch).

**Helper `Library/lib/library-sequence-edit.js`** (новый, ~3 KB). Pure function `applySequenceEditToEntry(entry, op) → { sequence, length, annotations }`. Indel-aware shift annotations:
- Insert на pos: ann.start >= pos → `start += 1, end += 1`. ann.start < pos < ann.end → `end += 1` (вставка внутри расширяет). pos >= ann.end → no shift.
- Delete симметрично (decrements). Annotation полностью внутри delete range → drop. Partial overlap → clip to remaining bounds.
- Replace = delete + insert composition.

**Slice action `applySequenceEditOnLibraryEntry(id, op)`** в librarySlice (~10 LOC; thin wrapper над helper):
- Get entry, check exists + !pendingDelete.
- `next = applySequenceEditToEntry(entry, op)`.
- `resourceHash = await computeResourceHash({ sequence: next.sequence, ... })`.
- Mutate state.libraryEntries[id].payload (sequence/length/annotations/resourceHash).
- `await putLibraryEntry(updated)` (silent persist, no version bump — character apply не bumps как safety-net DEC-LIB-WRITE-THROUGH-HYBRID-01).
- Return `{ ok, sequence, caretAfter }`.

**Composite handler в LibrarySingleInspector (`onSequenceEdit(op)`):**
- `entry.origin?.kind === 'manual_edit'` → direct `applySequenceEditOnLibraryEntry(item._libraryEntryId, op)` + caret update.
- Иначе (parent) → буферизация `setManualEditPending({ key, op })`. После confirm OK → `createManualEditBranch` → replay op через `applySequenceEditOnLibraryEntry(newId, op)` (см. §9 Q1 — auto-switch inspector).

DEC-LIB-14 ⚓ extends — single dispatcher pattern для все edits в SequenceView (existing `applyAnnotationEdit` + новый sequence-edit path).

### DEC-MX6-03 — Circular keyboard nav через extended-domain caret

`useSequenceKeyboard` принимает новый prop `topology`. При `topology === 'circular'`:
- Без shift (collapse): `next = ((next % seqLength) + seqLength) % seqLength` — round-trip wrap.
- С shift (extend selection): `next > seqLength` → trailing-wrap caret в (seqLength, 2×seqLength); `next < 0` → leading-wrap caret в (-seqLength, 0). CaretOverlay/SelectionOverlay уже handle extended-domain (DEC-WRAPTAIL-04/05).

При `topology === 'linear'` — existing clamp без изменений (regression guard).

Reuse existing extended-domain semantic — fix симметричен с pointer-driven path `c17899f`.

### DEC-MX6-04 — Dead-code purge atomic

Удаление 4 файлов + flip ~10 callsites + remove FULLSCREENS entry в одном коммите. Intermediate состояние «удалили файлы но не flipped callsites» сломает build. После K1 'importer' literal валиден ТОЛЬКО как payload value (`payload.target`), никогда как fullscreen route.

---

## §5. K-step plan

### K0 — LibrarySingleInspector decomp (тип A)

**Цель:** 45.94 → ≤28 KB.

**Файлы:**
- Новые: `Library/inspector/hooks/useLibrarySaveFlow.js`, `useEditableModeToggle.js`, `useManualEditBranching.js`. Опционально `Library/inspector/LibraryInspectorTitleRow.jsx`.
- Edit: `Library/inspector/LibrarySingleInspector.jsx` (extract → import).

**Сигнатуры hooks** см. DEC-MX6-01.

**Tests:**
- Existing `LibrarySingleInspector.test.jsx` pass без изменений API surface.
- `__tests__/use-library-save-flow.test.js` (~6 unit) — props shape + onAfterOverwrite/Save callback wiring.
- `__tests__/use-editable-mode-toggle.test.js` (~4 unit) — toggle + reset on item.id change.
- `__tests__/use-manual-edit-branching.test.js` (~6 unit) — armed condition + first-edit fires modal + confirm calls createManualEditBranch + cancel discards + Q5 plan-guard pendingDelete error path.
- (если 4-й extract) `LibraryInspectorTitleRow.test.jsx` (~3 unit) — render structure.

**Acceptance:** vitest 1469+ pass + ~16-19 новых; LibrarySingleInspector ≤28 KB; нет behavioural изменений.

### K1 — Dead-code purge (тип C)

**Удалить:** MultiInspector.jsx, EmptyInspector.jsx, ActionsBar.jsx, SessionSummary.jsx + любые их импорты в `Library/index.jsx` + соответствующие тесты.

**Flip 'importer' → 'library' callsites:**

| Файл | Что |
|---|---|
| `App.jsx` | `case 'importer':` line + comment block — удалить. |
| `store/canvasSlice.js` | FULLSCREENS array — удалить `'importer'`. |
| `AppShell/Topbar.jsx` | `isImporter = activeFullscreen === 'importer'` → `isLibrary === 'library'`. `pushFullscreen({ fullscreen: 'importer', ... })` → `'library'`. |
| `StartScreen/index.jsx` | `pushFullscreen({ fullscreen: 'importer', payload: { target: 'library' } })` → `'library'`. |
| `__tests__/*` (~15 fixtures) | grep-replace `'importer'` где fullscreen literal. **Не** трогать payload values (`payload.target === 'library'`). |

**Pre-K1 Code grep:** `grep -rn "'importer'" gui/designer/src --include="*.jsx" --include="*.js"`. Каждое попадание классифицировать: fullscreen literal (flip) / payload value (keep) / comment (keep либо обновить).

**Tests:**
- `App.test.jsx` либо new `App-routes.test.jsx` regression — `pushFullscreen('importer')` no-op'ит через `isValidFullscreen`.
- `canvasSlice.test.js` regression — FULLSCREENS не содержит 'importer'.

**Acceptance:** vitest 1469+ pass; grep `'importer'` (fullscreen literal) → 0 hits.

### K2 — Character apply (тип B)

**Файлы:**
1. `SequenceView/hooks/useSequenceKeyboard.js` (5.59 → ~8 KB) — новые props `editable`, `topology`, `onSequenceEdit?`; emit op shape по DEC-MX6-02.
2. `Library/lib/library-sequence-edit.js` (новый, ~3 KB) — pure helper `applySequenceEditToEntry`.
3. `store/librarySlice.js` (28.34 → ~29 KB; risk-bullet) — slice action `applySequenceEditOnLibraryEntry`.
4. `SequenceView/index.jsx` (38.52, soft watch) — props threading. **Если результат >40 KB → Code stop, mini-spec на decomp.**
5. `Library/inspector/tabs/SequenceTab.jsx` — props threading в SequenceView.
6. `Library/inspector/LibrarySingleInspector.jsx` (после K0) — composite handler `onSequenceEdit` (см. DEC-MX6-02).

**Tests:**
- `useSequenceKeyboard.test.js` (~10 unit) — edit-disabled gate + insert-at-caret + Backspace-at-caret + Delete-at-caret + Backspace-at-zero-noop (linear) + Delete-at-end-noop (linear) + selection-replace-IUPAC + selection-replace-empty (Delete) + Ctrl+IUPAC-no-edit (existing) + topology-circular-Backspace-at-zero (см. K3 + §9 Q2).
- `library-sequence-edit.test.js` (~8 unit) — insert before/inside/after annotation + delete spans annotation (drop) + delete partial overlap (clip) + replace composition + indel shift consistency (length === sequence.length).
- `librarySlice.test.js` (~4 unit) — applySequenceEditOnLibraryEntry happy + persist + pendingDelete guard + invalid op guard.
- `LibrarySingleInspector.test.jsx` (~3 integration) — first keystroke на parent → modal → confirm → branch создаётся (existing) + replay op в новой entry (NEW). Subsequent keystroke на manual_edit branch → direct apply без modal.

**Acceptance:** S5 working. Biolog в EDITABLE на parent → буква → modal → confirm → new branch с буквой applied. Subsequent keystroke в new branch — direct.

### K3 — Circular keyboard nav (тип C, companion к K2)

**Файл:** `SequenceView/hooks/useSequenceKeyboard.js` (тот же; combined K2+K3 ≤10 KB).

Принимает `topology` prop; logic по DEC-MX6-03. Linear — без изменений (regression guard).

**Tests (`useSequenceKeyboard.test.js` extension, ~7 unit):** linear-no-wrap (existing) + circular-ArrowRight-from-end-wraps (collapse) + circular-Shift+ArrowRight-from-end-extends (extended-domain) + circular-ArrowLeft-from-start-wraps + circular-Shift+ArrowLeft-from-start-extends + circular-End-from-start-jumps-to-end + circular-Home-from-end-jumps-to-start.

**Acceptance:** Shift+ArrowRight в конце circular плазмиды — selection extends через origin как pointer-drag.

### K12 — Cosmetic polish (тип C/D, 4 sub-items)

- **K12.1** (D) — move `Library/PreImportModal.jsx` → `Library/import/PreImportModal.jsx` + update imports (~5-7 callsites).
- **K12.2** (D) — move `Library/catalog/{catalog-cache.js, length-pattern.js}` → `Library/lib/`; remove empty catalog/ если осталась пустая.
- **K12.3** (C, TD-LIB-K4-VIEW-PREVIEW) — eye-icon button в MultiImportView row → expand inline 180×180 PlasmidMiniMap. Reuse existing PlasmidMiniMap. Local `useState(null)` (single expanded row at a time). ~30-50 LOC + 1 integration test.
- **K12.4** (C, TD-LIB-K4-AUTO-TRIGGER) — useEffect на mount LibrarySingleInspector: если `entry.ext?.annotationChoice === 'auto'` && `!entry.ext?.autoRun?.done` → trigger L1 через annotator-worker-client + mark `entry.ext.autoRun.done = true` через slice action. ~30 LOC + 2 unit tests.

---

## §6. Порядок выполнения

1. **K0** LibrarySingleInspector decomp (обязательно ДО K2).
2. **K1** Dead-code purge (может параллельно K0; отдельный коммит для bisect-ability).
3. **K2** Character apply.
4. **K3** Circular keyboard nav (combined K2+K3 commit OK либо separate).
5. **K12.1 + K12.2** Move/rename atomic.
6. **K12.3** View preview.
7. **K12.4** Auto-trigger.
8. **Финал v0.8.1 bump** (только после визуальной приёмки):
   - `gui/designer/package.json` 0.8.0 → 0.8.1.
   - `gui/designer/src/lib/version.js` APP_VERSION.
   - `RELEASES.md` v0.8.1 блок (5e468a8 + c17899f + всё M-X.6).
   - `PROJECT_STATE.md` snapshot update.
   - `TECH_DEBT.md` close 8 entries (см. §10).

**Code НЕ финализирует** PROJECT_STATE/RELEASES/TECH_DEBT/version bump до явного «финализируем v0.8.1» от биолога.

---

## §7. STOP-условие и формат отчёта

**STOP после K12.4 commit.** Code ждёт визуальной приёмки.

**Отчёт Code:**
- Коммит-хэши по K0 / K1 / K2 / K3 / K12.1-4.
- Финальные счётчики Vitest + pytest, build status.
- Размеры затронутых файлов: LibrarySingleInspector после K0; useSequenceKeyboard после K2+K3; librarySlice после K2; SequenceView/index после K2.
- **Отклонения от спеки** явным блоком (например: «K0 — extract'нул 3 hooks, sub-component не понадобился, landing 27.8» либо «K0 — extract'нул все 4, landing 22.4»; «K2 — librarySlice 28.34 → 30.2, нужен TD-SIZE-LIBRARYSLICE»).
- Список новых тестов с counts.
- Финальный grep `'importer'` (должен быть 0 как fullscreen literal).

---

## §8. Риски

1. **K0 LibrarySingleInspector decomp — landing >28 KB после 3 hooks.** → Code добавляет 4-й extract (`<LibraryInspectorTitleRow>`). Если и это >28 → stop, репорт.
2. **K2 indel-shift annotations — edge cases.** Insert/delete на boundary (pos === ann.start/end), delete внутри annotation, replace consistency. → 8+ unit tests на helper, tests первыми (red → green).
3. **K2 librarySlice прорывает 30 KB.** → новая action — thin wrapper над helper-файлом. Slice action ~10 LOC. Если >30 → stop, mini-spec на slice decomp.
4. **K2 SequenceView/index прорывает 40 KB.** → only ~5-10 LOC изменения (props threading). Если >40 → stop, mini-spec на decomp (TD-SIZE-SEQUENCEVIEW-INDEX).
5. **K1 grep пропускает 'importer' callsite.** → vitest catches missed callsite. Code включает «grep 'importer' final: N hits, классификация» в отчёт.
6. **K3 circular wrap-arithmetic ломает linear behaviour.** → `topology === 'linear'` explicit branch (clamp как было). Linear regression tests + circular new tests.

---

## §9. Открытые вопросы

1. **Auto-switch inspector на новую manual_edit branch после confirm?** Default proposal: ручной (biolog нажимает на новую entry в Library tree после toast). Альтернатива: auto-switch (требует extra wiring `useLibraryState` ↔ Library tree). **Биолог: ручной OK либо auto preferred?**

2. **Circular Backspace-at-pos-0 — wrap либо no-op?** SnapGene wrap (Backspace удаляет последний char плазмиды), Benchling no-op (treats as linear). Default proposal: wrap (consistent с DEC-MX6-03 round-trip). Применимо также для Delete-at-pos-end. **Биолог: wrap либо no-op?**

3. **K1 importerTarget rename → libraryTarget.** Меняется payload key value (Topbar.jsx local), не fullscreen literal. Default proposal: keep (rename отдельным cosmetic в M-X.7+). **Биолог: keep либо rename в K1?**

4. **K12.3 preview button — только container kind либо все (включая primer)?** Multi-import primarily для DNA containers. Default proposal: только container. **Биолог: container only либо all kinds?**

---

## §10. Связь с TECH_DEBT.md (закрывает)

- **TD-LIBRARYSINGLEINSPECTOR-DECOMP-V2** → K0.
- **TD-LIB-K2-DEAD-CODE-PURGE** → K1.
- **TD-LIB-K10-CHARACTER-APPLY** → K2.
- **TD-WRAP-KEYBOARD-NAV** → K3.
- **TD-LIB-K4-VIEW-PREVIEW** → K12.3.
- **TD-LIB-K4-AUTO-TRIGGER** → K12.4.
- **TD-LIB-PREIMPORT-LOCATION** → K12.1.
- **TD-LIB-CATALOG-RENAME** → K12.2.

**Не закрывает:** TD-ANNOTATIONTRACK-DECOMPOSE-V2 (M-X.7+), TD-SIZE-AATRACK / TD-SIZE-SEQUENCEVIEW-INDEX (M-X.7+), TD-SEQUENCEVIEW-SHIFT-SELECTION (M-D), TD-SEQUENCEVIEW-FOCUS-RING (v1.0), TD-CIRCULAR-SELECTION (M-D).

---

## §11. После приёмки M-X.6

Финализация v0.8.1 (см. §6 пункт 8). Promote'ов в ANCHORS.md в M-X.6 не предполагается — DEC-MX6-01..04 sprint-level (паттерны для будущих использований; promote если повторятся в M-D Container Window).

После v0.8.1 — биолог решает next sprint:
- M-X.7 polish (TD-ANNOTATIONTRACK + librarySlice decomp).
- M-C Container Window kickoff.
- NCBI GenBank integration (TD-OPEN-PLASMID-REPOS).
