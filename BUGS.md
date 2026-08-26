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

**Риск:** KLD-лигирование физически не сработает.
**Приёмка:** KLD/self-closure олиго несут `phosphorylated:true` и экспортируют `5Phos`; классические RE-концы не получают этот флаг автоматически.

### BG-008 — starter set использует имена реальных плазмид для коротких stand-ins

`components/Library/lib/starter-set.js` честно называет последовательности synthetic stand-ins, но UI показывает `pUC19`, `pET-28b(+)`, `pGEX-4T-1`, `pBluescript SK(+)` без предупреждения.

**Риск:** биолог принимает сотни bp demo-последовательности за канонические многокилобазные векторы.
**Исправление:** либо встроить проверенные канонические записи с source/version, либо переименовать в явно synthetic demo и запретить wet-lab export.

### BG-026 — annotation-only edit transient-буфера портит сохранённую молекулу

После sequence edit Inspector хранит `editedSequence` и пересчитанные под неё
`editedAnnotations`. Следующая annotation-only операция передаёт только
`{editedAnnotations}`; `LibraryWorkspace` проверяет наличие `editedSequence` только в
текущем patch и поэтому пишет buffer-relative координаты в неизменённый saved entry.

**Риск:** после вставки/удаления базы переименование, undo или Annotator Save может
необратимо сдвинуть аннотации исходной последовательности.
**Приёмка:** все annotation operations принадлежат единому current-document; пока есть
transient sequence/topology, durable write в исходник невозможен. Интеграционный
сценарий `sequence edit → annotation edit/undo/Annotator save → reload` сохраняет
исходник и буфер раздельно.

### BG-027 — Ctrl+S `.bodge` не включает project-linked library entries

`App.handleSave` строит v2 state через `skeletonToCanonical`, но bridge не добавляет
`libraryEntries`; writer создаёт `library/entries.json` только когда вызывающий передал
его явно. Open-path этот раздел уже ожидает.

**Риск:** portable checkpoint проекта может сохранить сборку, но потерять молекулы и
их аннотации.
**Приёмка:** один canonical save helper собирает assembly и связанные library entries;
product-level `Ctrl+S → readBodge` round-trip сравнивает молекулы и полный `annotations[]`.

### BG-028 — compound/origin-crossing annotation меняет биологический смысл

Persisted model принимает только scalar `start < end`. GenBank `join(...)` и SnapGene
segments сворачиваются в `min(start)..max(end)`, а смена origin режет один region на
два независимых объекта без перепривязки children.

**Риск:** origin-crossing CDS/promoter превращается в почти полную молекулу, получает
гигантский ложный intron либо теряет hierarchy после rotate-origin.
**Приёмка:** segment-aware canonical location сохраняет identity, strand и parent links;
import/edit/rotate/render/export round-trip проверен на кольцевом compound CDS.

### BG-029 — manual annotation lifecycle нарушает identity и parent links

Manual create/update выводит ID из изменяемых полей и не включает strand/level/parent;
rename/move меняет identity, а collision затрагивает несколько записей. Delete, split,
merge и sequence-delete могут оставить detail/point с мёртвым `regionId`.

**Риск:** дочерние домены/интроны теряются или связываются с другой фичей; удаление по
collision-ID может удалить несколько объектов.
**Приёмка:** один opaque ID factory, ID неизменен при edit, ingress мигрирует/отвергает
дубли, а cascade/reparent semantics доказаны для update/delete/split/merge/sequence edit.

Legacy debt ID: `TD-IMPORTER-NO-ID`.

### BG-030 — annotation interchange теряет qualifiers, hierarchy и provenance

Frontend GenBank parser перезаписывает повторные qualifiers; exporter пишет custom
level/parent markers, которые importer не читает, и может дважды восстановить intron.
SnapGene backend отбрасывает rich qualifiers и segment structure до JavaScript; `.bodge`
container annotations используют параллельный `parentId` contract.

**Риск:** `gene/product/codon_start/transl_table/db_xref`, exon structure, source и
иерархия молча меняются после import/export/reopen.
**Приёмка:** один ingress schema gate и lossless fixtures для repeated qualifiers,
compound linear/circular locations, all three levels and both GenBank/SnapGene routes.

### BG-031 — Annotator может принять результат другого scope или документа

Result state очищается при смене `sequenceId`, но не при `full ↔ region` или смене
region на той же молекуле. Заголовок использует live selection, тогда как L1/L2 могут
исполняться по старому scope. Manual pipeline не имеет job/document epoch, cancel или
stale-drop и безусловно публикует late reply.

**Риск:** пользователь принимает и сохраняет предсказание, рассчитанное для другой
области или предыдущего содержимого.
**Приёмка:** result key включает document+topology+scope epoch; показанный scope равен
исполненному; смена scope/document отменяет job или гарантированно отбрасывает ответ.

Legacy debt ID: `TD-CANVAS-V2-ANNOTATOR-SCOPE-GUARD`.

### BG-032 — annotation surfaces читают разные версии текущей молекулы

Sequence/Annotator получают `editedSequence`, но Overview и несколько validation paths
используют saved sequence/topology/length. FeatureEditor при обычном Save пересоздаёт
children из узкой формы и стирает source/qualifiers/description/identity/coverage.

**Риск:** карта показывает старую геометрию, валидная фича нового хвоста отвергается или
detail provenance исчезает при редактировании родителя.
**Приёмка:** один current-document DTO кормит все поверхности; editor применяет lossless
patch и отдельный тест сохраняет неизвестные/qualifier fields детей.

### BG-033 — reverse-strand CDS auto-annotation сканирует forward DNA

`autoAnnotate` всегда анализирует `sequence.slice(start,end)` и не reverse-complement
для region со strand `-1`; созданные start/stop/tag details также не наследуют strand.

**Риск:** старт/стоп-кодоны и белковые теги reverse CDS пропускаются, создаются ложно
или получают неверные координаты.
**Приёмка:** strand-aware fixture сравнивает forward CDS с reverse-complement twin и
проверяет абсолютные координаты/strand всех details.

### BG-035 — primer-record v2 не замыкает реальный product route

Corrected ANN-0L candidate построил полезную основу (`0..N sites`, source/computed,
null/empty, segment-wise rendering и portable remap), но не замкнул product route.
Если CanvasSkeleton snapshot отсутствует, реальный Save всё ещё выбирает v1
`writeBodge(proj)` и теряет primer pool; тест Save всегда создаёт искусственный snapshot.
Real JS ingress вызывает SnapGene packet converter singleton-вызовами и сбрасывает
`sourceRecordIndex` в `0`; source-form provenance не проходит Python→JS, а site fold
сливает записи только по coordinates/strand. Новые source sites не получают hash
целевого документа, поэтому same-length edit не распознаётся как stale; proof fixtures
подставляют hash вручную. Annotator доводит context до PreviewTab, но PreviewTab не
передаёт template/documentHash конечным map/SequenceView. Overlay также оставляет
unknown strand визуально forward, raw fallback colours и English-only подсказки.

**Риск:** пользователь импортирует праймеры без открытия assembly canvas, сохраняет
проект и теряет их; два source records становятся неразличимы; старая посадка может
выглядеть подтверждённой после редактирования молекулы; Annotator скрывает корректные
sites либо показывает их без достаточного контекста.

**Приёмка:** real import→store→three views→Save/Open включает ветку без Canvas snapshot,
сохраняет packet-wide provenance и полные records; target identity штампуется после
commit и проверяется каждым конечным host; UI различает forward/reverse/unknown и не
содержит локальных raw colours/English-only interaction. Corrected candidate отклонён;
дальнейшая работа требует нового package из `CURRENT_TASK.md`, не второго correction.

### BG-038 — hydrate может стереть только что созданный праймер из памяти

`primerSlice.hydratePrimers()` ждёт `listPrimers()`, затем заменяет `primersById`.
Если `addPrimerToPool` добавил запись между чтением Dexie и этой заменой, свежий primer
исчезает из runtime-map, хотя асинхронная запись уже могла уйти в базу. В браузере primer
остался на карте, а дерево одновременно показывало `Праймеры 0`.

**Риск:** только что созданный праймер пропадает из UI или недоступен следующему действию.
**Приёмка:** hydrate сливает состояние без потери более новых writes либо использует
epoch; interleaving-тест удерживает и загруженную, и добавленную во время await запись.

## P1 — неверное или вводящее в заблуждение состояние

### BG-039 — позиции mismatch показываются то с нуля, то с единицы

Modal переводит внутренние 0-based позиции mismatch в пользовательские 1-based, а
`PrimerSelectionActions.warningText()` выводит те же значения без сдвига.

**Приёмка:** resolver остаётся 0-based, каждый пользовательский formatter делает один
явный `+1`; один fixture показывает одинаковую позицию во всех primer/PCR-поверхностях.

### BG-040 — hairpin warning отображается сырым ключом

`evaluatePrimerWarnings` выдаёт код `hairpin`, но в `i18n.js` нет
`pcr.product.warn.hairpin`; динамический formatter показывает технический ключ.

**Приёмка:** EN/RU-строки существуют и компонентный тест показывает нормальный текст.

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

### BG-017 — terminal annotation может сдвигаться при RC палиндромного overhang

`reverseComplementSegment` учитывает terminal overhang, а `reflectAnnotations` делает обычное отражение. Фича в пределах overhang может разойтись с последовательностью на несколько bp.

**Приёмка:** fixture с terminal feature и palindromic overhang; координаты после RC соответствуют отображаемой последовательности.

### BG-018 — AT-rich low-complexity праймер не получает warning

`local-primer-design.js` ловит ограниченный набор повторов и может пропустить доминирующую AT-rich low complexity.

**Исправление:** предупреждать только когда low-complexity доминирует binding region, чтобы не создать массовые false positives; проверять на транзитивных primer-design путях.

### BG-021 — стартовый экран всегда утверждает, что библиотека пуста

`MainPanel.jsx:275` рендерит `<EmptyCard />` **безусловно**, без проверки на пустоту. Карточка «Сначала наполните библиотеку» висит всегда — в том же окне, где сайдбар показывает «Библиотека · 142». Биолог видит два взаимоисключающих утверждения одновременно.

Следствие тяжелее самой карточки: CTA «Выбрать набор» (`EmptyCard.onAddStarterSet` → `buildStarterSet` → `addLibraryEntriesBulk`) **работает** и пишет в Dexie, но экран не меняется, а тоста нет. Кнопка читается как мёртвая → пользователь жмёт ещё раз. Браузер-проверка: два клика → `library` store вырос на 8 записей (4 вектора × 2), UI не изменился ни разу, консоль чиста, перезагрузка не помогла.

Не регрессия чистки 17.07: `MainPanel.jsx` и `EmptyCard.jsx` побайтно совпадают с checkpoint `7e2576c`, на котором сюита была 7434/0. Дефект пре-существующий — его просто нечем было поймать, так как unit-тесты рендерят `EmptyCard` изолированно.

**Исправление:** гейт на `<EmptyCard />` по тому же источнику счёта, что кормит сайдбар (один знаменатель, не второй счётчик); тост об успехе не глушить; продумать идемпотентность повторного добавления стартового набора (сейчас дубликаты копятся молча).

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

**Риск:** полный прогон может потерять файл и дать неполное доказательство; поэтому один итоговый
счётчик без сверки списка файлов недостаточен. Нагрузочные assertion-timeout принадлежат BG-019,
а не этому дефекту.

**Диагностика и приёмка:** при следующем воспроизведении сохранить stderr, имя потерянного файла,
import/test duration и RSS процесса; сравнить `maxWorkers=4`, `maxWorkers=2` и
`--no-file-parallelism`. Закрывать после устранения установленной причины и трёх последовательных
полных прогонов с точным file inventory без fork-error; произвольные test-timeout не поднимать.


### BG-019 — полный Vitest иногда даёт единичный timeout-fail

Интермиттентный `Test timed out in 5000ms` появляется только под общей CPU-нагрузкой и проходит в изоляции/повторном прогоне.

**Диагностика:** несколько прогонов с verbose/bail/no-file-parallelism, сохранить имя файла и import/test duration. Не объявлять произвольный timeout регрессией без изолированного воспроизведения.

Legacy debt ID: `TD-PRIMER-WIZARD-FLAKE`.

**Наблюдение 21.07.2026 — `dead-canvas-closure.test.js` подошёл к своему пределу.** На полном прогоне U8 файл упал по таймауту (5,7 с против дефолтных 5 с), изолированно — зелёный 2/2, assertion нет. Это не дефект поиска, но и не чистая случайность: его второй `it` читает КАЖДЫЙ `.js`/`.jsx` в `src`, а стоимость растёт вместе с репозиторием. Падение гигиенического теста никогда не означает регрессию продукта.

**Что именно дорого (сверено с кодом, а не предположено).** Обход уже оптимален внутри файла: один `readdirSync`-проход и ровно один `readFileSync` на файл. Ускорять там нечего. Дорого другое — таких тестов ПЯТЬ, и каждый обходит то же дерево целиком в своём воркере: `dead-canvas-closure`, `dead-biological-helpers-removed`, `legacy-library-catalog-removed`, `strings-coverage`, `search-ui-boundary`. Это до ~6,5 тыс. чтений с диска, выполняемых параллельно и конкурирующих между собой и с остальным прогоном. Отсюда и характер симптома: зелено в изоляции, таймаут под нагрузкой.

**Исправление (выбрать одно, не «поднять таймаут и забыть»):** либо свести обходящие дерево проверки в ОДИН файл, где дерево читается однажды и переиспользуется всеми правилами (пять обходов → один), либо вывести этот класс целиком из обычного тяжёлого параллельного прогона в отдельную гигиеническую задачу. Поднятие таймаута — маскировка: оно скроет и настоящую деградацию обхода.
