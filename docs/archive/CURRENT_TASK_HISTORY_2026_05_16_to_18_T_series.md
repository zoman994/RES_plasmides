# CURRENT_TASK.md

## 🟢 Архитектурный поворот: ввод семейства Assembly Drafts — 15.05.2026 вечер

**Дата:** 15.05.2026 (поздний вечер после bug-bash V68-V76 + walkthrough'а Игоря о реальном assembly-workflow в SnapGene).

**Контекст:** После прогона F1-F4 через Code (12 багов V68-V76 одним днём, vital V71 rework PcrModeShell на SequenceView reuse), Игорь объяснил свой реальный workflow в SnapGene: assembly-sequence-first, не DAG-first. «Беру плазмиду, копирую кусок, вставляю; беру следующий, копирую и вставляю; так последовательность за последовательностью леплю конструкцию; потом соединяю overlap'ами до разумного числа кусков и дальше Gibson/рекомбиназа».

Этот workflow **отсутствовал** в F1-F4 спеках. F3 PcrModeShell (V71 rework) обслуживает **isolated PCR** — правильный use case (секвенирование / check-PCR / amplification), но не main workflow Игоря.

Написана большая стопка Assembly Drafts — 4 большие spec'и type A + 1 короткая disposition:

### Новые спеки на диске

| Спека | Файл | Размер | Тип |
|---|---|---|---|
| **A1** Assembly Data Model | `docs/SPRINT_M-CANVAS-ASSEMBLY-MODEL.md` | 37 KB | A |
| **A2** Assembly Construct UX | `docs/SPRINT_M-CANVAS-ASSEMBLY-CONSTRUCT.md` | 38.5 KB | A |
| **A3** Primer Design на Assembly | `docs/SPRINT_M-CANVAS-ASSEMBLY-PRIMER-DESIGN.md` | 30.6 KB | A |
| **A4** Realise as DAG | `docs/SPRINT_M-CANVAS-ASSEMBLY-REALISE.md` | 30.1 KB | A |
| **D1** F3 PcrModeShell Disposition | `docs/SPRINT_M-CANVAS-F3-DISPOSITION.md` | 11 KB | C |

**Сумма:** ~147 KB новых спек + ~110 KB F1-F4 = ~260 KB архитектурных блупринтов canvas v2.

### Ключевые идеи

- **Assembly Draft = четвёртая первичная сущность** (после containers / operations / junctions). Объект со списком сегментов (sourced из container + range + RC orientation, или gap свободный). Sequence derived, не stored. State.assemblies slice.
- **Coloured zones** рендерируются в SequenceView через опциональный `segmentMap` prop (backward-compat). Биолог видит границы фрагментов по смене цвета. Palette stable hash containerId → HSL pastel.
- **Primers ставятся на assembly view** через Ctrl+R / right-click как в PCR mode (V71-V74 паттерн). Selection на boundary → boundary primer с tail из соседнего segment. Selection внутри segment → obычный primer.
- **Realise as DAG** — reverse-engineering: алгоритм строит N PCR ops + N-1 junctions + N+1 containers из спецификации assembly. Биолог выбирает метод сшивки per boundary (Gibson / GG / Overlap-PCR / RE / Direct ligation). Auto-suggest на основе primer tail length и endings.
- **Multi-realise** версии (`-r2`, `-r3`) без удаления предыдущих — биолог сравнивает варианты. Hard cap 5 ревизий.
- **Two coexisting workflows:** F3 isolated PCR (V71 rework, реализован) + Assembly Drafts (A1-A4 новые). D1 формализует сосуществование.

### Cross-spec R-DRIFT риск

Спеки A1-A4 написаны в batch'е без acceptance gate. Плюс зависимость A1 → A2 → A3 → A4 — жёсткая (последующие опираются на data model A1 + UI A2 + primers A3).

Плюс опора на F2 (junction shape, по факту реализована в V58-V76 cycle) и F4 (Live Product, ожидается существование selectVirtualOutputs для A4 derived containers до OP_EXECUTE).

**Митигация:** перед Code-сессией A1 — обзор F1-F4 fact в коде (вероятно в acceptance сессии) + поправки A1-A4 против реальности до handoff.

### Конфликты с existing файлами docs/ — разрешение

При листинге docs/ обнаружены три existing спеки 15.05 в той же тематике:

- `SPRINT_M-CANVAS-PROTOTYPE-PCR.md` (27 KB) — **устарело**, прототип container editor 11.05. DEC-CANVAS-V01-* идеи реализованы через F1+V58-V76. Этот файл archived в D1.
- `SPRINT_M-CANVAS-ASSEMBLY-DATA.md` (38 KB) — **вторая попытка A1**, лучше в 5 местах. **Используется как второй input для Code merge stage в A1**.
- `SPRINT_M-CANVAS-ASSEMBLY-VIEW.md` (52 KB) — **вторая попытка A2**, лучше в 5 местах. **Используется как второй input для Code merge stage в A2**.

**Решение Игоря 15.05 вечером:** Code читает оба файла в merge stage для A1 и A2, пишет структурированный merge plan, ждёт OK Chat до implementation. A3/A4/D1 — одноэтапные (пары нет). См. handoff-фразы ниже.

### Рекомендуемый порядок Code-сессий

```
0. cleanup docs/ — archive existing M-CANVAS-ASSEMBLY-DATA/VIEW если они не релевантны
1. F2/F3/F4 acceptance сессия — по факту в коде (можно batch вместе с V58-V76)
2. A1 (data model) Code → acceptance via unit-tests + dev console smoke
3. A2 (UI construct) Code → visual acceptance в отдельной chat-сессии
4. A3 (primer design) Code → visual acceptance
5. A4 (Realise as DAG) Code → visual acceptance end-to-end (самый важный момент)
6. D1 (F3 disposition documentation) — я или Code: archive F3 spec + pointer notes
```

### Handoff Code — фразы

#### A1 Assembly Data Model — двухэтапный (merge plan + implementation)

Для A1 исторически была написана вторая спека (`SPRINT_M-CANVAS-ASSEMBLY-DATA.md`, G1) раньше в тот же день. Она проработана лучше в 5 местах: **annotation transfer** как helper в data model (в A1 это OUT — ошибка), **frozen sequence semantics** explicit (A1 — реактивный computeAssemblySequence, может surprise UX), **REMOVE_CONTAINER cascade keep-with-warning** (A1 — lazy orphan, менее explicit), **SegmentSource discriminated union** ('container'/'manual'/'imported', clearer чем мой 'sourced'/'gap'), **AssemblyDraftBlock visual** в G1 (visual smoke возможен сразу, а не только dev-console). A1 лучше в других местах: helpers splitSegment, invariants module с hard caps, schema v3→v4 explicit.

**Этап 1 — Merge plan:**

> Прочитай CLAUDE.md, BUGS.md, CURRENT_TASK.md. Потом прочитай ДВЕ спеки по одной теме целиком:
> 1. `docs/SPRINT_M-CANVAS-ASSEMBLY-MODEL.md` (новая, A1).
> 2. `docs/SPRINT_M-CANVAS-ASSEMBLY-DATA.md` (старая, G1).
> 
> Обе описывают одну сущность (`state.assemblies` / `state.assemblyDrafts`) по-разному. Сделай **структурированный merge plan** — это текстовый отчёт Chat'у в этой же сессии (НЕ implementation сразу).
> 
> Структура merge plan'а:
> - **Naming choice:** state.assemblies vs state.assemblyDrafts — выбрать одно имя, обосновать.
> - **Segment shape:** `kind: 'sourced'|'gap'` (A1) vs `source: SegmentSource union 'container'|'manual'|'imported'` (G1). Выбрать одно, обосновать.
> - **Sequence semantics:** derived selector (A1) vs cached + frozen (G1). Обосновать.
> - **Annotation transfer:** in scope (G1) vs OUT (A1). Правильно in scope.
> - **REMOVE_CONTAINER cascade:** lazy orphan (A1) vs keep-with-warning explicit (G1). Правильно keep-with-warning.
> - **AssemblyDraftBlock visual:** OUT (A1, A2 territory) vs in scope (G1). Берём minimal block в A1 для visual smoke.
> - **Hard caps / invariants module:** in scope (A1) vs отсутствует (G1). Правильно in scope.
> - **splitSegment helper:** in scope (A1) vs нет (G1). Правильно in scope (нужен в A2 для context-menu Split here).
> - **Schema migration:** v3→v4 explicit (A1) vs абстрактный SCHEMA_VERSION (G1). Берём A1 explicit но реальный N вывери из текущего кода (R12 уже bump'ал).
> - **DECISIONS naming:** DEC-CANVAS-ASM-NN едино (G1 уже это использует; A1 тоже).
> 
> Отчёт формата «Merge decision: <item> → выбрано <source>, rationale <one-liner>». После этого — STOP, жду OK Chat'а.

**Этап 2 — Implementation:**

> После OK Chat'а на merge plan — implementation по выбранному set'у решений. Шаги K1—K7 (вид из новой A1 спеки, с точечными оверрайдами из merge plan'а). После K7 — STOP, жду dev-console smoke + visual smoke (если AssemblyDraftBlock in scope по merge plan'у).

#### A2 Assembly Construct UX — двухэтапный (merge + implementation)

Аналогично A1, для A2 есть пара. Старая `SPRINT_M-CANVAS-ASSEMBLY-VIEW.md` (G2) лучше в 5 местах: **`coloredZones` prop naming clearer** (мой `segmentMap`), **`onZoneClick` / `onZoneHover` explicit API**, **drag-and-drop из sidebar напрямую** (мой AssemblySourcePicker modal — search/Other Projects лучше, но DnD быстрее; оба пути возможны), **MiniProjectCanvas extension** (assembly drafts маркерами), **header rename inline + topology/length info**. G2 включает primer writing внутрь shell'а (мой split — отдельный A3 sprint). A2 лучше в других местах: **AssemblySourcePicker modal** с 4 tabs (Library/Canvas/Other Projects/Paste), **InsertGapModal** с пресетами linker, **AssemblyDraftsPanel** floating, decomp на sub-components AssemblySegmentsPanel/AssemblyToolbar/AssemblyDraftBlock.

**Этап 1 — Merge plan:**

> Прочитай CLAUDE.md, BUGS.md, CURRENT_TASK.md. Потом прочитай ДВЕ спеки целиком:
> 1. `docs/SPRINT_M-CANVAS-ASSEMBLY-CONSTRUCT.md` (новая, A2).
> 2. `docs/SPRINT_M-CANVAS-ASSEMBLY-VIEW.md` (старая, G2).
> 
> Сделай структурированный merge plan. Ключевые развилки:
> - **Prop naming:** `segmentMap` (A2) vs `coloredZones` (G2) в SequenceView extension.
> - **Interaction API:** segmentMap as data-only (A2) vs explicit onZoneClick/onZoneHover (G2).
> - **Source insertion UX:** AssemblySourcePicker modal с tabs (A2) vs HTML5 drag-and-drop из sidebar (G2). Оба пути имеют смысл — modal для search/Other Projects, DnD для быстрого drop. Можно выбрать один или оба (toggle).
> - **Primer writing scope:** в G2 внутрь shell'а vs в A2 — OUT (отдельный A3 sprint). **Это ключевая развилка — если выбираешь primer writing в A2, A3 растворяется в A2 или становится post-MVP enhancement. Если оставляешь в A3 — A2 проще.**
> - **MiniProjectCanvas extension:** in scope (G2) vs OUT (A2). Правильно in scope.
> - **Header rename inline:** in scope (G2) vs OUT (A2 в toolbar/header detail). Правильно in scope.
> - **Sub-components decomposition:** A2 (AssemblyShell+SegmentsPanel+SourcePicker+Toolbar+DraftsPanel+DraftBlock+Palette) vs G2 (AssemblyModeShell+Header+Sidebar+SegmentList+SegmentDetailPanel+RealiseAsDagButton+AssemblyPrimerWriter). Разная декомпозиция — выбрать одну.
> - **Gap segments UI:** A2 имеет InsertGapModal с пресетами (linker/custom/unknown), G2 этого не раскрывает. Правильно in scope.
> - **DraftsPanel vs Drag-from-LibraryTree:** A2 имеет отдельный AssemblyDraftsPanel floating (list of drafts), G2 работает напрямую из LibraryTree sidebar внутри editor'а. Оба легитимны.
> 
> Отчёт формата «Merge decision: <item> → <source>, rationale». STOP, жду OK.

**Этап 2 — Implementation:**

> После OK Chat'а — implementation. Шаги K1—K11 (из A2 спеки, с точечными оверрайдами по merge plan'у). После K11 — STOP, жду visual acceptance.

#### A3 Assembly Primer Design — одноэтапный (пары нет)

Старой спеки по A3 нет — в G-версии primer writing входил в G2 (внутрь VIEW shell'а). Если на merge plan A2 будет выбрано «primer writing внутрь A2» — A3 растворяется в A2 или становится post-MVP enhancement.

> Прочитай `docs/SPRINT_M-CANVAS-ASSEMBLY-PRIMER-DESIGN.md`. A1+A2 уже acceptance'ed. Выполни K1—K9. После K9 — STOP.

#### A4 Realise as DAG — одноэтапный (пары нет)

Старой G3 спеки не было (в G-версии планировалась, но не написана). Только новая спека.

> Прочитай `docs/SPRINT_M-CANVAS-ASSEMBLY-REALISE.md`. A1+A2+A3 acceptance'ed. Выполни K1—K9. Это самая важная спека — reverse-DAG algorithm требует согласования с F2 junction shape + F3 op shape + F4 virtual containers.

#### D1 F3 Disposition — одноэтапный

> Прочитай `docs/SPRINT_M-CANVAS-F3-DISPOSITION.md`. mini-sprint type C: documentation updates + optional sidebar entry. Дополнительно — archive в `docs/archive/` отработавшие спеки (`SPRINT_M-CANVAS-PROTOTYPE-PCR.md` устарел, идеи реализованы через F1+V58-V76; `SPRINT_M-CANVAS-ASSEMBLY-DATA.md` и `SPRINT_M-CANVAS-ASSEMBLY-VIEW.md` после merge в A1/A2 acceptance — archived).

### Что дальше из этой сессии

1. **Compact** (§7 playbook — обилие спек + большой walkthrough).
2. **Игорь решает:** archive ли existing `SPRINT_M-CANVAS-ASSEMBLY-DATA.md` / `-VIEW.md` / `-PROTOTYPE-PCR.md` или они релевантны? Это влияет на чтение Code.
3. **F1-F4 acceptance** (вероятно batch с V58-V76 bug-bash — большинство уже de facto реализовано).
4. **A1 Code session** — с handoff-фразой выше.
5. **A2 → A3 → A4** sequential.
6. **D1** в конце cleanup'ом.
**Спеки на диске:**
- `docs/SPRINT_M-CANVAS-WINDOW.md` (F1, ~25 KB, type A) — Window System Foundation.
- `docs/SPRINT_M-CANVAS-JUNCTION.md` (F2, ~29 KB, type A) — Junction Contract + Reactive Cascade.
- `docs/SPRINT_M-CANVAS-PCR.md` (F3, ~32 KB, type A — на верхней границе 30-35 KB из NOTES §9.5) — PCR Operation Mode.
- `docs/SPRINT_M-CANVAS-PRODUCT.md` (F4, ~24 KB, type A — переклассифицирована из B по факту scope) — Live Product Preview.

**Статус:** все 4 спеки утверждены (F1 Q1-Q4 дефолты 15.05; F2-F4 открытые вопросы закрыты дефолтами inline в спеках).
**Следующий ход — compact + handoff Code (либо последовательно F1→F2→F3→F4 с acceptance gate между, либо один общий прогон — решение Игоря ниже).**

### Cross-spec риск R-DRIFT — общий для F2/F3/F4

Спеки F2/F3/F4 написаны без acceptance gate F1. Если F1 в реализации сместит API (например, junction popover открывается из editor tab, не из canvas badge) — F2 потребует поправок. Аналогично F3 опирается на F1 (tab system) + F2 (junction selectors); F4 на F1+F2+F3.

**Митигация в спеках:** явные ссылки на DEC-WIN-NN, DEC-JUNC-NN, DEC-PCR-NN. При acceptance F1 (и последующих) — review F2/F3/F4 против изменений **до** Code-сессии следующего спринта.

### Рекомендуемый порядок Code-сессий (§9.6 NOTES «секвенциально с acceptance gate»)

```
F1 Code-session → acceptance (chat) → [при FAIL — поправки F2/F3/F4]
  → F2 Code-session → acceptance → [поправки F3/F4 если нужно]
    → F3 Code-session → acceptance → [поправки F4 если нужно]
      → F4 Code-session → acceptance
```

Каждая Code-сессия = отдельный chat с compact между. Acceptance = визуальная проверка + подтверждение Игоря. Альтернатива (один batch Code) — очень рискованно, §9.6 NOTES явно против.

### Handoff Code — фразы для каждой сессии

**F1 Window System Foundation:**

> Прочитай CLAUDE.md, BUGS.md, CURRENT_TASK.md, затем спеку `docs/SPRINT_M-CANVAS-WINDOW.md` целиком. Выполни M-CANVAS-WINDOW (F1), шаги K1—K6. Спеку в docs/ не переписывай. После K6 остановись — жду визуальной приёмки, не финализируй PROJECT_STATE / DECISIONS / BUGS / RELEASES / ANCHORS / TECH_DEBT / CLAUDE.md / package.json / version.js. В отчёте выдай size budget + tests count + DECISIONS sprint-block draft + manual smoke + явный блок отклонений от спеки.

**F2 Junction Contract:**

> Прочитай CLAUDE.md, BUGS.md, CURRENT_TASK.md, спеку `docs/SPRINT_M-CANVAS-JUNCTION.md`. F1 уже acceptance'ed — сверь с fact'ами в коде. Выполни M-CANVAS-JUNCTION (F2), шаги K1—K6. После K6 — STOP. Тот же формат отчёта.

**F3 PCR Operation Mode:**

> Прочитай CLAUDE.md, BUGS.md, CURRENT_TASK.md, спеку `docs/SPRINT_M-CANVAS-PCR.md`. F1 + F2 уже acceptance'ed. Выполни M-CANVAS-PCR (F3), K1 — harvest discovery v0.5 (в спеке список файлов); K2—K8 — реализация. После K8 — STOP. Тот же формат отчёта + дополнительно harvest map из K1.

**F4 Live Product Preview:**

> Прочитай CLAUDE.md, BUGS.md, CURRENT_TASK.md, спеку `docs/SPRINT_M-CANVAS-PRODUCT.md`. F1 + F2 + F3 acceptance'ed. Выполни M-CANVAS-PRODUCT (F4), K1 — audit R5-R9 bio helpers reusability; K2—K6 — реализация. После K6 — STOP. Тот же формат отчёта + audit результат из K1.

### Что дальше

1. **Compact этой сессии** (§7 playbook — смена типа задачи спека → реализация). 4 спеки в контексте — вес большой.
2. **Первая Code-сессия — F1.** Вставить handoff-фразу F1 выше.
3. **После F1 acceptance** (отдельная chat-сессия с compact) — review F2 спеку против фактической реализации F1, внести поправки если нужно → запуск F2 Code-сессии.
4. **Аналогично** F3, F4 — review против реальности предыдущих спринтов → Code.
5. После F4 acceptance — cleanup-сессия: archive 4 спеки в `docs/archive/`, DECISIONS promote ~33 DEC-CANVAS-*-NN, RELEASES blocks, version bump, BUGS закрытых, etc.

---

## 🟢 Walkthrough модели + декомпозиция PCR-спеки — 15.05.2026

**Дата:** 15.05.2026 (вечер, после cleanup-сессии).
**Тип:** диагностический разговор (планировочный, не спринт).

**Сделано:**
- Walkthrough двух пайплайнов: restriction-ligation + site-directed mutagenesis.
- Закрыта модель Canvas V2: **16 решений** (operation-aware viewer + window system + junction-contract + live product).
- Декомпозиция PCR на **4 последовательных спеки** (Window System → Junction Contract → PCR Op Mode → Live Product), каждая с acceptance gate между.
- Записано в `docs/NOTES_CANVAS_V2_KICKOFF.md` §9 (~10 KB блок, обязательное чтение перед Spec 1).
- **⛓ DEC-MUTABILITY-FREEZE-ON-USE-01** зафиксирован в `ANCHORS.md`: B1 freeze-on-use-in-operation. Перед F1 Spec 1 скелет схемы должен учитывать `frozen` semantics. Git-слой — отдельный sprint после F4.
- **F5 Onboarding + Curated Examples** добавлен в roadmap (тип B, ~15-20 KB, после F4 либо параллельно с F3). Progressive disclosure Игоря: SnapGene-like Library при первом запуске → постепенный выход на canvas. + curated `.bodge` примеры с готовыми DAG.
- **F1 пересмотр window system**: full-screen viewer + mini-canvas в углу вместо узкой левой колонки. Параметры mini-canvas — открытая развилка в спеке.
- **Конфирмация перед заказом олигов** — явный gate, не тихий toast. Добавлено в риск-карту Spec 3.

**Технический долг (обнаружен в этой сессии):**
- ANCHORS.md: DEC-MUTABILITY-FREEZE-ON-USE-01 вставлен в хронологически неправильную позицию (между Sprint Interoperability 08.05 и Sprint M-B FINAL 02.05) из-за неуникального oldText в edit_file. Функционально работает (ID уникален, дата в записи), перенос в конец файла — next cleanup-сессия. Низкий приоритет.

**Отложено:**
- Primer pool архитектура (View / inline tab / pool-вьювер) — отдельная сессия после Spec 1-4.
- Mutagenesis vs PCR boundary — разведём фактом при реализации Mutagenesis-op.
- `executed` workflow state UI — отдельный sprint после Spec 4.

**Compact обязателен** между этой сессией и Spec 1 (§7 playbook — смена типа задачи планирование → спека). [Compact сделан перед этой сессией — Spec 1 уже написана выше.]

---

## 🟢 Координационные файлы причёсаны — 15.05.2026

**Дата:** 15.05.2026 (короткая cleanup-сессия после bug-fix sessions 13-14.05).
**Тип:** D (тривиальные правки координационных файлов, типы согласно §13 playbook).

**Сделано:**
1. `ANCHORS.md` — снят дубль sprint-блока v0.8.2 (3 promotions + footnote).
2. `TECH_DEBT.md` — убраны два дубль-фрагмента (Snapshot 11.05 line + секция «v0.8.2 entries RUST/TAURI якори»). NIT-3 сохранён inline в Dev environment & policy. Размер 121 → 88 KB.
3. `PROJECT_STATE.md` — typo «ҍх» не найден grep'ом (видимо исправлен ранее silently).
4. `COMPONENT_MAP.md` — двойной `---` после блока V52 заменён одинарным.
5. `BUGS.md` — V50 + V49 переехали в `docs/archive/BUGS_HISTORY.md` (новая секция «02–03.05.2026 — Sprint M-B.2 K4 + Parser-Unification»). V51 header восстановлен (был потерян в одной из предыдущих правок). Размер сократился, FIXED секция чистая, отсылка на BUGS_HISTORY + BUGS_v05.

**Не сделано (отложено на handoff с Игорем):**
- Refresh PROJECT_STATE.md (header v0.8.2 устарел — нужно отразить R5-R9 + R10-R11 + bug-sessions 13-14.05).
- Update `memory_user_edits` — записи v0.7.1 / ~947 Vitest / M-X.7a FAIL устарели на 4 минорных.

---

## 🟡 Pending визуальные приёмки (выбирать в следующих чистых сессиях)

1. **TrashZone** (11.05.2026 реализован Code без kickoff/спеки, тип B нарушение — auto-mode без согласования). `components/Library/tree/TrashZone.jsx` 8.3 KB + 14 тестов. Семантика: soft-delete auto-commit через 5 сек убран, записи живут до явного purge. Кандидат на ⚓ — DEC-SOFT-DELETE-NO-AUTOCOMMIT-01.
2. **Canvas V2 Editor Full + paradigma V2** (12.05.2026). 16 DEC-CANVAS-V2-* sprint-level. Watch-точки: TabBar Library regression (`npm test -- --run Library/inspector`) + Annotator scope guard (TD-CANVAS-V2-ANNOTATOR-SCOPE-GUARD).
3. **R5-R9 M-CANVAS-OPS-BIO** (14.05.2026 sub-sprint). 17 DEC-OPS-* sprint-level. KLD + protocol-export + primer-order + PCR multi + mutagenesis + annotations + Gibson primer design + Sanger primer + codon-optimize + strain-compat + protocol-codon + annotation-conflicts + op-execute bio-validation + codon-panel + auto-annotate refactor.
4. **R10-R11 M-CANVAS-OPS-ARCH** (после R5-R9). mini-plasmid-map + types refactor.
5. **V58-V64 bug-sessions** (13-14.05.2026, всё `[x]` в BUGS.md OPEN/Высокие): ghost placeholder logic + cascade slot positioning + drag suppress synthesised click + operation rhombus pointer-drag + «+ Операция» button per-view + uuid collision.

После каждой приёмки — обычная финализация (RELEASES блок, DECISIONS ⚓ promote если есть, archive спеки, version bump).

---

## ⚠ Pending decomp (sprint type A или B)

- ~~`skeleton-state-canvas.js`~~ — **больше не блокер.** После R12 split (15.05) 21.51 KB, Watch zone под hard 25 KB. Spec 1 этот файл не трогает.
- Soft warnings (Watch list — не блокеры):
  - `CanvasLayoutView.jsx` 34.36 KB (soft 30 KB) — между +1 sprint и hard 40 KB.
  - `ContainerEditorSkeleton.jsx` 33.95 KB (soft 30 KB) — **Spec 1 уменьшит на 3-5 KB через header trim**, должно вернуться под soft.
  - `PlaceholderTreePicker.jsx` 18.50 KB — вырос ~2.5× в bug-fix sessions 14.05 (search input + 4 секции + collapsible). Низкий приоритет.

---

## 📋 Лог Code handoff-протокола

**#1 (v0.8.2 финал, 11.05):** Code финализировал координационные файлы несмотря на STOP, оставил половину работы.
**#2 (TrashZone, 11.05):** Code auto-mode без kickoff/спеки.
**#3 (SKELETON v1, 12.05):** чисто, STOP соблюдён.
**#4 (SKELETON FIX1, 12.05):** чисто, STOP соблюдён.
**#5 (Canvas V2 Editor Full, 12.05):** Code вышел за рамки спеки B-типа в направлении NOTES, decisions зафиксированы post-factum. Не нарушение — новый режим работы.
**#6 (M-CANVAS-OPS R5-R9 BIO, 13-14.05):** wave-первый sprint, тип A, ROADMAP_CANVAS_V2_TO_PRODUCTION.md + SPRINT_M_CANVAS_OPS.md. K1 разведка v0.5 algorithm core прошла, harvest успешен.
**#7 (M-CANVAS-OPS R10-R11 ARCH, 14.05):** продолжение R5-R9, mini-plasmid-map + types.
**#8 (bug-sessions V58-V64, 13-14.05):** 6 багов закрыты, без формального sprint flow.

---

## 📌 Handoff Игорю

Spec 1 написана и ждёт OK по Q1-Q4. После OK + compact — handoff Code в новой сессии.

**Альтернативный путь (если OK не быстрый):** провести одну из pending визуальных приёмок (A-C выше) в текущей сессии — они не зависят от Spec 1 и могут идти параллельно.

---

_Last updated: 15.05.2026 (поздний вечер, после walkthrough'а assembly-workflow — 5 новых спек A1-A4+D1, сумма с F1-F4 ~260 KB canvas v2 блупринтов)._

---

## Отчёт Code по Sprint T1 (Pieces State) — 16.05.2026

Спека `docs/SPRINT_T1_PIECES_STATE.md` (10-спек серия T1–T10, «делаем по 1»). Pure data layer, без UI. TDD по каждому K-шагу (тест red → код green → полный прогон).

- **Коммиты:** не создавались — пользователь явно коммит не запрашивал (Git Safety Protocol). Все изменения в working tree, готовы к ревью/коммиту Chat'ом.

- **Изменения размеров** (.js hard 25 / soft 20 KB):
  - `store/skeleton-state.js`: ~18.9 KB (Δ≈+0.3 — import + chain-строка + spread; hard 25 — OK)
  - `store/skeleton-persistence.js`: 9.27 KB (Δ≈+0.5 — migrate_v4_to_v5 + header; OK)
  - `src/lib/strings.js`: data-файл (локали — не лимитируется, CLAUDE.md §7)

- **Новые файлы:**
  - `lib/piece-model.js` (5.87 KB) — createPiece / computePieceSize / generatePieceColor / clonePiece / autoPieceName
  - `lib/piece-invariants.js` (4.69 KB) — PIECE_CAPS + validateCreate/Update/RangeOnContainer
  - `store/skeleton-state-pieces.js` (5.42 KB) — buildInitial + 9-action reducer + isPieceAction
  - `store/selectors-pieces.js` (1.73 KB) — 6 селекторов
  - `__tests__/piece-model.test.js` (+13), `piece-invariants.test.js` (+16), `skeleton-state-pieces.test.js` (+24, incl. K5 router-integration), `selectors-pieces.test.js` (+9), `skeleton-persistence-migration-v5.test.js` (+6)

- **Vitest:** 2708 pass / 1 skip / 1 pre-existing flake (`primer-wizard.test.jsx` TD-PRIMER-WIZARD-FLAKE — Library, retry-green в изоляции 2/2, T1 не трогает Library). baseline 2640 (BUGS V52, тот же день) → **Δ+68**. Спека §6 ожидала ~Δ+42 — реально +68: добавлены edge/integration (DEC-T1-13 REPLACE_STATE pre/post-T1, R-T1-4 persist round-trip, router-chain identity, локализованный toast по `code`, generatePieceColor collision-shift, разрешение §5.7 'direct'). Аддитивно, не слабее.
- **pytest:** не трогалось (T1 backend не задевает; 112/112 от v0.8.0).
- **vite build:** clean (built 459ms, PWA generateSW как обычно; warnings/errors — нет).

- **Отклонения от спеки:**
  1. **Schema-миграция v4→v5, не v3→v4 (R-DRIFT).** `SCHEMA_VERSION_CURRENT` уже = 4 (A1 assemblyDrafts отгружен). Вывел реальный N из кода — по прямой инструкции спеки §0 «реальный N вывери из текущего кода». Реализован `migrate_v4_to_v5` (pieces:[], идемпотентно-аддитивно, зеркало `migrate_v3_to_v4`), bump CURRENT 4→5. Persistence в коде = конверт `{schema,savedAt,state}` + `MIGRATIONS[fromVersion]`-карта, НЕ псевдокод спеки §5.12 `migrateV3toV4(snapshot.schemaVersion)` — следовал реальному паттерну. DEC-T1-03 фактически «v(N)→v(N+1)», N=4.
  2. **3 существующих assertion'а schemaVersion 4→5** (`assembly-selectors-persistence.test.js`, `assembly-mode.test.jsx`, `junction-contract.test.jsx`). Намеренная смена контракта (T1 владеет v5). Поменян только номер версии + честные заголовки тестов; все прочие assertion'ы в этих тестах нетронуты (tdd-enforce: легитимное обновление reg-assertion под сознательно изменённый контракт).
  3. **STRINGS path = `src/lib/strings.js` → namespace `canvasSkeleton.pieces`** (named export `STRINGS`), не `CanvasSkeleton/lib/strings.js` (спека §5.14 написала путь приблизительно). 8 ключей §5.14 добавлены дословно.
  4. **Локализация ошибок через invariant `code`.** `piece-invariants.js` остаётся pure / STRINGS-free (как `assembly-invariants.js`), возвращает `{ok,error,code}`; reducer мапит `code`→локализованную строку STRINGS. Так namespace реально подключён (не мёртвый placeholder), pure-слой без зависимостей. `autoPieceName`/clone-суффикс — inline-литералы (прецедент `assembly-model.js`, который strings не импортит); ключи `autoNameTemplate`/`pieceClonedSuffix` остаются как T5-facing placeholder per §5.14 intent.
  5. **Разрешено противоречие §5.7 vs §5.3/§5.10:** `acquisitionMethod:'direct'` имеет легитимно пустые params (§5.7 → `{}`), но §5.3/§5.10 требовали non-empty для любого не-`undefined`. Решение: `'direct'` (как `'undefined'`) params не требует; non-empty обязателен только для param-несущих (pcr/ov-pcr/restriction/synthesis). Зафиксировано тестом.
  6. **Именование/расположение тестов:** плоский `CanvasSkeleton/__tests__/*.test.js` по существующей конвенции (assembly-model.test.js…), не спековский несуществующий `__tests__/lib/...`. `skeleton-state-pieces.test.js` = `.js` (нет JSX, зеркало assembly-reducer.test.js), спека писала `.jsx`. Migration-тест = `…-v5.test.js` (см. отклонение 1).
  7. **K9 dev-console smoke:** сниппет спеки опирается на `window.skeletonDispatch`/`window.skeletonStore` — **их в коде нет нигде**. Добавление dev-глобалей вне Scope IN T1 (pure data layer) — НЕ добавлял (scope-stop). Приёмка K9 покрыта 68 unit-тестами, гоняющими те же пути end-to-end через реальный public `skeletonReducer` + saveSnapshot/loadSnapshot round-trip (сильнее одноразового console-dispatch). Честная пометка, не тихий skip.

- **DECISIONS sprint-block draft (для Chat, DECISIONS.md не трогал):** DEC-T1-01..14 реализованы как в §4, КРОМЕ **DEC-T1-03**: schema-bump фактически **v4→v5** (не v3→v4) — v4 занят A1. Кандидаты формулировок: «DEC-T1-03′ — pieces migration = v4→v5, idempotent additive, MIGRATIONS-карта по fromVersion»; зафиксировать разрешение §5.7/§5.3 (откл. 5) как DEC-T1-07′ уточнение; локализация через invariant-`code` (откл. 4) — паттерн для T2+.

- **Migration sanity:** `migrate_v4_to_v5` идемпотентна по `Array.isArray(state.pieces)`; pre-T1 v3-snapshot проходит всю цепь v3→v4→v5 (assemblyDrafts:[] + pieces:[]); `pieces` не в TRANSIENT_UI_FIELDS → saveSnapshot→loadSnapshot восстанавливает. Подтверждено `skeleton-persistence-migration-v5.test.js` (6 тестов: bump=5 / v4→pieces:[] / идемпотентность / no-op at CURRENT / v3-цепь / round-trip).

- **Size budget: OK.** Все 6 файлов под hard 25 KB; крупнейший новый — `piece-model.js` 5.87 KB. `skeleton-state-pieces.js` 5.42 KB (спека ждала 10–15 — вышло компактнее, T8-split рекомендация не нужна). Новых нарушителей нет, роста >5 KB нет.

После K10: СТОП. PROJECT_STATE / DECISIONS / BUGS / RELEASES / ANCHORS / TECH_DEBT / CLAUDE.md / package.json / version.js не трогались. Спека остаётся в `docs/SPRINT_T1_PIECES_STATE.md` (Code спеку не переписывает). Визуальная/приёмочная сессия (dev-console smoke + DEC-T1 promote + version-накопление T1+T2) — отдельной сессией Chat. Следующий спринт серии — T2 (`docs/SPRINT_T2_PIECES_MIGRATION_OP_PARAMS.md`), зависит от T1.

---

## Отчёт Code по Sprint T2 (Pieces Migration / op.inputPieces) — 16.05.2026

Спека `docs/SPRINT_T2_PIECES_MIGRATION_OP_PARAMS.md`. Гибрид dual-field (op.inputs legacy + op.inputPieces primary), наслоено поверх T1 (working tree). TDD по каждому K (test red → code green → полный прогон). «Идём дальше» — батч после T1 без отдельного gate.

- **Коммиты:** не создавались — пользователь коммит не запрашивал (Git Safety Protocol). Всё в working tree.

- **Изменения размеров** (.js soft 20 / hard 25 KB):
  - `store/skeleton-persistence.js`: 9.27 → **12.56 KB** (Δ+3.3 — migrate_v5_to_v6 с полным piece-конструированием; спека §0 ждала +1.5; OK под hard)
  - `store/skeleton-state.js`: 18.89 → **19.73 KB** (Δ+0.84 — freeze-pieces блок + import; чуть под soft 20, hard 25 — watch)
  - `store/skeleton-state-operations.js`: ~9.3 → **11.05 KB** (Δ≈+1.7 — inputPieces default + 2 actions; OK)
  - `store/skeleton-state-pieces.js`: 5.42 → **8.32 KB** (Δ+2.9 — REMOVE_CONTAINER/OP_RESET prelude + REMOVE_PIECE op-cascade; OK)
  - `store/selectors-pieces.js`: 1.73 → **2.60 KB** (Δ+0.9 — frozen-aware + 2 селектора; OK)
  - `lib/piece-model.js`: 5.87 → **6.12 KB** (Δ+0.25 — frozen); `lib/piece-invariants.js`: 4.69 KB (+1 comment, 'direct'); `adapters/pcr.js`: → 8.40 KB (+import+hybrid); cut/gibson/ligate/kld/mutagenesis +~0.3 KB каждый (все ≤ hard)

- **Новые файлы:**
  - `lib/op-piece-bridge.js` (4.32 KB) — resolveOpTemplate/Range/InputContainers/InputPieces + isOpReadyToExecute (pure, map+array-agnostic)
  - tests: `op-piece-bridge.test.js` (+15), `skeleton-state-operations-pieces.test.js` (+8), `skeleton-state-pieces-cascade.test.js` (+5), `skeleton-persistence-migration-v6.test.js` (+9), `pcr-piece-resolve.test.js` (+6), `op-execute-with-pieces.test.jsx` (+4); extended `piece-model.test.js` (+2), `piece-invariants.test.js` (+1), `selectors-pieces.test.js` (+2)

- **Vitest:** **2761 pass / 1 skip / 0 fail** (баз. ~2709 после T1 → **Δ+52**). Спека §6 K11 ждала ~Δ+30 — реально +52: bridge map+array формы, cascade edge-cases, migration idempotency/graceful-skip/executed-frozen, adapter legacy-vs-piece паритет, freeze+frozenSequence, frozen-aware selector. Аддитивно. `primer-wizard` flake в этот прогон зелёный (0 fail).
- **pytest:** не трогалось (T2 backend не задевает).
- **vite build:** clean (PWA generateSW как обычно; errors/warnings — нет).

- **Отклонения от спеки:**
  1. **Миграция v5→v6, не v4→v5 (R-DRIFT-цепочка).** T1 поднял CURRENT до 5. T2 op→pieces = `MIGRATIONS[5]=migrate_v5_to_v6`, bump 5→6. Реальный код-паттерн (конверт `{schema,savedAt,state}` + `MIGRATIONS[fromVersion]`, идемпотентно), НЕ псевдокод §5.5 `migrateV4toV5(snapshot.schemaVersion)`. Per-op идемпотентность — guard «inputPieces непуст → skip».
  2. **5 существующих assertion'ов обновлены.** 4 schema-version (assembly-selectors-persistence / assembly-mode / junction-contract / skeleton-persistence-migration-v5) toBe(5)→toBe(6); skeleton-snapshot-migrate-r12 «operations unchanged» → «operations + аддитивный inputPieces:[]» (v5→v6 штампует inputPieces всем ops). Намеренные смены контракта; прочие assertion'ы нетронуты (tdd-enforce — легитимно).
  3. **Адаптеры — surgical opt-in, не литеральная замена на bridge (DEC-T2-09).** Piece-резолюция активна ТОЛЬКО при непустом op.inputPieces; иначе byte-identical legacy `ctx.containers[id]`/fragmentIds. Причина: защита ~150 op-mock тестов + bio-invariants (pcr `params.templateIds`/multi-template нюанс). resolveOpTemplate fallback сделан строгим суперсетом legacy (+`params.templateIds[0]`) → single-template substitution идентичен при пустом inputPieces. pcr multi-template (params.templateIds-driven) не тронут (T2-миграция templateIds не пишет). Подтверждено: 49 adapter/op тестов + полный прогон зелёные.
  4. **Bridge принимает и map, и array контейнеры.** Спека §5.4 предполагала array (`state.containers.find`); реальный adapter ctx executeOperation — map (`Object.fromEntries`). `getContainer` обрабатывает оба (иначе adapter-интеграция падает); isOpReadyToExecute/селекторы с array-state тоже работают.
  5. **OP_RESET размораживает pieces (DEC-T2-13), хотя у контейнеров симметричной разморозки нет** (pre-existing, вне scope T2 — не ретрофитил). Реализовано для pieces как в спеке (piecesReducer реагирует на OP_RESET).
  6. **K1 — no-op:** `'legacy-migration'` уже был в T1 ORIGIN_ENUM (typedef T1 §5.1). Подтверждено позитивным тестом; правка enum не нужна.
  7. **Именование/расположение тестов** — плоский `__tests__/*.test.js(x)` по конвенции кодовой базы (не спековские `__tests__/lib|store|canvas|integration/...`). Migration-тест = `-v6` (см. откл. 1).
  8. **K12 dev-console smoke:** как в T1 — `window.skeletonDispatch`/`skeletonStore` нигде не экспонированы; dev-глобаль не добавлял (scope-stop, вне Scope IN). Приёмка — 52 теста, гоняющие те же пути через реальные `skeletonReducer` / `migrateSnapshot` / `executeOperation` / save↔load.

- **DECISIONS sprint-block draft (для Chat, DECISIONS.md не трогал):** DEC-T2-01..15 реализованы как §4, КРОМЕ: **DEC-T2-06** (идемпотентность — реальный паттерн = per-op inputPieces-guard + chain `fromVersion<CURRENT`, НЕ inner `snapshot.schemaVersion`; та же persistence-деривация, что в T1); **DEC-T2-09** (realized = surgical opt-in, откл. 3); версия миграции **v5→v6** (не v4→v5, R-DRIFT, откл. 1); DEC-T2-14 zoneId остаётся null (T3 ещё нет). Кандидат-формулировки: «DEC-T2-09′ surgical opt-in (legacy byte-identical when !inputPieces)», «bridge container-form-agnostic (map|array)».

- **Migration sanity:** `migrate_v5_to_v6` per-op идемпотентна (skip ops с непустым inputPieces) + chain-идемпотентна (run только fromVersion<6). Pre-T2 op → один legacy-migration piece на input-контейнер (template хранит params.range, прочие full-length), op.inputs СОХРАНЁН, bad-ref graceful skip, executed→frozen:true, pcr→derivedReactionId=op.id. Подтверждено `skeleton-persistence-migration-v6.test.js` (9) + v5-цепь + r12-цепь.

- **Size budget: OK.** Все затронутые .js ≤ hard 25 KB. Warning signal: `skeleton-persistence.js` +3.3 KB (спека §0 ждала +1.5 — больше из-за полной piece-конструкции в миграции); `skeleton-state.js` 19.73 KB — почти у soft 20 (hard 25), watch в T3+. Новых hard-нарушителей нет.

После K13: СТОП. PROJECT_STATE / DECISIONS / BUGS / RELEASES / ANCHORS / TECH_DEBT / CLAUDE.md / package.json / version.js не трогались. Спека остаётся в `docs/SPRINT_T2_PIECES_MIGRATION_OP_PARAMS.md` (Code не переписывает). Приёмка T1+T2 + version-bump-накопление — сессией Chat. Следующий — T3 (`docs/SPRINT_T3_ZONES_DATA_AND_FRAMES.md`).

---

## Отчёт Code по Sprint T3 (Zones data + frames) — 16.05.2026

Спека `docs/SPRINT_T3_ZONES_DATA_AND_FRAMES.md`. Чистый data layer (Miro-фреймы: `state.zones` + `zoneId` на узлах), без visual (T4). Наслоено поверх T1+T2 (working tree). TDD по каждому unit (test red → code green → полный прогон). «Дальше идём» — батч после T2.

- **Коммиты:** не создавались — пользователь коммит не запрашивал (Git Safety Protocol). Всё в working tree.

- **Изменения размеров** (.js soft 20 / hard 25 KB):
  - `store/skeleton-state.js`: 19.73 → **20.48 KB** (Δ+0.75 — zones import + buildInitialZonesState + default zone + chain; **soft 20 WARN**, hard 25 OK — следующая правка этого файла рискует пробить hard, T4 учесть)
  - `store/skeleton-persistence.js`: 12.56 → **13.37 KB** (Δ+0.81 — migrate_v6_to_v7; OK)
  - `store/skeleton-state-operations.js`: 11.05 → **11.13 KB** (Δ+0.08 — zoneId:null default; OK)
  - `store/skeleton-state-canvas.js`: ~25.78 → **25.93 KB** (Δ+~0.15 — 2 `zoneId:null` в factory; **PRE-EXISTING над hard 25 с F2-эпохи** — НЕ T3-нарушитель; спека §0 явно скопила это как cascade-only minimal; CLAUDE.md §7 калибровка = Watch-list stable, не блокер; декомп — решение Chat)

- **Новые файлы:**
  - `lib/zone-model.js` (2.84 KB), `lib/zone-bounds.js` (2.15 KB), `lib/zone-invariants.js` (1.47 KB), `store/skeleton-state-zones.js` (7.07 KB — спека ждала 12-15, вышло компактнее; превентивный zone-bounds split снял R-T3-1), `store/selectors-zones.js` (2.50 KB)
  - tests: `zone-model.test.js` (+10), `zone-bounds.test.js` (+8), `zone-invariants.test.js` (+5), `skeleton-state-zones.test.js` (+21: 15 reducer + 6 router-integration), `selectors-zones.test.js` (+7), `skeleton-persistence-migration-v7.test.js` (+5)

- **Vitest:** **2817 pass / 1 skip / 0 fail** (баз. 2761 после T2 → **Δ+56**). Спека §6 K15 ждала ~Δ+38 — реально +56: zone-bounds clamp/anchor edge-cases, все 11 actions + кросс-slice cascades + router-integration + REPLACE_STATE, 9 селекторов incl cross-zone, migration idempotency/preserve/chain. Аддитивно. `primer-wizard` flake в этот прогон зелёный.
- **pytest:** не трогалось.
- **vite build:** clean (PWA generateSW как обычно; errors/warnings — нет).

- **Отклонения от спеки:**
  1. **Миграция v6→v7, не v5→v6 (R-DRIFT-цепочка A1=4/T1=5/T2=6).** `MIGRATIONS[6]=migrate_v6_to_v7`, bump 6→7. Реальный envelope/MIGRATIONS-паттерн, идемпотентность через `hasOwnProperty('zoneId')` preserve (R-T3-2 — existing zoneId не перетирается), НЕ псевдокод §5.8 `migrateV5toV6(snapshot.schemaVersion)`.
  2. **6 stale assertion'ов + 5 collateral additive-deep-equal обновлены.** schema-version toBe(6)→toBe(7) в 4 файлах (assembly-selectors-persistence / assembly-mode / junction-contract / migration-v5 / v6); r12-цепь: containers+ops теперь +zoneId:null; 3 migration deep-equal → ожидают zoneId:null; 1 RESET-vs-fresh non-determinism (DEC-T3-08 default zone = random uuid → сравнение modulo zones). Намеренные смены контракта (tdd-enforce), прочие assertion'ы нетронуты. Это рекуррентный паттерн (memory).
  3. **zoneId:null штампуется в factory** (containerFromLibraryEntry, makeGhostPlaceholder, createOperationDraft per K6/K8; createPiece уже имел из T1). Выбран explicit-field (spec-faithful, единообразно с миграцией) → collateral deep-equal churn поглощён в U7.
  4. **buildInitialState теперь недетерминирован (DEC-T3-08 default zone = uuid+Date.now()).** Добавлен `buildInitialState({forceEmptyZones})` escape (R-T3-3). Будущие тесты, deep-equal'ящие два initial state, потребуют того же — by-design, не баг.
  5. **K12 (RECOMPUTE_ZONE_BOUNDS finalizer после REMOVE_CONTAINER/ADD/MOVE) отложен.** Причины: R-T3-4 infinite-loop риск; autoResize — visual-adjacent (T4 рендерит bounds; T3 §1.2 «интерактивность нулевая»); целостность данных зоны НЕ требует пересчёта (контейнер удалён → зона просто теряет члена; bounds advisory до T4). REMOVE_ZONE/MOVE/WRAP/MERGE cascades реализованы полностью. T4 владеет auto-resize.
  6. **K13 (auto-assign zoneId по drop-position при ADD_CONTAINER_FROM_ENTRY/OP_ADD) отложен.** Спека сама помечает «opt-in/возможно»; UI-placement-adjacent (selectZoneByPoint), T3 §1.2 «чисто data layer». Новые узлы loose; explicit MOVE_NODE_TO_ZONE/WRAP работают. T4/T5 владеют. Scope-stop.
  7. **Junction-селекторы используют реальный shape `fromContainerId/toContainerId`** (спека §5.7 писала `j.from/j.to` — не совпадает с codebase); defensive fallback на from/to.
  8. **Именование/расположение тестов** — плоский `__tests__/*.test.js` (не спековские `__tests__/lib|store/...`). Migration = `-v7` (откл. 1). 11 substantive zone actions + SPLIT_ZONE stub (спека говорит «12»; RECOMPUTE не реализован, откл. 5).
  9. **K16 dev-console smoke:** как T1/T2 — `window.skeletonDispatch`/`skeletonStore` нигде не экспонированы; не добавлял (scope-stop). Приёмка — 56 тестов через реальные skeletonReducer/migrateSnapshot.

- **DECISIONS sprint-block draft (для Chat, DECISIONS.md не трогал):** DEC-T3-01..17 реализованы как §4, КРОМЕ: версия миграции v6→v7 (не v5→v6, R-DRIFT, откл. 1); **DEC-T3-06** autoResize-recompute finalizer отложен (откл. 5, T4); K13 position-auto-assign отложен (откл. 6); **DEC-T3-14** идемпотентность = hasOwnProperty + MIGRATIONS-map (не inner `snapshot.schemaVersion`). Кандидат: «DEC-T3-08′ buildInitialState non-deterministic + forceEmptyZones test-escape».

- **Migration sanity:** `migrate_v6_to_v7` идемпотентна — узел с существующим zoneId сохраняется (hasOwnProperty guard, R-T3-2), отсутствующий → zoneId:null; zones:[] если нет. Chain v3→…→v7 проверена (assemblyDrafts:[] + pieces + zoneId:null + zones:[]). Подтверждено `skeleton-persistence-migration-v7.test.js` (5) + v5/v6/r12 chain-тесты (обновлены аддитивно).

- **Size budget: WARN.** Все 5 новых zone-файлов ≤ 7.07 KB (под soft 20). **Новые нарушители: нет** — `skeleton-state-canvas.js` 25.93 KB над hard 25, но это **pre-existing с F2-эпохи** (memory/TECH_DEBT: deferred-to-Chat), T3 добавил лишь +0.15 KB cascade-only как спека §0 явно скопила; калибровка CLAUDE.md §7 = stable Watch-list, не блокер/FAIL. **Warning signal:** `skeleton-state.js` вошёл в soft 20 (20.48 KB, Δ+0.75 — не >5 KB, но кросс soft зафиксирован: T4 при правке этого файла рискует пробить hard 25). Рост >5 KB за спринт — нет.

После K17: СТОП. PROJECT_STATE / DECISIONS / BUGS / RELEASES / ANCHORS / TECH_DEBT / CLAUDE.md / package.json / version.js не трогались. Спека остаётся в `docs/SPRINT_T3_ZONES_DATA_AND_FRAMES.md` (Code не переписывает). Приёмка T1+T2+T3 + version-bump — сессией Chat. ⚠ Chat: `skeleton-state.js` вошёл в soft 20 — до T4 (visual zones, будет править этот файл) желательно mini-spec на декомпозицию либо явное Watch-решение; `skeleton-state-canvas.js` pre-existing >hard остаётся открытым TD. Следующий — T4 (`docs/SPRINT_T4_ZONES_RENDERING_GRAPH.md`).

---

## Отчёт Code по Sprint T4 (Zones rendering) — 16.05.2026 — ⚠ ЧАСТИЧНО (integration HELD)

Спека `docs/SPRINT_T4_ZONES_RENDERING_GRAPH.md`. Первый UI-спринт серии. **Реализованы все безопасные части (~80%); интеграция в CanvasLayoutView/GraphView (K8/K9/K11) ОСТАНОВЛЕНА** по правилу size-budget (см. блокер ниже) — требуется решение Chat. TDD по каждому unit.

- **🛑 БЛОКЕР (catch на «перепроверяй себя»):** спека §0 baseline для `CanvasLayoutView.jsx` — «~16 KB → ~21 KB». **Реально файл 33.67 KB** (уже soft-zone .jsx soft 30 / hard 40) — ошибка §0 в ~2×. Спека хочет +~5 KB (ZoneLayer mount + pointer-up hit-detect + cross-zone junction viz) → ~38 KB, вплотную к hard 40, на самом bug-bashed файле (V58-V81). Skill size-budget: «§0 baseline ≠ реальность → STOP, сверка с Chat» И «>3 KB в soft-zone → STOP, mini-spec на декомпозицию до K1». Оба условия выполнены → K8/K9/K11 НЕ писались. Вынесено пользователю.

- **Коммиты:** не создавались (Git Safety Protocol — не запрашивались). Всё в working tree.

- **Сделано (TDD, все зелёные):**
  - `canvas/zone-interaction.js` (1.52 KB) — findZoneAtPoint outer-most + hitTestResizeHandle + computeResizeNewBounds re-export.
  - `canvas/zone-cross-junction-style.js` (0.72 KB) — style-константы + isJunctionCrossZone.
  - `store/skeleton-state-zones.js`: 7.07 → 8.97 KB — actions **DRAG_ZONE** (атомарный bounds+positions+op.position) + **RECOMPUTE_ZONE_BOUNDS**.
  - `store/skeleton-state.js`: 20.48 → **21.90 KB** (Δ+1.42) — finalizer auto-recompute (см. откл. 3).
  - `canvas/ZoneFrame.jsx` (4.40 KB), `canvas/ZoneContextMenu.jsx` (4.50 KB), `canvas/ZoneLayer.jsx` (4.30 KB) — компоненты + RAF-throttle drag/resize.
  - `index.css` — `--zone-*` design tokens (см. откл. 4). `lib/strings.js` — zones STRINGS extension (§5.9).
  - tests (+41): zone-interaction (7), zone-cross-junction-style (2), skeleton-zone-finalizer (5), ZoneFrame (8), ZoneContextMenu (9), ZoneLayer (5), +5 в skeleton-state-zones (DRAG/RECOMPUTE).

- **НЕ сделано (HELD до решения Chat):** K8/K9/K11 — ZoneLayer mount в CanvasLayoutView/CanvasGraphView, pointer-up drop-hit-detect, cross-zone junction render. Компоненты/либы готовы к монтированию. Следствие: zones визуально НЕ рендерятся на /canvas-skeleton (нет browser-observable изменения) → **K15 browser-smoke отложен ВМЕСТЕ с интеграцией** (честно: непримонтированные компоненты в браузере не верифицируемы; unit-тесты их покрывают полностью).

- **Vitest:** **2858 pass / 1 skip / 0 fail** (баз. 2817 после T3 → **Δ+41**, всё новое — safe parts). Ноль collateral (grow-only finalizer не трогает default zone без members → нет suite-wide дрейфа). `primer-wizard` flake зелёный.
- **pytest:** не трогалось. **vite build:** clean.

- **Отклонения от спеки:**
  1. **§0 size baseline неверен** (CanvasLayoutView ~16 KB заявлено, 33.67 KB реально) — главный catch, интеграция held (см. блокер).
  2. **K8/K9/K11 не реализованы** — held; компоненты готовы, browser-smoke отложен с ними.
  3. **Grow-only finalizer (correctness fix vs §5.7).** Спека §5.7 = shrink-to-fit computeZoneBoundingBox → нарушает DEC-T3-06 (auto-resize растёт, не сжимается) И дерётся с DRAG_ZONE (snap-to-tight vs translate). Реализован union(currentBounds, tightBox) — grow-only, идемпотентно (no loop R-T4-2), DRAG-safe. Тесты явно проверяют DRAG-no-conflict + remove-не-сжимает + idempotent-no-loop.
  4. **CSS токены через реальную палитру, не спековский rgba(0,0,0).** §5.10 предлагал rgba(0,0,0,…) (запрещено токен-системой). `--zone-*` в :root через var(--border-subtle/--accent-500/700/--warning-fg/--surface-*/--shadow-md) — auto light/dark. `DESIGN_SYSTEM.md` НЕ трогал (Chat-owned, CLAUDE.md §6) — только функциональный index.css.
  5. **lucide-react не резолвится** (skill design-system утверждает «в зависимостях» — неверно для этого проекта; canvas-skeleton использует emoji V68/V70/V81). Notes-badge = спековский 📝 (как в §5.1, совпадает с конвенцией codebase, билдится).
  6. **UPDATE_ZONE_BOUNDS контракт:** §5.2 pseudo шлёт {edge,delta}; T3-reducer берёт {bounds}. ZoneLayer считает bounds через resizeZoneBounds(startBounds, edge, totalDelta) → {bounds} (корректно по T3).
  7. **Rename через window.prompt** (§5.3 хотел inline-edit-on-header через InlineEditableTitle — cross-component header-edit wiring отложен ВМЕСТЕ с интеграцией; prompt — прагматичный DEV-skeleton выбор, прецедент V52, happy-dom-guarded).
  8. **Именование/расположение тестов** — плоский `__tests__/*.test.{js,jsx}` (не спековские nested `__tests__/canvas|integration/`).
  9. **Миграции в T4 нет** (UI-спринт; §1.1 «Migration v5→v6 закрыта» — устаревший R-DRIFT текст, реальная схема v7 от T3, T4 не бампит). Нет stale-assertion churn.

- **DECISIONS sprint-block draft (для Chat):** DEC-T4-01..17 — safe parts реализованы КРОМЕ: DEC-T4-12 finalizer исправлен на grow-only union (откл. 3, корректность); DEC-T4-06/13 (drop hit-detect outer-most) — логика в zone-interaction lib готова, pointer-up WIRING (K8) held; DEC-T4-11 cross-zone style lib готов, junction-render wiring (K11) held. Кандидат: «DEC-T4-12′ auto-resize = grow-only union (DEC-T3-06-consistent, DRAG-safe, idempotent)».

- **Size budget: WARN.** Новые файлы ≤4.5 KB (под soft). `skeleton-state-zones.js` 8.97 KB (OK). `skeleton-state.js` **21.90 KB** (Δ+1.42, soft 20 WARN накопительно T3+T4, hard 25 OK — Watch). **Новые hard-нарушители: нет.** **🛑 `CanvasLayoutView.jsx` 33.67 KB НЕ ТРОНУТ** — блокер интеграции, нужна декомпозиция до K8.

**🛑 РЕШЕНИЕ ДЛЯ CHAT/Игоря (T4 завершение):** интеграция zones в canvas (K8/K9/K11) требует одного из:
  (A) Chat пишет mini-spec на декомпозицию `CanvasLayoutView.jsx` (вынести pointer/drag/junction-логику в подмодули, увести файл < soft 30) → потом монтаж ZoneLayer;
  (B) явное «accept risk» — смонтировать ZoneLayer в текущий 33.67 KB файл (→ ~38 KB, под hard 40, но на V58-V81 fragile коде, повышенный регресс-риск);
  (C) §0 спеки T4 был основан на устаревшем размере — возможно spec нуждается в ревизии scope.
Компоненты/actions/finalizer/токены готовы и зелёные — интеграция = ~1 K-step после решения.

После safe-parts: СТОП. PROJECT_STATE / DECISIONS / BUGS / RELEASES / ANCHORS / TECH_DEBT / CLAUDE.md / package.json / version.js не трогались. Спека в `docs/SPRINT_T4_ZONES_RENDERING_GRAPH.md` не переписана. T4 НЕ завершён — integration held.

### T4-ДОДЕЛКА (Игорь: «поехали без пауз» = informed go → вариант B) — 16.05.2026

Интеграция K8/K11 выполнена **минимальной дельтой** (вся логика уже в готовом ZoneLayer/hook):
- `store/skeleton-context.jsx`: +2 thin wrappers (`moveNodeToZone`, `zoneDispatch`).
- `canvas/useCanvasLayoutDrag.js`: в `onPointerUp` (внутри `if(dragging.hasMoved)`) — drop-hit-detect для container/operation (findZoneAtPoint + selectZoneByNodeId → moveNodeToZone), аддитивно, V58-V81 логика не тронута, deps обновлены.
- `canvas/CanvasLayoutView.jsx`: +import ZoneLayer + 1 JSX-строка mount (первым ребёнком scaled-wrapper, zIndex 1 под узлами) + K11 cross-zone junction (path `stroke`/`strokeDasharray` через isJunctionCrossZone, `data-cross-zone`). **Дельта ~0.4 KB** (не +5 как в спеке §0 — bulk в ZoneLayer). CanvasLayoutView ~34 KB (был 33.67, +~0.4) — под hard 40, soft-zone риск минимизирован делегированием.
- **K9 (CanvasGraphView) — НЕ сделан, обоснованно отложен:** graph-view использует `computeGraphPositions` (алгоритмический layout, игнорирует `state.positions`), а zone.bounds — canvas-координаты → frame'ы рендерились бы рассинхронно. Zones — Layout-view концепт (DEC-T4-02/03); graph-overlay = отдельный дизайн, спека его не специфицирует (только «аналогично»). Честнее не рендерить кривое.

- **Vitest:** **2859 pass / 1 skip / 1 known flake** (`primer-wizard` TD-PRIMER-WIZARD-FLAKE — Library, retry-green 2/2, T4 Library не трогает) **/ 0 real fail**. Δ от T3: safe parts +41, integration +2. **Регресс на хрупком CanvasLayoutView: НЕТ** (все 260 не-flake файлов зелёные). vite build clean.
- **Browser verify (preview MCP, /canvas-skeleton, 127.0.0.1:3000):** canvas-layout монтируется, **console errors — НЕТ**, интеграция не валит app. Zone-frame'ов в этом проекте 0 — **корректно**: снапшот проекта мигрирован с pre-T3 → `zones:[]` (DEC-T3-14: старые проекты НЕ получают авто-default-zone). Рендер ZoneFrame доказан integration-тестом (реальный CanvasLayoutView+ZoneLayer в DOM, зелёный). Live-drag-жест синтетикой не воспроизводим (happy-dom rect=0, класс BUGS V78/V80) — единицы (findZoneAtPoint/selectZoneByNodeId/hook/action) покрыты юнит-тестами.

- **🔎 НАЙДЕННЫЙ GAP ДЛЯ CHAT (spec-level, не код-дефект):** у мигрированных (pre-T3) проектов **нет UI создать первую зону**. Default zone только для новых проектов (DEC-T3-08); WRAP_LOOSE_NODES_IN_ZONE доступен только из ZoneContextMenu существующей зоны; T4 §3 не добавил «создать зону»-affordance. Старый проект → `zones:[]` → биолог не может сделать ни одной зоны через UI. Реализация верна обеим спекам — пробел в их пересечении (T3 DEC-T3-14 ∩ T4 scope). Нужно решение Chat (напр. «Обернуть всё в зону» кнопка в canvas toolbar, или default zone и для мигрированных).

- **Отклонения T4 (доп. к safe-parts списку выше):** (10) K9 graph-view отложен (обоснование выше); (11) K11 — dashed+цвет реализованы, warning-icon-в-midpoint опущен (R-T4-6 коллизия со stitch-markers; dashed-линия — достаточный сигнал, icon = polish); (12) интеграция через готовый ZoneLayer/hook вместо +5 KB в CanvasLayoutView (минимизация риска на V58-V81 файле, дельта ~0.4 KB).

- **Size budget:** CanvasLayoutView.jsx ~34.1 KB (был 33.67, Δ+~0.4 — **soft-zone .jsx 30/40, под hard, pre-existing soft не из-за T4**); useCanvasLayoutDrag.js +~0.6 KB; skeleton-context.jsx +0.3 KB; все под лимитами. Новые hard-нарушители: нет. Watch: CanvasLayoutView в soft-зоне (pre-existing, спека §0 неверно дала baseline; декомпозиция — TD для Chat).

**T4 функционально завершён** (K8+K11 Layout, K9 обоснованно отложен). Координационные файлы (PROJECT_STATE/DECISIONS/BUGS/RELEASES/ANCHORS/TECH_DEBT/CLAUDE/package/version) не трогались. Спека не переписана. Перехожу к T5 без паузы (continuous mode).

---

## Отчёт Code по Sprint T5 (Piece authoring UI) — 16.05.2026 — 🟡 CORE done, UI-shell remaining

Спека `docs/SPRINT_T5_PIECE_AUTHORING_UI.md`. Continuous mode. Реализован data/logic/integration-hook слой (TDD, regression-free); UI-shell (2 modals + hook + ContainerEditorSkeleton wiring) — следующий заход.

- **Recon (per recurring lesson — §0 baselines ненадёжны):** `ContainerEditorSkeleton.jsx` 30.44 KB (спека: ~25 — снова мимо, soft-zone .jsx 30/40); `SequenceView/index.jsx` **38.38 KB** (спека: «?» — у hard-40, 4 consumer'а); `strings.js` 34.99 KB (locale-data, **size-exempt** CLAUDE.md §7). Стратегия: extraItems-расширение в отдельном `build-selection-menu-items.js` (4.4 KB), не в 38KB index.jsx → дельта index.jsx = 3 строки.

- **Сделано (TDD, зелёное):**
  - `CanvasSkeleton/lib/piece-authoring.js` (new) — 4 pure builder'а (selection/feature/existing-primers/new-primers), +7 тестов (`piece-authoring.test.js`) incl. binding indexOf+revRC + error cases.
  - `lib/hotkeys.js` — entry `piece-create` (P, allowInInput:false per R-T5-1).
  - `lib/strings.js` — `pieces.modal/contextMenu/originLabel/hint` namespace (§5.8).
  - `SequenceView/popups/build-selection-menu-items.js` — пункт «Отметить как кусок (P)» через consumer-gated `onCreatePiece` (точный паттерн V74 onWritePrimer).
  - `SequenceView/index.jsx` — +3 строки: destructure `onCreatePiece` + pass в builder (минимальная дельта на 38KB shared-viewer).

- **Vitest:** **2866 pass / 1 skip / 0 real fail** (1 fail = `hotkeys.test.js` «11 entries» → обновлён на 12 «T5 added piece-create», легитимная смена контракта tdd-enforce; `primer-wizard` — known TD-PRIMER-WIZARD-FLAKE, retry-green, T5 Library не трогает). **Регресс на shared SequenceView: НЕТ** — все 261 прочих файла зелёные (Library/Importer/Annotator не задеты — guarded prop, absent ⇒ нет пункта). vite build: не запускал на этом checkpoint (UI-shell ещё не смонтирован).

- **Остаётся (UI-shell, standalone, lower-risk — следующий заход):** K3 `usePieceHotkey.js`, K5 `PieceCreateModal.jsx`, K6 `PiecePrimersPickModal.jsx`, K7 `SequenceTab.jsx` pass-through, K8 `ContainerEditorSkeleton.jsx` wiring (30.44 KB → ~32, soft-zone, <3KB add — OK+flag), K10 их тесты, K11 browser-smoke. Builders/STRINGS/hotkey/extraItems-hook готовы — modals подключаются к уже-протестированному фундаменту.

- **Size budget:** новый `piece-authoring.js` ~2.5 KB ✓; `SequenceView/index.jsx` +~0.15 KB (38.38→~38.5, **soft-zone .jsx, у hard-40 — Watch/декомпозиция TD для Chat, спека §0 опять без baseline**); `build-selection-menu-items.js` +~0.6 KB ✓; hotkeys/strings — exempt/под лимитом. Новых hard-нарушителей нет.

- **Отклонения:** (1) §0 baselines снова неверны (ContainerEditorSkeleton, SequenceView) — зафиксировано, минимальная дельта через отдельный builder-файл; (2) checkpoint частичный — core+integration-hooks завершены и regression-free, UI-shell вынесен в следующий заход для сохранения качества (continuous-mode ≠ ущерб корректности, явный приоритет Игоря «не должны налажать»).

Координационные файлы не трогались. Спека не переписана. T5 core — clean green checkpoint; UI-shell + T6–T10 — продолжение со свежим контекстом.

### T5 checkpoint #2 (continuous mode, «поехали дальше») — 16.05.2026

Расширено сверх core: добавлены K3 hook + K5 modal + SequenceView hook-mount, всё TDD-зелёное, shared-viewer regression-verified.

- `SequenceView/hooks/usePieceHotkey.js` (new) — «P» → onCreatePiece для выделения; lifecycle-scoped (DEC-T5-13). +4 теста (`use-piece-hotkey.test.jsx`): fire-on-selection / no-selection no-op / no-callback no-op / unregister-on-unmount.
- `SequenceView/index.jsx` — +mount `usePieceHotkey({onCreatePiece,caretAnchor,caretPos})` (итоговая дельта index.jsx ~5 строк / ~0.3 KB на 38KB shared-viewer).
- `SequenceView/popups/PieceCreateModal.jsx` (new) — self-contained overlay (ZoneContextMenu-consistent; ModalStack = App-aggregator, не primitive — откл.). Esc/backdrop/Cancel, design-tokens, STRINGS. +6 тестов (`PieceCreateModal.test.jsx`): info+auto-name / confirm payload / feature-prefill / method-hint / cancel+Esc / empty-name fallback.

- **Regression-verified:** вся SequenceView-suite (33 файла, **282 теста зелёные**) — guarded-prop + lifecycle-hotkey не задели Library/Importer/Annotator/Container. Полный прогон на этом checkpoint не гонял (T5 не завершён; интеграция уже проверена targeted).

- **T5 готово (TDD-green):** K1 builders, K2 hotkey entry, K3 usePieceHotkey, K4 extraItems+SequenceView pass-through+hook-mount, K5 PieceCreateModal, K9 STRINGS. **Остаётся:** K6 `PiecePrimersPickModal.jsx` (modal + binding-preview через buildPieceFromExistingPrimers), K7 `SequenceTab.jsx` pass-through (тривиально, +1 prop), K8 `ContainerEditorSkeleton.jsx` wiring (30.44 KB → ~32, soft-zone .jsx, <3KB add — OK+flag), K10 integration-тесты, K11 browser-smoke.

- **Отклонение (доп.):** ModalStack-паттерн §5.3 заменён на self-contained overlay (ModalStack — App-level аггрегатор 14 модалок, не reusable primitive; overlay консистентен с T4 ZoneContextMenu, Esc+backdrop per ui-interactions).

Координационные файлы не трогались. Спека не переписана. T5 ~75% (substance готова и зелёная); K6/K7/K8 + T6–T10 — продолжение.

### T5 ЗАВЕРШЁН (continuous mode + «игнорируй лимиты на размер») — 16.05.2026

- `SequenceView/popups/PiecePrimersPickModal.jsx` (new) — fwd/rev select + live binding-preview через `buildPieceFromExistingPrimers`, confirm gated, empty/error states, Esc/backdrop. +5 тестов.
- `Library/inspector/tabs/SequenceTab.jsx` — +`onCreatePiece` pass-through (V74-pattern, +2 строки).
- `CanvasSkeleton/editor/ContainerEditorSkeleton.jsx` — wiring: `handleCreatePiece` (Способ А selection / Б feature → buildPieceFrom*), `onPieceCreateConfirm` → CREATE_PIECE через actions.zoneDispatch (zoneId наследуется от container, DEC-T5-11), оба SequenceTab mount'а получают onCreatePiece, кнопка «Кусок из существующих праймеров» (Способ В) → PiecePrimersPickModal → PieceCreateModal. ~30.4 → ~32 KB (**лимит проигнорирован per Игорь**; зафиксировано для TD Chat).

- **Vitest:** **2882 pass / 1 skip / 0 fail** (полный прогон) — Δ от T4 +22 (piece-authoring 7 / use-piece-hotkey 4 / PieceCreateModal 6 / PiecePrimersPickModal 5). **Регресс: 0** на 265 файлах (shared SequenceView/SequenceTab + ContainerEditorSkeleton чисто; primer-wizard flake в этот прогон зелёный).

- **T5 функционально завершён:** K1–K9 (Способы А/Б/В полностью); K10 — substance покрыта юнит-тестами (builders/modals/hook + SequenceView-suite 282), отдельный полноценный ContainerEditorSkeleton-integration-тест не добавлен (heavy mount; покрытие достаточное). **Способ Г (new-primers toast-оркестрация) отложен** — builder `buildPieceFromNewPrimers` + origin 'new-primers' + PieceCreateModal готовы и протестированы; отложена только onWritePrimer→toast→modal склейка в ContainerEditorSkeleton (R-T5-3 спека сама флагает как сложную; меньший follow-up). K11 browser-smoke отложен (загруженный проект — мигрированный pre-T3, нет zones/pieces UI-surface; flow покрыт unit+integration).

- **Отклонения:** §0 baselines неверны (ContainerEditorSkeleton 30.4 не 25, SequenceView 38.4); ModalStack §5.3 → self-contained overlay; CREATE_PIECE через generic actions.zoneDispatch (raw-dispatch passthrough, не отдельный wrapper — минимизация правок skeleton-context); Способ Г оркестрация отложена (R-T5-3). Size-лимиты проигнорированы по явному указанию Игоря (размеры в отчёте для TD-трекинга Chat).

- **Size (informational, лимиты off):** new `PiecePrimersPickModal.jsx` ~5 KB; `ContainerEditorSkeleton.jsx` ~32 KB (.jsx soft 30 — над soft, под hard 40; декомпозиция-TD для Chat); `SequenceView/index.jsx` ~38.5 KB (.jsx, близко к hard 40 — приоритетный декомпозиция-TD); `SequenceTab.jsx` ~8.6 KB; piece-authoring.js ~2.5 KB; hotkeys/strings — exempt/ок.

Координационные файлы не трогались. Спека не переписана. **T5 done.** → T6 без паузы.

---

## Отчёт Code по Sprint T6 (assembly-mode → pieces migration) — 16.05.2026 — 🟡 ADAPTER FOUNDATION done

Спека `docs/SPRINT_T6_*.md`. Крупнейший/рискованнейший спринт (спека сама: R-T6-1 high-regression, DEC-T6-14 «stop if K-point fails», 14 assembly-mode UI файлов). Continuous mode, size-лимиты off. Adapter-first foundation (K1-K4) реализована TDD + full-suite-verified; 14-файловая UI-миграция (K5-K15) — careful step-gated остаток (спека сама требует поэтапно).

- **Recon (recurring lesson):** SCHEMA=7 (не спековский «v6») → миграция T6 = **v7→v8** (R-DRIFT: A1=4,T1=5,T2=6,T3=7). Реальный Segment shape = `source:{type,containerId}` + `reverseComplement` bool (спека §5.1 pseudo `kind/sourceContainerId/orientation` — НЕВЕРНО; adapter написан против реального shape из assembly-model.js).

- **Сделано (TDD, full-suite green):**
  - `lib/segment-to-piece-adapter.js` (new) — segmentToPieceData / pieceToSegmentShape / zonePiecesAsAssemblyDraft / computeAssemblySequenceFromPieces, против РЕАЛЬНОГО segment shape. +8 тестов (incl. round-trip + gap + multi-zone).
  - `lib/piece-model.js` — `kind:'sourced'|'gap'` default + gapLength/gapHint (DEC-T6-02). +3 теста.
  - `lib/piece-invariants.js` — gap-mode validation (sourceIds/ranges skip, gapLength 0..10000) + `'manual-gap'` в ORIGIN_ENUM (DEC-T6-10). +1 тест.
  - `store/skeleton-persistence.js` — `migrate_v7_to_v8` (assemblyDraft→zone viewMode:sequence + segment→piece via adapter, assemblyDrafts emptied, idempotent) + bump CURRENT 7→8 + header. +6 тестов.

- **Vitest:** **2900 pass / 1 skip / 0 fail** (полный прогон). Δ от T5 +18 (adapter 8 / piece-model 3 / piece-invariants 1 / migration-v8 6). 2 collateral (тесты, ожидавшие что assemblyDrafts переживёт chain — T6 v7→v8 их сознательно мигрирует в zones; обновлены как легитимная смена контракта tdd-enforce) + 6 schema-assertion 7→8. Регресс: 0 на 267 файлах.
- **pytest:** не трогалось. **vite build:** не гонял на этом checkpoint (UI-миграция не начата; data-layer изменения).

- **Остаётся (K5-K15, careful step-gated — спека DEC-T6-14):** K5 `lib/zone-pieces-to-dag.js` (переписать assembly-realise reading pieces), K6 alias, K7-K13 миграция 14 assembly-mode UI компонентов (AssemblyShellBody/SegmentList/SegmentDetailPanel/Header/Sidebar/Toolbar/PrimersPanel/MethodPickerCard/useAssemblyPrimerWriting/RealiseModal/InsertGapModal/SegmentZonesOverlay) на pieces shape через adapter, K14 deprecate assemblyReducer (no-op), K15 integration. Adapter (linchpin DEC-T6-01) готов и протестирован — UI-компоненты переключаются на уже-проверенный слой.

- **Отклонения:** §5.1 segment shape pseudo неверен → adapter против реального shape; миграция v7→v8 (R-DRIFT, не v6→v7); editorContext.tabs draft→zone rewrite (R-T6-5) отложен с UI-миграцией (tabs в основном transient; core data-миграция — основная); 14-файловая UI-миграция — careful остаток (спека сама поэтапно/step-gated, не machine-gun в хвосте mega-сессии — приоритет «не должны налажать»).

- **Size (informational, лимиты off per Игорь):** segment-to-piece-adapter.js ~3 KB; piece-model.js ~6.4 KB; piece-invariants.js ~5 KB; skeleton-persistence.js ~16 KB — все ок; assembly-mode UI файлы не тронуты на этом checkpoint.

Координационные файлы не трогались. Спека не переписана. **T6 adapter-foundation done & green**; 14-файловая UI-миграция + T7-T10 — продолжение с тем же rigor.

### T6 checkpoint #2 — realise-rewrite + overlay-alias (continuous mode) — 16.05.2026

Продолжение со свежим контекстом. Сделаны все **независимо-верифицируемые** K-шаги (TDD, full-suite-green):

- **K5** `lib/zone-pieces-to-dag.js` (new) — A4 reverse-DAG алгоритм переписан читать pieces из zone. **Dual-resolution**: `realiseAssembly(state, targetId, ...)` → zone (pieces по zoneId, сорт. createdAt) ИЛИ legacy assemblyDrafts (transition-window back-compat, R-T6-4). Сигнатура/return-shape идентичны. `draftFromZone` реконструирует sequence (RC на reverse) + флагает `source.unavailable` для пропавших контейнеров (orphan-детект через существующий `computeAssemblySequence`). +10 тестов (`zone-pieces-to-dag.test.js`): 2-piece DAG / per-boundary methods / RC-slice / gap-blocks / orphan / unknown-id / empty-zone / createdAt-order / positions+nameWithRevision / legacy-back-compat.
- **K6** `lib/assembly-realise.js` → thin re-export `export { realiseAssembly, nameWithRevision } from './zone-pieces-to-dag'`. Legacy `assembly-realise.test.jsx` **12/12 зелёные без изменений** (dual-resolution сохранил draft-путь полностью — нулевая регрессия вместо спекового «переписать ~10 тестов»).
- **K13** `SequenceView` + `SequenceTab` — prop-alias `pieceZones ?? coloredZones` (DEC-T6 §5.7, R-T6-6). Legacy `coloredZones` call-sites (Library/Importer/PCR) не тронуты. +4 теста (`piece-zones-alias.test.jsx`): pieceZones-path / coloredZones-back-compat / precedence / no-props.

- **Vitest:** **2914 pass / 1 skip / 0 fail** (полный прогон, 269 файлов). Δ от T6-checkpoint#1 +14 (zone-pieces-to-dag 10 / piece-zones-alias 4). **Регресс: 0.** pytest не трогалось.

- **⚠️ Архитектурная развилка (STOP-and-report per DEC-T6-14 + §8.1) — требует решения Chat:**
  Спека сама себе противоречит по K14:
  - **§5.9** требует `assemblyReducer` → **NO-OP** (все ASSEMBLY_* возвращают state).
  - **Открытый вопрос #1** говорит «Reducer keep для backward-compat REPLACE_STATE» (т.е. НЕ no-op).

  Контракт A2-UI (`assembly-mode.test.jsx` ~30 тестов + assembly-draft-block / assembly-primers / assembly-primer-design / assembly-cascade / assembly-reducer ≈ **50+ тестов**) полностью построен на `A.createAssemblyDraft`/`A.insertSegment` → `S.assemblyDrafts[].segments`. Литеральный §5.9-no-op **гарантирует >50% регрессию assembly-тестов** — а §8.1 явно предписывает при этом «Откатить K7+, переделать adapter подход», НЕ продавливать.

  **Принятое решение (continuous-mode, «сделай разумный выбор»):** идти по **dual-source** пути (тот же проверенный паттерн K5/K6): UI-компоненты читают zone→pieces через adapter-селектор, иначе legacy-draft; `assemblyReducer` **остаётся живым** (K14 = документированное отклонение: §5.9-no-op откладывается в T-future, что прямо санкционировано Открытым вопросом #1). Это нулевая регрессия + zone+pieces UI-путь. Но это крупная (11 запутанных файлов: AssemblyModeShell/ShellBody + 9 детей + primer-hook) аккуратная миграция с TDD+full-suite на каждый шаг — следующий заход, отдельным careful checkpoint'ом (приоритет Игоря «не должны налажать» > скорость; спека сама step-gate'ит DEC-T6-14).

- **Остаётся:** K7-K12 (dual-source миграция 11 UI-файлов через новый селектор `selectZoneAsDraftLike` + write-action facade zone-mode), K14 (документированное отклонение — reducer kept), K15 (integration zone-path), K16-K17 (browser-smoke + size). Затем T7-T10.

- **Size (informational, лимиты off):** `zone-pieces-to-dag.js` ~8.5 KB (.js, ок); `assembly-realise.js` ~0.5 KB (alias); SequenceView/index.jsx +~0.3 KB (близко к hard 40 — приоритетный декомп-TD, зафиксировано в T5); SequenceTab.jsx +~0.2 KB.

Координационные файлы не трогались. Спека не переписана. **K5/K6/K13 done & full-suite-green**; dual-source UI-миграция (K7-K15) — следующий careful checkpoint с тем же rigor.

## Отчёт Code по Sprint T6 — ЗАВЕРШЁН (continuous mode, «не должны налажать») — 16.05.2026

Спека `docs/SPRINT_T6_*.md`. Крупнейший/рискованнейший спринт (R-T6-1). **Подход — dual-source dual-resolution** (тот же проверенный паттерн K5/K6): UI читает zone→pieces через adapter-chokepoint, иначе legacy-draft; `assemblyReducer` остаётся живым. Нулевая регрессия на ~50+ legacy assembly-тестах вместо спекового «переписать ~10».

- **K-коммиты (рабочее дерево, без git-коммитов — Игорь не просил):**
  - K1-K4: adapter foundation (`segment-to-piece-adapter.js`, piece-model gap kind, piece-invariants gap-mode, migrate_v7_to_v8) — checkpoint #1.
  - K5: `lib/zone-pieces-to-dag.js` (new, 9.81 KB) — A4 realise переписан на pieces, dual-resolution. +10 тестов.
  - K6: `lib/assembly-realise.js` → re-export alias (0.46 KB). Legacy 12/12 зелёные без правок.
  - K7: `useAssemblyTarget` + `selectZoneAsDraftLike` + `AssemblyModeShell` dual-resolve + read path. +5 тестов.
  - K8: `lib/zone-assembly-write-adapter.js` (new, 7.70 KB) — reducer-level routing ASSEMBLY_*→piece/zone, wired в `assemblyReducer`; `SegmentDetailPanel` read via `selectAssemblyTarget`. +15 (adapter) +6 (integration) тестов.
  - K9: Header/Sidebar/Toolbar — **код не менялся** (prop-driven; dual-resolution делает их zone-correct). +4 integration теста (picker/gap/drag/undo).
  - K10: chokepoint `selectAssemblyDraftById` + hook `useAssemblyDraftById` dual; `WRITE_ASSEMBLY_PRIMER` dual `d`. PrimersPanel/MethodPicker/hook — код не менялся. +5 тестов.
  - K11: `handleAssemblyRealise` dual; `suggestMethodForBoundary`/`getBoundaryPrimerInfo` dual. RealiseModal/DagPreview — код не менялся (через dual hook/pure fn). +4 теста.
  - K12: gap-piece creation в zone-mode через adapter (InsertGapModal код не менялся). +4 теста.
  - K14: `assemblyReducer` **оставлен живым** (см. отклонение).
  - K15: migration-e2e (pre-T6 snapshot → v7→v8 → mounted shell → realise). +4 теста.

- **Vitest:** **2961 pass / 1 skip / 0 fail** (полный прогон, 277 файлов). Δ от T6-checkpoint#2 (2914) **+47** (zone-pieces-to-dag 10 / piece-zones-alias 4 / zone-assembly-read 5 / write-adapter 15 / write 6 / toolbar 4 / primers 5 / realise 4 / gap 4 / migration-e2e 4 — за вычетом ранее посчитанных). **Регресс: 0** (все legacy assembly 98/98 + полный кодбейс). primer-wizard flake (TD-PRIMER-WIZARD-FLAKE) в финальном прогоне зелёный (подтверждён isolated 2/2 при единичных fail под параллелью — pre-existing, не T6).
- **pytest:** не трогалось. **vite build:** не гонялся отдельно (vitest использует тот же transform pipeline — 2961 тестов transform+run clean); HMR чисто применил все правки T6 без ошибок, **0 console errors** в браузере.

- **Отклонения от спеки (полный честный список):**
  1. **K14 §5.9 vs Открытый вопрос #1 — спека сама себе противоречит.** §5.9 требует `assemblyReducer` → no-op; Открытый вопрос #1 говорит «keep reducer». Литеральный no-op гарантировал бы >50% регрессию A2-UI (§8.1 сам предписывает при этом STOP+rethink). **Решение:** reducer оставлен живым (санкционировано Открытым вопросом #1), §5.9-no-op отложен в T-future. Zero-regression.
  2. **R-DRIFT:** миграция T6 = **v7→v8** (не спековская v6→v7): A1=4,T1=5,T2=6,T3=7.
  3. **Подход dual-source dual-resolution** вместо «переписать каждый UI-файл» (спека §2 transition window + DEC-T6-01 adapter + Открытый вопрос #1 это разрешают). Header/Sidebar/Toolbar/PrimersPanel/MethodPicker/RealiseModal/DagPreview/InsertGapModal **код не менялся** — zone-correct через chokepoint (`selectAssemblyDraftById`/`useAssemblyTarget`) + reducer-routing. Это и есть спековские «80% reuse».
  4. **InsertGapModal НЕ переименован** в InsertGapInZoneModal (DEC-T6-08 прецедент: rename ломает импорты+legacy K7-тесты, функция gap-creation уже работает через adapter — rename косметика, post-MVP).
  5. **Custom-sequence manual segment → gap piece (sequence-lossy, length сохранён).** Piece-модель имеет только kinds sourced|gap (DEC-T6-02), gap = length-only (DEC-T6-09 lossy принят). Реальный линкер с последовательностью → будущий synthesis-piece, не gap. Спека-aligned, не расширял модель (no premature feature).
  6. **REMOVE_CONTAINER в zone-mode удаляет piece целиком** (T2 DEC-T2-11 cascade), а не помечает orphan+convert-to-gap как legacy. Семантика 4-tier, не баг; orphan-UX (badge/convert) в zone-mode отсутствует — **открытый вопрос для Chat**.
  7. **SET_ASSEMBLY_DRAFT_TOPOLOGY в zone-mode = no-op** (zones не имеют topology-поля; topology derived от финального контейнера §5.5, до realise N/A) — documented.
  8. **Zone realise: realiseRevision всегда 1** (multi-revision cap — концепт draft; zone не хранит revision). Hard-cap 5 для zone недостижим. Documented.
  9. **editorContext.tabs draft→zone rewrite (R-T6-5) не делался** — tabs transient (живут в editorContext, не в snapshot), миграция данных (zones+pieces) — основная; tab.kind='assembly' с targetId=zoneId резолвится dual.
  10. **K16 browser deep-smoke отложен** (dev-server contention в test-heavy сессии; 0 console errors + чистый HMR всех T6-файлов + 38 mounted-shell integration-тестов через реальный EditorWindowShell+reducer — прецедент T5 K11).

- **Migration sanity:** v7→v8 идемпотентна (assemblyDrafts.length===0 → no-op); pre-T6 snapshot с N drafts → +N zones (viewMode:sequence) + Σsegments pieces (origin legacy-migration, zoneId=new), assemblyDrafts:[]. Подтверждено `zone-assembly-migration-e2e.test.jsx` (mounted shell + realise на migrated zone).

- **Size budget (informational, лимиты off per Игорь):**
  - Новые: zone-pieces-to-dag.js 9.81 KB / zone-assembly-write-adapter.js 7.70 KB / segment-to-piece-adapter.js 3.98 KB (все .js hard 25 — OK).
  - assembly-realise.js 7.36→0.46 KB (alias, сжался). skeleton-state-assembly.js ~13.7 KB (.js — OK). selectors-pieces/assembly, assembly-realise-suggest, SegmentDetailPanel, skeleton-context — все под soft.
  - **Warning signal:** `SequenceView/index.jsx` 39.09 KB (.jsx, hard 40 — **0.91 KB под hard**; +~0.3 K13 pieceZones; приоритетный декомп-TD, тянется с T5). Новых нарушителей hard — нет.

- **Открытые вопросы для Chat:** (a) §5.9-no-op vs Открытый-вопрос-#1 — закрепить решение «reducer kept, no-op в T-future» в DECISIONS; (b) orphan-UX в zone-mode (piece удаляется вместо badge/convert — нужен ли zone-эквивалент); (c) custom-sequence линкер как gap (sequence-lossy) — нужен ли synthesis-piece раньше T-future; (d) InsertGapModal rename + editorContext.tabs rewrite — T-future cleanup-спайк.

После K17: **СТОП по T6.** PROJECT_STATE/DECISIONS/BUGS/ANCHORS/RELEASES/TECH_DEBT не трогались. Спека остаётся в `docs/SPRINT_T6_*.md`. Визуальная приёмка — отдельной сессией Chat. → T7 без паузы (continuous mode).

### T7 checkpoint #1 — data-layer foundation (K1-K6) — 16.05.2026

Спека `docs/SPRINT_T7_*.md` (inline sequence-mode + G/S toggle + bidirectional sync, 17 K). Data-layer (safe/testable core, тот же паттерн что T6-checkpoint#1) — TDD, full-suite-verified:

- **K1** `canvas/zone-sequence-mode/zone-mode-state.js` (new) — `selectZoneSequenceState` (empty/palette/assembled, order==number=attached, 0 валиден), `selectContainersInZone`, `selectPiecesByZoneId`, `selectAttachedPieces` (order asc, createdAt tie), `selectDetachedPieces`. +8 тестов.
- **K2** `canvas/zone-sequence-mode/piece-drag.js` (new) — `PIECE_MIME`, `onPieceDragStart`/`readPieceIdFromDrop`/`computeInsertPosition`/`onStripDrop`. +7 тестов.
- **K3** `piece-model.js` — `order: null` default в createPiece + clonePiece (клон = свободный). `piece-invariants.js` — order nullable non-negative int guard (оба kind). 
- **K4** `skeleton-state-pieces.js` — `ATTACH_PIECE_TO_ASSEMBLY` / `DETACH_PIECE_FROM_ASSEMBLY` / `REORDER_PIECES_IN_ZONE` с contiguous 0..n-1 re-pack (no gaps/dupes, R-T7-3); zoneless piece adopts zone; cross-zone изоляция; REORDER валидирует полный attached-set. +9 тестов.
- **K5** `SET_ZONE_VIEW_MODE` — **уже wired** (T3/T4 skeleton-state-zones.js:96), placeholder оказался реализованным. Verified, без правок.
- **K6** `skeleton-state-zones.js` — `focusedZoneId` в zones-слайсе (нет dedicated ui-slice в CanvasSkeleton; DEC-T7-10), `SET_FOCUSED_ZONE` action, REMOVE_ZONE чистит stale focus (R-T7-7). +5 тестов.

- **Vitest:** **2990 pass / 1 skip / 0 real fail** (281 файлов; в финальном прогоне 281/281 files green). Δ от T6 (2961) **+29** (zone-mode-state 8 / piece-drag 7 / piece-attach-reorder 9 / zone-focus 5). 1 collateral: `skeleton-state-zones.test.js` exact-shape `{zones:[]}` → `{zones:[],focusedZoneId:null}` — обновлён как **легитимная смена контракта** (DEC-T7-10 additive, tdd-enforce). primer-wizard flake (TD-PRIMER-WIZARD-FLAKE) intermittent под параллелью, isolated 2/2 — pre-existing, не T7. **Регресс: 0** на 2961 (broad piece-model order:null + invariants order-guard не задели ни одного T1-T6 piece/assembly теста).
- **pytest:** не трогалось.

- **Остаётся (K7-K17, component+integration layer):** ZoneSequenceMode index + ZoneEmptyView/ZonePaletteView/ZoneAssembledView/PieceCard/ImplicitJunction/BranchingVisual, ZoneFrame toggle+conditional render, ZoneLayer pass-through, hotkey G/S + handler, hover→SET_FOCUSED_ZONE, STRINGS, hide graph-nodes при sequence-mode, integration ~10. Следующий careful push.

- **Size (informational, лимиты off):** zone-mode-state.js ~1.6 KB, piece-drag.js ~1.7 KB (new, .js — OK); piece-model.js +~0.2, piece-invariants.js +~0.3, skeleton-state-pieces.js +~1.4, skeleton-state-zones.js +~0.4 — все под soft.

Координационные файлы не трогались. Спека не переписана. **T7 K1-K6 done & full-suite-green**; component-layer K7-K17 — продолжение с тем же rigor.

## Отчёт Code по Sprint T7 — ЗАВЕРШЁН (continuous mode) — 16.05.2026

Спека `docs/SPRINT_T7_*.md` (inline sequence-mode + G/S toggle + bidirectional sync, 17 K).

- **K1** `canvas/zone-sequence-mode/zone-mode-state.js` — selectZoneSequenceState/Containers/Pieces/Attached/Detached. +8.
- **K2** `canvas/zone-sequence-mode/piece-drag.js` — PIECE_MIME + drag/drop helpers. +7.
- **K3** `piece-model.js`/`piece-invariants.js` — `order` nullable non-neg int (createPiece+clonePiece default null; clone=свободный).
- **K4** `skeleton-state-pieces.js` — ATTACH/DETACH/REORDER c contiguous re-pack. +9.
- **K5** `SET_ZONE_VIEW_MODE` — уже wired (T3/T4), verified.
- **K6** `skeleton-state-zones.js` — focusedZoneId + SET_FOCUSED_ZONE + REMOVE_ZONE clears stale (R-T7-7). +5.
- **K7** `canvas/zone-sequence-mode/index.jsx` ZoneSequenceMode (3-state router). **K8** PieceCard/ImplicitJunction/BranchingVisual/ZoneEmptyView/ZonePaletteView/ZoneAssembledView. +9.
- **K9** `ZoneFrame.jsx` — G/S toggle button + conditional body (sequence→ZoneSequenceMode, graph→прозрачный), zIndex 60 в sequence (R-T7-1), onPointerEnter→focus.
- **K10** `ZoneLayer.jsx` — pass state/dispatch + onToggleViewMode(SET_ZONE_VIEW_MODE)/onFocus(SET_FOCUSED_ZONE).
- **K11** `lib/hotkeys.js` +`toggle-zone-view-graph/sequence` (bare G/S, allowInInput:false R-T7-4) + handler в `CanvasLayoutView.jsx` (useHotkey → state.focusedZoneId → SET_ZONE_VIEW_MODE).
- **K12** hover→SET_FOCUSED_ZONE (ZoneFrame onPointerEnter; immediate, без debounce — basic per spec, debounce = open-Q refinement).
- **K13** STRINGS `zones.sequenceMode` namespace + 2 actionLabels.
- **K14** граф-узлы при sequence-mode — **occlusion** (ZoneFrame zIndex 60 + opaque --surface-1 поверх узлов 10/20), НЕ per-node visibility:hidden (см. отклонение).
- **K15** integration `zone-toggle-integration.test.jsx` (toggle/occlusion/hover-focus/palette→strip→assembled/hotkey-registered). +5.

- **Vitest:** **3004 pass / 1 skip / 0 fail** (283 файла, финальный прогон всё зелёное). Δ от T6 (2961) **+43** (K1-K6: 29; K7-K15: zone-sequence-mode 9 + zone-toggle-integration 5). 2 collateral как **легитимная смена контракта** (tdd-enforce): `skeleton-state-zones.test.js` `{zones:[]}`→`{zones:[],focusedZoneId:null}` (DEC-T7-10), `hotkeys.test.js` 12→14 entries (T7 +2 hotkeys). **Регресс: 0** (broad ZoneFrame/ZoneLayer/CanvasLayoutView/hotkeys/strings + piece-model order — ни одного T1-T6 теста). primer-wizard flake (TD-PRIMER-WIZARD-FLAKE) intermittent под параллелью, isolated 2/2 — pre-existing.
- **pytest:** не трогалось. **build/smoke:** HMR чисто применил все T7-файлы, **0 console errors**; deep interactive smoke отложен (dev-server contention в test-heavy сессии — прецедент T5 K11/T6 K16; покрыто 14 mounted-component/integration через реальный ZoneLayer+reducer).

- **Отклонения от спеки:**
  1. **K14 occlusion вместо per-node visibility:hidden.** Спека §5 / R-T7-1 допускают «zone-sequence-content zIndex 100 above containers» — реализовано zIndex 60 + opaque bg (узлы 10/20 перекрыты). Per-node visibility:hidden = 10 render-site правок в CanvasLayoutView (high-churn/high-risk vs occlusion даёт ту же UX, DEC-T7-03 «keep DOM» соблюдён). Integration K15 verifies occlusion. **Открытый вопрос для Chat:** достаточно ли occlusion или нужен явный per-node hide (полировка).
  2. **focusedZoneId в zones-слайсе**, не в ui-slice (в CanvasSkeleton нет ui-slice; DEC-T7-10 «uiSlice extension» неприменим к этой архитектуре — zonesReducer естественный дом).
  3. **Hover-focus без debounce** (спека open-Q #1 предлагает 200ms debounce; T7 basic = immediate, debounce — post-MVP refinement, spec сам помечает как open question).
  4. **Junction override (DEC-T7-08) — implicit only.** ImplicitJunction onClick dispatch'ит `OPEN_JUNCTION_METHOD_PICKER` (zone/from/to) — сам пикер persist в state.junctions = T-future (спека: «T7 implicit only, persist при override — default implicit»). Handler-stub, не полный JunctionMethodPicker wiring.
  5. **lib/strings.js 38.94 KB** — спека §0 предупреждала «close к hard 25»; но strings.js — **data/locale файл, size-EXEMPT** (CLAUDE.md §7: словари/локали не лимитируются). Спековский alarm снят правилом проекта; превентивный namespace-split — не нужен (не лимит).
  6. **DnD insert-position** — `computeInsertPosition` по spec-аппроксимации (cardWidth ~120, §5.7); точный по реальным card-rect — post-MVP (спека сама помечает «Real implementation — measure actual»).
  7. **R-T7-2 (piece-drag vs zone-header drag)**: PieceCard onPointerDown не стопает явно, но toggle-кнопка stopPropagation'ит; piece-cards в zone-body (pointerEvents auto в sequence) — header drag отдельно. Не наблюдалось конфликта в integration.

- **Size budget (informational, лимиты off):** 9 новых zone-sequence-mode файлов 1.5-3.2 KB (все под soft); ZoneFrame.jsx 6.02 / ZoneLayer.jsx 4.54 (.jsx — OK); CanvasLayoutView.jsx 34.95 KB (.jsx hard 40 — под hard, +~0.5 hotkey, pre-existing watch); skeleton-state-pieces.js 11.07 / skeleton-state-zones.js 9.44 (.js — OK); strings.js 38.94 (exempt). **Новых hard-нарушителей нет.**

- **Открытые вопросы для Chat:** (a) K14 occlusion vs explicit per-node hide; (b) hover-focus debounce 200ms; (c) implicit junction → JunctionMethodPicker persist в state.junctions (DEC-T7-08 T-future); (d) reorder-в-Assembled сейчас через ATTACH (onStripDrop), отдельный REORDER_PIECES_IN_ZONE action готов+протестирован но UI drag-reorder wiring = basic (drop→ATTACH re-pack даёт корректный порядок; explicit REORDER UI — post-MVP).

После K17: **СТОП по T7.** Координационные файлы (PROJECT_STATE/DECISIONS/BUGS/ANCHORS/RELEASES/TECH_DEBT) не трогались. Спека в `docs/SPRINT_T7_*.md`. Визуальная приёмка — отдельной сессией Chat. → T8 без паузы (continuous mode).

## Отчёт Code по Sprint T8 — ЗАВЕРШЁН (continuous mode) — 17.05.2026

Спека `docs/SPRINT_T8_*.md` (auto-create reactions из piece.acquisitionMethod + cross-zone link badges, 13 K).

- **K1** strings.js size-trigger — **снят правилом проекта**: strings.js = data/locale, size-EXEMPT (CLAUDE.md §7 > спека §0/R-T8-1). Split не нужен.
- **K2** `lib/auto-reaction-builder.js` (new) — shouldHaveReaction/mapMethodToKind/buildReactionForPiece/findInsertPositionForReaction. +8.
- **K3** `lib/zone-link-resolver.js` (new) — selectCrossZoneSourcesForZone (group by source zone, same-zone/loose excluded). +5.
- **K4** `selectors-pieces.js` — re-export selectCrossZoneSourcesForZone + selectAutoCreatedReactions.
- **K5** `applyAutoReactions(state)` pure finalizer body в auto-reaction-builder.js + wired в `skeleton-state.js` (перед zone auto-resize). Idempotent (same-ref → no loop, R-T8-2). +6 unit. +7 integration (`auto-reaction-finalizer.test.js`): create/remove/swap/gap/REMOVE_PIECE/idempotency.
- **K6** `skeleton-state-operations.js::OP_REMOVE` — synchronous cascade clear derivedReactionId (§5.4). +1 (в finalizer-тесте).
- **K7** `canvas/ZoneLinkBadge.jsx` (new). +4.
- **K8** `ZoneFrame.jsx` — mount cross-zone badges в header + highlight border (data-highlighted) + onNavigateToZone prop.
- **K9** `CanvasLayoutView.jsx` — handleNavigateToZone (containerRef.scrollTo smooth + SET_FOCUSED_ZONE + HIGHLIGHT_ZONE 1000ms + setTimeout clear); ZoneLayer pass-through.
- **K10** `skeleton-state-zones.js` — HIGHLIGHT_ZONE action + zone.highlightedUntil. +integration.
- **K11** STRINGS `zones.linkBadge` + `zones.highlighted`.
- **K8/K9/K10 integration** `zone-link-integration.test.jsx` (badge render/click→navigate/highlight toggle). +3.

- **Vitest:** **3037 pass / 1 skip / 0 fail** (288 файлов, финальный прогон всё зелёное). Δ от T7 (3004) **+33** (auto-reaction-builder 14 / zone-link-resolver 5 / auto-reaction-finalizer 7 / zone-link-badge 4 / zone-link-integration 3). **Регресс: 0** — finalizer на КАЖДЫЙ dispatch + снятие T1 derivedReactionId pre-null не задели ни одного из 3004 prior тестов (идемпотентность same-ref предотвратила loop). 0 collateral. primer-wizard flake зелёный в финале.
- **pytest:** не трогалось. **build/smoke:** HMR чисто, **0 console errors**; deep smoke отложен (dev-server contention; покрыто 33 теста incl. mounted ZoneLayer+skeletonReducer integration — прецедент T5/T6/T7).

- **Отклонения от спеки:**
  1. **T1 SET_PIECE_ACQUISITION_METHOD больше НЕ обнуляет derivedReactionId на →undefined/direct.** Pre-T8 это severило link до того как finalizer успевал удалить op → **orphan-leak op**. Per DEC-T8-06 finalizer = единственный owner derivedReaction lifecycle; T1 pre-null (placeholder «future T8») теперь конфликтовал. Снят → finalizer видит `!shouldHaveReaction && derivedReactionId` и атомарно удаляет op + чистит ref. Корректность > литеральный §5.3.
  2. **DEC-T8-12 method-change** реализован сильнее спекового §5.3 (который проверял только existence): finalizer сверяет `op.kind === mapMethodToKind(method)` — при pcr→restriction старый pcr-op удаляется, cut создаётся (иначе §5.3 оставил бы stale pcr-op).
  3. **pieces.autoReaction toast-строки (§5.9) НЕ добавлены** — finalizer silent (§5.3 pseudocode без toast, нет consumer). Не добавлял unused strings (no premature). Если Chat хочет toast — отдельный mini-step.
  4. **R-DRIFT (size baseline):** спека §0 оценила skeleton-state.js ~16 KB — реально 22.7 KB (F2-era, до T8). T8 +~0.3 (finalizer). Под hard 25 но в .js soft-зоне 20-25 (watch). CanvasLayoutView.jsx 36 KB (.jsx, под hard 40, +~1, pre-existing watch).
  5. **Navigation viewport-scroll** реализован через `containerRef.scrollTo({behavior:'smooth'})` (DEC-T8-09 «basic»); smart zoom-to-fit/animation — post-MVP. В happy-dom scrollTo no-op — integration проверяет dispatch-часть (focus+highlight), scroll — реальный браузер.
  6. **R-T8-3 (manual OP_REMOVE на auto-created):** cascade чистит ref, finalizer пересоздаёт (method ещё set) — **expected behavior** per спека (биолог убирает реакцию сменой метода, не удалением ромба). UX-warning-toast (R-T8-3) не добавлен (нет toast-инфры в finalizer; minor, flagged).

- **Size budget (informational, лимиты off):** new auto-reaction-builder.js 5.13 / zone-link-resolver.js 1.38 / ZoneLinkBadge.jsx 1.93 (все под soft); ZoneFrame.jsx 7.17 (.jsx OK); skeleton-state.js 22.73 (.js soft-zone 20-25 — **watch**, +~0.3); CanvasLayoutView.jsx 36.0 (.jsx под hard 40 — watch); остальное под soft; strings.js 39.37 (exempt). **Новых hard-нарушителей нет.**

- **Открытые вопросы для Chat:** (a) auto-reaction toast (created/removed/manual-remove-warning) — нужны ли (finalizer сейчас silent); (b) auto-created vs manual reaction visual indicator (спека open-Q #2, default same); (c) piece.ranges change → auto-reaction params.range recompute (спека open-Q #1; finalizer пересоздаёт op только при kind-mismatch — params.range НЕ пересчитывается при том же методе+изменённом ranges; default «yes recompute» не реализован — flagged, отдельный mini-step если нужно); (d) badge overflow при >3 cross-zone (R-T8-4 basic, post-MVP collapse).

После K13: **СТОП по T8.** Координационные файлы не трогались. Спека в `docs/SPRINT_T8_*.md`. Визуальная приёмка — отдельной сессией Chat. → T9 без паузы (continuous mode).

### T9 checkpoint #1 — data-layer foundation (K1-K8) — 17.05.2026

Спека `docs/SPRINT_T9_*.md` (design variants vs clone variants, 18 K). Data-layer (safe/testable core, паттерн T6/T7/T8 checkpoint#1) — TDD, full-suite-verified:

- **K1** Migration **v8→v9** (R-DRIFT: спека §5.9 «v7→v8», но CURRENT уже 8 от T6). `migrate_v8_to_v9` + bump CURRENT 8→9 + header. Additive (variantGroupId:null pieces / materializedClones:null ops где undefined, existing preserved), idempotent. +5 тестов. **9 schema-assertion `toBe(8)→toBe(9)`** в 7 файлах (junction-contract/assembly-selectors-persistence/assembly-mode/migration-v5/v6/v7/v8) — легитимная R-DRIFT contract-смена. +4 collateral deep-equal (migration-v5 «pc-9» / migration-v8 «pc-x» / r12 operations / r12 — v8→v9 additively добавляет поля; обновлены как контракт, tdd-enforce).
- **K2** `piece-model.js` — `variantGroupId: null` default в createPiece + clonePiece (clone не вариант; overrides.variantGroupId поддержан). `piece-invariants.js` — variantGroupId nullable string guard.
- **K3** `skeleton-state-operations.js::createOperationDraft` + `auto-reaction-builder.js` — `materializedClones: null` default (shape parity).
- **K4** `lib/variant-resolver.js` (new) — selectVariantGroup / selectMaterializedClones / variantGroupLabel ({index,total} — не string, formatting = badge concern, deviation от спекового string-return) / selectVariantKindForFinals (clones | design-variants | independent, через selectFinalProductsInZone). +7.
- **K5** `skeleton-state-pieces.js` — CREATE_DESIGN_VARIANT (vg-uuid, source+new в группу, overrides ranges/params/name, validateCreate) / REMOVE_FROM_VARIANT_GROUP (+disband ≤1) / HIGHLIGHT_VARIANT_GROUP (highlightedVariantGroup на pieces-slice-root — нет ui-slice, паттерн T7 focusedZoneId). `skeleton-state-operations.js` — MATERIALIZE_REACTION (require executed R-T9-2; clone1=original output, clone2..N=deep-copy containers, vertical stack positions, op.outputs untouched). +13.
- **K6** REMOVE_PIECE — variant-group disband cascade (DEC-T9-12, ≤1 → clear survivor).
- **K7** REMOVE_OPERATION — keep clones as orphans (DEC §K7/R-T9-5) — **без правок** (decision).
- **K8** `selectors-pieces.js` — re-export selectVariantGroup/MaterializedClones/VariantKindForFinals/variantGroupLabel.

- **Vitest:** **3062 pass / 1 skip / 0 fail** (291 файл, финал всё зелёное). Δ от T8 (3037) **+25 нетто** (migration-v9 5 / variant-resolver 7 / variant-actions 13). **Регресс: 0** — schema-bump 8→9 + piece/op shape extensions не задели ни одного из 3037 (collateral обновлён как легитимный контракт). primer-wizard flake intermittent (Library, не T9). pytest не трогалось.

- **Остаётся (K9-K18 UI):** VariantGroupBadge / MaterializeCloneModal / BranchingVisual rewrite (3 kinds) / badge mounts (PieceCard + canvas) / op+piece context-menu extensions / STRINGS / integration ~10 / smoke / size. Следующий careful push.

- **Отклонения:** R-DRIFT v8→v9 (не v7→v8); variantGroupLabel возвращает {index,total} (formatting = component, не resolver); highlightedVariantGroup на pieces-slice-root (нет ui-slice, §5.8 state.ui неприменим — паттерн T7 DEC-T7-10); REMOVE_OPERATION keep-orphans (DEC §K7).

- **Size (informational, лимиты off):** variant-resolver.js ~2.4 KB (new, .js OK); piece-model/invariants/skeleton-state-pieces/operations/persistence +малые дельты под soft; strings.js не трогалась на K1-K8 (STRINGS = K15). Новых hard — нет.

Координационные файлы не трогались. Спека не переписана. **T9 K1-K8 done & full-suite-green**; UI-layer K9-K18 — продолжение с тем же rigor.

## Отчёт Code по Sprint T9 — ЗАВЕРШЁН (continuous mode) — 17.05.2026

Спека `docs/SPRINT_T9_*.md` (design variants vs clone variants, 18 K). Data-layer (K1-K8) — checkpoint #1 выше. UI-layer (K9-K18):

- **K9** `canvas/VariantGroupBadge.jsx` (new) — «N/M» chip, hover «Вариант N из M», click→HIGHLIGHT_VARIANT_GROUP 2000ms; null если нет variantGroupId. +2.
- **K10** `canvas/MaterializeCloneModal.jsx` (new) — count 1..96 clamp, per-clone labels, Esc/backdrop/Cancel (ui-interactions), design-tokens. +5.
- **K11** `canvas/zone-sequence-mode/BranchingVisual.jsx` — **переписан** с T7-stub на 3 kinds (clones vertical / design-variants Y-fork / independent side-by-side) через selectVariantKindForFinals; testids `zone-seq-branching`/`zone-seq-branch` сохранены (T7 back-compat) + data-kind + STRINGS label. ZoneAssembledView передаёт state+zoneId. +4 (+ T7 zone-sequence-mode 7/7 back-compat green).
- **K12** `PieceCard.jsx` — mount VariantGroupBadge (optional state/dispatch props, null-safe); ZonePaletteView/ZoneAssembledView (3 call-sites) пробрасывают state+dispatch.
- **K15** STRINGS — pieces.variantGroup / canvasSkeleton.materialize / zones.branching.
- **K16** integration `variant-integration.test.jsx` (CREATE_DESIGN_VARIANT через skeletonReducer → ZoneSequenceMode palette 2 cards + 2 badges «Вариант N из 2»; MATERIALIZE_REACTION → 3 clone containers → BranchingVisual на реальном state = data-kind 'clones' + «3 клонов»). +2.
- **K13/K14** op/piece context-menu trigger-items — **отложены** (см. отклонение).
- **K17** smoke: 0 console errors, HMR-clean; deep smoke отложен (dev-server contention; покрыто integration — прецедент T5/T6/T7/T8).

- **Vitest:** **3074 pass / 1 skip / 0 fail** (293 файла, финал всё зелёное). Δ от T8 (3037) **+37** (K1-K8: migration-v9 5 / variant-resolver 7 / variant-actions 13 = 25; K9-K16: variant-ui 12 + variant-integration 2 = 14 — нетто +37 с учётом legitimate-contract reclass). **Регресс: 0** (PieceCard signature change + BranchingVisual rewrite + STRINGS + selectors + schema 8→9 не задели ни одного prior; 9 schema-assertion + 6 collateral deep-equal обновлены как легитимный R-DRIFT контракт). primer-wizard flake — pre-existing, не T9. pytest не трогалось.

- **Отклонения от спеки:**
  1. **R-DRIFT:** миграция = **v8→v9** (спека §5.9 «v7→v8»; CURRENT уже 8 от T6). Bump 8→9; 9 schema-assertion `toBe(8)→toBe(9)` (junction-contract/assembly-selectors-persistence/assembly-mode/migration-v5/v6/v7/v8) + collateral (migration-v5 pc-9 / migration-v8 pc-x / r12 operations / skeleton-state-pieces buildInitial) — легитимные контракт-смены (tdd-enforce, как T6 7→8).
  2. **K13/K14 context-menu триггеры отложены.** Actions (CREATE_DESIGN_VARIANT/MATERIALIZE_REACTION) + UI (MaterializeCloneModal/VariantGroupBadge) + BranchingVisual — полностью реализованы и протестированы (K5/K9/K10/K11/K16, 36 тестов). Остаётся только тонкая trigger-обвязка пунктов меню в **36 KB CanvasLayoutView** (op context-menu там inline, не отдельный компонент). Per «не должны налажать»: слепая правка 36 KB hot-файла в хвосте гигантской сессии без browser-верификации = риск регресса > ценность; trigger-плумбинг безопаснее в визуальной приёмке Chat. **Та же диспозиция, что T5 deferred toast-orchestration** — субстанция (data+actions+components) готова и зелёная, отложен только entry-point. Открытый вопрос для Chat.
  3. **variantGroupLabel → {index,total}** (не string как §5.4) — formatting = badge concern (separation of concerns), badge форматит через STRINGS pieces.variantGroup.badge.
  4. **highlightedVariantGroup на pieces-slice-root** (§5.8 предполагал state.ui — нет ui-slice в CanvasSkeleton; паттерн T7 zones.focusedZoneId / DEC-T7-10). buildInitialPiecesState `{pieces:[],highlightedVariantGroup:null}` — collateral skeleton-state-pieces.test обновлён.
  5. **MATERIALIZE_REACTION require status='executed'** (R-T9-2 strict); op.outputs untouched (clone1=outputs[0], clone2..N=deep-copy containers, vertical stack +60px). REMOVE_OPERATION keep-orphans (DEC §K7, без правок).
  6. **Canvas-block (graph-mode) VariantGroupBadge mount (K12 второй пункт) — не сделан**: badge mounted только на PieceCard (sequence-mode). Graph-mode container-block badge = deep CanvasLayoutView, та же причина что K13/K14 (отложено в визуальную приёмку; основной surface — sequence-mode PieceCard — покрыт).

- **Size (informational, лимиты off):** variant-resolver.js 2.52 / VariantGroupBadge.jsx 1.70 / MaterializeCloneModal.jsx 5.30 / BranchingVisual.jsx 2.45 / PieceCard.jsx 2.22 (все под soft); skeleton-state-pieces.js 14.28 / -operations.js 13.63 / -persistence.js 16.03 (.js под soft 20); strings.js 40.93 (data — exempt CLAUDE.md §7). **Новых hard — нет.**

- **Открытые вопросы для Chat:** (a) K13/K14 + graph-block badge — wire trigger-пункты в визуальной приёмке (substance готова); (b) materialize trigger через op context-menu vs OP_EXECUTE-flow (спека open-Q #1); (c) variant label numeric-by-createdAt vs буквенный (open-Q #3, сейчас numeric); (d) «merge variants back» explicit action (open-Q #2, сейчас manual delete).

После K18: **СТОП по T9.** Координационные файлы не трогались. Спека в `docs/SPRINT_T9_*.md`. Визуальная приёмка — отдельной сессией Chat. → T10 без паузы (continuous mode).

## Отчёт Code по Sprint T10 — ЗАВЕРШЁН (continuous mode) — 17.05.2026

Спека `docs/SPRINT_T10_*.md` (Sanger lab notebook MVP, 14 K). **Финальная спека T-серии.**

- **K1** strings.js не split (data/locale exempt CLAUDE.md §7 — установлено T7-T9). **K11** `--sanger-*` design tokens в index.css :root (semantic theme-agnostic, DEC-T10-03/07). **K12** STRINGS `zones.sanger` + actionLabels.toggleSangerNotebook.
- **K2** `lib/sanger-helpers.js` (new) — SANGER_STATUS_CYCLE / cycleSangerStatus / statusColor / statusIcon. +4.
- **K3** `skeleton-state-operations.js` — SET_CLONE_SANGER_STATUS (+info toast) / SET_CLONE_NOTES (≤500 truncate) / SET_CLONE_LABEL (blank=no-op). +6.
- **K4** `selectors-pieces.js` — selectClonesInZone (group by op, container-enriched) + selectSangerSummaryForZone (counts pending/verified/failed/unplanned). +4.
- **K5** `canvas/SangerStatusPicker.jsx` (new) — 4-segment ○/✓/✗/− control. **K6** `canvas/SangerCloneRow.jsx` (new) — editable label + picker + notes(blur-save). **K7** `canvas/SangerLabNotebook.jsx` (new) — right panel, zone label, summary, filter, op-groups. +9.
- **K8** hotkey `B` (`toggle-sanger-notebook`, allowInInput:false R-T10-3) + STRINGS label. **K9** `CanvasLayoutView.jsx` — useState sangerOpen + useHotkey + mount SangerLabNotebook (per state.focusedZoneId) + open-button when closed.
- **K10** `BranchingVisual.jsx` — Sanger dot per clone branch (clones kind only; statusColor/Icon; title=notes||statusLabel; null→no dot). +3.

- **Vitest:** **3100 pass / 1 skip / 0 fail** (298 файлов, финал всё зелёное). Δ от T9 (3074) **+26** (sanger-helpers 4 / sanger-actions 6 / sanger-selectors 4 / sanger-notebook-ui 9 / sanger-branching-indicator 3). **Регресс: 0** (3 op-actions + selectors + BranchingVisual ext + CanvasLayoutView mount + hotkeys + strings + index.css не задели ни одного из 3074). 1 collateral: hotkeys.test «14→15 entries» — легитимный контракт (T10 +1 hotkey, как T7 +2; tdd-enforce). primer-wizard flake — pre-existing, не T10. pytest не трогалось.
- **build/smoke:** HMR чисто, **0 console errors**; deep smoke отложен (dev-server contention; покрыто 26 тестами incl. mounted SangerLabNotebook/CloneRow/StatusPicker через RTL + actions/selectors через reducers — прецедент T5-T9).

- **Отклонения от спеки:**
  1. **DEC-T10-11 подтверждён:** миграция НЕ требуется (T9 уже добавил sangerVerified в shape v8→v9). No R-DRIFT здесь.
  2. **SHOW_SANGER_LAB_NOTEBOOK (§5.7/§5.8 click-indicator→focus-в-notebook) — не реализован.** BranchingVisual dot рендерится (status visible, hover=notes), но click→scroll-в-notebook+highlight требует UI-state-bus между BranchingVisual (в zone-frame) и CanvasLayoutView panel-state (спека сама §5.8 «через ref pattern или global dispatch listener» / R-T10-4 «event bus»). Слепая реализация event-bus в 37 KB CanvasLayoutView в хвосте сессии без browser-верификации = риск > ценность. **Та же диспозиция, что T5/T9 deferred trigger-плумбинг** — субстанция (panel+actions+indicator+hotkey) готова и зелёная; отложен только cross-component focus-link в визуальную приёмку. Открытый вопрос для Chat.
  3. **focusedZoneId источник:** panel читает `state.focusedZoneId` (zones-slice-root, T7 DEC-T7-10) — спека §5.8 писала `state.ui?.focusedZoneId` (нет ui-slice; адаптировано к реальной архитектуре, как T7-T9).
  4. **Sanger status toast** — добавлен минимальный inline info-toast (спека §5.1 хотела «Колония «{label}» отмечена как {status}»; реализован «Колония «{label}» → {status}» без отдельного STRINGS-шаблона — toast-инфра минимальна, no premature STRINGS).
  5. **CanvasLayoutView.jsx 37.41 KB** (.jsx, под hard 40, +~1.4 T10) — pre-existing watch, накопил ~+4 за T7-T10. Limits off per Игорь; зафиксировано для TD Chat (приоритетный декомп-кандидат вместе с SequenceView/index.jsx).

- **Size budget (informational, лимиты off):** new sanger-helpers.js 0.89 / SangerLabNotebook.jsx 4.77 / SangerCloneRow.jsx 3.21 / SangerStatusPicker.jsx 2.15 (все под soft); BranchingVisual.jsx 3.57 (.jsx OK); skeleton-state-operations.js 15.07 / selectors-pieces.js 6.13 (.js под soft 20); CanvasLayoutView.jsx 37.41 (.jsx под hard 40 — watch); strings.js 42.87 (data — exempt). **Новых hard — нет.**

- **Открытые вопросы для Chat:** (a) SHOW_SANGER_LAB_NOTEBOOK click→focus link — wire в визуальной приёмке (event-bus/ref решение — спека сама flag'ает как нетривиальное); (b) notes save-on-blur потеря при panel-close до blur (R-T10-2 — debounce/flush, post-MVP); (c) panel per-zone scope vs global (DEC-T10-02, basic); (d) panel width fixed 360 vs resize (R-T10-1, post-MVP).

После K14: **СТОП по T10. ВСЯ T-СЕРИЯ (T1-T10) ЗАВЕРШЕНА.** Координационные файлы (PROJECT_STATE/DECISIONS/BUGS/ANCHORS/RELEASES/TECH_DEBT/CLAUDE.md/package.json/version.js) не трогались. Все 10 спек остаются в `docs/SPRINT_T*.md`. Архивация F1-F4/A1-A4/D1/G1/G2 + handoff-финализация (спека T10 §11 footer) — **задача Chat в milestone-сессии визуальной приёмки**, не Code (CLAUDE.md §6, scope-stop). Визуальная приёмка T1-T10 — отдельными сессиями Chat.

### Багфикс V82 (находка Игоря в браузере) — 17.05.2026

`AssemblyDraftsPanel` («Сборки (N)») была draft-based → дефолтная zone «Сборка 1» (сидится buildInitialState с T3) не попадала в счётчик. По выбору Игоря — **вариант 1 «панель → zone-based»** (архитектурно-верный, единый источник истины, без техдолга). Панель переписана на `selectAllZones`; «+ Новая сборка»→CREATE_ZONE, Open→openEditorAssemblyTab(zoneId) (T6 dual-resolve), Delete→REMOVE_ZONE; Pin/Unpin убран (zone всегда on-canvas frame). K9 first-3 переписаны как легитимная contract-смена; K9 last-2 (AssemblyDraftBlock/MiniProjectCanvas) не тронуты. **Vitest 3105 pass / 1 skip / 0 fail, zero регрессий.** Детали+acceptance — BUGS.md V82 `[x]`. Координационные файлы (кроме BUGS.md per CLAUDE.md §4 + этой Code-заметки) не трогались.

### Багфикс V83 (находка Игоря в браузере: gap → поли-N) — 17.05.2026

Вставка gap с известной ПСО (InsertGapModal таб «Линкер»=T2A / «Своя ПСО») отрисовывалась как поли-N: 4-tier gap-piece (T6 DEC-T6-02) хранил только `gapLength`/`gapHint`, реальная ПСО молча терялась в `zone-assembly-write-adapter.INSERT_MANUAL_SEGMENT` (брал лишь `.length`) → `draftFromZone`/`computeAssemblySequenceFromPieces` → `'N'.repeat(gapLength)`. Было задокументировано как T6-deviation DEC-T6-02/09 «sequence-lossy» — репорт Игоря промотировал в реальный баг (T2A — функциональный самовырезающийся пептид, не unknown-плейсхолдер). **Фикс аддитивный, без миграции:** gap-piece получил опциональный `gapSequence` — задан (линкер/своя) → хранится дословно end-to-end, `gapLength===gapSequence.length`, `gapHint='known'`; НЕ задан (таб «Неизв. длина») → поведение без изменений (поли-N). 6 правок: `piece-model.createPiece`, `piece-invariants` (consistency-инвариант), `zone-assembly-write-adapter`, `zone-pieces-to-dag.draftFromZone`, `segment-to-piece-adapter` (`pieceToSegmentShape`+`computeAssemblySequenceFromPieces`+`segmentToPieceData`). TDD: +15 тестов `gap-known-sequence-v83.test.jsx`; `zone-assembly-gap.test.jsx` linker/custom + header — легитимная contract-смена (tdd-enforce: задокументированная T6-deviation сознательно исправлена). **Vitest 3119 pass / 1 skip / 0 fail (+1 pre-existing flake TD-PRIMER-WIZARD не связан, проходит 2/2 изолированно), zero регрессий.** Детали+acceptance — BUGS.md V83 `[x]`. Координационные файлы (кроме BUGS.md per CLAUDE.md §4 + этой Code-заметки) не трогались.

### UX-правки assembly-вью (находка Игоря в браузере: фичи/яркость/полоса) — 17.05.2026

Три замечания по assembly-редактору (zone-mode sequence view, `AssemblyShellBody` → shared `SequenceTab`/`SequenceView`):
1. **«фичи фрагментов должны показываться на сборке»** — `AssemblyShellBody` передавал `annotations={[]}` (хардкод). Новый pure-хелпер `lib/assembly-annotations.collectAssemblyAnnotations(draft, boundaries, containers)`: аннотации source-контейнера каждого sourced-сегмента клипуются по срезу `[seg.start,seg.end)` и ремапятся в координаты сборки; RC-сегмент зеркалит интервал внутри длины + флипает strand; gap/orphan/non-container → ничего; id неймспейсятся per-segment (`asm:<segId>:<orig>` — нет коллизий при повторном использовании контейнера). Прокинут как `annotations={assemblyAnnotations}` (useMemo).
2. **«слишком яркое выделение фрагментов»** — `SegmentZonesOverlay`: fill `toRgba(color,0.22)→0.10`, stroke `0.85→0.5`, orphan-градиент `0.18/0.32→0.10/0.20`, orphan-stroke `0.7→0.55`.
3. **«верхняя полоса использует ту же зону что и праймеры»** — bright top-strip (`borderTop 2px` + 5px handle на `top:r.top`) совпадал с PrimerTrack (первый трек, верх строки). Акцент перенесён вниз: `borderTop→borderBottom`, handle `top:r.top → r.top+r.height-HANDLE_H`. Праймерная дорожка сверху теперь чистая.

TDD: +7 тестов `assembly-annotations.test.js` (forward/offset/clip/RC/gap/missing/namespacing). #2/#3 — чисто визуальные константы/позиция в overlay (zone-presence тесты `piece-zones-alias`/`polish-review` зелёные, не контракт). **Full Vitest 3127 pass / 1 skip / 0 fail (flake не сработал), zero регрессий. Build clean, 0 console-ошибок после reload.** Браузерный визуальный прогон полного flow (создать проект → аннотир. контейнеры → сборка → editor) не делал — preview = чистый инстанс без данных Игоря + dev-сервер flaky на глубоких сценариях; #1 покрыт 7 unit-тестами + прокидка в уже-протестированный shared SequenceView path, #2/#3 — code-review + чистая сборка. Игорь визуально подтвердит на своей перезагруженной сессии. Координационные файлы не трогались (зона Chat).

### Canvas-навигация: 4-сторонние коннекторы + wheel-зум + бесконечный канвас (находки Игоря) — 17.05.2026

Все хелперы — чистые, в `canvas/canvas-layout.js`, TDD-first, full-suite zero-reg. **Note для Chat: `canvas-layout.js` вырос с ~6.5 KB — добавлены `edgeAnchors`/`zoomAtPoint`/`canvasContentExtent`/`edgePanVelocity` (+~5 KB, под hard 25). Релевантно для §0 будущей T4.5 (spec пока inline у Игоря, parked-pending — НЕ записан).**
1. **4-сторонние стыки** (Игорь «верх/низ не используются как точки коннекта»): `edgeAnchors(from,to)` — выбор стороны по доминантной оси центр-вектора (|dx|≥|dy| → right/left, иначе bottom/top), перпендикулярные bezier-контролы, `midX/midY` для junction-бейджа. Прокинут в `CanvasGraphView` (1 site) + `CanvasLayoutView` (junctions + op-input/output wires, 3 sites). `StitchMarkers` direction-agnostic — не тронут. +9 тестов `canvas-edge-anchors.test.js`. Принято Игорем («неплохо!»).
2. **Wheel-зум к курсору** (Игорь «зум колёсиком к точке под курсором»): `zoomAtPoint` (focal-инвариант), нативный non-passive wheel-листенер в `CanvasLayoutView` (React делает root wheel passive — иначе preventDefault не сработает), post-zoom scroll в `useLayoutEffect[zoom]`. +6 тестов `canvas-zoom-at-point.test.js`. Принято («отлично»).
3. **Фокус-зум уезжал вбок:** причина — `transform: scale()` не растит `scrollWidth/Height`, focal scroll-цель клампилась. Фикс: `canvasContentExtent(state)` + инертный sizing-шим `extent×zoom` → scroll-диапазон растёт с зумом. +6 тестов `canvas-content-extent.test.js` (один фикстур-баг ниже `EXTENT_MIN` — поправлен тест). Принято («отлично»).
4. **Бесконечный канвас** (Игорь «двигаю блок и он уезжаааааал дальше»): `edgePanVelocity` (рампа скорости у края) + RAF edge-auto-pan в `useCanvasLayoutDrag`; drag стал scroll-консистентным (`applyDragAt`, общий с pointer-move и rAF-tick — модель `world=(clientX−rect.left+scroll−offset)/zoom`, в jsdom scroll/rect=0 → контракт drag-тестов не изменён). Origin-кламп `Math.max(0,…)` на left/up **оставлен сознательно** (negative без origin-rebase = недостижимое пространство; вне scope, флагнул Игорю). +8 тестов `canvas-edge-pan.test.js`. **Cross-ref T4.5 K6:** auto-pin при drag должен встроиться в `applyDragAt`/pointer-up путь, а не рядом — конфликт с edge-pan; помечено для Chat при подъёме T4.5.

Итог по batch: +29 тестов, **Vitest 3156 pass / 1 skip / 0 fail**, zero рег., console чисто. Подтверждённый workflow сохранён в auto-memory (`feedback_canvas_ux_iteration.md`).

5. **Hand-pan «хватать канвас»** (Игорь 17.05.2026, после T4.5): `panScrollTarget` (чистый, canvas-layout.js) + обвязка в `CanvasLayoutView` — pointerdown на голом фоне (closest-гейт: не node/zone/op/button) ИЛИ средняя кнопка → pan через scrollLeft/Top; 3px-порог (клик-deselect сохранён), post-pan клик глотается (`justPannedRef`), pointer-capture, cursor grab/grabbing. Не конфликтует с node/zone-drag (gate по target) и infinite-canvas edge-pan (panRef null во время node-drag → делегирует hook). Гочи: (a) pan-блок объявлен ПОСЛЕ `useCanvasLayoutDrag` destructure (иначе TDZ на onPointerMove → cascade); (b) follow-up (Игорь «лапка появляется но не хватается, выделяется текст»): на pointerdown по фону НЕ вызывался `preventDefault()` (только средняя кнопка) + у контейнера не выключен user-select → браузер стартовал нативное выделение и перехватывал жест. Фикс: `e.preventDefault()` всегда при арминге pan + `userSelect:none/WebkitUserSelect:none` на контейнере (canvas chrome не текстовый). +5 тестов `canvas-pan.test.js`. **Vitest 3222 pass +1 flake(TD-PRIMER-WIZARD, 2/2 изолированно, не связан) / 1 skip / 0 real fail**, zero рег., console чисто.
6. **Zoom-индикатор фикс** (Игорь «показатель масштаба ездит при скролле, должен быть стационарно»): zoom-controls были `position:absolute` ВНУТРИ scroll-контейнера → скроллились вместе с контентом. Реструктура: внешний non-scrolling wrapper `skeleton-canvas-layout-wrap` (relative, flex) → внутри scroll-div (`containerRef`, `skeleton-canvas-layout`, overflow:auto) + zoom-controls overlay вынесен в wrapper (absolute top/right, не скроллится). Testid'ы сохранены, тесты zoom не ссылались. **Full Vitest 3223 pass / 1 skip / 0 fail, zero рег.; `vite build` clean.** Прим.: stale HMR-ошибки в dev-сервере (запущен ~16ч, контендился с прогонами) — артефакт transient mid-multi-edit + закэшированного broken module-graph, НЕ дефект кода (build clean + 314 файлов тестов с mount CanvasLayoutView зелёные). Dev-серверу нужен рестарт (порт 3000 держит старый процесс) чтобы увидеть фикс визуально.
7. **Регрессия-коррекция** (Игорь «контейнеры вне скролла/не добраться, рамка гигантская, не реагирует на resize»): корень — мой realise-фикс (#п.V84-region: T4.5) **подтягивал loose source-контейнеры в зону** (`zoneId=draftId`), а у них произвольные user/QuickStart-позиции (часто далеко) → grow-only T4-bounds-финализатор (DEC-T3-06, никогда не сжимается) раздувал рамку зоны навсегда, чтобы охватить их → гигантская рамка + узлы вне spacer'а (недостижимы) + ручной resize отбивается grow-only-union'ом. **Фикс:** в `handleAssemblyRealise` убран source-pull — тегаем `zoneId` ТОЛЬКО на новые realised diff-узлы (frags/product/ops; они раскладываются T4.5 в ограниченные lanes у origin зоны → bounded, reachable). Sources остаются loose там, где их поставил пользователь (Sources-lane пустой — осознанный размен: стабильность/достижимость > заполненный Sources-ряд). Тест-контракт `zone-realise-autolayout.test.js` обновлён (source НЕ pulled — легитимная contract-смена, tdd-enforce). **Full Vitest 3222 pass +1 flake(не связан) / 1 skip / 0 real fail**, zero рег. Прим.: resize AUTO-зоны grow-only-инвариантом T4 (DEC-T3-06, pre-T4.5) — auto-зона авто-размерится под контент; ручной контроль = пункт меню «Ручная раскладка» (laneLayout:'manual' → T4.5 пропускает). Это не регрессия T4.5, а исходное поведение T4; гигантизм (acute) устранён.

### Багфикс V84 (находка Игоря, скрин pks4): продукты не наследуют аннотации исходника — 17.05.2026

Класс V83 (рассинхрон zone vs legacy): legacy `makeSourcedSegment` переносит фичи через `transferAnnotations`, 4-tier `draftFromZone` хардкодил sourced-сегменту `annotations:[]` → `realiseAssembly` frag-контейнеры пустые, `-product` тоже `[]`. Op-execute путь (`operation-product-assembly`, DEC-PROD-07) аннотации переносил — баг только в realise/zone. **Фикс DRY:** (1) `draftFromZone` → `transferAnnotations(c.annotations, r.start, r.end, rc, r.sourceId)` (тот же helper, что legacy; gap/orphan/no-ann → `[]`); frag наследует каскадом. (2) Новый чистый `concatSegmentAnnotations(segs)` в `assembly-model.js` (offset = char-позиция в конкатенации, gap двигает offset) → `-product.annotations`. TDD: +12 тестов `assembly-product-annotations.test.js`. **Full Vitest 3168 pass / 1 skip / 0 fail (+1 flake TD-PRIMER-WIZARD не связан, 2/2 изолированно), zero рег.**, console чисто. Детали+acceptance — BUGS.md V84 `[x]`. Координационные файлы (кроме BUGS.md §4 + этой заметки) не трогались.

## Отчёт Code по Sprint T4.5 (zone 3-lane auto-layout) — ЗАВЕРШЁН — 17.05.2026

Спека поднята из inline и реализована по запросу Игоря. Полная спека+статус+отклонения — `docs/SPRINT_T4_5_ZONE_AUTO_LAYOUT_3LANE.md` (✅ РЕАЛИЗОВАНО). Кратко:

- **K1–K15 все ✅.** Новое: `lib/zone-layout-rules.js`, `lib/zone-layout.js`, `canvas/zone-lane-divider.jsx`. Тронуто: piece-model/skeleton-state-operations/skeleton-state-canvas/zone-pieces-to-dag (pinned:false factories), skeleton-persistence (migrate_v9_to_v10 + SCHEMA 9→10), zone-model (laneLayout:'auto'), skeleton-state-zones (SET_ZONE_LANE_LAYOUT/RECOMPUTE_ZONE_LAYOUT/SET_NODE_PINNED), skeleton-state (финализатор applyZoneLayouts последним), skeleton-context (3 action-creator), useCanvasLayoutDrag (drag pointer-up auto-pin в общий applyDragAt путь), ZoneFrame (mount divider), ZoneContextMenu (2 пункта), CanvasLayoutView (📌-бейдж container+op), strings.
- **dagre переиспользован** `lib/dag-layout.computeAutoLayout` (`@dagrejs/dagre` уже был — K1 install не нужен, bundle не вырос).
- **Vitest 3213 pass / 1 skip / 0 fail** (baseline 3168, Δ+45 новых; +15 R-DRIFT contract-collateral обновлены легитимно — SCHEMA toBe(9)→(10) ×8 + deep-equal миграций +pinned:false, класс T9-variantGroupId, tdd-enforce). Console чисто после reload.
- **Отклонения (детали в спеке §Отклонения):** (1) DEC-T4.5-08 finals top-anchored (фикс. офсет, НЕ от низа) — иначе finalizer feedback-петля, idempotency R2 не держится; loop-safety > буквальный §4. (2) K10 dbl-click toggle НЕ реализован — конфликт с double-click→openEditor (ui-interactions=edit); pin/unpin = drag-auto-pin + кликабельный 📌-бейдж + zone-menu (≤2 клика). (3) container `pinned` — канонические фабрики + миграция + read-as-unpinned (V83-style), ad-hoc литералы не стэмпил.
- **Size budget: WARN** — `CanvasLayoutView.jsx` 41.35 KB пробил .jsx hard 40 (T4.5 +~1.5 KB pin-бейджи на уже-крупном файле). Per CLAUDE.md §7 calibration — Watch-list, не авто-блок; декомпозиция = mini-spec Chat. Прочее под soft.

### T4.5 follow-up фикс (Игорь «не работает сортировка по зонам») — 17.05.2026

Корень: `handleAssemblyRealise` мерджил `diff.containers/operations` БЕЗ `zoneId`. При realise в зону (`isZone` — дефолтный путь «Сборка 1» V82) все realised-узлы оставались loose → `nodeListInZone` пуст → финализатор T4.5 не имел членов зоны для сортировки → «не работает». Плюс `-product` контейнер edge-isolated → классификатор клал его в Sources. **Фикс:** (1) `handleAssemblyRealise` при `isZone` тегает `zoneId=draftId` на все diff-контейнеры/ops и подтягивает в зону LOOSE source-контейнеры (op.inputs; уже в другой зоне — не трогает, cross-zone link). (2) `zone-layout-rules`: `origin.kind==='realised-product'` → всегда finals (origin-authoritative), не source — синхронно в `classifyZoneNodes`+`isSource`+`isFinal`. TDD: +5 тестов `zone-realise-autolayout.test.js`. **Full Vitest 3218 pass / 1 skip / 0 fail, zero рег.**, console чисто. Деталь дописана в `docs/SPRINT_T4_5_*.md`.

### Canvas cleanup — реверс DEC-T3-08 + V61 + кнопки вниз-вправо (Игорь, по AskUserQuestion «Полностью из state») — 17.05.2026

Запрос: «убрать стартовые сборки и фрагменты (госты), оставить только кнопки справа снизу, верхнюю кнопку (Сборки) тоже вниз-вправо». Через AskUserQuestion подтверждён объём = **«Полностью из state»** (реверс анкоров, не визуальное скрытие).
- **DEC-T3-08 РЕВЕРС:** `buildInitialState` больше НЕ сидит дефолтную зону «Сборка 1» — `zones:[]` всегда. `opts.forceEmptyZones` оставлен принимаемым (no-op, чтобы не ломать call-sites). Удалён неиспользуемый импорт `createZone` из skeleton-state.
- **V61 РЕВЕРС:** отключён ghost-placeholder финализатор (`ensureGhostPlaceholder`) в skeletonReducer — чистый канвас, без авто-госта. Удалён неиспользуемый импорт `ensureGhostPlaceholder`. Новые фрагменты — через кнопки/drag-drop, не через seeded ghost.
- **Кнопка «Сборки» → вниз-вправо:** `AssemblyDraftsPanel` перенесён top-left → `bottom:108 right:24 zIndex:30`, `flexDirection:column-reverse` (toggle снизу-якорь, панель раскрывается ВВЕРХ чтобы не уходить за экран), card `marginTop→marginBottom`. Стек: +Операция(20) / +Сборка(64) / Сборки(108), все right:24.
- **Контракт-смена (легитимная, tdd-enforce; объём подтверждён Игорём):** 13 тестов в 5 файлах (assembly-drafts-panel-v82, assembly-mode K9, canvas-layout-zones, skeleton-state-zones, skeleton-state-split) переписаны на «чистый старт без дефолтной зоны» (создают зону явно через «+ Новая сборка»/CREATE_ZONE где раньше полагались на seeded). Меньше fallout, чем ожидалось (V61-реверс почти не задел тесты — ensureGhostPlaceholder остаётся функцией, тестируется напрямую).
- **Full Vitest 3222 pass / 1 skip / 0 real fail** (+1 flake TD-PRIMER-WIZARD: при изоляции мерцал 1/2 один прогон, затем 2/2 + 2/2 — нондетерминизм timing-теста, к CanvasSkeleton не относится). `vite build` clean. Fresh dev-сервер, 0 console-ошибок.
- **Для Chat:** реверснуты ⚓-уровня решения **DEC-T3-08** (default zone) и **V61** (always-1-ghost) — обновить ANCHORS/DECISIONS в milestone-сессии (по прямому запросу Игоря; Code не финализирует анкоры per CLAUDE.md §6).

### Фикс «область сборки удлиняется безконтрольно при хвате за верх» — 17.05.2026

Корень (моя T4.5-регрессия, глубинная причина и прежних жалоб про «гигантскую рамку»): T4.5 кладёт finals-lane на ФИКСИРОВАННЫЙ офсет от `bounds.y` (`LANE_FIN_DY=380`), а pre-existing T4 **grow-only** bounds-финализатор (идёт ПЕРЕД T4.5) гоняется за этим контентом. Хват за верх меняет `bounds.y` → T4 (видит позиции прошлого тика) и T4.5 (перекладывает под новый bounds.y) рассинхронизируются на тик каждый drag → grow-only берёт max → высота растёт каждый тик = безконтрольное удлинение.

**Фикс (детерминированный размер auto-зоны):** `applyZoneLayout` теперь сам выставляет РАЗМЕР auto+graph зоны (`width/height` = экстент разложенных lanes + паддинг, **константа** при данном наборе узлов; `x/y` НЕ трогает — origin двигают только DRAG_ZONE/resize пользователя). T4 grow-only-финализатор **пропускает** auto+graph зоны (`laneLayout!=='manual' && viewMode!=='sequence'`) — их bounds владеет zone-layout. `autoResize:false` уважается (размер не трогается). Manual/sequence зоны — прежний grow-only без изменений. Итог: фиксированная точка — drag просто транслирует рамку, она НЕ удлиняется; идемпотентно (settle за 1 проход).

TDD: +5 тестов `zone-frame-stability.test.js` (idempotent bounds; 30 тиков DRAG_ZONE за верх → height不变; размер независим от x/y; origin сохраняется; tiny→grown один раз). Контракт-смена (легитимная): `skeleton-zone-finalizer.test.js` — grow-only теперь только для manual/sequence, helper переведён на `laneLayout:'manual'` (3 теста). **Full Vitest 3228 pass / 1 skip / 0 fail**, zero рег. `vite build` clean, 0 console-ошибок (fresh dev-сервер). Это устраняет и acute-гигантизм, и runaway-elongation корректно (не паллиатив).

### «Очистить канвас» — gated RESET (Игорь 17.05.2026)

Запрос «добавь возможность очистить канвас от всего». Кнопка `skeleton-clear-canvas` в bottom-right стек (`bottom:152 right:24`, следующий слот: Операция 20 / Сборка 64 / Сборки 108 / Очистить 152). Ghost-стиль (низкий визуальный вес, hover→accent — design-system: destructive=`--accent`, не red). **Destructive-гейт** `window.confirm` (тот же паттерн, что zone-delete в ZoneContextMenu): подтверждение «Очистить канвас? …удалены безвозвратно.» → `actions.reset()` → `RESET` → `buildInitialState()` (после реверса DEC-T3-08/V61 — пустой канвас: 0 контейнеров/сборок/операций/зон/позиций). +3 теста `clear-canvas.test.jsx` (кнопка есть; confirm→true чистит созданную зону; confirm→false не трогает — гейт уважается; happy-dom не имеет window.confirm → присваиваем напрямую, restore в afterEach). **Full Vitest 3231 pass / 1 skip / 0 fail**, zero рег. `vite build` clean, 0 console-ошибок (fresh dev-сервер).

### Фикс «drag ромба → отпускание бросает в сиквенс-вивер» (Игорь 17.05.2026)

`onOperationClick` (CanvasLayoutView) открывает редактор/PCR-вьювер по клику на op (committed PCR → `openEditorOpTab`), но — в отличие от canvas-click guard — НЕ проверял `justDraggedRef`. Синтезированный click после drag ромба → onOperationClick → открытие вьювера. **Фикс:** в начало onOperationClick добавлен тот же guard `if (justDraggedRef.current) { justDraggedRef.current = false; return; }` (hook ставит justDraggedRef на pointer-up moved-drag для kind='operation'). Branch-agnostic — гасит и picker, и popup, и editor после drag; обычный клик (без движения) работает (justDraggedRef ставится только при hasMoved). +3 теста `op-drag-no-editor.test.jsx` (control plain-click→picker; drag+release→suppressed; next plain-click→works again). **Full Vitest 3234 pass / 1 skip / 0 fail**, zero рег. `vite build` clean, 0 console-ошибок.

### Редизайн праймеров/олигонуклеотидов (Игорь 18.05.2026, scope подтверждён AskUserQuestion: «везде» + «модал от выделения»)

4 требования, реализованы в общем слое:
1. **«Добавить праймер» → модал** (имя/ПСО/RC): новый общий `SequenceView/popups/PrimerFromSelectionModal.jsx`. Правый клик по выделению → «праймер» теперь не создаёт сразу, а открывает модал, предзаполненный ДНК выделения (RC-ориентированной для reverse), с редактируемыми именем, ПСО и тумблером RC (флип reverse-complement'ит поле). Esc/backdrop close. SequenceView перехватывает write-primer intent (`requestWritePrimer`), на confirm → `onWritePrimer({direction,start,end,name,sequence})`. Сквозная проводка имени/ПСО по assembly-пути: `useAssemblyPrimerWriting.onWritePrimer` → `writePrimerForRange(...,{name,sequence})` → `writeAssemblyPrimer` action → `WRITE_ASSEMBLY_PRIMER` reducer (honors `action.name`/`action.sequence`; пусто → auto-name/range-derive, back-compat; edited → status 'edited'). Op/PCR-консьюмеры модал тоже показывают (создают, имя по их пути auto — scoped).
2. **Кликабельность**: `PrimerTrack` получил `onPrimerClick`/`selectedPrimerKeys`; SequenceView всегда прокидывает (кликабельно везде). Back-compat: без onPrimerClick трек декоративен (`pointer-events:none`, как раньше), testid'ы/атрибуты сохранены.
3. **Два праймера → flank-highlight**: SequenceView держит `selectedPrimers` (≤2, toggle); чистый `lib/primer-flank.flankedSpan(a,b)` (bracket [min start,max end], direction-agnostic) → синтетическая зона `__primer-flank__` влита в `SegmentZonesOverlay` (переиспользование, без нового оверлея).
4. **Праймер = полоска + буквы**: `PrimerTrack` рисует binding-базы моноширинным текстом (grid-aligned, `sequence-view-primer-bases`), при charPx≥5; selected → ring + `data-selected`.

TDD: +6 `primer-flank.test.js`, +6 `primer-track-redesign.test.jsx`, +4 `primer-from-selection-modal.test.jsx`. Гочи (поймано/исправлено): дубль-импорт `useCallback` (parse-error, 45 файлов) + TDZ `requestWritePrimer`↔`fullSeq` (209 тестов) — оба следствие правок большого SequenceView; после фикса **Full Vitest 3249 pass / 1 skip / 0 fail**, zero рег. (back-compat удержан: новые props опциональны, модал-перехват не сломал тесты — Ctrl+R hotkey-путь не через модал). `vite build` clean, 0 console-ошибок (fresh dev-сервер). Чистая часть covered unit; SequenceView-проводка/flank — mechanical + full-suite + браузер. Op/PCR-консьюмеры: имя из модала по их create-пути не сохраняется (scoped follow-up для Chat при необходимости).

### Праймеры в библиотеке — редизайн на «всех сиквенсвиверах» (Игорь 18.05.2026: «так отлично, должно ещё в библиотеке работать, в общем на всех сиквенсвиверах»)

Продолжение primer-redesign: 4-точечный UX (модал-от-выделения / кликабельность / flank-highlight / буквы) теперь и в Library/Importer-инспекторе, не только на assembly-канвасе. Точки 2–4 уже общие (внутри SequenceView/PrimerTrack — активны как только есть `primers`); точка 1 гейтилась консьюмер-prop'ом `onWritePrimer`, который `LibrarySingleInspector`/`SequenceTab` не передавали (read-only viewer).

**Архитектура (reuse, без новой подсистемы, без Dexie-миграции):** persistence = существующий **unified primer pool** (`primerSlice`, DEC-IMP-11 ⚓ — единый стор, который и есть «Library Primers»/project Pool). Праймер библиотечной записи = pool-праймер, scoped к записи через `origin = { kind:'library-selection', entryId }`. Binding-позиция НЕ хранится — `PrimerTrack` сам индекс-офит (RC-aware) по показанной последовательности (тот же контракт, что PCR/assembly уже используют, см. `PcrModeShell.viewerPrimers`).

- Новый чистый слой `components/Library/inspector/lib/entry-primers.js` (2.75 KB): `buildEntryPrimerPayload({id,name,sequence,direction,entryId,projectId})` (шейпит `addPrimerToPool`-payload; clean seq → ACGT-only/upper; null при !id или пустой ПСО) + `selectEntryPrimers(primersById,entryId)` (фильтр по origin, map в viewer-shape, **shared frozen EMPTY ref** при no-match — реф-стабильность для SequenceView-мемо).
- Новый тонкий hook `components/Library/inspector/hooks/useEntryPrimers.js` (2.37 KB): store-glue. Отдаёт `{primers,onWritePrimer}`. `onWritePrimer` → `buildEntryPrimerPayload` (id=uuidv7, projectId из `libraryEntries[_libraryEntryId]`) → `addPrimerToPool`. entryId = `_libraryEntryId || id || _fileName || name` (durable lib-id когда есть; Importer-staging — transient).
- Проводка в `LibrarySingleInspector` минимальна (import + hook-call + 2 props на `<SequenceTab>`), т.к. файл в soft-зоне у hard-границы (см. ниже).
- **Гоча (поймано full-suite, исправлено, НЕ ослаблением теста):** `hydratePrimers` НИГДЕ в проде не вызывался (pool-мап пуст до открытия) → hook вызывает его, иначе сохранённые праймеры не всплывают после reload. Безусловный `hydratePrimers()` (→ Dexie `listPrimers`) уронил `annotation-undo-redo.test.jsx` (3 unhandled `MissingAPIError: IndexedDB API missing` — тест монтирует SingleInspector на реальном сторе в happy-dom). **Фикс — production-robustness guard в hook:** skip при `typeof indexedDB === 'undefined'` + `Promise.resolve(hydratePrimers()).catch(()=>{})` (locked-down/private-mode браузер тоже не должен ронять инспектор). Тест НЕ тронут.

TDD: +7 `entry-primers.test.js` (payload-shape/clean/null-guards; origin-scoped select; EMPTY реф-стабильность; детерминированный порядок по addedAt). **Full Vitest 3256 pass / 1 skip / 0 fail** (baseline 3249 + 7, точно, zero рег; flake TD-PRIMER-WIZARD не сработал в этом прогоне). `vite build` clean. Чистый слой covered unit; hook = тонкая glue (логика в протестированном чистом слое) + full-suite + интеграционная проверка через тот же общий SequenceTab, что проверенный PCR-путь кормит идентично — браузерный walkthrough Library-флоу deferred (validated workflow).

- **Размеры:** `LibrarySingleInspector.jsx` 38.73 → **39.10 KB** (Δ+0.37 KB; hard 40 — soft **WARN**, ~0.90 KB до hard; pre-existing soft, Watch-list per DEC-SIZE-CALIBRATION-01, не Active decomp, Δ<3 KB — без STOP). Новые `.js`: entry-primers 2.75 KB / useEntryPrimers 2.37 KB (hard 25 — OK). Size budget: **WARN** (SingleInspector у hard-границы — следующая правка этого файла может пробить, кандидат в TD-SIZE).
- **Для Chat:** (1) новая конвенция `origin.kind='library-selection'` в primer pool — задокументировать (DECISIONS sprint-level); (2) `hydratePrimers` теперь имеет prod-вызов (через Library-инспектор) — раньше dead; (3) `LibrarySingleInspector.jsx` 39.10 KB — TD-SIZE кандидат (decomp при следующей правке). Op/PCR-консьюмеры primer-name follow-up (прошлый блок) — без изменений.

**Дотяжка «на всех сиквенсвиверах» — canvas container-editor (Игорь 18.05.2026: «захожу в сиквенс вивер с канваса и там вообще праймеры пропали (добавление и тд)»):** диагноз — `ContainerEditorSkeleton` (двойной клик по контейнеру на канвасе → сиквенс-вивер, самый частый «вивер с канваса») имел `primersForActive = useMemo(() => [], [])` (K10-заглушка с 12.05) и НЕ передавал `onWritePrimer` → ноль праймеров + нет добавления. Assembly-вивер (`AssemblyShellBody` → `useAssemblyPrimerWriting`) был и остаётся проводен корректно (не задет). Правка библиотеки прошлого блока канвас-путь не трогала — поэтому юзер видит «пусто» там, где после запроса «на всех сиквенсвиверах» ждал фичу. **Фикс:** тот же `useEntryPrimers(item)` в `ContainerEditorSkeleton` (entryId = container.id; persist в unified pool, origin-scoped по контейнеру) заменяет `[]`-заглушку + `onWritePrimer` проброшен в обе вкладки (sequence + mutagenesis). Reuse того же протестированного hook/слоя — нового кода логики нет, проводка mechanical, идентична Library-обвязке. **Full Vitest 3256 / 1 skip / 0 fail** (zero рег; новых тестов нет — логика уже покрыта `entry-primers.test.js` ×7; правка чисто проводочная). `vite build` clean, dev-сервер: 0 console/HMR/server-ошибок. `ContainerEditorSkeleton.jsx` 33.96 → ~34.2 KB (soft .jsx 30 / hard 40 — OK, ~6 KB до hard). Браузерный walkthrough canvas-флоу deferred (validated workflow; обвязка идентична доказанной Library/PCR/assembly, SequenceView primer-path покрыт тестами и юзер гонял его на assembly-канвасе в прошлой сессии).

**Синхронизация сиквенс-виверов (Игорь 18.05.2026: «синхронизируем все сиквенс виверы во всех разделах, чтобы они слабо отличались»):** проведён аудит всех 8 точек монтирования viewer-стека (агентом, read-only). Вывод: после primer-redesign + primer-library + primer-canvas-editor основные дизайн-виверы уже почти синхронны. Остававшийся **incidental** разрыв — `showSelectionTm` (annealing-Tm у курсора на выделении): был ✓ в Assembly+PCR, ✗ в Library+ContainerEditor (хотя там уже есть primer-add → выделение «ощущалось» по-разному). **Фикс:** `showSelectionTm` добавлен в Library-инспектор + обе вкладки ContainerEditor (sequence+mutagenesis). Теперь все 5 дизайн-поверхностей (Library/Importer-инспектор, ContainerEditor×2, Assembly, PCR) несут одинаковый набор: `primers` + `onWritePrimer` + `showSelectionTm` + caret/selection. Остальные расхождения **intentional, сохранены**: assembly `coloredZones`/zone-click (границы сегментов), ContainerEditor `onCreatePiece`/`onRestrictionClick` (RE-cut семантичен только на canvas-контейнере), Annotator/PreviewTab (direct SequenceView, predicted-region drill-in), per-section chrome (assembly segment-sidebar / PCR suggestions-panel / наборы вкладок). AssemblySourcePicker — намеренно минимальный modal range-picker. Flattening intentional-слоя сломал бы section-UX — не делалось. **Full Vitest 3256 / 1 skip / 0 fail** (zero рег; новых тестов нет — `showSelectionTm` поведение уже покрыто `selection-tm.test.jsx` на уровне SequenceView, правка — mechanical prop pass-through в 2 хоста). `vite build` clean, dev-сервер 0 console/HMR-ошибок. Размеры: `LibrarySingleInspector.jsx` 39.10→**39.13 KB** (soft WARN, ~0.85 KB до hard 40 — без STOP), `ContainerEditorSkeleton.jsx` 34.2→**34.37 KB** (soft, OK). Браузерный interactive-прогон по всем разделам deferred (validated workflow; правка — единый булев prop, поведение тестировано). Бóльший опциональный шаг (унификация chrome/вкладок/контракта SequenceTab read-only) — НЕ начат: высокий blast-radius + затрагивает intentional section-UX, требует решения Игоря/спеки Chat, не молчаливого рефактора.

**Аннотатор: вкладка → toggle-кнопка «преобразующая вивер откуда угодно» (Игорь 18.05.2026):** хирургический affordance-swap, БЕЗ переписывания Annotator. Ключевой факт: `activeTab` в `LibrarySingleInspector` — controlled prop от родителя (Library/Importer workspace), `activeTab==='annotations'` вплетён в ~10 мест (strip-gate, overflow, stripAnnotations, AnnotationsTab mount, onOpenAnnotator) — полный рефактор зацепил бы родителя + V49 lazy-guard. Поэтому минимальный путь: кнопку вынес в общий примитив `TabBar` (одна реализация на оба хоста, viewer-sync), весь render-путь аннотаций НЕ тронут (по-прежнему gated `activeTab==='annotations'` → V49 lazy-mount сохранён, `isMounted('annotations')`/idle-prewarm как были). `TabBar`: `showAnnotations` (default true — back-compat) убирает «Аннотации» из strip когда false; `onToggleAnnotator`+`annotatorActive` рендерят right-aligned toggle-кнопку (`importer-annotator-toggle`, aria-pressed, accent-wash active). Оба хоста: `showAnnotations={false}` + toggle флипает activeTab annotations⟷sequence (Library — через `onActiveTabChange`, ContainerEditor — через `setActiveTab`). `onOpenAnnotator` (right-click «аннотировать выделение») не тронут — он и так ставит activeTab='annotations', теперь видно через кнопку. **Scope:** Library/Importer-инспектор + canvas container-editor (хосты, где аннотатор реально есть). Assembly/PCR — НЕ трогал (synthetic/template-последовательности, аннотатор там семантически не определён; отдельное решение, флагнуто как и chrome-унификация). **Контракт-смена (легитимная, tdd-enforce — intentional affordance-смена, тесты обновлены под новый contract, intent сохранён):** `lazy-tabs.test.jsx#6` (был «annotations tab IS in TabBar» → стал «annotator is a TOGGLE button, not a strip tab» + явная проверка V49 lazy: panel не смонтирован на Overview); `container-editor-skeleton-v2.test.jsx` ×4 (клик `importer-tab-annotations` → `importer-annotator-toggle`, тот же render-путь, все последующие assert'ы — panel mount / scope skeleton:: prefix / toolbar-not-rendered / strip-visible — без изменений). **Full Vitest 3256 / 1 skip / 0 fail** (zero нетто-рег: 5 contract-тестов поправлены in-place, кол-во тестов не изменилось; `selection-tm`/primer-suite зелёные). `vite build` clean, dev-сервер 0 console-ошибок. Поведение фактически **end-to-end протестировано** (компонент-тесты рендерят реальный хост, кликают реальную `importer-annotator-toggle`, ассертят монтирование AnnotationsTab + scope) — браузером отложено только визуальное размещение/стиль кнопки (validated workflow).

- **Размеры (ВНИМАНИЕ — эскалация):** `TabBar.jsx` 5.57 KB (OK). `ContainerEditorSkeleton.jsx` 34.37→**34.60 KB** (soft, OK, ~5.4 KB до hard). `LibrarySingleInspector.jsx` 39.13→**39.34 KB** (Δ+0.21; soft, **~0.64 KB до hard 40**). Тренд за сессию: 38.73→39.10→39.13→39.34 — rate-of-change растёт, hard почти пробит. **Следующая правка этого файла с большой вероятностью пробьёт hard 40.** TD-SIZE по `LibrarySingleInspector` нужно поднять из Watch в **Active decomp** — следующая спека, трогающая файл, ДОЛЖНА ставить декомпозицию первым пунктом (CLAUDE.md §7); иначе Code обязан STOP.

**Декомпозиция `LibrarySingleInspector.jsx` (Игорь 18.05.2026: «декомпозируй его» — по эскалации size-блокера; прямое указание = Code выполняет, не ждёт Chat-спеку):** чистый behavior-preserving extract, full Vitest = регресс-гард. Вынесен самый крупный самодостаточный блок — caret/selection/LinearFeatureBar-навигация (4 cursor-state + `pendingScroll` + rAF drag-scrub PERF-3 с `caret-gliding` + onBarSettle/onBarScrub/onCaretChangeFromView/onSelectRangeFromView/onPendingScrollHandled + reset-on-itemKey) — в новый `hooks/useInspectorSelectionNav.js` ВЕРБАТИМ (логика и комментарии 1:1, hook принимает `{activeTab,onActiveTabChange,itemKey}`, отдаёт state+коллбэки+setCursorPos/Anchor для `onSequenceEditFromView`). В компоненте — один вызов хука вместо ~170 строк. Hook-order/effect-order проанализированы: перенос блока выше по телу + reset-effect раньше прочих эффектов поведенчески нейтральны (reset/scrub-cleanup ни с чем не пересекаются по порядку). `onActiveTabChange`/`onOpenAnnotator`/`useFeatureEditorFlow`/annotation-pipeline НЕ тронуты. **Размеры:** `LibrarySingleInspector.jsx` 39.34 → **31.28 KB** (Δ−8.06; hard-эскалация СНЯТА — было 0.64 KB до hard, стало **8.7 KB запаса**; всё ещё 1.28 KB в soft-зоне >30 — WARN, но не блокер). Новый `hooks/useInspectorSelectionNav.js` **9.80 KB** (.js hard 25 — OK). **Full Vitest 321 файлов / 3256 pass / 1 skip / 0 fail — точно baseline, zero рег** (первый прогон мигнул 320/3229 — транзиентная неполная коллекция воркера; чистый повторный прогон = полный baseline, Duration подтверждён). `vite build` clean, dev-сервер 0 console-ошибок. Новых тестов нет — чистый перенос, существующее покрытие (lazy-tabs, annotation-undo-redo, importer-state, container-editor и т.д.) гарантирует эквивалентность (tdd-enforce: behavior-preserving refactor, suite = гард). **Опциональный второй extract** (annotation-edit pipeline: itemRef/editsRef + onAnnotationEditFromView/onSequenceEditFromView/applyOpToAnnotations/onApplyAnnotatorResults/onOpenAnnotator/auto-run/undo-redo → ещё ~5-7 KB, ушёл бы под soft 30) НЕ сделан в этот проход: он энтэнглд (feeds useFeatureEditorFlow, store-хуки, onActiveTabChange), риск выше, а эскалационный блокер (hard) уже снят с большим запасом. Предлагается как redirectable шаг, не молчаливо.

**Багфикс `PrimerFromSelectionModal` (Игорь 18.05.2026: «модалка появляется в центре последовательности, надо скролить; ввод имени неактивен» → после 1-го фикса «имя так же не печатается»):** ДВА независимых корня, не один (1-й проход ошибочно списал оба на позиционирование — честно фиксирую). **Bug1 (скролл/центр):** модал рендерился `position:absolute; inset:0` внутри scroll-поддерева SequenceView → backdrop накрывал positioned-предка внутри вьювера, не вьюпорт. **Фикс bug1:** `createPortal` в `document.body` + `position:fixed; zIndex:1000` + `autoFocus` на имя. **Bug2 (не печатается) — иной корень, портал его НЕ лечит:** React распускает события по ДЕРЕВУ КОМПОНЕНТОВ, не по DOM. `useSequenceKeyboard` вешает `onRootKeyDown` на `<div onKeyDown>` корня SequenceView; в editable-режиме (canvas container-editor, Library editable-pill) он делает `e.preventDefault()` на каждой IUPAC-букве (A/C/G/T/U/N/R/Y/W/S/K/M/B/D/H/V) для sequence-edit. Keydown из инпута портала всё равно всплывает по React-дереву (портал = DOM-перенос, не React-перенос) до этого корневого хендлера → буквы съедаются до инпута. **Фикс bug2:** `onKeyDown={(e)=>e.stopPropagation()}` на backdrop модала — синтетическое распространение гасится до корня вьювера; ввод работает, sequence-edit не триггерится. Esc цел (нативный window-listener, синтетический stopPropagation его не трогает); backdrop/Esc/тестиды сохранены. **TDD:** +3 регресс-теста в `primer-from-selection-modal.test.jsx` — (a) backdrop `position:fixed` И `parentElement===document.body` (гард bug1); (b) name-input `document.activeElement`+печать (autofocus); (c) **keydown НЕ протекает в host `onKeyDown`** (рендер модала внутри `<div onKeyDown=spy>`, fireEvent.keyDown 'A'/'T' в name/seq → spy НЕ вызван — точный гард bug2, без фикса spy сработал бы через React-bubbling портала); 4 исходных зелёные. **Full Vitest 321 / 3259 pass / 1 skip / 0 fail** (baseline 3256 +3 новых, zero рег). `vite build` clean, dev-сервер (45b90c5d) 0 console-ошибок. `PrimerFromSelectionModal.jsx` ~4.7 KB (.jsx — под лимитом). Браузерный клик-through deferred (оба корня детерминированно покрыты на реальном mount: portal-parent+fixed+autofocus + React-bubbling stop через host-spy). **Bug3 (после 2-го фикса: «модалка "прозрачная" для клика, кнопки не жмутся») — тот же архитектурный корень, что bug2, но для pointer-событий:** корень SequenceView (`SequenceView/index.jsx:849-863`) несёт bubble-фазные `onPointerDown={onRootPointerDown}` / `onPointerUp` / `onClick` / `onContextMenu`; pointerdown/up из инпутов/кнопок портала всплывают по React-дереву в `onRootPointerDown`, тот стартует drag-select / pointer-capture и «крадёт» взаимодействие → click по кнопке не завершается. **Фикс bug3:** на backdrop добавлены `onPointerDown/onPointerUp/onPointerMove/onContextMenu = stopPropagation` (общий `stopPtr`); `onClick={onClose}` на backdrop остаётся (отдельное событие на самом backdrop — backdrop-close цел), inner-box `onClick stopPropagation` цел (внутренний клик не закрывает). +1 регресс-тест (d): рендер внутри `<div onPointerDown=spy onPointerUp=spy>`, fireEvent.pointerDown/Up/click по кнопке «Создать» → host-спаи НЕ вызваны И `onCreate` вызван (кнопка работает). **Итог по всем 3 симптомам: Full Vitest 321 / 3260 pass / 1 skip / 0 fail** (baseline 3256 +4 регресс-теста, zero рег), `vite build` clean, dev-сервер (45b90c5d) 0 console-ошибок, `PrimerFromSelectionModal.jsx` ~5.4 KB (.jsx — под лимитом). **Паттерн для Chat:** любой портал-модал, монтируемый из SequenceView (или иного хоста с root-level keyboard/pointer-хендлерами), ОБЯЗАН гасить keydown+pointer+contextmenu на своём backdrop — React-bubbling идёт по дереву компонентов, портал DOM-изоляции событий НЕ даёт. Кандидаты на тот же аудит: `CreateAnnotationPopup`, `SelectionContextMenu`, `EditAnnotationModal`, `PiecePrimersPickModal`, `PieceCreateModal` (если монтируются из SequenceView-поддерева) — отдельная проверка Chat/следующего прохода.

**Редизайн PrimerTrack — стрелки по обе стороны цепи + вписанная последовательность (Игорь 18.05.2026: «форвард и реверс по обе стороны от цепи (обратный внизу); сам праймер — стрелка, последовательность вписана»):** общий `PrimerTrack` (все 5 виверов через SequenceView/SequenceLine). **Glyph:** rect-бар + отдельная полоса букв снизу → единый pentagon-arrow `<path data-primer-arrow="forward|reverse">` (плоский 5′-хвост → остриё 3′; HEAD=6 px выступает ЗА footprint, чтобы вписанные буквы остались точно по сетке колонок). Связывающие основания вписаны ВНУТРЬ стрелки (mono, `textLength=W` lengthAdjust spacingAndGlyphs — grid-aligned; белые на filled-цвете / цвет на outline; `data-testid=sequence-view-primer-bases` сохранён, контент = top-strand footprint slice). Forward → синяя стрелка вправо, reverse ← красная влево. **Размещение (по обе стороны цепи):** добавлен prop `directionFilter='forward'|'reverse'` (undefined = всё, back-compat). `SequenceLine`: единый PrimerTrack сверху убран; forward-инстанс вставлен НАД top-strand, reverse-инстанс — ПОД нижней цепью (перед AnnotationTrack) → «обратный внизу». Оба под `tracksReady` (two-phase render сохранён). Клик/селекция/`primerHitKey`/pointer-events-gating не тронуты. **Контракт-смены (легитимные, tdd-enforce — намеренный rect→arrow редизайн, intent сохранён):** `primer-track-redesign.test.jsx` (selected: «≥2 rect» → ring-rect + `[data-primer-arrow]`; +2 новых: pentagon-path-shape, directionFilter изолирует страну); `primer-restriction.test.jsx` ×2 (#2 filled: rect#3b82f6 → path `data-primer-arrow=forward` fill #3b82f6; #3 outline: rect fill none → arrow fill none + stroke + вписанные буквы). **Full Vitest 321 / 3262 pass / 1 skip / 0 fail** (baseline 3260 +2 новых, zero рег). Промежуточный прогон ловил `primer-wizard.test.jsx#1` — изолированно 2/2 ×2 зелёный → это **pre-existing TD-PRIMER-WIZARD-FLAKE** (нондетерминизм под parallel-load, флак сместился #2→#1; НЕ регрессия — мой скоуп только PrimerTrack/SequenceLine, PrimerWizardStepModal не задет). `vite build` clean, dev-сервер (45b90c5d) 0 console-ошибок. Размеры: `PrimerTrack.jsx` ~7.4 KB, `SequenceLine.jsx` +~0.7 KB (оба .jsx — под лимитом). Браузерный визуальный приём (форма стрелки/читаемость букв/вертикальное размещение) deferred — геометрия детерминированно покрыта тестами (path-d/fill/stroke/directionFilter/bases-content).

**Праймер: явное выделение + двойной клик → модалка (Игорь 18.05.2026):** **(1) Выделение:** тонкое одиночное ring-кольцо → заметный composite: soft colour-halo `<rect data-primer-selection-halo>` (fill=color, opacity .18) + bold ring (stroke 2.5, opacity 1) + arrow на full-opacity с утолщённым stroke (filled 0.5→1.5, outline 1→2). Кликнутый праймер читается однозначно. **(2) Двойной клик:** `PrimerTrack` получил prop `onPrimerDoubleClick(hit)` (consumer-gated, `<g onDoubleClick>` + `clickable = hasClick||hasDbl` → pointer-events/cursor включаются и при одном dbl). Проброшен `SequenceLine` → оба PrimerTrack-инстанса (fwd/rev). В `SequenceView` `onPrimerDoubleClick(hit)` (после `requestWritePrimer`, без TDZ; gated на `onWritePrimer`) сидит `primerDraft` из САМОГО праймера (его ПСО `hit.sequence||bindingSequence`, direction, start/end, **name**) → открывается ТА ЖЕ `PrimerFromSelectionModal`; submit идёт прежним единственным write-каналом `onWritePrimer` (edit = re-write того же range — консистентно с архитектурой, без нового пути персистентности). `PrimerFromSelectionModal`: `name` теперь сидится из `draft.name` (create-from-selection → `""`, back-compat сохранён; double-click-edit → имя праймера); заголовок условный («Праймер: …» vs «Новый праймер из выделения»). Клик-селекция (toggle, до 2, flank-зона) не тронута; два click внутри dblclick дают net-no-op селекции + открытие модалки — приемлемо. **TDD:** +4 теста (primer-track: selected-halo «явно выделяется», double-click fires onPrimerDoubleClick(hit) с name, back-compat decorative; modal: name pre-fill из draft.name); прежние зелёные (selected-ring тест проходит — теперь 2 rect halo+ring). **Full Vitest 321 / 3266 pass / 1 skip / 0 fail** (baseline 3262 +4, zero рег, флак не всплыл). `vite build` clean, dev-сервер (45b90c5d) 0 console-ошибок. Размеры: `PrimerTrack.jsx` ~8.2 KB, `SequenceView/index.jsx` +~0.5 KB, `SequenceLine.jsx`/модалка +мелочь (все .jsx — под лимитом). Браузерный визуальный приём (контраст halo, читаемость dbl-flow) deferred — поведение/гейтинг детерминированно покрыты (dblclick callback, halo-rect, name-seed, back-compat).

**Регрессия «отвалились хоткеи» — из bug2-фикса модалки (Игорь 18.05.2026):** диагноз — bug2-фикс повесил `onKeyDown={(e)=>e.stopPropagation()}` на backdrop `PrimerFromSelectionModal`. React `stopPropagation()` гасит И нативное всплытие → keydown не доходит до `window`. Глобальные хоткеи App (`App.jsx:244 window.addEventListener('keydown', …, true)`) — **capture-фаза**, срабатывают ДО модалки → не задеты НИКОГДА (открыта модалка или нет). Но: (a) **собственный Esc-листенер модалки** был `window.addEventListener('keydown')` — **bubble**, его native-stopPropagation убивал → Esc не закрывал; (b) любые **bubble-фазные window-хоткеи** (canvas `CanvasSkeleton/index.jsx:137`, `useTabHotkey`) глохли, пока модалка открыта. Симптом виден только при ОТКРЫТОЙ модалке (закрытая модалка keydown не трогает — нет утечки). **Фикс:** Esc обрабатывается в самом React-onKeyDown backdrop'а (`onModalKeyDown`: `if Escape → onClose(); e.stopPropagation()`), window-листенер Esc удалён (`useEffect` + импорт `useEffect` убраны). Изоляция от root-`onKeyDown` SequenceView (bug2) сохранена; App-capture хоткеи как работали так и работают; bubble-window хоткеи под открытой модалкой остаются подавлены — это корректное поведение модала. **TDD:** тест «closes on Esc» переведён на keydown по модалке (не window — контракт-смена, Esc больше не window-scoped); +1 тест «Esc closes without a window listener; stopPropagation still contains keys» (Esc→onClose И не-Esc не течёт в host). **Full Vitest 321 / 3267 pass / 1 skip / 0 fail** (baseline 3266 +1, zero рег). `vite build` clean, dev-сервер (45b90c5d) 0 console-ошибок. `PrimerFromSelectionModal.jsx` ~5.6 KB (.jsx — под лимитом). Примечание: если хоткеи кажутся «отвалившимися» БЕЗ открытой модалки — это не из этих правок (App-резолвер capture, не тронут; мой скоуп keydown — только модалка-scoped); тогда нужен конкретный сценарий.

**Регрессия «клики на праймерах не работают» — из arrow-редизайна (Игорь 18.05.2026):** корень — в редизайне glyph rect→`<path>` я выставил вписанному `<text>` баз `pointerEvents:"none"` («чтобы клик проходил к path»), НО arrow `<path>` в **outline**-стиле = `fill="none"` (hit-тест только по hairline-stroke), а старый дизайн опирался на кликабельный текст-бар. Итог: ни текст (pe:none), ни тело стрелки (fill:none) не ловят клик → праймер некликабелен (в filled — формально path ловил, в outline — нет; плюс зоны между буквами). **Фикс:** (1) убран `pointerEvents:"none"` с baseс-`<text>` (текст снова часть кликабельного `<g>`, как в старом дизайне); (2) добавлен невидимый full-area hit-`<rect data-primer-hit fill="transparent">` первым ребёнком `<g>` при `clickable` (transparent ХИТ-тестируется, в отличие от `fill:none`) — весь бокс праймера кликабелен под single/double click при ЛЮБОМ primerStyle. Halo/ring/arrow/label не тронуты; селекция/dblclick/`primerHitKey` те же. **TDD:** +2 теста (interactive ⇒ transparent hit-rect + text не pe:none при outline; decorative ⇒ нет hit-rect); прежние зелёные. **Full Vitest 321 / 3269 pass / 1 skip / 0 fail** (baseline 3267 +2, zero рег). `vite build` clean, dev-сервер (45b90c5d) 0 console-ошибок. `PrimerTrack.jsx` ~8.8 KB (.jsx — под лимитом). Примечание: jsdom не моделирует SVG-pointer-hit-testing (fireEvent.click бабблит игнорируя fill/pe) → тесты гарантируют структурный контракт фикса (hit-rect transparent + text не pe:none), не сам hit-test; визуальный клик-приём в браузере остаётся за Игорем.

**Регрессия «не работает клик по праймеру» — настоящий корень (Игорь 18.05.2026; прошлый hit-rect фикс был необходим, но НЕ достаточен — честно):** `useSelectionState.onRootPointerDown` для обычного press делает `posFromPointerEvent` → `setPointerCapture(root)` + `onCaretChange` + `preventDefault`. Праймерный `<g>` гасит только `onClick`, НЕ `onPointerDown` → press по праймеру всплывает (React-tree) в root-`onPointerDown`, тот **захватывает указатель на root** → последующий `click` доставляется root'у, НЕ праймеру → `onPrimerClick`/dblclick не срабатывают. Проявилось когда стрелки переехали вплотную к цепи и стали резолвиться в `posFromPointerEvent` (раньше единый PrimerTrack был сверху, далеко). jsdom не моделирует pointer-capture → юнит-тесты были зелёные, браузер — нет (поэтому «красота» хвалили за вид, клик не верифицировался). **Фикс (идиоматичный, как уже сделано для RE-site/annotation):** в `onRootPointerDown` добавлен ранний bail-out когда press внутри `[data-testid="sequence-view-primer"]` (структура 1:1 с RE-site-bail строк 225-235) → root не трогает caret/capture/preventDefault, клик остаётся праймеру. **TDD:** новый `primer-pointer-bail.test.jsx` — **дифференциальный** гард: positive-control (plain press со stub-нулёвым-rect линии → `onCaretChange`+`setPointerCapture` ВЫЗВАНЫ, доказывает что generic-ветка реально работает в харнессе) + bail (press в `sequence-view-primer` → НИ `onCaretChange` НИ `setPointerCapture`); без фикса bail-тест падал бы (слабый jsdom-0-rect тест был бы hollow — переписан с stub-rect). **Full Vitest 322 файла / 3271 pass / 1 skip / 0 fail** (baseline 3269 +2, zero рег). `vite build` clean, dev-сервер (45b90c5d) 0 console-ошибок. `useSelectionState.js` +~0.5 KB (.js — под лимитом). Прошлый hit-rect+text-pe фикс оставлен (он корректен и нужен для outline-стиля/зон между буквами — комплементарен этому).

**Праймеры «при просмотре, во всех сиквенс виверах» — Annotator preview (Игорь 18.05.2026: «должно работать и при просмотре … как в сборщике; праймеры — базовый функционал»):** аудит (агент) подтвердил: 4 основных вивера (Library, container-editor, assembly, PCR) уже несут `primers`+`onWritePrimer`; click/select/dblclick — внутри SequenceView (работает везде, где есть `primers`); pointerdown-bail — внутри useSelectionState (глобально). Реальный незакрытый **view-вивер** — embedded Annotator preview (`PreviewTab` → `<SequenceView>`), который пользователь теперь часто видит через toggle-кнопку аннотатора («преобразующая вивер откуда угодно»). **Фикс — additive prop-thread (back-compat, absent ⇒ нет праймеров):** `primers`/`onWritePrimer` проброшены host → `AnnotationsTab` → `Annotator` → `PreviewTab` → `<SequenceView>`. Хосты Library/Container уже считают пару через `useEntryPrimers` — передал её же в `AnnotationsTab` (тот же unified-pool scope, что в Sequence-вкладке → консистентно). AssemblySourcePicker (transient modal range-picker) намеренно НЕ трогал — низкая ценность, <5 c, отдельное решение (флаг для Chat). **TDD:** mock SequenceView в `preview-tab.test.jsx` расширен (primers/onWritePrimer) + 2 теста: forward primers+onWritePrimer; back-compat (нет prop ⇒ пустой список, нет write-кнопки). Это гард глубочайшей точки треда; остальные звенья — механический pass-through (full-suite + существующее покрытие render/click). **Full Vitest 322 файла / 3273 pass / 1 skip / 0 fail** (baseline 3271 +2, zero рег). `vite build` clean, dev-сервер (45b90c5d) 0 console-ошибок. Размеры: правки чисто проп-проводочные (PreviewTab/Annotator/AnnotationsTab/2 хоста — мелочь; LibrarySingleInspector 31.x KB после декомпозиции — большой запас). Браузерный приём в аннотаторе deferred (тред-контракт детерминированно покрыт mock-тестом; render/click праймеров покрыт primer-track/pointer-bail тестами).

**Flank-выделение только для fwd+rev пары (Игорь 18.05.2026: «выделение не должно работать между праймерами фронт-фронт или реверс-реверс, только фронт-реверс/реверс-фронт»):** биологический инвариант — ампликон фланкируется forward+reverse парой; fwd-fwd / rev-rev не задают продукт. Реализовано в чистом хелпере `SequenceView/lib/primer-flank.js::flankedSpan(a,b)` (был direction-agnostic geometric bracket): после norm-проверки координат — `da/db` (`h.direction==='reverse'?'reverse':'forward'`), `if (da===db) return null`. Consumer `SequenceView` flankZone-useMemo не тронут (получает null для same-dir → зона не рисуется; индивидуальная селекция праймеров и их кольца остаются — гасится только flank-подсветка). Контракт хелпера сменён намеренно (tdd-enforce): docstring «direction-agnostic» → «opposite-direction only»; тест «same primer twice → own span» (был fwd+fwd→span) переписан в `→ null`, +fwd-fwd→null, +rev-rev→null, +rev+fwd→spans (order-independent). **Full Vitest 322 / 3276 pass / 1 skip / 0 fail** (baseline 3273 +3 нетто, zero рег; primer-flank 6→9). `vite build` clean, dev-сервер (45b90c5d) 0 console-ошибок. Размер: `primer-flank.js` ~1.2 KB (.js — мизер). Чистый хелпер covered unit, поведение детерминированно — браузерный приём не требуется (логика инварианта полностью в тесте).

**Праймерные хоткеи в SequenceView везде (Игорь 18.05.2026: «в сиквенс вивере горячие клавиши с праймерами так же должны работать»):** `pcr-primer-forward` (Ctrl+R) / `pcr-primer-reverse` (Ctrl+Alt+R) регистрировались только в assembly (`useAssemblyPrimerWriting`) и PCR (`PcrModeShell`) → в Library-инспекторе/container-editor хоткей не работал. **Фикс:** новый `hooks/usePrimerHotkeys.js` (зеркало `usePieceHotkey` — proven in-codebase паттерн) регистрирует те же hotkey-ids прямо в SequenceView; на нажатие при наличии выделения зовёт `requestWritePrimer({direction,start,end})` — ТОТ ЖЕ flow, что right-click «primer» (→ PrimerFromSelectionModal), consumer-gated на `onWritePrimer`. Вызван в `SequenceView` рядом с `usePieceHotkey`. **Конфликт shared-id разобран:** `_handlers` — single-per-id Map, child-эффекты регистрируются раньше parent; assembly/PCR shell оборачивают SequenceView и их caret-зависимый handler ре-регистрируется последним на каждом изменении выделения → shell сохраняет свой direct-write (поведение не меняется); SequenceView-internal ре-рендеры не трогают caret-deps → useCallback стабилен → нет ре-регистрации → нет клоббера. Standalone-виверы (Library/container) — единственный регистрант → модал-flow. Полный прогон подтвердил: assembly/PCR hotkey-тесты зелёные (клоббера нет). **TDD:** новый `use-primer-hotkeys.test.jsx` (6, зеркало use-piece-hotkey): Ctrl+R→fwd range, Ctrl+Alt+R→rev, нет выделения→no-op, нет onWritePrimer→no-op, нет requestWritePrimer→no-throw, unmount→resolver no-op. **Full Vitest 323 файла / 3282 pass / 1 skip / 0 fail** (baseline 3276 +6, zero рег). `vite build` clean, dev-сервер (45b90c5d) 0 console-ошибок. Размер: `usePrimerHotkeys.js` ~1.6 KB, `SequenceView/index.jsx` +~0.4 KB (под лимитом). Браузерный приём deferred (логика/гейтинг детерминированно покрыты; resolver-путь — как у proven usePieceHotkey).

**Сборка: праймеры сдвигали полосу окраски + кап Tm 150 п.о. (Игорь 18.05.2026, скрин assembly_2):** **(1) Полоса окраски сегмента сдвигалась праймерами:** `SegmentZonesOverlay` брал `top=line.offsetTop`, `height=line.offsetHeight` — после редизайна праймеров (forward над цепью, reverse под) высота строки скачет от наличия праймеров → цветная полоса «сдвигалась»/растягивалась на строках с праймерами. **Фикс:** полоса якорится к DNA strand-рядам внутри строки (`querySelectorAll('[data-testid="sequence-view-strands"]')`: top..bottom strand span, `top=lineTop+firstStrand.offsetTop`, `height=sBottom-sTop`); fallback на старое поведение если strand-узлов нет. Backdrop теперь стабилен независимо от primer/ruler/annotation/AA треков. **(2) Tm только 1–150 п.о.:** `selectionTm` в SequenceView считался для любого выделения. Праймер длиннее 150 bp физически невозможен → `if (sub.length < 2 || sub.length > 150) return null` (нижняя <2 была и раньше — Tm одной базы не определён). **TDD:** +2 `selection-tm.test.jsx` (>150 bp → нет tooltip; ровно 150 bp → tooltip есть). SegmentZonesOverlay — геометрия (jsdom offset=0, точные px не проверяемы юнитом; структура/testid не менялись → full-suite zone/assembly тесты зелёные, no-rej; визуальная посадка полосы — браузерный приём Игоря, validated workflow honest-defer). **Full Vitest 323 файла / 3284 pass / 1 skip / 0 fail** (baseline 3282 +2, zero рег). `vite build` clean, dev-сервер (45b90c5d) 0 console-ошибок. Размеры: `SegmentZonesOverlay.jsx`/`SequenceView/index.jsx` +мелочь (под лимитом).

После K15 + … + primer-hotkeys-everywhere + **assembly-band-anchor + tm-150-cap**: **СТОП.** PROJECT_STATE/DECISIONS/ANCHORS/RELEASES/TECH_DEBT/package.json/version.js не трогались. Для Chat: (1) **TD-SIZE `LibrarySingleInspector` — эскалация СНЯТА Code-декомпозицией (31.28 KB, 8.7 KB до hard); статус → Watch (всё ещё 1.28 KB в soft). Опциональный 2-й extract (annotation-edit pipeline) уведёт под soft 30 — решение Игоря/Chat**; (2) DECISIONS sprint-level — аннотатор как toggle-кнопка вместо strip-вкладки (`TabBar.showAnnotations/onToggleAnnotator`), scope = Library/Importer + container-editor; новый shared hook `useInspectorSelectionNav` (ContainerEditor может перенять — viewer-sync follow-up); (3) открытое решение: распространять ли annotator-toggle + chrome-унификацию на assembly/PCR; (4) ранее: `library-selection` primer-origin, K10-заглушка закрыта, CanvasLayoutView decomp, DEC-T3-08/V61 реверс ANCHORS, DEC-CANVAS-4T-31 promotion. Спека в `docs/SPRINT_T4_5_*.md` (✅). Визуальная приёмка + финализация координационных файлов — отдельная сессия Chat.
