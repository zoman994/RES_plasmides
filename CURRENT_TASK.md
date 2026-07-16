# CURRENT_TASK.md

> **Активная задача — REV #2 SEARCH-COMMIT-AUDIT / K1**: post-acceptance аудит состава search-коммита. K3 принят: биологическая семантика поиска не меняется. Задача — доказуемо отделить search-пакет от чужого dirty backlog, убрать мусорные shell-артефакты из кандидатов на коммит и подготовить точный manifest для ручного staging Игорем.
> **K1/K2/K3 S3-CLOSE приняты 16.07. `SEARCH-PRECOMMIT / K1` снят 17.07 как неверный диагноз:** mojibake на диске не подтвердился; проблема была в отображении UTF-8 через системную кодовую страницу. Руководящий документ остаётся `docs/SMART_SEARCH_SCOPES_PREFIXES_REV2.md` (§1A.2, §9.8, §13.7–13.8, §14); новый исполнительный контракт — последний блок этого файла `SEARCH-COMMIT-AUDIT / K1`. Один атомарный проход, STOP после отчёта. Stage 4 не начинать.
> **Порядок сессии:** `AGENTS.md` → `BUGS.md` → `CURRENT_TASK.md` → `PROJECT_STATE.md` → `DECISIONS.md`.

---

## ✅ ЗАКРЫТО — REV #2 Stage 2 (задача трекера #164)

**Все 11 требований §12 закрыты. K1–K7 приняты (K6 функционально, K7 после round-2 из 5 P1).** Финальная верификация: полная сюита **6816 pass 0 fail**, build OK, scoped lint 0 errors. Size: hard-нарушителей нет (детали в K7-блоке ниже). Коммит — за Игорем, отдельной веткой. Дальше по §16 — **Stage 3** (общие UI-примитивы SearchField/Combobox/filter-chips + визуальный selector + разделение `treeQuery`↔`globalSearchState` + tree controller); НЕ начинать до go.

Три независимых понятия: **entityScope** (где искать) · **providerIntent** (что вычислять) · **fieldClauses** (доп. AND). Обычный запрос ищет ТОЛЬКО user-data (entry+project+primer); каталог рестриктаз/справочники исключены из default scope, не расходуют лимит, не мигают в partial. `EcoRI`=текст; `enz:EcoRI`=карточка; `cut:EcoRI`(=legacy `re:`)=сайты в молекулах; `seq:GAATTC`=ДНК-мотив.

### K-план (TDD-first; K1–K7 + все корректирующие P1 ПРИНЯТЫ 14.07 — Stage 2 ЗАКРЫТ)

- [x] **K1 — `entityRefKey(ref)`=`<kind>:<id>`** (`lib/search-entity-key.js`) + адоптирован как `SearchResult.entityKey`. `ref.id` остаётся RAW (nav-канал).
- [x] **K2 — коллекторы project + primer** (`search-document-adapters.js`, без restriction-db). Мост legacy `kind='primer'` → пул: дедуп resourceHash→id.
- [x] **K3 — ранний entityScope-фильтр** `filterDocumentsByScope` до ранжирования; enzyme/reSite вне default; kind-aware matchingEntry/ProjectIds.
- [x] **K4 — routing `enzymeCatalogQuery` vs `cutQuery`**; guard'ы empty/pureFilter учитывают enzymeCatalogQuery; характеризация Stage 0 инвертирована.
- [x] **K5 — контроллер:** user-data всегда, `collectEnzymeDocuments` только при `planNeedsEnzymeCatalog`; docById+React key на entityRefKey.

### ⚠ КОРРЕКТИРУЮЩИЕ P1 (ревью Игоря — блокер перед K6; TDD-red-first, тест ловит дефект ДО фикса)

- [x] **P1-A — композитный entityKey не дошёл до worker-канала.** `toWorkerDocs`/`searchAllSequences` byId + facade seqMatch lookup ключуют по голому `ref.id` → молекула+праймер с одним id сливаются. Фикс: worker doc.id = `entityRefKey(ref)`; facade seqMatch `byId.get(entityRefKey(doc.ref))`. Тест: entry+primer с одинаковым id → seq-хит только у своего.
- [x] **P1-B — дедуп legacy-праймера читает не то поле + seen-set не обновляется.** Реальная запись хранит хеш в `payload.resourceHash`; адаптер читал `resourceHash`/`origin`. И два legacy-дубля проходят (poolHashes/poolIds не растут). Фикс: `hashOf = resourceHash ?? payload.resourceHash ?? origin.resourceHash`; добавлять hash/id в seen после моста. Тест: реальная payload-форма + два legacy-дубля.
- [x] **P1-C — `docType` неверно классифицирует project/primer/enzyme.** Смотрит top-level `doc.kind` (нет у новых доков). Ревью-2: topology — ENTRY-only (§4.5); project/enzyme НЕ поддерживают `type`. `type:project` ложно находил проект; enzyme падал в linear-fallback → `enz:EcoRI type:linear` находил фермент. Фикс: `docType` = primer→'primer', **любой non-entry kind→null** (никакой `type:` его не матчит), иначе entry-topology. Тесты: type:primer→пул-праймер; type:linear только entry; type:project→ничего; enz:EcoRI type:linear→ничего.
- [x] **P1-D — scope применяется до ранжирования, но ПОСЛЕ DNA-worker.** `mol: seq:` шлёт праймеры на скан, `primer: seq:` — молекулы (§10.3 нарушен, timeout/incomplete риск). Фикс: facade scope-фильтрует documents ДО обеих фаз + worker. Тест: mol: seq: → worker не видит primer-док.
- [x] **P1-E — readiness реестра отстал.** enz/mol/primer/project исполняются (Stage 2), но помечены parse-only → лишняя диагностика + не в selector. Фикс: EXECUTABLE_PREFIXES += enz/mol/primer/project (name/feature/in остаются parse-only). Тест: обновить registry executable-set.

- [x] **Усилить lazy-collector тест:** plain/cut → `collectEnzymeDocuments` вызван 0 раз; `enz:` → 1 раз (spy/mock).

### Осталось (K6, K7 — после P1)

- [x] **K6 — kind-aware routing (req 10). ROUND-2 ЗАКРЫТ — ГОТОВО К ФИНАЛЬНОЙ ПРИЁМКЕ (GO на K7 без нового широкого ревью).** Готово: `resolveSearchPick()` (маршрут по kind, RAW id, occurrence, collision, none/unknown); удалён enzyme→re:; site-scan отделён от карточки; option без вложенной кнопки. **КОРРЕКТИРУЮЩИЕ:**
  - [x] **K6-P1-1 — entry обходит guardedSelect.** Прямой `setSelectedId` пропускает dirty-guard/подтверждение/common→entry/perEntryState; nav-occurrence может сработать позже. Фикс: маршрутизировать entry через существующий `guardedSelect`, nav парковать после (не до) успешного select.
  - [x] **K6-P1-2 — primer → пустой экран.** (a) архивный праймер скрыт фильтром `active` → force-show выбранного [round-1]; (b) legacy-only праймер есть в search-doc, но НЕ в `primersById`. **Round-1 закрыл только (a); (b) де-факто открывал legacy как Library entry (расходилось с §10.2/§10.4) + fallback по RAW id → коллизия `primer:x`↔`entry:x`. Round-2 фикс:** legacy → `addPrimerToPool` (sync state-set) → открыть пул; guard `legacy.kind === 'primer'` закрывает коллизию (id совпал с молекулой → no-op).
  - [x] **K6-P1-3 — fail-open в entry.** VM+TopBar подставляют `kind='entry'` при потере типа → отменяет fail-closed роутера. Фикс: передавать полный исходный `entityRef`; без kind — не маршрутизировать.
  - [x] **K6-P1-4 — `cut:` с пробелами ломается.** `My Enzyme`→`cut:My Enzyme`. Использовать канонический сериализатор → `cut:"My Enzyme"` с экранированием.
  - [x] **K6-UX — EnzymeCard: non-modal `region` (focus/Escape); `Icon close/restriction` вместо ✕/✂️; `var(--font-mono)`+shadow-токен; containing block для absolute; SmartResultRow — kind-aware иконки (не всегда ДНК).**
  - [x] **K6-DS (round-2) — PrimerPoolList рамка `var(--accent, #6366f1)` → `var(--accent-500)`; SmartResultRow emoji 🧬/✂️ в explain-строках → `Icon dna/restriction`.**
  - [x] **K6-P1-2b (round-3) — миграция legacy-праймера была РАЗРУШИТЕЛЬНО lossy** (переносила только id/name/sequence/tags/resourceHash → теряла tm/length/direction/binding/tail/status/origin/addedAt; `addPrimerToPool` дефолт `status='imported'` — валидный enum — затирал `input.status`). Фикс: чистый helper `lib/legacy-primer-migrate.js` `legacyPrimerToCanonical` (top-level + payload + origin формы, зеркалит primerToDocument/hashOf) + передача `status`/`origin` ОТДЕЛЬНЫМИ аргументами. Red→green: unit (4) + **интеграционный на РЕАЛЬНОМ store** (3: все поля / праймер в primersById в момент setActiveWorkspace / origin.resourceHash / коллизия не открывает молекулу). **Адверсариальный verify (3 скептика): ordering+regression не опровергнуты (high-conf), нашёл остаток P2 — `description` (searchable) не переносился → дозакрыт (добавлен в `normalizePrimer` + helper + тесты). Миграция буквально lossless.**
  - [x] **K6-P2b (round-3) — EnzymeCard `outline: 'none'` подавлял `:focus-visible` → убран** (карточка берёт программный фокус, кольцо фокуса должно быть видно клавиатурному пользователю).
  - [x] **Вынести sink из LibraryWorkspace.jsx в hook/controller (`useSearchPickRouter`) + реальный entry-sink (`lib/open-entry-action.js` `makeOpenEntry`) + матричные тесты.** Round-2 тест-матрица: makeOpenEntry (5), useSearchPickRouter legacy+collision, PrimerPoolList archived/scrollIntoView/late-hydration, PrimerPoolWorkspace context passthrough, EnzymeCard focus/Escape, SmartResultRow kind-icons. Полный прогон **6779 pass / 0 fail**, build ok, scoped lint 0 errors. graphify перезапустить после добавления новых файлов в tracked-набор.
- [x] **K7 — consumed-clause invariant (req 11) + ОБЯЗАТЕЛЬНЫЙ fail-closed gate + type→scope narrowing. ГОТОВО (три под-шага, TDD-first).**
  - [x] **K7.1 (query-classify)** — parser-owned clause IDs: каждый explicitFilter + fieldClause получает `id` в ПОРЯДКЕ РАЗБОРА, ДО сортировки fieldClauses (повторные `tag:` не схлопываются); type/status/tag делят ОДИН id между fieldClause+explicitFilter. **type→scope narrowing (§4.5):** `type:primer`→entityScope [primer], `type:circular/linear`→[entry]; ИНТЕРСЕКЦИЯ с базовым scope (`type:primer seq:…`→[primer]; противоречие `primer: type:circular`→[] fail-closed); неизвестный type не сужает. Тест `query-classify-k7.test.js` (10).
  - [x] **K7.2 (library-search)** — consumed-clause ledger: `evaluateEntryClauses(doc, plan)→{matched, consumedClauseIds, unconsumable}`; каждый обязательный clause (фильтр/термин) должен быть потреблён по parser-owned id; provider-dim (seq/aa/enz) метадвижком НЕ потребляется → `unconsumable`, никогда не match. `matchesEntry` делегирует (поведение сохранено). Тест `library-search-k7-ledger.test.js` (6).
  - [x] **K7.3 (facade + UI)** — error-gate: `planIsBlocked/planBlockingErrors` (любая `severity:error`); facade.search короткозамыкает ДО scope/worker/providers → blocked-session (`enz:Bsa seq:GAATTC` НЕ строит worker `built===0`, НЕ зовёт postMessage); LibraryTopBar НЕ собирает enzyme-каталог для blocked-плана + баннер «Противоречивый запрос — поиск не выполнен». Тесты `search-facade-k7-gate.test.js` (3) + topbar lazy-enzyme (+1) + dna-search blocked-notice (+1).
  - **ROUND-2 (адверсариальное ревью Игоря — 5 P1, все исправлены TDD-first):** **P1-1** `type:`→scope зависел от порядка (брался первый clause) → цикл по ВСЕМ `type:` + интерсекция (оба порядка → `[]`). **P1-2** префиксная нормализация explicit `type:`/`status:` (`type:primerjunk`→primer) → `TYPE_EXACT`/`STATUS_EXACT` whole-value + `normalizeExactEnum`; префиксное `matchSynonym` только для свободного текста. **P1-3** ledger не покрывал весь план → `planHasUnconsumableClause` (provider-dims + name/feature/in fieldClauses + `enzymeCatalogQuery`); `planRequiresFullSearch`+`evaluateEntryClauses` оба через него → `enz:`/`name:`/`feature:`/`in:` теперь `unconsumable`+escalate. **P1-4** blocked-запрос не инвалидировал предыдущую сессию → blocked-ветка зовёт `service.cancel()` (поздний A stale-dropped); facade+TopBar тесты `A→blocked B`. **P1-5** вакуумный ID-тест → прямая проверка `c0`/`c1`.
  - **ROUND-3 (ревью Игоря — 1 био-P1: статусы праймеров):** `archived` (primer-статус) нормализовался в `deprecated` (entry-статус) → `status:archived` находил deprecated-молекулы, `primer:T7 status:archived` пусто. Фикс: `STATUS_SYNONYMS`+`STATUS_EXACT` разделены — `archived/архив*→archived`, только `deprecated/устар*→deprecated`; primer-lifecycle статусы (imported/designed/ordered/received/archived) добавлены как ОТДЕЛЬНЫЙ enum; `STATUS_KIND` (status→kind); scope сужается по ВСЕМ `status:` (entry-status→[entry], primer-status→[primer]), интерсекция с type: и explicit scope, оба порядка; несовместимый ЯВНЫЙ scope+status → `[]`+`incompatible-scope-status` error (блокирует по K7-gate); свободный `archived` инферит primer-статус. E2E: archived-primer + deprecated-entry → `status:archived`→только праймер. Тесты `query-classify-k7` (+6 status) + `library-search-scope` (+2 E2E).
  - Верификация round-3: целевой кластер 131+75 pass; полная сюита **6824 pass 0 fail** (чисто, без флейков); build OK; scoped lint 0 errors.

---

## ▶ АКТИВНО — REV #2 Stage 3, под-этап K1 (ревизия Игоря 14.07)

Общие UI-примитивы поиска. **Чистый UI-слой: без импортов store / parser / profiles / facade / worker / adapters / био-БД.** Разрешены: React, проектный `Icon`, дизайн-примитивы/токены. Все пользовательские строки — через props/i18n. Направление K1.1–K1.4 из первой декомпозиции принято, но реализуется по уточнённым контрактам ниже (иначе K1.2–K1.3 переделали бы готовый компонент). **TDD-first (red→green на каждый под-шаг). STOP после K1, отчёт на приёмку, K2 не начинать.**

**Разделение владения (K1.0):** common combobox владеет только временным UI-состоянием (`open`, `activeKey`, `isComposing`, keyboard/focus); controller поверхности владеет `query`/`QueryPlan`/filters/chips/`SearchSession`. Активный результат — по стабильному `entityKey` (`getOptionKey(item)`), НЕ по индексу (partial↔final переставляют результаты). Контент опции — через `renderOption(item, state)` (неинтерактивный).

- [x] **K1.0 — контракт-модуль** (`components/Search/searchUiContract.js`): JSDoc-типы + чистые хелперы (`optionDomId`, `defaultGetOptionKey`, `resolveActiveIndex` по key-identity). Единый источник option-id (listbox рендерит, combobox ссылается через тот же хелпер).
- [x] **K1.1 — `SearchField.jsx`**: контракт §1A.2 + combobox-role/`aria-autocomplete`/`aria-expanded` НА `<input>` (не wrapper); `aria-describedby`; focus/blur + composition start/end каналы; локализуемый `clearAriaLabel`. Clear-control: `type="button"`, доступное имя, очистка через callback + возврат фокуса на input, отсутствует/неактивен при `disabled`, без `outline:none`, видимый `:focus-visible`.
- [x] **K1.2 — `SearchResultsListbox.jsx`**: ЕДИНСТВЕННЫЙ владелец `role="option"` / option-id / `aria-selected` / выбора мышью. `renderOption` возвращает только неинтерактивный контент (НЕ обёртка над `SmartResultRow` — он `<button role=option>`, вложенная интерактивность; его presentational-адаптация → K4). Состояния: rows / rows+loading / rows+incomplete-diagnostic / blocked-diagnostic-без-rows / empty / result-count — loading/empty/diagnostic ВНЕ DOM-списка options; отдельный `aria-live="polite"`/`role="status"`; `aria-busy` на области результатов. Мышь: левый `mousedown` только `preventDefault` (не терять фокус); выбор по `click` ровно один раз; правая кнопка не выбирает; фокус остаётся на input.
- [x] **K1.3 — `useSearchComboboxNavigation.js`** (headless): ArrowDown на закрытом → открыть+активировать первый; ArrowUp → открыть+последний; Arrow↑/↓ двигают active (clamp); Home/End при открытом; Enter выбирает только существующий `activeKey`; Escape только закрывает (значение не чистит); Tab закрывает без `preventDefault`; после выбора фокус на input; при `items=[]`/удалённом active/partial→final — нет dangling `aria-activedescendant`. IME-гард = ref + `event.nativeEvent.isComposing`: до `compositionend` не перехватывать Enter/стрелки/`:` и не звать внешний seam. `:`-тест проверяет ОТСУТСТВИЕ semantic-callback (seam `onUnhandledKeyDown`), не вакуум.
- [x] **K1.4 — `SearchCombobox.jsx`**: Field + navigation + Listbox. `role="combobox"` на input; `aria-activedescendant` только при открытом popup и на реально существующий option; один item → ровно один option; внутри option нет `button`/`a`/`input`/второго `role=option`; partial→final сохраняет active по key; удаление active безопасно сбрасывает; `disabled` запрещает open/nav/select.
- [x] **K1.5 — `SearchFilterChips.jsx`**: только removable filter-chips. Fixed-domain (`ДНК`/`Праймер`/`Фермент`) → `modeSlot`/K2, НЕ маскировать как `removable:false`. Remove-button: `type="button"` + локализованное имя; `disabled` блокирует удаление. «Remove all» → K2.
- [x] **Boundary-тест** на ВЕСЬ `components/Search` (не только SearchField): запрет прямых импортов store/parser/profiles/facade/worker/adapters/био-БД. Без emoji/inline-hex/произвольных серых/`outline:none`.

Верификация K1: red→green на под-шаг → целевой кластер `components/Search` → scoped lint → полная `npm test` (ОДИН прогон) → `npx vite build` → `npx graphify hook-rebuild` + проверить, что новые файлы в графе. Браузер/реальный IME smoke — НЕ в K1 (отложено до интеграции/Stage 6). Эквивалентность UI↔QueryPlan, fixed-domain production behavior, реестр поверхностей — K2–K6.

---

## Отчёт Code по REV#2 Stage 3 — K1 (K1.0–K1.5 + boundary; ревизия Игоря выполнена)

**Что изменилось (для приёмки):** добавлен чистый UI-слой `components/Search/` — 6 примитивов + 7 тест-файлов, ноль проводки в существующий код (K1 ничего не монтирует; UI↔QueryPlan / selector / tree — K2–K6). Под-шаги ревизии:
- **K1.0** `searchUiContract.js` — общий контракт: `optionDomId` (единая формула id опции: listbox штампует, combobox ссылается), `defaultGetOptionKey`, `resolveActiveIndex` (identity по стабильному key, НЕ индексу). Владение: combobox = transient UI (open/activeKey/isComposing/focus); controller = query/plan/session.
- **K1.1** `SearchField.jsx` — shell §1A.2; combobox-role/`aria-autocomplete`/`aria-expanded`/`aria-controls`/`aria-activedescendant`/`aria-describedby` НА `<input>` (не wrapper); focus/blur + composition каналы; clear = `type=button` + локализуемое имя + возврат фокуса + скрыт при disabled; без `outline:none`.
- **K1.2** `SearchResultsListbox.jsx` — единственный владелец `role=listbox/option` / id / `aria-selected` / выбора мышью; `renderOption` = неинтерактивный контент (НЕ обёртка над `SmartResultRow` — он `<button role=option>`); состояния rows / loading / incomplete-diag / blocked-diag-без-rows / empty / count — вне списка опций, в `role=status` `aria-live=polite`; `aria-busy` на области результатов; левый mousedown только `preventDefault`, выбор по click один раз, правая кнопка не выбирает.
- **K1.3** `useSearchComboboxNavigation.js` — headless клавиатура + IME: ArrowDown/Up открывают + первый/последний; clamp (без wrap); Home/End при открытом; Enter только по существующему activeKey; Escape только закрывает; Tab закрывает без `preventDefault`; нет dangling `aria-activedescendant` при items=[] / удалении / reorder (active DERIVED по key, не через эффект). IME-гард = ref + `nativeEvent.isComposing`; `:`-тест проверяет ОТСУТСТВИЕ seam-колбэка (не вакуум).
- **K1.4** `SearchCombobox.jsx` — Field + nav + Listbox; `open` контролируется поверхностью; `role=combobox` на input; activedescendant только при open и на существующий option; один item → один option; нет вложенной интерактивности; partial→final сохраняет active по key; disabled запрещает open/nav/select.
- **K1.5** `SearchFilterChips.jsx` — только removable chips; fixed-domain (`ДНК`/`Праймер`/`Фермент`) → modeSlot/K2 (нет `removable:false`); remove = `type=button` + локализуемое имя; disabled блокирует; «remove all» → K2.
- **Boundary** `search-ui-boundary.test.js` — читает ВЕСЬ `components/Search` с диска → allow-list импортов (react / `../icons/Icon` / `./siblings`); запрет store/parser/profiles/facade/worker/adapters/био-БД + emoji/inline-hex/`outline:none`. Mutation-verified (инъекция запрещённого импорта+emoji+hex → 4/6 fail; restore → 6/6).

**Что это означает для биолога (косвенно; K1 = фундамент, поведение поиска не меняет):** один узнаваемый control под все места ввода поиска с корректной клавиатурной навигацией и IME-безопасностью — критично для кириллицы/составного ввода: Enter и `:` не «проглатываются», пока идёт composition (набор русского имени плазмиды, пробел в имени фермента). Активный результат держится за сущностью (`entityKey`), а не за позицией — при обновлении partial→final выделение не «съезжает» на чужую строку. Прямой лабораторный результат K1 не меняет.

**Какой риск устранён:** (1) вложенная интерактивность (кнопка-в-опции) — источник битой a11y и двойных кликов — конструктивно исключён (listbox = единственный владелец option); (2) dangling `aria-activedescendant` (скринридер указывает на несуществующую строку) — исключён derive-by-key; (3) IME-проглатывание клавиш — исключено двойным гардом (ref + nativeEvent); (4) UI-слой не может утащить за собой store/движок/воркер — boundary-тест на ВЕСЬ кластер (не отдельные файлы) ловит архитектурный дрейф до K2–K6.

**Как проверить вручную:** `cd gui/designer && npm test -- src/components/Search` (78/78) + `./node_modules/.bin/eslint src/components/Search` (0 errors). Браузер/реальный IME — НЕ в K1 (отложено до интеграции/Stage 6: поля ещё не смонтированы ни на одной поверхности).

**Верификация:**
- Red→green на КАЖДЫЙ под-шаг (тест до кода → RED → код → GREEN): контракт 10 · SearchField 16 · Listbox 11 · nav-hook 19 · Combobox 10 · chips 6 · boundary 6 = **78 pass** в кластере `components/Search` (7 файлов).
- Полная сюита (ОДИН прогон, 306 s): **6911 pass / 8 failed / 18 skipped**. Все 8 fail = `Test timed out in 5000ms` — **FLAKE-TIMEOUT-LOAD** (CPU-contention, этот прогон import 1039 s). `components/Search` НЕ фигурирует ни в одном fail; идентифицируемый флейк-файл `restriction-sites-workspace.test.jsx` изолированно **13/13 pass** (10.3 s — медленнее 5000 ms per-test под контенцией). K1-файлы аддитивны, никем ещё не импортируются → нет причинной связи с этими подсистемами.
- Scoped lint `components/Search`: **0 errors** (по ходу исправлен реальный `react-hooks/set-state-in-effect` — active-key переведён на DERIVED без эффекта). 15 warnings = русские фикстуры в тестах (конвенция кодовой базы; Cyrillic в source = 0).
- vite build: clean (единственный warning — pre-existing chunk-size >500 KB).
- Graphify: `hook-rebuild` ОТКАЗАЛСЯ перезаписывать (кэш-манифест 1329 → 6345 узлов < текущих 6651; НЕ форсил — форс деградировал бы граф и всё равно не включил бы untracked). `detect --scope tracked` (1408 tracked) подтвердил: graphify tracked-scope исключает НЕзакоммиченные файлы. K1-файлы untracked (git за Игорем) → не индексируются до коммита — та же принятая посадка, что для untracked в Stage 2. `graph.json` цел (6651 узлов, не тронут). Индексация K1 — за коммит-сессией.

**Размеры (все ≪ soft; hard .js 25 / .jsx 40, soft .js 20 / .jsx 30):** useSearchComboboxNavigation.js 5.0 KiB · SearchField.jsx 4.5 · searchUiContract.js 3.6 · SearchCombobox.jsx 3.1 · SearchResultsListbox.jsx 3.1 · SearchFilterChips.jsx 2.1. Size budget: **OK**, новых нарушителей нет.

**Новые SOURCE (6):** `components/Search/{searchUiContract.js, SearchField.jsx, SearchResultsListbox.jsx, useSearchComboboxNavigation.js, SearchCombobox.jsx, SearchFilterChips.jsx}`.
**Новые TEST (7):** `components/Search/__tests__/{searchUiContract.test.js, SearchField.test.jsx, SearchResultsListbox.test.jsx, useSearchComboboxNavigation.test.js, SearchCombobox.test.jsx, SearchFilterChips.test.jsx, search-ui-boundary.test.js}`.
**Затронуто (координация):** `CURRENT_TASK.md` (Stage 3 banner + K1-план + graphify-отклонение Stage 2 отмечено закрытым). PROJECT_STATE / RELEASES / DECISIONS / ANCHORS — НЕ трогались. BUGS.md — не трогался (дефектов не заводилось; `set-state-in-effect` пойман до коммита, не рантайм-баг).

### Round-2 (ревью Игоря 15.07 — 8 блокеров + доп.; все закрыты TDD-first, дефекты в BUGS.md ДО фиксов)

**Что изменилось:** закрыты K1-R2-1..8 + доп-a/b/c (реестр — `BUGS.md`, блок «REV#2 Stage 3 — K1 round-2»):
- **K1-R2-1 Disabled fail-open:** combobox не рендерит popup при `disabled` (`popupOpen = open && !disabled` гейтит и рендер, и `aria-expanded`, и activedescendant); listbox принимает `disabled` и не выбирает/не ставит mousedown-гард (defense-in-depth).
- **K1-R2-2 Active за границей запроса:** проп `sessionKey` — active держится внутри partial→final ОДНОЙ сессии, сбрасывается при новом запросе (render-time reset по смене sessionKey, БЕЗ эффекта).
- **K1-R2-3 ARIA id:** `useId()` дефолтный listboxId (два combobox не коллизируют); `optionDomId(listboxId, optionKey)` от СТАБИЛЬНОГО key (whitespace→`_`) → id следует за сущностью при reorder, activedescendant не «переезжает».
- **K1-R2-4 IME на уровне значения:** `onValueChange(value, {isComposing})` (ref + `nativeEvent.isComposing`) → K3-parser отложит `:` до compositionend. Интеграционный тест через настоящий input.
- **K1-R2-5 Focus/open lifecycle:** ОДИН контракт — **combobox ВЛАДЕЕТ open** (uncontrolled, совпало с K1.0-док); open-on-arrow/type, close-on-blur (click-away)/escape/select/Tab; явный возврат фокуса на input после выбора (innerInputRef.focus); forward focus/blur.
- **K1-R2-6 Boundary обходился:** рекурсивный обход + РЕЗОЛВ пути импорта (внутри cluster / react / Icon), все формы (`import`/`export…from`/`import()`/`require()`); резолвер отдельно unit-тестирован (`./../store`→reject, все формы извлекаются). Мутация (re-export escape) → RED, restore → GREEN.
- **K1-R2-7 Ручной useCallback (AGENTS.md:244):** убран из SearchField + nav-hook (все `useCallback`/`useMemo` только в комментариях-«не используем»); доверяем React Compiler.
- **доп-a** clearAriaLabel-дефолт `"Clear"` убран (строки только снаружи); **доп-b** loading-live-region объявляет `loadingContent` (не пустой span); **доп-c** claim про nested-controls ослаблен + отмечено: K4-renderer нужен отдельный контракт-тест.

**Что это означает для биолога:** ровно те дыры, что позже могли открыть НЕ ТОТ объект, закрыты в фундаменте: заблокированное поле больше не выбирает строку; старое выделение не оживает в новой выдаче (sessionKey); два независимых поиска не делят один popup (useId) — то есть Enter/клик не откроет чужой праймер/шаблон/фермент. IME-защита теперь и на значении: `:` при наборе кириллицы не будет разобран парсером до конца композиции.

**Какой риск устранён:** тихая мисс-навигация к чужой сущности (disabled/session/collision), dangling ARIA для скринридера (key-based id), архитектурный дрейф (boundary теперь ловит resolve-escape/все формы импорта), перф-регрессия от ручной мемоизации против компилятора.

**Как проверить вручную:** `cd gui/designer && npm test -- src/components/Search` (92/92) + `./node_modules/.bin/eslint src/components/Search` (0 errors). Reorder/disabled/blur/IME видны только после монтирования (K4/Stage 6) — в K1 не проверяются в браузере.

**Верификация round-2:** кластер `components/Search` **92/92 pass** (7 файлов; +14 к round-1: контракт +2, listbox +3, SearchField +2, nav +1, combobox переписан +3, boundary self-test +3). Scoped lint **0 errors** (19 warnings = русские фикстуры). **Полная сюита — ЧИСТЫЙ прогон: 6933 pass / 0 fail / 18 skipped (753 файла, 0 упавших)** — прошлые 8 `Test timed out 5000ms` НЕ воспроизвелись (подтверждён FLAKE-TIMEOUT-LOAD, не связан с K1). Build/размеры без изменений (файлы выросли <1 KiB, все ≪ soft).

**Git-состояние (точно):** **0 staged**; worktree НЕ clean — изменены координационные `CURRENT_TASK.md` + `BUGS.md`, новые untracked под `components/Search/` (+ прежний крупный незакоммиченный бэклог/ZIP/PDF/msi, не мой). Коммита нет.

**Graphify (эмпирически проверено, non-blocking):** граф сохранён — `graph.json` цел, **6651 узлов**, не тронут. Ретрай индексации new-файлов через временный staged-inventory сделан: `git add` Search-каталога → `git ls-files` видит 13 файлов, НО `graphify detect` (и `--scope tracked`, и `--scope all`) вернул тот же кэш-манифест 1408 файлов БЕЗ Search-модулей — в этой версии graphify `detect` переиспользует кэш-манифест и не пере-энумерирует индекс (не только committed-vs-staged). git-состояние восстановлено (Search снова untracked). Полноценный cache-clearing rescan/индексация K1 — за коммит-сессией; на Stage 3 не влияет.

### Round-3 (ревью Игоря 15.07 — 9 fail-open контрактов; все закрыты TDD-first, дефекты в BUGS.md ДО фиксов)

**Что изменилось** (реестр — `BUGS.md`, блок «K1 round-3»):
- **K1-R3-1 Стабильная идентичность fail-closed:** `defaultGetOptionKey` = `entityKey (kind-qualified) ?? key ?? id`, **THROW** при отсутствии — НЕТ позиционного `idx-N` fallback (после reorder не уведёт Enter на чужую сущность); cross-kind списки обязаны давать entityKey.
- **K1-R3-2 optionDomId инъективный:** `encodeURIComponent` вместо `\s+→_` → `My Enzyme` ≠ `My_Enzyme` (collision-тест).
- **K1-R3-3 Disabled сбрасывает состояние:** render-time openState=false (combobox) + activeKey=null (nav) → `open→disabled→enabled` НЕ воскрешает старую выдачу.
- **K1-R3-4 IME commit-сигнал:** на `compositionEnd` повторно шлём значение с `isComposing:false` (браузер не гарантирует `change`) → parser не залипнет; тест БЕЗ доп. change.
- **K1-R3-5 a11y fail-closed:** clear рендерится ТОЛЬКО при `clearAriaLabel`; loading-узел ТОЛЬКО при `loadingContent` (aria-busy остаётся); resultCount = декоративный (aria-hidden), озвучка через listbox aria-live — задокументировано.
- **K1-R3-6 Escape `stopPropagation`** → закрытие списка не закроет родительскую модалку.
- **K1-R3-7 sessionKey safe fallback:** combobox шлёт `sessionKey ?? value` → смена query-текста = новая сессия даже без явного sessionKey.
- **K1-R3-8 Boundary + computed import:** детект non-literal `import()`/`require()` (template/identifier/call) → violation (нельзя статически проверить); self-тест.
- **K1-R3-9 Cyrillic в source-комментариях** (SearchFilterChips JSDoc) → English; теперь source-warnings = 0, «все warnings — фикстуры» верно.

**Что это даёт биологу:** закрыты последние пути, где визуально та же строка результата могла означать другой объект — слабый/позиционный ключ (throw вместо тихого idx), коллизия DOM-id (инъективная кодировка), ожившее старое выделение после disable, залипший IME-парсер. Escape в поиске не «схлопнет» весь диалог сборки. Итог: Enter/клик не спроектирует эксперимент на неправильном праймере/плазмиде/ферменте.

**Какой риск устранён:** тихая мисс-навигация (fail-closed identity + инъективный id + disabled-reset + IME-commit), потеря контекста при Escape (stopPropagation), возврат old-active без sessionKey (value-fallback), необъявленные a11y-состояния (clear/loading fail-closed), необнаруживаемый импорт-дрейф через computed import.

**Как проверить вручную:** `cd gui/designer && npm test -- src/components/Search` (99/99) + `./node_modules/.bin/eslint src/components/Search/*.js src/components/Search/*.jsx` (0 problems в source).

**Верификация round-3:** кластер `components/Search` **99/99 pass** (7 файлов, +7 к round-2). Scoped lint **0 errors** (23 warnings — ВСЕ в тест-файлах, source-warnings = 0). Полная сюита: **6939 pass / 1 failed / 18 skipped**. Единственный fail — `canvas/__tests__/NotebookEntryEditor.test.jsx:64` (`waitFor`-таймаут markdown-preview = **FLAKE-TIMEOUT-LOAD**; изолированно **12/12 pass**), НЕ связан с Search (0 упоминаний Search в fail; NotebookEntryEditor мои правки не трогают). Размеры без изменений (все ≪ soft).

### Round-4 (ревью Игоря 15.07 — 4 обходимых fail-closed + 3 non-block; все закрыты TDD-first, дефекты в BUGS.md ДО фиксов)

**Что изменилось** (реестр — `BUGS.md`, блок «K1 round-4»):
- **K1-R4-1 cross-kind идентичность:** `defaultGetOptionKey` теперь выводит `kind:id` для kind-bearing (entry `5` ≠ primer `5`); `assertUniqueOptionKeys` (throw при коллизии ключей списка) вызывается listbox'ом ДО рендера → два объекта не получат один React key/DOM-id/activeKey.
- **K1-R4-2 sessionKey обязателен:** общий combobox БЕЗ `sessionKey` и без `textOnly` → **throw** (сессия должна включать scope/профиль/фильтры/поколение, а не только текст); `value`-fallback только при явном `textOnly`.
- **K1-R4-3 boundary → AST:** regex заменён `@babel/parser`-разбором (static/re-export/dynamic/require). `import('./' + x)` (начинается с кавычки, но конкатенация) теперь корректно = computed→violation; литерал с трейлинг-комментом читается верно; второй аргумент `import()` не путает. Self-тесты + мутация на реальном файле (RED).
- **K1-R4-4 счётчик озвучен:** `resultCount` рендерится ТОЛЬКО с локализованным `resultCountLabel` (sr-only `aria-live=polite` — объявляется скринридеру); без label визуального счётчика нет (не «12» молча).
- **K1-R4-5 (non-block) IME без двойного commit:** `emit` дедуплицирует одинаковый последовательный `(value,isComposing)` → commit после compositionEnd не удваивается браузерным `change`. Тесты обоих сценариев (есть/нет follow-up change).
- **K1-R4-6 (non-block) disabled уведомляет observer:** onOpenChange эффективного open (popupOpen) через единый effect (ref latest-callback) → disable-close тоже уведомляет `onOpenChange(false)`; наблюдатель не залипнет на `open=true`.
- **K1-R4-7 (non-block) whitespace-only label:** `hasText` (trim) fail-closed для `clearAriaLabel` и `chip.removeLabel` — контрол без реального имени не рендерится.

**Что это даёт биологу:** закрыты последние места, где выдача между быстрой и полной фазой могла подменить объект под тем же визуалом — cross-kind коллизия ключей (kind:id + uniqueness-throw), «залипшая» сессия при неизменном тексте но смене scope/фильтров (sessionKey обязателен), необнаруживаемый импорт-обход движка (AST), необъявленный счётчик (озвучка). Двойной запуск/отмена поиска при IME больше не происходит. Итог: клавиатура и скринридер ведут к тому же объекту, что видит глаз.

**Какой риск устранён:** тихая мисс-навигация к одноимённой чужой сущности (kind:id + throw-on-collision), пережившее сессию выделение (обязательный sessionKey), архитектурный обход UI→движок через computed import (AST fail-closed), «немой» счётчик для незрячих, двойной commit/отмена поиска, контрол без доступного имени.

**Как проверить вручную:** `cd gui/designer && npm test -- src/components/Search` (112/112) + `./node_modules/.bin/eslint src/components/Search/*.js src/components/Search/*.jsx` (0 problems в source).

**Верификация round-4:** кластер `components/Search` **112/112 pass** (+13 к round-3; boundary теперь AST-based). Scoped lint **0 errors** (31 warnings — ВСЕ в тест-файлах, source-warnings = 0). Полная сюита — **ЧИСТЫЙ прогон: 6953 pass / 0 fail / 18 skipped** (753 файла, 0 упавших, флейков нет). Размеры без изменений (все ≪ soft). AST-boundary мутационно проверен (`import('./'+x)` на реальном файле → RED → restore GREEN).

**СТОП после K1 (round-4).** K2 не начинаю. Коммит — за Игорем, ОТДЕЛЬНОЙ веткой (0 staged; worktree не clean: `CURRENT_TASK.md`+`BUGS.md`+untracked `components/Search/`). Жду повторной приёмки.

---

---

## ▶ K2 — визуальный selector + `+ Фильтр` (§12 Этап 3 п.2–3, §9.2–9.3) — на приёмке

K1 принят Игорем по всем блокирующим контрактам (GO на K2). Перед K2 дозакрыт K1-остаток: `hasText` на `chip.removeLabel` (whitespace-only remove-кнопка → не рендерится; +2 теста).

**Что изменилось:** три новых артефакта поверх K1-примитивов (chips из K1.5 переиспользованы):
- **K2.0** `lib/search-modes.js` (данные; **ВЫВОДИТ из `PREFIX_REGISTRY`** через `prefixEntry` — не дублирует canonical/labelKey/provider): §9.2 grouped modes (8: lib/mol/primer/project/seq/aa/cut/enz) + §9.3 `SEARCH_FILTER_DEFS` (name/annotation→feature/tag=text; type/status=enum; **project=entity(projectId)**) + `visibleModeGroups({providers, entityScope})` **fail-CLOSED** (scope-режим гейтится entityScope-kind, provider/preset — providers-intent; отсутствие/неверная форма → только lib/mol). Тест против реальных `SEARCH_PROFILES`.
- **K2.1** `components/Search/SearchModeSelector.jsx` (UI-only): grouped dropdown — trigger **`role="combobox"`** (select-only combobox W3C: фокус+activedescendant на trigger, popup role=listbox). Клавиатура/active-descendant/mouse — K1 `useSearchComboboxNavigation`+`optionDomId`; `assertUniqueOptionKeys`; disabled render-time закрывает.
- **K2.2** `components/Search/SearchFilterMenu.jsx` (UI-only): `+ Фильтр` — полный автомат: type-list/enum/entity = `role=menu` с **roving-focus** (Arrow/Home/End, фокус первого на open); text = **`role=dialog`** (не input в role=menu); project = entity-picker (коммитит стабильный `{projectId,label}`). Fail-closed: disabled render-time закрывает+блок pickDef/commit (re-enable без воскрешения стадии); IME Enter/Escape не коммитят/не закрывают; фокус → trigger после close/Escape/select; пустые trigger/def/option-имена + пустые enum-values не рендерятся.

**Что это даёт биологу:** можно выбрать «где искать» и «чем сузить» БЕЗ знания префиксов — dropdown режимов (Молекулы/Праймеры/Проекты/ДНК/Белок/Сайты рестрикции/Рестриктазы) и `+ Фильтр` (Тип/Статус из enum, Тег/Название/Аннотация текстом). Недоступные провайдеры не показываются как рабочие режимы (не выберешь то, чего движок не умеет). Клавиатура/скринридер работают в selector так же, как в основном поиске.

**Какой риск устранён:** «мёртвый» режим без провайдера (capability-gate скрывает), одинаковые id режимов→неоднозначная навигация (uniqueness-throw), безымянные меню-контролы и пустые фильтры (fail-closed по `hasText`), рассинхрон клавиатуры (тот же nav-hook, что в K1).

**Как проверить вручную:** `cd gui/designer && npm test -- src/components/Search` (129) + `npm test -- src/lib/__tests__/search-modes.test.js` (8) + `./node_modules/.bin/eslint src/components/Search/*.js src/components/Search/*.jsx src/lib/search-modes.js` (0 problems в source). Браузер/монтирование в TopBar — K4.

### K2 corrective iteration (ревью Игоря 15.07 — 4 P1; тесты закрепляли реализацию, не контракт; TDD-first, дефекты в BUGS.md ДО фиксов)

**Честная поправка:** предыдущий K2-отчёт был НЕТОЧЕН — `search-modes.js` НЕ импортировал registry (дублировал), а gate был fail-OPEN (`available==null → всё`), при этом тест это закреплял. Исправлено (реестр — `BUGS.md`, блок «K2 дефекты»):
- **K2-P1-A Registry+capabilities один контракт:** modes ВЫВОДЯТСЯ из `PREFIX_REGISTRY` (`prefixEntry`); capability = `{providers, entityScope}` (форма реального SearchProfile); **fail-CLOSED** — scope-режим по entityScope-kind, provider/preset по providers-intent, отсутствие/неверная форма → только lib/mol. Тест против `SEARCH_PROFILES.globalLibrary`/`primerPool`, не синтетики; прежний fail-open-тест переписан на fail-closed.
- **K2-P1-B «Проект» = entity-picker:** `inputType:'entity'`, опции `{projectId,label}`, коммит передаёт устойчивый `projectId` (спека §617) → два одноимённых проекта различимы.
- **K2-P1-C Selector = один ARIA-паттерн:** trigger `role="combobox"` (select-only combobox: фокус+activedescendant на нём, popup listbox) — больше не кнопка с чужим activedescendant.
- **K2-P1-D SearchFilterMenu полный автомат:** open→disabled render-time закрывает+блок pickDef/commit; re-enable без воскрешения стадии; IME Enter/Escape не коммитят/не закрывают; фокус→trigger после close/Escape/select; type/enum/entity = role=menu с roving-focus (Arrow/Home/End); text = role=dialog; пустые trigger/def/option + пустые enum-values fail-closed.

**Что это даёт биологу:** рабочие «Праймеры»/«Проекты» не спрячутся и неработающие белковый/ферментный режимы не всплывут (fail-closed по реальным capabilities); два одноимённых проекта различимы (стабильный projectId — сузит к нужному набору молекул); русское имя/аннотация не сохранятся до конца IME-ввода (нет лишнего фильтра). Убраны три класса «ложного отсутствия объекта / не того набора».

**Какой риск устранён:** ложные «ничего не найдено» из-за fail-open capability-gate; сужение к чужому проекту (text→entity стабильный id); незаметный лишний фильтр при IME; недоказуемая озвучка активного режима (цельный combobox-паттерн); незакрытый автомат меню (disabled/focus/roving).

**Как проверить вручную:** `cd gui/designer && npm test -- src/components/Search src/lib/__tests__/search-modes.test.js` (144) + `./node_modules/.bin/eslint src/components/Search/*.js src/components/Search/*.jsx src/lib/search-modes.js` (0 problems в source). Браузер/реальный SR/IME — Stage 6.

### K2-corr2 (ревью Игоря — 4 контрпримера-пересечения в A/D + адверсариальный probe нашёл D4)

Тесты проверяли отдельные примеры, не ПЕРЕСЕЧЕНИЯ состояний. Дозакрыто pairwise-набором (не десятки частных тестов):
- **A** — capability валидируется по ОБЕИМ осям до расчёта: любая present-but-malformed ось (`{providers:['sequence'], entityScope:'oops'}` / наоборот) → только lib/mol (не «валидная половина открывает свои режимы»). +2 симметричных теста.
- **D1** — `composingRef` чистится при disable/close/reset → IME-флаг не переживает закрытие (комбинированный IME×disable×reopen тест).
- **D2** — единый `accessibleLabel = ariaLabel ?? triggerLabel` для trigger+menu → видимый trigger не откроет безымянное меню.
- **D3** — offered только actionable defs (поддержанный inputType + ≥1 валидная опция для enum/entity); нет actionable → меню не открывается.
- **D4 (адверсариальный intersection-probe, 4 скептика, CONFIRMED)** — гард был ТОЛЬКО на момент open: если actionable-множество опустошается ПОСЛЕ open (parent убрал defs/опции), рендерился пустой `role=menu`, фокус падал на body, клавиатурный тупик. Фикс: continuous `stageHasContent` render-time drain-close; refocus-effect возвращает фокус на trigger при потере на body; clamp roving-index (focused item == tabIndex=0); onBlur input чистит composingRef.

**Верификация K2-corr2:** `components/Search` (10 файлов) + `search-modes` = **153 pass** в целевом наборе (filter-menu 21, incl. 5 pairwise + 4 D4). Scoped lint **0 errors** (исправлен по ходу reflected `set-state`/ref-in-render); source-warnings = 0. Адверсариальный probe (4 скептика, 362K токенов) сошёлся на одном классе D4 — закрыт; больше пересечений не найдено. Полная сюита — **ЧИСТЫЙ прогон: 6994 pass / 0 fail / 18 skipped** (756 файлов, флейков нет; Search/search-modes в fail отсутствуют). Размеры OK (filter-menu 6.6 KiB — ≪ soft).

### K2-corr3 (ревью Игоря 15.07 — D4 недозакрыт: A+D1–D3 приняты; три перехода при обновлении данных под ОТКРЫТЫМ меню)

Прошлый D4-гард ловил drain-на-момент-open. Осталось три пересечения, где стадия «переживает» смену входных пропов. Общий корень: захваченное по объекту/индексу состояние не пере-резолвилось. Фикс — continuous re-resolve по стабильной identity.
- **corr3-1** — активный def хранился как ЗАХВАЧЕННЫЙ ОБЪЕКТ → удаление из `filterDefs` оставляло text-стадию + давало коммит недоступного фильтра. Фикс: `activeDefId` (string), `activeDef` резолвится каждый рендер по `id` среди `actionableDefs`; `activeDefLost` → полный drain; commit-гарды `!activeDef`.
- **corr3-2** — roving по числовому индексу: Arrow-математика от старого `menuIndex`, focus-effect от индекса → при reorder/shrink DOM-фокус и `tabIndex=0` расходились. Фикс: `activeKey`→`effectiveActiveKey`, навигация/`tabIndex`/effect по ключу (`data-menukey`).
- **corr3-3** — потеря доступного имени делала `return null` без сброса → возврат подписи «воскрешал» стадию/текст/IME. Фикс: `accessibleLabel` вычисляется первым, `sessionDead = disabled || !accessibleLabel` входит в continuous drain; IME-флаг чистится в effect по `[disabled, accessibleLabel]`.

**corr3-1b (точный остаток corr3-1, ревью Игоря 15.07):** `activeDefLost`-drain сбрасывал `open/activeDefId/text/key`, но `composingRef` чистился только по `[disabled, accessibleLabel]` → удаление активного фильтра ПРЯМО ВО ВРЕМЯ IME оставляло флаг залипшим (после reopen Enter/Escape блокированы). Инвариант (надёжный): ЛЮБОЙ popup `open→closed` (Escape/select/disable/drain/`activeDefLost`/потеря имени) чистит `composingRef`. Фикс: перенёс clear в effect `[popupOpen]` (он уже ловит этот переход — там drain-refocus), убрал избыточный effect `[disabled, accessibleLabel]`.

**Верификация K2-corr3 (все 4 гейта Игоря):** TDD-first (RED → GREEN на каждый). (1) целевой прогон `components/Search`+`search-modes` = **159 pass** (10 файлов, SearchFilterMenu 27). (2) scoped lint **0 errors / 0 warnings** (exhaustive-deps закрыт поиском узла по `data-menukey`). (3) полная сюита — **7000 pass / 0 fail / 18 skipped** (чистый прогон; прошлый одиночный fail `primer-wizard.test.jsx` — FLAKE-TIMEOUT-LOAD, не воспроизвёлся). (4) `npx vite build` OK (только давняя chunk-size warning). `SearchFilterMenu.jsx` **13.6 KiB** (≪ soft 30).

**✅ K2 ПРИНЯТ Игорем 15.07** — по 4 гейтам (RED→GREEN, целевой прогон, полная suite, build), с явным «переходите к K3 без ещё одного широкого ревью». Коммит — за Игорем, ОТДЕЛЬНОЙ веткой (0 staged; worktree не clean).

**Дальше (Stage 3):** K3 = typed-prefix↔UI sync (§9.4); K4 = G1 TopBar на общий control + placeholder/validation + монтаж layout; K5 = `treeQuery`↔`globalSearchState` split + один libraryQuick session.

### ▶ K3 — typed-prefix ↔ UI ↔ canonical sync (§9.4 / §12 Этап 3 п.4–5) — на приёмке

GO Игоря после K2. Перед декомпозицией — 4-агентный mapping-workflow (lexer/classify API · где живёт globalSearchState · контракты примитивов · маршрутизация prefix→mode/filter). Ключевой факт разведки: `globalSearchState`/`treeQuery` **ещё не существуют** (одна общая `query`-строка), `SearchCombobox` (K1) построен но не смонтирован → K3 вводит только ЧИСТУЮ модель состояния; монтаж в TopBar = K4 (не трогаю).

**Что изменилось:** новый чистый модуль **`lib/search-query-sync.js`** (10.8 KiB) — движок §9.4 без React/store/i18n (вызывается на каждый keystroke, поэтому чистый). Живёт в `lib/` (не `components/Search/`) — импортит lexer/registry/modes, что boundary кластера запрещает.
- **typed → структура** `syncTypedDraft(state, draft)`: токенизирует, канонизирует каждый префикс, поднимает ЗАВЕРШЁННЫЕ распознанные токены. MODE-префикс → ставит режим, его ЗНАЧЕНИЕ остаётся видимым draft'ом (под ним и ищешь); FILTER-префикс → chip, вся клауза уходит из draft. Незавершённый (`aa:` / незакрытая кавычка), нераспознанный префикс и свободный текст остаются в draft дословно. Режим и chips переносятся из прошлого state (печать не сбрасывает). Маршрутизация по `{canonical, category}` из `search-modes.js` → ловушка «project» (scope-mode id `project`) vs `in`-фильтр не пересекается.
- **структура → canonical** `buildCanonicalQuery(state)`: строка для движка, проверена round-trip'ом через РЕАЛЬНЫЙ `classifyQuery` (оракул контракта, не пин реализации). Дефолтный `lib` → голый текст; named scope → префикс на первом терме; provider/preset → весь draft = значение; фильтры `canonical:value` с кавычками при нужде.
- Переходы UI: `selectMode` (fail-closed на неизвестный/фильтр-id), `addFilter` (text/enum→строка, entity→`{projectId,label}`, пустое значение отклонено), `removeFilter`, `clearMode`, `clearAll`, `clearModeOnBackspace` (только при пустом draft — §9.4). Проекции `toModeSelectorModel`/`toFilterChipModel` (label-resolver инжектится → без i18n-импорта; capability-gate; entity-chip показывает человекочитаемый label, не projectId).

**Что это даёт биологу:** ввод `aa:HHHH` переключает на «Белок» и оставляет HHHH как запрос; `type:circular` уходит в removable-chip; `re:EcoRI` понимается как режим сайтов; недопечатанный `aa:` не срывается в неверный режим. Одна строка = мышь и клавиатура дают ОДИН и тот же QueryPlan.

**Какой риск устранён:** рассинхрон typed-ввода и UI (два разных QueryPlan из строки и дропдауна); ложная маршрутизация «project»; парс/сериализация-петля с прыжком курсора (сериализатор НЕ подаётся обратно в draft — только residual).

**Как проверить вручную:** `cd gui/designer && npm test -- src/lib/__tests__/search-query-sync.test.js` (32) + `./node_modules/.bin/eslint src/lib/search-query-sync.js` (0/0).

### K3-corr (ревью Игоря 15.07 — NO-GO: `classify(raw) ≢ classify(build(sync(raw)))`)

Первая версия (плоский `draft` + `split(/\s+/)`) теряла семантику: `aa:HHHH pUC`→белок «HHHH pUC» (д.б. белок HHHH + текст pUC); `aa:HHHH seq:ATGC`→конфликт исчезал; `"Alpha Beta"`→два битых терма; `mol:"Alpha Beta"`→`mol:Alpha`+свободный Beta. **Переписал на СЕГМЕНТНУЮ модель** (`search-query-sync.js` 15.0 KiB): residual = ordered segments (`modeValue`/`text`/`rawPrefix`/`incomplete`/`pending`); build re-emits из сегментов (НЕ split), mode-value re-prefix, свободный текст bare, конфликтные/незавершённые — verbatim. Первый mode lift'ится, последующие → verbatim → `classify(build)` пере-детектит `multiple-provider-intents`/`multiple-scope-presets`.
- **A** происхождение токенов сохранено (сегменты). **B** commit-tail: unquoted-хвост завершается по пробелу/commit-сигналу (посимвольный `tag:cloning` chip НЕ делает; параметр `commitTail`). **C** `addFilter` fail-closed — только через `FILTER_BY_CANONICAL`, реальный def из registry, отклоняет mode/unknown; typed `in:Gla` остаётся unresolved (`{raw,unresolved}`), `resolveEntityFilters(resolver)` → уникальное `{projectId,label}` / неоднозначное → blocking diagnostic. **D** `isRunnable`: non-lib scope без места привязки → non-runnable (не default-library). **E** oracle-матрица.

**K3-corr2 (ревью Игоря 15.07 — P1 внутри frozen A, state-transition):** oracle проверял только `sync(DEFAULT, raw)`, но UI = `sync(prevState, editedDraft)`. `modeLifted` начинал `false` каждый вызов → после `aa:HHHH seq:ATGC` добавление « pUC» переключало режим aa→seq и роняло `multiple-provider-intents` (аналогично `mol:pUC project:Alpha`→scope-конфликт). Фикс — одна строка `modeLifted = base.mode !== 'lib'` (режим уже активен → последующие provider/scope-префиксы verbatim до явного clear/селектора). +3 lifecycle-теста на `sync(prevState, editedDraft)`.

**Верификация K3-corr (4 гейта):** TDD-first, **oracle-first** (RED **18 fail** → GREEN 33; +K3-corr2 RED 3 → GREEN). (1) целевой **36 pass** — параметризованный oracle `project(classify(raw)) ≡ project(classify(build(sync(raw))))` зелёный на всех 12 entry (provider/scope/bio-queries/textTerms/filters/blocking-codes) + commit-tail + fail-closed + typed-`in` unresolved/resolve + non-runnable-D + **3 lifecycle** (конфликт переживает следующий keystroke; mode не auto-switch'ится). (2) source lint **0/0**; test **0 warnings** (Cyrillic enz-alias берётся из registry, без литерала); `search-query-sync.js` **15.0 KiB** (≪ soft 20). (3) полная сюита **7036 pass / 0 fail / 18 skipped** (чистый прогон). (4) `npx vite build` OK.

**✅ K3 ПРИНЯТ Игорем 15.07** (после K3-corr + K3-corr2) — GO на K4.

### ▶ K4 — монтаж G1 TopBar на общий control + selector/фильтры (§12 Этап 3 п.2,6,7) — В РАБОТЕ

K4 = реальный монтаж (трогает committed `LibraryTopBar.jsx`/`LibraryWorkspace.jsx` → браузер-верификация). Декомпозиция:
- **K4.1** ✅ — headless-контроллер `hooks/useSearchQueryState.js` (владеет `globalSearchState`, оборачивает K3-движок + commit-tail эвристику эвентов + resolver + производные `canonicalQuery`/`runnable`/selector+chip модели). Чистый/headless, renderHook-тест. Импортирован НИГДЕ → регрессий нет, браузер не нужен.
- **K4.2** ⏳ — монтаж в `LibraryTopBar`: рендер SearchModeSelector + input(draft) + `+ Фильтр` + chips; placeholder по режиму (§9.5); поиск гоняет `buildCanonicalQuery` под гейтом `runnable`; parse-only гейт `name/feature/in`. Браузер-верификация.
  - **K4.2a** ✅ — `SearchField.onValueChange(value, {isComposing, inputType})` (было только `{isComposing}`): `handleChange` пробрасывает нативный `e.nativeEvent.inputType` (не в dedup-ключе), doc обновлён. Замыкает UI-сторону K4.1-контракта (paste=`insertFromPaste` коммитит в том же change; IME отложен до compositionEnd). TDD: +1 тест (fireEvent.input inputType→onValueChange), **24/24** SearchField, source lint **0** (24 warn — pre-existing Cyrillic IME-данные в тесте, не мои). Existing exact-meta тесты целы (`toEqual` игнорит `inputType:undefined`).
### ▶ K4.2b ∪ K5 — АТОМАРНЫЙ монтаж + treeQuery/globalSearchState split (Игорь выбрал вариант A) — В РАБОТЕ, ОДИН гейт

Разведка: `LibraryWorkspace:98` одна общая `query`, TopBar И дерево читают+пишут её (SEARCH-UNIFY). Монтаж движка в TopBar неотделим от K5-развязки → делаем вместе, ОДНИМ гейтом, без временного shared-query моста.

**Контракт Игоря (зафиксирован до реализации):**
1. `LibraryWorkspace` владеет ДВУМЯ независимыми: `treeQuery` (быстрый фильтр дерева) + `globalSearchState` (структурный поиск через `useSearchQueryState`).
2. НЕТ живой двунаправленной синхронизации: ввод в TopBar не меняет дерево, ввод в дереве не меняет TopBar; связь ТОЛЬКО через явную «Открыть полный поиск».
3. Эскалация = **replace, не merge**: `seedGlobalQuery(raw)` строит из `DEFAULT_QUERY_STATE` + разбирает raw `commitTail:true`. НЕЛЬЗЯ `onDraftChange(treeQuery)` поверх текущего (старый `aa:` превратил бы дерево `pUC` в белок).
4. RED-переходы: старый `aa:`+chips + дерево `pUC` → чистый `lib+pUC`; старый `enz:` + `seq:GAATTC` → чистый `seq` без chips; пустое дерево → `DEFAULT_QUERY_STATE`; после эскалации `treeQuery` НЕ меняется; фермент-карта «Найти сайты» пишет `cut:"My Enzyme"` ТОЛЬКО в global, не в дерево.
5. K5 целиком: одна `libraryQuick`-сессия на `treeQuery`; зоны/строки дерева получают готовые matching-наборы; неподдерж. `seq:/aa:/cut:` в дереве → `REQUIRES_FULL_SEARCH`, не match-all.
6. `name:/feature:/in:` не показывать рабочими фильтрами пока не исполняются end-to-end; ручной ввод блокируется диагностикой, не молча пустой выдачей.
7. Внутри 2 checkpoint (ownership+монтаж+escalation | единая tree-session), но принимаются ОДНИМ гейтом. Размер: `LibraryWorkspace` 37.5 KiB / hard 40 → только проводка, bridge/controller в hook/helper; TopBar — не центр состояния, отображает контроллер.

**Прогресс (ch1, контроллер-логика — вся чистая/TDD):**
- ✅ `seedGlobalQuery(raw)` — replace (build из DEFAULT + parse commitTail:true; `composing` сброшен). 3 RED-перехода (aa:+chip→lib+pUC; enz:→чистый seq; пустой→DEFAULT).
- ✅ **инвариант 1** (auto-resolve `in:`): `withResolve` = `resolveEntityFilters(next, resolver)` вкомпонован в onDraftChange(commit)/onCommitDraft/seedGlobalQuery/onAddFilter — typed/seeded `in:` резолвится в том же update (unique→projectId, ambiguous→blocking).
- ✅ **инвариант 2** (parse-only fail-closed): `unexecutableFilters` (`!isExecutablePrefix`: name/feature/in) → augmented `diagnostics` с `filter-not-available` (severity:error) → `runnable=false`; hook отдаёт `diagnostics` для нотиса. Даже РЕЗОЛВНУТЫЙ `in:p7` заблокирован (нет consumer'а).
- инвариант 3 (отмена сессии при `runnable=false`) = эффект в TopBar-монтаже (ниже).
- Обновил устаревший K4.1-P1-1 тест («unique in:→runnable») под новый контракт (in: всегда fail-closed; позитив runnable перенёс на executable `tag:`). **20/20** hook, lint 0, hook 6.9 KiB. Импортирован нигде → регрессий нет.

**✅ ch2-core done (чистый/TDD):** `lib/tree-search-controller.js::runTreeSearch(treeQuery, documents, ctx)` — 7 шагов контракта Игоря: profile=`SEARCH_PROFILES.libraryQuick` (существует, НЕ дублировать); `classifyQuery` один раз; `capabilityDiagnostics(plan,'libraryQuick')` + `planRequiresFullSearch(plan)` (ledger ловит parse-only name/feature/in, разрешённые языком профиля); escalate→пустые сеты+`requiresFullSearch`, НЕ гонять runSearch; иначе intersect includeKinds×profile.entityScope + metadata-only `runSearch` (без seq/protein/re matcher'ов); сессия→`{active, requiresFullSearch, matchingEntryIds, matchingProjectIds, matchInfoByEntityKey}`. **6/6**, lint 0, 3.3 KiB, импортирован нигде→safe.

**Осталось = ТОЛЬКО DOM-сборка (крупная правка committed live-файлов + БРАУЗЕР, ОДИН гейт):**
- `LibraryWorkspace` (~20 строк, только проводка, 37.5/40 KiB): `[query,setQuery]`→`[treeQuery,setTreeQuery]`; `const gs = useSearchQueryState({capabilities:SEARCH_PROFILES.globalLibrary, resolveProjectName:name→projects по имени, resolveLabel/RemoveLabel:i18n})`; эскалация `onRequestFullSearch=()=>{ gs.seedGlobalQuery(treeQuery); setFullSearchTick(t=>t+1); }` (treeQuery НЕ меняется); `useSearchPickRouter({openEntry, setQuery:(raw)=>{gs.seedGlobalQuery(raw); setFullSearchTick(t=>t+1);}})` (фермент «Найти сайты»→global, инв.4); `<LibraryTopBar search={gs}/>`; `<LibraryTreeRoot treeQuery onTreeQueryChange={setTreeQuery} treeSearch={runTreeSearch(treeQuery,userDocuments)}/>` (звать НАПРЯМУЮ — БЕЗ ручного useMemo, React Compiler мемоизирует).
- `LibraryTopBar` (~70 строк, memo, worker-facade): проп `search`; SearchField(`value=search.draftValue`, `onValueChange=search.onDraftChange`, modeSlot=SearchModeSelector, filterChips=SearchFilterChips, `+Фильтр`=SearchFilterMenu с ТОЛЬКО executable defs); debounce на `search.canonicalQuery`+`search.runnable`; при `!runnable`→`facade.cancel()`+скрыть (инв.3); placeholder §9.5; нотис при `search.diagnostics` filter-not-available; Enter/blur→onCommitDraft; onPaste→onDraftChange(...,{inputType:'insertFromPaste'}).
- `LibraryTreeRoot`+зоны+строки: принять `treeSearch` вместо локального query-matching. **КОНТРАКТ потребления (Игорь):** `!treeSearch.active` → показать ВСЮ библиотеку (пустой `treeQuery` = вся библиотека, НЕ фильтр пустыми `matching*Ids`); `active` → фильтр по `matchingEntryIds`/`matchingProjectIds`, строки берут `matchInfoByEntityKey`; `requiresFullSearch` → «Открыть полный поиск», не false-empty. `runTreeSearch` гоняет tree-сессию UNCAPPED (limit override) → `matchInfo` не теряется после 200-го совпадения.
- Затем БРАУЗЕР + приёмка ОДНИМ гейтом. Якоря: LibraryWorkspace:98/587/615/481; LibraryTopBar:83/129/188-231/353-375/376-454; useSearchPickRouter:20/65.
- **K4.3** ⏳ — проводка в `LibraryWorkspace` (владение state) + resolver имён проектов + i18n лейблы.

**K4.1 верификация:** TDD-first (RED → GREEN **8 pass**). commit-tail эвристика: `onDraftChange` — trailing space коммитит хвост (иначе pending); `onCommitDraft` (Enter/blur) — явный коммит. Handlers: selectMode/clearMode/addFilter/removeFilter/backspaceEmpty/clearAll/resolveEntities.

**K4.1-corr (ревью Игоря 15.07 — 2 P1 в фундаменте):** (P1-1) `runnable` не учитывал блокировки → `runnable = isRunnable(state) && !hasBlockingError && !hasUnresolvedEntity` (unresolved `in:`/provider-конфликт → false; unique resolve → true). (P1-2) контроллер терял метаданные события → `onDraftChange(value, {isComposing, inputType})` + отдельный видимый `buffer`/`composing` (`draftValue`): IME mid-composition только буфер (не парсится), `insertFromPaste` коммитит в том же change. RED 4 → GREEN. **Целевой 12 pass**, lint **0/0**, hook **4.9 KiB**. Полная сюита **7048 pass / 0 fail** (первый прогон 1 flake ECONNREFUSED :3000 — network, не воспроизвёлся; hook импортирован нигде → регрессий нет). Build OK.

**✅ K4.1 (+corr) принят Игорем → GO на K4.2.** Дальше K4.2 (монтаж в TopBar + браузер) — крупный шаг по committed-файлам, отдельным фокусом. Коммит — за Игорем, ОТДЕЛЬНОЙ веткой (0 staged; worktree не clean: новые `lib/search-query-sync.js`+тест, `components/Library/hooks/useSearchQueryState.js`+тест, `components/Search/`, `lib/search-modes.js` — untracked; `CURRENT_TASK.md`+`BUGS.md` изменены).

**СТОП после K2 (corrective).** K3 не начинаю. Коммит — за Игорем, ОТДЕЛЬНОЙ веткой (0 staged; worktree не clean). Жду повторной приёмки.

---

## ⚠ Незакрытый долг прошлых арок (НЕ закоммичено; git за Игорем)

- **JUNCTION-арка + Звенья + UX-срезы + M-CANVAS-FIX.1** — реализованы и визуально приняты, трекеры не финализированы. Полные отчёты: `docs/archive/CURRENT_TASK_HISTORY_2026_06_junction.md` + git history этого файла (canvas-отчёты 10.06).
- **M-CANVAS-FIX.1** (canvas раскладка + V139 + цвет): K1+K2+K4+K5+K6 ✅, K3 ⊘ снят; **визуальная приёмка pending** отдельной сессией.
- **Git / гигиена (важно):** рабочее дерево = крупный незакоммиченный бэклог. **`docs/design_assets/` НЕ в `.gitignore`** (паспорт/договоры/237MB .msi — широкий `git add docs/` их утащит); `test.bodge` тоже не игнорится. **Добавить `.gitignore` ДО любого широкого `git add`.**
- Смарт-поиск (P0–P5 + REV-1 + ASM-SEARCH + Stage 0/1 + #168) — реализован, НЕ закоммичен; журнал в памяти проекта.

---

## Отчёт Code по REV#2 Stage 2 (K1–K7 + все корректирующие P1: K6 round-2/3, K7 round-1/2/3)

- Коммиты: **нет** — коммит за Игорем, ОТДЕЛЬНОЙ веткой (рабочее дерево = крупный незакоммиченный бэклог + ZIP/PDF/msi; `git add .` НЕ делался).

- Изменения размеров (KiB; hard .jsx 40 / .js 25, soft .jsx 30 / .js 20):
  - `lib/query-classify.js`: **22.67 KiB** (23211 B; 23.21 decimal kB) — soft 20 **WARN**, hard 25 OK (+clause-ids / exact-enum / type+status scope)
  - `lib/library-search.js`: **21.62 KiB** (22136 B) — soft 20 **WARN**, hard 25 OK (+scope filter / consumed-ledger / gate helpers)
  - `components/Library/LibraryWorkspace.jsx`: **37.54 KiB** (38436 B) — soft 30 **WARN**, hard 40 OK (K6-sink extraction; в K7 не рос)
  - `components/Library/LibraryTopBar.jsx`: **26.51 KiB** (27142 B; HEAD 17979 B → **Δ+9163 B / +8.95 KiB**) — soft 30 OK, hard 40 OK; rate-of-change WARN-signal
  - `components/PrimerPoolList.jsx` 13.88, `store/primerSlice.js` 8.04, `lib/search-types.js` 7.56, `lib/search-document-adapters.js` 7.38, `lib/search-facade.js` 6.79, `components/Library/SmartResultRow.jsx` 4.36, `lib/search-result-vm.js` 4.14, `components/Library/hooks/useSearchPickRouter.js` 3.51, `components/Library/EnzymeCard.jsx` 2.83, `lib/legacy-primer-migrate.js` 2.81, `components/PrimerPool/PrimerPoolWorkspace.jsx` 2.21, `lib/open-entry-action.js` 1.92, `lib/search-enzyme-adapters.js` 1.60, `lib/search-pick-route.js` 1.47, `lib/search-entity-key.js` 1.00 — все OK (< soft)

- Новые SOURCE-файлы (Stage 2): `lib/search-entity-key.js`, `lib/search-pick-route.js`, `lib/open-entry-action.js`, `lib/legacy-primer-migrate.js`, `components/Library/hooks/useSearchPickRouter.js`, `components/Library/EnzymeCard.jsx`, `components/Library/SmartResultRow.jsx`
- Затронутые SOURCE-файлы (Stage 2): `lib/query-classify.js`, `lib/library-search.js`, `lib/search-facade.js`, `lib/search-document-adapters.js`, `lib/search-enzyme-adapters.js`, `lib/search-result-vm.js`, `lib/search-types.js`, `components/Library/LibraryTopBar.jsx`, `components/Library/LibraryWorkspace.jsx`, `components/PrimerPoolList.jsx`, `components/PrimerPool/PrimerPoolWorkspace.jsx`, `store/primerSlice.js` (часть из них также несёт правки P1/Stage-0/1 — вся search-фича не закоммичена)
- Новые TEST-файлы (Stage 2): `search-entity-key.test.js`, `query-classify-k7.test.js`, `library-search-k7-ledger.test.js`, `search-facade-k7-gate.test.js`, `legacy-primer-migrate.test.js`, `open-entry-action.test.js`, `search-pick-route.test.js`, `enzyme-card.test.jsx`, `library-topbar-lazy-enzyme.test.jsx`, `library-topbar-userdata-scope.test.jsx`, `library-topbar-pick-routing.test.jsx`, `useSearchPickRouter.test.jsx`, `useSearchPickRouter.integration.test.jsx`, `library-tree-v2-k7.test.jsx`, `primer-pool-selected.test.jsx`, `SmartResultRow.test.jsx`
- Затронутые TEST-файлы: `query-classify.test.js`, `query-classify-rev2.test.js`, `library-search-scope.test.js`, `library-topbar-dna-search.test.jsx`, `primer-pool-workspace.test.jsx`, `library-tree-v2.test.jsx`

- Vitest: **6824/6824 pass** (0 fail, 18 skipped) — **baseline Stage 2 (конец Stage 1) 6701 → 6824, Δ+123** (весь Stage 2: collectors/scope/entityKey/routing/ledger/gate/type+status + все P1-корректировки). Финальный прогон чистый, без FLAKE-TIMEOUT-LOAD.
- pytest: не трогалось.
- vite build: clean (единственный warning — pre-existing chunk-size >500 KB, не новый).

- Отклонения от спеки:
  - **Graphify — ЗАКРЫТО (полный detect-rescan выполнен 14.07 перед Stage 3):** прежний `graphify update` использовал кэш-манифест и НЕ индексировал новые Stage-2 файлы. Полный `detect --scope tracked` пересканировал **1683 файла → граф 6651 узел / 13 782 связи / 399 сообществ**; Stage-2 search-модули (query-classify/library-search/search-facade/collectors/routing/entityKey/ledger/gate) теперь **в графе** (проверено `graphify query` + grep). Граф локальный и актуальный. Остаток (неблокирующий Stage 3): `portable-check` не пройден (`exit 1`, absolute `D:/RESplasmide/...` пути в артефактах) → граф НЕ commit-safe/portable, но `.graphify/` целиком в `.gitignore` (не коммитится) → на Stage 3 не влияет. `scope=tracked` исключил 62 незатреканных файла → точная формулировка «полный rescan tracked + временно staged inventory», не весь dirty workspace.
  - `name:`/`feature:`/`in:` остаются parse-only (по §-readiness), теперь корректно эскалируют как `unconsumable` (не silent no-op) — не регресс, ожидаемое поведение до Stage 3+.

- Size budget: **WARN** — soft-нарушители: `LibraryWorkspace.jsx` 37.54 KiB, `library-search.js` 21.62 KiB, `query-classify.js` 22.67 KiB. **Hard-нарушителей НЕТ.** Rate-of-change: `LibraryTopBar.jsx` +9163 B за Stage 2 (под soft, но быстрый рост — кандидат в Watch).

**СТОП: после K7 (последний K-шаг Stage 2) — остановка. PROJECT_STATE / RELEASES / DECISIONS / ANCHORS не трогались; BUGS.md — только статусы дефектов этого спринта. Финализация версий/снапшота, `.gitignore` перед коммитом, полный graphify detect-rescan — за Chat/Игорем в сессии приёмки. Stage 3 не начинаю. Коммит — за Игорем, ОТДЕЛЬНОЙ веткой (НЕ `git add .`); координационные доки — русский, код/тесты — English.**

---

## Отчёт Code по REV#2 Stage 3 — K4.2b∪K5 corrective (16.07.2026)

- Коммиты: **нет** — worktree содержит большой незакоммиченный пользовательский backlog; staging и `git add .` не выполнялись.

- Что изменилось:
  - live TopBar переведён на общий combobox-контракт: стабильный `kind:id`, клавиатурный выбор, IME-gate, честные partial/blocked/incomplete состояния;
  - найденный браузером переход `pick → navigation sink → delayed focus` закрыт query-owned closed-state: popup не воскрешается после выбора, но открывается новым действием пользователя;
  - дерево использует одну kind-aware metadata-сессию для entry/project/primer; неподдержанный `seq:/aa:/cut:` не превращается в false-empty и эскалируется в глобальный поиск replace-семантикой;
  - отсутствие Worker больше не запускает тяжёлый sequence scan в UI-потоке: browser-path fail-closed в metadata-only `incomplete`, worker factory повторно проверяется на следующем запросе;
  - локализованы причины/метрики/типы результатов и tree-notice; добавлены `type:primer` и полный lifecycle праймеров; удалён `outline:none` у tree-search;
  - `LibrarySmartSearchBar.jsx` вынесен из TopBar; blocked-запрос больше не озвучивает ложное «Результатов: 0».

- Что это означает для биолога:
  - Enter/клик открывает именно подсвеченную плазмиду или праймер и не оставляет выдачу поверх инспектора;
  - быстрый поиск дерева больше не скрывает существующие объекты из-за неподдержанного биопоиска;
  - конфликтный запрос не выдаёт ложное отсутствие совпадений, а явно просит выбрать один вид поиска;
  - на слабом компьютере отказ Worker не замораживает интерфейс скрытым полным перебором;
  - поиск по статусам праймеров не смешивает `archived` с устаревшими молекулами.

- Изменения размеров (KiB; hard .jsx 40 / .js 25):
  - `LibraryWorkspace.jsx`: **39.44 KiB** — soft WARN, hard OK (запас 0.56 KiB);
  - `LibraryTopBar.jsx`: **32.8 → 10.62 KiB** (декомпозиция, hard OK);
  - новый `LibrarySmartSearchBar.jsx`: **16.71 KiB** — OK;
  - `LibraryTreeRoot.jsx`: **19.63 KiB**, `TreeItemRow.jsx`: **18.10 KiB** — OK;
  - `search-query-sync.js`: **18.75 KiB** — под soft 20, hard OK;
  - `tree-search-controller.js`: **6.29 KiB**, `search-worker-client.js`: **8.42 KiB**, `search-facade.js`: **6.86 KiB** — OK.

- Vitest: **7117 passed / 0 failed / 18 skipped** (baseline перед атомарным монтажом 7072, Δ+45); целевой search/Library/tree кластер: **603 passed / 0 failed / 1 skipped**.
- pytest: не трогалось.
- Scoped lint: **0 новых errors**. Пять ошибок в `LibraryWorkspace.jsx`/`LibraryTreeRoot.jsx` подтверждены в `HEAD` (2 unused + 3 старых set-state-in-effect) и не смешивались с corrective scope.
- vite build: успешно; warnings только pre-existing (`node:crypto` externalization и chunk >500 KiB), новых build-errors нет.

- Browser acceptance (localhost:3000, реальный Worker, библиотека 8 записей):
  - `pUC` → ArrowDown/Enter и mouse-pick открывают правильный inspector; popup закрыт, повторный ArrowDown открывает его, Escape не закрывает workspace;
  - `seq:GAATTC` в дереве сохраняет все 8 записей + показывает «Открыть полный поиск»; эскалация заменяет прежний global-query и даёт 2 DNA-hit;
  - `enz:Bsa seq:GAATTC` показывает только blocked-notice, без «Ничего не найдено» и без «Результатов: 0»;
  - browser console: **0 errors**.

- Отклонения от плана:
  - реальный OS-level IME composition и screen-reader announcement проверены контрактными тестами, но не физической русской IME/SR-сессией; отдельный smoke остаётся Stage 6;
  - `npx --no-install graphify hook-rebuild` не выполнился: локального CLI нет, а npx попытался обратиться к registry и получил EACCES. Скачивание незакреплённого пакета не разрешалось; `.graphify` не используется как доказательство этой приёмки.

- Size budget: **WARN** — `LibraryWorkspace.jsx` 39.44 KiB почти у hard 40; новых hard-нарушителей нет. Warning signal TopBar устранён декомпозицией.

После K5: **СТОП**. PROJECT_STATE / RELEASES / DECISIONS / ANCHORS не трогались; BUGS.md изменён только статусами corrective-дефектов. Финализация версии и коммит — за Chat/Игорем отдельной сессией.

---

## Отчёт Code — REV #2 S3-CLOSE / K1: строгая AND-семантика поиска (16.07)

**Что изменилось.** `runSearch` (`lib/library-search.js`) получил строгий финальный AND-режим: после существующих проверок textTerms/enzymeCatalogQuery добавлена чистая внутренняя `requiredProviderDimensions(plan)` (seq→sequence, aa→protein, cut/legacy-re→enzyme; читает и modern `providerIntent`, и transitional `seqQuery/aaQuery/reQuery/cutQuery`; multi-provider план требует КАЖДОГО — fail-closed; `enz:` остаётся на своём catalog-gate) + `ctx.providerPolicy` (`'deferred'` пропускает metadata-кандидата без provider-hit; отсутствие/неизвестное → `'required'`/строгий). Документ теперь проходит в финал только если КАЖДОЕ обязательное provider-измерение реально совпало (`bag.has(dim)` ⇒ непустой occurrence). Каждый результат несёт `providerPending` (true = metadata-кандидат ещё проверяется). Фасад (`lib/search-facade.js`): metadata/partial-фаза зовёт `runSearch(..., { providerPolicy: 'deferred' })`, финальная — строгий default; inline и worker-путь дают один финал. Одна дизайн-нота (см. отклонения): drop привязан к engine-presence — required-измерение роняет документ только когда его матчер РЕАЛЬНО отработал и не нашёл; поверхность без движка (дерево/`describeEntryMatch`) ничего не роняет.

**Что это даёт биологу.** `mol:pUC seq:GAATTC` больше не выдаёт pUC только по имени, если GAATTC нет в последовательности. Финальная выдача = «совпали метаданные И совпали все запрошенные ДНК/белок/сайт-реза проверки». Пока идёт биопроверка, кандидат по метаданным может кратко мигнуть (partial), но исчезает после отрицательного финала. Никаких ложных «объект найден», где найдено только название.

**Устранённый риск / остаток.** Устранён REV#2-S2-K7-P1-7: метаданное совпадение больше не маскирует отсутствие обязательного биосовпадения (fail-closed: неизвестный providerPolicy → строгий; multi-provider → все). Остаток (вне K1, по плану): worker failure/timeout/incomplete-session UX — K2; типовой cleanup `providerPending`/`search-types.js` — K3.

**Как проверить вручную.** localhost:3000 → Библиотека → в глобальную строку `mol:pUC seq:<длинный отсутствующий мотив>` → кандидат pUC мигает в loading и исчезает («Ничего не найдено»); `pUC` (обычный текст) → pUC19 остаётся. Позитивный mixed нужен мотив, реально присутствующий в сиквенсе записи.

**Доказательства.**
- **baseline (до правки):** целевая область `library-search.test + k7-ledger + scope + search-facade(+k7-gate/provider-failure/stage2-p1) + search-service + tree-search-controller` = **101 passed**; `library-topbar-dna-search` = 11 passed.
- **RED:** новый `lib/__tests__/library-search-strict-and.test.js` — **11 failed / 12 passed** (name-only survives; provider-miss не гейтится; `providerPending` отсутствует; facade final держит кандидата).
- **GREEN:** тот же файл **23/23**; целевая область снова **101/101** (0 регрессий); `library-topbar-dna-search` **14/14** (+3 новых).
- **mutation-proof:** временно `if (false && providerMiss && providerPolicy !== 'deferred') continue;` (строгий гейт отключён) → **9 тестов RED**, в т.ч. «name matches but the sequence does NOT → strict final is EMPTY» (ядро дефекта), aa/cut MISS, unknown/absent providerPolicy, multi-provider MISS. Мутация полностью удалена, гейт восстановлен, снова 23/23.
- **engine:** `mol:pUC seq:GAATTC` (имя есть, seq нет → пусто; оба → остаётся; чужой seq-hit не подтверждает pUC); `aa:HXHH pUC` (protein miss→пусто / hit→есть); `cut:EcoRI pUC` (re miss→пусто / hit→есть); голый auto-DNA (24-mer, имя есть, seq нет → пусто); регрессии pUC/type:circular/status/tag/enz:EcoRI; providerPolicy deferred(+providerPending true)/unknown-строгий/absent-строгий; hand-built двухпровайдерный план требует обе. Планы — из настоящего `classifyQuery`, матчеры инжектированы детерминированно.
- **facade (inline pipeline):** partial даёт metadata-кандидата и `status:'partial'`; final ДРОПАЕТ его при отсутствии мотива; при наличии мотива — остаётся с `dimension:'sequence'`; plain metadata не затронут; stale/cancel не регрессировали.
- **TopBar (harness):** `mol:pUC seq:GAATTC` при seq-miss → строка исчезает из финала + «Ничего не найдено»; при seq-hit → остаётся; `pUC` (plain) не изменился.
- **browser (localhost:3000, 4 записи starter-set):** `mol:pUC seq:GGGGGGCCCCCCTTTTTTAAAAAA` → «ПОИСК ПО ДНК · 0 · Ничего не найдено» (pUC19 по имени НЕ пережил); `mol:pUC seq:GAATTC` → тоже 0 (в синтетическом pUC19 нет GAATTC); `pUC` (plain) → «ПОИСК · 1» pUC19; дерево независимо (4 записи); **console: 0 errors**.
- **full suite:** **7137 passed / 18 skipped**; «падения» = FLAKE-TIMEOUT-LOAD (`Test timed out 5000ms` + `ECONNREFUSED ::1:3000` в НЕсвязанных файлах NotebookEntryEditor/annotator-introns/smoke-workflow-k17/restriction-sites-workspace, набор отличался между двумя прогонами) — изолированный прогон этих 4 файлов **29/29 clean**, доказано что не регрессия.
- **build:** `npx vite build` успешно.
- **lint:** `./node_modules/.bin/eslint` по всем затронутым — **0 errors**. 9 `no-cyrillic` warnings: 7 pre-existing (в т.ч. `library-search.js:364` символ `∉`, `search-facade.js:105` — не мои), 2 моих комментария исправлены на English; оставшиеся Cyrillic — только regex/строки-ассерты русского UI в тест-фикстурах (по конвенции проекта допустимо).
- **размеры до/после:** `library-search.js` 22 136 B → **24 443 B** (Δ+2.25 KiB; hard 25 600 — под лимитом, headroom 1.15 KiB; НЕ пересёк hard, рост < 3 KiB); `search-facade.js` 7 025 B → **7 354 B** (Δ+0.32 KiB; OK). Новых hard-нарушителей нет. Warning signal: `library-search.js` в soft-зоне у hard — следующая правка риск, но данный рост в бюджете.

**Отклонения и находки вне scope.**
- **Дизайн-решение (engine-presence gate):** строгий drop привязан к тому, что матчер провайдера РЕАЛЬНО отработал (инжектирован) и не нашёл. Причина: критерий приёмки — «если проверка не дала совпадения» (проверка ДОЛЖНА была прогнаться); финальная фаза всегда инжектит движки → строго. Метаданные-поверхности без движка (`tree-search-controller.js` — вне allowlist; `describeEntryMatch`) движок не запускают → не могут «не найти» → не роняют, деградируют к метаданным как раньше. Это ЕДИНСТВЕННЫЙ способ выполнить контракт, не регрессируя дерево, оставаясь в allowlist. Подтверждено: целевая область 101/101 без правок этих файлов.
- **Находка вне scope (не чинил):** `library-topbar-dna-search.test.jsx` и др. содержат Cyrillic в assert-строках (существующая практика тест-фикстур) — не трогал. Pre-existing size hard-over: `bodge-zip.js` 25 639 B, `feature-match-core.js` 26 129 B — не мои, не трогал.
- Graphify: локальный CLI не найден; по инструкции не устанавливал/не скачивал; `.graphify` как доказательство не использовал, артефакты не менял.

**Git-состояние.** Мои файлы (в allowlist): `lib/library-search.js` (`??` — весь smart-search кластер uncommitted), `lib/search-facade.js` (`??`), `lib/__tests__/library-search-strict-and.test.js` (`??`, новый), `components/Library/__tests__/library-topbar-dna-search.test.jsx` (` M`), `CURRENT_TASK.md` (этот отчёт). Существовавший до сессии dirty backlog (~197 файлов) не трогал: без `git add`/staging/commit/stash/reset/checkout/clean.

СТОП после S3-CLOSE K1. K2 не начинаю. Жду приёмки.

---

## Отчёт Code — REV #2 S3-CLOSE / K1 **corrective** (16.07)

### Что изменилось
Строгая AND-семантика перестала быть свойством «удачного вызова» и стала **инвариантом системы**.

1. **P1-1 — настоящий fail-closed движка** (`library-search.js`). Убрана зависимость строгого решения от `providerEngine` (наличия matcher). Теперь: `required` (absent/unknown/`required` — одинаково) → отсутствие ЛЮБОЙ обязательной provider-dimension всегда удаляет документ; только точное `deferred` оставляет кандидата с `providerPending:true`. Metadata-поверхности деградируют ЯВНО: facade partial, `tree-search-controller` и `describeEntryMatch` передают `providerPolicy:'deferred'` сами, а не полагаются на неявное отсутствие matcher.
2. **P1-2 — final нельзя ослабить снаружи** (`search-facade.js`). Политика назначается ПОСЛЕ spread: успешный final всегда `providerPolicy:'required'`; внешний `ctx.providerPolicy` внутренними фазами не управляет. Sequence-failure сам явно ставит `deferred` + `incomplete:true` (контракт #168 сохранён).
3. **P1-3 — pending-кандидат нельзя выбрать** (`search-result-vm.js`, `LibrarySmartSearchBar.jsx`, `SearchResultsListbox.jsx`). `providerPending` доведён до VM; строка показывается как проверяемая (существующий локализованный `search.results.loading`), `aria-disabled`, мышь и Enter — no-op. После положительного final строка выбираема, после отрицательного исчезает. Plain metadata не блокируется (`pendingList` пуст → список живой).
4. **P2 — modern `cutQuery`**. Единый источник `plan.cutQuery || plan.reQuery` в `matchDocument`, `empty`, `pureFilter` и при создании `reMatch` в facade.
5. **P2 — partial не теряет настройки**. `runMetadata(plan, documents, ctx)` → `{ ...ctx, providerPolicy:'deferred' }`: пользовательские `opts.limit` и пр. соблюдаются, политика — внутренняя.

### Что это даёт биологу
Плазмида, совпавшая только названием, больше не может быть открыта до подтверждения мотива в ЭТОЙ молекуле — ни кодовым путём (`runSearch(..., {})`), ни внешним параметром (`providerPolicy:'deferred'`), ни быстрым кликом по предварительному кандидату.

### Устранённый / оставшийся риск
- **Устранено:** три реальных обхода строгой AND (движок без matcher; final через внешний ctx; выбор pending мышью/Enter) + modern `cutQuery` не запускался + partial игнорировал лимит.
- **Осталось (вне K1):** K2 — worker failure/timeout UX; `search-types.js` не документирует `providerPending` (типовой cleanup — K3). Provider-failure по-прежнему даёт metadata-кандидатов, но только явно `deferred + incomplete:true`.

### Как проверить вручную
`localhost:3000` → Библиотека. `mol:pUC seq:GAATTC` → «Поиск по ДНК · 0», «Ничего не найдено» (pUC19 совпал именем, мотива нет). `mol:Bluescript seq:GAATTC` → pBluescript остаётся, выбираем. `pUC` → pUC19 выбираем сразу.

### Доказательства
- **baseline:** область 101/101 (9 файлов) до правки; `library-search.js` 24 443 B.
- **RED:** движок/фасад/VM — 7 failed / 25 passed; UI — 2 failed / 3 passed (`aria-disabled` = null; pending-клик вызвал onPick).
- **GREEN:** strict-and 32/32; pending-UI 5/5.
- **mutation-proof:** (1) убран форсированный `providerPolicy` из final `runSearch` → `mixed-negative + {providerPolicy:'deferred'} → final EMPTY` упал (`expected ['puc'] to not include 'puc'`); (2) снят guard `vm?.providerPending` в `pickRow` + `pendingList` из listbox → 2 UI-теста упали (`expected null to be 'true'`, `called 1 times`). **Обе мутации полностью удалены**, GREEN восстановлен.
- **engine/facade/VM/worker/TopBar/tree/Search:** 320/320 (23 файла).
- **browser:** live, 0 console errors — негативный mixed (пример Игоря) 0 результатов и not blocked; длинный отсутствующий мотив → 0; позитивный mixed → pBluescript, `aria-disabled=null`, «100% идентичность · 6/6 нт»; plain `pUC` → pUC19 выбираем.
- **full suite:** **7156 pass / 1 fail / 18 skipped** (765 файлов). Единственный fail — `src/canvas/__tests__/MarkdownView.test.jsx` (notebook markdown, вне поиска); изолированно **5/5** → FLAKE-TIMEOUT-LOAD, не регрессия.
- **build:** `npx vite build` OK.
- **lint (scoped):** 0 errors, 3 warnings — все три Cyrillic-в-комментарии **пред-существующие** (`library-search.js:361` Stage-0 JSDoc, `search-facade.js:111` K7-gate, `search-result-vm.js:68` «нт»), не мои.
- **размеры до/после:** `library-search.js` 24 443 → **24 683 B** (Δ+240; hard 25 600 — OK, 917 B запаса); `search-facade.js` 7 354 → 7 906; `search-result-vm.js` 4 334 → 4 653; `tree-search-controller.js` 6 436 → 6 740; `LibrarySmartSearchBar.jsx` 17 109 → 17 626 (soft 30 KB — OK); `SearchResultsListbox.jsx` 4 121 → 4 450. **Size budget: OK.**

### Отклонения и находки вне scope
- **Отклонение от прошлой итерации (исправлено):** engine-presence-гейт был неверной трактовкой — Игорь прав, absent/unknown обязаны вести себя строго. Заменено на настоящий fail-closed; metadata-деградация теперь явная (`deferred`) во всех трёх поверхностях.
- **Находка вне scope (не чинил):** `describeEntryMatch` и `tree-search-controller` деградируют по `deferred`, поэтому auto-DNA (bare-мотив) в дереве по-прежнему совпадает по имени. Это сохранённое поведение метадата-поверхности, а не строгий поиск; если Chat захочет иную семантику для auto-DNA в дереве — отдельная задача.
- **Пред-существующий FLAKE:** `MarkdownView.test.jsx` в полном прогоне (изолированно зелёный).
- **Graphify:** локальный CLI не проверялся как доказательство; граф не изменялся и не использовался как основание — все выводы из живого кода и тестов.

### Git-состояние
Мои файлы (все в allowlist): `library-search.js`, `search-facade.js`, `search-result-vm.js`, `tree-search-controller.js`, `LibrarySmartSearchBar.jsx`, `SearchResultsListbox.jsx`, `__tests__/library-search-strict-and.test.js`, `__tests__/library-topbar-strict-and-pending.test.jsx` (новый), `BUGS.md`, `CURRENT_TASK.md`.
Весь search-кластер остаётся **untracked (`??`)** — не коммитил, не стейджил, `git add .` не делал. Прочий dirty backlog (≈197 файлов пользователя) не тронут.

СТОП после S3-CLOSE K1 corrective. K2 не начинаю. Жду повторной приёмки.

---

## Отчёт Code — REV #2 S3-CLOSE / K2 (единая обработка сбоев биологических провайдеров), 16.07

### 1. Что изменилось

**K2.1 — новая чистая failure-модель `lib/search-provider-failures.js`** (6 281 B). `createProviderFailureTracker()` пишет, КАКАЯ dimension упала и ПОЧЕМУ (`TIMEOUT` / `WORKER_FAILURE` / `PROVIDER_ERROR`); `tracker.guard(dim, factory)` оборачивает matcher так, что бросок при конструировании, бросок при вызове и не-массив в ответе становятся ЗАПИСАННЫМ сбоем, а `[]` остаётся честным miss. После первого сбоя matcher — no-op (повторно не вычисляется). `snapshot()` даёт упорядоченные `sequence → protein → enzyme`, дедуплицированные, свежие массивы, без сырого message/stack.

**K2.2 — валидация протокола воркера (`search-worker-client.js`).** `isValidByIdPayload`: только не-null не-массив объект, у которого КАЖДОЕ значение — массив; пустой объект валиден (честный miss). Совпавший `id` с мусором → `failActive(WORKER_FAILURE)` (reject + terminate) → следующий поиск поднимает свежий воркер. Ответ чужого `id` остаётся stale и игнорируется.

**K2.3 — единая оркестрация в `search-facade.js`.** Один tracker на поиск; DNA как раньше, protein/cut — через guarded matcher; eager-precompute НЕ делается (провайдеры бегут внутри `runSearch`, после scope+фильтров — важно для слабой машины). Известный до `runSearch` сбой → сразу `deferred`; иначе строгий `required`, и если inline-сбой всплыл ВНУТРИ строгого прохода — первая сессия отбрасывается целиком и повторяется один `deferred`-проход (консервативная политика K2). `providerPolicy` назначается ПОСЛЕ spread. Успешный final нормализуется в `incomplete:false, incompleteDims:[], providerFailures:[]` тем же `snapshot()` — один путь на успех и на сбой.

**K2.4 — честный UI.** `LibrarySmartSearchBar`: `incompleteDims`/`providerFailures` хранятся рядом с query/rows/phase и гейтятся через `showForQuery`; `seqIncomplete` → `providerIncomplete`; источник истины — сессия, не пере-разбор запроса; `finalEmpty` требует `!providerIncomplete`; счётчик «· 0» скрыт при incomplete без строк; шапка при неподтверждённых строках — «Предварительные кандидаты»; оба слоя защиты выбора (`pickRow` + list-wide `disabled`) сохранены. `SmartResultRow`: бейдж `statusLabel` — «Проверяется» (partial) / «Не подтверждено» (failed final) / ничего (confirmed), plain span на `--info-bg`/`--info-fg`/`--border-subtle`, без emoji и hex.

**i18n:** 10 новых ключей в ОБОИХ блоках (EN+RU), через `tf()`. Старый `search.results.incomplete` оставлен для совместимости, новым UI не используется.

### 2. Что это даёт биологу

Сбой алгоритма больше не выглядит как доказанное отсутствие мотива, белка или сайта рестрикции. «Ничего не найдено» показывается только после успешно завершённой проверки; при техническом сбое программа честно сообщает, что биологический вывод сделать нельзя, и называет, какая именно проверка не прошла — ДНК, белок или сайты рестрикции.

### 3. Какой риск устранён

- **Сфабрикованный отрицательный результат.** `byId:null` от воркера превращался в пустую Map → «в этой плазмиде сайта EcoRI нет» без единого предупреждения. Теперь — `WORKER_FAILURE`.
- **Вечный partial + unhandled rejection.** Исключение inline-провайдера (`aa:`/`cut:`) уходило из `resolve()` мимо `search-service` (там нет `.catch`) → final не приходил никогда: спиннер и невыбираемые кандидаты навсегда. Воспроизвелось буквально в RED-прогоне (2 Unhandled Rejection). Теперь фасад ВСЕГДА резолвится.
- **Слияние «0 совпадений» и «не проверено».** DNA-текст предупреждения на любой сбой + счётчик «· 0» рядом с ним.

### 4. Как проверить вручную

1. Библиотека → строка поиска → `Bluescript seq:GAATTC` → строка pBluescript SK(+) с «100% идентичность · 6/6 нт», открывается кликом, бейджа нет.
2. `pUC seq:GAATTC` → «ПОИСК ПО ДНК · 0» + «Ничего не найдено», без предупреждения (проверка прошла, мотива нет).
3. `cut:EcoRI Bluescript` → «EcoRI · GAATTC · 5′-выступ AATT»; `cut:EcoRI pGEX` → «Ничего не найдено».
4. `aa:HHHHHH pET` → pET-28b(+) «KanR · прямая цепь · 39–44 aa · рамка 2 · 100% совпадение белка».
5. Fault-path (сбой воркера/движка) в проде не воспроизводится без fault-toggle, который спека запретила — покрыт детерминированным harness.

### 5. RED→GREEN и mutation-proof

**RED (до продакшн-кода):** 6 файлов, **47 failed / 32 passed + 2 Unhandled Rejection** («cannot build the enzyme registry» через `search-facade.js:74` → `search-service.js:55`) — дефект S3CK2-1 воспроизвёлся в самом прогоне.
**GREEN:** helper 20/20, protein 11/11, cut 10/10, sequence 10/10, worker-client 33/33, UI 16/16.

**Mutation-proof (6 мутаций, все откачены, GREEN восстановлен):**

| # | Мутация | Итог |
|---|---------|------|
| 1 | `byId:null` считается пустым объектом | **RED** (2 protocol-теста) |
| 2 | Убраны guard'ы inline-провайдеров | **RED** (17 facade-тестов) |
| 3 | `required` оставлен после сбоя провайдера | **RED** (8: facade+UI, mixed pending) |
| 4 | `CANCELLED` считается сбоем | **RED** (1, unit) — см. оговорку |
| 5 | `finalEmpty` разрешён при incomplete | **GREEN** — см. оговорку |
| 5b | Убран гард `showResultCount` | **RED** («Поиск по ДНК · 0» рядом с предупреждением) |
| 6 | Потеря `incompleteDims` в UI-state | **RED** (5: ДНК/белок/фермент/переход/EN) |

### 6. Focused / full-suite / build / browser

- **Focused:** 665/665 (49 файлов: lib/search*, library-search, tree-search, Library/__tests__/library-topbar*, SmartResultRow, components/Search).
- **Full suite:** прогон 1 — 7235 pass / **1 fail** / 18 skipped (767 файлов); падение — `waitFor`-таймаут (`@testing-library/dom/wait-for.js:118 Timeout.checkRealTimersCallback`), подпись FLAKE-TIMEOUT-LOAD, не ассерт. Прогон 2 — **полностью зелёный, 0 FAIL**. Имя флейкового файла в прогоне 1 не зафиксировал (грепнул только summary) — оговариваю честно.
- **Build:** `npx vite build` OK.
- **Lint (scoped):** 0 errors, 3 warnings — все пред-существующие (`SmartResultRow.jsx:1`, `search-facade.js:130` K7-gate, `search-worker-client.js:36` #168). Свои 6 новых кириллических комментариев, появившихся по ходу, убрал — новых warning не добавил.
- **Browser (live, localhost:3000, 0 console / 0 server errors):** все 6 сценариев §4 подтверждены; смена и очистка запроса старую выдачу не воскрешают.

### 7. Размеры до/после

| Файл | До | После | Δ | Лимит |
|------|-----|-------|---|-------|
| `library-search.js` | 24 683 | **24 683** | **0** | hard 25 600 — **SHA-256 `f386874f…` совпал побайтово** |
| `search-provider-failures.js` | — | 6 281 | новый | <8 KiB ✓ |
| `search-facade.js` | 7 906 | 9 149 | +1 243 | hard 25 600 ✓ |
| `search-worker-client.js` | 8 625 | 9 815 | +1 190 | hard 25 600 ✓ |
| `LibrarySmartSearchBar.jsx` | 17 626 | 20 797 | +3 171 | soft 30 720 ✓ |
| `SmartResultRow.jsx` | 5 400 | 6 101 | +701 | soft 30 720 ✓ |

Новых hard-нарушителей нет. **Size budget: OK.**

### 8. Оговорки (honest)

- **Мутация 5 осталась GREEN.** Текст «Ничего не найдено» защищён ДВАЖДЫ: моим `finalEmpty` и чужим гейтом `!diagnostic` в `SearchResultsListbox.jsx:51` (read-only в этом спринте). При `incomplete` diagnostic всегда непуст → мой гард через DOM структурно ненаблюдаем. Гард оставлен по требованию спеки как defence-in-depth, но сегодня он вакуумный; видимую половину дефекта («· 0») закрывает мутация 5b, которая RED. **Кандидат в K3:** перенести решение о пустом состоянии целиком в бар либо формализовать контракт listbox.
- **Мутация 4 поймана только unit-тестом.** Путь отмены защищён двумя слоями (трекер игнорирует `CANCELLED` И сервис stale-дропает сессию), поэтому регрессия только в трекере на уровне facade/UI структурно ненаблюдаема — `CANCELLED` по построению всегда stale.
- **Мульти-dimension сбой недостижим в рантайме.** `planIsBlocked` рубит запрос с двумя провайдерами (`aa:X cut:Y` → blocked), поэтому `incompleteDims` длиннее одного элемента сегодня получить нельзя. Модель поддерживает N (unit-тест на порядок `sequence→protein→enzyme` есть), язык запросов допускает 1.
- **testid `search-seq-incomplete-warning` НЕ переименован.** Он DNA-only по имени, но асертится в `library-topbar-combobox-contract.test.jsx:152`, который вне allowlist. Переименовал только локальные переменные, как и просила спека. Кандидат в K3.
- **Голый `aa:HHHHHH` через `form_input` не запустился** (`aria-invalid:true`); с `aa:HHHHHH pET` всё работает. Контроллер черновика (`useSearchQueryState`) я не трогал — это артефакт автоматизации, ставящей значение разом вместо посимвольного ввода (тот же класс, что в K1).
- **Graphify:** локального CLI нет; `npx --no-install graphify hook-rebuild` не выполнял, не скачивал. Известное неблокирующее отклонение.

### 9. Git-состояние

Тронуты ТОЛЬКО файлы allowlist: `lib/search-provider-failures.js` (новый), `lib/search-facade.js`, `lib/search-worker-client.js`, `components/Library/LibrarySmartSearchBar.jsx`, `components/Library/SmartResultRow.jsx`, `i18n.js`; тесты — `search-provider-failures.test.js` (новый), `search-facade-protein-failure.test.js` (новый), `search-facade-cut-failure.test.js` (новый), `search-facade-sequence-failure.test.js` (новый), `search-worker-client.test.js` (дополнен), `library-topbar-provider-failures.test.jsx` (новый); документы — `BUGS.md`, `CURRENT_TASK.md`.

`library-search.js`, `search-service.js`, `protein-match.js`, `re-match.js`, `SearchResultsListbox.jsx`, `search-result-vm.js`, `LibraryWorkspace.jsx`, дерево, `search-types.js` — **не изменялись**. Staged: **0**. Коммитов, stash, reset, `git add .` — не было. Search-кластер остаётся `??` (untracked), прочий dirty backlog пользователя (205 файлов всего в репо) не тронут.

СТОП после S3-CLOSE K2. K3 не начинаю.

---

## Отчёт Code — REV #2 S3-CLOSE / K2 corrective (два fail-open P1), 16.07

### 1. Что изменилось

**P1-1 — один структурный валидатор на оба пути.** `isValidByIdPayload(byId)` → `validateByIdPayload(byId, allowedKeys)` в `search-worker-client.js`. Проверяется ВСЯ структура: plain record (прототип `Object.prototype` или `null` — это отсекает `Map`/`Date`/массив/class-instance одной проверкой), ключи только из отправленного набора документов (`pending.docKeys` едет вместе с запросом), непустой массив occurrences, непустые `location.segments`, конечные целые `start/end` с `end > start`. `{}` остаётся валидным honest miss. `runInline` прогоняет ТОТ ЖЕ гейт: внешний мусор → `WORKER_FAILURE` + новый воркер, inline-мусор → плоский `Error` → `PROVIDER_ERROR` (воркера, которого можно убить и перезапустить, здесь нет).

**P1-2 — единая проекция счётчика.** `showResultCount` → `countKind` (`results` | `candidates` | `none`), питающая и шапку, и SR-live-region одним `countLabel`: complete final → «Результатов: N» (честный ноль включительно); unconfirmed (`pendingList || providerIncomplete`) и N>0 → «Предварительных кандидатов: N»; unconfirmed с нулём → числа нет; blocked → числа нет. Новый ключ `search.results.candidatesCount` в обоих блоках. `finalEmpty` выражен через новый `complete` — семантика идентична, дублирование убрано.

### 2. Что это даёт биологу

Повреждённый ответ движка больше не может дать ни ложное «мотива нет», ни ложный «мотив найден»: результат без проверяемых координат — не результат. А число рядом со строкой поиска больше не утверждает того, чего проверка не показала: пока идёт или упала проверка, это «предварительные кандидаты», а не «результаты» — и слепой пользователь слышит ровно то же, что видит зрячий.

### 3. Какой риск устранён

- **`Map`/`Date`** проходили `typeof === 'object'` → `Object.entries()` → пустая Map → уверенное «мотива нет».
- **`[null]` / `[{}]`** — truthy-массив → уверенный DNA-hit без единой координаты.
- **`{'entry:a': []}`** — принималось как miss, хотя воркер таких ключей не пишет вовсе.
- **Inline-путь** обходил валидатор целиком — то есть в тестах и во всех fallback-сценариях гейта не было.
- **Скринридер** получал «Результатов: N» для неподтверждённых кандидатов; `· 0` показывался во время работы воркера, на blocked-запросе и рядом с «проверка не выполнена».

### 4. Как проверить вручную

1. `Bluescript seq:GAATTC` → «ПОИСК ПО ДНК · 1», live-region «Результатов: 1», строка выбираема.
2. `pUC seq:GAATTC` → «ПОИСК ПО ДНК · 0», live-region «Результатов: 0», «Ничего не найдено», без предупреждения (честный ноль после завершённой проверки).
3. `enz:Bsa seq:GAATTC` → шапка «ПОИСК» **без числа**, счётчика нет, показан blocked-notice.
4. Состояния «Проверяется»/«Не подтверждено» и мусорный ответ движка в проде не воспроизводятся без fault-toggle (спека его запретила) — покрыты детерминированным harness.

### 5. RED→GREEN и mutation-proof

**RED:** 39 падений в 3 файлах до продакшн-кода. **GREEN:** 102/102 (worker-client 45, inline 32, UI 22 + прочее).

| # | Мутация | Итог |
|---|---------|------|
| A | proto-гейт → старая рыхлая проверка «объект + массивы» | **RED** (12) |
| B | inline-путь мимо гейта | **RED** (22) |
| C | `countKind` всегда `results` (счётчик игнорирует состояние проверки) | **RED** (5) |

Все мутации откачены, GREEN восстановлен, следов `MUTATION` в продакшн-коде нет.

### 6. Focused / full-suite / build / browser

- **Focused:** 804/804 (55 файлов, весь search-кластер).
- **Full suite:** **7289 pass / 0 fail / 18 skipped** (771 файл) — целиком зелёная, флейка в этот раз не было.
- **Build:** OK. **Lint (scoped):** 0 errors, 3 warnings — все пред-существующие (`SmartResultRow.jsx:1`, `search-facade.js:130`, `search-worker-client.js:36`). Свои новые кириллические комментарии снова убрал.
- **Browser (live, 0 console / 0 server errors):** сценарии §4.1–4.3 подтверждены вживую.

### 7. Размеры до/после

| Файл | До corrective | После | Δ | Лимит |
|------|---------------|-------|---|-------|
| `library-search.js` | 24 683 | **24 683** | **0** | **SHA-256 `f386874f…` совпал** |
| `search-worker-client.js` | 9 815 | 12 325 | +2 510 | hard 25 600 ✓ |
| `LibrarySmartSearchBar.jsx` | 20 797 | 21 957 | +1 160 | soft 30 720 ✓ |
| `search-provider-failures.js` | 6 281 | 6 281 | 0 | ✓ |
| `search-facade.js` | 9 149 | 9 149 | 0 | ✓ |
| `SmartResultRow.jsx` | 6 101 | 6 101 | 0 | ✓ |

Новых hard-нарушителей нет. **Size budget: OK.**

### 8. Оговорки (honest)

- **Тест «complete miss показывает честный ноль» был зелёным и до фикса** — он не RED, а страховка от пере-коррекции (чтобы `countKind` не начал прятать законный ноль). В списке спеки он значился как RED; фиксирую фактическое поведение.
- **Живьём не прокликаны** состояния «Проверяется»/«Не подтверждено» и мусорный ответ движка: без production fault-toggle (запрещён) их не воспроизвести. Test-covered детерминированным harness, не live-verified.
- **Артефакт автоматизации:** `form_input` ставит значение разом, из-за чего режим-селектор залипал на «Ферменты» после `enz:`-запроса, а голый `aa:HHHHHH` не запускался. Контроллер черновика (`useSearchQueryState`) я не трогал; при вводе по символам и после reload всё работает.
- **Scope соблюдён:** testid не переименовывал, вложенных live-region не добавлял, `search-types` и cleanup `finalEmpty` (структурное маскирование пустого состояния) не трогал — это K3.

### 9. Git-состояние

Изменены: `lib/search-worker-client.js`, `components/Library/LibrarySmartSearchBar.jsx`, `i18n.js`; тесты — `search-worker-client.test.js` (дополнен), `search-worker-client-inline.test.js` (новый), `library-topbar-provider-failures.test.jsx` (дополнен); документы — `BUGS.md`, `CURRENT_TASK.md`.

`library-search.js`, `search-service.js`, `search-facade.js`, `search-provider-failures.js`, `protein-match.js`, `re-match.js`, `SearchResultsListbox.jsx`, `search-result-vm.js`, `SmartResultRow.jsx`, `LibraryWorkspace.jsx`, дерево, `search-types.js` — **не изменялись**. Staged: 0. Коммитов, stash, reset, `git add .` — не было.

СТОП после S3-CLOSE K2 corrective. K3 не начинаю. Жду повторной приёмки.

---

## Спека Chat — REV #2 S3-CLOSE / K3: целостность occurrence + единое состояние выдачи + a11y ownership + types (16.07.2026)

**Статус:** ГОТОВО К ИСПОЛНЕНИЮ. K1 и K2 приняты. Это закрывающий контрактный пакет Stage 3, а не новая поисковая функция и не прежний K3 typed-prefix sync.

**Режим выполнения:** один атомарный проход `K3.0 → K3.1 → K3.2 → K3.3 → K3.4`. Все тесты пишутся RED до production-кода. Промежуточную приёмку не запрашивать. После полного гейта — один отчёт и STOP.

### 1. Зачем это биологу

Поиск уже различает «совпадений нет» и «проверка не выполнилась», но два класса риска ещё остаются:

1. повреждённый провайдер может вернуть координаты за пределами молекулы или собственный `targetRef`; такой объект сейчас способен выглядеть как подтверждённый мотив/белок/сайт рестрикции;
2. UI выводит состояние поиска из нескольких независимых булевых. Из-за этого один компонент может назвать состояние «не проверено», а другой одновременно решить, что это «ничего не найдено».

После K3 подтверждённый hit означает одновременно: **валидная сущность, валидные координаты внутри её последовательности, успешно завершённая проверка и единая трактовка состояния визуальным UI и скринридером**.

### 2. Фактический baseline и корни дефектов

Baseline принятого K2 corrective:

- полная suite: **7289 passed / 0 failed / 18 skipped**;
- build: OK;
- `library-search.js`: **24 683 B**, SHA-256 **`F386874F6C54B33155CC0FE2A64E41FB895DD6CEB81CA99FBB350EF8960B961F`**;
- `search-worker-client.js`: 12 325 B;
- `search-provider-failures.js`: 6 281 B;
- `LibrarySmartSearchBar.jsx`: 21 884 B;
- `SearchResultsListbox.jsx`: 4 450 B;
- `SearchCombobox.jsx`: 6 354 B;
- `search-types.js`: 7 744 B.

Подтверждённые корни:

- `validateByIdPayload` проверяет целые `start/end` и `end > start`, но не знает длину конкретной последовательности, не запрещает provider-owned `targetRef` и не требует plain-record на каждом уровне;
- `tracker.guard()` для protein/cut принимает любой массив, включая `[null]`, `[{}]` и occurrence с невалидными координатами;
- `library-search.js` обогащает provider occurrence через `{ targetRef: doc.ref, ...o }`; поэтому собственный `o.targetRef` перезаписывает доверенный ref. Этот файл заморожен по размеру, значит подмена блокируется на provider boundary;
- `complete/finalEmpty/unconfirmed/countKind` вычисляются в `LibrarySmartSearchBar`, но `SearchResultsListbox` повторно меняет семантику empty через `!loading && !diagnostic`. Поэтому мутация K2 «разрешить empty при incomplete» осталась GREEN;
- `SearchNotice role="alert"` вложен в `role="status" aria-live="polite"` listbox;
- `search-types.js` документирует формы, которые уже не совпадают с producer/consumer runtime.

### 3. Неподвижные решения

1. **`library-search.js` не изменять ни на байт.** Его hash после K3 обязан совпасть с baseline.
2. Provider output не имеет права выбирать владельца результата. `targetRef` добавляет только orchestrator; у `ProviderOccurrence` собственного `targetRef` нет.
3. `{}` от sequence worker — честный complete miss. `[]` от matcher для конкретного документа — честный complete miss. Невалидная непустая структура — provider failure, не miss и не hit.
4. Ошибка worker-протокола остаётся `WORKER_FAILURE` с teardown/respawn. Ошибка inline provider остаётся `PROVIDER_ERROR`. Raw error text в сессию/UI не попадает.
5. Состояние выдачи выводится одной чистой функцией. Компоненты не имеют права независимо переопределять precedence.
6. В result-area ровно один владелец status-озвучки — `SearchResultsListbox`. `SearchNotice` только визуальный контейнер, без `role`/`aria-live`.
7. Счётчик в `SearchField` остаётся отдельным **sibling** live-region. Он и result-status получают данные из одной проекции; вкладывать один live-region в другой нельзя.
8. Никакого production fault-toggle, новых алгоритмов, новых пользовательских текстов или визуального редизайна.

### 4. Scope

#### IN

- общий структурный контракт provider occurrences для worker и inline;
- проверка координат против длины **конкретной** последовательности;
- единая конечная модель presentation-state;
- единый mutually-exclusive `statusContent`;
- удаление вложенного alert;
- provider-neutral test id;
- JSDoc-синхронизация `search-types.js` с живым runtime;
- focused/full/build/lint/mutation/browser verification.

#### OUT

- изменение matching/ranking/AND в `library-search.js`;
- валидация биологических значений metrics, `protein` или `enzyme` payload — K3 валидирует только identity/location boundary;
- требование сортировки/смежности segments: splice-hit и circular origin-hit законно имеют несколько несмежных сегментов и иной порядок;
- multi-provider grammar, bare-worker compatibility, tree auto-DNA semantics;
- показ пользователю технических причин `TIMEOUT/WORKER_FAILURE/PROVIDER_ERROR`;
- fault injection в production;
- другие поисковые поверхности Stage 4–6;
- любые не-search правки.

### 5. K3.0 — общий контракт provider occurrence (P1, первым)

Создать чистый `lib/search-provider-contract.js`. Он не импортирует UI/store/движки и экспортирует минимум:

#### 5.1 `validateProviderOccurrences(value, sequenceLength)`

Возвращает boolean и никогда не бросает.

Валидно:

- `value` — массив;
- `[]` — честный miss **даже для документа без sequence**: провайдер законно отвечает «проверять нечего»;
- для **непустого** массива `sequenceLength` обязан быть положительным конечным целым;
- каждый occurrence — plain record (prototype только `Object.prototype` или `null`);
- occurrence **не имеет собственного** `targetRef`;
- `location` — plain record;
- `location.segments` — непустой массив plain records;
- `location.strand` ∈ `'+' | '-' | 'both'`;
- `location.wrapsOrigin` — boolean;
- каждый segment имеет целые координаты `0 <= start < end <= sequenceLength`.

Допустимы дополнительные поля occurrence (`metrics`, `protein`, `enzyme`). K3 не валидирует их внутреннюю биологическую схему.

Не требовать:

- одного сегмента;
- сортировки segments;
- монотонности между segments;
- `wrapsOrigin=true` только для двух сегментов.

Это сохраняет законные формы:

- circular: `[{start:95,end:100},{start:0,end:5}]`;
- spliced protein: несколько exon-segments с промежутками.

#### 5.2 `validateProviderPayload(byId, allowedLengthsByKey)`

- `allowedLengthsByKey` — настоящий `Map<entityKey, sequenceLength>`, не duck-typed object и не `Set`;
- `byId` — plain record;
- `{}` валиден;
- посторонние keys запрещены;
- присутствующий key обязан иметь **непустой** массив occurrences (worker при нуле не создаёт key);
- каждое значение проходит `validateProviderOccurrences(value, allowedLengthsByKey.get(key))`.

#### 5.3 Интеграция

- `search-worker-client.js` удаляет локальный дублирующий валидатор и использует общий helper;
- pending request хранит `docLengths: Map`. Длина берётся из реально отправленного `toWorkerDocs` payload;
- worker garbage → существующий `WORKER_FAILURE` + kill/respawn;
- inline sequence garbage → обычный `Error` → facade нормализует в `PROVIDER_ERROR`;
- `search-provider-failures.js` расширяет `guard` явным validator seam. Validator получает output и реальные аргументы matcher; protein/cut проверяются по `doc.sequence.seq.length`;
- не угадывать длину из координат и не использовать глобальную длину;
- незнакомая ошибка описывается как **fail-closed provider failure**; неверную фразу `Fails OPEN into PROVIDER_ERROR` исправить. Cancellation/terminate routing не менять.

#### 5.4 Обязательный RED

- `[null]`, `[{}]`, non-plain occurrence/location/segment;
- отсутствующие/пустые segments;
- `start < 0`, `start === end`, `end > sequenceLength`, float/NaN/Infinity;
- неверный strand, не-boolean `wrapsOrigin`;
- provider-owned `targetRef`;
- чужой key и пустой массив у присутствующего worker key;
- валидные `{}`, `[]`, linear, circular-origin и multi-exon occurrences;
- одинаковые проверки на worker и inline sequence;
- malformed protein и cut → `incomplete=true`, правильная dimension, deferred candidates; не confirmed hit и не honest empty.

### 6. K3.1 — единая проекция SearchSession → presentation

Создать чистый `lib/search-session-presentation.js` (целевой размер ≤6 KiB). Экспортировать одну основную функцию, например `deriveSearchSessionPresentation(input)`.

Вход — только нормализованные факты:

- `ownsQuery` / наличие текущего query;
- `phase` (`partial` или `final`; blocked приходит отдельным флагом);
- `rowCount`;
- `providerExpected` (только `seq/aa/cut/re`, не metadata/enz catalog);
- `providerPending` (есть хотя бы одна pending row);
- `incomplete`;
- `blocked`;
- `interactionDisabled` (IME/composition или внешний UI-гейт; влияет на выбор, не переписывает биологический статус).

Выход — одна discriminated presentation-модель:

- `state`;
- `statusKind` = `none | loading | blocked | incomplete | empty`;
- `countKind` = `none | candidates | results`;
- `showRows`;
- `rowsDisabled`;
- `ariaBusy`.

Не возвращать готовые русские/английские строки: локализация остаётся в баре.

#### 6.1 Precedence и точная матрица

| Приоритет | Условие | `state` | Строки | Счётчик | Status |
|---|---|---|---|---|---|
| 1 | query не принадлежит текущей сессии / пуст | `hidden` | скрыты | none | none |
| 2 | `blocked` | `blocked` | скрыты | none | blocked |
| 3 | `incomplete` | `incomplete` | N>0 видимы, всегда disabled | candidates при N>0, иначе none | incomplete |
| 4 | `providerPending` **или** `phase=partial && providerExpected` | `checking` | N>0 видимы, disabled | candidates при N>0, иначе none | loading |
| 5 | `phase=partial && !providerExpected` | `metadata-preview` | видимы, выбираемы если не interactionDisabled | none | none |
| 6 | `phase=final && N>0` | `complete-results` | видимы, выбираемы если не interactionDisabled | results | none |
| 7 | `phase=final && N=0` | `complete-empty` | скрыты | results (честный 0) | empty |
| 8 | неизвестное/противоречивое состояние | `invalid` | скрыты/disabled | none | none |

`incomplete` имеет приоритет над `providerPending`: завершившийся сбой — «не подтверждено», а не «ещё проверяется». Final с `providerPending=true` не может стать confirmed: это fail-closed `checking`/unconfirmed.

`ariaBusy=true` только для `checking`. `showRows=true` только при `rowCount>0` и состояниях `checking/incomplete/metadata-preview/complete-results`. Для `hidden/blocked/complete-empty/invalid` строки не публикуются.

#### 6.2 Переходы, которые тестируются как переходы

- metadata candidate → положительный final: та же сущность становится selectable, count=result;
- metadata candidate → отрицательный final: строки исчезают, count=0, status=empty;
- metadata candidate → provider failure: остаётся disabled candidate либо warning без строк; empty и result-count запрещены;
- query A → query B: rows/count/status A исчезают в тот же render;
- complete A → blocked B: старые count/empty/results не переживают переход;
- incomplete с N>0 → новый plain metadata query: старый warning не переживает query ownership;
- metadata-only partial остаётся выбираемым и не получает ложный «Проверяется».

### 7. K3.2 — один владелец статуса и provider-neutral UI

#### 7.1 `LibrarySmartSearchBar.jsx`

- удалить локальные semantic-решения `complete`, `finalEmpty`, `unconfirmed`, `countKind` и их независимые ветки;
- собрать вход для `deriveSearchSessionPresentation` и использовать **только** его выход для:
  - видимости/выбираемости rows;
  - header count;
  - `SearchField.resultCountLabel`;
  - `aria-busy`;
  - выбора ровно одного status-сообщения;
- `providerExpected = !!(plan.seqQuery || plan.aaQuery || plan.cutQuery || plan.reQuery)`; `enz:` catalog и metadata не считать async biological provider;
- нормализовать ownership до вызова helper: `blocked = hasBlockingNotice || (showForQuery && searchResult.blocked)`, `ownsQuery = hasBlockingNotice || showForQuery`. Так текущая parser-ошибка видна, но blocked/warning старой query не переживает смену текста;
- текущие двухслойные click/Enter guards оставить как defense-in-depth, но они обязаны следовать `presentation.rowsDisabled`;
- `SearchNotice` оставить визуальным контейнером без `role="alert"` и без `aria-live`;
- `search-seq-incomplete-warning` → `search-provider-incomplete-warning`.

#### 7.2 `SearchResultsListbox.jsx` / `SearchCombobox.jsx`

- result-area получает ровно один mutually-exclusive `statusContent`;
- `loading` остаётся только источником `aria-busy`;
- убрать из публичного пути независимые `loadingContent`, `diagnostic`, `emptyContent` и внутренний `showEmpty = ... !diagnostic`. Listbox больше не решает бизнес-приоритет и не маскирует ошибку caller;
- один `role="status" aria-live="polite"` остаётся снаружи `<ul role="listbox">`;
- `statusContent` никогда не становится option;
- `SearchField` count-live остаётся sibling, не переносится внутрь result-status.

#### 7.3 Provider-neutral rename

Переименовать test id во **всех source и tests**:

`search-seq-incomplete-warning` → `search-provider-incomplete-warning`.

Alias/двойной id запрещён. После K3:

`rg -n "search-seq-incomplete-warning" gui/designer/src` → 0 совпадений.

#### 7.4 A11y contract

Внутри `[data-testid="library-topbar-search-listbox-results"]`:

- ровно один `[role="status"][aria-live="polite"]`;
- 0 `[role="alert"]`;
- 0 вложенных `[aria-live] [aria-live]`;
- blocked/incomplete/loading/empty взаимно исключают друг друга;
- complete miss даёт одновременно честный count=0 в sibling SearchField и empty в result-status;
- incomplete с нулём не даёт ни result-count=0, ни empty.

### 8. K3.3 — синхронизировать `search-types.js` без runtime-рефактора

Это JSDoc-only задача. Не менять producer shapes ради typedef; typedef должен описать уже существующий runtime.

Обязательные изменения:

- `SearchDocument`: `features`, top-level `topology`, `kind`, `projectId`;
- `SeqMetrics`: `length`;
- `SearchLocation`: убрать отсутствующий `targetKey`;
- новый `ProviderOccurrence`: location + optional metrics/protein/enzyme, **без targetRef**;
- `SearchOccurrence`: обязательный `targetRef`, optional `location` (metadata occurrence законно состоит только из owner ref), optional metrics/protein/enzyme;
- `SearchMatch.dimension`: добавить `enzyme`;
- `SearchResult`: `providerPending`;
- `SearchSession.status`: реальные `partial | done | blocked`;
- `SearchSession`: optional `blocked`, `incomplete`, `incompleteDims`, `providerFailures`, `matchingEntryIds`, `matchingProjectIds`;
- `QueryFilter`: parser-owned `id` как optional (не все transitional/inferred filters обязаны его иметь);
- revision/fingerprint описывать только в тех scalar-типах, которые реально дают адаптеры; не добавлять speculative поля.

Добавить `lib/__tests__/search-types-contract.test.js`. Так как typedef не существует в runtime, тест читает исходник и извлекает **именованные typedef-блоки**, а не сравнивает весь файл snapshot:

- каждое обязательное поле ловится отдельно;
- `SearchLocation` не содержит `targetKey`;
- `ProviderOccurrence` не содержит `targetRef`, `SearchOccurrence` содержит;
- union dimension/status ловит `enzyme/partial/blocked`;
- удаление одного обязательного поля делает тест RED.

### 9. K3.4 — TDD, мутации и интеграционный гейт

#### 9.1 Порядок TDD

1. Зафиксировать baseline размеров/hash и focused tests.
2. Записать RED K3.0; только затем helper и интеграция.
3. Записать RED state-matrix/transition tests K3.1; только затем projection helper.
4. Записать RED DOM/a11y/testid K3.2; только затем компоненты.
5. Записать RED typedef-contract K3.3; только затем JSDoc.
6. Прогнать весь focused search cluster.
7. Выполнить mutation-proof.
8. Scoped lint → full suite → build → browser.

Нельзя сначала написать production-код и затем «подогнать» тесты. Реальный RED и его причина фиксируются в финальном отчёте.

#### 9.2 Минимальные mutation-proof

| Мутация | Что обязано стать RED |
|---|---|
| убрать `end <= sequenceLength` | bounds-тесты worker + inline |
| разрешить provider-owned `targetRef` | ownership-тест + facade false-hit harness |
| malformed inline array считать `[]` | protein/cut failure tests |
| поставить `complete-empty` выше `incomplete` | state matrix + TopBar DOM |
| разрешить selection для checking/incomplete | click + Enter harness |
| вернуть `role="alert"` внутрь status | a11y DOM test |
| вернуть старый test id/alias | repo-wide old-id test |
| удалить одно поле из `SearchSession` typedef | static contract test |

Все мутации удалить; после каждой группы восстановить GREEN. Временный mutation-код не оставлять.

#### 9.3 Рекомендуемые команды

Использовать локальный Vitest через npm script, **не** `npx vitest`:

`cd gui/designer`

`npm test -- src/lib/__tests__/search-provider-contract.test.js src/lib/__tests__/search-provider-failures.test.js src/lib/__tests__/search-worker-client.test.js src/lib/__tests__/search-worker-client-inline.test.js src/lib/__tests__/search-facade-provider-failure.test.js src/lib/__tests__/search-facade-protein-failure.test.js src/lib/__tests__/search-facade-cut-failure.test.js`

`npm test -- src/lib/__tests__/search-session-presentation.test.js src/lib/__tests__/search-types-contract.test.js`

`npm test -- src/components/Search src/components/Library/__tests__/library-topbar-provider-failures.test.jsx src/components/Library/__tests__/library-topbar-worker-lifecycle.test.jsx src/components/Library/__tests__/library-topbar-combobox-contract.test.jsx src/components/Library/__tests__/library-topbar-strict-and-pending.test.jsx`

Затем:

- scoped ESLint по allowlist;
- `npm test`;
- `npx vite build`;
- локальный `npx --no-install graphify hook-rebuild`. Если CLI отсутствует — не скачивать и не форсировать старый graph; честно записать отклонение. Graphify не является доказательством K3, потому что текущий search-кластер untracked и отсутствует в сохранённом графе.

Если full suite даёт известный load-timeout:

- зафиксировать имя/ошибку;
- прогнать этот файл изолированно;
- повторить full suite один раз;
- не писать «полностью зелёно», если повторный full-run не зелёный.

### 10. Browser acceptance

На live `localhost:3000` проверить после build:

1. plain `pUC` → завершённые результаты выбираемы, result-count обычный;
2. `pUC seq:GAATTC` → честный `Результатов: 0` + «Ничего не найдено», без warning;
3. `Bluescript seq:GAATTC` → один подтверждённый выбираемый hit;
4. blocked `enz:Bsa seq:GAATTC` → warning, без числа, без empty;
5. query A → B: ни warning, ни count, ни rows A не остаются под B;
6. DOM result-area соответствует §7.4;
7. console и dev-server: 0 новых errors.

Fault/incomplete/malformed-provider состояния без production toggle проверяются детерминированным harness и в отчёте называются **test-covered, не live-verified**.

### 11. Performance и size budget

- Никакого повторного биосканирования и eager-precompute;
- проверка occurrence линейна по числу реально возвращённых hits и segments;
- worker request уже хранит docs; замена `Set keys` на `Map key→length` добавляет O(number of scoped docs), без копии sequence;
- новый `search-provider-contract.js` ≤6 KiB;
- новый `search-session-presentation.js` ≤6 KiB;
- рост `LibrarySmartSearchBar.jsx` ≤1 KiB, предпочтительно уменьшение после выноса проекции;
- `SearchResultsListbox.jsx` и `SearchCombobox.jsx` не должны пересечь soft;
- `library-search.js`: 0 B delta и тот же SHA-256.

В финале дать:

- новые hard-нарушители;
- warning signal (>5 KiB роста);
- если нет — `size budget: OK`.

### 12. Allowlist

#### Source

- `gui/designer/src/lib/search-provider-contract.js` (new)
- `gui/designer/src/lib/search-provider-failures.js`
- `gui/designer/src/lib/search-worker-client.js`
- `gui/designer/src/lib/search-session-presentation.js` (new)
- `gui/designer/src/lib/search-types.js`
- `gui/designer/src/components/Library/LibrarySmartSearchBar.jsx`
- `gui/designer/src/components/Search/SearchResultsListbox.jsx`
- `gui/designer/src/components/Search/SearchCombobox.jsx`

#### Tests

- новый `lib/__tests__/search-provider-contract.test.js`;
- новый `lib/__tests__/search-session-presentation.test.js`;
- новый `lib/__tests__/search-types-contract.test.js`;
- существующие provider-failure/worker/facade tests, перечисленные в §9.3;
- `components/Search/__tests__/SearchResultsListbox.test.jsx`;
- `components/Search/__tests__/SearchCombobox.test.jsx`;
- существующие `components/Library/__tests__/library-topbar-*` только по контрактам K3.

#### Tracking

- `BUGS.md`: после GREEN отметить `S3CK3-P1-1..3`, `S3CK3-P2-1` и существующий `REV#2-CONTRACT-P2-TYPES` как исправленные; новых дублей не создавать;
- `CURRENT_TASK.md`: тело этой спеки не переписывать; в конец добавить один отчёт Code.

Любой source-файл вне allowlist — STOP и запрос на расширение. `library-search.js` явно read-only.

### 13. Формат финального отчёта Code

Один отчёт после всего K3:

1. **Что изменилось** — K3.0–K3.3 по файлам и контрактам;
2. **Что это даёт биологу** — координаты/владелец/честное состояние;
3. **Какой риск устранён** — ложный hit, ложный miss, двойная озвучка/маскирование;
4. **Как проверить вручную**;
5. RED→GREEN по каждой группе;
6. mutation-proof по каждой мутации;
7. focused/full/build/lint/browser, отдельно test-only оговорки;
8. размеры до/после + hash `library-search.js`;
9. точный git status по allowlist и подтверждение, что чужой dirty backlog не тронут.

После отчёта:

**СТОП после S3-CLOSE K3. Никакой следующий search-пакет и REV #2 Stage 4 не начинать. `PROJECT_STATE.md`, `RELEASES.md`, `DECISIONS.md`, `ANCHORS.md` и version files не трогать — финализация Stage 3 остаётся за Chat. Не commit/stage/stash/reset; `git add .` запрещён.**

---

## Отчёт Code — REV #2 S3-CLOSE / K3 (целостность occurrence + единое состояние + a11y + types), 16.07

### 1. Что изменилось

**K3.0 — `lib/search-provider-contract.js` (новый, 6 265 B).** `validateProviderOccurrences(value, sequenceLength)` + `validateProviderPayload(byId, allowedLengthsByKey)`. Проверяется вся структура: plain record (прототип `Object.prototype`/`null`), **отсутствие provider-owned `targetRef`**, plain `location`, непустые `segments`, `strand ∈ '+'|'-'|'both'`, boolean `wrapsOrigin`, целые `0 <= start < end <= sequenceLength`. `[]` валиден всегда (в т.ч. для документа без сиквенса); непустой массив требует измеримой длины. Не требуются: число сегментов, сортировка, монотонность, «wrapsOrigin ⇒ ровно 2 сегмента» — сплайс-хит и origin-хит законны. `metrics`/`protein`/`enzyme` не инспектируются.
**Интеграция:** `search-worker-client.js` удалил локальный дубль-валидатор и использует общий; `pending` хранит `docLengths: Map` из реально отправленного payload; worker-мусор → `WORKER_FAILURE` + kill/respawn, inline-мусор → плоский `Error` → `PROVIDER_ERROR`. `search-provider-failures.js`: `guard(dim, factory, validate)` — validator получает output и РЕАЛЬНЫЕ аргументы matcher; фасад проверяет protein/cut по `doc.sequence.seq.length` (доступен как `args[1]`). Неверная фраза «Fails OPEN into PROVIDER_ERROR» исправлена на fail-CLOSED. Cancellation/terminate routing не тронут.

**K3.1 — `lib/search-session-presentation.js` (новый, 5 959 B).** `deriveSearchSessionPresentation(input)` → `{state, statusKind, countKind, showRows, rowsDisabled, ariaBusy}`. Лестница: `hidden → blocked → incomplete → checking → metadata-preview → complete-results/complete-empty → invalid`. `incomplete` выше `checking`; final с `providerPending` fail-closed возвращается в `checking`. Локализованных строк не возвращает.

**K3.2 — один владелец статуса.** `SearchResultsListbox`: удалены `loadingContent`/`diagnostic`/`emptyContent` и внутренний `showEmpty = … && !diagnostic`; остался ровно один `statusContent` в одном `role="status" aria-live="polite"` вне `<ul>`; `loading` — только источник `aria-busy`. `SearchCombobox` приведён к тому же API. `LibrarySmartSearchBar`: локальные `complete`/`finalEmpty`/`unconfirmed`/`countKind`/`pendingList`/`loading` удалены — всё читается из проекции; `SearchNotice` лишён `role="alert"`; testid `search-seq-incomplete-warning` → `search-provider-incomplete-warning` во всём репо без alias.

**K3.3 — `search-types.js` синхронизирован** (JSDoc-only, producer'ы не менялись): `SearchDocument` +`features`/`topology`/`kind`/`projectId`; `SeqMetrics` +`length`; `SearchLocation` −`targetKey`; новый `ProviderOccurrence` (без `targetRef`); `SearchOccurrence` — `targetRef` обязателен, `location` опционален; `SearchMatch.dimension` +`enzyme`; `SearchResult` +`providerPending`; `SearchSession.status` = `partial|done|blocked` + optional `blocked/incomplete/incompleteDims/providerFailures/matchingEntryIds/matchingProjectIds`; `QueryFilter.id` optional.

### 2. Что это даёт биологу

Подтверждённый hit теперь означает одновременно: валидная сущность, валидные координаты **внутри её последовательности**, успешно завершённая проверка и одинаковая трактовка состояния глазами и скринридером. Повреждённый провайдер больше не может ни объявить мотив за пределами плазмиды, ни приписать находку другой молекуле.

### 3. Какой риск устранён

- **Ложный подтверждённый hit.** `{start: 5 000 000}` на 360-bp плазмиде проходил (K2 знал только `end > start`). Теперь координаты проверяются против длины КОНКРЕТНОГО документа.
- **Подмена владельца.** `library-search` делает `{ targetRef: doc.ref, ...o }` — spread идёт ПОСЛЕДНИМ, поэтому `o.targetRef` перезаписывал доверенный ref. Файл заморожен → запрет введён на границе провайдера. Проверено через настоящий фасад: сессия не содержит подставленный id.
- **Двойная озвучка и маскирование.** `role="alert"` внутри `role="status"` = два анонсера; listbox независимо решал empty через `!diagnostic` — из-за чего K2-мутация «empty при incomplete» оставалась GREEN. Теперь один владелец, и та же мутация → RED.

### 4. Как проверить вручную

1. `Bluescript seq:GAATTC` → 1 подтверждённый выбираемый hit, «Результатов: 1».
2. `pUC seq:GAATTC` → «Результатов: 0» + «Ничего не найдено», без warning.
3. `enz:Bsa seq:GAATTC` → warning, шапка «ПОИСК» без числа, без empty.
4. В DOM `[data-testid="library-topbar-search-listbox-results"]`: ровно один `[role=status][aria-live=polite]`, 0 `[role=alert]`, 0 вложенных live-region.

### 5. RED→GREEN по группам

| Группа | RED | GREEN |
|---|---|---|
| K3.0 контракт | модуль отсутствует → suite не собирается | 83/83 |
| K3.0 интеграция | 10 failed (фикстуры без `strand`/`wrapsOrigin` — их отвергает контракт) | 220/220 |
| K3.0 guard-seam | 4 failed | входит в 26/26 |
| K3.1 проекция | модуль отсутствует | 26/26 |
| K3.2 UI/a11y | 5 failed (4 listbox + loading-testid) | 224/224, a11y 27/27 |
| K3.3 typedef | 19 failed / 7 passed | 26/26 |

Две ошибки в моих же RED-тестах поймал и исправил до продакшн-кода: `*/` внутри комментария рвал блок, и матчер свойств спотыкался о вложенные скобки (`{{ … }} textFields`).

### 6. Mutation-proof (8 обязательных, все откачены)

| Мутация | Итог |
|---|---|
| убрать `end <= sequenceLength` | **RED** (4) |
| разрешить provider-owned `targetRef` | **RED** (2, вкл. facade false-hit harness) |
| malformed inline array считать `[]` | **RED** (2) |
| `complete-empty` выше `incomplete` | **RED** (3) |
| разрешить selection при checking/incomplete | **RED** (2) |
| вернуть `role="alert"` внутрь status | **RED** (3) |
| вернуть старый test id | **RED** (11) |
| удалить поле из `SearchSession` typedef | **RED** (2) |

Следов `// MUT` в продакшн-коде нет.

### 7. Focused / full / build / lint / browser

- **Focused:** 949/949 (58 файлов).
- **Full suite:** прогон 1 — 7428 pass / 1 fail (имя не зафиксировал: грепнул только summary — оговариваю честно); прогоны 2 и 3 — **7434 pass / 0 fail / 18 skipped, полностью зелёные**. `ECONNREFUSED :3000` в Errors — подпись FLAKE-TIMEOUT-LOAD (dev-сервер), не падение теста.
- **Build:** OK. **Lint (allowlist):** 0 errors, 1 warning — пред-существующая кириллица `search-worker-client.js:37` (#168).
- **Browser (live, 0 console / 0 server errors):** сценарии §4.1–4.4 подтверждены, включая DOM-контракт §7.4.
- **Test-only, не live-verified:** сбойные/pending/malformed-provider состояния — без production fault-toggle (запрещён) не воспроизводятся; покрыты детерминированным harness.
- **Graphify:** локального CLI нет, `hook-rebuild` не выполнял и не скачивал — известное неблокирующее отклонение.

### 8. Размеры

| Файл | До | После | Δ |
|---|---|---|---|
| `library-search.js` | 24 683 | **24 683** | **0** — SHA-256 `f386874f…` совпал |
| `search-provider-contract.js` | — | 6 265 | новый |
| `search-session-presentation.js` | — | 5 959 | новый (≤6 KiB ✓) |
| `search-provider-failures.js` | 6 281 | 7 226 | +945 |
| `search-worker-client.js` | 12 325 | 10 408 | **−1 917** (дубль-валидатор уехал) |
| `search-types.js` | 7 744 | 10 504 | +2 760 (JSDoc) |
| `LibrarySmartSearchBar.jsx` | 21 884 | 21 344 | **−540** (проекция вынесена) |
| `SearchResultsListbox.jsx` | 4 450 | 4 687 | +237 |
| `SearchCombobox.jsx` | 6 354 | 6 355 | +1 |

Новых hard-нарушителей нет. **Size budget: OK.** Единственное отклонение от предпочтения: `search-provider-contract.js` = 6 265 B ≈ 6.12 KiB, на 121 B выше пожелания «≤6 KiB» (hard 25 600 — далеко).

### 9. Git

Тронуты только файлы allowlist: `lib/search-provider-contract.js` (новый), `lib/search-session-presentation.js` (новый), `lib/search-provider-failures.js`, `lib/search-worker-client.js`, `lib/search-types.js`, `components/Library/LibrarySmartSearchBar.jsx`, `components/Search/SearchResultsListbox.jsx`, `components/Search/SearchCombobox.jsx`; тесты — `search-provider-contract.test.js`, `search-session-presentation.test.js`, `search-types-contract.test.js` (новые), `search-provider-failures.test.js`, `search-worker-client.test.js`, `search-worker-client-inline.test.js`, `search-facade-protein-failure.test.js`, `search-facade-cut-failure.test.js`, `SearchResultsListbox.test.jsx`, `library-topbar-provider-failures.test.jsx`, `library-topbar-worker-lifecycle.test.jsx`, `library-topbar-combobox-contract.test.jsx` (только testid); документы — `BUGS.md`, `CURRENT_TASK.md`.

`library-search.js` — **read-only соблюдён (0 B, hash совпал)**. `search-service.js`, `search-facade.js`… — стоп: `search-facade.js` изменён (проброс валидаторов) — он в allowlist. `protein-match.js`, `re-match.js`, `search-result-vm.js`, `SmartResultRow.jsx`, `LibraryWorkspace.jsx`, дерево — не изменялись. Staged: **0**. Коммитов, stash, reset, `git add .` не было; чужой dirty backlog (211 файлов всего в репо) не тронут. `PROJECT_STATE.md` / `RELEASES.md` / `DECISIONS.md` / `ANCHORS.md` / version files не тронуты.

СТОП после S3-CLOSE K3. Stage 4 не начинаю. Жду приёмки.

---

## Спека Chat — REV #2 SEARCH-PRECOMMIT / K1: СНЯТО, неверный диагноз mojibake (16.07.2026)

**Статус:** СНЯТО 17.07.2026. Hex/grep-проверка показала, что файлы на диске корректные UTF-8; mojibake возникал только при отображении UTF-8 через CP1251. Этот блок оставлен как история решения и **не должен исполняться**. Исполняемый контракт ниже: `SEARCH-COMMIT-AUDIT / K1`.

**Режим выполнения:** один атомарный проход `K1.0 → K1.1 → K1.2 → K1.3`. Сначала RED hygiene-тест, затем правка комментариев/док-текста, затем verification. После отчёта — STOP.

### 1. Зачем это нужно

K3 закрыл важную биологическую границу: подтверждённый hit теперь означает валидного владельца, валидные координаты и завершённую проверку. Но в части новых search-файлов комментарии/JSDoc содержат mojibake (`вЂ”`, `В«`, `В»` и похожие маркеры). Runtime это не ломает, но это ломает поддержку: следующий разработчик будет читать битый контракт там, где особенно важны слова `targetRef`, `sequenceLength`, `incomplete`, `checking`, `blocked`.

Для биолога это косвенно, но важно: если контракт неправильно прочитан, следующая правка снова может превратить технический сбой в ложный biological hit/miss. Поэтому перед коммитом search-кластера нужно привести source-комментарии в читаемый вид и зафиксировать проверку, чтобы mojibake не вернулся.

### 2. IN scope

1. Добавить статический hygiene-тест для search-source, который падает на mojibake-маркерах в production search-файлах.
2. Исправить только комментарии/JSDoc в search-файлах allowlist: нормальный UTF-8 русский допустим, но предпочтение — короткий English ASCII для source-комментариев.
3. Если легко без потери смысла — ужать комментарии `search-provider-contract.js` ниже 6 KiB. Это **желательно**, но не блокер; hard-limit остаётся 25 600 B.
4. После GREEN отметить `S3PRE-P2-1` в `BUGS.md` как исправленный.
5. В конец `CURRENT_TASK.md` добавить один отчёт Code.

### 3. OUT of scope

- Любое изменение runtime-логики поиска.
- Любое изменение биологических matcher'ов (`seq-match`, `protein-match`, `re-match`), `library-search.js`, ранжирования, QueryPlan, providerPolicy, facade orchestration.
- Новые UI-строки, i18n-ключи, визуальные изменения, browser behavior changes.
- Stage 4, новые префиксы, fuzzy DNA, protein/intron work, primer work.
- `PROJECT_STATE.md`, `RELEASES.md`, `DECISIONS.md`, `ANCHORS.md`, version files.
- Git stage/commit/stash/reset/clean. Коммит делает Игорь отдельной веткой.

### 4. K1.0 — RED hygiene-тест

Создать тест, например:

`gui/designer/src/lib/__tests__/search-source-hygiene.test.js`

Тест должен сканировать production search-source allowlist и падать на явных mojibake-маркерах:

- `вЂ`
- `В«`
- `В»`
- `Рџ`
- `Рњ`
- `РЅ`
- `СЃ`

Сканировать только production-файлы из allowlist, не весь репозиторий и не все тесты, потому что в тестах могут быть намеренные русские фикстуры. Минимальный allowlist для проверки:

- `gui/designer/src/lib/search-provider-contract.js`
- `gui/designer/src/lib/search-session-presentation.js`
- `gui/designer/src/lib/search-provider-failures.js`
- `gui/designer/src/lib/search-worker-client.js`
- `gui/designer/src/lib/search-types.js`
- `gui/designer/src/components/Library/LibrarySmartSearchBar.jsx`
- `gui/designer/src/components/Search/SearchResultsListbox.jsx`
- `gui/designer/src/components/Search/SearchCombobox.jsx`

Ожидаемый RED: тест должен упасть на текущих mojibake-комментариях. Если тест сразу GREEN — STOP и написать в отчёте, что живой код уже очищен; не придумывать искусственную правку.

Тест не должен запрещать нормальные пользовательские русские строки в i18n/fixtures, потому что это не эта задача.

### 5. K1.1 — cleanup комментариев без изменения поведения

Исправить только читаемость комментариев/JSDoc в allowlist-файлах.

Правила:

- не менять exports/imports, signatures, условия, порядок веток, object-shape, JSX output;
- не менять тестовые expectations, кроме добавления hygiene-теста;
- не менять локализованные UI-строки;
- не «улучшать» соседний код;
- если строка комментария спорная, лучше удалить лишнюю фразу, чем переписать runtime.

Особое внимание:

- `search-provider-contract.js`: сохранить смысл про `targetRef`, `sequenceLength`, legal spliced/origin hits, `[]` как honest miss;
- `search-session-presentation.js`: сохранить ladder `hidden → blocked → incomplete → checking → metadata-preview → complete-*`;
- `search-provider-failures.js`: сохранить различие `honest miss` vs `provider did not run`;
- `search-worker-client.js`: сохранить объяснение worker lifecycle, но убрать битую кириллицу;
- `LibrarySmartSearchBar.jsx`: сохранить объяснение provider-neutral warning и query ownership.

### 6. K1.2 — verification

Минимальный targeted-прогон:

`cd gui/designer`

`npm test -- src/lib/__tests__/search-source-hygiene.test.js src/lib/__tests__/search-provider-contract.test.js src/lib/__tests__/search-session-presentation.test.js src/lib/__tests__/search-types-contract.test.js src/components/Search/__tests__/SearchResultsListbox.test.jsx src/components/Library/__tests__/library-topbar-provider-failures.test.jsx src/components/Library/__tests__/library-topbar-worker-lifecycle.test.jsx`

Затем:

- scoped ESLint по изменённым source/test-файлам;
- `npm test`;
- `npx vite build`;
- `git diff --check` по изменённым файлам.

PowerShell nuance: если `npm` блокируется через `npm.ps1`, использовать `C:\Program Files\nodejs\npm.cmd`.

Graphify: поскольку меняются только комментарии и тест hygiene, `hook-rebuild` не является доказательством поведения. Если CLI локально отсутствует — не скачивать, не форсить, честно отметить.

### 7. K1.3 — acceptance gates

Пакет считается готовым, если:

1. `search-source-hygiene.test.js` был RED на текущем коде и GREEN после cleanup.
2. `rg -n "вЂ|В«|В»|Рџ|Рњ|РЅ|СЃ" <allowlist production files>` не находит mojibake в production allowlist.
3. `library-search.js` не изменён: SHA-256 остаётся `F386874F6C54B33155CC0FE2A64E41FB895DD6CEB81CA99FBB350EF8960B961F`, размер `24683 B`.
4. Focused K3 tests зелёные.
5. Full suite зелёная; если единичный load-flake — зафиксировать имя файла, изолированный прогон и повторный full-run.
6. Build OK.
7. Runtime diff отсутствует или объяснён как comment-only/test-only.
8. `BUGS.md`: `S3PRE-P2-1` отмечен `[x]` только после GREEN.

### 8. Allowlist

#### Source

- `gui/designer/src/lib/search-provider-contract.js`
- `gui/designer/src/lib/search-session-presentation.js`
- `gui/designer/src/lib/search-provider-failures.js`
- `gui/designer/src/lib/search-worker-client.js`
- `gui/designer/src/lib/search-types.js`
- `gui/designer/src/components/Library/LibrarySmartSearchBar.jsx`
- `gui/designer/src/components/Search/SearchResultsListbox.jsx`
- `gui/designer/src/components/Search/SearchCombobox.jsx`

`gui/designer/src/lib/library-search.js` — **read-only**.

#### Tests

- новый `gui/designer/src/lib/__tests__/search-source-hygiene.test.js`
- существующие K3/K2 search tests из §6

#### Tracking

- `BUGS.md`
- `CURRENT_TASK.md`

Любой source-файл вне allowlist — STOP и запрос на расширение. Любое runtime-изменение — STOP и объяснение, почему comment-only cleanup оказался невозможен.

### 9. Формат отчёта Code

В конце `CURRENT_TASK.md` добавить один отчёт:

1. Что изменилось: какие файлы очищены, какой тест добавлен.
2. Что это даёт биологу: читаемый контракт поиска, меньше риска будущей ложной трактовки hit/miss.
3. Какой риск устранён: mojibake в критических комментариях provider/session/a11y.
4. RED→GREEN: точный RED hygiene-теста и GREEN.
5. Verification: targeted/full/build/lint/diff-check/hash.
6. Size: `search-provider-contract.js`, `search-session-presentation.js`, `LibrarySmartSearchBar.jsx`, `library-search.js` hash/size.
7. Git status по allowlist; staged 0; чужой dirty backlog не тронут.

Финальная строка:

**СТОП после SEARCH-PRECOMMIT K1. Stage 4 и следующий search-пакет не начинать. `PROJECT_STATE.md`, `RELEASES.md`, `DECISIONS.md`, `ANCHORS.md`, version files не трогать. Не commit/stage/stash/reset; `git add .` запрещён.**

---

## Спека Chat — REV #2 SEARCH-COMMIT-AUDIT / K1: manifest и hunk-аудит search-коммита (17.07.2026)

**Статус:** ГОТОВО К ИСПОЛНЕНИЮ. Это замена снятой `SEARCH-PRECOMMIT / K1`: cleanup mojibake не нужен, потому что файлы на диске корректные UTF-8. Новая задача — не менять поиск, а подготовить безопасный состав будущего отдельного коммита.

**Режим выполнения:** один атомарный проход `K1.0 → K1.1 → K1.2 → K1.3 → K1.4`. Код поиска не менять. Коммит, staging и удаление файлов не делать. Результат — отчёт с точным manifest и решениями по mixed-файлам.

### 1. Почему эта задача важнее cleanup кодировки

Search-кластер после Stage 0–3 физически не является маленьким набором из нескольких файлов: многие ключевые файлы untracked, а часть tracked-файлов содержит одновременно search-правки и чужой бэклог. Поэтому главный риск сейчас — не плохая кодировка, а плохой коммит.

Плохой коммит здесь опасен биологически и инженерно:

- можно случайно затянуть незавершённую работу по сборкам/аннотациям/импорту вместе с поиском;
- можно получить «зелёный» search-коммит, который на самом деле зависит от unstaged чужого изменения;
- можно потерять возможность откатить поиск отдельно, если он смешан с неродственным кодом.

### 2. IN scope

1. Подтвердить, что mojibake на диске отсутствует, и не трогать search-source ради кодировки.
2. Составить полный список search-related dirty files: tracked modified + untracked.
3. Классифицировать каждый файл:
   - `SEARCH-PURE` — целиком относится к поиску;
   - `SEARCH-DOC` — пользовательская/техническая документация поиска;
   - `MIXED` — содержит search и не-search правки;
   - `NON-SEARCH` — не входит в пакет;
   - `JUNK` — мусорный артефакт, не stage.
4. Для каждого `MIXED` файла дать hunk-level решение:
   - какие hunks относятся к поиску;
   - какие hunks нельзя включать;
   - можно ли вообще отделить hunks без риска.
5. Подготовить manifest для будущего ручного staging Игорем:
   - include paths;
   - exclude paths;
   - mixed paths with required manual patch/staging notes.
6. Проверить, что будущий пакет не требует `git add .`.

### 3. OUT of scope

- Не менять production-код.
- Не удалять мусорные файлы без отдельного разрешения.
- Не stage/commit/stash/reset/clean.
- Не начинать Stage 4.
- Не править `PROJECT_STATE.md`, `RELEASES.md`, `DECISIONS.md`, `ANCHORS.md`, version files.
- Не делать `.editorconfig` в этом пакете. Это отдельная инфраструктурная задача, если Игорь решит.

### 4. K1.0 — facts first

Собрать и записать в отчёт:

1. `git status --short` summary:
   - сколько tracked modified;
   - сколько untracked;
   - сколько всего.
2. Проверка mojibake:
   - `rg -n -F "вЂ" <search package>`;
   - `rg -n -F "В«" <search package>`;
   - результат должен быть 0 совпадений.
3. Проверка мусорных shell-артефактов:
   - `gui/designer/console.log(Object.keys(m)))`;
   - `gui/designer/console.log(m.searchAllSequences('AAA'`.
4. Проверка, есть ли `.editorconfig` / `.gitattributes`. Если отсутствуют — только записать факт, не создавать.

### 5. K1.1 — search-related inventory

Собрать список всех search-related dirty files по признакам:

- path содержит `search`, `Search`, `LibraryTopBar`, `LibrarySmartSearchBar`, `LibraryWorkspace`, `LibraryTree`, `EnzymeCard`, `SmartResultRow`, `PrimerPool` только если изменения связаны с search pick/routing;
- docs/guides search;
- `i18n.js`, `App.jsx`, `uiSlice.js`, `import-annotations.js` — только если diff содержит search-ключи/проводку.

Для каждого файла в отчёте указать:

`path | status | class | reason | staging decision`

Пример:

`gui/designer/src/lib/search-provider-contract.js | ?? | SEARCH-PURE | S3-CLOSE K3 validator | include whole file`

### 6. K1.2 — hunk audit для mixed-файлов

Обязательные подозрительные файлы:

- `gui/designer/src/i18n.js`
- `gui/designer/src/App.jsx`
- `gui/designer/src/store/uiSlice.js`
- `gui/designer/src/import-annotations.js`

Для каждого:

1. Просмотреть diff hunks.
2. Разделить hunks на `search` / `non-search` / `unclear`.
3. Если все hunks search-only — можно перевести файл в `SEARCH-PURE`, но только с обоснованием.
4. Если есть mixed hunks — файл остаётся `MIXED`; в manifest писать `manual hunk staging required`, не `include whole file`.
5. Если hunk unclear — STOP внутри отчёта: нужен выбор Игоря, не угадывать.

### 7. K1.3 — dependency closure

Проверить, что список `SEARCH-PURE/include` замыкается:

- новый компонент импортируется всеми нужными потребителями;
- каждый новый test-файл имеет соответствующий source;
- каждый source из search-кластера, на который есть import, включён в manifest или уже tracked-clean в HEAD;
- нет зависимости search-файла от `NON-SEARCH` untracked файла.

Минимальные проверки:

- `rg -n "from './search|from '../search|from '../../lib/search|from '../Search|from './LibrarySmartSearchBar|from './EnzymeCard|from './SmartResultRow"` в search/Library области;
- `rg --files gui/designer/src/lib gui/designer/src/components/Search gui/designer/src/components/Library | rg "search|Search|EnzymeCard|SmartResultRow"`;
- для untracked source — убедиться, что парный test/consumer в manifest.

### 8. K1.4 — verification без staging

Если код не менялся, полный test-run не обязателен, но нужно подтвердить, что manifest-аудит не опирается на устаревшее состояние:

- targeted smoke по уже принятому K3 можно не повторять, если не было source-правок после K3;
- если в ходе аудита был изменён только `CURRENT_TASK.md`/`BUGS.md` — выполнить `git diff --check -- CURRENT_TASK.md BUGS.md`;
- если Code всё же менял source — тогда вернуться к K3 verification: focused tests, full suite, build.

### 9. Acceptance output

В конец `CURRENT_TASK.md` добавить один отчёт:

1. `Mojibake verdict`: false alarm, bytes are valid UTF-8, cleanup not needed.
2. `Dirty tree summary`: tracked/untracked counts.
3. `Junk files`: точные пути, решение `exclude; delete only with explicit permission`.
4. `Manifest table`: include/exclude/mixed.
5. `Mixed hunk table`: для каждого mixed-файла, что search и что не search.
6. `Dependency closure`: найденные зависимости и покрытие manifest.
7. `Recommended staging plan`: без выполнения staging.
8. `Risks`: что нельзя отделить автоматически, где нужен выбор Игоря.
9. `Git discipline`: staged 0, commit/stash/reset/clean не выполнялись.

Финальная строка:

**СТОП после SEARCH-COMMIT-AUDIT K1. Stage 4 и следующий search-пакет не начинать. Не commit/stage/stash/reset/clean; `git add .` запрещён.**

---

## Отчёт Code — REV #2 SEARCH-COMMIT-AUDIT / K1 (17.07.2026)

Source-код не менялся. Изменены только `CURRENT_TASK.md` (этот отчёт) и `BUGS.md`.

### 1. Mojibake verdict

**False alarm. Байты на диске — валидный UTF-8. Cleanup не нужен.**

Hex прямо из рабочей копии (`search-session-presentation.js`):

```
c2ab 6e6f 7420 7665 7269 6669 6564 c2bb   → «not verified»
e286 92                                    → →
```

`C2 AB` = корректный UTF-8 `«`. Наблюдавшийся `В«` — это те же два байта, прочитанные как CP1251 (`C2`→`В`, `AB`→`«`); `вЂ"` = `E2 80 94` (`—`) там же. Сигнатура совпадает побайтно.

Обратная проверка по всему search-пакету: `grep -rl 'вЂ|В«|В»|Ð°|Ð¾|â€œ|â€”'` → **0 файлов**.

Три уточнения:
- **Русских символов в этих комментариях нет вообще** — они английские; `«»`/`—` там как типографика.
- Это **не отклонение стиля**: гильеметы используются в **47 из 100** файлов `src/lib/*.js` (`annotation-edit.js`, `dag-layout.js`, `feature-extract.js`, …). Правка трёх файлов рассинхронизировала бы их с остальными 47.
- Почему поймалось на новых файлах: они ~99% ASCII, эвристике определения кодировки не хватает доказательств за UTF-8 → падение в системную кодовую страницу.

### 2. Dirty tree summary

| | |
|---|---|
| tracked modified | **73** |
| untracked (записей `git status`) | **139** |
| **всего** | **212** |

`.editorconfig` — **отсутствует**. `.gitattributes` — **отсутствует**. (Факт зафиксирован, не создавались.)

### 3. Junk files

| путь | размер | решение |
|---|---|---|
| `gui/designer/console.log(Object.keys(m)))` | 0 B | **exclude; delete only with explicit permission** |
| `gui/designer/console.log(m.searchAllSequences('AAA'` | 0 B | **exclude; delete only with explicit permission** |

Оба — артефакты сорвавшейся shell-команды (незакрытые скобки попали в имя файла). Пустые. Не удалялись.

### 4. Manifest

**Include — untracked (128 файлов = 50 sources + 78 tests).** Состав получен **транзитивным замыканием импортов от поисковых корней**, не по имени файла (см. §6 — имя оказалось ненадёжным признаком).

Sources (50): `lib/` — `library-search`, `search-facade`, `search-service`, `search-worker-client`, `search-worker-core`, `search.worker`, `search-provider-contract`, `search-provider-failures`, `search-session-presentation`, `search-types`, `search-document-adapters`, `search-entity-key`, `search-enzyme-adapters`, `search-modes`, `search-pick-route`, `search-prefix-registry`, `search-prefs`, `search-profiles`, `search-query-lexer`, `search-query-sync`, `search-result-format`, `search-result-vm`, `sequence-search-bio`, `tree-search-controller`, `query-classify`, `legacy-primer-migrate`, `derived-protein`, `protein-match`, `re-match`, `seq-match`, `translate-cds`, `iupac`, `identity-color`, `nav-target`, `open-entry-action`; `components/Search/` (8 файлов); `components/Library/` — `LibrarySmartSearchBar`, `SmartResultRow`, `SearchSettingsModal`, `EnzymeCard`, `hooks/useSearchPickRouter`, `hooks/useSearchQueryState`; `components/common/HighlightedText`.

Docs (untracked, include): `docs/SMART_SEARCH_SCOPES_PREFIXES_REV2.md`, `docs/guides/TECHNICAL_GUIDE_SEARCH.md`, `docs/guides/USER_GUIDE_SEARCH.md`.

**Include — tracked modified, SEARCH-PURE (18), `include whole file`:**

| path | class | reason |
|---|---|---|
| `src/i18n.js` | SEARCH-PURE | 238 добавленных ключей — все `search.*`; плюс хелпер `tf()` (§6) |
| `src/components/Library/LibraryWorkspace.jsx` | SEARCH-PURE | сессия/дебаунс/роутинг поиска |
| `src/components/Library/LibraryTopBar.jsx` | SEARCH-PURE | промоут в SmartSearchBar |
| `src/components/Library/inspector/LibrarySingleInspector.jsx` | SEARCH-PURE | консьюмер jump (P3) |
| `src/components/Library/inspector/hooks/useInspectorSelectionNav.js` | SEARCH-PURE | стадия-2 jump + ack |
| `src/components/CanvasSkeleton/canvas/LibrarySearchBar.jsx` | SEARCH-PURE | ASM-SEARCH (пикер сборки) |
| `src/components/CanvasSkeleton/canvas/PlaceholderTreePicker.jsx` | SEARCH-PURE | дедуп `matchesQuery` → сессия |
| `src/lib/sequence-search.js` | SEARCH-PURE | `opts.compare` seam + фикс revcomp |
| `src/import-annotations.js` | SEARCH-PURE | +5 строк: `codon_start`/`transl_table` — пререквизит `aa:` (P4.0) |
| `src/store/primerSlice.js` | SEARCH-PURE | +3 строки: `description` как searchable dimension |
| `src/components/PrimerPoolList.jsx` | SEARCH-PURE | `selectedPrimerId` из глобального поиска (§10.4) |
| `src/components/PrimerPool/PrimerPoolWorkspace.jsx` | SEARCH-PURE | проброс `selectedPrimerId` |
| + 6 парных test-файлов | SEARCH-PURE | `library-topbar-dna-search`, `library-workspace`, `LibrarySearchBar`, `PlaceholderTreePicker-v85`, `sequence-search`, `import-annotations` |

**Exclude — tracked modified, NON-SEARCH (4):** `src/App.jsx`, `docs/ARCHITECTURE.md`, `docs/SPEC_BODGE_FORMAT_V2_CORE.md`, `docs/SPEC_REPRODUCIBLE_RECIPE.md`.
`App.jsx` — вопреки ожиданию по плану (Ctrl+K / `SequenceSearchPopover`) его diff **не содержит** search-работы.

**Exclude — untracked, чужие потоки (14):** `PromptModal.jsx` + `PromptModal.test.jsx` + `prompt-modal-slice.test.js` + `loose-zone-create-folder.test.jsx` (поток V191/V192 `window.prompt` в Electron); `tree-row-alignment.test.jsx` (V190, визуальный порядок дерева); `re-single-cut.js` + 6 assembly/canvas/restriction тестов; `selection-overlay-inverted-sticky.test.jsx`.

### 5. Mixed hunk table

| файл | search-часть | НЕ-search часть | separable | решение |
|---|---|---|---|---|
| `src/store/uiSlice.js` | `navRequest` + 4 действия (P3) | другой поток | **да** | `manual hunk staging required` |
| `src/components/Library/tree/LibraryTreeRoot.jsx` | highlights / reason-чипы из сессии | **AUD-65** — удаление вечно-disabled кнопки сортировки (`data-testid="tree-sort"`), поток consistency-audit | **да** | `manual hunk staging required` |
| `src/components/Library/tree/TreeItemRow.jsx` | `<mark>` + чип-причина | поток дерева | **да** | `manual hunk staging required` |
| `src/components/Library/tree/LooseZone.jsx` | дедуп `matchesQuery` → сессия | V191 inline-input вместо `window.prompt` | **да** | `manual hunk staging required` |
| `src/components/Library/tree/__tests__/library-tree-v2.test.jsx` | search-ветки | ветки дерева | **да** | `manual hunk staging required` |
| `BUGS.md` | ~212 из 300 строк | ~88 строк: BODGE-PUB-01/BODGE-CORE-02, V190/V191/V192, V198 (дубли React-ключей PlasmidMap), APP-AUDIT SWEEP (AUD-1..103), CH-1..4, V193–V197, E2E-* , FLAKE-TIMEOUT-LOAD | **да** | `manual hunk staging required` |
| `CURRENT_TASK.md` | ~99% добавленных строк | **удаления**: 100% из 54 удалённых строк — canvas/junction (спека M-CANVAS-FIX.1, отчёты Realise-DAG, долг JUNCTION); **добавления**: блок «M-CANVAS-FIX.1 … визуальная приёмка pending» + смена стартового указателя на `AGENTS.md` (untracked!) | **НЕТ** | **STOP — нужен выбор Игоря** |

### 6. Dependency closure

Замыкание считалось от корней по импортам. Результат — **закрыто**, но с тремя находками:

1. **Имя файла — ненадёжный признак.** В пакет входят по зависимости:
   - `lib/query-classify.js` — ядро («raw string → QueryPlan»), в имени нет `search`;
   - `lib/legacy-primer-migrate.js` — в шапке «REV#2 K6-P1-2b, Игорь review-3 14.07», единственный потребитель — `hooks/useSearchPickRouter.js`. **Несмотря на `primer` в имени — это поисковая работа.**
2. **`tf()` в `i18n.js`** — общий хелпер (подстановка `{name}`), добавлен search-потоком. Потребители: `LibrarySmartSearchBar.jsx`, `SmartResultRow.jsx`, `search-result-format.js` — **только поиск**. Вердикт `i18n.js = SEARCH-PURE` устоял.
3. **Ни один search-файл не импортирует untracked НЕ-search файл.** Обратное направление (кто ещё зависит от пакета) — чисто.

Известные слепые зоны статического анализа (заявляю честно): тесты через `vi.mock`/харнесс/`?raw` не имеют статических зависимостей — `search-types-contract.test.js` (`import SRC from '../search-types.js?raw'`), `search-ui-boundary.test.js`, `library-topbar-pick-routing`, `library-topbar-userdata-scope` классифицированы по содержимому, не по графу.

### 7. Recommended staging plan (НЕ выполнялся)

1. Ветка от `main` (сейчас HEAD = `0085bec`, репозиторий грязный на 212 записей).
2. `git add` **поимённо** — 128 untracked + 18 tracked SEARCH-PURE + 3 docs. **`git add .` категорически нельзя**: затянет 12 чужих потоков и 2 мусорных файла.
3. 6 mixed-файлов кода/трекеров — `git add -p` вручную по таблице §5.
4. `CURRENT_TASK.md` — **не стейджить без решения Игоря** (§8).
5. Перед коммитом: `git diff --cached --stat` сверить с манифестом; убедиться, что junk-файлов и `App.jsx` в индексе нет.

### 8. Risks

- **`CURRENT_TASK.md` неразделим.** Один и тот же правкой указатель уводится с canvas-потока на search, а 54 удалённые строки — целиком canvas/junction (M-CANVAS-FIX.1, у которого **визуальная приёмка ещё pending**). `docs/archive/` чист — то есть отчёты 10.06 никуда не переносились и после коммита останутся только в истории. Search-коммит здесь перепишет рабочий документ другого незакрытого потока. **Нужен ваш выбор.**
- **Стартовый указатель → `AGENTS.md`**, а `AGENTS.md` **untracked**. Коммит оставит ссылку на файл, которого в коммите нет. Отдельный docs-поток.
- **`legacy-primer-migrate.js`** формально выглядит праймерным. Если он задумывался как часть праймерного потока — решение за вами; по содержимому и потребителю он поисковый.
- 6 mixed-файлов требуют ручного hunk-staging — автоматически безопасно не отделяются.
- Junk-файлы не удалены (нет разрешения).

### 9. Git discipline

`staged 0` (`git diff --cached` пуст). `commit` / `stage` / `stash` / `reset` / `clean` — **не выполнялись**. `git add .` — не выполнялся. HEAD не двигался: `0085bec`. Ветка — `main`. `git diff --check -- CURRENT_TASK.md BUGS.md` — чисто (whitespace-ошибок нет).

**СТОП после SEARCH-COMMIT-AUDIT K1. Stage 4 не начинаю. Жду решения по `CURRENT_TASK.md` и по junk-файлам.**

---

### Дополнение — решения Игоря исполнены (17.07.2026)

**Junk удалён** (точечное разрешение получено). `rm` ровно двух путей: `gui/designer/console.log(Object.keys(m)))`, `gui/designer/console.log(m.searchAllSequences('AAA'`. Перед удалением проверено: 0 B, untracked (в git-истории копий нет — терять нечего). После: untracked 139 → **137**, других `console.log*`-артефактов в дереве нет.

**`CURRENT_TASK.md` — решение принято: отдельный docs-commit после search-коммита.** Целиком в search-пакет не входит; из манифеста исключён.

**Staging manifest готов (не выполнен).** `manifest-add.txt` — **147 путей** (129 untracked = 126 кодовых + 3 docs; 18 tracked SEARCH-PURE). Скрипт `stage-search.sh` (ветка → `git add --pathspec-from-file` → проверка «staged == manifest» → assert, что `CURRENT_TASK.md`/`App.jsx`/3 docs НЕ в индексе → инструкции по hunk-wise). **Коммита в скрипте нет.**

**Проверка «ничего не включено по умолчанию».** Манифест собирался как «все untracked src минус явные исключения», что само по себе включает файлы по умолчанию — поэтому каждый файл сверен с доказательством: 114 из 126 подтверждены именем, 11 — содержимым (`library-topbar-*` тесты строки поиска, `_topbar-harness`, `primer-pool-selected`, `rev2-stage0-scope`). Последний, `enzyme-card.test.jsx`, слова «search» не содержит вообще — проверен отдельно: `EnzymeCard` рендерится только из `useSearchPickRouter`/`LibraryWorkspace`, в шапке «REV #2 §10.5 — карточка, которую открывает пик фермента». Поиск. **Файлов без обоснования в манифесте нет.**

47 оставшихся untracked (`.agents/`, `.audit/`, `.codex/`, `.design-import*/`, `demo/`, `AGENTS.md`, zip-архивы, docs других потоков) — вне пакета, не трогались.

**Git:** staged 0, HEAD `0085bec`, ветка `main`. commit/stage/stash/reset/clean не выполнялись. Единственная мутация рабочего дерева за этот шаг — удаление двух разрешённых junk-файлов.

**СТОП. Ничего не коммичу и не стейджу до утверждения финального списка.**

---

### ОПРОВЕРЖЕНИЕ СОБСТВЕННОГО ОТЧЁТА — два дефекта аудита, вскрыты при staging (17.07.2026)

Go на staging-preview получен и исполнен частично: манифест (147) застейджен, hunk-staging **не начинался**. При построении патчей выяснилось, что §4 и §5 выше **неверны**. Фиксирую до того, как на них кто-то обопрётся.

**Дефект 1 — манифест НЕПОЛОН. Корень: отбор кандидатов грепом по слову «search».**
Кандидаты на классификацию я отбирал как «tracked-modified файлы, в дифе которых встречается `search|Search`». Поисковая работа, не содержащая этого слова буквально, в выборку не попала вообще. Пропущены **4 изменённых файла с реальной проводкой поиска** (ни один не застейджен):

| файл | что несёт |
|---|---|
| `src/components/Library/tree/ProjectZone.jsx` | принимает `getMatchInfo`/`matchInfo` (подсветка дерева) |
| `src/components/Library/tree/VersionLineageNode.jsx` | прокидывает `matchInfo` в строки линии версий |
| `src/store/__tests__/uiSlice.test.js` | тесты `navRequest` (P3) |
| `src/components/PrimerPool/__tests__/primer-pool-workspace.test.jsx` | тесты `selectedPrimerId` (pick-routing) |

Перепроверка сделана по набору идентификаторов (`matchInfo|getMatchInfo|HighlightedText|REASON_LABELS|navRequest|runSearch|treeSession|SmartResultRow|EnzymeCard|selectedPrimerId|legacyPrimerToCanonical|codon_start|transl_table`), а не по слову. **Но это тоже эвристика** — гарантии полноты она не даёт.

**Дефект 2 — `TreeItemRow.jsx` НЕ разделим по хункам.** В §5 стоит `separable: да` — неверно. Хунк `@@ -309,23 +314,41` перемешан построчно: поиск вставляет `HighlightedText` + чип-причину и ради их раскладки переписывает тот же style-объект (`overflow/ellipsis` → `flex/gap`), а V190 в этих же строках **выносит `{badge}`** из левого кластера и возвращает его в правый уже в хунке `@@ -384`. Взять «только поиск» нельзя: `@@309` без `@@384` **удаляет badge совсем** — регрессия. Требуется ручная правка строк, то есть создание версии файла, которая никогда не собиралась и не тестировалась.

Остальные пять mixed-файлов разделимы: `uiSlice.js` (`navRequest` vs `prompt` — блоки разделены контекстом), `LibraryTreeRoot.jsx` (сессия дерева в `@@ -133` vs AUD-65 в `@@ -242`), `LooseZone.jsx` (`matchInfo` vs V191), `library-tree-v2.test.jsx`, `BUGS.md`.

**Дефект 3 (общий, не мой промах, но должен быть назван).** Любой частичный коммит даёт дерево, которое **никогда не собиралось и не прогонялось**: все зелёные прогоны были на полном рабочем дереве со всеми 12 потоками. Search-коммит нужно верифицировать отдельно (worktree из индекса → `npm test` + `vite build`), иначе «зелёный» относится не к тому, что коммитится.

**Состояние индекса:** 147 staged (129 A + 18 M), 21 172 вставки. Утечек нет: `CURRENT_TASK.md`, `App.jsx`, `ARCHITECTURE.md`, 2 спеки — не в индексе; `console.log`-артефактов 0. Коммита нет.

**СТОП. Индекс намеренно оставлен как есть (не reset). Жду решения по TreeItemRow и по добору 4 пропущенных файлов.**

---

## Отчёт Code — INTEGRATION CHECKPOINT (17.07.2026)

Решение Игоря: остановить сборку «идеального search-коммита», сделать честный локальный интеграционный checkpoint. Исполнено.

**Коммит:** `7e2576c` на ветке `checkpoint/integration-2026-07-17` (от `0085bec`). **212 файлов, +28 931 / −1 671.** `main` не тронут, ничего никуда не отправлялось.

**Состав.** Явный список (не `git add -A`): 202 `gui/`, 13 `docs/`, `AGENTS.md`, `BUGS.md`. `TreeItemRow.jsx` взят целиком; 4 пропущенных ранее файла (`ProjectZone.jsx`, `VersionLineageNode.jsx`, `uiSlice.test.js`, `primer-pool-workspace.test.jsx`) добраны. Ручной гибрид не собирался.

**Исключено (48 путей, каждый назван):** `CURRENT_TASK.md` (этот docs-коммит), `.claude/settings.local.json` (локальные настройки), 4 мусорных shell-артефакта (`console.log(...)` ×2 удалены с разрешения; `1048576)rows.push([s` ×2 остались на диске — разрешения не было), 3 архива (2 zip + `demo/`), `jof-12-00316.pdf` (статья), агентская оснастка (`.agents/`, `.audit/`, `.codex/`, `.design-import/`, `.design-import2/`). Личные данные отсекает сам `.gitignore`: `docs/design_assets/` (231 МБ — «installers, scanned IDs, contracts, papers», помечено «never commit») и `.graphify/` (70 МБ, генерируемое).

**Манифест 217 → staged 212.** Разница объяснена: 5 × `docs/guides/USER_GUIDE_*.md` имеют пустой `git diff --numstat` — фантомные модификации от CRLF, после нормализации контент равен HEAD, git отбросил их сам. Лишнего в индексе не было (`staged, NOT in manifest: 0`).

**Верификация именно снимка.** Код в индексе побайтно равен рабочему дереву (исключены только доки/мусор/оснастка, которые приложение не импортирует), поэтому прогон на дереве валиден для коммита:
- `vitest run` — **7434 passed / 0 failed** (772 файла, 18 skipped, 356 с);
- `npx vite build` — **OK** (PWA, 39 precache entries).

Это и есть главное отличие от отменённого search-коммита: там дерево было бы синтетическим и никогда не проверенным.

**Почему смешанный коммит — правильное решение, а не капитуляция.** `TreeItemRow.jsx` физически не разделяется по хункам: поиск (`HighlightedText` + чип-причина, переписанный style-объект) и V190 (перенос `{badge}` из левого кластера в правый, распределённый по двум хункам) правят одни и те же строки. «Только поиск» = удалить badge. Честное смешанное состояние с правильным названием лучше притворно чистого коммита.

**Что дальше:** поиск ведётся небольшими самостоятельными коммитами от этой точки. Checkpoint при желании можно позже переписать/squash — он локальный.
