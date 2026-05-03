# BodgeGene — Project Model Kickoff

**Дата:** 28.04.2026.
**Статус:** обобщающий документ kickoff-обсуждения новой архитектуры.
**Природа:** живой контекст между Chat и Игорем. **Не спека**, не подчиняется правилам §2 / §4 playbook'а. Документ ведётся вручную, обновляется по ходу обсуждения.

**Цель документа.** Сохранить **всё**, что прозвучало в обсуждении 28.04.2026: исходную постановку, ключевые формулировки Игоря, эволюцию модели, принятые решения, найденные слабости, открытые вопросы. Чтобы новая сессия после compact могла продолжить обсуждение без потери контекста.

---

## Содержание

- [Часть I — Исходная постановка и эволюция модели](#часть-i)
- [Часть II — Ключевые формулировки Игоря](#часть-ii)
- [Часть III — Принятая модель (10 → 14 кандидатов в ⚓ DECISIONS)](#часть-iii)
- [Часть IV — Закрытие слабости 1: External source / Primers / Primer-synthesized container](#часть-iv)
- [Часть V — Слабости 2–9 для последующих итераций](#часть-v)
- [Часть VI — Открытые архитектурные вопросы вне слабостей](#часть-vi)
- [Часть VII — План перехода и риски](#часть-vii)

---

## Часть I — Исходная постановка и эволюция модели

### I.1 Изначальный запрос Игоря

> «Давай сделаем стартовую страницу — создать проект либо открыть проект. Проект де факто логические операции, которые сводятся к получению одной либо нескольких версий одной конструкции. Начинается всё с поля проекта — можно выбрать существующий или создать новый. Далее мы попадаем на наш импортер — окно для наполнения проекта. Там мы из нашей библиотеки (для начала она общая для всех проектов) накидываем в проект то, что нам нужно. После чего оно агрегируется на канвасе. Проекты можно сохранять на жёсткий диск и подгружать из него.»

**Из этого прямо следует:**
- Стартовая страница: `Создать проект` / `Открыть проект`.
- Проект = логическая единица (одна или несколько версий одной конструкции).
- После выбора/создания → importer (наполнение из общей библиотеки).
- Затем → канвас (агрегация выбранных частей).
- Save/load проектов на диск.

### I.2 Расширение модели в ходе обсуждения

Расширение пришло после фразы:

> «Внутри проекта есть логические контейнеры, содержащие часть или плазмиду. Внутри контейнера мы делаем операции над фрагментом. Выходом во внешний мир являются "концы" фрагмента, которые делаются для соединения с другими объектами (Гибсон, GG и т.д.). Для нас любое изменение фрагмента — это запись в гит, где фиксируется запись и суть изменений. Фрагмент имеет длинную историю наследования, однако она может укрупняться, так как мелкие замены не должны сильно перегружать суть. Я ещё не знаю как это реализовать. С плазмидами всё проще. Любая операция — это как минимум ПЦР… Т.е. плазмида как финальный продукт для нас.»

Появились слои:
- **Контейнер** как unit работы и истории.
- **Концы фрагмента** как публичный API контейнера для assembly.
- **История git** на уровне контейнера.
- **Укрупнение истории** — открытый вопрос.
- **Плазмида** = closed-form, для использования в assembly требует операции (как минимум PCR).

### I.3 Дальнейшие уточнения

Каждое следующее уточнение Игоря снимало развилку или разворачивало модель:

- **«Контейнер ≠ пробирка, абстракция, в которой каждая операция транслируется на стол молбиолога»** — установило изоморфизм data ↔ протокол. Разные операции = разные контейнеры.

- **«История = атрибут контейнера. Если контейнер есть в библиотеке, у него есть история»** — сделало контейнер портативной единицей. Library — пул контейнеров, не пул snapshot'ов.

- **«Мы заходим в контейнер молекулы и там делаем операции. На канвасе видим конечную форму контейнера после этих операций»** — разделило операции на внутри-контейнерные (commits[], невидимы на канвасе) и между-контейнерные (узлы DAG). Сняло моё избыточное предложение «PCR как AssemblyContainer».

- **«Берём из второго контейнера на канвасе или из библиотеки, но контейнер всё равно попадает на канвас. Replace — это две последовательные операции внутри одного контейнера»** — зафиксировало source для insert как другой контейнер (не свободный текст), и декомпозицию replace в коммиты cut + insert.

- **«Git реализовать по требованию»** — открыло принцип lazy git. Контейнер «как взят из library» = baseline без commits[]. Первая mutate-операция инициализирует commits[].

- **«Мы специально сделали максимально гибкий импортер. Копипаст, открываем импорт и втыкаем последовательность. Все праймеры скорее всего будут жить внутри контейнера»** + **«Праймеры это сущности, живущие в рамках проекта, импортируются в общий файл (или отдельный файл)»** + **«primer-assembled container — хорошая мысль»** — закрыло слабость 1 (external source через importer) и открыло primers как first-class сущность параллельно контейнерам.

- **«Гибрид: primer хранится в проекте, где был создан (origin project), при reuse в другом проекте создаётся локальная копия с back-reference на origin»** — выбор стратегии хранения primer-pool.

---

## Часть II — Ключевые формулировки Игоря

Цитаты, на которых выстроилась модель. Возвращаться к ним при сомнениях.

> «Контейнер не пробирка. Эта абстракция, но очень чёткая, в которой каждая операция транслируется на стол молбиолога.»

> «История — это атрибут контейнера. Если контейнер есть в библиотеке — у него есть история.»

> «Мы заходим в контейнер молекулы и там делаем операции (или даже их последовательность). На канвасе мы видим конечную форму контейнера после этих операций.»

> «Берём из второго контейнера, который на канвасе, или берём из библиотеки, но при этом всё равно контейнер попадает на канвас. То, что ты описал, — просто две последовательные операции внутри одного контейнера.»

> «Возможно стоит GIT реализовать по требованию?»

> «Мы же не лимитированы в количестве контейнеров. В этом и прелесть. Захотели — ввели новую сущность. И если та подчиняется нашим правилам, то имеет выход "наружу" за счёт хвостов.»

> «Когда мы делаем контейнер (например ставим линейный участок и говорим что там ПЦР), то праймеры пишутся автоматом. После того как мы явно согласились с праймерами, они попадают в базу данных.»

> «Если этот же контейнер используем в другом проекте, то при его вытаскивании и явном указании "ПЦР" (условно и там и там просто ПЦР фрагмента без хвостовых последовательностей), то праймеры предлагаются из известных.»

> «Гибрид: primer хранится в проекте, где был создан (origin project), при reuse в другом проекте создаётся локальная копия с back-reference на origin.»

---

## Часть III — Принятая модель

### III.1 Список ⚓ кандидатов в DECISIONS.md

После всех итераций обсуждения 28.04.2026.

**1. Контейнер = instance молекулы в проекте + история операций.** Разные операции на одинаковой стартовой молекуле = разные контейнеры (биологически = разные tubes на столе).

**2. Изоморфизм data ↔ протокол.** Каждая операция в data-модели = реальная процедура в боксе.

**3. Внутри-контейнерные операции** (mutate, cut-keep, PCR-amplify, fragment-insert, tag-add, topology-change) идут в commits[] контейнера. Контейнер остаётся тем же, обновляется state и ends. Коммит может ссылаться на другой контейнер как source (с frozen snapshot региона на момент операции).

**4. Между-контейнерные операции** — узлы DAG на канвасе, порождают новые контейнеры:
- **Assembly** (N→1): Gibson / GG / RE / blunt.
- **Split** (1→2): cut с сохранением обоих фрагментов (биолог выбирает в момент cut: keep-one внутри текущего контейнера, либо split на два).
- **Clone** (1→1): user-explicit branch внутри проекта. **Под вопросом** — может быть заменён на UX-shortcut «snapshot-to-scratch + clone-on-import» если выберем двухуровневую library (см. слабость 5).

Parent-контейнеры immutable в snapshot lineage.

**5. Канвас = DAG контейнеров.** Основные рёбра — между-контейнерные операции. Тонкие рёбра — source-зависимости от внутри-контейнерных insert/replace коммитов (визуально слабее или показываются только при наведении).

**6. История внутри контейнера:** полный commits[] + display-fold (≥3 однотипных подряд → свёрнутый узел в renderer'е, данные не теряются) + milestones (биолог сам ставит именованные указатели). **Hard squash не делаем** — ломает undo/replay, противоречит «каждая операция фиксируется».

**7. Lazy git.** Контейнер при создании имеет только baseSnapshot (= входная молекула). Поле commits[] не инициализируется до первой операции. До первого коммита контейнер = baseline без артефактов истории.

**8. Два класса контейнеров:**
- **MoleculeContainer** — молекула, ends, lazy commits[], портабелен в library.
- **AssemblyContainer** — узел assembly/split/clone с параметрами реакции, без commits[], не попадает в library.

**9. Library = пул контейнеров.** История — атрибут контейнера, путешествует с ним. Library entry — это контейнер, отмеченный как published. Импорт в проект = clone-on-import (deep copy контейнера + frozen lineage до момента clone). Source library entry остаётся неизменной (как stock во фризе).

**10. «Показать историю»** — рекурсивный обход commits[] + parent контейнеров через границы проектов. По запросу пользователя, не в фоне. Может пересекать границы проектов через library lineage.

---

**Добавлено в Части IV (закрытие слабости 1):**

**11. Любая внешняя sequence входит через importer.** Materialize в MoleculeContainer. «External source as commit field» не существует.

**12. Origin для MoleculeContainer** — фиксированный набор: `catalog | paste | file | library_clone | primer_synthesis | assembly_product | split_product`. Origin immutable, задаётся при создании.

**13. Primers as project entity** — first-class сущность, параллельная контейнерам и library. Operations ссылаются на primers по id + хранят frozen snapshot для replay устойчивости.

**14. Primer-pool гибридный** — primer хранится в origin project. При reuse в другом проекте создаётся локальная копия с back-reference (`originPrimerId`). Копия после создания живёт независимо.

**15. Primer-synthesized container** — особый origin для контейнера. Baseline computed из primers + annealing/extension rules. Source primers immutable для baseline; изменение primers = новый контейнер.

**16. Primer reuse через auto-lookup в primer-pool.** Auto-design tool проверяет local pool перед предложением новых primers. При clone-on-import контейнера — дополнительный lookup в source-project pool (если доступен), при reuse создаётся локальная копия с back-reference.

### III.2 Конкретный пример Игоря (отработка в модели)

```
Project A
├── Container 1: pUC118 из library  [origin: library_clone, no commits, baseline only]
│   └── op: site-directed mutagenesis (внутри-контейнерная операция)
│       ↓ commit в Container 1, baseline → updated state
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

Биолог запрашивает «историю pUC118 v1.2»:
- Container 3 commits[] → cut + insert.
- insert.source.snapshot → frozen sequence из Container 4 на момент operation.
- Container 3 baseSnapshot = clone из library entry «pUC118 v1.1».
- frozen lineage в Container 3 → mutagenesis от оригинального pUC118.
- Получаем дерево от первоисточников до v1.2.

---

## Часть IV — Закрытие слабости 1

Слабость 1 (External source / paste из текста vs контейнер) была первой найденной слабостью модели после фиксации 10 ⚓ кандидатов. Её закрытие открыло primers как новый слой.

### IV.1 Принцип входа sequence в проект

Любая внешняя последовательность входит в проект **через importer**. Importer уже спроектирован максимально гибким и закрывает все случаи внешнего входа:

- Paste из текста (Ctrl+V) — любой источник: NCBI, переписка коллабораторов, patent figure, gBlock-заказ.
- File import — `.dna` / `.gb` / `.fasta`.
- Catalog SnapGene (встроенный).
- Clone-on-import из library (с frozen lineage).

На выходе importer'а **всегда MoleculeContainer**. Биолог жмёт `На канвас` или `В библиотеку` — контейнер появляется в проекте.

**Следствие.** Гипотетический «external source as commit field» (sequence как поле в коммите без отдельного контейнера) не нужен. Вся внешняя ДНК материализуется в контейнерах.

### IV.2 Граница «контейнер vs не-контейнер»

Не по длине sequence. По **биологическому намерению**:

- **Site из 6 nt** — биолог не пастит как контейнер, впишет в primer overhang при PCR/insert.
- **Tag (His6, FLAG, c-Myc, V5)** — primer overhang или operation parameter.
- **Linker 30 nt** — может быть primer overhang при PCR-сшивке, может быть primer-synthesized container. Биолог решает.
- **gBlock 500 bp** — отдельный контейнер заслуженно (физически синтезированный кусок ДНК).
- **Любой длинный paste из NCBI / patent / коллаборатор** — отдельный контейнер.

Формального threshold'а нет. Биолог сам выбирает, что становится контейнером.

### IV.3 Origin metadata для MoleculeContainer

Контейнер несёт обязательное поле `origin`, immutable, задаётся при создании.

```
origin: 'catalog'           // из встроенного catalog SnapGene
      | 'paste'             // sequence вставлен через importer
      | 'file'              // импортирован из .dna / .gb / .fasta
      | 'library_clone'     // clone-on-import из library (несёт frozen lineage)
      | 'primer_synthesis'  // собран из primers (annealing/extension), см. IV.5
      | 'assembly_product'  // output AssemblyContainer (Gibson/GG/RE/blunt N→1)
      | 'split_product'     // output split-операции (1→2)
```

Используется в UI: иконка/badge на узле канваса, заголовок секции истории, фильтры в library / inspector / project tree.

**Принцип «контейнер дешёвый» (формулировка Игоря).** Создание новой сущности на канвасе — нормальная цена за чистоту модели и гибкость. Архитектура не должна экономить на контейнерах.

### IV.4 Primers as project entity

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
    projectId:           uuid,           // origin project
    operationCommitId:   uuid,           // commit, в котором первое acceptance
    containerId:         uuid,           // контейнер, для которого первый раз дизайнен
    timestamp:           ISO,
  },

  status:       'designed' | 'ordered' | 'received' | 'tested' | 'discontinued',
                                         // опционально, default 'designed', mutable
}
```

**Mutable поля:** `name`, `purpose`, `status`.
**Immutable поля:** `id`, `sequence`, `designMeta`, `origin`.

Изменение sequence или designMeta = новый primer с новым id. Старый остаётся в pool.

Праймер **не несёт** в себе списка use sites — это derived view (запрос «где этот primer использовался» обходит operations всех контейнеров проекта).

#### Жизненный цикл (формулировка Игоря)

1. Биолог создаёт контейнер с операцией PCR (выделяет линейный участок и говорит «это PCR-продукт от Container X с такими-то ends»).
2. Auto-design tool **подбирает праймеры автоматически**. Биолог видит предложенных кандидатов в UI операции.
3. Биолог **явно соглашается** (кнопка `Применить` / `Принять праймеры`). До этого момента — кандидаты, нигде не записаны.
4. На моменте acceptance праймеры попадают в **primer-pool проекта** с присвоенным id. В commit'е операции PCR хранится ссылка на primer.id.

#### Reuse через primer-pool

Когда тот же контейнер используется в другом проекте (clone-on-import) и биолог делает аналогичную операцию:

1. Auto-design tool **сначала проверяет primer-pool** на наличие подходящих primers.
2. **Критерии match'а:**
   - Sequence binding region совпадает.
   - `designMeta.designedFor` соответствует типу операции.
   - `designMeta` parameters (Tm, length, organism) — в допустимых рамках.
3. Если matches найдены — UI предлагает их как первый вариант: «Найдены known primers: P1, P2 — использованы в Project A для аналогичной PCR. Использовать?»
4. Биолог соглашается → переиспользуется (тот же id, та же sequence, та же история).
5. Биолог отказывается → auto-design генерирует новых, при acceptance они попадают в pool как новые id.

**Биологический смысл.** Биолог в реальной лаборатории хочет: «у меня в фризе уже лежат primers P1/P2 для амплификации pUC118, я не хочу заказывать ещё раз». Tool это знает и предлагает.

#### Хранение primer-pool: гибридная модель (выбор Игоря)

- **Primer хранится в origin project.** Каждый primer имеет `origin.projectId`, `origin.operationCommitId`, `origin.containerId`.
- **Primer-pool в каждом проекте — local pool.** Содержит primers, созданные в этом проекте (origin = self), плюс копии из других проектов (origin ≠ self), сделанные при reuse.
- **При reuse в другом проекте** создаётся локальная копия в target-проекте:
  - Наследует все immutable поля (id новый, sequence/designMeta/origin того primer'а откуда копировали).
  - Имеет back-reference: `originPrimerId: <id origin primer>`.
  - Mutable поля (name, purpose, status) копируются на момент создания, дальше живут независимо в target.

#### Логика lookup'а при reuse

1. **Локальный pool target-проекта** — основной источник.
2. **Если контейнер только что clone-on-import'нут** — дополнительно lookup в primer-pool source-проекта (если доступен). Найденные matches предлагаются с пометкой «из Project A» → биолог соглашается → создаётся локальная копия.
3. **Если source-проект недоступен** (удалён, не открыт) — lookup только в target. Биолог дизайнит заново при необходимости.

#### Преимущества гибрида

- **Reuse реален.** Не нужно дизайнить с нуля одни и те же primers.
- **Самодостаточность проекта.** После copy primer живёт в target независимо от source. Удаление source не ломает target.
- **Прозрачность происхождения.** `originPrimerId` сохраняет цепочку, можно показать «этот primer пришёл из Project A».
- **Никакой принудительной синхронизации.** Биолог в target может изменить name/purpose/status локально, без влияния на origin.

#### Детали для следующей итерации

- Что делать, если в source-проекте primer удалён после copy в target — copy в target остаётся валидной, `origin` ссылка становится dangling reference. UI может пометить «origin недоступен», sequence остаётся.
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
- Live primer через id — для UI текущей сессии.
- Frozen snapshots — для replay устойчивости. Если primer удалён из pool, operation остаётся валидной для replay sequence (sequence уже зафиксирована в результате operation), и UI fallback'ается на snapshot.

Это снимает риск «удалённый primer ломает историю». Pure reference + frozen fallback.

### IV.5 Primer-synthesized container

#### Use case

Биологу нужна короткая связующая последовательность из primers для соединения двух контейнеров. Сценарии:

1. **Annealed oligos** — два комплементарных primer'а отжигаются → duplex с тупыми или sticky концами. Длина — десятки nt. Применение: короткий linker, MCS-замена, custom restriction site cassette.
2. **Primer extension** — два частично перекрывающихся primer'а полимеразой удлиняются друг по другу → длинный duplex. Длина — до ~150 nt. Применение: средний linker, custom synthetic regulatory element.

В обоих случаях на столе биолога — физически существующая ДНК-молекула, полученная не из template, а из primers напрямую. У неё есть sequence, есть концы, она готова для assembly.

#### Как укладывается в модель

`MoleculeContainer` с `origin: 'primer_synthesis'`. Особенности:

**Baseline computed.** Не paste и не file. Вычисляется из набора primers + правила annealing/extension.

**Lazy git триггерится сразу при создании.** Контейнер появляется уже с одним коммитом — потому что baseline это уже результат «операции» annealing/extension. Первый commit фиксирует параметры синтеза:

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
    computedSequence:   string,        // = baseSnapshot.sequence
    computedEnds: {
      left:  { type: 'blunt' | 'overhang_5' | 'overhang_3', sequence?: string },
      right: { type: 'blunt' | 'overhang_5' | 'overhang_3', sequence?: string },
    }
  }
}
```

**Source primers immutable для baseline.** Если биолог потом меняет primer в primer-pool — baseline контейнера **не пересчитывается**. Если нужна новая sequence → новый primer-synthesized container с обновлёнными primers. Старый остаётся.

**Ends computed из дизайна primers.** Overhangs primer'ов определяют ends контейнера для дальнейшего assembly:
- Annealing с обоими 5' overhangs → sticky-ended duplex.
- Annealing полностью комплементарных primers → blunt-ended duplex.
- Extension с overlap region → blunt-ended duplex длиной ≈ (length(p1) + length(p2) - length(overlap)).

**Контейнер далее по общим правилам.** Есть ends, может быть source для insert, может участвовать в assembly, может быть published в library.

#### UX вход

В importer'е (или прямо на канвасе через действие `Создать контейнер из primers`) открывается primer-synthesis tool:
- Биолог вводит/выбирает 2+ primers из pool.
- Выбирает метод — annealing / extension.
- Tool вычисляет результирующую sequence + ends, показывает preview.
- Биолог жмёт `Создать контейнер` → MoleculeContainer на канвасе.

Это четвёртая опция в importer'е рядом с paste/file/catalog.

#### Граница vs «primer overhang in operation»

- **Primer overhang в существующей операции** — когда linker/site/tag присоединяется к **template-derived продукту** (PCR с template + overhang). Linker не существует как отдельная молекула, растёт как часть PCR-продукта.
- **Primer-synthesis container** — когда linker/connector сам по себе является **отдельной физической молекулой** (annealed oligos для лигирования или extension product без template).

Граница по биологическому намерению, не формальная.

---

## Часть V — Слабости 2–9 для последующих итераций

Каждая слабость пронумерована для удобной адресации в следующих сессиях. Слабость 1 закрыта в Части IV.

### Слабость 2 — Visual weight внутри-контейнерной истории на канвасе

**Что не так.** Канвас рисует граф контейнеров. Внутри-контейнерные операции (mutate / cut-keep / PCR-amplify / fragment-insert / tag-add / topology-change) идут в commits[] контейнера, на канвасе невидимы. Контейнер с 30 коммитами визуально неотличим от контейнера, в котором ничего не делалось.

**Почему важно.** Site-directed mutagenesis в Container 2 даёт pUC118 v1.1 — это main result типичного workflow. Если на канвасе он выглядит как «свежий контейнер из library», теряется протокольная семантика.

**Варианты решений:**
- **(a) Stamps на узле контейнера.** Иконки на блоке по типам коммитов внутри (★ для milestone, точка для каждого mutate, шеврон для cut-keep, primer-icon для PCR).
- **(b) Mini-timeline в узле.** Тонкая полоса под именем контейнера с timeline коммитов (как git log mini). Кликабельно → открывает full history.
- **(c) Title decoration.** Имя контейнера несёт версию: «pUC118 v1.1 (3 commits)». Простое, но требует осмысленного именования. Альтернатива — авто-нумерация версий, но это уже Plasmid-Git terminology.

**Текущее состояние в коде.** В Plasmid-Git модели есть HEAD-указатель и счётчик коммитов на блоке. Частично решает (c). Стоит явно затащить как UX-требование.

**Состояние:** open, ждёт обсуждения.

### Слабость 3 — Триггер lazy git формализован расплывчато

**Что не так.** «Commits[] инициализируется при первой mutate/edit/cut/insert операции» — формально не определено, что считать «первой».

**Edge cases без ответа:**
- Изменил topology linear→circular — commit?
- Добавил annotation — commit? (пересекается с Sprint Annotation-Commits)
- Изменил имя контейнера — точно metadata. Но границу нужно явно записать.
- Изменил target organism для codon usage — ?
- PCR-amplify с тождественным копированием sequence (full plasmid с праймерами на стыке) — sequence не меняется, но контейнер семантически «теперь linear с такими-то ends» — commit или metadata?

**Кандидат на формальное правило:**

> **Commit** = операция, меняющая sequence, ends, или topology (триада).
> **Annotation edits** — отдельный подкласс commits.
> **Metadata** (имя, описание, organism для codon usage, теги) — не commits, mutable layer вне commits[].

**Состояние:** open, требует подтверждения.

### Слабость 4 — Frozen snapshot data volume в insert.source

**Что не так.** Если биолог в большой проект импортирует 20 контейнеров и делает 50 cut+insert операций, каждая insert несёт frozen snapshot региона source. Insert 500 bp + metadata — не катастрофа. Insert полной плазмиды 7 kb (вставляем как кассету) — полные копии в каждом коммите.

**Mitigation (предложение):**
- Snapshot хранит **только sub-region** (start, end + sequence + annotations региона), не весь source-контейнер. Подразумевалось, нужно явно зафиксировать.
- Дедупликация identical snapshots — отложена. Если станет bottleneck — content-addressable storage в persistence layer.

**Открытый edge case.** Если позже выясняется, что snapshot содержал ошибку (annotations были битые на момент operation) — sequence в snapshot тоже immutable. Биолог должен сделать новую операцию replace для исправления, не править старую. Это правильно (commit history is truth), но UX должен пояснять.

**Состояние:** open. Нужно решить (a) формальную фиксацию sub-region snapshot, (b) UX поведения при «найденной ошибке в historic snapshot».

### Слабость 5 — Clone (1→1 branch) vs personal scratch в library

**Что не так.** Я в обсуждении предложил два варианта для use case «хочу одновременно plasmid и PCR-продукт от неё в одном проекте»:

- **(α) Clone как третий тип DAG-узла** (1→1, branch внутри проекта). Третий тип ребра канваса.
- **(β) Двухуровневая library** (personal scratch + shared) и клон через snapshot-to-scratch + clone-on-import. Тогда clone как DAG-тип не нужен.

**Дополнение от Части IV.** Аналогичный вопрос теперь и для **primers**: project-local pool с opt-in export в общий файл — это уже выбрано (гибрид). «Общий файл» по сути и есть второй уровень. Тогда вопрос для **library контейнеров**: нужен ли симметрично второй уровень для контейнеров, или хватит «library + project-local» без personal scratch?

**Аргументы за (α) clone в DAG:**
- Простая модель, меньше слоёв.
- Биолог не должен думать про library как про staging area.

**Аргументы за (β) двухуровневая library:**
- Симметрия с primers (если согласимся, что primer-pool и library структурно похожи).
- Personal scratch уже даёт mechanism «сохранить snapshot перед операцией не публикуя в shared».
- Clone-как-DAG-тип это специальный случай, который в (β) сводится к общему механизму.

**Состояние:** open, ключевая развилка для DAG модели.

### Слабость 6 — История дублируется при clone-on-import

**Что не так.** Контейнер несёт всю свою историю (commits[] + frozen lineage). При clone-on-import — копируется. Если pUC19 импортирован в 50 проектов с 5 коммитами истории каждый → 50 копий, 5–10 MB суммарно.

**Worse case.** pUC19 импортирован в один проект, оттуда другой проект импортирует pUC19-derived plasmid (содержит цепочку до pUC19) → копируем историю дважды.

**Mitigation.** Content-addressable storage — каждый коммит идентифицируется по hash, дубликаты дедуплицируются. Уровень — persistence layer. Git-паттерн.

**Решение.** Overengineering на старте. Сейчас просто фиксируем clone-on-import = deep copy всей истории. Если станет bottleneck — добавим dedup в persistence. Не блокирует первую версию.

**Состояние:** acknowledged, отложено в backlog.

### Слабость 7 — AssemblyContainer immutable после создания

**Что не так.** Зафиксировано: AssemblyContainer не имеет commits[], не попадает в library, содержит параметры реакции. Не зафиксировано, изменяемы ли параметры после создания.

**Биологическая истина.** Gibson реакция произошла, у тебя tube с продуктом. Поменять параметры задним числом нельзя.

**Кандидат на правило:**

> AssemblyContainer immutable после создания. Изменение параметров = удаление AssemblyContainer + создание нового. На канвасе это новый узел, output которого — новый контейнер.

**UX-следствие.** В UI нет кнопки `Edit assembly parameters`. Есть `Re-do assembly with different parameters` — создаёт новую реакцию. Старая остаётся (или удаляется явно через `Delete this assembly`).

**Состояние:** open, нужно подтвердить или возразить. Скорее всего без споров.

### Слабость 8 — Migration path с текущей модели недооценён

**Что не так.** Текущее приложение (v0.5.4-alpha):
- `parts-slice` (catalog + user imports = «Моя библиотека»)
- `fragment-slice` (fragments на канвасе с Plasmid-Git baseline + commits[])
- «Стыки блоков» (assembly junction) между fragments на DesignCanvas
- ImportStartScreen как entry point

Новая модель добавляет:
- Project как сущность поверх всего
- MoleculeContainer / AssemblyContainer как два класса узлов
- Library двухуровневая (если выберем (β) в слабости 5)
- Primer-pool с гибридным хранением
- DAG canvas с типизированными рёбрами

**Migration вопросы:**
- Текущий открытый канвас (без проектов) → автоматически становится «default project» при первом сохранении? Или пользователь обязан «начать новый проект»?
- Текущие fragments → MoleculeContainers без commits[] (если Plasmid-Git ещё не инициализирован) или с commits[] (если уже есть).
- Текущие «стыки блоков» → AssemblyContainers с параметрами из текущей DesignCanvas state.
- Текущий `parts-slice` → как мапится на новую двухуровневую library.
- Catalog SnapGene items → остаются как есть, но импорт через clone-on-import создаёт MoleculeContainer.
- Текущие designed primers (если уже хранятся где-то в state) → попадают в primer-pool default project'а.

**Решение.** Выделить **отдельный sprint «Migration v0.5 → v0.6 (project model)»** в плане после архитектурной спеки.

**Состояние:** acknowledged, не требует обсуждения сейчас.

### Слабость 9 — Обсуждение шло без сверки с реальным кодом

**Что не так.** Всё обсуждение на уровне мысленных моделей. Я не открывал ни `parts-slice.js`, ни `fragment-slice.js`, ни `plasmid-git.js`, ни `DesignCanvas.jsx`. Не знаю:
- Сколько реальных полей у текущего fragment'а.
- Как устроены «стыки» — embedded в fragment или отдельный slice.
- Что уже есть в Plasmid-Git baseline + commits[] — может, частично совпадает с MoleculeContainer.

**Риск.** Спека получится оторванной от реальности. Sprint 1.7 уже один раз нас этому научил (антипаттерн 1 в playbook'е).

**Митигация — обязательное действие на старте следующей сессии:**
- `gui/designer/src/store/parts-slice.js`
- `gui/designer/src/store/fragment-slice.js`
- `gui/designer/src/lib/plasmid-git.js`
- `gui/designer/src/lib/plasmid-git-reducers.js`
- Просмотреть `gui/designer/src/components/DesignCanvas.jsx` (как «стыки» рендерятся).

Объём ~30–50 KB, в бюджет следующей сессии после стартового пакета помещается.

**Состояние:** acknowledged, **обязательное действие** на старте следующей сессии.

---

## Часть VI — Открытые архитектурные вопросы вне слабостей

Темы, не вошедшие в обсуждение текущей сессии. Не критика модели, а просто незатронутое.

### VI.1 Persistence формат

- Один файл `.bdg` (JSON) или папка с `project.json` + `assets/`?
- Schema versioning — `project.schemaVersion: 1` + migration policy при открытии старых файлов?
- Save-API в браузере — Chrome File System Access API (Chrome 86+, не Firefox/Safari) или fallback `download .json` + `<input type="file">` upload?
- Auto-save во внутреннее хранилище (IndexedDB) между сессиями или только ручной save?

### VI.2 Стартовая страница UX

- Список «Recent projects» — где хранится (IndexedDB / localStorage)? Сколько последних показывать?
- При первом запуске пользователя (нет recent) — что показываем? Кнопка `Создать проект` + `Открыть с диска`?
- Поле имени проекта — обязательное при создании или можно потом? Уникальность проверяем?
- Empty state нового проекта — пустой канвас или сразу открывается importer?

### VI.3 Граница project ↔ library в практическом UX

- Library в текущей модели = `parts-slice` (catalog + user imports). После migration — двухуровневая (если (β) в слабости 5) или одноуровневая.
- Если пользователь импортирует `.dna` в проекте A → fragment попадает в общую library (видна в B) или только в проект A? Если общая — это меняет ментальную модель «моих файлов».
- Paste-text — попадает в library или только в активный проект? (Связано с F2/F3 из BUGS.md.)

### VI.4 UI внутри контейнера

- Modal vs full-screen vs side panel.
- Как replace-fragment picker выглядит (список контейнеров проекта + кнопка `из library` open library overlay).
- Как primer-synthesis tool выглядит (отдельный modal в importer'е).
- Как milestone UX (кнопка `Застолбить версию` в истории).

### VI.5 Display-fold правила для commits[]

- Что считать «однотипным подряд» — ≥3 mutate без других операций между?
- Настраивается ли биологом или хардкод?
- Включается ли по умолчанию или по запросу?

### VI.6 Inventory операций для первой версии

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

### VI.7 Дополнительные ad-hoc предложения из обсуждения

- **Поле `purpose` / `note` у контейнера** — свободный текст mutable («backbone для конструкта X», «промежуточный clone для проверки сайта Y»). Не часть commits[]. Дополняет имя (имя — короткий идентификатор, purpose — описание роли в проекте). То же для AssemblyContainer.
- **Аналогичный note для AssemblyContainer** («Gibson попытка 1, не сработала», «попытка 2 — успех»). Контекст, который теряется в чисто параметрической записи.

### VI.8 Quick-fixes V31 / V33 (не блокируют Project Model)

- **V33** — block кнопки `🧪 Создать сборку (N)` в FragmentEditor footer при наличии pending-мутаций. ~30 мин.
- **V31** — PlasmidMap rescales on window resize (регрессия Map-WS-1 Skeleton K4). ~30 мин.

Могут быть закрыты параллельно отдельной мини-сессией Code, не задерживая kickoff.

---

## Часть VII — План перехода и риски

### VII.1 План перехода (для следующих сессий)

**Сессия N+1 (после compact):**
1. Стартовый пакет по §1 playbook (CHAT_PLAYBOOK → CLAUDE.md → BUGS.md → CURRENT_TASK.md → первая строка PROJECT_STATE).
2. Подгрузка этого документа (`docs/ARCHITECTURE_PROJECT_MODEL_KICKOFF.md`).
3. **Обязательное чтение реального кода** (закрытие слабости 9): `parts-slice.js`, `fragment-slice.js`, `plasmid-git.js`, `plasmid-git-reducers.js`, обзор `DesignCanvas.jsx`.
4. Продолжение обсуждения слабостей по порядку: 2 → 3 → 7 (короткие развилки) → 5 (фундаментальная развилка).
5. Возможное закрытие quick-fixes V31/V33 параллельно (если хочется user-visible улучшения).

**Сессия N+2:**
- Закрытие оставшихся слабостей.
- Закрытие открытых вопросов из Части VI.

**Сессия N+3:**
- **Архитектурная спека** уровня DECISIONS (`docs/ARCHITECTURE_PROJECT_MODEL.md`). Включает: data model (Project, MoleculeContainer, AssemblyContainer, Library, Primer, Commit), DAG operations, lazy git lifecycle, migration policy высокоуровнево.
- Из неё вырастут 4–6 sprint-спек в дальнейшем (data model + store rewiring → start screen → library overlay → DAG canvas → persistence → migration).

### VII.2 Риски

**A. Скоуп взрыв.** Вся модель = переписка фундамента приложения. Реализация — 5–8 спринтов. Риск застрять без user-visible результата на 2–3 спринта.

**Mitigation.** Между спринтами Project Model сознательно вкраплять quick-fix-сессии (V31/V33/V40-если-нужно отдельно), чтобы не терять моментум.

**B. UX-вопросы съедят больше, чем data-model.** Текущая kickoff закрыла data-model на ~80%, UX — на ~20%.

**Mitigation.** После архитектурной спеки сразу следующая сессия — UX kickoff, не sprint-спека. Закрываем UX-развилки до того, как Code начнёт.

**C. Передумаем что-то фундаментальное на полпути.** Особенно «два класса контейнеров» и «lazy git».

**Mitigation.** Первая sprint-спека после архитектурной — самая маленькая возможная (только тип Project + контейнер shell, без операций). Получаем рабочий «новый проект → создан → пустой канвас → сохранить → загрузить» flow. Это валидирует фундамент. Если хочется передумать — дёшево.

### VII.3 Что было сделано в этой сессии (28.04.2026, kickoff)

- Принята архитектурная модель Project + Container + DAG (16 ⚓ кандидатов).
- Закрыта слабость 1 (external source через importer; primers as project entity; primer-synthesized container; гибридный primer-pool).
- Зафиксированы слабости 2–9 для последующих итераций.
- Зафиксированы открытые архитектурные вопросы вне слабостей (Часть VI).
- План перехода и риски (Часть VII).

### VII.4 Что НЕ сделано (важно для следующей сессии)

- **Не читал реальный код** — обязательное действие на старте N+1 (слабость 9).
- **Не финализированы слабости 2–9** — каждая требует отдельной итерации.
- **Не закрыты открытые вопросы Части VI** (persistence, start screen UX, граница project↔library, UI внутри контейнера, display-fold rules, inventory операций v1).
- **Не написана архитектурная спека** — пишется после закрытия слабостей и открытых вопросов.
- **CURRENT_TASK.md не обновлён** — Игорь не давал команды переходить к compact / стандартному формату задачи. Это live-обсуждение.
- **DECISIONS.md не дополнен** — 16 ⚓ кандидатов остаются кандидатами в этом документе, формализация будет вместе с архитектурной спекой.

---

## Когда compact

Compact пока не делали. Контекст плотный, но обсуждение продуктивное. Compact будет:
- После закрытия слабостей 2–7 (или раньше если контекст переполнится).
- Перед написанием архитектурной спеки в любом случае (нужно свежее чтение реального кода).

При compact в новой сессии: первый шаг — открыть этот документ, и стартовать с раздела «План перехода и риски» / «Что НЕ сделано». Документ самодостаточен для восстановления контекста.

---

**Конец документа. Версия 1, 28.04.2026.**
