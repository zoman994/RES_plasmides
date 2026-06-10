# SPEC — Консолидация калькулятора праймеров (единый движок)

**Тип:** A (рефакторинг-консолидация ядра дизайна праймеров). **Статус:** готова к выдаче Code — независима от editable-assembly спринтов 1–2; должна предшествовать editable-assembly спринту 3.
**Design-doc:** `docs/DESIGN_PRIMER_CALCULATOR_UNIFICATION.md` (инвентаризация + выбор референса).
**Запрос Игоря (22.05.2026):** «по логике подбора праймеров — надо сделать один калькулятор, который будет всё учитывать».
Диагноз — чтением `local-primer-design.js`, `tm-calculator.js`, `primer-reuse.js`, `primer-derive.js`, `operation-pcr-bridge.js`, `assembly-primer-utils.js`, `zone-pieces-to-dag.js`, `auto-group-pipeline.js`, `op-piece-bridge.js`.

---

## 0. Размеры затрагиваемых модулей

- `local-primer-design.js` — 19.81 KB (под hard 25). Малое аддитивное расширение (поле `insertSeq` у junction).
- `tm-calculator.js` — 7.00 KB. **Не редактируется** — `calcTmNN` уже референс Tm.
- `components/CanvasSkeleton/lib/primer-derive.js` — 6.40 KB → **сжимается** (удаляются `tmEstimate`/`buildFwdTail`/`buildRevTail`).
- `components/CanvasSkeleton/lib/operation-pcr-bridge.js` — 7.34 KB. Уже делегирует движку — точечно.
- `components/CanvasSkeleton/lib/assembly-primer-utils.js` — 5.02 KB. `buildAssemblyPrimer` перестаёт дублировать хвосты.
- `components/CanvasSkeleton/lib/zone-pieces-to-dag.js` — 12.07 KB (под hard 25). `autoPrimerPair` → единый калькулятор.
- Новый `components/CanvasSkeleton/lib/primer-calculator.js` — адаптер op-группа/pieces → движок (~6–10 KB).

## 1. Контекст

Дизайн праймеров фрагментирован: при едином правильном движке `designPrimersLocal` (`local-primer-design.js`, v0.5) поверх него наросли параллельные дизайнеры, его НЕ зовущие. `designPrimersLocal` уже учитывает overlap PCR, Gibson, Golden Gate, RE/лигирование, KLD, теги (расширяет binding за low-complexity линкеры), повторы, circular self-closure, merged-блоки, полимеразу, мутант-bridge; Tm — `calcTmNN` (SantaLucia NN + Owczarzy, ±1–2 °C).

Дубли (карта — `DESIGN_PRIMER_CALCULATOR_UNIFICATION.md` §3):
- `primer-derive.js deriveAutoPrimers` (4-tier op-группы) — свой Tm по Wallace `4×GC+2×AT` (±5 °C, устаревшее), наивный binding-срез, свои хвосты с хардкодом ферментов.
- `assembly-primer-utils.js buildAssemblyPrimer` (ручная запись по выделению) — свои хвосты на стыке.
- `zone-pieces-to-dag.js autoPrimerPair` (realise-fallback) — 20-bp срез, `tm:0`.

Три независимых Tm, четыре генератора хвостов. Дрейф уже наблюдаем — Tm одного праймера расходится между assembly- и PCR-режимом.

## 2. Где задача сядет (связи)

Референс — `designPrimersLocal` + `calcTmNN`, остаются как есть (плюс одно малое расширение движка, §5.2). Новый адаптер `primer-calculator.js` переводит 4-tier модель (op-группа + pieces) в v0.5-shape (`{fragments, junctions}`), зовёт движок, нормализует выход. `deriveAutoPrimers` становится тонким алиасом адаптера — **сигнатура и имя сохраняются**, call-sites не трогаются. `buildAssemblyPrimer` (ручная запись) делит с движком хвосты + Tm. `autoPrimerPair` заменяется вызовом движка.

Затрагивает: `primer-derive.js` (внутренности `deriveAutoPrimers`), `assembly-primer-utils.js`, `zone-pieces-to-dag.js` (`autoPrimerPair`). Ссылается на: потребители выхода `deriveAutoPrimers` (панели/селекторы) — нормализатор сохраняет точную shape текущего `makePrimer` (§5.5), downstream байт-совместим. Может сломаться: тесты `deriveAutoPrimers`, опирающиеся на Wallace-Tm-числа — Tm после консолидации станет точнее (NN), числа в тестах сдвинутся; это ожидаемое исправление, не регрессия (см. §9).

## 3. Стратегия

Один калькулятор = `designPrimersLocal` (+`calcTmNN`). Всё остальное сводится к нему через адаптеры:

- **op-группа → движок.** Новый `primer-calculator.js`: `computeAssemblyPrimers(opGroup, state, opts)` строит `{fragments, junctions}` из pieces op-группы, зовёт `designPrimersLocal`, нормализует выход в 4-tier shape праймера. `deriveAutoPrimers` = алиас `computeAssemblyPrimers`. Крутые внутренности `primer-derive.js` удаляются.
- **Обвес (snippet) → хвост через движок.** Snippet между двумя амплифицируемыми кусками НЕ становится фрагментом — его последовательность кладётся в junction-поле `insertSeq`; движок дописывает её в 5′-хвост fwd-праймера следующего фрагмента (поведение `deriveAutoPrimers` сохраняется, но переезжает в движок).
- **Мутации → последовательность фрагмента.** Адаптер применяет `applyPieceMutations` (хелпер из editable-spринта 2) к `fragment.sequence` ПЕРЕД вызовом движка → праймер дизайнится по уже мутантной последовательности, мутагенным выходит сам.
- **Ручная запись по выделению.** `buildAssemblyPrimer` оставляет своё (binding = заданный биологом диапазон, Tm-target-поиск движка тут не нужен — диапазон выбран осознанно), но перестаёт дублировать хвосты: зовёт экспортированный `overlapTail` + `calcTmNN`.
- **realise-fallback.** `autoPrimerPair` заменяется вызовом `designPrimersLocal` для сегмента.
- **Один Tm.** `calcTmNN` везде; `tmEstimate` удаляется.

## 4. Scope

**IN:**
- `primer-calculator.js` — адаптер op-группа/pieces → `{fragments, junctions}` + вызов `designPrimersLocal` + нормализатор shape.
- `deriveAutoPrimers` — тонкий алиас `computeAssemblyPrimers`; удаление `tmEstimate`/`buildFwdTail`/`buildRevTail`.
- Малое расширение движка: junction-поле `insertSeq` (обвес в хвосте).
- `buildAssemblyPrimer` — переключение хвостов на экспортированный `overlapTail`, Tm на `calcTmNN`.
- `autoPrimerPair` (realise) → `designPrimersLocal`.
- Экспорт `overlapTail` (и при необходимости `findBinding`) из `local-primer-design.js`.

**OUT:**
- Reuse-матчинг (`primer-reuse.findCompatiblePrimers`, перевод реестра с localStorage на `state.primers`) — отдельная follow-up задача, не «калькулятор».
- Editable-assembly перезапуск авто-дизайна — спринт 3 wave'а (зовёт этот калькулятор после консолидации).
- Новые алгоритмы дизайна (hairpin/dimer-фильтрация праймеров и т.п.) — `checkHairpin`/`checkHomodimer` в `tm-calculator` есть, их подключение к дизайну — отдельно.
- PCR-режим `suggestPrimers`/`recomputeFromSelection` — уже корректно зовёт `designPrimersLocal`, не трогается.

## 5. Архитектурные решения

1. **`primer-calculator.js` — единый адаптер.** Экспорт `computeAssemblyPrimers(opGroup, state, opts) → Primer[]`. Шаги: (а) `opGroup.inputPieces` → pieces; (б) проход по порядку — `sourced` → фрагмент с `sequence = applyPieceMutations(срез+rc, piece.mutations)`, `synthesis`/`intermediate` → фрагмент с `piece.sequence`, `snippet` → НЕ фрагмент (его `sequence` копится для junction.insertSeq следующего фрагмента), `gap` → стенит цепочку junction (фрагмент после gap без overlap-хвоста); (в) `junctions[]` между соседними фрагментами по `opGroup.kind` (маппинг overlap_pcr/gibson→`overlap`, golden_gate→`golden_gate`, restriction→`re_ligation`, kld→`kld`, direct_ligation→`ligation` — расширить существующий `METHOD_TO_JUNCTION`), c `insertSeq` из накопленного обвеса; (г) `designPrimersLocal(fragments, junctions, circular, opts)`; (д) нормализатор shape. `circular` — из топологии финала op-группы (`zone.finalTopology`).
2. **Расширение движка — `junction.insertSeq`.** `local-primer-design.js`: `overlapTail(junction, leftSeq, rightSeq, side)` при `side==='right'` (fwd-хвост) дописывает `junction.insertSeq || ''` ПОСЛЕ junction-специфичного хвоста (5′→3′ порядок fwd-праймера: `[junction-tail][insertSeq][binding]`). `side==='left'` (rev-хвост) `insertSeq` игнорирует — обвес живёт только на downstream-fwd (правило `deriveAutoPrimers`). ~3–5 строк, единственное место правки самого движка.
3. **Мутации.** Адаптер применяет общий `applyPieceMutations` (новый в editable-spринте 2, `lib/piece-mutations.js`) к `fragment.sequence` до вызова движка. Если editable-спринт 2 ещё не слит — спека-зависимость: либо консолидация идёт после спринта 2, либо `applyPieceMutations` выносится этой спекой (тогда editable-S2 его переиспользует). Порядок: рекомендуется консолидация ПОСЛЕ editable-S2 (хелпер уже есть). Координируется при выдаче Code.
4. **Ручная запись.** `buildAssemblyPrimer` сохраняет логику «binding = выделенный диапазон» (boundary-aware), но `findInsertIndexAtPosition`/`detectCrossBoundary` оставляет, а конструкцию хвоста на стыке заменяет вызовом экспортированного `overlapTail`; Tm — `calcTm`/`calcTmNN`. `deriveAssemblyPrimer` (простой binding+Tm) — оставить или свести к `calcTmNN` (уже зовёт `calcTm`).
5. **Нормализатор shape.** `enginePrimerToPiecePrimer(enginePrimer, {opGroupId, pieceId, side, mutated}) → piecePrimer` в `primer-calculator.js`. Маппинг: `binding ← bindingSequence`, `tail ← tailSequence`, `tm ← tmBinding`, `sequence ← sequence`, `name ← name`, `autoMode:'auto'`, `mutated`, `origin:{kind:'auto-from-group', opGroupId, pieceId, side}`, `id: pr-<uuid>`. **Выход байт-совместим с текущим `makePrimer`** (`primer-derive.js`) — downstream-потребители не меняются.
6. **`autoPrimerPair` (realise).** `zone-pieces-to-dag.js`: фолбэк-пара для сегмента без user-праймеров → `designPrimersLocal([fragmentFromSegment], [], false, opts)` + `pairFromPrimers`-подобная свёртка. Грубый 20-bp срез/`tm:0` удаляется.
7. **`tmEstimate` удаляется** вместе с внутренностями `deriveAutoPrimers`. Один Tm — `calcTmNN`.

## 6. Файлы / сигнатуры

**`lib/primer-calculator.js`** (новый) — `computeAssemblyPrimers(opGroup, state, opts) → Primer[]` (§5.1); `enginePrimerToPiecePrimer(enginePrimer, ctx) → piecePrimer` (§5.5); внутренний `buildEngineInputs(opGroup, state) → {fragments, junctions, circular}`. Чистые.

**`local-primer-design.js`** — `overlapTail` дописывает `junction.insertSeq` при `side==='right'` (§5.2); экспортировать `overlapTail` (+`findBinding` если нужно ручной записи). `designPrimersLocal` сам не меняется.

**`primer-derive.js`** — `deriveAutoPrimers` = `export { computeAssemblyPrimers as deriveAutoPrimers }` (алиас) либо тонкая обёртка; удалить `tmEstimate`, `buildFwdTail`, `buildRevTail`, `makePrimer`, `pieceSequence` (логика переехала в адаптер + `applyPieceMutations`).

**`assembly-primer-utils.js`** — `buildAssemblyPrimer` зовёт экспортированный `overlapTail` вместо собственной конструкции хвоста.

**`zone-pieces-to-dag.js`** — `autoPrimerPair` → `designPrimersLocal`-свёртка.

**Тесты:** юниты `computeAssemblyPrimers` (op-группа overlap_pcr из 2 кусков; обвес → `insertSeq` в fwd-хвосте; gap стенит junction; мутантный sourced → мутагенный праймер; golden_gate / restriction junction); юнит `enginePrimerToPiecePrimer` (shape байт-совместим с `makePrimer`); юнит `overlapTail` с `insertSeq`; регрессия — существующие тесты `deriveAutoPrimers` (Tm-числа обновятся Wallace→NN — это исправление, тесты пере-baseline'ятся), `suggestPrimers`/PCR-режим зелёные, realise (`zone-pieces-to-dag`) зелёный.

## 7. Порядок выполнения

1. `local-primer-design.js` — `insertSeq` в `overlapTail` + экспорт `overlapTail` + юнит-тест.
2. `lib/primer-calculator.js` — `buildEngineInputs` + `computeAssemblyPrimers` + `enginePrimerToPiecePrimer` + юнит-тесты.
3. `primer-derive.js` — `deriveAutoPrimers` → алиас; удаление крутых хелперов.
4. `assembly-primer-utils.js` — хвосты через `overlapTail`.
5. `zone-pieces-to-dag.js` — `autoPrimerPair` → движок.
6. Регрессия: пере-baseline тестов `deriveAutoPrimers` под NN-Tm; прогон PCR-режима / realise.
7. Полный Vitest + `vite build`.

## 8. STOP-условие и формат отчёта

После реализации §3 IN-scope и зелёного полного Vitest + `vite build` clean — STOP. Отчёт в `CURRENT_TASK.md`: commit range; Vitest counters; `vite build`; spec deviations; size budget (`local-primer-design.js`, `primer-calculator.js`, `primer-derive.js`). **Отдельно в отчёте:** какие тесты пере-baseline'ились из-за смены Wallace→NN Tm (список). Координационные файлы не финализировать.

## 9. Риски

- **Смена Tm Wallace→NN сдвигает числа в тестах.** Это исправление точности, не регрессия. Митигация: §8 требует явный список пере-baseline'нутых тестов в отчёте; Chat на приёмке сверяет, что сдвиги только в Tm-asserts, не в логике.
- **Shape-несовместимость downstream.** Потребители выхода `deriveAutoPrimers` ждут конкретные поля. Митигация: §5.5 — нормализатор байт-совместим с `makePrimer`; юнит-тест shape; прогон панелей.
- **Обвес в GG/RE-junction.** `insertSeq` дописывается после junction-tail для любого kind — для GG/RE это просто доп. содержимое в хвосте. Биологически корректно (синтетическая вставка в праймере). Митигация: тест на op-группу restriction с обвесом.
- **Зависимость от `applyPieceMutations` (editable-S2).** Митигация: §5.3 — порядок выдачи: консолидация после editable-S2; если раньше — хелпер выносит эта спека.
- **`designPrimersLocal` single-fragment путь** для op-группы из одного амплифицируемого куска — terminal PCR / self-closure. Митигация: тест op-группы из 1 куска (linear → terminal, circular → self-closure).

## 10. Открытые вопросы

1. `deriveAutoPrimers` — оставить имя алиасом или со временем переименовать call-sites на `computeAssemblyPrimers`. Спека: алиас сейчас (нулевой риск), переименование — опциональный follow-up.
2. Подключение `checkHairpin`/`checkHomodimer` к выходу калькулятора (предупреждения о шпильках/димерах праймера) — не в этой спеке, кандидат на follow-up «качество праймеров».
