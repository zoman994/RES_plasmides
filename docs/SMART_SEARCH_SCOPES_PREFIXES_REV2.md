# Умный поиск BodgeGene — REV #2: области поиска, префиксы и визуальный выбор режима

**Статус:** 🟡 PARTIALLY IMPLEMENTED — Search runtime U7 PASS; остальные области по backlog
**Дата фиксации решений:** 2026-07-13  
**Назначение документа:** самостоятельное техническое задание для реализации  
**Приоритет:** оставшиеся parse-only scopes и picker-конвергенция ведутся через `docs/BACKLOG.md`

> **Актуальность DNA-разделов.** Реализованный DNA runtime задают
> [`SPEC_GAPPED_DNA_SEARCH.md`](specs/SPEC_GAPPED_DNA_SEARCH.md) и
> [`TECHNICAL_GUIDE_SEARCH.md`](guides/TECHNICAL_GUIDE_SEARCH.md). Старые варианты
> short/IUPAC/seed-and-extend и kill/recreate worker superseded приёмкой U7.

---

## 1. Краткое решение

Обычный запрос должен искать только в пользовательских данных BodgeGene. Каталог
рестриктаз и будущие справочные каталоги не участвуют в поиске без явного выбора
пользователя.

Пользователь должен иметь два равноправных способа ограничить поиск:

1. выбрать режим и фильтры через выпадающий список и визуальные чипы;
2. написать соответствующий префикс вручную.

Оба способа обязаны создавать один и тот же `QueryPlan`, запускать одни и те же
providers и возвращать одинаковую выдачу. Ручные префиксы являются ускорением для
опытного пользователя, но не обязательным знанием.

Ключевое разделение:

```text
EcoRI       -> обычный поиск текста EcoRI в пользовательской библиотеке
enz:EcoRI   -> карточка EcoRI в каталоге рестриктаз
cut:EcoRI   -> молекулы и координаты сайтов EcoRI
seq:GAATTC  -> поиск нуклеотидной последовательности, без карточки EcoRI
```

---

## 1A. Сквозная ревизия всех поисковых строк приложения

### 1A.1. Главный принцип: одна оболочка, разные профили

В приложении не должно быть одного гигантского поискового компонента с одинаковой
биологической семантикой во всех окнах. Это привело бы к неожиданному auto-DNA в
лабораторной заметке и к требованию писать `enz:` внутри окна выбора рестриктазы.

Единообразие строится на трёх уровнях:

1. **Одна визуальная оболочка**: высота, search icon, clear, focus/error/disabled,
   loading/count, клавиатура, listbox и ARIA.
2. **Общие доменные primitives**: parser/registry, DNA scanner, primer catalog,
   enzyme resolver. Одинаковая сущность не ищется пятью несовместимыми способами.
3. **Явные профили поверхности**: каждый экран разрешает только уместные scopes,
   providers, prefixes и empty-state suggestions.

Целевая система:

```text
SearchField / SearchCombobox
├─ G1 FullSmartSearch
│  └─ глобальный поиск LibraryTopBar
├─ G2 ScopedEntityPicker
│  ├─ быстрый фильтр дерева
│  ├─ Canvas / Assembly / Align library picker
│  └─ праймерный пул
├─ G3 FixedDomainCombobox
│  ├─ поиск в текущей последовательности
│  ├─ переиспользование праймера
│  └─ все enzyme pickers
└─ G4 SimpleLocalFilter
   ├─ common features catalog
   ├─ assembly containers
   └─ notebook при его возвращении
```

Это и есть требуемое «безобразно, но единообразно»: пользователь узнаёт один и тот
же control, но control не притворяется, что поиск молекулы, фильтр заметок, посадка
праймера и выбор фермента являются одной задачей.

### 1A.2. Контракт общей оболочки

`SearchField` является UI-only компонентом и не импортирует store, worker,
`restriction-db`, primer pool или библиотечные adapters. Минимальный контракт:

```ts
type SearchFieldProps = {
  value: string;
  onValueChange(value: string): void;
  placeholder: string;
  ariaLabel: string;
  onClear?(): void;
  busy?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  resultCount?: number | null;
  leadingSlot?: ReactNode;
  modeSlot?: ReactNode;
  filterChips?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
  controlsId?: string;
  activeDescendantId?: string;
  onKeyDown?(event): void;
};
```

`SearchCombobox` композиционно добавляет:

- `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`,
  `aria-controls`, `aria-activedescendant`;
- единое управление ArrowUp/ArrowDown/Home/End/Enter/Escape;
- `SearchResultsListbox` с `role="listbox"`/`role="option"`;
- mouse-down/focus semantics без случайного закрытия dropdown;
- единые loading, empty, diagnostic и result-count состояния;
- IME-safe обработку: Enter/`:` не интерпретируются до `compositionend`.

Selector режима показывается только если профиль разрешает более одной области.
Fixed-domain поле показывает неснимаемый label/chip (`ДНК`, `Праймер`, `Фермент`),
но не заставляет пользователя вручную вводить `seq:`, `primer:` или `enz:`.
G4 показывает обычную лупу и не подключает биологический parser.

### 1A.3. Декларативные профили

Профили должны жить в `SEARCH_PROFILES`, а не быть наборами условных веток внутри
React-компонентов:

```ts
type SearchProfile = {
  id: string;
  uiKind: 'full' | 'scoped' | 'fixed' | 'local';
  allowedPrefixKeys: string[];
  entityScope: string[];
  providers: string[];
  fixedIntent?: string;
  showModeSelector: boolean;
  showFilterChips: boolean;
  emptyBehavior: 'empty' | 'recent' | 'contextual';
  selectionMode: 'single' | 'multi';
};
```

Обязательные профили:

| id | Разрешённая семантика | Запрещено |
|---|---|---|
| `globalLibrary` | entry/project/primer metadata; explicit DNA/protein; `enz:` catalog; `cut:` sites | ферменты без opt-in |
| `libraryQuick` | синхронный metadata filter по entry/project/primer, name/tag/feature/type/status | запуск worker и silent обработка `seq:/aa:/enz:/cut:` |
| `libraryPicker` | сущности, разрешённые конкретным picker; metadata + явно настроенный DNA exact/worker path | enzyme catalog и неуместные kinds |
| `primerPool` | canonical primer docs; name/sequence/tag/status/notes/project/target where present | подмена каталожного поиска проверкой посадки |
| `sequenceWithinEntry` | фиксированный DNA intent и общий occurrence scanner | entity/prefix parsing |
| `enzymeCatalog` | canonical enzyme resolver: name/alias/site/overhang/source | необходимость писать `enz:` |
| `featureCatalog` | name/type текущего справочника | запуск reference detector/Annotator |
| `simpleNameFilter` | заданные текстовые поля локального списка | биологический auto-detect |
| `notebook` | title/text/tag/ref text | DNA/protein/enzyme intent |
| `homology` | coverage-oriented similarity, один лучший hit на molecule | трактовка как motif `seq:` |

`PREFIX_REGISTRY` остаётся источником языка запросов, но selector получает только
entries, разрешённые `allowedPrefixKeys` текущего профиля. Unsupported prefix не
игнорируется: профиль возвращает диагностическое действие «Открыть полный поиск»
либо ошибку, но никогда не считает такой запрос совпавшим со всеми документами.

### 1A.4. Реестр живых поисковых поверхностей

В production-маршрутах обнаружено 11 самостоятельных реализаций текстового поиска.
`LibrarySearchBar` смонтирован в четырёх workflow, поэтому фактических живых мест
ввода больше. Каждое место обязано быть привязано к профилю:

| Поверхность | Текущее место | Текущий разрыв | Целевой профиль |
|---|---|---|---|
| Глобальный поиск | `components/Library/LibraryTopBar.jsx:296-302`; state в `LibraryWorkspace.jsx:95` | facade и enzyme docs включены в один общий query с деревом | `globalLibrary` / G1 |
| Быстрый фильтр дерева | `components/Library/tree/LibraryTreeRoot.jsx:262-283` | тот же raw query, отдельный matcher и отдельная семантика | `libraryQuick` / G2 |
| Общие фичи | `components/Library/CommonFeaturesPanel/index.jsx:198-204` | локальный substring name/type | `featureCatalog` / G4 |
| Универсальный library picker | `components/CanvasSkeleton/canvas/LibrarySearchBar.jsx:315-350,543-566` | свой ACGT-only DNA, min 3; extra sections ищутся иначе | `libraryPicker` / G2 |
| Canvas top picker | mount `CanvasLayoutView.jsx:281` | использует тот же компонент, но имеет extra sections | `libraryPicker` с canvas capabilities |
| Align reference picker | mount `components/Align/AlignInputPanel.jsx:285` | выбор должен быть ограничен совместимыми molecule kinds | `libraryPicker` с align capabilities |
| Assembly empty state | mount `AssemblyShellBody.jsx:680` | molecule/import/paste workflow | `libraryPicker` с assembly capabilities |
| Assembly «+ сегмент» | mount `AssemblyShellBody.jsx:1050` | повтор того же picker | тот же assembly profile |
| Поиск в открытом sequence | `components/SequenceSearchPopover.jsx` | тот же ACGT-only worker/core и topology contract, что global DNA | `sequenceWithinEntry` / G3 |
| Повторное использование праймера | `PrimerReusePicker.jsx:13-26` | substring по skeleton `state.primers`, не canonical pool | `primerPool` fixed / G3 |
| Праймерный пул | `components/PrimerPoolList.jsx:97-116` | есть только status/tag selects, текстового поиска нет | добавить `primerPool` / G2-G3 |
| Контейнеры сборки | `AssemblySidebar.jsx:15-26,94-98` | name-only local filter | `simpleNameFilter` / G4 |
| Каталог рестриктаз | `RestrictionSitesWorkspace.jsx:55-60,225-226` | built-in only, name/site | `enzymeCatalog` / G3 |
| Добавление в enzyme set | `RestrictionSitesWorkspace.jsx:115-118,288-289` | merged catalog, но name-only | `enzymeCatalog` / G3 multi-select |
| Рестриктазы RangePicker | `RangePickerModal.jsx:304-337,786-823` | merged, typed query name-only; уникальные при empty focus | `enzymeCatalog` / G3 contextual |
| Рестриктазы Cut operation | `CutOpPopup.jsx:25-50,157-162` | built-in only, свой pinned/name/site/overhang rank | `enzymeCatalog` / G3 multi-select |

`LibrarySearchBar` не следует копировать ещё раз. Все четыре mount должны получать
профиль/capabilities через props, а не добавлять собственные matcher branches.

### 1A.5. Legacy и призрачные поиски

Эти места не следует механически мигрировать до подтверждения production reachability:

| Место | Статус | Решение |
|---|---|---|
| `canvas/NotebookSearch.jsx` | `NotebookTab` не импортируется production-кодом | удалить legacy либо применить `notebook`/G4 при возврате |
| `canvas/NotebookRefPickerModal.jsx` | доступен только через тот же legacy Notebook | то же |
| `components/OligoManager.jsx` | старый локальный реестр, production mount не найден | не переносить matcher; canonical primer pool является источником истины |
| `components/JunctionBlock.jsx` | старый enzyme picker, production mount не найден | не развивать; удалить после reachability-test |
| `components/CanvasSkeleton/canvas/PlaceholderTreePicker.jsx` | production mount не найден; заменён новым picker | удалить либо сделать thin wrapper над `LibrarySearchBar` |
| `components/CanvasSkeleton/LibraryTreeHost.jsx` | production mount не найден | не считать отдельной поверхностью; удалить после проверки |

Дополнительно обнаружены состояния поиска без поля ввода:

- `StartScreen/MainPanel.jsx:54,113-118` хранит `query` и фильтрует проекты, хотя
  search input удалён; удалить dead state и зависимости memo;
- `components/Library/hooks/useLibraryState.js:50,501,531` хранит
  `catalogQuery` для отсутствующего `CatalogColumn`; сначала characterization,
  затем удалить либо восстановить через профиль;
- неиспользуемый import `SequenceSearchPopover` в `App.jsx` удалить при scoped lint.

Удаление legacy требует отдельного import/reachability test. Наличие unit-test import
само по себе не доказывает production reachability. До удаления компонент можно
пометить `@legacy`, но новую поисковую функциональность в него не добавлять.

### 1A.6. Подтверждённый P1-баг: bio-prefix превращает tree matcher в match-all

Текущая цепочка:

```text
makeEntryMatcher(query)
  -> classifyQuery(query)
  -> matchesEntry(document, plan)
  -> passesExplicitFilters(...)
```

`passesExplicitFilters` обрабатывает только `type`, `status`, `tag`, но
`matchesEntry` считает запрос успешно профильтрованным по самому факту наличия
`explicitFilters`. Поэтому metadata-only matcher сейчас может вернуть `true` для
каждой записи:

```text
seq:GAATTC
aa:HXHH
re:EcoRI
```

Верхний поиск в то же время запускает настоящие providers. Одна и та же видимая
строка имеет две противоположные семантики.

Обязательное исправление:

1. Ни одна clause не может быть молча проигнорирована.
2. Metadata matcher хранит `consumedClauseIds`; успех возможен только если все
   обязательные clauses потреблены.
3. Provider intent, недоступный `libraryQuick`, возвращает diagnostic
   `REQUIRES_FULL_SEARCH` и `matched=false`, а UI предлагает эскалацию.
4. Нельзя использовать `explicitFilters.length > 0` как признак совпадения.
5. `describeEntryMatch` не запускает второй поиск без providers, а читает готовый
   `matchInfoByEntityKey` из session.
6. До рефакторинга добавить инверсионные tests: `seq:/aa:/re:` не раскрывают все
   проекты и записи.

### 1A.7. Один controller на поверхность, один расчёт на session

После разделения `globalSearchState` и `treeQuery` это **два контроллера**, а не два
поля поверх общего raw query:

```text
GlobalSearchController(profile=globalLibrary)
  -> QueryPlan + async SearchSession

TreeSearchController(profile=libraryQuick)
  -> QueryPlan + synchronous metadata SearchSession
```

Внутри одной поверхности plan/session вычисляются один раз. Сейчас tree query
повторно обрабатывается в `LibraryTreeRoot`, каждом `ProjectZone`, `LooseZone` и
`TreeItemRow`. Целевой session передаёт вниз:

```ts
{
  matchingEntityKeys: Set<string>;
  matchingProjectIds: Set<string>;
  matchInfoByEntityKey: Map<string, MatchInfo>;
  resultOrder: string[];
  diagnostics: SearchDiagnostic[];
}
```

Зоны и строки только отображают session; они не вызывают `makeEntryMatcher`,
`classifyQuery` или `runSearch` повторно. Эскалация `tree -> global` копирует raw
text один раз и переключает focus. Обратной live-синхронизации нет.

### 1A.8. Единый DNA-поиск без смешивания с homology

Global DNA provider и `SequenceSearchPopover` используют один worker/core и один occurrence-контракт.
Shipping route — corpus-wide `EXACT_FIRST`: exact не имеет верхнего предела и исключает
approximate-строки, если найден хотя бы один exact. Входные минимумы поверхностей пока различаются:
bare DNA использует `minQueryLen`, явный `seq:` обходит этот порог, а `SequenceSearchPopover`
требует 8 нт. Approximate-фаза работает до 100 нт через production kernel `LINEAR`; запрос
`>100` без exact получает `REQUIRES_ALIGNMENT` при threshold <100%, тогда как 100% — exact-only.

Интерактивный DNA query принимает только A/C/G/T. Неоднозначный target-символ считается mismatch.
Обе цепи, кольцевой origin-wrap, identity `M/(M+X+I+D)`, строгий envelope и cooperative cancel/ACK
задаются [`SPEC_GAPPED_DNA_SEARCH.md`](specs/SPEC_GAPPED_DNA_SEARCH.md). Homology/alignment остаются
отдельной задачей и не подменяются motif-поиском `seq:`.

### 1A.9. Праймеры: каталог и биологическая посадка — разные операции

Единообразный UI не означает один matcher:

```text
searchPrimerCatalog(plan, primerDocuments)
scanPrimerAnnealingSites(primer, molecule, opts)
summarizePrimerSpecificity(hits)
```

- `primer:` и поле праймерного пула используют первый primitive;
- `PrimerReusePicker` использует каталог, затем отдельно проверяет пригодность;
- `PrimerTrack` и действие «куда садится» должны использовать второй primitive;
- хвост не участвует в binding, 3'-clamp/circular/mismatch правила берутся из
  `primer-binding-search`, а не из простого `indexOf`.

В REV #2 обязательно добавить текстовый поиск в `PrimerPoolList` и единый canonical
primer adapter. Перевод `PrimerTrack` на общий annealing scanner допустимо вынести в
следующую primer-specific REV, так как это меняет биологическую интерпретацию, а не
только поисковый UI.

### 1A.10. Рестриктазы: один resolver, контекстное ранжирование

Сейчас различаются как минимум пять реализаций: `restriction-db.searchRE`, global
enzyme documents, два поиска в `RestrictionSitesWorkspace`, `CutOpPopup` и
`RangePickerModal`. Они расходятся по custom catalog, alias, site, overhang,
iso/neoschizomers и Type IIS.

Общий доменный API:

```ts
resolveCanonicalEnzyme(nameOrAlias, catalog)
searchEnzymeCatalog(query, {
  catalog,
  includeTypeII: true,
  includeTypeIIS: true,
  includeCustom: true,
  allowedNames?: Set<string>
})
getEnzymeSearchDocument(enzyme)
```

Resolver задаёт одинаковые кандидаты и базовый rank. Поверхность может добавлять
только контекстный boost:

- `RangePickerModal`: при пустом фокусе unique cutters текущей sequence сначала;
- `CutOpPopup`: pinned enzymes сначала;
- set editor: уже выбранные остаются видимыми с checked state;
- global `enz:`: exact canonical/alias/site rank без workflow boost.

Контекстный boost не меняет canonicalization и не исключает custom/Type IIS сам по
себе. Глобальное правило «ферменты только opt-in» относится к G1. В fixed enzyme
picker ферменты закономерно являются default scope, и `enz:` писать не требуется.

`re-site-filter.js` остаётся фильтром уже найденных сайтов, а не QueryPlan provider;
он только использует тот же canonical enzyme name.

### 1A.11. Что намеренно не проводится через глобальный QueryPlan

- `primer-binding-search` и отображение посадки праймера;
- `rankHomologs` и alignment similarity;
- automatic `feature-match-core` / Annotator reference detection;
- `re-site-filter` и визуальная видимость уже найденных RE-сайтов;
- status/tag/type controls без свободного текста;
- формы создания/переименования сущностей и custom enzyme.

Для них можно делить низкоуровневые normalization/coordinate primitives и UI
`SearchField`, но нельзя смешивать orchestration, ranking и result meaning.

### 1A.12. Очерёдность сквозной миграции

1. Characterization-test и немедленный fix P1 `seq:/aa:/re: -> match-all`.
2. Развести `globalSearchState` и `treeQuery`; перевести дерево на один session.
3. Ввести common `SearchField`/`SearchCombobox` и profile registry.
4. Перевести G1 `LibraryTopBar`, не меняя уже согласованную prefix semantics.
5. Перевести живой `LibrarySearchBar` и все четыре mount через capabilities.
6. Добавить canonical primer adapter и поиск в `PrimerPoolList`; подключить
   `PrimerReusePicker` к тому же каталогу.
7. Ввести canonical enzyme resolver/provider; мигрировать оба поля
   `RestrictionSitesWorkspace`, `RangePickerModal`, `CutOpPopup`.
8. Перевести `SequenceSearchPopover` на общий DNA occurrence scanner.
9. Перевести G4 (`CommonFeaturesPanel`, `AssemblySidebar`) только на общую оболочку.
10. Провести reachability characterization и удалить/пометить legacy surfaces.
11. Прогнать cross-surface contract tests, полную suite, build и browser smoke.

Каждый этап должен быть отдельным небольшим change-set. Нельзя одновременно
переписывать parser, primer biology, все picker workflows и удалять legacy: такой
diff будет невозможно биологически и UX-корректно проверить.

Рестриктазы нельзя просто опустить ниже в рейтинге: их документы должны быть
полностью исключены из default scope и не расходовать глобальный лимит выдачи.

---

## 2. Почему требуется изменение

Сейчас `LibraryTopBar` безусловно объединяет документы библиотеки и документы
ферментов:

```js
[
  ...collectEntryDocuments(...),
  ...collectEnzymeDocuments(),
]
```

После этого карточки ферментов участвуют в обычном текстовом сопоставлении по
названию. Измерение `name` имеет высший приоритет, поэтому короткие буквенные
запросы вроде `Bsa`, `Eco`, `Acc` закономерно поднимают рестриктазы выше молекул.

Текущий парсер также построен вокруг жёсткого регулярного выражения:

```js
/^(seq|aa|tag|type|status|re):(.*)$/i
```

У этого подхода нет:

- областей сущностей (`entry`, `primer`, `project`, `enzyme`);
- различия между фильтром поля и биологическим provider;
- единого словаря алиасов;
- поддержки значений в кавычках;
- источника данных для выпадающего меню и справки;
- диагностики несовместимых режимов;
- механизма подключения будущих справочных каталогов.

REV #2 должна разделить три независимых понятия:

1. **область сущностей** — где искать;
2. **измерение/поле** — в каких данных искать;
3. **биологический provider** — какой вычислительный поиск запустить.

---

## 3. Термины и модель поведения

### 3.1. UI preset и источник истины

В интерфейсе в каждый момент показан один основной preset:

```text
library             пользовательская библиотека, режим по умолчанию
molecule            только молекулы/конструкты
primer              только праймеры
project             только проекты
sequence            нуклеотидная последовательность в молекулах
protein             белковая последовательность в аннотированных CDS
enzymeCatalog       только справочник рестриктаз
restrictionSites    молекулы с сайтами выбранного фермента
```

`uiPreset` — только удобная стартовая конфигурация и подпись selector. Он не является
вторым источником истины для движка. Исполняемая семантика всегда определяется
тремя независимыми частями:

```text
entityScope     где искать
providerIntent  какой вычислительный поиск выполнить
fieldClauses    какие дополнительные ограничения применить
```

Например, preset «ДНК» задаёт `providerIntent=sequence` и исходный scope
`entry+primer`, после чего пользователь может сузить его до молекул. Preset
«Рестриктазы» задаёт `providerIntent=enzymeCatalog` и scope `enzyme`.

В REV #2 адаптеры `project` и `primer`, их навигация и выбор результата являются
обязательными. Пункты не должны появиться раньше соответствующего этапа реализации,
но завершённой REV #2 без них не считается.

### 3.2. Дополнительные фильтры

Фильтры не меняют основной provider и комбинируются с ним через AND:

```text
name
tag
feature
type
status
withinProject
```

Пример:

```text
режим: Библиотека
фильтры: Статус = release, Проект = Gla
текст: glaA
```

Каноническая сериализация:

```text
status:release in:"Gla" glaA
```

### 3.3. Default scope

Без префикса и без выбора режима искать только в пользовательских данных:

```text
entry + project + primer
```

Аннотации ищутся внутри документов молекул и приводят к родительской молекуле с
точной feature-location.

По умолчанию исключить:

```text
enzyme + reSite + любые будущие reference/ontology/catalog kinds
```

Точное имя известного фермента не переключает scope автоматически.

### 3.4. Канонические источники project и primer

- Проекты берутся из `state.projects`.
- Праймеры берутся из `state.primersById`; это канонический праймерный пул.
- Legacy `libraryEntries.kind='primer'` не должны дублировать записи пула.
- Миграционный adapter сначала добавляет `primersById`, затем добавляет legacy
  primer только при отсутствии совпадения по `resourceHash`, а при его отсутствии —
  по стабильному id.
- Generic entry adapter исключает legacy primer-entries, если они передаются в
  primer bridge.
- В результате каждый физический праймер имеет один `entityRef.kind='primer'`.

---

## 4. Единый словарь префиксов

### 4.1. Обязательные префиксы v1

| Канонический | Алиасы EN | Алиасы RU | Категория | Семантика |
|---|---|---|---|---|
| `lib:` | `library:` | `библиотека:` | scope | Явно вернуть обычный поиск по библиотеке |
| `mol:` | `molecule:`, `entry:`, `construct:` | `молекула:`, `конструкт:` | scope | Только молекулы/конструкты |
| `primer:` | `oligo:` | `праймер:`, `олиго:` | scope | Только праймерный пул; включать после готовности provider |
| `project:` | `proj:` | `проект:` | scope | Только карточки проектов; включать после готовности provider |
| `seq:` | `dna:`, `nt:` | `днк:`, `посл:` | provider | Мотив ДНК в молекулах |
| `aa:` | `protein:`, `prot:`, `peptide:` | `белок:`, `пептид:` | provider | Аминокислотная последовательность |
| `enz:` | `enzyme:`, `restriction:` | `фермент:`, `рестриктаза:` | preset | Только каталог рестриктаз |
| `cut:` | `site:`, `digest:` | `сайт:`, `режет:` | preset/provider | Молекулы с сайтами указанного фермента |
| `re:` | — | — | legacy alias | Полный эквивалент `cut:` для совместимости |
| `name:` | — | `имя:`, `название:` | field | Только название объекта |
| `tag:` | — | `тег:` | field | Только теги |
| `feature:` | `feat:`, `annotation:` | `фича:`, `аннотация:` | field | Имя, тип и qualifiers аннотаций |
| `type:` | — | `тип:` | filter | Тип объекта |
| `status:` | — | `статус:` | filter | Статус версии |
| `in:` | `within:` | `в:` | filter | Ограничить поиск содержимым проекта |

### 4.2. Зарезервированные формы

- Не вводить `pr:`: сокращение конфликтует между `primer` и `project`.
- Не делать `gene:` простым алиасом `feature:`. В дальнейшем ему потребуется
  отдельная transcript/gene-aware семантика.
- Не вводить однобуквенные алиасы: они слишком легко совпадают с реальными именами.
- Не вводить negation (`-tag:`, `NOT`) и логический OR в REV #2.

### 4.3. Нормализация

- Имена префиксов регистронезависимы.
- Значение сохраняется в форме, необходимой provider, а для сравнений может иметь
  отдельное нормализованное представление.
- Любой алиас сериализуется в каноническую форму при сохранении истории.
- Локализованный русский префикс не должен попадать во внутренний `QueryPlan` как
  отдельный тип режима.

### 4.4. Семантика значения после префикса

| Категория | Примеры | Куда попадает значение |
|---|---|---|
| Scope preset | `lib:gla`, `mol:pUC`, `primer:T7`, `project:Alpha` | Выбирает scope, а значение становится обычным text clause внутри этого scope |
| Bio provider | `seq:GAATTC`, `aa:HXHH` | Только в `seqQuery`/`aaQuery`; не дублируется в `textTerms` |
| Enzyme catalog | `enz:Bsa` | В `enzymeCatalogQuery`; допускает prefix/substring matching |
| Cut sites | `cut:BsaI`, `re:Eco31I` | В канонический `cutQuery`; до scan требуется однозначное exact canonical/alias разрешение |
| Field | `name:pUC`, `tag:yeast`, `feature:glaA` | Только в соответствующий `fieldClause`; не добавляется в свободные text terms |
| Filter | `type:circular`, `status:release`, `in:"Alpha"` | В нормализованный filter clause |

Legacy `reQuery` допускается только как derived transitional mirror `cutQuery` для
старых provider signatures. Engine не должен использовать `reQuery` как источник
истины, а `re:` канонизируется в `cut:` до запуска поиска.

### 4.5. Матрица применимости

| Scope | Metadata | `name` | `tag` | `feature` | `type` | `status` | `in` | DNA | Protein | Cut |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| entry | да | да | да | да | да | release/wip/deprecated | да | да | да | да |
| primer | да | да | да | нет | да | imported/designed/ordered/received/archived | да | да | нет | нет |
| project | да | да | если поле существует | нет | нет | нет | нет | нет | нет | нет |
| enzyme | catalog only | да | alias/site | нет | typeIIS/source | нет | нет | нет | нет | нет |

Правила `type:`:

- `type:circular`/`type:linear` сохраняют текущую entry topology-семантику;
- `type:primer` нормализуется в primer scope;
- неподдерживаемое значение для активного scope создаёт диагностику;
- не угадывать один enum для entry и primer, если их модели различаются.

Правила `status:`:

- parser выбирает enum по активному scope;
- в default multi-kind scope значение `release/wip/deprecated` применимо только к
  entries, а primer status — только к primers;
- неизвестный status не превращается в свободный текст.

Правила `in:`:

- значение сначала сравнивается с project id, затем с полным именем без учёта
  регистра;
- одно уникальное совпадение сохраняется в плане как `projectId` + display label;
- несколько проектов с одинаковым именем дают ошибку с выбором конкретного проекта;
- substring используется только для подсказок, не для молчаливого применения;
- `in:` применим к entries и primers, но не к project cards.

---

## 5. `PREFIX_REGISTRY` как единый источник истины

Создать чистый модуль, например:

```text
gui/designer/src/lib/search-prefix-registry.js
```

Минимальный контракт записи:

```js
{
  canonical: 'enz',
  aliases: ['enzyme', 'restriction', 'фермент', 'рестриктаза'],
  category: 'preset',
  uiPreset: 'enzymeCatalog',
  includeKinds: ['enzyme'],
  providerIntent: 'enzymeCatalog',
  valueParser: 'text',
  labelKey: 'search.mode.enzymeCatalog',
  icon: 'scissors',
  placeholderKey: 'search.placeholder.enzymeCatalog',
  examples: ['enz:EcoRI', 'enz:Bsa'],
  enabled: true,
  legacy: false,
}
```

Из этого реестра должны строиться:

- lookup канонических имён и алиасов;
- parser;
- каноническая сериализация;
- выпадающее меню;
- локализованные чипы;
- placeholder и примеры;
- проверка доступности provider;
- проверка совместимости режимов;
- справка по синтаксису;
- параметризованные тесты алиасов.

Запрещено поддерживать отдельный массив префиксов в UI и отдельный regex в parser:
они неизбежно разойдутся.

---

## 6. Грамматика запроса

### 6.1. Лексер

Заменить простое `split(' ')` небольшим чистым лексером. Поддержать:

```text
project:"Gla optimization"
in:"Project Alpha" AmpR
feature:"signal peptide"
```

Минимальные правила:

- пробел разделяет токены вне кавычек;
- двойные кавычки группируют значение;
- поддержать экранированные `\"` и `\\` внутри значения;
- каждый token хранит исходный source span, чтобы UI мог атомарно вынести
  распознанный префикс/фильтр в чип без повреждения соседнего текста;
- незакрытая кавычка создаёт диагностическое сообщение, но не crash;
- пустое значение `seq:`/`enz:` не запускает поиск;
- неизвестный префикс сохраняется как буквальный текст;
- для близкого неизвестного префикса UI может предложить исправление;
- явный биологический префикс не деградирует в текстовый поиск при ошибке.

Пример строгой ошибки:

```text
seq:amp
```

Ожидание: «Недопустимые символы для последовательности ДНК», а не поиск молекулы с
именем `amp`.

### 6.2. Комбинирование

- Свободные текстовые термы должны совпасть каждый хотя бы в одном разрешённом поле.
- Разные дополнительные фильтры комбинируются через AND.
- Повторяющиеся `tag:` также означают AND: документ должен удовлетворить каждому.
- Допускается только один вычислительный `providerIntent` из
  `metadata/sequence/protein/enzymeCatalog/restrictionSites`.
- Scope preset может сужать entity kinds совместимого provider. Несовместимая
  комбинация scope/provider определяется матрицей применимости и даёт диагностику,
  а не молчаливые 0 результатов.

Несовместимые примеры:

```text
enz:EcoRI seq:GAATTC
primer:T7 aa:HHHH
project:Alpha cut:BsaI
```

Совместимые примеры:

```text
cut:BsaI type:circular
seq:GAATTC status:release
feature:glaA in:"Gla project"
```

### 6.3. Каноническая сериализация

UI хранит структурированное состояние. Чистая функция serializer обеспечивает
стабильную строку для тестов, отладки и будущих clipboard/history/deep-link:

```text
{
  uiPreset: 'protein',
  providerIntent: 'protein',
  value: 'HXHH',
  filters: [{ field: 'status', value: 'release' }]
}

-> aa:HXHH status:release
```

Ручной ввод алиаса:

```text
белок:HXHH
```

после разбора даёт тот же план и ту же каноническую строку `aa:HXHH`.

Persistent history, clipboard-action и deep-link UI не обязательны в REV #2;
обязательны только чистые `parse -> structured state -> serialize` API и round-trip
tests.

---

## 7. Новый контракт `QueryPlan`

Расширить контракт без немедленного удаления совместимых legacy-полей:

```js
{
  raw: string,
  normalizedText: string,

  // UI-only preset/label; engine не принимает решений по этому полю:
  uiPreset: 'library' | 'molecule' | 'primer' | 'project' |
            'sequence' | 'protein' | 'enzymeCatalog' | 'restrictionSites',

  entityScope: {
    includeKinds: string[],
    excludeKinds: string[],
  },

  providerIntent: 'metadata' | 'sequence' | 'protein' |
                  'enzymeCatalog' | 'restrictionSites',

  textTerms: string[],
  fieldClauses: Array<{
    field: 'name' | 'tag' | 'feature' | 'type' | 'status' | 'withinProject',
    value: string,
    operator: 'contains' | 'equals',
  }>,

  seqQuery: string | null,
  aaQuery: string | null,
  enzymeCatalogQuery: string | null,
  cutQuery: string | null,
  // Transitional derived mirror only:
  reQuery: string | null,

  diagnostics: Array<{
    code: string,
    severity: 'info' | 'warning' | 'error',
    token?: string,
    messageKey: string,
    suggestion?: string,
  }>,

  // Transitional compatibility views; engine их НЕ читает:
  explicitFilters: QueryFilter[],
  inferredFilters: QueryFilter[],
  interpretations: Interpretation[],
}
```

### Обязательные инварианты

1. Default `entityScope` никогда не включает `entityRef.kind='enzyme'`.
2. `providerIntent=enzymeCatalog` не запускает sequence/protein/restriction-site providers.
3. `providerIntent=restrictionSites` не требует документов каталога ферментов.
4. Ошибка явного префикса не превращается в другой intent.
5. Один и тот же план используется для partial и final фаз.
6. Engine читает только новые `entityScope/providerIntent/fieldClauses/*Query`;
   transitional legacy views вычисляются из них и не применяются второй раз.

---

## 8. Семантика рестриктаз

### 8.1. Каталог ферментов

```text
enz:EcoRI
```

Возвращает карточки ферментов, а не молекулы. Карточка должна содержать:

- каноническое имя;
- совпавший алиас, если применимо;
- recognition site;
- тип концов/overhang;
- `Type IIS`, если применимо;
- источник: built-in / Golden Gate / custom;
- отдельное действие «Найти сайты в библиотеке».

Клик по телу карточки не должен молча менять запрос с каталога на поиск сайтов.
Выбор строки открывает/выбирает карточку фермента, а действие «Найти сайты» в
карточке/панели деталей формирует `cut:<canonicalName>`.

`SmartResultRow` сейчас является целиком интерактивной строкой. Запрещено вкладывать
в неё вторую кнопку. Оставить результат одним `role=option`, а действие разместить
в выбранной карточке/панели вне option. Если будет выбран другой паттерн, сначала
перестроить results из listbox в семантически корректный list/region с отдельными
siblings-кнопками.

### 8.2. Поиск сайтов

```text
cut:EcoRI
re:EcoRI
```

Возвращает только пользовательские молекулы и точные occurrence с координатами
сайтов. `re:` сохраняется как legacy-алиас, но интерфейс отображает канонический
чип «Сайты рестрикции».

Cut provider запускается только после однозначного exact-разрешения имени:

```text
cut:BsaI   -> scan BsaI
cut:BbsI   -> alias однозначно разрешён в canonical BpiI -> scan BpiI
cut:Bsa    -> scan не запускается; показать варианты BsaI/BsaJI/...
cut:GhostI -> scan не запускается; ошибка «фермент не найден»
```

Prefix/substring допустимы в `enz:` catalog browsing, но не означают «просканировать
всеми похожими ферментами» в `cut:`.

### 8.3. Алиасы Type IIS

После изоляции каталога от default scope подключить алиасы:

```text
BbsI   -> BpiI
Eco31I -> BsaI
Esp3I  -> BsmBI
```

Приоритет разрешения:

1. точное пользовательское/каноническое имя согласно действующей политике registry;
2. case-insensitive каноническое имя;
3. case-insensitive alias;
4. неизвестный фермент -> диагностика.

Если custom enzyme перекрывает встроенное имя, это нельзя делать невидимо в
поисковой карточке: показать источник `custom` и предупреждение о коллизии. REV #2
не обязана менять существующую политику override сканирующего движка, но обязана
сделать источник результата честным.

### 8.4. Ранжирование внутри каталога

```text
exact canonical
exact alias
canonical prefix
alias prefix
canonical substring
alias substring
recognition-site match
```

Это ранжирование действует только в `enzymeCatalog`; оно никогда не возвращает
ферменты в обычную библиотечную выдачу.

### 8.5. Единый resolver и реактивность custom catalog

Создать один pure resolver, например `restriction-enzyme-resolver.js`, который
используют и catalog provider, и `re-match`. Нельзя независимо реализовать aliases
для `enz:` и `cut:` — результаты разойдутся.

Resolver должен предоставлять как минимум:

```js
resolveEnzymeExact(query, registry)
suggestEnzymes(query, registry, limit)
canonicalizeEnzymeName(query, registry)
```

Topbar/catalog provider должен реагировать на изменение `state.customEnzymes`, а не
кэшировать `effectiveEnzymes()` только по `libraryEntries`. Документы каталога
перестраиваются лениво при активном `enzymeCatalog` либо по явной версии registry.

Footer-подсказка для plain exact `EcoRI` может использовать только O(1)
`resolveEnzymeExact`; она не должна вызывать `collectEnzymeDocuments`, выполнять
catalog substring matching или добавлять результат в основную выдачу.

---

## 9. UX: выбор режима без знания префиксов

### 9.1. Основная компоновка

```text
[ Библиотека v ] [ Поиск по названию, фичам, последовательности... ] [ + Фильтр ]
```

Не использовать название «Везде»: default scope намеренно не включает справочные
каталоги.

### 9.2. Выпадающий список режима

Список сгруппировать:

```text
Искать в пользовательских данных
  [x] Библиотека
      Молекулы
      Праймеры       (только если provider доступен)
      Проекты        (только если provider доступен)

Биологический поиск
      Последовательность ДНК
      Белковая последовательность
      Сайты рестрикции

Справочники
      Рестриктазы
```

Если пользователь сначала ввёл `Bsa`, а затем выбрал «Рестриктазы», значение
сохраняется, и запрос становится эквивалентен `enz:Bsa`.

### 9.3. Дополнительные фильтры

Кнопка `+ Фильтр` открывает:

```text
Название
Аннотация
Тег
Тип
Статус
Проект
```

После выбора фильтры показываются чипами:

```text
[ Библиотека v ] [ Статус: релиз x ] [ Проект: Gla x ] [ glaA... ]
```

Статус и тип выбираются из enum, а не вводятся произвольной строкой. Тег, название
и аннотация допускают текстовый ввод.

### 9.4. Синхронизация ручного ввода и UI

- Выбор режима создаёт тот же canonical key, что и ручной префикс.
- Вставка `aa:HXHH` переключает selector на «Белок».
- Вставка `рестриктаза:BsaI` переключает selector на «Рестриктазы».
- Вставка `re:EcoRI` переключает selector на «Сайты рестрикции».
- Распознанный режим обязан отображаться selector/mode-chip; field filters —
  отдельными removable chips.
- `LibraryWorkspace` владеет каноническим `globalSearchState`, а Topbar получает
  state + callbacks. Не хранить независимую копию `uiPreset` в selector.
- Ручной draft разбирается на каждом изменении. Как только lexer видит распознанный
  префикс с непустым завершённым значением, обработчик атомарно переносит preset/filter
  в structured state и удаляет соответствующий source span из видимой строки.
- Paste целого запроса разбирается одной транзакцией.
- Для quoted token commit происходит после закрывающей кавычки; незавершённый token
  остаётся draft и показывает диагностику.
- Serializer не подаётся обратно в `onChange` автоматически: это предотвращает
  цикл parse/serialize и скачки курсора.
- Удаление последнего символа значения сохраняет выбранный mode.
- Повторный Backspace в уже пустом поле без composition может удалить mode-chip и
  вернуть `library`.

### 9.5. Placeholder по режимам

| Режим | Placeholder |
|---|---|
| Библиотека | `Название, тег, аннотация, последовательность...` |
| Молекулы | `Название или содержимое молекулы...` |
| Праймеры | `Название или последовательность праймера...` |
| Проекты | `Название проекта...` |
| ДНК | `Введите последовательность ДНК...` |
| Белок | `Введите аминокислотную последовательность...` |
| Рестриктазы | `Название, алиас или сайт узнавания...` |
| Сайты рестрикции | `Название фермента...` |

### 9.6. Discoverability

- При вводе `:` открыть тот же список режимов/префиксов.
- Допустим отдельный значок `?` со справкой и примерами.
- Если обычный запрос не дал пользовательских результатов и точно совпадает с
  известным ферментом, показать footer-action, а не результат:

```text
Есть рестриктаза EcoRI -> искать в справочнике
```

- Footer-action не входит в `results`, не влияет на `diagnostics.total` и не
  расходует `limit`.

### 9.7. Очистка и persistence

- Крестик mode-chip возвращает `library`.
- Явное действие «Очистить всё» сбрасывает значение, mode и фильтры.
- Обычное удаление текста до пустой строки сохраняет выбранный mode, чтобы можно
  было выбрать «Белок», очистить ошибочную последовательность и ввести новую.
- Специализированный режим не сохраняется после перезапуска приложения.
- В рамках открытого поиска режим сохраняется, пока пользователь его явно не
  сбросил.
- Persistence истории и deep links не входят в REV #2; serializer должен быть готов
  к их будущему подключению.

### 9.8. Клавиатура и доступность

- Selector реализовать как `button` с `aria-haspopup="listbox"`, а не как второй
  combobox рядом с поисковой строкой.
- Сам search input остаётся `combobox`, связанный с results listbox через
  `aria-controls`, `aria-expanded` и `aria-activedescendant`.
- `Enter`/`Space` открывают список.
- `ArrowUp`/`ArrowDown` перемещают активный пункт.
- `Enter` выбирает.
- `Escape` закрывает без изменения.
- `Home`/`End` переходят к первому/последнему доступному пункту.
- Фокус после выбора возвращается в поле ввода.
- У выбранного пункта есть `aria-selected`.
- У options стабильные ids; активная строка отражается через
  `aria-activedescendant`.
- Результаты и ошибки объявляются через ненавязчивый `aria-live` region.
- `Tab` закрывает popup и продолжает обычный порядок фокуса.
- Во время IME composition не разбирать `:` и не перехватывать Enter/стрелки.
- `:` открывает prefix popup только в начале нового токена, а не внутри буквального
  имени/URL.
- Недоступные provider-пункты лучше скрывать; если требуется показать roadmap,
  использовать disabled с явным текстом «скоро», но не в основном production UX.

### 9.9. Глобальный поиск и быстрый фильтр дерева — разные состояния

Сейчас верхняя строка и поле дерева используют одну строку `query`. Это было
допустимо, пока оба элемента выполняли только библиотечный metadata search, но
становится некорректно для `enz:`, `cut:`, `aa:`, `project:` и `primer:`.

Не передавать специализированную canonical query в `makeEntryMatcher`: например,
`enz:EcoRI` сейчас не имеет осмысленной семантики для дерева и может оставить его
полностью видимым либо отфильтровать непредсказуемо.

Разделить состояние в `LibraryWorkspace`:

```js
const [treeQuery, setTreeQuery] = useState('');
const [globalSearchState, setGlobalSearchState] = useState(defaultSearchState());
```

Поведение:

- поле дерева остаётся быстрым локальным metadata-фильтром пользовательских
  молекул, праймеров и проектов;
- верхняя строка владеет `uiPreset`, scope, filters и provider intent;
- кнопка «Полный поиск» выполняет однонаправленную эскалацию: копирует `treeQuery`
  в верхнюю строку как `uiPreset=library` и фокусирует её;
- специализированный поиск в topbar не скрывает и не перестраивает дерево;
- `TreeSearchController` компилирует только разрешённый профилем `libraryQuick`
  metadata query; unsupported provider intent даёт `REQUIRES_FULL_SEARCH`;
- root/zones/rows получают готовый tree session и не вызывают
  `makeEntryMatcher`/`classifyQuery` повторно;
- очистка специализированного topbar-запроса не должна неожиданно очищать
  локальный фильтр дерева.

Это явно заменяет текущую двухстороннюю модель «одна строка query для обоих полей».
Нельзя оставлять старую модель и просто игнорировать префиксы в дереве: пользователь
будет видеть одинаковый текст в двух полях с разным поведением.

---

## 10. Поведение поискового движка

### 10.1. Разделить источники документов

Не собирать один безусловный массив всех типов. Минимально разделить:

```text
entryDocuments
projectDocuments
primerDocuments
enzymeCatalogDocuments
```

`QueryPlan` определяет, какие группы передаются в `runSearch`.

Допустим альтернативный вариант с общим массивом и ранним `entityScope`-фильтром,
но каталог ферментов всё равно не должен участвовать в `matchTerm`, сортировке,
лимите или diagnostics обычного запроса.

### 10.2. Lazy providers

Запускать только необходимые providers:

| UI preset / scope | Entity kinds | Metadata | DNA worker | Protein | Enzyme catalog | RE-site scan |
|---|---|---:|---:|---:|---:|---:|
| library | entry+project+primer | да | при auto-DNA только entry+primer | нет | нет | нет |
| molecule | entry | да | при auto-DNA | нет | нет | нет |
| primer | primer | да | при auto-DNA/явном seq | нет | нет | нет |
| project | project | да | нет | нет | нет | нет |
| sequence | entry+primer | подписи | да | нет | нет | нет |
| protein | entry | подписи | нет | да | нет | нет |
| enzymeCatalog | enzyme | catalog | нет | нет | да | нет |
| restrictionSites | entry | подписи | нет | нет | exact resolver only | да |

`collectEnzymeDocuments()` не должен вызываться для обычного запроса.

Для primer worker payload использовать канонический `primer.sequence`, topology
`linear` и составной document key. Результат должен маршрутизироваться в праймерный
пул, а не пытаться открыть SequenceView молекулы.

### 10.3. Scope применяется раньше ранжирования

Порядок:

1. разобрать запрос;
2. проверить diagnostics и совместимость;
3. выбрать document groups/providers;
4. применить entity scope;
5. выполнить matching;
6. вычислить биологическую релевантность;
7. отсортировать;
8. применить глобальный limit.

Scope обязан одинаково действовать в metadata partial и final фазах. Не допускается
мигание ферментных карточек в partial с их исчезновением в final.

### 10.4. Глобально уникальная идентичность результата

После добавления `project`, `primer` и `enzyme` одного `ref.id` недостаточно:
проект, молекула и праймер могут иметь одинаковый локальный id. Перевести
`entityKey` на составной ключ:

```text
<kind>:<id>

entry:abc
project:abc
primer:abc
enzyme:EcoRI
```

Добавить чистый helper `entityRefKey(ref)` и использовать его для:

- `SearchResult.entityKey`;
- React `key` строки результата;
- `docById`/document lookup;
- группировки и дедупликации;
- кэшей и выбранной строки.

`entityRef.id` при этом остаётся исходным id сущности. Обработчик выбора больше не
должен принимать только `id` и предполагать entry:

```js
onPickSearchResult(entityRef, occurrence)
```

Маршрутизация:

- `entry` -> выбрать молекулу и перейти к occurrence;
- `project` -> активировать проект;
- `primer` -> открыть праймерный пул и выбрать праймер;
- `enzyme` -> открыть/выбрать карточку; поиск сайтов запускается отдельным action.

---

## 11. Изменения по файлам

### Новые модули

```text
gui/designer/src/lib/search-prefix-registry.js
gui/designer/src/lib/search-query-lexer.js
gui/designer/src/lib/search-entity-key.js
gui/designer/src/lib/search-profiles.js
gui/designer/src/lib/restriction-enzyme-resolver.js
gui/designer/src/components/Search/SearchField.jsx
gui/designer/src/components/Search/SearchCombobox.jsx
gui/designer/src/components/Search/SearchResultsListbox.jsx
gui/designer/src/components/Search/SearchModeSelector.jsx
gui/designer/src/components/Search/SearchFilterChips.jsx
```

Названия UI-компонентов можно скорректировать по принятому стилю проекта, но
парсер, registry и profiles должны оставаться чистыми модулями без React/store
imports. `SearchField` также не импортирует доменные providers: их подключает
controller/hook конкретной поверхности.

### Изменяемые модули

| Файл | Изменение |
|---|---|
| `lib/query-classify.js` | Удалить hard-coded `PREFIX_RE`; использовать lexer + registry; формировать uiPreset/entityScope/providerIntent/fieldClauses/diagnostics |
| `lib/search-types.js` | Зафиксировать расширенный `QueryPlan`, scope и diagnostics |
| `lib/library-search.js` | Применять entity/field scope; не включать reference kinds по умолчанию; обновить relevance; закрыть P1 match-all при неподдержанном `seq:/aa:/re:`; учитывать consumed clauses |
| `lib/search-facade.js` | Запускать только providers, требуемые планом; одинаково передавать plan/ctx в partial/final |
| `lib/search-service.js` | Сохранять единый plan во всех фазах; не публиковать результаты при error-diagnostics |
| `lib/search-document-adapters.js` | Оставить общие/entry adapters; добавить project/primer adapters либо отдельные модули без статического импорта тяжёлых каталогов |
| `lib/search-enzyme-adapters.js` | Существующий отдельный enzyme collector сохранить отдельно; дополнить aliases/source/typeIIS и вызывать только в enzymeCatalog mode |
| `lib/search-entity-key.js` | Единый `entityRefKey(ref)` для результатов, lookup, React keys и дедупликации |
| `lib/restriction-enzyme-resolver.js` | Один exact/suggest/canonical resolver для catalog и cut providers |
| `lib/re-match.js` | Использовать общий resolver; честная диагностика unknown/ambiguous/collision |
| `lib/seq-match.js`, локальный `sequence-search` primitive | Выделить единый `scanDnaOccurrences`; сохранить выбор exact/exhaustive/seed-extend через profile |
| `lib/search-worker-client.js`, `lib/search-worker-core.js` | Ключовать payload/result maps составным document key, чтобы primer и entry ids не смешивались |
| `store/primerSlice.js` | Использовать `primersById` как канонический источник; adapter не должен создавать вторую модель данных |
| `store/customEnzymesSlice.js` | Дать catalog provider реактивный revision/dependency для обновления custom enzyme cards |
| `components/Library/LibraryWorkspace.jsx` | Разделить `treeQuery` и структурированный `globalSearchState`; однонаправленная эскалация tree -> full search; kind-aware result routing |
| `components/Library/LibraryTopBar.jsx` | Selector, filters, синхронизация ручного ввода, scoped document selection, composite lookup, clear semantics; реактивные inputs entries/projects/primers/custom-enzyme revision |
| `components/Library/tree/LibraryTreeRoot.jsx`, `ProjectZone.jsx`, `LooseZone.jsx`, `TreeItemRow.jsx` | Получать готовый tree `SearchSession`; не переклассифицировать query и не запускать matcher в каждой зоне/строке |
| `components/Library/SmartResultRow.jsx` | Не вкладывать action-button в текущую option/button строку; выбор enzyme row открывает карточку, action живёт вне option |
| `components/CanvasSkeleton/canvas/LibrarySearchBar.jsx` | Удалить собственный ACGT/min-3 matcher и разные правила extraSections; подключить `libraryPicker` profile для всех mount |
| `components/SequenceSearchPopover.jsx` | Подключить common fixed-domain combobox и `scanDnaOccurrences`, сохранив navigation/overlay/recents |
| `components/PrimerPoolList.jsx` | Добавить текстовый `primerPool` search поверх canonical `primersById`; status/tag оставить отдельными filter chips/selects |
| `components/CanvasSkeleton/editor/operation-modes/PrimerReusePicker.jsx` | Использовать тот же canonical primer catalog adapter; biological compatibility проверять отдельным annealing primitive |
| `components/RestrictionSites/RestrictionSitesWorkspace.jsx` | Оба поля перевести на общий enzyme resolver; сохранить single/multi-select context |
| `components/CanvasSkeleton/editor/assembly-mode/RangePickerModal.jsx` | Общий enzyme resolver + локальный boost unique cutters при empty focus |
| `components/CanvasSkeleton/canvas/operations/CutOpPopup.jsx` | Общий enzyme resolver + локальный pinned boost; подключить custom/aliases/Type IIS |
| `components/Library/CommonFeaturesPanel/index.jsx`, `components/CanvasSkeleton/editor/assembly-mode/AssemblySidebar.jsx` | Перевести только на общую G4-оболочку, не подключая global bio parser |
| `components/StartScreen/MainPanel.jsx`, `components/Library/hooks/useLibraryState.js`, `App.jsx` | Удалить dead query/import state только после characterization/reachability test |
| `lib/search-result-vm.js` | Различать enzyme catalog card и enzyme occurrence в молекуле |
| `lib/search-result-format.js` | Локализованные объяснения canonical/alias/source/typeIIS |
| `lib/strings.js` или действующий i18n-слой | Все пользовательские подписи, placeholder и diagnostics |

### Существующие тесты, требующие миграции

```text
lib/__tests__/query-classify.test.js
lib/__tests__/library-search.test.js
lib/__tests__/search-facade.test.js
lib/__tests__/search-document-adapters.test.js
lib/__tests__/re-match.test.js
lib/__tests__/search-result-vm.test.js
lib/__tests__/search-result-format.test.js
components/Library/__tests__/SmartResultRow.test.jsx
components/Library/__tests__/library-topbar-dna-search.test.jsx
components/Library/tree/__tests__/tree-search-dedup.test.jsx
components/CanvasSkeleton/canvas/__tests__/LibrarySearchBar.test.jsx
components/__tests__/sequence-search-popover.test.jsx
components/RestrictionSites/__tests__/restriction-sites-workspace.test.jsx
components/CanvasSkeleton/__tests__/range-picker-enzyme-select.test.jsx
components/CanvasSkeleton/__tests__/skeleton-op-popup-k7.test.jsx
components/Library/CommonFeaturesPanel/__tests__/CommonFeaturesPanel.test.jsx
```

---

## 12. План исполнения

### Этап 0 — characterization tests

До изменения кода добавить тесты, которые воспроизводят проблему:

- `Bsa` возвращает enzyme cards в текущей реализации;
- `EcoRI` возвращает enzyme card как name match;
- `GAATTC` может совпадать с тегом recognition site карточки;
- `seq:GAATTC`, `aa:HXHH` и `re:EcoRI` в metadata-only tree matcher сейчас
  совпадают со всеми entries;
- один tree query сейчас повторно классифицируется/матчится в root, zones и rows;
- одинаковый enzyme query даёт разные списки в Restriction workspace, RangePicker
  и Cut popup;
- partial и final используют один и тот же default scope после исправления.

После фикса первые три теста должны быть инвертированы в ожидаемое отсутствие
ферментов. Три bio-prefix regression tests должны быть инвертированы в fail-closed
поведение с `REQUIRES_FULL_SEARCH`, а не в пустое объяснение после match-all.

### Этап 1 — registry, lexer и новый QueryPlan

1. Создать `PREFIX_REGISTRY`.
2. Добавить lookup canonical/aliases.
3. Реализовать lexer с кавычками.
4. Расширить `classifyQuery` и `search-types`.
5. Создать `SEARCH_PROFILES` и capability validation.
6. Сохранить transitional legacy fields.
7. Добавить diagnostics вместо silent fallback.

### Этап 2 — scopes и lazy providers

1. Разделить document collectors.
2. Подключить project adapter из `state.projects`.
3. Подключить primer adapter/legacy bridge из `state.primersById`.
4. Добавить раннюю проверку `entityScope`.
5. Исключить enzymes/reference kinds из default.
6. Развести `enzymeCatalogQuery` и `cutQuery`.
7. Обеспечить одинаковый scope в partial/final.
8. Не запускать ненужные worker/providers.
9. Ввести `entityRefKey(kind:id)` во facade, worker maps и UI.
10. Добавить kind-aware маршрутизацию результатов.
11. Ввести consumed-clause invariant: ни один prefix/filter/provider intent не
    может быть проигнорирован и одновременно считаться совпадением.

### Этап 3 — визуальный selector и фильтры

1. Добавить общие `SearchField`, `SearchCombobox`, listbox и filter chips.
2. Перевести G1 TopBar на общий control и основной selector.
3. Добавить `+ Фильтр` и removable chips.
4. Синхронизировать typed prefix -> UI.
5. Синхронизировать UI -> canonical query.
6. Добавить mode-dependent placeholder/validation.
7. Реализовать keyboard/a11y один раз в common control.
8. Разделить `treeQuery` и `globalSearchState`; сохранить эскалацию в полный поиск.
9. Создавать один `libraryQuick` session и передавать match maps в root/zones/rows.

### Этап 4 — карточки ферментов и Type IIS

1. Добавить `enz:` catalog mode.
2. Добавить явное действие `cut:`.
3. Сохранить `re:` как legacy alias.
4. Подключить Golden Gate enzyme documents.
5. Подключить aliases BbsI/Eco31I/Esp3I.
6. Показать canonical name, matched alias, source и Type IIS.
7. Обработать custom collision без молчаливого shadowing в UI.
8. Перевести оба поля Restriction workspace, RangePicker и Cut popup на тот же
   resolver, сохранив только их контекстные boosts и single/multi-select semantics.

### Этап 5 — остальные живые поисковые поверхности

1. Перевести `LibrarySearchBar` и все его Canvas/Assembly/Align mount на
   `libraryPicker` capabilities; убрать отдельные matcher rules для extraSections.
2. Добавить canonical primer search в `PrimerPoolList`.
3. Перевести `PrimerReusePicker` на тот же primer catalog adapter.
4. Перевести `SequenceSearchPopover` на common fixed-domain UI и общий DNA scanner.
5. Перевести `CommonFeaturesPanel` и `AssemblySidebar` только на G4-оболочку.
6. Выполнить reachability test legacy-компонентов; удалить или явно пометить их,
   но не переносить мёртвую логику в common layer.
7. Удалить подтверждённые dead query/import states.

### Этап 6 — стабилизация

1. Unit tests parser/registry/scope.
2. Integration tests facade/partial/final.
3. Contract tests всех search profiles и cross-surface equivalence.
4. UI tests mouse/keyboard/typed prefix/chips/listbox/IME.
5. Browser smoke-test на настоящем worker и живых picker workflow.
6. Scoped lint без errors.
7. Полная тестовая сюита и production build.

---

## 13. Обязательная тестовая матрица

### 13.1. Default scope

| Запрос | Ожидание |
|---|---|
| `Bsa` | Нет `entityRef.kind='enzyme'` ни в partial, ни в final |
| `EcoRI` | Только пользовательские объекты с таким текстом |
| `GAATTC` | При default `minQueryLen=8` остаётся text; карточки EcoRI всё равно нет |
| `GAATTCGG` | Auto-DNA hit при default `minQueryLen=8`; карточки ферментов нет |
| `seq:GAATTC` | Явный DNA-hit независимо от `minQueryLen`; карточки EcoRI нет |
| неизвестное слово | Обычный metadata search, без справочников |
| пустой запрос | Пустая dropdown-выдача согласно текущему UX; ферменты не подмешиваются |

### 13.2. Каталог и сайты

| Запрос | Ожидание |
|---|---|
| `enz:Bsa` | Только карточки ферментов |
| `рестриктаза:Bsa` | Тот же `QueryPlan` и результаты, что `enz:Bsa` |
| `enz:GGTCTC` | BsaI как recognition-site match, без молекул |
| `cut:BsaI` | Только молекулы с occurrence/координатами |
| `re:BsaI` | То же, что `cut:BsaI`; canonical providerIntent = restrictionSites |
| `seq:GGTCTC` | Только sequence search, без enzyme card |
| `enz:BbsI` | Карточка canonical BpiI с matched alias BbsI |
| `cut:Eco31I` | Поиск сайтов canonical BsaI |
| неизвестный фермент | Понятная диагностика, не пустой необъяснённый результат |

### 13.3. Поля и области

| Запрос | Ожидание |
|---|---|
| `name:EcoRI` | Только пользовательские объекты с EcoRI в названии |
| `feature:EcoRI` | Родительские молекулы и feature-location |
| `feature:"signal peptide"` | Корректное quoted value |
| `type:circular glaA` | AND: circular и текст glaA |
| `status:release seq:GAATTC` | Только release-молекулы с мотивом |
| `project:Alpha` | Только project docs и корректная project navigation |
| `in:"Project Alpha" AmpR` | AmpR только внутри проекта |
| `primer:T7` | Только deduplicated primer docs из канонического пула/legacy bridge |

### 13.4. Ошибки

| Запрос | Ожидание |
|---|---|
| `seq:amp` | Ошибка DNA-алфавита, без text fallback |
| `enz:EcoRI seq:GAATTC` | Диагностика несовместимых режимов |
| `primer:T7 aa:HHHH` | Диагностика несовместимых режимов |
| `enzz:EcoRI` | Буквальный текст + предложение `enz:` |
| `feature:"signal peptide` | Диагностика незакрытой кавычки, без crash |
| `seq:` | Запрос не запускается; подсказка о требуемом значении |

### 13.5. Эквивалентность UI и текста

Для каждого режима проверить:

1. выбрать пункт мышью;
2. выбрать пункт клавиатурой;
3. ввести canonical prefix;
4. ввести EN alias;
5. ввести RU alias;

Все пять путей должны создавать эквивалентный нормализованный `QueryPlan` и
одинаковую выдачу.

Дополнительно:

- выбор режима после уже введённого текста сохраняет текст;
- typed prefix синхронизирует selector;
- удаление mode-chip возвращает library;
- удаление последнего символа сохраняет mode, а явное Clear all удаляет mode и filters;
- специализированный mode не переживает перезапуск приложения;
- footer-action фермента не входит в `results` и `limit`.
- `enz:`/`cut:`/`aa:` в topbar не фильтруют дерево;
- «Полный поиск» копирует plain tree query в topbar как `uiPreset=library`;
- очистка topbar не очищает treeQuery;
- одинаковые локальные id разных kinds создают разные `entityKey` и корректно
  маршрутизируются.

### 13.6. Provider isolation

Использовать spies/mocks:

- обычный metadata query не вызывает `collectEnzymeDocuments`;
- обычный query не вызывает `reMatch`;
- `enz:` не вызывает DNA worker и `reMatch`;
- `cut:` не вызывает DNA worker и protein provider;
- `aa:` не вызывает enzyme catalog;
- partial и final не меняют scope;
- stale/cancelled session не меняет выбранный UI mode.

### 13.7. Инварианты parser/registry и доступность

- aliases уникальны без учёта регистра и не конфликтуют с canonical keys;
- каждая enabled registry entry имеет реально подключённый provider/adapter;
- parser/serializer проходят round-trip для canonical, EN и RU форм;
- lexer сохраняет source spans, quoted values, escaped quote и незакрытую кавычку;
- repeated clauses не теряются и имеют заданную AND-семантику;
- diagnostic severity `error` блокирует запуск, `warning/info` — нет;
- `cut:Bsa` предлагает кандидатов и не запускает несколько scans;
- два одинаковых project names дают ambiguous `in:` diagnostic;
- одинаковый id у entry/project/primer не создаёт collision в worker/result/UI;
- тесты IME composition подтверждают, что `:`/Enter не перехватываются до
  `compositionend`;
- mouse и keyboard создают deep-equal планы; различаться могут только raw/source spans;
- specialized topbar modes не влияют на `treeQuery` ни в `LibraryTreeRoot`, ни в
  `LooseZone`/`ProjectZone`.

### 13.8. Cross-surface contract tests

#### Tree fail-closed и single-session

- `libraryQuick('seq:GAATTC')`, `libraryQuick('aa:HXHH')` и
  `libraryQuick('re:EcoRI')` не возвращают все entries;
- каждый случай даёт `REQUIRES_FULL_SEARCH` и доступное действие эскалации;
- `makeEntryMatcher` не считает ignored clause совпадением;
- один ввод в tree вызывает compile/match один раз, а `ProjectZone`, `LooseZone` и
  `TreeItemRow` получают готовые maps без повторного `runSearch`;
- пояснение строки берётся из `matchInfoByEntityKey`, а не пересчитывается.

#### Library picker parity

- при одинаковом entry scope metadata-запрос даёт одинаковый набор `entityKey` в
  global и `LibrarySearchBar`; допустима разница порядка только если она задана
  profile ranking contract;
- library entries и `extraSections` проходят один и тот же matcher contract;
- global DNA и sequence-within-entry одинаково применяют ACGT-only, threshold, circular и strand
  contract; `LibrarySearchBar` пока остаётся отдельным min-3, forward-only literal ACGT
  substring-фильтром без circular и approximate semantics;
- четыре mount `LibrarySearchBar` не добавляют собственных parser branches.

#### Enzyme resolver parity

- `BsaI`, `BbsI`, `Eco31I`, `GGTCTC`, recognition site и overhang дают одинаковую
  canonical сущность во всех живых enzyme pickers;
- custom enzymes видимы в Restriction workspace, set editor, RangePicker и Cut popup;
- Type IIS aliases поддерживаются в каждом picker;
- contextual boosts меняют только порядок/empty suggestions, а не canonicalization;
- RangePicker сохраняет unique-cutters empty state, Cut popup — pinned boost,
  set editor — checked multi-select;
- глобальный plain query по-прежнему не запускает enzyme provider.

#### Primer и DNA parity

- `PrimerPoolList`, global `primer:` и `PrimerReusePicker` используют один canonical
  primer document key и не дублируют legacy primer;
- текстовый primer search не выдаёт результат проверки посадки как catalog hit;
- `SequenceSearchPopover` и global DNA provider используют один ACGT-only worker/core, обе цепи, circular origin и canonical occurrence coordinates;
- homology и Annotator spies подтверждают, что common SearchField их не вызывает.

#### UI contract

- каждый G1/G2/G3 autocomplete использует общий combobox/listbox keyboard contract;
- каждое поле имеет label, clear semantics, focus/error/disabled и IME tests;
- fixed-domain picker не требует ручного prefix и не показывает чужие scopes;
- G4 local filter не запускает parser/worker;
- snapshot/profile test перечисляет все production search surfaces: новая строка
  поиска без зарегистрированного profile должна ломать тест.

---

## 14. Definition of Done

REV #2 считается завершённой только если выполнено всё ниже:

- [ ] Рестриктазы отсутствуют в обычной выдаче, а не просто понижены в рейтинге.
- [ ] Default scope одинаков в metadata partial и final фазах.
- [ ] `enz:` и `cut:` являются разными намерениями.
- [ ] `re:` совместим с текущими сохранёнными запросами и нормализуется в `cut:`.
- [ ] Все префиксы и алиасы определены в одном `PREFIX_REGISTRY`.
- [ ] Выпадающий selector строится из того же registry.
- [ ] Ручной ввод и выбор из списка дают эквивалентный `QueryPlan`.
- [ ] Поддерживаются quoted values.
- [ ] Явные ошибки bio-prefix не деградируют в обычный текст.
- [ ] Несовместимые режимы показывают диагностику.
- [ ] Каталог ферментов вызывается только opt-in.
- [ ] Карточка фермента имеет явное действие поиска сайтов.
- [ ] Type IIS canonical names и aliases работают в `enz:` и `cut:`.
- [ ] Project и primer adapters, dedup и kind-aware navigation реализованы; до их
      фактического подключения пункты не показываются в промежуточных сборках.
- [ ] Верхний глобальный поиск и быстрый фильтр дерева имеют раздельное состояние;
      эскалация из дерева работает однонаправленно.
- [ ] P1 `seq:/aa:/re: -> match-all` закрыт: ignored/unsupported clause не может
      считаться совпадением; tree показывает `REQUIRES_FULL_SEARCH`.
- [ ] Tree query компилируется и матчится один раз; root/zones/rows получают один
      готовый `SearchSession` и `matchInfoByEntityKey`.
- [ ] `entityKey` глобально уникален как минимум по паре `kind:id`, а выбор результата
      маршрутизируется по `entityRef.kind`.
- [ ] Все живые search inputs зарегистрированы в `SEARCH_PROFILES`; contract test
      падает при появлении production search surface без profile.
- [ ] G1/G2/G3 используют общие `SearchField`/`SearchCombobox`/listbox primitives;
      G4 использует ту же оболочку без global bio parser.
- [ ] `LibrarySearchBar` и все четыре mount не содержат собственной классификации
      ACGT/min-3 и не фильтруют extraSections другими правилами.
- [ ] Оба поля Restriction workspace, RangePicker и Cut popup используют один
      canonical enzyme resolver с custom, aliases и Type IIS; контекстные boosts
      сохранены отдельно.
- [ ] В `PrimerPoolList` есть текстовый поиск по canonical pool; global `primer:` и
      `PrimerReusePicker` используют тот же adapter/dedup.
- [x] `SequenceSearchPopover` использует общий ACGT-only DNA worker/core и совпадает
      с global DNA-поиском по threshold/strand/circular coordinates.
- [ ] Legacy/dead search surfaces прошли reachability characterization: удалены или
      явно помечены и не продублированы в common layer; dead query state удалён.
- [ ] Selector полностью управляется мышью и клавиатурой и имеет корректные ARIA roles.
- [ ] Search combobox, results listbox, selector listbox и diagnostics live-region
      проходят keyboard/a11y тесты без nested interactive controls.
- [ ] Нет новых scoped lint errors.
- [ ] Целевые тесты, полная suite и production build проходят.
- [ ] Выполнен browser smoke-test на настоящем worker.

---

## 15. Не входит в REV #2

- исправление worker resilience и stale-result race как отдельная REV;
- transcript/isoform-aware белковый поиск;
- реализация модели праймерного пула как таковой;
- перевод `PrimerTrack` и всех «куда садится» на новый annealing scanner — отдельная
  primer-specific REV; REV #2 лишь не должна закреплять простой `indexOf` как общий;
- удалённые базы ферментов и онлайн-запросы;
- Boolean grammar с OR/NOT и скобками;
- полнотекстовый индекс;
- persistent history, clipboard command и deep-link UI (но чистый serializer обязателен);
- изменение политики custom enzyme override в сканирующем движке;
- сохранение специализированного режима между запусками приложения.

Архитектура registry и `QueryPlan` должна позволять добавить эти возможности позже
без нового переписывания parser и UI.

---

## 16. Рекомендуемый порядок относительно текущего backlog

Если работа идёт последовательно:

1. characterization-test и закрыть локальный P1 `seq:/aa:/re: -> match-all`;
2. закрыть критические зависания worker и stale-result race;
3. реализовать ядро REV #2: registry, scopes, entity keys, раздельные controllers;
4. после изоляции справочника подключить Type IIS aliases/cards и перевести все
   живые enzyme pickers на общий resolver;
5. перевести остальные G2/G3/G4 search surfaces по разделу 1A;
6. выполнить scoped lint, полную suite, build и browser smoke-test.

Если работу можно распараллелить, worker hardening, common UI primitives и
characterization живых/legacy surfaces независимы. Этап Type IIS следует мержить
после того, как default scope уже гарантированно не включает каталог ферментов.
Cross-surface migration начинается после фикса contracts profiles/controller, чтобы
не размножать переходный API по всем компонентам.

---

## 17. Готовая формулировка задания исполнителю

```text
Реализуй REV #2 строго по документу
docs/SMART_SEARCH_SCOPES_PREFIXES_REV2.md.

Перед изменениями прочитай документ полностью и проверь актуальное состояние
указанных модулей. Работай этапами 0–6: characterization/P1 -> registry/lexer/
profiles -> scopes/providers/entity keys -> common UI + tree controller -> enzyme
catalog и все живые enzyme pickers -> остальные живые G2/G3/G4 surfaces ->
стабилизация.

Ключевые неизменяемые решения:
- обычный поиск никогда не включает справочник рестриктаз;
- typed prefixes и dropdown обязаны давать один QueryPlan;
- engine читает entityScope/providerIntent/fieldClauses, а uiPreset только отображает
  выбранную конфигурацию;
- enz: ищет карточки ферментов, cut: ищет сайты, re: является legacy alias cut:;
- Topbar smart search и tree quick filter имеют раздельное состояние;
- unsupported bio-prefix в tree никогда не даёт match-all: fail-closed + действие
  «Открыть полный поиск»;
- query/session вычисляется один раз на поисковую поверхность; zones/rows не
  переклассифицируют строку;
- все entity/document/result maps используют составной kind:id;
- primers берутся из primersById с dedup legacy bridge;
- project/primer adapters и навигация входят в Definition of Done;
- одна оболочка не означает одну семантику: используй G1/G2/G3/G4 profiles;
- все production search inputs должны быть зарегистрированы profile contract test;
- LibrarySearchBar во всех Canvas/Assembly/Align mount использует общий picker
  profile, а не собственный ACGT/min-3 matcher;
- все живые enzyme pickers используют один resolver, но сохраняют contextual ranking;
- добавь текстовый поиск в canonical PrimerPoolList;
- не мигрируй неподтверждённые legacy-компоненты: сначала reachability test;
- не добавляй декоративные controls без provider;
- не вкладывай action button внутрь интерактивной result option.

Сохраняй все чужие изменения dirty worktree. Не используй git add . и не создавай
коммит без отдельного указания. После каждого этапа запускай целевые тесты; в конце
запусти scoped lint, полную suite, production build и browser smoke-test настоящего
worker. В итоговом отчёте перечисли выполненные пункты Definition of Done, отклонения
от спецификации, тестовые числа и всё, что осталось.
```
