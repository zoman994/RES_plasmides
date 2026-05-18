# SPRINT M-CANVAS-ASSEMBLY-MODEL — Assembly Draft Data Model (A1)

**Дата спеки:** 15.05.2026 (после walkthrough'а assembly-workflow в чат-сессии rework V71+).
**Тип:** A (новая первичная сущность data model).
**Target размер спеки:** ~28 KB.
**Источник:** chat-сессия Игоря 15.05 после V76 — реверс-инжиниринг ментальной модели биолога. Workflow: «беру плазмиду, копирую кусок, вставляю; беру следующий, копирую и вставляю; так последовательность за последовательностью леплю конструкцию; потом соединяю overlap'ами до разумного числа кусков и дальше Gibson/рекомбиназа». Этот workflow **отсутствует** в F1-F4 спеках — F3 PcrModeShell закрывает только isolated-PCR (use case «праймеры для секвенирования / check-PCR»).
**Цепочка:** A1 (этот sprint, data model) → A2 Construct UX → A3 Primer Design → A4 Realise as DAG. Каждая с acceptance gate.
**Статус:** черновик Chat 15.05.2026, требует OK Игоря по §9 Открытым вопросам.
**Зависимости:** F1 (tab system) + F2 (junction contract сохраняется как метод сшивки, не как UI-шаг) + базовый skeleton state (containers, operations).

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Сейчас | Статус | Действие в A1 |
|---|---|---|---|
| `store/skeleton-state.js` | ~17 KB | OK | +2-3 KB (router → assemblies sub-reducer) |
| `store/skeleton-context.jsx` | ~11 KB | OK | +1 KB (новые actions для assemblies) |
| `store/skeleton-persistence.js` | ~7 KB | OK | +1 KB (schema bump + migration) |
| `lib/skeleton-state-shape.js` (если есть) или новый | — | — | новый файл документации shape |

Новые файлы:
- `store/skeleton-state-assemblies.js` ~10-12 KB (sub-reducer для assemblies slice).
- `lib/assembly-model.js` ~6-8 KB (helpers: createDraft, addSegment, removeSegment, normalizeOffsets, segmentToSpan, computeAssemblySequence).
- `lib/assembly-invariants.js` ~3-4 KB (валидация: монотонность offsets, согласованность source с container.sequence, не-наложение сегментов, max length guard).

Все под soft limit.

**Декомпозиция existing файлов** — не требуется. A1 в основном добавляет новый slice.

---

## 1. Контекст и связи перед действием (§17 R4)

### Откуда

Walkthrough §9.3 NOTES_CANVAS_V2_KICKOFF описал PCR workflow как «двойной клик на op-ромб → editor в PCR-mode». Это построено вокруг **DAG-first** ментальной модели: биолог сначала строит граф reactions, потом execute создаёт products. F3 спека реализовала этот flow.

15.05.2026 Игорь явно описал свой реальный workflow в SnapGene: **assembly-sequence-first**. Биолог копипастит куски ДНК в один документ, получает финальную (или intermediate) ассемблирующую последовательность с цветовыми зонами источников, на её **границах** подбирает primers. DAG операций — derived, артефакт для протокола.

Это **другая первичная сущность**, отсутствующая в текущем skeleton state.

### Где задача сядет

- **`state.assemblies`** (новое top-level поле) — массив Assembly Draft объектов. Каждый — независимая черновая последовательность с привязкой к source containers.
- **`state.containers`** — без изменений. Containers остаются source истории (плазмиды, фрагменты, ампликоны), assemblies их потребляют **по ссылке + range**.
- **`state.operations`** — без изменений в A1. Связь Assembly ↔ Operations появляется в A4 (Realise as DAG): operations будут derived из assembly при «Realise».
- **`state.junctions`** — без изменений в A1. Junctions сохраняются как объекты сшивки **между containers** (F2 contract). Assembly Draft внутри себя не имеет junction objects — у неё есть **boundaries between segments**, которые в A4 при «Realise» материализуются как junction objects.

### Что НЕ задеваем

- F1 tabs — Assembly Draft не открывается в F1 tab (это A2 решает свой viewer-mode).
- F2 junction popover, validation, reactive selectors — без изменений.
- F3 PcrModeShell — без изменений. Сосуществует параллельно для isolated-PCR use case.
- F4 Live Product Preview — без изменений.
- R5-R9 bio helpers (`lib/bio/*`) — будут потреблены в A3 для primer design на assembly, в A1 не задеваются.
- Library — без изменений. Assembly Draft хранится в skeleton state per-project, не в Library пуле.

### Дубли check (§17 R1)

- **Assembly Draft — действительно новая сущность.** Containers ≠ Assembly: container = legit ДНК объект (плазмида / фрагмент / oligo), assembly = виртуальный draft конструкции до её материализации. Container иммутабелен по композиции (если frozen) или редактируется как **последовательность**, не как **композиция из частей**. Assembly явно хранит **композицию**: какие segments из каких containers с какими ranges.
- **Operations vs Assembly:** operation = действие (PCR / Gibson / Cut), assembly = желаемый продукт. Это разные уровни. Operation описывает «как сделать», assembly — «что должно получиться».
- Изобретать поверх existing containers через extra fields (типа `container.compositionDraft`) — антипаттерн, потому что container biology-wise = atomic ДНК, а assembly mid-construction может содержать impossible-bio-states (e.g. 3 контейнера накидано подряд без junction'ов).

### Запрещённые слова §17 R3 — обоснования

- «**Новая сущность Assembly Draft**»: обоснование выше — composition-first object не сводится к container или operation. Это инверсия рабочей модели (sequence first, parts derived).

---

## 2. Стратегия

`state.assemblies` — новый slice, массив `AssemblyDraft` объектов. Каждый draft — **упорядоченный список сегментов**, каждый сегмент описывает «откуда взят кусок ДНК»: container id, range на container'е, ориентация (forward или RC), плюс собственная позиция в assembly (offset, length). Также draft имеет **gap-сегменты** для свободного типизированного ДНК (вставки которые биолог пишет руками без source).

A1 — **только data layer**. UI (A2), primer design (A3), realise (A4) — следующие sprint'ы. Acceptance A1 — unit tests на reducer + helpers + invariants. Visual acceptance — отсутствует (нет UI).

Persistence через existing `skeleton-persistence` (schema bump v3 → v4, migration: добавляет пустой `assemblies: []` в старые snapshots). Existing F1-F4 продолжают работать без изменений.

---

## 3. Scope IN / OUT

### IN (A1)

- `state.assemblies: AssemblyDraft[]` slice.
- `AssemblyDraft` shape definition + invariants.
- `AssemblySegment` shape (source + range + orientation + position).
- Reducer cases: `ASSEMBLY_CREATE`, `ASSEMBLY_DELETE`, `ASSEMBLY_RENAME`, `ASSEMBLY_ADD_SEGMENT`, `ASSEMBLY_REMOVE_SEGMENT`, `ASSEMBLY_MOVE_SEGMENT`, `ASSEMBLY_UPDATE_SEGMENT`, `ASSEMBLY_INSERT_GAP`, `ASSEMBLY_SET_TOPOLOGY`.
- Helpers: `createDraft`, `addSegment`, `removeSegment`, `moveSegment`, `updateSegment`, `insertGap`, `computeAssemblySequence`, `normalizeOffsets`, `segmentBoundaries`.
- Invariants module: `validateNoOverlap`, `validateMonotonicOffsets`, `validateSourceConsistency`, `validateMaxLength`, `validateGapSequence`.
- Persistence: schema bump v3 → v4, migration `migrateV3ToV4(state)`.
- Actions exposed в skeleton-context: `createAssembly`, `deleteAssembly`, `renameAssembly`, `addAssemblySegment`, `removeAssemblySegment`, `moveAssemblySegment`, `updateAssemblySegment`, `insertAssemblyGap`, `setAssemblyTopology`.
- Tests: 25-30 unit tests (reducer + helpers + invariants + persistence migration + container removal cascade).

### OUT (A1)

- UI / Assembly View — A2.
- Drag-and-drop из Library / canvas → A2.
- Цветовые зоны (palette per source) — A2.
- Primer design на assembly view — A3.
- Selection через границы — A3.
- Reverse-DAG / «Realise as DAG» алгоритм — A4.
- Manual choice метода сшивки per boundary — A4.
- Promote Assembly Draft → Real Container в Library — A4 (опционально) или отдельный sprint.
- Side-by-side compare двух assemblies — отдельный sprint если потребуется.
- Annotation transfer (через сегменты на assembly от source containers) — A3 или отдельный sprint.

---

## 4. Архитектурные решения

### DEC-CANVAS-ASM-01 — AssemblyDraft shape

```
AssemblyDraft = {
  id: string,                          // 'asm-' + uuidv7()
  name: string,                        // user-given, default 'assembly_<n>'
  createdAt: number,
  updatedAt: number,
  topology: { circular: boolean },     // default false (linear); circular для финальной плазмиды
  segments: AssemblySegment[],         // упорядоченный по offset (монотонно возрастающий)
  notes: string,                       // optional user comment
  position: { x, y } | null,           // позиция на canvas если draft визуализирован как объект; null = только в drafts list
}
```

**Rationale:** id с prefix 'asm-' консистентно с 'tab-', 'c-', 'op-', 'j-' patterns. position null когда draft существует только в Drafts panel; non-null когда биолог явно дропнул его на canvas (A2 решает).

### DEC-CANVAS-ASM-02 — AssemblySegment shape

```
AssemblySegment = {
  id: string,                          // 'seg-' + uuidv7()
  kind: 'sourced' | 'gap',             // sourced = взят из container; gap = свободный (типовая вставка / linker / unknown)
  offset: number,                      // позиция начала сегмента в assembly sequence, 0-based
  length: number,                      // длина сегмента в bp
  
  // только для kind='sourced':
  sourceContainerId?: string,          // container.id из state.containers
  sourceRangeStart?: number,           // 0-based inclusive в координатах source container
  sourceRangeEnd?: number,             // 0-based exclusive (стандарт DEC-PARSER-COORD-01)
  orientation?: 'forward' | 'reverse', // forward или RC
  sourceContainerName?: string,        // denormalised snapshot имени source — для recovery если source удалён (A1 DEC-ASM-09)
  
  // только для kind='gap':
  gapSequence?: string,                // ATCG строка свободного ДНК; null/'' = unknown sequence-yet (placeholder)
  gapKind?: 'linker' | 'unknown' | 'custom',
  gapLabel?: string,                   // human-readable label «6×His linker», «GS x4»
}
```

**Rationale:** sourced vs gap — две концептуально разные природы. Sourced ссылается на existing container с range — реактивно тянет sequence из source. Gap — свободная вставка которая может быть unknown пока биолог не определится (placeholder для primer'а или для experimental construction). 

Гибридные сегменты (часть из source, часть custom) НЕ существуют — биолог делает их через два рядом стоящих segment'а: sourced + gap.

`sourceContainerName` denormalised snapshot — это страховка: если biolog удаляет source container из проекта, segment превращается в «orphan sourced» — мы можем показать «был такой-то, удалён» вместо вылета (DEC-ASM-09).

### DEC-CANVAS-ASM-03 — `computeAssemblySequence` derived, не stored

Assembly **не хранит** материализованную последовательность. Она вычисляется selector'ом `computeAssemblySequence(state, assemblyId)` через iteration segments в порядке offset, resolving каждого:

- sourced → `state.containers.find(c => c.id === seg.sourceContainerId).sequence.slice(start, end)`, optional RC.
- gap → seg.gapSequence (или '?'.repeat(seg.length) если gapSequence пустое).

Возвращает `{sequence, segmentMap: [{segmentId, offsetStart, offsetEnd, sourceLabel, color}], topology, orphans: [{segmentId, reason}]}`.

**Rationale:** хранить computed sequence = double source of truth (segments + sequence), синхронизация через дополнительный action. Pure derive проще, реактивно работает само (изменился source container.sequence — assembly.sequence автоматически новая).

Performance не блокер: max length sane (50 kb default, hard cap 500 kb через invariant DEC-ASM-10), iteration по segments линейная, slice операция дешёвая.

### DEC-CANVAS-ASM-04 — Сегменты упорядочены, gap'ы возможны между, offset монотонно возрастает

Инвариант: `segments[i+1].offset === segments[i].offset + segments[i].length` для всех i. Нет «дырок» в offset'ах. Если biolog хочет gap между sourced пusками — он явно вставляет `gap` segment с length и optional sequence.

Это значит: assembly.totalLength = sum of all segment lengths = последнего segment'а `offset + length`.

**Rationale:** offset'ы как «position в финальной последовательности», а не «position где-то с дырками». Helpers `normalizeOffsets(segments)` пересчитывает offsets после insert/remove/move чтобы invariant соблюдался — это reducer-side операция, биолог offsets не редактирует напрямую.

### DEC-CANVAS-ASM-05 — Orientation хранится явно, не выводится

Sourced segment имеет `orientation: 'forward' | 'reverse'`. Это явный флаг. Reverse означает «вставить кусок source[start:end] в обратной комплементарной форме».

**Rationale:** auto-detect orientation по контексту = сложно и недетерминированно. Биолог в SnapGene явно решает «вставить как есть» или «RC». В UI (A2) — toggle кнопка при drop сегмента.

### DEC-CANVAS-ASM-06 — Source containers могут быть из любого проекта, snapshot полей

Sourced segment может ссылаться на container из **другого проекта** (вне `currentProjectId`). Это важно для практики — biolog часто комбинирует кусок из старой плазмиды другого эксперимента.

**Hardening:** `sourceContainerName` snapshot при создании segment + `sourceProjectId` snapshot. Если в момент resolve container не найден локально → попытка load из persistence другого проекта (`stateKeyFor(sourceProjectId)`) если доступно. Иначе orphan.

В A1 — реализуется минимум: snapshot полей + fallback на orphan если не resolved. Cross-project load — TECH_DEBT (`TD-ASM-CROSS-PROJECT-LOAD`) либо в A2.

### DEC-CANVAS-ASM-07 — Topology assembly draft

`assembly.topology.circular: boolean`. Default false. Влияет на:
- `computeAssemblySequence` — circular добавляет в metadata, но сама строка возвращается линейная (биолог может «свернуть» концы при render — это A2 решает визуально).
- Realisation (A4): circular assembly означает что последний segment соединяется с первым → junction между ними как все остальные.
- Topology — user-set, не derived. Биолог явно решает «это будет circular».

### DEC-CANVAS-ASM-08 — Drafts vs canvas position

Assembly Draft существует **независимо от canvas position**. Поле `position` — optional:
- `null` — draft в drafts panel (см. A2 UX), не визуализирован на canvas. По умолчанию для новых.
- `{x, y}` — draft показан как объект на canvas (вид: rectangle с preview содержимого, аналог ContainerBlock но dashed border).

**Rationale:** биолог может работать с draft'ом полностью «в окне assembly view» (A2) не размещая его на canvas. Canvas — для финальной материализации (после A4 Realise → real containers + ops + junctions появляются на canvas).

### DEC-CANVAS-ASM-09 — Orphan segment handling (source removed)

Когда `state.containers` теряет container на который ссылается sourced segment:
- Segment **не удаляется** автоматически. Сохраняется с denormalised `sourceContainerName` + `length` + теперь невозможно resolve sequence.
- `computeAssemblySequence` возвращает в этом месте `'N'.repeat(length)` + помечает segment в `orphans` array.
- UI (A2) показывает orphan segment с warning badge «source удалён» + опцией «restore from snapshot» (если sequence snapshot был cached) или «replace with another source» или «convert to gap».

**Rationale:** биолог удалил container не подумав про assembly — terrible UX если assembly сломается без предупреждения. Lazy orphan-mode + явный manual recovery — defensive.

В A1 реализуется только data layer (orphan field + computeAssemblySequence обработка). UI recovery — A2.

### DEC-CANVAS-ASM-10 — Limits

- `assemblies.length` per project: warn at 20, hard cap 100 (sanity).
- `assembly.segments.length`: warn at 50, hard cap 200.
- `assembly total length` (sum segment lengths): warn at 50 kb, hard cap 500 kb. Hard cap prevents крайних случаев (биолог дропнул целую хромосому случайно).
- `gap.gapSequence.length`: 0 ≤ length ≤ 200 (типовые linker'ы). Свыше — TECH_DEBT (если biolog требует длинных custom gap'ов, обсудим отдельно).

Все warn'ы non-blocking (toast), hard caps возвращают reducer error (state не меняется + showToast 'error').

---

## 5. Файлы и сигнатуры

### Новые файлы

**`lib/assembly-model.js`** (~6-8 KB)

Pure helpers. Каждая функция чистая (input → output, без side-effects на state).

- `createDraft({name?, topology?, position?}): AssemblyDraft` — new draft с пустым segments. Auto-name если не задано.
- `makeSourcedSegment({sourceContainer, rangeStart, rangeEnd, orientation, offset}): AssemblySegment` — построить sourced segment с denormalised snapshot полей.
- `makeGapSegment({gapKind, gapSequence?, gapLabel?, length?, offset}): AssemblySegment` — gap segment. Если gapSequence — length = gapSequence.length. Если только length — gapSequence пустое (unknown).
- `addSegment(draft, segment, insertAtIndex?): AssemblyDraft` — добавить segment в позицию (default — конец). Pushes остальные segments вправо (offset += segment.length). Returns new draft.
- `removeSegment(draft, segmentId): AssemblyDraft` — удалить. Pulls остальные segments влево.
- `moveSegment(draft, segmentId, newIndex): AssemblyDraft` — переставить. Offsets пересчитываются.
- `updateSegment(draft, segmentId, patch): AssemblyDraft` — частичное обновление (e.g. изменить gapSequence, orientation). Если меняется length → re-offset rest.
- `splitSegment(draft, segmentId, atOffsetWithinSegment): AssemblyDraft` — разделить segment на два в позиции (offset within segment). Useful для A2 «insert in middle of existing».
- `normalizeOffsets(segments): segments` — пересчитать offsets чтобы invariant DEC-ASM-04 соблюдался.
- `segmentBoundaries(draft): {boundaries: [{atOffset, leftSegmentId, rightSegmentId}], totalLength}` — список границ между смежными сегментами. Используется A3 primer design (border = candidate для primer).
- `computeAssemblySequence(state, assemblyId): {sequence, segmentMap, topology, orphans}` — главный selector. См. DEC-ASM-03.

**`lib/assembly-invariants.js`** (~3-4 KB)

Все возвращают `{ok: boolean, error?: string}`.

- `validateNoOverlap(segments)` — проверка offset/length не пересекаются (sanity check после operations).
- `validateMonotonicOffsets(segments)` — offsets строго возрастают, DEC-ASM-04.
- `validateSourceConsistency(state, segment)` — source container существует и range в его пределах. Возвращает orphan если не существует.
- `validateMaxLength(draft)` — DEC-ASM-10 hard caps.
- `validateGapSequence(gapSegment)` — gapSequence содержит только ATCG/Nn (если непустая), длина в пределах.
- `validateDraft(state, draft): {ok, errors: [], warnings: []}` — aggregate всех validations.

**`store/skeleton-state-assemblies.js`** (~10-12 KB)

Sub-reducer для `state.assemblies` slice. Cases:

- `ASSEMBLY_CREATE { id?, name?, topology?, position? }` — create draft, push в `state.assemblies`. Если id не задан — генерируется.
- `ASSEMBLY_DELETE { assemblyId }` — remove.
- `ASSEMBLY_RENAME { assemblyId, name }`.
- `ASSEMBLY_SET_TOPOLOGY { assemblyId, circular }`.
- `ASSEMBLY_SET_POSITION { assemblyId, position }` — для drop на canvas (A2).
- `ASSEMBLY_ADD_SEGMENT { assemblyId, segment, insertAtIndex? }` — использует `addSegment` helper. Валидация через invariants — fail → showToast + state unchanged.
- `ASSEMBLY_REMOVE_SEGMENT { assemblyId, segmentId }`.
- `ASSEMBLY_MOVE_SEGMENT { assemblyId, segmentId, newIndex }`.
- `ASSEMBLY_UPDATE_SEGMENT { assemblyId, segmentId, patch }`.
- `ASSEMBLY_SPLIT_SEGMENT { assemblyId, segmentId, atOffsetWithinSegment }`.
- `ASSEMBLY_INSERT_GAP { assemblyId, gapKind, gapSequence?, length?, gapLabel?, insertAtIndex }` — convenience: build gap + addSegment.

Каждый case:
1. Find assembly by id. Если не найден → state unchanged.
2. Apply helper (addSegment / removeSegment / ...).
3. Validate через `validateDraft`. Если errors → state unchanged + showToast 'error'. Если warnings → continue + push toast 'warning'.
4. Update `assembly.updatedAt = Date.now()`.
5. Return new state.

**`store/skeleton-state.js`** (~+2-3 KB)

Router расширяется на assembly action types → assemblies sub-reducer. Pattern same as existing canvas / operations / editor sub-routers.

`REMOVE_CONTAINER` reducer case — расширяется: при удалении container проходим по `state.assemblies`, помечаем все sourced segments с этим containerId как orphan (но не удаляем — DEC-ASM-09). Не нужен полный reducer-side iter — orphan detection происходит lazy в `computeAssemblySequence`. Но `validateSourceConsistency` после `REMOVE_CONTAINER` стоит запустить для всех assemblies — выкинет warning toast «assembly X имеет orphan segments».

**`store/skeleton-context.jsx`** (~+1 KB)

Новые actions:

- `createAssembly({name?, topology?, position?}): id` — return generated id для immediate follow-up actions.
- `deleteAssembly(assemblyId)`.
- `renameAssembly(assemblyId, name)`.
- `addAssemblySegment(assemblyId, segment, insertAtIndex?)`.
- `removeAssemblySegment(assemblyId, segmentId)`.
- `moveAssemblySegment(assemblyId, segmentId, newIndex)`.
- `updateAssemblySegment(assemblyId, segmentId, patch)`.
- `splitAssemblySegment(assemblyId, segmentId, atOffsetWithinSegment)`.
- `insertAssemblyGap(assemblyId, params, insertAtIndex)`.
- `setAssemblyTopology(assemblyId, circular)`.
- `setAssemblyPosition(assemblyId, position)`.

Hooks:

- `useAssemblies()` — selector returning state.assemblies.
- `useAssemblyById(assemblyId)` — selector.
- `useAssemblySequence(assemblyId)` — selector wrapping `computeAssemblySequence`.

**`store/skeleton-persistence.js`** (~+1 KB)

Schema bump v3 → v4. Migration `migrateV3ToV4(state)`:

- Добавляет `state.assemblies = []` если отсутствует.
- Bumps schemaVersion.

Идемпотентна — повторное применение не ломает.

### Тесты

Файл `__tests__/canvas-skeleton/assembly-model.test.js` (~10-12 KB).

Покрытие:

1. **createDraft basic:** new draft has unique id, empty segments, sane defaults.
2. **createDraft с params:** name / topology / position respected.
3. **addSegment sourced first:** offset=0, length=range size, segment in array.
4. **addSegment second:** offset = first.offset + first.length.
5. **addSegment insertAtIndex middle:** subsequent segments push offset.
6. **removeSegment middle:** subsequent pull offset back.
7. **moveSegment forward/back:** offsets recompute correctly.
8. **updateSegment length change:** rest re-offset.
9. **splitSegment middle:** two new segments, sum length = original.
10. **insertGap with sequence:** length = sequence length, offset correct.
11. **insertGap unknown:** gapSequence empty, gapKind='unknown', length explicit.
12. **computeAssemblySequence sourced only:** correct concatenation, segmentMap populated.
13. **computeAssemblySequence RC orientation:** segment with orientation='reverse' produces reverseComplement(slice).
14. **computeAssemblySequence with gap:** gap sequence inserted between sourced.
15. **computeAssemblySequence with empty gap:** 'N'.repeat(length) at gap position.
16. **computeAssemblySequence circular topology:** sequence linear, metadata flagged.
17. **orphan detection:** sourceContainer removed → computeAssemblySequence flags segment as orphan, returns 'N'.repeat(length).
18. **invariants validateNoOverlap:** synthetic overlap → fails.
19. **invariants validateMonotonicOffsets:** synthetic gap → fails.
20. **invariants validateSourceConsistency:** segment with stale range → fails (range out of source bounds).
21. **invariants validateMaxLength:** assembly with 600 kb total → fails hard cap.
22. **reducer ASSEMBLY_CREATE:** adds to state.assemblies with auto-id.
23. **reducer ASSEMBLY_ADD_SEGMENT:** dispatches addSegment, validates.
24. **reducer ASSEMBLY_ADD_SEGMENT invalid:** invariant fail → state unchanged, toast pushed.
25. **reducer ASSEMBLY_DELETE:** removes from state.assemblies.
26. **reducer REMOVE_CONTAINER cascade:** if container used in assembly, container removed, assembly stays with orphan segment (lazy).
27. **persistence migration v3 → v4:** old snapshot without `assemblies` → new state has `assemblies: []`.
28. **persistence migration idempotent:** v4 snapshot through migration → same state.
29. **schema v4 round-trip:** save → load → assemblies preserved with all fields.
30. **DEC-ASM-10 limits:** insert segment exceeding hard cap → reducer returns unchanged + toast 'error'.

---

## 6. Порядок выполнения

### K1 — Pure helpers + invariants

- `lib/assembly-model.js` все helpers (без reducer).
- `lib/assembly-invariants.js`.
- Unit tests 1-21.

### K2 — Sub-reducer + state slice

- `store/skeleton-state-assemblies.js`.
- Router в `store/skeleton-state.js`.
- Tests 22-26.

### K3 — Persistence + migration

- Schema bump в `store/skeleton-persistence.js`.
- Migration v3 → v4.
- Tests 27-29.

### K4 — Context actions + hooks

- Actions в `store/skeleton-context.jsx`.
- useAssemblies / useAssemblyById / useAssemblySequence hooks.

### K5 — REMOVE_CONTAINER cascade

- Расширение existing REMOVE_CONTAINER reducer case.
- Orphan detection через computeAssemblySequence.
- Test 26 (если ещё не покрыт в K2).

### K6 — Limits enforcement

- Hard caps в reducer.
- Toast wiring.
- Test 30.

### K7 — Cleanup + size audit

- Lint, build clean.
- Sizes под budget.
- Финальный отчёт.

**STOP после K7.** Не финализирует координационные файлы (PROJECT_STATE / DECISIONS / BUGS / RELEASES / ANCHORS / TECH_DEBT / CLAUDE.md / package.json / version.js). Visual acceptance — нет (нет UI в A1). Acceptance — manual smoke в dev console через `useSkeletonActions` (создать draft, добавить segments, вызвать selector, увидеть sequence) + tests green + build clean.

---

## 7. STOP-условие и формат отчёта

Code останавливается после K7, возвращает в chat:

1. **Size budget table** (новые файлы + изменённые).
2. **Tests:** count pass / fail / skip. Build clean.
3. **DECISIONS sprint-block draft** (10 DEC-CANVAS-ASM-NN).
4. **Manual smoke в dev console:** одна фраза «открыл console, dispatched createAssembly + addSegment x3 + computeAssemblySequence — sequence корректна, persistence round-trip OK».
5. **Отклонения от спеки** явным блоком если есть.

---

## 8. Риски

### R1 — DEC-ASM-06 cross-project source — не реализован в A1, может ударить позже

Sourced segments из других проектов (snapshot fields) — реализовано минимально. Если в A2 биолог попытается «open source container» из другого проекта — UI должен fall through на denormalised name без crash. Митигация: в A2 UI добавить «open in original project» action с явным project-switch (TECH_DEBT `TD-ASM-CROSS-PROJECT-OPEN`).

### R2 — computeAssemblySequence performance на больших drafts

Драфт 200 segments × 5000 bp each = 1 МБ строка на каждый useAssemblySequence subscribe. Митигация: memoize по `(assembly.updatedAt, container-ids-and-updatedAt)` ключу; selector кеширует results между rerenders. Если станет узким горлом — переход на range-based access (`getSequenceSlice(assemblyId, offsetStart, offsetEnd)`).

### R3 — Migration v3 → v4 ломает старые сnapshots

Tests 27-29 покрывают, но real-world snapshots в localStorage биолога могут иметь edge cases (custom data, manual edits). Митигация: migration defensive (try/catch при недостающих полях, lenient parse).

### R4 — REMOVE_CONTAINER cascade scope

Сейчас REMOVE_CONTAINER кэскадирует на operations (inputs), tabs (editor close). Расширение на assemblies — ещё одна точка. Митигация: lazy orphan (не нужно iter assemblies при remove) + warning toast «assembly X has orphan segments».

### R5 — Изобретение четвёртой первичной сущности — большой архитектурный шаг

Это **переосмысление канваса**. Containers + Operations + Junctions + Assemblies — 4 сущности. Каждый последующий sprint (A2/A3/A4) на ней опирается. Если ментальная модель Игоря в реале отличается (например, biolog хочет «container в draft mode», не отдельный Assembly) — придётся переделывать. Митигация: A1 — только data layer; стоимость отката (удалить slice + 3 файла) низкая, до visual UX (A2) не идём.

### R6 — Конфликт «Assembly Draft» с «Library Draft Containers» если такие появятся

Если в Library когда-то появятся «draft containers» (mid-construction), термин Draft может стать перегруженным. Митигация: явное naming `AssemblyDraft` (не просто `Draft`), отличает от любых других "draft" концептов.

---

## 9. Открытые вопросы — нужен OK Игоря до handoff Code

### Q1 — Gap segments — нужны в A1 или отложить в A2?

Дефолт: реализовать в A1, потому что они часть data model (нельзя добавить позже без миграции). Минимально — пустые gap segments как placeholders; sequence-aware gap-content редактирование — A2.

Альтернатива: в A1 только sourced segments, gap позже. Это упрощает A1 (~3 KB меньше), но в A2 потребует data model extension + migration.

### Q2 — Assembly position on canvas (DEC-ASM-08) — A1 или A2?

Дефолт: реализовать в A1 как nullable field (без UI, просто data). A2 будет drop assembly on canvas.

Альтернатива: вообще не на canvas — assembly существует только в side panel. Это проще для A2 UX (один контекст работы), но теряется visual link между assembly и операциями/контейнерами на canvas после A4 Realise.

### Q3 — Orphan handling (DEC-ASM-09) — strict или lenient?

Дефолт (lenient): orphan segment остаётся, computeAssemblySequence возвращает 'N'.repeat(length).

Альтернатива (strict): при REMOVE_CONTAINER явно отказать в удалении если container использован в assembly — «Container используется в Assembly X. Сначала удалите/замените сегменты». Это защищает биолога от случайной потери, но создаёт friction.

### Q4 — Auto-name новых drafts

Дефолт: 'assembly_<n>' где n — incremental counter per-project (`max existing + 1`).

Альтернатива: timestamp-based 'assembly_2026-05-15_1430'. Менее читаемо, но уникально между перезагрузками.

---

## Acceptance gate

После Code commit'а + STOP. Acceptance:

- Unit tests все green.
- Dev console smoke: `createAssembly({name:'test'})` → returns id; `addAssemblySegment(id, makeSourcedSegment({container, 100, 500, 'forward', 0}))` → segments[0] correct; `computeAssemblySequence(state, id)` → returns expected slice from container.
- Schema migration: backup snapshot v3, load в build с A1, assemblies=[] добавлено, других потерь нет.
- Build clean.
- Размеры под budget.

**Visual acceptance — нет.** A1 чисто data layer. UI acceptance — в A2.

---

_Дата:_ 15.05.2026.
_Реализация Code:_ после OK Игоря по Q1-Q4 + compact (или batch с A2-A4 если Игорь так решит).
_Acceptance:_ unit-tests + dev console smoke; visual acceptance отсутствует.
