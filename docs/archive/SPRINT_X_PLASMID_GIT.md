# Sprint X — Plasmid-Git (baseline + commits + replay)

**Статус:** ✅ РЕАЛИЗОВАНО 26.04.2026 (визуальная приёмка финализации цикла Sprint X / X-fix / X-fix-2 / X-fix-3 на EGFP, 5 сценариев PASS).

**Тип:** feature + refactor (архитектурный) + закрытие V22/V24/V27
**База:** v0.5.1-alpha, коммит `8699bf5` (Sprint 2a.1 EditorPanels extract, 23.04.2026)
**Предпосылка:** deep code analysis 23.04.2026 и visual acceptance Sprint 2a.1 выявили три бага (V22, V24, V27) с общим корнем: `fragment.mutations[]` хранит координаты относительно applied sequence, нет immutable baseline, нет revert. PROJECT_STATE Sprint 2a.1 journal постулирует: «Sprint X Plasmid-Git закрывает их автоматически». Эта спека реализует модель и закрывает все три бага.

---

## 0. Срез размеров затрагиваемых модулей

Снимок 22.04.2026:

| Файл | Размер | Лимит | Зона |
|------|--------|-------|------|
| `store/fragmentSlice.js` | **23.09 KB** | 25 KB hard | **soft** (риск прорыва — см. §9 риск 1) |
| `hooks/useFragmentHandlers.js` | 20.29 KB | 25 KB hard | soft |
| `components/FragmentEditor/index.jsx` | 35.57 KB | 40 KB hard | soft |
| `components/FragmentEditor/EditorPanels.jsx` | 9.39 KB | 40 KB hard | OK (вырастет до ~13 KB с toggle+message+diff UX) |
| `components/FragmentEditor/highlights.js` | 3.54 KB | 25 KB hard | OK |
| `mutagenesis.js`, `local-primer-design.js`, `sequence-diff.js` | 17.82 / 15.63 / 2.72 KB | 25 KB hard | OK |
| новый `lib/plasmid-git.js` | — | 25 KB hard | цель 10–14 KB |

`fragmentSlice.js` ближайший к hard — явное правило в §9: если в K2 перевалит 24.5 KB, Code останавливается и просит вынести reducers в `lib/plasmid-git-reducers.js`.

---

## 1. Контекст

- **V22** (HIGHLIGHT-INDEL-TAIL, Высокий) — `components/FragmentEditor/highlights.js:21-36`: positional diff через `sequenceDiff(parentSlice, fragment.sequence)` не учитывает indel-смещение, красит хвост до конца sub-фрагмента.
- **V24** (SINGLE-CIRCULAR-NO-PRIMERS, Высокий) — `local-primer-design.js:201-206`: early-return при `fragments.length < 2` игнорирует `circular`, primers для self-closure не генерируются (регрессия K12 ⚓ 22.04).
- **V27** (MUTATION-DELETE-NO-REVERT, Высокий) — `EditorPanels.jsx:97-104`: ✕ убирает метку из списка, sequence не откатывается, UX-ловушка.

Все три — симптомы отсутствия immutable baseline + списка commits с absolute-parent-coords. Модель Plasmid-Git (baseSnapshot + commits[] + toggle applied + replay) закрывает их как следствия: V22 через replay поверх coord-remap (indel-aware), V24 независимым фиксом в primers branch, V27 через toggle + replay.

---

## 2. Стратегия

Вводим на `fragment` три новых поля: `baseSnapshot` (immutable sequence + annotations в момент bootstrap), `commits[]` (append-журнал с absolute-parent-coords и флагом `applied: boolean`) и **все** mutation-writes идут через Git-reducer. `fragment.sequence`/`annotations` становятся derived (replay). Bootstrapping lazy при первом `applyMutationGit`. Legacy `fragment.mutations[]` помечается как read-only metadata с 🔒 lock badge в UI. Split sub-fragments тоже Git-aware — bootstrap в момент их создания из split strategy. V24 (self-closure primers) — независимый fix в том же спринте. UX revert = toggle `applied` (одно нажатие, обратимо), hard delete = отдельная кнопка 🗑 Archive с confirm.

---

## 3. Scope

### IN

- **`lib/plasmid-git.js`** — pure helper: `bootstrapBaseSnapshot`, `createCommit`, `replay(baseSnapshot, commits)` → `{ sequence, annotations, warnings }` (применяет только `applied:true` по createdAt-order, coord-remap через delta-sum), `replayDiff` → `Map<ntPos, 'silent'|'nonsilent'>` (substitutions через CODON_TABLE, indel не подсвечивается), `resolveAutoOverride(commits, newCommit)` → `{commitsWithDisabled, overriddenId?}`.
- **`store/fragmentSlice.js`** — 4 reducer: `applyMutationGit(fragIdx, mut)` (с auto-override внутри), `toggleCommit(fragIdx, commitId)`, `archiveCommit(fragIdx, commitId)` (hard delete), `setCommitMessage(fragIdx, commitId, msg)`.
- **`store/index.js`** — migration на hydration: fragments без `baseSnapshot` → bootstrap из текущих `sequence`/`annotations`, `commits = []`. Проверить, что `baseSnapshot`/`commits` попадают в snapshot pushUndo.
- **`hooks/useFragmentHandlers.js` `handleSaveFragment`** — все inline-mutation пути (не только inline-edit, но и KLD-path и split-path) идут через `applyMutationGit`. Split-path дополнительно: каждому sub назначаем `baseSnapshot = {sequence: sf.sequence, annotations: trimmedAnn}`, `commits = []` в момент создания (bootstrap).
- **`components/FragmentEditor/highlights.js`** — Git-aware branch первым: `if (fragment.commits?.length)` → `replayDiff`. Existing parent-diff path остаётся как fallback для fragments без commits.
- **`components/FragmentEditor/EditorPanels.jsx`** — Mutations panel переделан: toggle-buttons (✓ active / ○ disabled), 🗑 archive отдельно с confirm, group-by-codon для substitutions, 🔒 lock badge на legacy записях (без `m.id`, с `pointer-events: none` на toggle), inline-edit `commit.message` (hover → pencil → input). Новая кнопка в header Editor: «⇌ Сравнить с baseline» → diff-view.
- **`components/FragmentEditor/index.jsx`** — проброс `onToggleCommit`/`onArchiveCommit`/`onSetMessage` в EditorPanels; diff-view state `diffViewActive: boolean`; render-branch: при `diffViewActive` sequence grid показывает baseSnapshot sequence + substitution-highlights из commits.
- **`local-primer-design.js`** — V24 branch: `fragments.length === 1 && circular` → self-closure pair (15-bp RC tail на fwd, 15-bp direct tail на rev, `purpose: 'self-closure'`). Primer объекты обогащены `purpose` → ActionBar читает.
- **`components/ActionBar.jsx`** (или где рендерится bar, Code проверит) — badge «Режим: Self-closure (single circular +30 bp)» когда primers[0].purpose === 'self-closure'.
- **Тесты Vitest:** `lib/__tests__/plasmid-git.test.js` (replay, toggle, auto-override, indel coord-remap, V22 regression), `FragmentEditor/__tests__/highlights.test.js` (replay path + split-sub V22 regression), `store/__tests__/fragmentSlice-git.test.js` (reducers + migration + split-sub bootstrap), `EditorPanels.test.jsx` (toggle + archive + message edit + legacy lock), `local-primer-design.test.js` (V24 self-closure).

### OUT

- Inline editing в SequencePane — Map-WS-2, следующей спекой.
- Cherry-pick / reorder commits, branches, merge commits — DAG operations отложены.
- User-added annotations persistence через revert — **известное ограничение**: annotations замораживаются в baseSnapshot при bootstrap, пользовательские правки между commits теряются при toggle/archive. Документируется в UI (hint в Editor: «Добавляйте аннотации до применения мутаций») и §10 open question. Full event-sourcing annotations — отдельный спринт если потребуется.
- UI git-tree визуализация (timeline, branches view) — Sprint X+1 UX.
- Миграция legacy `fragment.mutations[]` в commits (реверс-инжиниринг baseline невозможен).
- `Part` library `createMutant` — не трогаем.
- V23 ORTHOGONAL_OVERHANGS_4 — отдельный спринт.

---

## 4. Архитектурные решения

1. **⚓ `fragment.baseSnapshot` immutable, `fragment.commits[]` append-журнал, `sequence`/`annotations` derived.** Event-sourced модель: источник истины — commits поверх baseline. Без baseline невозможно корректно реверсировать indel. Replay чистый, идемпотентный.
2. **⚓ `commit.parentPos` — координата в `baseSnapshot.sequence`, не в applied.** Фиксированный reference frame: независимо от порядка/состава other commits, parentPos одной мутации стабилен. Упрощает toggle/archive: не надо пересчитывать остальные commits.
3. **⚓ Lazy bootstrap baseSnapshot при первом `applyMutationGit` + eager migration на hydration.** Новые fragments получают baseSnapshot в момент первого commit. Сохранённые проекты — migration-middleware на store load: `sequence`/`annotations` становятся baseline, legacy `mutations[]` → read-only metadata. Split-subs — eager bootstrap в handleSaveFragment split-branch (иначе первый ✕ на sub покажет ложный revert).
4. **Coord-remap через delta-sum предыдущих applied indel.** `remappedPos = parentPos + Σ(delta_i : commits[i].applied && commits[i].parentPos < current.parentPos)`. Substitution delta=0, insertion +len, deletion −len. Порядок обхода — по createdAt. Детерминированно.
5. **⚓ Auto-override same-codon at commit-add.** Новый substitution commit с `codonStart(parentPos) == codonStart(existing.parentPos)` && существует applied substitution → existing auto-toggle `applied=false` в том же set-draft (не удаляется, остаётся в commits[] как history). Пользователь видит «я заменил G26A на G26E»: G26A в panel как ○ disabled, G26E как ✓ active, ре-toggle G26A вернёт первую. Альтернативы (latest-wins в replay, reject, конфликт-dialog) ломают UX WF-C exploratory («передумал — попробовал другую»).
6. **Toggle applied как primary revert, archive — hard delete отдельной кнопкой.** ✕ в panel = toggle (обратимо, один клик). 🗑 = permanent delete, native confirm «Удалить `{label}`? Это действие не отменить через ✕, только через Ctrl+Z.». Архив нужен для Ala-scan, где биолог хочет почистить пачку ненужных экспериментов. Toggle — основной UX, archive — housekeeping.
7. **⚓ `crypto.randomUUID()` для commit.id с dev-guard.** Feature-detect в K1 top-level; throw в dev при отсутствии, fallback `c_${Date.now()}_${random}` в prod. Vite target Chrome 92+ покрывает, guard защищает от регрессий target config.
8. **Annotations в baseSnapshot immutable — compromise для MVP.** Honest limitation: пользовательские правки annotations после bootstrap замораживаются в HEAD, при toggle/archive commits возвращаются к `baseSnapshot.annotations + replay adjustments`. User-annotations vs replay conflict решается UI-подсказкой: «Редактируйте annotations до mutagenesis workflow». Полный event-sourcing annotations (userAnnotations[] + reverse-remap) — отдельный спринт.
9. **Replay возвращает warnings[]** (premature stop codon, frame shift от deletion не кратной 3, conflict при сломанном auto-override). Идут в `asm.apiWarnings`, существующим путём.

---

## 5. Предположения

- **`applyMutation(seq, mut)` в `mutagenesis.js` чистая функция.** Источник: код mutagenesis.js:40-50. Проверено: да (`slice + concat` без state). Replay строится на ней.
- **Zustand immer поддерживает nested draft mutation на `asm.fragments[i].commits.push(...)`.** Источник: ⚓ DECISIONS 2026-03-28. Проверено: да, аналогичный паттерн используется в `addPart`/`insertFragmentAt`. Новые reducer идут по шаблону.
- **Existing `handleSaveFragment` — единственная точка inline-mutation-write.** Источник: просмотр кода. Проверено: **частично** — не грепал codebase на прямые `fragments.map(...sequence:...)`. **Действие:** первый шаг K3 — `grep -rn 'sequence:' gui/designer/src/hooks gui/designer/src/store` на предмет других mutation-writes. Если найдутся — мигрировать.
- **`crypto.randomUUID()` доступен в Vite runtime.** Источник: Vite target Chrome 92+. Проверено: **нет** — не смотрел vite.config.js в сессии. **Действие:** K1 top-level feature-detect + guard (throw в dev, fallback в prod, console.warn).
- **`pushUndo` snapshot включает nested fragment поля.** Источник: ⚓ 2026-03-28 «Manual undo/redo, 50 уровней». Проверено: **частично** — не читал реализацию pushUndo. **Действие:** первый шаг K2 — прочитать `store/index.js` pushUndo/popUndo. Если snapshot selective — добавить `baseSnapshot`/`commits` в whitelist явно.

---

## 6. Задачи

### K1 — `lib/plasmid-git.js` pure helper + тесты

**Файл:** новый `gui/designer/src/lib/plasmid-git.js`, **цель 10–14 KB**.

**Сигнатуры:**
```
bootstrapBaseSnapshot(fragment) → { sequence, annotations }
createCommit(type, parentPos, payload, label, message?, createdAt?) → Commit  // applied: true
replay(baseSnapshot, commits) → { sequence, annotations, warnings }
replayDiff(baseSnapshot, commits, cdsRegions?) → Map<ntPos, 'silent'|'nonsilent'>
resolveAutoOverride(commits, newCommit) → { commits: Commit[], overriddenId: string | null }
codonStart(ntPos) → number   // Math.floor(ntPos / 3) * 3
```

**Commit schema:** `{ id, type, parentPos, payload, label, message?, applied: bool, createdAt }`.

**Логика `replay`** (5 шагов):
1. Top-level feature-detect `crypto.randomUUID` (dev-throw/prod-fallback).
2. `activeCommits = commits.filter(c => c.applied)` отсортировать по createdAt.
3. `sequence = baseSnapshot.sequence; annotations = deepCopy(baseSnapshot.annotations); warnings = []`.
4. Iterate activeCommits: `remappedPos = parentPos + Σ(delta_prev_indels с parentPos < current.parentPos)`; `sequence = applyMutation(sequence, {type, dnaPosition: remappedPos, ...payload})`; `annotations = adjustAnnotationCoords(annotations, delta_this, remappedPos)` (helper переехал из fragmentSlice.js в lib).
5. Detect frame-shift на CDS (cumulative delta в CDS-region не кратен 3) → `warnings.push(...)`.

**Логика `resolveAutoOverride`:** если `newCommit.type` — substitution и `existing = commits.find(c => c.applied && c.type === 'substitution' && codonStart(c.parentPos) === codonStart(newCommit.parentPos))` — вернуть `{commits: commits.map(c => c.id === existing.id ? {...c, applied:false} : c), overriddenId: existing.id}`. Иначе — `{commits, overriddenId: null}`.

**Логика `replayDiff`:** iterate `activeCommits`; substitution → 3 Map entries с `aaChange.silent ? 'silent' : 'nonsilent'` (CODON_TABLE lookup); indel → skip (позиции не подсвечиваются, факт очевиден по длине).

**Тесты (~12 штук):**
1. `bootstrapBaseSnapshot` deep-copies annotations.
2. `createCommit` → uuid-id (regex `^[0-9a-f-]{36}$`), `applied: true`.
3. `replay(empty)` возвращает baseSnapshot clone.
4. Одна substitution applied → pos изменён, length тот же.
5. Одна deletion applied → length меньше, annotations сдвинуты.
6. **V22 regression:** substitution после deletion → `replayDiff` Map содержит только substitution-позицию, не хвост.
7. Два commits на одном codon через `resolveAutoOverride` → second overrides first, replay даёт second.
8. Toggle applied=false одного из двух → replay даёт только оставшийся.
9. `createdAt`-ordering детерминирует порядок replay.
10. Pure function: два вызова с теми же входами → deep-equal результаты.

Плюс ~3 вариации (ins+sub, del+ins, toggle+re-toggle) — по паттерну.

---

### K2 — store reducers + migration

**Файл:** `store/fragmentSlice.js`, `store/index.js` (migration section).

**Первый шаг K2:** прочитать `store/index.js` pushUndo/popUndo, подтвердить инклюзивность nested fragment полей. Если whitelist-based — добавить baseSnapshot/commits.

**Migration** на hydration (в `store/index.js` или existing `migrate-annotations.js` — Code выбирает):
```
for each fragment f in asm.fragments:
  if (f.sequence && !f.baseSnapshot):
    f.baseSnapshot = { sequence: f.sequence, annotations: deepCopy(f.annotations || []) }
    f.commits = []
  // legacy f.mutations[] — read-only metadata, не трогаем
```

**4 reducers (через immer draft):**

```
applyMutationGit(fragIdx, mut):
  1. pushUndo()
  2. f = state.assemblies[active].fragments[fragIdx]
  3. if (!f.baseSnapshot) bootstrap(f)
  4. commit = createCommit(mut.type, mut.dnaPosition, payload, mut.label)
  5. { commits, overriddenId } = resolveAutoOverride(f.commits, commit)
  6. f.commits = [...commits, commit]
  7. { sequence, annotations, warnings } = replay(f.baseSnapshot, f.commits)
  8. f.sequence = sequence; f.annotations = annotations; f.length = sequence.length
  9. if (overriddenId) asm.apiWarnings.push(`✏ codon ${codonStart} — ${new.label} заменил ${overridden.label} (бывший disabled)`)
  10. asm.apiWarnings.push(...replayWarnings)
  11. asm.calculated = false

toggleCommit(fragIdx, commitId):
  1. pushUndo()
  2. f.commits = f.commits.map(c => c.id === commitId ? {...c, applied: !c.applied} : c)
  3. replay → update sequence/annotations/length
  4. asm.calculated = false

archiveCommit(fragIdx, commitId):
  1. pushUndo()
  2. f.commits = f.commits.filter(c => c.id !== commitId)
  3. replay → update
  4. asm.calculated = false

setCommitMessage(fragIdx, commitId, msg):
  1. (no pushUndo — text edit, использует Ctrl+Z браузера если нужно)
  2. f.commits = f.commits.map(c => c.id === commitId ? {...c, message: msg || undefined} : c)
```

**Контроль размера.** `fragmentSlice.js` 23.09 + 4 reducers ≈ 27 KB. **Прорыв hard 25 KB.** Правило: если после K2 draft >24.5 KB — вынести 4 reducers в `lib/plasmid-git-reducers.js` factory `(set, get) => ({ applyMutationGit, toggleCommit, archiveCommit, setCommitMessage })`, в slice только `...createPlasmidGitReducers(set, get)`.

**Тесты (~7):**
1. Migration: fragment с sequence без baseSnapshot → post-hydration имеет baseSnapshot совпадающий с sequence.
2. `applyMutationGit` первый раз bootstrap + commit, sequence изменилась.
3. Auto-override: applied G26A → applyMutationGit(G26E) → G26A.applied=false, sequence = G26E-applied.
4. `toggleCommit` → applied flip, sequence пересчиталась.
5. `archiveCommit` → commit удалён, sequence пересчитана.
6. `setCommitMessage` → commit.message обновился, sequence не менялась.
7. `pushUndo` вызван в applyMutationGit/toggleCommit/archiveCommit, НЕ в setCommitMessage.

---

### K3 — `handleSaveFragment` + split-sub bootstrap

**Файл:** `hooks/useFragmentHandlers.js`.

**Первый шаг K3:** `grep -rn 'sequence:' gui/designer/src/hooks gui/designer/src/store` на предмет других inline-mutation-writes вне handleSaveFragment. Если найдутся — мигрировать.

**Логика handleSaveFragment (переписать mutation-path):**
1. `hasMutations = ...` как сейчас.
2. `newMuts = updated.mutations.filter(not in original.mutations)` + normalize.
3. Для каждой newMut → `applyMutationGit(editTarget, normalizedMut)`. Reducer сам делает replay + auto-override.
4. `updated.sequence`, `updated.mutations` больше не используются для прямого write — только как входные данные для шага 3.

**Split-path (`result.strategy === 'two_fragment' | 'multi_fragment'`):** при создании `newFragments` в mapping каждому sub назначаем:
```
baseSnapshot: { sequence: sf.sequence, annotations: trimAnnotationsForSubFragment(...) }
commits: []
```
Это гарантирует: при первом inline-edit на sub reducer не будет bootstrap заново (baseSnapshot уже правильно инициализирован «чистым» sub.sequence, не текущим mutant-state).

**KLD-path:** fragment заменяется на mutant целиком. Новый KLD-fragment тоже получает `baseSnapshot: { sequence: updated.sequence (mutant), annotations }`, `commits: []`. Post-KLD последующие inline-edits на этот fragment создадут новые commits поверх mutant-baseline.

**Тесты (+4 в `hooks/__tests__/useFragmentHandlers.test.js`):**
1. Inline substitution on vanilla fragment → commits.length=1, bootstrap произошёл.
2. Two inline substitutions на одном codon → second override first (auto), applied состояние корректное.
3. Split-path: sub-fragments после save имеют baseSnapshot=sub.sequence, commits=[].
4. KLD-path: пост-KLD fragment имеет baseSnapshot совпадающий с mutant sequence, commits=[].

---

### K4 — `highlights.js` replay-aware (закрывает V22 полностью)

**Файл:** `components/FragmentEditor/highlights.js`.

**Новая логика в `computeMutationHighlights(fragment, parent)`:**
```
// Git-path — primary, покрывает и non-split, и split-sub
if (fragment.commits?.length > 0 && fragment.baseSnapshot):
  cdsRegions = (fragment.annotations || []).filter(a => a.level === 'region' && (a.type === 'CDS' || a.type === 'gene'))
  return replayDiff(fragment.baseSnapshot, fragment.commits, cdsRegions)

// Legacy paths (backward-compat для fragments до Sprint X)
if (parent?.sequence):
  // K9/V16 sequenceDiff path, работает для equal-length substitutions
  ...existing logic
else:
  // mutation-list fallback
  ...existing logic
```

**V22 regression:** split-sub HygroR_2 (templateStart=42) с inline deletion + substitution → fragment получил commits[] с deletion+substitution → `computeMutationHighlights` идёт через `replayDiff` → deletion skipped, substitution на верной HEAD-координате, хвоста нет.

**Тесты (+4 в `FragmentEditor/__tests__/highlights.test.js`):**
1. Fragment с baseSnapshot + 1 substitution commit → Map size 3, nonsilent.
2. Fragment с baseSnapshot + deletion + substitution commit → Map содержит только substitution-позицию (V22 regression direct).
3. Split-sub fragment с commits → replayDiff path (V22 closed для главного WF).
4. Fragment без commits (legacy) → parent-sequenceDiff path продолжает работать.

---

### K5 — `EditorPanels.jsx` Mutations UX + diff view + legacy lock

**Файлы:** `components/FragmentEditor/EditorPanels.jsx` (+ новый prop drilling через `index.jsx`).

**Mutations panel переделан.** Каждая запись:
- `commit.id` присутствует (Git-aware):
  - Active (`applied: true`): фиолетовый фон, label, опциональный message серым мелким под label, ✕ toggle-off (tooltip «Отключить мутацию, sequence откатится. Повторный клик вернёт»), pencil inline-edit message, 🗑 archive отдельной кнопкой (confirm `«Удалить {label}? Это действие нельзя отменить через ✕.»`).
  - Disabled (`applied: false`): серый фон, strikethrough label, ✓ toggle-on (вернуть), 🗑 archive.
- `commit.id` отсутствует (legacy mutation): 🔒 lock icon, серый фон, `pointer-events: none` на все кнопки, tooltip «Legacy-мутация. Revert недоступен. Создайте variant через Part library.».

**Group-by-codon для substitutions:**
```
G26:
  [✓ G26E  "rational, glutamate"]   ✕  ✎  🗑
  [○ G26A  — ]                      ✓  ✎  🗑
  [○ G26V  "первая попытка"]        ✓  ✎  🗑

R135:
  [✓ R135A]                         ✕  ✎  🗑
```
Group header — `{codon AA}{codon#}:` (берём fromAA + 1-based codon# из первого commit). Non-substitution commits (deletion/insertion) идут отдельной группой «Прочее» без grouping.

**Diff view toggle** в header Editor:
- Кнопка «⇌ Сравнить с baseline» рядом с mode-switcher.
- Active → sequence grid показывает `baseSnapshot.sequence`, highlight-overlay: позиции применённых substitutions красным, позиции indel подчёркиваются amber (вставка) / серым (удалённый фрагмент вычёркнут). Mode switcher (Правка/Мутагенез) disabled в diff mode. Кнопка «✕ Закрыть diff» возвращает к HEAD view.
- Если fragment.commits пустой → кнопка disabled с tooltip «Нет применённых мутаций».

**Commit message inline edit:**
- Hover на commit-entry → pencil icon ✎.
- Click pencil → message становится `<input type="text" maxlength=80>` с autofocus.
- Enter / blur → `onSetMessage(commitId, value)`.
- Esc → отменить (вернуть предыдущее).

**Contract extension** — `EditorPanels` получает новые props:
```
commits: Commit[]                    // в доп к existing mutations[]
onToggleCommit(commitId)
onArchiveCommit(commitId)            // сам делает confirm внутри — или wrapper в index.jsx
onSetMessage(commitId, msg)
diffViewActive: boolean              // из FragmentEditor/index.jsx state
onToggleDiffView()
```

`index.jsx` прокидывает через `useStore.toggleCommit`/`archiveCommit`/`setCommitMessage` actions. Local `diffViewActive` useState. Sequence grid render branches на `diffViewActive`.

**Размер оценка:** 9.39 → 12-13 KB (group logic + diff-view toggle + inline-edit + legacy lock ≈ 3 KB). Под 40 hard OK.

**Тесты (+6 в `EditorPanels.test.jsx`):**
1. Commit active → toggle ✕ → `onToggleCommit(id)` вызван.
2. Commit disabled → ✓ вернуть → `onToggleCommit(id)` вызван.
3. Archive 🗑 → native confirm → OK → `onArchiveCommit(id)` вызван; Cancel → no-op.
4. Inline edit message → pencil → input → Enter → `onSetMessage(id, value)`.
5. Legacy mutation (без commit.id) → 🔒 render, все buttons `pointer-events: none`.
6. Group-by-codon: три substitution на одном codon → один group с тремя items, active с ✓, disabled с ○.

Плюс 1 integration-тест: diff view toggle меняет sequence grid на baseSnapshot.

---

### K6 — V24 self-closure primers + ActionBar badge

**Файл:** `local-primer-design.js`, `components/ActionBar.jsx` (или где рендерится actionbar — Code грепнет).

**Логика в `designPrimersLocal`** (вставка перед существующим early-return 201-206):
```
if (fragments.length === 1) {
  if (!circular) return existing behavior (no primers + warning)
  // V24: single circular → self-closure
  frag = fragments[0]; seq = frag.sequence.toUpperCase(); halfOverlap = 15
  fwdTail = rc(seq.slice(0, halfOverlap))     // замыкание через RC начала
  fwdBinding = findBindingTagAware(seq, 'forward', tmTarget, frag.annotations)
  revTail = seq.slice(-halfOverlap)            // прямой концевой tail
  revBinding = findBindingTagAware(seq, 'reverse', tmTarget, frag.annotations)
  push 2 primers с purpose: 'self-closure', tailPurpose: 'circular self-closure tail'
  return { primers, warnings: [] }
}
```

**ActionBar badge.** Code ищет файл где текущий «Протокол»/«Заказ олигов» рендерится рядом с primers. Добавить условный рендер:
```
if (primers[0]?.purpose === 'self-closure')
  <Badge>Режим: Self-closure (single circular, +30 bp замыкающий overlap)</Badge>
```
Badge стиль — как существующие badges в ActionBar (Tailwind bg-amber-50/text-amber-700 или аналог). Если таких нет — простой `<div className="text-xs text-gray-600 italic">...</div>`.

**Тесты (+3):**
1. Single linear fragment → primers=[], warnings есть (regression existing behavior).
2. Single circular fragment → primers.length===2, fwd.tailSequence = rc(seq.slice(0,15)), rev.tailSequence = seq.slice(-15), purpose='self-closure'.
3. Single circular fragment → в ActionBar render badge (integration).

---

## 7. Порядок и оценка

**Порядок:** K1 → K2 → K3 → K4 → K5 → K6. K1 база для K2/K4. K3 использует K2. K4 использует K1 `replayDiff`. K5 использует K2 reducers. K6 независим.

**Оценка Code: ~15–18 ч.** На границе «делить на Sprint X-A (K1–K4, data-model + V22/V27 замыкание) + Sprint X-B (K5 UX + K6 V24)». Если Code после K4 чувствует, что не укладывается — STOP-фраза, Игорь решает. Иначе K5/K6 продолжаются в том же спринте.

---

## 8. STOP-условие и формат отчёта

### STOP

После K6 Code останавливается. НЕ обновляет PROJECT_STATE / DECISIONS / BUGS, не перемещает спеку в archive, не начинает Map-WS-2, не трогает OPEN баги вне скоупа.

### Формат отчёта

Code дописывает в конец `CURRENT_TASK.md`:

```
## Отчёт Code по Sprint X Plasmid-Git

- K1 коммит: `<hash>` — feat(plasmid-git): lib/plasmid-git.js + tests
- K2 коммит: `<hash>` — feat(fragmentSlice): Git reducers + migration + auto-override
- K3 коммит: `<hash>` — refactor(useFragmentHandlers): all mutation-writes through Git, split-sub bootstrap
- K4 коммит: `<hash>` — fix(V22): highlights.js replay-aware for non-split + split-sub
- K5 коммит: `<hash>` — fix(V27) + feat: toggle/archive/message/diff-view UX + legacy lock
- K6 коммит: `<hash>` — fix(V24): single-circular self-closure primers + ActionBar badge
- Изменения размеров:
  - fragmentSlice.js: 23.09 → X KB (hard 25 — OK/WARN/FAIL; если WARN/FAIL применено правило вынос в lib/plasmid-git-reducers.js)
  - useFragmentHandlers.js: 20.29 → X KB
  - FragmentEditor/index.jsx: 35.57 → X KB
  - EditorPanels.jsx: 9.39 → X KB (ожидание ~12-13)
  - highlights.js: 3.54 → X KB
  - local-primer-design.js: 15.63 → X KB
- Новые файлы: lib/plasmid-git.js (X KB), lib/__tests__/plasmid-git.test.js (+N тестов), возможно lib/plasmid-git-reducers.js (если применено правило §9 риск 1)
- Vitest: N/N (baseline 774, ожидание 774 + ΔN, где ΔN ≈ 25–35 согласно ⚓ 22.04 «тесты соразмерны коду» — на границе, больше из-за 6 подзадач)
- pytest: 112/112 (backend не трогался)
- vite build: clean | pre-existing warnings: <list>
- Отклонения от спеки (§3/§4/§6): <явный список или «нет»>
- Migration sanity: загрузить сохранённый проект (через UI import .bodgegene или fixture в __tests__) → fragments получили baseSnapshot, sequence/length не изменились.
- Size budget итог: OK / WARN (fragmentSlice X/25) / FAIL — в последнем случае указать применённую митигацию.
```

---

## 9. Риски

1. **`fragmentSlice.js` перевалит hard 25 KB.** Митигация (жёсткое правило): если после K2 draft ≥24.5 KB — вынести 4 reducers в `lib/plasmid-git-reducers.js` factory, в slice `...createPlasmidGitReducers(set, get)`.
2. **Migration ломает старые проекты.** Сохранённые `.bodgegene` с legacy `mutations[]` — bootstrap возьмёт applied-sequence как baseline, мутации «замёрзнут». Revert legacy недоступен. Митигация: K2 тест migration sanity + UI 🔒 badge для legacy + tooltip как продолжить (создать variant через Part library).
3. **Auto-override может перекрыть нужную мутацию, если biolog применил не-substitution на тот же codon.** Митигация: auto-override **только** для substitution-commits на substitution (logic §4 п.5). Indel на ту же позицию не срабатывает — иначе биолог теряет deletion. Тест K1 #7 проверяет только substitution-substitution override.
4. **`crypto.randomUUID()` недоступен в target runtime.** Митигация: K1 top-level feature-detect + fallback (⚓ §4 п.7).
5. **Snapshot pushUndo не включает nested commits.** Митигация: K2 первый шаг — прочитать pushUndo, добавить whitelist если нужно.
6. **User-added annotations теряются при toggle commit.** Это **honest limitation §3 OUT**. Митигация: UI hint в Editor при открытии Mutations panel впервые: «Добавляйте аннотации до применения мутаций». Отдельный спринт для event-sourcing annotations если окажется критично.
7. **Diff view на большом fragment (10+ KB) тормозит.** Митигация: diff-view render использует ту же character-grid что sequence view, sequence-level diff маркап вычисляется через `replayDiff` (O(commits), не O(sequence)). Проверить на HygroR (1 KB) и pDHG25 (6 KB) визуально в приёмке.

---

## 10. Открытые вопросы

1. **Group-by-codon UI.** Предложение §6 K5 — группировать substitutions по codon, остальное в «Прочее». Альтернатива — flat list без grouping. Group удобен при 5+ попытках на одном codon, избыточен при 1–2 substitutions. Default: group-by-codon. Жду решения, если биологу привычнее flat — скажи.
2. **Auto-override для indel на тот же codon?** §4 п.5 purposefully ограничено substitution-substitution. Если биолог делает `Δ25-27` (deletion 3 nt) и потом хочет заменить на `Δ25-30` (6 nt) — auto-override не сработает, оба deletions применятся последовательно. Возможно нужен override для indel-на-пересекающемся-range, но это сложная логика (как определить «пересечение»?). Default: оставить substitution-only, indel конфликты — через manual toggle/archive.
3. **Diff view — где именно показывать?** Sequence grid верх / отдельная нижняя панель / отдельная модалка? Default: toggle в sequence grid (самый минимальный UX, Sequence view уже primary в K10 Unified Editor). Если нужна отдельная панель/модалка — K5 размер +2-3 KB.

---

_Шаблон v1.0 — 21.04.2026. Синхронизирован с CHAT_PLAYBOOK.md §2._
