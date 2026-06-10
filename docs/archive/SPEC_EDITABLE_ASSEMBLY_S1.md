# SPEC — Editable assembled view, спринт 1: ввод по курсору + новый блок

**Тип:** A (спринт 1 из 3 архитектурного wave editable-assembly). **Статус:** готова к выдаче Code — НЕ в текущий батч (Code занят V97–V100); выдаётся после приёмки того батча.
**Wave:** `docs/DESIGN_EDITABLE_ASSEMBLY_VIEW.md`. Спринт 2 — `SPEC_EDITABLE_ASSEMBLY_S2.md`; спринт 3 — `SPEC_EDITABLE_ASSEMBLY_S3.md`.
**Запрос Игоря (22.05.2026):** биолог ставит курсор в собранной последовательности и печатает нуклеотиды — они появляются в сборке как новый блок; ≤ порога — заведомо хвост праймера (`snippet`), > порога — синтез-кусок (`synthesis`); порог настраиваемый. Правка piece, входящего в op-группу → разгруппировка.
Диагноз — чтением `useSequenceKeyboard.js`, `SequenceTab.jsx`, `AssemblyShellBody.jsx`, `piece-model.js`, `skeleton-state-pieces.js`, `piece-invariants.js`, `zone-assembly-write-adapter.js`, `assembly-model.js`.

---

## 0. Размеры затрагиваемых модулей

- `editor/assembly-mode/AssemblyShellBody.jsx` — 22.97 KB (под hard 40). Сюда добавляется `onSequenceEdit`-хендлер + `editable`-флаг.
- `store/skeleton-state-pieces.js` — 15.63 KB (под hard 25).
- `store/skeleton-state-operations.js` — 18.70 KB (под hard 25). Сюда — `DISBAND_OP_GROUP`.
- `lib/zone-assembly-write-adapter.js` — 10.14 KB (под hard 25).
- `lib/piece-model.js` — 9.21 KB; `lib/piece-invariants.js` — 7.41 KB.
- `SequenceView/index.jsx` — 45.97 KB (над hard 40, `TD-SIZE-SEQUENCEVIEW-INDEX`). **Спринт 1 его НЕ редактирует** — editable-механизм там уже есть; декомпозиция не блокер этой спеки.
- Новый файл `lib/assembly-edit-router.js` — чистый роутер «правка в координатах сборки → piece-операция» (новый, ~4–6 KB).

## 1. Контекст

Собранный вид редактора сборки (`AssemblyShellBody`) — `SequenceTab` с `editable={false}`: read-only визуализация конкатенации pieces. Биолог не может дописать нуклеотиды в последовательность — единственный путь добавить ДНК сейчас это пикер источника / модалка. Рутинная задача «добавить 3 нт линкера на стык» требует возни.

Editable-механизм ввода **уже существует** и проверен: `useSequenceKeyboard` при `editable===true && typeof onSequenceEdit==='function'` перехватывает IUPAC-символ / Backspace / Delete и эмитит `onSequenceEdit({kind:'insert'|'delete'|'replace', …})` (DEC-MX6-02; `LibrarySingleInspector` так правит библиотечные записи). `SequenceTab` пробрасывает `editable` + `onSequenceEdit` в `SequenceView` насквозь. **Спринт 1 не строит текстовый редактор — он включает флаг в собранном виде и пишет хендлер, переводящий правку в координатах сборки в piece-операции.**

## 2. Где задача сядет (связи)

Точка — `AssemblyShellBody.jsx`: `<SequenceTab editable={false} …>`. Меняется флаг + добавляется `onSequenceEdit`. Собранная последовательность = `computeAssemblySequence(draft).sequence`; границы pieces = `segmentBoundaries(draft).boundaries` (`startOnAssembly`/`endOnAssembly` каждого piece). Правка адресуется по этим границам.

Затрагивает: `piecesReducer` (`skeleton-state-pieces.js`) — создание/правка inline-pieces идёт через существующие `INSERT_SNIPPET`/`UPDATE_PIECE` (маршрутизируются `zone-assembly-write-adapter`); op-группы (`skeleton-state-operations.js`) — новый `DISBAND_OP_GROUP`. Ссылается на: `SegmentList` рендерит новый блок сам (`draftFromZone` уже знает `snippet`/`synthesis`, `pieceKind` для иконки) — **`SegmentList` не трогаем**. Может сломаться: коллизия с `useSelectionEdit` (его Del удаляет аннотацию при точном покрытии региона) — в собранном editable-виде Del должен быть правкой последовательности, не аннотации (см. §5.6).

**Важное межспековое:** `SPEC_ASSEMBLY_CUSTOM_SEGMENT` §4 п.6 помечает `INSERT_SNIPPET`/`INSERT_SYNTHESIS` + kind'ы `snippet`/`synthesis` как кандидатов на dead-code-sweep. **Этот спринт их воскрешает** — editable-view создаёт snippet/synthesis pieces печатью. DEAD-sweep custom-segment'а НЕ должен удалять `INSERT_SNIPPET`/`INSERT_SYNTHESIS`/kind'ы `snippet`/`synthesis`. Зафиксировать при финализации custom-segment'а.

## 3. Стратегия

Собранный вид становится editable, когда зона не read-only и не frozen. Печать символа / Delete / Backspace эмитит `onSequenceEdit`-op в координатах сборки. Новый чистый роутер `assembly-edit-router.js` резолвит op по `boundaries` и решает, какая это правка:

- **Ввод внутри inline-piece** (`gap`/`snippet`/`synthesis` — у них есть своя `sequence`/`gapSequence`): правится строка piece через `UPDATE_PIECE`. Покрывает и «дописывать в уже созданный блок».
- **Ввод на стыке** двух pieces (или на краю сборки): создаётся новый `snippet`-блок на этой позиции (`INSERT_SNIPPET`, одиночный символ). Следующий символ каретка ставит уже внутри нового блока → попадает в ветку «внутри inline-piece» → блок наращивается. Так печать `ATG` даёт ОДИН блок «ATG», не три.
- **Снаппинг kind по длине:** когда длина snippet-блока переваливает порог (настройка, дефолт 80) — `kind` блока перещёлкивается `snippet→synthesis`; при сжатии обратно — `synthesis→snippet`.
- **Ввод внутри `sourced`-piece, удаление/замена, задевающие `sourced`-piece или пересекающие границу** — деление куска: вне спринта 1 (спринт 2). В спринте 1 — no-op + info-тост.
- **Правка piece с `groupId`** — перед применением op-группа этого piece расформировывается (`DISBAND_OP_GROUP`, тост-предупреждение), затем правка применяется.

## 4. Scope

**IN (спринт 1):**
- `editable` собранного вида + `onSequenceEdit`-хендлер.
- Ввод на стыке pieces / на краю сборки → новый snippet/synthesis-блок.
- Ввод/Backspace/Delete/replace целиком ВНУТРИ inline-piece (gap/snippet/synthesis) → правка его `sequence`.
- Снаппинг `snippet↔synthesis` по настраиваемому порогу.
- `DISBAND_OP_GROUP` + разгруппировка при правке сгруппированного piece.
- Каретка после правки (insert → +1; delete → на место).
- undo/redo: серия печати коалесцируется в одну запись (см. §5.7).

**OUT (спринт 2 и далее):**
- Ввод внутрь `sourced`-piece (деление куска), `SPLIT_PIECE`.
- Удаление/замена, задевающие `sourced`-piece или пересекающие границу pieces.
- Замена-substitution → `mutations[]`.
- Перезапуск авто-дизайна праймеров (спринт 3, после консолидации калькулятора).
- Визуальная стилизация синтетического блока (пунктир и т.п.) — отдельный polish, не блокер.

## 5. Архитектурные решения

1. **`editable` собранного вида — gated.** `AssemblyShellBody` передаёт `editable` в `SequenceTab` истинным, когда зона редактируема: НЕ `isReadOnlyZone`, и ни один piece сборки не `frozen` (frozen piece поглощён исполненной реакцией — правка запрещена, Q6 wave-дока). Если есть frozen piece — `editable=false`, info-баннер «сборка заморожена исполнённой реакцией». orphan-piece (`source.unavailable`) присутствует → тоже `editable=false` до починки.
2. **Роутер — отдельный чистый модуль.** Новый `lib/assembly-edit-router.js`, экспорт `routeAssemblyEdit(op, draft, boundaries, opts) → {action} | {action[]} | {noop, reason}`. Чистая функция: вход — `onSequenceEdit`-op + draft + boundaries + порог; выход — описание piece-операций (или no-op с причиной). Без диспатча, без стора. Хендлер в `AssemblyShellBody` диспатчит результат.
3. **Резолв позиции.** Для `insert {pos}`: piece X с `startOnAssembly < pos < endOnAssembly` → внутренняя правка X; иначе `pos` на стыке/краю → новый блок. Для `delete/replace [start,end)`: целиком внутри одного inline-piece (`start ≥ X.startOnAssembly && end ≤ X.endOnAssembly`, X inline) → правка X; иначе → no-op (S2).
4. **Внутренняя правка inline-piece.** Локальный офсет = `pos − X.startOnAssembly`. Новая строка = splice по офсету. Диспатч `UPDATE_PIECE {pieceId:X.id, changes:{sequence: nextSeq}}` (для `gap` — `gapSequence` + `gapLength`, `gapHint:'known'`). После правки, если `X.kind==='snippet'` и `nextSeq.length > порог` → доп. `UPDATE_PIECE {changes:{kind:'synthesis'}}`; если `synthesis` и `≤ порог` → `snippet`. `piece-invariants.validateShape` обе смены принимает (оба ∈ INLINE_KINDS). Пустой результат правки (`sequence===''`) inline-piece → `REMOVE_PIECE` (блок исчезает).
5. **Новый блок на стыке.** `INSERT_SNIPPET` (через `zone-assembly-write-adapter`) с `sequence:<символ>`, `insertAtIndex` = индекс стыка по `boundaries`, `embedsInPrimer:true`. Имя блока — авто («вставка N нт», обновляется при росте). Сразу после создания длина 1 ≤ порога → всегда `snippet`; перерастание в `synthesis` — через п.4 при следующих символах.
6. **`DISBAND_OP_GROUP`.** Новый thin-action в `skeleton-state-operations.js` (+ зеркальная очистка `groupId` в `piecesReducer`, паттерн `disbandOrphanGroup`). Поведение, 3 пункта: (а) все pieces с `groupId===G` → `groupId:null, groupLayer:0`; (б) op-группа G (operation `isOpGroup`) удаляется; (в) её layer-1+ зависимости (если ссылались на G как intermediate) — осиротевшие пере-метятся как ungrouped (без каскадного сноса). Хендлер `AssemblyShellBody`: если правимый piece имеет `groupId` — сперва `DISBAND_OP_GROUP`, тост «Фрагмент был в группе реакций — группа расформирована, пере-соберите», затем правка.
7. **Коллизия Del.** В собранном editable-виде `onSequenceEdit` Delete (правка последовательности) имеет приоритет; `useSelectionEdit` Del (удаление аннотации) в собранном виде не нужен — аннотации сборки производные. `AssemblyShellBody` не передаёт `onAnnotationEdit` в editable-режиме (или передаёт no-op). Зафиксировать тестом: Delete в editable собранном виде правит последовательность, не аннотацию.
8. **Каретка.** `useSequenceKeyboard` сам не двигает каретку при edit-op (комментарий «caret update is the caller's responsibility»). Хендлер после диспатча: insert → каретка `pos+1`; delete/backspace → `pos` (на место); replace → `start+replacement.length`. Через `sel.setCaretPos`/`setCaretAnchor` (`useSequenceSelection`).
9. **Порог — настройка.** Константа `SYNTHESIS_THRESHOLD_DEFAULT = 80` + override из стора настроек (там же, где prefix/polymerase — `SettingsModal`). Имя ключа — `synthesisLengthThreshold`. UI настройки — одно числовое поле; если инфраструктура настройки тяжелее одного поля, спринт 1 шипит константу + ключ в сторе, поле — хвостом. Биология обоснования: стандартные олиго ~60–100 нт, ультрамеры ~200 → дефолт 80, разумный диапазон 40–200.

## 6. Файлы / сигнатуры

**`lib/assembly-edit-router.js`** (новый) — `routeAssemblyEdit(op, draft, boundaries, { threshold }) → result`. Чистая. `result` — один из: `{ kind:'update-inline', pieceId, sequence, kindFlip? }`, `{ kind:'new-block', insertAtIndex, char }`, `{ kind:'noop', reason }`. Логика — §5.3–5.5. Юнит-тест на каждую ветку.

**`AssemblyShellBody.jsx`** — (а) `editable` для `SequenceTab` вычисляется по §5.1; (б) хендлер `onSequenceEdit(op)`: резолв `boundaries` уже есть в компоненте → `routeAssemblyEdit` → если у целевого piece `groupId` диспатч `disbandOpGroup` + тост → диспатч piece-операции(й) → обновление каретки (§5.8). info-тост на `{kind:'noop'}`.

**`skeleton-state-operations.js`** — `DISBAND_OP_GROUP` в action-set + reducer-ветка (§5.6 а/б/в).

**`skeleton-state-pieces.js`** — зеркальная обработка `DISBAND_OP_GROUP` (очистка `groupId`/`groupLayer` у членов), как cross-domain prelude (паттерн `REMOVE_CONTAINER`).

**`zone-assembly-write-adapter.js`** — без новых action'ов; `INSERT_SNIPPET`/`UPDATE_SEGMENT`-пути уже есть. Проверить, что `UPDATE_PIECE` со сменой `kind` snippet↔synthesis проходит маршрутизацию (вероятно идёт напрямую через `piecesReducer`, не через адаптер — хендлер диспатчит `UPDATE_PIECE` напрямую).

**Тесты:** юниты роутера (insert-на-стыке, insert-внутри-snippet, delete-внутри-inline, snippet→synthesis флип, noop на sourced-interior); интеграция (печать `ATG` на стыке → один snippet-блок «ATG»; печать 90 символов → блок стал `synthesis`; Backspace внутри блока; Delete пустого блока → `REMOVE_PIECE`; правка сгруппированного piece → группа расформирована + тост); регрессия (`editable=false` сборка с frozen-piece; Library/Importer SequenceTab без `onSequenceEdit` не задеты).

## 7. Порядок выполнения

1. `assembly-edit-router.js` + юнит-тесты роутера (red→green).
2. `DISBAND_OP_GROUP` в `skeleton-state-operations.js` + `skeleton-state-pieces.js` + тесты.
3. `AssemblyShellBody.jsx` — `editable`-gate + `onSequenceEdit`-хендлер + проводка тоста/каретки.
4. Настройка порога (`synthesisLengthThreshold`, дефолт 80).
5. Интеграционные тесты + регрессия.
6. Полный Vitest + `vite build`.

## 8. STOP-условие и формат отчёта

После реализации §3 IN-scope и зелёного полного Vitest + `vite build` clean — STOP. Отчёт в `CURRENT_TASK.md`: commit range; Vitest counters (pass/skip/fail); `vite build`; spec deviations; size budget (`AssemblyShellBody.jsx`, `skeleton-state-operations.js`). Визуальная приёмка — отдельная Chat-сессия. НЕ финализировать `PROJECT_STATE`/`BUGS`/`DECISIONS`/`RELEASES`/`ANCHORS`/`TECH_DEBT`/`CLAUDE.md`/`COMPONENT_MAP`.

## 9. Риски

- **Каскад снаппинга kind.** Частая печать у порога может дать дрожание snippet↔synthesis. Митигация: флип только при фактическом пересечении порога (строгое `>` / `≤`), не на каждый символ; гистерезис не нужен — порог дискретный.
- **`INSERT_SNIPPET` dead-code-sweep.** custom-segment §4 п.6 может снести нужные action'ы. Митигация: §2 фиксирует — sweep не трогает snippet/synthesis.
- **Каретка рассинхрон.** `useSequenceKeyboard` каретку не двигает; забыть §5.8 = курсор отстаёт. Митигация: §5.8 явный, тест на позицию каретки после insert/delete.
- **`DISBAND_OP_GROUP` layer-1 сироты.** Расформирование layer-0 группы, на которую ссылалась layer-1 — §5.6(в) пере-метит сирот ungrouped, без каскада. Тест на двухслойную группу.
- **Frozen-gate ложно блокирует.** Если хоть один frozen piece выключает editable всей сборки — может раздражать. Принято осознанно (Q6): frozen = исполненная реакция, правка действительно небезопасна; биолог сбрасывает реакцию (`OP_RESET`).

## 10. Открытые вопросы

1. UI настройки порога — отдельное числовое поле в `SettingsModal` сразу, или константа + ключ в сторе, поле хвостом. Low-stakes, на усмотрение Code по факту веса инфраструктуры.
2. Имя авто-блока («вставка N нт») — финальная формулировка строки. Low-stakes.
