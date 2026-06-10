# SPEC — Editable assembled view, спринт 2: split куска, удаление, замена→мутации

**Тип:** A (спринт 2 из 3 архитектурного wave editable-assembly). **Статус:** готова к выдаче Code — после спринта 1 (`SPEC_EDITABLE_ASSEMBLY_S1.md`); расширяет роутер и pieces-слой спринта 1.
**Wave:** `docs/DESIGN_EDITABLE_ASSEMBLY_VIEW.md`. Закрывает то, что спринт 1 отложил: ввод внутрь `sourced`-piece, удаление, замену.
**Запрос Игоря (22.05.2026):** «выделил участок, Delete → сборка делится на две части, части сохраняют родителей»; «замена = выделение + ввод»; согласовано — замена той же длины внутри куска → `mutations[]` (мутагенный праймер, без split), вставка/удаление со сдвигом длины → split + блок.
Диагноз — чтением `piece-model.js`, `skeleton-state-pieces.js`, `piece-invariants.js`, `assembly-model.js` (`splitSegment` — референс rc-aware математики), `zone-pieces-to-dag.js` (`draftFromZone`), `primer-derive.js` (`pieceSequence` — применение мутаций) + роутер `assembly-edit-router.js` спринта 1.

---

## 0. Размеры затрагиваемых модулей

- `store/skeleton-state-pieces.js` — 15.63 KB (под hard 25). Сюда — `SPLIT_PIECE`.
- `lib/assembly-edit-router.js` — новый в спринте 1 (~4–6 KB). Спринт 2 расширяет ветки `sourced`-interior / spanning. Если перевалит soft 20 KB — выделить под-функции (Code решает по факту).
- `lib/zone-pieces-to-dag.js` — 12.07 KB (под hard 25). `draftFromZone` — применение `mutations` к sourced-сегменту.
- `lib/piece-model.js` — 9.21 KB; `lib/piece-invariants.js` — 7.41 KB.
- `lib/assembly-model.js` — 8.34 KB. `splitSegment` — **референс математики, не редактируется.**
- `editor/assembly-mode/AssemblyShellBody.jsx` — 22.97 KB (под hard 40).
- Новый `lib/piece-mutations.js` — общий `applyPieceMutations` (~1 KB).

## 1. Контекст

Спринт 1 включил editable собранного вида и роутер `assembly-edit-router.js`, который сейчас обрабатывает только правку на стыке pieces и внутри inline-кусков (`gap`/`snippet`/`synthesis`). Всё, что задевает `sourced`-piece (печать в середину, удаление, замена), спринт 1 отбивает no-op'ом + тостом. Спринт 2 закрывает это.

`sourced`-piece — указатель в исходный контейнер (`sourceIds`+`ranges`, последовательность выводится срезом). Чтобы вставить/удалить/изменить внутри него, кусок надо делить. Операции `SPLIT_PIECE` нет — `piecesReducer` её не имеет. `assembly-model.splitSegment` несёт готовую rc-aware математику пересчёта sub-range, но работает на legacy-draft'е, не на piece. `mutations[]` + `ADD_PIECE_MUTATION` уже есть — точечная замена моделируется записью мутации; `primer-derive.pieceSequence` уже применяет мутации при дизайне праймера. Но `draftFromZone` мутации к отображаемой последовательности НЕ применяет — собранный вид показал бы WT-основание вместо изменённого.

## 2. Где задача сядет (связи)

Главный новый примитив — `SPLIT_PIECE` в `piecesReducer`. Оркестрация — расширение `routeAssemblyEdit` (`assembly-edit-router.js`): ветки «внутрь sourced», «пересекает границы». Хендлер `onSequenceEdit` в `AssemblyShellBody` диспатчит новые результаты роутера. `draftFromZone` — применяет `mutations` к sourced-сегменту, чтобы собранный вид показывал изменённое основание. Общий хелпер `applyPieceMutations` извлекается из `primer-derive.pieceSequence` (DRY — его же позже зовёт единый калькулятор).

Ссылается на: `SegmentList`/`coloredZones` пере-выводятся из pieces сами — split/удаление меняют число блоков, доп. UI-кода не нужно. Может сломаться: тесты, опирающиеся на текущее «`draftFromZone` даёт WT-последовательность» (V83/V84 — но они про gap/sourced annotations, мутации ортогональны; проверить).

## 3. Стратегия

Роутер спринта 1 расширяется: что было `{kind:'noop'}`, теперь резолвится.

- **Вставка внутрь `sourced`-piece** (`insert` strictly inside) → `SPLIT_PIECE` куска по локальному офсету + `INSERT_SNIPPET` нового блока между половинами. Половины — два `sourced`-piece, сохраняют `sourceIds`/`origin`, rc-aware sub-range.
- **Замена внутри одного `sourced`-piece, длина замены == длине выделения** → substitution: на каждую отличающуюся позицию — `ADD_PIECE_MUTATION` (локальная позиция, `fromBase`/`toBase`). Без split, без блока.
- **Удаление внутри одного `sourced`-piece:**
  - у края куска → `UPDATE_PIECE` с суженным `ranges` (trim).
  - в середине → `SPLIT_PIECE` по началу удаления, затем `UPDATE_PIECE` правой половины — сдвиг `range.start` на длину удаления.
- **Удаление/замена, пересекающие границы pieces** → по каждому задетому piece: краевой `sourced` — trim (`UPDATE_PIECE` range), краевой inline — splice `sequence`, полностью покрытый — `REMOVE_PIECE`. Замена (длина ≠ длине выделения, либо span) = удаление-span + `INSERT_SNIPPET` строки-замены новым блоком на образовавшемся стыке (модель Игоря «замена = Delete + печать»).
- **`draftFromZone` применяет `mutations`** к sourced-сегменту через общий `applyPieceMutations` — собранный вид показывает изменённое основание.
- **Разгруппировка** (Fork B): split / удаление / мутация piece с `groupId` → сперва `DISBAND_OP_GROUP` (примитив спринта 1) + тост, затем правка.

## 4. Scope

**IN (спринт 2):**
- `SPLIT_PIECE` — реакторный примитив (`sourced` single-range piece → две половины, rc-aware, сохранение родителей).
- Расширение `routeAssemblyEdit`: ветки sourced-interior insert / substitution / delete-trim / delete-mid / spanning delete+replace.
- `applyPieceMutations` — общий хелпер; `draftFromZone` применяет мутации к sourced-сегменту.
- Замена той же длины внутри куска → `mutations[]`.
- Разгруппировка при split/удалении сгруппированного piece.

**OUT:**
- Перезапуск авто-дизайна праймеров — спринт 3 (после консолидации калькулятора). Мутации в спринте 2 пишутся в `mutations[]`; их подхват праймером — через существующий `deriveAutoPrimers` до спринта 3, через единый калькулятор после.
- Multi-range `sourced`-piece split — `SPLIT_PIECE` спринта 2 работает на single-range piece (собранный вид такие и создаёт); multi-range → no-op + тост.
- `frozen`/orphan piece — собранный вид при них не editable (gate спринта 1 §5.1).

## 5. Архитектурные решения

1. **`SPLIT_PIECE {pieceId, atOffset}`** — новый action `piecesReducer`. Делит `sourced` single-range piece по локальному офсету `atOffset` (1 ≤ atOffset ≤ len−1) на две `sourced`-piece. Математика — копия `assembly-model.splitSegment` (rc-aware): `range = ranges[0]`; forward → left `[start, start+atOffset]`, right `[start+atOffset, end]`; reverse → left `[end−atOffset, end]`, right `[start, end−atOffset]`. Обе половины: свежий `id`, `kind:'sourced'`, тот же `sourceIds`, `origin` копируется (сохранение родителей, Q3 wave-дока), `color` наследует родительский, `mutations` распределяются по половинам (мутация с локальной позицией < atOffset → левая, ≥ atOffset → правая, со сдвигом позиции для reverse). Зональный порядок: половины занимают слот исходного piece, левая раньше правой (через `createdAt`-конвенцию `orderedZonePieceIds` — левая наследует `createdAt` исходного, правая `+1`). Не single-range / не sourced → state без изменений (роутер до этого даёт тост). Валидируется `piece-invariants` как обычные sourced-piece.
2. **Substitution → `mutations[]`.** Роутер для `replace` целиком внутри одного `sourced`-piece с `replacement.length === (end−start)`: на каждую позицию i, где `replacement[i] !== currentBase[i]`, эмитит `ADD_PIECE_MUTATION {pieceId, mutation:{position: localPos, fromBase, toBase, kind:'silent', notes:'editable-view'}}`. `localPos` — офсет внутри range куска (0-based). `currentBase` берётся из последовательности куска С УЖЕ применёнными прежними мутациями. `ADD_PIECE_MUTATION` идемпотентен по позиции (перезапись) — повторная правка той же позиции корректна.
3. **`applyPieceMutations(seq, mutations) → seq`** — новый чистый хелпер `lib/piece-mutations.js`. Логика — извлечь из `primer-derive.pieceSequence` (`arr[m.position]=m.toBase` для валидных позиций). `primer-derive` переключается на этот хелпер (DRY); `draftFromZone` sourced-ветка применяет его к `seq` после rc. Единый калькулятор (отдельная спека) тоже будет звать его.
4. **`draftFromZone` мутации.** Sourced-ветка: после `seq = rc ? RC(raw) : raw` → `seq = applyPieceMutations(seq, p.mutations)`. Координаты мутаций — локальные офсеты в последовательности куска (после rc), как ждёт `applyPieceMutations`. `computeAssemblySequence` тогда конкатенирует уже изменённую последовательность.
5. **Удаление-trim.** Краевое удаление в `sourced`-piece → `UPDATE_PIECE {ranges:[сужённый]}`. `piecesReducer.UPDATE_PIECE` при смене `ranges` без `sourceIds` пересчитывает `sourceIds` сам (§5.4 reducer'а) — отдельной заботы нет. Сужение rc-aware: при `reverse` край «слева в собранном виде» = `range.end`, «справа» = `range.start`.
6. **Удаление в середине sourced-piece.** Роутер: `SPLIT_PIECE` по `pos` начала удаления → `[left][right]`; затем `UPDATE_PIECE` правой — `range` сдвигается на длину удаления (forward: `start += length`; reverse: `end -= length`). Два диспатча; правая половина id известен из state после `SPLIT_PIECE` (хендлер берёт последний созданный, паттерн `createPieceInZone`).
7. **Spanning удаление/замена.** Роутер строит план по `boundaries`: список `{pieceId, action:'trim-left'|'trim-right'|'remove'|'splice'}`. Краевые sourced → trim, краевые inline → splice `sequence`, средние → `remove`. Для `replace` со span либо разной длиной — план = удаление-span + один `INSERT_SNIPPET(replacement)` на стыке после удаления. Хендлер применяет план последовательно; индексы пересчитываются от свежего state между диспатчами (паттерн `stateRef`).
8. **Разгруппировка.** Перед любым `SPLIT_PIECE`/`UPDATE_PIECE`/`ADD_PIECE_MUTATION`/`REMOVE_PIECE` по piece с `groupId` — `DISBAND_OP_GROUP` (примитив спринта 1) + тост. При spanning-правке расформировываются группы всех задетых сгруппированных pieces.
9. **Каретка.** Как в спринте 1 §5.8: insert/split-insert → каретка за вставкой; удаление → на начало удаления; substitution → на конец выделения; замена-span → за вставленным блоком.

## 6. Файлы / сигнатуры

**`skeleton-state-pieces.js`** — `SPLIT_PIECE` в `PIECE_ACTIONS` + reducer-ветка (§5.1). Возвращает state без изменений на невалидном входе.

**`lib/piece-mutations.js`** (новый) — `applyPieceMutations(seq, mutations) → string`. Чистая.

**`lib/assembly-edit-router.js`** — расширить `routeAssemblyEdit`: ветки `insert` внутрь sourced → `{kind:'split-insert', pieceId, atOffset, char}`; `replace` равной длины в одном sourced → `{kind:'mutate', pieceId, mutations:[…]}`; `delete` в sourced (край/середина) → `{kind:'trim'|'split-delete', …}`; spanning → `{kind:'plan', steps:[…]}`. Юнит-тесты на каждую ветку.

**`zone-pieces-to-dag.js`** — `draftFromZone` sourced-ветка: `applyPieceMutations` после rc (§5.4).

**`primer-derive.js`** — `pieceSequence` переключается на общий `applyPieceMutations` (поведение байт-идентично, рефактор-DRY).

**`AssemblyShellBody.jsx`** — `onSequenceEdit`-хендлер обрабатывает новые виды результата роутера (`split-insert`/`mutate`/`trim`/`split-delete`/`plan`): диспатч-последовательности + разгруппировка + каретка.

**Тесты:** юниты `SPLIT_PIECE` (forward / reverse / границы atOffset / сохранение sourceIds+origin / распределение mutations); юниты `applyPieceMutations`; юниты роутера (split-insert, substitution-diff, trim край, delete середина, spanning-план); интеграция (печать в середину sourced → 3 блока, родители сохранены; выделение+Delete через границу → края подрезаны, средние удалены; замена 3 нт той же длины → 3 мутации, собранный вид показывает новые основания; `draftFromZone` с мутациями); регрессия (V83/V84 sourced/gap — зелёные; `deriveAutoPrimers` с мутациями через новый хелпер — зелёный).

## 7. Порядок выполнения

1. `lib/piece-mutations.js` `applyPieceMutations` + юнит-тест; переключить `primer-derive.pieceSequence` (рефактор, тесты зелёные).
2. `SPLIT_PIECE` в `skeleton-state-pieces.js` + юнит-тесты.
3. `draftFromZone` — применение мутаций + тест.
4. `routeAssemblyEdit` — расширение веток + юнит-тесты роутера.
5. `AssemblyShellBody` — обработка новых результатов роутера.
6. Интеграционные тесты + регрессия.
7. Полный Vitest + `vite build`.

## 8. STOP-условие и формат отчёта

После реализации §3 IN-scope и зелёного полного Vitest + `vite build` clean — STOP. Отчёт в `CURRENT_TASK.md`: commit range; Vitest counters; `vite build`; spec deviations; size budget (`skeleton-state-pieces.js`, `assembly-edit-router.js`, `zone-pieces-to-dag.js`). Визуальная приёмка — отдельная Chat-сессия. Координационные файлы не финализировать.

## 9. Риски

- **rc-aware математика split.** Зеркальный пересчёт range при `reverse` — источник ошибок. Митигация: копия проверенной `splitSegment`-логики; юнит-тесты forward И reverse с явными координатами.
- **Распределение `mutations` при split.** Мутация на границе atOffset, сдвиг позиций для reverse-половины. Митигация: явный тест split куска с мутациями по обе стороны разреза.
- **`applyPieceMutations` рефактор `primer-derive`.** Должен быть байт-идентичен. Митигация: существующие тесты `deriveAutoPrimers` с мутациями зелёные после рефактора — регрессия.
- **Spanning-план и пересчёт индексов.** Последовательные диспатчи сдвигают `boundaries`. Митигация: план строится один раз ДО диспатчей в исходных координатах сборки, шаги адресуют pieces по `id` (не по индексу); удаление/trim по id устойчивы к сдвигу.
- **`draftFromZone` мутации ломают V83/V84.** Митигация: мутации ортогональны gap/annotation-логике; регрессия V83/V84 в чеклисте.

## 10. Открытые вопросы

1. Цвет половин после `SPLIT_PIECE` — наследовать родительский (спека: да) или давать различимые. Low-stakes, дефолт «родительский», биолог перекрашивает.
2. `mutation.kind` для editable-view substitution — спека ставит `'silent'` заглушкой; авто-классификация silent/missense (по рамке CDS) — отдельная задача, не в этом спринте.
