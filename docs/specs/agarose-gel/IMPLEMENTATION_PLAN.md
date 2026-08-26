# Agarose Gel — план реализации и приёмки

**Статус:** FUTURE / NOT ACTIVE
**Правило запуска:** этот документ не исполняется, пока пользователь не завершил текущий спринт и не перенёс утверждённые этапы в `CURRENT_TASK.md`.

## 0. Handoff-резюме

Фича не требует нового тяжёлого biological engine. Нужны:

1. нейтральный pure restriction-digest core вместо CanvasSkeleton-owned path;
2. pure agarose model для lane/bands/migration/intensity;
3. небольшой Zustand slice с lane specs;
4. отдельный lazy workspace;
5. route + Sidebar + icon + i18n;
6. тесты, benchmark и browser acceptance.

Существующие Search/Sequence/Assembly вычисления и active DNA-search kernel не являются частью scope.

## 1. Reuse audit

### 1.1 Обязательно переиспользовать

| Возможность | Текущий owner | Как использовать |
|---|---|---|
| topology-aware complete digest | `components/CanvasSkeleton/lib/digest-fragments.js` | characterise → перенести pure core в `src/lib` → оставить re-export |
| RE catalog | `restriction-db.js` | built-in classical Type II |
| custom RE | `selectMergedREEnzymes` | передать merged registry в engine |
| library picker | `CanvasSkeleton/canvas/LibrarySearchBar.jsx` | тот же компонент, что уже использует Align |
| workspace route | `AppShell/index.jsx` | lazy import |
| workspace history | `workspaceSlice.js` | новый closed workspace id |
| navigation | `StartScreen/Sidebar.jsx` | тот же standalone-tool pattern |
| icons | `components/icons/Icon.jsx` | новый central domain glyph |
| state composition | `store/index.js` | зарегистрировать gel slice |
| theme/i18n | `index.css`, текущий string owner | semantic tokens + ru/en |

### 1.2 Не переиспользовать как engine

- `DigestFragmentPicker.jsx` — это assembly modal/list, не gel simulator.
- `PlasmidMapV2 bands` — показывает фрагменты на молекуле, не migration lanes.
- Search worker/coordinator — другой домен и другой protocol.
- `GG_ENZYMES` — биологически другой каталог.
- любые локальные BAND_COLORS из DigestFragmentPicker — не gel design tokens.

## 2. Предлагаемая файловая поверхность

Имена перепроверяются на свежем HEAD, но ownership должен остаться таким:

### 2.1 Новые production-файлы

| Файл | Ответственность | Target size |
|---|---|---:|
| `src/lib/restriction-digest.js` | нейтральный pure complete digest | <12 KiB |
| `src/lib/agarose-gel.js` | validation, lane derivation, mass/grouping | <20 KiB |
| `src/lib/agarose-gel-projection.js` | profiles, migration, intensity | <12 KiB |
| `src/lib/agarose-gel-presets.js` | generic ladder/profile data | data |
| `src/store/agaroseGelSlice.js` | session/lane specs/actions | <12 KiB |
| `src/components/AgaroseGel/AgaroseGelWorkspace.jsx` | domain container + layout | <30 KiB |
| `src/components/AgaroseGel/GelViewport.jsx` | accessible SVG/DOM projection | <24 KiB |
| `src/components/AgaroseGel/GelLaneEditor.jsx` | lane cards + canonical picker | <24 KiB |

Если после RED видно, что `GelLaneEditor` мал, он MAY остаться внутри Workspace. Делить заранее пустые файлы запрещено. Если Workspace приближается к 30 KiB, decomposition делается до дальнейшего роста.

### 2.2 Изменяемые production-файлы

| Файл | Допустимая правка |
|---|---|
| `components/CanvasSkeleton/lib/digest-fragments.js` | re-export нового neutral core |
| `components/AppShell/index.jsx` | lazy import + route |
| `components/StartScreen/Sidebar.jsx` | active state + handler + item |
| `store/workspaceSlice.js` | `'agarose-gel'` в closed set |
| `store/index.js` | compose slice |
| `components/icons/Icon.jsx` | `gel` registry + SVG path |
| `index.css` | gel semantic tokens для light/dark |
| `i18n.js` или актуальный string owner | ru/en strings |

`App.jsx`, `LibraryWorkspace.jsx`, SequenceView, Search, assembly store и persistence не расширяются.

### 2.3 Тестовые файлы

```text
src/lib/__tests__/restriction-digest-neutral.test.js
src/lib/__tests__/agarose-gel.test.js
src/lib/__tests__/agarose-gel-projection.test.js
src/store/__tests__/agaroseGelSlice.test.js
src/components/AgaroseGel/__tests__/agarose-gel-workspace.test.jsx
src/components/AgaroseGel/__tests__/gel-viewport.test.jsx
src/components/StartScreen/__tests__/sidebar-agarose-gel.test.jsx
src/components/AppShell/__tests__/agarose-gel-route.test.jsx
src/components/icons/__tests__/icon-registry.test.jsx  (расширить существующий, если есть)
```

Не создавать один монолитный test-файл >20 KiB; разделение следует контрактам, не случайному числу строк.

## 3. Этап A — свежий baseline и characterisation

До production edit:

1. проверить git status и активный scope;
2. снять размеры всех файлов §2.2;
3. найти все imports текущего `digest-fragments.js`;
4. прогнать:
   - `digest-fragments.test.js`;
   - `digest-fragment-picker.test.jsx`;
   - workspace/sidebar/router/store tests;
   - полный baseline и build;
5. написать characterisation neutral digest:
   - circular 0/1/3 cuts;
   - linear 0/1/3 cuts;
   - origin crossing;
   - same physical cut dedupe;
   - custom registry.

Characterisation сначала импортирует старый path и должна быть GREEN. Затем тот же contract переносится на новый neutral path. Это refactor proof, а не RED поведения.

После переноса:

- старый path re-export;
- оба существующих assembly tests зелёные;
- production consumers не переписываются все сразу без необходимости.

## 4. Этап B — pure agarose engine, RED→GREEN

### 4.1 RED-матрица derivation

| ID | Вход | Обязательный результат |
|---|---|---|
| B01 | intact linear 1000 bp | одна band 1000 bp, вся mass |
| B02 | intact circular 3000 bp | unsupported, bands `[]` |
| B03 | circular + enzyme без site | `uncut-circular`, bands `[]` |
| B04 | circular + один cut | одна linear band полной длины |
| B05 | circular + три cuts | три topology-correct fragments, сумма длины |
| B06 | linear + enzyme без site | одна full-length band |
| B07 | linear + три cuts | четыре fragments, сумма длины |
| B08 | два fragments одинакового bp | одна band, две components, масса суммирована |
| B09 | unequal fragments, 500 ng | mass proportional bp; сумма 500 ng |
| B10 | custom RE | те же правила, что built-in |
| B11 | unknown enzyme | typed invalid, не silent no-cut |
| B12 | unknown topology | fail-closed |
| B13 | missing source | explicit missing-source |
| B14 | NaN/Infinity/negative mass | typed invalid до scan |
| B15 | >4 enzymes | typed invalid |
| B16 | repeated run | stable byte-identical result |

### 4.2 RED-матрица projection

| ID | Проверка |
|---|---|
| P01 | 500 bp мигрирует дальше 1000 bp |
| P02 | `maxBp` → fraction 0 |
| P03 | `minBp` → fraction `runFraction` |
| P04 | выше диапазона → `above-range`, no fake fraction |
| P05 | ниже диапазона → `below-range`, no fake fraction |
| P06 | mass monotonic intensity |
| P07 | intensity bounded 0..1 |
| P08 | contrast не меняет migration/mass |
| P09 | runFraction не вызывает digest derivation |
| P10 | lane reorder не меняет projections |
| P11 | invalid profile fail-closed |
| P12 | generic ladders closed/valid, unique integer bp |

### 4.3 Property tests

- случайные positive fragment partitions сохраняют length/mass;
- migration strict monotonic внутри каждого profile;
- grouping одинакового bp commutative;
- circular rotation сохраняет multiset fragment lengths;
- source edit меняет derived result, не мутируя lane spec.

### 4.4 Mutation gates

Минимум три фактические последовательные мутации с откатом:

1. `intact circular` пропустить как linear → RED B02/B03.
2. `mass_i = laneMass / count` вместо bp-proportional → RED B09.
3. инвертировать migration numerator → RED P01–P03.

Дополнительно желательно:

4. неизвестный enzyme молча игнорировать → RED B11;
5. identical-size не группировать → RED B08.

После каждой:

- сначала подтвердить, что mutation реально присутствует;
- запустить узкий тест;
- восстановить;
- сверить отсутствие mutation marker.

## 5. Этап C — store/controller

RED до slice:

1. initial session содержит marker и пустые sample lanes;
2. add lane даёт stable id;
3. одна source entry допускается в нескольких lanes;
4. cap = 12 sample lanes;
5. update mode/enzyme/mass не меняет lane id;
6. reorder стабилен;
7. remove очищает selected band этой lane;
8. reset создаёт новый clean session;
9. route away/back не очищает state;
10. persisted sequence/cuts/bands отсутствуют;
11. missing/deleted source выводится derived-state, не удаляет lane silently.

Actions должны быть domain-specific. Не добавлять generic `setGelState(object)`.

Если compute async по performance-gate:

- generation per lane;
- cancel/stale-drop;
- one result settles once;
- error lane-scoped;
- max one heavy gel job;
- unmount не публикует поздний результат.

## 6. Этап D — workspace UI

### 6.1 RED сначала

Component contracts:

- empty state + marker;
- canonical LibrarySearchBar mounted, duplicate picker отсутствует;
- add same source twice creates two lanes;
- circular default не рисует fake band;
- enzyme selection produces expected counts;
- no-cut linear shows one band and explanatory status;
- exact-size components render one band;
- click sample/marker band shows correct details;
- details preserve origin-crossing segments;
- profile/run/contrast update projection only;
- source removal clears stale bands;
- unsupported/fault do not show «полос нет»;
- maximum lanes disables add with explanation;
- keyboard selection/reorder/remove;
- screen-reader band list;
- light/dark token usage (source/static contract + browser);
- narrow viewport.

### 6.2 Icon и strings

- `ICON_GROUPS.domain` содержит `gel`;
- unknown icon behavior не меняется;
- новый path использует `currentColor`;
- ru/en keys полны;
- UI source не содержит raw Russian/English literals за пределами allowed data labels;
- no emoji in chrome.

### 6.3 Route

- workspaceSlice принимает `agarose-gel`, unknown всё ещё отклоняет;
- AppShell lazy mounts workspace только при active route;
- initial shell не загружает gel chunk;
- Sidebar click выставляет workspace + fullscreen surface;
- только item «Гель» active;
- `goBack` возвращает реальный previous workspace;
- history cap не меняется.

## 7. Этап E — performance и integrated gate

### 7.1 Benchmark до решения о worker

Измерить отдельно:

```text
derive: 12 × 10 kbp × 2 enzymes
derive: 1 × 1 Mb × 2 enzymes
project: 100 bands × 100 control changes
render: 13 lanes × 100 bands
```

Не использовать wall-clock как единственный unit-test assertion. Bench публикует цифры; продуктовый gate проверяется на целевой машине/browser.

Решение:

- `<50 ms` main-thread для derive target → sync допустим;
- `>=50 ms` → отдельный worker atom до ship.

Worker не должен тянуть Search kernel или создавать второй general scheduler без архитектурного решения.

### 7.2 Related tests

Минимальный кластер:

- все новые gel tests;
- restriction-db/custom enzyme tests;
- digest fragments + picker;
- workspaceSlice + AppShell router;
- Sidebar;
- store composition;
- icon registry;
- library picker consumers (Align + Canvas) для reuse regression.

### 7.3 Full gate

Из `gui/designer`, только проектным runner:

```powershell
npm test
npm run lint
npm run build
```

На Windows сверять не только `passed`, но и число собранных test files. Если pool instability воспроизводится, выполнить согласованный ограниченный прогон workers и назвать режим; не выдавать недособранную suite за green.

Дополнительно:

- `git diff --check`;
- mutation markers/temp files = 0;
- production bundle: gel lazy chunk не в initial load;
- sizes всех затронутых файлов;
- browser сценарий из UX §11.

## 8. Browser acceptance data

Подготовить deterministic fixtures:

### Fixture 1 — circular three-band digest

Synthetic circular sequence с тремя EcoRI sites и неравными расстояниями, например 500/1500/3000 bp. Expected:

- 3 bands;
- mass ratio 1:3:6 при одинаковой molarity;
- сумма length/mass;
- один origin-crossing component.

### Fixture 2 — identical-size doublet

Circular digest 3000 bp → 1000 + 1000 + 1000. Expected:

- одна visible sample band;
- 3 components;
- вся 500 ng масса в band;
- details перечисляет три fragments.

### Fixture 3 — linear no-cut

1500 bp linear без выбранного site. Expected:

- одна 1500 bp band;
- status «фермент не режет; молекула осталась целой».

### Fixture 4 — uncut circular

3000 bp circular без cut. Expected:

- no band;
- explicit unsupported message/action;
- no empty/fault wording.

### Fixture 5 — custom enzyme

Test-only registry с одним deterministic site. Expected parity с built-in path.

## 9. Риски и заранее принятые ответы

| Риск | Ответ |
|---|---|
| standalone tool импортирует CanvasSkeleton internals | перенести pure digest в neutral lib, оставить shim |
| unknown enzyme сейчас может игнорироваться | gel boundary валидирует весь list до core |
| circular no-cut выдаётся как full-length | запрещено нормативным RED |
| gel % читается как физическая гарантия | UI говорит «профиль/оценка», без cm/min |
| near bands объявляются неразрешимыми без калибровки | объединяются только exact same bp; близкие лишь визуально overlap |
| lane хранит копию sequence и устаревает | store хранит sourceEntryId, derive читает live entry |
| 1 Mb scan блокирует UI | measured <50 ms или worker до ship |
| новый picker дублирует Library | reuse canonical LibrarySearchBar |
| GG смешивается с RE | lookup только merged RE registry |
| workspace раздувает Sidebar/AppShell | route wiring only, размерный отчёт |
| DigestFragmentPicker меняется «заодно» | OUT; отдельный follow-up |

## 10. Definition of Done

Готово означает:

- нормативные B/P/UI contracts доказаны;
- три обязательные mutations RED;
- restriction core един и assembly regression зелёная;
- fake circular band невозможен;
- mass/length conservation;
- no stale source bands;
- one canonical picker;
- route/history/lazy bundle работают;
- performance gate выполнен честно;
- accessible light/dark browser workflow проверен;
- полный test/lint/build зелёный с полным числом файлов;
- размеры в budgets;
- отчёт разделяет unit/build/browser/not-tested.
