> **Архив.** Снято с `CURRENT_TASK.md` 22.05.2026 при подготовке выдачи V102.
> Содержит: контракт хендоффа S1 + отчёты Code S1 / S2 / S3 + остановленную
> консолидацию калькулятора праймеров (биологический блокер overlap-конвенции).
> Решение по блокеру: вариант 1 (движок `overlapTail` содержит RC-инверсию,
> чинится отдельной bio-спекой тип C перед консолидацией) — подтверждено Игорём
> 22.05.2026. Порядок wave после этой точки: V102 → bio-фикс `overlapTail` →
> консолидация калькулятора.

---

# CURRENT_TASK.md

## 🔵 Статус: Хендофф Code — editable-assembly спринт 1 (22.05.2026)

Спринт 1 из 4-спекового wave: **editable-assembly** (S1→S2→S3) + **консолидация калькулятора праймеров**. Bug-batch V97–V100 + 3 фичи закрыт Code — контракт и отчёт в `docs/archive/CURRENT_TASK_HISTORY_2026_05_22_v97_v100_batch.md`. Визуальная приёмка V96 / V97–V100 / M-FORMAT-V2 отложена Игорём до реализации всего wave.

**TL;DR для Code:** прочитай `CLAUDE.md` → `BUGS.md` → этот файл → `docs/SPEC_EDITABLE_ASSEMBLY_S1.md`. Реализуй S1 строго по §«Порядок выполнения» спеки. Спеку в `docs/` НЕ переписывай. После зелёного полного Vitest + `vite build` clean — **STOP**, отчёт в этот файл. НЕ финализируй координационные файлы.

---

## Порядок чтения для Code

1. `CLAUDE.md` → `BUGS.md` → этот файл.
2. `docs/SPEC_EDITABLE_ASSEMBLY_S1.md` — полная спека (контекст, архитектурные решения, файлы/сигнатуры, порядок, STOP, риски). Всё там.

---

## Задача — editable-assembly спринт 1

**Спека:** `docs/SPEC_EDITABLE_ASSEMBLY_S1.md` (тип A).
**Суть:** собранный вид редактора сборки становится editable; печать нуклеотида по курсору → новый блок (`snippet` ≤ порога / `synthesis` > порога); правка внутри inline-piece; `DISBAND_OP_GROUP` при правке piece, входящего в op-группу. Механизм ввода (`useSequenceKeyboard` `onSequenceEdit`) уже существует — спринт включает его в собранном виде и пишет роутер правки в pieces.

**Чеклист (из §7 спеки):**
- [x] `lib/assembly-edit-router.js` (новый) — `routeAssemblyEdit` + юнит-тесты роутера.
- [x] `DISBAND_OP_GROUP` — `skeleton-state-operations.js` + зеркало в `skeleton-state-pieces.js` + тесты.
- [x] `AssemblyShellBody.jsx` — `editable`-gate (§5.1 спеки) + `onSequenceEdit`-хендлер + тост/каретка.
- [x] Настройка порога `synthesisLengthThreshold` (дефолт 80).
- [x] Интеграционные тесты + регрессия.
- [x] Полный Vitest + `vite build`.

---

## Контекст состояния кода

- **База:** working-tree, branch `feature/m-x-7a-library-structure-v2`, HEAD `7a25375`. Vitest baseline после батча V97–V100 — **3915 pass / 18 skip / 0 fail**, `vite build` clean.
- Working-tree содержит нескоммиченные правки V96 + V97–V100 + 3 фичи + pre-existing хвост прошлого батча. Спринт 1 строится поверх этого working-tree.
- **ВАЖНО — риск S1 §9 снят.** Dead-code sweep custom-segment'а Code НЕ делал: `INSERT_SNIPPET` / `INSERT_SYNTHESIS` actions и piece-kind'ы `snippet` / `synthesis` ЖИВЫ в коде. S1 использует их штатно (создание блока печатью) — воскрешать ничего не нужно.
- `AssemblyShellBody.jsx` сейчас 23.5 KB (под hard 40) — спека §0 указывает 22.97, расхождение несущественно, лимит соблюдён.
- 3 модалки Обвес/Синтез/Gap удалены батчем; новый блок S1 создаёт через `INSERT_SNIPPET` (не через модалку).

---

## STOP-условие и формат отчёта

После реализации IN-scope §3 спеки + зелёного полного Vitest + `vite build` clean — **STOP**. Отчёт в этот файл отдельной секцией:
- commit range (или working-tree, если без коммита);
- Vitest counters (pass / skip / fail);
- `vite build` результат;
- spec deviations — если отступал от спеки, явно;
- size budget: `AssemblyShellBody.jsx`, `skeleton-state-operations.js`, `assembly-edit-router.js`.

Визуальная приёмка — **отдельная Chat-сессия**, не в этой.

---

## Что НЕ трогать

- Координационные файлы — `PROJECT_STATE.md` / `BUGS.md` / `DECISIONS.md` / `RELEASES.md` / `ANCHORS.md` / `TECH_DEBT.md` / `CLAUDE.md` / `COMPONENT_MAP.md`. Финализирует Chat.
- Спеки в `docs/` — не переписывать.
- `SequenceView/index.jsx` — editable-механизм там уже есть, спринт 1 его не редактирует (спека §0).
- Backend `src/pvcs/` — не задет.
- Алгоритмические зоны (§3 CHAT_PLAYBOOK) — без правок сверх спеки.
- Спеки S2 / консолидации / S3 — НЕ начинать. Выдаются Chat'ом отдельно после отчёта по S1.

---

## При регрессии

Новый код ломает существующий тест — не глушить, не править тест «под результат». Зафиксировать в отчёте: тест, пункт, предполагаемая причина. Chat разбирает.

---

## Wave-roadmap (контекст — не выполнять сейчас)

S1 (этот) → **S2** (`SPEC_EDITABLE_ASSEMBLY_S2.md` — `SPLIT_PIECE`, удаление, замена→мутации) → **консолидация калькулятора** (`SPEC_PRIMER_CALCULATOR_UNIFICATION.md`) → **S3** (`SPEC_EDITABLE_ASSEMBLY_S3.md` — координаты праймеров). Каждый следующий спринт Chat выдаёт после отчёта по предыдущему. S2 строится на `assembly-edit-router.js` + `DISBAND_OP_GROUP` этого спринта; консолидация переиспользует `applyPieceMutations` из S2.

---

## Отложенные визуальные приёмки (не терять)

Принимаются серией приёмочных сессий после реализации всего wave:
- **V96** overlay-геометрия — `docs/archive/CODE_REPORT_V96_OVERLAY_2026_05_22.md`.
- **V97–V100 + 3 фичи** (picker-unification / custom-segment SAFE / collision) — `docs/archive/CURRENT_TASK_HISTORY_2026_05_22_v97_v100_batch.md` (контракт + отчёт Code).
- **M-FORMAT-V2 + 3×CLEANUP** — `docs/archive/CURRENT_TASK_HISTORY_2026_05_20_format_v2_and_cleanup.md`.

---

**Дата:** 22.05.2026. **Версия:** v0.8.3-alpha. **Статус:** готов к выдаче Code.

---

## ✅ Отчёт Code — editable-assembly S1 (22.05.2026)

Реализовано по §«Порядок выполнения» спеки. Полный Vitest зелёный, `vite build` clean. **STOP.**

### Commit range
Working-tree (без коммита — по инструкции). Изменённые/новые файлы:
- **NEW** `gui/designer/src/components/CanvasSkeleton/lib/assembly-edit-router.js` — чистый `routeAssemblyEdit` + `SYNTHESIS_THRESHOLD_DEFAULT`.
- `…/store/skeleton-state-operations.js` — `DISBAND_OP_GROUP` (удаление op-группы + orphan layer-1 downstream + сброс auto-primers).
- `…/store/skeleton-state-pieces.js` — зеркальная очистка `groupId`/`groupLayer` (self-heal orphaned pieces) в cross-domain prelude.
- `…/store/skeleton-context.jsx` — actions `disbandOpGroup`, `updatePiece`.
- `…/editor/assembly-mode/AssemblyShellBody.jsx` — `editable`-gate (§5.1) + `onSequenceEdit`-хендлер + disabled-banner.
- `gui/designer/src/store/uiSlice.js` — `synthesisLengthThreshold` (default 80, clamp 40–200) в `displaySettings`.
- `gui/designer/src/components/SettingsModal.jsx` — числовое поле порога (display-tab).
- `gui/designer/src/lib/strings.js` — `canvasSkeleton.editableAssembly` (тосты/баннеры, RU) + `settings.display.synthesisThreshold*` (EN, под соседний блок).
- **NEW tests:** `__tests__/assembly-edit-router.test.js` (23), `__tests__/disband-op-group-s1.test.jsx` (4), `__tests__/editable-assembly-s1.test.jsx` (9).

### Vitest
**3951 pass / 18 skip / 0 fail** (404 файла / 1 skipped-файл). Baseline 3915 → +36 (23+4+9), zero регрессий. Pre-existing flake `primer-wizard.test.jsx::2` в прогоне НЕ воспроизвёлся.

### vite build
**✓ built in 635ms** — clean. Предупреждения (`INEFFECTIVE_DYNAMIC_IMPORT` DagWorkspace, chunk >500 kB) — pre-existing, не от S1.

### Size budget
- `AssemblyShellBody.jsx` — **27.3 KB** (было ~23.5; +3.8). Под hard 40, под soft 30. OK.
- `skeleton-state-operations.js` — **20.8 KB** (было 18.7; +2.1). Под hard 25; чуть выше soft 20 — warning-уровень, не блокер.
- `skeleton-state-pieces.js` — 16.5 KB. OK.
- **NEW** `assembly-edit-router.js` — **6.6 KB** (под hard 25; спека оценивала 4–6).
- Новых hard-нарушителей нет; ни один файл не вырос >5 KB за спринт. **Size budget: OK.**

### Spec deviations (явно)
1. **Undo-коалесцинг (§4 IN-scope) — ОТЛОЖЕН.** §7 «Порядок выполнения» его не перечисляет; детального дизайна нет (ссылка §5.7 указывает на «коллизию Del», не на коалесцинг). `skeleton-history.js` пишет history-запись на каждый state-changing action — добавление коалесцинга без спеки рискует регрессией undo-тестов. Сейчас каждое нажатие отдельно undoable. **Передаю Chat на отдельную мини-спеку.**
2. **`isZoneTarget`-gate (сверх §5.1).** `editable` дополнительно требует zone-target: legacy `assemblyDrafts` не имеют pieces → путь INSERT_SNIPPET/UPDATE_PIECE неприменим. Legacy-черновики остаются read-only как раньше.
3. **kindFlip — один UPDATE_PIECE.** §5.4 говорит «доп. UPDATE_PIECE»; шлю `sequence`+`kind` одним диспатчем (атомарно, одна history-запись, один validate). Поведение идентично.
4. **§5.6(в) layer-1 orphans — defensive, single-level.** Layer-1 op-группы через K7-UI не создаются (`createOpGroup` всегда layer-0). Реализация: дисбанд G удаляет напрямую осиротевшие downstream op-группы (потребляющие intermediate-piece с `derivedFromOpId===G`); `piecesReducer` self-heal'ит ВСЕ pieces с `groupId` на несуществующую группу → ungrouped, БЕЗ удаления pieces (без каскада). Покрыто двухслойным тестом (REPLACE_STATE-конструированное состояние).
5. **Имя нового блока статично «Вставка»** (§5.5 «вставка N нт, обновляется при росте»; §10 Q2 — формулировка low-stakes). Статика избегает лишнего dispatch на каждый символ + протухшего счётчика «N нт» после роста.
6. **Порог-настройка — поле сразу** (§10 Q1): числовое поле в SettingsModal display-tab (инфра — одно поле), не «хвостом».
7. **Строки:** тосты/баннеры — RU в `canvasSkeleton.editableAssembly`; настройка порога — EN в `settings.display` (конвенция по соседним строкам блока).

### Не тронуто (по инструкции)
PROJECT_STATE / BUGS / DECISIONS / RELEASES / ANCHORS / TECH_DEBT / CLAUDE.md / COMPONENT_MAP — не финализировал. Спеки `docs/` — не редактировал. `SequenceView/index.jsx` — не трогал (механизм ввода там уже был). Backend `src/pvcs/` — не задет. S2 / консолидация / S3 — не начинал.

**Визуальная приёмка — отдельная Chat-сессия.**

---

## ✅ Отчёт Code — editable-assembly S2 (22.05.2026)

Реализовано по §«Порядок выполнения» `SPEC_EDITABLE_ASSEMBLY_S2.md`. Полный Vitest зелёный, `vite build` clean. **STOP.** (Игорь явно дал «давай все остальные» — оверрайд исходного «S2/S3 не начинать».)

### Commit range
Working-tree. Новые/изменённые файлы:
- **NEW** `lib/piece-mutations.js` — `applyPieceMutations(seq, mutations)` (извлечён байт-идентично из `primer-derive.pieceSequence`).
- `lib/primer-derive.js` — `pieceSequence` теперь зовёт `applyPieceMutations` (DRY-рефактор).
- `store/skeleton-state-pieces.js` — `SPLIT_PIECE` (rc-aware, родители сохранены, мутации распределены; опц. `trimRightLeading` = mid-delete за один проход).
- `store/skeleton-context.jsx` — action `splitPiece(pieceId, atOffset, trimRightLeading?)`.
- `lib/zone-pieces-to-dag.js` — `draftFromZone` применяет мутации к sourced-сегменту (§5.4).
- `lib/assembly-edit-router.js` — расширен: `split-insert` / `mutate` / `trim` / `split-delete` / `plan` (spanning).
- `editor/assembly-mode/AssemblyShellBody.jsx` — `onSequenceEdit` обрабатывает новые виды результата + дисбанд всех задетых групп.
- **NEW tests:** `piece-mutations-s2` (6), `split-piece-s2` (5), `draftfromzone-mutations-s2` (3), `editable-assembly-s2` (6); расширен `assembly-edit-router.test` (+8 → 31).

### Vitest
**3978 pass / 18 skip / 0 fail** (408 файлов / 1 skipped). После S1 было 3951 → +27, zero нежданных регрессий.

### vite build
**✓ clean** (PWA сгенерирован, dist/sw.js). Предупреждения pre-existing.

### Size budget
- `assembly-edit-router.js` — **11.7 KB** (было 6.6; +5.1). Под soft 20 (спека: разбивать если >20 — не нужно). **Warning signal: вырос >5 KB за спринт** — при следующем росте кандидат на вынос под-функций.
- `skeleton-state-pieces.js` — **20.3 KB** (было ~16.9; +3.4). Под hard 25, чуть выше soft 20.
- `zone-pieces-to-dag.js` — 12.3 KB. OK.
- `AssemblyShellBody.jsx` — **29.4 KB** (было 27.3; +2.1). Под hard 40, у soft 30.
- **NEW** `piece-mutations.js` — 1.0 KB. Новых hard-нарушителей нет.

### Spec deviations
1. **mid-delete = `SPLIT_PIECE` + `trimRightLeading` в ОДНОМ reducer-проходе** (вместо §5.6 «split + UPDATE_PIECE правой половины, хендлер берёт последний созданный»). Причина: чтение свежего state между диспатчами в одном хендлере невозможно без `setTimeout`-хака; combined reducer-action синхронен и тестируется чисто. Результат идентичен.
2. **S1 placeholder-тесты обновлены под S2** (intended, спека §3 «что было noop, теперь резолвится»): `assembly-edit-router.test` (insert-в-sourced → split-insert; delete-через-границу → plan; delete-в-sourced → split-delete) + `editable-assembly-s1` («typing inside sourced» теперь split, не noop). Не регрессия — placeholder'ы помечались «(S2)».
3. **mutation-распределение при split — orientation-независимо** (top-strand-local координаты): `<atOffset`→левая, `≥atOffset`→правая (−atOffset). Спека упоминала «сдвиг для reverse» — по факту сдвиг одинаков для обеих ориентаций (мутации в top-strand). Тест покрывает.
4. **Цвет половин — родительский** (§10 Q1 default).
5. **substitution `mutation.kind:'silent'`** (§10 Q2 заглушка); авто-классификация silent/missense — не в спринте.

### Не тронуто
Координационные файлы / спеки docs/ / SequenceView/index.jsx / backend — без изменений. `assembly-model.splitSegment` — референс, не редактировался.

---

## ✅ Отчёт Code — editable-assembly S3 (22.05.2026)

Реализовано по §«Порядок выполнения» `SPEC_EDITABLE_ASSEMBLY_S3.md`. Полный Vitest зелёный, `vite build` clean. **STOP.**

### Commit range
Working-tree. Изменённые/новые файлы:
- `store/skeleton-state-assembly.js` — `SHIFT_ASSEMBLY_PRIMERS {draftId, atPos, delta}` (§5.1: правее→сдвиг coords+range+boundaryAtOffset; внутри региона→`status:'stale'`; auto-from-group без coords→skip).
- `lib/assembly-edit-router.js` — экспорт `computeSeqDelta(op)` (§5.2).
- `store/skeleton-context.jsx` — action `shiftAssemblyPrimers`.
- `editor/assembly-mode/AssemblyShellBody.jsx` — `onSequenceEdit` после piece-операций диспатчит `shiftAssemblyPrimers(computeSeqDelta(op))`.
- `editor/assembly-mode/AssemblyPrimersPanel.jsx` — `PrimerRow` рисует ⚠ при `status:'stale'` (testid `assembly-primer-stale`).
- **NEW tests:** `shift-assembly-primers-s3` (9), `editable-assembly-s3` (3); +5 `computeSeqDelta` в router-тесте.

### Vitest
**3995 pass / 18 skip / 0 fail** (410 файлов / 1 skipped). После S2 было 3978 → +17, zero регрессий.

### vite build
**✓ built in 571ms** — clean.

### Size budget
- `skeleton-state-assembly.js` — **17.5 KB** (было 15.1; +2.4). Под hard 25. OK.
- `AssemblyShellBody.jsx` — **30.4 KB** (было 29.4; +1.0). Под hard 40, чуть выше soft 30 — watch.
- `AssemblyPrimersPanel.jsx` — 13.2 KB. OK.
- `assembly-edit-router.js` — 12.9 KB. Под soft 20. Новых hard-нарушителей нет.

### Spec deviations
1. **`seqDelta` — экспортируемый хелпер `computeSeqDelta(op)`, не поле результата роутера** (§5.2 говорит «routeAssemblyEdit дополнительно возвращает seqDelta»). Причина: seqDelta — чистая функция ТОЛЬКО от op (результат маршрутизации на неё не влияет), вынос отдельным хелпером не ломает ~30 toEqual-ассертов S1/S2 router-тестов. Хендлер зовёт его напрямую. Эквивалентно; покрыто отдельным юнит-тестом.
2. **`DISBAND_OP_GROUP` уборка осиротевших auto-праймеров (§5.5) — уже сделана в S1** (DISBAND дропает auto-from-group primers удаляемых групп). S3 только проверяет (тест `editable-assembly-s3` «disband removes auto-primers»). Дубля нет.
3. **stale-UI — бейдж ⚠ + tooltip** (§10 Q1 default); кнопка «пересчитать» НЕ добавлена (low-stakes, биолог удаляет/перепишет).
4. **`SHIFT` пропускает primers без `source.selectionStart/End`** (auto-from-group). Они либо удаляются дисбандом (правка сгруппированного), либо живут вне editable-сдвига.

### Не тронуто
Координационные файлы / спеки / SequenceView / backend — без изменений. PCR-режим (`selectPcrPrimers`) — реактивный селектор, не задет.

**Остаётся:** консолидация калькулятора праймеров (`SPEC_PRIMER_CALCULATOR_UNIFICATION.md`) — крупный refactor с пере-baseline Tm/праймер-тестов; идёт следующим.

---

## ⏸ Отчёт Code — консолидация калькулятора: ОСТАНОВЛЕНА (нужно решение Chat/Игоря)

Реализована (адаптер `primer-calculator.js` + `deriveAutoPrimers`→алиас + `overlapTail` insertSeq/export) и прогнана на тестах — но прогон **вскрыл биологический конфликт overlap-конвенции**. Чтобы не зашить возможно-неверные праймеры, всё **РЕВЕРСНУТО**. Suite остаётся зелёным на S1+S2+S3 (**3995 pass / 18 skip / 0 fail**, build ✓). `primer-calculator.js` удалён; `primer-derive.js` / `local-primer-design.js` восстановлены.

### Блокер (биологический, не механический)
`designPrimersLocal` (референс-движок спеки) для overlap кладёт на fwd-хвост downstream-праймера **`reverseComplement(prevFragment.slice(-half))`** (split-overlap). `deriveAutoPrimers` — **verbatim** `prevSeq.slice(-25)` (без RC), и его собственный bio-invariants-комментарий явно помечает RC движка как **«spec bug»**. Для overlap/Gibson downstream-ампликон должен делить ОДНОНИТЕВУЮ гомологию с концом upstream → **verbatim выглядит верным, RC — нет**.

Спека предписывает «designPrimersLocal — один правильный движок», но это **противоречит уже задокументированному в коде bio-инварианту** (verbatim + «RC = bug»). Пере-baseline тестов под значения движка зашил бы возможно-неверную конвенцию (неверный overlap = плазмида не собирается в мокрой лабе). По правилу bio-invariants («биологическая корректность → STOP, обсудить с Chat») — остановился, не выбирал сам.

### Вопрос для Игоря/Chat
Какая overlap-конвенция верна для авто-праймеров — **verbatim** (текущий deriveAutoPrimers + bio-инвариант) или **split/RC** (движок)? Варианты:
1. **Движок содержит overlap-баг** (RC на fwd-хвосте) → чинить движок отдельной bio-спекой (затрагивает и v0.5 assembly-флоу), потом консолидировать. ← соответствует вашему bio-инварианту.
2. **Split/RC намеренный** → обновить bio-комментарий в `primer-derive`, я пере-baseline'ю ~7 тестов `primer-derive-k11` + новые `primer-calculator` тесты под split.
3. **Консолидировать только Tm/совпадающие части**, overlap-хвосты deriveAutoPrimers оставить verbatim.

### Вторичные расхождения (тоже на ревью)
- RE-junction enzyme не сорсится из op-группы → auto-праймеры теряют RE-сайт в хвосте (старый код брал `piece.reSite`, реальные pieces его не несут — т.е. фактически уже не работало).
- single-fragment <36bp → 0 праймеров (движок, Rule-6-совместимо: короткий фрагмент → merge) vs 2 (старый deriveAutoPrimers).

**Статус:** консолидация НЕ слита. S1+S2+S3 — слиты, зелёные.

---

## РАЗРЕШЕНИЕ БЛОКЕРА (добавлено при архивации, 22.05.2026)

Игорь подтвердил **вариант 1**. Биологический разбор (Chat, по коду `primer-derive.js` + `local-primer-design.js`):

- Forward-праймер своим 5'-хвостом буквально задаёт 5'-конец ВЕРХНЕЙ цепи ампликона → хвост обязан быть `prevFragment.slice(-N)` **verbatim**. RC пришил бы нижнюю цепь соседа к верхней цепи ампликона — рассогласование, гомологии нет, Gibson не собирает.
- Reverse-праймер строит нижнюю цепь → его хвост RC — корректно.
- `deriveAutoPrimers` (K11) делает это правильно (fwd verbatim, rev RC). `designPrimersLocal`→`overlapTail` инвертирует (`side==='right'`/fwd → RC, `side==='left'`/rev → verbatim) в ветках `overlap`, `overlapSequence`, `re_ligation`. Ветка `golden_gate` той же функции использует ПРАВИЛЬНУЮ конвенцию — внутреннее противоречие = доказательство, что overlap/RE-ветки багованы.
- Gibson-overlap по длине: ≥15 нт (на практике 20–40); в коде уже корректно — `OVERLAP_LEN=25`, `overlapLength` default 30. Bio-фикс правит ТОЛЬКО RC-конвенцию, длины не трогает.

**Итог:** `overlapTail` чинится отдельной bio-спекой (тип C) — в ветках `overlap` / `overlapSequence` / `re_ligation` поменять трактовку `side` так, чтобы `'right'`→verbatim, `'left'`→rc (эталон — ветка `golden_gate`). При фиксе проверить execute/realise-путь (`adapters/pcr.js`) — если он независимо считает ампликон по инвертированной конвенции, чинить вместе. Тест-fallout: `designPrimersLocal`-тесты + v0.5 assembly-снапшоты пере-baseline'ятся; K11-тесты `deriveAutoPrimers` НЕ меняются (уже на верной конвенции).

**Порядок wave:** V102 → bio-фикс `overlapTail` (тип C) → консолидация калькулятора (после фикса движок и `deriveAutoPrimers` сходятся, консолидация ложится чисто).
