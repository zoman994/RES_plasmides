# SPEC SEARCH-GAPPED-DNA — единый DNA-поиск с заменами, вставками и делециями

**Статус:** 🟡 ГОТОВО К HANDOFF
**Тип:** bounded search sprint; K0–K4
**Дата аудита:** 17.07.2026
**Источник задачи:** пользовательский сценарий «20 полностью комплементарных нуклеотидов; одна добавленная буква не должна уничтожать близкий hit»
**Нормативные слова:** MUST / MUST NOT — обязательно; SHOULD — отклонение объясняется в отчёте; MAY — опция.

> **Цель.** Порог 80% должен означать один и тот же биологический факт для короткой и длинной ДНК, линейной и кольцевой молекулы, обеих цепей и IUPAC: весь запрос выровнен против одного участка, а замены, вставленные и удалённые основания честно уменьшают сходство.

---

## 0. Проверенный baseline и причина дефекта

Текущий глобальный поиск имеет два несовместимых алгоритмических контракта:

- [`seq-match.js`](../../gui/designer/src/lib/seq-match.js) направляет любой запрос длиной до 30 нт, любой IUPAC-запрос и любую кольцевую молекулу в `scanMotif`;
- [`sequence-search-bio.js`](../../gui/designer/src/lib/sequence-search-bio.js) сравнивает окна одинаковой длины, поддерживает только замены и всегда возвращает `indels: 0`;
- короткий путь использует `maxMismatches`, а `identityThreshold` игнорирует;
- длинный линейный concrete-запрос идёт в [`sequence-search.js`](../../gui/designer/src/lib/sequence-search.js), где есть только эвристическое восстановление единичного gap около exact seed;
- при target-insertion старый длинный движок способен вернуть `identity: 1` и отрицательное число mismatches, потому что denominator не включает target-only bases;
- [`SequenceSearchPopover.jsx`](../../gui/designer/src/components/SequenceSearchPopover.jsx) вызывает старый движок напрямую, поэтому глобальный поиск и поиск внутри открытой молекулы могут отвечать по-разному.

Следствия для пользователя:

1. 20-мер с одной вставленной буквой исчезает, хотя парное выравнивание имеет 20/21 = 95,24%.
2. Видимый порог 80% для коротких запросов фактически декоративен.
3. Вставка в одну сторону штрафуется иначе, чем вставка в другую.
4. Отсутствие hit сейчас может означать не отсутствие похожего участка, а невозможность текущего маршрута представить gap.

Подтверждённый runtime-дефект регистрируется в [`BUGS.md`](../../BUGS.md). Эта спецификация является контрактом исправления, а не вторым bug tracker.

### 0.1 Размерные границы

Срез на 17.07.2026:

| Файл | Размер | Решение |
|---|---:|---|
| `library-search.js` | 24 683 B | MUST NOT расширять |
| `query-classify.js` | 23 211 B | MUST NOT расширять |
| `sequence-search.js` | 22 683 B | не наращивать новой логикой |
| `LibraryWorkspace.jsx` | 39 570 B / 38,64 KiB | только SearchHost wiring с нулевой/отрицательной дельтой |
| `seq-match.js` | 3 109 B | только тонкая маршрутизация/адаптация |
| `search-facade.js` | 10 153 B | только если нужен session-level failure/truncation wiring |
| `LibrarySmartSearchBar.jsx` | 21 344 B | небольшая проводка допустима |
| `SearchSettingsModal.jsx` | 8 388 B | настройка и объяснение |

Новый алгоритм MUST жить в отдельных модулях. Каждый новый `.js` SHOULD оставаться ниже 20 KiB и MUST оставаться ниже hard 25 KiB.

### 0.2 Visual reference и reuse

**Новый визуальный макет не нужен.** Используются существующие Search settings, SmartResultRow, Search result metrics и SequenceSearchPopover. UI следует [`DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md).

---

## 1. Scope

### 1.1 IN

- единый approximate DNA core для substitutions, insertions и deletions;
- query-global / target-local (glocal) семантика;
- короткие и длинные запросы;
- обе цепи;
- IUPAC и режим `iupac:off`;
- линейная и кольцевая топология, включая gap около origin;
- глобальный Library search через worker;
- поиск внутри открытой молекулы через тот же core и worker-путь;
- единые метрики, edit runs, ранжирование и пользовательское объяснение;
- миграция Search prefs и удаление конкурирующего `maxMismatches` из DNA search;
- differential/property/mutation/performance/browser acceptance;
- обновление двух руководств по поиску после реализации.

### 1.2 OUT

- protein search, `aa:`;
- restriction-site search, `cut:` / `re:`;
- primer binding и его 3′-специфичная биология;
- homolog detection в Alignment;
- интроны, транскрипты и изоформы;
- полноценный alignment workspace или новый sequence viewer;
- Rust/WASM до измеренного project gate;
- parser/prefix/tree-query рефакторинг;
- визуализация праймерных mismatch/замен;
- любые исправления вне Search.

---

## 2. Биологический контракт

### 2.1 Тип выравнивания

Используется **query-global / target-local** выравнивание:

- весь нормализованный query MUST быть выровнен;
- свободны только фланги target;
- `queryCoverage` в обычном `seq:` MUST быть 1;
- маленький идеальный seed длинного запроса MUST NOT считаться hit;
- soft clipping/partial query в этом поиске запрещены;
- один hit соответствует одному непрерывному участку линейной молекулы либо одному участку кольца, который может пересечь origin один раз.

Это не Smith–Waterman local alignment.

### 2.2 Операции

Внутренний edit script использует:

| Op | Смысл | Потребляет query | Потребляет target |
|---|---|---:|---:|
| `=` | одинаковые concrete A/C/G/T | да | да |
| `~` | IUPAC-compatible, но не доказанно identical | да | да |
| `X` | несовместимая замена | да | да |
| `I` | основание есть только в query; gap в target | да | нет |
| `D` | основание есть только в target; gap в query | нет | да |

Названия `I`/`D` всегда заданы **относительно query**. UI обязан переводить их понятным языком и не заставлять биолога помнить CIGAR-конвенцию.

### 2.3 Метрика

Обозначения:

- `M` — число `=`;
- `U` — число `~`;
- `X` — substitutions;
- `I` — query-only bases;
- `D` — target-only bases;
- `L = M + U + X + I + D` — alignment columns;
- `E = X + I + D` — unit edit distance.

Для полностью concrete alignment:

`identity = M / L`

Для alignment, где query или target содержит хотя бы один неоднозначный IUPAC-символ:

- `identity = null`;
- `identityLowerBound = M / L`;
- `compatibility = (M + U) / L`.

Acceptance:

- concrete: `M / L >= threshold`;
- ambiguous: `(M + U) / L >= threshold`.

Сравнение MUST выполняться целыми числами через basis points/cross multiplication. Ровно 80,00% проходит; 79,99% не проходит.

### 2.4 Контрольные примеры

| Случай | Результат при 80% |
|---|---|
| 20/20 exact | 100%, проходит |
| query 21 нт с одним extra base против exact 20 нт | 20/21 = 95,24%, 1 `I`, проходит |
| query 20 нт против target 21 нт с одним extra base | 20/21 = 95,24%, 1 `D`, проходит |
| 4 substitutions из 20 | 16/20 = 80%, проходит |
| 5 substitutions из 20 | 15/20 = 75%, не проходит |
| 3-base contiguous indel | 3 indel bases, 1 indel event |

### 2.5 IUPAC

- Совместимость определяется пересечением существующих 4-bit IUPAC masks.
- `U` нормализуется в `T`.
- При `iupac:on/auto` compatible ambiguity даёт `~`, не `=`.
- При `iupac:off` символы сравниваются literal: одинаковые ambiguous glyphs дают `~`, разные glyphs дают `X`. Даже literal `N == N` не доказывает biological identity, поэтому `identity` остаётся `null`.
- Порог применим к `compatibility`; UI пишет «совместимость», а не «идентичность».

### 2.6 Обе цепи

- Поиск выполняется для query и полного IUPAC reverse complement.
- Edit script идёт 5′→3′ по реально выравниваемому probe.
- Для минус-цепи engine MUST уметь отобразить probe ranges обратно в индексы исходного query.
- Плюс/минус объединяются в `strand:'both'` только при одинаковой physical location и эквивалентном alignment. Иначе это два occurrence.

### 2.7 Кольцевая молекула

- Нормализованный start находится в `0..targetLength-1`.
- Physical target base нельзя использовать дважды.
- `targetSpan <= targetLength`; второй обход кольца запрещён.
- Wrap-hit возвращает ровно два ordered segments: `[start,n)`, затем `[0,end)`.
- Gap может находиться непосредственно у origin.
- Тот же input на linear target не должен искусственно получить wrap-hit.
- Максимальный проверяемый target span равен `min(targetLength, floor(queryLength * 10000 / thresholdBps))`. Circular overlay добавляет не больше `min(targetLength - 1, maxTargetSpan - 1)` bases, а не дублирует весь круг.

---

## 3. Runtime contracts

### 3.1 Метрики occurrence

Существующий `SeqMetrics` сохраняет обратную совместимость:

`length` остаётся query length.

Добавляются:

`queryLength, alignmentLength, targetSpan, identityLowerBound, substitutions, insertions, deletions, indelBases, indelEvents, editDistance, editRuns`.

Legacy-поля:

- `mismatches = substitutions`;
- `indels = indelBases`;
- `mismatchPositions` содержит только physical target positions операций `X`;
- `exactMatches = M`;
- `compatibleMatches = M + U`;
- `uncertainMatches = U`;
- `coverage = 1`.

Формат run:

~~~text
AlignmentEditRun {
  op: "=" | "~" | "X" | "I" | "D",
  length,
  probeStart, probeEnd,
  targetOffsetStart, targetOffsetEnd
}
~~~

`probeStart/probeEnd` относятся к probe, фактически выравниваемому по возрастающим target coordinates. Physical coordinates берутся из `location.segments`; отдельный helper маппит probe range в исходный query для минус-цепи.

ProviderOccurrence по-прежнему MUST NOT содержать `targetRef`. Владелец назначается только orchestration layer.

Worker/inline boundary MUST валидировать sequence metrics, а не только location:

- все counts — конечные неотрицательные integers;
- суммы `M/U/X/I/D` согласованы с `alignmentLength/queryLength/targetSpan`;
- ratios находятся в `0..1` либо в разрешённом `null`;
- edit runs непрерывны в probe/target-offset space и replay дают те же counts;
- physical segments остаются в bounds;
- malformed metrics идут в существующий provider-failure/incomplete path.

Boundary проверяет runs линейно по числу runs и не реконструирует строки/не разворачивает runs по основаниям. Полный replay query/target выполняется worker-side и в тестах.

Так как `search-provider-contract.js` общий для protein/enzyme, sequence-specific проверка MUST быть явной и не должна отвергать их законные payloads.

### 3.2 Identity occurrence и канонический выбор alignment

Identity одного occurrence: `(strand, normalizedTargetStart)`.

- Для одного start возвращается ровно один лучший end/alignment.
- Несколько допустимых nested spans с тем же start не являются отдельными hits.
- Leading/trailing `D` запрещены: при target-local semantics это свободные target flanks, а не биологические edits.
- Leading/trailing `I` разрешены и штрафуются: это query bases, которым нет пары в target.
- Candidate ends из scanner сначала восстанавливают start; затем результаты группируются по occurrence identity.

Канонический alignment внутри группы выбирается так:

1. выше acceptance ratio, сравниваемый cross multiplication;
2. больше доказанных concrete `M` / меньше uncertain `U`;
3. меньше `editDistance`;
4. меньше `indelEvents`;
5. меньше `abs(targetSpan-queryLength)`;
6. меньше target end;
7. стабильный lexical edit script.

Все разные starts, включая перекрывающиеся hits, сохраняются до пользовательского `limit`. Низкая сложность не должна схлопывать `AA` в `AAAA` до одного occurrence.

### 3.3 Ошибки и неполнота

Сохраняются принятые Search contracts:

- provider exception/invalid payload/resource budget → `incomplete`, не честный zero;
- partial candidate нельзя выбрать;
- strict final AND не ослабляется;
- cancel/timeout/terminate/stale-drop остаются действующими;
- production fault-toggle запрещён.

Resource-limit использует один консервативный протокол:

1. engine создаёт typed `RESOURCE_LIMIT`;
2. worker core отвечает только validated error code, без частичного `byId`;
3. worker client отклоняет request как `SEARCH_ABORT.RESOURCE_LIMIT`;
4. provider-failure tracker сохраняет причину `RESOURCE_LIMIT`;
5. facade отбрасывает все sequence hits этого прохода и публикует только deferred metadata candidates + `incomplete:true`;
6. UI сообщает, что DNA-проверка не завершена; никакой кандидат не становится selectable как sequence-confirmed.

Raw error text наружу не выходит. Следующий запрос использует здоровый worker, если сам worker не падал.

Configured result `limit` применяется после детерминированного ранжирования. Внутренний candidate budget MUST NOT молча превращать незавершённый scan в «0 совпадений». Если полный target не проверен, outcome — typed resource incomplete.

---

## 4. Алгоритм и производительность

### 4.1 Архитектура

Рекомендуемые новые модули:

| Модуль | Ответственность |
|---|---|
| `dna-approx-scan.js` | bit-parallel approximate-substring candidate ends |
| `dna-gapped-align.js` | bounded glocal traceback, canonical edit runs и metrics |
| `dna-gapped-search.js` | strands, circular overlay, dedup, ranking, limit |

`seq-match.js` остаётся адаптером к ProviderOccurrence. `library-search.js`, `query-classify.js` и старый `sequence-search.js` новой логикой не расширяются.

### 4.2 Production strategy

1. Нормализовать query/target и threshold.
2. Вычислить безопасный unit-edit bound:

   `K = floor(queryLength * (10000 - thresholdBps) / thresholdBps)`.

3. Выполнить exact Myers bit-vector approximate-substring scan по target; для query длиннее машинного слова использовать block vectors.
4. Для каждого candidate end восстановить релевантные starts в bounded window, сгруппировать по `(strand,start)` и выбрать alignment точной tuple из §3.2.
5. Отфильтровать точной identity/compatibility формулой, а не только edit distance.
6. Нормализовать circular coordinates, strands и duplicates.
7. Просканировать весь target; хранить bounded лучшие результаты.

Myers выбран как production candidate scan, потому что решает approximate substring matching без обязательного exact seed. Научная основа: Gene Myers, 1999, [DOI 10.1145/316542.316550](https://doi.org/10.1145/316542.316550).

Exact fast path при threshold 100% MAY переиспользовать `scanMotif`, только если differential tests доказывают полную эквивалентность unified contract.

Seed/minimizer MAY быть добавлен только как доказанно lossless accelerator. Exact-seed-only маршрутизация запрещена: 80%-hit без surviving 8-mer обязан находиться.

WFA/Rust/WASM не входят в этот спринт. WFA — exact pairwise global/affine algorithm, а здесь нужен approximate substring/glocal scan; перенос допускается только после измеренного project gate. Справка: [Marco-Sola et al., 2021](https://academic.oup.com/bioinformatics/article/37/4/456/5904262).

### 4.3 Слабый компьютер

- heavy DNA scan выполняется только в worker;
- main thread не выполняет production DP/traceback;
- одновременно работает не более одного тяжёлого search job;
- смена query/закрытие surface отменяет старую работу и stale result не рендерится;
- candidate/traceback budget exhaustion возвращает incomplete;
- массивы/bitsets компактны; полная `query × target` matrix запрещена в production.

Целевые измерения на reference hardware:

| Сценарий | Gate |
|---|---:|
| 1 Mb deterministic ordinary-complexity target, query 20–400 нт, 80% | exact final < 1 s после готовности worker |
| cancel/stale-drop p95 | < 100 ms |
| UI long task | < 50 ms |
| library 10 Mb | < 250 MB, stress ceiling < 500 MB |

Обычная unit suite не должна содержать хрупкий wall-clock assert. Bench profile использует детерминированный corpus и публикует измерения отдельно. Low-complexity worst case вправе завершиться только явным `RESOURCE_LIMIT/incomplete`, не silent miss.

---

## 5. Настройки и UI

### 5.1 Единственный пользовательский порог

`identityThreshold` становится единственным acceptance control для DNA substitutions/insertions/deletions.

До engine boundary:

`thresholdBps = round(clamp(finite identityThreshold, 0.5, 1) * 10000)`; отсутствующее/нечисловое значение даёт default 8000.

Дальше acceptance и candidate bounds используют только integer `thresholdBps`.

`maxMismatches`:

- удаляется из активного global DNA runtime;
- удаляется из SearchSettingsModal;
- не передаётся в worker ctx;
- MAY оставаться внутри primer-binding или exact internal helpers, где имеет другой биологический смысл;
- сохранённое v1 значение не должно влиять на новый поиск.

Search prefs schema повышается до v2 с явной миграцией v1→v2. Сохраняются threshold, strands, IUPAC, circular, min length, head versions и limit; весь объект пользователя молча не сбрасывается.

Threshold 100% — пользовательский exact mode: ни substitution, ни indel не проходит.

### 5.2 Реактивность prefs

Сохранение настроек MUST немедленно пересчитать текущий запрос. Сейчас SmartBar читает localStorage только при следующем изменении query/documents. Реализация использует один search-prefs subscription/controller либо scoped event с validated payload; повторный парс localStorage несколькими компонентами запрещён.

### 5.3 Результат

Примеры:

- «95% идентичность · 20/21 точных · 1 вставка»;
- «80% идентичность · 16/20 точных · 4 замены»;
- «100% совместимость · 7/8 точных · 1 неоднозначная позиция».

UI:

- использует `alignmentLength` как denominator;
- различает substitutions, indel bases и indel events;
- для IUPAC не показывает «100% идентичность»;
- best occurrence выбирает не только процент, но и §3.2 tie-break;
- jump использует physical `location.segments`;
- не создаёт вложенную кнопку внутри `role=option`;
- все новые строки идут через i18n и design tokens.

### 5.4 Две поисковые поверхности

Одинаковый query, target, threshold, strands/IUPAC/topology MUST давать одинаковые occurrences:

1. Library global search через `seqMatch`/worker/facade.
2. `SequenceSearchPopover` внутри открытой молекулы.

Popover MUST перестать вызывать тяжёлый `searchSequence` синхронно в `useMemo`. Он переиспользует существующий search worker protocol с одним synthetic worker document либо общий thin client. Второй алгоритм запрещён.

Popover получает topology через тонкий SearchHost adapter. Поскольку `LibraryWorkspace.jsx` находится у hard-порога, допустим только prop wiring с нулевой/отрицательной дельтой; если нужно больше нескольких строк, SearchHost сначала выносится в новый search-owned leaf component.

Существующий `SearchHitsOverlay` принимает canonical `location.segments` и отображает каждый physical segment. Legacy `targetStart/targetEnd` MAY поддерживаться как transitional fallback. Gap/mismatch markers строятся из edit runs; origin-wrap не схлопывается в один выходящий за bounds прямоугольник.

Tree metadata search, primer binding и Alignment homolog search остаются отдельными контрактами.

---

## 6. TDD-матрица

До production code создаётся независимый exhaustive/Pareto glocal oracle только для маленьких test inputs. Обычный Wagner–Fischer, минимизирующий только edit distance, oracle не является: нормативная tuple сначала максимизирует identity/compatibility. Test oracle перечисляет допустимые target spans и сохраняет Pareto states по `M/U/X/I/D/gapEvents`, затем применяет §3.2.

### 6.1 Обязательные example tests

1. exact linear hit и 0-based half-open coordinates;
2. 20 нт + insertion в каждой из 21 границ;
3. deletion в каждой допустимой позиции;
4. четыре scattered substitutions из 20 → ровно 80%, PASS;
5. пять substitutions → 75%, FAIL;
6. четыре contiguous substitutions → PASS, несмотря на старый `runOfK=3`;
7. query insertion `10=1I10=` → 20/21;
8. target insertion `10=1D10=` → 20/21;
9. 3-base contiguous gap → 3 bases, 1 event;
10. mixed 2 substitutions + 1 indel;
11. hit без surviving exact 8-mer;
12. query длиннее target, когда counted `I` ещё проходит threshold;
13. IUPAC-compatible и incompatible columns;
14. ambiguity в target;
15. `iupac:off` literal behavior;
16. reverse-complement-only hit и корректное mapping исходных query positions;
17. `bothStrands:false`;
18. palindrome EcoRI → один `both` occurrence;
19. circular exact wrap;
20. circular gapped wrap с gap около origin;
21. запрет второго круга и `targetSpan > circleLength`;
22. overlapping `AA` in `AAAA` → starts 0,1,2 до limit;
23. stable ordering/tie-break;
24. exact 80,00% без float drift;
25. CIGAR/edit-runs replay восстанавливает query и target span;
26. provider contract принимает валидные coordinates и отвергает подмену owner;
27. один и тот же case даёт одинаковый ответ global/Popover.
28. Popover adapter переводит canonical `location/metrics` в overlay/nav без потери wrap segments, strand и identity.
29. typed `RESOURCE_LIMIT` от worker и inline пути даёт одинаковый incomplete session без sequence hits.

### 6.2 Property и differential

- random short query/target против test oracle;
- reverse-complement symmetry;
- circular rotation invariance;
- insertion/deletion symmetry;
- edit-runs replay и counts;
- метрики неотрицательны и сумма колонок точна;
- `identity <= compatibility <= 1`, когда обе определены;
- normalized starts и segments всегда в bounds.

### 6.3 Mutation gates

Каждая мутация MUST дать RED:

- вернуть маршрут `query.length <= 30 → scanMotif`;
- убрать I transition;
- убрать D transition;
- denominator заменить на query length;
- принять partial query;
- требовать exact 8-mer seed;
- разрешить circular second lap;
- назвать ambiguous compatibility identity;
- снять stale-drop/cancel;
- на resource exhaustion вернуть `[]`;
- вернуть влияние legacy `maxMismatches`.

---

## 7. План исполнения

### K0 — baseline и RED-контракт

- перечитать эту спеку и живые файлы;
- записать/уточнить BG-020 в `BUGS.md` до фикса;
- снять актуальные sizes и focused/full baseline;
- добавить characterisation tests, воспроизводящие short-indel miss, 80%-bypass и отрицательную metric;
- добавить test oracle и матрицу §6;
- production code не писать до доказанного RED.

**Gate:** контрпримеры падают по ожидаемой причине; unrelated tests не переписаны под желаемый ответ.

### K1 — concrete linear engine

- реализовать candidate scan, bounded glocal traceback и metrics;
- substitutions/I/D, full-query coverage, overlaps, stable ranking;
- differential/property tests для concrete linear;
- модульные size gates.

**Gate:** вся concrete матрица зелёная; все соответствующие mutations RED.

### K2 — IUPAC, strands, circular и resource behavior

- IUPAC masks и honest compatibility;
- reverse complement и palindrome merge;
- circular overlay/segments, origin gap, no second lap;
- low-complexity streaming/limit;
- cancel/resource incomplete;
- deterministic benchmark harness.

**Gate:** topology/alphabet/property/mutation cluster зелёный; benchmark не показывает UI-thread compute.

### K3 — production integration

- подключить unified core в `seq-match.js`;
- расширить sequence-specific boundary validation в `search-provider-contract.js` для metrics/edit runs;
- сохранить facade/strict AND/provider failure contracts;
- prefs v2 migration, удалить DNA `maxMismatches`, reactive save;
- metrics/tie-break/i18n в global results;
- перевести SequenceSearchPopover на тот же worker core;
- передать topology через SearchHost без роста `LibraryWorkspace.jsx` и перевести SearchHitsOverlay на canonical segments/edit runs;
- не расширять near-hard модули.

**Gate:** global worker, facade, SmartBar и Popover дают одинаковые результаты; blocked/incomplete/pending semantics без регрессий.

### K4 — закрытие

- полный focused cluster;
- mutation proof;
- полный frontend test и Vite build;
- browser smoke из §8;
- scoped lint;
- size report;
- обновить [`USER_GUIDE_SEARCH.md`](../guides/USER_GUIDE_SEARCH.md) и [`TECHNICAL_GUIDE_SEARCH.md`](../guides/TECHNICAL_GUIDE_SEARCH.md);
- снять устаревший Search-completion пункт из BACKLOG только после приёмки;
- closing report по sprint-report; затем STOP.

---

## 8. Browser acceptance

На реальной молекуле с известным locus:

1. exact 20-мер → hit 100%;
2. тот же query + одна буква в начале, середине и конце → тот же locus, около 95%;
3. query − одна буква → тот же locus, около 95%;
4. четыре substitutions → 80%, виден;
5. пять substitutions → отсутствует при 80%;
6. reverse-strand indel → виден с правильной цепью;
7. circular origin indel → один hit с двумя segments;
8. IUPAC compatible → «совместимость», не «идентичность»;
9. изменение threshold в открытых Settings немедленно меняет текущую выдачу;
10. global search и Popover показывают те же coordinates/metrics;
11. pending/incomplete не выбирается и не выглядит как честный zero;
12. console/server errors = 0.

Если failure/pending невозможно воспроизвести без production fault-toggle, разрешён детерминированный harness; отчёт обязан честно отделить test-covered от live-verified.

---

## 9. Definition of Done

Функция завершена только если одновременно:

- 80% имеет одну формулу на всех DNA-маршрутах;
- короткие query больше не bypass threshold;
- substitutions и indels штрафуются симметрично;
- IUPAC не завышает identity;
- query coverage всегда полная;
- circular/strand coordinates доказаны;
- global и local surface используют один engine;
- heavy compute не идёт в UI thread;
- failure/incomplete/strict-AND contracts сохранены;
- migration не теряет остальные prefs;
- полный test/build и browser acceptance зелёные;
- guides описывают фактическое, а не обещанное поведение;
- ни один OUT-файл не изменён без STOP и нового scope.

---

## 10. Риски и открытые инженерные решения

1. **Myers traceback.** Candidate scan сам по себе не даёт canonical edit script; bounded verifier обязателен.
2. **Низкая сложность.** Нельзя спасать скорость silent candidate cutoff. Допустим только full scan или explicit incomplete.
3. **Длинный query при 50%.** Edit band широк; budget должен завершаться честным incomplete, а не эвристическим miss.
4. **Эквивалентные alignments в repeats.** Tie-break §3.2 нормативен; snapshot случайного порядка запрещён.
5. **Терминология I/D.** Internal ops query-relative; UI использует предметный текст.
6. **Старый sequence-search.** После K3 он MAY остаться для Alignment homologs, но не является DNA Search source of truth.
