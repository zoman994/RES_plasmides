# Sprint X-fix — mutation-apply routed through Git + Create-Assembly + Save-as-Part

**Статус:** ✅ РЕАЛИЗОВАНО 26.04.2026 (в рамках финализации цикла Sprint X / X-fix / X-fix-2 / X-fix-3; приёмка на EGFP с 5 сценариями PASS).

**Тип:** bugfix (подключение уже реализованной Git-модели к main workflow) + extension (K5 single-linear primers)
**База:** v0.5.1-alpha, commit `8699bf5` (Sprint 2a.1 FragmentEditor/EditorPanels extract) + неокоммиченная Sprint X Plasmid-Git ветка (K1–K6 уже в рабочем дереве).
**Предпосылка:** визуальная приёмка Sprint X Блок 1 (23.04.2026) дала FAIL — Git-модель сделана, но `FragmentEditor::handleSaveMutagenesis` отправляет локальные `mutations[]` через `onSave → handleSaveFragment`, который идёт старым путём (Sprint 1.5 variant-flow: Part-child + strategy engine + split). `applyMutationGit` не вызывается, `fragment.commits[]` всегда пустой, UI показывает локальный state как legacy 🔒-lock. Sprint X-fix замыкает main workflow на Git + разделяет commit / assembly / save-as-part на явные операции.

---

## 0. Срез размеров затрагиваемых модулей

Снимок 23.04.2026:

| Файл | Размер | Лимит | Зона |
|------|--------|-------|------|
| `components/FragmentEditor/index.jsx` | **37.97 KB** | 40 KB hard | **soft** (warning 30 KB — risk-bullet в §9) |
| `components/FragmentEditor/EditorPanels.jsx` | 14.90 KB | 40 KB hard | OK |
| `components/FragmentEditor/highlights.js` | 4.25 KB | 25 KB hard | OK (не трогаем — Git-aware path уже есть) |
| `hooks/useFragmentHandlers.js` | 21.11 KB | 25 KB hard | soft (warning 20 KB — risk-bullet) |
| `store/fragmentSlice.js` | 23.37 KB | 25 KB hard | soft, не меняется |
| `lib/plasmid-git.js` | 9.20 KB | 25 KB hard | OK |
| `lib/plasmid-git-reducers.js` | 4.19 KB | 25 KB hard | OK, не меняется |
| `local-primer-design.js` | ~15.6 KB | 25 KB hard | OK |

**FragmentEditor/index.jsx близок к hard 40 KB.** Правки K1–K3 добавляют 2 кнопки в header + 2 handler'а + store-hook. Прирост оценочно 1.5–2.5 KB. Risk-bullet в §9: если Code видит прирост >2 KB (итого ≥40 KB) — остановиться и просить mini-spec на декомпозицию header/footer в подкомпоненты.

**useFragmentHandlers.js в soft.** K4 удаляет mutation-path (−~80 строк) и добавляет `handleCreateMutagenesisAssembly` (~60 строк) — net около нуля или небольшое уменьшение. Риск прорыва soft→hard есть, но ниже: прирост отрицательный.

---

## 0.5. Ответы Игоря на kickoff-интервью 23.04.2026

Источник правды. Снимок Q/A на момент интервью — не правится после написания.

**Scope:**

- **Q1:** Твиндвижок «Part-child + Git commits» — для каких фрагментов Part-child сохраняется при «💾 Сохранить как запчасть»?
  **A:** «На твое усмотрение, подумай как бы было удобнее для биологов.» → **Решение Chat:** единая модель (b) — Part-child сохраняется для всех фрагментов (circular и linear). Обоснование: и linear CDS, и circular plasmid в лабораторной практике нужны как re-usable именованные варианты; единая модель убирает branching в UI и меньше mental load для биолога. Если Игорь не возражает против (b) — закрепляем в §4.1.

- **Q2:** «Применить мутагенез» в mode=Мутагенез — что делает на canvas?
  **A:** После обсуждения развилок (мгновенный split / отложенный split / гибрид-порог) принят **вариант (a) — отложенный split.** «Применить мутагенез» → commit в `fragment.commits[]`, фрагмент остаётся целым блоком на canvas. Split откладывается на отдельную кнопку «🧬 Создать сборку мутагенеза» (видна при `commits.some(applied)`). Главный аргумент — архитектурный: без отложенного split commits становятся write-only metadata и V27 не закрывается; accumulation mode соответствует mental-model «я работаю с белком, хочу внести 5 замен» (Benchling/SnapGene).

**Что не обсуждалось (assumption'ы для §5):**

- **Точное имя кнопки «Создать сборку».** Chat предлагает «🧬 Создать сборку мутагенеза» — если Игорь хочет короче («🧬 Собрать», «🧬 На canvas»), меняется одной строкой.
- **Legacy mutation-path в `handleSaveFragment`:** удалить полностью или оставить как deprecated branch. Chat предлагает **удалить** — никто больше не вызывает с `mutations` после K1. Риск тихого пропадания mutations при external calls митигируется console.warn в debug-билде.
- **Копировать ли `commits[]` в Part-child при «Сохранить как запчасть».** Chat предлагает **включать optional metadata** — помогает трекингу origin варианта. Sequence Part-child берётся из replay (HEAD state), не из baseline.

---

## 1. Контекст

Sprint X Plasmid-Git доставил всю инфраструктуру:

- `lib/plasmid-git.js` — pure helpers (bootstrap, createCommit, replay с indel coord-remap, replayDiff, resolveAutoOverride, adjustAnnotationCoords).
- `lib/plasmid-git-reducers.js` — 4 reducer'а (applyMutationGit, toggleCommit, archiveCommit, setCommitMessage), factory подключен в `fragmentSlice.js::createFragmentSlice` через spread `...createPlasmidGitReducers(set, get)`.
- `store/index.js` migration — fragments без `baseSnapshot` получают его при hydration.
- `components/FragmentEditor/highlights.js` — Git-aware replay-diff path как Priority 1, legacy parent-sequenceDiff как Priority 2. V22 (HIGHLIGHT-INDEL-TAIL) закрыт автоматически как только commits попадут в fragment.
- `components/FragmentEditor/EditorPanels.jsx` — полный Mutations UX: `CommitRow` с toggle ✕/✓, archive 🗑 (confirm), inline-edit message ✎, `groupCommits` по codon для substitutions, `LegacyMutationRow` с 🔒 pointer-events:none для commits без id.
- `components/FragmentEditor/index.jsx` — `diffViewActive` state, toggle «⇌ Сравнить с baseline» в header, пробрасывает handler'ы toggleCommit/archiveCommit/setCommitMessage из store в EditorPanels через props.
- `local-primer-design.js` — K6 Sprint X self-closure primers для `fragments.length===1 && circular` (V24 закрыт).

**Что не работает (root cause FAIL):**

`FragmentEditor::handleSaveMutagenesis` (строка ~540 `index.jsx`) отправляет local state `mutations[]` + `seq` через `onSave({ ...fragment, mutations, sequence })` → `useFragmentHandlers::handleSaveFragment` (строка ~100 `useFragmentHandlers.js`). Последний:

1. Находит `rootPart`, создаёт Part-child в `parts` (через `addPart`).
2. Вызывает `computeMutagenesisStrategy(templateSeq, normMuts, { fragmentContext })` → `buildMutagenesisPayload`.
3. Для split-path: создаёт `newFragments` с `baseSnapshot: { sequence: sf.sequence, annotations: trimmed }` и `commits: []`, заменяет target fragment в массиве, добавляет strategyJunctions.
4. Для KLD-path: заменяет fragment на mutant с `baseSnapshot: { sequence: updated.sequence, ... }` и `commits: []`.

`applyMutationGit` не вызывается нигде в этом потоке. `baseSnapshot` **бутстрапится правильно**, но `commits[]` остаётся пустым. UI `EditorPanels.jsx`:
- `hasGit = commits.length > 0 && onToggleCommit && onArchiveCommit` → **false** (commits пустой).
- `hasLegacy = mutations.length > 0` → true (из local state `fragment.mutations`).
- Рендерится только `LegacyMutationRow` ветка → 🔒 lock badge → `pointer-events: none` → revert недоступен.

Побочно не работает и заявленный в исходной спеке Sprint X scope:
- **V22** не закрывается, потому что через legacy split-path `fragment.commits[]` никогда не наполняется, `highlights.js` Priority 1 branch не активируется. Priority 2 (parent-sequenceDiff) не покрывает indels.
- **V27** формально отсутствует (в Mutations panel нет ✕ на legacy items), но фактически защита не полная — биолог видит немотивированный 🔒 вместо обратимого toggle.

Плюс новая находка 23.04 от Игоря — **U2 SINGLE-LINEAR-NO-PRIMERS (Высокий).** Single linear fragment попадает в early-return `designPrimersLocal` (`fragments.length===1 && !circular` ветка — «не требуются», только warnings). Биологически single linear всё равно нужно ПЦРить с концевыми праймерами без tails. K6 Sprint X закрыл только circular-ветку.

Ссылки: `BUGS.md` V22/V24/V27 + секция `CURRENT_TASK.md` «Новые находки» (U1/U2/V32) + `docs/SPRINT_X_PLASMID_GIT.md` K3.

---

## 2. Стратегия

Подключить существующий `applyMutationGit` к mutation-apply handler FragmentEditor (K1) — так каждое «Применить мутагенез» создаёт commit в Git и фрагмент остаётся целым. Вынести strategy-engine + split из `handleSaveFragment` в новый явный handler `handleCreateMutagenesisAssembly`, триггерящийся отдельной кнопкой «🧬 Создать сборку мутагенеза» (K2, закрывает Q2=a). Переработать «💾 Сохранить как запчасть» так, чтобы кнопка была видна при любых applied commits на фрагменте любой топологии, использовала `liveFragment.sequence` из replay и прокладывала `commits[]` в Part-child как metadata (K3, закрывает Q1=b). Очистить `handleSaveFragment` от устаревшего mutation-path: bookkeeping-edit и mutagenesis теперь физически разные точки записи в store (K4). Отдельно закрыть U2 расширением K6 Sprint X на single-linear ветку с концевыми primers без tails (K5).

---

## 3. Scope

### IN

- **`components/FragmentEditor/index.jsx`**:
  - `handleSaveMutagenesis` переписан — для каждой мутации в local `mutations[]` вызывает `applyMutationGit(fragIdx, normalized)` из store. Local state `mutations`/`seq` очищается после успеха; `onSave` не вызывается.
  - `handleSaveEdit` (mode='edit') остаётся прежним: `onSave({...fragment, sequence: seq, annotations, ...})` без mutations — bookkeeping-edit через прежний `handleSaveFragment` путь.
  - Новая кнопка «🧬 Создать сборку мутагенеза (N)» в header Editor справа от topology toggle или в footer рядом с Save — Code выбирает место, предпочтительно рядом с Save для видимости. Видна при `hasAppliedCommits = commits.some(c => c.applied !== false)`. Счётчик N = количество applied commits. Клик → новый prop callback `onCreateAssembly` (прокидывается через App.jsx → useFragmentHandlers → handleCreateMutagenesisAssembly).
  - Кнопка «💾 Сохранить как запчасть» отделяется от текущей «🔀 Как вариант» (она завязана на `seqChanged && mode === 'mutagenesis'`). Новая кнопка видна при `hasAppliedCommits` в любом mode (не только mutagenesis — биолог может в bookkeeping-режиме увидеть panel commits и решить зафиксировать). Текст иконка «💾 Сохранить как запчасть». Использует `liveFragment.sequence` из store. Существующую «🔀 Как вариант» оставить как есть для совместимости с seqChanged-путём — она триггерится при non-Git manual edits (mode=mutagenesis с ручной правкой seq без commits). Расхождение между двумя кнопками документируется tooltip'ами.
  - Добавить `applyMutationGit` в список store-hooks в верхней части компонента рядом с `toggleCommit`/`archiveCommit`/`setCommitMessage`.
  - `liveFragment.commits` в live-subscription уже есть, переиспользуем.

- **`hooks/useFragmentHandlers.js`**:
  - Удалён mutation-path из `handleSaveFragment`: условие `if (!hasMutations) { ...bookkeeping write-back... return; }` становится единственной веткой (с переименованием или без — Code решает). Все строки от `// ── Mutagenesis path ──` до конца функции удаляются.
  - Новый handler `handleCreateMutagenesisAssembly(fragIndex)`: читает `active.fragments[fragIndex]`, собирает applied commits → normMuts через существующий inline-normalizer (вытаскиваемый в local helper `commitToStrategyMut`), вызывает `computeMutagenesisStrategy` + `buildMutagenesisPayload`, обрабатывает split-path / KLD-path (тот же код что был в старом handleSaveFragment, но читает commits вместо local mutations). Новые fragments получают `baseSnapshot = { sequence: sf.sequence, annotations: trimmedAnn }` и `commits: []` — как K3 Sprint X и задумывал. После успеха: commits source-фрагмента не стираются (они в истории); sub-fragments получают fresh baseline из своей sub-последовательности.
  - Helper `commitToStrategyMut(commit)` — 5–8 строк, конвертирует Git-commit в mutation-object для strategy engine. Local helper, не export.
  - Обновлённая signature return: добавить `handleCreateMutagenesisAssembly` в return object.

- **App.jsx** — прокинуть `handleCreateMutagenesisAssembly` из useFragmentHandlers в FragmentEditor как prop `onCreateAssembly`. Code грепнет место текущего рендера FragmentEditor и добавит prop.

- **`local-primer-design.js`** — расширить single-fragment early-return branch (строки ~201–246) на single-linear case (U2). Сразу после существующего `if (isCircular && seq.length >= 40)` блока (K6 Sprint X), до финального `warnings.push(...`) и `return`: добавить `else if (!isCircular && seq.length >= 36)` ветку — 2 концевых primer без tails: `fwdBinding.sequence` + `rc(revBinding.sequence)`, `purpose: 'terminal-pcr'`, `tailSequence: ''`. ActionBar badge-branch (если Code видит) — проверить, что `primers[0].purpose === 'terminal-pcr'` тоже даёт корректный рендер (либо отдельный badge «Режим: концевая ПЦР», либо общий «Режим: single-fragment PCR» с разветвлением по purpose — Code решает по consistency с self-closure badge).

- **Тесты Vitest:**
  - `hooks/__tests__/useFragmentHandlers.test.js` (+3):
    1. `handleSaveFragment` с `updated.mutations.length > 0` → mutations **игнорируются**, sequence сохраняется, Part-child **не создаётся** (регрессия-guard удаления mutation-path).
    2. `handleCreateMutagenesisAssembly(idx)` на fragment с 1 applied substitution commit → `asm.fragments` длина сохранилась (KLD strategy), primers.length === 2, apiWarnings чистые.
    3. `handleCreateMutagenesisAssembly(idx)` на fragment с 3 applied substitution commits spread across 400 bp → strategy='two_fragment' или 'multi_fragment', split произошёл, каждый sub получил `baseSnapshot` ≠ null и `commits: []`.
  - `components/FragmentEditor/__tests__/FragmentEditor.test.jsx` (+3):
    1. Click «Применить мутагенез» на fragment без predicates mutations → no-op (disabled при mutations.length===0 — уже реализовано).
    2. Click «Применить мутагенез» с 1 accumulated local mutation → `applyMutationGit` вызван 1 раз с нормализованным payload (substitution), `mutations` локальный очищен (через `setMutations([])`).
    3. Кнопка «🧬 Создать сборку мутагенеза» — visible при `hasAppliedCommits`, disabled/hidden когда commits пуст.
  - `local-primer-design.test.js` (+2):
    1. `designPrimersLocal([frag], [], false)` на linear 500-bp → primers.length === 2, purpose='terminal-pcr', tailSequence пустой.
    2. Single linear <36 bp → warning без primers (regression guard).

### OUT (явно отложено)

- Удаление legacy `fragment.mutations[]` поля из Part model и fragment schema — backward compat, Part-child продолжает нести mutations metadata (для старых проектов без commits). Отдельный cleanup-sprint если потребуется.
- `MutagenesisWizard` отдельный flow и `handleMutagenesis` в useFragmentHandlers — они работают вне FragmentEditor через свой вход. Пересмотр их на Git-путь — отдельный спринт (не критично, так как UI wizard — for-batch случай, а не iterative).
- Visual UX для состояния "есть применённые commits, но сборка не создана" — сейчас ActionBar canvas-level ничего не показывает. Глобальная ActionBar-подсказка типа «У вас N applied commits на N fragments, 🧬 Создать сборку?» — в §10 как open question для UX-спринта.
- PlasmidViewer V32 `topology: 'linear'` render как circular — отдельный UX спринт или Sprint UX-1.
- U1 AA-numbering tooltip — мелкая UX-правка, Sprint UX-1.
- V23 ORTHOGONAL_OVERHANGS_4 palindromes — отдельный спринт.
- Diff-view на большом fragment с перформансом — в исходной Sprint X §9 риск 7, не проявился в приёмке Блок 1 (до diff-view не дошли). Проверить визуально если K1 закроется и биолог дойдёт до V22 сценария на HygroR split.

---

## 4. Архитектурные решения

1. **⚓ Q1 (b): «Сохранить как запчасть» — единая модель для всех фрагментов.** Part-child создаётся одинаково для circular и linear. Sequence берётся из `liveFragment.sequence` (HEAD через replay). Обоснование — см. §0.5 Q1.
2. **⚓ Q2 (a): «Применить мутагенез» — отложенный split.** Commit в `fragment.commits[]`, фрагмент на canvas не разделяется. Split — отдельная кнопка. Обоснование — §0.5 Q2 и разбор trade-offs: accumulation-mode биологически, V27 автоматически закрывается, strategy-engine вызывается 1 раз при «Создать сборку» вместо 5 раз при каждом apply (закрывает побочно половину V20 микро-PCR).
3. **Phantom state `mutations[]` в `FragmentEditor` локальный (useState) vs `fragment.commits[]` в store.** Локальный `mutations[]` — UI-buffer для накопления до нажатия «Применить мутагенез». После apply — `mutations[]` очищается, actual state живёт в `liveFragment.commits`. Нет попыток синхронизировать их в обе стороны — direction единая: local → store. Это упрощает mental model и избегает двойного source-of-truth.
4. **Split при «Создать сборку» использует existing `computeMutagenesisStrategy` без изменений.** Это ключевая интеграционная точка: strategy-engine принимает `normMuts[]` — тот же shape что и раньше. `commitToStrategyMut(commit)` — 5–8-строчный адаптер `Commit → normMut`. Переписывать strategy-engine не нужно.
5. **Sub-fragments после split получают свежий `baseSnapshot: { sequence: sf.sequence, annotations: trimmedAnn }` и `commits: []`.** Текущий код `handleSaveFragment` split-path это уже делает (К3 Sprint X это реализовал частично корректно). Перенос в `handleCreateMutagenesisAssembly` сохраняет эту логику. Биологически корректно: sub после split — это новый артефакт (PCR-фрагмент), его baseline — sub.sequence на момент split'а.
6. **Commits source-фрагмента НЕ стираются при split.** После «Создать сборку» target fragment заменяется массивом sub-fragments, но оригинал уходит из `active.fragments` (replace). Его commits история теряется вместе с fragment'ом — это ожидаемо (fragment больше не существует как целый). Альтернатива — хранить «archived fragments» с commits — out of scope.
7. **`handleSaveFragment` mutation-path удаляется.** К1 в FragmentEditor больше не отправляет `mutations` через `onSave`. Для защиты от внешних вызовов (TypeScript-отсутствующий проект) — не добавляем warning/error, просто игнорируем `updated.mutations` при save. Если external caller пошлёт mutations — они просто не применятся. §9 risk 2.
8. **Part-child при «Сохранить как запчасть» несёт `commits[]` как metadata optional поле.** Это не меняет sequence Part (она =replay), но помогает при reimport — можно показать «этот вариант получен из HygroR + 5 commits». `Part.mutations[]` (legacy) тоже сохраняется для compat. Новое поле `Part.sourceCommits[]` — snapshot commits array на момент save.
9. **K5 single-linear primers — minimum viable.** Концевые fwd/rev без tails. Нет smart `needsAmplification=false` branch — если биолог пометил single linear «без ПЦР», получит warning из existing logic, не primers. Не усложняем за один спринт.

---

## 5. Предположения

1. **`applyMutation(seq, mut)` в `mutagenesis.js` корректно работает на позиции 0 и на `seq.length-1`.** Источник: `lib/plasmid-git.js::replay` использует его напрямую, тесты K1 Sprint X проходят. Проверено: **да** (через существующие тесты `plasmid-git.test.js`).
2. **`useStore(s => s.applyMutationGit)` возвращает reducer, не undefined.** Источник: `fragmentSlice.js::createFragmentSlice` прямо в начале делает `...createPlasmidGitReducers(set, get)` — все 4 reducer'а доступны как store actions. Проверено: **да** (grep в `fragmentSlice.js` строка 76 явно подтверждает).
3. **Live-subscription `liveFragment = useStore(s => asm.fragments.find(f => f.id === fragment.id))` ре-рендерит FragmentEditor при изменении `commits` в store через reducer.** Zustand subscribe на shallow-equality (это default поведение `useStore` без custom compare). При `applyMutationGit` reducer делает `f.commits = [...withDisabled, commit]` (новая ссылка) → shallow-compare даёт false → re-render. Проверено: **да** (паттерн работает для `toggleCommit` и `archiveCommit` уже сейчас по K5 Sprint X).
4. **`fragIdx >= 0` всегда true когда FragmentEditor открыт.** FragmentEditor монтируется через `editTarget !== null` (useFragmentHandlers), прокидывает `fragment` prop. Но edge case — `fragIdx = -1` из `findIndex` если fragment был удалён из store между open и apply. Источник: просмотр кода. Проверено: **частично** — защита уже есть в existing handlers (`if (fragIdx >= 0) toggleCommit(...)`), K1 должен следовать паттерну. **Действие:** в K1 каждый вызов `applyMutationGit` обернуть в `if (fragIdx >= 0)`. Если fragIdx=-1 при клике «Применить мутагенез» — тихо `onClose()`, без ошибки (fragment уже не существует, applying бессмысленно).
5. **`computeMutagenesisStrategy` идемпотентна по fragmentContext.** Источник: текущий `handleSaveFragment` уже вызывает её с `fragmentContext = { topology, isStandalone, length }`. Для `handleCreateMutagenesisAssembly` мы передаём точно тот же объект. Проверено: **да** (используем тот же путь).
6. **`crypto.randomUUID` доступен runtime.** Источник: `plasmid-git.js` top-level feature-detect с dev-throw. Проверено: **да** (Sprint X K1 прошёл тесты).
7. **ActionBar рендерится где-то, где `primers[0]?.purpose === 'self-closure'` уже распознан для K6 badge.** Источник: §3 CURRENT_TASK skeleton ссылался на `components/ActionBar.jsx` но не было подтверждено. Проверено: **нет** — Chat не грепал ActionBar в этой сессии. **Действие:** K5 первый шаг — Code грепнет `grep -rn "self-closure\|tailPurpose" gui/designer/src/components/` на предмет badge-render branch, если найдёт — расширяет, если нет — заводит минимальный. Этот шаг не блокирует K1–K4.

---

## 6. Задачи

### K1 — `handleSaveMutagenesis` → `applyMutationGit`

**Файл:** `components/FragmentEditor/index.jsx`, функция `handleSaveMutagenesis` (примерно строка 540, рядом с `handleSaveEdit`).

**Что делаем:** переписать `handleSaveMutagenesis` так, чтобы он не вызывал `onSave` с mutations, а для каждой локальной `mutations[]` запись делал store action `applyMutationGit(fragIdx, normalized)`. После успеха очистить local state и закрыть editor.

**Шаги (не код, логика):**

1. Проверить `if (mutations.length === 0) return onClose();` — защита от пустого нажатия (кнопка и так disabled, но на всякий).
2. Проверить `if (fragIdx < 0) return onClose();` — fragment мог быть удалён.
3. Для каждой `m` в `mutations[]`:
   - Нормализовать в shape `{ type, dnaPosition, newCodon?, deleteLength?, insertSequence?, label }` по тому же маппингу, что в current `handleSaveFragment` `normMuts.map(...)` блоке (строки ~120–150 useFragmentHandlers.js). Types: `substitution`, `deletion`, `insertion`, `nt_substitution` → `substitution` с newCodon из mutated triplet, `nt_deletion` → `deletion` с deleteLength, `nt_insertion` → `insertion` с insertSequence.
   - Вызвать `applyMutationGit(fragIdx, normalized)`. Reducer делает pushUndo + bootstrap (если baseSnapshot нет) + createCommit + resolveAutoOverride + replay + pushWarnings.
4. `setMutations([])` — очистить local buffer.
5. `setSeq(...)` — опционально обновить local `seq` из свежего `liveFragment.sequence` (после всех applyMutationGit). Не критично, т.к. `onClose()` закрывает editor. Пропускаем.
6. `onClose()`.

**Важно:** `applyMutationGit` — store action synchronous (Zustand immer set). Все N вызовов отработают sync до onClose. pushUndo внутри каждого — Ctrl+Z откатит ВСЕ N коммитов обратно. Альтернатива — batch-режим (push один undo, N applyCommit без pushUndo) — **OUT** в этом спринте, стандартная однокомитная Ctrl+Z гранулярность приемлема.

**Тесты:** см. §3 IN «Тесты Vitest» FragmentEditor.test.jsx.

---

### K2 — `handleCreateMutagenesisAssembly` + кнопка

**Файлы:**
- `hooks/useFragmentHandlers.js` — новый handler.
- `components/FragmentEditor/index.jsx` — новая кнопка и prop callback.
- `App.jsx` — проброс prop из useFragmentHandlers в FragmentEditor.

**Что делаем (useFragmentHandlers.js):**

1. Удалить существующий mutation-path из `handleSaveFragment` (строки от `// ── Mutagenesis path ──` до конца функции до `return;`). Оставить только bookkeeping branch.
2. Добавить local helper `commitToStrategyMut(commit)`:
   - substitution → `{ type: 'substitution', dnaPosition: commit.parentPos, newCodon: commit.payload.newCodon, label: commit.label }`.
   - deletion → `{ type: 'deletion', dnaPosition: commit.parentPos, deleteLength: commit.payload.deleteLength, label: commit.label }`.
   - insertion → `{ type: 'insertion', dnaPosition: commit.parentPos, insertSequence: commit.payload.insertSequence, label: commit.label }`.
3. Новый handler `handleCreateMutagenesisAssembly(fragIndex)`:
   - `pushUndo()`.
   - `f = fragments[fragIndex]`; если нет или `!f.commits?.length` — no-op.
   - `appliedCommits = f.commits.filter(c => c.applied !== false)`. Если пусто — no-op.
   - `normMuts = appliedCommits.map(commitToStrategyMut)`.
   - `templateSeq = f.baseSnapshot.sequence` (важно: из baseline, не HEAD — strategy engine ожидает template + mutations в parent-coords).
   - `active = getActive(); fragmentContext = { topology: f.topology || (active?.circular ? 'circular' : 'linear'), isStandalone: fragments.length === 1, length: templateSeq.length }`.
   - `result = computeMutagenesisStrategy(templateSeq, normMuts, { featureStart: 0, featureEnd: templateSeq.length, fragmentContext })`.
   - `baseCtx = { primerPrefix, polymerase, existingPrimers: ..., templateName: f.name }`.
   - Для `result.strategy === 'kld'`: заменить fragment на mutant — аналогично current handleSaveFragment KLD branch, но sequence/annotations берутся из `liveFragment.sequence`/`annotations` (т.е. результат replay — это и есть mutant с applied commits). `baseSnapshot = { sequence: f.sequence, annotations }` (fresh mutant baseline), `commits = []`. `primers`, `protocolSteps`, `apiWarnings` из strategy.
   - Для `result.strategy === 'two_fragment'` / `'multi_fragment'`: та же split-логика что в current handleSaveFragment (создание newFragments через `result.fragments.map`, trimAnnotationsForSubFragment, splitGroupId, splitGroupFullSequence и т.д. — копия блока). Каждый sub получает `baseSnapshot: { sequence: sf.sequence, annotations: trimmed }`, `commits: []`. Replace source-fragment массивом sub-fragments; вставка strategyJunctions.
   - `updateActive({ fragments: updatedFragArr, junctions: updatedJunctionArr, primers: builtPrimers, protocolSteps, apiWarnings: result.warnings || [], calculated: result.strategy === 'kld' })`.
4. Добавить `handleCreateMutagenesisAssembly` в return object.

**Что делаем (FragmentEditor/index.jsx):**

1. Добавить prop в signature: `FragmentEditor({..., onCreateAssembly, ...})`.
2. Новая кнопка в footer рядом с Save (или в header справа от diff-view toggle — Code выбирает по визуальной consistency):
   - Text: «🧬 Создать сборку ({N})» где N = applied commits count.
   - Visible когда `hasAppliedCommits = commits.some(c => c.applied !== false)`.
   - Disabled (только visible) если `hasAppliedCommits === false`.
   - Clicked → `onCreateAssembly(fragIdx)` → `onClose()`.
   - Styling — consistent с existing save-кнопкой, предпочтительно `bg-purple-600 text-white` (mutagenesis accent) или `bg-indigo-600`.
3. `data-testid="create-assembly-button"` для теста.

**Что делаем (App.jsx):**

Code грепнет место рендера FragmentEditor (`<FragmentEditor ...`) и добавит prop `onCreateAssembly={(idx) => handleCreateMutagenesisAssembly(idx)}` или `onCreateAssembly={handleCreateMutagenesisAssembly}`. `fragIdx` известен FragmentEditor'у через `liveFragment`-subscription — можно передать внутри callback, не требует параметра.

**Вариант упрощения (Code решает):** если editTarget всегда = fragIdx (единственный открытый editor), callback можно вызывать без параметра — `handleCreateMutagenesisAssembly()` читает `editTarget` из store.

**Тесты:** см. §3 IN Vitest.

---

### K3 — «💾 Сохранить как запчасть» для всех топологий

**Файлы:**
- `components/FragmentEditor/index.jsx` — новая кнопка + handler.
- `hooks/useFragmentHandlers.js` — `handleSaveAsVariant` уже работает для любых фрагментов (см. §5 assumption), переиспользуем.

**Что делаем (FragmentEditor/index.jsx):**

1. Новая функция `handleSavePart()` (отдельно от текущего `handleSaveAsVariant`):
   - Читает `liveFragment.sequence`, `liveFragment.annotations`, `liveFragment.commits`.
   - `variantName = prompt('Имя варианта:', suggestVariantName(fragment.name, ...));` — дефолт из существующего `suggestVariantName` с modificationDescr из applied commits labels.
   - Если `!variantName` — no-op.
   - `onSavePart({ name: variantName, type: fragment.type, sequence: liveFragment.sequence, length: liveFragment.sequence.length, annotations: liveFragment.annotations, parentId: fragment.parentId || fragment.id, modification: { type: 'mutation', description: commits.filter(c => c.applied).map(c => c.label).join(', ') }, sourceCommits: liveFragment.commits.map(c => ({...c})), testResults: [] })`.
   - `onClose()`.
2. Кнопка «💾 Сохранить как запчасть» в footer — видна при `hasAppliedCommits`, независимо от mode. Размещение: справа от «🧬 Создать сборку», чтобы две кнопки были рядом.
3. Существующая «🔀 Как вариант» (условие `mode === 'mutagenesis' && seqChanged && onSaveAsVariant`) остаётся для manual-seq-edit сценария (биолог вручную отредактировал seq без AA-клика). Два входа оправданы разными условиями срабатывания.
4. `data-testid="save-as-part-button"`.

**Что делаем (App.jsx):** добавить prop `onSavePart={handleSavePart}` (в useFragmentHandlers уже есть `handleSaveAsVariant` но он ожидает `variantData` со специфичной shape — переиспользовать напрямую, назвать проп `onSaveAsVariant` либо оставить `onSavePart` как alias и в App.jsx сделать `<FragmentEditor onSavePart={handleSaveAsVariant} ... />`).

**Что делаем (useFragmentHandlers.js `handleSaveAsVariant`):** принимает `variantData`, уже в нём recordит через `addPart`. Нужно добавить копирование `sourceCommits` поля в variant (если передано). Одна строка: `const variant = { ...variantData, id: ..., sourceCommits: variantData.sourceCommits }`.

**Тесты:**
- `FragmentEditor.test.jsx` +1: кнопка «Сохранить как запчасть» visible при `hasAppliedCommits`, click → `onSavePart` вызван с correctного variantData (sequence из liveFragment, sourceCommits = live commits).

---

### K4 — `handleSaveFragment` очистка от mutation-path

**Файл:** `hooks/useFragmentHandlers.js`, функция `handleSaveFragment` (начало файла после imports).

**Что делаем:** удалить ветку обработки `hasMutations === true`. Оставить только bookkeeping-write:

1. `if (editTarget === null) return;`
2. `pushUndo();`
3. `updateActive({ fragments: fragments.map((f, i) => i === editTarget ? updated : f), calculated: false });`
4. `setEditTarget(null);`

Все строки от `const original = fragments[editTarget];` через `const hasMutations = ...` и далее вплоть до final `setEditTarget(null)` — удаляются. Old mutation-path extrикат переезжает (частично) в K2 handleCreateMutagenesisAssembly.

**Важно:** `handleSaveFragment` всё ещё должен корректно работать при `updated.sequence` различной от fragment.sequence (bookkeeping edit, меняющий sequence напрямую — ручная правка через «Редакт. кодоны»). Логика «CRIT-1 shift annotations» — это уже в FragmentEditor side (`setAnnotations` при apply и при applyDnaDel/Insert). handleSaveFragment не должен пересчитывать annotations — просто write-back `updated.annotations`.

**Тесты:**
- `useFragmentHandlers.test.js` +1: regression guard — `handleSaveFragment` с `updated.mutations = [...]` игнорирует mutations (не создаёт Part-child, не вызывает strategy, sequence сохраняется as-is).

---

### K5 — U2 single-linear primers

**Файл:** `local-primer-design.js`, функция `designPrimersLocal` в ветке `if (fragments.length < 2)` (строки ~201–246).

**Что делаем:**

1. Внутри `if (fragments.length === 1)`:
   - Существующая logic: `isCircular = circular || frag.topology === 'circular'`. Если `isCircular && seq.length >= 40` → self-closure primers (К6 Sprint X, не трогаем).
   - Новая ветка после self-closure блока: `else if (!isCircular && seq.length >= 36)` → 2 концевых primer без tails.
     - `fwdBinding = findBindingTagAware(seq, 'forward', tmTarget, frag.annotations)`.
     - `revBinding = findBindingTagAware(seq, 'reverse', tmTarget, frag.annotations)`.
     - `fwdSeq = fwdBinding.sequence`; `revSeq = rc(revBinding.sequence)`.
     - Push 2 primers: `name = '{prefix}001_fwd_{frag.name}_terminal'` / `'{prefix}002_rev_{frag.name}_terminal'`; `tailSequence: ''`; `purpose: 'terminal-pcr'`; `tailPurpose: ''`; остальные поля как в self-closure branch.
     - `return { primers, warnings: [] }`.
   - Если ни circular ни linear-достаточной-длины: fallthrough к existing warning «Один фрагмент — праймеры не требуются» (для seq.length < 36 linear — слишком короткий для специфичности).
2. ActionBar badge: K5 первый шаг — грепнуть ActionBar (см. §5 assumption 7). Если branch есть для `purpose === 'self-closure'` — добавить parallel branch для `purpose === 'terminal-pcr'` с текстом «Режим: Концевая ПЦР (single linear)». Если branch нет — не добавлять, это out-of-scope.

**Тесты:** см. §3 IN `local-primer-design.test.js` +2.

---

## 7. Порядок и оценка

**Порядок:** K1 → K2 → K4 → K3 → K5.

- K1 первый — замыкает main workflow на Git, без него K2 не имеет смысла (не с чего создавать сборку).
- K2 второй — новый handler + кнопка, использует результат K1 (applied commits в store).
- K4 третий — очистка `handleSaveFragment` возможна только после K1 (иначе сломаем текущий flow, пока FragmentEditor ещё шлёт mutations в onSave).
- K3 четвёртый — новая кнопка save-as-part использует live commits, независим от K2, но UI-полёт K1+K2+K3 вместе в одном спринте удобнее.
- K5 последний — независим от всех, U2 не связан с Git. Можно делать параллельно, но в порядке зависимостей фикс-main-workflow первое.

**Оценка Code:** ~8–10 ч. Если после K1+K2 Code чувствует, что прирост FragmentEditor/index.jsx ≥2 KB (approaching 40 hard) — STOP-фраза, Игорь решает о декомпозиции header/footer в подкомпоненты. Иначе K3–K5 продолжаются.

---

## 8. STOP-условие и формат отчёта

### STOP

После commit K5 Code останавливается. **НЕ:**
- обновляет `PROJECT_STATE.md` / `DECISIONS.md` / `BUGS.md` (Chat в приёмке);
- перемещает `SPRINT_X_PLASMID_GIT.md` или этот файл в `docs/archive/` — Sprint X + X-fix закроются одним событием финализации при PASS приёмки;
- трогает V23, V20, V32, U1 и другие OPEN-баги вне скоупа;
- не начинает Map-WS-2 / UX-1 / Sprint 2b.

### Формат отчёта

Code дописывает в конец `CURRENT_TASK.md`:

```
## Отчёт Code по Sprint X-fix

- K1 коммит: `<hash>` — fix(FragmentEditor): handleSaveMutagenesis → applyMutationGit
- K2 коммит: `<hash>` — feat(useFragmentHandlers): handleCreateMutagenesisAssembly + button
- K4 коммит: `<hash>` — refactor(useFragmentHandlers): remove mutation-path from handleSaveFragment
- K3 коммит: `<hash>` — feat(FragmentEditor): save-as-part for all topologies with sourceCommits
- K5 коммит: `<hash>` — fix(U2): single-linear terminal PCR primers
- Изменения размеров:
  - FragmentEditor/index.jsx: 37.97 → X KB (hard 40 — OK/WARN/FAIL)
  - useFragmentHandlers.js: 21.11 → X KB
  - local-primer-design.js: ~15.6 → X KB
- Новые файлы: нет (K5 только расширение existing branch)
- Vitest: N/N (baseline 774, ожидание +8 = 782)
- pytest: 112/112 (не трогалось)
- vite build: clean | warnings: <list> | errors: <list>
- Отклонения от §3 / §4 / §6: <явный список или «нет»>
- Противоречия с §0.5 (если обнаружены): <список или «нет»>
- Size budget: OK | WARN FragmentEditor/index.jsx X/40 | FAIL <...>
- ActionBar badge-расширение (K5 step 2): сделано / не найдено branch / out-of-scope оставлено.
```

Если отчёта нет — Chat приёмки не финализирует, просит отчёт.

---

## 9. Риски

1. **FragmentEditor/index.jsx прорыв hard 40 KB.** Файл 37.97 KB, K1–K3 добавляют 2 кнопки + 2 handler'а + hook + doc-комментарии. Ожидаемый прирост 1.5–2.5 KB, риск 40+. **Митигация:** если Code после K2 видит ≥40 KB — стоп, mini-spec на декомпозицию header/footer в подкомпоненты `FragmentEditorHeader.jsx` (topology toggle + mode switcher + diff-view + create-assembly + save-as-part) и `FragmentEditorFooter.jsx` (save button + sequence metrics). Это отдельный спринт, K3/K5 завершаются после.
2. **Внешние caller'ы `handleSaveFragment` с mutations[].** K4 удаляет mutation-path. Если кто-то снаружи FragmentEditor шлёт `onSave({ ...f, mutations })` — mutations просто игнорируются, silent behavior. **Митигация:** grep в кодовой базе на `handleSaveFragment(.*mutations:` — сейчас единственный caller это `handleSaveMutagenesis` FragmentEditor (K1 переписывает). Если grep даёт ещё callers — в K4 первый шаг их выявить и переадресовать на applyMutationGit.
3. **Двойной pushUndo в K1.** Если биолог применил 5 мутаций через один клик «Применить мутагенез», K1 делает 5 applyMutationGit → 5 pushUndo внутри reducer → Ctrl+Z откатывает по одной мутации, биолог ожидает «откат всех 5 разом». **Митигация:** приемлемый trade-off — 5 мутаций это 5 независимых commits (видны в panel отдельно, toggle их тоже по-отдельности), гранулярность undo соответствует гранулярности commits. Если окажется confusing в приёмке — batch-mode через `applyMutationsGitBatch(fragIdx, [...normMuts])` reducer в next sprint.
4. **Split при «Создать сборку» теряет commits source-фрагмента.** §4 решение 6. Биолог может удивиться «куда делась история мутаций после 🧬 Создать сборку». **Митигация:** в K2 добавить apiWarning `'ℹ Commits перенесены на sub-fragments как baseline. Оригинальная история в archived-fragments недоступна.'` при split. Опционально — alert-confirm «Продолжить? Commit history текущего фрагмента не сохранится.» если commits.length ≥ 3. Code выбирает UX по своему усмотрению; если полный alert покажется агрессивным — достаточно inline-warning в ActionBar.
5. **K3 кнопка «Сохранить как запчасть» и existing «🔀 Как вариант» — путаница двух входов.** Биолог видит две похожие кнопки в разных условиях. **Митигация:** tooltip для каждой: «🔀 Как вариант» → «Создать Part из текущей sequence (ручная правка без commits)»; «💾 Сохранить как запчасть» → «Создать Part из applied Git commits (сохраняет историю)». Если при visual acceptance окажется confusing — объединить в одну кнопку с ветвлением по `hasAppliedCommits` логикой в handler (K3+).
6. **K5 primers too-short guard `seq.length >= 36`.** Порог 36 bp эвристический (18 bp binding × 2 конца). Если линейный фрагмент 30–35 bp — попадёт в «слишком короткий, не требуется ПЦР» warning, биолог не получит primers. **Митигация:** в приёмке проверить edge case (e.g. linker 33 bp). Если окажется что нужно и для 30+ bp — снизить порог до 24 bp (12 bp binding × 2) в K5 v1.1.

---

## 10. Открытые вопросы

1. **Имя кнопки «Создать сборку».** Chat предлагает «🧬 Создать сборку ({N})». Короткие альтернативы: «🧬 На canvas», «🧬 Собрать», «🧬 Разбить на PCR». Не блокирует K2, достаточно Code знать что внутри строки. Если Игорь скажет в приёмке — одна строка правки.
2. **Global-level ActionBar подсказка «У вас N applied commits на M фрагментах».** §3 OUT. Нужна ли? Без неё биолог может забыть нажать «Создать сборку» и упрётся в заказ oligos с пустым primers массивом. Митигация внутри Editor (счётчик на кнопке) работает, только когда editor открыт. Default: добавить в UX-1 или отдельный минимальный fix-commit после Sprint X-fix. Жду решения.
3. **Batch undo в K1.** §9 риск 3 — 5 мутаций = 5 pushUndo. Если биолог жалуется на гранулярность — сделать `applyMutationsGitBatch` reducer, 1 pushUndo на набор. Пока оставляем current гранулярность. Обсудим по результатам приёмки.
4. **K3 слияние с existing «🔀 Как вариант».** §9 риск 5. Две кнопки vs одна. Default — две (проще изолированно тестировать), объединить позже если confusing. Или сразу одна? Решение в приёмке.

---

_Шаблон v1.1. Sprint X-fix = миник-спринт (~8–10 ч), закрывает FAIL Sprint X Блока 1 + U2._
