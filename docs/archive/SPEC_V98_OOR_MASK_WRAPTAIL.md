# SPEC V98 — OutOfRangeMaskOverlay не затеняет текст на wrap-tail строках

**Тип:** C (bugfix одного компонента). **Баг:** V98 (в `BUGS.md`).
**Источник:** Игорь 22.05.2026 — контейнер открыт как плазмида (circular) в редакторе сборки; «просмотр через ориджин» (wrap-bridge) рендерится верно, но затенения текста (out-of-range маска) на строке после ориджина нет.
**Статус:** готова к реализации. Диагноз — чтением `OutOfRangeMaskOverlay.jsx`, `SequenceLine.jsx`, `index.jsx`, `lib/wrap-tail.js`.

---

## 0. Размер затрагиваемого модуля

`SequenceView/overlays/OutOfRangeMaskOverlay.jsx` — 6.81 KB. Под лимитом, декомпозиция не нужна.

## 1. Где задача сядет

Один файл — `OutOfRangeMaskOverlay.jsx`, ветки `trailing-wrap` и `leading-wrap` в `useLayoutEffect`. Компонент импортируется только `index.jsx`. Радиус — нулевой за пределами файла.

## 2. Корень (по коду)

`OutOfRangeMaskOverlay` затеняет участки сиквенса ВНЕ `[rangeStart, rangeEnd]` (в `ContainerEditorSkeleton` диапазон = `containerRangeMask`, диапазон piece'а). Маска считается построчно: для каждой строки `[data-testid="sequence-view-line"]` пересекает OOR-сегменты с координатами строки.

`buildWrapTailLines` (`lib/wrap-tail.js`) даёт wrap-tail строкам **реальные абсолютные** координаты `start`:
- `trailing-wrap`: `start = trailingStart + i*cpl`, где `trailingStart = cpl − bridge.wrapAt` — НЕ ноль (на pUC19 432 bp, cpl 130 — это 88).
- `leading-wrap`: `start = (seqLen − leadCnt*cpl) + i*cpl`.

`SequenceLine` кладёт это в атрибут `data-line-start`.

В `OutOfRangeMaskOverlay`:
- ветка `main && !wrapsOrigin` — **корректно**: читает `el.dataset.lineStart`, пересекает OOR-сегменты с `[lineStart, lineStart+cpl)`, колонка = `pos − lineStart`.
- ветка `trailing-wrap` — **игнорирует `data-line-start`**: считает, что строка показывает `[0, lineLen)`, и берёт `pos` как колонку напрямую. Реально строка показывает `[trailingStart, …)` (88+). → маска ложится на неверные колонки либо промахивается → текст после ориджина не затеняется.
- ветка `leading-wrap` — **игнорирует `data-line-start`**: хардкодит `wrapLineStart = L − lineLen`. Совпадает с реальным `start` только при одной leading-строке (`leadCnt=1`); при двух (`leadCnt=2`) первая leading-строка маскируется неверно.

Особый случай `wrapsOrigin` (bridge — строка с ориджин-разделителем, две координатные половины) считается отдельной веткой и **корректно** — отсюда «просмотр через ориджин работает». Симптом «нет затенения текста в первой строке» = первая строка ПОСЛЕ ориджина = `trailing-wrap` строка.

## 3. Решение

Ветки `trailing-wrap` и `leading-wrap` должны считать маску так же, как `main`: читать `lineStart` из `el.dataset.lineStart` (он уже распарсен в начале цикла — `const lineStart = parseInt(el.dataset.lineStart || '', 10)`), брать `lineLen = Math.min(cpl, L − lineStart)`, пересекать OOR-сегменты с `[lineStart, lineStart+lineLen)`, колонка = `pos − lineStart`. Хардкод `[0, lineLen)` (trailing) и `wrapLineStart = L − lineLen` (leading) — убрать.

После этого `trailing-wrap`, `leading-wrap` и `main` считаются идентично — три ветки можно слить в одну (всё, кроме `wrapsOrigin`-bridge, обрабатывается единым кодом по `data-line-start`). Слияние желательно (убирает дублирование, закрывает класс), но **минимум** — починить две ветки. Bridge-ветку (`wrapsOrigin`) НЕ трогать.

## 4. Scope

**IN:** `OutOfRangeMaskOverlay.jsx` — ветки `trailing-wrap` / `leading-wrap` (или слияние с `main`). Тесты.

**OUT:** bridge-ветка `wrapsOrigin` — корректна, не трогать. `opacity`-dimming wrap-tail строк в `SequenceLine` — отдельный механизм, не трогать. Другие overlay. `lib/wrap-tail.js`.

## 5. Тесты

- **Unit:** смонтировать `OutOfRangeMaskOverlay` с fake `sequence-view-line` узлами в DOM, среди них `data-wraptail-kind="trailing-wrap"` с `data-line-start="88"` и `data-wraptail-kind="leading-wrap"` с `data-line-start` > 0; задать `rangeStart`/`rangeEnd`; проверить, что mask-rect на этих строках попадает на колонки `pos − lineStart`, а не `pos`.
- **Регрессия:** ветки `main` и `wrapsOrigin` — поведение без изменений, существующие V87-тесты `out-of-range-mask-v87` зелёные.
- Полный Vitest + `vite build` clean.

## 6. Риски

- Последняя wrap-tail строка может быть короче `cpl` — `lineLen = Math.min(cpl, L − lineStart)` это покрывает; не использовать голый `cpl`.
- Если делать слияние веток — `wrapsOrigin` (bridge) обязан остаться отдельной веткой: у него две координатные половины (`[lineStart, lineStart+wrapAt)` + wrap-half `[0, cpl−wrapAt)`), под общий «одна строка = `[lineStart, lineStart+lineLen)`» код он не подходит.

## 7. Порядок + STOP

1. Починить ветки `trailing-wrap` / `leading-wrap` (либо слить с `main`).
2. Unit + регрессия V87.
3. Полный Vitest + `vite build`.

**STOP:** после реализации и зелёного прогона — остановиться, отчёт в `CURRENT_TASK.md`. НЕ финализировать `PROJECT_STATE` / `BUGS` / `DECISIONS` — V98 переедет в FIXED отдельной Chat-сессией после визуальной приёмки.
