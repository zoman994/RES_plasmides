# BodgeGene Format 2.0.0 — план доведения реализации до спецификации

Статус: implementation plan

Нормативный контракт: [`SPEC_BODGE_FORMAT_V2_CORE.md`](./SPEC_BODGE_FORMAT_V2_CORE.md)

Продуктовая и UX-спецификация: [`SPEC_REPRODUCIBLE_RECIPE.md`](./SPEC_REPRODUCIBLE_RECIPE.md)

Целевая версия формата: `2.0.0`

## 1. Цель и границы

Цель — привести живые read/write/save/export paths BodgeGene к нормативной спецификации формата `2.0.0`. Этот документ не определяет новый формат и не повторяет его schemas: при расхождении приоритет всегда у `SPEC_BODGE_FORMAT_V2_CORE.md`.

Формат ещё находится в разработке. Существующие development-архивы и fixtures не являются compatibility contract: после изменения layout они пересоздаются из canonical fixtures.

### 1.1 Неподвижные решения

- Единственное записываемое значение `fileFormatVersion` — `2.0.0`.
- Отдельного migration API и цепочки конвертации development-файлов не будет.
- Writer всегда создаёт structured Bodge 2; он не выбирает формат по форме runtime state.
- v1 reader MAY оставаться изолированным legacy import path, но не входит в Bodge 2 conformance и не переписывает файл автоматически.
- Structured core — единственный source of truth.
- Полный canvas/skeleton snapshot не имеет права восстанавливать или переопределять биологию.
- GenBank — проверяемая проекция canonical container JSON.
- Паспорт конструкции и публикационные файлы — только derived projections canonical graph; отдельного `recipe.json` и второго графа операций нет.
- `planned` и `simulated` описывают состояние дизайна. Авторское утверждение о выполнении и результат сравнения expected/observed хранятся отдельно и никогда не повышают assembly целиком до generic `verified`.
- Whole-plasmid verification prerelease принимает готовый consensus FASTA/GenBank. Basecalling, assembly raw reads и лабораторный LIMS остаются внешними системами.
- Plain ZIP остаётся незашифрованным; встроенное password encryption не добавляется.
- Unknown/untrusted content не может молча попасть в runtime state или исчезнуть при re-save.
- Search и primer UX уже прошли отдельную ревизию. Здесь меняется только файловый контракт primer pool и его ссылки, без нового дизайна этих инструментов.

### 1.2 Не входит в эту работу

- multi-writer merge, CRDT и серверная синхронизация;
- собственная PKI;
- новый AB1 viewer;
- выполнение vendor scripts;
- автоматическая лабораторная роботизация;
- basecalling, demultiplexing, сборка raw Nanopore/NGS reads и оценка чистоты образца;
- sample inventory, freezer locations, concentrations, трансформации, колонии, выращивание и иные LIMS-функции;
- доказательство того, что описанная лабораторная последовательность действий действительно была выполнена;
- переработка поиска и алгоритмов дизайна праймеров.

## 2. Текущее состояние и подтверждённые разрывы

### 2.1 Два semantic sources и четыре persistence owners

`gui/designer/src/components/CanvasSkeleton/lib/skeleton-bodge-bridge.js` сохраняет полный skeleton snapshot в `extensions/bodgegene/` и при восстановлении предпочитает его structured sections. Следствия:

- внешняя правка `containers/*.gb` может быть скрыта старым snapshot;
- export profile может отфильтровать structured sections, но оставить полную копию проекта в extension;
- structured round-trip выглядит lossless только при наличии opaque BodgeGene payload;
- сторонний reader не получает ту же биологию, что BodgeGene.

Фактически persistence распределена не между двумя, а между четырьмя владельцами: metadata/assemblies в `projects`, project-scoped container rows в общей `library`, project-scoped rows в общей `primers` и отдельная БД `bodge-skeleton`. Writer реконструирует файл из metadata + Skeleton, а Library/primer hydrators живут своим lifecycle. Ни один из четырёх не может быть объявлен временно authoritative при cutover: новый `projectDocuments` заменяет их одним commit boundary, personal Library/primer rows остаются отдельными global collections.

### 2.2 Reader не использует manifest как gate

`gui/designer/src/lib/bodge-zip.js`:

- `readBodge()` вызывает `blob.arrayBuffer()` и `unzipSync()` для всего архива;
- `readBodgeV2()` перебирает ZIP paths по prefixes;
- SHA-256 assets не проверяется до parse;
- unlisted container/assembly/extension может попасть в state;
- duplicate ZIP names уже потеряны после преобразования результата unzip в object;
- частично разобранные sections превращаются в warnings и смешиваются с state.

`gui/designer/src/lib/bodge-recovery.js::verifyBodgeIntegrity` существует отдельно, но normal open его не вызывает. Сам verifier не проверяет exact entry-set, declared byte-size, compression и recovery index.

### 2.3 Path и prototype safety

Writer напрямую подставляет container ID, zone ID, vendor и relative path в имена ZIP entries. Reader строит extension tree на обычном `{}`. Путь `extensions/__proto__/...` способен обратиться к prototype chain. Нет проверки traversal, absolute paths, case collisions, symlink attributes и duplicate canonical names.

### 2.4 Manifest и schemas

Фактически существует только:

`gui/designer/src/schemas/bodge-manifest-v2.json`.

При этом writer записывает `$schema` для project, assembly, primers и external refs. Эти schemas отсутствуют. `gui/designer/src/lib/bodge-manifest-v2.js::validateManifest` реализует отдельный облегчённый набор правил и расходится с JSON Schema.

### 2.5 Project metadata

Writer помещает description/tags/author в manifest, но `project.json` содержит только часть metadata. Reader строит `projectMeta` из `project.json`, поэтому structured round-trip теряет данные, если snapshot не вмешивается.

### 2.6 Container/GenBank loss

`gui/designer/src/lib/bodge-container-genbank.js`:

- признаёт circular только при строке `topology === "circular"`, тогда как runtime использует и object shape;
- не сериализует physical ends;
- пишет provenance только при заранее подготовленном `container.provenance`, хотя runtime origin хранится иначе;
- сводит несколько Bodge feature types к одному GenBank type без `/bodge_type`;
- не поддерживает `join`, `order`, fuzzy, between-base и cross-origin locations;
- читает unknown qualifiers, но writer не возвращает их обратно;
- использует `parentId`, тогда как другие части проекта используют `regionId`;
- не сохраняет полные CDS/gene qualifiers.

В проекте уже есть более богатый GenBank exporter, поэтому два codecs дают разный результат для одной молекулы.

### 2.7 Topology, ends и placeholders

Canvas initial state содержит placeholder container с ID и пустой sequence. Bridge и writer не отделяют его от реальной молекулы. Physical ends linear fragments присутствуют в runtime biology, но не входят в structured Bodge sections. Это меняет смысл restriction/ligation products после открытия.

### 2.8 Assembly graph

`gui/designer/src/lib/bodge-assembly-json.js` сериализует одну junction shape, а runtime selectors/assembly engine используют другую. Теряются endpoint container refs, end requirements, status и часть chemistry.

`validateAssemblyJson` объявлен, но production writer его не вызывает. Soft reader check покрывает только часть refs и не проверяет:

- `inputPieces`;
- `derivedReactionId`;
- materialized clones;
- junction refs;
- primer/pair refs;
- duplicate producers;
- cycles;
- source revision drift.

### 2.9 Primer references

Primer serializer сохраняет основные поля, но import/dedup оставляет pair refs без обязательного ID remap. Sequence-only merge не учитывает chemical modifications, а imported origin не закрепляет exact source digest и станет dangling после source-excluding export. В рамках этой ревизии алгоритмы primer design не меняются; исправляется только lossless representation и referential integrity.

### 2.10 Export profiles и privacy

`gui/designer/src/lib/bodge-export-profiles.js` существует, но основной writer не применяет profile целиком. `public-supp` в `bodge-zip.js` очищает только manifest `deviceId`.

Даже после `applyProfile()` остаются runtime `attachments`/`attachmentsBlobs`; writer подмешивает их обратно. Extensions, UI snapshot, Sanger details, local URLs и private external refs могут попасть в публичный архив.

### 2.11 Attachments и README

- Runtime notebook использует legacy `author.deviceId`, `text`, `kind`, inline Sanger `data` и слабые `{kind,id}` refs, тогда как canonical notebook требует creator ref, `markdown`, digest-bound refs и отдельное evidence. Это adapter boundary, не повод сохранить второй notebook contract.
- Текущий `attachmentsManifest` и runtime Blob map не являются одним проверяемым registry: entry/evidence refs, metadata и ZIP assets могут расходиться.
- MIME доверяется metadata, magic bytes не проверяются.
- Для AB1 используются разные MIME aliases.
- Writer вычисляет ZIP extension из MIME повторно, поэтому Markdown link и фактический path могут разойтись.
- Missing bytes молча пропускаются.
- README вставляет metadata как raw Markdown; safety validator не является production gate.

### 2.12 Save и recovery

`gui/designer/src/App.jsx::handleSave` вызывает прямой `saveBlobToHandle` из `file-system.js`. `safeWriteBodge` не подключён; его default adapter создаёт новый memory FS.

Recovery:

- при успешном unzip объявляет `ok` до integrity validation;
- при byte-walk не проверяет recovered SHA-256;
- использует CommonJS `require("fflate")` внутри browser ESM;
- recovery index сам сжат;
- не различает корректно `corrupted`, `missing` и `unsupported`;
- считает manifest size через JavaScript string length вместо UTF-8 bytes.

### 2.13 Revision refs неразрешимы

Assembly/evidence уже проектируются с exact `{id, revisionDigest}`, но текущий архив хранит только один `containers/<id>.json`. После изменения head старый material, expected product или observed revision физически отсутствует. Нельзя проверить dependency closure, historical evidence, revert или merge.

Нужен immutable record store `containers/<id>/records/<recordDigestHex>.json`, record-specific GenBank, provenance resolver `revisionDigest → recordDigest` и проверяемый top-level head alias. Текущий `resourceHash` не подходит: он не JCS, не учитывает полный feature/ends/origin state и не является ни `recordDigest`, ни `moleculeDigest`.

### 2.14 Canonical biology underspecified в runtime

- `segment-annotation-transfer.js` объявляет часть coordinates как 1-based inclusive, тогда как общий annotation contract — 0-based half-open.
- Compound/fuzzy locations не имеют единой algebra для clip, shift, reverse complement, circular rotation, insertion и deletion.
- Runtime feature требует `level: region|detail|point`, но прежняя format shape его не фиксировала.
- Predictor fields `predicted/source/confidence/signals` не имеют однозначного canonical assertion mapping.
- Physical-end aliases не различают reference/complement termini и неоднозначны для blunt/ssDNA.
- Runtime pieces `sourced|gap|snippet|synthesis|intermediate` не взаимно-однозначны canonical `sourced|synthetic|planned|gap`; `gapSequence`, multi-source ranges и empty intermediate требуют явной политики.

### 2.15 Open/persistence имеют обходные пути

Production использует независимые open flows в `App.jsx`, `StartScreen/lib/open-bodge.js`, file drop и `bodge-assembly-portable.js`. Они по-разному теряют state, добавляют project containers в глобальную Library и дедуплицируют primers/containers по sequence. Save отдельно читает `bodge-skeleton` snapshot и может записать v1 fallback.

Project biology распределена между Zustand, отдельной Dexie БД `bodge-skeleton`, global Library и global primer map. Асинхронный bootstrap, module-level debounced saver и project lock допускают late/stale writes. Открытие project не должно импортировать его containers/primers в личные глобальные коллекции; `.bodgeassembly` не должен оставаться отдельным нестрогим merge reader.

`projectSlice` хранит singleton `fileHandle/fileName`, поэтому direct activation другого project может оставить binding предыдущего. `closeProject` отпускает lock раньше гарантированного flush; `MultiTabBlocked` использует немедленный release request без quiesce/ack; Settings вызывает broad store/localStorage cleanup, но отдельная Skeleton DB живёт своим lifecycle. Эти пути требуют state-machine замены, а не локальных задержек/очисток.

### 2.16 Freeze-blockers manifest/digest/runtime

- `projectContentDigest` ранее защищал canonical state, но не GenBank/README/Methods/PNG/TSV; одной подписи semantic digest недостаточно для публикационного пакета. Нужен отдельный `archivePayloadDigest` по всем non-signature assets.
- `extension-manifest` использовал недоверенный vendor `$schema`, хотя core обязан читать vendor/files/required/privacy. Нужен trusted core transport envelope, а vendor payload остаётся opaque.
- ZIP comments/extra fields/prefix/trailing/orphan data могли стать скрытым privacy/polyglot channel и не входили в allowlist.
- `file-import.js` и `genbank-parser.js` по умолчанию превращают unknown topology в `linear`; `sequence-utils.sanitizeSequence` молча удаляет invalid/U, а `lib/iupac.js` нормализует `U→T`. Эти tolerant helpers нельзя использовать как canonical reader/digest contract.
- `moleculeDigest` не имел exact material, не отделял physical-end identity от `generatedBy` и был слишком широко назван RC-invariant для ss/unknown DNA.
- Normal open, Recent/local open, inspect и recovery имеют разные mutation/trust boundaries, но прежний план описывал их одним flow.

## 3. Целевая архитектура реализации

### 3.1 Pure format core

Новый/реорганизованный format layer не должен зависеть от React, Zustand, Dexie или DOM. Он предоставляет:

```js
inspectBodgeZip(blob, policy)
verifyBodgeArchive(blob, policy)
decodeVerifiedBodgeProject(verifiedArchive, options)
validateBodgeManifestV2(value)
validateBodgeStateV2(state)
verifyBodgeIntegrity(blob, policy)
readBodgeV2(blob, options)
writeBodgeV2(state, options)
recoverCorruptBodge(blob, policy)
```

UI adapters отдельно преобразуют canonical DTO в runtime store и обратно.

`verifyBodgeArchive` возвращает immutable `VerifiedArchive`: проверенный central-directory index, manifest, exact entry descriptors и bounded verified byte readers. Он ещё не создаёт project DTO. `decodeVerifiedBodgeProject` становится доступен только после schemas/semantic adapters фаз B–E. Итоговый `readBodgeV2` является composition этих двух уровней.

### 3.2 Error model

Только format/conformance failures представлены `BodgeFormatError`. Policy challenge, user cancellation, file permission/I/O, repository/session conflict и recovery result имеют отдельные domains и не маскируются как «архив повреждён»:

```js
{
  name: "BodgeFormatError",
  code: "ASSET_HASH_MISMATCH",
  message: "Asset hash does not match manifest",
  path: "containers/c01.json",
  pointer: null,
  domain: "format",
  stage: "integrity",
  severity: "error",
  details: {},
  disposition: "inspect-or-recover"
}
```

Общий diagnostic contract: `{code, domain, stage, severity, path, pointer, entityRef, details}`. UI actions выводит отдельный classifier, а не один `recoverable` boolean: `retry`, `retry-large`, `inspect`, `recover`, `save-as`, `takeover`, `cancel`. Severity имеет только `error | warning | info`: error блокирует normal gate, warning не нарушает canonical correctness, info сообщает об отсутствии evidence/ignored weak UI ref. `policy-challenge` является отдельным operation outcome/domain code, не severity.

Минимальные format codes:

- `ZIP_CORRUPT`;
- `ZIP_UNSUPPORTED`;
- `PATH_INVALID`;
- `PATH_DUPLICATE`;
- `PATH_CASE_COLLISION`;
- `MANIFEST_MISSING`;
- `MANIFEST_PARSE_FAILED`;
- `MANIFEST_SCHEMA_INVALID`;
- `FORMAT_VERSION_UNSUPPORTED`;
- `CAPABILITY_UNSUPPORTED`;
- `ASSET_MISSING`;
- `ASSET_UNLISTED`;
- `ASSET_SIZE_MISMATCH`;
- `ASSET_HASH_MISMATCH`;
- `ASSET_COMPRESSION_MISMATCH`;
- `SCHEMA_INVALID`;
- `BIOLOGY_INVALID`;
- `PROJECTION_MISMATCH`;
- `PROJECT_CONTENT_DIGEST_MISMATCH`;
- `ARCHIVE_PAYLOAD_DIGEST_MISMATCH`;
- `SIGNATURE_INVALID`;
- `GENERATED_FROM_INVALID`;
- `RECOVERY_INDEX_MISMATCH`;
- `PRESERVED_DERIVED_STALE`;
- `PRIVACY_PROFILE_INVALID`.

Отдельные operation/repository/policy codes включают `RESOURCE_POLICY_CHALLENGE`, `OPERATION_CANCELLED`, `PERMISSION_DENIED`, `STORAGE_QUOTA`, `WORKER_FAILED`, `SAVE_CONFLICT`, `SAVE_VERIFY_FAILED`, `BINDING_UPDATE_FAILED`, `REPOSITORY_CAS_FAILED`, `LEASE_STALE`. `RecoveryReport` с partition `recovered/corrupted/missing/unsupported` является typed result, а не `RECOVERY_PARTIAL` exception.

CLI, tests и UI используют одни stable codes; тексты локализуются отдельно. CLI различает `valid`, `invalid`, `unsupported`, tool failure; recommended exit codes `0/2/3/1`.

### 3.3 Atomic state boundary

Завершённый `readBodgeV2` возвращает полностью проверенный canonical DTO + preserved inventory + capability limitations. Он не пишет в store/IndexedDB. Только caller после успешного Promise result строит `HydrationPlan` и выполняет одну транзакцию project repository; после commit происходит обязательный synchronous total runtime swap.

До repository commit cancel/failure оставляет текущий project неизменным. После commit операция является принятой: swap failure переводит приложение в safe reload/recovery screen из уже committed canonical document, а не возвращает пользователя к редактированию stale session. Recovery возвращает files/report и никогда не выдаёт partial DTO за normal project.

### 3.4 Local project repository и границы ownership

Для первого production cutover canonical project хранится локально агрегатом, а large bytes отдельно:

```text
repositoryMeta        — singleton schemaEpoch/cutoverState/cleanShutdown
projects              — derived listing/lifecycle cache без CAS ownership
projectDocuments      — canonicalState + uiLayout + assetInventory + localRevision/stateDigest
projectAssets          — project-scoped binary/preserved assets и staged refs по [projectId+assetId]
projectBindings        — file handle + opened/verified fingerprints
projectBackups         — last-known-good Blob или OPFS reference
projectLeases          — owner/epoch/heartbeat/expiresAt для durable fallback lock
```

Первый cutover фиксирует один новый Dexie schema epoch и следующие primary/index keys: `repositoryMeta: &key`; `projects: &projectId, updatedAt, lifecycleState`; `projectDocuments: &projectId, localRevision, stateDigest`; `projectAssets: &[projectId+assetKey], projectId, operationId, status`; `projectBindings: &projectId, savedStateDigest, rawFileFingerprint`; `projectBackups: &[projectId+backupId], projectId, createdAt`; `projectLeases: &projectId, ownerTabId, epoch, expiresAt`. Только `projectDocuments` владеет `localRevision/stateDigest`; listing-поля в `projects` являются проверяемым cache canonical metadata. `repositoryMeta` хранит resumable cutover step и clean-shutdown marker. Любое дополнительное поле/index сначала получает ownership и cleanup rule.

`localRevision` — монотонный CAS counter aggregate-а. Local `stateDigest` является domain-separated hash exact committed canonical document bytes, canonical UI layout bytes и ASCII-sorted committed asset inventory `{assetKey,size,sha256,mediaType,preservationMode}`; staged/orphan bytes не входят. Поэтому layout, attachment/source или preserved-extension edit делает файл dirty даже без изменения biology. Binding хранит `savedStateDigest` и `savedLocalRevision`; равенство одного counter без digest не считается доказательством совпадения file state.

Нельзя одновременно считать aggregate document и normalized containers/primers вторыми authoritative tables. Runtime Skeleton является projection/editor state, а не отдельной persistence. Старые development project tables и `bodge-skeleton` очищаются при cutover; converter development state не добавляется. Schema epoch switch сначала закрывает старые connections/writers, затем создаёт и self-checks новые stores, и только после этого удаляет development project-bound rows; personal rows `projectId:null` не участвуют в reset.

Global Library и global primer collection остаются независимыми personal stores. Project containers/primers живут только в `ProjectDocument`; копирование между областями — явная clone-команда с новым global ID. Одинаковые project-local primer IDs в разных проектах допустимы.

Frozen save snapshot MUST включать canonical document, attachment/source inventory и preserved unknown optional groups. `binaryAssets` в `HydrationPlan` означает staged Blob/OPFS refs + verified descriptors, а не несколько heap `Uint8Array`; temporary assets имеют operation namespace и удаляются при cancel/failure либо orphan GC.

### 3.5 Canonical write barrier

После cutover `ProjectDocument` изменяется только domain commands, которые принимают current `localRevision`/lease epoch и атомарно возвращают новый canonical document + asset mutations + diagnostics. Skeleton/Zustand/UI больше не собираются обратно в biology при Save.

- editor draft живёт отдельно до Apply;
- Apply sequence/annotation/topology edit создаёт immutable container record + revision, двигает head и обновляет exact refs одним command;
- committed undo является новой revert revision; обычный UI undo допускается только внутри ещё не applied draft;
- assembly/primer/evidence edits проходят собственные typed commands и сохраняют неизвестные optional envelopes/preserved fields;
- layout command меняет только `uiLayout`/local fingerprint, не biological digests;
- autosave пишет уже canonical ProjectDocument, explicit Save снимает immutable repository snapshot, а не реконструирует DTO из Skeleton;
- Runtime projection может содержать selectors/caches, но не получает права удалить непонятное canonical field при unrelated edit.

Обязательный characterization/integration case: открыть rich compound/fuzzy feature + unknown optional method/extension, изменить несвязанную metadata/layout, autosave/reopen/full Save — все unsupported/preserved bytes и fields остаются exact, а affected recompute остаётся запрещён.

Каждая session получает вычисляемую `SessionCapabilityMatrix` по entities/operations:

- `fully-editable` — поддержаны read/edit/recompute/write;
- `editable-unaffected` — unrelated canonical/UI edits и preservation Save разрешены, affected recompute запрещён;
- `preserve-only` — payload можно только exact переиздать/исключить explicit profile action;
- `inspect-only` — normal project session не создаётся.

Self-validation зависит от операции: новый archive, export/public supplement и recovered copy требуют Full; preservation Save с unknown optional method обязан пройти Structural/Integrity и воспроизвести ожидаемый `unsupported` на Biological/Full без расширения ограничений. UI command layer проверяет matrix до mutation, не после failed export.

## 4. Фаза A — schemas и secure reader

Цель: сделать архив недоверенным input и закрыть путь ZIP → runtime до начала перестройки биологии.

### A0. Format primitives без biology

До manifest gate реализовать и cross-language зафиксировать primitives, от которых уже зависит A3:

- strict UTF-8/JSON tokenization с duplicate-key и pre-JCS negative-zero checks;
- recursive NFC/LF normalization, post-NFC key-collision rejection и RFC 8785 JCS;
- incremental SHA-256 и CRC-32 над bounded streams;
- canonical asset descriptor material, capability union, `projectContentDigest` и `archivePayloadDigest`;
- Ed25519 statement/envelope verification и attestation declaration;
- deterministic diagnostic normalization.

Прямые dependencies выбираются до K-шага и pin-ятся: Ajv 8 + formats, одна проверенная JCS implementation либо собственный малый модуль с official vectors, streaming hash/CRC и WebCrypto/verified Ed25519 fallback. Транзитивная dependency не считается контрактом. A0 не знает container/assembly/evidence; `recordDigest`, `moleculeDigest`, `expectedSequenceDigest`, `revisionDigest`, `eventDigest`, `sourceRecordDigest` и `evidenceDigest` добавляются только в B0/E.

**Gate A0:** JS/Python vectors совпадают для NFC, JCS numbers, final-LF distinction, descriptor ordering, `projectContentDigest`, `archivePayloadDigest` и Ed25519 verification vector; streaming implementation не собирает whole asset в heap.

### A1. Trusted schema registry

Создать versioned registry, например:

```text
schemas/bodge/2.0.0/
  manifest.json
  recovery.json
  signature.json
  project.json
  container.json
  container-provenance.json
  shared/container-ref.json
  shared/location.json
  shared/physical-ends.json
  shared/feature-assertion.json
  assembly.json
  reactions/*.json
  primers.json
  notebook.json
  evidence.json
  external-refs.json
  extension-manifest.json
  ui-layout.json
  cases.json
```

Это единственный repository source schema/case corpus. Browser build и Python wheel получают generated/package-data copies; CI сравнивает их bytes с root corpus и запрещает ручное расхождение. `cases.json` хранит для каждого fixture expected disposition, максимальный conformance level и mandatory stable codes для обоих independent runners.

Требования:

- schemas компилируются одним Ajv registry в strict mode;
- core objects используют закрытый shape и explicit extension points;
- extension manifest является trusted core transport envelope; vendor schema/payload никогда не компилируются из archive;
- unknown namespaced optional kinds проходят только generic descriptor schema и не становятся canonical core;
- `fileFormatVersion` имеет `const: "2.0.0"`;
- `$schema` из archive выбирает известный schema ID, но содержимое schema из archive никогда не исполняется;
- inline validators либо удаляются, либо остаются thin wrappers над registry;
- cross-field и graph rules находятся в semantic validator, а не дублируются regex-ами в UI.

Внутренний порядок A1 фиксирован, чтобы не отдавать весь schema corpus одним sprint-ом:

- **A1.0 Inventory/characterization:** перечислить все `$schema`, которые реально пишет/читает код; зелёный characterization test фиксирует emitted IDs и отдельный expected-gap report, не оставляя suite red. Failing TDD test добавляется только внутри K-шага, который сразу реализует соответствующее покрытие. Production behavior не менять.
- **A1.1 Registry core:** pure `bodge-schema-registry.js`, один Ajv strict instance, deterministic error normalization, manifest/recovery/signature schemas и asset role/capability contracts; thin wrapper сохраняет текущий public API. Gate — unknown/archive-provided schema не исполняется.
- **A1.2 Biological records:** project, immutable container/head descriptors, container-provenance revisions/events и shared refs/location/ends/assertion schemas. Manifest уже знает `container-head`. Gate — valid/invalid fixtures + closed core shapes/explicit extension points, включая exact revision resolver и unknown topology rules.
- **A1.3 Graph/support records:** assembly, reactions, primers, notebook, evidence, external refs, extension manifest, UI layout. До red test каждый соответствующий normative union/required field уже обязан быть закрыт в спецификации; schema только машинно транскрибирует контракт и не изобретает новые поля, defaults или permissive escape hatches. Gate — весь registry компилируется strict, каждый emitted `$schema` известен и byte-equal опубликованной immutable schema copy.

Первый handoff после G0 ограничивается **A1.0 + A1.1**. A1.2/A1.3 получают отдельные CURRENT_TASK/gates; нельзя параллельно переключать reader или writer на ещё неполный registry.

### A2. ZIP central-directory preflight

До inflate реализовать inspector:

- bounds-safe EOCD/central directory parse;
- single-disk enforcement и explicit ZIP64 capability gate;
- offset-0 first local header, EOF-ending EOCD, no SFX/polyglot prefix/trailing bytes;
- empty archive/entry comments, no directory/orphan/overlapping entries и только declared ZIP64 extra fields;
- raw path и flags/method/size/external attrs;
- duplicate detection до object conversion;
- canonical path validation;
- case-fold collision detection;
- symlink/encryption/unsupported method rejection;
- полное raw equality local/central metadata и безусловное отклонение bit 3/data descriptors;
- compressed/uncompressed/entry-count policy;
- declared totals для progress и large-file confirmation.

`unzipSync` всего blob на main thread удалить из production open. Central directory читается через `Blob.slice`; `VerifiedArchive.openAsset(path)` отдаёт bounded chunks/stream. Inflate + incremental SHA работают с backpressure по одному/ограниченному числу assets. Structured JSON разбирается по одному; large binaries spool в temporary OPFS/Blob staging и не пересылаются цельным `Uint8Array` через Worker.

Soft web-default и explicit large-file mode отделяются от hard runtime capability. Storage preflight учитывает candidate + project assets + LKG (до 2–3 archive sizes); `navigator.storage.estimate()` — только hint, `QuotaExceededError` обрабатывается отдельно. Worker fallback на main thread разрешён лишь для малого bounded input. Tests измеряют buffered-byte budget/отсутствие full-blob `arrayBuffer`, а не нестабильный `performance.memory`.

### A3. Strict manifest/entry gate

Pipeline:

```text
central directory
→ path/policy validation
→ recovery + manifest bounded read
→ version/capabilities/schema + attestation declaration only
→ exact entry-set
→ byte-size/SHA-256/compression
→ strict UTF-8/JSON decode
→ trusted section schemas + signature envelope/declaration equality
→ content/archive payload digests + generatedFrom DAG
→ reconstruct signed statement + Ed25519 verification/trust classification
→ immutable VerifiedArchive
```

Ранняя attestation стадия проверяет только manifest declaration `path/algorithm/keyId`; ещё не хешированный signature asset не интерпретируется. После exact entry-set и asset hash gate envelope проходит strict JSON/trusted schema и mutual equality с declaration. Подпись нельзя проверять над ещё заявленными, но не пересчитанными digest values: cryptographic verify выполняется только после reconstructed `projectContentDigest`/`archivePayloadDigest` и byte-equal signed statement.

Phase A не строит production project DTO и не переключает live open. Reader больше не ищет assets через `startsWith("containers/")` и подобные globs. Semantic decode/validation подключаются после B–E поверх уже проверенного `VerifiedArchive`; до этого новый path работает только в inspect/tests.

JSON gate до schema validation отвергает invalid UTF-8, BOM, duplicate keys, post-NFC key collisions, non-finite representations и integers вне interoperable safe range. Обычный `JSON.parse` без duplicate-key detector недостаточен. Core JCS+LF bytes проверяются; opaque JSON по MIME не парсится.

### A4. Safe dictionaries

Все maps из untrusted keys:

- manifest assets;
- extensions/vendors;
- attachment maps;
- qualifiers;
- refs indexes;

строятся как `Map` или null-prototype objects. Vendor/ID path grammar проверяется общей функцией `canonicalizeArchivePath`.

### A5. Тестовый gate фазы A

- tampered, missing, wrong-size и unlisted asset блокируются;
- duplicate raw/canonical/case-fold path блокируется;
- traversal, absolute, UNC, drive, backslash, NUL и reserved name блокируются;
- symlink/encrypted/unsupported compression блокируются;
- `extensions/__proto__/x` не изменяет `Object.prototype`;
- too-many/too-large archive останавливается до full inflate;
- unsupported required capability блокирует writable open;
- required/optional duplicates, intersection, non-ASCII ordering и undeclared ZIP64 блокируются;
- unknown optional opaque даёт preservation inventory, unknown optional method — explicit capability limitation, а не guessed biology;
- invalid UTF-8/BOM, duplicate JSON keys и unsafe integers блокируются до DTO;
- prefix/trailing junk, comments, forbidden extra fields, overlap/orphan entry и generatedFrom cycle блокируются;
- near-policy archive возвращает retryable policy challenge, cancellation — neutral outcome;
- результат фазы — `VerifiedArchive`, а не partial canonical DTO;
- format error не оставляет partial state;
- UI остаётся responsive на near-policy fixture; progress monotonic, worker crash/cancel/late result deterministic.

## 5. Фаза B — canonical project и container

Цель: structured round-trip без skeleton extension.

### B0. Canonical primitives и revision foundation

До adapters реализовать отдельные pure modules:

```js
validateCanonicalDna(sequence)
reverseComplementCanonicalDna(sequence)
minimumRotationAscii(sequence)
canonicalizeMoleculeMaterial(container)
computeExpectedSequenceDigest(sequence)
computeContainerRecordDigest(container)
computeMoleculeDigest(container)
assessWholeMoleculeEligibility(expected, observed)
computeContainerRevisionDigest(revisionCore)
resolveContainerRevision(provenanceIndex, ref)
shiftLocation(location, delta)
clipLocation(location, interval)
reverseComplementLocation(location, length)
rotateCircularLocation(location, offset, length)
transformLocationForEdit(location, edit)
```

Это не production cutover. B0 переиспользует A0 canonical JSON/hash primitives и добавляет только biological identity/location algebra. Они нужны раньше assembly phase D: exact refs невозможно валидировать, если revision identity появляется только в E. Canonical DNA validator требует non-empty uppercase `[ACGTRYSWKMBDHVN]+` и ничего не исправляет; tolerant `sanitizeSequence`, search `normalizeSeq`, GenBank/FASTA defaults не переиспользуются. Import normalization является отдельным adapter с явным report.

Property tests фиксируют 0-based half-open coordinates, biological 5′→3′ order, circular wrap, fuzzy boundaries и digest vectors. Minimum rotation работает `O(n)` и сравнивает ASCII, не `localeCompare`; digest canonicalization не вращает stored record/features. Matrix: circular double = rotations + strict RC, circular single/unknown strand = rotations only, linear/unknown topology = stored orientation. Eligibility для comparison отделена от hashing. Существующий `resourceHash` не переиспользуется.

### B1. Canonical project DTO

Определить один adapter:

```js
legacyRuntimeToBodgeCandidate(runtime)
bodgeStateToRuntimeProject(dto)
```

Первый adapter используется только для pre-cutover characterization/import и обязан возвращать normalization/loss diagnostics; после F7 normal Save его не вызывает. Второй строит disposable runtime projection из authoritative canonical document. Decoder/composer расширяется по фазам без второго DTO: B hydrates project/container/UI root **и identity provenance index** (`headRevisionDigest`, revision cores, parents, external revision refs), сохраняя event bodies в typed pending inventory; D добавляет assemblies/primers и разрешает их exact revisions через этот index; E семантически подключает provenance events/evidence/sources/external refs и только тогда разрешает full composition. Неизвестный или ещё не подключённый support asset не удаляется и не попадает в normal session как guessed state. `project.json` получает полный normative shape: title, nullable description, tags, creators/identifiers с privacy visibility, license, timestamps, exact head refs `{id, revisionDigest}`, evidence refs `{id,evidenceDigest}` и explicit nullable pointers на optional support assets.

Manifest metadata больше не является скрытым вторым местом project fields.

### B2. Canonical container JSON

Добавить serializer/parser immutable record store `containers/<id>/records/<recordDigestHex>.json` и проверяемых head aliases `containers/<id>.json`, включающий:

- strict canonical DNA-IUPAC sequence; импортная uppercase/whitespace normalization происходит до DTO с diagnostics, invalid/U/gap не удаляются молча;
- `linear|circular|unknown` topology и `single|double|unknown` strandedness;
- discriminated physical ends для dsDNA, ssDNA и unknown;
- compound feature locations;
- required `level`, assertion и parent containment;
- qualifier arrays;
- closed origin kind без archive-local source locator; exact `{id, sourceRecordDigest}` живёт только в provenance import/observation activity;
- record/molecule digests.

Provenance связывает `revisionDigest → recordDigest`; record не содержит `provenanceRef`. Filename digest, embedded digest, JSON ID, provenance container ID и GenBank ACCESSION обязаны совпадать. Head alias byte-identical selected immutable record и имеет manifest kind `container-head`.

Semantic edit создаёт новый immutable record/revision и двигает head; overwrite current payload не может уничтожить referenced history. Revert переиспользует прежний record asset, но создаёт новую revision. Garbage collection разрешён только для доказанно unreferenced records и никогда не выполняется как побочный эффект save/export.

### B3. Runtime adapter

Нормализовать runtime variants на границе:

- `{circular: true}` → `"circular"`;
- `parentId`/`regionId` → один canonical parent field;
- `predicted/source/confidence/signals` → typed feature assertion/support; imported feature хранит только `sourceFeatureId`, а exact project source link живёт в revision provenance event. Отсутствие `predicted:true` не означает автоматически `reviewed`, а unknown signal нельзя молча удалить;
- string fuzz/compound ranges → object fuzz и biological 5′→3′ location order без coordinate sorting;
- legacy orientation aliases → `forward|reverse-complement`;
- ambiguous end chemistry → explicit ds/ss/unknown shape; неизвестное phosphorylation остаётся `null`;
- runtime origin labels → closed `manual|imported|derived|observed|unknown` union; assembly/reaction IDs живут в provenance event;
- timestamps/empty strings → normative nullable/absent representation.

Feature display colors/styles уходят в `ui/layout.json.featureStyles`, но исходные ApE/SnapGene color qualifiers сохраняются в qualifier bag для interop; adapter не выбирает одно из двух с потерей второго. UI adapter также единожды переводит DAG positions/viewport/collapsed state в typed layout keys и scalar namespaced `viewPreferences`; graph edges/biology никогда не попадают в layout.

Canonical writer не принимает неоднозначные variants напрямую.

### B4. Placeholders

Runtime objects с `origin.kind: "placeholder"`, пустой sequence или UI-only purpose исключаются до validation. Planned material сериализуется в assembly как `planned` piece, а не как container.

### B5. Skeleton extension

`extensions/bodgegene/` перестаёт содержать containers, pieces, reactions, primers, notebook или provenance. Layout/viewport/collapsed state переносится в `ui/layout.json`.

`bodgeStateToRuntimeProject` всегда строит biology из structured core. Extension не имеет override path.

### B6. Dark writer contract

Pure `writeBodgeV2` пишет только Bodge 2 и тестируется напрямую; эвристика `Array.isArray(input.containers)` и fallback на v1 в новом path отсутствуют. На этой фазе основной App save ещё не переключается. Empty project проверяется как valid Bodge 2 project, а не как v1 metadata-only archive. Production dispatch удаляется только единым cutover в F7 после готовности A–E и F1–F6.

### B7. Тестовый gate фазы B

- project/container/UI subset write→read deep-equal без `extensions/bodgegene/skeleton.json`; full graph/support equality является gate E/F, когда соответствующие codecs существуют;
- project description/tags/creators/identifiers сохраняются;
- circular остаётся circular;
- linear sticky-ended molecule сохраняет оба ends;
- ssDNA и honest unknown imported/observed records сохраняются без выдуманной chemistry/topology;
- placeholder отсутствует в assets;
- feature levels/assertions/fuzzy locations/qualifiers/parents сохраняются в canonical JSON;
- head + ancestor, metadata-only revision, revert и cross-container parent разрешаются через immutable record store;
- alias/filename/record/revision digest mismatch блокируется;
- удаление всех extensions не меняет biological DTO;
- dark writer никогда не создаёт v1 archive; live save остаётся старым до F7.

## 6. Фаза C — единый GenBank codec

Цель: одна качественная граница с внешними sequence tools.

### C1. Объединение codecs

Свести `bodge-container-genbank.js` и существующий общий GenBank exporter/parser к одному модулю. Library export, standalone import и Bodge projection используют один codec и одни fixtures.

### C2. Location model

Поддержать обе стороны преобразования:

- simple range;
- `complement`;
- `join`;
- `order`;
- fuzzy `<`/`>`;
- fuzzy `within`/`one-of` без silent flatten;
- point;
- between-base `^`;
- circular-origin feature;
- multi-line location.

Boundary conversion выполняется только здесь: canonical 0-based half-open ↔ INSDC 1-based inclusive. Canonical locations сохраняют biological 5′→3′ order; minus compound locations нормализуются одинаково из `complement(join(...))` и `join(complement(...), ...)`. Remote location получает explicit unsupported diagnostic.

### C3. Qualifiers и identity

- repeated qualifier values сохраняются массивами;
- valueless qualifier сохраняется как `[]`, explicit empty string как `[""]`;
- unknown qualifiers возвращаются при export;
- `/bodge_id` сохраняет stable feature ID;
- `/bodge_level` сохраняет `region|detail|point`;
- `/bodge_type` сохраняет Bodge type при lossy type mapping;
- `/parent_feature` является projection parent link;
- `/bodge_assertion`, derivation/method/source и confidence qualifiers сохраняют projected assertion; typed support остаётся documented JSON-only loss;
- `gene`, `product`, `codon_start`, `transl_table`, `EC_number`, `db_xref`, `pseudo` и другие standard qualifiers не теряются;
- ApE/SnapGene color qualifiers сохраняются отдельно от UI `featureStyles` и возвращаются при projection;
- invalid qualifier/location не игнорируется молча.

### C4. Projection parity

Writer генерирует record-specific `.gb` только из final immutable record JSON, затем head `.gb` из того же selected record. Manifest `generatedFrom` фиксирует exact immutable asset SHA-256. Full validator повторно парсит `.gb` и сравнивает ID, normalized sequence, known topology, levels/types/locations/parents и qualifiers. Unknown topology/strandedness помечаются как explicit lossy projection и не превращаются в linear/double silently.

Внешне изменённая `.gb` внутри ZIP — ошибка проекции. Для самостоятельного external `.gb` используется обычный import workflow, создающий новый canonical record/source.

### C5. Реальный interop corpus

Добавить реальные exports:

- SnapGene standard и SnapGene-flavoured GenBank;
- ApE;
- Geneious;
- NCBI/INSDC canonical;
- pLannotate output;
- собственный Bodge projection.

Каждый fixture содержит ожидаемую loss matrix. Симулятор строки не считается подтверждением стороннего round-trip.

### C6. Тестовый gate фазы C

- spliced CDS с repeated qualifiers проходит round-trip;
- fuzzy/point/between/cross-origin locations сохраняются;
- custom Bodge type восстанавливается;
- unknown qualifiers не исчезают;
- path ID = JSON ID = ACCESSION;
- historical non-head revision имеет собственную matching GenBank projection;
- unknown FASTA record не получает ложную circular/linear certainty и не может дать verification pass;
- mismatch projection блокирует full validation;
- один container, экспортированный Library и Bodge, даёт одинаковую GenBank biology.

## 7. Фаза D — единый assembly graph

Цель: сериализовать полный дизайн сборки без parallel junction state.

### D1. Canonical graph adapter

Определить:

```js
runtimeAssemblyToBodgeAssembly(zoneState, projectState)
bodgeAssemblyToRuntimeAssembly(assembly)
```

`runtimeAssemblyToBodgeAssembly` — только pre-cutover legacy candidate adapter с diagnostics; production commands после F7 изменяют canonical assembly DTO напрямую и normal Save его не вызывает. Reverse adapter остаётся disposable runtime projection.

Canonical sections:

- `pieces`;
- `reactions`;
- `connections`;
- `productRefs`.

Positions, bounds, collapsed и view mode хранятся в `ui/layout.json`.

Piece adapter фиксирует exact union:

- `sourced` — один exact container revision, один contiguous/circular-wrap slice, global orientation и expected sequence digest;
- `synthetic` — non-empty sequence + `standalone|primer-tail`;
- `planned` — no sequence/source/digest, typed length/topology/strandedness specification;
- `gap` — no sequence/source/digest, typed length/reason.

Runtime `snippet|synthesis` становятся synthetic; известный `gapSequence` тоже synthetic; materialized `intermediate` становится output container, пустой intermediate — planned. Multi-source runtime piece нельзя молча заморозить как один sourced piece.

### D2. Connections

Свести global junction и zone junction maps к одному canonical `connections[]` с:

- reciprocal owner `reactionId` ↔ `reaction.connectionIds`;
- typed left/right piece ends;
- exact closed chemistry union `overlap | golden-gate | ligation`;
- overlap/fusion/scar sequence, typed physical end requirements и correctly separated GG/RE enzyme refs в полях нормативной schema.

UI maps и validation status/warnings становятся derived selectors/diagnostics и не сериализуются как parallel graph state.

### D3. Typed reactions

Каждая reaction реализует exact normative envelope: stable ID, `planned|simulated`, mandatory namespaced `method {id, version, schemaDigest, capability}`, ordered inputs/outputs, reciprocal `connectionIds`, closed `params`, nullable opaque `methodData` и immutable engine/database metadata. Отдельного `expectedOutputDigests` нет: exact output revision разрешается к record/molecule digests. Root capability sets вычисляются из singular method `capability {id, criticality}`, а не из второго `requiredCapabilities[]` поля reaction. Для каждого core kind — отдельная params schema и validator:

- PCR;
- restriction;
- ligation;
- Gibson;
- Golden Gate;
- mutagenesis;
- synthesis;
- manual edit.

Core aliases нормализуются в registry; новые chemistry получают vendor/project namespace и не требуют нового format major, пока core params сохраняются. Method-specific extension живёт только в `methodData`; полностью новый класс использует `kind: external`, `params:{}` и required capability. Unknown optional chemistry читается/показывается generic с exact preservation; unknown required chemistry блокирует normal hydration/recompute/rewrite, но не isolated preview/extract. Архив никогда не содержит и не исполняет reaction code/schema.

Mapping фиксируется до adapter: overlap PCR→`pcr`, SLIC→`gibson`, MoClo→`golden-gate`, KLD→`mutagenesis`, RE digest/ligation остаются раздельными reactions. Конкретный workflow сохраняется namespaced `method.id`; GG и RE registries не смешиваются.

Reaction фиксирует ordered inputs, exact output revision refs, engine version и immutable database IDs/version/digests. `realiseAssembly` MAY материализовать expected product, но не является лабораторным replay validator.

### D4. Revision-bound sources

Sourced piece хранит container ID, revision digest, locations, orientation и expected slice digest. Resolver проходит provenance до immutable record asset, а не использует current head или `frozenSequence`. Поздняя правка container не должна ретроспективно менять старую assembly.

### D5. Hard pre-write validation

Перед записью проверить:

- глобальную уникальность IDs;
- все typed refs;
- reciprocal/connection endpoints;
- не более одного producer output revision;
- отсутствие reaction cycles;
- source revision/slice digest;
- primer and pair refs;
- end/overlap/fusion compatibility;
- строгую GG `registry:"gg"` / RE `registry:"re"` separation;
- KLD circular+backbone context и phosphorylated-primer requirement;
- запрет merge через ligation/re_ligation и невозможность фиктивного PCR fragment `<18 bp`;
- output topology;
- допустимые `planned|simulated` design states; author assertion/evidence scope/ref checks добавляются в E3/E4 после появления их schemas;
- planned/gap dependency не может иметь simulated materialized output.

Broken biology блокирует export. Recovery inspector MAY вернуть comprehensive warnings, но normal writer не создаёт invalid graph.

### D6. Primer refs

Реализовать project-scoped adapter строго по §12.1 спецификации: full `sequence = tail + bindingSequence`, собственная 5′→3′ reverse-primer semantics, status/origin/tags/notes, exact modification positions и pair records. Imported origin использует strong `sourceRef {id,sourceRecordDigest}|null`; source-excluding profile проецирует только его в `null` с omission report и никогда не retarget-ит sanitized source. Runtime aliases `tailSequence|tail` сводятся на границе; global `projectId`, `resourceHash`, `boundContainers`, bare `tm/gc/length` не попадают в canonical pool. Tm/GC сохраняются только как typed calculations с method/unit либо пересчитываются как derived UI data.

При любом merge/import ID remap применяется ко всем primer pairs и reaction refs. Автоматический dedup учитывает canonical physical identity `sequence + modifications`; coincidence является candidate, а не разрешением молча объединить logical IDs/metadata. Sequence-only hash не перепривязывает ссылки. Project-local IDs namespaced repository key `[projectId, primerId]`; два проекта с `primer-fwd` не конфликтуют в global Zustand/Dexie.

### D7. Тестовый gate фазы D

- PCR/restriction/ligation/Gibson/Golden Gate fixtures проходят deep round-trip;
- source revision drift обнаруживается;
- sourced/synthetic/planned/gap variants и invalid combinations покрыты;
- assembly на non-head source revision разрешается и не меняется при смене head;
- orphan/duplicate producer/cycle блокируется;
- ends и connection chemistry сохраняются;
- pair refs корректны после remap;
- tailed/reverse/modified primer и typed calculation проходят round-trip без runtime-only fields;
- imported primer source ref разрешается exact в full, становится `null` в source-excluding slice и не retarget-ится на sanitized record;
- одинаковые project-local primer IDs двух проектов не collision-ят, а personal global primer остаётся отдельным clone;
- unknown optional method проходит generic read/render, unknown required method даёт stable `CAPABILITY_UNSUPPORTED` на recompute;
- archive reaction payload не может загрузить/исполнить code или vendor script;
- legacy portable reader не вызывается новым path; subset export round-trip валидируется как standalone archive, import/remap остаётся отдельным будущим graph-transform scope;
- layout removal не меняет assembly JSON или `projectContentDigest`, но меняет `archivePayloadDigest` full archive и local `stateDigest`.

## 8. Фаза E — provenance, evidence, digests и sources

Цель: сделать ревизии, author assertions и scoped observations однозначными, не выдавая наличие файла за экспериментальное доказательство.

### E1. Canonical digest service

Добавить pure service:

```js
canonicalJsonBytes(value)
computeAssetSha256(bytes)
computeContainerRecordDigest(container)
computeMoleculeDigest(container)
computeExpectedSequenceDigest(sequence)
computeContainerRevisionDigest(revisionCore)
computeProvenanceEventDigest(event)
computeSourceRecordDigest(sourceRecord)
computeEvidenceDigest(evidenceRecord)
computeProjectContentDigest(assetIndex)
computeArchivePayloadDigest(manifestMaterial)
resolveContainerRevision(provenanceIndex, ref)
```

E1 завершает и централизует foundations B0; второй molecule implementation запрещён. Правила совпадают со спецификацией: NFC keys/values, post-NFC collision rejection, JCS без LF для domain digests и JCS+LF для core asset bytes. `assetDigest`, `recordDigest`, `moleculeDigest`, `expectedSequenceDigest`, `revisionDigest`, `eventDigest`, `sourceRecordDigest`, `evidenceDigest`, `projectContentDigest` и `archivePayloadDigest` не взаимозаменяются.

Circular dsDNA molecule digest нормализует origin и reference strand; circular ss/unknown-strand — только origin; linear/unknown-topology сохраняют orientation. Linear digest включает identity projection physical ends без `generatedBy`, но с geometry/overhang/phosphorylation. Равенство является duplicate candidate, не автоматическим merge IDs/revisions/evidence.

Один format-digest service расширяется по фазам, а не имеет трёх реализаций: A0 владеет strict JSON/SHA/`projectContentDigest`/`archivePayloadDigest`/signature primitives; B0 добавляет `expectedSequenceDigest`/`recordDigest`/`moleculeDigest`/`revisionDigest`; E1 добавляет `sourceRecordDigest`/`eventDigest`/`evidenceDigest` и единый facade. Dependency DAG: stage/hash selected opaque bytes → `sourceRecordDigest` → `moleculeDigest`/`recordDigest` → `expectedSequenceDigest` → `revisionDigest` DAG → provenance `eventDigest` → `evidenceDigest` → canonical/projection/derived serialization и остальные asset hashes → `projectContentDigest` → frozen attestation declaration → `archivePayloadDigest` → signature bytes → manifest → recovery. Activity/agent/time не входят в `revisionDigest`, archive path/provenance pointer не входят в `recordDigest`, а embedded source byte SHA входит только через source record material.

### E2. Container provenance

`provenance/containers/<id>.json` разделяет immutable revision cores (`revisionDigest`, `recordDigest`, sorted `parentRevisionRefs`) и immutable provenance events (`eventDigest`, optional `supersedesEventDigest`, subject, activity, agent/time). `headRevisionDigest` — mutable pointer. `mode: identity-only` позволяет public profile исключать private events, не меняя revision identity. Missing parent bodies объявляются как `external|profile-omitted`; global cross-container graph проверяется на cycles. GenBank COMMENT содержит только pointer/record digest.

B уже построил identity index для head/revision resolution; E2 не создаёт второй resolver, а добавляет event/source semantics поверх того же index. `activity.kind:"other".method.capability` входит в тот же exact root capability union, что reaction/evidence methods, asset descriptors и extension envelopes.

Current runtime «overwrite annotations» и «save as version → новый Library ID» нельзя использовать как storage semantics. Domain revision action сначала материализует record snapshot и parents, затем атомарно двигает project head; Library identity к этому процессу не относится.

Нельзя называть activity replayable, если нет полного typed operation и expected output digest.

### E3. Design state, author assertion и product verification

Три независимые оси не смешиваются в один enum:

1. `assembly.state: planned|simulated` — состояние вычислимого дизайна;
2. `constructionAssertion: design-only|reported-performed` — publication claim автора; это не вычисленный результат;
3. product verification status — derived из evidence для конкретного expected product revision и конкретного scope.

`simulated` требует engine output digest. `reported-performed` требует typed `constructionClaim {assertedBy, assertedAt, basis, note}`, но не становится `pass`; для `design-only` claim обязан быть `null`. Наличие attachment, Sanger trace или ручного checkbox само по себе не меняет ни design state, ни whole-molecule status.

Generic `experimentally_verified` удаляется из assembly/reaction schema до format freeze. UI не показывает единый зелёный статус «сборка проверена»: он показывает отдельно полноту истории, author assertion и scoped evidence.

### E4. Scoped evidence и whole-plasmid comparison

Добавить serializers/validators `evidence/*.json` как точную транскрипцию closed envelope/семи payload branches §11.3. Каждый record фиксирует:

- immutable expected subject revision/digest;
- отдельный observed container revision, если evidence основан на последовательности;
- обязательный `scope`: `whole-molecule`, `regions`, `junctions` или `property`;
- method/tool/version/time/agent;
- `assessmentMode: computed|reported` и kind-specific payload;
- attachments только как supporting refs;
- normalized result и summary;
- `evidenceDigest`, exact `(id,digest)` refs и weak typed supersedes chain.

Evidence immutable по `(id,evidenceDigest)`; исправление создаёт новый ID/digest с `supersedesEvidenceRef`. Expected/observed/source refs разрешаются до exact records, comparison digests сверяются с resolved molecules. `stale` относительно нового head вычисляется UI и не записывается как ошибка evidence.

Kind schemas отдельно фиксируют whole-plasmid, Sanger, restriction analysis (`registry: re` only), gel, regional sequence alignment, manual review и namespaced `other`. Sanger/manual/gel не получают whole-molecule pass; полный consensus проходит через отдельный observed container и whole-plasmid comparison.

Evidence `method.capability` участвует в том же exact root required/optional capability union, что reaction method/asset/extension declarations. Unknown `other` evidence не исполняется и получает explicit unsupported/generic disposition; capability нельзя спрятать только внутри payload.

Whole-plasmid comparison в prerelease принимает готовый consensus FASTA/GenBank и никогда не меняет expected container. Быстрый путь сравнивает canonical `moleculeDigest`: origin + reverse-complement invariant только для circular dsDNA, rotations-only для circular ssDNA, stored orientation для linear/unknown topology. `matches-expected`/pass prerelease допустим только при `assessmentMode:computed`, known compatible circular dsDNA, полной длине, обеих ACGT-only sequences, non-truncated comparison, exact digest match и empty variants. Остальные valid molecule digests всё равно вычисляются, но ambiguity/unknown topology or strand/partial/timeout/resource limit дают `inconclusive`.

Raw reads MAY храниться только как private supporting attachments full-профиля. Они не обязательны для evidence, не обрабатываются BodgeGene prerelease и не попадают в `public-supp`.

### E4.1 Canonical notebook record

Добавить отдельный adapter `notebook/entries.json` по closed shape §12.2 до подключения attachment bytes в F3. Entry сохраняет author/time/title/markdown/tags, exact typed entity refs и declared attachment IDs; `authorRef` разрешается через project creators, container/evidence refs закреплены revision/evidence digest, assembly-local refs содержат `assemblyId`. Journal order семантичен, а `refs`/tags/attachment IDs имеют нормативную set-ordering.

Legacy `deviceId`, blob URLs, inline expected/actual Sanger sequences и generic `verified` checkbox не переносятся. Structured Sanger/sequence result становится evidence E4, observed sequence — container, а notebook лишь ссылается на них. Registry metadata живёт в том же notebook asset; bytes, MIME/magic и omission projection реализуются F3. Notebook UI обязан подключить `NotebookTab` к живому workspace, иметь явный draft/commit lifecycle, безопасный markdown renderer, typed reference picker и attachment registry; отдельного notebook data contract нет.

### E5. Original sources

Import pipeline вычисляет exact SHA-256 исходного файла и создаёт immutable source record с `sourceRecordDigest` и `visibility: public|private`. По policy bytes MAY быть embedded в `sources/<sha256>/<safeName>`. Canonical container `origin` хранит только закрытый origin kind; exact связь с source выполняется provenance activity `sourceRef {id, sourceRecordDigest}` и не входит в `recordDigest`. Feature assertion сохраняет лишь optional source-internal `sourceFeatureId`, не project `sourceId`; primer origin может хранить exact source pair, но profile projection применяет правило D6.

Sources не становятся source of truth. `public-supp` получает `project.sources:[]`/`refs.sources:[]` и исключает source metadata/bytes; публичные accession/URL идут через public external refs. Sanitized source stub разрешён только explicit `custom`, получает новый `sourceRecordDigest`, требует identity-only provenance и omission всех events со старым sourceRef; event никогда не retarget-ится. Source bytes входят в `full` только по canonical `embedded:true`, а в `custom` — по explicit selection + license/privacy confirmation.

### E6. Determinism

- recursive NFC/LF, post-normalization key collision rejection и stable JCS для digest material;
- JCS bytes + один LF для каждого core structured asset;
- schema registry ordered-vs-set array semantics и ASCII, не locale, sorting;
- injected clock;
- UTF-8 byte size;
- sorted ZIP paths;
- fixed comments/extras/timestamp/attrs/creator metadata и pinned compressor profile для reproducible fixture export.

Одинаковые canonical state, export profile, capability sets и selected opaque payload дают одинаковый `projectContentDigest`. Одинаковый `archivePayloadDigest` требует одинаковых `createdBy`, profile, project pointer, capability sets, extension index, attestation declaration, `projectContentDigest` и полного normalized набора non-attestation asset descriptors. Cross-implementation ZIP bytes могут различаться из-за DEFLATE; byte-identical golden требуется только от pinned reference writer с fixed clock/transport profile.

### E7. Тестовый gate фазы E

- record change меняет record digest;
- parent-set change меняет revision digest, а event sanitization — нет;
- parent order не меняет revision digest;
- feature-only change не меняет molecule digest, но меняет record digest;
- circular dsDNA rotation/reverse-complement даёт тот же molecule digest; ss/unknown-strand RC не нормализуется, linear/unknown-topology не вращается;
- разные topology/ends дают разные molecule digests;
- schema отвергает generic `experimentally_verified` для assembly/reaction;
- author assertion shape/creator refs и evidence `(id,evidenceDigest)`/scope/supersedes refs проходят closed semantic validation;
- notebook entry order, creator/typed refs, declared attachment set и запрет legacy Sanger/device/runtime fields проходят round-trip;
- provenance `other` capability участвует в exact root union; missing/extra/wrong-criticality token блокируется;
- author assertion не создаёт computed verification result;
- AB1 attachment без scoped evidence не меняет product status;
- Sanger junction evidence не повышает whole-molecule scope;
- rotated и reverse-complement circular dsDNA consensus дают exact molecule digest match; ambiguity или unknown strand всё равно не получает pass;
- SNP/indel дают `differs`, а partial/ambiguous/unknown-topology — `inconclusive`;
- different molecule digests с вручную записанным `result: pass` блокируются validator;
- evidence старой expected revision становится stale, но не перепривязывается автоматически;
- head + ancestor, non-head assembly ref, metadata-only revision, revert, fork и two-parent merge проходят;
- provenance head/project exact ref/head alias совпадают с immutable record;
- identity-only public provenance сохраняет revision digests и явно объявляет omitted parents;
- revision/record/event digest mismatch и global parent cycle блокируются stable codes;
- source bytes/hash/path согласованы;
- после подключения D/E codecs полный ProjectDocument write→read deep-equal без Skeleton snapshot, включая assemblies, primers, provenance, evidence, sources и preserved inventory;
- Unicode metadata size считается в bytes;
- derived-only change сохраняет `projectContentDigest`, меняет `archivePayloadDigest`; compression-only repack сохраняет оба;
- final LF влияет на asset SHA, но не domain digest; cross-language vectors и deterministic golden стабильны.

## 9. Фаза F — export, save и recovery

Цель: подключить спецификацию к живым пользовательским путям.

### F1. Profile внутри writer

`writeBodgeV2` первым шагом применяет allowlist profile к immutable copy. `public-supp` строится не как полный архив с последующим blacklist-strip, а заново из выбранного publication product и его transitive dependency closure.

В публичный closure входят только fixed public project projection, ровно один assembly product, exact material/product revisions, соответствующие immutable records и record-specific GenBank, referenced primers, явно selected `whole-plasmid-sequence-comparison`, observed consensus, все public external refs и fixed derived publication artifacts. Resolver никогда не подменяет non-head revision текущим head. Imported primer origins получают `sourceRef:null`, потому original source records исключены; это deterministic profile projection с report, не sanitized retarget. Unselected evidence не передаётся renderer и не может влиять даже на prose. Непустые notebook entry records/markdown, raw reads, attachment/source bytes и source records, UI, extensions, runtime blob maps, device/local identifiers, private creators/identifiers/refs/events и локальные URL запрещены; единственное исключение — registry-only `notebook/entries.json` с `entries:[]` и exact omission records для attachments retained evidence.

После фильтрации explicit selection выбирает primary revision каждого container ID, пересчитывает exact project refs, capabilities, head aliases, projections, README, publication files, asset hashes, `projectContentDigest` и `archivePayloadDigest`. Preview и writer используют один immutable export plan; изменение исходной revision инвалидирует plan. Нельзя сначала сгенерировать Methods/TSV/diagram из полного private state, а затем пытаться очистить строки: renderer получает только filtered snapshot.

Обычный project `Save` всегда использует `full` semantics и не считается filtering: unknown optional independent opaque bytes и extension groups переиздаются exact-uncompressed-byte/atomic-group. Удаление возможно только explicit export/loss action. Unknown preserved derived output при изменённой dependency блокирует Save; writer не обновляет `generatedFrom`, не оставляет stale bytes и не удаляет их молча.

### F2. Privacy report

Export preview показывает фактический post-filter состав:

- asset count и total bytes;
- creators/timestamps и project metadata;
- все retained free-form container/assembly/feature qualifier, primer, claim/evidence summary и external-ref fields с asset path/JSON pointer;
- notebook text;
- attachments, raw reads, selected/omitted evidence и sources;
- external URLs;
- extensions и privacy classes;
- исключённые категории.

`public-supp` проходит recursive leak scan. Sensitive binary нельзя включить скрытым runtime field. Scanner проверяет запрещённые поля, path patterns и supplied canaries, но не заменяет human review biologically meaningful free text; preview и final writer используют один frozen filtered snapshot/report.

### F3. Attachments

Единый MIME/path registry v1 из §12.3 используется upload, notebook, writer и reader. Set embedded registry records один-в-один совпадает с manifest attachment assets, включая path/mediaType/size/SHA; manifest-only, registry-only и MIME magic mismatch — hard errors. `full` сохраняет весь registry/bytes, filtered profile не оставляет unreferenced records. Unknown и active formats — download-only. Public omission records имеют exact null fields/set equality и не считаются bytes/evidence.

### F4. README и publication artifacts

Фаза F4 реализует derived-asset interface, `generatedFrom` DAG, Markdown/TSV/PNG safety validators и profile path conditions, но не прячет ещё не существующие product renderers. Core README renderer работает только для `full` и `public-supp`; bundle/single README запрещён. Actual Methods/PNG/TSV/verification renderers создаются в G2 и подключаются allowlist writer в G3.

Contract output для `public-supp`: `publication/methods.md`, `publication/assembly.png`, `publication/materials.tsv`, `publication/verification.md`; `publication/primers.tsv` только при referenced primers; `publication/variants.tsv` только при selected `differs` с non-empty variants. SVG/PDF в этом profile не входят. В `full`/`custom` publication paths разрешены только при non-null single-product selected slice; multi-product binding не агрегируется. Bundle/single запрещают publication paths.

Каждый projection/derived asset имеет acyclic direct `generatedFrom` с digest filtered canonical inputs и generator metadata там, где output зависит от codec/renderer/locale/options. Все user strings проходят Markdown/TSV escaping; raw HTML, remote resources, spreadsheet formulas и scriptable schemes запрещены. Safety validator является обязательным writer gate.

Optional Ed25519 envelope подписывает и semantic `projectContentDigest`, и полный `archivePayloadDigest`, а также profile + required/optional capabilities. Поэтому tamper Methods/README/PNG/TSV/GenBank с пересчитанным unsigned manifest hash всё равно инвалидирует подпись. Archive public key позволяет проверить cryptography, но trust остаётся внешним.

### F5. Verified save

Заменить прямой App save на capability-aware service:

Writer является двухпроходным. `ArchivePlan` содержит immutable profile selection, staged/spooled uncompressed и compressed assets, sizes, CRC/SHA, descriptors, `projectContentDigest`, frozen `attestationDeclaration|null`, `archivePayloadDigest`, optional signature, final manifest и recovery bytes. Его внутренний DAG совпадает с §10.9 спецификации: opaque source bytes hash до source/event identity; expected sequence до assembly; evidence digest до project refs; attestation declaration до archive payload digest; signature bytes после него. Только после полного plan создаётся `ArchiveArtifact {size, rawSha256, streamOrStorageRef}` и ZIP stream с `_recovery.json` первым. File System Access path пишет из OPFS/stream; bounded Blob допустим только для малого download fallback. Abort/failure между materialize, compress, hash, manifest, recovery и ZIP emission очищает operation namespace.

1. взять per-project save mutex и frozen latest authoritative ProjectDocument + asset inventory + `SessionCapabilityMatrix`;
2. построить `ArchivePlan`/candidate и self-verify на уровне операции: Full для new/export/public/recovered; Structural/Integrity + expected unsupported disposition для exact preservation Save;
3. получить permission и сравнить current disk bytes с opened-file raw SHA-256 fingerprint; size/mtime — только fast hints;
4. durable сохранить предыдущую copy, verified на её declared disposition, в OPFS/IndexedDB; quota failure по умолчанию блокирует overwrite и предлагает Save As;
5. непосредственно перед первым write повторить external fingerprint check;
6. `createWritable` → write → close; portable cancel fence наступает не позже начала overwrite;
7. reread через file handle, повторить operation-required validation/disposition и сравнить raw candidate/reread SHA-256;
8. CAS-обновить binding generation/fingerprint и `savedStateDigest` exact snapshot, не требуя отсутствия более новых canonical edits;
9. если после snapshot появились edits, они остаются `fileDirty`; если disk verified, но binding CAS failed, вернуть отдельный `BINDING_UPDATE_FAILED` outcome «файл записан, локальный статус не обновлён».

Download fallback гарантирует только pre-download self-verification и честно сообщает отсутствие reread/conflict guarantee. `Save`, `Save As` и `Export copy` — разные requests: export не меняет binding/dirty, а Save As привязывает файл только после reread verification.

Save As существующего target является overwrite и проходит те же conflict/LKG gates. Повторный Ctrl+S coalesce текущий request, но edit during save ставит максимум один follow-up Save; Save As/Export Copy не coalesce с Save. При `SAVE_CONFLICT` первый UX предлагает `Save As`, `Inspect external`, `Cancel`, без unsafe «перезаписать всё равно». Остаточная race после второго fingerprint check в Web API честно документируется.

File System Access API не даёт переносимой гарантии sibling-temp + atomic rename. Поэтому обещание web-клиента — verified overwrite с LKG и conflict detection, а не недоказанная filesystem atomicity. `bodge-atomic-write.js` memory adapter нельзя выдавать за production guarantee.

### F6. Recovery

- `_recovery.json` первым и `manifest.json` вторым, оба STORE/ZIP32; data descriptors запрещены всем entries;
- recovery index one-to-one сверяется с final manifest/local/central path, size, compressedSize, CRC, SHA и compression;
- byte-walk использует статический ESM inflate;
- local headers проходят те же path/policy checks;
- recovered bytes сверяются по size/SHA-256;
- report точно делит `recovered`, `corrupted`, `missing`, `unsupported`;
- partial result не называется valid `.bodge`;
- RecoveryReport не создаёт ProjectSession/lease/autosave; safe preview изолирован и read-only;
- переход в normal project возможен только после явного «Сохранить восстановленную копию…» → normal writer/full validation → verified Save As/reread → новый strict file open.

### F7. Production persistence и единый cutover

Подключение выполняется одним направленным cutover, без dual-write и без промежуточного состояния «часть entrypoints strict, часть legacy».

#### F7.0 Operation contracts и state machines

До repository/controllers определить четыре discriminated requests:

```text
open-file     — strict external .bodge verification + writable hydration
open-local    — Recent из canonical local working copy, без reread bound file
inspect-file  — immutable report, без lease/repository/runtime hydration
recover-file  — verified asset partition, без normal project session
```

Отдельный `ProjectLifecycleController` владеет requests `create-project`, `close-project`, `trash-project`, `restore-project`, `purge-project`, `update-project-metadata` и `startup-resume`. Switch всегда является open-file/open-local после draft/autosave guard; публичный `activateProject(id)` запрещён и остаётся только внутренним post-hydration action. Create сначала получает lease и атомарно создаёт empty canonical document + session либо полностью rolls back. Close выполняет `sealAndFlush`, затем release lease и total runtime clear; failed flush блокирует close. Trash является reversible lifecycle mark после guard/flush, restore снимает его. Purge active project удерживает lease через `sealAndFlush` и delete transaction; document/assets/binding/backups и project-owned compatibility rows удаляются первыми, lease — последним, чтобы между close/release и purge не возник stale writer race. Personal stores/clones не удаляются. Crash-startup проверяет resumable cutover/clean-shutdown marker, lease expiry и repository integrity до resume.

Cleanup matrix freeze-ится до реализации: `trash` меняет только lifecycle state; `restore` снимает mark; `purge` удаляет `projectDocuments`, `projectAssets`, `projectBindings`, `projectBackups`, listing cache и оставшиеся project-owned Library/primer/Skeleton rows, но сохраняет personal clones. `update-project-metadata` является одной canonical command/одним CAS для title+description+tags, а не цепочкой независимых autosaves из `ProjectInfoModal`.

Normal file open до `repository-commit` не меняет project state:

```text
source → preflight → optional large-file consent → integrity/full decode
→ candidate-ready → collision choice → draft switch guard
→ non-blocking target lease → quiesce/flush current session → target CAS recheck
→ stage assets/HydrationPlan → repository-commit [point of no return]
→ synchronous total runtime swap → active → release previous lease
```

`open-local` ждёт repository readiness, проверяет local `stateDigest`/schema/semantics и открывает canonical working copy; bound disk file автоматически не перечитывается, иначе потеряются locally autosaved, но ещё не exported edits. `inspect-file` не получает lease/collision dialog и не рендерит archive Markdown/SVG/HTML как active content. `recover-file` заканчивается `RecoveryReport`; normal open возможен только после explicit verified Save As.

Общий progress/cancel envelope: `{operationId, phase, completedBytes, totalBytes|null, completedItems, totalItems, cancellable}`. `AbortSignal` проверяется на phase/chunk boundaries; Worker protocol имеет request ID, progress, cancel, `onerror`, `messageerror`, ignore-late-result. Новый request отменяет старый только до commit fence; во время IndexedDB transaction cancel отключён. Save cancel безопасен только до portable overwrite fence. Staged assets/lease очищаются при любом pre-commit exit.

Состояние изменений разделить:

```text
draftDirty      — unapplied editor draft
localDirty      — edit generation ещё не подтверждена repository CAS
fileDirty       — current stateDigest != binding.savedStateDigest или binding отсутствует
bindingStatus   — unbound|bound|permission-lost|external-conflict|verification-failed
autosaveStatus  — idle|pending|writing|failed
```

`beforeunload` не является async persistence. Continuous local autosave — основная гарантия; pagehide/visibilitychange best-effort. Switch/unmount вызывает `sealAndFlush`; autosave failure/draft guard блокируют switch, один `fileDirty` — нет, потому disk save намеренно отдельный.

#### F7.1 Repository/session — dark

Создать отдельные модули `project-repository.js`, `project-session.js`, `project-lease-service.js`, `project-autosave-coordinator.js`, не добавляя orchestration в крупные slices/App. Repository применяет заранее построенный `HydrationPlan`:

```js
{
  projectId,
  expectedLocalRevision,
  canonicalDocument,
  binaryAssets,
  runtimeProjection,
  uiLayout,
  bindingCandidate,
  sessionToken,
  leaseEpoch
}
```

Unzip/hash/schema/network/React callbacks внутри IndexedDB transaction запрещены. Transaction повторно проверяет `expectedLocalRevision` и lease epoch, атомарно заменяет document/assets/binding, дожидается `oncomplete`; только после commit один synchronous Zustand action меняет все project-scoped slices. Pre-commit failure оставляет прежний active project целым; unexpected post-commit swap failure ведёт в safe reload из committed canonical document, а не продолжает stale session.

#### F7.2 Session, locks и autosave

`ProjectLeaseService` выдаёт `{projectId, ownerTabId, epoch}`. Durable IDB epoch является fencing token и при `navigator.locks`, и при fallback; browser lock координирует, но не заменяет CAS/ABA protection. Каждый hydrate/autosave несёт epoch + expected revision; поздний debounce старой session получает CAS failure. Same-ID reopen переиспользует собственный lease. Новый target lease приобретается non-blocking до отпускания старого, чтобы cross-open двух вкладок не создал deadlock; старый освобождается только после successful transaction/runtime swap.

`SkeletonProvider` получает synchronous `initialState` и `key={sessionToken}`, не вызывает `loadSnapshot()`. Autosave coordinator per-session, а не module-global; каждое edit увеличивает `editGeneration`, debounce захватывает generation/session/lease, CAS подтверждает только захваченное, а новые edits планируют следующий flush. Cleanup `sealAndFlush` session-aware. Lease loss делает session read-only и инвалидирует queued writes. Pending editor drafts не применяются автоматически: explicit file save предупреждает и исключает unapplied draft либо пользователь сначала нажимает Apply.

Для браузеров без `navigator.locks` требуется честный tested single-tab/IDB lease fallback, а не вечный `multiTabBlocked`.

Fallback lease store содержит `{projectId, ownerTabId, epoch, heartbeatAt, expiresAt}`. Acquire/takeover выполняется CAS transaction; heartbeat продлевает только тот же owner+epoch; expiry не означает автоматическую запись stale tab. Потеря lease немедленно делает session read-only. Close/trash/restore/purge/crash-startup и browser lifecycle имеют explicit release/expiry tests.

Takeover не основан на timeout вроде `500 ms`. Новый tab отправляет request; старый выполняет `quiesce → sealAndFlush → stop timers/workers → epoch relinquish` и только затем acknowledgement. Новый owner после ack либо proven expiry атомарно увеличивает durable epoch и повторно проверяет repository CAS до hydration. До завершения handshake blocked/read-only session не может Save/Save As или мутировать repository; MAY быть доступен только `Export Copy` из уже committed snapshot с явной read-only маркировкой. Late acknowledgement/heartbeat старого epoch игнорируется.

#### F7.3 Ownership split

Open project не вызывает `addLibraryEntriesBulk` и не merge-ит primers в global map. Project containers/primer pool сохраняют IDs внутри project namespace. Explicit «Скопировать в Library/личный пул» создаёт независимый clone с новым global ID и origin. Global edits/deletes не меняют project biology; project purge не удаляет global clones.

Финализированный Search должен получать project и global entities через typed read adapters с явным scope, а не через повторное создание project-owned Library rows. Format cutover не меняет search UX/алгоритм и не смешивается с его активным sprint.

#### F7.4 Unified open controller

Все entrypoints вызывают один `ProjectOpenController`, но с явным request kind. Ctrl+O, StartScreen file helper и file drop используют `open-file`; Sidebar/MainPanel/ProjectContextBar, Library tree/project zone, Search pick router и generic `open-entry-action` используют `open-local` для существующего repository project и не reread bound disk file. Ни один component не присваивает `currentProjectId` и не вызывает публичный `activateProject` напрямую. Exact matrix фиксируется architecture test по callsites до switch. File sequence:

```text
strict read без mutations
→ direct repository collision lookup
→ collision decision
→ draft switch guard
→ non-blocking acquire/reuse target lease
→ quiesce/flush current session
→ build HydrationPlan
→ CAS repository transaction
→ one runtime swap
→ route UI
→ release previous lease
```

Collision choices: заменить working copy файлом (с recovery snapshot), оставить локальную working copy, отменить. `Open as copy` не предлагается до полноценного remap всех IDs/refs/digests. После dialog CAS повторяется. Bootstrap repository имеет readiness barrier; delayed hydrate не может перезаписать уже открытый файл. Local repository corruption является отдельной ошибкой и не вызывает silent fallback на disk.

Все file entrypoints имеют один prepare/validate/lease/commit contract. Characterization отдельно фиксирует, что текущие `App.handleOpen`, `StartScreen/lib/open-bodge.js` и drop flow по-разному мутируют Library/Skeleton и принимают `.bodgeassembly`; после cutover mutation до repository commit запрещена для каждого из них. Пока repository inventory и active-session readiness не завершены, create/open/recent actions disabled, а delayed bootstrap не публикует partial project list/runtime state.

#### F7.5 Unified save controller

App только вызывает `ProjectSaveController`, который использует F5, current lease/epoch и latest immutable canonical repository snapshot; runtime/Skeleton reconstruction и старый IndexedDB skeleton для explicit save не читаются. Failure write/close/reread/verify сохраняет LKG и dirty state. Disk lifecycle обновляется только после exact reread match.

Binding всегда project-scoped; singleton runtime `fileHandle/fileName` не является authority. При switch A→B контроллер устанавливает binding B из committed session либо `unbound` до доступности Save. Acceptance case обязателен: привязать A, открыть B, нажать Ctrl+S — ни один byte A не меняется; handler не может захватить stale handle из предыдущего render/session.

#### F7.6 Recovery и subset imports

Recovery report сам не создаёт active project. Только после explicit verified Save As recovered copy проходит новый strict `open-file` flow. В первом cutover `single-assembly`/`containers-bundle` являются export-only: subset import откладывается до отдельного graph-transform спринта, потому ID remap меняет paths, GenBank ACCESSION, `recordDigest`, `revisionDigest`, `eventDigest`, `sourceRecordDigest`, `evidenceDigest` и все assembly/evidence/primer refs. Ненормативный `.bodgeassembly` merge path удаляется из parser, file accept/drop routes и Help UI; inventory обязательно включает `StartScreen.jsx`, `StartScreen/HelpPopover.jsx` и `lib/bodge-assembly-portable.js`. `libraryEntries` из архива не принимаются.

#### F7.7 Final switch/removal

F7.7 является одним release cutover, но не одним гигантским K-step: сначала все live create/activate/open/close/trash/restore/purge/save/export callsites переводятся на тонкий facade с прежним поведением, затем один минимальный switch заменяет backend facade без dual-write. После switch отключаются `bodge-skeleton` biology persistence, production v1 dispatch, direct file write, Library pollution и validator/profile bypasses. Reset protocol: записать resumable cutover marker → остановить/await старые debounced writers → закрыть старые DB connections → создать/проверить новую schema → сохранить personal Library/primer rows (`projectId:null`), snippets, commonFeatures, customEnzymes и enzymeSets → удалить только development project-bound rows/`bodge-skeleton` → записать clean marker. Startup идемпотентно продолжает с последнего подтверждённого шага. Общий `clearAll()` запрещён. LKG retention/orphan staging GC имеют отдельные policy/tests. File converter development archives не создаётся. Старый code MAY остаться только как явно изолированный import tool вне Bodge 2 conformance, если это отдельно решено до cutover.

Facade preparation покрывает не только lifecycle: project-owned imports, clone/extract results, annotation/container edits, assembly/primer writes и metadata updates также становятся typed domain commands до backend switch. Architecture rule после cutover запрещает прямые `putProject`, `putLibraryEntry`, `putPrimer`, `saveSnapshot`, `currentProjectId=` и public activation calls вне repository/legacy-isolation adapters.

Reset имеет явную allow/delete matrix для каждого IndexedDB store, отдельной `bodge-skeleton` DB и каждого принадлежащего BodgeGene localStorage key. `SettingsModal` user reset и one-time format cutover reset — разные commands; `localStorage.clear()` запрещён, чужие origin keys не удаляются. Cutover self-check доказывает, что personal rows и настройки из allowlist сохранены, а project-bound development state удалён ровно один раз.

### F8. Export UI

Подключить `ExportProjectModal` к реальному action и одному publication controller. Preview и final writer получают один frozen profile spec. Save project и export copy используют один format core, но разные profile/options.

UI taxonomy замораживается до wiring: `Save`, `Save As`, `Bodge Export Copy/Profile`, `GenBank bundle`, `single GenBank` и `Publication Pack` — разные typed requests. Текущий `LibraryWorkspace.onExportProject`, создающий ZIP из GenBank, MUST быть переименован/маршрутизирован как `GenBank bundle`, а не маскироваться под Bodge export. Только Save/Save As могут обновлять file binding и `savedStateDigest`; остальные всегда создают unbound copies.

Точки входа Product/Assembly/Library ведут в один flow «Паспорт конструкции / Пакет к статье». По умолчанию пользователь видит готовый паспорт и одну основную кнопку экспорта; подробный слой позволяет выбрать product, author assertion, evidence и inspect privacy closure. Отсутствие sequencing не блокирует design-only package.

### F9. Тестовый gate фазы F

- `public-supp` не содержит непустых notebook entry records/markdown, raw reads, arbitrary attachment bytes, source records/bytes, UI, extensions, device/local identifiers или private creators/identifiers/refs/events; registry-only `notebook/entries.json` с `entries:[]` допустим и обязателен только для exact omission records всё ещё referenced attachments;
- selected whole-plasmid comparison и его observed consensus входят в closure; другое/невыбранное evidence отсутствует;
- referenced imported primers сохраняют sequence/modifications/IDs, но имеют `sourceRef:null`; original/sanitized source retarget отсутствует;
- missing/extra omission records, attachment registry/descriptor MIME mismatch и unreferenced filtered attachment блокируются;
- private evidence `agentRef`/claim `assertedBy`, public source record/bytes, extension и ambiguous multi-product publication блокируют `public-supp`;
- unselected-evidence/free-text canaries не попадают в renderers; public external-ref set exact и dangling selection невозможен;
- dependency closure single assembly не имеет dangling refs;
- Methods/materials/diagram/verification и conditional primers/variants artifacts построены из filtered snapshot и имеют актуальный `generatedFrom`;
- derived tamper меняет `archivePayloadDigest` и инвалидирует signature даже при обновлённом manifest asset hash;
- пакет без sequencing содержит честный `not-checked`, а не warning/error;
- formula injection в TSV и active content в Markdown/SVG блокируются или безопасно экранируются;
- full Save сохраняет unknown optional opaque/extension bytes exact и атомарно; stale preserved derived dependency блокирует Save;
- README не содержит active injection;
- writer self-verification обязателен;
- parallel Ctrl+S coalesce/serialize и не смешивают bytes/lifecycle;
- bind A → switch B → Ctrl+S никогда не пишет handle A; stale singleton binding не переживает session token;
- edit, появившийся после save snapshot, остаётся dirty после успешной записи предыдущего snapshot;
- failure injection на каждом save step сохраняет last-known-good copy;
- external edit не перезаписывается;
- external change между fingerprint checks, existing Save As target, LKG quota failure и disk-verified/binding-CAS-failed имеют отдельные outcomes;
- DEFLATE recovery проверяет hash;
- recovery index one-to-one совпадает с manifest/local/central metadata; любое data descriptor usage отклоняется;
- listed `required:false` asset всё равно обязан физически существовать и пройти size/hash verification;
- Ed25519 valid/invalid/unknown-key/unsigned downgrade-policy cases дают разные trust outcomes без изменения format severity;
- provenance/evidence supersedes self/cycle и mismatch присутствующего target блокируются; отсутствующий weak target допустим только как нормативно объявленное omission filtered slice, а в full считается dangling error; sourceRef digest mismatch блокируется всегда;
- partial recovery невозможно открыть как normal project до explicit verified Save As + new strict open;
- failure injection до repository commit оставляет прежний project/session целым; post-commit swap failure ведёт в safe reload committed project;
- stale lease/debounce и delayed bootstrap не пишут в новую session;
- до repository/session readiness create/open/recent disabled; lock denial оставляет runtime, repository, Library, Skeleton и binding без изменений;
- same-ID replacement remounts по session token и повторно проходит CAS;
- file open не меняет global Library/primer pool; одинаковые primer IDs разных проектов не конфликтуют;
- file entrypoints дают одинаковую runtime biology через `open-file`; Recent открывает locally autosaved canonical working copy через `open-local`;
- inspect/recovery не получают lease, repository mutations, active rendering или autosave;
- model-based state-machine tests запрещают invalid transitions; cancel/progress/late Worker result проверены на каждой phase boundary;
- bounded buffering, worker failure, storage quota и staged-asset cleanup проходят browser tests;
- two-tab cross-open не deadlock; lease loss делает stale session read-only;
- create/switch/close/trash/restore/purge/startup-resume проходят model-based lifecycle tests, включая release/expiry/takeover fallback lease;
- create получает lease до activation; A→B отпускает A только после commit/swap B; same-ID reopen переиспользует lease; active trash/purge не оставляет lease;
- takeover проходит quiesce/flush/epoch/ack handshake без fixed delay; blocked/read-only Save запрещён, late old-epoch ack/write отвергается;
- cutover/reset сохраняет personal Library/primer rows и не использует общий `clearAll()`;
- reset matrix покрывает каждый store, отдельную Skeleton DB и owned localStorage keys; общий `localStorage.clear()` запрещён;
- create rollback инъецирует failure на каждом store; close/trash ждут pending autosave/Skeleton quiesce до lease release, при failed `sealAndFlush` не отпускают lease/не очищают runtime, после success ни один queued writer не запускается;
- active/inactive `trash-project`, `restore-project`, `purge-project` сохраняют soft-delete semantics и удаляют lease последним;
- purge cleanup exact для document/assets/binding/backups/listing/project-owned compatibility rows; personal clones сохраняются;
- native lock и fallback дают одинаковый durable epoch fencing; fake-clock expiry/takeover/ABA не пропускает stale writer;
- crash после каждого resumable cutover marker шага и повторный startup дают идемпотентное завершение без потери personal rows/snippets/commonFeatures/customEnzymes/enzymeSets;
- изменение каждого поля committed asset inventory, UI layout или canonical document меняет local `stateDigest`, тогда как staged/orphan bytes его не меняют;
- `draftDirty/localDirty/fileDirty`, binding и autosave statuses имеют независимые gates;
- Save/Save As/Export copy имеют разные binding/dirty semantics;
- Save/Save As/Bodge profile/GenBank bundle/single GenBank/Publication Pack проходят exact command taxonomy; только первые два меняют binding;
- второй tab/takeover и browser fallback блокируют stale writer, а не пользователя навсегда;
- activation architecture test запрещает direct `currentProjectId`/public `activateProject`; mutation test запрещает direct project-owned DB/Skeleton writes вне adapters;
- `.bodgeassembly` отсутствует в accept/drop/parser/help, а metadata edit из `ProjectInfoModal` является одним CAS command;
- production не имеет dual-write, v1 fallback или direct validator/profile bypass.

## 10. Фаза G — Construction Passport, Publication Pack и whole-plasmid comparison

Цель: поверх уже корректного Bodge 2 core дать пользователю практически полезный результат — автоматически собранную биографию конструкции и самодостаточный пакет к статье. Фаза не вводит второй canonical graph, не превращает приложение в LIMS и не пытается воспроизвести лабораторный эксперимент.

Продуктовый контракт и UX определены в `SPEC_REPRODUCIBLE_RECIPE.md`; этот раздел задаёт исполнимый порядок. Каждый шаг выполняется TDD red→green и завершается своим узким gate. Product-фазы из той спеки не являются разрешением перепрыгнуть format prerequisites:

| Product phase | Реализационная опора |
|---|---|
| P0 contract correction | A schemas/gates + D3/D5 + E3/E4 + F1/F4 contract tests |
| P1 Construction Passport | B–D canonical DTO/graph + G0–G4 |
| P2 public profile hardening | E digests/provenance + F + G3 |
| P3 whole-plasmid comparison | E1/E4 + G5–G7 |
| P4/P5 UX/conformance | G4/G8 + общий §11 gate |

P1 design-only package можно выпустить до G5–G7 whole-plasmid comparison, но нельзя выпускать до single-source canonical graph и allowlist writer.

### G0. Characterization и безопасная граница модулей

До изменения поведения зафиксировать текущее состояние тестами:

- `bodge-zip.js` фактически пишет container `.gb` и не реализует весь canonical/publication contract;
- `public-supp` сейчас не является строгим allowlist;
- `ExportProjectModal` не подключён к единому live action;
- skeleton extension способен перекрыть structured state;
- Skeleton persistence использует module-global debounce, async hydration может перезаписать early edits, same-ID replacement не обязан reload-иться, unmount не гарантирует flush, switch способен отменить чужую queued write, а failed/future-schema load может затем сохранить empty snapshot;
- `App.handleOpen`, StartScreen helper/drop и direct project activation имеют разные pre-commit Library/Skeleton/binding mutations;
- singleton `fileHandle/fileName`, немедленный multi-tab release и close-before-flush создают stale binding/lease writes;
- `.bodgeassembly` всё ещё принимается parser/drop и рекламируется Help UI;
- legacy Sanger statuses не имеют claim scope;
- `align-circular.js` решает локальную/semiglobal placement-задачу и не является whole-molecule comparator;
- cancel/preview не должны менять store.

Перед правкой снять фактические размеры. На аудите 15.07.2026 `bodge-zip.js` — 25 639 bytes, `projectSlice.js` — 28 931 bytes, `librarySlice.js` — 54 398 bytes, `LibraryWorkspace.jsx` — 38 436 bytes; они уже не являются местом для нового reader/repository/profile logic, а Workspace получает максимум thin controller hook. `alignmentSlice.js` также контролируется как soft-zone. Новые ZIP, canonical command, lifecycle, closure/render/comparison функции выносятся в отдельные pure modules, а существующие файлы получают только тонкую orchestration. Если к началу реализации файл находится в Active decomp по `docs/BACKLOG.md`, декомпозиция становится первым K-шагом соответствующего спринта.

**Characterization gate:** suite остаётся зелёной и явно фиксирует current profile leak, отсутствующие publication artifacts, no-live-wiring, Sanger scope ambiguity, назначение semiglobal aligner и перечисленные activation/Skeleton/binding/lease hazards. Tests должны уметь доказать будущему K-шагу, что он закрыл каждый старый bypass, а не просто добавил новый happy path. Red test появляется только внутри K-шага вместе с реализацией, которая доводит его до green; handoff с intentional red/skip/todo запрещён.

### G1. Publication selection, closure и completeness model

Создать pure modules:

```text
gui/designer/src/lib/bodge-publication-closure.js
gui/designer/src/lib/bodge-publication-model.js
```

Вход — canonical project snapshot, `assemblyId`, `expectedProductRef`, optional exact `verificationEvidenceRef {id,evidenceDigest}` и frozen export options. Выход — immutable filtered DTO плюс diagnostics. Publication renderer всегда получает ровно один product; multi-product binding экспортируется отдельными archives, потому aggregate paths в `2.0.0` не определены. Алгоритм:

1. Проверить, что product существует и produced ровно одной допустимой reaction path.
2. Пройти назад по reactions/connections до всех material revisions, primers/pairs и required method metadata.
3. Включать не «всю библиотеку», а exact revisions, на которые ссылается граф.
4. Построить fixed public project projection: source refs пусты, creators/identifiers только public, external refs — все и только public; private retained agent/claim ref блокирует export.
5. Если выбран exact evidence ref, добавить только его, observed record/revision/provenance и attachment omission set; иначе verification `not-checked`.
6. Проверить dangling refs, duplicate producers, cycles, source revision drift и конфликтующие reaction params.
7. Вычислить completeness по обязательным данным каждого method renderer.
8. Отдельно вычислить `constructionAssertion` и verification summary; они не влияют на graph completeness.
9. Вернуть stable ordered closure и machine-readable diagnostics с actionable pointers.

Уровни completeness:

- `complete` — Methods/diagram/tables можно построить без пропусков;
- `complete-with-disclosures` — конструкция однозначна, но отдельные необязательные параметры будут явно обозначены как not recorded;
- `blocked` — результат нельзя честно связать с единственной историей или отсутствуют обязательные references.

**Gate G1:** Gibson, Golden Gate, RE cloning, KLD и mixed graph дают детерминированный closure; product без sequencing проходит; orphan/cycle/conflict блокируют export; layout/UI/notebook text не входят, а registry-only omission asset появляется только из selected evidence attachment refs.

### G2. Construction Record renderers и новая chemistry

Создать:

```text
gui/designer/src/lib/bodge-publication-render.js
gui/designer/src/lib/bodge-publication-diagram.js
gui/designer/src/lib/bodge-publication-assets.js
```

Renderers — односторонние projections filtered snapshot. Они не могут быть импортированы обратно как новый reaction graph. Требования:

- Methods по умолчанию описывает проектирование: «было спроектировано/предусмотрено», а не «мы сделали»;
- формулировка о выполнении допустима только при явном `constructionAssertion: reported-performed` и помечается как author-reported;
- core chemistry использует method-specific templates для PCR/overlap/Gibson, Golden Gate, restriction cloning/ligation, KLD и mutagenesis;
- Type IIS берутся только из GG registry, классические RE — только из RE registry;
- неизвестный optional method отображается generic envelope: label, inputs, outputs, core params, method capability и unresolved warnings;
- неизвестный required method блокирует writable recompute, но не read-only extraction canonical records;
- diagram строится из graph model, а не screenshot React DOM;
- materials/primers TSV сохраняют stable IDs, revisions, sequence orientation, tails/modifications и pair refs;
- user content защищён от Markdown, SVG и spreadsheet-formula injection.

`ChemistryRegistry` является доверенным локальным кодом приложения; архив не исполняет плагины и scripts. Новая chemistry добавляется новым namespaced `method.id`, versioned params schema и renderer capability без смены Bodge major, пока не нарушен universal reaction envelope.

**Gate G2:** golden fixtures Methods/PNG model/TSV детерминированы; generic unknown chemistry остаётся понятной; registry separation покрыта тестами; derived output не меняет canonical graph.

### G3. Publication binding и allowlist writer

Расширить canonical `project.json` publication binding и manifest asset descriptors по нормативу. Затем переписать `public-supp` path внутри writer:

1. Получить frozen selection request.
2. Построить closure G1.
3. Применить allowlist до любого human rendering.
4. Сгенерировать publication assets G2.
5. Добавить canonical JSON и ровно соответствующие GenBank projections.
6. При выбранном eligible whole-plasmid comparison добавить только его record и required observed consensus; raw/source attachments не добавлять.
7. Рассчитать `generatedFrom`, asset hashes/sizes и `projectContentDigest`.
8. Зафиксировать optional attestation declaration/key ID, затем рассчитать `archivePayloadDigest`, signature bytes, final manifest и recovery index строго в этом порядке.
9. Выполнить post-write Structural/Integrity/Biological/Full validation и recursive privacy scan.

Обязательный `public-supp` output:

```text
_recovery.json
manifest.json
README.md
project.json
assemblies/<id>.json
containers/<selected-material-or-product>.json
containers/<same>.gb
containers/<id>/records/<recordDigestHex>.json  # все exact closure records, включая observed
containers/<id>/records/<recordDigestHex>.gb    # matching record projections, включая observed
provenance/containers/<id>.json                 # identity-only slices, включая observed
primers/pool.json                         # только при referenced primers
publication/methods.md
publication/assembly.png
publication/materials.tsv
publication/primers.tsv                  # только при referenced primers
publication/verification.md
evidence/<selected-whole-compare>.json    # optional
notebook/entries.json                     # registry-only при omitted attachment refs
refs/external.json                        # только если project имеет public external refs
containers/<observedContainerId>.json     # при selected sequence evidence
containers/<observedContainerId>.gb       # при selected sequence evidence
publication/variants.tsv                  # optional for differs
signatures/project-content.ed25519        # optional attestation
```

Если selected evidence содержит attachment refs без bytes, writer ставит `project.publication.attachmentsOmitted:true` и создаёт только exact registry omission records; если refs нет, ставит `attachmentsOmitted:false`, `project.refs.notebook:null`, а notebook asset отсутствует.

**Gate G3:** распакованный package читаем без BodgeGene; все refs замкнуты; exact `.gb` доступны; private canary strings/bytes отсутствуют во всех JSON, Markdown, TSV, PNG metadata и ZIP paths; package без evidence имеет `not-checked`, а не ошибку.

### G4. In-app Passport и единый export controller

Подключить существующий `ExportProjectModal` к одному controller/action; не создавать параллельный export wizard. Добавить read-only Passport projection для Product/Assembly с двумя слоями одной модели:

- guided — готовая биография, схема, completeness и одна основная кнопка «Пакет к статье»;
- details — exact revisions, reaction params, diagnostics, privacy closure, assertion и eligible verification selection.

Это не два режима данных и не глобальный beginner/expert gate. Переключение presentation-layer не меняет canonical state. Профессионал может вручную выбрать product/evidence и просмотреть refs; студент получает безопасные defaults и объяснение следующего действия.

UX состояния: `ready`, `ready-with-disclosures`, `blocked`, `exporting`, `done`, `error`. Для blocked diagnostics каждое сообщение ведёт к конкретному source/reaction/primer. Cancel/Escape закрывает modal без mutations; export запускается повторно с frozen snapshot; IME/keyboard/focus trap/a11y обязательны.

**Gate G4:** Product, Assembly и Library entrypoints дают один и тот же request/controller; design-only export занимает не более двух действий от готового product; advanced selection не меняет guided output неожиданно; browser smoke проходит на реальной mixed-method assembly.

### G5. Expected/observed import и canonical molecule digest

Реализовать отдельный flow «Сравнить итоговую последовательность»:

1. Пользователь выбирает expected product revision.
2. Импортирует один готовый consensus FASTA или GenBank.
3. Parser показывает preview sequence length/topology/strandedness/ambiguity, explicit normalization report и provenance поля.
4. До подтверждения store не меняется.
5. После подтверждения создаётся отдельный observed container revision; expected immutable.
6. Comparison создаёт отдельный scoped evidence record.

Canonical `moleculeDigest` общий для format core и comparator и вычисляется только единым E1 service. Circular dsDNA выбирает ASCII minimum rotations sequence + strict RC; circular ss/unknown-strand — rotations only; linear/unknown topology — stored orientation. Ends identity исключает `generatedBy`, но включает geometry/overhang/phosphorylation. Нельзя использовать tolerant sanitizer или sequence-only digest.

FASTA без надёжной topology/strandedness получает `unknown`, а не default `linear/double`. Пользователь может подтвердить их как отдельные reported inputs, либо результат остаётся `inconclusive`. GenBank metadata читается codec-ом, но всё равно проходит preview. Lowercase/format whitespace MAY быть нормализованы до canonical record только с report; `U`, gap и invalid symbols не удаляются молча.

**Gate G5:** cancel не оставляет container/evidence; observed не заменяет expected; rotated/RC circular dsDNA имеет тот же digest, ss/unknown-strand RC — другой, linear/unknown topology не вращается; strict IUPAC/ends rules покрыты cross-language fixtures; импортированный observed экспортируется обычной canonical JSON + GenBank projection.

### G6. Whole-plasmid comparator и worker resilience

Создать pure comparison layer отдельно от текущего Sanger placement aligner:

```text
gui/designer/src/lib/alignment/whole-plasmid-compare.js
gui/designer/src/lib/alignment/whole-plasmid-variants.js
gui/designer/src/workers/whole-plasmid-compare.worker.js
```

Алгоритм:

1. До digest fast path проверить known compatible circular double-stranded topology, full-length, ACGT-only и non-truncated eligibility.
2. Exact digest fast path: при равных molecule digests вернуть `matches-expected`, rotation/strand transform и zero variants без heavy alignment.
3. При неравных digest выполнить bounded global circular dsDNA comparison, проверяя обе orientations и допустимые origins; для ss/unknown strand обе orientations запрещены, semiglobal/local placement не может дать pass.
4. Нормализовать SNP/MNP/indel coordinates относительно expected canonical revision; cross-origin event не дублировать.
5. Вернуть `differs` только для полного сравнимого consensus; partial/ambiguity/timeout/resource cap — `inconclusive`.
6. Сохранить tool/algorithm/version/parameters и deterministic summary.

Worker contract: request ID, progress, cancel, timeout, `onerror`, `messageerror`, reject-on-terminate и ignore-late-result. React StrictMode mount/unmount и смена expected/file не оставляют hanging Promise и stale mutation. Для типичных 3–20 kb plasmids UI остаётся отзывчивым; конкретный performance threshold калибруется corpus-ом до freeze, а не обещается заранее.

**Gate G6:** exact/rotation/RC, one SNP, insertion, deletion, cross-origin variant, unequal length, `N`, partial sequence, unknown topology, timeout, cancel и worker crash имеют frozen ожидаемые statuses. Ни один local/semiglobal match не может вернуть whole-molecule pass.

### G7. Evidence lifecycle, Sanger compatibility и publication projection

Добавить атомарные domain actions: add/remove observed container, add/remove evidence, bind/unbind selected evidence, set author assertion, create expected child version from observed и undo import transaction. Biology/evidence не хранить в modal-local state или `App.jsx useState`.

Lifecycle rules:

- evidence привязан к exact expected and observed revisions;
- при изменении expected head старый record видим как `stale`, но не переносится;
- удаление evidence не удаляет reused observed container без reference check;
- «принять observed как новый дизайн» создаёт child version, а не мутирует expected;
- старые development `verified/failed` Sanger flags не конвертируются: fixtures/state пересоздаются, а новый status возникает только из explicit manual/reported evidence с `junctions|regions` scope; без достаточного coverage он не становится whole-molecule result;
- public export включает только явно selected `whole-plasmid-sequence-comparison`; regional/junction/manual evidence остаётся в full archive;
- `verification.md` различает `not-checked`, `matches-expected`, `differs`, `inconclusive`, manual reported и stale.

**Gate G7:** полный lifecycle `import → compare → save → export → re-import → inspect → undo` сохраняет immutable refs; Sanger regression suite зелёная; stale/manual/scoped statuses не смешиваются.

### G8. Фазовый prerelease gate

Перед объявлением функции prerelease-ready обязательны:

- targeted unit/property/component tests G0–G7;
- format valid/invalid fixtures для publication/evidence/observed containers;
- OpenCloning/GenBank interop cases и documented loss matrix;
- adversarial privacy and active-content corpus;
- unknown optional/required chemistry fixtures;
- full Vitest, production build и browser acceptance;
- size-budget report; `bodge-zip.js` и `alignmentSlice.js` не превращены в новые монолиты;
- BUGS/PROJECT_STATE/RELEASES/DECISIONS/ANCHORS обновлены только на финализации фактически принятого среза.

Release slicing:

1. **G0–G4:** полезный design-only Construction Passport + Publication Pack; sequencing не требуется.
2. **G5–G7:** optional whole-plasmid consensus comparison.
3. **G8:** общий prerelease/conformance freeze.

### G9. STOP-условия

Вернуть задачу Chat и не расширять реализацию, если требуется хотя бы одно из следующего:

- новый canonical `recipe.json` или копия reaction graph;
- использование `realiseAssembly` как доказательства/replay validator лабораторного выполнения;
- generic assembly status `experimentally_verified`;
- мутация expected sequence при импорте observed consensus;
- whole-molecule green при partial coverage, ambiguity или неизвестной topology;
- blacklist-only public export из полного private state;
- basecalling/assembly raw reads, LIMS, robotics или cloud account как условие работы;
- исполнение chemistry code из архива;
- рост hard-zone module без предусмотренной декомпозиции;
- пересечение с ещё не принятой активной задачей `CURRENT_TASK.md`.

## 11. Conformance tooling и corpus

### 11.1 CLI и независимый validator

Создать reference CLI с тем же публичным contract, но независимой реализацией ZIP/digest/semantic checks (предпочтительно Python рядом с существующим `src/pvcs`). Он MAY использовать те же опубликованные JSON Schemas и corpus, но MUST NOT импортировать browser JS parser/validators:

```text
bodge inspect <file>
bodge validate <file> [--level structural|integrity|biological|full]
bodge unpack <file> --verified-only
```

Browser implementation и reference CLI обязаны давать одинаковые stable codes/digest results на golden corpus. Это осознанное независимое дублирование проверки, а не второй нормативный контракт. Exit codes:

- `0` — conformant/успех;
- `2` — invalid format;
- `3` — unsupported capability/transport на запрошенном уровне;
- `1` — tool/IO failure.

JSON report содержит tool/version, disposition (`valid|invalid|unsupported`), достигнутый conformance/trust level (`untrusted-summary|structural|integrity|biological|full`), stable diagnostics, paths/pointers и ZIP totals. Policy challenge/cancellation — operation outcomes, не invalid format.

Validator развивается вертикально вместе с форматом, а не появляется в конце как переписывание готового browser code:

1. после A0/A — самостоятельный Python ZIP/strict-JSON/schema path, уровни Structural и Integrity, Ed25519 verification/trust classification и команда `inspect`;
2. после B/C — container/revision resolver, biological record checks и JSON↔GenBank parity;
3. после D — reaction/connection graph и capability disposition;
4. после E — provenance/evidence/source semantics и независимые domain-digest vectors;
5. после F — Full/profile rules, writer signing integration, recovery и `unpack --verified-only`.

В `pyproject.toml` планируется отдельный entry point `bodge = ...`; он не подменяет существующий `pvcs`. Python schema/JCS/Ed25519 dependencies pin-ятся напрямую. Browser acceptance до F7 получает реальный Chromium harness для Worker lifecycle, streamed Blob reads и доступных OPFS/File System Access paths; happy-dom unit tests не считаются доказательством browser I/O semantics. Недоступный в automation platform API проверяется через production-shaped adapter + отдельный manual acceptance case, а не молча пропускается.

### 11.2 Corpus

`valid/`:

- minimal/empty project;
- circular plasmid;
- linear sticky-ended fragment;
- linear ssDNA и unknown observed FASTA;
- rich compound features;
- feature levels/assertions/within/one-of/valueless qualifiers;
- sourced/synthetic/planned/gap pieces;
- expected-sequence/source-record/evidence digest golden vectors и evidence supersedes chain;
- head+ancestor, non-head assembly ref, metadata-only revision, revert, fork и merge;
- identity-only public provenance с прежними revision digests;
- full multi-method assembly;
- primers/pairs/modifications, включая exact/full и null/source-excluding imported origin projection;
- canonical notebook creator/typed refs/attachment declaration + PNG/PDF/AB1 registry;
- whole-plasmid exact/circular-ds-rotation/RC/differs/inconclusive evidence;
- circular ss/unknown-strand rotations-only и linear/unknown-topology stored-orientation molecule vectors;
- periodic/homopolymer/1 bp/full-IUPAC/minimum-rotation performance vectors;
- selected observed consensus и publication artifacts;
- original source;
- optional extension;
- unknown optional opaque preservation, derived-only/content-vs-payload digest и compression-only repack;
- все export profiles;
- Unicode metadata;
- deterministic golden.

Каждый fixture в `valid/` обязан достигать `Full` на reference validator с поддержанными объявленными capabilities. Valid transport, который корректно останавливается на более низком уровне из-за отсутствующей capability, сюда не помещается.

`unsupported/`:

- unknown required capability/extension при normal hydration;
- unknown optional reaction method: Structural/Integrity valid, Biological/Full unsupported, preservation Save разрешён только по `SessionCapabilityMatrix`;
- корректно объявленный ZIP64 archive для validator build без ZIP64 support.

`policy/`:

- structurally/integrity-valid archives, честно превышающие configured entry/size/ratio/storage budgets;
- near-limit consent, cancel и retry-with-larger-policy cases;
- bounded inflate, который останавливается по фактическому streamed byte budget без классификации файла как corruption.

`invalid/`:

- missing/malformed/wrong-version manifest;
- missing/unlisted/wrong-size/wrong-hash asset;
- duplicate/case/traversal/absolute/symlink/prototype paths;
- multi-disk/undeclared ZIP64/любое data descriptor usage, prefix/trailing/comments/forbidden extra/overlap/orphan entries;
- declared size/CRC mismatch, metadata lie и actual inflate overrun относительно собственного entry descriptor;
- invalid UTF-8/BOM/duplicate-key/post-NFC-collision/unsafe-integer/wrong-final-LF JSON;
- invalid IUPAC/coordinates/topology/ends;
- lowercase/U/gap/silent-strip sequence и wrong circular ss/unknown RC normalization;
- feature level/parent/fuzz/qualifier/assertion errors;
- projection mismatch;
- orphan refs/producer/reaction cycle/revision drift;
- missing record, `recordDigest`/`revisionDigest`/`eventDigest`/`sourceRecordDigest`/`evidenceDigest` mismatch, filename mismatch и global provenance/supersedes cycle;
- head/project/alias mismatch, undeclared omitted parent и ambiguous filtered head;
- generic `experimentally_verified` в assembly/reaction;
- whole-molecule pass при different digest, ambiguity, partial coverage или unknown topology;
- stale/mismatched expected-observed evidence refs;
- orphan/spoofed/active attachment;
- public profile privacy leak;
- notebook unresolved author/entity/attachment ref, legacy device/runtime Sanger field или registry mismatch;
- non-null imported-primer source ref в source-excluding profile и sanitized source retarget;
- generatedFrom self/cycle/out-of-profile/stale preserved derived, extension envelope mismatch, capability-list overlap и пропущенная provenance-activity capability;
- derived tamper с пересчитанным manifest asset hash, но invalid archive payload digest/signature;
- corrupt recovery index/central directory.

`recovery/`:

- recoverable central-directory damage с полностью проверяемыми local records;
- mixed recovered/corrupted/missing/unsupported partition;
- manifest/recovery one-to-one mismatch и повреждённый first/second system entry;
- partial report, который не может создать normal session до verified Save As и strict reopen.

`interop/`:

- SnapGene;
- ApE;
- Geneious;
- NCBI/INSDC;
- pLannotate;
- SBOL 3;
- OpenCloning.

У каждого fixture есть expected loss matrix.

### 11.3 Adversarial/property tests

Seeded mutator изменяет bytes, central/local records, offsets/ranges, names, comments/extras, flags, methods, sizes и JSON boundaries. Любой crash, hang или unexpected exception/disposition — failure; seed сохраняется. Отдельные property/model suites проверяют digest algebra, ASCII minimum rotation, ordered/set arrays, generatedFrom/provenance DAGs и разрешённые transitions open/save/autosave/recovery state machines.

### 11.4 CI release gate

Обязательная последовательность:

1. compile schemas strict;
2. unit/semantic format tests;
3. valid/invalid/unsupported/policy/recovery corpus с ожидаемыми disposition и максимальным уровнем;
4. interop fixtures;
5. privacy leak scan;
6. deterministic/cross-language digest golden;
7. production build;
8. полный test suite.

CLI и app используют одинаковые versioned schemas, MIME table specification, stable diagnostics contract и corpus, но независимый executable validator code. CI сравнивает их отчёты и cross-language JCS/digest vectors, включая `recordDigest`, `moleculeDigest`, `expectedSequenceDigest`, `revisionDigest`, `eventDigest`, `sourceRecordDigest`, `evidenceDigest`, `projectContentDigest` и `archivePayloadDigest`.

## 12. Приёмочные критерии всего проекта

### 12.1 Structured round-trip

- Полный project write→read deep-equal без BodgeGene snapshot extension.
- Удаление всех optional extensions не меняет biology.
- Project metadata сохраняется.
- Circular, linear ends, rich features и custom qualifiers сохраняются.
- Canonical notebook сохраняет entry order, creator/typed refs и attachment declarations без legacy device/Sanger payload.
- Immutable current/historical JSON records и matching GenBank projections независимо читаемы после unzip.
- Project exact head refs, provenance head и byte-identical alias совпадают.

### 12.2 Assembly

- Typed reactions и connections полностью round-trip.
- Source refs закреплены revision digest.
- Non-head source revision разрешается после смены current head.
- Orphan/duplicate producer/cycle/drift блокируются.
- Layout не влияет на biological semantics или `projectContentDigest`, но входит в local `stateDigest` и `archivePayloadDigest` full archive.

### 12.3 Integrity/security

- Corruption/malicious ZIP блокируется до state.
- Manifest является единственным allowlist.
- Prefix/trailing bytes, ZIP comments/extras, overlap/orphan ranges и hidden directory entries блокируются.
- Prototype pollution test оставляет глобальные prototypes неизменными.
- ZIP policy применяется до full inflate.
- Large-file consent/cancel/unsupported отделены от invalid corruption; bounded buffering подтверждён tests.
- Active attachments/Markdown не исполняются.

### 12.4 Privacy/export

- `public-supp` проходит recursive scan на notebook text/non-empty entries, raw reads, arbitrary attachment/source bytes, extensions, local paths, private refs и device identifiers; exact registry-only omission asset не считается leak.
- Только selected whole-plasmid comparison и required observed consensus входят в closure.
- `project.sources`/`refs.sources` пусты; public accession/URL присутствуют только как public external refs.
- Imported primer origins в source-excluding profile имеют `sourceRef:null`; source ID/digest не retarget-ится и не протекает через TSV/README.
- Methods, diagram, materials, verification и присутствующие по условию primers/variants имеют актуальный `generatedFrom` и построены из filtered snapshot.
- `archivePayloadDigest`/signature защищают читаемые derived/projection assets, не только canonical JSON.
- Full Save exact сохраняет unknown optional independent payload; filtering/loss всегда explicit.
- Single assembly содержит точную transitive dependency closure.
- Missing full-profile attachment блокирует export.

### 12.5 Digests/evidence

- `assetDigest`, `recordDigest`, `moleculeDigest`, `expectedSequenceDigest`, `revisionDigest`, `eventDigest`, `sourceRecordDigest`, `evidenceDigest`, `projectContentDigest` и `archivePayloadDigest` различаются по назначению и воспроизводимы.
- Sanitizing provenance events не меняет revision identity; parent/order/revert vectors соответствуют спецификации.
- Sequence-only similarity не объединяет разные topology/ends.
- Assembly/reaction не имеют generic `experimentally_verified`.
- Author assertion, graph completeness и computed product comparison представлены независимо.
- Whole-plasmid prerelease `matches-expected` требует exact digest, compatible circular dsDNA, full length, ACGT-only и non-truncated comparison.
- Sanger/region/junction evidence не повышает whole-molecule scope.

### 12.6 Save/recovery

- Успешный save reread-verified.
- Last-known-good copy сохраняется до подтверждения нового файла.
- Concurrent edit приводит к conflict, а не overwrite.
- Recovery проверяет SHA-256 и честно классифицирует каждый asset.
- Recovery не создаёт normal session до explicit verified Save As + strict reopen.
- Recent открывает local canonical working copy, file-open — external candidate; inspect/recovery не мутируют repository.
- Dirty/autosave/binding states и commit/cancel fences проходят model-based failure tests.
- Open/save не изменяют global Library/primer pool и не читают старый skeleton snapshot.
- Repository CAS/lease/session token блокируют delayed hydrate и stale autosave.

### 12.7 Independent conformance

- Reference archive проходит CLI full validation.
- Browser и независимый Python/reference validator совпадают на stable codes и cross-language digest vectors.
- Все valid fixtures проходят.
- Все invalid fixtures отвергаются ожидаемым stable code.
- Recovery corpus даёт точную partition.
- Production build и полный test suite зелёные.

## 13. Definition of Done

Работа завершена только при одновременном выполнении всех условий.

### Contract

- Нормативная спецификация — единственный источник истины.
- В read/write paths используется только `2.0.0`.
- Конвертация development-архивов отсутствует; fixtures пересозданы.
- Все `$schema` существуют локально и опубликованы по versioned immutable URL.
- Field names, asset kinds, paths, MIME и digest terms совпадают в spec, schemas, code и tests.

### Reader

- Ни один asset не парсится до preflight/manifest/integrity gate.
- Reader не использует ZIP globs как каталог проекта.
- Partial state не коммитится.
- Heavy ZIP/hashing work streaming/bounded и не блокирует main thread.
- Invalid, unsupported, policy challenge, cancellation и recovery являются разными outcomes.
- Unknown optional writable open существует только с exact preservation inventory.

### Canonical biology

- Structured round-trip не зависит от extension snapshot.
- Container JSON хранит topology, ends и полные features.
- Canonical DNA/digest не использует silent-strip/U→T/default-linear helpers; molecule matrix совпадает во всех implementations.
- Immutable record store разрешает каждую referenced historical revision; head alias не является вторым source of truth.
- GenBank является проверенной проекцией.
- Assembly имеет один graph и один connections source.
- Provenance/evidence привязаны к immutable revisions и обязательному scope.
- Notebook является отдельным closed canonical record с typed refs; Sanger state/device metadata не дублирует evidence/runtime.
- Imported primer source ref exact в full и детерминированно omitted без retarget в source-excluding profiles.
- Expected и observed хранятся отдельными canonical containers.
- Universal reaction envelope допускает namespaced chemistry без исполнения archive code.

### Writer/export

- Profile применяется внутри writer.
- Generated archive проходит self-validation.
- `projectContentDigest` защищает semantic/selected opaque state, `archivePayloadDigest` — весь non-signature payload; signature связывает оба.
- `generatedFrom` DAG valid; preserved optional groups не теряются и не становятся stale молча.
- `public-supp` не содержит скрытых sensitive payloads.
- `public-supp` содержит самодостаточный паспорт: Methods, PNG diagram, materials TSV, conditional primers/variants TSV, verification summary и canonical GenBank projections.
- Design-only package не требует sequencing; selected whole-plasmid evidence включается без raw reads.
- Serialization/digests детерминированы.

### Save/recovery

- Живой App использует verified save path.
- Все entrypoints используют один typed controller: file/local/inspect/recover имеют правильные раздельные gates.
- Last-known-good recovery copy существует.
- External edit не перезаписывается молча.
- Recovery проверяет bytes и не маскирует partial archive под valid project.
- Pre-commit cancel/failure zero-mutation; post-commit swap failure безопасно reload-ит committed canonical project.
- Skeleton/global Library/global primer pool не являются persistence проекта; production dual-write отсутствует.

### Conformance

- Schema compile: success.
- Targeted format tests: 0 failures.
- Valid/invalid/unsupported/policy/recovery corpus: 100% expected dispositions и conformance levels.
- Real interop fixtures имеют актуальную loss matrix.
- Prototype pollution и privacy leak gates: pass; honest size/ratio budget excess возвращает `policy-challenge`, а declared-size/actual-inflate overrun блокируется как invalid transport/integrity input.
- Deterministic golden: pass.
- Production build: success.
- Full test suite: 0 failures.

## 14. Порядок выполнения и зависимости

Последовательность обязательна:

0. **Граница задачи** — создать отдельный bounded-срез в `CURRENT_TASK.md`; cleanup и Format не смешиваются в одном diff.
1. **Фаза G0** — зелёная characterization текущего поведения и размерные границы; production не менять.
2. **Фаза A0** — strict JSON/JCS/hash/CRC/signature/diagnostic primitives и cross-language vectors.
3. **Фазы A1–A5** — trusted schemas и secure `VerifiedArchive` dark path, без live open; независимый CLI уже закрывает Structural/Integrity.
4. **Фаза B0 + B** — biological digest/location primitives, immutable record store и structured project/container adapters, без live save.
5. **Фаза C** — единый record/head GenBank codec; CLI получает biological record/projection slice.
6. **Фаза D** — canonical assembly graph, exact revision resolver и extensible reaction envelope; CLI получает graph validation.
7. **Фаза E** — provenance events, evidence, оставшиеся digests и sources; CLI получает cross-language semantics/digests.
8. **Фазы F1–F6** — export/profile/save/recovery services в dark/integration tests; CLI завершается до Full/profile/recovery.
9. **Фаза F7** — сначала F7.0 operation/state contracts, затем local repository, ownership split и единый production cutover без dual-write.
10. **Фазы G1–G4 + F8** — Construction Passport, design-only Publication Pack и единый export UI.
11. **Фазы G5–G7** — optional whole-plasmid consensus comparison и scoped evidence lifecycle.
12. **Фазы F9 + G8 + Conformance gate** — полный corpus, privacy, browser acceptance, cross-validator CI и release freeze.

Фазу нельзя считать завершённой только по unit tests её нового модуля: обязателен указанный phase gate. Новый writer/reader не подключаются к live paths до готовности A–E, F1–F6 и отдельного F7 cutover; verified save не считается готовым на memory adapter; format freeze запрещён до полного conformance/DoD.

## 15. Пересоздание development fixtures

После завершения каждой shape-changing фазы:

1. canonical source fixtures обновляются вручную как тестовые данные;
2. `.bodge` golden archives генерируются текущим writer с fixed clock;
3. старые development archives удаляются из corpus;
4. expected manifests/hashes обновляются только после semantic review diff;
5. никакой runtime converter старых development shapes не добавляется.

Этот процесс относится только к репозиторию и тестовым данным. До format freeze пользовательский UI должен явно обозначать `.bodge` как development format.

## 16. Контекст для будущего implementation handoff

Карту файлов нельзя хранить здесь как снимок: она быстро расходится с деревом. Перед каждым K-шагом исполнитель восстанавливает контекст по `AGENTS.md`, сверяет фазу с текущим кодом и тестами, затем помещает в `CURRENT_TASK.md` только один bounded-срез. Нормативный источник формата — `SPEC_BODGE_FORMAT_V2_CORE.md`; правила выполнения и проверки — `docs/process/WORKFLOW.md`.

Существующие migrations и compatibility helpers сначала характеризуются тестами; они не становятся основой нового reader по умолчанию. До F7 допустимы только dark modules/tests. Каждый handoff заканчивается targeted tests фазы, полным `npm test`, production build, size report и проверкой отсутствия нового live bypass.
