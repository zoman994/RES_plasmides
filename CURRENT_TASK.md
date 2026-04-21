# CURRENT_TASK.md

**Статус:** активна — Sprint 2a FragmentEditor decomposition.
**Спека:** `docs/SPRINT_2A_FRAGMENTEDITOR_DECOMP.md`.
**Не дублирует спеку — оперативный чеклист.**

---

## TL;DR

Разобрать `components/FragmentEditor.jsx` (1353 строки, 72 KB) на 7 файлов в `components/FragmentEditor/`. Ни один файл > 25 KB, `index.jsx` ≤ 22 KB. Поведение пиксель-в-пиксель как сейчас. Все существующие тесты зелёные без переписывания.

Оценка: 6–7 часов, 7 коммитов (K1–K7).

---

## Порядок чтения перед стартом

1. `CLAUDE.md` — напомнить §7 (лимиты размера модулей) и §4 (координация).
2. `docs/SPRINT_2A_FRAGMENTEDITOR_DECOMP.md` — спека целиком.
3. `components/FragmentEditor.jsx` — ориентировка в текущем файле (грепать по номерам строк из спеки).
4. `BUGS.md` — пробежать OPEN, ничего из Sprint 2a там не ждёт; проверка нужна только чтобы при регрессии правильно завести новую запись.

---

## Чеклист задач

### K1. Extract pure helpers → `FragmentEditor/highlights.js`

- [x] Создать `components/FragmentEditor/highlights.js`.
- [x] Перенести 3 функции из строк 39-110 исходника: `computeMutationHighlights`, `mutationHitsAA`, `computeFullViewHighlights`.
- [x] В старом `FragmentEditor.jsx` заменить реализации на re-export.
- [x] Прогон: `cd gui/designer && npx vitest run`. Все зелёные.
- [x] Коммит: `refactor(FragmentEditor): extract pure highlights helpers`.

**Артефакты:** 1 новый файл (~3 KB).

---

### K2. Extract data modules → `color-palette.js` + `region-types.js`

- [x] Создать `components/FragmentEditor/color-palette.js`: `BASE_PALETTE`, `USER_COLORS_KEY`, `loadUserColors`, `saveUserColor`, `replaceUserColor`, `getFragColorDefault`.
- [x] Создать `components/FragmentEditor/region-types.js`: `REGION_TYPES`, `REGION_COLORS`, `getRegionTypes`, `addCustomRegionType`, `DOMAINS_LS_KEY`, `loadSavedDomains`, `persistDomains`.
- [ ] `bindNativeChange` оставить локально в `FragmentEditor.jsx` (пока), либо в `color-palette.js` — Code решает (см. §11 спеки Q1).
- [ ] В `FragmentEditor.jsx` заменить локальные объявления на импорты.
- [x] Прогон тестов — зелёные.
- [x] Коммит: `refactor(FragmentEditor): extract color palette and region types to data modules`.

**Артефакты:** 2 новых файла (~2 + ~1.5 KB).

---

### K3. Extract `FullViewGrid.jsx`

- [x] Создать `components/FragmentEditor/FullViewGrid.jsx`.
- [x] Перенести JSX блок из строк 771-818 исходника (sequenceView === 'full' ветка).
- [x] Props: `{ fragment, fullViewHighlight, mutationHighlight }`. Никакого внутреннего state.
- [x] Сохранить `data-testid="fragment-editor-full-view"`.
- [x] Прогон тестов, особенно K11 integration (`fragment-editor-full-view*`).
- [x] Коммит: `refactor(FragmentEditor): extract FullViewGrid component`.

**Артефакты:** 1 новый файл (~4 KB).

---

### K4. Extract `AAMutationPopup.jsx`

- [x] Создать `components/FragmentEditor/AAMutationPopup.jsx`.
- [x] Перенести portal-блок из строк 1142-1235 исходника.
- [x] Контракт props — §5.4 спеки.
- [x] Прогон тестов: fragment-editor mutation AA-popup тесты.
- [x] Коммит: `refactor(FragmentEditor): extract AAMutationPopup component`.

**Артефакты:** 1 новый файл (~6 KB).

---

### K5. Extract `DnaMutationPopup.jsx`

- [x] Создать `components/FragmentEditor/DnaMutationPopup.jsx`.
- [x] Перенести portal-блок из строк 1236-1340 исходника.
- [x] Instant nucleotide tooltip (1341-1353) — либо в этот же файл, либо отдельно (решение Code, §11 спеки Q2).
- [x] Контракт props — §5.5 спеки.
- [x] Прогон тестов: fragment-editor DNA-popup тесты.
- [x] Коммит: `refactor(FragmentEditor): extract DnaMutationPopup and NucTooltip`.

**Артефакты:** 1 новый файл (~6 KB) или 2 если NucTooltip отдельно.

---

### K6. Extract `SequenceGrid.jsx` (самый рискованный шаг)

- [x] Создать `components/FragmentEditor/SequenceGrid.jsx`.
- [x] Перенести три JSX-ветки из строк 828-1114 исходника: CDS nucleotide view + non-CDS edit (textarea) + non-CDS view (clickable nucleotides).
- [x] Контракт props — §5.2 спеки. Внутри state нет.
- [x] **Перед коммитом:** прогон ВСЕХ тестов FragmentEditor. Если хоть один упал — диагностика перед коммитом. Regression-тесты на Sprint 1.6 K5/K7/K8 и Sprint 1.7 K9/K10/K11 критичны.
- [x] Коммит: `refactor(FragmentEditor): extract SequenceGrid component`.

**Артефакты:** 1 новый файл (~14 KB).

---

### K7. Финализация — `FragmentEditor/index.jsx`

- [x] Создать `components/FragmentEditor/index.jsx`.
- [x] Перенести в него **всё оставшееся** из `FragmentEditor.jsx` после K1–K6.
- [x] Re-export pure helpers: `export { computeMutationHighlights, mutationHitsAA, computeFullViewHighlights } from './highlights';`.
- [x] Удалить `components/FragmentEditor.jsx`.
- [x] Проверить: `grep -rn "from.*FragmentEditor" gui/designer/src/` → все импорты продолжают резолвиться.
- [x] Прогон: `npx vitest run && npx vite build`. Всё зелёное.
- [x] Размер-отчёт (CLAUDE.md §7):
  ```bash
  cd gui/designer/src
  find components -name '*.jsx' -printf '%s %p\n' | sort -n | tail -15
  find . -maxdepth 1 -name '*.js' -printf '%s %p\n' | sort -n | tail -10
  ```
- [x] Коммит: `refactor(FragmentEditor): finalize decomposition — move to FragmentEditor/ folder`.

**Артефакты:** 1 новый файл (`index.jsx`, цель ~20 KB, hard ≤22 KB), удалён 1 старый файл.

---

## STOP-условие

**После K7 остановиться.** Ждать визуальную приёмку от Игоря.

НЕ делать:
- Перенос FIXED в `BUGS.md`.
- Обновление `PROJECT_STATE.md` «Журнал сессий».
- Обновление `DECISIONS.md`.
- Перенос спеки в `docs/archive/`.

Это делает следующая Chat-сессия после визуальной приёмки.

Допустимо по ходу: обновлять `CURRENT_TASK.md` — отмечать `[x]` после каждого коммита K1–K7.

---

## Формат отчёта (в конце этого файла после K7)

В раздел «Отчёт Code» ниже добавить:

1. Коммит-хэши K1–K7 (по одному на строку).
2. Финальные размеры:
   ```
   index.jsx:              XX KB (цель ≤22)
   SequenceGrid.jsx:       XX KB (цель ≤16)
   FullViewGrid.jsx:       XX KB
   AAMutationPopup.jsx:    XX KB
   DnaMutationPopup.jsx:   XX KB
   highlights.js:          XX KB
   color-palette.js:       XX KB
   region-types.js:        XX KB
   ```
3. Тесты: Vitest XXX/738 pass · pytest XXX/112 pass · build clean | failed.
4. **Отклонения от спеки** — явным блоком. Если структура получилась не ровно как в §5 — перечислить расхождения с обоснованием (например: «`bindNativeChange` вынесен в `color-palette.js` потому что SequenceGrid тоже им пользуется»).
5. **Сломанные тесты** — явным блоком. Если на каком-то шаге тест упал и Code его переписал — пункт «почему». Если Code откатывался — коммит-хэш ревёрта.

---

## Что делать при регрессии (во время работы Code)

- **Тесты падают после K6 (SequenceGrid).** Откатить K6, диагностировать (чаще всего: props не прокинуты, state race после раскладки callbacks). Не переписывать тест под новую структуру — это скрывает регрессию.
- **Циклический импорт.** Подмодули никогда не импортируют из `./index` или `..`. Только из `./highlights`, `./color-palette`, `./region-types` и внешних `../../` (codons, theme, mutagenesis).
- **V16 templateStart mapping сломался.** Прогон `sequence-diff*.test` и `fragment-editor-mutations*.test`. Если падают — K1 сломал highlights, откатить и сверить код посимвольно с оригиналом (строки 39-110).
- **Импорт из внешнего модуля сломался.** Проверить `grep` по всем `src/` — если есть прямой импорт pure helper из `FragmentEditor`, добавить re-export в `index.jsx`.

---

## Отчёт Code

### Коммиты

- K1 — `923d1c1` refactor(FragmentEditor): extract pure highlights helpers
- K2 — `e2c9fad` refactor(FragmentEditor): extract color palette and region types to data modules
- K3 — `eae6f54` refactor(FragmentEditor): extract FullViewGrid component
- K4 — `42160cb` refactor(FragmentEditor): extract AAMutationPopup component
- K5 — `f932cad` refactor(FragmentEditor): extract DnaMutationPopup and NucTooltip
- K6 — `bb64baa` refactor(FragmentEditor): extract SequenceGrid component
- K7 — `29b98f2` refactor(FragmentEditor): finalize decomposition — move to FragmentEditor/ folder

### Финальные размеры `components/FragmentEditor/`

```
index.jsx:              46.0 KB   (цель ≤22 · фактически ×2, см. отклонения)
SequenceGrid.jsx:        7.9 KB   (цель ≤16 · в норме)
DnaMutationPopup.jsx:    6.1 KB
AAMutationPopup.jsx:     5.3 KB
FullViewGrid.jsx:        2.4 KB
highlights.js:           3.6 KB
region-types.js:         2.9 KB
color-palette.js:        1.4 KB
```

Исходный `components/FragmentEditor.jsx` был 72 KB → итог 75.6 KB (сумма 8 файлов, +3.6 KB boilerplate). Рост по сумме даёт re-export-заголовки, `import { createPortal }` в каждом popup, пропс-контракты.

### Тесты и build

- Vitest: **738/738** pass на K1–K7 (без регрессий)
- pytest: не запускался в этом спринте (скоуп — только `gui/designer/`, без backend-изменений). Baseline из PROJECT_STATE — 112/112.
- `npx vite build`: **clean** после K6 и K7

### Отклонения от спеки

1. **`index.jsx` = 46 KB вместо ≤22 KB (спека §5.1 и §7).** 30 KB вынесено в 7 модулей, но остаток держит 22 useState/useRef + ~20 handlers + full K10 Unified-Editor (annotations / mutations / protein collapsible panels, ~280 строк JSX) + header + mode switcher + topology + full-view toggle + save button. Дальнейшее сокращение требует либо вынести K10 panels в отдельный `EditorPanels.jsx`, либо state-handlers в `useFragmentEditorState` hook — оба пути помечены как **OUT** в §3 спеки. Оставляю как есть до визуальной приёмки. `index.jsx` также превышает CLAUDE.md §7 hard-лимит 40 KB — отмечаю отдельно для следующей Chat-сессии: похоже, нужен Sprint 2a.1 (decompose panels) перед Sprint 2b.
2. **`bindNativeChange` оставлен в `index.jsx` (§11 Q1).** Использовался только внутри index.jsx — в `color-palette.js` не вынесен.
3. **`NucTooltip` в том же файле что `DnaMutationPopup.jsx` (§11 Q2).** Именованный экспорт, рендерится siblings в `index.jsx`. Файл вышел 6.1 KB — в норме.
4. **Domain persistence (`DOMAINS_LS_KEY`, `loadSavedDomains`, `persistDomains`) в `region-types.js` (§11 Q3).** Файл 2.9 KB — не раздут, отдельный `domain-storage.js` не создан.
5. **`FullViewGrid` принимает `mutationHighlight` пропс, но не использует его в рендере.** Так было и в исходном inline-блоке — `fullViewHighlight` используется, `mutationHighlight` нет. Оставил в API по §5.3 спеки на случай будущего сведения highlights источников; альтернатива — убрать проп.
6. **`SequenceGrid` props уже спеки §5.2.** Убраны `editingCodon`, `onCommitCodonEdit`, `onSetEditingCodon`, `hasCDSRegion`, `onApplyDnaSub/Del/Insert`, `dnaMutAnchor`, `assemblyCircular` — все они не используются внутри grid (editingCodon-UI в текущем коде не рендерится, `onApplyDna*` живёт в popups, `dnaMutAnchor` — в `openDnaMutMenu` который остался в index). Добавлен только `onSetNucTooltip` (использует-ся для hover-hint).
7. **Удалены unused imports из `index.jsx`:** `createPortal`, `autoDetectDomains`, `getFragColor`, `FEATURE_COLORS`, `isMarker`, `sequenceDiff`, `getCommonSubstitutions`. Все они перекочевали внутрь соответствующих вынесенных модулей.

### Сломанные тесты

Ни одного теста не пришлось переписывать под новую структуру. Все 738 Vitest-тестов прошли после каждого шага K1–K7. Регрессий не зафиксировано.

### Ликвидированный код

Ничего функционально не удалено. Вся логика перенесена 1:1. Один cosmetic-нюанс: в `SequenceGrid.jsx` non-breaking space, который в исходнике был записан как ECMAScript escape `{' '}`, в новом файле хранится как сырой UTF-8 NBSP (`302 240`) — рендерится и в DOM матчится идентично, структура DOM не меняется.
