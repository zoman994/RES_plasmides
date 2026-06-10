# DESIGN-DOC — Единый калькулятор праймеров (консолидация дизайна)

**Статус:** design-doc, пред-спека. НЕ спека. Инвентаризация primer-кода выполнена 22.05.2026 по запросу Игоря «надо сделать один калькулятор, который будет всё учитывать; посмотреть что есть и что брать за референс».
**Тип будущей реализации:** A (рефакторинг-консолидация, ядро дизайна праймеров).
**Связь:** editable-assembly wave (`DESIGN_EDITABLE_ASSEMBLY_VIEW.md`) спринт 3 «перезапуск авто-дизайна» должен звать этот единый калькулятор — консолидация логически перед ним.

---

## 1. Запрос

Логика подбора праймеров фрагментирована — несколько независимых реализаций. Нужен один калькулятор, учитывающий всё (overlap/Gibson/GG/RE/KLD, хвосты, теги, мутагенные праймеры, Tm). Определить референс и план сведения.

## 2. Что есть в коде (инвентаризация 22.05.2026)

**Термодинамика — `tm-calculator.js` (корень).** `calcTmNN` — SantaLucia 1998 nearest-neighbor + Owczarzy 2008 Mg²⁺-override + солевая коррекция, точность ±1–2 °C. `calcTm` (drop-in), `calcTmForPolymerase`, `gcPercent`, `checkHairpin` (ΔG-фильтр), `checkHomodimer`. **Полноценное правильное ядро.**

**Движок дизайна — `local-primer-design.js` (корень, v0.5, ~20 KB).** `designPrimersLocal(fragments, junctions, circular, opts)` — самый полный дизайнер:
- `findBinding` — минимальный binding с одного конца, Tm ≥ target (18–30 нт), через `calcTmNN`.
- `findBindingTagAware` — расширяет binding за low-complexity теги/линкеры (через `tags-db`).
- `checkRepeats` — предупреждения о low-complexity повторах.
- `overlapTail(junction, …)` — хвосты для **всех** типов стыка: overlap (режимы split/left_only/right_only), kld/sticky (пусто), ligation/re_ligation (через `generateRETail`), golden_gate (через `GG_ENZYMES`), **+ `overlapSequence`** — мутант-содержащий bridge (мутагенез уже подключён к движку).
- Merged-фрагменты → sub-фрагменты; single-fragment пути (circular self-closure 15-bp хвосты / linear terminal PCR); polymerase Tm-adjust; предупреждения ΔTm / длины / N+N-смежности / коротких фрагментов.
- **Учитывает уже сейчас: overlap PCR, Gibson, Golden Gate, RE/ligation, KLD, теги, повторы, circular self-closure, merged-блоки, полимеразу, мутагенный bridge.**

**Что движок зовёт правильно — `operation-pcr-bridge.js` (`suggestPrimers`/`recomputeFromSelection`, F3).** Тонкая обёртка над `designPrimersLocal` + `calcTm`. Корректная делегация. Покрывает single-template PCR.

**Параллельные реализации (источник фрагментации):**
- **`primer-derive.js` `deriveAutoPrimers` (4-tier K11)** — переписывает всё хуже:
  - свой Tm — `tmEstimate` = Wallace `4×GC+2×AT` (старое правило ±5 °C, ровно то, что `calcTmNN` заменил; в комментарии — «approximation»);
  - свой binding — наивный `slice(0,20)` / `RC(slice(−20))`, без Tm-target поиска, без tag-aware, без repeat-check;
  - свои хвосты — `buildFwdTail`/`buildRevTail`, дубль `overlapTail`, но грубее (хардкод `GGTCTCN` вместо `GG_ENZYMES`; `reSite+'GG'` вместо `generateRETail`).
  - Несёт уникальное: сворачивание snippet в хвост соседа + применение `mutations[]` (мутагенный праймер).
- **`assembly-primer-utils.js` `buildAssemblyPrimer`/`deriveAssemblyPrimer` (A2/A3)** — boundary-aware праймер для ручной записи по выделению. Tm — `calcTm` (ок), но снова свои хвосты на стыке.
- **`zone-pieces-to-dag.js` `autoPrimerPair`** — грубый realise-fallback: 20-bp срез, `tm:0`.

**Reuse — `primer-reuse.js` (корень).** `findCompatiblePrimers` (матчинг по binding/tail/Tm), `buildOrderSheet`. Реестр на localStorage — legacy (skeleton держит пул в `state.primers`). Логика матчинга переиспользуема, реестр — нет.

## 3. Карта дублирования

| Что | Референс (хороший) | Дубли (хуже) |
|-----|--------------------|--------------|
| **Tm** | `calcTmNN` (SantaLucia+Owczarzy) | `tmEstimate` Wallace (`primer-derive.js`); `tm:0` (`autoPrimerPair`) |
| **Binding-поиск** | `findBinding`/`findBindingTagAware` (Tm-target + tag-aware + repeat-check) | наивный срез ×3 (`primer-derive.js`, `buildAssemblyPrimer`, `autoPrimerPair`) |
| **Хвосты стыка** | `overlapTail` (все типы стыка + мутант-bridge) | `buildFwdTail`/`buildRevTail` (`primer-derive.js`); boundary-хвосты (`assembly-primer-utils.js`) |
| **Полный пайплайн** | `designPrimersLocal` | `deriveAutoPrimers`; `autoPrimerPair` |

Три независимых Tm, четыре генератора хвостов, четыре экстрактора binding. Дрейф уже есть (Wallace vs NN — праймер показывает разную Tm в assembly-режиме и PCR-режиме).

## 4. Референс

**`designPrimersLocal` (`local-primer-design.js`) + `calcTmNN` (`tm-calculator.js`) — единый калькулятор.** Обоснование:
- Самый полный: уже учитывает все типы стыка, теги, повторы, circular, merged, полимеразу, мутагенный bridge — то самое «всё учитывать».
- Правильная термодинамика (±1–2 °C против ±5 °C у Wallace-дубля).
- Уже корректно используется (`operation-pcr-bridge.js`) — модель делегации проверена.
- Single- и multi-fragment пути оба покрыты (op-группа из 1 и из ≥2 кусков).
- Чистый (без Zustand) — переиспользуется отовсюду.

Параллельные дизайнеры (`deriveAutoPrimers`, `buildAssemblyPrimer`-хвосты, `autoPrimerPair`, `tmEstimate`) — на снос/сведение к референсу.

## 5. Что нужно для консолидации (scope будущей спеки)

1. **Адаптер `op-group + pieces → {fragments, junctions}`** — главный новый код. Pieces → v0.5-shape фрагменты (`{sequence, name, annotations, topology, needsAmplification}`); kind op-группы → тип junction. Паттерн уже есть — `operation-pcr-bridge.toFragment` так делает для контейнера. `deriveAutoPrimers` после этого = адаптер + вызов `designPrimersLocal`, своя логика удаляется.
2. **Snippet и мутации через движок.** Snippet (обвес ≤ порога, Fork A editable-wave) — скармливать как часть overlap/хвоста либо как фрагмент; `mutations[]` — через junction `overlapSequence` (механизм мутант-bridge уже в `overlapTail`) либо модификацией fragment.sequence. Точная форма — развилка спеки (см. §7).
3. **Ручная запись по выделению** (`buildAssemblyPrimer`, Ctrl+R) — делит с движком хвосты + Tm + `findBinding`; полный пайплайн ей не нужен (binding биолог задаёт сам). Свести к общим хелперам, не дублировать.
4. **`autoPrimerPair` (realise)** — заменить вызовом `designPrimersLocal`.
5. **Один Tm везде** — `calcTmNN`. `tmEstimate` удалить.
6. **Reuse** — `findCompatiblePrimers` оставить, переключить на пул `state.primers` (localStorage-реестр — legacy).

## 6. Связь с editable-assembly wave

`DESIGN_EDITABLE_ASSEMBLY_VIEW.md` §8 спринт 3 «перезапуск авто-дизайна» сейчас завязан на `deriveAutoPrimers`. После консолидации он зовёт единый калькулятор. Рекомендуемый порядок: editable-wave спринты 1–2 независимы (можно параллельно); консолидация — перед editable-wave спринтом 3 либо сливается с ним.

## 7. Открытые вопросы (к спеке)
1. Как именно snippet-piece (обвес) скармливается `designPrimersLocal` — отдельным фрагментом, частью overlap-хвоста соседа, или новым полем junction. Биология: обвес физически в хвосте праймера, отдельной реакции нет → вероятно хвост, не фрагмент.
2. Как `mutations[]` доходят до движка — junction `overlapSequence` (готовый мутант-bridge канал) vs модификация `fragment.sequence` перед вызовом.
3. Ручная запись по выделению — общие хелперы или тоже полный прогон через движок.
4. Совместимость shape: праймеры движка несут `tmBinding/tmAdjusted/tailSequence/bindingSequence/purpose…`; 4-tier ждёт `autoMode/origin.kind/binding/tail/tm`. Нужен нормализатор shape (один, не на каждом call-site).

## 8. Следующий шаг
Инвентаризация выполнена. Референс — `designPrimersLocal` + `calcTmNN`. Спека консолидации (тип A) пишется отдельно; §7 закрывается чтением shape call-site'ов + решением Игоря по приоритету относительно editable-wave.
