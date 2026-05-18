# SPRINT_M-CANVAS-SKELETON-FIX1.md — паритет SequenceView в editor + primers

> **Тип:** B (фича среднего объёма — паритет callbacks + новый primer derivation flow). Изначально планировал C, расширилось при детализации.
> **Версия:** v1, 11.05.2026 поздний вечер.
> **Родительская спека:** `docs/SPRINT_M-CANVAS-SKELETON.md` v1 (~55 KB). Этот патч НЕ переписывает её, а закрывает пробел §4.3.
> **Размер факт:** ~19 KB (верхняя граница диапазона B 8-15 KB слегка превышена за счёт детализации §5/§6/§9; качество содержания оправдано).

---

## 0. Срез размеров затрагиваемых модулей

```
components/CanvasSkeleton/editor/ContainerEditorSkeleton.jsx     8.94 KB  (soft 30, hard 40)
components/CanvasSkeleton/store/skeleton-state.js                6.04 KB  (soft 20, hard 25)
components/CanvasSkeleton/store/skeleton-context.jsx             4.52 KB  (soft 30, hard 40)
+ NEW: components/CanvasSkeleton/editor/derive-primers.js        ~2 KB    (новый)
+ NEW: components/CanvasSkeleton/editor/edit-annotation-store.js ~3 KB    (опц., см. §5)
```

Все ниже soft. Декомпозиция не требуется.

---

## 1. Контекст

Скелет (K1-K8) реализован Code 11.05.2026 поздно вечером. Структура папки + 12 тестов + 23 файла кода соответствует спеке v1 §6/§8. STOP-условие соблюдено (координационные файлы не тронуты).

Pre-acceptance Chat-разведка ContainerEditorSkeleton.jsx обнаружила **два разрыва, ломающих визуальную приёмку**:

1. **`readOnly` prop в вызове SequenceView — no-op.** Внутри SequenceView эта prop помечена `eslint-disable-next-line no-unused-vars` и ничего не делает. Реальный gate edit-режима — наличие `onAnnotationEdit` callback'а. Сейчас `onAnnotationEdit` НЕ передан → SequenceView молча сидит в read-only без H/E hotkeys, drag-handles на ребрах регионов, context menu «Создать/Редактировать/Удалить», inline rename на двойной клик.
2. **`primers` не передан** → PrimerTrack пуст. Но `SKELETON_PRIMERS` в fixture есть (6 праймеров) и связаны с containers через `commit.inputs.primerIds`. PrimerTrack должен показать primers как минимум на тех контейнерах, что были произведены/использованы в pre-baked commit'ах.

**Корень — пробел спеки v1.** §4.3 сказала «SequenceView рендерит content active tab. Без изменений в самом SequenceView». Я не указал какие callbacks/props нужно передать. Code интерпретировал по умолчанию (mock-viewer). Это **проектная ошибка Chat**, не интерпретация Code.

---

## 2. Где задача сядет (§17 R4)

**Existing компоненты которые fix использует:**
- `components/SequenceView/` — без правок. Все required callbacks (`onAnnotationEdit`, `onOpenFeatureEditor`) уже API SequenceView, не нужно расширять.
- `components/Library/inspector/tabs/SequenceTab.jsx` — **образец wiring**. Editor повторяет тот же набор props, кроме `searchHits` (вне scope) и `editable` (вне scope для скелета). Дополнение editor'а — `primers` prop, которого нет в SequenceTab.
- `components/CanvasSkeleton/store/skeleton-state.js` — расширяется одним action.
- `components/CanvasSkeleton/store/skeleton-context.jsx` — exposed action.
- `components/CanvasSkeleton/editor/ContainerEditorSkeleton.jsx` — главный consumer, ~25 строк правок.
- `components/Toast/` — для feedback на mock-edit (опц.).

**Что не задеваем:**
- `librarySlice` / `projectSlice` / `uiSlice` — НЕ. Скелет остаётся изолированным.
- `SequenceView/` core — НЕ. Только использование existing API.
- Production `FeatureEditorModal` / `Annotator` — НЕ. Скелет не подключает global модалки (изоляция DEC-SKELETON-01).
- Algorithm core — НЕ. Naive indexOf для primer match — не алгоритмическая зона (см. §5).

**Кто ссылается на затрагиваемое:** только `ContainerEditorSkeleton.jsx`. Никто извне скелета не зависит от skeleton-state.js.

**Что может сломаться:** 12 существующих skeleton-тестов. Все остаются зелёными — изменения additive, не breaking.

---

## 3. Стратегия

**Паритет с Library Inspector SequenceTab по edit-callbacks + editor-specific primers.**

`onAnnotationEdit` → local action в skeleton-state, мутирует `containers[i].annotations` для активного container'а. Toast feedback «Аннотация {создана|обновлена|удалена}». Мутации существуют до session reset (consistent с `commitOperation` поведением, DEC-SKELETON-09).

`primers` → derive через helper `derivePrimersForContainer(container, allPrimers, commits)`:
1. Найти origin: ProjectCommits где `outputs.containerIds.includes(container.id)` ИЛИ `inputs.containerIds.includes(container.id)`.
2. Собрать `primerIds` из найденных commits.
3. Для каждого primer'а — найти match на `container.sequence` через naive `indexOf` (forward) + `indexOf` reverseComplement (reverse strand). Если match нет — пропустить primer (биологически: primer не сидит на template, не показывать).
4. Вернуть массив с shape `{id, name, sequence, start, end, strand, tm}`.

Если ни одного match — пустой массив, PrimerTrack останется пустым (это валидное состояние для container без primers).

**Не задействуем:** `primer-reuse.js` (existing algorithm core helper) — его API неизвестно, может быть про reused tracking а не matching. Изоляция скелета важнее. Open question §9 — на acceptance перепроверить, нужен ли переход на это API.

**Не задействуем:** `onOpenFeatureEditor` / `onOpenAnnotator` — production модалки задевают global state. Inline rename через `useAnnotationRename` (автоматически работает при заданном `onAnnotationEdit`) даёт достаточный edit-UX для скелета. Открытый вопрос §9 если на приёмке окажется недостаточно.

---

## 4. Scope IN / OUT

**IN:**

- Удалить `readOnly` prop из вызова SequenceView в `ContainerEditorSkeleton.jsx` (no-op cleanup).
- Передать `onAnnotationEdit` callback в SequenceView → новый action `commitAnnotationEdit(containerId, edit)` в skeleton-state.
- Передать `primers` prop в SequenceView → useMemo derivation через новый helper `derive-primers.js`.
- Тосты на success/error для annotation edit (1 toast на действие).
- 2 новых теста: edit annotation flow, primer display flow.

**OUT:**

- `onOpenFeatureEditor` — inline rename достаточно (auto-wired при `onAnnotationEdit`).
- `onOpenAnnotator` — toast «Mock open Annotator» только при явном вызове из контекстного меню. Не render-ить реальный Annotator.
- `onBlastSelection` — Library SequenceTab его не использует. Скелет тоже не использует.
- `searchHits` — Ctrl+F поиск, вне scope скелета.
- `editable` + `onSequenceEdit` — char-apply через DNA редактирование, вне scope скелета (M-X.6 K2 feature).
- Match всех primers пула против sequence (не только origin) — следующий sprint. Скелет показывает только primers связанные с container через ProjectCommit.
- `primer-reuse.js` integration — open question, на acceptance.

---

## 5. Архитектурные решения (sprint-level)

**DEC-SKELETON-FIX1-01 — `onAnnotationEdit` → local mutation + toast.** Annotation edits в скелете мутируют `state.containers[i].annotations` через новый action `commitAnnotationEdit(containerId, edit)`. Edit shape следует SequenceView contract: `{kind: 'create'|'update'|'delete', id?, patch?, payload?}`. Toast подтверждает каждое действие. **Обоснование:** без mutation скелет повторит провал B-прототипа (edit popup закрывается, визуально ничего → читается как «не работает»). Mutation + toast — consistent с DEC-SKELETON-09 (commit creates block + visual update).

**DEC-SKELETON-FIX1-02 — primers derived из origin commits + naive indexOf match.** Helper `derivePrimersForContainer` находит primers через ProjectCommit linkage (outputs OR inputs), затем матчит на sequence через `indexOf` (forward) + `indexOf(reverseComplement)` (reverse). Без match primer не показывается. **Обоснование:** биологически реалистично (primer без позиции на template — мусор), просто реализовать (~30 строк), не задевает algorithm core. **Своё предложение Chat вне ответа Игоря «только origin для скелета, match-поиск в следующем sprint»** — match нужен минимально потому что без позиций PrimerTrack рендерит пусто. На acceptance перепроверить: подходит naive indexOf или нужен переход на `primer-reuse.js`.

**DEC-SKELETON-FIX1-03 — readOnly prop удаляется как no-op cleanup.** Внутри SequenceView prop помечена `eslint-disable no-unused-vars`. Передача запутывает читателей. Удаление + комментарий в коде editor'а: «edit-режим управляется наличием onAnnotationEdit, не readOnly».

**DEC-SKELETON-FIX1-04 — onOpenFeatureEditor / onOpenAnnotator не подключаются в скелете.** Production модалки задевают global state (librarySlice / uiSlice). Подключение нарушит DEC-SKELETON-01 (изоляция). Inline rename через `useAnnotationRename` автоматически работает при `onAnnotationEdit` — даёт достаточный edit-UX. Если на acceptance окажется недостаточно — отдельным fix-патчем mock-обёртка для FeatureEditorModal (~2 KB).

---

## 6. Файлы / сигнатуры helper'ов

**Правки в `editor/ContainerEditorSkeleton.jsx` (~8.94 KB → ~9.5 KB):**

Удалить:
- `readOnly` из props SequenceView.

Добавить useMemo + handler:
- `primersForActive` — `useMemo(() => derivePrimersForContainer(activeContainer, state.primers, state.projectCommits), [activeContainer, state.primers, state.projectCommits])`.
- `onAnnotationEdit` handler — `useCallback((edit) => { if (!tabContainerId) return; actions.commitAnnotationEdit(tabContainerId, edit); }, [tabContainerId, actions])`.

Передать в SequenceView (linear mode):
- `primers={primersForActive}`
- `onAnnotationEdit={onAnnotationEdit}`

**Новый action в `store/skeleton-state.js` (+~30 строк):**

```
commitAnnotationEdit(containerId, edit):
  - resolve container в state.containers
  - switch edit.kind:
      'create' → append edit.payload (с generated id если нет) в annotations
      'update' → найти annotations[i] by edit.id, merge edit.patch
      'delete' → filter annotations не равные edit.id
  - вызвать toast (success или error)
```

Edit shape — exact contract SequenceView `useSelectionEdit` (см. `hooks/useSelectionEdit.js`). Code обязан свериться с реальным contract перед реализацией.

**Новый helper `editor/derive-primers.js` (~2 KB):**

```
derivePrimersForContainer(container, allPrimers, projectCommits) → Primer[]
  - linked commits = projectCommits.filter(c =>
      c.outputs?.containerIds?.includes(container.id) ||
      c.inputs?.containerIds?.includes(container.id))
  - linked primerIds = unique flatMap(commits.inputs?.primerIds)
  - linked primers = allPrimers.filter(p => linkedPrimerIds.includes(p.id))
  - for each primer:
      - matchForward = container.sequence.indexOf(primer.sequence)
      - matchReverse = container.sequence.indexOf(reverseComplement(primer.sequence))
      - if matchForward >= 0: push {...primer, start, end, strand: 1}
      - else if matchReverse >= 0: push {...primer, start, end, strand: -1}
      - else: skip (no match)
  - return [primers with positions]

helper reverseComplement(seq): inline 3-line implementation (A↔T, C↔G, reverse)
```

Output shape для SequenceView PrimerTrack consumer — Code обязан свериться с PrimerTrack expectation через grep `primers.map` / `primer.start` / `primer.strand`.

**Опц. новый helper `editor/edit-annotation-store.js` (~3 KB):** если логика `commitAnnotationEdit` вырастает >40 строк — вынести из skeleton-state в этот файл. Code решает по итогу.

**Правки в `store/skeleton-context.jsx`:**
- Expose `commitAnnotationEdit` в actions object.

---

## 7. Порядок выполнения

**K1 — Edit annotation flow:**
- Action `commitAnnotationEdit` в skeleton-state с 3 ветками (create/update/delete).
- Expose в skeleton-context.
- Подключить `onAnnotationEdit` в ContainerEditorSkeleton.jsx (+ удалить readOnly).
- Тест `skeleton-editor-edit-annotation.test.jsx` — открыть editor для pUC19, симулировать selection + H key → annotation создана в state → видна в next render.

**K2 — Primer derivation + match:**
- Новый файл `editor/derive-primers.js` с helper'ом + reverseComplement.
- Подключить `primersForActive` через useMemo в ContainerEditorSkeleton.jsx.
- Передать `primers={primersForActive}` в SequenceView (linear mode).
- Тест `skeleton-editor-primer-display.test.jsx` — открыть `c-puc19-lacz-amplicon` → primers p-1 + p-2 присутствуют в `primersForActive` с positions.

**K3 — Verification + cleanup:**
- `npm test` — все 12 + 2 новых = 14 skeleton-тестов pass. Vitest baseline в production 1697+ остаётся зелёным.
- `npx vite build` clean.
- `npm test -- canvas-skeleton` — focused run.

---

## 8. STOP-условие и формат отчёта

**STOP:** после K3. Code не финализирует координационные файлы.

**Code MUST NOT write to:**
- `CURRENT_TASK.md`, `RELEASES.md`, `PROJECT_STATE.md`, `DECISIONS.md`, `ANCHORS.md`, `BUGS.md`, `COMPONENT_MAP.md`, `TECH_DEBT.md`.
- `gui/designer/package.json` + `lib/version.js`.
- Production-компоненты вне `CanvasSkeleton/` (исключение: возможный read-only grep по `SequenceView/` для проверки PrimerTrack expected shape — не правка).

**Формат отчёта Code в чат:**
- Diff sizes по изменённым файлам.
- Размер новых файлов (`derive-primers.js`, опц. `edit-annotation-store.js`).
- Output `npm test -- canvas-skeleton` (14 tests pass).
- Output `npx vite build` (clean).
- Any deviation from spec — явно отметить (где и почему).
- Size budget: новые файлы + рост существующих, флаги если кто-то близок к soft.

После отчёта Code останавливается. Визуальная приёмка скелета v1.1 — отдельная сессия после compact.

---

## 9. Риски + открытые вопросы

**Риски:**

1. **PrimerTrack expected shape ≠ output `derivePrimersForContainer`.** Митигация: Code grep'ит PrimerTrack consumer перед K2, корректирует shape под expected fields.
2. **`onAnnotationEdit` edit shape отличается от useSelectionEdit contract.** Митигация: Code читает `hooks/useSelectionEdit.js` перед K1, swithc по точному `edit.kind` enum.
3. **Toast spam при множественных edits.** Митигация: один toast per action, без накопления. Если на приёмке достаёт — debounce в следующем fix.
4. **`reverseComplement` collision с existing helper.** Митигация: `lib/sequence-search.js` уже экспортирует `reverseComplement` (см. v0.8.2 changes в COMPONENT_MAP). Code импортирует existing, не дублирует.
5. **Primer тот же на разных containers с разным match.** Митигация: derivation per-container — это норма. Primer p-1 (lacZ_fwd) показан на pUC19 (template) И на pUC19_lacZ_amplicon (product) — биологически корректно.

**Открытые вопросы:**

1. **`primer-reuse.js` integration вместо naive indexOf** — на acceptance перепроверить. Если existing helper делает alignment с mismatch tolerance / IUPAC — переход.
2. **`onOpenFeatureEditor` / mock FeatureEditorModal** — если на приёмке inline rename окажется недостаточным.
3. **Match всех primers пула** (не только origin) — следующий sprint. Может быть нужно для UX «биолог открыл container, видит все primers которые могут к нему сидеть».

---

_Создано:_ 11.05.2026 поздний вечер, Chat-сессия после обнаружения разрыва скелета на pre-acceptance проверке.
_Patch для:_ `SPRINT_M-CANVAS-SKELETON.md` v1.
_Зрелость к acceptance:_ K1-K3 готовы к Code-handoff без дополнительных вопросов.
