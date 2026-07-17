# Техническая архитектура поиска BodgeGene

**Состояние:** описание живого search-кластера `0.8.7-alpha`. Исполняемый код и тесты являются окончательным контрактом.

## 1. Цели

Поиск должен одновременно:

- давать быстрый metadata-preview;
- подтверждать ДНК/белок/сайт отдельными провайдерами;
- не смешивать пользовательские сущности со справочником ферментов;
- сохранять строгую AND-семантику;
- отличать biological miss от непроведённой проверки;
- отменяться и не принимать stale-ответы;
- работать на слабой машине без тяжёлой работы в UI-потоке.

## 2. Сквозной поток

```text
typed text / selector / filter chips
  → search-query-sync + useSearchQueryState
  → canonical query
  → lexer + PREFIX_REGISTRY + classifyQuery
  → QueryPlan + capability/blocking diagnostics
  → SearchDocument adapters + entity scope
  → metadata preview (providerPolicy=deferred)
  → DNA worker / protein / restriction provider
  → strict final AND (providerPolicy=required)
  → provider/session validation
  → one presentation projection
  → result VM + listbox + kind-aware routing
```

Глобальный TopBar и быстрый фильтр дерева имеют разное состояние. Эскалация из дерева делает replace через `seedGlobalQuery`, а не merge со старым режимом/чипами.

## 3. Язык запросов

### Registry

`lib/search-prefix-registry.js` — единственный реестр префиксов, алиасов, категорий, label keys и readiness. Парсер и UI не поддерживают отдельные списки.

Категории:

- scope: `lib`, `mol`, `primer`, `project`;
- provider/preset: `seq`, `aa`, `cut`, `enz`;
- field/filter: `name`, `tag`, `feature`, `type`, `status`, `in`.

`re` — legacy alias канонического `cut`. `name`, `feature`, `in` сейчас parse-only: они распознаются и дают явную диагностическую блокировку, но не выдаются за рабочий фильтр.

### Lexer and classifier

- `search-query-lexer.js` токенизирует кавычки/escape и хранит source spans.
- `query-classify.js` создаёт `QueryPlan` и переходные legacy-поля.
- clause id назначается парсером до сортировки, поэтому повторные одинаковые фильтры имеют разные occurrence identity.
- `serializeQueryPlan` выдаёт каноническую строку, не меняя смысл quoted values или конфликтов.

`QueryPlan` хранит три независимые оси:

1. `entityScope` — допустимые kinds;
2. `providerIntent` — metadata/sequence/protein/restrictionSites/enzymeCatalog;
3. `fieldClauses` — ограничения полей.

`uiPreset` — представление, не команда движку.

### Typed ↔ UI synchronization

`search-query-sync.js` хранит residual как сегменты с происхождением, а не разбивает draft повторно пробелами. Это сохраняет quoted фразы, mode value, свободный текст и второй конфликтующий prefix.

`useSearchQueryState` — единственный контроллер глобальной строки. Он владеет draft, composition buffer, mode, filters, canonical query, diagnostics и runnable. IME-составление не парсится до commit; paste коммитит новое значение, а не старое. Неоднозначный entity filter и severity:error делают запрос non-runnable.

## 4. Profiles and capabilities

`search-profiles.js` ограничивает язык и провайдеры конкретной поверхности.

- `globalLibrary` — полная библиотека;
- `libraryQuick` — metadata-only дерево;
- `libraryPicker`, `primerPool` — ограниченные выборщики;
- fixed/local profiles — sequence-within-entry, enzyme catalog, notebook и т. п.

Неизвестный профиль, запрещённый explicit-prefix или недоступный provider fail closed. `visibleModeGroups()` проверяет обе capability-оси; повреждённая половина объекта не должна протянуть режим через валидную половину.

## 5. SearchDocument and identity

`search-document-adapters.js` нормализует молекулы, проекты, праймеры и ферменты в SearchDocument. Адаптер не должен импортировать тяжёлый каталог, если запрос не требует `enz:`.

Глобальная identity — `entityRefKey(ref) = kind:id`. Raw `ref.id` сохраняется для доменной навигации. Одинаковый локальный id у entry/project/primer не является коллизией.

Scope-фильтрация выполняется до provider scan и ранжирования. В worker передаются только документы, разрешённые планом.

## 6. Metadata engine and strict AND

`library-search.js` — чистый matcher/ranker. Он:

- применяет scope и исполнимые metadata clauses;
- ведёт consumed-clause ledger;
- fail-closed помечает неисполняемую clause;
- объединяет метаданные и occurrences;
- в финале требует совпадение каждого обязательного biological dimension.

`providerPolicy` имеет смысл:

- `required` (также absent/unknown) — dimension без hit удаляет документ;
- `deferred` — документ может остаться предварительным с `providerPending`.

Таким образом `mol:pUC seq:GAATTC` не возвращает pUC только из-за имени. Финальный объект обязан иметь ДНК-hit.

Движок не решает, почему provider отсутствует. Failure semantics принадлежат facade/contract layer; это удерживает `library-search.js` чистым и в размерном бюджете.

## 7. Biological providers

### DNA

`seq-match.js` маршрутизирует:

- `<=30 nt`, IUPAC или circular → `scanMotif` (`sequence-search-bio.js`);
- длинный линейный concrete query → seed-and-extend (`sequence-search.js`).

Exhaustive path поддерживает overlaps, обе цепи, IUPAC, origin-wrap и ограниченное число substitutions. Seed-and-extend поддерживает substitutions и однонуклеотидные indel. Известный разрыв: короткий запрос с insertion/deletion не выравнивается как indel.

### Protein

`protein-match.js` ищет по производным белкам. Подготовка вариантов учитывает аннотированные coding regions/интроны, но полноценной transcript/isoform-модели, всех genetic code tables и всех origin-crossing compound CDS пока нет. Метрика разделяет exact identity и wildcard compatibility.

### Restriction

- `enz:` лениво подключает enzyme documents и ищет карточки каталога.
- `cut:` / legacy `re:` использует `re-match.js` и возвращает sites в молекулах.
- буквальный `seq:` не превращается в enzyme-card search.

Type IIS aliases/catalog policy не должны расширять default scope.

## 8. Provider boundary

`search-provider-contract.js` валидирует ответы worker и inline-provider одной структурной проверкой:

- plain object с допустимыми document keys;
- непустые occurrence arrays;
- location с непустыми segments;
- конечные целые `start/end`, `end > start`, координаты в длине владельца;
- запрещён недоверенный `targetRef`: владельца назначает движок из SearchDocument.

Допустимы составные/spliced и origin-wrap locations; контракт не требует глобальной сортировки смежности, которая сломала бы такие случаи.

`search-provider-failures.js` различает `TIMEOUT`, `WORKER_FAILURE` и `PROVIDER_ERROR`. `[]` — честный miss; exception/non-array/invalid protocol — failure. Сырой текст исключения не попадает в пользовательскую сессию.

## 9. Facade, worker and lifecycle

`search-facade.js` оркестрирует одну search session:

1. классифицирует и блокирует severity:error до коллекции/provider;
2. даёт metadata preview с deferred policy;
3. запускает нужные providers;
4. валидирует ответ;
5. строит strict required final;
6. при provider failure отбрасывает ложный strict-pass и выполняет один deferred fallback с `incomplete`.

DNA проходит через worker client/core/service. Отмена активной работы завершает worker и создаёт новый для следующего поиска, потому что синхронный full-pass нельзя прервать сообщением. Generation guard не позволяет поздней ошибке старого worker повредить новый. `terminate()` закрывает lifecycle и немедленно отклоняет новые запросы.

Inline protein/cut providers используют тот же guard/validator; их failure классифицируется как PROVIDER_ERROR, не как перезапускаемый worker crash.

## 10. Session presentation

`search-session-presentation.js` — единственная лестница состояния:

```text
hidden → blocked → incomplete → checking → metadata-preview → complete-hit/empty
```

Она одновременно определяет заголовок, count label, status content, busy/disabled и empty state. Listbox не пере-ранжирует состояние самостоятельно.

Правила:

- complete всегда может показать честный ноль;
- checking/incomplete с кандидатами показывает предварительное число;
- blocked и incomplete без кандидатов не показывают ложный `0`;
- pending row `aria-disabled` и не выбирается мышью/Enter;
- один live region объявляет состояние; вложенные alerts/live regions запрещены.

## 11. Results and routing

`search-result-vm.js` и format helpers превращают engine result в UI model, сохраняя `entityRef`, providerPending, occurrence, metrics и reason.

Kind-aware routing:

- entry → guarded open + occurrence navigation;
- project → activate project;
- primer → canonical pool (legacy migration с collision guard);
- enzyme → card; site scan — отдельное действие.

Option identity обязана быть стабильной и kind-qualified. Коллизия keys fail closed до рендера.

## 12. Library tree

`tree-search-controller.js` выполняет один `libraryQuick` plan/session. Unsupported provider или unconsumable clause даёт `requiresFullSearch` и не запускает `runSearch`. Дерево остаётся видимым и предлагает эскалацию, а не становится false-empty или match-all.

## 13. Расширение поиска

### Новый prefix

1. Добавить запись в `PREFIX_REGISTRY` и readiness.
2. Добавить parser/serializer/alias/round-trip tests.
3. Реализовать consumer и consumed-clause semantics до перевода в executable.
4. Разрешить prefix только в подходящих profiles.
5. Добавить selector/filter model и локализацию, если он user-facing.

### Новый provider

1. Определить dimension и allowed entity kinds.
2. Вернуть occurrences без `targetRef`.
3. Подключить общий validator/failure tracker.
4. Обеспечить cancel/stale-drop или документированный bounded inline путь.
5. Добавить strict AND, failure, malformed protocol и presentation tests.
6. Проверить latency/memory на слабой машине.

### Новая поверхность

Создать SearchProfile и контроллер. Generic `components/Search/` не импортирует store/engine. Capability must be enforced, not merely displayed.

## 14. Обязательная проверка изменений

- parser/registry round-trip и transition tests;
- engine strict-AND/ledger tests;
- provider contract + mutation counterexamples;
- facade lifecycle/failure tests;
- accessibility/IME/selection component tests;
- focused cluster, full Vitest, build;
- live browser smoke для обычного hit, miss, blocked и доступных failure states;
- честная пометка состояний, воспроизведённых только harness-тестом.
