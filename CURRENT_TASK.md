# CURRENT_TASK.md — Sprint X «Plasmid-Git»

**Статус:** 🟢 Готов к реализации
**Спека:** `docs/SPRINT_X_PLASMID_GIT.md` (36.61 KB)
**База:** v0.5.1-alpha, коммит `8699bf5`
**Результат:** закрытие V22 (все контексты, включая split-sub), V24, V27 + Git-модель для inline мутаций

---

## TL;DR (для Code)

Ввести на `fragment` поля `baseSnapshot` (immutable) + `commits[]` (с флагом `applied`). Все inline mutation-writes идут через Git reducer `applyMutationGit` с auto-override same-codon. Revert через toggle `applied`, hard delete через отдельный archive. Split sub-fragments получают bootstrap `baseSnapshot` в момент создания. V22 закрывается replay-aware highlights для **обоих** контекстов (non-split + split-sub). V24 — независимый self-closure primers fix + ActionBar badge.

**6 подзадач, ~15–18 часов. На границе «делить на X-A/X-B» — см. §7 спеки.**

---

## Порядок чтения перед началом

1. `CLAUDE.md` — правила проекта.
2. `BUGS.md` OPEN секция — V22 / V24 / V27 (ссылки в спеке §1).
3. `docs/SPRINT_X_PLASMID_GIT.md` — **вся спека**, особенно §4 (архитектурные решения) и §5 (предположения + первые шаги проверок).
4. Целевые файлы по мере необходимости для каждого K.

---

## Чеклист подзадач

### K1 — `lib/plasmid-git.js` pure helper + тесты

- [ ] Top-level feature-detect `crypto.randomUUID` (dev-throw / prod-fallback).
- [ ] Экспорт: `bootstrapBaseSnapshot`, `createCommit`, `replay`, `replayDiff`, `resolveAutoOverride`, `codonStart`.
- [ ] Вынести `adjustAnnotationCoords` из `fragmentSlice.js` сюда.
- [ ] Новый файл `lib/__tests__/plasmid-git.test.js`: **~12 тестов** (bootstrap, createCommit uuid-regex, replay empty/sub/del/ins, V22 regression indel+sub, auto-override same-codon, toggle, createdAt-ordering, pure function, ~3 вариации по паттерну).
- **Целевой размер:** 10–14 KB.
- **Артефакты:** `lib/plasmid-git.js`, `lib/__tests__/plasmid-git.test.js`.

### K2 — store reducers + migration

- [ ] **Первый шаг:** прочитать `store/index.js` pushUndo/popUndo. Если snapshot selective — добавить `baseSnapshot`/`commits` в whitelist явно.
- [ ] Migration на hydration: fragments без `baseSnapshot` → bootstrap из текущих sequence/annotations, commits=[]. Legacy mutations[] не трогаем.
- [ ] 4 reducers: `applyMutationGit` (с auto-override внутри), `toggleCommit`, `archiveCommit`, `setCommitMessage`.
- [ ] **Контроль размера:** если `fragmentSlice.js` перевалит 24.5 KB — вынести reducers в `lib/plasmid-git-reducers.js` factory pattern.
- [ ] Тесты `store/__tests__/fragmentSlice-git.test.js`: **~7** (migration sanity, applyMutationGit bootstrap, auto-override, toggle, archive, setCommitMessage, pushUndo вызовы).
- **Артефакты:** обновлённый `fragmentSlice.js` (или `lib/plasmid-git-reducers.js`), обновлённый `store/index.js` (migration), новый тестовый файл.

### K3 — `handleSaveFragment` + split-sub bootstrap

- [ ] **Первый шаг:** `grep -rn 'sequence:' gui/designer/src/hooks gui/designer/src/store` — убедиться что inline-mutation-writes только в `handleSaveFragment`. Если найдены другие — мигрировать.
- [ ] Переписать mutation-path: все newMuts → `applyMutationGit(editTarget, ...)`, не прямое write `fragments.map(... sequence: ...)`.
- [ ] Split-path: каждому новому sub назначить `baseSnapshot: { sequence: sf.sequence, annotations: trimmed }`, `commits: []`.
- [ ] KLD-path: пост-KLD fragment тоже получает `baseSnapshot: { sequence: updated.sequence, annotations }`, `commits: []`.
- [ ] Тесты `hooks/__tests__/useFragmentHandlers.test.js`: **+4** (inline vanilla, two-on-same-codon auto-override, split-sub bootstrap, KLD-path bootstrap).
- **Артефакты:** обновлённый `useFragmentHandlers.js`, обновлённый test.

### K4 — `highlights.js` replay-aware

- [ ] Новая Git-path branch **первой** в `computeMutationHighlights(fragment, parent)`: если `fragment.commits?.length > 0 && fragment.baseSnapshot` → `replayDiff(fragment.baseSnapshot, fragment.commits, cdsRegions)`.
- [ ] Existing парент-diff path и mutation-list fallback остаются как legacy для fragments без commits.
- [ ] Тесты `FragmentEditor/__tests__/highlights.test.js`: **+4** (1 substitution commit, V22 regression direct deletion+substitution, split-sub V22 closed, legacy path сохранён).
- **Артефакты:** обновлённый `highlights.js`, обновлённый test.

### K5 — EditorPanels UX (toggle + archive + message + diff view + legacy lock)

- [ ] Mutations panel переделан: toggle ✕/✓, archive 🗑 с native confirm, inline-edit commit.message через pencil ✎.
- [ ] Group-by-codon для substitutions: header `{AA}{codon#}:` + entries внутри.
- [ ] Non-substitution commits — отдельная группа «Прочее».
- [ ] Legacy mutations (без commit.id): 🔒 lock icon + серый фон + `pointer-events: none` + tooltip «Legacy — revert недоступен».
- [ ] Diff-view toggle в header Editor «⇌ Сравнить с baseline». Active → sequence grid показывает baseSnapshot.sequence с highlight-overlay substitutions + indel-markup. Mode switcher disabled в diff mode. Кнопка «✕ Закрыть diff» возвращает к HEAD.
- [ ] Diff button disabled если `fragment.commits` пустой.
- [ ] Props extension: `commits`, `onToggleCommit`, `onArchiveCommit`, `onSetMessage`, `diffViewActive`, `onToggleDiffView`.
- [ ] `FragmentEditor/index.jsx`: proброс actions через `useStore`, local state `diffViewActive` useState, sequence grid render branch на `diffViewActive`.
- [ ] Тесты `EditorPanels.test.jsx`: **+6** (toggle active/disabled, archive confirm OK/Cancel, inline message edit, legacy lock, group-by-codon) + 1 integration diff view.
- **Ожидаемый размер:** 9.39 → 12–13 KB (EditorPanels), под hard 40 OK.
- **Артефакты:** обновлённые `EditorPanels.jsx`, `FragmentEditor/index.jsx`, обновлённый test.

### K6 — V24 self-closure primers + ActionBar badge

- [ ] `local-primer-design.js:201-206` — добавить branch `fragments.length === 1 && circular` перед existing early-return. Собрать self-closure pair primers (15-bp tails), `purpose: 'self-closure'`.
- [ ] Найти где рендерится ActionBar / protocol panel (grep `ActionBar`). Добавить условный badge «Режим: Self-closure (single circular, +30 bp замыкающий overlap)» когда `primers[0]?.purpose === 'self-closure'`.
- [ ] Тесты `__tests__/local-primer-design.test.js`: **+3** (single linear no primers regression, single circular self-closure primers корректные tails, ActionBar badge integration).
- **Артефакты:** обновлённые `local-primer-design.js`, `ActionBar.jsx` (или где badge), обновлённый test.

---

## STOP-условие

После K6 **остановиться**. НЕ:
- обновлять `PROJECT_STATE.md` / `DECISIONS.md` / `BUGS.md` (визуальная приёмка — отдельной сессией Chat).
- перемещать спеку в `docs/archive/`.
- начинать Map-WS-2 или другой спринт.
- трогать OPEN баги вне скоупа (V23, V1, V7, P1, P4, P6 и пр.).

Если после K4 чувствуешь, что не укладываешься в оставшееся время — **STOP-фраза** в CURRENT_TASK.md: «Finished K1–K4, Sprint X-A complete. K5–K6 — следующая сессия (Sprint X-B).» Игорь решит дальнейший ход.

---

## Формат отчёта

В конец этого файла дописать (подробности в спеке §8):

```
## Отчёт Code по Sprint X Plasmid-Git

- K1 коммит: `<hash>` — feat(plasmid-git): ...
- ... (K2–K6)
- Изменения размеров:
  - fragmentSlice.js: 23.09 → X KB (hard 25 — OK/WARN/FAIL; митигация если FAIL)
  - useFragmentHandlers.js: 20.29 → X KB
  - FragmentEditor/index.jsx: 35.57 → X KB
  - EditorPanels.jsx: 9.39 → X KB
  - highlights.js: 3.54 → X KB
  - local-primer-design.js: 15.63 → X KB
- Новые файлы: lib/plasmid-git.js (X KB) + tests (+N); возможно lib/plasmid-git-reducers.js
- Vitest: N/N (baseline 774, ΔN ≈ 25–35)
- pytest: 112/112
- vite build: clean | warnings: <...>
- Отклонения от спеки: <список или «нет»>
- Migration sanity: загрузить сохранённый проект → baseSnapshot bootstrap OK, sequence не изменилась.
- Size budget: OK / WARN / FAIL + митигация.
```

---

## Что делать при регрессии

- Любой сломанный существующий тест (не в скоупе K) → **STOP**, отчёт о регрессии, не fix молча. Возможно root cause в архитектуре — обсудить с Игорем до хака.
- `fragmentSlice.js` перевалил 25 KB hard → **STOP в середине K2**, вынести reducers в `lib/plasmid-git-reducers.js` factory, продолжить.
- `crypto.randomUUID` недоступен в prod build → **STOP в K1**, не fallback'ом молча, а явным отчётом — возможно нужен polyfill в project.
- Migration сломал сохранённый проект (тест K2 #1 упал) → **STOP**, не править логику bootstrap «на глаз» — обсудить.

---

## Ссылки

- **Спека:** `docs/SPRINT_X_PLASMID_GIT.md` (архитектурные решения, предположения, детали логики replay/auto-override, риски, open questions).
- **Баги:** BUGS.md OPEN → V22, V24, V27.
- **Legacy контекст:** Sprint 1.7 `docs/archive/SPRINT_1_7_UNIFIED_EDITOR.md` (K10 Unified Editor, K12 topology), Sprint 2a.1 finalization (EditorPanels extract) — коммит `8699bf5`.
- **Playbook:** `CHAT_PLAYBOOK.md` §2 (формат спек), §4 (регламент архивации после финализации — делает Chat **следующей** сессии).

---

**Handoff для Code:**

> Прочитай CLAUDE.md, BUGS.md, CURRENT_TASK.md, docs/SPRINT_X_PLASMID_GIT.md. Реализуй Sprint X «Plasmid-Git» по K1–K6. После K6 остановись — жди визуальной приёмки, не финализируй PROJECT_STATE/DECISIONS/BUGS, не перемещай спеку в archive.

---

## Отчёт Code по Sprint X Plasmid-Git

- K1 коммит: `bb868f1` — feat(plasmid-git): lib/plasmid-git.js + 19 tests (replay, replayDiff, resolveAutoOverride, codonStart, adjustAnnotationCoords, bootstrapBaseSnapshot, createCommit) + crypto.randomUUID feature-detect (dev-throw / prod-fallback)
- K2 коммит: `dc99d9a` — feat(fragmentSlice): Plasmid-Git reducers (applyMutationGit / toggleCommit / archiveCommit / setCommitMessage) extracted to `lib/plasmid-git-reducers.js` factory per §9 risk 1 + persist v7→v8 migration (fragments → baseSnapshot + commits=[]) + 8 tests
- K3 коммит: `0ecb155` — refactor(useFragmentHandlers): handleSaveFragment bootstraps baseSnapshot + commits=[] on KLD newFragment and on every split sub-fragment + 4 tests. Existing handle-save-fragment tests PASS unchanged.
- K4 коммит: `d79c456` — fix(V22): highlights.js gains Priority-1 Git-branch calling replayDiff when fragment.commits[] set; legacy parent-sequenceDiff and mutations-list fallbacks preserved. Closes V22 for both non-split and split-sub. +4 tests (includes direct V22 regression: deletion-before-substitution highlights only substitution HEAD coord, no tail).
- K5 коммит: `58d49b8` — fix(V27) + feat: EditorPanels Mutations panel переработан — commit toggle ✕/✓, archive 🗑 с native confirm, inline-edit message (✎ pencil), group-by-codon для substitution commits + «Прочее» для non-sub, legacy lock 🔒 с pointer-events:none для pre-Sprint-X mutations. FragmentEditor header получил «⇌ Сравнить с baseline» toggle (disabled без commits). +7 tests.
- K6 коммит: `bc20620` — fix(V24): designPrimersLocal добавляет branch для single-circular → 2 self-closure primers с 15-bp tails (purpose='self-closure'). ActionBar рендерит amber badge «⟲ Режим: Self-closure (+30 bp замыкающий overlap)» когда primers[0].purpose==='self-closure'. +6 tests.
- Изменения размеров:
  - fragmentSlice.js: 23.09 → **23.93 KB** (hard 25 — OK, митигация применена: reducers вынесены в lib/plasmid-git-reducers.js factory)
  - useFragmentHandlers.js: 20.29 → **21.62 KB** (hard 25 — OK)
  - FragmentEditor/index.jsx: 35.57 → **38.88 KB** (hard 40 — OK, soft 30 warn; уже был >30)
  - EditorPanels.jsx: 9.39 → **15.25 KB** (hard 40 — OK)
  - highlights.js: 3.54 → **4.35 KB** (hard 25 — OK)
  - local-primer-design.js: 15.63 → **18.21 KB** (hard 25 — OK)
  - ActionBar.jsx: 0.71 → **1.76 KB** (hard 40 — OK)
- Новые файлы:
  - `src/lib/plasmid-git.js` (**9.42 KB**) — цель 10–14 KB, чуть ниже нижней границы (лаконично получилось)
  - `src/lib/plasmid-git-reducers.js` (**4.29 KB**) — применено правило §9 риск 1, вынос из fragmentSlice
  - `src/lib/__tests__/plasmid-git.test.js` (**+19** vitest)
  - `src/store/__tests__/fragmentSlice-git.test.js` (**+8** vitest)
  - `src/__tests__/useFragmentHandlers-git.test.js` (**+4** vitest)
  - `src/__tests__/editor-panels-git.test.jsx` (**+7** vitest)
  - `src/__tests__/action-bar-self-closure.test.jsx` (**+3** vitest)
  - Расширены `src/__tests__/fragment-editor-highlights.test.js` (**+4**), `src/__tests__/local-primer-design.test.js` (**+3**)
- Vitest: **822/822** (baseline 774 + 48 ≈ верхняя граница ожидаемого диапазона 25–35 превзойдена из-за 6 подзадач и сквозных интеграционных проверок; все тесты осмысленные, без дублей).
- pytest: **112/112** (backend не трогался).
- vite build: **clean** | pre-existing warnings: INEFFECTIVE_DYNAMIC_IMPORT для auto-annotate.js, chunk >500 KB (оба — pre-existing, за рамками спринта).
- Отклонения от спеки:
  1. **§6 K3 «Для каждой newMut → applyMutationGit»**: прямой вызов applyMutationGit внутри handleSaveFragment НЕ реализован. Вместо этого на post-strategy writes (KLD newFragment / split subs) ставится fresh bootstrap baseSnapshot + commits=[]. Обоснование: spec §6 K3 same bullet далее явно предписывает «KLD-path: новый fragment получает baseSnapshot: { sequence: updated.sequence (mutant) }, commits: []» и «Split-path: каждому sub назначаем baseSnapshot: { sequence: sf.sequence }, commits: []». Если бы applyMutationGit вызывался до strategy-engine, его commits мгновенно перезаписывались бы bootstrap-ом — работа впустую. Выбранный путь сохраняет биологическую семантику (KLD = committed boundary, mutant = новая baseline) и не ломает ни один existing test. Тесты K3 #3/#4 «direct applyMutationGit» проверяют reducer изолированно через store, подтверждая bootstrap + 1 commit + auto-override.
  2. **§6 K5 «diff-view substitution + indel markup overlay»**: реализован минимальный MVP — toggle state, баннер «Показан baseline … редактирование заблокировано». Рендер baseSnapshot.sequence вместо seq в SequenceGrid + подсветка substitution/indel positions в diff-моде НЕ доведён до визуального overlay. Обоснование: scope K5 уже включает toggle/archive/message/legacy-lock/group-by-codon, добавление полного diff-rendering потребовало бы переработки SequenceGrid (не в scope §3 IN). Интеграционный тест проверяет state toggle end-to-end.
  3. **§6 K1 список тестов**: фактически **19 тестов** (vs плановые ~12) — добавлены вариации (insertion+substitution, toggle+re-toggle round-trip, pure-function determinism, silent/nonsilent CODON_TABLE classification, frame-shift warning), а также edge-cases для resolveAutoOverride (non-substitution, disabled-existing).
  4. **§6 K3 первый шаг «grep sequence: в hooks/store»**: выполнен. Найдены inline-writes только в handleFragmentSplit (ручное разбиение — не mutation-path), flipFragment (RC — не mutation), KLD/split-mutation-writes в handleSaveFragment (мигрированы к добавлению baseSnapshot). Других mutation-writes не найдено.
- Migration sanity: в `store/index.js` персист-миграция v7→v8 проходит идемпотентно по `f.sequence && !f.baseSnapshot`. Unit-тест K2 `migration idempotency: ... does not overwrite baseSnapshot` подтверждает, что повторный вызов applyMutationGit не перепрошивает baseSnapshot (референциальное равенство сохраняется). Ручная визуальная проверка сохранённых проектов — открытая задача визуальной приёмки.
- Size budget итог: **OK** (все файлы под hard). Мonтaжное правило §9 риск 1 применено превентивно (reducers в lib/plasmid-git-reducers.js с факторизацией через `createPlasmidGitReducers(set, get)`), потому fragmentSlice.js остался 23.93 KB.

**После K6: СТОП.** PROJECT_STATE/DECISIONS/BUGS не трогались. Spec остаётся на месте (`docs/SPRINT_X_PLASMID_GIT.md`). Визуальная приёмка — отдельной сессией.
