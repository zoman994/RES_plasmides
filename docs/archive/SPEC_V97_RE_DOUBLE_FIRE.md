# SPEC V97 — RE-сайт `onSiteClick` срабатывает дважды за один клик

**Тип:** C (bugfix одного компонента). **Баг:** V97 (завести в `BUGS.md`).
**Источник:** Игорь 22.05.2026 — в range picker'е выбор фрагмента двумя кликами по RE-сайтам: фрагмент между сайтами появляется, но после отпускания курсора схлопывается на второй сайт. Не даёт выбрать фрагмент между сайтами.
**Статус:** готова к реализации. Диагноз — чтением `RestrictionTrack.jsx` + `hooks/useSequenceSelection.js`.

---

## 0. Размеры затрагиваемых модулей

`SequenceView/tracks/RestrictionTrack.jsx` — 19.12 KB (под hard-лимитом 40 KB для .jsx). Декомпозиция не нужна.

## 1. Где задача сядет

Фикс целиком в `SequenceView/tracks/RestrictionTrack.jsx` — обработчики событий RE-сайта. `RestrictionTrack` импортируется только `SequenceLine.jsx`. `useSequenceSelection` (хук, получатель `onSiteClick` через цепочку `onRestrictionClick`) — **не трогается, он корректен**. Consumers `SequenceView` не меняются. Радиус — один файл + новый тест.

## 2. Корень (по коду)

RE-сайт `<g>` в `RestrictionTrack.jsx` вешает `onSiteClick` на ДВА события:
- `onMouseDown` — `e.stopPropagation(); e.preventDefault(); onSiteClick(s, e)`
- `onClick` — `e.stopPropagation(); onSiteClick(s, e)`

Комментарий в коде утверждает, что `preventDefault()` на `mousedown` отменяет последующий `click` («В реальном браузере click не выстрелит»). **Утверждение неверно.** `preventDefault()` на `mousedown` подавляет фокус и нативное выделение текста, но НЕ отменяет событие `click`. В реальном браузере срабатывают оба обработчика → `onSiteClick` вызывается дважды за один клик.

Последствие для парного выбора (`reBehavior: 'pair-select'` в `useSequenceSelection`):
- Клик по второму сайту, `mousedown` → вызов №1 → `firstRESiteRef` = первый сайт → ветка пары → выделение `[cutA, cutB]`, `firstRESiteRef` сброшен в `null`.
- Тот же клик, `click` (после mouseup) → вызов №2 → `firstRESiteRef` уже `null` → ветка «первый клик» → snap на recognition-спан второго сайта. Выделение схлопывается на второй сайт.

Первый сайт «работает» — там оба вызова идемпотентны (snap на один и тот же сайт, `firstRESiteRef` в обоих случаях = этот сайт). Разрушителен только двойной вызов на ВТОРОМ сайте.

Существующие тесты V88 дефект не ловят: `fireEvent.click` эмитит только `click` без `mousedown`, а тест-хак `__v88_re_click__` дёргает `onRestrictionClick` напрямую — оба пути одиночные.

## 3. Решение

`onSiteClick` должен срабатывать ровно один раз за жест. `mousedown` всегда предшествует `click` в одном жесте. Дедуп через per-instance ref:
- Новый `useRef` в `RestrictionTrack` (например `mouseHandledRef`, init `false`).
- `onMouseDown`: ставит `mouseHandledRef.current = true`, затем как сейчас (`stopPropagation` + `preventDefault` + `onSiteClick`).
- `onClick`: если `mouseHandledRef.current === true` — сбросить в `false` и `return` (этот жест уже обработан в `mousedown`). Иначе (тест-среда: `fireEvent.click` без `mousedown`) — `onSiteClick` как сейчас.

Браузер: `mousedown` ставит флаг и вызывает; `click` видит флаг, сбрасывает, пропускает → один вызов. Тест с `fireEvent.click`: флаг `false` → `onClick` вызывает → один вызов. Следующий жест: `mousedown` снова ставит флаг.

`onPointerDown` (только `stopPropagation`) — не трогать. `preventDefault` на `mousedown` — оставить (он нужен против caret-placement родителя), убрать только ложный комментарий про «click не выстрелит».

Хук `useSequenceSelection` не трогать — он корректен при одном вызове на клик.

## 4. Scope

**IN:** `RestrictionTrack.jsx` — `mouseHandledRef` + guard в `onMouseDown` / `onClick`, правка вводящего в заблуждение комментария. Новый регрессионный тест.

**OUT:** `useSequenceSelection` и любой другой хук. Контракт `onSiteClick` / `onRestrictionClick`. Архитектура dual-handler (mousedown+click) — оставить как есть, только дедуп. `onPointerDown`.

## 5. Тесты

- **Регрессионный (основной):** смонтировать `RestrictionTrack` (или RangePickerModal) с ≥2 RE-сайтами, на одном `<g>` эмитировать ПОСЛЕДОВАТЕЛЬНОСТЬ `mouseDown` → `click` (как реальный жест) → проверить, что `onSiteClick` вызван **ровно один раз**. Без фикса — два вызова.
- **Парный выбор end-to-end:** в RangePickerModal — `mouseDown+click` по сайту A, затем `mouseDown+click` по сайту B → итоговое выделение остаётся `[cutA, cutB]`, не схлопывается на B. (Текущий V88-тест через `__v88_re_click__` дополнить этим браузерным жестовым путём — он и есть пропущенное покрытие.)
- **Тест-совместимость:** одиночный `fireEvent.click` (без `mousedown`) по-прежнему вызывает `onSiteClick` один раз — существующие V88-тесты не ломаются.
- **Регрессия:** полный Vitest зелёный, `vite build` clean.

## 6. Риски

- Per-instance ref: `RestrictionTrack` рендерится по одному на строку, `<g>` много в одном инстансе. Жест (mousedown+click) всегда на одном `<g>` → один общий `mouseHandledRef` на инстанс достаточен; mousedown по сайту A и click по сайту B в одном жесте невозможен.
- Если будущий код добавит touch-путь (`touchstart`/`touchend` без `mousedown`) — guard его не покроет. Сейчас touch не обрабатывается отдельно; вне scope.
- `preventDefault` на `mousedown` остаётся — если он где-то нужен против родительского `onRootPointerDown`, поведение не меняется (фикс только про дедуп `onSiteClick`).

## 7. Порядок + STOP

1. `RestrictionTrack.jsx` — `mouseHandledRef` + guard, правка комментария.
2. Регрессионный тест (mousedown→click = один вызов) + парный e2e в RangePicker.
3. Полный Vitest + `vite build`.

**STOP:** после реализации и зелёного прогона — остановиться, отчёт в `CURRENT_TASK.md` (commit range, Vitest counters, build). НЕ финализировать `PROJECT_STATE` / `BUGS` / `DECISIONS` — V97 переедет в FIXED отдельной Chat-сессией после визуальной приёмки.
