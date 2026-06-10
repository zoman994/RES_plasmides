# SPEC_PRIMER_TAIL_UNIFICATION — движок primer-tail (surface-agnostic) + мастер-обзор assembly-системы

**Статус:** 🟡 черновик / к реализации
**Тип:** A (архитектура + алгоритм)
**Создано:** 2026-05-29 · **переписано 2026-06-04** (выверка по коду 04.06; добавлены раздельные Tm-binding/Tm-tail; 4-я спека `SPEC_CANVAS_LIVE_PROJECTION` в мастер-обзор и порядок; устаревший handoff заменён). Источник — 29.05-версия, не дословно.
**Роль:** движок хвостов/праймеров, не зависящий от поверхности; читает per-junction конфиг (его дом и UI — `SPEC_ASSEMBLY_JUNCTION_MODULE`), производит/потребляет пул праймеров. Несёт фиксы V130/V131.

---

## МАСТЕР-ОБЗОР (читать первым — общий для четырёх спек набора)

### Видение
Метод сборки и праймеры выбираются **на стыке фрагментов, инлайн, прямо при накидывании кусков** — не после realise, не на отдельном экране. Стык-элемент кликабелен в ОБОИХ режимах (sequence-полоса + граф). Realise = только визуализация/коммит виртуального продукта, решений в нём нет. Граф-вид = живая проекция той же сборки, а не выход кнопки realise. Самодостаточный реюзабельный модуль.

### Декомпозиция (4 спеки, чёткие границы владения)
- **`SPEC_PRIMER_TAIL_UNIFICATION` (эта)** — ДВИЖОК. `buildOverlapTail`, конвенции overlap/GG/RE/KLD, V130 (realise=редактор), V131 (GG/RE по V124/V125, pydna-proven), чтение per-junction конфига, раздельные Tm-binding/Tm-tail, реюз `primerPairId`, пул `LibraryEntry kind:'primer'` + `inStock` + реюз (порт `primer-reuse`). Surface-agnostic.
- **`SPEC_ASSEMBLY_JUNCTION_MODULE`** — МОДЕЛЬ СТЫКА + UI + СБОРОЧНАЯ ЛОГИКА. `zone.junctions[pairKey]` (дом конфига), `JunctionControl` (инлайн: метод + overlapTarget + len/Tm хвоста + len/Tm binding), оверлей над `SequenceView`, двухуровневость (внутренний фьюз vs замыкание), метод↔топология, мягкая валидация, RealiseModal→визуализация (`MethodPickerCard` удаляется), группировка как advisory. Вызывает движок (эту спеку).
- **`SPEC_ASSEMBLY_PIECE_MODEL`** — ЧТО ТАКОЕ ФРАГМЕНТ И КАК ДОБЫВАЕТСЯ. Де-гэп, фрагмент без backbone (симметричный, ori-агностичный), единый synthetic-insert путь (матричный/олигный, `snippet-catalog`), RE-two-route. Кормит куски, которые стыкует модуль стыка.
- **`SPEC_CANVAS_LIVE_PROJECTION`** *(новая, 04.06)* — ГРАФ-ВИД = ЖИВАЯ ПРОЕКЦИЯ. Граф рисует pieces→реакции→◇виртуальный продукт непрерывно (сейчас граф = только выход realise, pieces исключены — V114). `StitchMarkers`-чип на стыке в граф-виде, реюз `JunctionControl` + `zone.junctions` (тот же стык-элемент, что в sequence). Realise → commit-only. Слот после JUNCTION_MODULE.

Зависимость: PIECE_MODEL (куски) → JUNCTION_MODULE (стыкует, владеет конфигом + UI) → ENGINE (праймеры по конфигу) → CANVAS (проецирует тот же стык на граф).

### Сквозные решения (29.05, уточнено 04.06)
- **Поверхность стыка** — инлайн на стыках в `SequenceView` (sequence-mode) и на граф-проекции (canvas-spec), сразу на add. НЕ в RealiseModal.
- **Realise = визуализация/коммит** виртуального продукта, `MethodPickerCard` удаляется (Q7). Граф может наносить проекцию и автоматически (CANVAS-spec решает commit-only vs авто).
- **Дом per-junction конфига — `zone.junctions[pairKey]`**, ключ `{leftSegmentId, rightSegmentId}` (Q6).
- **Раздельные ручки праймера (04.06):** комплементарная область (binding) — длина ИЛИ Tm-binding; хвост/перекрытие (tail) — длина (`overlapLength`) ИЛИ Tm-tail. Четыре независимых поля в конфиге стыка; авто-дефолт, ручной оверрайд.
- **Без backbone** — есть «фрагмент», вектор/вставка не различаем; ori-агностично; кольцо без ori разрешено.
- **Двухуровневость:** внутренние стыки (наращивание линейного фрагмента) = {overlap, RE}; замыкание (wrap-around, только когда кольцо) = {Gibson, GG, KLD, RL}.
- **Gibson/GG линейное не собирают** → выбор Gibson/GG/KLD/RL ⟹ `topology.circular`; внутренним стыкам Gibson/GG не предлагаются.
- **Дефолт метода стыка = overlap** (фьюз), НЕ `detectJunctionKind`-по-концам; ends-детект → необязательная подсказка-бейдж.
- **Группировка в реакции — пользовательская фича с advisory-эвристикой** (`auto-group-pipeline`, порог 6). НЕ авто-вывод из методов стыков.
- **Мягкая валидация:** невыполнимый метод не блокируется — варнинг с причиной.
- **Module-size:** `SequenceView/index.jsx` ≈49.7 KB hard-breached (TD-SIZE-SEQUENCEVIEW-INDEX) → junction-UI монтируется **оверлеем из модуля**, не дописывается внутрь.
- **Реюз (§17):** `junction-styles` (модель/палитра), `JunctionPopover` (готовый редактор метод+overlap → база `JunctionControl`), `primer-reuse` (матчинг), `snippet-catalog`, `calcTm`, `useAssemblyPrimerWriting`, `coloredZones` — не дублировать.

### Резолюция вопросов
- **Q4** (pydna в окружении) → Code ставит изолированный venv (BioPython ≤1.84) + сверяет перед слоем 1; не блок Игоря.
- **Q5** → промоция в пул по жесту биолога + авто при подтверждении заказа.
- **Q6** → `zone.junctions[pairKey]`. **Q7** → метод в инлайн-контроле, Realise=визуализация, `MethodPickerCard` удаляется.
- Порог пред-объединения = **6** (`auto-group-pipeline`).
- **V130/V131** — в `BUGS.md` (OPEN/Высокие), переподтверждены чтением 04.06. Спеки их не дублируют, ссылаются.

### Порядок реализации (строгий, через 4 спеки)
1. **ENGINE слой 1** — pydna-фикстуры + biology-invariant тесты (решают GG/RE-конвенцию фактом, V131).
2. **ENGINE слой 2** — V130 (realise=редактор) + единый `buildOverlapTail` + раздельные Tm-binding/Tm-tail. (Чтение конфига A3 на временном дефолте до JUNCTION_MODULE.)
3. **JUNCTION_MODULE** — `zone.junctions` + `JunctionControl`-оверлей + двухуровневость + метод↔топология + валидация + RealiseModal→viz.
4. **PIECE_MODEL** — де-гэп + synthetic-insert + RE-two-route. (|| JUNCTION_MODULE после слоя 2; пересечение только на `acquisitionMethod`.)
5. **CANVAS_LIVE_PROJECTION** — граф-проекция pieces→реакции→◇ + `StitchMarkers` (после JUNCTION_MODULE; реюз `JunctionControl`/`zone.junctions`).
6. **ENGINE слой 5** — пул + реюз (порт `primer-reuse`, method-aware).

Каждый слой/спека — отдельный STOP + визуальная приёмка отдельной сессией.

---

## §0. Срез размеров зоны правки (движок)

Точные KB — Code перемеряет (`list_directory_with_sizes`), фиксирует в отчёте.

| Файл | Оценка | Лимит | Статус |
|---|---|---|---|
| `components/CanvasSkeleton/lib/primer-derive.js` | ~7 KB | .js 25/20 | ok |
| `components/CanvasSkeleton/lib/zone-pieces-to-dag.js` | ~10 KB | .js 25/20 | ok |
| `components/CanvasSkeleton/lib/assembly-primer-utils.js` | ~5 KB | .js 25/20 | ok |
| `components/CanvasSkeleton/canvas/junction-styles.js` | ~7 KB | .js 25/20 | ok (модель — читается, почти не правится) |
| `tm-calculator.js` (корень) | ~7 KB | .js 25/20 | ok |
| `primer-reuse.js` (корень) | малый | .js 25/20 | ok (порт) |
| пул: `components/Library/**` | — | — | новый модуль промоции (Code уточняет точку) |

Ни один файл движка не над hard → декомпозиция не первым пунктом. Новые `buildOverlapTail` + пул-промоция — отдельные хелперы, не дописывание. `SequenceView/index.jsx` hard-breached — но это зона JUNCTION_MODULE/CANVAS, не движка.

---

## §1. Контекст — дефекты движка (переподтверждены чтением кода 04.06)

Три независимых генератора хвостов; пикерный путь их не сводит и в одном месте роняет результат.

- **`deriveAutoPrimers(opGroup, state)`** (`lib/primer-derive.js`): авто-праймеры op-группы. `SKIPPED_KINDS={snippet,gap}`; `OVERLAP_LEN=25` (двусторонний: fwd=`prevSeq.slice(-25)` дословно, rev=`rc(nextSeq.slice(0,25))`); `BINDING_LEN=20` фикс (fwd=`fullSeq.slice(0,20)`, rev=`rc(fullSeq.slice(-20))`); GG fwd=`GGTCTCN${oh}`, rev=`rc('GGTCTCN'+oh)`; RE fwd=`reSite+'GG'`, rev=`rc('reSite'+'GG')`; Tm=`calcTm` (SantaLucia, V105). Эмитит `source.kind='auto-group'` + `source.{pieceId,leftSegmentId,rightSegmentId}` (через `boundaryInfo`). Кладётся в `state.assemblyDraftPrimers[zoneId]`.
- **`buildAssemblyPrimer({...})`** (`lib/assembly-primer-utils.js`): ручные из выделения; boundary-aware (один пересечённый стык → junction-праймер с хвостом); `source.kind='boundary'|'segment'`; `tailLen=20`.
- **`local-primer-design.overlapTail`** (корень): v0.5, пикером/канвасом НЕ используется; здесь живут принятые V123/V124/V125.

**Сертифицированные дефекты:**

1. **V130 (high) — realise роняет overlap-хвосты.** `mapPrimersForSegment` (`zone-pieces-to-dag.js`) матчит только `source.kind ∈ {segment,boundary}`; `auto-group` мимо → fallback `autoPrimerPair(seg.sequence)` = `slice(0,20)`/`rc(slice(-20))`, tm:0, без хвостов. `realiseAssembly` читает тот же `assemblyDraftPrimers[targetId]`. Пикер показывает праймеры с overlap, Realise материализует тупые концы — тихий неверный результат, конструкт не соберётся.
2. **V131 (high) — GG+RE хвосты расходятся с принятыми V124/V125.** GG rev = `rc('GGTCTCN'+oh)` (rc всего recognition+spacer+overhang → recognition наружу, плечо не режется — V124). RE fwd = `reSite+'GG'` (сайт впритык к 5′, защитные ВНУТРИ — V125 «нет 5′-фланкинга»). Overlap-ветка `primer-derive` **уже верна** (fwd дословно / rev rc — bio-инвариант в шапке файла). Расходятся только GG и RE. Фиксы V124/V125 легли только в `local-primer-design.js` (канвасом НЕ используется).
3. **`overlapTarget`/длина/Tm движком не читаются** — хардкод двусторонний 25, binding фикс 20. Модель `overlapTarget/overlapLength/overlapTm` есть в `junction-styles.defaultJunctionParams` (дефолт `right/30`), но `deriveAutoPrimers` её игнорирует, `realise.junctionForMethod` берёт только дефолты (выбор юзера теряется). Раздельной Tm для binding нет вовсе.
4. **`primerPairId` куска игнорируется** — binding с нуля (`slice`), хотя ПЦР-кусок несёт `acquisitionParams.primerPairId`.
5. **Встраивание короткого гейтится по `kind==='snippet'`** — а пикер/insert делает `kind:'sourced'`/manual (см. PIECE_MODEL).
6. **Двусторонний overlap избыточен** — ~50 нт там, где хватает 25–30 на одном праймере.
7. **Пул праймеров не построен в four-tier** — `LibraryEntry kind:'primer'` объявлен, путей создания нет. Матчинг реюза **уже написан** (`primer-reuse.js`: `findCompatiblePrimers`+`buildOrderSheet`), но на `localStorage` (v0.5) и не method-aware.

---

## §2. Стратегия

Один путь хвостов, **сначала доказанный против pydna** (слой 1 решает GG/RE-конвенцию фактом, а не рассуждением), потом — потребление per-junction конфига (включая раздельные Tm-binding/Tm-tail), реюз, пул. Слои строго по порядку: UX/реюз на неподтверждённом движке = класс V123/V130. Движок surface-agnostic: читает `zone.junctions[pairKey]` (дом — JUNCTION_MODULE), отдаёт праймеры, которые рисует `SequenceView`/граф-проекция и материализует realise. Реюз `primer-reuse` (матчинг), `junction-styles` (конвенции), `calcTm`.

---

## §3. Scope

**IN:**
- Конвенция хвостов overlap/GG/RE/KLD сведена к одному `buildOverlapTail`, **доказана** pydna-фикстурами на пути `deriveAutoPrimers`.
- V130: realise потребляет canonical-запись (realised = редакторные).
- V131: GG/RE приведены к V124/V125 после pydna.
- `deriveAutoPrimers` читает per-junction `{method, overlapTarget, overlapLength|overlapTm(хвост), bindingLength|bindingTm}` из `zone.junctions[pairKey]`.
- **Раздельные Tm:** длина binding по `bindingTm` (иначе дефолт/explicit), длина хвоста по `overlapTm` (иначе `overlapLength`).
- Односторонний overlap по `overlapTarget`.
- Реюз binding куска из `primerPairId`; хвост пересчитывается по методу.
- Встраивание короткого через `pieceSequence` (порог/маршрут — PIECE_MODEL; движок выполняет).
- Слой 5: пул `LibraryEntry kind:'primer'` + `inStock` + реюз (порт `primer-reuse`, method-aware).

**OUT:**
- Дом конфига + UI стыка (`JunctionControl`) + двухуровневость + валидация → `SPEC_ASSEMBLY_JUNCTION_MODULE`.
- Граф-проекция + `StitchMarkers` → `SPEC_CANVAS_LIVE_PROJECTION`.
- Де-гэп + insert-путь + RE-two-route + piece-модель → `SPEC_ASSEMBLY_PIECE_MODEL`.
- pydna как runtime-сервис (здесь только оффлайн-генератор эталонов).
- Hairpin/dimer-предупреждения (follow-up; примитивы в `tm-calculator`).
- Спред Tm в fusion-ПЦР (follow-up, низкая severity для препаративной).
- Legacy не-zone путь `assemblyDrafts`.

---

## §4. Архитектурные решения (движок)

**A1. Канонический `buildOverlapTail`.** Чистый хелпер `buildOverlapTail(side, neighbourSeq, opts) → string`, единый для авто (`deriveAutoPrimers`) и ручного (`buildAssemblyPrimer`) — идентичный хвост на один стык. `local-primer-design.overlapTail` остаётся только legacy не-canvas. `side ∈ {fwd, rev}`; `opts = { method, overlapTarget, overlapLength, overlapTm }`. Логика по методу (3–6 строк каждая, не копипаст):
- `overlap`/`gibson`: `fwd` → `neighbourSeq.slice(-len)` дословно; `rev` → `rc(neighbourSeq.slice(0,len))`. (Уже верно — закрепляем.)
- `golden_gate`: recognition+spacer+overhang по A2-конвенции (после pydna). НЕ `rc` всего recognition.
- `restriction`: protective(снаружи)+site по V125-конвенции (после pydna).
- `kld`/`ligation`/`blunt`: пустой хвост.
- Длина хвоста: `overlapLength` нт; либо (mode Tm) расширять от стыка пока `calcTm(tail) ≥ overlapTm`, границы 18..40 нт.

**A1b. Длина binding по Tm-binding (новое 04.06).** Извлечение binding (`fwd=fullSeq.slice(0,n)`, `rev=rc(fullSeq.slice(-n))`) больше не фикс-20: `n` — `bindingLength`, либо (mode Tm) расширять от конца куска пока `calcTm(binding) ≥ bindingTm`, границы 16..36 нт. Дефолт — 20/нет-Tm (back-compat). Tm-binding и Tm-tail независимы (разные физические события: отжиг на матрицу vs плавление homology-arm).

**A2. Конвенция доказывается, не предполагается (V131).** Overlap-конвенция (fwd дословно / rev rc) — верна, слой 1 подтверждает. GG/RE приводятся к V124/V125-конвенции `local-primer-design` **тогда и только тогда**, когда pydna покажет, что верна она (паритет с принятым V124 делает это вероятным, но решает факт). До результата слоя 1 GG/RE-ветки `primer-derive` НЕ трогаем.

**A3. `deriveAutoPrimers` читает per-junction конфиг.** Для каждого стыка куска берёт `zone.junctions[pairKey]` (`pairKey={leftSegmentId,rightSegmentId}`; дом/инициализация — JUNCTION_MODULE). `overlapTarget`: `'right'`→хвост только на fwd нижележащего, `'left'`→только на rev вышележащего, `'both'`→как сейчас. `method` → ветка `buildOverlapTail`. Длины — `overlapLength|overlapTm` (хвост, A1) и `bindingLength|bindingTm` (binding, A1b). Конфига нет (стык не сидирован) → дефолт `overlap`/`right`/30/binding-20 (но JUNCTION_MODULE сидит на add — норма: конфиг есть).

**A4. Реюз праймера куска по методу, не дописыванием.** Если `piece.acquisitionParams.primerPairId` есть: binding берётся из него (не `slice`); валидация `indexOf`, что binding всё ещё садится на нужный конец (5′ прямой / 3′ rc) — иначе праймер `stale`. **Хвост пересчитывается по методу через `buildOverlapTail`** (НЕ дописывается старая последовательность, НЕ берётся праймер соседа).

**A5. Встраивание короткого.** Кусок, помеченный PIECE_MODEL как встраиваемый (synthetic-insert route (a)), встраивается в хвост соседа через `pieceSequence(piece, state)`, без своего ампликона. Порог/маршрут (1 праймер / 2 олиго / отожжённая пара) решает PIECE_MODEL; движок выполняет встраивание по флагу куска.

**A-mut. Мутация едет на `pieceSequence`.** `pieceSequence` уже применяет `applyPieceMutations`; binding и хвосто-контент извлекаются через него → отдельного пути для мутации НЕ заводим.

**A6. V130.** `mapPrimersForSegment` матчит canonical-запись по `source.pieceId === seg.id` **независимо от `source.kind`** (а не whitelist {segment,boundary}). В `draftFromZone` сегмент несёт `id: piece.id`, auto-group праймер — `source.pieceId`. Auto-group попадает в realise. Существующий segment/boundary-матч сохранить как fallback для ручных.

**A7. Пул праймеров (слой 5a).** Промоция `assemblyDraftPrimers` → `LibraryEntry kind:'primer'` в four-tier store (Dexie/Zustand), **не localStorage**. Payload: `{sequence, bindingSequence, tail, tm, gc, source, inStock}`. `inStock` от истории заказов (`OP_CONFIRM_ORDER`→`orderConfirmedAt`); ручной override опцией. Узел «Праймеры» дерева читает пул. Адаптер полей v0.5↔four-tier. Промоция — по жесту биолога + авто при подтверждении заказа (Q5).

**A8. Реюз готового продукта (слой 5b) — порт `primer-reuse`, method-aware.** Реюз `findCompatiblePrimers` + `buildOrderSheet` из `primer-reuse.js`, перевешенные на пул:
1. метод стыка задаёт требование к хвосту;
2. в пуле ищем праймер, чей `bindingSequence` садится на нужный конец куска;
3. **полный физический реюз** (заказывать нечего): binding подходит И хвост уже == требованию метода против нового соседа И `inStock` → берём как есть;
4. **реюз binding**: binding подходит, хвост не тот → binding сохраняем, хвост пересчитываем по методу (A4) → новый олиго, заказывается.
`inStock` гейтит только «не заказывать» (п.3). Метод-расчёт хвоста — всегда.

---

## §5. Файлы / сигнатуры (не код)

- **`lib/primer-derive.js`**: new `buildOverlapTail(side, neighbourSeq, { method, overlapTarget, overlapLength, overlapTm }) → string`; `buildFwdTail`/`buildRevTail` → через него + читают `zone.junctions[pairKey]`; binding-извлечение → длина по `bindingLength|bindingTm` (A1b); `deriveAutoPrimers` — чтение конфига (A3), `primerPairId` (A4), встраивание короткого (A5), пропуск стороны по `overlapTarget`.
- **`lib/assembly-primer-utils.js`**: `buildAssemblyPrimer` → хвост через `buildOverlapTail` (паритет с авто); `tailLen` → `overlapLength|overlapTm`.
- **`lib/zone-pieces-to-dag.js`**: `mapPrimersForSegment` — матч по `source.pieceId` (A6); `junctionForMethod` читает `zone.junctions[pairKey]` вместо `defaultJunctionParams`.
- **`canvas/junction-styles.js`**: модель читается (overlapTarget/конвенции/палитра); правок минимум; если конвенция GG/RE уточнится после pydna — поправить `inferEndRequirements` границы здесь же. Дефолты расширить полями `bindingLength/bindingTm` (дом значений — JUNCTION_MODULE).
- **пул `components/Library/**`** (5a): `buildPrimerLibraryEntry(primer) → LibraryEntry kind:'primer'`; промоция из `assemblyDraftPrimers`; `inStock` от `orderConfirmedAt`; узел «Праймеры». Точку Code уточняет по `librarySlice`/`build-library-entry.js`.
- **порт `primer-reuse.js`** (5b): `findCompatiblePrimers`/`buildOrderSheet` → на пул (не localStorage) + адаптер полей + method-aware хвост (A8).
- **`__tests__/primer-tail-pydna-golden.test.js`** (new): оффлайн pydna-скрипт → захардкоженные эталонные конструкты; тест реконструирует ампликоны из `deriveAutoPrimers` и сверяет идентичность по 6 методам + edge: single-circular self-closure, No-PCR-сосед (left/right only), коротыш-в-хвост, мутагенный мостик, GG overhang-комплементарность, RE protective-снаружи, **Tm-binding/Tm-tail подбор длины в границах**.

---

## §6. Порядок (слои движка — строгий)

1. **pydna-фикстуры + biology-invariant тесты** на `deriveAutoPrimers`. Решают A2/V131 фактом. **Без слоя 1 в GG/RE-ветки движка не лезем.** Code сперва ставит pydna (Q4).
2. **V130 (A6) + единый `buildOverlapTail` (A1) + раздельные Tm (A1b).** realise=редактор, ручной=авто. Чтение конфига A3 на временном дефолте `overlap/right/30/binding-20`, пока JUNCTION_MODULE не готов.
3. *(JUNCTION_MODULE + PIECE_MODEL + CANVAS_LIVE_PROJECTION — отдельные спеки)*
4. **Реюз `primerPairId` (A4) + встраивание короткого (A5) + мутация (A-mut).**
5. **5a пул+`inStock` → 5b порт `primer-reuse` (A7/A8).**

---

## §7. STOP + формат отчёта

Code останавливается **после слоя 1**, ждёт сверки фикстур Chat'ом (не визуальная приёмка — сверка эталонов; это решает A2). Дальше слои по одному, каждый — STOP перед визуальной приёмкой (отдельной сессией). Не финализирует PROJECT_STATE/BUGS/DECISIONS/ANCHORS/RELEASES/TECH_DEBT/CLAUDE.md/package.json/version.js без авторизации Chat. После реализации проставляет в шапку этой спеки `**Статус:** ✅ РЕАЛИЗОВАНО [дата]`.

**Handoff (04.06).** `CURRENT_TASK.md` — лаунчер этого спека-набора (live-junction сборка), активной Code-задачи нет. Handoff слоя 1 для Code кладётся в сессии старта реализации (после готовности набора из 4 спек + freshness-пасса). V130/V131 уже в `BUGS.md`. Отчёт Code: коммиты по слоям; Vitest+pytest; build; **pydna-фикстуры pass/fail по каждому методу**; отклонения явным блоком; size budget; статус-шапка проставлена.

---

## §8. Риски

1. **pydna покажет верной конвенцию primer-derive, а не local-primer-design** (или наоборот). → A2 ждёт слоя 1; GG/RE-ветки до этого не трогаем. Code verifies pydna (Q4).
2. **Реюз `primerPairId`/пула — праймер под другой конец.** → строгая `indexOf`-валидация + `stale`, не молча (A4/A8).
3. **Ре-дерайв при смене конфига перетрёт ручные правки.** → сохранять `autoMode:'manual'` (механизм есть).
4. **Tm-подбор длины не сходится** (binding/tail вне границ при экстремальном GC). → жёсткие границы (binding 16..36, tail 18..40) + варнинг «Tm недостижим в границах», берём ближайшую границу.
5. **`primer-reuse` на localStorage** vs four-tier Dexie. → 5a перевешивает на пул; localStorage-пути не тащим; адаптер полей.
6. **Слой 5a крупнее ожидаемого** (пул не построен). → 5a первым пунктом слоя 5; если >~B — отдельная спека, 5b ждёт.
7. **Зависимость от `zone.junctions`** (дом — JUNCTION_MODULE). → слой 2 на временном дефолте; полноценное чтение — после JUNCTION_MODULE.

---

## §9a. Поправки выверки 04.06 (повторное чтение кода)

Перепроверка `primer-derive.js`/`zone-pieces-to-dag.js`/`junction-styles.js` — ядро держится (V130/V131 §1 подтверждены дословно: `mapPrimersForSegment` whitelist `{segment,boundary}` мимо `auto-group`; `OVERLAP_LEN=25` двусторонний; `BINDING_LEN=20`; GG/RE-конкатенации точны; `defaultJunctionParams.overlap={right,30,null}`). Правки:

- **§1 деф.2 / A1 (RE-хвост) — формулировка.** Факт кода: fwd RE = `[reSite][GG][binding]` (5′→3′). Сайт впритык к 5′-терминусу; `GG` — спейсер сайт↔binding, НЕ «защитные ВНУТРИ». Дефект (V125) = ОТСУТСТВИЕ фланкирующих/protective оснований СНАРУЖИ сайта (у терминуса); целевая конвенция A1 «protective снаружи» их добавляет. «Защитные ВНУТРИ» в §1 читать как описанное здесь.
- **Словарь методов (новое, к §4/§5; канон фиксирует JUNCTION §9a).** В коде ТРИ написания: движок `opGroup.kind` = `overlap_pcr|gibson|golden_gate|restriction|direct_ligation` (на нём ветвятся `buildFwdTail`/`buildRevTail`); `junction.kind` = `overlap|golden_gate|re_ligation|kld|ligation|...` (палитра/`JunctionPopover`); строковый дисплей strip = `overlap-pcr|gibson|ligation`. **`buildOverlapTail.opts.method` использует словарь ДВИЖКА** (`opGroup.kind`); маппинг method→`junction.kind` (через `METHOD_TO_JUNCTION` в `zone-pieces-to-dag`) — зона JUNCTION. В A1, где написано `overlap`/`gibson` как «одна конвенция» — это `overlap_pcr`+`gibson` (обе → overlap-хвост, подтверждено: общая ветка в `buildFwdTail`).
- **A3/инвокация (к J11 JUNCTION) — существенно.** `deriveAutoPrimers(opGroup, state)` итерирует `opGroup.inputPieces` → праймеры существуют ТОЛЬКО при наличии op-группы (Sew/auto-group). J11 «дерайв на add без ручного Sew» требует явного пути вызова: транзиентная op-группа на зону ЛИБО рефактор движка под per-junction/per-piece. Согласовать ENGINE↔JUNCTION ДО слоя 2; без этого J11-обещание не исполнимо.

## §9b. Резолюция гейта слоя 1 + контракт слоя 2 (04.06 — эталоны сверены)

pydna-эксперимент `tools/pydna/primer_tail_golden.py` (+`.json`) сверен Chat'ом: формулы реплицированы дословно, биология верна. Вердикт A2/V131:

- **overlap/gibson — движок ВЕРЕН** (бесшовный 165-нт эталон). buildOverlapTail overlap-ветку НЕ менять, закрепить.
- **golden_gate — движок НЕВЕРЕН → фикс V124.** `buildRevTail` GG: `rc('GGTCTCN'+oh)` → `'GGTCTCN'+rc(oh)` (recognition НЕ rc'ится, rc только overhang). fwd (`'GGTCTCN'+oh`) не трогать. pydna: текущий → правый конец BLUNT (не лигируется); V124 → оба 5′-overhang'а. **GG-тест слоя 2 = pydna-assembly** (оба конца 5′-overhang).
- **restriction — pydna НЕ оракул → фикс V125 эмпирически.** `buildFwdTail` RE: `reSite+'GG'` (сайт впритык) → protective-основания СНАРУЖИ сайта (5′ у терминуса): `[protective]+reSite+'GG'`. Кол-во protective — по NEB cleavage-close-to-end (EcoRI ≥1, многие больше; дефолт ~3–6 нт, per-enzyme при наличии данных). **RE-тест слоя 2 = СТРУКТУРНЫЙ** (protective присутствуют снаружи сайта), НЕ pydna-assembly (pydna режет впритык идеализированно — доказано экспериментом).
- **kld/ligation** — пустой хвост, верно.
- Спейсер `'N'` в `GGTCTCN` — литеральный N в заказываемом олиго нежелателен; слой 2 заменить на конкретное основание (мелочь, не гейт).

**Хэндшейк ENGINE↔JUNCTION (разрешён — суперседит «до слоя 2» из §9a):**
- **Контракт конфига стыка** (форма, под которую строит buildOverlapTail): `zone.junctions[pairKey] = {method (словарь движка: overlap_pcr|gibson|golden_gate|restriction|direct_ligation|kld), overlapTarget (left|right|both), overlapLength|overlapTm (хвост), bindingLength|bindingTm (binding), locked?, lockReason?}`. `buildOverlapTail.opts = {method, overlapTarget, overlapLength, overlapTm}`; binding-длина (A1b) — в `deriveAutoPrimers` по `bindingLength|bindingTm`.
- **Инвокация:** слой 2 НЕ гейтится J11. Слой 2 строит buildOverlapTail (overlap + GG-V124 + RE-V125 + Tm-логику) + V130 на ВРЕМЕННОМ дефолте конфига (`overlap_pcr/right/30/binding-20`), оставаясь opGroup-driven (текущий Sew-поток). **A3** (чтение per-junction `zone.junctions`) + **J11** (дерайв на add без Sew) — СЛОЙ 3 (JUNCTION), когда `zone.junctions` существует. Решение J11: **неявная zone-группа** (pieces зоны в порядке `createdAt`, как `draftFromZone`) кормит `deriveAutoPrimers` на add; формальные op-группы (Sew/auto-group) остаются advisory (J10), НЕ гейтят существование праймеров. Точную проводку (триггер-action, точка записи `assemblyDraftPrimers`) Code решает на слое 3 чтением Sew/auto-group-потока.

→ **Слой 2 разблокирован:** buildOverlapTail с контрактом opts выше, на временном дефолте; J11/A3 — слой 3.

## §9. Открытые вопросы

- **Q4** → закрыт процессно: Code ставит pydna (изолированный venv, BioPython ≤1.84) и сверяет перед слоем 1.
- **Q5** → промоция в пул по жесту биолога + авто при подтверждении заказа.
- Остальные (Q1/Q2/Q3/Q6/Q7) закрыты в мастер-обзоре.
- **Открыто к спеке CANVAS_LIVE_PROJECTION:** Tm-binding/Tm-tail ручки рисуются в `JunctionControl` (дом UI — JUNCTION_MODULE) и тем же контролом на граф-проекции — согласовать поля конфига между JUNCTION_MODULE (дом) и движком (потребитель) до слоя 2 чтения.
