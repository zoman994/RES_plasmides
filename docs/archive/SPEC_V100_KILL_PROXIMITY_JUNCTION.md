# SPEC V100 — Drop контейнера авто-создаёт proximity-junction (мёртвый функционал)

**Тип:** C (удаление мёртвого поведения). **Баг:** V100 (в `BUGS.md`).
**Источник:** Игорь 22.05.2026 — рядомстоящие контейнеры на canvas авто-коннектятся junction'ом «auto». Мёртвый функционал — связывание контейнеров теперь идёт через zones / редактор сборки.
**Статус:** готова к реализации. Диагноз — чтением `useCanvasLayoutDrag.js` + `CanvasLayoutView.jsx`.

---

## 0. Размеры затрагиваемых модулей

- `canvas/useCanvasLayoutDrag.js` — 12.61 KB, под лимитом. Фикс — удаление ~5 строк.
- `canvas/CanvasLayoutView.jsx` — 49.18 KB (над hard 40). Junction SVG-слой живёт здесь — но в IN-scope этой спеки не правится (см. §4).
- `store/skeleton-state-canvas.js` — 26.00 KB (над hard 25, TD-SKELETON-STATE-SIZE). `RECONCILE_AUTO_JUNCTIONS` после фикса мёртв — но **в этой спеке не трогаем**.

## 1. Где задача сядет

Один блок в `onPointerUp` (`useCanvasLayoutDrag.js`). Радиус — один хук.

## 2. Корень (по коду)

`useCanvasLayoutDrag.js`, `onPointerUp`, при drop контейнера с движением (`dragging.hasMoved`):

```
if (dragging.kind === 'container') {
  const pairs = computeAutoJunctions(state.containers, state.positions);
  actions.reconcileAutoJunctions(pairs);
}
```

`computeAutoJunctions` парит контейнеры по близости позиций → `reconcileAutoJunctions` (`RECONCILE_AUTO_JUNCTIONS`) создаёт junction со `status:'auto'`. Это и есть авто-коннект рядомстоящих блоков (бейдж «auto» в скриншоте Игоря).

`reconcileAutoJunctions` — **единственный создатель** junction'ов между контейнерами. Других точек создания нет: `JunctionPopover` / `JunctionMethodPicker` только меняют `kind` уже существующего junction'а. Значит удаление этого блока убирает proximity-коннект целиком.

## 3. Решение

Убрать блок `computeAutoJunctions` + `reconcileAutoJunctions` из `onPointerUp` (ветка `dragging.kind === 'container'`). Прочая логика drop'а контейнера — zone hit-detection (`findZoneAtPoint` / `moveNodeToZone`), `setNodePinned`, `setZoneLaneLayout`, `justDraggedRef` — **остаётся без изменений**.

Сопутствующая чистка: import `computeAutoJunctions` из `./canvas-layout` становится мёртвым (`edgePanVelocity` / `viewportToWorld` из того же импорта остаются) — убрать `computeAutoJunctions` из списка импорта.

## 4. Scope

**IN:** `useCanvasLayoutDrag.js` — удаление proximity-junction блока + dead import. Регрессионный тест.

**OUT (отдельная DEAD-code задача, НЕ в этой спеке):** после фикса мёртвыми становятся `RECONCILE_AUTO_JUNCTIONS` + `computeAutoJunctions` helper, junction SVG-слой в `CanvasLayoutView.jsx`, `JunctionPopover` / `JunctionMethodPicker`, reducer-кейсы `SET_JUNCTION_*` / `REMOVE_JUNCTION` / `RESET_JUNCTION_TO_AUTO`, `junction-styles`. Без создателя junction'ов вся подсистема инертна. Снос уменьшит `skeleton-state-canvas.js` (помощь TD-SKELETON-STATE-SIZE) и `CanvasLayoutView.jsx`. **Рекомендую отдельный DEAD-sweep** — но объём решает Игорь, это не bugfix.

## 5. Тесты

- **Регрессионный:** drag контейнера и drop рядом с другим контейнером (позиции близкие) → `state.junctions` остаётся пустым, junction не создан.
- Существующие тесты, проверявшие proximity-junctions на drop, — переписать/удалить под новое поведение.
- Полный Vitest + `vite build` clean.

## 6. Риски

- Загруженный `.bodge` с уже персистнутыми `status:'auto'` junction'ами — после фикса они не пересоздаются, но и не убираются (reconcile удалён) → могут остаться отрендеренными junction SVG-слоем. Для свежего canvas неактуально. Полный DEAD-sweep (§4 OUT) закрывает и это.

## 7. Порядок + STOP

1. `onPointerUp` — убрать proximity-junction блок + dead import `computeAutoJunctions`.
2. Регрессионный тест.
3. Полный Vitest + `vite build`.

**STOP:** после реализации и зелёного прогона — остановиться, отчёт в `CURRENT_TASK.md`. НЕ финализировать `PROJECT_STATE` / `BUGS` / `DECISIONS` — V100 переедет в FIXED отдельной Chat-сессией после визуальной приёмки.
