# SPEC — V101: вставленный сегмент не приземляется в сборку

**Тип:** C (диагностика + hardening). **Запрос Игоря (22.05.2026, живой тест):** вставил свой сиквенс (5941 bp) в paste-секцию пикера сборки — после вставки «бросает в выборщик» (сборка читается пустой), а если выйти на канвас и вернуться в сборку — фрагмент не сохранён.

**ВАЖНО — статус диагностики (читать первым):** детерминированный путь вставки прослежен Chat'ом по 20 файлам (zone-путь и legacy-путь). Путь **статически чист** — сегмент создаётся, зонируется, персистится, читается обратно. Баг в чистом редьюсер-пути не воспроизводится. Значит корень **динамический** (runtime / re-render / session-state) либо в слое, который статикой не виден. Поэтому спека НЕ содержит «правило замены» вслепую — её §3 это **воспроизведение + инструментация**, §2 — реальные смежные дефекты, найденные по дороге (чинятся независимо).

---

## 0. Размеры затрагиваемых модулей

- `editor/assembly-mode/AssemblyShellBody.jsx` — 23.5 KB (под hard 40).
- `lib/zone-assembly-write-adapter.js` — ~10 KB (.js, под soft 20).
- `store/skeleton-state-assembly.js` — 15.08 KB (под hard 25).
- `lib/zone-pieces-to-dag.js` — ~12 KB.
- `lib/piece-invariants.js` — ~6 KB.
Декомпозиция не требуется. Инструментация и hardening — точечные правки.

## 1. Что ПРОВЕРЕНО ЧИСТЫМ — не перечитывать

Chat прошёл это в сессии 22.05; Code не тратит время на повторную трассировку:

- **Zone-путь создания пирса.** `onPasteSequence` (`AssemblyShellBody`) → `insertManualSegment(draftId,{sequence},atIndex)` → `INSERT_MANUAL_SEGMENT` → `routeAssemblyWriteToZone` → (draftId — зона) → `createPieceInZone` → `CREATE_PIECE`. `validateShape` (`piece-invariants.js`) **принимает** gap-пирс: `origin:'manual-gap'` ∈ `ORIGIN_ENUM`; `gapLength` 5941 ≤ `GAP_MAX_LENGTH` 10000; `gapSequence.length === gapLength`. Пирс создаётся, `SET_PIECE_ZONE` ставит `zoneId`.
- **Legacy-путь.** draftId — legacy `assemblyDrafts` id → `assemblyReducer` `INSERT_MANUAL_SEGMENT` → `commitDraft` → `addSegment`. `validateDraft` (`assembly-invariants.js`) **принимает** 5941bp manual-сегмент (length-cap'ы — `totalLengthHard` 500 000, `segmentsHard` 200 — не задеты; `validateGapSequence` пропускает ACGTN).
- **Резолв таргета консистентен.** `selectAssemblyTarget` (zone-first, затем legacy) и `routeAssemblyWriteToZone` проверяют `state.zones` по одному и тому же id → запись и чтение идут в одну модель. `draftFromZone` включает `kind:'gap'` пирсы как сегменты (фильтр `p.zoneId === zone.id`).
- **Персистентность.** `TRANSIENT_UI_FIELDS` (`skeleton-persistence.js`) = `view / highlightedContainerId / toast / toasts / selectedContainerIds`. `pieces` / `zones` / `assemblyDrafts` / `editorContext` **персистятся**. Canvas↔assembly — один `SkeletonProvider`, state живёт в редьюсере, round-trip его не теряет; `loadSnapshot`/`REPLACE_STATE` срабатывает только на смену `currentProjectId`.
- **Финализаторы безвредны для gap-пирса.** `applyAutoReactions` — no-op для gap. `applyZoneLayouts` — для зоны `viewMode:'sequence'` (а сборка именно такая) возвращает state без изменений. `zonesReducer` не делает геометрического выселения — `piece.zoneId` меняется только явными экшенами.

**Вывод:** symptom A («бросает в выборщик» = `draft.segments.length === 0` после вставки) и symptom B («не сохраняется после round-trip») в детерминированном пути не воспроизводятся. Корень — вне статически прослеживаемого редьюсер-пути.

## 2. Реальные дефекты, найденные по дороге — hardening

Это НЕ обязательно корень V101, но это настоящие дефекты тихого отказа. Чинятся независимо — после них любой будущий сбой вставки виден, а не молчит.

**D1 — `commitDraft` тихий no-op.** `skeleton-state-assembly.js::commitDraft`: `const idx = drafts.findIndex(...); if (idx < 0) return state;` — если draftId не найден в `assemblyDrafts`, экшен молча проглатывается, без тоста. Замена: при `idx < 0` — `console.warn('[assembly] commitDraft: draft not found', draftId)` (dev-видимость) + вернуть `errToast(state, 'Сборка не найдена — сегмент не добавлен')`. Тихий проглот недопустим.

**D2 — `GAP_MAX_LENGTH` zone-cap = 10000.** `piece-invariants.js`: gap-пирс длиннее 10000 нт отвергается `validateShape` → `CREATE_PIECE` даёт `errToast`, но текст generic. Биолог, вставляющий целую плазмиду (часто >10 kb), упирается в стену с невнятным сообщением. Замена: (а) поднять `GAP_MAX_LENGTH` до разумного для вставленной молекулы (предложение — 100 000, согласовать с Игорем — open question §6); (б) если кап остаётся — `localizeError` для этого случая дать понятный текст («Вставленный фрагмент длиннее лимита N нт»). **Не корень V101** (Игорь вставлял 5941 — под капом), но реальный латентный баг.

**D3 — рассинхрон капов.** Legacy `ASM_CAPS.gapMax = 200` (`assembly-invariants.js`) против zone `GAP_MAX_LENGTH = 10000` (`piece-invariants.js`). `ASM_CAPS.gapMax` сейчас нигде не enforced (`validateGapSequence` его не читает) — мёртвая константа, вводит в заблуждение. Замена: убрать `ASM_CAPS.gapMax` либо привести к одному значению с zone-капом. Мелочь, но в один проход с D2.

**D4 — `createPieceInZone` invariant-fail.** `if ((s.pieces||[]).length === before) return s;` — возвращает state от `piecesReducer`, который при провале инварианта несёт `errToast` (тост surface'ится, не молчит — это ОК). Менять не нужно; зафиксировано здесь чтобы Code не «чинил» рабочее.

## 3. Корень не запинен — воспроизведение + инструментация (главный шаг)

Поскольку статика чиста, Code должен **поймать расхождение в рантайме**, а не чинить вслепую.

**3.1. Full-flow интеграционный тест (первый артефакт).** Написать тест, симулирующий ТОЧНЫЙ сценарий Игоря, а не редьюсер-юнит:
- Смонтировать `AssemblyModeShell` (через `EditorWindowShell` / реальный mount-стек) на **свежесозданной зоне-сборке** (`buildAssemblyZoneAction` → `CREATE_ZONE` → `openEditorAssemblyTab`).
- Сборка пустая → empty-state inline `LibrarySearchBar`. Ввести сиквенс в paste-textarea (`*-paste-input`), нажать `*-paste-confirm`.
- **Assert 1:** `draft.segments.length === 1`, редактор ушёл из empty-state в `SequenceTab`.
- Симулировать round-trip: `closeEditor` → `openEditorAssemblyTab(zoneId)` заново.
- **Assert 2:** сегмент на месте.
- Прогнать также при **непустой** сборке (вставка через «+ Сегмент» popover) и для **legacy `assemblyDrafts`** таргета.

Если тест **КРАСНЫЙ** — корень найден в коде, тест же его и сторожит после фикса. Если **ЗЕЛЁНЫЙ** (репро нет) — баг вне тестируемого слоя (persistence-тайминг / окружение / специфика session-state); Code фиксирует это в отчёте и переходит к 3.2.

**3.2. Инструментация живого пути** (если 3.1 зелёный). Временные `console.debug` с префиксом `[V101]` в:
- `AssemblyShellBody::onPasteSequence` — `{ seqLength, draftId, isZoneTarget, draftSegmentsBefore: draft.segments.length }`.
- `routeAssemblyWriteToZone` — `{ actionType, draftId, isZone }`.
- `createPieceInZone` — `{ piecesBefore, piecesAfter, newId, zoneIdAssigned }`.
- `draftFromZone` — `{ zoneId, totalPieces: state.pieces.length, inZone: filtered.length }`.
Игорь воспроизводит, отдаёт консоль. Лог покажет, на каком звене сегмент исчезает. После диагноза — `console.debug` снять.

## 4. Дерево решений по результату §3

- **Тост при вставке** (validation reject) → причина в тексте тоста → точечный фикс инварианта/капа (см. D2).
- **`createPieceInZone`: `piecesAfter === piecesBefore`** → инвариант отверг пирс несмотря на §1 → перепроверить фактический `pieceData` против `validateShape` (возможно поле, которого нет в трассировке).
- **Пирс создан, `zoneIdAssigned` ≠ `draftId` из `onPasteSequence`** → рассинхрон таргета → чинить резолв id.
- **Пирс создан и зонирован верно, но `draftFromZone.inZone === 0`** → расхождение `zone.id`, на котором открыт редактор, и `zoneId` пирса → чинить, на каком id открывается assembly-таб (`openEditorAssemblyTab` / `activeTab.assemblyDraftId`).
- **Всё на месте сразу после вставки, теряется только после round-trip** → проблема в persistence-тайминге или в ре-резолве таба при повторном `openEditorAssemblyTab` → смотреть `editorContext` после round-trip.

## 5. Scope

**IN:** D1–D3 hardening; full-flow тест §3.1; инструментация §3.2 (если нужна); фикс корня по §4 — точечный, после того как §3 его покажет.
**OUT:** рефакторинг dual-model (zone vs legacy `assemblyDrafts`) — отдельная задача; снос legacy-пути; правка `Annotator`/пикера.

## 6. Открытые вопросы

1. `GAP_MAX_LENGTH` (D2) — до какого значения поднять для вставленной молекулы? Предложение 100 000. Решение Игоря.
2. Нужен ли тост-feedback на УСПЕШНУЮ вставку («сегмент добавлен»)? Сейчас фидбэка нет — при тихом сбое биолог не понимает, сработало ли. Возможно стоит добавить (low-stakes).

## 7. Порядок выполнения

1. D1 + D3 — точечные правки (тихий no-op → warn+toast; убрать мёртвый `ASM_CAPS.gapMax`).
2. §3.1 — full-flow интеграционный тест. Прогнать.
3. Если красный — корень найден → фикс по §4 → тест зелёный.
4. Если зелёный — §3.2 инструментация; отчёт с явной пометкой «репро в тесте не получено, нужен живой лог Игоря».
5. D2 — после решения Игоря по open question 1.
6. Полный Vitest + `vite build`.

## 8. STOP-условие и формат отчёта

После §7 — STOP, отчёт в `CURRENT_TASK.md`: какой шаг §3.1/3.2 сработал; **воспроизвёлся ли баг в тесте (да/нет)**; если да — корень (файл:строка) + правило фикса; если нет — что инструментировано и что нужно от Игоря; D1/D2/D3 статус; Vitest counters; `vite build`. Координационные файлы не финализировать.

## 9. Риски

- **Главный риск — баг не воспроизведётся в тесте** (§3.1 зелёный). Тогда спека не закрывает V101 за один проход — нужен живой лог Игоря (§3.2). Это заложено в план, не провал; честная альтернатива — гадать.
- D2 (подъём `GAP_MAX_LENGTH`) трогает инвариант, используемый и не-paste путями (snippet/synthesis тоже капятся `GAP_MAX_LENGTH` через `INLINE_KINDS`). Поднятие капа ослабляет защиту для ВСЕХ inline-пирсов — проверить, что это приемлемо (вероятно да: 100k всё ещё ловит мусорные вставки).
- Пересечение с editable-assembly S1: обе спеки правят `AssemblyShellBody.jsx` — не выдавать Code одновременно с S1.

## 10. Что ускорит диагностику — от Игоря

Один из ответов крякнет баг быстрее, чем §3.2: **(а)** появляется ли тост при вставке и его текст; **(б)** что в консоли браузера (F12) в момент вставки; **(в)** длина пасты в случаях потери (всегда <10 kb?); **(г)** сборка — свежая через «+ Сборка» или открыта из старого проекта, и была ли она пустой.
