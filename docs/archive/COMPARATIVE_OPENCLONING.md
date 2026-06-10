# OpenCloning — сравнительный разбор для BodgeGene

> Аналитическая записка (reference, не спека). Создана 24.05.2026 после изучения
> OpenCloning по запросу Игоря. Источник: app.opencloning.org, docs.opencloning.org,
> github.com/OpenCloning, схема OpenCloning_LinkML.
>
> Назначение: вход для стратегических решений по `.bodge`-формату и data model.
> Связан с `SPEC_BODGE_FORMAT_V2_CORE.md`, `LIBRARY_MODEL_DRAFT.md`,
> `PRODUCT_BACKLOG_INTEGRATED_WORKBENCH.md` (Q-STRAT).

---

## 1. Что такое OpenCloning

Open-source веб-приложение для планирования и документирования молекулярного
клонирования. Автор — Manuel Lera-Ramirez, поддержка ELIXIR Europe, MIT-лицензия.
Хостится на app.opencloning.org, ставится локально через Docker.

Тот же класс задач, что BodgeGene. Ближайший идейный сосед — не SnapGene, не
Benchling, а именно OpenCloning: open-source, история сборки как первоклассный
объект, открытый формат, «family tree builder».

Зрелость: backend v1.3.0 (май 2026), схема LinkML v0.4.9 (52 релиза), ~53 звезды
на GitHub. Маленький проект, но живой и методично развивающийся.

---

## 2. Стек — почти совпадает с BodgeGene

| Слой | OpenCloning | BodgeGene |
|------|-------------|-----------|
| Frontend | React | React/Vite + Zustand + Dexie |
| Backend | FastAPI | FastAPI/BioPython |
| Био-движок | pydna (надстройка над BioPython: overhangs, circularity, симуляция Gibson/GoldenGate/...) | BioPython + собственные модули (mutagenesis, golden-gate, restriction-db, tm) |
| Редактор последовательностей | OVE — Open Vector Editor (TeselaGen, open-source) | собственный `SequenceView` |
| Data model | LinkML (схема в YAML → кодген Python/TS/JSON Schema) | собственная (`Project`+`MoleculeContainer`+`LibraryEntry`) |
| Формат файла | `.json` (cloning history) / `.zip` (+ sequencing data) | `.bodge` |

Совпадение React+FastAPI означает: их фронтенд можно читать как референс
реализации, не только как UX-эталон. Репозитории открыты — `OpenCloning_frontend`,
`OpenCloning_backend`, `OpenCloning_LinkML`.

---

## 3. Модель данных — главное, что стоит изучить

### 3.1 Идея: sequences + sources

Два типа сущностей:

- `Sequence` — молекула ДНК (последовательность + features).
- `Source` — экспериментальный шаг, берёт 0+ sequences на вход, даёт 1 на
  выход. Два рода:
  - source без родителя — внешнее происхождение (плазмида от коллеги, AddGene,
    координаты в геноме);
  - source как шаг клонирования — ссылки на input/output sequences + имя метода
    + минимум информации для in-silico повтора шага.

Это прямой аналог твоего commits-DAG. У них «family tree» = твой DAG. У них
`Source` = твоя операция (PCR/Cut/Gibson). Концептуально вы строите одно и то же.

### 3.2 Корневой класс — `CloningStrategy` (= твой `.bodge`)

```
CloningStrategy:
  sequences:       1..*  Sequence        (обязательно)
  sources:         1..*  Source          (обязательно)
  primers:         0..*  Primer
  description:     0..1  string
  files:           0..*  AssociatedFile  (sequencing data и т.п.)
  schema_version:  0..1  version_number
  backend_version: 0..1  version_number
  frontend_version:0..1  version_number
```

Что отсюда стоит взять для `.bodge` v2 (см. `SPEC_BODGE_FORMAT_V2_CORE.md`):

1. `schema_version` / `backend_version` / `frontend_version` прямо в файле.
   Файл несёт версию схемы, которой соответствует. Это решает класс проблем,
   который сейчас болит (wipe v0.5→v0.6, рассинхрон Dexie 50 vs 5 из диагностики
   V115). Если в `.bodge` записана версия — открывающий код знает, нужна ли
   миграция.
2. `sequences` и `sources` — два плоских списка верхнего уровня, связи по id.
   Не дерево вложенных объектов. Плоско → проще диффать, мигрировать, читать.
3. `description` на уровне всей стратегии — место для свободного текста.

### 3.3 Список `Source` — что они считают «операцией»

Schema перечисляет конкретные типы source (= какие операции система знает):

Внешнее происхождение: `AddgeneIdSource`, `BenchlingUrlSource`, `NCBISequenceSource`,
`GenomeCoordinatesSource`, `SnapGenePlasmidSource`, `EuroscarfSource`, `IGEMSource`,
`SEVASource`, `WekWikGeneIdSource`, `OpenDNACollectionsSource`, `RepositoryIdSource`,
`DatabaseSource`, `UploadedFileSource`, `ManuallyTypedSource`.

Шаги клонирования: `PCRSource`, `RestrictionEnzymeDigestionSource`, `LigationSource`,
`GibsonAssemblySource`, `RestrictionAndLigationSource`, `GatewaySource`,
`HomologousRecombinationSource`, `CRISPRSource`, `CreLoxRecombinationSource`,
`RecombinaseSource`, `InFusionSource`, `InVivoAssemblySource`,
`OverlapExtensionPCRLigationSource`, `OligoHybridizationSource`,
`PolymeraseExtensionSource`, `ReverseComplementSource`, `SequenceCutSource`,
`AnnotationSource`, `AssemblySource`.

Вывод: каждый метод клонирования — отдельный типизированный класс source со своими
полями. Не один абстрактный «Operation» с `params: {}`, а явная типизация на каждый
метод. Это контраст твоему подходу (op-params как общий мешок) — стоит сознательно
решить, какой путь.

### 3.4 Как кодируется шаг — пример `PCRSource`

```json
{
  "id": 4,
  "type": "PCRSource",
  "input": [
    { "type": "AssemblyFragment", "sequence": 9,  "left_location": null,
      "right_location": "32..51",   "reverse_complemented": false },
    { "type": "AssemblyFragment", "sequence": 1,  "left_location": "1001..1020",
      "right_location": "4053..4072", "reverse_complemented": false }
  ],
  "circular": false
}
```

`left_location` / `right_location` — координаты в GenBank-синтаксисе (`"32..51"`).
У них есть отдельные LinkML-типы `SequenceRange` и `SimpleSequenceLocation` —
координаты не голые числа, а типизированная строка GenBank-формата. Для твоего
`fragment.topology` и работы с координатами это аккуратный паттерн: переиспользовать
нотацию GenBank, а не изобретать своё представление диапазонов.

### 3.5 Версионирование схемы + автомиграции — забрать обязательно

У `OpenCloning_LinkML` есть встроенный механизм миграций:

- `python -m opencloning_linkml.migrations.migrate file.json --target-version X.Y.Z`
- на каждую пару версий (`vX_Y_Z_to_vA_B_C.py`) — отдельная transformation-функция;
- архив старой Pydantic-модели на каждую версию (`model_archive/vA_B_C.py`);
- тест на каждую миграцию.

Это ровно то, чего сейчас не хватает. Текущая стратегия — «wipe при смене версии»
(DEC-V2-08). Для личного инструмента на раннем этапе wipe приемлем, но когда
`.bodge` начнут накапливаться с реальными сборками — потеря данных при каждом
bump'е data model станет неприемлемой. Их подход (версия в файле + пошаговые
миграции) — готовый рецепт. Не обязательно внедрять сейчас, но заложить
`schema_version` в `.bodge` v2 надо ДО того, как формат зафиксируется — потом
задним числом не добавишь чисто.

---

## 4. UX-модель

### 4.1 «Family tree builder»

Вкладки верхнего уровня: `Cloning` (загрузка/импорт/планирование), `Primers`
(таблица праймеров с Tm/GC), `Description` (текст стратегии), `Sequence`
(вьюер на OVE), `Data model` (показ JSON), `Settings`.

Ключевой жест: в `Cloning` под каждой sequence — иконка «+», открывает форму
выбора операции. Если операция многовходовая — остальные входы выбираются из
списка загруженных sequences. Это их способ строить граф: не drag-edges, а
«плюс под нодой → форма». Контраст твоему canvas-DAG с рёбрами.

Полезные мелочи:
- «глаз» на sequence → открыть в вьювере; «зачёркнутый глаз» → скрыть предков
  ноды (борьба с переполнением графа). Проблема та же (V51 лаги, переполненный
  canvas) — «скрыть предков» дешёвый приём.
- Вьювер read-only — у них нельзя редактировать sequence в вьювере вообще. У
  тебя `SequenceView` редактируемый. Это их сознательное упрощение, не образец.
- Trash: удаление sequence + её source, с подтверждением если sequence — вход
  для чего-то. (Сравни с V115 — у них soft-delete устроен проще.)

### 4.2 Scripting-first

У них cloning-стратегия выражается тремя способами: GUI, JSON, и Python-скрипт
(`AddgeneIdSource(id=1, repository_id="52691", ...)` → `get_from_repository_id_addgene(...)`).
Backend-библиотека ставится из PyPI (`opencloning-linkml`, `opencloning` backend).
Автоматизация повторяющихся сборок — скриптом или веб-формой.

BodgeGene сейчас чисто визуальный. Это не недостаток — но стоит сознательно
зафиксировать: визуальный путь сознательно, или scripting-доступ к `.bodge` тоже
в backlog. Кандидат в Q-STRAT.

### 4.3 Templates

«Reusable cloning templates for cloning kits» — `CollectionSource` /
`CollectionOption` в схеме. Шаблон сборки с категориями деталей и вариантами в
каждой категории. Это близко к идее «protocols as first-class objects» из
`PRODUCT_BACKLOG`.

---

## 5. Что они умеют, чего нет у SnapGene/Benchling

Заявлено прямо: планирование инженерии штаммов и клеточных линий через CRISPR и
гомологичную рекомбинацию — с use-case'ами, не поддержанными SnapGene/Benchling.
Полный список методов (16): Cre/LoxP, CRISPR-HDR, Gateway, Gibson, Golden Gate,
Homologous Recombination, In Vivo Assembly, In-Fusion, Overlap Extension PCR,
Oligo hybridization, PCR, Phage Recombinases, Polymerase extension, Restriction/
Ligation, Reverse Complement, Templateless PCR.

Интеграция с elabFTW (электронный лабораторный журнал) — у них есть отдельная
сборка `build_for_elabftw.sh`. Связано с backlog-пунктом «lab journal».

---

## 6. Где BodgeGene отличается — твоя ниша

OpenCloning — generic-инструмент клонирования. У него в описании НЕТ:

- фокуса на грибных экспрессионных платформах (Aspergillus/Trichoderma/Pichia/
  Yarrowia) — прямое направление BodgeGene;
- multi-organism как первоклассной оси;
- knowledge integration (CAZy, RE DB, Pfam);
- lab journal с gel OCR/ML;
- 2024-era UX-парадигм (CommandPalette, canvas-skeleton V2) — у них UX
  функциональный, но более классический («плюс под нодой → форма»).

То есть BodgeGene не дублирует OpenCloning. Ниша «интегрированный fungal biotech
workbench» — своя. Но базовый слой (модель sequences+sources, формат файла,
версионирование схемы) у них продуман, и изобретать его заново — лишние грабли.

---

## 7. Конкретные кандидаты «забрать»

Приоритезированы. НЕ задачи к исполнению — вход для решения Игоря.

1. `schema_version` в `.bodge` v2 — высокий. Заложить версию схемы в файл ДО
   фиксации формата. Дёшево сейчас, невозможно задним числом.
   → влияет на `SPEC_BODGE_FORMAT_V2_CORE.md`.
2. Версионированные миграции вместо wipe — средний. Их `migrate`-механизм как
   референс. Не срочно (wipe пока терпим), но пересмотреть DEC-V2-08, когда
   накопятся реальные `.bodge`.
3. GenBank-нотация координат (`SequenceRange`, `"32..51"`) — средний. Аккуратный
   типизированный паттерн для диапазонов вместо голых чисел.
4. «Скрыть предков» ноды — низкий/средний. Дешёвый приём против переполнения
   canvas. Сразу применимо.
5. Плоские списки sequences/sources верхнего уровня — сверить со своей моделью
   (`LIBRARY_MODEL_DRAFT.md`): связи по id, не вложенность.
6. OVE (Open Vector Editor) — оценить, низкий приоритет. У тебя свой
   `SequenceView` уже работает; смена движка — крупный шаг, не оправдан без явной
   боли. Но знать про OVE как fallback полезно.

## 8. Сознательные развилки (НЕ копировать вслепую)

- Типизированные source-классы на каждый метод vs твой общий «Operation +
  params». У них 16 классов методов. Плюс — строгая валидация; минус — каждый
  новый метод = новый класс + миграция. Решение должно быть осознанным.
- Scripting-доступ — у них есть, у тебя нет. Зафиксировать: визуальный путь
  сознательно или scripting в backlog.
- Read-only вьювер — их упрощение. У тебя редактируемый `SequenceView` — это
  фича, не отставание. Не «выравниваться» под них.

---

## 9. Ссылки

- Приложение: app.opencloning.org
- Документация: docs.opencloning.org
- Код: github.com/OpenCloning (OpenCloning / OpenCloning_frontend /
  OpenCloning_backend / OpenCloning_LinkML)
- Схема (browsable): opencloning.github.io/OpenCloning_LinkML
- pydna: github.com/pydna-group/pydna
- LinkML: linkml.io
- OVE: github.com/TeselaGen/tg-oss (packages/ove)

---

_Записка — reference. Решения по пунктам §7-8 принимает Игорь; релевантные —
в `SPEC_BODGE_FORMAT_V2_CORE.md` и Q-STRAT (`PRODUCT_BACKLOG_INTEGRATED_WORKBENCH.md`)._
