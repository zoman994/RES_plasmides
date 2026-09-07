# BodgeGene — подтверждённые дефекты

Только живые воспроизводимые дефекты. Новые возможности и архитектурные планы находятся в [`docs/BACKLOG.md`](docs/BACKLOG.md). Закрытые записи удаляются отсюда; после разрешённого checkpoint их история сохраняется в Git.

## P0/P1 — биологическая корректность и потеря данных

### BG-001 — public `.bodge` export не является allowlist-first

`bodge-export-profiles.js` описывает `public-supp`, но живой writer в `bodge-zip.js` в основном очищает `manifest.deviceId`. Runtime attachment/blob maps и private support data могут быть подмешаны обратно.

**Риск:** утечка notebook, local refs, source/evidence bytes или extension snapshot.
**Исправление:** closure от выбранного product, render только из filtered snapshot, post-write recursive leak scan. Контракт — `docs/specs/SPEC_BODGE_FORMAT_V2_CORE.md` и `docs/specs/BODGE_V2_IMPLEMENTATION_PLAN.md`.

### BG-002 — skeleton extension перекрывает canonical `.bodge` state

`skeleton-bodge-bridge.js` сохраняет полный snapshot и при чтении предпочитает его structured sections.

**Риск:** изменённый или отфильтрованный canonical container/assembly может быть заменён старой копией.
**Исправление:** биология только из canonical DTO; extension содержит только optional UI/layout и не имеет override path.

### BG-005 — point mutagenesis можно реализовать без выведенной реакции

`MutationModal.jsx` предупреждает об interior-мутации, но Apply блокируется только для `outOfRange`. `onRealise` не требует результата `onDeriveReaction`.

**Риск:** UI реализует последовательность, которую существующие праймеры не создают.
**Приёмка:** interior-мутация блокируется до derivation либо атомарно создаёт reaction+primers перед realise.

### BG-006 — Golden Gate не проверяет ортогональность fusion overhangs

`designOverhangs`/`validateOverhangs`/`resolveConflicts` не подключены к production verification; readiness проверяет в основном выбор фермента.

**Риск:** duplicate, reverse-complement collision или palindromic overhang даёт неверную сборку при зелёном verdict.
**Приёмка:** `verifyAssembly` блокирует duplicate/palindrome/RC/internal-site conflicts и называет конкретные junction.

### BG-007 — KLD-праймеры экспортируются без 5′-phosphate

`PrimerOrderPanel.jsx` записывает `-` в Modifications независимо от метода.

Аудит 05.09: код моделирует KLD как киназный шаг в смеси
(`CanvasSkeleton/lib/circularize-validate.js:69, 82`; `mutagenesis.js:369` «no
phosphorylation needed»), тогда как `makeKLDStrategy` предупреждает «5′ phosphorylation
required on both primers» (`mutagenesis.js:112`), а приёмка требует 5Phos.
`PrimerOrderPanel.jsx:92` по-прежнему пишет `-` в Modifications. Химию решает владелец
до исправления.

**Риск:** KLD-лигирование физически не сработает.
**Приёмка:** KLD/self-closure олиго несут `phosphorylated:true` и экспортируют `5Phos`; классические RE-концы не получают этот флаг автоматически.

### BG-008 — starter set использует имена реальных плазмид для коротких stand-ins

`components/Library/lib/starter-set.js` честно называет последовательности synthetic stand-ins, но UI показывает `pUC19`, `pET-28b(+)`, `pGEX-4T-1`, `pBluescript SK(+)` без предупреждения.

**Риск:** биолог принимает сотни bp demo-последовательности за канонические многокилобазные векторы.
**Исправление:** либо встроить проверенные канонические записи с source/version, либо переименовать в явно synthetic demo и запретить wet-lab export.

### BG-027 — Ctrl+S `.bodge` не включает project-linked library entries

`App.handleSave` строит v2 state через `skeletonToCanonical`, но bridge не добавляет
`libraryEntries`; writer создаёт `library/entries.json` только когда вызывающий передал
его явно. Open-path этот раздел уже ожидает.

**Риск:** portable checkpoint проекта может сохранить сборку, но потерять молекулы и
их аннотации.
**Приёмка:** один canonical save helper собирает assembly и связанные library entries;
product-level `Ctrl+S → readBodge` round-trip сравнивает молекулы и полный `annotations[]`.

### BG-028 — compound/origin-crossing annotation: остаток после canonical location

Canonical `location{kind,segments}` (`lib/annotation-location.js`), сохранение join в
парсере (`genbank-parser.js:80-83`), rotate-origin с одной аннотацией и её id
(`rotate-origin.js:62-79`) и `segments` в `/api/import` (`gui/api/server.py:262`)
закоммичены. Не доказано: JS-ingress SnapGene-пакета превращает `segments` в canonical
`location` (`file-import.js` → `import-annotations.js`); нет round-trip теста
import → edit → rotate → render → export для кольцевого compound CDS.

**Приёмка:** тест `.dna` с compound CDS через origin даёт `location.kind = 'join'` в
записи библиотеки; round-trip тест на кольцевом CDS. UI-часть (редактирование compound
на всех поверхностях) остаётся в BACKLOG «Annotation UX convergence».

### BG-030 — GenBank-экспорт библиотеки не восстанавливает иерархию и может удвоить интроны

Повторные qualifiers в парсере (`genbank-parser.js:47-57`), `segments`/`qualifiers` из
backend (`server.py:262-266`) и `regionId` как canonical link в `.bodge`
(`lib/bodge-container-genbank.js`, WIP) сделаны. Остаток: `lib/export-genbank.js:103-104`
пишет `/bodgegene_level` и `/bodgegene_regionId`, которые не читает ни один импортёр, id
не экспортируются; регион с интронами разворачивается в `join(exons)` (:84-94), при
этом каждый intron-detail экспортируется отдельной фичей, а `import-annotations.js`
синтезирует «intron N» из gaps (:315-325) и одновременно импортирует intron как detail
(:93, 343-360).

**Приёмка:** маркеры читаются импортёром либо не пишутся; round-trip региона с явным
intron-detail не дублирует интроны; тест export → import.

### BG-033 — reverse-strand CDS auto-annotation сканирует forward DNA

`autoAnnotate` всегда анализирует `sequence.slice(start,end)` и не reverse-complement
для region со strand `-1`; созданные start/stop/tag details также не наследуют strand.

**Риск:** старт/стоп-кодоны и белковые теги reverse CDS пропускаются, создаются ложно
или получают неверные координаты.
**Приёмка:** strand-aware fixture сравнивает forward CDS с reverse-complement twin и
проверяет абсолютные координаты/strand всех details.

Реализация есть в рабочем дереве: `auto-annotate.js:366-394` собирает регион по
canonical segments, делает reverse-complement для strand −1 и мапит хиты обратно; proof
`src/__tests__/auto-annotate-reverse-proof.test.js` (7 тестов, untracked). Пакет B3 не
принят владельцем; запись остаётся открытой до приёмки.

### BG-044 — manual-edit branch может получить неверный resource/parent hash при отказе hash-вычисления

`createManualEditBranch` при исключении `computeResourceHash` оставляет
`resourceHash` родителя и записывает его ребёнку с изменённой sequence/topology. Если
у legacy parent hash отсутствует, `parentEntryHash` может получить уже hash ребёнка.

**Риск:** identity и parent lineage выглядят валидными, хотя hash описывает другую
молекулу; дедупликация, stale-check и provenance могут связать не те версии.
**Приёмка:** hash failure работает fail-closed либо создаёт доказанно корректный hash;
child hash описывает child, parentEntryHash — только фактического parent, включая
legacy parent без hash.

### BG-061 — library-wide specificity search всё ещё доверяет helper-body

`scanLibraryForPrimer` выбирает `bindingSequence` раньше полной `sequence` и заранее
объявляет helper-tail неспариваемым. Поэтому перенос комплементарных 5′-баз между полями
может менять длину/набор результатов отдельного поиска по библиотеке, хотя физическое
олиго не изменилось. SequenceView/PCR-проекция BG-060 уже исправлена и этот путь не
использует, но глобально заявлять тот же инвариант для specificity-инструмента пока нельзя.

**Приёмка:** exact/fuzzy library scan получает кандидатов из полной физической
последовательности с фиксированным 3′-доказательством; одинаковое олиго даёт одинаковые
hits независимо от helper split, настоящий неспаренный 5′-префикс не обязан совпадать,
а неоднозначные/IUPAC случаи остаются явно fail-closed.

### BG-062 — restriction occurrence не имеет единого биологического контракта

Статический аудит текущих RE-путей обнаружил, что `site.position` используется то как
начало сайта узнавания, то как координата верхнего разреза. Из-за этого Assembly popover
может повторно прибавить `cut[0]`; верхний разрез на `seqLength` не везде нормализуется
по кольцу; custom enzyme участвует в поиске, но tooltip/overlay/popover читают только
статический `RE_ENZYMES`. При flattening также теряется strand, поэтому асимметричный
reverse-site нельзя надёжно восстановить, а identity `enzyme + topCut` не различает
recognition start/strand.

Аудит 05.09 подтвердил по коду пять конвенций одного occurrence: recognition start в
`findSitesInSequence` (`restriction-db.js:277`); top-cut без strand и без modulo в
`flattenSites` (`SequenceView/lib/feature-map.js:184`); raw start в `PlasmidMapV2.jsx:178,
190` с подписью +1, тогда как linear tooltip печатает top-cut+1 — один сайт EcoRI виден
как «·101» на карте и «(102)» в строке; top-cut mod len в `RangePickerModal.jsx:379` и
`digest-fragments.js:29`; top-cut без modulo в `digest`; recognition segments + strand в
`lib/re-match.js:129` и WIP `flattenRawOccurrences`. Custom-ферменты находит только
скан: RestrictionTrack tooltip (:99), SequenceLine reCutLayout (:205),
RestrictionSitePopover (:157), `adapters/cut.js` legacy path (:109), RangePickerModal
(:376, cut0 = 0), `primer-derive.enzymeTailParams` (:75, fallback EcoRI) читают
статический `RE_ENZYMES`. '-' сайты встроенного каталога спасает симметрия
`cut[0] = len − cut[1]` у всех 16 непалиндромных REBASE-сайтов; custom-фермент без такого
ограничения получает неверный разрез во всех потребителях. Конкретные дефекты вынесены
в BG-063 и BG-086.

**Риск:** интерфейс может показать или выполнить разрез не в той координате, скрыть
разрез на origin либо неверно изобразить custom/reverse enzyme при визуально правдоподобной
подписи. P17 исправляет только collision-layout и не выдаёт это за биологический фикс.

**Приёмка:** один canonical restriction occurrence хранит `occurrenceKey`, enzyme,
recognition start/segments, strand, origin-wrap, top/bottom cut, end/overhang и источник
каталога/evidence. Scan, SequenceView, tooltip, overlay и Assembly popover читают эту
модель без повторного пересчёта координат; forward/reverse, linear/circular, custom и
origin fixtures проходят differential proof. Текущая находка доказана чтением кода;
product correction и browser/test gate для неё не выполнялись.

### BG-038 — hydrate может стереть только что созданный праймер из памяти

`primerSlice.hydratePrimers()` ждёт `listPrimers()`, затем заменяет `primersById`.
Если `addPrimerToPool` добавил запись между чтением Dexie и этой заменой, свежий primer
исчезает из runtime-map, хотя асинхронная запись уже могла уйти в базу. В браузере primer
остался на карте, а дерево одновременно показывало `Праймеры 0`.

**Риск:** только что созданный праймер пропадает из UI или недоступен следующему действию.
**Приёмка:** hydrate сливает состояние без потери более новых writes либо использует
epoch; interleaving-тест удерживает и загруженную, и добавленную во время await запись.

### BG-063 — «Cut here» в редакторе сборки прибавляет `cut[0]` дважды

`flattenSites` (`SequenceView/lib/feature-map.js:184-188`) отдаёт
`position = recognition start + cut[0]`, то есть уже верхний разрез;
`useSequenceSelection.onRestrictionClick` в режиме `cut` передаёт тот же объект в
`onCutHere` (`hooks/useSequenceSelection.js:133-146`, комментарий V155 подтверждает
конвенцию). `RestrictionSitePopover` считает `cutTopAbs = site.position + info.cut[0]`
(`CanvasSkeleton/editor/RestrictionSitePopover.jsx:161-164`) и отдаёт его в
`cutContainerAtCursor` (`ContainerEditorSkeleton.jsx:443-447`). EcoRI на позиции 100
режется в 102 вместо 101, PstI смещается на 5 bp; показанная «Cut (top strand)»
ошибочна на ту же величину. Единственный тест `skeleton-restriction-sites.test.jsx:310`
использует синтетический `{enzyme, position}` и закрепляет ошибку popover. Есть в HEAD.

**Риск:** физически неверный разрез контейнера при правдоподобной подписи.
**Приёмка:** popover получает occurrence с явным top-cut либо raw recognition start и не
пересчитывает координату; тест ведёт реальную цепочку scanAllSites → flattenSites →
RestrictionTrack click → popover → cutContainerAtCursor и проверяет разрез 101 для
EcoRI@100. Часть BG-062.

### BG-064 — ручные boundary-праймеры собраны в обратном порядке относительно auto-path

`buildAssemblyPrimer` (`CanvasSkeleton/lib/assembly-primer-utils.js:85-99`) для
forward-праймера через границу L|R берёт binding = конец L, tail = начало R и пишет
`sequence = tail + binding`, то есть 5′-R_start-L_end-3′; reverse =
5′-RC(L_end)-RC(R_start)-3′. Auto-engine (`lib/primer-derive.js:14-19, 459`) со ссылкой
на bio-invariants строит fwd правого фрагмента как 5′-L_end-R_start-3′ и rev левого как
5′-RC(R_start)-RC(L_end)-3′. При realise `mapPrimersForSegment` ставит ручной forward
на ЛЕВЫЙ фрагмент (`zone-pieces-to-dag.js:172`). Тест
`assembly-primer-design.test.jsx:74` закрепляет текущую схему; untracked
`assembly-primer-site.js` boundaryFootprint следует ей же. В HEAD с 148936a.

**Риск:** праймер с 3′-концом на конце L, направленный от L, не амплифицирует ни L, ни R
с нужным перекрытием.
**Приёмка:** решение владельца по семантике. Если дефект — forward =
5′-L_end-R_start-3′ на правом фрагменте, reverse симметрично, differential-тест против
auto-path, существующие тесты обновлены. Если конвенция — запись переезжает в
DECISIONS §7 и закрывается.

### BG-065 — derived-праймеры мутагенеза стираются finalizer'ом

`commitAAMutagenesis` и `ADD_DERIVED_ASSEMBLY_PRIMERS` добавляют записи с
`autoMode:'derived'` (`lib/derived-primer-records.js:126`;
`store/skeleton-state-aa-mutagenesis.js:272`). `applyJunctionConfig` при любом изменении
`pieces` или конфигурации зоны пересобирает список как
`[...existing.filter(autoMode === 'manual'), ...derived-auto]`
(`lib/junction-config-finalizer.js:171, 222-250`), поэтому derived-записи исчезают после
rename piece, смены цвета, OP_EXECUTE, SET_PIECE_ZONE. Тесты проверяют только состояние
сразу после commit (`skeleton-state-aa-mutagenesis.test.js:65`). Есть в HEAD.

**Риск:** праймеры мутагенеза пропадают из панели и снимка без уведомления; нарушает
правило «изменение canvas не очищает праймеры».
**Приёмка:** `derived` переживают любой dispatch; тест: commit AA-мутагенеза → rename
piece → записи на месте с теми же id.

### BG-066 — пул праймеров не гидратируется при старте; Ctrl+S после перезагрузки пишет `.bodge` без праймеров

Bootstrap в `App.jsx:59-72` поднимает projects/library/commonFeatures/customEnzymes, но
не вызывает `hydratePrimers`; единственные вызовы — `PrimerPoolList.jsx:43` и
`useEntryPrimers.js:43`. `handleSave` берёт праймеры только из памяти:
`primersForProject(useStore.getState().primersById, id)` (`App.jsx:147-151`;
`lib/project-bodge-state.js:27-36`). После перезагрузки до открытия Primer Pool или
инспектора `primersById` пуст, и файл сохраняется с пустым пулом при живых записях в
Dexie. Это реальная причина симптома, который BG-035 приписывал v1-writer. Есть в HEAD.

**Риск:** portable-файл проекта молча теряет праймеры.
**Приёмка:** bootstrap гидратирует пул либо Save ждёт гидратации; тест reload → Ctrl+S:
`.bodge` содержит Dexie-праймеры проекта. См. BG-038.

### BG-067 — Annotator L1 fail-open: ошибка загрузки feature-DB кэшируется как пустая база

`loadFeatureDB` глотает ошибку fetch и возвращает null (`feature-detection.js:62`);
`getMergedFeatureDB` строит `{features: []}` и кэширует в `_mergedCache`
(`store/commonFeaturesSlice.js:85-90`), сброс только правкой overlay (:32-33); плагин
превращает любое исключение в успешный пустой результат
(`lib/annotator-plugins/common-features.js:100-105`); LevelPanel показывает «совпадений
нет» (`Annotator/LevelPanel.jsx:460`). Ошибки L2/L3 из `runAnnotatorPipeline` только гасят
spinner (`Annotator/index.jsx:325`), поля ошибки в slice нет.

**Риск:** отказ провайдера выглядит как «совпадений нет» на всю сессию; нарушает
fail-closed инвариант.
**Приёмка:** отказ загрузки — видимое состояние ошибки без кэширования; ошибки
плагинов отображаются; тесты на оба пути.

### BG-068 — контракт координат сегментных аннотаций сборки сменён 1-based → 0-based без миграции (WIP)

В рабочем дереве `CanvasSkeleton/lib/segment-annotation-transfer.js` переведён на
0-based end-exclusive (заголовок HEAD объявлял 1-based inclusive), `reflectAnnotations`
в `segment-overhangs.js` отказался от формулы `[L−e+1, L−s+1]`, комментарий HEAD к
которой ссылался на аудит владельца 29.06. `collectAssemblyAnnotations` предпочитает
сохранённые `seg.annotations` (`lib/assembly-annotations.js:36`), а
`assembly-model.transferAnnotations` вызывается при insert (:69), поэтому drafts,
сохранённые под HEAD, будут прочитаны со сдвигом на 1 bp. Миграция v12→v13 трогает
только `assemblyDraftPrimers` (`store/skeleton-persistence.js:380`).

**Риск:** off-by-one для всех фич в ранее сохранённых сборках после checkpoint.
**Приёмка:** владелец повторно подтверждает 0-based; миграция v14 конвертирует
`segments[].annotations` либо доказано, что таких снимков нет; тест миграции.

### BG-069 — reader `.bodge` GenBank сливает повторный qualifier с общим префиксом (WIP)

`applyQualifier` в `lib/bodge-container-genbank.js:463-478` считает вторую строку
`/key="…"` продолжением, если новое значение начинается с предыдущего.
`/gene="lacZ"` + `/gene="lacZ alpha"` или `/EC_number="2.7.7"` + `"2.7.7.7"` теряют первое
значение; `unknownQualifiers[key]` хранит только последнее. Proof
`bodge-annotation-rich-roundtrip-proof.test.js:44` покрывает только значения без общего
префикса. Writer пишет по строке на значение, round-trip не идентичен.

**Риск:** повторные qualifier'ы молча схлопываются, поэтому `.bodge` round-trip меняет
метаданные аннотации при внешне успешном чтении.
**Приёмка:** продолжение только для физического переноса строки; тест на повтор с общим
префиксом.

### BG-070 — restore из `.bodge` обходит цепочку миграций snapshot

`skeletonToCanonical` встраивает уже мигрированный state без schema-маркера
(`CanvasSkeleton/lib/skeleton-bodge-bridge.js:134`), manifest пишет
`extensions.bodgegene.version = '1.0.0'` (`lib/bodge-zip.js:277`). При Open
`canonicalToSkeleton` передаёт raw state в `saveSnapshot`, который штампует
`SCHEMA_VERSION_CURRENT` (`StartScreen/lib/open-bodge.js:143`;
`store/skeleton-persistence.js:114`), поэтому `loadSnapshot` никогда не запускает
миграции. Файл клиента v12 в клиенте v13 не проходит `canonicalizeAssemblyPrimerRecords`.

**Риск:** старый snapshot ошибочно принимается за текущую schema, остаётся несовместимым
с новым кодом и может потерять данные при следующем сохранении.
**Приёмка:** встроенный snapshot несёт schema; Open прогоняет `migrateSnapshot`; тест
v12-файл → repaired v13.

### BG-071 — `.bodgeassembly` и v1 `.bodge` открываются с потерей данных

Drop `.bodgeassembly` вызывает `readBodge` и `openProjectFromFileData({project})` без
snapshot, library и primers (`StartScreen.jsx:111-127`); `importBodgeAssembly` не
вызывается, хотя `HelpPopover.jsx:108-114` обещает «файл одной сборки». Открытие v1
`.bodge` даёт `canonicalState = null`, и контроллер удаляет существующий snapshot
проекта (`open-bodge.js:110-165`; `bodge-zip.js:445`); единственный код, читающий
inline containers/zones v1, лежит в неиспользуемом `bodge-migrations/v1-to-v2.js:104`.
Тестов на оба пути нет.

**Риск:** интерфейс сообщает об успешном открытии поддерживаемого файла, одновременно
теряя snapshot, библиотеку или праймеры без восстановления.
**Приёмка:** явный отказ с сообщением либо реальный merge/миграция; v1 не стирает
snapshot без подтверждения; тесты.

### BG-072 — SPLIT_PIECE и AA-вариант нарушают инварианты модели сборки

`SPLIT_PIECE` заменяет родителя двумя `createPiece()` половинами с
`derivedReactionId:null, frozen:false` и не вызывает `stripPiecesFromOps`
(`store/skeleton-state-pieces.js:414-483`); T8-операция родителя остаётся с
`inputPieces:[parent]`, `applyAutoReactions` её не убирает
(`lib/auto-reaction-builder.js:122`), замороженная piece становится редактируемой.
AA-вариант строится как `{...sourcePiece, …}` и наследует
`acquisitionMethod/acquisitionParams/derivedReactionId` источника
(`store/skeleton-state-aa-mutagenesis.js:163-174`); `COMMIT_AA_MUTAGENESIS` возвращается
до `validateCreate` и всех finalizers (`store/skeleton-state.js:122`).

**Риск:** висячие операции; ложная provenance «получен PCR из шаблона» у мутанта; общий
derivedReactionId у двух pieces.
**Приёмка:** split чистит ops и переносит или удаляет derived reaction либо отказывает
для frozen; вариант получает собственную acquisition (mutagenesis) и проходит invariants
и finalizers; тесты.

### BG-073 — auto-праймеры перевыпускаются с новыми id при любом изменении pieces

Для зоны с ≥2 pieces `applyJunctionConfig` при каждом новом `pieces` пересобирает список
через `deriveAutoPrimers`, а `makePrimer` минтит `asmprm-<uuidv7>` и новый pairId
(`lib/junction-config-finalizer.js:171, 249-250`; `lib/primer-derive.js:305`); сайты
встраивают primer.id. Триггеры включают цвет, rename, OP_EXECUTE.
`UPDATE_ASSEMBLY_PRIMER` по устаревшему id возвращает state без toast
(`store/skeleton-state-assembly.js:517-521`); кнопка lock в
`AssemblyPrimersPanel.jsx:155` диспатчит по `p.id`.

**Риск:** косметическая правка pieces меняет идентичность праймеров и их сайтов;
последующее edit/lock обращается к устаревшему id и молча не применяется.
**Приёмка:** стабильные id при неизменной деривации (reconcile по source key);
неизвестный id → видимый отказ; тесты.

### BG-074 — удалённая из пула assembly-derived строка воскресает

`removePrimerFromPool` удаляет строку без tombstone (`store/primerSlice.js:365-370`).
Sync-эффект `useAssemblyPrimerWriting` (`editor/assembly-mode/useAssemblyPrimerWriting.js:224-282`)
на каждое изменение `primersById` заново создаёт строку с детерминированным id
`asm-{draftId}-{id}`, пока существует draft-праймер. `PrimerPoolList.jsx:322-332`
предлагает «удалить» без объяснения.

**Риск:** удалённый пользователем derived-праймер молча возвращается в пул и последующие
экспорты, поэтому операция Delete не имеет заявленного эффекта.
**Приёмка:** delete заблокирован для `origin.kind === 'assembly-derived'` с объяснением
либо tombstone уважается sync; тест.

### BG-075 — BioPython-fallback `/api/import` молча теряет primers и rejected

При исключении или `None` собственного парсера `parse_snapgene` падает в
`SeqIO.read(..., "snapgene")` (`src/pvcs/parser.py:352, 407-411`); fallback-метаданные
не содержат `primers`/`rejected` (:439-445), и `build_import_payload` отдаёт
`"primers": [], "rejected": []` (`gui/api/server.py:255-257`) без пометки partial.
Контрактный тест покрывает только основной путь.

**Риск:** частичный SnapGene-импорт выглядит полным и молча теряет праймеры и
отклонённые features.
**Приёмка:** fallback помечает payload как partial (источник парсера, причина), frontend
показывает неполный импорт; тест.

### BG-076 — WIP-геометрия и sync: три несогласованности

1) `reflectAnnotation` составной фичи на линейном сегменте сохраняет порядок обхода и даёт
segments по убыванию; `locationSpan` читает это как origin-wrap и возвращает
`{start:14, end:10}` (`CanvasSkeleton/lib/segment-annotation-transfer.js:205`;
`lib/annotation-location.js:137`); тест `ligation-product-annotations-repro.test.js:56`
закрепляет start > end. 2) Pool-sync пропускает draft-праймеры без `draftId`
(`useAssemblyPrimerWriting.js:255`); v13 не backfill'ит поле,
`canonicalAssemblyPrimerForDocument` возвращает такую запись без repair
(`assembly-primer-site.js:150`). 3) Container editor хэширует edited buffer для доверия к
сайтам праймеров (`ContainerEditorSkeleton.jsx:487`), Library обнуляет хэш при открытой
правке (`LibrarySingleInspector.jsx:200`) — две политики.

**Риск:** reverse-аннотация интерпретируется как wrap, legacy draft-праймер не попадает
в пул, а одинаковый document получает разные trust-решения в двух редакторах.
**Приёмка:** reflect переворачивает порядок сегментов для strand −1 на линейном;
миграция backfill'ит `draftId`; одна документированная политика хэша; тесты.

### BG-077 — Alignment: пять runtime-дефектов из SPEC_ALIGNMENT_RELIABILITY живы и не были зарегистрированы

Код идентичен HEAD. 1) Trace как reference: `reconcileSelection` берёт первый input без
учёта kind (`store/alignmentSlice.js:143`); `runAlignment` меняет a/b местами (:279-281),
но правки пишут в workingReference для refId-trace (:297-313), save отказывает
`no-library-entry` (`AlignResultView.jsx:258`); radio «реф» не отключён
(`AlignInputPanel.jsx:181`). 2) Не-DNA буквы: cleaner держит A–Z, `expand()` мапит
неизвестные в 'ACGT' — протеиновый FASTA даёт 100 % identity без warning
(`lib/alignment/align-pairwise.js:28, 62`; `parse-multi-fasta.js:14`;
`alignment-quality.js:11`). 3) Anchor берёт крупнейший кластер без проверки runner-up
вопреки комментарию (`anchor.js:21-24` vs `:73-83`), включён по умолчанию для ≥1000 bp
(`align-pairwise.js:311`). 4) Консенсус голосует только по ref-позициям, indel не
попадает; упавшие reads молча выпадают (`multi-align.js:60, 76-94`). 5) ABIF без проверки
границ, типов и размеров, смешение generations (`abif-parse.js:41, 68-88`), RangeError
показывается как есть (`AlignInputPanel.jsx:74`). Всё синхронно в UI-потоке
(`alignmentSlice.js:268-282`).

**Риск:** инструмент выдаёт ложные identity/consensus и сохраняет правки не в тот
reference; malformed ABIF либо крупный alignment может аварийно остановить или заморозить UI.
**Приёмка:** trace не может быть reference; не-IUPAC → отказ или mismatch с warning;
неоднозначный anchor → полный DP; indel в консенсусе и отчёт об упавших reads; ABIF
preflight с типизированной ошибкой; тесты на каждый пункт. Спецификация остаётся
deferred в BACKLOG, дефекты живут здесь.

### BG-084 — `sha256Hex` падает на non-secure origin

`lib/bodge-hash.js:12-17` использует `crypto.subtle`, иначе
`await import('node:crypto')`; в браузерной сборке это пустой stub
(`dist/assets/__vite-browser-external-*.js`, экспорт `{}`), а `server.host: true`
(`vite.config.js:120`) намеренно открывает LAN-адреса, где `crypto.subtle` недоступен по
http. Хэширование манифеста, recovery и dedup праймеров бросает
`createHash is not a function` вместо деградации. Источник warning `node:crypto` в build.

**Риск:** на поддерживаемом LAN-origin падают save/hash/recovery/dedup-пути вместо
контролируемой деградации или явного отказа.
**Приёмка:** чистый JS SHA-256 fallback либо явная ошибка с подсказкой; тест с
undefined `crypto.subtle`.

### BG-086 — `digest()` не нормализует разрез по кольцу; `MAX_SITE = 13` пропускает длинные сайты

`digest` ищет сайты с wrap, но `_cutPosition` возвращает `sitePos + cut[0]` без modulo
(`restriction-db.js:569-575`); `_linearize` при `cutPos ≥ seqLen` возвращает
неповёрнутую последовательность, тогда как `_shiftAnnotations` сдвигает аннотации по
модулю (:631) — фича через разрез получает start > end. `digest-fragments.js:29`
нормализует ту же величину по модулю: два production-пути расходятся. `MAX_SITE = 13` в
обоих сканерах (:269) при XcmI 15 bp в каталоге и custom-сайтах без ограничения длины:
сайт, начинающийся на seqLen−1 кольца, пропускается. Тест
`restriction-circular-origin-l13.test.js:29` проверяет только отсутствие ошибки.

**Риск:** кольцевой digest и координаты аннотаций оказываются неверными, а длинные
origin-crossing сайты рестрикции молча не обнаруживаются.
**Приёмка:** одна нормализация разреза; MAX_SITE из каталога; тест origin-straddling
digest с аннотацией через разрез. Часть BG-062.

## P1 — неверное или вводящее в заблуждение состояние

### BG-039 — позиции mismatch показываются то с нуля, то с единицы

Modal переводит внутренние 0-based позиции mismatch в пользовательские 1-based, а
`PrimerSelectionActions.warningText()` выводит те же значения без сдвига.

**Приёмка:** resolver остаётся 0-based, каждый пользовательский formatter делает один
явный `+1`; один fixture показывает одинаковую позицию во всех primer/PCR-поверхностях.

### BG-009 — Gibson предлагается как внутренний junction

`OpGroupPicker.jsx` включает `gibson`, хотя `junction-derive.js` исключает Gibson из `INTERNAL_METHODS`: Gibson закрывает кольцо, а не является методом внутренней линейной границы.

**Приёмка:** selector строится из того же canonical capability set, что verification.

### BG-010 — подтверждение заказа праймеров является пустым действием

`skeleton-state-operations.js` записывает только `orderConfirmedAt`; production-reader поля не найден.

**Приёмка:** действие открывает/создаёт реальный PrimerOrderPanel workflow либо удаляется как ложная capability.

### BG-011 — SegmentList оставляет ручные праймеры на старых координатах

`SegmentList.jsx` вызывает `updateSegmentRange` напрямую и обходит `shiftAssemblyPrimers` из `useAssemblyEdit.js`.

**Риск:** в заказ уходит праймер для предыдущей версии piece.
**Приёмка:** праймеры сдвигаются доказуемо либо помечаются stale и блокируют экспорт.

### BG-012 — realised DAG не инвалидируется после изменения piece

После изменения фрагмента ранее реализованный результат обновляется только при повторном «Реализовать».

**Приёмка:** явный stale-marker и блокировка неверного export либо детерминированная invalidation без скрытой перегенерации.

### BG-013 — мутация не получает point-аннотацию

`adapters/kld.js` создаёт изменённую последовательность, но не добавляет annotation уровня `point` с mutation label.

**Риск:** изменение невидимо в карте/GenBank и теряется как биологический факт.
**Приёмка:** mutation annotation имеет стабильный id и корректную 0-based end-exclusive координату.

### BG-014 — интронные модели имеют три correctness-gap

1. Hybrid AA-track может показывать сырые кодоны поверх сплайсированного CDS.
2. `spliceRegion` не сообщает non-canonical donor/acceptor и mature-length frame mismatch.
3. Несвязанный intron может быть присвоен любому охватывающему translatable region.

**Приёмка:** transcript-aware rows побеждают raw frame; splice warnings не блокируют молча; intron связывается с конкретным transcript/region.

### BG-015 — sticky manual ligation может триммить случайную 1–6 bp гомологию

`ligate.js` использует `findOverlap(..., 6, 1)` для `ends:'sticky'`. Основной RE-cloning path строит продукт иначе; дефект касается ручной Ligate operation.

**Перед исправлением:** fixture должен зафиксировать входную конвенцию top-cut vs duplicated overhang. Если overhang уже представлен один раз, overlap обязан быть нулевым.

### BG-016 — wrap-origin RE hover неполон

`RestrictionTrack` отображает origin-crossing site, но `StrandsTrack` не получает wrap metadata и отбрасывает cut/overhang/binding около нулевой координаты.

**Риск:** метка видна, а каретка/connector/overhang отсутствуют.
**Приёмка:** единое преобразование absolute coordinate -> rendered bridge column.

### BG-018 — AT-rich low-complexity праймер не получает warning

`local-primer-design.js` ловит ограниченный набор повторов и может пропустить доминирующую AT-rich low complexity.

**Исправление:** предупреждать только когда low-complexity доминирует binding region, чтобы не создать массовые false positives; проверять на транзитивных primer-design путях.

### BG-021 — стартовый экран всегда утверждает, что библиотека пуста

`MainPanel.jsx:275` рендерит `<EmptyCard />` **безусловно**, без проверки на пустоту. Карточка «Сначала наполните библиотеку» висит всегда — в том же окне, где сайдбар показывает «Библиотека · 142». Биолог видит два взаимоисключающих утверждения одновременно.

Следствие тяжелее самой карточки: CTA «Выбрать набор» (`EmptyCard.onAddStarterSet` → `buildStarterSet` → `addLibraryEntriesBulk`) **работает** и пишет в Dexie, но экран не меняется, а тоста нет. Кнопка читается как мёртвая → пользователь жмёт ещё раз. Браузер-проверка: два клика → `library` store вырос на 8 записей (4 вектора × 2), UI не изменился ни разу, консоль чиста, перезагрузка не помогла.

Не регрессия чистки 17.07: `MainPanel.jsx` и `EmptyCard.jsx` побайтно совпадают с checkpoint `7e2576c`, на котором сюита была 7434/0. Дефект пре-существующий — его просто нечем было поймать, так как unit-тесты рендерят `EmptyCard` изолированно.

**Исправление:** гейт на `<EmptyCard />` по тому же источнику счёта, что кормит сайдбар (один знаменатель, не второй счётчик); тост об успехе не глушить; продумать идемпотентность повторного добавления стартового набора (сейчас дубликаты копятся молча).

### BG-045 — Undo после успешного Save Version может воскресить уже сохранённый buffer

После `{ok:true}` A1b очищает transient fields, но локальный undo stack
`useAnnotationUndoRedo` сбрасывается только при смене `itemKey`. Если Inspector остаётся
на той же записи, следующий Ctrl+Z может вернуть промежуточные sequence/annotations,
topology и editLog уже после успешного сохранения.

**Риск:** UI снова показывает «несохранённые» данные после commit point и позволяет
случайно создать повторную/другую версию из старой истории.
**Приёмка:** успешный Save создаёт явную history boundary; последующий Undo не
восстанавливает pre-save buffer, а failure сохраняет историю для retry.

Подтверждено аудитом 05.09: `useAnnotationUndoRedo.js:53-56` сбрасывает стеки только по
`itemKey`; `useLibrarySaveFlow.clearPending` (:46-57) undo не уведомляет.

### BG-058 — StartScreen starter-set CTA оставляет библиотеку пустой в тестовом контракте

P16 corrective related gate и повторный one-worker диагностический пакет независимо
получили один assertion: после клика `Выбрать набор` число `libraryEntries` остаётся 0.
Ни один файл четырёхфайлового P16 corrective manifest StartScreen не меняет; причина в
product-path или fixture пока не локализована и заодно не исправлялась.

**Приёмка:** изолированный `start-screen.test.jsx` доказывает, что CTA добавляет starter
entries и открывает ожидаемый следующий экран; если устарел fixture, обновить контракт,
а не маскировать пустой результат ожиданием или увеличением timeout.

### BG-080 — projectSlice пишет удалённый fullscreen `'dag'`

`FULLSCREENS` больше не содержит 'dag' (`store/canvasSlice.js:5`), но
`openProjectFromIndexedDB`, `openProjectFromFileData`, `retryAcquireLock` пишут
`state.canvas.activeFullscreen = 'dag'` напрямую (`store/projectSlice.js:292, 331, 486`).
Ctrl+O и drop с Home идут с `navigateToLibrary:false` (`App.jsx:125`;
`StartScreen.jsx:120`), switch в App.jsx не имеет case 'dag' → WorkspaceRouter при
`workspace.active === 'startup'` показывает placeholder (`AppShell/index.jsx:56`),
Sidebar без подсветки. Шесть тестов закрепляют 'dag'
(`lifecycle.integration.test.js:81` и другие).

**Риск:** Open/Drop завершается переходом на несуществующий экран — пользователь видит
placeholder вместо только что открытого проекта.
**Приёмка:** пути open ведут на реальный экран; тесты проверяют экран, а не литерал.

### BG-081 — второй mount AssemblyPrimersPanel открывает редактор праймера без template (WIP)

WIP заменил локальный EditModal на PrimerFromSelectionModal с props
template/topology/documentHash/annotations/displayFeatures/boundaries
(`AssemblyPrimersPanel.jsx:226, 260, 399`); `AssemblyShellBody.jsx:964-973` их передаёт, а
`ProjectAssemblyWorkspace.jsx:115` (вид «Праймеры») монтирует панель только с `draftId`.
В этом виде «Редактировать» получает template='', documentHash=null, boundaries=[] и
не может спроецировать посадку. Родственно BG-056.

**Риск:** один production-mount сохраняет праймер без проверяемой template geometry либо
не может корректно спроецировать его на сборку.
**Приёмка:** оба mount получают одинаковый контекст либо панель выводит его из draft;
тест рендерит view='primers' и редактирует с реальным template.

### BG-082 — три пути копирования выделения расходятся

Ctrl+C с фокусом внутри viewer идёт через `useSequenceKeyboard` без
`inverted`/`terminalSelect` (`hooks/useSequenceKeyboard.js:51-72, 111`); контекстное меню
и глобальный copy-source учитывают оба (`hooks/useSelectionState.js:571, 606`;
`lib/global-copy.js:109`). После «Инвертировать выделение» или drag в terminal overhang
Ctrl+C копирует другой текст, чем меню. Заголовок
`terminal-overhang-select-v169.test.jsx:7` обещает поведение Ctrl+C, тест проверяет
только `selectionSlice`.

**Риск:** пользователь получает разные последовательности для одного выделения в
зависимости от способа Copy, особенно при inversion и terminal overhang.
**Приёмка:** один dispatcher копирования; тест keyboard-пути с инверсией и overhang.

### BG-083 — multi-tab lock защищает только путь открытия файла

`tryAcquireLock` вызывается лишь из `openProjectFromIndexedDB` (без production-вызова),
`openProjectFromFileData` и `retryAcquireLock` (`store/projectSlice.js:133-150, 190-233,
376-394`); `createProject`, `activateProject`, `MainPanel.handleProjectClick`
(`MainPanel.jsx:128`) активируют проект без lock, `_scheduleAutosave` пишет безусловно.
`hasProjectLock` не имеет потребителей. `docs/ARCHITECTURE.md:118` обещает защиту от
параллельных писателей.

**Риск:** две вкладки на одном проекте молча перезаписывают друг друга.
**Приёмка:** активация берёт lock либо документ перестаёт это обещать; тест двух вкладок.

### BG-085 — хосты читают сырые extended-domain координаты origin-crossing выделения

Viewer намеренно отдаёт координаты вне [0, N] на кольце (leading < 0, trailing > N) и
канонизирует их только для своих писателей (`SequenceView/hooks/useSelectionContract.js:56`).
`useSequenceSelection` экспортирует сырые `selStart/selEnd/caretAnchor/caretPos`
(`hooks/useSequenceSelection.js:173`); Annotator строит `activeSelection`
(`Annotator/index.jsx:178`; `PreviewTab.jsx:314`), RangePickerModal читает start/end
(`RangePickerModal.jsx:161`), PcrModeShell вызывает `writePrimerForRange(min, max)`
(`PcrModeShell.jsx:122`). Drag через origin в этих хостах даёт end > seqLength.

**Риск:** хосты получают координаты вне своего домена и создают неверные annotation,
PCR-primer или range-операции на origin-crossing выделении.
**Приёмка:** решение владельца о контракте хоста; хосты канонизируют либо hook отдаёт
canonical range; тесты для трёх хостов.

### BG-087 — Library: ошибка сохранения sub-feature молчит, два пути обходят dirty guard

`useFeatureEditorFlow.onFeatureSave` ловит отказ core для sub-feature в try/catch, пишет
`console.warn` и выходит до `applyOp`/`closeFeatureEditor`
(`inspector/hooks/useFeatureEditorFlow.js:150`); у SubFeatureRow нет канала ошибки
(`FeatureEditorModal.jsx:185`) — Save «не работает» без сообщения.
`VersionTimelineModal.onSelect` и toast «Продолжить аннотацию» вызывают `setSelectedId`
напрямую мимо `guardedSelect` (`LibraryWorkspace.jsx:722, 771`); toast-путь может выбрать
запись при `view === 'common'`, оставив инспектор скрытым.

**Риск:** ошибка сохранения остаётся невидимой, а обход dirty guard позволяет сменить
выбор и потерять несохранённые правки.
**Приёмка:** ошибка sub-feature видна в модале; все пути выбора идут через guard; тесты.

## P2 — доступность и визуальная читаемость

### BG-043 — один assembly-primer многократно рисуется на sequence canvas

В локальном browser gate PRIMER-TAIL-SAVE-1 для линейной тестовой сборки 88 bp
панель и состояние показывали ровно `1 праймер`, но canvas после возврата в сборку и
после reload рисовал тот же `asm-fwd-1` диагональной серией повторов. Full oligo и
5′-tail при этом сохранялись корректно; console errors отсутствовали. Дефект не входит
в пятифайловый persistence package и не исправлялся заодно.

**Риск:** карта визуально обещает множество посадок/праймеров при одной canonical
записи и становится практически нечитаемой.
**Приёмка:** fixture с одним linear assembly primer отображает ровно один primer glyph
до/после route-return и reload; panel count, hit targets и canvas instances согласованы.

### BG-042 — подписи аннотаций с белым текстом и чёрной обводкой плохо читаются на HD

В Sequence/Map view подписи длинных features (в частности `KanR`) используют белый
текст с контрастной тёмной обводкой. На HD/низком масштабе тонкие глифы сливаются с
обводкой и становятся заметно тяжелее для чтения. Дефект подтверждён пользовательским
скриншотом на `1294×912`; в PRIMER-INDEL-2 typography/palette не менялись.

**Приёмка:** на светлой и тёмной теме при 1280×720 и системном масштабе 100/125%
feature labels остаются читаемыми без halo-эффекта; цвет выбирается через design tokens,
не теряет контраст на светлых/тёмных feature fills и не ухудшает overlap/selection state.

### BG-053 — IME composition DNA-поля не имеет самостоятельного commit-контракта

Текущий строгий handler валидирует каждый `change`, поэтому промежуточный IME-ввод может
быть нормализован или отклонён до `compositionend`. Отклонённый correction полагался на
необязательный отдельный `input` после `compositionend`; его hunks полностью удалены,
полурешения в product code нет. Обычная посимвольная печать и paste этим дефектом не
затронуты.

**Приёмка отдельного пакета:** tail и binding используют один composition-aware commit;
raw composing value не разрушается, а сам `compositionend` без дополнительного `input`
нормализует valid IUPAC либо целиком откатывает invalid commit с сохранением каретки.
Нужны production-shaped tests обоих event-order и browser-проверка реальным Windows IME.

## P2 — тестовая инфраструктура

### BG-041 — NotebookEntryEditor preview стабильно пуст в Vitest

Связанный прогон PRIMER-INDEL-2 (`828` файлов / `8803` теста) и последующий
изолированный запуск на одном worker одинаково воспроизводят
`NotebookEntryEditor.test.jsx > preview updates with new text`: за время `waitFor`
`notebook-preview.innerHTML` остаётся пустым вместо `<strong>world</strong>`.
Изолированно файл даёт `11/12 PASS`; соседний timeout из широкого прогона изолированно
прошёл. Ни один Notebook production/test-файл не входит в primer/AA candidate.

**Не установлено:** это реальный дефект initial/rerender preview либо устаревший harness
асинхронного markdown renderer; браузерный notebook-flow не проверялся.
**Приёмка:** один test-first package локализует owner, доказывает initial и rerendered
Markdown preview без сетевого/API ingress и закрывает isolated + related assertion.

### BG-022 — Vitest fork иногда аварийно завершается в полном прогоне (P2, инфраструктура; не блокер продукта)

Параллельный полный прогон интермиттентно пишет `[vitest-pool]: Worker forks emitted error` →
`Worker exited unexpectedly` и не получает результат одного тестового файла. В U7 симптом
воспроизвёлся и при `maxWorkers=4`, и при `maxWorkers=2` (802/803 файла). На том же дереве
секционные и изолированные прогоны чистые; финальный поимённо сверенный прогон после corrective
выполнил 804/804 файла и 8182 теста (8162 passed + 20 skipped, 0 failed). Стабильного
assertion-дефекта и доказанной связи с DNA Search, LINEAR-ядром или памятью нет.

**Наблюдение 06.09.2026:** на base
`15169db8636ed8c9fdc2dbb759a8719f58e7af23` с принятым WIP после S3-C2 выполнены три
полных post-correction прогона. Два завершились с полным набором 857 файлов / 9 286
тестов и code 0; один собрал 856 / 9 266, потерял файл на 20 тестов и завершился
`Worker exited unexpectedly`, code 1. Единственный разрешённый JSON-инвентарный repeat
чистого прогона поимённо совпал с `rg`: 857 / 857. В pre-correction RED терялся другой
файл на 6 тестов. Поэтому изоляция `container-editor-skeleton-v2.test.jsx` принята как
локальная гигиена, но не как установленная причина или исправление worker crash.

**Наблюдение INFRA-GATE-1 06.09.2026:** на recovery base `6145bf0` с
диагностическим candidate один полный parallel run завершил Vitest code 0 и точные
expected = ended = run-end = JSON inventories **859 / 859**: 9 307 тестов, 9 287
passed, 20 skipped, 0 failed. Fork-error не сообщён, ни один module/file не отсутствует
в inventories. Gate вернул FAIL только потому, что строгий RSS-контракт ожидал 859 пар,
а получил 859 setup и 857 afterAll. Reporter отдельно зафиксировал 857 модулей state
`passed` и два state `skipped`: `canvas-click-add-v99.test.jsx` и
`skeleton-canvas-layout.test.jsx`. Старые RSS-записи не содержат moduleId, поэтому их
точное соответствие двум skipped-модулям остаётся гипотезой. INFRA-GATE-1 остановлен:
опровергнут контракт инструмента, а не воспроизведён или исправлен BG-022. Следующий
candidate обязан связать RSS с moduleId и разрешать setup-only только модулю, который
reporter завершил как `skipped`.

**Наблюдение INFRA-GATE-2 06.09.2026:** принятый module-aware candidate выполнил один
полный parallel run с exact expected = ended = run-end = JSON inventories **860 / 860**:
9 318 тестов, 9 297 passed, 21 skipped, 0 failed, raw exit 0, reason `passed`, 0
unhandled errors. Все 1 717 RSS-сэмплов валидны: 860 setup, 857 afterAll, 857 точных
пар. Три setup-only записи теперь по moduleId совпадают только с reporter state
`skipped`: инфраструктурная fixture, `canvas-click-add-v99.test.jsx` и
`skeleton-canvas-layout.test.jsx`; sequence errors 0. Наблюдавшийся worker RSS maximum
866 148 352 bytes — точечный sample, не process-tree total и не гарантированный peak.
Этот run не воспроизвёл fork-error и доказал полноту собственного inventory, но не
установил причину интермиттентного crash и один не закрывает BG-022.

**Наблюдение ASM-6A 06.09.2026:** related-прогон от base `47f72a2` ожидал 146
модулей, но fork-worker завершился после 145 и потерял один модуль на четыре теста.
Предопределённая локализация тремя непересекающимися точными разделами завершила
67 + 30 + 49 = **146 / 146** модулей и 1 252 теста без assertion failure. После
correction финальный `test:gate` на commit `864bc76` завершил exact expected = ended =
run-end = JSON inventories **863 / 863**: 9 339 тестов, 9 318 passed, 21 skipped,
0 failed, raw exit 0. Это доказывает регрессионный gate ASM-6A, но не устанавливает
причину интермиттентного fork crash и не выполняет критерий трёх чистых прогонов.

**Наблюдение ASM-5B 07.09.2026:** единственный полный module-aware `test:gate` на
base/HEAD `bd710973` с frozen candidate `d78a7b61…` снова завершился
`Worker exited unexpectedly`, raw exit 1 и одним unhandled error. Expected inventory —
864 модуля, lifecycle ended — 863; не завершился
`gui/designer/src/components/SequenceView/__tests__/out-of-range-mask-v87.test.jsx`
на четыре теста. Run-end и JSON
перечислили 864/864, JSON сообщил 9 378 passed + 21 skipped, 0 failed, но RSS получил
только 863 setup и 860 afterAll, поэтому строгий gate корректно вернул FAIL. Maximum
2 138 607 616 bytes — worker point sample, не process-tree total и не установленная
причина. Артефакты: `tmp/vitest-gate/2026-09-07T09-31-22-691Z-495260-ff387cb8`.
Предшествующий related run был полным: 466/466 файлов, 4 480 тестов, exit 0. Полный
retry запрещён; ASM-5B остановлен без попытки чинить BG-022 внутри продуктового пакета.

Пять безымянных блоков `ECONNREFUSED` к `localhost:3000` печатает happy-dom
(`node_modules/happy-dom/lib/fetch/Fetch.js:539`) через `page.console.error` для
относительного `fetch('/common-features.json')` в
`gui/designer/src/feature-detection.js:49`. Ошибка перехватывается и не является
unhandled rejection; по коду это отдельный от worker crash шум. До INFRA-GATE-2 аудит
считал 13 тестовых файлов, рендерящих Library, App или Annotator без fetch-stub,
кандидатами этого источника шума.

Точечный common-features test stub убрал этот источник из полного INFRA-GATE-2 run.
Остались четыре анонимных блока `ECONNREFUSED`; временная compatibility-трассировка
ранее связала их с двумя делегированными запросами `/api/import`. Это отдельный backlog,
а не критерий закрытия BG-022.

**Риск:** полный прогон может потерять файл и дать неполное доказательство; поэтому один итоговый
счётчик без сверки списка файлов недостаточен. Нагрузочные assertion-timeout принадлежат BG-019,
а не этому дефекту.

**Диагностика и приёмка:** при следующем воспроизведении сохранить stderr, имя потерянного файла,
import/test duration и module-aware RSS процесса; сравнить `maxWorkers=4`, `maxWorkers=2` и
`--no-file-parallelism`. Закрывать после устранения установленной причины и трёх последовательных
полных прогонов с точным file inventory без fork-error; произвольные test-timeout не поднимать.


### BG-019 — полный Vitest иногда даёт единичный timeout-fail

Интермиттентный `Test timed out in 5000ms` появляется только под общей CPU-нагрузкой и проходит в изоляции/повторном прогоне.

**Диагностика:** несколько прогонов с verbose/bail/no-file-parallelism, сохранить имя файла и import/test duration. Не объявлять произвольный timeout регрессией без изолированного воспроизведения.

Legacy debt ID: `TD-PRIMER-WIZARD-FLAKE`.

**Наблюдение 21.07.2026 — `dead-canvas-closure.test.js` подошёл к своему пределу.** На полном прогоне U8 файл упал по таймауту (5,7 с против дефолтных 5 с), изолированно — зелёный 2/2, assertion нет. Это не дефект поиска, но и не чистая случайность: его второй `it` читает КАЖДЫЙ `.js`/`.jsx` в `src`, а стоимость растёт вместе с репозиторием. Падение гигиенического теста никогда не означает регрессию продукта.

**Что именно дорого (сверено с кодом, а не предположено).** Обход уже оптимален внутри файла: один `readdirSync`-проход и ровно один `readFileSync` на файл. Ускорять там нечего. Дорого другое — таких тестов ПЯТЬ, и каждый обходит то же дерево целиком в своём воркере: `dead-canvas-closure`, `dead-biological-helpers-removed`, `legacy-library-catalog-removed`, `strings-coverage`, `search-ui-boundary`. Это до ~6,5 тыс. чтений с диска, выполняемых параллельно и конкурирующих между собой и с остальным прогоном. Отсюда и характер симптома: зелено в изоляции, таймаут под нагрузкой.

**Исправление (выбрать одно, не «поднять таймаут и забыть»):** либо свести обходящие дерево проверки в ОДИН файл, где дерево читается однажды и переиспользуется всеми правилами (пять обходов → один), либо вывести этот класс целиком из обычного тяжёлого параллельного прогона в отдельную гигиеническую задачу. Поднятие таймаута — маскировка: оно скроет и настоящую деградацию обхода.

## Ожидают приёмки владельца или checkpoint

Технически решённые записи. Удаляются после визуальной приёмки владельца или после
checkpoint пакета, в котором лежит исправление. Одна строка на запись.

- BG-017 — RC сегмента переносит аннотации через тот же overhang-aware plan
  (`CanvasSkeleton/lib/segment-overhangs.js:459`, WIP); proof
  `reverse-complement-segment-mixed-polarity.test.js:76-109`.
- BG-026 — annotation-only autosave только при недивергентном merged buffer
  (`Library/LibraryWorkspace.jsx:555-577`, `lib/library-current-document.js`, WIP, ANN A1);
  proof `library-current-document.test.js`, `library-workspace-annotation-persist.test.jsx:125`.
  Не покрыт reload-leg из старой приёмки.
- BG-029 — opaque стабильные id, cascade delete, reparent при split/merge
  (`lib/annotation-identity.js`, `lib/annotation-edit.js:330`, WIP, ANN A2); proof
  `annotation-identity-lifecycle-proof.test.js`.
- BG-031 — keyed jobs, frozen run contexts, fail-closed stale-drop Annotator
  (`store/annotatorSlice.js:295-355`, `lib/annotator-run-identity.js`, WIP, ANN B1); proof
  `annotator-scope-epoch.test.jsx`. Остаток: `runContexts` растёт до смены документа — BACKLOG.
- BG-040 — ключ `pcr.product.warn.hairpin` в EN/RU (`i18n.js:78, 721`, WIP); proof
  `primer-selection-actions.test.jsx:22-30, 183-197`.
- BG-046 — drag на wrap-копии кольца (O1/O2); browser proof на pUC19 2686 bp; ждёт
  визуальной приёмки.
- BG-047 — orphan importer key удалён; отсутствие production-потребителей подтверждено
  `rg`, focused `strings-coverage.test.js` — 1 файл / 1 тест PASS; ждёт checkpoint gate.
- BG-050 — canonical repair сохраняет primer id, repaired sites в draft/pool и X-glyph;
  proof `assembly-primer-canonical-sites.test.jsx:194, 317, 345`. Save/reload и browser
  в этом пакете не доказаны; ждёт приёмки.
- BG-054 — packer резервирует label footprint и 2 px hit perimeter, удерживает компоненты
  occurrence на одной строке и разводит конфликтующие tiers; proof
  `primer-track-layout.test.js:269, 278, 310, 321`. Browser в этом пакете не проверен.
- BG-056 — AssemblyPrimerPanel открывает общий rich editor и передаёт template landing,
  annotation и restriction-site context; proof `assembly-primer-design.test.jsx:225`.
  Другой production-mount и browser не доказаны; ждёт приёмки.
- BG-059 — long insertion при пересечении с 5′ tail переводится в `far-outer` без layout
  jump, dense substitutions сохраняют compact run и явные expanded X-cells/X-letters;
  proof `primer-track-step.test.jsx:515, 607`. Browser после correction не проверен.
