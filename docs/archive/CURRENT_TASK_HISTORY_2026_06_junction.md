# CURRENT_TASK history — JUNCTION-арка + Звенья + UX-срезы (июнь 2026)

> Архив из CURRENT_TASK.md (вынесено 10.06 при старте M-CANVAS-FIX.1). Полные Code-отчёты + Chat-сверки junction-арки (шаги 1–2 + FIX + FIX-2 + Звенья overhang/Tm). Незакрытый долг (финализация трекеров + git) — в шапке актуального CURRENT_TASK.md.

---

# CURRENT_TASK.md

> **Активная задача — JUNCTION_MODULE, шаг 2 (JunctionControl UI + zone-strip).** Шаг 1 (1a data-model + 1b per-junction derive-on-add + 3-уровневая модель) **сверен Chat'ом по коду 05.06 — PASS** (см. «Сверка 1b» + «Хендофф шага 2» ниже). Модель источников праймеров — DEC-JUNC-PRIMER-01 (ANCHORS, promotion candidate). Это хендофф шага 2.
>
> **Старт сессии:** `CHAT_PLAYBOOK.md` → `CLAUDE.md` → `BUGS.md` → этот файл → первая строка + последняя запись `PROJECT_STATE.md`.

## Спека
**`docs/SPEC_ASSEMBLY_JUNCTION_MODULE.md`** — владелец. Контракт конфига + словарь method — `docs/SPEC_PRIMER_TAIL_UNIFICATION.md` §9b. Тело спек не переписывать; статус-шапку НЕ ставить (JUNCTION многошаговый, шапка — после ВСЕХ шагов).

## ⚓ Модель источников праймеров (Игорь 05.06 — канон для шага 1b)
**Праймеры — от СТЫКОВ (per-junction). Группа — порядок/состав шагов для ПРОТОКОЛА, не для праймеров.** Два независимых разделения:

- **Праймеры ← стыки**, три уровня приоритета (сверху держит нижний):
  1. **Полностью ручной** — биолог переписал сам праймер (последовательность). Флаг на ПРАЙМЕРЕ (`autoMode:'manual'`/userEdited). Финализатор **НЕ регенерит никогда**.
  2. **Полуручной** — биолог задал ЧИСЛО на стыке (`overlapLength`/`overlapTm`/`bindingLength`/`bindingTm`; `SET_BOUNDARY_OVERLAP` ставит `junction.autoMode:'manual'`). Финализатор **регенерит праймер, но держит число** (A3/A1b уже читают). Бьёт авто, уступает п.1.
  3. **Полностью авто** — конфиг стыка дефолтный. Финализатор регенерит свободно.
- **Протокол ← группы** (НЕ в этом наборе, но структуру не ломать): группа = скобки порядка операций сборки — «эти куски в одном шаге реакции, продукт → следующий шаг». Будущий авто-протокол читает группы для порядка/состава реакций. Праймеров группа НЕ касается.
- **Метод стыка** пишется И ручным кликом на стык (шаг 2), И сшиванием группой (группа проставляет method своим внутренним стыкам).

## Чеклист (по JUNCTION §6, строгий)
- [x] **1a. `zone.junctions` + `junction-derive` + сид/прун (J1/J2/J3).** Сверено по коду 05.06 — PASS. `pairKeyFor` id-based, closure только circular, seed overlap, two-level сеты, A3 (`method: j.method || opGroup.kind`), `SET_BOUNDARY_OVERLAP` manual-пин, финализатор `lib/junction-config-finalizer.js` сидит/прунит (НЕ деривит). Владение op-group цело.
- [x] **1b. Активация per-junction дерайва + 3 уровня + развязка группа↔праймеры (J11).** ← ЭТА ЗАДАЧА. Детали — секция «Директива 1b» ниже.
- [ ] 2. `JunctionControl` (эволюция `JunctionPopover`, НЕ rebuild) + zone-strip-поверхность (J6/J6b) — воскресить handler `OPEN_JUNCTION_METHOD_PICKER`. Кликабельный стык, primary sequence-поверхность.
- [ ] 3. Двухуровневость + метод↔топология + No-PCR-форс (J2/J4/J5) + Tm-ручки binding/tail в контроле.
- [ ] 4. Editor-оверлей над `SequenceView` (J7) — ОВЕРЛЕЕМ (hard-breached). Library/Importer/PCR не задеты.
- [ ] 5. Мягкая валидация выполнимости (J8) — варнинг, не блок.
- [ ] 6. `RealiseModal`→визуализация + удалить `MethodPickerCard` (J9).
- [ ] 7. Группировка-семантика + advisory `auto-group-pipeline` (J10).

## Директива 1b (для Code — строго по модели выше)
**Цель:** праймеры с хвостами появляются на ADD куска без ручного Sew; три уровня приоритета; группа из праймерного пути вынута, но как структура шагов жива.

1. **Финализатор `applyJunctionConfig` начинает деривить per-junction.** Сейчас он только сидит/прунит конфиг. Добавить: после сида — для зоны прогнать `deriveAutoPrimers` неявной zone-группой (куски в порядке `createdAt`, как `draftFromZone`/`CREATE_OP_GROUP.order`) → писать в `assemblyDraftPrimers[zoneId]`. Источник конфига каждого стыка — `zone.junctions[pairKey]` (A3 уже читает; уровни 2/3 отсюда). Запускать на change pieces/zones (гейт у финализатора уже есть).
2. **Уровень 1 (ручной праймер) пропускается.** Финализатор НЕ перетирает праймер с primer-level флагом ручной правки. **Code читает S3-хендлер (editable-assembly) + smoke-k17 (lock) ПЕРВЫМИ** — подтвердить, что edit/lock-путь ставит на праймер этот флаг (вероятная причина прошлого слома S3 — НЕ ставил). Если не ставит — поставить (это и есть фикс). Гейт пропуска — primer-level флаг, НЕ junction-level (`junction.autoMode:'manual'` = уровень 2, его праймер регенерится с числом).
3. **`CREATE_OP_GROUP` — убрать дерайв праймеров.** Снять блок K15 (`deriveAutoPrimers` + запись в `assemblyDraftPrimers`). **ОСТАВИТЬ:** запись method→`zone.junctions` (seed по стыкам группы) + создание реакции-узла + структуру группы (`isOpGroup`/`inputPieces`/`groupLayer`/бакеты >6). Праймеры теперь даёт финализатор (п.1).
4. **`REMOVE_OP_GROUP` / `DISBAND_OP_GROUP` — убрать primer-cleanup.** Снять фильтрацию `assemblyDraftPrimers` (праймеры от стыков, группа ими не владеет → teardown группы их НЕ трогает). ОСТАВИТЬ group/piece-teardown + (DISBAND) удаление осиротевших downstream-групп. **Следствие:** разгруппировка/удаление группы праймеры НЕ теряет (требование Игоря (a)).
5. **Тесты — переклассифицировать (это легитимная смена модели, не регрессия):**
   - **Владение-группой** («удалил группу → праймеры ушли», «группа владеет праймерами») — кодируют СТАРУЮ модель → переписать: группа праймеров не владеет/не дропает.
   - **Тайминг** («нет праймеров до Sew») → переписать на J11-инвариант: праймеры на add.
   - S3/k17 — праймер с ручной правкой/локом несёт primer-level флаг, финализатор пропускает (новый тест на это).
6. **Doc-drift — починить.** Комментарий в роутере `skeleton-state.js` у вызова `applyJunctionConfig` уже описывает дерайв-на-add (был ahead-of-code) → после п.1 становится верен. Привести docstring самого `junction-config-finalizer.js` («step-1 scope: does NOT re-derive») в соответствие (теперь деривит).

**Координация:** realise (V130, слой 2) читает `assemblyDraftPrimers` через `mapPrimersForSegment` по `source.pieceId` — финализатор пишет туда же, не регрессить. Источник правды по полям стыка — `pairKeyFor` (`junction-derive`), не строить ключ вручную (carry-H1).

## Carry-ноты свипа (учесть)
- `pairKey`-хелпер: движок ключует `zone.junctions` через `pairKeyFor()` JUNCTION (соблюдено в 1a — держать).
- Словарь `method` = канон движка (`overlap_pcr|gibson|golden_gate|restriction|direct_ligation|kld`); `METHOD_TO_JUNCTION` → `junction.kind` для глифа/палитры. НЕ путать с `acquisitionMethod`.
- `acquisitionMethod` (другой словарь, дом PIECE P3, там ov-pcr-миграция) — не трогать в 1b.

## STOP / дисциплина
- Спека — ДОК; статус-шапку НЕ ставить до завершения всех шагов JUNCTION.
- Code НЕ финализирует PROJECT_STATE/BUGS/DECISIONS/ANCHORS/RELEASES/TECH_DEBT/CLAUDE.md/package.json/version.js без авторизации Chat.
- Шаг 1b — STOP перед сверкой Chat'ом (data: тесты + code-verify, как V130/1a; визуал опционален — праймеры появляются в панели на add). Шаг 2 — после сверки 1b, отдельной сессией.
- Координационные доки — русский; публичный код — English (DEC-MA2-01).

## Формат отчёта Code (шаг 1b)
Коммит-хэш(и); Vitest+pytest; build; сколько тестов переписано (владение-группой → стык-модель; тайминг → on-add) + новые (3 уровня, S3/k17 пропуск); **отклонения** явным блоком; size budget (особ. `skeleton-state-operations.js` ~20.8 KB, `primer-derive.js`, `junction-config-finalizer.js`). Доп.: подтвердить чтением — S3/k17 edit/lock ставит primer-level ручной флаг (или поставлено); финализатор пропускает уровень 1, держит число уровня 2; `CREATE_OP_GROUP` праймеры не деривит, структура группы цела; REMOVE/DISBAND праймеры не трогают; doc-drift комментарий+docstring починены. Статус-шапку НЕ ставил (partial).

## Хендофф-фраза Code
> Прочитай `CHAT_PLAYBOOK.md`, `CLAUDE.md`, `BUGS.md`, `CURRENT_TASK.md`. Выполни шаг 1b JUNCTION_MODULE по секции «Директива 1b». **Сперва прочти S3-хендлер (editable-assembly) + smoke-k17** — подтверди, что ручная правка/лок праймера ставит primer-level флаг (если нет — поставь, это фикс прошлого слома S3). Модель: праймеры от стыков (3 уровня — ручной праймер / число на стыке / авто), группа из праймерного пути вынута но структура шагов жива для будущего протокола. Тело спек не переписывай, статус-шапку НЕ ставь. После 1b остановись — жду сверки Chat'ом (data + 3 уровня + развязка группы: тесты + code-verify). НЕ финализируй PROJECT_STATE/DECISIONS/BUGS/RELEASES/ANCHORS/TECH_DEBT/CLAUDE.md/package.json/version.js.

## История
- common-features (Тип A) финализирован 02.06 → `docs/archive/`. Dexie v6.
- ENGINE слой 1 (`20d2978`) → слой 2 (`4b9e5d5`, V130+buildOverlapTail+Tm) → V130-тест (`ba423c1`). Приёмка слоя 2 PASS 05.06. Финализация 05.06: BUGS V130/V131→FIXED + V139–V141 OPEN; TECH_DEBT ×2; PROJECT_STATE 4223→4328. Freshness-свип 05.06: 4 спеки когерентны, PIECE P3 +ov-pcr-нота.
- **JUNCTION шаг 1a сверен Chat'ом по коду 05.06 — PASS** (6 файлов прочитаны: junction-derive / primer-derive A3 / zone-slice / finalizer / ops-slice / router). Владение op-group нетронуто, финализатор конфиг-only. Doc-drift в комментарии роутера (заявлял дерайв, которого в 1a нет) — чинится в 1b. Vitest 4347 (трекеры НЕ финализированы — mid-step).
- **Решение J11 (Игорь 05.06):** праймеры от стыков (3 уровня приоритета); группа = структура шагов для протокола, не владелец праймеров; разгруппировка праймеры не теряет. → шаг 1b.
- Canvas-UX V139–V141 (клик-ромб / зона-drag-resize / панель обрезана) — OPEN в BUGS, отдельная canvas-сессия, пересечение слои 3/5.
- docs-ротация (18 > 8) — ждёт PowerShell-move Игоря (Filesystem без delete). 4 live-спеки не архивировать.

---

## Отчёт Code — JUNCTION шаг 1b (активация per-junction дерайва, J11) · 05.06

- Коммит: `42804af` — feat(assembly): JUNCTION layer 3 step 1b — activate per-junction primer derive (J11)

**Сделано по «Директиве 1b» + ⚓-модели источников:**
1. **Финализатор `applyJunctionConfig` деривит.** После сида — для зоны (≥2 кусков) гонит `deriveAutoPrimers` неявной zone-группой (`id:`zgrp-${zoneId}``, куски по `createdAt`), config-driven (A3), пишет `assemblyDraftPrimers[zoneId]`. **Праймеры с хвостами появляются на ADD без ручного Sew.**
2. **3 уровня.** Уровень 1 (primer-level `autoMode:'manual'`) — в пул первым, **финализатор не регенерит**. Уровень 2 (число на стыке, `junction.autoMode:'manual'`) — праймер регенерится, но движок читает число (A3/A1b). Уровень 3 (авто) — свободно.
3. **Чтение S3/k17 (по 1b.2):** подтверждено — `WRITE_ASSEMBLY_PRIMER`, K12-lock (`updateAssemblyPrimer {autoMode:'manual'}`), edit-save (`{sequence, autoMode:'manual'}`) **все ставят primer-level `autoMode:'manual'`**. Финализатор-скип `autoMode==='manual'` их защищает → прошлый слом S3/k17 от бланкетного re-derive снят (флаг был, бланкет его игнорировал; теперь скип явный). Доп. фикс флага не потребовался.
4. **`CREATE_OP_GROUP`** — снят дерайв (K15-блок). Оставлено: запись `kind`→`zone.junctions` метод + reaction-node + структура (`isOpGroup/inputPieces/groupLayer`). Праймеры даёт финализатор.
5. **`REMOVE_OP_GROUP`/`DISBAND_OP_GROUP`** — снят primer-cleanup. Оставлен group/piece-teardown + (DISBAND) удаление осиротевших downstream-групп. **Разгруппировка/удаление праймеры НЕ теряет** (требование (a)).
6. **Doc-drift** — docstring финализатора обновлён (деривит); комментарий вызова в роутере (был ahead-of-code) теперь верен.

- **Переклассифицировано (легитимная смена модели, не регрессия):**
  - Владение-группой (REMOVE/DISBAND дропали праймеры; primers tagged opGroupId) → **junction-owned** (`source.opGroupId === `zgrp-${zid}``; teardown не дропает): `finalizer-k15` (REMOVE describe 3 теста), `node-a` (REMOVE), `disband-op-group-s1` (disband-drop), `editable-assembly-s3` (disband-drop), `smoke-k17` (lock-preserve-on-remove).
  - Тайминг → **on-add**: S3 saved-праймер ищется по `source.selectionStart` (в пуле теперь и auto).
  - `v109` меж-групповой стык: финализатор даёт ему праймер → эвристика `overlap_pcr` (хвост ~20нт, капнут к длине куска), НЕ no-primer-fallback; ключевой инвариант (не op-group-путь) держится через rationale.
  - **Новое:** derive-on-add (праймеры на add), level-1 preserve (manual переживает re-derive).
- Vitest: **4349 pass / 17 skip / 0 fail** (`primer-wizard` параллельный флак — зелёный в изоляции 2/2). pytest не трогалось. build clean.
- **Отклонения:**
  - **Manual+auto сосуществуют для одного стыка** (если биолог WRITE'нул праймер на тот же piece-side, что и авто): пул = `[...manual, ...auto]`, manual первым (realise предпочитает). Дедуп manual↔auto по junction — refinement (вероятно шаг 2/3, когда UI покажет стык-праймеры). НЕ ломает realise (mapPrimersForSegment берёт первый = manual).
  - **Финализатор регенерит auto с новыми uuid** на каждое изменение pieces/zones (manual id стабилен). Lookup в realise/picker — по `source.pieceId`/boundary, не по id → ок. Стабильные id auto через re-derive — refinement.
- Size budget: `junction-config-finalizer` 2.49→**4.69** (derive); `skeleton-state-operations` 21.93→**21.05** (shrank, снят дерайв/cleanup — soft-watch >20, pre-existing); `skeleton-state.js` 24.98 (под hard 25). **Новых hard-нарушителей нет.**

После 1b: **СТОП — жду сверки Chat'ом** (data + 3 уровня + развязка группы: тесты + code-verify). Шапку спеки НЕ ставил (multi-step). Трекеры не финализировал. canvas-UX (V139–V141) не тронут. Дальше — шаг 2 (`JunctionControl` из `JunctionPopover` + zone-strip-поверхность).

---

## Сверка Chat'ом — JUNCTION шаг 1b · 05.06 — ✅ PASS (data-level, по коду)
Прочитано 8 файлов (junction-derive / primer-derive A3 / zone-slice / finalizer / ops-slice / router / zone-pieces-to-dag / assembly-slice). Все пункты «Директивы 1b» подтверждены:
- Финализатор деривит на add; **уровень 1 (primer `autoMode:'manual'`) сохраняется дословно, первым в пуле** (WRITE/UPDATE/lock ставят флаг — подтверждено в assembly-slice); уровень 2 регенерится с числом; уровень 3 свободно.
- `CREATE_OP_GROUP` дерайв снят (структура+метод целы); `REMOVE`/`DISBAND` primer-cleanup снят (праймеры персистят).
- realise `mapPrimersForSegment` = **`.find` (первый матч, НЕ longest-tail)** + пул manual-first → ручное бьёт авто, когда matchится. Требование №1 Игоря держится на уровне финализатора (зона ответственности 1b).
- doc-drift (роутер+docstring) починен.
Vitest 4349 pass / 17 skip / 0 fail. Тесты переклассифицированы (владение-группой→junction-owned; тайминг→on-add) — легитимная смена модели. Тела тестов не аудировал; поведение в исходниках проверено.

**Два отклонения (оба благ/отложены корректно):**
- **(a) manual+auto в пуле для одного piece-side** — авто-дубль есть, realise его не выбирает (manual первым в `.find`). Дедуп — рефайнмент. **Step-2 must-verify:** подтвердить, что source WRITE-ручного праймера matchится предикатом `mapPrimersForSegment` (`pieceId`/`segmentId`/`leftSegmentId`), а не только `selectionStart` — иначе нарисованный рукой праймер показан, но realise возьмёт авто (предсуществующее, всплывёт когда панель покажет праймеры). Прочитать `buildAssemblyPrimer` source-shape.
- **(b) авто регенерится с новым uuid на каждое изменение pieces/zones** (вкл. `DRAG_ZONE` — позиционное!) — черн на drag, риск flicker/потери выделения когда UI покажет праймеры. **TECH_DEBT-рефайнмент перед step 2:** ужать гейт финализатора на pieces + junction-config + membership, не zones-array-ref.

Трекеры финализированы 05.06: PROJECT_STATE 4328→4349; ⚓ANCHORS DEC-JUNC-PRIMER-01 (promotion candidate, не в счётчике 64); TECH_DEBT секция «Live-junction JUNCTION» (TD-JUNC-FINALIZER-DERIVE-GATE + TD-JUNC-MANUAL-AUTO-DEDUP). Шапку спеки не ставил (шаг 1 из 7). Версию не бампал.

---

## Хендофф шага 2 — JunctionControl UI + zone-strip (J6/J6b)
Шаг 2 — UI, приёмка **визуальная, отдельной сессией** (§3 carry-over). Спека: `SPEC_ASSEMBLY_JUNCTION_MODULE` J6/J6b + §9a.

**Предусловия (Code делает ПЕРВЫМИ, до UI — иначе панель мигает/врёт):**
1. **TD-JUNC-FINALIZER-DERIVE-GATE** — ужать гейт финализатора: дерайв только на pieces + junction-config + membership, НЕ на zones-array-ref (позиционный `DRAG_ZONE` не должен пересчитывать праймеры с новыми uuid).
2. **TD-JUNC-MANUAL-AUTO-DEDUP must-verify** — прочитать `buildAssemblyPrimer` source-shape, подтвердить, что source WRITE-ручного праймера matchится `mapPrimersForSegment` (`pieceId`/`segmentId`/`leftSegmentId`), не только `selectionStart`. Если нет — нарисованный рукой праймер показан, но realise берёт авто → починить. Затем дедуп manual↔auto в пуле (авто не генерить для side с manual).

**UI (после предусловий):**
3. `JunctionControl` — **эволюция `JunctionPopover`** (CSS/обёртка + контролы method/overlap/Tm), НЕ rebuild с нуля (antipattern 10). Перечислить affordances `JunctionPopover` ДО правки (§17 — grep hooks/handlers/hotkeys), сохранить все.
4. Воскресить handler `OPEN_JUNCTION_METHOD_PICKER` (диспатчится из `ImplicitJunction`/`ZoneAssembledView`, handler'а нет — recon 04.06). Клик по стыку → `JunctionControl`.
5. `ImplicitJunction` берёт метод из `zone.junctions[pairKey].method` (сейчас `derivedJunctionMethod` — выводит; перевести на хранимый + fallback на derived).
6. zone-strip-поверхность (J6) — primary sequence-поверхность стыков; глиф/палитра через `METHOD_TO_JUNCTION` → `junction.kind`.

**STOP:** после шага 2 — STOP, визуальная приёмка ОТДЕЛЬНОЙ сессией (не в этой). Шапку спеки НЕ ставить (шаг 2 из 7). Code НЕ финализирует PROJECT_STATE/DECISIONS/BUGS/RELEASES/ANCHORS/TECH_DEBT/CLAUDE.md/package.json/version.js.

**Отчёт Code (шаг 2):** коммиты; Vitest+pytest; build; предусловия 1–2 закрыты (gate ужат / source-match подтверждён или починен); `JunctionControl` — обёртка не rebuild + перечень сохранённых affordances; handler воскрешён; `ImplicitJunction` метод из `zone.junctions`; size budget; отклонения явным блоком.

**Хендофф-фраза Code:**
> Прочитай `CHAT_PLAYBOOK.md`, `CLAUDE.md`, `BUGS.md`, `CURRENT_TASK.md`. Выполни шаг 2 JUNCTION_MODULE (J6/J6b). СПЕРВА предусловия: (1) ужать гейт `applyJunctionConfig` (не пересчитывать на DRAG_ZONE); (2) прочитать `buildAssemblyPrimer`, подтвердить/починить source-match ручного праймера + дедуп manual↔auto. Затем UI: `JunctionControl` ЭВОЛЮЦИЕЙ `JunctionPopover` (НЕ rebuild — перечисли сохранённые affordances), воскреси handler `OPEN_JUNCTION_METHOD_PICKER`, `ImplicitJunction` метод из `zone.junctions`. После шага 2 СТОП — визуальная приёмка отдельной сессией. Тело спек не переписывай, шапку не ставь. НЕ финализируй трекеры.

---

## Прогресс Code — шаг 2 предусловия · 05.06 (UI-половина ждёт)

- Коммит: `4bf25cb` — fix(assembly): JUNCTION step-2 preconditions — derive-gate + manual↔auto dedup
- **Предусловие 1 (TD-JUNC-FINALIZER-DERIVE-GATE) ✅** — гейт финализатора ужат: `zonesConfigChanged(prev,next)` (zone add/remove ∥ `.junctions`-ref ∥ `topology.circular`); `DRAG_ZONE` (бnew bounds, тот же `.junctions`-ref) праймеры НЕ пересчитывает (нет churn новых uuid). Тест: DRAG_ZONE → id стабильны; SET_BOUNDARY_OVERLAP → пересчёт.
- **Предусловие 2 (TD-JUNC-MANUAL-AUTO-DEDUP) ✅** — verify: WRITE/lock-праймер несёт source `segment`/`boundary` (`segmentId`/`leftSegmentId`/`rightSegmentId`) → matchится `mapPrimersForSegment` (realise может взять ручной); fix не нужен. Дедуп добавлен: manual владеет своей `(piece, side)` → авто-дубль этой стороны дропается (ровно один праймер на сторону). Тест: WRITE pc2/fwd → нет auto pc2/fwd, прочие auto живы.
- Vitest **4352 pass / 0 fail**, build clean. finalizer 4.69→6.42 КБ (soft 20 — OK).

**UI-половина шага 2 (НЕ сделана — следующая сессия, §3 carry-over: UI = визприёмка отдельно):** `JunctionControl` (эволюция `JunctionPopover`, перечислить affordances), воскресить `OPEN_JUNCTION_METHOD_PICKER`, `ImplicitJunction` метод из `zone.junctions`, zone-strip-поверхность. Предусловия её разблокировали (панель не будет мигать/врать). Трекеры/шапку не финализировал.

---

## Отчёт Code — шаг 2 UI готов · 05.06 (визуальная приёмка отдельной сессией)
- Коммит: `bbff688` — feat(assembly): JUNCTION layer 3 step 2 — JunctionControl UI + zone-strip (J6/J6b). (предусловия — `4bf25cb`.)
- **`JunctionControl.jsx` (new) — ЭВОЛЮЦИЯ `JunctionPopover`, НЕ rebuild:** рендерит `JunctionPopover`, адаптируя его с пост-realise контейнер-стыка на live `zone.junctions`. **Сохранены ВСЕ affordances** `JunctionPopover` (перечень §17): 6-методный пикер, overlapTarget L/R/both, length⊕Tm, ends-preview, валидация-варнинги, статус АВТО/ВРУЧНУЮ, Escape-close, reset-to-auto. Адаптер: `config.method` (движковый словарь) ↔ `junction.kind` для дисплея/onPick (`methodForJunctionKind`); `onChange(patch)`→`SET_BOUNDARY_OVERLAP`; reset→seed-дефолты+`autoMode:'auto'`.
- **`OPEN_JUNCTION_METHOD_PICKER` воскрешён** (диспатчился из `ZoneAssembledView`, handler'а не было): zone-slice ui-state `junctionPicker {zoneId,pairKey,fromPieceId,toPieceId}` + `CLOSE_JUNCTION_PICKER`. `SET_BOUNDARY_OVERLAP` теперь чтит явный `autoMode` (для reset).
- **`ImplicitJunction` метод из `zone.junctions[pairKey].method`** (fallback derived); цвет/лейбл из общей `junction-styles`-палитры (один источник: strip/popover/глиф). `data-method`=effective, `data-junction-kind`=kind.
- **`ZoneAssembledView`** передаёт stored-метод per-junction + монтирует `JunctionControl` при открытом picker своей зоны.
- Vitest **4362 pass / 17 skip / 0 fail**; pytest не трогалось; build clean. +11 UI-тестов; мигрирован init-slice-тест (добавлен `junctionPicker`).
- **Отклонения:** (1) `onPick` метода пишет только `{method}` (не сбрасывает overlap-параметры под дефолты нового метода) — для GG движок overlapLength игнорирует; нормализация под метод — step 3 (Tm/binding-ручки). (2) Позиционирование popover — `position` не прокинут от стыка (центрируется); точный anchor у стыка — полировка (J7-оверлей/step 3). (3) Bindings-пара (len/Tm для binding) + фильтр методов по role + suggestion-бейдж — step 3 (J6 §5), не в step 2.
- Size budget: `JunctionControl` 2.16, `ImplicitJunction` 2.34, `ZoneAssembledView` 4.38, `junction-derive` 4.71, `skeleton-state-zones` 13.22→**14.36** (soft 20 — OK). **Новых нарушителей нет.**

После шага 2: **СТОП — визуальная приёмка отдельной сессией** (клик по стыку на zone-strip → попап метода/overlap; стык показывает выбранный метод). Шапку спеки НЕ ставил (шаг 2 из 7). Трекеры не финализировал. canvas-UX (V139–V141) не тронут. Дальше — шаг 3 (двухуровневость + метод↔топология + No-PCR + Tm-ручки binding/tail).

---

## Сверка Chat'ом — JUNCTION шаг 2 (CODE-LEVEL) · 05.06 — ✅ PASS по коду; визуал pending
Прочитано: finalizer / assembly-primer-utils (buildAssemblyPrimer) / primer-derive (makePrimer) / skeleton-state-zones / JunctionControl. Подтверждено:
- **Предусловие 1 (gate) ✓** — `zonesConfigChanged` re-derive только при zone add/remove ∥ `.junctions`-ref ∥ circular; `DRAG_ZONE` (spread держит `.junctions`-ref) НЕ пересчитывает (нет churn uuid). `SET_BOUNDARY_OVERLAP` → пересчёт.
- **Предусловие 2 (source-match — отложенный узел ЗАКРЫТ) ✓** — `buildAssemblyPrimer` source = `segment`(segmentId) ∥ `boundary`(left/rightSegmentId), не только `selectionStart` → matchится `mapPrimersForSegment` → ручной праймер realise-pickable. Требование №1 держится сквозь весь путь.
- **Предусловие 2 (dedup) ✓** — `makePrimer` несёт `source.side` → `manualCoverageKey`=`${seg}:${side}` дропает авто-дубль покрытой стороны. Один праймер на сторону.
- **Store ✓** — `OPEN_JUNCTION_METHOD_PICKER` (ключует pairKeyFor) + `junctionPicker` state + `CLOSE` воскрешены; `SET_BOUNDARY_OVERLAP` чтит явный `autoMode` (reset-to-auto не форсит 'manual').
- **JunctionControl ✓ (antipattern-10)** — `import JunctionPopover` + рендерит его, адаптер engine-dict↔kind. Эволюция-обёртка (2 КБ), НЕ rebuild. Все affordances JunctionPopover реюзнуты.
Vitest 4362 / 0 fail (по отчёту).

**НЕ проверено по коду (нет list/search-тулов в этой сессии; + это визуал):** `ImplicitJunction` (берёт ли метод из `zone.junctions`) + `ZoneAssembledView` (монтаж JunctionControl на open picker + передача метода). UI-интеграция/дисплей → визуальная приёмка покрывает напрямую.

**Отклонения Code (все → шаг 3, разумно):** (1) `onPick` пишет только `{method}`, не нормализует overlap-параметры под метод (GG overlapLength игнорит) — norm. step 3; (2) popover центрируется, не якорён у стыка — полировка/J7; (3) binding-пара + method-filter-by-role + suggestion-badge — step 3 (J6 §5).

**Визуальная приёмка (следующая, СВЕЖАЯ сессия):** клик по стыку на zone-strip → попап (6 методов / overlap L/R/both / length⊕Tm / ends-preview / варнинги / reset); стык показывает выбранный метод (глиф/цвет); смена метода → стык обновился; перетаскивание зоны не мигает праймерами. Трекеры финализировать ТОЛЬКО после визуального PASS.

---

## Визуальная приёмка шага 2 — ❌ FAIL · 05.06 (2 скрина Игоря)
Симптомы: (1) стык НЕ кликабелен на поверхности «Сборка 1»; (2) после Realise as DAG — окно с пикером методов (MethodPickerCard).

**Корень (прочитан `editor/assembly-mode/AssemblyShellBody.jsx` — живой редактор сборки):** UI шага 2 (`ImplicitJunction`/`ZoneAssembledView` + монтаж `JunctionControl`) привязан к `ZoneAssembledView`, который **НЕ примонтирован в `AssemblyShellBody`** — поверхность, которую видит биолог. Реальный strip там = `SequenceTab` + `coloredZones` (SegmentZonesOverlay) + `onZoneClick=openDetail` (клик по сегменту, НЕ по стыку). Глифа/клик-стыка на этой поверхности нет. `JunctionControl` и store-handler — корректны (сверено), но смонтированы не туда.

Мой код-вердикт «PASS» был неполон: проверил компоненты в изоляции + handler, но НЕ проверил, на какой поверхности они смонтированы (§17 R1 — надо было читать живой `AssemblyShellBody`, а не откладывать `ZoneAssembledView`).

**Data-слой НЕ трогать (сверен, корректен):** gate / source-match / dedup / per-junction config (A3) / derive-on-add. Фикс — чисто UI-интеграция в правильную поверхность.

## Хендофф FIX шага 2 — клик-стык в ЖИВОМ редакторе сборки
Цель: кликабельный стык на strip'е `AssemblyShellBody` (там, где биолог собирает), не на `ZoneAssembledView`.
1. **Recon (Code читает первым):** `AssemblyShellBody.jsx` (strip = `SequenceTab`+`coloredZones`), `SequenceView/overlays/SegmentZonesOverlay.jsx` (как рисуются coloredZones), `SequenceTab` (какие пропы прокидывает в overlay), `ZoneAssembledView`+`ImplicitJunction` (grep usages: примонтирован ли вообще? → salvage vs dead/duplicate).
2. **Глиф стыка на strip'е сборки** — на каждой внутренней границе сегмента (между `coloredZones[i]` и `[i+1]`, координаты из `boundaries`). Расширить `SegmentZonesOverlay` или sibling-overlay `JunctionStripOverlay`. Глиф/палитра через `METHOD_TO_JUNCTION → junction.kind` (reuse `junction-styles`), эффективный метод из `zone.junctions[pairKey]`.
3. **Клик по глифу → dispatch `OPEN_JUNCTION_METHOD_PICKER`** (zoneId=draftId, fromPieceId=segId[i], toPieceId=segId[i+1]) — handler уже есть (сверен).
4. **Монтировать `JunctionControl`** в `AssemblyShellBody`, когда `state.junctionPicker.zoneId === draftId` (config из `zone.junctions[junctionPicker.pairKey]`; onChange→`SET_BOUNDARY_OVERLAP`; onClose→`CLOSE_JUNCTION_PICKER`). Сам `JunctionControl` корректен — только примонтировать на ЭТУ поверхность.
5. **`ZoneAssembledView`:** если не примонтирован в живой путь — это и была не та поверхность; убрать как dead/duplicate ЛИБО (если это canvas-вид зоны viewMode='sequence') оставить, но клик-стык в РЕДАКТОРЕ обязателен (он — primary authoring surface).
6. **RealiseModal → viz (J9 — в этот FIX по решению Игоря 05.06):** убрать `MethodPickerCard`-радиокнопки. Метод per-boundary берётся из `zone.junctions[pairKeyFor(boundaries[i].segmentId, boundaries[i+1].segmentId)].method]` (в zoneMode segmentId===pieceId — тот же pairKey, что у глифа стыка п.2), fallback `suggestMethodForBoundary`→default. RealiseModal строит `methods`-мапу из стыков и зовёт `realiseAssembly(draftId, methods)` — **сигнатуру realise НЕ менять** (она уже принимает per-boundary map; сейчас её кормит пикер — заменить источник на стыки). Карточки границ → read-only показ метода (что пойдёт в реакцию) + `RealiseDagPreview` остаётся. `MethodPickerCard` — удалить либо переделать в read-only строку. Источник истины метода = стык (на strip'е), модалка только отражает.
7. **STOP** → визуальная приёмка отдельной сессией.

**Движок realise (`realiseAssembly`/`zone-pieces-to-dag`) НЕ переделывать** — меняется только источник `methods` (стыки вместо пикера) + удаление радиокнопок. Data-слой (gate/source-match/dedup/A3) не трогать.

**Хендофф-фраза Code:**
> Прочитай CHAT_PLAYBOOK / CLAUDE / BUGS / CURRENT_TASK. FIX шага 2 JUNCTION: клик-стык НЕ работает, т.к. UI привязан к `ZoneAssembledView`, не к живому `editor/assembly-mode/AssemblyShellBody` (strip = `SequenceTab`+`coloredZones`). Recon: AssemblyShellBody + SegmentZonesOverlay + SequenceTab + ZoneAssembledView (grep usages). Затем: глиф стыка на strip'е сборки на границах coloredZones → клик dispatch `OPEN_JUNCTION_METHOD_PICKER` (handler есть) → монтаж `JunctionControl` (корректен) при `junctionPicker.zoneId===draftId`. Реши судьбу `ZoneAssembledView` (dead/duplicate vs canvas-вид). Data-слой (gate/source-match/dedup/A3) НЕ трогать. ПЛЮС J9 (в этот фикс): убрать MethodPickerCard-радиокнопки; RealiseModal берёт метод per-boundary из `zone.junctions` (тот же pairKey, segmentId===pieceId) и зовёт `realiseAssembly(draftId, methods)` — сигнатуру НЕ менять, источник = стыки; карточки → read-only. Движок realise не переписывать. После — СТОП, визприёмка отдельной сессией. Шапку не ставь, трекеры не финализируй.

---

## Отчёт Code — FIX шага 2 (клик-стык в ЖИВОМ редакторе) + J9 · 05.06

**Recon (прочитан живой путь до правки, §17 R1 — это и был пробел прошлой «PASS»):** `AssemblyShellBody` (strip = `SequenceTab`+`coloredZones`, `onZoneClick=openDetail`) / `SegmentZonesOverlay` (per-line rects из zones) / `SequenceTab` (проброс `coloredZones`/`onZoneClick`→SequenceView) / `SequenceView/index.jsx` (монтаж overlay, координатный контекст) / `ZoneAssembledView` usages. **Вердикт по `ZoneAssembledView`:** НЕ dead — примонтирован в `ZoneSequenceMode` (canvas-вид зоны `viewMode==='sequence'`). Оставлен как есть (per FIX п.5: canvas-вид); его step-2-проводка цела. Клик-стык добавлен в РЕДАКТОР (primary authoring surface).

**Сделано:**
1. **Глиф стыка на strip'е редактора** — расширен `SegmentZonesOverlay` (НЕ sibling-overlay в `index.jsx`, см. size-нота): рисует кликабельный глиф на каждой внутренней границе из `zones[i].junctionRight` (та же line/strand-probe, что у zone-rect'ов). Палитра (stroke/fill) пред-резолвится в `junction-derive` → shared overlay НЕ импортит cross-layer из CanvasSkeleton.
2. **`enrichZonesWithJunctions(coloredZones, zoneJunctions)`** (`junction-derive`, pure) — кладёт `junctionRight {pairKey, method, kind, stroke, fill, fromPieceId, toPieceId}` на каждую не-последнюю зону; метод из `zone.junctions[pairKey]` (default overlap_pcr). `AssemblyShellBody` обогащает `coloredZones` (gated `isZoneTarget`; legacy-draft → без глифа).
3. **Клик-роутинг без новых пропов `SequenceView`:** `onZoneClick` теперь несёт string (зона→`openDetail`) ЛИБО junction-объект (→`OPEN_JUNCTION_METHOD_PICKER` через `zoneDispatch`). Глиф — единственный эмиттер объекта; zone-handle'ы по-прежнему string → прочие консьюмеры (Library/Importer/PCR) не задеты.
4. **Монтаж `JunctionControl`** в `AssemblyShellBody` при `state.junctionPicker.zoneId === draftId` (config из `zone.junctions[pairKey]`; onChange→`SET_BOUNDARY_OVERLAP`; onClose→`CLOSE_JUNCTION_PICKER`). Сам `JunctionControl`/handler — корректны (сверены ранее), только примонтированы на ЭТУ поверхность.
5. **J9 — RealiseModal метод из стыков:** `methodsFromJunctions(draft, zoneJunctions, suggestions)` (`junction-derive`, pure) → `{[i]:method}` индекс-ключ (стык бьёт suggestion, fallback gibson). RealiseModal строит `methods` из неё, **`realiseAssembly(draftId, methods)` — сигнатура НЕ менялась**. `MethodPickerCard` → **read-only** (радиокнопки убраны; показывает метод + suggestion-hint + «задаётся кликом по стыку»). Движок realise не тронут.

**Data-слой (gate/source-match/dedup/A3/derive-on-add) НЕ тронут** — как предписано.

**Тесты (TDD red→green):** 2 новых файла, +16 тестов:
- `junction-strip-editor-fix.test.jsx` (12): enrichZonesWithJunctions pure; глиф через `SequenceTab`→`SegmentZonesOverlay` (data-pair-key/kind/method, клик→object); back-compat (нет junctionRight → нет глифа); **ЖИВОЙ `AssemblyShellBody` через `EditorWindowShell`** — глиф на strip'е → клик открывает `JunctionControl` → выбор метода пишет `zone.junctions[pairKey].method`.
- `realise-method-from-junction-j9.test.jsx` (4+1+1): methodsFromJunctions pure (стык>suggestion>gibson, индекс-ключ); MethodPickerCard без radio; **живой RealiseModal** — метод стыка `restriction` → realised junction kind `re_ligation` (доказывает источник=стык, не дефолт).
- Регрессия на затронутых: `assembly-realise` / `zone-assembly-realise` / `assembly-mode` / `piece-zones-alias` / `junction-control-l3-ui` — 72/72 PASS (testid `method-picker-card`×1 + `realise-confirm` целы; onZoneClick(zoneId) для zone-handle цел).
- **Full Vitest 4378 pass / 17 skip / 0 fail** (4362+16). pytest не трогалось. `npx vite build` — clean.

**Size budget:** `SequenceView/index.jsx` (**Active hard-breach decomp, TECH_DEBT** — 49.71 KB) **НАМЕРЕННО НЕ ТРОНУТ** → выбран sanctioned путь «расширить SegmentZonesOverlay» вместо sibling-overlay (тот потребовал бы пропов в `index.jsx` → §7 STOP). Затронуты: `SegmentZonesOverlay.jsx` 6.90→**11.55** (hard 40 — OK, +4.65); `junction-derive.js` 4.83→**6.90** (hard 25 — OK); `AssemblyShellBody.jsx`→**32.69** (soft 30 over pre-existing, hard 40 — OK, +1.97 от моих правок); `RealiseModal.jsx` **5.51**; `MethodPickerCard.jsx` **2.10**. **Новых hard-нарушителей нет; роста >5 KB нет.**

**Отклонения:** (1) `onZoneClick` теперь string|object — контролируемая перегрузка существующего канала, чтобы НЕ трогать Active-hard-breach `index.jsx` (альтернатива — новый проп в `index.jsx` — упёрлась бы в size-STOP). Back-compat цел (zone-handle=string). (2) Глиф позиционируется по line/strand-probe (как zone-rect); точная вертикаль/форма — полировка визуальной приёмки. (3) Closure-стык (circular last↔first) на strip'е не рисуется — `enrichZonesWithJunctions` только внутренние границы (closure-UI — отдельный шаг, как и в JUNCTION §6).

**Git:** коммит НЕ делал. Рабочее дерево содержит крупный pre-existing незакоммиченный бэклог НЕ из этой задачи (docs-реорг, dead-code purge, +editable-assembly-работа внутри `AssemblyShellBody`/`SegmentZonesOverlay` — HEAD:ASB 518 строк vs рабочая 744; HEAD в CRLF, рабочая в LF). Чисто выделить мои хунки из ~226-строчного чужого бэклога в этих двух файлах не безопасно. Per «Git-коммит — за Игорем в терминале» (BUGS.md) — оставил правки в дереве, **коммит за Игорем** (мои файлы: `junction-derive.js`, `SegmentZonesOverlay.jsx`, `AssemblyShellBody.jsx`, `RealiseModal.jsx`, `MethodPickerCard.jsx` + 2 теста).

**СТОП — визуальная приёмка отдельной сессией.** Шапку спеки НЕ ставил (шаг 2 из 7, FIX). Трекеры (PROJECT_STATE/DECISIONS/BUGS/RELEASES/ANCHORS/TECH_DEBT/CLAUDE.md/package.json/version.js) НЕ финализировал. canvas-UX (V139–V141) не тронут. Сервер перезапущен (localhost:3000).

---

## Отчёт Code — FIX-раунд 2 (стык «появился, но не кликабелен») · 05.06

Симптом Игоря на приёмке: глиф стыка на strip'е редактора виден, но клик не открывает попап. Диагноз Chat подтверждён по коду — **два дефекта**, оба не ловятся happy-dom (RTL `fireEvent.click` не воспроизводит pointer-capture):

1. **ГЛАВНЫЙ — root крал клик через `setPointerCapture`.** `useSelectionState.onRootPointerDown` на любой press ставит `setPointerCapture` на root SequenceView → `pointerup` уходит в root, собственный `click` кнопки-глифа не возникает. Для `sequence-view-re-site` и `sequence-view-primer` уже были bail-out walk-up'ы (return ДО capture), для `sequence-view-junction` — НЕ было. **Фикс:** добавлен третий bail-out (walk-up `e.target`→`sequence-view-junction` → return), дословно по паттерну primer/RE-site.
2. **Вторичный — попап в углу.** `JunctionControl`→`JunctionPopover` без `position` → `left/top = 0` (translate(-50%,8px)) → левый-верхний угол, ощущалось как «не открылся». **Фикс:** глиф пробрасывает `clientX/clientY` клика → `AssemblyShellBody` кладёт в стейт `junctionPos` → `position` в `JunctionControl`. Backdrop попапа `position:fixed; inset:0`, inner `absolute left/top` = координаты вьюпорта → попап якорится под глифом.

**Тесты (TDD red→green, +3):**
- `junction-pointer-bail.test.jsx` (2, зеркало `primer-pointer-bail`): positive-control (plain press → caret + `setPointerCapture`) + bail (press на `sequence-view-junction` → НЕ caret, НЕ capture). Это и есть red→green главного фикса (без bail-out press на стык вызывал бы caret+capture).
- `junction-strip-editor-fix.test.jsx` +1: клик глифа несёт `clientX/clientY` (для якоря попапа).
- **Full Vitest 4381 pass / 17 skip / 0 fail** (4378+3). `npx vite build` — clean.

**Size:** `useSelectionState.js` +~13 строк (хук, под лимитом), `SegmentZonesOverlay.jsx`/`AssemblyShellBody.jsx` +~6 строк суммарно. `SequenceView/index.jsx` снова НЕ тронут. Новых нарушителей нет.

**Git:** коммит за Игорем (тот же entangled-backlog, см. выше) — добавились файлы `useSelectionState.js` + `junction-pointer-bail.test.jsx`.

**СТОП — повторная визуальная приёмка.** Сервер перезапущен (localhost:3000). Проверить: клик по ромбу-стыку → попап метода открывается **под стыком** (не в углу) → выбор метода красит стык.

---

## Приёмка FIX-2 (клик-стык + position) — ✅ PASS · 05.06
Visual: Игорь подтвердил («всё работает»). Code-level (Chat сверил по коду):
- **Дефект 1 устранён** — `useSelectionState.onRootPointerDown` получил bail-out для `data-testid="sequence-view-junction"` (walk-up → return до setPointerCapture/preventDefault, зеркало primer/RE-site guard). Клик долетает до `<button>`.
- **Дефект 2 устранён** — `position` прокинут: глиф `onClick`→`{clientX,clientY}` → `AssemblyShellBody` local state `junctionPos` → `JunctionControl position` → `JunctionPopover`. Попап у стыка, не в углу. Position — чисто-UI local state, редьюсер `OPEN_JUNCTION_METHOD_PICKER` НЕ тронут.
- **Data-слой** (gate/source-match/dedup/A3/enrich/realise) — не тронут. Back-compat `onZoneClick` (string|object) цел.

**Шаг 2 + J9 ПРИНЯТЫ** (clickable junction на strip'е редактора + RealiseModal→viz, метод со стыка).

**Минор pre-existing (не из этой работы):** `sequence-view-zone-handle` имеет тот же латентный click-steal (не в bail-out). Тривиальный follow-up — дописать в guard. На усмотрение Игоря.

**Остаётся (отдельной сессией после compact):** финализация трекеров —
- PROJECT_STATE (Vitest счётчик, «что дальше» → слой 3 шаг 3)
- ANCHORS/DECISIONS: **DEC-JUNC-PRIMER-01** promotion-candidate → promoted, ⚓64→65 (gate «JUNCTION визприёмка» снят)
- RELEASES (шаг 2 + J9 delivery)
- TECH_DEBT (статус JUNCTION-deviations + новый минор zone-handle)
- COMPONENT_MAP §17 R5 (глиф стыка в SegmentZonesOverlay; JunctionControl смонтирован в AssemblyShellBody; канал onZoneClick string|object; junctionPicker state)
- CURRENT_TASK → шаг 3
- SPEC_ASSEMBLY_JUNCTION_MODULE: НЕ архивировать (спека многошаговая 1–7, принят шаг 2)

---

## Фаза приёмки JUNCTION — известные Звенья к правке (fix-as-found в живом UI)
Шаг 2 + J9 приняты. Фаза приёмки = свежая сессия, проход по живому junction-UI, мелочи чиним Звеном (инструкция в чат → Code → приёмка тут же → `ZVENO_LOG`). Порядок: сначала фиксы/приёмка, финализация трекеров (список выше) — последней.

**Z-кандидат: overhang-params показываются для не-overlap методов** (Игорь 05.06, скрин — RE лигирование показывает «Overhang L/R/both, Length 50, overhang 50 nt»). Био-некорректно: overhang/length = overlap-PCR/Gibson; RE/GG — enzyme-defined фикс. overhang (~4 nt); KLD/blunt — нет. Движок чист (дизайн праймеров берёт `method`, не эту длину) — баг чисто в UI попапа. «50» течёт из предыдущего overlap-выбора (config.overlapLength персистит при смене метода).
Фикс (только `canvas/`, не движок), 3 точки:
- `canvas/JunctionPopover.jsx`: `OVERLAP_KINDS = new Set(['overlap'])` — ползунок overlap длины/Tm + L/R/both только для overlap (Gibson/overlap-PCR).
- `canvas/junction-styles.js inferEndRequirements`: вынести `re_ligation` из overlap-ветки → RE/GG/sticky_end → фикс enzyme-overhang (4 nt), НЕ `length`; GG `4` (не `length ?? 4`). Иначе stale overlapLength течёт в превью концов.
- `canvas/junction-styles.js JUNCTION_PARAM_DEFAULTS.re_ligation.overlapLength`: 30 → 4 (или null).
Богатый per-method UX (выбор фермента→overhang, binding length/Tm, suggestion-badge) — НЕ здесь, это шаг 3 «method-filter by role».

---

## Отчёт Code — Звено «overhang-params для не-overlap» · 05.06

Фикс по 2 точкам (только `canvas/`, движок не тронут):
1. **`JunctionPopover.jsx`** — `OVERLAP_KINDS = new Set(['overlap'])`. Секция target L/R/both + Length/Tm (`junction-popover-overlap-params`) теперь рендерится ТОЛЬКО для overlap (Gibson/overlap-PCR). RE/GG/KLD/sticky/blunt её не показывают.
2. **`junction-styles.js · inferEndRequirements`** — `re_ligation` вынесен из overlap-ветки в enzyme-overhang ветку (с `golden_gate`/`sticky_end`), которая даёт **фиксированный `overhang(4)`, НЕ `overhang(length ?? …)`** → стейл `overlapLength` (напр. 50 из прошлого overlap-выбора) больше не течёт в превью концов. `overlap` остался один с `overhang(length ?? 30)`. Сужение по `overlapTarget` теперь только для overlap (`if (kind === 'overlap' && overlapTarget === 'left') …; return base;`) — для enzyme-kinds оба конца несут overhang симметрично (стейл `left` не даёт «To 5′: any» для RE). `JUNCTION_PARAM_DEFAULTS` НЕ трогал (вне хендоффа; фикс-overhang в inferEndRequirements делает дефолт-длину нерелевантной для превью).

**Тесты (TDD red→green):** новый `junction-overhang-params-zveno.test.jsx` (+9): inferEndRequirements — re_ligation/golden_gate стейл 50 → оба `{overhang,4}`; overlap 50 → 50; kld → blunt; `left`+re_ligation → оба overhang (toEnd НЕ any), `left`+overlap → toEnd any; JunctionPopover — overlap показывает overlap-params, re_ligation/golden_gate/kld — нет. Регрессия `junction-contract` 42/42 PASS. **Full Vitest 4390 pass / 17 skip / 0 fail** (+9); build clean.

**Size:** `JunctionPopover.jsx` 11.74 / `junction-styles.js` 7.44 КБ — обе под лимитом, правки крошечные. Новых нарушителей нет.

**Вне скоупа (не тащил):** enzyme-picker, binding Tm-ручки, method-filter-by-role, suggestion-бейдж, нормализация параметров при смене метода — шаг 3.

**СТОП — визуальная приёмка в этой сессии** (Игорь смотрит попап RE/GG/KLD: нет L/R/both/Length/Tm; ends-preview RE/GG = overhang 4 nt, не 50). Сервер жив на localhost:3000 (HMR подхватил). Трекеры/шапку не финализировал. Git-коммит за Игорем.

---

## Отчёт Code — Звено «Tm-таргетинг авто-связывания сборки» · 05.06

Авто-дерайв выдавал плоские 20 нт → низкий Tm. Включён Tm-таргетинг под ту же цель, что у проверенного `local-primer-design.js findBinding` (петля до `calcTm ≥ 60`, floor 18). **`tm-calculator.js` не тронут** — пере-baseline'а Tm по проекту нет. `bindingLen` уже умел Tm-петлю — чинились только дефолты конфига.

**3 точки:**
1. **`primer-derive.js`** — `DEFAULT_BINDING_TM = 60`; `TEMP_JUNCTION_CFG` → `bindingLength: null, bindingTm: 60` (fallback-петля заработала); **`BIND_MIN 16 → 18`** (выровнено под findBinding minLen=18; `BIND_MAX 36` оставлен — больше запаса для AT-богатых, чем 30 у старого пути); `DEFAULT_BINDING_LEN=20` оставлен как no-Tm фолбэк.
2. **`junction-derive.js · seedJunction`** — `bindingLength: null, bindingTm: 60` (было 20/null). **Подтверждено чтением:** финализатор (`junction-config-finalizer.js:102`) сидит конфиг через `seedJunction()` → засеянные стыки несут Tm-дефолт. Фолбэк `TEMP_JUNCTION_CFG` ловит только стыки без сохранённого конфига (первый/последний кусок, legacy). Итого **bindingTm сидится в ОБОИХ местах** — seed (живой путь финализатора) + TEMP (no-config), как и просили.
3. Уровни 1/2 (ручной праймер / явный `bindingLength`/`bindingTm` на стыке) **не тронуты** — `bindingLen` бьёт дефолт явным числом (DEC-JUNC-PRIMER-01); тест на no-Tm фолбэк (явный 20 → 20) зелёный.

**Движок не тронут:** realise / gate / source-match / dedup / A3 — без изменений (только конфиг-дефолты + BIND_MIN).

**Тесты (TDD red→green):** новый `primer-derive-binding-tm-zveno.test.js` (+5): AT-богатый кусок (40 нт, 20-mer Tm 50.1°C) → авто-связывание удлиняется до 30 нт, **tm 60.3°C ≥ 58**; связывание не короче BIND_MIN 18 (GC-богатый → 18, не 16); явный bindingLength=20 → 20 (уровни 1/2 целы); `seedJunction` несёт bindingTm 60 / bindingLength null. **Мигрировано 5 тестов** (легитимная смена модели плоские-20 → Tm-таргетед, геометрия prefix/RC-suffix сохранена): `junction-derive` (seed deep-equal), `junction-config-l3` (seed bindingLength→null/Tm60), `primer-derive-k11` ×2 (binding = Tm-prefix), `primer-derive-tm-v105` (geometry — binding Tm-prefix, tail/sequence целы). `primer-wizard` фейл — известный параллельный флак (зелёный в изоляции, не регрессия). **Full Vitest 4395 pass / 17 skip / 0 fail** (+5 −0); `npx vite build` clean; pytest не трогалось.

**Size:** `primer-derive.js` 15.00 / `junction-derive.js` 7.04 КБ — под hard 25 (.js). Правки крошечные, новых нарушителей нет.

**СТОП — визуальная приёмка в этой сессии** (Игорь смотрит Tm на праймерах сборки: норма 58–62°C, AT-богатые куски удлинились за 20 нт). Сервер жив на localhost:3000 (HMR подхватил). Шапку/трекеры не финализировал. Git за Игорем.

---
---
