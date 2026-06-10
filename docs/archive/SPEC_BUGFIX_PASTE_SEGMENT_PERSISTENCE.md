# SPEC — Bugfix: вставленный сегмент не приземляется / теряется (paste persistence)

**Тип:** C (багфикс + hardening). **Запрос Игоря (22.05.2026, живой тест):** после вставки своего сиквенса в paste-секцию пикера «бросает в выборщик»; после ухода на канвас и возврата в сборку фрагмент не сохранён.
**Статус:** диагностика проведена (19 файлов), детерминированный корень НЕ запинён — см. §1. Спека чинит найденные дефекты и делает тихие провалы громкими, чтобы корень всплыл на живом репро.

---

## 1. Диагностика — что проверено

Прослежен весь paste-путь: `LibrarySearchBar` (paste-секция) → `AssemblyShellBody.onPasteSequence` → `insertManualSegment` → `INSERT_MANUAL_SEGMENT` → `assemblyReducer` → `routeAssemblyWriteToZone` → `createPieceInZone` → `piecesReducer` `CREATE_PIECE` → `validateShape`; чтение — `useAssemblyTarget` → `selectAssemblyTarget` → `draftFromZone`; персистентность — `skeleton-persistence`; финализаторы — `applyAutoReactions`, zone-bounds, `applyZoneLayouts`.

**Детерминированный zone-путь чист — проверено:**
- `validateShape` принимает gap-пирс с `kind:'gap'`, `origin:'manual-gap'` (в `ORIGIN_ENUM`), `gapLength` ≤ `GAP_MAX_LENGTH` (10000), `gapSequence.length === gapLength`. Для 5941 bp проходит.
- `createPieceInZone` создаёт пирс, `SET_PIECE_ZONE` проставляет `zoneId`.
- `draftFromZone` включает `kind:'gap'` пирсы как сегменты (`source:{type:'manual'}`, `sequence:gapSequence`).
- `state.pieces` / `state.zones` персистятся (НЕ в `TRANSIENT_UI_FIELDS`).
- `applyAutoReactions` для gap-пирса — no-op (`shouldHaveReaction`: `kind==='gap'` → false; `derivedReactionId` уже null).
- `applyZoneLayouts` для сборки — no-op (`computeZoneLayout`: `viewMode==='sequence'` → null; сборка всегда sequence-mode зона).
- `zonesReducer` не делает геометрического выселения — `piece.zoneId` меняется только явными экшенами (`SET_PIECE_ZONE` / `MOVE_NODE_TO_ZONE` / `REMOVE_ZONE`).
- `useAssemblyTarget` реактивен (`useMemo([state, targetId])`, `state` — новая ссылка на каждый dispatch).

**Вывод:** при открытии редактора на зоне (а `assembly-zone-create` делает «+ Сборка» именно зоной) вставка 5941 bp детерминированно создаёт и сохраняет gap-пирс. Симптом Игоря в этом пути статически не воспроизводится → корень либо в state-зависимости (legacy `assemblyDrafts`-таргет вместо зоны), либо в гонке персистентности (§2 D4), либо требует живого репро. Спека закрывает ВСЕ тихие провалы на пути, чтобы провал стал видимым и адресным.

## 2. Найденные дефекты

**D1 — тихие no-op на write-пути.** Две точки молча возвращают state без сегмента:
- `zone-assembly-write-adapter.js::createPieceInZone` — `if ((s.pieces||[]).length === before) return s;` — при провале инварианта `CREATE_PIECE` пирс не создан. Тост от `piecesReducer.errToast` на state есть, но generic («Invalid range») и не привязан к paste-UI.
- `skeleton-state-assembly.js::commitDraft` — `if (idx < 0) return state;` — **возвращает bare state БЕЗ тоста**. Если `draftId` не найден в `assemblyDrafts` (и не зона) — вставка молча исчезает, ноль обратной связи.

**D2 — `GAP_MAX_LENGTH` 10000 — потолок для вставленного фрагмента.** `piece-invariants.validateShape`: `gapLength > 10000` → `fail('INVALID_RANGE')`. Биолог через paste-секцию вставляет целые молекулы (плазмиды кратно >10 kb); вставка >10000 bp молча отвергается (generic error-тост, paste-textarea без подсказки). Для custom-segment (свой сиквенс = реальный фрагмент ДНК) потолок 10 kb концептуально неверен. `LibrarySearchBar` paste-секция не имеет max-length guard вообще. **Это реальный воспроизводимый дефект** (репро Игоря 5941 bp под потолком, но landmine очевиден).

**D3 — `onPasteSequence` не верифицирует, что write приземлился.** `AssemblyShellBody.onPasteSequence` диспатчит `insertManualSegment` и `setPickerOpen(false)` — и всё. Если dispatch оказался no-op (D1) — пользователь молча остаётся на пустом empty-state пикере («бросает в выборщик»). Никакой проверки `segments.length` до/после, никакого error-feedback.

**D4 — СУСПЕКТ: гонка debounced-save vs remount.** `skeleton-persistence.createDebouncedSaver(500)` — авто-сейв через 500 мс. `SkeletonProvider` rehydration keyed на `currentProjectId`. Если «выход на канвас» = уход с canvas-skeleton route (unmount `SkeletonProvider`) в пределах 500 мс после вставки — pending save ещё не записан; remount → `loadSnapshot` может прочитать ДО-paste snapshot → `REPLACE_STATE` стёр вставку, а следующий авто-сейв закрепил stale-state. Внутри одного Provider'а (редактор↔канвас без route-смены) гонки нет — это нужно подтвердить на репро (см. §7).

## 3. Стратегия фикса

1. **Сделать все тихие провалы громкими** (D1) — каждый no-op write-путь обязан оставить explicit error-тост; `commitDraft idx<0` — добавить тост.
2. **D3 — post-write верификация в `onPasteSequence`**: после dispatch на microtask прочитать свежий state (паттерн `stateRef`, уже есть в `onRangeConfirm`), сверить, что у `draftId` появился сегмент/пирс. Не появился → loud error-тост («Сегмент не вставлен — …»). Это превращает «молча исчезло» в видимый адресный сбой.
3. **D2 — поднять потолок + guard**: `GAP_MAX_LENGTH` поднять до значения, адекватного целой плазмиде (≥ 100000 — открытый вопрос §7); `LibrarySearchBar` paste-секция — добавить max-length guard (disable кнопки + сообщение) синхронно с инвариантом.
4. **D4 — flush pending save на unmount**: `createDebouncedSaver` отдаёт `flush()`; `SkeletonProvider` на unmount флашит. Code подтверждает на репро, размонтируется ли Provider при «выходе на канвас» (§7) — если нет, D4 не корень Игоря.
5. **Регрессионный тест round-trip** — вставка в zone-сборку → сегмент на месте → `CLOSE_EDITOR` → `OPEN_EDITOR_ASSEMBLY_TAB` (та же зона) → сегмент на месте. Если тест падает — детерминированный репро пойман, Code чинит прямо; если зелёный — баг недетерминированный, инструментация (п.2) ловит его на живом прогоне.

## 4. Файлы / правила замены

**`lib/zone-assembly-write-adapter.js`** — `createPieceInZone`: ветку `if ((s.pieces||[]).length === before) return s;` оставить (state уже несёт `errToast` от `piecesReducer`), но добавить комментарий-якорь, что это намеренный «инвариант провалился» путь, тост уже стоит. Доп. правок не требует — тост есть.

**`store/skeleton-state-assembly.js`** — `commitDraft`: `if (idx < 0) return state;` → `if (idx < 0) return errToast(state, 'Сборка не найдена — сегмент не вставлен');`. Тихий no-op становится видимым.

**`lib/piece-invariants.js`** — `GAP_MAX_LENGTH` поднять (§7 — значение). Затрагивает `validateShape` (gap + inline kinds). ⚓-влияние: gap/snippet/synthesis потолок — отметить в `TECH_DEBT`/спросить (§7).

**`components/CanvasSkeleton/canvas/LibrarySearchBar.jsx`** — paste-секция: добавить max-length guard. При `pasteClean.length > PASTE_MAX` — `pasteInvalid`-стиль + сообщение («Слишком длинно: {n}/{max} bp»), кнопка «Вставить сегмент» disabled. `PASTE_MAX` синхронен новому `GAP_MAX_LENGTH`.

**`components/CanvasSkeleton/editor/assembly-mode/AssemblyShellBody.jsx`** — `onPasteSequence`: после `actions.insertManualSegment(...)` — microtask-проверка (`setTimeout(…,0)` + `stateRef.current`), что число сегментов сборки выросло; не выросло → `actions.showToast({kind:'error', message:'Сегмент не вставлен'})`. Паттерн уже применён в `onRangeConfirm`.

**`store/skeleton-persistence.js`** — `createDebouncedSaver`: добавить `save.flush = () => { if (timer){ clearTimeout(timer); saveSnapshot(lastState, lastProjectId); timer=null; } }`.

**`store/skeleton-context.jsx`** — `SkeletonProvider`: `useEffect(() => () => debouncedSaver.flush?.(), [])` — флаш pending save при размонтировании Provider'а.

## 5. Тесты

- **Regression round-trip (главный):** zone-сборка пустая → `INSERT_MANUAL_SEGMENT` (paste, ~6 kb) → `draftFromZone` даёт 1 сегмент → `CLOSE_EDITOR` → `OPEN_EDITOR_ASSEMBLY_TAB` той же зоны → `selectAssemblyTarget` всё ещё даёт 1 сегмент.
- `INSERT_MANUAL_SEGMENT` с `draftId`, которого нет ни в `zones`, ни в `assemblyDrafts` → state несёт error-тост (не bare state).
- Вставка > нового `GAP_MAX_LENGTH` → отклоняется с error-тостом; `LibrarySearchBar` paste-секция при `length > PASTE_MAX` — кнопка disabled, виден guard-месседж.
- `onPasteSequence` при no-op dispatch (draftId не резолвится) → виден error-тост.
- `createDebouncedSaver().flush()` синхронно инициирует `saveSnapshot` и гасит таймер.
- Регрессия: обычная вставка валидного сегмента в непустую сборку не сломана; полный Vitest + `vite build`.

## 6. STOP

После реализации §3–§5 и зелёного полного Vitest + `vite build` — STOP, отчёт в `CURRENT_TASK.md`: commit range, Vitest counters, build, **результат живого репро (§7)** — какой error-тост сработал при вставке, размонтируется ли Provider при «выходе на канвас». Координационные файлы не финализировать.

## 7. Что Code обязан проверить на живом репро / открытые вопросы

1. **Главный вопрос корня.** С громкими тостами (§3 п.1–2) — воспроизвести точный сценарий Игоря: вставка своего сиквенса в empty-state сборки → какой тост виден? («Сборка не найдена» = D1/commitDraft; «Invalid range» = D2/инвариант; никакого + сегмент не появился = смотреть D4/реактивность). Тост называет корень.
2. **Размонтируется ли `SkeletonProvider` при «выходе на канвас».** Если редактор↔канвас в пределах одного Provider'а — D4 не корень Игоря, round-trip чисто in-memory (он в §1 доказан рабочим) → корень в state-зависимости, копать legacy `assemblyDrafts`-таргет: проверить, не открывается ли редактор на `assemblyDrafts`-драфте (не на зоне) в реальном проекте.
3. **`GAP_MAX_LENGTH` — целевое значение.** Custom-segment = вставка реального фрагмента ДНК; 10 kb мало. Предложение: ≥ 100000. Решение — Игорь / Code по факту (затрагивает gap + snippet/synthesis потолок).
4. Если regression round-trip (§5) падает — детерминированный репро пойман, Code чинит прямо и описывает корень в отчёте; инструментация §3 п.2 тогда вторична.
