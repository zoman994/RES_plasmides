# Sprint 2a — FragmentEditor decomposition

**Статус:** ✅ РЕАЛИЗОВАНО 23.04.2026.
**Автор спеки:** Claude Chat, 22.04.2026.
**Цель:** разобрать `components/FragmentEditor.jsx` (1353 строки, 72 KB) на модули в папке `components/FragmentEditor/` так, чтобы ни один файл не превышал 25 KB, а top-level компонент `index.jsx` уложился в ≤22 KB.

**Пост-приёмка (23.04.2026):** декомпозиция выполнена в 7 коммитах K1–K7 (`923d1c1`, `e2c9fad`, `eae6f54`, `42160cb`, `f932cad`, `bb64baa`, `29b98f2`), 738/738 Vitest зелёные без переписывания тестов. **Единственное значимое отклонение:** `index.jsx` вышел **46 KB**, над hard-лимитом 40 KB (цель спеки ≤22 KB). Причина — §3 OUT явно исключил K10 panels (~280 строк collapsible JSX) и вынос state в hook; прогноз ≤22 KB был математически неверен ещё на этапе написания спеки. Закрытие — Sprint 2a.1 (один коммит, вынос `EditorPanels.jsx` ~10–12 KB). Вытекшее отсюда ⚓-решение о том, что декомпозиция должна закрывать hard-лимит целиком в рамках одного спринта, зафиксировано в `DECISIONS.md` 23.04.2026 («Архитектурная гигиена»).

---

## 1. Контекст

`FragmentEditor.jsx` — третий крупнейший файл проекта и самый активно правленый компонент в Sprint 1.5/1.6/1.7. Текущий размер — 72 KB (1353 строки) при hard-лимите 40 KB из ⚓ DECISIONS 22.04.2026. Файл существенно превышает лимит ещё до Sprint 2; новые фичи (V7 InsertionClock US-2 в Мутагенезе, V18 full-view protein-DNA sync, V19 UX-редизайн codon editor) требуют добавить сюда ещё логики — без декомпозиции это невозможно.

Структурно файл уже готов к разбору — блоки слабо сцеплены:

- **Строки 1-214:** module-scope блоки — 3 pure helpers (computeMutationHighlights, mutationHitsAA, computeFullViewHighlights), константы палитры цветов + localStorage helpers, REGION_TYPES/REGION_COLORS, helpers для персистентности доменов. Не используют React, не зависят от state компонента.
- **Строки 215-280:** 22 useState + 2 useRef в главном компоненте.
- **Строки 281-630:** handlers, effects, applyMut/applyDel/applyDna* (350 строк).
- **Строки 631-1140:** главный return JSX — header, mode switcher, topology toggle, full-view toggle, sequence grid (CDS и non-CDS ветки), panels (annotations/mutations/protein), save button.
- **Строки 1142-1235:** AA mutation popup (portal, 94 строки, изолированная UI-единица).
- **Строки 1236-1340:** DNA mutation popup (portal, 105 строк, изолированная UI-единица).
- **Строки 1341-1353:** instant nucleotide tooltip (13 строк, portal).

Три pure helpers и два portal-popup — это низко висящие плоды: выносятся без изменения API компонента. Главный JSX (510 строк) сложнее — Sequence Grid это ядро, его выносим отдельным файлом, остальное оставляем в `index.jsx` как layout-композицию.

Предыдущий план из CURRENT_TASK.md ориентировался на 4–5 модулей. Реальная раскройка после инвентаризации — 7 модулей + 1 папка. Каждый из 7 имеет естественную границу и не требует искусственного дробления.

## 2. Стратегия

Раскладываем `FragmentEditor.jsx` в папку `components/FragmentEditor/` на 7 файлов с чёткими границами: pure helpers в `.js`, изолированные UI-юниты в отдельных `.jsx`, Sequence Grid в своём `.jsx` как самый крупный JSX-блок, всё остальное (header, mode switcher, topology toggle, panels, save, state management) — в `index.jsx`. Внешний импорт `components/FragmentEditor` остаётся рабочим через re-export в `index.jsx` → сторонний код менять не требуется. Файл-бандл `FragmentEditor.jsx` удаляется в финальном коммите.

## 3. Scope

### IN

- Декомпозиция `FragmentEditor.jsx` на 7 файлов в `components/FragmentEditor/`.
- Удаление старого файла `components/FragmentEditor.jsx`.
- Экспорт всех 3 pure helpers (`computeMutationHighlights`, `mutationHitsAA`, `computeFullViewHighlights`) из `FragmentEditor/highlights.js` с сохранением сигнатур.
- Сохранение всех существующих тестов зелёными без переписывания под новую структуру.
- Размер-отчёт по CLAUDE.md §7 в конце спринта.

### OUT (явно не делаем в 2a)

- Декомпозиция `App.jsx` и `DesignCanvas.jsx` — это Sprint 2b после визуальной приёмки 2a.
- Любые функциональные изменения UI. Пиксель-в-пиксель и клик-в-клик то же поведение.
- Переписывание useState на useReducer или consolidation — state-management рефакторинг не в скоупе.
- Исправление V18/V19/V20/V21 — ждут Sprint 3 UX Polish.
- Вынос state-handlers из `index.jsx` в отдельные хуки (useFragmentEditorState и т.п.). Если `index.jsx` уложился в ≤22 KB — этого достаточно; дальнейший вынос overengineering.
- Декомпозиция helpers в `src/` (`auto-annotate.js`, `mutagenesis.js`, etc.) — не в красной зоне.

## 4. Архитектурные решения

1. **Папка `components/FragmentEditor/`, не префиксы в плоской папке.** Все 7 файлов собраны под одной директорией, `index.jsx` служит точкой входа. Альтернатива — плоская папка `components/` с префиксами `FragmentEditor-SequenceGrid.jsx` — отвергнута: загрязняет ls в `components/`, визуально хуже.

2. **Внешний импорт остаётся `from './FragmentEditor'` (без `/index`).** В `App.jsx` и других местах импорт `import FragmentEditor from './components/FragmentEditor'` разрешается через `index.jsx` автоматически. Не требуется менять ни одной строки в импортёрах.

3. **Pure helpers (highlights + colors + region-types) — в `.js` файлах, не `.jsx`.** Они не возвращают React-элементов и не импортируют React. Это даёт чистую границу: Code или тесты могут импортировать их без поднятия JSX-runtime.

4. **Два popup — отдельные файлы.** AA popup и DNA popup — self-contained UI-юниты ~100 строк каждый с портала `createPortal`. Они получают props от `index.jsx` (target, seq, protein, callbacks) и рендерят изолированно. Тесно связаны через shared state `mutations` и `mode`, но рендер независим.

5. **SequenceGrid — самый сложный вынос, включает обе ветки (CDS и non-CDS) и edit/view sub-режимы.** ~280 строк JSX плюс нужные handlers для AA-click, DNA-click, inline codon edit. Получает props: `fragment`, `seq`, `protein`, `mode`, `editMode`, `mutationHighlight`, `onOpenMutMenu`, `onOpenDnaMutMenu`, `onCodonEditCommit`, `onApplyDnaSub/Del/Insert`, `onSetNucTooltip`. Callback-пачка большая, но явная — состояние остаётся в `index.jsx`.

6. **Full-view grid — отдельный файл `FullViewGrid.jsx`, не подмодуль SequenceGrid.** Две разные области ответственности: SequenceGrid умеет edit+mutagenesis на под-фрагменте, FullViewGrid умеет read-only рендер полного гена с highlight текущего sub. Смешивать их повышает сложность обоих.

7. **React Compiler работает как раньше.** Никаких ручных `useMemo`/`useCallback` добавлять не нужно. При необходимости компилятор сам мемоизирует callbacks, передаваемые в SequenceGrid/popups.

8. **Тесты не переписываем.** Если тест импортирует `import FragmentEditor from '../components/FragmentEditor'` — он продолжит работать через `index.jsx`. Если тест импортирует internal helper — переключаем импорт на новый путь (`../components/FragmentEditor/highlights`), но не переписываем логику теста. Падающий тест — сигнал регрессии, не повод переписать его под новую структуру.

## 5. Целевая файловая структура

После Sprint 2a в `gui/designer/src/components/FragmentEditor/`:

### 5.1. `index.jsx` (цель ~20 KB, hard-лимит ≤22 KB)

Top-level компонент `FragmentEditor`. Содержит:

- Все 22 useState + 2 useRef (fragment, seq, mode, panelsOpen, sequenceView, topology, annotations, domains, customColor, showPalette, editMode, mutTarget, dnaMutTarget, customAA, mutations, editingCodon, insertSeq, nucTooltip, addForm, domPaletteIdx, userColors + colorInitRef + dnaMutAnchor + протеин useMemo + codonLines useMemo).
- Handlers: `switchMode`, `openMutMenu`, `openDnaMutMenu`, `apply`, `handleSaveEdit`, `handleSaveMutagenesis`, `handleSaveAsVariant`, `applyMut`, `applyMultiMut`, `applyDel`, `commitCodonEdit`, `applyDnaSub`, `applyDnaDel`, `applyDnaInsert`, `addDomain`, и прочее (~20 handlers).
- Effects: `colorInitRef` sync (useEffect, строка 350), другие.
- JSX: обёртка модалки, header с color palette dropdown, mode switcher (K2), topology toggle (K12), full-view toggle (K11), панели `<details>` для annotations/mutations/protein, save button — всё, что было в строках 631-1141 **кроме** SequenceGrid и FullViewGrid блоков.
- Рендер `<SequenceGrid />`, `<FullViewGrid />` (условный по `sequenceView`), `<AAMutationPopup />`, `<DnaMutationPopup />`, `<NucTooltip />`.

**Внешний API не меняется:**

```
export default function FragmentEditor({
  fragment, onSave, onClose, onColorChange,
  onSaveAsVariant, assemblyCircular = false
})
```

Re-экспорт pure helpers для обратной совместимости (если какие-то тесты импортировали их напрямую):

```
export { computeMutationHighlights, mutationHitsAA, computeFullViewHighlights } from './highlights';
```

### 5.2. `SequenceGrid.jsx` (цель ~14 KB, hard-лимит ≤16 KB)

Рендер последовательности — две ветки:

- **CDS-ветка:** per-nucleotide clickable grid с AA под кодоном, read-only AA в `mode='edit'`, clickable AA → mutation popup в `mode='mutagenesis'`. Codon inline edit в `editMode='edit'`.
- **Non-CDS-ветка:** textarea в `editMode='edit'` или clickable-nucleotide grid для DNA mutagenesis в `editMode='view'`.

Плюс: nucleotide tooltip trigger на hover, keyboard handlers для nucleotide events (Shift+click range).

**Контракт (props):**

```
<SequenceGrid
  fragment={fragment}
  seq={seq}                    // текущая sequence из state
  protein={protein}            // translateDNA(seq) из state
  mode={mode}                  // 'edit' | 'mutagenesis'
  editMode={editMode}          // 'view' | 'edit'
  mutations={mutations}
  mutationHighlight={mutationHighlight}  // Map<ntPos, 'silent'|'nonsilent'>
  editingCodon={editingCodon}
  hasCDSRegion={hasCDSRegion}
  codonLines={codonLines}
  onOpenMutMenu={openMutMenu}
  onOpenDnaMutMenu={openDnaMutMenu}
  onCommitCodonEdit={commitCodonEdit}
  onSetEditingCodon={setEditingCodon}
  onApplyDnaSub={applyDnaSub}
  onApplyDnaDel={applyDnaDel}
  onApplyDnaInsert={applyDnaInsert}
  onSetSeq={setSeq}            // для textarea в non-CDS edit mode
  onSetNucTooltip={setNucTooltip}
  dnaMutAnchor={dnaMutAnchor}  // ref для Shift+click
  assemblyCircular={assemblyCircular}
/>
```

Большая props-пачка — это цена сохранения state в `index.jsx`. Альтернатива (поднять callbacks наверх через useReducer + context) — out of scope.

### 5.3. `FullViewGrid.jsx` (цель ~4 KB)

Virtual full-view rendering для split-group sub-фрагментов (K11).

**Контракт:**

```
<FullViewGrid
  fragment={fragment}
  fullViewHighlight={fullViewHighlight}  // из useMemo в index.jsx
  mutationHighlight={mutationHighlight}
/>
```

Render: баннер «Виртуальный вид», read-only sequence grid с highlight region на текущий sub, notice «В полном обзоре аннотации недоступны». `data-testid="fragment-editor-full-view"` сохраняется.

### 5.4. `AAMutationPopup.jsx` (цель ~6 KB)

Portal-popup для AA mutations (строки 1142-1235 исходника).

**Контракт:**

```
<AAMutationPopup
  mutTarget={mutTarget}            // { start, end, x, y } | null
  protein={protein}
  seq={seq}
  customAA={customAA}
  mutations={mutations}
  onClose={() => setMutTarget(null)}
  onSetCustomAA={setCustomAA}
  onApplyMut={applyMut}
  onApplyMultiMut={applyMultiMut}
  onApplyDel={applyDel}
/>
```

Рендерит `null` когда `mutTarget == null`. Содержимое: header (single AA или range), current sequence, quick substitutions, custom AA input, multi-AA Ala scan, delete button, applied mutations list.

### 5.5. `DnaMutationPopup.jsx` (цель ~6 KB)

Portal-popup для DNA mutations (строки 1236-1340 исходника) + instant nucleotide tooltip (1341-1353).

**Контракт:**

```
<DnaMutationPopup
  dnaMutTarget={dnaMutTarget}
  seq={seq}
  insertSeq={insertSeq}
  mutations={mutations}
  hasCDSRegion={hasCDSRegion}
  onClose={() => setDnaMutTarget(null)}
  onSetInsertSeq={setInsertSeq}
  onApplyDnaSub={applyDnaSub}
  onApplyDnaDel={applyDnaDel}
  onApplyDnaInsert={applyDnaInsert}
/>

<NucTooltip tooltip={nucTooltip} />  // маленький helper компонент, можно оставить в том же файле
```

Ветки: substitution, insertion, deletion + AA-effect preview для CDS + applied mutations list.

### 5.6. `highlights.js` (цель ~3 KB)

Три pure helpers без React-импортов:

```
export function computeMutationHighlights(fragment, parent) { ... }
export function mutationHitsAA(m, aaPos) { ... }
export function computeFullViewHighlights(fragment) { ... }
```

Точные сигнатуры и логика копируются **буквально** из строк 39-110 исходника. Никаких изменений. Если тесты импортировали их напрямую (`import { computeMutationHighlights } from '../components/FragmentEditor'`) — они продолжат работать через re-export в `index.jsx` (решение §4).

### 5.7. `color-palette.js` (цель ~2 KB)

Константы палитры цветов + localStorage helpers:

```
export const BASE_PALETTE = [...];
export function loadUserColors();
export function saveUserColor(hex);
export function replaceUserColor(idx, hex);
export function getFragColorDefault(frag);
// bindNativeChange — local helper для color-input. Можно оставить в index.jsx как local function,
// либо вынести сюда как чистый утил. Code принимает по месту, в зависимости от того, где он используется.
```

Если bindNativeChange используется только в `index.jsx` — оставляем его там. Если импортируется ещё где-то — в `color-palette.js`.

### 5.8. `region-types.js` (цель ~1.5 KB)

Константы типов регионов + persistence:

```
export const REGION_TYPES = { ... };         // CDS, gene, promoter, ...
export const REGION_COLORS = { ... };
export function getRegionTypes(fragType);
export function addCustomRegionType(value, label);

// Domain persistence (из строк 211-213 исходника):
export const DOMAINS_LS_KEY = 'pvcs-parts-domains';
export function loadSavedDomains(id);
export function persistDomains(id, domains);
```

Группировка «region types + domains» — по назначению: оба работают с разметкой fragment на sub-элементы и оба сохраняются в localStorage. Разделять их на два файла — переусложнение.

Альтернатива: `domain-storage.js` отдельно. Code принимает решение по месту — если вышло визуально логично разделять, пусть разделит. В любом случае, два новых `.js` файла < 3 KB суммарно.

---

## 6. Задачи (K1–K7, по одному файлу за раз)

Порядок: от pure модулей к composite, с проверкой тестов после каждой задачи. Один коммит на задачу.

### K1. Создать `FragmentEditor/highlights.js`

- Новый файл `components/FragmentEditor/highlights.js`.
- Переносим buqvально функции `computeMutationHighlights`, `mutationHitsAA`, `computeFullViewHighlights` из строк 39-110 исходника.
- В старом `FragmentEditor.jsx` **пока оставляем** их как `export` чтобы не сломать тесты — но реализации меняем на re-export: `export { computeMutationHighlights, ... } from './FragmentEditor/highlights';`.
- Запуск: `cd gui/designer && npx vitest run`. Все тесты зелёные.
- Коммит: `refactor(FragmentEditor): extract pure highlights helpers`.

### K2. Создать `FragmentEditor/color-palette.js` и `FragmentEditor/region-types.js`

- Два новых файла.
- Переносим `BASE_PALETTE`, `USER_COLORS_KEY`, `loadUserColors`, `saveUserColor`, `replaceUserColor`, `getFragColorDefault` в `color-palette.js`.
- Переносим `REGION_TYPES`, `REGION_COLORS`, `getRegionTypes`, `addCustomRegionType`, `DOMAINS_LS_KEY`, `loadSavedDomains`, `persistDomains` в `region-types.js`.
- В старом `FragmentEditor.jsx` заменяем локальные объявления на import.
- `bindNativeChange` оставляем локально в компоненте (используется только в `index.jsx` будущем).
- Тесты зелёные.
- Коммит: `refactor(FragmentEditor): extract color palette and region types to data modules`.

### K3. Создать `FragmentEditor/FullViewGrid.jsx`

- Новый файл.
- Переносим JSX блок `sequenceView === 'full' && ...` из строк 771-818 исходника в компонент `<FullViewGrid />` с props `fragment, fullViewHighlight, mutationHighlight`.
- В `FragmentEditor.jsx` заменяем inline JSX на `<FullViewGrid fragment={fragment} fullViewHighlight={fullViewHighlight} mutationHighlight={mutationHighlight} />`.
- `data-testid="fragment-editor-full-view"` сохраняется.
- Тесты зелёные, особенно K11 integration-тесты на full-view.
- Коммит: `refactor(FragmentEditor): extract FullViewGrid component`.

### K4. Создать `FragmentEditor/AAMutationPopup.jsx`

- Новый файл.
- Переносим JSX блок `mutTarget && createPortal(...)` из строк 1142-1235 в `<AAMutationPopup />`.
- Props — см. §5.4.
- В `FragmentEditor.jsx` на месте блока: `<AAMutationPopup mutTarget={mutTarget} protein={protein} seq={seq} customAA={customAA} mutations={mutations} onClose={...} onSetCustomAA={setCustomAA} onApplyMut={applyMut} onApplyMultiMut={applyMultiMut} onApplyDel={applyDel} />`.
- Тесты зелёные, особенно `fragment-editor-mutation*` и всё что кликает на AA-popup.
- Коммит: `refactor(FragmentEditor): extract AAMutationPopup component`.

### K5. Создать `FragmentEditor/DnaMutationPopup.jsx`

- Новый файл.
- Переносим JSX блок `dnaMutTarget && createPortal(...)` из строк 1236-1340 в `<DnaMutationPopup />`.
- Instant nucleotide tooltip (строки 1341-1353) переносим туда же как вспомогательный `<NucTooltip />`, либо в файл-сосед — Code решает по месту (если получается чисто — в тот же файл).
- Props — см. §5.5.
- Тесты зелёные, особенно `fragment-editor-dna*`.
- Коммит: `refactor(FragmentEditor): extract DnaMutationPopup and NucTooltip`.

### K6. Создать `FragmentEditor/SequenceGrid.jsx`

Самый крупный шаг — требует аккуратности.

- Новый файл.
- Переносим два блока JSX:
  - CDS-ветка: строки 828-890 исходника (`{/* CDS nucleotide view */}`).
  - Non-CDS edit ветка: строки 891-898 (`{/* Non-CDS edit mode: textarea */}`).
  - Non-CDS view ветка: строки 899-1114 (`{/* Non-CDS view mode: clickable nucleotides */}`).
- Итого SequenceGrid рендерит всё содержимое внутри `<div>` обёртки, которая сейчас начинается около строки 825 исходника.
- Props — см. §5.2.
- В `FragmentEditor.jsx` на месте блока: `<SequenceGrid fragment={fragment} seq={seq} protein={protein} mode={mode} ... />`.
- Внутри SequenceGrid не держим собственного state. Только props-callbacks.
- Тесты зелёные — это самая рискованная точка регрессии; прогоняем ВСЕ тесты FragmentEditor перед коммитом.
- Коммит: `refactor(FragmentEditor): extract SequenceGrid component`.

### K7. Финализация: переименование `FragmentEditor.jsx` → `FragmentEditor/index.jsx`

- Создаём файл `components/FragmentEditor/index.jsx` и переносим в него **всё, что осталось** в `FragmentEditor.jsx` после K1–K6.
- Удаляем `components/FragmentEditor.jsx`.
- Проверка: импорты в `App.jsx` (`import FragmentEditor from './components/FragmentEditor'`) продолжают работать через автоматическое разрешение `./FragmentEditor/index.jsx`.
- Re-export pure helpers из `./highlights` в `index.jsx` (см. §5.1 конец).
- Прогон: `cd gui/designer && npx vitest run && npx vite build`. Всё зелёное.
- Размер-отчёт (см. CLAUDE.md §7):

```bash
cd gui/designer/src
find components -name '*.jsx' -printf '%s %p\n' | sort -n | tail -15
find . -maxdepth 1 -name '*.js' -printf '%s %p\n' | sort -n | tail -10
```

- Коммит: `refactor(FragmentEditor): finalize decomposition — move to FragmentEditor/ folder`.

---

## 7. Оценка

| Задача | Оценка | Риск |
|--------|--------|------|
| K1 | 30 мин | Низкий (чистые функции) |
| K2 | 30 мин | Низкий (данные + localStorage) |
| K3 | 45 мин | Низкий-средний (K11 integration) |
| K4 | 1 ч | Средний (7 веток popup) |
| K5 | 1 ч | Средний (3 ветки popup + AA-effect + tooltip) |
| K6 | 2–2.5 ч | Высокий (самый крупный JSX, Sprint 1.6 K5/K7/K8 и 1.7 K9/K10/K11 логика) |
| K7 | 30–45 мин | Низкий (механическое переименование) |
| **Итого** | **6–7 ч** | — |

---

## 8. STOP-условие

Code останавливается **после K7** и ждёт визуальную приёмку от Игоря.

Не финализировать: `PROJECT_STATE.md` Sprint-блок, `DECISIONS.md`, `BUGS.md` (FIXED перенос из OPEN), `docs/SPRINT_2A_FRAGMENTEDITOR_DECOMP.md` → `archive/`. Это делается в следующей Chat-сессии после визуальной приёмки.

Допустимо обновить по ходу: `CURRENT_TASK.md` — отмечать `[x]` после каждого коммита K1–K7.

## 9. Формат отчёта Code

В `CURRENT_TASK.md` в конце (блок «Отчёт Code»):

- Коммит-хэши K1–K7.
- Финальные размеры файлов (`find components -name '*.jsx' -printf '%s %p\n' | sort -n | tail -15`).
- Финальные счётчики тестов Vitest и pytest.
- Build status.
- **Отклонения от спеки** — явным блоком. Если `bindNativeChange` вынесен в `color-palette.js`, если `NucTooltip` вынесен в отдельный файл, если SequenceGrid props-список отличается от §5.2 — каждое решение отдельным пунктом с обоснованием.
- **Падающие тесты** — явным блоком. Если на каком-то шаге тест упал, Code пишет сюда причину и как исправил. Если переписал тест под новую структуру — обосновывает почему.

## 10. Риски и митигация

1. **Регрессия в SequenceGrid (K6).** Самый сложный шаг, три ветки JSX, несколько источников state + много callbacks. Митигация: прогонять все тесты FragmentEditor перед коммитом K6; если хоть один упал — откатить K6 к состоянию K5 и переделать отдельно.

2. **Циклический импорт между `index.jsx` и подмодулями.** Подмодули должны импортировать **только** из `../../` (внешние модули вроде `../codons`, `../theme`) и `./highlights.js` (pure). Никогда из `./index`. Если понадобится helper из `index.jsx` — он не чистый и должен быть вынесен в отдельный файл, а не импортирован в JSX-подмодуль.

3. **Pure helpers используют `fragment.templateStart` — проверить что Sprint 1.7 K9 не затронут.** После K1 прогонять `fragment-editor-mutations*.test` и `sequence-diff*.test` — они проверяют correctness K9 V16-фикса (templateStart в computeMutationHighlights). Если падают — K9 сломан, откатить K1.

4. **`@xyflow/react` (Project Flow) импортирует какой-то helper из FragmentEditor.** Маловероятно, но проверить `grep -r "from.*FragmentEditor" gui/designer/src/` перед K7 — если есть внешние импорты pure helpers, добавить re-exports в `index.jsx`.

5. **Тесты используют `render(<FragmentEditor ... />)` и внутри ищут что-то по DOM-структуре — structure-based assertion.** При разборе вложенности (новый `<SequenceGrid>` wrapper div) DOM немного меняется. Митигация: после K6 прогнать тесты, если падают только structure-based — уточнить wrapper div чтобы DOM остался тем же.

## 11. Открытые вопросы

1. **`bindNativeChange` — локально в `index.jsx` или в `color-palette.js`?** Решение Code по месту. Если использование только в `index.jsx` — локально. Если хоть где-то ещё (например, в SequenceGrid через props) — в `color-palette.js`.

2. **Instant nucleotide tooltip — подкомпонент `<NucTooltip>` в `DnaMutationPopup.jsx` или отдельный файл `NucTooltip.jsx`?** 13 строк — на грани. Решение Code: если получается естественно оставить в `DnaMutationPopup.jsx` — там. Если приходится пробрасывать nucTooltip state через 3 уровня — отдельный файл, тогда `index.jsx` рендерит его рядом с popup.

3. **Domain persistence (`DOMAINS_LS_KEY`, `loadSavedDomains`, `persistDomains`) — в `region-types.js` или в отдельном `domain-storage.js`?** Решение Code. Если region-types.js после добавления domains разросся близко к 3 KB — делить на два файла.

4. **Перенос ли `FullViewGrid` и `SequenceGrid` в `components/FragmentEditor/` или в `components/`?** В спеке — в `FragmentEditor/`. Аргумент за: все они используются только из `FragmentEditor`, инкапсулированы. Аргумент против: в будущем V7 InsertionClock может импортировать SequenceGrid для US-2 (выбор позиции на последовательности). Если Игорь/Code решит что переиспользуется — можно в `components/` плоско. По умолчанию следуем спеке (в `FragmentEditor/`) и при первой реальной нужде переносим в `components/`.

---

## 12. Что делать при регрессии

Если на визуальной приёмке Игорь обнаружит поведенческую регрессию (клик не сработал, popup не открылся, mutation highlight съехал):

1. Не начинать Sprint 2b.
2. Создать bug entry `V22..V2N` в `BUGS.md` с точным сценарием воспроизведения.
3. Новая Chat-сессия пишет fix-спеку в `CURRENT_TASK.md` на регрессию.
4. Code фиксит, снова визуальная приёмка, только потом Sprint 2b.

Если регрессий нет — следующая Chat-сессия пишет `SPRINT_2B_APP_CANVAS_DECOMP.md`.
