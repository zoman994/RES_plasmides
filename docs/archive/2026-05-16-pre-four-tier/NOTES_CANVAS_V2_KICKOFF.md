# NOTES_CANVAS_V2_KICKOFF.md

> **Статус:** черновик размышлений, не спека.
> **Создан:** 11.05.2026 поздний вечер, kickoff-разговор Chat ↔ Игорь после Code FIX1.
> **Назначение:** удержать paradigma SKELETON-V2 между сессиями. После compact эта записка должна быть достаточной чтобы Chat восстановил контекст и продолжил.

---

## 1. Сдвиг режима работы

После цепочки «спека → Code → STOP → визуальная приёмка отдельной сессии» (M-X.7a 3-fail, Catalog Polish FIX→FIX2, SKELETON v1+FIX1) Игорь предложил отказаться от формальной приёмки для phase где paradigma ещё формируется.

**Новый режим:**
- Игорь правит код напрямую (становится Code-агентом сам).
- Chat не пишет тип-A спеки наперёд.
- Триггер Chat'а: «посмотри что получилось», «давай зафиксируем». Chat читает diff, фиксирует решения, ловит расхождения, обновляет DECISIONS/COMPONENT_MAP/CURRENT_TASK post-factum.
- ask_user_input_v0 multiple-choice — НЕ работает в этой фазе, Игорь думает вслух не выбирая.

**Что Chat НЕ делает в этом режиме:**
- Не пишет SKELETON-V2 спеку наперёд.
- Не задаёт вопросы стилем «вариант A или B».
- Не настаивает на закрытии всех развилок до старта.

---

## 2. Paradigma SKELETON-V2 (что зафиксировано)

Шифт от commits-driven «контейнер только от выполненной операции» к **assembly canvas** «биолог собирает план до материалов».

**Стартовая сцена нового проекта:**
- На canvas автоматически появляются 2 пустых контейнера + operation между ними.
- Контейнеры — `container.sequence = null/''` (placeholder).
- Operation — `operation.kind = null` (TBD, биолог выберет).
- Связь между ними нарисована (стрелка/edge).

**Назначение:** убрать страх биолога перед первым действием. Готовая мизансцена «two reagents + reaction → product» снимает blank-canvas paralysis.

**Заполнение placeholder'а — клик на контейнер → выпадающий Tree-picker** (subset Library: plasmids / fragments / primers + спец-пункт «Сборка из праймеров»). Выбор → container.sequence заполняется, рендер из placeholder в filled.

**Альтернативный путь заполнения** — drag из левого Tree (Library) **прямо на canvas**. Если drop на placeholder → заполнение. Если drop на свободное место → новый filled container.

**Двойной клик на filled container** → открывается SequenceView editor (FIX1 уже работает): write primers / select fragments / edit annotations / inline rename.

**Connection auto-detect:** связь между двумя filled containers автоматически подстраивается под тип сборки (oligo annealing / Gibson / PCR / restriction-ligation / KLD / ...). Manual override через popover на стрелке.

---

## 3. Lifecycle baseline 2+op

**Удаление:** биолог может удалить любой пустой контейнер / операцию без вреда. Удалил оба исходных — canvas стал пустым, можно добавить новые через «+».

**Добавление:** через «+ кнопку» на canvas. Появляется новый placeholder контейнер. Аналогично «+ operation».

**Drag from Tree → canvas:** Tree-контейнер (из Library) сразу появляется на canvas как filled (не через placeholder-step).

**Lifecycle rule:** canvas — **free workspace**, не sticky baseline. Стартовые 2+op = convenience при создании нового проекта; дальше живёт обычной жизнью UI (add/remove/connect через drag).

---

## 4. DEC-CANVAS implications (пересмотр)

⚠ **DEC-CANVAS-02 «все проектные контейнеры на canvas всегда»** — умирает в исходной формулировке. Контейнеры теперь могут быть трёх kind'ов:
1. From commit (output operation) — frozen-ish.
2. Placeholder (sequence=null) — пустой.
3. Imported from Tree (drag) — filled, не commit-derived.

Новая формулировка нужна. Возможно: «все контейнеры в `state.containers[]` рендерятся на canvas; категория контейнера — derived от наличия sequence + ссылок из operations».

⚠ **DEC-CANVAS-03 «immutable; каждая операция → новый container»** — переформулируется. Filled container становится immutable, **когда** используется как input в operation (паттерн «журнал лаборатории» — моя рекомендация была B, Игорь оставил открытым). Placeholder mutable до заполнения.

⚠ **DEC-CANVAS-05 «топология решает категорию»** — placeholder не имеет topology, не категоризуется. После заполнения — обычная категоризация (linear=Материал / circular=Итог).

⚠ **DEC-NAV-TREE-PRIORITY-*** (Tree → drag = импорт в .bodge) — fortify: drag **прямо на canvas** создаёт там container. Не через Library как promo step.

DEC-CANVAS-01/04/06/07/08 — не задеты paradigma shift'ом, держатся.

---

## 5. Открытые вопросы (не блокеры, разберёмся в коде)

**Q1: Сборка из праймеров — container.kind или operation.kind?**
- Container-side: kind='oligo-assembly', primerIds=[p1,p2], sequence=computed inline. Один клик, всё внутри.
- Operation-side: отдельный 'anneal' operation с output-container'ом. Чище data model.
- **Игорь:** разберёмся механизмом потом, пока оставить незакрытой опцией. В скелете Tree-picker показывает пункт «Сборка из праймеров» как обещание UX.

**Q2: Auto-detect operation.kind по input types.**
- В скелете — implement (pair→kind logic) или оставить null до manual override?
- Не отвечено.

**Q3: Tree-picker внутри placeholder — full Tree или подмножество?**
- Полное Library Tree дублируется или сокращённый список?
- Не отвечено.

**Q4: Mutability — какой паттерн?**
- A: свободная редактируемость (потеря истории при overwrite).
- B: журнал лаборатории (frozen on use в operation) — рекомендация Chat.
- C: Git-style explicit commit.
- Игорь: «обсудим ещё», финального выбора нет. **Скелет в любом случае может начать с A или B — выбрать при коде.**

**Q5: Drop на filled container** (drag нового Tree-item на уже заполненный).
- Replace? Merge? Refuse (no-op)?
- Не обсуждали.

---

## 6. Что меняется в скелете когда Игорь будет править

Файлы которые наиболее вероятно тронутся:

- `editor/ContainerEditorSkeleton.jsx` — открытие editor для placeholder контейнера должно быть disabled (нечего редактировать) или показывать prompt «сначала наполните контейнер». Сейчас editor требует sequence.
- `canvas/ContainerBlock.jsx` (5.21 KB) — добавится empty state: dashed border, иконка placeholder, click → Tree-picker.
- `canvas/OperationNode.jsx` (1.96 KB) — добавится empty state: иконка «?», click/popover → kind picker.
- `canvas/CanvasLayoutView.jsx` (4.60 KB) + `canvas/CanvasGraphView.jsx` (5.50 KB) — drop targets на свободное место + «+» кнопки.
- `fixture-canvas-skeleton.js` (7.99 KB) — переписывается. Старая фиксtura «5 pre-baked containers + 2 draft sessions» → «default empty state с baseline 2+op». Опционально оставить advanced state как 2-й view для демо.
- `store/skeleton-state.js` (8.55 KB) — расширяется: sequence/kind nullable, новые actions (`fillContainer`, `chooseOperationKind`, `addPlaceholderContainer`, `addPlaceholderOperation`, `removeContainer`, `removeOperation`, `connectContainerToOperation`).
- Возможно новые компоненты: `TreePickerPopover.jsx`, `OperationKindPopover.jsx`.
- Tree-picker внутри placeholder — может переиспользовать `Library/tree/` компоненты или быть отдельным subset.

**Скелетные тесты** — переделываются. 12 v1 тестов + 2 v1.1 тестов могут потерять актуальность когда baseline сдвигается.

**FIX1-артефакты уцелеют:**
- `derive-primers.js` — смысл расширяется (primers могут derive из oligo-assembly containers).
- `onAnnotationEdit` flow в editor — работает для filled containers как раньше.
- `commitAnnotationEdit` action — без изменений.

---

## 7. ARCHITECTURE_CANVAS_MODEL.md

Приёмка #2 отозвана (Игорь подтвердил). Документ остаётся на диске как референс old state — не удаляю, не архивирую. Перепись v2 после того как paradigma застаканется в коде.

---

## 8. Что Chat делает в новом режиме

1. **Ждёт триггера** «посмотри что получилось» / «давай зафиксируем».
2. **Читает diff** через `Filesystem:read_text_file` затронутых файлов.
3. **Сравнивает с этой запиской** + COMPONENT_MAP + DECISIONS — что подтверждается, что отклоняется от kickoff'а.
4. **Фиксирует:**
   - DEC-CANVAS-V2-XX в DECISIONS.md (после того как Игорь подтвердит что решение стабильно).
   - Изменения в COMPONENT_MAP.md (новые компоненты, DEAD, переезды).
   - Update CURRENT_TASK.md в зависимости от стадии (in-progress / готов к ревью / закрыт).
5. **Ловит расхождения** с другими частями кодовой базы — Library tree, ProjectCommits, derive-primers etc.
6. **Не пишет спеки наперёд.** Документирует post-factum.

---

---

## 9. Сессия 15.05.2026 — Walkthrough пайплайнов + декомпозиция на 4 спеки

> **Контекст.** После R5-R9 OPS-BIO (13-14.05) и закрытия V58-V64 bug-sessions (13-14.05) Игорь предложил перед следующим спринтом утрясти полную UX-модель «как биолог взаимодействует с программой» через walkthrough биологических пайплайнов. Цель — найти несостыковки в Chat'овом понимании модели **до** написания спек.

### 9.1 Walkthroughs обсуждены

1. **Restriction-ligation** (pET28a backbone + mCherry insert через NdeI/XhoI) — классический клонирование-кейс.
2. **Site-directed mutagenesis** (QuikChange K12R в mCherry) — pointwise мутация.

Детали шагов — в истории чата. Главные находки → зафиксированные решения ниже.

### 9.2 Закрытая модель Canvas V2 (16 решений)

| # | Решение | Статус |
|---|---|---|
| 1 | Один SequenceView, operation-aware режим (header/footer/inline panels меняются под op, скелет один) | ✅ |
| 2 | Window system: **full-screen viewer + mini-canvas в углу** (пересмотр см. §9.9). Параметры mini-canvas — развилка в Spec 1 | ✅ |
| 3 | Tabs вьюверов справа, TAB hotkey переключение между tab'ами | ✅ |
| 4 | Контейнер первичен — op рождается только после выбора template | ✅ |
| 5 | Op рождается двумя путями: ромб с dropdown выбора матрицы ИЛИ hover на контейнере → иконки операций (гибрид, щупаем оба) | ✅ |
| 6 | Junction = контракт между соседями в графе (не ярлык) | ✅ |
| 7 | Поля junction: `kind` (8 типов из v0.5) / `overlapTarget` (left/right/both) / `overlapLength` xor `overlapTm` / `endRequirements` / `status` (auto/manual) | ✅ |
| 8 | Junction не рождается без op-цепочки между контейнерами | ✅ |
| 9 | Каскад через reactive Zustand selectors (junction → derived primer state → пересчёт авто) | ✅ |
| 10 | overlapLength ↔ overlapTm — toggle в popover (выбор биолога) | ✅ |
| 11 | Уведомление о пересчёте — тихий corner toast для не-критичных; **явный confirmation gate для критичных** (заказ олигов, transform, etc., см. §9.9) | ✅ |
| 12 | Валидация пар junction вокруг op (конфликт overlap targets — warning) | ✅ |
| 13 | Product = live preview сразу, состояния `incomplete`/`disconnected`/`valid`/`executed` | ✅ |
| 14 | Product на canvas сразу при появлении inputs, в Tree только при valid+save | ✅ |
| 15 | Disconnected product = visual gap (open ring / разрыв линии) + warning badge | ✅ |
| 16 | Primer pool — один глобальный список с флагами projectId/opId, архитектура — отдельная сессия | ⏸ |

### 9.3 Walkthrough PCR в закрытой модели (для проверки понимания)

1. Drag pET28a из Tree → container A на canvas.
2. Op «PCR» рождается через ромб+dropdown(template=A) ИЛИ через hover-иконку на container A. Input=A, output=виртуальный product.
3. Двойной клик на op → телепорт в вьювер A в **PCR-режиме** (новый tab справа, canvas-колонка слева подсвечивает op).
4. PCR-режим имеет три уровня: дефолт (selection → suggestion) / tweak (drag handles на 5'-концах) / профи (с самого старта drag handles + reuse из pool).
5. TAB → переключение между открытыми вьюверами.
6. Junction Gibson справа от PCR: popover с overlapTarget + overlapLength/Tm toggle.
7. Изменил junction → primers PCR-op'а пересчитались автоматически (reactive selectors). Тихий toast в углу.

### 9.4 Открытые вопросы

| Q | Тема | Статус | Куда |
|---|---|---|---|
| Q1 | Output product попадает в Tree автоматически или только при valid+save? | ✅ Закрыто 15.05 | Только при valid+save, на canvas сразу |
| Q2 | Primer pool архитектура (View / inline tab / pool-вьювер) | ⏸ Отложено | Отдельная сессия после Spec 1-4 |
| Q3 | Mutagenesis vs PCR boundary (добавление overhangs — мутагенез?) | ⏸ Отложено | Разведём фактом при реализации Mutagenesis-op |
| Q4 | `executed` workflow state (биолог сделал на бенче → promote в Tree) | ⏸ Отложено | Отдельный sprint после Spec 4 |

### 9.5 Декомпозиция на 4 спеки

Единая PCR-спека = 60-80 KB → антипаттерн §2 + гарантированный M-X.7a 3-fail. Дробим на 4 слоя.

```
Spec 1 (Window System) ──┬──> Spec 3 (PCR Operation Mode) ──> Spec 4 (Live Product Preview)
                         │         ▲
Spec 2 (Junction Contract) ──────┘
```

#### Spec 1 — Window System Foundation (тип A, ~20-25 KB)

**Что:** инфраструктура **full-screen viewer + mini-canvas в углу** (пересмотр 15.05, см. §9.9) + tabs sub-bar + TAB hotkey + breadcrumb tabs (`🔬 PCR · pET28a → amplicon_42`) + canvas-anchor в mini-canvas подсвечивает активный tab + frozen-container UI (⚓ DEC-MUTABILITY) + dock-state persistence.

**Что НЕ входит:** PCR-логика, junction-contract, live product, primer pool. Tabs открывают контейнер в обычном SequenceView (текущий `ContainerEditorSkeleton`-стиль).

**Зацепляет:** `ContainerEditorSkeleton` эволюционирует в window system (не параллельно — иначе Этап 5 kill добавляется).

**Риск:** "многооконность" после реализации может ощущаться иначе чем описано — приёмка особенно важна **до** старта Spec 2.

#### Spec 2 — Junction Contract + Reactive Cascade (тип A, ~25-30 KB)

**Что:** data model junction (`kind`/`overlapTarget`/`overlapLength|Tm`/`endRequirements`/`status`) + popover UI + reactive selectors (tails-from-junction, ends-from-junction) + validation rules между соседними junction'ами + corner toast notifications.

**Что НЕ входит:** конкретное использование в PCR (это Spec 3). Junction popover показывает поля, primer пересчёт демонстрируется на mock-op'е или скрыт за feature flag.

**Риск:** reactive selectors могут породить cascading recompute на больших проектах (10+ ops, 20+ junctions). Performance budget — обязательный пункт спеки.

#### Spec 3 — PCR Operation Mode (тип A, ~30-35 KB)

**Что:** PCR-aware режим в SequenceView (3 уровня: дефолт/tweak/pro) + primer suggestion wiring через `local-primer-design.js` + drag handles на 5'-концах + Tm пересчёт + reuse picker из primer pool + op-ромб state на canvas (dropdown template + hover-icons на контейнере, гибрид).

**Что НЕ входит:** live product (Spec 4), Mutagenesis (отдельная op позже).

**Harvest map обязателен:** `JunctionBlock.jsx` (29 KB) + `JunctionDNA.jsx` (14 KB) + `local-primer-design.js` (20 KB) + фрагменты `PlasmidUseWizard.jsx` (39 KB). Без этого Chat **не пишет спеку** — повторим M-X.7a 3-fail.

**Риск:** harvest из v0.5 — это куда уйдёт половина времени. v0.5 код не идиоматичен v0.6 store.

#### Spec 4 — Live Product Preview (тип B, ~15-20 KB)

**Что:** product-container на canvas сразу при появлении op с inputs. State machine `incomplete`/`disconnected`/`valid`/`executed`. Visual gap для disconnected (open ring / разрыв линии) + warning badge с tooltip («Gibson overlap = 0 nt», «sticky ends mismatch»). Реактивная sequence assembly (изменился junction → пересчиталась sequence). Vьювер product'а как обычный tab.

**Что НЕ входит:** `executed` workflow state UI (promote в Tree) — отдельный sprint позже.

**Bio-validation rules:** audit что уже реализовано в R5-R9 (DEC-OPS-* от 14.05) — переиспользуем, не пишем заново.

**Риск:** R5-R9 bio-validation может быть scattered по op-handler'ам — нужна централизация в reactive layer.

### 9.6 Принципы дробления (новая методология)

- Спеки дробим до тех пор пока **одна спека = одна вещь**. Дальнейшая декомпозиция — норма, не исключение.
- Между спеками — **acceptance gate** обязательно (compact → новая сессия → пробег → решение FIX или next).
- Acceptance gate удваивает количество приёмок, но защищает от каскада ошибок (M-X.7a 3-fail прецедент).
- Параллельные спеки — рискованно для интеграции, по умолчанию последовательно. Spec 1 + Spec 2 теоретически можно параллельно (независимы), но при интеграции в Spec 3 могут быть конфликты. Безопаснее 1 → 2 → 3 → 4.

### 9.7 Статус Q1-Q5 из блока §5 (11.05 kickoff)

| Q11.05 | Тема | Статус 15.05 |
|---|---|---|
| Q1 | Сборка из праймеров — container.kind или operation.kind | ⏸ Остаётся открытым, разведём при PCR-спеке |
| Q2 | Auto-detect operation.kind по input types | ✅ Реализовано в Sprint v0.8.2-skeleton-v2 через `detectJunctionKind` heuristic (DEC-CANVAS-V2-DETECT-KIND-HEURISTIC-01) |
| Q3 | Tree-picker subset внутри placeholder | ✅ Реализовано через `PlaceholderTreePicker` (4 секции: search + проект + коллекция + другие проекты + библиотека-link) |
| Q4 | Mutability pattern (A/B/C) | ✅ Закрыто 15.05 — B1 freeze-on-use-in-operation, ⚓ DEC-MUTABILITY-FREEZE-ON-USE-01 в ANCHORS.md |
| Q5 | Drop на filled container (replace/merge/refuse) | ⏸ Не обсуждали, рабочая стадия — no-op |

### 9.8 Что дальше

1. **Compact обязателен** между этой сессией и Spec 1.
2. После compact'а — **Spec 1 Window System Foundation** (тип A, ~20-25 KB).
3. Перед Spec 1 — стартовый пакет §1 playbook (CLAUDE/BUGS/CURRENT_TASK/PROJECT_STATE) + дочитать **эту записку §9** + `COMPONENT_MAP.md` + `docs/ARCHITECTURE_3LEVELS.md` (DEC-NAV-3LEVEL-01 контекст).
4. Acceptance gate Spec 1 → compact → Spec 2 → ... и т.д.

---

## 9.9 Поправки + F5 Onboarding + honest assessment (15.05.2026, после повторной проверки)

### 9.9.1 Что изменилось после первой записи §9

При повторной проверке файла обнаружены устаревшие решения, пересмотренные позже в сессии. Поправки в таблицах 9.2 / 9.7 / Spec 1 в 9.5 уже применены. Обоснования ниже (важно для Spec 1 + будущих спек).

**1. Решение #2 (window system) — пересмотрено.** Было: «узкая левая колонка 250-300 px». Стало: **full-screen viewer + mini-canvas в углу**.
- Обоснование: на ноутбуке 1366×768 четверть экрана под canvas-колонку теснит SequenceView. Full-screen + mini-canvas освобождает максимум места под последовательность, биолог сохраняет ментальную привязку к canvas через mini-canvas-anchor (vs full-screen без anchor'а — «как вернуться»).
- Параметры открыты для Spec 1: позиция (правый-верхний? левый-нижний?), размер (200×150? 250×200?), interactivity (просто miniature или clickable для переключения tab'ов).

**2. Решение #11 (toast vs gate) — уточнено.** Было: «тихий corner toast, пропадает». Стало: **toast для не-критичных пересчётов, явный confirmation gate для критичных действий**.
- Обоснование: каскадный пересчёт primers на изменение junction — критическая логика. Если в каскаде баг, биолог получит тихо неправильный primer для синтеза → закажет его за $50 → узнает об ошибке через 2 недели после неудачной реакции. Confirmation gate перед заказом олигов = explicit user signoff с показом источников каждого primer в графе. Не магия с тихим toast'ом.
- Добавлено в риск-карту Spec 3 PCR Operation Mode.

**3. Q4 mutability закрыт.** ⛓ DEC-MUTABILITY-FREEZE-ON-USE-01 в ANCHORS.md (B1 freeze-on-use-in-operation). Перед Spec 1 skeleton-state должен поддерживать `frozen` semantics. Полные trade-offs и выбор B1 vs B2/B3 — в записи ANCHORS.

**4. Аргументация B1 vs B2 vs B3 (резюме из ANCHORS для удобства).**
- **B1 freeze-on-use-in-operation — выбран.** Мягчайший вариант. Биологически интуитивно: «пока не использовал — это просто карточка. Использовал — это реагент в реакции, не трогай».
- **B2 freeze-on-canvas-drop — отклонён.** Слишком строго: биолог положил, опечатался в имени — уже frozen, child-version из-за опечатки.
- **B3 freeze-on-save-to-Tree — отклонён.** Размывает Tree: черновики на canvas вне versioning'а.
- **Связь с git-слоем.** B1 = implicit pseudo-commit на момент использования. Git-слой (после F4 в roadmap) перекроет explicit commit/branch/diff, B1 останется fallback.

### 9.9.2 F5 Onboarding + Curated Examples — новый спринт в roadmap

**Тип:** B, ~15-20 KB. **Куда:** после F4 Live Product Preview, либо параллельно с F3 (не зависит от operation-aware viewer механики).

**Идея Progressive disclosure (Игорь, 15.05).**

Двухслойный продукт:

- **Слой 1 — Plasmid Viewer (SnapGene-like).** Первый запуск → биолог видит знакомое Library Workspace: дерево плазмид, plasmid map, аннотации, экспорт GenBank. Может остановиться здесь и использовать программу только как viewer. Не страшно, читается с первого взгляда.
- **Слой 2 — Assembly Designer (новое).** При «Собрать конструкт» → canvas + DAG + operations + junctions. «Магия» раскрывается тем кто захотел собирать. Биолог уже доверяет программе (Library работает).

Текущая архитектура уже это поддерживает — Library Workspace и Canvas являются разными режимами. F5 = **скрыть второй слой по умолчанию** для нового пользователя.

**Что входит в F5:**

1. **First-run dialog.** Первый запуск → «Что ты хочешь сделать?». Две кнопки: «Посмотреть плазмиду» (grand tour Library Workspace с pUC19, 2 мин) / «Собрать конструкт» (canvas с pre-baked примером pET28a+mCherry + интерактивный гайд 5-6 шагов).
2. **Curated `.bodge` examples.** Новый раздел в Library `🎓 Учебные проекты`. Каждый = `.bodge` файл с уже сделанным графом операций:
   - restriction-ligation pUC19+GFP,
   - Gibson assembly 3 fragments,
   - Site-directed mutagenesis K12R,
   - Golden Gate level-1.
   Биолог открывает → видит готовый DAG → может разобрать, повторить, изменить.
3. **Contextual hints.** One-shot popover при первом открытии canvas: «Двойной клик на контейнер открывает редактор. Кнопка + добавляет операцию. TAB переключает вьюверы». Один раз, dismissable forever.
4. **Видео-snippets опционально.** Где хостить MP4 — открытый вопрос (institutional clusters / YouTube unlisted / локальные файлы в .bodge?). Отложить решение до спеки.

**Что НЕ входит:**

- Tooltips на каждой кнопке — шум, биолог выключит на третий день.
- Принудительный tour без skip — раздражает.
- Длинные туториалы 15+ шагов — биолог не дочитает.

**Источник идеи:** ответ Игоря 15.05 — «обучение на примерах, интерактивное с отснятым материалом» + «в начале пользователь видит только библиотеку где почти снапген а потом попадает на канвас и видит всю магию».

### 9.9.3 Институтский тест (решено)

Игорь подтвердил: «Я разумеется отдам его на тест внутри института!». Снимает риск single-tester bias (см. honest assessment ниже п.7). Перед JOSS submission необходимы 2-3 биолога не из лаборатории Игоря на пробег workflow.

### 9.9.4 Honest assessment (без подыгрывания, 15.05.2026)

Игорь попросил мнение Chat без подыгрывания. Зафиксировано для сохранения после compact'а — это важная диагностика.

**Что в модели объективно сильное:**

1. Граф реакций как первичная сущность (vs SnapGene где сборка = wizard-blackbox). AI-readiness через структурированный DAG.
2. Reactive cascade junction → primers (vs v0.5 где биолог пересчитывал сам).
3. Live product preview с visual gap (раньше других показывает нестыковки).
4. Один SequenceView для всех контекстов — низкая когнитивная нагрузка.
5. .bodge как git проекта с DAG внутри — нет ни у кого.

**Что тревожит (риски):**

1. **Кривая обучения может убить продукт.** «Удобна только для тех кто привык» — не плюс, это риск. SnapGene выигрывает простотой первого впечатления. У BodgeGene много концепций перед первым полезным действием. → F5 onboarding критичен. **Mitigation: F5 в roadmap.**
2. **Window system — компромисс.** Текущее решение full-screen + mini-canvas лучше колонки слева, но всё равно гипотеза о поведении биолога, требует валидации на пробеге. **Mitigation: acceptance gate после Spec 1 до Spec 2.**
3. **Reactive cascade — инженерно красив, опасен.** Если в каскаде баг → биолог получает тихо неправильный primer для синтеза. **Mitigation: confirmation gate (решение #11 уточнено).**
4. **«AI-готовность» частично самообман.** Benchling AI + Latch уже делают AI на binary форматах. Реальное преимущество BodgeGene не «AI-readiness» в общем, а **agent-readiness** (LLM-agent может git pull → modify DAG → git push). Это сильнее, но дальше от текущего пользователя.
5. **Дробление на 4 спеки удваивает риск дрейфа.** Между Spec 1 и Spec 2 можно переосмыслить (как сегодня переосмыслили window system). **Mitigation: минимальный временной gap между спеками.**
6. **Mutability было откладывание** — закрыто 15.05 (B1 ⛓), no longer риск.
7. **Ты — единственный тестировщик** — закрыто Игорем: институтский тест запланирован.

**Что Chat не знает (нужно ответить позже):**

- Размер рынка (сколько биологов реально перейдут с SnapGene).
- Стоимость поддержки публичного продукта vs personal tool (5% vs 30-50% времени автора).
- Self-hostable vs SaaS — формообразующий выбор, должен закрыться до Spec 3 (влияет на backend, partner deals).

**Итог одной фразой:** архитектура сильная, потенциал реальный; технически на одно поколение впереди SnapGene; на UX-adoption — пока позади. F5 onboarding и институтский тест — решающие для adoption.

---

_Записка живая. Обновляется по мере того как Игорь правит код, приходит за анализом, или результатов walkthrough-сессий. Последнее обновление: 15.05.2026 — закрытая модель Canvas V2 + декомпозиция на 4 спеки + §9.9 поправки после повторной проверки._
