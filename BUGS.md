# BodgeGene — подтверждённые дефекты

Только живые воспроизводимые дефекты. Новые возможности и архитектурные планы находятся в [`docs/BACKLOG.md`](docs/BACKLOG.md). Закрытая история сохраняется Git и checkpoint-копией, но не расходует стартовый контекст.

## P0/P1 — биологическая корректность и потеря данных

### BG-001 — public `.bodge` export не является allowlist-first

`bodge-export-profiles.js` описывает `public-supp`, но живой writer в `bodge-zip.js` в основном очищает `manifest.deviceId`. Runtime attachment/blob maps и private support data могут быть подмешаны обратно.

**Риск:** утечка notebook, local refs, source/evidence bytes или extension snapshot.
**Исправление:** closure от выбранного product, render только из filtered snapshot, post-write recursive leak scan. Контракт — `docs/specs/SPEC_BODGE_FORMAT_V2_CORE.md` и `docs/specs/BODGE_V2_IMPLEMENTATION_PLAN.md`.

### BG-002 — skeleton extension перекрывает canonical `.bodge` state

`skeleton-bodge-bridge.js` сохраняет полный snapshot и при чтении предпочитает его structured sections.

**Риск:** изменённый или отфильтрованный canonical container/assembly может быть заменён старой копией.
**Исправление:** биология только из canonical DTO; extension содержит только optional UI/layout и не имеет override path.

### BG-003 — Start Screen/Sidebar открывает `.bodge` без assembly state

`open-bodge.js` получает полный parsed-файл, но возвращает только `project`, `libraryEntries` и `warnings`. Этот helper вызывают Sidebar и MainPanel; путь Ctrl+O использует другой, уже исправленный loader.

**Риск:** пользователь открывает валидный проект и теряет состояние сборки.
**Приёмка:** все входные пути используют один loader и round-trip fixture сохраняет assembly state.

### BG-004 — визуально отредактированный праймер сохраняется без правок

`SequenceView/index.jsx` передаёт из модального окна `name`, `sequence`, `tail`, `binding`, а `PcrModeShell.jsx` принимает только `direction/start/end` и строит праймер заново по диапазону.

**Риск:** заказанный праймер не соответствует тому, что подтвердил пользователь.
**Приёмка:** изменения имени/binding/tail проходят в канонический PrimerPool; интеграционный тест проверяет итоговую запись.

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

## P1 — неверное или вводящее в заблуждение состояние

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

## P2 — тестовая инфраструктура

### BG-019 — полный Vitest иногда даёт единичный timeout-fail

Интермиттентный `Test timed out in 5000ms` появляется только под общей CPU-нагрузкой и проходит в изоляции/повторном прогоне.

**Диагностика:** несколько прогонов с verbose/bail/no-file-parallelism, сохранить имя файла и import/test duration. Не объявлять произвольный timeout регрессией без изолированного воспроизведения.

### BG-020 — порог DNA-поиска не учитывает gaps единообразно

`seq-match.js` направляет запросы до 30 нт, IUPAC и circular targets в фиксированный Hamming-скан `sequence-search-bio.js`. Этот путь игнорирует `identityThreshold`, использует отдельный `maxMismatches` и всегда возвращает `indels: 0`. Поэтому один inserted/deleted nucleotide уничтожает 20-nt hit, который при парном выравнивании имеет около 95% identity.

Старый long-query `sequence-search.js` тоже не является полным решением: gap-эвристика зависит от exact seed и в подтверждённом target-insertion case способна вернуть `identity: 1` вместе с отрицательным `mismatches`.

**Риск:** ложное «совпадений нет» и завышенная уверенность в найденном участке; одинаковые query/threshold дают разные ответы в глобальном поиске и SequenceSearchPopover.

**Исправление и приёмка:** [`SPEC_GAPPED_DNA_SEARCH.md`](docs/specs/SPEC_GAPPED_DNA_SEARCH.md). Весь query выравнивается glocal; `identity = exactMatches / alignmentColumns`; substitutions, query-only и target-only bases входят в denominator; 20/21 проходит при 80%, 4/20 substitutions проходят, 5/20 — нет.
