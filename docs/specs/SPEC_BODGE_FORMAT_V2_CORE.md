# BodgeGene File Format 2.0.0

Статус: нормативная спецификация формата `.bodge`

Версия формата: `2.0.0`

Расширение файла: `.bodge`

Рекомендуемый media type: `application/vnd.bodgegene.project+zip`

## 1. Статус и нормативный язык

Этот документ является единственным нормативным источником истины для BodgeGene File Format 2.0.0. Он определяет структуру архива, схемы данных, биологическую семантику, правила проверки, профили экспорта и требования к совместимому reader/writer.

Слова **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, **MAY** трактуются в смысле RFC 2119 и RFC 8174:

- **MUST / MUST NOT** — обязательное требование совместимости;
- **SHOULD / SHOULD NOT** — требование, от которого можно отступить только по документированной причине;
- **MAY** — допустимое необязательное поведение.

Формат находится в разработке до отдельного решения о freeze. Файлы, созданные промежуточными development-сборками до freeze, не имеют гарантии совместимости друг с другом. При изменении development-контракта fixtures и тестовые архивы пересоздаются. Номер формата при этом остаётся `2.0.0`.

Следующие документы являются поясняющими или историческими и не могут переопределять эту спецификацию:

- [`ARCHITECTURE.md`](../ARCHITECTURE.md);
- [`BODGE_V2_IMPLEMENTATION_PLAN.md`](./BODGE_V2_IMPLEMENTATION_PLAN.md);
- [`SPEC_REPRODUCIBLE_RECIPE.md`](./SPEC_REPRODUCIBLE_RECIPE.md);
- любые sprint-планы, ADR и комментарии в коде.

Если пример расходится с формальным правилом, формальное правило имеет приоритет.

Все core JSON objects и discriminated unions являются closed: поля, не перечисленные этим документом как REQUIRED/OPTIONAL или как explicit extension point (`methodData`, namespaced opaque payload), запрещены (`additionalProperties: false`). Unknown core field является schema error, даже если asset hash совпадает. Published JSON Schemas являются только machine-readable transcription этого документа и MUST NOT вводить новые поля, defaults или semantics; CI обязан проверять их соответствие normative examples/contract.

## 2. Назначение, принципы и границы

`.bodge` — самодостаточный файловый контейнер проекта создания и редактирования плазмид. Он должен оставаться исследуемым без запуска BodgeGene: ZIP можно распаковать обычным архиватором, последовательности можно прочитать как GenBank, а структурированные данные — как JSON.

### 2.1 Основные принципы

1. **Structured core — единственный источник истины.** Каноническая биология хранится в `project.json`, immutable `containers/*/records/*.json`, `assemblies/*.json`, `provenance/*.json`, `primers/pool.json` и `evidence/*.json`; top-level container aliases являются проверяемыми проекциями.
2. **GenBank — interoperable projection.** `containers/*.gb` генерируются из канонического JSON и не являются вторым независимым состоянием.
3. **Проверка предшествует загрузке.** Reader не создаёт runtime state до проверки ZIP, manifest, хешей, JSON Schema и семантических ссылок.
4. **Биологическая идентичность не равна строке sequence.** Topology, strandedness и физические концы являются частью молекулы.
5. **План не равен эксперименту.** `planned` и `simulated` описывают состояние дизайна. Выполнение лабораторного маршрута и проверка конечного продукта являются отдельными claim-scoped assertions/evidence.
6. **Opaque extensions не владеют core-биологией.** Они могут хранить vendor-данные и UI, но не заменяют канонические записи.
7. **Integrity не равна authenticity.** SHA-256 обнаруживает повреждение; доверие к автору требует отдельной подписи и внешней политики доверия.
8. **Expected не равен observed.** Ожидаемый продукт дизайна и consensus, полученный при секвенировании, являются разными canonical container revisions и никогда не перезаписывают друг друга автоматически.

`.bodge` хранит заявленный проектный путь сборки и точные продукты дизайна. Сам граф не доказывает, что реакции действительно выполнялись. Whole-plasmid verification подтверждает только соответствие предоставленного consensus ожидаемой молекуле; оно не подтверждает лабораторный маршрут, чистоту культуры, функцию конструкции или качество не включённых raw reads.

### 2.2 Вне области формата

В BodgeGene Format 2.0.0 не входят:

- IndexedDB, OPFS, File System Access handles и внутреннее состояние React/Zustand;
- полный canvas snapshot как средство восстановления биологии;
- сетевой протокол совместного редактирования и разрешение конфликтов нескольких writers;
- встроенное ZIP-шифрование и управление ключами;
- исполнение недоверенного кода из архива;
- гарантия воспроизводимости лабораторного результата только по факту наличия дизайна.

Глобальный Library workspace также не является частью project archive. Выбранные для проекта молекулы сохраняются как canonical containers, а их происхождение — через source/external references; локальные Library labels и индексы не дублируются в `.bodge`.

Plain ZIP не обеспечивает конфиденциальность. Чувствительные `.bodge` MUST шифроваться внешним проверенным контейнером.

### 2.3 Термины

- **Asset** — файл внутри ZIP, описанный в `manifest.json`.
- **Canonical asset** — структурированный источник истины.
- **Projection** — стандартное или удобное представление, полностью выводимое из canonical asset.
- **Derived asset** — README, render или иной регенерируемый результат.
- **Opaque asset** — байты, семантика которых не принадлежит core.
- **Record revision** — неизменяемое состояние сущности, закреплённое digest.
- **Container record** — неизменяемое полное состояние container, адресуемое по `recordDigest`.
- **Container revision** — положение record state в lineage; связывает `recordDigest` с immutable parent revisions и адресуется по `revisionDigest`.
- **Provenance event** — отдельное утверждение о том, кем, когда и каким действием была получена revision; адресуется по `eventDigest` и не является частью identity revision.
- **Evidence** — запись наблюдения или измерения, относящаяся к точной ревизии.
- **Expected product** — точная проектная revision продукта assembly.
- **Observed consensus** — отдельный canonical container, импортированный из результата секвенирования.
- **Whole-plasmid comparison** — claim-scoped сравнение expected и observed container revisions.
- **Publication supplement** — профиль `public-supp`, проецирующий canonical graph в dependency-closed human- и machine-readable пакет.
- **Strict read** — обычное открытие только полностью валидного архива.
- **Recovery read** — диагностическое извлечение проверяемых частей повреждённого архива без объявления проекта валидным.

## 3. ZIP-профиль и безопасность путей

`.bodge` MUST быть ZIP-архивом. Writer MUST использовать только методы сжатия `STORE` (`0`) и `DEFLATE` (`8`). Reader MUST отвергать зашифрованные entries и MUST NOT исполнять или автоматически открывать активное содержимое.

### 3.1 Порядок системных entries

Writer MUST располагать entries в следующем порядке:

1. `_recovery.json`, метод `STORE`;
2. `manifest.json`, метод `STORE`;
3. остальные entries в лексикографическом порядке canonical path.

Архив MUST быть single-disk; multi-disk/spanned ZIP запрещён. Каждый entry MUST иметь известные CRC-32, compressed и uncompressed sizes в local header; data descriptor и general-purpose bit 3 запрещены для всего Bodge profile. `_recovery.json` и `manifest.json` дополнительно MUST использовать обычные ZIP32 local headers.

Baseline writer SHOULD использовать ZIP32. ZIP64 MAY использоваться только когда token `zip64` присутствует в `requiredCapabilities`, и только со стандартными ZIP64 extra fields; reader без этой capability не объявляет архив валидным. ZIP64 fields появляются только для overflowed standard fields и MUST совпадать между local/central/ZIP64 records.

В general-purpose flags допустимы только DEFLATE option bits 1–2 для method 8 и UTF-8 name bit 11; поскольку names ASCII, bit 11 не меняет decoding. Для STORE bits 1–2 MUST быть zero. Encryption, descriptor, patched data, strong encryption, masked headers и reserved bits запрещены. Local и central records MUST иметь одинаковые raw name, flags, method, CRC-32 и effective sizes. `version needed` MUST быть 20 для ZIP32 STORE/DEFLATE и 45 при ZIP64.

Bodge ZIP MUST NOT быть self-extracting/polyglot container. Первый local header начинается с offset `0`; entry ranges не перекрываются; directory entries, orphan local headers и произвольные padding regions запрещены; central directory следует после последнего entry; EOCD с пустым archive comment заканчивается ровно на EOF. Per-entry comments MUST быть пустыми. Extra fields запрещены, кроме нормативных ZIP64 fields при объявленной capability. Local и central raw filenames MUST быть байтово одинаковыми ASCII paths.

Writer MUST ставить deterministic transport metadata: general-purpose flags `0`, пустые comments, отсутствие необязательных extra fields/data descriptors, один fixed DOS timestamp `1980-01-01 00:00:00`, `version made by = 0x0314` (Unix, ZIP 2.0), internal attributes `0`, external attributes `0x81A40000` (regular file `0644`) и отсутствие directory entries. Reader не использует ZIP timestamps/creator OS как project metadata. Cross-implementation determinism гарантируется для canonical core JSON bytes и domain digests. Projection/derived bytes совпадают только при одинаковых `generator.id/version/parametersDigest`; разные conforming generators MAY дать разные assets и `archivePayloadDigest`. Byte-identical ZIP гарантируется только одним pinned reference-writer/compressor profile, поскольку разные conforming DEFLATE encoders могут выдавать разные compressed bytes.

### 3.2 Canonical archive path

Все внутренние пути MUST:

- быть относительными;
- использовать только `/` как separator;
- состоять из ASCII-сегментов;
- быть представлены в canonical form без `.` и `..`;
- иметь длину не более 1024 байт, а сегмент — не более 128 байт;
- иметь глубину не более 16 сегментов.

Каждый сегмент MUST соответствовать `^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$`. Это проверяется над raw ASCII bytes: reader MUST NOT URL-decode или Unicode-normalize ZIP names. Символ `%` поэтому запрещён самой grammar, а `safeOriginalName` при импорте обязан быть санитизирован до этой формы. Сегменты `.` и `..` запрещены независимо от regex.

Путь или сегмент MUST NOT содержать:

- `\\`, `:`, NUL и управляющие символы `U+0000..U+001F`;
- пустой сегмент;
- drive/UNC prefix;
- Windows device names `CON`, `PRN`, `AUX`, `NUL`, `COM1..COM9`, `LPT1..LPT9` без учёта регистра;
- завершающую точку или пробел.

Reader MUST сравнивать пути после canonicalization и Unicode-independent ASCII case-fold. Duplicate raw paths, canonical duplicates и case-fold collisions являются structural error.

ZIP symlink и иные special filesystem entries MUST быть отвергнуты. Reader MUST NOT извлекать путь за пределы выбранного каталога даже в recovery/unpack режиме.

### 3.3 Идентификаторы

Core ID MUST соответствовать:

```text
^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$
```

ID используется в JSON-ссылках и безопасных именах файлов, но не является человекочитаемым названием. IDs являются потенциально публичными linkage tokens и MUST NOT кодировать PII, sample secrets, local paths или credentials. Writer SHOULD генерировать opaque IDs. Display name MAY быть Unicode и хранится только в JSON metadata.

Vendor ID extension MUST соответствовать:

```text
^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$
```

Значения `__proto__`, `prototype` и `constructor` MUST быть запрещены как vendor ID и как ключи untrusted dictionaries. Реализация SHOULD использовать `Map` или `Object.create(null)` для maps, построенных из архива.

Namespaced registry identifier имеет форму `<vendorId>:<localId>`, где `vendorId` соответствует правилу выше, а `localId` — `^[a-z0-9][a-z0-9._/-]{0,127}$` без пустых, `.` или `..` slash-segments. `method.id`, custom property IDs и measurement scales MUST использовать эту форму. Capability token является либо зарегистрированным core token (`zip64`), либо namespaced registry identifier. Unknown asset kind использует более узкую форму `<vendorId>:<kindToken>`, где `kindToken` соответствует `^[a-z0-9][a-z0-9._-]{0,63}$`. Registry identifiers являются JSON values и никогда не интерпретируются как archive paths или URLs.

### 3.4 Лимиты reader

Формат не задаёт универсальный максимальный размер проекта. Reader MUST применять policy до inflate и MUST показывать причину отказа. Рекомендуемые web-defaults:

| Параметр | Значение |
|---|---:|
| `manifest.json` | 2 MiB |
| Один structured asset | 32 MiB |
| Один attachment/source | 128 MiB |
| Число entries | 4096 |
| Суммарный uncompressed size | 512 MiB |

Превышение policy не делает архив невалидным по формату, но требует явного large-file режима. Compression ratio используется как сигнал риска, а не как единственный критерий: DNA и JSON могут легитимно хорошо сжиматься.

Declared sizes являются только preflight input, а не доверенной гарантией. Reader MUST считать фактически emitted uncompressed bytes и немедленно остановить inflate, если entry превышает declared `size`, per-asset policy или общий budget. Реализация MUST NOT заранее выделять память по недоверенному uncompressed size и MUST ограничивать одновременно buffered bytes независимо от числа workers.

## 4. Структура архива

```text
_recovery.json
manifest.json
project.json
containers/<containerId>.json
containers/<containerId>.gb
containers/<containerId>/records/<recordDigestHex>.json
containers/<containerId>/records/<recordDigestHex>.gb
assemblies/<assemblyId>.json
provenance/containers/<containerId>.json
primers/pool.json
notebook/entries.json
notebook/attachments/<attachmentId>.<safeExt>
evidence/<evidenceId>.json
publication/methods.md
publication/assembly.png
publication/materials.tsv
publication/primers.tsv
publication/verification.md
publication/variants.tsv
publication/assembly.svg
publication/supplement.pdf
sources/<sha256>/<safeOriginalName>
ui/layout.json
refs/external.json
signatures/project-content.ed25519
extensions/<vendor>/manifest.json
extensions/<vendor>/<relativePath>
README.md
```

Обязательные entries для project archive:

- `_recovery.json`;
- `manifest.json`;
- `project.json`.

`README.md` MUST присутствовать в профилях `full` и `public-supp`. Для `public-supp` derived publication artifacts регулируются §15.3. Остальные разделы добавляются по данным проекта и export profile.

`containers/<containerId>/records/<recordDigestHex>.json` — immutable canonical record store. `containers/<containerId>.json` — удобный head alias и MUST быть байтово идентичен выбранному record asset. Аналогично, top-level `.gb` является head projection, а `.gb` рядом с immutable record — projection конкретного record state. Один record asset MAY обслуживать несколько revisions с одинаковым `recordDigest`.

Пустой UI-проект без биологических сущностей MAY быть сохранён как valid project archive, если `project.json` явно содержит пустые refs. Runtime placeholder MUST NOT превращаться в container или assembly.

## 5. `manifest.json`

`manifest.json` — полный allowlist ZIP. Reader MUST парсить core assets только по manifest, а не по glob списка ZIP entries.

### 5.1 Минимальная форма

```json
{
  "$schema": "https://bodgegene.dev/schema/2.0.0/manifest.json",
  "signature": "BODGE-V2",
  "fileFormatVersion": "2.0.0",
  "createdBy": {
    "name": "BodgeGene",
    "version": "development-build",
    "engineVersion": "development-engine"
  },
  "exportProfile": "full",
  "requiredCapabilities": [],
  "optionalCapabilities": [],
  "project": "project.json",
  "projectContentDigest": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "archivePayloadDigest": "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
  "attestation": null,
  "assets": {
    "project.json": {
      "kind": "project",
      "role": "canonical",
      "schemaVersion": "2.0.0",
      "size": 1024,
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "mediaType": "application/json",
      "compression": "deflate",
      "required": true,
      "generatedFrom": [],
      "capability": null,
      "generator": null
    },
    "README.md": {
      "kind": "readme",
      "role": "derived",
      "size": 256,
      "sha256": "23456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
      "mediaType": "text/markdown; charset=utf-8",
      "compression": "deflate",
      "required": true,
      "generatedFrom": [
        {
          "path": "project.json",
          "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        }
      ],
      "capability": null,
      "generator": {
        "id": "bodgegene:readme",
        "version": "development",
        "parametersDigest": null
      }
    }
  },
  "extensions": {}
}
```

Digest и size в примере являются placeholders формы и MUST быть пересчитаны по фактическим bytes; пустой `assets` не является допустимым manifest, потому `project.json` обязателен.

`signature` — magic string, а не криптографическая подпись. Writer MUST записывать ровно `BODGE-V2`.

`fileFormatVersion` MUST быть ровно `2.0.0` для этого документа. Development reader не обязан открывать иные значения.

`project` MUST быть ровно `project.json`; `assets["project.json"]` MUST существовать с `kind: "project"`, `role: "canonical"` и `required: true`.

`requiredCapabilities` и `optionalCapabilities` — непересекающиеся уникальные tokens §3.3, отсортированные по ASCII. После profile filtering они MUST быть точным union included declarations: `capability.criticality` в asset descriptors, reaction/evidence/provenance-activity methods и extension envelopes плюс bootstrap transport capability `zip64`. Лишняя, отсутствующая или помещённая не в тот set capability является semantic error. Любая capability, необходимая для parsing или смысла canonical core, REQUIRED; optional capability MAY добавлять только opaque/projection/derived data либо понятный generic method envelope и MUST NOT менять смысл закрытых core fields.

Неизвестная required capability блокирует normal canonical hydration, writable open и recompute, но не bounded inspection/verified extraction или isolated read-only core preview. Неизвестная optional capability допускает canonical read только при доказанном lossless preservation; affected recompute отключается. ZIP64 является bootstrap special case: transport определяется preflight до manifest, затем наличие `zip64` в required set обязательно; undeclared ZIP64 является invalid, а отсутствие поддержки ZIP64 у reader — `unsupported`, не `corrupt`.

### 5.2 Asset descriptor

Ключ `assets` — canonical path. Значение:

```json
{
  "kind": "container-record",
  "role": "canonical",
  "schemaVersion": "2.0.0",
  "size": 48321,
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "mediaType": "application/json",
  "compression": "deflate",
  "required": true,
  "generatedFrom": [],
  "capability": null,
  "generator": null
}
```

Обязательные поля: `kind`, `role`, `size`, `sha256`, `mediaType`, `compression`, `required`, `generatedFrom`, `capability`, `generator`.

- `size` — число uncompressed bytes, не число JavaScript characters;
- `sha256` — lowercase hex SHA-256 точных uncompressed bytes;
- `schemaVersion` REQUIRED для structured core JSON, включая trusted signature envelope, и MUST отсутствовать для неприменимых binary/opaque payloads; MIME `application/json` сам по себе не разрешает парсить opaque payload;
- `compression` имеет ровно `store` или `deflate` и MUST совпадать с ZIP method `0` или `8` в local и central headers;
- `generatedFrom` — массив `{ "path": "...", "sha256": "..." }`, отсортированный по path;
- `capability` — `null` либо exact `{id, criticality}` с `criticality: "required" | "optional"`;
- `generator` — `null` либо exact `{id, version, parametersDigest}`; ID namespaced, `parametersDigest` — domain digest или `null`;
- `required: true` означает, что reader обязан понимать роль asset для выбранного export; любой listed asset независимо от этого флага MUST физически присутствовать и пройти size/hash checks.

Допустимые `role`:

- `canonical`;
- `projection`;
- `derived`;
- `opaque`;
- `attestation`.

Core `kind`:

- `project`;
- `container-record`;
- `container-head`;
- `genbank-projection`;
- `assembly`;
- `container-provenance`;
- `primer-pool`;
- `notebook`;
- `attachment`;
- `evidence`;
- `source`;
- `ui-layout`;
- `external-refs`;
- `extension-manifest`;
- `extension-data`;
- `signature`;
- `readme`;
- `publication-artifact`.

Нормативные role constraints:

| `kind` | `role` |
|---|---|
| `project`, `container-record`, `assembly`, `container-provenance`, `primer-pool`, `notebook`, `evidence`, `external-refs`, `extension-manifest` | `canonical` |
| `container-head`, `genbank-projection` | `projection` |
| `readme`, `publication-artifact` | `derived` |
| `attachment`, `source` | `opaque` |
| `signature` | `attestation` |
| `extension-data` | `opaque` либо `derived` |
| `ui-layout` | `canonical`, но исключён из biological semantics и `projectContentDigest` |

`publication-artifact` MUST иметь `role: "derived"` и непустой `generatedFrom`. Core publication paths ограничены перечисленными в §4; один общий kind используется для Markdown, TSV, PNG, SVG и PDF-проекций. Profile conditions §15 решают, какие из них разрешены. `attestation` является trusted system envelope, а не project content; единственный core kind с этой ролью — `signature`.

Immutable `records/<recordDigestHex>.json` имеет `kind: "container-record"`, `role: "canonical"`. Top-level `containers/<id>.json` имеет `kind: "container-head"`, `role: "projection"` и один `generatedFrom` на immutable record. Head aliases и все GenBank assets не входят в `projectContentDigest`.

`manifest.json` и `_recovery.json` не входят в `assets`: они проверяются по отдельным правилам. Все остальные ZIP files MUST встречаться в `assets` ровно один раз. Unlisted entry является integrity error.

### 5.3 Проекции и зависимости

Projection/derived asset MUST иметь непустой `generatedFrom`. Например `containers/c01/records/<recordDigestHex>.gb` ссылается на exact SHA-256 sibling JSON record, а `containers/c01.json` и `containers/c01.gb` — на тот же выбранный immutable JSON record.

Reader MUST проверить существование и хеш каждого `generatedFrom`. Проекция с устаревшей зависимостью является semantic error для `full` conformance, даже если её собственный SHA-256 совпадает.

`canonical` и независимый `opaque` asset MUST иметь `generatedFrom: []`. `projection` и `derived` содержат только direct dependencies: paths уникальны, ASCII-sorted, существуют в том же filtered manifest и указывают exact descriptor SHA-256. Self-reference, dependency на manifest/recovery/signature, dependency наружу profile и cycle запрещены; глобальный `generatedFrom` graph MUST быть DAG. Для algorithmic projection/derived descriptor `generator` MUST быть non-null; для canonical/independent opaque/attestation он MUST быть `null`. Unknown preserved derived asset с изменившейся dependency блокирует normal Save как `PRESERVED_DERIVED_STALE`; writer не переписывает dependency, не оставляет stale output и не удаляет его молча.

### 5.4 `projectContentDigest`

`projectContentDigest` вычисляется по правилам §10.7. Он не включает `manifest.json`, `_recovery.json`, projections, derived assets, signature, UI layout и packaging timestamps.

`archivePayloadDigest` вычисляется по правилам §10.8 и защищает exact распространяемый набор uncompressed assets, включая projections, publication artifacts и UI, но исключая detached signature. Он не является raw ZIP hash: harmless recompression не меняет его.

### 5.5 Unknown assets

- Unknown unlisted entry MUST быть отвергнут.
- Unknown core `kind` запрещён. Namespaced kind `<vendor>:<token>` допустим только с `required: false`, `capability:{id, criticality:"optional"}` и role `opaque`, `projection` или `derived`; capability ID MUST присутствовать в root optional set. Он не может быть новым canonical source of truth.
- Listed unknown asset с `required: true` MUST блокировать writable open.
- При writable open listed unknown optional asset MUST быть сохранён как отдельный preserved inventory: path, descriptor, vendor/group binding и exact uncompressed bytes; иначе writable open запрещён.
- Обычный `full` Save MUST переиздать preserved independent opaque bytes и optional extension как атомарную группу. Bit-perfect означает exact uncompressed payload, а не тот же DEFLATE stream/ZIP metadata.
- Удаление допустимо только по export profile или после явного действия «создать копию без неподдерживаемых данных» и MUST быть отражено privacy/loss report. Writer MUST NOT молча удалять preserved data при re-save.

### 5.6 Extension index

`manifest.extensions` — map vendor ID к краткому transport index:

```json
{
  "extensions": {
    "example.vendor": {
      "manifest": "extensions/example.vendor/manifest.json",
      "required": false,
      "privacyClass": "unknown",
      "capability": {
        "id": "example.vendor:extension/data",
        "criticality": "optional"
      }
    }
  }
}
```

Index MUST точно соответствовать extension manifests из §14. Vendor, отсутствующий в этом map, не может иметь files в `extensions/`. `required`, `privacyClass` и `capability` MUST совпадать в обоих местах; `required:true` требует `criticality:"required"`, false — `"optional"`. Index не заменяет asset descriptors и не даёт права пропускать hash/path verification.

## 6. `project.json`

`project.json` — semantic composition root проекта. Manifest описывает файлы; project описывает сущности и связи верхнего уровня.

```json
{
  "$schema": "https://bodgegene.dev/schema/2.0.0/project.json",
  "schemaVersion": "2.0.0",
  "id": "project-01",
  "title": "pks4 knockout study",
  "description": "Design and verification of the knockout plasmid",
  "tags": ["pks4", "knockout"],
  "createdAt": "2026-07-13T10:00:00Z",
  "updatedAt": "2026-07-13T12:00:00Z",
  "creators": [
    {
      "id": "person-igor",
      "name": "Igor",
      "orcid": "https://orcid.org/0000-0002-1825-0097",
      "visibility": "public"
    }
  ],
  "license": "https://spdx.org/licenses/CC-BY-4.0.html",
  "doi": null,
  "identifiers": [],
  "sources": [],
  "refs": {
    "containers": [
      {
        "id": "c01",
        "revisionDigest": "sha256:2222222222222222222222222222222222222222222222222222222222222222"
      }
    ],
    "assemblies": ["a01"],
    "primerPool": "primers/pool.json",
    "notebook": "notebook/entries.json",
    "evidence": [],
    "sources": [],
    "externalRefs": "refs/external.json"
  },
  "publication": null
}
```

### 6.1 Требования

- `id`, `title`, `createdAt`, `updatedAt`, `creators`, `tags`, `identifiers`, `sources` и `refs` REQUIRED.
- `description` REQUIRED как string или `null`; отсутствие описания не кодируется пустым неоговорённым field omission.
- Timestamps MUST быть RFC 3339 UTC и заканчиваться `Z`.
- `tags`, `identifiers` и все refs arrays MUST не содержать дубликатов. Tags сортируются по UTF-8 bytes NFC string; identifiers — по `(kind, value, url, visibility)`; container refs — по `(id, revisionDigest)`; evidence refs — по `(id, evidenceDigest)`; остальные string refs — по ASCII ID.
- ORCID, DOI, license и внешние identifiers OPTIONAL; пустая строка вместо отсутствующего значения MUST NOT использоваться.
- `deviceId`, file handle, absolute local path и runtime URL MUST NOT присутствовать в canonical project metadata.
- UI layout, focused panel, zoom и positions MUST храниться только в `ui/layout.json`.

`creators[]` сохраняет значимый author order и содержит закрытые objects `{id, name, orcid, visibility}`; `id` и непустой `name` REQUIRED, `orcid` — canonical `https://orcid.org/<ORCID>` или `null`, `visibility` — `public | private`. Это единый project-level people registry: `agentRef` provenance/evidence и `constructionClaim.assertedBy` MUST разрешаться в `creators[].id`. `identifiers[]` содержит закрытые objects `{kind, value, url, visibility}`, где `kind` — core `doi | accession | registry | other` либо namespaced identifier, `value` непустой, `url` — absolute `https` URI или `null`, а `visibility` — `public | private`.

`refs` всегда содержит все поля: `containers`, `assemblies`, `primerPool`, `notebook`, `evidence`, `sources`, `externalRefs`. Array fields присутствуют как arrays, даже когда пусты. `evidence[]` состоит из exact refs `{id, evidenceDigest}` и сортируется по `(id, evidenceDigest)`; оба поля MUST совпасть с resolved immutable evidence record. `primerPool`, `notebook` и `externalRefs` имеют тип canonical path или `null`; non-null path MUST быть ровно `primers/pool.json`, `notebook/entries.json` или `refs/external.json` соответственно и разрешаться в asset правильного kind. `null` означает, что раздел отсутствует. Empty project использует пустые arrays и три `null`, а не dangling default paths.

`publication` OPTIONAL для обычного project/full archive и REQUIRED для `public-supp`. Non-null value является closed object `{products, attachmentsOmitted}` с non-empty `products[]`, отсортированным по `(assemblyId, expectedProduct.id, expectedProduct.revisionDigest)`. Каждый closed product включает `assemblyId`, exact `expectedProduct {kind:"container",id,revisionDigest}`, `verificationEvidenceRef` (`{id,evidenceDigest} | null`), `constructionAssertion` (`design-only | reported-performed`) и `constructionClaim`. `full` MAY хранить несколько release bindings, но singleton paths `publication/assembly.png`, Methods и tables разрешены только когда selected profile slice содержит ровно один product. `public-supp` MUST содержать ровно один; multi-product aggregate artifacts в `2.0.0` не определены, поэтому продукты экспортируются отдельными archives.

Для `design-only` `constructionClaim` MUST быть `null`. Для `reported-performed` он REQUIRED и имеет закрытую форму `{assertedBy, assertedAt, basis, note}`, где `assertedBy` ссылается на `creators[].id`, `assertedAt` — RFC 3339 UTC, `basis` — `author-report | imported-report`, `note` — nullable string. Claim не является evidence и не даёт `pass`. В `public-supp` referenced creator MUST иметь `visibility:"public"`, иначе export блокируется до явного изменения canonical visibility/claim. `project.publication.attachmentsOmitted` REQUIRED для `public-supp` как boolean и имеет default `false` в других profiles. Для `public-supp` это biconditional: значение `true` тогда и только тогда, когда retained evidence ссылается хотя бы на один исключённый attachment; omission registry keys MUST точно равняться этому set. Иначе значение `false`, `project.refs.notebook` равно `null`, а notebook asset отсутствует. Блок является release binding и MUST NOT копировать sequence, reactions, primers или evidence payload.

`verificationEvidenceRef: null` означает честный design-only/not-checked package и не делает архив неполным. Если ref указан в `public-supp`, ID/digest MUST совпадать с evidence kind `whole-plasmid-sequence-comparison`, subject MUST быть exact expected product, payload MUST содержать exact observed revision, а record обязан входить в dependency closure. Regional/junction/manual evidence остаётся допустимым в `full`, но не выбирается этим publication field в prerelease.

`sources` содержит source records, определённые в §13. `refs.sources` перечисляет их IDs и MUST точно совпадать с `sources[*].id`.

`refs.containers` содержит exact active refs `{id, revisionDigest}`. Каждый ref MUST совпадать с `headRevisionDigest` соответствующего provenance slice и выбранным head alias. `refs.assemblies` MUST точно соответствовать canonical assembly assets. Manifest MAY дублировать быстрый индекс, но `project.json` остаётся semantic root; оба представления обязаны совпадать.

## 7. Каноническая молекула

Канонические состояния молекулы хранятся как immutable assets `containers/<containerId>/records/<recordDigestHex>.json`. `<recordDigestHex>` — 64 lowercase hex characters из `recordDigest` без префикса `sha256:`.

`containers/<containerId>.json` не является вторым состоянием: это проверяемый head alias, байтово идентичный immutable record, выбранному через `project.json` и provenance. Reader MUST разрешать exact historical revision через provenance, а не подменять её текущим head.

### 7.1 Container record

```json
{
  "$schema": "https://bodgegene.dev/schema/2.0.0/container.json",
  "schemaVersion": "2.0.0",
  "digestSchemaVersion": "1",
  "id": "c01",
  "name": "pET-28b",
  "description": "Expression vector",
  "alphabet": "DNA-IUPAC",
  "strandedness": "double",
  "topology": "circular",
  "sequence": "ATGC",
  "ends": null,
  "features": [],
  "origin": {"kind": "manual"},
  "recordDigest": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "moleculeDigest": "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
}
```

Обязательные поля record: `$schema`, `schemaVersion`, `digestSchemaVersion`, `id`, `name`, `description`, `alphabet`, `strandedness`, `topology`, `sequence`, `ends`, `features`, `origin`, `recordDigest`, `moleculeDigest`. `name` — непустая string; `description` — string или `null`; отсутствие features представляется `[]`.

### 7.2 Sequence

Writer MUST:

- записывать sequence uppercase без whitespace;
- принимать только символы `ACGTRYSWKMBDHVN` для `DNA-IUPAC`;
- записывать `strandedness` как `single`, `double` или `unknown`;
- записывать `topology` как `linear`, `circular` или `unknown`;
- отвергать container без ID или с пустой sequence.

Planned, unknown или placeholder material без sequence MUST представляться в assembly как material/piece и MUST NOT сериализоваться как container.

`unknown` topology/strandedness предназначены для честного представления imported/observed sequence, когда исходные данные не определяют физическую молекулу. Reaction со `state: "simulated"` MUST NOT материализовать output с unknown topology или strandedness. Whole-molecule `pass` для unknown topology/strandedness запрещён.

### 7.3 Physical ends

Для `circular` значение `ends` MUST быть `null`. Для linear double-stranded molecule используется discriminated shape:

```json
{
  "kind": "double-stranded",
  "left": {
    "type": "5prime-overhang",
    "overhang": "AATG",
    "phosphorylated": {
      "reference": true,
      "complement": null
    },
    "generatedBy": {
      "kind": "enzyme",
      "registry": "gg",
      "enzyme": "BsaI"
    }
  },
  "right": {
    "type": "unknown",
    "overhang": null,
    "phosphorylated": {
      "reference": null,
      "complement": null
    },
    "generatedBy": null
  }
}
```

`reference` — strand, sequence которого хранится 5′→3′ в `container.sequence`; `complement` — антипараллельный комплементарный strand. Эти имена однозначны и для blunt end. `true` означает наличие terminal phosphate, `false` — достоверное отсутствие, `null` — неизвестно.

Допустимые `type` и связанные значения:

- `blunt` требует `overhang: ""`;
- `5prime-overhang` и `3prime-overhang` требуют непустой DNA-IUPAC `overhang`;
- `unknown` требует `overhang: null`.

`overhang` всегда записан 5′→3′ на физически protruding strand. Два non-palindromic cohesive ends совместимы, когда их overhang sequences являются reverse complements; совпадение строк само по себе недостаточно. `container.sequence` является виртуальной reference-coordinate strand, поэтому validator использует точные правила: left 5′ = prefix(sequence), left 3′ = strictRC(prefix), right 3′ = suffix(sequence), right 5′ = strictRC(suffix). Runtime cut-slice aliases не могут копироваться в этот contract без adapter.

Ambiguous IUPAC symbol в overhang сохраняется как известная неопределённость, но не может дать strict compatibility или simulated ligation output без отдельного capability/method, явно определяющего такую semantics.

`generatedBy` является закрытым union:

```json
{"kind":"enzyme","registry":"re","enzyme":"EcoRI"}
```

```json
{"kind":"enzyme","registry":"gg","enzyme":"BsaI"}
```

```json
{"kind":"process","methodId":"bodgegene:end-blunting"}
```

Registry `gg` содержит только Type IIS enzymes, registry `re` — только классические restriction enzymes. Несоответствие registry/enzyme является biological error.

Linear single-stranded molecule использует отдельную форму; sticky/blunt fields в ней запрещены:

```json
{
  "kind": "single-stranded",
  "left": {"terminus": "5prime", "phosphorylated": null, "generatedBy": null},
  "right": {"terminus": "3prime", "phosphorylated": null, "generatedBy": null}
}
```

Precedence ends rules: `topology: "circular"` ALWAYS требует `ends: null`, даже при unknown strandedness; `topology: "unknown"` требует `{"kind":"unknown"}`; `linear + double` требует `kind: "double-stranded"`; `linear + single` — `kind: "single-stranded"`; `linear + unknown strandedness` — `{"kind":"unknown"}`.

### 7.4 Origin

`origin` является закрытым union:

```json
{"kind":"imported"}
```

```json
{"kind":"manual"}
```

```json
{"kind":"derived"}
```

```json
{"kind":"observed"}
```

```json
{"kind":"unknown"}
```

`origin` фиксирует только класс возникновения record state и MUST NOT содержать archive-local `sourceId`, assembly ID, reaction ID, agent или timestamp. Для `imported`/`observed` exact source link хранится в provenance import/observation event как `{id, sourceRecordDigest}`; в `full` такой event REQUIRED для revision, впервые вводящей record, а identity-only filtered profile MAY его опустить. `derived` обозначает вычисленный/assembly output, но assembly/reaction IDs и exact operation также хранятся в provenance event. Это не создаёт locator-dependent `recordDigest` и позволяет разным activities ссылаться на одинаковый record state. Fork и manual edit используют `manual`; parent revisions хранятся в provenance. Runtime labels вроде `tree_drag`, `op_pcr` и `placeholder` в canonical origin запрещены. Изменение origin kind меняет `recordDigest`.

### 7.5 Координаты

Единственная внутренняя система — **0-based, half-open** `[start, end)`. `start` включён, `end` исключён.

Range MUST удовлетворять `0 <= start < end <= sequence.length`. Point MUST удовлетворять `0 <= position < sequence.length`. Circular feature, пересекающая origin, представляется несколькими ordered segments; отрицательные координаты и `start > end` запрещены.

### 7.6 Feature model

```json
{
  "id": "feature-01",
  "level": "region",
  "name": "beta-lactamase",
  "type": "CDS",
  "bodgeType": "marker",
  "locationOperator": "single",
  "locations": [
    {
      "kind": "range",
      "start": 100,
      "end": 300,
      "strand": "+",
      "startFuzz": {"kind": "exact"},
      "endFuzz": {"kind": "exact"}
    }
  ],
  "parentFeatureId": null,
  "assertion": {
    "status": "reviewed",
    "derivation": {"kind": "manual"},
    "confidence": null
  },
  "qualifiers": {
    "gene": ["bla"],
    "product": ["beta-lactamase"],
    "codon_start": ["1"],
    "pseudo": []
  }
}
```

Обязательные поля feature: `id`, `level`, `type`, `locationOperator`, `locations`, `parentFeatureId`, `assertion`, `qualifiers`. `name` и `bodgeType` OPTIONAL. `level`: `region`, `detail`, `point`.

`features[]` является set-like collection с уникальными IDs и при записи сортируется по ASCII bytes stable `id`, никогда через locale collation; display/z-order хранится в UI layout. Внутренний порядок `locations[]` и повторных qualifier values семантичен и не сортируется.

Display color/track height не являются feature biology и хранятся в `ui/layout.json.featureStyles`. При этом imported vendor qualifiers вроде `ApEinfo_fwdcolor` остаются в `qualifiers` для interoperable round-trip и не удаляются только потому, что UI построил из них style.

`type` — INSDC projection key. Если Bodge semantic/custom type не выражается standard key без потери, canonical `type` MUST быть `misc_feature`, а исходное значение сохраняется в `bodgeType` и `/bodge_type`; эвристический выбор разных fallback keys запрещён. `locationOperator`: `single`, `join`, `order`. `single` требует одну location; `join` и `order` — минимум две.

Location variants:

- `range`: `start`, `end`, `strand`, `startFuzz`, `endFuzz`;
- `point`: `position`, `strand`, `fuzz`;
- `between`: `left`, `right`, `strand`.

Fuzz является закрытым object union:

- `{"kind":"exact"}`;
- `{"kind":"before"}`;
- `{"kind":"after"}`;
- `{"kind":"unknown"}`;
- `{"kind":"within","minimum":97,"maximum":103}`;
- `{"kind":"one-of","positions":[97,100,103]}`.

`one-of.positions` является уникальным ascending numeric set; duplicate/unsorted positions non-canonical. `assertion.support[]` — set-like array: identity каждого variant равна UTF-8 bytes JCS normalized full support object; array сортируется лексикографически по этим bytes, byte-identical duplicates запрещены. Это правило не распространяется на `locations[]`, reaction inputs или qualifier values.

Основная coordinate boundary остаётся числом: для `within` она MUST лежать в диапазоне, для `one-of` — присутствовать в `positions`. В `range` значения `start`, `end` и все `startFuzz`/`endFuzz` candidates являются 0-based half-open boundary coordinates в диапазоне `0..sequence.length`; `startFuzz` относится к numeric lower boundary, `endFuzz` — к numeric upper boundary независимо от strand. В `point` `position`/fuzz candidates являются base coordinates `0..sequence.length-1`. GenBank codec меняет biological `<`/`>` placement при complement, но canonical field names не меняются местами. Remote GenBank locations не преобразуются в local range и MUST давать `FEATURE_REMOTE_LOCATION_UNSUPPORTED`.

`strand`: `+`, `-`, `none`.

`locations[]` хранится в biological 5′→3′ order и MUST NOT автоматически сортироваться по координате. Для извлечения feature sequence каждый segment обрабатывается по порядку, `strand: "-"` reverse-complemented, затем segments concatenated. Plus circular wrap обычно записывается `[high,length), [0,low)`; на minus strand biological order обратный. Codec MUST нормализовать эквивалентные `complement(join(...))` и `join(complement(...), ...)` в один canonical order. Linear feature не может wrap; circular same-strand feature MAY иметь не более одного wrap.

Для `between` на linear molecule требуется `right = left + 1`. На circular molecule дополнительно допустим origin site `left = sequence.length - 1`, `right = 0`. Fuzz для `between` запрещён.

`qualifiers` MUST быть map `string -> string[]`. `[]` означает valueless flag вроде `/pseudo`, а `[""]` — qualifier с явно пустым string value. Повторяющиеся values, включая duplicates, сохраняются в исходном порядке; порядок разных keys не семантичен. Scalar string, `null`, number и boolean запрещены. Unknown qualifiers MUST сохраняться. Core fields (`id`, coordinates, type) MUST NOT кодироваться только через generic qualifier.

`assertion.status`: `predicted`, `reviewed`, `unknown`. `reviewed` означает принятие человеком, а не experimental verification. `derivation` является closed union `{kind:"manual"}`, `{kind:"imported", sourceFeatureId:string|null}` или `{kind:"computed", method:{id,version}, parametersDigest}`; `parametersDigest` является domain digest или `null`. Exact imported source record связывается с revision только provenance activity `{kind:"import",sourceRef:{id,sourceRecordDigest}}`, а не помещается в feature/`recordDigest`; `sourceFeatureId` — только исходный идентификатор feature или `null`, не project source ref. Predicted assertion MUST иметь computed method. Optional confidence имеет форму `{"value":0.87,"scale":"namespaced:score/v1"}`; число без scale запрещено и scores разных scales не сравниваются автоматически.

Optional `assertion.support[]` сохраняет только typed support: `{kind:"feature-ref", featureId}`, `{kind:"location-signal", type, locations, score}` или `{kind:"measurement", type, value, scale}`. `type`/`scale` namespaced; `score` использует ту же `{value, scale}` форму, refs разрешаются внутри container. Unstructured runtime `signals` MUST быть отображены в эти variants/child features; иначе writer возвращает `FEATURE_SIGNAL_UNMAPPED`, а не теряет данные и не принимает arbitrary executable object.

`region.parentFeatureId` MUST быть `null`. `detail` и `point` MAY ссылаться только на `region` того же container либо иметь `null`; произвольное дерево и циклы запрещены. Exact child location с parent MUST находиться внутри union parent locations. При fuzzy boundaries недоказуемое containment даёт warning, но доказанный выход за parent является error.

## 8. GenBank-проекция

Для каждого включённого immutable record writer MUST создать `containers/<id>/records/<recordDigestHex>.gb`, если export profile включает projections. `containers/<id>.gb` является projection выбранного head record. Одинаковый record, используемый несколькими revisions, имеет одну record-specific GenBank-проекцию.

### 8.1 Правила генерации

- LOCUS topology MUST совпадать с canonical `topology`, когда она `linear` или `circular`.
- `ACCESSION` MUST совпадать с canonical container ID.
- Sequence MUST совпадать побайтно после uppercase/whitespace normalization.
- Feature locations MUST корректно преобразовываться из 0-based half-open в INSDC 1-based inclusive.
- `join`, `order`, `complement`, fuzzy, point, between-base и circular-origin locations MUST поддерживаться.
- Standard qualifiers MUST записываться как standard qualifiers.
- Неизвестные qualifiers MUST сохраняться без сведения нескольких значений в одно.
- Stable identity MUST передаваться через `/bodge_id`.
- Feature level MUST передаваться через `/bodge_level`.
- Исходный Bodge type, если standard GenBank type является lossy projection, MUST передаваться через `/bodge_type`.
- Non-null parent link MUST передаваться через `/parent_feature`, но canonical parent relation хранится в JSON.
- Assertion status/derivation MUST передаваться через `/bodge_assertion` и `/bodge_derivation_kind`; computed derivation дополнительно использует `/bodge_method_id` и `/bodge_method_version`, imported — `/bodge_source_id`. Confidence использует парные `/bodge_confidence_value` и `/bodge_confidence_scale`.

`assertion.support` не проецируется в GenBank и является объявленным projection loss; canonical JSON остаётся единственным полным представлением predictor support.

Writer создаёт projection-only `source` feature на всю sequence для record metadata; он не добавляется в canonical `features[]` при обратном parse. При `topology: "unknown"` LOCUS не заявляет `circular`, а source feature получает `/bodge_topology="unknown"`. Аналогично unknown strandedness передаётся через `/bodge_strandedness="unknown"`. Такая проекция явно lossy для сторонних readers, которые могут интерпретировать пустое topology как linear, и никогда не является основанием whole-molecule `pass`.

Для `full` writer включает проекции всех record states. Для `public-supp`, `single-assembly` и `containers-bundle` он включает проекции всех exact records в dependency closure, включая historical non-head materials и observed consensus. Observed consensus, импортированный из FASTA без features, получает обычную record-specific GenBank-проекцию с пустым feature set и честной unknown topology/strandedness metadata.

`README.md` и `publication/methods.md` MUST перечислять relative paths GenBank-проекций конечных expected products и exact record paths, если closure содержит несколько revisions одного container ID. Извлечение и чтение `.gb` MUST оставаться доступным без chemistry plugin. В `publication/` нельзя создавать вторую копию container GenBank.

### 8.2 Provenance COMMENT

COMMENT MAY содержать компактный BodgeGene block:

```text
containerId=c01
recordDigest=sha256:...
provenanceRef=provenance/containers/c01.json
```

COMMENT не является каноническим журналом и MUST NOT быть единственным местом commits, source metadata или evidence.

`revisionDigest` не записывается как identity record-specific GenBank: relation record→revision может быть many-to-many. GenBank `VERSION .n` MUST NOT интерпретироваться как номер revision в DAG.

### 8.3 Проверка проекции

Manifest descriptor `.gb` MUST иметь:

```json
{
  "generatedFrom": [
    {
      "path": "containers/c01/records/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.json",
      "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  ]
}
```

Full validator MUST повторно разобрать GenBank и сравнить как минимум container ID, normalized sequence, known topology, feature levels/types/locations, parent links, projected assertion fields и qualifiers с canonical JSON. Поля, для которых §8.1 явно допускает lossy projection, проверяются по Bodge projection metadata и loss declaration, а не угадываются.

Если `.gb` был внешне изменён, normal open MUST завершиться integrity/semantic error. Recovery/inspection MAY предложить импортировать его как новый источник, но MUST NOT молча дать проекции победить canonical JSON.

## 9. Assembly graph

`assemblies/<assemblyId>.json` хранит канонический граф проектирования конструкции. Canvas layout не входит в этот файл.

### 9.1 Верхний уровень

```json
{
  "$schema": "https://bodgegene.dev/schema/2.0.0/assembly.json",
  "schemaVersion": "2.0.0",
  "id": "a01",
  "name": "pks4 knockout assembly",
  "state": "simulated",
  "pieces": [],
  "reactions": [],
  "connections": [],
  "productRefs": [],
  "createdAt": "2026-07-13T10:00:00Z",
  "updatedAt": "2026-07-13T12:00:00Z"
}
```

Допустимые `state`: `planned`, `simulated`. Верификация относится к exact product revision и выводится из scoped evidence по §11; состояние assembly не повышается лабораторным observation.

### 9.2 Typed reference

```json
{
  "kind": "container",
  "id": "c01",
  "revisionDigest": "sha256:2222222222222222222222222222222222222222222222222222222222222222"
}
```

`kind`: `container`, `piece`, `reaction`, `primer`, `primer-pair`, `evidence`. Только `container` является mutable biological identity и MUST включать exact `revisionDigest`. Piece/reaction/primer IDs разрешаются внутри соответствующего canonical project asset. Evidence ref использует exact `{id,evidenceDigest}` по §11.3; исправление создаёт новый pair и optional `supersedesEvidenceRef`, а не редактирует старую запись in place.

### 9.3 Piece

```json
{
  "id": "piece-01",
  "kind": "sourced",
  "source": {
    "containerId": "c01",
    "revisionDigest": "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    "locations": [
      {"start": 0, "end": 4}
    ],
    "orientation": "forward"
  },
  "expectedSequenceDigest": "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
}
```

Piece является assembly-local snapshot node и не имеет собственного `revisionDigest`. `kind` — discriminated union `sourced`, `synthetic`, `planned`, `gap`.

Sourced piece имеет ровно один exact source container revision. Для linear source допустима одна contiguous location; для circular — одна location или две reference-forward locations, образующие один origin wrap. Ranges concatenated в записанном порядке, затем применяется global `orientation: "forward" | "reverse-complement"`. Multi-container или независимо ориентированные ranges MUST быть разделены на несколько pieces либо материализованы reaction output. `expectedSequenceDigest` MUST совпадать с resolved oriented sequence.

Synthetic piece:

```json
{
  "id": "piece-02",
  "kind": "synthetic",
  "name": "6xHis tail",
  "sequence": "CATCATCATCATCATCAT",
  "incorporation": "primer-tail",
  "expectedSequenceDigest": "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
}
```

`incorporation`: `standalone`, `primer-tail`. Sequence REQUIRED, non-empty и normalized DNA-IUPAC; source refs запрещены. Provider/order metadata хранится в synthesis reaction. Известный `gapSequence` сериализуется как synthetic, а не как gap.

Planned piece:

```json
{
  "id": "piece-03",
  "kind": "planned",
  "name": "future donor insert",
  "specification": {
    "length": {"kind": "range", "minimum": 700, "maximum": 900},
    "topology": "linear",
    "strandedness": "double"
  }
}
```

Length union: `{"kind":"unknown"}`, `{"kind":"exact","value":800}` или `{"kind":"range","minimum":700,"maximum":900}`. Planned piece запрещает sequence/source/digest и не является container.

Gap piece:

```json
{
  "id": "piece-04",
  "kind": "gap",
  "name": "unresolved linker",
  "length": {"kind": "exact", "value": 12},
  "reason": "unknown-sequence"
}
```

`reason`: `unknown-sequence`, `unknown-length`, `unresolved-design`. Sequence/source/digest запрещены; exact/range length MUST быть не меньше 1. Writer MUST NOT подставлять `N × length` как canonical sequence. Reachable planned/gap input удерживает reaction/assembly в `planned` и запрещает materialized simulated output.

Для sourced/synthetic `expectedSequenceDigest` вычисляется как SHA-256 JCS material:

```json
{"entityKind":"dna-sequence","digestSchemaVersion":"1","alphabet":"DNA-IUPAC","sequence":"NORMALIZED_SEQUENCE"}
```

Этот domain-separated digest называется `expectedSequenceDigest`; он не включает topology/strandedness/ends и поэтому применяется только к oriented piece/product sequence, а не как замена `moleculeDigest`.

### 9.4 Reaction

```json
{
  "id": "reaction-01",
  "kind": "golden-gate",
  "state": "simulated",
  "method": {
    "id": "bodgegene:golden-gate",
    "version": "1",
    "schemaDigest": null,
    "capability": null
  },
  "inputs": [
    {"kind": "piece", "id": "piece-01"}
  ],
  "outputs": [
    {"kind": "container", "id": "c-product", "revisionDigest": "sha256:3333333333333333333333333333333333333333333333333333333333333333"}
  ],
  "params": {
    "enzyme": {"registry": "gg", "enzyme": "BsaI"},
    "productTopology": "circular"
  },
  "connectionIds": ["connection-01"],
  "methodData": null,
  "engine": {
    "name": "BodgeGene assembly engine",
    "version": "development-engine",
    "databases": [
      {
        "id": "bodgegene:gg-db",
        "version": "development-db",
        "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    ]
  }
}
```

Core reaction kinds:

- `pcr`;
- `restriction`;
- `ligation`;
- `gibson`;
- `golden-gate`;
- `mutagenesis`;
- `synthesis`;
- `manual-edit`.

Canonical workflow mapping:

| Workflow | `kind` | пример `method.id` |
|---|---|---|
| ordinary/overlap PCR | `pcr` | `bodgegene:pcr`, `bodgegene:overlap-pcr` |
| restriction digest | `restriction` | `bodgegene:restriction-digest` |
| compatible-end/RE ligation | `ligation` | `bodgegene:ligation`, `bodgegene:restriction-ligation` |
| Gibson / SLIC | `gibson` | `bodgegene:gibson`, `bodgegene:slic` |
| Golden Gate / MoClo | `golden-gate` | `bodgegene:golden-gate`, `bodgegene:moclo` |
| KLD / site-directed mutagenesis | `mutagenesis` | `bodgegene:kld`, `bodgegene:site-directed-mutagenesis` |

Thin workflow variants MUST сохраняться в `method.id`, а не превращаться в новый core `kind` и не теряться при round-trip.

Каждая reaction является closed object с REQUIRED полями `id`, `kind`, `state`, `method`, `inputs`, `outputs`, `connectionIds`, `params`, `methodData`, `engine`. `state`: `planned | simulated`. `inputs` и `connectionIds` ordered; duplicates запрещены. `outputs` содержит только exact container refs. Planned reaction MAY иметь `outputs: []` и `engine: null`; simulated reaction MUST иметь non-empty outputs и non-null engine. Exact output refs уже разрешаются до `recordDigest`/`moleculeDigest`, поэтому отдельное дублирующее поле `expectedOutputDigests` запрещено.

`method` имеет exact shape `{id, version, schemaDigest, capability}`. `id` — stable namespaced identifier, `version` — non-empty string, `schemaDigest` — domain digest или `null`, `capability` — `null` либо `{id, criticality}`, где `criticality` равно `required | optional`. Root capability lists MUST быть точным union всех included method/asset/extension declarations по criticality. `kind` описывает понятный core transformation class; `method.id` различает конкретную chemistry внутри класса.

`engine` имеет exact shape `{name, version, databases}`. `databases[]` — set-like, ASCII-sorted по `id`, с records `{id, version, digest}`; digest REQUIRED, если database влияет на simulated output. Vague labels вроде `gg-db-current` без immutable version/digest запрещены.

Новая chemistry, укладывающаяся в core class, MAY использовать новый namespaced `method.id` без нового major format, если core `params` остаётся понятным. Method-specific extension хранится только в `methodData`: `null` для core method, либо opaque JSON value при non-null capability. Полностью новый transformation class использует `kind: "external"`, `params: {}`, non-null `methodData` и required capability. Архив не является доверенным источником schema или исполняемого кода: validation выполняется только встроенным/pinned `ChemistryRegistry`.

Если method неизвестен, но его core `kind`, inputs, outputs, params и product refs понятны и capability optional, reader MAY сохранить `methodData` opaque и показать generic reaction. Неизвестная required chemistry MUST блокировать normal hydration/write/recompute, но не isolated read-only core preview, inspection и GenBank extraction. Generic publication renderer MUST показывать как минимум kind, method ID/version, inputs, outputs и products.

Unknown optional method не делает bytes повреждёнными, но affected assembly не может получить Biological/Full conformance: validator возвращает `unsupported` capability с достигнутым Structural/Integrity level. Он MUST NOT угадывать params semantics.

`params` MUST проверяться closed discriminated JSON Schema по `kind`; additional properties запрещены. Refs на ordered inputs используют zero-based `inputIndex`, а не дублируют mutable IDs. Exact core union:

- `pcr`: `{mode, primerPairId, templateSegments, productTopology, polymerase}`. `mode` — `standard | overlap | self-closure`; `templateSegments[]` ordered items `{inputIndex, locations, orientation}`; `orientation` — `forward | reverse-complement`; `polymerase` — `{id, version}` или `null`. Standard имеет один template input, overlap MAY иметь несколько, self-closure требует compatible circular template context. Product range выводится только из этих segments + exact primer tails.
- `restriction`: `{enzymes, digestMode, expectedCuts}`. `enzymes[]` ordered refs `{registry:"re", enzyme}`; `digestMode` — `simultaneous | sequential | unspecified`; `expectedCuts[]` ordered items `{inputIndex, enzymeIndex, topBoundary, bottomBoundary}` в 0-based boundary coordinates. Registry `gg` запрещён.
- `ligation`: `{productTopology, compatibilityPolicy}`. `compatibilityPolicy` MUST быть `strict`; joining interfaces задаются owned `connectionIds`. Restriction cloning и direct compatible-end ligation различаются `method.id`, но не смешивают RE/GG registries.
- `gibson`: `{productTopology}`; overlap sequences задаются owned connections. SLIC использует тот же kind с другим `method.id`.
- `golden-gate`: `{enzyme, productTopology}` с `enzyme.registry:"gg"`; каждый owned connection обязан повторять тот же enzyme и exact fusion site. MoClo использует другой `method.id`. Registry `re` запрещён.
- `mutagenesis`: `{templateInputIndex, primerPairId, edits, dpniDigest, productTopology}`. KLD выражается `method.id`, требует circular backbone context и phosphorylated primer requirements. `edits[]` использует typed edit union ниже.
- `synthesis`: `{specification, provider}`. Specification — `{kind:"exact", expectedMoleculeDigest}` либо planned length/topology/strandedness specification из §9.3; `provider` — `null` или `{name, catalogId}`.
- `manual-edit`: `{parentInputIndex, edits}` с non-empty typed edit union.
- `external`: `{}`; вся unsupported method-specific data находится в `methodData`, capability MUST быть required.

Typed sequence edit union использует canonical coordinates исходного input: substitution `{kind:"substitute", start, end, sequence}`, insertion `{kind:"insert", boundary, sequence}`, deletion `{kind:"delete", start, end}`, reverse-complement `{kind:"reverse-complement", start, end}` и physical-state change `{kind:"set-physical-state", topology, strandedness, ends}`. Edits применяются строго в записанном порядке; каждый следующий coordinate относится к результату предыдущего edit. Empty/no-op edits запрещены. Feature remapping является deterministic engine output и проверяется по exact output record, но не кодируется arbitrary callback/script.

### 9.5 Connection

```json
{
  "id": "connection-01",
  "reactionId": "reaction-01",
  "left": {"pieceId": "piece-01", "end": "right"},
  "right": {"pieceId": "piece-02", "end": "left"},
  "chemistry": {
    "kind": "golden-gate",
    "enzyme": {"registry": "gg", "enzyme": "BsaI"},
    "fusionSite": "AATG"
  }
}
```

Connection является closed object `{id, reactionId, left, right, chemistry}`. `reactionId` REQUIRED; reaction обязана перечислить ID в `connectionIds`, и reciprocal ownership MUST совпадать один-в-один. Один connection принадлежит ровно одной reaction. Endpoint имеет exact `{pieceId, end:"left"|"right"}`; self-end и повторное использование одного endpoint в той же reaction запрещены, кроме отдельного validated self-closure method.

`chemistry` является closed union:

- overlap: `{kind:"overlap", overlapSequence}` с non-empty exact DNA-IUPAC sequence;
- Golden Gate: `{kind:"golden-gate", enzyme:{registry:"gg", enzyme}, fusionSite}`;
- ligation: `{kind:"ligation", mode:"restriction"|"direct", enzymes, leftEnd, rightEnd, scarSequence}`. `enzymes[]` содержит только `{registry:"re", enzyme}` и MAY быть пустым только для direct ligation; `leftEnd`/`rightEnd` используют identity end shape §10.4 без `generatedBy`; `scarSequence` — DNA-IUPAC string, включая `""` для blunt seamless join.

Unknown/ambiguous overhang не даёт strict simulated join. Compatibility и output sequence пересчитываются из endpoint material + chemistry и обязаны совпасть с output record. Validation status/warning/UI choice являются derived diagnostics и MUST NOT сериализоваться в connection.

`connections` — единственное каноническое представление стыков. UI maps и legacy junction maps MUST выводиться из него, а не сериализоваться как параллельная биология.

### 9.6 Graph invariants

Full validator MUST проверить:

- глобальную уникальность IDs внутри assembly;
- существование всех refs и совпадение `revisionDigest`;
- отсутствие orphan input/output/connection refs;
- reciprocal one-owner relation reaction `connectionIds` ↔ `connection.reactionId` и уникальность piece endpoints внутри joining reaction;
- не более одного producer для materialized output revision;
- ацикличность reaction dependency graph;
- соответствие output topology и physical ends результату операции;
- совместимость стыкуемых ends/overlaps/fusion sites;
- существование primer и primer-pair refs;
- совпадение `expectedSequenceDigest` с выбранной source slice;
- согласованность exact `productRefs` с output revisions; verification status в assembly не сериализуется;
- отсутствие materialized simulated output, transitively зависящего от `planned` или `gap`.

Кольцевая молекула является topology продукта и не считается циклом reaction graph.

## 10. Provenance и digest

### 10.1 Digest representation

Domain digest записывается как:

```text
sha256:<64 lowercase hex characters>
```

Manifest `assets[*].sha256` хранит только hex, поскольку алгоритм уже задан именем поля.

Все canonical JSON digests MUST использовать JSON Canonicalization Scheme RFC 8785 после Unicode NFC normalization строк и нормализации line endings к LF. Поля digest, которые вычисляются, исключаются из собственного digest material.

### 10.2 `assetDigest`

`assets[path].sha256` — digest точных uncompressed bytes. Он обнаруживает повреждение или подмену bytes относительно manifest, но не подтверждает автора manifest.

### 10.3 `recordDigest`

`recordDigest` идентифицирует полное semantic state container независимо от ZIP path и history claims. Для `digestSchemaVersion: "1"` digest material имеет форму:

```json
{
  "entityKind": "container-record",
  "schemaVersion": "2.0.0",
  "digestSchemaVersion": "1",
  "id": "c01",
  "name": "pET-28b",
  "description": "Expression vector",
  "alphabet": "DNA-IUPAC",
  "strandedness": "double",
  "topology": "circular",
  "sequence": "ATGC",
  "ends": null,
  "features": [],
  "origin": {"kind": "manual"}
}
```

Из asset исключаются `$schema`, `recordDigest`, `moleculeDigest`, asset paths/hashes, provenance/events, head selection, UI и packaging timestamps. `name` и `description` включаются: их изменение создаёт новый record state, хотя `moleculeDigest` остаётся прежним. Поле `provenanceRef` в record запрещено, потому archive locator не должен менять semantic identity.

### 10.4 `moleculeDigest`

`moleculeDigest` используется для сравнения биологической молекулы и поиска duplicate/grouping candidates. Он не включает name, features, provenance и timestamps и сам по себе не разрешает автоматическое слияние.

Для `digestSchemaVersion: "1"` material является exact object:

```json
{
  "entityKind": "dna-molecule",
  "schemaVersion": "2.0.0",
  "digestSchemaVersion": "1",
  "alphabet": "DNA-IUPAC",
  "strandedness": "double",
  "topology": "linear",
  "sequence": "ATGC",
  "ends": {
    "kind": "double-stranded",
    "left": {
      "type": "blunt",
      "overhang": "",
      "phosphorylated": {"reference": null, "complement": null}
    },
    "right": {
      "type": "blunt",
      "overhang": "",
      "phosphorylated": {"reference": null, "complement": null}
    }
  }
}
```

Identity projection physical ends включает только `kind`, `type`/`terminus`, `overhang` и phosphorylation. `generatedBy` исключён: способ получения конца является record/provenance metadata, а не биологической идентичностью.

Canonicalization matrix:

| Topology/strandedness | Canonical sequence |
|---|---|
| `circular + double` | лексикографический минимум среди всех rotations sequence и всех rotations strict DNA-IUPAC reverse complement |
| `circular + single` | минимум только среди rotations sequence; reverse complement — другая молекула |
| `circular + unknown` | минимум только среди rotations sequence; digest не может обосновать verification pass |
| `linear` или `unknown topology` | stored orientation без rotation/reverse-complement equivalence |

Для circular material `ends` MUST быть `null`; для unknown topology — `{"kind":"unknown"}`; для linear material используется identity projection exact stored ends. Ambiguous IUPAC symbols участвуют в digest буквально, а не как набор автоматически подставленных bases: `R != A`, `R != G`, `N` не wildcard. Core validator MUST сначала потребовать non-empty uppercase ASCII `[ACGTRYSWKMBDHVN]+`; он не удаляет whitespace/invalid symbols, не преобразует `U→T` и не использует tolerant search/import normalizers. Import adapter MAY uppercase/remove format whitespace только с явным normalization report до создания canonical record. Sequence длины 1 допустима.

Strict DNA-IUPAC complement table фиксирован: `A↔T`, `C↔G`, `R↔Y`, `S↔S`, `W↔W`, `K↔M`, `B↔V`, `D↔H`, `N↔N`. Reverse complement сначала меняет символы по этой таблице, затем разворачивает ASCII sequence; locale/Unicode rules не участвуют.

Minimum rotation сравнивается по ASCII bytes и MUST вычисляться за `O(n)` (Booth/Duval или эквивалент), без materialization всех rotations. Tie-break для diagnostics: canonical string, затем stored orientation перед reverse-complement, затем минимальный offset. Canonicalization применяется только к digest material и не вращает/отражает stored record, features или coordinates.

`moleculeDigest` MAY использоваться только как duplicate candidate/grouping key, а не как автоматическое слияние container IDs, revisions или evidence. Он описывает canonical molecular specification, но не sample/aliquot, methylation, supercoiling, nicks, heteroduplex, concentration, purity или host. Sequence-only hash для grouping запрещён; при совпадении molecule digest и расхождении record digest merge требует явной политики.

### 10.5 `revisionDigest`

`revisionDigest` идентифицирует record state в конкретной lineage, но не автора, время или приватное описание действия. Material:

```json
{
  "entityKind": "container-revision",
  "digestSchemaVersion": "1",
  "containerId": "c01",
  "recordDigest": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "parentRevisionRefs": [
    {
      "containerId": "c01",
      "revisionDigest": "sha256:1111111111111111111111111111111111111111111111111111111111111111"
    }
  ]
}
```

Parents MUST быть уникальны и отсортированы по `(containerId, revisionDigest)` до JCS. Cross-container parent допустим для fork/variant. Изменение record или parent set меняет digest. Revert MAY повторно использовать прежний record asset, но получает новую revision из-за нового parent. Activity, agent, timestamp, head и asset paths в material запрещены.

### 10.6 `eventDigest`

`eventDigest` идентифицирует provenance claim: subject revision, activity, agent, time и optional superseded claim. Exact material:

```json
{
  "entityKind": "provenance-event",
  "digestSchemaVersion": "1",
  "supersedesEventDigest": null,
  "subject": {
    "containerId": "c01",
    "revisionDigest": "sha256:2222222222222222222222222222222222222222222222222222222222222222"
  },
  "activity": {"kind": "manual-create"},
  "occurredAt": "2026-07-13T10:00:00Z",
  "agentRef": "person-igor"
}
```

Материал содержит все и только перечисленные event fields, кроме вычисляемого `eventDigest`, и сериализуется по §16.3 без LF. Event immutable; исправление создаёт новый event, не переписывая старый. `supersedesEventDigest` является weak historical ref: если target включён, он MUST совпасть; self-ref и cycle запрещены; filtered profile MAY не включать target. Одна revision MAY иметь несколько independent claims. Удаление private events из `public-supp` не меняет `recordDigest` или `revisionDigest`.

### 10.7 `projectContentDigest`

Writer строит domain-separated material после применения export profile:

```json
{
  "entityKind": "project-content",
  "digestSchemaVersion": "1",
  "fileFormatVersion": "2.0.0",
  "exportProfile": "full",
  "requiredCapabilities": [],
  "optionalCapabilities": [],
  "assets": []
}
```

`assets` — ASCII-path-sorted descriptors `{path, kind, role, schemaVersion, size, sha256, mediaType, required, generatedFrom, capability, generator}`; неприменимый `schemaVersion` представлен `null`, а descriptor `capability`/`generator` уже имеют explicit null. Включаются canonical и independent opaque project content, включая selected attachments, sources и extensions. Packaging field `compression` не входит. Исключаются:

- manifest и recovery;
- projections и derived assets;
- detached signature asset;
- attestation role;
- `ui/layout.json`;
- packaging timestamps.

SHA-256 UTF-8 JCS bytes этого object без завершающего LF является `projectContentDigest`. Одинаковый canonical state даёт одинаковый digest только при одинаковых export profile, capability sets и selected opaque payload set.

### 10.8 `archivePayloadDigest`

`archivePayloadDigest` связывает весь распространяемый payload, включая canonical, opaque, projection, derived и `ui-layout`, но исключает detached signature. Material:

```json
{
  "entityKind": "archive-payload",
  "digestSchemaVersion": "1",
  "signature": "BODGE-V2",
  "fileFormatVersion": "2.0.0",
  "createdBy": {
    "name": "BodgeGene",
    "version": "development-build",
    "engineVersion": "development-engine"
  },
  "exportProfile": "full",
  "project": "project.json",
  "requiredCapabilities": [],
  "optionalCapabilities": [],
  "extensions": {},
  "attestation": null,
  "projectContentDigest": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "assets": []
}
```

`assets` использует тот же normalized descriptor material, но включает все manifest assets, кроме role `attestation`. Поле `attestation` самого material связывает ожидаемые path/algorithm/key ID без включения signature bytes и устраняет hash cycle. `compression` и ZIP metadata исключены; изменение GenBank/README/Methods/TSV/PNG/UI меняет `archivePayloadDigest`, а compression-only repack — нет.

### 10.9 Порядок вычисления без hash cycles

Writer MUST соблюдать следующий dependency DAG; независимые ветви MAY вычисляться параллельно, но результат обязан соответствовать этому порядку зависимостей:

1. после profile filtering stage selected opaque attachment/source/extension bytes и вычислить их exact size/SHA-256; embedded source SHA MUST быть известен до source identity;
2. вычислить `sourceRecordDigest` каждого retained source record;
3. нормализовать container records, вычислить `moleculeDigest`, затем `recordDigest`;
4. разрешить sourced/synthetic piece sequences и вычислить `expectedSequenceDigest` до assembly serialization;
5. вычислить revision cores/topological `revisionDigest`, затем provenance `eventDigest` с уже известными source refs;
6. вычислить `evidenceDigest` после exact subject/observed/source refs;
7. сериализовать canonical project/records/assemblies/provenance/primers/notebook/evidence/refs/extension envelopes, затем projections/derived assets;
8. вычислить size/SHA-256 всех оставшихся non-attestation assets и собрать final descriptors;
9. вычислить filtered `projectContentDigest`;
10. если запрошено подписание, до payload digest выбрать и зафиксировать attestation declaration `{path,algorithm,keyId}`; иначе зафиксировать `null`;
11. вычислить `archivePayloadDigest` с этой declaration;
12. создать optional signature envelope/bytes/SHA-256, затем final manifest bytes и recovery index.

Record/revision/evidence digest MUST NOT зависеть от asset path/hash, кроме явно включённого source byte digest внутри source record. Signature bytes не входят ни в один signed digest.

### 10.10 Optional signature

Detached signature MAY храниться как listed asset `signatures/project-content.ed25519`. Asset является JCS+LF JSON envelope с trusted core schema:

Если signature присутствует, `manifest.attestation` REQUIRED и имеет exact shape `{path:"signatures/project-content.ed25519", algorithm:"Ed25519", keyId:"sha256:..."}`. Если signature отсутствует, значение MUST быть `null`. Path/algorithm/key ID включаются в `archivePayloadDigest`; envelope обязан им совпадать. Listed signature descriptor имеет `kind: "signature"`, `role: "attestation"`, `required: true`, `schemaVersion: "2.0.0"` и `generatedFrom: []`.

```json
{
  "$schema": "https://bodgegene.dev/schema/2.0.0/signature.json",
  "schemaVersion": "2.0.0",
  "algorithm": "Ed25519",
  "keyId": "sha256:fd185b8e6168ebe29c8fd19c623a4d3a9cca6da5f33fcee7008db863d025b7b9",
  "publicKey": "uPuH-d84qrQHLsikNUm7jjThNllSqbVBJm5bmw1yDnI",
  "statement": {
    "signatureSchemaVersion": "1",
    "fileFormatVersion": "2.0.0",
    "exportProfile": "full",
    "requiredCapabilities": [],
    "optionalCapabilities": [],
    "projectContentDigest": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "archivePayloadDigest": "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
  },
  "signature": "CoPdo3JqKgHT36NpOTULvzr8HpqnVa9NvIFZQi_fjy4xQVhrwrsKRbjXJFo9hs1Pab3iinMmynbbBYZql5gaDA"
}
```

Показанные `publicKey`, `keyId` и `signature` образуют verification vector для показанного statement. `keyId` MUST быть SHA-256 raw public key bytes. `publicKey` и `signature` используют unpadded RFC 4648 base64url без whitespace и после decode имеют ровно 32 и 64 bytes. Algorithm означает pure Ed25519 из RFC 8032, не Ed25519ph/ctx. Non-canonical base64url, wrong length, small-order/invalid public key или failed verification являются signature error. `signature` проверяется над UTF-8 JCS bytes exact `statement` без LF. Statement имеет форму:

```json
{
  "signatureSchemaVersion": "1",
  "fileFormatVersion": "2.0.0",
  "exportProfile": "full",
  "requiredCapabilities": [],
  "optionalCapabilities": [],
  "projectContentDigest": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "archivePayloadDigest": "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
}
```

Signature asset исключён из обоих signed digests, что устраняет cycle. Изменение canonical/opaque/derived/projection bytes, profile или capability sets после подписания делает signature invalid.

Наличие public key в архиве не делает его доверенным. UI MUST различать криптографическую validity и trust: `valid-known-key`, `valid-unknown-key`, `invalid`, `unsigned`. Собственная PKI форматом не определяется. Удаление signature вместе с изменением manifest до `attestation:null` является downgrade к честно unsigned archive и не может быть предотвращено самодостаточным файлом; consumer, которому authenticity обязательна, MUST out-of-band требовать ожидаемый known `keyId`/signature policy и считать unsigned результат отказом.

## 11. Design states и claim-scoped проверка конечного продукта

### 11.1 Container provenance

`provenance/containers/<id>.json`:

```json
{
  "$schema": "https://bodgegene.dev/schema/2.0.0/container-provenance.json",
  "schemaVersion": "2.0.0",
  "digestSchemaVersion": "1",
  "containerId": "c01",
  "mode": "full",
  "headRevisionDigest": "sha256:2222222222222222222222222222222222222222222222222222222222222222",
  "revisions": [
    {
      "revisionDigest": "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      "recordDigest": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "parentRevisionRefs": []
    }
  ],
  "events": [
    {
      "eventDigest": "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "supersedesEventDigest": null,
      "subject": {
        "containerId": "c01",
        "revisionDigest": "sha256:2222222222222222222222222222222222222222222222222222222222222222"
      },
      "activity": {
        "kind": "manual-create"
      },
      "occurredAt": "2026-07-13T10:00:00Z",
      "agentRef": "person-igor"
    }
  ],
  "externalRevisionRefs": []
}
```

Каждая revision immutable. Revision node содержит только `revisionDigest`, `recordDigest` и `parentRevisionRefs`; activity/time/agent живут только в `events`. `containerId` — mutable identity, `recordDigest` — record state, `revisionDigest` — state в lineage, `eventDigest` — claim о его происхождении.

При сериализации `revisions` сортируются по `revisionDigest`, `events` — по `eventDigest`, `externalRevisionRefs` — по `(containerId, revisionDigest, reason)`. Это presentation order; topological validation выполняется независимо.

`mode`: `full` или `identity-only`. В `identity-only` events MAY отсутствовать. Parent revision MUST существовать в объединённом provenance graph архива либо быть перечислен в `externalRevisionRefs` с причиной `external` или `profile-omitted`. Глобальный parent graph, включая cross-container refs, MUST быть ацикличным.

Для каждой revision reader выводит record path `containers/<containerId>/records/<recordDigestHex>.json` и проверяет filename, embedded `recordDigest` и bytes. Один `revisionDigest` не может обозначать разные core payloads.

`headRevisionDigest` — mutable archive-local pointer и не входит в revision identity. Head revision MUST существовать в slice, её record MUST совпадать с `containers/<id>.json`, top-level GenBank MUST быть получен из того же record, а `project.refs.containers` MUST указывать этот head. При filtered export с несколькими revisions одного ID writer требует explicit primary revision; неоднозначность даёт `PROFILE_HEAD_AMBIGUOUS`.

Смена head или revert MUST NOT автоматически удалять historical record, на который ссылается revision, assembly, evidence или selected export. Garbage collection допустим только после доказательства отсутствия всех strong refs во всём project graph.

Core `activity` является closed union:

- `{kind:"manual-create"}`;
- `{kind:"manual-edit", operations:[...]}` с тем же typed edit union, что `manual-edit` reaction;
- `{kind:"import", sourceRef:{id, sourceRecordDigest}}`;
- `{kind:"observation", sourceRef:{id, sourceRecordDigest}}`;
- `{kind:"reaction-output", assemblyId, reactionId, expectedMoleculeDigest}`;
- `{kind:"revert", targetRevisionDigest}`;
- `{kind:"other", method:{id, version, capability}, payloadDigest}`.

Refs MUST разрешаться; arrays ordered, где они описывают операцию. `payloadDigest`/`expectedMoleculeDigest` используют domain digest representation. `other` не содержит arbitrary executable payload: capability declaration следует правилам §5.1. Если activity заявлена replayable, она MUST содержать полный typed operation и expected output digest. Неполная заметка MUST NOT называться replayable commit.

`events[].agentRef` REQUIRED как creator ID или `null`; каждый non-null ref MUST разрешаться в `project.creators[].id`. Profile, сохраняющий event, обязан сохранить referenced creator; public/custom-public slice допускает только `visibility:"public"`. Identity-only provenance удаляет events целиком и поэтому не оставляет dangling agent refs.

### 11.2 Design states и assertions

- `planned` — намерение; materialized result может не существовать даже in silico;
- `simulated` — движок получил конкретный expected result и закрепил output revision/digest.

Факт выполнения лабораторного маршрута не является третьим design state. Для публикационного binding используется `constructionAssertion: design-only | reported-performed`. `reported-performed` является утверждением автора и MUST отображаться как reported, а не independently verified.

Product verification — derived UI state по exact evidence: `not-checked`, `matches-expected`, `differs`, `inconclusive`. Он не сериализуется в assembly/reaction и не переносится на новую revision автоматически.

### 11.3 Evidence record

`evidence/<evidenceId>.json`:

```json
{
  "$schema": "https://bodgegene.dev/schema/2.0.0/evidence.json",
  "schemaVersion": "2.0.0",
  "digestSchemaVersion": "1",
  "id": "evidence-01",
  "evidenceDigest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "supersedesEvidenceRef": null,
  "kind": "whole-plasmid-sequence-comparison",
  "subject": {
    "kind": "container",
    "id": "c-product",
    "revisionDigest": "sha256:3333333333333333333333333333333333333333333333333333333333333333"
  },
  "scope": {"kind": "whole-molecule"},
  "performedAt": "2026-07-13T11:30:00Z",
  "agentRef": "person-igor",
  "assessmentMode": "computed",
  "method": {
    "id": "bodgegene:whole-plasmid-comparator",
    "version": "development",
    "parametersDigest": null,
    "capability": null
  },
  "payload": {
    "kind": "whole-plasmid-sequence-comparison",
    "observed": {
      "kind": "container",
      "id": "c-observed-clone",
      "revisionDigest": "sha256:4444444444444444444444444444444444444444444444444444444444444444"
    },
    "inputLevel": "consensus",
    "platform": "nanopore",
    "comparison": {
      "mode": "circular-aware",
      "expectedMoleculeDigest": "sha256:5555555555555555555555555555555555555555555555555555555555555555",
      "observedMoleculeDigest": "sha256:5555555555555555555555555555555555555555555555555555555555555555",
      "status": "matches-expected",
      "fullLength": true,
      "truncated": false,
      "unresolvedPositions": 0,
      "variants": []
    }
  },
  "attachments": [],
  "result": "pass",
  "summary": "Provided whole-plasmid consensus matches the design"
}
```

Core evidence kinds: `whole-plasmid-sequence-comparison`, `sanger-verification`, `restriction-analysis`, `gel-observation`, `sequence-alignment`, `manual-review`, `other`. Evidence object и каждый payload branch закрыты.

Общий envelope REQUIRED содержит только `$schema`, `schemaVersion`, `digestSchemaVersion`, `id`, `evidenceDigest`, `supersedesEvidenceRef`, `kind`, `subject`, `scope`, `performedAt`, `agentRef`, `assessmentMode`, `method`, `payload`, `attachments`, `result`, `summary`:

- `performedAt` — RFC 3339 UTC; `agentRef` MUST разрешаться в `project.creators[].id`;
- `assessmentMode` — `computed | reported`; reported MUST отображаться как author/vendor report и не может притворяться independently computed;
- `method` имеет exact shape `{id, version, parametersDigest, capability}`. `id` — namespaced method ID, `version` — непустая string, `parametersDigest` — domain digest или `null`, `capability` — `null` либо `{id, criticality}` по §5.1. Core methods используют `capability:null`; unknown `other` MUST объявить capability;
- `attachments` — ASCII-sorted unique attachment-ID strings. Любой attachment ID внутри payload MUST также присутствовать здесь; refs, встречающиеся только в общем массиве, являются supporting material и не расширяют scope;
- `result` — `pass | fail | inconclusive`; `summary` — string. Результат относится только к записанным subject/scope/method.

`subject` является union:

- container `{kind:"container", id, revisionDigest}`;
- assembly `{kind:"assembly", id}`;
- connection `{kind:"connection", assemblyId, id}`.

`scope` является union:

- `{kind:"whole-molecule"}` — только для container subject;
- `{kind:"regions", locations:[...]}` — non-empty ordered canonical locations §7.5–7.6 на container subject;
- `{kind:"junctions", connectionIds:[...]}` — non-empty unique ASCII-sorted IDs на assembly/connection subject; для connection subject set содержит ровно его ID;
- `{kind:"property", propertyId}` — namespaced property ID.

`kind` MUST совпадать с `payload.kind`. Exact payload branches:

- `whole-plasmid-sequence-comparison`: `{kind, observed, inputLevel, platform, comparison}`. `observed` — exact container ref; `inputLevel` — `consensus | raw-derived`; `platform` — non-empty string или `null`; `comparison` — `{mode:"circular-aware", expectedMoleculeDigest, observedMoleculeDigest, status, fullLength, truncated, unresolvedPositions, variants}`. Status — `matches-expected | differs | inconclusive`, booleans explicit, unresolved positions — non-negative safe integer. Subject/scope и pass rules следуют §11.4.
- `sanger-verification`: `{kind, primerRef, readDirection, traceAttachmentId, alignedRegions}`. `primerRef` — `{id}` exact project primer; direction — `forward | reverse | unknown`; `traceAttachmentId` — attachment ID или `null`; `alignedRegions` — non-empty ordered `{location, coverageFraction, identityFraction}`. Fractions — finite JSON numbers `0..1`. Scope только `regions | junctions`; non-null trace ID MUST входить в common attachments.
- `restriction-analysis`: `{kind, enzymeRefs, expectedFragmentSizes, observedFragmentSizes, tolerance}`. Enzymes — non-empty unique ASCII-sorted `{registry:"re", enzyme}`; sizes — ascending positive safe integers; tolerance — `{kind:"absolute-bp", value}` с non-negative safe integer либо `{kind:"relative-fraction", value}` с finite number `0..1`. Scope `whole-molecule | property`, но результат не создаёт whole-sequence match.
- `gel-observation`: `{kind, gelAttachmentId, laneId, expectedBands, observedBands, tolerance}`. Attachment ID и non-empty lane ID REQUIRED; band arrays — ascending positive safe integers; tolerance имеет ту же union, что restriction analysis. Gel ID MUST входить в common attachments; `assessmentMode` обычно reported, но computed допустим только при versioned method.
- `sequence-alignment`: `{kind, observed, targetLocations, coverageFraction, identityFraction, variants}`. `observed` — exact container ref либо `{kind:"source", id, sourceRecordDigest}`; target locations non-empty/ordered; fractions `0..1`; variants используют форму ниже. Scope только `regions | junctions`; whole consensus обязан использовать отдельный whole-plasmid kind.
- `manual-review`: `{kind, criteria}` с non-empty ordered closed items `{id, label, outcome, note}`; IDs unique, outcome — `pass | fail | not-assessed`, note — string или `null`. `assessmentMode` MUST быть `reported`; whole-molecule publication pass запрещён.
- `other`: `{kind:"other", payloadDigest}`. Method ID namespaced, `capability` non-null, произвольные bytes находятся только в listed attachment/extension, а не в core JSON. Unknown semantics не даёт whole-molecule pass.

Variant item имеет exact fields `{kind, expectedLocation, insertionBoundary, expected, observed}`. `kind` — `substitution | insertion | deletion | complex`; strings — uppercase DNA-IUPAC. Для insertion `expectedLocation:null`, boundary — non-negative safe integer, expected `""`, observed non-empty. Для остальных location REQUIRED, boundary `null`; deletion имеет non-empty expected и observed `""`, substitution — одинаковые non-zero lengths, complex покрывает остальные full-comparison edits. `variants[]` является set-like: duplicates запрещены, items сортируются лексикографически по UTF-8 JCS bytes normalized item; segment order внутри circular cross-origin location остаётся biological.

Type IIS enzymes не допускаются в `restriction-analysis.registry: re`; Golden Gate-specific observation использует `other`/namespaced method. Passing regional/junction/property evidence MUST NOT давать whole-molecule status. AB1, PDF, фотография геля или заметка сами по себе не меняют design state и не расширяют scope.

`evidenceDigest` — SHA-256 JCS без LF от domain-separated object с `entityKind:"evidence-record"` и всеми envelope fields, кроме `$schema` и вычисляемого `evidenceDigest`; `schemaVersion` и `digestSchemaVersion` включаются. Поэтому omission supporting attachment bytes не меняет evidence identity, а изменение attachment ID, subject, method, payload, result или summary меняет digest. Asset path ID, embedded `id`, `project.refs.evidence` и publication evidence ref MUST совпадать.

Evidence immutable по `(id, evidenceDigest)`. Исправление создаёт новый ID/digest и `supersedesEvidenceRef:{id,evidenceDigest}`; referenced record нельзя менять in place. Supersedes ref weak: self/cycle запрещены, а при наличии target оба поля обязаны совпасть; filtered profile MAY не включать target. Container/source refs MUST разрешаться до exact immutable records, comparison digests MUST совпадать с resolved subject/observed molecules. Evidence остаётся валидным для старой expected revision; `stale` относительно текущего head является derived UI relation, а не свойством или ошибкой evidence.

### 11.4 Whole-plasmid sequence comparison

Observed consensus MUST быть отдельным canonical container revision с закрытым origin kind, exact source linkage в provenance и отдельным container ID. Он MUST NOT перезаписывать expected product. При отличии приложение MAY предложить создать явную child-version, но не делает это автоматически.

Для circular double-stranded DNA exact match определяется равенством `moleculeDigest` из §10.4, уже инвариантного к rotation и reverse complement. `result: pass` допустим только при `assessmentMode:"computed"`, когда topology/strandedness известны и совместимы, обе sequences full-length и ACGT-only, molecule digests равны, unresolved IUPAC positions равны нулю, comparison не был truncated и `variants:[]`.

`payload.comparison.status` имеет ровно `matches-expected`, `differs`, `inconclusive` и MUST согласовываться с `result` как `pass`, `fail`, `inconclusive` соответственно.

Доказанное полноразмерное отличие совместимых ACGT-only molecules даёт `result: fail`, `payload.comparison.status: differs`, разные molecule digests и non-empty normalized variants. Partial sequence, gaps, ambiguity, unknown topology/strandedness, resource timeout или недостаточный input дают `inconclusive`. Identity threshold не может превратить одну подтверждённую variant в pass.

Raw FASTQ/BAM/POD5 не требуются для consensus-level pass и MAY храниться только как supporting attachments/profile `full`. `payload.inputLevel` MUST показывать `consensus` или `raw-derived`; `payload.platform` является string или `null`, а comparator algorithm/version фиксируется common `method`. Если результат перенесён из vendor report без consensus, assessment MUST быть помечен как reported и не может притворяться independently computed.

Формулировка pass ограничивается утверждением: «предоставленный whole-plasmid consensus совпадает с ожидаемой молекулой». Она не подтверждает маршрут сборки, sample purity, minor subclones, функцию или качество не включённых raw reads.

Если несколько comparison records конфликтуют, UI MUST показать конфликт. `project.json.publication.products[].verificationEvidenceRef` явно выбирает exact `(id,evidenceDigest)` для конкретного supplement; автоматический выбор «лучшего» запрещён.

## 12. Primers, notebook и attachments

### 12.1 Primer pool

`primers/pool.json`:

```json
{
  "$schema": "https://bodgegene.dev/schema/2.0.0/primers.json",
  "schemaVersion": "2.0.0",
  "projectId": "project-01",
  "primers": [
    {
      "id": "primer-fwd",
      "name": "insert_F",
      "description": null,
      "sequence": "GGTCTCAATGC",
      "bindingSequence": "AATGC",
      "tail": "GGTCTC",
      "direction": "forward",
      "modifications": [],
      "status": "designed",
      "tags": [],
      "notes": "",
      "origin": {
        "kind": "designed",
        "assemblyId": "a01",
        "reactionId": "reaction-01"
      },
      "createdAt": "2026-07-13T10:00:00Z"
    },
    {
      "id": "primer-rev",
      "name": "insert_R",
      "description": null,
      "sequence": "GGTCTCTTGCA",
      "bindingSequence": "TTGCA",
      "tail": "GGTCTC",
      "direction": "reverse",
      "modifications": [],
      "status": "designed",
      "tags": [],
      "notes": "",
      "origin": {
        "kind": "designed",
        "assemblyId": "a01",
        "reactionId": "reaction-01"
      },
      "createdAt": "2026-07-13T10:00:00Z"
    }
  ],
  "pairs": [
    {
      "id": "pair-01",
      "name": "insert amplification",
      "forwardPrimerId": "primer-fwd",
      "reversePrimerId": "primer-rev",
      "expectedAmpliconLength": 812,
      "notes": ""
    }
  ]
}
```

Root fields `$schema`, `schemaVersion`, `projectId`, `primers`, `pairs` REQUIRED. `projectId` MUST совпадать с `project.json.id`. `primers[]` и `pairs[]` сортируются по ASCII `id`; IDs уникальны во всём pool, чтобы typed ref нельзя было разрешить двояко.

Каждый primer является закрытым object с REQUIRED полями `id`, `name`, `description`, `sequence`, `bindingSequence`, `tail`, `direction`, `modifications`, `status`, `tags`, `notes`, `origin`, `createdAt`:

- `name` — непустая string; `description` — string или `null`;
- `sequence`, `bindingSequence` и `tail` — uppercase DNA-IUPAC без whitespace; `bindingSequence` MUST быть непустой, `tail` MAY быть `""`, а `sequence` MUST быть точной конкатенацией `tail + bindingSequence`;
- обе строки записаны как собственная 5′→3′ sequence олиго. Для reverse primer `bindingSequence` является reverse complement target site, а не строкой target strand;
- `direction`: `forward`, `reverse`, `none`. Это intended-use metadata; роль в конкретной паре задают pair fields и имеет приоритет;
- `status`: `imported`, `designed`, `ordered`, `received`, `archived`;
- `tags` — уникальный UTF-8/NFC-sorted string set; `notes` — string;
- `createdAt` — RFC 3339 UTC или `null`.

`origin` является closed union: `{kind:"manual"}`, `{kind:"imported", sourceRef:{id,sourceRecordDigest}|null}` или `{kind:"designed", assemblyId, reactionId}`. Designed refs MUST разрешаться в проекте; imported non-null ref является exact pair и MUST разрешаться в `project.sources`. Если filtered profile не включает этот exact source record, writer MUST детерминированно проецировать только primer origin в `{kind:"imported",sourceRef:null}` и отразить omission в loss/privacy report; retarget на sanitized source запрещён. Это не меняет physical primer identity, но меняет filtered primer-pool asset и project digest. Runtime/global-library поля `projectId` на отдельном primer, `resourceHash`, `boundContainers`, UI selection и database timestamps в canonical primer record запрещены.

Modification record имеет exact shape `{position, modificationId, vendorCode}`. `modificationId` — namespaced registry identifier; `vendorCode` — `null` либо `{vendor, code}`. `position` является одним из `{kind:"five-prime"}`, `{kind:"three-prime"}`, `{kind:"base", index}` или `{kind:"between", boundary}`. `index` — 0-based base coordinate; internal `boundary` удовлетворяет `1 <= boundary < sequence.length`. Modifications сортируются по `(position order, index/boundary, modificationId, vendor, code)`, duplicates запрещены. Один и тот же full oligo с разными modifications — разные physical primer identities.

Optional `calculations[]` хранит только воспроизводимые derived values в форме `{kind, value, unit, method, parametersDigest}`. `kind` — `melting-temperature`, `gc-fraction` либо namespaced identifier; `method` REQUIRED как `{id, version}`. Naked `tm`, `gc`, `length` или число без unit/method в canonical pool запрещено; length выводится из `sequence`.

Каждая pair имеет REQUIRED `id`, `name`, `forwardPrimerId`, `reversePrimerId`, `expectedAmpliconLength`, `notes`. Оба refs MUST существовать; expected length — positive safe integer или `null`. Pair roles не переписывают primer bytes. Pair refs MUST быть переписаны при любом ID remap.

Canonical oligo identity для duplicate detection состоит из exact `sequence` и normalized `modifications[]`; name, direction, status, tags, notes и origin в physical identity не входят. Совпадение identity является только merge candidate: writer/importer MUST NOT автоматически объединять logical primer IDs или менять pair/reaction refs без явной deterministic remap policy и conflict report. Sequence-only dedup запрещён.

### 12.2 Notebook

`notebook/entries.json` содержит ordered entries и attachment manifest:

```json
{
  "$schema": "https://bodgegene.dev/schema/2.0.0/notebook.json",
  "schemaVersion": "2.0.0",
  "entries": [
    {
      "id": "note-01",
      "createdAt": "2026-07-13T10:00:00Z",
      "updatedAt": "2026-07-13T10:05:00Z",
      "authorRef": "person-igor",
      "title": "Sanger trace",
      "markdown": "Sanger trace: [trace](attachment:att-ab1-01)",
      "tags": ["sanger"],
      "refs": [
        {"kind": "container", "id": "c-product", "revisionDigest": "sha256:3333333333333333333333333333333333333333333333333333333333333333"}
      ],
      "attachments": ["att-ab1-01"]
    }
  ],
  "attachments": {
    "att-ab1-01": {
      "availability": "embedded",
      "path": "notebook/attachments/att-ab1-01.ab1",
      "fileName": "product_F.ab1",
      "mediaType": "application/vnd.appliedbiosystems.abif",
      "size": 12345,
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
  }
}
```

Attachment URI MUST иметь форму `attachment:<attachmentId>` и не зависит от ZIP filename или MIME inference.

`notebook/entries.json.attachments` является единственным project-level attachment registry, несмотря на directory name. Notebook entries MAY быть пустыми; evidence `attachments[]` и Markdown URIs ссылаются на те же IDs. Если archive содержит attachment или attachment ref, `project.refs.notebook` и registry metadata REQUIRED; параллельный evidence-only attachment index запрещён.

Root notebook object является closed и содержит только `$schema`, `schemaVersion`, `entries`, `attachments`. `entries[]` сохраняет явный пользовательский journal order; IDs уникальны. Каждый entry является closed object с REQUIRED полями `id`, `createdAt`, `updatedAt`, `authorRef`, `title`, `markdown`, `tags`, `refs`, `attachments`:

- timestamps — RFC 3339 UTC, `updatedAt` не раньше `createdAt`; `authorRef` — `project.creators[].id` или `null` и при non-null обязан разрешаться;
- `title` и `markdown` — strings с LF-normalized text; `tags` — unique UTF-8/NFC-sorted strings;
- `attachments` — unique ASCII-sorted attachment IDs. Все `attachment:` URI entry MUST входить в этот array; extra IDs допустимы как supporting files этой entry. Каждый ID обязан существовать в registry;
- `refs` — set-like array закрытых typed refs, отсортированный лексикографически по UTF-8 JCS bytes normalized item: container `{kind:"container",id,revisionDigest}`, assembly `{kind:"assembly",id}`, assembly-local `{kind:"piece"|"reaction"|"connection",assemblyId,id}`, primer `{kind:"primer"|"primer-pair",id}`, evidence `{kind:"evidence",id,evidenceDigest}` или external `{kind:"external",id}`. Byte-identical duplicates запрещены, каждый ref MUST разрешаться до exact retained entity;
- structured verification, expected/observed sequences, `deviceId`, blob URL и runtime Sanger state запрещены в entry; для них используются evidence/container records. Notebook MAY ссылаться на evidence, но не заменяет его.

Markdown хранится как inert text. Conforming renderer MUST отключать raw HTML execution, remote image/resource auto-fetch и scriptable schemes; `https` link открывается только как ordinary external navigation. UI/renderer не вводит второй notebook data contract и обязан следовать этому нормативному shape.

Set registry records с `availability:"embedded"` MUST один-в-один совпадать со всеми manifest assets `kind:"attachment"`; path уникален, а registry `path`, `size`, `sha256`, `mediaType` MUST равняться descriptor path/size/hash/mediaType. Manifest attachment без registry и embedded registry без asset являются error. В `full` registry MAY содержать unreferenced project files, но writer обязан сохранять весь registry и bytes; они не считаются evidence. В filtered profiles unreferenced attachment/omission records запрещены, и registry keys точно равны attachment closure.

Attachment metadata является closed union по `availability`:

- `embedded`: `{availability:"embedded", path, fileName, mediaType, size, sha256}`; path/size/hash REQUIRED и listed byte asset MUST существовать;
- `omitted`: `{availability:"omitted", path:null, fileName:null, mediaType, size:null, sha256:null, omissionReason:"profile"}`; byte asset MUST отсутствовать.

`omitted` допустим только в profile, который нормативно исключает attachment bytes, только для всё ещё referenced attachment ID и только при `project.publication.attachmentsOmitted: true`. Он сообщает о потере supporting bytes и не считается evidence. Unreferenced omission records запрещены. Registry keys сортируются по ASCII attachment ID.

### 12.3 MIME и безопасное открытие

Для embedded attachment writer MUST хранить canonical `mediaType`, original `fileName`, size и SHA-256. В omission record fileName/size/SHA нормативно `null`. Reader MUST проверять versioned magic-byte registry и связь MIME/path extension с asset kind.

Canonical MIME минимум:

| Содержимое | MIME |
|---|---|
| PNG | `image/png` |
| JPEG | `image/jpeg` |
| WebP | `image/webp` |
| PDF | `application/pdf` |
| ABIF/AB1 | `application/vnd.appliedbiosystems.abif` |
| Text | `text/plain; charset=utf-8` |
| Unknown | `application/octet-stream` |

Reader MAY принимать legacy MIME aliases на import, но writer MUST выводить canonical value.

Magic-byte registry v1:

| MIME | Обязательная проверка |
|---|---|
| `image/png` | bytes `89 50 4E 47 0D 0A 1A 0A` с offset 0 |
| `image/jpeg` | `FF D8 FF` с offset 0 |
| `image/webp` | ASCII `RIFF` с offset 0 и `WEBP` с offset 8; RIFF size не выходит за asset |
| `application/pdf` | ASCII `%PDF-` с offset 0; это не делает PDF passive |
| `application/vnd.appliedbiosystems.abif` | ASCII `ABIF` с offset 0 |
| `text/plain; charset=utf-8` | strict UTF-8 без BOM/NUL |
| `application/octet-stream` | signature не предполагается; только download-only |

Known MIME с mismatch является error, а не fallback к octet-stream. Более глубокий codec parse MAY дать дополнительную ошибку, но не заменяет эти минимальные checks.

`safeExt` выводится только из canonical media type, не из user filename: `png`, `jpg`, `webp`, `pdf`, `ab1`, `txt`, иначе `bin`. Attachment path MUST быть `notebook/attachments/<attachmentId>.<safeExt>`; original extension сохраняется только в `fileName` metadata. Несовпадение path extension и registry mapping является error.

SVG, HTML, JavaScript, PDF и неизвестные active formats MUST быть download-only либо открываться через доказанно sandboxed passive renderer без script/actions, embedded launch и automatic external fetch. Markdown renderer MUST запрещать raw HTML, remote images/resources и scriptable URL schemes. README и notebook text MUST проходить escaping/sanitization.

### 12.4 Полнота attachments

Для `availability: "embedded"` соответствующий listed asset MUST существовать и совпадать по path, mediaType, byte-size и SHA-256. Для `full` profile каждый registry record MUST быть embedded; `omitted` или отсутствующий byte asset — validation error, а не warning и не молчаливый пропуск. Для `public-supp` bytes исключаются, но selected evidence MAY сохранить refs только через exact omission contract §12.2.

## 13. Original sources

Оригинальные импортированные файлы MAY сохраняться как:

```text
sources/<sha256>/<safeOriginalName>
```

`<sha256>` MUST совпадать с точным byte SHA-256 source asset. Metadata источников хранится в `project.json.refs.sources` через source records:

`safeOriginalName` вычисляется детерминированно из NFC basename metadata: extension берётся как lowercase ASCII `[a-z0-9]{1,10}` либо canonical extension format registry; в stem каждый maximal run вне `[A-Za-z0-9._-]` заменяется `_`, leading dot/hyphen запрещается prefix `source_`, Windows device basename получает тот же prefix, stem обрезается до 80 ASCII bytes. Затем перед extension всегда добавляется `-<nameDigest8>`, где `nameDigest8` — первые 8 lowercase hex SHA-256 UTF-8 original NFC basename. Empty stem становится `source`. URL-decoding/transliteration/locale case conversion не применяется.

Core format→fallback extension mapping: `snapgene-dna→dna`, `genbank→gb`, `fasta→fasta`, `sbol3→json`, `ab1→ab1`, `text→txt`, unknown/namespaced→`bin`. Valid original ASCII extension имеет приоритет только как filename suffix; `format` остаётся отдельным authoritative field.

```json
{
  "id": "source-01",
  "sourceRecordDigest": "sha256:9999999999999999999999999999999999999999999999999999999999999999",
  "path": "sources/dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd/pET-28b-4b476002.dna",
  "format": "snapgene-dna",
  "fileName": "pET-28b.dna",
  "sha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  "accession": null,
  "version": null,
  "url": null,
  "license": null,
  "importedAt": "2026-07-13T10:00:00Z",
  "embedded": true,
  "visibility": "private"
}
```

Если bytes не embedded, `embedded` MUST быть `false`, `path` MUST быть `null`, а digest/identifier SHOULD быть записаны, если известны.

`id`, `sourceRecordDigest`, `format`, `embedded` и `visibility` REQUIRED. Для `embedded: true` поля `path`, `fileName`, `sha256` и `importedAt` REQUIRED. Для non-embedded/sanitized record `path` MUST быть `null`, а `fileName`, `sha256`, `accession`, `version`, `url`, `license` и `importedAt` MAY быть `null`, если значение неизвестно или исключено profile.

`sourceRecordDigest` вычисляется по domain-separated object `{entityKind:"source-record", digestSchemaVersion:"1", id, format, fileName, sha256, accession, version, url, license, importedAt, embedded, visibility}`; поля присутствуют с `null`, когда это разрешено. `path` и собственный digest исключены как archive locator/computed field. Source record immutable внутри archive snapshot. Санитизированная publication copy является другим source record material и получает новый digest; private provenance event на исходный digest при этом исключается, а не переписывается.

`visibility`: `public`, `private`. Filename, digest, URL, accession и import timestamp не считаются безопасными автоматически. `public-supp` MUST иметь `project.sources:[]`, `project.refs.sources:[]` и не содержит source records/bytes вообще; публичные accession/URL передаются через public external refs. Если explicit `custom` profile запрашивает sanitized source metadata, writer создаёт новый source record как минимум с `id`, новым `sourceRecordDigest`, `format`, `embedded:false`, `path:null` и `visibility`; excluded values становятся `null`. Такой custom slice MUST использовать identity-only provenance и исключить все events, ссылающиеся на исходный source digest. Event никогда не retarget-ится на sanitized record: сохранение event со старым `sourceRef` без original record было бы dangling, а его переписывание изменило бы `eventDigest` и исторический claim. Imported primer `sourceRef` также не retarget-ится: он сохраняется только при включении exact source либо проецируется в `null` по §12.1.

Exact связь canonical container revision с source выполняется provenance activity `{kind:"import"|"observation", sourceRef:{id, sourceRecordDigest}}`. Оба поля MUST совпадать с `project.sources`; embedded `sha256` дополнительно совпадает с source asset descriptor. Наличие source bytes не делает их canonical: повторный import создаёт новую revision или отдельный диагностический результат.

`public-supp` MUST исключать source metadata и bytes без исключений. Source bytes допускаются только в `full` согласно canonical `embedded` state либо в explicit `custom` selection после license/privacy confirmation.

Source `url`, когда non-null, подчиняется тем же правилам, что external refs: absolute `https`, без credentials, fragment secrets и automatic fetch при open/validation.

### 13.1 External references

`refs/external.json` хранит ссылки на ресурсы, bytes которых не являются embedded source:

```json
{
  "$schema": "https://bodgegene.dev/schema/2.0.0/external-refs.json",
  "schemaVersion": "2.0.0",
  "refs": [
    {
      "id": "ref-addgene-01",
      "kind": "addgene",
      "identifier": "12345",
      "version": null,
      "url": "https://www.addgene.org/12345/",
      "title": "Deposited plasmid",
      "license": null,
      "visibility": "public",
      "accessedAt": "2026-07-13T10:00:00Z"
    }
  ]
}
```

Root external-ref object closed и содержит только `$schema`, `schemaVersion`, `refs`. Каждый ref является closed object с REQUIRED полями `id`, `kind`, `identifier`, `version`, `url`, `title`, `license`, `visibility`, `accessedAt`; nullable поля представлены явно. `identifier` и `title` — non-empty strings либо `null`, `version`/`license` — string либо `null`, `url` — absolute `https` URI либо `null`, `accessedAt` — RFC 3339 UTC либо `null`. Хотя бы одно из `identifier`/`url` MUST быть non-null. `refs[]` сортируется по ASCII `id`, IDs уникальны.

Core `kind`: `doi`, `ncbi`, `addgene`, `sbol`, `url`, `other`. `visibility`: `public`, `private`. URL MUST быть absolute `https` URI; `file:`, credentials и fragments с секретами запрещены. В `2.0.0` individual external refs не имеют отдельного strong edge из assembly/container graph: `public-supp` поэтому включает детерминированно **все и только** records `visibility:"public"` из project external-ref asset, а privacy preview перечисляет их. Если public set пуст, asset отсутствует и `project.refs.externalRefs:null`. `custom` выбирает explicit IDs; bundle/single external refs не включают.

## 14. Extensions

Каждый vendor namespace MUST содержать `extensions/<vendor>/manifest.json`:

```json
{
  "$schema": "https://bodgegene.dev/schema/2.0.0/extension-manifest.json",
  "schemaVersion": "2.0.0",
  "vendor": "example.vendor",
  "version": "vendor-version",
  "vendorSchema": "https://vendor.example/schema/data.json",
  "required": false,
  "privacyClass": "unknown",
  "capability": {
    "id": "example.vendor:extension/data",
    "criticality": "optional"
  },
  "totalUncompressedSize": 1024,
  "files": ["extensions/example.vendor/data.json"]
}
```

`privacyClass`: `public`, `sensitive`, `unknown`.

### 14.1 Core rules

- Extension MUST NOT быть единственным местом sequence, topology, ends, features, assembly reactions, primers, evidence или provenance head.
- Extension MUST NOT переопределять canonical core при read.
- Unknown optional extension MUST сохраняться как exact uncompressed bytes при normal writable/full Save; удаление допустимо только profile/explicit loss action §5.5.
- Unknown required extension MUST блокировать normal hydration, writable open и recompute; isolated read-only core preview/inspect/verified extraction допустимы, поскольку extension не владеет core biology.
- Все extension files MUST быть listed в root manifest.
- Extension manifest является trusted core transport envelope с role `canonical`; он валидируется только встроенной `extension-manifest.json`. `vendorSchema` — inert identifier: reader MUST NOT загружать или исполнять его. Payload `extension-data` остаётся opaque либо явно derived.
- Root index и envelope MUST иметь одинаковые vendor/required/privacy/capability values. `files[]` перечисляет все payload files vendor group, но не сам `extensions/<vendor>/manifest.json`; paths уникальны, ASCII-sorted и не могут выходить из `extensions/<vendor>/`. `totalUncompressedSize` равен сумме descriptor `size` payload files. Вместе envelope + `files[]` MUST точно покрывать всю vendor group. Optional extension сохраняется/исключается только атомарно, не отдельными files.
- `public-supp` MUST исключать extensions без исключений независимо от `privacyClass`; override возможен только через отдельный `custom` archive.

`ui/layout.json` — core UI asset, а не extension. Он MAY хранить positions, zoom, collapsed state и view preferences, но MUST NOT содержать полную копию biological state.

### 14.2 UI layout

Минимальная форма `ui/layout.json`:

```json
{
  "$schema": "https://bodgegene.dev/schema/2.0.0/ui-layout.json",
  "schemaVersion": "2.0.0",
  "projectId": "project-01",
  "viewport": {"x": 0, "y": 0, "zoom": 1},
  "positions": {},
  "featureStyles": {},
  "collapsed": [],
  "viewPreferences": {}
}
```

Refs в layout являются weak UI refs. Missing entity MAY быть проигнорирована с warning. Layout MUST NOT влиять на project/container/assembly digests, и его удаление MUST оставлять full biological DTO неизменным.

Layout object closed и содержит только `$schema`, `schemaVersion`, `projectId`, `viewport`, `positions`, `featureStyles`, `collapsed`, `viewPreferences`. `projectId` MUST совпадать с project. `viewport` имеет exact `{x,y,zoom}` с finite binary64 numbers и `zoom > 0`. `positions` — map typed layout key → exact `{x,y}` finite numbers; keys имеют форму `container:<id>`, `assembly:<id>`, `piece:<assemblyId>/<pieceId>`, `reaction:<assemblyId>/<reactionId>` или `connection:<assemblyId>/<connectionId>`. `collapsed` — unique ASCII-sorted set тех же keys.

`featureStyles` — map `<containerId>/<featureId>` → exact `{color,hidden}`, где `color` — lowercase `#rrggbb` либо `null`, `hidden` — boolean; ID segments следуют core grammar, а unresolved key обрабатывается как weak-ref warning по правилу выше. `viewPreferences` является единственным explicit UI extension point: map namespaced identifier §3.3 → scalar `string | finite number | boolean | null`; nested objects/arrays, biology, local paths, URLs, code и device identifiers запрещены. Unknown preference сохраняется exact, но MAY игнорироваться UI.

## 15. Export profiles

Writer MUST применить profile к canonical state **до** генерации assets, refs, projections, README, hashes и recovery index.

### 15.1 Матрица профилей

| Раздел | `full` | `public-supp` | `containers-bundle` | `single-assembly` | `custom` |
|---|---|---|---|---|---|
| Project metadata | exact | fixed public projection | fixed minimal projection | fixed minimal projection | explicit selection projection |
| Immutable container records | all | exact dependency closure | selected exact revisions | exact dependency closure | explicit |
| Head aliases + GenBank projections | all heads/all records | selected primary heads/all closure records | selected primary heads/all records | selected primary heads/all closure records | explicit |
| Assemblies | all | exactly one | excluded | exactly one | explicit |
| Provenance | all revisions/events | identity-only | identity-only | identity-only | explicit full/identity-only |
| Primers | all | referenced | excluded | referenced | explicit |
| Notebook | all entries + registry | registry-only `entries: []` только при attachment refs, иначе absent | excluded | excluded | explicit |
| Attachment bytes | all registry embedded | excluded; referenced IDs получают omission records | excluded | excluded | explicit |
| Evidence | all | zero or one selected whole-plasmid comparison | excluded | excluded | explicit |
| Publication artifacts | allowed only with binding | required fixed set | excluded | excluded | explicit |
| Source metadata / embedded bytes | exact canonical state | excluded / excluded | excluded / excluded | excluded / excluded | explicit |
| External refs | all | all `visibility:public` | excluded | excluded | explicit |
| UI layout | included if present | excluded | excluded | excluded | explicit |
| Extensions | all complete groups | excluded | excluded | excluded | explicit complete groups |

В таблице `referenced` означает exact transitive refs из выбранного canonical graph, а не эвристику по имени/ID. Writer не добавляет primers/assets «на всякий случай».

### 15.1.1 Exact roots, project projection и path allowlists

Во всех profiles REQUIRED только system paths `_recovery.json`, `manifest.json`, `project.json`; optional attestation использует единственный path §10.10. Любой path/kind вне правил выбранного profile является Full error, даже если hash valid.

- `full` root — exact `project.json`. Writer включает все project refs, все immutable records/revisions/events, exact primer/notebook/evidence/source/external records, весь attachment registry и bytes, UI layout если существует, все complete extension groups, record/head GenBank и REQUIRED `README.md`. Source bytes включаются тогда и только тогда, когда source record имеет `embedded:true`; attachment registry/bytes подчиняется §12.2. Publication assets разрешены только при non-null binding, ровно одном selected product и exact paths §15.3.
- `public-supp` root — ровно один `publication.products[]` item. Допустимы только system/project/optional signature, одна selected assembly, closure container records/head aliases/GenBank, identity-only provenance, referenced primer pool, optional selected evidence, optional registry-only notebook omission asset с `entries:[]`, optional public external-ref asset, README и fixed publication paths §15.3. `source`, `attachment`, `ui-layout`, `extension-*`, непустые notebook entry records/markdown и любое иное evidence запрещены.
- `containers-bundle` roots — explicit non-empty set exact container revisions плюс explicit primary revision каждого ID. Допустимы только system/project/optional signature, closure immutable records, selected heads, record/head GenBank и identity-only provenance. Assemblies, primers, notebook, attachments, evidence, sources, external refs, UI, extensions, README/publication assets запрещены.
- `single-assembly` root — ровно один assembly ID. Допустимы только system/project/optional signature, этот assembly, exact material/output closure, selected heads, record/head GenBank, identity-only provenance и referenced primer pool. Notebook, attachments, evidence, sources, external refs, UI, extensions, README/publication assets запрещены.
- `custom` получает frozen selection `{assemblyIds, containerRevisionRefs, primaryRevisionRefs, evidenceRefs, primerIds, notebookEntryIds, attachmentIds, sourceSelections, externalRefIds, includeUiLayout, extensionVendors, publicationPaths, includeReadme}`. `sourceSelections[]` состоит из unique `{id, mode:"exact"|"sanitized"}`: exact сохраняет record и его embedded bytes как единое состояние, sanitized следует §13 и требует identity-only provenance. Arrays explicit и unique; отсутствующее поле/ID означает exclusion. Writer применяет strong-ref closure, требует atomic extension groups/attachment registry и отказывает при dangling ref. Selection не сериализуется как второй graph: итоговый manifest является exact materialized allowlist.

`full` project metadata сохраняется exact. `public-supp` копирует project `id`, title, description, tags, timestamps, license и DOI; creators/identifiers фильтруются строго по `visibility:"public"`, sources становятся `[]`, refs пересчитываются по closure, publication сохраняет один selected item. Все retained `agentRef`/`assertedBy` MUST разрешаться в retained public creators; private ref блокирует export. `containers-bundle`/`single-assembly` используют fixed minimal projection: прежние `id`, title, createdAt, updatedAt; `description:null`, `tags:[]`, `creators:[]`, `license:null`, `doi:null`, `identifiers:[]`, `sources:[]`, recalculated refs и `publication:null`.

Title/description/tags/timestamps, помеченные public creators/identifiers и public external refs являются явным фиксированным output, а не скрытым решением writer. Privacy preview MUST перечислить их до подтверждения. Full conformance проверяет exact projection и запрещённые классы/заданные canaries, но не заявляет, что машинный scanner доказал отсутствие любой человеческой тайны.

### 15.2 Dependency closure

Writer строит closure по exact revisions, а не по container IDs:

1. Добавить выбранную assembly и все exact material/output container refs.
2. Если выбран `verificationEvidenceRef`, разрешить exact `(id,evidenceDigest)`, добавить immutable evidence и его subject/`payload.observed` refs.
3. Для каждого `{id, revisionDigest}` разрешить provenance revision node.
4. Добавить соответствующий immutable record JSON; дедуплицировать по `(containerId, recordDigest)`.
5. Добавить record-specific GenBank каждой включённой записи.
6. Добавить минимальный provenance slice. Отсутствующие parent bodies допустимы только как объявленные `profile-omitted` refs.
7. Замкнуть referenced primers/pairs. Exact primer `origin.sourceRef` сохраняется только там, где profile включает original source record; иначе imported origin детерминированно получает `sourceRef:null` и omission report, никогда sanitized retarget. Source records/events включаются только там, где profile их допускает; `public-supp` их исключает. External refs: `full` включает все, `public-supp` — все и только `visibility:"public"`, bundle/single — ни одного, `custom` — explicit IDs.
8. Выбрать explicit primary revision каждого включённого container ID и построить его head aliases. Если несколько revisions включены, произвольный выбор запрещён.
9. Перестроить exact `project.refs.containers` и остальные refs.
10. Проверить отсутствие dangling strong refs и только затем генерировать derived assets/hashes.

Supporting attachment refs evidence являются weak только в `public-supp`. Если retained evidence attachments set непуст, `project.publication.attachmentsOmitted` MUST быть `true`, writer включает registry-only `notebook/entries.json` с `entries: []`, а omission registry keys MUST точно равняться этому set. Evidence payload, ID и digest не переписываются. Если set пуст, flag MUST быть `false`, registry отсутствует и `project.refs.notebook:null`. Extra/missing omission record является error. В `full` отсутствующий referenced attachment остаётся validation error.

После фильтрации writer MUST пересчитать project refs, asset list и все digests. Parent revision digest можно проверить без parent body, но причина его отсутствия должна быть явной, а не выглядеть как corruption.

### 15.3 `public-supp`

Без исключений в этом profile запрещены:

- device/fingerprint identifiers;
- absolute/local paths и runtime URLs;
- attachments и AB1;
- все evidence records, кроме явно выбранного `whole-plasmid-sequence-comparison`;
- embedded sources;
- private provenance events/agents;
- UI layout;
- extensions;
- private external refs;
- private creators/identifiers и любые поля вне fixed projection §15.1.1.

Public creator display names остаются только по exact `visibility:"public"` rule. Writer MUST сформировать privacy report с перечнем включённых/исключённых классов и всех retained free-form fields с path/JSON pointer: project/container/assembly names и descriptions, tags, feature names/qualifier values/`sourceFeatureId`, primer names/notes/tags, construction claim/evidence summaries и external-ref title/URL. Human confirmation является release decision, не машинным Full criterion; поля нельзя считать безопасными только потому, что scanner не нашёл canary. Full conformance проверяет форму report/allowlist и заданные canaries, но не объявляет содержимое этих строк конфиденциально безопасным.

`public-supp` MUST содержать `project.json.publication`, один выбранный expected product и его transitive producer graph. Он MUST включить `publication/methods.md`, `publication/assembly.png`, `publication/materials.tsv`, `publication/verification.md` и, при наличии referenced primers, `publication/primers.tsv`. Если selected comparison имеет `status:"differs"` и non-empty variants, REQUIRED `publication/variants.tsv`; во всех остальных случаях этот path запрещён. SVG/PDF publication projections в `public-supp` `2.0.0` не входят; они допускаются только explicit `custom` profile.

`publication/methods.md` MUST использовать язык design intent (`design specifies` / «дизайн предусматривает»), если `constructionAssertion` не равен `reported-performed`. Даже при reported assertion текст MUST явно указывать, что это утверждение автора. `publication/verification.md` создаётся всегда и показывает `not checked`, если evidence не выбрано.

Expected/material/observed containers используют top-level `.gb` выбранной primary revision и record-specific `.gb` для остальных exact revisions того же ID; дублировать `.gb` в `publication/` запрещено. Derived artifacts генерируются после filtering и имеют `generatedFrom` на exact immutable record assets. PNG обязателен как безопасная статическая диаграмма. `publication/assembly.svg` и `publication/supplement.pdf` допускаются только в `full` с binding или explicit `custom` и остаются download-only/sandboxed по §12.3; в `public-supp` они запрещены.

### 15.4 `custom`

Custom profile MUST материализоваться как explicit allowlist sections/assets. Отсутствующий checkbox не означает разрешение. Writer MUST проверять dependency closure и отказывать при создании семантически оборванного archive.

### 15.5 `README.md`

README — UTF-8/LF derived asset с `role: "derived"`. Он MUST иметь `generatedFrom` на `project.json` и другие использованные canonical assets. Минимально он содержит title, описание export profile, список включённых containers/assemblies и инструкцию, что source of truth находится в JSON.

Writer MUST экранировать user strings как plain Markdown text. Raw HTML, remote images/resources, `javascript:`, `data:` и иные active schemes запрещены. README MUST генерироваться после profile filtering и MUST NOT раскрывать исключённые ID, paths, authors, attachments, evidence, sources или extensions.

## 16. Нормативные алгоритмы чтения и записи

### 16.1 Strict read

Reader MUST выполнить шаги в указанном порядке:

1. Прочитать EOCD/central directory через bounded random access без inflate payload и проверить отсутствие prefix/trailing/overlap/orphan ranges, comments и forbidden extra fields.
2. Применить resource policy: compressed size, entry count, total uncompressed size, ratio warnings.
3. Проверить raw/canonical paths, duplicates, case collisions, symlinks, encryption и methods.
4. Прочитать `_recovery.json` и `manifest.json` с ограничением размера.
5. Проверить magic, exact format version, capabilities, trusted manifest/recovery schemas и только manifest `attestation` declaration; signature asset на этом шаге ещё не интерпретируется.
6. Сопоставить ZIP entry set с manifest allowlist и recovery index один-в-один с final manifest/local/central metadata.
7. Для каждого listed asset проверить existence, uncompressed byte-size и SHA-256.
8. Декодировать только declared core structured bytes как strict UTF-8/JSON: fatal invalid UTF-8, BOM, duplicate object keys и integers вне safe interoperable range являются errors; opaque JSON payload не парсится по MIME.
9. Проверить `$schema`/`schemaVersion` каждого core structured asset по trusted registry и canonical JCS+LF bytes; для optional signature envelope проверить closed shape и exact equality path/algorithm/key ID с уже проверенной declaration.
10. Построить временный canonical DTO только из declared canonical assets.
11. Проверить IDs, refs, coordinates, strict sequences, record filenames/digests, global revision/supersedes/generatedFrom DAGs, head aliases, assembly invariants, attachments и projections.
12. Проверить `projectContentDigest` и `archivePayloadDigest`.
13. Проверить optional Ed25519 signature и отдельно классифицировать cryptographic validity/trust.
14. Атомарно передать DTO, preserved inventory и capability limitations приложению только если выбранный open mode это допускает.

До шага 14 partial state MUST NOT смешиваться с текущим проектом или IndexedDB.

Integrity failure canonical asset — hard error. Reader MAY предложить отдельный recovery/inspect workflow, но MUST NOT автоматически понижать ошибку до warning.

Нормативные dispositions:

| Результат | Canonical hydration | Write | Recompute | Full conformance |
|---|---:|---:|---:|---:|
| всё поддержано | да | да | да | да |
| unknown optional independent opaque | да | да, только с exact preservation | unaffected only | да |
| unknown optional generic method/derived | generic/limited | unchanged envelope only | affected — нет | `unsupported` на biological/full |
| unknown required semantic | нет; inspect/verified extract only | нет | нет | `unsupported` |
| unsupported transport | нет | нет | нет | `unsupported` |
| integrity/schema/biology error | нет | нет | нет | `invalid` |

`policy-challenge` из-за local resource limits не означает invalid archive и MAY быть повторён с явно расширенной policy. User cancellation является neutral outcome. Warning допустим только когда canonical correctness не нарушена, например missing weak UI ref или недоказуемое fuzzy containment; hash/schema/required-ref/projection mismatch всегда error.

### 16.2 Write

Writer MUST:

1. Снять immutable canonical snapshot приложения.
2. Построить canonical DTO через explicit runtime/import adapters; normalization report не может скрывать потерю symbols, topology, ends, feature semantics или refs.
3. Применить export profile и dependency closure, удалить runtime-only/placeholders и пересчитать capabilities.
4. Провести schema и semantic validation canonical DTO.
5. Применить только normative representation normalization: NFC/LF и schema-defined ordering set-like collections; это не repair invalid biology. После normalization повторить semantic validation.
6. Stage selected opaque bytes и вычислить source/attachment/extension sizes/hashes; добавить preserved groups либо вернуть explicit loss/stale error.
7. Вычислить `sourceRecordDigest`, molecule/record/expected-sequence/revision/event/evidence digests в DAG §10.9.
8. Материализовать immutable record store/provenance и выбрать explicit heads.
9. Сериализовать все canonical JSON.
10. Сгенерировать head aliases, record/head GenBank projections, README и разрешённые profile-derived assets.
11. Вычислить byte-size/SHA-256 оставшихся non-attestation assets и собрать descriptors.
12. Вычислить `projectContentDigest`.
13. Зафиксировать `attestation` declaration из выбранного signing key либо `null`, затем вычислить `archivePayloadDigest`.
14. При запросе подписи создать signature envelope над reconstructed statement и вычислить его asset SHA-256.
15. Сформировать final manifest со всеми asset descriptors.
16. Сформировать `_recovery.json` из exact manifest bytes и asset descriptors.
17. Записать ZIP в порядке §3.1.
18. Повторно прочитать созданный blob и проверить требуемую disposition перед заменой last-known-good copy. Новый archive, export copy, `public-supp` и recovered copy MUST пройти Full. Preservation Save проекта с unknown optional method/derived data MAY ожидаемо остаться `unsupported` на Biological/Full, но MUST пройти Structural/Integrity, сохранить exact capability/payload, не затронуть affected entity и воспроизвести тот же set capability limitations; affected recompute/write запрещены.

Writer MUST NOT выбирать версию формата по эвристике формы state и MUST NOT создавать v1 archive.

### 16.3 Canonical JSON

Structured JSON MUST:

- быть UTF-8 без BOM;
- использовать LF;
- быть валидным JSON без comments, NaN и Infinity;
- не содержать duplicate object keys;
- не содержать integers вне диапазона `Number.isSafeInteger` для interoperable readers;
- не содержать negative zero; все non-integer numbers MUST быть конечными IEEE-754 binary64 values, которые сериализуются exact RFC 8785 number algorithm;
- соответствовать trusted schema;
- иметь strings в NFC;
- сериализоваться детерминированно.

Нормативная формула:

```text
normalized = recursiveNfcAndLf(value)
domainDigestBytes = UTF8(JCS(normalized))
coreJsonAssetBytes = UTF8(JCS(normalized) + "\n")
```

Нормализуются object keys и string values; collision двух keys после NFC normalization является error. Domain digest не включает LF, тогда как asset `size`/SHA-256 включает. Manifest, recovery, signature envelope и все core structured assets используют JCS+ровно один LF. Альтернативный pretty-print запрещён. Opaque extension/source bytes не канонизируются и не парсируются только из-за JSON MIME.

Array semantics задаёт schema: set-like arrays сортируются по явно указанному ASCII/numeric key, ordered arrays сохраняются. Generic recursive array sort запрещён; порядок locations, reaction inputs, qualifier values, notebook entries и biological segments семантичен.

## 17. Recovery

`_recovery.json` помогает извлечь проверяемые части при повреждении central directory.

```json
{
  "$schema": "https://bodgegene.dev/schema/2.0.0/recovery.json",
  "fileFormatVersion": "2.0.0",
  "manifest": {
    "path": "manifest.json",
    "size": 4096,
    "compressedSize": 4096,
    "crc32": "89abcdef",
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  },
  "files": [
    {
      "path": "README.md",
      "size": 256,
      "compressedSize": 128,
      "crc32": "4567cdef",
      "sha256": "23456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
      "compression": "deflate"
    },
    {
      "path": "project.json",
      "size": 1024,
      "compressedSize": 512,
      "crc32": "0123abcd",
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "compression": "deflate"
    }
  ]
}
```

Recovery index MUST:

- быть первым ZIP entry;
- использовать STORE;
- содержать manifest и все manifest assets;
- считать `size` в bytes;
- содержать decimal `compressedSize` и ровно 8 lowercase hex ZIP `crc32`, вычисленный по exact uncompressed payload bytes;
- не включать собственный hash.

`files[]` содержит ровно один item на каждый `manifest.assets` path и сортируется по ASCII path; `manifest` описан только отдельным object. Path, uncompressed `size`, SHA-256 и `compression` MUST один-в-один совпадать с final manifest descriptor, а `compressedSize`/`crc32` — с local и central ZIP records. Duplicate, missing, extra или mismatched recovery item делает strict archive invalid, хотя отдельный recovery scan всё ещё MAY попытаться классифицировать bytes.

Recovery reader MUST проверять local header, compression support, обязательный CRC-32 uncompressed bytes, uncompressed size и SHA-256. Результат:

```json
{
  "recovered": [
    {"path":"README.md","size":256,"sha256":"23456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01"},
    {"path":"project.json","size":1024,"sha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"}
  ],
  "corrupted": [],
  "missing": [],
  "unsupported": []
}
```

Все четыре arrays сортируются по ASCII path. `recovered` item имеет exact `{path,size,sha256}` после match. Остальные имеют `{path,code,detail}`, где `code` — stable diagnostic code, а `detail` — nullable human text; `corrupted` MAY дополнительно содержать `actualSize`/`actualSha256`, если они безопасно получены. Один path встречается ровно в одной partition. Файл попадает в `recovered` только после SHA-256 match. Неподдерживаемый DEFLATE/ZIP64 MUST быть отражён в `unsupported`, а не пропущен; data descriptor является invalid Bodge transport и классифицируется `corrupted`.

Наличие восстановленных файлов не делает archive valid. Recovery возвращает immutable `RecoveryReport` и MAY дать изолированный safe read-only preview, но MUST NOT создавать normal project session, lease или autosave state. Единственный переход в обычный проект: явное «Сохранить восстановленную копию…» → normal writer/full self-validation → verified Save As/reread → новый strict file open. До успеха этого пути исходный archive остаётся partial/recovered, не valid `.bodge`.

## 18. Conformance

### 18.1 Уровни

1. **Structural** — ZIP profile, paths, required files, trusted JSON schemas.
2. **Integrity** — exact allowlist, byte sizes, SHA-256, recovery/manifest consistency.
3. **Biological** — sequences, coordinates, topology/ends, refs, reaction graph, revisions и evidence semantics.
4. **Full** — structural + integrity + biological + projection parity + `projectContentDigest`/`archivePayloadDigest` + profile privacy rules.

Программа MUST указывать достигнутый уровень и MUST NOT называть archive fully valid после одной проверки JSON syntax.

Отсутствие experimental evidence не снижает Structural, Integrity, Biological или Full conformance. `Full` означает полное соответствие формату, а не экспериментальную проверку проекта или продукта.

### 18.2 Независимый validator

Reference validator MUST поддерживать:

```text
bodge inspect <file>
bodge validate <file> [--level structural|integrity|biological|full]
bodge unpack <file> --verified-only
```

Diagnostics MUST включать stable code, severity, path, JSON pointer/semantic entity и человекочитаемое сообщение. Минимальные severity: `error`, `warning`, `info`.

CLI MUST различать как минимум `valid`, `invalid`, `unsupported` и tool/I/O failure; recommended process exit codes: `0`, `2`, `3`, `1` соответственно. Local policy challenge/cancellation не должны маскироваться как corruption.

Для release conformance один validator MUST быть независим от browser implementation: допускается общий опубликованный schema/corpus, но не общий ZIP parser, digest functions или semantic validator code. Corpus MUST содержать cross-language JCS/digest golden vectors для `recordDigest`, `moleculeDigest`, `expectedSequenceDigest`, `revisionDigest`, `eventDigest`, `sourceRecordDigest`, `evidenceDigest`, `projectContentDigest` и `archivePayloadDigest`.

### 18.3 Минимальный canonical archive

Reference corpus MUST содержать архив с:

- одним circular immutable container record, provenance revision и matching head alias;
- record/head GenBank projections;
- одним project record;
- empty primer/notebook/evidence refs;
- README;
- корректными manifest и recovery index.

### 18.4 Обязательные valid fixtures

- circular plasmid с feature через origin;
- linear fragment с 5′ и 3′ overhang;
- linear ssDNA с явными 5′/3′ termini и unknown phosphorylation;
- imported/observed FASTA с unknown topology/strandedness и `inconclusive` comparison;
- spliced CDS с `join`, fuzzy locations и repeated qualifiers;
- feature с `within`/`one-of`, valueless qualifier, `level`/parent и reviewed computed assertion;
- sourced/synthetic/planned/gap piece variants;
- expected-sequence, source-record и evidence digest golden vectors;
- head с ancestor и assembly, ссылающаяся на non-head revision;
- metadata-only revision с прежним `moleculeDigest`, но новым `recordDigest`;
- revert A→B→A: два record assets и три revisions;
- cross-container fork, merge с двумя parents и identity-only public provenance;
- PCR + restriction + ligation assembly;
- Golden Gate/Gibson assembly с connections;
- primer tails, pairs и modifications;
- imported primer с exact source ref в `full` и `sourceRef:null` projection в source-excluding profile;
- notebook entry с creator, typed container/evidence/assembly-local refs, declared attachment set и embedded registry;
- Sanger evidence с AB1 attachment;
- evidence supersedes chain с exact `(id,evidenceDigest)` refs;
- whole-plasmid exact comparison после circular rotation;
- whole-plasmid exact comparison после reverse complement только для circular dsDNA;
- circular ssDNA/unknown-strand rotation equality и reverse-complement inequality;
- topology-unknown и linear stored-orientation molecule digest vectors;
- molecule digest identity ends без `generatedBy`, но с различимыми overhang/phosphorylation states;
- SNP и indel comparisons с `result: fail`;
- partial/ambiguous consensus с `result: inconclusive`;
- `public-supp` с expected/observed GenBank, selected evidence и publication artifacts;
- original source и optional extension;
- unknown optional opaque/extension exact-byte preservation после unrelated full Save;
- derived-only change: прежний `projectContentDigest`, новый `archivePayloadDigest`;
- compression-only repack с теми же `projectContentDigest`/`archivePayloadDigest`;
- каждый export profile.

### 18.5 Обязательные valid-but-unsupported/policy fixtures

- unknown optional chemistry: Structural/Integrity valid, generic read/preservation, `unsupported` на Biological/Full;
- unknown required method/extension: isolated preview/verified extraction, normal hydration/write `unsupported`;
- supported extension envelope с inert `vendorSchema`: no network fetch/execute, expected declared capability disposition;
- declared ZIP64 на reader без ZIP64: `unsupported`, не `invalid`;
- archive выше local entry/size/count/ratio budget: `policy-challenge` до inflate, затем valid/invalid определяется только после explicit expanded-policy retry;
- explicit user cancellation: neutral `cancelled`, не corpus corruption.

### 18.6 Обязательные invalid/adversarial fixtures

- missing/tampered/wrong-size/unlisted asset;
- duplicate, case-fold collision, traversal, absolute path, backslash и symlink;
- multi-disk ZIP, undeclared ZIP64, любое data descriptor usage/bit 3, prefix/trailing junk, comments, forbidden extra fields, overlap/orphan local header;
- `extensions/__proto__/...`;
- mismatched extension group, executable/archive-loaded vendor schema и partial optional-extension preservation;
- duplicate/overlapping capability lists, пропущенная provenance-activity capability и optional capability, меняющая core semantics;
- missing/duplicate/wrong-hash/self/cyclic/out-of-profile `generatedFrom`;
- preserved derived asset с изменённой dependency;
- invalid UTF-8, BOM, duplicate JSON keys и unsafe integer;
- NFC key collision, wrong final-LF/domain-digest handling и locale-dependent ordering;
- declared-size bypass, actual inflate overrun и resource-budget enforcement failure;
- container ID/path/ACCESSION mismatch;
- invalid IUPAC и out-of-bounds location;
- circular container с non-null ends;
- dsDNA с single-stranded/malformed ends или неверной GG/RE registry;
- non-palindromic sticky ends, ошибочно признанные совместимыми по равенству строк;
- отсутствующий feature `level`, scalar qualifier, invalid parent/containment или remote location, молча превращённая в local;
- planned/gap input с materialized simulated output;
- orphan refs, duplicate producer и reaction cycle;
- stale source revision и wrong expected digest;
- revision/record digest mismatch, missing record, filename digest mismatch и global parent cycle;
- head alias/project head mismatch, undeclared omitted parent и ambiguous filtered head;
- один `revisionDigest` с разными payloads, source/event/evidence digest mismatch или supersedes self/cycle;
- whole-molecule `pass` при разных molecule digests;
- whole-molecule `pass` без exact observed revision;
- regional/junction evidence, ошибочно повышающее whole-molecule status;
- mutation expected product при import observed consensus;
- attachment MIME spoof и active SVG/HTML;
- notebook с unresolved author/entity ref, undeclared `attachment:` URI, legacy device/runtime Sanger fields или registry mismatch;
- `public-supp` с private payload;
- `public-supp` с raw reads, notebook text/non-empty entries, non-null imported-primer source ref, extra/missing omission registry, local path или stale publication `generatedFrom`;
- README/PNG/GenBank tamper с обновлённым manifest hash, но invalid detached signature/archive payload digest;
- broken central directory с recoverable и unrecoverable entries.

### 18.7 Interoperability corpus

Реальные, а не симулированные fixtures SHOULD покрывать SnapGene, ApE, Geneious, NCBI/INSDC GenBank, pLannotate, SBOL 3 и OpenCloning. Для каждого публикуется loss matrix: что сохраняется точно, что проецируется, что не поддерживается.

## Приложение A — нормативные и справочные ссылки

- [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) / [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) — normative language.
- [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) — JSON Canonicalization Scheme.
- [RFC 8493 BagIt](https://www.rfc-editor.org/rfc/rfc8493) — ориентир integrity manifests и path safety.
- [INSDC Feature Table Definition](https://www.insdc.org/submitting-standards/feature-table/) — GenBank feature/location semantics.
- [SBOL 3](https://sbolstandard.org/datamodel-specification/) — ориентир typed synthetic-biology exchange.
- [RO-Crate](https://www.researchobject.org/ro-crate/specification.html) — ориентир research metadata и provenance packaging.

Эти стандарты не заменяют BodgeGene schema. При конфликте структуры BodgeGene с внешним форматом импорт/экспорт обязан явно сообщить loss, а canonical BodgeGene state не должен изменяться молча.
