# SPEC V102 — Wrap-половина bridge-строки: рендер всех элементов треков

**Тип:** B (многокомпонентная). **Версия:** v0.8.3-alpha. **Дата:** 23.05.2026.
Контекст-ссылка — `BUGS.md` V102.

> **✅ РЕАЛИЗОВАНО и ПРИНЯТО (23.05.2026).** Code: Vitest 4002 pass / 18 skip / 0 fail, `vite build` clean.
> Визуальная приёмка пройдена. Закрытие — `BUGS.md` [x] V102 §5. Спека архивирована.

> **Что уже сделано в рамках V102 и принято/в работе:**
> always-on wrap-tail, откат origin-crossing гейта, фикс. объём ≈200 п.о.,
> затенение wrap-половины bridge-строки overlay-вуалью (`SequenceLine.jsx`,
> `data-testid="wrap-bridge-veil"`). Всё в working-tree, ждёт визуальной приёмки.
> **Эта спека — следующий шаг:** на wrap-половине bridge-строки рисуется ДНК и
> линейка, но НЕ рисуются аннотации (частично), праймеры, сайты рестрикции.
> Wrap-tail затевался именно ради переноса элементов через ориджин (праймеры
> через точку 1) — без этого фича бессмысленна.

---

## §0 Размеры затрагиваемых модулей

| Файл | Размер | Лимит | Примечание |
|---|---|---|---|
| `tracks/RulerTrack.jsx` | 5.05 KB | .jsx 40/30 | эталон, НЕ трогаем |
| `tracks/AnnotationTrack.jsx` | **48.54 KB** | .jsx hard 40 | **уже над hard-лимитом — preexisting TD** |
| `tracks/PrimerTrack.jsx` | 10.14 KB | .jsx 40/30 | запас большой |
| `tracks/RestrictionTrack.jsx` | 19.74 KB | .jsx 40/30 | запас есть |
| `tracks/AATrack.jsx` | 38.91 KB | .jsx hard 40 | вплотную к лимиту → см. §3 OUT |
| `SequenceView/SequenceLine.jsx` | 18.6 KB | .jsx 40/30 | правка — проброс пропсов |

**AnnotationTrack.jsx уже над hard 40** (preexisting tech debt, не вина этой задачи). Правка по §5.1 заменяет существующий `wrapSegmentInfo`-костыль на полноценный второй стек — это должно быть **net-нейтрально или меньше** по размеру (новый код заменяет старый, не добавляется сверху). Декомпозицию AnnotationTrack эта спека **НЕ требует** — это отдельный TD-таск; здесь задача — не увеличить файл. Если правка всё же растит файл — Code фиксирует в отчёте, не делает декомпозицию сам.

---

## §1 Контекст

### Что рисуется на wrap-половине сейчас

`buildWrapBridgeLine` (`wrap-tail.js`) строит последнюю строку кольцевой плазмиды как `[реальный конец][wrap-символы начала]`, `wrapsOrigin: true`, `wrapAt` = число реальных символов, разделитель ▶1 на колонке `wrapAt`.

- **ДНК-буквы** — рисуются: `line.seq` уже содержит wrap-символы, `StrandsTrack` их выводит. ✔
- **Линейка** — рисуется: `RulerTrack` wrap-aware (`inWrapHalf = ci >= wrapAt`, `absPos = inWrapHalf ? ci-wrapAt+1 : lineStart+ci+1`). ✔ — **эталон.**
- **Аннотации** — рисуются ЧАСТИЧНО. `AnnotationTrack` стекует через `stackAnnotations(parentRegions, lineStart, lineEnd)` с реальным диапазоном bridge-строки (`lineStart`≈260, `lineEnd`≈390 для 359-bp плазмиды). `stackAnnotations` фильтрует `r.end > lineStart && r.start < lineEnd` → фича в начале плазмиды (MCS, ~1-70) в `[260,390)` не попадает → стекер её выкидывает. `wrapSegmentInfo` (рендер wrap-куска) сидит ВНУТРИ `stack.rows.map(...)` → выполняется только для уже-застекованных регионов → для MCS не выполняется никогда. Фича, **пересекающая** ориджин, в `[260,390)` попадает и её wrap-кусок рисуется — поэтому хотфикс M-X.5 «работал» для пересекающих, но молчит для «только начало».
- **Праймеры** — НЕ рисуются. `PrimerTrack` фильтрует `intersects(hit, lineStart, lineEnd)`, wrap-пропсов не получает вообще.
- **Сайты рестрикции** — НЕ рисуются. `RestrictionTrack` фильтрует `s.position >= lineStart && s.position < lineEnd`, wrap-пропсов не получает.

Общий корень у всех трёх: трек фильтрует содержимое в `[lineStart, lineEnd)` и не видит wrap-половину `[0, wrapWidthChars)`.

### Затенение

Overlay-вуаль (`wrap-bridge-veil`, `zIndex:2`, `pointerEvents:none`, `top/bottom:0`) уже накрывает колоночный диапазон wrap-половины по всей высоте строки. Новое содержимое треков на wrap-половине окажется ПОД вуалью → будет приглушено заодно с ДНК. Это **желаемое** поведение (вся wrap-половина = единый затенённый контекст-блок), доп. работы не требует. Клики проходят сквозь вуаль (`pointerEvents:none`) — кликабельность элементов wrap-половины сохраняется.

---

## §2 Стратегия

Каждый контент-трек делает wrap-awareness **внутри себя** (один SVG/div, два сегмента) — паттерн, уже реализованный в `RulerTrack` и `AnnotationTrack`. Альтернатива «рендерить трек дважды наложением» отвергнута: треки имеют разную высоту (Primer — по числу хитов, Annotation — по числу рядов), наложение absolute-инстансов ломает вертикальную раскладку строки.

Для `wrapsOrigin` bridge-строки трек рисует содержимое в ДВУХ сегментах одного элемента:
- **реальный** — элементы из `[lineStart, seqLength)`, в колонках `[0, wrapAt)`;
- **wrap** — элементы из `[0, wrapWidthChars)`, в колонках `[wrapAt, lineLen)`.

Эталон координатной логики — `RulerTrack` (per-column split). Точная математика — §4.

---

## §3 Scope

**IN:**
- `AnnotationTrack.jsx` — заменить `wrapSegmentInfo`-костыль на полноценный второй стек wrap-половины (§5.1).
- `PrimerTrack.jsx` — добавить wrap-awareness (§5.2).
- `RestrictionTrack.jsx` — добавить wrap-awareness (§5.3).
- `SequenceLine.jsx` — пробросить wrap-пропсы в Primer/Restriction (§5.4).
- Тесты (§6).

**OUT:**
- **`AATrack.jsx` — wrap-awareness НЕ делаем в этой спеке.** Причины: (1) 38.91 KB, вплотную к hard 40 — wrap-awareness толкнёт за лимит и потянет декомпозицию (отдельный таск); (2) две стратегии (`single`/`hybrid`) + per-line фильтрация рядов завязаны на один непрерывный `[lineStart,lineEnd)` — правка крупная; (3) трансляция АА на ~30 п.о. wrap-контекста — наименьшая ценность из четырёх треков (аннотации/праймеры/рестрикция — то, ЧЕМ конструируют; АА-рамки — аналитический слой). Если Игорь захочет — отдельный follow-up: per-cell `absPos` wrap-split по образцу `RulerTrack` + wrap-aware фильтрация рядов. См. §9.
- `wrap-tail.js`, `index.jsx` — не трогать (always-on/200 п.о. готовы).
- `wrap-bridge-veil` / inline-структура bridge-строки / `buildWrapBridgeLine` — не трогать (готово).
- `StrandsTrack`, `RulerTrack` — не трогать (ДНК и линейка на wrap-половине уже корректны).
- `OutOfRangeMaskOverlay` / V98 — не трогать.

---

## §4 Общий паттерн координат

Для `wrapsOrigin` bridge-строки:
- `wrapAt` — колонка разделителя ▶1 = число реальных символов на строке.
- `wrapWidthChars = lineLen - wrapAt` — число wrap-символов (начало плазмиды после разделителя).
- Колонки `[0, wrapAt)` показывают плазмидные позиции `[lineStart, seqLength)`; при этом `seqLength - lineStart === wrapAt`.
- Колонки `[wrapAt, lineLen)` показывают плазмидные позиции `[0, wrapWidthChars)`.

**Маппинг абсолютной плазмидной позиции `p` в колонку рендера:**
- `p ∈ [lineStart, seqLength)` → колонка `p - lineStart` (реальный сегмент).
- `p ∈ [0, wrapWidthChars)` → колонка `wrapAt + p` (wrap-сегмент).
- Диапазоны не пересекаются (`lineStart` большой, `wrapWidthChars` маленькое), поэтому одиночная позиция попадает максимум в одну колонку. Многопозиционный элемент (фича/праймер через ориджин) даёт ДВА сегмента — по одному в каждом диапазоне.

**Ключевое наблюдение:** wrap-сегмент — это обычный рендер диапазона `[0, wrapWidthChars)`, у которого к каждому индексу колонки прибавлено `wrapAt`. То есть `xLeft_wrap = (labelChars + wrapAt + (visStart - 0)) * charPx`, где `visStart` — клип элемента к `[0, wrapWidthChars)`.

Трек получает `wrapsOrigin`, `wrapAt`, `seqLength`; выводит `wrapWidthChars = lineLen - wrapAt`. Для НЕ-bridge строк (`wrapsOrigin !== true`) поведение трека — ровно как сейчас, без изменений.

---

## §5 Per-track правила замены

### §5.1 AnnotationTrack.jsx

**Сейчас:** один стек `stackAnnotations(parentRegions, lineStart, lineEnd)`; `wrapSegmentInfo` внутри `stack.rows.map(...)` рисует wrap-кусок только для уже-застекованных регионов.

**Стало (только ветка `wrapsOrigin === true`):** два стека.
- **Реальный стек:** `stackAnnotations(parentRegions, lineStart, Math.min(lineEnd, seqLength))` → рендер прямоугольников в колонках `[0, wrapAt)` — текущий real-segment рендер (`xLeft = (labelChars + (visStart - lineStart)) * charPx`).
- **Wrap-стек:** `stackAnnotations(parentRegions, 0, wrapWidthChars)` → рендер в колонках `[wrapAt, lineLen)`: `xLeft = (labelChars + wrapAt + wVisStart) * charPx`, где `wVisStart = max(region.start, 0)`, `wVisEnd = min(region.end, wrapWidthChars)`.
- **`wrapSegmentInfo`-костыль удалить.** Wrap-стек покрывает ВСЁ содержимое wrap-половины — и фичи-«только начало», и wrap-куски пересекающих ориджин фич (`stackAnnotations(_, 0, wrapWidthChars)` ловит всё, что пересекает `[0, wrapWidthChars)`).
- Wrap-стек рисует то же, что сейчас рисует блок `wrapSegmentInfo`: прямоугольник + шеврон + label, `<g data-testid="sequence-view-annotation" data-region-segment="wrap" …>`. Шеврон wrap-сегмента — по правилу из текущего `wrapSegmentInfo.drawChevron`.
- Sub-features (kids), drag-handles, preview-rect — остаются ТОЛЬКО на реальном сегменте (как сейчас в `wrapSegmentInfo`-комментарии: split хендлов через ориджин отложен). Wrap-сегмент = rect + chevron + label.
- `totalHeight` для bridge-строки: по `Math.max(realStack.rows.length, wrapStack.rows.length)`. Overflow: real-стек как сейчас; overflow на wrap-половине (~200 п.о.) маловероятен — discretion Code, отступление зафиксировать.
- НЕ-bridge строка: один стек, как сейчас. Без изменений.

**Размер:** правка net-нейтральна (wrap-стек рендер заменяет `wrapSegmentInfo` рендер). Файл уже над hard 40 — **не растить**; декомпозицию не делать (§0).

**Известный компромисс:** фича, пересекающая ориджин, стекуется в реальном и wrap-стеке независимо → две половины могут лечь на разные ряды. Допустимо: каждая половина корректно упакована внутри своего сегмента; в реальных плазмидах фича прямо через точку 1 редка. Зафиксировать в комментарии.

### §5.2 PrimerTrack.jsx

**Сейчас:** `lineHits = allHits.filter(h => intersects(h, lineStart, lineEnd))`; рендер `xLeft = (labelChars + (visStart - lineStart)) * charPx`. Wrap-пропсов не получает.

**Стало:**
- Принять пропсы `wrapsOrigin`, `wrapAt`, `seqLength`.
- Для bridge-строки `lineHits` = объединение:
  - **реальные хиты:** `allHits.filter(h => intersects(h, lineStart, Math.min(lineEnd, seqLength)))`, тег `segment:'real'`;
  - **wrap-хиты:** `allHits.filter(h => intersects(h, 0, wrapWidthChars))`, тег `segment:'wrap'`.
- Праймер через ориджин даёт реальный И wrap хит (две стрелки — праймер «продолжается» за разделителем; это и есть смысл фичи).
- Рендер: вместо `xLeft = (labelChars + (visStart - lineStart)) * charPx` считать колонку из сегмента. Чисто — предвычислить на каждый хит `colStart`: real → `visStartAbs - lineStart`; wrap → `wrapAt + visStartAbs` (где `visStartAbs` клипнут к `[0, wrapWidthChars)`). `xLeft = (labelChars + colStart) * charPx`, `W` из `(visEndAbs - visStartAbs)` — как сейчас.
- Вписанные буквы `bases = upper.slice(visStartAbs, visEndAbs)` — `visStartAbs/visEndAbs` АБСОЛЮТНЫЕ (real: клип к `[lineStart, seqLength)`; wrap: клип к `[0, wrapWidthChars)`). Срез по абсолютным координатам корректен для обоих.
- PrimerTrack не делает greedy-pack — каждый хит на своём ряду (`idx * ROW_STRIDE`). Реальные + wrap хиты идут в общий `lineHits`, каждый получает ряд. Проблемы выравнивания нет.
- `directionFilter` — применяется к объединённому списку, без изменений.
- НЕ-bridge строка (`wrapsOrigin !== true`) — поведение ровно как сейчас.

### §5.3 RestrictionTrack.jsx

**Сейчас:** `lineSites = sites.filter(s => s.position >= lineStart && s.position < lineEnd)`; `computeLabelSlots` считает `ci = s.position - lineStart`. Wrap-пропсов не получает.

**Стало:**
- Принять пропсы `wrapsOrigin`, `wrapAt`, `seqLength`.
- Для bridge-строки `lineSites` = объединение:
  - **реальные сайты:** `s.position >= lineStart && s.position < Math.min(lineEnd, seqLength)`, колонка рендера `renderCi = s.position - lineStart`;
  - **wrap-сайты:** `s.position >= 0 && s.position < wrapWidthChars`, колонка рендера `renderCi = wrapAt + s.position`.
- Прикрепить `renderCi` к каждому сайту. `computeLabelSlots` и рендер сейчас выводят `ci` из `s.position - lineStart` — перевести на прикреплённый `renderCi`. Сортировать `lineSites` по `renderCi` (каскад слотов label-ов должен идти слева направо по обоим сегментам).
- Сайт — одна позиция, попадает строго в один сегмент (real ИЛИ wrap), никогда в оба → двойного рендера нет.
- `siteKey = ${enzyme}-${position}` (позиция абсолютная) — остаётся уникальным; highlight/hover не трогаем.
- НЕ-bridge строка — поведение как сейчас.

### §5.4 SequenceLine.jsx

Сейчас `wrapsOrigin`/`wrapAt`/`seqLength` пробрасываются в `RulerTrack` и `AnnotationTrack`. Добавить те же три пропса в вызовы `PrimerTrack` и `RestrictionTrack`. `AATrack` — НЕ трогать (§3 OUT). Других правок в `SequenceLine.jsx` нет.

---

## §6 Порядок и тесты

1. `SequenceLine.jsx` — проброс пропсов в Primer/Restriction (§5.4).
2. `AnnotationTrack.jsx` — двойной стек, удаление `wrapSegmentInfo` (§5.1).
3. `PrimerTrack.jsx` — wrap-awareness (§5.2).
4. `RestrictionTrack.jsx` — wrap-awareness (§5.3).
5. Тесты:
   - **AnnotationTrack:** на bridge-строке (`wrapsOrigin`, `wrapAt < lineLen`) фича целиком в `[0, wrapWidthChars)` рисуется на wrap-половине (`<g data-region-segment="wrap">` с корректным `xLeft` в колонках `[wrapAt, lineLen)`); фича через ориджин рисует обе половины; НЕ-bridge строка — без изменений.
   - **PrimerTrack:** на bridge-строке праймер, связывающийся в `[0, wrapWidthChars)`, рисуется на wrap-половине; НЕ-bridge — без изменений.
   - **RestrictionTrack:** на bridge-строке сайт в wrap-позиции рисуется на wrap-половине с корректным `renderCi`; НЕ-bridge — без изменений.
   - **Регрессия:** существующие wrap-tail / bridge / veil тесты зелёные; счётчики не падают.
6. Полный Vitest + `vite build`.

Раскладка тестовых файлов — по существующей конвенции (`__tests__/`).

---

## §7 STOP-условие и формат отчёта

После IN-scope §3 + зелёного полного Vitest + `vite build` clean — **STOP**. Отчёт в `CURRENT_TASK.md` отдельной секцией: commit range, Vitest counters (pass/skip/fail), `vite build`, spec deviations (явно), size budget по всем 4 файлам (особо — `AnnotationTrack.jsx`: вырос/нет относительно 48.54 KB).

Code координационные файлы НЕ финализирует. Спеку не переписывает. Визуальная приёмка — отдельная Chat-сессия.

---

## §8 Риски

- **AnnotationTrack уже над hard 40** — правка обязана быть net-нейтральной (§0/§5.1). Если растёт — фиксировать в отчёте, декомпозицию НЕ делать.
- Фича через ориджин в AnnotationTrack: две половины на разных рядах (§5.1) — допустимо, зафиксировать комментарием.
- Вуаль `wrap-bridge-veil` приглушает новое содержимое wrap-половины — это желаемо (§1), не баг. На визуальной приёмке проверить, что приглушённые аннотации/праймеры/сайты читаемы.
- `intersects`/фильтры клипать к `Math.min(lineEnd, seqLength)` для реального сегмента — иначе на крошечной плазмиде реальный сегмент «вылезет» за `seqLength`.
- Кликабельность элементов wrap-половины: вуаль `pointerEvents:none` клики пропускает; убедиться, что хит-таргеты треков на wrap-сегменте позиционируются по тем же сдвинутым колонкам.

---

## §9 Открытые вопросы

**AATrack — включать?** По умолчанию вынесен в OUT (§3, обоснование там). Если Игорь хочет АА-трансляцию на wrap-половине — отдельный follow-up той же модели. Решение Игоря; по умолчанию — не делаем в этой спеке.
