# SPEC SEARCH-GAPPED-DNA — единый DNA-поиск с заменами, вставками и делециями

**Статус:** ✅ IMPLEMENTED — U7 PASS / local production acceptance
**Тип:** нормативный контракт shipping DNA Search
**Дата аудита:** 02.08.2026; нормативная ревизия ACGT-only: 18.07.2026
**Источник задачи:** пользовательский сценарий «20 полностью комплементарных нуклеотидов; одна добавленная буква не должна уничтожать близкий hit»
**Нормативные слова:** MUST / MUST NOT — обязательно; SHOULD — отклонение объясняется в отчёте; MAY — опция.

> **Цель.** Порог 80% должен означать один и тот же биологический факт для короткой и длинной A/C/G/T-ДНК, линейной и кольцевой молекулы и обеих цепей: весь запрос выровнен против одного участка, а замены, вставленные и удалённые основания честно уменьшают сходство.

---

## 0. Исходный дефект и принятое исправление

До этого пакета глобальный поиск имел два несовместимых алгоритмических контракта:

- [`seq-match.js`](../../gui/designer/src/lib/seq-match.js) направляет любой запрос длиной до 30 нт, любой IUPAC-запрос и любую кольцевую молекулу в `scanMotif`;
- [`sequence-search-bio.js`](../../gui/designer/src/lib/sequence-search-bio.js) сравнивает окна одинаковой длины, поддерживает только замены и всегда возвращает `indels: 0`;
- короткий путь использует `maxMismatches`, а `identityThreshold` игнорирует;
- длинный линейный concrete-запрос идёт в [`sequence-search.js`](../../gui/designer/src/lib/sequence-search.js), где есть только эвристическое восстановление единичного gap около exact seed;
- при target-insertion старый длинный движок способен вернуть `identity: 1` и отрицательное число mismatches, потому что denominator не включает target-only bases;
- [`SequenceSearchPopover.jsx`](../../gui/designer/src/components/SequenceSearchPopover.jsx) вызывает старый движок напрямую, поэтому глобальный поиск и поиск внутри открытой молекулы могут отвечать по-разному.

Наблюдавшиеся следствия для пользователя:

1. 20-мер с одной вставленной буквой исчезает, хотя парное выравнивание имеет 20/21 = 95,24%.
2. Видимый порог 80% для коротких запросов фактически декоративен.
3. Вставка в одну сторону штрафуется иначе, чем вставка в другую.
4. Отсутствие hit сейчас может означать не отсутствие похожего участка, а невозможность текущего маршрута представить gap.

Дефект закрыт единым A/C/G/T-only worker/core, corpus-wide exact-first маршрутом и
production kernel `LINEAR`. Эта спецификация фиксирует действующий контракт; живые
дефекты находятся только в [`BUGS.md`](../../BUGS.md).

### 0.1 Размерные границы

Алгоритм разделён по владельцам scan/verify/kernel/transport/UI и подчиняется общим
soft/hard-пределам из [`AGENTS.md`](../../AGENTS.md). Стабильные крупные модули не
расширяются новой биологией; новые изменения сначала выносятся в search-owned leaf.

### 0.2 Visual reference и reuse

**Новый визуальный макет не нужен.** Используются существующие Search settings, SmartResultRow, Search result metrics и SequenceSearchPopover. UI следует [`DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md).

---

## 1. Scope

### 1.1 IN

- единый approximate DNA core для substitutions, insertions и deletions;
- query-global / target-local (glocal) семантика;
- короткие и длинные запросы;
- обе цепи;
- строгий A/C/G/T-алфавит поискового query с явной блокировкой остальных символов;
- линейная и кольцевая топология, включая gap около origin;
- глобальный Library search через worker;
- поиск внутри открытой молекулы через тот же core и worker-путь;
- единые scalar-метрики, детерминированное ранжирование, компактное объяснение результата и переход к найденному locus;
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
- показ полного выравнивания, edit script или сотен букв внутри search dropdown/tooltip;
- Rust/WASM до измеренного project gate;
- parser/prefix/tree-query рефакторинг;
- визуализация праймерных mismatch/замен;
- любые исправления вне Search.
- IUPAC/degenerate-query matching в интерактивном DNA Search; общие IUPAC helpers и вырожденные праймеры в других подсистемах не изменяются.

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
| `=` | одинаковые A/C/G/T | да | да |
| `X` | разные основания либо любой target-символ вне A/C/G/T | да | да |
| `I` | основание есть только в query; gap в target | да | нет |
| `D` | основание есть только в target; gap в query | нет | да |

Названия `I`/`D` всегда заданы **относительно query**. UI обязан переводить их понятным языком и не заставлять биолога помнить CIGAR-конвенцию.

### 2.3 Метрика

Обозначения:

- `M` — число `=`;
- `X` — substitutions;
- `I` — query-only bases;
- `D` — target-only bases;
- `L = M + X + I + D` — alignment columns;
- `E = X + I + D` — unit edit distance.

`identity = M / L`

Acceptance: `M / L >= threshold`.

Неоднозначный символ в target никогда не доказывает совпадение и считается `X`. Поэтому результат остаётся консервативным: неизвестная target-база может уменьшить, но не завысить identity.

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

### 2.5 Алфавит ACGT-only (нормативно)

- Поисковый query перед проверкой только обрезается по краям и переводится в верхний регистр.
- После этого каждый символ MUST входить в `[ACGT]`. `N/R/Y/W/S/K/M/B/D/H/V/U`, `-` и любые другие символы дают существующую blocking-диагностику `invalid-dna`; worker/provider не запускается.
- Один pure-validator MUST использоваться global classifier и SequenceSearchPopover до dispatch; invalid query не превращается ни в `0 hits`, ни в provider failure/incomplete. Engine boundary дополнительно отвергает такой query fail-closed, если UI guard обойдён.
- Запрещено молча удалять внутренние символы, превращать `U` в `T` или пропускать запрос как metadata-search после явного `seq:`/DNA-mode.
- Target может содержать импортированную неоднозначную букву, но поисковый движок трактует её как `X`, а не как wildcard/compatible match.
- Candidate scan использует только literal A/C/G/T equality; IUPAC mask-overlap не может занизить distance. Reverse complement поискового query также concrete-only.
- `iupac.js`, IUPAC-аннотации и вырожденные праймеры вне DNA Search не удаляются и не меняют семантику.

### 2.6 Обе цепи

- Поиск выполняется для query и обычного A/C/G/T reverse complement.
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

Добавляются обязательные scalar-поля:

`queryLength, alignmentLength, targetSpan, substitutions, insertions, deletions, indelBases, indelEvents, editDistance`.

`editRuns` — деталь канонического выравнивания, а не обязательная часть каждой
глобальной поисковой строки. Kernel MAY материализовать runs только для retained
winner или точной ничьей, если это требуется правилом 7 §3.2. Facade/UI MUST NOT
требовать script/editRuns для всех raw candidates и MUST NOT пересылать полное
выравнивание только ради отображения dropdown.

Legacy-поля:

- `mismatches = substitutions`;
- `indels = indelBases`;
- `mismatchPositions` содержит только physical target positions операций `X`;
- `exactMatches = M`;
- `coverage = 1`.

Формат run:

~~~text
AlignmentEditRun {
  op: "=" | "X" | "I" | "D",
  length,
  probeStart, probeEnd,
  targetOffsetStart, targetOffsetEnd
}
~~~

Если `editRuns` материализованы, `probeStart/probeEnd` относятся к probe,
фактически выравниваемому по возрастающим target coordinates. Physical coordinates
берутся из `location.segments`; отдельный helper маппит probe range в исходный query
для минус-цепи.

ProviderOccurrence по-прежнему MUST NOT содержать `targetRef`. Владелец назначается только orchestration layer.

Worker/inline boundary MUST валидировать sequence metrics, а не только location:

- все counts — конечные неотрицательные integers;
- суммы `M/X/I/D` согласованы с `alignmentLength/queryLength/targetSpan`;
- `identity` конечна и находится в `0..1`; `null` для DNA Search запрещён;
- если edit runs присутствуют, они непрерывны в probe/target-offset space и replay дают те же counts;
- physical segments остаются в bounds;
- malformed metrics идут в существующий provider-failure/incomplete path.

Boundary всегда проверяет scalar-метрики и segments. Если runs присутствуют, он
проверяет их линейно по числу runs и не реконструирует строки/не разворачивает runs
по основаниям. Полный replay query/target выполняется только worker-side и в тестах,
а не в UI-проекции результата.

Так как `search-provider-contract.js` общий для protein/enzyme, sequence-specific проверка MUST быть явной и не должна отвергать их законные payloads.

### 3.2 Identity occurrence и канонический выбор alignment

Identity одного occurrence: `(strand, normalizedTargetStart)`.

- Для одного start возвращается ровно один лучший end/alignment.
- Несколько допустимых nested spans с тем же start не являются отдельными hits.
- Leading/trailing `D` запрещены: при target-local semantics это свободные target flanks, а не биологические edits.
- Leading/trailing `I` разрешены и штрафуются: это query bases, которым нет пары в target.
- Candidate ends из scanner сначала восстанавливают start; затем результаты группируются по occurrence identity.

Канонический alignment внутри группы выбирается так:

1. выше identity ratio, сравниваемый cross multiplication;
2. больше `M`;
3. меньше `editDistance`;
4. меньше `indelEvents`;
5. меньше `abs(targetSpan-queryLength)`;
6. меньше target end;
7. стабильный lexical edit script, сравниваемый 5′→3′ с явным порядком
   символов `= < D < I < X`.

Все разные starts, включая перекрывающиеся hits, сохраняются до пользовательского `limit`, **кроме endpoint shadows, удаляемых по правилу §3.2.1**. Низкая сложность не должна схлопывать `AA` в `AAAA` до одного occurrence.

#### 3.2.1 Endpoint-shadow pruning (нормативно)

Raw occurrence identity остаётся `(strand, normalizedTargetStart)`, и внутри каждого start выбирается canonical alignment по правилам выше. **Затем**, ДО ranking, применения `limit` и объединения цепей, кандидат `B` удаляется тогда и только тогда, когда существует кандидат `A`, для которого одновременно:

1. `A` на той же цепи, что и `B`;
2. `A` и `B` имеют один и тот же **physical target endpoint**;
3. их однооборотные target-интервалы **строго вложены — в любую сторону**;
4. `A` строго выигрывает полный comparator §3.2.

Иными словами: для одного `(strand, physicalEndpoint)` остаётся **comparator-best** кандидат — не обязательно внутренний и не обязательно внешний. При строгом равенстве comparator не удаляется ничего. Разные endpoints НИКОГДА не объединяются.

Направление вложенности нормативно НЕ учитывается: внешний худший и внутренний худший hit — одинаково альтернативные объяснения границы одного endpoint-локуса. Минимальный пример: query `ACGT`, target `AACGT` — start 0 даёт `=D===` (4/5 = 80%, интервал `[0,5)`), start 1 даёт exact `====` (`[1,5)`). Это один биологический сайт с двумя объяснениями границы; exact обязан удалить внешний shadow.

Это **endpoint shadow**, а не clustering по overlap. Широкий вариант «интервалы перекрываются → оставить лучший» ЗАПРЕЩЁН: он уничтожает tandem repeats и настоящие соседние сайты.

**Кольцо.** Сырой `start + targetSpan` зависит от положения origin, поэтому:

- linear: `physicalEndpoint = start + targetSpan`;
- circular: `physicalEndpoint = (start + targetSpan) mod n`;
- интервалы с одинаковым physical endpoint поднимаются к общему unwrapped `E` и сравниваются как `[E − targetSpan, E)`;
- правило 6 comparator внутри такой группы видит общий `E` — иначе выбор зависел бы от поворота кольца.

Без этого на кольце длины 10 интервалы `[8→2]` и `[0→2]` имеют один физический конец, но сырые ends `12` и `2`; после поворота origin они внезапно становятся сравнимы, и rotation invariance ломается. Запрет второго оборота (§2.7) сохраняется. Pruning выполняется отдельно для `+` и для `−`; уже после него работает существующий `both`-merge (§2.6).

Почему правило корректно:

- точный `N`-mer при низком пороге порождает ДВЕ лестницы с общим physical endpoint — правую `I^d =^(N-d)` (сдвиг вправо) и зеркальную левую (`X` + внутренние `D`, сдвиг влево); симметричное правило оставляет один exact hit;
- если полного варианта нет, сохраняется лучший усечённый hit;
- при строгом равенстве comparator остаются оба — произвольный выбор запрещён;
- `AA` в `AAAA` сохраняет старты `0,1,2`, потому что их endpoints равны `2,3,4` — разные, схлопывания нет;
- частично перекрывающиеся настоящие хиты с разными endpoints не схлопываются;
- две разные цепи не смешиваются.

Множественность близких `k`-edit occurrences — известное свойство approximate matching (для непериодических строк число `k`-edit occurrences может достигать порядка `k²`, см. [Charalampopoulos, Kociumaka, Wellnitz](https://arxiv.org/abs/2004.08350)), поэтому представление локуса задаётся здесь нормативно, а не случайным UI-фильтром.

**Pruning не является заменой производительности.** Он определяет СМЫСЛ выдачи; он MUST NOT использоваться как оправдание для вычисления всех теневых выравниваний с последующей фильтрацией. Требования к kernel — §4.2.1.

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

Сам протокол един, но измерительные оси бюджета разделены: `scan work`,
`verifier states`, `traceback/materialisation` и `retained output` не расходуют один
общий счётчик. Нельзя получить `RESOURCE_LIMIT` только потому, что полный lossless
scan обеих цепей съел лимит, предназначенный для DP. Исчерпание любой отдельной оси
всё равно идёт по typed incomplete-пути выше; поднимать суммарный потолок вместо
разделения счётчиков запрещено.

Raw error text наружу не выходит. Следующий запрос использует здоровый worker, если сам worker не падал.

Configured result `limit` применяется после детерминированного ранжирования. Внутренний candidate budget MUST NOT молча превращать незавершённый scan в «0 совпадений». Если полный target не проверен, outcome — typed resource incomplete.

---

## 4. Алгоритм и производительность

### 4.1 Архитектура

Shipping-модули:

| Модуль | Ответственность |
|---|---|
| `dna-linear-scan.js` | block-vector Myers, lossless candidate ends и scan telemetry |
| `dna-linear-verify.js` | shared-window score-only DP, exact Dinkelbach convergence и bounded traceback |
| `dna-linear-kernel.js` | strands, circular geometry, endpoint pruning, ranking и compact occurrences |

`dna-linear-kernel.js` принят как production approximate kernel. Прежний gapped-контур
остаётся за внутренним тестовым швом для differential/parity-доказательств и не является
shipping default. Общая block-Myers рекуррентность живёт в `dna-myers-block.js`; второй
production-владелец той же арифметики запрещён.

`seq-match.js` владеет фазами одной молекулы, а `search-worker-core.js` — corpus-wide
порядком exact по всей библиотеке → approximate только при полном exact-промахе.
`dna-literal-exact.js` выполняет точную фазу; `library-search.js` и facade не содержат
второй копии биологии.

### 4.2 Production strategy

1. Нормализовать query/target и threshold.
2. Вычислить безопасный unit-edit bound:

   `K = floor(queryLength * (10000 - thresholdBps) / thresholdBps)`.

3. Выполнить exact Myers bit-vector approximate-substring scan по target; для query длиннее машинного слова использовать block vectors.
4. Для каждого candidate end восстановить релевантные starts в bounded window, сгруппировать по `(strand,start)` и выбрать alignment точной tuple из §3.2.
5. Отфильтровать точной identity-формулой, а не только edit distance.
6. Нормализовать circular coordinates, strands и duplicates.
7. Просканировать весь target; хранить bounded лучшие результаты.

Myers выбран как production candidate scan, потому что решает approximate substring matching без обязательного exact seed. Научная основа: Gene Myers, 1999, [DOI 10.1145/316542.316550](https://doi.org/10.1145/316542.316550).

Exact-фаза использует `dna-literal-exact.js`: потоковый literal/KMP путь с теми же
strand/circular/budget/cancel/envelope контрактами. Threshold 100% является exact-only.

Seed/minimizer MAY быть добавлен только как доказанно lossless accelerator. Exact-seed-only маршрутизация запрещена: 80%-hit без surviving 8-mer обязан находиться.

WFA/Rust/WASM не входят в этот спринт. WFA — exact pairwise global/affine algorithm, а здесь нужен approximate substring/glocal scan; перенос допускается только после измеренного project gate. Справка: [Marco-Sola et al., 2021](https://academic.oup.com/bioinformatics/article/37/4/456/5904262).

#### 4.2.0 Граница интерактивного поиска и маршрут запроса (нормативно)

Ограничение по длине относится ТОЛЬКО к поиску с заменами и гэпами. Точный поиск длиной не ограничен.

**Маршрут для валидного ACGT-запроса любой длины:**

1. **Сначала точный поиск** — обе цепи, кольцевой origin-wrap, без второго оборота, в worker, с cancel и stale-drop.
2. Найден точный hit → вернуть его, **независимо от длины запроса**.
3. Точного hit нет:
   * threshold 100% → честный exact-only ноль;
   * threshold <100% и `length ≤ 100` → production kernel `LINEAR`;
   * threshold <100% и `length > 100` → approximate kernel НЕ запускается,
     возвращается типизированный **`REQUIRES_ALIGNMENT`**.

В global library search «точного hit нет» означает завершённый exact-проход ВСЕХ
eligible documents. Miss первого документа не может преждевременно вернуть
`REQUIRES_ALIGNMENT`, если точный hit находится в следующем документе.

| Вход | Точный поиск | Поиск с заменами и гэпами |
|---|---|---|
| bare global DNA от `minQueryLen` | да | да при threshold <100% и длине ≤100 |
| явный непустой A/C/G/T `seq:` | да | да при threshold <100% и длине ≤100 |
| Ctrl+F, `8 … 100 нт` | да | да при threshold <100% |
| `> 100 нт` | да | threshold <100% → `REQUIRES_ALIGNMENT`; 100% → exact-only zero |

**`REQUIRES_ALIGNMENT` — не промах.** Это отдельный маршрут, а не ошибка алфавита и не ошибка длины. Он ОБЯЗАН отличаться от честного нуля:

* не показывать «Результатов: 0» и «Ничего не найдено»;
* текст: «Поиск с заменами и гэпами доступен до 100 нт. Для более длинной последовательности откройте выравнивание»;
* давать явное действие перехода в alignment workflow.

Верхняя граница приблизительного поиска — **100 нт**. `minQueryLen` является порогом
автоопределения bare DNA, а не нижней границей worker/core; явный `seq:` намеренно его
обходит. Запрос длиннее 100 нт не превращается в «медленный, но живой» approximate-поиск:
это exact-only либо отдельный alignment-маршрут по правилу выше.

#### 4.2.1 Требования к kernel (нормативно)

Endpoint-shadow pruning (§3.2.1) задаёт смысл выдачи и NOT является оптимизацией: отфильтровать готовые occurrences после сотен traceback недостаточно — UI станет чище, а CPU останется тем же. Kernel MUST:

Kernel строится как НОВЫЙ поток, а не как ускорение текущего traceback:

~~~text
candidate endpoints → bounded shared window → score-only states →
traceback ТОЛЬКО для retained winners → prune shadows → format occurrences
~~~

Требования:

1. работать по предписанной §4.2 схеме **candidate ends**, а не запускать независимый тяжёлый Pareto-DP на каждый candidate start;
2. для одного end восстанавливать starts в **общем bounded window**, переиспользуя одну DP-развёртку;
3. хранить **компактные score-only состояния**; полный edit script строится ТОЛЬКО traceback'ом сохранённого представителя, а не переносится строкой в каждом DP-состоянии;
4. для query длиннее машинного слова использовать **block-vector Myers**, а не один произвольной длины BigInt;
5. **не использовать `rawEnd = start + span` как identity для circular.** Внутренняя модель kernel обязана сразу мыслить в терминах
   `physicalEndpoint = (start + span) mod targetLength`, общего `liftedEnd = E` на bucket и интервала `[E − span, E)`; именно эти lifted-интервалы идут в pruning и comparator;
6. быть дифференциально сверенным с raw-oracle + endpoint pruning (оптимизация не имеет права менять результат).
7. использовать plateau/run candidate ends только как границу общей работы; plateau
   MUST NOT выбирать, удалять или подменять реальные starts/endpoints;
8. завершать Dinkelbach только при точном `val === 0`; фиксированный iteration cap без
   проверки сходимости запрещён. Исчерпание измеряемого iteration/state budget даёт
   typed `RESOURCE_LIMIT`, а не приблизительный ответ;
9. проверять query общим strict A/C/G/T-validator без Unicode truncation; пустой query
   и неверный `thresholdBps` отвергаются fail-closed;
10. иметь chunk/budget/cancel checkpoints в scan и verifier и не выделять окно
    `O(target)` на low-complexity input без предсказуемого лимита;
11. считать все подтверждённые loci и scalar metrics, но материализовывать canonical
    path только retained winner или точной tie-break ничьей. UI не является причиной
    строить traceback каждого raw start;
12. публиковать telemetry как минимум по `candidateEnds`, `rawStarts`,
    `verifiedStarts`, `retainedLoci`, `tracebacksMaterialized`, scan/verifier work и
    реально выделенным bytes.

Linear/Dinkelbach kernel прошёл differential, mutation, budget/cancel, transport parity,
related и browser acceptance и является shipping default. Gapped-контур остаётся только
внутренним fallback/seam для доказательств; пользовательского переключателя нет.

При изменении production kernel обязательны одновременно:

1. RED→GREEN для Unicode fail-open, empty query, точной Dinkelbach convergence,
   separate budgets, low-complexity memory/cancel и `both`/circular geometry;
2. малый exhaustive differential плюс рабочие 20/100/200/400 fixtures/properties;
3. две независимые oracle-реализации сохраняются test-only, если доказана их
   независимость; общий shared bug проверяется micro-brute-force;
4. mutation proof для block carry/partial word, plateau deletion, endpoint bucket,
   circular modulo, convergence cap, budget bypass, strand merge и stale/cancel;
5. compact output parity: coordinates/segments/strand/scalar metrics/canonical winner
   и `locationCount`; script/editRuns проверяются внутри kernel только там, где
   материализованы, и не входят в search UI payload;
6. benchmark одного и двух РЕАЛЬНЫХ workers; арифметическое деление времени на число
   workers доказательством не является.

Bench-профиль показывает `20 / 100 / 200 / 400` на 1 Mb и реальные
shared-backbone/low-complexity корпуса по колонкам telemetry из п.12. Product gate
`<1 s` относится к действующему live-диапазону `20/100`; `200/400` остаются
исследовательскими колонками и расширяют маршрут только после собственного полного
гейта. Провал `200/400` не разрешает расширять дедуп, терять starts/endpoints или
поднимать общий budget.

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
| 1 Mb deterministic ordinary-complexity target, query 20–100 нт, 80% | exact final < 1 s после готовности worker |
| 1 Mb, query > 100 нт | exact отвечает; при threshold <100% approximate не запускается → `REQUIRES_ALIGNMENT`, при 100% возможен honest zero |
| cancel/stale-drop p95 | < 100 ms |
| UI long task | < 50 ms |
| library 10 Mb | < 250 MB, stress ceiling < 500 MB |

Обычная unit suite не должна содержать хрупкий wall-clock assert. Bench profile использует детерминированный corpus и публикует измерения отдельно. Low-complexity worst case вправе завершиться только явным `RESOURCE_LIMIT/incomplete`, не silent miss.

Local production acceptance пройден на текущей машине. Эталонный weak-PC прогон и
изолированный peak памяти самого worker отложены в [`BACKLOG.md`](../BACKLOG.md) и не
являются утверждениями этой приёмки.

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

Search prefs schema повышается до v2 с явной миграцией v1→v2. Сохраняются threshold, strands, circular, min length, head versions и limit; весь объект пользователя молча не сбрасывается. Старые `iupac` и DNA `maxMismatches` удаляются из активной v2-схемы и не влияют на runtime.

Threshold 100% — пользовательский exact mode: ни substitution, ни indel не проходит.

### 5.2 Реактивность prefs

Сохранение настроек MUST немедленно пересчитать текущий запрос. Сейчас SmartBar читает localStorage только при следующем изменении query/documents. Реализация использует один search-prefs subscription/controller либо scoped event с validated payload; повторный парс localStorage несколькими компонентами запрещён.

### 5.3 Результат

Примеры:

- «95% идентичность · 20/21 точных · 1 вставка»;
- «80% идентичность · 16/20 точных · 4 замены»;
- «Запрос содержит неподдерживаемые символы — используйте только A, C, G, T» (blocking, без запуска поиска).

UI:

- использует `alignmentLength` как denominator;
- различает substitutions, indel bases и indel events;
- не показывает compatibility/IUPAC-режим: DNA Search всегда сообщает identity по A/C/G/T-контракту;
- best occurrence выбирает не только процент, но и §3.2 tie-break;
- jump использует physical `location.segments`;
- не создаёт вложенную кнопку внутри `role=option`;
- все новые строки идут через i18n и design tokens.

#### 5.3.1 Search — locator/ranker, не alignment viewer

Search dropdown НЕ показывает полное парное выравнивание ни для короткого, ни для
длинного query. Одна строка соответствует одной entity и использует её лучший
подтверждённый occurrence. Основная строка показывает имя и процент identity.

Подтверждённые строки сортируются:

1. по identity по убыванию;
2. при равенстве — полным каноническим comparator §3.2;
3. при полном равенстве — стабильно по `entityRefKey`.

Pending/incomplete/blocked не смешиваются с подтверждённым рейтингом и не становятся
selectable как sequence-confirmed.

Hover И keyboard focus открывают одну и ту же компактную карточку опорных чисел:

- `M/L` и процент identity;
- substitutions `X`, insertions `I`, deletions `D`, indel events;
- цепь `+`/`−`/`both`;
- 0-based half-open physical coordinates;
- количество подтверждённых loci в entity.

Координаты и nucleotide counts используют существующий mono typography token;
surface/focus/status оформляются только существующими design tokens.

В tooltip/listbox запрещены alignment strings, CIGAR-подобный script, editRuns и
побуквенная разметка. Hover-only информация запрещена: те же числа MUST быть доступны
при фокусе клавиатурой и скринридеру.

Клик по строке открывает entity на её best occurrence, центрирует sequence/map и
подсвечивает canonical `location.segments`. Для origin-wrap подсвечиваются два
physical segments; полный alignment для перехода не нужен. Если loci несколько,
строка показывает их количество, но текущий scope не добавляет отдельный просмотрщик
или раскрытие всех alignments.

Переход к результату MUST сохранить search session. Back восстанавливает query,
mode/filters, отсортированный список, scroll position и active option. При неизменном
library snapshot используется та же подтверждённая session; при изменившихся данных
query/UI-state сохраняются, а результаты честно пересчитываются.

Facade/VM проецирует компактный `SearchHitSummary`: `entityRef`, best
`location.segments/strand/wrapsOrigin`, scalar metrics, `identityBps` и
`locationCount`. Script/editRuns не являются частью UI-контракта. Это не ослабляет
математику: kernel по-прежнему обязан выбрать тот же canonical winner, но не обязан
хранить или передавать выравнивания, которые пользователь не увидит.

### 5.4 Две поисковые поверхности

Если A/C/G/T-query принят обеими поверхностями, одинаковые query, target, threshold и
strands/topology MUST давать одинаковые occurrences. Входные minimum-policy различаются
и описаны в §4.2.0:

1. Library global search через `seqMatch`/worker/facade.
2. `SequenceSearchPopover` внутри открытой молекулы.

Popover MUST перестать вызывать тяжёлый `searchSequence` синхронно в `useMemo`. Он переиспользует существующий search worker protocol с одним synthetic worker document либо общий thin client. Второй алгоритм запрещён.

Popover получает topology через тонкий SearchHost adapter. Поскольку `LibraryWorkspace.jsx` находится у hard-порога, допустим только prop wiring с нулевой/отрицательной дельтой; если нужно больше нескольких строк, SearchHost сначала выносится в новый search-owned leaf component.

Существующий `SearchHitsOverlay` принимает canonical `location.segments` и отображает
каждый physical segment. Legacy `targetStart/targetEnd` MAY поддерживаться как
transitional fallback. Для Search достаточно подсветки найденного interval: gap/mismatch
markers и полное выравнивание не являются обязательным контрактом. Если детальные runs
когда-либо строятся on-demand отдельным alignment workflow, origin-wrap всё равно не
схлопывается в один выходящий за bounds прямоугольник.

Tree metadata search, primer binding и Alignment homolog search остаются отдельными контрактами.

---

## 6. TDD-матрица

До production code создаётся независимый exhaustive/Pareto glocal oracle только для маленьких test inputs. Обычный Wagner–Fischer, минимизирующий только edit distance, oracle не является: нормативная tuple сначала максимизирует identity. Test oracle перечисляет допустимые target spans и сохраняет Pareto states по `M/X/I/D/gapEvents`, затем применяет §3.2.

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
13. `seq:`/DNA-mode с `N/R/Y/U/-` блокируется как `invalid-dna` до worker/provider;
14. lowercase A/C/G/T нормализуется, но внутренние посторонние символы не удаляются молча;
15. неоднозначный символ в target считается `X`, никогда `=`/compatible match;
16. reverse-complement-only hit и корректное mapping исходных query positions;
17. `bothStrands:false`;
18. palindrome EcoRI → один `both` occurrence;
19. circular exact wrap;
20. circular gapped wrap с gap около origin;
21. запрет второго круга и `targetSpan > circleLength`;
22. overlapping `AA` in `AAAA` → starts 0,1,2 до limit;
23. stable ordering/tie-break;
24. exact 80,00% без float drift;
25. если kernel материализует edit-runs для канонической ничьей, replay восстанавливает query и target span;
26. provider contract принимает валидные coordinates и отвергает подмену owner;
27. один и тот же case даёт одинаковый ответ global/Popover.
28. Popover adapter переводит canonical `location/metrics` в overlay/nav без потери wrap segments, strand и identity.
29. typed `RESOURCE_LIMIT` от worker и inline пути даёт одинаковый incomplete session без sequence hits.
30. global result rows отсортированы по identity, затем §3.2, затем стабильному entity key;
31. hover и keyboard focus показывают одинаковые `M/L`, `X/I/D`, strand, coordinates и location count без alignment string;
32. клик открывает best occurrence и подсвечивает canonical segments, включая minus и origin-wrap;
33. Back восстанавливает query/mode/filters/results/scroll/active option;
34. entity с несколькими loci остаётся одной строкой, показывает `locationCount`, клик ведёт к best occurrence;
35. pending/incomplete строка не смешивается с подтверждённым рейтингом и не выбирается;
36. facade/VM/DOM не требуют script/editRuns для search result; kernel telemetry отдельно считает реально материализованные traceback.

### 6.2 Property и differential

- random short query/target против test oracle;
- reverse-complement symmetry;
- circular rotation invariance;
- insertion/deletion symmetry;
- если edit-runs материализованы, их replay и counts совпадают;
- метрики неотрицательны и сумма колонок точна;
- `0 <= identity <= 1`, identity всегда конечна для подтверждённого DNA occurrence;
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
- молча принять/переписать non-ACGT query;
- посчитать неоднозначный target-символ совпадением;
- снять stale-drop/cancel;
- на resource exhaustion вернуть `[]`;
- вернуть влияние legacy `maxMismatches`.

---

## 7. Реализация и приёмка

Этапы K0–K3 и U0–U7 завершены 02.08.2026. Промежуточные RED/GREEN, мутационные
прогоны и benchmark-итерации не являются частью живой спецификации; после checkpoint
они сохраняются в Git.

Shipping defaults:

- corpus-wide route — `EXACT_FIRST`;
- exact — без верхнего предела;
- bare DNA — от `minQueryLen` (default 8), явный `seq:` обходит этот порог,
  Ctrl+F отдельно требует 8 нт;
- approximate — для принятого query длиной до 100 нт при threshold <100%;
- `>100` без exact при threshold <100% — `REQUIRES_ALIGNMENT`;
- threshold 100% — exact-only и может честно вернуть ноль;
- approximate kernel — `LINEAR`;
- клиентский timeout — 15 с;
- обычная отмена — cooperative cancel/ACK без `terminate()`.

Финальный frontend gate: 804/804 файлов, 8182 теста
(8162 passed, 20 skipped, 0 failed). Backend: 127 passed. Production build:
579 modules. Browser acceptance shipping-сборки: 32/32 сценария.

Local production acceptance не заявляет поведение на эталонном слабом ПК и точный
peak памяти самого worker текущей сборки; оба измерения отложены в
[`BACKLOG.md`](../BACKLOG.md). Pending/incomplete no-open доказан
интеграционными тестами, но не воспроизведён live в браузере.

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
8. `seq:ACGN`/DNA-mode с неоднозначным символом → blocking `invalid-dna`, worker не запускается;
9. изменение threshold в открытых Settings немедленно меняет текущую выдачу;
10. global search и Popover показывают те же coordinates/metrics;
11. pending/incomplete не выбирается и не выглядит как честный zero;
12. global rows идут `100% → 95% → 80%`, затем по §3.2 и стабильному entity key;
13. hover и keyboard focus показывают одну компактную карточку `M/L`, `X/I/D`, strand, coordinates и location count;
14. click и Enter открывают один best locus; plus/minus и wrap используют canonical segments;
15. Back восстанавливает query/chips/list/scroll/active row;
16. dropdown не содержит alignment string/script/editRuns;
17. console/server errors = 0.

Если failure/pending невозможно воспроизвести без production fault-toggle, разрешён детерминированный harness; отчёт обязан честно отделить test-covered от live-verified.

---

## 9. Definition of Done

Функция завершена только если одновременно:

- 80% имеет одну формулу на всех DNA-маршрутах;
- короткие query больше не bypass threshold;
- substitutions и indels штрафуются симметрично;
- non-ACGT query блокируется до вычисления, а ambiguity target не засчитывается как match;
- query coverage всегда полная;
- circular/strand coordinates доказаны;
- global и local surface используют один engine;
- heavy compute не идёт в UI thread;
- failure/incomplete/strict-AND contracts сохранены;
- dropdown остаётся locator/ranker: identity-first список, компактные метрики, jump по segments и восстановление search session после Back; полное alignment в Search не рендерится;
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
