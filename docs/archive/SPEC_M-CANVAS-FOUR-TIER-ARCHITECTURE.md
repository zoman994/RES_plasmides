# SPEC_M-CANVAS-FOUR-TIER-ARCHITECTURE.md — четырёхуровневая модель канваса BodgeGene

> **Тип документа:** архитектурный якорь, не sprint. Не реализуется напрямую.
> **Назначение:** контракт на термины, связи, миграцию для спринтов T1-T10. Каждый T читает этот файл перед стартом.
> **Версия:** v1.0 от 16.05.2026.
> **Основание:** `docs/NOTES_FOUR_TIER_MODEL_DRAFT.md` (15.05.2026) + бумажная диаграмма биолога (CRISPR-knockout T.reesei, 6 зон, 9 PCR, 3 Gibson) + ответы Игоря 16.05.2026 (см. §11).
> **Замена для:** F1-F4 (window/junction/PCR/product — реализованы и архивируются по факту), A1-A4+D1 (assembly-primary итерация — архивируется как стадия пути к финальной модели).
> **Не замена для:** F1 tabs system, F2 junction shape, F3 PcrModeShell V71-V76, F4 product virtual rendering — они остаются как реализованная инфраструктура, на которой строится 4-tier.

---

## 0. Краткое резюме одной страницей

BodgeGene канвас — это **четырёхуровневая модель данных** (`source → piece → reaction → product`) внутри **зон-фреймов** с **двумя режимами отображения** (граф и последовательность) и **четырьмя способами задать piece** (выделение диапазона, клик по фиче, выбор существующих праймеров, написание новых).

**Уровень 1 — Source.** Контейнер из библиотеки. Любого типа: плазмида, oligo, gBlock, материализованный продукт прошлой сборки. Один класс `container` с флагом `kind: 'plasmid' | 'oligo' | 'gblock' | 'derived_product'`.

**Уровень 2 — Piece.** Именованный логический отбор. Может быть selection от одного source (один диапазон) или derived input-piece от reaction (1+ input source-ов через acquisitionMethod). Имеет `acquisitionMethod` (как биолог собирается получить этот piece физически).

**Уровень 3 — Reaction.** Узел графа с методом получения/соединения. Derived от piece — автоматически создаётся при `piece.acquisitionMethod = 'pcr'` (и аналогах). Биолог может также напрямую создавать reactions через canvas «+ Операция».

**Уровень 4 — Product.** Выход reaction. Всегда derived (виртуальный, пунктирный синий), пока биолог не нажмёт «Выполнено» — тогда materializes в реальный контейнер библиотеки и может использоваться как Source.

**Зоны** — фреймы как в Miro. Резиновые. Мутируемые (drag узла между зонами, drag границ, merge двух зон). Soft-migration (старые проекты работают с zoneId=null).

**Два режима** — `graph` (узлы + ромбы + стыки) и `sequence` (палитра piece-лент / собранная горизонтальная лента / пустота). Toggle хоткеями `G` / `S` или клик на toggle в углу зоны. Sequence-mode активный — drag piece в ленту создаёт ромбы в graph.

**N финалов зоны** — ветвление одной ленты в sequence-mode (не табы; решено биологом 16.05 после обсуждения 4 финалов Gibson_3 на бумажной диаграмме).

**Праймеры** — отдельный класс (id, sequence, Tm, source) И визуальный overlay на sequence (поверх piece-лент на стыках). Используется уже работающий V71-V76 PcrModeShell mechanism.

**Sanger таблица — MVP** (T10). Construct table и matrix expansion — post-MVP.

---

## 1. Контекст. Откуда взялась эта модель

### 1.1 Предыдущие итерации (для понимания эволюции)

| Дата | Модель | Что не сработало |
|------|--------|------------------|
| До 11.05 | Canvas v0.5 — Parts + Junctions, монолитный workspace | Один проект — одна каша. Нет фокуса по сборкам. |
| 11.05 | Canvas v0.6 prototype (skeleton v1) — containers + commits-DAG | DAG как первичная сущность не покрывает sequence-first workflow биолога. |
| 12.05 | Canvas V2 paradigma (skeleton v2) — placeholder containers + drag from Library Tree + auto-junctions | Решает drag-from-tree и auto-junctions. Не покрывает разделение piece vs operation. |
| 13.05 | F1-F4 серия (Window / Junction / PCR / Product) | F1+F2+F3 реализованы через V58-V76 + V71 rework. F4 partial — рендеринг virtual product работает через V68/V75 mini-canvas, F4 spec как документ не имел formal acceptance (реализация шла через bug-bash). Не покрывают piece как отдельную сущность — `op.params.range` смешивает «диапазон куска» с «параметром PCR». |
| 15.05 утро | A1-A4 Assembly Drafts — assembly-sequence-first, DAG derived | Неверная интерпретация. Биолог объяснил что DAG primary, Assembly это viewer-mode. |
| 15.05 вечер | NOTES_FOUR_TIER_MODEL_DRAFT.md — 4 уровня + зоны + dual-mode | Финальная модель. Подтверждена бумажной диаграммой биолога 16.05. |
| 16.05 | Эта спека | Консолидация всех решений. Якорь для T1-T10. |

### 1.2 Бумажная диаграмма как референс

Бумажная диаграмма биолога (CRISPR-knockout T.reesei) — основной визуальный референс. На ней:

- **6 смысловых блоков** (соответствуют 6 будущим зонам в BodgeGene):
  1. Заготовительные PCR из P46 и P43 — 4 ампликона (PCR_1..4).
  2. gRNA-кассеты — 4 параллельных OV_PCR (275 → 279/285/287/276 → gRNA(275-N) → PCR_5..8).
  3. Первая Gibson — P43_U3afu_Hyg/1 и /2 (design variants с разными gRNA).
  4. Вторая Gibson — P50_U3afu_pyrG/5 и /7 (clone variants после трансформации).
  5. PCR_9 — амплификация P50_U3afu_pyrG/5 диапазон 270-271.
  6. Третья Gibson — финальные 4 продукта (P43_U3afu_Hyg pks4 / P43_U6tre_PyrG pepA / P43_U3afu_Hyg AceI / P43_U6tre_PyrG Alba).

- **Синие прямоугольники** — sources (плазмиды) и материализованные products.
- **Зелёные карточки** — pieces с диапазоном и функциональной меткой (например «P46(272-274), 1000 п.о., U3 A.fumigatus gRNA»).
- **Фиолетовые прямоугольники** (275, 279, 285, 287, 276) — sources kind='oligo' (короткие синтетические ДНК).
- **Серые овалы** (PCR_1..9) — reactions.
- **Серые шевроны** (Gibson assembly) — reactions kind='gibson'.
- **Sanger таблица** справа — derived list pending клонов на секвенирование.
- **Construct таблица** в центре — derived view над финалами с custom полями (Промотор / Маркер / gRNA).

Слэш-нумерация (/1, /2, /5, /7) обозначает **два разных явления** — design variants (разные reactions с varying input) и clone variants (одна reaction, N материализованных колоний с meta «colony №»). Это разрешено в DEC-CANVAS-4T-17.

---

## 2. Четыре уровня данных

### 2.1 Уровень 1 — Source (Контейнер)

**Что это.** Существующий контейнер из библиотеки. Физическая ДНК у биолога: плазмида, oligo, gBlock, готовый фрагмент из старого эксперимента.

**Shape.** Один класс `container` (уже существует в `state.containers`). Расширение — поле `kind`:

```
container = {
  id,
  name,
  sequence,
  annotations: [...],
  topology: 'linear' | 'circular',
  origin: {kind, source?, importedAt?, ...},
  kind: 'plasmid' | 'oligo' | 'gblock' | 'derived_product',  // НОВОЕ
  zoneId?: string,                                            // НОВОЕ (T3)
  materializedFrom?: {reactionId, cloneNumber?},              // НОВОЕ (T9)
  ...
}
```

**Решение по kind:** один класс с флагом, не отдельные сущности (Q-new-2 от 16.05). Биолог явно сказал «у нас сейчас визард сборки, главное что мы можем просто добавить недостающий tag как в том что сейчас реализовано». Wizard сборки переиспользуется. Различие kind влияет только на визуал (синий vs фиолетовый прямоугольник, размер) и поведение piece-selection (oligo — диапазон по умолчанию вся последовательность).

**Визуал на канвасе:**
- `plasmid` — синий прямоугольник, 240×150 (BLOCK_LINEAR_H после V68).
- `oligo` — фиолетовый прямоугольник, 180×80 (меньше плазмиды, явно отличается).
- `gblock` — фиолетовый прямоугольник с пунктирной рамкой (заказан, ещё не получен) → сплошной (получен).
- `derived_product` — синий с пометкой «← из Зоны N» если zoneId.

**Что НЕ меняется.** Уже работающий `state.containers` slice, `ContainerEditorSkeleton` (двойной клик), `LibraryTreeRoot` + `LibraryTreeHost` + drag-from-tree через MIME `application/x-bodge-entry-id`. Это всё переиспользуется без правок.

### 2.2 Уровень 2 — Piece (Кусок)

**Что это.** Именованный логический отбор. Биолог сказал «вот этот участок этой плазмиды я буду использовать», но **физически piece ещё не существует** — это план. Кусок становится физическим только когда reaction выполнена и product материализован.

**Shape (новая сущность, T1):**

```
piece = {
  id: 'pc-' + uuidv7(),
  name: string,                          // user-given, например «U3 A.fumigatus gRNA»
  sourceIds: string[],                   // 1+ container ids. 1 для selection-piece, 2+ для derived-piece (OV_PCR из 275+279)
  ranges: Array<{                        // параллельно sourceIds. Для derived-piece — диапазоны на каждом source
    sourceId: string,
    start: number,
    end: number,
    orientation: 'forward' | 'reverse',
  }>,
  origin: 'selection' | 'feature' | 'existing-primers' | 'new-primers',
  // как биолог его задал — 4 способа из Q-piece-1
  
  acquisitionMethod: 'undefined' | 'pcr' | 'ov-pcr' | 'restriction' | 'direct' | 'synthesis',
  // как биолог собирается получить piece физически. NULL означает «решит позже».
  // Изменение этого поля triggers создание/удаление reaction (T8).
  
  acquisitionParams: {
    // pcr — primer pair (forward, reverse) или ref на ромб PCR
    // ov-pcr — массив primer pairs
    // restriction — список RE-сайтов
    // synthesis — pending для gBlock-заказа
    // direct — пусто
  },
  
  color: string,                         // HSL hex, автогенерированный (T1), переопределяемый
  functionalLabel?: string,              // user, например «промотор», «маркер Hyg», «gRNA-spacer»
  
  zoneId?: string,                       // T3
  derivedReactionId?: string,            // T8 — обратная ссылка на reaction (если acquisitionMethod ≠ undefined)
  
  createdAt: number,
  updatedAt: number,
}
```

**Решение по naming:** `piece` (UI: «Кусок»). После удаления legacy `Fragment`/`PartBlock` (DEAD list по плану §17 R5 COMPONENT_MAP) — конфликта не будет. Подтверждено Игорем 16.05.

**Размер piece.** Вычисляется как `Σ (range.end - range.start)` по всем ranges. Для selection-piece — один range. Для OV_PCR-derived piece (275+279) — два range, размер = суммарная длина двух кусков минус overlap (overlap считается через alignment 3'-концов праймеров).

**Reuse в нескольких зонах** (Q-piece-1, D подтверждён). Один piece, N ссылок из разных zone-узлов. Rename / изменение color / изменение functionalLabel — обновляются везде. Если биологу нужны разные параметры для одной задачи — он явно клонирует piece через action `CLONE_PIECE`.

**Что piece НЕ хранит.**
- Не хранит вычисленную последовательность — она derived через selector `selectPieceSequence(state, pieceId)`. Изменение source.sequence → автоматически обновляет piece.
- Не хранит праймеры физически — праймеры это отдельные `primer` entries в библиотеке (live), piece ссылается через `acquisitionParams.primerPairId`.
- Не хранит топологию — все pieces линейные (отобранный кусок).

### 2.3 Уровень 3 — Reaction (Реакция)

**Что это.** Узел графа с методом получения piece или соединения нескольких piece. Уже работает в коде как `state.operations` (после M-CANVAS-OPS R5-R9).

**Типы reactions** (kind):
- `pcr` — амплификация одного piece (один input piece, два праймера, один derived piece).
- `ov-pcr` — overlap-PCR двух piece (два input piece, два внешних праймера + overlap region, один derived piece).
- `restriction` — вырезание по RE-сайтам.
- `ligation` — прямое соединение piece (compatible ends).
- `gibson` — Gibson assembly N piece (N inputs, overlap regions через extension, один derived product).
- `golden-gate` — Type IIS рестрикция-лигаза (N inputs с BsaI-like сайтами).
- `kld` — KLD ligation.
- `mutagenesis` — site-directed (kld / quikchange / overlap).
- `recombinase` — Gateway / Cre/loxP (post-MVP T12).

**Shape (расширение существующего operation):**

```
operation = {
  id,
  kind,
  inputs: string[],                      // pieceId[] (раньше containerId[]) — поменяется в T2 migration
  params: { ... },                       // params без range — range мигрирует в piece
  outputs: string[],                     // pieceId[] derived products (виртуальные piece-черновики)
  position: {x, y},
  zoneId?: string,                       // T3
  status: 'planned' | 'executed' | 'failed',  // T9 materialization
  executedAt?: number,
  ...
}
```

**Как reaction появляется на канвасе.** Два пути:
1. **Auto-create из piece.acquisitionMethod** (T8). Биолог установил `piece.acquisitionMethod = 'pcr'` → автоматически создаётся ромб PCR с этим piece как input.
2. **Manual через «+ Операция»** floating button или drag from operation palette. Биолог сам ставит ромб и вручную привязывает inputs.

**Что НЕ меняется.** Уже работающие `state.operations`, `PcrModeShell` для kind='pcr' (V71-V76), `OperationNode` ромб на канвасе, `OperationPicker` для kind selection. Адаптация — переключение `op.inputs` с container-ids на piece-ids (T2 migration).

### 2.4 Уровень 4 — Product (Продукт)

**Что это.** Выход reaction. **Всегда derived** — существует пока существует производящая reaction, исчезает при удалении reaction.

**Два состояния product:**

**1. Virtual product** (пунктирный синий прямоугольник). Reaction запланирована, но не выполнена. Виртуальный output еще не материализован. Sequence computed reactive selector. Биолог видит «вот что получится если reaction сработает». Это уже работает после F4 (Live Product Preview).

**2. Materialized product** (яркий синий прямоугольник). Биолог в лаборатории получил физическую ДНК и нажал «Выполнено» на reaction. Виртуальный product становится реальным `container` в библиотеке. Может использоваться как `source` (kind='derived_product') для следующих сборок. `container.materializedFrom = {reactionId, cloneNumber?}`.

**Clone variants (T9).** При материализации reaction биолог может пикнуть несколько колоний из одной трансформации. Каждая колония — отдельный container с одинаковым reactionId но разным cloneNumber. Программно один reaction → массив `materializedClones: [{containerId, cloneNumber, status}]`. На канвасе клоны рендерятся как N синих прямоугольников от одного ромба Gibson (как на бумажной диаграмме /5 и /7).

**Биолог НЕ создаёт product вручную.** Product всегда derived. Единственное user-action — `MATERIALIZE_REACTION(reactionId, {cloneNumber?, name?})` (T9).

---

## 3. Зоны (Zone) — фреймы как в Miro

### 3.1 Что это

Зона — визуально выделенная область канваса с рамкой и подписью. Биолог режет канвас на смысловые блоки сборок. Произвольное количество зон.

**Цель зон:** фокус и декомпозиция (Q-zone-1 от 16.05, явная инициатива Игоря). Без зон один проект с шестью сборками превращается в кашу. С зонами — биолог видит «Сборка 1: U3afu/gRNA», «Сборка 2: gRNA-кассеты», «Сборка 3: финальные клоны» как явные блоки.

### 3.2 Shape (T3)

```
zone = {
  id: 'zn-' + uuidv7(),
  name: string,                          // user-given, например «Сборка 1: P43_U3afu_Hyg»
  bounds: {x, y, width, height},         // resizable
  collapsed: boolean,                    // свёрнута ли (T4)
  viewMode: 'graph' | 'sequence',        // T7
  notes?: string,                        // user comments
  createdAt: number,
  updatedAt: number,
}
```

**Поле zoneId** на узлах canvas:
- `container.zoneId?: string`
- `piece.zoneId?: string`
- `operation.zoneId?: string`
- `junction.zoneId?: string` (derived от соединяемых узлов — у которых zoneId совпадает)

`zoneId = null` — «бесхозный» узел (для backward-compat со старыми проектами, T3 soft-migration).

### 3.3 Поведение

**Резиновый размер** (Q-zone-5, D). Зона автоматически расширяется при добавлении узлов. Drag углов рамки для ручного увеличения (полезно для запланированных пустых мест). Минимум — чтобы помещалась подпись.

**Мутируемость** (Q-zone-3, D):
- Drag узла из зоны 1 в зону 2 — узел получает новый `zoneId`. Junctions между этим узлом и узлами зоны 1 — **рвутся с предупреждением** (toast + рамка вокруг разрываемых стыков).
- Drag границ зоны — resize bounds.
- Merge двух зон — выделить обе → context-menu «Объединить». Узлы обеих получают zoneId merged-зоны, узлы первой остаются, второй стираются. Имя merged — диалог.

**Миграция старых проектов** (Q-zone-4, D — мягкая). Узлы с zoneId=null продолжают работать без зоны. Новые проекты создаются с одной пустой зоной по умолчанию (`Сборка 1`). Биолог может вручную «обернуть бесхозные узлы в новую зону» через action `WRAP_LOOSE_NODES_IN_ZONE`.

**Sequence-mode per zone.** Toggle `viewMode` хранится на zone (не глобально). Биолог может смотреть зону 1 в graph, зону 2 в sequence одновременно.

### 3.4 Что зона НЕ имеет

- **Топологию.** Зона — это контейнер для узлов, не сборка. Топология (linear/circular) — свойство финального product зоны, не самой зоны.
- **Финальный продукт как явное поле.** Финал зоны вычисляется (T9): узлы без исходящих стыков = висящие концы = финалы.
- **Параметры реакций.** Параметры на reactions, не на зоне.

### 3.5 Связи зона→зона

Материализованный product зоны A может быть source-ом в зоне B. **Живая ссылка, не копия** (Q-zone-1 неявно через «два mental model в одной голове»). Container существует один в `state.containers`, обе зоны на него ссылаются через узлы.

UI: при drag container из библиотеки в зону B, если container.materializedFrom указывает на reaction в зоне A — программа показывает badge «← из Зоны A» на узле в B. Клик на badge → переключение фокуса канваса на зону A с подсветкой соответствующего product (T8).

---

## 4. Два режима отображения

### 4.1 Graph mode (по умолчанию)

То что сейчас работает в коде после V58-V81 bug-bash. Узлы всех 4 уровней + ромбы + стыки + product-блоки.

**Расширения для 4-tier (T4):**
- Зелёные piece-карточки рядом с source-прямоугольниками (раньше piece не визуализировался отдельно, он был implicit в op.params.range).
- Стрелка от source к piece (origin reference).
- Если piece имеет `derivedReactionId` — стрелка от piece к ромбу reaction.
- Material/virtual product различение (после F4, уже работает).

### 4.2 Sequence mode

Новый view. Той же зоны, но рендеринг через `editor/zone-sequence-mode/` (новая подпапка в T6, мигрируется из `editor/assembly-mode/`).

**Три состояния** в зависимости от готовности зоны (T7):

**Состояние А — пустота.** В зоне только sources без отобранных pieces. Sequence-mode показывает подсказку «Выбери диапазоны на источниках чтобы увидеть сборку». Список sources зоны как «доступные для отбора». Биолог может открыть source отсюда (двойной клик в списке) → ContainerEditorSkeleton → отобрать piece → вернуться.

**Состояние Б — палитра.** В зоне есть pieces, но они не упорядочены в сборку (нет цепочки стыков). Sequence-mode показывает их **как палитру** — каждый piece отдельной короткой лентой со своим цветом, в столбик. Drag piece из палитры в горизонтальную ленту сборки → переход в состояние В + auto-create ромб reaction в graph.

**Состояние В — собранная лента.** Pieces упорядочены в сборку (есть цепочка стыков). Sequence-mode показывает горизонтальную ленту: цветные piece-зоны подряд, стыки между ними с пометкой метода (Gibson 30bp / overlap-PCR 20bp / RE BsaI), под лентой overlay подобранных праймеров. На стыках без праймеров — placeholder «клик для подбора» → открывает PcrModeShell V71-V76 (уже работающий механизм).

### 4.3 Bidirectional sync graph ↔ sequence

Это **активный sequence-mode** (Q-zone-1, D). Не пассивный рендер графа.

- Drag piece в ленту sequence-mode (состояние Б → В) → программа auto-создаёт ромбы reactions в graph-mode (если `piece.acquisitionMethod ≠ 'undefined'`).
- Удаление piece из ленты sequence-mode → удаление piece из зоны + удаление derived reaction в graph.
- Изменение порядка piece в ленте → изменение порядка inputs в Gibson reaction (порядок имеет значение).
- Клик на стык в sequence-mode → открывает PcrModeShell для подбора праймеров (та же дверь что двойной клик на ромб PCR в graph).

### 4.4 Toggle между режимами

**Хоткей `G` / `S`** (Q-extra-4, D). Один символ. Tab уже занят в системе F1 для табов editor.
**Click toggle** в углу зоны — также переключает.
**Per zone**, не глобально. `zone.viewMode` хранится отдельно.

### 4.5 Ветвление при N финалах

(Q-zone-2, корректировка от Игоря 16.05 — **ветвление**, не табы.)

Если зона имеет N финальных products (висящих концов graph) — sequence-mode показывает ленту с ветвлением:

```
[piece1] — [piece2] — [piece3] ┬─[piece4a] (финал /1)
                                ├─[piece4b] (финал /2)
                                ├─[piece4c] (финал /3)
                                └─[piece4d] (финал /4)
```

Это применимо к design variants (4 разных reaction-узла с varying input — на бумажной диаграмме Gibson_3 даёт 4 разных конструкта). При clone variants (1 reaction, N материализованных колоний) ветвление **не показывается** — clone это meta на продукте, не отдельный финал (см. §6.4).

---

## 5. Четыре способа задать piece

(Q-piece-1 ответ Игоря, §2 NOTES.)

Биолог переходит с уровня 1 на уровень 2 одним из четырёх способов. Все 4 — в T5.

### 5.1 Способ А — Выделение диапазона

1. Биолог двойным кликом на синий source-прямоугольник в зоне → открывается ContainerEditorSkeleton (уже работает).
2. В SequenceView выделяет регион мышкой.
3. Context-menu правой кнопки (через `extraItems` в SelectionContextMenu — уже есть hook, переиспользуем) → «Отметить как кусок» либо хоткей **P** (piece).
4. Открывается модалка `PieceCreateModal` (новая, T5):
   - Поле «Имя» (default: `{containerName}({start}-{end})`).
   - Поле «Функциональная метка» (опционально).
   - Кнопки «Создать» / «Отмена».
5. После создания — piece добавляется в state с `origin='selection'`, `acquisitionMethod='undefined'`. На канвасе в зоне source-а под ним появляется зелёная piece-карточка со стрелкой.

### 5.2 Способ Б — Клик по фиче

1. Тот же открытый ContainerEditorSkeleton.
2. В SequenceView/AnnotationTrack — клик на feature (CDS / promoter / terminator / marker).
3. Через `SelectionContextMenu` (правый клик на feature, уже работает для других operations) — пункт «Отметить как кусок по этой фиче».
4. Открывается `PieceCreateModal` с **pre-filled именем** = `feature.name` и **pre-filled диапазоном** = feature range. Биолог может скорректировать.
5. После создания — piece с `origin='feature'`, имя из feature, range из feature.

### 5.3 Способ В — Существующие праймеры из библиотеки

1. Тот же ContainerEditorSkeleton ИЛИ panel в зоне.
2. Открывает «Подобрать piece по существующим праймерам» — модалка `PiecePrimersPickModal` (новая, T5).
3. В модалке — список primer entries из текущего проекта (фильтр Library/inspector/primers). Биолог выбирает forward + reverse.
4. Программа на лету ищет binding каждого праймера в target source. Если binding найден — вычисляет ампликон (диапазон от forward 5' до reverse 5'). Показывает preview.
5. Биолог называет piece, нажимает «Создать».
6. piece создаётся с `origin='existing-primers'`, `acquisitionMethod='pcr'` (автоматически — раз праймеры выбраны, метод определён), `acquisitionParams.primerPairId = {fwd, rev}`. **Автоматически создаётся ромб PCR в graph** (T8).

### 5.4 Способ Г — Новые праймеры на источнике

1. ContainerEditorSkeleton → выделение → context-menu → «Написать праймер вперёд» (Ctrl+R) / «Написать праймер назад» (Ctrl+Alt+R) — **уже работает через V72-V74**.
2. После того как биолог написал forward + reverse — открывается `PieceCreateModal` (расширенный, T5) с pre-filled именем + диапазоном (между 5'-концами праймеров).
3. piece с `origin='new-primers'`, `acquisitionMethod='pcr'`, `acquisitionParams.primerPairId = {fwd, rev}` (новые entries в library/primers, тоже создаются автоматически).

---

## 6. Принятые решения (DEC-CANVAS-4T-NN)

Все решения этой архитектуры. Каждое получает уникальный ID для трассировки в T1-T10 и для возможного promotion в ⚓ (ANCHORS.md) после реализации.

### DEC-CANVAS-4T-01 — 4 уровня данных
Source → Piece → Reaction → Product. Точно 4 класса. Piece — новая сущность, не существующая в коде. Source/Reaction/Product — уже есть, расширяются. **Status:** Sprint-level, кандидат на ⚓ после T1+T2 acceptance.

### DEC-CANVAS-4T-02 — Один класс container с kind
Не отдельные классы plasmid/oligo/gblock. Один `container` с флагом `kind: 'plasmid'|'oligo'|'gblock'|'derived_product'`. Различие визуальное и поведенческое в piece-selection. **Status:** Sprint-level.

### DEC-CANVAS-4T-03 — Piece может быть derived от reaction
Не только selection от source. `gRNA(275-279)` = OV_PCR-derived piece с двумя input source-ами (275 и 279). Pieces образуют граф piece↔piece (через reactions), не только source→piece звезду. **Status:** Sprint-level.

### DEC-CANVAS-4T-04 — Piece как глобальная сущность, не привязан к зоне
Один piece, N ссылок из разных zone-узлов. Rename везде разом. Клонирование — explicit action. (Q-piece-1, D.) **Status:** Sprint-level.

### DEC-CANVAS-4T-05 — acquisitionMethod как drive для auto-reactions
piece.acquisitionMethod определяет автоматическое создание reaction. `'undefined'` → ничего. `'pcr'` → ромб PCR. Биолог явно ставит — не вычисляется. (Q-piece-2, D.) **Status:** Sprint-level.

### DEC-CANVAS-4T-06 — Цвет piece auto HSL hash от piece.id
Детерминированный hash. Не от name (меняется при rename). Override через `UPDATE_PIECE_COLOR`. На >12 piece — collision detection с shift по hue. (Q-piece-3, D.) **Status:** Sprint-level.

### DEC-CANVAS-4T-07 — Zones формальные, как Miro frames
Не free-form canvas + soft grouping. Формальные фреймы с рамкой, подписью, mutable bounds. (Q-new-1 пересмотрено 16.05 — Игорь явно указал что zones это его инициатива.) **Status:** Sprint-level, кандидат на ⚓.

### DEC-CANVAS-4T-08 — Zone.viewMode per-zone
Не глобально. Каждая зона хранит свой `viewMode: 'graph' | 'sequence'`. **Status:** Sprint-level.

### DEC-CANVAS-4T-09 — Активный sequence-mode, bidirectional sync
Не пассивный рендер графа. Drag piece в ленту → auto-create reaction в graph. Удаление piece → удаление reaction. (Q-zone-1, D.) **Status:** Sprint-level.

### DEC-CANVAS-4T-10 — Sequence-mode имеет 3 состояния
Пустота / палитра / собранная лента. Не один универсальный рендер. Состояние derived от того что в зоне есть. **Status:** Sprint-level.

### DEC-CANVAS-4T-11 — N финалов = ветвление, не табы
Sequence-mode показывает ленту с ветвлением (древо) при N висящих концах graph. Применимо к design variants. (Q-zone-2, корректировка Игоря 16.05.) **Status:** Sprint-level.

### DEC-CANVAS-4T-12 — Zones мутируемы (drag/resize/merge)
Drag узла между зонами рвёт стыки с предупреждением. Resize bounds через drag углов. Merge через context-menu. (Q-zone-3, D.) **Status:** Sprint-level.

### DEC-CANVAS-4T-13 — Миграция мягкая, zoneId=null допустим
Старые проекты работают без зон. Новые получают одну пустую по умолчанию. Wrap loose nodes — explicit action. (Q-zone-4, D.) **Status:** Sprint-level.

### DEC-CANVAS-4T-14 — Резиновый размер зоны
Автоматическое расширение при добавлении узлов. Drag углов — ручное расширение. Min-size под подпись. (Q-zone-5, D.) **Status:** Sprint-level.

### DEC-CANVAS-4T-15 — Хоткей G/S для toggle режимов
Не Tab (занят табами F1). Не Space (зарезервирован под pan). `G` / `S` — литеры. (Q-extra-4, D.) **Status:** Sprint-level.

### DEC-CANVAS-4T-16 — Auto-numbering reactions per-zone
В каждой зоне `PCR 1, PCR 2, PCR 3` локально. Не глобально. Rename вручную доступен. (Q-extra-3, D.) **Status:** Sprint-level.

### DEC-CANVAS-4T-17 — Design vs clone variants — разные сущности
Design variant = N reaction-узлов с одинаковой структурой и varying input (P43_U3afu_Hyg/1 с guide 1, /2 с guide 2). Clone variant = 1 reaction, N материализованных колоний с meta «colony №» (P50/5, /7). (Q-new-4, D.) **Status:** Sprint-level, кандидат на ⚓.

### DEC-CANVAS-4T-18 — Sanger таблица MVP
Lab notebook artifact. Часть T10. Не post-MVP. (Q-new-6, корректировка дефолта 16.05.) **Status:** Sprint-level.

### DEC-CANVAS-4T-19 — Construct table post-MVP
Derived view + custom поля + фильтры. T11 (вне первого релиза). (Q-extra-2, D.) **Status:** Sprint-level.

### DEC-CANVAS-4T-20 — Matrix expansion post-MVP
4 параллельные Gibson — биолог дублирует узел вручную в MVP. Параметризация — T12 (вне первого релиза). (Q-new-5, D.) **Status:** Sprint-level.

### DEC-CANVAS-4T-21 — Naming: piece (UI: «Кусок»)
Не segment, не selection, не fragment. Legacy Fragment/PartBlock будет удалён по плану §17 R5 COMPONENT_MAP. (Q подтверждения terminology 16.05.) **Status:** Sprint-level.

### DEC-CANVAS-4T-22 — Frozen-on-use семантика sequence (наследует ⚓ DEC-MUTABILITY-FREEZE-ON-USE-01)
Source.sequence изменяется → derived piece.sequence обновляется реактивно. Но если piece использован в выполненной reaction (`reaction.status='executed'`) — sequence freeze, дальше не реагирует на изменения source. Это сохраняет историю реально выполненного эксперимента. **Status:** Sprint-level, ⚓-наследник.

### DEC-CANVAS-4T-23 — F1-F4 архивируются как реализованная инфра
F1 tabs, F2 junction shape, F3 PcrModeShell V71-V76, F4 Live Product — реализованы в коде. Спеки переезжают в `docs/archive/2026-05-16-pre-four-tier/`. Их **код переиспользуется** в T1-T10 как мостовая инфраструктура. (Игорь 16.05.) **Status:** Sprint-level.

### DEC-CANVAS-4T-24 — Wizard сборки переиспользуется для kind=oligo/gblock
Не отдельный flow. Биолог 16.05: «у нас сейчас есть визард сборки, главное что мы можем просто добавить недостающий tag как в том что сейчас реализовано». AddModal / PreImportModal / MultiImportView расширяются полем `container.kind` (R-DRIFT с R4 fix). **Status:** Sprint-level, зависит от R4.

### DEC-CANVAS-4T-25 — Праймеры — отдельный класс И визуальный overlay
Не выбор «или». Primer entries в библиотеке (id, sequence, Tm, source) + overlay на piece-ленте в sequence-mode на стыках. Использует существующий V71-V76 mechanism. (Игорь 16.05.) **Status:** Sprint-level.

### DEC-CANVAS-4T-26 — Assembly-mode инфра мигрирует на pieces shape (не переписывается)
`editor/assembly-mode/` существует с полным функционалом (segments-shape). T6 мигрирует shape: segments → pieces. 80% helpers (palette, annotation-transfer, primer-utils, invariants, realise) переиспользуются. **Status:** Sprint-level.

### DEC-CANVAS-4T-27 — Один state slice на сущность
`state.pieces`, `state.zones`, `state.containers`, `state.operations`, `state.junctions`. Не объединять piece+zone в один slice. Существующая декомпозиция zustand slices сохраняется. **Status:** Sprint-level.

### DEC-CANVAS-4T-28 — Skeleton-state декомпозируется в T1 первым пунктом
`skeleton-state.js` 22.77 KB (watch zone). Перед добавлением pieces+zones — split на `skeleton-state-containers.js`, `skeleton-state-operations.js`, `skeleton-state-canvas.js` (часть уже сделано R12), новый `skeleton-state-pieces.js`, `skeleton-state-zones.js`. Каждый ≤15 KB. **Status:** Sprint-level.

### DEC-CANVAS-4T-29 — Backward-compat миграция через schema bump
Schema version bump (текущая v3 после R12). T2 migration `op.params.range` → отдельные pieces. T3 migration `node.zoneId = null` для старых узлов. T6 migration `assembly-mode/segments` → `zone-sequence-mode/pieces`. Старые `.bodge` файлы открываются с auto-migration на open. **Status:** Sprint-level.

### DEC-CANVAS-4T-30 — Junction между pieces, не containers
В 4-tier junction соединяет два piece (не два container как в v0.6 prototype). Container напрямую не имеет junctions — он source для pieces, которые соединяются. F2 junction shape (kind / method / params) сохраняется, только меняется тип связываемых узлов. **Status:** Sprint-level.

---

## 7. Миграция со старой модели

### 7.1 Schema versions

Текущая schema version `v3` (после R12, bump в M-CANVAS-SKELETON sprint). 4-tier предполагает три incremental bumps:

- **v4 — T1+T2.** Добавлен `state.pieces`. Существующие `op.params.range` мигрируются в отдельные piece-сущности. `op.inputs` меняет семантику с container-ids на piece-ids.
- **v5 — T3.** Добавлен `state.zones`. Поле `zoneId?: string | null` на containers/pieces/operations.
- **v6 — T6.** Migration `state.assemblies` (если есть legacy от A1-A4 — на 16.05 не реализованы, slice пуст) на `state.zones[].pieces`. Если slice пуст — миграция трivial (no-op).

### 7.2 Migration hook

`lib/skeleton-persistence.js::loadSnapshot(projectId)` уже имеет migration chain (v0→v1→v2→v3). T1-T6 добавляют v3→v4→v5→v6.

```
// псевдокод migration chain
function migrate(snapshot) {
  let s = snapshot;
  if (s.schemaVersion < 4) s = migrateV3toV4(s);  // T2
  if (s.schemaVersion < 5) s = migrateV4toV5(s);  // T3
  if (s.schemaVersion < 6) s = migrateV5toV6(s);  // T6
  return s;
}
```

Each migration — pure function, deterministic, idempotent. Не теряет данные. Если миграция не может быть выполнена (corrupted data) — falls back к свежему пустому state с warning toast «не удалось мигрировать, начинаем с чистого листа».

### 7.3 Backward-compat .bodge файлов

`.bodge` файл (zip с canvas-state + library entries) хранит `schemaVersion`. При import — migration chain выполняется автоматически. Файлы pre-v3 — Wipe data (DEC-V2-08 ⚓), не мигрируем.

### 7.4 Что НЕ мигрируется автоматически

- **Бесхозные узлы** (zoneId=null) — остаются в проекте без зоны. Биолог явно использует `WRAP_LOOSE_NODES_IN_ZONE` action для wrapping.
- **op.params.range без явного piece-name** — генерируется auto-name `{containerName}({start}-{end})` при migration. Биолог может renamed.
- **Old assembly-mode segments** (если попадётся в legacy) — миграция как pieces с origin='legacy-assembly-segment'. На 16.05 этого не должно быть в продакшен-state (assembly-mode только в skeleton-mode).

---

## 8. Скоуп нарезки T1-T10

### 8.1 Dependency graph

```
T1 (pieces state + decomp) ──┐
                              ├── T2 (op.params.range → pieces migration)
                              │
T3 (zones data + frames) ─────┼── T4 (zones rendering)
                              │
T5 (4 ways to author piece) ──┤
                              │
T6 (sequence-mode migrate from assembly-mode) ──┐
                                                 ├── T7 (dual-mode toggle + sync)
                                                 │
T8 (auto-reactions from acquisitionMethod) ──────┘
                                                  │
T9 (branching finals + clone variants) ───────────┤
                                                   │
T10 (Sanger lab notebook) ─────────────────────────┘
```

Линейные dependencies — T1 перед T2 (state shape), T3 перед T4 (data перед rendering). T5/T6 параллельны после T2. T7 нужны T4+T6. T8 нужен T2+T5. T9 нужен T2+T4. T10 нужен T9.

### 8.2 Краткий scope каждого T

| Sprint | Размер | Что | Зависимости |
|--------|--------|-----|-------------|
| T1 | ~40 KB | Декомпозиция skeleton-state.js + `state.pieces` slice + selectors + helpers + unit-tests. Без UI. | — |
| T2 | ~35 KB | Миграция `op.params.range` → отдельные pieces. v3→v4 migration. Backward-compat. `op.inputs` semantics shift. | T1 |
| T3 | ~45 KB | `state.zones` slice + `zoneId` на узлах + soft-migration + helpers + unit-tests. | T1 |
| T4 | ~50 KB | Рендеринг zone-фреймов в CanvasLayoutView/CanvasGraphView + resize/drag/merge + nodeBelongsToZone helpers. | T3 |
| T5 | ~55 KB | 4 способа задать piece (UI). PieceCreateModal + PiecePrimersPickModal + context-menu extensions в SequenceView + хоткей P. | T1 |
| T6 | ~50 KB | Миграция `editor/assembly-mode/` shape segments → pieces. Переименование папки в `editor/zone-sequence-mode/`. Reuse 80% helpers. | T1, T2 |
| T7 | ~55 KB | Toggle G/S в углу зоны + bidirectional graph↔sequence sync + 3 состояния sequence (пусто/палитра/собрана) + drag-piece-to-strip. | T4, T6 |
| T8 | ~45 KB | Auto-create reactions из piece.acquisitionMethod + связи зона→zone через materializedFrom + badge «← из Зоны N». | T2, T5 |
| T9 | ~40 KB | Ветвление ленты при N финалах + clone variants как `materializedClones: []` array на product. MATERIALIZE_REACTION action. | T2, T4 |
| T10 | ~35 KB | Sanger-список (MVP lab notebook). Правая панель / per-zone. Pending → verified/failed. | T9 |

Сумма ~450 KB + 50 KB якоря = ~500 KB. 3-4 месяца Code-работы. Между T — Code-session + visual acceptance gate.

**⚠️ Playbook compliance.** Все T1-T10 размером 35-55 KB превышают type A лимит CHAT_PLAYBOOK §13 (20-30 KB). Это нарушает §2 «Если вышло больше — задача переоценивается на тип выше или режется на два спринта». Тип выше A в playbook не определён.

**Развилка требует решения Игоря до handoff Code на T1:**
- **Вариант 1.** Ввести в CHAT_PLAYBOOK новый тип A+ «архитектурный sprint» с лимитом 40-55 KB и явным обоснованием (большая зависимость от уже работающей инфры, миграции shape данных, недопустимо резать).
- **Вариант 2.** Порезать каждый T на 2 sub-спринта (T1.1 декомпозиция + T1.2 pieces shape; T3.1 zones shape + T3.2 zoneId на узлах + миграция; T4.1 zone frames render + T4.2 resize/drag/merge; T5.1 PieceCreateModal + способы А/Б + T5.2 PiecePrimersPickModal + способы В/Г; T6.1 adapter pattern + tests + T6.2 переименование папки и shape migration; T7.1 toggle G/S + 3 состояния + T7.2 bidirectional sync; T8.1 auto-create reactions + T8.2 связи зона→зона; T9.1 ветвление + T9.2 clone variants; T10 single). Итого ~18 sub-sprints вместо 10. Acceptance overhead растёт, но playbook compliance восстанавливается. Группировка acceptance из R10 митигации работает.

До решения этой развилки — sprint-спеки T1-T10 не пишутся.

### 8.3 Что НЕ в первом релизе (post-MVP)

- **T11** — Construct table (derived view + custom поля + фильтры).
- **T12** — Matrix expansion (4 параллельные Gibson через параметризацию).
- **T13** — Mutagenesis ops как отдельный workflow (сейчас MutagenesisWizard есть, интеграция в 4-tier — отдельно).
- **T14** — Recombinase ops (Gateway / Cre-loxP) с топологическим circular merge.
- **T15** — Multi-project DAG (cross-project references через `.bodge` linking).

Эти T не пишутся как спеки сейчас. Roadmap фиксируется в `docs/ROADMAP_CANVAS_V2_TO_PRODUCTION.md` после T10.

---

## 9. Риски и митигации

### R1 — Skeleton-state файлы взрываются при добавлении pieces+zones
**Risk:** `skeleton-state-canvas.js` = **25.78 KB** (превышает hard 25 KB лимит для .js файлов, активный TD-SKELETON-STATE-SIZE). `skeleton-state.js` = 18.59 KB (router, под soft 20). При добавлении state.pieces (T1) + state.zones (T3) — `skeleton-state-canvas.js` уже выше hard, ещё одно расширение критически нарушит размерный budget.
**Mitigation:** **T1 первым пунктом — декомпозиция** (DEC-CANVAS-4T-28). Split `skeleton-state-canvas.js` на тематические sub-slices до добавления нового. Целевые модули после декомпозиции: `skeleton-state-canvas-layout.js` (positions, zones), `skeleton-state-canvas-junctions.js` (stitches), `skeleton-state-canvas-cut.js` (уже существует, 5.73 KB), `skeleton-state-pieces.js` (новый, T1), `skeleton-state-zones.js` (новый, T3). Каждый ≤15 KB. Code должен start с этого пункта, перед любым добавлением state.pieces.

### R2 — assembly-mode/ существует и работает, миграция может сломать live-функционал
**Risk:** `editor/assembly-mode/` — 100+ KB зрелого кода (AssemblyHeader, AssemblySidebar, SegmentList, AssemblyToolbar, AssemblySourcePicker, InsertGapModal, AssemblyPrimersPanel, RealiseModal + libs). Миграция shape segments → pieces (T6) может оставить regression.
**Mitigation:** T6 — поэтапная миграция через shape adapter. Adapter `segmentToPiece(segment): piece` + `pieceToSegment(piece): segment` (для обратной совместимости в transition window). Unit-tests на adapter сначала. UI компоненты переименовываются (`AssemblyHeader` → `ZoneSequenceHeader`) после прохождения adapter-тестов. Перед T6 — full snapshot текущего behavior assembly-mode в integration tests (R-DRIFT гарантия).

### R3 — Drag-and-drop в sequence-mode конфликтует с drag-from-tree в LibraryTreeHost
**Risk:** В коде `use-tree-drop-target.js` listens на MIME `application/x-bodge-entry-id`. T7 добавляет drag piece из палитры в ленту сборки — другой MIME (`application/x-bodge-piece-id`). Если MIME путаются — drag из tree случайно интерпретируется как drag piece.
**Mitigation:** Строго разные MIME-types. T7 явно проверяет `event.dataTransfer.types` перед обработкой. Integration-test на оба MIME сразу.

### R4 — Backward-compat миграция v3→v6 теряет данные при сбое
**Risk:** Migration chain v3→v4→v5→v6 — 3 incremental migrations. Если одна шагает с ошибкой — snapshot corrupt.
**Mitigation:** Каждая migration — pure idempotent function. Сохранение pre-migration snapshot в `localStorage` под ключом `bodge-skeleton/state/canvas-state-v1::<projectId>::backup-pre-vN` перед каждым шагом. Если шаг fails — restore из backup. Warning toast биологу. Pre-migration backup живёт 30 дней (rolling cleanup).

### R5 — Auto-create reactions из piece.acquisitionMethod (T8) ломает existing operations
**Risk:** Существующие operations имеют `op.inputs = [containerId]`. После T2 — `op.inputs = [pieceId]`. После T8 — auto-create ромбов из piece. Если миграция T2 не идеальна — auto-create может создать дубли ромбов на legacy ops.
**Mitigation:** T8 проверяет `piece.derivedReactionId` перед auto-create. Если piece уже имеет связанный reaction — не создаёт дубль. Migration T2 устанавливает `derivedReactionId` на pre-existing pcr ops. Unit-test на «migration + auto-create idempotent».

### R6 — N финалов с ветвлением (T9) сложен для рендеринга в sequence-mode
**Risk:** Sequence-mode рендерит горизонтальную ленту. Ветвление при N=4 (на бумажной диаграмме Gibson_3) — это древо с 4 ветвями справа. Сложный layout, может не помещаться на экран.
**Mitigation:** Ветвление рендерится как expand/collapse: при N≥3 — по умолчанию показывается «общая часть» + dropdown «варианты (4)». Биолог выбирает один вариант или «все» — тогда ленты складываются вертикально. UX-проверка на приёмке T9 с биологом.

### R7 — Skeleton-state-zones.js может также превысить hard limit
**Risk:** Zone shape + bounds + viewMode + N узлов в зоне → reducer актив move/resize/merge → ~15-20 KB после T3+T4 уже близко к soft 20 KB.
**Mitigation:** При планировании T3 предусмотреть split на `skeleton-state-zones.js` (CRUD) + `skeleton-state-zone-bounds.js` (resize/drag helpers). Hard split if >20 KB. Watch list.

### R8 — F1 tab system не покрывает sequence-mode editor tab
**Risk:** F1 tabs реализован для `tab.kind: 'container' | 'operation' | 'assembly'`. Sequence-mode в T7 — это per-zone view, не editor tab. Если sequence-mode попытается стать editor tab — конфликт с zone.viewMode.
**Mitigation:** Sequence-mode НЕ editor tab. Это часть рендеринга zone-frame внутри `CanvasLayoutView` / `CanvasGraphView` (toggle меняет содержимое фрейма). PcrModeShell для подбора праймеров на стыке — открывается как editor tab (kind='operation'), как сейчас. Чёткое разделение.

### R9 — Игорь увидит модель и захочет переделать
**Risk:** За 15.05 — 4 переинтерпретации. Игорь может найти 5-ю при чтении этой спеки.
**Mitigation:** Якорь как **отдельный документ** (этот файл), не интегрирован в спринты. Если 5-я переинтерпретация — правится только этот файл, T1-T10 пересматриваются точечно (большая часть переиспользуется). Обновление якоря — версия v1.1, дельта-diff в начале файла.

### R10 — Visual acceptance gate между T удлиняет сроки
**Risk:** 10 спринтов × (Code + acceptance в отдельной сессии + compact) = ~30 chat-сессий минимум.
**Mitigation:** Группировка acceptance — T1+T2 одной сессией (data layer), T3+T4 одной сессией (zones), T5+T7 одной сессией (UI piece-creation + dual-mode sync). T6 / T8 / T9 / T10 — отдельные acceptance sessions. ~7 acceptance sessions вместо 10.

---

## 10. Glossary

| Термин | Определение |
|--------|-------------|
| **Source / Контейнер** | Уровень 1. Существующая физическая ДНК в библиотеке. Synonym: container, source. UI: «Источник» / «Контейнер». |
| **Piece / Кусок** | Уровень 2. Именованный логический отбор. Новая сущность в state. UI: «Кусок». |
| **Reaction / Реакция** | Уровень 3. Ромб на канвасе. Существующий `operation`. UI: «Реакция» / «Операция». |
| **Product / Продукт** | Уровень 4. Выход reaction. Virtual (пунктирный) → Materialized (синий). UI: «Продукт». |
| **Source-piece** | Piece с одним sourceId (selection от одного source). |
| **Derived-piece** | Piece с N sourceIds (выход OV_PCR / других multi-input reactions, представленный как piece а не product). |
| **Virtual product** | Product до материализации. Derived sequence через selector. Пунктирный визуал. |
| **Materialized product** | Product после `MATERIALIZE_REACTION`. Container kind='derived_product'. Сплошной синий. Может быть source для других reactions. |
| **Clone variant** | Один реакция, N материализованных колоний с meta `cloneNumber`. Не отдельные финалы. |
| **Design variant** | N reaction-узлов с одинаковой структурой и varying inputs. Отдельные финалы зоны. |
| **Zone / Зона** | Фрейм на канвасе. Резиновый, mutable, has viewMode. UI: «Зона сборки» или «Сборка N». |
| **Loose node** | Узел с zoneId=null. Backward-compat для старых проектов. |
| **Graph mode** | Рендер зоны как узлы+ромбы+стыки. Default. |
| **Sequence mode** | Рендер зоны как линейная/кольцевая лента с piece-зонами. Per-zone toggle. |
| **Palette state** | Sequence-mode когда pieces есть но не упорядочены. Столбик коротких piece-лент. |
| **Assembled state** | Sequence-mode когда pieces упорядочены в сборку. Горизонтальная лента с цветными зонами. |
| **acquisitionMethod** | Свойство piece. Как биолог собирается получить piece физически. Drives auto-creation reactions (T8). |
| **derivedReactionId** | Обратная ссылка piece→reaction. Если piece имеет acquisitionMethod='pcr' — указывает на ромб PCR. |
| **materializedFrom** | Поле на container.kind='derived_product'. Указывает на reaction которая его произвела + cloneNumber. |
| **Stitch / Стык** | Junction между piece-piece. Имеет метод (Gibson / overlap / RE / GG / KLD / ligation / blunt / sticky / preformed). |
| **Frozen-on-use** | ⚓ DEC-MUTABILITY-FREEZE-ON-USE-01. Piece sequence freeze после `reaction.status='executed'`. |

---

## 11. Подтверждения Игоря (16.05.2026)

Сводка ответов на 8 + 4 + 6 вопросов из предыдущих сессий. Полный transcript в чате 16.05.2026.

| Вопрос | Ответ |
|--------|-------|
| Q-piece-1 | D — одна сущность, N ссылок. |
| Q-piece-2 | D — биолог явно ставит acquisitionMethod. |
| Q-piece-3 | D — auto HSL hash от piece.id. |
| Q-zone-1 | D — активный sequence-mode. |
| Q-zone-2 | **Ветвление**, не табы (корректировка дефолта). |
| Q-zone-3 | D — мутируемые. |
| Q-zone-4 | D — мягкая миграция. |
| Q-zone-5 | D — резиновый размер. |
| Q-extra-1 → Q-new-6 | **Sanger MVP** (корректировка дефолта post-MVP). |
| Q-extra-2 | D — construct table post-MVP. |
| Q-extra-3 | D — auto-numbering per-zone. |
| Q-extra-4 | D — хоткей G/S. |
| Q-new-1 | **Zones формальные** (как Miro frames, инициатива Игоря). |
| Q-new-2 | **Один класс container с kind**. Wizard сборки переиспользуется. Praimer = отдельный класс И визуальный overlay. |
| Q-new-3 | piece-derived от reaction — да (вариант Y). |
| Q-new-4 | (не подтверждено явно) — разные сущности, как мой D. Если возражения — пересмотр в T9. |
| Q-new-5 | D — matrix expansion post-MVP. |
| F1-F4 status | **Архивируются как реализованные**. Код переиспользуется как мостовая инфра. |
| Terminology | **piece** (UI «Кусок»). |

---

## 12. Что делает следующая Chat-сессия

После одобрения этого якоря Игорем — последовательно пишутся спеки T1, T2, ..., T10. Каждая → write_file сразу → отчёт Игорю → следующая.

После всех 10 спек:
1. Архивация F1-F4 + A1-A4+D1 + G1+G2+PROTOTYPE-PCR в `docs/archive/2026-05-16-pre-four-tier/` с README объяснением.
2. Обновление `CURRENT_TASK.md` — roadmap T1-T10.
3. Обновление `COMPONENT_MAP.md` — добавление будущих компонентов 4-tier (Zone, PieceCreateModal, PiecePrimersPickModal, ZoneSequenceMode/, и т.д.).
4. Handoff Code на T1 (первая Code-сессия).

**Что НЕ делает Chat:**
- Не пишет implementation code (только сигнатуры helper'ов в спеках, ≤10 строк каждая).
- Не правит src/ напрямую (T1-T10 все типа A, Code territory).
- Не финализирует версионные блоки RELEASES.md / PROJECT_STATE.md — это после каждого T acceptance.
- Не переинтерпретирует workflow без визуального подтверждения от Игоря.

---

**Дата:** 16.05.2026.
**Источник модели:** разговор 15.05 (4 переинтерпретации) + бумажная диаграмма биолога (CRISPR T.reesei) + явные ответы 16.05.
**Версия:** v1.0. Дельта-diff в начале файла при v1.1+.
**Якорь для:** T1-T10 спринтов 4-tier архитектуры.
**Замена для:** F1-F4 (архивируется как реализованная инфра), A1-A4+D1 (архивируется как итерация), NOTES_FOUR_TIER_MODEL_DRAFT (черновик, заменён этой консолидированной спекой).
