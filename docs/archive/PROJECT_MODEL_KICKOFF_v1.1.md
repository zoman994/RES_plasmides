# PROJECT_MODEL_KICKOFF.md — kickoff-результат архитектуры Project + Container + DAG

**Тип:** kickoff-документ архитектурной спеки (тип A по §13 playbook), pre-spec фаза.
**Статус:** ✅ kickoff завершён 28.04.2026; N+1 (28.04.2026, после compact) закрыл слабости 2/3/7/5 и нашёл 5 расхождений между моделью и реальным кодом — см. §4.1, §5.1. **Открытые: слабость 4 + большая часть §6.** Финальная архитектурная спека `ARCHITECTURE_PROJECT_MODEL.md` пишется в N+3 после закрытия N+2.
**Заменяет:** `docs/CONTAINER_ARCHITECTURE_DRAFT.md` (27.04.2026, статус «🟡 в обсуждении») — все его положения инкорпорированы либо явно отмечены как переформулированные.
**Дата:** 28.04.2026 (4-я сессия дня после Catalog Polish FIX-2 closure).
**Источник:** kickoff-обсуждение Chat ↔ Игорь.

---

## TL;DR

Введение **трёхслойной архитектуры**: Project (логическая единица) + Container (виртуальный операционный стол с одной активной молекулой и историей операций) + DAG (граф контейнеров и операций между ними). Канвас становится графом контейнеров; Construct view и Project Flow унифицируются на одной data-модели. История операций lazy (commits[] инициализируется только когда биолог что-то меняет). Library — пул контейнеров, портабельных между проектами через clone-on-import с frozen lineage. Primers — first-class сущность проекта параллельно контейнерам, с гибридным хранением (origin project + локальная копия с back-reference при reuse). Совместимость с `.dna` / `.gb` сохраняется на экспорте плазмиды; `.bodgegene` migration тривиальна.

Принципиальная фраза-якорь: **«Контейнер не пробирка, это абстракция, но очень чёткая, в которой каждая операция транслируется на стол молбиолога»** (Игорь, 28.04.2026). Из неё вырастают изоморфизм data ↔ протокол, разделение операций на внутри-/между-контейнерные, и принцип «контейнер дешёвый — каждая отдельная сущность на канвасе оправдана».

**N+1 итерация (28.04.2026, после compact + чтения реального кода).** Закрыты слабости 2/3/7/5 (см. §5.1). Найдено 5 расхождений между моделью kickoff'а и реальностью кода (см. §4.1): (1) migration `Сборка → 3 типа узлов` нетривиальна; (2) `parts[]` уже глобальный с per-project provenance — origin name collision; (3) `apiWarnings` нарушают разделение «внутри vs между»; (4) localStorage limit — реальная угроза, persistence sprint поднимается *перед* Project Model; (5) три истории (legacy mutations + commits + undo) требуют явной политики на migration v8→v9. Открытыми остаются слабость 4 (frozen snapshot data volume) + §6 (persistence формат, стартовая страница UX, граница project↔library, UI внутри контейнера).

---

## Содержание

- [1. Контекст и история обсуждения](#1)
- [2. Принятая модель — 16 ⚓ кандидатов в DECISIONS](#2)
- [3. Подробное обоснование модели](#3)
- [4. Закрытие слабости 1: External source / Primers / Primer-synthesized container](#4)
- [4.1. Расхождения с реальным кодом (N+1, закрытие слабости 9)](#4-1)
- [5. Слабости 2–9 — что осталось обсудить до спеки](#5)
- [5.1. Закрытие слабостей 2/3/7/5 (N+1)](#5-1)
- [6. Открытые архитектурные вопросы вне слабостей](#6)
- [7. Что упрощается / уходит из текущего UI и data-model](#7)
- [8. Совместимость и migration](#8)
- [9. План перехода в архитектурную спеку](#9)
- [10. Стоимость, риски, что выигрывает проект](#10)
- [11. Ключевые формулировки Игоря](#11)
- [Приложение A. Связь с уже сделанным](#A)
- [Приложение B. Что меняется относительно DRAFT 27.04.2026](#B)

---

## 1. Контекст и история обсуждения

### 1.1 Откуда пришёл запрос

После приёмки Sprint Catalog Polish FIX-2 (28.04.2026) Игорь сформулировал:

> «Давай сделаем стартовую страницу — создать проект либо открыть проект. Проект де факто логические операции, которые сводятся к получению одной либо нескольких версий одной конструкции. Начинается всё с поля проекта — можно выбрать существующий или создать новый. Далее мы попадаем на наш импортер — окно для наполнения проекта. Там мы из нашей библиотеки (для начала она общая для всех проектов) накидываем в проект то, что нам нужно. После чего оно агрегируется на канвасе. Проекты можно сохранять на жёсткий диск и подгружать из него.»

Это поглощает feature requests F2 (LIBRARY-CANVAS-PROJECT-MODEL), F3 (PASTE-TEXT-LIBRARY-FLOW), F4 (CANVAS-TAB) из BUGS.md, и трогает архитектуру глубже — не просто «library ⇔ canvas», а **project как first-class сущность** с persistence и многоуровневой моделью контейнеров.

Параллельно у нас уже существовал черновик `CONTAINER_ARCHITECTURE_DRAFT.md` от 27.04.2026 со статусом «в обсуждении», ожидавший kickoff-интервью. Этот документ — его результат.

### 1.2 Эволюция модели в ходе обсуждения

Каждое уточнение Игоря снимало развилку или разворачивало модель:

**Шаг 1 — контейнер как абстракция операционного стола.** «Контейнер не пробирка, это абстракция, но очень чёткая, в которой каждая операция транслируется на стол молбиолога.» → изоморфизм data ↔ протокол. Разные операции = разные контейнеры даже при идентичной стартовой молекуле.

**Шаг 2 — история как атрибут контейнера.** «История — это атрибут контейнера. Если контейнер есть в библиотеке, у него есть история.» → контейнер портативная единица между проектами вместе со своей историей. Library = пул контейнеров, не пул snapshot'ов.

**Шаг 3 — внутри vs между.** «Мы заходим в контейнер молекулы и там делаем операции. На канвасе видим конечную форму контейнера после этих операций.» → разделение операций. Внутри-контейнерные (mutate, cut-keep, PCR-amplify, fragment-insert) живут в commits[] контейнера, на канвасе невидимы. Между-контейнерные (assembly N→1, split 1→2) — узлы DAG.

**Шаг 4 — replace декомпозируется.** «Берём из второго контейнера на канвасе или из библиотеки, но контейнер всё равно попадает на канвас. Replace — это две последовательные операции внутри одного контейнера.» → source для insert всегда другой контейнер (не свободный текст). Replace = коммиты cut + insert в целевом контейнере.

**Шаг 5 — git по требованию.** «Возможно стоит git реализовать по требованию?» → принцип lazy git. Контейнер «как взят из library» = baseline без commits[]. Первая mutate-операция инициализирует commits[].

**Шаг 6 — importer закрывает external source, primers как сущность.** «Мы специально сделали максимально гибкий импортер. Все праймеры скорее всего будут жить внутри контейнера. Праймеры — сущности, живущие в рамках проекта, импортируются в общий файл.» → закрытие слабости 1: paste из текста = MoleculeContainer через importer, primers as first-class project entity параллельно контейнерам, primer-synthesized container как новый origin.

**Шаг 7 — гибрид primer-pool.** «Гибрид: primer хранится в проекте, где был создан (origin project), при reuse в другом проекте создаётся локальная копия с back-reference на origin.» → выбор стратегии хранения primer-pool.

### 1.3 Что закрыто, что остаётся

После сегодняшней сессии:

- **Принята модель** — 16 ⚓ кандидатов в DECISIONS (см. §2).
- **Закрыта слабость 1** (external source / primers — см. §4).
- **Зафиксированы слабости 2–9** (см. §5) — короткие развилки 2/3/7 закрываются за итерацию, фундаментальная развилка 5 требует отдельного фокуса.
- **Зафиксированы открытые архитектурные вопросы вне слабостей** (см. §6) — persistence формат, стартовая страница UX, граница project↔library в практическом UX, UI внутри контейнера, display-fold rules, inventory операций v1.
- **План перехода** — слабости 2–7 → следующая сессия (с обязательным чтением реального кода parts-slice / fragment-slice / plasmid-git перед спекой) → архитектурная спека ARCHITECTURE_PROJECT_MODEL.md → 4–6 sprint-спек реализации.

---

## 2. Принятая модель — 16 ⚓ кандидатов в DECISIONS

Базовое ядро (1–10) выросло из обсуждения шагов 1–5. Расширение (11–16) — закрытие слабости 1 (см. §4).

**1. Контейнер = instance молекулы в проекте + история операций.** Разные операции на одинаковой стартовой молекуле = разные контейнеры (биологически = разные tubes на столе).

**2. Изоморфизм data ↔ протокол.** Каждая операция в data-модели = реальная процедура в боксе.

**3. Внутри-контейнерные операции** (mutate, cut-keep, PCR-amplify, fragment-insert, tag-add, topology-change) идут в commits[] контейнера. Контейнер остаётся тем же, обновляется state и ends. Коммит может ссылаться на другой контейнер как source (с frozen snapshot региона на момент операции).

**4. Между-контейнерные операции** — узлы DAG на канвасе, порождают новые контейнеры:
- **Assembly** (N→1): Gibson / GG / RE / blunt.
- **Split** (1→2): cut с сохранением обоих фрагментов (биолог выбирает в момент cut: keep-one внутри текущего контейнера, либо split на два).
- **Clone** (1→1): user-explicit branch внутри проекта. Может быть заменён на UX-shortcut «snapshot-to-scratch + clone-on-import» если выберем двухуровневую library — см. слабость 5 в §5.

Parent-контейнеры immutable в snapshot lineage.

**5. Канвас = DAG контейнеров.** Основные рёбра — между-контейнерные операции. Тонкие рёбра — source-зависимости от внутри-контейнерных insert/replace коммитов (визуально слабее или показываются только при наведении).

**6. История внутри контейнера:** полный commits[] + display-fold (≥3 однотипных подряд → свёрнутый узел в renderer'е, данные не теряются) + milestones (биолог сам ставит именованные указатели). **Hard squash не делаем** — ломает undo/replay, противоречит «каждая операция фиксируется».

**7. Lazy git.** Контейнер при создании имеет только baseSnapshot (= входная молекула). Поле commits[] не инициализируется до первой операции. До первого коммита контейнер = baseline без артефактов истории.

**8. Два класса контейнеров:**
- **MoleculeContainer** — молекула, ends, lazy commits[], портабелен в library.
- **AssemblyContainer** — узел assembly/split/clone с параметрами реакции, без commits[], не попадает в library.

**9. Library = пул контейнеров.** История — атрибут контейнера, путешествует с ним. Library entry — это контейнер, отмеченный как published. Импорт в проект = clone-on-import (deep copy контейнера + frozen lineage до момента clone). Source library entry остаётся неизменной (как stock во фризе). Биологическая аналогия: aliquot из фриза — копия того, что было во фризе на момент взятия.

**10. «Показать историю»** — рекурсивный обход commits[] + parent контейнеров через границы проектов. По запросу пользователя, не в фоне. Может пересекать границы проектов через library lineage.

**11. Любая внешняя sequence входит через importer.** Materialize в MoleculeContainer. «External source as commit field» не существует.

**12. Origin для MoleculeContainer** — фиксированный набор: `catalog | paste | file | library_clone | primer_synthesis | assembly_product | split_product`. Origin immutable, задаётся при создании.

**13. Primers as project entity** — first-class сущность, параллельная контейнерам и library. Operations ссылаются на primers по id + хранят frozen snapshot для replay устойчивости.

**14. Primer-pool гибридный** — primer хранится в origin project. При reuse в другом проекте создаётся локальная копия с back-reference (`originPrimerId`). Копия после создания живёт независимо.

**15. Primer-synthesized container** — особый origin для контейнера. Baseline computed из primers + annealing/extension rules. Source primers immutable для baseline; изменение primers = новый контейнер.

**16. Primer reuse через auto-lookup в primer-pool.** Auto-design tool проверяет local pool перед предложением новых primers. При clone-on-import контейнера — дополнительный lookup в source-project pool (если доступен), при reuse создаётся локальная копия с back-reference.

---

## 3. Подробное обоснование модели

### 3.1 Контейнер как «виртуальный операционный стол»

Унаследовано из CONTAINER_ARCHITECTURE_DRAFT.md и подтверждено Игорем: контейнер несёт ровно одну активную молекулу + историю операций над ней. Это **сознательное упрощение** относительно физической реальности (где после digest в пробирке физически живёт смесь продуктов): в контейнере остаётся только тот продукт, с которым продолжается работа. Второй продукт уходит в лог операции и в протокол как этап очистки, но не существует как отдельная сущность канваса.

Метафора стабильна на всех операциях. И она позволяет жёстко привязать data-model к биологическому процессу: каждая операция в системе = реальная процедура на столе.

### 3.2 Принцип «разные операции = разные контейнеры»

Игорь подтвердил после моего вопроса (instance vs branch внутри одного контейнера): три pUC19 в трёх разных операциях = три разных контейнера, даже при идентичной стартовой молекуле. Биологически это три параллельных tube на столе, не один.

Это снимает соблазн делать «один контейнер с branch'ами» — branch'и естественно возникают через DAG (split-операция или повторное использование одного parent'а в разных assembly-операциях).

### 3.3 Внутри vs между: что где живёт

Принципиальное разделение, которое сильно упрощает визуальную модель:

**Внутри-контейнерные операции** (commits[] контейнера, на канвасе невидимы):
- mutate (point/indel/codon)
- cut-keep (cut с сохранением одного фрагмента в этом же контейнере; «второй кусок мысленно выкидываем, в протокол вставляется этап очистки»)
- PCR-amplify (контейнер остаётся тем же концептуально, обновляется topology + ends)
- fragment-insert (replace декомпозируется в коммиты cut + insert; source — другой контейнер)
- tag-add
- topology-change

**Между-контейнерные операции** (узлы DAG на канвасе):
- Assembly N→1 (Gibson / GG / RE / blunt) — N контейнеров встречаются → новый контейнер
- Split 1→2 — cut с сохранением обоих фрагментов; биолог в момент cut выбирает между keep-one (внутри-контейнерная) и split (между-контейнерная)
- Clone 1→1 — user-explicit branch внутри проекта; статус под вопросом (см. слабость 5)

Канвас становится **читаемым**: видишь граф контейнеров с операциями-стрелками, не видишь шум промежуточных PCR/cut. Внутрь контейнера зашёл — там его plasmid viewer + sequence editor + полная история commits[] (с display-fold), описывающие что биолог делал со столом для получения текущего состояния.

DAG на канвасе = **межконтейнерный** протокол (что с чем встречалось). История внутри контейнера = **внутриконтейнерный** протокол (что биолог делал с молекулой между receive и handoff).

### 3.4 Plasmid вход в assembly через PCR-amplify

«Мы заходим в контейнер с plasmid, говорим амплифицировать регион X — и тот же контейнер обновляется: теперь он linear с конкретными ends, готов к assembly. Новый контейнер не нужен. Это commit в существующем.» (Игорь)

Это упрощает модель: plasmid → linear не порождает отдельный AssemblyContainer. PCR-amplify это commit внутри MoleculeContainer, изменяющий topology + ends + sequence.

Если биолог хочет сохранить plasmid в исходной кольцевой форме И при этом получить linear PCR-продукт для assembly — два сценария, оба чистые:
- (а) Сначала publish plasmid в library (= снимок текущего состояния) → потом в контейнере делает PCR → контейнер становится linear, library entry с кольцевой формой остаётся неизменной.
- (б) Если хочет в рамках одного проекта одновременно иметь и plasmid, и PCR-продукт — explicit clone-операция (см. слабость 5).

### 3.5 Lazy git — git реализовать по требованию

«Возможно стоит git реализовать по требованию? т.е. человек сделал проект, взял плазмиду 1. Далее сделал сайт-направленный мутагенез и получил промежуточную плазмиду 1.1. Далее он взял и сделал новый проект.» (Игорь)

Контейнер при создании имеет только baseSnapshot (= входная молекула). Поле commits[] не инициализируется — у только что взятого pUC118 нет commits[] вообще, это просто baseline.

**Триггер инициализации git** = первая операция, меняющая sequence/ends/topology. До этого момента контейнер — просто «коробка с молекулой».

Что считается «первой операцией» — частично формализовано:
- mutate, cut-keep, PCR-amplify, fragment-insert, tag-add, topology-change — да
- открытие на просмотр — нет
- helper-операции (расчёт Tm, GC%) — нет (derived data)
- вход в assembly как parent — нет (parent immutable)

Расплывчато: annotation edits (открытый вопрос — пересекается с Sprint Annotation-Commits, см. слабость 3 в §5), поведение PCR-amplify где sequence тождественно копируется (full plasmid с праймерами на стыке).

**Что lazy git даёт:**

1. **Производительность.** Меньше memory, меньше replay. В Plasmid-Git модели сейчас baseline + commits[] создаётся для каждого fragment'а, даже если биолог только посмотрел. Lazy убирает накладные расходы.
2. **Семантическая чистота.** Контейнер с pUC19 «как есть из library» — это **тот же** pUC19, без артефактов истории. Биолог читает это как «pUC19 без правок», а не «pUC19 v1.0.0».
3. **Простой mental model.** История появляется когда что-то изменил. Не надо объяснять, почему у нетронутого контейнера 0 коммитов вместо «init» commit'а.

### 3.6 Конкретный пример (тест модели)

Пример Игоря из шага 5 эволюции:

```
Project A
├── Container 1: pUC118 из library  [origin: library_clone, no commits, baseline only]
│   └── op: site-directed mutagenesis (внутри-контейнерная)
│       ↓ commit_1 в Container 1, baseline → updated state
└── publish Container 1 → library entry "pUC118 v1.1"

Project B
├── Container 3: pUC118 v1.1 (clone-on-import из library)
│   [origin: library_clone, несёт frozen lineage: pUC118 → mutagenesis → v1.1]
│   └── op: cut + insert (source = Container 4 region)
│       ↓ commits[] в Container 3:
│         commit_1: cut@pos_X
│         commit_2: insert@pos_X (source: snapshot из Container 4)
│       → Container 3 state теперь = pUC118 v1.2
└── Container 4: plasmid 5.5 из library (используется как source для insert)
    [остаётся на канвасе как самостоятельная сущность]

publish Container 3 → library entry "pUC118 v1.2"
```

**«Показать историю pUC118 v1.2»:**
- Container 3 commits[] → cut + insert.
- insert.source.snapshot → frozen sequence из Container 4 на момент operation.
- Container 3 baseSnapshot = clone из library entry «pUC118 v1.1».
- frozen lineage в Container 3 → mutagenesis от оригинального pUC118.
- Получаем дерево от первоисточников до v1.2.

Эта родословная **пересекает границы проектов** через library snapshots, и она достоверная — все snapshots immutable на момент создания.

### 3.7 Library — пул контейнеров с историей

«Если контейнер есть в библиотеке, у него есть история.» (Игорь)

Library entry **является** контейнером (помеченным published), не обёрткой над контейнером и не отдельной структурой данных.

Импорт в проект = **clone-on-import** (deep copy контейнера + frozen lineage chain до момента clone). Биологическая аналогия: aliquot из фриза — копия того, что было во фризе на момент взятия. Если кто-то после тебя что-то добавил в исходный tube — твой aliquot не меняется.

Source library entry остаётся неизменной после clone-on-import. Если биолог после clone сделал что-то ценное → publish-обратно (новая library entry либо обновлённая существующая — это решается через milestones / version naming).

### 3.8 Канвас = DAG, не список

Текущий канвас плоский — горизонтальный ряд parts. Новый канвас **протокольный** — время идёт от parents к children (сверху вниз или слева направо), DAG ветвится при split-операции и сходится при assembly.

Внутри-контейнерные операции **не** видны как отдельные узлы — они в истории контейнера. Source-зависимости от внутри-контейнерных insert/replace показываются тонкими рёбрами (визуально слабее, либо только при hover на target-контейнер).

Construct view и Project Flow унифицируются на одной data-модели с авто-выбором layout (линейный для цепочки, DAG для ветвлений). Биолог не выбирает «я в Construct или в Flow» — работает с графом, layout сам подстраивается. Это положение унаследовано из DRAFT 27.04.2026 и подтверждено сегодня.

---

## 4. Закрытие слабости 1: External source / Primers / Primer-synthesized container

Слабость 1 — первая найденная слабость модели после фиксации 10 базовых ⚓ кандидатов. Её закрытие открыло primers как новый слой и расширило origin для MoleculeContainer.

### 4.1 Принцип входа sequence в проект

Любая внешняя последовательность входит в проект **через importer**. Importer уже спроектирован максимально гибким и закрывает все случаи:

- Paste из текста (Ctrl+V) — любой источник: NCBI, переписка коллабораторов, patent figure, gBlock-заказ.
- File import — `.dna` / `.gb` / `.fasta`.
- Catalog SnapGene (встроенный).
- Clone-on-import из library (с frozen lineage).

На выходе importer'а **всегда MoleculeContainer**. Биолог жмёт `На канвас` или `В библиотеку` — контейнер появляется в проекте.

**Следствие.** Гипотетический «external source as commit field» (paste в коммит без отдельного контейнера) не нужен. Вся внешняя ДНК материализуется в контейнерах.

### 4.2 Граница «контейнер vs не-контейнер»

Не по длине sequence. По **биологическому намерению**:

- **Site из 6 nt** — биолог не пастит как контейнер, впишет в primer overhang при PCR/insert.
- **Tag (His6, FLAG, c-Myc, V5)** — primer overhang или operation parameter.
- **Linker 30 nt** — может быть primer overhang при PCR-сшивке, может быть primer-synthesized container (см. §4.5). Биолог решает.
- **gBlock 500 bp** — отдельный контейнер заслуженно (физически синтезированный кусок ДНК).
- **Любой длинный paste из NCBI / patent / коллаборатор** — отдельный контейнер.

Формального threshold'а нет. Биолог сам выбирает, что становится контейнером.

### 4.3 Origin metadata для MoleculeContainer

Контейнер несёт обязательное поле `origin`, immutable, задаётся при создании.

```
origin: 'catalog'           // из встроенного catalog SnapGene
      | 'paste'             // sequence вставлен через importer
      | 'file'              // импортирован из .dna / .gb / .fasta
      | 'library_clone'     // clone-on-import из library (несёт frozen lineage)
      | 'primer_synthesis'  // собран из primers (annealing/extension), см. §4.5
      | 'assembly_product'  // output AssemblyContainer (Gibson/GG/RE/blunt N→1)
      | 'split_product'     // output split-операции (1→2)
```

Используется в UI: иконка/badge на узле канваса, заголовок секции истории, фильтры в library / inspector / project tree.

**Принцип «контейнер дешёвый» (Игорь):**

> «Мы же не лимитированы в количестве контейнеров. В этом и прелесть. Захотели — ввели новую сущность. И если та подчиняется нашим правилам, то имеет выход "наружу" за счёт хвостов.»

Создание новой сущности на канвасе — нормальная цена за чистоту модели и гибкость. Архитектура не должна экономить на контейнерах. Это снимает мою тревогу «канвас раздуется коротким paste'ами»: биолог сам регулирует через биологическое намерение.

### 4.4 Primers as project entity

#### Базовая модель

Праймер = first-class сущность проекта. Не контейнер, не commit-field. **Параллельный слой данных**, рядом со списком контейнеров.

#### Поля праймера (минимальный набор для v1)

```
{
  id:           uuid,                    // стабильный, никогда не меняется
  sequence:     string,                  // 5'→3', uppercase, ATGCN
  name:         string,                  // human-readable
  purpose:      string,                  // свободный текст, mutable

  designMeta: {                          // фиксируется при acceptance
    Tm:                  number,         // °C, по используемой формуле
    GC:                  number,         // %
    bindingLength:       number,         // nt 3'-binding region
    overhangLeft:        string | null,  // 5' overhang sequence, если есть
    overhangRight:       string | null,  // 3' overhang sequence (для редких случаев)
    targetOrganism:      string | null,  // для codon usage adjustments
    designedFor:         string,         // 'pcr' | 'mutagenesis' | 'gibson' | 'gg' | ...
  },

  origin: {                              // back-reference на контекст создания
    projectId:           uuid,
    operationCommitId:   uuid,
    containerId:         uuid,
    timestamp:           ISO,
  },

  status:       'designed' | 'ordered' | 'received' | 'tested' | 'discontinued',
                                         // опционально, default 'designed', mutable
}
```

**Mutable поля:** `name`, `purpose`, `status`.
**Immutable поля:** `id`, `sequence`, `designMeta`, `origin`.

Изменение sequence или designMeta = новый primer с новым id. Старый остаётся в pool.

Праймер не несёт в себе списка use sites — это derived view (запрос «где этот primer использовался» обходит operations всех контейнеров проекта).

#### Жизненный цикл (формулировка Игоря)

> «Когда мы делаем контейнер (например ставим линейный участок и говорим что там ПЦР), то праймеры пишутся автоматом. После того как мы явно согласились с праймерами, они попадают в базу данных.»

1. Биолог создаёт контейнер с операцией PCR (выделяет линейный участок и говорит «это PCR-продукт от Container X с такими-то ends»).
2. Auto-design tool **подбирает праймеры автоматически**. Биолог видит предложенных кандидатов в UI операции.
3. Биолог **явно соглашается** (кнопка `Применить` / `Принять праймеры`). До этого момента — кандидаты, нигде не записаны.
4. На моменте acceptance праймеры попадают в **primer-pool проекта** с присвоенным id. В commit'е операции PCR хранится ссылка на primer.id.

#### Reuse через primer-pool

> «Если этот же контейнер используем в другом проекте, то при его вытаскивании и явном указании "ПЦР" (условно и там и там просто ПЦР фрагмента без хвостовых последовательностей), то праймеры предлагаются из известных.»

Когда тот же контейнер используется в другом проекте (clone-on-import) и биолог делает аналогичную операцию:

1. Auto-design tool **сначала проверяет primer-pool** на наличие подходящих primers.
2. **Критерии match'а:**
   - Sequence binding region совпадает (target binding site на текущем baseline = sequence primer'а — overhang).
   - `designMeta.designedFor` соответствует типу операции.
   - `designMeta` parameters (Tm, length, organism) — в допустимых рамках.
3. Если matches найдены — UI предлагает их как первый вариант: «Найдены known primers: P1, P2 — использованы в Project A для аналогичной PCR. Использовать?»
4. Биолог соглашается → переиспользуется (тот же id, та же sequence, та же история).
5. Биолог отказывается → auto-design генерирует новых, при acceptance они попадают в pool как новые id.

**Биологический смысл.** Биолог в реальной лаборатории хочет: «у меня в фризе уже лежат primers P1/P2 для амплификации pUC118, я не хочу заказывать ещё раз». Tool это знает и предлагает.

#### Хранение primer-pool: гибридная модель (выбор Игоря)

> «Гибрид: primer хранится в проекте, где был создан (origin project), при reuse в другом проекте создаётся локальная копия с back-reference на origin.»

**Формализация гибрида:**

- **Primer хранится в origin project.** Каждый primer имеет `origin.projectId`, `origin.operationCommitId`, `origin.containerId`.
- **Primer-pool в каждом проекте — local pool.** Содержит primers, созданные в этом проекте (origin = self), плюс копии из других проектов (origin ≠ self), сделанные при reuse.
- **При reuse в другом проекте** создаётся локальная копия в target-проекте:
  - Наследует все immutable поля (id новый, sequence/designMeta/origin того primer'а откуда копировали).
  - Имеет back-reference: `originPrimerId: <id origin primer>`.
  - Mutable поля (name, purpose, status) копируются на момент создания, дальше живут независимо.

**Логика lookup'а при reuse:**

1. **Локальный pool target-проекта** — основной источник.
2. **Если контейнер только что clone-on-import'нут** — дополнительный lookup в primer-pool source-проекта (если доступен). Найденные matches предлагаются с пометкой «из Project A» → биолог соглашается → создаётся локальная копия.
3. **Если source-проект недоступен** (удалён, не открыт) — lookup только в target. Биолог дизайнит заново при необходимости.

**Преимущества гибрида:**

- **Reuse реален.** Не нужно дизайнить с нуля одни и те же primers.
- **Самодостаточность проекта.** После copy primer живёт в target независимо от source. Удаление source не ломает target.
- **Прозрачность происхождения.** `originPrimerId` сохраняет цепочку, можно показать «этот primer пришёл из Project A».
- **Никакой принудительной синхронизации.** Биолог в target может изменить name/purpose/status локально, без влияния на origin.

**Детали для следующей итерации:**

- Если в source-проекте primer удалён после copy — copy в target остаётся валидной, `origin` ссылка становится dangling reference. UI может пометить «origin недоступен», sequence остаётся.
- Sync назад от target к origin **не делается**. Локальные изменения в target в origin не возвращаются.
- Дедупликация при copy — если в target уже есть primer с identical sequence + designMeta, копия не создаётся, reuse'ится существующий. Иначе риск разрастания pool'а.

#### Primer как metadata operation, не embedded data

Operation в commit'е ссылается на primer по id, не дублирует sequence в commit body:

```
commit: {
  type: 'pcr_amplify',
  containerId: <self>,
  parameters: {
    primerIds:       ['primer_uuid_1', 'primer_uuid_2'],
    primerSnapshots: [                         // FROZEN fallback на момент operation
      { sequence: 'ATGCG...', Tm: 58, ... },
      { sequence: 'GCATC...', Tm: 60, ... }
    ],
    template:        <baseline state ref>,
    region:          { start, end },
  }
}
```

**Зачем `primerSnapshots` рядом с `primerIds`:**

- Live primer через id — для UI текущей сессии (показать имя/статус, перейти к primer'у).
- Frozen snapshots — для replay устойчивости. Если primer удалён из pool, operation остаётся валидной для replay sequence (sequence уже зафиксирована в результате operation), и UI fallback'ается на snapshot.

UI показывает в истории: «PCR с primers P1, P2 (origin Project A)» если live доступны, иначе «PCR с primers <sequence из snapshot> (primers удалены из pool)».

Это снимает риск «удалённый primer ломает историю». Pure reference + frozen fallback.

### 4.5 Primer-synthesized container

#### Use case

Биологу нужна **короткая связующая последовательность из primers** для соединения двух контейнеров. Сценарии:

1. **Annealed oligos** — два комплементарных primer'а отжигаются → duplex с тупыми или sticky концами в зависимости от дизайна. Длина — десятки nt. Применение: короткий linker, MCS-замена, custom restriction site cassette.
2. **Primer extension** — два частично перекрывающихся primer'а полимеразой удлиняются друг по другу → длинный duplex. Длина — до ~150 nt (limit primer length). Применение: средний linker, custom synthetic regulatory element.

В обоих случаях на столе биолога — физически существующая ДНК-молекула, полученная не из template, а из primers напрямую. У неё есть sequence, есть концы, она готова для assembly.

#### Как укладывается в модель

`MoleculeContainer` с `origin: 'primer_synthesis'`. Особенности:

**Baseline computed.** Не paste и не file. Вычисляется из набора primers + правила annealing/extension.

**Lazy git триггерится сразу при создании.** Контейнер появляется уже с одним коммитом — потому что baseline это уже результат «операции» annealing/extension, не сырой импорт. Первый commit фиксирует параметры синтеза:

```
commit_0: {
  type: 'primer_synthesis_init',
  parameters: {
    primerIds:       ['primer_uuid_a', 'primer_uuid_b'],
    primerSnapshots: [...],            // frozen fallback
    method:          'annealing' | 'extension',
    conditions: {
      Tm_anneal:       number,
      duplexRegion:    { start, end }, // координаты overlap для extension method
    },
    computedSequence:   string,        // = baseSnapshot.sequence, для replay
    computedEnds: {
      left:  { type: 'blunt' | 'overhang_5' | 'overhang_3', sequence?: string },
      right: { type: 'blunt' | 'overhang_5' | 'overhang_3', sequence?: string },
    }
  }
}
```

**Source primers immutable для baseline.** Если биолог потом меняет primer в primer-pool — baseline контейнера **не пересчитывается**. Если нужна новая sequence → новый primer-synthesized container с обновлёнными primers. Старый остаётся.

> «Поправил primer → пересобрал контейнер заново (новый container), старый остался.» (Игорь)

Это согласуется с принципом immutable baseline (как и любой другой origin).

**Ends computed из дизайна primers.** Overhangs primer'ов определяют ends контейнера для дальнейшего assembly:
- Annealing с обоими 5' overhangs → sticky-ended duplex.
- Annealing полностью комплементарных primers → blunt-ended duplex.
- Extension с overlap region → blunt-ended duplex длиной ≈ (length(p1) + length(p2) - length(overlap)).

**Контейнер далее работает по общим правилам.** Есть ends, может быть source для insert, может участвовать в assembly, может быть published в library.

#### UX вход

В importer'е (или прямо на канвасе через действие `Создать контейнер из primers`) открывается primer-synthesis tool:
- Биолог вводит/выбирает 2+ primers из pool.
- Выбирает метод — annealing / extension.
- Tool вычисляет результирующую sequence + ends, показывает preview (mini-map + ends visualization).
- Биолог жмёт `Создать контейнер` → MoleculeContainer на канвасе.

Это четвёртая опция в importer'е рядом с paste/file/catalog.

#### Граница vs «primer overhang in operation»

- **Primer overhang в существующей операции** — когда linker/site/tag присоединяется к **template-derived продукту** (PCR с template + overhang). Linker не существует как отдельная молекула, растёт как часть PCR-продукта.
- **Primer-synthesis container** — когда linker/connector сам по себе является **отдельной физической молекулой** (annealed oligos для лигирования или extension product без template).

Граница по биологическому намерению, не формальная.

---

## 4.1 Расхождения с реальным кодом (N+1, закрытие слабости 9)

До N+1 kickoff формулировался без обращения к реальному коду — это явно зафиксировано как слабость 9 в §5. В N+1 прочитаны: `lib/plasmid-git.js` (~7 KB), `lib/plasmid-git-reducers.js` (~5 KB), `store/fragmentSlice.js` (~24 KB; включает `parts[]` — отдельного `parts-slice.js` не существует), `store/projectSlice.js`, `store/junctionSlice.js`, `store/index.js` (с migration logic v3→v8). Ниже — 5 находок, где модель kickoff'а сталкивается с реальностью кода. Каждая — корень + следствие + предложение.

### 4.1.1 Migration «Сборка → 3 типа узлов» нетривиальна

**Корень.** В §8.2 сказано «migration `.bodgegene` тривиальна по структуре: каждый Fragment → MoleculeContainer, каждый Junction → ребро AssemblyContainer'а». Проверка кода показывает, что это не один-в-один:

- В `projectSlice.js`: `Сборка` (`asm.assemblies[i]`) — это плоский ряд `fragments[]` + параллельный массив `junctions[]`, индексируемый по позиции (`asm.junctions[i]` = настройки реакции между `fragments[i]` и `fragments[i+1]`).
- Junction **не объект-узел** и **не имеет id** — это просто массив параметров реакции (тип, overlapMode, enzyme, overhang), синхронизированный по индексу с массивом fragments.
- В новой модели «Сборка» распадается на: **N MoleculeContainer'ов** (каждый fragment) + **1 AssemblyContainer** (с параметрами реакции, агрегирующий N→1) + **1 product MoleculeContainer** (если `asm.completed === true`; иначе пока нет product'а). Это разделение **одной сущности на три типа узлов**.

**Следствие.** Sprint Migration v0.5 → v0.6 не «schema bump», а **full data restructure** + переписывание всех reducer'ов junction-логики (`autoAdjustJunctions`, `autoDesignGGOverhangs`, `validateJunctionEnds`). Текущий `flipFragment` дёргает `autoDesignGGOverhangs` — после миграции эта логика живёт на AssemblyContainer'е, а `flipFragment` — на MoleculeContainer'е; нужно явное правило «изменение MoleculeContainer'а инвалидирует AssemblyContainer, в который он входит как parent».

**Предложение.** В §9.1 N+3 явно выделить sprint Migration **в два шага**:

- **Шаг (a)** — data-restructure без UI-изменений. Старые `Сборки` → MoleculeContainer + AssemblyContainer + рёбра в новой структуре, но UI пока рендерит как было (через адаптер). Валидируется regression-тестами: старые `.bodgegene` файлы открываются → identical render.
- **Шаг (b)** — переключение UI на новые узлы. Отдельная сессия после стабилизации (a).

Попытка слить в один спринт убивает спринт под тяжестью.

### 4.1.2 `parts[]` уже глобальный с provenance — origin name collision

**Корень.** В `fragmentSlice.js`:

```js
parts: [],   // глобальный массив, top-level в state
addPart: (part) => set(state => {
  origin: part.origin || {
    projectId: get().activeProjectId,
    projectName: get().projectName,
    assemblyId: get().activeId,
    createdAt: ...,
  },
})
```

И `addFragmentDirect` AUTO-копирует part в `parts[]` при добавлении на канвас (`if (part.sequence && !get().parts.some(p => p.id === part.id)) get().addPart(...)`).

**Это означает:** «глобальная library с per-project provenance» уже фактически живёт в коде. Просто она не задумана осознанно как первый класс архитектуры — это побочный эффект `addFragmentDirect`.

В kickoff'е (⚓ #12) `origin` — это **enum типа источника** (`catalog | paste | file | library_clone | …`). В коде `origin` — это **provenance metadata** (где создан: projectId/projectName/assemblyId/createdAt). **Семантическая коллизия имени.** Прямой migration «old `origin` → new `origin`» невозможен — это два разных смысла поля.

**Предложение.** Разнести на **два поля** в архитектурной спеке:

- `origin: enum` — kickoff'овский смысл (тип источника: catalog/paste/file/library_clone/primer_synthesis/assembly_product/split_product).
- `provenance: { projectId, projectName, assemblyId, createdAt, ... }` — текущий код (где/когда создан).

При migration v8→v9 старое поле `origin` переименовывается в `provenance`, новое `origin` (enum) добавляется с дефолтом по эвристике на основании поля `source`: `import|genbank_import|batch_import` → `file`, `manual` → `paste`, `mutation` → derived (mutation parts вообще должны стать MoleculeContainer'ами с операционной историей, а не отдельными parts), `canvas` → `paste` или `library_clone` (зависит от derivation).

### 4.1.3 `apiWarnings` нарушают разделение «внутри vs между»

**Корень.** В `plasmid-git-reducers.js`, функция `_applyOneCommit`:

```js
asm.apiWarnings = asm.apiWarnings || [];
if (overriddenId) {
  asm.apiWarnings.push(`✏ codon ${codon} — «${commit.label}» ...`);
}
for (const w of warnings) asm.apiWarnings.push(w);
```

Warnings от **внутри-контейнерной операции** (мутация в fragment'е) пишутся прямо в `asm.apiWarnings` — то есть **залезают в межконтейнерную структуру** (assembly-уровень). В новой модели assembly = AssemblyContainer, который ничего не знает про мутации внутри своих parents — он только про реакцию N→1.

**Следствие.** Если оставить как есть, в новой модели warnings от mutate-операций потекут в AssemblyContainer.warnings — биолог увидит mutation-warning в reaction-окне и наоборот. Семантический шум.

**Предложение.** В архитектурной спеке вынести `commit.warnings: string[]` в сам коммит. AssemblyContainer держит только warnings о реакции (incompatible ends, GG conflicts, buffer mismatch). UI агрегирует: история контейнера показывает warnings своих коммитов; AssemblyContainer-узел показывает свои reaction-warnings. Два разных UI-канала.

Рефакторинг ~50 строк, но **семантически важный** — иначе разделение «внутри vs между» течёт через warnings.

### 4.1.4 localStorage limit — реальная угроза, не теоретическая

**Корень.** В `index.js` (store) — `throttledStorage` пишет в `window.localStorage` через `persist` middleware Zustand. Это не IndexedDB, это **5–10 MB hard limit** браузеров.

Прикидка объёмов: pUC118 (~2.7 KB seq) + 50 коммитов с frozen snapshots × 10 fragments × 5–7 KB на коммит = **~3.5 MB на одну сборку**. Плюс 94 parts с full sequences (некоторые plasmids 7–10 kb) ≈ **0.5–1 MB**. Всё это в одном `pvcs_designer_state` ключе. На крупном проекте легко выйти за лимит.

В §6.1 это сейчас «открытый вопрос: IndexedDB или localStorage?». Реальность — **в первом же тестовом проекте Project Model эта проблема стрельнёт**, потому что Project Model вводит несколько проектов одновременно в одном state'е (всё хранится в `projects[]`, каждый со своими parts/assemblies/primers).

**Предложение.** Migration на IndexedDB **поднять до обязательного sprint'а ПЕРЕД Project Model data-restructure**, не после. Стоимость: ~1 спринт (Zustand persist поддерживает кастомный storage; основная работа — wrapper IndexedDB → sync API + миграция существующих данных из localStorage). Экономит **весь Project Model** потом, потому что без IndexedDB первый же тестовый сценарий с 3+ проектами упрётся в quota и сломает state.

Скорректировать §9.1: между N+3 (архитектурная спека) и первым sprint'ом Project Model — sprint Persistence Migration.

### 4.1.5 Три истории: legacy mutations + commits + undo — нужна политика

**Корень.** В коде сейчас живут **три уровня истории**:

- **Legacy `f.mutations[]`** (read-only после v8 миграции в `index.js`, рендерится с 🔒 lock badge — для проектов созданных до Sprint X cycle).
- **Live `f.commits[]`** (Plasmid-Git, append-only, toggle через `applied: bool`).
- **`_undoStack`** (50 уровней shallow snapshot, в `index.js`: `if (state._undoStack.length > 50) state._undoStack.shift()`).

В §3.5 (lazy git) сказано «Hard squash не делаем — противоречит каждая операция фиксируется». Но **undo уже squash'ит** при `>50`. То есть «каждая операция фиксируется» уже не выполняется на уровне undo-стека (только на уровне commits[] — там toggle, не удаление).

**Следствие.** Migration v8→v9 должна явно решить, что делать с legacy `f.mutations[]`. Варианты:

- **(a) Удалить.** Потеря провенанса всех старых проектов, но чистая модель. Не годится — ломает «provenance первоклассный».
- **(b) Конвертировать в read-only commits с `migrated_from_legacy: true`.** Сохраняем провенанс, новая модель консистентна, в UI пометка «импортировано из v0.5» при отображении. Это рабочая опция.

**Предложение.** В архитектурной спеке явно разнести три уровня:

- **Operations log** (`commits[]`) — append-only, никогда не shift'ится, источник истины provenance. Migration v9 конвертирует `mutations[]` → `commits[]` с пометкой `migrated_from_legacy`.
- **Undo stack** — UI-ergonomics, имеет право shift'ить на 50 уровней. Это **другой layer**, не source of truth.
- **Legacy mutations** — после migration v9 не существуют. Pre-migration (legacy file open) — конвертируются в commits.

---

## 5. Слабости 2–9 — что осталось обсудить до спеки

Каждая слабость пронумерована для удобной адресации в следующих сессиях. Слабость 1 закрыта в §4.

### Слабость 2 — Visual weight внутри-контейнерной истории на канвасе

**Что не так.** Канвас рисует граф контейнеров. Внутри-контейнерные операции (mutate / cut-keep / PCR-amplify / fragment-insert / tag-add / topology-change) идут в commits[] контейнера, на канвасе невидимы. Контейнер с 30 коммитами визуально неотличим от контейнера, в котором ничего не делалось.

**Почему важно.** Site-directed mutagenesis в Container 2 даёт pUC118 v1.1 — это main result типичного workflow. Если на канвасе он выглядит как «свежий контейнер из library», теряется протокольная семантика — а у нас сам принцип «канвас = протокол».

**Варианты решений:**
- **(a) Stamps на узле контейнера.** Иконки на блоке по типам коммитов внутри (★ для milestone, точка для каждого mutate, шеврон для cut-keep, primer-icon для PCR).
- **(b) Mini-timeline в узле.** Тонкая полоса под именем контейнера с timeline коммитов (как git log mini). Кликабельно → открывает full history.
- **(c) Title decoration.** Имя контейнера несёт версию: «pUC118 v1.1 (3 commits)». Простое, но требует осмысленного именования. Альтернатива — авто-нумерация версий, но это уже Plasmid-Git terminology.

**Текущее состояние в коде.** В Plasmid-Git модели уже есть HEAD-указатель и счётчик коммитов на блоке (Sprint X cycle). Частично решает (c). Стоит явно затащить как UX-требование, не как побочный эффект существующей реализации.

**Состояние:** open, ждёт обсуждения.

### Слабость 3 — Триггер lazy git формализован расплывчато

**Что не так.** «Commits[] инициализируется при первой mutate/edit/cut/insert операции» — формально не определено, что считать «первой».

**Edge cases без ответа:**
- Изменил topology linear→circular — commit?
- Добавил annotation — commit? (пересекается с Sprint Annotation-Commits и V40 в BUGS.md)
- Изменил имя контейнера — точно metadata. Но границу нужно явно записать.
- Изменил target organism для codon usage — ?
- PCR-amplify с тождественным копированием sequence (full plasmid с праймерами на стыке) — sequence не меняется, но контейнер семантически «теперь linear с такими-то ends» — commit или metadata?

**Кандидат на формальное правило:**

> **Commit** = операция, меняющая sequence, ends, или topology (триада).
> **Annotation edits** — отдельный подкласс commits (Sprint Annotation-Commits — да, коммиты, но особого подтипа).
> **Metadata** (имя, описание, organism для codon usage, теги) — не commits, mutable layer вне commits[].

**Состояние:** open, требует подтверждения Игоря или альтернативной формулировки.

### Слабость 4 — Frozen snapshot data volume в insert.source

**Что не так.** Если биолог в большой проект импортирует 20 контейнеров и делает 50 cut+insert операций, каждая insert несёт frozen snapshot региона source. Insert 500 bp + metadata — не катастрофа. Insert полной плазмиды 7 kb (вставляем как кассету) — полные копии в каждом коммите.

**Mitigation (предложение):**
- Snapshot хранит **только sub-region** (start, end + sequence + annotations этого региона), не весь source-контейнер. Подразумевалось, нужно явно зафиксировать.
- Дедупликация identical snapshots — отложена. Если станет bottleneck — content-addressable storage в persistence layer.

**Открытый edge case.** Если позже выясняется, что snapshot содержал ошибку (annotations были битые на момент operation) — sequence в snapshot тоже immutable. Биолог должен сделать новую операцию replace для исправления, не править старую. Это правильно (commit history is truth), но UX должен пояснять.

**Состояние:** open. Нужно решить (a) формальную фиксацию sub-region snapshot, (b) UX поведения при «найденной ошибке в historic snapshot».

### Слабость 5 — Clone (1→1 branch) vs personal scratch в library

**Что не так.** Я в обсуждении предложил два варианта для use case «хочу одновременно plasmid и PCR-продукт от неё в одном проекте»:

- **(α) Clone как третий тип DAG-узла** (1→1, branch внутри проекта). Третий тип ребра канваса.
- **(β) Двухуровневая library** (personal scratch + shared) и клон через snapshot-to-scratch + clone-on-import. Тогда clone как DAG-тип не нужен.

**Дополнение от §4.** Аналогичный вопрос теперь и для **primers**: project-local pool с opt-in export в общий файл — это уже выбрано (гибрид). «Общий файл» по сути и есть второй уровень. Тогда вопрос для **library контейнеров**: нужен ли симметрично второй уровень для контейнеров, или хватит «library + project-local» без personal scratch?

**Аргументы за (α) clone в DAG:**
- Простая модель, меньше слоёв.
- Биолог не должен думать про library как про staging area.

**Аргументы за (β) двухуровневая library:**
- Симметрия с primers (если согласимся, что primer-pool и library структурно похожи).
- Personal scratch уже даёт mechanism «сохранить snapshot перед операцией не публикуя в shared».
- Clone-как-DAG-тип это специальный случай, который в (β) сводится к общему механизму.

**Состояние:** open, ключевая развилка для DAG модели. Решение влияет на: число типов рёбер канваса, число поверхностей library в UI, интерпретацию primer-export.

### Слабость 6 — История дублируется при clone-on-import

**Что не так.** Контейнер несёт всю свою историю (commits[] + frozen lineage). При clone-on-import — копируется. Если pUC19 импортирован в 50 проектов с 5 коммитами истории каждый → 50 копий, 5–10 MB суммарно.

**Worse case.** pUC19 импортирован в один проект, оттуда другой проект импортирует pUC19-derived plasmid (содержит цепочку до pUC19) → копируем историю дважды.

**Mitigation.** Content-addressable storage — каждый коммит идентифицируется по hash, дубликаты дедуплицируются. Уровень — persistence layer. Git-паттерн.

**Решение.** Overengineering на старте. Сейчас просто фиксируем clone-on-import = deep copy всей истории. Если станет bottleneck — добавим dedup в persistence. Не блокирует первую версию.

**Состояние:** acknowledged, отложено в backlog. Не требует обсуждения сейчас.

### Слабость 7 — AssemblyContainer immutable после создания

**Что не так.** Зафиксировано: AssemblyContainer не имеет commits[], не попадает в library, содержит параметры реакции. Не зафиксировано, изменяемы ли параметры после создания.

**Биологическая истина.** Gibson реакция произошла, у тебя tube с продуктом. Поменять параметры задним числом нельзя.

**Кандидат на правило:**

> AssemblyContainer immutable после создания. Изменение параметров = удаление AssemblyContainer + создание нового. На канвасе это новый узел, output которого — новый контейнер.

**UX-следствие.** В UI нет кнопки `Edit assembly parameters`. Есть `Re-do assembly with different parameters` — создаёт новую реакцию. Старая остаётся (или удаляется явно через `Delete this assembly`).

**Состояние:** open, нужно подтвердить или возразить. Скорее всего без споров.

### Слабость 8 — Migration path с текущей модели недооценён

**Что не так.** Текущее приложение (v0.5.4-alpha) имеет:
- `parts-slice` (catalog + user imports = «Моя библиотека»)
- `fragment-slice` (fragments на канвасе с Plasmid-Git baseline + commits[])
- «Стыки блоков» (assembly junction) между fragments на DesignCanvas
- ImportStartScreen как entry point

Новая модель добавляет:
- Project как новая сущность поверх всего
- MoleculeContainer / AssemblyContainer как два класса узлов
- Library двухуровневая (если выберем (β) в слабости 5) или одноуровневая
- Primer-pool с гибридным хранением
- DAG canvas с типизированными рёбрами

**Migration вопросы:**

- Текущий открытый канвас (без проектов) → автоматически становится «default project» при первом сохранении? Или пользователь обязан «начать новый проект» и теряет текущий канвас?
- Текущие fragments на канвасе → MoleculeContainers без commits[] (если Plasmid-Git ещё не инициализирован) или с commits[] (если уже есть).
- Текущие «стыки блоков» → AssemblyContainers с параметрами из текущей DesignCanvas state.
- Текущий `parts-slice` → как мапится на новую двухуровневую library.
- Catalog SnapGene items → остаются как есть, но импорт через clone-on-import создаёт MoleculeContainer.
- Текущие designed primers (если уже хранятся где-то в state) → попадают в primer-pool default project'а.
- `.bodgegene` schema bump v_N → v_N+1, миграция один раз при первой загрузке.

**Решение.** Выделить **отдельный sprint «Migration v0.5 → v0.6 (project model)»** в плане спринтов после архитектурной спеки. Не пытаться запихнуть в первый спринт data model.

**Состояние:** acknowledged, не требует обсуждения сейчас. Будет отдельная сессия по migration после стабилизации новой модели.

### Слабость 9 — Обсуждение шло без сверки с реальным кодом

**Что не так.** Всё обсуждение на уровне мысленных моделей. Я не открывал ни `parts-slice.js`, ни `fragment-slice.js`, ни `plasmid-git.js`, ни `DesignCanvas.jsx` в этой сессии. Не знаю:
- Сколько реальных полей у текущего fragment'а.
- Как сейчас устроены «стыки» — embedded в fragment или отдельный slice.
- Что уже есть в Plasmid-Git baseline + commits[] — может, частично совпадает с MoleculeContainer.

**Риск.** Спека получится оторванной от реальности. Sprint 1.7 уже один раз нас этому научил (антипаттерн 1 в playbook'е).

**Митигация — обязательное действие на старте следующей сессии:**

- `gui/designer/src/store/parts-slice.js`
- `gui/designer/src/store/fragment-slice.js`
- `gui/designer/src/lib/plasmid-git.js`
- `gui/designer/src/lib/plasmid-git-reducers.js`
- Просмотр `gui/designer/src/components/DesignCanvas.jsx` (как «стыки» рендерятся).

Объём ~30–50 KB, в бюджет следующей сессии после стартового пакета помещается. Это **обязательное действие** перед любой архитектурной спекой.

**Состояние:** ✅ закрыта в N+1 — реальный код прочитан, см. §4.1.

---

## 5.1 Закрытие слабостей 2/3/7/5 (N+1)

Это продолжение §5. После чтения реального кода (см. §4.1) закрыты четыре слабости в порядке, заданном планом N+1 в §9.1: 2 → 3 → 7 → 5. Слабость 4 остаётся для N+2; слабости 6 и 8 уже acknowledged в §5.

### 5.1.1 Слабость 2 — Visual weight внутри-контейнерной истории на канвасе → mini-timeline + auto-versioning + milestone override

Из §5 варианты были (a) stamps / (b) mini-timeline / (c) title decoration. **Каждый по отдельности слабый:**

- (a) stamps по типам — нечитаемо при ≥5 коммитах разных типов; 30 коммитов = визуальная каша.
- (b) mini-timeline один — ничего не говорит про **семантику** изменений.
- (c) title decoration один — биолог не знает «v1.1 это что — 1 substitution или 10 + reorganization?».

**Принятое решение — комбинация (b) + (c) с явной механикой:**

**Mini-timeline под именем контейнера.** Тонкая полоса 4–6 px, до 5 видимых точек-коммитов слева направо, ≥6 → схлопнутое визуальное представление с counter «`5 + N more`» (раскрывается по клику в полную историю). Категориальные цвета по типу:

- **substitution** — warm tone (внутрикодоновая правка)
- **indel** — orange (frame shift visible signal)
- **structural** — blue (cut, PCR-amplify, topology change, fragment-insert, tag-add)
- **annotation** — gray (manual annotation edit; не auto-annotate)
- **milestone** — звезда (★)

**Title decoration auto-generated** по semantic patterns:

- 0 коммитов → имя без суффикса (lazy git семантика — «как из library»).
- Только substitutions → `pUC118 v.0.N` где N = число applied substitution коммитов.
- Mixed → `pUC118 vM.N` где major M = число applied structural коммитов, minor N = число applied substitutions.
- Биолог может перебить через **milestone** (`Set milestone → My-pUC118-stable-clone-3`); milestone становится отображаемым именем на канвасе, оригинальное имя падает в metadata, в `commits[]` появляется milestone-commit с типом `milestone` и текстом меткой.

**Hover на mini-timeline** → tooltip: list последних 5 коммитов (label + applied/disabled icon) + кнопка `Открыть историю` → внутрь контейнера, секция history с display-fold (по §6.5).

**Текущее состояние в коде.** В `plasmid-git-reducers.js` уже есть HEAD-указатель и счётчик коммитов; `commits[]` уже типизирован (substitution / deletion / insertion). Migration на (b)+(c) не требует data-restructure — нужен только UI-слой над существующим `commits[]`.

**Открытый вопрос для тебя:** что считать «major» (структурной) операцией для version bump? Кандидат: `cut-keep`, `fragment-insert`, `PCR-amplify-with-topology-change`, `tag-add`, `primer_synthesis_init`. Substitution + indel + annotation_edit — minor. Подтвердить или предложить свой набор.

**Кандидат на ⚓ в архитектурной спеке.**

### 5.1.2 Слабость 3 — Триггер lazy git → расширенная формула с двумя дырами закрыта

Из §5 кандидат-правило:

> Commit = операция, меняющая sequence, ends, или topology (триада). Annotation edits — отдельный подкласс. Metadata (имя, organism) — не commits.

**Хорошее правило, но с двумя дырами.** Закрываю обе.

**Дыра 1 — PCR-amplify-noop.** В §3.4 «PCR-amplify это commit, изменяющий topology + ends + sequence». Edge case: full plasmid PCR без overhang'ов — sequence/ends/topology тождественно копируются (биолог делает PCR полной плазмиды для приготовления template для следующего шага). По правилу-триаде это **не commit**. Но **биологически операция была — реакция, реактивы, время.** Если её нет в системе, обрыв провенанса.

**Дыра 2 — auto-annotate vs manual annotation edit.** В коде `autoAnnotate` запускается debounced useEffect после mutation (`useEffect 500ms debounce` в FragmentEditor). Это **derived state** — пересчитывается из baseline + mutations. Manual annotation edit (V40 в BUGS.md, биолог пометил регион вручную) — **semantic operation** с author + timestamp.

**Принятая формула (⚓ кандидат):**

> **Commit** = операция, меняющая sequence, ends или topology (триада), **ИЛИ** semantically marked operation: `pcr_amplify` даже когда sequence/ends/topology тождественны, manual annotation edit, milestone, explicit_clone, primer_synthesis_init.
>
> **Derived state** (auto-annotate, codon-usage hint, computed Tm/GC, regions через `getRegions`) — пересчитывается из `baseSnapshot + commits` по запросу или дешёво в memoized виде. **НЕ commit.**
>
> **Metadata** (name, description, organism для codon usage hint, free-text purpose, status, customColor) — mutable layer вне `commits[]`. Изменение не триггерит lazy git. Записывается в provenance journal проекта (не контейнера) с timestamp — для аудита кто переименовал, без захламления операционной истории контейнера.

Это даёт чёткий ответ для всех edge-cases:

- `flipFragment` (RC) — sequence изменилась → commit (triada).
- PCR-amplify полной плазмиды без overhang'ов — explicit operation marker → commit (даже когда sequence noop).
- AutoAnnotate — derived → НЕ commit.
- Manual annotation edit (V40) — explicit operation → commit подтипа `annotation_edit` (это и есть Sprint Annotation-Commits).
- Изменение имени → metadata journal, не commits[] контейнера.
- Изменение target organism для codon hint → metadata.
- Изменение `customColor` → metadata.

**Кандидат на ⚓.**

### 5.1.3 Слабость 7 — AssemblyContainer immutability → два состояния `planning` / `committed` (acceptance pattern)

Из §5 предложение «AssemblyContainer immutable после создания. Изменение параметров = новый AssemblyContainer.»

**Согласен в принципе, но UX-нюанс из реального кода.** В `junctionSlice.js` `asm.calculated = false` — биолог свободно меняет junction.enzyme/overhang в pre-calc состоянии (`updateJunction` reducer), потом запускает расчёт. В коде это **не отдельная сущность**, а просто flag на assembly-уровне. Если в новой модели любое изменение enzyme = новый AssemblyContainer + удаление старого, биолог при 5 правках получает 5 контейнеров на канвасе. UX-pain.

**Принятое решение — два состояния AssemblyContainer'а** (симметрично с primer-acceptance pattern из §4.4 «биолог явно соглашается с праймерами»):

- **`state: 'planning'`** — параметры мутабельные (enzyme, overhang, reactionClass, overlapMode). Primers/products **не существуют**, контейнер не виден в provenance graph как «реакция произошла». На канвасе — пунктирный узел (placeholder UX, как Figma drafts / Notion empty placeholders).
- **`state: 'committed'`** — биолог нажал `Запустить` / `Применить` → primers рассчитаны через `autoDesignGGOverhangs`-эквивалент, продукт создан как новый MoleculeContainer с `origin: 'assembly_product'`. С этого момента AssemblyContainer **immutable**. Изменение параметров = новый AssemblyContainer (пунктирный) рядом, старый остаётся.

**Lifecycle:** `planning → committed` (необратимо). Откат внутри `planning` — undo лёгкий (мутабельно). После `committed` — `re_do_assembly` создаёт новый assembly-узел, старый остаётся (или explicit-deleted через `Delete this assembly`).

**Параллель с primer-acceptance очевидна.** Биолог видит кандидатов primers → принимает → primers попадают в pool с id (`status: 'designed'`). Биолог видит кандидата assembly → принимает → AssemblyContainer становится committed. Acceptance pattern — единый архитектурный паттерн kickoff'а, переиспользуем для всех операций с deliverable.

**UI на канвасе:**

- Pending AssemblyContainer (planning): пунктирный узел с output как пунктирный MoleculeContainer (placeholder; UI показывает «pending Gibson reaction → product»).
- Committed AssemblyContainer: solid узел с solid output MoleculeContainer.

**Кандидат на ⚓.**

### 5.1.4 Слабость 5 — Clone (1→1) → операция с back-reference, трёхуровневая ownership симметрично с primer-pool

**Это ключевая развилка из §5, и реальность кода её разворачивает.** В `fragmentSlice.js`:

- `parts: []` — **глобальный** массив, top-level в state, persists в localStorage как top-level.
- `addFragmentDirect` AUTO-копирует part в `parts[]` если его там нет (см. §4.1.2).
- Каждый part имеет `origin.projectId` (где создан).

**Это уже двухуровневая модель**, просто незадуманная: `parts[]` = глобальный pool, `assemblies[i].fragments[]` = инстансы на канвасе. Биолог о ней не догадывается, потому что UI это не показывает явно.

**Развилка из §5 — (α) clone-как-DAG-узел / (β) двухуровневая library — обе хуже** того, что Игорь сам сказал в шаге 6 эволюции про primers:

> «Праймеры — сущности, живущие в рамках проекта, импортируются в общий файл.» (28.04.2026)

То есть **primary project-local, общий это opt-in export**. Применяя ту же логику к контейнерам = **трёхуровневая ownership-модель** с явной симметрией к primer-pool:

| Уровень | Контейнеры | Primers |
|---|---|---|
| **Project-local** | MoleculeContainer'ы и AssemblyContainer'ы в проекте | primer-pool проекта (origin = self) |
| **Shared library** | Контейнеры, опубликованные пользователем (`published: true`) | primers, экспортированные в общий файл (планируется как pool extension) |
| **Catalog** | Вшитый SnapGene (read-only, immutable) | — (не применимо) |

**Clone (1→1) тогда становится операцией, не узлом DAG:**

```
MoleculeContainer A (исходный)
 └── op: explicit_clone   ← commit-подтип в A (или metadata-операция)
        creates → MoleculeContainer A' (origin: clone_local, originContainerId: A)

A' независимо продолжает свою историю.
Канвас рисует тонкое ребро A → A' (пунктирное, отличается от assembly-edges).
```

**Что выигрывается:**

- **Один тип ребра** (assembly, основное) + **тонкое ребро** (source-зависимости от внутри-контейнерных insert/replace, и теперь plus clone). Не вводится третий тип, как было бы в (α).
- **Симметрия с primer-pool back-reference.** Container-clone и primer-copy используют одну и ту же mental model: «локальная копия с back-ref на источник, дальше живёт независимо».
- **Базовый use case «хочу одновременно plasmid и его PCR-продукт»** решается чисто:
  1. A = plasmid из library (clone-on-import → A.origin = `library_clone`).
  2. op `explicit_clone` в A → A'.
  3. В A → op `pcr_amplify(region X)` → A теперь linear с ends.
  4. На канвасе: A' (circular, untouched) + A (linear, после PCR). Тонкое ребро A → A'.

**Финальная позиция:** Clone = **операция** (commit-подтип), **не узел DAG**. Двухуровневая library НЕ нужна — нужна **трёхуровневая ownership** (project-local / shared / catalog) симметрично с primer-pool гибридом.

**Кандидат на ⚓.**

### 5.1.5 Сводка новых ⚓ кандидатов из N+1

К 16 базовым ⚓ кандидатам §2 добавляются 8 новых из §5.1 (закрытие слабостей 2/3/7/5) и §4.1 (расхождения с кодом). Все живут в этом kickoff-документе до полной архитектурной спеки в N+3 — фиксируются в DECISIONS.md одним блоком вместе со спекой.

| # | Происхождение | Содержание |
|---|---|---|
| 17 | §5.1.1 | Visual weight: mini-timeline (b) + auto-versioning title (c) + milestone override. Комбинация, не один из вариантов. |
| 18 | §5.1.2 | Lazy git триггер: triada (sequence/ends/topology) **ИЛИ** semantically marked operation. Auto-derived state — НЕ commit. Metadata (имя/organism/color) — НЕ commit, в provenance journal проекта. |
| 19 | §5.1.3 | AssemblyContainer lifecycle: `planning` (мутабельный, пунктирный) → `committed` (immutable, solid). Acceptance pattern симметричен с primer-pool. |
| 20 | §5.1.4 | Clone = операция (commit-подтип `explicit_clone`), не узел DAG. Трёхуровневая ownership: project-local / shared / catalog. Симметрично с primer-pool. |
| 21 | §4.1.2 | Поля `origin` (enum типа источника) и `provenance` (per-project metadata) — раздельные. Migration v8→v9 переименовывает старое `origin` → `provenance`, новое `origin` derived из `source` поля по эвристике. |
| 22 | §4.1.3 | `commit.warnings: string[]` — внутренние warnings контейнера. AssemblyContainer.warnings — только reaction-warnings. Не смешивать. |
| 23 | §4.1.4 | Persistence на IndexedDB — обязательный sprint **ПЕРЕД** Project Model data-restructure. localStorage 5–10 MB hard limit — реальная угроза для multi-project state. |
| 24 | §4.1.5 | Migration v8→v9: legacy `f.mutations[]` конвертируется в `commits[]` с пометкой `migrated_from_legacy: true`. Не удаляется (потеря провенанса), не остаётся отдельным слоем (двойная история). |

**Состояние слабостей после N+1:**

- ✅ Слабость 2 — закрыта (см. §5.1.1)
- ✅ Слабость 3 — закрыта (см. §5.1.2)
- 🟡 Слабость 4 — открыта, в N+2 (frozen snapshot data volume + UX «найденная ошибка в historic snapshot»)
- ✅ Слабость 5 — закрыта (см. §5.1.4)
- 🟡 Слабость 6 — acknowledged, в backlog (overengineering)
- ✅ Слабость 7 — закрыта (см. §5.1.3)
- 🟡 Слабость 8 — acknowledged, отдельный sprint (расширен находкой §4.1.1 — два шага)
- ✅ Слабость 9 — закрыта в N+1 (реальный код прочитан)

---

## 6. Открытые архитектурные вопросы вне слабостей

Темы, не вошедшие в обсуждение текущей сессии. Не критика модели, а просто незатронутое. Будут закрываться в N+1, N+2 параллельно с слабостями 2–7.

### 6.1 Persistence формат

- Один файл `.bdg` (JSON) или папка с `project.json` + `assets/`?
- Schema versioning — `project.schemaVersion: 1` + migration policy при открытии старых файлов?
- Save-API в браузере — Chrome File System Access API (Chrome 86+, не Firefox/Safari) или fallback `download .json` + `<input type="file">` upload?
- Auto-save во внутреннее хранилище (IndexedDB) между сессиями или только ручной save?

### 6.2 Стартовая страница UX

- Список «Recent projects» — где хранится (IndexedDB / localStorage)? Сколько последних показывать?
- При первом запуске пользователя (нет recent) — что показываем? Кнопка `Создать проект` + `Открыть с диска`?
- Поле имени проекта — обязательное при создании или можно потом? Уникальность проверяем?
- Empty state нового проекта — пустой канвас или сразу открывается importer?

### 6.3 Граница project ↔ library в практическом UX

- Library в текущей модели — это `parts-slice` (catalog + user imports). После migration — двухуровневая (если (β) в слабости 5) или одноуровневая.
- Если пользователь импортирует `.dna` в проекте A → fragment попадает в общую library (видна в B) или только в проект A? Если общая — это меняет ментальную модель «моих файлов».
- Paste-text — попадает в library или только в активный проект? (Связано с F2/F3 из BUGS.md.)

### 6.4 UI внутри контейнера

- Modal vs full-screen vs side panel.
- Как replace-fragment picker выглядит (список контейнеров проекта + кнопка `из library` open library overlay).
- Как primer-synthesis tool выглядит (отдельный modal в importer'е).
- Как milestone UX (кнопка `Застолбить версию` в истории).
- Унификация Construct view + Project Flow (DRAFT 27.04.2026 положение, подтверждено) — один URL/route с авто-выбором layout, или два route'а на одной модели? Анимация перехода между линейным и DAG представлением — нужна или snap?

### 6.5 Display-fold правила для commits[]

- Что считать «однотипным подряд» — ≥3 mutate без других операций между?
- Настраивается ли биологом или хардкод?
- Включается ли по умолчанию или по запросу?

### 6.6 Inventory операций для первой версии

**Минимальное ядро (подтверждено в обсуждении):**

- mutate (point/indel/codon) — внутри контейнера
- cut-keep / split — внутри контейнера или в DAG (зависит от user choice в момент cut)
- PCR-amplify — внутри контейнера
- fragment-insert (replace = cut + insert) — внутри контейнера, source = другой контейнер
- assembly Gibson/GG/RE/blunt — DAG узел (N→1)
- primer-synthesis — origin для нового контейнера

**Backlog:**

- ligation двух linear (близко к Gibson, но не идентично)
- transformation (это операция или metadata «контейнер был трансформирован»?)
- sequencing-verify (commit или milestone?)
- dephosphorylation
- blunting (T4 polymerase blunting overhangs)

### 6.7 Soединительные операции на >2 контейнерах

**Из DRAFT 27.04.2026, не закрыто.** Multi-fragment Gibson, GG с N фрагментами — одно ребро hyperedge (несколько узлов одновременно), или цепочка попарных рёбер? Биологически это одна реакция, графически hyperedge нестандарт.

### 6.8 Auto-protocol traversal

**Из DRAFT 27.04.2026, не закрыто.** Протокол = traversal графа контейнеров с print их операций. В каком порядке (топологическая сортировка от leaves к root? в обратном направлении?). Группировка операций (всё что касается одного контейнера → один шаг протокола, или каждая операция → шаг?).

### 6.9 Дополнительные ad-hoc предложения из обсуждения

- **Поле `purpose` / `note` у контейнера** — свободный текст mutable («backbone для конструкта X», «промежуточный clone для проверки сайта Y»). Не часть commits[]. Дополняет имя (имя — короткий идентификатор, purpose — описание роли в проекте). То же для AssemblyContainer.
- **Аналогичный note для AssemblyContainer** («Gibson попытка 1, не сработала», «попытка 2 — успех»). Контекст, который теряется в чисто параметрической записи.

### 6.10 Уровень детализации операционного лога

**Из DRAFT 27.04.2026.** Каждая UI-операция → отдельная запись истории, или batch'и (как `applyMutationsBatch` в Plasmid-Git)? Sprint X cycle решил batch для мутаций, но для соединительных операций batch'и могут быть менее уместны (одна digest-операция = один логический шаг).

### 6.11 Что показывает контейнер на канвасе

**Из DRAFT 27.04.2026.** Mini-map molecule (как сейчас PartBlock с regions)? Имя + длина + bp count + topology icon? Custom иконка по типу содержимого (linear / circular / fragment / mixed)? Это UX-вопрос, решается в prototype-first фазе.

### 6.12 Quick-fixes V31 / V33 (не блокируют Project Model)

- **V33** — block кнопки `🧪 Создать сборку (N)` в FragmentEditor footer при наличии pending-мутаций. ~30 мин.
- **V31** — PlasmidMap rescales on window resize (регрессия Map-WS-1 Skeleton K4). ~30 мин.

Могут быть закрыты параллельно отдельной мини-сессией Code, не задерживая kickoff. После Project Model они могут стать неактуальными или принять другую форму.

---

## 7. Что упрощается / уходит из текущего UI и data-model

Унаследовано из CONTAINER_ARCHITECTURE_DRAFT.md (27.04.2026), подтверждено и расширено сегодня.

### 7.1 Концепции (что схлопывается)

| Сейчас | После |
|---|---|
| `Part` (шаблон в библиотеке) | `Part` остаётся как шаблон молекулы (содержимое будущего контейнера) |
| `Fragment` (инстанс на канвасе) | `MoleculeContainer` (узел графа), молекула — содержимое |
| `Junction` (связь между фрагментами) | Свойство стыка `(endA, endB) + reactionClass` внутри AssemblyContainer |
| `Assembly` (набор фрагментов + junctions) | Подграф контейнеров и операций (DAG) |
| Construct view + Project Flow (два UI) | Один UI с авто-layout (линейный / DAG) |
| 6 типов junction (overlap / GG / KLD / ligation / re_ligation / restriction) | Производные от пары концов + reaction class |
| External source (paste из текста) | MoleculeContainer с origin: 'paste' (через importer) |
| Primer как deliverable операции | Primer как first-class сущность проекта с reuse |

**Концепций становится меньше, не больше.** Это редукция.

### 7.2 Сущности уровня UI (что схлопывается)

| Сейчас | После |
|---|---|
| ImportDecisionModal (удалён в K8) | Не нужен: импорт = создание контейнера |
| PlasmidUseWizard (10 режимов) | Контекстное меню контейнера / контекстные действия в графе |
| Restriction Wizard (3 экрана) | Click на 2 RE site внутри контейнера → жмак «вырезать» → линейный кусок появляется во втором контейнере (split-операция) |
| FragmentEditor | View контейнера: внутри полный PlasmidViewer |
| Mutagenesis Wizard | Операция над контейнером: накапливается в его истории, появляется как commit в Plasmid-Git |
| V7 INSERTION-CLOCK (открытый High в BUGS.md) | Не нужен. Курсор в активном контейнере + context-action «Gibson вставка из X» |
| V19 codon-edit UX redesign | Унифицируется в context-action «substitution / insertion / deletion» |
| Tag insertion (отсутствует как workflow) | Курсор на N/C terminus CDS → context-action «вставить tag из палитры» |

Большая часть текущих модалок / визардов схлопывается либо в context-menu контейнера, либо в прямые жесты на канвасе. Это унаследовано из DRAFT 27.04.2026 § «Унификация операций "где + что + откуда"».

### 7.3 Что не ломается

- **`.dna`, `.gb`, `.gbk`, `.fasta`** — на входе и выходе. Внутри контейнерная модель, на экспорте — конечная плазмида с метаданными provenance в qualifiers (`COMMENT` блок, формат TBD см. §6.7 DRAFT'а).
- **Plasmid-Git data model** (Sprint X cycle, 26.04.2026) — переезжает на уровень контейнера 1:1. baseSnapshot + commits[] + replay становится частью Container.
- **Канонический IUPAC + sanitize-at-entry** — без изменений; работает на уровне молекулы внутри контейнера.
- **feature-palette.js / FEATURE_STROKE / getRegions** — без изменений; работают на уровне молекулы.
- **autoAnnotate / enrichWithCommonFeatures** — операция над контейнером; накапливается в истории.
- **6 методов сборки** — соединительные операции; тип производный от пары концов + reaction class.

Контейнерная модель не отменяет ничего из сделанного — она достраивает третий слой над двумя предыдущими (Zustand-миграция 28.03.2026, Plasmid-Git 26.04.2026).

---

## 8. Совместимость и migration

### 8.1 GenBank exchange

`.gb` парсеры конкурентов (SnapGene / Benchling / Geneious / ApE) **игнорируют** незнакомые qualifiers — обычная плазмида в их инструментах. **BodgeGene-парсер** этих файлов восстанавливает граф операций и показывает полный provenance.

Пример экспорта плазмиды (формат TBD — структурированный mini-DSL vs JSON в `/note`, см. §6.7 DRAFT'а — открытый вопрос для архитектурной спеки):

```
COMMENT     BodgeGene provenance:
            origin: pUC19 (catalog)
            ops: digest_EcoRI_BamHI -> linear_backbone
            ops: ligation_with_EGFP_CDS_from_pET28-EGFP
            ops: mutagenesis_Q45R
            generated: 2026-04-28 BodgeGene v0.6.0-alpha
```

**Zero-cost interop с upside для BodgeGene-экосистемы.**

### 8.2 Migration `.bodgegene` файлов

Тривиальна по структуре:

- Каждый `Fragment` → `MoleculeContainer` с одной молекулой (`baseSnapshot = fragment.sequence`, `commits[] = fragment.commits[]` если был Plasmid-Git, иначе пусто).
- Каждый `Junction` → ребро AssemblyContainer'а с `reactionClass` из старого `junction.type`.
- Schema bump v_N → v_N+1, миграция один раз при первой загрузке.
- Текущие designed primers — попадают в primer-pool default project'а.

Без потери данных, без интерпретационных решений (для базовых случаев). Edge cases (старые проекты с custom junction'ами или ручными правками state) могут потребовать interactive migration UI.

Подробности — в спринте «Migration v0.5 → v0.6 (project model)» после архитектурной спеки.

### 8.3 Конкуренты и structural advantage

Из DRAFT 27.04.2026:

> SnapGene / Benchling / Geneious стартовали как single-molecule editors (SnapGene 2010, библиотеки появились только к 4-й версии в 2017; Gibson вышел 2009, Golden Gate 2008–2011). Multi-fragment assembly у них — extension over single-molecule core. Junction в их моделях такой же костыль, как у нас сейчас.
>
> Контейнерная модель **в которой первичен граф операций над контейнерами, а молекула — содержимое узла графа** — это инверсия. У них молекула первична, граф вторичен. У нас будет наоборот.
>
> Они не могут к этому переехать без переписывания ядра — десять лет проектов миллионов биологов хранится в old-model. **Greenfield-проект может стартовать сразу с правильной модели.** Появление позже даёт structural advantage, а не отставание.

Это положение остаётся в силе. После сегодняшней kickoff'и оно дополнено **primer-pool как параллельным слоем** — никто из конкурентов не имеет first-class primer reuse через container lineage.

---

## 9. План перехода в архитектурную спеку

### 9.1 Sequence сессий

**Сессия N+1 (28.04.2026, ✅ выполнена):**

1. ✅ Стартовый пакет по §1 playbook.
2. ✅ Подгрузка этого документа.
3. ✅ Чтение реального кода (закрытие слабости 9): `lib/plasmid-git.js`, `lib/plasmid-git-reducers.js`, `store/fragmentSlice.js` (включает `parts[]`), `store/projectSlice.js`, `store/junctionSlice.js`, `store/index.js` (с migration logic v3→v8). Найдено 5 расхождений с моделью — см. §4.1. (Заметка: `parts-slice.js` отдельным файлом не существует — parts живут в `fragmentSlice.js` под глобальным `parts: []`; это само по себе значимо для миграции.)
4. ✅ Закрытие слабостей 2/3/7/5 — см. §5.1. Добавлены 8 новых ⚓ кандидатов (всего теперь 24).
5. ⏭ Quick-fixes V31/V33 не закрывались — отложены либо в параллельную мини-сессию Code, либо в N+1.5.

**Сессия N+2:**

- Закрытие слабости 4 (formal sub-region snapshot + UX «найденная ошибка в historic snapshot»).
- Закрытие открытых вопросов из §6 в порядке приоритета:
  - **6.1 Persistence формат** — обязательно, сейчас критично из-за §4.1.4 (IndexedDB sprint должен быть до Project Model data-restructure).
  - **6.2 Стартовая страница UX**.
  - **6.3 Граница project ↔ library в практическом UX** — теперь под влиянием §5.1.4 «трёхуровневая ownership».
  - **6.4 UI внутри контейнера**.
  - 6.5–6.11 — по мере оставшегося контекста.
- Если ≥2 фундаментальных решения остались open — возможно ещё одна сессия N+2.5.

**Сессия N+3:**

- **Архитектурная спека** уровня DECISIONS — `docs/ARCHITECTURE_PROJECT_MODEL.md`. Тип A по §13. Целевой размер 25–30 KB.
- Содержит: data model (Project, MoleculeContainer, AssemblyContainer, Library, Primer, Commit), DAG operations, lazy git lifecycle, migration policy высокоуровнево, структуру Zustand slices, файловую раскладку, sprint plan нижнего уровня.
- Из неё вырастают 4–6 sprint-спек (data model + store rewiring → start screen → library overlay → DAG canvas → persistence → migration). Каждая — отдельный sprint в sequence.

**Сессии N+4 и далее — реализация по sprint-спекам.**

### 9.2 Что обязательно при переходе

- Каждая сессия начинается с compact (§7 playbook).
- Каждая sprint-спека на этой архитектуре пишется по полному циклу §2 playbook (sanity check 3 вопроса перед стартом, размер по типу задачи, структура спеки).
- DECISIONS.md дополняется ⚓-блоком с 16 кандидатами при принятии архитектурной спеки. До этого момента 16 кандидатов остаются **в этом документе** как kickoff-результат, не в DECISIONS.
- TECH_DEBT.md дополняется при каждом sprint-финализации.

### 9.3 Где этот документ живёт

- **Сейчас:** `docs/PROJECT_MODEL_KICKOFF.md` (создан 28.04.2026).
- **При написании архитектурной спеки** (сессия N+3): этот документ продолжает жить, на него ссылается ARCHITECTURE_PROJECT_MODEL.md в разделе «Источники / kickoff history».
- **При финализации Sprint Migration v0.5 → v0.6:** в `docs/archive/` со штампом `**Статус:** ✅ ИНКОРПОРИРОВАНО в ARCHITECTURE_PROJECT_MODEL.md [дата]`.

Старый `CONTAINER_ARCHITECTURE_DRAFT.md` (27.04.2026) — **замещается** этим документом. После того, как Игорь подтвердит чтение нового документа, DRAFT можно перенести в `docs/archive/` со штампом `**Статус:** 🟢 ЗАМЕЩЁН docs/PROJECT_MODEL_KICKOFF.md (28.04.2026)`.

---

## 10. Стоимость, риски, что выигрывает проект

### 10.1 Стоимость

Унаследовано из DRAFT 27.04.2026, подтверждено сегодня:

- 2 крупных спринта на data-model + базовый рендер + migration. Не 4–6 как изначально оценивал — реалистичность снижена после уточнения «контейнер = одна активная молекула, виртуальный стол».
- Plus 1–2 спринта на полную унификацию Construct + Flow и переезд всех существующих модалок / визардов на контейнерные действия.
- Plus 1 спринт на primer-pool (slice + UI + reuse logic + back-reference).
- Реалистично 4–6 итераций FAIL-fix через все спринты; pet-проект, не критично.

Итого: **5–7 sprint'ов** до первой полностью работающей версии новой модели.

### 10.2 Риски

**A. Скоуп взрыв.** Вся модель = переписка фундамента приложения. Реализация 5–8 спринтов. Риск застрять без user-visible результата на 2–3 спринта подряд.

**Mitigation.** Между спринтами Project Model сознательно вкраплять quick-fix-сессии (V31/V33/V40-если-нужно отдельно), чтобы не терять моментум.

**B. UX-вопросы съедят больше, чем data-model.** Текущая kickoff закрыла data-model на ~80%, UX — на ~20% (стартовая страница, picker, history viewer, milestone UX, library two-level — много UI-решений).

**Mitigation.** После архитектурной спеки сразу следующая сессия — UX kickoff, не sprint-спека. Закрываем UX-развилки до того, как Code начнёт.

**C. Передумаем что-то фундаментальное на полпути.** Особенно «два класса контейнеров» и «lazy git».

**Mitigation.** Первая sprint-спека после архитектурной — самая маленькая возможная (только тип Project + контейнер shell, без операций). Получаем рабочий «новый проект → создан → пустой канвас → сохранить → загрузить» flow. Это валидирует фундамент. Если хочется передумать — дёшево.

**D. Migration .bodgegene files.** Тривиально по структуре, нетривиально на edge-cases (старые проекты с custom junction'ами).

**Mitigation.** Schema bump + один раз при первой загрузке + extensive regression-тестирование. Отдельный sprint Migration v0.5 → v0.6.

**E. UI переходный период.** Текущие модалки и визарды живут параллельно с контейнерной моделью пока не закроется полный переезд.

**Mitigation.** Разделить на спринты по типу UI-сущностей; не пытаться всё одновременно.

**F. Concept fatigue для будущих сотрудников.** Игорь работает в контейнерной модели, новые сотрудники проекта обучаются на этой модели.

**Mitigation.** Прокидывание UX_VISION + DECISIONS как обязательного pre-read.

**G. Auto-protocol может разочаровать в первой итерации.** Provenance-граф автоматизирует часть протокола, но не всю (биолог часто корректирует протокол под свои реактивы / instruments).

**Mitigation.** Позиционировать auto-protocol как draft, не final; биолог редактирует. Это ничего не ломает.

### 10.3 Что выигрывает проект

- **Data model**, которая радикально чище конкурентов и даёт BodgeGene structural advantage (см. §8.3).
- **Auto-protocol** падает естественным побочным эффектом, не требует отдельного крупного спринта.
- **Provenance** становится первоклассным свойством плазмиды, не feature.
- **Primer reuse** через container lineage — никто из конкурентов не имеет.
- **Унификация Construct + Flow:** меньше UI-кода, меньше тестов, меньше документации.
- **6 методов сборки** становятся единой системой через `(endA, endB) + reactionClass` — меньше ручного выбора method'а биологом, больше автоматической валидации.
- **Novel contribution для статьи Bioinformatics/JOSS:** «format-compatible cloning tool with novel container/graph data model enabling verifiable provenance and cross-project primer reuse». Это уже не «ещё один редактор», а **publishable architectural idea**.

---

## 11. Ключевые формулировки Игоря

Цитаты-якоря из обсуждения 27.04.2026 (DRAFT) и 28.04.2026 (kickoff). Возвращаться к ним при сомнениях.

> «Контейнер не пробирка. Эта абстракция, но очень чёткая, в которой каждая операция транслируется на стол молбиолога.» (28.04.2026)

> «История — это атрибут контейнера. Если контейнер есть в библиотеке — у него есть история.» (28.04.2026)

> «Мы заходим в контейнер молекулы и там делаем операции (или даже их последовательность). На канвасе мы видим конечную форму контейнера после этих операций.» (28.04.2026)

> «Берём из второго контейнера, который на канвасе, или берём из библиотеки, но при этом всё равно контейнер попадает на канвас. То, что ты описал, — просто две последовательные операции внутри одного контейнера.» (28.04.2026)

> «Возможно стоит GIT реализовать по требованию?» (28.04.2026)

> «Мы же не лимитированы в количестве контейнеров. В этом и прелесть. Захотели — ввели новую сущность. И если та подчиняется нашим правилам, то имеет выход "наружу" за счёт хвостов.» (28.04.2026)

> «Когда мы делаем контейнер (например ставим линейный участок и говорим что там ПЦР), то праймеры пишутся автоматом. После того как мы явно согласились с праймерами, они попадают в базу данных.» (28.04.2026)

> «Если этот же контейнер используем в другом проекте, то при его вытаскивании и явном указании "ПЦР" (условно и там и там просто ПЦР фрагмента без хвостовых последовательностей), то праймеры предлагаются из известных.» (28.04.2026)

> «Гибрид: primer хранится в проекте, где был создан (origin project), при reuse в другом проекте создаётся локальная копия с back-reference на origin.» (28.04.2026)

> «Открываем контейнер, ставим курсор на 789-й нуклеотид, говорим — сюда вставить через Gibson фрагмент из контейнера 2.» (27.04.2026)

> «Pet-проект, сроки не пугают; совместимость со SnapGene/.gb сохраняется — конечная плазмида экспортируется как обычно, с зафиксированным графом изменений и отслеживаемым процессом.» (27.04.2026)

---

## Приложение A. Связь с уже сделанным

Унаследовано из DRAFT 27.04.2026, расширено сегодняшней сессией.

| Уже сделано | Как ложится на проектную модель |
|---|---|
| **Plasmid-Git** (Sprint X cycle, 26.04.2026) | Переезжает на уровень MoleculeContainer 1:1. baseSnapshot + commits[] + replay становится частью Container. История операций контейнера = расширение Plasmid-Git до структурных и соединительных операций. Lazy git добавляется поверх. |
| **Project Flow** (`@xyflow/react`, 5 node types, DAG) | Унифицируется с Construct view на одной data-модели (граф контейнеров) |
| **UX_VISION ставка 6 (provenance)** | Контейнер = структурный носитель provenance. Граф операций + lineage chain = visible record |
| **UX_VISION ставка 1 (Plasmid-Git: state + time)** | Расширяется до уровня контейнера. Diff viewer + commit graph живут внутри view контейнера |
| **Канонический IUPAC + sanitize-at-entry** | Без изменений; работает на уровне молекулы внутри контейнера |
| **feature-palette.js / FEATURE_STROKE / getRegions** | Без изменений; работают на уровне молекулы |
| **autoAnnotate / enrichWithCommonFeatures** | Операция над контейнером (annotate); накапливается в истории как commit подтипа annotation_edit (Sprint Annotation-Commits) |
| **6 методов сборки** | Соединительные операции в AssemblyContainer; тип производный от пары концов + reaction class |
| **Тэг-aware primer design** (`findBindingTagAware()`) | Переезжает в primer-pool как метаданные дизайна `designMeta.designedFor` + bindingLength |
| **Importer (Sprint Catalog Polish FIX-2, 28.04.2026)** | Остаётся entry-point для внешнего sequence; output = MoleculeContainer; четвёртая опция (primer-synthesis) добавляется |

Контейнерная модель не отменяет ничего из сделанного — она достраивает третий слой над двумя предыдущими (Zustand-миграция 28.03.2026, Plasmid-Git 26.04.2026), плюс параллельный слой primers.

---

## Приложение B. Что меняется относительно DRAFT 27.04.2026

DRAFT 27.04.2026 (`CONTAINER_ARCHITECTURE_DRAFT.md`) был «🟡 в обсуждении, не принято», ждал kickoff-интервью с 8 открытыми вопросами. Этот документ — результат kickoff'а.

### B.1 Что подтверждено из DRAFT'а без изменений

- Контейнер = виртуальный операционный стол с одной активной молекулой.
- Канвас = граф контейнеров и операций (DAG).
- Construct view + Project Flow унифицируются на одной data-модели с авто-layout.
- Schема концепций (Part / Fragment → Container, Junction → end-pair + reactionClass).
- Совместимость с .dna/.gb через provenance в qualifiers.
- Migration .bodgegene тривиальна по структуре.
- Cost/risks/horizon оценки.

### B.2 Что переформулировано

- **DRAFT'овская «история контейнера» как монолит** → разделение на **внутри-контейнерные** (commits[]) и **между-контейнерные** (узлы DAG) операции. DRAFT неявно подразумевал что любая операция попадает в commits[]; сегодня уточнили что это слишком много шума на канвасе.
- **Library как пул plasmid-снапшотов** → **library как пул контейнеров с историей**. История путешествует с контейнером.
- **External source неопределён** → `MoleculeContainer` через importer (поглощается existing flow). Слабость 1 закрыта.
- **Primers неопределены** → first-class сущность проекта, гибридный pool, primer-synthesized container как новый origin.
- **Lazy git не упоминается** → принципиальное положение модели.
- **Replace-fragment как separate workflow** → декомпозиция на cut + insert внутри одного контейнера.

### B.3 8 открытых вопросов DRAFT'а — статус сейчас

| # | DRAFT-вопрос | Статус сегодня |
|---|---|---|
| 1 | Construct + Flow: полная унификация или один UI с двумя layout-режимами? | Подтверждена унификация. UX-детали (один URL/route или два) — открытый вопрос §6.4. |
| 2 | `Part` semantic в библиотеке | Подтверждено: Part = шаблон молекулы (= содержимое будущего MoleculeContainer). 94 текущих parts — тривиальная migration. |
| 3 | Форма экспорта provenance в `.gb` qualifiers | Открытый вопрос для архитектурной спеки (§8.1). |
| 4 | Уровень детализации операционного лога | Открытый вопрос §6.10. |
| 5 | Что показывает контейнер на канвасе (UX) | Открытый вопрос §6.11 (UX-вопрос, prototype-first фаза). |
| 6 | Ребро операции в графе: что показывает | Открытый вопрос §6.4 (UX). |
| 7 | Соединительные операции на >2 контейнерах (hyperedge vs цепочка) | Открытый вопрос §6.7. |
| 8 | Auto-protocol traversal (порядок, группировка) | Открытый вопрос §6.8. |

### B.4 Что добавлено в этом документе сверх DRAFT'а

- Расширение модели до **Project + Container + DAG** (DRAFT был только Container + DAG, без явного Project layer).
- **Lazy git** как принципиальное положение.
- **Слабости 1–9** с явными формулировками и mitigation.
- **Primers as project entity** — новый параллельный слой.
- **Primer-synthesized container** — новый origin для MoleculeContainer.
- **Primer-pool гибридный** — стратегия хранения с back-reference.
- **Origin для MoleculeContainer** — фиксированный набор семи значений.
- **Frozen lineage chain** при clone-on-import — формальное требование портативности контейнера.
- **9 ключевых формулировок Игоря** как якорей модели.
- **План перехода в архитектурную спеку** с N+1 / N+2 / N+3 sequence.

### B.5 Что DRAFT планировал, что не делается

- DRAFT упоминал **prototype-first** как обязательную фазу (по ⚓ DECISIONS 23.04.2026). Сегодня это не отменено, но фаза прототипа сдвинута: **сначала архитектурная спека → потом прототип на 1–2 поверхностях** (минимально: контейнер на канвасе + базовая операция между двумя контейнерами + migration одного `.bodgegene` файла) → review → полная реализация.

---

**Конец документа.**

**Дата создания:** 28.04.2026 (kickoff). Дополнен 28.04.2026 после N+1.
**Версия:** 1.1 — N+1 закрыл слабости 2/3/7/5 + 5 расхождений с реальным кодом; добавлены 8 новых ⚓ кандидатов (всего 24); открыты слабость 4 + большая часть §6.
**Следующий шаг:** N+2 — закрытие слабости 4 + §6 (приоритет: 6.1 persistence, 6.2 стартовая страница, 6.3 граница project↔library, 6.4 UI внутри контейнера). Затем N+3 — архитектурная спека `ARCHITECTURE_PROJECT_MODEL.md`.
