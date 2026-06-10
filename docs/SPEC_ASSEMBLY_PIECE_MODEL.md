# SPEC_ASSEMBLY_PIECE_MODEL — фрагмент, де-гэп, добыча куска (synthetic-insert + RE-two-route)

**Статус:** 🟡 черновик / к реализации
**Тип:** A (архитектура + алгоритм + рефактор)
**Создано:** 2026-05-29 · **переписано 2026-06-04** (freshness; согласование с 4-спечным набором, в т.ч. `SPEC_CANVAS_LIVE_PROJECTION`; уточнён контракт `acquisitionMethod` с JUNCTION_MODULE; устаревший handoff заменён). Источник — 29.05-версия, не дословно.
**Роль:** что такое фрагмент сборки и как добывается — апстрим стыков. Убирает gap как сущность; вводит единый synthetic-insert путь (матричный vs олигный) и RE-two-route; фиксирует «без backbone». Кормит куски + `acquisitionMethod` модулю стыка (`SPEC_ASSEMBLY_JUNCTION_MODULE`), движку (`SPEC_PRIMER_TAIL_UNIFICATION`) и граф-проекции (`SPEC_CANVAS_LIVE_PROJECTION`, которая рисует куски/тип добычи).
**Сквозные решения и порядок — см. МАСТЕР-ОБЗОР в `SPEC_PRIMER_TAIL_UNIFICATION`.**

> **Степень верификации (честно):** §1-утверждения помечены `[recon 04.06]` (подтверждено чтением кода 04.06: `zone-pieces-to-dag::draftFromZone`, `primer-derive`, `auto-group-pipeline`) либо `[29.05]` (из исходной сессии, `assembly-model`/`AssemblyShellBody`). Файлы со знаком «?» в §0 **никем не читаны** — Code **обязан** прочесть до реализации и подтвердить механику. Я проектирую на уровне дизайна, не выдумывая внутренности непрочитанного.

---

## §0. Срез размеров зоны правки

| Файл | Оценка | Лимит | Статус |
|---|---|---|---|
| `components/CanvasSkeleton/lib/assembly-model.js` | ~9 KB | .js 25/20 | ok (де-гэп: `makeManualSegment`/`computeAssemblySequence`) [29.05] |
| `components/CanvasSkeleton/lib/piece-model.js` | ? | .js 25/20 | **Code читает** (kind/acquisition) |
| `components/CanvasSkeleton/lib/piece-authoring.js` | ? | .js 25/20 | **Code читает** (кусок из выделения, `primerPairId` raw) |
| `components/CanvasSkeleton/lib/piece-mutations.js` | ? | .js 25/20 | **Code читает** (`applyPieceMutations`) |
| `components/CanvasSkeleton/lib/snippet-catalog.js` | ? | .js 25/20 | **Code читает** — каталог элементов (реюз P7) |
| `components/CanvasSkeleton/lib/assembly-edit-router.js` | ? | .js 25/20 | **Code читает** — known-gap-логика (де-гэп: `targetKind==='gap'`) |
| `components/CanvasSkeleton/editor/assembly-mode/RangePickerModal.jsx` | ? | .jsx 40/30 | range/RE-picker (V89 `acquisitionMethod`) |
| `components/CanvasSkeleton/editor/assembly-mode/AssemblyShellBody.jsx` | ~12 KB | .jsx 40/30 | `onPasteSequence`/`insertManualSegment`/`onSequenceEdit` [29.05] |
| `components/OligoManager.jsx` (v0.5) | ? | .jsx 40/30 | возможный харвест для олигного UI (Code оценивает) |

Точные KB — Code перемеряет. Файлы «?» Code читает до реализации (CHAT_PLAYBOOK §0/pre-spec). **common-features (02.06: feature-detection decomp, Dexie v6) с этими файлами не пересекается ожидаемо — Code подтверждает, что де-гэп не задевает merge-путь фич.**

---

## §1. Контекст — текущая модель куска

**Сейчас:**
- Сегмент сборки — discriminated union по `source`: `container` (`makeSourcedSegment`: start/end/rc, кэш-последовательность+аннотации), `manual` (`makeManualSegment`), `imported` (`makeImportedSegment`). Последовательность **замораживается** при insert/range/RC; `computeAssemblySequence` конкатит кэши. `[29.05]`
- **Gap = `manual` с пустой последовательностью + явной длиной + `gapKind`/`gapLabel`**; `computeAssemblySequence` заливает `'N'×length`; `deriveAutoPrimers` пропускает (`SKIPPED_KINDS={snippet,gap}` `[recon 04.06]`); `segLabel` имеет ветку «Gap»; вставка `onPasteSequence`→`insertManualSegment` (V83 known-gap = `gapSequence` verbatim); `onSequenceEdit`/`assembly-edit-router` имеют `targetKind==='gap'`. `[29.05; assembly-edit-router — не читан]`
- **`draftFromZone` различает kind** `sourced/gap/snippet/synthesis/intermediate` и мапит на сегменты (segment.id = piece.id). `[recon 04.06]`
- **`acquisitionMethod` на куске уже есть (V89):** RE-пикер ставит `'restriction'`; `auto-group-pipeline` allRestriction → `restriction`; junction-дефолт реагирует. `[recon 04.06: auto-group-pipeline]`
- **`acquisitionParams.primerPairId`** — ПЦР-кусок несёт пару праймеров (raw `{forward,reverse}`); движок игнорирует (ENGINE A4). `[recon 04.06: zone-pieces-to-dag]`
- **Встраивание короткого** — `insertSnippet({embedsInPrimer:true})`, kind `snippet`; порога по длине нет, гейт по `kind`. `[29.05]`
- **`snippet-catalog.js`** существует — инфра «библиотеки элементов». `[не читан]`
- **Backbone** — деления вектор/вставка в модели нет; сегменты симметричны. Igor: так держать. `[29.05]`

**Модель Игоря (29.05):**
- Вход — фрагмент линейный/кольцевой, третьего нет. База из range/RE-реза/ПЦР линейна; GG ест кольцевые напрямую.
- Gap как сущность не нужен — настоящего «неизвестного» в дизайне нет: либо знаешь последовательность (вставляешь), либо это определённая вставка через праймеры/олиги.
- Вставка курсор+хоткей: любой ген (предполагается существующим); концам — праймеры **или** RE.
- Стык/вставка в праймер: ≤~80 нт → один праймер; ~80–120 → два олиго с длинными хвостами (синтез, если доступен); либо отожжённая пара (дуплекс с липкими/комплементарными концами).
- Два смысла «двух олиго»: (b1) отжиг на матрицу с длинными хвостами = обычный ПЦР-кусок; (b2) отжиг друг на друга = дуплекс без матрицы.
- Отожжённая пара (c) — обычно руками или из каталога «запомненных элементов» (6×His и т.п.); не новый kind.
- Backbone нет — фрагмент; ori-агностично (кольцо без ori разрешено).
- RE-вариант, два этапа линейного с липкими: (a) прямой рез источника; (b) сайт-в-праймер → ПЦР → рез.

**Разрывы (что закрывает спека):** убрать gap-сущность; единый synthetic-insert путь (физтипы + под-варианты + пороги + каталог); RE-two-route по совместимости оверхенгов + направленность + авто-нудж; явное «без backbone».

---

## §2. Стратегия

Свести добычу куска к двум физическим типам — **матричный** (есть source → ПЦР/рез) и **олигный** (нет матрицы → synthetic-insert из олиго/каталога/руками) — без новых сущностей-«route». Длина и метод соединения определяют **как** олигный кусок делается (под-вариант), не отдельный kind. Gap удаляется целиком по карте. Backbone не вводим — фрагмент симметричен. RE-добыча реюзит `acquisitionMethod='restriction'` + `inferEndRequirements` (совместимость оверхенгов). Каталог — существующий `snippet-catalog`. Реюз v0.5 `OligoManager`, если харвестируемо. Не дублировать (§17/antipattern 8).

---

## §3. Scope

**IN:**
- **Де-гэп:** убрать gap-сущность; `manual` всегда несёт реальную последовательность; рефактор по карте (P1).
- **Без backbone:** фрагмент симметричен, ori-агностичен; убрать следы destination/вектор-роли (P2).
- **Физтипы:** матричный vs олигный — модель добычи (P3).
- **Единый synthetic-insert:** под-варианты (1 праймер / 2 взаимо-отжигаемых / отожжённая пара / руками / каталог) + пороги 80/120 + маршрут = длина × метод-соединения (P4).
- **Вставка курсор+хоткей:** любой ген, концам праймеры/RE (P5).
- **RE-two-route:** (a) прямой рез / (b) сайт-в-праймер; совместимость оверхенгов; направленность; авто-нудж (P6).
- **Каталог элементов:** реюз `snippet-catalog` (P7).

**OUT:**
- Дом конфига стыка + UI + двухуровневость + метод↔топология + валидация → `SPEC_ASSEMBLY_JUNCTION_MODULE` (даём `acquisitionMethod`/тип куска, оно решает дефолт/подсказку стыка J3/J5).
- Движок хвостов/праймеров + V131 RE-хвост + Tm-binding/Tm-tail → `SPEC_PRIMER_TAIL_UNIFICATION` (RE-route (b) тащит V131-фикс; встраивание короткого P4(a) исполняет ENGINE A5 через `pieceSequence`).
- **Отрисовка куска/типа добычи на граф-проекции → `SPEC_CANVAS_LIVE_PROJECTION`** (потребляет `acquisitionMethod`/тип для тира Piece).
- Мутация по курсору в полосе (editable-assembly — отдельно; потребляем `applyPieceMutations`).
- Дизайн UI каталога, если нужен новый — минимально; реюз пикера.

---

## §4. Архитектурные решения

**P1. Де-гэп — убрать gap как сущность.**
- Настоящего «неизвестного гэпа» в дизайне нет (в неизвестное плечо праймер не сядет). Удаляем.
- `manual`-сегмент **всегда** несёт реальную `sequence` (непустую). Поля `gapKind`/`gapLabel`/«пустая+`length`» — убрать.
- **Карта рефактора** (Code проходит пунктно):
  - `assembly-model.js`: `makeManualSegment` — убрать gap-ветку (`hasSeq?''`/`gapKind`/`gapLabel`), требовать `sequence`. `computeAssemblySequence` — убрать `'N'×length` заливку (последовательность есть; кейс «контейнер удалён» = `orphans`/`unavailable` остаётся — НЕ gap). `segmentLength` — упростить (всегда из `sequence`).
  - `primer-derive.js`: `SKIPPED_KINDS` — убрать `gap`. (`snippet` — короткий теперь встраивается по флагу/длине, P4/ENGINE A5 → вероятно `SKIPPED_KINDS` исчезает, встраивание решается явным флагом куска; согласовать с ENGINE.)
  - `AssemblyShellBody.jsx`: `segLabel` без Gap; `onPasteSequence`→`insertManualSegment` без `gapSequence`/V83 known-gap (обычная вставка реальной последовательности); `onSequenceEdit` без `targetKind==='gap'`.
  - `assembly-edit-router.js` (**Code читает первым** — known-gap-логику никто не видел): размотать `update-inline` с `gapSequence`/`gapLength`/`gapHint`, `targetKind==='gap'`.
  - Тесты gap — переписать/удалить.
- Кейс «гэп известной длины, неизвестная последовательность» — не поддерживаем (дизайнить нечего).

**P2. Без backbone — фрагмент симметричен.**
- Деления вектор/вставка нет; есть **фрагмент**. Ori — модель не волнует (кольцо без ori разрешено).
- Убрать следы destination/backbone-роли, если всплывут (Code проверяет `piece-model`/`OpGroupPicker`/realise на backbone-центричность). Операции симметричны (давнее решение — теперь явно).
- Для RE-directional (P6) — «какой оверхенг на каком **конце** фрагмента», без понятия «вектор»: направленность через концы.

**P3. Два физических типа добычи.**
- **Матричный** — есть source (контейнер/импорт/геном): ПЦР (`acquisitionMethod='pcr'`, несёт `primerPairId`) или рестрикция (`'restriction'`, P6). Существующий `sourced`/container + range. Длинный ген → ПЦР (свой ампликон, концам overlap/RE).
- **Олигный** — нет матрицы; задан олигами/последовательностью: synthetic-insert (P4). Короткий (синтез/праймер).
- **Не новые kind**, а ось `acquisition` поверх `source`-типов: `acquisitionMethod ∈ {pcr, restriction, direct, synthesis, undefined}` (часть есть, V89). Олигный = `synthesis`/`direct` + sub-вариант (P4).
- **Контракт `acquisitionMethod` — общий с JUNCTION_MODULE (J3/J5) и CANVAS (тир Piece).** Имена/значения (`pcr`/`restriction`/`synthesis`/`direct`/`undefined`) — единый словарь; согласовать ДО параллельной реализации (риск 7). JUNCTION_MODULE читает для дефолта стыка/No-PCR-форса; CANVAS — для отрисовки тира.
- **⚠️ Freshness-свип 05.06 (`ov-pcr`): живой four-tier enum шире словаря спеки.** PROJECT_STATE-снимок числит `piece.acquisitionMethod` шестизначным — `'pcr'|'restriction'|'ov-pcr'|'synthesis'|'direct'|'undefined'` (DEC-CANVAS-4T-01); P3-словарь (5 значений) **роняет `ov-pcr`**, т.к. overlap — junction-join-метод (`zone.junctions[pairKey].method='overlap_pcr'`), НЕ piece-acquisition. **Это намеренно** (развод оси добычи и оси соединения, ENGINE §9a). Code при чтении `piece-model.js` (§0 «?») подтверждает наличие `ov-pcr` и **мигрирует**: куски `acquisitionMethod==='ov-pcr'` → `'pcr'` (acquisition) + overlap в `zone.junctions[pairKey].method`; проверить, что T8 auto-reaction-триггер (`acquisitionMethod != undefined/direct/synthesis`) не сломан (`'pcr'` триггерит как раньше). Оставить `ov-pcr` — только с явным обоснованием. JUNCTION J3/J5 + CANVAS C2 ссылаются на этот P3-дом — их править НЕ нужно (словарь исправлен в доме).

**P4. Единый synthetic-insert путь (олигный) — под-варианты, не сущности.**
- Один путь «вставить синтетический кусок»; физреализация — под-вариант по длине × методу соединения, биолог правит:
  - **(a) встраивание в один праймер** — короткое (≤ `INSERT_PRIMER_MAX` ≈ **80** нт) встраивается в хвост соседнего ПЦР-праймера (`embedsInPrimer`), без своего ампликона. ENGINE A5 исполняет через `pieceSequence`.
  - **(b2) два взаимо-отжигаемых олиго** — ~80–`INSERT_TWO_OLIGO_MAX` ≈ **120** нт («синтез доступен»): два олиго, комплементарных **друг другу** с перекрытием; дуплекс из перекрытия (мини-OE/анилинг), матрицы нет. (b1 «отжиг на матрицу с длинными хвостами» — НЕ это, это матричный ПЦР-кусок, P3.)
  - **(c) отожжённая пара (готовый дуплекс)** — короткий дуплекс с **определёнными концами** (липкие/тупые), концы завязаны на метод стыка (гайд-РНК-кассета: оверхенги под Type IIS вектора, лигирование). Руками (`manual` с реальной последовательностью, P1) или из каталога (P7). НЕ отдельный kind.
  - **руками** — обычный `manual` с введённой последовательностью; концам праймер/RE/overlap по соседнему стыку.
- **Маршрут = длина × метод-соединения × (встроен в праймер соседа | отдельный дуплекс)**, не отдельные сущности.
- Пороги `INSERT_PRIMER_MAX=80`, `INSERT_TWO_OLIGO_MAX=120` — **заменяют** прежний `SNIPPET_MAX_LEN=60`. >120 без матрицы → синтез целиком / не олигный путь. Авто-предложение под-варианта по длине+методу соседа; биолог правит (рекомендации, не жёстко).
- Концы синтетического куска и метод стыка — общий механизм модуля стыка (overlap/RE/lig), как у любого куска. (c) с липкими → соседние стыки sticky/лигирование.

**P5. Вставка курсор+хоткей.** Курсор в вивере → хоткей → последовательность любого гена (предполагается существующей). Кусок добавляется `sourced`/`manual` (матричный если source; иначе manual с реальной последовательностью). Концам — праймеры (overlap) **или** RE (P6), решает дефолт стыка (JUNCTION_MODULE). Реюз `insertSnippet`/`insertManualSegment`/range; не плодить новый.

**P6. RE-two-route добыча.**
- Кусок получен рестрикцией → липкий конец. При добавлении соседа авто-**предлагаем** дать ему совместимый конец, двумя путями (per side):
  - **(a) прямой рез** — у источника соседа уже есть сайт с **совместимым оверхенгом** в нужном месте → режем, без праймера. `acquisitionMethod='restriction'`.
  - **(b) сайт-в-праймер** — ПЦР соседа праймером с хвостом=RE-сайт (+protective **снаружи**, V125) → рез. Двухэтапно. Route (b) тащит **V131-фикс RE-хвоста** (ENGINE A2/V131) — до фикса RE-хвост неверен.
- **Совместимость — по оверхенгам, не имени энзима** (изошизомеры/совместимые липкие, BamHI↔BglII). Матч по совместимости оверхенга (`inferEndRequirements`/end-сравнение).
- **Направленность:** «какой оверхенг на каком конце» (5′/3′). Один энзим/одинаковый оверхенг с обеих сторон → потеря ориентации + самолигирование → **предупреждение** (J8). Directional = разные/несовместимые-между-собой оверхенги по концам.
- **Авто-нудж:** сейчас `allRestriction` (`auto-group-pipeline`) — только когда ВСЕ куски RE. Добавить «один RE-сосед → предложить совместимый конец следующему» (подсказка на стыке, не форс) — реализуется RE-подсказкой стыка (JUNCTION_MODULE J3), питается `acquisitionMethod` соседа.

**P7. Каталог элементов (реюз `snippet-catalog`).** «Запомненные элементы» (6×His, FLAG, линкеры, T7, RBS, сайты, кассеты) — вставка готового сниппета через `snippet-catalog.js`. Из каталога → `manual`/`snippet` с реальной последовательностью; концам — праймер/RE/overlap по соседнему стыку. §17-реюз. Code читает `snippet-catalog.js`: формат/путь вставки; свести «из каталога» к P4/P5. Пуст/минимален → стартовый набор как данные (data-файл без лимита).

---

## §5. Файлы / сигнатуры (не код)

- **`assembly-model.js`**: `makeManualSegment` без gap (требовать `sequence`); `computeAssemblySequence` без `'N'×length` (orphans/unavailable остаются); `segmentLength` упростить. Возможен `makeSyntheticInsert({sequence, subVariant, oligos?})` ИЛИ флаги на manual — Code выбирает минимальную форму (не плодить kind).
- **`piece-model.js`** (Code читает): ось `acquisitionMethod`/`acquisitionParams`; под-вариант олигного (`insertVariant ∈ {primer-embed, two-oligo, annealed-pair, manual, catalog}`); `embedsInPrimer`-флаг для (a).
- **`piece-authoring.js`** (Code читает): кусок из выделения, raw `primerPairId`; путь вставки из каталога/олиго.
- **`primer-derive.js`**: `SKIPPED_KINDS` без `gap`; встраивание короткого по флагу/длине (согласовать с ENGINE A5).
- **`assembly-edit-router.js`** (Code читает первым): размотать known-gap (`targetKind==='gap'`, `gapSequence`/`gapLength`/`gapHint`).
- **`AssemblyShellBody.jsx`**: `segLabel` без Gap; `onPasteSequence`/`insertManualSegment` без `gapSequence`; `onSequenceEdit` без gap-веток; хоткей-вставка (P5).
- **`RangePickerModal.jsx`** (Code читает): range/RE-выбор, `acquisitionMethod`; UI выбора route (a/b) для RE (P6).
- **`snippet-catalog.js`** (Code читает): каталог (P7); стартовый набор как данные.
- **`OligoManager.jsx`** (v0.5, Code оценивает): харвест олигного UI (b2/c) — реюз если применимо (§17).
- **тесты**: де-гэп (manual всегда с последовательностью; computeAssemblySequence без 'N'; edit-router без gap); synthetic-insert под-варианты + пороги 80/120; RE-two-route (route a/b, совместимость оверхенгов, направленность-предупреждение); каталог-вставка; регрессия range/sourced/import.

---

## §6. Порядок (строгий; после ENGINE слоя 2, может || JUNCTION_MODULE — координировать `acquisitionMethod`; CANVAS после)

1. **Де-гэп (P1) + без-backbone аудит (P2)** — рефактор по карте; тесты gap переписаны; модель чистая. (Рано — упрощает остальное.)
2. **Физтипы + ось acquisition (P3)** — `acquisitionMethod`/под-вариант на куске; модуль стыка читает; словарь согласован.
3. **Synthetic-insert (P4) + хоткей-вставка (P5) + каталог (P7)** — под-варианты, пороги, реюз `snippet-catalog`/`OligoManager`.
4. **RE-two-route (P6)** — route a/b, совместимость, направленность, авто-нудж. (Route (b) — после ENGINE V131-фикса.)

Каждый шаг — STOP перед визуальной приёмкой (отдельной сессией).

---

## §7. STOP + отчёт

Как `SPEC_PRIMER_TAIL_UNIFICATION` §7. Дополнительно: подтвердить, что **gap вычищен полностью** (нет `gapKind`/`gapLabel`/`'N'×length`/`targetKind==='gap'` ни в одном файле + `assembly-edit-router`); backbone-следов нет; пороги 80/120 применены; RE-route (b) согласован с V131; common-features merge-путь не задет. Code **обязан прочесть** файлы «?» (§0) и подтвердить механику. После реализации — статус-шапка `✅ РЕАЛИЗОВАНО [дата]`.

**Handoff (04.06).** `CURRENT_TASK.md` — лаунчер набора (live-junction сборка). Handoff Code кладётся в сессии старта реализации. V130/V131 — в `BUGS.md`.

---

## §8. Риски

1. **Де-гэп — рефактор по многим файлам.** → по карте P1 пунктно; `assembly-edit-router` Code читает первым (known-gap-логику я не видел).
2. **«Контейнер удалён» ≠ gap.** `orphans`/`unavailable` остаются (keep-with-warning) — НЕ путать; orphan-ветку `computeAssemblySequence` сохранить.
3. **Олигный (b2/c) — возможно новый UI.** → сперва харвест `OligoManager` (v0.5); не строить с нуля (§17). Не выходит — минимальный UI.
4. **Пороги 80/120 — эвристика, не лимит.** → авто-предложение + ручная правка; не блокировать.
5. **RE-совместимость по оверхенгам, не энзимам.** → сравнение оверхенгов; направленность-предупреждение (J8).
6. **Route (b) зависит от V131.** → не реализовывать RE-сайт-в-праймер до ENGINE-фикса.
7. **Координация с JUNCTION_MODULE/CANVAS по `acquisitionMethod`.** → ось acquisition (P3) — общий контракт; согласовать словарь до параллельной реализации.
8. **common-features-дрейф** (02.06 правил feature-detection/Dexie). → Code подтверждает: де-гэп/piece-рефактор merge-путь фич не задевает.

---

## §9a. Поправки выверки 04.06 (повторное чтение кода)

- **P1 де-гэп карта НЕПОЛНА — добавить живой 4-tier gap-путь.** Главная gap-обработка текущего 4-tier — НЕ `assembly-model.js::makeManualSegment` ([29.05]), а `zone-pieces-to-dag.js` (подтверждено чтением 04.06):
  - `draftFromZone`: ветка `p.kind==='gap'` строит manual-сегмент с `gapSequence`/`gapLength`/`gapHint`/`gapKind` ('known'/'unknown'); пустой gap → 'N'×length downstream (V83 known-gap сохраняется).
  - `realiseAssembly`: проверка `gap-without-sequence` (manual без sequence → `{ok:false}`); gap-with-sequence → контейнер `origin.kind:'realised-oligo'` (`-gap-N`, без PCR-оп).
  Де-гэп ОБЯЗАН пройтись по этим двум функциям (карту P1 + §0 + §5 дополнить `zone-pieces-to-dag.js`). Остальные gap-факты ([29.05] `assembly-model`/`AssemblyShellBody`, `assembly-edit-router` не читан) — Code подтверждает. `SKIPPED_KINDS={snippet,gap}` в `primer-derive` подтверждён.
- **`acquisitionMethod` realise НЕ пробрасывает (к P3).** `draftFromZone`-сегмент НЕ несёт `acquisitionMethod` → `realiseAssembly` строит `pcr`-оп на каждый container-сегмент независимо от него (сейчас `kind:'pcr'` бланкетно). P3-контракт требует проброса `acquisitionMethod` в сегмент/draft и выбора операции (pcr vs digest vs synthesis) по нему.
- **Словарь `acquisitionMethod`.** `derivedJunctionMethod` (`ImplicitJunction`) читает `piece.acquisitionMethod === 'pcr'` / `'restriction'`. P3-словарь (`pcr|restriction|synthesis|direct|undefined`) — общий с JUNCTION (J3/J5) и CANVAS (C2); согласовать до параллельной реализации (это НЕ тот же словарь, что method стыка — ENGINE §9a).

## §9. Открытые вопросы

- Сквозные (Q1–Q7) закрыты в МАСТЕР-ОБЗОРЕ.
- **P-Q1.** Форма олигного куска — `makeSyntheticInsert` или флаги (`insertVariant`/`embedsInPrimer`) на `manual`? Code выбирает минимальную, не плодя kind; подтверждает чтением `piece-model`/`piece-authoring`.
- **P-Q2.** UI выбора RE-route (a)/(b) — в `RangePickerModal` (при добыче соседа) или на стыке (`JunctionControl`)? Lean: route добычи — `RangePickerModal` (это про получение куска), метод стыка — `JunctionControl`; границу согласовать с JUNCTION_MODULE.
- **P-Q3 (низкое).** Стартовый список каталога (6×His/FLAG/линкеры/T7/RBS…) — уточнить с Игорем при P7; не блокирует.
