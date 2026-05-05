# Sprint M-X.4 — Library Save Flow (Перезаписать / Сохранить как версию)

**Тип:** B (новая UX-механика поверх existing data model + расширение librarySlice контракта)
**Объём:** ~5 K-шагов, ~10-12 KB патча
**Ветка:** `feature/library-save-flow` (новая, от main после merge `feature/sequence-view-feature-strip`)
**Зависимости:** M-X.2 + M-X.2-fix должны быть merged + acceptance PASS

---

## TL;DR

Биолог редактирует annotations плазмиды из Library в Importer. Правки живут в `perFileEdits.editedAnnotations` — transient, теряются при close проекта. Library entry frozen (M-X.2-fix K1).

Этот sprint добавляет **explicit save UI** с двумя действиями:
- **«Перезаписать в библиотеке»** — обновляет existing Library entry, инкрементит `version` counter.
- **«Сохранить как новую версию»** — создаёт новую Library entry с `parent_entry_id` ссылкой и `version = parent.version + 1`.

⚓ DEC-LIB-11 (новый, supersede DEC-LIB-05 в части annotations) — фиксирует контракт.

---

## §0 Размеры файлов в скоупе

`list_directory_with_sizes` на 05.05.2026 после M-X.2-fix:
- `gui/designer/src/store/librarySlice.js` — 6.14 KB (зелёная зона, soft 20).
- `gui/designer/src/components/Importer/inspector/SingleInspector.jsx` — 32 KB (soft warn 30, hard 40). **Близко к soft.** Если save UI нужно туда добавить — extract `useLibrarySaveFlow` хук в `inspector/hooks/`. См. также TD-SINGLEINSPECTOR-SELECTIONSTATE-EXTRACT — если совпадёт окно, выполняется в этом sprint'е.
- `gui/designer/src/components/Importer/inspector/ActionsBar.jsx` — 7.9 KB (зелёная зона).
- `gui/designer/src/components/Importer/index.jsx` — ~17-22 KB (зелёная зона).

Risks: SingleInspector рискует разрастись если save flow добавляет ≥3 KB inline. Mitigation в K3: вытащить save UI в отдельный sub-component `inspector/SaveToLibraryControls.jsx` (новый ~3 KB) либо хук + minimal JSX inline.

---

## §1 Контекст и мотивация

### Текущее состояние (после M-X.2 + M-X.2-fix)

Биолог открыл плазмиду из Library через Importer (catalog click → SingleInspector). Сделал правки annotations: drag rename, split sub-features, FeatureEditorModal mutate. Каждая правка → `applyAnnotationEdit` → `onUpdateEdits({editedAnnotations})` → `state.perFileEdits[fileName] = {editedAnnotations: ...}`.

**Что работает:**
- SingleInspector / SequenceView / Annotator показывают edited annotations через `displayAnnotations` (M-X.2 K1).
- Catalog mini-map icon показывает edited annotations через render-time merge `liveAnnotationsByLibId` (M-X.2-fix K1).
- Library entry в Dexie frozen.

**Что НЕ работает:**
- Биолог нажал «На канвас» (target=project) → проект сохраняется с правками в `containerIds`, **но** Library entry annotations всё ещё старые. Биолог открыл другой проект → плазмида из Library без его правок. Confusion.
- Биолог нажал «В библиотеку» в текущем UI → создаёт **дубликат** entry с другим именем (autoname через AutonameModal). Не overwrite, не version. Library засоряется duplicates.
- Биолог закрыл проект без save → правки в `perFileEdits` потеряны. Никакого warning.

### Желаемое поведение (биолог сформулировал 05.05.2026)

> «Если мы правим фичи то мы можем сохранить в исходник (перезаписать или сохранить как другую версию)»

Биолог редактирует → видит «не сохранено» (visual cue) → нажимает explicit save → выбор overwrite vs version.

### Industry pattern

- **SnapGene:** Save (overwrite) + Save As (new file). Classic desktop pattern.
- **Benchling:** auto-save + version history. UI имеет «Restore version» панель.
- **Geneious:** manual save + version tags.

Биолог явно выбрал **SnapGene-style** двухкнопочный pattern. Это закрепляется в DEC-LIB-11.

---

## §2 Цели и Scope

**В скоупе:**
1. UI «Перезаписать» / «Сохранить как новую версию» в SingleInspector / ActionsBar.
2. Visual cue «изменения не сохранены» (модификация title row или ActionsBar).
3. Версионирование Library entries: `version` counter (int), `parentEntryId` ссылка.
4. Confirmation dialog для overwrite («это удалит предыдущие annotations»).
5. Detection «есть ли несохранённые правки» (perFileEdits has editedAnnotations и они отличаются от Library entry).
6. Dirty state warning при close project / popFullscreen Importer.
7. ⚓ DEC-LIB-11 (новый) + DEC-LIB-VERSIONING-01 (sprint-level).

**Не в скоупе:**
- Version history UI (просмотр всех версий, restore from version) — отдельный sprint M-X.5 «Library Version Browser» либо позже.
- Diff view между versions — отдельный sprint.
- Cloud sync versions.
- Auto-save с UI awareness (это TD-AUTOSAVE из бэклога) — биолог явно сказал «explicit save».

---

## §3 K-шаги

### K1 — Расширить `librarySlice.js` для версионирования

**Цель:** добавить две функции для save flow + version field в schema.

**Файлы:**

`gui/designer/src/store/librarySlice.js`:

Добавить два actions:

```js
/**
 * Overwrite an existing library entry's annotations. Used by the
 * M-X.4 «Перезаписать в библиотеке» Save flow — biolog explicitly
 * chooses to replace the persisted state with their session edits.
 *
 * Increments `entry.version` (int counter, starts at 1). Sequence
 * + topology + ends remain frozen — DEC-LIB-11 explicitly limits
 * mutation to annotations.
 *
 * Persisted via `putLibraryEntry`. Catalog re-renders on next
 * libraryEntries change (Zustand subscription).
 *
 * NOT called from edit dispatcher (that path stays transient via
 * perFileEdits — DEC-LIB-11). Only the explicit Save button.
 */
overwriteLibraryEntry: async (id, annotations) => { ... },

/**
 * Clone a library entry as a new version. Used by the M-X.4
 * «Сохранить как новую версию» Save flow — biolog wants their
 * edits as a separate persisted entity (parent stays unchanged).
 *
 * Creates a new entry with:
 *   - new UUID
 *   - same payload (sequence/topology/ends) as parent
 *   - new annotations from biolog edits
 *   - `parentEntryId` pointing to the source entry id
 *   - `version = (parent.version || 1) + 1`
 *   - `name = parent.name + ' (v' + version + ')'` if no rename
 *   - `addedAt = new Date().toISOString()`
 *
 * Returns the new entry id so SingleInspector can switch to it
 * (item._libraryEntryId reassigned, perFileEdits cleared).
 */
cloneLibraryEntryAsVersion: async (parentId, annotations, options = {}) => { ... },
```

**Schema field additions** (без миграции — Dexie `putLibraryEntry` принимает любые поля):
- `entry.version` — int, default 1 если undefined.
- `entry.parentEntryId` — string UUID либо null, default null.

Existing entries в БД без `version` рассматриваются как `version: 1` через fallback в селекторах.

**Тесты:** `store/__tests__/library-save-flow.test.js` (новый, ~150 строк, 8 сценариев):
- overwriteLibraryEntry увеличивает version 1 → 2.
- overwriteLibraryEntry persisted в Dexie (mock putLibraryEntry).
- overwriteLibraryEntry на несуществующий id → no-op (не throw).
- overwriteLibraryEntry с не-array annotations → no-op.
- cloneLibraryEntryAsVersion создаёт новую entry с новым id.
- cloneLibraryEntryAsVersion переносит sequence/topology без изменений.
- cloneLibraryEntryAsVersion устанавливает parentEntryId = parent.id.
- cloneLibraryEntryAsVersion версия = parent.version + 1.

**Размер патча:** ~80 строк librarySlice.js (две функции с JSDoc) + ~150 строк тесты.

---

### K2 — Detection «есть несохранённые правки» (dirty state)

**Цель:** SingleInspector знает, отличаются ли текущие edited annotations от persisted Library entry.

**Файлы:**

`gui/designer/src/components/Importer/inspector/lib/dirty-state.js` (новый, ~40 строк):

```js
/**
 * Determine whether perFileEdits diverges from the source library
 * entry. Compares editedAnnotations против entry.payload.annotations
 * deep-equality (annotation-model id-based — order doesn't matter,
 * only set membership + per-region {start,end,name,type,strand,
 * level,parentId,...}).
 *
 * Returns 'clean' (нет правок), 'dirty' (есть несохранённые), либо
 * 'no-source' (item не из Library — нет _libraryEntryId).
 */
export function getLibrarySaveStatus(item, edits, libraryEntries) {
  ...
}
```

`gui/designer/src/components/Importer/inspector/SingleInspector.jsx`:
- Импортировать `getLibrarySaveStatus`.
- В render compute `saveStatus = getLibrarySaveStatus(item, edits, libraryEntriesById)`.
- Передавать `saveStatus` в `<SaveToLibraryControls>` (K3).

**Тесты:** `inspector/__tests__/lib/dirty-state.test.js` (~80 строк, 5 сценариев).

**Размер патча:** ~120 строк (40 helper + 80 tests).

---

### K3 — UI «Перезаписать» / «Сохранить как версию»

**Цель:** видимая UI кнопка(и) для save flow когда `saveStatus === 'dirty'`.

**Файлы:**

`gui/designer/src/components/Importer/inspector/SaveToLibraryControls.jsx` (новый, ~6 KB):

Sub-component который рендерится в SingleInspector header (рядом с selection counter / settings gear) **только** когда `saveStatus === 'dirty'` AND item._libraryEntryId есть.

UI:
- Visual cue: «● Не сохранено в библиотеке» (orange dot prefix, secondary text color) если `saveStatus === 'dirty'`.
- Кнопка «Сохранить ▾» — открывает dropdown с двумя пунктами:
  - «Перезаписать [имя плазмиды]» — overwrite. Confirmation modal: «Изменения в существующей записи нельзя откатить. Продолжить?» → ОК → `overwriteLibraryEntry(id, annotations)`.
  - «Сохранить как новую версию» — opens inline name input с pre-filled `[имя] (v[N+1])`, биолог может изменить → подтверждает Enter → `cloneLibraryEntryAsVersion(id, annotations, {newName})`. После save: `state.updateEdits(fileName, {editedAnnotations: null})` (clear), `item._libraryEntryId = newEntry.id` (switch).

Toast показ через `useStore(s => s.showToast)`:
- Overwrite: «✓ Перезаписана в библиотеке: [имя] (v[N])».
- Clone: «✓ Сохранена как новая версия: [имя] (v[N])».

Props:
- `entry` — library entry object либо null.
- `editedAnnotations` — array либо null.
- `saveStatus` — 'clean' | 'dirty' | 'no-source'.
- `onSaved(newEntryId?)` — callback для switch к новой entry после clone.

**Файлы (правки):**

`gui/designer/src/components/Importer/inspector/SingleInspector.jsx`:
- Импортировать `SaveToLibraryControls`.
- Render в title row рядом с selection counter:

```jsx
{item?._libraryEntryId && (
  <SaveToLibraryControls
    entry={libraryEntriesById[item._libraryEntryId]}
    editedAnnotations={edits.editedAnnotations}
    saveStatus={saveStatus}
    onSaved={(newId) => { ... }}
  />
)}
```

**Тесты:** `inspector/__tests__/SaveToLibraryControls.test.jsx` (~120 строк, 6 сценариев):
- saveStatus='clean' → ничего не рендерится.
- saveStatus='dirty' → visual cue + Сохранить button.
- Click Перезаписать → confirmation appears.
- Confirm overwrite → action called.
- Click Сохранить как версию → inline rename appears с pre-filled name.
- After save → toast shown.

**Размер патча:** ~6 KB component + ~3 KB tests + ~50 строк wiring в SingleInspector.

---

### K4 — Dirty warning при close

**Цель:** если есть unsaved правки → confirm перед close проекта / popFullscreen Importer.

**Файлы:**

`gui/designer/src/components/Importer/index.jsx`:
- Перед `popFullscreen()` (back button / Открыть холст / runConfirm finish) — проверить `state.parsedItems.some(it => it._libraryEntryId && getLibrarySaveStatus(...) === 'dirty')`.
- Если да → `window.confirm(S.unsavedLibraryEditsWarning)`. Если biolog cancels → не делаем pop.
- Cancel в Importer (например через AppShell topbar back button) — Importer должен expose dirty state через store flag `s.canvas.importerDirty` set/cleared в useEffect, AppShell topbar reads.

`gui/designer/src/store/canvasSlice.js`:
- Добавить `setImporterDirty(value: boolean)` action (1-2 строки).

**Тесты:** `__tests__/integration/library-save-dirty-warning.test.jsx` (~80 строк, 3 сценария):
- Edit annotation → close без save → warning.
- Edit annotation → click Сохранить → close → no warning.
- No edits → close → no warning.

**Размер патча:** ~50 строк wiring + ~80 строк tests.

---

### K5 — Финализация

**Цель:** ⚓ DEC-LIB-11 + DEC-LIB-VERSIONING-01, проверка размеров, commit.

**Чеклист:**
- [ ] Все existing M-X.2 + M-X.2-fix тесты passing (regression check).
- [ ] Новых тестов: ~25-30 (8 librarySlice + 5 dirty-state + 6 SaveToLibraryControls + 3 dirty-warning + ~5-8 integration).
- [ ] `librarySlice.js` ≤ 9 KB (был 6.14, +2.5 KB acceptable).
- [ ] `SingleInspector.jsx` ≤ 33 KB (был 32, +1 KB допустим — cumulative с TD-SINGLEINSPECTOR-SELECTIONSTATE-EXTRACT решит при следующем подходе).
- [ ] `SaveToLibraryControls.jsx` ≤ 7 KB.
- [ ] Build clean.
- [ ] pytest unchanged.

**Commit message:**
```
feat(m-x.4): library save flow — overwrite vs save-as-new-version

K1 store: overwriteLibraryEntry + cloneLibraryEntryAsVersion + version
   field + parentEntryId field
K2 lib: getLibrarySaveStatus dirty-detection helper
K3 ui: SaveToLibraryControls component in SingleInspector header
K4 ux: unsaved-edits warning before importer close
K5 chore: docs + final size check

Closes DEC-LIB-11 (anchored). Replaces ad-hoc autoname duplicate
flow when item is library-sourced (item._libraryEntryId set).
```

---

## §4 STOP-conditions для Code

1. **Existing test fails после K-step.** Стоп, root-cause regression перед продолжением.
2. **K1 schema migration question.** Existing entries в БД без `version` field — должны автоматически рассматриваться как `version: 1`. Если требует Dexie schema migration — стоп, обсудить.
3. **K3 UI ambiguity.** Если dropdown «Сохранить ▾» с двумя пунктами не помещается в title row рядом с selection counter / settings gear — переехать в **floating ActionsBar** (правый низ Importer'а) как третья кнопка после «На канвас». Code решает по фактической ширине.
4. **K3 inline rename input UX.** Если pre-filled `[имя] (v[N+1])` text неудобен (биолог хочет custom name) — биолог в input field может изменить полностью. Если это создаёт UX confusion (что autocomplete vs custom) → стоп, обсудить.
5. **K4 dirty warning false positive.** Если biolog open Library entry **только посмотреть** (без правок) → close → дёргает warning? Нет: `saveStatus === 'clean'` → нет warning. Но если есть session-level правки которые биолог отменил Ctrl+Z до текущего state matching original → должен быть `clean`. Через deep-equal compare это работает.

---

## §5 ⚓ Anchors которые этот sprint фиксирует

При финализации M-X.4 acceptance:

### ⚓ DEC-LIB-11 — Library entry annotations mutable through explicit save (supersede DEC-LIB-05 в части annotations)

Sequence + topology + ends — **frozen** в Library entry (DEC-LIB-05 сохраняется в этой части).

Annotations — **mutable through explicit save flow only**. Биолог редактирует annotations плазмиды в проекте → правки живут в `perFileEdits.editedAnnotations` (transient). Чтобы зафиксировать в Library — два explicit action:

- «Перезаписать в библиотеке» — `overwriteLibraryEntry(id, annotations)` → existing entry, `version++`, старая annotations теряется.
- «Сохранить как новую версию» — `cloneLibraryEntryAsVersion(parentId, annotations)` → новая entry с `parentEntryId` ссылкой и `version = parent.version + 1`. Старая entry остаётся.

Между этими — **auto-save off**. perFileEdits сохраняется в проектном state (.bodge), НЕ в Library entry.

Никакие другие пути не могут изменять Library entry annotations. `applyAnnotationEdit` в SingleInspector → `onUpdateEdits` → ТОЛЬКО `perFileEdits`, никогда не librarySlice.

### ⚓ DEC-LIB-VERSIONING-01 — Library entry version model

Каждая Library entry имеет:
- `version: int` — counter, starts at 1, increments on `overwriteLibraryEntry`.
- `parentEntryId: string | null` — UUID parent entry если эта entry создана через `cloneLibraryEntryAsVersion`. Null для original imports.

Existing entries в БД без `version` — автоматически рассматриваются как `version: 1`, `parentEntryId: null`. Backward-compat без миграции.

Naming convention для cloned versions: `[parent.name] (v[N+1])` если biolog не указал custom name. Custom name overrides.

Version history UI (восстановить старую версию, посмотреть diff) — НЕ в скоупе DEC-LIB-VERSIONING-01. Отдельный sprint M-X.5 либо позже. Сейчас только store-level контракт; UI будет когда биолог попросит.

---

## §6 Открытые вопросы

1. **Visual cue для dirty state — где именно?** В §3 K3 я предлагаю «● Не сохранено в библиотеке» в title row рядом с selection counter. Альтернативы:
   - Бордюр Importer'а accent color (visual peripheral).
   - Asterisk * перед именем плазмиды в title.
   - Toast «у вас есть несохранённые правки» при первой правке.

   Я склоняюсь к dot + text потому что:
   - Asterisk легко не заметить (особенно при длинном имени).
   - Border peripheral subtle.
   - Toast навязчив.
   
   Биолог решает на kickoff.

2. **Кнопка «Сохранить» — single button с dropdown или два отдельных button?**
   - Single button «Сохранить ▾» с dropdown — компактно, но dropdown скрывает option «Сохранить как новую версию». Биолог должен click → see options. Лишний шаг.
   - Два button «Перезаписать» / «Сохранить как версию» — два click target, биолог видит options сразу. Занимает больше места.
   
   Я склоняюсь к **single dropdown** для compactness (primary action — overwrite, version — discoverable через dropdown). Биолог решает.

3. **Confirmation modal для overwrite — нужен?**
   - С modal — биолог защищён от accidental overwrite, но добавляется лишний click на каждый save.
   - Без modal — быстрее, но риск accidental destruction.
   - Compromise: confirmation **только** если editedAnnotations контейнирует deletions (regions removed). Если только additions / renames — no confirm.
   
   Биолог решает уровень paranoia.

4. **Что делать с perFileEdits после save?**
   - Overwrite: `state.updateEdits(fileName, {editedAnnotations: null})` — clear, потому что persisted state теперь = edited state, никаких правок не остаётся.
   - Clone: `state.updateEdits(fileName, {editedAnnotations: null})` AND `item._libraryEntryId = newEntry.id` — switch reference на new entry. После этого biolog продолжает работу как будто открыл новую entry.

   Это ОК для меня, но Code должен подтвердить что `_libraryEntryId` reassign не ломает other selectors / refs.

5. **PreImportModal interaction.** Если biolog открыл Library entry → отредактировал → save as version → должна ли cloned entry проходить через PreImportModal (metadata capture)? Я считаю **нет** — это derivative от existing entry, не fresh import. Cloned entry наследует tags / folder от parent. Биолог может изменить через TagsEditor если нужно.

---

## §7 Формат отчёта Code

```
## Отчёт Code по Sprint M-X.4

### Коммиты K1-K5
- K1 <hash>: librarySlice +overwriteLibraryEntry +cloneLibraryEntryAsVersion +version field
- K2 <hash>: getLibrarySaveStatus dirty-detection helper
- K3 <hash>: SaveToLibraryControls в SingleInspector header
- K4 <hash>: dirty warning перед close
- K5 <hash>: final commit

### Размеры
- librarySlice.js: 6.14 → X
- SingleInspector.jsx: 32 → X
- SaveToLibraryControls.jsx: новый, X KB

### Тесты
- Vitest: 1420 → 1420+N
- pytest: 112 (без изменений)
- Build: clean

### Open questions §6 — ответы Code
1. Visual cue: <выбор>
2. Save button: <single/double>
3. Confirmation: <always/conditional/none>
4. perFileEdits clear: <как реализовано>
5. PreImportModal: <как реализовано>

### Отклонения от §3
<явный список или «нет»>

### Pending для Игоря
- Визуальная приёмка через ACCEPTANCE_ALGORITHM.md.
```

---

## §8 После acceptance

При финализации M-X.4:
1. ⚓ DEC-LIB-11 → ANCHORS.md.
2. DEC-LIB-VERSIONING-01 → DECISIONS.md (sprint-level).
3. RELEASES.md → v0.7.3 либо v0.8.0.
4. PROJECT_STATE.md update.
5. Спека → archive.
6. TD-LIBRARY-WRITE-API → DONE (re-implemented в K1).
7. Дальше — M-X.3 «Wrap-tail rendering» либо M-C Container Window kickoff.

---

**Статус:** 🔴 В процессе (готов для kickoff)
**Утверждение Игоря:** [pending]
